import React, { useCallback, useMemo, useState } from 'react';
import { Image, LayoutChangeEvent, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withDecay, withSpring } from 'react-native-reanimated';
import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';

import { colors, radius, shadow, spacing } from '../../config/theme';
import type { FloorOverlay, FloorOverlayType, FloorPlanDefinition } from './types';

type Props = {
  plan: FloorPlanDefinition;
  venueName?: string;
  interactiveTypes?: FloorOverlayType[];
  activeOverlayId?: string | null;
  labels?: Record<string, string>;
  detailMode?: 'internal' | 'none';
  isInteractive?: (overlay: FloorOverlay) => boolean;
  onOverlayPress?: (overlay: FloorOverlay) => void;
};

type OverlayLayout = {
  overlay: FloorOverlay;
  left: number;
  top: number;
  width: number;
  height: number;
  footprint: Array<{ x: number; y: number }>;
  centroid: { x: number; y: number };
};

const INITIAL_SCALE = 1;
const MIN_SCALE = 0.7;
const MAX_SCALE = 3;
const DOUBLE_TAP_SCALE = 1.35;

export const overlayIcons: Record<FloorOverlayType, keyof typeof Feather.glyphMap> = {
  table: 'circle',
  booth: 'grid',
  bar: 'coffee',
  dj: 'music',
  kitchen: 'tool',
  entry: 'corner-right-up',
  lounge: 'activity',
  terrace: 'wind',
  stage: 'headphones',
  service: 'truck',
};

// Clamp helpers keep overlay geometry anchored to the canvas bounds.
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

type ParsedColor = { r: number; g: number; b: number; a: number };

const parseColor = (input: string): ParsedColor | null => {
  const trimmed = input.trim();
  if (trimmed.startsWith('#')) {
    let hex = trimmed.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((char) => char + char)
        .join('');
    }
    if (hex.length !== 6) return null;
    const intVal = parseInt(hex, 16);
    return {
      r: (intVal >> 16) & 255,
      g: (intVal >> 8) & 255,
      b: intVal & 255,
      a: 1,
    };
  }

  const rgbaMatch = trimmed.match(/^rgba?\((.+)\)$/i);
  if (rgbaMatch) {
    const parts = rgbaMatch[1]
      .split(',')
      .map((segment) => segment.trim())
      .map((segment) => segment.replace(/%$/, ''));
    if (parts.length < 3) return null;
    const [r, g, b, alpha] = parts;
    return {
      r: Number(r),
      g: Number(g),
      b: Number(b),
      a: typeof alpha === 'string' ? Number(alpha) : 1,
    };
  }

  return null;
};

const withOpacity = (input: string, alpha: number) => {
  const parsed = parseColor(input);
  if (!parsed) return input;
  const clampedAlpha = Math.min(1, Math.max(0, alpha));
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${clampedAlpha})`;
};

const rectFootprint = (
  position: { x: number; y: number },
  size: { width: number; height: number },
  rotation = 0,
): Array<{ x: number; y: number }> => {
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  const cx = position.x;
  const cy = position.y;

  const corners = [
    { x: cx - halfWidth, y: cy - halfHeight },
    { x: cx + halfWidth, y: cy - halfHeight },
    { x: cx + halfWidth, y: cy + halfHeight },
    { x: cx - halfWidth, y: cy + halfHeight },
  ];

  if (!rotation) {
    return corners.map(({ x, y }) => ({ x: clamp(x), y: clamp(y) }));
  }

  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return corners.map(({ x, y }) => {
    const translatedX = x - cx;
    const translatedY = y - cy;
    const rotatedX = translatedX * cos - translatedY * sin;
    const rotatedY = translatedX * sin + translatedY * cos;
    return {
      x: clamp(cx + rotatedX),
      y: clamp(cy + rotatedY),
    };
  });
};

export default function FloorPlanExplorer({
  plan,
  venueName,
  interactiveTypes = ['table', 'booth'],
  activeOverlayId,
  labels,
  detailMode = 'internal',
  isInteractive,
  onOverlayPress,
}: Props) {
  const [internalActiveId, setInternalActiveId] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [canvasHeight, setCanvasHeight] = useState(0);

  const scale = useSharedValue(INITIAL_SCALE);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const imageAspectRatio = plan.imageSize.height / plan.imageSize.width;
  const displayHeight = canvasWidth ? canvasWidth * imageAspectRatio : 0;

  const interactiveTypeSet = useMemo(() => new Set(interactiveTypes), [interactiveTypes]);
  const checkInteractive = useCallback(
    (overlay: FloorOverlay) => {
      if (typeof isInteractive === 'function') {
        return isInteractive(overlay);
      }
      return interactiveTypeSet.has(overlay.type);
    },
    [interactiveTypeSet, isInteractive],
  );

  const overlayLayouts: OverlayLayout[] = useMemo(() => {
    if (!canvasWidth || !displayHeight) return [];

    const fallbackFootprint = (overlay: FloorOverlay): Array<{ x: number; y: number }> => {
      const width = overlay.size?.width ?? 8;
      const height = overlay.size?.height ?? 8;
      const rotation = overlay.rotation ?? 0;
      const baseFootprint = rectFootprint(
        { x: overlay.position.x, y: overlay.position.y },
        { width, height },
        rotation,
      );
      return baseFootprint ?? [
        { x: overlay.position.x - width / 2, y: overlay.position.y - height / 2 },
        { x: overlay.position.x + width / 2, y: overlay.position.y - height / 2 },
        { x: overlay.position.x + width / 2, y: overlay.position.y + height / 2 },
        { x: overlay.position.x - width / 2, y: overlay.position.y + height / 2 },
      ];
    };

    const toPixelPoint = (point: { x: number; y: number }) => ({
      x: (point.x / 100) * canvasWidth,
      y: (point.y / 100) * displayHeight,
    });

    return plan.overlays.map((overlay) => {
      const normalizedFootprint =
        overlay.footprint && overlay.footprint.length >= 3
          ? overlay.footprint
          : fallbackFootprint(overlay);

      const footprintPixels = normalizedFootprint.map(toPixelPoint);
      const xs = footprintPixels.map((point) => point.x);
      const ys = footprintPixels.map((point) => point.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const width = Math.max(32, maxX - minX);
      const height = Math.max(32, maxY - minY);
      const centerX = minX + width / 2;
      const centerY = minY + height / 2;

      const centroid =
        footprintPixels.length > 0
          ? footprintPixels.reduce(
              (acc, point) => ({
                x: acc.x + point.x,
                y: acc.y + point.y,
              }),
              { x: 0, y: 0 },
            )
          : { x: centerX, y: centerY };

      const footprintWithClamp =
        footprintPixels.length > 0
          ? footprintPixels
          : [
              { x: minX, y: minY },
              { x: maxX, y: minY },
              { x: maxX, y: maxY },
              { x: minX, y: maxY },
            ];

      return {
        overlay,
        left: centerX - width / 2,
        top: centerY - height / 2,
        width,
        height,
        footprint: footprintWithClamp,
        centroid: {
          x: centroid.x / (footprintPixels.length || 1),
          y: centroid.y / (footprintPixels.length || 1),
        },
      };
    });
  }, [plan.overlays, canvasWidth, displayHeight]);

  const derivedActiveId = activeOverlayId ?? internalActiveId;

  const activeLayout = useMemo(
    () => overlayLayouts.find(({ overlay }) => overlay.id === derivedActiveId) ?? null,
    [overlayLayouts, derivedActiveId],
  );

  const legendEntries = useMemo(() => {
    const baseEntries: Array<{ type: FloorOverlayType; label: string }> = [];
    if (plan.legend) {
      Object.entries(plan.legend).forEach(([type, label]) => {
        baseEntries.push({ type: type as FloorOverlayType, label });
      });
    } else {
      const labelsMap = new Map<FloorOverlayType, string>();
      plan.overlays.forEach((overlay) => {
        if (!labelsMap.has(overlay.type)) {
          labelsMap.set(overlay.type, overlay.type.replace('_', ' '));
        }
      });
      labelsMap.forEach((label, type) => {
        baseEntries.push({ type, label });
      });
    }

    const normalized = new Map<string, { type: FloorOverlayType; label: string }>();
    baseEntries.forEach((entry) => {
      const key = entry.type === 'booth' ? 'table' : entry.type;
      if (normalized.has(key)) return;
      normalized.set(key, {
        type: key as FloorOverlayType,
        label:
          key === 'table'
            ? 'Table (selectable)'
            : key === 'service'
            ? 'Services & support'
            : key === 'entry'
            ? 'Entry & host'
            : entry.label,
      });
    });

    return Array.from(normalized.values());
  }, [plan.legend, plan.overlays]);
  const hasLegend = legendEntries.length > 0;

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const width = event.nativeEvent.layout.width;
      const height = width * imageAspectRatio;
      setCanvasWidth(width);
      setCanvasHeight(height);
      translateX.value = 0;
      translateY.value = 0;
      scale.value = INITIAL_SCALE;
      if (detailMode === 'internal') {
        setInternalActiveId(null);
      }
    },
    [detailMode, imageAspectRatio, scale, translateX, translateY],
  );

  const clampTranslation = useCallback(
    (current: number, delta: number, axisLength: number) => {
      'worklet';
      if (axisLength === 0) return 0;
      const overflow = axisLength * scale.value - axisLength;
      if (overflow <= 0) return 0;
      const limit = overflow / 2 + 32;
      const next = current + delta;
      return Math.max(-limit, Math.min(limit, next));
    },
    [scale.value],
  );

  const pan = Gesture.Pan()
    .maxPointers(2)
    .onChange((event) => {
      translateX.value = clampTranslation(translateX.value, event.changeX, canvasWidth);
      translateY.value = clampTranslation(translateY.value, event.changeY, canvasHeight);
    })
    .onEnd((event) => {
      translateX.value = withDecay({
        velocity: event.velocityX,
        clamp: [-600, 600],
        deceleration: 0.995,
      });
      translateY.value = withDecay({
        velocity: event.velocityY,
        clamp: [-600, 600],
        deceleration: 0.995,
      });
    });

  const pinch = Gesture.Pinch()
    .onChange((event) => {
      const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.value * event.scale));
      scale.value = nextScale;
    })
    .onEnd(() => {
      if (scale.value < INITIAL_SCALE) {
        scale.value = withSpring(INITIAL_SCALE, { damping: 18, stiffness: 140 });
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((_event, success) => {
      if (!success) return;
      const target = Math.min(MAX_SCALE, Math.max(DOUBLE_TAP_SCALE, scale.value * 1.2));
      scale.value = withSpring(target, { damping: 18, stiffness: 160 });
    });

  const composedGesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const focusOverlay = useCallback(
    (layout: OverlayLayout) => {
      if (!canvasWidth || !canvasHeight) return;
      const centerX = layout.centroid.x;
      const centerY = layout.centroid.y;
      const offsetX = canvasWidth / 2 - centerX;
      const offsetY = canvasHeight / 2 - centerY;

      const targetScale = Math.min(MAX_SCALE, Math.max(scale.value, 1.4));
      scale.value = withSpring(targetScale, { damping: 20, stiffness: 160 });
      translateX.value = withSpring(offsetX, { damping: 20, stiffness: 160 });
      translateY.value = withSpring(offsetY, { damping: 20, stiffness: 160 });
    },
    [canvasWidth, canvasHeight, scale, translateX, translateY],
  );

  const handleOverlayPress = useCallback(
    (layout: OverlayLayout) => {
      if (!checkInteractive(layout.overlay)) return;
      if (detailMode === 'internal') {
        setInternalActiveId((prev) => (prev === layout.overlay.id ? null : layout.overlay.id));
      }
      focusOverlay(layout);
      onOverlayPress?.(layout.overlay);
    },
    [checkInteractive, detailMode, focusOverlay, onOverlayPress],
  );

  const resetView = useCallback(() => {
    scale.value = withSpring(INITIAL_SCALE, { damping: 18, stiffness: 150 });
    translateX.value = withSpring(0, { damping: 18, stiffness: 150 });
    translateY.value = withSpring(0, { damping: 18, stiffness: 150 });
    if (detailMode === 'internal') {
      setInternalActiveId(null);
    }
  }, [detailMode, scale, translateX, translateY]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Interactive floor explorer</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show floor legend"
          style={[styles.infoButton, !hasLegend && styles.infoButtonDisabled]}
          onPress={() => hasLegend && setLegendOpen(true)}
          disabled={!hasLegend}
        >
          <Feather name="info" size={16} color={hasLegend ? colors.primaryStrong : colors.muted} />
        </Pressable>
      </View>
      <Text style={styles.sectionSubtitle}>
        Pinch to zoom, drag to pan, and tap hotspots to explore {venueName ?? plan.label ?? 'this venue'}.
      </Text>

      <View style={[styles.canvasShell, { height: displayHeight || 320 }]} onLayout={handleLayout}>
        {canvasWidth > 0 ? (
          <>
            <GestureDetector gesture={composedGesture}>
              <Animated.View
                style={[styles.canvasContent, animatedStyle, { width: canvasWidth, height: displayHeight }]}
              >
                <Image
                  source={plan.image}
                  style={[styles.canvasImage, { width: canvasWidth, height: displayHeight }]}
                  resizeMode="contain"
                />
                <View style={[styles.canvasTint, { width: canvasWidth, height: displayHeight }]} />
                <Svg
                  pointerEvents="none"
                  width={canvasWidth}
                  height={displayHeight}
                  style={StyleSheet.absoluteFill}
                >
                  {Array.from({ length: 9 }).map((_, index) => {
                    const x = ((index + 1) / 10) * canvasWidth;
                    return (
                      <Line
                        key={`v-${index}`}
                        x1={x}
                        y1={0}
                        x2={x}
                        y2={displayHeight}
                        stroke="rgba(92, 69, 49, 0.08)"
                        strokeWidth={1}
                      />
                    );
                  })}
                  {Array.from({ length: 9 }).map((_, index) => {
                    const y = ((index + 1) / 10) * displayHeight;
                    return (
                      <Line
                        key={`h-${index}`}
                        x1={0}
                        y1={y}
                        x2={canvasWidth}
                        y2={y}
                        stroke="rgba(92, 69, 49, 0.08)"
                        strokeWidth={1}
                      />
                    );
                  })}
                  {overlayLayouts.map((layout) => {
                    const { overlay, footprint, centroid, width, height } = layout;
                    const interactive = checkInteractive(overlay);
                    const isActive = derivedActiveId === overlay.id && interactive;
                    const strokeColor = interactive
                      ? withOpacity(plan.accent, isActive ? 0.95 : 0.7)
                      : withOpacity(colors.overlay, overlay.type === 'service' ? 0.65 : 0.45);
                    const fillColor = interactive
                      ? withOpacity(plan.accent, isActive ? 0.55 : 0.28)
                      : withOpacity(colors.overlay, overlay.type === 'service' ? 0.45 : 0.32);

                    if (overlay.shape === 'circle') {
                      return (
                        <Circle
                          key={`${overlay.id}-shape`}
                          cx={centroid.x}
                          cy={centroid.y}
                          r={Math.max(16, Math.min(width, height) / 2)}
                          fill={fillColor}
                          stroke={strokeColor}
                          strokeWidth={isActive ? 2.4 : 1.6}
                        />
                      );
                    }

                    const points = footprint.map((point) => `${point.x},${point.y}`).join(' ');
                    return (
                      <Polygon
                        key={`${overlay.id}-shape`}
                        points={points}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeLinejoin="round"
                        strokeWidth={isActive ? 2.4 : 1.6}
                      />
                    );
                  })}
                  {overlayLayouts.map((layout) => {
                    const { overlay, centroid } = layout;
                    const interactive = checkInteractive(overlay);
                    const isActive = derivedActiveId === overlay.id && interactive;
                    const label = labels?.[overlay.id];
                    if (!label) return null;
                    return (
                      <SvgText
                        key={`${overlay.id}-label`}
                        x={centroid.x}
                        y={centroid.y + 3}
                        fontSize={11}
                        fontWeight="600"
                        textAnchor="middle"
                        fill={isActive ? '#fff' : colors.primaryStrong}
                      >
                        {label}
                      </SvgText>
                    );
                  })}
                </Svg>
                {overlayLayouts.map((layout) => {
                  const { overlay, left, top, width, height, centroid } = layout;
                  const interactive = checkInteractive(overlay);
                  const icon = overlayIcons[overlay.type] ?? 'map-pin';
                  const hasLabel = Boolean(labels?.[overlay.id]);
                  const isActive = derivedActiveId === overlay.id && interactive;
                  const markerStyle = [
                    styles.overlayMarker,
                    {
                      left,
                      top,
                      width,
                      height,
                    },
                  ];
                  const offsetX = centroid.x - (left + width / 2);
                  const offsetY = centroid.y - (top + height / 2);
                  const tagStyles = [
                    styles.overlayTag,
                    !interactive && styles.overlayTagStatic,
                    isActive && interactive && styles.overlayTagActive,
                    {
                      transform: [{ translateX: offsetX }, { translateY: offsetY }],
                    },
                  ];

                  if (!interactive) {
                    return (
                      <View key={overlay.id} style={markerStyle} pointerEvents="none">
                        {!hasLabel ? (
                          <View style={tagStyles}>
                            <Feather name={icon} size={14} color={colors.muted} />
                          </View>
                        ) : null}
                      </View>
                    );
                  }

                  return (
                    <Pressable
                      key={overlay.id}
                      style={markerStyle}
                      accessibilityRole="button"
                      accessibilityLabel={overlay.title}
                      onPress={() => handleOverlayPress(layout)}
                    >
                      {!hasLabel ? (
                        <View style={tagStyles}>
                          <Feather
                            name={icon}
                            size={14}
                            color={isActive ? '#fff' : colors.primaryStrong}
                          />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </Animated.View>
            </GestureDetector>
            <Pressable style={styles.resetButton} onPress={resetView}>
              <Feather name="target" size={16} color={colors.primaryStrong} />
              <Text style={styles.resetButtonText}>Reset view</Text>
            </Pressable>
          </>
        ) : null}
      </View>

      {detailMode === 'internal' && activeLayout && checkInteractive(activeLayout.overlay) ? (
        <View style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <View style={styles.detailAccent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.detailTitle}>{activeLayout.overlay.title}</Text>
              {activeLayout.overlay.subtitle ? (
                <Text style={styles.detailSubtitle}>{activeLayout.overlay.subtitle}</Text>
              ) : null}
            </View>
          </View>
          {activeLayout.overlay.description ? (
            <Text style={styles.detailDescription}>{activeLayout.overlay.description}</Text>
          ) : null}
          {(() => {
            const meta = activeLayout.overlay.metadata;
            if (!meta) return null;
            const parts: string[] = [];
            if (typeof meta.capacity === 'number') {
              parts.push(`Seats ${meta.capacity}`);
            }
            if (meta.areaName) {
              parts.push(meta.areaName);
            }
            return parts.length ? <Text style={styles.detailMeta}>{parts.join(' · ')}</Text> : null;
          })()}
          {activeLayout.overlay.occupancy ? (
            <View style={styles.occupancyRow}>
              <View style={styles.occupancyBarBackground}>
                <View
                  style={[
                    styles.occupancyBarFill,
                    {
                      width: `${Math.min(
                        100,
                        (activeLayout.overlay.occupancy.available / activeLayout.overlay.occupancy.total) * 100,
                      )}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.occupancyLabel}>
                {activeLayout.overlay.occupancy.available} of {activeLayout.overlay.occupancy.total} tables available
                {typeof activeLayout.overlay.occupancy.onHold === 'number'
                  ? ` · ${activeLayout.overlay.occupancy.onHold} on hold`
                  : ''}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <LegendDrawer visible={legendOpen && hasLegend} entries={legendEntries} onDismiss={() => setLegendOpen(false)} />
    </View>
  );
}

type LegendDrawerProps = {
  visible: boolean;
  entries: Array<{ type: FloorOverlayType; label: string }>;
  onDismiss: () => void;
};

function LegendDrawer({ visible, entries, onDismiss }: LegendDrawerProps) {
  if (!entries.length) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.legendOverlay}>
        <Pressable style={styles.legendScrim} onPress={onDismiss} />
        <View style={styles.legendSheet}>
          <Text style={styles.legendSheetTitle}>Legend</Text>
          <View style={styles.legendSheetList}>
            {entries.map((entry) => (
              <View key={`legend-${entry.type}`} style={styles.legendSheetRow}>
                <View style={[styles.overlayTag, styles.overlayTagStatic]}>
                  <Feather
                    name={overlayIcons[entry.type] ?? 'map-pin'}
                    size={16}
                    color={entry.type === 'table' ? colors.primaryStrong : colors.muted}
                  />
                </View>
                <Text style={styles.legendSheetLabel}>{entry.label}</Text>
              </View>
            ))}
          </View>
          <Pressable style={styles.legendCloseButton} onPress={onDismiss}>
            <Text style={styles.legendCloseText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  sectionSubtitle: {
    color: colors.muted,
  },
  infoButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoButtonDisabled: {
    backgroundColor: 'transparent',
  },
  canvasShell: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  canvasContent: {
    position: 'relative',
  },
  canvasImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    opacity: 0.6,
  },
  canvasTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'rgba(247, 239, 229, 0.45)',
  },
  overlayMarker: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  overlayTag: {
    minWidth: 24,
    minHeight: 24,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.card,
  },
  overlayTagStatic: {
    minWidth: 0,
    minHeight: 0,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 0,
    elevation: 0,
  },
  overlayTagActive: {
    backgroundColor: colors.primaryStrong,
  },
  resetButton: {
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resetButtonText: {
    fontWeight: '600',
    color: colors.primaryStrong,
  },
  detailCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  detailAccent: {
    width: 6,
    height: '100%',
    minHeight: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryStrong,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  detailSubtitle: {
    color: colors.muted,
  },
  detailDescription: {
    color: colors.text,
    lineHeight: 20,
  },
  detailMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  occupancyRow: {
    gap: spacing.xs,
  },
  occupancyBarBackground: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.overlay,
    overflow: 'hidden',
  },
  occupancyBarFill: {
    height: 6,
    backgroundColor: colors.primaryStrong,
  },
  occupancyLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  legendOverlay: {
    flex: 1,
    backgroundColor: 'rgba(16, 20, 26, 0.35)',
    justifyContent: 'flex-end',
  },
  legendSheet: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg + spacing.sm,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadow.card,
  },
  legendSheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  legendScrim: {
    flex: 1,
  },
  legendSheetList: {
    gap: spacing.sm,
  },
  legendSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  legendSheetLabel: {
    color: colors.text,
  },
  legendCloseButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  legendCloseText: {
    color: colors.text,
    fontWeight: '600',
  },
});
