# Prompt Shaping

Use this reference when you need to turn a URL, PDF, or rough brief into a prompt that works well with the current Studio engine.

The local prompt bridge only transports the prompt into Studio. It does not read the source for you, so the quality of the prompt still depends on what you extracted yourself.

## The engine wants structure, not source dumps

The engine works better when the prompt already contains:

- a fixed page count
- a role for each page
- one main claim per page
- a clear layout cue
- a density posture
- a constraint to stay inside the observed facts

It works worse when you paste large raw source blobs and ask for “something polished.”

## Use this contract

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

### 4. Tone + density

Be explicit about reading posture.

Useful examples:

- `Keep each page low-density and presentation-ready.`
- `Use concise Chinese copy with one claim per page.`
- `Keep this in a paper-white academic style.`
- `Avoid executive-summary memo language.`

### 5. Source constraint

When working from a link or PDF, add a hard grounding line:

- `Use only facts that can be supported by the source page I read.`
- `Do not invent metrics, quotes, customer names, or background claims.`

## What actually helps preflight and review

Preflight and review are not judging “vibes.” They mainly care about:

- `overflowX`
- `overflowY`
- title `promptLeak`
- title `truncated`
- title `repeatedInstruction`

Pure semantic density is only a `soft-warning`.

So the prompt should reduce layout pressure before generation:

- don’t overpack facts
- don’t ask one page to carry five ideas
- don’t ask for long titles
- don’t ask for several equal-weight charts on a tiny page

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
Create a 3-page Chinese news briefing deck based only on the facts from the BBC live page I just read.

Observed facts:
- [3-6 short fact bullets]

Page plan:
- Page 1: what happened and the core takeaway
- Page 2: the most important developments, numbers, and timeline
- Page 3: implications, risk, and what to watch next

Layout cue:
- Use one dominant timeline or evidence layout, not equal-weight cards everywhere

Tone + density:
- Keep each page concise, presentation-ready, and low-density

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

Layout cue:
- Use a single product-intro hero with a compact process strip

Tone + density:
- Keep it concrete, product-led, and low-density

Source constraint:
- Do not invent customer logos, adoption metrics, or business traction
```
