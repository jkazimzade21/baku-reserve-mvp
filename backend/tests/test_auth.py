from __future__ import annotations

import pytest
from backend.app.main import app
from backend.app.settings import settings
from fastapi.testclient import TestClient

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_accounts():
    # Ensure auth bypass is enabled for most tests unless overridden
    settings.AUTH0_BYPASS = True
    yield
    settings.AUTH0_BYPASS = True


def test_session_returns_mock_claims_when_bypassed():
    resp = client.get("/auth/session")
    assert resp.status_code == 200
    data = resp.json()
    assert data["user"]["email"] == "dev@bakureserve.local"


def test_session_requires_token_when_not_bypassed():
    settings.AUTH0_BYPASS = False
    resp = client.get("/auth/session")
    assert resp.status_code == 401
