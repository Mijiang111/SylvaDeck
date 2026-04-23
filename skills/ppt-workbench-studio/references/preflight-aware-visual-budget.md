# Preflight-Aware Visual Budget

Use this reference when you want a page to look more ambitious without pushing it into the engine's failure modes.

## What the review loop really checks

The current review logic mainly cares about:

- `overflowX`
- `overflowY`
- title `promptLeak`
- title `truncated`
- title `repeatedInstruction`

Pure semantic density by itself is only a `soft-warning`.

This means visual ambition is fine, but it still needs a stable fit budget.

## Core rule

Prefer:

- one dominant object
- short titles
- compact labels
- sparse annotation
- one clear reading path

Avoid:

- several equal-weight visuals
- long titles
- several side rails with dense copy
- a chart plus many independent callout blocks

## Why this matters

Pages usually break when they ask the engine to carry too much visible information at once.

The most common causes are:

- too many ideas on one page
- too many same-weight objects
- annotation that is longer than the visual it supports
- long headings trying to carry the whole story

## Visual strategies that are usually stable

These are usually safer:

- one main chart + two short callouts
- one matrix + short labels
- one figure-led page + compact caption
- one hero claim + one evidence rail
- one timeline + two or three milestones

These are riskier:

- three charts with equal emphasis
- one chart plus multiple heavy sidebars
- many medium cards all trying to explain the same page
- long title plus long close plus several body paragraphs

## Copy budget direction

Use the existing page archetype budgets as the mental model:

- `hero-rail` and `priority-rail` want concise support copy, not memo paragraphs
- `chart-insight` wants the chart to stay dominant; callouts should stay short
- `research-figure-stage` wants a restrained central figure with compact labels and notes
- `verdict-comparison` wants contrast and resolution, not a giant symmetric grid

You do not need to quote the budget numbers in the prompt, but you should write as if the page has a tight visual budget.

## Practical prompt moves

Good:

- `Keep the middle page chart-led with sparse callouts only.`
- `Use one dominant figure with compact labels and a short caption.`
- `Do not ask the page to carry several equal-weight panels.`
- `Keep the title short and let the visual do the explanatory work.`

Bad:

- `Include every key fact from the article on one page.`
- `Add multiple charts so the slide looks sophisticated.`
- `Use long annotation blocks to explain the visual.`

## One useful default

When uncertain, reduce visual complexity by one step:

- from many charts -> one chart
- from many cards -> one dominant object + one support rail
- from long labels -> short labels + caption

This usually improves both visual quality and fit stability.
