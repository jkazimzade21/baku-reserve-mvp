import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import {
  cancelReservation,
  fetchReservationsList,
  markArrived,
  markNoShow,
  submitReview,
  type Reservation,
} from '../api';
import { colors, radius, spacing, shadow } from '../config/theme';
import Surface from '../components/Surface';
import SectionHeading from '../components/SectionHeading';
import { useAuth } from '../contexts/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { useRestaurantDirectory } from '../contexts/RestaurantDirectoryContext';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList, RootStackParamList } from '../types/navigation';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Reservations'>,
  NativeStackScreenProps<RootStackParamList>
>;

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

export default function ReservationsScreen({ navigation }: Props) {
  const { restaurants } = useRestaurantDirectory();
  const { isAuthenticated } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<Reservation | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [reviewSubmitting, setReviewSubmitting] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { refreshing?: boolean }) => {
    try {
      if (opts?.refreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const data = await fetchReservationsList();
      setReservations(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load reservations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleCancel = useCallback(
    async (reservationId: string) => {
      try {
        await cancelReservation(reservationId);
        await load();
      } catch (err: any) {
        setError(err?.message || 'Unable to cancel reservation');
      }
    },
    [load],
  );

  const handleMarkArrived = useCallback(
    async (reservationId: string) => {
      try {
        await markArrived(reservationId);
        await load();
      } catch (err: any) {
        setError(err?.message || 'Unable to update reservation');
      }
    },
    [load],
  );

  const handleMarkNoShow = useCallback(
    async (reservationId: string) => {
      try {
        await markNoShow(reservationId);
        await load();
      } catch (err: any) {
        setError(err?.message || 'Unable to update reservation');
      }
    },
    [load],
  );

  const restaurantLookup = useMemo(() => {
    const map = new Map<string, string>();
    restaurants.forEach((restaurant) => {
      map.set(restaurant.id, restaurant.name);
    });
    return map;
  }, [restaurants]);

  const openReviewModal = (reservation: Reservation) => {
    setReviewTarget(reservation);
    setReviewRating(5);
    setReviewComment('');
    setReviewError(null);
  };

  const closeReviewModal = () => {
    setReviewTarget(null);
    setReviewSubmitting(false);
    setReviewError(null);
  };

  const submitReviewNow = useCallback(async () => {
    if (!reviewTarget) return;
    setReviewSubmitting(true);
    setReviewError(null);
    try {
      await submitReview(reviewTarget.id, {
        rating: reviewRating,
        comment: reviewComment.trim() || undefined,
      });
      closeReviewModal();
      await load();
    } catch (err: any) {
      setReviewError(err?.message || 'Unable to submit review');
    } finally {
      setReviewSubmitting(false);
    }
  }, [reviewTarget, reviewRating, reviewComment, load]);

  useFocusEffect(
    useCallback(() => {
      void load();
      // No cleanup necessary; we simply reload whenever screen regains focus.
      return undefined;
    }, [load]),
  );

  const now = new Date();

  const upcoming = useMemo(
    () =>
      reservations
        .filter((reservation) => new Date(reservation.start) >= now)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [reservations, now],
  );
  const past = useMemo(
    () =>
      reservations
        .filter((reservation) => new Date(reservation.start) < now)
        .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()),
    [reservations, now],
  );

  const sections = useMemo(() => {
    const entries: Array<{ title: string; data: Reservation[] }> = [];
    if (upcoming.length) {
      entries.push({ title: 'Upcoming', data: upcoming });
    }
    if (past.length) {
      entries.push({ title: 'Past reservations', data: past });
    }
    return entries;
  }, [upcoming, past]);

  const renderReservationCard = ({ item }: { item: Reservation }) => {
    const restaurantName = restaurantLookup.get(item.restaurant_id) ?? 'Restaurant';
    const start = new Date(item.start);
    const end = new Date(item.end);
    const schedule = `${dayFormatter.format(start)} • ${timeFormatter.format(start)} – ${timeFormatter.format(end)}`;
    return (
      <Surface tone="overlay" padding="md" style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{restaurantName}</Text>
          <View style={styles.cardHeaderBadges}>
            <StatusPill status={item.status} />
          </View>
        </View>
        <Text style={styles.cardMeta}>{schedule}</Text>
        <Text style={styles.cardMeta}>Party of {item.party_size}</Text>
        {item.guest_name ? (
          <Text style={styles.cardGuest}>Booked under {item.guest_name}</Text>
        ) : null}
        <View style={styles.cardActions}>
          <Pressable
            style={[styles.cardButton, styles.cardButtonPrimary]}
            onPress={() =>
              navigation.navigate('Book', {
                id: item.restaurant_id,
                name: restaurantName,
                guestName: item.guest_name ?? undefined,
                guestPhone: item.guest_phone ?? undefined,
              })
            }
          >
            <Feather name="refresh-cw" size={14} color="#fff" />
            <Text style={styles.cardButtonPrimaryText}>Rebook</Text>
          </Pressable>
          <Pressable
            style={styles.cardButton}
            onPress={() => navigation.navigate('Restaurant', { id: item.restaurant_id, name: restaurantName })}
          >
            <Feather name="info" size={14} color={colors.primaryStrong} />
            <Text style={styles.cardButtonText}>Details</Text>
          </Pressable>
          {item.status === 'arrived' ? (
            <Pressable style={styles.cardButton} onPress={() => openReviewModal(item)}>
              <Feather name="star" size={14} color={colors.primaryStrong} />
              <Text style={styles.cardButtonText}>Leave review</Text>
            </Pressable>
          ) : null}
          {item.status === 'booked' && start > now ? (
            <Pressable style={styles.cardButton} onPress={() => handleCancel(item.id)}>
              <Feather name="x-circle" size={14} color={colors.primaryStrong} />
              <Text style={styles.cardButtonText}>Cancel</Text>
            </Pressable>
          ) : null}
          {item.status === 'booked' && start <= now ? (
            <Pressable style={styles.cardButton} onPress={() => handleMarkArrived(item.id)}>
              <Feather name="check-circle" size={14} color={colors.primaryStrong} />
              <Text style={styles.cardButtonText}>Mark arrived</Text>
            </Pressable>
          ) : null}
          {item.status === 'booked' && start < now ? (
            <Pressable style={styles.cardButton} onPress={() => handleMarkNoShow(item.id)}>
              <Feather name="slash" size={14} color={colors.primaryStrong} />
              <Text style={styles.cardButtonText}>No-show</Text>
            </Pressable>
          ) : null}
        </View>
      </Surface>
    );
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.authGate}>
          <Feather name="lock" size={32} color={colors.primaryStrong} />
          <Text style={styles.authGateTitle}>Sign in to manage reservations</Text>
          <Text style={styles.authGateSubtitle}>
            Browse restaurants anytime. To view or manage bookings, please sign in first.
          </Text>
          <Pressable style={styles.authGateButton} onPress={() => navigation.navigate('Auth')}>
            <Text style={styles.authGateButtonText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.primaryStrong} />
          <Text style={styles.loadingText}>Checking your tables…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderReservationCard}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load({ refreshing: true })}
            tintColor={colors.primaryStrong}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <SectionHeading
              title="Your reservations"
              subtitle="Manage upcoming tables and relive past nights out."
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="calendar" size={28} color={colors.muted} />
            <Text style={styles.emptyTitle}>Nothing booked yet</Text>
            <Text style={styles.emptySubtitle}>
              Reserve a table and it will appear here with live updates and reminders.
            </Text>
            <Pressable
              style={[styles.cardButton, styles.cardButtonPrimary]}
              onPress={() => navigation.navigate('Discover')}
            >
              <Feather name="search" size={14} color="#fff" />
              <Text style={styles.cardButtonPrimaryText}>Find restaurants</Text>
            </Pressable>
          </View>
        }
      />

      {reviewTarget ? (
        <Modal transparent visible animationType="fade" onRequestClose={closeReviewModal}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Rate your visit</Text>
                <Pressable onPress={closeReviewModal} style={styles.modalClose}>
                  <Feather name="x" size={18} color={colors.primaryStrong} />
                </Pressable>
              </View>
              <Text style={styles.modalSubtitle}>
                {restaurantLookup.get(reviewTarget.restaurant_id) ?? 'Restaurant'}
              </Text>
              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5].map((score) => (
                  <Pressable
                    key={score}
                    onPress={() => setReviewRating(score)}
                    style={[
                      styles.ratingStar,
                      reviewRating >= score && styles.ratingStarActive,
                    ]}
                  >
                    <Feather
                      name={reviewRating >= score ? 'star' : 'star'}
                      size={20}
                      color={reviewRating >= score ? '#f59e0b' : colors.muted}
                    />
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={styles.reviewInput}
                placeholder="What stood out? (optional)"
                value={reviewComment}
                onChangeText={setReviewComment}
                multiline
              />
              {reviewError ? <Text style={styles.errorText}>{reviewError}</Text> : null}
              <View style={styles.modalActions}>
                <Pressable style={styles.secondaryButton} onPress={closeReviewModal} disabled={reviewSubmitting}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.sendButton, reviewSubmitting && styles.sendButtonDisabled]}
                  onPress={submitReviewNow}
                  disabled={reviewSubmitting}
                >
                  <Text style={styles.sendButtonText}>{reviewSubmitting ? 'Sending…' : 'Submit'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

type StatusProps = {
  status: Reservation['status'];
};

function StatusPill({ status }: StatusProps) {
  const pretty = status.replace('_', ' ');
  const label = pretty.charAt(0).toUpperCase() + pretty.slice(1);
  const backgroundMap: Record<Reservation['status'], string> = {
    booked: 'rgba(34,197,94,0.12)',
    pending: 'rgba(234,179,8,0.16)',
    cancelled: 'rgba(239,68,68,0.12)',
    arrived: 'rgba(37,99,235,0.12)',
    no_show: 'rgba(107,114,128,0.16)',
  };
  const colorMap: Record<Reservation['status'], string> = {
    booked: '#16a34a',
    pending: '#b45309',
    cancelled: '#dc2626',
    arrived: '#2563eb',
    no_show: '#6b7280',
  };
  const background = backgroundMap[status] ?? colors.overlay;
  const color = colorMap[status] ?? colors.text;
  return (
    <View style={[styles.statusPill, { backgroundColor: background }]}>
      <Text style={[styles.statusText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  header: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  card: {
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
  cardGuest: {
    color: colors.muted,
    fontSize: 12,
  },
  secondaryButton: {
    flexGrow: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  secondaryButtonDisabled: {
    opacity: 0.5,
  },
  secondaryButtonText: {
    fontWeight: '600',
    color: colors.text,
  },
  sendButton: {
    backgroundColor: colors.primaryStrong,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  collapseButton: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  collapseText: {
    color: colors.muted,
    fontSize: 12,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardButtonPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  cardButtonText: {
    fontWeight: '600',
    color: colors.primaryStrong,
  },
  cardButtonPrimaryText: {
    fontWeight: '600',
    color: '#fff',
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.muted,
    fontWeight: '600',
  },
  authGate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  authGateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  authGateSubtitle: {
    textAlign: 'center',
    color: colors.muted,
  },
  authGateButton: {
    backgroundColor: colors.primaryStrong,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  authGateButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg * 2,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  emptySubtitle: {
    color: colors.muted,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(21, 25, 32, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  modalClose: {
    padding: spacing.xs,
    borderRadius: radius.md,
  },
  modalSubtitle: {
    color: colors.muted,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ratingStar: {
    padding: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ratingStarActive: {
    backgroundColor: `${colors.primaryStrong}14`,
    borderColor: colors.primaryStrong,
  },
  reviewInput: {
    minHeight: 80,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    backgroundColor: colors.surface,
    color: colors.text,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
});
