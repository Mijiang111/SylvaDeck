# Semantic Object Rules

Use this reference when a Studio prompt needs to distinguish diagrams, chart-like figures, real charts, matrices, tables, and aligned grids.

The goal is to help the calling agent write clearer natural-language prompts. Do not ask the page model to write export metadata, iframe metadata, compiler fields, or internal attribute names.

## Private Thinking Frame

Before writing the prompt, decide:

`page story -> primary visual object -> object kind -> minimum data contract -> forbidden interpretation`

Keep this chain private. The Studio prompt should describe the page, not Studio internals.

Good prompt language:

- `Primary visual object: one operating-model diagram with three labeled layers.`
- `Primary visual object: one qualitative ranked figure; use labels only because no paired values were supplied.`
- `Primary visual object: one 2x2 matrix-first figure with axes Customer impact and Automation confidence.`
- `Primary visual object: one line chart with categories 2024, 2026 and values 9, 3.`

Bad prompt language:

- `Add data-export-object-kind, renderTarget, ownershipScope, and compiler metadata.`
- `Write iframe metadata so export can find the chart.`
- `Output raw 1600x900 HTML with one section.`

Those are backend concerns, not source-to-prompt instructions.

## Object Kinds

### Diagram

Use for operating models, workflows, process maps, bridge figures, roadmaps, timelines, architecture diagrams, stacked layers, and conceptual figures.

Minimum contract:

- named layers, steps, phases, lanes, or components
- required labels
- relationship direction if there are arrows or flows

Prompt language:

- `operating-model diagram`
- `bridge figure`
- `workflow figure`
- `roadmap diagram`
- `stacked layer figure`

Common forbidden interpretations:

- native table
- native chart unless explicit chart data exists
- generic card wall

### Chart-Led Figure

Use when the visual should look chart-like but the source does not provide paired data.

Examples:

- ranked bar figure comparing journeys, with labels but no values
- qualitative pressure ranking
- bridge explanation with directional steps but no numeric deltas

Minimum contract:

- ordered labels or relative positions
- clear note that no numeric values should be invented

Prompt language:

- `qualitative ranked figure`
- `chart-like figure with labels only`
- `relative priority figure, not a data chart`

Do not turn evidence numbers into chart data unless they are explicitly bound to chart categories or steps.

### Chart

Use only when both conditions are true:

- the family is explicit, such as bar, line, stacked, combo, waterfall, or bubble
- the data contract is explicit and reliable

Acceptable data wording:

- `categories: Ads, Games, Cloud; values: 10, 20, 30`
- `data: onboarding 40, servicing 30, disputes 20, collections 10`
- `numeric steps: start 62, demand deflection -3, workflow automation -4, end 55`
- `bubble points: label, x, y, size`

Insufficient data wording:

- `ranked bar chart comparing onboarding, servicing, disputes, collections`
- `bar chart with evidence 48% digital and 18% straight-through`
- `waterfall-style visual without values`

### Matrix

Use for 2x2, quadrant, BCG, impact/effort, customer impact/confidence, certainty/importance, or other spatial decision frames.

Minimum contract:

- x-axis label
- y-axis label
- quadrant labels when available
- items/points to place in the field
- optional side rail or implication note

Prompt language:

- `matrix-first 2x2 figure`
- `quadrant decision field`
- `spatial positioning matrix`
- `strategic map with plotted items`

Forbidden interpretations:

- native table
- spreadsheet
- equal cards
- dashboard

Do not use `matrix-first` for simple column comparisons. A four-engine business model comparison should be a `comparison grid`, not a matrix, unless it has real x/y axes and spatial positioning.

### Native Table

Use only for real rows and columns, source tables, benchmark tables, data tables, or financial tables with explicit row/column structure.

Minimum contract:

- column headers
- row labels
- cell values or row descriptions

Prompt language:

- `native table with rows and columns`
- `benchmark table`
- `source table with clear headers`

Do not call a matrix, comparison grid, metric grid, or card grid a native table just because it is aligned.

### Comparison, Metric, And Card Grids

Use for visual grouping, scorecards, proof blocks, option comparisons, or metric clusters.

These are layout structures, not native tables. Say `comparison grid`, `metric grid`, or `proof grid` when you want alignment without table semantics.

For business-model explainers, `comparison grid` is the right language for side-by-side engines such as Games, Advertising, FinTech, and AI Cloud. It should read as an analytical business exhibit, not a scientific system diagram.

## Boundary Rules

Use **diagram**:

- `three stacked layers showing demand migration, workflow automation, and control layer`
- `operating-model layers`
- `bridge figure from current 62% cost-to-income toward target range`
- `waterfall-style visual without values`
- `roadmap with three phases`

Use **chart-led figure**:

- `ranked bar chart comparing onboarding, servicing, disputes, collections` with no values
- `relative cost pressure by journey` with only labels
- `qualitative ranking of priorities`

Use **chart**:

- `stacked bar chart with categories Ads, Games, Cloud; values: 10, 20, 30`
- `line chart with categories 2024, 2026; values 9, 3`
- `waterfall chart with numeric steps: start 62, demand deflection -3, workflow automation -4, end 55`
- `bar chart with data: onboarding 40, servicing 30, disputes 20, collections 10`

Use **matrix**:

- `2x2 matrix with axes Customer impact and Automation confidence`
- `BCG matrix`
- `investment upside vs visibility map`
- `impact/effort quadrant`

Use **comparison grid**:

- `4-column comparison grid comparing Games, Advertising, FinTech, and AI Cloud by monetization mechanism and shared asset`
- `business-model engine grid`
- `proof grid comparing four levers`

Use **native table**:

- `table with columns Metric, 2025, 2026 and rows Revenue, Margin, Cost`
- `benchmark table comparing companies by revenue, margin, and growth`

## Screenshot Or Reference Recreation

When the user wants to recreate a screenshot or reference page, describe the visible composition instead of giving test procedure.

Include:

- page count and language
- title hierarchy
- major regions and approximate proportions
- primary visual object
- axes, quadrants, labels, point placement, and rail/caption text
- palette, line style, background, spacing, and density
- the few things it must not become

Do not include:

- `generation-quality test`
- `do not test PPTX export`
- bridge/openUrl/browser instructions
- internal metadata or HTML output rules

## Business AI Visuals

In business, finance, and consulting decks, `AI`, `technology capability`, `cloud`, and `platform` usually still mean business-model or investment exhibits.

Use:

- flywheel
- value chain
- monetization bridge
- opportunity/risk strip
- driver bar with rail
- business-model engine grid

Avoid unless explicitly requested:

- scientific diagram
- neural-network illustration
- lab-style architecture diagram
- technical system topology
- circuit-board or model-stack visual

## Prompt Pattern

For each page, write:

```text
Page N title: [claim-led title]
Story claim: [one sentence]
Evidence: [only supplied facts]
Layout / structure cue: [hero + rail, matrix-first, chart-led, figure-led, bridge figure, timeline-led, swimlane, native table]
Primary visual object: [semantic object in natural language plus minimum data contract]
Required labels: [labels that must appear]
Visual style: [palette, line, spacing, density, rail/caption posture]
Must not become: [forbidden interpretation]
```

Good:

```text
Primary visual object: one operating-model diagram with three stacked layers: demand migration, workflow automation, control layer.
Must not become: native table, native chart, icon row, or four equal cards.
```

Good:

```text
Primary visual object: one qualitative ranked figure comparing onboarding, servicing, disputes, and collections. Use labels only because no paired values were supplied.
Must not become: fake numeric chart or dashboard with several mini charts.
```

Good:

```text
Primary visual object: one waterfall chart with numeric steps: start 62, demand deflection -3, workflow automation -4, end 55.
Must not become: dense finance table.
```
