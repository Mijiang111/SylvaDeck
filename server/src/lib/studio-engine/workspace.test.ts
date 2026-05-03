import test from "node:test";
import assert from "node:assert/strict";
import { createStarterPackWorkspaceBlock } from "./workspace.js";
import { pageLayoutArchetypeSchema, type PublishedModuleManifest } from "./schemas.js";
import {
  PAGE_LAYOUT_ARCHETYPE_VALUES,
  VISUAL_GRAMMAR_REGISTRY,
} from "./visual-grammar-registry.js";

test("visual grammar registry covers every page layout archetype", () => {
  assert.deepEqual(
    Object.keys(VISUAL_GRAMMAR_REGISTRY).sort(),
    [...pageLayoutArchetypeSchema.options].sort(),
  );
  assert.equal(PAGE_LAYOUT_ARCHETYPE_VALUES.length, 24);
});

test("visual grammar registry entries declare required slot and export boundaries", () => {
  for (const entry of Object.values(VISUAL_GRAMMAR_REGISTRY)) {
    assert.ok(entry.requiredSlots.length > 0, entry.archetype);
    assert.ok(entry.dominantSlot, entry.archetype);
    assert.ok(entry.requiredSlots.includes(entry.dominantSlot), entry.archetype);
    assert.ok(entry.ownershipBoundary, entry.archetype);
    assert.ok(entry.snapshotBoundary, entry.archetype);
    assert.ok(entry.avoidPatterns.length > 0, entry.archetype);
    assert.ok(entry.slots.some((slot) => slot.id === entry.dominantSlot), entry.archetype);
  }
});

function createStarterManifest(args: {
  moduleId: string;
  label: string;
  promptHint: string;
  promptContract: string[];
  outputContractSummary: string[];
}): PublishedModuleManifest {
  return {
    moduleId: args.moduleId,
    kind: "matrix",
    category: "logic",
    status: "stable",
    label: args.label,
    semanticRole: `${args.label} starter manifest`,
    promptHint: args.promptHint,
    rendererCapabilities: ["matrix-grid"],
    supportedChartKinds: [],
    deterministicCapability: "fallback",
    outputContractSummary: args.outputContractSummary,
    fieldManifest: [],
    publishCount: 1,
    lastPublishedAt: null,
    hasPassingEvidence: true,
    trustScore: 1,
    signature: `${args.moduleId}:sig`,
    template: {
      templateId: `${args.moduleId}.template`,
      sourceModuleId: args.moduleId,
      label: args.label,
      family: "primitive",
      shape: "single-proof-canvas",
      visualHierarchy: [],
      slotManifest: [],
      decorativeManifest: [],
      copyBudget: [],
      allowedAdaptations: [],
      fitRules: [],
      promptContract: args.promptContract,
    },
  };
}

test("createStarterPackWorkspaceBlock keeps theme, deck, and page starter context distinct", () => {
  const themeManifest = createStarterManifest({
    moduleId: "starter-pack.theme.swiss-grid",
    label: "Swiss grid theme",
    promptHint:
      "starter-pack::application=theme;kind=theme;theme=swiss-grid;page-family=theme-only",
    promptContract: [
      "Starter pack theme Swiss grid",
      "Starter family theme-only",
    ],
    outputContractSummary: [
      "Editorial grid discipline with a restrained modernist tone.",
    ],
  });
  const deckManifest = createStarterManifest({
    moduleId: "starter-pack.deck.starter.weekly-report",
    label: "Weekly report",
    promptHint:
      "starter-pack::application=deck;kind=deck;starter-id=starter.weekly-report;theme=corporate-clean;page-family=weekly-report",
    promptContract: [
      "Starter pack theme Corporate clean",
      "Layout family poster-claim",
      "Layout family single-proof-canvas",
      "Starter archetype 1: cover",
      "Starter archetype 2: kpi-snapshot",
    ],
    outputContractSummary: [
      "Use one oversized headline and one supporting lede only.",
      "Keep metadata compact in small chips or kicker text.",
    ],
  });
  const pageManifest = createStarterManifest({
    moduleId: "starter-pack.page.2.starter.comparison",
    label: "Comparison",
    promptHint:
      "starter-pack::application=page;kind=layout;starter-id=starter.comparison;theme=swiss-grid;page-family=comparison;page-number=2",
    promptContract: [
      "Layout family comparison-split",
      "Starter operator comparison-split",
      "Starter dominant geometry Two contrasted panes with an explicit split.",
      "Starter secondary zones left side | right side | axis title",
      "Starter copy density Moderate density. Two contrasted sides only.",
      "Starter avoid card wall",
    ],
    outputContractSummary: [
      "Use two clearly contrasted panes with one comparison title.",
      "Keep the comparison axis explicit and visible.",
    ],
  });

  const block = createStarterPackWorkspaceBlock(
    [themeManifest, deckManifest, pageManifest],
    { pageNumber: 2 },
  );

  assert.ok(block);
  assert.equal(block?.title, "Selected starter pack");
  assert.match(block?.lines.join("\n") ?? "", /Theme-only mode changes token family/i);
  assert.match(block?.lines.join("\n") ?? "", /Deck archetypes: cover -> kpi-snapshot/i);
  assert.match(block?.lines.join("\n") ?? "", /Current page starter: Comparison for page 2\./i);
  assert.match(block?.lines.join("\n") ?? "", /Avoid pattern: card wall/i);
});
