import React, { useCallback, useState } from 'react';
import { Dimensions, Image, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../config/theme';
import { asImageSource, type PhotoLike } from '../utils/photoSources';

type Props = {
  photos: PhotoLike[];
  height?: number;
};

const { width: screenWidth } = Dimensions.get('window');
const DEFAULT_SLIDE_WIDTH = screenWidth - spacing.lg * 2;

export default function PhotoCarousel({ photos, height = 240 }: Props) {
  const [index, setIndex] = useState(0);
  const [containerWidth, setContainerWidth] = useState(DEFAULT_SLIDE_WIDTH);

  if (!photos.length) {
    return null;
  }

  return (
    <View
      style={[styles.wrapper, { height }]}
      onLayout={useCallback(
        (event: LayoutChangeEvent) => {
          const nextWidth = event.nativeEvent.layout.width;
          if (nextWidth > 0 && Math.abs(nextWidth - containerWidth) > 1) {
            setContainerWidth(nextWidth);
          }
        },
        [containerWidth],
      )}
    >
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={containerWidth}
        decelerationRate="fast"
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          const offsetX = event.nativeEvent.contentOffset.x;
          const nextIndex = Math.round(offsetX / (containerWidth || 1));
          if (nextIndex !== index) {
            setIndex(nextIndex);
          }
        }}
        scrollEventThrottle={16}
      >
        {photos.map((photo, idx) => {
          const source = asImageSource(photo);
          const key =
            typeof source === 'number'
              ? `static-${source}`
              : `uri-${(source as { uri?: string }).uri ?? `index-${idx}`}`;
          return <Image key={key} source={source} style={[styles.image, { width: containerWidth, height }]} />;
        })}
      </ScrollView>
      <View style={styles.pagination}>
        <Text style={styles.paginationText}>
          {index + 1} / {photos.length}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.card,
    width: '100%',
  },
  image: {
    resizeMode: 'cover',
  },
  pagination: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  paginationText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
});
