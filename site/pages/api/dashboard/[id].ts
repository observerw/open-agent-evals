import type { NextApiRequest, NextApiResponse } from "next"

import { getDashboard, type DashboardRecord } from "@/lib/dashboard/store"

type DashboardDetailPayload = Pick<
  DashboardRecord,
  "dashboardId" | "status" | "activeLayout" | "liveSpec" | "finalSpec" | "liveStateSnapshot" | "finalStateSnapshot"
>

type DashboardDetailResponse =
  | DashboardDetailPayload
  | {
      error: string
    }

function getDashboardId(id: string | string[] | undefined) {
  if (Array.isArray(id)) {
    return id[0]
  }

  return id
}

export default function handler(req: NextApiRequest, res: NextApiResponse<DashboardDetailResponse>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"])
    res.status(405).json({ error: "Method Not Allowed" })
    return
  }

  const dashboardId = getDashboardId(req.query.id)
  if (!dashboardId) {
    res.status(404).json({ error: "Dashboard Not Found" })
    return
  }

  const dashboard = getDashboard(dashboardId)
  if (!dashboard) {
    res.status(404).json({ error: "Dashboard Not Found" })
    return
  }

  res.status(200).json({
    dashboardId: dashboard.dashboardId,
    status: dashboard.status,
    activeLayout: dashboard.activeLayout,
    liveSpec: dashboard.liveSpec,
    finalSpec: dashboard.finalSpec,
    liveStateSnapshot: dashboard.liveStateSnapshot,
    finalStateSnapshot: dashboard.finalStateSnapshot,
  })
}
