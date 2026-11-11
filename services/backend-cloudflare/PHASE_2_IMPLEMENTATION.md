# Phase 2: Features & Integrations Implementation Guide

## Overview
Phase 2 adds real-time capabilities, external service integrations, and background processing. These features enhance user experience and enable advanced platform capabilities.

**Status**: ✅ Core Implementation Complete
**Time to Integration**: 3-4 days per feature

---

## 1. Real-time WebSockets

### Implementation

#### Files Created:
- **✅ `app/services/websocket_manager.py`** (NEW)
  - `ConnectionManager`: Manages active WebSocket connections
  - `WebSocketHandler`: High-level connection lifecycle handler
  - `WebSocketMessage`: Message schema builders

#### Key Features:

**1. Connection Management**
```python
from app.services.websocket_manager import ConnectionManager

manager = ConnectionManager()

# User connects
await manager.connect(
    websocket=websocket,
    user_id=123,
    room_id="chat_456"  # Optional room/channel
)

# Send personal message
await manager.send_personal_message(
    message={"type": "notification", "content": "..."},
    user_id=123
)

# Send room message
await manager.send_room_message(
    message={"type": "chat_message", "content": "..."},
    room_id="chat_456"
)

# Broadcast to all users
await manager.broadcast_message(
    message={"type": "system", "content": "..."}
)

# User disconnects
await manager.disconnect(websocket)
```

**2. Message Types**

```python
from app.services.websocket_manager import WebSocketMessage

# Notifications
WebSocketMessage.notification(
    title="New Bid",
    message="You received a new bid",
    notification_type="bid",
    data={"property_id": 123, "bid_amount": 1000}
)

# Chat messages
WebSocketMessage.chat_message(
    chat_id=456,
    sender_id=789,
    sender_name="John Doe",
    content="Hello!",
    message_type="text"
)

# Status updates
WebSocketMessage.status_update(
    entity_type="contract",
    entity_id=123,
    status="signed",
    data={"signed_at": "2025-02-18..."}
)

# Error messages
WebSocketMessage.error(
    message="Something went wrong",
    error_code="WS_001",
    details={"reason": "Connection timeout"}
)
```

**3. Endpoint Integration**

```python
from fastapi import WebSocket, WebSocketDisconnect
from app.services.websocket_manager import get_websocket_handler

@app.websocket("/ws/notifications/{user_id}")
async def websocket_notifications(websocket: WebSocket, user_id: int):
    """WebSocket endpoint for notifications."""
    handler = get_websocket_handler()
    
    # Message handler callback
    async def on_message(data):
        if data.get("type") == "ping":
            await websocket.send_json({"type": "pong"})
    
    # Handle connection lifecycle
    await handler.handle_connection(
        websocket,
        user_id=user_id,
        room_id=None,
        on_message_callback=on_message
    )

@app.websocket("/ws/chat/{conversation_id}")
async def websocket_chat(websocket: WebSocket, conversation_id: int):
    """WebSocket endpoint for chat."""
    handler = get_websocket_handler()
    
    async def on_chat_message(data):
        # Broadcast to room
        await handler.manager.send_room_message(
            message=data,
            room_id=f"chat_{conversation_id}"
        )
    
    await handler.handle_connection(
        websocket,
        user_id=current_user.id,
        room_id=f"chat_{conversation_id}",
        on_message_callback=on_chat_message
    )
```

**4. Connection Statistics**

```python
manager = get_connection_manager()

# Get total active users
active_users = manager.get_active_users()  # [123, 456, 789]

# Get user connection count
conn_count = manager.get_user_connection_count(user_id=123)  # 2

# Get room connection count
room_users = manager.get_room_connection_count(room_id="chat_456")  # 5

# Get total connections
total = manager.get_total_connections()  # 15
```

---

## 2. Push Notifications (FCM/APNs)

### Implementation

#### Files Created:
- **✅ `app/services/push_notifications.py`** (NEW)
  - `PushNotificationService`: FCM/APNs integration
  - `NotificationTemplates`: Pre-defined notification templates
  - Support for Firebase Cloud Messaging

#### Setup:

**1. Install Dependencies**
```bash
pip install firebase-admin==6.2.0
```

**2. Configure Firebase** (`core/configs.py`)
```python
# Add to settings
FCM_CREDENTIALS: str = Field(..., description="Path to Firebase credentials JSON")
```

**3. Download Credentials**
- Go to Firebase Console
- Project Settings > Service Accounts
- Generate private key JSON
- Set `FCM_CREDENTIALS` path in `.env`

#### Usage:

**1. Register Device Token**
```python
from app.services.push_notifications import get_notification_service

@app.post("/notifications/register-device")
async def register_device(
    user_id: int,
    device_token: str,
    device_type: str = "mobile",
    device_name: Optional[str] = None,
):
    service = await get_notification_service()
    
    await service.register_device_token(
        user_id=user_id,
        device_token=device_token,
        device_type=device_type,
        device_name=device_name,
    )
    
    return {"status": "registered"}
```

**2. Send Notifications**
```python
# Send to single user
result = await service.send_notification(
    user_id=123,
    title="New Bid Received",
    body="Someone bid on your property",
    notification_type="bid",
    data={"property_id": 456, "bid_amount": 1500},
)
# Returns: {"sent": 1, "failed": 0, "total": 1}

# Send to multiple users
result = await service.send_to_multiple_users(
    user_ids=[123, 456, 789],
    title="System Maintenance",
    body="Service will be down on Feb 19",
    notification_type="system",
)
# Returns: {"users": 3, "total_sent": 2, "total_failed": 1}
```

**3. Using Templates**
```python
from app.services.push_notifications import NotificationTemplates

# Bid placed
title, body = NotificationTemplates.bid_placed(
    property_title="Luxury Apartment in Lagos",
    bid_amount=2500000,
    bidder_name="Jane Smith"
)
# title: "New Bid Received"
# body: "Jane Smith placed a bid of 2500000 on Luxury Apartment in Lagos"

# Message received
title, body = NotificationTemplates.message_received(sender_name="John Doe")
# title: "New Message"
# body: "John Doe sent you a message"

# KYC approved
title, body = NotificationTemplates.kyc_approved()
# title: "KYC Approved"
# body: "Your identity has been verified successfully"

# Appointment reminder
title, body = NotificationTemplates.appointment_reminder(
    property_title="Apartment",
    time="14:30"
)
# title: "Appointment Reminder"
# body: "Don't forget appointment for Apartment at 14:30"
```

---

## 3. KYC Integration

### Implementation

#### Files Created:
- **✅ `app/services/kyc.py`** (NEW)
  - `KYCService`: Unified KYC service
  - `PersonaKYCService`: Persona API integration
  - Support for multiple KYC providers (extensible)

#### Supported Providers:
- Persona (implemented)
- IDology (extensible)
- Trulioo (extensible)
- Onfido (extensible)

#### KYC Statuses:
- `pending`: Awaiting verification
- `in_progress`: Being processed
- `verified`: Approved
- `rejected`: Declined
- `expired`: Expired

#### Setup:

**1. Install Httpx**
```bash
pip install httpx==0.25.0
```

**2. Configure Persona** (`core/configs.py`)
```python
PERSONA_API_KEY: str = Field(..., description="Persona API key")
```

#### Usage:

**1. Create Verification Request**
```python
from app.services.kyc import get_kyc_service

@app.post("/user/kyc")
async def start_kyc(
    user_id: int,
    email: str,
    first_name: str,
    last_name: str,
    phone_number: Optional[str] = None,
):
    service = await get_kyc_service()
    
    verification = await service.create_verification(
        user_id=user_id,
        email=email,
        first_name=first_name,
        last_name=last_name,
        phone_number=phone_number,
    )
    
    return {
        "verification_id": verification.get("id"),
        "redirect_url": verification.get("attributes", {}).get("redirect-url"),
    }
```

**2. Check Verification Status**
```python
@app.get("/user/kyc/{verification_id}")
async def get_kyc_status(verification_id: str):
    service = await get_kyc_service()
    
    status = await service.get_verification_status(verification_id)
    
    return {
        "id": status["id"],
        "status": status["status"],  # pending, approved, declined
        "created_at": status["created_at"],
        "completed_at": status["completed_at"],
        "reason": status.get("reason"),
    }
```

**3. Check if Verified**
```python
is_verified = await service.is_verified(verification_id)
if is_verified:
    # Update user model with verified status
    user.kyc_status = KycStatusEnum.verified
    await db.commit()
```

---

## 4. Elasticsearch Search

### Implementation

#### Files Created:
- **✅ `app/services/search.py`** (NEW)
  - `SearchService`: Full-text search with filters
  - `PropertySearchFilter`: Sort and filter options
  - Fuzzy matching and faceted search

#### Setup:

**1. Install Elasticsearch**
```bash
# Using Docker
docker run -d -p 9200:9200 -p 9300:9300 -e "discovery.type=single-node" docker.elastic.co/elasticsearch/elasticsearch:8.11.0
```

**2. Install Python Client**
```bash
pip install elasticsearch==8.11.0
```

#### Usage:

**1. Index Property**
```python
from app.services.search import get_search_service

service = await get_search_service(elasticsearch_url="http://localhost:9200")

await service.index_property(
    property_id=123,
    title="Luxury Apartment",
    description="Beautiful 3-bedroom apartment...",
    location="Ikoyi, Lagos",
    price=15000000,
    property_type="apartment",
    listing_type="rent",
    status="available",
    bedroom=3,
    bathroom=2,
    furnished=True,
    is_negotiable=True,
    agent_id=456,
    amenities=["WiFi", "AC", "Parking"],
)
```

**2. Search Properties**
```python
results = await service.search_properties(
    query="luxury apartment",  # Fuzzy search
    location="Lagos",
    property_type="apartment",
    listing_type="rent",
    min_price=10000000,
    max_price=20000000,
    min_bedroom=2,
    max_bedroom=4,
    furnished=True,
    amenities=["WiFi", "AC"],
    sort=PropertySearchFilter.PRICE_LOW_TO_HIGH,
    limit=20,
    offset=0,
)

# Returns:
# {
#     "results": [
#         {
#             "id": 123,
#             "title": "Luxury Apartment",
#             "location": "Ikoyi",
#             "price": 15000000,
#             "score": 2.3
#         },
#         ...
#     ],
#     "total": 45,
#     "limit": 20,
#     "offset": 0,
# }
```

**3. Search Filters**
```python
# Price range
await service.search_properties(
    min_price=1000000,
    max_price=5000000
)

# Bedroom and bathroom
await service.search_properties(
    min_bedroom=3,
    max_bedroom=5,
    min_bathroom=2,
    max_bathroom=4
)

# Amenities
await service.search_properties(
    amenities=["WiFi", "Swimming Pool"]
)

# Sort options
from app.services.search import PropertySearchFilter

await service.search_properties(
    sort=PropertySearchFilter.PRICE_LOW_TO_HIGH,
    # or
    sort=PropertySearchFilter.PRICE_HIGH_TO_LOW,
    sort=PropertySearchFilter.NEWEST,
    sort=PropertySearchFilter.OLDEST,
    sort=PropertySearchFilter.MOST_RELEVANT,
)
```

---

## 5. Celery Background Tasks

### Implementation

#### Files Created:
- **✅ `core/celery_config.py`** (NEW)
  - Celery app configuration
  - Queue and routing setup
  - Beat schedule for periodic tasks
  
- **✅ `app/tasks/` (NEW)**
  - `email.py`: Email sending tasks
  - `notifications.py`: Push notification tasks
  - `transactions.py`: Payment and blockchain tasks
  - `documents.py`: Document processing tasks

#### Setup:

**1. Install Dependencies**
```bash
pip install celery==5.3.4
pip install redis==5.2.1  # Already in requirements
```

**2. Redis Configuration**
```bash
# Already configured via REDIS_URL in .env
REDIS_URL=redis://localhost:6379/0
```

**3. Start Celery Worker**
```bash
# Single worker
celery -A core.celery_config worker --loglevel=info

# With multiple queues
celery -A core.celery_config worker -Q default,email,notifications,transactions

# With Celery Beat (periodic tasks)
celery -A core.celery_config beat --loglevel=info

# Combined (development only)
celery -A core.celery_config worker --beat --loglevel=info
```

#### Email Tasks:

```python
from app.tasks.email import send_otp_email, send_welcome_email

# Send OTP
send_otp_email.delay(
    email="user@example.com",
    otp_code="123456",
    fullname="John Doe"
)

# Send welcome
send_welcome_email.delay(
    email="user@example.com",
    fullname="John Doe",
    account_type="agent"
)
```

#### Notification Tasks:

```python
from app.tasks.notifications import send_push_notification, send_transaction_notification

# Send push
send_push_notification.delay(
    user_id=123,
    title="New Bid",
    body="You have a new bid",
    notification_type="bid",
    data={"property_id": 456}
)

# Transaction notification
send_transaction_notification.delay(
    user_id=123,
    transaction_type="bid_placed",
    transaction_data={
        "property_title": "Apartment",
        "bid_amount": 1000000,
        "bidder_name": "Jane Smith"
    }
)
```

#### Transaction Tasks:

```python
from app.tasks.transactions import (
    check_payment_timeouts,
    process_payment_confirmation,
    mint_property_nft
)

# Check timeouts (periodic, automatic)
# Runs every 5 minutes via beat schedule

# Process payment
process_payment_confirmation.delay(
    contract_id=123,
    payment_data={
        "amount": 1000000,
        "method": "crypto"
    }
)

# Mint NFT
mint_property_nft.delay(
    property_id=123,
    owner_address="0x1234567890123456789012345678901234567890"
)
```

#### Document Tasks:

```python
from app.tasks.documents import process_kyc_documents, generate_contract_pdf

# Process KYC docs
process_kyc_documents.delay(
    user_id=123,
    document_urls=[
        "https://storage/doc1.pdf",
        "https://storage/doc2.pdf"
    ]
)

# Generate contract PDF
generate_contract_pdf.delay(
    contract_id=123,
    output_path="/contracts/contract_123.pdf"
)
```

#### Periodic Tasks (Celery Beat):

|Task|Schedule|Purpose|
|---|---|---|
|`check_payment_timeouts`|Every 5 min|Check for payment timeouts|
|`send_appointment_reminders`|Every 2 hours|Send upcoming appointment reminders|
|`cleanup_expired_kyc`|Daily @ 1 AM|Clean expired KYC records|
|`sync_blockchain_events`|Every 10 min|Sync on-chain events|

---

## Updated Dependencies

```txt
# Phase 2 additions
slowapi==0.1.9                    # Rate limiting (Phase 1)
structlog==24.1.0                 # Structured logging (Phase 1)
python-socketio==5.10.0           # WebSocket support
firebase-admin==6.2.0             # Push notifications
elasticsearch==8.11.0             # Full-text search
celery==5.3.4                     # Background tasks
httpx==0.25.0                     # Async HTTP client
jinja2==3.1.6                     # Email templating
python-multipart==0.0.20          # Form handling
```

---

## Summary

### Phase 2 Provides:

✅ **Real-time Capabilities**
- WebSocket notifications for instant updates
- Live chat between users
- Real-time status updates for contracts and payments

✅ **External Integrations**
- Firebase Cloud Messaging for push notifications
- Persona API for KYC verification
- Elasticsearch for advanced search

✅ **Background Processing**
- Async email delivery
- Async push notifications
- Payment processing
- Document generation
- Periodic system tasks

✅ **Developer Experience**
- Pre-defined message templates
- Easy-to-use service APIs
- Comprehensive task examples
- Built-in error handling and retries

### Next Steps:
- Test Phase 2 features in staging
- Monitor WebSocket connections and performance
- Verify email/push delivery
- Then proceed to Phase 3: Optimizations & Testing

---

## Troubleshooting

### WebSocket Issues
- Ensure WebSocket upgrade header is sent
- Check for CORS/proxy misconfigurations
- Verify connection timeout settings

### FCM Issues
- Verify Firebase credentials JSON is valid
- Check device tokens are valid
- Ensure app is properly configured in Firebase Console

### Elasticsearch Issues
- Ensure ES is running and accessible
- Check index mappings are correct
- Verify field data types match queries

### Celery Issues
- Ensure Redis is running
- Check Celery worker logs
- Verify task routing is correct
