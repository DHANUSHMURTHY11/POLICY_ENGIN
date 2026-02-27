"""
Document Composer API endpoints — Word, PDF, JSON generation.
Strict AI Document Mode — all generation gated by policy approval + AI composition.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select
from app.database.postgresql import get_db
from app.database.mongodb import get_mongo_db
from app.middleware.auth_middleware import get_current_user
from app.document import service
from app.policy.models import PolicyMetadata
from app.workflow.service import _log_audit_independent

router = APIRouter()

async def _check_validated_structure(db: AsyncSession, policy_id: uuid.UUID):
    result = await db.execute(select(PolicyMetadata).where(PolicyMetadata.id == policy_id))
    policy = result.scalar_one_or_none()
    if not policy or policy.status == "validation_failed":
        raise HTTPException(status_code=404, detail="No validated structure found. Cannot generate document.")
        
    db_mongo = get_mongo_db()
    mongo_doc = await db_mongo["policy_documents"].find_one(
        {"policy_id": str(policy_id)}, sort=[("version", -1)]
    )
    if not mongo_doc or "document_structure" not in mongo_doc:
        raise HTTPException(status_code=404, detail="No validated structure found. Cannot generate document.")



@router.post("/{policy_id}/word")
async def generate_word(
    policy_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Generate Word document from AI-composed policy content.
    Requires: policy approved. AI composes narratives from structure.
    """
    pid = str(policy_id)
    try:
        await _check_validated_structure(db, policy_id)
        filepath = await service.generate_word(db, pid, f"Policy_{str(policy_id)[:8]}")
        await _log_audit_independent(
            current_user["user_id"], "DOCUMENT_GENERATED", "policy", policy_id, details={"format": "word"}
        )
        return FileResponse(
            filepath,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=filepath.split("/")[-1].split("\\")[-1],
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Word generation failed: {str(e)}")


@router.post("/{policy_id}/pdf")
async def generate_pdf(
    policy_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Generate PDF from AI-composed policy content.
    Requires: policy approved. AI composes narratives from structure.
    """
    pid = str(policy_id)
    try:
        await _check_validated_structure(db, policy_id)
        filepath = await service.generate_pdf(db, pid, f"Policy_{str(policy_id)[:8]}")
        await _log_audit_independent(
            current_user["user_id"], "DOCUMENT_GENERATED", "policy", policy_id, details={"format": "pdf"}
        )
        return FileResponse(
            filepath,
            media_type="application/pdf",
            filename=filepath.split("/")[-1].split("\\")[-1],
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")


@router.post("/{policy_id}/json")
async def generate_json(
    policy_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Export the policy structure as formatted JSON.
    Requires: policy approved.
    """
    pid = str(policy_id)
    try:
        await _check_validated_structure(db, policy_id)
        filepath = await service.generate_json_export(db, pid, f"Policy_{str(policy_id)[:8]}")
        await _log_audit_independent(
            current_user["user_id"], "DOCUMENT_GENERATED", "policy", policy_id, details={"format": "json"}
        )
        return FileResponse(
            filepath,
            media_type="application/json",
            filename=filepath.split("/")[-1].split("\\")[-1],
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"JSON export failed: {str(e)}")
