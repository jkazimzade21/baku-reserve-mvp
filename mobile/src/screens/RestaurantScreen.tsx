import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';

import { fetchRestaurant, fetchFeatureFlags, RestaurantDetail, FeatureFlags, fetchAvailability, type RestaurantSummary } from '../api';
import PhotoCarousel from '../components/PhotoCarousel';
import Surface from '../components/Surface';
import { colors, radius, shadow, spacing } from '../config/theme';
import { resolveRestaurantPhotos } from '../utils/photoSources';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { Feather } from '@expo/vector-icons';
import { trackAvailabilitySignal } from '../utils/analytics';
import { useRestaurantDirectory } from '../contexts/RestaurantDirectoryContext';

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

  useEffect(() => {
    setTagsExpanded(false);
  }, [id]);

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
    navigation.navigate('Book', { id: data.id, name: data.name });
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
    Linking.openURL(data.instagram).catch(() => Alert.alert('Unable to open Instagram link.'));
  };

  const handleMenu = async () => {
    const menuUrl = data?.menu_url?.trim();
    if (!menuUrl) {
      Alert.alert('Menu unavailable', 'This venue has not published its menu yet.');
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(menuUrl);
    } catch (err) {
      try {
        await Linking.openURL(menuUrl);
      } catch {
        Alert.alert('Unable to open menu link.');
      }
    }
  };

  const handleDirections = () => {
    if (data?.latitude && data?.longitude) {
      const { latitude, longitude } = data;
      const encodedLabel = encodeURIComponent(data.name);
      const url = Platform.select({
        ios: `maps://?q=${encodedLabel}&ll=${latitude},${longitude}`,
        android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodedLabel})`,
        default: `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`,
      });
      Linking.openURL(url ?? '').catch(() => Alert.alert('Unable to open maps.'));
      return;
    }
    if (data?.address) {
      const url = `https://www.openstreetmap.org/search?query=${encodeURIComponent(data.address)}`;
      Linking.openURL(url).catch(() => Alert.alert('Unable to open maps.'));
      return;
    }
    Alert.alert('No address provided', 'This venue has not shared a map location yet.');
  };

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
        <Surface tone="overlay" padding="none" style={styles.heroCard} testID="restaurant-hero-card">
          {isPendingPhotos ? (
            <View style={styles.pendingPhotos}>
              <Text style={styles.pendingTitle}>Photos coming soon</Text>
              <Text style={styles.pendingSubtitle}>
                We’re waiting on final imagery from this venue. Check back shortly.
              </Text>
            </View>
          ) : (
            <PhotoCarousel photos={photoSet} />
          )}
          <View style={styles.heroBody}>
            <Text style={styles.heroTitle}>{data.name}</Text>

          {availabilitySignal && (
            <View style={styles.scarcityBadge}>
              <Feather name="clock" size={12} color={colors.primaryStrong} />
              <Text style={styles.scarcityText}>Almost full</Text>
            </View>
          )}

          {cuisineLine ? <Text style={styles.heroSubtitle}>{cuisineLine}</Text> : null}
            {data.short_description ? (
              <Text style={styles.heroDescription}>{data.short_description}</Text>
            ) : null}
            <View style={styles.heroMetaRow}>
              {data.neighborhood ? <Text style={styles.heroMeta}>{data.neighborhood}</Text> : null}
              {data.price_level ? (
                <Text style={[styles.heroMeta, styles.heroMetaDivider]}>• {data.price_level}</Text>
              ) : null}
              {data.average_spend ? (
                <Text style={[styles.heroMeta, styles.heroMetaDivider]}>• {data.average_spend}</Text>
              ) : null}
            </View>
            {data.address ? <Text style={styles.heroMeta}>{data.address}</Text> : null}
            {formattedTags.length ? (
              <View style={styles.tagToggleContainer}>
                <Pressable
                  style={styles.tagToggleButton}
                  onPress={() => setTagsExpanded((prev) => !prev)}
                  accessibilityRole="button"
                >
                  <Text style={styles.tagToggleText}>
                    {tagsExpanded ? 'Hide details' : `Show ${formattedTags.length} tags`}
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
          <View style={styles.heroActions}>
            <Pressable
              style={styles.primaryAction}
              onPress={handleBook}
              testID="restaurant-see-availability"
              accessibilityRole="button"
            >
              <Text style={styles.primaryActionText}>See availability</Text>
            </Pressable>
            {quickActionItems.length ? (
              <View style={styles.quickActions}>
                {quickActionItems.map((action) => (
                  <Pressable key={action.key} style={styles.quickAction} onPress={action.onPress}>
                    <Text style={styles.quickActionText}>{action.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {secondaryActionItems.length ? (
              <View style={styles.secondaryActions}>
                {secondaryActionItems.map((action) => (
                  <Pressable key={action.key} style={styles.secondaryAction} onPress={action.onPress}>
                    <Text style={styles.secondaryActionText}>{action.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </Surface>
      </ScrollView>
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
    padding: spacing.lg,
    gap: spacing.lg,
  },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.card,
  },
  pendingPhotos: {
    height: 240,
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
  heroBody: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  scarcityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
    gap: 4,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: `${colors.primaryStrong}33`,
  },
  scarcityText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryStrong,
    textTransform: 'uppercase',
  },
  heroSubtitle: {
    color: colors.muted,
    fontWeight: '500',
    marginTop: spacing.xs,
  },
  heroDescription: {
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  heroMetaRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  heroMeta: {
    color: colors.muted,
    marginTop: spacing.xs,
  },
  heroMetaDivider: {
    marginTop: spacing.xs,
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
  heroActions: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  primaryAction: {
    backgroundColor: colors.primaryStrong,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#fff',
    fontWeight: '700',
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickAction: {
    flexGrow: 1,
    minWidth: 120,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.overlay,
    alignItems: 'center',
  },
  quickActionText: {
    color: colors.primaryStrong,
    fontWeight: '600',
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryAction: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryActionText: {
    color: colors.primaryStrong,
    fontWeight: '500',
  },
});

function formatTag(tag: string) {
  return tag
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
