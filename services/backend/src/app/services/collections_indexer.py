"""Turn what the raise and stake contracts publish into a chain record.

Ranks are computed in the client from these counts. That only means
anything if the counts are rebuilt from the chain rather than typed in, so
the derivation lives here, apart from the HTTP and database code that
delivers it, and takes plain values that can be tested without a node.

Two limits are deliberate and visible in the output:

- A delivered raise counts as on time because the raise contract carries a
  funding deadline, not a construction schedule. There is no fact on chain
  that would let this code call a delivery late, and inventing one would
  make the score less trustworthy than leaving it at zero would.
- A manager's occupancy and rent counts need lease and vault events. That
  pipeline does not exist yet, so those fields stay at zero and the client
  keeps the manager unrated rather than scoring an absence of data as bad
  performance.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence

ZERO = "0"

#: Statuses the raise contract can report, normalised to their variant name.
_RUNNING = {"Open", "Funded"}
_DELIVERED = {"Delivered"}
_ABANDONED = {"Failed", "Stalled"}


def _variant(value: Any) -> str:
    """Read a Rust enum from either its string or externally tagged form."""
    if isinstance(value, str):
        return value
    if isinstance(value, Mapping) and value:
        return str(next(iter(value)))
    return ""


def _amount(value: Any) -> int:
    """Read a U128 from a JSON string, number or near-sdk's `{"0": ...}`."""
    if value is None:
        return 0
    if isinstance(value, Mapping):
        value = value.get("0", 0)
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


@dataclass(frozen=True)
class OnChainProject:
    """The facts one raise publishes that a builder record consumes."""

    status: str
    raised: int
    target: int
    refunded: int = 0

    @classmethod
    def from_view(cls, payload: Mapping[str, Any]) -> "OnChainProject":
        return cls(
            status=_variant(payload.get("status")),
            raised=_amount(payload.get("raised")),
            target=_amount(payload.get("target")),
            refunded=_amount(payload.get("refunded")),
        )


@dataclass(frozen=True)
class StakeView:
    """The stake registry's profile, flattened."""

    total: int = 0
    allocated: int = 0
    slashed_total: int = 0
    slash_count: int = 0

    @classmethod
    def from_view(cls, payload: Mapping[str, Any] | None) -> "StakeView":
        if not payload:
            return cls()
        return cls(
            total=_amount(payload.get("total")),
            allocated=_amount(payload.get("allocated")),
            slashed_total=_amount(payload.get("slashed_total")),
            slash_count=int(payload.get("slash_count") or 0),
        )


def _stake_fields(stake: StakeView) -> dict[str, Any]:
    return {
        "stake_total": str(stake.total),
        "stake_allocated": str(stake.allocated),
        "stake_slashed_total": str(stake.slashed_total),
        "slash_count": stake.slash_count,
    }


def _empty_manager_fields() -> dict[str, Any]:
    return {
        "units_managed": 0,
        "let_months": 0,
        "mandate_months": 0,
        "rent_paid_out": ZERO,
        "periods_paid_on_time": 0,
        "periods_due": 0,
        "disputes_upheld": 0,
    }


def builder_record(
    projects: Sequence[OnChainProject], stake: StakeView | None = None
) -> dict[str, Any]:
    """Build the chain record for a builder from their raises.

    `total_raised` sums every raise, including ones that later failed.
    Money that came in is evidence of what people were willing to trust
    them with even when the build did not finish, and dropping it would let
    a builder improve their cover ratio by abandoning raises.
    """
    statuses = [p.status for p in projects]
    delivered = sum(1 for status in statuses if status in _DELIVERED)
    abandoned = sum(1 for status in statuses if status in _ABANDONED)
    running = sum(1 for status in statuses if status in _RUNNING)

    return {
        "projects_on_time": delivered,
        "projects_late": 0,
        "projects_abandoned": abandoned,
        "projects_running": running,
        "total_raised": str(sum(p.raised for p in projects)),
        **_stake_fields(stake or StakeView()),
        **_empty_manager_fields(),
    }


def manager_record(
    *,
    units_managed: int,
    mandate_months: int,
    stake: StakeView | None = None,
    let_months: int = 0,
    rent_paid_out: int = 0,
    periods_paid_on_time: int = 0,
    periods_due: int = 0,
    disputes_upheld: int = 0,
) -> dict[str, Any]:
    """Build the chain record for a manager.

    The schedule and rent arguments default to zero because no indexer
    supplies them yet. They are parameters rather than literals so the
    lease and vault pipeline can fill them without changing the shape of
    the record or the scoring function.
    """
    return {
        "projects_on_time": 0,
        "projects_late": 0,
        "projects_abandoned": 0,
        "projects_running": 0,
        "total_raised": ZERO,
        **_stake_fields(stake or StakeView()),
        "units_managed": units_managed,
        "let_months": let_months,
        "mandate_months": mandate_months,
        "rent_paid_out": str(rent_paid_out),
        "periods_paid_on_time": periods_paid_on_time,
        "periods_due": periods_due,
        "disputes_upheld": disputes_upheld,
    }


def months_since(start: datetime | None, now: datetime | None = None) -> int:
    """Whole months between two datetimes, never negative."""
    if start is None:
        return 0
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    if now <= start:
        return 0
    months = (now.year - start.year) * 12 + (now.month - start.month)
    if now.day < start.day:
        months -= 1
    return max(0, months)
