import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

import { fetchRestaurant, fetchFeatureFlags, RestaurantDetail, FeatureFlags, fetchAvailability, type RestaurantSummary, type AvailabilitySlot } from '../api';
import PhotoCarousel from '../components/PhotoCarousel';
import { colors, radius, spacing } from '../config/theme';
import { resolveRestaurantPhotos } from '../utils/photoSources';
import { formatLocation } from '../utils/restaurantMeta';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { Feather } from '@expo/vector-icons';
import { trackAvailabilitySignal } from '../utils/analytics';
import { useRestaurantDirectory } from '../contexts/RestaurantDirectoryContext';
import { DEFAULT_TIMEZONE, formatDateLabel, formatTimeLabel, getDateString, getTimeString } from '../utils/availability';
import { parseDateInput } from '../utils/dateInput';

type Props = NativeStackScreenProps<RootStackParamList, 'Restaurant'>;
type ActionItem = { key: string; label: string; onPress: () => void };

const FALLBACK_PHONE = '+994 (12) 555 2025';

const buildMockDetail = (summary: RestaurantSummary): RestaurantDetail => {
  const instagramHandle = summary.slug ? `https://instagram.com/${summary.slug}` : null;
  const menuUrl = summary.slug ? `https://bakureserve.com/menus/${summary.slug}` : null;
  return {
    ...summary,
    city: summary.city ?? 'Baku',
    cuisine: summary.cuisine ?? [],
    timezone: summary.timezone ?? 'Asia/Baku',
    phone: FALLBACK_PHONE,
    whatsapp: null,
    instagram: instagramHandle,
    menu_url: menuUrl,
    photos: summary.cover_photo ? [summary.cover_photo] : [],
    cover_photo: summary.cover_photo,
    areas: [],
    address: summary.address,
    tags: summary.tags,
    neighborhood: summary.neighborhood,
    short_description: summary.short_description,
  };
};

export default function RestaurantScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { id } = route.params;
  const [data, setData] = useState<RestaurantDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [features, setFeatures] = useState<FeatureFlags | null>(null);
  const [availabilitySignal, setAvailabilitySignal] = useState<{ ratio: number; slotStart: string } | null>(null);
  const availabilityTracked = useRef<string | null>(null);
  const { restaurants } = useRestaurantDirectory();
  const fallbackSummary = useMemo(() => restaurants.find((restaurant) => restaurant.id === id), [restaurants, id]);
  const fallbackRef = useRef<RestaurantSummary | null>(null);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const timezone = data?.timezone || DEFAULT_TIMEZONE;
  const [dateStr, setDateStr] = useState<string>(() => getDateString(new Date(), timezone));
  const [partySize, setPartySize] = useState<number>(2);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [pendingDateStr, setPendingDateStr] = useState<string>(dateStr);
  const [pendingParty, setPendingParty] = useState<number>(partySize);
  const [pendingTime, setPendingTime] = useState<string | null>(null);

  useEffect(() => {
    setTagsExpanded(false);
  }, [id]);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    fallbackRef.current = fallbackSummary ?? null;
    if (!fallbackSummary) {
      return;
    }
    setData((current) => current ?? buildMockDetail(fallbackSummary));
    navigation.setOptions({ title: fallbackSummary.name || 'Restaurant' });
    setLoading((current) => (current ? false : current));
  }, [fallbackSummary, navigation]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const [r, f] = await Promise.all([
          fetchRestaurant(id),
          fetchFeatureFlags().catch(() => null),
        ]);
        if (!mounted) return;
        setData(r);
        setFeatures(f);
        navigation.setOptions({ title: r.name || 'Restaurant' });
      } catch (err: any) {
        if (!mounted) return;
        const fallback = fallbackRef.current;
        if (fallback) {
          setData((current) => current ?? buildMockDetail(fallback));
          navigation.setOptions({ title: fallback.name || 'Restaurant' });
        }
        Alert.alert('Could not load', err.message || 'Restaurant unavailable');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id, navigation]);

  useEffect(() => {
    const today = getDateString(new Date(), timezone);
    setDateStr((prev) => {
      if (!prev) return today;
      const parsed = parseDateInput(prev);
      if (!parsed) return today;
      const todayTz = getDateString(new Date(), timezone);
      if (prev === todayTz) return todayTz;
      return prev;
    });
    setPendingDateStr(today);
  }, [timezone]);

  const photoBundle = useMemo(() => (data ? resolveRestaurantPhotos(data) : null), [data]);
  const isPendingPhotos = Boolean(photoBundle?.pending);

  const formattedTags = useMemo(() => {
    const rawTags = Array.isArray(data?.tags) ? data?.tags : [];
    const unique = Array.from(new Set(rawTags));
    return unique.map((tag) => formatTag(tag));
  }, [data?.tags]);

  const cuisineLine = useMemo(() => {
    const directCuisine = data?.cuisine?.length ? data.cuisine : [];
    const groupedCuisine = (data?.tag_groups as any)?.cuisine ?? [];
    const merged = directCuisine.length ? directCuisine : groupedCuisine;
    return Array.isArray(merged) ? merged.map(formatTag).join(' • ') : '';
  }, [data?.cuisine, data?.tag_groups]);

  const totalTables = useMemo(() => {
    if (!data?.areas) return 0;
    return data.areas.reduce((acc, area) => acc + (area.tables?.length ?? 0), 0);
  }, [data?.areas]);

  const loadAvailability = useCallback(
    async (targetDate?: string, targetPartySize?: number) => {
      if (!data) return;
      const normalizedDate = (targetDate ?? dateStr)?.trim();
      const normalizedParty = targetPartySize ?? partySize;
      if (!normalizedDate) return;
      setLoadingSlots(true);
      setSlotsError(null);
      try {
        const response = await fetchAvailability(data.id, normalizedDate, normalizedParty);
        setSlots(response.slots ?? []);
      } catch (err: any) {
        setSlots([]);
        setSlotsError(err?.message || 'Failed to load availability');
      } finally {
        setLoadingSlots(false);
      }
    },
    [data, dateStr, partySize],
  );

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  const timeOptions = useMemo(() => buildTimeOptions(dateStr, timezone), [dateStr, timezone]);
  const plannerTimeOptions = useMemo(() => buildTimeOptions(pendingDateStr, timezone), [pendingDateStr, timezone]);
  const plannerDateOptions = useMemo(() => buildDateOptions(timezone, 14), [timezone]);

  const slotByTime = useMemo(() => {
    const map = new Map<string, AvailabilitySlot>();
    slots.forEach((slot) => {
      const time = getTimeString(new Date(slot.start), timezone);
      map.set(time, slot);
    });
    return map;
  }, [slots, timezone]);

  const displayedTimes = useMemo(
    () => mergeTimes(timeOptions, slots, timezone),
    [slots, timeOptions, timezone],
  );

  useEffect(() => {
    if (!slots.length) {
      setSelectedTime(null);
      return;
    }
    const firstAvailable = displayedTimes.find((time) => slotByTime.has(time));
    if (firstAvailable && !selectedTime) {
      setSelectedTime(firstAvailable);
    }
  }, [slots, displayedTimes, slotByTime, selectedTime]);

  useEffect(() => {
    setSelectedTime(null);
  }, [dateStr, partySize, data?.id]);

  const selectedSlot = selectedTime ? slotByTime.get(selectedTime) ?? null : null;

  const openPlanner = useCallback(() => {
    setPendingParty(partySize);
    setPendingDateStr(dateStr);
    setPendingTime(selectedTime);
    setPlannerOpen(true);
  }, [dateStr, partySize, selectedTime]);

  const closePlanner = useCallback(() => {
    setPlannerOpen(false);
  }, []);

  const handleTimeSelect = useCallback((time: string) => {
    setPendingTime(time);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const handlePartySelect = useCallback((size: number) => {
    setPendingParty(size);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const handleDateSelect = useCallback((value: string) => {
    setPendingDateStr(value);
    const parsed = parseDateInput(value);
    if (parsed) setPendingDate(parsed);
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const applyPlanner = useCallback(() => {
    setPartySize(pendingParty);
    setDateStr(pendingDateStr);
    setSelectedTime(pendingTime);
    setPlannerOpen(false);
    void loadAvailability(pendingDateStr, pendingParty);
  }, [pendingParty, pendingDateStr, pendingTime, loadAvailability]);

  const handleRefreshSlots = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    void loadAvailability();
  }, [loadAvailability]);

  useEffect(() => {
    if (!data || totalTables === 0) {
      setAvailabilitySignal(null);
      return;
    }
    const flagEnabled = Boolean(features?.availabilitySignals ?? features?.ui?.availabilitySignals);
    if (!flagEnabled) {
      setAvailabilitySignal(null);
      return;
    }
    let cancelled = false;
    const dateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: data.timezone || 'Asia/Baku',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const dateStr = dateFormatter.format(new Date());
    fetchAvailability(data.id, dateStr, 2)
      .then((response) => {
        if (cancelled) return;
        const now = Date.now();
        const slot = response.slots.find((entry) => new Date(entry.start).getTime() >= now) || response.slots[0];
        if (!slot || !slot.count) {
          setAvailabilitySignal(null);
          return;
        }
        const ratio = slot.count / totalTables;
        if (ratio > 0 && ratio <= 0.2) {
          setAvailabilitySignal({ ratio, slotStart: slot.start });
          if (availabilityTracked.current !== slot.start) {
            trackAvailabilitySignal('restaurant_detail', ratio, slot.start, features);
            availabilityTracked.current = slot.start;
          }
        } else {
          setAvailabilitySignal(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvailabilitySignal(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [data, features, totalTables]);

  const handleBook = () => {
    if (!data) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigation.navigate('Book', {
      id: data.id,
      name: data.name,
      preselectedDate: dateStr,
      preselectedTime: selectedTime ?? undefined,
      partySize,
    });
  };

  const handleShare = () => {
    if (!data) return;
    Share.share({
      title: data.name,
      message: `Let's meet at ${data.name}! Tap to view availability: ${data.address ?? 'No address on file.'}`,
    });
  };

  const handleCall = () => {
    if (!data?.phone) {
      Alert.alert('No phone available', 'This restaurant does not have a phone number listed.');
      return;
    }
    Linking.openURL(`tel:${data.phone.replace(/\s+/g, '')}`);
  };

  const handleWhatsapp = () => {
    const raw = data?.whatsapp?.replace(/\D+/g, '');
    if (!raw) {
      Alert.alert('No WhatsApp number', 'This venue has not shared a WhatsApp contact yet.');
      return;
    }
    const url = `https://wa.me/${raw}`;
    Linking.openURL(url).catch(() => Alert.alert('Unable to open WhatsApp'));
  };

  const handleInstagram = () => {
    if (!data?.instagram) {
      Alert.alert('Instagram unavailable', 'This venue has not shared an Instagram profile yet.');
      return;
    }
    const target = ensureHttpsUrl(data.instagram);
    Linking.openURL(target).catch(() => Alert.alert('Unable to open Instagram link.'));
  };

  const handleMenu = async () => {
    const menuUrl = data?.menu_url?.trim();
    if (!menuUrl) {
      Alert.alert('Menu unavailable', 'This venue has not published its menu yet.');
      return;
    }
    const target = ensureHttpsUrl(menuUrl);
    try {
      await WebBrowser.openBrowserAsync(target);
    } catch (err) {
      try {
        await Linking.openURL(target);
      } catch {
        Alert.alert('Unable to open menu link.');
      }
    }
  };

  const handleGoBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation]);

  const handleDirections = () => {
    if (data?.latitude && data?.longitude) {
      const { latitude, longitude } = data;
      const encodedLabel = encodeURIComponent(data.name);
      const url = Platform.select({
        ios: `maps://?q=${encodedLabel}&ll=${latitude},${longitude}`,
        android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodedLabel})`,
        default: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
      });
      Linking.openURL(url ?? '').catch(() => Alert.alert('Unable to open maps.'));
      return;
    }
    if (data?.address) {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.address)}`;
      Linking.openURL(url).catch(() => Alert.alert('Unable to open maps.'));
      return;
    }
    Alert.alert('No address provided', 'This venue has not shared a map location yet.');
  };

  function ensureHttpsUrl(raw: string) {
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('@')) {
      return `https://instagram.com/${raw.slice(1)}`;
    }
    // Handle plain handles without scheme or domain
    if (/^[A-Za-z0-9_.]+$/.test(raw)) {
      return `https://instagram.com/${raw}`;
    }
    return `https://${raw.replace(/^\/+/, '')}`;
  }

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primaryStrong} />
        <Text style={styles.loadingText}>Fetching restaurant details…</Text>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorTitle}>Restaurant unavailable</Text>
        <Text style={styles.errorSubtitle}>Double-check the link and try again.</Text>
      </SafeAreaView>
    );
  }

  const photoSet =
    !isPendingPhotos && photoBundle?.gallery?.length
      ? photoBundle.gallery
      : !isPendingPhotos && photoBundle?.cover
        ? [photoBundle.cover]
        : [];

  const parsedDate = parseDateInput(dateStr) ?? new Date();
  const selectedTimeLabel = selectedSlot
    ? formatTimeLabel(new Date(selectedSlot.start), timezone)
    : selectedTime
      ? formatTimeLabel(buildBakuDateFromTimeString(selectedTime), timezone)
      : 'Pick a time';

  const quickActionItems = [
    (data.latitude && data.longitude) || data.address
      ? { key: 'directions', label: 'Directions', onPress: handleDirections }
      : null,
    data.phone ? { key: 'call', label: 'Call', onPress: handleCall } : null,
    data.whatsapp ? { key: 'whatsapp', label: 'WhatsApp', onPress: handleWhatsapp } : null,
    data.instagram ? { key: 'instagram', label: 'Instagram', onPress: handleInstagram } : null,
  ].filter(Boolean) as ActionItem[];

  const secondaryActionItems = [
    { key: 'share', label: 'Share', onPress: handleShare },
    data.menu_url ? { key: 'menu', label: 'Menu', onPress: handleMenu } : null,
  ].filter(Boolean) as ActionItem[];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.mediaWrapper, { marginTop: -insets.top }]}>
          {isPendingPhotos ? (
            <View style={styles.pendingPhotos}>
              <Text style={styles.pendingTitle}>Photos coming soon</Text>
              <Text style={styles.pendingSubtitle}>
                We’re waiting on final imagery from this venue. Check back shortly.
              </Text>
            </View>
          ) : photoSet.length ? (
            <PhotoCarousel photos={photoSet} height={320} edgeToEdge />
          ) : (
            <View style={styles.mediaFallback}>
              <Feather name="image" size={24} color={colors.muted} />
              <Text style={styles.pendingSubtitle}>Photos coming soon</Text>
            </View>
          )}
          <View style={[styles.mediaTopBar, { top: insets.top + spacing.sm }]}>
            <Pressable style={styles.mediaIconButton} onPress={handleGoBack} accessibilityRole="button">
              <Feather name="arrow-left" size={18} color="#0f172a" />
            </Pressable>
            <Pressable style={styles.mediaIconButton} onPress={handleShare} accessibilityRole="button">
              <Feather name="share-2" size={18} color="#0f172a" />
            </Pressable>
          </View>
          <LinearGradient
            colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.6)']}
            style={styles.mediaGradient}
            pointerEvents="none"
          />
          <View style={styles.mediaHeader}>
            <Text style={styles.mediaTitle}>{data.name}</Text>
            {availabilitySignal ? (
              <View style={styles.scarcityBadge}>
                <Feather name="clock" size={12} color={colors.primaryStrong} />
                <Text style={styles.scarcityText}>Almost full</Text>
              </View>
            ) : null}
            {cuisineLine ? <Text style={styles.mediaSubtitle}>{cuisineLine}</Text> : null}
            <View style={styles.mediaMetaRow}>
              {data.neighborhood ? <Text style={styles.mediaMeta}>{formatLocation(data.neighborhood)}</Text> : null}
              {data.price_level ? <Text style={styles.mediaMeta}>• {data.price_level}</Text> : null}
              {data.average_spend ? <Text style={styles.mediaMeta}>• {data.average_spend}</Text> : null}
            </View>
          </View>
        </View>

        <View style={styles.sectionPlain} testID="restaurant-availability-card">
          <Pressable style={styles.plannerPill} onPress={openPlanner} accessibilityRole="button">
            <View style={styles.plannerSummaryRow}>
              <View style={styles.summaryItem}>
                <Feather name="user" size={16} color={colors.primaryStrong} />
                <Text style={styles.summaryText}>{partySize}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Feather name="calendar" size={16} color={colors.primaryStrong} />
                <Text style={styles.summaryText}>{formatDateCompact(parsedDate, timezone)}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Feather name="clock" size={16} color={colors.primaryStrong} />
                <Text style={styles.summaryText}>{selectedTimeLabel}</Text>
              </View>
            </View>
            <Feather name="chevron-down" size={16} color={colors.primaryStrong} />
          </Pressable>

          <View style={styles.availabilityHeader}>
            <View style={styles.availabilityTitles}>
              <Text style={styles.sectionLabel}>Availability</Text>
              <Text style={styles.availabilityTitle}>Scroll to pick a time</Text>
            </View>
            <Pressable style={styles.refreshButton} onPress={handleRefreshSlots} accessibilityRole="button">
              <Feather name="refresh-ccw" size={16} color={colors.primaryStrong} />
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.slotScroller}
            contentContainerStyle={[styles.slotRow, styles.slotRowWide]}
          >
            {displayedTimes.map((time) => {
              const slot = slotByTime.get(time);
              const selected = selectedTime === time;
              const label = formatChipTime(time, timezone);
              return (
                <Pressable
                  key={time}
                  style={[styles.timeChip, selected && styles.timeChipActive, !slot && styles.timeChipGhost]}
                  onPress={() => handleTimeSelect(time)}
                  disabled={loadingSlots}
                  accessibilityRole="button"
                >
                  <Text style={[styles.timeChipText, selected && styles.timeChipTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
            {loadingSlots && !displayedTimes.length ? (
              <View style={styles.slotSkeleton}>
                <ActivityIndicator color={colors.primaryStrong} />
              </View>
            ) : null}
          </ScrollView>

          {slotsError ? <Text style={styles.errorText}>{slotsError}</Text> : null}
          {!loadingSlots && !slots.length ? (
            <Text style={styles.mutedText}>No tables for this day yet. Try another date or adjust party size.</Text>
          ) : null}

          <View style={styles.selectionRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.selectionLabel}>Selected</Text>
              <Text style={styles.selectionValue}>{selectedTimeLabel}</Text>
            </View>
            <Pressable
              style={[styles.primaryAction, (!selectedTime || loadingSlots) && styles.primaryActionDisabled]}
              onPress={handleBook}
              disabled={!selectedTime || loadingSlots}
              accessibilityRole="button"
            >
              <Text style={styles.primaryActionText}>Book</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionPlain}>
          <Text style={styles.sectionLabel}>Details</Text>
          {data.short_description ? <Text style={styles.heroDescription}>{data.short_description}</Text> : null}

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Address</Text>
            <View style={styles.infoValueRow}>
              <Text style={styles.infoValue}>{data.address ?? 'Location coming soon'}</Text>
              { (data.latitude && data.longitude) || data.address ? (
                <Pressable onPress={handleDirections} style={styles.infoIconButton} accessibilityRole="button">
                  <Feather name="map-pin" size={18} color={colors.primaryStrong} />
                </Pressable>
              ) : null }
            </View>
          </View>

          {data.instagram ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Instagram</Text>
              <View style={styles.infoValueRow}>
                <Text style={styles.infoValue}>{formatInstagramHandle(data.instagram)}</Text>
                <Pressable onPress={handleInstagram} style={styles.infoIconButton} accessibilityRole="button">
                  <Feather name="instagram" size={18} color={colors.primaryStrong} />
                </Pressable>
              </View>
            </View>
          ) : null}

          {data.menu_url ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Menu</Text>
              <View style={styles.infoValueRow}>
                <Text style={styles.infoValue}>View menu</Text>
                <Pressable onPress={handleMenu} style={styles.infoIconButton} accessibilityRole="button">
                  <Feather name="external-link" size={18} color={colors.primaryStrong} />
                </Pressable>
              </View>
            </View>
          ) : null}

          {data.phone ? (
            <View style={styles.infoRowLast}>
              <Text style={styles.infoLabel}>Call</Text>
              <View style={styles.infoValueRow}>
                <Text style={styles.infoValue}>{data.phone}</Text>
                <Pressable onPress={handleCall} style={styles.infoIconButton} accessibilityRole="button">
                  <Feather name="phone" size={18} color={colors.primaryStrong} />
                </Pressable>
              </View>
            </View>
          ) : null}

          {formattedTags.length ? (
            <View style={[styles.tagToggleContainer, styles.infoRowLast]}>
              <Pressable
                style={styles.tagToggleButton}
                onPress={() => setTagsExpanded((prev) => !prev)}
                accessibilityRole="button"
              >
                <Text style={styles.tagToggleText}>
                  {tagsExpanded ? 'Hide tags' : `Show ${formattedTags.length} tags`}
                </Text>
                <Feather
                  name={tagsExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.primaryStrong}
                />
              </Pressable>
              {tagsExpanded ? (
                <View style={styles.heroTagRow}>
                  {formattedTags.map((tag) => (
                    <Text key={tag} style={styles.heroTag}>
                      {tag}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <Modal transparent visible={plannerOpen} animationType="slide" onRequestClose={closePlanner}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closePlanner} />
          <View style={[styles.sheetCard, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Plan your table</Text>
              <Pressable onPress={closePlanner} accessibilityRole="button">
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
                    onPress={() => handlePartySelect(size)}
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
                  {plannerDateOptions.map((opt) => {
                    const selected = opt.value === pendingDateStr;
                    return (
                      <Pressable
                        key={opt.value}
                        style={[styles.listRow, selected && styles.listRowActive]}
                        onPress={() => handleDateSelect(opt.value)}
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
                  {plannerTimeOptions.map((time) => {
                    const selected = time === pendingTime;
                    return (
                      <Pressable
                        key={time}
                        style={[styles.listRow, selected && styles.listRowActive]}
                        onPress={() => handleTimeSelect(time)}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.listRowText, selected && styles.listRowTextActive]}>{formatChipTime(time, timezone)}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>

            <Pressable style={styles.sheetPrimary} onPress={applyPlanner} accessibilityRole="button">
              <Text style={styles.sheetPrimaryText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.muted,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  errorSubtitle: {
    color: colors.muted,
  },
  scrollContent: {
    paddingHorizontal: 0,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  mediaWrapper: {
    position: 'relative',
    marginHorizontal: 0,
    backgroundColor: colors.surface,
  },
  mediaTopBar: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  mediaIconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  mediaGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 220,
  },
  mediaHeader: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.lg,
    gap: spacing.xs,
  },
  mediaTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  mediaSubtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
  mediaMetaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  mediaMeta: {
    color: 'rgba(255,255,255,0.86)',
    fontWeight: '500',
  },
  pendingPhotos: {
    height: 320,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  pendingTitle: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.primaryStrong,
    textAlign: 'center',
  },
  pendingSubtitle: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
  },
  mediaFallback: {
    height: 320,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  scarcityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
    gap: 4,
    borderWidth: 1,
    borderColor: `${colors.primaryStrong}33`,
  },
  scarcityText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryStrong,
    textTransform: 'uppercase',
  },
  sectionPlain: {
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  plannerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: '70%',
    maxWidth: 520,
  },
  plannerSummaryRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  summaryText: {
    color: colors.text,
    fontWeight: '700',
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -4 },
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  sheetLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 11,
    color: colors.muted,
    fontWeight: '700',
  },
  sheetRail: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  railChip: {
    minWidth: 40,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railChipActive: {
    backgroundColor: colors.primaryStrong,
    borderColor: colors.primaryStrong,
  },
  railChipText: {
    fontWeight: '700',
    color: colors.text,
  },
  railChipTextActive: {
    color: '#fff',
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  sheetColumnContent: {
    paddingVertical: spacing.xs,
  },
  listRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  listRowActive: {
    backgroundColor: colors.primary,
  },
  listRowText: {
    color: colors.text,
    fontWeight: '600',
  },
  listRowTextActive: {
    color: colors.royalDeep,
    fontWeight: '800',
  },
  sheetPrimary: {
    backgroundColor: colors.primaryStrong,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  sheetPrimaryText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  availabilityCard: {
    gap: spacing.sm,
  },
  availabilityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  availabilityTitles: {
    gap: 2,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.muted,
    fontWeight: '700',
    fontSize: 12,
  },
  availabilityTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  refreshButton: {
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.overlay,
  },
  slotRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  slotRowWide: {
    paddingHorizontal: spacing.md,
  },
  slotScroller: {
    marginHorizontal: -spacing.md,
  },
  timeChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.overlay,
    minWidth: 86,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  timeChipActive: {
    backgroundColor: colors.primaryStrong,
    borderColor: colors.primaryStrong,
  },
  timeChipGhost: {
    opacity: 0.72,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  timeChipText: {
    fontWeight: '700',
    color: colors.text,
  },
  timeChipTextActive: {
    color: '#fff',
  },
  slotSkeleton: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontWeight: '600',
  },
  mutedText: {
    color: colors.muted,
    fontWeight: '500',
  },
  selectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  selectionLabel: {
    color: colors.muted,
    fontWeight: '600',
  },
  selectionValue: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
  },
  primaryAction: {
    backgroundColor: colors.primaryStrong,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  primaryActionDisabled: {
    opacity: 0.6,
  },
  primaryActionText: {
    color: '#fff',
    fontWeight: '700',
  },
  infoCard: {
    gap: spacing.sm,
  },
  heroDescription: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  heroMetaRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  heroMeta: {
    color: colors.muted,
  },
  heroMetaDivider: {
    marginLeft: spacing.xs,
  },
  infoRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  infoRowLast: {
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  infoLabel: {
    color: colors.muted,
    fontWeight: '600',
    flexShrink: 0,
  },
  infoValueRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  infoValue: {
    color: colors.text,
    textAlign: 'right',
    flexShrink: 1,
  },
  infoIconButton: {
    padding: spacing.xs,
  },
  tagToggleContainer: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  tagToggleButton: {
    alignSelf: 'flex-start',
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
  tagToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primaryStrong,
  },
  heroTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  heroTag: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.primaryStrong,
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.lg,
  },
  quickActions: {
    display: 'none',
  },
  quickAction: {
    display: 'none',
  },
  quickActionText: {
    display: 'none',
  },
  secondaryActions: {
    display: 'none',
  },
  secondaryAction: {
    display: 'none',
  },
  secondaryActionText: {
    display: 'none',
  },
  modalPicker: {
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    marginTop: spacing.sm,
  },
});

const SLOT_INTERVAL_MINUTES = 30;
const OPEN_MINUTES = 6 * 60; // 06:00 opening window
const CLOSE_MINUTES = 23 * 60 + 30; // 23:30 closing window
const DEFAULT_FUTURE_START_MINUTES = OPEN_MINUTES;
const BAKU_UTC_OFFSET = '+04:00'; // Azerbaijan has no DST; keep slots anchored here

function buildDateOptions(timezone: string, days = 10) {
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
  const now = new Date();
  const todayKey = getDateString(now, timezone);
  const isToday = dateStr === todayKey;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');

  const currentMinutes = hour * 60 + minute;
  const nextHalfHour = Math.ceil((currentMinutes + 1) / SLOT_INTERVAL_MINUTES) * SLOT_INTERVAL_MINUTES;
  const startMinutes = isToday ? Math.max(nextHalfHour, OPEN_MINUTES) : DEFAULT_FUTURE_START_MINUTES;

  const first = Math.min(Math.max(startMinutes, OPEN_MINUTES), CLOSE_MINUTES);
  const options: string[] = [];
  for (let mins = first; mins <= CLOSE_MINUTES; mins += SLOT_INTERVAL_MINUTES) {
    options.push(minutesToTime(mins));
  }
  return options;
}

function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function mergeTimes(base: string[], slots: AvailabilitySlot[], timezone: string) {
  const times = new Set(base);
  slots.forEach((slot) => {
    times.add(getTimeString(new Date(slot.start), timezone));
  });
  return Array.from(times).sort((a, b) => timeStringToMinutes(a) - timeStringToMinutes(b));
}

function timeStringToMinutes(value: string) {
  const [hourStr, minuteStr] = value.split(':');
  return (Number(hourStr) || 0) * 60 + (Number(minuteStr) || 0);
}

function buildBakuDateFromTimeString(time: string) {
  return new Date(`2000-01-01T${time}:00${BAKU_UTC_OFFSET}`);
}

function formatChipTime(time: string, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
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

function formatTag(tag: string) {
  return tag
    .split(/[_\\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatInstagramHandle(url: string) {
  try {
    const handle = url.replace(/https?:\/\/www\.instagram\.com\//i, '').replace(/https?:\/\/instagram\.com\//i, '').replace(/\/$/, '');
    return handle.startsWith('@') ? handle : `@${handle}`;
  } catch {
    return url;
  }
}
