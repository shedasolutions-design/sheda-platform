from core.database import Base
from sqlalchemy import (
    String,
    Boolean,
    Float,
    Enum,
    DateTime,
    ForeignKey,
    CheckConstraint,
    Integer,
    Time,
)
from sqlalchemy.orm import mapped_column, Mapped, relationship
from datetime import datetime, time, timezone
from app.utils.enums import (
    ListingTypeEnum,
    PropertyTypeEnum,
    AppointmentStatEnum,
    WeekDayEnum,
    PropertyStatEnum,
)


def utc_now() -> datetime:
    """Return current UTC time as timezone-aware datetime."""
    return datetime.now(timezone.utc)


class Property(Base):
    __tablename__ = "property"
    id: Mapped[int] = mapped_column("id", primary_key=True, autoincrement=True)
    agent_id: Mapped[int] = mapped_column(
        ForeignKey("agent.id", ondelete="CASCADE"),
        nullable=False,
    )
    client_id: Mapped[int] = mapped_column(
        ForeignKey("client.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    description: Mapped[str] = mapped_column(
        String,
        nullable=True,
    )
    blockchain_property_id: Mapped[str] = mapped_column(
        String,
        nullable=True,
    )
    transaction_hash: Mapped[str] = mapped_column(String, nullable=True)

    is_nft_minted: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=True,
    )

    blockchain_owner_id: Mapped[str] = mapped_column(
        String,
        nullable=True,
    )

    price: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )
    is_negotiable: Mapped[bool] = mapped_column(Boolean, nullable=True, default=False)
    location: Mapped[str] = mapped_column(
        String(70),
        nullable=False,
    )
    property_type: Mapped[PropertyTypeEnum] = mapped_column(
        Enum(PropertyTypeEnum), nullable=False, default=PropertyTypeEnum.apartment
    )
    listing_type: Mapped[ListingTypeEnum] = mapped_column(
        Enum(ListingTypeEnum), nullable=False, default=ListingTypeEnum.rent
    )
    status: Mapped[PropertyStatEnum] = mapped_column(
        Enum(PropertyStatEnum), default=PropertyStatEnum.available, nullable=False
    )
    furnished: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
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
    bathroom: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    bedroom: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    air_condition: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
    )
    pop_ceiling: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
    )
    floor_tiles: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
    )
    running_water: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
    )
    furniture: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
    )
    prepaid_meter: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
    )
    wifi: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
    )

    # NOTE - Relationships
    agent = relationship("Agent", back_populates="listings", lazy="selectin")
    images = relationship(
        "PropertyImage",
        back_populates="property",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    client = relationship("Client", back_populates="properties", lazy="selectin")
    contract = relationship(
        "Contract", uselist=False, back_populates="property", lazy="selectin"
    )
    __table_args__ = (
        CheckConstraint(
            f"property_type IN {tuple(item.value for item in PropertyTypeEnum)}",
            name="check_property_type",
        ),
        CheckConstraint(
            f"status IN {tuple(item.value for item in PropertyStatEnum)}",
            name="check_status",
        ),
        CheckConstraint(
            f"listing_type IN {tuple(item.value for item in ListingTypeEnum)}",
            name="check_listing",
        ),
    )


class PropertyImage(Base):
    __tablename__ = "property_image"
    id: Mapped[int] = mapped_column("id", autoincrement=True, primary_key=True)
    property_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("property.id", ondelete="CASCADE"), nullable=False
    )
    image_url: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=True, default=False)
    property = relationship("Property", back_populates="images", lazy="selectin")


class Appointment(Base):
    __tablename__ = "appointment"

    id: Mapped[int] = mapped_column("id", primary_key=True, autoincrement=True)
    client_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("client.id", ondelete="CASCADE"), nullable=False
    )
    agent_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("agent.id", ondelete="CASCADE"), nullable=False
    )
    property_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("property.id"), nullable=False
    )
    scheduled_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, unique=True
    )  # NOTE Date/Time of appointment
    # NOTE - Change to sold or rented o the agent cofirmation
    status: Mapped[AppointmentStatEnum] = mapped_column(
        Enum(AppointmentStatEnum), default=AppointmentStatEnum.pending
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
    client = relationship("Client", back_populates="appointments", lazy="selectin")
    agent = relationship("Agent", back_populates="appointments", lazy="selectin")


# NOTE Agent Availability Model
class AgentAvailability(Base):
    __tablename__ = "agent_availability"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("agent.id", ondelete="CASCADE"), nullable=False
    )
    weekday: Mapped[WeekDayEnum] = mapped_column(Enum(WeekDayEnum), nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    is_booked: Mapped[bool] = mapped_column(Boolean, default=False)
    agent = relationship("Agent", back_populates="availabilities", lazy="selectin")


class Contract(Base):
    __tablename__ = "contract"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    property_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("property.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    client_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("client.id", ondelete="CASCADE"), nullable=False
    )
    agent_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("agent.id", ondelete="CASCADE"), nullable=False
    )
    contract_type: Mapped[ListingTypeEnum] = mapped_column(
        Enum(ListingTypeEnum), nullable=False
    )
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    start_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    end_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )  # For rentals
    # NOTE -  Change to True once the agent confirms payment
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    idempotency_key: Mapped[str | None] = mapped_column(
        String(255), nullable=True, unique=True, index=True
    )  # For idempotency - prevents duplicate contract creation

    property = relationship("Property", back_populates="contract", lazy="selectin")
    payment_confirmation = relationship(
        "PaymentConfirmation", uselist=False, back_populates="contract", lazy="selectin"
    )


class AccountInfo(Base):
    __tablename__ = "account_info"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    account_name: Mapped[str] = mapped_column(String(255), nullable=False)
    bank_name: Mapped[str] = mapped_column(String(255), nullable=False)
    account_number: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)

    user = relationship("BaseUser", back_populates="account_info", lazy="selectin")


class PaymentConfirmation(Base):
    __tablename__ = "payment_confirmation"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contract_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("contract.id", ondelete="CASCADE"), nullable=False
    )
    client_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("client.id", ondelete="CASCADE"), nullable=False
    )
    agent_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("agent.id", ondelete="CASCADE"), nullable=False
    )
    is_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    idempotency_key: Mapped[str | None] = mapped_column(
        String(255), nullable=True, unique=True, index=True
    )  # For idempotency - prevents duplicate payment processing

    contract = relationship(
        "Contract", back_populates="payment_confirmation", lazy="selectin"
    )
    client = relationship(
        "Client", back_populates="payment_confirmations", lazy="selectin"
    )
    agent = relationship(
        "Agent", back_populates="payment_confirmations", lazy="selectin"
    )
