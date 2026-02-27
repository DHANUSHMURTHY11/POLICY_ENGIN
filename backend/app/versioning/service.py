"""
Version Control Engine — AI-augmented version comparison.
Keeps existing snapshot logic. AI analyzes diffs for risk/compliance.
No static comparison interpretation. No fallback.
"""
import uuid
from datetime import datetime
from typing import Optional, List

from bson import ObjectId
from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.versioning.models import PolicyVersion
from app.policy.models import PolicyMetadata
from app.database.mongodb import policy_documents_collection
from app.versioning.ai_version_service import ai_version_service
from app.ai.providers import AIProviderError

logger = get_logger(__name__)


# ═══════════════════════════════════════════════════════════════════
#  Snapshot CRUD (preserved)
# ═══════════════════════════════════════════════════════════════════

async def create_version_snapshot(
    db: AsyncSession,
    policy_id: uuid.UUID,
    user_id: uuid.UUID,
    change_summary: str = "",
) -> PolicyVersion:
    """Create a new version snapshot from the current document_structure."""
    policy = await db.get(PolicyMetadata, policy_id)
    if not policy:
        raise ValueError("Policy not found")

    # Check if current version is locked
    latest_version = await _get_latest_version(db, policy_id)
    if latest_version and latest_version.is_locked:
        raise ValueError("Current version is locked (approved). Cannot create a new snapshot of a locked version.")

    collection = policy_documents_collection()

    # Fetch latest document_structure from MongoDB
    current_doc = await collection.find_one(
        {"policy_id": str(policy_id)},
        sort=[("version", -1)],
    )

    # Create snapshot copy in MongoDB
    snapshot_id = None
    if current_doc:
        snapshot_doc = {
            "policy_id": str(policy_id),
            "version": policy.current_version,
            "document_structure": current_doc.get("document_structure", {}),
            "is_snapshot": True,
            "created_at": datetime.utcnow(),
        }
        result = await collection.insert_one(snapshot_doc)
        snapshot_id = str(result.inserted_id)

    # Create version record in PostgreSQL
    version = PolicyVersion(
        policy_id=policy_id,
        version_number=policy.current_version,
        mongo_snapshot_id=snapshot_id,
        change_summary=change_summary,
        created_by=user_id,
    )
    db.add(version)

    # Increment version counter
    policy.current_version += 1
    policy.updated_at = datetime.utcnow()
    await db.flush()

    return version


async def list_versions(db: AsyncSession, policy_id: uuid.UUID) -> List[PolicyVersion]:
    """List all versions of a policy, newest first."""
    result = await db.execute(
        select(PolicyVersion)
        .where(PolicyVersion.policy_id == policy_id)
        .order_by(PolicyVersion.version_number.desc())
    )
    return list(result.scalars().all())


async def get_version(
    db: AsyncSession, policy_id: uuid.UUID, version_number: int
) -> Optional[PolicyVersion]:
    """Get a specific version record."""
    result = await db.execute(
        select(PolicyVersion).where(
            PolicyVersion.policy_id == policy_id,
            PolicyVersion.version_number == version_number,
        )
    )
    return result.scalar_one_or_none()


async def get_version_detail(
    db: AsyncSession, policy_id: uuid.UUID, version_number: int
) -> dict:
    """Get a version with its full document_structure from MongoDB."""
    version = await get_version(db, policy_id, version_number)
    if not version:
        raise ValueError("Version not found")

    structure = None
    if version.mongo_snapshot_id:
        collection = policy_documents_collection()
        doc = await collection.find_one({"_id": ObjectId(version.mongo_snapshot_id)})
        if doc:
            structure = doc.get("document_structure", {})

    return {
        "id": version.id,
        "policy_id": version.policy_id,
        "version_number": version.version_number,
        "change_summary": version.change_summary,
        "created_by": version.created_by,
        "created_at": version.created_at,
        "is_locked": version.is_locked,
        "approved_at": version.approved_at,
        "approved_by": version.approved_by,
        "document_structure": structure,
    }


# ═══════════════════════════════════════════════════════════════════
#  Compare — Structural diff + AI analysis
# ═══════════════════════════════════════════════════════════════════

async def compare_versions(
    db: AsyncSession, policy_id: uuid.UUID, base_v: int, compare_v: int
) -> dict:
    """Compare two versions: compute structural diff, then send to AI for analysis.
    No static interpretation — AI provides risk direction, summary, critical changes.
    """
    base = await get_version(db, policy_id, base_v)
    compare = await get_version(db, policy_id, compare_v)

    collection = policy_documents_collection()
    base_structure = None
    compare_structure = None

    if base and base.mongo_snapshot_id:
        doc = await collection.find_one({"_id": ObjectId(base.mongo_snapshot_id)})
        if doc:
            base_structure = doc.get("document_structure", {})

    if compare and compare.mongo_snapshot_id:
        doc = await collection.find_one({"_id": ObjectId(compare.mongo_snapshot_id)})
        if doc:
            compare_structure = doc.get("document_structure", {})

    # Step 1: Compute structural diff (kept)
    changes = _compute_diff(base_structure, compare_structure, base_v, compare_v)

    # Step 2: AI analysis of the diff (NO fallback)
    ai_analysis = await _ai_analyze_diff(
        changes, base_structure, compare_structure, base_v, compare_v
    )

    return {
        "base_version": base_v,
        "compare_version": compare_v,
        "base_structure": base_structure,
        "compare_structure": compare_structure,
        "changes": changes,
        "ai_analysis": ai_analysis,
    }


# ═══════════════════════════════════════════════════════════════════
#  Lock / Rollback (preserved)
# ═══════════════════════════════════════════════════════════════════

async def lock_version(
    db: AsyncSession, policy_id: uuid.UUID, version_number: int, user_id: uuid.UUID
) -> PolicyVersion:
    """Lock a version after approval — prevents any further edits."""
    version = await get_version(db, policy_id, version_number)
    if not version:
        raise ValueError("Version not found")
    if version.is_locked:
        raise ValueError("Version is already locked")

    version.is_locked = True
    version.approved_at = datetime.utcnow()
    version.approved_by = user_id

    await db.flush()
    return version


async def rollback_to_version(
    db: AsyncSession, policy_id: uuid.UUID, version_number: int, user_id: uuid.UUID
) -> PolicyVersion:
    """Rollback policy to a previous version. Creates a new version from the old snapshot."""
    policy = await db.get(PolicyMetadata, policy_id)
    if not policy:
        raise ValueError("Policy not found")

    # Cannot rollback to a locked version's source if current is locked
    latest_version = await _get_latest_version(db, policy_id)
    if latest_version and latest_version.is_locked:
        raise ValueError("Current version is locked (approved). Cannot modify.")

    # Find the source version
    source = await get_version(db, policy_id, version_number)
    if not source or not source.mongo_snapshot_id:
        raise ValueError("Version snapshot not found")

    collection = policy_documents_collection()

    # Get the snapshot document_structure
    snapshot = await collection.find_one({"_id": ObjectId(source.mongo_snapshot_id)})
    if not snapshot:
        raise ValueError("Snapshot data not found in MongoDB")

    # Update the live document with the old structure
    live_doc = await collection.find_one(
        {"policy_id": str(policy_id), "is_snapshot": {"$ne": True}},
        sort=[("version", -1)],
    )

    if live_doc:
        await collection.update_one(
            {"_id": live_doc["_id"]},
            {"$set": {
                "document_structure": snapshot.get("document_structure", {}),
                "version": policy.current_version,
                "updated_at": datetime.utcnow(),
            }},
        )

    # Create a new version record for the rollback
    rollback = PolicyVersion(
        policy_id=policy_id,
        version_number=policy.current_version,
        mongo_snapshot_id=source.mongo_snapshot_id,
        change_summary=f"Rollback to v{version_number}",
        created_by=user_id,
    )
    db.add(rollback)
    policy.current_version += 1
    policy.updated_at = datetime.utcnow()
    await db.flush()

    return rollback


# ═══════════════════════════════════════════════════════════════════
#  Internal helpers
# ═══════════════════════════════════════════════════════════════════

async def _get_latest_version(
    db: AsyncSession, policy_id: uuid.UUID
) -> Optional[PolicyVersion]:
    """Get the most recent version for a policy."""
    result = await db.execute(
        select(PolicyVersion)
        .where(PolicyVersion.policy_id == policy_id)
        .order_by(PolicyVersion.version_number.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


def _compute_diff(base: dict, compare: dict, base_v: int, compare_v: int) -> list:
    """Compute a high-level structural diff between two document_structures.
    This is the raw diff — AI interprets it in _ai_analyze_diff.
    """
    changes = []
    if not base and not compare:
        return changes
    if not base:
        changes.append({"type": "added", "path": "document_structure", "detail": f"Entire structure added in v{compare_v}"})
        return changes
    if not compare:
        changes.append({"type": "removed", "path": "document_structure", "detail": f"Entire structure removed in v{compare_v}"})
        return changes

    # Compare header
    bh = base.get("header", {})
    ch = compare.get("header", {})
    for key in set(list(bh.keys()) + list(ch.keys())):
        if bh.get(key) != ch.get(key):
            changes.append({"type": "modified", "path": f"header.{key}", "detail": f"'{bh.get(key, '')}' → '{ch.get(key, '')}'"})

    # Compare sections
    base_sections = base.get("sections", [])
    comp_sections = compare.get("sections", [])

    base_titles = {s.get("title", ""): s for s in base_sections}
    comp_titles = {s.get("title", ""): s for s in comp_sections}

    for title in comp_titles:
        if title not in base_titles:
            changes.append({"type": "added", "path": "sections", "detail": f"Section '{title}' added"})

    for title in base_titles:
        if title not in comp_titles:
            changes.append({"type": "removed", "path": "sections", "detail": f"Section '{title}' removed"})

    for title in base_titles:
        if title in comp_titles:
            bs = base_titles[title]
            cs = comp_titles[title]
            b_subs = len(bs.get("subsections", []))
            c_subs = len(cs.get("subsections", []))
            if b_subs != c_subs:
                changes.append({"type": "modified", "path": f"sections.{title}", "detail": f"Subsections: {b_subs} → {c_subs}"})

    if not changes:
        changes.append({"type": "unchanged", "path": "document_structure", "detail": "No structural changes detected"})

    return changes


async def _ai_analyze_diff(
    structural_diff: list,
    base_structure: dict,
    compare_structure: dict,
    base_v: int,
    compare_v: int,
) -> dict:
    """Send structural diff to AI for risk/compliance analysis.
    Raises on failure — NO fallback, NO static interpretation.
    """
    try:
        analysis = await ai_version_service.analyze_version_diff(
            structural_diff=structural_diff,
            base_structure=base_structure or {},
            compare_structure=compare_structure or {},
            base_version=base_v,
            compare_version=compare_v,
        )
        return analysis
    except AIProviderError as exc:
        logger.error(
            "AI version analysis failed",
            extra={"event": "ai_version_analysis_error", "error": str(exc)},
        )
        raise HTTPException(
            status_code=500,
            detail="AI version analysis failed. Cannot provide diff interpretation.",
        )
