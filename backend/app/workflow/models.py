"""
Workflow SQLAlchemy models — Configurable hierarchy-based workflow engine.
Includes: Templates, Levels, Instances, Actions, plus legacy WorkflowStatus and AuditLog.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Integer, Boolean, ForeignKey, DateTime, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database.postgresql import Base


# ═══════════════════════════════════════════════════════════════════
#  Configurable Workflow Templates
# ═══════════════════════════════════════════════════════════════════

class ApprovalWorkflowTemplate(Base):
    """Named workflow template (sequential / parallel)."""
    __tablename__ = "approval_workflow_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, unique=True)
    type = Column(String(50), nullable=False, default="sequential")  # sequential | parallel
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = Column(Boolean, default=True)

    levels = relationship("WorkflowLevel", back_populates="template", cascade="all, delete-orphan",
                          order_by="WorkflowLevel.level_number")


class WorkflowLevel(Base):
    """Single level in a workflow template hierarchy."""
    __tablename__ = "workflow_levels"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id = Column(UUID(as_uuid=True), ForeignKey("approval_workflow_templates.id", ondelete="CASCADE"), nullable=False)
    level_number = Column(Integer, nullable=False)
    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=False)
    role_name = Column(String(100), nullable=True)  # denormalized for display
    is_parallel = Column(Boolean, default=False)  # True = all users of role must approve

    template = relationship("ApprovalWorkflowTemplate", back_populates="levels")


# ═══════════════════════════════════════════════════════════════════
#  Active Workflow Instances (per policy)
# ═══════════════════════════════════════════════════════════════════

class PolicyWorkflowInstance(Base):
    """Active workflow instance tying a policy to a template."""
    __tablename__ = "policy_workflow_instances"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    policy_id = Column(UUID(as_uuid=True), ForeignKey("policy_metadata.id", ondelete="CASCADE"), nullable=False)
    template_id = Column(UUID(as_uuid=True), ForeignKey("approval_workflow_templates.id"), nullable=False)
    current_level = Column(Integer, default=1)
    status = Column(String(50), default="in_progress")  # in_progress | approved | rejected
    submitted_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    actions = relationship("WorkflowAction", back_populates="instance", cascade="all, delete-orphan",
                           order_by="WorkflowAction.created_at")
    template = relationship("ApprovalWorkflowTemplate")


class WorkflowAction(Base):
    """Individual approve/reject action within a workflow instance."""
    __tablename__ = "workflow_actions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    instance_id = Column(UUID(as_uuid=True), ForeignKey("policy_workflow_instances.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    level_number = Column(Integer, nullable=False)
    action = Column(String(20), nullable=False)  # approve | reject
    comments = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    instance = relationship("PolicyWorkflowInstance", back_populates="actions")


# ═══════════════════════════════════════════════════════════════════
#  Legacy models (preserved for backward compat)
# ═══════════════════════════════════════════════════════════════════

class WorkflowStatus(Base):
    __tablename__ = "workflow_status"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    policy_engine_id = Column(UUID(as_uuid=True), ForeignKey("policy_metadata.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(50), nullable=False)
    submitted_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    comments = Column(Text, nullable=True)
    submitted_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(100), nullable=True)
    entity_id = Column(UUID(as_uuid=True), nullable=True)
    details = Column(JSON, nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
