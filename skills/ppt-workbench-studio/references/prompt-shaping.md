# Prompt Shaping

Use this reference when you need to turn a URL, PDF, screenshot, or rough brief into a Studio prompt.

Studio does not read the source for you through the bridge. The calling agent must read the source, decide the page story, and pass Studio a compact blueprint.

## Translation Workflow

Think in this order before writing the prompt:

1. **Extract facts**: keep 6-12 observed facts, not the full source.
2. **Choose page count**: 1 page for one exhibit or screenshot recreation; 3-5 pages for normal analysis; more only when the source has distinct sections.
3. **Write page stories**: every page needs a claim-led title, a one-sentence story claim, and source-backed evidence.
4. **Choose layout patterns**: pick a pattern such as `hero + rail`, `matrix-first`, `chart-led`, `figure-led`, `bridge figure`, `timeline/roadmap`, `swimlane`, or `native table`.
5. **Specify the primary visual**: name one dominant object and the minimum data contract it needs.
6. **Apply a visual budget**: use 1-3 evidence facts, 4-8 required labels, and at most one supporting rail per page.
7. **Add style last**: give palette, line style, spacing, density, rail/caption posture, and only the few anti-patterns that are likely to go wrong.

The prompt should be the result of this thinking, not a transcript of the thinking.

## Compact Prompt Skeleton

Use this default shape:

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

For multi-page decks, repeat the page block. Do not add long general instructions after every page.

## What The Backend Already Adds

Do not repeat Studio internals in the prompt. The renderer prompt already receives page mission, visual thinking, semantic object boundaries, evidence constraints, HTML output rules, and selection/export anchors.

Avoid these prompt habits:

- saying `data-export-*`, `data-studio-object-id`, `renderTarget`, `ownershipScope`, compiler, or iframe metadata
- saying `1600x900`, `inline styles`, `one section`, `no markdown fence`, or `output raw HTML`
- saying agent process notes such as `generation-quality test`, `do not test PPTX export`, `bridge flow`, or `openUrl`
- explaining how the model should reason instead of giving the final page blueprint
- pasting a full article or PDF dump
- asking for "premium", "top-tier", or "advanced" without a layout pattern

## What Actually Helps

Useful inputs:

- fixed page count
- one role and one claim per page
- a concrete layout pattern
- one dominant exhibit per page
- source-backed evidence and required labels
- a realistic density posture
- a few precise anti-patterns

Useful visual language:

- `research page`
- `dominant exhibit`
- `right-side conclusion rail`
- `thin rules`
- `muted palette`
- `editorial spacing`
- `source footer`
- `quiet secondary text`

These are stronger than broad adjectives like `beautiful` or `premium`.

## High-Risk Boundaries

Call these out when relevant:

- Matrix: include axes, quadrants, and items/points; say `matrix-first`; say it must not become a native table.
- Qualitative ranking: if there are no paired values, say `qualitative ranked figure`; do not turn evidence numbers into chart data.
- Chart: only call it a chart when categories + values, `data: label value`, or numeric steps are explicit.
- Bridge/waterfall: without numeric steps, say `bridge figure`, not waterfall chart.
- Screenshot recreation: describe composition, regions, proportions, axes, labels, point placement, palette, and text hierarchy. Do not include testing or export notes.
- Business AI pages: keep `AI`, `technology capability`, and `cloud` in a business-model or investment exhibit unless the user explicitly asks for scientific, technical architecture, neural-network, or lab-style visuals.
- Comparison grids: a 4-column engine comparison is a `comparison-grid`, not `matrix-first`.
- Required labels: list the labels that must appear, not every possible detail from the source.

## Example: Finance Matrix Recreation

```text
Create a 1-page Chinese equity-research slide.

Observed facts:
- Tesla Q1 2026 update frames upside around Robotaxi/FSD, 2026 production programs, AI training capacity, energy weakness, and current-quarter financial base.
- FSD/Robotaxi commercialization depends on approval and scaling.
- 2026 production programs include Cybercab, Semi, and Megapack 3.
- Cortex 1 exceeds 100k H100e; Cortex 2 early ramp exceeds 130k H100e.
- Energy revenue declined 12%.
- Current-quarter base includes revenue +16%, gross margin 21.1%, operating cash flow $3.9B, free cash flow $1.4B, cash and investments $44.7B.

Page plan:
Page 1 title: 未来12至24个月，Tesla 的上行主要由自动驾驶与新平台驱动，但兑现节奏仍取决于监管、执行与成本约束
Story claim: Upside is present, but the next return leg depends on high-elasticity businesses becoming visible enough to underwrite.
Evidence: Robotaxi/FSD, 2026 production programs, AI training capacity, energy weakness, and current-quarter financial base.
Layout / structure cue: matrix-first research page with one large 2x2 field and a narrow right-side investment conclusion rail.
Primary visual object: one 2x2 strategic map with y-axis 投资上行弹性 and x-axis 兑现可见度; plot Robotaxi 与 FSD 商业化, 2026 量产项目, AI 训练算力扩张, 能源业务, 当前季度财务底盘, 汽车主业运营.
Required labels: all quadrant headings, axis labels, plotted item names, 投资结论, and source footer.
Visual style: warm off-white background, thin beige rules, muted navy/ochre/oxblood/brown dots, editorial research spacing, large serif-like title hierarchy.
Must not become: native table, spreadsheet, dashboard, equal cards, product UI, or prompt scaffold.

Source constraint:
Use only the observed facts above.
```

## Example: Tencent Business AI Page

```text
Create a 4-page Chinese equity-research deck on Tencent.

Observed facts:
- Games revenue grows through evergreen titles and overseas contribution.
- Online Ads benefits from Video Accounts and AI-assisted targeting.
- FinTech and Business Services stabilize cash flow.
- Cloud is shifting toward quality growth.
- AI capability improves ad load, recommendation, game production, and cloud products.
- Key risks are regulation, AI capex intensity, game approvals, and macro ad demand.

Page plan:
Page 1 title: Tencent's upside is a business-model compounding case
Story claim: The investment case is driven by monetization surfaces rather than one technical breakthrough.
Evidence: Games, ads, fintech, cloud, and AI capability all reinforce monetization.
Layout / structure cue: hero + evidence rail.
Primary visual object: one investment thesis board.
Required labels: Games, Online Ads, FinTech, Cloud.
Visual style: equity research page, thin rules, direct labels, square-corner evidence surfaces.
Must not become: scientific diagram, neural-network map, cloud architecture, or equal cards.

Page 2 title: Four business engines explain the Tencent model
Story claim: Games, Online Ads, FinTech, and Cloud each carry a different growth and margin role.
Evidence: four named business engines.
Layout / structure cue: 4-column business engine comparison grid.
Primary visual object: one comparison grid with columns Games, Online Ads, FinTech, Cloud and shared rows for role, AI leverage, and monetization read.
Required labels: Games, Online Ads, FinTech, Cloud, role, AI leverage, monetization read.
Visual style: aligned business columns, no x/y axes, compact verdict rail.
Must not become: matrix-first, native table, or spreadsheet.

Page 3 title: Games and Online Ads carry the growth proof
Story claim: Growth quality is clearest where content and ad systems convert engagement into revenue.
Evidence: Games CAGR 8%; Online Ads CAGR 12%.
Layout / structure cue: chart-led business page.
Primary visual object: one bar chart with categories Games, Online Ads and values 8, 12.
Required labels: Games CAGR, Online Ads CAGR, Video Accounts, evergreen titles.
Visual style: business chart with insight rail and quiet secondary annotations.
Must not become: scientific method figure or technical system map.

Page 4 title: AI strengthens the moat but does not remove execution risk
Story claim: AI is best read as a monetization bridge with a risk strip.
Evidence: AI improves ads, recommendation, game production, and cloud products; risks are regulation, capex, approvals, and macro demand.
Layout / structure cue: business bridge figure + opportunity-risk strip.
Primary visual object: one bridge from AI capability to monetization surfaces, with a bottom risk strip.
Required labels: AI capability, ad targeting, recommendation, game production, cloud products, regulation, capex intensity, game approvals.
Visual style: business-model explainer, straight connectors, right-side takeaway, bottom risk strip.
Must not become: neural network, lab diagram, cloud architecture, or technical system map.

Source constraint:
Use only the observed facts above.
```

## Example: Consulting Analysis

```text
Create a 4-page Chinese consulting-style strategy deck.

Observed facts:
- Revenue growth slowed from 9% to 3%.
- Cost-to-income is 62%, above a 52-55% target range.
- 48% of service contacts are digital; 18% resolve without human escalation.
- Onboarding, servicing, disputes, and collections drive most cost pressure.
- AI automation could reduce selected back-office unit costs by 18-24% if workflow redesign and governance are in place.
- Customer-impacting AI requires human override, audit trails, and policy controls.

Page plan:
Page 1 title: The margin issue is unresolved digital work
Story claim: The bank has channel migration, but not enough straight-through resolution to reset cost.
Evidence: 48% digital contacts, 18% straight-through, 62% cost-to-income.
Layout / structure cue: hero + rail.
Primary visual object: one operating-model diagram with three layers: demand migration, workflow automation, control layer.
Required labels: 48% digital contacts, 18% straight-through, 62% cost-to-income.
Visual style: consulting research page, quiet secondary text, thin rules, restrained annotations.
Must not become: generic title slide, dashboard, icon row, or four equal cards.

Page 2 title: Four journeys concentrate the cost opportunity
Story claim: AI value should start where volume, rework, and manual judgment overlap.
Evidence: onboarding, servicing, disputes, collections.
Layout / structure cue: chart-led qualitative ranking.
Primary visual object: one qualitative ranked figure comparing onboarding, servicing, disputes, and collections; use labels only because no paired values were supplied.
Required labels: onboarding, servicing, disputes, collections, start where rework is highest.
Visual style: thin bars, sparse callouts, low chrome.
Must not become: fake numeric chart or dashboard.

Page 3 title: Governance needs two speeds
Story claim: Customer-impacting use cases need a different approval lane from assistive internal tools.
Evidence: human override, audit trails, and policy controls are required.
Layout / structure cue: matrix-first.
Primary visual object: one 2x2 matrix with axes Customer impact and Automation confidence.
Required labels: Fast-track assist, Controlled automation, Human-led, Do not automate yet.
Visual style: open field, direct quadrant labels, compact right-side implication.
Must not become: native table or spreadsheet.

Page 4 title: Unit-cost upside depends on workflow redesign first
Story claim: The 18-24% opportunity is unlocked by redesigned work, not model deployment alone.
Evidence: 18-24% unit-cost opportunity and 52-55% target range.
Layout / structure cue: bridge figure.
Primary visual object: one bridge figure moving from 62% cost-to-income toward the 52-55% target range.
Required labels: demand deflection, workflow automation, exception reduction, control investment.
Visual style: editorial bridge, thin connectors, compact notes.
Must not become: waterfall chart with invented values or dense finance table.

Source constraint:
Use only the observed facts above.
```
