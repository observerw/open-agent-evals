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
        gap: "sm",
        densePacking: true,
      },
      children: ["kpi_text", "rev_line", "channel_bar", "mix_pie", "account_table"],
    },
    kpi_text: {
      type: "TextWidget",
      props: {
        placement: { colSpan: 12, rowSpan: 1 },
        text: { $state: "/summary/headline" },
        textProps: {
          as: "h2",
          variant: "title",
          className: "font-mono text-3xl font-semibold tracking-tight md:text-4xl",
        },
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
          margin: { top: 8, right: 8, left: 0, bottom: 0 },
        },
        xAxisProps: { dataKey: "month", tickLine: false },
        yAxisProps: { tickLine: false, width: 56 },
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
        xAxisProps: { dataKey: "channel", tickLine: false },
        yAxisProps: { tickLine: false, width: 56 },
        tooltipProps: {},
        legendProps: {},
        bars: [{ dataKey: "revenue", barProps: {} }],
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
    headline: "Q1 operating snapshot: growth is steady, structure is stable.",
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
    <div className="min-h-screen bg-background font-mono text-foreground">
      <main className="mx-auto w-full max-w-7xl border-x border-border">
        <header className="border-b border-border px-6 py-5 md:px-10">
          <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
            <div className="text-lg font-semibold tracking-tight">opencode-style dashboard</div>
            <div className="flex items-center gap-6 text-muted-foreground">
              <span>GitHub</span>
              <span>Docs</span>
              <span>Enterprise</span>
            </div>
          </div>
        </header>

        <section className="border-b border-border px-6 py-10 md:px-10 md:py-14">
          <p className="inline-flex border border-border px-2 py-1 text-xs text-muted-foreground">
            Sample
          </p>
          <h1 className="mt-6 max-w-4xl text-balance text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Minimal line dashboard rendered from json spec
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
            Same runtime as the live pipeline: layout is controlled by spec, and all widget data comes from
            state bindings.
          </p>
        </section>

        <section className="px-6 py-6 md:px-10 md:py-8">
          <JSONUIProvider registry={dashboardRegistry.registry} initialState={sampleState}>
            <Renderer spec={sampleSpec} registry={dashboardRegistry.registry} />
          </JSONUIProvider>
        </section>
      </main>
    </div>
  )
}
