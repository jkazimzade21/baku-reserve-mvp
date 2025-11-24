import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing } from '../config/theme';

type Props = {
  label: string;
  helper?: string;
  onPress: () => void;
  compact?: boolean;
};

export default function ConciergePromptChip({ label, helper, onPress, compact = false }: Props) {
  return (
    <Pressable style={({ pressed }) => [styles.chip, compact && styles.chipCompact, pressed && styles.chipPressed]} onPress={onPress}>
      <Text style={styles.chipLabel}>{label}</Text>
      {helper ? <Text style={styles.chipHelper}>{helper}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: `${colors.border}CC`,
    gap: 4,
  },
  chipCompact: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
  },
  chipPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.99 }],
  },
  chipLabel: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  chipHelper: {
    color: colors.muted,
    fontSize: 12,
  },
});

