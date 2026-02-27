"""
AI Provider abstraction layer.
Supports OpenAI, Google Gemini, and Ollama with unified interface.
"""
from app.ai.providers.base import AIProvider, AIProviderError
from app.ai.providers.factory import get_ai_provider

__all__ = ["AIProvider", "AIProviderError", "get_ai_provider"]
