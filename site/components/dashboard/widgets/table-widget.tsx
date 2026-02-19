"use client"

import * as React from "react"
import type { ComponentFn } from "@json-render/react"

import { WidgetShell } from "@/components/dashboard/widgets/dashboard-grid"
import { cn } from "@/lib/utils"

type DashboardCatalog = typeof import("@/lib/dashboard/catalog").dashboardCatalog

type ColumnFormat = "text" | "number" | "percent" | "currency"

type ColumnDef = {
  key: string
  header: string
  align?: "left" | "center" | "right"
  format?: ColumnFormat
}

function asProps<T extends object>(value: unknown): Partial<T> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Partial<T>
}

function toRows(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) {
    return []
  }

  return data.filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && !Array.isArray(item)
  )
}

function toColumns(columns: unknown[]): ColumnDef[] {
  const result: ColumnDef[] = []

  for (const item of columns) {
    if (typeof item === "string") {
      result.push({ key: item, header: item })
      continue
    }

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue
    }

    const col = item as {
      key?: unknown
      header?: unknown
      align?: unknown
      format?: unknown
    }

    if (typeof col.key !== "string") {
      continue
    }

    result.push({
      key: col.key,
      header: typeof col.header === "string" ? col.header : col.key,
      align:
        col.align === "left" || col.align === "center" || col.align === "right"
          ? col.align
          : undefined,
      format:
        col.format === "text" ||
        col.format === "number" ||
        col.format === "percent" ||
        col.format === "currency"
          ? col.format
          : undefined,
    })
  }

  return result
}

function formatCell(value: unknown, format: ColumnFormat | undefined): string {
  if (value === null || value === undefined) {
    return ""
  }

  if (format === "percent" && typeof value === "number") {
    return `${(value * 100).toFixed(2)}%`
  }

  if (format === "currency" && typeof value === "number") {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value)
  }

  if (format === "number" && typeof value === "number") {
    return new Intl.NumberFormat().format(value)
  }

  return String(value)
}

export const TableWidget: ComponentFn<DashboardCatalog, "TableWidget"> = ({
  props,
}) => {
  const rows = toRows(props.data)
  const columns = toColumns(props.columns)
  const tableRoot = asProps<React.ComponentProps<"table">>(props.tableProps)
  const headerRoot = asProps<React.ComponentProps<"th">>(props.headerProps)
  const rowRoot = asProps<React.ComponentProps<"tr">>(props.rowProps)

  const { className: tableClassName, ...tableRest } = tableRoot
  const { className: headerClassName, ...headerRest } = headerRoot
  const { className: rowClassName, ...rowRest } = rowRoot

  return (
    <WidgetShell placement={props.placement} title={props.title} bodyClassName="min-h-0">
      <div className="overflow-auto rounded-xl border border-border/50">
        <table
          {...tableRest}
          className={cn("w-full border-separate border-spacing-0 text-sm", tableClassName)}
        >
          <thead className="bg-muted/40">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  {...headerRest}
                  className={cn(
                    "border-b border-border/60 px-3 py-2 text-left text-xs font-semibold tracking-wide text-muted-foreground",
                    column.align === "center" && "text-center",
                    column.align === "right" && "text-right",
                    headerClassName
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={`${rowIndex}`}
                {...rowRest}
                className={cn(
                  "bg-card/40 transition-colors hover:bg-muted/30",
                  rowClassName
                )}
              >
                {columns.map((column) => (
                  <td
                    key={`${rowIndex}-${column.key}`}
                    className={cn(
                      "border-b border-border/40 px-3 py-2 align-middle text-foreground",
                      column.align === "center" && "text-center",
                      column.align === "right" && "text-right"
                    )}
                  >
                    {formatCell(row[column.key], column.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WidgetShell>
  )
}
