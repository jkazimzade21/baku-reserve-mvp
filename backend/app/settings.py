from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = REPO_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE), env_file_encoding="utf-8", extra="ignore"
    )

    # whether to expose the debug config endpoint
    DEBUG: bool = False
    DEV_ROUTES_ENABLED: bool = False

    # persistence directory (defaults to app/data)
    DATA_DIR: Path | None = None
    DATABASE_URL: str | None = None

    # CORS allow origins (comma-separated). Default empty (no cross-origin).
    CORS_ALLOW_ORIGINS: str = ""

    # Feature flags
    PREP_NOTIFY_ENABLED: bool = False

    # Payments / currency metadata (no deposits required)
    PAYMENTS_MODE: Literal["mock", "live"] = "mock"
    PAYMENT_PROVIDER: Literal["mock", "paymentwall", "azericard"] = "mock"
    CURRENCY: str = "AZN"
    OSRM_BASE_URL: str = "https://router.project-osrm.org/route/v1/driving"
    OSRM_CACHE_TTL_SECONDS: int = 300
    PREP_POLICY_TEXT: str = (
        "We ping the kitchen once you're en route; cancel or adjust if your plans change."
    )

    # Auth0 integration
    AUTH0_DOMAIN: str | None = None
    AUTH0_AUDIENCE: str | None = None
    AUTH0_BYPASS: bool = False  # require explicit opt-in for bypass

    # Rate limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS: int = 300  # per window per client
    RATE_LIMIT_WINDOW_SECONDS: int = 60

    # Trusted proxy configuration for X-Forwarded-For validation
    # Only trust X-Forwarded-For headers from these proxies (comma-separated IPs/CIDRs)
    # Examples: "127.0.0.1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
    # Set to "*" to trust all (INSECURE - only for development behind trusted reverse proxy)
    # Leave empty to never trust X-Forwarded-For (use direct client.host only)
    TRUSTED_PROXIES: str = ""

    # Concierge AI
    OPENAI_API_KEY: str | None = None
    CONCIERGE_GPT_MODEL: str = "gpt-3.5-turbo-0125"
    CONCIERGE_EMBED_MODEL: str = "text-embedding-3-small"
    CONCIERGE_SUMMARY_MODEL: str | None = None
    CONCIERGE_SUMMARY_MAX_TOKENS: int = 320
    CONCIERGE_SUMMARY_TEMPERATURE: float = 0.4
    CONCIERGE_MODE: Literal["local", "ai", "ab"] = "local"
    CONCIERGE_WEIGHTS: str = "alpha=1.0,beta=1.2,gamma=1.0,delta=0.8,epsilon=0.8,zeta=0.4,eta=1.0"
    AI_SCORE_FLOOR: float = 0.0
    OPENAI_API_BASE: str = "https://api.openai.com/v1"
    OPENAI_TIMEOUT_SECONDS: float = 15.0
    OPENAI_CONNECT_TIMEOUT_SECONDS: float = 5.0
    CONCIERGE_REFRESH_INTERVAL_SECONDS: int = 1800

    # Observability
    SENTRY_DSN: str | None = None
    SENTRY_ENVIRONMENT: str = "development"
    SENTRY_RELEASE: str | None = None
    SENTRY_TRACES_SAMPLE_RATE: float = 0.2

    # Location Ping Throttling
    LOCATION_PING_MIN_DISTANCE_METERS: float = 100.0  # Minimum movement required
    LOCATION_PING_MIN_INTERVAL_SECONDS: int = 30  # Rate limiting per reservation

    # Redis Configuration (Optional - for circuit breaker state persistence)
    REDIS_URL: str | None = None  # e.g., "redis://localhost:6379/0"
    REDIS_ENABLED: bool = False

    @property
    def allow_origins(self) -> list[str]:
        s = (self.CORS_ALLOW_ORIGINS or "").strip()
        if s == "*":
            return ["*"]
        if s == "":
            return []
        return [part.strip() for part in s.split(",") if part.strip()]

    @property
    def data_dir(self) -> Path:
        # Pydantic treats an empty string in `.env` as Path('.') which would point to the
        # repository root. We instead consider blank/whitespace values as "unset" and fall back
        # to the default path under the user's home directory.
        def _materialize(path: Path) -> Path:
            path.mkdir(parents=True, exist_ok=True)
            return path

        raw_env = os.getenv("DATA_DIR")
        if raw_env is not None:
            trimmed = raw_env.strip()
            if trimmed:
                return _materialize(Path(trimmed).expanduser().resolve())
            return _materialize(Path.home() / ".baku-reserve-data")

        if self.DATA_DIR is not None:
            candidate = Path(self.DATA_DIR).expanduser()
            candidate_str = str(candidate).strip()
            if candidate_str and candidate_str not in {".", "./", ".\\"}:
                return _materialize(candidate.resolve())
        return _materialize(Path.home() / ".baku-reserve-data")

    @property
    def database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        default_path = self.data_dir / "baku_reserve.db"
        return f"sqlite:///{default_path}"

    @property
    def async_database_url(self) -> str:
        url = self.database_url
        if url.startswith("sqlite///") or url.startswith("sqlite:///"):
            return url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

    @property
    def auth0_issuer(self) -> str | None:
        if not self.AUTH0_DOMAIN:
            return None
        domain = self.AUTH0_DOMAIN.removeprefix("https://").removeprefix("http://")
        return f"https://{domain}/"

    @property
    def parsed_concierge_weights(self) -> ConciergeWeights:
        return ConciergeWeights.from_string(self.CONCIERGE_WEIGHTS)


@dataclass(slots=True)
class ConciergeWeights:
    alpha: float = 1.0
    beta: float = 1.2
    gamma: float = 1.0
    delta: float = 0.8
    epsilon: float = 0.8
    zeta: float = 0.4
    eta: float = 1.0

    @classmethod
    def from_string(cls, payload: str | None) -> ConciergeWeights:
        base = cls()
        if not payload:
            return base
        mapping: dict[str, float] = {}
        for part in payload.split(","):
            if "=" not in part:
                continue
            key, value = part.split("=", 1)
            key = key.strip().lower()
            try:
                mapping[key] = float(value.strip())
            except ValueError:
                continue
        return cls(
            alpha=mapping.get("alpha", base.alpha),
            beta=mapping.get("beta", base.beta),
            gamma=mapping.get("gamma", base.gamma),
            delta=mapping.get("delta", base.delta),
            epsilon=mapping.get("epsilon", base.epsilon),
            zeta=mapping.get("zeta", base.zeta),
            eta=mapping.get("eta", base.eta),
        )


settings = Settings()
# make sure directory exists when imported
settings.data_dir.mkdir(parents=True, exist_ok=True)
