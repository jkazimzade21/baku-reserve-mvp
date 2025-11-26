import React from 'react';
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../config/theme';
import type { ConciergePrompt } from '../utils/concierge';

export type PromptLike =
  | ConciergePrompt
  | { id: string; label?: string; title?: string; subtitle?: string; helper?: string }
  | string;

type Props = {
  prompts: PromptLike[];
  onOpen: () => void;
  onSelectPrompt: (prompt: PromptLike) => void;
  title?: string;
  subtitle?: string;
  buttonLabel?: string;
};

const labelForPrompt = (prompt: PromptLike) => {
  if (typeof prompt === 'string') return prompt;
  return prompt.title ?? (prompt as any).label ?? prompt.id;
};

const helperForPrompt = (prompt: PromptLike) => {
  if (typeof prompt === 'string') return undefined;
  return (prompt as any).subtitle ?? (prompt as any).helper;
};

export default function ConciergeEntryCard({
  prompts,
  onOpen,
  onSelectPrompt,
  title = 'Plan your night',
  subtitle = 'Share the mood and I’ll stage a table that feels special.',
  buttonLabel = 'Open Concierge',
}: Props) {
  const heroPrompts = prompts.slice(0, 6);

  return (
    <View style={styles.container}>
      <View style={styles.backplate} pointerEvents="none" />
      <View style={styles.panel}>
        <View style={styles.pillow} pointerEvents="none" />
        <View style={styles.ridge} pointerEvents="none" />

        <View style={styles.content}>
          <View style={styles.iconRow}>
            <View style={styles.iconBadge}>
              <Feather name="star" size={18} color="#FFF" />
            </View>
            <Text style={styles.badgeText}>Concierge</Text>
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
            onPress={(event) => {
              event.stopPropagation();
              onOpen();
            }}
          >
            <Text style={styles.primaryButtonText}>{buttonLabel}</Text>
            <Feather name="arrow-up-right" size={14} color={colors.royalDeep} />
          </Pressable>

          <View style={styles.chipRow}>
            {heroPrompts.map((prompt) => (
              <Pressable
                key={labelForPrompt(prompt)}
                style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                onPress={(event) => {
                  event.stopPropagation();
                  onSelectPrompt(prompt);
                }}
                accessibilityRole="button"
              >
                <Text style={styles.chipText}>{labelForPrompt(prompt)}</Text>
                {helperForPrompt(prompt) ? (
                  <Text style={styles.chipHelper}>{helperForPrompt(prompt)}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginHorizontal: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.primaryStrong,
    shadowColor: colors.primaryStrong,
    shadowOpacity: 0.26,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 14,
  },
  backplate: {
    position: 'absolute',
    top: 12,
    left: 10,
    right: -6,
    bottom: -10,
    backgroundColor: colors.primaryStrong,
    borderRadius: radius.lg + 6,
    shadowColor: colors.primaryStrong,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 9,
  },
  panel: {
    position: 'relative',
    padding: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowColor: colors.primaryStrong,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  pillow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  ridge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  content: {
    gap: spacing.md,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    shadowColor: colors.royalDeep,
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.royalDeep,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.royalDeep,
    lineHeight: 28,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(42,21,15,0.82)',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
  },
  primaryButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  primaryButtonText: {
    color: colors.royalDeep,
    fontWeight: '700',
    fontSize: 14,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  chip: {
    backgroundColor: 'rgba(42,21,15,0.07)',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.royalHighlight,
  },
  chipPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  chipText: {
    color: colors.royalDeep,
    fontSize: 12,
    fontWeight: '600',
  },
  chipHelper: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
});
