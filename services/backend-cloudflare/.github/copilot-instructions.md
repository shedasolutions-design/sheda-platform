# Sheda-Backend: AI Coding Agent Instructions

## Project Overview

- **Domain:** Real estate platform backend
- **Framework:** FastAPI (see `app/main.py`)
- **Core Features:** User authentication (JWT, OTP), property listings, profile management, chat (WebSocket), payments/contracts, admin role, scheduled jobs (APScheduler)
- **Tech Stack:** FastAPI, SQLAlchemy, Pydantic, PostgreSQL, Redis

## Architecture & Key Directories

- `app/routers/` — API endpoints (auth, user, property, chat, media, listing)
- `app/models/` — SQLAlchemy models (User, Property, Appointment, Contract, Chat)
- `app/schemas/` — Pydantic schemas for request/response validation
- `app/services/` — Business logic (auth, user, listing, profile)
- `app/utils/` — Utilities (email, enums, tasks)
- `core/` — App configs, DB setup, dependencies, starter
- `templates/` — Email templates
- `tests/` — Test scripts

## Developer Workflows

- **Setup:**
  - Create `.env` for DB, JWT, Redis config
  - Install dependencies: `pip install -r requirements.txt`
  - Start server: `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`
- **Testing:**
  - Run tests in `tests/` (use `pytest` or run `python tests/test.py`)
- **Database:**
  - Models in `app/models/`
  - Migrations not automated; update models and DB manually
- **Scheduled Jobs:**
  - APScheduler runs daily to expire contracts (see `app/services/`)
- **WebSocket Chat:**
  - Endpoint: `/chat/{user_id}`
  - Message format: `{ "sender_id": ..., "receiver_id": ..., "message": ... }`

## Project-Specific Patterns

- **Role & Scope System:**
  - User roles: `user`, `admin`, `moderator`; user types: `client`, `agent`
  - JWT tokens include `scopes` claim; admin-only endpoints require `admin` scope
  - Promote user to admin by updating `role` in DB
- **Auth & Permissions:**
  - All protected routes check both token scopes and user role
  - Admin-only endpoints (e.g., media upload) require active admin with correct scope
- **Property & Contract Flow:**
  - Properties linked to agents; contracts created after payment and appointment
  - Contract expiration handled by scheduled job
- **Chat System:**
  - Real-time via WebSocket; history via REST endpoint
  - Disconnection cleans up session

## Integration Points

- **External:** PostgreSQL, Redis, Railway (deployment)
- **Internal:** APScheduler, JWT, WebSocket

## Conventions & Patterns

- **CRUD:** Standard REST for resources; PATCH for updates
- **Validation:** Pydantic schemas for all request/response bodies
- **Error Handling:** 401/403 for auth failures; 201/200 for success
- **File Uploads:** Only admins can upload via `/api/media/file-upload/{type}`

## Example: Admin Promotion

```sql
UPDATE users SET role = 'admin' WHERE id = '<user_id>';
```

## Example: Start Server

```sh
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

**For unclear or missing conventions, ask maintainers for clarification.**
