import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

import type { AreaDetail, RestaurantDetail, TableDetail } from '../../api';
import { buildMockVenue } from '../../mocks/venues';

export type TableStatus = 'available' | 'held' | 'reserved' | 'selected';

export type VenueNode = {
  area: AreaDetail;
  tables: TableDetail[];
};

export type VenueLayout = {
  areas: AreaDetail[];
  activeArea: AreaDetail | null;
  setActiveArea: (areaId: string) => void;
  nodes: VenueNode[];
  getStatus: (id: string) => TableStatus;
  selectTable: (id: string | null) => void;
  selectedTable: TableDetail | null;
  performHaptic: () => void;
};

type Params = {
  restaurant?: RestaurantDetail | null;
  activeAreaId: string | null;
  setActiveAreaId: (id: string) => void;
  selectedTableId: string | null;
  onSelectTable: (id: string | null) => void;
  availability: Set<string>;
  occupied: Set<string>;
};

export function useVenueLayout({
  restaurant,
  activeAreaId,
  setActiveAreaId,
  selectedTableId,
  onSelectTable,
  availability,
  occupied,
}: Params): VenueLayout {
  const [fallback] = useState(() => buildMockVenue());

  const source: RestaurantDetail = restaurant ?? fallback;
  // When backend starts returning CAD-derived geometry, swap the fallback for the hydrated payload.

  useEffect(() => {
    if (!activeAreaId && source.areas?.length) {
      const first = source.areas[0]?.id;
      if (first) {
        setActiveAreaId(first);
      }
    }
  }, [activeAreaId, setActiveAreaId, source.areas]);

  const nodes = useMemo(() => {
    return (source.areas ?? []).map((area) => ({
      area,
      tables: area.tables ?? [],
    }));
  }, [source.areas]);

  const activeArea = useMemo(() => nodes.find((node) => node.area.id === activeAreaId)?.area ?? null, [
    nodes,
    activeAreaId,
  ]);

  const getStatus = (id: string): TableStatus => {
    if (selectedTableId && selectedTableId === id) {
      return 'selected';
    }
    if (availability.has(id)) {
      return 'available';
    }
    if (occupied.has(id)) {
      return 'reserved';
    }
    return 'held';
  };

  const selectTable = (id: string | null) => onSelectTable(id);

  const performHaptic = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  return {
    areas: nodes.map((node) => node.area),
    activeArea,
    setActiveArea: setActiveAreaId,
    nodes,
    getStatus,
    selectTable,
    selectedTable: selectedTableId
      ? nodes.flatMap((node) => node.tables).find((table) => table.id === selectedTableId) ?? null
      : null,
    performHaptic,
  };
}
