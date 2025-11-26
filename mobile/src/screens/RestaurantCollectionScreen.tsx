import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';

import RestaurantCard from '../components/RestaurantCard';
import { colors, spacing } from '../config/theme';
import { selectCategory, selectMostBooked, selectTrending } from '../utils/restaurantCollections';
import type { RootStackParamList } from '../types/navigation';
import { useRestaurantDirectory } from '../contexts/RestaurantDirectoryContext';

type Props = NativeStackScreenProps<RootStackParamList, 'RestaurantCollection'>;

const flattenTags = (tags: any): string[] => {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags
      .map((entry) => (typeof entry === 'string' ? entry : null))
      .filter((entry): entry is string => Boolean(entry));
  }
  if (typeof tags === 'object') {
    return Object.values(tags)
      .flat()
      .filter((entry): entry is string => typeof entry === 'string');
  }
  return [];
};

export default function RestaurantCollectionScreen({ route, navigation }: Props) {
  const { title, subtitle, source, categoryId, query = '', restaurantIds } = route.params;
  const { restaurants, loading, refreshing, reload } = useRestaurantDirectory();
  const [searchValue, setSearchValue] = useState(query);

  const normalizedSearch = searchValue.trim().toLowerCase();

  const searchMatches = useMemo(() => {
    if (!normalizedSearch) {
      return restaurants;
    }
    return restaurants.filter((restaurant) => {
      const haystack: string[] = [];
      if (restaurant.name) haystack.push(restaurant.name);
      if (restaurant.neighborhood) haystack.push(restaurant.neighborhood);
      if (restaurant.city) haystack.push(restaurant.city);
      if (restaurant.address) haystack.push(restaurant.address);
      haystack.push(...(restaurant.cuisine ?? []));
      haystack.push(...flattenTags(restaurant.tags));
      const normalized = haystack
        .filter((value) => typeof value === 'string' && value.trim())
        .map((value) => value.toLowerCase());
      return normalized.some((entry) => entry.includes(normalizedSearch));
    });
  }, [normalizedSearch, restaurants]);

  const data = useMemo(() => {
    if (!restaurants.length) {
      return [];
    }
    if (source === 'most_booked') {
      return selectMostBooked(restaurants, 20);
    }
    if (source === 'trending') {
      return selectTrending(restaurants, 20);
    }
    if (source === 'category' && categoryId) {
      const results = selectCategory(restaurants, categoryId, 24);
      return results.length ? results : restaurants;
    }
    if (source === 'collection' && restaurantIds?.length) {
      const lookup = new Map(restaurants.map((restaurant) => [restaurant.id, restaurant]));
      const ordered = restaurantIds
        .map((id) => lookup.get(id))
        .filter(Boolean);
      return ordered.length ? ordered : restaurants;
    }
    if (source === 'search') {
      return searchMatches.slice(0, 40);
    }
    return restaurants;
  }, [categoryId, restaurantIds, restaurants, searchMatches, source]);

  const isSearchMode = source === 'search';

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {isSearchMode ? (
        <View style={styles.searchBar}>
          <Feather name="search" size={16} color={colors.muted} />
          <TextInput
            value={searchValue}
            onChangeText={setSearchValue}
            placeholder="Search restaurants, cuisines, tags…"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search restaurants"
          />
        </View>
      ) : null}
      {source === 'category' && data.length === restaurants.length ? (
        <Text style={styles.subtitle}>Showing all venues for now — filters syncing soon.</Text>
      ) : null}
      {source === 'collection' && (!restaurantIds || restaurantIds.length === 0) ? (
        <Text style={styles.subtitle}>Collection syncing soon — showing full list.</Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {loading && !restaurants.length ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.primaryStrong} size="large" />
          <Text style={styles.loadingCopy}>Gathering venues…</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => reload({ refreshing: true })}
              tintColor={colors.primaryStrong}
            />
          }
          renderItem={({ item }) => (
            <RestaurantCard
              item={item}
              onPress={() => navigation.navigate('Restaurant', { id: item.id, name: item.name })}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={header}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No matches yet</Text>
                <Text style={styles.emptySubtitle}>Try another vibe or adjust filters in Explore.</Text>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  searchBar: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
  },
  separator: {
    height: spacing.md,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingCopy: {
    color: colors.muted,
  },
  emptyState: {
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  emptySubtitle: {
    color: colors.muted,
    textAlign: 'center',
  },
});
