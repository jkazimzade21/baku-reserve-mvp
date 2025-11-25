export type Restaurant = {
  id: string;
  name: string;
  name_en?: string;
  name_az?: string;
  slug?: string;
  cuisine?: string[];
  tags?: string[] | { [key: string]: string[] };
  neighborhood?: string;
  city?: string;
  price_level?: string;
  photos?: string[];
  cover_photo?: string;
  short_description?: string;
  address?: string;
  timezone?: string;
  phone?: string;
  whatsapp?: string;
  instagram?: string;
  menu_url?: string;
  average_spend?: string;
  areas?: any[];
};

export type RestaurantListItem = {
  id: string;
  name: string;
  name_en?: string;
  name_az?: string;
  slug?: string;
  cuisine?: string[];
  tags?: string[] | { [key: string]: string[] };
  neighborhood?: string;
  city?: string;
  price_level?: string;
  cover_photo?: string;
  short_description?: string;
  rating?: number;
  reviews_count?: number;
};

export type Reservation = {
  id: string;
  restaurant_id: string;
  user_id: string;
  table_id: string;
  party_size: number;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
};

export type ReservationCreate = {
  restaurant_id: string;
  table_id: string;
  party_size: number;
  start_time: string;
  duration_minutes?: number;
};
