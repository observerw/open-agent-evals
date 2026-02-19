"use client"

import * as React from "react"
import type { ComponentFn } from "@json-render/react"

import { WidgetShell } from "@/components/dashboard/widgets/dashboard-grid"
import { cn } from "@/lib/utils"

type DashboardCatalog = typeof import("@/lib/dashboard/catalog").dashboardCatalog

function asProps<T extends object>(value: unknown): Partial<T> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Partial<T>
}

function toText(value: unknown): string {
  if (typeof value === "string") {
    return value
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }

  return ""
}

const VARIANT_CLASS = {
  body: "text-sm text-foreground",
  muted: "text-sm text-muted-foreground",
  lead: "text-base text-foreground",
  title: "text-xl font-semibold leading-tight text-foreground",
  metric: "text-3xl font-semibold tracking-tight text-foreground",
} as const

export const TextWidget: ComponentFn<DashboardCatalog, "TextWidget"> = ({
  props,
}) => {
  const rawTextProps = asProps<
    React.HTMLAttributes<HTMLElement> & {
      as?: "p" | "span" | "div" | "h1" | "h2" | "h3"
      variant?: keyof typeof VARIANT_CLASS
    }
  >(props.textProps)

  const {
    as = "p",
    variant = "body",
    className,
    ...textRest
  } = rawTextProps
  const Tag = as as React.ElementType

  return (
    <WidgetShell placement={props.placement} title={props.title}>
      <Tag
        {...textRest}
        className={cn(
          "whitespace-pre-wrap break-words",
          VARIANT_CLASS[variant] ?? VARIANT_CLASS.body,
          className
        )}
      >
        {toText(props.text)}
      </Tag>
    </WidgetShell>
  )
}
