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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import HorizontalRestaurantRow from '../components/HorizontalRestaurantRow';
import FeaturedEventCard from '../components/FeaturedEventCard';
import type { PromptLike } from '../components/ConciergeEntryCard';
import { colors, radius, shadow, spacing } from '../config/theme';
import { useRestaurantDirectory } from '../contexts/RestaurantDirectoryContext';
import { defaultFallbackSource, resolveRestaurantPhotos } from '../utils/photoSources';
import { formatLocation } from '../utils/restaurantMeta';
import {
  getMockMostBooked,
  getMockContinueExploring,
  getMockNewOnBakuReserve,
  getMockFeaturedExperiences,
  getShowcaseVenues,
  type MockEvent,
} from '../data/mockShowcaseData';
import type { MainTabParamList, RootStackParamList } from '../types/navigation';
import type { RestaurantSummary } from '../api';
import { DEFAULT_TIMEZONE, getDateString } from '../utils/availability';
import { parseDateInput } from '../utils/dateInput';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Discover'>,
  NativeStackScreenProps<RootStackParamList>
>;

const quickLinkPrompt = 'Date night on a rooftop';

export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const timezone = DEFAULT_TIMEZONE;
  const { restaurants, refreshing, reload } = useRestaurantDirectory();
  const [partySize, setPartySize] = useState<number>(2);
  const [dateStr, setDateStr] = useState<string>(() => getDateString(new Date(), timezone));
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [pendingDateStr, setPendingDateStr] = useState<string>(dateStr);
  const [pendingParty, setPendingParty] = useState<number>(partySize);
  const [pendingTime, setPendingTime] = useState<string | null>(null);

  const plannerDateOptions = useMemo(() => buildDateOptions(timezone, 14), [timezone]);
  const timeOptions = useMemo(() => buildTimeOptions(dateStr, timezone), [dateStr, timezone]);
  const plannerTimeOptions = useMemo(() => buildTimeOptions(pendingDateStr, timezone), [pendingDateStr, timezone]);
  const summaryDate = parseDateInput(dateStr) ?? new Date();
  const selectedTimeLabel = selectedTime ? formatChipTime(selectedTime, timezone) : 'Pick a time';

  useEffect(() => {
    if (!selectedTime && timeOptions.length) {
      setSelectedTime(timeOptions[0]);
    }
  }, [selectedTime, timeOptions]);

  useEffect(() => {
    if (!pendingTime && plannerTimeOptions.length) {
      setPendingTime(plannerTimeOptions[0]);
    }
  }, [pendingTime, plannerTimeOptions]);

  const mostBooked = useMemo(() => getMockMostBooked(), []);
  const continueExploring = useMemo(() => getMockContinueExploring(), []);
  const newOnReserve = useMemo(() => getMockNewOnBakuReserve(), []);
  const experiences = useMemo(() => getMockFeaturedExperiences(), []);

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

  const openPlanner = () => {
    Haptics.selectionAsync().catch(() => {});
    setPendingParty(partySize);
    setPendingDateStr(dateStr);
    setPendingTime(selectedTime);
    setPlannerOpen(true);
  };

  const closePlanner = () => setPlannerOpen(false);

  const applyPlanner = () => {
    const appliedTime = pendingTime ?? plannerTimeOptions[0] ?? null;
    setPartySize(pendingParty);
    setDateStr(pendingDateStr);
    setSelectedTime(appliedTime);
    setPendingTime(appliedTime);
    setPlannerOpen(false);
  };

  const renderCompactRail = (title: string, data: RestaurantSummary[]) => (
    <View style={[styles.section, styles.sectionFullBleed]}>
      <View style={[styles.sectionHeaderRow, styles.sectionPad]}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.compactScroll, styles.sectionPad]}
      >
        {data.map((restaurant) => {
          const photoBundle = resolveRestaurantPhotos(restaurant);
          const meta =
            formatLocation(
              restaurant.neighborhood ||
                restaurant.city ||
                (Array.isArray((restaurant.tags as any)?.location)
                  ? (restaurant.tags as any).location?.[0]
                  : undefined) ||
                (restaurant.cuisine ?? [])[0],
            ) || 'Baku';
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

        <Pressable style={styles.plannerPill} onPress={openPlanner} accessibilityRole="button">
          <View style={styles.plannerSummaryRow}>
            <View style={styles.summaryItem}>
              <Feather name="user" size={16} color={colors.primaryStrong} />
              <Text style={styles.summaryText}>{partySize}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Feather name="calendar" size={16} color={colors.primaryStrong} />
              <Text style={styles.summaryText}>{formatDateCompact(summaryDate, timezone)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Feather name="clock" size={16} color={colors.primaryStrong} />
              <Text style={styles.summaryText}>{selectedTimeLabel}</Text>
            </View>
          </View>
          <Feather name="chevron-down" size={16} color={colors.primaryStrong} />
        </Pressable>

        <View style={[styles.section, styles.sectionFullBleed]}>
          <HorizontalRestaurantRow
            title="Most booked tonight"
            subtitle="Popular right now in Baku"
            restaurants={mostBooked}
            actionLabel="See all"
            onPressAction={() =>
              navigation.navigate('RestaurantCollection', {
                title: 'Most booked tonight',
                subtitle: 'Shortlist of the hottest tables',
                source: 'most_booked',
              })
            }
            onPressRestaurant={handleRestaurantPress}
            paddingHorizontal={spacing.lg}
          />
        </View>

        {renderCompactRail('Continue exploring', continueExploring)}
        {renderCompactRail('New on Baku Reserve', newOnReserve)}

        <View style={[styles.section, styles.sectionFullBleed]}>
          <View style={[styles.sectionHeaderRow, styles.sectionPad]}>
            <Text style={styles.sectionTitle}>Featured experiences</Text>
            <Text style={styles.sectionSubtitle}>Events & tasting menus</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.eventsScroll, styles.sectionPad]}
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

      <PlannerModal
        visible={plannerOpen}
        onClose={closePlanner}
        onApply={applyPlanner}
        pendingDate={pendingDateStr}
        pendingParty={pendingParty}
        pendingTime={pendingTime}
        onSelectDate={setPendingDateStr}
        onSelectParty={setPendingParty}
        onSelectTime={setPendingTime}
        timeOptions={plannerTimeOptions}
        dateOptions={plannerDateOptions}
        bottomInset={insets.bottom}
        timezone={timezone}
      />
    </SafeAreaView>
  );
}

type PlannerModalProps = {
  visible: boolean;
  onClose: () => void;
  onApply: () => void;
  pendingParty: number;
  pendingDate: string;
  pendingTime: string | null;
  onSelectParty: (value: number) => void;
  onSelectDate: (value: string) => void;
  onSelectTime: (value: string) => void;
  timeOptions: string[];
  dateOptions: { value: string; label: string }[];
  bottomInset: number;
  timezone: string;
};

function PlannerModal({
  visible,
  onClose,
  onApply,
  pendingParty,
  pendingDate,
  pendingTime,
  onSelectParty,
  onSelectDate,
  onSelectTime,
  timeOptions,
  dateOptions,
  bottomInset,
  timezone,
}: PlannerModalProps) {

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
    >
      <View style={styles.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheetCard, { paddingBottom: bottomInset + spacing.lg }]}
        >
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Plan your night</Text>
            <Pressable onPress={onClose} accessibilityRole="button">
              <Feather name="x" size={20} color={colors.mutedStrong} />
            </Pressable>
          </View>

          <Text style={styles.sheetLabel}>Party size</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sheetRail}
          >
            {Array.from({ length: 20 }, (_, idx) => idx + 1).map((size) => {
              const selected = size === pendingParty;
              return (
                <Pressable
                  key={size}
                  style={[styles.railChip, selected && styles.railChipActive]}
                  onPress={() => onSelectParty(size)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.railChipText, selected && styles.railChipTextActive]}>{size}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.sheetGrid}>
            <View style={styles.sheetColumnWrapper}>
              <Text style={styles.sheetLabel}>Date</Text>
              <ScrollView style={styles.sheetColumn} contentContainerStyle={styles.sheetColumnContent}>
                {dateOptions.map((opt) => {
                  const selected = opt.value === pendingDate;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[styles.listRow, selected && styles.listRowActive]}
                      onPress={() => onSelectDate(opt.value)}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.listRowText, selected && styles.listRowTextActive]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.sheetColumnWrapper}>
              <Text style={styles.sheetLabel}>Time</Text>
              <ScrollView style={styles.sheetColumn} contentContainerStyle={styles.sheetColumnContent}>
                {timeOptions.map((time) => {
                  const selected = time === pendingTime;
                  return (
                    <Pressable
                      key={time}
                      style={[styles.listRow, selected && styles.listRowActive]}
                      onPress={() => onSelectTime(time)}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.listRowText, selected && styles.listRowTextActive]}>{formatChipTime(time, timezone)}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          <Pressable style={styles.sheetPrimary} onPress={onApply} accessibilityRole="button">
            <Text style={styles.sheetPrimaryText}>Done</Text>
          </Pressable>
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
  plannerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.subtle,
  },
  plannerSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  summaryText: {
    color: colors.text,
    fontWeight: '600',
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
  sectionFullBleed: {
    marginHorizontal: -spacing.lg,
  },
  sectionPad: {
    paddingHorizontal: spacing.lg,
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
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -2 },
    elevation: 10,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  sheetLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  sheetRail: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  railChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  railChipActive: {
    backgroundColor: colors.primaryFaint,
    borderColor: colors.primaryStrong,
  },
  railChipText: {
    fontSize: 14,
    color: colors.text,
  },
  railChipTextActive: {
    color: colors.primaryStrong,
    fontWeight: '700',
  },
  sheetGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  sheetColumnWrapper: {
    flex: 1,
    gap: spacing.xs,
  },
  sheetColumn: {
    maxHeight: 260,
  },
  sheetColumnContent: {
    gap: spacing.xs / 2,
    paddingBottom: spacing.sm,
  },
  listRow: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listRowActive: {
    backgroundColor: colors.primaryFaint,
    borderColor: colors.primaryStrong,
  },
  listRowText: {
    color: colors.text,
    fontSize: 14,
  },
  listRowTextActive: {
    color: colors.primaryStrong,
    fontWeight: '700',
  },
  sheetPrimary: {
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.text,
    alignItems: 'center',
  },
  sheetPrimaryText: {
    color: colors.background,
    fontWeight: '700',
  },
});

const SLOT_INTERVAL_MINUTES = 30;
const OPEN_MINUTES = 8 * 60;
const CLOSE_MINUTES = 23 * 60;
const BAKU_UTC_OFFSET = '+04:00';

function buildDateOptions(timezone: string, days = 14) {
  const results: { value: string; label: string }[] = [];
  const base = new Date();
  for (let i = 0; i < days; i += 1) {
    const date = new Date(base);
    date.setDate(base.getDate() + i);
    const value = getDateString(date, timezone);
    let label: string;
    if (i === 0) label = 'Today';
    else if (i === 1) label = 'Tomorrow';
    else {
      label = new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(date);
    }
    results.push({ value, label });
  }
  return results;
}

function buildTimeOptions(dateStr: string, timezone: string) {
  const startMinutes = OPEN_MINUTES;
  const options: string[] = [];
  for (let mins = startMinutes; mins <= CLOSE_MINUTES; mins += SLOT_INTERVAL_MINUTES) {
    options.push(minutesToTime(mins));
  }
  return options;
}

function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function buildBakuDateFromTimeString(time: string) {
  return new Date(`2000-01-01T${time}:00${BAKU_UTC_OFFSET}`);
}

function formatChipTime(time: string, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(buildBakuDateFromTimeString(time));
}

function formatDateCompact(date: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}
