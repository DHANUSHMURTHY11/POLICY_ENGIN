"""
AIWorkflowService — AI-assisted workflow template validation and approval summaries.
Strict AI-native mode: no fallback, no silent auto-approval.
"""
import json
from typing import Any, List

from app.ai.providers import get_ai_provider, AIProviderError
from app.core.logging import get_logger

logger = get_logger(__name__)


# ═══════════════════════════════════════════════════════════════════
#  System Prompts
# ═══════════════════════════════════════════════════════════════════

PARSE_TEMPLATE_PROMPT = """Convert the approval chain description into a workflow template.
You MUST ONLY use role names from the AVAILABLE ROLES list provided.
Do NOT invent or hallucinate role names.

Rules:
- Each role becomes one approval level, numbered from 1
- Default: sequential (parallel: false)
- "committee"/"board"/"parallel" → parallel: true
- There must be at least one level

Return ONLY valid JSON:
{"template_name":"descriptive name","levels":[{"level_number":1,"role":"ExactRoleName","parallel":false}]}"""


VALIDATE_TEMPLATE_PROMPT = """You are a workflow compliance validator for a financial policy platform.
Analyze the given workflow template and check for issues:

1. Circular approval: same role appearing at multiple levels (conflict of interest)
2. Missing final authority: the last level should be a senior/oversight role
3. Parallel inconsistency: parallel approval at early levels but sequential at final (unusual)
4. Missing maker-checker: there must be at least one approval level
5. No self-approval: flag if only one level exists (no separation of duties)

You MUST return ONLY valid JSON:
{
  "valid": true/false,
  "issues": [
    {
      "severity": "error|warning|suggestion",
      "category": "circular_approval|missing_final_authority|parallel_inconsistency|missing_maker_checker|self_approval",
      "message": "Human-readable description of the issue"
    }
  ],
  "suggestions": ["list of improvement suggestions"]
}"""


APPROVAL_SUMMARY_PROMPT = """You are a risk analyst for a financial policy approval system.
Given a policy structure (sections, fields, rules), generate a pre-approval risk summary.

Your analysis must include:
1. Risk Impact Summary: brief assessment of what this policy covers and its risk level
2. Rule Change Severity: low / medium / high / critical
3. Direction: whether rules are "stricter", "looser", or "neutral" compared to standard practice
4. Key areas requiring attention

You MUST return ONLY valid JSON:
{
  "risk_impact_summary": "Brief paragraph describing risk implications",
  "rule_change_severity": "low|medium|high|critical",
  "direction": "stricter|looser|neutral",
  "key_attention_areas": ["list of areas requiring close review"],
  "recommendation": "approve|review_carefully|escalate"
}"""


# ═══════════════════════════════════════════════════════════════════
#  AIWorkflowService
# ═══════════════════════════════════════════════════════════════════

class AIWorkflowService:
    """
    AI-assisted workflow operations.
    All methods raise AIProviderError on failure — NO fallback.
    """

    async def parse_natural_template(
        self, description: str, available_roles: list[str] | None = None
    ) -> dict:
        """
        Convert natural language approval chain into structured template.
        e.g. "Manager → Risk → Director → Committee" → levels JSON
        available_roles: list of exact role names from the database.
        """
        provider = get_ai_provider()

        # Build user prompt with available roles to prevent hallucination
        roles_text = ""
        if available_roles:
            roles_text = f"\nAVAILABLE ROLES (use ONLY these exact names): {', '.join(available_roles)}\n"

        ai_response = await provider.generate_json(
            system_prompt=PARSE_TEMPLATE_PROMPT,
            user_prompt=f"{roles_text}Approval chain: {description}",
        )

        result = ai_response.data
        logger.info(
            "AI parsed natural template",
            extra={
                "event": "ai_parse_template",
                "provider": ai_response.provider,
                "model": ai_response.model,
                "total_tokens": ai_response.total_tokens,
                "latency_ms": ai_response.latency_ms,
                "level_count": len(result.get("levels", [])),
                "available_roles": available_roles,
            },
        )
        return result

    async def validate_template(self, levels: List[dict]) -> dict:
        """
        AI-validate workflow template for issues.
        Returns validation result with issues and suggestions.
        """
        provider = get_ai_provider()
        ai_response = await provider.generate_json(
            system_prompt=VALIDATE_TEMPLATE_PROMPT,
            user_prompt=f"Workflow template levels:\n{json.dumps(levels, indent=2)}",
        )

        result = self._parse_validation_result(ai_response.data)
        logger.info(
            "AI validated template",
            extra={
                "event": "ai_validate_template",
                "provider": ai_response.provider,
                "model": ai_response.model,
                "total_tokens": ai_response.total_tokens,
                "latency_ms": ai_response.latency_ms,
                "valid": result.get("valid", False),
                "issue_count": len(result.get("issues", [])),
            },
        )
        return result

    async def generate_approval_summary(
        self, structure: dict, policy_name: str
    ) -> dict:
        """
        Generate AI risk summary for a policy before approval.
        Validator sees: risk impact, severity, direction.
        """
        provider = get_ai_provider()
        ai_response = await provider.generate_json(
            system_prompt=APPROVAL_SUMMARY_PROMPT,
            user_prompt=(
                f"Policy name: {policy_name}\n\n"
                f"Policy structure:\n{json.dumps(structure, default=str, indent=2)}"
            ),
        )

        result = self._parse_approval_summary(ai_response.data)
        logger.info(
            "AI generated approval summary",
            extra={
                "event": "ai_approval_summary",
                "provider": ai_response.provider,
                "model": ai_response.model,
                "total_tokens": ai_response.total_tokens,
                "latency_ms": ai_response.latency_ms,
                "severity": result.get("rule_change_severity", "unknown"),
                "direction": result.get("direction", "unknown"),
            },
        )
        return result

    @staticmethod
    def _parse_validation_result(data: dict) -> dict:
        """Parse and normalize AI validation response."""
        issues = []
        for issue in data.get("issues", []):
            issues.append({
                "severity": issue.get("severity", "warning"),
                "category": issue.get("category", "unknown"),
                "message": issue.get("message", ""),
            })
        return {
            "valid": data.get("valid", True) if not any(
                i["severity"] == "error" for i in issues
            ) else False,
            "issues": issues,
            "suggestions": data.get("suggestions", []),
        }

    @staticmethod
    def _parse_approval_summary(data: dict) -> dict:
        """Parse and normalize AI approval summary response."""
        return {
            "risk_impact_summary": data.get("risk_impact_summary", ""),
            "rule_change_severity": data.get("rule_change_severity", "medium"),
            "direction": data.get("direction", "neutral"),
            "key_attention_areas": data.get("key_attention_areas", []),
            "recommendation": data.get("recommendation", "review_carefully"),
        }


# Module-level singleton
ai_workflow_service = AIWorkflowService()
