from typing import Any, Optional

from pydantic import BaseModel, Field

from app.utils.enums import TransactionEventEnum


class IndexerTransactionEventRequest(BaseModel):
    transaction_id: str = Field(..., description="Bid or transaction identifier")
    event: TransactionEventEnum
    property_id: int
    actor_wallet_id: Optional[str] = None
    tx_hash: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None
