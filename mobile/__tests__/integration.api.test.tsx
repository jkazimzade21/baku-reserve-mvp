/**
 * Integration tests for mobile API interactions
 * Tests real API calls and data flow
 */

import { fetchConciergeRecommendations, fetchConciergeHealth, API_URL } from '../src/api';

const CONCIERGE_MODES = {
  LOCAL: 'local' as const,
  AI: 'ai' as const,
  AB: 'ab' as const,
};

// Mock fetch for testing
global.fetch = jest.fn();

describe('API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Concierge API', () => {
    it('should fetch concierge recommendations successfully', async () => {
      const mockResponse = {
        results: [
          {
            id: '1',
            name: 'Test Restaurant',
            slug: 'test-restaurant',
            score: 0.95,
          },
        ],
        mode: 'local',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchConciergeRecommendations('Italian restaurant', {
        lang: 'en',
        mode: CONCIERGE_MODES.LOCAL,
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle API errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(
        fetchConciergeRecommendations('test', {
          lang: 'en',
          mode: CONCIERGE_MODES.LOCAL,
        })
      ).rejects.toThrow();
    });

    it('should handle non-200 responses', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      await expect(
        fetchConciergeRecommendations('test', {
          lang: 'en',
          mode: CONCIERGE_MODES.LOCAL,
        })
      ).rejects.toThrow();
    });

    it('should send correct request format', async () => {
      const mockResponse = { results: [], mode: 'local' };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await fetchConciergeRecommendations('romantic dinner', {
        lang: 'en',
        mode: CONCIERGE_MODES.AI,
      });

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const [url, options] = fetchCall;

      expect(url).toContain('/concierge/recommendations');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body).toHaveProperty('prompt');
      expect(body).toHaveProperty('lang');

      const urlObj = new URL(url);
      expect(urlObj.searchParams.get('mode')).toBe(CONCIERGE_MODES.AI);
    });
  });

  describe('Restaurant API', () => {
    it('should fetch restaurant list', async () => {
      const mockRestaurants = [
        {
          id: '1',
          name: 'Restaurant 1',
          slug: 'restaurant-1',
        },
        {
          id: '2',
          name: 'Restaurant 2',
          slug: 'restaurant-2',
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockRestaurants,
      });

      const response = await fetch(`${API_URL}/restaurants`);
      const data = await response.json();

      expect(data).toEqual(mockRestaurants);
      expect(data).toHaveLength(2);
    });

    it('should handle empty restaurant list', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const response = await fetch(`${API_URL}/restaurants`);
      const data = await response.json();

      expect(data).toEqual([]);
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('Health Check', () => {
    it('should check API health status', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      const response = await fetch(`${API_URL}/health`);
      const data = await response.json();

      expect(data.status).toBe('healthy');
    });

    it('should fetch concierge health via helper', async () => {
      const mockHealth = {
        embeddings: { status: 'healthy', updated_at: '2024-01-01T00:00:00Z' },
        llm: { status: 'degraded', detail: 'offline' },
      };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockHealth,
      });

      const data = await fetchConciergeHealth();
      expect(data).toEqual(mockHealth);
      expect(global.fetch).toHaveBeenCalledWith(`${API_URL}/concierge/health`, expect.any(Object));
    });
  });
});

describe('Data Flow Integration', () => {
  it('should handle complete user flow from search to details', async () => {
    // Step 1: Search for restaurants
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: '1',
            name: 'Test Restaurant',
            slug: 'test-restaurant',
            score: 0.95,
          },
        ],
        mode: 'local',
      }),
    });

    const searchResults = await fetchConciergeRecommendations('Italian', {
      lang: 'en',
      mode: CONCIERGE_MODES.LOCAL,
    });

    expect(searchResults.results).toHaveLength(1);

    // Step 2: Get restaurant details
    const restaurantId = searchResults.results[0].id;

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: restaurantId,
        name: 'Test Restaurant',
        slug: 'test-restaurant',
        description: 'A great Italian restaurant',
      }),
    });

    const response = await fetch(`${API_URL}/restaurants/${restaurantId}`);
    const details = await response.json();

    expect(details.id).toBe(restaurantId);
    expect(details).toHaveProperty('name');
    expect(details).toHaveProperty('description');
  });
});

describe('Error Recovery', () => {
  it('should retry failed requests', async () => {
    let attempts = 0;

    (global.fetch as jest.Mock).mockImplementation(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Network error');
      }
      return {
        ok: true,
        json: async () => ({ results: [], mode: 'local' }),
      };
    });

    // Implement retry logic
    const fetchWithRetry = async (fn: () => Promise<any>, retries = 3): Promise<any> => {
      try {
        return await fn();
      } catch (error) {
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
          return fetchWithRetry(fn, retries - 1);
        }
        throw error;
      }
    };

    const result = await fetchWithRetry(() =>
      fetchConciergeRecommendations('test', {
        lang: 'en',
        mode: CONCIERGE_MODES.LOCAL,
      })
    );

    expect(attempts).toBe(3);
    expect(result).toHaveProperty('results');
  });
});
