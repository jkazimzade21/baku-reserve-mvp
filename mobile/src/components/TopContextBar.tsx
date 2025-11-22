import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { colors, spacing, radius } from '../config/theme';

type Props = {
  location?: string;
  timeLabel?: string;
  onPressContext?: () => void;
};

export default function TopContextBar({
  location = 'Baku',
  timeLabel = 'Tonight',
  onPressContext,
}: Props) {
  const handlePress = () => {
    Haptics.selectionAsync().catch(() => {});
    onPressContext?.();
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.contextButton} onPress={handlePress} accessibilityRole="button">
        <Text style={styles.locationText}>{location}</Text>
        <View style={styles.dot} />
        <Text style={styles.timeText}>{timeLabel}</Text>
        <Feather name="chevron-down" size={14} color={colors.primaryStrong} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  contextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    gap: spacing.xs,
    minHeight: 44,
  },
  locationText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.muted,
  },
  timeText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
});
