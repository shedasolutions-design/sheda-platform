"""
A Redis stand-in backed by Postgres, for Cloudflare Workers.

What the backend keeps in Redis is small and must be shared: one-time email
codes (OTP_PREFIX) and revoked access tokens (BLACKLIST_PREFIX). On Workers
there is no Redis connection, and memory is per instance, so a code written by
one instance would be invisible to the instance that checks it. A table in the
database every instance already uses fixes that.

Only the methods the backend calls are implemented, with Redis's semantics:
values come back as str, a missing or expired key is None, ttl is -2 for
missing and -1 for no expiry.
"""

from datetime import datetime, timedelta, timezone
from fnmatch import fnmatch
from typing import Optional


def _now() -> datetime:
    return datetime.now(timezone.utc)


class PostgresKV:
    def _session(self):
        from core.database import AsyncSessionLocal

        return AsyncSessionLocal()

    async def _live(self, db, name: str):
        from app.models.kv import KVEntry

        row = await db.get(KVEntry, name)
        if row is None:
            return None
        exp = row.expires_at
        if exp is not None and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp is not None and exp <= _now():
            await db.delete(row)
            await db.commit()
            return None
        return row

    async def get(self, name: str) -> Optional[str]:
        async with self._session() as db:
            row = await self._live(db, name)
            return row.value if row else None

    async def set(self, name: str, value, ex: Optional[int] = None, px: Optional[int] = None,
                  nx: bool = False, xx: bool = False, **_):
        from app.models.kv import KVEntry

        if px is not None and ex is None:
            ex = px / 1000.0
        async with self._session() as db:
            row = await self._live(db, name)
            if (nx and row is not None) or (xx and row is None):
                return None
            expires = _now() + timedelta(seconds=ex) if ex else None
            if row is None:
                db.add(KVEntry(key=name, value=str(value), expires_at=expires))
            else:
                row.value = str(value)
                row.expires_at = expires
            await db.commit()
            return True

    async def setex(self, name: str, time, value):
        seconds = time.total_seconds() if isinstance(time, timedelta) else time
        return await self.set(name, value, ex=seconds)

    async def delete(self, *names: str) -> int:
        from app.models.kv import KVEntry

        removed = 0
        async with self._session() as db:
            for name in names:
                row = await db.get(KVEntry, name)
                if row is not None:
                    await db.delete(row)
                    removed += 1
            await db.commit()
        return removed

    async def exists(self, *names: str) -> int:
        count = 0
        async with self._session() as db:
            for name in names:
                if await self._live(db, name) is not None:
                    count += 1
        return count

    async def ttl(self, name: str) -> int:
        async with self._session() as db:
            row = await self._live(db, name)
            if row is None:
                return -2
            if row.expires_at is None:
                return -1
            exp = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=timezone.utc)
            return max(0, int((exp - _now()).total_seconds()))

    async def keys(self, pattern: str = "*") -> list[str]:
        from sqlalchemy import select

        from app.models.kv import KVEntry

        async with self._session() as db:
            result = await db.execute(select(KVEntry.key))
            return [k for (k,) in result.all() if fnmatch(k, pattern)]

    async def ping(self) -> bool:
        from sqlalchemy import text

        async with self._session() as db:
            await db.execute(text("SELECT 1"))
        return True

    async def info(self, *_, **__) -> dict:
        return {"redis_mode": "postgres-kv", "used_memory_human": "n/a"}

    async def client_list(self) -> list:
        return []

    async def close(self) -> None:
        return None
