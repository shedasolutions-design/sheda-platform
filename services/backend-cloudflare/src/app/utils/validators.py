"""
Custom Pydantic validators for input validation.
Provides reusable validators for common fields like price, numeric ranges, and blockchain addresses.
"""

from pydantic import field_validator, ValidationError, field_serializer
from typing import Any, Annotated
from decimal import Decimal
import re


class ValidatorMixin:
    """Mixin providing common validation methods."""

    @staticmethod
    def validate_price(value: float | int) -> float:
        """
        Validate price field for U128 compatibility.
        Max value: 2^128 - 1 = 340282366920938463463374607431768211455
        Min value: 0
        """
        if value is None:
            return value

        price = float(value)

        # Check for negative values
        if price < 0:
            raise ValueError("Price cannot be negative")

        # Check for U128 compatibility (2^128 - 1)
        max_u128 = 340282366920938463463374607431768211455
        if price > max_u128:
            raise ValueError(f"Price exceeds maximum U128 value: {max_u128}")

        # Check for reasonable decimal places (max 8 for blockchain compatibility)
        price_str = str(price)
        if "." in price_str:
            decimal_places = len(price_str.split(".")[1])
            if decimal_places > 18:
                raise ValueError("Price cannot have more than 18 decimal places")

        return price

    @staticmethod
    def validate_positive_integer(value: int, field_name: str = "value") -> int:
        """Validate integer is positive (> 0)."""
        if value is None:
            return value

        if not isinstance(value, int):
            raise ValueError(f"{field_name} must be an integer")

        if value <= 0:
            raise ValueError(f"{field_name} must be greater than 0")

        return value

    @staticmethod
    def validate_non_negative_integer(value: int, field_name: str = "value") -> int:
        """Validate integer is non-negative (>= 0)."""
        if value is None:
            return value

        if not isinstance(value, int):
            raise ValueError(f"{field_name} must be an integer")

        if value < 0:
            raise ValueError(f"{field_name} must be non-negative")

        return value

    @staticmethod
    def validate_string_length(
        value: str,
        min_length: int = 1,
        max_length: int = 255,
        field_name: str = "value",
    ) -> str:
        """Validate string length within bounds."""
        if value is None:
            return value

        if not isinstance(value, str):
            raise ValueError(f"{field_name} must be a string")

        length = len(value.strip())

        if length < min_length:
            raise ValueError(f"{field_name} must be at least {min_length} characters")

        if length > max_length:
            raise ValueError(f"{field_name} cannot exceed {max_length} characters")

        return value.strip()

    @staticmethod
    def validate_near_account_id(value: str) -> str:
        """Validate Near Account ID"""
        if value is None:
            return value

        if not isinstance(value, str):
            raise ValueError("Near Account ID must be a string")

        value = value.strip()

        if not re.match(r'^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$', value):
            raise ValueError("Invalid Near Account ID format")

        return value.lower()

    @staticmethod
    def validate_ethereum_address(value: str) -> str:
        """Validate Ethereum address format (0x followed by 40 hex characters)."""
        if value is None:
            return value

        if not isinstance(value, str):
            raise ValueError("Ethereum address must be a string")

        value = value.strip()

        if not (value.startswith("0x") and len(value) == 42):
            raise ValueError("Invalid Ethereum address format")

        try:
            int(value[2:], 16)
        except ValueError:
            raise ValueError("Invalid Ethereum address format")

        return value.lower()

    @staticmethod
    def validate_blockchain_hash(value: str) -> str:
        """Validate blockchain transaction hash (0x followed by 64 hex characters, or NEAR base58 hash)."""
        if value is None:
            return value

        if not isinstance(value, str):
            raise ValueError("Transaction hash must be a string")

        value = value.strip()

        if value.startswith("0x") and len(value) == 66:
            try:
                int(value[2:], 16)
                return value.lower()
            except ValueError:
                pass

        try:
            import base58
            decoded = base58.b58decode(value)
            if len(decoded) == 32:
                return value
        except Exception:
            pass

        raise ValueError("Invalid transaction hash format")


    @staticmethod
    def validate_uuid(value: str, field_name: str = "value") -> str:
        """Validate UUID v4 format."""
        if value is None:
            return value

        if not isinstance(value, str):
            raise ValueError(f"{field_name} must be a string")

        value = value.strip()

        uuid_pattern = (
            r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        )
        if not re.match(uuid_pattern, value, re.IGNORECASE):
            raise ValueError(f"Invalid UUID v4 format for {field_name}")

        return value.lower()

    @staticmethod
    def validate_phone_number(value: str, field_name: str = "phone_number") -> str:
        """Validate phone number format (international format)."""
        if value is None:
            return value

        if not isinstance(value, str):
            raise ValueError(f"{field_name} must be a string")

        value = value.strip()

        # Accept formats: +1234567890 or 1234567890 (10-15 digits)
        if not re.match(r"^\+?\d{10,15}$", value):
            raise ValueError(f"Invalid {field_name} format")

        return value

    @staticmethod
    def validate_slug(value: str, field_name: str = "slug") -> str:
        """Validate slug format (alphanumeric, hyphens, underscores only)."""
        if value is None:
            return value

        if not isinstance(value, str):
            raise ValueError(f"{field_name} must be a string")

        value = value.strip().lower()

        if not re.match(r"^[a-z0-9_-]+$", value):
            raise ValueError(
                f"Invalid {field_name} format. Only alphanumeric, hyphens, and underscores allowed"
            )

        return value

    @staticmethod
    def validate_location(value: str) -> str:
        """Validate location string (at least 2 characters, max 255)."""
        if value is None:
            return value

        if not isinstance(value, str):
            raise ValueError("Location must be a string")

        value = value.strip()

        if len(value) < 2:
            raise ValueError("Location must be at least 2 characters")

        if len(value) > 255:
            raise ValueError("Location cannot exceed 255 characters")

        return value

    @staticmethod
    def validate_bedroom_count(value: int) -> int:
        """Validate bedroom count (1-100)."""
        if value is None:
            return value

        if not isinstance(value, int):
            raise ValueError("Bedroom count must be an integer")

        if value < 1 or value > 100:
            raise ValueError("Bedroom count must be between 1 and 100")

        return value

    @staticmethod
    def validate_bathroom_count(value: int) -> int:
        """Validate bathroom count (1-100)."""
        if value is None:
            return value

        if not isinstance(value, int):
            raise ValueError("Bathroom count must be an integer")

        if value < 1 or value > 100:
            raise ValueError("Bathroom count must be between 1 and 100")

        return value


class PropertyValidators(ValidatorMixin):
    """Property-specific validators."""

    @staticmethod
    def validate_title(value: str) -> str:
        """Validate property title (10-100 characters)."""
        return ValidatorMixin.validate_string_length(
            value, min_length=10, max_length=100, field_name="title"
        )

    @staticmethod
    def validate_description(value: str) -> str:
        """Validate property description (20-5000 characters)."""
        if value is None:
            return value

        return ValidatorMixin.validate_string_length(
            value, min_length=20, max_length=5000, field_name="description"
        )

    @staticmethod
    def validate_price_field(value: float) -> float:
        """Validate property price."""
        return ValidatorMixin.validate_price(value)


class TransactionValidators(ValidatorMixin):
    """Transaction-specific validators."""

    @staticmethod
    def validate_idempotency_key(value: str) -> str:
        """Validate idempotency key format (UUID v4)."""
        return ValidatorMixin.validate_uuid(value, "idempotency_key")

    @staticmethod
    def validate_transaction_amount(value: float) -> float:
        """Validate transaction amount."""
        price = float(value)
        if price <= 0:
            raise ValueError("Transaction amount must be greater than 0")
        return ValidatorMixin.validate_price(price)


class UserValidators(ValidatorMixin):
    """User-specific validators."""

    @staticmethod
    def validate_username(value: str) -> str:
        """Validate username (3-30 alphanumeric characters, hyphens, underscores)."""
        if value is None:
            return value

        value = value.strip()

        if len(value) < 3:
            raise ValueError("Username must be at least 3 characters")

        if len(value) > 30:
            raise ValueError("Username cannot exceed 30 characters")

        if not re.match(r"^[a-zA-Z0-9_-]+$", value):
            raise ValueError(
                "Username can only contain alphanumeric characters, hyphens, and underscores"
            )

        return value

    @staticmethod
    def validate_fullname(value: str) -> str:
        """Validate full name (2-100 characters)."""
        return ValidatorMixin.validate_string_length(
            value, min_length=2, max_length=100, field_name="fullname"
        )
