import React from 'react';
import { View, Text, StyleSheet, Pressable, GestureResponderEvent } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { colors, spacing, radius, shadow } from '../config/theme';
import { track } from '../utils/analytics';

const DEFAULT_PROMPTS = [
  'Date night on a rooftop',
  'Budget-friendly seafood',
  'Live music tonight',
  'Family brunch with a view',
];

type Props = {
  onPress: () => void;
  prompts?: string[];
  onPromptSelect?: (prompt: string) => void;
  title?: string;
  subtitle?: string;
  buttonLabel?: string;
};

export default function ConciergeEntryCard({
  onPress,
  prompts = DEFAULT_PROMPTS,
  onPromptSelect,
  title = 'Not sure where to go?',
  subtitle = 'Ask Concierge and we’ll shortlist a few tables.',
  buttonLabel = 'Open Concierge',
}: Props) {
  const handleOpen = () => {
    Haptics.selectionAsync().catch(() => {});
    track('concierge_open', { surface: 'explore_card' });
    onPress();
  };

  const handlePromptPress = (event: GestureResponderEvent, prompt: string) => {
    event.stopPropagation();
    Haptics.selectionAsync().catch(() => {});
    track('concierge_open', { surface: 'explore_chip', prompt });
    onPromptSelect?.(prompt);
  };

  return (
    <Pressable style={styles.container} onPress={handleOpen} accessibilityRole="button">
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
            style={styles.primaryButton}
            onPress={(event) => {
              event.stopPropagation();
              handleOpen();
            }}
          >
            <Text style={styles.primaryButtonText}>{buttonLabel}</Text>
            <Feather name="arrow-up-right" size={14} color={colors.text} />
          </Pressable>

          <View style={styles.chipRow}>
            {prompts.slice(0, 6).map((prompt) => (
              <Pressable
                key={prompt}
                style={styles.chip}
                onPress={(event) => handlePromptPress(event, prompt)}
                accessibilityRole="button"
              >
                <Text style={styles.chipText}>{prompt}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    ...shadow.card,
    overflow: 'hidden',
  },
  gradient: {
    padding: spacing.lg,
    gap: spacing.md,
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
  chipText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '500',
  },
});
