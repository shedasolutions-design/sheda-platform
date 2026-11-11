"""
Cloudflare Workers entry point.

Hands every request to the same FastAPI app the servers run (main.py). The
Worker-specific behaviour lives where it is needed, switched on by
core.runtime.ON_WORKERS: the database driver (core/database.py), the shared
key-value store (core/kv.py), background tasks (core/inline_tasks.py) and
email over HTTP (app/utils/brevo.py).
"""

from workers import WorkerEntrypoint, asgi

from main import app


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        return await asgi.fetch(app, request, self.env, self.ctx)
