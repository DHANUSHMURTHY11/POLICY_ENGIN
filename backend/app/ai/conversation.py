"""
AI Chat Conversation Service — multi-turn policy parameter collection.
Phase 1: AI asks step-by-step questions, collects structured parameters.
Phase 2: On user confirmation, generates a full DocumentStructure.

State is persisted in MongoDB `chat_sessions` collection.
No fallback / dummy data — strict AI mode.
"""
import json
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.ai.ai_provider import ai_call
from app.ai.providers.base import AIProviderError
from app.ai.llm_audit_logger import log_llm_call, LLMCallRecord
from app.ai.conversation_schemas import (
    ChatMessage,
    ChatMessageRequest,
    ChatMessageResponse,
    ConversationState,
)
from app.config import settings
from app.core.logging import get_logger
from app.database.mongodb import get_mongo_db

logger = get_logger(__name__)


# ═════════════════════════════════════════════════════════════════
#  MongoDB collection accessor
# ═════════════════════════════════════════════════════════════════

def _sessions_collection():
    """Return the chat_sessions Mongo collection."""
    return get_mongo_db()["chat_sessions"]


# ═════════════════════════════════════════════════════════════════
#  System prompts (Strict Enterprise Enforcements)
# ═════════════════════════════════════════════════════════════════

COLLECTION_SYSTEM_PROMPT = """You are an enterprise policy architect.
Never assume product type. Always use the detected product type.
If user changes policy type, reset context. Never reference previous product.
Never default to home loan.
Keep collection phase concise.
You MUST also ask for the following formatting preferences before generating:
- Tone (Regulatory / Business Friendly / Strict Risk)
- Target audience (internal officers / customers)
- Governance level (Basic / Advanced / Enterprise)
Generate structured JSON only after confirmation."""


GENERATION_SYSTEM_PROMPT = """Generate a complete dual-layer policy structure as JSON based on the confirmed parameters.
You are generating a formal institutional circular, not a configuration sheet.
Every section must include a 'narrative_content' field written in formal, authoritative, human-readable prose.
For example, instead of 'Min CIBIL = 700', write: 'Applicants must demonstrate satisfactory creditworthiness. As a general benchmark, a bureau score of 700 and above shall be considered acceptable, subject to internal credit risk review.'
Do NOT output raw key-value pairs or tabular data in the narrative content. Structure is strictly JSON, but the content must be formal narrative.
You must use the following 13-point structure:
1. Header
2. Executive Summary
3. Purpose
4. Scope
5. Definitions
6. Eligibility Criteria (Narrative + Structured)
7. Product Parameters
8. Risk & Compliance Controls
9. Documentation Requirements
10. Approval Hierarchy (Maker, Checker, Director/Committee)
11. Version Control Table
12. Review & Amendment Clause
13. Annexures

Use fixed section skeleton. Only output valid JSON."""


# ═════════════════════════════════════════════════════════════════
#  Pre-Processing & Normalization
# ═════════════════════════════════════════════════════════════════

def _normalize_product_type(text: str) -> Optional[str]:
    """Extract and normalize product type utilizing a keyword classifier."""
    text_lower = text.lower()
    
    # Keyword map to controlled vocabulary
    mapping = {
        "home loan": "Home Loan",
        "mortgage": "Home Loan",
        "car loan": "Car Loan",
        "auto loan": "Car Loan",
        "vehicle loan": "Car Loan",
        "bike policy": "Bike Loan",
        "bike loan": "Bike Loan",
        "health lone": "Health Loan",
        "health loan": "Health Loan",
        "medical loan": "Health Loan",
        "health insurance": "Insurance",
        "insurance": "Insurance",
        "credit policy": "Credit Policy",
        "it policy": "IT Policy",
        "compliance policy": "Compliance Policy",
    }
    
    for kw, normalized in mapping.items():
        if kw in text_lower:
            return normalized
            
    return None


# ═════════════════════════════════════════════════════════════════
#  Core conversation functions
# ═════════════════════════════════════════════════════════════════

async def start_or_continue_chat(request: ChatMessageRequest) -> ChatMessageResponse:
    """
    Start a new conversation or continue an existing one.
    Persists state in MongoDB after each turn.
    Raises AIProviderError on LLM failure — no fallback.
    """
    collection = _sessions_collection()

    # ── Load or create session ──
    if request.session_id:
        doc = await collection.find_one({"session_id": request.session_id})
        if not doc:
            raise AIProviderError(
                f"Chat session '{request.session_id}' not found",
                provider=settings.AI_PROVIDER,
                model=settings.active_ai_model,
            )
        state = ConversationState(**doc)
    else:
        state = ConversationState(
            policy_id=request.policy_id,
        )

    # ── Append user message ──
    state.messages.append({
        "role": "user",
        "content": request.message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    
    # ── Product Type Normalization & Reset Check ──
    detected_product = _normalize_product_type(request.message)
    if detected_product:
        if state.policy_type and state.policy_type != detected_product:
            # Hard reset of context on product change
            logger.info(f"Context reset triggered. Product changed: {state.policy_type} -> {detected_product}")
            state.collected_params = {}
            state.missing_params = []
            state.phase = "collecting_parameters"
            state.confirmed = False
            # keep only the current message
            state.messages = [state.messages[-1]]
            
        state.policy_type = detected_product
    
    # If user explicitly asks to "create X policy" but we didn't map it, still assume a reset might be needed
    elif "create" in request.message.lower() and "policy" in request.message.lower():
        if state.policy_type and state.collected_params:
            logger.info("Context reset triggered by explicit 'create X policy' command.")
            state.collected_params = {}
            state.missing_params = []
            state.phase = "collecting_parameters"
            state.confirmed = False
            state.policy_type = ""
            state.messages = [state.messages[-1]]

    # ── Build conversation for LLM (limit to last 4 messages for faster inference) ──
    recent_messages = state.messages[-4:] if len(state.messages) > 4 else state.messages
    context_prompt = f"User message: {request.message}"
    if state.policy_type:
        context_prompt = f"[Detected Product: {state.policy_type}]\n" + context_prompt
    if state.collected_params:
        context_prompt += f"\nCollected Params: {json.dumps(state.collected_params)}"
    if state.missing_params:
        context_prompt += f"\nMissing Params (ask ONE of these next): {json.dumps(state.missing_params)}"

    # ── Call AI ──
    start_time = time.perf_counter()
    try:
        ai_response = await ai_call(
            system_prompt=COLLECTION_SYSTEM_PROMPT,
            user_prompt=context_prompt,
            max_tokens=settings.AI_MAX_TOKENS_CONVERSATION,
        )
    except AIProviderError:
        raise

    latency = (time.perf_counter() - start_time) * 1000
    data = ai_response.data

    # ── Parse AI response ──
    ai_message = data.get("ai_message", "I'm processing your request...")
    new_collected = data.get("collected_params", {})
    missing = data.get("missing_params", [])
    phase = data.get("phase", "collecting_parameters")
    is_complete = data.get("is_complete", False)
    suggested = data.get("suggested_actions", [])

    # ── Merge collected params ──
    state.collected_params.update(new_collected)
    state.missing_params = missing
    state.phase = phase
    state.confirmed = is_complete and phase == "awaiting_confirmation"
    state.updated_at = datetime.now(timezone.utc)

    # ── Append assistant message ──
    state.messages.append({
        "role": "assistant",
        "content": ai_message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    # ── Persist to MongoDB ──
    await collection.update_one(
        {"session_id": state.session_id},
        {"$set": state.model_dump(mode="json")},
        upsert=True,
    )

    logger.info(
        "Chat turn completed",
        extra={
            "event": "chat_turn",
            "session_id": state.session_id,
            "phase": phase,
            "params_collected": len(state.collected_params),
            "params_missing": len(missing),
            "provider": ai_response.provider,
            "model": ai_response.model,
            "latency_ms": round(latency, 2),
        },
    )

    return ChatMessageResponse(
        session_id=state.session_id,
        ai_response=ai_message,
        phase=phase,
        collected_params=state.collected_params,
        missing_params=missing,
        is_complete=is_complete,
        suggested_actions=suggested,
        ai_provider=ai_response.provider,
        ai_model=ai_response.model,
        ai_duration_ms=round(latency, 2),
    )


async def generate_from_chat(
    session_id: str,
    policy_name: str,
    policy_description: str = "",
    tone: str = "formal",
    user_id: Optional[str] = None,
) -> dict:
    """
    Generate a full DocumentStructure from confirmed chat parameters.
    Creates a new policy in PG + saves structure to Mongo.
    Raises AIProviderError on failure — NO fallback.
    """
    collection = _sessions_collection()

    # ── Load session ──
    doc = await collection.find_one({"session_id": session_id})
    if not doc:
        raise AIProviderError(
            f"Chat session '{session_id}' not found",
            provider=settings.AI_PROVIDER,
            model=settings.active_ai_model,
        )

    state = ConversationState(**doc)

    if not state.collected_params:
        raise AIProviderError(
            "No parameters collected in this session. Continue chatting first.",
            provider=settings.AI_PROVIDER,
            model=settings.active_ai_model,
        )

    # ── Build generation prompt ──
    gen_prompt = (
        f"Policy Name: {policy_name}\n"
        f"Description: {policy_description}\n"
        f"Tone: {tone}\n\n"
        f"Confirmed Parameters:\n{json.dumps(state.collected_params, indent=2)}\n\n"
        f"Generate a complete policy document structure based on these parameters."
    )

    # ── Call AI for structure generation ──
    start_time = time.perf_counter()
    try:
        ai_response = await ai_call(
            system_prompt=GENERATION_SYSTEM_PROMPT,
            user_prompt=gen_prompt,
            max_tokens=settings.AI_MAX_TOKENS_GENERATION,
        )
    except AIProviderError:
        raise

    latency = (time.perf_counter() - start_time) * 1000
    structure_data = ai_response.data
    
    # ── Validations (Backend Hallucination Shield) ──
    sections = structure_data.get("sections", [])
    
    # Extract titles to check presence
    section_titles = [s.get("title", "").strip().lower() for s in sections]
    
    # We allow some flexibility in title exactness, but check for key concepts
    mandatory_concepts = ["scope", "eligibility", "product details", "risk", "documentation", "approval", "annexure"]
    missing_mandatory = []
    
    for concept in mandatory_concepts:
        if not any(concept in st for st in section_titles):
            # Sometimes Risk is in "Compliance", Product details in "Loan Details", etc.
            # We do a loose check, if we strictly want exact titles:
            missing_mandatory.append(concept)
            
    # We will enforce product type match if it's stored in the header title (heuristic check)
    header_title = structure_data.get("header", {}).get("title", "").lower()
    if state.policy_type and state.policy_type.lower() not in header_title and header_title:
        # Check if any words match at least
        pt_words = set(state.policy_type.lower().split())
        ht_words = set(header_title.split())
        if not pt_words.intersection(ht_words):
            logger.error(f"Hallucination Guard: Product type mismatch. Expected {state.policy_type}, got {header_title}")
            raise AIProviderError(f"Generation Validation Failed: AI hallucinated product type. Expected '{state.policy_type}'. Please retry.", provider=ai_response.provider, model=ai_response.model)
            
    if missing_mandatory and len(missing_mandatory) > 3: # If severely failing structure
        logger.error(f"Hallucination Guard: Missing mandatory sections: {missing_mandatory}")
        # Reject and regenerate
        raise AIProviderError(f"Generation Validation Failed: Missing mandatory sections ({', '.join(missing_mandatory)}).", provider=ai_response.provider, model=ai_response.model)

    # ── Mark session as complete ──
    state.phase = "preview_ready"
    state.updated_at = datetime.now(timezone.utc)
    await collection.update_one(
        {"session_id": session_id},
        {"$set": {"phase": "preview_ready", "updated_at": state.updated_at.isoformat()}},
    )

    logger.info(
        "Chat-based structure generation completed",
        extra={
            "event": "chat_generate",
            "session_id": session_id,
            "policy_name": policy_name,
            "provider": ai_response.provider,
            "model": ai_response.model,
            "latency_ms": round(latency, 2),
            "sections_generated": len(structure_data.get("sections", [])),
        },
    )

    return {
        "structure": structure_data,
        "ai_provider": ai_response.provider,
        "ai_model": ai_response.model,
        "ai_duration_ms": round(latency, 2),
    }


async def get_session(session_id: str) -> Optional[ConversationState]:
    """Retrieve a conversation session by ID."""
    doc = await _sessions_collection().find_one({"session_id": session_id})
    if not doc:
        return None
    return ConversationState(**doc)
