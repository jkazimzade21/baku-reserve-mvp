import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image } from 'react-native';
import { colors, radius, spacing, shadow } from '../config/theme';
import { RestaurantSummary } from '../api';
import { resolveRestaurantPhotos, defaultFallbackSource } from '../utils/photoSources';
import { LinearGradient } from 'expo-linear-gradient';
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

          return (
            <Pressable
              key={item.id}
              style={styles.card}
              onPress={() => onPressRestaurant(item.id, item.name || 'Restaurant')}
            >
              <Image source={coverSource} style={styles.image} />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.8)']}
                style={styles.gradient}
              />
              <View style={styles.cardContent}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {/* Handle both array tags and object tags */}
                  {(Array.isArray(item.tags) ? item.tags : item.tags?.cuisine ?? item.cuisine ?? []).slice(0, 2).join(' • ') || item.city || 'Baku'}
                </Text>
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
    height: 180,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    overflow: 'hidden',
    ...shadow.subtle,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
    top: '40%',
  },
  cardContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 4,
  },
  meta: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
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
