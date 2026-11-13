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


async def _invest_lifecycle_loop() -> None:
    """Every ten minutes, tell investors what changed on chain for buildings
    they follow. Runs inside the server process on Railway; never raises."""
    import asyncio

    from app.services.collection_lifecycle import sweep
    from core.database import AsyncSessionLocal

    await asyncio.sleep(60)  # let the server finish starting
    while True:
        try:
            async with AsyncSessionLocal() as session:
                await sweep(session)
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"Invest lifecycle loop: {exc}")
        await asyncio.sleep(600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await seed_superadmin()
    task = None
    from core.database import ON_WORKERS

    if not ON_WORKERS:
        import asyncio

        task = asyncio.create_task(_invest_lifecycle_loop())
    yield
    if task is not None:
        task.cancel()
