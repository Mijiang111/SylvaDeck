import test from "node:test";
import assert from "node:assert/strict";
import { buildPublishedTemplateManifest } from "./module-assets";
import type { ModuleRegistryEntry } from "./types";

function createEntry(fields: ModuleRegistryEntry["fields"]): ModuleRegistryEntry {
  return {
    id: "private.test.template.matrix",
    kind: "matrix",
    label: "Test template",
    category: "comparison",
    scope: "private",
    status: "beta",
    family: "framework",
    semanticRole: "A template with one AI text slot and decorative furniture.",
    description: "Test template",
    promptHint: "Use this as a page template.",
    useCases: [],
    searchTerms: [],
    rendererCapabilities: [],
    skillBindings: [],
    defaultSkillRequirements: [],
    supportedSkillClasses: ["framework", "domain", "output"],
    incompatibleSkillIds: [],
    examples: [],
    moduleFrame: { x: 10, y: 10, w: 140, h: 70 },
    connections: [],
    thinkingFlow: { nodes: [], edges: [] },
    fields,
    order: 1,
    featured: false,
  };
}

test("published template manifest separates semantic slots from decorative objects", () => {
  const entry = createEntry([
    {
      id: "slot-1",
      label: "Headline",
      type: "custom",
      objectKind: "slot",
      aiState: "ai-fill",
      surface: "artboard",
      description: "Primary audience-facing claim.",
      required: true,
      outputContract: {
        goal: "State one clear headline claim.",
        format: "point",
        length: "short",
      },
      layout: { x: 16, y: 16, w: 88, h: 20 },
    },
    {
      id: "text-1",
      label: "Locked eyebrow",
      type: "custom",
      objectKind: "text",
      aiState: "locked",
      surface: "artboard",
      description: "Fixed template eyebrow.",
      required: false,
      layout: { x: 16, y: 10, w: 30, h: 6 },
      style: {
        fill: "#173043",
        textAlign: "left",
      },
    },
    {
      id: "shape-1",
      label: "Square callout",
      type: "custom",
      objectKind: "rectangle",
      aiState: "locked",
      surface: "artboard",
      description: "Decorative square callout.",
      required: false,
      layout: { x: 110, y: 16, w: 18, h: 18 },
      style: {
        fill: "#dce9ee",
        stroke: "#9bb6c2",
        strokeWidth: 1,
        strokeStyle: "dashed",
        aspectLock: "square",
      },
    },
    {
      id: "line-1",
      label: "Divider",
      type: "custom",
      objectKind: "line",
      aiState: "locked",
      surface: "artboard",
      description: "Horizontal divider.",
      required: false,
      layout: { x: 16, y: 42, w: 108, h: 2 },
      style: {
        stroke: "#9bb6c2",
        strokeWidth: 2,
        strokeStyle: "solid",
      },
    },
    {
      id: "image-1",
      label: "Imported image",
      type: "custom",
      objectKind: "image",
      aiState: "locked",
      surface: "artboard",
      description: "Decorative imported image.",
      required: false,
      layout: { x: 96, y: 44, w: 34, h: 26 },
      imageAsset: {
        assetId: "asset-1",
        mimeType: "image/png",
        size: 2048,
        alt: "Curtain still",
      },
      imageFit: "cover",
    },
    {
      id: "chart-1",
      label: "Chart",
      type: "custom",
      objectKind: "chart",
      aiState: "locked",
      surface: "artboard",
      description: "Chart slot.",
      required: false,
      layout: { x: 16, y: 48, w: 72, h: 24 },
      chartSpec: { kind: "bar" },
      outputContract: {
        goal: "Show one compact chart.",
        format: "chart",
        length: "short",
      },
    },
  ]);

  const manifest = buildPublishedTemplateManifest(entry);

  assert.equal(manifest.slotManifest.length, 2);
  assert.deepEqual(
    manifest.slotManifest.map((slot) => [slot.label, slot.slotKind]),
    [
      ["Headline", "ai-text"],
      ["Chart", "chart"],
    ],
  );
  assert.equal(
    manifest.decorativeManifest.some((item) => item.label === "Locked eyebrow"),
    true,
  );
  assert.equal(
    manifest.decorativeManifest.some((item) => item.kind === "square"),
    true,
  );
  assert.equal(
    manifest.decorativeManifest.some((item) => item.kind === "line"),
    true,
  );
  assert.equal(
    manifest.decorativeManifest.some(
      (item) => item.kind === "image" && item.asset?.assetId === "asset-1",
    ),
    true,
  );
});
