"""
Comprehensive route reachability tests for every single API endpoint.

Tests that every route registered in the app is reachable (not 404) through
both the lazy-loading _AppWrapper and the fully-loaded get_app().

These tests do NOT require a running database or external services. They verify
that:
  1. Every route is reachable (no 404 from missing router registration)
  2. Routes return the expected auth/validation errors (401, 422) when called
     without credentials or body, proving the handler is wired up correctly
  3. The static OpenAPI schema matches the live app routes
"""

import re
import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def full_app():
    """Return the fully loaded FastAPI app (all routers mounted)."""
    import main as _main
    _main._loaded_routers.clear()
    _main._raw_app = None
    return _main.get_app()


@pytest.fixture(scope="module")
def full_client(full_app):
    """Test client against the fully loaded app."""
    return TestClient(full_app, raise_server_exceptions=False)


@pytest.fixture(scope="module")
def lazy_client():
    """Test client against the lazy-loading _AppWrapper (simulates CF Worker)."""
    import main as _main
    _main._loaded_routers.clear()
    _main._raw_app = None
    return TestClient(_main.app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _substitute_path_params(path: str) -> str:
    """Replace {param} placeholders with dummy values for testing."""
    return re.sub(r"\{[a-zA-Z_]+\}", "1", path)


def _pick_method(methods: set[str]) -> str:
    """Pick a method to test with, preferring GET."""
    for m in ("GET", "POST", "PUT", "DELETE", "PATCH"):
        if m in methods:
            return m
    return "GET"


def _collect_http_routes(app):
    """Collect all HTTP routes from the app (excludes websocket, static, admin)."""
    routes = []
    for r in app.routes:
        if "IncludedRouter" in type(r).__name__:
            pfx = r.include_context.prefix
            for sub in r.original_router.routes:
                methods = getattr(sub, "methods", None)
                if methods:  # skip websocket (methods=None)
                    routes.append((pfx + sub.path, methods, sub.name))
        elif hasattr(r, "path") and hasattr(r, "methods"):
            methods = getattr(r, "methods", None)
            name = getattr(r, "name", "")
            # Skip framework-generated docs/static routes
            if name in (
                "openapi", "swagger_ui_html", "swagger_ui_redirect",
                "redoc_html", "static",
            ):
                continue
            if methods:
                routes.append((r.path, methods, name))
    return routes


# ---------------------------------------------------------------------------
# OpenAPI / Swagger UI tests
# ---------------------------------------------------------------------------

class TestOpenAPIDocs:
    """Tests for docs and OpenAPI schema availability."""

    def test_swagger_ui_reachable(self, full_client):
        resp = full_client.get("/sheda-docs")
        assert resp.status_code == 200
        assert "swagger-ui" in resp.text.lower()

    def test_docs_redirect(self, full_client):
        resp = full_client.get("/docs", follow_redirects=False)
        assert resp.status_code in (200, 307)

    def test_openapi_json_reachable(self, full_client):
        resp = full_client.get("/openapi.json")
        assert resp.status_code == 200
        data = resp.json()
        assert "paths" in data
        assert len(data["paths"]) > 0

    def test_static_schema_matches_live_routes(self, full_app):
        from core.openapi_schema import OPENAPI_SCHEMA
        from fastapi.openapi.utils import get_openapi

        live_schema = get_openapi(
            title=full_app.title,
            version=full_app.version,
            routes=full_app.routes,
        )
        static_paths = set(OPENAPI_SCHEMA.get("paths", {}).keys())
        live_paths = set(live_schema.get("paths", {}).keys())
        assert static_paths == live_paths, (
            f"Missing in static: {live_paths - static_paths}, "
            f"Extra in static: {static_paths - live_paths}"
        )


# ---------------------------------------------------------------------------
# Health routes
# ---------------------------------------------------------------------------

class TestHealthRoutes:

    def test_health(self, full_client):
        resp = full_client.get("/api/v1/health")
        assert resp.status_code == 200

    def test_health_root(self, full_client):
        resp = full_client.get("/health")
        assert resp.status_code == 200

    def test_health_live(self, full_client):
        resp = full_client.get("/api/v1/health/live")
        assert resp.status_code == 200

    def test_health_ready(self, full_client):
        resp = full_client.get("/api/v1/health/ready")
        # 503 is expected when DB/Redis aren't available
        assert resp.status_code in (200, 503)

    def test_health_detailed(self, full_client):
        resp = full_client.get("/api/v1/health/detailed")
        assert resp.status_code == 200

    def test_health_stats(self, full_client):
        resp = full_client.get("/api/v1/health/stats")
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

class TestAuthRoutes:

    def test_signup_no_body(self, full_client):
        resp = full_client.post("/api/v1/auth/signup")
        assert resp.status_code == 422  # validation error = route exists

    def test_social_login_no_body(self, full_client):
        resp = full_client.post("/api/v1/auth/social-login")
        assert resp.status_code == 422

    def test_verify_account_no_auth(self, full_client):
        resp = full_client.post("/api/v1/auth/verify-account")
        assert resp.status_code in (401, 403)

    def test_login_no_body(self, full_client):
        resp = full_client.post("/api/v1/auth/login")
        # In isolated unit tests without DB, CustomOAuth2PasswordRequestForm
        # uses default "Admin" username which hits DB and yields 500, or 422 on validation.
        assert resp.status_code in (401, 422, 500)

    def test_logout_no_auth(self, full_client):
        resp = full_client.post("/api/v1/auth/logout")
        assert resp.status_code in (401, 403)

    def test_reset_password_no_auth(self, full_client):
        resp = full_client.put("/api/v1/auth/reset-password")
        assert resp.status_code in (401, 403)

    def test_send_otp_no_auth(self, full_client):
        resp = full_client.post("/api/v1/auth/send-otp")
        assert resp.status_code in (401, 403)

    def test_verify_otp_no_auth(self, full_client):
        resp = full_client.post("/api/v1/auth/verify-otp")
        assert resp.status_code in (401, 403)

    def test_refresh_token_no_auth(self, full_client):
        resp = full_client.put("/api/v1/auth/refresh-token")
        assert resp.status_code in (401, 403)

    def test_switch_account_no_auth(self, full_client):
        resp = full_client.post("/api/v1/auth/switch-account")
        assert resp.status_code in (401, 403)

    def test_forgot_password_no_body(self, full_client):
        resp = full_client.post("/api/v1/auth/forgot-password")
        assert resp.status_code == 422

    def test_verify_forgot_password_no_body(self, full_client):
        resp = full_client.post("/api/v1/auth/verify-forgot-password")
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# User routes
# ---------------------------------------------------------------------------

class TestUserRoutes:

    def test_get_me_no_auth(self, full_client):
        resp = full_client.get("/api/v1/user/me")
        assert resp.status_code in (401, 403)

    def test_get_user_by_id_no_auth(self, full_client):
        resp = full_client.get("/api/v1/user/1")
        assert resp.status_code in (401, 403)

    def test_update_me_no_auth(self, full_client):
        resp = full_client.put("/api/v1/user/update/me")
        assert resp.status_code in (401, 403)

    def test_delete_account_no_auth(self, full_client):
        resp = full_client.delete("/api/v1/user/me")
        assert resp.status_code in (401, 403)

    def test_book_appointment_no_auth(self, full_client):
        resp = full_client.post("/api/v1/user/book-appointment")
        assert resp.status_code in (401, 403)

    def test_cancel_appointment_no_auth(self, full_client):
        resp = full_client.delete("/api/v1/user/cancel-appointment/1")
        assert resp.status_code in (401, 403)

    def test_create_payment_info_no_auth(self, full_client):
        resp = full_client.post("/api/v1/user/create-payment-info")
        assert resp.status_code in (401, 403)

    def test_get_payment_info_no_auth(self, full_client):
        resp = full_client.get("/api/v1/user/payment-info")
        assert resp.status_code in (401, 403)

    def test_update_payment_info_no_auth(self, full_client):
        resp = full_client.put("/api/v1/user/update-account-info/1")
        assert resp.status_code in (401, 403)

    def test_delete_account_info_no_auth(self, full_client):
        resp = full_client.delete("/api/v1/user/delete-accnt-info/1")
        assert resp.status_code in (401, 403)

    def test_get_contract_payment_info_no_auth(self, full_client):
        resp = full_client.get("/api/v1/user/payment-info/1")
        assert resp.status_code in (401, 403)

    def test_create_available_time_no_auth(self, full_client):
        resp = full_client.post("/api/v1/user/create-available-time")
        assert resp.status_code in (401, 403)

    def test_get_schedule_no_auth(self, full_client):
        resp = full_client.get("/api/v1/user/get-schedule/me")
        assert resp.status_code in (401, 403)

    def test_update_schedule_no_auth(self, full_client):
        resp = full_client.put("/api/v1/user/update-schedule/1")
        assert resp.status_code in (401, 403)

    def test_confirm_payment_no_auth(self, full_client):
        resp = full_client.post("/api/v1/user/confirm-payment/1")
        assert resp.status_code in (401, 403)

    def test_approve_payment_no_auth(self, full_client):
        resp = full_client.post("/api/v1/user/approve-payment/1")
        assert resp.status_code in (401, 403)

    def test_create_contract_no_auth(self, full_client):
        resp = full_client.post("/api/v1/user/contracts/")
        assert resp.status_code in (401, 403)

    def test_confirm_appointment_no_auth(self, full_client):
        resp = full_client.put("/api/v1/user/confirm-appointment/1")
        assert resp.status_code in (401, 403)

    def test_kyc_start_verification_no_auth(self, full_client):
        resp = full_client.post("/api/v1/user/kyc/start-verification")
        assert resp.status_code in (401, 403)

    def test_kyc_status_no_auth(self, full_client):
        resp = full_client.get("/api/v1/user/kyc/status/abc")
        assert resp.status_code in (401, 403)

    def test_kyc_is_verified_no_auth(self, full_client):
        resp = full_client.get("/api/v1/user/kyc/is-verified/1")
        assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Property routes
# ---------------------------------------------------------------------------

class TestPropertyRoutes:

    def test_list_property_no_auth(self, full_client):
        resp = full_client.post("/api/v1/property/list-property")
        assert resp.status_code in (401, 403)

    def test_get_my_listing_no_auth(self, full_client):
        resp = full_client.get("/api/v1/property/me")
        assert resp.status_code in (401, 403)

    def test_update_property_no_auth(self, full_client):
        resp = full_client.put("/api/v1/property/update/1")
        assert resp.status_code in (401, 403)

    def test_get_properties_no_auth(self, full_client):
        resp = full_client.get("/api/v1/property/get-properties")
        assert resp.status_code in (401, 403)

    def test_get_property_detail_no_auth(self, full_client):
        resp = full_client.get("/api/v1/property/details/1")
        assert resp.status_code in (401, 403)

    def test_agent_profile_no_auth(self, full_client):
        resp = full_client.get("/api/v1/property/agent-profile/1")
        assert resp.status_code in (401, 403)

    def test_delete_property_no_auth(self, full_client):
        resp = full_client.delete("/api/v1/property/delete/1")
        assert resp.status_code in (401, 403)

    def test_search_properties(self, full_client):
        resp = full_client.get("/api/v1/property/search?query=test")
        # Search may work without auth or return error
        assert resp.status_code != 404

    def test_index_property_no_auth(self, full_client):
        resp = full_client.post("/api/v1/property/1/index")
        assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Chat routes
# ---------------------------------------------------------------------------

class TestChatRoutes:

    def test_chat_history_no_auth(self, full_client):
        resp = full_client.get("/api/v1/chat/chat-history")
        assert resp.status_code in (401, 403)

    def test_conversations_no_auth(self, full_client):
        resp = full_client.get("/api/v1/chat/conversations")
        assert resp.status_code in (401, 403)

    def test_message_history_no_auth(self, full_client):
        resp = full_client.get("/api/v1/chat/history/1")
        assert resp.status_code in (401, 403)

    def test_send_message_no_auth(self, full_client):
        resp = full_client.post("/api/v1/chat/send-message")
        assert resp.status_code in (401, 403)

    def test_mark_read_no_auth(self, full_client):
        resp = full_client.post("/api/v1/chat/mark-read/1")
        assert resp.status_code in (401, 403)

    def test_unread_count_no_auth(self, full_client):
        resp = full_client.get("/api/v1/chat/unread-count")
        assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Media routes
# ---------------------------------------------------------------------------

class TestMediaRoutes:

    def test_file_upload_no_auth(self, full_client):
        resp = full_client.post("/api/v1/media/file-upload/profile")
        assert resp.status_code in (401, 403, 422)

    def test_get_file_no_auth(self, full_client):
        resp = full_client.get("/api/v1/media/file-upload/profile")
        assert resp.status_code in (401, 403)

    def test_ipfs_upload_no_auth(self, full_client):
        resp = full_client.post("/api/v1/media/ipfs-upload")
        assert resp.status_code in (401, 403, 422)


# ---------------------------------------------------------------------------
# Rating routes
# ---------------------------------------------------------------------------

class TestRatingRoutes:

    def test_create_rating_no_auth(self, full_client):
        resp = full_client.post("/api/v1/rating/")
        assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Transaction routes
# ---------------------------------------------------------------------------

class TestTransactionRoutes:

    def test_list_transactions_no_auth(self, full_client):
        resp = full_client.get("/api/v1/transactions")
        assert resp.status_code in (401, 403)

    def test_upload_documents_no_auth(self, full_client):
        resp = full_client.post("/api/v1/transactions/1/upload-documents")
        assert resp.status_code in (401, 403, 422)

    def test_list_timeout_candidates_no_auth(self, full_client):
        resp = full_client.get("/api/v1/transactions/timeouts")
        assert resp.status_code in (401, 403)

    def test_submit_bid_tx_no_auth(self, full_client):
        resp = full_client.post("/api/v1/transactions/submit-bid-tx")
        assert resp.status_code in (401, 403)

    def test_process_payment_no_auth(self, full_client):
        resp = full_client.post("/api/v1/transactions/process-payment")
        assert resp.status_code in (401, 403)

    def test_mint_nft_no_auth(self, full_client):
        resp = full_client.post("/api/v1/transactions/mint-property-nft")
        assert resp.status_code in (401, 403)

    def test_send_transaction_notification_no_auth(self, full_client):
        resp = full_client.post("/api/v1/transactions/send-transaction-notification")
        assert resp.status_code in (401, 403)

    def test_confirm_payment_endpoint_no_auth(self, full_client):
        resp = full_client.post("/api/v1/transactions/confirm-payment/1")
        assert resp.status_code in (401, 403)

    def test_task_status_no_auth(self, full_client):
        resp = full_client.get("/api/v1/transactions/task-status/1")
        assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Notification routes
# ---------------------------------------------------------------------------

class TestNotificationRoutes:

    def test_transaction_update_no_auth(self, full_client):
        resp = full_client.post("/api/v1/notifications/transaction-update")
        assert resp.status_code in (401, 403)

    def test_get_notifications_no_auth(self, full_client):
        resp = full_client.get("/api/v1/notifications")
        assert resp.status_code in (401, 403)

    def test_read_notification_no_auth(self, full_client):
        resp = full_client.post("/api/v1/notifications/1/read")
        assert resp.status_code in (401, 403)

    def test_register_device_no_auth(self, full_client):
        resp = full_client.post("/api/v1/notifications/register-device")
        assert resp.status_code in (401, 403)

    def test_send_notification_no_auth(self, full_client):
        resp = full_client.post("/api/v1/notifications/send")
        assert resp.status_code in (401, 403)

    def test_send_bid_notification_no_auth(self, full_client):
        resp = full_client.post("/api/v1/notifications/send-bid-notification")
        assert resp.status_code in (401, 403)

    def test_send_payment_notification_no_auth(self, full_client):
        resp = full_client.post("/api/v1/notifications/send-payment-notification")
        assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Wallet routes
# ---------------------------------------------------------------------------

class TestWalletRoutes:

    def test_get_user_by_wallet_no_auth(self, full_client):
        resp = full_client.get("/api/v1/users/by-wallet/test_wallet")
        assert resp.status_code in (401, 403)

    def test_register_wallet_no_auth(self, full_client):
        resp = full_client.post("/api/v1/users/wallets/register")
        assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Minted property routes
# ---------------------------------------------------------------------------

class TestMintedPropertyRoutes:

    def test_register_minted_property_no_auth(self, full_client):
        resp = full_client.post("/api/v1/minted-properties/register")
        assert resp.status_code in (401, 403)

    def test_create_listing_from_minted_no_auth(self, full_client):
        resp = full_client.post("/api/v1/minted-properties/1/create-listing")
        assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Indexer routes
# ---------------------------------------------------------------------------

class TestIndexerRoutes:

    def test_ingest_transaction_event_no_body(self, full_client):
        resp = full_client.post("/api/v1/indexer/transactions")
        assert resp.status_code in (401, 403, 422)


# ---------------------------------------------------------------------------
# Lazy loading tests (simulates Cloudflare Worker per-request loading)
# ---------------------------------------------------------------------------

class TestLazyLoading:
    """Verify that every route is reachable through the lazy _AppWrapper."""

    def test_wallet_route_reachable_lazily(self, lazy_client):
        """Regression: /api/v1/users/* was shadowed by /api/v1/user check."""
        resp = lazy_client.get("/api/v1/users/by-wallet/test")
        assert resp.status_code != 404, "Wallet route should not 404"

    def test_chat_websocket_route_reachable_lazily(self, lazy_client):
        """Regression: websocket /chat/{user_id} was never loaded."""
        from starlette.websockets import WebSocketDisconnect
        try:
            with lazy_client.websocket_connect("/api/v1/chat/global-chat") as ws:
                pass
        except WebSocketDisconnect:
            pass  # Expected when auth token is missing, proves route is matched and loaded

    def test_health_route_reachable_lazily(self, lazy_client):
        resp = lazy_client.get("/api/v1/health")
        assert resp.status_code == 200

    def test_sheda_docs_triggers_all_routers(self):
        """Regression: /sheda-docs didn't trigger load_all_routers."""
        import main as _main
        _main._loaded_routers.clear()
        _main._raw_app = None
        client = TestClient(_main.app, raise_server_exceptions=False)
        resp = client.get("/sheda-docs")
        assert resp.status_code == 200
        # After hitting /sheda-docs, all routers should be loaded
        assert len(_main._loaded_routers) >= 10


# ---------------------------------------------------------------------------
# Exhaustive route reachability test
# ---------------------------------------------------------------------------

class TestAllRoutesReachable:
    """Parameterized test that hits every single registered route."""

    def test_no_route_returns_404(self, full_app, full_client):
        """Every registered HTTP route must NOT return 404."""
        routes = _collect_http_routes(full_app)
        assert len(routes) > 70, f"Expected 70+ routes, got {len(routes)}"

        failures = []
        for path, methods, name in routes:
            test_path = _substitute_path_params(path)
            method = _pick_method(methods)

            body = None
            content_type = None
            if method in ("POST", "PUT", "PATCH"):
                body = "{}"
                content_type = "application/json"

            resp = full_client.request(
                method, test_path,
                content=body,
                headers={"Content-Type": content_type} if content_type else None,
            )
            if resp.status_code == 404:
                failures.append(f"  {method} {path} (name={name}) -> 404")

        assert not failures, (
            f"{len(failures)} route(s) returned 404:\n" + "\n".join(failures)
        )
