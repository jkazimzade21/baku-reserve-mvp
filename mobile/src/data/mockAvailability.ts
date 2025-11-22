import type { AvailabilitySlot } from '../api';
import { RESTAURANT_SEED } from './restaurantsSeed';

const targetSlugs = new Set(['sahil', 'shirvanshah', 'skygrill', 'dolma', 'prive-steak-gallery-baku']);
const idToSlug = new Map<string, string>();
RESTAURANT_SEED.forEach((restaurant) => {
  if (restaurant.id && restaurant.slug) {
    idToSlug.set(restaurant.id, restaurant.slug);
  }
});

const SLOT_TEMPLATE: Array<{ hour: number; minute: number; durationMinutes: number; tables: number }> = [
  { hour: 18, minute: 0, durationMinutes: 90, tables: 6 },
  { hour: 19, minute: 30, durationMinutes: 90, tables: 4 },
  { hour: 21, minute: 15, durationMinutes: 90, tables: 3 },
];

const buildSlot = (baseDate: Date, hour: number, minute: number, durationMinutes: number, tables: number) => {
  const start = new Date(baseDate);
  start.setHours(hour, minute, 0, 0);
  if (start.getTime() <= Date.now()) {
    start.setDate(start.getDate() + 1);
  }
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + durationMinutes);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    count: tables,
    available_table_ids: [],
  } satisfies AvailabilitySlot;
};

const buildSlots = (): AvailabilitySlot[] => {
  const base = new Date();
  return SLOT_TEMPLATE.map((slot) => buildSlot(base, slot.hour, slot.minute, slot.durationMinutes, slot.tables));
};

export function getMockAvailabilityForRestaurant(id: string): AvailabilitySlot[] {
  const slug = idToSlug.get(id);
  if (!slug || !targetSlugs.has(slug)) {
    return [];
  }
  return buildSlots();
}
