"""Input validation and sanitization for external API calls."""

from __future__ import annotations

import re

from fastapi import HTTPException


class InputValidator:
    """
    Validator for user inputs before passing to external APIs.

    Prevents injection attacks, quota exhaustion, and service disruption.
    """

    # Baku, Azerbaijan approximate bounds
    BAKU_LAT_MIN = 39.5
    BAKU_LAT_MAX = 41.5
    BAKU_LON_MIN = 48.5
    BAKU_LON_MAX = 51.0

    # Reasonable search query limits
    SEARCH_QUERY_MAX_LENGTH = 100
    SEARCH_QUERY_MIN_LENGTH = 1

    @classmethod
    def validate_coordinates(
        cls,
        lat: float,
        lon: float,
        *,
        allow_outside_baku: bool = True,
        context: str = "coordinates",
    ) -> tuple[float, float]:
        """
        Validate and sanitize geographic coordinates.

        Args:
            lat: Latitude value
            lon: Longitude value
            allow_outside_baku: If False, reject coordinates outside Baku region
            context: Context description for error messages

        Returns:
            Validated (lat, lon) tuple

        Raises:
            HTTPException: If coordinates are invalid
        """
        # Basic range validation
        if not (-90 <= lat <= 90):
            raise HTTPException(
                422,
                f"Invalid {context}: latitude must be between -90 and 90, got {lat}",
            )

        if not (-180 <= lon <= 180):
            raise HTTPException(
                422,
                f"Invalid {context}: longitude must be between -180 and 180, got {lon}",
            )

        # Baku region validation (optional)
        if not allow_outside_baku:
            if not (cls.BAKU_LAT_MIN <= lat <= cls.BAKU_LAT_MAX):
                raise HTTPException(
                    422,
                    f"Invalid {context}: latitude {lat} is outside Baku region "
                    f"({cls.BAKU_LAT_MIN} to {cls.BAKU_LAT_MAX})",
                )

            if not (cls.BAKU_LON_MIN <= lon <= cls.BAKU_LON_MAX):
                raise HTTPException(
                    422,
                    f"Invalid {context}: longitude {lon} is outside Baku region "
                    f"({cls.BAKU_LON_MIN} to {cls.BAKU_LON_MAX})",
                )

        # Round to reasonable precision (5 decimal places ≈ 1.1 meter accuracy)
        lat = round(lat, 5)
        lon = round(lon, 5)

        return lat, lon

    @classmethod
    def validate_search_query(cls, query: str, *, context: str = "search query") -> str:
        """
        Validate and sanitize search query for external APIs.

        Args:
            query: Raw search query string
            context: Context description for error messages

        Returns:
            Sanitized query string

        Raises:
            HTTPException: If query is invalid
        """
        if not query:
            raise HTTPException(422, f"Invalid {context}: query cannot be empty")

        # Trim whitespace
        query = query.strip()

        # Length validation
        if len(query) < cls.SEARCH_QUERY_MIN_LENGTH:
            raise HTTPException(
                422,
                f"Invalid {context}: query too short (minimum {cls.SEARCH_QUERY_MIN_LENGTH} characters)",
            )

        if len(query) > cls.SEARCH_QUERY_MAX_LENGTH:
            # Truncate instead of rejecting
            query = query[: cls.SEARCH_QUERY_MAX_LENGTH]

        # Remove potentially dangerous characters
        # Allow: letters, numbers, spaces, basic punctuation
        sanitized = re.sub(r"[^\w\s\-.,\'\u0400-\u04FF]", "", query, flags=re.UNICODE)

        if not sanitized:
            raise HTTPException(
                422,
                f"Invalid {context}: query contains only invalid characters",
            )

        # Prevent SQL-like patterns (defense in depth)
        sql_patterns = [
            r"'\s*(OR|AND)\s+'",
            r"--",
            r"/\*",
            r"\*/",
            r";\s*(DROP|DELETE|INSERT|UPDATE|SELECT)",
        ]

        query_upper = sanitized.upper()
        for pattern in sql_patterns:
            if re.search(pattern, query_upper):
                raise HTTPException(
                    422,
                    f"Invalid {context}: query contains potentially dangerous patterns",
                )

        return sanitized

    @classmethod
    def validate_distance(cls, distance_km: float, *, max_km: float = 500.0) -> float:
        """
        Validate distance parameter.

        Args:
            distance_km: Distance in kilometers
            max_km: Maximum allowed distance

        Returns:
            Validated distance

        Raises:
            HTTPException: If distance is invalid
        """
        if distance_km < 0:
            raise HTTPException(422, f"Invalid distance: must be non-negative, got {distance_km}")

        if distance_km > max_km:
            raise HTTPException(
                422,
                f"Invalid distance: exceeds maximum {max_km}km, got {distance_km}",
            )

        return round(distance_km, 2)

    @classmethod
    def validate_radius(cls, radius_km: float, *, max_km: float = 50.0) -> float:
        """
        Validate radius parameter for area searches.

        Args:
            radius_km: Radius in kilometers
            max_km: Maximum allowed radius

        Returns:
            Validated radius

        Raises:
            HTTPException: If radius is invalid
        """
        if radius_km <= 0:
            raise HTTPException(422, f"Invalid radius: must be positive, got {radius_km}")

        if radius_km > max_km:
            raise HTTPException(
                422,
                f"Invalid radius: exceeds maximum {max_km}km, got {radius_km}",
            )

        return round(radius_km, 2)

    @classmethod
    def sanitize_language_code(cls, language: str | None) -> str:
        """
        Sanitize language code parameter.

        Args:
            language: Language code (az, en, ru, etc.)

        Returns:
            Validated language code

        Raises:
            HTTPException: If language code is invalid
        """
        if not language:
            return "az"  # Default

        language = language.lower().strip()

        # Only allow 2-letter ISO 639-1 codes
        if not re.match(r"^[a-z]{2}$", language):
            raise HTTPException(
                422,
                f"Invalid language code: must be 2-letter ISO code, got '{language}'",
            )

        # Whitelist allowed languages
        allowed = {"az", "en", "ru", "tr"}
        if language not in allowed:
            # Return default instead of rejecting
            return "az"

        return language


# Convenience functions
def validate_coords(lat: float, lon: float, **kwargs) -> tuple[float, float]:
    """Shorthand for InputValidator.validate_coordinates."""
    return InputValidator.validate_coordinates(lat, lon, **kwargs)


def sanitize_query(query: str, **kwargs) -> str:
    """Shorthand for InputValidator.validate_search_query."""
    return InputValidator.validate_search_query(query, **kwargs)


__all__ = [
    "InputValidator",
    "validate_coords",
    "sanitize_query",
]
