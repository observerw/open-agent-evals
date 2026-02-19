import type { NextApiRequest, NextApiResponse } from "next"
import { z } from "zod/v4"

import { SpecServiceError, validateAndNormalizeDashboardSpecs } from "@/lib/dashboard/spec-service"
import { createDashboard } from "@/lib/dashboard/store"

const createDashboardBodySchema = z
  .object({
    liveSpec: z.unknown().optional(),
    finalSpec: z.unknown().optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .loose()

type CreateDashboardResponse =
  | {
      dashboardId: string
      viewerUrl: string
      wsUrl: string
      status: "collecting" | "finalizing" | "finalized"
    }
  | {
      error: string
      issues?: string[]
    }

function getOrigin(req: NextApiRequest) {
  const forwardedProto = req.headers["x-forwarded-proto"]
  const protocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto
  const host = req.headers.host ?? "localhost:3000"

  return `${protocol ?? "http"}://${host}`
}

export default function handler(req: NextApiRequest, res: NextApiResponse<CreateDashboardResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"])
    res.status(405).json({ error: "Method Not Allowed" })
    return
  }

  const parsedBody = createDashboardBodySchema.safeParse(req.body)
  if (!parsedBody.success) {
    const issues = parsedBody.error.issues.map((issue) => {
      const path = issue.path.length === 0 ? "body" : `body.${issue.path.join(".")}`
      return `${path}: ${issue.message}`
    })

    res.status(400).json({ error: "Invalid request body", issues })
    return
  }

  try {
    const normalizedSpecs = validateAndNormalizeDashboardSpecs(parsedBody.data)
    const dashboard = createDashboard({
      ...normalizedSpecs,
      meta: parsedBody.data.meta,
    })

    const origin = getOrigin(req)
    const viewerUrl = new URL(`/dashboard/${dashboard.dashboardId}`, origin).toString()
    const wsUrlValue = new URL(`/api/dashboard/ws?dashboardId=${dashboard.dashboardId}&role=viewer`, origin)
    wsUrlValue.protocol = wsUrlValue.protocol === "https:" ? "wss:" : "ws:"

    res.status(200).json({
      dashboardId: dashboard.dashboardId,
      viewerUrl,
      wsUrl: wsUrlValue.toString(),
      status: dashboard.status,
    })
  } catch (error) {
    if (error instanceof SpecServiceError) {
      res.status(400).json({ error: error.message, issues: error.issues })
      return
    }

    res.status(500).json({ error: "Internal Server Error" })
  }
}
