import type { RestaurantSummary } from '../api';

// Restaurants that should stay searchable but be hidden from discovery rails.
const HIDDEN_DISCOVERY_IDS = [
  'yanardag_restaurant',
  'yanardag-restaurant',
  'yanardag',
  'barin_baku',
  'barin-baku',
  'seabaybaku',
  'marani_azerbaijan',
  'marani-azerbaijan',
  'manzarabaku',
  'portbakujasmine',
  'ivarestaurantbaku',
  'khachapuri.love',
  'khachapuri-love',
  'nikkibeach.baku',
  'nikkibeach-baku',
  'beerbashabaku',
  'zilrestaurant',
  'parkhouse.restaurant_',
  'parkhouse-restaurant',
  'villaturkishcuisine',
  'fishboxbaku',
  'aynur.restoran.hotel',
  'aynur-restoran-hotel',
  'rustaveligeorgianrestaurant',
  'bestplacebaku',
  'ocakbasi_mangal',
  'ocakbasi-mangal',
  'terrace.145',
  'terrace-145',
  'natavan_restaurant',
  'natavan-restaurant',
  'plove_restaurant',
  'plove-restaurant',
  'themoodbaku',
  'themood-bistro-grill',
  'nana_restaurant_az',
  'nana-restaurant-az',
  'restaurantnuxa',
  'restaurant-nuxa',
  'malikhane_restaurant',
  'malikhane-restaurant',
  'des_baku',
  'des-baku',
  'narsharab_restaurant',
  'narsharab-restaurant',
  'niaqara_restaurant',
  'niaqara-restaurant',
  'harbourbaku',
  'harbour-restaurant-pub',
  'khachapuri.land',
  'khachapuri-land',
  'cookshopbaku',
  'cookshop-baku',
  'societe',
  'societe-baku',
  'gutab_house',
  'gutab-house',
  'mezze__baku',
  'mezze-baku',
  'ceos_lounge_az',
  'ceos-lounge-az',
  'adarestaurantbaku',
  'ada-restaurant-baku',
  'kababzadehrestaurant',
  'kababzadeh-restaurant',
  'lviv.chocolate.baku',
  'lviv-chocolate-baku',
] as const;

const HIDDEN_DISCOVERY_SET = new Set<string>(
  HIDDEN_DISCOVERY_IDS.map((id) => id.toLowerCase()),
);

type MaybeRestaurant = Pick<RestaurantSummary, 'id' | 'slug'> | { id?: string; slug?: string };

export const isHiddenRestaurant = (restaurant: MaybeRestaurant) => {
  const id = restaurant.id?.toString().toLowerCase();
  const slug = restaurant.slug?.toString().toLowerCase();
  return (id && HIDDEN_DISCOVERY_SET.has(id)) || (slug && HIDDEN_DISCOVERY_SET.has(slug));
};

export function filterHiddenRestaurants<T extends MaybeRestaurant>(restaurants: T[]) {
  return restaurants.filter((restaurant) => !isHiddenRestaurant(restaurant));
}
