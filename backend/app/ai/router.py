"""
AI generation API endpoints + provider info.
"""
from fastapi import APIRouter, Depends, HTTPException

from app.config import settings
from app.middleware.auth_middleware import get_current_user
from app.ai import service
from app.ai.schemas import AIGenerateRequest, AIGenerateResponse
from app.ai.providers import AIProviderError
from app.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()


@router.post("/generate", response_model=AIGenerateResponse)
async def generate_fields(
    data: AIGenerateRequest,
    current_user: dict = Depends(get_current_user),
):
    """Generate policy fields from a natural language prompt using AI."""
    try:
        result = await service.generate_fields(data)
        return result
    except AIProviderError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"AI service unavailable: {exc}",
        )


@router.get("/provider-info")
async def get_provider_info(
    current_user: dict = Depends(get_current_user),
):
    """Return current AI provider configuration (no secrets)."""
    return {
        "provider": settings.AI_PROVIDER,
        "model": settings.active_ai_model,
        "ai_mode": "strict",
        "temperature": settings.AI_TEMPERATURE,
    }
