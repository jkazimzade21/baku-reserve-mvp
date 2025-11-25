import { useEffect } from 'react';
import { Asset } from 'expo-asset';
import { InteractionManager, Platform } from 'react-native';

import { restaurantPhotoManifest } from '../assets/restaurantPhotoManifest';

const coverModuleIds: number[] = Array.from(
  new Set(
    Object.values(restaurantPhotoManifest)
      .map((bundle) => bundle.cover)
      .filter((value): value is number => typeof value === 'number'),
  ),
);

// Keep warm-up lightweight for startup; loading every cover can stall low-memory devices.
const WARM_LIMIT = 24;
const warmSample = coverModuleIds.slice(0, WARM_LIMIT);

let warmed = false;

export function useWarmRestaurantPhotoCovers() {
  useEffect(() => {
    if (warmed || warmSample.length === 0 || Platform.OS === 'web') {
      return;
    }
    warmed = true;
    // Defer until after initial interactions so the home screen paints first.
    InteractionManager.runAfterInteractions(() => {
      setTimeout(async () => {
        try {
          await Asset.loadAsync(warmSample);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[photos] Failed to warm restaurant covers', err);
        }
      }, 10);
    });
  }, []);
}
