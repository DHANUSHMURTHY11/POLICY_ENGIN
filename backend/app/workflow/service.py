"""
Workflow Engine service — AI-assisted configurable hierarchy-based approval logic.
Supports sequential, parallel, and committee-level approvals via templates.
All templates must pass AI validation before activation.
No silent auto-approval. Maker-checker enforced.
"""
import json
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.postgresql import AsyncSessionLocal
from app.core.logging import get_logger
from app.workflow.models import (
    ApprovalWorkflowTemplate,
    WorkflowLevel,
    PolicyWorkflowInstance,
    WorkflowAction,
    AuditLog,
)
from app.policy.models import PolicyMetadata
from app.auth.models import Role, User
from app.workflow.ai_workflow_service import ai_workflow_service
from app.ai.providers import AIProviderError

logger = get_logger(__name__)


# ═══════════════════════════════════════════════════════════════════
#  Template CRUD — AI-validated
# ═══════════════════════════════════════════════════════════════════

async def create_template(
    db: AsyncSession,
    name: str,
    wf_type: str,
    levels_data: list,
    user_id: uuid.UUID,
) -> dict:
    """Create a new workflow template with ordered levels.
    AI validation is MANDATORY — blocks creation if critical issues found.
    Maker-checker enforced: minimum 1 level required.
    """
    # Maker-checker enforcement
    if not levels_data or len(levels_data) < 1:
        raise ValueError("At least one approval level is required (maker-checker)")

    # AI validation gate
    ai_validation = await _ai_validate_template(levels_data)
    has_errors = any(
        i.get("severity") == "error" for i in ai_validation.get("issues", [])
    )
    if has_errors:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Template failed AI validation",
                "validation": ai_validation,
            },
        )

    template = ApprovalWorkflowTemplate(
        name=name,
        type=wf_type,
        created_by=user_id,
    )
    db.add(template)
    await db.flush()

    for lvl in levels_data:
        # Resolve role name for denormalization
        role_name = lvl.get("role_name", "")
        if not role_name and lvl.get("role_id"):
            role = await db.get(Role, lvl["role_id"])
            if role:
                role_name = role.name

        level = WorkflowLevel(
            template_id=template.id,
            level_number=lvl["level_number"],
            role_id=lvl["role_id"],
            role_name=role_name,
            is_parallel=lvl.get("is_parallel", False),
        )
        db.add(level)

    await db.flush()

    # Reload with levels
    result = await db.execute(
        select(ApprovalWorkflowTemplate)
        .options(selectinload(ApprovalWorkflowTemplate.levels))
        .where(ApprovalWorkflowTemplate.id == template.id)
    )
    return {"template": result.scalar_one(), "ai_validation": ai_validation}


async def create_template_from_natural(
    db: AsyncSession,
    description: str,
    user_id: uuid.UUID,
) -> dict:
    """Create a workflow template from natural language description.
    AI parses "Manager → Risk → Director → Committee" into levels.
    Then validates the parsed template before creation.
    """
    # Fetch available roles so AI can only use existing ones
    all_roles = await list_roles(db)
    available_role_names = [r.name for r in all_roles]

    try:
        parsed = await ai_workflow_service.parse_natural_template(
            description, available_roles=available_role_names
        )
    except AIProviderError as exc:
        logger.error(
            "AI template parsing failed",
            extra={"event": "ai_parse_template_error", "error": str(exc)},
        )
        raise HTTPException(
            status_code=500,
            detail="AI failed to parse workflow template. Cannot proceed.",
        )

    template_name = parsed.get("template_name", f"AI-Generated Template")
    levels = parsed.get("levels", [])
    if not levels:
        raise HTTPException(
            status_code=422,
            detail="AI could not identify any approval levels from the description.",
        )

    # Resolve role names to role IDs
    levels_data = []
    for lvl in levels:
        role_name = lvl.get("role", "")
        # Try to find existing role
        role_result = await db.execute(
            select(Role).where(func.lower(Role.name) == role_name.lower())
        )
        role = role_result.scalar_one_or_none()
        if not role:
            # Check case-insensitive partial match
            role_result = await db.execute(
                select(Role).where(Role.name.ilike(f"%{role_name}%"))
            )
            role = role_result.scalar_one_or_none()

        if not role:
            raise HTTPException(
                status_code=422,
                detail=f"Role '{role_name}' not found in the system. Please create it first.",
            )

        levels_data.append({
            "level_number": lvl.get("level_number", len(levels_data) + 1),
            "role_id": str(role.id),
            "role_name": role.name,
            "is_parallel": lvl.get("parallel", False),
        })

    return await create_template(db, template_name, "sequential", levels_data, user_id)


async def validate_template_only(levels_data: list) -> dict:
    """AI-validate a template without saving. Returns validation result."""
    return await _ai_validate_template(levels_data)


async def list_templates(db: AsyncSession) -> List[ApprovalWorkflowTemplate]:
    """List all active workflow templates."""
    result = await db.execute(
        select(ApprovalWorkflowTemplate)
        .options(selectinload(ApprovalWorkflowTemplate.levels))
        .where(ApprovalWorkflowTemplate.is_active == True)
        .order_by(ApprovalWorkflowTemplate.created_at.desc())
    )
    return list(result.scalars().all())


async def get_template(db: AsyncSession, template_id: uuid.UUID) -> ApprovalWorkflowTemplate:
    """Get a single template with its levels."""
    result = await db.execute(
        select(ApprovalWorkflowTemplate)
        .options(selectinload(ApprovalWorkflowTemplate.levels))
        .where(ApprovalWorkflowTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise ValueError("Template not found")
    return template


async def delete_template(db: AsyncSession, template_id: uuid.UUID) -> None:
    """Soft-delete a workflow template."""
    template = await db.get(ApprovalWorkflowTemplate, template_id)
    if not template:
        raise ValueError("Template not found")
    template.is_active = False
    await db.flush()


# ═══════════════════════════════════════════════════════════════════
#  Workflow Instance — Submit (locks editing)
# ═══════════════════════════════════════════════════════════════════

async def submit_for_approval(
    db: AsyncSession,
    policy_id: uuid.UUID,
    template_id: uuid.UUID,
    user_id: uuid.UUID,
    comments: Optional[str] = None,
) -> PolicyWorkflowInstance:
    """Submit a policy for approval using a specific template.
    Sets policy status → pending_approval AND locks editing.
    """
    # Validate policy
    policy = await db.get(PolicyMetadata, policy_id)
    if not policy:
        raise ValueError("Policy not found")

    # Check structure validated
    from app.database.mongodb import get_mongo_db
    db_mongo = await get_mongo_db()
    mongo_doc = await db_mongo["policy_documents"].find_one(
        {"policy_id": str(policy_id)}, sort=[("version", -1)]
    )
    if not mongo_doc or "document_structure" not in mongo_doc or policy.status == "validation_failed":
        raise ValueError("INVALID_STRUCTURE")

    if policy.status not in ("draft", "rejected"):
        raise ValueError("Can only submit draft or rejected policies")
    if policy.is_locked:
        raise ValueError("Policy is currently locked for editing")

    # Validate template
    template = await get_template(db, template_id)
    if not template.levels:
        raise ValueError("Template has no approval levels")

    # Update policy status + LOCK editing
    policy.status = "pending_approval"
    policy.is_locked = True
    policy.updated_at = datetime.utcnow()

    # Create instance
    instance = PolicyWorkflowInstance(
        policy_id=policy_id,
        template_id=template_id,
        current_level=1,
        status="in_progress",
        submitted_by=user_id,
    )
    db.add(instance)

    await _log_audit_independent(user_id, "SUBMITTED_FOR_APPROVAL", "policy", policy_id, details={"template_id": str(template_id)})
    
    # Snapshot trigger
    from app.versioning.service import create_version_snapshot
    await create_version_snapshot(db, policy_id, user_id, "Submitted for approval")
    
    await db.flush()

    # Reload with relationships
    result = await db.execute(
        select(PolicyWorkflowInstance)
        .options(selectinload(PolicyWorkflowInstance.actions))
        .where(PolicyWorkflowInstance.id == instance.id)
    )
    return result.scalar_one()


# ═══════════════════════════════════════════════════════════════════
#  Workflow Instance — Approve / Reject (no silent auto-approval)
# ═══════════════════════════════════════════════════════════════════

async def approve_action(
    db: AsyncSession,
    instance_id: uuid.UUID,
    user_id: uuid.UUID,
    comments: Optional[str] = None,
) -> PolicyWorkflowInstance:
    """Record an approval action. Advance level or complete workflow.
    No silent auto-approval: explicit action required at every level.
    On final approval: mark approved + lock version.
    """
    instance = await _get_instance(db, instance_id)
    if instance.status != "in_progress":
        raise ValueError("Workflow is not in progress")

    # Prevent self-approval of own submission
    if instance.submitted_by == user_id:
        raise ValueError("Cannot approve your own submission (maker-checker violation)")

    # Get template levels
    template = await get_template(db, instance.template_id)
    current_level_obj = next(
        (l for l in template.levels if l.level_number == instance.current_level), None
    )
    if not current_level_obj:
        raise ValueError("Current level not found in template")

    # Check user has the right role for this level
    user = await db.get(User, user_id)
    if user and user.role_id != current_level_obj.role_id:
        # Also allow Admin
        admin_role = await db.execute(select(Role).where(Role.name == "Admin"))
        admin = admin_role.scalar_one_or_none()
        if not admin or user.role_id != admin.id:
            raise ValueError("You do not have the required role for this approval level")

    # Record action
    action = WorkflowAction(
        instance_id=instance_id,
        user_id=user_id,
        level_number=instance.current_level,
        action="approve",
        comments=comments,
    )
    db.add(action)
    await db.flush()

    # Check if level is complete
    if current_level_obj.is_parallel:
        # Parallel: count how many users with this role exist, need all to approve
        role_users_result = await db.execute(
            select(func.count()).select_from(User)
            .where(User.role_id == current_level_obj.role_id, User.is_active == True)
        )
        total_role_users = role_users_result.scalar() or 1

        level_approvals = await db.execute(
            select(func.count()).select_from(WorkflowAction)
            .where(
                WorkflowAction.instance_id == instance_id,
                WorkflowAction.level_number == instance.current_level,
                WorkflowAction.action == "approve",
            )
        )
        approval_count = level_approvals.scalar() or 0

        level_complete = approval_count >= total_role_users
    else:
        # Sequential: single approval advances
        level_complete = True

    if level_complete:
        max_level = max(l.level_number for l in template.levels)
        if instance.current_level >= max_level:
            # All levels complete — approve the policy + lock version
            instance.status = "approved"
            instance.updated_at = datetime.utcnow()
            policy = await db.get(PolicyMetadata, instance.policy_id)
            if policy:
                policy.status = "approved"
                policy.is_locked = True  # Keep locked — version is frozen
                policy.updated_at = datetime.utcnow()
                await _log_audit_independent(user_id, "VERSION_LOCKED", "policy", instance.policy_id, details={"version": policy.current_version})
        else:
            # Advance to next level
            instance.current_level += 1
            instance.updated_at = datetime.utcnow()

    await _log_audit_independent(user_id, "APPROVED", "workflow_instance", instance_id, details={"level": instance.current_level, "complete": level_complete})
    await db.flush()

    return await _get_instance(db, instance_id)


async def reject_action(
    db: AsyncSession,
    instance_id: uuid.UUID,
    user_id: uuid.UUID,
    comments: Optional[str] = None,
) -> PolicyWorkflowInstance:
    """Reject at any level — immediately rejects the entire workflow.
    Unlocks the policy for editing.
    """
    instance = await _get_instance(db, instance_id)
    if instance.status != "in_progress":
        raise ValueError("Workflow is not in progress")

    # Record rejection action
    action = WorkflowAction(
        instance_id=instance_id,
        user_id=user_id,
        level_number=instance.current_level,
        action="reject",
        comments=comments,
    )
    db.add(action)

    instance.status = "rejected"
    instance.updated_at = datetime.utcnow()

    # Update policy — UNLOCK for editing
    policy = await db.get(PolicyMetadata, instance.policy_id)
    if policy:
        policy.status = "rejected"
        policy.is_locked = False  # Unlock for corrections
        policy.updated_at = datetime.utcnow()

    await _log_audit_independent(user_id, "REJECTED", "workflow_instance", instance_id, details={"comments": comments})
    await db.flush()

    return await _get_instance(db, instance_id)


# ═══════════════════════════════════════════════════════════════════
#  AI Approval Summary
# ═══════════════════════════════════════════════════════════════════

async def get_approval_summary(db: AsyncSession, policy_id: uuid.UUID) -> dict:
    """Generate AI risk summary for a policy before approval.
    Raises 500 if AI fails — no fallback.
    """
    from app.database.mongodb import policy_documents_collection

    policy = await db.get(PolicyMetadata, policy_id)
    if not policy:
        raise ValueError("Policy not found")

    # Fetch latest structure from Mongo
    collection = policy_documents_collection()
    doc = await collection.find_one(
        {"policy_id": str(policy_id)},
        sort=[("version", -1)],
    )
    if not doc or "document_structure" not in doc:
        raise ValueError("No policy structure found")

    try:
        summary = await ai_workflow_service.generate_approval_summary(
            doc["document_structure"], policy.name
        )
        return summary
    except AIProviderError as exc:
        logger.error(
            "AI approval summary failed",
            extra={"event": "ai_summary_error", "policy_id": str(policy_id), "error": str(exc)},
        )
        raise HTTPException(
            status_code=500,
            detail="AI failed to generate approval summary. Cannot proceed.",
        )


# ═══════════════════════════════════════════════════════════════════
#  Query helpers
# ═══════════════════════════════════════════════════════════════════

async def get_instance_status(
    db: AsyncSession, policy_id: uuid.UUID
) -> Optional[PolicyWorkflowInstance]:
    """Get the latest workflow instance for a policy."""
    result = await db.execute(
        select(PolicyWorkflowInstance)
        .options(selectinload(PolicyWorkflowInstance.actions))
        .where(PolicyWorkflowInstance.policy_id == policy_id)
        .order_by(PolicyWorkflowInstance.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_approval_queue(db: AsyncSession) -> list:
    """Get all in-progress workflow instances (the approval queue)."""
    result = await db.execute(
        select(PolicyWorkflowInstance)
        .options(selectinload(PolicyWorkflowInstance.actions))
        .where(PolicyWorkflowInstance.status == "in_progress")
        .order_by(PolicyWorkflowInstance.created_at.desc())
    )
    instances = list(result.scalars().all())

    queue_items = []
    for inst in instances:
        # Fetch policy name
        policy = await db.get(PolicyMetadata, inst.policy_id)
        # Fetch template
        template = await get_template(db, inst.template_id)

        queue_items.append({
            "instance_id": inst.id,
            "policy_id": inst.policy_id,
            "policy_name": policy.name if policy else "Unknown",
            "template_name": template.name if template else "Unknown",
            "current_level": inst.current_level,
            "total_levels": len(template.levels) if template else 0,
            "status": inst.status,
            "submitted_at": inst.created_at,
        })

    return queue_items


async def list_roles(db: AsyncSession) -> list:
    """List all available roles for the workflow builder."""
    result = await db.execute(select(Role).order_by(Role.name))
    return list(result.scalars().all())


# ═══════════════════════════════════════════════════════════════════
#  Internal helpers
# ═══════════════════════════════════════════════════════════════════

async def _get_instance(db: AsyncSession, instance_id: uuid.UUID) -> PolicyWorkflowInstance:
    """Get an instance by ID with actions loaded."""
    result = await db.execute(
        select(PolicyWorkflowInstance)
        .options(selectinload(PolicyWorkflowInstance.actions))
        .where(PolicyWorkflowInstance.id == instance_id)
    )
    instance = result.scalar_one_or_none()
    if not instance:
        raise ValueError("Workflow instance not found")
    return instance


async def _ai_validate_template(levels_data: list) -> dict:
    """Run AI validation on template levels. Returns validation dict."""
    try:
        validation = await ai_workflow_service.validate_template(levels_data)
        return validation
    except AIProviderError as exc:
        logger.error(
            "AI template validation failed",
            extra={"event": "ai_validate_template_error", "error": str(exc)},
        )
        raise HTTPException(
            status_code=500,
            detail="AI template validation failed. Cannot create template without validation.",
        )


async def _log_audit_independent(user_id, action, entity_type, entity_id, details=None):
    """Independent DB commit for audit entries, decoupled from the main workflow transaction."""
    async with AsyncSessionLocal() as session:
        log = AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details,
        )
        session.add(log)
        await session.commit()
