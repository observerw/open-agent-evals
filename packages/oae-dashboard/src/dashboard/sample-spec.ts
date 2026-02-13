import type { Spec } from "@json-render/core";
import type { DashboardRow } from "./types";

export const sampleDatasets: Record<string, DashboardRow[]> = {
  sales: [
    { month: "Jan", revenue: 120, target: 100, cost: 64, orders: 38 },
    { month: "Feb", revenue: 142, target: 110, cost: 72, orders: 44 },
    { month: "Mar", revenue: 168, target: 125, cost: 88, orders: 49 },
    { month: "Apr", revenue: 186, target: 140, cost: 95, orders: 53 },
    { month: "May", revenue: 210, target: 160, cost: 102, orders: 57 },
    { month: "Jun", revenue: 232, target: 180, cost: 114, orders: 63 },
  ],
  mix: [
    { adSpend: 8, revenue: 54 },
    { adSpend: 11, revenue: 68 },
    { adSpend: 14, revenue: 79 },
    { adSpend: 17, revenue: 95 },
    { adSpend: 19, revenue: 104 },
    { adSpend: 22, revenue: 123 },
  ],
  channel: [
    { channel: "Direct", amount: 43 },
    { channel: "Organic", amount: 27 },
    { channel: "Ads", amount: 18 },
    { channel: "Referral", amount: 12 },
  ],
  capability: [
    { metric: "Acquisition", score: 82 },
    { metric: "Activation", score: 76 },
    { metric: "Retention", score: 69 },
    { metric: "Revenue", score: 73 },
    { metric: "Referral", score: 65 },
  ],
  progress: [
    { kpi: "North", value: 84 },
    { kpi: "South", value: 72 },
    { kpi: "West", value: 67 },
    { kpi: "East", value: 79 },
  ],
  hierarchy: [
    { segment: "Enterprise", revenue: 420 },
    { segment: "Mid Market", revenue: 260 },
    { segment: "SMB", revenue: 180 },
    { segment: "Startup", revenue: 90 },
  ],
  flow: [
    { from: "Visit", to: "Sign Up", amount: 1200 },
    { from: "Sign Up", to: "Trial", amount: 840 },
    { from: "Trial", to: "Paid", amount: 430 },
    { from: "Trial", to: "Churn", amount: 410 },
  ],
  funnel: [
    { stage: "Visit", count: 5000 },
    { stage: "Lead", count: 1850 },
    { stage: "SQL", count: 790 },
    { stage: "Deal", count: 310 },
  ],
};

export const m1Spec: Spec = {
  root: "root",
  elements: {
    root: {
      type: "DashboardShell",
      props: {
        title: "M2 Dashboard Playground",
        description: "Catalog + Registry + Recharts baseline with twelve chart types and one data table.",
        datasets: sampleDatasets,
      },
      children: ["grid"],
    },
    grid: {
      type: "GridLayout",
      props: {
        columns: 3,
        gap: 16,
      },
      children: [
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
        "table",
      ],
    },
    line: {
      type: "LineChartCard",
      props: {
        title: "Revenue vs Target",
        dataPath: "/datasets/sales/rows",
        xField: "month",
        yFields: ["revenue", "target"],
        showLegend: true,
      },
      children: [],
    },
    bar: {
      type: "BarChartCard",
      props: {
        title: "Revenue and Orders",
        dataPath: "/datasets/sales/rows",
        xField: "month",
        yFields: ["revenue", "orders"],
        showLegend: true,
      },
      children: [],
    },
    area: {
      type: "AreaChartCard",
      props: {
        title: "Cost Trend",
        dataPath: "/datasets/sales/rows",
        xField: "month",
        yFields: ["cost"],
        showLegend: false,
      },
      children: [],
    },
    composed: {
      type: "ComposedChartCard",
      props: {
        title: "Revenue + Orders Mix",
        dataPath: "/datasets/sales/rows",
        xField: "month",
        barField: "orders",
        lineField: "revenue",
        showLegend: true,
      },
      children: [],
    },
    scatter: {
      type: "ScatterChartCard",
      props: {
        title: "Ad Spend Correlation",
        dataPath: "/datasets/mix/rows",
        xField: "adSpend",
        yField: "revenue",
      },
      children: [],
    },
    pie: {
      type: "PieChartCard",
      props: {
        title: "Channel Mix",
        dataPath: "/datasets/channel/rows",
        nameField: "channel",
        valueField: "amount",
      },
      children: [],
    },
    donut: {
      type: "DonutChartCard",
      props: {
        title: "Channel Mix (Donut)",
        dataPath: "/datasets/channel/rows",
        nameField: "channel",
        valueField: "amount",
      },
      children: [],
    },
    radar: {
      type: "RadarChartCard",
      props: {
        title: "Capability Profile",
        dataPath: "/datasets/capability/rows",
        subjectField: "metric",
        valueField: "score",
      },
      children: [],
    },
    radialBar: {
      type: "RadialBarChartCard",
      props: {
        title: "Regional KPI Progress",
        dataPath: "/datasets/progress/rows",
        nameField: "kpi",
        valueField: "value",
      },
      children: [],
    },
    treemap: {
      type: "TreemapChartCard",
      props: {
        title: "Revenue Hierarchy",
        dataPath: "/datasets/hierarchy/rows",
        nameField: "segment",
        valueField: "revenue",
      },
      children: [],
    },
    sankey: {
      type: "SankeyChartCard",
      props: {
        title: "Stage Flow",
        dataPath: "/datasets/flow/rows",
        sourceField: "from",
        targetField: "to",
        valueField: "amount",
      },
      children: [],
    },
    funnel: {
      type: "FunnelChartCard",
      props: {
        title: "Conversion Funnel",
        dataPath: "/datasets/funnel/rows",
        stageField: "stage",
        valueField: "count",
      },
      children: [],
    },
    table: {
      type: "DataTableCard",
      props: {
        title: "Sales Detail",
        description: "Sortable, filterable, and paginated line items.",
        dataPath: "/datasets/sales/rows",
        columns: [
          { key: "month", header: "Month", sortable: true, filterable: true },
          { key: "revenue", header: "Revenue", sortable: true, filterable: true },
          { key: "cost", header: "Cost", sortable: true, filterable: true },
          { key: "orders", header: "Orders", sortable: true, filterable: true },
        ],
        pageSize: 6,
        showPagination: true,
        sortable: true,
        filterable: true,
      },
      children: [],
    },
  },
};
