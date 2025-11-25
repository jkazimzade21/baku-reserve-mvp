import type { RestaurantSummary } from '../api';
import { filterByCategory } from '../constants/browseCategories';

const FALLBACK_LIMIT = 6;

const normalizedTags = (restaurant: RestaurantSummary) => {
  const tags = restaurant.tags;
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag).toLowerCase());
  }
  if (typeof tags === 'object') {
    return Object.values(tags)
      .flat()
      .filter((item): item is string => typeof item === 'string')
      .map((tag) => tag.toLowerCase());
  }
  return [];
};

const priceRank = (price?: string | null) => {
  if (!price) return 0;
  const match = price.match(/(\d)/);
  return match ? Number(match[1]) : 0;
};

const heroScore = (restaurant: RestaurantSummary) => {
  const tags = normalizedTags(restaurant);
  let score = 0;
  if (tags.includes('book_early') || tags.includes('must_book')) score += 3;
  if (tags.includes('rooftop') || tags.includes('skyline')) score += 2;
  if (tags.includes('late_night') || tags.includes('live_music')) score += 1;
  score += priceRank(restaurant.price_level);
  if (restaurant.short_description) score += 0.5;
  return score;
};

const trendingScore = (restaurant: RestaurantSummary) => {
  const tags = normalizedTags(restaurant);
  let score = 0;
  if (tags.includes('trending') || tags.includes('hot')) score += 2;
  if (tags.includes('new') || tags.includes('launch_2024')) score += 1;
  if (restaurant.cuisine?.some((c) => /fusion|nikkei|asian/i.test(c))) score += 0.5;
  score += (restaurant.short_description?.length ?? 0) > 0 ? 0.5 : 0;
  return score + priceRank(restaurant.price_level) * 0.2;
};

const ensureLimit = (items: RestaurantSummary[], limit = FALLBACK_LIMIT) =>
  items.slice(0, Math.max(1, limit));

export function sampleRestaurants(list: RestaurantSummary[], min = FALLBACK_LIMIT, max = FALLBACK_LIMIT) {
  if (list.length === 0) {
    return [];
  }
  const pool = list.slice();
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const minCount = Math.max(1, Math.min(min, list.length));
  const maxCount = Math.max(minCount, Math.min(max, list.length));
  const take = Math.min(pool.length, Math.floor(Math.random() * (maxCount - minCount + 1)) + minCount);
  return pool.slice(0, Math.max(minCount, take));
}

export function selectMostBooked(restaurants: RestaurantSummary[], limit = FALLBACK_LIMIT) {
  const base = restaurants
    .filter((restaurant) => Boolean(restaurant.cover_photo))
    .sort((a, b) => heroScore(b) - heroScore(a));
  return ensureLimit(base, limit);
}

export function selectTrending(restaurants: RestaurantSummary[], limit = 8) {
  const base = restaurants
    .filter((restaurant) => Boolean(restaurant.cover_photo))
    .sort((a, b) => trendingScore(b) - trendingScore(a));
  return ensureLimit(base, limit);
}

export function selectCategory(restaurants: RestaurantSummary[], categoryId: string, limit = 20) {
  const base = filterByCategory(restaurants, categoryId);
  return ensureLimit(base, limit);
}
