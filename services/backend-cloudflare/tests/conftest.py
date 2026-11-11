"""Test fixtures and configuration."""

import pytest
import asyncio
from typing import AsyncGenerator, Generator
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport

from main import app
from core.database import Base, get_db, AsyncSessionLocal
from app.models.user import BaseUser as User, Client
from app.models.property import Property
from app.utils.enums import AccountTypeEnum

# Use in-memory SQLite for tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

# Create async engine for tests
test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestingSessionLocal = async_sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
async def db() -> AsyncGenerator[AsyncSession, None]:
    """Create database session for tests."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with TestingSessionLocal() as session:
        yield session
        await session.rollback()

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture(scope="function")
def override_get_db(db: AsyncSession):
    """Override database dependency."""

    async def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    yield
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def client(override_get_db) -> TestClient:
    """Synchronous test client."""
    return TestClient(app)


@pytest.fixture(scope="function")
async def async_client(override_get_db) -> AsyncGenerator[AsyncClient, None]:
    """Async test client."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client


@pytest.fixture(scope="function")
async def test_user(db: AsyncSession) -> User:
    """Create test user."""
    user = Client(
        email="test@example.com",
        fullname="Test User",
        username="test_user",
        password="hashed_password_here",
        verified=True,
        account_type=AccountTypeEnum.client,
        near_account_id="test_user.testnet",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture(scope="function")
async def test_property(db: AsyncSession, test_user: User) -> Property:
    """Create test property."""
    property_obj = Property(
        title="Beautiful Test Apartment",
        description="A wonderful place to live with modern amenities and great location",
        price=5000000,
        location="Lagos",
        bedroom=3,
        bathroom=2,
        property_type="apartment",
        listing_type="sale",
        agent_id=test_user.id,
    )
    db.add(property_obj)
    await db.commit()
    await db.refresh(property_obj)
    return property_obj


@pytest.fixture(scope="function")
def auth_headers(test_user: User) -> dict:
    """Create authentication headers for test user."""
    # In production, generate real JWT token
    # For tests, we can mock the auth
    return {"Authorization": "Bearer test_token"}
