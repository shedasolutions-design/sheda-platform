from contextlib import asynccontextmanager
from fastapi import FastAPI
from core.logger import logger
from core.configs import settings


def configure_cloudinary():
    if getattr(settings, "CLOUDINARY_NAME", None) and settings.CLOUDINARY_NAME != "dummy":
        try:
            import cloudinary

            cloudinary.config(
                cloud_name=settings.CLOUDINARY_NAME,
                api_key=settings.CLOUDINARY_API_KEY,
                api_secret=settings.CLOUDINARY_API_SECRET,
                secure=True,
            )
        except Exception as e:
            logger.warning(f"Cloudinary configuration failed: {e}")


_superadmin_seeded = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _superadmin_seeded
    if getattr(settings, "AUTO_CREATE_TABLES", False):
        try:
            from core.database import engine, Base
            import app.models  # noqa: F401 - ensure all models are registered

            if hasattr(engine, "connect") and not hasattr(engine, "sync_engine"):
                Base.metadata.create_all(bind=engine)
                logger.info("Database tables verified/created")
        except Exception as e:
            logger.warning(f"Could not auto-create tables: {e}")

    if getattr(settings, "ADMIN_SEED_ENABLED", False) and not _superadmin_seeded:
        try:
            from core.admin.seed import seed_superadmin

            await seed_superadmin()
            _superadmin_seeded = True
        except Exception as e:
            logger.warning(f"Superadmin seeding failed: {e}")

    yield

