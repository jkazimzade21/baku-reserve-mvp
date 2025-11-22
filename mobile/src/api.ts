import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type {
  Reservation as ApiReservation,
  ReservationCreate as ApiReservationPayload,
  Restaurant as ApiRestaurantDetail,
  RestaurantListItem as ApiRestaurantSummary,
} from './types/server';

type ExtraConfig = {
  apiUrl?: string;
  API_URL?: string;
  conciergeMode?: string;
  CONCIERGE_MODE?: string;
};

export type RestaurantSummary = ApiRestaurantSummary;

export type ConciergeMode = 'local' | 'ai' | 'ab';

export type ConciergeResponse = {
  results: RestaurantSummary[];
  match_reason: Record<string, string[]>;
  explanations?: Record<string, string>;
  mode?: ConciergeMode;
};

export type ConciergeHealthStatus = {
  status: 'unknown' | 'healthy' | 'degraded';
  updated_at?: string | null;
  detail?: string | null;
};

export type ConciergeHealth = {
  embeddings: ConciergeHealthStatus;
  llm: ConciergeHealthStatus;
};

export type TableGeometry = {
  position?: [number, number];
  rotation?: number;
  footprint?: Array<[number, number]>;
  hotspot?: [number, number];
};

export type TableDetail = {
  id: string;
  name: string;
  capacity: number;
  position?: [number, number];
  shape?: 'circle' | 'rect' | 'booth' | 'pod';
  tags?: string[];
  category?: string;
  noise_level?: 'low' | 'medium' | 'high';
  featured?: boolean;
  rotation?: number;
  footprint?: Array<[number, number]>;
  geometry?: TableGeometry;
};

export type AreaDetail = {
  id: string;
  name: string;
  tables: TableDetail[];
  theme?: {
    texture?: 'linen' | 'wood' | 'marble' | 'velvet';
    ambientLight?: string;
    accent?: string;
  };
  landmarks?: Array<{
    id: string;
    label: string;
    type: 'bar' | 'kitchen' | 'washroom' | 'stage' | 'entrance';
    position: [number, number];
    footprint?: Array<[number, number]>;
  }>;
};

export type RestaurantDetail = Omit<ApiRestaurantDetail, 'areas'> & {
  areas?: AreaDetail[];
};

export type AvailabilitySlot = {
  start: string;
  end: string;
  count: number;
  available_table_ids: string[];
};

export type AvailabilityResponse = {
  slots: AvailabilitySlot[];
  restaurant_timezone?: string | null;
};

export type Reservation = ApiReservation;

export type ReservationPayload = ApiReservationPayload;

export type FeatureFlags = {
  prep_notify_enabled: boolean;
  availabilitySignals?: boolean;
  concierge_home_link?: boolean;
  payments_mode: 'mock' | 'live' | string;
  payment_provider: 'mock' | 'paymentwall' | 'azericard' | string;
  currency: string;
  ui?: {
    homeConciergeLink?: boolean;
    availabilitySignals?: boolean;
  };
  experiments?: {
    homeHeroSwap?: boolean;
  };
};

export type PreorderRequestPayload = {
  minutes_away: number;
  scope: 'starters' | 'full';
  items?: string[];
};

export type PreorderQuoteResponse = {
  policy: string;
  recommended_prep_minutes: number;
};

export type AccountProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  verified_email: boolean;
  verified_phone: boolean;
  created_at: string;
  updated_at: string;
};


const extra: ExtraConfig =
  (Constants?.expoConfig?.extra as ExtraConfig | undefined) ??
  ((Constants as any).manifest?.extra as ExtraConfig | undefined) ??
  {};

const DEFAULT_BASE = Platform.select({
  ios: 'http://localhost:8000',
  android: 'http://10.0.2.2:8000',
  default: 'http://192.168.0.148:8000',
});

const rawHostCandidates: Array<string | undefined> = [
  Constants.expoConfig?.hostUri,
  Constants.expoConfig?.extra?.expoGo?.hostUri,
  Constants.expoConfig?.extra?.expoGo?.debuggerHost,
  (Constants as any).manifest2?.extra?.expoGo?.hostUri,
  (Constants as any).manifest2?.extra?.expoGo?.debuggerHost,
  (Constants as any).manifest?.hostUri,
  (Constants as any).manifest?.debuggerHost,
  Constants.linkingUri,
];

const BUNDLER_PORTS = new Set(['19000', '19001', '8081', '8082']);

let derivedHost: string | undefined;
for (const candidate of rawHostCandidates) {
  if (!candidate) continue;
  let cleaned = candidate.trim();
  if (!cleaned) continue;
  if (cleaned.includes('://')) {
    const [, remainder] = cleaned.split('://');
    cleaned = remainder || cleaned;
  }
  cleaned = cleaned.split('?')[0] ?? cleaned;
  cleaned = cleaned.split('#')[0] ?? cleaned;
  cleaned = cleaned.replace(/^\/+/, '');
  const slashIndex = cleaned.indexOf('/');
  if (slashIndex !== -1) {
    cleaned = cleaned.slice(0, slashIndex);
  }
  const [hostPartRaw, portRaw] = cleaned.split(':');
  const hostPart = hostPartRaw?.trim();
  if (!hostPart || hostPart === '127.0.0.1' || hostPart === 'localhost') {
    continue;
  }
  const detectedPort = portRaw && /^\d+$/.test(portRaw) ? portRaw : undefined;
  const preferredPort =
    detectedPort && !BUNDLER_PORTS.has(detectedPort) ? detectedPort : '8000';
  derivedHost = `http://${hostPart}:${preferredPort}`;
  break;
}

const RAW_API_HOST =
  extra.apiUrl ||
  extra.API_URL ||
  derivedHost ||
  DEFAULT_BASE ||
  'http://localhost:8000';

const envOverrideTracker = new Set<string>();

const getGlobalProcessEnv = () => {
  try {
    // eslint-disable-next-line no-new-func
    return new Function('return (typeof process !== "undefined" && process.env) || undefined;')();
  } catch {
    return undefined;
  }
};

const readEnvValue = (key: string) => {
  const localEnv = typeof process !== 'undefined' ? process.env : undefined;
  const globalEnv = getGlobalProcessEnv();
  const localHasKey = Boolean(localEnv && Object.prototype.hasOwnProperty.call(localEnv, key));

  if (localHasKey) {
    const value = localEnv?.[key];
    if (typeof value === 'string') {
      envOverrideTracker.add(key);
      if (globalEnv) {
        globalEnv[key] = value;
      }
      return value;
    }
    if (envOverrideTracker.has(key)) {
      envOverrideTracker.delete(key);
    }
    if (globalEnv && Object.prototype.hasOwnProperty.call(globalEnv, key)) {
      delete globalEnv[key];
    }
  } else if (envOverrideTracker.has(key)) {
    envOverrideTracker.delete(key);
    if (globalEnv && Object.prototype.hasOwnProperty.call(globalEnv, key)) {
      delete globalEnv[key];
    }
  }

  const fallback = globalEnv?.[key];
  return typeof fallback === 'string' ? fallback : undefined;
};

const normalizeHost = (host: string) => host.replace(/\/+$/, '');

const resolveApiHost = () => {
  const envHost = readEnvValue('EXPO_PUBLIC_API_BASE')?.trim();
  if (envHost) {
    return normalizeHost(envHost);
  }
  return normalizeHost(RAW_API_HOST);
};

const resolveApiBaseUrl = () => `${resolveApiHost()}/v1`;

const buildApiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${resolveApiBaseUrl()}${normalizedPath}`;
};

export const API_URL = resolveApiBaseUrl();

const rawConciergeMode = (extra.conciergeMode || extra.CONCIERGE_MODE || '').toLowerCase();
export const CONCIERGE_MODE: ConciergeMode =
  rawConciergeMode === 'local' || rawConciergeMode === 'ab' || rawConciergeMode === 'ai'
    ? (rawConciergeMode as ConciergeMode)
    : 'ai';

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

function withAuth(headers?: Record<string, string>) {
  if (!authToken) {
    return headers ?? {};
  }
  return {
    Authorization: `Bearer ${authToken}`,
    ...(headers ?? {}),
  };
}

async function handleResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
  if (res.ok) {
    return res.json() as Promise<T>;
  }
  let detail = fallbackMessage;
  try {
    const payload = await res.json();
    detail =
      typeof payload?.detail === 'string'
        ? payload.detail
        : JSON.stringify(payload?.detail ?? fallbackMessage);
  } catch (err) {
    const text = await res.text();
    if (text) detail = text;
  }
  throw new Error(detail);
}

export async function fetchRestaurants(q?: string) {
  const base = buildApiUrl('/restaurants');
  const url = q ? `${base}?q=${encodeURIComponent(q)}` : base;
  const res = await fetch(url, { headers: withAuth() });
  return handleResponse<RestaurantSummary[]>(res, 'Failed to fetch restaurants');
}

export async function fetchRestaurant(id: string) {
  const res = await fetch(buildApiUrl(`/restaurants/${id}`), { headers: withAuth() });
  return handleResponse<RestaurantDetail>(res, 'Restaurant not found');
}

export async function fetchAvailability(id: string, dateStr: string, partySize: number) {
  const url = `${buildApiUrl(`/restaurants/${id}/availability`)}?date=${encodeURIComponent(dateStr)}&party_size=${partySize}`;
  const res = await fetch(url, { headers: withAuth() });
  return handleResponse<AvailabilityResponse>(res, 'Failed to fetch availability');
}

export async function createReservation(payload: ReservationPayload) {
  const res = await fetch(buildApiUrl('/reservations'), {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return handleResponse<Reservation>(res, 'Failed to create reservation');
}

export async function fetchReservationsList() {
  const res = await fetch(buildApiUrl('/reservations'), { headers: withAuth() });
  return handleResponse<Reservation[]>(res, 'Failed to fetch reservations');
}

export async function fetchFeatureFlags() {
  const res = await fetch(buildApiUrl('/config/features'), { headers: withAuth() });
  return handleResponse<FeatureFlags>(res, 'Failed to load feature configuration');
}

export async function getPreorderQuote(reservationId: string, payload: PreorderRequestPayload) {
  const res = await fetch(buildApiUrl(`/reservations/${reservationId}/preorder/quote`), {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return handleResponse<PreorderQuoteResponse>(res, 'Feature currently unavailable.');
}

export async function confirmPreorder(reservationId: string, payload: PreorderRequestPayload) {
  const res = await fetch(buildApiUrl(`/reservations/${reservationId}/preorder/confirm`), {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return handleResponse<Reservation>(res, 'Unable to notify the kitchen. Please try again.');
}

type ConciergeRequestOptions = {
  limit?: number;
  mode?: ConciergeMode;
  lang?: 'en' | 'az' | 'ru';
};

export async function fetchConciergeRecommendations(
  prompt: string,
  options?: ConciergeRequestOptions,
) {
  const payload: { prompt: string; limit: number; lang?: 'en' | 'az' | 'ru' } = {
    prompt,
    limit: Math.min(12, Math.max(1, options?.limit ?? 4)),
  };
  if (options?.lang) {
    payload.lang = options.lang;
  }
  const params = new URLSearchParams();
  if (options?.mode) {
    params.set('mode', options.mode);
  }
  const endpoint =
    params.toString().length > 0
      ? `${buildApiUrl('/concierge/recommendations')}?${params.toString()}`
      : buildApiUrl('/concierge/recommendations');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return handleResponse<ConciergeResponse>(res, 'Concierge is momentarily unavailable.');
}

export async function fetchConciergeHealth() {
  const res = await fetch(buildApiUrl('/concierge/health'), { headers: withAuth() });
  return handleResponse<ConciergeHealth>(res, 'Unable to load concierge health state');
}
