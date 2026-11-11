from sqlalchemy.future import select
from sqlalchemy.engine import Result
from sqlalchemy import or_, func
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
from sqlalchemy.orm import selectinload
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

    query = (
        select(Property)
        .options(selectinload(Property.images))
        .where(Property.id == property_id)
    )
    result: Result = await db.execute(query)
    property = result.scalar_one_or_none()
    if not property:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Property with id: {property_id} not found",
        )

    property_show = PropertyShow.model_validate(property, from_attributes=True)
    try:
        from app.services.cache import get_cache_service

        cache = await get_cache_service()
        await cache.set_property_detail(
            property_id, property_show.model_dump(mode="json")
        )
    except Exception as e:
        logger.warning(f"Failed to cache property: {e}")

    return property_show


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
        .options(selectinload(Property.images))
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
            feed=feed.model_dump(mode="json"),
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
    bid_id: int | None = None,
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
        # Ties this viewing to the on-chain deal it belongs to, so a seller
        # with several accepted bids knows which buyer is coming and both
        # sides can see one timeline instead of two disconnected halves.
        bid_id=bid_id,
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


async def record_appointment_outcome(
    appointment_id: int,
    agreed: bool,
    current_user: UserInDB,
    db: AsyncSession,
):
    """Record what a viewing produced, once it has actually happened.

    `confirmed` only ever meant the slot was booked. Nothing recorded whether
    the meeting took place or how it went, which is the one thing the seller
    needs before releasing the agreement on chain — and the one thing the buyer
    needs to know their locked escrow is still moving.
    """
    appointment = await db.get(Appointment, appointment_id)
    if not appointment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Appointment not found"
        )

    # Only the two people who were meant to be at the viewing can say what came
    # of it. This drives whether a seller may release documents, so letting a
    # third party set it would let them push a deal forward on someone's behalf.
    if current_user.id not in (appointment.client_id, appointment.agent_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the client or agent on this appointment can record its outcome",
        )

    if appointment.status in (
        AppointmentStatEnum.canceled,
        AppointmentStatEnum.completed,
        AppointmentStatEnum.not_agreed,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This appointment is already {appointment.status.value}",
        )

    appointment.status = (
        AppointmentStatEnum.completed if agreed else AppointmentStatEnum.not_agreed
    )
    db.add(appointment)
    await db.commit()
    await db.refresh(appointment)
    return appointment


async def fetch_appointment_stage(bid_id: int, db: AsyncSession):
    """Where a deal stands in the off-chain half of the flow.

    The buyer's escrow is locked the moment their bid is accepted, but the next
    on-chain step — the seller releasing the agreement NFT — waits on a meeting
    that happens in the real world. Nothing joined the two, so a deal in
    progress looked exactly like a deal that had stalled, and the buyer had no
    way to tell whether their money was working or stuck.
    """
    result: Result = await db.execute(
        select(Appointment)
        .where(Appointment.bid_id == bid_id)
        .order_by(Appointment.scheduled_at)
    )
    appointments = list(result.scalars().all())

    if not appointments:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No appointment has been booked for this bid yet.",
        )

    return {
        "bid_id": bid_id,
        "property_id": appointments[0].property_id,
        "appointments": appointments,
        # The signal the seller is waiting on. A viewing that merely got
        # "confirmed" was only ever a booked slot — it says nothing about
        # whether the meeting happened or the parties agreed.
        "ready_for_documents": any(
            a.status == AppointmentStatEnum.completed for a in appointments
        ),
        "viewing_not_agreed": any(
            a.status == AppointmentStatEnum.not_agreed for a in appointments
        ),
    }


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


# ── Searching for a property ────────────────────────────────────────────────
#
# Search ran only through Elasticsearch, and that made it fail in three
# different ways at once: the index is never populated (nothing calls the
# indexing endpoint), one deployment cannot reach Elasticsearch at all, and
# the results it returns are too thin to render — ids and titles, no images.
# The endpoint answered `{"results": [], "total": 0}` and looked healthy.
#
# So the database answers the query, and Elasticsearch — when it is reachable
# and has anything indexed — only decides the order. That way search works on
# a deployment with no index and no Elasticsearch, which is the state both
# deployments are actually in, and it returns whole properties that a client
# can draw.

# `amenities` arrives as a list of names, but the model stores each one as its
# own boolean column. Anything not named here is ignored rather than refused:
# an unknown amenity should narrow nothing, not empty the page.
_AMENITY_COLUMNS = {
    "wifi": "wifi",
    "air_condition": "air_condition",
    "air_conditioning": "air_condition",
    "ac": "air_condition",
    "pop_ceiling": "pop_ceiling",
    "floor_tiles": "floor_tiles",
    "running_water": "running_water",
    "water": "running_water",
    "furniture": "furniture",
    "furnished": "furnished",
    "prepaid_meter": "prepaid_meter",
}

_SORT_COLUMNS = {
    "price_asc": (Property.price, "asc"),
    "price_desc": (Property.price, "desc"),
    "created_desc": (Property.created_at, "desc"),
    "created_asc": (Property.created_at, "asc"),
}


def _apply_search_filters(stmt, *, query=None, location=None, property_type=None,
                          listing_type=None, min_price=None, max_price=None,
                          min_bedroom=None, max_bedroom=None, min_bathroom=None,
                          max_bathroom=None, furnished=None, amenities=None):
    """Narrow a Property select by everything the search endpoint accepts."""
    if query and query.strip() and query.strip() != "*":
        like = f"%{query.strip()}%"
        # Three fields, because people search for a place as readily as for a
        # kind of property.
        stmt = stmt.where(
            or_(
                Property.title.ilike(like),
                Property.description.ilike(like),
                Property.location.ilike(like),
            )
        )

    if location:
        stmt = stmt.where(Property.location.ilike(f"%{location}%"))
    if property_type:
        stmt = stmt.where(Property.property_type == property_type)
    if listing_type:
        stmt = stmt.where(Property.listing_type == listing_type)
    if min_price is not None:
        stmt = stmt.where(Property.price >= min_price)
    if max_price is not None:
        stmt = stmt.where(Property.price <= max_price)
    if min_bedroom is not None:
        stmt = stmt.where(Property.bedroom >= min_bedroom)
    if max_bedroom is not None:
        stmt = stmt.where(Property.bedroom <= max_bedroom)
    if min_bathroom is not None:
        stmt = stmt.where(Property.bathroom >= min_bathroom)
    if max_bathroom is not None:
        stmt = stmt.where(Property.bathroom <= max_bathroom)
    if furnished is not None:
        stmt = stmt.where(Property.furnished == furnished)

    for name in amenities or []:
        column = _AMENITY_COLUMNS.get(str(name).strip().lower().replace(" ", "_"))
        if column:
            stmt = stmt.where(getattr(Property, column).is_(True))

    # A delisted property is not a search result. `is_active` is nullable on
    # rows that predate the column, and `!= False` keeps those visible rather
    # than silently dropping every older listing.
    stmt = stmt.where(Property.is_active.isnot(False))
    return stmt


async def search_properties(
    db: AsyncSession,
    *,
    query=None, location=None, property_type=None, listing_type=None,
    min_price=None, max_price=None, min_bedroom=None, max_bedroom=None,
    min_bathroom=None, max_bathroom=None, furnished=None, amenities=None,
    sort="relevance", limit=20, offset=0, ranked_ids=None,
):
    """Find properties, returning whole rows rather than index fragments.

    `ranked_ids` is Elasticsearch's opinion about ordering, when it had one.
    The rows still come from the database, so a half-built index degrades the
    ordering instead of emptying the page.
    """
    filters = dict(
        query=query, location=location, property_type=property_type,
        listing_type=listing_type, min_price=min_price, max_price=max_price,
        min_bedroom=min_bedroom, max_bedroom=max_bedroom,
        min_bathroom=min_bathroom, max_bathroom=max_bathroom,
        furnished=furnished, amenities=amenities,
    )

    count_stmt = _apply_search_filters(select(func.count(Property.id)), **filters)
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = _apply_search_filters(
        select(Property).options(selectinload(Property.images)), **filters
    )

    if ranked_ids:
        # Keep Elasticsearch's order, and only for the page it ranked.
        stmt = stmt.where(Property.id.in_(ranked_ids))
        rows = list((await db.execute(stmt)).scalars().all())
        position = {pid: i for i, pid in enumerate(ranked_ids)}
        rows.sort(key=lambda p: position.get(p.id, len(position)))
    else:
        column, direction = _SORT_COLUMNS.get(sort, (None, None))
        if column is None:
            # Relevance without an index is not meaningful, so newest first —
            # the useful default for a marketplace, and a stable order rather
            # than whatever the database happens to return.
            column, direction = Property.created_at, "desc"
        stmt = stmt.order_by(column.desc() if direction == "desc" else column.asc())
        stmt = stmt.limit(limit).offset(offset)
        rows = list((await db.execute(stmt)).scalars().all())

    return {
        "data": rows,
        "total": total,
        "limit": limit,
        "offset": offset,
        # Which path answered, so an empty page can be told apart from a
        # missing index without reading the logs.
        "source": "index" if ranked_ids else "database",
    }
