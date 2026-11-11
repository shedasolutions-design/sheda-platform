"""
Transaction tasks for Celery.
Handles asynchronous transaction processing and blockchain sync.
"""

from typing import Optional, Dict, Any
from datetime import datetime, timedelta

from core.celery_config import app
from core.logger import get_logger

logger = get_logger(__name__)


@app.task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 300},
    time_limit=600,
)
def check_payment_timeouts(self):
    """
    Check for payment timeouts and mark contracts accordingly.
    Scheduled every 5 minutes.
    """
    import asyncio
    
    async def _run():
        from core.database import AsyncSessionLocal
        from app.models.property import Contract
        from sqlalchemy import select, and_
        from datetime import datetime, timedelta

        async with AsyncSessionLocal() as session:
            # Find unconfirmed contracts older than 7 days
            timeout_threshold = datetime.utcnow() - timedelta(days=7)

            query = select(Contract).where(
                and_(
                    Contract.is_active == False,
                    Contract.created_at <= timeout_threshold,
                )
            )

            result = await session.execute(query)
            timed_out_contracts = result.scalars().all()

            logger.info(
                f"Found {len(timed_out_contracts)} timed out contracts",
                task_id=self.request.id,
            )

            return len(timed_out_contracts)

    try:
        count = asyncio.run(_run())
        return {"status": "success", "contracts_checked": count}
    except Exception as e:
        logger.error(
            f"Failed to check payment timeouts: {str(e)}", task_id=self.request.id
        )
        raise


@app.task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 300},
    time_limit=600,
)
def expire_contracts(self):
    """
    Check for expired contracts and deactivate them.
    Scheduled daily.
    """
    import asyncio
    
    async def _run():
        from core.database import AsyncSessionLocal
        from app.models.property import Contract, Property
        from app.utils.enums import PropertyStatEnum
        from sqlalchemy import select
        from datetime import datetime, timezone

        async with AsyncSessionLocal() as db:
            now = datetime.now(timezone.utc)

            # Fetch expired contracts
            stmt = select(Contract).where(
                Contract.end_date <= now,
                Contract.is_active == True,
            )
            result = await db.execute(stmt)
            expired_contracts = result.scalars().all()

            for contract in expired_contracts:
                contract.is_active = False

                # Reset property status
                stmt = select(Property).where(Property.id == contract.property_id)
                property_result = await db.execute(stmt)
                property_obj = property_result.scalar_one_or_none()

                if property_obj:
                    property_obj.status = PropertyStatEnum.available

            await db.commit()
            logger.info(f"Deactivated {len(expired_contracts)} expired contracts and reset property statuses.")
            return len(expired_contracts)

    try:
        count = asyncio.run(_run())
        return {"status": "success", "contracts_expired": count}
    except Exception as e:
        logger.error(
            f"Failed to check and deactivate expired contracts: {str(e)}",
            task_id=self.request.id,
        )
        raise


@app.task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 300},
    time_limit=600,
)
def sync_blockchain_events(self):
    """
    Sync blockchain events and update contract statuses.
    Scheduled every 10 minutes.
    """
    try:
        logger.info(
            f"Syncing blockchain events",
            task_id=self.request.id,
        )

        # In production, connect to node and sync events
        # For now just log placeholder

        return {"status": "success", "events_synced": 0}

    except Exception as e:
        logger.error(
            f"Failed to sync blockchain events: {str(e)}", task_id=self.request.id
        )
        raise


@app.task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 2, "countdown": 600},
    time_limit=300,
)
def process_payment_confirmation(
    self,
    contract_id: int,
    payment_data: Dict[str, Any],
):
    """
    Process payment confirmation asynchronously.

    Args:
        contract_id: Contract ID
        payment_data: Payment confirmation data
    """
    try:
        logger.info(
            f"Processing payment confirmation",
            task_id=self.request.id,
            contract_id=contract_id,
        )

        # In production, process payment with blockchain
        # Update contract status
        # Send notifications

        return {"status": "success", "contract_id": contract_id}

    except Exception as e:
        logger.error(f"Failed to process payment: {str(e)}", task_id=self.request.id)
        raise


@app.task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3, "countdown": 120},
    time_limit=300,
)
def mint_property_nft(
    self,
    property_id: int,
    owner_address: str,
):
    """
    Mint property NFT on blockchain.

    Args:
        property_id: Property ID
        owner_address: Owner's blockchain address
    """
    try:
        logger.info(
            f"Minting property NFT",
            task_id=self.request.id,
            property_id=property_id,
            owner=owner_address,
        )

        # In production, mint NFT and store transaction hash
        # Update property model with NFT details

        return {"status": "success", "property_id": property_id, "tx_hash": "0x..."}

    except Exception as e:
        logger.error(f"Failed to mint NFT: {str(e)}", task_id=self.request.id)
        raise
