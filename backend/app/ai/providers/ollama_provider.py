"""
Ollama provider — implements AIProvider for local LLMs via Ollama.
Uses AsyncOpenAI-compatible client pointed at Ollama's /v1 endpoint.
Strict JSON validation with one retry.
Optimised for CPU inference with smaller models (qwen2.5:3b).
"""
import json
import re
import time
from typing import Optional

from app.ai.providers.base import AIProvider, AIProviderError, AIResponse
from app.config import settings
from app.core.logging import get_logger
from app.ai.llm_audit_logger import log_llm_call, LLMCallRecord

logger = get_logger(__name__)

# ── CPU-optimised defaults ──
_MAX_TOKENS = 2048          # 3B model: need enough tokens for full structure
_TIMEOUT    = 300.0         # 5 min ceiling for CPU inference
_TOP_P      = 0.80          # Enforced tight sampling (Qwen 3B constraint)
_REPEAT_PENALTY = 1.1       # Discourage repetition (common in small models)


def _extract_json(text: str) -> dict:
    """Extract JSON from LLM response, handling markdown fences and preamble."""
    text = text.strip()

    # Strip markdown code fences
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text)
        text = text.strip()

    # Direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Find first balanced { } or [ ]
    for start_char, end_char in [("{", "}"), ("[", "]")]:
        start = text.find(start_char)
        if start == -1:
            continue
        depth = 0
        for i in range(start, len(text)):
            if text[i] == start_char:
                depth += 1
            elif text[i] == end_char:
                depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except json.JSONDecodeError:
                    break

    raise json.JSONDecodeError("No valid JSON found in response", text, 0)


class OllamaProvider(AIProvider):
    """Ollama provider using OpenAI-compatible /v1 endpoint.
    Optimised for CPU inference with small models (3B).
    Keeps prompts concise, tokens low, and validates JSON strictly.
    """

    provider_name = "ollama"

    def __init__(self):
        try:
            from openai import AsyncOpenAI
        except ImportError:
            raise AIProviderError(
                "openai package not installed. Run: pip install openai",
                provider="ollama",
                model=settings.OLLAMA_MODEL,
            )

        self._client = AsyncOpenAI(
            base_url=settings.OLLAMA_BASE_URL,
            api_key="ollama",       # Ollama ignores API key but client requires one
            timeout=_TIMEOUT,       # Long ceiling for CPU inference
        )
        self._model = settings.OLLAMA_MODEL

    async def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        schema_hint: Optional[str] = None,
        max_tokens: Optional[int] = None,
        **kwargs,
    ) -> AIResponse:
        """
        Generate JSON from Ollama with strict validation and one-retry.
        Prompts are condensed for 3B models to reduce hallucination.
        """
        start = time.perf_counter()
        prompt_hash = AIResponse.hash_prompt(user_prompt)
        temperature = settings.AI_TEMPERATURE
        effective_max_tokens = max_tokens or _MAX_TOKENS

        # ── Tight JSON enforcement (critical for small models) ──
        json_suffix = "\n\nRESPOND WITH ONLY A VALID JSON OBJECT. NO explanations, NO markdown."
        effective_system = system_prompt.rstrip() + json_suffix

        # ── Attempt up to 2 times (initial + 1 retry) ──
        last_error = None
        content = ""
        response = None

        for attempt in range(2):
            try:
                response = await self._client.chat.completions.create(
                    model=self._model,
                    messages=[
                        {"role": "system", "content": effective_system},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=temperature,
                    top_p=_TOP_P,
                    max_tokens=effective_max_tokens,
                    stream=False,
                )
            except Exception as exc:
                latency = (time.perf_counter() - start) * 1000
                await log_llm_call(LLMCallRecord(
                    provider="ollama",
                    model=self._model,
                    operation="generate_json",
                    prompt_hash=prompt_hash,
                    prompt_length=len(user_prompt),
                    system_prompt_length=len(effective_system),
                    success=False,
                    latency_ms=round(latency, 2),
                    temperature=temperature,
                    error=str(exc),
                ))
                raise AIProviderError(
                    f"Ollama call failed: {exc}",
                    provider="ollama",
                    model=self._model,
                ) from exc

            content = (response.choices[0].message.content or "").strip()

            # ── Strip <think> blocks (Qwen/DeepSeek specific) ──
            content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()

            # ── Parse JSON ──
            try:
                data = _extract_json(content)
                break  # success
            except json.JSONDecodeError as exc:
                last_error = exc
                if attempt == 0:
                    logger.warning(
                        "Ollama returned invalid JSON, retrying",
                        extra={
                            "event": "ollama_json_retry",
                            "model": self._model,
                            "attempt": attempt + 1,
                            "raw_length": len(content),
                        },
                    )
                    # Stronger instruction for retry
                    user_prompt = (
                        user_prompt
                        + "\n\nIMPORTANT: Return ONLY a valid JSON object. "
                        "No extra text before or after the JSON."
                    )
                    continue
                else:
                    latency = (time.perf_counter() - start) * 1000
                    await log_llm_call(LLMCallRecord(
                        provider="ollama",
                        model=self._model,
                        operation="generate_json",
                        prompt_hash=prompt_hash,
                        prompt_length=len(user_prompt),
                        system_prompt_length=len(effective_system),
                        success=False,
                        latency_ms=round(latency, 2),
                        temperature=temperature,
                        error=f"Invalid JSON after 2 attempts: {exc}",
                    ))
                    raise AIProviderError(
                        f"Ollama returned invalid JSON after 2 attempts: {exc}",
                        provider="ollama",
                        model=self._model,
                    ) from exc

        # ── Token usage ──
        latency = (time.perf_counter() - start) * 1000
        usage = response.usage if response else None
        prompt_tokens = usage.prompt_tokens if usage else 0
        completion_tokens = usage.completion_tokens if usage else 0
        total_tokens = usage.total_tokens if usage else 0

        # ── Audit success ──
        await log_llm_call(LLMCallRecord(
            provider="ollama",
            model=self._model,
            operation="generate_json",
            prompt_hash=prompt_hash,
            prompt_length=len(user_prompt),
            system_prompt_length=len(effective_system),
            success=True,
            latency_ms=round(latency, 2),
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            temperature=temperature,
        ))

        return AIResponse(
            data=data,
            provider="ollama",
            model=self._model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            latency_ms=round(latency, 2),
            request_prompt_hash=prompt_hash,
        )

    async def ping(self) -> bool:
        """Minimal connectivity check against Ollama."""
        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                messages=[{"role": "user", "content": "hi"}],
                max_tokens=5,
            )
            logger.info(
                "Ollama ping succeeded",
                extra={"event": "ai_ping", "provider": "ollama", "model": self._model},
            )
            return True
        except Exception as exc:
            raise AIProviderError(
                f"Ollama connectivity check failed: {exc}",
                provider="ollama",
                model=self._model,
            ) from exc
