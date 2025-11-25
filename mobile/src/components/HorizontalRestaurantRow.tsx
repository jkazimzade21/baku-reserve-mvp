import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { colors, radius, spacing, shadow } from '../config/theme';
import { RestaurantSummary } from '../api';
import { resolveRestaurantPhotos, defaultFallbackSource } from '../utils/photoSources';
import { formatLocation, formatPriceLabel, formatReviews, getPrimaryCuisine, hashRating } from '../utils/restaurantMeta';
import SectionHeading from './SectionHeading';

type Props = {
  restaurants: RestaurantSummary[];
  onPressRestaurant: (id: string, name: string) => void;
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
  actionLabel?: string;
  onPressAction?: () => void;
  paddingHorizontal?: number;
};

export default function HorizontalRestaurantRow({
  restaurants,
  onPressRestaurant,
  title,
  subtitle,
  emptyMessage = 'Check back later.',
  actionLabel,
  onPressAction,
  paddingHorizontal = spacing.lg,
}: Props) {
  if (!restaurants || restaurants.length === 0) {
    return (
      <View style={[styles.container, { paddingHorizontal }]}>
        {title ? <Text style={styles.emptyTitle}>{title}</Text> : null}
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {title ? (
        <View style={[styles.header, { paddingHorizontal }]}>
          <SectionHeading
            title={title}
            subtitle={subtitle}
            actionLabel={actionLabel}
            onPressAction={onPressAction}
          />
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal }]}
        decelerationRate="fast"
        snapToInterval={280 + spacing.md} // card width + gap
      >
        {restaurants.map((item) => {
          const bundle = resolveRestaurantPhotos(item);
          const coverSource = bundle.cover ?? defaultFallbackSource;
          const { rating, reviews } = hashRating(item.id || item.slug || 'restaurant');
          const priceLabel = formatPriceLabel(item.price_level) || '$$';
          const displayCuisine = getPrimaryCuisine(item);
          const location = formatLocation(item.neighborhood || item.city) || 'Baku';

          return (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => onPressRestaurant(item.id, item.name || 'Restaurant')}
            >
              <View style={styles.imageWrapper}>
                <Image source={coverSource} style={styles.image} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <View style={styles.metaRow}>
                  <Feather name="star" size={14} color={colors.primaryStrong} />
                  <Text style={styles.ratingValue}>{rating.toFixed(1)}</Text>
                  <Text style={styles.ratingReviews}>({formatReviews(reviews)})</Text>
                  {priceLabel ? (
                    <>
                      <Text style={styles.metaDot}>•</Text>
                      <Text style={styles.metaText}>{priceLabel}</Text>
                    </>
                  ) : null}
                  {displayCuisine ? (
                    <>
                      <Text style={styles.metaDot}>•</Text>
                      <Text style={styles.metaText}>{displayCuisine}</Text>
                    </>
                  ) : null}
                  {location ? (
                    <>
                      <Text style={styles.metaDot}>•</Text>
                      <Text style={styles.metaText}>{location}</Text>
                    </>
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  scrollContent: {
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  card: {
    width: 280,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    overflow: 'hidden',
    ...shadow.subtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: {
    opacity: 0.95,
    transform: [{ scale: 0.99 }],
  },
  imageWrapper: {
    width: '100%',
    height: 150,
    backgroundColor: colors.overlay,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  cardBody: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  ratingValue: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  ratingReviews: {
    color: colors.muted,
    fontSize: 11,
  },
  metaDot: {
    color: colors.muted,
    marginHorizontal: 2,
  },
  metaText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 12,
  },
  emptyContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    fontStyle: 'italic',
  },
});
