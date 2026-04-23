import assert from "node:assert/strict";
import test from "node:test";
import {
  choosePreviewSelectableCandidate,
  rankPreviewSelectableCandidates,
  type PreviewSelectableCandidate,
} from "./preview-selection";

function candidate(
  key: string,
  type: PreviewSelectableCandidate["type"],
  overrides: Partial<PreviewSelectableCandidate> = {},
): PreviewSelectableCandidate {
  return {
    key,
    type,
    depth: 0,
    area: 1000,
    layerIndex: 0,
    ...overrides,
  };
}

test("topmost painted candidate wins before depth or area heuristics", () => {
  const chosen = choosePreviewSelectableCandidate({
    candidates: [
      candidate("block:headline", "block", {
        layerIndex: 1,
        depth: 0,
        area: 10,
        blockKind: "headline",
      }),
      candidate("visual:top", "visual", {
        layerIndex: 0,
        depth: 5,
        area: 5000,
        visualKind: "surface",
        fitParticipation: "decorative",
      }),
    ],
    context: { preferredSelectionType: "page" },
  });

  assert.equal(chosen?.key, "block:headline");
});

test("visual mode prefers visual over block on the same ambiguous target", () => {
  const ranked = rankPreviewSelectableCandidates({
    candidates: [
      candidate("block:card", "block", {
        blockKind: "paragraph",
        fitParticipation: "content",
      }),
      candidate("visual:card", "visual", {
        visualKind: "surface",
        fitParticipation: "decorative",
      }),
    ],
    context: { preferredSelectionType: "visual" },
  });

  assert.deepEqual(
    ranked.map((entry) => entry.key),
    ["visual:card", "block:card"],
  );
});

test("text mode prefers block over visual on the same ambiguous target", () => {
  const chosen = choosePreviewSelectableCandidate({
    candidates: [
      candidate("block:card", "block", { blockKind: "paragraph" }),
      candidate("visual:card", "visual", {
        visualKind: "surface",
        fitParticipation: "decorative",
      }),
    ],
    context: { preferredSelectionType: "text" },
  });

  assert.equal(chosen?.key, "block:card");
});

test("page mode keeps semantic priority even when a visual is already selected", () => {
  const chosen = choosePreviewSelectableCandidate({
    candidates: [
      candidate("visual:card", "visual", {
        visualKind: "surface",
        fitParticipation: "content",
      }),
      candidate("block:card", "block", { blockKind: "paragraph" }),
    ],
    context: {
      preferredSelectionType: "page",
      selectedVisualNodeId: "card",
    },
  });

  assert.equal(chosen?.key, "block:card");
});

test("page mode still falls back to blocks when there is no visual candidate", () => {
  const chosen = choosePreviewSelectableCandidate({
    candidates: [candidate("block:headline", "block", { depth: 1, blockKind: "headline" })],
    context: { preferredSelectionType: "page" },
  });

  assert.equal(chosen?.key, "block:headline");
});

test("page mode filters decorative surfaces while keeping content visuals selectable", () => {
  const chosen = choosePreviewSelectableCandidate({
    candidates: [
      candidate("visual:closing", "visual", {
        visualKind: "surface",
        fitParticipation: "decorative",
        atomizationRole: "leaf",
        selectionPriority: "secondary",
      }),
      candidate("visual:chart", "visual", {
        visualKind: "chart-frame",
        fitParticipation: "content",
        layerIndex: 2,
      }),
    ],
    context: { preferredSelectionType: "page" },
  });

  assert.equal(chosen?.key, "visual:chart");
});

test("page mode prefers primary leaf visuals over blocks when they overlap", () => {
  const chosen = choosePreviewSelectableCandidate({
    candidates: [
      candidate("block:label", "block", { blockKind: "paragraph" }),
      candidate("visual:node", "visual", {
        visualKind: "node",
        fitParticipation: "content",
        atomizationRole: "leaf",
        selectionPriority: "primary",
      }),
    ],
    context: { preferredSelectionType: "page" },
  });

  assert.equal(chosen?.key, "visual:node");
});

test("page mode keeps direct text targets on blocks even when overlapping visuals are primary leaves", () => {
  const chosen = choosePreviewSelectableCandidate({
    candidates: [
      candidate("block:label", "block", {
        blockId: "label",
        blockKind: "paragraph",
      }),
      candidate("visual:label-surface", "visual", {
        visualNodeId: "label-surface",
        visualKind: "label-surface",
        fitParticipation: "content",
        atomizationRole: "leaf",
        selectionPriority: "primary",
      }),
    ],
    context: { preferredSelectionType: "page" },
    directBlockId: "label",
    directBlockDepth: 0,
    directVisualDepth: 0,
  });

  assert.equal(chosen?.key, "block:label");
});

test("visual mode still keeps primary visuals ahead of direct text blocks", () => {
  const chosen = choosePreviewSelectableCandidate({
    candidates: [
      candidate("block:label", "block", {
        blockId: "label",
        blockKind: "paragraph",
      }),
      candidate("visual:label-surface", "visual", {
        visualNodeId: "label-surface",
        visualKind: "label-surface",
        fitParticipation: "content",
        atomizationRole: "leaf",
        selectionPriority: "primary",
      }),
    ],
    context: { preferredSelectionType: "visual" },
    directBlockId: "label",
    directBlockDepth: 0,
    directVisualDepth: 0,
  });

  assert.equal(chosen?.key, "visual:label-surface");
});

test("visual mode prefers leaf visuals over scaffold shells", () => {
  const ranked = rankPreviewSelectableCandidates({
    candidates: [
      candidate("visual:shell", "visual", {
        visualKind: "surface",
        fitParticipation: "decorative",
        atomizationRole: "scaffold",
        selectionPriority: "secondary",
      }),
      candidate("visual:card", "visual", {
        visualKind: "surface",
        fitParticipation: "content",
        atomizationRole: "leaf",
        selectionPriority: "primary",
      }),
    ],
    context: { preferredSelectionType: "visual" },
  });

  assert.deepEqual(
    ranked.map((entry) => entry.key),
    ["visual:card", "visual:shell"],
  );
});
