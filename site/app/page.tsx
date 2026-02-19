"use client"

import type { Spec } from "@json-render/core"
import { JSONUIProvider, Renderer } from "@json-render/react"

import { dashboardRegistry } from "@/lib/dashboard/registry"

const sampleSpec: Spec = {
  root: "dashboard_root",
  elements: {
    dashboard_root: {
      type: "DashboardGrid",
      props: {
        columns: 12,
        gap: "md",
        densePacking: true,
      },
      children: ["kpi_text", "rev_line", "channel_bar", "mix_pie", "account_table"],
    },
    kpi_text: {
      type: "TextWidget",
      props: {
        placement: { colSpan: 12, rowSpan: 1 },
        text: { $state: "/summary/headline" },
        textProps: { as: "h2", variant: "title" },
      },
    },
    rev_line: {
      type: "LineChartWidget",
      props: {
        title: "Monthly Revenue",
        placement: { colSpan: 8, rowSpan: 3 },
        data: { $state: "/data/revenueSeries" },
        chartConfig: {
          revenue: { label: "Revenue", color: "hsl(18 89% 56%)" },
          target: { label: "Target", color: "hsl(217 91% 60%)" },
        },
        chartProps: {
          margin: { top: 8, right: 8, left: 8, bottom: 0 },
        },
        xAxisProps: { dataKey: "month" },
        yAxisProps: {},
        tooltipProps: {},
        legendProps: {},
        series: [
          {
            dataKey: "revenue",
            lineProps: { strokeWidth: 3, type: "monotone" },
          },
          {
            dataKey: "target",
            lineProps: { strokeWidth: 2, type: "linear", strokeDasharray: "5 4" },
          },
        ],
      },
    },
    channel_bar: {
      type: "BarChartWidget",
      props: {
        title: "Revenue by Channel",
        placement: { colSpan: 4, rowSpan: 3 },
        data: { $state: "/data/channelRevenue" },
        chartConfig: {
          revenue: { label: "Revenue", color: "hsl(160 84% 39%)" },
        },
        xAxisProps: { dataKey: "channel" },
        yAxisProps: {},
        tooltipProps: {},
        legendProps: {},
        bars: [{ dataKey: "revenue", barProps: { radius: [6, 6, 0, 0] } }],
      },
    },
    mix_pie: {
      type: "PieChartWidget",
      props: {
        title: "Channel Mix",
        placement: { colSpan: 4, rowSpan: 3 },
        data: { $state: "/data/channelMix" },
        pieProps: { dataKey: "value", nameKey: "name", innerRadius: 56, outerRadius: 84 },
        tooltipProps: {},
        legendProps: {},
      },
    },
    account_table: {
      type: "TableWidget",
      props: {
        title: "Top Accounts",
        placement: { colSpan: 8, rowSpan: 3 },
        data: { $state: "/data/topAccounts" },
        columns: [
          { key: "account", header: "Account" },
          { key: "region", header: "Region" },
          { key: "mrr", header: "MRR", align: "right", format: "currency" },
          { key: "growth", header: "Growth", align: "right", format: "percent" },
        ],
      },
    },
  },
}

const sampleState = {
  summary: {
    headline: "Q1 dashboard sample: +18.4% revenue growth, retention remains stable.",
  },
  data: {
    revenueSeries: [
      { month: "Jan", revenue: 118000, target: 110000 },
      { month: "Feb", revenue: 129500, target: 120000 },
      { month: "Mar", revenue: 141200, target: 130000 },
      { month: "Apr", revenue: 153900, target: 140000 },
      { month: "May", revenue: 161400, target: 150000 },
      { month: "Jun", revenue: 172300, target: 160000 },
    ],
    channelRevenue: [
      { channel: "Direct", revenue: 271500 },
      { channel: "Partner", revenue: 184000 },
      { channel: "Online", revenue: 132000 },
      { channel: "Field", revenue: 97000 },
    ],
    channelMix: [
      { name: "Direct", value: 40, fill: "hsl(18 89% 56%)" },
      { name: "Partner", value: 28, fill: "hsl(217 91% 60%)" },
      { name: "Online", value: 19, fill: "hsl(160 84% 39%)" },
      { name: "Field", value: 13, fill: "hsl(270 65% 60%)" },
    ],
    topAccounts: [
      { account: "Northwind", region: "NA", mrr: 38500, growth: 0.118 },
      { account: "Bluepeak", region: "EU", mrr: 31200, growth: 0.092 },
      { account: "Aster Labs", region: "APAC", mrr: 27900, growth: 0.076 },
      { account: "Vertex One", region: "NA", mrr: 26300, growth: 0.064 },
      { account: "Signal Forge", region: "LATAM", mrr: 22100, growth: 0.051 },
    ],
  },
}

export default function Home() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_hsl(22_100%_97%),_hsl(210_40%_99%))]">
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 md:px-6 md:py-10">
        <header className="rounded-2xl border border-border/50 bg-background/85 p-6 shadow-sm backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Sample Dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Agent-driven dashboard preview
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground md:text-base">
            This example uses the same json-render catalog and dashboard registry as the live workflow.
            The structure comes from spec, and all values are supplied through state bindings.
          </p>
        </header>

        <JSONUIProvider registry={dashboardRegistry.registry} initialState={sampleState}>
          <Renderer spec={sampleSpec} registry={dashboardRegistry.registry} />
        </JSONUIProvider>
      </main>
    </div>
  )
}
