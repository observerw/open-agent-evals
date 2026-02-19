import { describe, expect, test } from "bun:test"
import type { NextApiRequest, NextApiResponse } from "next"

import { dashboardWsHub, type DashboardWsSocket } from "@/lib/dashboard/ws-hub"
import dashboardDetailHandler from "@/pages/api/dashboard/[id]"
import finalizeDashboardHandler from "@/pages/api/dashboard/[id]/finalize"
import createDashboardHandler from "@/pages/api/dashboard/index"
import dashboardPromptHandler from "@/pages/api/dashboard/prompt"

type ReqInput = {
  method: string
  query?: Record<string, string | string[] | undefined>
  body?: unknown
  headers?: Record<string, string | string[] | undefined>
}

type MockRes<T> = NextApiResponse<T> & {
  statusCodeValue: number
  jsonValue: T | undefined
  headerValues: Record<string, string | number | readonly string[]>
}

function createReq(input: ReqInput): NextApiRequest {
  return {
    method: input.method,
    query: input.query ?? {},
    body: input.body,
    headers: input.headers ?? {},
  } as unknown as NextApiRequest
}

function createRes<T>(): MockRes<T> {
  const res = {} as MockRes<T>
  res.statusCodeValue = 200
  res.jsonValue = undefined
  res.headerValues = {}

  res.setHeader = (name, value) => {
    res.headerValues[name] = value
    return res
  }

  res.status = (statusCode) => {
    res.statusCodeValue = statusCode
    return res
  }

  res.json = (body) => {
    res.jsonValue = body
    return res
  }

  res.end = () => res

  return res
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseSocketMessages(socket: MockSocket) {
  return socket.sentMessages.map((raw) => JSON.parse(raw) as Record<string, unknown>)
}

class MockSocket implements DashboardWsSocket {
  readonly sentMessages: string[] = []

  closed = false

  closeCode: number | undefined

  closeReason: string | undefined

  private readonly listeners: {
    message: Array<(data: unknown) => void>
    close: Array<() => void>
  } = {
    message: [],
    close: [],
  }

  on(event: "message" | "close", listener: ((data: unknown) => void) | (() => void)) {
    if (event === "message") {
      this.listeners.message.push(listener as (data: unknown) => void)
      return
    }

    this.listeners.close.push(listener as () => void)
  }

  send(data: string) {
    this.sentMessages.push(data)
  }

  close(code?: number, reason?: string) {
    if (this.closed) {
      return
    }

    this.closed = true
    this.closeCode = code
    this.closeReason = reason

    for (const listener of this.listeners.close) {
      listener()
    }
  }

  emitMessage(data: unknown) {
    if (this.closed) {
      return
    }

    for (const listener of this.listeners.message) {
      listener(data)
    }
  }
}

describe("M8 dashboard acceptance flow", () => {
  test("covers prompt -> create -> ws snapshot -> finalize -> idempotency", () => {
    const liveSpec = {
      root: "dashboard_root",
      elements: {
        dashboard_root: {
          type: "DashboardGrid",
          props: { columns: 12, gap: "md", densePacking: true },
          children: ["live_text"],
        },
        live_text: {
          type: "TextWidget",
          props: {
            title: "Live headline",
            placement: { colSpan: 12, rowSpan: 1 },
            text: { $state: "/summary/liveHeadline" },
          },
          children: [],
        },
      },
    }

    const finalSpec = {
      root: "dashboard_root",
      elements: {
        dashboard_root: {
          type: "DashboardGrid",
          props: { columns: 12, gap: "md", densePacking: true },
          children: ["final_text"],
        },
        final_text: {
          type: "TextWidget",
          props: {
            title: "Final headline",
            placement: { colSpan: 12, rowSpan: 1 },
            text: { $state: "/summary/finalHeadline" },
          },
          children: [],
        },
      },
    }

    const promptReq = createReq({ method: "GET" })
    const promptRes = createRes<unknown>()
    dashboardPromptHandler(promptReq, promptRes)
    expect(promptRes.statusCodeValue).toBe(200)
    expect(isRecord(promptRes.jsonValue)).toBeTrue()

    const createReqPayload = createReq({
      method: "POST",
      headers: {
        host: "localhost:3000",
        "x-forwarded-proto": "http",
      },
      body: {
        liveSpec,
        finalSpec,
      },
    })
    const createResPayload = createRes<unknown>()
    createDashboardHandler(createReqPayload, createResPayload)

    expect(createResPayload.statusCodeValue).toBe(200)
    expect(isRecord(createResPayload.jsonValue)).toBeTrue()
    if (!isRecord(createResPayload.jsonValue) || typeof createResPayload.jsonValue.dashboardId !== "string") {
      throw new Error("Create dashboard response missing dashboardId")
    }

    const dashboardId = createResPayload.jsonValue.dashboardId

    const viewer = new MockSocket()
    dashboardWsHub.connect({
      socket: viewer,
      dashboardId,
      role: "viewer",
    })

    const producer = new MockSocket()
    dashboardWsHub.connect({
      socket: producer,
      dashboardId,
      role: "producer",
    })

    producer.emitMessage(
      JSON.stringify({
        type: "state.snapshot",
        dashboardId,
        step: 1,
        state: {
          summary: {
            liveHeadline: "live step 1",
          },
        },
      }),
    )

    const producerMessages = parseSocketMessages(producer)
    expect(producerMessages.some((message) => message.type === "ack" && message.latestAcceptedStep === 1)).toBeTrue()

    const viewerMessages = parseSocketMessages(viewer)
    expect(viewerMessages.some((message) => message.type === "state.snapshot" && message.step === 1)).toBeTrue()

    const finalizeConflictReq = createReq({
      method: "POST",
      query: { id: dashboardId },
      body: { lastStep: 0 },
    })
    const finalizeConflictRes = createRes<unknown>()
    finalizeDashboardHandler(finalizeConflictReq, finalizeConflictRes)

    expect(finalizeConflictRes.statusCodeValue).toBe(409)
    expect(isRecord(finalizeConflictRes.jsonValue)).toBeTrue()
    if (!isRecord(finalizeConflictRes.jsonValue)) {
      throw new Error("Finalize conflict response missing body")
    }
    expect(finalizeConflictRes.jsonValue.latestAcceptedStep).toBe(1)

    const finalizeReq = createReq({
      method: "POST",
      query: { id: dashboardId },
      headers: {
        "idempotency-key": "m8-finalize-key",
      },
      body: {
        lastStep: 1,
        finalStateSnapshot: {
          summary: {
            finalHeadline: "final result",
          },
        },
      },
    })
    const finalizeRes = createRes<unknown>()
    finalizeDashboardHandler(finalizeReq, finalizeRes)

    expect(finalizeRes.statusCodeValue).toBe(200)
    expect(isRecord(finalizeRes.jsonValue)).toBeTrue()
    if (!isRecord(finalizeRes.jsonValue)) {
      throw new Error("Finalize response missing body")
    }
    expect(finalizeRes.jsonValue.status).toBe("finalized")
    expect(finalizeRes.jsonValue.activeLayout).toBe("final")

    const finalizedEventCountAfterFirstFinalize = parseSocketMessages(viewer).filter(
      (message) => message.type === "dashboard.finalized",
    ).length
    expect(finalizedEventCountAfterFirstFinalize).toBe(1)
    expect(producer.closed).toBeTrue()

    const lateProducer = new MockSocket()
    dashboardWsHub.connect({
      socket: lateProducer,
      dashboardId,
      role: "producer",
    })
    const lateProducerMessages = parseSocketMessages(lateProducer)
    expect(lateProducerMessages.some((message) => message.type === "error" && message.message === "Dashboard is finalized")).toBeTrue()
    expect(lateProducer.closed).toBeTrue()

    const finalizeReqRetry = createReq({
      method: "POST",
      query: { id: dashboardId },
      headers: {
        "idempotency-key": "m8-finalize-key",
      },
      body: {
        lastStep: 1,
        finalStateSnapshot: {
          summary: {
            finalHeadline: "ignored retry payload",
          },
        },
      },
    })
    const finalizeResRetry = createRes<unknown>()
    finalizeDashboardHandler(finalizeReqRetry, finalizeResRetry)

    expect(finalizeResRetry.statusCodeValue).toBe(200)
    expect(finalizeResRetry.jsonValue).toEqual(finalizeRes.jsonValue)

    const finalizedEventCountAfterRetry = parseSocketMessages(viewer).filter(
      (message) => message.type === "dashboard.finalized",
    ).length
    expect(finalizedEventCountAfterRetry).toBe(1)

    const detailReq = createReq({
      method: "GET",
      query: { id: dashboardId },
    })
    const detailRes = createRes<unknown>()
    dashboardDetailHandler(detailReq, detailRes)

    expect(detailRes.statusCodeValue).toBe(200)
    expect(isRecord(detailRes.jsonValue)).toBeTrue()
    if (!isRecord(detailRes.jsonValue)) {
      throw new Error("Dashboard detail response missing body")
    }

    expect(detailRes.jsonValue.status).toBe("finalized")
    expect(detailRes.jsonValue.activeLayout).toBe("final")
    expect(isRecord(detailRes.jsonValue.finalStateSnapshot)).toBeTrue()
  })
})
