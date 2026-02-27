"""
Versioning schemas — responses for version history, compare, and detail.
AI-Augmented Version Engine — strict mode, no static interpretation.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Any
from uuid import UUID
from datetime import datetime


class VersionResponse(BaseModel):
    """Single version record."""
    id: UUID
    policy_id: UUID
    version_number: int
    change_summary: Optional[str] = None
    created_by: Optional[UUID] = None
    created_at: datetime
    is_locked: bool = False
    approved_at: Optional[datetime] = None
    approved_by: Optional[UUID] = None

    # AI metadata
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None
    ai_tokens: Optional[int] = None

    class Config:
        from_attributes = True


class VersionDetailResponse(VersionResponse):
    """Version with full document_structure included."""
    document_structure: Optional[Any] = None


class VersionListResponse(BaseModel):
    versions: List[VersionResponse]
    total: int = 0


# ── AI Version Analysis ──────────────────────────────────────────

class CriticalChange(BaseModel):
    """Single critical change identified by AI."""
    change_type: str = ""  # stricter_rule | relaxed_rule | new_knockout | removed_validation
    field_or_section: str = ""
    description: str = ""


class AIVersionAnalysis(BaseModel):
    """AI-generated diff analysis between two policy versions."""
    risk_direction: str = "neutral"  # stricter | looser | neutral
    summary: str = ""
    critical_changes: List[CriticalChange] = Field(default_factory=list)
    compliance_flags: List[str] = Field(default_factory=list)


class VersionCompareResponse(BaseModel):
    """Full version comparison including structural diff and AI analysis."""
    base_version: int
    compare_version: int
    base_structure: Optional[Any] = None
    compare_structure: Optional[Any] = None
    changes: List[Any] = []
    ai_analysis: Optional[AIVersionAnalysis] = None


class CreateVersionRequest(BaseModel):
    change_summary: str = ""


class LockVersionRequest(BaseModel):
    pass
