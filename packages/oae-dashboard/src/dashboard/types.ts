export type Primitive = string | number | boolean | null | undefined;

export interface DashboardRow {
  [key: string]: Primitive;
}

export interface DashboardDataset {
  id: string;
  title: string;
  description?: string;
  rows: DashboardRow[];
  dimensions: string[];
  measures: string[];
  timeField?: string;
  metadata?: Record<string, any>;
}

export interface DashboardState {
  datasets: Record<string, DashboardDataset>;
  filters: Record<string, any>;
  metadata: Record<string, any>;
}

export type ChartType =
  | 'bar'
  | 'line'
  | 'area'
  | 'donut'
  | 'pie'
  | 'radar'
  | 'radialBar'
  | 'treemap'
  | 'sankey'
  | 'funnel'
  | 'scatter'
  | 'composed';

export type ChartFamily = 'cartesian' | 'polar' | 'hierarchical' | 'flow';

export interface BaseChartProps {
  data: any[];
  width?: number | string;
  height?: number | string;
  className?: string;
  title?: string;
  description?: string;
}

export interface CartesianChartProps extends BaseChartProps {
  xField: string;
  yFields: string[];
  stacked?: boolean;
}

export interface PieChartProps extends BaseChartProps {
  nameField: string;
  valueField: string;
  innerRadius?: number | string;
  outerRadius?: number | string;
}

export interface RadarChartProps extends BaseChartProps {
  subjectField: string;
  valueField: string;
  fullMarkField?: string;
}

export interface RadialBarChartProps extends BaseChartProps {
  nameField: string;
  valueField: string;
}

export interface TreemapChartProps extends BaseChartProps {
  nameField: string;
  valueField: string;
  groupField?: string;
}

export interface SankeyChartProps extends BaseChartProps {
  sourceField: string;
  targetField: string;
  valueField: string;
}

export interface FunnelChartProps extends BaseChartProps {
  stageField: string;
  valueField: string;
}
