import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { fetchAvailability, fetchRestaurant, AvailabilitySlot, RestaurantDetail } from '../api';
import { colors, radius, shadow, spacing } from '../config/theme';
import FloorPlanExplorer from '../components/floor/FloorPlanExplorer';
import { RESTAURANT_FLOOR_PLANS } from '../data/floorPlans';
import {
  DEFAULT_TIMEZONE,
  findSlotForTime,
  getSuggestedSlots,
  getSelectionTimestamp,
  getTimeString,
  formatDateLabel,
  formatTimeLabel,
} from '../utils/availability';
import { getMockAvailabilityForRestaurant } from '../data/mockAvailability';
import { buildFloorPlanForRestaurant } from '../utils/floorPlans';
import { formatDateInput, parseDateInput } from '../utils/dateInput';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { useAuth } from '../contexts/AuthContext';

const zoneLabelCache = new Map<string, string>();

const getZoneAbbreviation = (timezone: string) => {
  if (zoneLabelCache.has(timezone)) {
    return zoneLabelCache.get(timezone)!;
  }
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'short',
  });
  const parts = formatter.formatToParts(new Date());
  const label = parts.find((part) => part.type === 'timeZoneName')?.value ?? timezone;
  zoneLabelCache.set(timezone, label);
  return label;
};

function formatIsoTime(iso: string, timezone: string) {
  return formatTimeLabel(new Date(iso), timezone);
}

function formatHumanDate(value: string, timezone: string) {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return 'Select date';
  }
  const [year, month, day] = trimmed.split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 1, day, 12));
  return formatDateLabel(base, timezone);
}

function formatTimeInput(date: Date, timezone: string) {
  return getTimeString(date, timezone);
}

function formatHumanTime(value: string | null, timezone: string) {
  if (!value) return 'Select time';
  const [hourStr, minuteStr] = value.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return 'Select time';
  }
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = ((hour + 11) % 12) + 1;
  const zone = getZoneAbbreviation(timezone);
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${suffix}${zone ? ` ${zone}` : ''}`;
}

function composeDateTime(dateValue: string, timeValue: string | null) {
  const target = parseDateInput(dateValue.trim()) ?? new Date();
  if (timeValue) {
    const [hourStr, minuteStr] = timeValue.split(':');
    target.setHours(Number(hourStr) || 0, Number(minuteStr) || 0, 0, 0);
  }
  return target;
}

const roundToQuarterHour = (value: Date) => {
  const result = new Date(value);
  result.setSeconds(0, 0);
  const minutes = result.getMinutes();
  const rounded = Math.round(minutes / 15) * 15;
  if (rounded === 60) {
    result.setHours(result.getHours() + 1, 0, 0, 0);
  } else {
    result.setMinutes(rounded, 0, 0);
  }
  return result;
};

type Props = NativeStackScreenProps<RootStackParamList, 'Book'>;

export default function BookScreen({ route, navigation }: Props) {
  const { profile } = useAuth();
  const profileName = profile?.name?.trim() ?? '';
  const { id, name, guestName: initialGuestName, guestPhone: initialGuestPhone } = route.params;
  const [dateStr, setDateStr] = useState<string>(formatDateInput(new Date()));
  const [partySize, setPartySize] = useState<number>(2);
  const [guestName, setGuestName] = useState<string>(() => initialGuestName ?? profileName);
  const [guestPhone, setGuestPhone] = useState<string>(initialGuestPhone ?? '');
  const [loading, setLoading] = useState<boolean>(true);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [pendingDate, setPendingDate] = useState<Date>(() => parseDateInput(formatDateInput(new Date())) ?? new Date());
  const [timeStr, setTimeStr] = useState<string | null>(null);
  const [showTimePicker, setShowTimePicker] = useState<boolean>(false);
  const [pendingTime, setPendingTime] = useState<Date>(() => roundToQuarterHour(new Date()));
  const [restaurantDetail, setRestaurantDetail] = useState<RestaurantDetail | null>(null);
  const [timezone, setTimezone] = useState<string>(DEFAULT_TIMEZONE);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const planBundle = useMemo(() => buildFloorPlanForRestaurant(restaurantDetail), [restaurantDetail]);
  const floorPlan = useMemo(() => planBundle?.plan ?? RESTAURANT_FLOOR_PLANS[id] ?? null, [id, planBundle]);
  const floorPlanLabels = planBundle?.tableLabels;

  useEffect(() => {
    if (!initialGuestName && !guestName && profileName) {
      setGuestName(profileName);
    }
  }, [guestName, initialGuestName, profileName]);

  const runLoad = useCallback(
    async (targetInput?: string) => {
      const trimmed = (targetInput ?? dateStr).trim();
      if (!trimmed.length) {
        setSlots([]);
        setError('Choose a date to check availability.');
        setLoading(false);
        return;
      }
      if (trimmed.length < 10) {
        setSlots([]);
        setError(null);
        setLoading(false);
        return;
      }
      const parsedDate = parseDateInput(trimmed);
      if (!parsedDate) {
        setSlots([]);
        setError('Enter a valid date in YYYY-MM-DD format.');
        setLoading(false);
        return;
      }
      const normalizedDate = formatDateInput(parsedDate);
      try {
        setLoading(true);
        setError(null);
        if (normalizedDate !== dateStr) {
          setDateStr(normalizedDate);
        }
        const data = await fetchAvailability(id, normalizedDate, partySize);
        if (data.restaurant_timezone) {
          setTimezone(data.restaurant_timezone);
        }
        setSlots(data.slots ?? []);
      } catch (err: any) {
        const fallbackSlots = getMockAvailabilityForRestaurant(id);
        if (fallbackSlots.length) {
          setSlots(fallbackSlots);
          setError(null);
        } else {
          setError(err?.message || 'Failed to load availability');
          setSlots([]);
        }
      } finally {
        setLoading(false);
      }
    },
    [dateStr, id, partySize],
  );

  const friendlyDate = useMemo(() => formatHumanDate(dateStr, timezone), [dateStr, timezone]);
  const friendlyTime = useMemo(() => formatHumanTime(timeStr, timezone), [timeStr, timezone]);

  useEffect(() => {
    navigation.setOptions({ title: `Book · ${name}` });
  }, [name, navigation]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const detail = await fetchRestaurant(id);
        if (mounted) {
          setRestaurantDetail(detail);
          if (detail.timezone) {
            setTimezone(detail.timezone);
          }
        }
      } catch {
        // best-effort; map will fall back to static assets
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    const parsed = parseDateInput(dateStr);
    if (parsed) {
      setPendingDate(parsed);
    }
  }, [dateStr]);

  useFocusEffect(
    useCallback(() => {
      runLoad();
      return undefined;
    }, [runLoad]),
  );

  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(() => {
        runLoad();
      }, 60000);
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return undefined;
  }, [autoRefresh, runLoad]);

  const availableSummary = useMemo(() => {
    const totalOpen = slots.reduce((acc, slot) => acc + (slot.available_table_ids?.length ?? 0), 0);
    return totalOpen > 0
      ? `${slots.length} slots • ${totalOpen} open tables`
      : 'Currently fully booked — try a different time or party size.';
  }, [slots]);

  useEffect(() => {
    if (!timeStr && slots.length) {
      const first = new Date(slots[0].start);
      if (!Number.isNaN(first.getTime())) {
        setTimeStr(formatTimeInput(first, timezone));
        setPendingTime(first);
      }
    }
  }, [slots, timeStr, timezone]);

  useEffect(() => {
    if (timeStr) {
      setPendingTime(composeDateTime(dateStr, timeStr));
    }
  }, [dateStr, timeStr]);

  const changeParty = (delta: number) => {
    setPartySize((prev) => {
      const next = Math.min(Math.max(prev + delta, 1), 20);
      return next;
    });
  };

  const handleDateConfirm = useCallback(
    (selectedDate: Date) => {
      const normalized = formatDateInput(selectedDate);
      setDateStr(normalized);
      runLoad(normalized);
    },
    [runLoad],
  );

  const handleToday = useCallback(() => {
    const now = new Date();
    setPendingDate(now);
    handleDateConfirm(now);
  }, [handleDateConfirm]);

  const shiftDate = useCallback(
    (deltaDays: number) => {
      const current = parseDateInput(dateStr) ?? new Date();
      const next = new Date(current.getTime());
      next.setUTCDate(next.getUTCDate() + deltaDays);
      setPendingDate(next);
      handleDateConfirm(next);
    },
    [dateStr, handleDateConfirm],
  );

  const openWebPicker = useCallback(
    (type: 'date' | 'time', value: string, onSelect: (raw: string) => void) => {
      if (Platform.OS !== 'web') {
        return;
      }
      const doc = (globalThis as unknown as {
        document?: {
          createElement?: (tag: string) => HTMLInputElement;
          body?: HTMLElement;
        };
      }).document;
      if (!doc?.createElement || !doc.body) {
        return;
      }
      const input = doc.createElement('input');
      input.type = type;
      input.value = value;
      if (type === 'time') {
        input.step = '900';
      }
      Object.assign(input.style, {
        position: 'fixed',
        opacity: '0',
        top: '0',
        left: '0',
        width: '1px',
        height: '1px',
        zIndex: '9999',
        pointerEvents: 'none',
      });
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        input.removeEventListener('change', handleChange as EventListener);
        input.removeEventListener('blur', cleanup);
        if (input.parentNode) {
          input.parentNode.removeChild(input);
        }
      };
      const handleChange: EventListener = (event) => {
        const target = event.target as HTMLInputElement | null;
        const nextValue = target?.value;
        if (nextValue) {
          onSelect(nextValue);
        }
        cleanup();
      };
      input.addEventListener('change', handleChange, { once: true });
      input.addEventListener('blur', cleanup, { once: true });
      doc.body.appendChild(input);
      const triggerPicker = () => {
        if (typeof (input as HTMLInputElement & { showPicker?: () => void }).showPicker === 'function') {
          (input as HTMLInputElement & { showPicker?: () => void }).showPicker();
        } else {
          input.focus();
          input.click();
        }
      };
      // Ensure the element is attached before invoking picker APIs.
      requestAnimationFrame(triggerPicker);
    },
    [],
  );

  const openDatePicker = useCallback(() => {
    const parsed = parseDateInput(dateStr) ?? new Date();
    if (Platform.OS === 'web') {
      const initial = formatDateInput(parsed);
      openWebPicker('date', initial, (raw) => {
        const next = parseDateInput(raw);
        if (next) {
          handleDateConfirm(next);
        }
      });
      return;
    }
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode: 'date',
        value: parsed,
        onChange: (event: DateTimePickerEvent, selectedDate?: Date) => {
          if (event.type === 'set' && selectedDate) {
            handleDateConfirm(selectedDate);
          }
        },
      });
      return;
    }
    setPendingDate(parsed);
    setShowDatePicker(true);
  }, [dateStr, handleDateConfirm, openWebPicker]);

  const closeIOSPicker = useCallback(() => setShowDatePicker(false), []);

  const confirmIOSPicker = useCallback(() => {
    setShowDatePicker(false);
    handleDateConfirm(pendingDate);
  }, [handleDateConfirm, pendingDate]);

  const handleTimeConfirm = useCallback(
    (selectedTime: Date) => {
      const rounded = roundToQuarterHour(selectedTime);
      const normalized = formatTimeInput(rounded, timezone);
      setTimeStr(normalized);
      setPendingTime(rounded);
    },
    [timezone],
  );

  const openTimePicker = useCallback(() => {
    const base = composeDateTime(dateStr, timeStr);
    if (Platform.OS === 'web') {
      const initial = formatTimeInput(base, timezone);
      openWebPicker('time', initial, (raw) => {
        if (!raw) return;
        const [hourStr, minuteStr] = raw.split(':');
        const next = new Date(base);
        const hour = Number(hourStr);
        const minute = Number(minuteStr);
        if (!Number.isNaN(hour) && !Number.isNaN(minute)) {
          next.setHours(hour, minute, 0, 0);
          handleTimeConfirm(next);
        }
      });
      return;
    }
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode: 'time',
        is24Hour: false,
        value: base,
        minuteInterval: 15,
        onChange: (event: DateTimePickerEvent, selected) => {
          if (event.type === 'set' && selected) {
            handleTimeConfirm(selected);
          }
        },
      });
      return;
    }
    setPendingTime(base);
    setShowTimePicker(true);
  }, [dateStr, handleTimeConfirm, openWebPicker, timeStr, timezone]);

  const closeTimePicker = useCallback(() => setShowTimePicker(false), []);

  const confirmIOSTimePicker = useCallback(() => {
    setShowTimePicker(false);
    handleTimeConfirm(pendingTime);
  }, [handleTimeConfirm, pendingTime]);

  const openSeatPicker = (slot: AvailabilitySlot) => {
    navigation.navigate('SeatPicker', {
      id,
      name,
      partySize,
      slot,
      guestName: (guestName || profileName).trim(),
      guestPhone: guestPhone.trim(),
      timezone,
    });
  };

  const selectedSlot = useMemo(
    () => findSlotForTime(slots, dateStr, timeStr, timezone),
    [slots, dateStr, timeStr, timezone],
  );

  const targetTimestamp = useMemo(
    () => getSelectionTimestamp(dateStr, timeStr, timezone),
    [dateStr, timeStr, timezone],
  );

  const suggestedSlots = useMemo(
    () => getSuggestedSlots(slots, targetTimestamp, 4, timezone),
    [slots, targetTimestamp, timezone],
  );

  const selectedSlotAvailability = selectedSlot?.available_table_ids?.length ?? 0;

  const handleFindTables = useCallback(() => {
    if (!timeStr) {
      Alert.alert('Choose a time', 'Select a preferred time before searching for tables.');
      return;
    }
    const match = findSlotForTime(slots, dateStr, timeStr, timezone);
    if (!match) {
      Alert.alert('No tables at that time', 'Try a suggested time from the list below.');
      return;
    }
    openSeatPicker(match);
  }, [dateStr, openSeatPicker, slots, timeStr, timezone]);

  const handleSuggestionPick = useCallback((slot: AvailabilitySlot) => {
    const slotDate = new Date(slot.start);
    if (!Number.isNaN(slotDate.getTime())) {
      handleTimeConfirm(slotDate);
    }
  }, [handleTimeConfirm]);

  const findDisabled = !timeStr || loading || !slots.length;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {Platform.OS === 'ios' ? (
        <Modal transparent visible={showDatePicker} animationType="fade" onRequestClose={closeIOSPicker}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select a date</Text>
                <Pressable onPress={closeIOSPicker} style={styles.modalClose}>
                  <Feather name="x" size={18} color={colors.primaryStrong} />
                </Pressable>
              </View>
              <DateTimePicker
                value={pendingDate}
                mode="date"
                display="inline"
                onChange={(_event, selected) => {
                  if (selected) {
                    setPendingDate(selected);
                  }
                }}
                style={styles.modalPicker}
              />
              <View style={styles.modalActions}>
                <Pressable style={[styles.modalButton, styles.modalButtonGhost]} onPress={closeIOSPicker}>
                  <Text style={styles.modalButtonGhostText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.modalButton} onPress={confirmIOSPicker}>
                  <Text style={styles.modalButtonText}>Apply</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
      {Platform.OS === 'ios' ? (
        <Modal transparent visible={showTimePicker} animationType="fade" onRequestClose={closeTimePicker}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select a time</Text>
                <Pressable onPress={closeTimePicker} style={styles.modalClose}>
                  <Feather name="x" size={18} color={colors.primaryStrong} />
                </Pressable>
              </View>
              <DateTimePicker
                value={pendingTime}
                mode="time"
                display="spinner"
                minuteInterval={15}
                onChange={(_event, selected) => {
                  if (selected) {
                    setPendingTime(selected);
                  }
                }}
                style={styles.modalPicker}
              />
              <View style={styles.modalActions}>
                <Pressable style={[styles.modalButton, styles.modalButtonGhost]} onPress={closeTimePicker}>
                  <Text style={styles.modalButtonGhostText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.modalButton} onPress={confirmIOSTimePicker}>
                  <Text style={styles.modalButtonText}>Apply</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
     ) : null}
      <ScrollView contentContainerStyle={styles.listContent}>
        <View style={styles.compactHero}>
          <Text style={styles.compactHeroLabel}>Booking at</Text>
          <Text style={styles.compactHeroTitle}>{name}</Text>
          <Text style={styles.compactHeroMeta}>
            {restaurantDetail?.address ?? restaurantDetail?.city ?? 'Baku, Azerbaijan'}
          </Text>
          {restaurantDetail?.short_description ? (
            <Text style={styles.compactHeroSubtitle} numberOfLines={2}>
              {restaurantDetail.short_description}
            </Text>
          ) : null}
        </View>
        <View style={styles.header}>
          {floorPlan ? (
            <View style={styles.mapShell}>
              <FloorPlanExplorer plan={floorPlan} venueName={name} labels={floorPlanLabels ?? undefined} />
            </View>
          ) : null}
          <View style={styles.filterCard}>
            <Text style={styles.overline}>Availability planner</Text>
            <Text style={styles.heading}>Fine-tune your request</Text>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Date</Text>
              <View style={styles.dateControls}>
                <Pressable style={styles.dateShiftButton} onPress={() => shiftDate(-1)}>
                  <Feather name="minus" size={16} color={colors.primaryStrong} />
                </Pressable>
                <Pressable style={styles.dateButton} onPress={openDatePicker}>
                  <Feather name="calendar" size={16} color={colors.primaryStrong} />
                  <Text style={styles.dateButtonText}>{friendlyDate}</Text>
                </Pressable>
                <Pressable style={styles.dateShiftButton} onPress={() => shiftDate(1)}>
                  <Feather name="plus" size={16} color={colors.primaryStrong} />
                </Pressable>
                <Pressable style={styles.chip} onPress={handleToday}>
                  <Text style={styles.chipText}>Today</Text>
                </Pressable>
              </View>
              <Text style={styles.dateHelper}>Use − / + to jump a day or tap the date to pick one.</Text>
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Preferred time</Text>
              <View style={styles.timeRow}>
                <Pressable style={styles.dateButton} onPress={openTimePicker}>
                  <Feather name="clock" size={16} color={colors.primaryStrong} />
                  <Text style={styles.dateButtonText}>{friendlyTime}</Text>
                </Pressable>
              </View>
              <Text style={styles.dateHelper}>We’ll match open tables closest to this time.</Text>
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Party size</Text>
              <View style={styles.stepper}>
                <Pressable style={styles.stepperButton} onPress={() => changeParty(-1)}>
                  <Text style={styles.stepperText}>−</Text>
                </Pressable>
                <Text style={styles.stepperValue}>{partySize}</Text>
                <Pressable style={styles.stepperButton} onPress={() => changeParty(1)}>
                  <Text style={styles.stepperText}>＋</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Guest details</Text>
              <TextInput
                value={guestName}
                onChangeText={setGuestName}
                placeholder="Guest name"
                style={styles.input}
              />
              <TextInput
                value={guestPhone}
                onChangeText={setGuestPhone}
                placeholder="Contact phone"
                keyboardType="phone-pad"
                style={styles.input}
              />
            </View>
            <Pressable
              style={[styles.findButton, findDisabled && styles.findButtonDisabled]}
              onPress={handleFindTables}
              disabled={findDisabled}
            >
              <Text style={styles.findButtonText}>Find tables</Text>
            </Pressable>
            <View style={styles.controlsRow}>
              <Pressable
                style={styles.refreshButton}
                onPress={() => {
                  void runLoad();
                }}
              >
                <Text style={styles.refreshButtonText}>Refresh availability</Text>
              </Pressable>
              <View style={styles.switchRow}>
                <Switch
                  value={autoRefresh}
                  onValueChange={(value) => {
                    setAutoRefresh(value);
                    if (value) {
                      void runLoad();
                    }
                  }}
                  thumbColor="#fff"
                  trackColor={{ true: colors.primaryStrong, false: colors.border }}
                />
                <Text style={styles.switchLabel}>Auto-refresh</Text>
              </View>
            </View>
            {loading && (
              <View style={styles.loadingInline}>
                <ActivityIndicator color={colors.primaryStrong} />
                <Text style={styles.loadingInlineText}>Checking slots…</Text>
              </View>
            )}
            {error ? <Text style={styles.errorText}>{error}</Text> : <Text style={styles.statusText}>{availableSummary}</Text>}
          </View>

          <View style={styles.summaryCard}>
            {selectedSlot ? (
              <>
                <Text style={styles.summaryHeadline}>
                  {friendlyTime} — {selectedSlotAvailability} open table{selectedSlotAvailability === 1 ? '' : 's'}
                </Text>
                <Text style={styles.summaryMeta}>Tap “Find tables” to pick the exact seat.</Text>
              </>
            ) : (
              <>
                <Text style={styles.summaryHeadline}>No tables at {friendlyTime}</Text>
                <Text style={styles.summaryMeta}>Try one of the suggested times below.</Text>
              </>
            )}
          </View>

          {suggestedSlots.length ? (
            <View style={styles.suggestionCard}>
              <Text style={styles.sectionLabel}>Suggested times</Text>
              <View style={styles.suggestionRow}>
                {suggestedSlots.map((slot) => {
                  const slotDate = new Date(slot.start);
                  const slotTime = formatTimeInput(slotDate, timezone);
                  const openCount = slot.available_table_ids?.length ?? 0;
                  const active = slotTime === timeStr;
                  return (
                    <Pressable
                      key={slot.start}
                      style={[styles.suggestionChip, active && styles.suggestionChipActive]}
                      onPress={() => handleSuggestionPick(slot)}
                    >
                      <Text style={[styles.suggestionTime, active && styles.suggestionTimeActive]}>
                        {formatIsoTime(slot.start, timezone)}
                      </Text>
                      <Text style={[styles.suggestionMetaSmall, active && styles.suggestionMetaSmallActive]}>
                        {openCount ? `${openCount} open` : 'Waitlist'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {!slots.length && !loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No availability</Text>
              <Text style={styles.emptySubtitle}>Try another date or reduce your party size.</Text>
            </View>
          ) : null}
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
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  compactHero: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadow.card,
  },
  compactHeroLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
    color: colors.muted,
  },
  compactHeroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  compactHeroMeta: {
    color: colors.muted,
  },
  compactHeroSubtitle: {
    color: colors.text,
  },
  header: {
    marginBottom: spacing.lg,
  },
  mapShell: {
    marginBottom: spacing.lg,
  },
  filterCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadow.card,
  },
  overline: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
    color: colors.muted,
  },
  heading: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  label: {
    fontWeight: '600',
    color: colors.text,
  },
  dateControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  dateShiftButton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  dateButtonText: {
    fontWeight: '600',
    color: colors.text,
  },
  dateHelper: {
    fontSize: 12,
    color: colors.muted,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    backgroundColor: colors.overlay,
  },
  chipText: {
    color: colors.primaryStrong,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
  stepperText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.primaryStrong,
  },
  stepperValue: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    minWidth: 32,
    textAlign: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  findButton: {
    backgroundColor: colors.primaryStrong,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  findButtonDisabled: {
    opacity: 0.5,
  },
  findButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  refreshButton: {
    flexGrow: 1,
    backgroundColor: colors.primaryStrong,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  switchLabel: {
    color: colors.muted,
    fontWeight: '500',
  },
  loadingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingInlineText: {
    color: colors.muted,
  },
  statusText: {
    color: colors.muted,
    fontWeight: '500',
  },
  errorText: {
    color: colors.danger,
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadow.card,
  },
  summaryHeadline: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  summaryMeta: {
    color: colors.muted,
  },
  suggestionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  sectionLabel: {
    fontWeight: '600',
    color: colors.text,
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  suggestionChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.overlay,
    minWidth: 110,
    alignItems: 'center',
    gap: 2,
  },
  suggestionChipActive: {
    backgroundColor: colors.primaryStrong,
  },
  suggestionTime: {
    fontWeight: '700',
    color: colors.text,
  },
  suggestionTimeActive: {
    color: '#fff',
  },
  suggestionMetaSmall: {
    fontSize: 12,
    color: colors.muted,
  },
  suggestionMetaSmallActive: {
    color: 'rgba(255,255,255,0.8)',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  emptySubtitle: {
    color: colors.muted,
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
    maxWidth: 360,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
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
  modalPicker: {
    alignSelf: 'stretch',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  modalButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primaryStrong,
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  modalButtonGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalButtonGhostText: {
    color: colors.text,
    fontWeight: '600',
  },
});
