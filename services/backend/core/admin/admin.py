from starlette.middleware import Middleware
from starlette.middleware.sessions import SessionMiddleware
from starlette_admin.contrib.sqla import Admin as StarletteAdmin, ModelView
from core.database import engine
from core.configs import settings
from app.models import *
from .resources import *
from .auth import AdminAuthProvider

admin = StarletteAdmin(
    engine,
    title="Sheda Solutions Admin",
    base_url="/sheda-backend",
    route_name="sheda-backend",
    statics_dir="static",
    favicon_url="/static/sheda-solutions.ico",
    debug=settings.DEBUG_MODE,
    logo_url="/static/sheda-solutions.png",
    login_logo_url="/static/sheda-solutions.png",
    auth_provider=AdminAuthProvider(),
    middlewares=[Middleware(SessionMiddleware, secret_key=settings.SECRET_KEY)],
)

# Register models here
admin.add_view(BaseUserModelView(BaseUser))
admin.add_view(ClientModelView(Client))
admin.add_view(AgentModelView(Agent))
admin.add_view(AdminModelView(Admin))
admin.add_view(PropertyModelView(Property))
admin.add_view(PropertyImageModelView(PropertyImage))
admin.add_view(ModelView(Appointment))
admin.add_view(ModelView(AgentAvailability))
admin.add_view(ContractModelView(Contract))
admin.add_view(ModelView(AccountInfo))
admin.add_view(ModelView(PaymentConfirmation))
admin.add_view(ModelView(ChatMessage))
admin.add_view(WalletMappingModelView(WalletMapping))
admin.add_view(DeviceTokenModelView(DeviceToken))
admin.add_view(TransactionRecordModelView(TransactionRecord))
admin.add_view(TransactionNotificationModelView(TransactionNotification))
admin.add_view(TransactionAuditLogModelView(TransactionAuditLog))
admin.add_view(MintedPropertyDraftModelView(MintedPropertyDraft))
