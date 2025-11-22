import asyncio
import os
import sys
from pathlib import Path

import pytest
import sentry_sdk
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Disable outbound Sentry calls during tests
sentry_sdk.init = lambda *args, **kwargs: None  # type: ignore[assignment]
os.environ["SENTRY_DSN"] = ""
test_data_dir = ROOT / "artifacts" / "test-data"
test_data_dir.mkdir(parents=True, exist_ok=True)
os.environ["DATA_DIR"] = str(test_data_dir)


def _sync_seed_file(filename: str, fallback: str = "") -> None:
    src = ROOT / "backend" / "app" / "data" / filename
    dst = test_data_dir / filename
    if src.exists():
        dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    elif fallback and not dst.exists():
        dst.write_text(fallback, encoding="utf-8")


_sync_seed_file("restaurants.json", "[]\n")
_sync_seed_file("restaurant_tags_enriched.json", "{}\n")

from backend.app.main import app  # noqa: E402
from backend.app.settings import settings  # noqa: E402
from backend.app.storage import DB  # noqa: E402


async def _purge_reservations_async() -> None:
    for record in await DB.list_reservations():
        await DB.cancel_reservation(record["id"])


def _purge_reservations() -> None:
    asyncio.run(_purge_reservations_async())


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app, base_url="http://api.testserver")


@pytest.fixture(autouse=True)
def clean_reservations() -> None:
    settings.AUTH0_BYPASS = True
    settings.RATE_LIMIT_ENABLED = False
    settings.OPENAI_API_KEY = None
    settings.CONCIERGE_MODE = "local"
    settings.SENTRY_DSN = None
    os.environ.setdefault("CONCIERGE_MODE", "local")
    os.environ.pop("OPENAI_API_KEY", None)
    limiter = getattr(app.state, "rate_limiter", None)
    if limiter:
        limiter.reset()
    _purge_reservations()
    yield
    _purge_reservations()
