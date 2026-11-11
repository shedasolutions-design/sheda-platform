from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, field_validator

from app.utils.enums import TransactionActionEnum, TransactionStatusEnum
from app.utils.validators import TransactionValidators, ValidatorMixin


class TransactionPropertyInfo(BaseModel):
    id: Optional[int] = None
    blockchain_property_id: Optional[str] = None
    title: Optional[str] = None
    location: Optional[str] = None
    images: List[str] = []


class TransactionCounterpartyInfo(BaseModel):
    id: Optional[int] = None
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    wallet_id: Optional[str] = None


class TransactionView(BaseModel):
    bid_id: str
    property_id: str
    status: TransactionStatusEnum
    action: Optional[TransactionActionEnum] = None
    bid_amount: Optional[str] = None
    stablecoin_token: Optional[str] = None
    document_token_id: Optional[str] = None
    escrow_release_tx: Optional[str] = None
    # No on-chain BidStatus equivalent — set via upsert_transaction_from_event's
    # appointment-event branch (services/transactions.py), read back out of
    # metadata_payload. One of "booked" | "accepted" | "rejected" | None.
    appointment_status: Optional[str] = None
    updated_at: Optional[datetime] = None
    property: Optional[TransactionPropertyInfo] = None
    counterparty: Optional[TransactionCounterpartyInfo] = None


class TransactionListResponse(BaseModel):
    data: List[TransactionView]


class TransactionUploadResponse(BaseModel):
    uploaded_urls: List[str]
    description: Optional[str] = None


class TimeoutCandidate(BaseModel):
    transaction_id: str
    property_id: str
    status: TransactionStatusEnum
    updated_at: Optional[datetime] = None


class TimeoutCandidatesResponse(BaseModel):
    data: List[TimeoutCandidate]


# Idempotency schemas
class IdempotentTransactionBase(BaseModel):
    """Base schema for idempotent transaction operations."""

    idempotency_key: str
    property_id: int
    amount: float

    class Config:
        from_attributes = True

    @field_validator("idempotency_key")
    @classmethod
    def validate_idempotency_key_field(cls, v: str) -> str:
        """Validate idempotency key format."""
        return TransactionValidators.validate_idempotency_key(v)

    @field_validator("amount")
    @classmethod
    def validate_amount_field(cls, v: float) -> float:
        """Validate transaction amount."""
        return TransactionValidators.validate_transaction_amount(v)


class ConfirmPaymentRequest(BaseModel):
    """Schema for payment confirmation with idempotency."""

    contract_id: int
    idempotency_key: str
    transaction_hash: Optional[str] = None

    class Config:
        from_attributes = True

    @field_validator("idempotency_key")
    @classmethod
    def validate_idempotency_key_field(cls, v: str) -> str:
        """Validate idempotency key format."""
        return TransactionValidators.validate_idempotency_key(v)

    @field_validator("transaction_hash")
    @classmethod
    def validate_transaction_hash_field(cls, v: Optional[str]) -> Optional[str]:
        """Validate transaction hash if provided."""
        if v is not None:
            return ValidatorMixin.validate_blockchain_hash(v)
        return v


class SubmitBidTxRequest(BaseModel):
    tx_hash: str
    expected_bid_id: Optional[int] = None
    expected_property_id: Optional[int] = None
    expected_amount: Optional[int] = None


class SubmitBidTxResponse(BaseModel):
    status: str = "success"
    transaction: TransactionView
