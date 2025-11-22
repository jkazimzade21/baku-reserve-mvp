import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, spacing, shadow } from '../config/theme';

type Props = {
  title: string;
  date: string;
  imageSource?: any;
  onPress: () => void;
};

export default function FeaturedEventCard({ title, date, imageSource, onPress }: Props) {
  return (
    <Pressable style={styles.container} onPress={onPress}>
      <Image
        source={imageSource ?? { uri: 'https://via.placeholder.com/300x150' }}
        style={styles.image}
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        style={styles.gradient}
      />
      <View style={styles.content}>
        <Text style={styles.dateBadge}>{date}</Text>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 260,
    height: 160,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    overflow: 'hidden',
    marginRight: spacing.md,
    ...shadow.subtle,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
    top: '30%',
  },
  content: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
    gap: spacing.xs,
  },
  dateBadge: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
