import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
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
  title = 'Not sure where to go?',
  subtitle = 'Ask Concierge and we’ll shortlist a few tables.',
  buttonLabel = 'Open Concierge',
}: Props) {
  const heroPrompts = prompts.slice(0, 6);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1F1B16', '#111014']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
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
            <Feather name="arrow-up-right" size={14} color={colors.text} />
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
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  gradient: {
    padding: spacing.lg,
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
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFF',
    lineHeight: 28,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
  },
  primaryButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  primaryButtonText: {
    color: colors.text,
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
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  chipPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  chipText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  chipHelper: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    marginTop: 2,
  },
});
