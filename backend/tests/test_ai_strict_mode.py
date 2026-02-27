"""
Tests for Strict AI-Native Mode enforcement.
Validates: config validation, provider factory, temperature, AIResponse schema, audit logger.
"""
import os
import pytest
from unittest.mock import patch, MagicMock, AsyncMock


# ═══════════════════════════════════════════════════════════════════
#  Config Validation
# ═══════════════════════════════════════════════════════════════════

class TestConfigValidation:
    """Config must raise ValueError when API key is missing for selected provider."""

    def test_openai_provider_missing_key_raises(self):
        """AI_PROVIDER=openai without OPENAI_API_KEY must fail at config load."""
        from pydantic import ValidationError
        from app.config import Settings
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                _env_file=None,
                AI_PROVIDER="openai",
                OPENAI_API_KEY="",
                GEMINI_API_KEY="test-gemini-key",
            )
        assert "OPENAI_API_KEY" in str(exc_info.value)

    def test_gemini_provider_missing_key_raises(self):
        """AI_PROVIDER=gemini without GEMINI_API_KEY must fail at config load."""
        from pydantic import ValidationError
        from app.config import Settings
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                _env_file=None,
                AI_PROVIDER="gemini",
                OPENAI_API_KEY="test-openai-key",
                GEMINI_API_KEY="",
            )
        assert "GEMINI_API_KEY" in str(exc_info.value)

    def test_invalid_provider_raises(self):
        """AI_PROVIDER must be 'openai' or 'gemini'."""
        from pydantic import ValidationError
        from app.config import Settings
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                _env_file=None,
                AI_PROVIDER="claude",
                OPENAI_API_KEY="test-key",
            )
        assert "must be 'openai' or 'gemini'" in str(exc_info.value)

    def test_valid_openai_config_passes(self):
        """Valid OpenAI config should not raise."""
        from app.config import Settings
        s = Settings(
            _env_file=None,
            AI_PROVIDER="openai",
            OPENAI_API_KEY="sk-test-valid-key",
        )
        assert s.AI_PROVIDER == "openai"
        assert s.AI_TEMPERATURE == 0.1

    def test_valid_gemini_config_passes(self):
        """Valid Gemini config should not raise."""
        from app.config import Settings
        s = Settings(
            _env_file=None,
            AI_PROVIDER="gemini",
            GEMINI_API_KEY="AIza-test-valid-key",
        )
        assert s.AI_PROVIDER == "gemini"
        assert s.AI_TEMPERATURE == 0.1

    def test_temperature_out_of_range_raises(self):
        """Temperature outside 0-2 range must fail."""
        from pydantic import ValidationError
        from app.config import Settings
        with pytest.raises(ValidationError):
            Settings(
                _env_file=None,
                AI_PROVIDER="openai",
                OPENAI_API_KEY="sk-test",
                AI_TEMPERATURE=5.0,
            )

    def test_no_strict_mode_toggle_exists(self):
        """AI_STRICT_MODE field must NOT exist on Settings."""
        from app.config import Settings
        assert "AI_STRICT_MODE" not in Settings.model_fields

    def test_temperature_default_is_0_1(self):
        """Default AI_TEMPERATURE must be 0.1 for deterministic output."""
        from app.config import Settings
        s = Settings(
            _env_file=None,
            AI_PROVIDER="openai",
            OPENAI_API_KEY="sk-valid",
        )
        assert s.AI_TEMPERATURE == 0.1


# ═══════════════════════════════════════════════════════════════════
#  AIResponse Schema
# ═══════════════════════════════════════════════════════════════════

class TestAIResponse:
    """AIResponse must be a Pydantic BaseModel with audit fields."""

    def test_is_pydantic_model(self):
        from app.ai.providers.base import AIResponse
        from pydantic import BaseModel
        assert issubclass(AIResponse, BaseModel)

    def test_has_required_fields(self):
        from app.ai.providers.base import AIResponse
        fields = AIResponse.model_fields
        assert "data" in fields
        assert "provider" in fields
        assert "model" in fields
        assert "timestamp" in fields
        assert "request_prompt_hash" in fields

    def test_prompt_hash(self):
        from app.ai.providers.base import AIResponse
        h1 = AIResponse.hash_prompt("test prompt")
        h2 = AIResponse.hash_prompt("test prompt")
        h3 = AIResponse.hash_prompt("different prompt")
        assert h1 == h2  # deterministic
        assert h1 != h3  # different inputs
        assert len(h1) == 64  # SHA-256 hex digest

    def test_validates_on_creation(self):
        from app.ai.providers.base import AIResponse
        resp = AIResponse(
            data={"key": "value"},
            provider="openai",
            model="gpt-4o-mini",
            prompt_tokens=10,
            completion_tokens=20,
            total_tokens=30,
            latency_ms=150.5,
            request_prompt_hash="abc123",
        )
        assert resp.provider == "openai"
        assert resp.total_tokens == 30
        assert resp.timestamp is not None


# ═══════════════════════════════════════════════════════════════════
#  LLM Audit Logger Schema
# ═══════════════════════════════════════════════════════════════════

class TestLLMCallRecord:
    """LLMCallRecord must validate all audit fields."""

    def test_creates_valid_record(self):
        from app.ai.llm_audit_logger import LLMCallRecord
        record = LLMCallRecord(
            provider="openai",
            model="gpt-4o-mini",
            operation="generate_fields",
            prompt_hash="abc123",
            prompt_length=500,
            system_prompt_length=200,
            success=True,
            latency_ms=150.0,
            prompt_tokens=100,
            completion_tokens=200,
            total_tokens=300,
            temperature=0.1,
        )
        assert record.success is True
        assert record.temperature == 0.1
        assert record.timestamp is not None

    def test_failure_record_with_error(self):
        from app.ai.llm_audit_logger import LLMCallRecord
        record = LLMCallRecord(
            provider="gemini",
            model="gemini-1.5-pro",
            operation="enhance_structure",
            prompt_hash="def456",
            prompt_length=1000,
            system_prompt_length=300,
            success=False,
            error="API key invalid",
        )
        assert record.success is False
        assert record.error == "API key invalid"
