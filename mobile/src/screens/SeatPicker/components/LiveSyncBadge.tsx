import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../../../config/theme';

type Props = {
  updatedAt: Date | null;
  syncing: boolean;
  error?: string | null;
  onSync: () => void;
};

const formatRelative = (updatedAt: Date | null) => {
  if (!updatedAt) {
    return 'Awaiting sync';
  }
  const delta = Date.now() - updatedAt.getTime();
  if (delta < 2_000) return 'Updated just now';
  if (delta < 60_000) return `Updated ${Math.floor(delta / 1_000)}s ago`;
  const minutes = Math.floor(delta / 60_000);
  return `Updated ${minutes}m ago`;
};

export function LiveSyncBadge({ updatedAt, syncing, error, onSync }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const label = useMemo(() => formatRelative(updatedAt), [updatedAt]);

  return (
    <View style={[styles.container, error ? styles.errorContainer : null]}>
      <Animated.View
        style={[
          styles.wave,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
            transform: [
              {
                scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.1] }),
              },
            ],
          },
        ]}
      />
      <View style={styles.textColumn}>
        <Text style={styles.label}>{label}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : <Text style={styles.subtle}>Live availability</Text>}
      </View>
      <Pressable style={styles.button} onPress={onSync} disabled={syncing}>
        <Text style={[styles.buttonText, syncing && styles.buttonTextMuted]}>{syncing ? 'Syncing…' : 'Sync now'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.overlay,
  },
  errorContainer: {
    backgroundColor: 'rgba(214, 91, 74, 0.16)',
  },
  wave: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primaryStrong,
  },
  textColumn: {
    flex: 1,
  },
  label: {
    fontWeight: '600',
    color: colors.text,
  },
  subtle: {
    color: colors.muted,
    fontSize: 12,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  button: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.primaryStrong,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
  buttonTextMuted: {
    opacity: 0.6,
  },
});

export default LiveSyncBadge;
