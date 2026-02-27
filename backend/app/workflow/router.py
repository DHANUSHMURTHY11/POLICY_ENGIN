"""
Workflow API endpoints — AI-Assisted configurable hierarchy-based approval engine.
All templates must pass AI validation. No silent auto-approval.
"""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.postgresql import get_db
from app.middleware.auth_middleware import get_current_user, require_role
from app.workflow import service
from app.workflow.schemas import (
    TemplateCreate, NaturalTemplateCreate,
    TemplateResponse, TemplateListResponse,
    SubmitRequest, ActionRequest,
    InstanceResponse, LevelSchema, ActionResponse,
    ApprovalQueueResponse, ApprovalQueueItem,
    AITemplateValidation, AIApprovalSummary,
    RoleItem,
)

router = APIRouter()


# ═══════════════════════════════════════════════════════════════════
#  Template CRUD — AI-validated
# ═══════════════════════════════════════════════════════════════════

@router.post("/templates", response_model=TemplateResponse, status_code=201)
async def create_template(
    data: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role("admin")),
):
    """Create a new workflow template. AI validation is mandatory."""
    try:
        levels_dicts = [
            {
                "level_number": l.level_number,
                "role_id": str(l.role_id),
                "role_name": l.role_name or "",
                "is_parallel": l.is_parallel,
            }
            for l in data.levels
        ]
        result = await service.create_template(
            db, data.name, data.type, levels_dicts, current_user["user_id"]
        )
        resp = _template_to_response(result["template"])
        resp.ai_validation = result.get("ai_validation")
        return resp
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/templates/natural", response_model=TemplateResponse, status_code=201)
async def create_template_natural(
    data: NaturalTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role("admin")),
):
    """Create a workflow template from natural language description.
    e.g. "Manager → Risk → Director → Committee"
    """
    try:
        result = await service.create_template_from_natural(
            db, data.description, current_user["user_id"]
        )
        resp = _template_to_response(result["template"])
        resp.ai_validation = result.get("ai_validation")
        return resp
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/templates/validate", response_model=AITemplateValidation)
async def validate_template(
    data: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """AI-validate a template without saving."""
    try:
        levels_dicts = [
            {
                "level_number": l.level_number,
                "role_id": str(l.role_id),
                "role_name": l.role_name or "",
                "is_parallel": l.is_parallel,
            }
            for l in data.levels
        ]
        result = await service.validate_template_only(levels_dicts)
        return AITemplateValidation(**result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/templates", response_model=TemplateListResponse)
async def list_templates(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List all workflow templates."""
    templates = await service.list_templates(db)
    items = [_template_to_response(t) for t in templates]
    return TemplateListResponse(templates=items, total=len(items))


@router.get("/templates/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get a specific workflow template."""
    try:
        template = await service.get_template(db, template_id)
        return _template_to_response(template)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/templates/{template_id}", status_code=204)
async def delete_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_role("admin")),
):
    """Delete (deactivate) a workflow template."""
    try:
        await service.delete_template(db, template_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ═══════════════════════════════════════════════════════════════════
#  Submit / Approve / Reject
# ═══════════════════════════════════════════════════════════════════

@router.post("/{policy_id}/submit", response_model=InstanceResponse)
async def submit_for_approval(
    policy_id: UUID,
    data: SubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Submit a policy for approval. Locks editing."""
    try:
        instance = await service.submit_for_approval(
            db, policy_id, data.template_id, current_user["user_id"], data.comments
        )
        template = await service.get_template(db, instance.template_id)
        return _instance_to_response(instance, template)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/instances/{instance_id}/approve", response_model=InstanceResponse)
async def approve_action(
    instance_id: UUID,
    data: ActionRequest = ActionRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Approve at the current workflow level. No silent auto-approval."""
    try:
        instance = await service.approve_action(
            db, instance_id, current_user["user_id"], data.comments
        )
        template = await service.get_template(db, instance.template_id)
        return _instance_to_response(instance, template)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/instances/{instance_id}/reject", response_model=InstanceResponse)
async def reject_action(
    instance_id: UUID,
    data: ActionRequest = ActionRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Reject at any workflow level — ends the workflow. Unlocks policy."""
    try:
        instance = await service.reject_action(
            db, instance_id, current_user["user_id"], data.comments
        )
        template = await service.get_template(db, instance.template_id)
        return _instance_to_response(instance, template)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ═══════════════════════════════════════════════════════════════════
#  Status, Queue & AI Summary
# ═══════════════════════════════════════════════════════════════════

@router.get("/{policy_id}/status", response_model=InstanceResponse)
async def get_status(
    policy_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get latest workflow instance status for a policy."""
    instance = await service.get_instance_status(db, policy_id)
    if not instance:
        raise HTTPException(status_code=404, detail="No workflow found for this policy")
    template = await service.get_template(db, instance.template_id)
    return _instance_to_response(instance, template)


@router.get("/{policy_id}/approval-summary", response_model=AIApprovalSummary)
async def get_approval_summary(
    policy_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """AI-generated risk summary for validators before approval.
    Shows: risk impact, severity, direction (stricter/looser/neutral).
    """
    try:
        summary = await service.get_approval_summary(db, policy_id)
        return AIApprovalSummary(**summary)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/queue", response_model=ApprovalQueueResponse)
async def get_queue(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get all policies in the approval queue."""
    items = await service.get_approval_queue(db)
    return ApprovalQueueResponse(
        items=[ApprovalQueueItem(**it) for it in items],
        total=len(items),
    )


@router.get("/roles")
async def list_roles(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List available roles for the workflow builder."""
    roles = await service.list_roles(db)
    return [RoleItem.model_validate(r) for r in roles]


# ═══════════════════════════════════════════════════════════════════
#  Response builders
# ═══════════════════════════════════════════════════════════════════

def _template_to_response(template) -> TemplateResponse:
    return TemplateResponse(
        id=template.id,
        name=template.name,
        type=template.type,
        created_by=template.created_by,
        is_active=template.is_active,
        created_at=template.created_at,
        levels=[
            LevelSchema(
                level_number=l.level_number,
                role_id=l.role_id,
                role_name=l.role_name or "",
                is_parallel=l.is_parallel,
            )
            for l in (template.levels or [])
        ],
    )


def _instance_to_response(instance, template=None) -> InstanceResponse:
    levels = []
    total = 0
    tpl_name = None
    tpl_type = None
    if template:
        total = len(template.levels)
        tpl_name = template.name
        tpl_type = template.type
        levels = [
            LevelSchema(
                level_number=l.level_number,
                role_id=l.role_id,
                role_name=l.role_name or "",
                is_parallel=l.is_parallel,
            )
            for l in (template.levels or [])
        ]

    return InstanceResponse(
        id=instance.id,
        policy_id=instance.policy_id,
        template_id=instance.template_id,
        template_name=tpl_name,
        template_type=tpl_type,
        current_level=instance.current_level,
        total_levels=total,
        status=instance.status,
        submitted_by=instance.submitted_by,
        created_at=instance.created_at,
        updated_at=instance.updated_at,
        actions=[
            ActionResponse.model_validate(a) for a in (instance.actions or [])
        ],
        levels=levels,
    )
