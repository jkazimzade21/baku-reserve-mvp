import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { ViewProps } from 'react-native';

import { colors, radius, shadow, spacing } from '../config/theme';

type SurfaceProps = ViewProps & {
  tone?: 'default' | 'muted' | 'overlay';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  elevated?: boolean;
  borderless?: boolean;
};

export function Surface({
  children,
  style,
  tone = 'default',
  padding = 'md',
  elevated = true,
  borderless = false,
  ...rest
}: SurfaceProps) {
  const paddingValue =
    padding === 'none'
      ? 0
      : padding === 'sm'
        ? spacing.sm
        : padding === 'lg'
          ? spacing.lg
          : spacing.md;

  return (
    <View
      style={[
        styles.base,
        toneStyles[tone],
        elevated && shadow.card,
        paddingValue ? { padding: paddingValue } : null,
        borderless && styles.borderless,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

type DividerProps = ViewProps & { inset?: boolean };

export function SurfaceDivider({ style, inset = false, ...rest }: DividerProps) {
  return (
    <View
      style={[styles.divider, inset && styles.dividerInset, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  borderless: {
    borderWidth: 0,
    borderColor: 'transparent',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  dividerInset: {
    marginLeft: spacing.md,
  },
});

const toneStyles = StyleSheet.create({
  default: {
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  muted: {
    backgroundColor: colors.surface,
    borderColor: `${colors.border}CC`,
  },
  overlay: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderColor: 'rgba(255,255,255,0.4)',
  },
});

export default Surface;
