"""
Core logic for the AI Help Assistant.
Strictly limited to system guidance and navigation intents.
No database access, no policy generation access.
"""
import json
import time
from typing import List

from app.config import settings
from app.core.logging import get_logger
from app.ai.ai_provider import ai_call
from app.ai.providers.base import AIProviderError
from app.ai.help_assistant_schemas import HelpMessage, HelpChatRequest, HelpChatResponse

logger = get_logger(__name__)

HELP_SYSTEM_PROMPT = """You are a guidance assistant for a Policy Engine platform.
You only explain how to use the system.
You do not generate policies.
If user wants to create policy, provide navigation buttons.
Keep answers concise (under 150 tokens).

Respond ONLY with a valid JSON in this exact format:
{
  "response": "your conversational response here",
  "navigate_to": "none" | "create_policy_options"
}

Use "create_policy_options" ONLY if the user explicitly asks to create a new policy, wants to know how to create one, or asks about manual vs AI creation. Otherwise use "none".
"""

async def handle_help_chat(request: HelpChatRequest) -> HelpChatResponse:
    """Process a help query strictly isolated from policy logic."""
    
    # ── Build conversation history ──
    # We only take the last 4 messages to keep context short and fast
    recent_history = request.history[-4:] if len(request.history) > 4 else request.history
    
    user_prompt = ""
    for msg in recent_history:
        user_prompt += f"[{msg.role.upper()}]: {msg.content}\n"
    user_prompt += f"[USER]: {request.message}\n"
    
    # ── Call AI ──
    start_time = time.perf_counter()
    try:
        ai_response = await ai_call(
            system_prompt=HELP_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            schema_hint='{"response": "string", "navigate_to": "string"}',
            max_tokens=250, 
        )
    except AIProviderError as e:
        logger.error(f"Help Assistant AI error: {e}")
        # Graceful degradation for the help bot
        return HelpChatResponse(
            message="I'm having trouble connecting to my guidance systems right now. Please try again in a moment.",
            suggested_navigation=None,
            ai_provider=settings.AI_PROVIDER,
            ai_model=settings.active_ai_model
        )
        
    latency = (time.perf_counter() - start_time) * 1000
    data = ai_response.data
    
    # Parse the expected strict JSON format
    response_msg = data.get("response", "I'm not sure how to answer that right now.")
    navigate_to = data.get("navigate_to", "none")
    
    if navigate_to == "none" or not navigate_to:
        navigate_to = None
        
    logger.info(
        "Help Assistant replied",
        extra={
            "event": "help_assistant_chat",
            "provider": ai_response.provider,
            "latency_ms": round(latency, 2),
            "nav_intent": navigate_to
        }
    )
    
    return HelpChatResponse(
        message=response_msg,
        suggested_navigation=navigate_to,
        ai_provider=ai_response.provider,
        ai_model=ai_response.model
    )
