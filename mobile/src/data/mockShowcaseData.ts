import type { RestaurantSummary } from '../api';
import { RESTAURANT_SEED } from './restaurantsSeed';

const SHOWCASE_COUNT = 14;

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 1_000_000_007;
  }
  return hash / 1_000_000_007;
};

type WeightedRestaurant = { weight: number; restaurant: RestaurantSummary };

const showcasePool: RestaurantSummary[] = RESTAURANT_SEED
  .map<WeightedRestaurant>((restaurant) => ({ restaurant, weight: hashString(restaurant.id) }))
  .sort((a, b) => a.weight - b.weight)
  .slice(0, SHOWCASE_COUNT)
  .map((entry) => entry.restaurant);

const loopSlice = (start: number, size: number) => {
  if (!showcasePool.length) {
    return [];
  }
  const output: RestaurantSummary[] = [];
  for (let i = 0; i < size; i += 1) {
    const index = (start + i) % showcasePool.length;
    output.push(showcasePool[index]);
  }
  return output;
};

type MockEvent = {
  id: string;
  title: string;
  date: string;
  venueId: string;
  highlight: string;
  description: string;
};

type MockCollection = {
  id: string;
  title: string;
  description: string;
  restaurantIds: string[];
  accent?: string;
};

type MockPrompt = {
  id: string;
  label: string;
  presetCategory: string;
  helper?: string;
};

const events: MockEvent[] = [
  {
    id: 'event-1',
    title: 'Sunset vinyl session',
    date: 'Thu · 20 Nov · 19:00',
    venueId: showcasePool[0]?.id ?? '',
    highlight: 'Analog house + natural wine flight',
    description: 'Limited terrace tables with guest DJ Farid spinning house and disco until late.'
  },
  {
    id: 'event-2',
    title: 'Chef’s table: Caspian harvest',
    date: 'Fri · 21 Nov · 20:30',
    venueId: showcasePool[3]?.id ?? '',
    highlight: '8-course tasting · 12 seats only',
    description: 'Seasonal tasting menu featuring Caspian sturgeon, local caviar, and volcanic wines.'
  },
  {
    id: 'event-3',
    title: 'Boulevard jazz night',
    date: 'Sat · 22 Nov · 21:00',
    venueId: showcasePool[6]?.id ?? '',
    highlight: 'Live quartet · balcony seating',
    description: 'Smoky standards, mezze towers, and low lighting right on the waterfront.'
  },
  {
    id: 'event-4',
    title: 'Tea house stories',
    date: 'Sun · 23 Nov · 17:00',
    venueId: showcasePool[9]?.id ?? '',
    highlight: 'Mugham trio · aromatic tea pairings',
    description: 'Story-led tasting through saffron tea, pakhlava, and heirloom desserts.'
  }
];

const collections: MockCollection[] = [
  {
    id: 'collection-rooftop',
    title: 'Rooftop sunsets',
    description: 'Skyline decks, chill playlists, and late golden hours.',
    accent: 'Views',
    restaurantIds: loopSlice(0, 5).map((r) => r.id),
  },
  {
    id: 'collection-cozy',
    title: 'Cozy tea houses',
    description: 'Carpets, armudu glassware, and live mugham.',
    accent: 'Tea',
    restaurantIds: loopSlice(4, 5).map((r) => r.id),
  },
  {
    id: 'collection-groups',
    title: 'For big groups',
    description: 'Spacious tables, shared platters, and forgiving menus.',
    accent: 'Groups',
    restaurantIds: loopSlice(8, 5).map((r) => r.id),
  },
  {
    id: 'collection-celebrate',
    title: 'Birthday-friendly',
    description: 'Bottle service moments and celebratory desserts.',
    accent: 'Celebrate',
    restaurantIds: loopSlice(3, 4).map((r) => r.id),
  },
  {
    id: 'collection-seafood',
    title: 'Sea breeze dinners',
    description: 'Waterfront grills, rosé carts, and Caspian air.',
    accent: 'Sea',
    restaurantIds: loopSlice(6, 4).map((r) => r.id),
  },
];

const prompts: MockPrompt[] = [
  { id: 'prompt-date', label: 'Date night on a rooftop', presetCategory: 'date_night' },
  { id: 'prompt-wallet', label: 'Wallet-friendly dinner', presetCategory: 'budget_friendly' },
  { id: 'prompt-boulevard', label: 'Seafood by the boulevard', presetCategory: 'rooftop_views' },
  { id: 'prompt-family', label: 'Family brunch this weekend', presetCategory: 'family_friendly' },
  { id: 'prompt-music', label: 'Live music tonight', presetCategory: 'live_music' },
  { id: 'prompt-tea', label: 'Tea house vibes', presetCategory: 'azerbaijani_local' },
];

export const getShowcaseVenues = () => showcasePool;
export const getMockMostBooked = () => loopSlice(0, 6);
export const getMockContinueExploring = () => loopSlice(5, 5);
export const getMockNewOnBakuReserve = () => loopSlice(3, 6);
export const getMockFeaturedExperiences = () => events.slice(0, 3);
export const getMockEvents = () => events;
export const getMockTrending = () => loopSlice(2, 8);
export const getMockPerfectForTonight = () => loopSlice(7, 6);
export const getMockCollections = () => collections;
export const getMockConciergePrompts = () => prompts;

export type { MockEvent, MockCollection, MockPrompt };
