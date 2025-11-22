import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Animated, FlatList, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ScrollView } from 'react-native-gesture-handler';

import {
  fetchRestaurant,
  fetchAvailability,
  createReservation,
  AvailabilitySlot,
  Reservation,
  RestaurantDetail,
  TableDetail,
} from '../api';
import FloorPlanExplorer from '../components/floor/FloorPlanExplorer';
import InfoBanner from '../components/InfoBanner';
import { buildFloorPlanForRestaurant } from '../utils/floorPlans';
import {
  formatDateLabel,
  formatTimeLabel,
  DEFAULT_TIMEZONE,
  getAvailabilityDayKey,
} from '../utils/availability';
import { colors, radius, shadow, spacing } from '../config/theme';
import type { FloorOverlay } from '../components/floor/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { useAuth } from '../contexts/AuthContext';

type RouteParams = RootStackParamList['SeatPicker'];
type Props = NativeStackScreenProps<RootStackParamList, 'SeatPicker'>;

type TableSummary = {
  id: string;
  label: string;
  capacity: number;
  area?: string;
};

type DrawerState = {
  table: TableSummary;
  label: string;
  overlayId: string | null;
  isAvailable: boolean;
};

const CROWD_NOTES = ['Terrace has the best sunset glow', 'Lounge pods trend lively after 9pm', 'Dining room ideal for anniversaries'];
const SHEET_HEIGHT = 420;

type TableDrawerProps = {
  open: boolean;
  partySize: number;
  slot: AvailabilitySlot;
  accent: string;
  state: DrawerState | null;
  onRequestClose: () => void;
  onConfirm: (table: TableSummary) => void;
  onClosed: () => void;
  timezone: string;
};

function TableConfirmDrawer({ open, state, partySize, slot, accent, onRequestClose, onConfirm, onClosed, timezone }: TableDrawerProps) {
  const [rendered, setRendered] = useState(open);
  const translateY = React.useRef(new Animated.Value(open ? 0 : SHEET_HEIGHT)).current;

  React.useEffect(() => {
    if (open) {
      setRendered(true);
      translateY.setValue(SHEET_HEIGHT);
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: SHEET_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setRendered(false);
          onClosed();
        }
      });
    }
  }, [open, onClosed, translateY]);

  const handleDismiss = useCallback(() => {
    onRequestClose();
  }, [onRequestClose]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gesture) => gesture.dy > 6,
        onPanResponderMove: (_evt, gesture) => {
          if (gesture.dy > 0) {
            translateY.setValue(gesture.dy);
          }
        },
        onPanResponderRelease: (_evt, gesture) => {
          if (gesture.dy > 120 || gesture.vy > 0.5) {
            handleDismiss();
          } else {
            Animated.timing(translateY, {
              toValue: 0,
              duration: 180,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [handleDismiss, translateY],
  );

  if (!rendered || !state) {
    return null;
  }

  const startsAt = new Date(slot.start);
  const endsAt = new Date(slot.end);
  const sheetDateLabel = formatDateLabel(startsAt, timezone);
  const sheetTimeRange = `${formatTimeLabel(startsAt, timezone)} → ${formatTimeLabel(endsAt, timezone)}`;

  return (
    <View style={styles.sheetOverlay} pointerEvents="box-none">
      <Pressable style={styles.sheetBackdrop} onPress={handleDismiss} />
      <Animated.View style={[styles.sheetContainer, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <View>
            <Text style={styles.sheetTitle}>{state.label}</Text>
            <Text style={styles.sheetSubtitle}>
              {sheetDateLabel} · {sheetTimeRange}
            </Text>
          </View>
          <Pressable style={styles.sheetClose} onPress={handleDismiss}>
            <Text style={styles.sheetCloseText}>×</Text>
          </Pressable>
        </View>
        <View style={styles.sheetBody}>
          <Text style={styles.sheetInfo}>
            Seats {state.table.capacity} guests · {partySize} in party
          </Text>
          {state.table.area ? <Text style={styles.sheetInfo}>Located in {state.table.area}</Text> : null}
          <Text style={styles.sheetInfoMuted}>
            We’ll hold this table for 10 minutes once you confirm. You can always edit guest details on the next screen.
          </Text>
        </View>
        <View style={styles.sheetActions}>
          <Pressable style={[styles.sheetButton, styles.sheetButtonGhost]} onPress={handleDismiss}>
            <Text style={styles.sheetButtonGhostText}>Maybe later</Text>
          </Pressable>
          <Pressable
            style={[
              styles.sheetButton,
              { backgroundColor: accent, opacity: state.isAvailable ? 1 : 0.5 },
            ]}
            disabled={!state.isAvailable}
            onPress={() => onConfirm(state.table)}
          >
            <Text style={styles.sheetButtonText}>
              {state.isAvailable ? 'Confirm table' : 'Not available'}
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

export default function SeatPicker({ route, navigation }: Props) {
  const { id, name, partySize, slot, guestName, guestPhone, timezone: initialTimezone } = route.params;
  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableTableIds, setAvailableTableIds] = useState<string[]>(slot.available_table_ids ?? []);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(slot.available_table_ids?.[0] ?? null);
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(null);
  const [drawerState, setDrawerState] = useState<DrawerState | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [notesIndex, setNotesIndex] = useState(0);

  useEffect(() => {
    navigation.setOptions({ title: `Choose table · ${name}` });
  }, [name, navigation]);

  const resolvedTimezone = restaurant?.timezone ?? initialTimezone ?? DEFAULT_TIMEZONE;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const detail = await fetchRestaurant(id);
        if (!mounted) return;
        setRestaurant(detail);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load tables');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    if (availableTableIds.length) {
      setNotesIndex((index) => (index + 1) % CROWD_NOTES.length);
    }
  }, [availableTableIds.length]);

  useEffect(() => {
    if (!availableTableIds.length) {
      setSelectedTableId(null);
    } else if (!selectedTableId || !availableTableIds.includes(selectedTableId)) {
      setSelectedTableId(availableTableIds[0]);
    }
  }, [availableTableIds, selectedTableId]);

  const syncAvailability = useCallback(
    async (opts?: { manual?: boolean }) => {
      if (opts?.manual) {
        setSyncing(true);
        setSyncError(null);
      }
      try {
        const baseStart = new Date(slot.start);
        if (Number.isNaN(baseStart.getTime())) {
          throw new Error('Slot time is invalid.');
        }
        const day = getAvailabilityDayKey(slot.start, resolvedTimezone);
        if (!day) {
          throw new Error('Slot time is invalid.');
        }
        const targetStartTime = baseStart.getTime();
        const response = await fetchAvailability(id, day, partySize);
        const matching = response.slots?.find((availableSlot: AvailabilitySlot) => {
          const candidateStart = new Date(availableSlot.start).getTime();
          return !Number.isNaN(candidateStart) && candidateStart === targetStartTime;
        });
        if (matching) {
          setAvailableTableIds(matching.available_table_ids ?? []);
        } else {
          setAvailableTableIds([]);
        }
        setLastSyncedAt(new Date());
      } catch (err: any) {
        setSyncError(err.message || 'Unable to refresh – tap to retry');
        if (opts?.manual) {
          Alert.alert('Sync failed', 'Could not refresh live availability. Try again shortly.');
        }
      } finally {
        if (opts?.manual) {
          setSyncing(false);
        }
      }
    },
    [id, partySize, resolvedTimezone, slot.start],
  );

  useFocusEffect(
    useCallback(() => {
      syncAvailability();
      const interval = setInterval(syncAvailability, 15000);
      return () => clearInterval(interval);
    }, [syncAvailability]),
  );

  const availableSet = useMemo(() => new Set(availableTableIds), [availableTableIds]);

  const allTables = useMemo(() => {
    const map: Record<string, TableSummary> = {};
    restaurant?.areas?.forEach((area) => {
      area.tables?.forEach((table) => {
        map[table.id] = {
          id: table.id,
          label: table.name || `Table ${String(table.id).slice(0, 6)}`,
          capacity: table.capacity || 2,
          area: area.name,
        };
      });
    });
    return map;
  }, [restaurant]);

  const planBundle = useMemo(() => buildFloorPlanForRestaurant(restaurant), [restaurant]);
  const floorPlan = planBundle?.plan ?? null;
  const overlayLabels = planBundle?.tableLabels ?? {};
  const tableIdToOverlayId = planBundle?.tableIdToOverlayId ?? new Map<string, string>();
  const overlayIdToTableDetail = planBundle?.overlayIdToTable ?? new Map<string, TableDetail>();

  const availableTables = useMemo<TableSummary[]>(() => {
    return availableTableIds
      .map((tableId) => allTables[tableId])
      .filter(Boolean)
      .map((table) => ({ ...table })) as TableSummary[];
  }, [availableTableIds, allTables]);

  const summary = useMemo(() => {
    if (!availableTableIds.length) {
      return 'No tables available for this slot.';
    }
    const openCount = availableTableIds.length;
    return `${openCount} table${openCount === 1 ? '' : 's'} open for ${partySize} guests.`;
  }, [availableTableIds, partySize]);

  const setDrawerForTable = useCallback(
    (table: TableSummary) => {
      const overlayId = tableIdToOverlayId.get(table.id) ?? null;
      setSelectedTableId(table.id);
      setActiveOverlayId(overlayId);
      const label = overlayId ? overlayLabels[overlayId] ?? table.label : table.label;
      setDrawerState({
        table,
        label,
        overlayId,
        isAvailable: availableSet.has(table.id),
      });
      setDrawerOpen(true);
    },
    [availableSet, overlayLabels, tableIdToOverlayId],
  );

  const handleOverlaySelection = useCallback(
    (overlay: FloorOverlay) => {
      const tableId = overlay.metadata?.tableId;
      let tableSummary: TableSummary | undefined;
      if (tableId) {
        tableSummary = allTables[tableId];
      }
      if (!tableSummary) {
        const detail = overlayIdToTableDetail.get(overlay.id);
        if (detail) {
          tableSummary = allTables[detail.id];
        }
      }
      if (!tableSummary) return;
      setDrawerForTable(tableSummary);
    },
    [allTables, overlayIdToTableDetail, setDrawerForTable],
  );

  const removeTableFromAvailability = (tableId?: string | null) => {
    if (!tableId) return;
    setAvailableTableIds((prev) => prev.filter((id) => id !== tableId));
    setSelectedTableId((prev) => (prev === tableId ? null : prev));
    if (drawerState?.table.id === tableId) {
      setDrawerOpen(false);
      setDrawerState(null);
    }
  };

  const { isAuthenticated, profile } = useAuth();

  const book = async (tableId?: string) => {
    if (!isAuthenticated) {
      Alert.alert('Sign in required', 'Please sign in to book a table.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign in',
          onPress: () => navigation.navigate('Auth'),
        },
      ]);
      return;
    }
    setDrawerOpen(false);
    try {
      const res: Reservation = await createReservation({
        restaurant_id: id,
        party_size: partySize,
        start: slot.start,
        end: slot.end,
        guest_name: guestName?.trim() || profile?.name || 'Mobile Guest',
        guest_phone: guestPhone?.trim() || undefined,
        table_id: tableId,
      });
      removeTableFromAvailability(res.table_id ?? tableId ?? null);
      await new Promise((resolve) => setTimeout(resolve, 320));
      Alert.alert('Booked!', `Reservation ${res.id} confirmed.`);
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Could not book', err.message || 'Unknown error');
    }
  };

  const handleManualRefresh = useCallback(() => {
    syncAvailability({ manual: true });
  }, [syncAvailability]);

  const handleDrawerRequestClose = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const handleDrawerClosed = useCallback(() => {
    setDrawerState(null);
  }, []);

  useEffect(() => {
    if (!selectedTableId) {
      setActiveOverlayId(null);
      return;
    }
    const overlayId = tableIdToOverlayId.get(selectedTableId) ?? null;
    setActiveOverlayId(overlayId);
  }, [selectedTableId, tableIdToOverlayId]);

  useEffect(() => {
    if (!drawerState) return;
    const available = availableTableIds.includes(drawerState.table.id);
    if (drawerState.isAvailable !== available) {
      setDrawerState((prev) => (prev ? { ...prev, isAvailable: available } : prev));
    }
  }, [availableTableIds, drawerState]);

  const heroAccent = colors.primaryStrong;
  const slotStartDate = useMemo(() => new Date(slot.start), [slot.start]);
  const slotEndDate = useMemo(() => new Date(slot.end), [slot.end]);
  const slotDateLabel = useMemo(
    () => formatDateLabel(slotStartDate, resolvedTimezone),
    [slotStartDate, resolvedTimezone],
  );
  const slotTimeRange = useMemo(
    () => `${formatTimeLabel(slotStartDate, resolvedTimezone)} → ${formatTimeLabel(slotEndDate, resolvedTimezone)}`,
    [slotStartDate, slotEndDate, resolvedTimezone],
  );
  const lastSyncedLabel = useMemo(
    () => (lastSyncedAt ? formatTimeLabel(lastSyncedAt, resolvedTimezone) : null),
    [lastSyncedAt, resolvedTimezone],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScrollBeginDrag={() => setSelectedTableId(null)}
      >
        <View style={[styles.heroCard, { borderColor: `${heroAccent}44` }]}
          accessibilityRole="summary"
        >
          <View style={styles.heroHeader}>
            <Text style={styles.heroOverline}>Table preview</Text>
            <Text style={styles.heroTitle}>{name}</Text>
            <Text style={styles.heroSubtitle}>
              {slotDateLabel} · {slotTimeRange}
            </Text>
            <Text style={styles.heroSummary}>{summary}</Text>
            {floorPlan?.label ? (
              <View style={[styles.heroBadge, { backgroundColor: `${heroAccent}1A` }]}>
                <Text style={[styles.heroBadgeText, { color: heroAccent }]}>{floorPlan.label}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.ribbon}>
            <Text style={styles.ribbonCopy}>{CROWD_NOTES[notesIndex]}</Text>
            <Pressable style={styles.ribbonCta} onPress={() => book(undefined)}>
              <Text style={styles.ribbonCtaText}>Auto-assign</Text>
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.primaryStrong} />
            <Text style={styles.loadingText}>Loading floor explorer…</Text>
          </View>
        ) : error ? (
          <View style={styles.errorState}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={handleManualRefresh} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {floorPlan ? (
              <View style={styles.mapCard}>
                <FloorPlanExplorer
                  plan={floorPlan}
                  venueName={restaurant?.name ?? name}
                  detailMode="none"
                  activeOverlayId={activeOverlayId}
                  labels={overlayLabels}
                  onOverlayPress={handleOverlaySelection}
                  isInteractive={(overlay) => overlayIdToTableDetail.has(overlay.id)}
                />
                <View style={styles.syncRow}>
                  <Text style={styles.syncLabel}>
                    {lastSyncedLabel ? `Updated ${lastSyncedLabel}` : 'Live availability'}
                  </Text>
                  <Pressable
                    style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
                    onPress={handleManualRefresh}
                    disabled={syncing}
                  >
                    <Text style={styles.syncButtonText}>{syncing ? 'Syncing…' : 'Refresh'}</Text>
                  </Pressable>
                </View>
                {syncError ? (
                  <InfoBanner
                    tone="warning"
                    icon="wifi-off"
                    title="Seat map may be out of sync"
                    message={`${syncError} Pull to refresh for fresh availability.`}
                    style={styles.syncBanner}
                  />
                ) : null}
              </View>
            ) : null}

            <View style={styles.listSection}>
              <Text style={styles.sectionTitle}>Open tables ({availableTables.length})</Text>
              {availableTables.length ? (
                <FlatList
                  data={availableTables}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                  ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
              renderItem={({ item }) => {
                const isSelected = selectedTableId === item.id;
                const overlayId = tableIdToOverlayId.get(item.id) ?? null;
                const label = overlayId ? overlayLabels[overlayId] ?? item.label : item.label;
                return (
                  <Pressable
                    onPress={() => setDrawerForTable(item)}
                    style={[
                      styles.tableRowCard,
                      isSelected && [styles.tableRowCardSelected, { borderColor: heroAccent }],
                    ]}
                  >
                        <View>
                          <Text style={styles.tableRowLabel}>{label}</Text>
                          <Text style={styles.tableRowMeta}>
                            Seats {item.capacity}
                        {item.area ? ` · ${item.area}` : ''}
                      </Text>
                    </View>
                    <Pressable
                      style={[styles.primaryButton, styles.primaryButtonCompact, { backgroundColor: heroAccent }]}
                      onPress={() => setDrawerForTable(item)}
                    >
                      <Text style={styles.primaryButtonText}>Reserve</Text>
                    </Pressable>
                  </Pressable>
                );
                  }}
                />
              ) : (
                <View style={styles.errorState}>
                  <Text style={styles.errorText}>Currently fully booked for this time.</Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
      <TableConfirmDrawer
        open={drawerOpen && !!drawerState}
        state={drawerState}
        partySize={partySize}
        slot={slot}
        accent={heroAccent}
        onRequestClose={handleDrawerRequestClose}
        onConfirm={(table) => book(table.id)}
        onClosed={handleDrawerClosed}
        timezone={resolvedTimezone}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.lg * 2,
    gap: spacing.lg,
  },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.lg,
    ...shadow.card,
  },
  heroHeader: {
    gap: spacing.xs,
  },
  heroOverline: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
    color: colors.muted,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  heroSubtitle: {
    color: colors.muted,
    fontWeight: '500',
  },
  heroSummary: {
    color: colors.text,
    fontWeight: '600',
  },
  heroBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
  },
  heroBadgeText: {
    fontWeight: '600',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ribbon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlay,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  ribbonCopy: {
    flex: 1,
    color: colors.primaryStrong,
    fontWeight: '500',
  },
  ribbonCta: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.primaryStrong,
  },
  ribbonCtaText: {
    color: '#fff',
    fontWeight: '700',
  },
  loading: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.muted,
  },
  mapCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadow.card,
  },
  syncRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  syncLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  syncButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.overlay,
  },
  syncButtonDisabled: {
    opacity: 0.6,
  },
  syncButtonText: {
    fontWeight: '600',
    color: colors.primaryStrong,
  },
  syncBanner: {
    marginTop: spacing.sm,
  },
  errorState: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorText: {
    color: colors.danger,
    fontWeight: '600',
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.primaryStrong,
  },
  retryText: {
    color: '#fff',
    fontWeight: '700',
  },
  listSection: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.lg,
    ...shadow.card,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  tableRowCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tableRowCardSelected: {
    borderColor: colors.primaryStrong,
    backgroundColor: colors.overlay,
  },
  tableRowLabel: {
    color: colors.text,
    fontWeight: '600',
  },
  tableRowMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  primaryButton: {
    backgroundColor: colors.primaryStrong,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  primaryButtonCompact: {
    minWidth: 110,
    paddingHorizontal: spacing.sm,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16, 20, 26, 0.35)',
  },
  sheetContainer: {
    width: '100%',
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg + spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  sheetSubtitle: {
    color: colors.muted,
    marginTop: spacing.xs,
  },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginTop: -2,
  },
  sheetBody: {
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  sheetInfo: {
    color: colors.text,
    fontWeight: '500',
  },
  sheetInfoMuted: {
    color: colors.muted,
    lineHeight: 18,
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sheetButton: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  sheetButtonGhost: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sheetButtonGhostText: {
    color: colors.text,
    fontWeight: '600',
  },
});
