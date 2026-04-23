# Default Browser Flow

Use this reference when the goal is to generate through Studio and hand the browser state to a human.

## Core rule

Use the user's **default browser** and the user's **real browser profile**.

Do not use:

- a temporary browser
- a Playwright ephemeral profile
- a hidden automation-only browser as the default path

If default-browser automation is unavailable, say so clearly and stop.

## Workflow

### 1. Check service

Minimal smoke only:

```bash
curl http://127.0.0.1:3101/api/health
```

If needed:

```bash
pnpm dev
```

### 2. Read the source first

If the user supplied a link:

- open the link in the default browser
- read it there
- synthesize the prompt

Do not open Studio first and do not rely on product-side ingest.

### 3. Open Studio in the same browser

Create a launch task first:

```bash
curl -X POST http://127.0.0.1:3101/api/studio/bridge/launch \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "Create a 3-page deck...",
    "mode": "inject-and-generate"
  }'
```

Then parse the returned `openUrl` and open that exact URL in the **same default browser profile** so project/browser state persists.

Example:

```bash
open 'http://127.0.0.1:5174/?bridgeLaunch=<launch-id>'
```

Opening `http://127.0.0.1:5174/` alone is not enough.

### 4. Let Studio consume the launch

Do not try to type into the UI.

The exact returned launch URL makes Studio:

- consume the prompt payload
- create a local project in browser storage
- auto-start generation

## Stop point

Stop as soon as the bridge launch URL has been opened.

That means:

- do not wait for `/projects/:id/edit`
- do not wait for `studio-editor-ready`
- do not wait for review to settle
- do not continue into iframe manipulation

The human takes over from there.
