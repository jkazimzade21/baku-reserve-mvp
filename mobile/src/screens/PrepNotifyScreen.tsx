import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { confirmPreorder, getPreorderQuote, type PreorderQuoteResponse, type PreorderRequestPayload, type Reservation } from '../api';
import InfoBanner from '../components/InfoBanner';
import Surface from '../components/Surface';
import { colors, radius, spacing } from '../config/theme';
import type { RootStackParamList } from '../types/navigation';

const ETA_CHOICES = [5, 10];
const SCOPE_CHOICES: Array<{ key: PreorderRequestPayload['scope']; label: string }> = [
  { key: 'starters', label: 'Starters only' },
  { key: 'full', label: 'Full meal' },
];

type Props = NativeStackScreenProps<RootStackParamList, 'PrepNotify'>;

export default function PrepNotifyScreen({ navigation, route }: Props) {
  const { reservation: initialReservation, restaurantName } = route.params;
  const [reservation, setReservation] = useState<Reservation>(initialReservation);
  const [minutesAway, setMinutesAway] = useState<number>(10);
  const [scope, setScope] = useState<PreorderRequestPayload['scope']>('starters');
  const [itemsNote, setItemsNote] = useState('');
  const [quote, setQuote] = useState<PreorderQuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const reservationWindow = useMemo(() => {
    const start = new Date(reservation.start);
    const formatter = new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return formatter.format(start);
  }, [reservation.start]);

  useEffect(() => {
    let active = true;
    async function loadQuote() {
      setQuoteLoading(true);
      setQuoteError(null);
      try {
        const payload: PreorderRequestPayload = {
          minutes_away: minutesAway,
          scope,
          items: parsedItems || undefined,
        };
        const result = await getPreorderQuote(reservation.id, payload);
        if (!active) return;
        setQuote(result);
      } catch (err: any) {
        if (!active) return;
        setQuoteError(err?.message || 'Feature currently unavailable.');
      } finally {
        if (active) setQuoteLoading(false);
      }
    }
    loadQuote().catch(() => null);
    return () => {
      active = false;
    };
  }, [reservation.id, scope, minutesAway, itemsNote]);

  const parsedItems = useMemo(() => {
    if (!itemsNote.trim()) return undefined;
    return itemsNote
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }, [itemsNote]);

  const handleConfirm = async () => {
    try {
      setSubmitting(true);
      setSubmitError(null);
      const payload: PreorderRequestPayload = {
        minutes_away: minutesAway,
        scope,
        items: parsedItems,
      };
      const updated = await confirmPreorder(reservation.id, payload);
      setReservation(updated);
      Alert.alert(
        'Kitchen notified',
        'We pinged the restaurant—no deposit required.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err: any) {
      setSubmitError(err?.message || 'Unable to notify the kitchen right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Surface style={styles.card}>
          <Text style={styles.title}>Prep notify</Text>
          <Text style={styles.subtitle}>{restaurantName || 'Restaurant'}</Text>
          <Text style={styles.meta}>{reservationWindow}</Text>

          <InfoBanner
            tone="info"
            style={styles.banner}
            title="No live tracking"
            message="Live location and ETA tracking have been removed. Choose when to ping the kitchen below."
          />

          <Text style={styles.sectionLabel}>When should we notify?</Text>
          <View style={styles.chipRow}>
            {ETA_CHOICES.map((val) => (
              <Pressable
                key={val}
                onPress={() => setMinutesAway(val)}
                style={[
                  styles.chip,
                  minutesAway === val && styles.chipActive,
                ]}
              >
                <Text style={[styles.chipLabel, minutesAway === val && styles.chipLabelActive]}>
                  {val} min out
                </Text>
              </Pressable>
            ))}
            <View style={[styles.chip, styles.inputChip]}>
              <TextInput
                keyboardType="number-pad"
                value={String(minutesAway)}
                onChangeText={(txt) => {
                  const num = parseInt(txt, 10);
                  setMinutesAway(Number.isFinite(num) ? Math.max(1, num) : minutesAway);
                }}
                style={styles.input}
                placeholder="Custom"
              />
            </View>
          </View>

          <Text style={styles.sectionLabel}>Prep scope</Text>
          <View style={styles.chipRow}>
            {SCOPE_CHOICES.map((choice) => (
              <Pressable
                key={choice.key}
                onPress={() => setScope(choice.key)}
                style={[
                  styles.chip,
                  scope === choice.key && styles.chipActive,
                ]}
              >
                <Text style={[styles.chipLabel, scope === choice.key && styles.chipLabelActive]}>
                  {choice.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Notes for the kitchen (optional)</Text>
          <TextInput
            style={styles.textArea}
            value={itemsNote}
            onChangeText={setItemsNote}
            placeholder="Add any special requests or dishes to start on."
            multiline
            numberOfLines={4}
          />

          {quoteLoading ? (
            <View style={styles.quoteRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.quoteText}>Calculating recommendation…</Text>
            </View>
          ) : quoteError ? (
            <InfoBanner tone="error" style={styles.banner} title="Prep estimate unavailable" message={quoteError || undefined} />
          ) : quote ? (
            <InfoBanner
              tone="success"
              style={styles.banner}
              title="Kitchen timing"
              message={`We suggest pinging the kitchen about ${quote.recommended_prep_minutes} minutes before arrival. Policy: ${quote.policy}`}
            />
          ) : null}

          {submitError ? (
            <InfoBanner tone="error" style={styles.banner} title="Unable to notify" message={submitError || undefined} />
          ) : null}

          <Pressable
            style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
            onPress={handleConfirm}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnLabel}>Notify kitchen</Text>
            )}
          </Pressable>
        </Surface>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  meta: {
    color: colors.muted,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  chipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  chipLabel: {
    color: colors.text,
    fontWeight: '600',
  },
  chipLabelActive: {
    color: colors.primaryStrong,
  },
  inputChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  input: {
    minWidth: 64,
    fontSize: 16,
    color: colors.text,
  },
  textArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    minHeight: 100,
    textAlignVertical: 'top',
    color: colors.text,
  },
  quoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  quoteText: {
    color: colors.muted,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: 14,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  banner: {
    marginTop: spacing.xs,
  },
});
