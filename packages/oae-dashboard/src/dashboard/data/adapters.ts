import type { 
  DashboardRow, 
  CartesianChartProps, 
  PieChartProps, 
  RadarChartProps, 
  RadialBarChartProps, 
  TreemapChartProps, 
  SankeyChartProps, 
  FunnelChartProps 
} from '../types';
import { coerceNumber, coerceString } from './normalize';

/**
 * Cartesian Adapter: Outputs [{ [xField]: val, [y1]: val, [y2]: val, ... }]
 */
export function adaptCartesian(rows: DashboardRow[], xField: string, yFields: string[]): any[] {
  return rows.map(row => {
    const result: any = { [xField]: row[xField] };
    yFields.forEach(y => {
      result[y] = coerceNumber(row[y]);
    });
    return result;
  });
}

/**
 * Pie/Donut/RadialBar Adapter: Outputs [{ name, value, fill? }]
 */
export function adaptNameValue(rows: DashboardRow[], nameField: string, valueField: string): any[] {
  return rows.map((row, idx) => ({
    name: coerceString(row[nameField], `Item ${idx + 1}`),
    value: coerceNumber(row[valueField]),
    fill: `var(--chart-${(idx % 5) + 1})`
  }));
}

/**
 * Radar Adapter: Outputs [{ subject, value, fullMark? }]
 */
export function adaptRadar(rows: DashboardRow[], subjectField: string, valueField: string, fullMarkField?: string): any[] {
  return rows.map((row, idx) => ({
    subject: coerceString(row[subjectField], `Subject ${idx + 1}`),
    value: coerceNumber(row[valueField]),
    fullMark: fullMarkField ? coerceNumber(row[fullMarkField], 100) : 100
  }));
}

/**
 * Treemap Adapter: Outputs tree structure
 * Simple version: converts rows to children if no nesting specified
 */
export function adaptTreemap(rows: DashboardRow[], nameField: string, valueField: string): any {
  return {
    name: 'root',
    children: rows.map((row, idx) => ({
      name: coerceString(row[nameField], `Item ${idx + 1}`),
      size: coerceNumber(row[valueField])
    }))
  };
}

/**
 * Sankey Adapter: Outputs { nodes, links }
 */
export function adaptSankey(rows: DashboardRow[], sourceField: string, targetField: string, valueField: string): { nodes: any[], links: any[] } {
  const nodesMap = new Map<string, number>();
  const links: any[] = [];
  let nodeIdx = 0;

  rows.forEach((row, idx) => {
    const source = coerceString(row[sourceField], `Source ${idx + 1}`);
    const target = coerceString(row[targetField], `Target ${idx + 1}`);
    const value = coerceNumber(row[valueField]);

    if (!nodesMap.has(source)) nodesMap.set(source, nodeIdx++);
    if (!nodesMap.has(target)) nodesMap.set(target, nodeIdx++);

    links.push({
      source: nodesMap.get(source),
      target: nodesMap.get(target),
      value
    });
  });

  const nodes = Array.from(nodesMap.entries()).map(([name]) => ({ name }));

  return { nodes, links };
}

/**
 * Funnel Adapter: Outputs [{ stage, value }]
 */
export function adaptFunnel(rows: DashboardRow[], stageField: string, valueField: string): any[] {
  return rows.map((row, idx) => ({
    stage: coerceString(row[stageField], `Stage ${idx + 1}`),
    value: coerceNumber(row[valueField]),
    fill: `var(--chart-${(idx % 5) + 1})`
  }));
}
