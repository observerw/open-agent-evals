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
  latestAcceptedStep: number | null
  finalStateSnapshot: Record<string, unknown> | null
  meta: Record<string, unknown> | null
  finalizeByKey: Map<string, FinalizeDashboardPayload>
}

export type FinalizeDashboardPayload = {
  dashboardId: string
  status: "finalized"
  activeLayout: "final"
}

export type LiveSnapshotUpdateResult =
  | {
      outcome: "not_found"
      latestAcceptedStep: null
    }
  | {
      outcome: "closed"
      status: DashboardStatus
      latestAcceptedStep: number | null
    }
  | {
      outcome: "ignored"
      latestAcceptedStep: number
    }
  | {
      outcome: "accepted"
      latestAcceptedStep: number
    }

export type FinalizeDashboardResult =
  | {
      outcome: "not_found"
    }
  | {
      outcome: "conflict"
      latestAcceptedStep: number | null
    }
  | {
      outcome: "finalized"
      result: FinalizeDashboardPayload
      transitioned: boolean
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
    latestAcceptedStep: null,
    finalStateSnapshot: null,
    meta: input.meta ?? null,
    finalizeByKey: new Map(),
  }

  dashboards.set(dashboard.dashboardId, dashboard)
  return dashboard
}

export function getDashboard(dashboardId: string) {
  return dashboards.get(dashboardId)
}

export function applyLiveSnapshot(input: {
  dashboardId: string
  step: number
  state: Record<string, unknown>
}): LiveSnapshotUpdateResult {
  const dashboard = dashboards.get(input.dashboardId)
  if (!dashboard) {
    return { outcome: "not_found", latestAcceptedStep: null }
  }

  if (dashboard.status !== "collecting") {
    return {
      outcome: "closed",
      status: dashboard.status,
      latestAcceptedStep: dashboard.latestAcceptedStep,
    }
  }

  if (dashboard.latestAcceptedStep != null && input.step <= dashboard.latestAcceptedStep) {
    return {
      outcome: "ignored",
      latestAcceptedStep: dashboard.latestAcceptedStep,
    }
  }

  dashboard.latestAcceptedStep = input.step
  dashboard.liveStateSnapshot = input.state

  return {
    outcome: "accepted",
    latestAcceptedStep: input.step,
  }
}

export function finalizeDashboard(input: {
  dashboardId: string
  lastStep: number
  finalStateSnapshot?: Record<string, unknown>
  idempotencyKey?: string
}): FinalizeDashboardResult {
  const dashboard = dashboards.get(input.dashboardId)
  if (!dashboard) {
    return { outcome: "not_found" }
  }

  const key = input.idempotencyKey?.trim() || null
  if (key) {
    const memorized = dashboard.finalizeByKey.get(key)
    if (memorized) {
      return {
        outcome: "finalized",
        result: memorized,
        transitioned: false,
      }
    }
  }

  if (dashboard.latestAcceptedStep == null || input.lastStep !== dashboard.latestAcceptedStep) {
    return {
      outcome: "conflict",
      latestAcceptedStep: dashboard.latestAcceptedStep,
    }
  }

  if (dashboard.status === "collecting") {
    dashboard.status = "finalizing"
  }

  let transitioned = false
  if (dashboard.status === "finalizing") {
    dashboard.finalStateSnapshot = input.finalStateSnapshot ?? dashboard.liveStateSnapshot
    dashboard.activeLayout = "final"
    dashboard.status = "finalized"
    transitioned = true
  }

  const result: FinalizeDashboardPayload = {
    dashboardId: dashboard.dashboardId,
    status: "finalized",
    activeLayout: "final",
  }

  if (key) {
    dashboard.finalizeByKey.set(key, result)
  }

  return {
    outcome: "finalized",
    result,
    transitioned,
  }
}
