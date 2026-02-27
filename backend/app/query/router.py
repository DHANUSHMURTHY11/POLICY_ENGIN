"""
Policy Runtime Engine API — POST /policies/{id}/query
"""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.postgresql import get_db
from app.middleware.auth_middleware import get_current_user
from app.query import service
from app.query.schemas import QueryRequest, QueryResponse
from app.policy.models import PolicyMetadata
from sqlalchemy import select
from fastapi.responses import JSONResponse

router = APIRouter()


@router.post("/policies/{policy_id}/query", response_model=QueryResponse)
async def query_policy(
    policy_id: UUID,
    request: QueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Execute a user query against an approved policy's rules.
    Returns decision, rule evaluations, reasoning trace, and AI analysis.
    """
    # Pre-check: Ensure policy is approved and locked
    result = await db.execute(select(PolicyMetadata).where(PolicyMetadata.id == policy_id))
    policy = result.scalar_one_or_none()
    
    if not policy or policy.status != "approved" or not policy.is_locked:
        return JSONResponse(
            status_code=400, 
            content={"error": "Cannot query unapproved or unlocked policy."}
        )

    try:
        result = await service.execute_query(db, policy_id, request)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query execution error: {str(e)}")
