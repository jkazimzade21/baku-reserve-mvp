import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { colors, spacing, radius, shadow } from '../config/theme';
import { BROWSE_CATEGORIES } from '../constants/browseCategories';

type Props = {
  onSelectCategory: (id: string) => void;
  maxItems?: number;
  columns?: 2 | 3 | 4 | 5;
};

export default function CategoryGrid({ onSelectCategory, maxItems = 9, columns = 3 }: Props) {
  const categories = useMemo(() => BROWSE_CATEGORIES.slice(0, Math.min(maxItems, 25)), [maxItems]);
  const cardWidth = columns === 2 ? '47%' : columns === 3 ? '30%' : columns === 4 ? '23%' : '18%';

  return (
    <View style={styles.grid}>
      {categories.map((cat) => (
        <Pressable
          key={cat.id}
          style={({ pressed }) => [styles.card, { width: cardWidth }, pressed && styles.cardPressed]}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onSelectCategory(cat.id);
          }}
          accessibilityRole="button"
          accessibilityLabel={cat.label}
        >
          <View style={styles.iconContainer}>
            <Feather name={cat.icon as any} size={20} color={colors.royalHighlight} />
          </View>
          <Text style={styles.label}>{cat.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    justifyContent: 'space-between',
  },
  card: {
    minHeight: 90,
    marginBottom: spacing.sm,
    padding: spacing.xs,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    ...shadow.subtle,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryStrong,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.2,
    borderColor: colors.royalHighlight,
    shadowColor: colors.primaryStrong,
    shadowOpacity: 0.24,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.xs,
  },
});
