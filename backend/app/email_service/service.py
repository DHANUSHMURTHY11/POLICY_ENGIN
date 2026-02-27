"""
Email service — abstraction layer for SMTP email.
"""
import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
import os

from app.config import settings


async def send_email(
    to: list[str],
    subject: str,
    body: str,
    attachment_path: str = None,
) -> bool:
    """Send an email with optional attachment via SMTP."""
    try:
        msg = MIMEMultipart()
        msg["From"] = settings.EMAIL_FROM
        msg["To"] = ", ".join(to)
        msg["Subject"] = subject

        msg.attach(MIMEText(body, "html"))

        # Attach file if provided
        if attachment_path and os.path.exists(attachment_path):
            filename = os.path.basename(attachment_path)
            with open(attachment_path, "rb") as f:
                part = MIMEBase("application", "octet-stream")
                part.set_payload(f.read())
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", f"attachment; filename={filename}")
            msg.attach(part)

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            use_tls=True,
        )
        return True

    except Exception as e:
        print(f"Email send error: {e}")
        return False
