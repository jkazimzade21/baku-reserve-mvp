import React, { useMemo, useRef, useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScrollToTop } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import HorizontalRestaurantRow from '../components/HorizontalRestaurantRow';
import CategoryGrid from '../components/CategoryGrid';
import ConciergeEntryCard from '../components/ConciergeEntryCard';
import { colors, spacing } from '../config/theme';
import { useRestaurantDirectory } from '../contexts/RestaurantDirectoryContext';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { MainTabParamList, RootStackParamList } from '../types/navigation';
import type { RestaurantSummary } from '../api';
import { CONCIERGE_PROMPTS } from '../utils/concierge';
import { track } from '../utils/analytics';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Explore'>,
  NativeStackScreenProps<RootStackParamList>
>;

function shuffleRestaurants(items: RestaurantSummary[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function ExploreScreen({ navigation }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const { restaurants, refreshing, reload } = useRestaurantDirectory();

  const handleOpenConcierge = useCallback(
    (promptId?: string) => {
      Haptics.selectionAsync().catch(() => {});
      track('concierge_open', { source: 'explore_entry', prompt: promptId });
      navigation.navigate('Concierge', promptId ? { promptId } : undefined);
    },
    [navigation],
  );

  const shuffled = useMemo<RestaurantSummary[]>(() => shuffleRestaurants(restaurants), [restaurants]);

  const rated = useMemo<RestaurantSummary[]>(() => {
    return restaurants
      .filter((r) => typeof r.rating === 'number')
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  }, [restaurants]);

  const topRated = useMemo<RestaurantSummary[]>(() => {
    if (!restaurants.length) return [];
    const ratedTop = rated.slice(0, 10);
    if (ratedTop.length >= 10) {
      return ratedTop;
    }
    const exclude = new Set(ratedTop.map((r) => r.id));
    const fillers = shuffled
      .filter((r) => !exclude.has(r.id))
      .slice(0, Math.max(0, 10 - ratedTop.length));
    return [...ratedTop, ...fillers];
  }, [rated, restaurants.length, shuffled]);

  const newest = useMemo<RestaurantSummary[]>(() => {
    if (!restaurants.length) return [];
    const exclude = new Set(topRated.map((r) => r.id));
    return shuffled
      .filter((r) => !exclude.has(r.id))
      .slice(0, Math.min(10, Math.max(0, restaurants.length - exclude.size)));
  }, [restaurants.length, shuffled, topRated]);

  const handleRestaurantPress = (id: string, name: string) => {
    navigation.navigate('Restaurant', { id, name });
  };

  const handleCategorySelect = (id: string) => {
    navigation.navigate('RestaurantCollection', {
      title: 'Browse by vibe',
      source: 'category',
      categoryId: id,
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload({ refreshing: true })} tintColor={colors.primaryStrong} />}
      >
        <View style={styles.section}>
          <ConciergeEntryCard
            prompts={CONCIERGE_PROMPTS}
            onOpen={() => handleOpenConcierge()}
            onSelectPrompt={(prompt) => handleOpenConcierge(prompt.id)}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.pageTitle}>Explore Baku</Text>
          <Text style={styles.pageSubtitle}>Find the right place by vibe, cuisine, or rating.</Text>
        </View>

        <View style={styles.section}>
          <HorizontalRestaurantRow
            title="Top rated"
            subtitle="Loved by recent guests"
            restaurants={topRated}
            actionLabel="See all"
            onPressAction={() =>
              navigation.navigate('RestaurantCollection', {
                title: 'Top rated',
                subtitle: 'Highly reviewed places',
                source: 'search',
                query: '',
              })
            }
            onPressRestaurant={handleRestaurantPress}
          />
        </View>

        <View style={styles.section}>
          <HorizontalRestaurantRow
            title="New this month"
            subtitle="A rotating mix from our 53 venues"
            restaurants={newest}
            actionLabel="See all"
            onPressAction={() => navigation.navigate('RestaurantCollection', { title: 'All restaurants', source: 'search', query: '' })}
            onPressRestaurant={handleRestaurantPress}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Browse by vibe or cuisine</Text>
            <Text style={styles.sectionSubtitle}>Pick a mood, we’ll show matching venues.</Text>
          </View>
          <CategoryGrid maxItems={9} columns={3} onSelectCategory={handleCategorySelect} />
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
});
