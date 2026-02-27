"""
Policy Runtime Engine — Pydantic schemas for query execution.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Any, Dict
from uuid import UUID


class QueryRequest(BaseModel):
    """User query against an approved policy."""
    user_query: str = Field(..., min_length=1)
    structured_inputs: Dict[str, Any] = Field(default_factory=dict)


class RuleEvaluation(BaseModel):
    """Single rule evaluation result."""
    field_name: str
    field_type: str
    rule: str
    input_value: Any = None
    result: str  # pass | fail | skipped | not_provided
    detail: str = ""


class ReasoningStep(BaseModel):
    """Single step in the AI reasoning trace."""
    step: int
    action: str
    detail: str


class QueryResponse(BaseModel):
    """Full response from the policy runtime engine."""
    policy_id: str
    policy_name: str
    version: int
    decision: str  # approved | rejected | needs_review | insufficient_data
    confidence: float = 0.0
    explanation: str = ""
    rule_evaluations: List[RuleEvaluation] = []
    reasoning_trace: List[ReasoningStep] = []
    ai_analysis: str = ""
    warnings: List[str] = []
