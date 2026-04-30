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
import {
  buildPptxExportDocument,
  buildPptxExportQualityReport,
} from "./pptx/export/quality";
import { inspectSemanticExportObjectForElement } from "./pptx/export-pptx";
import {
  buildExportChartContractFromSpec,
  classifyUnstructuredChartElement,
} from "./pptx/export/recognition/chart";
import { normalizeChartNativeStyle, normalizeChartSeriesStyle, parseCssColor } from "./pptx/export/style";
import type { ExportObjectContract, HtmlChartSpec } from "./types";

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

test("chart export contract classifies the seven supported chart families", () => {
  const series = [{ id: "s1", label: "Value", values: [1, 2, 3], role: "bar" as const, axis: "primary" as const }];
  const specs: HtmlChartSpec[] = [
    { kind: "bar", title: "", subtitle: "", insight: "", unit: "", categories: ["A", "B", "C"], series },
    { kind: "stacked", title: "", subtitle: "", insight: "", unit: "", categories: ["A", "B", "C"], series },
    {
      kind: "line",
      title: "",
      subtitle: "",
      insight: "",
      unit: "",
      categories: ["A", "B", "C"],
      series: [{ ...series[0]!, role: "line" }],
    },
    { kind: "waterfall", title: "", subtitle: "", insight: "", unit: "", categories: ["A", "B", "C"], series },
    {
      kind: "combo",
      title: "",
      subtitle: "",
      insight: "",
      unit: "",
      secondaryUnit: "%",
      categories: ["A", "B", "C"],
      series: [
        { ...series[0]!, role: "bar" },
        { id: "s2", label: "Rate", values: [3, 4, 5], role: "line", axis: "secondary" },
      ],
    },
    {
      kind: "bubble",
      title: "",
      subtitle: "",
      insight: "",
      unit: "",
      xLabel: "X",
      yLabel: "Y",
      sizeLabel: "Size",
      points: [{ id: "p1", label: "A", x: 1, y: 2, size: 3 }],
    },
    {
      kind: "matrix",
      title: "",
      subtitle: "",
      insight: "",
      xLabel: "X",
      yLabel: "Y",
      items: [{ id: "m1", label: "A", detail: "", x: 0.1, y: 0.2, w: 0.2, h: 0.1 }],
    },
  ];

  assert.deepEqual(
    specs.map((spec) => buildExportChartContractFromSpec({ spec }).family),
    ["bar", "stacked", "line", "waterfall", "combo", "bubble", "matrix"],
  );
  assert.equal(buildExportChartContractFromSpec({ spec: specs.at(-1)! }).nativeEligibility, "matrix-shapes");
});

test("chart export contract blocks chart-like content that lacks data", () => {
  if (typeof DOMParser === "undefined") {
    return;
  }
  const document = new DOMParser().parseFromString(
    `<section><div style="width:800px;height:400px">Chart-led evidence view. What the chart says.</div></section>`,
    "text/html",
  );
  const element = document.querySelector("div") as HTMLElement;
  const contract = classifyUnstructuredChartElement(element);

  assert.equal(contract?.nativeEligibility, "blocked");
  assert.equal(contract?.blockedReason, "missing-data");
  assert.equal(contract?.source, "text-layout");
});

test("quality report summarizes chart contract diagnostics", () => {
  const document = buildPptxExportDocument({
    slides: [
      {
        pageNumber: 1,
        title: "Chart contract fixture",
        backgroundColor: "FFFFFF",
        theme: {
          backgroundColor: "FFFFFF",
          surfaceFill: "FFFFFF",
          surfaceSecondary: "F6F6F6",
          dividerColor: "DDDDDD",
          accent: "305C63",
          textPrimary: "111111",
          textMuted: "666666",
          chartPalette: ["305C63"],
        },
        textNodes: [],
        shapeNodes: [],
        chartNodes: [],
        tableNodes: [],
      },
    ],
    diagnostics: [
      {
        code: "chart-contract-blocked",
        pageNumber: 1,
        message: "Chart-like page lacked data.",
        chartFamily: "unknown",
        chartNativeEligibility: "blocked",
        chartBlockedReason: "missing-data",
      },
    ],
  });
  const report = buildPptxExportQualityReport(document);

  assert.equal(report.chartContracts.candidateCount, 1);
  assert.equal(report.chartContracts.blockedCount, 1);
  assert.equal(report.chartContracts.byEligibility.blocked, 1);
  assert.equal(report.pages[0]?.blockedChartContractCount, 1);
});

test("quality report summarizes semantic export contract diagnostics", () => {
  const document = buildPptxExportDocument({
    slides: [
      {
        pageNumber: 1,
        title: "Matrix fixture",
        backgroundColor: "FFFFFF",
        theme: {
          backgroundColor: "FFFFFF",
          surfaceFill: "FFFFFF",
          surfaceSecondary: "F6F6F6",
          dividerColor: "DDDDDD",
          accent: "305C63",
          textPrimary: "111111",
          textMuted: "666666",
          chartPalette: ["305C63"],
        },
        textNodes: [],
        shapeNodes: [],
        chartNodes: [],
        tableNodes: [],
      },
    ],
    diagnostics: [
      {
        code: "export-contract-detected",
        pageNumber: 1,
        message: "Matrix contract detected.",
        exportObjectId: "p1-primary-matrix",
        exportObjectKind: "matrix",
        exportRenderTarget: "editable-shapes",
      },
      {
        code: "export-contract-forbidden-violation",
        pageNumber: 1,
        message: "Matrix tried to become a native table.",
        exportObjectId: "p1-primary-matrix",
        exportObjectKind: "matrix",
        exportRenderTarget: "editable-shapes",
      },
      {
        code: "export-contract-render-target-missing",
        pageNumber: 1,
        message: "Native chart target was not produced.",
        exportObjectId: "p1-primary-chart",
        exportObjectKind: "native-chart",
        exportRenderTarget: "native-chart",
      },
    ],
  });
  const report = buildPptxExportQualityReport(document);

  assert.equal(report.exportContracts.candidateCount, 1);
  assert.equal(report.exportContracts.violationCount, 2);
  assert.equal(report.exportContracts.byKind.matrix, 2);
  assert.equal(report.exportContracts.byKind["native-chart"], 1);
  assert.equal(report.pages[0]?.exportContractCandidateCount, 1);
  assert.equal(report.pages[0]?.exportContractViolationCount, 2);
});

test("semantic export contract materializes from report contract when DOM metadata is missing", () => {
  if (typeof DOMParser === "undefined") {
    return;
  }
  const document = new DOMParser().parseFromString(
    `<section class="page" data-page-number="1" data-page-title="Matrix"><main><table><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table></main></section>`,
    "text/html",
  );
  const pageElement = document.querySelector("section") as HTMLElement;
  const tableElement = document.querySelector("table") as HTMLElement;
  const expectedContract: ExportObjectContract = {
    objectId: "p1-primary-matrix",
    pageNumber: 1,
    pageStory: "Compare strategic options without exporting a native table.",
    primaryVisualObject: "2x2 matrix",
    objectKind: "matrix",
    dataContract: { expected: "matrix-object", nativeTableAllowed: false },
    renderTarget: "editable-shapes",
    ownershipScope: {
      rootId: "p1-primary-matrix",
      ownsText: true,
      ownsShapes: true,
      ownsSvg: true,
      childRoles: ["axis", "quadrant", "cell"],
    },
    forbiddenInterpretation: ["native-table"],
  };

  const inspection = inspectSemanticExportObjectForElement({
    pageElement,
    element: tableElement,
    pageNumber: 1,
    expectedContract,
  });

  assert.equal(inspection.object?.objectId, "p1-primary-matrix");
  assert.equal(inspection.object?.objectKind, "matrix");
  assert.equal(inspection.forbidsNativeTable, true);
  assert.equal(
    inspection.warnings.some((warning) => warning.code === "export-contract-missing"),
    true,
  );
  assert.equal(
    inspection.warnings.some((warning) => warning.code === "export-contract-detected"),
    true,
  );
});
