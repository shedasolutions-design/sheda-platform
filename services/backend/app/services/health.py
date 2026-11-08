"""Health check service."""

from datetime import datetime
from typing import Dict, Any, Callable, Optional
from enum import Enum
from core.logger import get_logger

logger = get_logger(__name__)


class HealthStatus(str, Enum):
    """Health status enum."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


class HealthCheckService:
    """Health check service for dependency validation."""

    def __init__(self):
        """Initialize health check service."""
        self.check_registry: Dict[str, Callable] = {}

    def register_check(self, name: str, check_func: Callable) -> None:
        """Register health check function.

        Args:
            name: Check name
            check_func: Async function returning bool
        """
        self.check_registry[name] = check_func
        logger.debug(f"Health check registered", extra={"service": name})

    async def run_checks(self) -> Dict[str, Any]:
        """Run all registered health checks.

        Returns:
            Dict with results for each check
        """
        results = {
            "timestamp": datetime.utcnow().isoformat(),
            "checks": {},
            "overall": HealthStatus.HEALTHY,
        }

        for name, check_func in self.check_registry.items():
            try:
                passed = await check_func()
                results["checks"][name] = {
                    "status": "ok" if passed else "failed",
                    "passed": passed,
                }
                if not passed:
                    results["overall"] = HealthStatus.DEGRADED
                    logger.warning(f"Health check failed", extra={"service": name})
            except Exception as e:
                results["checks"][name] = {
                    "status": "error",
                    "passed": False,
                    "error": str(e),
                }
                results["overall"] = HealthStatus.UNHEALTHY
                logger.error(
                    f"Health check error: {e}", extra={"service": name, "error": str(e)}
                )

        return results

    async def live_check(self) -> Dict[str, Any]:
        """Kubernetes liveness probe: is app alive?

        Returns:
            Dict with alive status
        """
        return {
            "status": "alive",
            "timestamp": datetime.utcnow().isoformat(),
        }

    async def ready_check(self) -> Dict[str, Any]:
        """Kubernetes readiness probe: is app ready for traffic?

        Returns:
            Dict with readiness status and dependency checks
        """
        checks = await self.run_checks()
        return {
            "status": (
                "ready" if checks["overall"] == HealthStatus.HEALTHY else "not_ready"
            ),
            "timestamp": datetime.utcnow().isoformat(),
            "checks": checks,
        }


# Global health service
_health_service: Optional[HealthCheckService] = None


async def get_health_service() -> HealthCheckService:
    """Get health check service singleton.

    Returns:
        HealthCheckService instance
    """
    global _health_service
    if _health_service is None:
        _health_service = HealthCheckService()
    return _health_service


async def initialize_health_checks() -> None:
    """Initialize all health checks at startup."""
    global _health_service
    if _health_service is None:
        _health_service = HealthCheckService()

    # Database check
    async def check_database() -> bool:
        try:
            from core.database import AsyncSessionLocal
            from sqlalchemy import text

            async with AsyncSessionLocal() as session:
                await session.execute(text("SELECT 1"))
            return True
        except Exception as e:
            logger.error(f"Database check failed: {e}")
            return False

    # Redis check
    async def check_redis() -> bool:
        try:
            from app.services.cache import get_cache_service

            cache = await get_cache_service()
            return await cache.health_check()
        except Exception as e:
            logger.error(f"Redis check failed: {e}")
            return False

    # Elasticsearch check
    async def check_elasticsearch() -> bool:
        try:
            from app.services.search import get_search_service

            search = await get_search_service()
            # Basic connectivity check
            return search is not None
        except Exception as e:
            logger.error(f"Elasticsearch check failed: {e}")
            return False

    _health_service.register_check("database", check_database)
    _health_service.register_check("redis", check_redis)
    _health_service.register_check("elasticsearch", check_elasticsearch)

    logger.info("Health checks initialized")
