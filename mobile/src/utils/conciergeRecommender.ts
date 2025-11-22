import type { RestaurantSummary } from '../api';

type PriceBucket = 1 | 2 | 3 | 4;

const priceKeywordMap: Record<PriceBucket, string[]> = {
  1: [
    'cheap',
    'budget',
    'value',
    'student',
    'low key',
    'casual',
    'affordable',
    'inexpensive',
    'low-budget',
    'economical',
    'wallet friendly',
  ],
  2: [
    'mid',
    'relaxed',
    'weekday',
    'lunch',
    'comfortable',
    'moderate',
    'reasonable',
    'not too expensive',
    'not expensive',
  ],
  3: ['nice', 'date', 'special', 'celebration', 'anniversary', 'romantic', 'treat'],
  4: [
    'luxury',
    'splurge',
    'fine dining',
    'tasting',
    'upscale',
    'premium',
    'fancy',
    'expensive',
    'pricey',
    'high-end',
    'exclusive',
    'posh',
  ],
};

const pricePhraseOverrides: Array<{ pattern: RegExp; bucket: PriceBucket }> = [
  { pattern: /not\s+(too\s+)?expensive/, bucket: 2 },
  { pattern: /not\s+(cheap|budget|inexpensive)/, bucket: 3 },
];

const priceContextRegex = /\b(?:azn|manat|price|budget|spend|per person|pp)\b/;

const vibeKeywordMap: Array<{
  keywords: string[];
  tags: string[];
  weight?: number;
}> = [
  {
    keywords: ['romantic', 'date', 'anniversary', 'proposal', 'candlelit', 'candlelight', 'intimate', 'special night'],
    tags: ['skyline', 'sunset', 'fine_dining', 'wine_cellar'],
  },
  {
    keywords: [
      'family',
      'family-friendly',
      'family friendly',
      'kids',
      'kid friendly',
      'kids friendly',
      'kid-friendly',
      'kids-friendly',
      'with kids',
      'brunch',
      'sunday',
      'breakfast',
    ],
    tags: ['family', 'brunch', 'breakfast'],
  },
  {
    keywords: ['traditional', 'authentic', 'local experience', 'azerbaijani breakfast', 'azerbaijan vibe', 'cultural'],
    tags: ['heritage', 'old_city', 'tea_house'],
    weight: 1.1,
  },
  {
    keywords: ['backgammon', 'nardi', 'nard', 'dominoes', 'board game', 'board games', 'games', 'tea house', 'tea-house', 'chai', 'chay'],
    tags: ['tea_house'],
    weight: 1.5,
  },
  {
    keywords: ['hookah', 'shisha', 'nargile', 'sheesha'],
    tags: ['late_night', 'casual'],
    weight: 1.2,
  },
  {
    keywords: ['live music', 'band', 'dj', 'late night', 'nightlife', 'jazz', 'piano', 'acoustic'],
    tags: ['live_music', 'late_night'],
  },
  {
    keywords: ['waterfront', 'seaside', 'boulevard', 'caspian', 'sea view', 'harbor', 'harbour'],
    tags: ['waterfront', 'sunset'],
  },
  {
    keywords: ['rooftop', 'skyline', 'view', 'panorama'],
    tags: ['skyline', 'sunset', 'hotel_partner'],
  },
  {
    keywords: ['garden', 'outdoor', 'terrace', 'patio', 'courtyard'],
    tags: ['garden'],
  },
  {
    keywords: ['heritage', 'old city', 'icheri', 'ichari', 'history', 'old town'],
    tags: ['old_city', 'heritage'],
  },
  {
    keywords: ['steak', 'meat', 'ribeye'],
    tags: ['steakhouse'],
  },
  {
    keywords: ['seafood', 'fish', 'oyster'],
    tags: ['seafood'],
  },
  {
    keywords: ['dessert', 'sweet', 'patisserie', 'baklava'],
    tags: ['dessert'],
  },
  {
    keywords: ['wine', 'sommelier', 'cellar'],
    tags: ['wine_cellar'],
  },
  {
    keywords: ['casual', 'chill', 'laid back', 'laid-back', 'quick bite', 'cozy', 'low key', 'neighborhood', 'laidback'],
    tags: ['casual', 'quick_bite', 'comfort'],
  },
];

const cuisineKeywordMap: Record<string, string[]> = {
  italian: ['pasta', 'italian', 'trattoria'],
  azerbaijani: ['azerbaijani', 'local', 'national'],
  traditional: ['traditional', 'authentic', 'heritage'],
  seafood: ['seafood', 'fish', 'oyster', 'caviar'],
  steakhouse: ['steak', 'grill', 'meat'],
  sushi: ['sushi', 'japanese', 'nigiri'],
  mediterranean: ['mediterranean', 'mezze'],
  turkish: ['turkish', 'ocakbasi'],
  cafe: ['cafe', 'coffee'],
  brunch: ['brunch', 'breakfast'],
  'tea house': ['tea house', 'teahouse', 'tea', 'chai', 'chay'],
};

type LocationKeyword = {
  keywords: string[];
  tag?: string;
  weight?: number;
};

const locationKeywords: LocationKeyword[] = [
  { keywords: ['old city', 'icheri', 'ichari', 'icherisheher', 'iceri sheher'], tag: 'old_city', weight: 1.2 },
  { keywords: ['boulevard', 'seaside', 'caspian', 'waterfront', 'boulevard park'], tag: 'waterfront', weight: 1.4 },
  {
    keywords: ['fountain square', 'fountains square', 'fountain sq', 'tarqovi', 'targovy', 'nizami street', 'torgovaya'],
    weight: 1.25,
  },
  {
    keywords: ['downtown', 'city center', 'centre', 'central baku', 'downtown baku'],
    weight: 1.1,
  },
  { keywords: ['port baku', 'white city'], weight: 1.1 },
  { keywords: ['bayil', 'bayil promenade'], weight: 1.0 },
];

const SCORE_FLOOR = 0.1;

const tokenizer = (value: string) => value.toLowerCase().trim();

const includesKeyword = (haystack: string, keyword: string) =>
  haystack.includes(keyword.toLowerCase());

const priceBucketFromValue = (value: number): PriceBucket => {
  if (Number.isNaN(value) || value <= 0) {
    return 1;
  }
  if (value <= 40) return 1;
  if (value <= 70) return 2;
  if (value <= 100) return 3;
  return 4;
};

const detectNumericBudget = (prompt: string): PriceBucket | null => {
  const underMatch = prompt.match(
    /\b(?:under|below|less than|not more than|up to|upto|max(?:imum)?)\s*(\d{1,4})\s*(?:₼|\bazn|\bmanat\b)?/,
  );
  if (underMatch) {
    const value = Number(underMatch[1]);
    if (!Number.isNaN(value)) {
      return priceBucketFromValue(value);
    }
  }

  const hasPriceCue = priceContextRegex.test(prompt) || prompt.includes('₼');

  if (hasPriceCue) {
    const rangeMatch = prompt.match(/(\d{1,4})\s*(?:-|\u2013|to)\s*(\d{1,4})\s*(?:₼|\bazn|\bmanat\b)?/);
    if (rangeMatch) {
      const highValue = Number(rangeMatch[2]);
      if (!Number.isNaN(highValue)) {
        return priceBucketFromValue(highValue);
      }
    }

    const currencyMatch = prompt.match(/(?:₼\s*(\d{1,4}))|(?:(\d{1,4})\s*(?:₼|azn|manat))/);
    if (currencyMatch) {
      const raw = currencyMatch[1] || currencyMatch[2];
      const value = raw ? Number(raw) : Number.NaN;
      if (!Number.isNaN(value)) {
        return priceBucketFromValue(value);
      }
    }
  }

  return null;
};

const detectPricePreference = (prompt: string): PriceBucket | null => {
  const normalized = tokenizer(prompt);

  for (const { pattern, bucket } of pricePhraseOverrides) {
    if (pattern.test(normalized)) {
      return bucket;
    }
  }

  const numericBudget = detectNumericBudget(normalized);
  if (numericBudget) {
    return numericBudget;
  }

  for (const [bucket, words] of Object.entries(priceKeywordMap)) {
    if (words.some((word) => includesKeyword(normalized, word))) {
      return Number(bucket) as PriceBucket;
    }
  }
  return null;
};

const bucketForPriceLevel = (price?: string | null): PriceBucket => {
  if (!price) return 2;
  const match = price.match(/\b([1-4])\b/);
  if (match) {
    const value = Number(match[1]);
    if (value >= 1 && value <= 4) {
      return value as PriceBucket;
    }
  }
  const numericMatch = price.match(/(\d{1,4})/);
  if (numericMatch) {
    return priceBucketFromValue(Number(numericMatch[1]));
  }
  return 2;
};

const scorePriceFit = (prompt: string, restaurant: RestaurantSummary): number => {
  const preference = detectPricePreference(prompt);
  if (!preference) return 0;
  const bucket = bucketForPriceLevel(restaurant.price_level || restaurant.average_spend);
  const delta = Math.abs(bucket - preference);
  return Math.max(0, 2.5 - delta * 1.2);
};

const scoreTagMatches = (prompt: string, restaurant: RestaurantSummary): number => {
  const haystack = tokenizer(prompt);
  const tags = (restaurant.tags || []).map((tag) => tag.toLowerCase());
  if (!tags.length) return 0;
  let score = 0;
  vibeKeywordMap.forEach(({ keywords, tags: desiredTags, weight = 1.5 }) => {
    const matchesPrompt = keywords.some((keyword) => includesKeyword(haystack, keyword));
    if (!matchesPrompt) return;
    const matchesTag = desiredTags.some((target) => tags.includes(target));
    if (matchesTag) {
      score += weight;
    }
  });
  return score;
};

const scoreCuisineMatches = (prompt: string, restaurant: RestaurantSummary): number => {
  const haystack = tokenizer(prompt);
  const cuisines = (restaurant.cuisine || []).map((c) => c.toLowerCase());
  if (!cuisines.length) return 0;
  let score = 0;
  Object.entries(cuisineKeywordMap).forEach(([cuisineKey, keywords]) => {
    if (!cuisines.includes(cuisineKey)) return;
    if (keywords.some((keyword) => includesKeyword(haystack, keyword))) {
      score += 1.4;
    }
  });
  return score;
};

const scoreLocationHints = (prompt: string, restaurant: RestaurantSummary): number => {
  const haystack = tokenizer(prompt);
  const tags = (restaurant.tags || []).map((tag) => tag.toLowerCase());
  const description = (
    `${restaurant.short_description || ''} ${restaurant.city || ''} ${restaurant.neighborhood || ''} ${restaurant.address || ''}`
  ).toLowerCase();
  let score = 0;
  locationKeywords.forEach(({ keywords, tag, weight }) => {
    const matchesPrompt = keywords.some((keyword) => includesKeyword(haystack, keyword));
    if (!matchesPrompt) return;
    const hasTag = tag ? tags.includes(tag) : false;
    const hasTextMatch = keywords.some((keyword) => description.includes(keyword));
    if (hasTag || hasTextMatch) {
      score += weight ?? 1;
    }
  });
  return score;
};

const scoreDescriptionOverlap = (prompt: string, restaurant: RestaurantSummary): number => {
  const haystack = tokenizer(prompt);
  const description = (restaurant.short_description || '').toLowerCase();
  if (!description) return 0;
  const keywords = [
    'waterfront',
    'garden',
    'rooftop',
    'brunch',
    'breakfast',
    'cocktail',
    'heritage',
    'seafood',
    'hookah',
    'shisha',
    'nargile',
    'tea',
    'tea house',
    'backgammon',
    'dominoes',
    'dessert',
  ];
  const overlaps = keywords.filter((keyword) => includesKeyword(haystack, keyword) && description.includes(keyword));
  return overlaps.length * 0.8;
};

const fallbackScore = (restaurant: RestaurantSummary, index: number): number => 0.2 - index * 0.001;

export const recommendRestaurants = (
  prompt: string,
  restaurants: RestaurantSummary[],
  limit = 4,
): RestaurantSummary[] => {
  const query = prompt.trim();
  if (!query) return [];
  const normalized = tokenizer(query);
  const scored = restaurants.map((restaurant, index) => {
    const score =
      scorePriceFit(normalized, restaurant) +
      scoreTagMatches(normalized, restaurant) +
      scoreCuisineMatches(normalized, restaurant) +
      scoreLocationHints(normalized, restaurant) +
      scoreDescriptionOverlap(normalized, restaurant) +
      fallbackScore(restaurant, index);
    return { restaurant, score };
  });
  const filtered = scored
    .filter((item) => item.score > SCORE_FLOOR)
    .sort((a, b) => b.score - a.score || a.restaurant.name.localeCompare(b.restaurant.name))
    .slice(0, limit)
    .map((item) => item.restaurant);

  if (filtered.length) {
    return filtered;
  }
  return restaurants.slice(0, limit);
};
