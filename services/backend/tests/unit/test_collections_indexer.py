from datetime import datetime, timezone

from app.services.collections_indexer import (
    OnChainProject,
    StakeView,
    builder_record,
    manager_record,
    months_since,
)


def test_chain_project_reads_string_and_wrapped_enum():
    plain = OnChainProject.from_view(
        {"status": "Funded", "raised": "250", "target": 1000}
    )
    wrapped = OnChainProject.from_view(
        {"status": {"Delivered": {}}, "raised": {"0": 125}, "target": "1000"}
    )

    assert plain.status == "Funded"
    assert plain.raised == 250
    assert wrapped.status == "Delivered"
    assert wrapped.raised == 125


def test_builder_record_counts_outcomes_and_sums_every_raise():
    projects = [
        OnChainProject(status="Delivered", raised=500, target=500),
        OnChainProject(status="Delivered", raised=400, target=400),
        OnChainProject(status="Open", raised=100, target=900),
        OnChainProject(status="Funded", raised=700, target=700),
        OnChainProject(status="Failed", raised=50, target=1000),
        OnChainProject(status="Stalled", raised=20, target=1000),
    ]

    record = builder_record(
        projects,
        StakeView(total=90, allocated=40, slashed_total=10, slash_count=1),
    )

    assert record["projects_on_time"] == 2
    assert record["projects_abandoned"] == 2
    assert record["projects_running"] == 2
    assert record["total_raised"] == "1770"
    assert record["stake_total"] == "90"
    assert record["stake_allocated"] == "40"
    assert record["stake_slashed_total"] == "10"
    assert record["slash_count"] == 1
    assert record["units_managed"] == 0


def test_builder_record_without_projects_is_zero_not_missing():
    record = builder_record([], None)

    assert record["projects_on_time"] == 0
    assert record["total_raised"] == "0"
    assert record["stake_total"] == "0"


def test_manager_record_keeps_unindexed_rent_at_zero():
    record = manager_record(
        units_managed=6,
        mandate_months=14,
        stake=StakeView(total=30),
    )

    assert record["units_managed"] == 6
    assert record["mandate_months"] == 14
    assert record["rent_paid_out"] == "0"
    assert record["periods_due"] == 0
    assert record["stake_total"] == "30"


def test_months_since_rounds_down_and_never_goes_negative():
    now = datetime(2026, 11, 12, tzinfo=timezone.utc)

    assert months_since(datetime(2025, 11, 12, tzinfo=timezone.utc), now) == 12
    assert months_since(datetime(2025, 11, 13, tzinfo=timezone.utc), now) == 11
    assert months_since(datetime(2027, 1, 1, tzinfo=timezone.utc), now) == 0
    assert months_since(None, now) == 0
