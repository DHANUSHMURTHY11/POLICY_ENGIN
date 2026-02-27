"""
PolicyMetadata — PostgreSQL table for policy metadata only.
Structure content lives in MongoDB `policy_documents` collection.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, Text, Integer, Boolean, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID

from app.database.postgresql import Base


class PolicyMetadata(Base):
    __tablename__ = "policy_metadata"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    current_version = Column(Integer, nullable=False, default=1)
    status = Column(
        String(20),
        nullable=False,
        default="draft",
        index=True,
    )  # draft | submitted | approved | rejected
    is_locked = Column(Boolean, nullable=False, default=False)  # locked during approval
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
