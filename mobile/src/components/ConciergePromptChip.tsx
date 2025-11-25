import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

import { colors, gradients, radius, shadow, spacing } from '../config/theme';

type Props = {
  label: string;
  helper?: string;
  icon?: keyof typeof Feather.glyphMap;
  onPress: () => void;
  compact?: boolean;
};

export default function ConciergePromptChip({ label, helper, icon, onPress, compact = false }: Props) {
  if (compact) {
    return (
      <Pressable style={({ pressed }) => [styles.chipCompact, pressed && styles.pressed]} onPress={onPress}>
        <Text style={styles.chipLabelCompact}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
    >
      <LinearGradient
        colors={gradients.royal3D}
        style={styles.gradient}
        start={{ x: 0.1, y: 0.1 }}
        end={{ x: 0.9, y: 0.9 }}
      >
        <View style={styles.header}>
          <View style={styles.iconBubble}>
            <Feather name={icon || 'command'} size={20} color={colors.primaryStrong} />
          </View>
        </View>

        <View style={styles.content}>
          <Text style={styles.label} numberOfLines={2}>{label}</Text>
          {helper ? <Text style={styles.helper} numberOfLines={2}>{helper}</Text> : null}
        </View>

        {/* Decorative 3D highlight overlay */}
        <View style={styles.highlight} />
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: '48%',
    aspectRatio: 1.1, // Slightly taller than square
    borderRadius: radius.xl,
    ...shadow.deep3d,
    marginVertical: spacing.xs,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  gradient: {
    flex: 1,
    borderRadius: radius.xl,
    padding: spacing.md,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  content: {
    gap: 2,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.royalDeep,
    letterSpacing: -0.2,
  },
  helper: {
    fontSize: 11,
    color: colors.mutedStrong,
    opacity: 0.8,
    lineHeight: 15,
  },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: 'linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 100%)', // This won't work in RN style directly, use another gradient if needed or just opacity
    opacity: 0.1,
  },
  // Compact styles for fallback or other uses
  chipCompact: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    alignItems: 'center',
  },
  chipLabelCompact: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
});
