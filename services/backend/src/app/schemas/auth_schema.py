from pydantic import BaseModel, EmailStr, Field, BeforeValidator,AfterValidator
from app.utils.enums import PhoneStr, AccountTypeEnum, ProfileEnum
from typing import Union, Optional, Annotated, Literal
from app.utils.utils import hash_password
from typing import List


class TokenData(BaseModel):
    sub: Annotated[Optional[Union[str, EmailStr, PhoneStr,int]], AfterValidator(str)]
    scopes: Optional[List[Union[str, None]]] = []
    # Echoed into the JWT so a client can read its own profile without a
    # round trip. It is never the source of truth: every server-side read
    # re-derives the profile from the row `sub` points at (see
    # get_active_profile), so a tampered or stale claim cannot widen access
    # or make the server serve one profile's data while asserting the other.
    active_profile: Optional[ProfileEnum] = None


class LoginData(BaseModel):
    username: Union[EmailStr, PhoneStr, str]
    password: str
    # Absent means buyer — that is what every existing client sends.
    profile: Optional[ProfileEnum] = None


class Token(BaseModel):
    access_token: str
    token_type: Optional[str] = "Bearer"
    # Additive and optional: existing clients ignore it, new ones use it to
    # route without decoding the JWT.
    active_profile: Optional[ProfileEnum] = None


from app.schemas.user_schema import UserShow


class SignUpShow(BaseModel):
    token: Token
    user_data: UserShow
    # True only when this request created the account. Google is both a
    # sign-up and a sign-in route, so a returning user authenticating through
    # it must not be handed a second wallet by the client's auto-provisioning.
    is_new_user: bool = False

    class Config:
        from_attributes = True


class BuyerLogin(BaseModel):
    email: Annotated[EmailStr, Field(examples=["penivera655@gmail.com"])]
    password: str


class OtpSchema(BaseModel):
    otp: Union[str, int]




class PasswordReset(BaseModel):
    password: Annotated[str, BeforeValidator(hash_password), Field(examples=["admin"])]


class PasswordChange(BaseModel):
    """A signed-in user changing their password. Unlike PasswordReset (the
    forgot-password flow, where the emailed code is the proof), this requires
    the current password, so a stolen session cannot lock the owner out."""

    current_password: Annotated[str, Field(min_length=1)]
    new_password: Annotated[str, Field(min_length=8)]


class SwitchAccountType(BaseModel):
    switch_to: Annotated[AccountTypeEnum, Field(default=AccountTypeEnum.agent)]

class ForgotPasswordVerifyRequest(BaseModel):
    email: Annotated[EmailStr, Field(examples=["penivera655@gmail.com"])]
    otp: str

class ForgotPasswordResetRequest(BaseModel):
    email: Annotated[EmailStr, Field(examples=["penivera655@gmail.com"])]


class SocialLoginRequest(BaseModel):
    token: str
    provider: Literal["google"] = "google"
    profile: Optional[ProfileEnum] = None