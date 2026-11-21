"""
Usernames: what is allowed, whether one is free, and suggestions from a name.

People sign in with an email, a phone number or a username, through the
same box. So a username must never look like either of the others: no "@"
(an email) and not all digits (a phone number). One person has two rows
(buyer and seller) sharing one username, so "taken" means taken by a
different email. Compared without case: "Ada" and "ada" are one name.

Older accounts kept their email as their username; those still work for
sign-in and simply can't be chosen by anyone else (they contain "@").
"""

import re
import secrets
import unicodedata
from typing import List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

MIN_LEN = 3
MAX_LEN = 20
_ALLOWED = re.compile(r"^[a-z0-9._]+$")

RESERVED = {
    "admin", "administrator", "root", "system", "support", "help", "sheda", "shedaapp",
    "shedasolutions", "sheda_solutions", "official", "staff", "team", "security",
    "moderator", "mod", "api", "www", "mail", "info", "contact", "billing", "noreply",
    "no_reply", "notifications", "null", "undefined", "anonymous", "user", "users",
}


def normalize(raw: str) -> str:
    return (raw or "").strip().lstrip("@").lower()


def problem(username: str) -> Optional[str]:
    """Why this (normalised) username can't be used, or None if it can."""
    if len(username) < MIN_LEN:
        return f"Use at least {MIN_LEN} characters."
    if len(username) > MAX_LEN:
        return f"Use at most {MAX_LEN} characters."
    if not _ALLOWED.match(username):
        return "Use only letters, numbers, dots and underscores."
    if username[0] in "._" or username[-1] in "._":
        return "Start and end with a letter or number."
    if ".." in username or "__" in username or "._" in username or "_." in username:
        return "Don't put dots or underscores next to each other."
    if username.isdigit():
        return "Add at least one letter, so it can't be mistaken for a phone number."
    if username in RESERVED or username.startswith("sheda"):
        return "That name is reserved. Please choose another."
    return None


async def is_taken(username: str, db: AsyncSession, own_email: Optional[str] = None) -> bool:
    from app.models.user import BaseUser

    stmt = select(BaseUser.id).where(func.lower(BaseUser.username) == username)
    if own_email:
        stmt = stmt.where(BaseUser.email != own_email)
    return (await db.execute(stmt.limit(1))).first() is not None


def _ascii_words(name: str) -> List[str]:
    folded = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode()
    return [w for w in re.split(r"[^a-z0-9]+", folded.lower()) if w]


def _candidates(name: str) -> List[str]:
    words = _ascii_words(name)
    if not words:
        return []
    first, last = words[0], words[-1]
    raw = []
    if len(words) > 1:
        raw += [f"{first}{last}", f"{first}.{last}", f"{first}_{last}", f"{first}{last[0]}", f"{first[0]}{last}"]
    raw += ["".join(words), first]
    out = []
    for c in raw:
        c = c[:MAX_LEN].strip("._")
        if c and c not in out:
            out.append(c)
    return out


async def suggest(name: str, db: AsyncSession, own_email: Optional[str] = None, limit: int = 3) -> List[str]:
    """Free usernames made from a full name (or a wanted username), best first."""
    bases = _candidates(name)
    found: List[str] = []

    async def offer(candidate: str) -> None:
        if candidate in found or len(found) >= limit:
            return
        if problem(candidate) is None and not await is_taken(candidate, db, own_email):
            found.append(candidate)

    for base in bases:
        await offer(base)
    # Then numbered versions of the best base: adesinayusuf2, adesinayusuf3...
    if bases:
        top = bases[0]
        for n in range(2, 60):
            if len(found) >= limit:
                break
            await offer(f"{top[: MAX_LEN - len(str(n))]}{n}")
    # Short names ("Al") or unusual ones: pad with digits.
    # Bounded: a reserved stem ("Sheda Admin") would never produce a valid one.
    for attempt in range(40):
        if len(found) >= limit:
            break
        stem = bases[0] if bases and attempt < 20 else "member"
        await offer(f"{stem[: MAX_LEN - 4]}{secrets.randbelow(9000) + 1000}")
    return found


async def unique_from_name(name: str, db: AsyncSession) -> str:
    """One free username for a new account (Google sign-up)."""
    picks = await suggest(name, db, limit=1)
    return picks[0] if picks else f"member{secrets.randbelow(900000) + 100000}"
