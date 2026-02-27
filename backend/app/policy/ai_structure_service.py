"""
AIStructureService — centralized abstraction for all AI-driven structure operations.
Strict AI-native mode: no fallback, no dummy data.
All calls audited via llm_audit_logger.
"""
import json
import uuid
from typing import Optional

from app.ai.providers import get_ai_provider, AIProviderError
from app.ai.providers.base import AIResponse
from app.ai.llm_audit_logger import log_llm_call, LLMCallRecord
from app.config import settings
from app.core.logging import get_logger
from app.policy.schemas import (
    DocumentStructure,
    HeaderSchema,
    SectionSchema,
    SubsectionSchema,
    FieldSchema,
    AIValidationResult,
    AIValidationIssue,
    AIRewriteRequest,
    AIRewriteResponse,
)

logger = get_logger(__name__)


# ═══════════════════════════════════════════════════════════════════
#  System Prompts
# ═══════════════════════════════════════════════════════════════════

GENERATE_STRUCTURE_PROMPT = """Generate a policy document structure as JSON.

Return ONLY valid JSON (no markdown, no explanation) in this format:
{"header":{"title":"string","organization":"string"},"sections":[{"title":"Section Title","description":"brief","order":1,"narrative_content":"formal policy paragraph","ai_generated":true,"subsections":[{"title":"Subsection","order":1,"fields":[{"field_name":"Field Name","field_type":"text","validation_rules":{"required":true}}]}]}]}

field_type options: text, number, dropdown, date, boolean, currency, percentage
Generate 3-5 sections with realistic fields. Use field_name (not name) for each field."""


VALIDATE_STRUCTURE_PROMPT = """You are a strict policy structure auditor. Analyze the given policy document structure JSON and identify ALL issues.

You MUST check for:
1. **Duplicate fields**: Same field_name appearing in different subsections
2. **Missing required sections**: Common policy sections that are absent (e.g., Applicability, Definitions, Roles & Responsibilities, Compliance, Review Period)
3. **Normalization issues**: Inconsistent field naming (e.g., "Loan Amt" vs "loan_amount"), mixed casing, abbreviations that should be expanded
4. **Logical hierarchy issues**: Fields in wrong sections, subsection ordering gaps, empty sections with no fields
5. **Validation rule gaps**: Fields that should have required=true but don't, numeric fields without min/max, missing field types

Return ONLY valid JSON in this exact format:
{
  "valid": true|false,
  "issues": [
    {
      "severity": "error|warning|suggestion",
      "category": "duplicate_field|missing_section|hierarchy|normalization|validation_gap",
      "message": "Human-readable description of the issue",
      "path": "sections[0].subsections[1].fields[2]"
    }
  ],
  "suggestions": ["List of general improvement suggestions"],
  "normalized_field_names": {
    "Original Name": "suggested_normalized_name"
  }
}

Rules:
- severity "error" = must fix before save (duplicates, missing required sections)
- severity "warning" = should fix (hierarchy issues, validation gaps)
- severity "suggestion" = nice to have (normalization, naming)
- Set "valid" to false if ANY error-severity issues exist
- Return ONLY the JSON object, nothing else"""


ENHANCE_STRUCTURE_PROMPT = """You are an expert policy architect. Given an existing policy document structure JSON, enhance and improve it.

Improvements to make:
1. Add missing sections that are standard for this policy type
2. Add missing fields within existing sections
3. Fix any logical hierarchy issues
4. Normalize field names to consistent snake_case
5. Add appropriate validation_rules where missing
6. Add rule_metadata with source and category for each field
7. Ensure proper ordering of sections and subsections
8. Generate or improve narrative_content for every section — each section must have a professional policy narrative
9. Set ai_generated=true for any content you generate or enhance

Return the COMPLETE enhanced structure as valid JSON in the exact same format as the input, with all improvements applied.
Include all original content plus your enhancements.

Return ONLY the JSON object, nothing else."""


REWRITE_SECTION_PROMPT = """You are a senior policy writer. Rewrite the narrative content for a policy section.

You will receive:
- The section title and description
- The current narrative content (may be empty)
- The desired action: expand, simplify, regulatory_tone, or internal_memo
- The desired tone

Action definitions:
- "expand": Elaborate the content with more detail, examples, operational guidelines, and clarifying provisions
- "simplify": Rewrite in simpler, clearer language while preserving all key points
- "regulatory_tone": Rewrite in formal regulatory language with mandatory/prohibitive phrasing (shall, must, is required to)
- "internal_memo": Rewrite as an internal memorandum style — concise, directive, action-oriented

Tone definitions:
- "formal": Authoritative, professional corporate policy language
- "regulatory": Strict compliance-oriented language with legal phrasing
- "internal": Internal communication style — clear, direct, team-oriented
- "customer_facing": Client-friendly, transparent, reassuring language

Return ONLY valid JSON:
{
  "narrative_content": "The rewritten content here. Multiple paragraphs separated by newlines.",
  "tone": "the tone used",
  "communication_style": "policy_circular"
}

Rules:
- Write in the specified tone and action style
- If current content is empty, generate fresh content based on the section title and description
- Produce professional, publishable policy language — no placeholders
- Return ONLY the JSON object, nothing else"""


# ═══════════════════════════════════════════════════════════════════
#  AIStructureService
# ═══════════════════════════════════════════════════════════════════

class AIStructureService:
    """
    Centralized AI service for policy structure operations.
    All methods raise AIProviderError (→ 503) on failure — NO fallback.
    """

    async def generate_structure(
        self, prompt: str, policy_name: str
    ) -> DocumentStructure:
        """
        Generate a complete policy structure from a natural-language prompt.
        Returns Pydantic-validated DocumentStructure.
        Raises AIProviderError on failure.
        """
        provider = get_ai_provider()
        user_prompt = f"Policy name: {policy_name}\n\nUser request: {prompt}"

        ai_response = await provider.generate_json(
            system_prompt=GENERATE_STRUCTURE_PROMPT,
            user_prompt=user_prompt,
        )

        structure = self._parse_structure(ai_response.data)

        logger.info(
            "AI structure generated",
            extra={
                "event": "ai_structure_generated",
                "provider": ai_response.provider,
                "model": ai_response.model,
                "total_tokens": ai_response.total_tokens,
                "latency_ms": ai_response.latency_ms,
            },
        )

        return structure

    async def validate_structure(
        self, structure: DocumentStructure
    ) -> AIValidationResult:
        """
        Send a structure to AI for deep validation.
        Detects: duplicates, missing sections, hierarchy issues, normalization.
        Returns AIValidationResult. Raises AIProviderError on failure.
        """
        provider = get_ai_provider()
        structure_json = json.dumps(
            structure.model_dump(mode="json"), indent=2
        )

        ai_response = await provider.generate_json(
            system_prompt=VALIDATE_STRUCTURE_PROMPT,
            user_prompt=f"Validate the following policy structure:\n\n{structure_json}",
        )

        result = self._parse_validation_result(ai_response.data)

        logger.info(
            "AI structure validation completed",
            extra={
                "event": "ai_structure_validated",
                "valid": result.valid,
                "issue_count": len(result.issues),
                "provider": ai_response.provider,
                "model": ai_response.model,
                "total_tokens": ai_response.total_tokens,
                "latency_ms": ai_response.latency_ms,
            },
        )

        return result

    async def enhance_structure(
        self,
        structure: DocumentStructure,
        instructions: str = "",
    ) -> DocumentStructure:
        """
        Send a structure to AI for enhancement.
        Adds missing fields, normalizes naming, fixes hierarchy.
        Returns Pydantic-validated DocumentStructure. Raises AIProviderError on failure.
        """
        provider = get_ai_provider()
        structure_json = json.dumps(
            structure.model_dump(mode="json"), indent=2
        )

        user_prompt = f"Enhance the following policy structure:\n\n{structure_json}"
        if instructions:
            user_prompt += f"\n\nAdditional instructions: {instructions}"

        ai_response = await provider.generate_json(
            system_prompt=ENHANCE_STRUCTURE_PROMPT,
            user_prompt=user_prompt,
        )

        enhanced = self._parse_structure(ai_response.data)

        logger.info(
            "AI structure enhanced",
            extra={
                "event": "ai_structure_enhanced",
                "provider": ai_response.provider,
                "model": ai_response.model,
                "total_tokens": ai_response.total_tokens,
                "latency_ms": ai_response.latency_ms,
            },
        )

        return enhanced

    async def rewrite_section(
        self, request: AIRewriteRequest
    ) -> AIRewriteResponse:
        """
        Rewrite / generate narrative content for a single section.
        Supports: expand, simplify, regulatory_tone, internal_memo.
        Returns AIRewriteResponse. Raises AIProviderError on failure.
        """
        provider = get_ai_provider()

        user_prompt = (
            f"Section title: {request.section_title}\n"
            f"Section description: {request.section_description}\n"
            f"Current content:\n{request.current_content or '(empty — generate fresh content)'}\n\n"
            f"Action: {request.action}\n"
            f"Desired tone: {request.tone}"
        )

        ai_response = await provider.generate_json(
            system_prompt=REWRITE_SECTION_PROMPT,
            user_prompt=user_prompt,
        )

        result = self._parse_rewrite_result(ai_response.data)

        logger.info(
            "AI section rewrite completed",
            extra={
                "event": "ai_section_rewrite",
                "action": request.action,
                "tone": request.tone,
                "section_id": request.section_id,
                "provider": ai_response.provider,
                "model": ai_response.model,
                "total_tokens": ai_response.total_tokens,
                "latency_ms": ai_response.latency_ms,
            },
        )

        return result

    # ── Parsers ────────────────────────────────────────────────────

    @staticmethod
    def _parse_structure(data: dict) -> DocumentStructure:
        """Parse AI JSON output into a Pydantic DocumentStructure.
        Resilient to small-model hallucinations (e.g. 'name' vs 'field_name').
        Raises AIProviderError if schema validation fails."""
        try:
            header = HeaderSchema(**(data.get("header") or {}))

            sections = []
            for idx, s in enumerate(data.get("sections", [])):
                subsections = []
                for sub in s.get("subsections", []):
                    fields = []
                    for f in sub.get("fields", []):
                        # Resilient: accept 'field_name', 'name', or 'label' as the field name key
                        fname = (
                            f.get("field_name")
                            or f.get("name")
                            or f.get("label")
                            or f.get("title")
                            or "Unnamed Field"
                        )
                        fields.append(FieldSchema(
                            id=f.get("id", str(uuid.uuid4())),
                            field_name=fname,
                            field_type=f.get("field_type", f.get("type", "text")),
                            validation_rules=f.get("validation_rules", {}),
                            rule_metadata=f.get("rule_metadata", {}),
                            conditional_logic=f.get("conditional_logic", {}),
                            notes=f.get("notes", ""),
                        ))
                    subsections.append(SubsectionSchema(
                        id=sub.get("id", str(uuid.uuid4())),
                        title=sub.get("title", sub.get("name", "Untitled")),
                        order=sub.get("order", 1),
                        fields=fields,
                    ))

                # If model skipped subsections, wrap fields directly into one
                if not subsections and s.get("fields"):
                    fields = []
                    for f in s.get("fields", []):
                        fname = (
                            f.get("field_name")
                            or f.get("name")
                            or f.get("label")
                            or "Unnamed Field"
                        )
                        fields.append(FieldSchema(
                            id=f.get("id", str(uuid.uuid4())),
                            field_name=fname,
                            field_type=f.get("field_type", f.get("type", "text")),
                            validation_rules=f.get("validation_rules", {}),
                            rule_metadata=f.get("rule_metadata", {}),
                            conditional_logic=f.get("conditional_logic", {}),
                            notes=f.get("notes", ""),
                        ))
                    subsections.append(SubsectionSchema(
                        id=str(uuid.uuid4()),
                        title="General",
                        order=1,
                        fields=fields,
                    ))

                sections.append(SectionSchema(
                    id=s.get("id", str(uuid.uuid4())),
                    title=s.get("title", s.get("name", f"Section {idx+1}")),
                    description=s.get("description", ""),
                    order=s.get("order", idx + 1),
                    subsections=subsections,
                    narrative_content=s.get("narrative_content", ""),
                    ai_generated=s.get("ai_generated", True),
                    tone=s.get("tone", "formal"),
                    communication_style=s.get("communication_style", "policy_circular"),
                ))

            return DocumentStructure(
                header=header,
                sections=sections,
                annexures=data.get("annexures", []),
                attachments=data.get("attachments", []),
            )
        except Exception as exc:
            logger.error(
                f"Structure parse failed: {exc}",
                extra={"event": "structure_parse_error", "raw_keys": list(data.keys()) if isinstance(data, dict) else str(type(data))},
            )
            raise AIProviderError(
                f"AI returned data that failed structure schema validation: {exc}",
                provider="",
                model="",
            )

    @staticmethod
    def _parse_rewrite_result(data: dict) -> AIRewriteResponse:
        """Parse AI JSON output into AIRewriteResponse."""
        try:
            return AIRewriteResponse(
                narrative_content=data.get("narrative_content", ""),
                tone=data.get("tone", "formal"),
                ai_generated=True,
                communication_style=data.get("communication_style", "policy_circular"),
            )
        except Exception as exc:
            raise AIProviderError(
                f"AI returned data that failed rewrite schema validation: {exc}",
                provider="",
                model="",
            )

    @staticmethod
    def _parse_validation_result(data: dict) -> AIValidationResult:
        """Parse AI JSON output into AIValidationResult.
        Raises AIProviderError if schema validation fails."""
        try:
            issues = [
                AIValidationIssue(
                    severity=i.get("severity", "warning"),
                    category=i.get("category", "hierarchy"),
                    message=i.get("message", "Unknown issue"),
                    path=i.get("path", ""),
                )
                for i in data.get("issues", [])
            ]
            return AIValidationResult(
                valid=data.get("valid", len(issues) == 0),
                issues=issues,
                suggestions=data.get("suggestions", []),
                normalized_field_names=data.get("normalized_field_names", {}),
            )
        except Exception as exc:
            raise AIProviderError(
                f"AI returned data that failed validation result schema: {exc}",
                provider="",
                model="",
            )


# Module-level singleton
ai_structure_service = AIStructureService()
