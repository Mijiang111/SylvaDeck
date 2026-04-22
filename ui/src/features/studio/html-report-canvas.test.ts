import assert from "node:assert/strict";
import test from "node:test";
import {
  getGeneratedHtmlReportBlockCanvasTransform,
  getGeneratedHtmlReportVisualCanvasTransform,
  normalizeGeneratedHtmlReportCanvasOverrides,
  removeGeneratedHtmlReportCanvasBlockTransform,
  shiftGeneratedHtmlReportCanvasBlockLayer,
  updateGeneratedHtmlReportCanvasBlockTransform,
  updateGeneratedHtmlReportCanvasVisualTransform,
} from "./html-report-canvas";
import type { GeneratedHtmlReport, HtmlCanvasFrame } from "./types";

const FRAME: HtmlCanvasFrame = {
  x: 40,
  y: 48,
  w: 320,
  h: 180,
};

function makeReport(): GeneratedHtmlReport {
  return {
    title: "Canvas report",
    html: "<html><body></body></html>",
    pageCount: 1,
    pageTitles: ["Page 1"],
    structure: {
      pages: [
        {
          id: "page-1",
          pageNumber: 1,
          title: "Page 1",
          blocks: [
            {
              id: "headline",
              kind: "headline",
              text: "Headline",
              fontSize: 40,
              sourceTag: "div",
              sourceIndex: 0,
            },
            {
              id: "shared-card-copy",
              kind: "paragraph",
              text: "Shared card copy",
              sourceTag: "section",
              sourceIndex: 2,
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
              id: "background-surface",
              kind: "surface",
              fitParticipation: "decorative",
              pageNumber: 1,
              sourceTag: "div",
              sourceIndex: 1,
              style: {},
            },
            {
              id: "shared-card-visual",
              kind: "surface",
              fitParticipation: "content",
              pageNumber: 1,
              sourceTag: "section",
              sourceIndex: 2,
              style: {},
            },
          ],
        },
      ],
    },
  };
}

test("legacy canvas transforms hydrate to foreground layer metadata", () => {
  const overrides = normalizeGeneratedHtmlReportCanvasOverrides({
    pages: [
      {
        pageNumber: 1,
        blockOverrides: {
          headline: {
            mode: "freeform",
            frame: FRAME,
            lockedByUser: true,
          },
        },
        visualOverrides: {},
      },
    ],
  });

  assert.deepEqual(overrides.pages[0]?.blockOverrides.headline?.layer, "foreground");
  assert.deepEqual(overrides.pages[0]?.blockOverrides.headline?.layerOrder, 0);
});

test("structural visuals default to background while dual-role visuals stay foreground", () => {
  const report = makeReport();
  const withSurface = updateGeneratedHtmlReportCanvasVisualTransform({
    report,
    pageNumber: 1,
    id: "background-surface",
    frame: FRAME,
  });
  const withSharedCard = updateGeneratedHtmlReportCanvasVisualTransform({
    report: withSurface,
    pageNumber: 1,
    id: "shared-card-visual",
    frame: { ...FRAME, x: 120 },
  });

  assert.equal(
    getGeneratedHtmlReportVisualCanvasTransform({
      report: withSharedCard,
      pageNumber: 1,
      nodeId: "background-surface",
    })?.layer,
    "background",
  );
  assert.equal(
    getGeneratedHtmlReportVisualCanvasTransform({
      report: withSharedCard,
      pageNumber: 1,
      nodeId: "shared-card-visual",
    })?.layer,
    "foreground",
  );
});

test("layer shifting moves between background and foreground deterministically", () => {
  const report = makeReport();
  const withVisual = updateGeneratedHtmlReportCanvasVisualTransform({
    report,
    pageNumber: 1,
    id: "background-surface",
    frame: FRAME,
  });
  const withBlock = updateGeneratedHtmlReportCanvasBlockTransform({
    report: withVisual,
    pageNumber: 1,
    id: "headline",
    frame: { ...FRAME, y: 120 },
    fontSize: 40,
  });
  const sentBackward = shiftGeneratedHtmlReportCanvasBlockLayer({
    report: withBlock,
    pageNumber: 1,
    id: "headline",
    frame: { ...FRAME, y: 120 },
    fontSize: 40,
    direction: "backward",
  });
  const blockAfterBackward = getGeneratedHtmlReportBlockCanvasTransform({
    report: sentBackward,
    pageNumber: 1,
    blockId: "headline",
  });
  assert.equal(blockAfterBackward?.layer, "background");
  assert.equal(blockAfterBackward?.layerOrder, 1);

  const broughtForward = shiftGeneratedHtmlReportCanvasBlockLayer({
    report: sentBackward,
    pageNumber: 1,
    id: "headline",
    frame: { ...FRAME, y: 120 },
    fontSize: 40,
    direction: "forward",
  });
  const blockAfterForward = getGeneratedHtmlReportBlockCanvasTransform({
    report: broughtForward,
    pageNumber: 1,
    blockId: "headline",
  });
  assert.equal(blockAfterForward?.layer, "foreground");
  assert.equal(blockAfterForward?.layerOrder, 0);
});

test("return to flow removes the stored freeform transform", () => {
  const report = makeReport();
  const moved = updateGeneratedHtmlReportCanvasBlockTransform({
    report,
    pageNumber: 1,
    id: "headline",
    frame: FRAME,
    fontSize: 40,
  });
  const returned = removeGeneratedHtmlReportCanvasBlockTransform({
    report: moved,
    pageNumber: 1,
    id: "headline",
  });

  assert.equal(
    getGeneratedHtmlReportBlockCanvasTransform({
      report: returned,
      pageNumber: 1,
      blockId: "headline",
    }),
    null,
  );
});
