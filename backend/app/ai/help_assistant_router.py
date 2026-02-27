"""
FastAPI router for the AI Help Assistant.
Provides strictly isolated chat endpoint.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.postgresql import get_db
from app.middleware.auth_middleware import get_current_user
from app.auth.models import User
from app.ai.help_assistant_schemas import HelpChatRequest, HelpChatResponse
from app.ai.help_assistant import handle_help_chat
from app.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()


@router.post("/chat", response_model=HelpChatResponse)
async def chat_with_help_assistant(
    request: HelpChatRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Chat with the guidance assistant. 
    Strictly answers questions about using the system and providing navigation hooks.
    Requires authentication.
    """
    try:
        response = await handle_help_chat(request)
        return response
    except Exception as exc:
        logger.error(f"Help Assistant API error: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error in help assistant")
