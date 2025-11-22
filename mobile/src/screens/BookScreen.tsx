import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import {
  AvailabilitySlot,
  createReservation,
  fetchAvailability,
  fetchRestaurant,
  type RestaurantDetail,
} from '../api';
import { colors, radius, shadow, spacing } from '../config/theme';
import { formatDateInput, parseDateInput } from '../utils/dateInput';
import { formatDateLabel, formatTimeLabel } from '../utils/availability';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { useAuth } from '../contexts/AuthContext';

 type Props = NativeStackScreenProps<RootStackParamList, 'Book'>;

const TIME_OPTIONS = ['18:00', '19:00', '20:00', '21:00'];

function formatHumanDate(value: string, timezone: string) {
  const parsed = parseDateInput(value);
  if (!parsed) return 'Select date';
  return formatDateLabel(parsed, timezone);
}

function formatHumanTime(value: string | null, timezone: string) {
  if (!value) return 'Select time';
  const [hourStr, minuteStr] = value.split(':');
  const base = new Date();
  base.setHours(Number(hourStr) || 0, Number(minuteStr) || 0, 0, 0);
  return formatTimeLabel(base, timezone);
}

export default function BookScreen({ route, navigation }: Props) {
  const { profile } = useAuth();
  const { id, name, guestName: initialGuestName, guestPhone: initialGuestPhone } = route.params;
  const [restaurantDetail, setRestaurantDetail] = useState<RestaurantDetail | null>(null);
  const [timezone, setTimezone] = useState<string>('Asia/Baku');
  const [dateStr, setDateStr] = useState<string>(formatDateInput(new Date()));
  const [timeStr, setTimeStr] = useState<string | null>(null);
  const [partySize, setPartySize] = useState<number>(2);
  const [guestName, setGuestName] = useState<string>(initialGuestName ?? profile?.name ?? '');
  const [guestPhone, setGuestPhone] = useState<string>(initialGuestPhone ?? '');
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [pendingDate, setPendingDate] = useState<Date>(() => parseDateInput(formatDateInput(new Date())) ?? new Date());
  const [showTimePicker, setShowTimePicker] = useState<boolean>(false);
  const [pendingTime, setPendingTime] = useState<Date>(new Date());

  useEffect(() => {
    navigation.setOptions({ title: `Book · ${name}` });
  }, [name, navigation]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const detail = await fetchRestaurant(id);
        if (!mounted) return;
        setRestaurantDetail(detail);
        if (detail.timezone) setTimezone(detail.timezone);
      } catch {
        // best-effort
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  const loadAvailability = useCallback(
    async (targetDate?: string) => {
      const normalized = targetDate?.trim() || dateStr.trim();
      if (!normalized) return;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAvailability(id, normalized, partySize);
        setSlots(data.slots ?? []);
        if (data.restaurant_timezone) setTimezone(data.restaurant_timezone);
      } catch (err: any) {
        setSlots([]);
        setError(err?.message || 'Failed to load availability');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [dateStr, id, partySize],
  );

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  const selectedSlot = useMemo(() => {
    if (!timeStr) return null;
    const match = slots.find((slot) => {
      const slotDate = new Date(slot.start);
      const hours = slotDate.getHours().toString().padStart(2, '0');
      const minutes = slotDate.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}` === timeStr;
    });
    return match ?? null;
  }, [slots, timeStr]);

  const handleDateConfirm = useCallback(
    (selectedDate: Date) => {
      const normalized = formatDateInput(selectedDate);
      setDateStr(normalized);
      void loadAvailability(normalized);
    },
    [loadAvailability],
  );

  const openDatePicker = useCallback(() => {
    const parsed = parseDateInput(dateStr) ?? new Date();
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
  }, [dateStr, handleDateConfirm]);

  const confirmIOSDate = useCallback(() => {
    setShowDatePicker(false);
    handleDateConfirm(pendingDate);
  }, [pendingDate, handleDateConfirm]);

  const openTimePicker = useCallback(() => {
    const base = pendingTime;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode: 'time',
        is24Hour: false,
        value: base,
        minuteInterval: 15,
        onChange: (event: DateTimePickerEvent, selected) => {
          if (event.type === 'set' && selected) {
            const hours = selected.getHours().toString().padStart(2, '0');
            const minutes = selected.getMinutes().toString().padStart(2, '0');
            const next = `${hours}:${minutes}`;
            setTimeStr(next);
            setPendingTime(selected);
          }
        },
      });
      return;
    }
    setShowTimePicker(true);
  }, [pendingTime]);

  const confirmIOSTime = useCallback(() => {
    const hours = pendingTime.getHours().toString().padStart(2, '0');
    const minutes = pendingTime.getMinutes().toString().padStart(2, '0');
    setTimeStr(`${hours}:${minutes}`);
    setShowTimePicker(false);
  }, [pendingTime]);

  const suggestionSlots = useMemo(() => slots.slice(0, 8), [slots]);

  const handleBook = async () => {
    if (!selectedSlot) {
      Alert.alert('Choose a time', 'Select an available time first.');
      return;
    }
    if (!guestName.trim()) {
      Alert.alert('Add guest name', 'Please enter who the booking is under.');
      return;
    }
    const payload = {
      restaurant_id: id,
      party_size: partySize,
      start: selectedSlot.start,
      end: selectedSlot.end,
      guest_name: guestName.trim(),
      guest_phone: guestPhone.trim() || undefined,
      table_id: selectedSlot.available_table_ids?.[0] ?? null,
    };
    try {
      await createReservation(payload);
      Alert.alert('Booked', 'Your table request was sent.', [
        {
          text: 'View booking',
          onPress: () => navigation.navigate('Reservations'),
        },
      ]);
    } catch (err: any) {
      Alert.alert('Could not book', err?.message || 'Please try another time.');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadAvailability(); }} tintColor={colors.primaryStrong} />}
      >
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

        <View style={styles.filterCard}>
          <Text style={styles.overline}>Plan your visit</Text>
          <Text style={styles.heading}>Fine-tune your request</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Date</Text>
            <View style={styles.row}>
              <Pressable style={styles.chipButton} onPress={() => handleDateConfirm(new Date())}>
                <Text style={styles.chipText}>Today</Text>
              </Pressable>
              <Pressable style={styles.dateButton} onPress={openDatePicker}>
                <Feather name="calendar" size={16} color={colors.primaryStrong} />
                <Text style={styles.dateButtonText}>{formatHumanDate(dateStr, timezone)}</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Preferred time</Text>
            <View style={styles.row}>
              <Pressable style={styles.dateButton} onPress={openTimePicker}>
                <Feather name="clock" size={16} color={colors.primaryStrong} />
                <Text style={styles.dateButtonText}>{formatHumanTime(timeStr, timezone)}</Text>
              </Pressable>
            </View>
            <View style={styles.suggestionRow}>
              {TIME_OPTIONS.map((time) => (
                <Pressable
                  key={time}
                  style={[styles.suggestionChip, timeStr === time && styles.suggestionChipActive]}
                  onPress={() => setTimeStr(time)}
                >
                  <Text style={[styles.suggestionText, timeStr === time && styles.suggestionTextActive]}>{time}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Party size</Text>
            <View style={styles.stepper}>
              <Pressable style={styles.stepperButton} onPress={() => setPartySize((v) => Math.max(1, v - 1))}>
                <Text style={styles.stepperText}>−</Text>
              </Pressable>
              <Text style={styles.stepperValue}>{partySize}</Text>
              <Pressable style={styles.stepperButton} onPress={() => setPartySize((v) => v + 1)}>
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
            style={[styles.findButton, (!selectedSlot || loading) && styles.findButtonDisabled]}
            onPress={handleBook}
            disabled={!selectedSlot || loading}
          >
            <Text style={styles.findButtonText}>{selectedSlot ? 'Book this time' : 'Choose a time'}</Text>
          </Pressable>

          {loading ? (
            <View style={styles.loadingInline}>
              <ActivityIndicator color={colors.primaryStrong} />
              <Text style={styles.loadingInlineText}>Checking slots…</Text>
            </View>
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <Text style={styles.statusText}>
              {slots.length ? `${slots.length} slots available` : 'No tables for this date/party size yet.'}
            </Text>
          )}
        </View>

        <View style={styles.suggestionCard}>
          <Text style={styles.sectionLabel}>Available times</Text>
          <View style={styles.slotGrid}>
            {suggestionSlots.map((slot) => {
              const slotDate = new Date(slot.start);
              const timeLabel = slotDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const selected = selectedSlot?.start === slot.start;
              const openTables = slot.available_table_ids?.length ?? 0;
              return (
                <Pressable
                  key={slot.start}
                  style={[styles.slotChip, selected && styles.slotChipActive]}
                  onPress={() => setTimeStr(slotDate.toISOString().slice(11, 16))}
                >
                  <Text style={[styles.slotText, selected && styles.slotTextActive]}>{timeLabel}</Text>
                  <Text style={[styles.slotMeta, selected && styles.slotMetaActive]}>
                    {openTables ? `${openTables} tables` : 'Waitlist'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {Platform.OS === 'ios' && showDatePicker ? (
        <DateTimePicker
          value={pendingDate}
          mode="date"
          display="inline"
          onChange={(_event, selected) => selected && setPendingDate(selected)}
          style={styles.modalPicker}
        />
      ) : null}
      {Platform.OS === 'ios' && showTimePicker ? (
        <DateTimePicker
          value={pendingTime}
          mode="time"
          display="spinner"
          minuteInterval={15}
          onChange={(_event, selected) => selected && setPendingTime(selected)}
          style={styles.modalPicker}
        />
      ) : null}
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
    gap: spacing.lg,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
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
  dateButtonText: {
    fontWeight: '600',
    color: colors.text,
  },
  chipButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    backgroundColor: colors.overlay,
  },
  chipText: {
    color: colors.primaryStrong,
    fontWeight: '600',
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
  },
  suggestionChipActive: {
    backgroundColor: colors.primaryStrong,
  },
  suggestionText: {
    fontWeight: '700',
    color: colors.text,
  },
  suggestionTextActive: {
    color: '#fff',
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
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  findButton: {
    backgroundColor: colors.primaryStrong,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  findButtonDisabled: {
    opacity: 0.6,
  },
  findButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  loadingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingInlineText: {
    color: colors.muted,
  },
  errorText: {
    color: colors.danger,
    fontWeight: '600',
  },
  statusText: {
    color: colors.muted,
    fontWeight: '500',
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
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  slotChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.overlay,
    minWidth: 110,
  },
  slotChipActive: {
    backgroundColor: colors.primaryStrong,
  },
  slotText: {
    fontWeight: '700',
    color: colors.text,
  },
  slotTextActive: {
    color: '#fff',
  },
  slotMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  slotMetaActive: {
    color: 'rgba(255,255,255,0.85)',
  },
  modalPicker: {
    alignSelf: 'stretch',
  },
});
