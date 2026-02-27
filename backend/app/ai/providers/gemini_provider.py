"""
Google Gemini provider — implements AIProvider for gemini-1.5-pro / gemini-2.0-flash.
Strict AI-native mode: temperature from config, all calls audited.
"""
import json
import time
from typing import Optional

from app.ai.providers.base import AIProvider, AIProviderError, AIResponse
from app.config import settings
from app.core.logging import get_logger
from app.ai.llm_audit_logger import log_llm_call, LLMCallRecord

logger = get_logger(__name__)


class GeminiProvider(AIProvider):
    """Google Gemini provider with strict JSON output."""

    provider_name = "gemini"

    def __init__(self):
        try:
            import google.generativeai as genai
        except ImportError:
            raise AIProviderError(
                "google-generativeai package not installed. Run: pip install google-generativeai",
                provider="gemini",
                model=settings.AI_MODEL_GEMINI,
            )

        if not settings.GEMINI_API_KEY:
            raise AIProviderError(
                "GEMINI_API_KEY is not configured",
                provider="gemini",
                model=settings.AI_MODEL_GEMINI,
            )

        genai.configure(api_key=settings.GEMINI_API_KEY)
        self._model_name = settings.AI_MODEL_GEMINI
        self._genai = genai

    async def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        schema_hint: Optional[str] = None,
        max_tokens: Optional[int] = None,
        **kwargs,
    ) -> AIResponse:
        start = time.perf_counter()
        prompt_hash = AIResponse.hash_prompt(user_prompt)
        temperature = settings.AI_TEMPERATURE

        try:
            model = self._genai.GenerativeModel(
                model_name=self._model_name,
                system_instruction=system_prompt,
                generation_config=self._genai.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=temperature,
                ),
            )
            response = await model.generate_content_async(user_prompt)
        except Exception as exc:
            latency = (time.perf_counter() - start) * 1000
            # Audit the failure
            await log_llm_call(LLMCallRecord(
                provider="gemini",
                model=self._model_name,
                operation="generate_json",
                prompt_hash=prompt_hash,
                prompt_length=len(user_prompt),
                system_prompt_length=len(system_prompt),
                success=False,
                latency_ms=round(latency, 2),
                temperature=temperature,
                error=str(exc),
            ))
            raise AIProviderError(
                f"Gemini call failed: {exc}",
                provider="gemini",
                model=self._model_name,
            ) from exc

        latency = (time.perf_counter() - start) * 1000

        # Parse JSON strictly
        content = response.text
        try:
            data = json.loads(content)
        except json.JSONDecodeError as exc:
            # Audit the parse failure
            await log_llm_call(LLMCallRecord(
                provider="gemini",
                model=self._model_name,
                operation="generate_json",
                prompt_hash=prompt_hash,
                prompt_length=len(user_prompt),
                system_prompt_length=len(system_prompt),
                success=False,
                latency_ms=round(latency, 2),
                temperature=temperature,
                error=f"Invalid JSON: {exc}",
            ))
            raise AIProviderError(
                f"Gemini returned invalid JSON: {exc}",
                provider="gemini",
                model=self._model_name,
            ) from exc

        # Gemini usage metadata
        prompt_tokens = 0
        completion_tokens = 0
        total_tokens = 0
        if hasattr(response, "usage_metadata") and response.usage_metadata:
            prompt_tokens = getattr(response.usage_metadata, "prompt_token_count", 0) or 0
            completion_tokens = getattr(response.usage_metadata, "candidates_token_count", 0) or 0
            total_tokens = getattr(response.usage_metadata, "total_token_count", 0) or 0

        # Audit the success
        await log_llm_call(LLMCallRecord(
            provider="gemini",
            model=self._model_name,
            operation="generate_json",
            prompt_hash=prompt_hash,
            prompt_length=len(user_prompt),
            system_prompt_length=len(system_prompt),
            success=True,
            latency_ms=round(latency, 2),
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            temperature=temperature,
        ))

        return AIResponse(
            data=data,
            provider="gemini",
            model=self._model_name,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            latency_ms=round(latency, 2),
            request_prompt_hash=prompt_hash,
        )

    async def ping(self) -> bool:
        """Minimal connectivity check."""
        try:
            model = self._genai.GenerativeModel(model_name=self._model_name)
            response = await model.generate_content_async("ping")
            logger.info(
                "Gemini ping succeeded",
                extra={"event": "ai_ping", "provider": "gemini", "model": self._model_name},
            )
            return True
        except Exception as exc:
            raise AIProviderError(
                f"Gemini connectivity check failed: {exc}",
                provider="gemini",
                model=self._model_name,
            ) from exc
