# Next Steps: Phase 2 Integration & Phase 3 Implementation

**Current Status**: ✅ Phase 1 Complete | ✅ Phase 2 Services Ready | 🔄 Phase 2 Integration Needed | 🔄 Phase 3 Ready

---

## Immediate Actions (This Week)

### 1️⃣ **Wire Phase 2 Services into Endpoints** (HIGH PRIORITY)
**Time**: 2-3 days  
**Impact**: Makes all Phase 2 features functional

#### a) WebSocket Endpoints
- **File**: `app/routers/websocket.py` (Create/Update)
- **Endpoints to Create**:
  ```python
  @app.websocket("/ws/notifications/{user_id}")
  async def websocket_notifications(websocket: WebSocket, user_id: int):
      """Real-time notifications for user."""
      handler = get_websocket_handler()
      await handler.handle_connection(
          websocket,
          user_id=user_id,
          room_id=None,
          on_message_callback=async def(data): ...
      )

  @app.websocket("/ws/chat/{conversation_id}")
  async def websocket_chat(websocket: WebSocket, conversation_id: int):
      """Real-time chat for conversation."""
      handler = get_websocket_handler()
      await handler.handle_connection(
          websocket,
          user_id=current_user.id,
          room_id=f"chat_{conversation_id}",
          on_message_callback=async def(data): ...
      )
  ```

#### b) Notification Endpoints
- **File**: `app/routers/notifications.py` (Update)
- **Endpoints to Add**:
  ```python
  @app.post("/notifications/register-device")
  async def register_device(
      user_id: int,
      device_token: str,
      device_type: str = "mobile",
      device_name: Optional[str] = None,
  ):
      service = await get_notification_service()
      await service.register_device_token(user_id, device_token, device_type, device_name)
      return {"status": "registered"}
  ```

#### c) KYC Endpoints
- **File**: `app/routers/user.py` (Update)
- **Endpoints to Add**:
  ```python
  @app.post("/user/kyc")
  async def start_kyc(user_id: int, email: str, first_name: str, last_name: str):
      service = await get_kyc_service()
      verification = await service.create_verification(user_id, email, first_name, last_name)
      return {"verification_id": verification["id"], "redirect_url": verification["redirect_url"]}

  @app.get("/user/kyc/{verification_id}")
  async def get_kyc_status(verification_id: str):
      service = await get_kyc_service()
      status = await service.get_verification_status(verification_id)
      return status
  ```

#### d) Search Endpoint Enhancement
- **File**: `app/routers/listing.py` (Update)
- **Enhancement**:
  ```python
  @app.get("/property/search")  # or enhance existing get-properties
  async def search_properties(
      query: str,
      min_price: Optional[int] = None,
      max_price: Optional[int] = None,
      location: Optional[str] = None,
      # ... other filters
  ):
      service = await get_search_service()
      results = await service.search_properties(
          query=query,
          min_price=min_price,
          max_price=max_price,
          location=location,
          # ... pass other filters
      )
      return results
  ```

#### e) Wire Celery Tasks
- **File**: Transaction/Email routers (Update)
- **Pattern**:
  ```python
  from app.tasks.email import send_otp_email
  from app.tasks.notifications import send_push_notification
  from app.tasks.transactions import process_payment_confirmation

  @app.post("/auth/send-otp")
  async def auth_send_otp(email: str):
      # Send OTP (async via Celery)
      send_otp_email.delay(email=email, otp_code="123456", fullname="User")
      return {"message": "OTP sent"}

  @app.post("/transaction/confirm-payment")
  async def confirm_payment(contract_id: int, payment_data: dict):
      # Process payment (async via Celery)
      process_payment_confirmation.delay(contract_id=contract_id, payment_data=payment_data)
      return {"message": "Payment processing"}
  ```

### 2️⃣ **Staging Validation** (In Parallel with Above)
**Time**: 1 day (during Phase 2 integration)

```bash
# Deploy to staging
git push origin main

# Run on staging server
pip install -r requirements.txt
alembic upgrade head
uvicorn main:app

# Start Celery worker & beat
celery -A core.celery_config worker --beat

# Validate endpoints
curl http://staging/health/ready

# Test WebSocket
wscat -c ws://staging/ws/notifications/123

# Test Celery task
python -c "from app.tasks.email import send_otp_email; send_otp_email.delay(...)"

# Check logs
tail -f logs/app.log
```

---

## Week 2: Phase 3 Implementation

### 3️⃣ **Caching Layer** (2-3 days)
**Files to Create**:
- `app/utils/cache.py` (Cache utilities, decorators)
- `app/utils/cache_keys.py` (Cache key builders)
- `app/services/cache.py` (CacheService)

**Integration**:
```python
# In routers (example: property listing)
cache = await get_cache_service()
cached = await cache.get_property_feed(page=1)
if not cached:
    results = query_database()
    await cache.set_property_feed(page=1, results)
return results
```

**Success Metric**: >60% cache hit rate after 1 week

### 4️⃣ **Health Checks & Monitoring** (1-2 days)
**Files to Create**:
- `app/services/health.py` (HealthCheckService)
- `app/routers/health.py` (Health endpoints)

**Endpoints**:
```python
GET /health/live      # Kubernetes liveness probe
GET /health/ready     # Kubernetes readiness probe (checks all services)
GET /metrics          # Prometheus metrics
```

**Success Metric**: All background services health visible

### 5️⃣ **Unit & Integration Tests** (3-5 days)
**Files to Create**:
- `tests/conftest.py` (Pytest fixtures)
- `tests/unit/test_validators.py` (Validator tests)
- `tests/unit/test_exceptions.py` (Exception tests)
- `tests/integration/test_auth.py` (Auth endpoint tests)
- `tests/integration/test_properties.py` (Property endpoint tests)
- `tests/integration/test_websocket.py` (WebSocket tests)

**Run Tests**:
```bash
pip install pytest pytest-asyncio pytest-cov

# All tests
pytest tests/ -v

# Coverage report
pytest tests/ --cov=app --cov-report=html
open htmlcov/index.html
```

**Success Metric**: 70%+ code coverage

### 6️⃣ **Load Testing** (2-3 days)
**Files to Create**:
- `tests/load/locustfile.py` (Load test scenarios)

**Run Load Test**:
```bash
pip install locust

# Web UI
locust -f tests/load/locustfile.py --host=http://localhost:8000

# Headless
locust -f tests/load/locustfile.py --host=http://localhost:8000 \
  --users 100 --spawn_rate 10 --run-time 10m
```

**Success Metric**: <100ms p95 response time, handle 1000+ concurrent users

### 7️⃣ **Production Deployment** (1 day)
```bash
# Build Docker image
docker build -t sheda/api:latest .

# Push to registry
docker push sheda/api:latest

# Deploy on Kubernetes
kubectl apply -f k8s/deployment.yaml

# Monitor
kubectl logs -f deployment/sheda-api
kubectl get pods -w
```

---

## Checklist: Phase 2 Integration (This Week)

- [ ] Create `app/routers/websocket.py` with 2 WebSocket endpoints
- [ ] Update `app/routers/notifications.py` with `/notifications/register-device`
- [ ] Update `app/routers/user.py` with `/user/kyc` endpoints
- [ ] Update `app/routers/listing.py` with enhanced search
- [ ] Wire Celery `.delay()` calls in transaction/email routers
- [ ] Start Celery worker & beat in staging
- [ ] Test all 5 new features end-to-end
- [ ] Validate health endpoint returns 200 OK
- [ ] Update API documentation
- [ ] Deploy to staging server

---

## Checklist: Phase 3 Implementation (Week 2-3)

- [ ] Create caching layer files (cache.py, cache_keys.py)
- [ ] Wire caching into property/user routers
- [ ] Create health check service
- [ ] Add health/live and health/ready endpoints
- [ ] Create Pytest fixtures (conftest.py)
- [ ] Write unit tests (70%+ coverage target)
- [ ] Write integration tests for all endpoints
- [ ] Create Locust load test scenarios
- [ ] Run load tests, document results
- [ ] Set up Prometheus metrics endpoint
- [ ] Deploy to production with health checks enabled

---

## Decision Trees

### Am I ready for Phase 2 Integration? ✅
- [ ] Phase 1 deployed successfully
- [ ] All Phase 1 features validated
- [ ] Redis running
- [ ] Requirements.txt updated (celery, firebase-admin, elasticsearch, etc.)
- [ ] Environment variables configured

→ **YES**: Proceed with Phase 2 integration  
→ **NO**: Fix Phase 1 issues, then proceed

### Am I ready for Phase 3? ✅
- [ ] Phase 1 + 2 deployed to staging
- [ ] All Phase 2 endpoints working
- [ ] Celery tasks running successfully
- [ ] WebSocket connections stable
- [ ] Push notifications delivering

→ **YES**: Begin Phase 3 implementation  
→ **NO**: Debug Phase 2 issues, retest

### Am I ready for Production? ✅
- [ ] Phase 1 + 2 + 3 complete
- [ ] 70%+ code coverage
- [ ] Health checks passing
- [ ] Load test: <100ms p95
- [ ] Monitoring configured
- [ ] On-call runbook ready

→ **YES**: Deploy to production  
→ **NO**: Address gaps, revalidate

---

## Implementation Priority Matrix

```
               URGENT    NOT URGENT
IMPORTANT  [ Phase 2 ] [ Phase 3 ]
           Integration  Testing
           
NOT IMP.   [ ]         [ ]
```

**This Week (URGENT IMPORTANT)**: Phase 2 Integration
**Next Week (LESS URGENT IMPORTANT)**: Phase 3 Implementation

---

## Commands Reference

```bash
# Start development
uvicorn main:app --reload

# Celery worker
celery -A core.celery_config worker --loglevel=info

# Celery beat (periodic tasks)
celery -A core.celery_config beat --loglevel=info

# Both together (dev only)
celery -A core.celery_config worker --beat --loglevel=info

# Run tests
pytest tests/ -v
pytest tests/ --cov=app

# Load test
locust -f tests/load/locustfile.py

# Database migration
alembic upgrade head

# Create new migration
alembic revision --autogenerate -m "description"

# Check health
curl http://localhost:8000/health/ready | jq .
```

---

## Quick Reference: What Exists vs. What's Missing

| Feature | Exists | Integrated | Status |
|---------|--------|-----------|--------|
| **Phase 1** | | | |
| Validators | ✅ | ✅ | COMPLETE |
| Rate Limiting | ✅ | ✅ | COMPLETE |
| Error Handling | ✅ | ✅ | COMPLETE |
| Idempotency | ✅ | ✅ | COMPLETE |
| **Phase 2** | | | |
| WebSocket Manager | ✅ | ❌ | NEEDS: Endpoints |
| Push Notifications | ✅ | ❌ | NEEDS: Endpoints |
| KYC Service | ✅ | ❌ | NEEDS: Endpoints |
| Elasticsearch | ✅ | ❌ | NEEDS: Endpoints |
| Celery Config | ✅ | ❌ | NEEDS: Task calls |
| Email Tasks | ✅ | ❌ | NEEDS: Task calls |
| Notification Tasks | ✅ | ❌ | NEEDS: Task calls |
| **Phase 3** | | | |
| Cache Service | ❌ | ❌ | READY: Design docs exist |
| Health Checks | ❌ | ❌ | READY: Design docs exist |
| Unit Tests | ❌ | ❌ | READY: Design docs exist |
| Integration Tests | ❌ | ❌ | READY: Design docs exist |
| Load Tests | ❌ | ❌ | READY: Design docs exist |

---

## Success Looks Like...

### End of This Week:
```
✅ Phase 2 endpoints exposed and working
✅ WebSocket connections established
✅ Push notifications delivering to devices
✅ KYC flow functional
✅ Search returning results
✅ Email sending async
✅ Celery tasks running on schedule
✅ Staging validation complete
```

### End of Next Week:
```
✅ Cache hit rate >60%
✅ Health checks comprehensive
✅ 70%+ code coverage
✅ Load test: 1000+ concurrent users
✅ <100ms response time (p95)
✅ Production ready
```

### End of Month:
```
✅ Phase 1, 2, 3 all in production
✅ Metrics and monitoring active
✅ Team trained on new features
✅ Documentation complete
```

---

**Next Action**: Start with Phase 2 Integration → Focus on WebSocket and Celery task wiring → Validate in staging → Proceed to Phase 3

**Questions?** Reference the detailed guides:
- [PHASE_1_IMPLEMENTATION.md](PHASE_1_IMPLEMENTATION.md)
- [PHASE_2_IMPLEMENTATION.md](PHASE_2_IMPLEMENTATION.md)
- [PHASE_3_IMPLEMENTATION.md](PHASE_3_IMPLEMENTATION.md)
- [README_IMPLEMENTATION.md](README_IMPLEMENTATION.md)
