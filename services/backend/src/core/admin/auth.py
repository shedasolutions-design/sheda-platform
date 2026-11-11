import base64
import hashlib
import hmac
import struct
import time

from starlette_admin.auth import AuthProvider, AdminConfig, AdminUser as StarletteAdminUser
from starlette_admin.exceptions import LoginFailed
from starlette.requests import Request
from starlette.responses import Response
from sqlalchemy import select
from app.models.user import Admin
from core.configs import settings
from core.database import AsyncSessionLocal
from app.utils.utils import verify_password

# Wrong guesses allowed before a lockout, and how long it lasts.
MAX_FAILURES = 5
LOCKOUT_SECONDS = 15 * 60
FAILED_LOGIN = "Invalid username, password or code"


def _client_ip(request: Request) -> str:
    # Behind Railway's proxy; gunicorn trusts X-Forwarded-For (forwarded-allow-ips).
    return request.client.host if request.client else "unknown"


def _totp_ok(secret: str, code: str, window: int = 1) -> bool:
    """RFC 6238 TOTP (what Google Authenticator uses): 6 digits, 30 s steps,
    one step of clock drift either way."""
    code = "".join(ch for ch in (code or "") if ch.isdigit())
    if len(code) != 6:
        return False
    try:
        key = base64.b32decode(secret.strip().replace(" ", "").upper() + "=" * (-len(secret.strip().replace(" ", "")) % 8))
    except Exception:
        return False
    step = int(time.time()) // 30
    for offset in range(-window, window + 1):
        digest = hmac.new(key, struct.pack(">Q", step + offset), hashlib.sha1).digest()
        o = digest[-1] & 0x0F
        value = (struct.unpack(">I", digest[o : o + 4])[0] & 0x7FFFFFFF) % 1_000_000
        if hmac.compare_digest(f"{value:06d}", code):
            return True
    return False


async def _kv():
    from core.database import get_redis

    return await get_redis()


async def _failures(key: str) -> int:
    raw = await (await _kv()).get(key)
    if isinstance(raw, bytes):
        raw = raw.decode()
    return int(raw or 0)


class AdminAuthProvider(AuthProvider):
    async def is_authenticated(self, request: Request) -> bool:
        """Logged in, and (when an allow-list is set) from an allowed address."""
        if not self._ip_allowed(request):
            return False
        return request.session.get("admin_user") is not None

    @staticmethod
    def _ip_allowed(request: Request) -> bool:
        allowed = [ip.strip() for ip in (settings.ADMIN_ALLOWED_IPS or "").split(",") if ip.strip()]
        return not allowed or _client_ip(request) in allowed

    async def login(
        self,
        username: str,
        password: str,
        remember_me: bool,
        request: Request,
        response: Response,
    ) -> Response:
        if not self._ip_allowed(request):
            raise LoginFailed("Sign-in isn't available from this network.")

        username = (username or "").strip()
        ip_key = f"admin:fail:ip:{_client_ip(request)}"
        user_key = f"admin:fail:user:{username.lower()}"
        # Counted per address and per username, so neither one guesser nor a
        # spread of addresses can keep trying the same account.
        if max(await _failures(ip_key), await _failures(user_key)) >= MAX_FAILURES:
            raise LoginFailed("Too many failed attempts. Try again in 15 minutes.")

        form = await request.form()
        code = str(form.get("otp") or "")

        async with AsyncSessionLocal() as session:
            admin_user = (
                await session.execute(select(Admin).where(Admin.username == username))
            ).scalar_one_or_none()

        ok = bool(admin_user) and verify_password(password or "", admin_user.password)
        if ok and settings.ADMIN_TOTP_SECRET:
            ok = _totp_ok(settings.ADMIN_TOTP_SECRET, code)

        if not ok:
            kv = await _kv()
            for key in (ip_key, user_key):
                await kv.set(key, await _failures(key) + 1, ex=LOCKOUT_SECONDS)
            raise LoginFailed(FAILED_LOGIN)

        await (await _kv()).delete(ip_key, user_key)
        # Fresh session on sign-in, holding only what the panel displays.
        request.session.clear()
        request.session["admin_user"] = {
            "id": admin_user.id,
            "email": admin_user.email,
            "username": admin_user.username,
            "avatar_url": admin_user.avatar_url or str(request.url_for("static", path="sheda-solutions.png")),
        }
        return response

    async def logout(self, request: Request, response: Response) -> Response:
        """Clear the session on logout."""
        request.session.clear()
        return response

    def get_admin_config(self, request: Request) -> AdminConfig:
        user = request.session["admin_user"]
        return AdminConfig(
            app_title="Hello, " + user.get("username", "There") + "!",
            logo_url=user.get("avatar_url", None),
        )

    def get_admin_user(self, request: Request) -> StarletteAdminUser:
        user = request.session["admin_user"]
        return StarletteAdminUser(username=user["username"], photo_url=user.get("avatar_url"))
