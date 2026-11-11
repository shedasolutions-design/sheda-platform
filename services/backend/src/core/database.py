"""
Database engine and sessions.

Two shapes, chosen by runtime (core/runtime.py):

- On a server: SQLAlchemy's asyncio engine over asyncpg, as before.
- On Cloudflare Workers: there is no greenlet in Pyodide, so the asyncio
  engine cannot run. A synchronous engine over pg8000 does, and
  _AsyncSessionProxy gives it the awaitable interface the services already
  use, so no service code has to know which one it got. NullPool, because a
  Worker instance is short-lived and must not hold connections open.
"""

import ssl
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.ext.declarative import declarative_base

from core.configs import settings
from core.runtime import ON_WORKERS

if not settings.DB_URL:
    raise ValueError("No valid database URL found. Check your configuration.")

Base = declarative_base()

# libpq-style options that neither asyncpg nor pg8000 accept in the URL.
_LIBPQ_ONLY = {"sslmode", "channel_binding", "sslrootcert", "sslcert", "sslkey"}


def _split_ssl(url: str) -> tuple[str, bool]:
    """
    Remove libpq-only query options and report whether TLS was asked for.

    Hosted Postgres (Neon among them) hands out URLs ending in
    ?sslmode=require. Passed through, the driver rejects the unknown keyword;
    dropped silently, the connection would go out unencrypted. So the request
    for TLS is carried over as a real SSL context instead.
    """
    parts = urlsplit(url)
    query = parse_qsl(parts.query, keep_blank_values=True)
    sslmode = dict(query).get("sslmode", "")
    kept = [(k, v) for k, v in query if k not in _LIBPQ_ONLY]
    clean = urlunsplit(parts._replace(query=urlencode(kept)))
    return clean, sslmode in {"require", "verify-ca", "verify-full"}


def _driver_url(url: str, driver: str) -> str:
    for prefix in ("postgresql+asyncpg://", "postgresql+pg8000://", "postgresql://", "postgres://"):
        if url.startswith(prefix):
            return f"postgresql+{driver}://" + url[len(prefix):]
    return url


_raw_url, _wants_tls = _split_ssl(settings.DB_URL)
_is_sqlite = _raw_url.startswith("sqlite")


if not ON_WORKERS:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    if _is_sqlite:
        db_url = (
            _raw_url
            if "+aiosqlite" in _raw_url
            else _raw_url.replace("sqlite://", "sqlite+aiosqlite://", 1)
        )
        connect_args: dict = {"check_same_thread": False}
    else:
        db_url = _driver_url(_raw_url, "asyncpg")
        connect_args = {"ssl": ssl.create_default_context()} if _wants_tls else {}

    engine = create_async_engine(url=db_url, connect_args=connect_args)
    AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)

else:
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import NullPool

    if _is_sqlite:
        raise ValueError("SQLite is not supported on Workers; set DB_URL to a Postgres URL.")

    # SCRAM without channel binding. Over TLS, pg8000 always offers
    # SCRAM-SHA-256-PLUS, whose channel binding reads the server certificate
    # off the socket. On Workers TLS is done by the runtime (which does verify
    # the certificate) and Python's socket has no certificate to give, so the
    # login fails with "There is no peer certificate". Plain SCRAM-SHA-256
    # over the same verified TLS connection is what remains.
    import scramp

    class _ScramWithoutChannelBinding(scramp.ScramClient):
        def __init__(self, mechanisms, username, password, channel_binding=None, **kw):
            mechanisms = [m for m in mechanisms if not m.endswith("-PLUS")]
            super().__init__(mechanisms, username, password, channel_binding=None, **kw)

    scramp.ScramClient = _ScramWithoutChannelBinding

    engine = create_engine(
        url=_driver_url(_raw_url, "pg8000"),
        connect_args={"ssl_context": ssl.create_default_context()} if _wants_tls else {},
        poolclass=NullPool,
    )
    _SyncSessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

    class _AsyncTransactionProxy:
        def __init__(self, txn):
            self._txn = txn

        async def __aenter__(self):
            return self._txn.__enter__()

        async def __aexit__(self, exc_type, exc, tb):
            return self._txn.__exit__(exc_type, exc, tb)

    class _AsyncSessionProxy:
        """The AsyncSession methods the services await, over a sync Session."""

        def __init__(self, sync_session):
            self._s = sync_session

        async def execute(self, *a, **kw):
            return self._s.execute(*a, **kw)

        async def scalar(self, *a, **kw):
            return self._s.scalar(*a, **kw)

        async def scalars(self, *a, **kw):
            return self._s.scalars(*a, **kw)

        async def get(self, *a, **kw):
            return self._s.get(*a, **kw)

        async def delete(self, *a, **kw):
            return self._s.delete(*a, **kw)

        async def flush(self, *a, **kw):
            return self._s.flush(*a, **kw)

        async def commit(self):
            return self._s.commit()

        async def rollback(self):
            return self._s.rollback()

        async def close(self):
            return self._s.close()

        async def refresh(self, *a, **kw):
            return self._s.refresh(*a, **kw)

        async def merge(self, *a, **kw):
            return self._s.merge(*a, **kw)

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            if exc_type is not None:
                await self.rollback()
            await self.close()

        def begin(self):
            return _AsyncTransactionProxy(self._s.begin())

        # add, add_all, expunge, no_autoflush ... are synchronous on
        # AsyncSession too, so they pass straight through.
        def __getattr__(self, name):
            return getattr(self._s, name)

    def AsyncSessionLocal():  # noqa: N802 - same name as the server-side factory
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


async def get_redis():
    """The shared key-value store (Redis, or Postgres on Workers). See core.configs."""
    from core.configs import redis

    return redis


async def close_redis():
    from core.configs import redis

    client = getattr(redis, "_client", None)
    if client is not None and hasattr(client, "close"):
        await client.close()
        redis._client = None
