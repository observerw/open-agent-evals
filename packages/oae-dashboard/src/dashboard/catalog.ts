import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react";
import { z } from "zod";

const cellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const rowSchema = z.record(z.string(), cellSchema);
const dataPathSchema = z
  .string()
  .regex(/^\/datasets\/[^/]+\/rows$/, "Expected /datasets/{id}/rows");

const baseChartProps = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dataPath: dataPathSchema,
  height: z.number().int().min(200).max(640).optional(),
  showLegend: z.boolean().optional(),
  showTooltip: z.boolean().optional(),
});

const tableColumnSchema = z.object({
  key: z.string().min(1),
  header: z.string().min(1),
  sortable: z.boolean().optional(),
  filterable: z.boolean().optional(),
  visible: z.boolean().optional(),
});

export const supportedChartTypes = [
  "line",
  "bar",
  "area",
  "composed",
  "scatter",
  "pie",
  "donut",
  "radar",
  "radialBar",
  "treemap",
  "sankey",
  "funnel",
] as const;
export const catalogVersion = "2026-02-12";

export const catalogRules = [
  "Use at least 4 chart families when enough data exists.",
  "Do not repeat the same chart type more than 2 times unless requested.",
  "Prefer Bar/Line for comparison, Pie/Donut for proportion, Treemap for hierarchy, Sankey for flow.",
  "Each chart must include title, dataPath, and field mapping.",
  "Prefer explainable layout: KPI/header first, trend charts second, structural charts last.",
  "Use DataTableCard when the user needs detailed records, reconciliation, or export-ready verification.",
] as const;

export const catalog = defineCatalog(schema, {
  components: {
    DashboardShell: {
      description: "Dashboard page shell with shared datasets",
      props: z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        datasets: z.record(z.string(), z.array(rowSchema)),
      }),
    },
    GridLayout: {
      description: "Responsive grid for dashboard cards",
      props: z.object({
        columns: z.number().int().min(1).max(4).optional(),
        gap: z.number().int().min(8).max(32).optional(),
      }),
    },
    LineChartCard: {
      description: "Line chart card for trend",
      props: baseChartProps.extend({
        xField: z.string().min(1),
        yFields: z.array(z.string().min(1)).min(1),
      }),
    },
    BarChartCard: {
      description: "Bar chart card for category comparison",
      props: baseChartProps.extend({
        xField: z.string().min(1),
        yFields: z.array(z.string().min(1)).min(1),
      }),
    },
    AreaChartCard: {
      description: "Area chart card for cumulative trend",
      props: baseChartProps.extend({
        xField: z.string().min(1),
        yFields: z.array(z.string().min(1)).min(1),
      }),
    },
    ScatterChartCard: {
      description: "Scatter chart card for correlation",
      props: baseChartProps.extend({
        xField: z.string().min(1),
        yField: z.string().min(1),
      }),
    },
    PieChartCard: {
      description: "Pie chart card for composition",
      props: baseChartProps.extend({
        nameField: z.string().min(1),
        valueField: z.string().min(1),
      }),
    },
    RadarChartCard: {
      description: "Radar chart card for multi-metric profile",
      props: baseChartProps.extend({
        subjectField: z.string().min(1),
        valueField: z.string().min(1),
      }),
    },
    ComposedChartCard: {
      description: "Composed chart card with bar and line overlay",
      props: baseChartProps.extend({
        xField: z.string().min(1),
        barField: z.string().min(1),
        lineField: z.string().min(1),
      }),
    },
    DonutChartCard: {
      description: "Donut chart card for composition with center space",
      props: baseChartProps.extend({
        nameField: z.string().min(1),
        valueField: z.string().min(1),
      }),
    },
    RadialBarChartCard: {
      description: "Radial bar chart card for progress and KPI",
      props: baseChartProps.extend({
        nameField: z.string().min(1),
        valueField: z.string().min(1),
      }),
    },
    TreemapChartCard: {
      description: "Treemap chart card for hierarchical distribution",
      props: baseChartProps.extend({
        nameField: z.string().min(1),
        valueField: z.string().min(1),
      }),
    },
    SankeyChartCard: {
      description: "Sankey chart card for flow relationship",
      props: baseChartProps.extend({
        sourceField: z.string().min(1),
        targetField: z.string().min(1),
        valueField: z.string().min(1),
      }),
    },
    FunnelChartCard: {
      description: "Funnel chart card for conversion stages",
      props: baseChartProps.extend({
        stageField: z.string().min(1),
        valueField: z.string().min(1),
      }),
    },
    DataTableCard: {
      description: "Data table card for detailed and auditable records",
      props: z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        dataPath: dataPathSchema,
        columns: z.array(tableColumnSchema).min(1).optional(),
        pageSize: z.number().int().min(5).max(100).optional(),
        showPagination: z.boolean().optional(),
        sortable: z.boolean().optional(),
        filterable: z.boolean().optional(),
      }),
    },
  },
  actions: {
    setState: {
      description: "Update state by JSON pointer path",
      params: z.object({
        path: z.string().min(1),
        value: z.unknown(),
      }),
    },
    refreshData: {
      description: "Request data refresh",
      params: z.object({
        source: z.string().optional(),
      }),
    },
    setTableSorting: {
      description: "Update table sorting",
      params: z.object({
        dataPath: dataPathSchema,
        columnKey: z.string().min(1),
        direction: z.enum(["asc", "desc"]),
      }),
    },
    setTableFilters: {
      description: "Update table column filters",
      params: z.object({
        dataPath: dataPathSchema,
        filters: z.array(
          z.object({
            key: z.string().min(1),
            value: z.string(),
          }),
        ),
      }),
    },
    setTablePagination: {
      description: "Update table pagination",
      params: z.object({
        dataPath: dataPathSchema,
        pageIndex: z.number().int().min(0),
        pageSize: z.number().int().min(1),
      }),
    },
  },
});

export function getCatalogPrompt() {
  return catalog.prompt({ customRules: [...catalogRules] });
}

export function getCatalogManifest() {
  return {
    catalogVersion,
    components: Object.keys(catalog.data.components),
    actions: Object.keys(catalog.data.actions ?? {}),
    supportedChartTypes,
    rules: [...catalogRules],
  };
}
