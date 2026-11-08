"""
KYC (Know Your Customer) integration service.
Integrates with external KYC providers (Persona, IDology, etc) for identity verification.
"""

from typing import Optional, Dict, Any
from enum import Enum
from datetime import datetime
import httpx

from core.logger import get_logger
from core.exceptions import ExternalServiceError, ValidationError
from core.configs import settings

logger = get_logger(__name__)


class KYCProvider(str, Enum):
    """Supported KYC providers."""

    PERSONA = "persona"
    IDOLOGY = "idology"
    TRULIOO = "trulioo"
    ONFIDO = "onfido"


class KYCStatus(str, Enum):
    """KYC status values."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    VERIFIED = "verified"
    REJECTED = "rejected"
    EXPIRED = "expired"


class PersonaKYCService:
    """KYC service using Persona API."""

    BASE_URL = "https://api.withpersona.com/api/v1"

    def __init__(self, api_key: str):
        """
        Initialize Persona KYC service.

        Args:
            api_key: Persona API key
        """
        self.api_key = api_key
        self.client = None

    async def initialize(self) -> None:
        """Initialize HTTP client."""
        self.client = httpx.AsyncClient(
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

    async def close(self) -> None:
        """Close HTTP client."""
        if self.client:
            await self.client.aclose()

    async def create_inquiry(
        self,
        user_id: int,
        email: str,
        phone_number: Optional[str] = None,
        first_name: Optional[str] = None,
        last_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create new KYC inquiry.

        Args:
            user_id: User ID
            email: User email
            phone_number: Optional phone number
            first_name: Optional first name
            last_name: Optional last name

        Returns:
            Inquiry data including inquiry_id

        Raises:
            ExternalServiceError: If API call fails
        """
        try:
            payload = {
                "data": {
                    "type": "inquiry",
                    "attributes": {
                        "email": email,
                        "phone-number": phone_number,
                        "first-name": first_name,
                        "last-name": last_name,
                        "reference-id": f"user_{user_id}",
                    },
                }
            }

            response = await self.client.post(
                f"{self.BASE_URL}/inquiries",
                json=payload,
            )
            response.raise_for_status()

            data = response.json()
            inquiry_id = data.get("data", {}).get("id")

            logger.info(f"KYC inquiry created", user_id=user_id, inquiry_id=inquiry_id)
            return data.get("data", {})

        except httpx.HTTPError as e:
            logger.error(f"Persona API error: {str(e)}")
            raise ExternalServiceError("Persona", "Failed to create inquiry")

    async def get_inquiry_status(
        self,
        inquiry_id: str,
    ) -> Dict[str, Any]:
        """
        Get inquiry status.

        Args:
            inquiry_id: Persona inquiry ID

        Returns:
            Inquiry status and details

        Raises:
            ExternalServiceError: If API call fails
        """
        try:
            response = await self.client.get(
                f"{self.BASE_URL}/inquiries/{inquiry_id}",
            )
            response.raise_for_status()

            return response.json().get("data", {})

        except httpx.HTTPError as e:
            logger.error(f"Persona API error: {str(e)}")
            raise ExternalServiceError("Persona", "Failed to get inquiry status")

    async def get_inquiry_verification(
        self,
        inquiry_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get verification details if available.

        Args:
            inquiry_id: Persona inquiry ID

        Returns:
            Verification data or None

        Raises:
            ExternalServiceError: If API call fails
        """
        try:
            response = await self.client.get(
                f"{self.BASE_URL}/inquiries/{inquiry_id}/verifications",
            )
            response.raise_for_status()

            verifications = response.json().get("data", [])
            if verifications:
                return verifications[0]

            return None

        except httpx.HTTPError as e:
            logger.error(f"Persona API error: {str(e)}")
            raise ExternalServiceError("Persona", "Failed to get verification")


class KYCService:
    """Unified KYC service supporting multiple providers."""

    def __init__(self, provider: KYCProvider = KYCProvider.PERSONA):
        """
        Initialize KYC service.

        Args:
            provider: KYC provider to use
        """
        self.provider = provider
        self.provider_service = None

        if provider == KYCProvider.PERSONA and hasattr(settings, "PERSONA_API_KEY"):
            self.provider_service = PersonaKYCService(settings.PERSONA_API_KEY)

    async def initialize(self) -> None:
        """Initialize provider service."""
        if self.provider_service:
            await self.provider_service.initialize()

    async def close(self) -> None:
        """Close provider service."""
        if self.provider_service:
            await self.provider_service.close()

    async def create_verification(
        self,
        user_id: int,
        email: str,
        phone_number: Optional[str] = None,
        first_name: Optional[str] = None,
        last_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create KYC verification request.

        Args:
            user_id: User ID
            email: User email
            phone_number: Optional phone number
            first_name: Optional first name
            last_name: Optional last name

        Returns:
            Verification session data

        Raises:
            ExternalServiceError: If verification creation fails
        """
        if not self.provider_service:
            raise ExternalServiceError(
                "KYC",
                f"KYC provider {self.provider} not configured",
            )

        if self.provider == KYCProvider.PERSONA:
            return await self.provider_service.create_inquiry(
                user_id,
                email,
                phone_number,
                first_name,
                last_name,
            )

        raise ExternalServiceError("KYC", "Unknown KYC provider")

    async def get_verification_status(
        self,
        verification_id: str,
    ) -> Dict[str, Any]:
        """
        Get verification status.

        Args:
            verification_id: Verification ID from provider

        Returns:
            Status data

        Raises:
            ExternalServiceError: If status check fails
        """
        if not self.provider_service:
            raise ExternalServiceError(
                "KYC",
                f"KYC provider {self.provider} not configured",
            )

        if self.provider == KYCProvider.PERSONA:
            status_data = await self.provider_service.get_inquiry_status(
                verification_id
            )

            # Extract relevant status
            attributes = status_data.get("attributes", {})
            return {
                "id": status_data.get("id"),
                "status": attributes.get("status"),  # pending, approved, declined
                "created_at": attributes.get("created-at"),
                "completed_at": attributes.get("completed-at"),
                "reason": attributes.get("declined-reason"),
            }

        raise ExternalServiceError("KYC", "Unknown KYC provider")

    async def is_verified(
        self,
        verification_id: str,
    ) -> bool:
        """
        Check if verification is approved.

        Args:
            verification_id: Verification ID

        Returns:
            True if verified, False otherwise
        """
        status = await self.get_verification_status(verification_id)
        return status.get("status") == "approved"


# Global KYC service instance
_kyc_service: Optional[KYCService] = None


async def get_kyc_service(
    provider: KYCProvider = KYCProvider.PERSONA,
) -> KYCService:
    """
    Get or create global KYC service.

    Args:
        provider: KYC provider to use

    Returns:
        KYCService instance
    """
    global _kyc_service

    if _kyc_service is None:
        _kyc_service = KYCService(provider)
        try:
            await _kyc_service.initialize()
        except Exception as e:
            logger.warning(f"KYC service initialization failed: {e}")

    return _kyc_service


# Schemas

from pydantic import BaseModel, EmailStr, Field


class KYCVerificationRequest(BaseModel):
    """Request to start KYC verification."""

    email: EmailStr
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    phone_number: Optional[str] = Field(default=None, pattern=r"^\+?\d{10,15}$")


class KYCVerificationStatus(BaseModel):
    """KYC verification status response."""

    verification_id: str
    status: KYCStatus
    created_at: str
    completed_at: Optional[str] = None
    reason: Optional[str] = None


class KYCVerificationResponse(BaseModel):
    """Response after creating verification."""

    verification_id: str
    status: str
    redirect_url: Optional[str] = None
    message: str
