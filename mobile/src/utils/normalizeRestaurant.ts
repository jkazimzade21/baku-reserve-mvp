import type { RestaurantDetail, RestaurantSummary } from '../api';

type RawRestaurant = Partial<RestaurantSummary> &
  Partial<RestaurantDetail> & {
    name_en?: string;
    name_az?: string;
    contact?: {
      address?: string;
      phone?: string | string[] | null;
      website?: string | null;
    };
    links?: {
      menu?: string | null;
      [key: string]: any;
    };
    tag_groups?: Record<string, string[]>;
  };

const toArray = <T>(value: T | T[] | null | undefined): T[] => {
  if (Array.isArray(value)) return value.filter((item): item is T => item !== null && item !== undefined);
  if (value === null || value === undefined) return [];
  return [value];
};

const normalizeSlug = (value?: string | null) => {
  if (!value) return undefined;
  const cleaned = value.replace(/^@/, '').trim();
  return cleaned || undefined;
};

const deriveSlug = (restaurant: RawRestaurant) => {
  if (restaurant.slug && typeof restaurant.slug === 'string') {
    const cleaned = restaurant.slug.trim();
    if (cleaned) return cleaned;
  }
  const cover = restaurant.cover_photo || (restaurant.photos ?? [])[0];
  if (typeof cover === 'string') {
    const match = cover.match(/restaurants\/([^/]+)\//i);
    if (match?.[1]) return match[1];
  }
  if (restaurant.instagram && typeof restaurant.instagram === 'string') {
    const ig = normalizeSlug(restaurant.instagram);
    if (ig) return ig;
  }
  if (restaurant.id) return String(restaurant.id);
  return undefined;
};

const flattenTags = (tags: any): string[] => {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags.filter((tag): tag is string => typeof tag === 'string');
  }
  if (typeof tags === 'object') {
    return Object.values(tags)
      .flat()
      .filter((tag): tag is string => typeof tag === 'string');
  }
  return [];
};

const normalizeName = (restaurant: RawRestaurant, slug?: string) => {
  if (restaurant.name && typeof restaurant.name === 'string' && restaurant.name.trim()) {
    return restaurant.name;
  }
  if (restaurant.name_en && restaurant.name_en.trim()) return restaurant.name_en;
  if (restaurant.name_az && restaurant.name_az.trim()) return restaurant.name_az;
  if (slug) {
    return slug
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return 'Restaurant';
};

const firstString = (value: string | string[] | null | undefined) => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const entry = value.find((item) => typeof item === 'string' && item.trim());
    return entry ? entry.trim() : undefined;
  }
  return undefined;
};

const normalizeCuisine = (restaurant: RawRestaurant) => {
  if (Array.isArray(restaurant.cuisine) && restaurant.cuisine.length) return restaurant.cuisine;
  if (restaurant.tags && typeof restaurant.tags === 'object') {
    const cuisine = (restaurant.tags as Record<string, string[]>).cuisine;
    if (Array.isArray(cuisine)) return cuisine;
  }
  if (restaurant.tag_groups && restaurant.tag_groups.cuisine?.length) return restaurant.tag_groups.cuisine;
  return [];
};

const normalizePriceLevel = (restaurant: RawRestaurant) => {
  if (restaurant.price_level) return restaurant.price_level;
  const tagPrice =
    (restaurant.tags as any)?.price?.[0] ||
    (restaurant.tag_groups as any)?.price?.[0];
  if (typeof tagPrice === 'string') return tagPrice;
  return undefined;
};

const normalizePhotos = (restaurant: RawRestaurant) => {
  const photos = toArray<string>(restaurant.photos);
  if (photos.length) return photos;
  if (restaurant.cover_photo) return [restaurant.cover_photo];
  return [];
};

const normalizeAddress = (restaurant: RawRestaurant) => {
  return (
    restaurant.address ||
    restaurant.contact?.address ||
    undefined
  );
};

const normalizePhone = (restaurant: RawRestaurant) => {
  return firstString((restaurant as any).phone ?? restaurant.contact?.phone);
};

const normalizeMenuUrl = (restaurant: RawRestaurant) => {
  if (restaurant.menu_url) return restaurant.menu_url;
  if (restaurant.links && typeof restaurant.links === 'object') {
    const menu = (restaurant.links as Record<string, any>).menu;
    if (typeof menu === 'string' && menu.trim()) return menu.trim();
  }
  return undefined;
};

const normalizeInstagram = (restaurant: RawRestaurant) => {
  if (restaurant.instagram) {
    const cleaned = normalizeSlug(restaurant.instagram);
    return cleaned?.startsWith('http') ? cleaned : cleaned ? `https://instagram.com/${cleaned}` : undefined;
  }
  return undefined;
};

export function normalizeRestaurantSummary(raw: RawRestaurant): RestaurantSummary {
  const slug = deriveSlug(raw);
  const name = normalizeName(raw, slug);
  const cuisine = normalizeCuisine(raw);
  const tags = raw.tags ?? raw.tag_groups ?? raw.tags;
  const cover_photo = raw.cover_photo ?? normalizePhotos(raw)[0];
  const photos = normalizePhotos(raw);
  const city = raw.city ?? 'Baku';
  const neighborhood =
    raw.neighborhood ??
    (Array.isArray((raw.tags as any)?.location) ? (raw.tags as any).location?.[0] : undefined);

  return {
    ...raw,
    id: raw.id ? String(raw.id) : slug ?? name,
    slug,
    name,
    cuisine,
    tags,
    neighborhood,
    city,
    price_level: normalizePriceLevel(raw),
    cover_photo,
    photos,
    short_description: raw.short_description ?? undefined,
    instagram: normalizeInstagram(raw) ?? raw.instagram,
  };
}

export function normalizeRestaurantDetail(raw: RawRestaurant): RestaurantDetail {
  const summary = normalizeRestaurantSummary(raw);
  const detail: RestaurantDetail = {
    ...summary,
    address: normalizeAddress(raw) ?? summary.address ?? '',
    phone: normalizePhone(raw) ?? summary.phone ?? '',
    whatsapp: (raw as any).whatsapp ?? null,
    instagram: normalizeInstagram(raw) ?? summary.instagram ?? null,
    menu_url: normalizeMenuUrl(raw) ?? null,
    photos: normalizePhotos(raw),
    cover_photo: summary.cover_photo ?? null,
    areas: (raw as RestaurantDetail).areas ?? [],
    tags: raw.tags ?? raw.tag_groups ?? raw.tags,
    average_spend: raw.average_spend,
  };
  return detail;
}
