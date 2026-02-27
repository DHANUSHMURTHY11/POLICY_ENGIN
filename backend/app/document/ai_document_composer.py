"""
AIDocumentComposer — AI-driven document composition for policy documents.
Strict AI-native mode: no fallback, no generic enhancer.
Takes approved structure + approval flow → returns composed document with narratives.
"""
import json
from typing import Any, List

from app.ai.providers import get_ai_provider, AIProviderError
from app.core.logging import get_logger
from app.document.schemas import (
    AIComposedDocument,
    AIComposedSection,
    ApprovalFlowEntry,
)

logger = get_logger(__name__)


# ═══════════════════════════════════════════════════════════════════
#  System Prompt
# ═══════════════════════════════════════════════════════════════════

COMPOSE_DOCUMENT_PROMPT = """You are a financial policy document composer.
Generate a structured, professional policy document that reads like an official internal circular.

Input will contain:
- Policy structure with sections, subsections, and fields
- Each section may have "narrative_content" (pre-authored narrative), "tone", and "communication_style"
- Approval flow data

Your job:
1. If a section already has narrative_content, incorporate and enhance it (do NOT discard it)
2. Convert structured fields and validation rules into readable policy paragraphs — NOT just tables
3. Respect each section's tone setting (formal, regulatory, internal, customer_facing)
4. Write in the specified communication_style (default: policy_circular)
5. VERY IMPORTANT: Do NOT output configuration tables, bulleted parameter lists, or key-value structures. 
6. ALL parameters (min, max, thresholds, etc.) MUST be woven into authoritative narrative paragraphs.

Generate:
- Header
- Version control
- Approval flow
- Index
- Scope
- Section narratives with readable passages ONLY
- Annexures list
- Attachments section

Use ONLY the provided structure. Do not invent fields.

You MUST return ONLY valid JSON in this exact format:
{
  "title": "Full policy title",
  "scope": "Description of what this policy covers, its applicability, and intended audience",
  "sections": [
    {
      "heading": "Section heading",
      "content": "Professional narrative paragraph(s) describing this section. Include the parameters, thresholds, and rules described in the fields as prose. For example: 'The minimum loan tenure shall be 12 months with a maximum permissible tenure of 60 months, subject to credit exception.' Use formal, circular-style language.",
      "tables": []
    }
  ],
  "approval_flow_summary": "Narrative description of the approval workflow, hierarchy, and chain of approvals",
  "annexures": [
    {
      "title": "Annexure title",
      "content": "Annexure content description"
    }
  ]
}

Rules:
- Write professional, formal policy language — NO bullet point configuration lists.
- Each section MUST have a substantial narrative "content" paragraph that reads like an official circular.
- Convert ALL structured parameters (min, max, required) into readable authoritative sentences.
- Leave the 'tables' JSON array EMPTY unless the data is literally a complex schedule of charges or amortization table.
- If a section has narrative_content already, use it as the foundation and enrich it
- Match each section's tone (formal/regulatory/internal/customer_facing)
- The scope must describe who the policy applies to and under what conditions
- The approval_flow_summary must describe the approval hierarchy clearly
- Do NOT invent any fields, sections, or data not present in the input
- Return ONLY the JSON object, nothing else"""


# ═══════════════════════════════════════════════════════════════════
#  AIDocumentComposer
# ═══════════════════════════════════════════════════════════════════

class AIDocumentComposer:
    """
    AI-driven document composer for policy documents.
    Takes approved structure + approval flow data and returns
    a fully composed document with narratives, tables, and approval summary.
    Raises AIProviderError on failure — NO fallback.
    """

    async def compose_document(
        self,
        structure: dict,
        approval_flow: List[dict],
    ) -> AIComposedDocument:
        """
        Compose a professional policy document from raw structure + approval data.
        Returns AIComposedDocument. Raises AIProviderError on failure.
        """
        provider = get_ai_provider()

        user_prompt = (
            f"Policy structure:\n{json.dumps(structure, default=str, indent=2)}\n\n"
            f"Approval flow data:\n{json.dumps(approval_flow, default=str, indent=2)}"
        )

        ai_response = await provider.generate_json(
            system_prompt=COMPOSE_DOCUMENT_PROMPT,
            user_prompt=user_prompt,
        )

        composed = self._parse_composed_document(ai_response.data, approval_flow)

        logger.info(
            "AI document composed",
            extra={
                "event": "ai_document_composed",
                "provider": ai_response.provider,
                "model": ai_response.model,
                "total_tokens": ai_response.total_tokens,
                "latency_ms": ai_response.latency_ms,
                "section_count": len(composed.sections),
            },
        )

        return composed

    @staticmethod
    def _parse_composed_document(
        data: dict, approval_flow: List[dict]
    ) -> AIComposedDocument:
        """Parse AI JSON output into AIComposedDocument.
        Raises AIProviderError if parsing fails."""
        try:
            sections = [
                AIComposedSection(
                    heading=s.get("heading", "Untitled Section"),
                    content=s.get("content", ""),
                    tables=s.get("tables", []),
                )
                for s in data.get("sections", [])
            ]

            # Build approval chain from workflow data
            approval_chain = [
                ApprovalFlowEntry(
                    level=entry.get("level", 0),
                    role=entry.get("role", "Unknown"),
                    approver=entry.get("approver", ""),
                    status=entry.get("status", "pending"),
                    timestamp=str(entry.get("timestamp", "")) if entry.get("timestamp") else None,
                    comments=entry.get("comments", ""),
                )
                for entry in approval_flow
            ]

            annexures = data.get("annexures", [])
            if not isinstance(annexures, list):
                annexures = []

            return AIComposedDocument(
                title=data.get("title", "Policy Document"),
                scope=data.get("scope", ""),
                sections=sections,
                approval_flow_summary=data.get("approval_flow_summary", ""),
                approval_chain=approval_chain,
                annexures=annexures,
            )
        except Exception as exc:
            raise AIProviderError(
                f"AI returned document data that failed schema validation: {exc}",
                provider="",
                model="",
            )


# Module-level singleton
ai_document_composer = AIDocumentComposer()
