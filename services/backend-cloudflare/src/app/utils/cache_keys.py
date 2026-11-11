"""Cache key generation utilities."""

import hashlib


def user_profile_key(user_id: int) -> str:
    """User profile cache key."""
    return f"user:profile:{user_id}"


def user_listings_key(user_id: int, page: int = 1) -> str:
    """User property listings cache key."""
    return f"user:{user_id}:listings:p{page}"


def property_feed_key(page: int = 1, filters_hash: str = "") -> str:
    """Property feed cache key."""
    if filters_hash:
        return f"property:feed:p{page}:{filters_hash}"
    return f"property:feed:p{page}"


def property_detail_key(property_id: int) -> str:
    """Property detail cache key."""
    return f"property:detail:{property_id}"


def search_results_key(query: str, filters_hash: str) -> str:
    """Search results cache key."""
    return f"search:{query}:{filters_hash}"


def agent_profile_key(agent_id: int) -> str:
    """Agent profile cache key."""
    return f"agent:profile:{agent_id}"


def agent_stats_key(agent_id: int) -> str:
    """Agent statistics cache key."""
    return f"agent:stats:{agent_id}"


def contract_key(contract_id: int) -> str:
    """Contract cache key."""
    return f"contract:{contract_id}"


def chat_history_key(conversation_id: int, page: int = 1) -> str:
    """Chat history cache key."""
    return f"chat:{conversation_id}:p{page}"


def system_config_key(key: str) -> str:
    """System config cache key."""
    return f"config:{key}"


def notification_key(user_id: int) -> str:
    """User notification cache key."""
    return f"notifications:{user_id}"


def device_tokens_key(user_id: int) -> str:
    """User device tokens cache key."""
    return f"devices:{user_id}"


# Cache invalidation patterns
def invalidate_user_cache(user_id: int) -> list[str]:
    """Keys to invalidate when user is updated."""
    return [
        f"user:profile:{user_id}",
        f"user:{user_id}:*",
    ]


def invalidate_property_cache(property_id: int) -> list[str]:
    """Keys to invalidate when property is updated."""
    return [
        f"property:detail:{property_id}",
        f"property:feed:*",
        f"search:*",
    ]


def invalidate_listing_cache(agent_id: int) -> list[str]:
    """Keys to invalidate when listing is updated."""
    return [
        f"agent:profile:{agent_id}",
        f"agent:{agent_id}:*",
        f"property:feed:*",
    ]


def invalidate_chat_cache(conversation_id: int) -> list[str]:
    """Keys to invalidate when chat is updated."""
    return [
        f"chat:{conversation_id}:*",
    ]


def invalidate_contract_cache(contract_id: int) -> list[str]:
    """Keys to invalidate when contract is updated."""
    return [
        f"contract:{contract_id}",
    ]


def generate_filter_hash(filters: dict) -> str:
    """Generate hash from filter parameters.

    Args:
        filters: Dictionary of filter parameters

    Returns:
        MD5 hash of filters
    """
    filter_str = "|".join(f"{k}={v}" for k, v in sorted(filters.items()))
    return hashlib.md5(filter_str.encode()).hexdigest()
