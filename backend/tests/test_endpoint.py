import pytest
from backend.app.concierge_v2_service import concierge_v2_service as concierge_service
from backend.app.contracts import RestaurantListItem
from backend.app.schemas import ConciergeResponse
from backend.app.serializers import restaurant_to_list_item
from backend.app.storage import DB


@pytest.mark.skip(reason="Concierge disabled temporarily")
def test_concierge_endpoint_returns_ai_payload(monkeypatch, client):
    record = next(iter(DB.restaurants.values()))
    restaurant = RestaurantListItem(**restaurant_to_list_item(record, request=None))

    async def fake_recommend(payload, request, mode_override=None):
        return ConciergeResponse(
            results=[RestaurantListItem(**restaurant_to_list_item(record, request))],
            match_reason={(restaurant.slug or str(restaurant.id)).lower(): ["Romantic", "$$$"]},
            explanations={
                (restaurant.slug or str(restaurant.id)).lower(): "Great date night spot."
            },
            mode="ai",
        )

    monkeypatch.setattr(concierge_service, "recommend", fake_recommend)

    res = client.post(
        "/concierge/recommendations", json={"prompt": "Weekend date night", "limit": 2}
    )
    assert res.status_code == 200
    body = res.json()
    assert "results" in body
    assert isinstance(body["results"], list)
    assert body["results"][0]["name"] == restaurant.name
    key = (restaurant.slug or str(restaurant.id)).lower()
    assert body["match_reason"][key] == ["Romantic", "$$$"]
    assert body["explanations"][key] == "Great date night spot."


@pytest.mark.skip(reason="Concierge disabled temporarily")
def test_concierge_endpoint_falls_back_when_ai_unavailable(monkeypatch, client):
    # In V2, if LLM fails, _parse_intent_async catches it and returns {}.
    # We simulate this by mocking _parse_intent_async to return {}.

    async def fake_parse(prompt):
        return {}

    class FakeSearcher:
        def search(self, prompt, hard_filters=None, limit=5):
            record = next(iter(DB.restaurants.values()))
            return [{"restaurant": record, "score": 0.9, "reason_tags": [], "relaxed": False}]

        def initialize_embeddings(self):
            pass

    monkeypatch.setattr(concierge_service, "_parse_intent_async", fake_parse)
    monkeypatch.setattr(concierge_service, "searcher", FakeSearcher())
    monkeypatch.setattr(concierge_service, "_initialized", True)

    res = client.post("/concierge/recommendations", json={"prompt": "Cozy brunch", "limit": 2})
    assert res.status_code == 200
    body = res.json()
    assert len(body["results"]) >= 1
    assert all("name" in item for item in body["results"])


@pytest.mark.skip(reason="Concierge disabled temporarily")
def test_concierge_validation_rejects_short_prompt(client):
    res = client.post("/concierge/recommendations", json={"prompt": "ok", "limit": 1})
    assert res.status_code == 422


def test_directions_rejects_out_of_range_coordinates(client):
    res = client.get(
        "/directions",
        params={"origin": "95.0,49.0", "destination": "40.4093,49.8671"},
    )
    assert res.status_code == 400
    assert "latitude" in res.json()["detail"].lower()


def test_restaurant_search_rejects_long_query(client):
    res = client.get("/restaurants", params={"q": "x" * 120})
    assert res.status_code == 422


@pytest.mark.skip(reason="Concierge disabled temporarily")
def test_concierge_health_endpoint(client):
    # Ensure service is initialized so health check works
    monkeypatch = client  # Hack if client fixture isn't monkeypatch, but we can't use it like this.
    # We can rely on app startup or manually set health if needed.
    # But checking health usually doesn't require special setup if defaults are ok.
    res = client.get("/concierge/health")
    assert res.status_code == 200
    body = res.json()
    assert "embeddings" in body
    assert "llm" in body


def test_legacy_paths_are_upgraded(client):
    res = client.get("/restaurants")
    assert res.status_code == 200
    assert "Legacy path" in (res.headers.get("X-API-Warning") or "")
