import type { DashboardRow, DashboardDataset, Primitive } from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function coerceNumber(val: unknown, fallback = 0): number {
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

export function coerceString(val: unknown, fallback: string): string {
  if (val === null || val === undefined) return fallback;
  const str = String(val);
  return str.length > 0 ? str : fallback;
}

export function normalizeRows(input: unknown): DashboardRow[] {
  if (!Array.isArray(input)) return [];

  return input.map((item) => {
    if (item && typeof item === 'object') {
      const row: DashboardRow = {};
      Object.entries(item).forEach(([key, value]) => {
        if (
          value !== null &&
          value !== undefined &&
          (typeof value === 'string' ? value.length > 0 : true)
        ) {
          if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
          ) {
            row[key] = value as Primitive;
          } else {
            row[key] = String(value);
          }
        }
      });
      return row;
    }
    return {};
  });
}

export function normalizeDataset(input: unknown, fallbackId = 'default'): DashboardDataset {
  const data = isRecord(input) ? input : {};

  const dimensions =
    Array.isArray(data.dimensions) ? data.dimensions.map(String).filter(s => s.length > 0) : [];
  const measures =
    Array.isArray(data.measures) ? data.measures.map(String).filter(s => s.length > 0) : [];

  return {
    id: coerceString(data.id ?? fallbackId, 'unknown-id'),
    title: coerceString(data.title ?? data.name, 'Untitled Dataset'),
    description: data.description ? coerceString(data.description, 'No description') : undefined,
    rows: normalizeRows(data.rows),
    dimensions,
    measures,
    timeField: data.timeField ? coerceString(data.timeField, 'time') : undefined,
    metadata: isRecord(data.metadata) ? data.metadata : {},
  };
}
