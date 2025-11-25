import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import HorizontalRestaurantRow from '../components/HorizontalRestaurantRow';
import FeaturedEventCard from '../components/FeaturedEventCard';
import ConciergeEntryCard, { type PromptLike } from '../components/ConciergeEntryCard';
import { colors, radius, shadow, spacing } from '../config/theme';
import { useRestaurantDirectory } from '../contexts/RestaurantDirectoryContext';
import { defaultFallbackSource, resolveRestaurantPhotos } from '../utils/photoSources';
import {
  getMockMostBooked,
  getMockContinueExploring,
  getMockNewOnBakuReserve,
  getMockFeaturedExperiences,
  getShowcaseVenues,
  getMockConciergePrompts,
  type MockEvent,
} from '../data/mockShowcaseData';
import type { MainTabParamList, RootStackParamList } from '../types/navigation';
import type { RestaurantSummary } from '../api';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Discover'>,
  NativeStackScreenProps<RootStackParamList>
>;

type ContextState = {
  partySize?: number;
  date?: string;
  time?: string;
};

const partyOptions = [2, 3, 4, 6, 8];
const dateOptions = ['Tonight', 'Tomorrow', 'Weekend'];
const timeOptions = ['19:00', '20:00', '21:30'];
const quickLinkPrompt = 'Date night on a rooftop';

export default function HomeScreen({ navigation }: Props) {
  const { restaurants, refreshing, reload } = useRestaurantDirectory();
  const [contextState, setContextState] = useState<ContextState>({});
  const [contextModalVisible, setContextModalVisible] = useState(false);

  const mostBooked = useMemo(() => getMockMostBooked(), []);
  const continueExploring = useMemo(() => getMockContinueExploring(), []);
  const newOnReserve = useMemo(() => getMockNewOnBakuReserve(), []);
  const experiences = useMemo(() => getMockFeaturedExperiences(), []);
  const conciergePrompts = useMemo(() => getMockConciergePrompts(), []);

  const showcaseLookup = useMemo(() => {
    const map = new Map<string, RestaurantSummary>();
    getShowcaseVenues().forEach((item) => map.set(item.id, item));
    restaurants.forEach((item) => map.set(item.id, item));
    return map;
  }, [restaurants]);

  const experienceCards = useMemo<Array<MockEvent & { imageSource: any; venueName: string }>>(() => {
    return experiences.map((experience) => {
      const venue = showcaseLookup.get(experience.venueId);
      const photoBundle = venue ? resolveRestaurantPhotos(venue) : null;
      return {
        ...experience,
        venueName: venue?.name ?? 'Baku Reserve',
        imageSource: photoBundle?.cover ?? defaultFallbackSource,
      };
    });
  }, [experiences, showcaseLookup]);

  const handleOpenSearch = () => {
    Haptics.selectionAsync().catch(() => {});
    navigation.navigate('RestaurantCollection', {
      title: 'Search Baku',
      subtitle: 'Search restaurants, cuisines, vibes…',
      source: 'search',
      query: '',
    });
  };

  const handleRestaurantPress = (id: string, name: string) => {
    Haptics.selectionAsync().catch(() => {});
    navigation.navigate('Restaurant', { id, name });
  };

  const handleConcierge = (prompt?: PromptLike) => {
    const params =
      typeof prompt === 'string'
        ? { initialText: prompt }
        : prompt && 'id' in prompt
          ? { promptId: prompt.id, initialText: (prompt as any).label ?? (prompt as any).title }
          : undefined;
    navigation.navigate('Concierge', params);
  };

  const openContextModal = () => {
    Haptics.selectionAsync().catch(() => {});
    setContextModalVisible(true);
  };

  const applyContextSelection = (values: ContextState) => {
    setContextState(values);
    setContextModalVisible(false);
  };

  const contextLabel = useMemo(() => {
    const party = contextState.partySize ? `${contextState.partySize} guests` : 'Party –';
    const date = contextState.date ?? 'Date –';
    const time = contextState.time ?? 'Time –';
    return `${party}  •  ${date}  •  ${time}`;
  }, [contextState]);

  const renderCompactRail = (title: string, data: RestaurantSummary[]) => (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.compactScroll}
      >
        {data.map((restaurant) => {
          const photoBundle = resolveRestaurantPhotos(restaurant);
          const meta =
            restaurant.neighborhood ||
            restaurant.city ||
            (Array.isArray((restaurant.tags as any)?.location) && (restaurant.tags as any).location?.[0]) ||
            (restaurant.cuisine ?? [])[0] ||
            'Baku';
          return (
            <Pressable
              key={restaurant.id}
              style={({ pressed }) => [styles.compactCard, pressed && styles.cardPressed]}
              onPress={() => handleRestaurantPress(restaurant.id, restaurant.name ?? 'Restaurant')}
            >
              <Image source={photoBundle.cover ?? defaultFallbackSource} style={styles.compactImage} />
              <View style={styles.compactBody}>
                <Text style={styles.compactName} numberOfLines={1}>
                  {restaurant.name}
                </Text>
                <Text style={styles.compactMeta} numberOfLines={1}>
                  {meta}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => reload({ refreshing: true })}
            tintColor={colors.primaryStrong}
          />
        }
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
          onPress={handleOpenSearch}
          accessibilityRole="button"
        >
          <Feather name="search" size={18} color={colors.muted} />
          <Text style={styles.searchPlaceholder}>Search restaurants, cuisines, vibes…</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.quickLink, pressed && styles.cardPressed]}
          onPress={() => handleConcierge(quickLinkPrompt)}
          accessibilityRole="button"
        >
          <Feather name="zap" size={16} color={colors.primaryStrong} />
          <Text style={styles.quickLinkText} numberOfLines={1}>
            Try a quick prompt: {quickLinkPrompt}
          </Text>
          <Feather name="arrow-up-right" size={16} color={colors.text} />
        </Pressable>

        <Pressable style={styles.contextPill} onPress={openContextModal} accessibilityRole="button">
          <Feather name="sliders" size={16} color={colors.primaryStrong} />
          <Text style={styles.contextLabel} numberOfLines={1}>
            {contextLabel}
          </Text>
          <Feather name="chevron-right" size={16} color={colors.primaryStrong} />
        </Pressable>

        <View style={styles.section}>
          <ConciergeEntryCard
            prompts={conciergePrompts}
            onOpen={() => handleConcierge()}
            onSelectPrompt={(prompt) => handleConcierge(prompt)}
          />
        </View>

        <View style={styles.section}>
          <HorizontalRestaurantRow
            title="Most booked tonight"
            subtitle="Popular right now in Baku"
            restaurants={mostBooked}
            actionLabel="See all"
            paddingHorizontal={0}
            onPressAction={() =>
              navigation.navigate('RestaurantCollection', {
                title: 'Most booked tonight',
                subtitle: 'Shortlist of the hottest tables',
                source: 'most_booked',
              })
            }
            onPressRestaurant={handleRestaurantPress}
          />
        </View>

        {renderCompactRail('Continue exploring', continueExploring)}
        {renderCompactRail('New on Baku Reserve', newOnReserve)}

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Featured experiences</Text>
            <Text style={styles.sectionSubtitle}>Events & tasting menus</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.eventsScroll}
          >
            {experienceCards.map((experience: MockEvent & { imageSource: any; venueName: string }) => (
              <FeaturedEventCard
                key={experience.id}
                title={`${experience.title} · ${experience.venueName}`}
                date={experience.date}
                imageSource={experience.imageSource}
                onPress={() =>
                  navigation.navigate('RestaurantCollection', {
                    title: experience.title,
                    subtitle: experience.highlight,
                    source: 'most_booked',
                  })
                }
              />
            ))}
          </ScrollView>
        </View>
      </ScrollView>

      <ContextModal
        visible={contextModalVisible}
        initialState={contextState}
        onClose={() => setContextModalVisible(false)}
        onApply={applyContextSelection}
      />
    </SafeAreaView>
  );
}

type ContextModalProps = {
  visible: boolean;
  initialState: ContextState;
  onClose: () => void;
  onApply: (values: ContextState) => void;
};

function ContextModal({ visible, initialState, onApply, onClose }: ContextModalProps) {
  const [partySize, setPartySize] = useState<number | undefined>(initialState.partySize);
  const [date, setDate] = useState<string | undefined>(initialState.date);
  const [time, setTime] = useState<string | undefined>(initialState.time);

  useEffect(() => {
    if (visible) {
      setPartySize(initialState.partySize);
      setDate(initialState.date);
      setTime(initialState.time);
    }
  }, [initialState, visible]);

  const reset = () => {
    setPartySize(undefined);
    setDate(undefined);
    setTime(undefined);
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
    >
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Plan your night</Text>

          <Text style={styles.modalLabel}>Party size</Text>
          <View style={styles.modalChipRow}>
            {partyOptions.map((option) => (
              <Pressable
                key={option}
                style={[styles.modalChip, partySize === option && styles.modalChipActive]}
                onPress={() => setPartySize(option)}
              >
                <Text style={[styles.modalChipText, partySize === option && styles.modalChipTextActive]}>
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.modalLabel}>Date</Text>
          <View style={styles.modalChipRow}>
            {dateOptions.map((option) => (
              <Pressable
                key={option}
                style={[styles.modalChip, date === option && styles.modalChipActive]}
                onPress={() => setDate(option)}
              >
                <Text style={[styles.modalChipText, date === option && styles.modalChipTextActive]}>
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.modalLabel}>Time</Text>
          <View style={styles.modalChipRow}>
            {timeOptions.map((option) => (
              <Pressable
                key={option}
                style={[styles.modalChip, time === option && styles.modalChipActive]}
                onPress={() => setTime(option)}
              >
                <Text style={[styles.modalChipText, time === option && styles.modalChipTextActive]}>
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.modalActions}>
            <Pressable style={styles.modalSecondary} onPress={reset}>
              <Text style={styles.modalSecondaryText}>Clear</Text>
            </Pressable>
            <Pressable
              style={styles.modalPrimary}
              onPress={() => onApply({ partySize, date, time })}
            >
              <Text style={styles.modalPrimaryText}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.xl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  locationLabel: {
    fontSize: 18,
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
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  profilePillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.subtle,
  },
  searchPlaceholder: {
    fontSize: 16,
    color: colors.muted,
    flex: 1,
  },
  contextPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  contextLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
  quickLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickLinkText: {
    flex: 1,
    color: colors.text,
    fontWeight: '600',
  },
  section: {
    gap: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
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
  compactScroll: {
    gap: spacing.md,
  },
  compactCard: {
    width: 160,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    overflow: 'hidden',
    ...shadow.subtle,
  },
  compactImage: {
    width: '100%',
    height: 110,
  },
  compactBody: {
    padding: spacing.sm,
    gap: spacing.xs / 2,
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
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  eventsScroll: {
    paddingRight: spacing.md,
    gap: spacing.md,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  modalChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  modalChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalChipActive: {
    backgroundColor: colors.primaryFaint,
    borderColor: colors.primaryStrong,
  },
  modalChipText: {
    fontSize: 14,
    color: colors.text,
  },
  modalChipTextActive: {
    color: colors.primaryStrong,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  modalSecondary: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modalSecondaryText: {
    fontWeight: '600',
    color: colors.text,
  },
  modalPrimary: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.text,
    alignItems: 'center',
  },
  modalPrimaryText: {
    color: colors.background,
    fontWeight: '700',
  },
});
