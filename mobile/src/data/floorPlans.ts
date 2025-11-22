import type { FloorOverlay, FloorPlanDefinition } from '../components/floor/types';

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const rectFootprint = (
  position: { x: number; y: number },
  size: { width: number; height: number },
  rotation = 0,
): FloorOverlay['footprint'] => {
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  const cx = position.x;
  const cy = position.y;

  const corners = [
    { x: cx - halfWidth, y: cy - halfHeight },
    { x: cx + halfWidth, y: cy - halfHeight },
    { x: cx + halfWidth, y: cy + halfHeight },
    { x: cx - halfWidth, y: cy + halfHeight },
  ];

  if (!rotation) {
    return corners.map(({ x, y }) => ({ x: clamp(x), y: clamp(y) }));
  }

  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return corners.map(({ x, y }) => {
    const translatedX = x - cx;
    const translatedY = y - cy;
    const rotatedX = translatedX * cos - translatedY * sin;
    const rotatedY = translatedX * sin + translatedY * cos;
    return {
      x: clamp(cx + rotatedX),
      y: clamp(cy + rotatedY),
    };
  });
};

export const RESTAURANT_FLOOR_PLANS: Record<string, FloorPlanDefinition> = {
  'fc34a984-0b39-4f0a-afa2-5b677c61f044': {
    id: 'fc34a984-0b39-4f0a-afa2-5b677c61f044-plan',
    label: 'Sahil Bar & Restaurant',
    variant: 'planA',
    accent: '#F4978E',
    image: require('../../assets/plans/plan_a.png'),
    imageSize: { width: 1324, height: 958 },
    overlays: [
      {
        id: 'entry-foyer',
        type: 'entry',
        title: 'Grand arrival foyer',
        subtitle: 'Seaside Boulevard',
        description: 'Sunset terrace aperitivo with live jazz',
        position: { x: 50, y: 7 },
        size: { width: 24, height: 12 },
        footprint: rectFootprint({ x: 50, y: 7 }, { width: 24, height: 12 }),
        shape: 'rect'
      },
      {
        id: 'north-lounge-west',
        type: 'lounge',
        title: 'Garden lounge pods',
        subtitle: 'Low sofas • mood lighting',
        description: 'Signature Caspian seafood tower finished tableside',
        position: { x: 18, y: 18 },
        size: { width: 24, height: 18 },
        footprint: rectFootprint({ x: 18, y: 18 }, { width: 24, height: 18 }),
        shape: 'rect',
        occupancy: { total: 18, available: 12, onHold: 2 }
      },
      {
        id: 'north-lounge-east',
        type: 'lounge',
        title: 'Atrium settees',
        subtitle: 'Pre-dinner aperitivo',
        description: 'Chef\'s seafood tasting flight (prepaid)',
        position: { x: 82, y: 18 },
        size: { width: 24, height: 18 },
        footprint: rectFootprint({ x: 82, y: 18 }, { width: 24, height: 18 }),
        shape: 'rect',
        occupancy: { total: 20, available: 15, onHold: 1 }
      },
      {
        id: 'private-salon',
        type: 'booth',
        title: 'Private majlis rooms',
        subtitle: 'Bookable salons',
        description: 'Live jazz trio every Friday and Saturday night',
        position: { x: 12, y: 47 },
        size: { width: 24, height: 36 },
        footprint: rectFootprint({ x: 12, y: 47 }, { width: 24, height: 36 }),
        shape: 'rect',
        occupancy: { total: 24, available: 8, onHold: 4 }
      },
      {
        id: 'central-dining-west',
        type: 'table',
        title: 'Central dining (west)',
        subtitle: 'Round tables • ideal for 4',
        description: 'Signature Caspian seafood tower finished tableside',
        position: { x: 36, y: 48 },
        size: { width: 12, height: 12 },
        footprint: rectFootprint({ x: 36, y: 48 }, { width: 12, height: 12 }),
        shape: 'circle',
        occupancy: { total: 16, available: 9 }
      },
      {
        id: 'central-dining-east',
        type: 'table',
        title: 'Central dining (east)',
        subtitle: 'Round tables • stage view',
        description: 'Sunset terrace aperitivo with live jazz',
        position: { x: 64, y: 48 },
        size: { width: 12, height: 12 },
        footprint: rectFootprint({ x: 64, y: 48 }, { width: 12, height: 12 }),
        shape: 'circle',
        occupancy: { total: 16, available: 7, onHold: 2 }
      },
      {
        id: 'golden-terrace',
        type: 'terrace',
        title: 'Golden terrace tables',
        subtitle: 'Sunset vantage',
        description: 'Sunset terrace aperitivo with live jazz',
        position: { x: 87, y: 52 },
        size: { width: 20, height: 32 },
        footprint: rectFootprint({ x: 87, y: 52 }, { width: 20, height: 32 }),
        shape: 'rect',
        occupancy: { total: 22, available: 10 }
      },
      {
        id: 'service-core',
        type: 'service',
        title: 'Service & restrooms',
        subtitle: 'Dedicated attendants',
        description: 'Separate ladies and men suites with vanity stations.',
        position: { x: 14, y: 82 },
        size: { width: 22, height: 24 },
        footprint: rectFootprint({ x: 14, y: 82 }, { width: 22, height: 24 }),
        shape: 'rect'
      },
      {
        id: 'kitchen-suite',
        type: 'kitchen',
        title: 'Open kitchen line',
        subtitle: 'Chefs on stage',
        description: 'Signature Caspian seafood tower finished tableside',
        position: { x: 88, y: 82 },
        size: { width: 18, height: 20 },
        footprint: rectFootprint({ x: 88, y: 82 }, { width: 18, height: 20 }),
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  'a20bb41e-4dad-513b-afb0-9eadc54e02a4': {
    id: 'a20bb41e-4dad-513b-afb0-9eadc54e02a4-plan',
    label: 'Sumakh Restaurant',
    variant: 'planB',
    accent: '#E5A262',
    image: require('../../assets/plans/plan_b.png'),
    imageSize: { width: 1368, height: 980 },
    overlays: [
      {
        id: 'entry-garden',
        type: 'entry',
        title: 'Garden promenade entry',
        subtitle: 'Khatai',
        description: 'Guests arrive through the herb garden and are greeted with chilled towels.',
        position: { x: 44, y: 88 },
        size: { width: 26, height: 12 },
        footprint: rectFootprint({ x: 44, y: 88 }, { width: 26, height: 12 }),
        shape: 'rect'
      },
      {
        id: 'central-bbq',
        type: 'table',
        title: 'Chef’s smoke tables',
        subtitle: 'Live grill benches',
        description: 'Lavash baked to order in a copper tandoor',
        position: { x: 30, y: 42 },
        size: { width: 32, height: 30 },
        footprint: rectFootprint({ x: 30, y: 42 }, { width: 32, height: 30 }),
        shape: 'rect',
        occupancy: { total: 30, available: 18 }
      },
      {
        id: 'piano-lounge',
        type: 'stage',
        title: 'Grand piano lounge',
        subtitle: 'Evening jazz',
        description: 'Tea pairing with regional preserves',
        position: { x: 56, y: 36 },
        size: { width: 16, height: 18 },
        footprint: rectFootprint({ x: 56, y: 36 }, { width: 16, height: 18 }),
        shape: 'rect'
      },
      {
        id: 'chef-line',
        type: 'kitchen',
        title: 'Show kitchen line',
        subtitle: 'Taste the mise en place',
        description: 'Chef\'s copper pot plov presentation',
        position: { x: 68, y: 18 },
        size: { width: 26, height: 20 },
        footprint: rectFootprint({ x: 68, y: 18 }, { width: 26, height: 20 }),
        shape: 'rect'
      },
      {
        id: 'terrace-east',
        type: 'terrace',
        title: 'Sun terrace',
        subtitle: 'Rattan dining',
        description: 'Ideal for long brunches with a mild sea breeze.',
        position: { x: 90, y: 44 },
        size: { width: 22, height: 32 },
        footprint: rectFootprint({ x: 90, y: 44 }, { width: 22, height: 32 }),
        shape: 'rect',
        occupancy: { total: 24, available: 12 }
      },
      {
        id: 'garden-cabanas',
        type: 'lounge',
        title: 'Garden cabanas',
        subtitle: 'Evening hookah & dessert',
        description: 'Lavash baked to order in a copper tandoor',
        position: { x: 80, y: 82 },
        size: { width: 26, height: 18 },
        footprint: rectFootprint({ x: 80, y: 82 }, { width: 26, height: 18 }),
        shape: 'rect',
        occupancy: { total: 18, available: 8 }
      },
      {
        id: 'restrooms-north',
        type: 'service',
        title: 'Restrooms & powder rooms',
        subtitle: 'Separate suites',
        description: 'Dedicated attendants keep the space refreshed throughout service.',
        position: { x: 14, y: 10 },
        size: { width: 22, height: 18 },
        footprint: rectFootprint({ x: 14, y: 10 }, { width: 22, height: 18 }),
        shape: 'rect'
      },
      {
        id: 'cashier-lounge',
        type: 'service',
        title: 'Concierge & cashier',
        subtitle: 'Departure moments',
        description: 'Collect takeaway desserts or settle charges privately.',
        position: { x: 12, y: 32 },
        size: { width: 24, height: 18 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  '77d967f4-1ef0-5011-9412-f31df58392cf': {
    id: '77d967f4-1ef0-5011-9412-f31df58392cf-plan',
    label: 'Chinar Dining',
    variant: 'planC',
    accent: '#B477D4',
    image: require('../../assets/plans/plan_c.png'),
    imageSize: { width: 1368, height: 980 },
    overlays: [
      {
        id: 'counter-bar',
        type: 'bar',
        title: 'Counter bar',
        subtitle: 'Signatures & classics',
        description: 'Robata grill with signature wagyu skewers',
        position: { x: 78, y: 14 },
        size: { width: 28, height: 18 },
        shape: 'rect'
      },
      {
        id: 'lounge-pods',
        type: 'lounge',
        title: 'Lounge pods',
        subtitle: 'Bottle service ready',
        description: 'Chef\'s omakase bar (8 seats)',
        position: { x: 20, y: 34 },
        size: { width: 28, height: 24 },
        shape: 'rect',
        occupancy: { total: 24, available: 10 }
      },
      {
        id: 'dancefloor',
        type: 'stage',
        title: 'Dance floor & DJ island',
        subtitle: 'Switches to late-night mode',
        description: 'Chef\'s omakase bar (8 seats)',
        position: { x: 52, y: 34 },
        size: { width: 24, height: 24 },
        shape: 'rect'
      },
      {
        id: 'open-kitchen',
        type: 'kitchen',
        title: 'Show kitchen',
        subtitle: 'Wok & robata line',
        description: 'Robata grill with signature wagyu skewers',
        position: { x: 50, y: 74 },
        size: { width: 30, height: 20 },
        shape: 'rect'
      },
      {
        id: 'vip-stairs',
        type: 'service',
        title: 'VIP mezzanine access',
        subtitle: 'Private stairway',
        description: 'Ascend to mezzanine suites and semi-private lounges.',
        position: { x: 32, y: 76 },
        size: { width: 20, height: 20 },
        shape: 'rect'
      },
      {
        id: 'karaoke-lounge',
        type: 'booth',
        title: 'Karaoke suites',
        subtitle: 'Bookable by the hour',
        description: 'Pan-Asian brunch with live DJ',
        position: { x: 12, y: 76 },
        size: { width: 20, height: 22 },
        shape: 'rect'
      },
      {
        id: 'vip-bar',
        type: 'bar',
        title: 'Back bar & whisky library',
        subtitle: 'Rare pours nightly',
        description: 'DJ sessions and projection mapping after dark',
        position: { x: 84, y: 64 },
        size: { width: 20, height: 18 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  '173b0b00-829c-52ff-b87e-af395418e9b1': {
    id: '173b0b00-829c-52ff-b87e-af395418e9b1-plan',
    label: 'Shirvanshah Museum Restaurant',
    variant: 'planD',
    accent: '#8CB8B2',
    image: require('../../assets/plans/plan_d.png'),
    imageSize: { width: 1368, height: 848 },
    overlays: [
      {
        id: 'cashier',
        type: 'service',
        title: 'Cashier & concierge',
        subtitle: 'Takeaway counter',
        description: 'Pick up whole cakes, pastries, or pre-ordered hampers here.',
        position: { x: 18, y: 24 },
        size: { width: 22, height: 20 },
        shape: 'rect'
      },
      {
        id: 'bar-rounds',
        type: 'bar',
        title: 'Espresso & cocktail bar',
        subtitle: 'Morning to midnight',
        description: 'Curated rooms themed by Azerbaijani dynasties',
        position: { x: 28, y: 40 },
        size: { width: 26, height: 16 },
        shape: 'rect'
      },
      {
        id: 'living-room',
        type: 'lounge',
        title: 'Living room lounge',
        subtitle: 'Vintage sofas',
        description: 'Curated antique tour before dinner',
        position: { x: 48, y: 52 },
        size: { width: 24, height: 18 },
        shape: 'rect'
      },
      {
        id: 'chef-kitchen',
        type: 'kitchen',
        title: 'Live kitchen island',
        subtitle: 'Chef counter',
        description: 'Curated rooms themed by Azerbaijani dynasties',
        position: { x: 74, y: 18 },
        size: { width: 26, height: 24 },
        shape: 'rect'
      },
      {
        id: 'garden-terrace',
        type: 'terrace',
        title: 'Garden terrace',
        subtitle: 'Open-air dining',
        description: 'Curated antique tour before dinner',
        position: { x: 88, y: 64 },
        size: { width: 20, height: 28 },
        shape: 'rect'
      },
      {
        id: 'dining-salon',
        type: 'table',
        title: 'Dining salon',
        subtitle: 'Communal feasting tables',
        description: 'Nightly mugham ensemble in the courtyard',
        position: { x: 74, y: 42 },
        size: { width: 26, height: 20 },
        shape: 'rect',
        occupancy: { total: 36, available: 20 }
      },
      {
        id: 'restrooms',
        type: 'service',
        title: 'Powder rooms',
        subtitle: 'Ladies and men suites',
        description: 'Freshen up with designer amenities and full-length mirrors.',
        position: { x: 8, y: 10 },
        size: { width: 16, height: 18 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  '4b5d8a1e-afc1-5bed-bc61-3b74be372a56': {
    id: '4b5d8a1e-afc1-5bed-bc61-3b74be372a56-plan',
    label: 'Dolma Restaurant',
    variant: 'planE',
    accent: '#D3B59C',
    image: require('../../assets/plans/plan_e.png'),
    imageSize: { width: 1368, height: 954 },
    overlays: [
      {
        id: 'chef-line',
        type: 'kitchen',
        title: 'Chef line & expo',
        subtitle: 'See the brigade in action',
        description: 'Clay pot dolma sampler spanning the regions',
        position: { x: 76, y: 14 },
        size: { width: 30, height: 18 },
        shape: 'rect'
      },
      {
        id: 'central-hall',
        type: 'table',
        title: 'Great hall tables',
        subtitle: 'Perfect for celebrations',
        description: 'Tandir bread baking demo',
        position: { x: 46, y: 48 },
        size: { width: 36, height: 30 },
        shape: 'rect',
        occupancy: { total: 40, available: 24 }
      },
      {
        id: 'bar-lounge',
        type: 'bar',
        title: 'Wraparound bar',
        subtitle: 'Martini hour from 18:00',
        description: 'Tandir bread baking demo',
        position: { x: 16, y: 34 },
        size: { width: 20, height: 24 },
        shape: 'rect'
      },
      {
        id: 'fireplace-table',
        type: 'booth',
        title: 'Fireplace booths',
        subtitle: 'Cozy hideaways',
        description: 'Underground brick arches with candlelit tables',
        position: { x: 36, y: 30 },
        size: { width: 16, height: 16 },
        shape: 'rect'
      },
      {
        id: 'crescent-lounge',
        type: 'lounge',
        title: 'Crescent lounge',
        subtitle: 'Digestif seating',
        description: 'Sip a nightcap with views into the kitchen theatre.',
        position: { x: 88, y: 44 },
        size: { width: 18, height: 20 },
        shape: 'rect'
      },
      {
        id: 'patio-corner',
        type: 'terrace',
        title: 'Patio & pergola',
        subtitle: 'Open-air tables',
        description: 'Stuffed grape leaf workshop for groups',
        position: { x: 92, y: 72 },
        size: { width: 16, height: 22 },
        shape: 'rect'
      },
      {
        id: 'service-core',
        type: 'service',
        title: 'Service corridor',
        subtitle: 'Expo & staging',
        description: 'Dedicated corridor keeps service efficient and discreet.',
        position: { x: 64, y: 82 },
        size: { width: 24, height: 18 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  '4be8a017-0089-5866-92b2-4e5679ad4e05': {
    id: '4be8a017-0089-5866-92b2-4e5679ad4e05-plan',
    label: 'Firuze Restaurant',
    variant: 'planA',
    accent: '#F4978E',
    image: require('../../assets/plans/plan_a.png'),
    imageSize: { width: 1324, height: 958 },
    overlays: [
      {
        id: 'entry-foyer',
        type: 'entry',
        title: 'Grand arrival foyer',
        subtitle: 'Fountain Square',
        description: 'Tea service with homemade jams',
        position: { x: 50, y: 7 },
        size: { width: 24, height: 12 },
        shape: 'rect'
      },
      {
        id: 'north-lounge-west',
        type: 'lounge',
        title: 'Garden lounge pods',
        subtitle: 'Low sofas • mood lighting',
        description: 'Traditional shah plov encased in lavash',
        position: { x: 18, y: 18 },
        size: { width: 24, height: 18 },
        shape: 'rect',
        occupancy: { total: 18, available: 12, onHold: 2 }
      },
      {
        id: 'north-lounge-east',
        type: 'lounge',
        title: 'Atrium settees',
        subtitle: 'Pre-dinner aperitivo',
        description: 'Table-side shah plov carving',
        position: { x: 82, y: 18 },
        size: { width: 24, height: 18 },
        shape: 'rect',
        occupancy: { total: 20, available: 15, onHold: 1 }
      },
      {
        id: 'private-salon',
        type: 'booth',
        title: 'Private majlis rooms',
        subtitle: 'Bookable salons',
        description: 'Live saz performances on weekends',
        position: { x: 12, y: 47 },
        size: { width: 24, height: 36 },
        shape: 'rect',
        occupancy: { total: 24, available: 8, onHold: 4 }
      },
      {
        id: 'central-dining-west',
        type: 'table',
        title: 'Central dining (west)',
        subtitle: 'Round tables • ideal for 4',
        description: 'Traditional shah plov encased in lavash',
        position: { x: 36, y: 48 },
        size: { width: 12, height: 12 },
        shape: 'circle',
        occupancy: { total: 16, available: 9 }
      },
      {
        id: 'central-dining-east',
        type: 'table',
        title: 'Central dining (east)',
        subtitle: 'Round tables • stage view',
        description: 'Tea service with homemade jams',
        position: { x: 64, y: 48 },
        size: { width: 12, height: 12 },
        shape: 'circle',
        occupancy: { total: 16, available: 7, onHold: 2 }
      },
      {
        id: 'golden-terrace',
        type: 'terrace',
        title: 'Golden terrace tables',
        subtitle: 'Sunset vantage',
        description: 'Tea service with homemade jams',
        position: { x: 87, y: 52 },
        size: { width: 20, height: 32 },
        shape: 'rect',
        occupancy: { total: 22, available: 10 }
      },
      {
        id: 'service-core',
        type: 'service',
        title: 'Service & restrooms',
        subtitle: 'Dedicated attendants',
        description: 'Separate ladies and men suites with vanity stations.',
        position: { x: 14, y: 82 },
        size: { width: 22, height: 24 },
        shape: 'rect'
      },
      {
        id: 'kitchen-suite',
        type: 'kitchen',
        title: 'Open kitchen line',
        subtitle: 'Chefs on stage',
        description: 'Traditional shah plov encased in lavash',
        position: { x: 88, y: 82 },
        size: { width: 18, height: 20 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  '13edc326-a18c-5010-9651-891e8fa77fd9': {
    id: '13edc326-a18c-5010-9651-891e8fa77fd9-plan',
    label: 'Nergiz Restaurant',
    variant: 'planB',
    accent: '#E5A262',
    image: require('../../assets/plans/plan_b.png'),
    imageSize: { width: 1368, height: 980 },
    overlays: [
      {
        id: 'entry-garden',
        type: 'entry',
        title: 'Garden promenade entry',
        subtitle: 'Fountain Square',
        description: 'Guests arrive through the herb garden and are greeted with chilled towels.',
        position: { x: 44, y: 88 },
        size: { width: 26, height: 12 },
        shape: 'rect'
      },
      {
        id: 'central-bbq',
        type: 'table',
        title: 'Chef’s smoke tables',
        subtitle: 'Live grill benches',
        description: 'Clay pot saj platters with seasonal vegetables',
        position: { x: 30, y: 42 },
        size: { width: 32, height: 30 },
        shape: 'rect',
        occupancy: { total: 30, available: 18 }
      },
      {
        id: 'piano-lounge',
        type: 'stage',
        title: 'Grand piano lounge',
        subtitle: 'Evening jazz',
        description: 'Saj platter showcase',
        position: { x: 56, y: 36 },
        size: { width: 16, height: 18 },
        shape: 'rect'
      },
      {
        id: 'chef-line',
        type: 'kitchen',
        title: 'Show kitchen line',
        subtitle: 'Taste the mise en place',
        description: 'Live mugham duets Friday nights',
        position: { x: 68, y: 18 },
        size: { width: 26, height: 20 },
        shape: 'rect'
      },
      {
        id: 'terrace-east',
        type: 'terrace',
        title: 'Sun terrace',
        subtitle: 'Rattan dining',
        description: 'Ideal for long brunches with a mild sea breeze.',
        position: { x: 90, y: 44 },
        size: { width: 22, height: 32 },
        shape: 'rect',
        occupancy: { total: 24, available: 12 }
      },
      {
        id: 'garden-cabanas',
        type: 'lounge',
        title: 'Garden cabanas',
        subtitle: 'Evening hookah & dessert',
        description: 'Clay pot saj platters with seasonal vegetables',
        position: { x: 80, y: 82 },
        size: { width: 26, height: 18 },
        shape: 'rect',
        occupancy: { total: 18, available: 8 }
      },
      {
        id: 'restrooms-north',
        type: 'service',
        title: 'Restrooms & powder rooms',
        subtitle: 'Separate suites',
        description: 'Dedicated attendants keep the space refreshed throughout service.',
        position: { x: 14, y: 10 },
        size: { width: 22, height: 18 },
        shape: 'rect'
      },
      {
        id: 'cashier-lounge',
        type: 'service',
        title: 'Concierge & cashier',
        subtitle: 'Departure moments',
        description: 'Collect takeaway desserts or settle charges privately.',
        position: { x: 12, y: 32 },
        size: { width: 24, height: 18 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  '07d62433-5290-5553-b74c-783b2d12e2c3': {
    id: '07d62433-5290-5553-b74c-783b2d12e2c3-plan',
    label: 'Shah Restaurant & Gallery',
    variant: 'planC',
    accent: '#B477D4',
    image: require('../../assets/plans/plan_c.png'),
    imageSize: { width: 1368, height: 980 },
    overlays: [
      {
        id: 'counter-bar',
        type: 'bar',
        title: 'Counter bar',
        subtitle: 'Signatures & classics',
        description: 'Gallery tour with resident curator',
        position: { x: 78, y: 14 },
        size: { width: 28, height: 18 },
        shape: 'rect'
      },
      {
        id: 'lounge-pods',
        type: 'lounge',
        title: 'Lounge pods',
        subtitle: 'Bottle service ready',
        description: 'Art pairing dinner series',
        position: { x: 20, y: 34 },
        size: { width: 28, height: 24 },
        shape: 'rect',
        occupancy: { total: 24, available: 10 }
      },
      {
        id: 'dancefloor',
        type: 'stage',
        title: 'Dance floor & DJ island',
        subtitle: 'Switches to late-night mode',
        description: 'Art pairing dinner series',
        position: { x: 52, y: 34 },
        size: { width: 24, height: 24 },
        shape: 'rect'
      },
      {
        id: 'open-kitchen',
        type: 'kitchen',
        title: 'Show kitchen',
        subtitle: 'Wok & robata line',
        description: 'Gallery tour with resident curator',
        position: { x: 50, y: 74 },
        size: { width: 30, height: 20 },
        shape: 'rect'
      },
      {
        id: 'vip-stairs',
        type: 'service',
        title: 'VIP mezzanine access',
        subtitle: 'Private stairway',
        description: 'Ascend to mezzanine suites and semi-private lounges.',
        position: { x: 32, y: 76 },
        size: { width: 20, height: 20 },
        shape: 'rect'
      },
      {
        id: 'karaoke-lounge',
        type: 'booth',
        title: 'Karaoke suites',
        subtitle: 'Bookable by the hour',
        description: 'Signature saffron soufflé',
        position: { x: 12, y: 76 },
        size: { width: 20, height: 22 },
        shape: 'rect'
      },
      {
        id: 'vip-bar',
        type: 'bar',
        title: 'Back bar & whisky library',
        subtitle: 'Rare pours nightly',
        description: 'Jazz quartet every Saturday',
        position: { x: 84, y: 64 },
        size: { width: 20, height: 18 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  'fdb388a9-a4fc-5653-84d9-a8bf71345f01': {
    id: 'fdb388a9-a4fc-5653-84d9-a8bf71345f01-plan',
    label: 'Qala Divari',
    variant: 'planD',
    accent: '#8CB8B2',
    image: require('../../assets/plans/plan_d.png'),
    imageSize: { width: 1368, height: 848 },
    overlays: [
      {
        id: 'cashier',
        type: 'service',
        title: 'Cashier & concierge',
        subtitle: 'Takeaway counter',
        description: 'Pick up whole cakes, pastries, or pre-ordered hampers here.',
        position: { x: 18, y: 24 },
        size: { width: 22, height: 20 },
        shape: 'rect'
      },
      {
        id: 'bar-rounds',
        type: 'bar',
        title: 'Espresso & cocktail bar',
        subtitle: 'Morning to midnight',
        description: 'Stone terrace overlooking Maiden Tower',
        position: { x: 28, y: 40 },
        size: { width: 26, height: 16 },
        shape: 'rect'
      },
      {
        id: 'living-room',
        type: 'lounge',
        title: 'Living room lounge',
        subtitle: 'Vintage sofas',
        description: 'Sunset terrace tasting',
        position: { x: 48, y: 52 },
        size: { width: 24, height: 18 },
        shape: 'rect'
      },
      {
        id: 'chef-kitchen',
        type: 'kitchen',
        title: 'Live kitchen island',
        subtitle: 'Chef counter',
        description: 'Stone terrace overlooking Maiden Tower',
        position: { x: 74, y: 18 },
        size: { width: 26, height: 24 },
        shape: 'rect'
      },
      {
        id: 'garden-terrace',
        type: 'terrace',
        title: 'Garden terrace',
        subtitle: 'Open-air dining',
        description: 'Sunset terrace tasting',
        position: { x: 88, y: 64 },
        size: { width: 20, height: 28 },
        shape: 'rect'
      },
      {
        id: 'dining-salon',
        type: 'table',
        title: 'Dining salon',
        subtitle: 'Communal feasting tables',
        description: 'Live bread oven turning out tandir loaves',
        position: { x: 74, y: 42 },
        size: { width: 26, height: 20 },
        shape: 'rect',
        occupancy: { total: 36, available: 20 }
      },
      {
        id: 'restrooms',
        type: 'service',
        title: 'Powder rooms',
        subtitle: 'Ladies and men suites',
        description: 'Freshen up with designer amenities and full-length mirrors.',
        position: { x: 8, y: 10 },
        size: { width: 16, height: 18 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  'c1c03f77-481b-55e4-9251-f66966697521': {
    id: 'c1c03f77-481b-55e4-9251-f66966697521-plan',
    label: 'Qaynana Restaurant',
    variant: 'planE',
    accent: '#D3B59C',
    image: require('../../assets/plans/plan_e.png'),
    imageSize: { width: 1368, height: 954 },
    overlays: [
      {
        id: 'chef-line',
        type: 'kitchen',
        title: 'Chef line & expo',
        subtitle: 'See the brigade in action',
        description: 'Signature piti cooked in clay pots',
        position: { x: 76, y: 14 },
        size: { width: 30, height: 18 },
        shape: 'rect'
      },
      {
        id: 'central-hall',
        type: 'table',
        title: 'Great hall tables',
        subtitle: 'Perfect for celebrations',
        description: 'Handmade dolma class',
        position: { x: 46, y: 48 },
        size: { width: 36, height: 30 },
        shape: 'rect',
        occupancy: { total: 40, available: 24 }
      },
      {
        id: 'bar-lounge',
        type: 'bar',
        title: 'Wraparound bar',
        subtitle: 'Martini hour from 18:00',
        description: 'Handmade dolma class',
        position: { x: 16, y: 34 },
        size: { width: 20, height: 24 },
        shape: 'rect'
      },
      {
        id: 'fireplace-table',
        type: 'booth',
        title: 'Fireplace booths',
        subtitle: 'Cozy hideaways',
        description: 'Wall of vintage Azerbaijani family portraits',
        position: { x: 36, y: 30 },
        size: { width: 16, height: 16 },
        shape: 'rect'
      },
      {
        id: 'crescent-lounge',
        type: 'lounge',
        title: 'Crescent lounge',
        subtitle: 'Digestif seating',
        description: 'Sip a nightcap with views into the kitchen theatre.',
        position: { x: 88, y: 44 },
        size: { width: 18, height: 20 },
        shape: 'rect'
      },
      {
        id: 'patio-corner',
        type: 'terrace',
        title: 'Patio & pergola',
        subtitle: 'Open-air tables',
        description: 'Family brunch board',
        position: { x: 92, y: 72 },
        size: { width: 16, height: 22 },
        shape: 'rect'
      },
      {
        id: 'service-core',
        type: 'service',
        title: 'Service corridor',
        subtitle: 'Expo & staging',
        description: 'Dedicated corridor keeps service efficient and discreet.',
        position: { x: 64, y: 82 },
        size: { width: 24, height: 18 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  '917cea2c-73ba-572d-9c38-6ef7d2bbb90b': {
    id: '917cea2c-73ba-572d-9c38-6ef7d2bbb90b-plan',
    label: 'Art Club Restaurant',
    variant: 'planA',
    accent: '#F4978E',
    image: require('../../assets/plans/plan_a.png'),
    imageSize: { width: 1324, height: 958 },
    overlays: [
      {
        id: 'entry-foyer',
        type: 'entry',
        title: 'Grand arrival foyer',
        subtitle: 'Icherisheher',
        description: 'Courtyard jazz brunch',
        position: { x: 50, y: 7 },
        size: { width: 24, height: 12 },
        shape: 'rect'
      },
      {
        id: 'north-lounge-west',
        type: 'lounge',
        title: 'Garden lounge pods',
        subtitle: 'Low sofas • mood lighting',
        description: 'Chef\'s tasting menu in the vaulted gallery',
        position: { x: 18, y: 18 },
        size: { width: 24, height: 18 },
        shape: 'rect',
        occupancy: { total: 18, available: 12, onHold: 2 }
      },
      {
        id: 'north-lounge-east',
        type: 'lounge',
        title: 'Atrium settees',
        subtitle: 'Pre-dinner aperitivo',
        description: 'Chef\'s gallery pairing dinner',
        position: { x: 82, y: 18 },
        size: { width: 24, height: 18 },
        shape: 'rect',
        occupancy: { total: 20, available: 15, onHold: 1 }
      },
      {
        id: 'private-salon',
        type: 'booth',
        title: 'Private majlis rooms',
        subtitle: 'Bookable salons',
        description: 'Open courtyard with jasmine canopy',
        position: { x: 12, y: 47 },
        size: { width: 24, height: 36 },
        shape: 'rect',
        occupancy: { total: 24, available: 8, onHold: 4 }
      },
      {
        id: 'central-dining-west',
        type: 'table',
        title: 'Central dining (west)',
        subtitle: 'Round tables • ideal for 4',
        description: 'Chef\'s tasting menu in the vaulted gallery',
        position: { x: 36, y: 48 },
        size: { width: 12, height: 12 },
        shape: 'circle',
        occupancy: { total: 16, available: 9 }
      },
      {
        id: 'central-dining-east',
        type: 'table',
        title: 'Central dining (east)',
        subtitle: 'Round tables • stage view',
        description: 'Courtyard jazz brunch',
        position: { x: 64, y: 48 },
        size: { width: 12, height: 12 },
        shape: 'circle',
        occupancy: { total: 16, available: 7, onHold: 2 }
      },
      {
        id: 'golden-terrace',
        type: 'terrace',
        title: 'Golden terrace tables',
        subtitle: 'Sunset vantage',
        description: 'Courtyard jazz brunch',
        position: { x: 87, y: 52 },
        size: { width: 20, height: 32 },
        shape: 'rect',
        occupancy: { total: 22, available: 10 }
      },
      {
        id: 'service-core',
        type: 'service',
        title: 'Service & restrooms',
        subtitle: 'Dedicated attendants',
        description: 'Separate ladies and men suites with vanity stations.',
        position: { x: 14, y: 82 },
        size: { width: 22, height: 24 },
        shape: 'rect'
      },
      {
        id: 'kitchen-suite',
        type: 'kitchen',
        title: 'Open kitchen line',
        subtitle: 'Chefs on stage',
        description: 'Chef\'s tasting menu in the vaulted gallery',
        position: { x: 88, y: 82 },
        size: { width: 18, height: 20 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  '4d74974e-1e42-5079-9f10-2560889767ac': {
    id: '4d74974e-1e42-5079-9f10-2560889767ac-plan',
    label: 'Mugam Club Restaurant',
    variant: 'planB',
    accent: '#E5A262',
    image: require('../../assets/plans/plan_b.png'),
    imageSize: { width: 1368, height: 980 },
    overlays: [
      {
        id: 'entry-garden',
        type: 'entry',
        title: 'Garden promenade entry',
        subtitle: 'Icherisheher',
        description: 'Guests arrive through the herb garden and are greeted with chilled towels.',
        position: { x: 44, y: 88 },
        size: { width: 26, height: 12 },
        shape: 'rect'
      },
      {
        id: 'central-bbq',
        type: 'table',
        title: 'Chef’s smoke tables',
        subtitle: 'Live grill benches',
        description: 'Authentic mugham ensemble every evening',
        position: { x: 30, y: 42 },
        size: { width: 32, height: 30 },
        shape: 'rect',
        occupancy: { total: 30, available: 18 }
      },
      {
        id: 'piano-lounge',
        type: 'stage',
        title: 'Grand piano lounge',
        subtitle: 'Evening jazz',
        description: 'Mugham dinner show',
        position: { x: 56, y: 36 },
        size: { width: 16, height: 18 },
        shape: 'rect'
      },
      {
        id: 'chef-line',
        type: 'kitchen',
        title: 'Show kitchen line',
        subtitle: 'Taste the mise en place',
        description: 'Caravanserai history tour',
        position: { x: 68, y: 18 },
        size: { width: 26, height: 20 },
        shape: 'rect'
      },
      {
        id: 'terrace-east',
        type: 'terrace',
        title: 'Sun terrace',
        subtitle: 'Rattan dining',
        description: 'Ideal for long brunches with a mild sea breeze.',
        position: { x: 90, y: 44 },
        size: { width: 22, height: 32 },
        shape: 'rect',
        occupancy: { total: 24, available: 12 }
      },
      {
        id: 'garden-cabanas',
        type: 'lounge',
        title: 'Garden cabanas',
        subtitle: 'Evening hookah & dessert',
        description: 'Authentic mugham ensemble every evening',
        position: { x: 80, y: 82 },
        size: { width: 26, height: 18 },
        shape: 'rect',
        occupancy: { total: 18, available: 8 }
      },
      {
        id: 'restrooms-north',
        type: 'service',
        title: 'Restrooms & powder rooms',
        subtitle: 'Separate suites',
        description: 'Dedicated attendants keep the space refreshed throughout service.',
        position: { x: 14, y: 10 },
        size: { width: 22, height: 18 },
        shape: 'rect'
      },
      {
        id: 'cashier-lounge',
        type: 'service',
        title: 'Concierge & cashier',
        subtitle: 'Departure moments',
        description: 'Collect takeaway desserts or settle charges privately.',
        position: { x: 12, y: 32 },
        size: { width: 24, height: 18 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  '0111b572-99be-518a-80e3-e0f6ac8cbf70': {
    id: '0111b572-99be-518a-80e3-e0f6ac8cbf70-plan',
    label: 'Mari Vanna Baku',
    variant: 'planC',
    accent: '#B477D4',
    image: require('../../assets/plans/plan_c.png'),
    imageSize: { width: 1368, height: 980 },
    overlays: [
      {
        id: 'counter-bar',
        type: 'bar',
        title: 'Counter bar',
        subtitle: 'Signatures & classics',
        description: 'Homemade pelmeni with dill butter',
        position: { x: 78, y: 14 },
        size: { width: 28, height: 18 },
        shape: 'rect'
      },
      {
        id: 'lounge-pods',
        type: 'lounge',
        title: 'Lounge pods',
        subtitle: 'Bottle service ready',
        description: 'Samovar tea ceremony',
        position: { x: 20, y: 34 },
        size: { width: 28, height: 24 },
        shape: 'rect',
        occupancy: { total: 24, available: 10 }
      },
      {
        id: 'dancefloor',
        type: 'stage',
        title: 'Dance floor & DJ island',
        subtitle: 'Switches to late-night mode',
        description: 'Samovar tea ceremony',
        position: { x: 52, y: 34 },
        size: { width: 24, height: 24 },
        shape: 'rect'
      },
      {
        id: 'open-kitchen',
        type: 'kitchen',
        title: 'Show kitchen',
        subtitle: 'Wok & robata line',
        description: 'Homemade pelmeni with dill butter',
        position: { x: 50, y: 74 },
        size: { width: 30, height: 20 },
        shape: 'rect'
      },
      {
        id: 'vip-stairs',
        type: 'service',
        title: 'VIP mezzanine access',
        subtitle: 'Private stairway',
        description: 'Ascend to mezzanine suites and semi-private lounges.',
        position: { x: 32, y: 76 },
        size: { width: 20, height: 20 },
        shape: 'rect'
      },
      {
        id: 'karaoke-lounge',
        type: 'booth',
        title: 'Karaoke suites',
        subtitle: 'Bookable by the hour',
        description: 'Dacha brunch on Sundays',
        position: { x: 12, y: 76 },
        size: { width: 20, height: 22 },
        shape: 'rect'
      },
      {
        id: 'vip-bar',
        type: 'bar',
        title: 'Back bar & whisky library',
        subtitle: 'Rare pours nightly',
        description: 'Rooms decorated with vintage Soviet curios',
        position: { x: 84, y: 64 },
        size: { width: 20, height: 18 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  'cdedf570-3bb5-5cde-959f-351210b59d8b': {
    id: 'cdedf570-3bb5-5cde-959f-351210b59d8b-plan',
    label: 'Mangal Steak House',
    variant: 'planD',
    accent: '#8CB8B2',
    image: require('../../assets/plans/plan_d.png'),
    imageSize: { width: 1368, height: 848 },
    overlays: [
      {
        id: 'cashier',
        type: 'service',
        title: 'Cashier & concierge',
        subtitle: 'Takeaway counter',
        description: 'Pick up whole cakes, pastries, or pre-ordered hampers here.',
        position: { x: 18, y: 24 },
        size: { width: 22, height: 20 },
        shape: 'rect'
      },
      {
        id: 'bar-rounds',
        type: 'bar',
        title: 'Espresso & cocktail bar',
        subtitle: 'Morning to midnight',
        description: 'Dry-age room showcasing prime cuts',
        position: { x: 28, y: 40 },
        size: { width: 26, height: 16 },
        shape: 'rect'
      },
      {
        id: 'living-room',
        type: 'lounge',
        title: 'Living room lounge',
        subtitle: 'Vintage sofas',
        description: 'Chef\'s steak flight',
        position: { x: 48, y: 52 },
        size: { width: 24, height: 18 },
        shape: 'rect'
      },
      {
        id: 'chef-kitchen',
        type: 'kitchen',
        title: 'Live kitchen island',
        subtitle: 'Chef counter',
        description: 'Dry-age room showcasing prime cuts',
        position: { x: 74, y: 18 },
        size: { width: 26, height: 24 },
        shape: 'rect'
      },
      {
        id: 'garden-terrace',
        type: 'terrace',
        title: 'Garden terrace',
        subtitle: 'Open-air dining',
        description: 'Chef\'s steak flight',
        position: { x: 88, y: 64 },
        size: { width: 20, height: 28 },
        shape: 'rect'
      },
      {
        id: 'dining-salon',
        type: 'table',
        title: 'Dining salon',
        subtitle: 'Communal feasting tables',
        description: 'Tableside tomahawk carving',
        position: { x: 74, y: 42 },
        size: { width: 26, height: 20 },
        shape: 'rect',
        occupancy: { total: 36, available: 20 }
      },
      {
        id: 'restrooms',
        type: 'service',
        title: 'Powder rooms',
        subtitle: 'Ladies and men suites',
        description: 'Freshen up with designer amenities and full-length mirrors.',
        position: { x: 8, y: 10 },
        size: { width: 16, height: 18 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  'd721f224-f5d5-5f05-bbb6-84d77e8d7bf3': {
    id: 'd721f224-f5d5-5f05-bbb6-84d77e8d7bf3-plan',
    label: 'Paulaner Bräuhaus Baku',
    variant: 'planE',
    accent: '#D3B59C',
    image: require('../../assets/plans/plan_e.png'),
    imageSize: { width: 1368, height: 954 },
    overlays: [
      {
        id: 'chef-line',
        type: 'kitchen',
        title: 'Chef line & expo',
        subtitle: 'See the brigade in action',
        description: 'Copper brewing kettles in the dining room',
        position: { x: 76, y: 14 },
        size: { width: 30, height: 18 },
        shape: 'rect'
      },
      {
        id: 'central-hall',
        type: 'table',
        title: 'Great hall tables',
        subtitle: 'Perfect for celebrations',
        description: 'Brewmaster\'s tour',
        position: { x: 46, y: 48 },
        size: { width: 36, height: 30 },
        shape: 'rect',
        occupancy: { total: 40, available: 24 }
      },
      {
        id: 'bar-lounge',
        type: 'bar',
        title: 'Wraparound bar',
        subtitle: 'Martini hour from 18:00',
        description: 'Brewmaster\'s tour',
        position: { x: 16, y: 34 },
        size: { width: 20, height: 24 },
        shape: 'rect'
      },
      {
        id: 'fireplace-table',
        type: 'booth',
        title: 'Fireplace booths',
        subtitle: 'Cozy hideaways',
        description: 'Seasonal Oktoberfest menu',
        position: { x: 36, y: 30 },
        size: { width: 16, height: 16 },
        shape: 'rect'
      },
      {
        id: 'crescent-lounge',
        type: 'lounge',
        title: 'Crescent lounge',
        subtitle: 'Digestif seating',
        description: 'Sip a nightcap with views into the kitchen theatre.',
        position: { x: 88, y: 44 },
        size: { width: 18, height: 20 },
        shape: 'rect'
      },
      {
        id: 'patio-corner',
        type: 'terrace',
        title: 'Patio & pergola',
        subtitle: 'Open-air tables',
        description: 'Live beer tapping ceremony',
        position: { x: 92, y: 72 },
        size: { width: 16, height: 22 },
        shape: 'rect'
      },
      {
        id: 'service-core',
        type: 'service',
        title: 'Service corridor',
        subtitle: 'Expo & staging',
        description: 'Dedicated corridor keeps service efficient and discreet.',
        position: { x: 64, y: 82 },
        size: { width: 24, height: 18 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  'b4a9f7e7-7669-55ea-a9b7-d756c39a23f6': {
    id: 'b4a9f7e7-7669-55ea-a9b7-d756c39a23f6-plan',
    label: 'Zafferano – Four Seasons Baku',
    variant: 'planA',
    accent: '#F4978E',
    image: require('../../assets/plans/plan_a.png'),
    imageSize: { width: 1324, height: 958 },
    overlays: [
      {
        id: 'entry-foyer',
        type: 'entry',
        title: 'Grand arrival foyer',
        subtitle: 'Neftchilar Avenue',
        description: 'Chef\'s counter tasting',
        position: { x: 50, y: 7 },
        size: { width: 24, height: 12 },
        shape: 'rect'
      },
      {
        id: 'north-lounge-west',
        type: 'lounge',
        title: 'Garden lounge pods',
        subtitle: 'Low sofas • mood lighting',
        description: 'Winter garden conservatory overlooking the Caspian',
        position: { x: 18, y: 18 },
        size: { width: 24, height: 18 },
        shape: 'rect',
        occupancy: { total: 18, available: 12, onHold: 2 }
      },
      {
        id: 'north-lounge-east',
        type: 'lounge',
        title: 'Atrium settees',
        subtitle: 'Pre-dinner aperitivo',
        description: 'Sunday winter garden brunch',
        position: { x: 82, y: 18 },
        size: { width: 24, height: 18 },
        shape: 'rect',
        occupancy: { total: 20, available: 15, onHold: 1 }
      },
      {
        id: 'private-salon',
        type: 'booth',
        title: 'Private majlis rooms',
        subtitle: 'Bookable salons',
        description: 'Chef\'s pasta atelier inside the dining room',
        position: { x: 12, y: 47 },
        size: { width: 24, height: 36 },
        shape: 'rect',
        occupancy: { total: 24, available: 8, onHold: 4 }
      },
      {
        id: 'central-dining-west',
        type: 'table',
        title: 'Central dining (west)',
        subtitle: 'Round tables • ideal for 4',
        description: 'Winter garden conservatory overlooking the Caspian',
        position: { x: 36, y: 48 },
        size: { width: 12, height: 12 },
        shape: 'circle',
        occupancy: { total: 16, available: 9 }
      },
      {
        id: 'central-dining-east',
        type: 'table',
        title: 'Central dining (east)',
        subtitle: 'Round tables • stage view',
        description: 'Chef\'s counter tasting',
        position: { x: 64, y: 48 },
        size: { width: 12, height: 12 },
        shape: 'circle',
        occupancy: { total: 16, available: 7, onHold: 2 }
      },
      {
        id: 'golden-terrace',
        type: 'terrace',
        title: 'Golden terrace tables',
        subtitle: 'Sunset vantage',
        description: 'Chef\'s counter tasting',
        position: { x: 87, y: 52 },
        size: { width: 20, height: 32 },
        shape: 'rect',
        occupancy: { total: 22, available: 10 }
      },
      {
        id: 'service-core',
        type: 'service',
        title: 'Service & restrooms',
        subtitle: 'Dedicated attendants',
        description: 'Separate ladies and men suites with vanity stations.',
        position: { x: 14, y: 82 },
        size: { width: 22, height: 24 },
        shape: 'rect'
      },
      {
        id: 'kitchen-suite',
        type: 'kitchen',
        title: 'Open kitchen line',
        subtitle: 'Chefs on stage',
        description: 'Winter garden conservatory overlooking the Caspian',
        position: { x: 88, y: 82 },
        size: { width: 18, height: 20 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  '7eeffd08-c7d2-54f3-9b5b-8ab0c61ff84e': {
    id: '7eeffd08-c7d2-54f3-9b5b-8ab0c61ff84e-plan',
    label: 'OroNero Bar & Ristorante',
    variant: 'planB',
    accent: '#E5A262',
    image: require('../../assets/plans/plan_b.png'),
    imageSize: { width: 1368, height: 980 },
    overlays: [
      {
        id: 'entry-garden',
        type: 'entry',
        title: 'Garden promenade entry',
        subtitle: 'Azadliq Square',
        description: 'Guests arrive through the herb garden and are greeted with chilled towels.',
        position: { x: 44, y: 88 },
        size: { width: 26, height: 12 },
        shape: 'rect'
      },
      {
        id: 'central-bbq',
        type: 'table',
        title: 'Chef’s smoke tables',
        subtitle: 'Live grill benches',
        description: 'Show kitchen with Josper grill',
        position: { x: 30, y: 42 },
        size: { width: 32, height: 30 },
        shape: 'rect',
        occupancy: { total: 30, available: 18 }
      },
      {
        id: 'piano-lounge',
        type: 'stage',
        title: 'Grand piano lounge',
        subtitle: 'Evening jazz',
        description: 'White truffle degustation',
        position: { x: 56, y: 36 },
        size: { width: 16, height: 18 },
        shape: 'rect'
      },
      {
        id: 'chef-line',
        type: 'kitchen',
        title: 'Show kitchen line',
        subtitle: 'Taste the mise en place',
        description: 'Royal brunch with prosecco',
        position: { x: 68, y: 18 },
        size: { width: 26, height: 20 },
        shape: 'rect'
      },
      {
        id: 'terrace-east',
        type: 'terrace',
        title: 'Sun terrace',
        subtitle: 'Rattan dining',
        description: 'Ideal for long brunches with a mild sea breeze.',
        position: { x: 90, y: 44 },
        size: { width: 22, height: 32 },
        shape: 'rect',
        occupancy: { total: 24, available: 12 }
      },
      {
        id: 'garden-cabanas',
        type: 'lounge',
        title: 'Garden cabanas',
        subtitle: 'Evening hookah & dessert',
        description: 'Show kitchen with Josper grill',
        position: { x: 80, y: 82 },
        size: { width: 26, height: 18 },
        shape: 'rect',
        occupancy: { total: 18, available: 8 }
      },
      {
        id: 'restrooms-north',
        type: 'service',
        title: 'Restrooms & powder rooms',
        subtitle: 'Separate suites',
        description: 'Dedicated attendants keep the space refreshed throughout service.',
        position: { x: 14, y: 10 },
        size: { width: 22, height: 18 },
        shape: 'rect'
      },
      {
        id: 'cashier-lounge',
        type: 'service',
        title: 'Concierge & cashier',
        subtitle: 'Departure moments',
        description: 'Collect takeaway desserts or settle charges privately.',
        position: { x: 12, y: 32 },
        size: { width: 24, height: 18 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  '08238a17-ddcb-5e74-a4bc-8a4741ae78d5': {
    id: '08238a17-ddcb-5e74-a4bc-8a4741ae78d5-plan',
    label: '360 Bar',
    variant: 'planC',
    accent: '#B477D4',
    image: require('../../assets/plans/plan_c.png'),
    imageSize: { width: 1368, height: 980 },
    overlays: [
      {
        id: 'counter-bar',
        type: 'bar',
        title: 'Counter bar',
        subtitle: 'Signatures & classics',
        description: '360° revolving panorama every hour',
        position: { x: 78, y: 14 },
        size: { width: 28, height: 18 },
        shape: 'rect'
      },
      {
        id: 'lounge-pods',
        type: 'lounge',
        title: 'Lounge pods',
        subtitle: 'Bottle service ready',
        description: 'Sunset sushi & bubbles',
        position: { x: 20, y: 34 },
        size: { width: 28, height: 24 },
        shape: 'rect',
        occupancy: { total: 24, available: 10 }
      },
      {
        id: 'dancefloor',
        type: 'stage',
        title: 'Dance floor & DJ island',
        subtitle: 'Switches to late-night mode',
        description: 'Sunset sushi & bubbles',
        position: { x: 52, y: 34 },
        size: { width: 24, height: 24 },
        shape: 'rect'
      },
      {
        id: 'open-kitchen',
        type: 'kitchen',
        title: 'Show kitchen',
        subtitle: 'Wok & robata line',
        description: '360° revolving panorama every hour',
        position: { x: 50, y: 74 },
        size: { width: 30, height: 20 },
        shape: 'rect'
      },
      {
        id: 'vip-stairs',
        type: 'service',
        title: 'VIP mezzanine access',
        subtitle: 'Private stairway',
        description: 'Ascend to mezzanine suites and semi-private lounges.',
        position: { x: 32, y: 76 },
        size: { width: 20, height: 20 },
        shape: 'rect'
      },
      {
        id: 'karaoke-lounge',
        type: 'booth',
        title: 'Karaoke suites',
        subtitle: 'Bookable by the hour',
        description: 'DJ skyline sessions',
        position: { x: 12, y: 76 },
        size: { width: 20, height: 22 },
        shape: 'rect'
      },
      {
        id: 'vip-bar',
        type: 'bar',
        title: 'Back bar & whisky library',
        subtitle: 'Rare pours nightly',
        description: 'Live saxophonist on weekends',
        position: { x: 84, y: 64 },
        size: { width: 20, height: 18 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  '3b63d5eb-22d6-56a1-80a8-d6ff47ed82f3': {
    id: '3b63d5eb-22d6-56a1-80a8-d6ff47ed82f3-plan',
    label: 'Sky Grill',
    variant: 'planD',
    accent: '#8CB8B2',
    image: require('../../assets/plans/plan_d.png'),
    imageSize: { width: 1368, height: 848 },
    overlays: [
      {
        id: 'cashier',
        type: 'service',
        title: 'Cashier & concierge',
        subtitle: 'Takeaway counter',
        description: 'Pick up whole cakes, pastries, or pre-ordered hampers here.',
        position: { x: 18, y: 24 },
        size: { width: 22, height: 20 },
        shape: 'rect'
      },
      {
        id: 'bar-rounds',
        type: 'bar',
        title: 'Espresso & cocktail bar',
        subtitle: 'Morning to midnight',
        description: 'Charcoal grilled Caspian seafood',
        position: { x: 28, y: 40 },
        size: { width: 26, height: 16 },
        shape: 'rect'
      },
      {
        id: 'living-room',
        type: 'lounge',
        title: 'Living room lounge',
        subtitle: 'Vintage sofas',
        description: 'Fire pit tasting menu',
        position: { x: 48, y: 52 },
        size: { width: 24, height: 18 },
        shape: 'rect'
      },
      {
        id: 'chef-kitchen',
        type: 'kitchen',
        title: 'Live kitchen island',
        subtitle: 'Chef counter',
        description: 'Charcoal grilled Caspian seafood',
        position: { x: 74, y: 18 },
        size: { width: 26, height: 24 },
        shape: 'rect'
      },
      {
        id: 'garden-terrace',
        type: 'terrace',
        title: 'Garden terrace',
        subtitle: 'Open-air dining',
        description: 'Fire pit tasting menu',
        position: { x: 88, y: 64 },
        size: { width: 20, height: 28 },
        shape: 'rect'
      },
      {
        id: 'dining-salon',
        type: 'table',
        title: 'Dining salon',
        subtitle: 'Communal feasting tables',
        description: 'Rooftop cabanas with heaters',
        position: { x: 74, y: 42 },
        size: { width: 26, height: 20 },
        shape: 'rect',
        occupancy: { total: 36, available: 20 }
      },
      {
        id: 'restrooms',
        type: 'service',
        title: 'Powder rooms',
        subtitle: 'Ladies and men suites',
        description: 'Freshen up with designer amenities and full-length mirrors.',
        position: { x: 8, y: 10 },
        size: { width: 16, height: 18 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  '81554dc0-d0cd-51ca-ab72-eb3f8d5da646': {
    id: '81554dc0-d0cd-51ca-ab72-eb3f8d5da646-plan',
    label: 'Riviera Restaurant',
    variant: 'planE',
    accent: '#D3B59C',
    image: require('../../assets/plans/plan_e.png'),
    imageSize: { width: 1368, height: 954 },
    overlays: [
      {
        id: 'chef-line',
        type: 'kitchen',
        title: 'Chef line & expo',
        subtitle: 'See the brigade in action',
        description: 'Daily seafood market display',
        position: { x: 76, y: 14 },
        size: { width: 30, height: 18 },
        shape: 'rect'
      },
      {
        id: 'central-hall',
        type: 'table',
        title: 'Great hall tables',
        subtitle: 'Perfect for celebrations',
        description: 'Captain\'s seafood platter',
        position: { x: 46, y: 48 },
        size: { width: 36, height: 30 },
        shape: 'rect',
        occupancy: { total: 40, available: 24 }
      },
      {
        id: 'bar-lounge',
        type: 'bar',
        title: 'Wraparound bar',
        subtitle: 'Martini hour from 18:00',
        description: 'Captain\'s seafood platter',
        position: { x: 16, y: 34 },
        size: { width: 20, height: 24 },
        shape: 'rect'
      },
      {
        id: 'fireplace-table',
        type: 'booth',
        title: 'Fireplace booths',
        subtitle: 'Cozy hideaways',
        description: 'Mediterranean DJ brunch on Sundays',
        position: { x: 36, y: 30 },
        size: { width: 16, height: 16 },
        shape: 'rect'
      },
      {
        id: 'crescent-lounge',
        type: 'lounge',
        title: 'Crescent lounge',
        subtitle: 'Digestif seating',
        description: 'Sip a nightcap with views into the kitchen theatre.',
        position: { x: 88, y: 44 },
        size: { width: 18, height: 20 },
        shape: 'rect'
      },
      {
        id: 'patio-corner',
        type: 'terrace',
        title: 'Patio & pergola',
        subtitle: 'Open-air tables',
        description: 'Sunset DJ sessions',
        position: { x: 92, y: 72 },
        size: { width: 16, height: 22 },
        shape: 'rect'
      },
      {
        id: 'service-core',
        type: 'service',
        title: 'Service corridor',
        subtitle: 'Expo & staging',
        description: 'Dedicated corridor keeps service efficient and discreet.',
        position: { x: 64, y: 82 },
        size: { width: 24, height: 18 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  'a961f3a9-67fb-5689-a521-06c2b5d4edad': {
    id: 'a961f3a9-67fb-5689-a521-06c2b5d4edad-plan',
    label: 'Novikov Café Baku',
    variant: 'planA',
    accent: '#F4978E',
    image: require('../../assets/plans/plan_a.png'),
    imageSize: { width: 1324, height: 958 },
    overlays: [
      {
        id: 'entry-foyer',
        type: 'entry',
        title: 'Grand arrival foyer',
        subtitle: 'Fountain Square',
        description: 'Novikov afternoon tea',
        position: { x: 50, y: 7 },
        size: { width: 24, height: 12 },
        shape: 'rect'
      },
      {
        id: 'north-lounge-west',
        type: 'lounge',
        title: 'Garden lounge pods',
        subtitle: 'Low sofas • mood lighting',
        description: 'Signature honey cake and patisserie',
        position: { x: 18, y: 18 },
        size: { width: 24, height: 18 },
        shape: 'rect',
        occupancy: { total: 18, available: 12, onHold: 2 }
      },
      {
        id: 'north-lounge-east',
        type: 'lounge',
        title: 'Atrium settees',
        subtitle: 'Pre-dinner aperitivo',
        description: 'Dessert tasting flight',
        position: { x: 82, y: 18 },
        size: { width: 24, height: 18 },
        shape: 'rect',
        occupancy: { total: 20, available: 15, onHold: 1 }
      },
      {
        id: 'private-salon',
        type: 'booth',
        title: 'Private majlis rooms',
        subtitle: 'Bookable salons',
        description: 'Novikov coffee blends and mixology',
        position: { x: 12, y: 47 },
        size: { width: 24, height: 36 },
        shape: 'rect',
        occupancy: { total: 24, available: 8, onHold: 4 }
      },
      {
        id: 'central-dining-west',
        type: 'table',
        title: 'Central dining (west)',
        subtitle: 'Round tables • ideal for 4',
        description: 'Signature honey cake and patisserie',
        position: { x: 36, y: 48 },
        size: { width: 12, height: 12 },
        shape: 'circle',
        occupancy: { total: 16, available: 9 }
      },
      {
        id: 'central-dining-east',
        type: 'table',
        title: 'Central dining (east)',
        subtitle: 'Round tables • stage view',
        description: 'Novikov afternoon tea',
        position: { x: 64, y: 48 },
        size: { width: 12, height: 12 },
        shape: 'circle',
        occupancy: { total: 16, available: 7, onHold: 2 }
      },
      {
        id: 'golden-terrace',
        type: 'terrace',
        title: 'Golden terrace tables',
        subtitle: 'Sunset vantage',
        description: 'Novikov afternoon tea',
        position: { x: 87, y: 52 },
        size: { width: 20, height: 32 },
        shape: 'rect',
        occupancy: { total: 22, available: 10 }
      },
      {
        id: 'service-core',
        type: 'service',
        title: 'Service & restrooms',
        subtitle: 'Dedicated attendants',
        description: 'Separate ladies and men suites with vanity stations.',
        position: { x: 14, y: 82 },
        size: { width: 22, height: 24 },
        shape: 'rect'
      },
      {
        id: 'kitchen-suite',
        type: 'kitchen',
        title: 'Open kitchen line',
        subtitle: 'Chefs on stage',
        description: 'Signature honey cake and patisserie',
        position: { x: 88, y: 82 },
        size: { width: 18, height: 20 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  'eb7cd2b5-5e85-5ca4-b647-12e2a571f46e': {
    id: 'eb7cd2b5-5e85-5ca4-b647-12e2a571f46e-plan',
    label: 'Syrovarnya Baku',
    variant: 'planB',
    accent: '#E5A262',
    image: require('../../assets/plans/plan_b.png'),
    imageSize: { width: 1368, height: 980 },
    overlays: [
      {
        id: 'entry-garden',
        type: 'entry',
        title: 'Garden promenade entry',
        subtitle: 'Port Baku',
        description: 'Guests arrive through the herb garden and are greeted with chilled towels.',
        position: { x: 44, y: 88 },
        size: { width: 26, height: 12 },
        shape: 'rect'
      },
      {
        id: 'central-bbq',
        type: 'table',
        title: 'Chef’s smoke tables',
        subtitle: 'Live grill benches',
        description: 'Live mozzarella stretching station',
        position: { x: 30, y: 42 },
        size: { width: 32, height: 30 },
        shape: 'rect',
        occupancy: { total: 30, available: 18 }
      },
      {
        id: 'piano-lounge',
        type: 'stage',
        title: 'Grand piano lounge',
        subtitle: 'Evening jazz',
        description: 'Mozzarella masterclass',
        position: { x: 56, y: 36 },
        size: { width: 16, height: 18 },
        shape: 'rect'
      },
      {
        id: 'chef-line',
        type: 'kitchen',
        title: 'Show kitchen line',
        subtitle: 'Taste the mise en place',
        description: 'Aperitivo hour with cheese board',
        position: { x: 68, y: 18 },
        size: { width: 26, height: 20 },
        shape: 'rect'
      },
      {
        id: 'terrace-east',
        type: 'terrace',
        title: 'Sun terrace',
        subtitle: 'Rattan dining',
        description: 'Ideal for long brunches with a mild sea breeze.',
        position: { x: 90, y: 44 },
        size: { width: 22, height: 32 },
        shape: 'rect',
        occupancy: { total: 24, available: 12 }
      },
      {
        id: 'garden-cabanas',
        type: 'lounge',
        title: 'Garden cabanas',
        subtitle: 'Evening hookah & dessert',
        description: 'Live mozzarella stretching station',
        position: { x: 80, y: 82 },
        size: { width: 26, height: 18 },
        shape: 'rect',
        occupancy: { total: 18, available: 8 }
      },
      {
        id: 'restrooms-north',
        type: 'service',
        title: 'Restrooms & powder rooms',
        subtitle: 'Separate suites',
        description: 'Dedicated attendants keep the space refreshed throughout service.',
        position: { x: 14, y: 10 },
        size: { width: 22, height: 18 },
        shape: 'rect'
      },
      {
        id: 'cashier-lounge',
        type: 'service',
        title: 'Concierge & cashier',
        subtitle: 'Departure moments',
        description: 'Collect takeaway desserts or settle charges privately.',
        position: { x: 12, y: 32 },
        size: { width: 24, height: 18 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  'ba9f7284-ccee-5044-9786-fafda66ce184': {
    id: 'ba9f7284-ccee-5044-9786-fafda66ce184-plan',
    label: 'Vapiano Baku',
    variant: 'planC',
    accent: '#B477D4',
    image: require('../../assets/plans/plan_c.png'),
    imageSize: { width: 1368, height: 980 },
    overlays: [
      {
        id: 'counter-bar',
        type: 'bar',
        title: 'Counter bar',
        subtitle: 'Signatures & classics',
        description: 'Made-to-order pasta cooked in front of guests',
        position: { x: 78, y: 14 },
        size: { width: 28, height: 18 },
        shape: 'rect'
      },
      {
        id: 'lounge-pods',
        type: 'lounge',
        title: 'Lounge pods',
        subtitle: 'Bottle service ready',
        description: 'Pasta academy nights',
        position: { x: 20, y: 34 },
        size: { width: 28, height: 24 },
        shape: 'rect',
        occupancy: { total: 24, available: 10 }
      },
      {
        id: 'dancefloor',
        type: 'stage',
        title: 'Dance floor & DJ island',
        subtitle: 'Switches to late-night mode',
        description: 'Pasta academy nights',
        position: { x: 52, y: 34 },
        size: { width: 24, height: 24 },
        shape: 'rect'
      },
      {
        id: 'open-kitchen',
        type: 'kitchen',
        title: 'Show kitchen',
        subtitle: 'Wok & robata line',
        description: 'Made-to-order pasta cooked in front of guests',
        position: { x: 50, y: 74 },
        size: { width: 30, height: 20 },
        shape: 'rect'
      },
      {
        id: 'vip-stairs',
        type: 'service',
        title: 'VIP mezzanine access',
        subtitle: 'Private stairway',
        description: 'Ascend to mezzanine suites and semi-private lounges.',
        position: { x: 32, y: 76 },
        size: { width: 20, height: 20 },
        shape: 'rect'
      },
      {
        id: 'karaoke-lounge',
        type: 'booth',
        title: 'Karaoke suites',
        subtitle: 'Bookable by the hour',
        description: 'Kids pizza workshop',
        position: { x: 12, y: 76 },
        size: { width: 20, height: 22 },
        shape: 'rect'
      },
      {
        id: 'vip-bar',
        type: 'bar',
        title: 'Back bar & whisky library',
        subtitle: 'Rare pours nightly',
        description: 'Large communal tables and herb planters',
        position: { x: 84, y: 64 },
        size: { width: 20, height: 18 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  '4b546ac5-7687-56a8-8d0c-d13cdb9e4b0a': {
    id: '4b546ac5-7687-56a8-8d0c-d13cdb9e4b0a-plan',
    label: 'Passage 145',
    variant: 'planD',
    accent: '#8CB8B2',
    image: require('../../assets/plans/plan_d.png'),
    imageSize: { width: 1368, height: 848 },
    overlays: [
      {
        id: 'cashier',
        type: 'service',
        title: 'Cashier & concierge',
        subtitle: 'Takeaway counter',
        description: 'Pick up whole cakes, pastries, or pre-ordered hampers here.',
        position: { x: 18, y: 24 },
        size: { width: 22, height: 20 },
        shape: 'rect'
      },
      {
        id: 'bar-rounds',
        type: 'bar',
        title: 'Espresso & cocktail bar',
        subtitle: 'Morning to midnight',
        description: 'Open pastry counter and 145 signature desserts',
        position: { x: 28, y: 40 },
        size: { width: 26, height: 16 },
        shape: 'rect'
      },
      {
        id: 'living-room',
        type: 'lounge',
        title: 'Living room lounge',
        subtitle: 'Vintage sofas',
        description: 'Midnight dessert buffet',
        position: { x: 48, y: 52 },
        size: { width: 24, height: 18 },
        shape: 'rect'
      },
      {
        id: 'chef-kitchen',
        type: 'kitchen',
        title: 'Live kitchen island',
        subtitle: 'Chef counter',
        description: 'Open pastry counter and 145 signature desserts',
        position: { x: 74, y: 18 },
        size: { width: 26, height: 24 },
        shape: 'rect'
      },
      {
        id: 'garden-terrace',
        type: 'terrace',
        title: 'Garden terrace',
        subtitle: 'Open-air dining',
        description: 'Midnight dessert buffet',
        position: { x: 88, y: 64 },
        size: { width: 20, height: 28 },
        shape: 'rect'
      },
      {
        id: 'dining-salon',
        type: 'table',
        title: 'Dining salon',
        subtitle: 'Communal feasting tables',
        description: 'Late-night DJ sets on weekends',
        position: { x: 74, y: 42 },
        size: { width: 26, height: 20 },
        shape: 'rect',
        occupancy: { total: 36, available: 20 }
      },
      {
        id: 'restrooms',
        type: 'service',
        title: 'Powder rooms',
        subtitle: 'Ladies and men suites',
        description: 'Freshen up with designer amenities and full-length mirrors.',
        position: { x: 8, y: 10 },
        size: { width: 16, height: 18 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  },
  'e84ca3c6-a14f-5bc9-99f8-ad5d0d0e2caa': {
    id: 'e84ca3c6-a14f-5bc9-99f8-ad5d0d0e2caa-plan',
    label: 'Çay Bağı 145',
    variant: 'planE',
    accent: '#D3B59C',
    image: require('../../assets/plans/plan_e.png'),
    imageSize: { width: 1368, height: 954 },
    overlays: [
      {
        id: 'chef-line',
        type: 'kitchen',
        title: 'Chef line & expo',
        subtitle: 'See the brigade in action',
        description: 'Traditional samovar tea sets with preserves',
        position: { x: 76, y: 14 },
        size: { width: 30, height: 18 },
        shape: 'rect'
      },
      {
        id: 'central-hall',
        type: 'table',
        title: 'Great hall tables',
        subtitle: 'Perfect for celebrations',
        description: 'Samovar tea ceremony',
        position: { x: 46, y: 48 },
        size: { width: 36, height: 30 },
        shape: 'rect',
        occupancy: { total: 40, available: 24 }
      },
      {
        id: 'bar-lounge',
        type: 'bar',
        title: 'Wraparound bar',
        subtitle: 'Martini hour from 18:00',
        description: 'Samovar tea ceremony',
        position: { x: 16, y: 34 },
        size: { width: 20, height: 24 },
        shape: 'rect'
      },
      {
        id: 'fireplace-table',
        type: 'booth',
        title: 'Fireplace booths',
        subtitle: 'Cozy hideaways',
        description: 'Signature breakfast board with qutabs and honey',
        position: { x: 36, y: 30 },
        size: { width: 16, height: 16 },
        shape: 'rect'
      },
      {
        id: 'crescent-lounge',
        type: 'lounge',
        title: 'Crescent lounge',
        subtitle: 'Digestif seating',
        description: 'Sip a nightcap with views into the kitchen theatre.',
        position: { x: 88, y: 44 },
        size: { width: 18, height: 20 },
        shape: 'rect'
      },
      {
        id: 'patio-corner',
        type: 'terrace',
        title: 'Patio & pergola',
        subtitle: 'Open-air tables',
        description: 'Sunrise breakfast picnic',
        position: { x: 92, y: 72 },
        size: { width: 16, height: 22 },
        shape: 'rect'
      },
      {
        id: 'service-core',
        type: 'service',
        title: 'Service corridor',
        subtitle: 'Expo & staging',
        description: 'Dedicated corridor keeps service efficient and discreet.',
        position: { x: 64, y: 82 },
        size: { width: 24, height: 18 },
        shape: 'rect'
      }
    ],
    legend: {
      table: 'Dining tables',
      booth: 'Private booths & salons',
      bar: 'Bars & beverage counters',
      dj: 'Music & DJ decks',
      stage: 'Performance & entertainment',
      lounge: 'Lounge seating areas',
      terrace: 'Outdoor & terrace seating',
      kitchen: 'Open kitchen & expo',
      entry: 'Entries & host stands',
      service: 'Services, restrooms & support zones'
    },
  }
};
