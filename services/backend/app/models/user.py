from sqlalchemy.orm.relationships import _RelationshipDeclared
from core.database import Base, AsyncSessionLocal
from sqlalchemy import (
    String,
    Boolean,
    Float,
    Enum,
    DateTime,
    ForeignKey,
    CheckConstraint,
    UniqueConstraint,
    select,
    update,
)
import uuid
from sqlalchemy.orm import mapped_column, Mapped, relationship
from datetime import datetime, timezone
from app.utils.enums import AccountTypeEnum, KycStatusEnum, UserRole
from typing import Optional, Any, Self
from starlette.requests import Request
from html import escape


def utc_now() -> datetime:
    """Return current UTC time as timezone-aware datetime."""
    return datetime.now(timezone.utc)


# NOTE - Base User Model
class BaseUser(Base):
    __tablename__ = "user"
    id: Mapped[int] = mapped_column("id", primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(
        String(30),
        nullable=True,
        index=True,
    )
    avatar_url: Mapped[str] = mapped_column(
        String(255),
        nullable=True,
    )
    email: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )
    phone_number: Mapped[str] = mapped_column(
        String(15),
        nullable=True,
        index=True,
    )
    password: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )
    location: Mapped[str] = mapped_column(
        String(70),
        nullable=True,
    )
    account_type: Mapped[AccountTypeEnum] = mapped_column(
        Enum(AccountTypeEnum), nullable=False, default=AccountTypeEnum.client
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )
    verified: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
    )
    kyc_status: Mapped[KycStatusEnum] = mapped_column(
        Enum(KycStatusEnum),
        default=KycStatusEnum.pending,
        nullable=True,
    )
    last_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
    fullname: Mapped[str] = mapped_column(
        String(50),
        nullable=True,
    )
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole),
        default=UserRole.USER,
        nullable=False,
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    device_token: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        index=True,
    )
    near_account_id: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
    )

    account_info = relationship(
        "AccountInfo",
        back_populates="user",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    # SECTION -  Chat Relationships
    sent_messages = relationship(
        "ChatMessage",
        foreign_keys="[ChatMessage.sender_id]",
        back_populates="sender",
        lazy="selectin",
    )
    received_messages = relationship(
        "ChatMessage",
        foreign_keys="[ChatMessage.receiver_id]",
        back_populates="receiver",
        lazy="selectin",
    )
    __mapper_args__ = {
        "polymorphic_identity": "user",
        "polymorphic_on": account_type,
    }
    __table_args__ = (
        UniqueConstraint("email", "account_type", name="uq_email_type"),
        UniqueConstraint("username", "account_type", name="uq_username_type"),
        UniqueConstraint("near_account_id", "account_type", name="uq_near_account_id_type"),
        CheckConstraint(
            f"account_type IN {tuple(item.value for item in AccountTypeEnum)}",
            name="check_account_type",
        ),
        CheckConstraint(
            f"kyc_status IN {tuple(item.value for item in KycStatusEnum)}",
            name="check_kyc_status",
        ),
    )

    def __str__(self) -> str:
        return (
            f"User(id={self.id}, email={self.email}, account_type={self.account_type})"
        )

    async def __admin_repr__(self, request: Request):
        return f"{self.fullname or self.username or self.email},account type: {self.account_type}"

    async def __admin_select2_repr__(self, request: Request) -> str:
        avatar = escape(self.avatar_url or "")
        name = escape(self.fullname or self.username or self.email or "")

        return (
            f"<div>"
            f'<img src="{avatar}">'
            f"<span>{name}: </span>"
            f'<span>{escape(self.account_type or "")}'
            f"</div>"
        )


# NOTE -  Buyer Model
class Client(BaseUser):
    __tablename__ = "client"
    id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        primary_key=True,
    )
    properties: _RelationshipDeclared[Any] = relationship(
        "Property",
        back_populates="client",
        lazy="selectin",
        passive_deletes=True,
    )
    appointments = relationship(
        "Appointment",
        back_populates="client",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    payment_confirmations = relationship(
        "PaymentConfirmation",
        back_populates="client",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    __mapper_args__ = {
        "polymorphic_identity": AccountTypeEnum.client,
    }


# NOTE -  agent Model
class Agent(BaseUser):
    __tablename__ = "agent"
    id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        primary_key=True,
    )

    agency_name: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
    )
    rating: Mapped[float] = mapped_column(Float, nullable=True, default=0.0)
    listings = relationship(
        "Property",
        back_populates="agent",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    appointments = relationship(
        "Appointment",
        back_populates="agent",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    availabilities = relationship(
        "AgentAvailability",
        back_populates="agent",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    payment_confirmations = relationship(
        "PaymentConfirmation",
        back_populates="agent",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    __mapper_args__ = {
        "polymorphic_identity": AccountTypeEnum.agent,
    }


class Admin(BaseUser):
    __tablename__ = "admin"

    id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        primary_key=True,
    )

    is_superuser: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
    )
    __mapper_args__ = {
        "polymorphic_identity": AccountTypeEnum.admin,
    }
