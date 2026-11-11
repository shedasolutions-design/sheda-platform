from contextlib import asynccontextmanager
from fastapi import FastAPI
from core.logger import logger
from core.configs import settings
from core.admin.seed import seed_superadmin
import cloudinary


# Configured at import, not in lifespan: on Workers the ASGI lifespan is not
# guaranteed to run before the first request.
if settings.CLOUDINARY_NAME:
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True,
    )
else:
    logger.warning("Cloudinary is not configured; image uploads will fail until CLOUDINARY_* are set.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await seed_superadmin()
    yield
