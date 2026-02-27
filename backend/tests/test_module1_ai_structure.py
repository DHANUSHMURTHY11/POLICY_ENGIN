"""
Tests for Module 1: Strict AI Structure Mode.
Validates: AIStructureService, schemas, AI validation gate, router endpoints.
"""
import json
import uuid
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.policy.schemas import (
    FieldSchema,
    SubsectionSchema,
    SectionSchema,
    DocumentStructure,
    HeaderSchema,
    AIValidationResult,
    AIValidationIssue,
    AIEnhanceRequest,
    ManualStructureRequest,
    StructureResponse,
)
from app.policy.ai_structure_service import AIStructureService
from app.ai.providers import AIProviderError


# ═══════════════════════════════════════════════════════════════════
#  Schema Tests
# ═══════════════════════════════════════════════════════════════════

class TestFieldSchema:
    """FieldSchema must include rule_metadata."""

    def test_has_rule_metadata_field(self):
        fields = FieldSchema.model_fields
        assert "rule_metadata" in fields

    def test_rule_metadata_default_empty(self):
        f = FieldSchema(field_name="test")
        assert f.rule_metadata == {}

    def test_rule_metadata_accepts_dict(self):
        f = FieldSchema(
            field_name="loan_amount",
            field_type="currency",
            rule_metadata={"source": "regulatory", "category": "eligibility"},
        )
        assert f.rule_metadata["source"] == "regulatory"

    def test_validation_rules_present(self):
        f = FieldSchema(
            field_name="age",
            field_type="number",
            validation_rules={"required": True, "min": 18, "max": 65},
        )
        assert f.validation_rules["min"] == 18


class TestAIValidationResult:
    """AIValidationResult schema tests."""

    def test_valid_result(self):
        r = AIValidationResult(valid=True)
        assert r.valid is True
        assert r.issues == []
        assert r.suggestions == []

    def test_invalid_result_with_issues(self):
        r = AIValidationResult(
            valid=False,
            issues=[
                AIValidationIssue(
                    severity="error",
                    category="duplicate_field",
                    message="Duplicate field: loan_amount",
                    path="sections[0].subsections[0].fields[1]",
                )
            ],
            suggestions=["Consider normalizing field names"],
        )
        assert r.valid is False
        assert len(r.issues) == 1
        assert r.issues[0].severity == "error"

    def test_normalized_field_names_map(self):
        r = AIValidationResult(
            valid=True,
            normalized_field_names={"Loan Amt": "loan_amount"},
        )
        assert r.normalized_field_names["Loan Amt"] == "loan_amount"


class TestStructureResponse:
    """StructureResponse must include optional ai_validation."""

    def test_has_ai_validation_field(self):
        assert "ai_validation" in StructureResponse.model_fields

    def test_ai_validation_optional(self):
        r = StructureResponse(
            policy_id="test-id",
            version=1,
            document_structure=DocumentStructure(),
        )
        assert r.ai_validation is None


class TestAIEnhanceRequest:
    """AIEnhanceRequest schema tests."""

    def test_accepts_structure_and_instructions(self):
        req = AIEnhanceRequest(
            structure=DocumentStructure(
                header=HeaderSchema(title="Test Policy"),
                sections=[
                    SectionSchema(
                        title="Section 1",
                        order=1,
                        subsections=[
                            SubsectionSchema(
                                title="Sub 1",
                                order=1,
                                fields=[FieldSchema(field_name="test_field")],
                            )
                        ],
                    )
                ],
            ),
            instructions="Add compliance section",
        )
        assert req.instructions == "Add compliance section"
        assert len(req.structure.sections) == 1


# ═══════════════════════════════════════════════════════════════════
#  AIStructureService Tests
# ═══════════════════════════════════════════════════════════════════

class TestAIStructureServiceParsing:
    """Test static parsing methods of AIStructureService."""

    def test_parse_structure_valid(self):
        raw = {
            "header": {"title": "Education Loan Policy", "organization": "TestBank"},
            "sections": [
                {
                    "id": str(uuid.uuid4()),
                    "title": "Eligibility",
                    "description": "Who can apply",
                    "order": 1,
                    "subsections": [
                        {
                            "id": str(uuid.uuid4()),
                            "title": "Age Criteria",
                            "order": 1,
                            "fields": [
                                {
                                    "id": str(uuid.uuid4()),
                                    "field_name": "minimum_age",
                                    "field_type": "number",
                                    "validation_rules": {"required": True, "min": 18},
                                    "rule_metadata": {"source": "regulatory"},
                                    "notes": "Minimum borrower age",
                                }
                            ],
                        }
                    ],
                }
            ],
            "annexures": [],
            "attachments": [],
        }
        result = AIStructureService._parse_structure(raw)
        assert isinstance(result, DocumentStructure)
        assert result.header.title == "Education Loan Policy"
        assert len(result.sections) == 1
        assert result.sections[0].subsections[0].fields[0].field_name == "minimum_age"
        assert result.sections[0].subsections[0].fields[0].rule_metadata["source"] == "regulatory"

    def test_parse_structure_missing_title_raises(self):
        raw = {
            "sections": [
                {
                    "order": 1,
                    "subsections": [],
                }
            ],
        }
        with pytest.raises(AIProviderError):
            AIStructureService._parse_structure(raw)

    def test_parse_validation_result_valid(self):
        raw = {
            "valid": True,
            "issues": [],
            "suggestions": ["Add version control section"],
            "normalized_field_names": {},
        }
        result = AIStructureService._parse_validation_result(raw)
        assert isinstance(result, AIValidationResult)
        assert result.valid is True
        assert len(result.suggestions) == 1

    def test_parse_validation_result_with_errors(self):
        raw = {
            "valid": False,
            "issues": [
                {
                    "severity": "error",
                    "category": "duplicate_field",
                    "message": "Found duplicate field: loan_amount",
                    "path": "sections[0].subsections[0].fields[2]",
                },
                {
                    "severity": "suggestion",
                    "category": "normalization",
                    "message": "Rename 'Loan Amt' to 'loan_amount'",
                    "path": "sections[1].subsections[0].fields[0]",
                },
            ],
            "suggestions": [],
            "normalized_field_names": {"Loan Amt": "loan_amount"},
        }
        result = AIStructureService._parse_validation_result(raw)
        assert result.valid is False
        assert len(result.issues) == 2
        assert result.issues[0].severity == "error"
        assert result.normalized_field_names["Loan Amt"] == "loan_amount"


class TestAIStructureServiceMethods:
    """Test AIStructureService methods with mocked AI providers."""

    @pytest.mark.asyncio
    async def test_generate_structure_calls_provider(self):
        svc = AIStructureService()
        mock_response = MagicMock()
        mock_response.data = {
            "header": {"title": "Test Policy"},
            "sections": [
                {
                    "id": str(uuid.uuid4()),
                    "title": "Section 1",
                    "order": 1,
                    "subsections": [
                        {
                            "id": str(uuid.uuid4()),
                            "title": "Sub 1",
                            "order": 1,
                            "fields": [
                                {
                                    "id": str(uuid.uuid4()),
                                    "field_name": "test_field",
                                    "field_type": "text",
                                }
                            ],
                        }
                    ],
                }
            ],
        }
        mock_response.provider = "openai"
        mock_response.model = "gpt-4o-mini"
        mock_response.total_tokens = 500
        mock_response.latency_ms = 1200.0

        mock_provider = AsyncMock()
        mock_provider.generate_json = AsyncMock(return_value=mock_response)

        with patch("app.policy.ai_structure_service.get_ai_provider", return_value=mock_provider):
            result = await svc.generate_structure("Create loan policy", "Education Loan")

        assert isinstance(result, DocumentStructure)
        assert result.header.title == "Test Policy"
        mock_provider.generate_json.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_validate_structure_calls_provider(self):
        svc = AIStructureService()
        structure = DocumentStructure(
            header=HeaderSchema(title="Test"),
            sections=[SectionSchema(title="S1", order=1)],
        )

        mock_response = MagicMock()
        mock_response.data = {
            "valid": True,
            "issues": [],
            "suggestions": ["Looks good"],
            "normalized_field_names": {},
        }
        mock_response.provider = "openai"
        mock_response.model = "gpt-4o-mini"
        mock_response.total_tokens = 200
        mock_response.latency_ms = 800.0

        mock_provider = AsyncMock()
        mock_provider.generate_json = AsyncMock(return_value=mock_response)

        with patch("app.policy.ai_structure_service.get_ai_provider", return_value=mock_provider):
            result = await svc.validate_structure(structure)

        assert isinstance(result, AIValidationResult)
        assert result.valid is True
        mock_provider.generate_json.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_generate_structure_raises_on_provider_error(self):
        svc = AIStructureService()
        mock_provider = AsyncMock()
        mock_provider.generate_json = AsyncMock(
            side_effect=AIProviderError("API key invalid", provider="openai", model="gpt-4o-mini")
        )

        with patch("app.policy.ai_structure_service.get_ai_provider", return_value=mock_provider):
            with pytest.raises(AIProviderError):
                await svc.generate_structure("test", "test")


# ═══════════════════════════════════════════════════════════════════
#  No Fallback/Static Data Verification
# ═══════════════════════════════════════════════════════════════════

class TestNoStaticData:
    """Verify no static fallback or sample data exists."""

    def test_no_sample_structure_function(self):
        import app.policy.service as svc_module
        assert not hasattr(svc_module, "_sample_structure")

    def test_no_call_ai_for_structure(self):
        """Old ad-hoc _call_ai_for_structure must be removed."""
        import app.policy.service as svc_module
        assert not hasattr(svc_module, "_call_ai_for_structure")

    def test_no_structure_system_prompt_in_service(self):
        """STRUCTURE_SYSTEM_PROMPT moved to ai_structure_service."""
        import app.policy.service as svc_module
        assert not hasattr(svc_module, "STRUCTURE_SYSTEM_PROMPT")

    def test_ai_structure_service_has_prompts(self):
        """System prompts must exist in ai_structure_service."""
        import app.policy.ai_structure_service as ai_mod
        assert hasattr(ai_mod, "GENERATE_STRUCTURE_PROMPT")
        assert hasattr(ai_mod, "VALIDATE_STRUCTURE_PROMPT")
        assert hasattr(ai_mod, "ENHANCE_STRUCTURE_PROMPT")
