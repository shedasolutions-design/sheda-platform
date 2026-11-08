# Sheda-Backend

Backend for sheda solution

# **Real Estate Platform Backend(Still under development most fearures are still being worked on)**

This is the backend for a real estate platform built with **FastAPI**. The platform supports different user roles (e.g., clients, agents, agents), property listings, user authentication, and secure transactions.

## **Features**

- **User Authentication & Management**

  - Role-based accounts (Buyer, agent, Agent, etc.)
  - JWT-based authentication
  - Password reset with OTP verification

- **Property Listings**

  - CRUD operations for properties
  - Image uploads for listings
  - Search and filtering

- **Profile Management**

  - Update profile details (with polymorphic handling)
  - Upload profile pictures

- **Security & Performance**
  - Secure password hashing
  - Redis for caching and temporary storage
  - CORS handling
- **Media & IPFS Uploads**
  - Batch uploads via a single `files` field (send 1 or many files)
  - Cloudinary uploads for regular media
  - Pinata v3 IPFS upload support with JWT authentication
  - Configurable IPFS gateway URL output
- **Transaction Lifecycle**
  - Aggregated transaction feed
  - Document upload support for agreement NFTs
  - Transaction notifications and audit logs

## Recent Changes (March 2026)

- Added Pinata v3 upload integration for IPFS media uploads.
- Added support for batch uploads on both media endpoints using one `files` form field.
- Added configurable `PINATA_GATEWAY_URL` to control returned IPFS links.
- Hardened Alembic migration chain so fresh/empty databases can upgrade reliably.
- Added/updated reusable email template structure with `templates/base.html` inheritance.
- Added custom 404 page with quick links to `/sheda-docs` and `/sheda-backend`.

## **Tech Stack**

- **Backend:** FastAPI, Pydantic, SQLAlchemy
- **Database:** PostgreSQL
- **Caching & Session Management:** Redis
- **Authentication:** JWT

## **Installation**

### **Prerequisites**

- Python 3.10+
- PostgreSQL
- Redis

### **Setup**

1. **Clone the repository**

   ```sh
   git clone https://github.com/SpiDher/Sheda-Backend.git
   cd Sheda-Backend
   ```

2. **Create a virtual environment**

   ```sh
   python -m venv .venv
   source .venv/bin/activate  # On Windows use `.venv\Scripts\activate`
   ```

3. **Install dependencies**

   ```sh
   pip install -r requirements.txt
   ```

4. **Set up environment variables**  
   Create a `.env` file and configure your database, JWT secret, and Redis settings.

5. **View live server @ <https://sheda-backend-production.up.railway.app/>**

6. **Start the server**

   ```sh
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

# Real Estate Backend API

## Overview

This is the backend system for the real estate application. It handles user authentication, property listings, appointments, contract creation, chat system, and automated contract expiration management.

## Tech Stack

- **FastAPI** (Backend framework)
- **SQLAlchemy** (ORM for database interactions)
- **PostgreSQL** (Database)
- **APScheduler** (Scheduled tasks)
- **Railway** (Deployment platform)

## System Flow

### 1️⃣ **User Roles**

- **Client:** Can browse properties, book appointments, make payments, and chat.
- **Agent:** Lists properties, manages appointments, confirms payments, and engages with clients.

### 2️⃣ **Property Listings**

- Properties belong to agents.
- Can be available for **rent** or **sale**.
- Includes attributes like price, location, type, status, etc.

### 3️⃣ **Appointments**

- Clients book an appointment with an agent for a property.
- The agent confirms or rejects the appointment.
- Appointment requests include a full `requested_time` datetime (ISO 8601), and availability matching uses the weekday and time portion.

### 4️⃣ **Payment & Contract Flow**

- After an appointment, the client can **Make Payment** or **Cancel**.
- If **Make Payment**, account details are shown.
- Client confirms payment by clicking **"I have made payment"**.
- The agent then **Accepts** or **Declines** the payment.
- If accepted, a contract is created for **rent** or **sale**.

### 5️⃣ **Automated Contract Expiration**

- APScheduler runs a background job **every 24 hours**.
- It checks contracts that have expired.
- It deactivates the contract and marks the property as available.

## API Endpoints

### **Authentication**

- `POST /auth/register` – Register a new user.
- `POST /auth/login` – Login and get an access token.

### **Properties**

- `GET /properties` – List all properties.
- `GET /properties/{id}` – Get property details.
- `POST /properties` – Create a property (**Agent only**).
- `PATCH /properties/{id}` – Update property details (**Agent only**).
- `DELETE /properties/{id}` – Delete a property (**Agent only**).

### **Media**

- `POST /media/file-upload/{type}` – Upload one or many files using form field `files`.
- `POST /media/ipfs-upload` – Upload one or many files to IPFS using form field `files`.

### **Appointments**

- `POST /appointments` – Client books an appointment.
- `PATCH /appointments/{id}/confirm` – Agent confirms appointment.
- `DELETE /appointments/{id}` – Cancel appointment.

**Payload note:** booking requires `requested_time` as an ISO 8601 datetime (e.g., `2026-02-15T14:30:00Z`).

### **Payments & Contracts**

- `POST /contracts/{property_id}` – Create a contract after payment.
- `PATCH /contracts/{id}/confirm-payment` – Agent confirms payment.
- `PATCH /contracts/{id}/expire` – Mark contract as expired (automated).

### **Chat System**

- `POST /chats` – Send a message.
- `GET /chats/{user_id}` – Retrieve chat history.

### **Transactions**

- `GET /transactions?status=ongoing|completed|cancelled` – Aggregated transaction feed.
- `POST /transactions/{bid_id}/upload-documents` – Upload agreement documents.
- `GET /transactions/timeouts` – List timeout candidates for escrow refunds (admin only).

### **Notifications**

- `POST /notifications/transaction-update` – Store and broadcast transaction updates.
- `GET /notifications` – List transaction notifications for the current user.
- `POST /notifications/{id}/read` – Mark a notification as read.
- `POST /notifications/register-device` – Register a device token for push notifications.

### **Indexer**

- `POST /indexer/transactions` – Ingest blockchain transaction events (admin only).

### **Users & Wallets**

- `GET /users/by-wallet/{wallet_id}` – Resolve backend user from wallet.
- `POST /users/wallets/register` – Register wallet mapping for current user.

### **Minted Properties**

- `POST /minted-properties/register` – Register a newly minted on-chain property.
- `POST /minted-properties/{minted_id}/create-listing` – Create a backend listing from a minted property.

## Mint-First Listing Flow

Use this flow when the property NFT is minted on-chain before a backend listing exists.

1. **Mint on-chain** using the smart contract `mint_property(...)` to get `blockchain_property_id`.
2. **Register minted property** in the backend:
  - `POST /api/v1/minted-properties/register` with `blockchain_property_id` and owner wallet.
3. **Create backend listing** from the minted draft:
  - `POST /api/v1/minted-properties/{minted_id}/create-listing` with full `PropertyBase` data.
4. The backend automatically binds `blockchain_property_id` to the new listing.

This keeps on-chain assets and backend listings aligned without requiring a backend listing to exist before minting.

## Database Models

### **User (BaseUser abstract model)**

- `id` – Primary key.
- `role` – Can be `client` or `agent`.

### **Property**

- `id` – Primary key.
- `agent_id` – Foreign key to `User`.
- `status` – `available`, `sold`, `rented`.

### **Appointment**

- `id` – Primary key.
- `client_id` – Foreign key to `User`.
- `agent_id` – Foreign key to `User`.
- `property_id` – Foreign key to `Property`.

### **Contract**

- `id` – Primary key.
- `property_id` – Foreign key to `Property`.
- `client_id` – Foreign key to `User`.
- `agent_id` – Foreign key to `User`.
- `is_active` – Becomes `False` when expired.

### **Chat**

- `id` – Primary key.
- `sender_id` – Foreign key to `User`.
- `receiver_id` – Foreign key to `User`.
- `message` – Text content.

## Scheduled Jobs (APScheduler)

- Runs **every 24 hours** to check for expired contracts.
- Marks contracts as inactive and updates property availability.

## WebSocket API Reference

The platform provides real-time messaging capabilities through WebSocket endpoints.
ws://localhost:8000/api/v1/chat/global-chat?token=....
ws://localhost:8000/api/v1/chat/2?token=...

## WebSocket Connection Flow

### 1. Authentication

- **JWT Required:**
  - Pass via query param: `/ws/{user_id}?token={jwt_token}`
  - Or via header: `Sec-WebSocket-Protocol: Bearer.{jwt_token}`
- **Validation:** Only active, verified users can connect. Invalid/missing token results in connection error (WS_1008_POLICY_VIOLATION).

### 2. Connection

- Client connects to `/api/v1/chat/{user_id}` (user_id = sender's ID)
- Server authenticates and tracks connection per user.

### 3. Sending a Message

- **Payload Example:**

  ```json
  {
    "receiver_id": 3,
    "message": "wagwan"
  }
  ```

- **Required fields:**
  - `receiver_id`: Target user ID
  - `message`: Text content

### 4. Server Response

- **To Sender:**

  ```json
  {
    "status": "sent",
    "delivered": true, // true if recipient is online
    "message_id": <int>
  }
  ```

- **To Receiver:**

  ```json
  {
    "id": <message_id>,
    "sender_info": {
      "id": <sender_id>,
      "username": <sender_username>,
      "avatar_url": <sender_avatar_url>
    },
    "receiver_id": <receiver_id>,
    "message": "wagwan",
    "created_at": "<ISO timestamp>"
  }
  ```

### 5. Error Handling

- **Error Response:**

  ```json
  {
    "error": "Error description"
  }
  ```

### 6. Disconnection

- On disconnect, server cleans up session and removes user from active connections.

### 7. Chat History

- REST endpoint available: `GET /api/v1/chats/{user_id}`

---

## Recent Updates

- **WebSocket authentication** now supports both query param and header.
- **Message delivery status**: Sender receives `delivered: true` if recipient is online.
- **Session cleanup**: Disconnection removes user from active connections.
- **Payload validation**: Only valid, active users can send/receive messages.
- **REST chat history** endpoint added for retrieving past messages.

| Endpoint | Description |
|----------|-------------|
| `/ws/{user_id}` | Primary messaging endpoint with user ID verification |
| `/api/v1/chat/ws` | Alternative chat endpoint (no user ID in path) |

---

### Authentication Methods

WebSocket connections require JWT authentication. Two methods are supported:

#### 1. Query Parameter (Recommended for browsers)

Append the token as a query parameter:

```
ws://<host>/ws/{user_id}?token={jwt_token}
ws://<host>/api/v1/chat/ws?token={jwt_token}
```

**Example (JavaScript):**

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/123?token=eyJhbGciOiJIUzI1NiIs...');
```

#### 2. Sec-WebSocket-Protocol Header (Recommended for WebSocket clients)

Pass the token via the `Sec-WebSocket-Protocol` header using the format `Bearer.{token}`:

```
Sec-WebSocket-Protocol: Bearer.{jwt_token}
```

**Example (JavaScript):**

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/123', ['Bearer.eyJhbGciOiJIUzI1NiIs...']);
```

**Example (Python with websockets):**

```python
import websockets

async with websockets.connect(
    'ws://localhost:8000/ws/123',
    subprotocols=['Bearer.eyJhbGciOiJIUzI1NiIs...']
) as ws:
    # Connection established
    pass
```

> **Note:** When using the protocol header method, the server echoes back the protocol on successful connection, following WebSocket standards.

---

### Message Payload Structures

#### Incoming Message (Client → Server)

Send messages to other users:

```json
{
    "receiver_id": 123,
    "message": "Hello there!",
    "property_id": 456
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `receiver_id` | `int` | ✅ Yes | Target user's ID |
| `message` | `string` | ✅ Yes | Message content |
| `property_id` | `int` | ❌ No | Optional property ID for property-related discussions |

#### Outgoing Message (Server → Client)

Messages received from other users:

```json
{
    "id": 1,
    "sender_info": {
        "id": 456,
        "username": "sender_name",
        "avatar_url": "https://example.com/avatar.jpg"
    },
    "receiver_id": 123,
    "message": "Hello there!",
    "created_at": "2025-10-16T10:00:00.000Z",
    "property_id": 456
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `int` | Unique message ID |
| `sender_info` | `object` | Sender's user information |
| `sender_info.id` | `int` | Sender's user ID |
| `sender_info.username` | `string` | Sender's username |
| `sender_info.avatar_url` | `string\|null` | Sender's profile picture URL |
| `receiver_id` | `int` | Recipient's user ID |
| `message` | `string` | Message content |
| `created_at` | `string` | ISO 8601 timestamp |
| `property_id` | `int\|null` | Associated property ID (if any) |

#### Confirmation Response (Server → Sender)

After sending a message, the sender receives a confirmation:

```json
{
    "status": "sent",
    "delivered": true,
    "message_id": 1
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `string` | Always `"sent"` on success |
| `delivered` | `boolean` | `true` if recipient is online and received the message |
| `message_id` | `int` | ID of the stored message |

#### Error Response

When validation fails:

```json
{
    "error": "Missing required fields: receiver_id, message"
}
```

---

### Connection Error Codes

| Code | Name | Description |
|------|------|-------------|
| `1008` | Policy Violation | Authentication failed (invalid/expired token, inactive user, or user ID mismatch) |

---

### /ws/{user_id} Endpoint Details

**URL:** `ws://<host>/ws/{user_id}`

This endpoint requires the `user_id` in the path to match the authenticated user's ID from the JWT token. This provides an additional layer of verification.

**Connection Flow:**

1. Client connects with token (query param or protocol header)
2. Server validates JWT token
3. Server verifies `user_id` matches the token's subject
4. Server accepts connection (echoing subprotocol if used)
5. Real-time messaging begins

---

### /api/v1/chat/ws Endpoint Details

**URL:** `ws://<host>/api/v1/chat/ws`

This endpoint authenticates solely via the JWT token without requiring the user ID in the path.

**Connection Flow:**

1. Client connects with token (query param or protocol header)
2. Server validates JWT token
3. Server accepts connection (echoing subprotocol if used)
4. Real-time messaging begins

---

### Chat History REST Endpoint

To retrieve paginated chat history with a specific user, make a **GET** request to:

```
GET /api/v1/chat/history/{user_id}?offset=0&limit=50
```

**Parameters:**

| Parameter | Location | Type | Required | Default | Description |
|-----------|----------|------|----------|---------|-------------|
| `user_id` | path | `int` | ✅ Yes | - | The ID of the other user in the conversation |
| `offset` | query | `int` | ❌ No | `0` | Number of messages to skip |
| `limit` | query | `int` | ❌ No | `100` | Number of messages to return (max: 200) |
| `property_id` | query | `int` | ❌ No | - | Filter by property ID |

**Response Format:**

```json
[
    {
        "id": 1,
        "sender_id": 456,
        "receiver_id": 123,
        "message": "Hello there!",
        "timestamp": "2025-10-16T10:00:00.000Z",
        "property_id": null,
        "is_read": true,
        "sender_info": {
            "id": 456,
            "username": "sender_name",
            "avatar_url": "https://example.com/avatar.jpg",
            "fullname": "John Doe"
        },
        "receiver_info": {
            "id": 123,
            "username": "receiver_name",
            "avatar_url": null,
            "fullname": "Jane Doe"
        },
        "property_info": null
    }
]
```

---

### Disconnection Handling

When a user disconnects, their WebSocket session is automatically removed from active connections, ensuring clean resource management.

## Deployment

- Hosted on **Railway**.
- Uses PostgreSQL for the database.
- APScheduler runs within the FastAPI application.

## Next Steps

- Improve payment verification with webhook integration.
- Enhance notification system for user interactions.

---

## 🔐 Admin Role and Permissions

### Overview

The system supports a distinct `admin` role. This role provides elevated privileges across the platform and is granted through the `role` field on the user object.

- `role` values: `"user"` (default), `"admin"`
- Admins may have associated accounts (e.g., buyer/seller), but their elevated privileges are determined by the `role` field, not the account type.

### 🔧 Promoting a User to Admin

Any registered user can be granted admin privileges by directly updating their `role` in the database:

```sql
UPDATE users SET role = 'admin' WHERE id = '<user_id>';
```

> ⚠️ This does **not** change other attributes. Admins will retain any existing buyer/seller accounts unless explicitly handled.

After this update:

- Tokens issued to that user will include the `"admin"` scope.
- The user will be able to access admin-only routes if they are active.

---

### Token Scopes

Tokens issued to users now include a `scopes` claim. For admin users, this will include the `"admin"` scope.

Example token payload:

```json
{
  "sub": "user_id",
  "scopes": ["admin"]
}
```

To gain access to admin-only features, the token must include the `"admin"` scope, and the user must have the `admin` role **and** be active.

### Authorization Logic

All protected routes check scopes and roles like so:

- If the route requires `"admin"` scope:

  - The token must include `"admin"`
  - The user’s `role` must be `admin`
  - The user must be active

Failing any of these conditions will result in a `403 Forbidden`.

---

## 🔒 Admin-Only Endpoint

### Upload Media File

**Endpoint:**
`POST /api/media/file-upload/{type}`

**Description:**
Upload a media file of the specified type. Only admin users can access this endpoint.

**Path Parameters:**

- `type`: string — the category/type of the file to be uploaded.

**Authentication Required:**

- Bearer token with `"admin"` scope

**Responses:**

- `201 Created`: File uploaded successfully
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: User is not an active admin

---

## 🔑 Available Token Scopes

The following scopes define what a user can do within the system. Scopes are embedded in access tokens and are used to enforce permission checks.

| **Scope** | **Description**                        |
| --------- | -------------------------------------- |
| `admin`   | Admin access to all endpoints          |
| `agent`   | Allows creating and managing products  |
| `client`  | Allows viewing and purchasing products |
| `otp`     | Temporary access for OTP verification  |

> **Note:**
>
> - User `role` values: `user`, `admin`, `moderator`
> - User `user_type` values: `client`, `agent`
