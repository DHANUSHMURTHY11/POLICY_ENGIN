"""
Chat conversation API endpoints.
POST /api/ai/chat       — send/continue a chat message
POST /api/ai/generate-structure — generate structure from confirmed chat
GET  /api/ai/chat/{id}  — retrieve session state
"""
import uuid as uuid_lib
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.auth_middleware import get_current_user
from app.database.postgresql import get_db
from app.ai.providers.base import AIProviderError
from app.ai.conversation_schemas import (
    ChatMessageRequest,
    ChatMessageResponse,
    ChatGenerateRequest,
    ChatGenerateResponse,
)
from app.ai import conversation as chat_service
from app.policy.service import create_policy, save_manual_structure
from app.policy.schemas import PolicyCreate, ManualStructureRequest, SectionSchema, HeaderSchema
from app.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()


@router.post("/chat", response_model=ChatMessageResponse)
async def chat_message(
    data: ChatMessageRequest,
    current_user: dict = Depends(get_current_user),
):
    """Send a message to the AI chat assistant for policy parameter collection."""
    try:
        result = await chat_service.start_or_continue_chat(data)
        return result
    except AIProviderError as exc:
        raise HTTPException(status_code=503, detail=f"AI service unavailable: {exc}")


@router.post("/generate-structure", response_model=ChatGenerateResponse)
async def generate_from_chat(
    data: ChatGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Generate a full policy structure from a confirmed chat session."""
    try:
        # Step 1: Generate structure via AI from collected params
        gen_result = await chat_service.generate_from_chat(
            session_id=data.session_id,
            policy_name=data.policy_name,
            policy_description=data.policy_description,
            tone=data.tone,
            user_id=str(current_user["id"]),
        )

        structure_data = gen_result["structure"]

        return ChatGenerateResponse(
            policy_id=data.policy_id,
            version=1,
            message="Policy structure generated from AI chat session",
            document_structure=structure_data,
            ai_provider=gen_result.get("ai_provider"),
            ai_model=gen_result.get("ai_model"),
        )

    except AIProviderError as exc:
        raise HTTPException(status_code=503, detail=f"AI service unavailable: {exc}")
    except Exception as exc:
        logger.error(
            "Chat generation failed",
            extra={"event": "chat_generate_error", "session_id": data.session_id, "error": str(exc)},
        )
        raise HTTPException(status_code=500, detail=f"Generation failed: {exc}")


@router.get("/chat/{session_id}")
async def get_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Retrieve a chat session's state and conversation history."""
    state = await chat_service.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return state.model_dump(mode="json")
