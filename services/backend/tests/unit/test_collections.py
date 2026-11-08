"""Collections: the rules worth having tests for.

Most of this router is bookkeeping. Four things in it are not, and each one
is a rule that only shows itself as a bug long after the money has moved:

* a phase schedule that does not release exactly the whole raise
* a manager inspecting a builder they are part of
* a route that shadows another, so `/projects/mine` fetches a raise named
  "mine" instead of the caller's own list
* amounts surviving the round trip as integers rather than floats

These are checked without a database or a running app wherever possible, so
they keep working when the suite is run somewhere with no Postgres.
"""

import pytest
from pydantic import ValidationError

from app.schemas.collection_schema import (
    ChainRecordOut,
    ProjectCreate,
    UnitCreate,
)


class TestPhaseSchedule:
    """A schedule that does not add up is caught where it is written."""

    @staticmethod
    def _project(**over):
        base = dict(
            slug="m120",
            name="M120 Apartments",
            location="Lekki, Lagos",
            units=5,
        )
        base.update(over)
        return base

    def test_a_schedule_releasing_the_whole_raise_is_accepted(self):
        project = ProjectCreate(
            **self._project(
                phases=[
                    {"name": "Foundation", "tranche_bps": 2000},
                    {"name": "Frame", "tranche_bps": 3000},
                    {"name": "Roofing", "tranche_bps": 3000},
                    {"name": "Handover", "tranche_bps": 2000},
                ]
            )
        )
        assert sum(p.tranche_bps for p in project.phases) == 10_000

    def test_a_schedule_leaving_money_stranded_is_refused(self):
        """Under 100% strands money in escrow with no phase that frees it."""
        with pytest.raises(ValidationError) as caught:
            ProjectCreate(
                **self._project(phases=[{"name": "Foundation", "tranche_bps": 6000}])
            )
        assert caught.value.error_count() == 1
        assert "add up to" in caught.value.errors()[0]["msg"]

    def test_a_schedule_promising_more_than_was_raised_is_refused(self):
        """Over 100% promises the builder money the raise never collected."""
        with pytest.raises(ValidationError) as caught:
            ProjectCreate(
                **self._project(
                    phases=[
                        {"name": "Foundation", "tranche_bps": 6000},
                        {"name": "Handover", "tranche_bps": 5000},
                    ]
                )
            )
        assert "110.00%" in caught.value.errors()[0]["msg"]

    def test_a_draft_may_have_no_schedule_yet(self):
        """Empty is a draft in progress, not an error. Publish is the gate."""
        project = ProjectCreate(**self._project(phases=[]))
        assert project.phases == []


class TestAmountsStayIntegers:
    """Atomic amounts are u128 and must never become floats in transit."""

    def test_an_ordinary_price_round_trips_unchanged(self):
        # 18,000,000 naira at six decimals is 1.8e13, which is inside what a
        # double holds exactly. It is here to pin the format, not the limit.
        unit = UnitCreate(
            code="1b",
            label="Unit 1B",
            bedrooms=2,
            price_atomic="18000000000000",
            total_shares="10000",
        )
        assert unit.price_atomic == "18000000000000"
        assert isinstance(unit.price_atomic, str)

    def test_an_amount_past_the_float_barrier_survives_exactly(self):
        """The case that actually needs strings.

        2**53 is about 9.0e15, so a unit price never reaches it but plenty
        else does: a raise over roughly 9 billion naira, and every figure
        derived from the vault's accumulator, which is scaled by 1e18.
        Through a double the last digits here would vanish silently.
        """
        acc_per_share = "77400000000000000000000000"  # 7.74e25
        unit = UnitCreate(
            code="x",
            label="X unit",
            bedrooms=1,
            price_atomic=acc_per_share,
            total_shares="10000",
        )
        assert unit.price_atomic == acc_per_share
        assert int(unit.price_atomic) > 2**53
        # The point of keeping it a string: through a float it would not
        # come back the same number.
        assert int(float(acc_per_share)) != int(acc_per_share)

    @pytest.mark.parametrize("bad", ["18e12", "18.5", "-1", "", "1 000", "0x10"])
    def test_anything_that_is_not_a_whole_number_is_refused(self, bad):
        with pytest.raises(ValidationError):
            UnitCreate(
                code="x", label="X unit", bedrooms=1, price_atomic=bad, total_shares="1"
            )

    def test_an_amount_wider_than_a_u128_is_refused(self):
        """39 digits is the ceiling. 40 is a mistake or an attack, not money."""
        with pytest.raises(ValidationError):
            UnitCreate(
                code="x",
                label="X unit",
                bedrooms=1,
                price_atomic="1" * 40,
                total_shares="1",
            )


class TestChainRecordCarriesNoVerdict:
    """The server publishes inputs. The ranking is the client's to compute."""

    def test_there_is_no_score_field_to_tamper_with(self):
        fields = set(ChainRecordOut.model_fields)
        for forbidden in ("score", "rank", "tier", "rating", "grade"):
            assert forbidden not in fields, (
                f"{forbidden!r} would make the rank a server's opinion, which "
                "is exactly what the app promises it is not"
            )

    def test_it_reports_how_stale_it_is(self):
        """Without this a client cannot tell a fresh cache from a dead one."""
        assert "synced_at" in ChainRecordOut.model_fields
        record = ChainRecordOut()
        assert record.synced_at is None

    def test_an_empty_record_reads_as_nothing_happened_yet(self):
        record = ChainRecordOut()
        assert record.projects_on_time == 0
        assert record.slash_count == 0
        # Strings, not zeros, so the type never changes under a caller.
        assert record.stake_total == "0"


class TestRouteOrdering:
    """A literal path must win against the pattern that would swallow it."""

    @staticmethod
    def _paths():
        from app.routers import collections

        return [
            (r.path, sorted(r.methods - {"HEAD", "OPTIONS"})[0])
            for r in collections.router.routes
        ]

    def test_projects_mine_is_declared_before_the_slug_pattern(self):
        """Otherwise it fetches a raise whose slug happens to be "mine"."""
        paths = [p for p, _ in self._paths()]
        assert paths.index("/collections/projects/mine") < paths.index(
            "/collections/projects/{slug}"
        )

    def test_profiles_me_is_declared_before_the_id_pattern(self):
        paths = [p for p, _ in self._paths()]
        assert paths.index("/collections/profiles/me") < paths.index(
            "/collections/profiles/{profile_id}"
        )

    def test_browsing_does_not_require_a_token(self):
        """A wall in front of the catalogue is how a catalogue stops being read.

        The public reads are the project list, one project, the directory,
        one profile and a phase's updates. Each is identified here by having
        no security dependency attached.
        """
        from app.routers import collections

        public = {
            ("/collections/projects", "GET"),
            ("/collections/projects/{slug}", "GET"),
            ("/collections/directory", "GET"),
            ("/collections/profiles/{profile_id}", "GET"),
            ("/collections/phases/{phase_id}/updates", "GET"),
        }
        for route in collections.router.routes:
            key = (route.path, sorted(route.methods - {"HEAD", "OPTIONS"})[0])
            if key not in public:
                continue
            names = {d.call.__name__ for d in route.dependant.dependencies if d.call}
            assert not any(
                "current" in n or "active" in n or "admin" in n for n in names
            ), f"{key} should be readable without signing in, found {names}"


class TestIndependenceRule:
    """R2: nobody signs off their own work.

    The check lives in publish_project rather than here, because it needs
    two profiles and a database. What is asserted here is the shape it
    depends on: that a manager can record the group it belongs to at all.
    Without that field the rule has nothing to test against, and a sister
    company passes as independent.
    """

    def test_a_manager_can_declare_the_group_it_belongs_to(self):
        from app.models.collection import CollectionProfile

        assert hasattr(CollectionProfile, "part_of_group")

    def test_a_profile_is_per_role_so_records_are_never_averaged(self):
        from app.models.collection import CollectionProfile

        names = {c.name for c in CollectionProfile.__table__.constraints if c.name}
        assert "uq_collection_profile_user_role" in names


class TestProjectImages:
    """Photographs are what a raise is first judged on, so they have rules."""

    def test_an_image_is_recorded_by_url_not_uploaded_here(self):
        """The bytes go through the media endpoint the marketplace uses.

        Two upload paths would mean two places where a size limit, a content
        type check and a storage bucket could drift apart.
        """
        from app.schemas.collection_schema import ImageCreate

        image = ImageCreate(image_url="https://cdn.example/site.jpg")
        assert image.image_url.startswith("https://")
        assert image.position == 0

    def test_an_empty_url_is_refused(self):
        from app.schemas.collection_schema import ImageCreate

        with pytest.raises(ValidationError):
            ImageCreate(image_url="")

    def test_images_can_be_added_after_a_raise_is_open(self):
        """Unlike the terms, which freeze once people commit.

        A photograph of the site as it stands is a progress report, not a
        term, and the holders watching a building go up are who it is for.
        So the image route uses the ownership check alone, with none of the
        draft-only guard that update_project carries.
        """
        import inspect
        from app.routers import collections

        source = inspect.getsource(collections.add_image)
        assert "_owned_project" in source
        assert "RaiseStatusEnum.draft" not in source

    def test_a_raise_cannot_carry_unlimited_images(self):
        from app.routers import collections

        assert collections.MAX_PROJECT_IMAGES == 10

    def test_listing_images_needs_no_token(self):
        """The photographs are public, like the rest of a published raise."""
        from app.routers import collections

        route = next(
            r
            for r in collections.router.routes
            if r.path == "/collections/projects/{slug}/images" and "GET" in r.methods
        )
        names = {d.call.__name__ for d in route.dependant.dependencies if d.call}
        assert not any("current" in n or "active" in n for n in names), names
