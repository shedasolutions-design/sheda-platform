# Sheda Backend Implementation Roadmap

## Overview
Comprehensive backend enhancement plan across three phases focusing on real-time capabilities, security, and data synchronization for on-chain event support.

---

## Phase 1: Core Adjustments (Security & Reliability)
**Goal**: Strengthen security, reliability, and data integrity

### 1.1 Enhanced Input Validation (Pydantic)
- **Status**: In Progress
- **Description**: Implement strict Pydantic v2 validation for all models
- **Tasks**:
  - [ ] Add custom validators for PropertyBase (20 fields)
  - [ ] Validate `price` field as U128-compatible (max 2^128 - 1)
  - [ ] Add validators for numeric ranges (bedrooms, bathrooms > 0)
  - [ ] Implement field-level constraints (string lengths, formats)
  - [ ] Add validation for blockchain addresses
  - [ ] Create reusable validator utilities
- **Files**: 
  - `app/schemas/property_schema.py`
  - `app/schemas/user_schema.py`
  - `app/schemas/transaction_schema.py`
  - `app/utils/validators.py` (new)

### 1.2 Rate Limiting & Security Middleware
- **Status**: Not Started
- **Description**: Integrate SlowAPI for endpoint protection
- **Tasks**:
  - [ ] Install SlowAPI dependency
  - [ ] Configure rate limiting (5/min for /auth/login)
  - [ ] Add rate limits to sensitive endpoints
  - [ ] Implement custom rate limit headers
  - [ ] Add WhiteList/BlackList functionality
- **Files**:
  - `core/middleware/rate_limit.py` (new)
  - `main.py` (update)

### 1.3 Error Handling Improvements
- **Status**: Not Started
- **Description**: Standardize error responses with custom exception handling
- **Tasks**:
  - [ ] Create custom exception classes
  - [ ] Implement global exception handlers
  - [ ] Add Structlog for structured logging
  - [ ] Configure log output (JSON format for prod)
  - [ ] Create error response schemas
- **Files**:
  - `core/exceptions.py` (new)
  - `core/middleware/error.py` (enhance)
  - `core/logger.py` (enhance)

### 1.4 Idempotency for Payments
- **Status**: Not Started
- **Description**: Prevent duplicate transactions via unique keys
- **Tasks**:
  - [ ] Add `idempotency_key` column to Contract table
  - [ ] Add `idempotency_key` column to PaymentConfirmation table
  - [ ] Create migration for new columns
  - [ ] Implement idempotency check in payment endpoints
  - [ ] Add idempotency key validation
- **Files**:
  - `alembic/versions/` (new migration)
  - `app/models/property.py` (update)
  - `app/routers/transactions.py` (update)

---

## Phase 2: Additions for Features/Integrations
**Goal**: Enable real-time capabilities and advanced features

### 2.1 Real-time WebSockets
- **Status**: Not Started
- **Description**: Live updates for notifications and chat
- **Tasks**:
  - [ ] Create `/ws/notifications` endpoint
  - [ ] Create `/ws/chat` endpoint
  - [ ] Implement connection management (Redis pub/sub)
  - [ ] Add message broadcasting
  - [ ] Implement automatic reconnection handling
  - [ ] Replace polling with real-time updates
- **Files**:
  - `app/routers/websocket.py` (enhance)
  - `app/services/websocket_service.py` (new)
  - `app/utils/ws_manager.py` (new)

### 2.2 Push Notifications
- **Status**: Not Started
- **Description**: FCM/APNs integration for push notifications
- **Tasks**:
  - [ ] Create `/notifications/register-device` endpoint
  - [ ] Store device tokens securely
  - [ ] Implement FCM integration
  - [ ] Add notification service
  - [ ] Trigger on transaction events
  - [ ] Add notification templates
- **Files**:
  - `app/routers/notifications.py` (enhance)
  - `app/services/push.py` (enhance)
  - `app/models/notification.py` (new)
  - `app/schemas/notification_schema.py` (update)

### 2.3 KYC Integration
- **Status**: Not Started
- **Description**: User identity verification via Persona API
- **Tasks**:
  - [ ] Create `/user/kyc` endpoint
  - [ ] Integrate Persona API
  - [ ] Add KYC status tracking
  - [ ] Store verification documents
  - [ ] Update UserShow model
  - [ ] Add KYC hooks to user model
- **Files**:
  - `app/routers/user.py` (update)
  - `app/services/kyc.py` (new)
  - `app/models/user.py` (update)
  - `app/schemas/user_schema.py` (update)

### 2.4 Search Enhancements
- **Status**: Not Started
- **Description**: Elasticsearch integration for advanced filtering
- **Tasks**:
  - [ ] Set up Elasticsearch instance
  - [ ] Create property indexing service
  - [ ] Implement fuzzy search on title/location
  - [ ] Add price range filters
  - [ ] Add property type filters
  - [ ] Add location-based filters
  - [ ] Implement faceted search
- **Files**:
  - `app/services/search.py` (new)
  - `app/routers/listing.py` (update)
  - `app/schemas/search_schema.py` (new)

### 2.5 Background Tasks with Celery
- **Status**: Not Started
- **Description**: Async task processing (emails, SMS, notifications)
- **Tasks**:
  - [ ] Set up Celery with Redis broker
  - [ ] Create email task
  - [ ] Create SMS task
  - [ ] Create notification task
  - [ ] Create contract approval task
  - [ ] Add task scheduling
  - [ ] Implement retry logic
  - [ ] Add dead letter queue
- **Files**:
  - `app/tasks/` (new folder)
  - `app/tasks/email.py`
  - `app/tasks/notifications.py`
  - `app/tasks/transactions.py`
  - `core/celery_config.py` (new)

---

## Phase 3: Optimizations & Testing
**Goal**: Performance, reliability, and code quality

### 3.1 Redis Caching
- **Status**: Not Started
- **Description**: Cache frequent queries with TTL invalidation
- **Tasks**:
  - [ ] Implement cache keys strategy
  - [ ] Cache property feeds (5 min TTL)
  - [ ] Cache user profiles (10 min TTL)
  - [ ] Cache agent listings (5 min TTL)
  - [ ] Implement cache invalidation on updates
  - [ ] Add cache warmup on startup
  - [ ] Create cache utility functions
- **Files**:
  - `app/utils/cache.py` (new)
  - `app/services/listing.py` (update)
  - `app/services/user_service.py` (update)

### 3.2 Health Checks & Monitoring
- **Status**: Not Started
- **Description**: System health and dependency monitoring
- **Tasks**:
  - [ ] Create `/health` endpoint
  - [ ] Create `/health/ready` (readiness probe)
  - [ ] Create `/health/live` (liveness probe)
  - [ ] Check database connectivity
  - [ ] Check Redis connectivity
  - [ ] Check Elasticsearch connectivity (if used)
  - [ ] Add metrics endpoint for Prometheus
- **Files**:
  - `app/routers/health.py` (new)
  - `app/services/health.py` (new)

### 3.3 Testing Suite
- **Status**: Not Started
- **Description**: Comprehensive unit and integration tests
- **Tasks**:
  - [ ] Write unit tests for models
  - [ ] Write unit tests for schemas
  - [ ] Write unit tests for services
  - [ ] Write integration tests with TestClient
  - [ ] Write WebSocket tests
  - [ ] Write Celery task tests
  - [ ] Achieve 70%+ code coverage
  - [ ] Set up pytest configuration
- **Files**:
  - `tests/` (organize & enhance)
  - `tests/conftest.py` (enhanced)
  - `tests/unit/` (new)
  - `tests/integration/` (new)
  - `pytest.ini` (new)

### 3.4 Load Testing
- **Status**: Not Started
- **Description**: Performance testing with Locust
- **Tasks**:
  - [ ] Create Locust load test files
  - [ ] Test property listing endpoint (100 concurrent users)
  - [ ] Test WebSocket connections
  - [ ] Test payment endpoint
  - [ ] Generate performance reports
  - [ ] Identify bottlenecks
  - [ ] Document results
- **Files**:
  - `tests/load/` (new folder)
  - `tests/load/locustfile.py`
  - `tests/load/scenarios.py`

---

## Dependencies to Install

### Phase 1
```
slowapi==0.1.9
structlog==24.1.0
python-multipart==0.0.6
```

### Phase 2
```
firebase-admin==6.2.0
python-socketio==5.10.0
elasticsearch==8.11.0
celery==5.3.4
persona-sdk==1.0.0 (or similar KYC provider)
```

### Phase 3
```
locust==2.19.0
pytest-asyncio==0.23.0
httpx==0.25.0
prometheus-client==0.19.0
```

---

## Implementation Order

1. **Week 1**: Phase 1 (core security)
   - Input validation
   - Rate limiting
   - Error handling
   - Idempotency

2. **Week 2-3**: Phase 2 (features)
   - WebSockets
   - Push notifications
   - KYC
   - Search

3. **Week 3-4**: Phase 2 (continued)
   - Celery/background tasks

4. **Week 4-5**: Phase 3 (optimization)
   - Caching
   - Health checks
   - Testing
   - Load testing

---

## Success Metrics

- [ ] All endpoints have rate limiting
- [ ] 100% input validation coverage
- [ ] Zero duplicate transactions
- [ ] <100ms WebSocket message latency
- [ ] 70%+ test coverage
- [ ] <200ms P95 response time
- [ ] 99.9% uptime
- [ ] All KYC integrations working
- [ ] Real-time notifications functional

---

## Notes

- All changes maintain backward compatibility
- Code follows PEP 8 style guide
- Documentation updated for each phase
- All new features have tests
- Performance monitored continuously
