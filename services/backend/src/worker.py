"""
Cloudflare Workers entry point.

Serves the same FastAPI app the servers run, built in layers (see main.py):

- At start-up, which Cloudflare runs once at deploy and snapshots: the base
  app (middleware, error handling) and the shared heavy imports every route
  group needs anyway, i.e. the database layer and the models.
- Per request: the one route group the path belongs to, the first time it is
  asked for in this instance.

Loading everything at start-up exceeds the start-up memory limit; loading
everything inside one request exceeds the per-request CPU limit. This splits
the work between them.

Worker-specific behaviour elsewhere is switched on by core.runtime.ON_WORKERS:
the database driver (core/database.py), the shared key-value store
(core/kv.py), background tasks (core/inline_tasks.py) and email over HTTP
(app/utils/brevo.py).
"""

from urllib.parse import urlparse

from workers import WorkerEntrypoint, asgi

_app = None


def _get_app():
    global _app
    if _app is None:
        from main import create_base_app

        _app = create_base_app()
    return _app


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        from main import include_routes_for

        app = _get_app()
        include_routes_for(app, urlparse(request.url).path)
        return await asgi.fetch(app, request, self.env, self.ctx)
