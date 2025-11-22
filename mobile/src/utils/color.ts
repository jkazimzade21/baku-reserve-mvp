export function hexToRgba(value: string, alpha: number): string {
  if (!value) {
    return value;
  }
  if (!value.startsWith('#') || (value.length !== 7 && value.length !== 4)) {
    return value;
  }
  const normalized =
    value.length === 4
      ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
      : value;
  const parsed = Number.parseInt(normalized.slice(1), 16);
  if (Number.isNaN(parsed)) {
    return value;
  }
  const r = (parsed >> 16) & 255;
  const g = (parsed >> 8) & 255;
  const b = parsed & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
