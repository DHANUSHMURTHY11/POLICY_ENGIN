"""
Tests for Module 4: AI-Augmented Version Engine.
Validates: schemas, AIVersionService parsing, structural diff, no-fallback.
"""
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.versioning.schemas import (
    AIVersionAnalysis,
    CriticalChange,
    VersionCompareResponse,
    VersionResponse,
)
from app.versioning.ai_version_service import (
    AIVersionService,
    VERSION_DIFF_PROMPT,
)
from app.versioning.service import _compute_diff
from app.ai.providers import AIProviderError


# ═══════════════════════════════════════════════════════════════════
#  Schema Tests
# ═══════════════════════════════════════════════════════════════════

class TestAIVersionSchemas:
    """Tests for new Module 4 schemas."""

    def test_critical_change(self):
        c = CriticalChange(
            change_type="stricter_rule",
            field_or_section="Max Loan Amount",
            description="Limit reduced from 50L to 30L",
        )
        assert c.change_type == "stricter_rule"
        assert "50L" in c.description

    def test_critical_change_defaults(self):
        c = CriticalChange()
        assert c.change_type == ""
        assert c.field_or_section == ""

    def test_ai_version_analysis_defaults(self):
        a = AIVersionAnalysis()
        assert a.risk_direction == "neutral"
        assert a.summary == ""
        assert a.critical_changes == []
        assert a.compliance_flags == []

    def test_ai_version_analysis_full(self):
        a = AIVersionAnalysis(
            risk_direction="stricter",
            summary="Policy tightened loan eligibility and added knockout rules.",
            critical_changes=[
                CriticalChange(
                    change_type="new_knockout",
                    field_or_section="CIBIL Score",
                    description="New minimum CIBIL score of 700 required",
                ),
                CriticalChange(
                    change_type="stricter_rule",
                    field_or_section="Age Limit",
                    description="Maximum age reduced from 65 to 60",
                ),
            ],
            compliance_flags=["New knockout rule may reject 15% more applicants"],
        )
        assert a.risk_direction == "stricter"
        assert len(a.critical_changes) == 2
        assert len(a.compliance_flags) == 1

    def test_version_compare_has_ai_analysis(self):
        r = VersionCompareResponse(
            base_version=1,
            compare_version=2,
            ai_analysis=AIVersionAnalysis(
                risk_direction="looser",
                summary="Rules relaxed.",
            ),
        )
        assert r.ai_analysis is not None
        assert r.ai_analysis.risk_direction == "looser"

    def test_version_compare_no_ai_analysis(self):
        r = VersionCompareResponse(base_version=1, compare_version=2)
        assert r.ai_analysis is None


# ═══════════════════════════════════════════════════════════════════
#  Structural Diff Tests (preserved logic)
# ═══════════════════════════════════════════════════════════════════

class TestStructuralDiff:
    """Test the structural _compute_diff function."""

    def test_both_none(self):
        assert _compute_diff(None, None, 1, 2) == []

    def test_base_none(self):
        changes = _compute_diff(None, {"header": {}}, 1, 2)
        assert len(changes) == 1
        assert changes[0]["type"] == "added"

    def test_compare_none(self):
        changes = _compute_diff({"header": {}}, None, 1, 2)
        assert len(changes) == 1
        assert changes[0]["type"] == "removed"

    def test_no_changes(self):
        struct = {"header": {"title": "Test"}, "sections": []}
        changes = _compute_diff(struct, struct, 1, 2)
        assert any(c["type"] == "unchanged" for c in changes)

    def test_header_change(self):
        base = {"header": {"title": "Old Title"}, "sections": []}
        comp = {"header": {"title": "New Title"}, "sections": []}
        changes = _compute_diff(base, comp, 1, 2)
        assert any("header.title" in c["path"] for c in changes)

    def test_section_added(self):
        base = {"header": {}, "sections": [{"title": "A"}]}
        comp = {"header": {}, "sections": [{"title": "A"}, {"title": "B"}]}
        changes = _compute_diff(base, comp, 1, 2)
        assert any("Section 'B' added" in c["detail"] for c in changes)

    def test_section_removed(self):
        base = {"header": {}, "sections": [{"title": "A"}, {"title": "B"}]}
        comp = {"header": {}, "sections": [{"title": "A"}]}
        changes = _compute_diff(base, comp, 1, 2)
        assert any("Section 'B' removed" in c["detail"] for c in changes)


# ═══════════════════════════════════════════════════════════════════
#  AIVersionService Parsing Tests
# ═══════════════════════════════════════════════════════════════════

class TestAIVersionServiceParsing:
    """Test static parsing methods of AIVersionService."""

    def test_parse_analysis_full(self):
        svc = AIVersionService()
        raw = {
            "risk_direction": "stricter",
            "summary": "Tighter controls on loan eligibility.",
            "critical_changes": [
                {
                    "change_type": "new_knockout",
                    "field_or_section": "CIBIL Score",
                    "description": "Minimum 700 now required",
                },
                {
                    "change_type": "removed_validation",
                    "field_or_section": "Employment Check",
                    "description": "Removed employment duration check",
                },
            ],
            "compliance_flags": ["May conflict with RBI guideline Section 4.2"],
        }
        result = svc._parse_analysis(raw)
        assert result["risk_direction"] == "stricter"
        assert len(result["critical_changes"]) == 2
        assert result["critical_changes"][0]["change_type"] == "new_knockout"
        assert len(result["compliance_flags"]) == 1

    def test_parse_analysis_defaults(self):
        svc = AIVersionService()
        result = svc._parse_analysis({})
        assert result["risk_direction"] == "neutral"
        assert result["summary"] == ""
        assert result["critical_changes"] == []
        assert result["compliance_flags"] == []

    def test_parse_analysis_partial(self):
        svc = AIVersionService()
        raw = {
            "risk_direction": "looser",
            "summary": "Some rules relaxed.",
        }
        result = svc._parse_analysis(raw)
        assert result["risk_direction"] == "looser"
        assert result["critical_changes"] == []


class TestAIVersionServiceMocked:
    """Test AIVersionService with mocked AI provider."""

    @pytest.mark.asyncio
    async def test_analyze_version_diff(self):
        svc = AIVersionService()
        mock_response = MagicMock()
        mock_response.data = {
            "risk_direction": "stricter",
            "summary": "Stricter eligibility criteria added.",
            "critical_changes": [
                {
                    "change_type": "stricter_rule",
                    "field_or_section": "Age Limit",
                    "description": "Max age reduced from 65 to 60",
                }
            ],
            "compliance_flags": [],
        }
        mock_response.provider = "openai"
        mock_response.model = "gpt-4o-mini"
        mock_response.total_tokens = 1200
        mock_response.latency_ms = 2000.0

        mock_provider = AsyncMock()
        mock_provider.generate_json = AsyncMock(return_value=mock_response)

        with patch("app.versioning.ai_version_service.get_ai_provider", return_value=mock_provider):
            result = await svc.analyze_version_diff(
                structural_diff=[{"type": "modified", "path": "sections.Eligibility"}],
                base_structure={"sections": [{"title": "Eligibility"}]},
                compare_structure={"sections": [{"title": "Eligibility"}]},
                base_version=1,
                compare_version=2,
            )

        assert result["risk_direction"] == "stricter"
        assert len(result["critical_changes"]) == 1
        mock_provider.generate_json.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_analyze_raises_on_provider_error(self):
        svc = AIVersionService()
        mock_provider = AsyncMock()
        mock_provider.generate_json = AsyncMock(
            side_effect=AIProviderError("Quota exceeded", provider="openai", model="gpt-4o-mini")
        )

        with patch("app.versioning.ai_version_service.get_ai_provider", return_value=mock_provider):
            with pytest.raises(AIProviderError):
                await svc.analyze_version_diff(
                    structural_diff=[],
                    base_structure={},
                    compare_structure={},
                    base_version=1,
                    compare_version=2,
                )


# ═══════════════════════════════════════════════════════════════════
#  No Fallback / No Static Interpretation Verification
# ═══════════════════════════════════════════════════════════════════

class TestNoFallbackData:
    """Verify no static interpretation fallback exists."""

    def test_prompt_covers_all_categories(self):
        assert "stricter rules" in VERSION_DIFF_PROMPT.lower()
        assert "relaxed rules" in VERSION_DIFF_PROMPT.lower()
        assert "knockout" in VERSION_DIFF_PROMPT.lower()
        assert "removed validation" in VERSION_DIFF_PROMPT.lower()
        assert "risk_direction" in VERSION_DIFF_PROMPT

    def test_service_has_ai_analyze(self):
        import app.versioning.service as svc
        assert hasattr(svc, "_ai_analyze_diff")

    def test_service_keeps_compute_diff(self):
        import app.versioning.service as svc
        assert hasattr(svc, "_compute_diff")

    def test_no_static_interpretation_in_docstring(self):
        import app.versioning.service as svc
        assert "no static" in svc.__doc__.lower() or "no fallback" in svc.__doc__.lower()
