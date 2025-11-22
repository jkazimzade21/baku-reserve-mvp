import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow, spacing } from '../config/theme';
import type { RestaurantSummary } from '../api';
import { resolveRestaurantPhotos, defaultFallbackSource } from '../utils/photoSources';

type Props = {
  item: RestaurantSummary;
  onPress: () => void;
};

const tagPriority = [
  'book_early',
  'skyline',
  'late_night',
  'family_brunch',
  'waterfront',
  'seafood',
  'cocktails',
  'garden',
];

const canonicalTag = (tag: string) => {
  switch (tag) {
    case 'must_book':
      return 'book_early';
    case 'sunset':
    case 'seaside':
      return 'waterfront';
    case 'dj':
    case 'dj_nights':
    case 'cocktail_lab':
    case 'nikkei':
      return 'late_night';
    case 'family_style':
    case 'breakfast':
      return 'family_brunch';
    case 'rooftop':
    case 'panorama':
    case 'hotel_partner':
      return 'skyline';
    default:
      return tag;
  }
};

const pickDisplayTag = (tags?: string[]) => {
  if (!tags || tags.length === 0) return null;
  const normalized = tags.map((tag) => canonicalTag(tag));
  for (const candidate of tagPriority) {
    if (normalized.includes(candidate)) {
      return candidate;
    }
  }
  return normalized[0];
};

export default function RestaurantCard({ item, onPress }: Props) {
  const primaryCuisine = item.cuisine?.[0];
  const extraCount = Math.max((item.cuisine?.length ?? 0) - 1, 0);
  const displayTag = pickDisplayTag(item.tags);
  const bundle = resolveRestaurantPhotos(item);
  const isPendingPhotos = bundle.pending;
  const hasCover = Boolean(bundle.cover);
  const coverSource = bundle.cover ?? defaultFallbackSource;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      {isPendingPhotos ? (
        <View style={styles.coverPending}>
          <Text style={styles.pendingTitle}>Photos on the way</Text>
          <Text style={styles.pendingSubtitle}>We’ll drop them in soon.</Text>
        </View>
      ) : hasCover ? (
        <Image source={coverSource} style={styles.cover} resizeMode="cover" />
      ) : (
        <View style={styles.coverFallback}>
          <Text style={styles.coverFallbackText}>{item.name.slice(0, 1).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.title}>{item.name}</Text>
        <View style={styles.metaRow}>
          {primaryCuisine ? <Text style={styles.meta}>{primaryCuisine}</Text> : null}
          {extraCount > 0 && <Text style={styles.badge}>+{extraCount}</Text>}
          {item.price_level ? <Text style={styles.metaDivider}>• {item.price_level}</Text> : null}
        </View>
        {item.short_description ? (
          <Text style={styles.description} numberOfLines={2}>
            {item.short_description}
          </Text>
        ) : null}
        {item.city ? <Text style={styles.city}>{item.city}</Text> : null}
        <View style={styles.footerRow}>
          {displayTag ? <Text style={styles.tag}>{formatTag(displayTag)}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

function formatTag(tag: string) {
  return tag
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
    position: 'relative',
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  cover: {
    width: 96,
    height: 80,
    borderRadius: radius.md,
  },
  coverPending: {
    width: 96,
    height: 80,
    borderRadius: radius.md,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: `${colors.primaryStrong}22`,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  coverFallback: {
    width: 96,
    height: 80,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverFallbackText: {
    color: colors.primaryStrong,
    fontSize: 26,
    fontWeight: '700',
  },
  pendingTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.primaryStrong,
    textAlign: 'center',
  },
  pendingSubtitle: {
    marginTop: 4,
    fontSize: 10,
    color: colors.muted,
    textAlign: 'center',
  },
  cardBody: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  meta: {
    color: colors.muted,
    fontWeight: '500',
  },
  metaDivider: {
    color: colors.muted,
    fontWeight: '500',
    marginLeft: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radius.sm,
    fontSize: 12,
    backgroundColor: colors.overlay,
    color: colors.primaryStrong,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  description: {
    color: colors.muted,
    fontSize: 13,
  },
  city: {
    color: colors.muted,
    fontSize: 13,
  },
  tag: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: colors.primaryStrong,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
