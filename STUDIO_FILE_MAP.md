# PPT Studio 100% 文件级映射表

说明：
- 范围：`ppt-workbench-studio` 项目内所有“源码/配置”文件。
- 已排除：`node_modules/`、`dist/`、`tsconfig.tsbuildinfo` 这类依赖与构建产物。
- 结构：`文件路径 | 架构层 | 功能/职责 | 主要入口或调用关系`
- 审计口径：文末 `Audit` 只统计 `server/src` 与 `ui/src` 内的 `.ts/.tsx/.css` 源码行数，不含 `package.json`、静态资源、文档和构建产物。

## Root

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/.gitignore` | 工程配置 | 忽略日志、数据与构建缓存 | Git |
| `/package.json` | 工程入口 | monorepo 脚本（`dev/build/typecheck`） | 根命令入口 |
| `/pnpm-lock.yaml` | 依赖锁定 | 锁定依赖版本 | pnpm |
| `/pnpm-workspace.yaml` | 工作区配置 | 声明子包 `server`、`ui` | pnpm workspace |
| `/STUDIO_FILE_MAP.md` | 文档 | 本文件：完整文件映射 | 团队交接 |

## Server

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/server/package.json` | 包配置 | server 依赖与脚本 | `pnpm --dir server` |
| `/server/tsconfig.json` | TS 配置 | server 编译规则 | `tsc/tsx` |
| `/server/src/index.ts` | 启动层 | 创建 HTTP 服务，读取 `PPT_STUDIO_PORT/HOST` | 调 `createApp()` |
| `/server/src/app.ts` | 应用装配层 | 挂载中间件、`/api/health`、`/api` 路由、错误处理 | 被 `index.ts` 调用 |
| `/server/src/lib/cursor-cli.ts` | 执行适配层 | 执行本地 agent CLI、环境检测、超时与日志流 | 被 `routes/studio.ts` 调用 |
| `/server/src/lib/industry-style.ts` | 风格推断层 | deck 行业/风格 profile 推断与 token 解析 | 被 `routes/studio.ts` 调用 |
| `/server/src/lib/studio-engine/schemas.ts` | engine schema 层 | studio generate/revise 请求与测量 schema 定义 | route 与 engine 共用 |
| `/server/src/lib/studio-engine/contracts.ts` | engine contract 层 | engine 共享类型、stream event、pressure/review budget、hero/chart 内部 contract | engine 模块共用 |
| `/server/src/lib/studio-engine/skills.ts` | engine skill 层 | 加载 analysis/layout-repair/3d-hero skill 与 hero references | 被 `routes/studio.ts`、`core.ts` 调用 |
| `/server/src/lib/studio-engine/agent.ts` | engine 执行层 | stage 执行、trace、timeout、stream writer、agent config glue | route 与 engine 调度 |
| `/server/src/lib/studio-engine/brief.ts` | engine brief 层 | brief 归一化、压缩、标题/文本工具、基础证据文本辅助 | `core.ts`、route |
| `/server/src/lib/studio-engine/render.ts` | engine render 层 | HTML 文档抽取、单页验证、deterministic render、最终 deck 组装 | `core.ts` |
| `/server/src/lib/studio-engine/repair.ts` | engine repair 层 | deterministic shrink、measurement 摘要、repair 文本/HTML 压缩辅助 | `core.ts` |
| `/server/src/lib/studio-engine/core.ts` | engine orchestration 层 | 生成/修补主编排、evidence/planning/prompt/repair 总流程 | 被薄路由入口调用 |
| `/server/src/middleware/logger.ts` | 中间件层 | pino logger + http logger | 被 `app.ts` 使用 |
| `/server/src/middleware/validate.ts` | 中间件层 | zod request body 校验包装器 | 被 `routes/studio.ts` 使用 |
| `/server/src/routes/studio.ts` | 薄路由入口层 | `POST /api/studio/generate-html*` 与 `revise-html/stream`，只负责 HTTP/validation/stream wiring | 被 `app.ts` 挂载 |

## UI Root

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/package.json` | 包配置 | UI 依赖与脚本 | `pnpm --dir ui` |
| `/ui/tsconfig.json` | TS 配置 | UI 编译规则 | `vite/tsc` |
| `/ui/vite.config.ts` | 构建与开发配置 | Vite dev server、`/api` 代理到 server | `vite` |
| `/ui/index.html` | 页面壳 | SPA 挂载点与基础 meta | 浏览器入口 |
| `/ui/public/favicon.svg` | 静态资源 | 站点图标 | `index.html` 引用 |

## UI App & Infra

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/main.tsx` | 前端入口 | 挂载 React App | 渲染 `<App />` |
| `/ui/src/App.tsx` | 路由层 | 声明全部页面路由：`/`、`/modules*`、`/projects/:id/published` | 被 `main.tsx` 调用 |
| `/ui/src/index.css` | 全局样式 | 全局 CSS/Tailwind 层基础样式 | `main.tsx` 引入 |
| `/ui/src/vite-env.d.ts` | 类型声明 | Vite 环境类型声明 | TypeScript |
| `/ui/src/api/client.ts` | API 基础层 | `fetch`/HTTP client 抽象 | generation、业务调用 |
| `/ui/src/lib/router.tsx` | 路由适配层 | 封装路由组件与 hooks | `App` 与页面使用 |
| `/ui/src/lib/utils.ts` | 工具层 | 通用工具函数 | 全局可复用 |
| `/ui/src/components/ui/textarea.tsx` | UI 基础组件 | 统一 textarea 组件 | inspector、brief 输入 |

## Report Feature

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/report/StudioPublishedPage.tsx` | 发布页 | 渲染 published report、支持 `?export=html/pdf` | 路由 `/projects/:id/published` |

## Studio Public Page Exports

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/StudioShellPage.tsx` | 页面导出层 | `StudioShellPage` 的稳定导出别名 | 被 `App.tsx` 使用 |
| `/ui/src/features/studio/StudioProjectEditPage.tsx` | 页面导出层 | 项目编辑页导出别名 | 被 `App.tsx` 使用 |
| `/ui/src/features/studio/StudioModuleLibraryPage.tsx` | 页面导出层 | 模块库页面导出别名 | 被 `App.tsx` 使用 |
| `/ui/src/features/studio/StudioModuleDetailPage.tsx` | 页面导出层 | 模块详情页面导出别名 | 被 `App.tsx` 使用 |
| `/ui/src/features/studio/StudioModuleAuthorPage.tsx` | 页面导出层 | 模块作者页导出别名 | 被 `App.tsx` 使用 |

## Studio Module Library / Detail / Author Entry

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/ModuleLibraryPage.tsx` | 模块功能页 | 模块库列表、筛选状态、详情/编辑跳转 | `/modules` |
| `/ui/src/features/studio/ModuleDetailPage.tsx` | 模块功能页 | 单模块详情、信任状态、测试证据展示 | `/modules/:moduleId` |
| `/ui/src/features/studio/ModuleAuthorWorkbench.tsx` | 兼容导出层 | 作者工作台导出桥接 | 供外部导入兼容 |

## Studio Runtime Shell

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/runtime/StudioHomePage.tsx` | Studio 首页壳层 | AI Chat / Library / Author 首页状态与新建项目入口 | `/` 首页入口 |
| `/ui/src/features/studio/runtime/StudioShellPage.tsx` | Studio 主壳层 | 组合 shell 视图，拼装 runtime hooks、rail/canvas/inspector/transcript | `/` 主入口 |
| `/ui/src/features/studio/runtime/editor-chrome-tokens.ts` | 设计 token | Editor/Shell 视觉 token | `StudioShellPage.tsx` |
| `/ui/src/features/studio/runtime/helpers.tsx` | 兼容 shim 层 | 向后兼容导出 runtime 预览/视图模块 | runtime 老导入点 |
| `/ui/src/features/studio/runtime/HtmlStructureEditor.tsx` | 编辑器子系统 | 文本结构（block/section）编辑 | inspector text 关联 |
| `/ui/src/features/studio/runtime/HtmlVisualEditor.tsx` | 编辑器子系统 | 视觉节点编辑（样式、视觉内容） | inspector visual 关联 |
| `/ui/src/features/studio/runtime/HtmlLayoutEditor.tsx` | 编辑器子系统 | 布局分区/zone 编辑 | inspector layout 关联 |

## Studio Runtime Headless Hooks

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/runtime/hooks/useStudioGenerationFlow.ts` | headless orchestration 层 | generate/regenerate/continue conversation 主编排 | `StudioShellPage.tsx` |
| `/ui/src/features/studio/runtime/hooks/useStudioDeckReviewFlow.ts` | headless orchestration 层 | review/repair/optimize 调度、timeout、abort | `StudioShellPage.tsx` |
| `/ui/src/features/studio/runtime/hooks/useStudioTranscriptState.ts` | headless state 层 | streaming transcript、partial pages、status line、stream error | `StudioShellPage.tsx` |
| `/ui/src/features/studio/runtime/hooks/useStudioExportActions.ts` | headless action 层 | HTML/PPTX export、bundle import/export notes | `StudioShellPage.tsx` |
| `/ui/src/features/studio/runtime/hooks/useLongFormClarification.ts` | headless decision 层 | long-form clarification 条件、回执、resolution 派生 | `StudioShellPage.tsx` |
| `/ui/src/features/studio/runtime/runtime-shell-contract.ts` | contract 层 | shell hook 输入/输出契约与共享状态类型 | runtime hooks |
| `/ui/src/features/studio/runtime/runtime-types.ts` | 类型层 | runtime 共享类型、storyline 与 preview 相关类型 | runtime modules |

## Studio Runtime View / Preview Modules

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/runtime/runtime-preview-frame.tsx` | 预览桥接层 | iframe preview、transform preview、hit-testing、page fit reporting | `StudioShellPage` / published |
| `/ui/src/features/studio/runtime/runtime-report-views.tsx` | report view 层 | `HtmlReportFrame`、filmstrip、canvas view、streaming canvas | shell / published |
| `/ui/src/features/studio/runtime/runtime-intake.ts` | intake 组装层 | greeting/starters、brief summary/follow-up builders、starter project helpers | homepage / shell |
| `/ui/src/features/studio/runtime/runtime-presentational.tsx` | 表现层 | `ShellLabel`、`InfoHint`、timestamp、generation label | runtime UI |
| `/ui/src/features/studio/runtime/runtime-export-annotations.ts` | 导出注解层 | export notes/warnings、chart export 文案整理 | shell / published |
| `/ui/src/features/studio/runtime/runtime-storyline.tsx` | story/render 层 | storyline 相关 runtime 视图辅助 | shell / preview |

## Studio Runtime Homepage (保留的首页子模块)

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/runtime/homepage/HomeShell.tsx` | 首页壳层 | 首页布局容器 | homepage 视图 |
| `/ui/src/features/studio/runtime/homepage/HomeSidebar.tsx` | 首页组件 | 首页侧边栏 | `HomeShell` |
| `/ui/src/features/studio/runtime/homepage/LibraryHome.tsx` | 首页组件 | Library 模式首页内容 | `HomeShell` |
| `/ui/src/features/studio/runtime/homepage/AiHome.tsx` | 首页组件 | AI 模式首页内容 | `HomeShell` |
| `/ui/src/features/studio/runtime/homepage/AuthorHome.tsx` | 首页组件 | Author 模式首页内容 | `HomeShell` |
| `/ui/src/features/studio/runtime/homepage/LibraryReportCard.tsx` | 首页组件 | 报告卡片组件 | `LibraryHome` |
| `/ui/src/features/studio/runtime/homepage/RecentStrip.tsx` | 首页组件 | 最近项目横条 | `LibraryHome` |
| `/ui/src/features/studio/runtime/homepage/HomepageThemeTokens.ts` | 设计 token | homepage 视觉 token | homepage 组件 |
| `/ui/src/features/studio/runtime/homepage/types.ts` | 类型层 | homepage 局部类型 | homepage 组件 |

## Studio Runtime Internal Kernel (store/repo/inspector/virtual/export)

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/runtime/studio/store.ts` | 状态入口层 | 根 Zustand store 的 assembly entry，拼接各 slice | Shell 主状态源 |
| `/ui/src/features/studio/runtime/studio/types.ts` | 类型层 | store/repository/history/selection/asset 类型 | `store/repository/utils` |
| `/ui/src/features/studio/runtime/studio/utils.ts` | 纯函数层 | snapshot/project/workspace 操作、patch 辅助、selector 辅助 | `store/repository` |
| `/ui/src/features/studio/runtime/studio/repository.ts` | 数据仓储层 | IndexedDB 读写、session 恢复、workspace/project/asset repository | Shell 持久化 |
| `/ui/src/features/studio/runtime/studio/archiveImport.ts` | 迁移层 | 一次性从旧 localStorage 导入 archive 数据 | `repository.ts` |
| `/ui/src/features/studio/runtime/studio/WorkbenchStudioInspector.tsx` | inspector 系统 | schema-driven inspector + debounce 输入字段 | Shell 底部 inspector |
| `/ui/src/features/studio/runtime/studio/WorkbenchStudioVirtual.tsx` | 性能层 | 长列表虚拟化（list/rail） | library/page rail/history/inspector |
| `/ui/src/features/studio/runtime/studio/useStudioWorkspace.ts` | 工作区装配层 | 组装当前 workspace/project 的 runtime 视图模型 | `StudioShellPage.tsx` |
| `/ui/src/features/studio/runtime/studio/export.ts` | 导出基础层 | 导出前资源准备（字体/图像 ready） | Shell 导出流程 |
| `/ui/src/features/studio/runtime/studio/store/shared.ts` | store shared 层 | project patch/mutation/history 公共 helper | 各 slice |
| `/ui/src/features/studio/runtime/studio/store/shellSlice.ts` | store slice 层 | shell mode、drawer、toolbar、scale、status line | `store.ts` |
| `/ui/src/features/studio/runtime/studio/store/librarySlice.ts` | store slice 层 | workspace summaries、library selection、queries | `store.ts` |
| `/ui/src/features/studio/runtime/studio/store/projectSlice.ts` | store slice 层 | project create/duplicate/delete、commit/report replacement | `store.ts` |
| `/ui/src/features/studio/runtime/studio/store/selectionSlice.ts` | store slice 层 | active page/block/visual/layout、page overflow、intake input | `store.ts` |
| `/ui/src/features/studio/runtime/studio/store/historySlice.ts` | store slice 层 | undo/redo、patch bookkeeping、save state | `store.ts` |
| `/ui/src/features/studio/runtime/studio/store/importExportSlice.ts` | store slice 层 | hydrate/bootstrap、bundle import、snapshot import glue | `store.ts` |
| `/ui/src/features/studio/runtime/studio/store/briefSlice.ts` | store slice 层 | intake brief 与 follow-up 输入管理 | `store.ts` |
| `/ui/src/features/studio/runtime/studio/store/authoringSlice.ts` | store slice 层 | authoring handoff 相关运行时状态 | `store.ts` |

## Studio Core Config / Registry

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/config.ts` | 配置聚合层 | 对外配置导出入口 | feature 直接引用 |
| `/ui/src/features/studio/config/index.ts` | 配置聚合层 | config 子模块聚合 | feature 直接引用 |
| `/ui/src/features/studio/config/constants.ts` | 常量层 | 存储 key、默认值、命名常量 | state/repository/settings |
| `/ui/src/features/studio/config/catalog.ts` | 目录配置 | 模块/技能目录相关元数据 | registry/authoring |
| `/ui/src/features/studio/config/modules.ts` | 模块配置 | 内建模块定义 | module library/authoring |
| `/ui/src/features/studio/config/skills.ts` | 技能配置 | 可选技能定义 | generation/authoring |
| `/ui/src/features/studio/config/moduleSkillPresets.ts` | 预设配置 | 模块-技能预设关系 | authoring/generation |
| `/ui/src/features/studio/config/selectors.ts` | 选择器层 | 配置查询选择器函数 | config consumers |
| `/ui/src/features/studio/registry.ts` | 注册表入口 | registry 对外 API 聚合 | 模块库与作者页 |
| `/ui/src/features/studio/registry/index.ts` | 注册表入口 | registry 子模块统一导出 | `registry.ts` |
| `/ui/src/features/studio/registry/helpers.ts` | 注册表工具 | registry 归一化/校验/映射辅助 | `registry/storage` |
| `/ui/src/features/studio/registry/storage.ts` | 注册表存储 | module/skill registry 的 localStorage 持久化 | registry 读写 |

## Studio Generation / Report Modeling

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/generation.ts` | 生成编排层 | brief 到 HTML report 的主流程编排，调用后端生成并解析为页面 | Shell 生成按钮 |
| `/ui/src/features/studio/generation-contract.ts` | 合同层 | 生成流程使用的数据合同与类型定义 | generation 相关模块 |
| `/ui/src/features/studio/generation-assets.ts` | 资产处理层 | draft asset 创建、签名、复用判断 | generation/state |
| `/ui/src/features/studio/generation-skills.ts` | 技能上下文层 | generation 时技能上下文构建 | generation |
| `/ui/src/features/studio/analysis-skills.ts` | 分析技能层 | brief 分析相关技能解析 | generation |
| `/ui/src/features/studio/template-skills.ts` | 模板技能层 | template 对应技能策略解析 | generation |
| `/ui/src/features/studio/industry-style.ts` | 风格推断层 | deck 行业风格 profile 与主题选择辅助 | generation/runtime/export |
| `/ui/src/features/studio/page-archetypes.ts` | 页面原型层 | 页型 archetype 规则选择 | generation |
| `/ui/src/features/studio/design-critic.ts` | 设计评估层 | 设计质量评估/批注辅助逻辑 | generation/runtime |
| `/ui/src/features/studio/html-page-grammars.ts` | 语法层 | HTML 页面语法/约束解析规则 | html parser 相关 |
| `/ui/src/features/studio/html-report-structure.ts` | 结构建模层 | HTML -> 可编辑文本结构抽取与规范化 | generation/editor |
| `/ui/src/features/studio/html-report-layout.ts` | 布局建模层 | HTML -> 布局 zone 抽取与规范化 | generation/editor |
| `/ui/src/features/studio/html-report-visuals.ts` | 视觉建模层 | HTML -> visual node 抽取与规范化 | generation/editor |
| `/ui/src/features/studio/html-report-theme.ts` | 主题建模层 | 报告主题 token 与映射辅助 | render/generation |
| `/ui/src/features/studio/html-report-canvas.ts` | 画布覆盖层 | freeform canvas override 应用与页面坐标映射 | runtime/published/export |

## Studio Editing / Runtime Actions / Render

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/types.ts` | 核心类型层 | 项目、页面、模块、生成、发布等主类型定义 | 全域引用 |
| `/ui/src/features/studio/state.ts` | 兼容状态层 | 项目库读写、bundle 导入导出、旧状态兼容读写 | published/export/runtime |
| `/ui/src/features/studio/ai-settings.ts` | AI 设置层 | 模型/生成偏好本地配置与读取辅助 | generation/runtime |
| `/ui/src/features/studio/module-actions.ts` | 动作层 | block/module 可执行动作定义与运行辅助 | runtime/editor |
| `/ui/src/features/studio/module-authoring-handoff.ts` | handoff 层 | 从 editor 选区提炼模块草稿并跳转作者台 | runtime/authoring |
| `/ui/src/features/studio/module-runtime-input.ts` | 输入装配层 | brief/source -> module runtime 输入模型 | generation/authoring |
| `/ui/src/features/studio/module-composition.ts` | 组合层 | 模块组合与装配逻辑 | authoring/execution |
| `/ui/src/features/studio/module-output.ts` | 输出层 | module 输出归一化/映射 | execution/render |
| `/ui/src/features/studio/module-fields.ts` | 字段模型层 | 模块字段定义与字段级逻辑 | authoring/runtime |
| `/ui/src/features/studio/module-execution.ts` | 执行层 | 模块运行器与执行封装 | authoring/test |
| `/ui/src/features/studio/module-assets.ts` | 资产层 | 模块测试记录、发布证据、资产持久化 | module library/detail |
| `/ui/src/features/studio/composition-test-runtime.ts` | 测试运行层 | 组合测试 case 执行框架 | authoring 测试阶段 |
| `/ui/src/features/studio/renderers.tsx` | 渲染层 | 通用 block/page 渲染组件 | module preview/runtime |
| `/ui/src/features/studio/slide-scene.ts` | 场景建模层 | slide scene 数据构造 | generation/runtime |
| `/ui/src/features/studio/slide-scene-renderer.tsx` | 场景渲染层 | slide scene React 渲染器 | runtime/preview |
| `/ui/src/features/studio/export.ts` | 导出层 | HTML 导出能力（下载、序列化） | Shell/Published 导出 |

## Studio PPTX Export

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/pptx/export-pptx.ts` | PPTX 导出层 | slide/page/chart -> `.pptx` 的本地导出主实现 | Shell / Published 导出 |

## Studio Authoring Subsystem

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/authoring/index.ts` | 子系统入口 | authoring 对外统一导出 | `StudioModuleAuthorPage` |
| `/ui/src/features/studio/authoring/ModuleAuthorWorkbenchPage.tsx` | 主界面层 | 模块作者工作台（define/compose/semantics/test/publish） | `/modules/new`、`/modules/:id/edit` |
| `/ui/src/features/studio/authoring/helpers.tsx` | authoring 工具层 | 画布、布局、拖拽、字段/节点辅助函数 | `ModuleAuthorWorkbenchPage` |
| `/ui/src/features/studio/authoring/flow-runtime.ts` | 语义流运行层 | thinking flow 节点执行与 trace | authoring semantics/test |
| `/ui/src/features/studio/authoring/step-executors.ts` | 步骤执行层 | flow step 执行器与运行细节 | `flow-runtime` |
| `/ui/src/features/studio/authoring/tool-adapters.ts` | 工具适配层 | tool adapter 声明与规范化 | authoring flow |
| `/ui/src/features/studio/authoring/output-contract.ts` | 输出契约层 | 字段输出格式/长度/目标约束模型 | authoring output 阶段 |

## Studio Templates

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/templates/index.ts` | 模板入口 | 模板统一导出与检索 | generation/state |
| `/ui/src/features/studio/templates/blankTemplate.ts` | 模板定义 | 空白模板定义 | templates index |
| `/ui/src/features/studio/templates/shippingRobotics.ts` | 模板定义 | shipping robotics 内建模板内容 | templates index |
| `/ui/src/features/studio/templates/warehouseAutomation.ts` | 模板定义 | warehouse automation 内建模板内容 | templates index |

## Audit

源码审计口径：
- 仅统计 `server/src` 与 `ui/src` 内 `.ts/.tsx/.css` 文件。
- 不含 `package.json`、静态资源、文档、锁文件与构建产物。
- 统计时间：`2026-04-06`

| 部分 | 代码行数 |
|---|---:|
| `Server App & Infra` | 1,826 |
| `Server Studio Engine` | 7,336 |
| `UI App & Infra` | 1,089 |
| `Report Feature` | 401 |
| `Studio Public Page Exports` | 5 |
| `Studio Module Library / Detail / Author Entry` | 450 |
| `Studio Runtime Shell` | 4,580 |
| `Studio Runtime Headless Hooks` | 2,243 |
| `Studio Runtime View / Preview Modules` | 4,399 |
| `Studio Runtime Homepage` | 551 |
| `Studio Runtime Kernel` | 3,995 |
| `Studio Core Config / Registry` | 2,087 |
| `Studio Generation / Report Modeling` | 8,200 |
| `Studio Editing / Runtime Actions / Render` | 9,581 |
| `Studio PPTX Export` | 1,980 |
| `Studio Authoring Subsystem` | 11,613 |
| `Studio Templates` | 1,069 |
| `总代码行数` | 61,405 |

备注：
- 当前最大文件已经从“单个路由 + 单个 helper 巨石”转成“作者台 + server core + runtime shell”三类热点：
  `authoring/ModuleAuthorWorkbenchPage.tsx` (`8,870`)、`server/src/lib/studio-engine/core.ts` (`4,421`)、`runtime/StudioShellPage.tsx` (`2,991`)。
- runtime 瘦身已经显著生效：`helpers.tsx` 现为 `5` 行 shim，`studio/store.ts` 现为 `113` 行 assembly entry。
- 这份 audit 反映的是当前实现规模，不代表复杂度均匀分布；当前维护压力主要集中在作者台巨石与 `server/src/lib/studio-engine/core.ts`，下一波最合理的继续拆分对象是 engine 内的 `evidence/planning/prompts` 簇。
