"""
Application configuration loaded from environment variables.
Enterprise AI Governance mode with strict provider validation.
"""
from pydantic_settings import BaseSettings
from pydantic import model_validator
from typing import List


class Settings(BaseSettings):
    # ── App ──
    APP_NAME: str = "BaikalSphere Policy Engine"
    APP_ENV: str = "development"
    DEBUG: bool = True
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    CORS_ORIGINS: str = "http://localhost:3000"

    # ── PostgreSQL ──
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/policy_engine"

    # ── MongoDB ──
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "policy_engine"

    # ── JWT ──
    JWT_SECRET: str = "jwt-dev-secret"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 60

    # ── AI Governance ──
    AI_PROVIDER: str = "openai"  # openai | gemini | ollama | auto
    AI_STRICT_MODE: bool = True   # True → no fallback; False → auto-cascade
    AI_TEMPERATURE: float = 0.2   # Strict determinism for Qwen 3B constraint

    # ── OpenAI ──
    OPENAI_API_KEY: str = ""
    AI_MODEL_OPENAI: str = "gpt-4o-mini"

    # ── Gemini ──
    GEMINI_API_KEY: str = ""
    AI_MODEL_GEMINI: str = "gemini-1.5-pro"

    # ── Ollama ──
    OLLAMA_BASE_URL: str = "http://localhost:11434/v1"
    OLLAMA_MODEL: str = "qwen2.5:3b"

    # ── AI Token Limits ──
    AI_MAX_TOKENS_CONVERSATION: int = 400
    AI_MAX_TOKENS_GENERATION: int = 1500
    AI_TIMEOUT_SECONDS: int = 180

    # ── Email ──
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_FROM: str = "noreply@baikalsphere.com"

    # ── Admin ──
    ADMIN_DEFAULT_PASSWORD: str = "Admin@123"

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    @property
    def AI_MODEL(self) -> str:
        """Convenience alias — the model name for the active AI provider."""
        p = self.AI_PROVIDER.lower()
        if p == "gemini":
            return self.AI_MODEL_GEMINI
        if p == "ollama":
            return self.OLLAMA_MODEL
        return self.AI_MODEL_OPENAI  # default for openai / auto

    @property
    def active_ai_model(self) -> str:
        """Return the model name for the active AI provider."""
        return self.AI_MODEL

    @property
    def active_ai_key(self) -> str:
        """Return the API key for the active AI provider."""
        p = self.AI_PROVIDER.lower()
        if p == "gemini":
            return self.GEMINI_API_KEY
        if p == "ollama":
            return "ollama"  # Ollama doesn't need a real key
        return self.OPENAI_API_KEY

    @model_validator(mode="after")
    def validate_ai_config(self) -> "Settings":
        """Validate AI provider configuration.

        - Strict mode: selected provider MUST have a valid config.
        - Auto mode: at least one provider must be configured.
        - Ollama: only needs base_url (no API key required).
        """
        provider = self.AI_PROVIDER.lower().strip()
        valid_providers = {"openai", "gemini", "ollama", "auto"}

        if provider not in valid_providers:
            raise ValueError(
                f"AI_PROVIDER must be one of {valid_providers}, got '{provider}'"
            )

        if provider == "openai" and not self.OPENAI_API_KEY:
            raise ValueError(
                "AI_PROVIDER=openai requires OPENAI_API_KEY. "
                "Set the environment variable or update .env."
            )
        if provider == "gemini" and not self.GEMINI_API_KEY:
            raise ValueError(
                "AI_PROVIDER=gemini requires GEMINI_API_KEY. "
                "Set the environment variable or update .env."
            )
        # ollama doesn't need a key — just base_url (has default)

        if provider == "auto":
            # At least one provider must be usable
            has_openai = bool(self.OPENAI_API_KEY)
            has_gemini = bool(self.GEMINI_API_KEY)
            has_ollama = bool(self.OLLAMA_BASE_URL)
            if not (has_openai or has_gemini or has_ollama):
                raise ValueError(
                    "AI_PROVIDER=auto requires at least one provider configured "
                    "(OPENAI_API_KEY, GEMINI_API_KEY, or OLLAMA_BASE_URL)."
                )

        if self.AI_TEMPERATURE < 0 or self.AI_TEMPERATURE > 2:
            raise ValueError(
                f"AI_TEMPERATURE must be 0–2, got {self.AI_TEMPERATURE}"
            )

        return self

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
