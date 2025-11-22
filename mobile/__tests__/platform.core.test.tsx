import type {
  AvailabilityResponse,
  Reservation,
  ReservationPayload,
  RestaurantDetail,
  RestaurantSummary,
} from '../src/api';
import {
  findSlotForTime,
  getSelectionTimestamp,
  getSuggestedSlots,
} from '../src/utils/availability';
import { hexToRgba } from '../src/utils/color';
import type { AreaDetail } from '../src/api';
import { normalizeAreaGeometry } from '../src/utils/geometry';

type ApiModule = typeof import('../src/api');

declare const global: typeof globalThis & { fetch: jest.Mock };

const createResponse = <T,>(overrides: Partial<Response> & { body?: T; ok?: boolean } = {}) => {
  const ok = overrides.ok ?? true;
  const body = overrides.body;

  return {
    ok,
    status: overrides.status ?? (ok ? 200 : 500),
    json: jest.fn(async () => body),
    text: jest.fn(async () => JSON.stringify(body ?? {})),
  } as unknown as Response;
};

describe('Platform core wiring', () => {
  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('API gateway', () => {
    beforeEach(() => {
      jest.resetModules();
      jest.clearAllMocks();
      process.env.EXPO_PUBLIC_API_BASE = 'http://api.test';
      global.fetch = jest.fn();
      jest.doMock('expo-constants', () => ({
        expoConfig: { extra: {} },
        manifest: null,
      }));
    });

    afterEach(() => {
      delete process.env.EXPO_PUBLIC_API_BASE;
      jest.resetModules();
    });

    const loadApi = (): ApiModule => {
      let api: ApiModule | undefined;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        api = require('../src/api');
      });
      if (!api) {
        throw new Error('API module failed to load');
      }
      return api;
    };

    it('fetches restaurants with and without a query', async () => {
      const { fetchRestaurants } = loadApi();
      (global.fetch as jest.Mock).mockResolvedValueOnce(createResponse<RestaurantSummary[]>({ body: [] }));
      await fetchRestaurants();
      expect(global.fetch).toHaveBeenCalledWith(
        'http://api.test/v1/restaurants',
        expect.objectContaining({ headers: {} }),
      );

      (global.fetch as jest.Mock).mockResolvedValueOnce(createResponse<RestaurantSummary[]>({ body: [] }));
      await fetchRestaurants('Dolma & Co');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://api.test/v1/restaurants?q=Dolma%20%26%20Co',
        expect.objectContaining({ headers: {} }),
      );
    });

    it('fetches a single restaurant detail payload', async () => {
      const { fetchRestaurant } = loadApi();
      const detail: RestaurantDetail = { id: 'r-1', name: 'Test', cuisine: [], areas: [] };
      (global.fetch as jest.Mock).mockResolvedValueOnce(createResponse<RestaurantDetail>({ body: detail }));

      const payload = await fetchRestaurant('r-1');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://api.test/v1/restaurants/r-1',
        expect.objectContaining({ headers: {} }),
      );
      expect(payload).toEqual(detail);
    });

    it('fetches availability using encoded params', async () => {
      const { fetchAvailability } = loadApi();
      const slots: AvailabilityResponse = { slots: [] };
      (global.fetch as jest.Mock).mockResolvedValueOnce(createResponse<AvailabilityResponse>({ body: slots }));

      await fetchAvailability('r-2', '2024-08-01', 4);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://api.test/v1/restaurants/r-2/availability?date=2024-08-01&party_size=4',
        expect.objectContaining({ headers: {} }),
      );
    });

    it('creates and lists reservations through the API', async () => {
      const { createReservation, fetchReservationsList } = loadApi();
      const payload: ReservationPayload = {
        restaurant_id: 'r-3',
        party_size: 2,
        start: '2024-08-01T18:00:00Z',
        end: '2024-08-01T20:00:00Z',
        guest_name: 'Guest',
      };
      const reservation: Reservation = {
        id: 'res-1',
        restaurant_id: 'r-3',
        party_size: 2,
        start: payload.start,
        end: payload.end,
        status: 'booked',
      };
      (global.fetch as jest.Mock).mockResolvedValueOnce(createResponse<Reservation>({ body: reservation }));
      const created = await createReservation(payload);
      expect(global.fetch).toHaveBeenCalledWith('http://api.test/v1/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(created).toEqual(reservation);

      (global.fetch as jest.Mock).mockResolvedValueOnce(createResponse<Reservation[]>({ body: [reservation] }));
      const listed = await fetchReservationsList();
      expect(global.fetch).toHaveBeenCalledWith(
        'http://api.test/v1/reservations',
        expect.objectContaining({ headers: {} }),
      );
      expect(listed).toEqual([reservation]);
    });

    it('bubbles API error detail strings', async () => {
      const { fetchRestaurants } = loadApi();
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        createResponse({ ok: false, status: 404, body: { detail: 'Missing' } }),
      );

      await expect(fetchRestaurants()).rejects.toThrow('Missing');
    });
  });

  describe('Expo configuration plumbing', () => {
    const mockFs = () => {
      jest.doMock('fs', () => ({
        existsSync: jest.fn(() => false),
        readFileSync: jest.fn(),
      }));
    };

    const loadConfig = () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const factory = require('../app.config.js');
      return factory();
    };

    beforeEach(() => {
      jest.resetModules();
      delete process.env.EXPO_PUBLIC_API_BASE;
    });

    afterEach(() => {
      jest.dontMock('fs');
    });

    it('injects EXPO_PUBLIC_API_BASE into extra.apiUrl', () => {
      mockFs();
      process.env.EXPO_PUBLIC_API_BASE = 'http://api.from.env:1234';
      const config = loadConfig();
      expect(config.expo.extra.apiUrl).toBe('http://api.from.env:1234');
    });

    it('retains default extra config when env override absent', () => {
      mockFs();
      const config = loadConfig();
      expect(config.expo.extra.apiUrl).toBeNull();
    });
  });
});

describe('Utility helpers', () => {
  describe('availability timeline utilities', () => {
    const baseSlots = [
      {
        start: '2025-05-01T18:00:00-05:00',
        end: '2025-05-01T20:00:00-05:00',
        available_table_ids: ['t1', 't2'],
        hold_ids: [],
      },
      {
        start: '2025-05-01T19:30:00-05:00',
        end: '2025-05-01T21:30:00-05:00',
        available_table_ids: ['t1'],
        hold_ids: [],
      },
      {
        start: '2025-05-01T21:00:00-05:00',
        end: '2025-05-01T23:00:00-05:00',
        available_table_ids: ['t3'],
        hold_ids: [],
      },
    ] as const;
    const testTimezone = 'America/Chicago';

    it('locates the slot matching a selected time', () => {
      const match = findSlotForTime(baseSlots as any, '2025-05-01', '19:30', testTimezone);
      expect(match).toBe(baseSlots[1]);
    });

    it('returns null when target time is missing', () => {
      expect(findSlotForTime(baseSlots as any, '2025-05-01', '17:15', testTimezone)).toBeNull();
    });

    it('suggests slots ordered by proximity to target', () => {
      const target = getSelectionTimestamp('2025-05-01', '19:00', testTimezone);
      const suggestions = getSuggestedSlots(baseSlots as any, target, 2, testTimezone);
      expect(suggestions).toHaveLength(2);
      expect(suggestions[0]).toBe(baseSlots[1]);
      expect(suggestions[1]).toBe(baseSlots[0]);
    });
  });

  describe('color helpers', () => {
    it('converts long and shorthand hex to rgba', () => {
      expect(hexToRgba('#336699', 0.5)).toBe('rgba(51, 102, 153, 0.5)');
      expect(hexToRgba('#1af', 0.3)).toBe('rgba(17, 170, 255, 0.3)');
    });

    it('returns original input for invalid values', () => {
      expect(hexToRgba('rgb(0,0,0)', 0.5)).toBe('rgb(0,0,0)');
      expect(hexToRgba('#zzzzzz', 0.5)).toBe('#zzzzzz');
      expect(hexToRgba('', 0.5)).toBe('');
    });
  });

  describe('seat-map geometry normalisation', () => {
    it('normalises tables/landmarks into viewport bounds without mutation', () => {
      const area: AreaDetail = {
        id: 'area-1',
        name: 'Panorama Terrace',
        tables: [
          {
            id: 'table-1',
            name: 'T1',
            capacity: 4,
            position: [200, 400],
            footprint: [
              [180, 380],
              [220, 380],
              [220, 420],
              [180, 420],
            ],
          },
          {
            id: 'table-2',
            name: 'T2',
            capacity: 2,
            position: [640, 820],
          },
        ],
        landmarks: [
          {
            id: 'bar',
            label: 'Signature Bar',
            type: 'bar',
            position: [720, 510],
            footprint: [
              [700, 490],
              [740, 490],
              [740, 530],
              [700, 530],
            ],
          },
        ],
      };

      const originalPosition = area.tables[0]?.position && [...area.tables[0].position];
      const normalized = normalizeAreaGeometry(area);

      expect(area.tables[0]?.position).toEqual(originalPosition);
      expect(normalized).not.toBe(area);
      normalized.tables?.forEach((table) => {
        table.position?.forEach((value) => {
          expect(value).toBeGreaterThanOrEqual(8);
          expect(value).toBeLessThanOrEqual(92);
        });
      });
      expect(normalized.landmarks?.[0]?.position?.[0]).toBeGreaterThanOrEqual(8);
      expect(normalized.landmarks?.[0]?.position?.[0]).toBeLessThanOrEqual(92);
    });

    it('centres points when all coordinates overlap', () => {
      const area: AreaDetail = {
        id: 'flat',
        name: 'Chef Counter',
        tables: [
          {
            id: 'single',
            name: 'C1',
            capacity: 4,
            position: [500, 500],
          },
        ],
      };
      const normalized = normalizeAreaGeometry(area);
      expect(normalized.tables?.[0]?.position).toEqual([50, 50]);
    });
  });
});
