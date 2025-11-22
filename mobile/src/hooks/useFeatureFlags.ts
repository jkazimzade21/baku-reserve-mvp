import { useCallback, useEffect, useState } from 'react';

import { fetchFeatureFlags, type FeatureFlags } from '../api';

let cachedFlags: FeatureFlags | null = null;
let pendingRequest: Promise<FeatureFlags> | null = null;

const DEFAULT_ERROR = 'Feature settings unavailable';

async function loadFlags(force = false): Promise<FeatureFlags> {
  if (!force && cachedFlags) {
    return cachedFlags;
  }
  if (!force && pendingRequest) {
    return pendingRequest;
  }
  pendingRequest = fetchFeatureFlags()
    .then((result) => {
      cachedFlags = result;
      return result;
    })
    .finally(() => {
      pendingRequest = null;
    });
  return pendingRequest;
}

export function useFeatureFlags(enabled = true) {
  const [flags, setFlags] = useState<FeatureFlags | null>(() => (enabled ? cachedFlags : null));
  const [loading, setLoading] = useState(Boolean(enabled && !cachedFlags));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      return null;
    }
    setLoading(true);
    try {
      const next = await loadFlags(true);
      setFlags(next);
      setError(null);
      return next;
    } catch (err: any) {
      const message = err?.message || DEFAULT_ERROR;
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || cachedFlags) {
      setLoading(false);
      if (!enabled) {
        setFlags(null);
      }
      return;
    }
    let mounted = true;
    loadFlags()
      .then((result) => {
        if (!mounted) return;
        setFlags(result);
        setError(null);
        setLoading(false);
      })
      .catch((err: any) => {
        if (!mounted) return;
        setError(err?.message || DEFAULT_ERROR);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [enabled]);

  return { flags, loading, error, refresh };
}
