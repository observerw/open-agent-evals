"use client"

import * as React from "react"
import type { ComponentFn } from "@json-render/react"
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"

import { WidgetShell } from "@/components/dashboard/widgets/dashboard-grid"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

type DashboardCatalog = typeof import("@/lib/dashboard/catalog").dashboardCatalog

function asProps<T extends object>(value: unknown): Partial<T> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Partial<T>
}

function toRows(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) {
    return []
  }

  return data.filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && !Array.isArray(item)
  )
}

function resolveConfig(
  value: unknown,
  items: Array<{ key: string; label?: string; color?: string }>
): ChartConfig {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as ChartConfig
  }

  const config: ChartConfig = {}
  for (const item of items) {
    config[item.key] = {
      label: item.label ?? item.key,
      color: item.color,
    }
  }

  return config
}

export const LineChartWidget: ComponentFn<DashboardCatalog, "LineChartWidget"> = ({
  props,
}) => {
  const rows = toRows(props.data)
  const chartRoot = asProps<Omit<React.ComponentProps<typeof LineChart>, "ref">>(
    props.chartProps
  )
  const xAxisRoot = asProps<Omit<React.ComponentProps<typeof XAxis>, "ref">>(
    props.xAxisProps
  )
  const yAxisRoot = asProps<Omit<React.ComponentProps<typeof YAxis>, "ref">>(
    props.yAxisProps
  )
  const tooltipRoot = asProps<Omit<React.ComponentProps<typeof ChartTooltip>, "ref">>(
    props.tooltipProps
  )
  const legendRoot = asProps<Omit<React.ComponentProps<typeof ChartLegend>, "ref">>(
    props.legendProps
  )

  const chartConfig = resolveConfig(
    props.chartConfig,
    props.series.map((item) => ({
      key: item.dataKey,
      label: item.name,
      color: item.lineProps?.stroke,
    }))
  )

  return (
    <WidgetShell placement={props.placement} title={props.title} bodyClassName="min-h-0">
      <ChartContainer className="min-h-[240px] w-full" config={chartConfig}>
        <LineChart
          {...chartRoot}
          data={rows}
          accessibilityLayer={chartRoot.accessibilityLayer ?? true}
        >
          <CartesianGrid vertical={false} />
          <XAxis {...xAxisRoot} />
          <YAxis {...yAxisRoot} />
          <ChartTooltip {...tooltipRoot} content={<ChartTooltipContent />} />
          <ChartLegend {...legendRoot} content={<ChartLegendContent />} />
          {props.series.map((item) => {
            const lineRoot = asProps<Omit<React.ComponentProps<typeof Line>, "ref">>(
              item.lineProps
            )
            return (
              <Line
                key={item.dataKey}
                {...lineRoot}
                dataKey={item.dataKey}
                name={item.name}
              />
            )
          })}
        </LineChart>
      </ChartContainer>
    </WidgetShell>
  )
}
