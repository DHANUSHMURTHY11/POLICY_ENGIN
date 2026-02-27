"""
Schemas for the AI Help Assistant (Guidance Bot).
Isolated from policy generation schemas.
"""
from typing import List, Optional
from pydantic import BaseModel, Field


class HelpMessage(BaseModel):
    role: str = "user"  # user | assistant
    content: str


class HelpChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    history: List[HelpMessage] = Field(default_factory=list)


class HelpChatResponse(BaseModel):
    message: str
    suggested_navigation: Optional[str] = None  # None | "create_policy_options" | "audit" | "approval"
    ai_provider: str
    ai_model: str
