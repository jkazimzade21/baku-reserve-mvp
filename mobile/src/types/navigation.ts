import type { NavigatorScreenParams } from '@react-navigation/native';

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
  Book: {
    id: string;
    name: string;
    guestName?: string;
    guestPhone?: string;
    preselectedDate?: string;
    preselectedTime?: string;
    partySize?: number;
  };
  RestaurantCollection: {
    title: string;
    subtitle?: string;
    source: 'most_booked' | 'trending' | 'category' | 'search' | 'collection';
    categoryId?: string;
    query?: string;
    restaurantIds?: string[];
  };
  Concierge: { promptId?: string; initialText?: string } | undefined;
};
