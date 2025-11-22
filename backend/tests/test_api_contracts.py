import pytest
from backend.app.storage import DB


def test_restaurant_list_contract(client):
    response = client.get("/v1/restaurants")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    if not body:
        return
    item = body[0]
    for key in ("id", "name", "cuisine", "timezone"):
        assert key in item


def test_restaurant_detail_contract(client):
    record = next(iter(DB.restaurants.values()))
    rid = record["id"]
    response = client.get(f"/v1/restaurants/{rid}")
    assert response.status_code == 200
    data = response.json()
    for key in ("id", "name", "areas"):
        assert key in data


@pytest.mark.skip(reason="Concierge disabled temporarily")
def test_concierge_health_contract(client):
    response = client.get("/v1/concierge/health")
    assert response.status_code == 200
    payload = response.json()
    assert "embeddings" in payload
    assert "llm" in payload
    assert payload["embeddings"]["status"] in {"unknown", "healthy", "degraded"}
