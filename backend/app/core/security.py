"""
Single source of truth for password hashing and verification.

All modules MUST import from here — never create a separate CryptContext.

Uses bcrypt directly instead of passlib, which is unmaintained and
incompatible with bcrypt >= 4.1.
"""
import bcrypt


def get_password_hash(password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against its bcrypt hash."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except (ValueError, TypeError):
        return False
