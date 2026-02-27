"""
Auth API endpoints — login, register, get current user.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.postgresql import get_db
from app.auth import service
from app.auth.schemas import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.middleware.auth_middleware import get_current_user

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user and return JWT token."""
    # TODO: Add rate limiting in production (e.g., slowapi or redis-based limiter)
    # TODO: Consider secure httpOnly cookie for token transport in production
    user = await service.get_user_by_email(db, data.email)
    if not user or not service.verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    role_name = user.role.name if user.role else "unknown"
    token = service.create_access_token(str(user.id), role_name)

    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role_name=role_name,
            is_active=user.is_active,
            created_at=user.created_at,
        ),
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user."""
    existing = await service.get_user_by_email(db, data.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = await service.create_user(db, data)
    role_name = user.role.name if user.role else None

    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role_name=role_name,
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get current authenticated user info."""
    user = await service.get_user_by_id(db, current_user["user_id"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    role_name = user.role.name if user.role else None
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role_name=role_name,
        is_active=user.is_active,
        created_at=user.created_at,
    )
