import { z } from "zod/v4"

import { applyLiveSnapshot, getDashboard } from "@/lib/dashboard/store"

export type DashboardWsRole = "producer" | "viewer"

export type DashboardWsSocket = {
  on(event: "message", listener: (data: unknown) => void): void
  on(event: "close", listener: () => void): void
  send(data: string): void
  close(code?: number, reason?: string): void
}

const producerSnapshotSchema = z.object({
  type: z.literal("state.snapshot"),
  dashboardId: z.string().min(1),
  step: z.number().int().nonnegative(),
  state: z.record(z.string(), z.unknown()),
})

type AckMessage = {
  type: "ack"
  dashboardId: string
  step: number
  latestAcceptedStep: number
}

type SnapshotMessage = {
  type: "state.snapshot"
  dashboardId: string
  step: number
  state: Record<string, unknown>
}

type ErrorMessage = {
  type: "error"
  message: string
  dashboardId?: string
}

type FinalizedMessage = {
  type: "dashboard.finalized"
  dashboardId: string
  activeLayout: "final"
}

function parseJsonMessage(raw: unknown): unknown {
  if (typeof raw === "string") {
    return JSON.parse(raw)
  }

  if (raw instanceof ArrayBuffer) {
    return JSON.parse(Buffer.from(raw).toString("utf8"))
  }

  if (ArrayBuffer.isView(raw)) {
    return JSON.parse(Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString("utf8"))
  }

  if (Array.isArray(raw)) {
    const chunks = raw.map((item) => {
      if (item instanceof ArrayBuffer) {
        return Buffer.from(item)
      }

      if (ArrayBuffer.isView(item)) {
        return Buffer.from(item.buffer, item.byteOffset, item.byteLength)
      }

      return Buffer.from(String(item))
    })

    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  }

  throw new Error("Unsupported message format")
}

function safeSend(socket: DashboardWsSocket, payload: AckMessage | SnapshotMessage | ErrorMessage | FinalizedMessage) {
  try {
    socket.send(JSON.stringify(payload))
  } catch {
    socket.close()
  }
}

class DashboardWsHub {
  private readonly producers = new Map<string, DashboardWsSocket>()

  private readonly viewers = new Map<string, Set<DashboardWsSocket>>()

  connect(input: { socket: DashboardWsSocket; dashboardId: string; role: DashboardWsRole }) {
    const dashboard = getDashboard(input.dashboardId)
    if (!dashboard) {
      safeSend(input.socket, {
        type: "error",
        dashboardId: input.dashboardId,
        message: "Dashboard Not Found",
      })
      input.socket.close(1008, "Dashboard Not Found")
      return
    }

    if (input.role === "producer") {
      if (dashboard.status !== "collecting") {
        safeSend(input.socket, {
          type: "error",
          dashboardId: input.dashboardId,
          message: `Dashboard is ${dashboard.status}`,
        })
        input.socket.close(1008, "Dashboard closed for producer updates")
        return
      }

      const existingProducer = this.producers.get(input.dashboardId)
      if (existingProducer && existingProducer !== input.socket) {
        safeSend(input.socket, {
          type: "error",
          dashboardId: input.dashboardId,
          message: "Producer already connected",
        })
        input.socket.close(1008, "Producer already connected")
        return
      }

      this.producers.set(input.dashboardId, input.socket)
      input.socket.on("message", (raw) => {
        this.handleProducerMessage({
          socket: input.socket,
          dashboardId: input.dashboardId,
          raw,
        })
      })
      input.socket.on("close", () => {
        if (this.producers.get(input.dashboardId) === input.socket) {
          this.producers.delete(input.dashboardId)
        }
      })
      return
    }

    const dashboardViewers = this.viewers.get(input.dashboardId) ?? new Set<DashboardWsSocket>()
    dashboardViewers.add(input.socket)
    this.viewers.set(input.dashboardId, dashboardViewers)

    input.socket.on("close", () => {
      const currentViewers = this.viewers.get(input.dashboardId)
      if (!currentViewers) {
        return
      }

      currentViewers.delete(input.socket)
      if (currentViewers.size === 0) {
        this.viewers.delete(input.dashboardId)
      }
    })

    if (dashboard.liveStateSnapshot && dashboard.latestAcceptedStep != null) {
      safeSend(input.socket, {
        type: "state.snapshot",
        dashboardId: input.dashboardId,
        step: dashboard.latestAcceptedStep,
        state: dashboard.liveStateSnapshot,
      })
    }
  }

  notifyDashboardFinalized(input: { dashboardId: string }) {
    const producer = this.producers.get(input.dashboardId)
    if (producer) {
      safeSend(producer, {
        type: "error",
        dashboardId: input.dashboardId,
        message: "Dashboard is finalized",
      })
      producer.close(1008, "Dashboard closed for producer updates")
      this.producers.delete(input.dashboardId)
    }

    const viewers = this.viewers.get(input.dashboardId)
    if (!viewers) {
      return
    }

    const payload: FinalizedMessage = {
      type: "dashboard.finalized",
      dashboardId: input.dashboardId,
      activeLayout: "final",
    }

    for (const viewer of viewers) {
      safeSend(viewer, payload)
    }
  }

  private handleProducerMessage(input: { socket: DashboardWsSocket; dashboardId: string; raw: unknown }) {
    let parsed: unknown
    try {
      parsed = parseJsonMessage(input.raw)
    } catch {
      safeSend(input.socket, {
        type: "error",
        dashboardId: input.dashboardId,
        message: "Invalid JSON message",
      })
      return
    }

    const parsedSnapshot = producerSnapshotSchema.safeParse(parsed)
    if (!parsedSnapshot.success) {
      safeSend(input.socket, {
        type: "error",
        dashboardId: input.dashboardId,
        message: "Invalid state.snapshot payload",
      })
      return
    }

    const message = parsedSnapshot.data
    if (message.dashboardId !== input.dashboardId) {
      safeSend(input.socket, {
        type: "error",
        dashboardId: input.dashboardId,
        message: "dashboardId mismatch",
      })
      return
    }

    const result = applyLiveSnapshot({
      dashboardId: input.dashboardId,
      step: message.step,
      state: message.state,
    })

    if (result.outcome === "not_found") {
      safeSend(input.socket, {
        type: "error",
        dashboardId: input.dashboardId,
        message: "Dashboard Not Found",
      })
      input.socket.close(1008, "Dashboard Not Found")
      return
    }

    if (result.outcome === "closed") {
      safeSend(input.socket, {
        type: "error",
        dashboardId: input.dashboardId,
        message: `Dashboard is ${result.status}`,
      })
      input.socket.close(1008, "Dashboard closed for producer updates")
      return
    }

    safeSend(input.socket, {
      type: "ack",
      dashboardId: input.dashboardId,
      step: message.step,
      latestAcceptedStep: result.latestAcceptedStep,
    })

    if (result.outcome === "ignored") {
      return
    }

    const viewers = this.viewers.get(input.dashboardId)
    if (!viewers) {
      return
    }

    const snapshot: SnapshotMessage = {
      type: "state.snapshot",
      dashboardId: input.dashboardId,
      step: message.step,
      state: message.state,
    }

    for (const viewer of viewers) {
      safeSend(viewer, snapshot)
    }
  }
}

export const dashboardWsHub = new DashboardWsHub()
