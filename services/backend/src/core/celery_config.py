"""
The task app every task module imports (`from core.celery_config import app`).

On a server it is Celery (core/celery_server.py). On Cloudflare Workers, which
cannot reach a broker, it is an in-process runner with the same interface
(core/inline_tasks.py).
"""

from core.runtime import ON_WORKERS

if ON_WORKERS:
    from core.inline_tasks import app  # noqa: F401
else:
    from core.celery_server import app  # noqa: F401
