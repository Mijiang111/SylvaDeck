# Prompt Shaping

Use this reference when you need to turn a URL, PDF, or rough brief into a prompt that works well with the current Studio engine.

The local prompt bridge only transports the prompt into Studio. It does not read the source for you, so the quality of the prompt still depends on what you extracted yourself.

## The engine wants structure and visual intent, not source dumps

The engine works better when the prompt already contains:

- a fixed page count
- a role for each page
- one main claim per page
- a clear layout cue
- one visual thesis per page
- a density posture
- a source constraint
- a few explicit anti-patterns

It works worse when you paste large raw source blobs and ask for “something polished.”

## Use this 7-part contract

Write the prompt in this order:

### 1. Observed facts

List only the facts that matter.

- event or product name
- the strongest numbers, dates, actors, outcomes
- the 3-6 facts that deserve to survive into slides

Keep this section compressed. This is not a transcript.

### 2. Page plan

Tell Studio what each page is for.

Good examples:

- `Page 1: what happened and the core takeaway`
- `Page 2: evidence and timeline`
- `Page 3: implications, risks, and what to watch next`

If the deck is one page, still define the role:

- `One page only: headline, one dominant figure, and three short proof points`

### 3. Layout / structure cue

Tell the engine what kind of composition to prefer.

Useful cues:

- `chart`
- `matrix`
- `quadrant`
- `timeline`
- `figure`
- `comparison`
- `single dominant visual`

These cues are more useful than generic “make it beautiful.”

### 4. Visual thesis

State the page's visual center explicitly.

Useful examples:

- `Page 2 should be one dominant evidence layout with one highlighted inflection point.`
- `Use a figure-led method page, not several same-weight cards.`
- `Turn the article into one premium timeline with sparse callouts.`
- `Make the page feel publication-like, with one chart doing most of the visual work.`

If you skip this section, the engine is more likely to fall back to generic card grouping.

### 5. Tone + density

Be explicit about reading posture.

Useful examples:

- `Keep each page low-density and presentation-ready.`
- `Use concise Chinese copy with one claim per page.`
- `Keep this in a paper-white academic style.`
- `Avoid executive-summary memo language.`

### 6. Anti-patterns

Say what the page should not become.

Useful examples:

- `Do not use equal-weight cards across the page.`
- `Do not turn the article into a dashboard.`
- `Avoid generic icon rows and decorative clutter.`
- `Do not replace the main chart with bullet blocks.`

This is often what preserves visual quality.

### 7. Source constraint

When working from a link or PDF, add a hard grounding line:

- `Use only facts that can be supported by the source page I read.`
- `Do not invent metrics, quotes, customer names, or background claims.`

## What actually helps visual quality

These inputs often improve visual results:

- `one dominant visual per page`
- `figure-led` / `chart-led` / `matrix-first`
- `quiet secondary text`
- `restrained annotation`
- `high signal, low chrome`
- `not equal-weight cards`
- `not dashboard clutter`

These inputs usually do not help much:

- `make it more premium`
- `more top-tier`
- `make it more advanced`
- `editable iframe HTML exportable`

The engine responds better to structure and constraints than to generic adjectives.

## What actually helps preflight and review

Preflight and review are not judging “vibes.” They mainly care about:

- `overflowX`
- `overflowY`
- title `promptLeak`
- title `truncated`
- title `repeatedInstruction`

Pure semantic density is only a `soft-warning`.

So the prompt should reduce layout pressure before generation:

- do not overpack facts
- do not ask one page to carry five ideas
- do not ask for long titles
- do not ask for several equal-weight charts on a tiny page
- prefer one dominant figure with compact annotation over many peers

## Avoid these patterns

These prompt habits are mostly waste:

- pasting the whole article or PDF text
- repeating `editable`, `iframe`, `export`, `HTML`, `debuggable`
- vague upgrades like `more professional`, `more advanced`, `more top-tier`
- telling the model how the agent should click buttons
- mixing user intent with process instructions

## Example: URL news brief

Bad:

```text
Use this BBC article and make a very professional editable iframe deck. It should be advanced, premium, and maybe exportable. Here is the full article text: ...
```

Better:

```text
Create a 3-page Chinese news briefing deck based only on the facts from the BBC page I just read.

Observed facts:
- [3-6 short fact bullets]

Page plan:
- Page 1: what happened and the core takeaway
- Page 2: the most important developments, numbers, and timeline
- Page 3: implications, risk, and what to watch next

Layout / structure cue:
- Use a timeline or evidence-led layout, not equal-weight cards everywhere

Visual thesis:
- Page 2 should be one dominant timeline with one highlighted turn in the story

Tone + density:
- Keep each page concise, presentation-ready, and low-density

Anti-patterns:
- Do not turn this into a dashboard or a wall of cards

Source constraint:
- Use only facts that are supported by the page I read; do not invent context
```

## Example: product intro

```text
Create a 1-page Chinese product intro deck for this repo.

Observed facts:
- It is a local-first Studio for generating editable 16:9 HTML presentation pages
- It includes generation, review/repair, iframe editing, and export
- The key product idea is that generated HTML stays editable instead of becoming a screenshot artifact

Page plan:
- One page only: one core product claim, one workflow strip, three differentiation points

Layout / structure cue:
- Use a hero + workflow strip layout

Visual thesis:
- One dominant product-intro hero should anchor the page, with one compact process strip underneath

Tone + density:
- Keep it concrete, product-led, and low-density

Anti-patterns:
- Do not use equal-weight cards across the page
- Do not make it look like a feature dashboard

Source constraint:
- Do not invent customer logos, adoption metrics, or business traction
```

## Example: research figure

```text
Create a 3-page scientific presentation on a reranking experiment.

Observed facts:
- [3-6 short fact bullets]

Page plan:
- Page 1: research question and setup
- Page 2: one method-and-result figure page
- Page 3: interpretation and next work

Layout / structure cue:
- Prefer research-figure-stage on the middle page

Visual thesis:
- Page 2 should be one publication-like figure with compact method labels and sparse annotation

Tone + density:
- Keep it paper-white, restrained, and conference-readout style

Anti-patterns:
- Do not use consulting-style recommendation cards
- Do not split the figure page into equal-weight panels

Source constraint:
- Keep all claims bounded to the experiment described in the source
```

## Example: data analysis page

```text
Create a 1-page analysis slide on the article I read.

Observed facts:
- [3-6 short fact bullets]

Page plan:
- One page only: one core analytical claim, one main chart, and two short supporting observations

Layout / structure cue:
- Prefer chart-insight with one dominant chart

Visual thesis:
- The chart should do most of the visual work, with only sparse callouts around it

Tone + density:
- Keep the page editorial, low-density, and presentation-ready

Anti-patterns:
- Do not turn the page into a dashboard
- Do not replace the chart with bullet blocks

Source constraint:
- Use only the source-backed numbers and relationships I observed
```
