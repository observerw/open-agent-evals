# Agent 布局驱动 Dashboard 设计文档（可追踪）

## 0. 文档元信息

- 版本：v1.3
- 最近更新：2026-02-19
- 当前状态：可进入实现阶段
- 进度标记：`[ ]` 未开始，`[~]` 进行中，`[x]` 已完成

## 1. 边界与目标

### 1.1 外部 agent 负责（本项目不负责）

1. 数据特征分析（字段识别、图表类型选择、布局决策）；
2. 按 prompt 生成两套 dashboard spec：`liveSpec`（推流中）与 `finalSpec`（推流结束后的静态展示）；
3. 推流阶段每个 step 向 WebSocket 推送一次当前完整数据 snapshot；
4. 推送最后一个 step 并收到 `ack` 后，向该 dashboard 发起一次 `POST finalize`；finalize 成功后关闭 WS，后续不再更新。

### 1.2 本项目负责

1. 提供 `GET /api/dashboard/prompt`，输出可供 agent 生成 spec 的约束与组件说明；
2. 提供 `POST /api/dashboard` 和 `GET /api/dashboard/[id]`，完成双布局 spec 的校验、存储、读取；
3. 提供 WebSocket 通道，把 agent 推送的 live snapshot 更新到 dashboard 运行时；
4. 提供 `POST /api/dashboard/[id]/finalize`，在推流结束后切换到 final 布局并冻结更新；
5. 使用 json-render 渲染 dashboard，保证“布局由 spec 决定，数据由 data-binding 驱动”。

### 1.3 硬性约束

- 必须使用 `defineCatalog` 定义组件能力；
- 必须使用 `defineRegistry` 绑定真实组件；
- dashboard 必须支持栅格布局与每组件 `colSpan/rowSpan`；
- props 设计采用“透传优先”：绝大多数字段直接透传到底层组件；
- 每个 dashboard 必须在创建时一次性提交 `liveSpec` 与 `finalSpec` 两套布局；
- 生命周期必须遵循 `collecting -> finalizing -> finalized`，且只能单向流转；
- 每条 snapshot 必须带单调递增 `step`；
- finalize 必须幂等，且必须携带 `lastStep` 用于一致性校验；
- finalize 之后必须拒绝后续 producer 更新；
- API + WebSocket 使用 Next.js API Routes（`pages/api`）。

## 2. 调研结论（已完成）

### 2.1 json-render

- `@json-render/core`：catalog/schema 定义、prompt 生成、spec 校验；
- `@json-render/react`：`defineRegistry + Renderer` 渲染，支持 `$state` 等绑定表达式；
- `@json-render/shadcn`：定义与实现分离，服务端可安全引用 catalog 定义。

### 2.2 Shadcn Chart / Recharts

- 图表核心是 Recharts，`ChartContainer` 用于配置上下文与样式变量；
- 工程必备约束：图表容器要有明确高度；默认开启 `accessibilityLayer`；
- 本项目采用“透传优先”，即尽量把 Recharts/shadcn 的 props 原样暴露给 agent 使用。

### 2.3 Next.js API 与 WebSocket

- App Route Handlers 文档未给出一等 WebSocket 升级接口；
- `pages/api` 基于 Node `req/res`，更适合承载 WebSocket 升级与长连接；
- 本方案统一使用 `pages/api` 承载 HTTP + WS。

## 3. 范围与非目标

### 3.1 范围

- prompt 下发 -> agent 产出双布局 spec -> spec 入库 -> WebSocket live 数据推流 -> finalize 切换到静态布局。

### 3.2 非目标

- 本项目不做数据特征分析与图表推荐；
- 不做可视化拖拽编辑器；
- 不做多租户计费与复杂权限；
- 不在首期实现分布式高可用（先内存存储，预留升级口）。

## 4. 总体架构

### 4.1 组件视图

- `PromptService`：生成并返回 catalog prompt + 规则说明；
- `SpecService`：校验与持久化 `liveSpec/finalSpec`；
- `DashboardStore`：保存双布局 spec、`liveState/finalState`、生命周期状态与会话映射；
- `StreamHub(WebSocket)`：接收 producer 消息并广播 viewer；
- `FinalizeService`：处理推流完成后的 finalize 请求并切换布局；
- `DashboardRuntime`：根据当前 `activeLayout` 读取对应 `spec + state` 并渲染。

### 4.2 端到端时序

1. `GET /api/dashboard/prompt`：agent 拉取 prompt；
2. `POST /api/dashboard`：agent 提交 `liveSpec + finalSpec`，服务端返回 `dashboardId`；
3. `WS /api/dashboard/ws?dashboardId=...&role=producer`：agent 每个 step 推送一次完整 snapshot；
4. 页面以 `role=viewer` 建连并实时接收 live state 更新；
5. producer 推送最后一帧 `step=N` 并收到 `ack(N)`；
6. agent 调用 `POST /api/dashboard/[id]/finalize`（携带 `lastStep=N`），服务端原子切换 `activeLayout=final` 并冻结后续更新；
7. agent 关闭 producer WS（或由服务端主动断开）。

## 5. Catalog 设计（透传优先）

### 5.1 设计原则

- 仅保留少量平台级字段：`placement`、`title`（可选）；
- 大多数组件配置使用透传对象，不对 Recharts/shadcn props 做过度抽象；
- 数据绑定优先通过 `$state` 注入到 `data` 或其他目标字段。

### 5.2 通用 schema

```ts
import { z } from "zod";

const GridPlacement = z.object({
  colSpan: z.number().int().min(1).max(12),
  rowSpan: z.number().int().min(1).max(8),
});

const PassThrough = z.record(z.string(), z.any());

const WidgetBase = z.object({
  title: z.string().optional(),
  placement: GridPlacement,
});
```

### 5.3 组件定义清单

1. `DashboardGrid`
   - `columns`、`gap`、`densePacking`
   - slots: `default`

2. `LineChartWidget`
   - `WidgetBase`
   - `data`（支持 `$state`）
   - `chartConfig`（可选）
   - `chartProps` / `xAxisProps` / `yAxisProps` / `tooltipProps` / `legendProps`
   - `series`（每条线的 `dataKey` + `lineProps`）

3. `BarChartWidget`
   - `WidgetBase`
   - `data`（支持 `$state`）
   - `chartConfig`（可选）
   - `chartProps` / `xAxisProps` / `yAxisProps` / `tooltipProps` / `legendProps`
   - `bars`（每个 bar 的 `dataKey` + `barProps`）

4. `PieChartWidget`
   - `WidgetBase`
   - `data`（支持 `$state`）
   - `chartConfig`（可选）
   - `chartProps` / `pieProps` / `tooltipProps` / `legendProps`

5. `TableWidget`
   - `WidgetBase`
   - `data`（支持 `$state`）
   - `columns`
   - `tableProps` / `headerProps` / `rowProps`（透传）

6. `TextWidget`
   - `WidgetBase`
   - `text`
   - `textProps`（透传）

### 5.4 defineCatalog 草案

```ts
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";

export const dashboardCatalog = defineCatalog(schema, {
  components: {
    DashboardGrid: { props: DashboardGridProps, slots: ["default"], description: "dashboard 栅格容器" },
    LineChartWidget: { props: LineChartWidgetProps, description: "折线图（透传优先）" },
    BarChartWidget: { props: BarChartWidgetProps, description: "柱状图（透传优先）" },
    PieChartWidget: { props: PieChartWidgetProps, description: "饼/环图（透传优先）" },
    TableWidget: { props: TableWidgetProps, description: "表格（透传优先）" },
    TextWidget: { props: TextWidgetProps, description: "文本块" },
  },
  actions: {},
});
```

## 6. Registry 设计（defineRegistry）

### 6.1 组件映射

```ts
import { defineRegistry } from "@json-render/react";

export const dashboardRegistry = defineRegistry(dashboardCatalog, {
  components: {
    DashboardGrid,
    LineChartWidget,
    BarChartWidget,
    PieChartWidget,
    TableWidget,
    TextWidget,
  },
});
```

### 6.2 渲染实现约束

- 图表组件必须基于 `components/ui/chart.tsx`（`ChartContainer/ChartTooltip/ChartLegend`）；
- 保留透传能力，但系统字段（如 `placement`）不可被透传覆盖；
- 图表最小高度默认 `min-h-[240px]`；
- Recharts 根组件默认启用 `accessibilityLayer`。

## 7. Spec 与 Data-Binding 约束

### 7.1 约束

- 创建 dashboard 时必须同时提供 `liveSpec` 和 `finalSpec`；
- `liveSpec` 与 `finalSpec` 的组件结构和绑定数据路径允许不同；
- 每个 widget 必须声明 `placement`；
- 动态数据应通过 `$state` 绑定注入到 `data` 字段；
- 允许静态文案与小型静态配置；
- 不建议在 spec 中内联大数据数组；
- finalize 成功后只渲染 `finalSpec` 并停止接收 producer 更新。

### 7.2 示例（片段）

以下示例为 `liveSpec` 片段：

```json
{
  "root": "dashboard_root",
  "elements": {
    "dashboard_root": {
      "type": "DashboardGrid",
      "props": { "columns": 12, "gap": "md", "densePacking": true },
      "children": ["w_line_1"]
    },
    "w_line_1": {
      "type": "LineChartWidget",
      "props": {
        "title": "营收趋势",
        "placement": { "colSpan": 12, "rowSpan": 3 },
        "data": { "$state": "/data/revenueSeries" },
        "chartProps": { "margin": { "left": 8, "right": 8 }, "accessibilityLayer": true },
        "xAxisProps": { "dataKey": "ts" },
        "yAxisProps": {},
        "series": [
          {
            "dataKey": "revenue",
            "lineProps": { "stroke": "var(--chart-1)", "strokeWidth": 2, "type": "monotone" }
          }
        ],
        "tooltipProps": {},
        "legendProps": {}
      }
    }
  }
}
```

## 8. API Routes 与 WebSocket 设计

### 8.1 路由列表

1. `GET /api/dashboard/prompt`
   - 入参：`catalogVersion?`
   - 出参：`{ prompt, catalogVersion, rules }`（rules 包含“双布局 + finalize”约束）

2. `POST /api/dashboard`
   - 入参：`{ liveSpec, finalSpec, meta? }`
   - 服务端：`validateSpec -> autoFixSpec -> 规则校验 -> 持久化`
   - 出参：`{ dashboardId, viewerUrl, wsUrl, status }`

3. `GET /api/dashboard/[id]`
   - 出参：`{ dashboardId, status, activeLayout, liveSpec, finalSpec, liveStateSnapshot, finalStateSnapshot }`

4. `POST /api/dashboard/[id]/finalize`
   - 入参：`{ lastStep, finalStateSnapshot? }`
   - Header：`Idempotency-Key`（推荐）
   - 服务端：
     - 若 `lastStep` 尚未被接收，返回 `409`；
     - 幂等处理重复 finalize；
     - 原子更新 `status=finalized` 与 `activeLayout=final`，并关闭/拒绝后续 producer 更新
   - 出参：`{ dashboardId, status, activeLayout }`

5. `GET /api/dashboard/ws`
   - Query：`dashboardId`、`role=producer|viewer`、`token`
   - WebSocket：
     - producer 上行：`state.snapshot`（每个 step 一条，携带完整 live 状态）
     - server 下行：`state.snapshot`（广播给 viewer）/ `ack` / `dashboard.finalized` / `error`
     - 限制：
       - `status=finalized` 后拒绝 producer 连接或消息；
       - `step` 必须单调递增，重复/过旧 step 忽略（可返回最新 ack）

### 8.2 WebSocket 消息协议（首版）

```json
{
  "type": "state.snapshot",
  "dashboardId": "db_xxx",
  "step": 12,
  "state": {
    "data": {}
  }
}
```

```json
{
  "type": "ack",
  "dashboardId": "db_xxx",
  "step": 12,
  "latestAcceptedStep": 12
}
```

```json
{
  "type": "dashboard.finalized",
  "dashboardId": "db_xxx",
  "activeLayout": "final"
}
```

```json
{
  "lastStep": 12,
  "finalStateSnapshot": {
    "data": {}
  }
}
```

## 9. 代码结构规划

```text
app/
  dashboard/[id]/page.tsx
components/
  dashboard/runtime.tsx
  dashboard/widgets/
    dashboard-grid.tsx
    line-chart-widget.tsx
    bar-chart-widget.tsx
    pie-chart-widget.tsx
    table-widget.tsx
    text-widget.tsx
lib/
  dashboard/catalog.ts
  dashboard/registry.tsx
  dashboard/prompt.ts
  dashboard/spec-service.ts
  dashboard/store.ts
  dashboard/ws-hub.ts
pages/
  api/dashboard/prompt.ts
  api/dashboard/index.ts
  api/dashboard/[id].ts
  api/dashboard/[id]/finalize.ts
  api/dashboard/ws.ts
```

## 10. 实施计划（可追踪）

| ID | 任务 | 主要产出 | 状态 | 验收标准 |
|---|---|---|---|---|
| M0 | 边界冻结与文档更新 | 本设计文档 | [x] | 已明确“外部 agent 分析，本项目只渲染与流转” |
| M1 | Catalog（透传优先） | `lib/dashboard/catalog.ts` | [x] | 组件定义完成，prompt 可生成 |
| M2 | Registry + Widgets | `lib/dashboard/registry.tsx` + widgets | [x] | 各组件可渲染且透传 props 生效 |
| M3 | Prompt API | `pages/api/dashboard/prompt.ts` | [x] | GET 返回 prompt/rules |
| M4 | Spec API（双布局） | `pages/api/dashboard/index.ts` + `[id].ts` | [x] | POST/GET 正常，live/final 双 spec 可回放 |
| M5 | WebSocket（live） | `pages/api/dashboard/ws.ts` + `lib/dashboard/ws-hub.ts` | [x] | producer 按 step 推送 live snapshot 并驱动 viewer 更新 |
| M6 | Finalize API | `pages/api/dashboard/[id]/finalize.ts` | [x] | finalize 幂等、`lastStep` 校验通过并切换 final 布局 |
| M7 | 页面接入与布局切换 | `app/dashboard/[id]/page.tsx` + runtime | [x] | 推流中展示 live，finalize 后展示 final |
| M8 | 测试与验收 | 单测/集成 | [ ] | 核心链路通过验收 |

### 10.1 细化任务清单

- [x] T1：定义 `GridPlacement` 与透传 schema（`PassThrough`）；
- [x] T2：完成 6 个组件的 catalog props 与描述；
- [x] T3：完成 registry 映射与最小可运行示例；
- [x] T4：实现 prompt endpoint（强调“双布局 + finalize”规则）；
- [x] T5：实现 spec 校验（结构合法、placement 必填、live/final 双 spec 必填）；
- [x] T6：实现 dashboard store（内存版）；
- [x] T7：实现 WS live snapshot 协议、单调 step 校验与 producer/viewer 消息路由；
- [x] T8：实现 finalize endpoint（幂等、`lastStep` 一致性校验、状态机切换）；
- [x] T9：完成页面端 live/final 布局切换与 Renderer 刷新；
- [ ] T10：补齐测试与错误日志。

## 11. 验收标准

1. agent 能通过 `GET /api/dashboard/prompt` 获取可直接用于生成双布局 spec 的提示；
2. `POST /api/dashboard` 返回 `dashboardId`，且 dashboard 包含 `liveSpec + finalSpec`；
3. agent 每个 step 推送完整 live snapshot 后，页面 1s 内可见更新；
4. agent 在收到最后 step 的 `ack` 后调用一次 finalize，页面切换到 final 布局且后续不再更新；
5. live/final 两个布局可展示不同组件与不同数据绑定路径；
6. finalize 支持幂等重试，重复请求返回同一结果；
7. 图表组件可透传主要 Recharts/shadcn props，且能稳定渲染。

## 12. 风险与应对

- 透传 props 过于自由可能引入无效配置：增加 schema 校验和运行时告警；
- snapshot 全量传输可能导致大包：限制单条消息大小并建议 agent 控制推送频率；
- producer 断开与 finalize 调用存在竞态：以 finalize 作为唯一完成信号，并通过 `lastStep` + `409` 校验兜底；
- finalize 重复提交或超时重试：通过 `Idempotency-Key` 保证幂等；
- live/final 布局切换时 viewer 可能短暂不一致：服务端广播 `dashboard.finalized` 统一切换；
- WebSocket 在 serverless 环境稳定性不足：优先 Node 长驻部署；
- agent 输出 spec 偶发不合规：`validateSpec + autoFixSpec + 规则校验` 三层兜底；
- catalog 版本演进导致 prompt 不一致：返回 `catalogVersion` 并做兼容策略。

## 13. 参考资料

- json-render: `@json-render/core`, `@json-render/react`, `@json-render/shadcn`
- Shadcn Chart: https://ui.shadcn.com/docs/components/radix/chart
- Next.js API Routes: https://nextjs.org/docs/pages/building-your-application/routing/api-routes
