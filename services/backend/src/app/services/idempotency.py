"""
Idempotency service for preventing duplicate operations.
Provides utilities to track and validate idempotent requests.
"""

from typing import Optional, Dict, Any, Tuple
from datetime import datetime, timedelta
import json
import redis.asyncio as aioredis

from core.configs import settings
from core.logger import get_logger
from core.exceptions import IdempotencyError, DuplicatePaymentError

logger = get_logger(__name__)


class IdempotencyService:
    """Service for managing idempotent operations."""

    # Cache prefix for idempotency tracking
    IDEMPOTENCY_KEY_PREFIX = "idempotency:"

    # Default TTL for idempotency records (24 hours)
    IDEMPOTENCY_TTL = 86400

    def __init__(self, redis_client: Optional[aioredis.Redis] = None):
        """
        Initialize idempotency service.

        Args:
            redis_client: Optional Redis client for distributed tracking
        """
        self.redis_client = redis_client
        self.local_cache: Dict[str, Dict[str, Any]] = {}

    async def check_idempotency(
        self,
        idempotency_key: str,
        operation_type: str,
        expected_data: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, Optional[Dict[str, Any]]]:
        """
        Check if operation with given idempotency key already exists.

        Args:
            idempotency_key: Unique idempotency key
            operation_type: Type of operation (e.g., 'payment', 'contract')
            expected_data: Optional data to compare for duplicate detection

        Returns:
            Tuple of (is_duplicate, cached_result)
            - is_duplicate: True if operation already processed
            - cached_result: Cached result if duplicate, None if new

        Raises:
            IdempotencyError: If duplicate detected with different data
        """
        cache_key = f"{self.IDEMPOTENCY_KEY_PREFIX}{operation_type}:{idempotency_key}"

        # Try to get from Redis if available
        if self.redis_client:
            cached_data = await self._get_from_redis(cache_key)
        else:
            cached_data = await self._get_from_local_cache(cache_key)

        if cached_data is None:
            # First time seeing this idempotency key
            return False, None

        # Check if data matches
        if expected_data and cached_data.get("data") != expected_data:
            logger.warning(
                f"Idempotency conflict: key={idempotency_key}, "
                f"operation={operation_type}"
            )
            raise IdempotencyError(
                detail="Duplicate idempotency key with different request data"
            )

        logger.info(f"Idempotent request detected: {operation_type}:{idempotency_key}")
        return True, cached_data.get("result")

    async def record_operation(
        self,
        idempotency_key: str,
        operation_type: str,
        result: Dict[str, Any],
        data: Optional[Dict[str, Any]] = None,
        ttl: Optional[int] = None,
    ) -> None:
        """
        Record an operation result for idempotency.

        Args:
            idempotency_key: Unique idempotency key
            operation_type: Type of operation
            result: Operation result to cache
            data: Original request data for validation
            ttl: Optional custom TTL in seconds
        """
        cache_key = f"{self.IDEMPOTENCY_KEY_PREFIX}{operation_type}:{idempotency_key}"

        record = {
            "result": result,
            "data": data,
            "timestamp": datetime.utcnow().isoformat(),
            "ttl": ttl or self.IDEMPOTENCY_TTL,
        }

        if self.redis_client:
            await self._set_in_redis(cache_key, record, ttl or self.IDEMPOTENCY_TTL)
        else:
            await self._set_in_local_cache(cache_key, record)

        logger.debug(
            f"Recorded idempotent operation: {operation_type}:{idempotency_key}"
        )

    async def clear_idempotency_key(
        self,
        idempotency_key: str,
        operation_type: str,
    ) -> None:
        """
        Clear an idempotency key (useful for testing).

        Args:
            idempotency_key: Idempotency key to clear
            operation_type: Operation type
        """
        cache_key = f"{self.IDEMPOTENCY_KEY_PREFIX}{operation_type}:{idempotency_key}"

        if self.redis_client:
            try:
                await self.redis_client.delete(cache_key)
            except Exception as e:
                logger.error(f"Error clearing Redis key: {str(e)}")

        self.local_cache.pop(cache_key, None)
        logger.debug(f"Cleared idempotency key: {operation_type}:{idempotency_key}")

    # Private methods

    async def _get_from_redis(self, key: str) -> Optional[Dict[str, Any]]:
        """Get value from Redis cache."""
        try:
            value = await self.redis_client.get(key)
            if value:
                return json.loads(value)
        except Exception as e:
            logger.warning(f"Redis get error: {str(e)}")
        return None

    async def _set_in_redis(
        self,
        key: str,
        value: Dict[str, Any],
        ttl: int,
    ) -> None:
        """Set value in Redis cache with TTL."""
        try:
            await self.redis_client.setex(
                key,
                ttl,
                json.dumps(value, default=str),
            )
        except Exception as e:
            logger.error(f"Redis set error: {str(e)}")

    async def _get_from_local_cache(self, key: str) -> Optional[Dict[str, Any]]:
        """Get value from local cache."""
        record = self.local_cache.get(key)
        if record:
            # Check if expired
            if (
                datetime.fromisoformat(record["timestamp"])
                + timedelta(seconds=record["ttl"])
                > datetime.utcnow()
            ):
                return record
            else:
                # Expired, remove
                del self.local_cache[key]
        return None

    async def _set_in_local_cache(
        self,
        key: str,
        value: Dict[str, Any],
    ) -> None:
        """Set value in local cache."""
        self.local_cache[key] = value


# Global instance
_idempotency_service: Optional[IdempotencyService] = None


async def get_idempotency_service(
    redis_client: Optional[aioredis.Redis] = None,
) -> IdempotencyService:
    """
    Get or create global idempotency service.

    Args:
        redis_client: Optional Redis client

    Returns:
        IdempotencyService instance
    """
    global _idempotency_service

    if _idempotency_service is None:
        _idempotency_service = IdempotencyService(redis_client)

    return _idempotency_service


# Helper functions for common operations


async def check_payment_idempotency(
    idempotency_key: str,
    contract_id: int,
    amount: float,
    service: IdempotencyService,
) -> Tuple[bool, Optional[Dict[str, Any]]]:
    """
    Check idempotency for payment operation.

    Args:
        idempotency_key: Idempotency key
        contract_id: Contract ID
        amount: Payment amount
        service: IdempotencyService instance

    Returns:
        Tuple of (is_duplicate, cached_result)
    """
    expected_data = {
        "contract_id": contract_id,
        "amount": amount,
    }

    return await service.check_idempotency(
        idempotency_key,
        "payment",
        expected_data,
    )


async def record_payment(
    idempotency_key: str,
    contract_id: int,
    amount: float,
    payment_id: int,
    transaction_hash: Optional[str],
    service: IdempotencyService,
) -> None:
    """
    Record payment operation result.

    Args:
        idempotency_key: Idempotency key
        contract_id: Contract ID
        amount: Payment amount
        payment_id: Payment confirmation ID
        transaction_hash: Blockchain transaction hash
        service: IdempotencyService instance
    """
    result = {
        "payment_id": payment_id,
        "transaction_hash": transaction_hash,
        "timestamp": datetime.utcnow().isoformat(),
    }

    data = {
        "contract_id": contract_id,
        "amount": amount,
    }

    await service.record_operation(
        idempotency_key,
        "payment",
        result,
        data,
    )
