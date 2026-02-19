import type { NextApiRequest, NextApiResponse } from "next"

import { buildDashboardPrompt, type DashboardPromptPayload } from "@/lib/dashboard/prompt"

type PromptApiResponse = DashboardPromptPayload | { error: string }

function getCatalogVersion(queryValue: string | string[] | undefined): string | undefined {
  if (Array.isArray(queryValue)) {
    return queryValue[0]
  }

  return queryValue
}

export default function handler(req: NextApiRequest, res: NextApiResponse<PromptApiResponse>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"])
    res.status(405).json({ error: "Method Not Allowed" })
    return
  }

  const catalogVersion = getCatalogVersion(req.query.catalogVersion)
  const payload = buildDashboardPrompt({ catalogVersion })

  res.status(200).json(payload)
}
