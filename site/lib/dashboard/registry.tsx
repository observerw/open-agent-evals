"use client"

import { defineRegistry } from "@json-render/react"

import { BarChartWidget } from "@/components/dashboard/widgets/bar-chart-widget"
import { DashboardGrid } from "@/components/dashboard/widgets/dashboard-grid"
import { LineChartWidget } from "@/components/dashboard/widgets/line-chart-widget"
import { PieChartWidget } from "@/components/dashboard/widgets/pie-chart-widget"
import { TableWidget } from "@/components/dashboard/widgets/table-widget"
import { TextWidget } from "@/components/dashboard/widgets/text-widget"
import { dashboardCatalog } from "@/lib/dashboard/catalog"

export const dashboardRegistry = defineRegistry(dashboardCatalog, {
  components: {
    DashboardGrid: ({ props, children }) => {
      return <DashboardGrid {...props}>{children}</DashboardGrid>
    },
    LineChartWidget,
    BarChartWidget,
    PieChartWidget,
    TableWidget,
    TextWidget,
  },
})
