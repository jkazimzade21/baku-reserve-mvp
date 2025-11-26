import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScrollToTop } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { colors, radius, spacing } from '../config/theme';
import ConciergePromptChip from '../components/ConciergePromptChip';
import RestaurantCard from '../components/RestaurantCard';
import { filterHiddenRestaurants, isHiddenRestaurant } from '../constants/hiddenRestaurants';
import { useRestaurantDirectory } from '../contexts/RestaurantDirectoryContext';
import {
  CONCIERGE_PROMPTS,
  DEFAULT_PROMPT,
  BookingIntent,
  ConciergePrompt,
  detectBookingIntent,
  deriveFiltersFromText,
  findPromptById,
  recommendForPrompt,
  recommendForText,
  filtersSummary,
  getConciergeMode,
} from '../utils/concierge';
import { fetchConcierge, type ConciergeResult, type RestaurantSummary } from '../api';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { track } from '../utils/analytics';

type Props = NativeStackScreenProps<RootStackParamList, 'Concierge'>;

type Message = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  suggestions?: RestaurantSummary[];
  bookingCandidate?: BookingIntent;
};

const mapConciergeResultToRestaurant = (entry: ConciergeResult): RestaurantSummary => ({
  id: entry.id,
  name: entry.name,
  neighborhood: entry.area ?? undefined,
  address: entry.address ?? undefined,
  price_level: entry.price_label ?? undefined,
  tags: entry.tags ?? undefined,
  instagram: entry.instagram ?? undefined,
  short_description: entry.summary ?? undefined,
  contact: {
    address: entry.address ?? undefined,
    phone: undefined,
    website: entry.website ?? undefined,
  },
});

const initialMessage: Message = {
  id: 'intro',
  role: 'assistant',
  text: 'Tell me the mood, cuisine, or size of your group. I will shortlist great tables you can book right now.',
};

export default function ConciergeScreen({ navigation, route }: Props) {
  const { restaurants } = useRestaurantDirectory();
  const discoverableRestaurants = useMemo(
    () => filterHiddenRestaurants(restaurants),
    [restaurants],
  );
  const conciergeMode = useMemo(() => getConciergeMode(), []);
  const conciergeIsRemote = conciergeMode !== 'local';
  const [input, setInput] = useState(route.params?.initialText ?? '');
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [thinking, setThinking] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  // Ensure we only auto-run the initial prompt once when opening via shortcut.
  const hydratedRef = useRef(false);

  const curatedPrompts = useMemo(
    () => CONCIERGE_PROMPTS.filter((p) => !['chef_table', 'seaside'].includes(p.id)).slice(0, 4),
    [],
  );

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const pushMessages = useCallback((entries: Message[]) => {
    setMessages((prev) => [...prev, ...entries]);
  }, []);

  const buildAssistantReply = useCallback(
    (prompt: ConciergePrompt, suggestions: RestaurantSummary[], summary?: string, relaxed?: boolean) => {
      if (prompt.responseHint) return prompt.responseHint;
      if (summary && suggestions.length) {
        return `${relaxed ? 'Closest matches' : 'Here are spots'} for ${summary}.`;
      }
      if (suggestions.length === 0) {
        return 'I could not find a perfect fit yet, but here are a few versatile picks to start with.';
      }
      const names = suggestions.map((r) => r.name).slice(0, 2).join(', ');
      return `Here are spots that match. ${names ? `Start with ${names}.` : ''}`.trim();
    },
    [],
  );

  const buildLocalPromptSuggestions = useCallback(
    (prompt: ConciergePrompt) => {
      const suggestions = recommendForPrompt(prompt, discoverableRestaurants, 4);
      const text = buildAssistantReply(prompt, suggestions);
      return { suggestions, text };
    },
    [buildAssistantReply, discoverableRestaurants],
  );

  const buildLocalDiscoverySuggestions = useCallback(
    (text: string) => {
      const filters = deriveFiltersFromText(text, discoverableRestaurants);
      const result = recommendForText(text, discoverableRestaurants, 4);
      const suggestions = result.items;
      const summary = result.summary ?? filtersSummary(filters);
      const reply = result.needsMoreInfo
        ? 'Tell me a vibe, cuisine, budget, or neighborhood and I’ll shortlist options.'
        : buildAssistantReply(DEFAULT_PROMPT, suggestions, summary || undefined, result.relaxed);
      return { suggestions, text: reply, needsMoreInfo: result.needsMoreInfo };
    },
    [buildAssistantReply, discoverableRestaurants],
  );

  const respondPrompt = useCallback(
    async (prompt: ConciergePrompt, userCopy?: string, trackEvent = true) => {
      const userText = userCopy ?? prompt.title;
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        text: userText,
      };

      pushMessages([userMessage]);
      setThinking(true);

      if (trackEvent) {
        track('concierge_open', {
          source: userCopy ? 'freeform' : 'prompt',
          prompt: prompt.id,
          mode: conciergeMode,
        });
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      if (conciergeIsRemote) {
        try {
          const res = await fetchConcierge(userText, 4);
          const suggestions = res.results
            .map(mapConciergeResultToRestaurant)
            .filter((restaurant) => !isHiddenRestaurant(restaurant));
          const assistantMessage: Message = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            text: res.message || buildAssistantReply(prompt, suggestions),
            suggestions,
          };
          pushMessages([assistantMessage]);
          setThinking(false);
          return;
        } catch (err) {
          console.warn('Concierge remote prompt failed, falling back to local', err);
        }
      }

      const local = buildLocalPromptSuggestions(prompt);
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: local.text,
        suggestions: local.suggestions,
      };
      pushMessages([assistantMessage]);
      setThinking(false);
    },
    [buildAssistantReply, buildLocalPromptSuggestions, conciergeIsRemote, conciergeMode, pushMessages],
  );

  const respondDiscovery = useCallback(
    async (text: string, trackEvent = true) => {
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        text,
      };

      pushMessages([userMessage]);
      setThinking(true);

      if (trackEvent) {
        track('concierge_suggest', { source: 'freeform', mode: conciergeMode });
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      if (conciergeIsRemote) {
        try {
          const res = await fetchConcierge(text, 4);
          const suggestions = res.results
            .map(mapConciergeResultToRestaurant)
            .filter((restaurant) => !isHiddenRestaurant(restaurant));
          const assistantMessage: Message = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            text: res.message || buildAssistantReply(DEFAULT_PROMPT, suggestions),
            suggestions,
          };
          pushMessages([assistantMessage]);
          setThinking(false);
          return;
        } catch (err) {
          console.warn('Concierge remote discovery failed, falling back to local', err);
        }
      }

      const local = buildLocalDiscoverySuggestions(text);
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: local.text,
        suggestions: local.needsMoreInfo ? undefined : local.suggestions,
      };
      pushMessages([assistantMessage]);
      setThinking(false);
    },
    [buildAssistantReply, buildLocalDiscoverySuggestions, conciergeIsRemote, conciergeMode, pushMessages],
  );

  const respondBooking = useCallback(
    (intent: BookingIntent, userCopy: string, trackEvent = true) => {
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        text: userCopy,
      };

      const restaurant = intent.restaurant;
      const title = restaurant ? restaurant.name : 'that spot';
      const timeLabel = intent.time ? ` at ${intent.time}` : '';
      const partyLabel = intent.partySize ? ` for ${intent.partySize}` : '';
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: restaurant
          ? `I can start a booking at ${title}${partyLabel}${timeLabel}.`
          : 'Tell me which restaurant to book and I will open the booking screen.',
        suggestions: restaurant ? [restaurant] : undefined,
        bookingCandidate: intent,
      };

      pushMessages([userMessage]);
      setThinking(true);
      if (trackEvent) {
        track('concierge_book_intent', {
          has_restaurant: Boolean(restaurant),
          party_size: intent.partySize,
          time: intent.time,
        });
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      setTimeout(() => {
        pushMessages([assistantMessage]);
        setThinking(false);
      }, 80);
    },
    [pushMessages],
  );

  const handlePrompt = useCallback(
    (prompt: ConciergePrompt, trackEvent = true) => {
      respondPrompt(prompt, undefined, trackEvent);
    },
    [respondPrompt],
  );

  const handleFreeform = useCallback(
    (value: string, trackEvent = true) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      setInput('');

      const maybeBooking = detectBookingIntent(trimmed, restaurants);
      if (maybeBooking) {
        respondBooking(maybeBooking, trimmed, trackEvent);
        return;
      }

      respondDiscovery(trimmed, trackEvent);
    },
    [respondBooking, respondDiscovery, restaurants],
  );

  const handlePressSuggestion = useCallback(
    (restaurant: RestaurantSummary) => {
      navigation.navigate('Restaurant', { id: restaurant.id, name: restaurant.name });
    },
    [navigation],
  );

  const handleBookCandidate = useCallback(
    (intent: BookingIntent) => {
      if (!intent.restaurant) return;
      navigation.navigate('Book', { id: intent.restaurant.id, name: intent.restaurant.name });
    },
    [navigation],
  );

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const promptFromRoute = findPromptById(route.params?.promptId ?? null);
    if (promptFromRoute) {
      handlePrompt(promptFromRoute, false);
      return;
    }
    if (route.params?.initialText) {
      handleFreeform(route.params.initialText, false);
    }
  }, [handleFreeform, handlePrompt, route.params]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.topBar}>
            <Pressable style={styles.backRow} onPress={() => navigation.goBack()} hitSlop={8}>
              <Feather name="arrow-left" size={18} color={colors.royalDeep} />
              <Text style={styles.backLabel}>Explore</Text>
            </Pressable>
          </View>

          <View style={styles.hero}>
            <Text style={styles.heroTitle}>Plan your night.</Text>
            <Text style={styles.heroSubtitle}>
              Tell me the mood, guests, and time. I’ll line up the kind of table that feels like a treat.
            </Text>

            <View style={styles.promptGrid}>
              {curatedPrompts.map((prompt) => (
                <View key={prompt.id} style={styles.promptTile}>
                  <ConciergePromptChip
                    label={prompt.title}
                    helper={prompt.subtitle}
                    onPress={() => handlePrompt(prompt)}
                    compact
                  />
                </View>
              ))}
            </View>
          </View>

          {messages.map((message) => {
            const isAssistant = message.role === 'assistant';
            const needsFullWidth = isAssistant && Boolean(message.suggestions?.length || message.bookingCandidate);
            return (
              <View
                key={message.id}
                style={[
                  styles.bubble,
                  isAssistant ? styles.assistantBubble : styles.userBubble,
                  needsFullWidth && styles.wideBubble,
                ]}
              >
                <Text style={[styles.bubbleText, isAssistant ? styles.assistantText : styles.userText]}>{message.text}</Text>
                {isAssistant && message.bookingCandidate?.restaurant ? (
                  <Pressable
                    style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
                    onPress={() => handleBookCandidate(message.bookingCandidate!)}
                  >
                    <Text style={styles.ctaLabel}>Book {message.bookingCandidate.restaurant.name}</Text>
                    <Feather name="arrow-up-right" size={16} color={colors.text} />
                  </Pressable>
                ) : null}
                {isAssistant && message.suggestions && message.suggestions.length ? (
                  <View style={styles.suggestionBlock}>
                    <Text style={styles.suggestionTitle}>Suggested for you</Text>
                    <View style={styles.suggestionList}>
                      {message.suggestions.map((restaurant) => (
                        <RestaurantCard
                          key={restaurant.id}
                          item={restaurant}
                          onPress={() => handlePressSuggestion(restaurant)}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}

          {thinking ? (
            <View style={[styles.bubble, styles.assistantBubble]}>
              <Text style={[styles.bubbleText, styles.assistantText]}>Picking options…</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            placeholder="Ask for a vibe, cuisine, or group size"
            placeholderTextColor={colors.muted}
            value={input}
            onChangeText={setInput}
            returnKeyType="send"
            onSubmitEditing={() => handleFreeform(input)}
          />
          <Pressable style={({ pressed }) => [styles.sendButton, pressed && styles.sendButtonPressed]} onPress={() => handleFreeform(input)}>
            <Feather name="arrow-up-right" size={20} color={colors.royalDeep} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  topBar: {
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  backLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.royalDeep,
  },
  hero: {
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
    gap: spacing.sm,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.royalDeep,
    lineHeight: 32,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 15,
    color: colors.mutedStrong,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  promptGrid: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  promptTile: {
    width: '48%',
  },
  bubble: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    maxWidth: '75%',
  },
  assistantBubble: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: radius.sm,
  },
  userBubble: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryStrong,
    alignSelf: 'flex-end',
    borderBottomRightRadius: radius.sm,
  },
  wideBubble: {
    maxWidth: '100%',
    alignSelf: 'stretch',
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  assistantText: {
    color: colors.text,
  },
  userText: {
    color: colors.royalDeep,
    fontWeight: '600',
  },
  suggestionBlock: {
    gap: spacing.sm,
  },
  suggestionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  suggestionList: {
    gap: spacing.sm,
  },
  cta: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
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
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
    color: colors.text,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primaryStrong,
  },
  sendButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});
