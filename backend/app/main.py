import warnings
from pathlib import Path
from typing import Any
from uuid import UUID

import sentry_sdk
from fastapi import Body, Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sentry_sdk.integrations.fastapi import FastApiIntegration

from .api.routes import reservations as reservations_routes
from .api.routes import restaurants as restaurants_routes
from .api_v1 import v1_router
from .auth import require_auth
from .backup import backup_manager
from .cache import clear_all_caches, get_all_cache_stats
from .health import health_checker
from .logging_config import configure_structlog, get_logger
from .metrics import PrometheusMiddleware, get_metrics
from .settings import settings
from .storage import DB
from .ui import router as ui_router
from .utils import (
    add_cors,
    add_rate_limiting,
    add_request_id_tracing,
    add_security_headers,
)
from .versioning import APIVersionMiddleware

# Suppress noisy multiprocessing semaphore warning on macOS dev runs
warnings.filterwarnings(
    "ignore",
    message=r"resource_tracker: There appear to be .* leaked semaphore objects",
    category=UserWarning,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
PHOTO_DIR = (REPO_ROOT / "photos" / "IGPics").resolve()

# Configure structured logging (must be done before any logging calls)
configure_structlog(json_logs=not settings.DEBUG)

if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.SENTRY_ENVIRONMENT,
        release=settings.SENTRY_RELEASE or "baku-reserve@dev",
        integrations=[FastApiIntegration()],
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
    )

app = FastAPI(
    title="Baku Reserve API",
    version="0.1.0",
    description="Restaurant reservation system for Baku, Azerbaijan",
)
add_cors(app)
add_security_headers(app)
add_request_id_tracing(app)
add_rate_limiting(app)
app.add_middleware(APIVersionMiddleware, current_version="1.0", latest_version="1.0")
app.add_middleware(PrometheusMiddleware)

API_PREFIX = "/v1"
LEGACY_API_PREFIXES = ("/restaurants", "/reservations")


@app.middleware("http")
async def legacy_prefix_upgrade(request: Request, call_next):  # type: ignore[override]
    path = request.scope.get("path", "")
    if not path:
        return await call_next(request)
    if (
        path.startswith(API_PREFIX)
        or path.startswith("/docs")
        or path.startswith("/openapi")
    ):
        return await call_next(request)
    if (
        path.startswith("/health")
        or path.startswith("/metrics")
        or path.startswith("/config")
    ):
        return await call_next(request)
    if not path.startswith(LEGACY_API_PREFIXES):
        return await call_next(request)

    new_path = f"{API_PREFIX}{path}"
    request.scope["path"] = new_path
    query = request.scope.get("query_string", b"")
    raw_path = new_path.encode()
    if query:
        raw_path = raw_path + b"?" + query
    request.scope["raw_path"] = raw_path
    request.state.legacy_prefix_applied = True
    response = await call_next(request)
    response.headers.setdefault(
        "X-API-Warning",
        "Legacy path automatically routed to /v1. Please update client requests.",
    )
    response.headers.setdefault("X-API-Version", "v1")
    return response


# Include v1 API router (versioned endpoints)
app.include_router(restaurants_routes.router, prefix=API_PREFIX)
app.include_router(reservations_routes.router, prefix=API_PREFIX)
app.include_router(v1_router)

# Include UI router (admin/booking console)
app.include_router(ui_router)
if PHOTO_DIR.exists():
    app.mount(
        "/assets/restaurants",
        StaticFiles(directory=str(PHOTO_DIR)),
        name="restaurant-photos",
    )

# Use structlog for structured logging
logger = get_logger(__name__)


def register_on_both(method: str, path: str, **kwargs):
    """Register endpoint on legacy and versioned routers."""

    def decorator(func):
        getattr(app, method)(path, **kwargs)(func)
        getattr(v1_router, method)(path, **kwargs)(func)
        return func

    return decorator


@register_on_both("get", "/health")
async def health():
    """Return service health including upstream dependency checks."""
    health_status = await health_checker.check_all()
    status_code = 200 if health_status["status"] == "healthy" else 503
    body = {
        "status": health_status["status"],
        "timestamp": health_status.get("timestamp"),
        "checks": health_status.get("checks", {}),
    }
    if settings.DEBUG:
        body["details"] = _scrub_health_details(health_status)
    body["service"] = "baku-reserve"
    body["version"] = "0.1.0"

    return JSONResponse(content=body, status_code=status_code)


@register_on_both("get", "/metrics")
def metrics():
    """Expose Prometheus metrics."""
    try:
        return get_metrics()
    except Exception:  # pragma: no cover - defensive path
        logger.exception("Metrics export failed")
        raise HTTPException(status_code=503, detail="metrics unavailable")


if settings.DEBUG and settings.DEV_ROUTES_ENABLED:

    def _dev_guard(claims: dict[str, Any] = Depends(require_auth)):
        # Require authenticated user even in dev mode to reduce accidental exposure
        return claims

    @app.post("/dev/sentry-test")
    def dev_sentry_test(
        claims: dict[str, Any] = Depends(_dev_guard),
        message: str = Body("manual ping", embed=True),
    ):
        sentry_sdk.capture_message(f"[dev-sentry-test] {message}")
        return {"ok": True, "message": message}

    @app.post("/dev/cache/clear")
    def dev_clear_caches(claims: dict[str, Any] = Depends(_dev_guard)):
        clear_all_caches()
        return {"ok": True, "cleared": True}

    @app.get("/dev/cache/stats")
    def dev_cache_stats(claims: dict[str, Any] = Depends(_dev_guard)):
        return get_all_cache_stats()

    @app.post("/dev/backup/create")
    def dev_create_backup(
        description: str | None = None, claims: dict[str, Any] = Depends(_dev_guard)
    ):
        """Create a manual backup of the database."""
        try:
            backup_path = backup_manager.create_backup(description=description)
            return {
                "ok": True,
                "backup_path": str(backup_path),
                "message": "Backup created successfully",
            }
        except Exception as exc:
            raise HTTPException(500, f"Backup failed: {exc}")

    @app.get("/dev/backup/list")
    def dev_list_backups(claims: dict[str, Any] = Depends(_dev_guard)):
        """List all available backups."""
        backups = backup_manager.list_backups()
        return {"ok": True, "backups": backups, "count": len(backups)}

    @app.post("/dev/backup/restore/{backup_name}")
    def dev_restore_backup(
        backup_name: str, claims: dict[str, Any] = Depends(_dev_guard)
    ):
        """Restore database from a backup."""
        try:
            backup_manager.restore_backup(backup_name)
            return {
                "ok": True,
                "message": f"Database restored from {backup_name}",
            }
        except FileNotFoundError:
            raise HTTPException(404, f"Backup not found: {backup_name}")
        except Exception as exc:
            raise HTTPException(500, f"Restore failed: {exc}")


# ---------- root redirect to docs ----------
@app.get("/", include_in_schema=False)
def root_redirect():
    # Redirect browsers straight to the booking console.
    return RedirectResponse(url="/book/", status_code=307)


# ---------- endpoints ----------


@app.get("/auth/session", response_model=dict)
def session_info(claims: dict[str, Any] = Depends(require_auth)):
    return {
        "user": {
            "sub": claims.get("sub"),
            "email": claims.get("email"),
            "name": claims.get("name"),
        }
    }


async def _require_reservation(resid: UUID) -> dict[str, Any]:
    record = await DB.get_reservation(str(resid))
    if not record:
        raise HTTPException(404, "Reservation not found")
    if record.get("status") != "booked":
        raise HTTPException(409, "Reservation is not active")
    return record


def _scrub_health_details(payload: dict[str, Any]) -> dict[str, Any]:
    """Remove sensitive error fields before returning debug health details."""

    def _scrub(value: Any) -> Any:
        if isinstance(value, dict):
            cleaned: dict[str, Any] = {}
            for key, inner in value.items():
                if key in {"error", "error_type", "traceback"}:
                    continue
                cleaned[key] = _scrub(inner)
            return cleaned
        if isinstance(value, list):
            return [_scrub(item) for item in value]
        return value

    return _scrub(payload)
