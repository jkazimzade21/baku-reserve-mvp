import { RESTAURANT_SEED } from './restaurantsSeed';
import { normalizeRestaurantSummary } from '../utils/normalizeRestaurant';

export const NORMALIZED_RESTAURANT_SEED = RESTAURANT_SEED.map((entry) => normalizeRestaurantSummary(entry));
