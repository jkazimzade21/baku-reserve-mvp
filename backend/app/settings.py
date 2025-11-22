from __future__ import annotations

import os
from pathlib import Path

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

    # Observability
    SENTRY_DSN: str | None = None
    SENTRY_ENVIRONMENT: str = "development"
    SENTRY_RELEASE: str | None = None
    SENTRY_TRACES_SAMPLE_RATE: float = 0.2

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


settings = Settings()
# make sure directory exists when imported
settings.data_dir.mkdir(parents=True, exist_ok=True)
