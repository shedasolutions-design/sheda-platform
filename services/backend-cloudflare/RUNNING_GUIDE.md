# Sheda Backend Run Guide

This guide describes how to run and validate all services of the Sheda backend application locally, including the FastAPI server, Celery task workers, the Celery Beat periodic scheduler, and the test suite.

---

## 🛠️ Prerequisites

Before running the application, ensure you have the following installed:
* **Python 3.10+** (Python 3.14 is used in the current virtual environment)
* **SQLite3** (for local development database)
* **Redis** (used as Celery's message broker and results backend)

---

## ⚙️ Configuration Setup

Create a `.env` file in the root of the backend directory. You can copy the example file:
```bash
cp .env.example .env
```

Ensure the following variables are configured correctly in `.env` for local execution:
* `DB_URL="sqlite+aiosqlite:///sheda.db"` (Forces SQLite local DB instead of PostgreSQL)
* `REDIS_URL="redis://localhost:6379/0"` (Ensure your local Redis server is running)
* `NEAR_RPC_URL="https://rpc.testnet.near.org"` (Used to verify on-chain transaction hashes)
* `ADMIN_SEED_ENABLED=True` (Enables automatic seeding of the superadmin user on startup)

---

## 🏃‍♂️ Running the Services

The application requires three processes to run concurrently. Run each of these commands in a separate terminal tab or window inside the `backend` directory (with your virtual environment activated).

### 1. Database Migrations
Before starting the servers, run Alembic migrations to align your database schema:
```bash
# Activate virtual environment
source .venv/bin/activate

# Apply migrations to the head revision
DB_URL="sqlite+aiosqlite:///sheda.db" alembic upgrade head
```

### 2. FastAPI Web Server
Start the Uvicorn ASGI server to serve the API and handle real-time WebSockets:
```bash
# Run server with hot-reload enabled
PYTHONPATH=. uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
* **API Documentation:** [http://localhost:8000/docs](http://localhost:8000/docs)
* **Notification WebSockets:** `ws://localhost:8000/ws/notifications/{user_id}`

### 3. Celery Task Worker
Start the Celery worker process to handle background tasks (e.g., Firebase Push notifications):
```bash
# Run the Celery worker
celery -A core.celery_config worker --loglevel=info
```

### 4. Celery Beat Scheduler
Start the Celery Beat daemon to dispatch scheduled tasks (e.g., daily contract expiration and payment timeouts checking):
```bash
# Run the Celery Beat scheduler
celery -A core.celery_config beat --loglevel=info
```

> [!TIP]
> You can also run the Celery Worker and Beat scheduler combined in a single process during development:
> ```bash
> celery -A core.celery_config worker --beat --loglevel=info
> ```

---

## 🧪 Running the Test Suite

We use **pytest** for both integration and unit tests.

To run the transaction and endpoint tests:
```bash
# Run submit-bid-tx unit tests
PYTHONPATH=. python3 -m pytest tests/unit/test_submit_bid_tx.py -vv

# Run all API integration tests
PYTHONPATH=. python3 -m pytest tests/integration/test_api.py -vv
```

---

## 📁 Key File References

* **Alembic Migration Script:** [02bdc72a8c3d_add_near_account_id_and_device_token.py](file:///home/penivera/Projects/sheda/backend/alembic/versions/02bdc72a8c3d_add_near_account_id_and_device_token.py)
* **Celery Configuration:** [celery_config.py](file:///home/penivera/Projects/sheda/backend/core/celery_config.py)
* **Celery Transactions Tasks:** [transactions.py](file:///home/penivera/Projects/sheda/backend/app/tasks/transactions.py)
* **Lifespan Startup Logic:** [starter.py](file:///home/penivera/Projects/sheda/backend/core/starter.py)
