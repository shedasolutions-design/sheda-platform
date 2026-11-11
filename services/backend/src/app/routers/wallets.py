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


class SponsorClaimRequest(WalletRegisterRequest):
    # False: may this user have this wallet funded? True: it was funded, record it.
    commit: bool = False


@router.post("/wallets/sponsor-claim", status_code=status.HTTP_200_OK, response_model=dict)
async def sponsor_claim(payload: SponsorClaimRequest, current_user: ActiveUser):
    """
    Gatekeeper for the web app's wallet funding (apps/web/src/app/api/near/sponsor).

    Each Sheda account gets one funded wallet: asking again for the same
    wallet is allowed (a retry after a failure), a different one is refused.
    A daily cap across everyone bounds what mass fake sign-ups could drain
    from the funding account. The web route checks before signing and
    commits after a success, so a name already taken on chain can still be
    swapped for another before anything is funded.
    """
    from datetime import datetime, timezone

    from core.configs import settings
    from core.database import get_redis

    kv = await get_redis()
    wallet = payload.wallet_id.strip().lower()
    claim_key = f"sponsor:claim:{current_user.id}"
    day_key = f"sponsor:day:{datetime.now(timezone.utc):%Y%m%d}"

    claimed = await kv.get(claim_key)
    if isinstance(claimed, bytes):
        claimed = claimed.decode()
    if claimed and claimed != wallet:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This Sheda account already has a funded wallet.",
        )

    raw = await kv.get(day_key)
    used = int(raw.decode() if isinstance(raw, bytes) else raw or 0)
    if not claimed and used >= settings.SPONSOR_DAILY_CAP:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Free wallet setup is busy today. Please try again tomorrow.",
        )

    if payload.commit and not claimed:
        await kv.set(claim_key, wallet)
        await kv.set(day_key, used + 1, ex=2 * 24 * 3600)
    return {"ok": True}
