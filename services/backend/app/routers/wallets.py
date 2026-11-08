from fastapi import APIRouter, HTTPException, status

from app.schemas.wallet_schema import WalletLookupResponse, WalletRegisterRequest
from app.services.user_service import ActiveUser
from app.services.wallets import get_user_by_wallet, register_wallet_for_user
from core.dependecies import DBSession


router = APIRouter(prefix="/users", tags=["Users"])


@router.get(
    "/by-wallet/{wallet_id}",
    response_model=WalletLookupResponse,
    status_code=status.HTTP_200_OK,
)
async def get_user_by_wallet_id(
    wallet_id: str,
    current_user: ActiveUser,
    db: DBSession,
):
    user = await get_user_by_wallet(wallet_id, db)
    if not user:
        raise HTTPException(status_code=404, detail="User not found for wallet")

    name = user.fullname or user.username or user.email
    return WalletLookupResponse(
        id=user.id,
        name=name,
        avatar_url=user.avatar_url,
        wallet_id=wallet_id,
    )


@router.post(
    "/wallets/register",
    response_model=WalletLookupResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_wallet(
    payload: WalletRegisterRequest,
    current_user: ActiveUser,
    db: DBSession,
):
    mapping = await register_wallet_for_user(current_user.id, payload.wallet_id, db)
    name = current_user.fullname or current_user.username or current_user.email
    return WalletLookupResponse(
        id=current_user.id,
        name=name,
        avatar_url=current_user.avatar_url,
        wallet_id=mapping.wallet_id,
    )
