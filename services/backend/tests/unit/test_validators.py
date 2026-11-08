"""Unit tests for validators."""

import pytest
from app.utils.validators import (
    ValidatorMixin,
    PropertyValidators,
    TransactionValidators,
)


class TestValidatorMixin:
    """Test base validator functions."""

    # These asserted Ethereum semantics — a `0x` + 64-hex hash, and a
    # validate_ethereum_address method. This app is on NEAR:
    # validate_blockchain_hash was rewritten to base58-decode and require 32
    # bytes, and validate_ethereum_address was dropped. The tests were never
    # updated, so they had been failing against a validator behaving exactly
    # as intended.

    def test_validate_blockchain_hash_valid(self):
        """A real NEAR tx hash: base58 that decodes to 32 bytes."""
        hash_val = "GgKPGKXBHTVtaJfoTfHtvRWTdKZTBFmYPaAX6iZH1Uzn"
        assert ValidatorMixin.validate_blockchain_hash(hash_val) == hash_val

    def test_validate_blockchain_hash_rejects_ethereum_style(self):
        """0x-prefixed hex is not a NEAR hash; '0' isn't in the base58 alphabet."""
        with pytest.raises(ValueError):
            ValidatorMixin.validate_blockchain_hash("0x" + "a" * 64)

    def test_validate_blockchain_hash_rejects_wrong_length(self):
        """Valid base58, but not 32 bytes once decoded."""
        with pytest.raises(ValueError, match="32 bytes"):
            ValidatorMixin.validate_blockchain_hash("abcdef")

    def test_validate_blockchain_hash_rejects_non_string(self):
        with pytest.raises(ValueError, match="must be a string"):
            ValidatorMixin.validate_blockchain_hash(12345)

    def test_validate_bedroom_count_valid(self):
        """Test valid bedroom count."""
        result = ValidatorMixin.validate_bedroom_count(3)
        assert result == 3

    def test_validate_bedroom_count_zero(self):
        """Test bedroom count of zero."""
        with pytest.raises(ValueError, match="Bedroom count must be between 1 and 100"):
            ValidatorMixin.validate_bedroom_count(0)

    def test_validate_bedroom_count_negative(self):
        """Test negative bedroom count."""
        with pytest.raises(ValueError, match="Bedroom count must be between 1 and 100"):
            ValidatorMixin.validate_bedroom_count(-1)

    def test_validate_bedroom_count_too_high(self):
        """Test bedroom count exceeds maximum."""
        with pytest.raises(ValueError, match="Bedroom count must be between 1 and 100"):
            ValidatorMixin.validate_bedroom_count(101)

    def test_validate_bathroom_count_valid(self):
        """Test valid bathroom count."""
        result = ValidatorMixin.validate_bathroom_count(2)
        assert result == 2

    def test_validate_bathroom_count_invalid(self):
        """Test invalid bathroom count."""
        with pytest.raises(ValueError):
            ValidatorMixin.validate_bathroom_count(0)


class TestPropertyValidators:
    """Test property-specific validators."""

    def test_validate_price_valid(self):
        """Test valid price validation."""
        result = PropertyValidators.validate_price_field(100.50)
        assert result == 100.50

    def test_validate_price_negative(self):
        """Test negative price."""
        with pytest.raises(ValueError, match="Price cannot be negative"):
            PropertyValidators.validate_price_field(-100)

    def test_validate_price_zero(self):
        """Test zero price."""
        result = PropertyValidators.validate_price_field(0)
        assert result == 0

    def test_validate_price_too_high(self):
        """Test price exceeds max value."""
        with pytest.raises(ValueError, match="Price exceeds maximum U128 value"):
            PropertyValidators.validate_price_field(2**129)

    def test_validate_title_valid(self):
        """Test valid title."""
        result = PropertyValidators.validate_title("Beautiful 3BR Apartment")
        assert result == "Beautiful 3BR Apartment"

    def test_validate_title_too_short(self):
        """Test title too short."""
        with pytest.raises(ValueError, match="title must be at least 10 characters"):
            PropertyValidators.validate_title("Bad")

    def test_validate_title_too_long(self):
        """Test title too long."""
        long_title = "A" * 101
        with pytest.raises(ValueError, match="title cannot exceed 100 characters"):
            PropertyValidators.validate_title(long_title)

    def test_validate_description_valid(self):
        """Test valid description."""
        desc = "A" * 100
        result = PropertyValidators.validate_description(desc)
        assert result == desc

    def test_validate_description_too_short(self):
        """Test description too short."""
        with pytest.raises(
            ValueError, match="description must be at least 20 characters"
        ):
            PropertyValidators.validate_description("Too short")

    def test_validate_description_too_long(self):
        """Test description too long."""
        long_desc = "A" * 5001
        with pytest.raises(
            ValueError, match="description cannot exceed 5000 characters"
        ):
            PropertyValidators.validate_description(long_desc)

    def test_validate_location_valid(self):
        """Test valid location."""
        result = ValidatorMixin.validate_location("Lagos, Nigeria")
        assert result == "Lagos, Nigeria"

    def test_validate_location_too_short(self):
        """Test location too short."""
        with pytest.raises(ValueError):
            ValidatorMixin.validate_location("L")


class TestTransactionValidators:
    """Test transaction-specific validators."""

    def test_validate_transaction_amount_valid(self):
        """Test valid transaction amount."""
        result = TransactionValidators.validate_transaction_amount(1000000)
        assert result == 1000000

    def test_validate_transaction_amount_negative(self):
        """Test negative transaction amount."""
        with pytest.raises(ValueError, match="Transaction amount must be greater than 0"):
            TransactionValidators.validate_transaction_amount(-1000)

    def test_validate_transaction_amount_zero(self):
        """Test zero transaction amount."""
        with pytest.raises(ValueError, match="Transaction amount must be greater than 0"):
            TransactionValidators.validate_transaction_amount(0)


class TestCacheKeys:
    """Test cache key generation."""

    def test_user_profile_key(self):
        """Test user profile key generation."""
        from app.utils.cache_keys import user_profile_key

        assert user_profile_key(123) == "user:profile:123"

    def test_property_detail_key(self):
        """Test property detail key generation."""
        from app.utils.cache_keys import property_detail_key

        assert property_detail_key(456) == "property:detail:456"

    def test_property_feed_key(self):
        """Test property feed key generation."""
        from app.utils.cache_keys import property_feed_key

        assert property_feed_key(page=1) == "property:feed:p1"
        assert (
            property_feed_key(page=2, filters_hash="abc123")
            == "property:feed:p2:abc123"
        )

    def test_generate_filter_hash(self):
        """Test filter hash generation."""
        from app.utils.cache_keys import generate_filter_hash

        filters1 = {"price_min": 1000, "location": "Lagos"}
        filters2 = {"location": "Lagos", "price_min": 1000}  # Same but different order

        hash1 = generate_filter_hash(filters1)
        hash2 = generate_filter_hash(filters2)

        # Should be identical (order-independent)
        assert hash1 == hash2
        assert len(hash1) == 32  # MD5 hash length
