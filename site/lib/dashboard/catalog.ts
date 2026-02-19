import { defineCatalog } from "@json-render/core"
import { schema } from "@json-render/react/schema"
import { z } from "zod/v4"

export const GridPlacement = z.object({
  colSpan: z.number().int().min(1).max(12),
  rowSpan: z.number().int().min(1).max(8),
})

export const PassThrough = z
  .object({})
  .loose()

const StateBinding = z.object({
  $state: z.string().min(1),
})

const DataValue = z.union([z.string(), z.number(), z.boolean(), z.null()])
const DataRow = z.record(z.string(), DataValue)

const DataSource = z.union([
  StateBinding,
  z.array(DataRow),
])

const Margin = z
  .object({
    top: z.number().optional(),
    right: z.number().optional(),
    bottom: z.number().optional(),
    left: z.number().optional(),
  })
  .loose()

const ChartConfigEntry = z
  .object({
    label: z.string().optional(),
    color: z.string().optional(),
    theme: z
      .object({
        light: z.string(),
        dark: z.string(),
      })
      .optional(),
  })
  .loose()

const ChartConfig = z
  .object({
    series1: ChartConfigEntry.optional(),
    series2: ChartConfigEntry.optional(),
    series3: ChartConfigEntry.optional(),
  })
  .loose()

const ChartRootProps = PassThrough.extend({
  accessibilityLayer: z.boolean().optional(),
  margin: Margin.optional(),
  syncId: z.string().optional(),
}).loose()

const AxisProps = PassThrough.extend({
  dataKey: z.string().optional(),
  type: z.enum(["number", "category"]).optional(),
  allowDecimals: z.boolean().optional(),
  tickMargin: z.number().optional(),
  minTickGap: z.number().optional(),
}).loose()

const TooltipProps = PassThrough.extend({
  cursor: z.union([z.boolean(), PassThrough]).optional(),
}).loose()

const LegendProps = PassThrough.extend({
  verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
}).loose()

const LineVisualProps = PassThrough.extend({
  type: z.enum(["linear", "monotone", "step"]).optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
  connectNulls: z.boolean().optional(),
  dot: z.union([z.boolean(), PassThrough]).optional(),
}).loose()

const BarVisualProps = PassThrough.extend({
  fill: z.string().optional(),
  stackId: z.string().optional(),
  radius: z.union([z.number(), z.tuple([z.number(), z.number(), z.number(), z.number()])]).optional(),
}).loose()

const PieVisualProps = PassThrough.extend({
  dataKey: z.string().optional(),
  nameKey: z.string().optional(),
  innerRadius: z.number().optional(),
  outerRadius: z.number().optional(),
  paddingAngle: z.number().optional(),
}).loose()

export const WidgetBase = z.object({
  title: z.string().optional(),
  placement: GridPlacement,
})

const SeriesItem = z.object({
  dataKey: z.string(),
  name: z.string().optional(),
  lineProps: LineVisualProps.optional(),
})

const BarItem = z.object({
  dataKey: z.string(),
  name: z.string().optional(),
  barProps: BarVisualProps.optional(),
})

const TableColumn = z.union([
  z.string(),
  z
    .object({
      key: z.string(),
      header: z.string().optional(),
      align: z.enum(["left", "center", "right"]).optional(),
      format: z.enum(["text", "number", "percent", "currency"]).optional(),
    })
    .loose(),
])

const TextProps = PassThrough.extend({
  as: z.enum(["p", "span", "div", "h1", "h2", "h3"]).optional(),
  variant: z.enum(["body", "muted", "lead", "title", "metric"]).optional(),
}).loose()

export const DashboardGridProps = z.object({
  columns: z.number().int().min(1).max(12),
  gap: z.enum(["sm", "md", "lg"]).optional(),
  densePacking: z.boolean().optional(),
})

export const LineChartWidgetProps = WidgetBase.extend({
  data: DataSource,
  chartConfig: ChartConfig.optional(),
  chartProps: ChartRootProps.optional(),
  xAxisProps: AxisProps.optional(),
  yAxisProps: AxisProps.optional(),
  tooltipProps: TooltipProps.optional(),
  legendProps: LegendProps.optional(),
  series: z.array(SeriesItem).min(1),
})

export const BarChartWidgetProps = WidgetBase.extend({
  data: DataSource,
  chartConfig: ChartConfig.optional(),
  chartProps: ChartRootProps.optional(),
  xAxisProps: AxisProps.optional(),
  yAxisProps: AxisProps.optional(),
  tooltipProps: TooltipProps.optional(),
  legendProps: LegendProps.optional(),
  bars: z.array(BarItem).min(1),
})

export const PieChartWidgetProps = WidgetBase.extend({
  data: DataSource,
  chartConfig: ChartConfig.optional(),
  chartProps: ChartRootProps.optional(),
  pieProps: PieVisualProps.optional(),
  tooltipProps: TooltipProps.optional(),
  legendProps: LegendProps.optional(),
})

export const TableWidgetProps = WidgetBase.extend({
  data: DataSource,
  columns: z.array(TableColumn).min(1),
  tableProps: PassThrough.optional(),
  headerProps: PassThrough.optional(),
  rowProps: PassThrough.optional(),
})

export const TextWidgetProps = WidgetBase.extend({
  text: z.union([z.string(), StateBinding]),
  textProps: TextProps.optional(),
})

export const dashboardCatalog = defineCatalog(schema, {
  components: {
    DashboardGrid: {
      props: DashboardGridProps,
      slots: ["default"],
      description: "12-column dashboard grid with per-widget placement.",
      example: {
        columns: 12,
        gap: "md",
        densePacking: true,
      },
    },
    LineChartWidget: {
      props: LineChartWidgetProps,
      description: "Line chart widget with pass-through Recharts props. series uses [{ dataKey, name?, lineProps? }] and chartConfig keys should match series dataKey.",
      example: {
        title: "Revenue trend",
        placement: { colSpan: 12, rowSpan: 3 },
        data: { $state: "/data/revenueSeries" },
        chartProps: { accessibilityLayer: true, margin: { left: 8, right: 8 } },
        xAxisProps: { dataKey: "ts" },
        yAxisProps: {},
        series: [
          {
            dataKey: "revenue",
            lineProps: { stroke: "var(--chart-1)", strokeWidth: 2, type: "monotone" },
          },
        ],
      },
    },
    BarChartWidget: {
      props: BarChartWidgetProps,
      description: "Bar chart widget with pass-through Recharts props. bars uses [{ dataKey, name?, barProps? }] and chartConfig keys should match bars dataKey.",
      example: {
        title: "Revenue by region",
        placement: { colSpan: 6, rowSpan: 3 },
        data: { $state: "/data/regionRevenue" },
        xAxisProps: { dataKey: "region" },
        bars: [{ dataKey: "revenue", barProps: { fill: "var(--chart-2)" } }],
      },
    },
    PieChartWidget: {
      props: PieChartWidgetProps,
      description: "Pie chart widget with pass-through Recharts props.",
      example: {
        title: "Channel mix",
        placement: { colSpan: 6, rowSpan: 3 },
        data: { $state: "/data/channelMix" },
        pieProps: { dataKey: "value", nameKey: "name", innerRadius: 60 },
      },
    },
    TableWidget: {
      props: TableWidgetProps,
      description: "Table widget with pass-through layout and row props. columns accepts key strings or objects like { key, header?, align?, format? }.",
      example: {
        title: "Top regions",
        placement: { colSpan: 12, rowSpan: 2 },
        data: { $state: "/data/topRegions" },
        columns: [
          { key: "region", header: "Region" },
          { key: "revenue", header: "Revenue", align: "right", format: "currency" },
        ],
      },
    },
    TextWidget: {
      props: TextWidgetProps,
      description: "Text widget for titles, notes, and status blocks.",
      example: {
        placement: { colSpan: 12, rowSpan: 1 },
        text: { $state: "/summary/headline" },
        textProps: { as: "h2", variant: "title" },
      },
    },
  },
  actions: {},
})
