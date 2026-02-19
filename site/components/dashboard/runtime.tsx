"use client"

import { JSONUIProvider, Renderer } from "@json-render/react"
import { useEffect, useMemo, useState } from "react"
import type { Spec } from "@json-render/core"

import { dashboardRegistry } from "@/lib/dashboard/registry"

type DashboardStatus = "collecting" | "finalizing" | "finalized"
type DashboardLayout = "live" | "final"

type DashboardDetail = {
  dashboardId: string
  status: DashboardStatus
  activeLayout: DashboardLayout
  liveSpec: Spec
  finalSpec: Spec
  liveStateSnapshot: Record<string, unknown> | null
  finalStateSnapshot: Record<string, unknown> | null
}

type DashboardDetailResponse =
  | DashboardDetail
  | {
      error: string
    }

type DashboardWsMessage =
  | {
      type: "state.snapshot"
      dashboardId: string
      step: number
      state: Record<string, unknown>
    }
  | {
      type: "dashboard.finalized"
      dashboardId: string
      activeLayout: "final"
    }
  | {
      type: "error"
      message: string
      dashboardId?: string
    }

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return "Unknown error"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isDashboardDetail(payload: DashboardDetailResponse): payload is DashboardDetail {
  return !("error" in payload)
}

function parseWsMessage(raw: unknown): DashboardWsMessage | null {
  if (typeof raw !== "string") {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    return null
  }

  if (
    parsed.type === "state.snapshot" &&
    typeof parsed.dashboardId === "string" &&
    typeof parsed.step === "number" &&
    isRecord(parsed.state)
  ) {
    return {
      type: "state.snapshot",
      dashboardId: parsed.dashboardId,
      step: parsed.step,
      state: parsed.state,
    }
  }

  if (
    parsed.type === "dashboard.finalized" &&
    typeof parsed.dashboardId === "string" &&
    parsed.activeLayout === "final"
  ) {
    return {
      type: "dashboard.finalized",
      dashboardId: parsed.dashboardId,
      activeLayout: "final",
    }
  }

  if (parsed.type === "error" && typeof parsed.message === "string") {
    return {
      type: "error",
      message: parsed.message,
      dashboardId: typeof parsed.dashboardId === "string" ? parsed.dashboardId : undefined,
    }
  }

  return null
}

async function fetchDashboard(dashboardId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/dashboard/${encodeURIComponent(dashboardId)}`, {
    method: "GET",
    cache: "no-store",
    signal,
  })
  const payload = (await response.json()) as DashboardDetailResponse

  if (!response.ok) {
    throw new Error(isDashboardDetail(payload) ? "Failed to fetch dashboard" : payload.error)
  }

  if (!isDashboardDetail(payload)) {
    throw new Error(payload.error)
  }

  return payload
}

function getViewerWsUrl(dashboardId: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  const params = new URLSearchParams({
    dashboardId,
    role: "viewer",
  })
  return `${protocol}//${window.location.host}/api/dashboard/ws?${params.toString()}`
}

export function DashboardRuntime({ dashboardId }: { dashboardId: string }) {
  const [dashboard, setDashboard] = useState<DashboardDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [wsError, setWsError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    void fetchDashboard(dashboardId, controller.signal)
      .then((payload) => {
        setDashboard(payload)
        setLoadError(null)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setLoadError(toErrorMessage(error))
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [dashboardId])

  useEffect(() => {
    let closed = false

    const ws = new WebSocket(getViewerWsUrl(dashboardId))

    ws.onopen = () => {
      setWsError(null)
    }

    const refreshDashboard = async () => {
      try {
        const payload = await fetchDashboard(dashboardId)
        if (closed) {
          return
        }

        setDashboard(payload)
        setLoadError(null)
      } catch (error: unknown) {
        if (closed) {
          return
        }

        setWsError(toErrorMessage(error))
      }
    }

    ws.onmessage = (event) => {
      const message = parseWsMessage(event.data)
      if (!message) {
        return
      }

      if ("dashboardId" in message && message.dashboardId && message.dashboardId !== dashboardId) {
        return
      }

      if (message.type === "state.snapshot") {
        setDashboard((current) => {
          if (!current || current.status === "finalized") {
            return current
          }

          return {
            ...current,
            liveStateSnapshot: message.state,
          }
        })
        return
      }

      if (message.type === "dashboard.finalized") {
        setDashboard((current) => {
          if (!current) {
            return current
          }

          return {
            ...current,
            status: "finalized",
            activeLayout: "final",
            finalStateSnapshot: current.finalStateSnapshot ?? current.liveStateSnapshot,
          }
        })

        void refreshDashboard()
        return
      }

      setWsError(message.message)
    }

    ws.onerror = () => {
      setWsError("WebSocket connection error")
    }

    return () => {
      closed = true
      ws.close()
    }
  }, [dashboardId])

  const active = useMemo(() => {
    if (!dashboard) {
      return null
    }

    const isFinal = dashboard.status === "finalized" || dashboard.activeLayout === "final"
    return {
      status: dashboard.status,
      layout: isFinal ? "final" : "live",
      spec: isFinal ? dashboard.finalSpec : dashboard.liveSpec,
      state: (isFinal ? dashboard.finalStateSnapshot : dashboard.liveStateSnapshot) ?? {},
    }
  }, [dashboard])

  if (isLoading && !dashboard) {
    return <div className="p-6 text-sm text-muted-foreground">Loading dashboard...</div>
  }

  if (loadError && !dashboard) {
    return <div className="p-6 text-sm text-destructive">{loadError}</div>
  }

  if (!dashboard || !active) {
    return <div className="p-6 text-sm text-muted-foreground">Dashboard unavailable</div>
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
      <div className="rounded-xl border border-border/50 bg-card/40 p-3 text-sm text-muted-foreground">
        <div>
          dashboardId: <span className="font-mono text-foreground">{dashboard.dashboardId}</span>
        </div>
        <div>
          status: <span className="font-medium text-foreground">{active.status}</span>
        </div>
        <div>
          layout: <span className="font-medium text-foreground">{active.layout}</span>
        </div>
        {loadError ? <div className="text-destructive">{loadError}</div> : null}
        {wsError ? <div className="text-destructive">{wsError}</div> : null}
      </div>

      <JSONUIProvider registry={dashboardRegistry.registry} initialState={active.state}>
        <Renderer spec={active.spec} registry={dashboardRegistry.registry} />
      </JSONUIProvider>
    </main>
  )
}
