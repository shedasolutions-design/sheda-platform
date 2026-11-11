import os
from starlette.middleware import Middleware
from starlette.middleware.sessions import SessionMiddleware
from starlette_admin import DropDown
from starlette_admin.views import Link
from starlette_admin.contrib.sqla import Admin as StarletteAdmin, ModelView
from core.database import engine
from core.configs import settings
from app.models import *
from .resources import *
from .auth import AdminAuthProvider
from .views import ContractsView, DashboardView

# Absolute, because the working directory is not this folder on Workers; and
# optional, because a Worker bundle may not carry the image files.
_static = os.path.join(settings.BASE_DIR, "static")
_static = _static if os.path.isdir(_static) else None

# Sheda's theme and its own pages; anything not here falls back to the
# package's templates.
_templates = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")


def _list(view, label, icon):
    """A model's list page with a readable name and an icon in the menu."""
    view.label = label
    view.icon = icon
    return view


admin = StarletteAdmin(
    engine,
    title="Sheda Admin",
    base_url="/sheda-backend",
    route_name="sheda-backend",
    templates_dir=_templates,
    statics_dir=_static,
    favicon_url="/static/sheda-solutions.ico" if _static else None,
    debug=settings.DEBUG_MODE,
    logo_url="/static/sheda-solutions.png" if _static else None,
    login_logo_url="/static/sheda-solutions.png" if _static else None,
    auth_provider=AdminAuthProvider(),
    # Its own key (not the API token key), 8-hour sessions, and HTTPS-only
    # cookies wherever the panel is served over HTTPS.
    middlewares=[
        Middleware(
            SessionMiddleware,
            secret_key=settings.ADMIN_SECRET_KEY,
            session_cookie="sheda_admin",
            max_age=8 * 3600,
            same_site="lax",
            https_only=not settings.DEBUG_MODE,
        )
    ],
    index_view=DashboardView(label="Dashboard", icon="fa fa-gauge", path="/", template_path="dashboard.html"),
)

admin.add_view(
    ContractsView(label="Smart contracts", icon="fa fa-file-contract", path="/contracts", name="contracts", template_path="contracts.html")
)

admin.add_view(
    DropDown(
        "People",
        icon="fa fa-users",
        always_open=False,
        views=[
            _list(BaseUserModelView(BaseUser), "All users", "fa fa-user"),
            _list(ClientModelView(Client), "Buyers", "fa fa-user-tag"),
            _list(AgentModelView(Agent), "Sellers", "fa fa-user-tie"),
            _list(AdminModelView(Admin), "Admins", "fa fa-user-shield"),
            _list(ModelView(Rating), "Ratings", "fa fa-star"),
        ],
    )
)
admin.add_view(
    DropDown(
        "Properties",
        icon="fa fa-house",
        always_open=False,
        views=[
            _list(PropertyModelView(Property), "Listings", "fa fa-house"),
            _list(PropertyImageModelView(PropertyImage), "Photos", "fa fa-image"),
            _list(MintedPropertyDraftModelView(MintedPropertyDraft), "Unfinished listings", "fa fa-pen-ruler"),
            _list(ModelView(AgentAvailability), "Viewing hours", "fa fa-clock"),
            _list(ModelView(Appointment), "Viewings", "fa fa-calendar-check"),
        ],
    )
)
admin.add_view(
    DropDown(
        "Deals",
        icon="fa fa-handshake",
        always_open=False,
        views=[
            _list(TransactionRecordModelView(TransactionRecord), "Deals", "fa fa-handshake"),
            _list(ContractModelView(Contract), "Agreements", "fa fa-file-signature"),
            _list(ModelView(PaymentConfirmation), "Payment confirmations", "fa fa-receipt"),
            _list(TransactionNotificationModelView(TransactionNotification), "Deal notifications", "fa fa-bell"),
            _list(TransactionAuditLogModelView(TransactionAuditLog), "Audit log", "fa fa-clipboard-list"),
        ],
    )
)
admin.add_view(
    DropDown(
        "Collections",
        icon="fa fa-layer-group",
        always_open=False,
        views=[
            _list(ModelView(CollectionProject), "Projects", "fa fa-building"),
            _list(ModelView(CollectionPhase), "Phases", "fa fa-list-ol"),
            _list(ModelView(CollectionPhaseUpdate), "Phase updates", "fa fa-bullhorn"),
            _list(ModelView(CollectionUnit), "Units", "fa fa-cubes"),
            _list(ModelView(CollectionProfile), "Builders & profiles", "fa fa-id-badge"),
            _list(ModelView(CollectionDocument), "Documents", "fa fa-file-lines"),
            _list(ModelView(CollectionProjectImage), "Project photos", "fa fa-images"),
            _list(ModelView(CollectionChainRecord), "Chain records", "fa fa-link"),
        ],
    )
)
admin.add_view(
    DropDown(
        "Wallets & messages",
        icon="fa fa-wallet",
        always_open=False,
        views=[
            _list(WalletMappingModelView(WalletMapping), "Wallets", "fa fa-wallet"),
            _list(ModelView(AccountInfo), "Bank details", "fa fa-building-columns"),
            _list(ModelView(ChatMessage), "Chat messages", "fa fa-comments"),
            _list(DeviceTokenModelView(DeviceToken), "Devices", "fa fa-mobile-screen"),
        ],
    )
)
admin.add_view(Link(label="Open the app", icon="fa fa-arrow-up-right-from-square", url="https://market.sheda.app", target="_blank"))
