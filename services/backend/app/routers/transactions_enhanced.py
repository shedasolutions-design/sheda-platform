"""
Enhanced transactions router with Celery task integration.

Integrates background task processing for payments and blockchain operations.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional
from core.logger import logger
from core.dependecies import DBSession, get_current_user
from app.models.user import BaseUser
from pydantic import BaseModel

try:
    from app.tasks.email import send_otp_email
    from app.tasks.notifications import (
        send_transaction_notification,
        send_push_notification,
    )
    from app.tasks.transactions import process_payment_confirmation, mint_property_nft

    CELERY_AVAILABLE = True
except ImportError:
    CELERY_AVAILABLE = False
    logger.warning("Celery task integration not available")

router = APIRouter(prefix="/transactions", tags=["Transactions - Enhanced"])


# Request/Response schemas
class ProcessPaymentRequest(BaseModel):
    """Process payment confirmation."""

    contract_id: int
    transaction_hash: str
    amount: Optional[float] = None


class MintNFTRequest(BaseModel):
    """Mint property NFT."""

    property_id: int
    owner_address: str


class SendEmailTaskRequest(BaseModel):
    """Send email via Celery task."""

    email: str
    otp_code: Optional[str] = None
    fullname: str


@router.post("/process-payment")
async def process_payment_async(
    request: ProcessPaymentRequest,
    current_user: BaseUser = Depends(get_current_user),
    db: DBSession = Depends(),
):
    """
    Process payment confirmation asynchronously.

    Queues a Celery background task to:
    1. Verify blockchain transaction
    2. Update contract status
    3. Send notifications

    Args:
        contract_id: ID of contract to process
        transaction_hash: Blockchain transaction hash
        amount: Payment amount (optional)
        current_user: Authenticated user

    Returns:
        {"status": "processing", "contract_id": int, "task_id": "..."}
    """
    if not CELERY_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Background task processing not available",
        )

    try:
        # Queue async task
        task = process_payment_confirmation.delay(
            contract_id=request.contract_id,
            payment_data={
                "transaction_hash": request.transaction_hash,
                "amount": request.amount,
            },
        )

        logger.info(
            f"Payment processing task queued",
            extra={
                "contract_id": request.contract_id,
                "user_id": current_user.id,
                "task_id": task.id,
            },
        )

        return {
            "status": "processing",
            "contract_id": request.contract_id,
            "task_id": task.id,
        }

    except Exception as e:
        logger.error(f"Error queuing payment task: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process payment",
        )


@router.post("/mint-property-nft")
async def mint_nft_async(
    request: MintNFTRequest,
    current_user: BaseUser = Depends(get_current_user),
):
    """
    Mint property NFT on blockchain asynchronously.

    Queues a Celery background task to:
    1. Create NFT smart contract call
    2. Wait for blockchain confirmation
    3. Update property ownership
    4. Send notification to owner

    Args:
        property_id: ID of property to mint
        owner_address: Owner's blockchain address
        current_user: Authenticated user

    Returns:
        {"status": "minting", "property_id": int, "task_id": "..."}
    """
    if not CELERY_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="NFT minting service not available",
        )

    try:
        # Queue async task
        task = mint_property_nft.delay(
            property_id=request.property_id,
            owner_address=request.owner_address,
        )

        logger.info(
            f"NFT minting task queued",
            extra={
                "property_id": request.property_id,
                "user_id": current_user.id,
                "task_id": task.id,
            },
        )

        return {
            "status": "minting",
            "property_id": request.property_id,
            "task_id": task.id,
        }

    except Exception as e:
        logger.error(f"Error queuing NFT mint task: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to mint NFT",
        )


@router.post("/send-transaction-notification")
async def send_transaction_notification_async(
    user_id: int,
    transaction_type: str,  # bid_placed, bid_accepted, payment_received, contract_signed
    property_title: str = "Property",
    additional_data: Optional[dict] = None,
    current_user: BaseUser = Depends(get_current_user),
):
    """
    Send transaction notification asynchronously.

    Queues a Celery background task to send push notification for transaction.

    Args:
        user_id: User to notify
        transaction_type: Type of transaction
        property_title: Title of property involved
        additional_data: Optional additional data
        current_user: Authenticated user

    Returns:
        {"status": "queued", "user_id": int, "notification_type": str}
    """
    if not CELERY_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Background task processing not available",
        )

    try:
        # Queue async task
        task = send_transaction_notification.delay(
            user_id=user_id,
            transaction_type=transaction_type,
            transaction_data=additional_data
            or {
                "property_title": property_title,
            },
        )

        logger.info(
            f"Transaction notification queued",
            extra={
                "user_id": user_id,
                "transaction_type": transaction_type,
                "task_id": task.id,
            },
        )

        return {
            "status": "queued",
            "user_id": user_id,
            "notification_type": transaction_type,
            "task_id": task.id,
        }

    except Exception as e:
        logger.error(f"Error queuing transaction notification: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to queue notification",
        )


@router.post("/confirm-payment/{contract_id}")
async def confirm_payment_endpoint(
    contract_id: int,
    transaction_hash: str,
    current_user: BaseUser = Depends(get_current_user),
):
    """
    Confirm payment for contract asynchronously.

    Wrapper that combines idempotency check + async processing.

    Args:
        contract_id: Contract ID
        transaction_hash: Blockchain transaction hash
        current_user: Authenticated user

    Returns:
        {"status": "confirming", "contract_id": int}
    """
    if not CELERY_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Payment processing not available",
        )

    try:
        # TODO: Add idempotency check using IdempotencyService

        # Queue async payment processing
        task = process_payment_confirmation.delay(
            contract_id=contract_id,
            payment_data={
                "transaction_hash": transaction_hash,
            },
        )

        logger.info(
            f"Payment confirmation queued",
            extra={
                "contract_id": contract_id,
                "user_id": current_user.id,
                "task_id": task.id,
            },
        )

        return {
            "status": "confirming",
            "contract_id": contract_id,
            "task_id": task.id,
        }

    except Exception as e:
        logger.error(f"Error confirming payment: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to confirm payment",
        )


@router.get("/task-status/{task_id}")
async def get_task_status(
    task_id: str,
    current_user: BaseUser = Depends(get_current_user),
):
    """
    Get status of a background task.

    Args:
        task_id: Celery task ID
        current_user: Authenticated user

    Returns:
        {"status": "pending|success|failure", "result": "..."}
    """
    if not CELERY_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Background task processing not available",
        )

    try:
        from celery.result import AsyncResult
        from core.celery_config import app as celery_app

        result = AsyncResult(task_id, app=celery_app)

        return {
            "status": result.state,
            "result": result.result if result.ready() else None,
        }

    except Exception as e:
        logger.error(f"Error getting task status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get task status",
        )
