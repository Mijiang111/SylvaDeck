import test from "node:test";
import assert from "node:assert/strict";
import { HTML_REPORT_PAGE_RADIUS, resolveCanvasPageViewportRadius } from "./runtime-report-view-math";

test("resolveCanvasPageViewportRadius tracks the scaled page radius instead of a fixed clip", () => {
  assert.equal(resolveCanvasPageViewportRadius(1), HTML_REPORT_PAGE_RADIUS);
  assert.equal(resolveCanvasPageViewportRadius(0.61), 17);
  assert.equal(resolveCanvasPageViewportRadius(0.08), 2);
});
