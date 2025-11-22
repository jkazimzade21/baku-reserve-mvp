import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import type { ConciergeMode, RestaurantSummary } from '../api';
import { CONCIERGE_MODE, fetchConciergeRecommendations } from '../api';
import { colors, radius, shadow, spacing } from '../config/theme';
import { recommendRestaurants } from '../utils/conciergeRecommender';
import { defaultFallbackSource, resolveRestaurantPhotos } from '../utils/photoSources';

type Props = {
  restaurants: RestaurantSummary[];
  onSelect: (restaurant: RestaurantSummary) => void;
  initialPrompt?: string;
  autoSubmitPrompt?: boolean;
};

const ideaStarters = [
  'Romantic skyline dinner with cocktails',
  'Family-friendly brunch in the Old City',
  'Chill waterfront seafood around 70 AZN',
  'Client dinner that feels upscale but relaxed',
  'Traditional tea house breakfast with backgammon',
];

type Status = 'idle' | 'thinking' | 'done';

type ConciergeMatch = {
  restaurant: RestaurantSummary;
  reasons: string[];
  source: 'api' | 'local';
  explanation?: string | null;
};

const detectLanguage = (value: string): 'en' | 'az' | 'ru' | undefined => {
  if (!value) return undefined;
  if (/[əığöüşç]/i.test(value)) return 'az';
  if (/[А-Яа-яЁё]/.test(value)) return 'ru';
  return undefined;
};

export default function ConciergeAssistantCard({ restaurants, onSelect, initialPrompt, autoSubmitPrompt }: Props) {
  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [status, setStatus] = useState<Status>('idle');
  const [results, setResults] = useState<ConciergeMatch[]>([]);
  const [lastQuery, setLastQuery] = useState('');
  const [resultSource, setResultSource] = useState<'api' | 'local' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const prefillRef = useRef<string | null>(null);
  const conciergeMode = (CONCIERGE_MODE as ConciergeMode) || 'ai';
  const shouldUseApi = conciergeMode !== 'local';

  const buildLocalMatches = (query: string) =>
    recommendRestaurants(query, restaurants, 4).map((restaurant) => ({
      restaurant,
      source: 'local' as const,
      reasons: [],
      explanation: undefined,
    }));

  const runQuery = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setStatus('idle');
      setResults([]);
      setLastQuery('');
      setResultSource(null);
      setErrorMessage(null);
      return;
    }
    setStatus('thinking');
    setLastQuery(trimmed);
    setErrorMessage(null);
    if (!shouldUseApi) {
      setErrorMessage('AI Concierge is in offline mode. Showing on-device picks.');
      const picks = buildLocalMatches(trimmed);
      setResults(picks);
      setResultSource('local');
      setStatus('done');
      return;
    }
    try {
      const response = await fetchConciergeRecommendations(trimmed, {
        limit: 4,
        mode: conciergeMode,
        lang: detectLanguage(trimmed),
      });
      const reasonMap = response.match_reason || {};
      const explanationMap = response.explanations || {};
      const responseMode = response.mode ?? (shouldUseApi ? 'ai' : 'local');
      if (shouldUseApi && responseMode === 'local') {
        setErrorMessage('Friendly AI is reconnecting — showing local picks for now.');
      }
      let mapped: ConciergeMatch[] = response.results.map((restaurant) => {
        const key = (restaurant.slug ?? restaurant.id).toLowerCase();
        return {
          restaurant,
          reasons: reasonMap[key] ?? [],
          explanation: explanationMap[key],
          source: responseMode === 'local' ? ('local' as const) : ('api' as const),
        };
      });
      if (mapped.length === 0) {
        mapped = buildLocalMatches(trimmed);
      }
      setResults(mapped);
      setResultSource(mapped.length > 0 ? mapped[0].source : null);
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        console.warn('Concierge query failed', error);
      }
      setErrorMessage('Using on-device matches while Concierge reconnects.');
      const picks = buildLocalMatches(trimmed);
      setResults(picks);
      setResultSource('local');
    } finally {
      setStatus('done');
    }
  };

  useEffect(() => {
    if (!lastQuery || resultSource !== 'local') {
      return;
    }
    const picks = buildLocalMatches(lastQuery);
    setResults(picks);
    setStatus('done');
    setResultSource('local');
  }, [restaurants, lastQuery, resultSource]);

  useEffect(() => {
    if (typeof initialPrompt !== 'string') {
      return;
    }
    if (prefillRef.current === initialPrompt) {
      return;
    }
    setPrompt(initialPrompt);
    prefillRef.current = initialPrompt;
    if (autoSubmitPrompt && initialPrompt.trim().length) {
      void runQuery(initialPrompt);
    }
  }, [autoSubmitPrompt, initialPrompt]);

  const handleIdeaPress = (idea: string) => {
    setPrompt(idea);
    void runQuery(idea);
  };

  const kickerText = !shouldUseApi
    ? 'Guided picks'
    : resultSource === 'local'
      ? 'Concierge fallback'
      : 'New • Friendly AI';

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>{kickerText}</Text>
      <Text style={styles.title}>Describe the vibe</Text>
      <Text style={styles.subtitle}>
        Mention price, neighbourhood, mood, or anything else and Table Scout will suggest a few spots.
      </Text>
      <TextInput
        value={prompt}
        multiline
        placeholder="E.g. Cozy garden dinner for two under 80 AZN"
        placeholderTextColor={colors.muted}
        onChangeText={setPrompt}
        style={styles.input}
        testID="concierge-input"
      />
      <Pressable
        style={styles.button}
        onPress={() => void runQuery(prompt)}
        testID="concierge-submit"
        accessibilityRole="button"
      >
        <Feather name="zap" size={16} color="#fff" />
        <Text style={styles.buttonText}>Show matches</Text>
      </Pressable>
      <View style={styles.chipWrap}>
        {ideaStarters.map((idea) => (
          <Pressable key={idea} style={styles.ideaChip} onPress={() => handleIdeaPress(idea)}>
            <Text style={styles.ideaText}>{idea}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.resultsBlock} testID="concierge-results">
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        {status === 'thinking' ? (
          <View style={styles.resultLoading}>
            <ActivityIndicator color={colors.primaryStrong} />
            <Text style={styles.resultHint}>Pulling a short list…</Text>
          </View>
        ) : results.length > 0 ? (
          <View style={styles.resultList}>
            {results.map((match) => {
              const restaurant = match.restaurant;
              const bundle = resolveRestaurantPhotos(restaurant);
              const source = bundle.cover || bundle.gallery[0] || defaultFallbackSource;
              return (
                <Pressable
                  key={restaurant.id}
                  style={styles.resultCard}
                  onPress={() => onSelect(restaurant)}
                  testID={`concierge-result-${(restaurant.slug ?? restaurant.id).toLowerCase()}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Concierge match ${restaurant.name}`}
                >
                  <Image source={source} style={styles.resultImage} />
                  <View style={styles.resultCopy}>
                    <Text style={styles.resultName}>{restaurant.name}</Text>
                    <Text style={styles.resultMeta} numberOfLines={2}>
                      {restaurant.short_description || restaurant.cuisine?.join(' • ')}
                    </Text>
                    {match.explanation ? (
                      <Text style={styles.resultExplanation}>{match.explanation}</Text>
                    ) : null}
                    {match.reasons.length > 0 ? (
                      <View style={styles.reasonChipRow}>
                        {match.reasons.map((chip) => (
                          <View key={`${restaurant.id}-${chip}`} style={styles.reasonChip}>
                            <Text style={styles.reasonChipText}>{chip}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    <Text style={styles.resultTags}>
                      {[restaurant.price_level, restaurant.cuisine?.[0], restaurant.city]
                        .filter(Boolean)
                        .join(' • ')}
                    </Text>
                    {match.source === 'local' ? (
                      <Text style={styles.resultBadge}>On-device pick</Text>
                    ) : null}
                  </View>
                  <Feather name="arrow-right" size={18} color={colors.primaryStrong} />
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={styles.resultHint}>Tell us what you’re craving and we’ll narrow it down.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  kicker: {
    color: colors.primaryStrong,
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    color: colors.muted,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 16,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.primaryStrong,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  ideaChip: {
    backgroundColor: colors.overlay,
    borderRadius: radius.lg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  ideaText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  resultsBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  errorText: {
    color: colors.info,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  resultHint: {
    color: colors.muted,
    fontStyle: 'italic',
  },
  resultLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  resultList: {
    gap: spacing.sm,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultImage: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
  },
  resultCopy: {
    flex: 1,
    gap: 4,
  },
  resultName: {
    fontWeight: '700',
    color: colors.text,
  },
  resultMeta: {
    color: colors.muted,
    fontSize: 13,
  },
  resultExplanation: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  reasonChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  reasonChip: {
    backgroundColor: colors.overlay,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  reasonChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryStrong,
  },
  resultTags: {
    color: colors.muted,
    fontSize: 12,
  },
  resultBadge: {
    marginTop: 2,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.overlay,
    color: colors.mutedStrong,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
});
