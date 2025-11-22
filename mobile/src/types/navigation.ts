import type { NavigatorScreenParams } from '@react-navigation/native';
import type { AvailabilitySlot, Reservation } from '../api';

export type MainTabParamList = {
  Discover: undefined;
  Explore: { resetToTop?: boolean } | undefined;
  Reservations: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Tabs: NavigatorScreenParams<MainTabParamList>;
  Restaurant: { id: string; name?: string };
  Book: { id: string; name: string; guestName?: string; guestPhone?: string };
  SeatPicker: {
    id: string;
    name: string;
    partySize: number;
    slot: AvailabilitySlot;
    guestName?: string;
    guestPhone?: string;
    timezone?: string;
  };
  PrepNotify: {
    reservation: Reservation;
    restaurantName: string;
  };
  Concierge: { prompt?: string } | undefined;
  RestaurantCollection: {
    title: string;
    subtitle?: string;
    source: 'most_booked' | 'trending' | 'category' | 'search' | 'collection';
    categoryId?: string;
    query?: string;
    restaurantIds?: string[];
  };
};
