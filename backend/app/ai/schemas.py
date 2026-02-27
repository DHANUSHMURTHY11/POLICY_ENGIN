"""
AI Pydantic schemas.
"""
from pydantic import BaseModel
from typing import Optional, List, Any


class AIGenerateRequest(BaseModel):
    prompt: str
    policy_engine_id: Optional[str] = None
    tab_context: Optional[str] = None


class GeneratedField(BaseModel):
    field_name: str
    field_type: str = "text"
    values: List[Any] = []
    validation_rules: dict = {}
    notes: str = ""


class AIGenerateResponse(BaseModel):
    generated_fields: List[GeneratedField]
    suggested_validations: List[str] = []
    documentation_notes: str = ""
