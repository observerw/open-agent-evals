# DESIGN: 基于 json-render 的智能数据展示 Dashboard

## 1. 文档信息

- 状态: In Progress
- 版本: v0.2
- 更新时间: 2026-02-12
- 目标项目: `packages/oae-dashboard`

---

## 2. 背景与目标

### 2.1 背景

当前 `oae-dashboard` 还是 Bun + React 模板页，尚未具备：

- AI 可读的 UI 生成约束（Catalog）
- JSON Spec 到 React 组件的运行时映射（Registry）
- 面向 agent 的系统提示词公共端点
- 多图表 + 数据表格统一渲染能力

我们希望把项目升级为一个“可由 agent 驱动生成 UI JSON，并在前端稳定渲染”的智能 Dashboard 基座。

### 2.2 目标

1. 在 `oae-dashboard` 中集成 `@json-render/core` + `@json-render/react`。
2. 集成 Recharts 与 shadcn chart + data-table 体系，覆盖尽可能多图表类型与表格展示场景。
3. 定义高约束、高可控 Catalog 与 Registry。
4. 将 `catalog.prompt()` 作为公共后端端点暴露给 agent 消费。
5. 建立 spec 校验、修复、渲染、调试的完整闭环。

### 2.3 非目标（当前阶段）

- 不在本阶段绑定某个单一模型供应商（OpenAI/Anthropic 等）。
- 不在本阶段实现复杂 RBAC/多租户权限系统。
- 不在本阶段建设生产级数据仓库或 ETL 流程。

---

## 3. 现状基线（来自当前仓库）

### 3.1 技术栈与约束

- 运行时: Bun
- 前端: React 19 + Tailwind 4 + shadcn 基础组件
- 构建: 自定义 `build.ts`（Bun build + tailwind plugin）
- 服务入口: `src/index.ts`（`Bun.serve` + routes map）
- 前端入口: `src/frontend.tsx`

### 3.2 现状问题

- 已覆盖 12 个图表类型（Line/Bar/Area/Composed/Scatter/Pie/Donut/Radar/RadialBar/Treemap/Sankey/Funnel），尚未支持结构化数据表格展示。
- API 已实现 `GET /api/v1/dashboard/catalog-prompt`、`GET /api/v1/dashboard/catalog-manifest`、`POST /api/v1/dashboard/spec/validate`、`POST /api/v1/dashboard/spec/autofix`。
- `DashboardPlayground` 目前是最小渲染画布，尚未完成三栏调试工作台（数据输入 / 渲染 / spec+校验）。

### 3.3 已有有利条件

- `styles/globals.css` 已定义 `--chart-1` 到 `--chart-5`，可直接用于 shadcn chart 主题。
- 已具备 shadcn 基础组件与别名（`@/components/ui`）。

---

## 4. 技术调研结论

## 4.1 json-render（核心能力）

- `defineCatalog(schema, ...)`：声明 AI 可生成的组件/动作边界。
- `defineRegistry(catalog, ...)`：把 Catalog 中的组件映射为 React 实现。
- `catalog.prompt()`：从 Catalog 自动生成系统提示词，可作为 agent 公共契约。
- 动态表达式：支持 `$path`、`$cond` 等延迟求值，适合数据驱动 UI。
- 质量闭环：`validateSpec` + `autoFixSpec` 用于校验与自动修复。
- 流式能力：可结合 `SpecStream` / `useUIStream` 实现增量 UI 生成与更新。

结论：Catalog 是“生成边界”，Registry 是“运行边界”，两者必须同源版本化。

## 4.2 shadcn/ui chart（与 Recharts 组合）

- 采用 Recharts 原生图元 + shadcn 包装组件（`ChartContainer`、`ChartTooltip`、`ChartLegend`）。
- 通过 `ChartConfig` 统一 label、icon、color 映射，提升多图表一致性。
- 建议使用 CSS 变量主题（`--chart-*`）驱动色板。
- 有 `accessibilityLayer` 可增强键盘可访问性和读屏语义。

结论：shadcn 负责风格与体验一致性，Recharts 负责绘制能力与图元生态。

## 4.3 Recharts（图表覆盖与边界）

- 笛卡尔: Line / Bar / Area / Scatter / Composed
- 极坐标: Pie / Radar / RadialBar
- 层级: Treemap（可扩展 Sunburst）
- 流程: Sankey / Funnel
- 交互图元: Tooltip / Legend / Brush / Reference\*

性能注意：SVG 渲染在超大点位下会退化，需配合下采样、关闭动画、节流 tooltip。

## 4.4 shadcn Data Table（结构化明细展示）

- Data Table 不是单一“万能组件”，推荐基于 `@tanstack/react-table` + `components/ui/table` 按场景组合。
- 列定义（`ColumnDef`）是核心约束点，应在 Catalog 中显式约束可见列、格式化与是否可排序/过滤。
- 首批能力建议覆盖：分页、排序、列过滤、列显隐、行选择；按需扩展行操作（Row Actions）。
- 与图表互补：图表负责趋势与结构，表格负责明细追溯与导出前校验。

结论：数据表格应作为一级可视化组件并入 Catalog/Registry，与图表共享数据路径与筛选状态。

---

## 5. 总体架构设计

### 5.1 架构分层

1. **数据层（Data Layer）**
   - 统一原始数据格式
   - 按图表类型适配为可渲染结构

2. **描述层（Catalog + Prompt Layer）**
   - 定义组件和动作 Schema
   - 生成系统提示词与能力清单

3. **执行层（Registry + Renderer Layer）**
   - 将 Spec 映射到 React 组件
   - 执行动作，更新状态，触发重渲染

4. **服务层（API Layer）**
   - 暴露 prompt、manifest、spec validate/autofix
   - 后续可扩展 generate/stream 端点

### 5.2 核心数据流

1. Agent 请求 `GET /api/v1/dashboard/catalog-prompt` 获取 system prompt。
2. Agent 基于用户数据与需求生成 UI Spec（JSON 或 JSONL patch stream）。
3. 前端/后端执行 `validateSpec`（必要时 `autoFixSpec`）。
4. `Renderer` + `registry` 渲染图表与布局。
5. 交互事件通过 actions 更新 state，触发 UI 响应。

### 5.3 文本时序图

```text
User Data -> Agent -> GET /catalog-prompt
Agent -> Generate Spec -> POST /spec/validate
Validate OK -> Frontend Renderer(registry)
Validate Failed -> POST /spec/autofix -> Renderer
User Interaction -> Action -> State Update -> Re-render
```

---

## 6. 目录与模块规划

建议在 `src/` 下新增：

```text
src/
  dashboard/
    catalog.ts
    registry.tsx
    prompt-rules.ts
    types.ts
    data/
      normalize.ts
      adapters.ts
      sample-data.ts
    components/
      layout/
        DashboardShell.tsx
        GridLayout.tsx
      charts/
        LineChartCard.tsx
        BarChartCard.tsx
        AreaChartCard.tsx
        ComposedChartCard.tsx
        ScatterChartCard.tsx
        PieChartCard.tsx
        DonutChartCard.tsx
        RadarChartCard.tsx
        RadialBarChartCard.tsx
        TreemapChartCard.tsx
        SankeyChartCard.tsx
        FunnelChartCard.tsx
      tables/
        DataTableCard.tsx
      common/
        ChartCardFrame.tsx
        EmptyState.tsx
    ui/
      DashboardPlayground.tsx
  components/ui/
    chart.tsx
```

---

## 7. 统一数据模型设计

## 7.1 标准输入模型（建议）

```ts
type Primitive = string | number | boolean | null;

type RecordRow = {
  [key: string]: Primitive;
};

interface DashboardDataset {
  id: string;
  title: string;
  description?: string;
  rows: RecordRow[];
  dimensions: string[];
  measures: string[];
  timeField?: string;
}
```

## 7.2 图表家族适配器

- Cartesian 适配：输出 `[{ x, y1, y2, ... }]`
- Pie/Donut 适配：输出 `[{ name, value, fill? }]`
- Radar/RadialBar 适配：输出 `[{ subject, value, fullMark? }]`
- Treemap 适配：输出树结构 `[{ name, children | size }]`
- Sankey 适配：输出 `{ nodes, links }`
- Funnel 适配：输出阶段序列 `[{ stage, value }]`
- DataTable 适配：输出 `{ rows, columns }`，其中 `columns` 至少包含 `key` 与 `header`

原则：agent 只引用“标准路径 + 字段语义”，不要直接耦合原始异构数据。

---

## 8. Catalog 设计

## 8.1 组件分层

1. 布局组件
   - `DashboardShell`
   - `GridLayout`
   - `SectionHeader`

2. 指标组件
   - `MetricCard`
   - `StatTrend`

3. 表格组件
   - `DataTableCard`

4. 图表组件（至少 12 种）
   - `LineChartCard`
   - `BarChartCard`
   - `AreaChartCard`
   - `ComposedChartCard`
   - `ScatterChartCard`
   - `PieChartCard`
   - `DonutChartCard`
   - `RadarChartCard`
   - `RadialBarChartCard`
   - `TreemapChartCard`
   - `SankeyChartCard`
   - `FunnelChartCard`

5. 交互/过滤组件
   - `DateRangeFilter`
   - `CategoryFilter`
   - `ToggleGroup`

## 8.2 图表组件通用 props（建议）

```ts
interface BaseChartProps {
  title: string;
  description?: string;
  dataPath: string; // JSON Pointer, e.g. /datasets/sales/rows
  xField?: string;
  yFields?: string[];
  categoryField?: string;
  valueField?: string;
  height?: number;
  syncId?: string;
  showLegend?: boolean;
  showTooltip?: boolean;
}
```

## 8.3 actions 设计

- `setState`: 通用状态更新（path + value）
- `setFilter`: 更新筛选器
- `setRange`: 更新时间范围
- `refreshData`: 触发数据刷新
- `drillDown`: 钻取维度
- `setTableSorting`: 更新表格排序状态
- `setTableFilters`: 更新表格列过滤状态
- `setTablePagination`: 更新表格分页状态

## 8.4 Prompt 规则（多图表多样性关键）

在 `catalog.prompt()` 自定义规则中增加：

1. 单个 dashboard 至少使用 4 个不同图表家族（笛卡尔/极坐标/层级/流程）。
2. 相同图表类型最多出现 2 次（除非明确要求）。
3. 数值对比优先 Bar/Line，占比优先 Pie/Donut，层级优先 Treemap，流向优先 Sankey。
4. 每个图表必须包含标题、数据来源路径、字段映射。
5. 优先输出可解释布局（头部指标 + 中部趋势 + 底部结构图）。
6. 需要明细对账、可导出记录、长尾列表时，优先补充 `DataTableCard`。

---

## 9. Registry 设计

## 9.1 映射策略

- `defineRegistry(catalog, { components })` 统一注册。
- 每个组件只接收“已解析 props”，内部不做复杂业务推断。
- 所有图表组件共享 `ChartCardFrame`，保证视觉一致。

## 9.2 容错策略

- `dataPath` 无数据: 渲染 `EmptyState` + 调试信息。
- 字段缺失: 显示字段映射错误，不让页面崩溃。
- 图表渲染异常: fallback 到文本提示卡片。
- 表格列定义缺失: 回退为自动列（取首行 key）并提示降级信息。

## 9.3 可扩展性

- 新图表只需新增：
  1. chart 组件
  2. catalog 组件定义
  3. registry 映射
  4. adapter（如数据形态特殊）

---

## 10. API 设计（Bun `src/index.ts`）

## 10.1 `GET /api/v1/dashboard/catalog-prompt`

用途：给 agent 提供 system prompt（公共读取端点）。

示例响应：

```json
{
  "catalogVersion": "2026-02-12",
  "prompt": "...",
  "supportedChartTypes": [
    "line",
    "bar",
    "area",
    "composed",
    "scatter",
    "pie",
    "donut",
    "radar",
    "radialBar",
    "treemap",
    "sankey",
    "funnel"
  ],
  "constraints": {
    "maxChartsPerView": 12,
    "preferDiverseChartFamilies": true
  }
}
```

## 10.2 `GET /api/v1/dashboard/catalog-manifest`

用途：返回结构化 catalog 能力清单（给调试工具/UI 使用）。

## 10.3 `POST /api/v1/dashboard/spec/validate`

用途：校验 agent 生成 spec。

请求：

```json
{
  "spec": { "root": { "type": "DashboardShell", "children": [] } }
}
```

响应：

```json
{
  "valid": false,
  "errors": [{ "path": "/root/children/0/props/dataPath", "message": "Required" }]
}
```

## 10.4 `POST /api/v1/dashboard/spec/autofix`

用途：对常见结构错误自动修复。

响应：

```json
{
  "fixed": true,
  "spec": { "root": { "type": "DashboardShell", "children": [] } },
  "changes": ["moved visible from props to element root"]
}
```

## 10.5 （可选）`POST /api/v1/dashboard/spec/generate`

后续接入模型时提供；当前阶段优先保留接口位，不强绑定 provider。

---

## 11. 前端工作台设计

## 11.1 页面布局

`DashboardPlayground` 建议三区：

1. 左侧：数据输入（JSON）与业务意图输入（prompt）
2. 中间：实时渲染画布（Renderer，支持图表 + 数据表格）
3. 右侧：spec 原文、validate 结果、autofix diff

## 11.2 App 入口改造

- 将 `src/App.tsx` 从模板页替换为 `DashboardPlayground`。
- `src/frontend.tsx` 保持入口职责不变，如需可增加顶层 providers。

## 11.3 交互闭环

- 用户修改数据或意图 -> 触发生成/导入 spec
- 先 validate，失败则提示一键 autofix
- 通过 Renderer 渲染结果，保留 error boundary

---

## 12. 可视化覆盖矩阵（首批）

| 家族   | 组件               | 典型场景        | 数据形态        |
| ------ | ------------------ | --------------- | --------------- |
| 笛卡尔 | LineChartCard      | 趋势            | x + 多 y        |
| 笛卡尔 | BarChartCard       | 类别对比        | x + 多 y        |
| 笛卡尔 | AreaChartCard      | 趋势占比/累计   | x + 多 y        |
| 笛卡尔 | ComposedChartCard  | 混合对比        | x + line/bar    |
| 笛卡尔 | ScatterChartCard   | 相关性          | x + y + z       |
| 极坐标 | PieChartCard       | 结构占比        | name + value    |
| 极坐标 | DonutChartCard     | 占比 + 中心指标 | name + value    |
| 极坐标 | RadarChartCard     | 多指标能力雷达  | subject + value |
| 极坐标 | RadialBarChartCard | 进度/KPI        | name + value    |
| 层级   | TreemapChartCard   | 层级聚合        | tree            |
| 流程   | SankeyChartCard    | 流向关系        | nodes + links   |
| 流程   | FunnelChartCard    | 转化漏斗        | stage + value   |
| 表格   | DataTableCard      | 明细查看/对账   | rows + columns  |

---

## 13. 性能与稳定性设计

1. 默认对实时或大数据图关闭动画（`isAnimationActive=false`）。
2. 大样本点位引入下采样策略（例如 LTTB，后续可插拔）。
3. Tooltip 高更新频率场景做节流。
4. `syncId` 仅在必要图表分组开启，避免全局同步开销。
5. 组件 `memo` 与稳定 key，降低无效重渲染。
6. 表格默认分页，长列表场景优先启用服务端分页或虚拟滚动。

---

## 14. 可访问性与体验设计

1. 启用 Recharts `accessibilityLayer`。
2. 颜色不作为唯一编码方式，配合图例、标签或线型区分。
3. 图表卡片统一包含标题与描述，便于读屏理解上下文。
4. 为关键图表提供文本摘要（可隐藏但可被读屏读取）。
5. 数据表格必须保留表头语义，行操作按钮提供 `sr-only` 可读标签。

---

## 15. 安全与治理

1. Prompt 端点返回只读能力描述，不返回敏感配置。
2. 所有生成 spec 必须过 validate，禁止直接盲渲染。
3. 建议在 API 层增加：版本号、速率限制、调用日志。
4. 在 prompt rules 中限制危险组件与超大布局（防止滥用）。

---

## 16. 测试策略

## 16.1 单元测试

- `catalog.ts`: 组件 schema、动作 schema、prompt 规则快照
- `adapters.ts`: 各图表数据转换
- `validate/autofix`: 典型坏 spec 样例

## 16.2 集成测试

- API: `catalog-prompt` / `validate` / `autofix`
- Renderer: 多图表 spec 渲染不崩溃
- Renderer: 多图表 + 数据表格混合 spec 渲染不崩溃

## 16.3 回归样例集

- 至少 10 套数据场景：销售、流量、转化、组织层级、渠道流向等。
- 至少 2 套明细数据场景：订单明细、渠道明细（含排序/过滤/分页）。
- 每次迭代跑固定 spec 快照，确保视觉结构不意外漂移。

---

## 17. 分阶段实施计划

## Phase 0: 初始化与依赖 (Done)

- 安装依赖：`@json-render/core`、`@json-render/react`、`recharts`、`zod` (Done)
- 增加 `components/ui/chart.tsx` (Done)
- 创建 `src/dashboard` 目录骨架 (Done)

## Phase 1: 数据层 (Done)

- 实现 `normalize.ts` 与 `adapters.ts` (Done)
- 完成各图表家族最小可用适配 (Done)
- 严格限制：所有字段强制非空，禁止空字符串 (Done)

## Phase 2: 组件层 (Done)

- 已完成 12 图组件映射：Line/Bar/Area/Composed/Scatter/Pie/Donut/Radar/RadialBar/Treemap/Sankey/Funnel (Done)

## Phase 3: Catalog + Registry (Done)

- `catalog.ts` 已落地基础 schema、actions 与 prompt rules (Done)
- `catalog.ts` 已补齐 12 图 schema，并同步扩展 `supportedChartTypes` 与 prompt 约束 (Done)
- 新增 `DataTableCard` schema 与表格交互约束（sorting/filtering/pagination）(Pending)
- `registry.tsx` 已完成 12 图映射与空数据 fallback (Done)
- 新增 `DataTableCard` registry 映射与自动列降级策略 (Pending)

## Phase 4: API 层 (Done)

- `GET /api/v1/dashboard/catalog-prompt` 已接入 (Done)
- `GET /api/v1/dashboard/catalog-manifest` 已接入 (Done)
- `POST /api/v1/dashboard/spec/validate` 已接入（schema + structure 双重校验）(Done)
- `POST /api/v1/dashboard/spec/autofix` 已接入 (Done)

## Phase 5: 前端工作台 (In Progress)

- `src/App.tsx` 已切换到 `DashboardPlayground`，并接入 `Renderer` + `registry` (Done)
- 三栏布局与调试面板（数据输入/validate/autofix diff）待实现 (Pending)

## Phase 6: 质量收敛 (Not Started)

- 补齐 Catalog/Registry/API 相关测试与回归样例 (Pending)
- 增加性能基准与稳定性验收项 (Pending)

---

## 18. 里程碑与验收标准

### M1（基础可跑）(Achieved)

- 可获取 `catalog.prompt`，可渲染至少 6 种图表。

### M2（能力完整）(Achieved)

- 支持 12 种图表，具备 validate/autofix 与容错。

### M3（可用于 agent）(In Progress)

- Prompt 端点稳定版本化，spec 生成到渲染闭环稳定。

### 验收标准（DoD）

1. Agent 能仅凭公共 prompt 生成可通过校验的 dashboard spec。
2. 单页至少展示 4 个不同图表家族。
3. 图表错误数据不会导致页面崩溃。
4. 核心 API 与转换逻辑具备自动化测试覆盖。

---

## 19. 风险与应对

1. **Recharts 版本兼容风险（React 19）**
   - 对策：锁定验证过的版本范围，记录升级策略。

2. **Agent 生成 spec 质量波动**
   - 对策：强化 prompt rules + validate/autofix + 示例驱动。

3. **图表类型增加导致维护复杂度上升**
   - 对策：统一 `BaseChartProps` + adapter 插件化。

4. **大数据性能问题**
   - 对策：下采样、禁动画、按需渲染、分组同步。

---

## 20. 立即执行清单（Next Actions）

1. 把 `DashboardPlayground` 升级为三栏工作台（数据输入 / 渲染 / spec+校验+autofix diff）。
2. 补齐 API 与渲染回归测试，形成 M2 验收基线。
3. 修复项目现存 TypeScript 严格模式告警（当前集中在 `build.ts`、`src/components/ui/chart.tsx`、`src/dashboard/data/normalize.ts`）。
