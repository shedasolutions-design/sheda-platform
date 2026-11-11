"""Cache service for Redis operations."""

from typing import Any, Optional
from datetime import timedelta
import redis.asyncio as redis
from app.utils.cache import (
    get_cached,
    set_cached,
    delete_cached,
    clear_pattern,
    CACHE_TTL,
)
from app.utils.cache_keys import (
    user_profile_key,
    user_listings_key,
    property_feed_key,
    property_detail_key,
    search_results_key,
    agent_profile_key,
    agent_stats_key,
    contract_key,
    chat_history_key,
    system_config_key,
    notification_key,
    device_tokens_key,
    invalidate_user_cache,
    invalidate_property_cache,
    invalidate_listing_cache,
    invalidate_chat_cache,
    invalidate_contract_cache,
)
from core.logger import get_logger

logger = get_logger(__name__)


class CacheService:
    """Redis cache service wrapper."""

    def __init__(self, redis_client: redis.Redis):
        """Initialize cache service.

        Args:
            redis_client: Redis async client
        """
        self.redis = redis_client

    # User profile operations
    async def get_user_profile(self, user_id: int) -> Optional[dict]:
        """Get cached user profile."""
        return await get_cached(self.redis, user_profile_key(user_id))

    async def set_user_profile(self, user_id: int, profile: dict) -> bool:
        """Cache user profile."""
        return await set_cached(
            self.redis, user_profile_key(user_id), profile, CACHE_TTL["user_profile"]
        )

    async def invalidate_user(self, user_id: int) -> int:
        """Invalidate all user caches."""
        count = 0
        for pattern in invalidate_user_cache(user_id):
            count += await clear_pattern(self.redis, pattern)
        logger.info(
            f"User cache invalidated", extra={"user_id": user_id, "keys_deleted": count}
        )
        return count

    # Property feed operations
    async def get_property_feed(
        self, page: int = 1, filters_hash: str = ""
    ) -> Optional[dict]:
        """Get cached property feed."""
        return await get_cached(self.redis, property_feed_key(page, filters_hash))

    async def set_property_feed(self, page: int, filters_hash: str, feed: dict) -> bool:
        """Cache property feed."""
        return await set_cached(
            self.redis,
            property_feed_key(page, filters_hash),
            feed,
            CACHE_TTL["property_feed"],
        )

    # Property detail operations
    async def get_property_detail(self, property_id: int) -> Optional[dict]:
        """Get cached property detail."""
        return await get_cached(self.redis, property_detail_key(property_id))

    async def set_property_detail(self, property_id: int, detail: dict) -> bool:
        """Cache property detail."""
        return await set_cached(
            self.redis,
            property_detail_key(property_id),
            detail,
            CACHE_TTL["property_detail"],
        )

    async def invalidate_properties(self) -> int:
        """Invalidate all property caches."""
        count = 0
        patterns = [
            "property:detail:*",
            "property:feed:*",
            "search:*",
        ]
        for pattern in patterns:
            count += await clear_pattern(self.redis, pattern)
        logger.info(f"Property cache invalidated", extra={"keys_deleted": count})
        return count

    # Search operations
    async def get_search_results(self, query: str, filters_hash: str) -> Optional[dict]:
        """Get cached search results."""
        return await get_cached(self.redis, search_results_key(query, filters_hash))

    async def set_search_results(
        self, query: str, filters_hash: str, results: dict
    ) -> bool:
        """Cache search results."""
        return await set_cached(
            self.redis,
            search_results_key(query, filters_hash),
            results,
            CACHE_TTL["search_results"],
        )

    # Agent operations
    async def get_agent_profile(self, agent_id: int) -> Optional[dict]:
        """Get cached agent profile."""
        return await get_cached(self.redis, agent_profile_key(agent_id))

    async def set_agent_profile(self, agent_id: int, profile: dict) -> bool:
        """Cache agent profile."""
        return await set_cached(
            self.redis, agent_profile_key(agent_id), profile, CACHE_TTL["user_profile"]
        )

    async def get_agent_stats(self, agent_id: int) -> Optional[dict]:
        """Get cached agent statistics."""
        return await get_cached(self.redis, agent_stats_key(agent_id))

    async def set_agent_stats(self, agent_id: int, stats: dict) -> bool:
        """Cache agent statistics."""
        return await set_cached(
            self.redis, agent_stats_key(agent_id), stats, CACHE_TTL["user_stats"]
        )

    async def invalidate_agent(self, agent_id: int) -> int:
        """Invalidate all agent caches."""
        count = 0
        for pattern in invalidate_listing_cache(agent_id):
            count += await clear_pattern(self.redis, pattern)
        logger.info(
            f"Agent cache invalidated",
            extra={"agent_id": agent_id, "keys_deleted": count},
        )
        return count

    # Contract operations
    async def get_contract(self, contract_id: int) -> Optional[dict]:
        """Get cached contract."""
        return await get_cached(self.redis, contract_key(contract_id))

    async def set_contract(self, contract_id: int, contract: dict) -> bool:
        """Cache contract."""
        return await set_cached(
            self.redis, contract_key(contract_id), contract, CACHE_TTL["contract"]
        )

    async def invalidate_contract(self, contract_id: int) -> int:
        """Invalidate contract cache."""
        count = 0
        for pattern in invalidate_contract_cache(contract_id):
            count += await clear_pattern(self.redis, pattern)
        logger.info(
            f"Contract cache invalidated",
            extra={"contract_id": contract_id, "keys_deleted": count},
        )
        return count

    # Chat operations
    async def get_chat_history(
        self, conversation_id: int, page: int = 1
    ) -> Optional[dict]:
        """Get cached chat history."""
        return await get_cached(self.redis, chat_history_key(conversation_id, page))

    async def set_chat_history(
        self, conversation_id: int, page: int, history: dict
    ) -> bool:
        """Cache chat history."""
        return await set_cached(
            self.redis,
            chat_history_key(conversation_id, page),
            history,
            CACHE_TTL["chat_history"],
        )

    async def invalidate_chat(self, conversation_id: int) -> int:
        """Invalidate chat cache."""
        count = 0
        for pattern in invalidate_chat_cache(conversation_id):
            count += await clear_pattern(self.redis, pattern)
        logger.info(
            f"Chat cache invalidated",
            extra={"conversation_id": conversation_id, "keys_deleted": count},
        )
        return count

    # Notification operations
    async def get_notifications(self, user_id: int) -> Optional[list]:
        """Get cached notifications."""
        return await get_cached(self.redis, notification_key(user_id))

    async def set_notifications(self, user_id: int, notifications: list) -> bool:
        """Cache notifications."""
        return await set_cached(
            self.redis,
            notification_key(user_id),
            notifications,
            CACHE_TTL["chat_history"],
        )

    async def invalidate_notifications(self, user_id: int) -> bool:
        """Invalidate user notifications."""
        return await delete_cached(self.redis, notification_key(user_id))

    # Device operations
    async def get_device_tokens(self, user_id: int) -> Optional[list]:
        """Get cached device tokens."""
        return await get_cached(self.redis, device_tokens_key(user_id))

    async def set_device_tokens(self, user_id: int, tokens: list) -> bool:
        """Cache device tokens."""
        return await set_cached(
            self.redis, device_tokens_key(user_id), tokens, CACHE_TTL["chat_history"]
        )

    async def invalidate_device_tokens(self, user_id: int) -> bool:
        """Invalidate user device tokens."""
        return await delete_cached(self.redis, device_tokens_key(user_id))

    # System config operations
    async def get_config(self, key: str) -> Optional[Any]:
        """Get cached system config."""
        return await get_cached(self.redis, system_config_key(key))

    async def set_config(self, key: str, value: Any) -> bool:
        """Cache system config."""
        return await set_cached(
            self.redis, system_config_key(key), value, CACHE_TTL["system_config"]
        )

    # Health check
    async def health_check(self) -> bool:
        """Check Redis connection health."""
        try:
            await self.redis.ping()
            logger.debug("Redis health check passed")
            return True
        except Exception as e:
            logger.error(f"Redis health check failed: {e}")
            return False

    # Stats
    async def get_stats(self) -> dict:
        """Get cache statistics."""
        try:
            info = await self.redis.info("memory")
            return {
                "used_memory": info.get("used_memory_human"),
                "used_memory_peak": info.get("used_memory_peak_human"),
                "connected_clients": await self.redis.client_list(),
            }
        except Exception as e:
            logger.error(f"Failed to get cache stats: {e}")
            return {}


async def get_cache_service() -> CacheService:
    """Get cache service singleton.

    Returns:
        CacheService instance
    """
    from core.database import get_redis

    redis_client = await get_redis()
    return CacheService(redis_client)
