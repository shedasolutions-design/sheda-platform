import os
import sys
import importlib.metadata

_orig_metadata_version = importlib.metadata.version


def _safe_metadata_version(package_name: str) -> str:
    if package_name in ("email-validator", "email_validator"):
        return "2.3.0"
    if package_name == "pg8000":
        return "1.31.5"
    try:
        return _orig_metadata_version(package_name)
    except importlib.metadata.PackageNotFoundError:
        return "99.0.0"


importlib.metadata.version = _safe_metadata_version

try:
    import anyio
    import anyio._backends._asyncio
    from anyio._core._eventloop import get_async_backend

    get_async_backend("asyncio")
except Exception:
    pass

try:
    import fastapi._compat.shared

    fastapi._compat.shared.is_pydantic_v1_model_class = lambda cls: False
    fastapi._compat.shared.annotation_is_pydantic_v1 = lambda annotation: False
except Exception:
    pass

try:
    import json
    from core.openapi_schema import OPENAPI_SCHEMA

    _OPENAPI_JSON_STR = json.dumps(OPENAPI_SCHEMA) if OPENAPI_SCHEMA else None
except Exception:
    OPENAPI_SCHEMA = None
    _OPENAPI_JSON_STR = None

_loaded_routers: set[str] = set()

try:
    import core.database
    import jwt
    import app.services.user_service
    import app.services.listing
except Exception:
    pass


def create_base_app():
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse
    from fastapi.exceptions import HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from core.configs import settings
    from core.starter import lifespan
    from core.middleware.error import (
        ErrorHandlerMiddleware,
        setup_exception_handlers,
    )
    from core.middleware.rate_limit import (
        RateLimitMiddleware,
        rate_limit_exceeded_handler,
    )
    from slowapi.errors import RateLimitExceeded
    from fastapi.staticfiles import StaticFiles
    from fastapi.templating import Jinja2Templates

    templates_dir = os.path.join(settings.BASE_DIR, "templates")
    if not os.path.isdir(templates_dir):
        try:
            os.makedirs(templates_dir, exist_ok=True)
        except OSError:
            pass
    templates = (
        Jinja2Templates(directory=templates_dir)
        if os.path.isdir(templates_dir)
        else None
    )

    try:
        from core.openapi_schema import OPENAPI_SCHEMA
    except ImportError:
        OPENAPI_SCHEMA = None

    app = FastAPI(
        lifespan=lifespan,  # type: ignore
        title="Sheda Solutions Backend",
        version="0.1.0",
        docs_url="/sheda-docs",
        openapi_url="/openapi.json",
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

    if OPENAPI_SCHEMA:
        app.openapi = lambda: OPENAPI_SCHEMA

    if _OPENAPI_JSON_STR:
        from fastapi.responses import Response as _FastAPIResponse

        @app.get("/openapi.json", include_in_schema=False)
        async def fast_openapi_endpoint():
            return _FastAPIResponse(
                content=_OPENAPI_JSON_STR,
                media_type="application/json",
            )

    @app.get("/docs", include_in_schema=False)
    async def docs_redirect():
        from fastapi.responses import RedirectResponse

        return RedirectResponse(url="/sheda-docs")

    static_dir = os.path.join(settings.BASE_DIR, "static")
    if not os.path.isdir(static_dir):
        try:
            os.makedirs(static_dir, exist_ok=True)
        except OSError:
            pass
    if os.path.isdir(static_dir):
        app.mount("/static", StaticFiles(directory=static_dir), name="static")

    # NOTE - Fully permissive CORS (dev only, restrict in production)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # NOTE - Add rate limiting middleware
    app.add_middleware(RateLimitMiddleware)

    # NOTE - Add error handling middleware
    app.add_middleware(ErrorHandlerMiddleware)

    # NOTE - Setup exception handlers for proper error responses
    setup_exception_handlers(app)

    # NOTE - Register rate limit exceeded handler
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

    # NOTE - Custom 404 handler
    @app.exception_handler(404)
    async def custom_404_handler(request: Request, exc: HTTPException):
        if templates and not request.url.path.startswith(settings.API_V_STR):
            try:
                return templates.TemplateResponse(
                    request, "404.html", status_code=404
                )
            except Exception:
                pass
        return JSONResponse(status_code=404, content={"detail": exc.detail})

    return app


def get_base_app():
    global _raw_app
    if _raw_app is None:
        _raw_app = create_base_app()
    return _raw_app


def load_router_for_path(app, path: str) -> None:
    from core.configs import settings

    api = settings.API_V_STR.rstrip("/")  # e.g. "/api/v1"

    if path.startswith(f"{api}/auth") and "auth" not in _loaded_routers:
        from app.routers import auth

        app.include_router(auth.router, prefix=settings.API_V_STR)
        _loaded_routers.add("auth")

    # NOTE: /users must be checked BEFORE /user to avoid prefix collision
    elif path.startswith(f"{api}/users") and "wallets" not in _loaded_routers:
        from app.routers import wallets

        app.include_router(wallets.router, prefix=settings.API_V_STR)
        _loaded_routers.add("wallets")

    elif path.startswith(f"{api}/user") and "user" not in _loaded_routers:
        from app.routers import user

        app.include_router(user.router, prefix=settings.API_V_STR)
        _loaded_routers.add("user")

    elif path.startswith(f"{api}/property") and "listing" not in _loaded_routers:
        from app.routers import listing

        app.include_router(listing.router, prefix=settings.API_V_STR)
        _loaded_routers.add("listing")

    elif path.startswith(f"{api}/chat") and "chat" not in _loaded_routers:
        from app.routers import chat

        app.include_router(chat.router, prefix=settings.API_V_STR)
        _loaded_routers.add("chat")
        # Websocket routes also live under /chat/ prefix
        if "websocket" not in _loaded_routers:
            try:
                from app.routers import websocket

                app.include_router(websocket.router, prefix=settings.API_V_STR)
            except Exception:
                pass
            _loaded_routers.add("websocket")

    elif path.startswith(f"{api}/media") and "media" not in _loaded_routers:
        from app.routers import media

        app.include_router(media.router, prefix=settings.API_V_STR)
        _loaded_routers.add("media")

    elif (
        path.startswith(f"{api}/ws") or path.startswith("/ws")
    ) and "websocket" not in _loaded_routers:
        from app.routers import websocket

        app.include_router(websocket.router, prefix=settings.API_V_STR)
        _loaded_routers.add("websocket")

    elif path.startswith(f"{api}/rating") and "rating" not in _loaded_routers:
        from app.routers import rating

        app.include_router(rating.router, prefix=settings.API_V_STR)
        _loaded_routers.add("rating")

    elif (
        path.startswith(f"{api}/transactions")
        and "transactions" not in _loaded_routers
    ):
        from app.routers import transactions

        app.include_router(transactions.router, prefix=settings.API_V_STR)
        try:
            from app.routers import transactions_enhanced

            app.include_router(transactions_enhanced.router, prefix=settings.API_V_STR)
        except Exception:
            pass
        _loaded_routers.add("transactions")

    elif (
        path.startswith(f"{api}/notifications")
        and "notifications" not in _loaded_routers
    ):
        from app.routers import notifications

        app.include_router(notifications.router, prefix=settings.API_V_STR)
        try:
            from app.routers import notifications_enhanced

            app.include_router(notifications_enhanced.router, prefix=settings.API_V_STR)
        except Exception:
            pass
        _loaded_routers.add("notifications")
        # Websocket routes also live under /notifications/ prefix
        if "websocket" not in _loaded_routers:
            try:
                from app.routers import websocket

                app.include_router(websocket.router, prefix=settings.API_V_STR)
            except Exception:
                pass
            _loaded_routers.add("websocket")

    elif (
        path.startswith(f"{api}/minted-properties")
        and "minted_property" not in _loaded_routers
    ):
        from app.routers import minted_property

        app.include_router(minted_property.router, prefix=settings.API_V_STR)
        _loaded_routers.add("minted_property")

    elif path.startswith(f"{api}/indexer") and "indexer" not in _loaded_routers:
        from app.routers import indexer

        app.include_router(indexer.router, prefix=settings.API_V_STR)
        _loaded_routers.add("indexer")

    elif (
        path.startswith(f"{api}/health")
        or path.startswith("/health")
        or path in ("/live", "/ready")
    ) and "health" not in _loaded_routers:
        try:
            from app.routers import health

            app.include_router(health.router, prefix=settings.API_V_STR)
            app.include_router(health.router)
        except Exception:
            pass
        _loaded_routers.add("health")

    elif path.startswith("/sheda-backend") and "admin" not in _loaded_routers:
        try:
            from core.admin.admin import admin

            admin.mount_to(app)
        except Exception:
            pass
        _loaded_routers.add("admin")

    elif path in ("/docs", "/redoc", "/sheda-docs"):
        load_all_routers(app)


def load_all_routers(app) -> None:
    for target in [
        "/api/v1/auth",
        "/api/v1/user",
        "/api/v1/property",
        "/api/v1/chat",
        "/api/v1/media",
        "/api/v1/ws",
        "/api/v1/rating",
        "/api/v1/transactions",
        "/api/v1/notifications",
        "/api/v1/users",
        "/api/v1/minted-properties",
        "/api/v1/indexer",
        "/api/v1/health",
        "/sheda-backend",
    ]:
        load_router_for_path(app, target)


_raw_app = create_base_app()
load_router_for_path(_raw_app, "/health")
load_router_for_path(_raw_app, "/api/v1/health")


class _AppWrapper:
    def __getattr__(self, name):
        return getattr(get_base_app(), name)

    async def __call__(self, scope, receive, send):
        raw = get_base_app()
        if scope["type"] in ("http", "websocket"):
            load_router_for_path(raw, scope.get("path", ""))
        return await raw(scope, receive, send)


app = _AppWrapper()


def get_app():
    raw = get_base_app()
    load_all_routers(raw)
    return raw


def create_app():
    return get_app()


if "pytest" in sys.modules or "PYTEST_CURRENT_TEST" in os.environ:
    get_app()


try:
    import js
    from workers import asgi, WorkerEntrypoint, Response

    class Default(WorkerEntrypoint):
        async def fetch(self, request):
            try:
                from urllib.parse import urlparse

                path = (
                    urlparse(request.url).path
                    if hasattr(request, "url")
                    else ""
                )

                if path == "/openapi.json" and _OPENAPI_JSON_STR:
                    return Response(
                        _OPENAPI_JSON_STR,
                        headers={"content-type": "application/json"},
                    ).js_object

                application = get_base_app()
                load_router_for_path(application, path)

                if (request.headers.get("upgrade") or "").lower() == "websocket":
                    return await asgi.websocket(application, request, self.env)
                return await asgi.fetch(application, request, self.env, self.ctx)
            except Exception:
                import traceback

                tb = traceback.format_exc()
                try:
                    js.console.error(f"Worker Fetch Error:\n{tb}")
                except Exception:
                    pass
                return Response(
                    f"Worker Fetch Error:\n{tb}", status=500
                ).js_object

except (ImportError, ModuleNotFoundError):
    pass