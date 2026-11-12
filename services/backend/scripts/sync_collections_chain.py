#!/usr/bin/env python3
"""Rebuild Collections chain records from NEAR.

Run from `services/backend` with the same environment the API uses:

    uv run python scripts/sync_collections_chain.py --dry-run
    uv run python scripts/sync_collections_chain.py

The script reads profiles and project slugs from the database, reads the
raises and stake from the chain, and writes the counts the client turns
into a rank. It never writes to the chain and needs no NEAR key.

The RPC endpoints are public testnet endpoints. Point `RAISE_CONTRACT_ID`
and `STAKE_REGISTRY_ID` at the deployment the web app is using.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

DEFAULT_RPC = (
    "https://rpc.testnet.fastnear.com",
    "https://near-testnet.drpc.org",
)
RAISE_CONTRACT = os.getenv("RAISE_CONTRACT_ID", "sheda-raise-v3.testnet")
STAKE_REGISTRY = os.getenv("STAKE_REGISTRY_ID", "sheda-stake-v3.testnet")


class RpcError(RuntimeError):
    pass


def _post(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    body = json.dumps(payload).encode()
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "sheda-collections-indexer/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:300]
        raise RpcError(f"{exc.code} {detail}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RpcError(str(exc)) from exc


def rpc(method: str, params: dict[str, Any], urls: tuple[str, ...] = DEFAULT_RPC) -> Any:
    """Call one RPC method, moving to the next endpoint on failure."""
    last: Exception | None = None
    for url in urls:
        try:
            payload = _post(
                url,
                {"jsonrpc": "2.0", "id": "sheda-indexer", "method": method, "params": params},
            )
            if "error" in payload:
                raise RpcError(str(payload["error"].get("message", payload["error"])))
            return payload["result"]
        except RpcError as exc:
            last = exc
    raise RpcError(str(last) if last else "No RPC endpoint answered")


def view(contract: str, method: str, args: dict[str, Any]) -> Any:
    result = rpc(
        "query",
        {
            "request_type": "call_function",
            "finality": "final",
            "account_id": contract,
            "method_name": method,
            "args_base64": base64.b64encode(json.dumps(args).encode()).decode(),
        },
    )
    if result.get("error"):
        raise RpcError(str(result["error"]))
    raw = bytes(result.get("result") or [])
    return json.loads(raw.decode()) if raw else None


def latest_height() -> int | None:
    try:
        result = rpc("block", {"finality": "final"})
        return int(result["header"]["height"])
    except (RpcError, KeyError, TypeError, ValueError):
        return None


async def run(dry_run: bool, only: str | None) -> int:
    from sqlalchemy import func, select

    from app.models.collection import (
        CollectionChainRecord,
        CollectionProfile,
        CollectionProject,
        CollectionRoleEnum,
        CollectionUnit,
    )
    from app.services.collections_indexer import (
        OnChainProject,
        StakeView,
        builder_record,
        manager_record,
        months_since,
    )
    from core.database import AsyncSessionLocal

    height = latest_height()
    synced_at = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as session:
        profile_query = select(CollectionProfile)
        if only:
            if only.isdigit():
                profile_query = profile_query.where(
                    (CollectionProfile.near_account_id == only)
                    | (CollectionProfile.id == int(only))
                )
            else:
                profile_query = profile_query.where(
                    CollectionProfile.near_account_id == only
                )
        profiles = list((await session.execute(profile_query)).scalars().all())

        projects = list((await session.execute(select(CollectionProject))).scalars().all())
        by_builder: dict[int, list[CollectionProject]] = {}
        by_manager: dict[int, list[CollectionProject]] = {}
        for project in projects:
            by_builder.setdefault(project.builder_id, []).append(project)
            if project.manager_id is not None:
                by_manager.setdefault(project.manager_id, []).append(project)

        # A dry run still needs the chain. It only skips the write, which is
        # enough to see exactly what the next real run would record.
        for profile in profiles:
            if not profile.near_account_id:
                print(f"skip {profile.display_name}: no NEAR account on the profile")
                continue

            try:
                stake = StakeView.from_view(
                    view(STAKE_REGISTRY, "get_profile", {"account_id": profile.near_account_id})
                )
            except (RpcError, ValueError) as exc:
                print(f"skip {profile.display_name}: stake registry: {exc}")
                continue

            if profile.role == CollectionRoleEnum.builder:
                chain_projects: list[OnChainProject] = []
                failed = False
                for project in by_builder.get(profile.id, []):
                    if not project.escrow_account_id:
                        # A draft has no escrow yet, so asking the chain would
                        # only produce a panic that looks like an outage.
                        continue
                    try:
                        payload = view(RAISE_CONTRACT, "get_project", {"project_id": project.slug})
                    except RpcError as exc:
                        # A transport or contract failure would make the
                        # record incomplete, so keep the previous one rather
                        # than writing a lower total_raised over it.
                        print(f"skip {profile.display_name}: {project.slug}: {exc}")
                        failed = True
                        break
                    if payload is None:
                        # A draft in the API that has not been created on
                        # chain yet is not a failure; there is simply no
                        # on-chain raise to count.
                        print(
                            f"skip {profile.display_name}: {project.slug} is not on "
                            f"{RAISE_CONTRACT}"
                        )
                        continue
                    chain_projects.append(OnChainProject.from_view(payload))

                if failed:
                    continue
                record = builder_record(chain_projects, stake)

            elif profile.role == CollectionRoleEnum.manager:
                managed = by_manager.get(profile.id, [])
                unit_count = (
                    await session.execute(
                        select(func.count(CollectionUnit.id))
                        .join(
                            CollectionProject,
                            CollectionUnit.project_id == CollectionProject.id,
                        )
                        .where(
                            CollectionProject.manager_id == profile.id,
                            CollectionProject.escrow_account_id.isnot(None),
                        )
                    )
                ).scalar() or 0
                started = min(
                    (p.created_at for p in managed if p.created_at is not None),
                    default=None,
                )
                record = manager_record(
                    units_managed=int(unit_count),
                    mandate_months=months_since(started, synced_at),
                    stake=stake,
                )
            else:
                continue

            if dry_run:
                print(
                    json.dumps(
                        {
                            "profile": profile.display_name,
                            "role": profile.role.value,
                            "near_account_id": profile.near_account_id,
                            "synced_block_height": height,
                            "record": record,
                        },
                        indent=2,
                    )
                )
                continue

            stored = (
                await session.execute(
                    select(CollectionChainRecord).where(
                        CollectionChainRecord.profile_id == profile.id
                    )
                )
            ).scalar_one_or_none()
            if stored is None:
                stored = CollectionChainRecord(profile_id=profile.id)
                session.add(stored)

            for field, value in record.items():
                setattr(stored, field, value)
            stored.synced_at = synced_at
            stored.synced_block_height = height
            print(f"synced {profile.display_name} ({profile.role.value})")

        if not dry_run:
            await session.commit()

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Rebuild Collections chain records.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="read and print the records without writing them",
    )
    parser.add_argument(
        "--account",
        help="only sync one near account id (or numeric profile id)",
    )
    args = parser.parse_args()

    try:
        return asyncio.run(run(args.dry_run, args.account))
    except ModuleNotFoundError as exc:
        print(
            f"{exc.name} is missing. Run from services/backend with its environment, "
            "for example `uv run python scripts/sync_collections_chain.py`.",
            file=sys.stderr,
        )
        return 2
    except ValueError as exc:
        print(f"configuration error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
