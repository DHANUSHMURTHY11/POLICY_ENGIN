"""
AI service — LLM integration for parameter generation via provider abstraction.
Enterprise Strict AI Mode — NO fallback data.
"""
import json
from datetime import datetime, timezone

from app.config import settings
from app.core.logging import get_logger
from app.database.mongodb import ai_generated_collection
from app.ai.schemas import AIGenerateRequest, AIGenerateResponse, GeneratedField
from app.ai.providers import get_ai_provider, AIProviderError

logger = get_logger(__name__)

# System prompt for structured policy parameter generation
SYSTEM_PROMPT = """You are an expert credit policy analyst.
Given a user's prompt about policy parameters, generate a structured list of fields
for a policy engine. Each field must include:
- field_name: string
- field_type: one of "text", "number", "dropdown", "multi_select", "date", "boolean"
- values: array of possible values (for dropdown/multi_select) or empty
- validation_rules: object with rules like {"min": 0, "max": 100, "required": true}
- notes: documentation notes for Word export

Return ONLY valid JSON in this format:
{
    "generated_fields": [...],
    "suggested_validations": ["list of validation recommendations"],
    "documentation_notes": "summary for document generation"
}"""


async def generate_fields(request: AIGenerateRequest) -> AIGenerateResponse:
    """Generate policy fields from a natural language prompt using AI provider.
    Raises AIProviderError (→ 503) if AI is unavailable.
    """
    try:
        provider = get_ai_provider()
        ai_response = await provider.generate_json(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=request.prompt,
        )
    except AIProviderError as exc:
        logger.error(
            "AI field generation failed",
            extra={
                "event": "ai_call_error",
                "operation": "generate_fields",
                "policy_engine_id": request.policy_engine_id,
                "error": str(exc),
            },
        )
        raise

    data = ai_response.data

    logger.info(
        "AI field generation succeeded",
        extra={
            "event": "ai_call",
            "operation": "generate_fields",
            "provider": ai_response.provider,
            "model": ai_response.model,
            "total_tokens": ai_response.total_tokens,
            "latency_ms": ai_response.latency_ms,
        },
    )

    # Parse into schema
    try:
        result = AIGenerateResponse(
            generated_fields=[GeneratedField(**f) for f in data.get("generated_fields", [])],
            suggested_validations=data.get("suggested_validations", []),
            documentation_notes=data.get("documentation_notes", ""),
        )
    except Exception as exc:
        logger.error(
            "AI output failed schema validation",
            extra={
                "event": "ai_schema_validation_error",
                "operation": "generate_fields",
                "error": str(exc),
            },
        )
        raise AIProviderError(
            f"AI returned data that failed schema validation: {exc}",
            provider=ai_response.provider,
            model=ai_response.model,
        )

    # Store in MongoDB for audit
    await _save_generation(request, result, ai_response.provider, ai_response.model, ai_response.total_tokens)
    return result


async def _save_generation(
    request: AIGenerateRequest,
    result: AIGenerateResponse,
    provider: str,
    model: str,
    tokens: int,
):
    """Save AI generation to MongoDB for audit trail."""
    collection = ai_generated_collection()
    await collection.insert_one({
        "policy_engine_id": request.policy_engine_id,
        "prompt": request.prompt,
        "generated_fields": [f.model_dump() for f in result.generated_fields],
        "suggested_validations": result.suggested_validations,
        "documentation_notes": result.documentation_notes,
        "ai_provider": provider,
        "ai_model": model,
        "ai_tokens": tokens,
        "created_at": datetime.now(timezone.utc),
    })
