"""
The task app every task module imports (`from core.celery_config import app`).

Celery (core/celery_server.py) when REDIS_URL gives it a broker. Otherwise,
and always on Cloudflare Workers, an in-process runner with the same interface
(core/inline_tasks.py), so the API runs with nothing but its database.
"""

from core.configs import settings
from core.runtime import ON_WORKERS

if ON_WORKERS or not settings.REDIS_URL:
    from core.inline_tasks import app  # noqa: F401
else:
    from core.celery_server import app  # noqa: F401
