"""
Celery configuration for background task processing.
Enables asynchronous execution of long-running operations like email/SMS and notifications.
"""

from celery import Celery
from celery.schedules import crontab
from kombu import Exchange, Queue
import os

from core.configs import settings
from core.logger import get_logger

logger = get_logger(__name__)

# Initialize Celery app
app = Celery(
    "sheda",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

# Configuration
app.conf.update(
    # Task settings
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Result backend settings
    result_expires=3600,  # 1 hour
    result_backend_transport_options={
        "master_name": "sheda",
        "retry_on_timeout": True,
    },
    # Task execution settings
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_track_started=True,
    # Worker settings
    worker_prefetch_multiplier=4,
    worker_max_tasks_per_child=1000,
    # Broker settings
    broker_connection_retry_on_startup=True,
    broker_connection_retry=True,
    broker_pool_limit=10,
    # Routing
    task_routes={
        "app.tasks.email.*": {"queue": "email"},
        "app.tasks.notifications.*": {"queue": "notifications"},
        "app.tasks.transactions.*": {"queue": "transactions"},
        "app.tasks.documents.*": {"queue": "documents"},
    },
)

# Define queues with priority
default_exchange = Exchange("default", type="direct")
email_exchange = Exchange("email", type="direct")
notification_exchange = Exchange("notifications", type="direct")
transaction_exchange = Exchange("transactions", type="direct")
document_exchange = Exchange("documents", type="direct")

app.conf.task_queues = (
    Queue("default", exchange=default_exchange, routing_key="default", priority=5),
    Queue("email", exchange=email_exchange, routing_key="email", priority=10),
    Queue(
        "notifications",
        exchange=notification_exchange,
        routing_key="notifications",
        priority=8,
    ),
    Queue(
        "transactions",
        exchange=transaction_exchange,
        routing_key="transactions",
        priority=15,
    ),
    Queue("documents", exchange=document_exchange, routing_key="documents", priority=5),
)

# Periodic tasks (beat schedule)
app.conf.beat_schedule = {
    "check-payment-timeouts": {
        "task": "app.tasks.transactions.check_payment_timeouts",
        "schedule": crontab(minute="*/5"),  # Every 5 minutes
    },
    "send-appointment-reminders": {
        "task": "app.tasks.notifications.send_appointment_reminders",
        "schedule": crontab(hour="*/2"),  # Every 2 hours
    },
    "cleanup-expired-kyc": {
        "task": "app.tasks.documents.cleanup_expired_kyc",
        "schedule": crontab(hour=1, minute=0),  # Daily at 1 AM
    },
    "sync-blockchain-events": {
        "task": "app.tasks.transactions.sync_blockchain_events",
        "schedule": crontab(minute="*/10"),  # Every 10 minutes
    },
    "expire-contracts": {
        "task": "app.tasks.transactions.expire_contracts",
        "schedule": crontab(hour=0, minute=0),  # Daily at midnight
    },
}


# Task auto-discovery (discovers tasks in app/tasks/*.py)
app.autodiscover_tasks(["app.tasks"])


# Signal handlers
@app.task(bind=True)
def debug_task(self):
    """Debug task for testing Celery."""
    logger.info(f"Request: {self.request!r}")
