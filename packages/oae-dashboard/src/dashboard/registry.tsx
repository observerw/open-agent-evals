import { defineRegistry } from "@json-render/react";
import { createContext, useContext, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ComposedChart,
  Funnel,
  FunnelChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  Sankey,
  Scatter,
  ScatterChart,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { catalog } from "./catalog";
import {
  adaptCartesian,
  adaptFunnel,
  adaptNameValue,
  adaptRadar,
  adaptSankey,
  adaptTreemap,
} from "./data/adapters";
import type { DashboardRow } from "./types";

type Datasets = Record<string, unknown>;

interface TableColumn {
  key: string;
  header: string;
  sortable?: boolean;
  filterable?: boolean;
  visible?: boolean;
}

interface TableSortState {
  key: string;
  direction: "asc" | "desc";
}

const DatasetsContext = createContext<Datasets>({});

function colorAt(index: number) {
  return `var(--chart-${(index % 5) + 1})`;
}

function makeSeriesConfig(keys: string[]): ChartConfig {
  return Object.fromEntries(
    keys.map((key, index) => [key, { label: key, color: colorAt(index) }]),
  ) as ChartConfig;
}

function rowsFromPath(dataPath: string, datasets: Datasets): DashboardRow[] {
  const match = /^\/datasets\/([^/]+)\/rows$/.exec(dataPath);
  if (!match) {
    return [];
  }
  const datasetId = match[1];
  if (!datasetId) {
    return [];
  }
  const rows = datasets[datasetId];
  return Array.isArray(rows) ? (rows as DashboardRow[]) : [];
}

function gridColsClass(columns?: number): string {
  switch (columns) {
    case 1:
      return "grid-cols-1";
    case 3:
      return "grid-cols-1 lg:grid-cols-3";
    case 4:
      return "grid-cols-1 md:grid-cols-2 xl:grid-cols-4";
    default:
      return "grid-cols-1 md:grid-cols-2";
  }
}

function useRows(dataPath: string): DashboardRow[] {
  const datasets = useContext(DatasetsContext);
  return rowsFromPath(dataPath, datasets);
}

function inferTableColumns(rows: DashboardRow[]): TableColumn[] {
  const firstRow = rows[0];
  if (!firstRow) {
    return [];
  }

  return Object.keys(firstRow).map(key => ({
    key,
    header: key,
    sortable: true,
    filterable: true,
    visible: true,
  }));
}

function formatTableCell(value: DashboardRow[string]): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toLocaleString() : String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

function compareTableCells(left: DashboardRow[string], right: DashboardRow[string]): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  const leftText = formatTableCell(left).toLowerCase();
  const rightText = formatTableCell(right).toLowerCase();
  if (leftText < rightText) {
    return -1;
  }
  if (leftText > rightText) {
    return 1;
  }
  return 0;
}

function ChartCardFrame({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="h-full">
      <CardHeader className="gap-1">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyState({ dataPath }: { dataPath: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
      No rows found for {dataPath}
    </div>
  );
}

function ChartCanvas({
  config,
  height,
  children,
}: {
  config: ChartConfig;
  height?: number;
  children: ComponentProps<typeof ChartContainer>["children"];
}) {
  return (
    <div className="w-full" style={{ height: height ?? 280 }}>
      <ChartContainer config={config} className="h-full w-full aspect-auto">
        {children}
      </ChartContainer>
    </div>
  );
}

export const { registry } = defineRegistry(catalog, {
  components: {
    DashboardShell: ({ props, children }) => (
      <DatasetsContext.Provider value={props.datasets}>
        <main className="space-y-6">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{props.title}</h1>
            {props.description ? <p className="text-sm text-muted-foreground">{props.description}</p> : null}
          </header>
          {children}
        </main>
      </DatasetsContext.Provider>
    ),

    GridLayout: ({ props, children }) => (
      <section className={cn("grid", gridColsClass(props.columns))} style={{ gap: props.gap ?? 16 }}>
        {children}
      </section>
    ),

    LineChartCard: ({ props }) => {
      const rows = useRows(props.dataPath);
      if (!rows.length) {
        return (
          <ChartCardFrame title={props.title} description={props.description}>
            <EmptyState dataPath={props.dataPath} />
          </ChartCardFrame>
        );
      }

      const data = adaptCartesian(rows, props.xField, props.yFields);
      const showLegend = props.showLegend ?? true;
      const showTooltip = props.showTooltip ?? true;

      return (
        <ChartCardFrame title={props.title} description={props.description}>
          <ChartCanvas config={makeSeriesConfig(props.yFields)} height={props.height}>
            <LineChart data={data} accessibilityLayer margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey={props.xField} tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              {showTooltip ? <ChartTooltip content={<ChartTooltipContent />} /> : null}
              {showLegend ? <ChartLegend /> : null}
              {props.yFields.map((field, index) => (
                <Line
                  key={field}
                  dataKey={field}
                  type="monotone"
                  stroke={colorAt(index)}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ChartCanvas>
        </ChartCardFrame>
      );
    },

    BarChartCard: ({ props }) => {
      const rows = useRows(props.dataPath);
      if (!rows.length) {
        return (
          <ChartCardFrame title={props.title} description={props.description}>
            <EmptyState dataPath={props.dataPath} />
          </ChartCardFrame>
        );
      }

      const data = adaptCartesian(rows, props.xField, props.yFields);
      const showLegend = props.showLegend ?? true;
      const showTooltip = props.showTooltip ?? true;

      return (
        <ChartCardFrame title={props.title} description={props.description}>
          <ChartCanvas config={makeSeriesConfig(props.yFields)} height={props.height}>
            <BarChart data={data} accessibilityLayer margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey={props.xField} tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              {showTooltip ? <ChartTooltip content={<ChartTooltipContent />} /> : null}
              {showLegend ? <ChartLegend /> : null}
              {props.yFields.map((field, index) => (
                <Bar key={field} dataKey={field} fill={colorAt(index)} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              ))}
            </BarChart>
          </ChartCanvas>
        </ChartCardFrame>
      );
    },

    AreaChartCard: ({ props }) => {
      const rows = useRows(props.dataPath);
      if (!rows.length) {
        return (
          <ChartCardFrame title={props.title} description={props.description}>
            <EmptyState dataPath={props.dataPath} />
          </ChartCardFrame>
        );
      }

      const data = adaptCartesian(rows, props.xField, props.yFields);
      const showLegend = props.showLegend ?? true;
      const showTooltip = props.showTooltip ?? true;

      return (
        <ChartCardFrame title={props.title} description={props.description}>
          <ChartCanvas config={makeSeriesConfig(props.yFields)} height={props.height}>
            <AreaChart data={data} accessibilityLayer margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey={props.xField} tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              {showTooltip ? <ChartTooltip content={<ChartTooltipContent />} /> : null}
              {showLegend ? <ChartLegend /> : null}
              {props.yFields.map((field, index) => (
                <Area
                  key={field}
                  dataKey={field}
                  type="monotone"
                  stroke={colorAt(index)}
                  fill={colorAt(index)}
                  fillOpacity={0.2}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ChartCanvas>
        </ChartCardFrame>
      );
    },

    ScatterChartCard: ({ props }) => {
      const rows = useRows(props.dataPath);
      if (!rows.length) {
        return (
          <ChartCardFrame title={props.title} description={props.description}>
            <EmptyState dataPath={props.dataPath} />
          </ChartCardFrame>
        );
      }

      const data = adaptCartesian(rows, props.xField, [props.yField]);
      const showTooltip = props.showTooltip ?? true;

      return (
        <ChartCardFrame title={props.title} description={props.description}>
          <ChartCanvas config={makeSeriesConfig([props.yField])} height={props.height}>
            <ScatterChart data={data} accessibilityLayer margin={{ left: 12, right: 12 }}>
              <CartesianGrid />
              <XAxis dataKey={props.xField} tickLine={false} axisLine={false} />
              <YAxis dataKey={props.yField} tickLine={false} axisLine={false} />
              {showTooltip ? <ChartTooltip content={<ChartTooltipContent />} /> : null}
              <Scatter name={props.yField} data={data} fill={colorAt(0)} isAnimationActive={false} />
            </ScatterChart>
          </ChartCanvas>
        </ChartCardFrame>
      );
    },

    PieChartCard: ({ props }) => {
      const rows = useRows(props.dataPath);
      if (!rows.length) {
        return (
          <ChartCardFrame title={props.title} description={props.description}>
            <EmptyState dataPath={props.dataPath} />
          </ChartCardFrame>
        );
      }

      const data = adaptNameValue(rows, props.nameField, props.valueField);
      const names = data.map(item => String(item.name));
      const showLegend = props.showLegend ?? true;
      const showTooltip = props.showTooltip ?? true;

      return (
        <ChartCardFrame title={props.title} description={props.description}>
          <ChartCanvas config={makeSeriesConfig(names)} height={props.height}>
            <PieChart accessibilityLayer>
              {showTooltip ? <ChartTooltip content={<ChartTooltipContent nameKey="name" />} /> : null}
              {showLegend ? <ChartLegend /> : null}
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={0}
                outerRadius={88}
                isAnimationActive={false}
              />
            </PieChart>
          </ChartCanvas>
        </ChartCardFrame>
      );
    },

    RadarChartCard: ({ props }) => {
      const rows = useRows(props.dataPath);
      if (!rows.length) {
        return (
          <ChartCardFrame title={props.title} description={props.description}>
            <EmptyState dataPath={props.dataPath} />
          </ChartCardFrame>
        );
      }

      const data = adaptRadar(rows, props.subjectField, props.valueField);
      const showLegend = props.showLegend ?? true;
      const showTooltip = props.showTooltip ?? true;

      return (
        <ChartCardFrame title={props.title} description={props.description}>
          <ChartCanvas config={makeSeriesConfig([props.valueField])} height={props.height}>
            <RadarChart data={data} accessibilityLayer outerRadius="72%">
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" />
              {showTooltip ? <ChartTooltip content={<ChartTooltipContent />} /> : null}
              {showLegend ? <ChartLegend /> : null}
              <Radar
                name={props.valueField}
                dataKey="value"
                stroke={colorAt(1)}
                fill={colorAt(1)}
                fillOpacity={0.3}
                isAnimationActive={false}
              />
            </RadarChart>
          </ChartCanvas>
        </ChartCardFrame>
      );
    },

    ComposedChartCard: ({ props }) => {
      const rows = useRows(props.dataPath);
      if (!rows.length) {
        return (
          <ChartCardFrame title={props.title} description={props.description}>
            <EmptyState dataPath={props.dataPath} />
          </ChartCardFrame>
        );
      }

      const fields = [props.barField, props.lineField];
      const data = adaptCartesian(rows, props.xField, fields);
      const showLegend = props.showLegend ?? true;
      const showTooltip = props.showTooltip ?? true;

      return (
        <ChartCardFrame title={props.title} description={props.description}>
          <ChartCanvas config={makeSeriesConfig(fields)} height={props.height}>
            <ComposedChart data={data} accessibilityLayer margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey={props.xField} tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              {showTooltip ? <ChartTooltip content={<ChartTooltipContent />} /> : null}
              {showLegend ? <ChartLegend /> : null}
              <Bar dataKey={props.barField} fill={colorAt(0)} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Line
                dataKey={props.lineField}
                type="monotone"
                stroke={colorAt(1)}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ChartCanvas>
        </ChartCardFrame>
      );
    },

    DonutChartCard: ({ props }) => {
      const rows = useRows(props.dataPath);
      if (!rows.length) {
        return (
          <ChartCardFrame title={props.title} description={props.description}>
            <EmptyState dataPath={props.dataPath} />
          </ChartCardFrame>
        );
      }

      const data = adaptNameValue(rows, props.nameField, props.valueField);
      const names = data.map(item => String(item.name));
      const showLegend = props.showLegend ?? true;
      const showTooltip = props.showTooltip ?? true;

      return (
        <ChartCardFrame title={props.title} description={props.description}>
          <ChartCanvas config={makeSeriesConfig(names)} height={props.height}>
            <PieChart accessibilityLayer>
              {showTooltip ? <ChartTooltip content={<ChartTooltipContent nameKey="name" />} /> : null}
              {showLegend ? <ChartLegend /> : null}
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={88}
                isAnimationActive={false}
              />
            </PieChart>
          </ChartCanvas>
        </ChartCardFrame>
      );
    },

    RadialBarChartCard: ({ props }) => {
      const rows = useRows(props.dataPath);
      if (!rows.length) {
        return (
          <ChartCardFrame title={props.title} description={props.description}>
            <EmptyState dataPath={props.dataPath} />
          </ChartCardFrame>
        );
      }

      const data = adaptNameValue(rows, props.nameField, props.valueField);
      const names = data.map(item => String(item.name));
      const showLegend = props.showLegend ?? true;
      const showTooltip = props.showTooltip ?? true;

      return (
        <ChartCardFrame title={props.title} description={props.description}>
          <ChartCanvas config={makeSeriesConfig(names)} height={props.height}>
            <RadialBarChart data={data} innerRadius="20%" outerRadius="92%" startAngle={90} endAngle={-270}>
              {showTooltip ? <ChartTooltip content={<ChartTooltipContent nameKey="name" />} /> : null}
              {showLegend ? <ChartLegend /> : null}
              <RadialBar dataKey="value" background isAnimationActive={false} />
            </RadialBarChart>
          </ChartCanvas>
        </ChartCardFrame>
      );
    },

    TreemapChartCard: ({ props }) => {
      const rows = useRows(props.dataPath);
      if (!rows.length) {
        return (
          <ChartCardFrame title={props.title} description={props.description}>
            <EmptyState dataPath={props.dataPath} />
          </ChartCardFrame>
        );
      }

      const data = adaptTreemap(rows, props.nameField, props.valueField);
      const tree = Array.isArray(data.children) ? data.children : [];
      if (!tree.length) {
        return (
          <ChartCardFrame title={props.title} description={props.description}>
            <EmptyState dataPath={props.dataPath} />
          </ChartCardFrame>
        );
      }

      const showTooltip = props.showTooltip ?? true;

      return (
        <ChartCardFrame title={props.title} description={props.description}>
          <ChartCanvas config={makeSeriesConfig([props.valueField])} height={props.height}>
            <Treemap data={tree} dataKey="size" nameKey="name" stroke="var(--border)" isAnimationActive={false}>
              {showTooltip ? <ChartTooltip content={<ChartTooltipContent nameKey="name" />} /> : null}
            </Treemap>
          </ChartCanvas>
        </ChartCardFrame>
      );
    },

    SankeyChartCard: ({ props }) => {
      const rows = useRows(props.dataPath);
      if (!rows.length) {
        return (
          <ChartCardFrame title={props.title} description={props.description}>
            <EmptyState dataPath={props.dataPath} />
          </ChartCardFrame>
        );
      }

      const data = adaptSankey(rows, props.sourceField, props.targetField, props.valueField);
      if (!data.nodes.length || !data.links.length) {
        return (
          <ChartCardFrame title={props.title} description={props.description}>
            <EmptyState dataPath={props.dataPath} />
          </ChartCardFrame>
        );
      }

      const showTooltip = props.showTooltip ?? true;

      return (
        <ChartCardFrame title={props.title} description={props.description}>
          <ChartCanvas config={makeSeriesConfig([props.valueField])} height={props.height}>
            <Sankey
              data={data}
              nodePadding={24}
              node={{ stroke: "var(--border)", fill: colorAt(0), fillOpacity: 0.85 }}
              link={{ stroke: colorAt(1), strokeOpacity: 0.35 }}
              margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              {showTooltip ? <ChartTooltip content={<ChartTooltipContent />} /> : null}
            </Sankey>
          </ChartCanvas>
        </ChartCardFrame>
      );
    },

    FunnelChartCard: ({ props }) => {
      const rows = useRows(props.dataPath);
      if (!rows.length) {
        return (
          <ChartCardFrame title={props.title} description={props.description}>
            <EmptyState dataPath={props.dataPath} />
          </ChartCardFrame>
        );
      }

      const data = adaptFunnel(rows, props.stageField, props.valueField);
      if (!data.length) {
        return (
          <ChartCardFrame title={props.title} description={props.description}>
            <EmptyState dataPath={props.dataPath} />
          </ChartCardFrame>
        );
      }

      const showTooltip = props.showTooltip ?? true;

      return (
        <ChartCardFrame title={props.title} description={props.description}>
          <ChartCanvas config={makeSeriesConfig([props.valueField])} height={props.height}>
            <FunnelChart>
              {showTooltip ? <ChartTooltip content={<ChartTooltipContent nameKey="stage" />} /> : null}
              <Funnel data={data} dataKey="value" nameKey="stage" isAnimationActive={false}>
                {data.map((item, index) => (
                  <Cell key={`${String(item.stage)}-${index}`} fill={String(item.fill)} />
                ))}
              </Funnel>
            </FunnelChart>
          </ChartCanvas>
        </ChartCardFrame>
      );
    },

    DataTableCard: ({ props }) => {
      const rows = useRows(props.dataPath);
      const sortableDefault = props.sortable ?? true;
      const filterableDefault = props.filterable ?? true;
      const [sort, setSort] = useState<TableSortState | null>(null);
      const [filters, setFilters] = useState<Record<string, string>>({});
      const [pageIndex, setPageIndex] = useState(0);

      const definedColumns = props.columns ?? [];
      const hasDefinedColumns = definedColumns.length > 0;
      const columns = (hasDefinedColumns ? definedColumns : inferTableColumns(rows)).filter(column => column.visible !== false);

      const filterableColumns = useMemo(() => {
        return columns.filter(column => (column.filterable ?? filterableDefault));
      }, [columns, filterableDefault]);

      const filteredRows = useMemo(() => {
        if (!filterableColumns.length) {
          return rows;
        }

        return rows.filter(row => {
          for (const column of filterableColumns) {
            const query = (filters[column.key] ?? "").trim().toLowerCase();
            if (!query) {
              continue;
            }
            const cell = formatTableCell(row[column.key]).toLowerCase();
            if (!cell.includes(query)) {
              return false;
            }
          }
          return true;
        });
      }, [rows, filterableColumns, filters]);

      const sortedRows = useMemo(() => {
        if (!sort) {
          return filteredRows;
        }

        const column = columns.find(item => item.key === sort.key);
        if (!column || !(column.sortable ?? sortableDefault)) {
          return filteredRows;
        }

        const nextRows = [...filteredRows].sort((left, right) => compareTableCells(left[sort.key], right[sort.key]));
        if (sort.direction === "desc") {
          nextRows.reverse();
        }
        return nextRows;
      }, [filteredRows, columns, sort, sortableDefault]);

      const pageSize = props.pageSize ?? 10;
      const showPagination = props.showPagination ?? true;
      const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
      const activePage = Math.min(pageIndex, totalPages - 1);
      const visibleRows = showPagination
        ? sortedRows.slice(activePage * pageSize, activePage * pageSize + pageSize)
        : sortedRows;

      if (!rows.length) {
        return (
          <ChartCardFrame title={props.title} description={props.description}>
            <EmptyState dataPath={props.dataPath} />
          </ChartCardFrame>
        );
      }

      if (!columns.length) {
        return (
          <ChartCardFrame title={props.title} description={props.description}>
            <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              No visible columns for {props.dataPath}
            </div>
          </ChartCardFrame>
        );
      }

      const toggleSort = (column: TableColumn) => {
        if (!(column.sortable ?? sortableDefault)) {
          return;
        }

        setPageIndex(0);
        setSort(current => {
          if (!current || current.key !== column.key) {
            return { key: column.key, direction: "asc" };
          }
          if (current.direction === "asc") {
            return { key: column.key, direction: "desc" };
          }
          return null;
        });
      };

      return (
        <ChartCardFrame title={props.title} description={props.description}>
          <div className="space-y-3">
            {!hasDefinedColumns ? (
              <p className="text-xs text-muted-foreground">Columns are auto-generated from the first row.</p>
            ) : null}

            {filterableColumns.length ? (
              <div className="grid gap-2 md:grid-cols-2">
                {filterableColumns.map(column => (
                  <Input
                    key={column.key}
                    value={filters[column.key] ?? ""}
                    onChange={event => {
                      const value = event.target.value;
                      setPageIndex(0);
                      setFilters(current => ({ ...current, [column.key]: value }));
                    }}
                    placeholder={`Filter ${column.header}`}
                    className="h-8 text-xs"
                  />
                ))}
              </div>
            ) : null}

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map(column => {
                      const sortable = column.sortable ?? sortableDefault;
                      const sortDirection = sort?.key === column.key ? sort.direction : null;

                      return (
                        <TableHead key={column.key}>
                          {sortable ? (
                            <button
                              type="button"
                              onClick={() => toggleSort(column)}
                              className="inline-flex items-center gap-1 text-left"
                            >
                              <span>{column.header}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {sortDirection === "asc" ? "▲" : sortDirection === "desc" ? "▼" : "↕"}
                              </span>
                            </button>
                          ) : (
                            <span>{column.header}</span>
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.length ? (
                    visibleRows.map((row, rowIndex) => (
                      <TableRow key={`${activePage * pageSize + rowIndex}`}>
                        {columns.map(column => (
                          <TableCell key={column.key}>{formatTableCell(row[column.key])}</TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-16 text-center text-muted-foreground">
                        No records match current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {showPagination ? (
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Page {activePage + 1} / {totalPages} • {sortedRows.length} rows
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={activePage <= 0}
                    onClick={() => setPageIndex(prev => Math.max(0, prev - 1))}
                  >
                    Prev
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={activePage >= totalPages - 1}
                    onClick={() => setPageIndex(prev => Math.min(totalPages - 1, prev + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">{sortedRows.length} rows</div>
            )}
          </div>
        </ChartCardFrame>
      );
    },
  },
});
