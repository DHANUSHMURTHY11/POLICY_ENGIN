"""
Pydantic v2 schemas for Policy CRUD and document structure.
These schemas enforce the exact MongoDB document_structure format.
"""
from __future__ import annotations

import uuid
from datetime import datetime, date
from typing import Any, Optional, List

from pydantic import BaseModel, Field, field_validator


# ── Allowed status values ──────────────────────────────────────────
ALLOWED_STATUSES = {"draft", "validation_failed", "pending_approval", "approved", "rejected", "archived"}


# ═══════════════════════════════════════════════════════════════════
#  Document Structure — nested schemas (MongoDB shape)
# ═══════════════════════════════════════════════════════════════════

class FieldSchema(BaseModel):
    """Single field inside a subsection."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    field_name: str
    field_type: str = "text"  # text|number|dropdown|multi_select|date|boolean|textarea|email|phone|currency|percentage
    validation_rules: dict[str, Any] = Field(default_factory=dict)
    rule_metadata: dict[str, Any] = Field(default_factory=dict)
    conditional_logic: dict[str, Any] = Field(default_factory=dict)
    notes: str = ""
    display_label: str = ""           # Human-readable label for narratives
    rule_description: str = ""        # Human-readable rule description for documents


class SubsectionSchema(BaseModel):
    """Subsection within a section."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    order: int
    fields: List[FieldSchema] = Field(default_factory=list)


# ── Allowed tones ──────────────────────────────────────────────────
ALLOWED_TONES = {"formal", "regulatory", "internal", "customer_facing"}
ALLOWED_REWRITE_ACTIONS = {"expand", "simplify", "regulatory_tone", "internal_memo"}


class SectionSchema(BaseModel):
    """Top-level section of a policy document."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str = ""
    order: int
    subsections: List[SubsectionSchema] = Field(default_factory=list)
    # ── Narrative / Hybrid fields ──
    narrative_content: str = ""
    ai_generated: bool = False
    tone: str = "formal"  # formal | regulatory | internal | customer_facing
    communication_style: str = "policy_circular"


class VersionControlEntry(BaseModel):
    version_number: int
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    change_summary: str = ""


class HeaderSchema(BaseModel):
    title: str = ""
    organization: str = ""
    effective_date: Optional[date] = None
    expiry_date: Optional[date] = None


class DocumentStructure(BaseModel):
    """The full document_structure object stored inside MongoDB."""
    header: HeaderSchema = Field(default_factory=HeaderSchema)
    version_control: List[VersionControlEntry] = Field(default_factory=list)
    sections: List[SectionSchema] = Field(default_factory=list)
    annexures: List[dict[str, Any]] = Field(default_factory=list)
    attachments: List[dict[str, Any]] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════
#  Policy CRUD schemas (PostgreSQL metadata)
# ═══════════════════════════════════════════════════════════════════

class PolicyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Policy name cannot be blank")
        return v.strip()


class PolicyUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[str] = None

    @field_validator("status")
    @classmethod
    def status_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ALLOWED_STATUSES:
            raise ValueError(f"Status must be one of: {', '.join(ALLOWED_STATUSES)}")
        return v


class PolicyResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    created_by: Optional[str] = None
    current_version: int
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PolicyListResponse(BaseModel):
    policies: List[PolicyResponse]
    total: int
    page: int
    page_size: int


class PolicyDetailResponse(PolicyResponse):
    """Policy metadata + latest document structure from MongoDB."""
    document_structure: Optional[DocumentStructure] = None


# ═══════════════════════════════════════════════════════════════════
#  Structure endpoints — request / response
# ═══════════════════════════════════════════════════════════════════

class ManualStructureRequest(BaseModel):
    """Payload sent by the frontend manual builder."""
    header: HeaderSchema = Field(default_factory=HeaderSchema)
    sections: List[SectionSchema]
    annexures: List[dict[str, Any]] = Field(default_factory=list)
    attachments: List[dict[str, Any]] = Field(default_factory=list)


class AIStructureRequest(BaseModel):
    """Payload sent for AI-based structure generation."""
    prompt: str = Field(..., min_length=5)


class AIRewriteRequest(BaseModel):
    """Payload for AI-powered section narrative rewriting."""
    section_id: str
    action: str = Field(..., description="expand | simplify | regulatory_tone | internal_memo")
    current_content: str = ""
    section_title: str = ""
    section_description: str = ""
    tone: str = "formal"

    @field_validator("action")
    @classmethod
    def action_valid(cls, v: str) -> str:
        if v not in ALLOWED_REWRITE_ACTIONS:
            raise ValueError(f"Action must be one of: {', '.join(ALLOWED_REWRITE_ACTIONS)}")
        return v


class AIRewriteResponse(BaseModel):
    """Response from AI section rewrite."""
    narrative_content: str
    tone: str
    ai_generated: bool = True
    communication_style: str = "policy_circular"


class AIEnhanceRequest(BaseModel):
    """Payload for AI structure enhancement."""
    structure: DocumentStructure
    instructions: str = Field("", description="Optional enhancement instructions")


class AIValidationIssue(BaseModel):
    """Single issue found by AI validation."""
    severity: str = "error"  # error | warning | suggestion
    category: str  # duplicate_field | missing_section | hierarchy | normalization
    message: str
    path: str = ""  # e.g. "sections[0].subsections[1].fields[2]"


class AIValidationResult(BaseModel):
    """Result of AI validation on a structure."""
    valid: bool
    issues: List[AIValidationIssue] = Field(default_factory=list)
    suggestions: List[str] = Field(default_factory=list)
    normalized_field_names: dict[str, str] = Field(
        default_factory=dict,
        description="Map of original → suggested normalized field names",
    )


class StructureResponse(BaseModel):
    policy_id: str
    version: int
    document_structure: DocumentStructure
    ai_validation: Optional[AIValidationResult] = None
    message: str = "Structure saved successfully"
