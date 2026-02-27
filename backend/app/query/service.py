"""
Policy Runtime Engine — query execution against approved policy rules.
Enterprise Strict AI Mode — NO fallback explanations.
"""
import json
import hashlib
from typing import Any, Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.logging import get_logger
from app.database.mongodb import policy_documents_collection
from app.policy.models import PolicyMetadata
from app.versioning.models import PolicyVersion
from app.query.schemas import QueryRequest, QueryResponse, RuleEvaluation, ReasoningStep

logger = get_logger(__name__)


# ═══════════════════════════════════════════════════════════════════
#  Main query execution
# ═══════════════════════════════════════════════════════════════════

async def execute_query(
    db: AsyncSession,
    policy_id: UUID,
    request: QueryRequest,
) -> QueryResponse:
    """
    Execute a user query against an approved policy's rules.
    Steps:
        1. Fetch approved policy + structure
        2. Extract rules from structure
        3. Evaluate structured inputs against rules
        4. Generate AI analysis (strict — no fallback)
        5. Return decision + reasoning trace
    """
    # Step 1: Fetch policy metadata
    result = await db.execute(
        select(PolicyMetadata).where(PolicyMetadata.id == policy_id)
    )
    policy = result.scalar_one_or_none()
    if not policy:
        raise ValueError(f"Policy {policy_id} not found")

    # Step 2: Fetch approved structure
    structure = await _fetch_approved_structure(db, policy_id)
    if not structure:
        raise ValueError(f"No approved structure found for policy {policy_id}")

    # Step 3: Extract rules
    rules = _extract_rules(structure)

    reasoning_trace = [
        ReasoningStep(step=1, action="fetch_policy", detail=f"Loaded policy '{policy.name}' v{policy.current_version}"),
        ReasoningStep(step=2, action="extract_rules", detail=f"Extracted {len(rules)} rules from approved structure"),
    ]

    # Step 4: Evaluate inputs
    evaluations = _evaluate_inputs(rules, request.structured_inputs)
    reasoning_trace.append(
        ReasoningStep(step=3, action="evaluate_inputs", detail=f"Evaluated {len(evaluations)} rules against inputs"),
    )

    # Step 5: Determine preliminary decision
    passed = sum(1 for e in evaluations if e.result == "pass")
    failed = sum(1 for e in evaluations if e.result == "fail")
    skipped = sum(1 for e in evaluations if e.result in ("skipped", "not_provided"))
    total = len(evaluations)

    if failed > 0:
        rule_decision = "rejected"
    elif skipped > total * 0.5:
        rule_decision = "insufficient_data"
    elif passed == total:
        rule_decision = "approved"
    else:
        rule_decision = "needs_review"

    reasoning_trace.append(
        ReasoningStep(
            step=4,
            action="preliminary_decision",
            detail=f"Decision: {rule_decision} (passed={passed}, failed={failed}, skipped={skipped})",
        ),
    )

    # Step 6: AI analysis — strict, no fallback
    ai_analysis = ""
    try:
        ai_analysis = await _generate_ai_explanation(
            policy_name=policy.name,
            rules=rules,
            evaluations=evaluations,
            inputs=request.structured_inputs,
            user_query=request.user_query,
            rule_decision=rule_decision,
            policy_id=str(policy_id),
        )
        reasoning_trace.append(
            ReasoningStep(step=5, action="ai_analysis", detail="AI analysis generated successfully"),
        )
    except HTTPException:
        raise  # re-raise 503
    except Exception as exc:
        logger.error(
            "AI analysis failed unexpectedly",
            extra={
                "event": "ai_call_error",
                "policy_id": str(policy_id),
                "operation": "runtime_query",
                "error": str(exc),
            },
        )
        raise HTTPException(
            status_code=503,
            detail="AI service unavailable for runtime analysis. Cannot generate explanation.",
        )

    # Confidence
    confidence = (passed / total * 100) if total > 0 else 0

    # Warnings
    warnings = []
    if skipped > 0:
        warnings.append(f"{skipped} rules could not be evaluated due to missing inputs")
    if failed > 0:
        warnings.append(f"{failed} rules failed evaluation")

    logger.info(
        "Query executed",
        extra={
            "event": "query_executed",
            "policy_id": str(policy_id),
            "decision": rule_decision,
            "passed": passed,
            "failed": failed,
            "skipped": skipped,
            "operation": "runtime_query",
        },
    )

    return QueryResponse(
        policy_id=str(policy_id),
        policy_name=policy.name,
        version=policy.current_version,
        decision=rule_decision,
        confidence=round(confidence, 2),
        explanation=ai_analysis[:500] if ai_analysis else f"Decision: {rule_decision}",
        rule_evaluations=evaluations,
        reasoning_trace=reasoning_trace,
        ai_analysis=ai_analysis,
        warnings=warnings,
    )


# ═══════════════════════════════════════════════════════════════════
#  Internals
# ═══════════════════════════════════════════════════════════════════

async def _fetch_approved_structure(db: AsyncSession, policy_id: UUID) -> Optional[dict]:
    """Fetch the approved (locked) version's structure from Mongo."""
    # Try locked version first
    result = await db.execute(
        select(PolicyVersion)
        .where(PolicyVersion.policy_id == policy_id, PolicyVersion.is_locked == True)
        .order_by(PolicyVersion.version_number.desc())
    )
    locked_version = result.scalar_one_or_none()

    collection = policy_documents_collection()

    if locked_version and locked_version.mongo_snapshot_id:
        from bson import ObjectId
        snapshot = await collection.find_one({"_id": ObjectId(locked_version.mongo_snapshot_id)})
        if snapshot and "document_structure" in snapshot:
            return snapshot["document_structure"]

    # Fallback to latest version from Mongo (for dev/testing — NOT a data fallback)
    doc = await collection.find_one(
        {"policy_id": str(policy_id)},
        sort=[("version", -1)],
    )
    if doc and "document_structure" in doc:
        return doc["document_structure"]

    return None


def _extract_rules(structure: dict) -> list[dict]:
    """Extract all evaluable rules from the document structure."""
    rules = []
    for section in structure.get("sections", []):
        for sub in section.get("subsections", []):
            for field in sub.get("fields", []):
                validation = field.get("validation_rules", {})
                conditional = field.get("conditional_logic", {})
                if validation or conditional:
                    rules.append({
                        "section": section.get("title", ""),
                        "subsection": sub.get("title", ""),
                        "field_name": field.get("field_name", ""),
                        "field_type": field.get("field_type", "text"),
                        "validation_rules": validation,
                        "conditional_logic": conditional,
                    })
    return rules


def _evaluate_inputs(rules: list[dict], inputs: dict[str, Any]) -> list[RuleEvaluation]:
    """Evaluate structured inputs against extracted rules."""
    evaluations = []
    for rule in rules:
        field_name = rule["field_name"]
        field_type = rule["field_type"]
        validation = rule["validation_rules"]
        input_value = inputs.get(field_name)

        if input_value is None:
            evaluations.append(RuleEvaluation(
                field_name=field_name,
                field_type=field_type,
                rule=json.dumps(validation),
                input_value=None,
                result="not_provided",
                detail=f"No input provided for '{field_name}'",
            ))
            continue

        # Evaluate each validation rule
        passed = True
        details = []

        if validation.get("required") and (input_value is None or input_value == ""):
            passed = False
            details.append("Required field is empty")

        if "min" in validation and isinstance(input_value, (int, float)):
            if input_value < validation["min"]:
                passed = False
                details.append(f"Value {input_value} below minimum {validation['min']}")

        if "max" in validation and isinstance(input_value, (int, float)):
            if input_value > validation["max"]:
                passed = False
                details.append(f"Value {input_value} above maximum {validation['max']}")

        if "options" in validation and isinstance(input_value, str):
            if input_value not in validation["options"]:
                passed = False
                details.append(f"Value '{input_value}' not in allowed options")

        if "min_length" in validation and isinstance(input_value, str):
            if len(input_value) < validation["min_length"]:
                passed = False
                details.append(f"Length {len(input_value)} below minimum {validation['min_length']}")

        if "regex" in validation and isinstance(input_value, str):
            import re
            if not re.match(validation["regex"], input_value):
                passed = False
                details.append(f"Value does not match pattern {validation['regex']}")

        evaluations.append(RuleEvaluation(
            field_name=field_name,
            field_type=field_type,
            rule=json.dumps(validation),
            input_value=input_value,
            result="pass" if passed else "fail",
            detail="; ".join(details) if details else "All checks passed",
        ))

    return evaluations


# ═══════════════════════════════════════════════════════════════════
#  AI Analysis — Provider Abstraction (NO fallback)
# ═══════════════════════════════════════════════════════════════════

RUNTIME_PROMPT = """You are a policy compliance analyst. Analyze the following policy evaluation results and provide a clear, structured explanation.

You MUST return ONLY valid JSON in this format:
{
    "decision_explanation": "Clear explanation of the decision",
    "key_findings": ["finding 1", "finding 2"],
    "recommendations": ["recommendation 1"],
    "risk_assessment": "low|medium|high",
    "confidence_note": "explanation of confidence level"
}

RULES:
- Base your analysis ONLY on the provided rules and evaluation results
- Never hallucinate rules that don't exist
- If data is insufficient, say so clearly
- Be specific about which rules passed or failed"""


async def _generate_ai_explanation(
    policy_name: str,
    rules: list[dict],
    evaluations: list[RuleEvaluation],
    inputs: dict[str, Any],
    user_query: str,
    rule_decision: str,
    policy_id: str,
) -> str:
    """Generate AI explanation using provider abstraction. Raises 503 on failure."""
    from app.ai.providers import get_ai_provider, AIProviderError

    evaluations_json = json.dumps([e.model_dump() for e in evaluations], default=str)
    rules_json = json.dumps(rules, default=str)

    user_prompt = f"""Policy: {policy_name}
User Query: {user_query}
Preliminary Decision: {rule_decision}

Rules ({len(rules)} total):
{rules_json}

Evaluation Results:
{evaluations_json}

User Inputs:
{json.dumps(inputs, default=str)}"""

    try:
        provider = get_ai_provider()
        ai_response = await provider.generate_json(
            system_prompt=RUNTIME_PROMPT,
            user_prompt=user_prompt,
        )
    except AIProviderError as exc:
        logger.error(
            "AI runtime analysis failed",
            extra={
                "event": "ai_call_error",
                "policy_id": policy_id,
                "operation": "runtime_query",
                "error": str(exc),
            },
        )
        raise HTTPException(
            status_code=503,
            detail="AI service unavailable for runtime analysis.",
        )

    data = ai_response.data

    logger.info(
        "AI runtime analysis succeeded",
        extra={
            "event": "ai_call",
            "policy_id": policy_id,
            "operation": "runtime_query",
            "provider": ai_response.provider,
            "model": ai_response.model,
            "total_tokens": ai_response.total_tokens,
            "latency_ms": ai_response.latency_ms,
            "decision": rule_decision,
        },
    )

    # Format the analysis
    explanation = data.get("decision_explanation", "")
    findings = data.get("key_findings", [])
    recommendations = data.get("recommendations", [])
    risk = data.get("risk_assessment", "")

    analysis_parts = [explanation]
    if findings:
        analysis_parts.append("\nKey Findings: " + "; ".join(findings))
    if recommendations:
        analysis_parts.append("\nRecommendations: " + "; ".join(recommendations))
    if risk:
        analysis_parts.append(f"\nRisk Assessment: {risk}")

    return "\n".join(analysis_parts)
