"""
Auth Pydantic schemas for request/response validation.
"""
from pydantic import BaseModel, EmailStr
from typing import Optional
from uuid import UUID
from datetime import datetime


# ── Request Schemas ──
class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    role_name: Optional[str] = "policy_manager"


# ── Response Schemas ──
class UserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    role_name: Optional[str] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class RoleResponse(BaseModel):
    id: UUID
    name: str
    permissions: dict

    class Config:
        from_attributes = True
