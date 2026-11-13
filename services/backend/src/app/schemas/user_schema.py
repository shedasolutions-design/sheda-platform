from pydantic import BaseModel, BeforeValidator, AfterValidator, EmailStr, Field, AnyUrl
from app.utils.enums import AccountTypeEnum
from app.utils.utils import hash_password, decode_url
from datetime import datetime
from app.utils.enums import KycStatusEnum, UserRole, PhoneStr, ProfileEnum
from typing import Union, Literal, List, Optional, Annotated
from app.schemas.property_schema import PropertyShow, AvailabilityShow, AppointmentShow


# NOTE - Base User Schema and response schema
class BaseUserSchema(BaseModel):
    avatar_url: Annotated[
        Optional[Union[AnyUrl, str]],
        AfterValidator(decode_url),
        Field(examples=["https://example/img/user.jpg"], max_length=255),
    ] = None
    username: Annotated[Optional[str], Field(example="Admin", max_length=254)] = None  # type: ignore
    email: Annotated[Optional[EmailStr], Field(examples=["penivera655@gmail.com"])] = (
        None
    )
    phone_number: Annotated[
        Optional[PhoneStr], BeforeValidator(lambda x: None if x == "" else x)
    ] = None
    account_type: Optional[AccountTypeEnum]
    fullname: Optional[str] = None
    location: Optional[str] = None

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    username: Annotated[str, Field(example="Admin", max_length=254)] = None  # type: ignore
    email: Annotated[EmailStr, Field(examples=["penivera655@gmail.com"])]
    password: Annotated[str, BeforeValidator(hash_password), Field(examples=["admin"])]
    near_account_id: Annotated[str, Field(example="user.testnet", max_length=255)]
    # Which profile the returned token signs them into. Both rows are created
    # regardless (see create_account) — this only picks where they land.
    # Not a column: create_account strips it before building the models.
    profile: Optional[ProfileEnum] = None


class AccountInfoBase(BaseModel):
    account_name: Optional[str] = None
    bank_name: Optional[str] = None
    acount_number: Annotated[
        Optional[str], Field(examples=["1234567890"], max_length=20, default=None)
    ]


class AccountInfoShow(AccountInfoBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True


class UserShow(BaseUserSchema):
    id: int
    near_account_id: Optional[str] = None
    device_token: Optional[str] = None
    agency_name: Optional[str] = None
    is_active: Optional[bool] = None
    is_deleted: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    verified: Optional[bool] = None
    kyc_status: Optional[KycStatusEnum] = None
    listing: Optional[List[PropertyShow]] = []
    appointments: Optional[List[AppointmentShow]] = []
    account_info: Optional[List[AccountInfoShow]] = []
    availabilities: Optional[List[AvailabilityShow]] = []

    class Config:
        from_attributes = True


class UserInDB(UserShow):
    id: int
    password: str
    role: UserRole


class UserUpdate(BaseUserSchema):
    avatar_url: Annotated[
        Optional[Union[AnyUrl, str]],
        AfterValidator(decode_url),
        Field(examples=["https://example/img/user.jpg"], max_length=255),
    ] = None
    username: Annotated[Optional[str], Field(example="Admin", max_length=254)] = None  # type: ignore
    email: Annotated[Optional[EmailStr], Field(examples=["penivera655@gmail.com"])] = (
        None
    )
    phone_number: Annotated[
        Optional[PhoneStr], BeforeValidator(lambda x: None if x == "" else x)
    ] = None
    fullname: Optional[str] = None
    location: Optional[str] = None
    # The seller's agency or company, shown on their listings. It was sent by
    # the app but missing here, so it was silently dropped on every save.
    agency_name: Annotated[Optional[str], Field(max_length=50)] = None
    # Kept in the response; never applied from a request (see
    # services/profile.SYSTEM_FIELDS).
    kyc_status: Optional[KycStatusEnum] = None
    rating: Optional[float] = None

    class Config:
        from_attributes = True


class FileShow(BaseModel):
    file_url: str

    class Config:
        from_attributes = True


FileDir = Literal["profile", "property"]


class AgentFeed(BaseModel):
    avatar_url: Optional[Union[AnyUrl, str]] = None
    username: Optional[str] = None
    # Contact details are only filled in for someone with a viewing booked
    # with this seller; see routers/listing.agent_profile.
    email: Optional[EmailStr] = None
    phone_number: Optional[PhoneStr] = None
    agency_name: Optional[str] = None
    location: Optional[str] = None
    kyc_status: Optional[KycStatusEnum] = None
    last_seen: Optional[datetime] = None
    rating: Optional[float] = None
    listings: List[PropertyShow] = []
    availabilities: List[AvailabilityShow] = []

    class Config:
        from_attributes = True


class RatingShow(BaseModel):
    rating: float

    class Config:
        from_attributes = True
