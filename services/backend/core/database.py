from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
import redis.asyncio as redis
from core.configs import settings

if not settings.DB_URL:
    raise ValueError("No valid database URL found. Check your configuration.")

db_url = (
    settings.DB_URL.replace("postgresql://", "postgresql+asyncpg://")
    if settings.DB_URL.startswith("postgresql://")  # type: ignore
    else settings.DB_URL
)

# Apply check_same_thread only for SQLite
connect_args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}


engine = create_async_engine(url=db_url, connect_args=connect_args)
AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)
Base = declarative_base()


async def get_db():
    db = AsyncSessionLocal()
    try:
        yield db
    except Exception:
        await db.rollback()
        raise
    finally:
        await db.close()


# Redis connection
_redis_client: redis.Redis = None


async def get_redis() -> redis.Redis:
    """Get Redis client singleton.

    Returns:
        Redis async client
    """
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(
            settings.REDIS_URL, decode_responses=True, encoding="utf-8"
        )
    return _redis_client


async def close_redis():
    """Close Redis connection."""
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None
