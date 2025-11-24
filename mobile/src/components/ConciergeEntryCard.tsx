import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View, Pressable } from 'react-native';

import { colors, radius, spacing } from '../config/theme';
import ConciergePromptChip from './ConciergePromptChip';
import type { ConciergePrompt } from '../utils/concierge';

type Props = {
  prompts: ConciergePrompt[];
  onOpen: () => void;
  onSelectPrompt: (prompt: ConciergePrompt) => void;
};

export default function ConciergeEntryCard({ prompts, onOpen, onSelectPrompt }: Props) {
  const heroPrompts = prompts.slice(0, 3);

  return (
    <LinearGradient
      colors={['#FFF4EB', '#F7E1D5']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.badgeRow}>
        <View style={styles.badgeIcon}>
          <Feather name="star" size={16} color={colors.primaryStrong} />
        </View>
        <Text style={styles.badgeText}>Concierge</Text>
      </View>
      <Text style={styles.title}>Tell us the plan, we’ll curate in seconds.</Text>
      <Text style={styles.subtitle}>Pick a vibe or ask anything. We’ll suggest tables you can book right now.</Text>

      <View style={styles.promptRow}>
        {heroPrompts.map((prompt) => (
          <ConciergePromptChip
            key={prompt.id}
            label={prompt.title}
            helper={prompt.subtitle}
            onPress={() => onSelectPrompt(prompt)}
          />
        ))}
      </View>

      <Pressable style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]} onPress={onOpen}>
        <Text style={styles.ctaLabel}>Open concierge</Text>
        <Feather name="arrow-up-right" size={16} color={colors.text} />
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  badgeIcon: {
    padding: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: {
    fontWeight: '700',
    color: colors.primaryStrong,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 28,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
  },
  promptRow: {
    flexDirection: 'column',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  cta: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ctaPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  ctaLabel: {
    fontWeight: '700',
    color: colors.text,
    fontSize: 15,
  },
});
