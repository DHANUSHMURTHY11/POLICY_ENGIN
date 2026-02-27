"""
Email API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.postgresql import get_db
from app.middleware.auth_middleware import get_current_user
from app.email_service import service
from app.email_service.schemas import SendEmailRequest, EmailResponse

router = APIRouter()


@router.post("/send", response_model=EmailResponse)
async def send_email(
    data: SendEmailRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Send an email with optional policy document attachment."""
    attachment_path = None

    # Generate attachment if requested
    if data.attachment_policy_id:
        from uuid import UUID
        from app.policy.service import get_policy
        from app.document.service import generate_word, generate_pdf

        policy = await get_policy(db, UUID(data.attachment_policy_id))
        if policy and policy.mongo_structure_id:
            if data.attachment_format == "pdf":
                attachment_path = await generate_pdf(policy.name, policy.mongo_structure_id)
            else:
                attachment_path = await generate_word(policy.name, policy.mongo_structure_id)

    success = await service.send_email(
        to=data.to,
        subject=data.subject,
        body=data.body,
        attachment_path=attachment_path,
    )

    if success:
        return EmailResponse(success=True, message="Email sent successfully")
    else:
        raise HTTPException(status_code=500, detail="Failed to send email")
