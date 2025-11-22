import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AreaDetail } from '../../../api';
import { colors, radius, spacing } from '../../../config/theme';

type Props = {
  areas: AreaDetail[];
  activeAreaId: string | null;
  onSelect: (id: string) => void;
};

export function ZoneToggle({ areas, activeAreaId, onSelect }: Props) {
  if (!areas.length) {
    return null;
  }

  return (
    <View style={styles.container} accessibilityRole="radiogroup">
      {areas.map((area) => {
        const isActive = area.id === activeAreaId;
        const accent = area.theme?.accent ?? colors.primary;
        return (
          <Pressable
            key={area.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: isActive }}
            style={[styles.chip, isActive && { backgroundColor: `${accent}33`, borderColor: accent }]}
            onPress={() => onSelect(area.id)}
          >
            <Text style={[styles.label, isActive && { color: colors.text }]}>{area.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    color: colors.muted,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});

export default ZoneToggle;
