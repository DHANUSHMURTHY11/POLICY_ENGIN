"""
Unified AI Provider — single-file entry point for all AI operations.
Routes to OpenAI, Gemini, Ollama, or Auto based on AI_PROVIDER setting.

Usage:
    from app.ai.ai_provider import ai_provider, ai_call
    result = await ai_call(system_prompt="...", user_prompt="...")
    # result is AIResponse(data=dict, provider=str, model=str, ...)

Configuration (via .env):
    AI_PROVIDER=openai|gemini|ollama|auto
    AI_STRICT_MODE=true|false
    AI_TEMPERATURE=0.1
    OPENAI_API_KEY=...        ← required if AI_PROVIDER=openai
    AI_MODEL_OPENAI=gpt-4o-mini
    GEMINI_API_KEY=...        ← required if AI_PROVIDER=gemini
    AI_MODEL_GEMINI=gemini-1.5-pro
    OLLAMA_BASE_URL=http://localhost:11434/v1
    OLLAMA_MODEL=qwen2.5:7b-instruct-q4_K_M

Strict Mode (AI_STRICT_MODE=true):
    - No auto-fallback between providers.
    - If selected provider fails → raise error.
    - Never generate dummy structure.

Auto Mode (AI_PROVIDER=auto, AI_STRICT_MODE=false):
    - Cascade: OpenAI → Gemini → Ollama.
    - If all fail → raise error.
"""
from typing import Optional

from app.ai.providers.base import AIProvider, AIProviderError, AIResponse
from app.ai.providers.factory import get_ai_provider
from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

__all__ = [
    "ai_provider",
    "ai_call",
    "get_provider_info",
    "AIProvider",
    "AIProviderError",
    "AIResponse",
    "get_ai_provider",
]


def ai_provider() -> AIProvider:
    """Get the configured AI provider instance.

    Returns the provider based on AI_PROVIDER setting.
    Raises AIProviderError if misconfigured.
    """
    return get_ai_provider()


async def ai_call(
    system_prompt: str,
    user_prompt: str,
    schema_hint: Optional[str] = None,
    max_tokens: Optional[int] = None,
) -> AIResponse:
    """Unified AI call — single function for all AI interactions.

    Routes to the correct provider based on AI_PROVIDER:
        - openai → uses AI_MODEL_OPENAI (default: gpt-4o-mini)
        - gemini → uses AI_MODEL_GEMINI (default: gemini-1.5-pro)
        - ollama → uses OLLAMA_MODEL (default: qwen2.5:7b-instruct-q4_K_M)
        - auto   → cascade OpenAI → Gemini → Ollama

    Args:
        system_prompt: System-level instruction.
        user_prompt: User-level prompt content.
        schema_hint: Optional description of expected JSON shape.
        max_tokens: Optional max tokens for response.

    Returns:
        AIResponse with parsed data and usage metadata.

    Raises:
        AIProviderError — no fallback, must propagate.
    """
    provider = get_ai_provider()
    return await provider.generate_json(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        schema_hint=schema_hint,
        max_tokens=max_tokens,
    )


async def ai_ping() -> dict:
    """Check connectivity to the active AI provider.

    Returns:
        dict with provider, model, and status.

    Raises:
        AIProviderError if provider is unreachable.
    """
    provider = get_ai_provider()
    await provider.ping()
    info = get_provider_info()
    return {**info, "status": "connected"}


def get_provider_info() -> dict:
    """Get current AI provider configuration (no secrets)."""
    return {
        "provider": settings.AI_PROVIDER,
        "model": settings.active_ai_model,
        "temperature": settings.AI_TEMPERATURE,
        "strict_mode": settings.AI_STRICT_MODE,
        "has_key": bool(settings.active_ai_key),
    }
