from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.utils.enums import (
    TransactionActionEnum,
    TransactionEventEnum,
    TransactionStatusEnum,
)
from core.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class WalletMapping(Base):
    __tablename__ = "wallet_mapping"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    wallet_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    user = relationship("BaseUser", lazy="selectin", passive_deletes=True)


class DeviceToken(Base):
    __tablename__ = "device_token"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    device_token: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    platform: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    user = relationship("BaseUser", lazy="selectin", passive_deletes=True)


class TransactionRecord(Base):
    __tablename__ = "transaction_record"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bid_id: Mapped[str] = mapped_column(String(64), index=True)
    property_id: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[TransactionStatusEnum] = mapped_column(
        Enum(TransactionStatusEnum),
        default=TransactionStatusEnum.pending,
        nullable=False,
    )
    action: Mapped[TransactionActionEnum | None] = mapped_column(
        Enum(TransactionActionEnum), nullable=True
    )
    bid_amount: Mapped[str | None] = mapped_column(String(64), nullable=True)
    stablecoin_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    buyer_wallet_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    seller_wallet_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    document_token_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    escrow_release_tx: Mapped[str | None] = mapped_column(String(255), nullable=True)
    metadata_payload: Mapped[dict | None] = mapped_column(
        "metadata", JSON, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )


class TransactionNotification(Base):
    __tablename__ = "transaction_notification"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_id: Mapped[str] = mapped_column(String(64), index=True)
    event: Mapped[TransactionEventEnum] = mapped_column(
        Enum(TransactionEventEnum), nullable=False
    )
    recipient_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    property_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("property.id", ondelete="CASCADE"), nullable=False
    )
    metadata_payload: Mapped[dict | None] = mapped_column(
        "metadata", JSON, nullable=True
    )
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    recipient = relationship("BaseUser", lazy="selectin", passive_deletes=True)
    property = relationship("Property", lazy="selectin", passive_deletes=True)


class TransactionAuditLog(Base):
    __tablename__ = "transaction_audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bid_id: Mapped[str] = mapped_column(String(64), index=True)
    property_id: Mapped[str] = mapped_column(String(64), index=True)
    from_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    to_status: Mapped[str] = mapped_column(String(64))
    actor_wallet_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tx_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    metadata_payload: Mapped[dict | None] = mapped_column(
        "metadata", JSON, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )


class MintedPropertyDraft(Base):
    __tablename__ = "minted_property_draft"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    blockchain_property_id: Mapped[str] = mapped_column(String(64), unique=True)
    owner_wallet_id: Mapped[str] = mapped_column(String(255))
    metadata_uri: Mapped[str | None] = mapped_column(String(255), nullable=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    linked_property_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("property.id", ondelete="SET NULL"), nullable=True
    )
    linked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    linked_property = relationship("Property", lazy="selectin")

