import type { RestaurantSummary } from '../api';

export type BrowseCategory = {
  id: string;
  label: string;
  icon: string;
  helperText: string;
};

const normalize = (value?: string[] | null) =>
  (value ?? []).map((entry) => entry.toLowerCase());

const hasTag = (restaurant: RestaurantSummary, tags: string[]) => {
  const haystack = normalize(restaurant.tags);
  return tags.some((tag) => haystack.includes(tag));
};

const hasCuisine = (restaurant: RestaurantSummary, cuisines: string[]) => {
  const haystack = normalize(restaurant.cuisine);
  return cuisines.some((cuisine) => haystack.some((entry) => entry.includes(cuisine)));
};

const priceRank = (price?: string | null) => {
  if (!price) return null;
  const match = price.match(/(\d)/);
  return match ? Number(match[1]) : null;
};

const isBudgetFriendly = (restaurant: RestaurantSummary) => {
  const rank = priceRank(restaurant.price_level);
  if (rank !== null) {
    return rank <= 2;
  }
  return hasTag(restaurant, ['casual', 'budget_friendly', 'lunch_special']);
};

export const BROWSE_CATEGORIES: BrowseCategory[] = [
  {
    id: 'date_night',
    label: 'Date night',
    icon: 'heart',
    helperText: 'Soft lights, tasting menus, and wine pairings.',
  },
  {
    id: 'rooftop_views',
    label: 'Rooftop & views',
    icon: 'sunrise',
    helperText: 'Sea breezes, skyline decks, and sunset cocktails.',
  },
  {
    id: 'azerbaijani_local',
    label: 'Azerbaijani & local',
    icon: 'map-pin',
    helperText: 'Heritage recipes, tandir bread, armudu tea.',
  },
  {
    id: 'cafes_breakfast',
    label: 'Cafes & breakfast',
    icon: 'coffee',
    helperText: 'Pour-overs, pastries, and sunny courtyards.',
  },
  {
    id: 'bars_lounges',
    label: 'Bars & lounges',
    icon: 'moon',
    helperText: 'Cocktail labs, vinyl nights, low lighting.',
  },
  {
    id: 'family_friendly',
    label: 'Family-friendly',
    icon: 'users',
    helperText: 'Spacious tables, highchairs, forgiving menus.',
  },
  {
    id: 'budget_friendly',
    label: 'Budget-friendly',
    icon: 'dollar-sign',
    helperText: 'Great meals without the spend.',
  },
  {
    id: 'live_music',
    label: 'Live music & energy',
    icon: 'music',
    helperText: 'Bands, DJs, and curated playlists.',
  },
  {
    id: 'chef_table',
    label: 'Chef’s table',
    icon: 'star',
    helperText: 'Tasting menus, open kitchens, limited seats.',
  },
];

const predicateMap: Record<string, (restaurant: RestaurantSummary) => boolean> = {
  date_night: (restaurant) =>
    hasTag(restaurant, ['romantic', 'date_night', 'couples', 'candlelight']) ||
    priceRank(restaurant.price_level) === 4,
  rooftop_views: (restaurant) => hasTag(restaurant, ['rooftop', 'skyline', 'sea_view', 'sunset', 'terrace']),
  azerbaijani_local: (restaurant) => hasCuisine(restaurant, ['azerbaijani']) || hasTag(restaurant, ['local_cuisine']),
  cafes_breakfast: (restaurant) => hasTag(restaurant, ['breakfast', 'brunch', 'cafe', 'bakery']),
  bars_lounges: (restaurant) => hasTag(restaurant, ['bar', 'cocktails', 'dj', 'late_night', 'mixology']),
  family_friendly: (restaurant) => hasTag(restaurant, ['family', 'kids_welcome', 'group_dining', 'brunch']),
  budget_friendly: (restaurant) => isBudgetFriendly(restaurant),
  live_music: (restaurant) => hasTag(restaurant, ['live_music', 'dj', 'band', 'performance']),
  chef_table: (restaurant) => hasTag(restaurant, ['chef_table', 'tasting_menu', 'open_kitchen', 'chef_counter']),
};

export function matchesCategory(categoryId: string, restaurant: RestaurantSummary) {
  const predicate = predicateMap[categoryId];
  if (!predicate) {
    return false;
  }
  return predicate(restaurant);
}

export function filterByCategory(restaurants: RestaurantSummary[], categoryId: string) {
  return restaurants.filter((restaurant) => matchesCategory(categoryId, restaurant));
}
