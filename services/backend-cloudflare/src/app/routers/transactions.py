from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status, Query
from typing import Annotated, List, Optional

from cloudinary import uploader

from app.schemas.transaction_schema import (
    TimeoutCandidatesResponse,
    TransactionListResponse,
    TransactionUploadResponse,
    SubmitBidTxRequest,
    SubmitBidTxResponse,
)
from app.services.transactions import get_timeout_candidates, get_transactions, verify_and_register_bid_tx
from app.services.user_service import ActiveUser, AdminUser
from core.dependecies import DBSession
from core.logger import logger


router = APIRouter(prefix="/transactions", tags=["Transactions"])


@router.get("", response_model=TransactionListResponse, status_code=status.HTTP_200_OK)
async def list_transactions(
    current_user: ActiveUser,
    db: DBSession,
    status: Optional[str] = Query(
        None, description="Filter by status: ongoing, completed, cancelled"
    ),
):
    data = await get_transactions(status, current_user, db)
    return TransactionListResponse(data=data)


@router.post(
    "/{bid_id}/upload-documents",
    response_model=TransactionUploadResponse,
    status_code=status.HTTP_200_OK,
)
async def upload_transaction_documents(
    bid_id: str,
    current_user: ActiveUser,
    db: DBSession,
    images: Annotated[List[UploadFile], File(...)],
    description: Annotated[Optional[str], Form()] = None,
):
    if not images:
        raise HTTPException(status_code=400, detail="No files provided")

    uploaded_urls: List[str] = []
    for upload in images:
        if not upload.filename:
            continue
        file_content = await upload.read()
        try:
            result = uploader.upload(
                file_content,
                public_id=f"transactions/{bid_id}/{upload.filename}",
                folder="transactions",
                overwrite=True,
            )
            uploaded_urls.append(result.get("secure_url"))
        except Exception as exc:
            logger.error(f"Transaction document upload failed: {exc}")
            raise HTTPException(
                status_code=500, detail="Failed to upload transaction document"
            ) from exc

    if not uploaded_urls:
        raise HTTPException(status_code=400, detail="No valid files uploaded")

    return TransactionUploadResponse(
        uploaded_urls=uploaded_urls, description=description
    )


@router.get(
    "/timeouts",
    response_model=TimeoutCandidatesResponse,
    status_code=status.HTTP_200_OK,
)
async def list_timeout_candidates(
    current_user: AdminUser,
    db: DBSession,
    docs_release_timeout_hours: int = Query(72, ge=1),
    docs_confirm_timeout_hours: int = Query(72, ge=1),
):
    candidates = await get_timeout_candidates(
        docs_release_timeout_hours=docs_release_timeout_hours,
        docs_confirm_timeout_hours=docs_confirm_timeout_hours,
        db=db,
    )
    return TimeoutCandidatesResponse(data=candidates)


@router.post(
    "/submit-bid-tx",
    response_model=SubmitBidTxResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_bid_transaction(
    payload: SubmitBidTxRequest,
    current_user: ActiveUser,
    db: DBSession,
):
    """
    Submit and verify a transaction hash for placing a bid on-chain.
    """
    record = await verify_and_register_bid_tx(
        tx_hash=payload.tx_hash,
        expected_bid_id=payload.expected_bid_id,
        expected_property_id=payload.expected_property_id,
        expected_amount=payload.expected_amount,
        current_user=current_user,
        db=db,
    )

    # Construct the TransactionView payload
    from app.schemas.transaction_schema import TransactionView, TransactionPropertyInfo, TransactionCounterpartyInfo
    from app.models.property import Property
    from app.models.user import BaseUser
    from app.models.transaction import WalletMapping
    from sqlalchemy import select

    # Resolve buyer user details
    buyer_wallet_mapping = await db.execute(
        select(BaseUser).join(WalletMapping, WalletMapping.user_id == BaseUser.id).where(WalletMapping.wallet_id == record.buyer_wallet_id)
    )
    buyer_user = buyer_wallet_mapping.scalars().first()

    # Get property info
    prop_res = await db.execute(
        select(Property).where(Property.blockchain_property_id == record.property_id)
    )
    property_obj = prop_res.scalar_one_or_none()

    property_info = None
    if property_obj:
        property_info = TransactionPropertyInfo(
            id=property_obj.id,
            blockchain_property_id=property_obj.blockchain_property_id,
            title=property_obj.title,
            location=property_obj.location,
            images=[img.image_url for img in property_obj.images],
        )

    counterparty_info = None
    if buyer_user:
        counterparty_info = TransactionCounterpartyInfo(
            id=buyer_user.id,
            name=buyer_user.fullname or buyer_user.username or buyer_user.email,
            avatar_url=buyer_user.avatar_url,
            wallet_id=record.buyer_wallet_id,
        )

    tx_view = TransactionView(
        bid_id=record.bid_id,
        property_id=record.property_id,
        status=record.status,
        action=record.action,
        bid_amount=record.bid_amount,
        stablecoin_token=record.stablecoin_token,
        document_token_id=record.document_token_id,
        escrow_release_tx=record.escrow_release_tx,
        updated_at=record.updated_at,
        property=property_info,
        counterparty=counterparty_info,
    )

    # Broadcast real-time update to the property owner (seller) if connected
    if property_obj and property_obj.agent_id:
        from app.routers.websocket import ws_manager
        ws_payload = {
            "type": "notification",
            "notification_type": "bid_placed",
            "title": "New Bid Placed",
            "message": f"A bid of {record.bid_amount} has been placed for property '{property_obj.title if property_obj else record.property_id}'.",
            "data": {
                "bid_id": record.bid_id,
                "property_id": record.property_id,
                "bid_amount": record.bid_amount,
                "status": record.status.value,
            }
        }
        await ws_manager.send_personal_message(ws_payload, property_obj.agent_id)

    return SubmitBidTxResponse(transaction=tx_view)
