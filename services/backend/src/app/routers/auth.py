from fastapi import APIRouter, status, HTTPException, BackgroundTasks, Query
from typing import Optional
from app.models.user import BaseUser
from app.schemas.user_schema import UserCreate, UserInDB
from app.services.auth import process_signup, process_logout, get_user
from app.services.auth import authenticate_user, create_access_token, switch_account, process_social_login
from app.utils.enums import (
    AccountTypeEnum,
    ProfileEnum,
    account_type_to_profile,
    profile_to_account_type,
)
from core.dependecies import PassWordRequestForm, VerificationException
from core.dependecies import DBSession, HTTPBearerDependency
from app.schemas.auth_schema import (
    LoginData,
    Token,
    OtpSchema,
    PasswordReset,
    PasswordChange,
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
from app.schemas.auth_schema import (
    ChangeEmailStart,
    CodeRequest,
    ConfirmEmailRequest,
    ConfirmPasswordRequest,
    DeviceCheck,
    DeviceCodeRequest,
    DeviceResendRequest,
)
from app.services import device_check

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
    active_profile = account_type_to_profile(current_user.account_type)  # type: ignore
    access_token = await create_access_token(
        data=TokenData(  # type: ignore
            sub=current_user.id,  # type: ignore
            scopes=scopes,
            active_profile=active_profile,
        )
    )
    return Token(access_token=access_token, active_profile=active_profile)


# NOTE - Login Route
@router.post("/login", response_model=Token)
async def login_for_access_token(
    form_data: PassWordRequestForm, db: DBSession
) -> Token:
    login_data = LoginData(**form_data.__dict__)  # type: ignore
    user: UserInDB = await authenticate_user(login_data, db)
    # The password was right. On a device this account hasn't used, it is
    # not enough on its own: hold the sign-in until the emailed code comes
    # back (POST /auth/login/verify-device).
    device_id = getattr(form_data, "device_id", None)
    if device_check.enabled() and not await device_check.is_trusted(user.email, device_id):  # type: ignore
        challenge = await device_check.start(user, device_id)
        return Token(
            access_token="",
            device_check=DeviceCheck(challenge=challenge, email_hint=device_check.mask_email(user.email)),  # type: ignore
        )
    return await _signin_token(user)


async def _signin_token(user) -> Token:
    scopes = [user.account_type.value, user.role.value]  # type: ignore
    # Derived from the row that was actually authenticated, never from what
    # the caller asked for — so the claim can't describe a different identity
    # than `sub` points at.
    active_profile = account_type_to_profile(user.account_type)  # type: ignore
    access_token = await create_access_token(
        data=TokenData(sub=user.id, scopes=scopes, active_profile=active_profile),  # type: ignore
    )
    return Token(access_token=access_token, active_profile=active_profile)


@router.post("/login/verify-device", response_model=Token)
async def verify_device(payload: DeviceCodeRequest, db: DBSession) -> Token:
    """Finish a sign-in that was held for a code: the device is remembered."""
    user = await device_check.finish(payload.challenge, payload.otp, db)
    return await _signin_token(user)


@router.post("/login/resend-code", status_code=status.HTTP_202_ACCEPTED, response_model=dict)
async def resend_device_code(payload: DeviceResendRequest):
    await device_check.resend(payload.challenge)
    return {"detail": "Code sent"}


@router.post("/confirm-email", status_code=status.HTTP_200_OK, response_model=dict)
async def confirm_email(payload: ConfirmEmailRequest, current_user: ActiveUser, db: DBSession):
    """The code sent at sign-up. Keeps the session: nothing to swap or re-sign."""
    from app.utils.utils import verify_otp

    if not await verify_otp(payload.otp, current_user.email):  # type: ignore
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid code. Please check it and try again.")
    await device_check.mark_email_verified(current_user.email, db)  # type: ignore
    await device_check.trust(current_user.email, payload.device_id)  # type: ignore
    return {"verified": True}


@router.post("/confirm-password", status_code=status.HTTP_200_OK, response_model=dict)
async def confirm_password(payload: ConfirmPasswordRequest, current_user: ActiveUser):
    """Re-check the password of the person already signed in.

    For screens that ask "enter your password to continue" (viewing wallet
    keys). They used to call /auth/login, which on a browser the server
    didn't remember also emailed a sign-in code nobody asked for.
    """
    from app.utils.utils import verify_password

    if not verify_password(payload.password, current_user.password):  # type: ignore
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="That password is incorrect.")
    return {"ok": True}


@router.post("/verify-code", status_code=status.HTTP_200_OK, response_model=dict)
async def verify_code(payload: CodeRequest, current_user: ActiveUser, db: DBSession):
    """Check a code sent with /auth/send-otp. The session is kept as it is.

    /auth/verify-otp swaps the session for a five-minute code-only token,
    which signed people out of everything else soon after (PIN reset did).
    """
    if not await verify_otp(str(payload.otp), current_user.email):  # type: ignore
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid code. Please check it and try again.")
    await device_check.mark_email_verified(current_user.email, db)  # type: ignore
    return {"ok": True}


EMAIL_CHANGE_SECONDS = 15 * 60


@router.post("/change-email/start", status_code=status.HTTP_202_ACCEPTED, response_model=dict)
async def change_email_start(payload: ChangeEmailStart, current_user: ActiveUser, db: DBSession):
    """Send a code to the new address. Nothing changes until it comes back."""
    from sqlalchemy import func, select

    from core.configs import redis

    new = str(payload.new_email).strip().lower()
    old = (current_user.email or "").strip().lower()  # type: ignore
    if new == old:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That's already your email.")
    taken = await db.execute(
        select(BaseUser.id).where(func.lower(BaseUser.email) == new, BaseUser.email != current_user.email).limit(1)
    )
    if taken.first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.")
    await redis.setex(f"email_change:{old}", EMAIL_CHANGE_SECONDS, new)
    if not await create_send_otp(new, purpose="email_change"):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="We couldn't send the code. Please try again.")
    return {"detail": "Code sent", "sent_to": device_check.mask_email(new)}


@router.post("/change-email/confirm", status_code=status.HTTP_200_OK, response_model=dict)
async def change_email_confirm(payload: CodeRequest, current_user: ActiveUser, db: DBSession):
    """The code reached the new inbox: switch both profiles to it, tell the old one."""
    from sqlalchemy import func, select, update

    from core.configs import redis
    from app.utils.email import branded_email, email_sender

    old_email = current_user.email  # type: ignore
    key = f"email_change:{(old_email or '').strip().lower()}"
    new = await redis.get(key)
    if isinstance(new, bytes):
        new = new.decode()
    if not new:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This change has expired. Please start again.")
    if not await verify_otp(str(payload.otp), new):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid code. Please check it and try again.")
    taken = await db.execute(
        select(BaseUser.id).where(func.lower(BaseUser.email) == new, BaseUser.email != old_email).limit(1)
    )
    if taken.first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.")
    await db.execute(update(BaseUser).where(BaseUser.email == old_email).values(email=new, verified=True))
    await db.commit()
    await redis.delete(key)
    # The old inbox hears about it, so a change nobody meant is noticed.
    try:
        html, text = branded_email(
            "Your Sheda email was changed",
            [f"Your Sheda account now uses {device_check.mask_email(new)}. Sign-in codes and updates go there from now on."],
            notice="If this wasn't you, reply to this email straight away so we can help secure your account.",
        )
        await email_sender.send_email(html, old_email, "Your Sheda email was changed", text_type="html", alt_text=text)
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"Old-address notice not sent: {exc}")
    return {"email": new}


@router.post("/logout", status_code=status.HTTP_202_ACCEPTED)
async def logout(current_user: GetUser, credential: HTTPBearerDependency):
    return await process_logout(credential.credentials)


@router.post(
    "/change-password",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=Token,
    description="Change password; requires the current password",
)
async def change_pwd(
    current_user: ActiveUser,
    payload: PasswordChange,
    db: DBSession,
):
    from app.utils.utils import hash_password, verify_password

    if not verify_password(payload.current_password, current_user.password):  # type: ignore
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your current password is incorrect",
        )
    await reset_password(current_user, db, hash_password(payload.new_password))
    scopes = [current_user.account_type.value]  # type: ignore
    active_profile = account_type_to_profile(current_user.account_type)  # type: ignore
    token = await create_access_token(
        data=TokenData(  # type: ignore
            sub=current_user.id,  # type: ignore
            scopes=scopes,
            active_profile=active_profile,
        )
    )
    return Token(access_token=token, active_profile=active_profile)


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
    active_profile = account_type_to_profile(current_user.account_type)  # type: ignore
    token = await create_access_token(
        data=TokenData(  # type: ignore
            sub=current_user.id,  # type: ignore
            scopes=scopes,
            active_profile=active_profile,
        )
    )
    return Token(access_token=token, active_profile=active_profile)


@router.post("/send-otp", response_model=dict, status_code=status.HTTP_202_ACCEPTED)
async def send_otp(
    current_user: ActiveUser,
    purpose: str = Query(default="verify", description="verify (the email) or action (confirm a sensitive change)"),
):
    purpose = purpose if purpose in ("verify", "action") else "verify"
    otp_sent = await create_send_otp(current_user.email, purpose=purpose)  # type: ignore
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
async def refresh_token(
    current_user: ActiveUser,
    credential: HTTPBearerDependency,
    db: DBSession,
    profile: Optional[ProfileEnum] = Query(
        default=None,
        description=(
            "Refresh into this profile instead of the current one. Omit to "
            "keep the profile you already hold."
        ),
    ),
):
    # Omitted means "keep what I have", which is what every existing client
    # does — the profile survives a refresh because it is a property of the
    # row `sub` points at, not something the caller has to resend.
    if profile is not None and settings.NEW_SIGNIN_CHOOSER:
        target = profile_to_account_type(profile)
        if target != current_user.account_type:  # type: ignore
            # Same row-resolution path as /auth/switch-account rather than a
            # second implementation of it: two ways to change identity that
            # can drift apart is exactly the bug this design is avoiding.
            new_token_obj = await switch_account(target, current_user, db)  # type: ignore
            exp = await token_exp_time(credential.credentials)
            await blacklist_token(credential.credentials, exp)  # type: ignore
            return new_token_obj

    scopes = [current_user.account_type.value]  # type: ignore
    active_profile = account_type_to_profile(current_user.account_type)  # type: ignore
    token_exp = await token_exp_time(credential.credentials)
    await blacklist_token(credential.credentials, token_exp)  # type: ignore
    new_token = await create_access_token(
        data=TokenData(  # type: ignore
            sub=current_user.id,  # type: ignore
            scopes=scopes,
            active_profile=active_profile,
        )
    )  # type: ignore
    return Token(access_token=new_token, active_profile=active_profile)


# STUB - Switch account type
@router.post("/switch-account", status_code=status.HTTP_200_OK, response_model=Token)
async def switch_account_type(
    credential: HTTPBearerDependency,
    payload: SwitchAccountType,
    current_user: ActiveUser,
    db: DBSession,
):
    # Already on that profile: nothing to switch, so keep the token. The web
    # app confirms the profile on every page load; revoking the token each
    # time broke every other request still carrying it ("Token has been
    # revoked" on wallet funding, chat sockets dropping and reconnecting).
    if current_user.account_type is not None and AccountTypeEnum(current_user.account_type) == AccountTypeEnum(payload.switch_to):
        return Token(
            access_token=credential.credentials,
            active_profile=account_type_to_profile(current_user.account_type),
        )
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
    otp_sent = await create_send_otp(user.email, purpose="reset")  # type: ignore
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
