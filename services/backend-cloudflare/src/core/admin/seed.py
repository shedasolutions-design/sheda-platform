from __future__ import annotations

from sqlalchemy import select

from core.database import AsyncSessionLocal
from core.configs import settings
from core.logger import logger

from app.models.user import Admin
from app.utils.utils import hash_password


async def seed_superadmin() -> None:
    """Create/ensure a superadmin Admin row.

    Controlled via settings (from .env):
    - `ADMIN_SEED_ENABLED` (true/1/yes)
    - `ADMIN_SEED_USERNAME`
    - `ADMIN_SEED_PASSWORD`
    - `ADMIN_SEED_EMAIL` (optional; defaults to `<username>@admin.local`)

    Dev-friendly behavior:
    - If `ADMIN_SEED_ENABLED` is not set but username+password are provided, seeding runs.
    """
    username = settings.ADMIN_SEED_USERNAME
    password = settings.ADMIN_SEED_PASSWORD
    print(len(password.encode("utf-8")))

    if not settings.ADMIN_SEED_ENABLED:
        logger.debug("Superadmin seeding disabled.")
        return

    if not username or not password:
        logger.warning("Superadmin seeding skipped: missing username or password.")
        return

    email = settings.ADMIN_SEED_EMAIL
    if not email:
        email = f"{username}@admin.local"

    async with AsyncSessionLocal() as session:
        existing = (
            await session.execute(select(Admin).where(Admin.username == username))
        ).scalar_one_or_none()
        if existing:
            if not existing.password:
                logger.info(
                    f"Superadmin '{username}' exists without password. Setting credentials..."
                )
                if not existing.is_superuser:
                    existing.is_superuser = True
                existing.password = hash_password(password)
                if not existing.email:
                    existing.email = email
                if not existing.near_account_id:
                    existing.near_account_id = f"{username.lower()}.testnet"
                await session.commit()
            else:
                logger.info(f"Superadmin '{username}' already exists.")
            return

        admin = Admin(
            username=username,
            email=email,
            password=hash_password(password),
            is_superuser=True,
            near_account_id=f"{username.lower()}.testnet",
        )
        session.add(admin)
        await session.commit()
        logger.info(f"Superadmin '{username}' created successfully.")
