import React, { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import Svg, { Circle, G, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withSpring } from 'react-native-reanimated';

import type { TableDetail } from '../../../api';
import type { TableStatus } from '../useVenueLayout';
import { colors } from '../../../config/theme';
import { hexToRgba } from '../../../utils/color';

type Props = {
  table: TableDetail;
  status: TableStatus;
  onSelect: (table: TableDetail) => void;
  onPreview: (table: TableDetail, anchor: { x: number; y: number }) => void;
};

type SeatStyle = { fill: string; stroke: string };

const seatTint = (hex: string, fillAlpha: number, strokeAlpha: number): SeatStyle => ({
  fill: hexToRgba(hex, fillAlpha),
  stroke: hexToRgba(hex, strokeAlpha),
});

export const seatStatusStyles: Record<TableStatus, SeatStyle> = {
  available: seatTint(colors.primary, 0.72, 0.92),
  held: seatTint(colors.border, 0.6, 0.8),
  reserved: seatTint(colors.danger, 0.55, 0.85),
  selected: seatTint(colors.primaryStrong, 0.88, 1),
};

const AnimatedGroup = Animated.createAnimatedComponent(G);

export function TableMarker({ table, status, onSelect, onPreview }: Props) {
  const scale = useSharedValue(status === 'selected' ? 1.04 : 1);

  useEffect(() => {
    scale.value = withSpring(status === 'selected' ? 1.08 : 1, { damping: 14, stiffness: 120 });
  }, [scale, status]);

  const animatedProps = useAnimatedProps(() => ({
    transform: [{ scale: scale.value }],
  }));

  const { fill, stroke } = useMemo(() => seatStatusStyles[status], [status]);

  const handlePress = () => {
    if (status !== 'available' && status !== 'selected') {
      return;
    }
    onSelect(table);
  };

  const handleHover = (event: any) => {
    if (status !== 'available' && status !== 'selected') {
      return;
    }
    const layout = event?.nativeEvent;
    if (!layout) return;
    const { pageX, pageY } = layout;
    onPreview(table, { x: pageX, y: pageY });
  };

  const center = table.position ?? [50, 50];
  const rotation = table.rotation ?? table.geometry?.rotation ?? 0;

  const footprint = table.footprint ?? table.geometry?.footprint;

  const renderShape = () => {
    if (footprint?.length) {
      const points = footprint.map(([x, y]) => `${x},${y}`).join(' ');
      return <Polygon points={points} fill={fill} stroke={stroke} strokeWidth={1.2} />;
    }
    if (table.shape === 'rect' || table.shape === 'booth' || table.shape === 'pod') {
      return (
        <Rect
          x={center[0] - 5}
          y={center[1] - 4}
          width={10}
          height={8}
          rx={table.shape === 'booth' ? 3 : 6}
          fill={fill}
          stroke={stroke}
          strokeWidth={1.2}
        />
      );
    }
    return <Circle cx={center[0]} cy={center[1]} r={4.2} fill={fill} stroke={stroke} strokeWidth={1.2} />;
  };

  const groupProps: any = {
    animatedProps,
    onPress: handlePress,
    onLongPress: handlePress,
    accessibilityRole: 'button',
    accessibilityLabel: `${table.name}, seats ${table.capacity}`,
    accessibilityState: { disabled: status !== 'available' && status !== 'selected', selected: status === 'selected' },
    transform: `rotate(${rotation}, ${center[0]}, ${center[1]})`,
  };

  if (Platform.OS === 'web') {
    groupProps.onResponderGrant = handleHover;
    groupProps.onHoverIn = handleHover;
  }

  return (
    <AnimatedGroup {...groupProps}>
      {renderShape()}
      <SvgText
        x={center[0]}
        y={center[1] + 1}
        fontSize={2.6}
        fontWeight="600"
        fill={status === 'selected' ? '#fff' : colors.text}
        textAnchor="middle"
      >
        {table.name}
      </SvgText>
    </AnimatedGroup>
  );
}

export function TableMarkerLayer({ children }: { children: React.ReactNode }) {
  return <Svg width="100%" height="100%" viewBox="0 0 100 100">{children}</Svg>;
}

export default TableMarker;
