from sqlalchemy.ext.declarative import declarative_base
from core.configs import settings

if not settings.DB_URL:
    raise ValueError("No valid database URL found. Check your configuration.")

Base = declarative_base()

try:
    import greenlet
    have_greenlet = True
except ImportError:
    have_greenlet = False

if have_greenlet:
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

    db_url = (
        settings.DB_URL.replace("postgresql://", "postgresql+asyncpg://")
        if settings.DB_URL.startswith("postgresql://")  # type: ignore
        else settings.DB_URL
    )
    if db_url.startswith("sqlite://") and not db_url.startswith("sqlite+aiosqlite://"):
        db_url = db_url.replace("sqlite://", "sqlite+aiosqlite://")
    connect_args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}
    engine = create_async_engine(url=db_url, connect_args=connect_args)
    AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)
else:
    import os
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    if settings.DB_URL.startswith("sqlite"):
        try:
            with open("./_cf_write_test.tmp", "w") as f:
                f.write("1")
            os.remove("./_cf_write_test.tmp")
            db_url = settings.DB_URL.replace("sqlite+aiosqlite://", "sqlite://")
        except OSError:
            db_url = "sqlite:///:memory:"
    elif "localhost" in settings.DB_URL or "127.0.0.1" in settings.DB_URL:
        # Cloudflare Workers runtime blocks outbound TCP connections to localhost/127.0.0.1.
        # Fall back to SQLite for local development within the workerd sandbox.
        db_url = "sqlite:///:memory:"
    else:
        db_url = (
            settings.DB_URL.replace("postgresql+asyncpg://", "postgresql+pg8000://")
            .replace("postgresql://", "postgresql+pg8000://")
        )

    if db_url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
        engine_kwargs = {"connect_args": connect_args, "poolclass": StaticPool}
    else:
        from sqlalchemy.pool import NullPool
        connect_args = {}
        engine_kwargs = {"connect_args": connect_args, "poolclass": NullPool}

    engine = create_engine(url=db_url, **engine_kwargs)
    _SyncSessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

    class _AsyncSessionProxy:
        def __init__(self, sync_session):
            self._sync_session = sync_session

        async def execute(self, *args, **kwargs):
            return self._sync_session.execute(*args, **kwargs)

        async def scalar(self, *args, **kwargs):
            return self._sync_session.scalar(*args, **kwargs)

        async def scalars(self, *args, **kwargs):
            return self._sync_session.scalars(*args, **kwargs)

        async def get(self, *args, **kwargs):
            return self._sync_session.get(*args, **kwargs)

        async def delete(self, *args, **kwargs):
            return self._sync_session.delete(*args, **kwargs)

        async def flush(self, *args, **kwargs):
            return self._sync_session.flush(*args, **kwargs)

        async def commit(self):
            return self._sync_session.commit()

        async def rollback(self):
            return self._sync_session.rollback()

        async def close(self):
            return self._sync_session.close()

        async def refresh(self, *args, **kwargs):
            return self._sync_session.refresh(*args, **kwargs)

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            if exc_type is not None:
                await self.rollback()
            await self.close()

        def __getattr__(self, name):
            return getattr(self._sync_session, name)

    def AsyncSessionLocal():
        return _AsyncSessionProxy(_SyncSessionLocal())


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
_redis_client = None


async def get_redis():
    """Get Redis client singleton.

    Returns:
        Redis async client
    """
    global _redis_client
    if _redis_client is None:
        from core.configs import redis as _app_redis

        _redis_client = _app_redis
    return _redis_client


async def close_redis():
    """Close Redis connection."""
    global _redis_client
    if _redis_client and hasattr(_redis_client, "close"):
        await _redis_client.close()
        _redis_client = None
