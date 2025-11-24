from __future__ import annotations

import json
import time
from typing import Annotated, Any

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import (
    ExpiredSignatureError,
    InvalidAudienceError,
    InvalidIssuerError,
    InvalidTokenError,
    MissingRequiredClaimError,
)
from jwt.algorithms import RSAAlgorithm

from .settings import settings

security = HTTPBearer(auto_error=False)
AuthCredentials = Annotated[HTTPAuthorizationCredentials | None, Depends(security)]


class Auth0Verifier:
    def __init__(self) -> None:
        self._jwks: dict[str, Any] | None = None
        self._jwks_expiry: float = 0.0

    def _fetch_jwks(self) -> dict[str, Any]:
        issuer = settings.auth0_issuer
        if not issuer:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="AUTH0_DOMAIN is not configured",
            )
        url = issuer.rstrip("/") + "/.well-known/jwks.json"
        try:
            resp = httpx.get(url, timeout=5)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:  # pragma: no cover - network failures
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to fetch Auth0 JWKS",
            ) from exc

    def _get_jwks(self) -> dict[str, Any]:
        now = time.time()
        if self._jwks and now < self._jwks_expiry:
            return self._jwks
        jwks = self._fetch_jwks()
        self._jwks = jwks
        self._jwks_expiry = now + 60 * 15  # cache for 15 minutes
        return jwks

    def verify(
        self, token: str, required_scopes: list[str] | None = None
    ) -> dict[str, Any]:
        """
        Verify and validate Auth0 JWT token with comprehensive security checks.

        Args:
            token: JWT token string

        Returns:
            Decoded token payload

        Raises:
            HTTPException: If token is invalid, expired, or lacks required permissions
        """
        audience = settings.AUTH0_AUDIENCE
        issuer = settings.auth0_issuer
        if not audience or not issuer:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Auth0 audience/domain not configured",
            )

        # Step 1: Verify token structure and get signing key
        jwks = self._get_jwks()
        try:
            unverified_header = jwt.get_unverified_header(token)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Malformed token header",
            ) from exc

        kid = unverified_header.get("kid")
        if not kid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing key ID in token",
            )

        # Verify algorithm is RS256 (prevent algorithm confusion attacks)
        alg = unverified_header.get("alg")
        if alg != "RS256":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Unsupported algorithm: {alg}. Only RS256 allowed.",
            )

        key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
        if not key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unknown token signature key",
            )

        public_key = RSAAlgorithm.from_jwk(json.dumps(key))

        # Step 2: Decode and validate token
        try:
            payload = jwt.decode(
                token,
                key=public_key,
                algorithms=["RS256"],
                audience=audience,
                issuer=issuer.rstrip("/") + "/",
                options={"require": ["exp", "iat", "sub"]},
            )
        except ExpiredSignatureError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
            ) from exc
        except (
            InvalidAudienceError,
            InvalidIssuerError,
            MissingRequiredClaimError,
        ) as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token claims",
            ) from exc
        except InvalidTokenError as exc:  # pragma: no cover - pyjwt already well-tested
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
            ) from exc

        # Step 3: Additional security validations
        self._validate_token_security(payload)

        # Step 4: Scope validation (if required)
        if required_scopes:
            self._validate_scopes(payload, required_scopes)

        return payload

    def _validate_token_security(self, payload: dict[str, Any]) -> None:
        """
        Perform additional security validations on token payload.

        Checks:
        - Expiration with buffer (prevent near-expiry tokens)
        - Subject claim presence
        - Issued-at time reasonableness
        """
        # Check expiration with 60-second buffer
        exp = payload.get("exp")
        if exp:
            import time

            current_time = time.time()
            # Reject tokens expiring within 60 seconds
            if exp < current_time + 60:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token expired or expiring soon. Please refresh.",
                )

        # Ensure subject claim exists
        if not payload.get("sub"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing subject claim",
            )

        # Validate issued-at time is not in the future
        iat = payload.get("iat")
        if iat:
            import time

            current_time = time.time()
            # Allow 5 minutes of clock skew
            if iat > current_time + 300:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token issued in the future",
                )

    def _validate_scopes(
        self, payload: dict[str, Any], required_scopes: list[str]
    ) -> None:
        """
        Validate token has required scopes for authorization.

        Args:
            payload: Decoded token payload
            required_scopes: List of required scope strings

        Raises:
            HTTPException: If token lacks required scopes
        """
        # Extract scopes from token (can be space-separated string or list)
        token_scopes_raw = payload.get("scope", "")
        if isinstance(token_scopes_raw, str):
            token_scopes = set(token_scopes_raw.split())
        elif isinstance(token_scopes_raw, list):
            token_scopes = set(token_scopes_raw)
        else:
            token_scopes = set()

        # Check all required scopes are present
        missing_scopes = set(required_scopes) - token_scopes
        if missing_scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Missing scopes: {', '.join(missing_scopes)}",
            )

    def verify_with_scopes(self, token: str, *scopes: str) -> dict[str, Any]:
        """
        Convenience method to verify token with required scopes.

        Args:
            token: JWT token string
            *scopes: Variable number of required scope strings

        Returns:
            Decoded token payload

        Example:
            payload = verifier.verify_with_scopes(token, "read:restaurants", "write:reservations")
        """
        return self.verify(token, required_scopes=list(scopes))


auth0_verifier = Auth0Verifier()


async def require_auth(credentials: AuthCredentials) -> dict[str, Any]:
    """FastAPI dependency enforcing Auth0 authentication."""

    if settings.AUTH0_BYPASS:
        # Use deterministic local claims for development/tests
        return {
            "sub": "local-dev-user",
            "scope": "demo",
            "email": "dev@bakureserve.local",
            "name": "Local Dev",
        }

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )

    token = credentials.credentials
    return auth0_verifier.verify(token)
