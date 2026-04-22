import assert from "node:assert/strict";
import test from "node:test";
import { resolvePreviewBlockSizingBehavior } from "./preview-transform-policy";

test("text-only blocks keep text-auto sizing behavior", () => {
  assert.equal(
    resolvePreviewBlockSizingBehavior({
      blockKind: "headline",
      linkedVisualNodeId: null,
      sharesSource: false,
    }),
    "text-auto",
  );
});

test("decorative shared surfaces do not force text blocks into frame sizing", () => {
  assert.equal(
    resolvePreviewBlockSizingBehavior({
      blockKind: "headline",
      linkedVisualNodeId: "card-visual",
      linkedVisualKind: "surface",
      linkedVisualFitParticipation: "decorative",
      sharesSource: true,
    }),
    "text-auto",
  );
});

test("true shared content containers switch text blocks to frame-only sizing", () => {
  assert.equal(
    resolvePreviewBlockSizingBehavior({
      blockKind: "paragraph",
      linkedVisualNodeId: "chart-frame-visual",
      linkedVisualKind: "chart-frame",
      linkedVisualFitParticipation: "content",
      sharesSource: true,
    }),
    "frame-only",
  );
});
