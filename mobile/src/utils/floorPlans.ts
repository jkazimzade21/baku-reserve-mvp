import type { RestaurantDetail, TableDetail } from '../api';
import type { FloorOverlay, FloorPlanDefinition } from '../components/floor/types';
import { RESTAURANT_FLOOR_PLANS } from '../data/floorPlans';

type TableMappings = {
  plan: FloorPlanDefinition;
  tableLabels: Record<string, string>;
  tableIdToOverlayId: Map<string, string>;
  overlayIdToTable: Map<string, TableDetail>;
};

const DEFAULT_TABLE_SIZE = 6;

const toOverlayFootprint = (table: TableDetail): Array<{ x: number; y: number }> | undefined => {
  const fp = table.footprint;
  if (!fp || fp.length < 3) {
    return undefined;
  }
  return fp.map(([x, y]) => ({
    x: Math.min(100, Math.max(0, x)),
    y: Math.min(100, Math.max(0, y)),
  }));
};

const toOverlaySize = (table: TableDetail): { width: number; height: number } => {
  const footprint = table.footprint;
  if (!footprint || footprint.length < 2) {
    return { width: DEFAULT_TABLE_SIZE, height: DEFAULT_TABLE_SIZE };
  }
  const xs = footprint.map(([x]) => x);
  const ys = footprint.map(([, y]) => y);
  const width = Math.max(DEFAULT_TABLE_SIZE, Math.min(100, Math.max(...xs) - Math.min(...xs)));
  const height = Math.max(DEFAULT_TABLE_SIZE, Math.min(100, Math.max(...ys) - Math.min(...ys)));
  return { width, height };
};

export const buildFloorPlanForRestaurant = (restaurant: RestaurantDetail | null): TableMappings | null => {
  if (!restaurant) return null;
  const basePlan = RESTAURANT_FLOOR_PLANS[restaurant.id];
  if (!basePlan) return null;

  const baseOverlays = (basePlan.overlays ?? [])
    .filter((overlay) => overlay.type !== 'table' && overlay.type !== 'booth')
    .map((overlay) => ({
      ...overlay,
      metadata: {
        ...(overlay.metadata ?? {}),
        interactive: false,
      },
    }));

  const tableLabels: Record<string, string> = {};
  const tableIdToOverlayId = new Map<string, string>();
  const overlayIdToTable = new Map<string, TableDetail>();
  const tableOverlays: FloorOverlay[] = [];

  let counter = 1;
  restaurant.areas?.forEach((area) => {
    area.tables?.forEach((table) => {
      if (!table.position || table.position.length !== 2) {
        return;
      }
      const [x, y] = table.position;
      if (typeof x !== 'number' || typeof y !== 'number') {
        return;
      }
      const label = `T${counter++}`;
      const overlayId = `table-${table.id}`;
      const size = toOverlaySize(table);

      tableLabels[overlayId] = label;
      tableIdToOverlayId.set(table.id, overlayId);
      overlayIdToTable.set(overlayId, table);

      tableOverlays.push({
        id: overlayId,
        type: 'table',
        title: `${label} · ${table.name ?? area.name ?? 'Table'}`,
        subtitle: area.name,
        position: { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) },
        size,
        shape: table.shape === 'rect' ? 'rect' : 'circle',
        rotation: typeof table.rotation === 'number' ? table.rotation : undefined,
        footprint: toOverlayFootprint(table),
        metadata: {
          tableId: table.id,
          interactive: true,
          areaId: area.id,
          areaName: area.name,
          capacity: table.capacity,
        },
      });
    });
  });

  const plan: FloorPlanDefinition = {
    ...basePlan,
    overlays: [...baseOverlays, ...tableOverlays],
  };

  return { plan, tableLabels, tableIdToOverlayId, overlayIdToTable };
};
