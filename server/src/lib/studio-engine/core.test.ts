import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAnimatedPreviewOutputRuleLines,
  buildAnimatedPreviewRepairRuleLines,
  resolveStandardHeuristicRecipePageCount,
} from "./core.js";

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

test("buildAnimatedPreviewOutputRuleLines only adds animation reference guidance in animated mode", () => {
  assert.deepEqual(buildAnimatedPreviewOutputRuleLines("static"), []);

  const lines = buildAnimatedPreviewOutputRuleLines("animated-preview-js");
  assert.ok(lines.some((line) => line.includes("data-anim-anchor")));
  assert.ok(lines.some((line) => line.includes("data-studio-animation-manifest")));
  assert.ok(lines.some((line) => line.includes('"startMode":"entry-then-loop"')));
});

test("buildAnimatedPreviewRepairRuleLines only adds repair-specific animation guidance in animated mode", () => {
  assert.deepEqual(buildAnimatedPreviewRepairRuleLines("static"), []);

  const lines = buildAnimatedPreviewRepairRuleLines("animated-preview-js");
  assert.ok(lines.some((line) => line.includes("Preserve valid data-anim-* attributes")));
  assert.ok(lines.some((line) => line.includes("data-anim-anchor")));
  assert.ok(lines.some((line) => line.includes("data-studio-animation-manifest")));
});
