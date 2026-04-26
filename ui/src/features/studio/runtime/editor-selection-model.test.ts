import assert from "node:assert/strict";
import test from "node:test";
import {
  updateGeneratedHtmlReportCanvasBlockTransform,
  updateGeneratedHtmlReportCanvasVisualTransform,
} from "../html-report-canvas";
import type { GeneratedHtmlReport } from "../types";
import {
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
    },
  });

  assert.equal(selection.kind, "page");
  assert.equal(selection.objectId, "page:1");
  assert.equal(selection.capabilities.canEditStyle, true);
  assert.equal(selection.capabilities.canTransform, false);
  assert.equal(getHtmlEditorSelectionInspectorTab(selection), "page");
});
