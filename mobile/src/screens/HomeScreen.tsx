import React, { useCallback, useMemo } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import HorizontalRestaurantRow from '../components/HorizontalRestaurantRow';
import { colors, radius, spacing } from '../config/theme';
import { useRestaurantDirectory } from '../contexts/RestaurantDirectoryContext';
import { defaultFallbackSource, resolveRestaurantPhotos } from '../utils/photoSources';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList, RootStackParamList } from '../types/navigation';
import type { RestaurantSummary } from '../api';
import Surface from '../components/Surface';

 type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Discover'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function HomeScreen({ navigation }: Props) {
  const { restaurants, refreshing, reload } = useRestaurantDirectory();

  const featured = useMemo<RestaurantSummary[]>(() => restaurants.slice(0, 8), [restaurants]);

  const handleRestaurantPress = useCallback(
    (id: string, name: string) => {
      navigation.navigate('Restaurant', { id, name });
    },
    [navigation],
  );

  const handleSearch = useCallback(() => {
    navigation.navigate('RestaurantCollection', {
      title: 'All restaurants',
      subtitle: 'Search and filter Baku venues',
      source: 'search',
      query: '',
    });
  }, [navigation]);

  const cards = useMemo(() => {
    return restaurants.map((restaurant) => {
      const photos = resolveRestaurantPhotos(restaurant);
      return (
        <Pressable
          key={restaurant.id}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={() => handleRestaurantPress(restaurant.id, restaurant.name)}
        >
          <Surface tone="overlay" padding="md" style={styles.cardInner}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{restaurant.name}</Text>
              {restaurant.price_level ? <Text style={styles.price}>{restaurant.price_level}</Text> : null}
            </View>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {restaurant.neighborhood || restaurant.city || 'Baku'}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={2}>
              {(restaurant.cuisine ?? []).join(' • ')}
            </Text>
            <View style={styles.photoRow}>
              <Image source={photos.cover ?? defaultFallbackSource} style={styles.photoImage} />
            </View>
          </Surface>
        </Pressable>
      );
    });
  }, [restaurants, handleRestaurantPress]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload({ refreshing: true })} tintColor={colors.primaryStrong} />}
      >
        <View style={styles.topBar}>
          <Text style={styles.locationLabel}>Baku · Tonight</Text>
          <Pressable style={styles.profilePill} onPress={() => navigation.navigate('Reservations')}>
            <Text style={styles.profilePillText}>My bookings</Text>
            <Feather name="arrow-up-right" size={14} color={colors.text} />
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.searchBar, pressed && styles.cardPressed]}
          onPress={handleSearch}
          accessibilityRole="button"
        >
          <Feather name="search" size={18} color={colors.muted} />
          <Text style={styles.searchPlaceholder}>Search restaurants, cuisines, vibes…</Text>
        </Pressable>

        <HorizontalRestaurantRow
          title="Popular picks"
          subtitle="Places people are booking right now"
          restaurants={featured}
          actionLabel="See all"
          onPressAction={handleSearch}
          onPressRestaurant={handleRestaurantPress}
          paddingHorizontal={0}
        />

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>All restaurants</Text>
          <Text style={styles.sectionSubtitle}>{restaurants.length} options</Text>
        </View>
        <View style={styles.cardGrid}>{cards}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  locationLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  profilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profilePillText: {
    fontWeight: '600',
    color: colors.text,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchPlaceholder: {
    color: colors.muted,
    fontSize: 15,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  sectionSubtitle: {
    color: colors.muted,
  },
  cardGrid: {
    gap: spacing.md,
  },
  card: {
    borderRadius: radius.lg,
  },
  cardPressed: {
    opacity: 0.92,
  },
  cardInner: {
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  cardMeta: {
    color: colors.muted,
    fontSize: 13,
  },
  price: {
    color: colors.primaryStrong,
    fontWeight: '600',
  },
  photoRow: {
    marginTop: spacing.sm,
  },
  photoImage: {
    width: '100%',
    height: 160,
    borderRadius: radius.md,
  },
});
