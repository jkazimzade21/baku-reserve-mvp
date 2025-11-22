import React, { useCallback } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import ConciergeAssistantCard from '../components/ConciergeAssistantCard';
import { colors, spacing } from '../config/theme';
import type { RootStackParamList } from '../types/navigation';
import { useRestaurantDirectory } from '../contexts/RestaurantDirectoryContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Concierge'>;

export default function ConciergeScreen({ navigation, route }: Props) {
  const { restaurants } = useRestaurantDirectory();
  const handleSelect = useCallback(
    (restaurant) => {
      navigation.navigate('Restaurant', { id: restaurant.id, name: restaurant.name });
    },
    [navigation],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ConciergeAssistantCard
          restaurants={restaurants}
          onSelect={handleSelect}
          initialPrompt={route.params?.prompt}
          autoSubmitPrompt={Boolean(route.params?.prompt)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
  },
});
