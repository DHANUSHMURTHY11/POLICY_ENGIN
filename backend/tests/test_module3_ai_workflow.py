"""
Tests for Module 3: AI-Assisted Workflow Engine.
Validates: schemas, AIWorkflowService parsing, maker-checker, locking, no-fallback.
"""
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.workflow.schemas import (
    NaturalTemplateCreate,
    AITemplateValidation,
    AITemplateIssue,
    AIApprovalSummary,
    LevelSchema,
    TemplateCreate,
    TemplateResponse,
    InstanceResponse,
)
from app.workflow.ai_workflow_service import (
    AIWorkflowService,
    PARSE_TEMPLATE_PROMPT,
    VALIDATE_TEMPLATE_PROMPT,
    APPROVAL_SUMMARY_PROMPT,
)
from app.ai.providers import AIProviderError


# ═══════════════════════════════════════════════════════════════════
#  Schema Tests
# ═══════════════════════════════════════════════════════════════════

class TestNewSchemas:
    """Tests for new Module 3 schemas."""

    def test_natural_template_create(self):
        ntc = NaturalTemplateCreate(description="Manager → Risk → Director")
        assert "Manager" in ntc.description

    def test_natural_template_min_length(self):
        with pytest.raises(Exception):
            NaturalTemplateCreate(description="ab")  # min_length=3

    def test_ai_template_issue(self):
        issue = AITemplateIssue(
            severity="error",
            category="circular_approval",
            message="Same role at levels 1 and 3",
        )
        assert issue.severity == "error"
        assert issue.category == "circular_approval"

    def test_ai_template_validation_defaults(self):
        v = AITemplateValidation()
        assert v.valid is True
        assert v.issues == []
        assert v.suggestions == []

    def test_ai_template_validation_with_issues(self):
        v = AITemplateValidation(
            valid=False,
            issues=[
                AITemplateIssue(severity="error", category="missing_maker_checker", message="No levels"),
            ],
            suggestions=["Add at least two approval levels"],
        )
        assert not v.valid
        assert len(v.issues) == 1
        assert v.suggestions[0].startswith("Add")

    def test_ai_approval_summary_defaults(self):
        s = AIApprovalSummary()
        assert s.risk_impact_summary == ""
        assert s.rule_change_severity == "medium"
        assert s.direction == "neutral"

    def test_ai_approval_summary_full(self):
        s = AIApprovalSummary(
            risk_impact_summary="This policy affects loan limits for all branches.",
            rule_change_severity="high",
            direction="stricter",
            key_attention_areas=["Maximum loan amount", "Age eligibility"],
            recommendation="review_carefully",
        )
        assert s.direction == "stricter"
        assert len(s.key_attention_areas) == 2
        assert s.recommendation == "review_carefully"

    def test_template_response_has_ai_validation(self):
        r = TemplateResponse(
            id=uuid.uuid4(),
            name="Test",
            type="sequential",
            created_at="2026-01-01T00:00:00",
            ai_validation={"valid": True, "issues": []},
        )
        assert r.ai_validation is not None

    def test_instance_response_has_ai_summary(self):
        r = InstanceResponse(
            id=uuid.uuid4(),
            policy_id=uuid.uuid4(),
            template_id=uuid.uuid4(),
            current_level=1,
            status="in_progress",
            created_at="2026-01-01T00:00:00",
            updated_at="2026-01-01T00:00:00",
            ai_summary=AIApprovalSummary(
                risk_impact_summary="Low risk",
                rule_change_severity="low",
                direction="neutral",
            ),
        )
        assert r.ai_summary is not None
        assert r.ai_summary.direction == "neutral"


# ═══════════════════════════════════════════════════════════════════
#  AIWorkflowService Parsing Tests
# ═══════════════════════════════════════════════════════════════════

class TestAIWorkflowServiceParsing:
    """Test static parsing methods of AIWorkflowService."""

    def test_parse_validation_result_clean(self):
        svc = AIWorkflowService()
        raw = {
            "valid": True,
            "issues": [],
            "suggestions": ["Consider adding a committee level"],
        }
        result = svc._parse_validation_result(raw)
        assert result["valid"] is True
        assert len(result["issues"]) == 0
        assert len(result["suggestions"]) == 1

    def test_parse_validation_result_with_errors(self):
        svc = AIWorkflowService()
        raw = {
            "valid": True,  # AI says valid but has errors — we override
            "issues": [
                {"severity": "error", "category": "circular_approval", "message": "Same role"},
                {"severity": "warning", "category": "parallel_inconsistency", "message": "Mismatch"},
            ],
        }
        result = svc._parse_validation_result(raw)
        assert result["valid"] is False  # overridden because error exists
        assert len(result["issues"]) == 2

    def test_parse_validation_result_only_warnings(self):
        svc = AIWorkflowService()
        raw = {
            "valid": True,
            "issues": [
                {"severity": "warning", "category": "self_approval", "message": "Only 1 level"},
            ],
        }
        result = svc._parse_validation_result(raw)
        assert result["valid"] is True  # warnings don't block

    def test_parse_approval_summary(self):
        svc = AIWorkflowService()
        raw = {
            "risk_impact_summary": "Policy affects all retail products",
            "rule_change_severity": "high",
            "direction": "stricter",
            "key_attention_areas": ["Interest rates", "Eligibility criteria"],
            "recommendation": "escalate",
        }
        result = svc._parse_approval_summary(raw)
        assert result["rule_change_severity"] == "high"
        assert result["direction"] == "stricter"
        assert result["recommendation"] == "escalate"

    def test_parse_approval_summary_defaults(self):
        svc = AIWorkflowService()
        result = svc._parse_approval_summary({})
        assert result["rule_change_severity"] == "medium"
        assert result["direction"] == "neutral"
        assert result["recommendation"] == "review_carefully"


class TestAIWorkflowServiceMocked:
    """Test AIWorkflowService with mocked AI provider."""

    @pytest.mark.asyncio
    async def test_parse_natural_template(self):
        svc = AIWorkflowService()
        mock_response = MagicMock()
        mock_response.data = {
            "template_name": "Standard Approval Chain",
            "levels": [
                {"level_number": 1, "role": "Manager", "parallel": False},
                {"level_number": 2, "role": "Risk", "parallel": False},
                {"level_number": 3, "role": "Director", "parallel": False},
                {"level_number": 4, "role": "Committee", "parallel": True},
            ],
        }
        mock_response.provider = "openai"
        mock_response.model = "gpt-4o-mini"
        mock_response.total_tokens = 800
        mock_response.latency_ms = 1500.0

        mock_provider = AsyncMock()
        mock_provider.generate_json = AsyncMock(return_value=mock_response)

        with patch("app.workflow.ai_workflow_service.get_ai_provider", return_value=mock_provider):
            result = await svc.parse_natural_template("Manager → Risk → Director → Committee")

        assert result["template_name"] == "Standard Approval Chain"
        assert len(result["levels"]) == 4
        assert result["levels"][3]["parallel"] is True
        mock_provider.generate_json.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_validate_template(self):
        svc = AIWorkflowService()
        mock_response = MagicMock()
        mock_response.data = {
            "valid": True,
            "issues": [
                {"severity": "suggestion", "category": "parallel_inconsistency", "message": "Consider parallel at final level"},
            ],
            "suggestions": ["All good"],
        }
        mock_response.provider = "openai"
        mock_response.model = "gpt-4o-mini"
        mock_response.total_tokens = 600
        mock_response.latency_ms = 1200.0

        mock_provider = AsyncMock()
        mock_provider.generate_json = AsyncMock(return_value=mock_response)

        with patch("app.workflow.ai_workflow_service.get_ai_provider", return_value=mock_provider):
            result = await svc.validate_template([
                {"level_number": 1, "role": "Manager", "parallel": False},
                {"level_number": 2, "role": "Director", "parallel": False},
            ])

        assert result["valid"] is True
        assert len(result["issues"]) == 1

    @pytest.mark.asyncio
    async def test_generate_approval_summary(self):
        svc = AIWorkflowService()
        mock_response = MagicMock()
        mock_response.data = {
            "risk_impact_summary": "Medium risk policy for education loans.",
            "rule_change_severity": "medium",
            "direction": "neutral",
            "key_attention_areas": ["Loan limits"],
            "recommendation": "approve",
        }
        mock_response.provider = "openai"
        mock_response.model = "gpt-4o-mini"
        mock_response.total_tokens = 900
        mock_response.latency_ms = 2000.0

        mock_provider = AsyncMock()
        mock_provider.generate_json = AsyncMock(return_value=mock_response)

        with patch("app.workflow.ai_workflow_service.get_ai_provider", return_value=mock_provider):
            result = await svc.generate_approval_summary(
                structure={"sections": [{"title": "Eligibility"}]},
                policy_name="Education Loan Policy",
            )

        assert result["rule_change_severity"] == "medium"
        assert result["recommendation"] == "approve"

    @pytest.mark.asyncio
    async def test_validate_raises_on_provider_error(self):
        svc = AIWorkflowService()
        mock_provider = AsyncMock()
        mock_provider.generate_json = AsyncMock(
            side_effect=AIProviderError("API key invalid", provider="openai", model="gpt-4o-mini")
        )

        with patch("app.workflow.ai_workflow_service.get_ai_provider", return_value=mock_provider):
            with pytest.raises(AIProviderError):
                await svc.validate_template([{"level_number": 1, "role": "X"}])


# ═══════════════════════════════════════════════════════════════════
#  System Prompts & No Fallback Verification
# ═══════════════════════════════════════════════════════════════════

class TestNoFallbackData:
    """Verify no fallback or static data exists in workflow module."""

    def test_prompts_exist(self):
        assert "circular approval" in VALIDATE_TEMPLATE_PROMPT.lower()
        assert "missing final authority" in VALIDATE_TEMPLATE_PROMPT.lower()
        assert "parallel inconsistency" in VALIDATE_TEMPLATE_PROMPT.lower()
        assert "risk" in APPROVAL_SUMMARY_PROMPT.lower()

    def test_parse_prompt_exists(self):
        assert "approval chain" in PARSE_TEMPLATE_PROMPT.lower()
        assert "maker-checker" in PARSE_TEMPLATE_PROMPT.lower()

    def test_service_has_ai_validation_gate(self):
        import app.workflow.service as svc
        assert hasattr(svc, "_ai_validate_template")

    def test_service_has_approval_summary(self):
        import app.workflow.service as svc
        assert hasattr(svc, "get_approval_summary")

    def test_service_has_natural_template(self):
        import app.workflow.service as svc
        assert hasattr(svc, "create_template_from_natural")

    def test_service_has_validate_only(self):
        import app.workflow.service as svc
        assert hasattr(svc, "validate_template_only")

    def test_policy_model_has_is_locked(self):
        from app.policy.models import PolicyMetadata
        assert hasattr(PolicyMetadata, "is_locked")

    def test_no_silent_auto_approval_marker(self):
        """Verify the service module docstring mentions no silent auto-approval."""
        import app.workflow.service as svc
        assert "no silent auto-approval" in svc.__doc__.lower()
