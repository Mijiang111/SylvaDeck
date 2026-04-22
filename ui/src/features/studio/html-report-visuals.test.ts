import assert from "node:assert/strict";
import test from "node:test";
import { buildStableVisualFallbackId } from "./html-report-visuals";

test("stable visual fallback ids do not depend on candidate order", () => {
  const signature =
    "surface|article|surface-card|children:h3|p|text-tags:h3|p|ancestors:page-primary/page-body";

  const first = buildStableVisualFallbackId({
    pageNumber: 2,
    kind: "surface",
    signature,
  });
  const second = buildStableVisualFallbackId({
    pageNumber: 2,
    kind: "surface",
    signature,
  });

  assert.equal(first, second);
  assert.match(first, /^visual-2-surface-[a-z0-9]+$/);
});

test("stable visual fallback ids only add ordinal suffixes for true signature duplicates", () => {
  const signature =
    "surface|article|surface-card|children:h3|p|text-tags:h3|p|ancestors:page-secondary/page-body";

  const primary = buildStableVisualFallbackId({
    pageNumber: 1,
    kind: "surface",
    signature,
    duplicateOrdinal: 0,
  });
  const duplicate = buildStableVisualFallbackId({
    pageNumber: 1,
    kind: "surface",
    signature,
    duplicateOrdinal: 1,
  });

  assert.notEqual(primary, duplicate);
  assert.equal(duplicate, `${primary}-2`);
});
