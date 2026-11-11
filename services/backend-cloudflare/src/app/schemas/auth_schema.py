from pydantic import BaseModel, EmailStr, Field, BeforeValidator,AfterValidator
from app.utils.enums import PhoneStr, AccountTypeEnum
from typing import Union, Optional, Annotated, Literal
from app.utils.utils import hash_password
from typing import List


class TokenData(BaseModel):
    sub: Annotated[Optional[Union[str, EmailStr, PhoneStr,int]], AfterValidator(str)]
    scopes: Optional[List[Union[str, None]]] = []


class LoginData(BaseModel):
    username: Union[EmailStr, PhoneStr, str]
    password: str


class Token(BaseModel):
    access_token: str
    token_type: Optional[str] = "Bearer"


from app.schemas.user_schema import UserShow


class SignUpShow(BaseModel):
    token: Token
    user_data: UserShow

    class Config:
        from_attributes = True


class BuyerLogin(BaseModel):
    email: Annotated[EmailStr, Field(examples=["penivera655@gmail.com"])]
    password: str


class OtpSchema(BaseModel):
    otp: Union[str, int]




class PasswordReset(BaseModel):
    password: Annotated[str, BeforeValidator(hash_password), Field(examples=["admin"])]


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