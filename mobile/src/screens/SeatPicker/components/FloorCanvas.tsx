import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Polygon, Rect, Stop } from 'react-native-svg';

import type { AreaDetail, TableDetail } from '../../../api';
import { colors, radius } from '../../../config/theme';
import { hexToRgba } from '../../../utils/color';
import type { TableStatus } from '../useVenueLayout';
import { TableMarker, TableMarkerLayer } from './TableMarker';

const MIN_SCALE = 0.8;
const MAX_SCALE = 3.1;

type Transform = {
  scale: number;
  translateX: number;
  translateY: number;
};

type Props = {
  area: AreaDetail;
  tables: TableDetail[];
  getStatus: (id: string) => TableStatus;
  onSelectTable: (table: TableDetail) => void;
  onPreviewTable: (table: TableDetail, anchor: { x: number; y: number }) => void;
  transform: Transform;
  onTransformChange: (next: Transform) => void;
};

export function FloorCanvas({
  area,
  tables,
  getStatus,
  onSelectTable,
  onPreviewTable,
  transform,
  onTransformChange,
}: Props) {
  const accentHex = area.theme?.accent ?? colors.primaryStrong;
  const ambient = area.theme?.ambientLight ?? hexToRgba(accentHex, 0.22);
  const gradientStart = ambient;
  const gradientEnd = hexToRgba(colors.background, 0.85);
  const landmarkFill = hexToRgba(accentHex, 0.18);
  const landmarkStroke = hexToRgba(accentHex, 0.42);

  const scale = useSharedValue(transform.scale);
  const translateX = useSharedValue(transform.translateX);
  const translateY = useSharedValue(transform.translateY);

  useEffect(() => {
    scale.value = transform.scale;
    translateX.value = transform.translateX;
    translateY.value = transform.translateY;
  }, [transform, scale, translateX, translateY]);

  const clampTranslation = (value: number) => {
    'worklet';
    const limit = 120 * (scale.value - 1);
    return Math.max(-limit, Math.min(limit, value));
  };

  const persist = () => {
    'worklet';
    runOnJS(onTransformChange)({
      scale: scale.value,
      translateX: translateX.value,
      translateY: translateY.value,
    });
  };

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onChange((event) => {
      translateX.value = clampTranslation(translateX.value + event.changeX);
      translateY.value = clampTranslation(translateY.value + event.changeY);
    })
    .onEnd((event) => {
      translateX.value = withDecay({ velocity: event.velocityX, clamp: [-160, 160], deceleration: 0.995 }, persist);
      translateY.value = withDecay({ velocity: event.velocityY, clamp: [-160, 160], deceleration: 0.995 }, persist);
    })
    .onFinalize(persist);

  const pinch = Gesture.Pinch()
    .onChange((event) => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.value * event.scale));
      scale.value = next;
    })
    .onEnd(() => {
      scale.value = withSpring(scale.value, { damping: 18, stiffness: 140 }, persist);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onBegin(() => {
      const target = Math.min(MAX_SCALE, scale.value * 1.2);
      scale.value = withSpring(target, { damping: 20, stiffness: 160 }, persist);
    });

  const composed = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={styles.wrapper}>
      <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`ambient-${area.id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={gradientStart} />
            <Stop offset="1" stopColor={gradientEnd} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" rx={radius.lg} fill={`url(#ambient-${area.id})`} />
      </Svg>
      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.canvas, animatedStyle]}>
          <TableMarkerLayer>
            {area.landmarks?.map((landmark) => (
              <Polygon
                key={landmark.id}
                points={(landmark.footprint ?? []).map(([x, y]) => `${x},${y}`).join(' ')}
                fill={landmarkFill}
                stroke={landmarkStroke}
                strokeWidth={1}
              />
            ))}
            {tables.map((table) => (
              <TableMarker
                key={table.id}
                table={table}
                status={getStatus(table.id)}
                onSelect={onSelectTable}
                onPreview={onPreviewTable}
              />
            ))}
          </TableMarkerLayer>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  canvas: {
    width: '100%',
    height: '100%',
  },
});

export default FloorCanvas;
