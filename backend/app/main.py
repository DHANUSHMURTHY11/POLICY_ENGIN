"""
BaikalSphere Policy Engine — FastAPI Application Entry Point.
Enterprise Strict AI Mode with structured logging and startup validation.
"""
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.logging import setup_logging, get_logger

# Initialize structured logging FIRST
setup_logging(level="DEBUG" if settings.DEBUG else "INFO")
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    logger.info("Starting BaikalSphere Policy Engine", extra={
        "event": "startup",
        "app_name": settings.APP_NAME,
        "environment": settings.APP_ENV,
    })

    status = {
        "Backend Server": "✅ Running",
        "PostgreSQL": "❌ Failed",
        "MongoDB": "❌ Failed",
        "AI Integration": "❌ Failed",
        "Authentication": "❌ Failed",
        "Policy Engine Core": "✅ Ready"
    }

    try:
        # ── PostgreSQL ──
        from app.database.postgresql import engine, Base
        from app.auth.models import User, Role
        from app.policy.models import PolicyMetadata
        from app.workflow.models import (
            ApprovalWorkflowTemplate, WorkflowLevel,
            PolicyWorkflowInstance, WorkflowAction,
            WorkflowStatus, AuditLog,
        )
        from app.versioning.models import PolicyVersion

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("PostgreSQL tables created", extra={"event": "db_ready", "db": "postgresql"})
        status["PostgreSQL"] = "✅ Connected"

        # ── MongoDB ──
        from app.database.mongodb import connect_mongo
        await connect_mongo()
        logger.info("MongoDB connected", extra={"event": "db_ready", "db": "mongodb"})
        status["MongoDB"] = "✅ Connected"

        # ── Seed Admin User ──
        await _seed_admin()
        status["Authentication"] = "✅ Ready"

        # ── AI Validation (MANDATORY — always strict) ──
        await _validate_ai_provider()
        status["AI Integration"] = f"✅ {settings.AI_PROVIDER} (temp={settings.AI_TEMPERATURE}, strict={settings.AI_STRICT_MODE})"

        # ── Log Summary Dashboard ──
        print("\n" + "="*50)
        print(f"🚀 {settings.APP_NAME} Startup Summary")
        print("="*50)
        for component, state in status.items():
            print(f"{component:<20} : {state}")
        print("="*50 + "\n")

    except Exception as e:
        logger.error(f"Startup check failed: {e}", extra={"event": "startup_partial_failure"})
        if settings.APP_ENV == "production":
            logger.critical("Fatal startup failure in production. Crashing.")
            raise
        else:
            logger.warning("Continuing startup in non-production mode with degraded features.")

    yield

    # ── Shutdown ──
    from app.database.mongodb import close_mongo
    await close_mongo()
    await engine.dispose()
    logger.info("Application shutdown complete", extra={"event": "shutdown"})


async def _seed_admin():
    """Seed default admin user if not exists."""
    from app.database.postgresql import AsyncSessionLocal
    from app.auth.models import User, Role
    from sqlalchemy import select

    async with AsyncSessionLocal() as session:
        # Ensure core workflow roles
        for role_name in ["admin", "compliance", "legal"]:
            result = await session.execute(select(Role).where(Role.name == role_name))
            role = result.scalar_one_or_none()
            if not role:
                role = Role(name=role_name, permissions={})
                session.add(role)
                await session.flush()
                await session.refresh(role)
        
        # Get admin role for the admin user
        result = await session.execute(select(Role).where(Role.name == "admin"))
        role = result.scalar_one_or_none()

        # Ensure admin user
        result = await session.execute(
            select(User).where(User.email == "admin@baikalsphere.com")
        )
        admin = result.scalar_one_or_none()
        if not admin:
            from app.core.security import get_password_hash
            admin = User(
                email="admin@baikalsphere.com",
                full_name="System Admin",
                password_hash=get_password_hash(settings.ADMIN_DEFAULT_PASSWORD),
                role_id=role.id,
                is_active=True,
            )
            session.add(admin)
            logger.info("Admin user seeded", extra={
                "event": "admin_seeded",
                "email": "admin@baikalsphere.com",
            })
        else:
            # Sync role if it doesn't match
            if admin.role_id != role.id:
                admin.role_id = role.id
                logger.info("Admin user role synced to 'admin'", extra={
                    "event": "admin_role_sync",
                    "email": "admin@baikalsphere.com",
                })
        await session.commit()


async def _validate_ai_provider():
    """Validate AI provider connectivity at startup.
    In production: fails fast if unreachable (with 10s timeout).
    In development: validates key exists but skips connectivity ping.
    """
    import asyncio
    from app.ai.providers import get_ai_provider, AIProviderError

    logger.info("AI provider validation (mandatory)", extra={
        "event": "ai_validation_start",
        "provider": settings.AI_PROVIDER,
        "model": settings.active_ai_model,
        "temperature": settings.AI_TEMPERATURE,
        "key_configured": bool(settings.active_ai_key),
    })

    # Key existence is already validated by Pydantic model_validator.
    # In dev, skip the connectivity ping (it can hang with invalid keys).
    if settings.APP_ENV != "production":
        logger.info(
            "AI key validated (skipping connectivity ping in dev)",
            extra={"event": "ai_validation_dev_skip", "provider": settings.AI_PROVIDER},
        )
        return

    # Production: full ping with timeout
    try:
        provider = get_ai_provider()
        await asyncio.wait_for(provider.ping(), timeout=10.0)
        logger.info("AI provider connectivity validated", extra={
            "event": "ai_validation_success",
            "provider": settings.AI_PROVIDER,
            "model": settings.active_ai_model,
        })
    except (AIProviderError, asyncio.TimeoutError) as exc:
        logger.critical(
            f"AI provider validation FAILED: {exc}",
            extra={"event": "ai_validation_failed", "provider": settings.AI_PROVIDER},
        )
        raise SystemExit(
            f"FATAL: AI provider '{settings.AI_PROVIDER}' connectivity check failed: {exc}. "
            f"Fix the API key — AI is mandatory in this system."
        )


# ── Application ──
app = FastAPI(
    title=settings.APP_NAME,
    version="2.1.0",
    lifespan=lifespan,
)

# ── CORS ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ] + settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──
from app.auth.router import router as auth_router
from app.policy.router import router as policy_router
from app.ai.router import router as ai_router
from app.ai.conversation_router import router as chat_router
from app.ai.help_assistant_router import router as help_router
from app.workflow.router import router as workflow_router
from app.document.router import router as document_router
from app.versioning.router import router as versioning_router
from app.query.router import router as query_router

app.include_router(auth_router, prefix="/api/auth", tags=["Auth"])
app.include_router(policy_router, prefix="/api/policies", tags=["Policies"])
app.include_router(ai_router, prefix="/api/ai", tags=["AI"])
app.include_router(chat_router, prefix="/api/ai", tags=["AI Chat"])
app.include_router(help_router, prefix="/api/help-assistant", tags=["AI Help Assistant"])
app.include_router(workflow_router, prefix="/api/workflow", tags=["Workflow"])
app.include_router(document_router, prefix="/api/documents", tags=["Documents"])
app.include_router(versioning_router, prefix="/api/versioning", tags=["Versioning"])
app.include_router(query_router, prefix="/api/query", tags=["Query"])

# Optional routers
try:
    from app.audit.router import router as audit_router
    app.include_router(audit_router, prefix="/api/audit", tags=["Audit"])
except ImportError:
    logger.warning("Audit module not available", extra={"event": "module_skip", "module": "audit"})

try:
    from app.email_service.router import router as email_router
    app.include_router(email_router, prefix="/api/email", tags=["Email"])
except ImportError:
    logger.warning("Email module not available", extra={"event": "module_skip", "module": "email"})


@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "version": "2.1.0",
        "status": "running",
        "ai_mode": "strict" if settings.AI_STRICT_MODE else "auto",
        "ai_provider": settings.AI_PROVIDER,
        "ai_model": settings.active_ai_model,
        "ai_temperature": settings.AI_TEMPERATURE,
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}
