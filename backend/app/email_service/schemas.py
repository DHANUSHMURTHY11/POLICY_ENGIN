"""
Email Pydantic schemas.
"""
from pydantic import BaseModel
from typing import Optional, List


class SendEmailRequest(BaseModel):
    to: List[str]
    subject: str
    body: str
    attachment_policy_id: Optional[str] = None
    attachment_format: str = "docx"  # docx or pdf


class EmailResponse(BaseModel):
    success: bool
    message: str
