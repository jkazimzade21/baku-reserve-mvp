import type { RestaurantSummary } from '../api';

export const hashRating = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 10_000_000;
  }
  const rating = 4 + (hash % 90) / 100; // 4.0 - 4.89
  const reviews = 120 + (hash % 12_000);
  return { rating: Math.min(4.9, Number(rating.toFixed(1))), reviews };
};

export const formatReviews = (count: number) => {
  if (count >= 1000) {
    const rounded = Math.round(count / 100) / 10; // 12.3k style
    return `${rounded}K`;
  }
  return `${count}`;
};

export const formatPriceLabel = (price?: string | null) => {
  if (!price) return null;
  const match = price.match(/(\d)/);
  if (match) {
    const level = Number(match[1]);
    return '$'.repeat(Math.min(4, Math.max(1, level)));
  }
  if (/^\$/.test(price.trim())) return price.trim();
  return price;
};

export const formatLocation = (value?: string | null) => {
  if (!value) return null;
  const cleaned = value
    .replace(/[_-]+/g, ' ')
    .replace(/[–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export const formatCuisine = (value?: string | null) => {
  if (!value) return null;
  return value
    .split(/[\s_-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export const getPrimaryCuisine = (restaurant: RestaurantSummary) => {
  const primaryCuisine =
    (Array.isArray(restaurant.tags)
      ? restaurant.tags?.[0]
      : restaurant.tags?.cuisine?.[0]) ?? restaurant.cuisine?.[0];
  return formatCuisine(primaryCuisine);
};
