from app.models import *
from starlette_admin.contrib.sqla import ModelView
from starlette_admin import DateField, ImageField, PasswordField, EnumField
from starlette.requests import Request
from starlette.datastructures import UploadFile
from typing import Any, Dict
from app.utils.utils import hash_password
import cloudinary.uploader
from app.utils.enums import AccountTypeEnum, KycStatusEnum, UserRole
from starlette_admin.exceptions import FormValidationError
from starlette.templating import Jinja2Templates
from starlette_admin.views import CustomView
from starlette.responses import HTMLResponse
from core.configs import settings




class BaseUserModelView(ModelView):
    icon = "fa fa-user"

    # Configure fields: ImageField shows upload button, PasswordField masks input
    fields = [
        "id",
        "username",
        "email",
        ImageField("avatar_url", required=False),
        PasswordField("password"),
        "fullname",
        "phone_number",
        "location",
        EnumField("account_type", enum=AccountTypeEnum),
        EnumField("kyc_status", enum=KycStatusEnum),
        EnumField("role", enum=UserRole),
        "is_active",
        "verified",
        "created_at",
        "updated_at",
    ]

    # Don't show password hash in list/detail
    exclude_fields_from_list = ["password"]
    exclude_fields_from_detail = ["password"]

    async def _populate_obj(
        self,
        request: Request,
        obj: Any,
        data: Dict[str, Any],
        is_edit: bool = False,
    ) -> Any:
        original_avatar = getattr(obj, "avatar_url", None) if is_edit else None
        await super()._populate_obj(request, obj, data, is_edit)
        if isinstance(getattr(obj, "avatar_url", None), (dict, UploadFile)):
            setattr(obj, "avatar_url", original_avatar)
        return obj

    async def before_create(
        self, request: Request, data: Dict[str, Any], obj: Any
    ) -> None:
        await self._handle_password_and_avatar(data=data, is_edit=False, obj=obj)

    async def before_edit(
        self, request: Request, data: Dict[str, Any], obj: Any
    ) -> None:
        await self._handle_password_and_avatar(data, is_edit=True, obj=obj)

    async def _handle_password_and_avatar(
        self, data: Dict[str, Any], is_edit: bool = False, obj: Any = None
    ):
        # 1. Handle Password Hashing
        password = data.get("password")

        if password and not settings.pwd_context.identify(password):
            hashed = hash_password(password)
            data["password"] = hashed
            if obj:
                obj.password = hashed
        else:
            if not is_edit:
                raise FormValidationError({"password": "Password is required."})
            else:
                data.pop("password", None)

        # 2. Avatar Upload
        raw_avatar = data.get("avatar_url")

        avatar_file = None
        should_clear = False

        if isinstance(raw_avatar, tuple):
            avatar_file, should_clear = raw_avatar
        elif isinstance(raw_avatar, UploadFile):
            avatar_file = raw_avatar

        if should_clear:
            data["avatar_url"] = None
            if obj:
                obj.avatar_url = None
        elif isinstance(avatar_file, UploadFile) and getattr(avatar_file, "filename", None):
            try:
                content = await avatar_file.read()
                if content:
                    response = cloudinary.uploader.upload(content, folder="profile")
                    url = response.get("secure_url")
                    data["avatar_url"] = url
                    if obj:
                        obj.avatar_url = url
                else:
                    data.pop("avatar_url", None)
            except Exception as e:
                print(f"Error uploading avatar: {e}")
                data.pop("avatar_url", None)
        else:
            data.pop("avatar_url", None)

        if "avatar_url" in data and obj:
            obj.avatar_url = data["avatar_url"]
        if "password" in data and obj:
            obj.password = data["password"]
        if "username" in data and obj:
            obj.username = data["username"]


class ClientModelView(BaseUserModelView):
    """
    Admin model for managing clients.
    MUST inherit from BaseUserModelView to use the upload logic.
    """

    icon = "fa fa-user"

    exclude_fields_from_list = ["properties", "password"]
    exclude_fields_from_detail = ["properties", "password"]


class AgentModelView(BaseUserModelView):
    """
    Admin model for managing agents.
    IMPORTANT: Inherits from BaseUserModelView to get password hashing and image upload logic.
    """

    icon = "fa fa-user-tie"

    # Exclude properties to prevent 'eager loading' errors
    exclude_fields_from_list = [
        "listings",
        "availabilities",
        "appointments",
        "password",
    ]
    exclude_fields_from_detail = [
        "listings",
        "availabilities",
        "appointments",
        "password",
    ]


class AdminModelView(BaseUserModelView):
    """
    Admin model for managing admin users.
    Inherits from BaseUserModelView to get password hashing and image upload logic.
    """

    icon = "fa fa-user-shield"


class PropertyModelView(ModelView):
    icon = "fa fa-building"

    label = "Properties"
    name = "Property"


class PropertyImageModelView(ModelView):
    """Handles Property Image uploads."""

    icon = "fa fa-image"

    fields = [
        "id",
        "property",  # Relationship field
        ImageField("image_url"),  # File upload field
        "is_primary",
    ]

    async def _populate_obj(
        self,
        request: Request,
        obj: Any,
        data: Dict[str, Any],
        is_edit: bool = False,
    ) -> Any:
        original_image = getattr(obj, "image_url", None) if is_edit else None
        await super()._populate_obj(request, obj, data, is_edit)
        if isinstance(getattr(obj, "image_url", None), (dict, UploadFile)):
            setattr(obj, "image_url", original_image)
        return obj

    async def before_create(
        self, request: Request, data: Dict[str, Any], obj: Any
    ) -> None:
        await self._handle_image_upload(data, is_edit=False, obj=obj)

    async def before_edit(
        self, request: Request, data: Dict[str, Any], obj: Any
    ) -> None:
        await self._handle_image_upload(data, is_edit=True, obj=obj)

    async def _handle_image_upload(
        self, data: Dict[str, Any], is_edit: bool = False, obj: Any = None
    ):
        image = data.get("image_url")

        image_file = None
        should_clear = False

        if isinstance(image, tuple):
            image_file, should_clear = image
        elif isinstance(image, UploadFile):
            image_file = image

        if should_clear:
            data["image_url"] = None
            if obj:
                obj.image_url = None
        elif isinstance(image_file, UploadFile) and getattr(image_file, "filename", None):
            try:
                content = await image_file.read()
                if content:
                    response = cloudinary.uploader.upload(content, folder="property")
                    url = response.get("secure_url")
                    if url:
                        data["image_url"] = url
                        if obj:
                            obj.image_url = url
                    else:
                        data.pop("image_url", None)
            except Exception as e:
                print(f"Error uploading image: {e}")
                data.pop("image_url", None)
        else:
            data.pop("image_url", None)


class ContractModelView(ModelView):
    """Handles Contracts with Date Validation."""

    icon = "fa fa-file-contract"

    fields = [
        "id",
        "property",
        "client_id",
        "agent_id",
        "contract_type",
        "amount",
        DateField("start_date"),
        DateField("end_date"),
        "is_active",
        "property",
        "payment_confirmation",
    ]

    async def validate(self, request: Request, data: Dict[str, Any]) -> None:
        """Validate that end_date is after start_date."""
        start_date = data.get("start_date")
        end_date = data.get("end_date")

        if start_date and end_date:
            if end_date < start_date:
                # This raises a validation error in the Admin UI
                raise FormValidationError(
                    {"end_date": "End date cannot be before start date."}
                )

        return await super().validate(request, data)


class WalletMappingModelView(ModelView):
    icon = "fa fa-wallet"


class DeviceTokenModelView(ModelView):
    icon = "fa fa-mobile"


class TransactionRecordModelView(ModelView):
    icon = "fa fa-exchange-alt"


class TransactionNotificationModelView(ModelView):
    icon = "fa fa-bell"


class TransactionAuditLogModelView(ModelView):
    icon = "fa fa-history"


class MintedPropertyDraftModelView(ModelView):
    icon = "fa fa-file-signature"
