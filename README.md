# Claw Design
<img width="1362" height="760" alt="Claw-design" src="https://github.com/user-attachments/assets/574733ac-3581-42f1-b2c0-c6f334492d08" />

I’m open-sourcing this in alpha, this is a vibe coding project from uni-student. 

It already works, but it is still rough in places. Studio is a local-first AI presentation workbench for generating, refining, and authoring 16:9 HTML slide decks, and I’d really appreciate issues or feedback if you try it and hit something confusing.

Studio combines three workflows in one repo:

- AI-first deck generation from a natural-language brief
- A template workbench for building reusable page shape contracts
- A review and repair loop for fit, title quality, density, and export readiness

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
