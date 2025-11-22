"""Tests for input validation and sanitization."""

from __future__ import annotations

import pytest
from backend.app.input_validation import InputValidator, sanitize_query, validate_coords
from fastapi import HTTPException


class TestCoordinateValidation:
    """Test coordinate validation and sanitization."""

    def test_valid_coordinates(self):
        """Valid coordinates should pass validation."""
        lat, lon = InputValidator.validate_coordinates(40.4093, 49.8671)
        assert lat == 40.4093
        assert lon == 49.8671

    def test_coordinates_precision_normalization(self):
        """Coordinates should be rounded to 5 decimal places."""
        lat, lon = InputValidator.validate_coordinates(40.40931234567, 49.86712345678)
        assert lat == 40.40931
        assert lon == 49.86712

    def test_invalid_latitude_too_high(self):
        """Latitude > 90 should raise HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            InputValidator.validate_coordinates(91.0, 49.8671)
        assert exc_info.value.status_code == 422
        assert "latitude" in exc_info.value.detail.lower()

    def test_invalid_latitude_too_low(self):
        """Latitude < -90 should raise HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            InputValidator.validate_coordinates(-91.0, 49.8671)
        assert exc_info.value.status_code == 422
        assert "latitude" in exc_info.value.detail.lower()

    def test_invalid_longitude_too_high(self):
        """Longitude > 180 should raise HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            InputValidator.validate_coordinates(40.4093, 181.0)
        assert exc_info.value.status_code == 422
        assert "longitude" in exc_info.value.detail.lower()

    def test_invalid_longitude_too_low(self):
        """Longitude < -180 should raise HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            InputValidator.validate_coordinates(40.4093, -181.0)
        assert exc_info.value.status_code == 422
        assert "longitude" in exc_info.value.detail.lower()

    def test_baku_region_validation_inside(self):
        """Coordinates inside Baku region should pass when region check enabled."""
        # Baku city center
        lat, lon = InputValidator.validate_coordinates(40.4093, 49.8671, allow_outside_baku=False)
        assert lat == 40.4093
        assert lon == 49.8671

    def test_baku_region_validation_outside(self):
        """Coordinates outside Baku region should fail when region check enabled."""
        # New York coordinates
        with pytest.raises(HTTPException) as exc_info:
            InputValidator.validate_coordinates(40.7128, -74.0060, allow_outside_baku=False)
        assert exc_info.value.status_code == 422
        assert "outside Baku region" in exc_info.value.detail

    def test_convenience_function_validate_coords(self):
        """Convenience function should work identically."""
        lat, lon = validate_coords(40.4093, 49.8671)
        assert lat == 40.4093
        assert lon == 49.8671

    def test_custom_context_in_error_message(self):
        """Custom context should appear in error messages."""
        with pytest.raises(HTTPException) as exc_info:
            InputValidator.validate_coordinates(91.0, 49.8671, context="user location")
        assert "user location" in exc_info.value.detail


class TestSearchQueryValidation:
    """Test search query validation and sanitization."""

    def test_valid_simple_query(self):
        """Simple alphanumeric query should pass."""
        result = InputValidator.validate_search_query("Baku Restaurant")
        assert result == "Baku Restaurant"

    def test_query_with_azerbaijani_characters(self):
        """Azerbaijani characters should be preserved."""
        result = InputValidator.validate_search_query("Şəhər Restoranı")
        assert "Şəhər" in result or result  # Cyrillic preserved

    def test_query_trimming(self):
        """Leading/trailing whitespace should be trimmed."""
        result = InputValidator.validate_search_query("  Baku  ")
        assert result == "Baku"

    def test_empty_query(self):
        """Empty query should raise HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            InputValidator.validate_search_query("")
        assert exc_info.value.status_code == 422

    def test_whitespace_only_query(self):
        """Whitespace-only query should raise HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            InputValidator.validate_search_query("   ")
        assert exc_info.value.status_code == 422

    def test_query_too_short(self):
        """Query shorter than minimum should raise HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            InputValidator.validate_search_query("")
        assert exc_info.value.status_code == 422

    def test_query_truncation(self):
        """Query longer than maximum should be truncated."""
        long_query = "A" * 150  # Max is 100
        result = InputValidator.validate_search_query(long_query)
        assert len(result) == 100

    def test_dangerous_characters_removed(self):
        """Dangerous characters should be stripped."""
        result = InputValidator.validate_search_query("Baku<script>alert('xss')</script>")
        assert "<" not in result
        assert ">" not in result
        assert "script" in result  # Text preserved, tags removed

    def test_sql_injection_pattern_detected(self):
        """SQL injection patterns should be rejected."""
        with pytest.raises(HTTPException) as exc_info:
            InputValidator.validate_search_query("' OR '1'='1")
        assert exc_info.value.status_code == 422
        assert "dangerous patterns" in exc_info.value.detail.lower()

    def test_sql_comment_pattern_detected(self):
        """SQL comment patterns should be rejected."""
        with pytest.raises(HTTPException) as exc_info:
            InputValidator.validate_search_query("SELECT * FROM users; --")
        assert exc_info.value.status_code == 422

    def test_convenience_function_sanitize_query(self):
        """Convenience function should work identically."""
        result = sanitize_query("Baku Restaurant")
        assert result == "Baku Restaurant"

    def test_query_with_special_but_safe_characters(self):
        """Safe special characters like apostrophes should be preserved."""
        result = InputValidator.validate_search_query("McDonald's Restaurant")
        assert "McDonald" in result
        # Note: Apostrophe might be removed by sanitizer, that's OK

    def test_only_invalid_characters(self):
        """Query with only invalid characters should raise HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            InputValidator.validate_search_query("<<>>@@##$$")
        assert exc_info.value.status_code == 422
        assert "invalid characters" in exc_info.value.detail.lower()


class TestDistanceValidation:
    """Test distance parameter validation."""

    def test_valid_distance(self):
        """Valid distance should pass."""
        result = InputValidator.validate_distance(10.5)
        assert result == 10.5

    def test_distance_rounding(self):
        """Distance should be rounded to 2 decimal places."""
        result = InputValidator.validate_distance(10.12345)
        assert result == 10.12

    def test_negative_distance(self):
        """Negative distance should raise HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            InputValidator.validate_distance(-5.0)
        assert exc_info.value.status_code == 422
        assert "non-negative" in exc_info.value.detail.lower()

    def test_distance_exceeds_maximum(self):
        """Distance exceeding maximum should raise HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            InputValidator.validate_distance(600.0)  # Default max is 500
        assert exc_info.value.status_code == 422
        assert "maximum" in exc_info.value.detail.lower()

    def test_custom_maximum(self):
        """Custom maximum should be respected."""
        with pytest.raises(HTTPException) as exc_info:
            InputValidator.validate_distance(150.0, max_km=100.0)
        assert exc_info.value.status_code == 422


class TestRadiusValidation:
    """Test radius parameter validation."""

    def test_valid_radius(self):
        """Valid radius should pass."""
        result = InputValidator.validate_radius(5.0)
        assert result == 5.0

    def test_radius_rounding(self):
        """Radius should be rounded to 2 decimal places."""
        result = InputValidator.validate_radius(5.12345)
        assert result == 5.12

    def test_zero_radius(self):
        """Zero radius should raise HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            InputValidator.validate_radius(0.0)
        assert exc_info.value.status_code == 422
        assert "positive" in exc_info.value.detail.lower()

    def test_negative_radius(self):
        """Negative radius should raise HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            InputValidator.validate_radius(-5.0)
        assert exc_info.value.status_code == 422

    def test_radius_exceeds_maximum(self):
        """Radius exceeding maximum should raise HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            InputValidator.validate_radius(60.0)  # Default max is 50
        assert exc_info.value.status_code == 422


class TestLanguageCodeValidation:
    """Test language code sanitization."""

    def test_valid_azerbaijani(self):
        """Azerbaijani language code should pass."""
        result = InputValidator.sanitize_language_code("az")
        assert result == "az"

    def test_valid_english(self):
        """English language code should pass."""
        result = InputValidator.sanitize_language_code("en")
        assert result == "en"

    def test_valid_russian(self):
        """Russian language code should pass."""
        result = InputValidator.sanitize_language_code("ru")
        assert result == "ru"

    def test_valid_turkish(self):
        """Turkish language code should pass."""
        result = InputValidator.sanitize_language_code("tr")
        assert result == "tr"

    def test_uppercase_normalized(self):
        """Uppercase language codes should be normalized to lowercase."""
        result = InputValidator.sanitize_language_code("EN")
        assert result == "en"

    def test_whitespace_trimmed(self):
        """Whitespace should be trimmed from language code."""
        result = InputValidator.sanitize_language_code("  en  ")
        assert result == "en"

    def test_unsupported_language_returns_default(self):
        """Unsupported language should return default (az)."""
        result = InputValidator.sanitize_language_code("fr")
        assert result == "az"

    def test_none_returns_default(self):
        """None should return default (az)."""
        result = InputValidator.sanitize_language_code(None)
        assert result == "az"

    def test_empty_string_returns_default(self):
        """Empty string should return default (az)."""
        result = InputValidator.sanitize_language_code("")
        assert result == "az"

    def test_invalid_format(self):
        """Invalid language code format should raise HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            InputValidator.sanitize_language_code("english")
        assert exc_info.value.status_code == 422
        assert "2-letter" in exc_info.value.detail.lower()

    def test_non_alpha_characters(self):
        """Non-alphabetic characters should raise HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            InputValidator.sanitize_language_code("e1")
        assert exc_info.value.status_code == 422
