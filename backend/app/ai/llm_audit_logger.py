"""
Centralized LLM Audit Logger.
Every AI call (success or failure) MUST flow through this module.
Writes to MongoDB `llm_audit_log` collection + structured stdout logging.
"""
import hashlib
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field

from app.core.logging import get_logger
from app.database.mongodb import get_mongo_db

logger = get_logger(__name__)


class LLMCallRecord(BaseModel):
    """Pydantic schema for every LLM call audit record."""
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    provider: str
    model: str
    operation: str  # e.g. "generate_fields", "runtime_query", "enhance_structure"
    prompt_hash: str  # SHA-256 of user_prompt
    prompt_length: int
    system_prompt_length: int
    success: bool
    latency_ms: float = 0.0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    temperature: float = 0.1
    error: Optional[str] = None
    policy_id: Optional[str] = None


def _llm_audit_collection():
    """Return the llm_audit_log Mongo collection."""
    db = get_mongo_db()
    return db["llm_audit_log"]


async def log_llm_call(record: LLMCallRecord) -> None:
    """
    Persist an LLM call record to MongoDB and emit a structured log line.
    This MUST be called for every AI provider invocation — success or failure.
    """
    # Structured log (always emitted regardless of MongoDB state)
    log_extra = {
        "event": "llm_audit",
        "provider": record.provider,
        "model": record.model,
        "operation": record.operation,
        "success": record.success,
        "latency_ms": record.latency_ms,
        "prompt_tokens": record.prompt_tokens,
        "completion_tokens": record.completion_tokens,
        "total_tokens": record.total_tokens,
        "temperature": record.temperature,
        "prompt_hash": record.prompt_hash,
        "prompt_length": record.prompt_length,
    }
    if record.error:
        log_extra["error"] = record.error
    if record.policy_id:
        log_extra["policy_id"] = record.policy_id

    if record.success:
        logger.info("LLM call completed", extra=log_extra)
    else:
        logger.error("LLM call failed", extra=log_extra)

    # Persist to MongoDB
    try:
        collection = _llm_audit_collection()
        await collection.insert_one(record.model_dump(mode="json"))
    except Exception as exc:
        # Never let audit logging failure break the main flow
        logger.warning(
            f"Failed to persist LLM audit record to MongoDB: {exc}",
            extra={"event": "llm_audit_persist_error", "error": str(exc)},
        )
