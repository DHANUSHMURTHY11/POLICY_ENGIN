"""
Versioning API endpoints — version history, compare, lock, rollback.
"""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.postgresql import get_db
from app.middleware.auth_middleware import get_current_user
from app.versioning import service
from app.versioning.schemas import (
    VersionResponse, VersionDetailResponse, VersionListResponse,
    VersionCompareResponse, CreateVersionRequest,
)

router = APIRouter()


@router.get("/policies/{policy_id}/versions", response_model=VersionListResponse)
async def list_versions(
    policy_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get version history for a policy."""
    versions = await service.list_versions(db, policy_id)
    items = [VersionResponse.model_validate(v) for v in versions]
    return VersionListResponse(versions=items, total=len(items))


@router.get("/policies/{policy_id}/versions/compare", response_model=VersionCompareResponse)
async def compare_versions(
    policy_id: UUID,
    base: int = Query(..., description="Base version number"),
    compare: int = Query(..., description="Compare version number"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Compare two versions side-by-side with diff."""
    result = await service.compare_versions(db, policy_id, base, compare)
    return result


@router.get("/policies/{policy_id}/versions/{version_number}", response_model=VersionDetailResponse)
async def get_version(
    policy_id: UUID,
    version_number: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get a specific version with full document_structure."""
    try:
        detail = await service.get_version_detail(db, policy_id, version_number)
        return detail
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/policies/{policy_id}/versions", response_model=VersionResponse, status_code=201)
async def create_version(
    policy_id: UUID,
    data: CreateVersionRequest = CreateVersionRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Create a new version snapshot."""
    try:
        version = await service.create_version_snapshot(
            db, policy_id, current_user["user_id"], data.change_summary
        )
        return VersionResponse.model_validate(version)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/policies/{policy_id}/versions/{version_number}/lock", response_model=VersionResponse)
async def lock_version(
    policy_id: UUID,
    version_number: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Lock a version after approval — prevents further edits."""
    try:
        version = await service.lock_version(db, policy_id, version_number, current_user["user_id"])
        return VersionResponse.model_validate(version)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/policies/{policy_id}/versions/{version_number}/rollback", response_model=VersionResponse)
async def rollback_version(
    policy_id: UUID,
    version_number: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Rollback a policy to a previous version."""
    try:
        version = await service.rollback_to_version(
            db, policy_id, version_number, current_user["user_id"]
        )
        return VersionResponse.model_validate(version)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
