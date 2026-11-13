"""Invest lifecycle notifications: the rules, and the sweep around them."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.collection import (
    CollectionNotification,
    CollectionProfile,
    CollectionProject,
    CollectionWatch,
    RaiseStatusEnum,
)
from app.models.user import Agent
from app.services import collection_lifecycle as lc
from app.utils.enums import AccountTypeEnum
from app.utils.utils import hash_password

DAY_MS = 86_400_000
NOW = 1_800_000_000_000


def snap(**over):
    base = {
        "status": "Open",
        "deadline_ms": NOW + 30 * DAY_MS,
        "raised": "100",
        "target": "1000",
        "phases": ["Building", "Locked"],
        "phase_names": ["Foundation", "Roof"],
        "manager": "eze.testnet",
        "flats": {},
    }
    base.update(over)
    return base


def kinds(events):
    return [e.kind for e in events]


def test_a_round_closing_soon_is_announced():
    assert kinds(lc.derive_events("M120", None, snap(deadline_ms=NOW + 2 * DAY_MS), NOW)) == ["closing_soon"]


def test_a_missed_deadline_tells_investors_to_take_money_back():
    assert kinds(lc.derive_events("M120", None, snap(deadline_ms=NOW - 1), NOW)) == ["money_back"]


def test_the_first_sweep_does_not_replay_history():
    live = snap(status="Funded", phases=["Released", "ObjectionWindow"])
    assert lc.derive_events("M120", None, live, NOW) == []


def test_filling_signing_off_and_paying_are_each_announced():
    prev = snap()
    funded = snap(status="Funded", raised="1000")
    assert kinds(lc.derive_events("M120", prev, funded, NOW)) == ["funded"]
    signed = snap(status="Funded", raised="1000", phases=["ObjectionWindow", "Locked"])
    assert kinds(lc.derive_events("M120", funded, signed, NOW)) == ["phase_signed"]
    paid = snap(status="Funded", raised="1000", phases=["Released", "Building"])
    assert kinds(lc.derive_events("M120", signed, paid, NOW)) == ["phase_paid"]


def test_a_flat_being_let_is_announced():
    prev = snap(status="Delivered", raised="1000", flats={"1a": "listed"})
    live = snap(status="Delivered", raised="1000", flats={"1a": "rented"})
    assert kinds(lc.derive_events("M120", prev, live, NOW)) == ["flat_rented"]


async def test_the_sweep_notifies_followers_once(db: AsyncSession, monkeypatch):
    user = Agent(email="lc@example.com", username="lc_user", password=hash_password("whatever-password-1"),
                 verified=True, account_type=AccountTypeEnum.agent, near_account_id="lc.testnet")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    builder = CollectionProfile(user_id=user.id, role="builder", display_name="LC Homes", near_account_id="lcb.testnet")
    db.add(builder)
    await db.commit()
    await db.refresh(builder)
    project = CollectionProject(slug="lc-flats", builder_id=builder.id, name="LC Flats", location="Yaba",
                                units=1, status=RaiseStatusEnum.open, escrow_account_id="raise.testnet",
                                chain_snapshot=snap())
    db.add(project)
    await db.commit()
    await db.refresh(project)
    db.add(CollectionWatch(project_id=project.id, user_id=user.id))
    await db.commit()

    async def fake_live(client, p, units):
        return snap(status="Funded", raised="1000")

    monkeypatch.setattr(lc, "live_snapshot", fake_live)
    assert await lc.sweep(db, force=True) == 1
    # Same state again: nothing new to say.
    assert await lc.sweep(db, force=True) == 0
    rows = (await db.execute(select(CollectionNotification))).scalars().all()
    assert [r.kind for r in rows] == ["funded"]
    assert rows[0].link == "/collections/project/lc-flats"
