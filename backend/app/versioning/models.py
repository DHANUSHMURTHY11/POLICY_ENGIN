"""
Policy Versions — SQLAlchemy model with approval lock support and AI metadata.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Integer, Boolean, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID

from app.database.postgresql import Base


class PolicyVersion(Base):
    """A versioned snapshot of a policy's document_structure."""
    __tablename__ = "policy_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    policy_id = Column(UUID(as_uuid=True), ForeignKey("policy_metadata.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    mongo_snapshot_id = Column(String(255), nullable=True)
    change_summary = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    # Approval lock fields
    is_locked = Column(Boolean, default=False)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    # AI metadata fields — tracks which AI provider/model was used
    ai_provider = Column(String(50), nullable=True)
    ai_model = Column(String(100), nullable=True)
    ai_tokens = Column(Integer, nullable=True)


# Keep legacy alias so existing imports don't break
VersionHistory = PolicyVersion
