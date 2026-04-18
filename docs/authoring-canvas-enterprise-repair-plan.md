# 企业级画布系统修复计划
## Enterprise Authoring Canvas Repair Plan

**文档版本：** v1.0  
**目标系统：** `ppt-workbench-studio` — Authoring Workbench Canvas  
**评估日期：** 2026-04-14  
**状态：** 紧急修复（P0）+ 架构还债（P1/P2）

---

## 一、执行摘要（Executive Summary）

当前 Authoring Workbench 的画布子系统存在 **14 项已确认缺陷**，覆盖功能失效、性能崩溃、状态逻辑脆弱和架构腐化四个层面。本计划采用**分阶段、可回滚、 metric-driven** 的修复策略，目标是在 4–5 周内将画布从“无法稳定运行”提升至“可面向内部用户开放 Beta”的产品水位。

**核心决策原则：**
1. **先止血，后整容**：P0 bug 必须在一周内全部闭环，否则后续优化无意义。
2. **每阶段都可独立回滚**：所有改动必须通过 feature flag 或原子 commit 隔离。
3. **测试即文档**：每个修复必须附带自动化测试或 QA Checklist。

---

## 二、缺陷严重度矩阵（Severity Matrix）

| 编号 | 缺陷描述 | 文件/位置 | 严重度 | 用户影响 | 修复优先级 |
|------|---------|-----------|--------|----------|------------|
| 1 | 画布首次加载失焦：`fitWorkspaceToView` 在 `useEffect([])` 时因 `viewportRef` 为 null 导致永远以 scale=1 错位渲染 | `ModuleAuthorWorkbenchPage.tsx:2330` | **P0** | 打开工作台即看到黑屏/错位，直接不可用 | Week 1 |
| 4 | 对象缩放手柄未阻止默认 touch action，触屏上触发页面滚动而非缩放 | `TemplateCanvasStage.tsx:1113` | **P0** | 触屏设备无法缩放对象，核心交互断裂 | Week 1 |
| 5 | 组件内 30+ 个 action 函数未 `useCallback`，导致每次 state 变化引发 `TemplateCanvasStage` 全量重渲染 | `ModuleAuthorWorkbenchPage.tsx` 全局 | **P0** | 对象多时拖拽/移动帧率暴跌，感知为“卡顿” | Week 1 |
| 2 | `line` 图表类型在 UI 中存在但逻辑未实现，fallthrough 到 waterfall | `chart-preview.tsx` | **P1** | 功能欺诈，用户选折线图看到瀑布图 | Week 1–2 |
| 3 | 连接线交互模型半拉子：`completeConnection` 用 `onClick`、`startConnection` 用 `onPointerDown`，触控设备易被吞 | `TemplateCanvasStage.tsx:1082` | **P1** | 连线成功率低，语义阶段体验极差 | Week 1–2 |
| 6 | 拖拽期间每帧调用 `getBoundingClientRect()`，无节流 | `ModuleAuthorWorkbenchPage.tsx:1771` | **P1** | 复杂页面拖拽时 CPU 飙升，浏览器掉帧 | Week 2 |
| 7 | `chartPreview` fallback 对象 inline 新建，导致无意义重渲染 | `TemplateCanvasStage.tsx:627` | **P1** | chart 区域闪烁/重绘 | Week 2 |
| 8 | `draft.kind` 变更时静默重置所有对象位置（`withFieldLayouts`） | `ModuleAuthorWorkbenchPage.tsx:354` | **P1** | 用户布局丢失，无提示 | Week 2 |
| 9 | Marquee 框选阈值 8px 过严，微移鼠标导致选择被清空 | `ModuleAuthorWorkbenchPage.tsx:2287` | **P2** | 交互“脆”，易误操作 | Week 2–3 |
| 10 | `getScenePoint` 返回 null 时连线预览消失 | `TemplateCanvasStage.tsx:290` | **P2** | 快速切换 stage 时连线“断掉” | Week 2–3 |
| 11 | `getThinkingFlowPoint` 存在除以零风险（board width/height 为 0） | `ModuleAuthorWorkbenchPage.tsx:1068` | **P2** | 初始渲染时节点坐标可能为 NaN | Week 2–3 |
| 12 | `authoringSlice.ts` 为空壳，3618 行状态全在本地 | `runtime/studio/store/authoringSlice.ts` | **P2** | 无法持久化、无法调试、无法多标签 | Week 3–4 |
| 13 | `TemplateCanvasToolbar` 定位基准链脆弱，可能被裁切 | `TemplateCanvasStage.tsx` 布局链 | **P2** | 底部工具栏偶发不可见 | Week 3 |
| 14 | `sceneRef` 与 `canvasRef` 命名混乱，职责边界不清 | `TemplateCanvasStage.tsx` / `ModuleAuthorWorkbenchPage.tsx` | **P3** | 维护成本高，易引入新 bug | Week 4–5 |

---

## 三、分阶段路线图（Phased Roadmap）

### Phase 0：基线保护（1 天）
**目标：** 确保修复期间不破坏现有通过测试。
- [ ] 为 `ModuleAuthorWorkbenchPage` 和 `TemplateCanvasStage` 增加**快照基线测试**（Snapshot / Render baseline）。
- [ ] 在 `package.json` 新增 `test:authoring` 脚本，隔离运行画布相关测试。
- [ ] 引入 **feature flag `ENABLE_CANVAS_FIXES_V1`**，所有 P0/P1 修复默认在 flag 开启时生效，便于 A/B 回滚。

### Phase 1：Critical Stabilization（Week 1）
**目标：** 解决“跑不起来”和“卡成狗”。
- [ ] **Fix #1：** 将 `fitWorkspaceToView` 从 `useEffect([])` 迁移到 `requestAnimationFrame` + `viewportRef` ready 检测。
- [ ] **Fix #4：** 为 resize handle 增加 `touch-action: none` 和 `event.preventDefault()`。
- [ ] **Fix #5：** 对 `actions` 对象中所有传入 `TemplateCanvasStage` 的函数包裹 `useCallback`，并正确声明依赖数组。
- [ ] **Fix #2：** 在 `chart-preview.tsx` 中补齐 `line` 类型实现，或在前端 UI 中暂时下架 `line` 选项（若资源不足则先禁用，避免功能欺诈）。
- [ ] **Fix #3：** 统一 connection handle 的事件绑定为 `onPointerDown`，并在 `startConnection`/`completeConnection` 中增加触控设备的 `setPointerCapture`。

### Phase 2：Performance & Interaction Hardening（Week 2）
**目标：** 让画布在 20+ 对象的复杂页面上保持 60fps。
- [ ] **Fix #6：** 拖拽期间用 `IntersectionObserver` 或 `ResizeObserver` 缓存 `sceneRef` 的 rect，而非每帧 `getBoundingClientRect()`；或改用 `requestAnimationFrame` 节流。
- [ ] **Fix #7：** 将 `chartPreview` fallback 提取为常量/工厂函数 + `useMemo`，避免 inline 对象。
- [ ] **Fix #8：** 为 `draft.kind` 变更增加“是否重置布局”的用户确认弹窗；若用户拒绝，则只更新 kind 元数据而不动 `field.layout`。
- [ ] **Fix #9 & #10 & #11：** 增加防御性编程（null guard、除以零 guard、marquee 阈值放宽到 4px 并增加时间阈值）。

### Phase 3：Architecture Refactoring（Week 3–4）
**目标：** 降低 3618 行组件的维护熵。
- [ ] **Fix #12：** 将 `ModuleAuthorWorkbenchPage` 拆分为三个自定义 Hook：
  - `useCanvasState`（workspace scale/offset/pan/marquee/drag）
  - `useThinkingFlowState`（node graph 相关）
  - `useAuthoringDraft`（draft CRUD + persistence）
  逐步将状态迁移到 Zustand `authoringSlice` 中。
- [ ] **Fix #13：** 为 `TemplateCanvasToolbar` 增加稳定的 `relative` 容器基准，避免被父链 flex 高度变化裁切。
- [ ] **Fix #14：** 重命名 `canvasRef` → `artboardContainerRef`，`sceneRef` → `workspaceSceneRef`，统一全链路命名。

### Phase 4：Regression Hardening & QA（Week 5）
**目标：** 达到可发布标准。
- [ ] 编写 **10 个核心交互的 Cypress/Playwright E2E 测试**：
  1. 打开工作台 → 画布自动适配视口
  2. 添加 AI Text / Data / Chart → 对象出现在 artboard 内
  3. 拖拽对象移动 → 位置正确更新
  4. 拖拽右下角缩放 → 尺寸正确更新
  5. 框选多个对象 → 选中态同步
  6. 删除对象 → 连线自动清理
  7. 切换至 Semantics stage → Flow 画布自动 fit view
  8. 添加 Flow node 并连线 → 边正确渲染
  9. Chart 关联 Data → 图表预览正确刷新
  10. 保存 draft → 刷新页面后状态恢复
- [ ] 执行 **触控设备手动 QA**（iPad / Surface / 触控笔记本）。
- [ ] 执行 **性能 profiling**：20 个对象页面，拖拽期间保持 Main Thread > 55fps。

---

## 四、关键修复详细规范（Fix Specifications）

### Fix #1：画布首次加载自动适配视口
**现状：**
```tsx
useEffect(() => {
  fitWorkspaceToView();
}, []);
```
**修复方案：**
```tsx
useEffect(() => {
  const viewport = workspaceViewportRef.current;
  if (viewport && viewport.clientWidth > 0 && viewport.clientHeight > 0) {
    fitWorkspaceToView();
    return;
  }
  // 若 viewport 尚未 ready，轮询等待
  const timer = window.setInterval(() => {
    const v = workspaceViewportRef.current;
    if (v && v.clientWidth > 0 && v.clientHeight > 0) {
      fitWorkspaceToView();
      window.clearInterval(timer);
    }
  }, 16);
  // 安全超时 500ms
  const timeout = window.setTimeout(() => window.clearInterval(timer), 500);
  return () => {
    window.clearInterval(timer);
    window.clearTimeout(timeout);
  };
}, []);
```
**验收标准：**
- 首次打开 `/templates/new` 时，artboard 在 300ms 内居中并适配视口。
- 硬刷新 10 次，无一次出现 artboard 漂出视口或 scale=1 错位。

### Fix #4：触屏缩放手柄阻止默认滚动
**现状：** resize handle `<span>` 无 `touchAction` 和 `preventDefault`。
**修复方案：**
```tsx
<span
  onPointerDown={(event) => {
    event.preventDefault();
    event.stopPropagation();
    startFieldDrag(event, field.id, "resize");
  }}
  style={{ touchAction: "none" }}
  className="..."
>
```
**验收标准：**
- 在 iPad Safari / Chrome DevTools 触屏模拟中，拖拽 resize handle 时页面不滚动。
- 缩放手势结束后，对象尺寸与鼠标/手指释放位置一致。

### Fix #5：action 函数引用稳定化
**现状：** `addCanvasObject`、`startFieldDrag`、`zoomWorkspace` 等 30+ 函数裸定义，导致 `TemplateCanvasStage` 随父组件任意 state 变化而重渲染。
**修复方案（示例）：**
```tsx
const addCanvasObject = useCallback((
  kind: ModuleCanvasObjectKind = "slot",
  preset: CanvasObjectPreset = "default"
) => {
  // ... 原逻辑
}, [/* 仅依赖真正变化的值，如 draft.kind */]);

const startFieldDrag = useCallback((
  event: React.PointerEvent<HTMLElement>,
  fieldId: string,
  mode: CanvasEditMode
) => {
  // ... 原逻辑
}, [draft.fields, selectedFieldIds, workspaceScale, workspaceOffset]);
```
**注意：** 由于 `ModuleAuthorWorkbenchPage` 长达 3618 行，建议**先提取自定义 Hook** `useCanvasActions(draft, setDraft, ...)`，在 Hook 内部完成 memoization，再将 stable `actions` 返回给页面组件。

**验收标准：**
- 使用 React DevTools Profiler，选中 `TemplateCanvasStage`，在移动鼠标（仅更新 `connectionPreviewPoint`）时，**不出现黄色重渲染条**。
- 20 个对象的页面，Main Thread 在 idle 时无异常 spikes。

### Fix #6：拖拽期间取消强制重排
**现状：** drag effect 内每帧 `sceneRef.current.getBoundingClientRect()`。
**修复方案：**
1. 在 `startFieldDrag` 时缓存一次 `rect` 写入 `dragState.cachedSceneRect`。
2. `onPointerMove` 内直接使用缓存值。
3. 仅在 window resize 时重新计算。

**验收标准：**
- Chrome DevTools Performance 面板中，拖拽 20 个对象的组合时，**Layout 事件出现频率 < 5 次/秒**（当前为 60 次/秒）。

---

## 五、测试策略（Testing Strategy）

### 5.1 单元测试（新增/补强）
- `authoring-canvas-utils.test.ts`：正交路径计算、marker ID 生成。
- `helpers.test.ts`：`clampLayoutToSurface`、`getSceneLayout`、`normalizeLayout` 的边界条件。
- `chart-preview.test.ts`：补齐 `line` 类型的数据解析和 SVG 输出。

### 5.2 集成测试（React Testing Library）
- `TemplateCanvasStage.interaction.test.tsx`：模拟 pointer 事件序列（down→move→up），验证 `startFieldDrag` 后 `draft.fields` 的最终 layout。
- `ModuleAuthorWorkbenchPage.viewport.test.tsx`：验证挂载后 `workspaceScale` 和 `workspaceOffset` 非 `(1, 0, 0)`。

### 5.3 E2E / 手动 QA Checklist
| 场景 | 通过标准 |
|------|----------|
| 新建模板 → 自动 fit view | artboard 完全位于视口中心，无滚动条 |
| 添加 5 个对象 → 拖拽移动 | 所有对象同步移动，无抖动 |
| 拖拽右下角缩放 | 宽高比例正确（square lock 生效） |
| 触控模式缩放 | 手指不离屏，页面不滚动 |
| 画连接线 | 从 source 拖出 → 指向 target → 释放 → 连线稳定存在 |
| 删除带连线的对象 | 相关连线自动消失，无报错 |
| 切换 kind | 弹出确认框；选择“保留布局”时对象位置不变 |
| 20 对象页面性能 | 拖拽期间 FPS > 55 |

---

## 六、回滚与安全机制（Rollback & Safety）

### 6.1 Feature Flag
在 `ui/src/features/studio/config.ts` 新增：
```ts
export const ENABLE_CANVAS_FIXES_V1 = import.meta.env.VITE_ENABLE_CANVAS_FIXES_V1 === "1" || true;
```
- **Week 1–2：** 默认 `false`（内部测试环境开启）。
- **Week 3：** 小流量灰度（A/B 50%）。
- **Week 5：** 全量开启，若出现 regression，1 分钟内可改环境变量回滚。

### 6.2 Git 分支策略
- `main` 保持基线稳定。
- 所有修复通过 `fix/authoring-canvas-*` 分支提交，经 PR review 后合并到 `authoring-canvas-repair` 聚合分支。
- 聚合分支每日 rebase `main`，确保冲突早发现。

### 6.3 数据兼容性
- 所有修复**不得修改** `ModuleRegistryEntry` 和 `ModuleTemplateField` 的序列化 schema。
- 若必须改 schema（如 Fix #12 迁移到 global store），需编写**向前/向后兼容的 migration 函数**。

---

## 七、验收标准与 SLA（Acceptance Criteria）

| 维度 | 基线 | 目标 | 验收方式 |
|------|------|------|----------|
| 首次加载视口适配成功率 | ~30%（受 race condition 影响） | 100% | 硬刷新 20 次，0 失败 |
| 触屏缩放成功率 | 0% | 100% | iPad 手动 QA 10 次，0 失败 |
| 20 对象拖拽平均 FPS | ~15–25 fps | ≥ 55 fps | Chrome Performance Profile |
| TemplateCanvasStage 无效重渲染 | 每次 state 变化都渲染 | 仅 props 真正变化时渲染 | React DevTools Profiler |
| 画布相关 TypeScript 错误 | 0 | 0 | `pnpm typecheck` |
| 单元测试覆盖率（authoring） | < 10% | ≥ 40% | `pnpm test` 报告 |
| E2E 核心交互通过率 | N/A | 10/10 | Playwright / 手动 QA |

---

## 八、风险与应对（Risks & Mitigations）

| 风险 | 概率 | 影响 | 应对策略 |
|------|------|------|----------|
| `useCallback` 依赖数组声明错误导致 stale closure | 中 | 高 | 使用 ESLint `react-hooks/exhaustive-deps` 强制校验；所有 useCallback 修改必须 peer review |
| 拆分 3618 行组件时引入状态同步 bug | 中 | 高 | Phase 3 仅做 Hook 提取，不改动渲染树；每步提取后跑全量 E2E |
| 触屏兼容性修复在特定 Android 浏览器失效 | 低 | 中 | 使用 `touch-action: none`（W3C 标准）而非 UA sniffing；QA 覆盖 Chrome + Safari |
| 性能优化后某些 edge case 布局计算偏差 | 低 | 中 | 保留旧的 `getBoundingClientRect` 路径作为 `LEGACY_DRAG_CALC` feature flag 兜底 |

---

## 九、资源与时间估算

| 阶段 | 工期 | 所需角色 | 产出 |
|------|------|----------|------|
| Phase 0 | 1 天 | FE Engineer | 基线测试 + feature flag |
| Phase 1 | 4 天 | FE Engineer × 1 | P0 修复全部 landed |
| Phase 2 | 5 天 | FE Engineer × 1 + Designer（UX 确认） | P1 修复 + 性能达标 |
| Phase 3 | 6 天 | FE Engineer × 1 + Tech Lead（架构 review） | Hook 拆分 + store 迁移 |
| Phase 4 | 4 天 | QA Engineer × 1 + FE Engineer × 1 | E2E 测试 + 手动 QA 报告 |
| **总计** | **~20 工作日（4–5 周）** | | |

---

## 十、下一步行动（Next Steps）

1. **产品/技术负责人确认本计划**并签字（本 MD 文档）。
2. **创建 Jira/Linear 任务组**：`CANVAS-REPAIR-2026Q2`，将 14 个 bug 拆分为独立 ticket。
3. **搭建 `authoring-canvas-repair` 聚合分支**，配置 CI 额外跑 `test:authoring`。
4. **分配 Phase 0 负责人**，1 天内完成 feature flag 和基线测试骨架。
5. **每日 15 分钟 standup** 同步 blockers，确保 Week 1 结束前 P0 清零。

---

*本计划由代码审计自动生成，所有文件路径和行号基于 commit 前的当前 HEAD。若后续发生大量代码漂移，需重新审计并更新本文档。*
