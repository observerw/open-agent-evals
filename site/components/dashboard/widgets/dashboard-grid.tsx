"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

const GAP_CLASSES = {
  sm: "gap-4",
  md: "gap-6",
  lg: "gap-8",
} as const

export type GridGap = keyof typeof GAP_CLASSES

export interface DashboardGridProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "style"> {
  columns: number
  gap?: GridGap
  densePacking?: boolean
  style?: React.CSSProperties
}

export interface WidgetPlacement {
  colSpan: number
  rowSpan: number
}

export interface WidgetShellProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "title"> {
  placement: WidgetPlacement
  title?: React.ReactNode
  bodyClassName?: string
  style?: React.CSSProperties
}

export function DashboardGrid({
  columns,
  gap = "md",
  densePacking = false,
  style,
  className,
  children,
  ...rest
}: DashboardGridProps) {
  const gapClass = GAP_CLASSES[gap] ?? GAP_CLASSES.md
  const gridStyle: React.CSSProperties = {
    ...style,
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gridAutoFlow: densePacking ? "row dense" : "row",
  }

  return (
    <div
      className={cn("grid w-full", gapClass, className)}
      style={gridStyle}
      {...rest}
    >
      {children}
    </div>
  )
}

export function WidgetShell({
  placement,
  title,
  bodyClassName,
  className,
  style,
  children,
  ...rest
}: WidgetShellProps) {
  const placementStyle: React.CSSProperties = {
    ...style,
    gridColumn: `span ${placement.colSpan}`,
    gridRow: `span ${placement.rowSpan}`,
  }

  return (
    <div
      className={cn(
        "grid gap-3 rounded-3xl border border-border/30 bg-card/70 p-4 shadow-[0_4px_30px_rgba(15,23,42,0.08)] ring-1 ring-border/10",
        className
      )}
      style={placementStyle}
      {...rest}
    >
      {title ? (
        <div className="text-sm font-semibold leading-snug text-foreground">
          {title}
        </div>
      ) : null}
      <div className={cn("flex flex-1 flex-col", bodyClassName)}>{children}</div>
    </div>
  )
}
