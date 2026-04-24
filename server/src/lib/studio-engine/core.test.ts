import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAnimatedPreviewOutputRuleLines,
  buildAnimatedPreviewRepairRuleLines,
  resolveStandardHeuristicRecipePageCount,
} from "./core.js";
import { pageRecipePlanSchema } from "./schemas.js";

test("resolveStandardHeuristicRecipePageCount preserves explicit six-page standard requests", () => {
  assert.equal(
    resolveStandardHeuristicRecipePageCount({
      requestedPageCount: 6,
      defaultPageCount: 4,
    }),
    6,
  );
});

test("resolveStandardHeuristicRecipePageCount keeps standard decks capped below long-form", () => {
  assert.equal(
    resolveStandardHeuristicRecipePageCount({
      requestedPageCount: 11,
      defaultPageCount: 4,
    }),
    9,
  );
});

test("resolveStandardHeuristicRecipePageCount honors preflight single-page intent when payload pageCount is absent", () => {
  assert.equal(
    resolveStandardHeuristicRecipePageCount({
      requestedPageCount: null,
      preflightPageCount: 1,
      defaultPageCount: 2,
    }),
    1,
  );
});

test("buildAnimatedPreviewOutputRuleLines only adds animation reference guidance in animated mode", () => {
  assert.deepEqual(buildAnimatedPreviewOutputRuleLines("static"), []);

  const lines = buildAnimatedPreviewOutputRuleLines("animated-preview-js");
  assert.ok(lines.some((line) => line.includes("data-anim-anchor")));
  assert.ok(lines.some((line) => line.includes("data-studio-animation-manifest")));
  assert.ok(lines.some((line) => line.includes('"startMode":"entry-then-loop"')));
  assert.ok(lines.some((line) => line.includes("Canonical manifest example")));
  assert.ok(lines.some((line) => line.includes("stringified numbers")));
});

test("buildAnimatedPreviewRepairRuleLines only adds repair-specific animation guidance in animated mode", () => {
  assert.deepEqual(buildAnimatedPreviewRepairRuleLines("static"), []);

  const lines = buildAnimatedPreviewRepairRuleLines("animated-preview-js");
  assert.ok(lines.some((line) => line.includes("Preserve valid data-anim-* attributes")));
  assert.ok(lines.some((line) => line.includes("data-anim-anchor")));
  assert.ok(lines.some((line) => line.includes("data-studio-animation-manifest")));
  assert.ok(lines.some((line) => line.includes("Repair toward this canonical manifest shape")));
});

test("pageRecipePlanSchema accepts one optional secondary chart and rejects chart arrays", () => {
  const basePage = {
    pageNumber: 1,
    pageTitle: "Margin and mix",
    objective: "Explain margin recovery and segment mix.",
    insight: "Margin recovery is broadening while mix remains uneven.",
    pageClass: "proof-analysis",
    layout: "chart-insight",
    desiredChartKind: "waterfall",
    chartPreset: "margin-bridge",
    compositionPreset: "hero-sidecar",
    composite: "annotation-rail",
    evidenceIds: ["bridge"],
    moduleHints: ["core.gantt"],
  };

  assert.equal(
    pageRecipePlanSchema.safeParse({
      title: "Composable charts",
      pages: [
        {
          ...basePage,
          secondaryChart: {
            desiredChartKind: "stacked",
            chartPreset: "segment-mix",
            evidenceIds: ["mix"],
            role: "sidecar",
            title: "Revenue mix",
          },
        },
      ],
    }).success,
    true,
  );

  assert.equal(
    pageRecipePlanSchema.safeParse({
      title: "Too many charts",
      pages: [
        {
          ...basePage,
          secondaryChart: [
            { desiredChartKind: "bar" },
            { desiredChartKind: "line" },
          ],
        },
      ],
    }).success,
    false,
  );
});
