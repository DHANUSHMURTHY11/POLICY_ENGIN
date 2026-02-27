"""
Standalone script to seed the default Admin role and admin user.

Usage:
    cd d:\\POLICY_ENGIN\\backend
    python -m scripts.seed_admin

Safe to run multiple times — idempotent (skips if admin already exists).
"""
import asyncio
import sys
import os

# Ensure the backend package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select
from app.database.postgresql import engine, AsyncSessionLocal, Base
from app.auth.models import User, Role
from app.core.security import get_password_hash

# ── Default Admin Credentials ──
ADMIN_EMAIL = "admin@baikalsphere.com"
ADMIN_PASSWORD = "Admin@123"
ADMIN_FULL_NAME = "Admin User"
ADMIN_ROLE_NAME = "Admin"


async def seed_admin() -> None:
    """Create Admin role and admin user if they do not exist yet."""

    # 1. Ensure tables exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✔ Database tables verified.")

    async with AsyncSessionLocal() as session:
        # ── Role ──
        result = await session.execute(select(Role).where(Role.name == ADMIN_ROLE_NAME))
        role = result.scalar_one_or_none()

        if role is None:
            role = Role(
                name=ADMIN_ROLE_NAME,
                permissions={"all": True},
            )
            session.add(role)
            await session.flush()
            print(f"✔ Role '{ADMIN_ROLE_NAME}' created.")
        else:
            print(f"⏭ Role '{ADMIN_ROLE_NAME}' already exists — skipped.")

        # ── User ──
        result = await session.execute(select(User).where(User.email == ADMIN_EMAIL))
        user = result.scalar_one_or_none()

        if user is None:
            user = User(
                email=ADMIN_EMAIL,
                password_hash=get_password_hash(ADMIN_PASSWORD),
                full_name=ADMIN_FULL_NAME,
                role_id=role.id,
                is_active=True,
            )
            session.add(user)
            await session.flush()
            print(f"✔ Admin user '{ADMIN_EMAIL}' created.")
        else:
            print(f"⏭ Admin user '{ADMIN_EMAIL}' already exists — skipped.")

        await session.commit()

    await engine.dispose()
    print("\n🎉 Seed complete. You can now log in with:")
    print(f"   Email:    {ADMIN_EMAIL}")
    print(f"   Password: {ADMIN_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed_admin())
