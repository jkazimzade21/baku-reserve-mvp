import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { fetchReservationsList, type Reservation } from '../api';

function pickNextReservation(reservations: Reservation[]): Reservation | null {
  const now = Date.now();
  const future = reservations
    .map((reservation) => ({ reservation, start: new Date(reservation.start).getTime() }))
    .filter((entry) => Number.isFinite(entry.start) && entry.start >= now)
    .sort((a, b) => a.start - b.start);
  return future[0]?.reservation ?? null;
}

export function useUpcomingReservation(enabled: boolean) {
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setReservation(null);
      return null;
    }
    setLoading(true);
    try {
      const data = await fetchReservationsList();
      const next = pickNextReservation(data);
      setReservation(next);
      setError(null);
      return next;
    } catch (err: any) {
      setError(err?.message || 'Unable to load reservations');
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        setReservation(null);
        setError(null);
        return undefined;
      }
      load();
      return () => {
        setLoading(false);
      };
    }, [enabled, load]),
  );

  return { reservation, loading, error, refresh: load };
}
