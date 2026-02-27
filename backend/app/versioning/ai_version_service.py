"""
AIVersionService — AI-powered version diff analysis.
Strict AI mode: no fallback, no static interpretation.
"""
import json

from app.ai.providers import get_ai_provider, AIProviderError
from app.core.logging import get_logger

logger = get_logger(__name__)


# ═══════════════════════════════════════════════════════════════════
#  System Prompt
# ═══════════════════════════════════════════════════════════════════

VERSION_DIFF_PROMPT = """You are a policy compliance analyst for a financial institution.
Analyze the difference between two versions of a policy document structure.

You are given:
- The structural diff (added/removed/modified sections and fields)
- The base version structure (version A)
- The compare version structure (version B)

Identify:
1. Stricter rules — fields or sections where validation became tighter
2. Relaxed rules — fields or sections where validation became looser
3. New knockout rules — new mandatory checks or blockers added
4. Removed validation checks — existing validations that were dropped
5. Risk increase/decrease summary — overall risk impact assessment

You MUST return ONLY valid JSON:
{
  "risk_direction": "stricter" | "looser" | "neutral",
  "summary": "Brief paragraph summarizing the changes and their impact",
  "critical_changes": [
    {
      "change_type": "stricter_rule|relaxed_rule|new_knockout|removed_validation",
      "field_or_section": "Name of the field or section affected",
      "description": "What changed and why it matters"
    }
  ],
  "compliance_flags": [
    "List of compliance concerns or flags raised by the changes"
  ]
}"""


# ═══════════════════════════════════════════════════════════════════
#  AIVersionService
# ═══════════════════════════════════════════════════════════════════

class AIVersionService:
    """
    AI-powered version comparison analysis.
    All methods raise on failure — NO fallback.
    """

    async def analyze_version_diff(
        self,
        structural_diff: list,
        base_structure: dict,
        compare_structure: dict,
        base_version: int,
        compare_version: int,
    ) -> dict:
        """
        Send structural diff + both structures to AI for analysis.
        Returns: risk_direction, summary, critical_changes, compliance_flags.
        """
        provider = get_ai_provider()

        user_prompt = (
            f"Version comparison: v{base_version} → v{compare_version}\n\n"
            f"Structural diff:\n{json.dumps(structural_diff, default=str, indent=2)}\n\n"
            f"Base structure (v{base_version}):\n{json.dumps(base_structure, default=str, indent=2)}\n\n"
            f"Compare structure (v{compare_version}):\n{json.dumps(compare_structure, default=str, indent=2)}"
        )

        ai_response = await provider.generate_json(
            system_prompt=VERSION_DIFF_PROMPT,
            user_prompt=user_prompt,
        )

        result = self._parse_analysis(ai_response.data)

        logger.info(
            "AI analyzed version diff",
            extra={
                "event": "ai_version_diff",
                "provider": ai_response.provider,
                "model": ai_response.model,
                "total_tokens": ai_response.total_tokens,
                "latency_ms": ai_response.latency_ms,
                "risk_direction": result.get("risk_direction", "neutral"),
                "critical_count": len(result.get("critical_changes", [])),
                "flag_count": len(result.get("compliance_flags", [])),
                "base_version": base_version,
                "compare_version": compare_version,
            },
        )
        return result

    @staticmethod
    def _parse_analysis(data: dict) -> dict:
        """Parse and normalize AI analysis response."""
        critical_changes = []
        for change in data.get("critical_changes", []):
            critical_changes.append({
                "change_type": change.get("change_type", "unknown"),
                "field_or_section": change.get("field_or_section", ""),
                "description": change.get("description", ""),
            })

        return {
            "risk_direction": data.get("risk_direction", "neutral"),
            "summary": data.get("summary", ""),
            "critical_changes": critical_changes,
            "compliance_flags": data.get("compliance_flags", []),
        }


# Module-level singleton
ai_version_service = AIVersionService()
