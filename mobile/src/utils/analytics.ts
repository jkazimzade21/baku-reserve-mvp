import type { FeatureFlags } from '../api';

export type AnalyticsEvent =
  | 'home_search_tap'
  | 'concierge_open'
  | 'concierge_suggest'
  | 'concierge_book_intent'
  | 'section_view'
  | 'availability_signal_view';

type SectionSlug = 'most_booked' | 'events' | 'trending';

type AnalyticsPayload = Record<string, unknown> | undefined;

const subscribers: Array<(event: AnalyticsEvent, payload?: AnalyticsPayload) => void> = [];

export function subscribeAnalytics(listener: (event: AnalyticsEvent, payload?: AnalyticsPayload) => void) {
  subscribers.push(listener);
  return () => {
    const index = subscribers.indexOf(listener);
    if (index !== -1) {
      subscribers.splice(index, 1);
    }
  };
}

export function track(event: AnalyticsEvent, payload?: AnalyticsPayload) {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[analytics] ${event}`, payload ?? {});
  }
  subscribers.forEach((listener) => {
    try {
      listener(event, payload);
    } catch (err) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[analytics] subscriber failed', err);
      }
    }
  });
}

export function trackSectionView(section: SectionSlug, extras?: Record<string, unknown>) {
  track('section_view', { section, ...extras });
}

export function trackAvailabilitySignal(
  surface: string,
  ratio: number,
  slotStart: string,
  flags?: FeatureFlags | null,
) {
  track('availability_signal_view', {
    surface,
    ratio,
    slot_start: slotStart,
    availabilitySignals: Boolean(flags?.availabilitySignals ?? flags?.ui?.availabilitySignals),
  });
}
