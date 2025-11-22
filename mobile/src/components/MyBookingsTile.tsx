import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { colors, radius, spacing, shadow } from '../config/theme';
import { Reservation } from '../api';

type Props = {
  reservation: Reservation;
  onPress: () => void;
  restaurantName?: string;
};

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

export default function MyBookingsTile({ reservation, onPress, restaurantName }: Props) {
  const { dateLabel, timeLabel } = useMemo(() => {
    const start = new Date(reservation.start);
    return {
      dateLabel: dayFormatter.format(start),
      timeLabel: timeFormatter.format(start),
    };
  }, [reservation.start]);

  const handlePress = () => {
    Haptics.selectionAsync().catch(() => {});
    onPress();
  };

  return (
    <Pressable style={styles.container} onPress={handlePress} accessibilityRole="button">
      <View style={styles.leftBar} />
      <View style={styles.content}>
        <Text style={styles.label}>Upcoming reservation</Text>
        <Text style={styles.restaurantName}>{restaurantName || 'Reserved table'}</Text>
        <View style={styles.metaRow}>
          <Feather name="clock" size={14} color={colors.muted} />
          <Text style={styles.metaText}>
            {dateLabel} · {timeLabel} • {reservation.party_size} guests
          </Text>
        </View>
      </View>
      <View style={styles.iconContainer}>
        <Feather name="chevron-right" size={20} color={colors.muted} />
      </View>
    </Pressable>
  );
}

// Note: In a real app, we'd look up the restaurant name from ID or include it in the reservation object.

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    ...shadow.subtle,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 88,
  },
  leftBar: {
    width: 6,
    height: '100%',
    backgroundColor: colors.primary,
  },
  content: {
    flex: 1,
    padding: spacing.md,
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  restaurantName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontSize: 13,
    color: colors.muted,
  },
  iconContainer: {
    paddingRight: spacing.md,
  },
});
