import sys

sys.path.append("..")
from app.models.user import Agent, Client
from core.database import AsyncSessionLocal
from sqlalchemy.ext.asyncio import AsyncSession
from core.configs import settings
import asyncio


async def test_create_suer(db: AsyncSession):
    new_user_1 = Agent(
        username="Admin",
        email="penivera655@gmail.com",
        password=settings.pwd_context.hash("admin"),
        near_account_id="admin_agent.testnet",
    )
    db.add(new_user_1)
    await db.commit()
    await db.refresh(new_user_1)
    new_user = Client(
        username="Admin",
        email="penivera655@gmail.com",
        password=settings.pwd_context.hash("admin"),
        near_account_id="admin_client.testnet",
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return (new_user_1, new_user)


async def main():
    async with AsyncSessionLocal() as db:
        user = await test_create_suer(db)
        if user:
            print(f"Succesfully created {user[0].id} and {user[1].id}")


if __name__ == "__main__":
    asyncio.run(main())
