import React, { useEffect } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { AreaDetail, TableDetail } from '../../../api';
import { colors, radius, shadow, spacing } from '../../../config/theme';

type Props = {
  table: TableDetail | null;
  area: AreaDetail | null;
  visible: boolean;
  onClose: () => void;
  onReserve: () => void;
};

export function SeatPreviewDrawer({ table, area, visible, onClose, onReserve }: Props) {
  const translateY = useSharedValue(visible ? 0 : 320);

  useEffect(() => {
    translateY.value = withTiming(visible ? 0 : 320, { duration: 280 });
  }, [translateY, visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const handleShare = async () => {
    if (!table) return;
    const message = `Let's reserve ${table.name} (${table.capacity} seats) at ${area?.name ?? 'the venue'}.`;
    try {
      await Share.share({ message });
    } catch (err) {
      // noop
    }
  };

  const accent = area?.theme?.accent ?? colors.primary;
  const ambienceCopy =
    table?.noise_level === 'low'
      ? 'Quiet ambience'
      : table?.noise_level === 'high'
      ? 'Vibrant scene'
      : table?.noise_level === 'medium'
      ? 'Lively energy'
      : 'Balanced ambience';
  const finishCopy = area?.theme?.texture
    ? `${area.theme.texture.charAt(0).toUpperCase()}${area.theme.texture.slice(1)} finish`
    : 'Classic finish';
  const featureCopy = table?.featured ? 'Featured table' : 'Open for reservation';

  return (
    <Animated.View style={[styles.drawer, animatedStyle]} pointerEvents={visible ? 'auto' : 'none'}>
      <Pressable style={styles.handle} onPress={onClose} accessibilityRole="button" accessibilityLabel="Hide seat details" />
      <View style={styles.row}>
        <View style={styles.infoColumn}>
          <Text style={styles.drawerTitle}>{table?.name ?? 'Select a table'}</Text>
          <Text style={styles.drawerMeta}>
            {area?.name ?? ''}
            {table ? ` • Seats ${table.capacity}` : ''}
          </Text>
          {table?.tags?.length ? (
            <View style={styles.tagRow}>
              {table.tags.map((tag) => (
                <View key={tag} style={[styles.tag, { borderColor: accent }]}>
                  <Text style={[styles.tagText, { color: accent }]}>{tag.replace('_', ' ')}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <Pressable onPress={handleShare} style={styles.shareButton}>
          <Text style={styles.shareText}>Share</Text>
        </Pressable>
      </View>
      <View style={styles.metricRow}>
        <View style={[styles.metricCard, { borderColor: `${accent}55`, backgroundColor: `${accent}1A` }]}>
          <Text style={styles.metricLabel}>Seats</Text>
          <Text style={styles.metricValue}>{table?.capacity ?? '—'}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Ambience</Text>
          <Text style={styles.metricValue}>{ambienceCopy}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Finish</Text>
          <Text style={styles.metricValue}>{finishCopy}</Text>
        </View>
      </View>
      <View style={[styles.statusBanner, { borderColor: `${accent}55`, backgroundColor: `${accent}12` }]}>
        <Text style={[styles.statusText, { color: accent }]}>{featureCopy}</Text>
      </View>
      <View style={styles.actionRow}>
        <Pressable onPress={onClose} style={styles.secondary} accessibilityRole="button">
          <Text style={styles.secondaryText}>Close</Text>
        </Pressable>
        <Pressable
          onPress={onReserve}
          disabled={!table}
          style={[styles.primary, { backgroundColor: accent }, !table && styles.primaryDisabled]}
          accessibilityState={{ disabled: !table }}
        >
          <Text style={[styles.primaryText, !table && styles.primaryTextDisabled]}>Reserve this table</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Platform.OS === 'ios' ? colors.overlay : colors.muted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  infoColumn: {
    flex: 1,
    gap: spacing.xs,
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  drawerMeta: {
    color: colors.muted,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: colors.overlay,
    borderColor: colors.border,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  shareButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 88,
    alignItems: 'center',
  },
  shareText: {
    fontWeight: '600',
    color: colors.primaryStrong,
  },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricCard: {
    flexBasis: '30%',
    flexGrow: 1,
    minWidth: 96,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs / 2,
  },
  metricLabel: {
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  metricValue: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 15,
  },
  statusBanner: {
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
  },
  statusText: {
    fontWeight: '600',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondary: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(94, 70, 48, 0.16)',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  secondaryText: {
    color: colors.text,
    fontWeight: '600',
  },
  primary: {
    flex: 2,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  primaryDisabled: {
    opacity: 0.6,
  },
  primaryText: {
    color: '#2F1C11',
    fontWeight: '700',
  },
  primaryTextDisabled: {
    color: 'rgba(47, 28, 17, 0.65)',
  },
});

export default SeatPreviewDrawer;
