"""Sheda's own pages in the admin panel: the dashboard and Smart contracts."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from starlette.requests import Request
from starlette.responses import Response
from starlette.templating import Jinja2Templates
from starlette_admin import CustomView

from app.models import (
    Appointment,
    BaseUser,
    ChatMessage,
    CollectionProject,
    Property,
    TransactionRecord,
)
from core.configs import settings
from core.database import AsyncSessionLocal


async def _count(session, model, *where) -> int:
    stmt = select(func.count()).select_from(model)
    for w in where:
        stmt = stmt.where(w)
    return int((await session.execute(stmt)).scalar() or 0)


class DashboardView(CustomView):
    """Home page: the numbers worth glancing at, and what's just happened."""

    async def render(self, request: Request, templates: Jinja2Templates) -> Response:
        week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        stats, recent_users, recent_properties, error = [], [], [], None
        try:
            async with AsyncSessionLocal() as s:
                users = await _count(s, BaseUser)
                new_users = await _count(s, BaseUser, BaseUser.created_at >= week_ago)
                properties = await _count(s, Property)
                live = await _count(s, Property, Property.is_active.is_(True))
                deals = await _count(s, TransactionRecord)
                appointments = await _count(s, Appointment)
                messages = await _count(s, ChatMessage)
                projects = await _count(s, CollectionProject)
                stats = [
                    ("Users", users, f"+{new_users} this week", "fa-users"),
                    ("Properties", properties, f"{live} live on the market", "fa-house"),
                    ("Deals recorded", deals, "bids, leases and sales", "fa-handshake"),
                    ("Viewings booked", appointments, "all time", "fa-calendar-check"),
                    ("Messages", messages, "between buyers and sellers", "fa-comments"),
                    ("Collections projects", projects, "raises created", "fa-layer-group"),
                ]
                recent_users = (
                    await s.execute(select(BaseUser).order_by(BaseUser.created_at.desc()).limit(6))
                ).scalars().all()
                recent_properties = (
                    await s.execute(select(Property).order_by(Property.created_at.desc()).limit(6))
                ).scalars().all()
        except Exception as exc:  # the page still renders, with the reason
            error = f"Couldn't load the numbers: {exc.__class__.__name__}"
        return templates.TemplateResponse(
            request=request,
            name="dashboard.html",
            context={
                "title": "Dashboard",
                "stats": stats,
                "recent_users": recent_users,
                "recent_properties": recent_properties,
                "error": error,
                "base": settings.ADMIN_ROUTE,
            },
        )


# Contracts are per network. Only what is actually deployed is listed.
CONTRACTS = {
    "testnet": {
        "market": "market.shedauser.testnet",
        "raise": "sheda-raise-v3.testnet",
        "stake": "sheda-stake-v3.testnet",
    },
    "mainnet": {"market": "", "raise": "", "stake": ""},
}


class ContractsView(CustomView):
    """Live contract state, and every admin function as a form that writes
    the signing command. The panel never holds the owner key: a server with
    that key is one break-in away from emptying the escrow."""

    async def render(self, request: Request, templates: Jinja2Templates) -> Response:
        network = request.query_params.get("network", "testnet")
        network = network if network in CONTRACTS else "testnet"
        return templates.TemplateResponse(
            request=request,
            name="contracts.html",
            context={
                "title": "Smart contracts",
                "network": network,
                "contracts": CONTRACTS[network],
                "rpc": "https://test.rpc.fastnear.com" if network == "testnet" else "https://free.rpc.fastnear.com",
                "explorer": "https://testnet.nearblocks.io" if network == "testnet" else "https://nearblocks.io",
            },
        )
