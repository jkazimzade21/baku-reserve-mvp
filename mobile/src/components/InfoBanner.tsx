import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ViewProps } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { colors, radius, spacing } from '../config/theme';

type InfoBannerProps = ViewProps & {
  tone?: 'info' | 'success' | 'warning';
  title: string;
  message?: string;
  icon?: keyof typeof Feather.glyphMap;
};

export default function InfoBanner({
  tone = 'info',
  title,
  message,
  icon,
  style,
  ...rest
}: InfoBannerProps) {
  const palette = toneStyles[tone];

  return (
    <View style={[styles.container, palette.container, style]} {...rest}>
      {icon ? <Feather name={icon} size={18} color={palette.iconColor} /> : null}
      <View style={styles.textColumn}>
        <Text style={[styles.title, { color: palette.textColor }]}>{title}</Text>
        {message ? (
          <Text style={[styles.message, { color: palette.subduedColor }]}>{message}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    alignItems: 'flex-start',
  },
  textColumn: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  message: {
    fontSize: 13,
  },
});

const toneStyles = {
  info: {
    container: {
      backgroundColor: `${colors.info}1A`,
    },
    textColor: colors.info,
    subduedColor: `${colors.info}CC`,
    iconColor: colors.info,
  },
  success: {
    container: {
      backgroundColor: `${colors.success}1F`,
    },
    textColor: colors.success,
    subduedColor: `${colors.success}CC`,
    iconColor: colors.success,
  },
  warning: {
    container: {
      backgroundColor: `${colors.primaryStrong}14`,
    },
    textColor: colors.primaryStrong,
    subduedColor: `${colors.primaryStrong}CC`,
    iconColor: colors.primaryStrong,
  },
} as const;
