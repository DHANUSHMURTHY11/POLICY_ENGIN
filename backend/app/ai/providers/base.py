"""
Abstract base class for AI providers.
All providers must implement generate_json().
"""
import abc
import hashlib
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field


class AIProviderError(Exception):
    """Raised when an AI provider call fails. Must propagate to 503."""

    def __init__(self, message: str, provider: str = "", model: str = ""):
        self.provider = provider
        self.model = model
        super().__init__(message)


class AIResponse(BaseModel):
    """Standardised response from any AI provider — Pydantic validated."""
    data: dict
    provider: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    latency_ms: float = 0.0
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    request_prompt_hash: str = ""

    @staticmethod
    def hash_prompt(prompt: str) -> str:
        """SHA-256 hash of the prompt for audit traceability."""
        return hashlib.sha256(prompt.encode("utf-8")).hexdigest()


class AIProvider(abc.ABC):
    """Abstract AI provider. Subclasses must implement generate_json()."""

    provider_name: str = "base"

    @abc.abstractmethod
    async def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        schema_hint: Optional[str] = None,
        max_tokens: Optional[int] = None,
        **kwargs,
    ) -> AIResponse:
        """
        Send a prompt to the LLM and return parsed JSON.

        Args:
            system_prompt: System-level instruction.
            user_prompt: User-level prompt content.
            schema_hint: Optional description of expected JSON shape for validation.
            max_tokens: Optional max tokens for response.

        Returns:
            AIResponse with parsed data and usage metadata.

        Raises:
            AIProviderError on any failure — never returns dummy data.
        """
        ...

    @abc.abstractmethod
    async def ping(self) -> bool:
        """
        Minimal connectivity check.
        Returns True if provider is reachable, raises AIProviderError otherwise.
        """
        ...
