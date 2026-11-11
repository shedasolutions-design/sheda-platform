from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import BaseUser, Client, Agent
from fastapi import status, HTTPException, BackgroundTasks
from sqlalchemy.future import select
from email_validator import validate_email, EmailNotValidError
import re
from app.schemas.auth_schema import LoginData, Token, TokenData, SignUpShow, SocialLoginRequest

from app.schemas.user_schema import UserInDB, UserCreate, UserShow
from app.utils.utils import verify_password
from app.utils.email import create_send_otp
from datetime import datetime, timezone, timedelta
from core.configs import settings
from core.dependecies import DBSession
from core.logger import logger
import jwt
from sqlalchemy.exc import IntegrityError
from app.schemas.user_schema import BaseUserSchema
from app.utils.utils import blacklist_token, token_exp_time, generate_random_password
from app.utils.enums import (
    AccountTypeEnum,
    ProfileEnum,
    account_type_to_profile,
    profile_to_account_type,
)
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError
from google.oauth2 import id_token
from google.auth.transport import requests as google_auth_requests
from app.schemas.auth_schema import SocialLoginRequest
from app.schemas.user_schema import BaseUserSchema
from app.utils.utils import blacklist_token, token_exp_time
from app.utils.enums import AccountTypeEnum
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError
from core.database import AsyncSessionLocal
from pydantic import EmailStr
from sqlalchemy import or_, and_
from sqlalchemy.orm import selectinload


def requested_account_type(profile: ProfileEnum | None) -> AccountTypeEnum:
    """Which row a caller's requested profile resolves to.

    Single choke point for the NEW_SIGNIN_CHOOSER kill switch: with the flag
    off this always answers `client`, so every auth path reverts to exactly
    what it did before the chooser shipped even for clients that have already
    started sending a profile. Without one place to turn it off, "the flag is
    off" would mean something slightly different on each endpoint.
    """
    if not settings.NEW_SIGNIN_CHOOSER:
        return AccountTypeEnum.client
    return profile_to_account_type(profile)


async def _free_near_account_id(db: AsyncSession, wanted: str | None) -> str | None:
    """
    The requested wallet id, or the next free variant of it.

    The apps propose a wallet id from the part of the email before the @, so
    john@gmail.com and john@yahoo.com both ask for john.shedauser.testnet. It
    is a provisional name (the wallet itself is created afterwards and picks a
    free name on chain), so a clash is resolved here as john2, john3 ... rather
    than refusing the second person's signup.
    """
    if not wanted:
        return wanted
    label, dot, rest = wanted.partition(".")
    candidate, n = wanted, 2
    while (
        await db.execute(
            select(BaseUser.id).where(BaseUser.near_account_id == candidate).limit(1)
        )
    ).first() is not None:
        candidate = f"{label}{n}{dot}{rest}"
        n += 1
    return candidate


# NOTE -  Create agent
async def create_account(user_data: UserCreate, db: AsyncSession):
    # A taken email or username is a real duplicate: say so plainly.
    taken = BaseUser.email == user_data.email
    if user_data.username:
        taken = taken | (BaseUser.username == user_data.username)
    if (await db.execute(select(BaseUser.id).where(taken).limit(1))).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    # `profile` says which row the caller wants a token for; it is not a
    # column on either model, so it must not reach the constructors.
    columns = user_data.model_dump(exclude={"profile"})
    # A wallet from the other network would point this account at a chain
    # this backend never reads.
    wallet = columns.get("near_account_id") or ""
    if wallet and not wallet.endswith(settings.near_account_suffix):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"This is the {settings.NEAR_NETWORK} service; use a {settings.near_account_suffix} wallet.",
        )
    columns["near_account_id"] = await _free_near_account_id(
        db, columns.get("near_account_id")
    )
    new_client = Client(**columns, account_type=AccountTypeEnum.client)
    new_agent = Agent(**columns, account_type=AccountTypeEnum.agent)
    try:
        db.add_all([new_client, new_agent])
        await db.commit()
        await db.refresh(new_client)
        await db.refresh(new_agent)
        logger.info(f"User {new_client.email} created")  # type:ignore
        # Both rows exist either way — this only decides which one the caller
        # gets a token for. Defaults to the client row, which is what every
        # caller got before `profile` existed.
        if requested_account_type(user_data.profile) is AccountTypeEnum.agent:
            return new_agent
        return new_client
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="User already exists"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)
        )


async def get_user(
    identifier: str, db: AsyncSession, account_type=AccountTypeEnum.client
) -> BaseUser | Client | Agent:
    """Fetch a user based on email, phone, or username and account type."""

    # Start with common options for BaseUser
    options = [selectinload(BaseUser.account_info)]

    # Conditionally add agent-specific options
    if account_type == AccountTypeEnum.agent:
        options.append(selectinload(Agent.listings))
        options.append(selectinload(Agent.availabilities))
    conditions = [
        BaseUser.email == identifier,
        BaseUser.username == identifier,
        BaseUser.phone_number == identifier,
    ]
    if identifier.isdigit():
        conditions.append(BaseUser.id == int(identifier))

    query = (
        select(BaseUser)
        .options(*options)
        .where(
            and_(
                BaseUser.account_type == account_type,
                or_(*conditions),
            )
        )
    )
    result = await db.execute(query)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    user.last_seen = datetime.now(timezone.utc)
    await db.refresh(user)
    return user


async def authenticate_user(login_data: LoginData, db: AsyncSession) -> UserInDB:
    try:
        # Resolve the row for the requested profile. Both rows carry the same
        # hash (create_account seeds them together, reset_password keeps them
        # in step), so authenticating against either is equivalent — what
        # changes is which identity the resulting token belongs to.
        user: UserInDB = await get_user(  # type: ignore
            login_data.username, db, requested_account_type(login_data.profile)
        )
    except HTTPException as e:
        if e.status_code == status.HTTP_404_NOT_FOUND:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Username"
            )
        raise e
        
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Username"
        )
    if not verify_password(login_data.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Password"
        )
    return user


async def create_access_token(data: TokenData, expire_time=None):
    expiration = (
        timedelta(minutes=expire_time) if expire_time else settings.expire_delta
    )
    to_encode = data.model_dump().copy()
    expire = datetime.now(timezone.utc) + expiration
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )  # type: ignore
    return encoded_jwt


async def process_signup(
    user_data: UserCreate, db: AsyncSession, background_tasks: BackgroundTasks
):
    new_user = await create_account(user_data, db)
    background_tasks.add_task(create_send_otp, new_user.email)
    active_profile = account_type_to_profile(new_user.account_type)  # type: ignore
    token_data = TokenData(
        sub=new_user.id,  # type: ignore
        scopes=[new_user.account_type.value],  # type: ignore
        active_profile=active_profile,
    )
    access_token = await create_access_token(data=token_data)
    return SignUpShow(
        token=Token(access_token=access_token, active_profile=active_profile),
        user_data=UserShow.model_validate(new_user),
        is_new_user=True,
    )


async def process_social_login(
    payload: SocialLoginRequest, db: AsyncSession, background_tasks: BackgroundTasks
):
    try:
        # Verify Google token
        idinfo = id_token.verify_oauth2_token(
            payload.token, google_auth_requests.Request(), settings.GOOGLE_CLIENT_ID
        )
        email = idinfo.get("email")
        if not email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="No email provided in token"
            )
        
        account_type = requested_account_type(payload.profile)
        is_new_user = False

        # Check if user exists
        try:
            user = await get_user(email, db, account_type)
            # If user exists but is not verified, verify them now
            if not user.verified:
                user.verified = True
                db.add(user)
                await db.commit()
                await db.refresh(user)
        except HTTPException:
            # User doesn't exist, create account
            is_new_user = True
            username = idinfo.get("name") or idinfo.get("given_name") or email.split("@")[0]
            username = "".join(e for e in username if e.isalnum())[:30]
            if not username:
                username = "User"
            
            import uuid
            user_data = UserCreate(
                username=username,
                email=email,
                password=generate_random_password(),
                near_account_id=f"{username.lower()}-{uuid.uuid4().hex[:6]}{settings.near_account_suffix}",
                profile=payload.profile,
            )

            user = await create_account(user_data, db)
            user.verified = True
            
            # update avatar_url if available
            picture = idinfo.get("picture")
            if picture:
                user.avatar_url = picture
                
            db.add(user)
            await db.commit()
            await db.refresh(user)
            
        # Scope from the row actually resolved, not a hardcoded client — an
        # existing seller signing in with Google was previously handed a token
        # scoped `client` regardless of the row it pointed at.
        active_profile = account_type_to_profile(user.account_type)
        token_data = TokenData(
            sub=user.id,
            scopes=[user.account_type.value],
            active_profile=active_profile,
        )
        access_token = await create_access_token(data=token_data)

        return SignUpShow(
            token=Token(access_token=access_token, active_profile=active_profile),
            user_data=UserShow.model_validate(user),
            is_new_user=is_new_user,
        )
            
    except ValueError as e:
        logger.error(f"Social login error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid social token"
        )


async def process_logout(token: str):
    try:
        remaining_time = await token_exp_time(token)
        if not remaining_time:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token"
            )

        await blacklist_token(token, remaining_time)
    except (InvalidTokenError, ExpiredSignatureError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token"
        )
    return {"message": "Logged out"}


# NOTE -  Return new token with the neccesarry account type
async def switch_account(
    switch_to: AccountTypeEnum, current_user: UserInDB, db: AsyncSession
):
    user = await get_user(current_user.email, db, switch_to)  # type: ignore
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{switch_to} account not found",
        )
    scopes = [switch_to]
    active_profile = account_type_to_profile(user.account_type)  # type: ignore
    new_token = await create_access_token(
        data=TokenData(  # type: ignore
            sub=user.id,  # type: ignore
            scopes=scopes,
            active_profile=active_profile,
        )
    )  # type: ignore
    return Token(access_token=new_token, active_profile=active_profile)
