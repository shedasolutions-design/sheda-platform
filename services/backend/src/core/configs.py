import logging
import os
import types
from datetime import timedelta
from typing import TYPE_CHECKING, Optional

from dotenv import load_dotenv
from pydantic import AliasChoices, Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

from core.runtime import ON_WORKERS

if TYPE_CHECKING:
    from passlib.context import CryptContext


# src/ holds the code (and static/, templates/); env files live one level up,
# in services/backend, next to alembic.ini and wrangler.jsonc.
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_PROJECT_DIR = os.path.dirname(_BACKEND_DIR)
_ENV_FILE = os.path.join(_PROJECT_DIR, ".env")
# .env.local is written by `neon init` / `neon env pull` and wins over .env.
_ENV_LOCAL = os.path.join(_PROJECT_DIR, ".env.local")
_ENV_FILES = tuple(p for p in (_ENV_FILE, _ENV_LOCAL) if os.path.exists(p)) or (".env",)
for _f in _ENV_FILES:
    load_dotenv(_f, override=_f == _ENV_LOCAL)

# On Cloudflare Workers, vars and secrets arrive as bindings on `env`, not as
# process environment variables. Copy the plain values across before Settings
# reads the environment, so one Settings class serves every runtime.
if ON_WORKERS:
    try:
        import js
        from workers import env as _cf_env

        for _key in js.Object.keys(_cf_env._env):
            _val = getattr(_cf_env, str(_key), None)
            if isinstance(_val, (str, int, float, bool)):
                os.environ.setdefault(str(_key), str(_val))
    except Exception as _e:  # pragma: no cover - only reachable inside workerd
        logging.getLogger(__name__).warning("Could not read Worker bindings: %s", _e)


_pwd_context = None


def _get_pwd_context() -> "CryptContext":
    """
    Built on first use rather than at import.

    On Workers, everything imported at module scope counts against the start-up
    CPU budget, and hashing is not needed to serve most requests.
    """
    global _pwd_context
    if _pwd_context is None:
        import bcrypt

        # passlib reads bcrypt.__about__.__version__, which bcrypt >= 4 removed.
        if not hasattr(bcrypt, "__about__"):
            bcrypt.__about__ = types.SimpleNamespace(
                __version__=getattr(bcrypt, "__version__", "4.0.0")
            )
        from passlib.context import CryptContext

        _pwd_context = CryptContext(
            schemes=["bcrypt"],
            deprecated="auto",
            bcrypt__rounds=settings.BCRYPT_ROUNDS,
        )
    return _pwd_context


class Settings(BaseSettings):
    # Don't crash on additional keys in `.env` that aren't modeled here
    # (e.g., admin seeding vars used by `core.admin.seed`).
    model_config = SettingsConfigDict(
        env_file=_ENV_FILES, extra="ignore"
    )

    @property
    def pwd_context(self) -> "CryptContext":
        return _get_pwd_context()

    # Cost of new password hashes. Existing hashes verify at whatever cost they
    # were made with. Lowered on Workers only as far as its CPU limit forces;
    # see wrangler.jsonc. Never below 10.
    BCRYPT_ROUNDS: int = Field(default=12, ge=10, le=15, description="bcrypt cost factor")

    # General description
    SIGN_UP_DESC: str = Field(
        default="Once accounts are created they are stored temporarily for 2 hours "
        "before deletion if email verification is not completed"
    )

    @property
    def BASE_DIR(self) -> str:
        return _BACKEND_DIR

    # Security
    SECRET_KEY: str = Field(..., description="JWT secret key")
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
    SMTP_USERNAME: str = Field(default="", description="SMTP login (not used with BREVO_API_KEY)")
    SMTP_PASSWORD: str = Field(default="", description="SMTP password (not used with BREVO_API_KEY)")
    # Brevo's HTTP API. Used instead of SMTP when set, and required on Workers,
    # which cannot open the raw TCP connection SMTP needs.
    BREVO_API_KEY: Optional[str] = Field(default=None, description="Brevo transactional email API key")
    SMTP_HOST: str = Field(..., description="Email host")
    SMTP_PORT: int = Field(default=2525, description="Email port")
    SMTP_SEND_FROM_MAIL: str = Field(
        default="", description="Sender address (must be verified in Brevo)"
    )

    # Database
    # DATABASE_URL is the name Neon (and most hosts) write; DB_URL is ours.
    DB_URL: str = Field(
        ...,
        validation_alias=AliasChoices("DB_URL", "DATABASE_URL"),
        description="Database connection URL",
    )
    # Optional. Without it (and always on Workers) the key-value store is a
    # Postgres table and background tasks run in-process, so the API needs
    # nothing but its database. Set it to use Redis and Celery instead.
    REDIS_URL: str = Field(default="", description="Redis connection URL (optional)")

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
    PROD_URL: str = Field(..., description="Production Server")
    DEV_URL: str = Field(..., description="Development Server")

    # Regex
    PHONE_REGEX: str = r"^\+?\d{10,15}$"

    # Verification
    VERIFICATION_CODE_EXP_MIN: int = Field(
        default=15, description="Verification code expiration in minutes"
    )

    # API
    API_V_STR: str = Field(default="/api/v1", description="API version prefix")

    # SECTION Feature flags
    NEW_SIGNIN_CHOOSER: bool = Field(
        default=True,
        description=(
            "Honour the `profile` parameter on signup/login/social-login/"
            "refresh-token. Turned off, every one of those behaves exactly as "
            "it did before the chooser shipped — the client row is resolved "
            "and any profile sent is ignored. This is the server-side kill "
            "switch: it makes the feature inert even for clients already "
            "sending a profile, which app-side flags cannot do."
        ),
    )

    # SECTION Cloudinary data

    # Optional so the API can start before Cloudinary is set up; uploads fail
    # with a clear error until it is (core/starter.py).
    CLOUDINARY_NAME: str = Field(default="", description="Cloudinary cloud name")
    CLOUDINARY_API_KEY: str = Field(default="", description="Cloudinary API key")
    CLOUDINARY_API_SECRET: str = Field(default="", description="Cloudinary Api Key")
    CLOUDINARY_URL: str = Field(default="", description="cloudinary url")

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

    ADMIN_ROUTE: str = Field(..., description="FastAdmin route prefix")

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
    ADMIN_SECRET_KEY: str = Field(..., description="FastAdmin session signing key")

    # Redis keys
    BLACKLIST_PREFIX: str = "blacklist:{}"
    USER_DATA_PREFIX: str = "user_data:{}"
    OTP_PREFIX: str = "otp:{}"

    # Directories
    TEMPLATES_DIR: str = os.path.join(os.getcwd(), "templates")

    # Middleware
    ORIGINS: list[str] = Field(..., description="CORS allowed origins")
    ORIGIN_REGEX: str = Field(
        default="",
        description="Extra CORS origins as a regex, e.g. a project's preview URLs",
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


# Instantiate settings
settings = Settings()  # type: ignore


class _LazyRedis:
    """
    The key-value store for OTP codes and revoked tokens.

    Redis when REDIS_URL is set. Otherwise, and always on Workers, a table in
    Postgres (core/kv.py). Either is shared by every instance; memory would not
    be, and a code emailed by one instance would be rejected by another.

    Created on first use, so importing settings never opens a connection.
    """

    def __init__(self):
        self._client = None

    def _get(self):
        if self._client is None:
            if ON_WORKERS or not settings.REDIS_URL:
                from core.kv import PostgresKV

                self._client = PostgresKV()
            else:
                import redis.asyncio as aioredis

                self._client = aioredis.from_url(
                    settings.REDIS_URL, decode_responses=True, encoding="utf8"
                )
        return self._client

    def __getattr__(self, name):
        return getattr(self._get(), name)


redis = _LazyRedis()
