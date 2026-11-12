"""Two requests writing the same new key at once must not crash.

Found in the two-account test: choosing a profile right after sign-up sent
switch-account twice, both revoked the same token, and the second insert of
blacklist:<token> hit the primary key and answered 500. Redis would simply
have overwritten; the Postgres stand-in now does too.
"""

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models.kv import KVEntry
from core.kv import PostgresKV


def _sessions(db):
    # The test's own in-memory database, where the db fixture made the tables.
    return async_sessionmaker(db.bind, expire_on_commit=False)


def _racing_kv(monkeypatch, db):
    kv = PostgresKV()
    monkeypatch.setattr(kv, "_session", _sessions(db))
    real_live = kv._live
    calls = {"n": 0}

    async def stale_live(db, name):
        # The first read happens before the other writer commits, so it
        # sees nothing even though the row exists by the time we insert.
        calls["n"] += 1
        if calls["n"] == 1:
            return None
        return await real_live(db, name)

    monkeypatch.setattr(kv, "_live", stale_live)
    return kv


async def _seed(db, key, value):
    async with _sessions(db)() as s:
        s.add(KVEntry(key=key, value=value, expires_at=None))
        await s.commit()


async def test_losing_writer_updates_instead_of_failing(db, monkeypatch):
    await _seed(db, "blacklist:tok", "old")
    kv = _racing_kv(monkeypatch, db)

    assert await kv.set("blacklist:tok", "revoked", ex=60) is True
    assert await PostgresKV.get(_plain(monkeypatch, db), "blacklist:tok") == "revoked"


async def test_losing_nx_writer_reports_not_set(db, monkeypatch):
    await _seed(db, "otp:a@b.c", "123456")
    kv = _racing_kv(monkeypatch, db)

    assert await kv.set("otp:a@b.c", "999999", nx=True) is None
    assert await PostgresKV.get(_plain(monkeypatch, db), "otp:a@b.c") == "123456"


def _plain(monkeypatch, db):
    kv = PostgresKV()
    monkeypatch.setattr(kv, "_session", _sessions(db))
    return kv
