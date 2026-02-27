"""
OpenAI provider — implements AIProvider for gpt-4o / gpt-4o-mini.
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


class OpenAIProvider(AIProvider):
    """OpenAI ChatCompletion provider with strict JSON output."""

    provider_name = "openai"

    def __init__(self):
        from openai import AsyncOpenAI

        if not settings.OPENAI_API_KEY:
            raise AIProviderError(
                "OPENAI_API_KEY is not configured",
                provider="openai",
                model=settings.AI_MODEL_OPENAI,
            )
        self._client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self._model = settings.AI_MODEL_OPENAI

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
            response = await self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=temperature,
                response_format={"type": "json_object"},
            )
        except Exception as exc:
            latency = (time.perf_counter() - start) * 1000
            # Audit the failure
            await log_llm_call(LLMCallRecord(
                provider="openai",
                model=self._model,
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
                f"OpenAI call failed: {exc}",
                provider="openai",
                model=self._model,
            ) from exc

        latency = (time.perf_counter() - start) * 1000

        # Parse JSON strictly
        content = response.choices[0].message.content
        try:
            data = json.loads(content)
        except json.JSONDecodeError as exc:
            # Audit the parse failure
            await log_llm_call(LLMCallRecord(
                provider="openai",
                model=self._model,
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
                f"OpenAI returned invalid JSON: {exc}",
                provider="openai",
                model=self._model,
            ) from exc

        usage = response.usage
        prompt_tokens = usage.prompt_tokens if usage else 0
        completion_tokens = usage.completion_tokens if usage else 0
        total_tokens = usage.total_tokens if usage else 0

        # Audit the success
        await log_llm_call(LLMCallRecord(
            provider="openai",
            model=self._model,
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
            provider="openai",
            model=self._model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            latency_ms=round(latency, 2),
            request_prompt_hash=prompt_hash,
        )

    async def ping(self) -> bool:
        """Minimal connectivity check with a 1-token completion."""
        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=5,
            )
            logger.info(
                "OpenAI ping succeeded",
                extra={"event": "ai_ping", "provider": "openai", "model": self._model},
            )
            return True
        except Exception as exc:
            raise AIProviderError(
                f"OpenAI connectivity check failed: {exc}",
                provider="openai",
                model=self._model,
            ) from exc
