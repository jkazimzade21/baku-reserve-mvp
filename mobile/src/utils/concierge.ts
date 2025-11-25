import Constants from 'expo-constants';
import type { RestaurantSummary } from '../api';
import { filterByCategory, matchesCategory } from '../constants/browseCategories';

export type DiscoveryFilters = {
  cuisines?: string[];
  tags?: string[];
  maxPriceRank?: number;
  minPriceRank?: number;
  neighborhood?: string;
  groupSize?: number;
  strictBudget?: boolean;
};

export type ConciergePrompt = {
  id: string;
  title: string;
  subtitle: string;
  keywords: string[];
  categoryId?: string;
  tags?: string[];
  cuisines?: string[];
  responseHint?: string;
};

const normalizeList = (list?: any) => {
  if (!list) return [];
  if (Array.isArray(list)) {
    return list.map((entry) => String(entry).toLowerCase());
  }
  if (typeof list === 'object') {
    return Object.values(list)
      .flat()
      .filter((item): item is string => typeof item === 'string')
      .map((entry) => entry.toLowerCase());
  }
  return [];
};

const priceRank = (price?: string | null) => {
  if (!price) return null;
  const match = price.match(/(\d)/);
  return match ? Number(match[1]) : null;
};

export const CONCIERGE_PROMPTS: ConciergePrompt[] = [
  {
    id: 'romantic_views',
    title: 'Date night with a view',
    subtitle: 'Rooftops, sunsets, wine-forward lists.',
    keywords: ['date', 'romantic', 'anniversary', 'proposal', 'view', 'skyline', 'rooftop', 'sunset'],
    categoryId: 'rooftop_views',
    tags: ['romantic', 'sunset', 'rooftop', 'skyline', 'sea_view', 'terrace'],
    responseHint: "Here are skyline spots with soft lighting and great wine service.",
  },
  {
    id: 'group_celebration',
    title: 'Group dinner for 6-10',
    subtitle: 'Spacious tables, lively rooms, easy splits.',
    keywords: ['group', 'birthday', 'team', 'friends', 'celebration', 'party', 'large table', 'big table'],
    categoryId: 'family_friendly',
    tags: ['group_dining', 'family', 'birthday', 'celebration', 'private_room'],
    responseHint: 'These venues handle bigger parties without sacrificing vibe.',
  },
  {
    id: 'live_music',
    title: 'Cocktails & live music',
    subtitle: 'DJs, bands, and late-night energy.',
    keywords: ['music', 'dj', 'band', 'vinyl', 'late night', 'dance'],
    categoryId: 'live_music',
    tags: ['live_music', 'dj', 'late_night', 'cocktails', 'vinyl'],
    responseHint: 'High-energy rooms with strong bar programs.',
  },
  {
    id: 'chef_table',
    title: 'Chef’s tasting menus',
    subtitle: 'Open kitchens, limited seats.',
    keywords: ['chef', 'tasting', 'omakase', 'degustation', 'course', 'fine dining'],
    categoryId: 'chef_table',
    tags: ['chef_table', 'tasting_menu', 'open_kitchen', 'chef_counter'],
    responseHint: 'Intimate kitchens and tasting menus worth dressing up for.',
  },
  {
    id: 'seaside',
    title: 'Seafood on the water',
    subtitle: 'Caspian views, grilled fish, chilled whites.',
    keywords: ['seafood', 'fish', 'caviar', 'oyster', 'sea', 'waterfront', 'boulevard'],
    tags: ['seafood', 'waterfront', 'sea_view', 'seaside', 'sunset'],
    responseHint: 'Waterfront picks with reliable seafood programs.',
  },
  {
    id: 'brunch',
    title: 'Sunny brunch & coffee',
    subtitle: 'Patios, pour-overs, pastries.',
    keywords: ['brunch', 'coffee', 'breakfast', 'pastry', 'cafe'],
    categoryId: 'cafes_breakfast',
    tags: ['brunch', 'breakfast', 'cafe', 'coffee'],
    responseHint: 'Bright daytime spots with good coffee and airy seating.',
  },
  {
    id: 'cocktails',
    title: 'Designer cocktails',
    subtitle: 'Mixology bars, dim lights, late hours.',
    keywords: ['cocktail', 'bar', 'negroni', 'mezcal', 'martini', 'speakeasy'],
    categoryId: 'bars_lounges',
    tags: ['cocktails', 'bar', 'mixology', 'late_night'],
    responseHint: 'Bartender-driven rooms for an elevated nightcap.',
  },
];

export const DEFAULT_PROMPT: ConciergePrompt = {
  id: 'bespoke',
  title: 'Curate something for me',
  subtitle: 'Tell me mood, cuisine, or budget.',
  keywords: [],
  responseHint: 'Here are versatile crowd-pleasers to get you started.',
};

export function getConciergeMode() {
  const envMode = (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_CONCIERGE_MODE) || '';
  const configMode = (Constants.expoConfig?.extra as any)?.conciergeMode;
  const normalized = (envMode || configMode || 'local').toString().trim().toLowerCase();
  if (['ai', 'remote', 'backend', 'server'].includes(normalized)) return 'ai';
  return 'local';
}

export function findPromptById(id?: string | null) {
  if (!id) return null;
  return CONCIERGE_PROMPTS.find((prompt) => prompt.id === id) ?? null;
}

export function pickPromptForText(text: string) {
  const normalized = text.toLowerCase();
  let best = DEFAULT_PROMPT;
  let bestScore = 0;

  for (const prompt of CONCIERGE_PROMPTS) {
    let score = 0;
    for (const keyword of prompt.keywords) {
      if (normalized.includes(keyword)) {
        score += 2;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = prompt;
    }
  }

  return best;
}

const hasTag = (restaurant: RestaurantSummary, tag: string) => {
  const haystack = normalizeList(restaurant.tags);
  return haystack.includes(tag) || haystack.some((entry) => entry.includes(tag));
};

const hasCuisine = (restaurant: RestaurantSummary, cuisine: string) => {
  const haystack = normalizeList(restaurant.cuisine);
  return haystack.some((entry) => entry.includes(cuisine));
};

function scoreRestaurantForPrompt(restaurant: RestaurantSummary, prompt: ConciergePrompt, index: number) {
  let score = 0;

  if (prompt.categoryId && matchesCategory(prompt.categoryId, restaurant)) {
    score += 6;
  }

  if (prompt.tags?.length) {
    for (const tag of prompt.tags) {
      if (hasTag(restaurant, tag)) {
        score += 3;
      }
    }
  }

  if (prompt.cuisines?.length) {
    for (const cuisine of prompt.cuisines) {
      if (hasCuisine(restaurant, cuisine)) {
        score += 2;
      }
    }
  }

  const price = priceRank(restaurant.price_level);
  if (prompt.id === 'romantic_views' && price && price >= 3) {
    score += 1.5;
  }

  if (typeof restaurant.rating === 'number') {
    score += Math.min(restaurant.rating, 5) * 0.8;
  }

  // Slight preference for earlier entries to keep results fresh but stable.
  score += Math.max(0, 2 - index * 0.04);

  return score;
}

export function recommendForPrompt(prompt: ConciergePrompt, restaurants: RestaurantSummary[], limit = 3) {
  if (!restaurants.length) return [];

  const candidates = restaurants
    .map((restaurant, idx) => ({ restaurant, score: scoreRestaurantForPrompt(restaurant, prompt, idx) }))
    .sort((a, b) => b.score - a.score);

  const topMatches = candidates.filter((entry) => entry.score > 0).slice(0, limit);
  if (topMatches.length) {
    return topMatches.map((entry) => entry.restaurant);
  }

  // Fallback: reuse category filter or take leading restaurants.
  if (prompt.categoryId) {
    const byCategory = filterByCategory(restaurants, prompt.categoryId).slice(0, limit);
    if (byCategory.length) return byCategory;
  }

  return restaurants.slice(0, limit);
}

export type RecommendationResult = {
  items: RestaurantSummary[];
  summary?: string;
  relaxed?: boolean;
  needsMoreInfo?: boolean;
};

const hasFilters = (filters: DiscoveryFilters) =>
  Boolean(
    (filters.cuisines && filters.cuisines.length) ||
    (filters.tags && filters.tags.length) ||
    filters.maxPriceRank ||
    filters.minPriceRank ||
    filters.neighborhood ||
    filters.groupSize,
  );

// --- Freeform discovery path ---

const PRICE_WORDS: Record<string, { tier: number; strict?: boolean }> = {
  cheap: { tier: 1, strict: true },
  budget: { tier: 1, strict: true },
  'low budget': { tier: 1, strict: true },
  affordable: { tier: 1, strict: true },
  inexpensive: { tier: 1, strict: true },
  'not expensive': { tier: 1, strict: true },
  casual: { tier: 2 },
  moderate: { tier: 2 },
  mid: { tier: 2 },
  '$$': { tier: 2 },
  reasonable: { tier: 2 },
  upscale: { tier: 3 },
  expensive: { tier: 4 },
  premium: { tier: 4 },
  luxury: { tier: 4 },
};

const TAG_KEYWORDS: Record<string, string[]> = {
  rooftop: ['rooftop', 'skyline', 'view', 'sunset', 'terrace', 'panorama'],
  romantic: ['date', 'romantic', 'anniversary', 'candlelight', 'proposal'],
  live_music: ['live music', 'dj', 'band', 'vinyl', 'performance'],
  cocktails: ['cocktail', 'mixology', 'bar', 'negroni', 'martini'],
  brunch: ['brunch', 'breakfast', 'daytime', 'coffee', 'pastry'],
  seafood: ['seafood', 'fish', 'caviar', 'oyster', 'lobster'],
  family: ['family', 'kids', 'group', 'birthday', 'celebration'],
  vegan: ['vegan', 'vegetarian', 'plant'],
  quiet: ['quiet', 'calm', 'business', 'meeting'],
  waterfront: ['waterfront', 'sea', 'boulevard', 'seaside'],
};

const CUISINE_KEYWORDS = [
  'italian',
  'japanese',
  'sushi',
  'seafood',
  'steak',
  'azerbaijani',
  'local',
  'mediterranean',
  'turkish',
  'indian',
  'thai',
  'chinese',
  'burger',
  'bbq',
  'vegan',
  'vegetarian',
  'brunch',
  'cafe',
];

const NEIGHBORHOOD_KEYWORDS: Record<string, string[]> = {
  boulevard: ['boulevard', 'seaside', 'waterfront'],
  nizami: ['nizami', 'torgovy'],
  old_city: ['icheri', 'old city', 'walled'],
  port_baku: ['port baku', 'portbaku', 'port-baku'],
  sea_breeze: ['sea breeze', 'seabreeze', 'nardaran'],
  white_city: ['white city', 'agh seher', 'ag seher'],
  ganjlik: ['ganjlik', 'gənclik', 'ganclik'],
  narimanov: ['narimanov', 'narminov'],
  bayil: ['bayil', 'flag square'],
  shikhov: ['shikhov', 'bibiheybat', 'bibi heybat'],
  bilgah: ['bilgah', 'bilgeh'],
};

const GROUP_TAGS = ['group_dining', 'family', 'birthday', 'private_room', 'celebration'];

export function deriveFiltersFromText(text: string, _restaurants: RestaurantSummary[]): DiscoveryFilters {
  const normalized = text.toLowerCase();
  const filters: DiscoveryFilters = {};

  for (const [word, meta] of Object.entries(PRICE_WORDS)) {
    if (normalized.includes(word)) {
      filters.maxPriceRank = filters.maxPriceRank ? Math.min(filters.maxPriceRank, meta.tier) : meta.tier;
      if (meta.strict) filters.strictBudget = true;
    }
  }

  const cuisines: string[] = [];
  for (const cuisine of CUISINE_KEYWORDS) {
    if (normalized.includes(cuisine)) cuisines.push(cuisine);
  }
  if (cuisines.length) filters.cuisines = cuisines;

  const tags: string[] = [];
  for (const [tag, words] of Object.entries(TAG_KEYWORDS)) {
    if (words.some((word) => normalized.includes(word))) {
      tags.push(tag);
    }
  }
  if (tags.length) filters.tags = tags;

  for (const [id, words] of Object.entries(NEIGHBORHOOD_KEYWORDS)) {
    if (words.some((word) => normalized.includes(word))) {
      filters.neighborhood = id;
    }
  }

  const sizeMatch = normalized.match(/(for|party of)\s*(\d{1,2})/);
  if (sizeMatch) filters.groupSize = Number(sizeMatch[2]);

  return filters;
}

export function filtersSummary(filters: DiscoveryFilters) {
  const parts: string[] = [];
  if (filters.cuisines?.length) parts.push(filters.cuisines.join(', '));
  if (filters.tags?.length) parts.push(filters.tags.join(', '));
  if (filters.maxPriceRank) parts.push(`<= tier ${filters.maxPriceRank}`);
  if (filters.neighborhood) parts.push(filters.neighborhood.replace('_', ' '));
  return parts.join(' • ');
}

function scoreRestaurantWithFilters(restaurant: RestaurantSummary, filters: DiscoveryFilters, index: number) {
  let score = 0;

  if (filters.cuisines?.length) {
    for (const cuisine of filters.cuisines) {
      if (hasCuisine(restaurant, cuisine)) score += 3.5;
    }
  }

  if (filters.tags?.length) {
    for (const tag of filters.tags) {
      if (hasTag(restaurant, tag)) score += 3;
    }
  }

  if (filters.neighborhood && restaurant.neighborhood) {
    const neigh = restaurant.neighborhood.toLowerCase();
    if (neigh.includes(filters.neighborhood.replace('_', ' '))) score += 2;
  }

  const rank = priceRank(restaurant.price_level);
  if (filters.maxPriceRank && rank) {
    if (rank <= filters.maxPriceRank) score += 3;
    else score -= 4;
  }

  // Prefer cheaper when budget is present even if within cap
  if (filters.maxPriceRank && rank) {
    score += Math.max(0, filters.maxPriceRank - rank) * 1.2;
  }

  if (filters.groupSize && filters.groupSize >= 6) {
    if (GROUP_TAGS.some((tag) => hasTag(restaurant, tag))) score += 2;
  }

  if (typeof restaurant.rating === 'number') {
    score += Math.min(restaurant.rating, 5) * 0.6;
  }

  score += Math.max(0, 2 - index * 0.03);

  return score;
}

export function recommendForText(text: string, restaurants: RestaurantSummary[], limit = 4) {
  if (!restaurants.length) return { items: [] } as RecommendationResult;

  const filters = deriveFiltersFromText(text, restaurants);
  const hasSignal = hasFilters(filters);
  const tooShort = text.trim().length < 6;

  if (!hasSignal && tooShort) {
    return { items: [], needsMoreInfo: true };
  }

  const priceCapExcludesMissing = filters.strictBudget && Boolean(filters.maxPriceRank);

  const applyFilters = (pool: RestaurantSummary[]) =>
    pool.filter((restaurant) => {
      if (filters.cuisines?.length && !filters.cuisines.some((cuisine) => hasCuisine(restaurant, cuisine))) return false;
      if (filters.tags?.length && !filters.tags.some((tag) => hasTag(restaurant, tag))) return false;
      if (filters.maxPriceRank) {
        const rank = priceRank(restaurant.price_level);
        if (!rank && priceCapExcludesMissing) return false;
        if (rank && rank > filters.maxPriceRank) return false;
      }
      if (filters.neighborhood && restaurant.neighborhood) {
        const neigh = restaurant.neighborhood.toLowerCase();
        if (!neigh.includes(filters.neighborhood.replace('_', ' '))) return false;
      }
      if (filters.groupSize && filters.groupSize >= 6) {
        if (!GROUP_TAGS.some((tag) => hasTag(restaurant, tag))) return false;
      }
      return true;
    });

  const filtered = applyFilters(restaurants);

  const rankAndSelect = (pool: RestaurantSummary[], relaxed = false): RecommendationResult => {
    const scored = pool
      .map((restaurant, idx) => ({ restaurant, score: scoreRestaurantWithFilters(restaurant, filters, idx) }))
      .sort((a, b) => b.score - a.score);
    const hits = scored.filter((entry) => entry.score > 0).slice(0, limit).map((entry) => entry.restaurant);
    return { items: hits, summary: filtersSummary(filters), relaxed };
  };

  if (filtered.length) {
    return rankAndSelect(filtered, false);
  }

  // Relax one constraint at a time: neighborhood -> tags -> price -> cuisines.
  const relaxedFilters: Array<keyof DiscoveryFilters> = filters.strictBudget
    ? ['neighborhood', 'tags', 'cuisines']
    : ['neighborhood', 'tags', 'maxPriceRank', 'cuisines'];
  for (const key of relaxedFilters) {
    const clone: DiscoveryFilters = { ...filters };
    // @ts-expect-error dynamic delete
    delete clone[key];
    const pool = restaurants.filter((restaurant) => {
      if (clone.cuisines?.length && !clone.cuisines.some((cuisine) => hasCuisine(restaurant, cuisine))) return false;
      if (clone.tags?.length && !clone.tags.some((tag) => hasTag(restaurant, tag))) return false;
      if (clone.maxPriceRank) {
        const rank = priceRank(restaurant.price_level);
        if (!rank && clone.strictBudget) return false;
        if (rank && rank > clone.maxPriceRank) return false;
      }
      if (clone.neighborhood && restaurant.neighborhood) {
        const neigh = restaurant.neighborhood.toLowerCase();
        if (!neigh.includes(clone.neighborhood.replace('_', ' '))) return false;
      }
      if (clone.groupSize && clone.groupSize >= 6) {
        if (!GROUP_TAGS.some((tag) => hasTag(restaurant, tag))) return false;
      }
      return true;
    });
    if (pool.length) {
      return rankAndSelect(pool, true);
    }
  }

  const prompt = pickPromptForText(text) ?? DEFAULT_PROMPT;
  const fallback = recommendForPrompt(prompt, restaurants, limit);
  if (!hasSignal) {
    return { items: [], needsMoreInfo: true } as RecommendationResult;
  }
  return { items: fallback, summary: undefined, relaxed: true } as RecommendationResult;
}

// --- Booking intent path ---

export type BookingIntent = {
  restaurant: RestaurantSummary | null;
  partySize?: number;
  time?: string | null;
  date?: string | null;
};

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function fuzzyScoreName(name: string, query: string) {
  if (!name || !query) return 0;
  const normName = normalizeName(name);
  const normQuery = normalizeName(query);
  if (normName.includes(normQuery)) return 6;
  if (normQuery.includes(normName)) return 5;
  let score = 0;
  const nameParts = new Set(normName.split(' '));
  for (const part of normQuery.split(' ')) {
    if (nameParts.has(part)) score += 1;
  }
  return score;
}

function parseTime(text: string): string | null {
  const lower = text.toLowerCase();
  const match = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3];
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  hours = Math.max(0, Math.min(23, hours));
  const mins = Math.max(0, Math.min(59, minutes));
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

export function detectBookingIntent(text: string, restaurants: RestaurantSummary[]): BookingIntent | null {
  const lower = text.toLowerCase();
  const bookingKeywords = ['book', 'reserve', 'table', 'reservation', 'res'];
  if (!bookingKeywords.some((word) => lower.includes(word))) return null;

  const partyMatch = lower.match(/(for|party of)\s*(\d{1,2})/);
  const partySize = partyMatch ? Number(partyMatch[2]) : undefined;
  const time = parseTime(lower);
  const date = lower.includes('tonight') || lower.includes('today') ? 'today' : lower.includes('tomorrow') ? 'tomorrow' : null;

  let best: { restaurant: RestaurantSummary; score: number } | null = null;
  for (const restaurant of restaurants) {
    const score = fuzzyScoreName(restaurant.name, text);
    if (score > 0 && (!best || score > best.score)) {
      best = { restaurant, score };
    }
  }

  return {
    restaurant: best?.restaurant ?? null,
    partySize,
    time,
    date,
  };
}
