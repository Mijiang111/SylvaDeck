---
name: ppt-workbench-studio
description: Use when working inside the ppt-workbench-studio repo, or when the user asks to use their Studio/plugin workflow to generate a deck in the browser editor. Default to reading source links first, then using the user's default browser to open Studio UI, trigger generation, and stop once the request is sent. Use API-first only for true headless generation. Do not use temporary browser profiles.
---

# PPT Workbench Studio

Use this skill when the current workspace is `ppt-workbench-studio`, or when the user explicitly wants to use their own Studio/plugin workflow instead of hand-authoring an external slide deck.

## What exists now

- **Prompt injection bridge**: `POST /api/studio/bridge/launch` creates a short-lived launch task and returns an `openUrl`.
- **UI handoff path**: opening that `openUrl` in the user's default browser makes Studio consume the task, create a local project, and auto-start generation.
- **Headless fallback**: `/api/studio/generate-html` and `/api/studio/generate-html/stream` still exist for true headless use.

Because of that, URL or PDF tasks must be handled as:

1. the agent reads the source itself
2. the agent writes a good Studio prompt
3. the agent posts that prompt to the local bridge
4. the agent opens the returned `openUrl` in the default browser

Do not treat URLs or PDFs as product-side attachments. The bridge is **prompt-only**, not source-grounded.

## Default path

Use this path by default whenever the goal is to generate in Studio and hand the result to a human:

1. Open the source link in the **user's default browser**.
2. Read the source and extract the facts, structure, and likely page split.
3. Build a concise Studio-ready prompt.
4. `POST` the prompt to `/api/studio/bridge/launch`.
5. In the **same default browser profile**, open the returned `openUrl`.
6. Stop as soon as the browser has opened the launch URL.

Do **not** keep waiting for `/projects/:id/edit`, review settle, or iframe readiness unless the user explicitly asks.

Read `references/default-browser-flow.md` only when you need the exact stop point and browser expectations.

## Source reading rule

If the user gives you a URL or PDF:

- read it first
- decide what matters
- synthesize the prompt yourself
- then use Studio

Do not dump the full article or PDF text into the prompt. The current engine responds better to structure than to raw volume.

## Prompt contract

Shape prompts around these five pieces:

- `Observed facts`
- `Page plan`
- `Layout/structure cue`
- `Tone + density`
- `Source constraint`

Read `references/prompt-shaping.md` when you need the detailed rules for what helps the engine and what only adds noise.

## Meaningful prompt inputs

The current engine responds well to:

- explicit page count
- each page having a clear role
- one main claim per page
- structure cues like `chart`, `matrix`, `quadrant`, `figure`, `timeline`
- language and density posture
- a clear instruction to stay inside the observed source facts

The current engine does **not** benefit much from:

- pasting the full article or PDF
- repeating that the result should be editable
- repeating iframe/export/tooling details
- vague quality adjectives like “more premium” or “more top-tier”
- putting the AI's own operating steps into the brief

## Review and preflight reality

The review loop mainly cares about:

- `overflowX`
- `overflowY`
- title `promptLeak`
- title `truncated`
- title `repeatedInstruction`

Pure semantic density by itself is only a `soft-warning`, not a hard repair trigger.

That means the best prompt is one that gives the model a clean page split and reasonable density budget up front.

## Product-intro default behavior

When the user says something like “做个 PPT 来介绍我的产品” without more detail:

- assume they mean the product represented by the current repo
- infer the product story from `README.md` and, if needed, `docs/agent-playbook.md`
- keep it concrete and product-led
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

With the bridge path, opening `openUrl` is enough for Studio to start generation. The human is expected to take over from the browser after the launch URL is opened.

## No-testing policy

Do **not** run typecheck, Playwright, stability tests, or other full validation by default.

Allowed minimal smoke only:

- `GET /api/health`
- `pnpm dev` when needed
- confirming that the source page or Studio page opened
- confirming that the generation request was sent

## Headless fallback

Only use API-first when the user explicitly wants headless generation or another agent truly needs HTTP-only behavior.

Even then:

- there is no `ingest-sources` endpoint
- you must read the URL/PDF yourself first
- then call `POST /api/studio/generate-html` or `POST /api/studio/generate-html/stream` with the synthesized brief

## References

- Read `README.md` in the workspace for product positioning.
- Read `docs/agent-playbook.md` only when you need deeper Studio generation/review context.
- Read `references/prompt-shaping.md` for the effective prompt contract.
- Read `references/default-browser-flow.md` for the exact browser-first workflow and stop point.
