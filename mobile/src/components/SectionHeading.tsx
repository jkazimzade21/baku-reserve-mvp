import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';

import { colors, spacing } from '../config/theme';

type Props = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onPressAction?: (event: GestureResponderEvent) => void;
  leftAdornment?: React.ReactNode;
};

export default function SectionHeading({
  title,
  subtitle,
  actionLabel,
  onPressAction,
  leftAdornment,
}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.textColumn}>
        <View style={styles.titleRow}>
          {leftAdornment ? <View style={styles.icon}>{leftAdornment}</View> : null}
          <Text style={styles.title}>{title}</Text>
        </View>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onPressAction ? (
        <Pressable style={styles.action} onPress={onPressAction}>
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  textColumn: {
    flex: 1,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  icon: {
    padding: spacing.xs / 2,
    borderRadius: 12,
    backgroundColor: colors.overlay,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
  },
  action: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: spacing.lg,
    backgroundColor: colors.overlay,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryStrong,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
});
