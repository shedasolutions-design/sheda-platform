from typing import Optional

from datetime import datetime, timedelta, timezone
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload
from core.logger import logger

from app.models.property import Property
from app.models.transaction import TransactionAuditLog, TransactionRecord, WalletMapping
from app.models.user import BaseUser
from app.schemas.transaction_schema import (
    TransactionCounterpartyInfo,
    TransactionPropertyInfo,
    TimeoutCandidate,
    TransactionView,
)
from app.utils.enums import (
    TransactionActionEnum,
    TransactionEventEnum,
    TransactionStatusEnum,
)
from app.services.wallets import get_wallet_for_user


STATUS_FILTERS: dict[str, set[TransactionStatusEnum]] = {
    "ongoing": {
        TransactionStatusEnum.pending,
        TransactionStatusEnum.accepted,
        TransactionStatusEnum.docs_released,
        TransactionStatusEnum.docs_confirmed,
        TransactionStatusEnum.payment_released,
        TransactionStatusEnum.disputed,
    },
    "completed": {TransactionStatusEnum.completed},
    "cancelled": {TransactionStatusEnum.rejected, TransactionStatusEnum.cancelled},
}

# Appointment scheduling (booked/accepted/rejected) never changes the
# on-chain bid status — the contract has no concept of appointments, so
# bid.status stays "Accepted" the whole time a viewing is arranged. These
# events exist only so the notification call doesn't 422; they all map back
# onto the existing "accepted" status rather than inventing backend-only
# statuses that don't correspond to any on-chain state.
EVENT_STATUS_MAP: dict[TransactionEventEnum, TransactionStatusEnum] = {
    TransactionEventEnum.bid_placed: TransactionStatusEnum.pending,
    TransactionEventEnum.bid_accepted: TransactionStatusEnum.accepted,
    TransactionEventEnum.bid_rejected: TransactionStatusEnum.rejected,
    TransactionEventEnum.bid_cancelled: TransactionStatusEnum.cancelled,
    TransactionEventEnum.appointment_booked: TransactionStatusEnum.accepted,
    TransactionEventEnum.appointment_accepted: TransactionStatusEnum.accepted,
    TransactionEventEnum.appointment_rejected: TransactionStatusEnum.accepted,
    TransactionEventEnum.docs_released: TransactionStatusEnum.docs_released,
    TransactionEventEnum.docs_confirmed: TransactionStatusEnum.docs_confirmed,
    TransactionEventEnum.payment_released: TransactionStatusEnum.payment_released,
    TransactionEventEnum.transaction_completed: TransactionStatusEnum.completed,
    TransactionEventEnum.dispute_raised: TransactionStatusEnum.disputed,
    TransactionEventEnum.lease_completed: TransactionStatusEnum.completed,
    TransactionEventEnum.lease_renewed: TransactionStatusEnum.completed,
}

# Appointment events have no on-chain BidStatus equivalent (the NEAR contract
# only knows bid pending/accepted/rejected/etc — appointments are a purely
# off-chain scheduling step between "accepted" and document release). They
# must NOT appear in EVENT_STATUS_MAP or overwrite TransactionRecord.status —
# that column mirrors on-chain state 1:1 and drives STATUS_FILTERS bucketing
# above. Instead they're stashed under metadata_payload["appointment_status"].
APPOINTMENT_EVENT_STATUS: dict[TransactionEventEnum, str] = {
    TransactionEventEnum.appointment_booked: "booked",
    TransactionEventEnum.appointment_accepted: "accepted",
    TransactionEventEnum.appointment_rejected: "rejected",
}


async def get_transactions(
    status_filter: Optional[str],
    current_user: BaseUser,
    db: AsyncSession,
) -> list[TransactionView]:
    wallet_mapping = await get_wallet_for_user(current_user.id, db)
    if not wallet_mapping:
        return []

    wallet_id = wallet_mapping.wallet_id

    buyer_wallet = aliased(WalletMapping)
    seller_wallet = aliased(WalletMapping)
    buyer_user = aliased(BaseUser)
    seller_user = aliased(BaseUser)

    stmt = (
        select(TransactionRecord, Property, buyer_user, seller_user)
        .outerjoin(
            Property, Property.blockchain_property_id == TransactionRecord.property_id
        )
        .outerjoin(
            buyer_wallet, buyer_wallet.wallet_id == TransactionRecord.buyer_wallet_id
        )
        .outerjoin(
            seller_wallet, seller_wallet.wallet_id == TransactionRecord.seller_wallet_id
        )
        .outerjoin(buyer_user, buyer_user.id == buyer_wallet.user_id)
        .outerjoin(seller_user, seller_user.id == seller_wallet.user_id)
        .where(
            or_(
                TransactionRecord.buyer_wallet_id == wallet_id,
                TransactionRecord.seller_wallet_id == wallet_id,
            )
        )
        .options(selectinload(Property.images))
    )

    if status_filter:
        normalized = status_filter.strip().lower()
        statuses = STATUS_FILTERS.get(normalized, set())
        if statuses:
            stmt = stmt.where(TransactionRecord.status.in_(statuses))

    result = await db.execute(stmt)

    transactions: list[TransactionView] = []
    for record, property_obj, buyer, seller in result.all():
        is_buyer = record.buyer_wallet_id == wallet_id
        counterparty_user = seller if is_buyer else buyer
        counterparty_wallet = (
            record.seller_wallet_id if is_buyer else record.buyer_wallet_id
        )

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
        if counterparty_user or counterparty_wallet:
            counterparty_info = TransactionCounterpartyInfo(
                id=counterparty_user.id if counterparty_user else None,
                name=(
                    counterparty_user.fullname
                    if counterparty_user and counterparty_user.fullname
                    else (
                        counterparty_user.username
                        if counterparty_user
                        else counterparty_user.email if counterparty_user else None
                    )
                ),
                avatar_url=counterparty_user.avatar_url if counterparty_user else None,
                wallet_id=counterparty_wallet,
            )

        transactions.append(
            TransactionView(
                bid_id=record.bid_id,
                property_id=record.property_id,
                status=record.status,
                action=record.action,
                bid_amount=record.bid_amount,
                stablecoin_token=record.stablecoin_token,
                document_token_id=record.document_token_id,
                escrow_release_tx=record.escrow_release_tx,
                appointment_status=(
                    (record.metadata_payload or {}).get("appointment_status")
                ),
                updated_at=record.updated_at,
                property=property_info,
                counterparty=counterparty_info,
            )
        )

    return transactions


def _parse_action(value: Optional[str]) -> TransactionActionEnum | None:
    if not value:
        return None
    try:
        return TransactionActionEnum(value)
    except ValueError:
        return None


async def upsert_transaction_from_event(
    transaction_id: str,
    event: TransactionEventEnum,
    property_id: int,
    metadata: Optional[dict],
    db: AsyncSession,
) -> TransactionRecord:
    is_appointment_event = event in APPOINTMENT_EVENT_STATUS

    result = await db.execute(
        select(TransactionRecord).where(TransactionRecord.bid_id == transaction_id)
    )
    record = result.scalar_one_or_none()

    if record:
        from_status = record.status.value
        if not is_appointment_event:
            record.status = EVENT_STATUS_MAP[event]
        # else: appointment events don't touch the on-chain-mirroring status
    else:
        # Appointment events should always follow bid_accepted (which already
        # creates the record) — this branch is a defensive fallback, not the
        # expected path.
        status = (
            TransactionStatusEnum.accepted
            if is_appointment_event
            else EVENT_STATUS_MAP[event]
        )
        record = TransactionRecord(
            bid_id=transaction_id,
            property_id=str(property_id),
            status=status,
        )
        from_status = None

    # Merge rather than overwrite — a later event (e.g. payment_released)
    # must not silently wipe out fields set by an earlier one, such as the
    # appointment_status this function may have set below.
    merged_metadata = {**(record.metadata_payload or {}), **(metadata or {})}
    if is_appointment_event:
        merged_metadata["appointment_status"] = APPOINTMENT_EVENT_STATUS[event]

    if merged_metadata:
        record.metadata_payload = merged_metadata
        record.document_token_id = merged_metadata.get(
            "document_token_id", record.document_token_id
        )
        record.escrow_release_tx = merged_metadata.get(
            "escrow_release_tx", record.escrow_release_tx
        )
        record.bid_amount = (
            str(merged_metadata.get("bid_amount"))
            if merged_metadata.get("bid_amount")
            else record.bid_amount
        )
        record.stablecoin_token = merged_metadata.get(
            "stablecoin_token", record.stablecoin_token
        )
        record.buyer_wallet_id = merged_metadata.get(
            "buyer_wallet_id", record.buyer_wallet_id
        )
        record.seller_wallet_id = merged_metadata.get(
            "seller_wallet_id", record.seller_wallet_id
        )
        record.action = _parse_action(merged_metadata.get("action")) or record.action

    db.add(record)
    await db.commit()
    await db.refresh(record)

    audit = TransactionAuditLog(
        bid_id=record.bid_id,
        property_id=record.property_id,
        from_status=from_status,
        to_status=record.status.value,
        actor_wallet_id=metadata.get("actor_wallet_id") if metadata else None,
        tx_hash=metadata.get("tx_hash") if metadata else None,
        metadata_payload=metadata,
    )
    db.add(audit)
    await db.commit()

    return record


async def get_timeout_candidates(
    docs_release_timeout_hours: int,
    docs_confirm_timeout_hours: int,
    db: AsyncSession,
) -> list[TimeoutCandidate]:
    now = datetime.now(timezone.utc)
    accepted_cutoff = now - timedelta(hours=docs_release_timeout_hours)
    docs_released_cutoff = now - timedelta(hours=docs_confirm_timeout_hours)

    stmt = select(TransactionRecord).where(
        or_(
            (TransactionRecord.status == TransactionStatusEnum.accepted)
            & (TransactionRecord.updated_at <= accepted_cutoff),
            (TransactionRecord.status == TransactionStatusEnum.docs_released)
            & (TransactionRecord.updated_at <= docs_released_cutoff),
        )
    )
    result = await db.execute(stmt)
    records = result.scalars().all()

    return [
        TimeoutCandidate(
            transaction_id=record.bid_id,
            property_id=record.property_id,
            status=record.status,
            updated_at=record.updated_at,
        )
        for record in records
    ]


async def verify_and_register_bid_tx(
    tx_hash: str,
    expected_bid_id: Optional[int],
    expected_property_id: Optional[int],
    expected_amount: Optional[int],
    current_user: BaseUser,
    db: AsyncSession,
) -> TransactionRecord:
    import httpx
    import base64
    import json
    from fastapi import HTTPException, status
    from core.configs import settings
    from app.models.property import Property as DbProperty
    from app.services.push import send_push_notification as trigger_push

    # 1. Strip and validate RPC URL
    rpc_url = settings.NEAR_RPC_URL.strip()
    if not current_user.near_account_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Authenticated user does not have a registered NEAR Account ID."
        )

    # 2. Query NEAR RPC for transaction outcome
    payload_tx = {
        "jsonrpc": "2.0",
        "id": "dontcare",
        "method": "tx",
        "params": [tx_hash, current_user.near_account_id]
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(rpc_url, json=payload_tx, timeout=15.0)
            response.raise_for_status()
            res_json = response.json()
    except Exception as e:
        logger.error(f"NEAR RPC request failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to query NEAR RPC for transaction status: {str(e)}"
        )

    if "error" in res_json:
        logger.error(f"NEAR RPC transaction query returned error: {res_json['error']}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"NEAR RPC error: {res_json['error'].get('message', 'Unknown error')}"
        )

    result = res_json.get("result")
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found on-chain."
        )

    # 3. Verify transaction status is successful
    tx_status = result.get("status", {})
    if "SuccessValue" not in tx_status and "SuccessReceiptId" not in tx_status:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transaction failed on-chain."
        )

    transaction_info = result.get("transaction", {})
    signer_id = transaction_info.get("signer_id")
    receiver_id = transaction_info.get("receiver_id")

    if signer_id != current_user.near_account_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Transaction signer '{signer_id}' does not match authenticated user's NEAR account '{current_user.near_account_id}'."
        )

    # 4. Fetch the actual onchain bids for this bidder via view method
    args_json = json.dumps({"bidder": signer_id})
    args_base64 = base64.b64encode(args_json.encode('utf-8')).decode('utf-8')

    payload_query = {
        "jsonrpc": "2.0",
        "id": "dontcare",
        "method": "query",
        "params": {
            "request_type": "call_function",
            "finality": "final",
            "account_id": receiver_id,
            "method_name": "get_bids_by_bidder",
            "args_base64": args_base64
        }
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(rpc_url, json=payload_query, timeout=15.0)
            response.raise_for_status()
            query_res = response.json()
    except Exception as e:
        logger.error(f"NEAR RPC view query failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to query contract state via RPC: {str(e)}"
        )

    if "error" in query_res:
        logger.error(f"NEAR RPC view query returned error: {query_res['error']}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Contract view error: {query_res['error'].get('message', 'Unknown error')}"
        )

    query_result = query_res.get("result", {})
    if "result" not in query_result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No bids returned by contract for this user."
        )

    try:
        bids_bytes = bytes(query_result["result"])
        bids = json.loads(bids_bytes.decode('utf-8'))
    except Exception as e:
        logger.error(f"Failed to parse contract view return bytes: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to decode contract return data: {str(e)}"
        )

    # 5. Locate matching bid and verify parameters
    matching_bid = None
    for bid in bids:
        bid_id_onchain = bid.get("id")
        property_id_onchain = bid.get("property_id")
        bidder_onchain = bid.get("bidder_id") or bid.get("bidder")
        amount_onchain = bid.get("bid_amount") or bid.get("amount")

        if bidder_onchain != current_user.near_account_id:
            continue
        if expected_bid_id is not None and int(bid_id_onchain) != expected_bid_id:
            continue
        if expected_property_id is not None and int(property_id_onchain) != expected_property_id:
            continue
        if expected_amount is not None and int(amount_onchain) != expected_amount:
            continue

        matching_bid = bid
        break

    if not matching_bid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No on-chain bid matches the transaction and expected parameters."
        )

    bid_id = str(matching_bid.get("id"))
    property_id_val = int(matching_bid.get("property_id"))
    onchain_status_str = matching_bid.get("status")

    # Map status
    status_mapped = TransactionStatusEnum.pending
    if isinstance(onchain_status_str, str):
        onchain_status_lower = onchain_status_str.lower()
        if onchain_status_lower == "cancelled":
            status_mapped = TransactionStatusEnum.cancelled
        elif onchain_status_lower == "docsreleased":
            status_mapped = TransactionStatusEnum.docs_released
        elif onchain_status_lower == "docsconfirmed":
            status_mapped = TransactionStatusEnum.docs_confirmed
        elif onchain_status_lower == "paymentreleased":
            status_mapped = TransactionStatusEnum.payment_released
        else:
            try:
                status_mapped = TransactionStatusEnum(onchain_status_lower)
            except ValueError:
                status_mapped = TransactionStatusEnum.pending
    elif isinstance(onchain_status_str, dict):
        # In case the enum is serialized as a dict: e.g. {"Pending": {}}
        key = next(iter(onchain_status_str.keys())).lower()
        if key == "cancelled":
            status_mapped = TransactionStatusEnum.cancelled
        elif key == "docsreleased":
            status_mapped = TransactionStatusEnum.docs_released
        elif key == "docsconfirmed":
            status_mapped = TransactionStatusEnum.docs_confirmed
        elif key == "paymentreleased":
            status_mapped = TransactionStatusEnum.payment_released
        else:
            try:
                status_mapped = TransactionStatusEnum(key)
            except ValueError:
                status_mapped = TransactionStatusEnum.pending

    # Map action
    onchain_action_str = matching_bid.get("action")
    action_mapped = TransactionActionEnum.purchase
    if isinstance(onchain_action_str, str):
        try:
            action_mapped = TransactionActionEnum(onchain_action_str.lower())
        except ValueError:
            pass
    elif isinstance(onchain_action_str, dict):
        key = next(iter(onchain_action_str.keys())).lower()
        try:
            action_mapped = TransactionActionEnum(key)
        except ValueError:
            pass

    # 6. Fetch Property Seller Wallet Details
    res_prop = await db.execute(
        select(DbProperty).where(DbProperty.blockchain_property_id == str(property_id_val))
    )
    property_obj = res_prop.scalar_one_or_none()

    seller_wallet_id = None
    seller_user_id = None
    if property_obj:
        seller_user_id = property_obj.agent_id
        res_wallet = await db.execute(
            select(WalletMapping).where(WalletMapping.user_id == seller_user_id)
        )
        wallet_map = res_wallet.scalar_one_or_none()
        if wallet_map:
            seller_wallet_id = wallet_map.wallet_id

    # 7. Upsert TransactionRecord
    result_db = await db.execute(
        select(TransactionRecord).where(TransactionRecord.bid_id == bid_id)
    )
    record = result_db.scalar_one_or_none()

    metadata = {
        "tx_hash": tx_hash,
        "bid_amount": str(matching_bid.get("bid_amount") or matching_bid.get("amount")),
        "stablecoin_token": matching_bid.get("stablecoin_token"),
        "buyer_wallet_id": matching_bid.get("bidder_id") or matching_bid.get("bidder"),
        "seller_wallet_id": seller_wallet_id,
        "action": onchain_action_str,
    }

    if not record:
        record = TransactionRecord(
            bid_id=bid_id,
            property_id=str(property_id_val),
            status=status_mapped,
            action=action_mapped,
            bid_amount=metadata["bid_amount"],
            stablecoin_token=metadata["stablecoin_token"],
            buyer_wallet_id=metadata["buyer_wallet_id"],
            seller_wallet_id=seller_wallet_id,
            metadata_payload=metadata,
        )
    else:
        record.status = status_mapped
        record.action = action_mapped
        record.bid_amount = metadata["bid_amount"]
        record.stablecoin_token = metadata["stablecoin_token"]
        record.buyer_wallet_id = metadata["buyer_wallet_id"]
        record.seller_wallet_id = seller_wallet_id
        record.metadata_payload = metadata

    db.add(record)
    await db.commit()
    await db.refresh(record)

    # 8. Create Transaction Audit Log
    audit = TransactionAuditLog(
        bid_id=record.bid_id,
        property_id=record.property_id,
        from_status=None,
        to_status=record.status.value,
        actor_wallet_id=current_user.near_account_id,
        tx_hash=tx_hash,
        metadata_payload=metadata,
    )
    db.add(audit)
    await db.commit()

    # 9. Send push notification to property owner (seller) via FCM
    if seller_user_id:
        try:
            await trigger_push(
                user_id=seller_user_id,
                title="New Bid Received",
                body=f"You received a bid of {record.bid_amount} for property '{property_obj.title if property_obj else property_id_val}'.",
                data={
                    "property_id": str(property_id_val),
                    "bid_id": bid_id,
                    "amount": record.bid_amount,
                },
                db=db,
            )
        except Exception as push_err:
            logger.error(f"Failed to trigger FCM push: {push_err}")

    return record
