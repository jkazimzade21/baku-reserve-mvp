import type { AreaDetail, TableDetail } from '../api';

type Point = [number, number];

const OUTPUT_MIN = 8;
const OUTPUT_MAX = 92;
const OUTPUT_RANGE = OUTPUT_MAX - OUTPUT_MIN;

const clonePoint = (point: Point): Point => [point[0], point[1]];

const collectTablePoints = (table: TableDetail): Point[] => {
  const points: Point[] = [];
  if (table.position) {
    points.push(table.position);
  }
  if (table.footprint?.length) {
    points.push(...table.footprint);
  }
  if (table.geometry?.position) {
    points.push(table.geometry.position);
  }
  if (table.geometry?.footprint?.length) {
    points.push(...table.geometry.footprint);
  }
  if (table.geometry?.hotspot) {
    points.push(table.geometry.hotspot);
  }
  return points;
};

const cloneAndNormalizeTable = (
  table: TableDetail,
  normalizePoint: (point: Point) => Point,
): TableDetail => {
  const sourcePosition: Point | undefined =
    table.position ?? table.geometry?.position ?? table.geometry?.hotspot ?? undefined;

  const normalizedPosition = sourcePosition ? normalizePoint(sourcePosition) : undefined;

  const normalizedFootprint = table.footprint
    ? table.footprint.map((pt) => normalizePoint(pt))
    : table.geometry?.footprint
    ? table.geometry.footprint.map((pt) => normalizePoint(pt))
    : undefined;

  const normalizedGeometry = table.geometry
    ? {
        ...table.geometry,
        position: table.geometry.position
          ? normalizePoint(table.geometry.position)
          : normalizedPosition ?? table.geometry.position,
        footprint: table.geometry.footprint?.map((pt) => normalizePoint(pt)),
        hotspot: table.geometry.hotspot ? normalizePoint(table.geometry.hotspot) : table.geometry.hotspot,
      }
    : undefined;

  const cloned: TableDetail = {
    ...table,
    position: normalizedPosition ?? table.position ?? undefined,
    footprint: normalizedFootprint,
    geometry: normalizedGeometry,
  };

  return cloned;
};

/**
 * Many upstream seat maps use absolute pixel coordinates (0 - 1000).
 * This helper normalises geometry into a 0-100 coordinate system with padding
 * so it renders correctly inside the SeatMap SVG viewport.
 */
export const normalizeAreaGeometry = (area: AreaDetail): AreaDetail => {
  const points: Point[] = [];

  area.tables?.forEach((table) => {
    points.push(...collectTablePoints(table));
  });

  area.landmarks?.forEach((landmark) => {
    if (landmark.position) {
      points.push(landmark.position);
    }
    if (landmark.footprint?.length) {
      points.push(...landmark.footprint);
    }
  });

  if (!points.length) {
    return {
      ...area,
      tables: area.tables?.map((table) => ({
        ...table,
        position: table.position ? [...table.position] as Point : table.position,
        footprint: table.footprint?.map((pt) => clonePoint(pt)),
        geometry: table.geometry
          ? {
              ...table.geometry,
              position: table.geometry.position ? clonePoint(table.geometry.position) : table.geometry.position,
              footprint: table.geometry.footprint?.map((pt) => clonePoint(pt)),
              hotspot: table.geometry.hotspot ? clonePoint(table.geometry.hotspot) : table.geometry.hotspot,
            }
          : undefined,
      })),
      landmarks: area.landmarks?.map((landmark) => ({
        ...landmark,
        position: landmark.position ? clonePoint(landmark.position) : landmark.position,
        footprint: landmark.footprint?.map((pt) => clonePoint(pt)),
      })),
    };
  }

  const xs = points.map((pt) => pt[0]);
  const ys = points.map((pt) => pt[1]);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const rangeX = maxX - minX;
  const rangeY = maxY - minY;

  if (rangeX === 0 && rangeY === 0) {
    const centred: Point = [OUTPUT_MIN + OUTPUT_RANGE / 2, OUTPUT_MIN + OUTPUT_RANGE / 2];
    return {
      ...area,
      tables: (area.tables ?? []).map((table) =>
        cloneAndNormalizeTable(table, () => centred),
      ),
      landmarks: area.landmarks?.map((landmark) => ({
        ...landmark,
        position: landmark.position ? centred : landmark.position,
        footprint: landmark.footprint?.map(() => centred),
      })),
    };
  }

  const dominantRange = Math.max(rangeX, rangeY, 1);
  const scale = OUTPUT_RANGE / dominantRange;
  const scaledWidth = rangeX * scale;
  const scaledHeight = rangeY * scale;
  const paddingX = (OUTPUT_RANGE - scaledWidth) / 2;
  const paddingY = (OUTPUT_RANGE - scaledHeight) / 2;

  const normalizePoint = (point: Point): Point => {
    const [x, y] = point;
    const normX = OUTPUT_MIN + paddingX + (rangeX === 0 ? 0 : (x - minX) * scale);
    const normY = OUTPUT_MIN + paddingY + (rangeY === 0 ? 0 : (y - minY) * scale);
    return [normX, normY];
  };

  const tables = (area.tables ?? []).map((table) => cloneAndNormalizeTable(table, normalizePoint));

  const landmarks = area.landmarks?.map((landmark) => ({
    ...landmark,
    position: landmark.position ? normalizePoint(landmark.position) : landmark.position,
    footprint: landmark.footprint?.map((pt) => normalizePoint(pt)),
  }));

  return {
    ...area,
    tables,
    landmarks,
  };
};
