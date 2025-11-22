import React, { createContext, useContext } from 'react';

import { useRestaurants, type UseRestaurantsReturn } from '../hooks/useRestaurants';

type RestaurantDirectoryContextValue = UseRestaurantsReturn;

const RestaurantDirectoryContext = createContext<RestaurantDirectoryContextValue | null>(null);

export function RestaurantDirectoryProvider({ children }: { children: React.ReactNode }) {
  const value = useRestaurants();
  return (
    <RestaurantDirectoryContext.Provider value={value}>{children}</RestaurantDirectoryContext.Provider>
  );
}

export function useRestaurantDirectory() {
  const context = useContext(RestaurantDirectoryContext);
  if (!context) {
    throw new Error('useRestaurantDirectory must be used within RestaurantDirectoryProvider');
  }
  return context;
}
