import { autoFixSpec, type Spec, type SpecIssue, validateSpec } from "@json-render/core"
import { z } from "zod/v4"

import { dashboardCatalog, GridPlacement } from "@/lib/dashboard/catalog"

const baseSpecSchema = z
  .object({
    root: z.string().min(1),
    elements: z.record(
      z.string(),
      z
        .object({
          type: z.string().min(1),
          props: z.unknown(),
          children: z.array(z.string()).optional(),
        })
        .loose(),
    ),
    state: z.record(z.string(), z.unknown()).optional(),
  })
  .loose()

export type DashboardSpec = typeof dashboardCatalog._specType

export type DashboardSpecPair = {
  liveSpec: DashboardSpec
  finalSpec: DashboardSpec
}

export class SpecServiceError extends Error {
  issues: string[]

  constructor(message: string, issues: string[]) {
    super(message)
    this.name = "SpecServiceError"
    this.issues = issues
  }
}

function formatSpecIssues(specName: "liveSpec" | "finalSpec", issues: SpecIssue[]): string[] {
  return issues.map((issue) => {
    const target = issue.elementKey ? `${specName}.elements.${issue.elementKey}` : specName
    return `${target}: ${issue.message}`
  })
}

function ensureWidgetPlacement(specName: "liveSpec" | "finalSpec", spec: DashboardSpec) {
  const issues: string[] = []

  for (const [elementKey, element] of Object.entries(spec.elements)) {
    if (element.type === "DashboardGrid") {
      continue
    }

    const props = element.props
    if (!props || typeof props !== "object") {
      issues.push(`${specName}.elements.${elementKey}: widget props must be an object`)
      continue
    }

    const placement = (props as { placement?: unknown }).placement
    const parsedPlacement = GridPlacement.safeParse(placement)
    if (!parsedPlacement.success) {
      issues.push(`${specName}.elements.${elementKey}: placement with valid colSpan/rowSpan is required`)
    }
  }

  if (issues.length > 0) {
    throw new SpecServiceError("Widget placement is required.", issues)
  }
}

function normalizeSingleSpec(specName: "liveSpec" | "finalSpec", input: unknown): DashboardSpec {
  const parsedShape = baseSpecSchema.safeParse(input)
  if (!parsedShape.success) {
    const issues = parsedShape.error.issues.map((issue) => {
      const path = issue.path.length === 0 ? specName : `${specName}.${issue.path.join(".")}`
      return `${path}: ${issue.message}`
    })
    throw new SpecServiceError(`${specName} has invalid shape.`, issues)
  }

  const spec = parsedShape.data as Spec
  const structureResult = validateSpec(spec)
  if (!structureResult.valid) {
    throw new SpecServiceError(`${specName} failed structural validation.`, formatSpecIssues(specName, structureResult.issues))
  }

  const fixed = autoFixSpec(spec).spec
  const fixedStructureResult = validateSpec(fixed)
  if (!fixedStructureResult.valid) {
    throw new SpecServiceError(`${specName} failed structural validation after auto-fix.`, formatSpecIssues(specName, fixedStructureResult.issues))
  }

  const catalogResult = dashboardCatalog.validate(fixed)
  if (!catalogResult.success || !catalogResult.data) {
    const issues = catalogResult.error?.issues.map((issue) => {
      const path = issue.path.length === 0 ? specName : `${specName}.${issue.path.join(".")}`
      return `${path}: ${issue.message}`
    }) ?? [`${specName}: catalog validation failed`]

    throw new SpecServiceError(`${specName} failed catalog validation.`, issues)
  }

  ensureWidgetPlacement(specName, catalogResult.data)
  return catalogResult.data
}

export function validateAndNormalizeDashboardSpecs(input: {
  liveSpec?: unknown
  finalSpec?: unknown
}): DashboardSpecPair {
  const missing: string[] = []

  if (input.liveSpec == null) {
    missing.push("liveSpec is required")
  }

  if (input.finalSpec == null) {
    missing.push("finalSpec is required")
  }

  if (missing.length > 0) {
    throw new SpecServiceError("Both liveSpec and finalSpec are required.", missing)
  }

  return {
    liveSpec: normalizeSingleSpec("liveSpec", input.liveSpec),
    finalSpec: normalizeSingleSpec("finalSpec", input.finalSpec),
  }
}
