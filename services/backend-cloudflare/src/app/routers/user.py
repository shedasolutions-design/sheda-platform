from fastapi import APIRouter, status, Query, Depends, HTTPException
from app.models.user import BaseUser
from app.services.user_service import (
    ActiveUser,
    ActiveVerifiedClient,
    ActiveAgent,
    ActiveVerifiedUser,
    get_current_user,
)
from app.services.profile import (
    update_user,
    create_new_payment_info,
    get_account_info,
    update_account_info,
    run_account_info_deletion,
)
from core.dependecies import DBSession, get_db
from app.schemas.user_schema import (
    UserShow,
    UserUpdate,
    AccountInfoBase,
    AccountInfoShow,
)
from typing import List
from app.schemas.property_schema import (
    AppointmentSchema,
    AppointmentShow,
    AppointmentStageShow,
    AvailabilityShow,
    AgentAvailabilitySchema,
    ContractResponse,
    ContractCreate,
)
from app.services.listing import (
    run_book_appointment,
    create_availability,
    fetch_schedule,
    update_agent_availabilty,
    cancel_appointment_by_id,
    get_payment_info,  # type: ignore # type: ignore # type: ignore
    confirm_payment,
    proccess_approve_payment,
    proccess_approve_payment,
    run_create_contract,
    confirm_agent_appointment,
    fetch_appointment_stage,
    record_appointment_outcome,
    delete_agent_availability,
)
from typing import Optional


router = APIRouter(
    tags=["User"],
    prefix="/user",
)


# NOTE -  Get the current user data
@router.get(
    "/me",
    response_model=UserShow,
    description="Get Current User Profile",
    status_code=status.HTTP_200_OK,
)
async def get_me(current_user: ActiveUser):
    return current_user


@router.get("/{user_id}", response_model=UserShow, status_code=status.HTTP_200_OK)
async def get_user_by_id(user_id: int, current_user: ActiveVerifiedUser, db: DBSession):
    user = await db.get(BaseUser, user_id)
    return user


update_desc = """pick the target field and exclude the rest,
the server will dynamically update,all fields are optional"""


# NOTE - Update User Profile
@router.put(
    "/update/me",
    response_model=UserUpdate,
    description=update_desc,
    status_code=status.HTTP_202_ACCEPTED,
)
async def update_me(
    current_user: ActiveUser, update_data: UserUpdate, db: DBSession
) -> ActiveUser:
    return await update_user(update_data, db, current_user)


# NOTE - Delete
@router.delete("/me", status_code=status.HTTP_202_ACCEPTED, response_model=dict)
async def delete_account(current_user: ActiveUser, db: DBSession):
    current_user.is_active = False
    current_user.is_deleted = True
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return {"message": "Account deleted successfully"}


# NOTE Book agent appointment
@router.post(
    "/book-appointment",
    status_code=status.HTTP_201_CREATED,
    response_model=AppointmentShow,
)
async def book_appointment(
    current_user: ActiveVerifiedClient, payload: AppointmentSchema, db: DBSession
):
    return await run_book_appointment(
        client_id=current_user.id,
        agent_id=payload.agent_id,
        property_id=payload.property_id,
        requested_time=payload.requested_time,
        db=db,
        bid_id=payload.bid_id,
    )


# NOTE Off-chain half of a deal's timeline.
#
# Appointments live here and bids live on chain, and nothing joined them. The
# buyer's escrow is locked from the moment their bid is accepted, but the next
# on-chain step — the seller releasing the agreement — waits on a real-world
# meeting, so a deal in progress was indistinguishable from one that had
# stalled. Clients pair this with the on-chain bid status to show both parties
# one continuous timeline.
@router.get(
    "/appointment-stage/{bid_id}",
    status_code=status.HTTP_200_OK,
    response_model=AppointmentStageShow,
)
async def appointment_stage(bid_id: int, current_user: ActiveUser, db: DBSession):
    return await fetch_appointment_stage(bid_id, db)


# NOTE Record what a viewing produced.
#
# `confirmed` only ever meant the slot was booked — nothing said whether the
# meeting happened or how it went. `agreed=true` is what tells the seller they
# can release the agreement on chain; `agreed=false` tells the buyer plainly
# that the deal is off so they can cancel and reclaim their escrow, which they
# can do at any time while the bid is merely accepted.
@router.patch(
    "/appointment-outcome/{appointment_id}",
    status_code=status.HTTP_200_OK,
    response_model=AppointmentShow,
)
async def appointment_outcome(
    appointment_id: int, agreed: bool, current_user: ActiveUser, db: DBSession
):
    return await record_appointment_outcome(appointment_id, agreed, current_user, db)


# NOTE Cancel Appointment
@router.delete(
    "/cancel-appointment/{appointment_id}",
    status_code=status.HTTP_200_OK,
    response_model=dict,
)
async def cancel_aappointment(
    appointment_id: int, current_user: ActiveUser, db: DBSession
):
    return await cancel_appointment_by_id(appointment_id, current_user, db)


@router.post(
    "/create-payment-info",
    status_code=status.HTTP_200_OK,
    response_model=AccountInfoShow,
)
async def create_payment_info(
    data: AccountInfoBase, db: DBSession, current_user: ActiveUser
):
    return await create_new_payment_info(data, db, current_user)


# NOTE Get user account info by the current user or a specified ID
@router.get(
    "/payment-info",
    status_code=status.HTTP_200_OK,
    response_model=List[AccountInfoShow],
)
async def get_user_payment_info(
    *, user_id: Optional[int] = Query(None), db: DBSession, current_user: ActiveUser
):
    user_id = user_id or current_user.id
    return await get_account_info(db, user_id)


@router.put(
    "/update-account-info/{account_info_id}",
    status_code=status.HTTP_200_OK,
    response_model=AccountInfoShow,
)
async def update_payment_info(
    update_data: AccountInfoBase,
    account_info_id: int,
    current_user: ActiveUser,
    db: DBSession,
):
    return await update_account_info(update_data, db, current_user, account_info_id)


@router.delete(
    "/delete-accnt-info/{account_info_id}",
    status_code=status.HTTP_200_OK,
    response_model=dict,
)
async def delete_account_info(
    account_info_id: int, current_user: ActiveUser, db: DBSession
):
    return await run_account_info_deletion(current_user, db, account_info_id)


@router.get(
    "/payment-info/{contract_id}",
    response_model=AccountInfoBase,
    status_code=status.HTTP_200_OK,
)
async def get_contract_payment_info(
    contract_id: int, db: DBSession, current_user: ActiveUser
):
    from app.services.listing import get_payment_info as get_payment_info_service

    return await get_payment_info_service(contract_id, db)


# NOTE create availability
@router.post(
    "/create-available-time",
    status_code=status.HTTP_201_CREATED,
    response_model=AvailabilityShow,
)
async def create_schedule(
    request: AgentAvailabilitySchema, current_user: ActiveAgent, db: DBSession
):
    return await create_availability(request, db, current_user)


@router.get(
    "/get-schedule/me",
    status_code=status.HTTP_200_OK,
    response_model=List[AvailabilityShow],
)
async def get_schedule(current_user: ActiveAgent, db: DBSession):
    return await fetch_schedule(current_user.id, db)


@router.put(
    "/update-schedule/{schedule_id}",
    response_model=AvailabilityShow,
    status_code=status.HTTP_200_OK,
)
async def update_schedule(
    schedule_id: int,
    update_data: AgentAvailabilitySchema,
    current_user: ActiveAgent,
    db: DBSession,
):
    return await update_agent_availabilty(update_data, db, schedule_id, current_user)  # type: ignore # type: ignore


# NOTE delete availability
@router.delete(
    "/delete-schedule/{schedule_id}",
    status_code=status.HTTP_200_OK,
    response_model=dict,
)
async def delete_schedule(
    schedule_id: int,
    current_user: ActiveAgent,
    db: DBSession,
):
    return await delete_agent_availability(schedule_id, current_user, db)  # type: ignore


@router.post(
    "/confirm-payment/{contract_id}",
    status_code=status.HTTP_200_OK,
    response_model=dict,
)
async def confirm_client_payment(
    contract_id: int, db: DBSession, user: ActiveVerifiedClient
):
    return await confirm_payment(contract_id, db)


@router.post(
    "/approve-payment/{contract_id}",
    status_code=status.HTTP_200_OK,
    response_model=dict,
)
async def approve_payment(contract_id: int, db: DBSession, user: ActiveAgent):
    return await proccess_approve_payment(contract_id, db)


@router.post(
    "/contracts/", response_model=ContractResponse, status_code=status.HTTP_201_CREATED
)
async def create_contract(
    data: ContractCreate, current_user: ActiveVerifiedClient, db: DBSession
):
    return await run_create_contract(data, db, current_user)


@router.put(
    "/confirm-appointment/{appointment_id}",
    status_code=status.HTTP_200_OK,
    response_model=dict,
)
async def confirm_appointment(
    appointment_id: int, current_user: ActiveAgent, db: DBSession
):
    return await confirm_agent_appointment(appointment_id, current_user, db)


# KYC Integration Endpoints (Phase 2)

try:
    from app.services.kyc import get_kyc_service
    from core.logger import logger

    KYC_AVAILABLE = True
except (ImportError, RuntimeError):
    KYC_AVAILABLE = False


@router.post("/kyc/start-verification")
async def start_kyc_verification(
    email: str,
    first_name: str,
    last_name: str,
    current_user: ActiveUser,
    db: DBSession,
    phone_number: Optional[str] = None,
):
    """
    Start KYC (Know Your Customer) verification process.

    Args:
        email: User's email
        first_name: First name
        last_name: Last name
        phone_number: Phone number (optional)
        current_user: Authenticated user

    Returns:
        {
            "verification_id": "...",
            "redirect_url": "...",
            "status": "pending"
        }
    """
    if not KYC_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="KYC service not available",
        )

    try:
        service = await get_kyc_service()

        verification = await service.create_verification(
            user_id=current_user.id,
            email=email,
            first_name=first_name,
            last_name=last_name,
            phone_number=phone_number,
        )

        logger.info(
            f"KYC verification started",
            extra={
                "user_id": current_user.id,
                "verification_id": verification.get("id"),
            },
        )

        return {
            "verification_id": verification.get("id"),
            "redirect_url": verification.get("attributes", {}).get("redirect-url"),
            "status": "pending",
            "user_id": current_user.id,
        }

    except Exception as e:
        logger.error(f"Error starting KYC verification: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start KYC verification",
        )


@router.get("/kyc/status/{verification_id}")
async def get_kyc_status(
    verification_id: str,
    current_user: ActiveUser,
    db:DBSession
):
    """
    Check KYC verification status.

    Args:
        verification_id: ID of verification inquiry
        current_user: Authenticated user

    Returns:
        {
            "id": "...",
            "status": "pending|approved|declined",
            "created_at": "2025-02-18T...",
            "completed_at": "2025-02-18T...",
            "reason": "..." // if rejected
        }
    """
    if not KYC_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="KYC service not available",
        )

    try:
        service = await get_kyc_service()

        status_result = await service.get_verification_status(verification_id)

        logger.info(
            f"KYC status checked",
            extra={
                "user_id": current_user.id,
                "verification_id": verification_id,
                "status": status_result.get("status"),
            },
        )
        
        from app.utils.enums import KycStatusEnum
        if status_result.get("status")=="verified":
            current_user.kyc_status = KycStatusEnum.verified
            await db.commit()
            

        return {
            "id": status_result.get("id"),
            "status": status_result.get("status"),
            "created_at": status_result.get("created_at"),
            "completed_at": status_result.get("completed_at"),
            "reason": status_result.get("reason"),
        }

    except Exception as e:
        logger.error(f"Error checking KYC status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to check KYC status",
        )


@router.get("/kyc/is-verified/{user_id}")
async def is_user_verified(
    user_id: int,
    current_user: ActiveUser,
):
    """
    Check if a user has passed KYC verification.

    Args:
        user_id: User to check
        current_user: Authenticated user

    Returns:
        {"user_id": int, "is_verified": bool, "verification_status": "..."}
    """
    if not KYC_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="KYC service not available",
        )

    try:
        # TODO: Query database for user's KYC status
        # For now, returning placeholder
        logger.info(f"KYC verification check for user {user_id}")

        return {
            "user_id": user_id,
            "is_verified": current_user.verified,  # Query DB for actual status
            "verification_status": current_user.kyc_status,
        }

    except Exception as e:
        logger.error(f"Error checking user verification: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to check verification status",
        )
