import type { AreaDetail, RestaurantDetail } from '../api';

// NOTE: replace buildMockVenue with server-provided CAD geometry importer once admin tooling exports SVG/JSON footprints.

export type MockVenue = RestaurantDetail & {
  areas: Array<AreaDetail & { seed?: number }>;
};

type Random = () => number;

const textures = ['linen', 'marble', 'wood', 'velvet'] as const;
const accents = ['#E7A977', '#F4978E', '#D9B99B', '#A3A380'] as const;

const tags = ['window', 'chef_counter', 'accessible', 'celebration', 'anniversary', 'sunset'];

const seededRandom = (seed: number): Random => {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => (value = (value * 16807) % 2147483647) / 2147483647;
};

export const buildMockVenue = (seed = 1): MockVenue => {
  const random = seededRandom(seed);
  const base: MockVenue = {
    id: `mock-${seed}`,
    name: 'Sunset Lounge Preview',
    cuisine: ['Modern European'],
    city: 'Baku',
    short_description: 'A fictional venue used for SeatPicker interaction previews.',
    price_level: 'AZN 3/4',
    tags: ['book_early', 'skyline'],
    areas: [],
  } as MockVenue;

  const zoneNames = ['Dining Room', 'Lounge Pods', 'Terrace'];

  base.areas = zoneNames.map((zone, index) => {
    const zoneSeed = Math.floor(random() * 1000) + index;
    const zoneRand = seededRandom(zoneSeed);
    const texture = textures[index % textures.length];
    const accent = accents[index % accents.length];

    const tables = Array.from({ length: 7 }, (_, tableIndex) => {
      const capacity = tableIndex % 3 === 0 ? 6 : tableIndex % 2 === 0 ? 4 : 2;
      const baseX = 12 + tableIndex * 12 + zoneRand() * 4;
      const baseY = 26 + zoneRand() * 40;
      const tagCount = 1 + Math.floor(zoneRand() * 2);

      return {
        id: `${zoneSeed}-table-${tableIndex}`,
        name: `${zone.slice(0, 1)}${tableIndex + 1}`,
        capacity,
        position: [Math.min(88, baseX), Math.min(88, baseY)] as [number, number],
        shape: capacity >= 6 ? 'booth' : tableIndex % 2 === 0 ? 'rect' : 'circle',
        tags: Array.from({ length: tagCount }, () => tags[Math.floor(zoneRand() * tags.length)]),
        noise_level: capacity > 4 ? 'high' : capacity === 4 ? 'medium' : 'low',
        featured: zoneRand() > 0.75,
        rotation: zoneRand() * 12 - 6,
        footprint: capacity >= 4
          ? ([
              [Math.max(4, baseX - 3), Math.max(4, baseY - 3)],
              [Math.min(96, baseX + 3), Math.max(4, baseY - 3)],
              [Math.min(96, baseX + 3), Math.min(96, baseY + 3)],
              [Math.max(4, baseX - 3), Math.min(96, baseY + 3)],
            ] as Array<[number, number]>)
          : undefined,
      };
    });

    return {
      id: `${base.id}-zone-${index}`,
      name: zone,
      seed: zoneSeed,
      theme: {
        texture,
        ambientLight: `rgba(231, 169, 119, ${0.12 + index * 0.04})`,
        accent,
      },
      landmarks: index === 0
        ? [
            {
              id: `${base.id}-landmark-kitchen`,
              label: 'Chef Kitchen',
              type: 'kitchen',
              position: [82, 18] as [number, number],
              footprint: [[74, 12], [92, 12], [92, 24], [74, 24]],
            },
          ]
        : index === 1
        ? [
            {
              id: `${base.id}-landmark-dj`,
              label: 'DJ Booth',
              type: 'stage',
              position: [18, 18] as [number, number],
              footprint: [[12, 12], [24, 12], [24, 22], [12, 22]],
            },
          ]
        : [
            {
              id: `${base.id}-landmark-firepit`,
              label: 'Fire Pit',
              type: 'stage',
              position: [46, 74] as [number, number],
              footprint: [[40, 68], [52, 68], [52, 80], [40, 80]],
            },
          ],
      tables,
    } as AreaDetail & { seed: number };
  });

  return base;
};

export const MOCK_VENUES = Array.from({ length: 3 }, (_, index) => buildMockVenue(index + 1));
