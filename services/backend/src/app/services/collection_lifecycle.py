"""Telling investors what their building is doing, as the chain says it.

The contracts keep no list of investors (money is pulled, never pushed, so
nothing iterates over them), so the backend keeps "followers": everyone who
invested or bought shares through the app, plus anyone who tapped Follow.

A sweep reads each followed raise from the chain, compares it with what it
saw last time, and turns every change into a notification for its
followers: a round about to close or missing its deadline, filling, a phase
signed off or paid, the build stopping, a flat handed to the manager,
listed or let. Each notification carries a key, unique per person, so a
sweep that runs twice never says the same thing twice.

`derive_events` is pure and holds every rule; the rest is I/O around it.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.collection import (
    CollectionNotification,
    CollectionProject,
    CollectionUnit,
    CollectionWatch,
    RaiseStatusEnum,
)
from app.models.user import BaseUser
from app.services.notification_prefs import app_url, effective, email_configured
from core.configs import settings
from core.logger import logger

#: A round is "closing soon" inside this.
SOON = timedelta(days=3)
#: The same raise is not re-read more often than this.
MIN_GAP = timedelta(minutes=5)

MARKET_ID = {"testnet": "market-v2.shedauser.testnet", "mainnet": "shedasolution.near"}


@dataclass(frozen=True)
class Event:
    key: str
    kind: str
    title: str
    body: str


def _variant(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict) and value:
        return str(next(iter(value)))
    return ""


def derive_events(name: str, prev: Optional[dict], live: dict, now_ms: int) -> list[Event]:
    """Every notification a change in one raise calls for.

    `live` and `prev` are snapshots: {status, deadline_ms, raised, target,
    phases: [state...], phase_names: [...], manager, flats: {code: stage}}.
    With no `prev` (the first sweep), only time-based events fire, so a
    building followed late does not replay its whole history.
    """
    out: list[Event] = []
    status = live.get("status", "")
    raised, target = int(live.get("raised", 0)), int(live.get("target", 0))
    deadline = int(live.get("deadline_ms", 0))

    # Time-based: true now, whatever happened before.
    if status == "Open" and raised < target and deadline:
        if now_ms >= deadline:
            out.append(Event("money_back", "money_back", "Round missed its deadline",
                             f"{name} did not fill in time. Take everything you put in back from Portfolio."))
        elif deadline - now_ms <= SOON.total_seconds() * 1000:
            out.append(Event("closing_soon", "closing_soon", "Round closes in 3 days",
                             f"{name} is {raised * 100 // target if target else 0}% filled and closes soon."))

    if prev is None:
        return out

    was = prev.get("status", "")
    if status != was:
        if status == "Funded":
            manager = live.get("manager") or "the chosen manager"
            out.append(Event("funded", "funded", "Round filled",
                             f"{name} is fully funded. Collect your shares in Portfolio. Manager: {manager}."))
        elif status == "Failed":
            out.append(Event("money_back", "money_back", "Round did not fill",
                             f"{name} did not reach its target. Take everything you put in back from Portfolio."))
        elif status == "Stalled":
            out.append(Event("stalled", "stalled", "Building stopped",
                             f"Building on {name} has stopped. Reclaim your share of what was not paid out."))
        elif status == "Delivered":
            out.append(Event("delivered", "delivered", "Building finished",
                             f"Every phase of {name} is complete and paid."))

    names = live.get("phase_names") or []
    before = prev.get("phases") or []
    for i, state in enumerate(live.get("phases") or []):
        old = before[i] if i < len(before) else None
        label = names[i] if i < len(names) else f"Phase {i + 1}"
        if state != old and state == "ObjectionWindow":
            out.append(Event(f"phase{i}:signed", "phase_signed", f"{label} signed off",
                             f"The manager signed off {label} on {name}. Check the photos; you can object "
                             "(or approve, if the builder manages it) before it is paid."))
        if state != old and state == "Released":
            out.append(Event(f"phase{i}:paid", "phase_paid", f"{label} paid",
                             f"{label} on {name} was paid to the builder after inspection."))

    words = {
        "with_manager": ("Handed to the manager", "is now with the manager, ready to let."),
        "listed": ("Listed for rent", "is listed for rent on Sheda."),
        "rented": ("Rented", "has a tenant. Rent goes to the flat's vault for holders."),
    }
    old_flats = prev.get("flats") or {}
    for code, stage in (live.get("flats") or {}).items():
        if stage != old_flats.get(code) and stage in words:
            title, tail = words[stage]
            out.append(Event(f"flat:{code}:{stage}", f"flat_{stage}", title, f"Flat {code} at {name} {tail}"))
    return out


# ---- reading the chain -------------------------------------------------------


async def _view(client: httpx.AsyncClient, contract: str, method: str, args: dict) -> Any:
    payload = {
        "jsonrpc": "2.0",
        "id": "sheda",
        "method": "query",
        "params": {
            "request_type": "call_function",
            "finality": "final",
            "account_id": contract,
            "method_name": method,
            "args_base64": base64.b64encode(json.dumps(args).encode()).decode(),
        },
    }
    r = await client.post(settings.near_rpc_url, json=payload, timeout=15.0)
    data = r.json()
    result = data.get("result") or {}
    if "error" in data or "error" in result or "result" not in result:
        raise RuntimeError(f"{contract}.{method} failed")
    return json.loads(bytes(result["result"]).decode() or "null")


async def _flat_stage(client: httpx.AsyncClient, vault: str) -> Optional[str]:
    try:
        info = await _view(client, vault, "get_info", {})
    except Exception:
        return None
    custody = _variant(info.get("custody"))
    if custody == "AwaitingUnit":
        return "building"
    if custody == "Redeemed":
        return "redeemed"
    try:
        prop = await _view(client, MARKET_ID.get(settings.NEAR_NETWORK, ""), "get_property_by_id",
                           {"property_id": int(info.get("property_id") or 0)})
    except Exception:
        prop = None
    if prop and (prop.get("active_lease") or {}).get("active"):
        return "rented"
    if prop and prop.get("lease_duration_days") and int(prop.get("price") or 0) > 0:
        return "listed"
    return "with_manager"


async def live_snapshot(client: httpx.AsyncClient, project: CollectionProject, units: list[CollectionUnit]) -> Optional[dict]:
    contract = project.escrow_account_id
    if not contract:
        return None
    p = await _view(client, contract, "get_project", {"project_id": project.slug})
    if not p:
        return None
    flats = {}
    for u in units:
        if u.vault_account_id:
            stage = await _flat_stage(client, u.vault_account_id)
            if stage:
                flats[u.code] = stage
    return {
        "status": _variant(p.get("status")),
        "deadline_ms": int(p.get("deadline_ns") or 0) // 1_000_000,
        "raised": str(p.get("raised") or 0),
        "target": str(p.get("target") or 0),
        "phases": [_variant(ph.get("state")) for ph in p.get("phases") or []],
        "phase_names": [ph.get("name") for ph in p.get("phases") or []],
        "manager": p.get("manager"),
        "flats": flats,
    }


# ---- the sweep ---------------------------------------------------------------


async def _email(user: BaseUser, event: Event, link: str) -> None:
    try:
        if not email_configured() or not user.email:
            return
        prefs = effective(user.notification_preferences)
        if not prefs["email_notifications"] or not prefs.get("invest_updates", True):
            return
        from app.utils.email import email_sender

        text = (
            f"{event.body}\n\nOpen Sheda: {app_url()}{link}\n\n"
            "You get these because you invest in or follow this building. "
            f"Change it in Settings > Notifications: {app_url()}/notification-setting"
        )
        await email_sender.send_email(text, user.email, f"Sheda: {event.title}")
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"Invest update email not sent: {exc}")


async def sweep(db: AsyncSession, force: bool = False) -> int:
    """Read every followed raise and notify its followers of changes.
    Returns how many notifications were created. Never raises."""
    created = 0
    now = datetime.now(timezone.utc)
    try:
        watched_ids = (await db.execute(select(CollectionWatch.project_id).distinct())).scalars().all()
        if not watched_ids:
            return 0
        projects = (
            (await db.execute(select(CollectionProject).where(CollectionProject.id.in_(watched_ids))))
            .scalars()
            .all()
        )
        async with httpx.AsyncClient() as client:
            for project in projects:
                if project.status == RaiseStatusEnum.draft:
                    continue
                last = project.last_swept_at
                if last is not None and last.tzinfo is None:
                    last = last.replace(tzinfo=timezone.utc)
                if not force and last is not None and now - last < MIN_GAP:
                    continue
                units = (
                    (await db.execute(select(CollectionUnit).where(CollectionUnit.project_id == project.id)))
                    .scalars()
                    .all()
                )
                try:
                    live = await live_snapshot(client, project, list(units))
                except Exception as exc:  # noqa: BLE001
                    logger.warning(f"lifecycle sweep could not read {project.slug}: {exc}")
                    continue
                if live is None:
                    continue
                events = derive_events(project.name, project.chain_snapshot, live, int(now.timestamp() * 1000))
                if events:
                    watchers = (
                        (await db.execute(select(CollectionWatch).where(CollectionWatch.project_id == project.id)))
                        .scalars()
                        .all()
                    )
                    link = f"/collections/project/{project.slug}"
                    for event in events:
                        for w in watchers:
                            note = CollectionNotification(
                                user_id=w.user_id,
                                project_id=project.id,
                                kind=event.kind,
                                title=event.title,
                                body=event.body,
                                link=link,
                                dedupe_key=f"{project.id}:{w.user_id}:{event.key}",
                            )
                            try:
                                async with db.begin_nested():
                                    db.add(note)
                                created += 1
                            except IntegrityError:
                                continue  # already told this person
                            user = await db.get(BaseUser, w.user_id)
                            if user is not None:
                                await _email(user, event, link)
                # The vote picks the manager on chain; mirror it so the app
                # shows who won.
                if live.get("status") in ("Funded", "Delivered") and live.get("manager"):
                    for n in project.nominations:
                        if n.profile and n.profile.near_account_id == live["manager"]:
                            project.manager_id = n.profile_id
                project.chain_snapshot = live
                project.last_swept_at = now
                await db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"lifecycle sweep stopped: {exc}")
    return created
