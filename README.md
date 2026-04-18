# Claw Design

I’m open-sourcing this in alpha, this is a vibe coding project from uni student.

It already works, but it is still rough in places. Studio is a local-first AI presentation workbench for generating, refining, and authoring 16:9 HTML slide decks, and I’d really appreciate issues or feedback if you try it and hit something confusing.

Studio combines three workflows in one repo:

- AI-first deck generation from a natural-language brief
- A template workbench for building reusable page shape contracts
- A review and repair loop for fit, title quality, density, and export readiness

## Screenshots

![Studio home](docs/assets/studio-home.png)
![Template library](docs/assets/template-library.png)
![Template workbench](docs/assets/template-workbench.png)

## Demo

![Demo picture 1](docs/assets/picture1.png)
![Demo picture 2](docs/assets/picture2.png)

[▶️ 观看 Demo Video 1](https://github.com/Mijiang111/claw-design/blob/main/docs/assets/videos/video1.mp4)

[▶️ 观看 Demo Video 2](https://github.com/Mijiang111/claw-design/blob/main/docs/assets/videos/video2.mp4)

## What It Does

- Generates slide-like HTML reports from a raw brief
- Keeps output on a fixed 1600x900 canvas for PPT-style composition
- Supports template-authoring with explicit AI text slots, charts, and decorative geometry
- Reviews generated pages for layout fit, title leaks, density, and repair opportunities
- Exports publishable HTML and editable `.pptx`

## Current Status

This repository is an `alpha`.

- It is `local-first`: workspace state is stored in the browser
- It expects access to a local AI agent command for generation
- It is optimized for experimentation, authoring, and prompt/runtime iteration, not multi-user cloud deployment
- It still has rough edges in setup, generation quality, and template authoring UX

## Quick Start

### Requirements

- Node.js `20+`
- `pnpm` `9+`
- A local Codex-compatible command or authenticated local agent environment

### Install

```bash
pnpm install
```

### Configure

Copy the example env file if you want to customize ports or the local agent command:

```bash
cp .env.example .env
```

Key defaults:

- Server: `http://127.0.0.1:3101`
- UI: `http://127.0.0.1:5174`
- API base from the UI defaults to `/api`
- If your local AI agent is not configured, generation and revision flows will not fully work yet

### Run

```bash
pnpm dev
```

Then open:

- UI: [http://127.0.0.1:5174](http://127.0.0.1:5174)
- Health check: [http://127.0.0.1:3101/api/health](http://127.0.0.1:3101/api/health)

## Project Structure

这是一个 monorepo，前后端分成两个包，用 pnpm workspace 管理：

```
claw-design/
├── ui/                    # 前端：React + Vite 工作台
│   ├── src/features/studio/   # 核心功能：生成、编辑、预览、导出
│   ├── src/api/               # 后端 API 调用
│   └── src/components/        # 通用 UI 组件
│
├── server/                # 后端：Express + Studio 生成引擎
│   ├── src/lib/studio-engine/ # AI 生成核心（编排、渲染、预检、修复）
│   ├── src/routes/            # REST API 路由
│   ├── src/middleware/        # 日志、校验中间件
│   └── skills/                # AI Skill 文件（布局修复、3D 标题等）
│
├── vendor/html-ppt-skill/ # 内置模板与主题库
│   ├── assets/themes/         # 8 套配色主题
│   ├── assets/animations/     # PPT 动画 CSS
│   └── templates/             # 完整 deck 模板 + 单页组件
│
├── tests/                 # 自动化测试
│   ├── stability/             # Playwright 稳定性测试
│   └── workspace-eval/        # 生成质量评估
│
├── docs/                  # 文档与演示素材
└── scripts/               # 本地开发脚本
```

### 数据流（一句话）

用户在 **UI** 输入需求 → **Server** 组装 prompt → 调用 **本地 AI Agent** 生成 HTML → **Server** 预检/修复 → 返回 **UI** 渲染预览 → 导出 PPT/HTML

### 关键模块速查

| 模块 | 位置 | 作用 |
|------|------|------|
| 生成引擎 | `server/src/lib/studio-engine/core.ts` | 编排整个 AI 生成/修复流程 |
| 预检修复 | `server/src/lib/studio-engine/preflight.ts` | 检查页面布局、标题溢出、密度问题 |
| 渲染器 | `server/src/lib/studio-engine/render.ts` | 把 AI 返回的片段组装成完整 deck |
| AI 执行器 | `server/src/lib/studio-engine/agent.ts` | 调用本地 AI，处理流式输出 |
| 运行时首页 | `ui/src/features/studio/runtime/StudioHomePage.tsx` | 用户创建/管理项目的首页 |
| 生成流程 Hook | `ui/src/features/studio/runtime/hooks/useStudioGenerationFlow.ts` | 前端生成流程的状态管理 |
| 模板库 | `ui/src/features/studio/starter-packs/` | 内置模板注册与加载 |
| 主题/动画 | `vendor/html-ppt-skill/assets/` | 8 套主题 + 动画系统 |

> 想看最详细的文件级映射？可以查 [`STUDIO_FILE_MAP.md`](STUDIO_FILE_MAP.md)（团队内部交接用）。

## API

Current server endpoints:

- `GET /api/health`
- `POST /api/studio/generate-html`
- `POST /api/studio/generate-html/stream`
- `POST /api/studio/revise-html/stream`

## Development Commands

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm test:stability:quick
pnpm test:stability:full
pnpm test:workspace:eval
```

## Known Limitations

- Generation quality depends on your local AI agent setup and model access
- The current product is built for single-machine use, not shared cloud workspaces
- Browser storage is the primary persistence layer today
- The repository ships with a blank template seed only; reusable templates are expected to be authored in the workbench

## Feedback

If you try this repo, the most helpful feedback right now is:

- setup blockers
- generation failures or obviously weak output
- confusing template workbench moments

If something breaks or just feels weird, I’d really appreciate an issue.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Security

Please read [SECURITY.md](SECURITY.md) before reporting a vulnerability.

## License

[MIT](LICENSE)
