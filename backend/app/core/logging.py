"""
Structured JSON logging for BaikalSphere Policy Engine.
All modules must use get_logger() — no print() allowed.
"""
import logging
import json
import sys
from datetime import datetime, timezone


class JSONFormatter(logging.Formatter):
    """Formats log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Merge structured extras (event, provider, model, tokens, etc.)
        if hasattr(record, "event"):
            log_entry["event"] = record.event
        if hasattr(record, "provider"):
            log_entry["provider"] = record.provider
        if hasattr(record, "model"):
            log_entry["model"] = record.model
        if hasattr(record, "latency_ms"):
            log_entry["latency_ms"] = record.latency_ms
        if hasattr(record, "tokens"):
            log_entry["tokens"] = record.tokens
        if hasattr(record, "total_tokens"):
            log_entry["total_tokens"] = record.total_tokens
        if hasattr(record, "prompt_tokens"):
            log_entry["prompt_tokens"] = record.prompt_tokens
        if hasattr(record, "completion_tokens"):
            log_entry["completion_tokens"] = record.completion_tokens
        if hasattr(record, "policy_id"):
            log_entry["policy_id"] = record.policy_id
        if hasattr(record, "operation"):
            log_entry["operation"] = record.operation
        if hasattr(record, "error"):
            log_entry["error"] = record.error

        # Catch-all for any extra fields passed via `extra={}` dict
        standard_keys = {
            "name", "msg", "args", "created", "relativeCreated",
            "exc_info", "exc_text", "stack_info", "lineno", "funcName",
            "pathname", "filename", "module", "levelno", "levelname",
            "message", "msecs", "thread", "threadName", "process",
            "processName", "taskName",
        }
        for key, value in record.__dict__.items():
            if key not in standard_keys and key not in log_entry:
                try:
                    json.dumps(value)  # Only include JSON-serializable values
                    log_entry[key] = value
                except (TypeError, ValueError):
                    pass

        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry, default=str)


_initialized = False


def setup_logging(level: str = "INFO") -> None:
    """Initialize structured logging for the application. Call once at startup."""
    global _initialized
    if _initialized:
        return

    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Remove existing handlers
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())
    root.addHandler(handler)

    # Suppress noisy third-party loggers
    for noisy in ("uvicorn.access", "watchfiles", "httpcore", "httpx"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    _initialized = True


def get_logger(name: str) -> logging.Logger:
    """Get a named logger. Use __name__ as convention."""
    return logging.getLogger(name)
