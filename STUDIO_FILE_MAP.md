# PPT Studio 100% 文件级映射表

说明：
- 范围：`ppt-workbench-studio` 项目内所有“源码/配置”文件。
- 已排除：`node_modules/`、`dist/`、`tsconfig.tsbuildinfo` 这类依赖与构建产物。
- 结构：`文件路径 | 架构层 | 功能/职责 | 主要入口或调用关系`
- 审计口径：文末 `Audit` 只统计 `server/src` 与 `ui/src` 内的 `.ts/.tsx/.css` 源码行数，不含 `package.json`、静态资源、文档和构建产物。

## Root

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/pnpm-lock.yaml` | 配置层 | 锁定依赖版本 | - |
| `/STUDIO_FILE_MAP.md` | 文档层 | 本文件：完整文件映射 | - |
| `/.gitignore` | 资源层 | 忽略日志、数据与构建缓存 | - |
| `/package.json` | 配置层 | monorepo 脚本（`dev/build/typecheck`） | - |
| `/pnpm-workspace.yaml` | 配置层 | 声明子包 `server`、`ui` | - |

## Server

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/server/package.json` | 配置层 | server 依赖与脚本 | - |
| `/server/tsconfig.json` | 配置层 | server 编译规则 | - |

## Server App & Infra

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/server/src/app.ts` | 源码层 | 挂载中间件、`/api/health`、`/api` 路由、错误处理 | 被 `index.ts` 调用 |
| `/server/src/index.ts` | 源码层 | 创建 HTTP 服务，读取 `PPT_STUDIO_PORT/HOST` | 子模块聚合/统一导出 |
| `/server/src/middleware/validate.ts` | 源码层 | zod request body 校验包装器 | 被 `app.ts` 使用 |
| `/server/src/middleware/logger.ts` | 源码层 | pino logger + http logger | 被 `app.ts` 使用 |
| `/server/src/lib/industry-style.ts` | 源码层 | deck 行业/风格 profile 推断与 token 解析 | 被 `routes/studio.ts` 调用 |
| `/server/src/lib/cursor-cli.ts` | 源码层 | 执行本地 agent CLI、环境检测、超时与日志流 | 被 `routes/studio.ts` 调用 |
| `/server/src/routes/studio.ts` | 源码层 | `POST /api/studio/generate-html*` 与 `revise-html/stream`，只负责 HTTP/validation/stream wiring | 被 `app.ts` 挂载 |

## Server Studio Engine

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/server/src/lib/studio-engine/preflight.ts` | 源码层 | 生成前预检与输入验证 | route 与 engine 调度 |
| `/server/src/lib/studio-engine/thinking-mode.ts` | 源码层 | thinking mode 选择策略 | route 与 engine 调度 |
| `/server/src/lib/studio-engine/kimi-exec.mjs` | 脚本层 | Kimi 执行脚本与 CLI 封装 | route 与 engine 调度 |
| `/server/src/lib/studio-engine/eval.ts` | 源码层 | engine 评估与质量检测 | route 与 engine 调度 |
| `/server/src/lib/studio-engine/workspace.ts` | 源码层 | workspace 状态管理与快照 | route 与 engine 调度 |
| `/server/src/lib/studio-engine/contracts.ts` | 源码层 | engine 共享类型、stream event、pressure/review budget、hero/chart 内部 contract | route 与 engine 调度 |
| `/server/src/lib/studio-engine/brief-synthesis.ts` | 源码层 | brief 多源合成与摘要生成 | route 与 engine 调度 |
| `/server/src/lib/studio-engine/agent.ts` | 源码层 | stage 执行、trace、timeout、stream writer、agent config glue | route 与 engine 调度 |
| `/server/src/lib/studio-engine/schemas.ts` | 源码层 | studio generate/revise 请求与测量 schema 定义 | route 与 engine 调度 |
| `/server/src/lib/studio-engine/core.ts` | 源码层 | 生成/修补主编排、evidence/planning/prompt/repair 总流程 | route 与 engine 调度 |
| `/server/src/lib/studio-engine/brief.ts` | 源码层 | brief 归一化、压缩、标题/文本工具、基础证据文本辅助 | route 与 engine 调度 |
| `/server/src/lib/studio-engine/freeform-layout.ts` | 源码层 | freeform 布局策略与 zone 分配 | route 与 engine 调度 |
| `/server/src/lib/studio-engine/complexity.ts` | 源码层 | 生成复杂度评估与预算计算 | route 与 engine 调度 |
| `/server/src/lib/studio-engine/page-count.ts` | 源码层 | 页数推断与预算分配 | route 与 engine 调度 |
| `/server/src/lib/studio-engine/render.ts` | 源码层 | HTML 文档抽取、单页验证、deterministic render、最终 deck 组装 | route 与 engine 调度 |
| `/server/src/lib/studio-engine/skills.ts` | 源码层 | 加载 analysis/layout-repair/3d-hero skill 与 hero references | route 与 engine 调度 |
| `/server/src/lib/studio-engine/working-memory.ts` | 源码层 | working memory 管理与上下文压缩 | route 与 engine 调度 |
| `/server/src/lib/studio-engine/repair.ts` | 源码层 | deterministic shrink、measurement 摘要、repair 文本/HTML 压缩辅助 | route 与 engine 调度 |
| `/server/src/lib/studio-engine/kimi-adapter.ts` | 源码层 | Kimi API 调用适配与流式响应处理 | route 与 engine 调度 |

## Server Engine Tests

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/server/src/lib/studio-engine/page-count.test.ts` | 测试层 | 页数推断单元测试 | jest/vitest |
| `/server/src/lib/studio-engine/core.test.ts` | 测试层 | core 编排层单元测试 | jest/vitest |
| `/server/src/lib/studio-engine/workspace.test.ts` | 测试层 | workspace 单元测试 | jest/vitest |
| `/server/src/lib/studio-engine/agent.test.ts` | 测试层 | agent 层单元测试 | jest/vitest |
| `/server/src/lib/studio-engine/preflight.test.ts` | 测试层 | 预检逻辑单元测试 | jest/vitest |
| `/server/src/lib/studio-engine/thinking-mode.test.ts` | 测试层 | thinking mode 单元测试 | jest/vitest |
| `/server/src/lib/studio-engine/workspace-eval.test.ts` | 测试层 | workspace 评估单元测试 | jest/vitest |
| `/server/src/lib/studio-engine/render.test.ts` | 测试层 | render 层单元测试 | jest/vitest |
| `/server/src/lib/studio-engine/working-memory.test.ts` | 测试层 | working memory 单元测试 | jest/vitest |

## Server Skills

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/server/skills/studio-layout-repair/SKILL.md` | 文档层 | layout-repair skill：布局修复策略与规则 | - |
| `/server/skills/studio-thinking-academic-research/SKILL.md` | 文档层 | thinking skill：学术研究思维模式 | - |
| `/server/skills/studio-3d-hero/SKILL.md` | 文档层 | 3d-hero skill：3D hero 元素生成 | - |
| `/server/skills/studio-3d-hero/references/composition-families.md` | 文档层 | 3D hero composition families 参考 | - |
| `/server/skills/studio-3d-hero/references/material-and-annotation-language.md` | 文档层 | 3D hero 材质与标注语言参考 | - |
| `/server/skills/studio-3d-hero/references/prompt-examples.md` | 文档层 | 3D hero prompt 示例参考 | - |
| `/server/skills/studio-3d-hero/references/object-grammar-chip-platform.md` | 文档层 | 3D hero object grammar 参考 | - |
| `/server/skills/studio-data-analysis/SKILL.md` | 文档层 | data-analysis skill：数据分析图表生成 | - |
| `/server/skills/studio-thinking-strategy/SKILL.md` | 文档层 | thinking skill：战略分析思维模式 | - |
| `/server/skills/studio-thinking-case-study/SKILL.md` | 文档层 | thinking skill：案例研究思维模式 | - |

## UI Root

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/index.html` | 页面层 | SPA 挂载点与基础 meta | - |
| `/ui/package.json` | 配置层 | UI 依赖与脚本 | - |
| `/ui/tsconfig.json` | 配置层 | UI 编译规则 | - |
| `/ui/vite.config.ts` | 源码层 | Vite dev server、`/api` 代理到 server | - |
| `/ui/public/favicon.svg` | 资源层 | 站点图标 | - |

## UI App & Infra

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/App.tsx` | 源码层 | 声明全部页面路由：`/`、`/modules*`、`/projects/:id/published` | 被 `main.tsx` 调用 |
| `/ui/src/main.tsx` | 源码层 | 挂载 React App | 浏览器入口 |
| `/ui/src/index.css` | 样式层 | 全局 CSS/Tailwind 层基础样式 | generation/state/runtime |
| `/ui/src/vite-env.d.ts` | 源码层 | Vite 环境类型声明 | generation/state/runtime |
| `/ui/src/components/ui/textarea.tsx` | 源码层 | 统一 textarea 组件 | generation/state/runtime |
| `/ui/src/lib/utils.ts` | 源码层 | 通用工具函数 | generation/state/runtime |
| `/ui/src/lib/router.tsx` | 源码层 | 封装路由组件与 hooks | generation/state/runtime |
| `/ui/src/api/client.ts` | 源码层 | `fetch`/HTTP client 抽象 | generation/state/runtime |

## Report Feature

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/report/StudioPublishedPage.tsx` | 源码层 | 渲染 published report、支持 `?export=html/pdf` | generation/state/runtime |

## Studio Public Page Exports

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/StudioModuleAuthorPage.tsx` | 源码层 | 模块作者页导出别名 | 路由/App.tsx |
| `/ui/src/features/studio/StudioProjectEditPage.tsx` | 源码层 | 项目编辑页导出别名 | 路由/App.tsx |
| `/ui/src/features/studio/StudioModuleDetailPage.tsx` | 源码层 | 模块详情页面导出别名 | 路由/App.tsx |
| `/ui/src/features/studio/StudioShellPage.tsx` | 源码层 | `StudioShellPage` 的稳定导出别名 | 路由/App.tsx |
| `/ui/src/features/studio/StudioModuleLibraryPage.tsx` | 源码层 | 模块库页面导出别名 | 路由/App.tsx |

## Studio Module Library / Detail / Author Entry

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/ModuleDetailPage.tsx` | 源码层 | 单模块详情、信任状态、测试证据展示 | 路由/App.tsx |
| `/ui/src/features/studio/ModuleLibraryPage.tsx` | 源码层 | 模块库列表、筛选状态、详情/编辑跳转 | 路由/App.tsx |
| `/ui/src/features/studio/ModuleAuthorWorkbench.tsx` | 源码层 | 作者工作台导出桥接 | generation/state/runtime |

## Studio Runtime Shell

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/runtime/HtmlStructureEditor.tsx` | 源码层 | 文本结构（block/section）编辑 | Shell / runtime |
| `/ui/src/features/studio/runtime/StudioHomePage.tsx` | 源码层 | AI Chat / Library / Author 首页状态与新建项目入口 | 路由/App.tsx |
| `/ui/src/features/studio/runtime/StudioShellPage.tsx` | 源码层 | 组合 shell 视图，拼装 runtime hooks、rail/canvas/inspector/transcript | 路由/App.tsx |
| `/ui/src/features/studio/runtime/HtmlLayoutEditor.tsx` | 源码层 | 布局分区/zone 编辑 | Shell / runtime |
| `/ui/src/features/studio/runtime/editor-chrome-tokens.ts` | 源码层 | Editor/Shell 视觉 token | Shell / runtime |
| `/ui/src/features/studio/runtime/HtmlVisualEditor.tsx` | 源码层 | 视觉节点编辑（样式、视觉内容） | Shell / runtime |
| `/ui/src/features/studio/runtime/helpers.tsx` | 源码层 | 向后兼容导出 runtime 预览/视图模块 | Shell / runtime |

## Studio Runtime Headless Hooks

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/runtime/hooks/useStudioDeckReviewFlow.ts` | 源码层 | review/repair/optimize 调度、timeout、abort | Shell / runtime |
| `/ui/src/features/studio/runtime/hooks/useLongFormClarification.ts` | 源码层 | long-form clarification 条件、回执、resolution 派生 | Shell / runtime |
| `/ui/src/features/studio/runtime/hooks/useStudioGenerationFlow.ts` | 源码层 | generate/regenerate/continue conversation 主编排 | Shell / runtime |
| `/ui/src/features/studio/runtime/hooks/useStudioExportActions.ts` | 源码层 | HTML/PPTX export、bundle import/export notes | Shell / runtime |
| `/ui/src/features/studio/runtime/hooks/deck-review-helpers.ts` | 源码层 | deck review 辅助函数与状态派生 | Shell / runtime |
| `/ui/src/features/studio/runtime/hooks/useStudioTranscriptState.ts` | 源码层 | streaming transcript、partial pages、status line、stream error | Shell / runtime |

## Studio Runtime View / Preview Modules

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/runtime/runtime-shell-contract.ts` | 源码层 | shell hook 输入/输出契约与共享状态类型 | Shell / runtime |
| `/ui/src/features/studio/runtime/runtime-storyline.tsx` | 源码层 | storyline 相关 runtime 视图辅助 | Shell / runtime |
| `/ui/src/features/studio/runtime/runtime-presentational.tsx` | 源码层 | `ShellLabel`、`InfoHint`、timestamp、generation label | Shell / runtime |
| `/ui/src/features/studio/runtime/runtime-types.ts` | 源码层 | runtime 共享类型、storyline 与 preview 相关类型 | Shell / runtime |
| `/ui/src/features/studio/runtime/runtime-report-views.tsx` | 源码层 | `HtmlReportFrame`、filmstrip、canvas view、streaming canvas | Shell / runtime |
| `/ui/src/features/studio/runtime/runtime-export-annotations.ts` | 源码层 | export notes/warnings、chart export 文案整理 | Shell / runtime |
| `/ui/src/features/studio/runtime/runtime-preview-frame.tsx` | 源码层 | iframe preview、transform preview、hit-testing、page fit reporting | Shell / runtime |
| `/ui/src/features/studio/runtime/runtime-intake.ts` | 源码层 | greeting/starters、brief summary/follow-up builders、starter project helpers | Shell / runtime |
| `/ui/src/features/studio/runtime/runtime-report-view-math.ts` | 源码层 | report view 坐标/尺寸数学计算 | Shell / runtime |

## Studio Runtime Homepage

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/runtime/homepage/AiHome.tsx` | 源码层 | AI 模式首页内容 | Shell / runtime |
| `/ui/src/features/studio/runtime/homepage/HomeShell.tsx` | 源码层 | 首页布局容器 | Shell / runtime |
| `/ui/src/features/studio/runtime/homepage/HomeSidebar.tsx` | 源码层 | 首页侧边栏 | Shell / runtime |
| `/ui/src/features/studio/runtime/homepage/LibraryHome.tsx` | 源码层 | Library 模式首页内容 | Shell / runtime |
| `/ui/src/features/studio/runtime/homepage/types.ts` | 源码层 | homepage 局部类型 | Shell / runtime |
| `/ui/src/features/studio/runtime/homepage/HomepageThemeTokens.ts` | 源码层 | homepage 视觉 token | Shell / runtime |
| `/ui/src/features/studio/runtime/homepage/LibraryReportCard.tsx` | 源码层 | 报告卡片组件 | Shell / runtime |
| `/ui/src/features/studio/runtime/homepage/AuthorHome.tsx` | 源码层 | Author 模式首页内容 | Shell / runtime |
| `/ui/src/features/studio/runtime/homepage/RecentStrip.tsx` | 源码层 | 最近项目横条 | Shell / runtime |

## Studio Runtime Kernel (store/repo/inspector/virtual/export)

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/runtime/studio/archiveImport.ts` | 源码层 | 一次性从旧 localStorage 导入 archive 数据 | Shell / runtime |
| `/ui/src/features/studio/runtime/studio/repository.ts` | 源码层 | IndexedDB 读写、session 恢复、workspace/project/asset repository | Shell / runtime |
| `/ui/src/features/studio/runtime/studio/utils.ts` | 源码层 | snapshot/project/workspace 操作、patch 辅助、selector 辅助 | Shell / runtime |
| `/ui/src/features/studio/runtime/studio/types.ts` | 源码层 | store/repository/history/selection/asset 类型 | Shell / runtime |
| `/ui/src/features/studio/runtime/studio/export.ts` | 源码层 | 导出前资源准备（字体/图像 ready） | Shell / runtime |
| `/ui/src/features/studio/runtime/studio/useStudioWorkspace.ts` | 源码层 | 组装当前 workspace/project 的 runtime 视图模型 | Shell / runtime |
| `/ui/src/features/studio/runtime/studio/WorkbenchStudioVirtual.tsx` | 源码层 | 长列表虚拟化（list/rail） | Shell / runtime |
| `/ui/src/features/studio/runtime/studio/store.ts` | 源码层 | 根 Zustand store 的 assembly entry，拼接各 slice | Shell / runtime |
| `/ui/src/features/studio/runtime/studio/WorkbenchStudioInspector.tsx` | 源码层 | schema-driven inspector + debounce 输入字段 | Shell / runtime |
| `/ui/src/features/studio/runtime/studio/store/historySlice.ts` | 源码层 | undo/redo、patch bookkeeping、save state | Shell / runtime |
| `/ui/src/features/studio/runtime/studio/store/shellSlice.ts` | 源码层 | shell mode、drawer、toolbar、scale、status line | Shell / runtime |
| `/ui/src/features/studio/runtime/studio/store/shared.ts` | 源码层 | project patch/mutation/history 公共 helper | Shell / runtime |
| `/ui/src/features/studio/runtime/studio/store/projectSlice.ts` | 源码层 | project create/duplicate/delete、commit/report replacement | Shell / runtime |
| `/ui/src/features/studio/runtime/studio/store/briefSlice.ts` | 源码层 | intake brief 与 follow-up 输入管理 | Shell / runtime |
| `/ui/src/features/studio/runtime/studio/store/authoringSlice.ts` | 源码层 | authoring handoff 相关运行时状态 | Shell / runtime |
| `/ui/src/features/studio/runtime/studio/store/importExportSlice.ts` | 源码层 | hydrate/bootstrap、bundle import、snapshot import glue | Shell / runtime |
| `/ui/src/features/studio/runtime/studio/store/librarySlice.ts` | 源码层 | workspace summaries、library selection、queries | Shell / runtime |
| `/ui/src/features/studio/runtime/studio/store/selectionSlice.ts` | 源码层 | active page/block/visual/layout、page overflow、intake input | Shell / runtime |

## Studio Core Config / Registry

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/config/modules.ts` | 源码层 | 内建模块定义 | feature 直接引用 |
| `/ui/src/features/studio/config/moduleSkillPresets.ts` | 源码层 | 模块-技能预设关系 | feature 直接引用 |
| `/ui/src/features/studio/config/selectors.ts` | 源码层 | 配置查询选择器函数 | feature 直接引用 |
| `/ui/src/features/studio/config/constants.ts` | 源码层 | 存储 key、默认值、命名常量 | feature 直接引用 |
| `/ui/src/features/studio/config/index.ts` | 源码层 | config 子模块聚合 | 子模块聚合/统一导出 |
| `/ui/src/features/studio/config/skills.ts` | 源码层 | 可选技能定义 | feature 直接引用 |
| `/ui/src/features/studio/config/catalog.ts` | 源码层 | 模块/技能目录相关元数据 | feature 直接引用 |

## Studio Generation / Report Modeling

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/analysis-skills.ts` | 源码层 | brief 分析相关技能解析 | generation/state/runtime |
| `/ui/src/features/studio/html-page-grammars.ts` | 源码层 | HTML 页面语法/约束解析规则 | generation/state/runtime |
| `/ui/src/features/studio/html-report-structure.ts` | 源码层 | HTML -> 可编辑文本结构抽取与规范化 | generation/state/runtime |
| `/ui/src/features/studio/template-skills.ts` | 源码层 | template 对应技能策略解析 | generation/state/runtime |
| `/ui/src/features/studio/industry-style.ts` | 源码层 | deck 行业风格 profile 与主题选择辅助 | generation/state/runtime |
| `/ui/src/features/studio/html-report-animation.ts` | 源码层 | HTML report 动画解析与运行时应用 | generation/state/runtime |
| `/ui/src/features/studio/generation-assets.ts` | 源码层 | draft asset 创建、签名、复用判断 | generation/state/runtime |
| `/ui/src/features/studio/design-critic.ts` | 源码层 | 设计质量评估/批注辅助逻辑 | generation/state/runtime |
| `/ui/src/features/studio/html-report-fit.ts` | 源码层 | HTML report 页面 fit 计算与自适应策略 | generation/state/runtime |
| `/ui/src/features/studio/page-archetypes.ts` | 源码层 | 页型 archetype 规则选择 | generation/state/runtime |
| `/ui/src/features/studio/html-report-layout.ts` | 源码层 | HTML -> 布局 zone 抽取与规范化 | generation/state/runtime |
| `/ui/src/features/studio/generation-skills.ts` | 源码层 | generation 时技能上下文构建 | generation/state/runtime |
| `/ui/src/features/studio/html-report-theme.ts` | 源码层 | 报告主题 token 与映射辅助 | generation/state/runtime |
| `/ui/src/features/studio/html-report-canvas.ts` | 源码层 | freeform canvas override 应用与页面坐标映射 | generation/state/runtime |
| `/ui/src/features/studio/generation.ts` | 源码层 | brief 到 HTML report 的主流程编排，调用后端生成并解析为页面 | generation/state/runtime |
| `/ui/src/features/studio/html-fit-role.ts` | 源码层 | HTML fit 角色模型与布局协商 | generation/state/runtime |
| `/ui/src/features/studio/html-report-visuals.ts` | 源码层 | HTML -> visual node 抽取与规范化 | generation/state/runtime |
| `/ui/src/features/studio/generation-contract.ts` | 源码层 | 生成流程使用的数据合同与类型定义 | generation/state/runtime |

## Studio Editing / Runtime Actions / Render

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/module-assets.ts` | 源码层 | 模块测试记录、发布证据、资产持久化 | generation/state/runtime |
| `/ui/src/features/studio/module-runtime-input.ts` | 源码层 | brief/source -> module runtime 输入模型 | Shell / runtime |
| `/ui/src/features/studio/thinking-mode.ts` | 源码层 | 前端 thinking mode 选择与提示 | generation/state/runtime |
| `/ui/src/features/studio/state.ts` | 源码层 | 项目库读写、bundle 导入导出、旧状态兼容读写 | generation/state/runtime |
| `/ui/src/features/studio/composition-test-runtime.ts` | 源码层 | 组合测试 case 执行框架 | Shell / runtime |
| `/ui/src/features/studio/slide-scene.ts` | 源码层 | slide scene 数据构造 | generation/state/runtime |
| `/ui/src/features/studio/module-authoring-handoff.ts` | 源码层 | 从 editor 选区提炼模块草稿并跳转作者台 | generation/state/runtime |
| `/ui/src/features/studio/module-output.ts` | 源码层 | 模块输出归一化/映射 | generation/state/runtime |
| `/ui/src/features/studio/slide-scene-renderer.tsx` | 源码层 | slide scene React 渲染器 | generation/state/runtime |
| `/ui/src/features/studio/renderers.tsx` | 源码层 | 通用 block/page 渲染组件 | generation/state/runtime |
| `/ui/src/features/studio/module-actions.ts` | 源码层 | block/module 可执行动作定义与运行辅助 | generation/state/runtime |
| `/ui/src/features/studio/types.ts` | 源码层 | 项目、页面、模块、生成、发布等主类型定义 | generation/state/runtime |
| `/ui/src/features/studio/export.ts` | 源码层 | HTML 导出能力（下载、序列化） | generation/state/runtime |
| `/ui/src/features/studio/ai-settings.ts` | 源码层 | 模型/生成偏好本地配置与读取辅助 | generation/state/runtime |
| `/ui/src/features/studio/module-fields.ts` | 源码层 | 模块字段定义与字段级逻辑 | generation/state/runtime |
| `/ui/src/features/studio/page-count.ts` | 源码层 | 页数计算与预算辅助 | generation/state/runtime |
| `/ui/src/features/studio/module-composition.ts` | 源码层 | 模块组合与装配逻辑 | generation/state/runtime |
| `/ui/src/features/studio/module-execution.ts` | 源码层 | 模块运行器与执行封装 | generation/state/runtime |

## Studio PPTX Export

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/pptx/export-pptx.ts` | 源码层 | slide/page/chart -> `.pptx` 的本地导出主实现 | generation/state/runtime |

## Studio Authoring Subsystem

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/authoring/output-contract.ts` | 源码层 | 字段输出格式/长度/目标约束模型 | generation/state/runtime |
| `/ui/src/features/studio/authoring/TemplateLibraryModal.tsx` | 源码层 | 模板库选择弹窗 | generation/state/runtime |
| `/ui/src/features/studio/authoring/step-executors.ts` | 源码层 | flow step 执行器与运行细节 | generation/state/runtime |
| `/ui/src/features/studio/authoring/DefineStagePanel.tsx` | 源码层 | Define 阶段面板（字段/模块定义） | generation/state/runtime |
| `/ui/src/features/studio/authoring/ModuleAuthorWorkbenchPage.tsx` | 源码层 | 模块作者工作台（define/compose/semantics/test/publish） | 路由/App.tsx |
| `/ui/src/features/studio/authoring/chart-preview.tsx` | 源码层 | authoring chart 预览组件 | generation/state/runtime |
| `/ui/src/features/studio/authoring/thinking-flow-model.ts` | 源码层 | thinking flow 数据模型 | generation/state/runtime |
| `/ui/src/features/studio/authoring/useTemplateLibraryController.ts` | 源码层 | 模板库选择逻辑控制器 | generation/state/runtime |
| `/ui/src/features/studio/authoring/flow-runtime.ts` | 源码层 | thinking flow 节点执行与 trace | Shell / runtime |
| `/ui/src/features/studio/authoring/authoring-constants.ts` | 源码层 | authoring 常量定义 | generation/state/runtime |
| `/ui/src/features/studio/authoring/authoring-local-types.ts` | 源码层 | authoring 局部类型 | generation/state/runtime |
| `/ui/src/features/studio/authoring/index.ts` | 源码层 | authoring 对外统一导出 | 子模块聚合/统一导出 |
| `/ui/src/features/studio/authoring/authoring-canvas-utils.ts` | 源码层 | authoring 画布工具函数 | generation/state/runtime |
| `/ui/src/features/studio/authoring/helpers.tsx` | 源码层 | 画布、布局、拖拽、字段/节点辅助函数 | generation/state/runtime |
| `/ui/src/features/studio/authoring/tool-adapters.ts` | 源码层 | tool adapter 声明与规范化 | generation/state/runtime |
| `/ui/src/features/studio/authoring/panels/AuthoringStageRail.tsx` | 源码层 | authoring 阶段轨道栏 | generation/state/runtime |
| `/ui/src/features/studio/authoring/panels/ComposeStagePanel.tsx` | 源码层 | Compose 阶段面板 | generation/state/runtime |
| `/ui/src/features/studio/authoring/panels/PublishStagePanel.tsx` | 源码层 | Publish 阶段面板 | generation/state/runtime |
| `/ui/src/features/studio/authoring/panels/TestStagePanel.tsx` | 源码层 | Test 阶段面板 | generation/state/runtime |
| `/ui/src/features/studio/authoring/panels/index.ts` | 源码层 | panels 子模块统一导出 | 子模块聚合/统一导出 |
| `/ui/src/features/studio/authoring/panels/SemanticsStagePanel.tsx` | 源码层 | Semantics 阶段面板 | generation/state/runtime |
| `/ui/src/features/studio/authoring/canvas/TemplateCanvasStage.tsx` | 源码层 | 模板画布舞台组件 | generation/state/runtime |
| `/ui/src/features/studio/authoring/canvas/index.ts` | 源码层 | canvas 子模块统一导出 | 子模块聚合/统一导出 |
| `/ui/src/features/studio/authoring/canvas/TemplateCanvasToolbar.tsx` | 源码层 | 模板画布工具栏 | generation/state/runtime |
| `/ui/src/features/studio/authoring/canvas/ThinkingFlowCanvas.tsx` | 源码层 | thinking flow 画布组件 | generation/state/runtime |

## Studio Templates

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/templates/blankTemplate.ts` | 源码层 | 空白模板定义 | generation/state/runtime |
| `/ui/src/features/studio/templates/index.ts` | 源码层 | 模板统一导出与检索 | 子模块聚合/统一导出 |

## Studio Starter Packs

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/starter-packs/authoring.ts` | 源码层 | authoring starter packs 定义 | generation/state/runtime |
| `/ui/src/features/studio/starter-packs/registry.ts` | 源码层 | starter packs 注册与管理 | feature 直接引用 |
| `/ui/src/features/studio/starter-packs/index.ts` | 源码层 | starter packs 统一导出 | 子模块聚合/统一导出 |

## Studio Text Layout

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/text-layout/text-layout-dom.ts` | 源码层 | text layout DOM 测量与适配 | generation/state/runtime |
| `/ui/src/features/studio/text-layout/pretext-engine.ts` | 源码层 | pretext 排版引擎 | generation/state/runtime |
| `/ui/src/features/studio/text-layout/text-layout-cache.ts` | 源码层 | text layout 结果缓存 | generation/state/runtime |
| `/ui/src/features/studio/text-layout/text-layout-types.ts` | 源码层 | text layout 类型定义 | generation/state/runtime |

## UI Tests

| 文件 | 架构层 | 功能/职责 | 主要入口或调用关系 |
|---|---|---|---|
| `/ui/src/features/studio/html-report-fit.test.ts` | 测试层 | html-report-fit 单元测试 | jest/vitest |
| `/ui/src/features/studio/html-fit-role.test.ts` | 测试层 | html-fit-role 单元测试 | jest/vitest |
| `/ui/src/features/studio/module-assets.test.ts` | 测试层 | module-assets 单元测试 | jest/vitest |
| `/ui/src/features/studio/generation.test.ts` | 测试层 | generation 单元测试 | jest/vitest |
| `/ui/src/features/studio/ai-settings.test.ts` | 测试层 | ai-settings 单元测试 | jest/vitest |
| `/ui/src/features/studio/state.test.ts` | 测试层 | state 单元测试 | jest/vitest |
| `/ui/src/features/studio/html-report-animation.test.ts` | 测试层 | html-report-animation 单元测试 | jest/vitest |
| `/ui/src/features/studio/runtime/runtime-report-view-math.test.ts` | 测试层 | report view math 单元测试 | jest/vitest |
| `/ui/src/features/studio/runtime/hooks/deck-review-helpers.test.ts` | 测试层 | deck review helpers 单元测试 | jest/vitest |
| `/ui/src/features/studio/authoring/helpers.test.ts` | 测试层 | authoring helpers 单元测试 | jest/vitest |
| `/ui/src/features/studio/starter-packs/registry.test.ts` | 测试层 | starter packs registry 单元测试 | jest/vitest |

## Audit

源码审计口径：
- 仅统计 `server/src` 与 `ui/src` 内 `.ts/.tsx/.css` 文件。
- 不含 `package.json`、静态资源、文档、锁文件与构建产物。
- 统计时间：`2026-04-19`

| 部分 | 代码行数 |
|---|---:|
| `Server App & Infra` | 1,888 |
| `Server Studio Engine` | 19,264 |
| `UI App & Infra` | 1,102 |
| `Report Feature` | 401 |
| `Studio Public Page Exports` | 5 |
| `Studio Module Library / Detail / Author Entry` | 646 |
| `Studio Runtime Shell` | 5,750 |
| `Studio Runtime Headless Hooks` | 2,193 |
| `Studio Runtime View / Preview Modules` | 5,701 |
| `Studio Runtime Homepage` | 551 |
| `Studio Runtime Kernel` | 4,069 |
| `Studio Core Config / Registry` | 2,126 |
| `Studio Generation / Report Modeling` | 9,589 |
| `Studio Editing / Runtime Actions / Render` | 11,002 |
| `Studio PPTX Export` | 2,032 |
| `Studio Authoring Subsystem` | 13,084 |
| `Studio Templates` | 101 |
| `Studio Starter Packs` | 1,445 |
| `Studio Text Layout` | 660 |
| `UI Tests` | 766 |
| `总代码行数` | 82,375 |
