# Sheda Backend - Implementation & Deployment Guide

**Version**: 2.0  
**Last Updated**: Feb 18, 2025  
**Status**: Phase 2 Complete, Phase 3 Ready for Implementation  

---

## Quick Start

### Prerequisites
```bash
Python 3.8+
Redis 6.0+
PostgreSQL 12+
Elasticsearch 8.0+ (optional, for search)
```

### Installation

```bash
# 1. Clone repository
git clone https://github.com/yourusername/sheda.git
cd Sheda-backend

# 2. Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate  # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Set up environment
cp .env.example .env
# Edit .env with your configuration

# 5. Database setup
alembic upgrade head

# 6. Run application
uvicorn main:app --reload

# 7. In separate terminal, start Celery worker
celery -A core.celery_config worker --loglevel=info

# 8. In another terminal, start Beat scheduler
celery -A core.celery_config beat --loglevel=info
```

### Test the Setup
```bash
# Health check
curl http://localhost:8000/health

# Readiness probe
curl http://localhost:8000/health/ready
```

---

## Project Structure

```
Sheda-backend/
│
├── main.py                              # FastAPI application entry point
├── requirements.txt                     # Python dependencies
│
├── app/                                 # Application code
│   ├── models/                          # SQLAlchemy models
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── property.py                  # ✅ Updated with idempotency
│   │   ├── chat.py
│   │   ├── transaction.py
│   │   └── rating.py
│   │
│   ├── schemas/                         # Pydantic request/response schemas
│   │   ├── __init__.py
│   │   ├── auth_schema.py
│   │   ├── user_schema.py
│   │   ├── property_schema.py           # ✅ Updated with validators
│   │   ├── transaction_schema.py        # ✅ Updated with idempotency
│   │   ├── chat.py
│   │   └── ...
│   │
│   ├── services/                        # Business logic
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── user_service.py
│   │   ├── listing.py
│   │   ├── idempotency.py              # ✅ NEW: Duplicate prevention
│   │   ├── websocket_manager.py        # ✅ NEW: Real-time WebSockets
│   │   ├── push_notifications.py       # ✅ NEW: FCM/APNs push
│   │   ├── kyc.py                      # ✅ NEW: KYC integration
│   │   ├── search.py                   # ✅ NEW: Elasticsearch search
│   │   └── cache.py                    # 🔄 PHASE 3: Caching
│   │
│   ├── routers/                         # API endpoints
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── user.py
│   │   ├── listing.py
│   │   ├── chat.py
│   │   ├── transactions.py
│   │   ├── media.py
│   │   ├── notifications.py
│   │   ├── websocket.py                # ⚠️ NEEDS: Update with WebSocket endpoints
│   │   └── health.py                   # 🔄 PHASE 3: NEW
│   │
│   ├── tasks/                           # Celery background tasks
│   │   ├── __init__.py                 # ✅ NEW: Module marker
│   │   ├── email.py                    # ✅ NEW: Email sending (5 tasks)
│   │   ├── notifications.py            # ✅ NEW: Push notifications (5 tasks)
│   │   ├── transactions.py             # ✅ NEW: Payment processing (4 tasks)
│   │   └── documents.py                # ✅ NEW: Document processing (5 tasks)
│   │
│   └── utils/                           # Utility functions
│       ├── __init__.py
│       ├── validators.py               # ✅ NEW: Input validation (15+ validators)
│       ├── cache.py                    # 🔄 PHASE 3: Cache utilities
│       └── cache_keys.py               # 🔄 PHASE 3: Cache key generation
│
├── core/                                # Core configuration
│   ├── __init__.py
│   ├── configs.py                       # Environment & settings
│   ├── database.py                      # Database setup
│   ├── logger.py                        # ✅ ENHANCED: Structured logging
│   ├── celery_config.py                # ✅ NEW: Celery setup
│   │
│   ├── middleware/
│   │   ├── __init__.py
│   │   ├── error.py                    # ✅ ENHANCED: Error handling (350+ lines)
│   │   └── rate_limit.py               # ✅ NEW: Rate limiting (200+ lines)
│   │
│   └── starter.py                       # Application startup
│
├── alembic/                             # Database migrations
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
│       ├── 5d7020e67ef6_initial_migration.py
│       ├── ...
│       └── 2025021801_add_idempotency_keys.py  # ✅ NEW: Idempotency
│
├── tests/                               # Testing (Phase 3)
│   ├── conftest.py                     # 🔄 NEW: Test fixtures
│   ├── unit/
│   │   └── test_validators.py          # 🔄 NEW: Validator tests
│   └── integration/
│       ├── test_auth.py                # 🔄 NEW: Auth endpoint tests
│       └── test_properties.py          # 🔄 NEW: Property endpoint tests
│
├── README.md                            # This file
├── IMPLEMENTATION_SUMMARY.md            # ✅ Complete overview & timeline
├── PHASE_1_IMPLEMENTATION.md            # ✅ Security & validation guide
├── PHASE_2_IMPLEMENTATION.md            # ✅ Features & integrations guide
├── PHASE_3_IMPLEMENTATION.md            # 🔄 Optimizations & testing guide
│
└── .env.example                         # Environment template
```

---

## Implementation Status

### Phase 1: Security & Reliability ✅ COMPLETE

**14 files created/updated | 3,000+ lines**

#### Features:
- ✅ **Input Validation** (`app/utils/validators.py`)
  - 15+ reusable validators
  - Ethereum address validation (blockchain)
  - U128 price validation (crypto)
  - Pydantic v2 field validators

- ✅ **Rate Limiting** (`core/middleware/rate_limit.py`)
  - 15+ endpoint configurations
  - Auth: 5 requests/minute
  - Payments: 5 requests/minute
  - Chat: 60 requests/minute
  - IP whitelisting/blacklisting

- ✅ **Error Handling** (`core/exceptions.py` + `core/middleware/error.py`)
  - 30+ custom exception classes
  - Structured JSON error responses
  - Request ID tracing
  - Detailed error logging

- ✅ **Idempotency** (`app/services/idempotency.py`)
  - Duplicate payment prevention
  - Redis + local cache fallback
  - 24-hour TTL default
  - Data mismatch detection

- ✅ **Structured Logging** (`core/logger.py`)
  - Dual formatters: Colored (dev) + JSON (prod)
  - Rotating file handlers
  - Structlog integration

#### Required `.env` Settings:
```env
# Rate limiting
RATE_LIMIT_ENABLED=true

# Logging
LOG_LEVEL=INFO
LOG_FORMAT=json  # or "colored"

# Redis (for idempotency)
REDIS_URL=redis://localhost:6379/0
```

#### Validation:
```bash
# Test rate limiting
for i in {1..6}; do curl http://localhost:8000/auth/login; done
# 6th request returns 429 Too Many Requests

# Test error handling
curl -X POST http://localhost:8000/property/create -H "Content-Type: application/json" -d '{"title": "Bad"}'
# Returns structured error with error_id

# Check logs
tail -f logs/app.log
```

---

### Phase 2: Features & Integrations ✅ COMPLETE

**10 files created | 2,500+ lines | Ready for Endpoint Integration**

#### Features:

**1. Real-time WebSockets** (`app/services/websocket_manager.py`)
```python
# Broadcast messages
await manager.send_personal_message(msg, user_id=123)
await manager.send_room_message(msg, room_id="chat_456")
await manager.broadcast_message(msg)

# Connection metadata
{"user_id": 123, "room_id": "chat_456", "connection_id": "uuid", "connected_at": "2025-02-18..."}
```
**Status**: ⚠️ Needs endpoint integration in `app/routers/websocket.py`

**2. Push Notifications** (`app/services/push_notifications.py`)
```python
# Register device
await service.register_device_token(user_id=123, device_token="...", device_type="mobile")

# 7 templates: bid_placed, bid_accepted, payment_received, contract_signed, message_received, appointment_reminder, kyc_approved
title, body = NotificationTemplates.bid_placed("Property Title", 1000000, "John")
```
**Status**: ⚠️ Needs endpoint: `POST /notifications/register-device`

**3. KYC Integration** (`app/services/kyc.py`)
```python
# Create verification
verification = await service.create_verification(
    user_id=123, email="user@example.com", first_name="John", last_name="Doe"
)

# Check status
status = await service.get_verification_status(verification_id)  # pending, approved, declined
```
**Status**: ⚠️ Needs endpoints: `POST /user/kyc`, `GET /user/kyc/{id}`

**4. Elasticsearch Search** (`app/services/search.py`)
```python
# Search with filters
results = await service.search_properties(
    query="luxury apartment",
    min_price=1000000, max_price=5000000,
    location="Lagos",
    min_bedroom=2, max_bedroom=4,
    amenities=["WiFi", "AC"],
    sort=PropertySearchFilter.PRICE_LOW_TO_HIGH
)
```
**Status**: ⚠️ Needs: Elasticsearch service setup + endpoint integration

**5. Celery Background Tasks** (`core/celery_config.py`)
```bash
# Start worker
celery -A core.celery_config worker -Q default,email,notifications,transactions

# Start beat (periodic)
celery -A core.celery_config beat --loglevel=info

# Periodic tasks run automatically:
# - check_payment_timeouts: every 5 min
# - send_appointment_reminders: every 2 hours
# - cleanup_expired_kyc: daily @ 1 AM
# - sync_blockchain_events: every 10 min
```

**6. Email Tasks** (`app/tasks/email.py`)
```python
# Send OTP
send_otp_email.delay(email="user@example.com", otp_code="123456", fullname="John")

# Send welcome
send_welcome_email.delay(email="user@example.com", fullname="John", account_type="agent")

# Send password reset, contract notification, bulk email
```

**7. Notification Tasks** (`app/tasks/notifications.py`)
```python
# Send push notification
send_push_notification.delay(user_id=123, title="...", body="...", notification_type="bid")

# Transaction notification
send_transaction_notification.delay(
    user_id=123,
    transaction_type="bid_placed",
    transaction_data={...}
)
```

**8. Transaction Tasks** (`app/tasks/transactions.py`)
```python
# Payment timeout check (automatic via Beat)
check_payment_timeouts.delay()

# Process payment
process_payment_confirmation.delay(contract_id=123, payment_data={...})

# Mint NFT
mint_property_nft.delay(property_id=123, owner_address="0x...")
```

**9. Document Tasks** (`app/tasks/documents.py`)
```python
# Process KYC documents
process_kyc_documents.delay(user_id=123, document_urls=[...])

# Generate contract PDF
generate_contract_pdf.delay(contract_id=123, output_path="/contracts/...")

# Cleanup tasks run automatically
```

#### Required `.env` Settings:
```env
# Redis (for Celery broker & caching)
REDIS_URL=redis://localhost:6379/0

# Firebase (push notifications)
FCM_CREDENTIALS=/path/to/firebase-credentials.json
# Get from: Firebase Console > Project Settings > Service Accounts > Generate Key

# Elasticsearch (search)
ELASTICSEARCH_URL=http://localhost:9200

# Persona (KYC)
PERSONA_API_KEY=pk_...

# Email (SMTP)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

#### Validation:
```bash
# WebSocket connection
wscat -c ws://localhost:8000/ws/notifications/123

# Celery task
celery -A core.celery_config inspect active  # Show active tasks

# Send test email
python -c "from app.tasks.email import send_otp_email; send_otp_email.delay('test@example.com', '123456', 'Test')"

# Check Elasticsearch
curl http://localhost:9200/_cat/indices
```

---

### Phase 3: Optimizations & Testing 🔄 READY

**Estimated**: 2-3 weeks  
**Files to Create**: 12 new files  
**See**: [PHASE_3_IMPLEMENTATION.md](PHASE_3_IMPLEMENTATION.md)

#### Planned Features:
1. **Redis Caching** - User profiles, property feeds, search results
2. **Health Checks** - Liveness/readiness probes, dependency health
3. **Unit Tests** - 70%+ code coverage with Pytest
4. **Integration Tests** - Endpoint testing with TestClient
5. **Load Testing** - Locust scenarios for performance validation
6. **Monitoring** - Prometheus metrics endpoint

---

## Configuration Guide

### Essential Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/sheda_db
DATABASE_POOL_SIZE=20

# Redis
REDIS_URL=redis://localhost:6379/0
REDIS_PASSWORD=

# Celery
CELERY_BROKER_URL=${REDIS_URL}
CELERY_RESULT_BACKEND=${REDIS_URL}

# Logging
LOG_LEVEL=INFO
LOG_FORMAT=json

# Rate Limiting
RATE_LIMIT_ENABLED=true

# Search
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_ENABLED=true

# Firebase (Optional - gracefully skipped if not configured)
FCM_CREDENTIALS=/path/to/firebase-credentials.json

# KYC
PERSONA_API_KEY=pk_your_key_here

# Email
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=noreply@sheda.com

# Application
APP_NAME=Sheda API
APP_ENV=development
DEBUG=true
SECRET_KEY=your-secret-key-for-jwt
```

### Docker Setup

```bash
# Start all services
docker-compose up -d

# Service ports
# API: 8000
# Redis: 6379
# PostgreSQL: 5432
# Elasticsearch: 9200
```

**docker-compose.yml** (example):
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://sheda:password@postgres:5432/sheda_db
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - postgres
      - redis
      - elasticsearch

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=sheda_db
      - POSTGRES_USER=sheda
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    environment:
      - discovery.type=single-node

volumes:
  postgres_data:
```

---

## Running Tests

### Phase 1 Tests (Manual)
```bash
# Test validators
python -c "from app.utils.validators import PropertyValidators; PropertyValidators.validate_price(100.50)"

# Test rate limiting
ab -n 6 -c 1 http://localhost:8000/auth/login  # 6th request returns 429

# Test error handling
curl -X POST http://localhost:8000/property/create \
  -H "Content-Type: application/json" \
  -d '{"title": "Bad"}'  # Returns structured error
```

### Phase 3 Tests (Pytest)
```bash
# Install test dependencies
pip install pytest pytest-asyncio pytest-cov

# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=app --cov-report=html

# Run specific test
pytest tests/unit/test_validators.py::TestValidators::test_validate_price_valid -v
```

### Load Testing (Locust)
```bash
# Install
pip install locust

# Run
locust -f tests/load/locustfile.py --host=http://localhost:8000

# Command line (headless)
locust -f tests/load/locustfile.py --host=http://localhost:8000 \
  --users 100 --spawn-rate 10 --run-time 10m --csv=results
```

---

## Deployment

### Development
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Production
```bash
gunicorn main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Kubernetes
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sheda-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: sheda-api
  template:
    metadata:
      labels:
        app: sheda-api
    spec:
      containers:
      - name: api
        image: sheda/api:latest
        ports:
        - containerPort: 8000
        livenessProbe:
          httpGet:
            path: /health/live
            port: 8000
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: sheda-secrets
              key: database-url
```

---

## Monitoring & Debugging

### Health Checks
```bash
# Basic health
curl http://localhost:8000/health

# Detailed status
curl http://localhost:8000/health/ready
```

### Logs
```bash
# Development (colored)
tail -f logs/app.log

# Production (JSON)
tail -f logs/app.log | jq .  # Pretty print JSON
```

### Metrics
```bash
# Prometheus metrics (Phase 3)
curl http://localhost:8000/metrics
```

### Database
```bash
# Check migrations
alembic current  # Current version
alembic history  # All migrations

# Run migration
alembic upgrade head

# Create migration
alembic revision --autogenerate -m "description"
```

### Redis
```bash
# Check connection
redis-cli ping  # PONG

# View keys
redis-cli KEYS "*"

# Monitor activity
redis-cli MONITOR
```

### Celery
```bash
# Active tasks
celery -A core.celery_config inspect active

# Registered tasks
celery -A core.celery_config inspect registered

# Worker stats
celery -A core.celery_config inspect stats
```

---

## Documentation

| Document | Purpose |
|----------|---------|
| [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) | High-level overview, timeline, checklist |
| [PHASE_1_IMPLEMENTATION.md](PHASE_1_IMPLEMENTATION.md) | Validators, rate limiting, error handling |
| [PHASE_2_IMPLEMENTATION.md](PHASE_2_IMPLEMENTATION.md) | WebSockets, push, KYC, search, Celery |
| [PHASE_3_IMPLEMENTATION.md](PHASE_3_IMPLEMENTATION.md) | Caching, health checks, testing |

---

## API Endpoints

### Authentication (Existing)
```
POST   /auth/login
POST   /auth/register
POST   /auth/logout
GET    /auth/me
POST   /auth/refresh-token
```

### Properties (Enhanced with caching)
```
GET    /property/get-properties          # Cached, filterable
GET    /property/{id}                    # Cached
POST   /property/create
PUT    /property/{id}
DELETE /property/{id}
GET    /property/search                  # Elasticsearch (Phase 2)
```

### Users (Phase 2)
```
GET    /user/{id}
PUT    /user/{id}
POST   /user/kyc                         # KYC verification (Phase 2)
GET    /user/kyc/{verification_id}      # KYC status (Phase 2)
```

### Notifications (Phase 2)
```
POST   /notifications/register-device    # Device token registration (Phase 2)
POST   /notifications/send               # Send push notification (Phase 2)
```

### Real-time (Phase 2)
```
WS     /ws/notifications/{user_id}      # WebSocket notifications (Phase 2)
WS     /ws/chat/{conversation_id}       # WebSocket chat (Phase 2)
```

### Health (Phase 3)
```
GET    /health                           # Basic health (Phase 1)
GET    /health/live                      # Kubernetes liveness probe (Phase 3)
GET    /health/ready                     # Kubernetes readiness probe (Phase 3)
GET    /metrics                          # Prometheus metrics (Phase 3)
```

---

## Troubleshooting

### Common Issues

**Rate limiting blocking legitimate traffic**
```
Solution: Update RATE_LIMITS in core/middleware/rate_limit.py
          or add IP to whitelist
```

**Celery tasks not running**
```
1. Verify Redis: redis-cli ping
2. Check worker: celery -A core.celery_config worker --loglevel=debug
3. Check logs: grep "task" output
4. Verify task routing in core/celery_config.py
```

**WebSocket connections dropping**
```
1. Check timeout settings
2. Monitor ConnectionManager state
3. Enable debug logging in app/services/websocket_manager.py
```

**Search not working**
```
1. Verify Elasticsearch: curl http://localhost:9200
2. Check index: curl http://localhost:9200/_cat/indices
3. Review search.py query syntax
4. Enable Elasticsearch in .env
```

**Email not sending**
```
1. Check SMTP settings in .env
2. Verify credentials
3. Check firewall/ISP blocking SMTP
4. Review email task logs
```

---

## Support

**Documentation**: See comment above for links  
**Issues**: Check GitHub Issues  
**Questions**: Review docstrings in source files  

---

## License

Property of Sheda Inc.

---

**Last Updated**: Feb 18, 2025  
**Maintained By**: Development Team  
**Next Review**: After Phase 3 completion
