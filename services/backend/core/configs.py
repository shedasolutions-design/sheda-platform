import logging
import os
import types
import bcrypt
from dotenv import load_dotenv

# Workaround for passlib compatibility with bcrypt >= 4.0.0 where passlib reads bcrypt.__about__.__version__
if not hasattr(bcrypt, "__about__"):
    bcrypt.__about__ = types.SimpleNamespace(__version__=getattr(bcrypt, "__version__", "4.0.0"))

from passlib.context import CryptContext
from datetime import timedelta
import redis.asyncio as aioredis
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, computed_field
from typing import Optional


load_dotenv()


class Settings(BaseSettings):
    # Don't crash on additional keys in `.env` that aren't modeled here
    # (e.g., admin seeding vars used by `core.admin.seed`).
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    pwd_context: CryptContext = CryptContext(schemes=["bcrypt"], deprecated="auto")

    # General description
    SIGN_UP_DESC: str = Field(
        default="Once accounts are created they are stored temporarily for 2 hours "
        "before deletion if email verification is not completed"
    )

    @property
    def BASE_DIR(self) -> str:
        return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

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
    SMTP_USERNAME: str = Field(..., description="Email address for sending emails")
    SMTP_PASSWORD: str = Field(..., description="App password for email")
    SMTP_HOST: str = Field(..., description="Email host")
    SMTP_PORT: int = Field(default=2525, description="Email port")
    SMTP_SEND_FROM_MAIL: str = Field(
        ..., description="Email address for sending emails"
    )

    # Database
    DB_URL: str = Field(..., description="Database connection URL")
    REDIS_URL: str = Field(..., description="Redis connection URL")

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

    CLOUDINARY_NAME: str = Field(..., description="Cloudinary database name")
    CLOUDINARY_API_KEY: str = Field(..., description="Cloudinary API key")
    CLOUDINARY_API_SECRET: str = Field(..., description="Cloudinary Api Key")
    CLOUDINARY_URL: str = Field(..., description="cloudinary url")

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


redis: aioredis.Redis = aioredis.from_url(
    settings.REDIS_URL, decode_responses=True, encoding="utf8"
)
