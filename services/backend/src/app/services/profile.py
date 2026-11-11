import os
import aiofiles
from pathlib import Path
from core.configs import settings
from fastapi import UploadFile, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.user_schema import (
    BaseUserSchema,
    UserUpdate,
    UserInDB,
    FileDir,
    RatingShow,
    AccountInfoBase,
)
from app.models.user import Agent
from app.models.property import AccountInfo
from sqlalchemy.future import select
from sqlalchemy.engine import Result
from sqlalchemy.exc import IntegrityError
from core.logger import logger
import datetime

timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S")



async def update_pfp(user: BaseUserSchema, db: AsyncSession, file_path: str):
    user.avatar_url = file_path
    db.add(user)
    await db.commit()
    await db.refresh(user)


async def update_user(update_data: UserUpdate, db: AsyncSession, user: UserInDB):
    for key, value in update_data.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    try:
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user
    except IntegrityError as e:
        logger.error(str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not update user,refresh token or switch to appropriate account type",
        )


async def updated_rating(agent_id: int, update_rating: int, db: AsyncSession):
    query = select(Agent).where(Agent.id == agent_id)
    result: Result = await db.execute(query)
    agent: Agent = result.scalar_one_or_none()  # type: ignore
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    agent.rating += update_rating
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return RatingShow(rating=agent.rating)


async def create_new_payment_info(
    data: AccountInfoBase, db: AsyncSession, user: UserInDB
):
    account_info = AccountInfo(
        **data.model_dump(exclude_unset=True, exclude_none=True),
        user_id=user.id,
    )
    db.add(account_info)
    await db.commit()
    await db.refresh(account_info)
    return account_info


async def get_account_info(db: AsyncSession, user_id: None):
    query = select(AccountInfo).where(AccountInfo.user_id == user_id)
    result: Result = await db.execute(query)
    account_info = result.scalars().all()
    return account_info or []


async def update_account_info(
    update_data: AccountInfoBase,
    db: AsyncSession,
    current_user: UserInDB,
    account_info_id: int,
):
    account_info = next(
        (
            account_info
            for account_info in current_user.account_info  # type: ignore
            if account_info.id == account_info_id
        ),
        None,
    )  # type: ignore
    if not account_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account info not found or not owned by you",
        )
    for key, value in update_data.model_dump(exclude_unset=True):
        setattr(account_info, key, value)

    db.add(account_info)
    await db.commit()
    await db.refresh(account_info)
    return account_info


async def run_account_info_deletion(
    current_user: UserInDB, db: AsyncSession, account_info_id: int
):
    account_info = next(
        (
            account_info
            for account_info in current_user.account_info # type: ignore
            if account_info.id == account_info_id
        ),
        None,
    )  # type: ignore
    if not account_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account info not found or not owned by you",
        )
    await db.delete(account_info)
    await db.commit()
    await db.refresh(account_info)
    return {"detail": "Account Info Deleted Succesfully"}
