from contextlib import asynccontextmanager
from fastapi import FastAPI
from core.logger import logger
from core.configs import settings
from core.admin.seed import seed_superadmin
import cloudinary


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Tables Created")
    await seed_superadmin()

    # Configuration
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True,
    )

    yield
