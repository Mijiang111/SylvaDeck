import test from "node:test";
import assert from "node:assert/strict";
import {
  createTemplateProjectState,
  parseProjectBundle,
  serializeProjectBundle,
} from "./state";
import type { DeckExportContract, GeneratedDraftAsset } from "./types";

function buildStateExportContract(includeIr = true): DeckExportContract {
  return {
    version: 1,
    pages: [
      {
        pageNumber: 1,
        pageStory: "Matrix story",
        primaryVisualObject: "Market matrix",
        primaryObjectId: "p1-matrix",
        ...(includeIr
          ? {
              layoutArchetype: "market-map" as const,
              visualGrammar: "product-strategy" as const,
              composition: "two-column-contrast" as const,
              density: "dense" as const,
            }
          : {}),
        objects: [
          {
            objectId: "p1-matrix",
            pageNumber: 1,
            pageStory: "Matrix story",
            primaryVisualObject: "Market matrix",
            objectKind: "matrix",
            objectRole: "primary",
            dataContract: {
              type: "matrix",
              axes: {
                x: { label: "Growth" },
                y: { label: "Share" },
              },
              items: [{ label: "Core", x: 0.7, y: 0.6 }],
              renderTarget: "editable-shapes",
            },
            renderTarget: "editable-shapes",
            ownershipScope: {
              rootId: "p1-matrix",
              ownsText: true,
              ownsShapes: true,
              ownsSvg: true,
              childRoles: ["axis", "quadrant", "cell"],
            },
            forbiddenInterpretation: ["native-table"],
          },
        ],
      },
    ],
  };
}

test("createTemplateProjectState defaults htmlOutputMode to static", () => {
  const project = createTemplateProjectState("blank");

  assert.equal(project.htmlOutputMode, "static");
});

test("project bundles preserve animated html output mode", () => {
  const project = createTemplateProjectState("blank");
  const serialized = serializeProjectBundle({
    templateId: project.templateId,
    projectName: "Animated report",
    sourceText: "Create an animated preview deck.",
    generationMode: project.generationMode,
    moduleUsageMode: project.moduleUsageMode,
    htmlOutputMode: "animated-preview-js",
    requestedPageCount: 4,
    longFormClarification: project.longFormClarification,
    deckOptimization: project.deckOptimization,
    briefMessages: project.briefMessages,
    pages: project.pages,
    workflowStage: project.workflowStage,
  });

  const parsed = parseProjectBundle(serialized);
  assert.equal(parsed.htmlOutputMode, "animated-preview-js");
});

test("project bundle export contracts preserve page-level Studio IR", () => {
  const project = createTemplateProjectState("blank");
  const exportContract = buildStateExportContract(true);
  const serialized = serializeProjectBundle({
    templateId: project.templateId,
    projectName: "IR project",
    sourceText: "Create one market map.",
    generationMode: project.generationMode,
    moduleUsageMode: project.moduleUsageMode,
    pages: project.pages,
    exportContract,
  });

  const parsed = parseProjectBundle(serialized);
  assert.equal(parsed.exportContract?.pages[0]?.layoutArchetype, "market-map");
  assert.equal(parsed.exportContract?.pages[0]?.visualGrammar, "product-strategy");
  assert.equal(parsed.exportContract?.pages[0]?.composition, "two-column-contrast");
  assert.equal(parsed.exportContract?.pages[0]?.density, "dense");
  assert.deepEqual(parsed.exportContract?.pages[0]?.objects[0]?.ownershipScope, exportContract.pages[0]?.objects[0]?.ownershipScope);
});

test("legacy project export contracts receive page-level Studio IR defaults without losing objects", () => {
  const project = createTemplateProjectState("blank");
  const exportContract = buildStateExportContract(false);
  const serialized = serializeProjectBundle({
    templateId: project.templateId,
    projectName: "Legacy IR project",
    sourceText: "Create one matrix.",
    generationMode: project.generationMode,
    moduleUsageMode: project.moduleUsageMode,
    pages: project.pages,
    exportContract,
  });

  const parsed = parseProjectBundle(serialized);
  const page = parsed.exportContract?.pages[0];
  assert.equal(page?.layoutArchetype, "matrix-first");
  assert.equal(page?.visualGrammar, "consulting");
  assert.equal(page?.composition, "center-canvas-annotation-ring");
  assert.equal(page?.density, "executive");
  assert.equal(page?.objects.length, 1);
  assert.equal(page?.objects[0]?.objectId, "p1-matrix");
  assert.equal(page?.objects[0]?.ownershipScope.ownsText, true);
});

test("generated draft html report export contracts round trip page-level Studio IR", () => {
  const project = createTemplateProjectState("blank");
  const exportContract = buildStateExportContract(true);
  const generatedDraft: GeneratedDraftAsset = {
    version: 4,
    templateId: project.templateId,
    provider: "model",
    mode: "content",
    model: "test-model",
    signature: "signature",
    generatedAt: "2026-04-30T00:00:00.000Z",
    draft: {
      title: "IR draft",
      subtitle: "Generated draft",
      pageDrafts: [],
    },
    htmlReport: {
      title: "IR report",
      html: '<!DOCTYPE html><html><body><section class="page" data-page-number="1" data-page-title="Matrix" style="width:1600px;height:900px;"><h1>Matrix</h1></section></body></html>',
      pageCount: 1,
      pageTitles: ["Matrix"],
      exportContract,
    },
  };
  const serialized = serializeProjectBundle({
    templateId: project.templateId,
    projectName: "Draft IR project",
    sourceText: "Create one matrix.",
    generationMode: project.generationMode,
    moduleUsageMode: project.moduleUsageMode,
    pages: project.pages,
    generatedDraft,
  });

  const parsed = parseProjectBundle(serialized);
  const page = parsed.generatedDraft?.htmlReport?.exportContract?.pages[0];
  assert.equal(page?.layoutArchetype, "market-map");
  assert.equal(page?.visualGrammar, "product-strategy");
  assert.equal(page?.composition, "two-column-contrast");
  assert.equal(page?.density, "dense");
});
