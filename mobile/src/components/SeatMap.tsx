import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import type { AreaDetail, TableDetail } from '../api';
import { colors, radius, shadow, spacing } from '../config/theme';
import FloorCanvas from '../screens/SeatPicker/components/FloorCanvas';
import LiveSyncBadge from '../screens/SeatPicker/components/LiveSyncBadge';
import SeatPreviewDrawer from '../screens/SeatPicker/components/SeatPreviewDrawer';
import type { TableStatus } from '../screens/SeatPicker/useVenueLayout';
import { seatStatusStyles } from '../screens/SeatPicker/components/TableMarker';
import { normalizeAreaGeometry } from '../utils/geometry';

type Transform = {
  scale: number;
  translateX: number;
  translateY: number;
};

type Props = {
  area: AreaDetail;
  selectable?: boolean;
  availableIds?: Set<string>;
  selectedId?: string | null;
  occupiedIds?: Set<string>;
  onSelect?: (tableId: string | null) => void;
  onReserve?: (tableId: string) => void;
  showLegend?: boolean;
  lastUpdated?: Date | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  errorMessage?: string | null;
  showStatus?: boolean;
};

const DEFAULT_TRANSFORM: Transform = { scale: 1, translateX: 0, translateY: 0 };

const LEGEND: Array<{ key: TableStatus; label: string }> = [
  { key: 'available', label: 'Available' },
  { key: 'held', label: 'Held' },
  { key: 'reserved', label: 'Reserved' },
  { key: 'selected', label: 'Selected' },
];

export default function SeatMap({
  area,
  selectable = false,
  availableIds,
  selectedId,
  occupiedIds,
  onSelect,
  onReserve,
  showLegend = false,
  lastUpdated,
  onRefresh,
  refreshing = false,
  errorMessage = null,
  showStatus = true,
}: Props) {
  const normalizedArea = useMemo(() => normalizeAreaGeometry(area), [area]);
  const tables = useMemo(
    () => normalizedArea.tables?.filter((table) => table.position) ?? [],
    [normalizedArea],
  );

  const [preview, setPreview] = useState<{ table: TableDetail; anchor: { x: number; y: number } } | null>(null);
  const transforms = useRef<Record<string, Transform>>({});

  useEffect(() => {
    if (!selectedId) {
      setPreview(null);
    }
  }, [selectedId]);

  if (!tables.length) {
    return <Text style={styles.fallback}>Seat map coming soon for this area.</Text>;
  }

  const availability = availableIds ?? new Set<string>();
  const occupied = occupiedIds ?? new Set<string>();

  const transform = transforms.current[area.id] ?? DEFAULT_TRANSFORM;

  const getStatus = (id: string): TableStatus => {
    if (selectedId === id) return 'selected';
    if (availability.has(id)) return 'available';
    if (occupied.has(id)) return 'reserved';
    return 'held';
  };

  const clearSelection = () => {
    setPreview(null);
    onSelect?.(null);
  };

  const handleSelectTable = (table: TableDetail) => {
    if (!selectable) return;
    const isAlreadySelected = selectedId === table.id;
    if (isAlreadySelected) {
      clearSelection();
      return;
    }
    onSelect?.(table.id);
    setPreview({ table, anchor: { x: 0, y: 0 } });
  };

  const handlePreview = (table: TableDetail, anchor: { x: number; y: number }) => {
    onSelect?.(table.id);
    setPreview({ table, anchor });
  };

  const handleClosePreview = () => {
    clearSelection();
  };

  const handleTransform = (next: Transform) => {
    transforms.current[area.id] = next;
  };

  const activeTable = preview?.table ?? null;

  const shouldRenderStatus =
    showStatus && (typeof onRefresh === 'function' || refreshing || lastUpdated || errorMessage);

  return (
    <View style={styles.wrapper}>
      {shouldRenderStatus ? (
        <LiveSyncBadge
          updatedAt={lastUpdated ?? null}
          syncing={refreshing}
          error={errorMessage}
          onSync={() => onRefresh?.()}
        />
      ) : null}
      <View style={styles.canvasShell}>
        <FloorCanvas
          area={normalizedArea}
          tables={tables}
          getStatus={getStatus}
          onSelectTable={handleSelectTable}
          onPreviewTable={handlePreview}
          transform={transform}
          onTransformChange={handleTransform}
        />
        {preview && Platform.OS === 'web' ? (
          <View style={[styles.tooltip, { top: preview.anchor.y + 12, left: preview.anchor.x + 12 }]}>
            <Text style={styles.tooltipTitle}>{preview.table.name}</Text>
            <Text style={styles.tooltipCopy}>Seats {preview.table.capacity}</Text>
            {preview.table.tags?.length ? (
              <Text style={styles.tooltipCopy}>{preview.table.tags.join(' • ')}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
      {showLegend ? (
        <View style={styles.legendRow}>
          {LEGEND.map((item) => (
            <View key={item.key} style={styles.legendItem}>
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: seatStatusStyles[item.key].fill, borderColor: seatStatusStyles[item.key].stroke },
                ]}
              />
              <Text style={styles.legendLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {selectable ? (
        <SeatPreviewDrawer
          table={activeTable}
          area={area}
          visible={!!preview}
          onClose={handleClosePreview}
          onReserve={() => activeTable && onReserve?.(activeTable.id)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.md,
    width: '100%',
  },
  canvasShell: {
    position: 'relative',
    height: 360,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  swatch: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  legendLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  tooltip: {
    position: 'absolute',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.text,
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  tooltipTitle: {
    fontWeight: '700',
    color: colors.text,
  },
  tooltipCopy: {
    color: colors.muted,
    fontSize: 12,
  },
  fallback: {
    color: colors.muted,
    fontSize: 13,
  },
});
