import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CompositeScreenProps } from '@react-navigation/native';
import { useScrollToTop } from '@react-navigation/native';

import ConciergeEntryCard from '../components/ConciergeEntryCard';
import HorizontalRestaurantRow from '../components/HorizontalRestaurantRow';
import CategoryGrid from '../components/CategoryGrid';
import FeaturedEventCard from '../components/FeaturedEventCard';
import { colors, radius, spacing } from '../config/theme';
import { defaultFallbackSource, resolveRestaurantPhotos } from '../utils/photoSources';
import {
  getMockTrending,
  getMockEvents,
  getMockPerfectForTonight,
  getMockCollections,
  getMockConciergePrompts,
  getShowcaseVenues,
  type MockCollection,
  type MockEvent,
} from '../data/mockShowcaseData';
import { useRestaurantDirectory } from '../contexts/RestaurantDirectoryContext';
import type { MainTabParamList, RootStackParamList } from '../types/navigation';
import type { RestaurantSummary } from '../api';

const neighborhoods = [
  'Old City (İçərişəhər)',
  'Nizami Street',
  'Seaside Boulevard',
  'Baku White City',
  'Flame Towers',
  'Badamdar Heights',
];

const collectionColors = ['#F9E4D9', '#DFF2EC', '#E5E2FB', '#FDEBD3', '#E6F0FF'];

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Explore'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function ExploreScreen({ navigation, route }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const { restaurants, refreshing, reload } = useRestaurantDirectory();
  const trending = useMemo(() => getMockTrending(), []);
  const perfectTonight = useMemo(() => getMockPerfectForTonight(), []);
  const events = useMemo(() => getMockEvents(), []);
  const collections = useMemo(() => getMockCollections(), []);
  const conciergePrompts = useMemo(() => getMockConciergePrompts().map((prompt) => prompt.label), []);

  const showcaseLookup = useMemo(() => {
    const map = new Map<string, RestaurantSummary>();
    getShowcaseVenues().forEach((item) => map.set(item.id, item));
    restaurants.forEach((item) => map.set(item.id, item));
    return map;
  }, [restaurants]);

  const eventCards = useMemo<Array<MockEvent & { imageSource: any; venueName: string }>>(() => {
    return events.map((event) => {
      const venue = showcaseLookup.get(event.venueId);
      const bundle = venue ? resolveRestaurantPhotos(venue) : null;
      return {
        ...event,
        venueName: venue?.name ?? 'Baku Reserve',
        imageSource: bundle?.cover ?? defaultFallbackSource,
      };
    });
  }, [events, showcaseLookup]);

  useEffect(() => {
    if (route.params?.resetToTop) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      navigation.setParams({ resetToTop: undefined });
    }
  }, [navigation, route.params?.resetToTop]);

  const handleConcierge = useCallback(
    (prompt?: string) => {
      navigation.navigate('Concierge', prompt ? { prompt } : undefined);
    },
    [navigation],
  );

  const handleRestaurantPress = useCallback(
    (id: string, name: string) => {
      navigation.navigate('Restaurant', { id, name });
    },
    [navigation],
  );

  const handleSeeAllTrending = useCallback(() => {
    navigation.navigate('RestaurantCollection', {
      title: 'Trending this week',
      subtitle: 'Shortlist of high-demand tables',
      source: 'trending',
    });
  }, [navigation]);

  const handleCategorySelect = useCallback(
    (id: string) => {
      navigation.navigate('RestaurantCollection', {
        title: 'Browse by vibe',
        source: 'category',
        categoryId: id,
      });
    },
    [navigation],
  );

  const handleNeighborhoodSelect = (label: string) => {
    navigation.navigate('RestaurantCollection', {
      title: label,
      subtitle: 'Neighborhood focus',
      source: 'search',
      query: label,
    });
  };

  const handleCollectionPress = (collection: MockCollection) => {
    navigation.navigate('RestaurantCollection', {
      title: collection.title,
      subtitle: collection.description,
      source: 'collection',
      restaurantIds: collection.restaurantIds,
    });
  };

  const renderCompactRail = (title: string, subtitle: string, data: RestaurantSummary[]) => (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.compactScroll}>
        {data.map((restaurant) => {
          const bundle = resolveRestaurantPhotos(restaurant);
          return (
            <Pressable
              key={restaurant.id}
              style={styles.compactCard}
              onPress={() => handleRestaurantPress(restaurant.id, restaurant.name)}
            >
              <Image source={bundle.cover ?? defaultFallbackSource} style={styles.compactImage} />
              <Text style={styles.compactName}>{restaurant.name}</Text>
              <Text style={styles.compactMeta}>{restaurant.neighborhood || (restaurant.cuisine ?? [])[0] || 'Baku'}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => reload({ refreshing: true })}
            tintColor={colors.primaryStrong}
          />
        }
      >
        <View style={styles.section}>
          <Text style={styles.pageTitle}>Explore Baku</Text>
          <Text style={styles.pageSubtitle}>Concierge, events, and curated collections.</Text>
        </View>

        <View style={styles.section}>
          <ConciergeEntryCard
            prompts={conciergePrompts}
            onPress={() => handleConcierge()}
            onPromptSelect={(prompt) => handleConcierge(prompt)}
          />
        </View>

        <View style={styles.section}>
          <HorizontalRestaurantRow
            title="Trending this week"
            subtitle="Where members are requesting tables now"
            restaurants={trending}
            actionLabel="See all"
            onPressAction={handleSeeAllTrending}
            onPressRestaurant={handleRestaurantPress}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Events near you</Text>
            <Text style={styles.sectionSubtitle}>Jazz nights, chef tables, takeovers</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eventsScroll}>
            {eventCards.map((event) => (
              <FeaturedEventCard
                key={event.id}
                title={`${event.title} · ${event.venueName}`}
                date={event.date}
                imageSource={event.imageSource}
                onPress={() =>
                  navigation.navigate('RestaurantCollection', {
                    title: event.title,
                    subtitle: event.highlight,
                    source: 'most_booked',
                  })
                }
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Browse by vibe or cuisine</Text>
            <Text style={styles.sectionSubtitle}>Pick a mood, we’ll do the rest.</Text>
          </View>
          <CategoryGrid maxItems={9} columns={3} onSelectCategory={handleCategorySelect} />
        </View>

        {renderCompactRail('Perfect for tonight', 'Ready-to-book vibes', perfectTonight)}

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Explore by neighborhood</Text>
            <Text style={styles.sectionSubtitle}>Each area comes with its own rhythm.</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {neighborhoods.map((label) => (
              <Pressable key={label} style={styles.chip} onPress={() => handleNeighborhoodSelect(label)}>
                <Text style={styles.chipText}>{label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Collections</Text>
            <Text style={styles.sectionSubtitle}>Vetted themes for every plan.</Text>
          </View>
          <View style={styles.collectionGrid}>
            {collections.map((collection, index) => (
              <Pressable
                key={collection.id}
                style={[styles.collectionCard, { backgroundColor: collectionColors[index % collectionColors.length] }]}
                onPress={() => handleCollectionPress(collection)}
              >
                {collection.accent ? <Text style={styles.collectionAccent}>{collection.accent}</Text> : null}
                <Text style={styles.collectionTitle}>{collection.title}</Text>
                <Text style={styles.collectionDescription}>{collection.description}</Text>
                <Text style={styles.collectionCount}>{collection.restaurantIds.length} venues</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.md,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    paddingHorizontal: spacing.lg,
  },
  pageSubtitle: {
    fontSize: 14,
    color: colors.muted,
    paddingHorizontal: spacing.lg,
  },
  sectionHeading: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: colors.muted,
  },
  eventsScroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  compactScroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  compactCard: {
    width: 180,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  compactImage: {
    width: '100%',
    height: 110,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  compactName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  compactMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  chipRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  collectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  collectionCard: {
    width: '47%',
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  collectionAccent: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.muted,
  },
  collectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  collectionDescription: {
    fontSize: 13,
    color: colors.muted,
  },
  collectionCount: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: spacing.xs,
    color: colors.text,
  },
});
