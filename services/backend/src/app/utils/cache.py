"""Cache utilities and decorators."""

from functools import wraps
from typing import Any, Callable, Optional, Coroutine
import json
from datetime import timedelta
import redis.asyncio as redis
from core.logger import get_logger

logger = get_logger(__name__)

# Cache TTL presets (in seconds)
CACHE_TTL = {
    "user_profile": timedelta(minutes=10),
    "property_feed": timedelta(minutes=5),
    "search_results": timedelta(minutes=5),
    "agent_listings": timedelta(minutes=5),
    "chat_history": timedelta(minutes=30),
    "system_config": timedelta(hours=24),
    "user_stats": timedelta(hours=1),
    "contract": timedelta(minutes=15),
    "property_detail": timedelta(minutes=15),
}


async def get_cached(
    redis_client: redis.Redis, key: str, default: Any = None
) -> Optional[Any]:
    """Get value from cache.

    Args:
        redis_client: Redis async client
        key: Cache key
        default: Default value if not found

    Returns:
        Cached value or default
    """
    try:
        value = await redis_client.get(key)
        if value:
            return json.loads(value)
            logger.debug(f"Cache hit", extra={"key": key})
    except json.JSONDecodeError:
        logger.error(f"Cache value decode error", extra={"key": key})
        await delete_cached(redis_client, key)
    except Exception as e:
        logger.error(f"Cache get error: {e}", extra={"key": key, "error": str(e)})
    return default


async def set_cached(
    redis_client: redis.Redis, key: str, value: Any, ttl: Optional[timedelta] = None
) -> bool:
    """Set value in cache with TTL.

    Args:
        redis_client: Redis async client
        key: Cache key
        value: Value to cache
        ttl: Time to live (defaults to 5 minutes)

    Returns:
        True if successful
    """
    if ttl is None:
        ttl = CACHE_TTL["property_feed"]

    try:
        await redis_client.setex(key, int(ttl.total_seconds()), json.dumps(value))
        logger.debug(
            f"Cache set", extra={"key": key, "ttl_seconds": int(ttl.total_seconds())}
        )
        return True
    except Exception as e:
        logger.error(f"Cache set error: {e}", extra={"key": key, "error": str(e)})
    return False


async def delete_cached(redis_client: redis.Redis, key: str) -> bool:
    """Delete cache entry.

    Args:
        redis_client: Redis async client
        key: Cache key

    Returns:
        True if successful
    """
    try:
        result = await redis_client.delete(key)
        if result > 0:
            logger.debug(f"Cache deleted", extra={"key": key})
        return True
    except Exception as e:
        logger.error(f"Cache delete error: {e}", extra={"key": key, "error": str(e)})
    return False


async def clear_pattern(redis_client: redis.Redis, pattern: str) -> int:
    """Delete all keys matching pattern.

    Args:
        redis_client: Redis async client
        pattern: Key pattern (supports *)

    Returns:
        Number of keys deleted
    """
    try:
        cursor = 0
        count = 0
        while True:
            cursor, keys = await redis_client.scan(cursor, match=pattern)
            if keys:
                deleted = await redis_client.delete(*keys)
                count += deleted
                logger.debug(
                    f"Cache pattern deleted",
                    extra={"pattern": pattern, "count": deleted},
                )
            if cursor == 0:
                break
        return count
    except Exception as e:
        logger.error(
            f"Cache pattern delete error: {e}",
            extra={"pattern": pattern, "error": str(e)},
        )
    return 0


def cache_decorator(key_func: Callable, ttl: Optional[timedelta] = None) -> Callable:
    """Decorator for caching async function results.

    Args:
        key_func: Function to generate cache key
        ttl: Time to live

    Usage:
        @cache_decorator(lambda user_id: f"user:{user_id}", CACHE_TTL["user_profile"])
        async def get_user_profile(user_id: int):
            ...
    """

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            from core.database import get_redis

            redis_client = await get_redis()

            key = key_func(*args, **kwargs)

            # Try cache
            cached = await get_cached(redis_client, key)
            if cached is not None:
                return cached

            # Execute function
            result = await func(*args, **kwargs)

            # Cache result
            if result is not None:
                await set_cached(
                    redis_client, key, result, ttl or CACHE_TTL["property_feed"]
                )

            return result

        return wrapper

    return decorator
