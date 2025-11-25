import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { colors, radius, shadow, spacing } from '../config/theme';
import type { RestaurantSummary } from '../api';
import { resolveRestaurantPhotos, defaultFallbackSource } from '../utils/photoSources';
import { formatPriceLabel, formatReviews, getPrimaryCuisine, hashRating } from '../utils/restaurantMeta';

type Props = {
  item: RestaurantSummary;
  onPress: () => void;
};

export default function RestaurantCard({ item, onPress }: Props) {
  const displayCuisine = getPrimaryCuisine(item);
  const priceLabel = formatPriceLabel(item.price_level);
  const location = item.neighborhood || item.city || 'Baku';
  const { rating, reviews } = hashRating(item.id || item.slug || 'restaurant');
  const bundle = resolveRestaurantPhotos(item);
  const isPendingPhotos = bundle.pending;
  const hasCover = Boolean(bundle.cover);
  const coverSource = bundle.cover ?? defaultFallbackSource;
  const displayName = item.name || 'Restaurant';

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
          <Text style={styles.coverFallbackText}>{displayName.slice(0, 1).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.title}>{displayName}</Text>
        <View style={styles.ratingRow}>
          <Feather name="star" size={14} color={colors.primaryStrong} />
          <Text style={styles.ratingValue}>{rating.toFixed(1)}</Text>
          <Text style={styles.ratingReviews}>({formatReviews(reviews)}) reviews</Text>
        </View>
        <View style={styles.metaRow}>
          {displayCuisine ? <Text style={styles.meta}>{displayCuisine}</Text> : null}
          {priceLabel ? <Text style={styles.metaDivider}>• {priceLabel}</Text> : null}
          {location ? <Text style={styles.metaDivider}>• {location}</Text> : null}
        </View>
        {item.short_description ? (
          <Text style={styles.description} numberOfLines={2}>
            {item.short_description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
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
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ratingValue: {
    fontWeight: '700',
    color: colors.text,
  },
  ratingReviews: {
    color: colors.muted,
    fontSize: 12,
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
  description: {
    color: colors.muted,
    fontSize: 13,
  },
});
