import logging
import os
from datetime import timedelta
from typing import Optional, TYPE_CHECKING
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, computed_field

if TYPE_CHECKING:
    from passlib.context import CryptContext

_pwd_context = None


def _get_pwd_context():
    global _pwd_context
    if _pwd_context is None:
        import types
        import bcrypt

        # Workaround for passlib compatibility with bcrypt >= 4.0.0 where passlib reads bcrypt.__about__.__version__
        if not hasattr(bcrypt, "__about__"):
            bcrypt.__about__ = types.SimpleNamespace(
                __version__=getattr(bcrypt, "__version__", "4.0.0")
            )

        # bcrypt >= 4.0.0 raises ValueError on passwords > 72 bytes, which breaks passlib's detect_wrap_bug
        if not getattr(bcrypt, "_sheda_hashpw_patched", False):
            _orig_hashpw = bcrypt.hashpw

            def _safe_hashpw(password, salt):
                if password is None:
                    password = b""
                elif isinstance(password, str):
                    password = password.encode("utf-8")
                if len(password) > 72:
                    password = password[:72]
                return _orig_hashpw(password, salt)

            bcrypt.hashpw = _safe_hashpw
            bcrypt._sheda_hashpw_patched = True

        from passlib.context import CryptContext

        _pwd_context = CryptContext(
            schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=4
        )
    return _pwd_context


_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_ENV_FILE = os.path.join(_BASE_DIR, ".env")

load_dotenv(_ENV_FILE if os.path.exists(_ENV_FILE) else ".env")

# In Cloudflare Workers, environment variables are passed as worker bindings
try:
    from workers import env as cf_env

    try:
        import js

        for key in js.Object.keys(cf_env._env):
            k = str(key)
            val = getattr(cf_env, k, None)
            if isinstance(val, (str, int, float, bool)):
                os.environ.setdefault(k, str(val))
    except Exception:
        for key in dir(getattr(cf_env, "_env", cf_env)):
            if not key.startswith("_"):
                val = getattr(cf_env, key, None)
                if isinstance(val, (str, int, float, bool)):
                    os.environ.setdefault(key, str(val))
except Exception:
    pass


class Settings(BaseSettings):
    # Don't crash on additional keys in `.env` that aren't modeled here
    # (e.g., admin seeding vars used by `core.admin.seed`).
    model_config = SettingsConfigDict(
        env_file=(_ENV_FILE if os.path.exists(_ENV_FILE) else ".env"),
        extra="ignore",
    )

    @property
    def pwd_context(self) -> "CryptContext":
        return _get_pwd_context()

    # General description
    SIGN_UP_DESC: str = Field(
        default="Once accounts are created they are stored temporarily for 2 hours "
        "before deletion if email verification is not completed"
    )

    @property
    def BASE_DIR(self) -> str:
        parent = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if os.path.isfile(os.path.join(parent, "main.py")):
            return parent
        return os.path.dirname(parent)

    # Security
    SECRET_KEY: str = Field(
        default="54454527191979f6df07274b04b344efd91fed4481a45de250cd3b83c21c095f05c03087e9eeb3aa4208652619bd7685303f032cfcada370eb0273b3fcf992e6",
        description="JWT secret key",
    )
    ALGORITHM: str = Field(default="HS256", description="JWT algorithm")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=30, description="Access token expiration in minutes"
    )
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(
        default=7, description="Refresh token expiration in days"
    )

    # Debug mode
    DEBUG_MODE: bool = Field(default=False, description="Debug mode flag")

    # Email settings
    SMTP_USERNAME: str = Field(
        default="smtp-user@example.com", description="Email address for sending emails"
    )
    SMTP_PASSWORD: str = Field(
        default="smtp-password", description="App password for email"
    )
    SMTP_HOST: str = Field(default="smtp-relay.brevo.com", description="Email host")
    SMTP_PORT: int = Field(default=2525, description="Email port")
    SMTP_SEND_FROM_MAIL: str = Field(
        default="noreply@penivera.me", description="Email address for sending emails"
    )

    # Database
    DB_URL: str = Field(
        default="sqlite:///:memory:", description="Database connection URL"
    )
    AUTO_CREATE_TABLES: bool = Field(
        default=False, description="Auto-create database tables on startup (dev only)"
    )
    REDIS_URL: str = Field(
        default="redis://localhost:6379/0", description="Redis connection URL"
    )

    # External Services (Phase 2)
    # Firebase Cloud Messaging (Push Notifications)
    FCM_CREDENTIALS: Optional[str] = Field(
        default=None,
        description="Path to Firebase credentials JSON file (e.g., './firebase-credentials.json')",
    )

    # Persona API (KYC Verification)
    PERSONA_API_KEY: Optional[str] = Field(
        default=None,
        description="Persona API key for KYC verification (get from https://withpersona.com)",
    )
    PERSONA_ENVIRONMENT: str = Field(
        default="sandbox", description="Persona environment: 'sandbox' or 'production'"
    )

    # Social Login
    GOOGLE_CLIENT_ID: Optional[str] = Field(
        default=None, description="Google OAuth Client ID"
    )

    # Elasticsearch (Full-text Search)
    ELASTICSEARCH_URL: Optional[str] = Field(
        default="http://localhost:9200", description="Elasticsearch connection URL"
    )
    ELASTICSEARCH_INDEX: str = Field(
        default="sheda_properties",
        description="Elasticsearch index name for properties",
    )

    # NOTE -  Host URLs
    PROD_URL: str = Field(
        default="https://sheda-backend.up.railway.app/", description="Production Server"
    )
    DEV_URL: str = Field(
        default="http://localhost:8000", description="Development Server"
    )

    # Regex
    PHONE_REGEX: str = r"^\+?\d{10,15}$"

    # Verification
    VERIFICATION_CODE_EXP_MIN: int = Field(
        default=15, description="Verification code expiration in minutes"
    )

    # API
    API_V_STR: str = Field(default="/api/v1", description="API version prefix")

    # SECTION Cloudinary data

    CLOUDINARY_NAME: str = Field(default="dummy", description="Cloudinary database name")
    CLOUDINARY_API_KEY: str = Field(default="dummy", description="Cloudinary API key")
    CLOUDINARY_API_SECRET: str = Field(default="dummy", description="Cloudinary Api Key")
    CLOUDINARY_URL: str = Field(
        default="cloudinary://dummy:dummy@dummy", description="cloudinary url"
    )

    # PINATA Credentials
    PINATA_JWT: Optional[str] = Field(
        default=None, description="Pinata JWT used for v3 uploads"
    )
    PINATA_SECRET_API_KEY: str = Field(
        default="Nothing for now", description="Pinata secret api key"
    )
    PINATA_API_KEY: str = Field(default="Nothing for now", description="Pinata api key")
    PINATA_URL: str = Field(
        default="https://uploads.pinata.cloud/v3/files",
        description="Pinata url",
    )
    PINATA_GATEWAY_URL: str = Field(
        default="https://gateway.pinata.cloud",
        description="Base URL for Pinata gateway used to construct IPFS links",
    )

    # SECTION FastAdmin / Admin Seeding

    ADMIN_ROUTE: str = Field(default="/sheda-backend", description="FastAdmin route prefix")

    ADMIN_SEED_ENABLED: bool = Field(
        default=False, description="Enable admin seeding on startup"
    )
    ADMIN_SEED_USERNAME: str | None = Field(
        default=None, description="Username for seeded superadmin"
    )
    ADMIN_SEED_PASSWORD: str | None = Field(
        default=None, description="Password for seeded superadmin"
    )
    ADMIN_SEED_EMAIL: str | None = Field(
        default=None, description="Email for seeded superadmin"
    )
    ADMIN_USER_MODEL: str = Field(
        default="Admin", description="FastAdmin user model class name"
    )
    ADMIN_USER_MODEL_USERNAME_FIELD: str = Field(
        default="username", description="FastAdmin username field"
    )
    ADMIN_SECRET_KEY: str = Field(
        default="366471b72fa6926aac0f392b9bd261c492ca3899c76227ee889b2d6c72a3173c859b91dc34f3c5acaa9c67e36884e126",
        description="FastAdmin session signing key",
    )

    # Redis keys
    BLACKLIST_PREFIX: str = "blacklist:{}"
    USER_DATA_PREFIX: str = "user_data:{}"
    OTP_PREFIX: str = "otp:{}"

    # Directories
    TEMPLATES_DIR: str = os.path.join(os.getcwd(), "templates")

    # Middleware
    ORIGINS: list[str] = Field(
        default=["http://localhost:8081", "*"], description="CORS allowed origins"
    )
    METHODS: list[str] = Field(
        default=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        description="CORS allowed methods",
    )
    ALLOW_HEADERS: list[str] = Field(
        default=[
            "Content-Type",
            "Authorization",
            "X-Requested-With",
            "Accept",
            "Origin",
            "Access-Control-Allow-Origin",
            "Access-Control-Allow-Methods",
            "Access-Control-Allow-Headers",
        ],
        description="CORS allowed headers",
    )

    # Templates
    TEMPLATES: dict = {
        "otp": "otp_email.html",
        "welcome": "welcome_email.txt",
        "reset_password": "reset_password.txt",
    }

    #Blockchain
    NEAR_RPC_URL:str = Field(default="https://rpc.testnet.near.org ",description="Near RPC URl")

    # Computed properties
    @property
    def expire_delta(self) -> timedelta:
        return timedelta(days=30)

    @property
    def verification_expire_delta(self) -> timedelta:
        return timedelta(minutes=self.VERIFICATION_CODE_EXP_MIN)

    @property
    def token_url(self):
        return f"{self.API_V_STR}/auth/login"


class _InMemoryPipeline:
    def __init__(self, client):
        self._client = client
        self._cmds = []

    def get(self, name):
        self._cmds.append(("get", (name,), {}))
        return self

    def set(self, name, value, **kwargs):
        self._cmds.append(("set", (name, value), kwargs))
        return self

    def setex(self, name, time_sec, value):
        self._cmds.append(("setex", (name, time_sec, value), {}))
        return self

    def delete(self, *names):
        self._cmds.append(("delete", names, {}))
        return self

    async def execute(self):
        res = []
        for fn_name, args, kwargs in self._cmds:
            fn = getattr(self._client, fn_name)
            res.append(await fn(*args, **kwargs))
        return res


class _InMemoryRedis:
    def __init__(self):
        self._store = {}
        self._expiry = {}

    async def get(self, name):
        import time
        if name in self._expiry and time.time() > self._expiry[name]:
            self._store.pop(name, None)
            self._expiry.pop(name, None)
            return None
        return self._store.get(name)

    async def set(self, name, value, ex=None, px=None, nx=False, xx=False, **kwargs):
        import time
        if nx and name in self._store:
            return False
        if xx and name not in self._store:
            return False
        self._store[name] = str(value) if not isinstance(value, (str, bytes)) else value
        if ex:
            self._expiry[name] = time.time() + ex
        elif px:
            self._expiry[name] = time.time() + (px / 1000.0)
        return True

    async def setex(self, name, time_sec, value):
        return await self.set(name, value, ex=time_sec)

    async def delete(self, *names):
        count = 0
        for n in names:
            if self._store.pop(n, None) is not None:
                self._expiry.pop(n, None)
                count += 1
        return count

    async def exists(self, *names):
        return sum(1 for n in names if n in self._store)

    async def ttl(self, name):
        import time
        if name not in self._store:
            return -2
        if name not in self._expiry:
            return -1
        return max(0, int(self._expiry[name] - time.time()))

    async def ping(self):
        return True

    async def close(self):
        pass

    async def flushdb(self):
        self._store.clear()
        self._expiry.clear()
        return True

    async def keys(self, pattern="*"):
        import fnmatch
        return [k for k in self._store.keys() if fnmatch.fnmatch(k, pattern)]

    async def scan(self, cursor=0, match=None, count=None):
        import fnmatch
        pattern = match or "*"
        all_keys = [k for k in self._store.keys() if fnmatch.fnmatch(k, pattern)]
        return (0, all_keys)

    async def info(self, *args, **kwargs):
        return {"used_memory": 0, "used_memory_human": "0B"}

    async def client_list(self):
        return []

    def pipeline(self, transaction=True):
        return _InMemoryPipeline(self)


class _SafeRedisWrapper:
    def __init__(self, aioredis_client, mem_client):
        self._redis = aioredis_client
        self._mem = mem_client
        self._connected = True

    async def get(self, *args, **kwargs):
        if self._connected and self._redis is not None:
            try:
                import asyncio
                return await asyncio.wait_for(self._redis.get(*args, **kwargs), timeout=1.0)
            except Exception:
                self._connected = False
        return await self._mem.get(*args, **kwargs)

    async def set(self, *args, **kwargs):
        if self._connected and self._redis is not None:
            try:
                import asyncio
                res = await asyncio.wait_for(self._redis.set(*args, **kwargs), timeout=1.0)
                await self._mem.set(*args, **kwargs)
                return res
            except Exception:
                self._connected = False
        return await self._mem.set(*args, **kwargs)

    async def setex(self, *args, **kwargs):
        if self._connected and self._redis is not None:
            try:
                import asyncio
                res = await asyncio.wait_for(self._redis.setex(*args, **kwargs), timeout=1.0)
                await self._mem.setex(*args, **kwargs)
                return res
            except Exception:
                self._connected = False
        return await self._mem.setex(*args, **kwargs)

    async def delete(self, *args, **kwargs):
        if self._connected and self._redis is not None:
            try:
                import asyncio
                res = await asyncio.wait_for(self._redis.delete(*args, **kwargs), timeout=1.0)
                await self._mem.delete(*args, **kwargs)
                return res
            except Exception:
                self._connected = False
        return await self._mem.delete(*args, **kwargs)

    async def exists(self, *args, **kwargs):
        if self._connected and self._redis is not None:
            try:
                import asyncio
                return await asyncio.wait_for(self._redis.exists(*args, **kwargs), timeout=1.0)
            except Exception:
                self._connected = False
        return await self._mem.exists(*args, **kwargs)

    async def ttl(self, *args, **kwargs):
        if self._connected and self._redis is not None:
            try:
                import asyncio
                return await asyncio.wait_for(self._redis.ttl(*args, **kwargs), timeout=1.0)
            except Exception:
                self._connected = False
        return await self._mem.ttl(*args, **kwargs)

    async def ping(self):
        if self._connected and self._redis is not None:
            try:
                import asyncio
                return await asyncio.wait_for(self._redis.ping(), timeout=1.0)
            except Exception:
                self._connected = False
        return await self._mem.ping()

    async def scan(self, *args, **kwargs):
        if self._connected and self._redis is not None:
            try:
                import asyncio
                return await asyncio.wait_for(self._redis.scan(*args, **kwargs), timeout=1.0)
            except Exception:
                self._connected = False
        return await self._mem.scan(*args, **kwargs)

    async def keys(self, *args, **kwargs):
        if self._connected and self._redis is not None:
            try:
                import asyncio
                return await asyncio.wait_for(self._redis.keys(*args, **kwargs), timeout=1.0)
            except Exception:
                self._connected = False
        return await self._mem.keys(*args, **kwargs)

    async def flushdb(self):
        if self._connected and self._redis is not None:
            try:
                import asyncio
                await asyncio.wait_for(self._redis.flushdb(), timeout=1.0)
            except Exception:
                self._connected = False
        return await self._mem.flushdb()

    async def info(self, *args, **kwargs):
        if self._connected and self._redis is not None:
            try:
                import asyncio
                return await asyncio.wait_for(self._redis.info(*args, **kwargs), timeout=1.0)
            except Exception:
                self._connected = False
        return await self._mem.info(*args, **kwargs)

    async def client_list(self):
        if self._connected and self._redis is not None:
            try:
                import asyncio
                return await asyncio.wait_for(self._redis.client_list(), timeout=1.0)
            except Exception:
                self._connected = False
        return await self._mem.client_list()

    async def close(self):
        if self._redis is not None:
            try:
                await self._redis.close()
            except Exception:
                pass
        await self._mem.close()

    def pipeline(self, transaction=True):
        if self._connected and self._redis is not None:
            try:
                return self._redis.pipeline(transaction=transaction)
            except Exception:
                pass
        return self._mem.pipeline(transaction=transaction)

    def __getattr__(self, name):
        if self._connected and self._redis is not None and hasattr(self._redis, name):
            return getattr(self._redis, name)
        return getattr(self._mem, name)


# Instantiate settings
settings = Settings()  # type: ignore

class _LazyRedisProxy:
    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                import greenlet

                have_greenlet = True
            except ImportError:
                have_greenlet = False

            if not have_greenlet:
                # In Pyodide / workerd, asyncio socket selectors spin 100% CPU.
                # Use resilient in-memory Redis implementation.
                self._client = _InMemoryRedis()
            else:
                import redis.asyncio as aioredis

                self._client = aioredis.from_url(
                    settings.REDIS_URL,
                    decode_responses=True,
                    encoding="utf8",
                )
        return self._client

    def __getattr__(self, name):
        return getattr(self._get_client(), name)


redis = _LazyRedisProxy()

