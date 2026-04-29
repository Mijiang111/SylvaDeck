import assert from "node:assert/strict";
import test from "node:test";
import {
  PPTX_EXPORT_PIPELINE,
  SPECIALIZED_PPTX_EXPORT_ADAPTERS,
  UNIVERSAL_PPTX_EXPORT_ALGORITHMS,
  validatePptxExportPipelineBoundaries,
} from "./pptx/export/pipeline";
import {
  claimExportOwnership,
  resolveOwnerForElement,
  type ExportElementRecord,
  type ExportPagePlan,
} from "./pptx/export/ownership";
import { resolvePptxRelationshipTarget } from "./pptx/export/package-patch";
import { normalizeChartNativeStyle, normalizeChartSeriesStyle, parseCssColor } from "./pptx/export/style";

test("pptx export pipeline declares the canonical phase order and boundary rules", () => {
  assert.deepEqual(
    PPTX_EXPORT_PIPELINE.map((phase) => phase.phase),
    ["collect", "recognize", "own", "style", "layout", "render", "patch", "quality"],
  );

  const validation = validatePptxExportPipelineBoundaries();
  assert.equal(validation.ok, true, validation.errors.join("\n"));

  const renderPhase = PPTX_EXPORT_PIPELINE.find((phase) => phase.phase === "render");
  assert.ok(renderPhase?.forbids.includes("DOM access"));

  const patchPhase = PPTX_EXPORT_PIPELINE.find((phase) => phase.phase === "patch");
  assert.ok(patchPhase?.owns.includes("native chart XML"));
  assert.ok(patchPhase?.forbids.includes("DOM inspection"));
});

test("pptx export separates universal algorithms from specialized adapters", () => {
  assert.ok(UNIVERSAL_PPTX_EXPORT_ALGORITHMS.includes("ownership graph"));
  assert.ok(UNIVERSAL_PPTX_EXPORT_ALGORITHMS.includes("color/theme normalization"));
  assert.ok(SPECIALIZED_PPTX_EXPORT_ADAPTERS.includes("matrix-vs-table disambiguation"));
  assert.ok(SPECIALIZED_PPTX_EXPORT_ADAPTERS.includes("bubble/waterfall/combo chart adapters"));
});

test("style phase normalizes visual tokens without deciding recognition ownership", () => {
  assert.deepEqual(parseCssColor("rgba(48, 92, 99, 0.5)"), {
    type: "solid",
    hex: "305C63",
    alpha: 0.5,
  });

  const nativeStyle = normalizeChartNativeStyle({
    yAxis: { gridDash: "dash", gridWidthPt: 200, labelColor: "#305c63" },
    bubbleScale: 999,
  });
  assert.equal(nativeStyle?.yAxis?.gridDash, "dash");
  assert.equal(nativeStyle?.yAxis?.gridWidthPt, 20);
  assert.equal(nativeStyle?.yAxis?.labelColor, "305C63");
  assert.equal(nativeStyle?.bubbleScale, 300);

  const seriesStyle = normalizeChartSeriesStyle({
    lineDash: "dot",
    lineWidthPt: 2.5,
    marker: "none",
  });
  assert.deepEqual(seriesStyle, {
    lineDash: "dot",
    lineWidthPt: 2.5,
    marker: "none",
  });
});

test("ownership phase resolves one owner and records conflicts without mutating style", () => {
  const child = {} as HTMLElement;
  const smallOwnerElement = {
    contains: (candidate: Element) => candidate === child,
  } as HTMLElement;
  const largeOwnerElement = {
    contains: (candidate: Element) => candidate === child || candidate === smallOwnerElement,
  } as HTMLElement;
  const owner = resolveOwnerForElement(child, [
    {
      id: "large",
      kind: "chart",
      element: largeOwnerElement,
      bounds: { x: 0, y: 0, w: 400, h: 300 },
      ownsText: true,
      ownsShapes: true,
      ownsSvg: true,
    },
    {
      id: "small",
      kind: "table",
      element: smallOwnerElement,
      bounds: { x: 0, y: 0, w: 200, h: 100 },
      ownsText: true,
      ownsShapes: true,
      ownsSvg: true,
    },
  ]);
  assert.equal(owner?.id, "small");

  const record: ExportElementRecord = {
    element: child,
    elementId: "shape-1",
    bounds: { x: 0, y: 0, w: 10, h: 10 },
    sourceOrder: 1,
    zIndex: 0,
    canvasLayer: "content",
    canvasLayerOrder: 0,
    visible: true,
    hiddenByPlaceholder: false,
    text: "",
    ownership: "text-leaf",
  };
  const plan: ExportPagePlan = {
    pageNumber: 1,
    warnings: [],
    owners: [],
    registry: {
      pageElement: child,
      view: {} as Window,
      records: [record],
      byElement: new Map([[child, record]]),
      placeholderWarnings: new Set(),
    },
  };

  claimExportOwnership({
    plan,
    element: child,
    ownership: "visual-shape",
    ownerId: "chart-1",
  });

  assert.equal(record.ownership, "text-leaf");
  assert.equal(plan.warnings[0]?.code, "ownership-conflict");
});

test("package patch phase resolves PPTX relationship targets without DOM context", () => {
  assert.equal(
    resolvePptxRelationshipTarget("ppt/slides/_rels/slide1.xml.rels", "../charts/chart1.xml"),
    "ppt/charts/chart1.xml",
  );
  assert.equal(resolvePptxRelationshipTarget("ppt/slides/_rels/slide1.xml.rels", "https://example.com/x"), null);
});
