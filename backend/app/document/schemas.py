"""
Document Composer — Pydantic schemas.
Strict AI Document Mode — AI-composed narratives, approval flow rendering.
"""
from pydantic import BaseModel, Field
from typing import Any, List, Optional

from app.policy.schemas import DocumentStructure


# ═══════════════════════════════════════════════════════════════════
#  AI-Composed Document Schemas
# ═══════════════════════════════════════════════════════════════════

class AIComposedSection(BaseModel):
    """A single section in the AI-composed document."""
    heading: str
    content: str = ""
    tables: List[dict[str, Any]] = Field(
        default_factory=list,
        description="List of table objects with 'headers' and 'rows' keys",
    )


class ApprovalFlowEntry(BaseModel):
    """Single level in the approval flow chain."""
    level: int
    role: str
    approver: str = ""
    status: str = "pending"  # pending | approved | rejected
    timestamp: Optional[str] = None
    comments: str = ""


class AIComposedDocument(BaseModel):
    """Full AI-composed document ready for Word/PDF rendering."""
    title: str
    scope: str = ""
    sections: List[AIComposedSection] = Field(default_factory=list)
    approval_flow_summary: str = ""
    approval_chain: List[ApprovalFlowEntry] = Field(default_factory=list)
    annexures: List[dict[str, Any]] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════
#  Request / Response
# ═══════════════════════════════════════════════════════════════════

class DocumentGenerateResponse(BaseModel):
    """Response when a document is generated."""
    policy_id: str
    format: str  # word | pdf | json
    filename: str
    ai_composed: bool = True
    message: str = "Document generated successfully"
