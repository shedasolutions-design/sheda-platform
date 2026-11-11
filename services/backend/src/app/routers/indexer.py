from fastapi import APIRouter, status

from app.schemas.indexer_schema import IndexerTransactionEventRequest
from app.services.transactions import upsert_transaction_from_event
from app.services.user_service import AdminUser
from core.dependecies import DBSession


router = APIRouter(prefix="/indexer", tags=["Indexer"])


@router.post(
    "/transactions",
    status_code=status.HTTP_202_ACCEPTED,
)
async def ingest_transaction_event(
    payload: IndexerTransactionEventRequest,
    current_user: AdminUser,
    db: DBSession,
):
    metadata = dict(payload.metadata or {})
    if payload.actor_wallet_id:
        metadata.setdefault("actor_wallet_id", payload.actor_wallet_id)
    if payload.tx_hash:
        metadata.setdefault("tx_hash", payload.tx_hash)

    await upsert_transaction_from_event(
        transaction_id=payload.transaction_id,
        event=payload.event,
        property_id=payload.property_id,
        metadata=metadata,
        db=db,
    )

    return {"status": "queued"}
