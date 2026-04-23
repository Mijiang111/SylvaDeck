# Claw Design
<img width="1362" height="760" alt="Claw-design" src="https://github.com/user-attachments/assets/574733ac-3581-42f1-b2c0-c6f334492d08" />

Claw Design is a local-first AI presentation workbench for generating, repairing, editing, and exporting 16:9 slide-like HTML decks.

This repository is still an `alpha`, but the core loop already works:

- generate decks from a natural-language brief
- review and repair layout/title/density issues
- keep the result editable inside an iframe-based Studio
- export publishable HTML and editable `.pptx`

This is also my first open-source GitHub project, so if you try it and something feels off, I’d really appreciate issues, suggestions, or setup feedback.

## Start Here

There are only **two ways to start**:

### Option 1: With an AI coding agent (recommended)

Install the Claw Design skill:

```bash
npx --yes skills add Mijiang111/claw-design --skill ppt-workbench-studio -g -y
```

Then refresh or restart your AI agent and simply describe the deck you want.

What this gives the agent:

- read source links first
- shape a Studio-ready prompt
- launch Studio through the local bridge
- open the result in your default browser

Skill source:

- GitHub: [skills/ppt-workbench-studio](https://github.com/Mijiang111/claw-design/tree/main/skills/ppt-workbench-studio)

### Option 2: Local manual setup

If you want to run Studio yourself:

```bash
pnpm studio:onboard
pnpm dev
```

Then open:

- UI: [http://127.0.0.1:5174](http://127.0.0.1:5174)
- Install guide: [http://127.0.0.1:5174/install](http://127.0.0.1:5174/install)

## What It Does

- Generates slide-like HTML reports from a raw brief
- Keeps output on a fixed `1600x900` canvas for PPT-style composition
- Supports template authoring with explicit AI text slots, charts, and decorative geometry
- Reviews generated pages for layout fit, title leaks, density, and repair opportunities
- Exports publishable HTML and editable `.pptx`

## Demo
<table>
  <tr>
    <td align="center"><b>演示视频 A</b></td>
    <td align="center"><b>演示视频 B</b></td>
  </tr>
  <tr>
    <td>

https://github.com/user-attachments/assets/e75017d0-33bd-4315-bc36-0d8e36dd6906

   </td>
    <td>

https://github.com/user-attachments/assets/f44fef6a-efa0-4c5d-b1f0-766061ff56c5

   </td>
  </tr>
</table>
<table>
  <tr>
    <td align="center"><b>模板工作台</b></td>
  </tr>
  <tr>
    <td><img src="docs/assets/template-workbench.png" alt="Template workbench"></td>
  </tr>
</table>

<table>
  <tr>
    <td align="center"><b>演示场景一</b></td>
    <td align="center"><b>演示场景二</b></td>
  </tr>
  <tr>
    <td><img src="docs/assets/picture1.png" alt="Demo picture 1"></td>
    <td><img src="docs/assets/picture2.png" alt="Demo picture 2"></td>
  </tr>
</table>

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
- A local Codex-compatible CLI or authenticated local agent environment

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
- Install guide: [http://127.0.0.1:5174/install](http://127.0.0.1:5174/install)

### Manual / Troubleshooting

If you do not want the bootstrap flow:

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Useful check:

```bash
pnpm studio:doctor
```

## Prompt Bridge Workflow

Studio now supports a local prompt-injection bridge for agent workflows:

1. the agent reads the source itself
2. the agent writes a clean Studio prompt
3. the agent calls `POST /api/studio/bridge/launch`
4. the returned `openUrl` is opened in the user's default browser
5. Studio consumes the prompt, creates a local project, and starts generation

The bridge is prompt-only. URLs and PDFs are meant to be read by the agent first, not uploaded into the product as source-grounded attachments.

## Project Structure

This is a monorepo with two separate packages for frontend and backend, managed by pnpm workspace:

```
claw-design/
├── ui/                    # Frontend: React + Vite workspace
│   ├── src/features/studio/   # Core features: generate, edit, preview, export
│   ├── src/api/               # Backend API calls
│   └── src/components/        # Common UI components
│
├── server/                # Backend: Express + Studio generation engine
│   ├── src/lib/studio-engine/ # AI generation core (orchestration, rendering, preflight, repair)
│   ├── src/routes/            # REST API routes
│   ├── src/middleware/        # Logging, validation middleware
│   └── skills/                # AI Skill files (layout repair, 3D titles, etc.)
│
├── vendor/html-ppt-skill/ # Built-in templates & theme library
│   ├── assets/themes/         # 8 color themes
│   ├── assets/animations/     # PPT animation CSS
│   └── templates/             # Complete deck templates + single-page components
│
├── tests/                 # Automated tests
│   ├── stability/             # Playwright stability tests
│   └── workspace-eval/        # Generation quality evaluation
│
├── docs/                  # Documentation & demo assets
├── skills/                # Public repo skills published to GitHub
└── scripts/               # Local development scripts
```

### Data Flow (One Sentence)

User inputs requirements in the **UI** → **Server** assembles prompt → calls **local AI Agent** to generate HTML → **Server** preflight/repair → returns to **UI** for preview rendering → export to PPT/HTML

### Key Module Quick Reference

| Module | Location | Purpose |
|--------|----------|---------|
| Generation Engine | `server/src/lib/studio-engine/core.ts` | Orchestrates the entire AI generation/repair workflow |
| Preflight & Repair | `server/src/lib/studio-engine/preflight.ts` | Checks page layout, title overflow, density issues |
| Renderer | `server/src/lib/studio-engine/render.ts` | Assembles AI-returned fragments into a complete deck |
| AI Executor | `server/src/lib/studio-engine/agent.ts` | Calls local AI, handles streaming output |
| Runtime Homepage | `ui/src/features/studio/runtime/StudioHomePage.tsx` | Homepage for users to create/manage projects |
| Generation Flow Hook | `ui/src/features/studio/runtime/hooks/useStudioGenerationFlow.ts` | State management for frontend generation flow |
| Template Library | `ui/src/features/studio/starter-packs/` | Built-in template registration & loading |
| Themes/Animations | `vendor/html-ppt-skill/assets/` | 8 themes + animation system |

> Want the most detailed file-level mapping? Check [`STUDIO_FILE_MAP.md`](STUDIO_FILE_MAP.md) (for internal team handover).
## API

Current server endpoints:

- `GET /api/health`
- `GET /api/install/status`
- `POST /api/install/onboard/stream`
- `POST /api/studio/bridge/launch`
- `GET /api/studio/bridge/launch/:launchId`
- `POST /api/studio/generate-html`
- `POST /api/studio/generate-html/stream`
- `POST /api/studio/revise-html/stream`

## Development Commands

```bash
pnpm studio:onboard
pnpm studio:doctor
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
- The install UI is local-first and meant for source bootstrap, not packaged desktop distribution
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
