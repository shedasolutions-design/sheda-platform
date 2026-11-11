from fastapi import APIRouter, status, HTTPException, BackgroundTasks
from app.models.user import BaseUser
from app.schemas.user_schema import UserCreate, UserInDB
from app.services.auth import process_signup, process_logout, get_user
from app.services.auth import authenticate_user, create_access_token, switch_account, process_social_login
from app.utils.enums import AccountTypeEnum
from core.dependecies import PassWordRequestForm, VerificationException
from core.dependecies import DBSession, HTTPBearerDependency
from app.schemas.auth_schema import (
    LoginData,
    Token,
    OtpSchema,
    PasswordReset,
    SwitchAccountType,
    TokenData,
    ForgotPasswordVerifyRequest,
    ForgotPasswordResetRequest,
    SocialLoginRequest,
)
from core.configs import settings
from core.logger import logger
from app.services.user_service import (
    reset_password,
    OtpVerification,
    ActiveUser,
    GetUser,
)
from app.utils.utils import verify_otp, blacklist_token, token_exp_time
from app.utils.email import create_send_otp
from app.schemas.auth_schema import SignUpShow

router = APIRouter(
    tags=["Auth"],
    prefix="/auth",
)


# NOTE -  fixed user creation response
@router.post(
    "/signup",
    response_model=SignUpShow,
    status_code=status.HTTP_202_ACCEPTED,
    description=settings.SIGN_UP_DESC,
)
async def signup_user(
    request: UserCreate, db: DBSession, background_tasks: BackgroundTasks
):
    return await process_signup(request, db, background_tasks)  # type: ignore # type: ignore


@router.post(
    "/social-login",
    response_model=SignUpShow,
    status_code=status.HTTP_200_OK,
    description="Authenticates a user via a social identity provider (e.g. Google) and returns an access token.",
)
async def social_login(
    payload: SocialLoginRequest, db: DBSession, background_tasks: BackgroundTasks
):
    return await process_social_login(payload, db, background_tasks)


@router.post(
    "/verify-account", response_model=Token, status_code=status.HTTP_201_CREATED
)
async def verify_account(current_user: OtpVerification, db: DBSession):
    refresh_user = await db.get(BaseUser, current_user.id)
    refresh_user.verified = True  # type: ignore
    db.add(refresh_user)
    await db.commit()

    scopes = [current_user.account_type.value, current_user.role.value]  # type: ignore
    access_token = await create_access_token(
        data=TokenData(sub=current_user.id, scopes=scopes)  # type: ignore
    )
    return Token(access_token=access_token)


# NOTE - Login Route
@router.post("/login", response_model=Token)
async def login_for_access_token(
    form_data: PassWordRequestForm, db: DBSession
) -> Token:
    login_data = LoginData(**form_data.__dict__)  # type: ignore
    user: UserInDB = await authenticate_user(login_data, db)
    scopes = [user.account_type.value, user.role.value]  # type: ignore
    access_token = await create_access_token(
        data=TokenData(sub=user.id, scopes=scopes),  # type: ignore
    )
    return Token(access_token=access_token)


@router.post("/logout", status_code=status.HTTP_202_ACCEPTED)
async def logout(current_user: GetUser, credential: HTTPBearerDependency):
    return await process_logout(credential.credentials)


@router.put(
    "/reset-password",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=Token,
    description="Reset Password",
)
async def reset_pwd(
    current_user: ActiveUser,
    payload: PasswordReset,
    db: DBSession,
):
    await reset_password(current_user, db, payload.password)
    scopes = [current_user.account_type.value]  # type: ignore
    token = await create_access_token(data=TokenData(sub=current_user.id, scopes=scopes))  # type: ignore
    return Token(access_token=token)


@router.post("/send-otp", response_model=dict, status_code=status.HTTP_202_ACCEPTED)
async def send_otp(current_user: ActiveUser):
    otp_sent = await create_send_otp(current_user.email)  # type: ignore
    if not otp_sent:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to send OTP"
        )
    return {"detail": "OTP sent"}


verify_otp_desc = """Token returned from this endpoint is valid for only `5 minutes`
<h3><b>Once the OTP is verified the token is blacklisted</b></h3>
<b><i>These tokens carry a scope that allows only actions that need OTP verification therefore cannot be used elsewhere</i></b>"""


# NOTE - Verification Endpoint
@router.post(
    "/verify-otp",
    response_model=Token,
    status_code=status.HTTP_200_OK,
    description=verify_otp_desc,
)
async def verify_otp_route(payload: OtpSchema, current_user: ActiveUser):
    verified = await verify_otp(**payload.model_dump(), email=current_user.email)  # type: ignore
    if not verified:
        raise VerificationException
    scopes = ["otp"]
    access_token = await create_access_token(
        data=TokenData(sub=current_user.id, scopes=scopes),  # type: ignore
        expire_time=5,  # type: ignore
    )
    return Token(access_token=access_token)


token_refresh_desc = """This endpoint refreshes a user's token including the neccesary permissions for the account type,in case of <b>unauthorized</b> or <b>account type changes</b>
The previous token will be `blacklisted`"""


@router.put(
    "/refresh-token",
    response_model=Token,
    status_code=status.HTTP_200_OK,
    description=token_refresh_desc,
)
async def refresh_token(current_user: ActiveUser, credential: HTTPBearerDependency):
    scopes = [current_user.account_type.value]  # type: ignore
    token_exp = await token_exp_time(credential.credentials)
    await blacklist_token(credential.credentials, token_exp)  # type: ignore
    new_token = await create_access_token(
        data=TokenData(sub=current_user.id, scopes=scopes)  # type: ignore
    )  # type: ignore
    return Token(access_token=new_token)


# STUB - Switch account type
@router.post("/switch-account", status_code=status.HTTP_200_OK, response_model=Token)
async def switch_account_type(
    credential: HTTPBearerDependency,
    payload: SwitchAccountType,
    current_user: ActiveUser,
    db: DBSession,
):
    new_token = await switch_account(payload.switch_to, current_user, db)  # type: ignore
    exp_time = await token_exp_time(credential.credentials)
    await blacklist_token(credential.credentials, exp_time)  # type: ignore
    return new_token


@router.post("/forgot-password", status_code=status.HTTP_200_OK, response_model=dict)
async def forgot_password(payload: ForgotPasswordResetRequest, db: DBSession):
    user = await get_user(payload.email, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    otp_sent = await create_send_otp(user.email)  # type: ignore
    if not otp_sent:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to send OTP"
        )
    return {"detail": "OTP sent"}


@router.post(
    "/verify-forgot-password", status_code=status.HTTP_200_OK, response_model=Token
)
async def verify_forgot_password(payload: ForgotPasswordVerifyRequest, db: DBSession):
    user = await get_user(payload.email, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    verified = await verify_otp(payload.otp, user.email)  # type: ignore
    if not verified:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid OTP"
        )
    token = await create_access_token(data=TokenData(sub=user.id), expire_time=5)  # type: ignore
    return Token(access_token=token)
