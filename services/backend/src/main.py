"""
The FastAPI application.

Built in two layers so the same code serves a server and Cloudflare Workers:

- create_base_app(): the app with its middleware, static files and error
  handling, and no routes.
- ROUTE_GROUPS / include_routes_for(): the routes, grouped by URL prefix and
  imported only when a group is first needed.

A server uses create_app(), which is the base plus every group, the same app
as before. `main:app` (gunicorn, uvicorn) and `from main import app` (tests)
get that, built on first access.

The Worker (worker.py) instead builds the base at start-up and adds each group
on the first request for it. A Worker's start-up has a memory limit and each
request a CPU limit; importing every router at once exceeds one or the other.
"""

import importlib
import os

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from slowapi.errors import RateLimitExceeded

from core.configs import settings
from core.logger import get_logger
from core.middleware.error import ErrorHandlerMiddleware, setup_exception_handlers
from core.middleware.rate_limit import (
    RateLimitMiddleware,
    limiter,  # noqa: F401 - imported for its side effect of creating the limiter
    rate_limit_exceeded_handler,
)
from core.starter import lifespan

logger = get_logger(__name__)

# Initialize Jinja2 templates
templates = Jinja2Templates(directory=os.path.join(settings.BASE_DIR, "templates"))


# Route groups: (path prefix under API_V_STR, router modules in app.routers).
# Order is the order a full app includes them in. "/users" must come before
# "/user", or a request for /users would match the /user group.
ROUTE_GROUPS: list[tuple[str, list[str]]] = [
    ("/auth", ["auth"]),
    ("/users", ["wallets"]),
    ("/user", ["user"]),
    ("/property", ["listing"]),
    ("/chat", ["chat", "websocket"]),
    ("/media", ["media"]),
    ("/rating", ["rating"]),
    ("/transactions", ["transactions", "transactions_enhanced"]),
    ("/notifications", ["notifications", "notifications_enhanced", "websocket"]),
    ("/health", ["health"]),
    ("/minted-properties", ["minted_property"]),
    ("/indexer", ["indexer"]),
    ("/collections", ["collections"]),
]

# Paths that need every route: the generated API docs and schema.
_NEEDS_ALL = ("/sheda-docs", "/docs", "/redoc", "/openapi.json")


def create_base_app() -> FastAPI:
    app = FastAPI(
        lifespan=lifespan,  # type: ignore
        title="Sheda Solutions Backend",
        version="0.1.0",
        docs_url="/sheda-docs",
        description="Backend for Sheda Solutions",
        debug=settings.DEBUG_MODE,
        servers=(
            [
                {"url": settings.DEV_URL, "description": "Local Development"},
                {"url": settings.PROD_URL, "description": "Production Server"},
            ]
            if settings.DEBUG_MODE
            else [
                {"url": settings.PROD_URL, "description": "Production Server"},
                {"url": settings.DEV_URL, "description": "Local Development"},
            ]
        ),
    )
    app.state.included_routers = set()
    app.state.admin_mounted = False

    # static/ is committed; no need to create it (and Workers' bundle is read-only).
    _static = os.path.join(settings.BASE_DIR, "static")
    if os.path.isdir(_static):
        app.mount("/static", StaticFiles(directory=_static), name="static")

    # NOTE - Add rate limiting middleware
    app.add_middleware(RateLimitMiddleware)

    # NOTE - Add error handling middleware
    app.add_middleware(ErrorHandlerMiddleware)

    # NOTE - Fully permissive CORS (dev only, restrict in production)
    #
    # Registered LAST on purpose. Starlette makes the most recently added
    # middleware the outermost one, so anything added after this would produce
    # its responses outside the CORS layer — and those responses go out with no
    # Access-Control-Allow-Origin header.
    #
    # That's what made every 5xx on this API show up in the browser as a CORS
    # error instead of the actual failure: ErrorHandlerMiddleware was outside
    # CORSMiddleware, so its 500s were unreadable to the client and the real
    # cause (an IntegrityError deleting a property) was invisible.
    #
    # Keep CORSMiddleware last.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # NOTE - Setup exception handlers for proper error responses
    setup_exception_handlers(app)

    # NOTE - Register rate limit exceeded handler
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

    # NOTE - Custom 404 handler
    @app.exception_handler(404)
    async def custom_404_handler(request: Request, exc: HTTPException):
        if request.url.path.startswith(settings.API_V_STR):
            from fastapi.responses import JSONResponse

            return JSONResponse(status_code=404, content={"detail": exc.detail})
        return templates.TemplateResponse(request, "404.html", status_code=404)

    return app


def _include(app: FastAPI, module_name: str) -> None:
    if module_name in app.state.included_routers:
        return
    try:
        module = importlib.import_module(f"app.routers.{module_name}")
    except ImportError:
        # The "enhanced" routers have always been optional.
        if module_name.endswith("_enhanced"):
            app.state.included_routers.add(module_name)
            return
        raise
    app.include_router(module.router, prefix=settings.API_V_STR)
    app.state.included_routers.add(module_name)
    # FastAPI caches the generated schema; routes were just added.
    app.openapi_schema = None


def _mount_admin(app: FastAPI) -> None:
    if app.state.admin_mounted:
        return
    from core.admin.admin import admin

    admin.mount_to(app)
    app.state.admin_mounted = True


def include_all_routes(app: FastAPI) -> None:
    for _prefix, modules in ROUTE_GROUPS:
        for name in modules:
            _include(app, name)
    _mount_admin(app)


def include_routes_for(app: FastAPI, path: str) -> None:
    """Make sure the routes that could serve `path` are on the app."""
    if path.startswith(_NEEDS_ALL):
        include_all_routes(app)
        return
    if path.startswith(settings.ADMIN_ROUTE):
        _mount_admin(app)
        return
    api = settings.API_V_STR.rstrip("/")
    for prefix, modules in ROUTE_GROUPS:
        full = api + prefix
        if path == full or path.startswith(full + "/"):
            for name in modules:
                _include(app, name)
            return
    # Health is also served without the API prefix.
    if path.startswith("/health"):
        _include(app, "health")


def create_app() -> FastAPI:
    app = create_base_app()
    include_all_routes(app)
    logger.info("FastAPI application initialized successfully")
    return app


_app = None


def __getattr__(name: str):
    # `main.app` is built on first access, so importing this module (as the
    # Worker does) does not import every router.
    if name == "app":
        global _app
        if _app is None:
            _app = create_app()
        return _app
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
