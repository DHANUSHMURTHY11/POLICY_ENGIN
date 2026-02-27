"""
Pydantic schemas for the AI chat conversation flow.
Phase 1: multi-turn data collection.
Phase 2: confirmed-parameter structure generation.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from pydantic import BaseModel, Field


# ── Chat message types ────────────────────────────────────────────

class ChatMessage(BaseModel):
    """Single message in a conversation."""
    role: str = "user"  # user | assistant | system
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ChatMessageRequest(BaseModel):
    """Incoming request to send/continue a chat."""
    session_id: Optional[str] = None   # None → start new conversation
    message: str = Field(..., min_length=1)
    policy_id: Optional[str] = None    # optionally attach to an existing policy


class ChatMessageResponse(BaseModel):
    """Response from an AI chat turn."""
    session_id: str
    ai_response: str
    phase: str  # idle | intent_detected | collecting_parameters | summarizing | awaiting_confirmation | generating_structure | preview_ready | submitted_for_approval | completed
    collected_params: Dict[str, Any] = Field(default_factory=dict)
    missing_params: List[str] = Field(default_factory=list)
    is_complete: bool = False
    suggested_actions: List[str] = Field(default_factory=list)
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None
    ai_duration_ms: Optional[float] = None


class ChatGenerateRequest(BaseModel):
    """Trigger structure generation from a confirmed conversation session."""
    session_id: str
    policy_id: str
    policy_name: str = Field(..., min_length=1)
    policy_description: str = ""
    tone: str = "formal"


class ChatGenerateResponse(BaseModel):
    """Result of generating a policy structure from chat-collected params."""
    policy_id: str
    version: int
    message: str
    document_structure: Dict[str, Any]
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None


# ── Internal state (stored in MongoDB) ────────────────────────────

class ConversationState(BaseModel):
    """Server-side conversation state, persisted in MongoDB."""
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    messages: List[Dict[str, Any]] = Field(default_factory=list)
    collected_params: Dict[str, Any] = Field(default_factory=dict)
    missing_params: List[str] = Field(default_factory=list)
    phase: str = "idle"  # idle | intent_detected | collecting_parameters | summarizing | awaiting_confirmation | generating_structure | preview_ready | submitted_for_approval | completed
    policy_type: str = ""
    confirmed: bool = False
    policy_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
