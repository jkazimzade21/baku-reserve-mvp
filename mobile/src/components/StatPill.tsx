import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../config/theme';

type Props = {
  label: string;
  value: string;
  accent?: 'primary' | 'secondary' | 'success';
};

export default function StatPill({ label, value, accent = 'primary' }: Props) {
  return (
    <View style={[styles.container, accentStyles[accent]]}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    minWidth: 110,
    alignItems: 'flex-start',
    gap: spacing.xs / 2,
  },
  value: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: colors.muted,
  },
});

const accentStyles = StyleSheet.create({
  primary: {
    backgroundColor: `${colors.accent}70`,
  },
  secondary: {
    backgroundColor: `${colors.secondary}4D`,
  },
  success: {
    backgroundColor: `${colors.success}26`,
  },
});
