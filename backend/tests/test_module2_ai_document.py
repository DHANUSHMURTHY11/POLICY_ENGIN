"""
Tests for Module 2: Strict AI Document Mode.
Validates: schemas, AIDocumentComposer parsing, approval gate, no-fallback.
"""
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.document.schemas import (
    AIComposedDocument,
    AIComposedSection,
    ApprovalFlowEntry,
    DocumentGenerateResponse,
)
from app.document.ai_document_composer import AIDocumentComposer
from app.ai.providers import AIProviderError


# ═══════════════════════════════════════════════════════════════════
#  Schema Tests
# ═══════════════════════════════════════════════════════════════════

class TestAIComposedDocument:
    """AIComposedDocument schema tests."""

    def test_minimal_document(self):
        doc = AIComposedDocument(title="Test Policy")
        assert doc.title == "Test Policy"
        assert doc.scope == ""
        assert doc.sections == []
        assert doc.approval_flow_summary == ""
        assert doc.approval_chain == []
        assert doc.annexures == []

    def test_full_document(self):
        doc = AIComposedDocument(
            title="Education Loan Policy 2026",
            scope="Applicable to all education loan products offered by TestBank",
            sections=[
                AIComposedSection(
                    heading="Eligibility Criteria",
                    content="This section defines who can apply for an education loan.",
                    tables=[{
                        "caption": "Age Requirements",
                        "headers": ["Criteria", "Minimum", "Maximum"],
                        "rows": [["Borrower Age", "18", "65"]],
                    }],
                )
            ],
            approval_flow_summary="Sequential three-level approval required.",
            approval_chain=[
                ApprovalFlowEntry(level=1, role="Branch Manager", status="approved"),
                ApprovalFlowEntry(level=2, role="Regional Head", status="approved"),
            ],
            annexures=[{"title": "Appendix A", "content": "Reference documents"}],
        )
        assert len(doc.sections) == 1
        assert doc.sections[0].tables[0]["headers"][0] == "Criteria"
        assert len(doc.approval_chain) == 2
        assert doc.approval_chain[0].role == "Branch Manager"


class TestApprovalFlowEntry:
    """ApprovalFlowEntry schema tests."""

    def test_default_status(self):
        e = ApprovalFlowEntry(level=1, role="Manager")
        assert e.status == "pending"
        assert e.approver == ""
        assert e.timestamp is None

    def test_full_entry(self):
        e = ApprovalFlowEntry(
            level=2,
            role="VP",
            approver="user-123",
            status="approved",
            timestamp="2026-02-21T10:00:00",
            comments="Looks good",
        )
        assert e.level == 2
        assert e.comments == "Looks good"


class TestDocumentGenerateResponse:
    """DocumentGenerateResponse schema tests."""

    def test_response(self):
        r = DocumentGenerateResponse(
            policy_id="abc-123",
            format="word",
            filename="Policy_abc.docx",
        )
        assert r.ai_composed is True
        assert r.message == "Document generated successfully"


# ═══════════════════════════════════════════════════════════════════
#  AIDocumentComposer Parsing Tests
# ═══════════════════════════════════════════════════════════════════

class TestAIDocumentComposerParsing:
    """Test the static parsing method of AIDocumentComposer."""

    def test_parse_valid_composed_document(self):
        raw = {
            "title": "Education Loan Policy",
            "scope": "Covers all education loan products",
            "sections": [
                {
                    "heading": "Eligibility",
                    "content": "The borrower must meet the following criteria.",
                    "tables": [
                        {
                            "caption": "Age Matrix",
                            "headers": ["Param", "Value"],
                            "rows": [["Min Age", "18"], ["Max Age", "65"]],
                        }
                    ],
                },
                {
                    "heading": "Loan Limits",
                    "content": "Maximum loan amount depends on the institution.",
                },
            ],
            "approval_flow_summary": "Three-level sequential approval.",
            "annexures": [{"title": "Annexure A", "content": "Supporting docs"}],
        }
        approval_flow = [
            {"level": 1, "role": "Manager", "status": "approved", "approver": "u1"},
            {"level": 2, "role": "VP", "status": "approved", "approver": "u2"},
        ]

        result = AIDocumentComposer._parse_composed_document(raw, approval_flow)
        assert isinstance(result, AIComposedDocument)
        assert result.title == "Education Loan Policy"
        assert len(result.sections) == 2
        assert result.sections[0].tables[0]["headers"] == ["Param", "Value"]
        assert len(result.approval_chain) == 2
        assert result.approval_chain[1].role == "VP"

    def test_parse_minimal_document(self):
        raw = {"title": "Minimal"}
        result = AIDocumentComposer._parse_composed_document(raw, [])
        assert result.title == "Minimal"
        assert result.sections == []
        assert result.approval_chain == []

    def test_parse_missing_title_uses_default(self):
        raw = {"sections": [{"heading": "S1", "content": "text"}]}
        result = AIDocumentComposer._parse_composed_document(raw, [])
        assert result.title == "Policy Document"


class TestAIDocumentComposerMocked:
    """Test compose_document with mocked AI provider."""

    @pytest.mark.asyncio
    async def test_compose_calls_provider(self):
        composer = AIDocumentComposer()
        mock_response = MagicMock()
        mock_response.data = {
            "title": "Test Policy",
            "scope": "Test scope",
            "sections": [
                {"heading": "Section 1", "content": "Narrative text.", "tables": []}
            ],
            "approval_flow_summary": "Manager approval needed.",
            "annexures": [],
        }
        mock_response.provider = "openai"
        mock_response.model = "gpt-4o-mini"
        mock_response.total_tokens = 1500
        mock_response.latency_ms = 2500.0

        mock_provider = AsyncMock()
        mock_provider.generate_json = AsyncMock(return_value=mock_response)

        with patch("app.document.ai_document_composer.get_ai_provider", return_value=mock_provider):
            result = await composer.compose_document(
                structure={"header": {"title": "Test"}, "sections": []},
                approval_flow=[],
            )

        assert isinstance(result, AIComposedDocument)
        assert result.title == "Test Policy"
        assert len(result.sections) == 1
        mock_provider.generate_json.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_compose_raises_on_provider_error(self):
        composer = AIDocumentComposer()
        mock_provider = AsyncMock()
        mock_provider.generate_json = AsyncMock(
            side_effect=AIProviderError("API key invalid", provider="openai", model="gpt-4o-mini")
        )

        with patch("app.document.ai_document_composer.get_ai_provider", return_value=mock_provider):
            with pytest.raises(AIProviderError):
                await composer.compose_document(
                    structure={"sections": []},
                    approval_flow=[],
                )


# ═══════════════════════════════════════════════════════════════════
#  No Fallback / No Static Data Verification
# ═══════════════════════════════════════════════════════════════════

class TestNoFallbackData:
    """Verify no fallback or static data exists in document module."""

    def test_no_fallback_enhance(self):
        import app.document.service as svc
        assert not hasattr(svc, "_fallback_enhance")

    def test_no_old_enhance_structure(self):
        import app.document.service as svc
        assert not hasattr(svc, "enhance_structure")

    def test_no_enhance_system_prompt(self):
        import app.document.service as svc
        assert not hasattr(svc, "ENHANCE_SYSTEM_PROMPT")

    def test_composer_has_prompt(self):
        import app.document.ai_document_composer as mod
        assert hasattr(mod, "COMPOSE_DOCUMENT_PROMPT")
        assert "financial policy document composer" in mod.COMPOSE_DOCUMENT_PROMPT

    def test_service_has_approval_check(self):
        import app.document.service as svc
        assert hasattr(svc, "_check_policy_approved")

    def test_service_uses_ai_composer(self):
        import app.document.service as svc
        assert hasattr(svc, "_compose_via_ai")
