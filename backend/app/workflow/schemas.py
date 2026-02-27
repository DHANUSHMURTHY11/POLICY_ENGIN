"""
Workflow Pydantic schemas — Templates, Instances, Actions, AI validation.
AI-Assisted Workflow Engine — strict mode.
"""
from pydantic import BaseModel, Field
from typing import Any, Optional, List
from uuid import UUID
from datetime import datetime


# ── Template Schemas ─────────────────────────────────────────────

class LevelSchema(BaseModel):
    """A single level in a workflow template."""
    level_number: int
    role_id: UUID
    role_name: Optional[str] = None
    is_parallel: bool = False


class TemplateCreate(BaseModel):
    """Create a new workflow template."""
    name: str = Field(..., min_length=2, max_length=255)
    type: str = Field(default="sequential", pattern="^(sequential|parallel)$")
    levels: List[LevelSchema] = Field(..., min_length=1)


class NaturalTemplateCreate(BaseModel):
    """Create a template from natural language description."""
    description: str = Field(
        ...,
        min_length=3,
        description='Natural language chain, e.g. "Manager → Risk → Director → Committee"',
    )


class TemplateResponse(BaseModel):
    """Workflow template response."""
    id: UUID
    name: str
    type: str
    created_by: Optional[UUID] = None
    is_active: bool = True
    created_at: datetime
    levels: List[LevelSchema] = []
    ai_validation: Optional[dict] = None

    class Config:
        from_attributes = True


class TemplateListResponse(BaseModel):
    templates: List[TemplateResponse]
    total: int


# ── AI Validation Schemas ────────────────────────────────────────

class AITemplateIssue(BaseModel):
    """Single issue found during AI template validation."""
    severity: str = "warning"  # error | warning | suggestion
    category: str = ""  # circular_approval | missing_final_authority | parallel_inconsistency | ...
    message: str = ""


class AITemplateValidation(BaseModel):
    """AI validation result for a workflow template."""
    valid: bool = True
    issues: List[AITemplateIssue] = Field(default_factory=list)
    suggestions: List[str] = Field(default_factory=list)


class AIApprovalSummary(BaseModel):
    """AI-generated risk summary shown to validators before approval."""
    risk_impact_summary: str = ""
    rule_change_severity: str = "medium"  # low | medium | high | critical
    direction: str = "neutral"  # stricter | looser | neutral
    key_attention_areas: List[str] = Field(default_factory=list)
    recommendation: str = "review_carefully"  # approve | review_carefully | escalate


# ── Instance Schemas ─────────────────────────────────────────────

class SubmitRequest(BaseModel):
    """Submit a policy for workflow approval."""
    template_id: UUID
    comments: Optional[str] = None


class ActionRequest(BaseModel):
    """Approve or reject action."""
    comments: Optional[str] = None


class ActionResponse(BaseModel):
    """Single workflow action."""
    id: UUID
    user_id: UUID
    level_number: int
    action: str
    comments: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class InstanceResponse(BaseModel):
    """Active workflow instance status."""
    id: UUID
    policy_id: UUID
    template_id: UUID
    template_name: Optional[str] = None
    template_type: Optional[str] = None
    current_level: int
    total_levels: int = 0
    status: str
    submitted_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    actions: List[ActionResponse] = []
    levels: List[LevelSchema] = []
    ai_summary: Optional[AIApprovalSummary] = None

    class Config:
        from_attributes = True


class ApprovalQueueItem(BaseModel):
    """Single item in the approval queue."""
    instance_id: UUID
    policy_id: UUID
    policy_name: str
    template_name: str
    current_level: int
    total_levels: int
    status: str
    submitted_at: datetime


class ApprovalQueueResponse(BaseModel):
    items: List[ApprovalQueueItem]
    total: int


# ── Legacy schemas (kept for backward compat) ────────────────────

class ReviewRequest(BaseModel):
    comments: Optional[str] = None


class WorkflowStatusResponse(BaseModel):
    id: UUID
    policy_engine_id: UUID
    status: str
    submitted_by: Optional[UUID] = None
    reviewed_by: Optional[UUID] = None
    comments: Optional[str] = None
    submitted_at: datetime
    reviewed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Roles list ───────────────────────────────────────────────────

class RoleItem(BaseModel):
    id: UUID
    name: str

    class Config:
        from_attributes = True
