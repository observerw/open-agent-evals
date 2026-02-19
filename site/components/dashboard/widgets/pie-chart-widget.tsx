"use client"

import * as React from "react"
import type { ComponentFn } from "@json-render/react"
import { Cell, Pie, PieChart } from "recharts"

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

export const PieChartWidget: ComponentFn<DashboardCatalog, "PieChartWidget"> = ({
  props,
}) => {
  const rows = toRows(props.data)
  const chartRoot = asProps<Omit<React.ComponentProps<typeof PieChart>, "ref">>(
    props.chartProps
  )
  const pieRoot = asProps<Omit<React.ComponentProps<typeof Pie>, "ref">>(
    props.pieProps
  )
  const tooltipRoot = asProps<Omit<React.ComponentProps<typeof ChartTooltip>, "ref">>(
    props.tooltipProps
  )
  const legendRoot = asProps<Omit<React.ComponentProps<typeof ChartLegend>, "ref">>(
    props.legendProps
  )

  const nameKey = typeof pieRoot.nameKey === "string" ? pieRoot.nameKey : "name"
  const dataKey = typeof pieRoot.dataKey === "string" ? pieRoot.dataKey : "value"
  const chartData: Array<Record<string, unknown> & { fill: string }> = rows.map(
    (row, index) => ({
      ...row,
      fill:
        typeof row.fill === "string"
          ? row.fill
          : `var(--chart-${(index % 5) + 1})`,
    })
  )

  const chartConfig = resolveConfig(
    props.chartConfig,
    chartData.map((row, index) => {
      const keyValue = row[nameKey]
      const key = typeof keyValue === "string" ? keyValue : `${dataKey}-${index}`
      return {
        key,
        label: key,
        color: typeof row.fill === "string" ? row.fill : undefined,
      }
    })
  )

  return (
    <WidgetShell placement={props.placement} title={props.title} bodyClassName="min-h-0">
      <ChartContainer className="min-h-[240px] w-full" config={chartConfig}>
        <PieChart
          {...chartRoot}
          accessibilityLayer={chartRoot.accessibilityLayer ?? true}
        >
          <ChartTooltip
            {...tooltipRoot}
            content={<ChartTooltipContent nameKey={nameKey} />}
          />
          <ChartLegend
            {...legendRoot}
            content={<ChartLegendContent nameKey={nameKey} />}
          />
          <Pie {...pieRoot} data={chartData} dataKey={dataKey} nameKey={nameKey}>
            {chartData.map((row, index) => (
              <Cell
                key={`${String(row[nameKey] ?? index)}`}
                fill={
                  typeof row.fill === "string"
                    ? row.fill
                    : `var(--chart-${(index % 5) + 1})`
                }
              />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
    </WidgetShell>
  )
}
