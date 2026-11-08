"""Health check endpoints."""

from fastapi import APIRouter, HTTPException
from app.services.health import (
    get_health_service,
    initialize_health_checks,
    HealthStatus,
)
from core.logger import get_logger

logger = get_logger(__name__)

router = APIRouter()


@router.on_event("startup")
async def startup_health_checks():
    """Initialize health checks on application startup."""
    await initialize_health_checks()
    logger.info("Health check endpoints ready")


@router.get("/health", tags=["health"])
async def health():
    """Basic health status.

    Returns:
        Dict with service status
    """
    return {
        "status": "ok",
        "service": "sheda-api",
    }


@router.get("/health/live", tags=["health"])
async def liveness_probe():
    """Kubernetes liveness probe: is the app still running?

    Returns:
        200 if alive
        503 if dead
    """
    health_service = await get_health_service()
    result = await health_service.live_check()
    return result


@router.get("/health/ready", tags=["health"])
async def readiness_probe():
    """Kubernetes readiness probe: is the app ready to accept traffic?

    Checks:
        - Database connectivity
        - Redis connectivity
        - Elasticsearch connectivity

    Returns:
        200 if ready
        503 if not ready

    Raises:
        HTTPException: 503 if service not ready
    """
    health_service = await get_health_service()
    checks = await health_service.ready_check()

    if checks["checks"]["overall"] == HealthStatus.UNHEALTHY:
        logger.warning("Service not ready - dependency check failed")
        raise HTTPException(status_code=503, detail="Service not ready")

    return checks


@router.get("/health/detailed", tags=["health"])
async def detailed_health():
    """Detailed health check with individual dependency status.

    Returns:
        Dict with status of each dependency
    """
    health_service = await get_health_service()
    checks = await health_service.run_checks()

    return {
        "status": checks["overall"],
        "timestamp": checks["timestamp"],
        "dependencies": checks["checks"],
    }


@router.get("/health/stats", tags=["health"])
async def health_stats():
    """Cache and performance statistics.

    Returns:
        Dict with cache stats and resource usage
    """
    try:
        from app.services.cache import get_cache_service

        cache = await get_cache_service()
        stats = await cache.get_stats()

        return {
            "cache": stats,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.error(f"Failed to get health stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get stats")


# Import datetime for stats endpoint
from datetime import datetime
