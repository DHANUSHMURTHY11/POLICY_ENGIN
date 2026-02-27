"""
AI Provider factory — returns the configured provider instance.
Supports: openai, gemini, ollama, auto (cascade fallback).

Strict mode (AI_STRICT_MODE=true):
    Returns ONLY the selected provider. No fallback.

Auto mode (AI_PROVIDER=auto, AI_STRICT_MODE=false):
    Tries providers in order: OpenAI → Gemini → Ollama.
    Skips providers that aren't configured.
    Raises AIProviderError if ALL fail.
"""
from app.ai.providers.base import AIProvider, AIProviderError
from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def get_ai_provider() -> AIProvider:
    """
    Instantiate and return the AI provider based on AI_PROVIDER setting.
    Raises AIProviderError if provider is unsupported or misconfigured.
    """
    provider_name = settings.AI_PROVIDER.lower().strip()

    if provider_name == "openai":
        return _make_openai()

    elif provider_name == "gemini":
        return _make_gemini()

    elif provider_name == "ollama":
        return _make_ollama()

    elif provider_name == "auto":
        return _make_auto()

    else:
        raise AIProviderError(
            f"Unsupported AI provider: '{provider_name}'. "
            f"Must be 'openai', 'gemini', 'ollama', or 'auto'.",
            provider=provider_name,
        )


# ═══════════════════════════════════════════════════════════════════
#  Provider constructors
# ═══════════════════════════════════════════════════════════════════

def _make_openai() -> AIProvider:
    from app.ai.providers.openai_provider import OpenAIProvider
    return OpenAIProvider()


def _make_gemini() -> AIProvider:
    from app.ai.providers.gemini_provider import GeminiProvider
    return GeminiProvider()


def _make_ollama() -> AIProvider:
    from app.ai.providers.ollama_provider import OllamaProvider
    return OllamaProvider()


def _make_auto() -> AIProvider:
    """Auto-cascade: try OpenAI → Gemini → Ollama.
    Returns the FIRST successfully instantiated provider.
    Raises AIProviderError if none can be created.
    """
    errors = []

    # 1. Try OpenAI
    if settings.OPENAI_API_KEY:
        try:
            provider = _make_openai()
            logger.info("Auto-provider selected OpenAI", extra={
                "event": "auto_provider_select", "provider": "openai",
            })
            return provider
        except AIProviderError as exc:
            errors.append(f"openai: {exc}")
            logger.warning(f"Auto-provider: OpenAI failed: {exc}", extra={
                "event": "auto_provider_skip", "provider": "openai",
            })

    # 2. Try Gemini
    if settings.GEMINI_API_KEY:
        try:
            provider = _make_gemini()
            logger.info("Auto-provider selected Gemini", extra={
                "event": "auto_provider_select", "provider": "gemini",
            })
            return provider
        except AIProviderError as exc:
            errors.append(f"gemini: {exc}")
            logger.warning(f"Auto-provider: Gemini failed: {exc}", extra={
                "event": "auto_provider_skip", "provider": "gemini",
            })

    # 3. Try Ollama
    if settings.OLLAMA_BASE_URL:
        try:
            provider = _make_ollama()
            logger.info("Auto-provider selected Ollama", extra={
                "event": "auto_provider_select", "provider": "ollama",
                "model": settings.OLLAMA_MODEL,
            })
            return provider
        except AIProviderError as exc:
            errors.append(f"ollama: {exc}")
            logger.warning(f"Auto-provider: Ollama failed: {exc}", extra={
                "event": "auto_provider_skip", "provider": "ollama",
            })

    raise AIProviderError(
        f"Auto-provider: all providers failed. Errors: {'; '.join(errors)}",
        provider="auto",
    )
