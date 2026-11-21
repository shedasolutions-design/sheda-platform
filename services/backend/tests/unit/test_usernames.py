"""Usernames: the rules, suggestions from a name, and no clashes."""

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import Agent, Client
from app.schemas.user_schema import UserUpdate
from app.services import usernames
from app.services.profile import update_user
from app.utils.enums import AccountTypeEnum
from app.utils.utils import hash_password


async def _person(db: AsyncSession, email: str, username: str):
    hashed = hash_password("whatever-password-1")
    rows = [
        Client(email=email, username=username, password=hashed, verified=True,
               account_type=AccountTypeEnum.client, near_account_id=f"{username}.testnet"),
        Agent(email=email, username=username, password=hashed, verified=True,
              account_type=AccountTypeEnum.agent, near_account_id=f"{username}.testnet"),
    ]
    db.add_all(rows)
    await db.commit()
    for r in rows:
        await db.refresh(r)
    return rows


@pytest.mark.parametrize("name,ok", [
    ("ada", True),
    ("ada.lovelace", True),
    ("ada_99", True),
    ("ab", False),                 # too short
    ("a" * 21, False),             # too long
    ("ada@x", False),              # looks like an email
    ("08012345678", False),        # looks like a phone number
    (".ada", False),
    ("ada.", False),
    ("ada..b", False),
    ("ad a", False),
    ("admin", False),              # reserved
    ("shedaofficial", False),      # anything starting "sheda"
])
def test_rules(name, ok):
    assert (usernames.problem(usernames.normalize(name)) is None) is ok


def test_normalize():
    assert usernames.normalize("  @Ada.Lovelace ") == "ada.lovelace"


async def test_suggestions_skip_taken_and_number_the_rest(db: AsyncSession):
    await _person(db, "a1@example.com", "adesinayusuf")
    picks = await usernames.suggest("Adésina Yusuf", db)
    assert "adesinayusuf" not in picks
    assert picks[0] == "adesina.yusuf"
    assert len(picks) == 3 and all(usernames.problem(p) is None for p in picks)

    # The person's own username is not "taken" for them.
    mine = await usernames.suggest("Adesina Yusuf", db, own_email="a1@example.com")
    assert mine[0] == "adesinayusuf"


async def test_reserved_names_still_get_suggestions(db: AsyncSession):
    picks = await usernames.suggest("Sheda Admin", db)
    assert picks and all(usernames.problem(p) is None for p in picks)


async def test_two_google_people_with_one_name_both_get_usernames(db: AsyncSession):
    first = await usernames.unique_from_name("John Doe", db)
    await _person(db, "john1@example.com", first)
    second = await usernames.unique_from_name("John Doe", db)
    assert first != second


async def test_profile_edit_checks_and_saves_on_both_rows(db: AsyncSession):
    await _person(db, "taken@example.com", "takenname")
    me, my_seller = await _person(db, "me@example.com", "me@example.com")

    with pytest.raises(HTTPException) as e:
        await update_user(UserUpdate(username="TakenName", account_type=AccountTypeEnum.client), db, me)
    assert e.value.status_code == 409

    with pytest.raises(HTTPException) as e:
        await update_user(UserUpdate(username="admin", account_type=AccountTypeEnum.client), db, me)
    assert e.value.status_code == 400

    await update_user(UserUpdate(username="@My.Name", account_type=AccountTypeEnum.client), db, me)
    await db.refresh(my_seller)
    assert me.username == "my.name" and my_seller.username == "my.name"

    # Saving the same name again (any case) is not a clash with oneself.
    await update_user(UserUpdate(username="MY.NAME", account_type=AccountTypeEnum.client), db, me)


async def test_check_route(db: AsyncSession):
    from app.routers.user import username_check

    await _person(db, "other@example.com", "chidi")
    me, _ = await _person(db, "me2@example.com", "me2@example.com")

    taken = await username_check(current_user=me, db=db, username="Chidi", name="")
    assert taken["available"] is False and taken["problem"] == "That username is taken."
    assert taken["suggestions"] and "chidi" not in taken["suggestions"]

    free = await username_check(current_user=me, db=db, username="chidi.o", name="")
    assert free["available"] is True and free["problem"] is None

    from_name = await username_check(current_user=me, db=db, username="", name="Chidi Okafor")
    assert from_name["suggestions"][0] == "chidiokafor"
