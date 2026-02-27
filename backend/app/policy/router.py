"""
Policy API endpoints — CRUD + manual/AI structure management.
Strict AI-Native Mode — all structures gated by AI validation.
"""
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.postgresql import get_db
from app.middleware.auth_middleware import get_current_user
from app.policy import service
from app.policy.schemas import (
    PolicyCreate,
    PolicyUpdate,
    PolicyResponse,
    PolicyListResponse,
    PolicyDetailResponse,
    ManualStructureRequest,
    AIStructureRequest,
    AIEnhanceRequest,
    AIValidationResult,
    StructureResponse,
    AIRewriteRequest,
    AIRewriteResponse,
)

router = APIRouter()


# ── CRUD ──────────────────────────────────────────────────────────

@router.post("", response_model=PolicyDetailResponse, status_code=201)
async def create_policy(
    data: PolicyCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new policy with empty initial structure."""
    return await service.create_policy(db, data, current_user["user_id"])


@router.get("", response_model=PolicyListResponse)
async def list_policies(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: str = Query(None),
    status: str = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List policies with pagination, search and status filter."""
    return await service.list_policies(db, page, page_size, search, status)


@router.get("/{policy_id}", response_model=PolicyDetailResponse)
async def get_policy(
    policy_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get policy metadata and latest document structure."""
    return await service.get_policy(db, policy_id)


@router.put("/{policy_id}", response_model=PolicyResponse)
async def update_policy(
    policy_id: uuid.UUID,
    data: PolicyUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update policy metadata (name, description, status)."""
    return await service.update_policy(db, policy_id, data)


@router.delete("/{policy_id}")
async def delete_policy(
    policy_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete policy and all associated Mongo documents."""
    return await service.delete_policy(db, policy_id)


# ── Structure Management ──────────────────────────────────────────

@router.post("/{policy_id}/structure/manual", response_model=StructureResponse)
async def save_manual_structure(
    policy_id: uuid.UUID,
    data: ManualStructureRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save manually-built structure from the frontend builder.
    AI validation is MANDATORY — blocks save if AI detects issues.
    """
    return await service.save_manual_structure(db, policy_id, current_user["user_id"], data)


@router.post("/{policy_id}/structure/ai", response_model=StructureResponse)
async def generate_ai_structure(
    policy_id: uuid.UUID,
    data: AIStructureRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate policy structure using AI from a natural language prompt.
    The generated structure is validated and saved in the same format as manual.
    """
    return await service.generate_ai_structure(db, policy_id, current_user["user_id"], data)


@router.post("/{policy_id}/structure/validate", response_model=AIValidationResult)
async def validate_structure(
    policy_id: uuid.UUID,
    data: ManualStructureRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI-validate a structure without saving.
    Returns validation issues, suggestions, and field normalization recommendations.
    """
    return await service.validate_structure_ai(db, policy_id, data)


@router.post("/{policy_id}/structure/enhance", response_model=StructureResponse)
async def enhance_structure(
    policy_id: uuid.UUID,
    data: AIEnhanceRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Enhance an existing structure using AI.
    Adds missing fields, normalizes naming, fixes hierarchy, then saves.
    """
    return await service.enhance_structure(db, policy_id, current_user["user_id"], data)


# ── Narrative Rewrite ─────────────────────────────────────────────

@router.post("/{policy_id}/rewrite-section", response_model=AIRewriteResponse)
async def rewrite_section(
    policy_id: uuid.UUID,
    data: AIRewriteRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI-powered section narrative rewrite.
    Supports: expand, simplify, regulatory_tone, internal_memo.
    Strict AI Mode — no fallback. Returns error if AI fails.
    """
    return await service.rewrite_section(db, policy_id, data)


