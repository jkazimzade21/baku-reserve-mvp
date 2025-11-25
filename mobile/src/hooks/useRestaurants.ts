import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchRestaurants, type RestaurantSummary } from '../api';
import { NORMALIZED_RESTAURANT_SEED } from '../data/restaurantsSeedNormalized';
import { normalizeRestaurantSummary } from '../utils/normalizeRestaurant';

type LoadOptions = {
  refreshing?: boolean;
};

export function useRestaurants(initialQuery = '') {
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>(NORMALIZED_RESTAURANT_SEED);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const queryRef = useRef(initialQuery);

  const load = useCallback(
    async (nextQuery?: string, opts?: LoadOptions) => {
      const effectiveQuery =
        typeof nextQuery === 'string' ? nextQuery : queryRef.current;
      if (typeof nextQuery === 'string') {
        queryRef.current = nextQuery;
        setQuery(nextQuery);
      }

      try {
        if (opts?.refreshing) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);
        const results = await fetchRestaurants(
          effectiveQuery.length ? effectiveQuery : undefined,
        );
        const normalized = results.map((entry) => normalizeRestaurantSummary(entry));
        if (normalized.length === 0 && !effectiveQuery.length) {
          setRestaurants(NORMALIZED_RESTAURANT_SEED);
        } else {
          setRestaurants(normalized);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load restaurants');
        setRestaurants((prev) => (prev.length ? prev : NORMALIZED_RESTAURANT_SEED));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    load(initialQuery);
  }, [initialQuery, load]);

  return {
    restaurants,
    loading,
    refreshing,
    error,
    query,
    setQuery: (value: string) => {
      queryRef.current = value;
      setQuery(value);
    },
    reload: (opts?: LoadOptions) => load(undefined, opts),
    search: (value: string, opts?: LoadOptions) => load(value, opts),
    clear: () => load(''),
  };
}

export type UseRestaurantsReturn = ReturnType<typeof useRestaurants>;
