---
name: ppt-workbench-studio
description: Use when working inside the ppt-workbench-studio repo, or when the user asks to use their Studio/plugin workflow to generate a deck in the browser editor. Default to reading source links first, then using the user's default browser to open Studio UI, trigger generation, and stop once the request is sent. Use API-first only for true headless generation. Do not use temporary browser profiles.
---

# PPT Workbench Studio

Use this skill when the current workspace is `ppt-workbench-studio`, or when the user explicitly wants to use their own Studio/plugin workflow instead of hand-authoring an external slide deck.

## What exists now

- **Prompt injection bridge**: `POST /api/studio/bridge/launch` creates a short-lived launch task and returns an `openUrl`.
- **UI handoff path**: opening that exact returned `openUrl` in the user's default browser makes Studio consume the task, create a local project, and auto-start generation.
- **Headless API path**: `/api/studio/generate-html` and `/api/studio/generate-html/stream` still exist for true headless use.

Because of that, URL or PDF tasks must be handled as:

1. the agent reads the source itself
2. the agent writes a good Studio prompt
3. the agent posts that prompt to the local bridge
4. the agent opens the returned `openUrl` exactly in the default browser

Do not treat URLs or PDFs as product-side attachments. The bridge is **prompt-only**, not source-grounded.

## Default path

Use this path by default whenever the goal is to generate in Studio and hand the result to a human:

1. Open the source link in the **user's default browser**.
2. Read the source and extract the facts, structure, and likely page split.
3. Build a concise Studio-ready prompt.
4. `POST` the prompt to `/api/studio/bridge/launch`.
5. Parse the returned `openUrl`.
6. In the **same default browser profile**, open that exact `openUrl`.
7. Do not replace it with the Studio homepage or a hand-written root URL.
8. Stop as soon as the browser has opened the launch URL.

Do **not** keep waiting for `/projects/:id/edit`, review settle, or iframe readiness unless the user explicitly asks.

Opening `http://127.0.0.1:5174/` by itself is not enough. The bridge only works when the browser visits the specific returned launch URL, for example:

```bash
open 'http://127.0.0.1:5174/?bridgeLaunch=<launch-id>'
```

If you created a launch task but only opened the Studio homepage, assume the prompt was **not** injected.

Read `references/default-browser-flow.md` only when you need the exact stop point and browser expectations.

## Source reading rule

If the user gives you a URL or PDF:

- read it first
- decide what matters
- synthesize the prompt yourself
- then use Studio

Do not dump the full article or PDF text into the prompt. The current engine responds better to structure than to raw volume.

## Source-to-Studio translation workflow

Treat the skill as a translator from messy source material into a short Studio-ready page blueprint. Think first, then write only the final blueprint into the Studio prompt.

1. **Extract facts**: compress the source into 6-12 `Observed facts`. Keep only facts, numbers, labels, dates, and relationships that deserve to survive into slides.
2. **Choose page count**: use 1 page for a single exhibit, screenshot recreation, or one argument; use 3-5 pages for normal analysis; expand only for long reports with genuinely distinct sections.
3. **Write the page story**: for every page, decide `Page N title`, `Story claim`, and `Evidence`. Titles should be claim-led, not topic labels.
4. **Choose the layout pattern**: pick one per page, such as `hero + rail`, `matrix-first`, `chart-led`, `figure-led`, `bridge figure`, `timeline/roadmap`, `swimlane`, or `native table`.
5. **Specify the primary visual object**: name the visual and its minimum data contract. Matrices need axes/quadrants/items; charts need categories + values or numeric steps; diagrams need layers/steps/labels.
6. **Apply a visual budget**: each page should usually carry 1-3 evidence facts, 4-8 required visual labels, and at most one supporting rail. Required labels are a shortlist, not an inventory of everything from the source.
7. **Add visual style only after structure is clear**: specify palette, line weight, density, rail placement, spacing, and a few high-risk anti-patterns.

Do not leave the model to infer the page architecture from raw prose. A weak plan like “page 1 thesis, page 2 drivers, page 3 risks” is not enough; make the page-level decisions before opening Studio.

Read `references/prompt-shaping.md` when you need examples of compact Studio prompts.

## Compact prompt skeleton

Use this shape by default. Keep it short and concrete:

```text
Create a [page count]-page [language/style/domain] deck.

Observed facts:
- ...

Page plan:
Page 1 title: [claim-led title]
Story claim: [one sentence]
Evidence: [source-backed facts only]
Layout / structure cue: [layout pattern]
Primary visual object: [one dominant visual with its minimum data contract]
Required labels: [4-8 labels that must appear]
Visual style: [palette, rules, spacing, density, rail/caption posture]
Must not become: [high-risk wrong interpretations]

Source constraint:
Use only the observed facts above.
```

For multi-page decks, repeat only the page block. Do not add long model instructions, process narration, or engineering context.

## Do not repeat Studio internals

The Studio backend already injects page mission, visual thinking, semantic object boundaries, evidence constraints, HTML output rules, and selection/export anchors.

Do **not** put these into the Studio prompt:

- `data-export-*`, `data-studio-object-id`, `renderTarget`, `ownershipScope`, compiler fields, or iframe metadata
- instructions like `1600x900`, `inline styles`, `one section`, `no markdown fence`, or `output raw HTML`
- agent execution notes like `generation-quality test`, `do not test PPTX export`, `bridge flow`, or `openUrl`
- long explanations of how the AI should think; give the final page blueprint instead

## Visual quality rule

The current Studio engine needs both a **content contract** and a **visual contract**.

- The content contract keeps the page factual and logically structured.
- The visual contract decides whether the page feels designed or generic.
- The preflight-aware budget decides whether that ambition survives without collapsing into overflow or clutter.

Default rule: each page should have **one visual thesis**.

That usually means:

- one dominant visual or structural idea
- quiet secondary text
- restrained annotation
- strong hierarchy
- not many equal-weight cards competing for attention

Prefer:

- `single dominant visual`
- `figure-led`
- `chart-led`
- `matrix-first`
- `timeline-led`
- `hero + rail`

Avoid:

- equal-weight card walls
- generic dashboard clutter
- "beautiful" or "premium" with no structural cue
- asking one page to carry several unrelated visual ideas
- incompatible layout language such as `matrix-first 4-column grid`, `waterfall chart without values`, or `chart-led page` with no chart data
- long `Required labels` lists that force the model to pack the whole source onto one page
- scientific or technical-system diagrams in business / finance decks unless the user explicitly asks for scientific, technical, architecture, or system-detail visuals

Read `references/visual-briefing.md` when you need the visual prompting rules, `references/data-story-patterns.md` when you need to map source material to an archetype, `references/premium-visual-cues.md` for effective visual language, and `references/preflight-aware-visual-budget.md` when you need to keep ambition inside the engine's fit limits.

## Semantic object rule

Use this as a private thinking frame before writing the prompt:

`page story -> primary visual object -> object kind -> data contract -> render target intent -> forbidden interpretation`

Do not paste the chain or internal field names. Translate it into natural language that describes the intended page.

Good examples:

- `Primary visual object: one operating-model diagram with three labeled layers.`
- `Primary visual object: one qualitative ranked bar figure; use labels only because no paired values were supplied.`
- `Primary visual object: one 2x2 matrix-first figure with axes Customer impact and Automation confidence.`
- `Primary visual object: one bar chart with categories Ads, Games, Cloud and values 10, 20, 30.`
- `Primary visual object: one native table with rows and columns from the source table.`

Use these object semantics:

- `diagram`: operating model, workflow, bridge figure, roadmap, timeline, architecture, stacked layers, conceptual figure.
- `chart-led figure`: chart-like visual without paired data; still write it as an editable figure or diagram.
- `chart`: only when a chart family and reliable data contract are both explicit, such as `categories + values`, `data: label value`, or `numeric steps`.
- `matrix`: 2x2, quadrant, BCG, impact/effort, customer impact/confidence. It must have spatial axes. It is not a native table.
- `native table`: only for true rows and columns, benchmark tables, data tables, or source tables.
- `comparison-grid`, `metric-grid`, and `card-grid`: aligned visual structures, not native tables.

Key boundaries:

- A 4-column engine comparison is a `comparison-grid`, not `matrix-first`.
- `three stacked layers` and `operating-model layers` mean `diagram`, not chart.
- `waterfall-style visual`, `bridge figure`, and `margin bridge` without structured steps mean `diagram`.
- `ranked bar chart comparing A/B/C` without paired values means qualitative ranked figure, not chart data.
- `bar/line/stacked/waterfall chart with categories + values`, `data: label value`, or `numeric steps` means chart.
- Evidence numbers do not become chart data unless they are explicitly bound to chart categories or steps.
- Screenshot/reference recreation should describe composition, regions, axes, point placement, palette, and labels. Do not include test procedure or export notes.
- In business / finance decks, `AI`, `technology capability`, and `cloud` usually still mean business-model or investment exhibits. Do not ask for scientific, neural-network, lab, or technical architecture visuals unless the user explicitly wants that.

Read `references/semantic-object-rules.md` when chart/table/matrix/diagram boundaries matter.

## Special visual modes

Use these only when the user explicitly asks for the mode or the source/reference clearly requires it.

- **Flowchart / swimlane**: use for process maps, role-by-stage workflows, decision flows, and swimlanes. Specify lanes, phases, nodes, decision labels, and connector direction. Keep using natural layout language such as `swimlane flowchart`, `phase bands`, `lane headers`, and `orthogonal connectors`.
- **3D / hero model**: use only for explicit requests such as `3D`, `three-dimensional`, `cutaway`, `exploded view`, `hero model`, `三维`, `立体`, `剖面`, or `爆炸图`. Do not convert ordinary `stacked layers`, `platform layers`, or `operating-model layers` into 3D unless the user asks.
- **Animated HTML**: use only when the user wants motion or an animated preview. Select the Animated HTML output mode or pass `htmlOutputMode: "animated-preview-js"` through the bridge/API. In the Studio prompt, describe the desired motion in audience terms, such as `headline enters first, matrix points reveal by quadrant`; do not write `data-anim-*` attributes or animation manifest JSON.

## Structured flowchart and swimlane rule

When the user asks for a process flow, swimlane, consulting workflow, project plan with many steps, or a reference image that is visibly a flowchart:

- Think in a 2D diagram model before writing the Studio prompt.
- Treat the x-axis as lanes, owners, or workstreams such as `客户`, `项目小组`, `专家委员会`, `埃森克咨询`.
- Treat the y-axis as phases or stage bands such as `现状诊断`, `方案设计`, `辅导实施`, `长期服务`.
- Assign every node to an x-axis lane and y-axis phase before describing connectors.
- Preserve the user's labels verbatim; do not invent missing process content.
- Use explicit structure cues: `swimlane flowchart`, `process diagram`, `流程图`, `泳道`, `lane headers`, `phase bands`, `numbered nodes`, `decision diamonds`, `orthogonal connectors`.
- Include lane headers, phase bands, all numbered nodes, decision-node labels, and any known arrow chains in the prompt.
- Avoid vague `roadmap` wording unless the target is truly a Gantt/timeline with time buckets.

Visual thesis: the page should read like a role-by-stage operating map, not a hero page, card wall, or prose summary.

## Meaningful prompt inputs

The current engine responds well to:

- explicit page count
- per-page storylines with exact page roles, claims, evidence, layout, and primary visual
- each page having a clear role
- one main claim per page
- structure cues like `chart`, `matrix`, `quadrant`, `figure`, `timeline`, `swimlane flowchart`, `phase bands`, `lane headers`
- explicit object semantics such as `editable diagram`, `qualitative ranked figure`, `real chart with categories + values`, `matrix not table`, or `native table with rows and columns`
- one visual thesis per page
- language and density posture
- a clear instruction to stay inside the observed source facts
- explicit anti-patterns like `not equal-weight cards` or `not dashboard clutter`

The current engine does **not** benefit much from:

- pasting the full article or PDF
- vague page plans that leave the model to invent each page's story, chart, and layout
- repeating that the result should be editable
- repeating iframe/export/tooling details
- engineering metadata or field names such as `data-export-*`, `iframe metadata`, `compiler`, `renderTarget`, or `ownershipScope`
- vague quality adjectives like `premium`, `top-tier`, `more advanced`
- putting the AI's own operating steps into the brief

## Review and preflight reality

The backend already handles HTML output rules, prompt-leak guardrails, and selection/export anchors. The calling agent mainly needs to reduce pressure before generation:

- keep page titles short and claim-led
- avoid asking one page to carry too many facts
- choose one dominant object per page
- keep support copy subordinate
- specify high-risk wrong interpretations only when they matter

Read `references/preflight-aware-visual-budget.md` when you need the current budget logic.

## Product-intro default behavior

When the user says something like “做个 PPT 来介绍我的产品” without more detail:

- assume they mean the product represented by the current repo
- infer the product story from `README.md` and, if needed, `docs/agent-playbook.md`
- keep it concrete and product-led
- default to one clear product claim, one workflow strip, and a few differentiated proof points
- do not invent customers, traction, or fake metrics

## Default browser policy

- Use the user's **real default browser profile**, not a temporary browser and not a Playwright ephemeral profile.
- The goal is to preserve browser/project cache and let the human keep working in the same browser state.
- If default-browser automation is not available, say so plainly and stop. Do not silently fall back to a temporary browser.

## Stop-early policy

Once generation has been triggered through the UI:

- do not keep waiting
- do not burn tokens watching review finish
- do not continue into iframe manipulation by default

With the bridge path, opening the exact returned `openUrl` is enough for Studio to start generation. The human is expected to take over from the browser after the launch URL is opened.

Be precise here:

- `POST /api/studio/bridge/launch` only creates the task
- opening the exact returned `openUrl` is what consumes it
- opening the root Studio page does not consume the task

## No-testing policy

Do **not** run typecheck, Playwright, stability tests, or other full validation by default.

Allowed minimal smoke only:

- `GET /api/health`
- `pnpm dev` when needed
- confirming that the source page or Studio page opened
- confirming that the generation request was sent

## Headless API path

Only use API-first when the user explicitly wants headless generation or another agent truly needs HTTP-only behavior.

Even then:

- there is no `ingest-sources` endpoint
- you must read the URL/PDF yourself first
- then call `POST /api/studio/generate-html` or `POST /api/studio/generate-html/stream` with the synthesized brief

## References

- Read `README.md` in the workspace for product positioning.
- Read `docs/agent-playbook.md` only when you need deeper Studio generation/review context.
- Read `references/prompt-shaping.md` for the compact source-to-Studio prompt skeleton.
- Read `references/default-browser-flow.md` for the exact browser-first workflow and stop point.
- Read `references/visual-briefing.md` for the visual contract.
- Read `references/semantic-object-rules.md` for chart/table/matrix/diagram semantic boundaries.
- Read `references/data-story-patterns.md` for content-to-layout mapping.
- Read `references/premium-visual-cues.md` for effective visual phrasing.
- Read `references/preflight-aware-visual-budget.md` for fit-aware visual budgeting.
