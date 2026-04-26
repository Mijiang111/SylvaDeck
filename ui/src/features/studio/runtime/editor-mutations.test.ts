import assert from "node:assert/strict";
import test from "node:test";
import {
  getGeneratedHtmlReportBlockCanvasTransform,
  getGeneratedHtmlReportVisualCanvasTransform,
} from "../html-report-canvas";
import type { GeneratedHtmlReport } from "../types";
import type { HtmlEditorCommandTarget } from "./editor-commands";
import {
  applyHtmlEditorTextCanvasTransform,
  applyHtmlEditorVisualCanvasTransform,
  returnHtmlEditorCanvasTargetToFlow,
  shiftHtmlEditorCanvasTargetLayer,
} from "./editor-mutations";

const textTarget: Extract<HtmlEditorCommandTarget, { kind: "text" }> = {
  kind: "text",
  pageNumber: 1,
  pageTitle: "Operating Model",
  objectId: "page:1:text:headline",
  blockId: "headline",
};

const visualTarget: Extract<HtmlEditorCommandTarget, { kind: "visual" }> = {
  kind: "visual",
  pageNumber: 1,
  pageTitle: "Operating Model",
  objectId: "page:1:visual:chart",
  nodeId: "chart",
  visualKind: "chart-frame",
  moduleKind: "chart",
};

function makeReport(): GeneratedHtmlReport {
  return {
    title: "Mutation report",
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
              style: {},
            },
          ],
        },
      ],
    },
  };
}

test("text transform mutation stores frame and normalized font size", () => {
  const report = applyHtmlEditorTextCanvasTransform({
    report: makeReport(),
    target: textTarget,
    frame: { x: 10.2, y: 20.7, w: 300.4, h: 80.6 },
    fontSize: 37.8,
  });
  const transform = getGeneratedHtmlReportBlockCanvasTransform({
    report,
    pageNumber: 1,
    blockId: "headline",
  });

  assert.deepEqual(transform?.frame, { x: 10, y: 21, w: 300, h: 81 });
  assert.equal(transform?.fontSize, 38);
});

test("visual transform mutation stores a visual canvas override", () => {
  const report = applyHtmlEditorVisualCanvasTransform({
    report: makeReport(),
    target: visualTarget,
    frame: { x: 160, y: 120, w: 640, h: 300 },
  });
  const transform = getGeneratedHtmlReportVisualCanvasTransform({
    report,
    pageNumber: 1,
    nodeId: "chart",
  });

  assert.deepEqual(transform?.frame, { x: 160, y: 120, w: 640, h: 300 });
});

test("return-to-flow mutation removes text and visual canvas overrides", () => {
  const withText = applyHtmlEditorTextCanvasTransform({
    report: makeReport(),
    target: textTarget,
    frame: { x: 10, y: 20, w: 300, h: 80 },
  });
  const withoutText = returnHtmlEditorCanvasTargetToFlow({
    report: withText,
    target: textTarget,
  });
  assert.equal(
    getGeneratedHtmlReportBlockCanvasTransform({
      report: withoutText,
      pageNumber: 1,
      blockId: "headline",
    }),
    null,
  );

  const withVisual = applyHtmlEditorVisualCanvasTransform({
    report: makeReport(),
    target: visualTarget,
    frame: { x: 160, y: 120, w: 640, h: 300 },
  });
  const withoutVisual = returnHtmlEditorCanvasTargetToFlow({
    report: withVisual,
    target: visualTarget,
  });
  assert.equal(
    getGeneratedHtmlReportVisualCanvasTransform({
      report: withoutVisual,
      pageNumber: 1,
      nodeId: "chart",
    }),
    null,
  );
});

test("layer mutation dispatches by command target kind", () => {
  const withVisual = applyHtmlEditorVisualCanvasTransform({
    report: makeReport(),
    target: visualTarget,
    frame: { x: 160, y: 120, w: 640, h: 300 },
  });
  const withText = applyHtmlEditorTextCanvasTransform({
    report: withVisual,
    target: textTarget,
    frame: { x: 10, y: 20, w: 300, h: 80 },
  });
  const shiftedText = shiftHtmlEditorCanvasTargetLayer({
    report: withText,
    target: textTarget,
    direction: "backward",
    frame: { x: 10, y: 20, w: 300, h: 80 },
  });

  assert.equal(
    getGeneratedHtmlReportBlockCanvasTransform({
      report: shiftedText,
      pageNumber: 1,
      blockId: "headline",
    })?.layer,
    "background",
  );
});
