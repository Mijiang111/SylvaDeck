import assert from "node:assert/strict";
import test from "node:test";
import {
  updateGeneratedHtmlReportCanvasBlockTransform,
  updateGeneratedHtmlReportCanvasVisualTransform,
} from "../html-report-canvas";
import type { GeneratedHtmlReport } from "../types";
import {
  buildHtmlCanvasObjects,
  getHtmlEditorSelectionInspectorTab,
  resolveHtmlEditorSelection,
} from "./editor-selection-model";

function makeReport(): GeneratedHtmlReport {
  return {
    title: "Selection report",
    html: "<html><body></body></html>",
    pageCount: 1,
    pageTitles: ["Operating Model"],
    structure: {
      pages: [
        {
          id: "page-1",
          pageNumber: 1,
          title: "Operating Model",
          blocks: [
            {
              id: "headline",
              kind: "headline",
              text: "Operator trust is the bottleneck",
              fontSize: 42,
              sourceTag: "h1",
              sourceIndex: 0,
              sourcePath: "0",
            },
          ],
        },
      ],
    },
    visualStructure: {
      pages: [
        {
          pageNumber: 1,
          nodes: [
            {
              id: "chart",
              kind: "chart-frame",
              fitParticipation: "content",
              pageNumber: 1,
              sourceTag: "figure",
              sourceIndex: 1,
              sourcePath: "1",
              moduleKind: "chart",
              chartSpec: {
                kind: "bar",
                title: "Adoption lift",
                subtitle: "",
                insight: "Trust work lifts adoption.",
                unit: "%",
                categories: ["Baseline", "With handoff"],
                series: [
                  {
                    id: "series-1",
                    label: "Adoption",
                    values: [31, 48],
                  },
                ],
              },
              style: {
                height: 260,
                minHeight: 260,
              },
            },
          ],
        },
      ],
    },
  };
}

test("text selection resolves a typed editing object with transform-aware font size", () => {
  const report = updateGeneratedHtmlReportCanvasBlockTransform({
    report: makeReport(),
    pageNumber: 1,
    id: "headline",
    frame: { x: 120, y: 80, w: 900, h: 140 },
    fontSize: 48,
  });

  const selection = resolveHtmlEditorSelection({
    report,
    pageNumber: 1,
    selection: {
        selectedHtmlBlockId: "headline",
        selectedVisualNodeId: null,
        selectedObjectId: null,
        activeFacet: null,
      },
  });

  assert.equal(selection.kind, "text");
  assert.equal(selection.objectId, "page:1:text:headline");
  assert.equal(selection.pageTitle, "Operating Model");
  assert.equal(selection.block.fontSize, 48);
  assert.equal(selection.transform?.frame.x, 120);
  assert.equal(selection.capabilities.canEditText, true);
  assert.equal(selection.capabilities.canTransform, true);
  assert.equal(selection.capabilities.canReturnToFlow, true);
  assert.equal(getHtmlEditorSelectionInspectorTab(selection), "text");
});

test("visual selection resolves module capabilities and transform-aware dimensions", () => {
  const report = updateGeneratedHtmlReportCanvasVisualTransform({
    report: makeReport(),
    pageNumber: 1,
    id: "chart",
    frame: { x: 180, y: 160, w: 640, h: 300 },
  });

  const selection = resolveHtmlEditorSelection({
    report,
    pageNumber: 1,
    selection: {
      selectedHtmlBlockId: null,
      selectedVisualNodeId: "chart",
      selectedObjectId: null,
      activeFacet: null,
    },
  });

  assert.equal(selection.kind, "visual");
  assert.equal(selection.objectId, "page:1:visual:chart");
  assert.equal(selection.node.style.height, 300);
  assert.equal(selection.node.style.widthPercent, undefined);
  assert.equal(selection.capabilities.canEditStyle, true);
  assert.equal(selection.capabilities.canEditDataModule, true);
  assert.equal(selection.capabilities.canReturnToFlow, true);
  assert.equal(getHtmlEditorSelectionInspectorTab(selection), "visual");
});

test("stale selection keeps enough information for recovery and cleanup", () => {
  const selection = resolveHtmlEditorSelection({
    report: makeReport(),
    pageNumber: 1,
    selection: {
      selectedHtmlBlockId: null,
      selectedVisualNodeId: "missing-node",
      selectedObjectId: null,
      activeFacet: null,
    },
  });

  assert.equal(selection.kind, "stale");
  assert.equal(selection.requestedKind, "visual");
  assert.equal(selection.requestedId, "missing-node");
  assert.equal(selection.capabilities.canTransform, false);
  assert.equal(getHtmlEditorSelectionInspectorTab(selection), "page");
});

test("page selection is the canonical fallback object", () => {
  const selection = resolveHtmlEditorSelection({
    report: makeReport(),
    pageNumber: 1,
    selection: {
      selectedHtmlBlockId: null,
      selectedVisualNodeId: null,
      selectedObjectId: null,
      activeFacet: null,
    },
  });

  assert.equal(selection.kind, "page");
  assert.equal(selection.objectId, "page:1");
  assert.equal(selection.capabilities.canEditStyle, true);
  assert.equal(selection.capabilities.canTransform, false);
  assert.equal(getHtmlEditorSelectionInspectorTab(selection), "page");
});

function makeObjectReport(): GeneratedHtmlReport {
  return {
    title: "Object selection report",
    html: "<html><body></body></html>",
    pageCount: 1,
    pageTitles: ["Object page"],
    structure: {
      pages: [
        {
          id: "page-1",
          pageNumber: 1,
          title: "Object page",
          blocks: [
            {
              id: "card-title",
              kind: "heading",
              text: "Card title",
              sourceTag: "h3",
              sourceIndex: 0,
              sourcePath: "0.0",
            },
          ],
        },
      ],
    },
    visualStructure: {
      pages: [
        {
          pageNumber: 1,
          nodes: [
            {
              id: "card-root",
              kind: "surface",
              fitParticipation: "content",
              pageNumber: 1,
              sourceTag: "article",
              sourceIndex: 0,
              sourcePath: "0",
              studioObjectId: "p1-card",
              exportObjectId: "p1-card",
              exportObjectKind: "text",
              renderTarget: "editable-text",
              isContractRoot: true,
              style: {},
            },
          ],
        },
      ],
    },
  };
}

test("canvas objects group contract roots with internal text and visual facets", () => {
  const objects = buildHtmlCanvasObjects({
    report: makeObjectReport(),
    pageNumber: 1,
  });

  assert.equal(objects.length, 1);
  assert.equal(objects[0]?.id, "p1-card");
  assert.deepEqual(objects[0]?.textBlockIds, ["card-title"]);
  assert.deepEqual(objects[0]?.visualNodeIds, ["card-root"]);
  assert.deepEqual(objects[0]?.editableFacets, ["text", "shape", "export"]);
});

test("text facet selection resolves text inside the selected parent object", () => {
  const selection = resolveHtmlEditorSelection({
    report: makeObjectReport(),
    pageNumber: 1,
    selection: {
      selectedHtmlBlockId: "card-title",
      selectedVisualNodeId: null,
      selectedObjectId: "p1-card",
      activeFacet: "text",
    },
  });

  assert.equal(selection.kind, "text");
  assert.equal(selection.objectId, "p1-card");
  assert.equal(selection.object.selectedObjectId, "p1-card");
  assert.deepEqual(selection.object.availableFacets, ["text", "shape", "export"]);
  assert.equal(getHtmlEditorSelectionInspectorTab(selection), "text");
});

test("shape facet selection keeps the same object and resolves its root visual", () => {
  const selection = resolveHtmlEditorSelection({
    report: makeObjectReport(),
    pageNumber: 1,
    selection: {
      selectedHtmlBlockId: "card-title",
      selectedVisualNodeId: null,
      selectedObjectId: "p1-card",
      activeFacet: "shape",
    },
  });

  assert.equal(selection.kind, "visual");
  assert.equal(selection.objectId, "p1-card");
  assert.equal(selection.nodeId, "card-root");
  assert.equal(selection.object.activeFacet, "shape");
  assert.equal(getHtmlEditorSelectionInspectorTab(selection), "visual");
});

test("duplicate same-id visual anchors collapse into one object with text shape and export facets", () => {
  const report = makeObjectReport();
  report.visualStructure!.pages[0]!.nodes.push({
    id: "card-child-anchor",
    kind: "label-surface",
    fitParticipation: "content",
    pageNumber: 1,
    sourceTag: "div",
    sourceIndex: 1,
    sourcePath: "0.1",
    parentId: "card-root",
    studioObjectId: "p1-card",
    exportObjectId: "p1-card",
    exportObjectKind: "text",
    renderTarget: "editable-text",
    isContractRoot: true,
    style: {},
  });

  const objects = buildHtmlCanvasObjects({
    report,
    pageNumber: 1,
  });

  assert.equal(objects.length, 1);
  assert.equal(objects[0]?.id, "p1-card");
  assert.equal(objects[0]?.rootNodeId, "card-root");
  assert.deepEqual(objects[0]?.textBlockIds, ["card-title"]);
  assert.deepEqual(objects[0]?.visualNodeIds, ["card-root", "card-child-anchor"]);
  assert.deepEqual(objects[0]?.editableFacets, ["text", "shape", "export"]);
});

test("object id ownership lets chart roots expose internal text facet without sourcePath ancestry", () => {
  const report = makeObjectReport();
  report.structure!.pages[0]!.blocks[0] = {
    ...report.structure!.pages[0]!.blocks[0]!,
    id: "chart-note",
    sourcePath: "9.9",
    objectId: "p1-card",
    exportObjectId: "p1-card",
  };
  report.visualStructure!.pages[0]!.nodes[0] = {
    ...report.visualStructure!.pages[0]!.nodes[0]!,
    id: "chart-root",
    kind: "chart-frame",
    moduleKind: "chart",
    sourcePath: "0",
  };

  const objects = buildHtmlCanvasObjects({
    report,
    pageNumber: 1,
  });
  assert.deepEqual(objects[0]?.textBlockIds, ["chart-note"]);
  assert.equal(objects[0]?.editableFacets.includes("text"), true);

  const selection = resolveHtmlEditorSelection({
    report,
    pageNumber: 1,
    selection: {
      selectedHtmlBlockId: null,
      selectedVisualNodeId: "chart-root",
      selectedObjectId: "p1-card",
      activeFacet: "text",
    },
  });

  assert.equal(selection.kind, "text");
  assert.equal(selection.objectId, "p1-card");
  assert.equal(selection.blockId, "chart-note");
});

test("diagram roots with svg text blocks expose text shape and export facets", () => {
  const report = makeObjectReport();
  report.structure!.pages[0]!.blocks[0] = {
    ...report.structure!.pages[0]!.blocks[0]!,
    id: "diagram-label",
    text: "Governance layer",
    sourceTag: "svg:text",
    sourcePath: "0.0.0",
    objectId: "p1-card",
    exportObjectId: "p1-card",
  };
  report.visualStructure!.pages[0]!.nodes[0] = {
    ...report.visualStructure!.pages[0]!.nodes[0]!,
    id: "diagram-root",
    kind: "rail",
    exportObjectKind: "diagram",
    renderTarget: "editable-shapes",
    sourcePath: "0",
  };

  const objects = buildHtmlCanvasObjects({
    report,
    pageNumber: 1,
  });

  assert.deepEqual(objects[0]?.textBlockIds, ["diagram-label"]);
  assert.deepEqual(objects[0]?.visualNodeIds, ["diagram-root"]);
  assert.deepEqual(objects[0]?.editableFacets, ["text", "shape", "export"]);
});

test("shape selection can target atomized children inside a contract root", () => {
  const report = makeObjectReport();
  report.visualStructure!.pages[0]!.nodes[0] = {
    ...report.visualStructure!.pages[0]!.nodes[0]!,
    id: "diagram-root",
    kind: "rail",
    exportObjectKind: "diagram",
    renderTarget: "editable-shapes",
    sourcePath: "0",
  };
  report.visualStructure!.pages[0]!.nodes.push({
    id: "diagram-node-card",
    kind: "surface",
    fitParticipation: "content",
    pageNumber: 1,
    sourceTag: "div",
    sourceIndex: 1,
    sourcePath: "0.2",
    parentId: "diagram-root",
    atomizationRole: "container",
    selectionPriority: "secondary",
    style: {},
  });

  const objects = buildHtmlCanvasObjects({
    report,
    pageNumber: 1,
  });

  assert.deepEqual(objects[0]?.visualNodeIds, ["diagram-root", "diagram-node-card"]);

  const selection = resolveHtmlEditorSelection({
    report,
    pageNumber: 1,
    selection: {
      selectedHtmlBlockId: null,
      selectedVisualNodeId: "diagram-node-card",
      selectedObjectId: "p1-card",
      activeFacet: "shape",
    },
  });

  assert.equal(selection.kind, "visual");
  assert.equal(selection.objectId, "p1-card");
  assert.equal(selection.nodeId, "diagram-node-card");
  assert.equal(selection.object.activeFacet, "shape");
});
