from sqlalchemy.future import select
from sqlalchemy.engine import Result
from app.models.property import Property, PropertyImage
from app.schemas.user_schema import UserInDB, AgentFeed
from app.models.property import (
    Appointment,
    AgentAvailability,
    PaymentConfirmation,
    Contract,
    AccountInfo,
)
from app.models.user import BaseUser, Agent
from app.schemas.property_schema import (
    PropertyBase,
    PropertyUpdate,
    ContractCreate,
    PropertyShow,
)
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.schemas.property_schema import (
    FilterParams,
    PropertyFeed,
    DeleteProperty,
    AgentAvailabilitySchema,
)
from datetime import datetime, timezone, timedelta
from app.utils.enums import (
    AppointmentStatEnum,
    PropertyStatEnum,
    ListingTypeEnum,
    AccountTypeEnum,
)
from core.logger import logger


async def create_property_listing(
    current_user: UserInDB, property_data: PropertyBase, db: AsyncSession
):
    new_property = Property(
        agent_id=current_user.id, **property_data.model_dump(exclude={"images"})
    )
    images = [PropertyImage(**img.model_dump()) for img in property_data.images]
    new_property.images = images
    db.add(new_property)
    await db.commit()
    await db.refresh(new_property)
    return new_property


async def get_user_properties(
    current_user: UserInDB, filter_query: FilterParams, db: AsyncSession
):
    query = (
        select(Property)
        .where(Property.agent_id == current_user.id)
        .where(Property.id >= filter_query.cursor)
        .limit(filter_query.limit)
    )
    result: Result = await db.execute(query)
    property = result.scalars().all()
    return property


async def get_property_by_id(
    property_id: int, db: AsyncSession, use_cache: bool = True
):
    """Fetch a single property by its ID.

    Args:
        property_id: The ID of the property to fetch.
        db: The database session.

    Returns:
        The property object if found.

    Raises:
        HTTPException: If the property is not found.
    """
    if use_cache:
        # Try cache first
        try:
            from app.services.cache import get_cache_service

            cache = await get_cache_service()
            cached = await cache.get_property_detail(property_id)
            if cached:
                logger.debug(f"Property cache hit", extra={"property_id": property_id})
                # `cached` is a fully-serialized PropertyShow payload (see below) —
                # NOT a partial dict of raw Property columns. Reconstructing a bare
                # Property(**cached) here previously produced a transient ORM object
                # missing most required PropertyShow fields (status, furnished,
                # is_active, images, etc.), which failed response-model validation
                # with a 500 on every cache hit.
                return PropertyShow(**cached)
        except Exception as e:
            logger.warning(f"Cache error, falling back to database: {e}")

    query = select(Property).where(Property.id == property_id)
    result: Result = await db.execute(query)
    property = result.scalar_one_or_none()
    if not property:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Property with id: {property_id} not found",
        )

    # Cache the full response payload (not a hand-picked subset of columns) so
    # a cache hit can be served without touching the DB or the ORM object again.
    try:
        from app.services.cache import get_cache_service

        cache = await get_cache_service()
        property_show = PropertyShow.model_validate(property, from_attributes=True)
        await cache.set_property_detail(
            property_id, property_show.model_dump(mode="json")
        )
    except Exception as e:
        logger.warning(f"Failed to cache property: {e}")

    return property


async def update_listing(
    property_id: int,
    current_user: UserInDB,
    update_data: PropertyUpdate,
    db: AsyncSession,
):
    query = select(Property).where(
        Property.id == property_id, Property.agent_id == current_user.id
    )
    result = await db.execute(query)
    property = result.scalar_one_or_none()

    if not property:
        raise HTTPException(status_code=404, detail="Property not found")

    for key, value in update_data.model_dump(
        exclude_unset=True, exclude={"images"}
    ).items():
        setattr(property, key, value)

    if update_data.images is not None:
        property.images = [
            PropertyImage(**image_data.model_dump())
            for image_data in update_data.images
        ]

    db.add(property)
    await db.commit()
    await db.refresh(property)

    # Invalidate caches
    try:
        from app.services.cache import get_cache_service

        cache = await get_cache_service()
        await cache.invalidate_properties()
        logger.info(
            f"Property caches invalidated after update",
            extra={"property_id": property_id},
        )
    except Exception as e:
        logger.warning(f"Failed to invalidate cache: {e}")

    return property


async def filtered_property(filter_query: FilterParams, db: AsyncSession):
    # Generate cache key from filter params
    try:
        from app.services.cache import get_cache_service
        from app.utils.cache_keys import generate_filter_hash

        cache = await get_cache_service()
        filters_dict = {
            "cursor": filter_query.cursor,
            "limit": filter_query.limit,
        }
        filters_hash = generate_filter_hash(filters_dict)

        # Try cache
        cached = await cache.get_property_feed(page=1, filters_hash=filters_hash)
        if cached:
            logger.debug(f"Property feed cache hit", extra={"filters": filters_dict})
            return PropertyFeed(**cached)
    except Exception as e:
        logger.warning(f"Cache error, falling back to database: {e}")

    query = (
        select(Property)
        .where(Property.id >= filter_query.cursor)
        .limit(filter_query.limit)
    )
    result: Result = await db.execute(query)
    properties: Property = result.scalars().all()  # type: ignore
    next_cursor = properties[-1].id + 1 if properties else None
    feed = PropertyFeed(data=properties, next_coursor=next_cursor)

    # Cache the result
    try:
        cache = await get_cache_service()
        await cache.set_property_feed(
            page=1,
            filters_hash=filters_hash,
            feed={
                "data": [p.__dict__ for p in properties],
                "next_coursor": next_cursor,
            },
        )
    except Exception as e:
        logger.warning(f"Failed to cache property feed: {e}")

    return feed


async def get_agent_by_id(agent_id: int, db: AsyncSession):
    query = select(Agent).where(Agent.id == agent_id)
    result: Result = await db.execute(query)
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"agent with id:{agent_id} not found",
        )
    return agent


async def delist_property(property_id: int, db: AsyncSession, current_user: UserInDB):
    logger.info(
        f"Attempting to delete property id:{property_id} by agent id:{current_user.id}"
    )
    # fetch property directly from user's listings

    property: Property = select(Property).where(
        Property.id == property_id, Property.agent_id == current_user.id
    )
    property_result: Result = await db.execute(property)
    property = property_result.scalar_one_or_none()

    if not property:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Property not found or you are not the owner",
        )
    if property.status != PropertyStatEnum.available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Property cannot be deleted because it is currently rented or sold",
        )
    await db.delete(property)
    logger.info(f"Property with id:{property_id} deleted by agent id:{current_user.id}")
    await db.commit()
    return DeleteProperty(message="Property Deleted")


async def run_book_appointment(
    client_id: int,
    agent_id: int,
    property_id: int,
    requested_time: datetime,
    db: AsyncSession,
):
    requested_weekday = requested_time.strftime("%A").upper()
    requested_time_only = requested_time.time()

    # NOTE Check if the requested time matches an available slot
    available_slot: Result = await db.execute(
        select(AgentAvailability).where(
            AgentAvailability.agent_id == agent_id,
            AgentAvailability.weekday == requested_weekday,
            AgentAvailability.start_time <= requested_time_only,
            AgentAvailability.end_time > requested_time_only,
            AgentAvailability.is_booked == False,
        )
    )
    available_slot = available_slot.scalars().first()  # type: ignore

    if available_slot:
        available_slot.is_booked = True  # type: ignore
        scheduled_time = requested_time
    else:
        logger.error(f"slots found:{available_slot}")
        # No available slot, negotiation required
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Requested time is unavailable. Please negotiate a new time.",
        )

    appointment = Appointment(
        client_id=client_id,
        agent_id=agent_id,
        property_id=property_id,
        scheduled_at=scheduled_time,
    )

    db.add(appointment)
    await db.commit()
    await db.refresh(appointment)
    return appointment


async def create_availability(
    data: AgentAvailabilitySchema, db: AsyncSession, current_user: UserInDB
):
    new_schedule = AgentAvailability(agent_id=current_user.id, **data.model_dump())
    db.add(new_schedule)
    await db.commit()
    await db.refresh(new_schedule)
    return new_schedule


async def fetch_schedule(agent_id: int, db: AsyncSession):
    query = select(AgentAvailability).where(AgentAvailability.agent_id == agent_id)
    result: Result = await db.execute(query)
    schedule = result.scalars().all()
    return schedule or []


async def update_agent_availabilty(
    update: AgentAvailabilitySchema,
    db: AsyncSession,
    schedule_id: int,
    current_user: AgentFeed,
):
    schedule = next(
        (
            availability
            for availability in current_user.availabilities
            if availability.id == schedule_id
        ),
        None,
    )
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found or you are not the owner",
        )
    for key, value in update.model_dump(exclude_unset=True):
        setattr(schedule, key, value)
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    return schedule


async def delete_agent_availability(
    schedule_id: int, current_user: AgentFeed, db: AsyncSession
):
    """
    Remove one of the agent's viewing windows.

    Ownership is enforced by only searching within current_user.availabilities,
    matching update_agent_availabilty above — an id belonging to another agent
    is indistinguishable from one that doesn't exist.

    A window that is already booked is refused rather than deleted: an
    Appointment records its own scheduled_at and holds no FK back to
    agent_availability, so removing the window here would leave that booking
    standing with nothing on the agent's schedule accounting for it. The agent
    cancels the appointment first.
    """
    schedule = next(
        (
            availability
            for availability in current_user.availabilities
            if availability.id == schedule_id
        ),
        None,
    )
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found or you are not the owner",
        )

    if schedule.is_booked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This slot has a booked viewing. Cancel the appointment before "
                "removing the window."
            ),
        )

    await db.delete(schedule)
    await db.commit()
    return {"detail": "Availability deleted successfully"}


async def cancel_appointment_by_id(
    appointment_id: int, current_user: UserInDB, db: AsyncSession
):
    appointment: Appointment = next(
        (
            appointment
            for appointment in current_user.appointments  # type: ignore
            if appointment.id == appointment_id
        ),
        None,
    )  # type: ignore
    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found"
        )

    if not appointment.status == AppointmentStatEnum.pending:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot cancel completed appointment",
        )
    appointment.status = AppointmentStatEnum.canceled
    db.add(appointment)
    await db.commit()
    await db.refresh(appointment)

    return {"detail": "Appointment Canceled"}


async def get_payment_info(contract_id: int, db: AsyncSession):
    contract = await db.get(Contract, contract_id)
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")

    account_info = await db.get(AccountInfo, contract.agent_id)
    if not account_info:
        raise HTTPException(status_code=404, detail="Agent account details not found")

    return account_info


async def confirm_payment(contract_id: int, db: AsyncSession):
    contract = await db.get(Contract, contract_id)
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")

    payment_confirmation = PaymentConfirmation(
        contract_id=contract.id,
        client_id=contract.client_id,
        agent_id=contract.agent_id,
        is_confirmed=True,
    )

    db.add(payment_confirmation)
    await db.commit()

    return {"message": "Payment confirmed, waiting for agent approval"}


async def proccess_approve_payment(contract_id: int, db: AsyncSession):
    payment_confirmation = await db.get(PaymentConfirmation, contract_id)
    if not payment_confirmation or not payment_confirmation.is_confirmed:
        raise HTTPException(status_code=400, detail="Payment not confirmed by client")

    contract = await db.get(Contract, contract_id)
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")

    contract.is_active = True  # Activate contract upon approval
    await db.commit()

    return {"message": "Payment approved, contract signed"}


async def run_create_contract(
    contract_data: ContractCreate, db: AsyncSession, current_user: UserInDB
):
    """Creates a contract after payment is made"""

    # Check if property exists
    property_stmt = select(Property).where(Property.id == contract_data.property_id)
    property_result = await db.execute(property_stmt)
    property = property_result.scalar_one_or_none()

    if not property:
        raise HTTPException(status_code=404, detail="Property not found")

    if property.status != PropertyStatEnum.available:
        raise HTTPException(
            status_code=400, detail="Property is not available for contract"
        )

    # Ensure current user is a client and not the agent
    if property.agent_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="Agents cannot create contracts for their own properties",
        )

    # Check if payment is marked as completed
    if not contract_data.is_payment_made:
        raise HTTPException(
            status_code=400,
            detail="Payment must be completed before creating a contract",
        )

    # Determine contract type (rent or sale)
    contract_type = property.listing_type

    # Set contract duration if renting
    end_date = None
    if contract_type == ListingTypeEnum.rent:
        end_date = datetime.now(timezone.utc) + timedelta(
            days=30 * contract_data.rental_period_months  # type: ignore
        )  # type: ignore

    # Create contract
    contract = Contract(
        property_id=property.id,
        client_id=current_user.id,
        agent_id=property.agent_id,
        contract_type=contract_type,
        amount=contract_data.amount,
        start_date=datetime.now(timezone.utc),
        end_date=end_date,
        is_active=False,  # Activates when agent confirms
    )

    # Update property status
    property.status = (
        PropertyStatEnum.rented
        if contract_type == ListingTypeEnum.rent
        else PropertyStatEnum.sold
    )

    db.add(contract)
    await db.commit()
    await db.refresh(contract)

    return


async def confirm_agent_appointment(
    appointment_id: int, current_user: UserInDB, db: AsyncSession
):
    appointment: Appointment = next(
        (
            appointment
            for appointment in current_user.appointments  # type: ignore
            if appointment.id == appointment_id
        ),
        None,
    )  # type: ignore

    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found"
        )

    # Only the agent assigned to the appointment can confirm it
    if appointment.agent_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to confirm this appointment",
        )

    if appointment.status != AppointmentStatEnum.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot confirm appointment with status {appointment.status}",
        )

    appointment.status = AppointmentStatEnum.confirmed
    db.add(appointment)
    await db.commit()
    await db.refresh(appointment)

    return {"detail": "Appointment Confirmed", "status": appointment.status}
