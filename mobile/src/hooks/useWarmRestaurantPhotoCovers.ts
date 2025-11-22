import { useEffect } from 'react';
import { Asset } from 'expo-asset';

import { restaurantPhotoManifest } from '../assets/restaurantPhotoManifest';

const coverModuleIds: number[] = Array.from(
  new Set(
    Object.values(restaurantPhotoManifest)
      .map((bundle) => bundle.cover)
      .filter((value): value is number => typeof value === 'number'),
  ),
);

let warmed = false;

export function useWarmRestaurantPhotoCovers() {
  useEffect(() => {
    if (warmed || coverModuleIds.length === 0) {
      return;
    }
    warmed = true;
    (async () => {
      try {
        await Asset.loadAsync(coverModuleIds);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[photos] Failed to warm restaurant covers', err);
      }
    })();
  }, []);
}
