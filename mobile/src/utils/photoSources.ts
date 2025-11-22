import type { ImageSourcePropType } from 'react-native';
import type { RestaurantDetail, RestaurantSummary } from '../api';
import { restaurantPhotoManifest } from '../assets/restaurantPhotoManifest';

export type PhotoLike = string | ImageSourcePropType;

type WithPhotoFields = Pick<RestaurantSummary, 'slug' | 'cover_photo'> &
  Partial<Pick<RestaurantDetail, 'photos'>>;

type PhotoBundle = {
  cover: ImageSourcePropType | null;
  gallery: ImageSourcePropType[];
  remoteGallery: string[];
  pending: boolean;
};

const ensureSource = (source: PhotoLike): ImageSourcePropType => {
  if (typeof source === 'string') {
    return { uri: source };
  }
  return source;
};

const FALLBACK_SLUG = 'sahil';
const FALLBACK_REMOTE_URI = `/assets/restaurants/${FALLBACK_SLUG}/1.jpg`;
const FALLBACK_COVER = restaurantPhotoManifest[FALLBACK_SLUG]?.cover;

export const defaultFallbackRemoteUri = FALLBACK_REMOTE_URI;
export const defaultFallbackSource = FALLBACK_COVER ?? ensureSource(FALLBACK_REMOTE_URI);

const dedupeSources = (sources: PhotoLike[]): ImageSourcePropType[] => {
  const seen = new Set<string>();
  const output: ImageSourcePropType[] = [];
  sources.forEach((source) => {
    const imageSource = ensureSource(source);
    const key =
      typeof imageSource === 'number'
        ? `static:${imageSource}`
        : `uri:${(imageSource as { uri?: string }).uri ?? JSON.stringify(imageSource)}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    output.push(imageSource);
  });
  return output;
};

export const resolveRestaurantPhotos = (restaurant: WithPhotoFields): PhotoBundle => {
  const slug = restaurant.slug?.trim() ?? '';
  const manifestEntry = slug ? restaurantPhotoManifest[slug] : undefined;
  const isPending = Boolean(manifestEntry?.pending);
  const manifestCover = !isPending ? manifestEntry?.cover ?? null : null;
  const manifestGallery = !isPending ? manifestEntry?.gallery ?? [] : [];
  const hasLocalAssets = Boolean(manifestCover) || manifestGallery.length > 0;

  const remoteCover = hasLocalAssets || isPending ? null : restaurant.cover_photo?.trim() ?? null;
  const remoteGallery =
    hasLocalAssets || isPending
      ? []
      : Array.isArray(restaurant.photos)
        ? restaurant.photos.filter((photo) => typeof photo === 'string' && photo.trim().length > 0)
        : [];
  const allRemote = [
    ...(remoteCover ? [remoteCover] : []),
    ...remoteGallery,
  ];

  const gallerySources: PhotoLike[] = [
    ...(manifestGallery ?? []),
    ...(remoteCover ? [{ uri: remoteCover }] : []),
    ...(remoteGallery ?? []),
  ];

  const coverCandidate = manifestCover ?? (remoteCover ? { uri: remoteCover } : null);
  const dedupedGallery = dedupeSources(gallerySources);
  const dedupedRemote = Array.from(
    new Set(allRemote.filter((value): value is string => typeof value === 'string' && value.length > 0)),
  );

  return {
    cover: coverCandidate,
    gallery: dedupedGallery,
    remoteGallery: dedupedRemote,
    pending: isPending,
  };
};

export const asImageSource = ensureSource;
