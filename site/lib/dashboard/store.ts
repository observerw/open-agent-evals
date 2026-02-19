import { randomUUID } from "node:crypto"

import type { DashboardSpec } from "@/lib/dashboard/spec-service"

export type DashboardStatus = "collecting" | "finalizing" | "finalized"
export type DashboardLayout = "live" | "final"

export type DashboardRecord = {
  dashboardId: string
  status: DashboardStatus
  activeLayout: DashboardLayout
  liveSpec: DashboardSpec
  finalSpec: DashboardSpec
  liveStateSnapshot: Record<string, unknown> | null
  finalStateSnapshot: Record<string, unknown> | null
  meta: Record<string, unknown> | null
}

const dashboards = new Map<string, DashboardRecord>()

function createDashboardId() {
  return `db_${randomUUID().replaceAll("-", "")}`
}

export function createDashboard(input: {
  liveSpec: DashboardSpec
  finalSpec: DashboardSpec
  meta?: Record<string, unknown>
}): DashboardRecord {
  const dashboard: DashboardRecord = {
    dashboardId: createDashboardId(),
    status: "collecting",
    activeLayout: "live",
    liveSpec: input.liveSpec,
    finalSpec: input.finalSpec,
    liveStateSnapshot: null,
    finalStateSnapshot: null,
    meta: input.meta ?? null,
  }

  dashboards.set(dashboard.dashboardId, dashboard)
  return dashboard
}

export function getDashboard(dashboardId: string) {
  return dashboards.get(dashboardId)
}
