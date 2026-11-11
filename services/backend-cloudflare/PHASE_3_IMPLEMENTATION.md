# Phase 3: Optimizations & Testing Implementation Guide

## Overview
Phase 3 optimizes application performance, ensures production readiness, and validates code quality through comprehensive testing.

**Estimated Effort**: 2-3 weeks
**Success Metrics**: 70%+ code coverage, <100ms response times (p95), handle 1000+ concurrent users

---

## 1. Redis Caching Layer

### Strategy

**Cache Tiers:**
1. **Hot Data** (1-5 min TTL): User profiles, agent listings, property counts
2. **Warm Data** (5-30 min TTL): Property feeds, search results, chat history
3. **Cold Data** (1-24 hrs TTL): User statistics, system configs

### Implementation

#### File Structure:
```
app/
├── utils/
│   ├── cache.py          # NEW: Cache utilities
│   └── cache_keys.py     # NEW: Cache key generation
├── services/
│   ├── cache.py          # NEW: CacheService
│   └── ...
└── routers/
    ├── property.py       # UPDATED: Add cache logic
    ├── user.py           # UPDATED: Add cache logic
    └── chat.py           # UPDATED: Add cache logic
```

#### Create `app/utils/cache.py`:

```python
"""Cache utilities and decorators."""
from functools import wraps
from typing import Any, Callable, Optional, Coroutine
import json
from datetime import timedelta
import redis.asyncio as redis
from core.logger import get_logger

logger = get_logger(__name__)

# Cache TTL presets
CACHE_TTL = {
    "user_profile": timedelta(minutes=10),
    "property_feed": timedelta(minutes=5),
    "search_results": timedelta(minutes=5),
    "agent_listings": timedelta(minutes=5),
    "chat_history": timedelta(minutes=30),
    "system_config": timedelta(hours=24),
    "user_stats": timedelta(hours=1),
    "contract": timedelta(minutes=15),
}

async def get_cached(
    redis_client: redis.Redis,
    key: str,
    default: Any = None
) -> Optional[Any]:
    """Get value from cache."""
    try:
        value = await redis_client.get(key)
        if value:
            return json.loads(value)
    except Exception as e:
        logger.error(f"Cache get error: {e}", extra={"key": key})
    return default

async def set_cached(
    redis_client: redis.Redis,
    key: str,
    value: Any,
    ttl: timedelta = CACHE_TTL["property_feed"]
) -> bool:
    """Set value in cache with TTL."""
    try:
        await redis_client.setex(
            key,
            int(ttl.total_seconds()),
            json.dumps(value)
        )
        return True
    except Exception as e:
        logger.error(f"Cache set error: {e}", extra={"key": key})
    return False

async def delete_cached(
    redis_client: redis.Redis,
    key: str
) -> bool:
    """Delete cache entry."""
    try:
        await redis_client.delete(key)
        return True
    except Exception as e:
        logger.error(f"Cache delete error: {e}", extra={"key": key})
    return False

async def clear_pattern(
    redis_client: redis.Redis,
    pattern: str
) -> int:
    """Delete all keys matching pattern."""
    try:
        cursor = 0
        count = 0
        while True:
            cursor, keys = await redis_client.scan(cursor, match=pattern)
            if keys:
                deleted = await redis_client.delete(*keys)
                count += deleted
            if cursor == 0:
                break
        return count
    except Exception as e:
        logger.error(f"Cache pattern delete error: {e}", extra={"pattern": pattern})
    return 0
```

#### Create `app/utils/cache_keys.py`:

```python
"""Cache key generation."""

def user_profile_key(user_id: int) -> str:
    """User profile cache key."""
    return f"user:profile:{user_id}"

def user_listings_key(user_id: int, page: int = 1) -> str:
    """User property listings cache key."""
    return f"user:{user_id}:listings:p{page}"

def property_feed_key(page: int = 1, filters: str = "") -> str:
    """Property feed cache key."""
    return f"property:feed:p{page}:{filters}"

def property_detail_key(property_id: int) -> str:
    """Property detail cache key."""
    return f"property:detail:{property_id}"

def search_results_key(query: str, filters_hash: str) -> str:
    """Search results cache key."""
    return f"search:{query}:{filters_hash}"

def agent_profile_key(agent_id: int) -> str:
    """Agent profile cache key."""
    return f"agent:profile:{agent_id}"

def agent_stats_key(agent_id: int) -> str:
    """Agent statistics cache key."""
    return f"agent:stats:{agent_id}"

def contract_key(contract_id: int) -> str:
    """Contract cache key."""
    return f"contract:{contract_id}"

def chat_history_key(conversation_id: int, page: int = 1) -> str:
    """Chat history cache key."""
    return f"chat:{conversation_id}:p{page}"

def system_config_key(key: str) -> str:
    """System config cache key."""
    return f"config:{key}"

# Cache invalidation patterns
def invalidate_user_cache(user_id: int) -> list:
    """Keys to invalidate when user is updated."""
    return [
        f"user:profile:{user_id}",
        f"user:{user_id}:*",
    ]

def invalidate_property_cache(property_id: int) -> list:
    """Keys to invalidate when property is updated."""
    return [
        f"property:detail:{property_id}",
        f"property:feed:*",
        f"search:*",
    ]

def invalidate_listing_cache(agent_id: int) -> list:
    """Keys to invalidate when listing is updated."""
    return [
        f"agent:profile:{agent_id}",
        f"agent:{agent_id}:*",
        f"property:feed:*",
    ]
```

#### Create `app/services/cache.py`:

```python
"""Cache service."""
from typing import Any, Optional
from datetime import timedelta
import redis.asyncio as redis
from app.utils.cache import get_cached, set_cached, delete_cached, clear_pattern, CACHE_TTL
from app.utils.cache_keys import *
from core.logger import get_logger

logger = get_logger(__name__)

class CacheService:
    """Redis cache service."""
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
    
    async def get_user_profile(self, user_id: int) -> Optional[dict]:
        """Get cached user profile."""
        return await get_cached(self.redis, user_profile_key(user_id))
    
    async def set_user_profile(self, user_id: int, profile: dict) -> bool:
        """Cache user profile."""
        return await set_cached(
            self.redis,
            user_profile_key(user_id),
            profile,
            CACHE_TTL["user_profile"]
        )
    
    async def invalidate_user(self, user_id: int) -> int:
        """Invalidate all user caches."""
        count = 0
        for pattern in invalidate_user_cache(user_id):
            count += await clear_pattern(self.redis, pattern)
        return count
    
    async def get_property_feed(
        self,
        page: int = 1,
        filters: str = ""
    ) -> Optional[dict]:
        """Get cached property feed."""
        return await get_cached(self.redis, property_feed_key(page, filters))
    
    async def set_property_feed(
        self,
        page: int,
        filters: str,
        feed: dict
    ) -> bool:
        """Cache property feed."""
        return await set_cached(
            self.redis,
            property_feed_key(page, filters),
            feed,
            CACHE_TTL["property_feed"]
        )
    
    async def invalidate_properties(self) -> int:
        """Invalidate all property caches."""
        count = 0
        for pattern in [
            "property:detail:*",
            "property:feed:*",
            "search:*",
        ]:
            count += await clear_pattern(self.redis, pattern)
        return count
    
    async def get_search_results(
        self,
        query: str,
        filters_hash: str
    ) -> Optional[dict]:
        """Get cached search results."""
        return await get_cached(self.redis, search_results_key(query, filters_hash))
    
    async def set_search_results(
        self,
        query: str,
        filters_hash: str,
        results: dict
    ) -> bool:
        """Cache search results."""
        return await set_cached(
            self.redis,
            search_results_key(query, filters_hash),
            results,
            CACHE_TTL["search_results"]
        )
    
    async def health_check(self) -> bool:
        """Check Redis connection health."""
        try:
            await self.redis.ping()
            return True
        except Exception as e:
            logger.error(f"Redis health check failed: {e}")
            return False

async def get_cache_service() -> CacheService:
    """Get cache service singleton."""
    from core.database import get_redis
    redis_client = await get_redis()
    return CacheService(redis_client)
```

#### Update Property Router:

```python
# app/routers/listing.py (add caching)

from app.services.cache import get_cache_service
from app.utils.cache_keys import *
import hashlib

@app.get("/property/get-properties")
async def get_properties(
    page: int = 1,
    limit: int = 20,
    property_type: Optional[str] = None,
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    location: Optional[str] = None,
):
    """Get property feed with caching."""
    cache = await get_cache_service()
    
    # Generate cache key
    filters = f"t{property_type}_p{min_price}_{max_price}_l{location}"
    filters_hash = hashlib.md5(filters.encode()).hexdigest()
    
    # Try cache first
    cached = await cache.get_property_feed(page, filters_hash)
    if cached:
        logger.info("Property feed cache hit", extra={"filters": filters})
        return cached
    
    # Query database
    query = db.query(Property)
    
    if property_type:
        query = query.filter(Property.property_type == property_type)
    if min_price:
        query = query.filter(Property.price >= min_price)
    if max_price:
        query = query.filter(Property.price <= max_price)
    if location:
        query = query.filter(Property.location.ilike(f"%{location}%"))
    
    properties = query.offset((page - 1) * limit).limit(limit).all()
    total = query.count()
    
    # Cache result
    result = {
        "properties": [p.dict() for p in properties],
        "total": total,
        "page": page,
        "limit": limit,
    }
    await cache.set_property_feed(page, filters_hash, result)
    
    return result

@app.get("/property/{property_id}")
async def get_property(property_id: int):
    """Get property detail with caching."""
    cache = await get_cache_service()
    
    # Try cache
    cached = await cache.get_property_detail(property_id)
    if cached:
        return cached
    
    # Query database
    property_obj = db.query(Property).filter(Property.id == property_id).first()
    if not property_obj:
        raise PropertyNotFoundError(property_id=property_id)
    
    result = property_obj.dict()
    await cache.set_property_detail(property_id, result)
    
    return result

@app.post("/property/{property_id}")
async def update_property(property_id: int, data: PropertyUpdateSchema):
    """Update property and invalidate cache."""
    cache = await get_cache_service()
    
    property_obj = db.query(Property).filter(Property.id == property_id).first()
    if not property_obj:
        raise PropertyNotFoundError(property_id=property_id)
    
    # Update
    for key, value in data.dict().items():
        setattr(property_obj, key, value)
    
    db.commit()
    
    # Invalidate cache
    await cache.invalidate_properties()
    
    return property_obj.dict()
```

---

## 2. Health Checks & Monitoring

### Implementation

#### File Structure:
```
app/
├── routers/
│   └── health.py         # NEW: Health check endpoints
└── services/
    └── health.py         # NEW: HealthCheckService
```

#### Create `app/services/health.py`:

```python
"""Health check service."""
from datetime import datetime
from typing import Dict, Any
from enum import Enum

class HealthStatus(str, Enum):
    """Health status."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"

class HealthCheckService:
    """Health check service."""
    
    def __init__(self):
        self.check_registry: Dict[str, callable] = {}
    
    def register_check(self, name: str, check_func: callable):
        """Register health check function."""
        self.check_registry[name] = check_func
    
    async def run_checks(self) -> Dict[str, Any]:
        """Run all registered health checks."""
        results = {
            "timestamp": datetime.utcnow().isoformat(),
            "checks": {},
            "overall": HealthStatus.HEALTHY,
        }
        
        for name, check_func in self.check_registry.items():
            try:
                passed = await check_func()
                results["checks"][name] = {
                    "status": "ok" if passed else "failed",
                    "passed": passed,
                }
                if not passed:
                    results["overall"] = HealthStatus.DEGRADED
            except Exception as e:
                results["checks"][name] = {
                    "status": "error",
                    "passed": False,
                    "error": str(e),
                }
                results["overall"] = HealthStatus.UNHEALTHY
        
        return results
    
    async def live_check(self) -> bool:
        """Check if application is running."""
        return True
    
    async def ready_check(self) -> Dict[str, Any]:
        """Check if application is ready to accept traffic."""
        return await self.run_checks()

async def get_health_service() -> HealthCheckService:
    """Get health service singleton."""
    return HealthCheckService()
```

#### Create `app/routers/health.py`:

```python
from fastapi import APIRouter, HTTPException
from app.services.health import get_health_service, HealthStatus
from core.database import AsyncSessionLocal
from app.services.cache import get_cache_service
from app.services.search import get_search_service

router = APIRouter()

# Register checks on startup
health_service = None

@router.on_event("startup")
async def startup_health_checks():
    global health_service
    health_service = await get_health_service()
    
    # Database check
    async def check_database() -> bool:
        try:
            async with AsyncSessionLocal() as session:
                await session.execute("SELECT 1")
            return True
        except:
            return False
    
    # Redis check
    async def check_redis() -> bool:
        cache = await get_cache_service()
        return await cache.health_check()
    
    # Elasticsearch check
    async def check_elasticsearch() -> bool:
        search = await get_search_service()
        return await search.health_check()
    
    health_service.register_check("database", check_database)
    health_service.register_check("redis", check_redis)
    health_service.register_check("elasticsearch", check_elasticsearch)

@router.get("/health")
async def health():
    """Application health status."""
    return {
        "status": "ok",
        "service": "sheda-api",
    }

@router.get("/health/live")
async def liveness():
    """Kubernetes health probe: is app alive?"""
    return {"status": "alive"}

@router.get("/health/ready")
async def readiness():
    """Kubernetes health probe: is app ready?"""
    if not health_service:
        raise HTTPException(status_code=503, detail="Health checks not initialized")
    
    checks = await health_service.ready_check()
    
    if checks["overall"] == HealthStatus.UNHEALTHY:
        raise HTTPException(status_code=503, detail="Service unavailable")
    
    return checks

@router.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    return {
        "message": "Metrics endpoint would be provided by Prometheus client",
        "endpoint": "/metrics (set up via prometheus-client library)"
    }
```

#### Wire into main.py:

```python
from app.routers.health import router as health_router

app.include_router(health_router)
```

---

## 3. Unit & Integration Testing

### Setup

#### Create `tests/conftest.py`:

```python
"""Test fixtures and configuration."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from httpx import AsyncClient
import asyncio

from main import app
from core.models import Base
from core.database import get_db
from app.models import *

# Use in-memory SQLite for tests
DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)

@pytest.fixture(scope="session")
def event_loop():
    """Event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="function")
def db():
    """Database session."""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    yield session
    session.rollback()
    session.close()
    Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def override_get_db(db):
    def _override():
        yield db
    app.dependency_overrides[get_db] = _override
    yield
    app.dependency_overrides.clear()

@pytest.fixture(scope="function")
def client(override_get_db):
    """Test client."""
    return TestClient(app)

@pytest.fixture(scope="function")
async def async_client(override_get_db):
    """Async test client."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client
```

#### Create `tests/unit/test_validators.py`:

```python
"""Test validators."""
import pytest
from app.utils.validators import ValidatorMixin, PropertyValidators, TransactionValidators

class TestValidators:
    """Test validator functions."""
    
    def test_validate_price_valid(self):
        """Test valid price validation."""
        result = PropertyValidators.validate_price(100.50)
        assert result == 100.50
    
    def test_validate_price_too_high(self):
        """Test price exceeds max value."""
        with pytest.raises(ValueError):
            PropertyValidators.validate_price(2**128)  # Exceeds max
    
    def test_validate_ethereum_address_valid(self):
        """Test valid Ethereum address."""
        address = "0x742d35Cc6634C0532925a3b844Bc9e7595f73f2B"
        result = ValidatorMixin.validate_ethereum_address(address)
        assert result == address
    
    def test_validate_ethereum_address_invalid(self):
        """Test invalid Ethereum address."""
        with pytest.raises(ValueError):
            ValidatorMixin.validate_ethereum_address("not_an_address")
    
    def test_validate_blockchain_hash_valid(self):
        """Test valid blockchain hash."""
        hash_val = "0x" + "a" * 64
        result = ValidatorMixin.validate_blockchain_hash(hash_val)
        assert result == hash_val
    
    def test_validate_bedroom_count_valid(self):
        """Test valid bedroom count."""
        result = ValidatorMixin.validate_bedroom_count(3)
        assert result == 3
    
    def test_validate_bedroom_count_invalid(self):
        """Test invalid bedroom count."""
        with pytest.raises(ValueError):
            ValidatorMixin.validate_bedroom_count(0)  # Too low

class TestPropertyValidators:
    """Test property-specific validators."""
    
    def test_validate_title_valid(self):
        """Test valid title."""
        result = PropertyValidators.validate_title("Beautiful 3BR Apartment")
        assert result == "Beautiful 3BR Apartment"
    
    def test_validate_title_too_short(self):
        """Test title too short."""
        with pytest.raises(ValueError):
            PropertyValidators.validate_title("Bad")
    
    def test_validate_description_valid(self):
        """Test valid description."""
        desc = "A" * 100
        result = PropertyValidators.validate_description(desc)
        assert result == desc
    
    def test_validate_description_too_short(self):
        """Test description too short."""
        with pytest.raises(ValueError):
            PropertyValidators.validate_description("Too short")
```

#### Create `tests/integration/test_auth.py`:

```python
"""Test authentication endpoints."""
import pytest

def test_login_valid(client):
    """Test valid login."""
    response = client.post("/auth/login", json={
        "email": "user@example.com",
        "password": "password123"
    })
    assert response.status_code == 200
    assert "access_token" in response.json()

def test_login_invalid_password(client):
    """Test login with invalid password."""
    response = client.post("/auth/login", json={
        "email": "user@example.com",
        "password": "wrongpassword"
    })
    assert response.status_code == 401

def test_login_rate_limited(client):
    """Test login rate limiting."""
    # Make 6 requests (limit is 5/minute)
    for i in range(6):
        response = client.post("/auth/login", json={
            "email": "user@example.com",
            "password": "wrong"
        })
    
    # 6th request should be rate limited
    assert response.status_code == 429
```

#### Create `tests/integration/test_properties.py`:

```python
"""Test property endpoints."""
import pytest

def test_get_properties(client, db):
    """Test getting properties."""
    response = client.get("/property/get-properties")
    assert response.status_code == 200
    assert "properties" in response.json()

def test_create_property(client, db):
    """Test creating property."""
    response = client.post("/property/create", json={
        "title": "Beautiful Apartment",
        "description": "A great place to live with modern amenities",
        "price": 5000000,
        "location": "Lagos",
        "bedroom": 3,
        "bathroom": 2,
        "property_type": "apartment"
    })
    assert response.status_code == 201
    assert response.json()["title"] == "Beautiful Apartment"

def test_search_properties(client, db):
    """Test searching properties."""
    response = client.get("/property/search?query=apartment&min_price=1000000")
    assert response.status_code == 200
    assert "results" in response.json()
```

#### Run Tests:

```bash
# Install pytest
pip install pytest pytest-asyncio pytest-cov

# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=app --cov-report=html

# Run specific test file
pytest tests/unit/test_validators.py -v

# Run specific test
pytest tests/integration/test_auth.py::test_login_valid -v
```

---

## 4. Load Testing with Locust

### Setup

#### Install Locust:
```bash
pip install locust==2.20.0
```

#### Create `tests/load/locustfile.py`:

```python
"""Load testing scenarios."""
from locust import HttpUser, task, between
import json
import random

class PropertyListingUser(HttpUser):
    """User browsing properties."""
    wait_time = between(1, 3)
    
    @task(3)
    def get_properties(self):
        """Browse property listings."""
        page = random.randint(1, 10)
        self.client.get(f"/property/get-properties?page={page}")
    
    @task(1)
    def search_properties(self):
        """Search for properties."""
        self.client.get("/property/search?query=apartment&min_price=1000000&max_price=5000000")
    
    @task(2)
    def view_property(self):
        """View property details."""
        property_id = random.randint(1, 100)
        self.client.get(f"/property/{property_id}")

class BiddingUser(HttpUser):
    """User placing bids."""
    wait_time = between(2, 5)
    
    @task(1)
    def place_bid(self):
        """Place a bid on property."""
        self.client.post("/transaction/place-bid", json={
            "property_id": random.randint(1, 100),
            "bid_amount": random.randint(1000000, 10000000)
        })
    
    @task(1)
    def confirm_payment(self):
        """Confirm payment."""
        self.client.post("/transaction/confirm-payment", json={
            "contract_id": random.randint(1, 50),
            "transaction_hash": "0x" + "a" * 64
        })

class ChatUser(HttpUser):
    """User sending messages."""
    wait_time = between(1, 2)
    
    @task(2)
    def send_message(self):
        """Send chat message."""
        self.client.post("/chat/send", json={
            "conversation_id": random.randint(1, 50),
            "message": "Hello! Are you interested in this property?"
        })
    
    @task(1)
    def get_messages(self):
        """Get chat history."""
        conversation_id = random.randint(1, 50)
        self.client.get(f"/chat/{conversation_id}/messages")
```

#### Run Load Test:

```bash
# Web UI
locust -f tests/load/locustfile.py --host=http://localhost:8000

# Headless mode
locust -f tests/load/locustfile.py --host=http://localhost:8000 \
  --users 100 --spawn-rate 10 --run-time 10m --csv=results

# Plot results
# Use the locust web UI at http://localhost:8089
```

---

## Monitoring & Observability

### Add Prometheus Metrics:

```bash
pip install prometheus-client==0.19.0
```

```python
# main.py additions
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from fastapi.responses import Response
import time

# Metrics
request_count = Counter(
    'sheda_requests_total',
    'Total requests',
    ['method', 'endpoint', 'status']
)

request_duration = Histogram(
    'sheda_request_duration_seconds',
    'Request duration',
    ['method', 'endpoint']
)

@app.middleware("http")
async def metrics_middleware(request, call_next):
    """Add metrics collection."""
    start_time = time.time()
    response = await call_next(request)
    
    duration = time.time() - start_time
    
    request_count.labels(
        method=request.method,
        endpoint=request.url.path,
        status=response.status_code
    ).inc()
    
    request_duration.labels(
        method=request.method,
        endpoint=request.url.path
    ).observe(duration)
    
    return response

@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
```

---

## Success Metrics

| Metric | Target | Validation |
|--------|--------|------------|
| Code Coverage | 70%+ | `pytest --cov` |
| Response Time (p95) | <100ms | Locust load test |
| Error Rate | <0.1% | Production monitoring |
| Cache Hit Rate | >60% | Redis metrics |
| Concurrent Users | 1000+ | Locust simulation |

---

## Summary

Phase 3 provides:

✅ **Performance Optimization**
- Redis caching for frequently accessed data
- Intelligent TTL strategies
- Cache invalidation patterns

✅ **Production Readiness**
- Comprehensive health checks
- Kubernetes liveness/readiness probes
- Prometheus metrics integration

✅ **Code Quality**
- Unit tests for validators and utilities
- Integration tests for endpoints
- 70%+ test coverage

✅ **Scalability Validation**
- Load testing with realistic scenarios
- Performance bottleneck identification
- Capacity planning data
