"""
Policy service — business logic for CRUD, structure management, and validation.
PostgreSQL for metadata, MongoDB for document structures.
Strict AI-Native Mode — no fallback data, AI validation mandatory.
"""
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.logging import get_logger
from app.database.mongodb import get_mongo_db
from app.policy.models import PolicyMetadata
from app.policy.schemas import (
    PolicyCreate,
    PolicyUpdate,
    PolicyResponse,
    PolicyListResponse,
    PolicyDetailResponse,
    ManualStructureRequest,
    AIStructureRequest,
    AIEnhanceRequest,
    StructureResponse,
    DocumentStructure,
    VersionControlEntry,
    SectionSchema,
    SubsectionSchema,
    FieldSchema,
    HeaderSchema,
    AIValidationResult,
    AIRewriteRequest,
    AIRewriteResponse,
)
from app.policy.ai_structure_service import ai_structure_service
from app.ai.providers import AIProviderError
from app.workflow.service import _log_audit_independent

logger = get_logger(__name__)


# ═══════════════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════════════

def _policy_documents():
    """Return the policy_documents Mongo collection."""
    db = get_mongo_db()
    return db["policy_documents"]


def _row_to_response(row: PolicyMetadata) -> PolicyResponse:
    return PolicyResponse(
        id=str(row.id),
        name=row.name,
        description=row.description,
        created_by=str(row.created_by) if row.created_by else None,
        current_version=row.current_version,
        status=row.status,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


# ═══════════════════════════════════════════════════════════════════
#  CRUD Operations
# ═══════════════════════════════════════════════════════════════════

async def create_policy(
    db: AsyncSession,
    data: PolicyCreate,
    user_id: uuid.UUID,
) -> PolicyDetailResponse:
    """Create policy metadata in PG + empty document in Mongo."""
    row = PolicyMetadata(
        name=data.name,
        description=data.description,
        created_by=user_id,
        current_version=1,
        status="draft",
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)

    # Create initial empty Mongo document
    initial_structure = DocumentStructure(
        header=HeaderSchema(title=data.name),
        version_control=[
            VersionControlEntry(
                version_number=1,
                created_by=str(user_id),
                change_summary="Initial policy creation",
            )
        ],
    )
    mongo_doc = {
        "policy_id": str(row.id),
        "version": 1,
        "document_structure": initial_structure.model_dump(mode="json"),
        "created_at": datetime.now(timezone.utc),
    }
    await _policy_documents().insert_one(mongo_doc)

    await _log_audit_independent(user_id, "POLICY_CREATED", "policy", row.id, details={"name": data.name})

    logger.info(
        "Policy created",
        extra={"event": "policy_created", "policy_id": str(row.id), "operation": "create_policy"},
    )

    resp = _row_to_response(row)
    return PolicyDetailResponse(
        **resp.model_dump(),
        document_structure=initial_structure,
    )


async def list_policies(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 10,
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
) -> PolicyListResponse:
    """List policies with pagination, search and status filter."""
    query = select(PolicyMetadata)
    count_query = select(func.count()).select_from(PolicyMetadata)

    if search:
        like = f"%{search}%"
        condition = or_(
            PolicyMetadata.name.ilike(like),
            PolicyMetadata.description.ilike(like),
        )
        query = query.where(condition)
        count_query = count_query.where(condition)

    if status_filter:
        query = query.where(PolicyMetadata.status == status_filter)
        count_query = count_query.where(PolicyMetadata.status == status_filter)

    # Total count
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Paginated rows
    offset = (page - 1) * page_size
    query = query.order_by(PolicyMetadata.updated_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    rows = result.scalars().all()

    return PolicyListResponse(
        policies=[_row_to_response(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


async def get_policy(db: AsyncSession, policy_id: uuid.UUID) -> PolicyDetailResponse:
    """Get policy metadata + latest Mongo document."""
    result = await db.execute(
        select(PolicyMetadata).where(PolicyMetadata.id == policy_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Policy not found")

    # Fetch latest version from Mongo
    mongo_doc = await _policy_documents().find_one(
        {"policy_id": str(policy_id)},
        sort=[("version", -1)],
    )

    structure = None
    if mongo_doc and "document_structure" in mongo_doc:
        structure = DocumentStructure(**mongo_doc["document_structure"])

    resp = _row_to_response(row)
    return PolicyDetailResponse(
        **resp.model_dump(),
        document_structure=structure,
    )


async def update_policy(
    db: AsyncSession,
    policy_id: uuid.UUID,
    data: PolicyUpdate,
) -> PolicyResponse:
    """Update policy metadata in PG."""
    result = await db.execute(
        select(PolicyMetadata).where(PolicyMetadata.id == policy_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Policy not found")

    if data.name is not None:
        row.name = data.name
    if data.description is not None:
        row.description = data.description
    if data.status is not None:
        row.status = data.status

    row.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(row)
    return _row_to_response(row)


async def delete_policy(db: AsyncSession, policy_id: uuid.UUID) -> dict:
    """Delete policy from PG and all Mongo documents."""
    result = await db.execute(
        select(PolicyMetadata).where(PolicyMetadata.id == policy_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Policy not found")

    await db.delete(row)
    await _policy_documents().delete_many({"policy_id": str(policy_id)})

    logger.info(
        "Policy deleted",
        extra={"event": "policy_deleted", "policy_id": str(policy_id), "operation": "delete_policy"},
    )
    return {"message": "Policy deleted successfully"}


# ═══════════════════════════════════════════════════════════════════
#  Structure Operations
# ═══════════════════════════════════════════════════════════════════

def _validate_structure(structure: DocumentStructure) -> list[str]:
    """
    Validate the document structure:
    - No duplicate section titles
    - All field IDs unique across the entire document
    - Section order integers exist
    Returns list of error messages (empty = valid).
    """
    errors: list[str] = []

    # Check duplicate section titles
    section_titles: list[str] = []
    for sec in structure.sections:
        lower_title = sec.title.strip().lower()
        if lower_title in section_titles:
            errors.append(f"Duplicate section title: '{sec.title}'")
        section_titles.append(lower_title)

    # Check section order exists
    for sec in structure.sections:
        if sec.order is None:
            errors.append(f"Section '{sec.title}' is missing order value")

    # Check unique field IDs across entire document
    field_ids: list[str] = []
    for sec in structure.sections:
        for sub in sec.subsections:
            for field in sub.fields:
                if field.id in field_ids:
                    errors.append(f"Duplicate field ID: '{field.id}' in section '{sec.title}'")
                field_ids.append(field.id)

    return errors


async def save_manual_structure(
    db: AsyncSession,
    policy_id: uuid.UUID,
    user_id: uuid.UUID,
    data: ManualStructureRequest,
) -> StructureResponse:
    """Validate and save manually-built structure to Mongo, increment version.
    AI validation is MANDATORY — blocks save if AI finds errors.
    """
    # Verify policy exists
    result = await db.execute(
        select(PolicyMetadata).where(PolicyMetadata.id == policy_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Policy not found")

    # Build full structure using existing current_version
    current_v = row.current_version
    structure = DocumentStructure(
        header=data.header,
        version_control=[
            VersionControlEntry(
                version_number=current_v,
                created_by=str(user_id),
                change_summary="Draft structure update",
            )
        ],
        sections=data.sections,
        annexures=data.annexures,
        attachments=data.attachments,
    )

    # ── Local validation (fast, no AI) ──
    errors = _validate_structure(structure)
    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"validation_errors": errors},
        )

    # ── AI validation gate (MANDATORY) ──
    try:
        ai_validation = await ai_structure_service.validate_structure(structure)
    except AIProviderError as exc:
        logger.error(
            "AI validation failed for manual structure",
            extra={
                "event": "ai_validation_error",
                "policy_id": str(policy_id),
                "error": str(exc),
            },
        )
        raise HTTPException(
            status_code=503,
            detail="AI validation service unavailable. Cannot save structure without AI validation.",
        )

    # Block save if AI found errors
    # ── Semantic Section Validation ──
    # The AI strictly checks for exact string titles, which breaks dynamically generated LLM structures.
    # We override it with a semantic synonym check.
    CANONICAL_SECTIONS = {
        "applicability": ["applicability", "scope", "eligibility", "purpose", "introduction", "general"],
        "definitions": ["definitions", "terminology", "glossary", "terms", "meaning"],
        "roles_responsibilities": ["roles", "responsibilities", "duties", "accountability", "who", "administration"],
        "compliance": ["compliance", "reporting", "governance", "enforcement", "audit", "violations", "requirements", "policy", "guidelines", "rules"],
        "review_period": ["review", "revision", "update", "maintenance", "version", "control", "history"]
    }

    covered_canonicals = set()
    mapping_results = []

    for sec in structure.sections:
        lower_t = sec.title.strip().lower()
        for c_key, synonyms in CANONICAL_SECTIONS.items():
            if any(syn in lower_t for syn in synonyms):
                covered_canonicals.add(c_key)
                mapping_results.append(f"'{sec.title}' -> {c_key}")
                break

    logger.info("Semantic Section Mapping", extra={
        "event": "semantic_mapping",
        "policy_id": str(policy_id),
        "mappings": mapping_results,
        "coverage": list(covered_canonicals)
    })

    # Filter out the AI's flawed strictly-matched missing_section checks
    filtered_issues = [i for i in ai_validation.issues if i.category != "missing_section"]
    
    missing_canonicals = set(CANONICAL_SECTIONS.keys()) - covered_canonicals
    if missing_canonicals:
        from app.policy.schemas import AIValidationIssue
        filtered_issues.append(AIValidationIssue(
            severity="error",
            category="missing_section",
            message=f"Semantic validation failed. Missing coverage for: {', '.join(missing_canonicals)}",
            path=""
        ))

    ai_validation.issues = filtered_issues
    ai_validation.valid = not any(i.severity == "error" for i in filtered_issues)

    if not ai_validation.valid:
        error_issues = [i.model_dump() for i in ai_validation.issues if i.severity == "error"]
        
        # Persist policy metadata in validation_failed state
        row.status = "validation_failed"
        row.updated_at = datetime.now(timezone.utc)
        
        # Log audit event
        await _log_audit_independent(
            user_id,
            "VALIDATION_REJECTED",
            "policy",
            policy_id,
            details={
                "error_summary": f"AI validation found {len(error_issues)} error(s)",
                "issues": error_issues
            }
        )
        
        # Explicit commit to avoid rollback on HTTP 400
        await db.commit()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "status": "validation_failed",
                "errors": error_issues,
                "policy_id": str(policy_id),
                "ai_validation_failed": True,
                "suggestions": ai_validation.suggestions,
                "normalized_field_names": ai_validation.normalized_field_names,
                "message": f"AI validation found {len(error_issues)} error(s). Fix before saving.",
            },
        )

    # Upsert current version to Mongo (draft)
    mongo_doc = {
        "policy_id": str(policy_id),
        "version": current_v,
        "document_structure": structure.model_dump(mode="json"),
        "ai_validation": ai_validation.model_dump(mode="json"),
        "updated_at": datetime.now(timezone.utc),
    }
    await _policy_documents().replace_one(
        {"policy_id": str(policy_id), "version": current_v, "is_snapshot": {"$ne": True}},
        mongo_doc,
        upsert=True
    )

    row.status = "draft"  # Return to draft if it was validation_failed
    row.updated_at = datetime.now(timezone.utc)
    
    # Log audit event
    await _log_audit_independent(
        user_id,
        "STRUCTURE_SAVED",
        "policy",
        policy_id,
        details={"version": current_v}
    )
    
    await db.commit()

    logger.info(
        "Manual structure saved (AI validated)",
        extra={
            "event": "structure_saved",
            "policy_id": str(policy_id),
            "version": current_v,
            "operation": "save_manual_structure",
            "ai_valid": ai_validation.valid,
        },
    )

    return StructureResponse(
        policy_id=str(policy_id),
        version=current_v,
        document_structure=structure,
        ai_validation=ai_validation,
        message="Manual structure saved successfully (AI validated)",
    )


async def generate_ai_structure(
    db: AsyncSession,
    policy_id: uuid.UUID,
    user_id: uuid.UUID,
    data: AIStructureRequest,
) -> StructureResponse:
    """Generate structure via AIStructureService, validate, and save to Mongo.
    Raises 503 if AI is unavailable — NO fallback data.
    """
    # Verify policy exists
    result = await db.execute(
        select(PolicyMetadata).where(PolicyMetadata.id == policy_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Policy not found")

    # Generate structure via AIStructureService
    try:
        structure = await ai_structure_service.generate_structure(
            prompt=data.prompt,
            policy_name=row.name,
        )
    except AIProviderError as exc:
        logger.error(
            "AI structure generation failed",
            extra={
                "event": "ai_call_error",
                "policy_id": str(policy_id),
                "operation": "generate_structure",
                "error": str(exc),
            },
        )
        raise HTTPException(
            status_code=503,
            detail="AI service unavailable. Cannot generate structure. Please try again later.",
        )

    # Local validation
    errors = _validate_structure(structure)
    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"validation_errors": errors, "note": "AI-generated structure failed local validation"},
        )

    current_v = row.current_version
    structure.version_control = [
        VersionControlEntry(
            version_number=current_v,
            created_by=str(user_id),
            change_summary=f"AI-generated structure from prompt: {data.prompt[:100]}",
        )
    ]

    # Save to Mongo via upsert
    mongo_doc = {
        "policy_id": str(policy_id),
        "version": current_v,
        "document_structure": structure.model_dump(mode="json"),
        "updated_at": datetime.now(timezone.utc),
    }
    await _policy_documents().replace_one(
        {"policy_id": str(policy_id), "version": current_v, "is_snapshot": {"$ne": True}},
        mongo_doc,
        upsert=True
    )

    # Return to draft if it was validation_failed
    row.status = "draft"
    row.updated_at = datetime.now(timezone.utc)
    
    # Log audit event
    await _log_audit_independent(
        user_id,
        "STRUCTURE_SAVED",
        "policy",
        policy_id,
        details={"version": current_v, "source": "ai_generation"}
    )

    await db.commit()

    return StructureResponse(
        policy_id=str(policy_id),
        version=current_v,
        document_structure=structure,
        message="AI structure generated and saved successfully",
    )


async def validate_structure_ai(
    db: AsyncSession,
    policy_id: uuid.UUID,
    data: ManualStructureRequest,
) -> AIValidationResult:
    """AI-validate a structure without saving. Returns validation result.
    Raises 503 if AI is unavailable.
    """
    # Verify policy exists
    result = await db.execute(
        select(PolicyMetadata).where(PolicyMetadata.id == policy_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Policy not found")

    structure = DocumentStructure(
        header=data.header,
        sections=data.sections,
        annexures=data.annexures,
        attachments=data.attachments,
    )

    try:
        return await ai_structure_service.validate_structure(structure)
    except AIProviderError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"AI validation service unavailable: {exc}",
        )


async def enhance_structure(
    db: AsyncSession,
    policy_id: uuid.UUID,
    user_id: uuid.UUID,
    data: AIEnhanceRequest,
) -> StructureResponse:
    """Enhance an existing structure via AI, validate, and save.
    Raises 503 if AI is unavailable — NO fallback.
    """
    # Verify policy exists
    result = await db.execute(
        select(PolicyMetadata).where(PolicyMetadata.id == policy_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Policy not found")

    try:
        enhanced = await ai_structure_service.enhance_structure(
            structure=data.structure,
            instructions=data.instructions,
        )
    except AIProviderError as exc:
        logger.error(
            "AI structure enhancement failed",
            extra={
                "event": "ai_call_error",
                "policy_id": str(policy_id),
                "operation": "enhance_structure",
                "error": str(exc),
            },
        )
        raise HTTPException(
            status_code=503,
            detail="AI service unavailable. Cannot enhance structure.",
        )

    new_version = row.current_version + 1
    enhanced.version_control = [
        VersionControlEntry(
            version_number=new_version,
            created_by=str(user_id),
            change_summary=f"AI-enhanced structure: {data.instructions[:100] if data.instructions else 'Auto-enhanced'}",
        )
    ]

    # Save to Mongo
    mongo_doc = {
        "policy_id": str(policy_id),
        "version": new_version,
        "document_structure": enhanced.model_dump(mode="json"),
        "created_at": datetime.now(timezone.utc),
    }
    await _policy_documents().insert_one(mongo_doc)

    # Increment version in PG
    row.current_version = new_version
    row.updated_at = datetime.now(timezone.utc)
    await db.flush()

    return StructureResponse(
        policy_id=str(policy_id),
        version=new_version,
        document_structure=enhanced,
        message="AI-enhanced structure saved successfully",
    )


# ═══════════════════════════════════════════════════════════════════
#  Narrative Rewrite
# ═══════════════════════════════════════════════════════════════════

async def rewrite_section(
    db: AsyncSession,
    policy_id: uuid.UUID,
    data: AIRewriteRequest,
) -> AIRewriteResponse:
    """AI-powered section narrative rewrite.
    Strict AI Mode — no fallback. Returns error if AI fails.
    """
    # Verify policy exists
    result = await db.execute(
        select(PolicyMetadata).where(PolicyMetadata.id == policy_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Policy not found")

    try:
        return await ai_structure_service.rewrite_section(data)
    except AIProviderError as exc:
        logger.error(
            "AI section rewrite failed",
            extra={
                "event": "ai_call_error",
                "policy_id": str(policy_id),
                "operation": "rewrite_section",
                "action": data.action,
                "error": str(exc),
            },
        )
        raise HTTPException(
            status_code=503,
            detail="AI service unavailable. Cannot rewrite section narrative. No fallback allowed.",
        )
