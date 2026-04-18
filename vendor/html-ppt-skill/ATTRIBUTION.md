## html-ppt-skill starter-pack snapshot

This directory contains a curated, read-only subset vendored from:

- Repository: `https://github.com/lewislulu/html-ppt-skill`
- Upstream commit: `376dfe5e777c2bce28a7368a8355212451a3e33b`
- License: MIT, preserved in [LICENSE](./LICENSE)

Included in this Studio v1 snapshot:

- Themes: `corporate-clean`, `swiss-grid`, `editorial-serif`, `academic-paper`, `blueprint`, `tokyo-night`, `xiaohongshu-white`, `cyberpunk-neon`
- Single-page starters: `cover`, `section-divider`, `bullets`, `two-column`, `comparison`, `timeline`, `arch-diagram`, `chart-bar`
- Full-deck starters: `pitch-deck`, `tech-sharing`, `product-launch`, `weekly-report`
- Shared assets: `base.css`, `fonts.css`, `animations.css`, `runtime.js`

Studio integration notes:

- These files are vendored as upstream design resources only.
- They are not the primary Studio authoring/runtime contract.
- `runtime.js` is kept only so the read-only upstream starter snapshots can open locally; it is not wired into Studio's formal deck runtime.
- `fx-runtime.js` and canvas FX assets are intentionally excluded from this snapshot.
- The `chart-bar` starter retains upstream Chart.js preview markup for reference, but Studio does not execute this starter as part of its export/runtime pipeline.
