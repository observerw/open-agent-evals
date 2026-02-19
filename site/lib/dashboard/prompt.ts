import { dashboardCatalog } from "@/lib/dashboard/catalog"

const DEFAULT_CATALOG_VERSION = "dashboard-v1"

const rules = [
  "Always create two specs together: liveSpec for streaming updates and finalSpec for post-finalize rendering.",
  "Treat snapshot step as strictly monotonic: each new state.snapshot must use a larger step than the previous accepted one.",
  "Finalize only after the last snapshot is acknowledged, and include lastStep equal to the latest accepted step.",
  "After finalize succeeds, producer updates are forbidden and must be rejected.",
  "Dashboard lifecycle is one-way: collecting -> finalizing -> finalized.",
] as const

export type DashboardPromptPayload = {
  prompt: string
  catalogVersion: string
  rules: string[]
}

export function buildDashboardPrompt(input?: { catalogVersion?: string }): DashboardPromptPayload {
  const requestedVersion = input?.catalogVersion?.trim()
  const catalogVersion = requestedVersion || DEFAULT_CATALOG_VERSION

  return {
    prompt: dashboardCatalog.prompt({ customRules: [...rules] }),
    catalogVersion,
    rules: [...rules],
  }
}
