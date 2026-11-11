from email.policy import HTTP
from core.dependecies import (
    HTTPBearerDependency,
    InvalidCredentialsException,
    DBSession,
)
import jwt
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError
from core.configs import settings, redis
from core.logger import logger
from app.schemas.auth_schema import TokenData
from app.services.auth import get_user
from app.schemas.user_schema import UserShow, UserInDB
from fastapi import Depends, HTTPException, status, Security
from typing import Annotated
from app.utils.enums import AccountTypeEnum, UserRole
from fastapi.security import SecurityScopes
from pydantic import EmailStr
from app.utils.utils import blacklist_token, token_exp_time
from app.models.user import Agent, BaseUser, Client
from dataclasses import dataclass
from typing import List


@dataclass
class UserContext:
    user: BaseUser
    scopes: List[str]


async def get_token_payload(credentials: HTTPBearerDependency) -> TokenData:
    token = credentials.credentials
    try:
        is_blacklisted = await redis.get(settings.BLACKLIST_PREFIX.format(token))
        if is_blacklisted:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has been revoked"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Token blacklist check bypassed due to redis error: {e}")
    try:
        payload: dict = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )  # type: ignore
        identifier = payload.get("sub")
        if not identifier:
            raise InvalidCredentialsException
        token_scopes = payload.get("scopes", [])
        return TokenData(scopes=token_scopes, sub=identifier)
    except (InvalidTokenError, ExpiredSignatureError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_user_context_base(
    token_data: TokenData, db: DBSession, account_type: AccountTypeEnum
) -> UserContext:
    user: UserInDB = await get_user(token_data.sub, db, account_type)  # type: ignore
    logger.info(
        f"Fetched user: {user.username if user else 'None'} for account type: {account_type}"
    )
    if not user:
        raise InvalidCredentialsException
    return UserContext(user=user, scopes=token_data.scopes)


async def get_client_context(
    security_scopes: SecurityScopes, credentials: HTTPBearerDependency, db: DBSession
) -> UserContext:
    token_data = await get_token_payload(credentials)
    context = await get_user_context_base(token_data, db, AccountTypeEnum.client)

    for scope in security_scopes.scopes:
        if scope not in context.scopes:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not enough permissions",
                headers={"WWW-Authenticate": "Bearer"},
            )
    return context


async def get_agent_context(
    security_scopes: SecurityScopes, credentials: HTTPBearerDependency, db: DBSession
) -> UserContext:
    token_data = await get_token_payload(credentials)
    print(token_data)
    context = await get_user_context_base(token_data, db, AccountTypeEnum.agent)

    for scope in security_scopes.scopes:
        if scope not in context.scopes:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not enough permissions",
                headers={"WWW-Authenticate": "Bearer"},
            )
    return context


async def user_context(
    security_scopes: SecurityScopes, credentials: HTTPBearerDependency, db: DBSession
) -> UserContext:
    token_data = await get_token_payload(credentials)

    if security_scopes.scopes:
        authenticate_value = f'Bearer scope="{security_scopes.scope_str}"'
    else:
        authenticate_value = "Bearer"

    # Determine account type based on scopes
    account_type = AccountTypeEnum.client
    if AccountTypeEnum.agent.value in token_data.scopes:
        account_type = AccountTypeEnum.agent

    logger.info(f"Account type: {account_type}")

    # Fetch user
    context = await get_user_context_base(token_data, db, account_type)
    user = context.user

    if not user:
        raise InvalidCredentialsException

    logger.info(f"User {user.username} fetched")

    if "admin" in token_data.scopes and user.role == UserRole.ADMIN:
        return UserContext(user=user, scopes=token_data.scopes)

    for scope in security_scopes.scopes:
        if scope not in token_data.scopes:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not enough permissions",
                headers={"WWW-Authenticate": authenticate_value},
            )
    return UserContext(user=user, scopes=token_data.scopes)


GetUserContext = Annotated[UserContext, Depends(user_context)]


async def get_current_user(get_user_context: GetUserContext):
    # NOTE ensure that OTP tokens are not used in this route
    if "otp" in get_user_context.scopes:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OTP token not permitted in this route",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return get_user_context.user


GetClientContext = Annotated[UserContext, Depends(get_client_context)]


async def get_current_client(context: GetClientContext):
    if "otp" in context.scopes:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OTP token not permitted in this route",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return context.user


GetAgentContext = Annotated[UserContext, Depends(get_agent_context)]


async def get_current_agent(context: GetAgentContext):
    if "otp" in context.scopes:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OTP token not permitted in this route",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return context.user


GetUser = Annotated[BaseUser, Depends(get_current_user)]


async def get_current_active_user(current_user: GetUser):
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive User"
        )
    return current_user


ActiveUser = Annotated[BaseUser, Depends(get_current_active_user)]


async def get_active_verified_user(current_user: ActiveUser):
    if not current_user.verified:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Unverified user"
        )
    return current_user


ActiveVerifiedUser = Annotated[BaseUser, Depends(get_active_verified_user)]


async def get_current_active_agent(
    current_user: Annotated[BaseUser, Security(get_current_agent, scopes=["agent"])],
):
    if not current_user.is_active and not current_user.verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive User"
        )
    return current_user


ActiveAgent = Annotated[BaseUser, Depends(get_current_active_agent)]


async def active_verified_client(
    current_user: Annotated[BaseUser, Security(get_current_client, scopes=["client"])],
):
    if not current_user.is_active and not current_user.verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive User"
        )
    return current_user


ActiveVerifiedClient = Annotated[UserInDB, Depends(active_verified_client)]


async def get_verified_otp_email(
    user_context: GetUserContext, credentials: HTTPBearerDependency
):
    token = credentials.credentials

    token_exp = await token_exp_time(token)
    await blacklist_token(token, token_exp)  # type: ignore
    return user_context.user


OtpVerification = Annotated[BaseUser, Security(get_verified_otp_email, scopes=["otp"])]


async def require_admin_scope(
    current_user: Annotated[BaseUser, Security(get_current_user, scopes=["admin"])],
):
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive User"
        )
    # Check user role
    if UserRole.ADMIN != current_user.role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required"
        )

    return current_user


AdminUser = Annotated[BaseUser, Depends(require_admin_scope)]

from fastapi import WebSocket, Query
import re


# JWT pattern: three base64url-encoded segments separated by dots
# This is a simple pattern that checks for the basic structure of a JWT
JWT_PATTERN = re.compile(r"^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$")


def is_jwt_like(value: str) -> bool:
    """Check if a string looks like a JWT token (header.payload.signature format)."""
    return bool(JWT_PATTERN.match(value))


async def get_websocket_user(
    websocket: WebSocket, db: DBSession, token: Annotated[str | None, Query()] = None
) -> BaseUser:
    """
    Authenticate a WebSocket connection using JWT token.

    Token can be provided via:
    1. Query parameter (?token=...) - Standard approach
    2. Sec-WebSocket-Protocol header with format:
       - "Bearer.{token}" - Recommended format for protocol header auth
       - "access_token, {token}" - Alternative subprotocol format

    Returns:
    - The authenticated user on success (connection is accepted)
    - None on failure (connection is closed with WS_1008_POLICY_VIOLATION)

    Note: This function handles the WebSocket accept/close internally.
    On successful auth, the connection is accepted (with subprotocol if applicable).
    On failed auth, the connection is closed.
    """
    subprotocol = None

    # Check if token provided via query parameter
    if token:
        logger.info("Token provided via query parameter")
    else:
        # Try to get token from Sec-WebSocket-Protocol header
        protocols = websocket.headers.get("sec-websocket-protocol", "")
        if protocols:
            protocol_list = [p.strip() for p in protocols.split(",")]
            logger.info(f"Sec-WebSocket-Protocol header found: {protocol_list}")

            for i, protocol in enumerate(protocol_list):
                # Format 1: Bearer.{token}
                if protocol.startswith("Bearer."):
                    token = protocol[7:]  # Remove "Bearer." prefix
                    subprotocol = protocol  # Echo back the full protocol
                    break
                # Format 2: access_token, {token} (two-part format)
                elif protocol == "access_token" and i + 1 < len(protocol_list):
                    token = protocol_list[i + 1]
                    subprotocol = "access_token"
                    break
                # Format 3: Raw token (not a standard protocol name)
                elif protocol.lower() not in [
                    "chat",
                    "websocket",
                    "graphql-ws",
                    "graphql-transport-ws",
                ]:
                    # Check if it looks like a JWT (header.payload.signature format)
                    if is_jwt_like(protocol):
                        token = protocol
                        subprotocol = protocol
                        break

    if not token:
        logger.warning("WebSocket auth failed: No token provided")
        await websocket.close(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="WebSocket auth failed: No token provided",
        )
        return None

    try:
        payload: dict = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]  # type: ignore
        )  # type: ignore
        identifier = payload.get("sub")
        if not identifier:
            logger.warning("WebSocket auth failed: No subject in token")
            await websocket.close(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="WebSocket auth failed: No subject in token",
            )
            return None

        user: UserInDB = await get_user(identifier, db)  # type: ignore
        if not user:
            logger.warning("WebSocket auth failed: User not found")
            await websocket.close(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="WebSocket auth failed: User not found",
            )
            return None

        logger.info(f"WebSocket auth successful: {user.email}")

        if not user.is_active:
            logger.warning("WebSocket auth failed: User inactive")
            await websocket.close(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="WebSocket auth failed: User inactive",
            )
            return None

        if not user.verified:
            logger.warning("WebSocket auth failed: User unverified")
            await websocket.close(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="WebSocket auth failed: User unverified",
            )
            return None

        # Accept connection with subprotocol if token was from protocol header
        if subprotocol:
            await websocket.accept(subprotocol=subprotocol)
        else:
            await websocket.accept()

        return user

    except (InvalidTokenError, ExpiredSignatureError) as e:
        logger.error(f"WebSocket auth error: {e}")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return None


ActiveVerifiedWSUser = Annotated[BaseUser | Client | Agent, Depends(get_websocket_user)]


async def reset_password(user: UserInDB, db: DBSession, new_password: str):
    user.password = new_password
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return True
