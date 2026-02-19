import type { NextApiRequest, NextApiResponse } from "next"
import { z } from "zod/v4"

import { finalizeDashboard, type FinalizeDashboardPayload } from "@/lib/dashboard/store"
import { dashboardWsHub } from "@/lib/dashboard/ws-hub"

const finalizeDashboardBodySchema = z
  .object({
    lastStep: z.number().int().nonnegative(),
    finalStateSnapshot: z.record(z.string(), z.unknown()).optional(),
  })
  .loose()

type FinalizeDashboardResponse =
  | FinalizeDashboardPayload
  | {
      error: string
      latestAcceptedStep?: number | null
      issues?: string[]
    }

function getDashboardId(id: string | string[] | undefined) {
  if (Array.isArray(id)) {
    return id[0]
  }

  return id
}

function firstHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

export default function handler(req: NextApiRequest, res: NextApiResponse<FinalizeDashboardResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"])
    res.status(405).json({ error: "Method Not Allowed" })
    return
  }

  const dashboardId = getDashboardId(req.query.id)
  if (!dashboardId) {
    res.status(404).json({ error: "Dashboard Not Found" })
    return
  }

  const parsedBody = finalizeDashboardBodySchema.safeParse(req.body)
  if (!parsedBody.success) {
    const issues = parsedBody.error.issues.map((issue) => {
      const path = issue.path.length === 0 ? "body" : `body.${issue.path.join(".")}`
      return `${path}: ${issue.message}`
    })

    res.status(400).json({ error: "Invalid request body", issues })
    return
  }

  const idempotencyKey = firstHeaderValue(req.headers["idempotency-key"])
  const result = finalizeDashboard({
    dashboardId,
    lastStep: parsedBody.data.lastStep,
    finalStateSnapshot: parsedBody.data.finalStateSnapshot,
    idempotencyKey,
  })

  if (result.outcome === "not_found") {
    res.status(404).json({ error: "Dashboard Not Found" })
    return
  }

  if (result.outcome === "conflict") {
    res.status(409).json({
      error: "lastStep not accepted",
      latestAcceptedStep: result.latestAcceptedStep,
    })
    return
  }

  if (result.transitioned) {
    dashboardWsHub.notifyDashboardFinalized({ dashboardId })
  }

  res.status(200).json(result.result)
}
