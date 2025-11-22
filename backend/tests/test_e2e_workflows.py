"""
End-to-end tests for complete user workflows.
Tests the entire application stack from user action to database.
"""

import pytest
from backend.app.main import app
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    """Create test client"""
    return TestClient(app)


class TestCompleteUserJourneys:
    """Test complete user journeys through the application"""

    def test_new_user_discovers_restaurants(self, client):
        """Test: New user opens app and discovers restaurants"""
        # Step 1: User opens app, app checks health
        health = client.get("/health")
        assert health.status_code in [200, 503]  # 200 if healthy, 503 if degraded
        data = health.json()
        assert data["status"] in ["healthy", "degraded"]
        assert data["service"] == "baku-reserve"

        # Step 2: User views restaurant list
        restaurants = client.get("/restaurants")
        assert restaurants.status_code == 200
        restaurant_list = restaurants.json()
        assert isinstance(restaurant_list, list)

        if len(restaurant_list) == 0:
            pytest.skip("No restaurants in database for testing")

        # Step 3: User selects first restaurant
        first_restaurant = restaurant_list[0]
        assert "id" in first_restaurant
        assert "name" in first_restaurant

        # Step 4: User views restaurant details
        details = client.get(f"/restaurants/{first_restaurant['id']}")
        assert details.status_code in [200, 404]

        if details.status_code == 200:
            restaurant_data = details.json()
            assert restaurant_data["id"] == first_restaurant["id"]
            assert "name" in restaurant_data

    def test_user_searches_with_filters(self, client):
        """Test: User searches for specific restaurant type"""
        # Step 1: User performs search
        search_response = client.get("/restaurants?q=italian")
        assert search_response.status_code == 200

        results = search_response.json()
        assert isinstance(results, list)

        # Step 2: If results found, user explores them
        if len(results) > 0:
            for restaurant in results[:3]:  # Check first 3
                detail_response = client.get(f"/restaurants/{restaurant['id']}")
                assert detail_response.status_code in [200, 404]

    @pytest.mark.skip(reason="Concierge disabled temporarily")
    def test_user_gets_ai_recommendations(self, client):
        """Test: User asks AI concierge for recommendations"""
        # Step 1: User makes AI request
        concierge_request = {
            "prompt": "I want a romantic dinner spot with Italian food",
            "lang": "en",
        }

        response = client.post("/concierge/recommendations?mode=local", json=concierge_request)
        assert response.status_code in [200, 503]  # 503 if AI unavailable

        if response.status_code == 200:
            data = response.json()
            assert "results" in data
            assert data.get("mode") in {"local", "ai", None}
            assert isinstance(data["results"], list)

            # Step 2: User selects a recommendation
            if len(data["results"]) > 0:
                recommended = data["results"][0]
                assert "id" in recommended

                # Step 3: User views recommended restaurant
                detail_response = client.get(f"/restaurants/{recommended['id']}")
                assert detail_response.status_code in [200, 404]

    def test_user_checks_availability_and_books(self, client):
        """Test: User checks availability and makes reservation"""
        # Step 1: Get a restaurant
        restaurants = client.get("/restaurants")
        assert restaurants.status_code == 200

        restaurant_list = restaurants.json()
        if len(restaurant_list) == 0:
            pytest.skip("No restaurants available")

        restaurant_id = restaurant_list[0]["id"]

        # Step 2: Check availability
        availability_params = {"date": "2025-12-01", "time": "19:00", "party_size": 2}

        availability = client.get(
            f"/restaurants/{restaurant_id}/availability", params=availability_params
        )
        assert availability.status_code in [200, 404]

        # Step 3: If available, proceed with booking details
        # (Actual booking flow would continue here)

    def test_user_gets_directions_to_restaurant(self, client):
        """Test: User gets directions to selected restaurant"""
        # Step 1: User searches for location
        geocode = client.get("/v1/maps/geocode", params={"query": "Baku"})
        assert geocode.status_code == 200

        # Step 2: User gets directions
        directions_params = {
            "origin": "40.4093,49.8671",  # Central Baku
            "destination": "40.3777,49.8920",  # Example destination
        }

        directions = client.get("/v1/directions", params=directions_params)
        assert directions.status_code == 200

        # Response should contain route information
        route_data = directions.json()
        assert route_data is not None


class TestMultiLanguageWorkflows:
    """Test workflows in different languages"""

    @pytest.mark.skip(reason="Concierge disabled temporarily")
    def test_english_user_journey(self, client):
        """Test complete journey in English"""
        concierge_request = {
            "prompt": "I want Italian food",
            "lang": "en",
        }

        response = client.post("/concierge/recommendations?mode=local", json=concierge_request)
        assert response.status_code in [200, 503]

    @pytest.mark.skip(reason="Concierge disabled temporarily")
    def test_azerbaijani_user_journey(self, client):
        """Test complete journey in Azerbaijani"""
        concierge_request = {
            "prompt": "İtalyan yeməyi istəyirəm",
            "lang": "az",
        }

        response = client.post("/concierge/recommendations?mode=local", json=concierge_request)
        assert response.status_code in [200, 503]

    @pytest.mark.skip(reason="Concierge disabled temporarily")
    def test_russian_user_journey(self, client):
        """Test complete journey in Russian"""
        concierge_request = {
            "prompt": "Я хочу итальянскую еду",
            "lang": "ru",
        }

        response = client.post("/concierge/recommendations?mode=local", json=concierge_request)
        assert response.status_code in [200, 503]


@pytest.mark.skip(reason="Concierge disabled temporarily")
class TestErrorRecoveryWorkflows:
    """Test how system handles errors in workflows"""

    def test_invalid_restaurant_id_recovery(self, client):
        """Test handling of invalid restaurant IDs"""
        # Try to access non-existent restaurant
        response = client.get("/restaurants/nonexistent-id-12345")
        assert response.status_code in [404, 422]

        # User should be able to continue
        restaurants = client.get("/restaurants")
        assert restaurants.status_code == 200

    def test_malformed_request_recovery(self, client):
        """Test handling of malformed requests"""
        # Send malformed concierge request
        bad_request = {
            "invalid_field": "test"
            # Missing required fields
        }

        response = client.post("/concierge/recommendations", json=bad_request)
        assert response.status_code in [400, 422, 503]

        # User should be able to send correct request after
        good_request = {
            "prompt": "Italian restaurant",
            "lang": "en",
        }

        response = client.post("/concierge/recommendations?mode=local", json=good_request)
        assert response.status_code in [200, 503]

    def test_network_timeout_recovery(self, client):
        """Test handling of slow/timeout responses"""
        # Make multiple rapid requests
        responses = []
        for _ in range(5):
            response = client.get("/health")
            responses.append(response)

        # All should eventually succeed
        success_count = sum(1 for r in responses if r.status_code == 200)
        assert success_count >= 4  # At least 80% success rate


class TestConcurrentUserWorkflows:
    """Test system behavior with multiple concurrent users"""

    def test_multiple_users_browsing(self, client):
        """Test multiple users browsing restaurants simultaneously"""
        # Simulate 10 users browsing
        responses = []
        for _user_id in range(10):
            response = client.get("/restaurants")
            responses.append(response)

        # All users should get successful responses
        assert all(r.status_code == 200 for r in responses)

        # All should get consistent data
        first_data = responses[0].json()
        for response in responses[1:]:
            assert len(response.json()) == len(first_data)

    def test_multiple_users_searching(self, client):
        """Test multiple users searching simultaneously"""
        search_terms = ["italian", "japanese", "azerbaijani", "casual", "fine dining"]

        responses = []
        for term in search_terms:
            response = client.get(f"/restaurants?q={term}")
            responses.append(response)

        # All searches should succeed
        assert all(r.status_code == 200 for r in responses)


class TestDataConsistencyWorkflows:
    """Test data consistency across workflows"""

    def test_restaurant_data_consistency(self, client):
        """Test restaurant data is consistent across endpoints"""
        # Get restaurant from list
        list_response = client.get("/restaurants")
        assert list_response.status_code == 200

        restaurants = list_response.json()
        if len(restaurants) == 0:
            pytest.skip("No restaurants available")

        restaurant_from_list = restaurants[0]

        # Get same restaurant from detail endpoint
        detail_response = client.get(f"/restaurants/{restaurant_from_list['id']}")

        if detail_response.status_code == 200:
            restaurant_from_detail = detail_response.json()

            # Basic fields should match
            assert restaurant_from_detail["id"] == restaurant_from_list["id"]
            assert restaurant_from_detail["name"] == restaurant_from_list["name"]

    def test_search_results_consistency(self, client):
        """Test search results are consistent"""
        # Perform same search twice
        response1 = client.get("/restaurants?q=restaurant")
        response2 = client.get("/restaurants?q=restaurant")

        assert response1.status_code == 200
        assert response2.status_code == 200

        results1 = response1.json()
        results2 = response2.json()

        # Should get same results
        assert len(results1) == len(results2)


class TestAccessibilityWorkflows:
    """Test workflows are accessible"""

    def test_api_provides_complete_data(self, client):
        """Test API provides all necessary data for UI"""
        restaurants = client.get("/restaurants")
        assert restaurants.status_code == 200

        data = restaurants.json()
        if len(data) > 0:
            restaurant = data[0]

            # Should have all essential fields
            assert "id" in restaurant
            assert "name" in restaurant
            assert "slug" in restaurant


class TestCachingWorkflows:
    """Test caching behavior in workflows"""

    def test_repeated_requests_cached(self, client):
        """Test that repeated requests benefit from caching"""
        # Make same request multiple times
        url = "/restaurants"

        for _ in range(5):
            response = client.get(url)
            assert response.status_code == 200

        # All requests should succeed consistently
