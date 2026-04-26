import assert from "node:assert/strict";
import test from "node:test";
import type { GeneratedHtmlReport } from "../types";
import type { HtmlEditorSelectionObject } from "./editor-selection-model";
import {
  createHtmlEditorTextCanvasCommandTarget,
  createHtmlEditorVisualCanvasCommandTarget,
  resolveHtmlEditorCommandTarget,
  resolveHtmlEditorVisualInsertionTarget,
} from "./editor-commands";

const pageSelection: HtmlEditorSelectionObject = {
  kind: "page",
  objectId: "page:1",
  pageNumber: 1,
  pageTitle: "Operating Model",
  capabilities: {
    canEditText: false,
    canEditStyle: true,
    canTransform: false,
    canReturnToFlow: false,
    canExtractModule: false,
    canEditDataModule: false,
    canEditScientificDiagram: false,
  },
};

const textSelection: HtmlEditorSelectionObject = {
  kind: "text",
  objectId: "page:1:text:headline",
  pageNumber: 1,
  pageTitle: "Operating Model",
  blockId: "headline",
  block: {
    id: "headline",
    kind: "headline",
    text: "Operator trust is the bottleneck",
    sourceTag: "h1",
    sourceIndex: 0,
  },
  transform: null,
  capabilities: {
    canEditText: true,
    canEditStyle: false,
    canTransform: true,
    canReturnToFlow: false,
    canExtractModule: true,
    canEditDataModule: false,
    canEditScientificDiagram: false,
  },
};

const visualSelection: HtmlEditorSelectionObject = {
  kind: "visual",
  objectId: "page:1:visual:chart",
  pageNumber: 1,
  pageTitle: "Operating Model",
  nodeId: "chart",
  node: {
    id: "chart",
    kind: "chart-frame",
    fitParticipation: "content",
    pageNumber: 1,
    sourceTag: "figure",
    sourceIndex: 1,
    moduleKind: "chart",
    style: {},
  },
  transform: null,
  contentNodes: [],
  capabilities: {
    canEditText: false,
    canEditStyle: true,
    canTransform: true,
    canReturnToFlow: false,
    canExtractModule: true,
    canEditDataModule: true,
    canEditScientificDiagram: false,
  },
};

const staleSelection: HtmlEditorSelectionObject = {
  kind: "stale",
  objectId: "page:1:visual:stale:missing",
  pageNumber: 1,
  pageTitle: "Operating Model",
  requestedKind: "visual",
  requestedId: "missing",
  capabilities: {
    canEditText: false,
    canEditStyle: false,
    canTransform: false,
    canReturnToFlow: false,
    canExtractModule: false,
    canEditDataModule: false,
    canEditScientificDiagram: false,
  },
};

test("command target resolves typed text and visual objects", () => {
  assert.deepEqual(resolveHtmlEditorCommandTarget(textSelection, "edit-text"), {
    kind: "text",
    pageNumber: 1,
    pageTitle: "Operating Model",
    objectId: "page:1:text:headline",
    blockId: "headline",
  });

  assert.deepEqual(resolveHtmlEditorCommandTarget(visualSelection, "edit-data-module"), {
    kind: "visual",
    pageNumber: 1,
    pageTitle: "Operating Model",
    objectId: "page:1:visual:chart",
    nodeId: "chart",
    visualKind: "chart-frame",
    moduleKind: "chart",
  });
});

test("commands reject incompatible or stale selections", () => {
  assert.equal(resolveHtmlEditorCommandTarget(pageSelection, "delete-visual"), null);
  assert.equal(resolveHtmlEditorCommandTarget(textSelection, "delete-visual"), null);
  assert.equal(resolveHtmlEditorCommandTarget(visualSelection, "edit-text"), null);
  assert.equal(resolveHtmlEditorCommandTarget(staleSelection, "replace-visual-module"), null);
});

test("extract module is allowed for text and visual selections only", () => {
  assert.equal(resolveHtmlEditorCommandTarget(pageSelection, "extract-module"), null);
  assert.equal(resolveHtmlEditorCommandTarget(textSelection, "extract-module")?.kind, "text");
  assert.equal(resolveHtmlEditorCommandTarget(visualSelection, "extract-module")?.kind, "visual");
});

test("visual insertion uses selected visual as anchor only for relative placement", () => {
  assert.deepEqual(
    resolveHtmlEditorVisualInsertionTarget({
      selection: visualSelection,
      requestedPlacement: "below",
    }),
    {
      pageNumber: 1,
      anchorNodeId: "chart",
      placement: "below",
    },
  );

  assert.deepEqual(
    resolveHtmlEditorVisualInsertionTarget({
      selection: textSelection,
      requestedPlacement: "below",
    }),
    {
      pageNumber: 1,
      anchorNodeId: null,
      placement: "page-end",
    },
  );
});

test("canvas command target creation resolves page title and visual node metadata", () => {
  const report: GeneratedHtmlReport = {
    title: "Deck",
    html: "",
    pageCount: 2,
    pageTitles: ["Cover", "Model"],
    visualStructure: {
      pages: [
        {
          pageNumber: 2,
          nodes: [
            {
              id: "chart",
              kind: "chart-frame",
              fitParticipation: "content",
              pageNumber: 2,
              sourceTag: "figure",
              sourceIndex: 0,
              moduleKind: "chart",
              style: {},
            },
          ],
        },
      ],
    },
  };

  assert.deepEqual(
    createHtmlEditorTextCanvasCommandTarget({
      report,
      pageNumber: 2,
      blockId: "headline",
      fallbackPageTitle: "Fallback",
    }),
    {
      kind: "text",
      pageNumber: 2,
      pageTitle: "Model",
      objectId: "page:2:text:headline",
      blockId: "headline",
    },
  );

  assert.deepEqual(
    createHtmlEditorVisualCanvasCommandTarget({
      report,
      pageNumber: 2,
      nodeId: "chart",
      fallbackPageTitle: "Fallback",
    }),
    {
      kind: "visual",
      pageNumber: 2,
      pageTitle: "Model",
      objectId: "page:2:visual:chart",
      nodeId: "chart",
      visualKind: "chart-frame",
      moduleKind: "chart",
    },
  );
});
