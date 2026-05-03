import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import JSZip from "jszip";
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
import { patchPptxPackageXml, resolvePptxRelationshipTarget } from "./pptx/export/package-patch";
import {
  buildPptxExportDocument,
  buildPptxExportQualityReport,
} from "./pptx/export/quality";
import {
  inspectPptxExportAnnotationsForPage,
  inspectSemanticExportChartsForPage,
  inspectSemanticExportObjectForElement,
  inspectSemanticExportTablesForPage,
  rasterizeVisualChartSnapshots,
  type PptExportSlideModel,
} from "./pptx/export-pptx";
import {
  buildExportChartContractFromSpec,
  classifyUnstructuredChartElement,
} from "./pptx/export/recognition/chart";
import { normalizeChartNativeStyle, normalizeChartSeriesStyle, parseCssColor } from "./pptx/export/style";
import { PPT_LAYOUT } from "./pptx/export/types";
import type { ExportDataContract, ExportObjectContract, HtmlChartSpec, PageExportContract, SlideScene } from "./types";

type SharedExportDataContractFixture = {
  name: string;
  objectId: string;
  objectKind: ExportObjectContract["objectKind"];
  renderTarget: ExportObjectContract["renderTarget"];
  forbiddenInterpretation?: string[];
  expectedDiagnosticCode?: string;
  dataContract: unknown;
};

function readSharedExportDataContractFixtures() {
  return JSON.parse(
    readFileSync(
      new URL("../../../../tests/fixtures/export-data-contract-fixtures.json", import.meta.url),
      "utf8",
    ),
  ) as {
    valid: SharedExportDataContractFixture[];
    invalid: SharedExportDataContractFixture[];
  };
}

function defaultDataContractForObjectKind(
  objectKind: ExportObjectContract["objectKind"],
): ExportDataContract | null {
  if (objectKind === "matrix") {
    return {
      type: "matrix",
      axes: {
        x: { label: "Impact" },
        y: { label: "Readiness" },
      },
      items: [
        { label: "Core", x: 0.7, y: 0.6 },
      ],
      renderTarget: "editable-shapes",
    };
  }
  if (objectKind === "native-table") {
    return {
      type: "table",
      columns: [
        { label: "Metric" },
        { label: "Value" },
      ],
      rows: [["Run-rate", "42"]],
      headerPolicy: "first-row",
      nativeTableAllowed: true,
    };
  }
  if (objectKind === "chart-visual" || objectKind === "native-chart") {
    return {
      type: "chart-bar",
      categories: ["A", "B"],
      series: [{ name: "Series", values: [1, 2] }],
    };
  }
  return null;
}

function buildExportObjectContract(args: {
  objectId: string;
  objectKind: ExportObjectContract["objectKind"];
  renderTarget: ExportObjectContract["renderTarget"];
  objectRole: ExportObjectContract["objectRole"];
  dataContract?: ExportDataContract | null;
  ownsText?: boolean;
  ownsShapes?: boolean;
  ownsSvg?: boolean;
  forbiddenInterpretation?: string[];
}): ExportObjectContract {
  return {
    objectId: args.objectId,
    pageNumber: 1,
    pageStory: "Export fixture.",
    primaryVisualObject: args.objectKind,
    objectKind: args.objectKind,
    objectRole: args.objectRole,
    dataContract: args.dataContract === undefined
      ? defaultDataContractForObjectKind(args.objectKind)
      : args.dataContract,
    renderTarget: args.renderTarget,
    ownershipScope: {
      rootId: args.objectId,
      ownsText: args.ownsText ?? true,
      ownsShapes: args.ownsShapes ?? args.objectKind !== "text",
      ownsSvg: args.ownsSvg ?? args.objectKind !== "text",
      childRoles: [],
    },
    forbiddenInterpretation: args.forbiddenInterpretation ?? [],
  };
}

function mockRect(element: Element, rect: { left: number; top: number; width: number; height: number }) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => rect,
    }),
  });
}

function htmlJsonAttribute(value: unknown) {
  return JSON.stringify(value).replaceAll('"', "&quot;");
}

function exportContractRootAttrs(contract: ExportObjectContract) {
  const ownershipScope = [
    contract.ownershipScope.ownsText ? "text" : "",
    contract.ownershipScope.ownsShapes ? "shape" : "",
    contract.ownershipScope.ownsSvg ? "svg" : "",
  ].filter(Boolean).join(",");
  const forbidden = contract.forbiddenInterpretation.join(",");
  const studioSlot =
    contract.objectRole === "primary"
      ? "primary-visual"
      : contract.objectRole === "source"
        ? "source-note"
        : contract.objectRole === "annotation"
          ? "annotation"
          : contract.objectKind === "text" || contract.objectKind === "native-table" || contract.objectKind === "metric-grid"
            ? "evidence-note"
            : "callout";
  const snapshotBoundary =
    contract.objectKind === "chart-visual" ||
    contract.objectKind === "native-table" ||
    contract.objectKind === "matrix" ||
    contract.objectKind === "diagram"
      ? "object-root"
      : null;
  return [
    `data-export-object-id="${contract.objectId}"`,
    `data-semantic-kind="${contract.objectKind}"`,
    `data-export-object-kind="${contract.objectKind}"`,
    `data-object-role="${contract.objectRole ?? "secondary"}"`,
    `data-studio-slot="${studioSlot}"`,
    `data-render-target="${contract.renderTarget}"`,
    snapshotBoundary ? `data-snapshot-boundary="${snapshotBoundary}"` : "",
    `data-ownership-scope="${ownershipScope}"`,
    `data-forbidden-export="${forbidden}"`,
    `data-forbidden-interpretation="${forbidden}"`,
    'data-quality-intent="contract-first-export"',
    'data-layout-archetype="chart-with-insight-rail"',
    'data-visual-grammar="equity-research"',
    `data-export-contract="${htmlJsonAttribute(contract)}"`,
  ].filter(Boolean).join(" ");
}

function buildExportQualityTestTheme() {
  return {
    backgroundColor: "FFFFFF",
    surfaceFill: "FFFFFF",
    surfaceSecondary: "F6F6F6",
    dividerColor: "DDDDDD",
    accent: "305C63",
    textPrimary: "111111",
    textMuted: "666666",
    chartPalette: ["305C63"],
  };
}

function inspectSharedExportDataContractFixture(fixture: SharedExportDataContractFixture) {
  const contract = buildExportObjectContract({
    objectId: fixture.objectId,
    objectKind: fixture.objectKind,
    renderTarget: fixture.renderTarget,
    objectRole: "primary",
    dataContract: fixture.dataContract as ExportDataContract,
    ownsText: fixture.objectKind === "matrix",
    ownsShapes: fixture.objectKind === "matrix",
    ownsSvg: fixture.objectKind === "matrix",
    forbiddenInterpretation: fixture.forbiddenInterpretation ?? (fixture.objectKind === "matrix" ? ["native-table"] : []),
  });
  const document = new DOMParser().parseFromString(
    [
      '<section class="page" data-page-number="1" data-page-title="Fixture">',
      `<figure id="${fixture.objectId}" data-export-object-id="${fixture.objectId}" data-semantic-kind="${fixture.objectKind}" data-render-target="${fixture.renderTarget}" data-snapshot-boundary="object-root" data-ownership-scope="${fixture.objectKind === "matrix" ? "text,shape,svg" : ""}">`,
      fixture.objectKind === "native-table"
        ? "<table><tr><th>DOM metric</th><th>DOM value</th></tr><tr><td>DOM row</td><td>999</td></tr></table>"
        : "Contract fixture",
      "</figure>",
      "</section>",
    ].join(""),
    "text/html",
  );
  const pageElement = document.querySelector("section") as HTMLElement;
  const root = document.querySelector(`#${fixture.objectId}`) as HTMLElement;
  const table = document.querySelector("table") as HTMLElement | null;
  mockRect(pageElement, { left: 0, top: 0, width: 1600, height: 900 });
  mockRect(root, { left: 120, top: 100, width: 720, height: 420 });
  if (table) {
    mockRect(table, { left: 150, top: 130, width: 640, height: 240 });
  }

  const chartInspection =
    fixture.objectKind === "chart-visual" || fixture.objectKind === "native-chart" || fixture.objectKind === "matrix"
      ? inspectSemanticExportChartsForPage({
          pageElement,
          pageNumber: 1,
          expectedContracts: [contract],
        })
      : { warnings: [], chartNodes: [], objects: [] };
  const tableInspection =
    fixture.objectKind === "native-table"
      ? inspectSemanticExportTablesForPage({
          pageElement,
          pageNumber: 1,
          expectedContracts: [contract],
        })
      : { warnings: [], tableNodes: [], objects: [] };

  return {
    warnings: [...chartInspection.warnings, ...tableInspection.warnings],
    chartNodes: chartInspection.chartNodes,
    tableNodes: tableInspection.tableNodes,
  };
}

function strongChartContractFixtures(): Array<{
  type: Extract<ExportDataContract["type"], `chart-${string}`>;
  chartKind: NonNullable<HtmlChartSpec["kind"]>;
  dataContract: ExportDataContract;
}> {
  return [
    {
      type: "chart-bar",
      chartKind: "bar",
      dataContract: {
        type: "chart-bar",
        categories: ["Ads", "Games"],
        series: [{ name: "Revenue", values: [42, 58], color: "#305C63" }],
        axis: { y: { label: "RMB bn" } },
        colors: ["#305C63"],
      },
    },
    {
      type: "chart-stacked",
      chartKind: "stacked",
      dataContract: {
        type: "chart-stacked",
        categories: ["2025", "2026"],
        series: [
          { name: "Core", values: [35, 42], color: "#305C63" },
          { name: "Growth", values: [12, 18], color: "#C88A4A" },
        ],
        stackMode: "absolute",
        axis: { y: { label: "Revenue" } },
      },
    },
    {
      type: "chart-line",
      chartKind: "line",
      dataContract: {
        type: "chart-line",
        categories: ["Q1", "Q2", "Q3"],
        series: [{ name: "Margin", values: [18, 21, 24], color: "#4D7891" }],
        axis: { y: { label: "Margin %" } },
        markers: true,
      },
    },
    {
      type: "chart-combo",
      chartKind: "combo",
      dataContract: {
        type: "chart-combo",
        categories: ["2024", "2025"],
        barSeries: [{ name: "Revenue", values: [100, 118], color: "#305C63" }],
        lineSeries: [{ name: "Margin", values: [22, 26], color: "#C88A4A" }],
        primaryAxis: { label: "Revenue" },
        secondaryAxis: { label: "Margin" },
      },
    },
    {
      type: "chart-waterfall",
      chartKind: "waterfall",
      dataContract: {
        type: "chart-waterfall",
        steps: [
          { label: "Start", value: 100, kind: "start" },
          { label: "Growth", value: 18, kind: "increase", color: "#305C63" },
          { label: "Cost", value: -9, kind: "decrease", color: "#C88A4A" },
          { label: "End", value: 109, kind: "end" },
        ],
        axis: { y: { label: "Index" } },
      },
    },
    {
      type: "chart-bubble",
      chartKind: "bubble",
      dataContract: {
        type: "chart-bubble",
        points: [
          { label: "Ads", x: 0.72, y: 0.62, size: 34, color: "#305C63" },
          { label: "Cloud", x: 0.48, y: 0.42, size: 18, color: "#C88A4A" },
        ],
        xAxis: { label: "Growth" },
        yAxis: { label: "Margin" },
        sizeAxis: { label: "Revenue" },
      },
    },
  ];
}

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
  assert.ok(patchPhase?.owns.includes("repair-risk XML validation"));
  assert.ok(patchPhase?.forbids.includes("DOM inspection"));
});

test("pptx export separates universal algorithms from specialized adapters", () => {
  assert.ok(UNIVERSAL_PPTX_EXPORT_ALGORITHMS.includes("ownership graph"));
  assert.ok(UNIVERSAL_PPTX_EXPORT_ALGORITHMS.includes("color/theme normalization"));
  assert.ok(SPECIALIZED_PPTX_EXPORT_ADAPTERS.includes("matrix-vs-table disambiguation"));
  assert.ok(SPECIALIZED_PPTX_EXPORT_ADAPTERS.includes("bubble/waterfall/combo visual chart adapters"));
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

test("package patch phase repairs zero-size extents in notes master boilerplate", async () => {
  const zip = new JSZip();
  zip.file(
    "ppt/notesMasters/notesMaster1.xml",
    [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<p:notesMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
      '<p:cSld><p:spTree><p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm></p:spPr></p:sp></p:spTree></p:cSld>',
      "</p:notesMaster>",
    ].join(""),
  );
  zip.file(
    "ppt/slides/slide1.xml",
    [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
      '<p:cSld><p:spTree><p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1200" cy="0"/></a:xfrm></p:spPr></p:sp></p:spTree></p:cSld>',
      "</p:sld>",
    ].join(""),
  );
  const arrayBuffer = await zip.generateAsync({ type: "arraybuffer" });
  const patched = await patchPptxPackageXml({
    arrayBuffer,
    document: {
      version: 1,
      layout: PPT_LAYOUT,
      slides: [],
      diagnostics: [],
      warnings: [],
    },
  });
  const patchedZip = await JSZip.loadAsync(await patched.arrayBuffer());
  const notesMasterXml = await patchedZip.file("ppt/notesMasters/notesMaster1.xml")?.async("string");
  const slideXml = await patchedZip.file("ppt/slides/slide1.xml")?.async("string");

  assert.match(notesMasterXml ?? "", /<a:ext cx="1" cy="1"\/>/);
  assert.match(slideXml ?? "", /<a:ext cx="1200" cy="1"\/>/);
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
        exportDataContractType: "matrix",
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
        message: "Visual chart snapshot target was not produced.",
        exportObjectId: "p1-primary-chart",
        exportObjectKind: "chart-visual",
        exportRenderTarget: "visual-snapshot",
      },
      {
        code: "export-data-contract-invalid",
        pageNumber: 1,
        message: "Visual chart contract metadata was invalid.",
        exportObjectId: "p1-primary-chart",
        exportObjectKind: "chart-visual",
        exportRenderTarget: "visual-snapshot",
        exportDataContractType: "chart-bar",
      },
      {
        code: "unlabeled-fallback-used",
        pageNumber: 1,
        message: "Legacy fallback was used.",
        sourceKind: "chart",
      },
    ],
  });
  const report = buildPptxExportQualityReport(document);

  assert.equal(report.exportContracts.candidateCount, 1);
  assert.equal(report.exportContracts.violationCount, 3);
  assert.equal(report.exportContracts.strongDataContractCount, 1);
  assert.equal(report.exportContracts.invalidDataContractCount, 1);
  assert.equal(report.exportContracts.unlabeledFallbackCount, 1);
  assert.equal(report.exportContracts.blockedCoreVisualCount, 2);
  assert.equal(report.exportContracts.contractIssueCount, 3);
  assert.equal(
    report.exportContracts.contractIssues.some(
      (issue) =>
        issue.objectId === "p1-primary-chart" &&
        issue.code === "export-contract-render-target-missing" &&
        issue.repairTier === "object-model" &&
        issue.missingFields.includes("visual-snapshot"),
    ),
    true,
  );
  assert.equal(report.exportContracts.byKind.matrix, 2);
  assert.equal(report.exportContracts.byKind["chart-visual"], 2);
  assert.equal(report.exportContracts.byDataContractType.matrix, 1);
  assert.equal(report.exportContracts.byDataContractType["chart-bar"], 1);
  assert.equal(report.deterministicConsumer.contractObjects, 1);
  assert.equal(report.deterministicConsumer.legacyFallbacks, 1);
  assert.equal(report.deterministicConsumer.blockedInterpretations, 1);
  assert.equal(report.deterministicConsumer.contractMismatches, 3);
  assert.equal(report.pages[0]?.exportContractCandidateCount, 1);
  assert.equal(report.pages[0]?.exportContractViolationCount, 3);
});

test("quality report summarizes page archetype distribution and repeated runs", () => {
  const slides = Array.from({ length: 4 }, (_item, index) => ({
    pageNumber: index + 1,
    title: `Page ${index + 1}`,
    backgroundColor: "FFFFFF",
    theme: buildExportQualityTestTheme(),
    textNodes: [],
    shapeNodes: [],
    chartNodes: [],
    tableNodes: [],
  }));
  const document = buildPptxExportDocument({
    slides,
    diagnostics: [
      {
        code: "page-archetype-detected",
        pageNumber: 1,
        message: "Page archetype detected.",
        pageLayoutArchetype: "chart-with-insight-rail",
        pageVisualGrammar: "equity-research",
      },
      {
        code: "page-archetype-detected",
        pageNumber: 2,
        message: "Page archetype detected.",
        pageLayoutArchetype: "chart-with-insight-rail",
        pageVisualGrammar: "equity-research",
      },
      {
        code: "page-archetype-detected",
        pageNumber: 3,
        message: "Page archetype detected.",
        pageLayoutArchetype: "chart-with-insight-rail",
        pageVisualGrammar: "equity-research",
      },
      {
        code: "page-archetype-detected",
        pageNumber: 4,
        message: "Page archetype detected.",
        pageLayoutArchetype: "matrix-first",
        pageVisualGrammar: "consulting",
      },
    ],
  });
  const report = buildPptxExportQualityReport(document);

  assert.equal(report.pageArchetypes.byArchetype["chart-with-insight-rail"], 3);
  assert.equal(report.pageArchetypes.byArchetype["matrix-first"], 1);
  assert.equal(report.pageArchetypes.repeatedRunLength, 3);
  assert.equal(report.pageArchetypes.repeatedRunWarningCount, 1);
  assert.equal(
    report.pages[0]?.issues.some(
      (issue) =>
        issue.code === "page-archetype-repeated" &&
        issue.severity === "info" &&
        issue.countsAgainstQuality === false,
    ),
    true,
  );
});

test("declared page archetype without DOM page IR metadata is a soft export warning", () => {
  if (typeof DOMParser === "undefined") {
    return;
  }
  const contract = buildExportObjectContract({
    objectId: "p1-primary-matrix",
    objectKind: "matrix",
    renderTarget: "editable-shapes",
    objectRole: "primary",
    forbiddenInterpretation: ["native-table"],
  });
  const pageContract: PageExportContract = {
    pageNumber: 1,
    pageStory: "Matrix page.",
    primaryVisualObject: "matrix",
    primaryObjectId: contract.objectId,
    layoutArchetype: "matrix-first",
    visualGrammar: "consulting",
    composition: "center-canvas-annotation-ring",
    density: "executive",
    objects: [contract],
  };
  const document = new DOMParser().parseFromString(
    [
      '<section class="page" data-page-number="1" data-page-title="Matrix">',
      `<main id="${contract.objectId}" data-export-object-id="${contract.objectId}" data-semantic-kind="matrix" data-render-target="editable-shapes" data-snapshot-boundary="object-root">Matrix</main>`,
      "</section>",
    ].join(""),
    "text/html",
  );
  const pageElement = document.querySelector("section") as HTMLElement;
  const root = document.querySelector(`#${contract.objectId}`) as HTMLElement;
  mockRect(pageElement, { left: 0, top: 0, width: 1600, height: 900 });
  mockRect(root, { left: 100, top: 90, width: 760, height: 520 });

  const inspection = inspectPptxExportAnnotationsForPage({
    pageElement,
    pageNumber: 1,
    expectedContracts: [contract],
    expectedPageContract: pageContract,
  });
  const exportDocument = buildPptxExportDocument({
    slides: [
      {
        pageNumber: 1,
        title: "Matrix",
        backgroundColor: "FFFFFF",
        theme: buildExportQualityTestTheme(),
        textNodes: inspection.textNodes,
        shapeNodes: inspection.shapeNodes,
        chartNodes: inspection.chartNodes,
        tableNodes: inspection.tableNodes,
      },
    ],
    diagnostics: inspection.warnings,
  });
  const report = buildPptxExportQualityReport(exportDocument);

  assert.equal(
    inspection.warnings.some((warning) => warning.code === "page-ir-metadata-missing"),
    true,
  );
  assert.equal(report.pageArchetypes.metadataWarningCount, 1);
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
    dataContract: {
      type: "matrix",
      axes: {
        x: { label: "Impact" },
        y: { label: "Readiness" },
      },
      items: [
        { label: "Core", x: 0.7, y: 0.6 },
      ],
      renderTarget: "editable-shapes",
    },
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

test("semantic export contracts count primary and secondary DOM metadata separately", () => {
  if (typeof DOMParser === "undefined") {
    return;
  }
  const primary = buildExportObjectContract({
    objectId: "p1-primary-matrix",
    objectKind: "matrix",
    renderTarget: "editable-shapes",
    objectRole: "primary",
    forbiddenInterpretation: ["native-table"],
  });
  const secondary = buildExportObjectContract({
    objectId: "p1-secondary-note",
    objectKind: "text",
    renderTarget: "editable-text",
    objectRole: "secondary",
    ownsShapes: false,
    ownsSvg: false,
  });
  const document = new DOMParser().parseFromString(
    [
      '<section class="page" data-page-number="1" data-page-title="Matrix">',
      `<main data-export-object-id="${primary.objectId}" data-semantic-kind="matrix" data-render-target="editable-shapes" data-snapshot-boundary="object-root" data-ownership-scope="text,shape,svg" data-forbidden-export="native-table">Matrix</main>`,
      `<aside data-export-object-id="${secondary.objectId}" data-semantic-kind="text" data-render-target="editable-text" data-ownership-scope="text">Note</aside>`,
      "</section>",
    ].join(""),
    "text/html",
  );
  const pageElement = document.querySelector("section") as HTMLElement;
  const matrixElement = document.querySelector("main") as HTMLElement;
  const inspection = inspectSemanticExportObjectForElement({
    pageElement,
    element: matrixElement,
    pageNumber: 1,
    expectedContracts: [primary, secondary],
  });
  const exportDocument = buildPptxExportDocument({
    slides: [
      {
        pageNumber: 1,
        title: "Matrix",
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
    diagnostics: inspection.warnings,
  });
  const report = buildPptxExportQualityReport(exportDocument);

  assert.equal(report.exportContracts.candidateCount, 2);
  assert.equal(report.exportContracts.byKind.matrix, 1);
  assert.equal(report.exportContracts.byKind.text, 1);
  assert.equal(report.pages[0]?.exportContractCandidateCount, 2);
});

test("secondary export contract without a clear root warns without page-root materialization", () => {
  if (typeof DOMParser === "undefined") {
    return;
  }
  const primary = buildExportObjectContract({
    objectId: "p1-primary-matrix",
    objectKind: "matrix",
    renderTarget: "editable-shapes",
    objectRole: "primary",
  });
  const secondary = buildExportObjectContract({
    objectId: "p1-secondary-note",
    objectKind: "text",
    renderTarget: "editable-text",
    objectRole: "secondary",
    ownsShapes: false,
    ownsSvg: false,
  });
  const document = new DOMParser().parseFromString(
    `<section class="page" data-page-number="1" data-page-title="Matrix"><main data-export-object-id="${primary.objectId}" data-semantic-kind="matrix" data-render-target="editable-shapes" data-snapshot-boundary="object-root">Matrix</main></section>`,
    "text/html",
  );
  const pageElement = document.querySelector("section") as HTMLElement;
  const mainElement = document.querySelector("main") as HTMLElement;
  const inspection = inspectSemanticExportObjectForElement({
    pageElement,
    element: mainElement,
    pageNumber: 1,
    expectedContracts: [primary, secondary],
  });

  assert.equal(
    inspection.warnings.some(
      (warning) =>
        warning.code === "export-contract-missing" &&
        warning.exportObjectId === "p1-secondary-note",
    ),
    true,
  );
  assert.equal(
    inspection.warnings.some(
      (warning) =>
        warning.code === "export-contract-detected" &&
        warning.exportObjectId === "p1-secondary-note",
    ),
    false,
  );
});

test("secondary native table does not turn the primary matrix into a native table", () => {
  if (typeof DOMParser === "undefined") {
    return;
  }
  const primary = buildExportObjectContract({
    objectId: "p1-primary-matrix",
    objectKind: "matrix",
    renderTarget: "editable-shapes",
    objectRole: "primary",
    forbiddenInterpretation: ["native-table"],
  });
  const secondary = buildExportObjectContract({
    objectId: "p1-secondary-table",
    objectKind: "native-table",
    renderTarget: "native-table",
    objectRole: "secondary",
    ownsText: false,
    ownsShapes: false,
    ownsSvg: false,
  });
  const document = new DOMParser().parseFromString(
    [
      '<section class="page" data-page-number="1" data-page-title="Matrix and table">',
      `<main id="${primary.objectId}" data-export-object-id="${primary.objectId}" data-semantic-kind="matrix" data-render-target="editable-shapes" data-snapshot-boundary="object-root" data-ownership-scope="text,shape,svg" data-forbidden-export="native-table">`,
      '<table id="matrix-markup"><tr><th>Zone</th><th>Signal</th></tr><tr><td>Core</td><td>High</td></tr></table>',
      "</main>",
      `<aside id="${secondary.objectId}" data-export-object-id="${secondary.objectId}" data-semantic-kind="native-table" data-render-target="native-table" data-snapshot-boundary="object-root" data-ownership-scope="">`,
      '<table id="secondary-table"><tr><th>Metric</th><th>Value</th></tr><tr><td>Run-rate</td><td>42</td></tr></table>',
      "</aside>",
      "</section>",
    ].join(""),
    "text/html",
  );
  const pageElement = document.querySelector("section") as HTMLElement;
  const primaryRoot = document.querySelector(`#${primary.objectId}`) as HTMLElement;
  const secondaryRoot = document.querySelector(`#${secondary.objectId}`) as HTMLElement;
  const matrixTable = document.querySelector("#matrix-markup") as HTMLElement;
  const secondaryTable = document.querySelector("#secondary-table") as HTMLElement;
  mockRect(pageElement, { left: 0, top: 0, width: 1600, height: 900 });
  mockRect(primaryRoot, { left: 80, top: 90, width: 720, height: 520 });
  mockRect(secondaryRoot, { left: 920, top: 120, width: 420, height: 260 });
  mockRect(matrixTable, { left: 120, top: 140, width: 620, height: 360 });
  mockRect(secondaryTable, { left: 940, top: 150, width: 360, height: 180 });

  const inspection = inspectSemanticExportTablesForPage({
    pageElement,
    pageNumber: 1,
    expectedContracts: [primary, secondary],
  });

  assert.deepEqual(
    inspection.objects.map((object) => [object.objectId, object.objectKind, object.renderTarget]),
    [
      ["p1-primary-matrix", "matrix", "editable-shapes"],
      ["p1-secondary-table", "native-table", "native-table"],
    ],
  );
  assert.equal(inspection.tableNodes.length, 1);
  assert.equal(inspection.tableNodes[0]?.exportObjectId, "p1-secondary-table");
  assert.equal(inspection.tableNodes[0]?.rows[0]?.[0], "Metric");
  assert.equal(
    inspection.warnings.some(
      (warning) =>
        warning.code === "export-contract-forbidden-violation" &&
        warning.exportObjectId === "p1-primary-matrix",
    ),
    true,
  );
});

test("strong chart data contracts produce visual snapshot chart nodes without DOM inference", () => {
  if (typeof DOMParser === "undefined") {
    return;
  }
  for (const fixture of strongChartContractFixtures()) {
    const objectId = `p1-${fixture.type}`;
    const contract = buildExportObjectContract({
      objectId,
      objectKind: "chart-visual",
      renderTarget: "visual-snapshot",
      objectRole: "primary",
      dataContract: fixture.dataContract,
      ownsText: false,
      ownsShapes: false,
      ownsSvg: false,
    });
    const document = new DOMParser().parseFromString(
      [
        '<section class="page" data-page-number="1" data-page-title="Chart">',
        `<figure id="${objectId}" data-export-object-id="${objectId}" data-semantic-kind="chart-visual" data-render-target="visual-snapshot" data-snapshot-boundary="object-root" data-ownership-scope="">`,
        '<div data-html-visual-kind="chart-frame">Visible chart layer</div>',
        "</figure>",
        "</section>",
      ].join(""),
      "text/html",
    );
    const pageElement = document.querySelector("section") as HTMLElement;
    const root = document.querySelector(`#${objectId}`) as HTMLElement;
    mockRect(pageElement, { left: 0, top: 0, width: 1600, height: 900 });
    mockRect(root, { left: 120, top: 100, width: 720, height: 420 });

    const inspection = inspectSemanticExportChartsForPage({
      pageElement,
      pageNumber: 1,
      expectedContracts: [contract],
    });
    const chart = inspection.chartNodes[0];
    assert.equal(inspection.chartNodes.length, 1, fixture.type);
    assert.equal(chart?.exportObjectId, objectId, fixture.type);
    assert.equal(chart?.chartKind, fixture.chartKind, fixture.type);
    assert.equal(chart?.chartContract?.source, "data-contract", fixture.type);
    assert.equal(chart?.renderMode, "image", fixture.type);
    assert.equal(chart?.fallbackAsset?.reason, "visual-chart-exported", fixture.type);
    assert.equal(
      inspection.warnings.some((warning) => warning.code === "unlabeled-fallback-used"),
      false,
      fixture.type,
    );
  }
});

test("chart-visual root with Phase 2 attrs still exports as a visual snapshot", () => {
  if (typeof DOMParser === "undefined") {
    return;
  }
  const contract = buildExportObjectContract({
    objectId: "p1-phase2-chart",
    objectKind: "chart-visual",
    renderTarget: "visual-snapshot",
    objectRole: "primary",
    dataContract: {
      type: "chart-bar",
      categories: ["Contract A", "Contract B"],
      series: [{ name: "Contract", values: [7, 11] }],
    },
    ownsText: false,
    ownsShapes: false,
    ownsSvg: false,
  });
  const legacySpec: HtmlChartSpec = {
    kind: "line",
    title: "Legacy child",
    subtitle: "",
    insight: "",
    unit: "",
    categories: ["Legacy"],
    series: [{ id: "legacy", label: "Legacy", values: [999] }],
  };
  const document = new DOMParser().parseFromString(
    [
      '<section class="page" data-page-number="1" data-page-title="Chart">',
      `<figure id="${contract.objectId}" ${exportContractRootAttrs(contract)}>`,
      `<div data-html-chart-spec="${htmlJsonAttribute(legacySpec)}">Legacy child chart</div>`,
      "</figure>",
      "</section>",
    ].join(""),
    "text/html",
  );
  const pageElement = document.querySelector("section") as HTMLElement;
  const root = document.querySelector(`#${contract.objectId}`) as HTMLElement;
  mockRect(pageElement, { left: 0, top: 0, width: 1600, height: 900 });
  mockRect(root, { left: 120, top: 100, width: 720, height: 420 });

  const inspection = inspectSemanticExportChartsForPage({
    pageElement,
    pageNumber: 1,
  });
  const chart = inspection.chartNodes[0];

  assert.equal(inspection.chartNodes.length, 1);
  assert.equal(chart?.exportObjectId, contract.objectId);
  assert.equal(chart?.renderMode, "image");
  assert.equal(chart?.fallbackAsset?.reason, "visual-chart-exported");
  assert.deepEqual(chart?.labels, ["Contract A", "Contract B"]);
  assert.equal(
    inspection.warnings.some((warning) => warning.code === "unlabeled-fallback-used"),
    false,
  );
});

test("contracted visual snapshots require an explicit snapshot boundary", () => {
  if (typeof DOMParser === "undefined") {
    return;
  }
  const contract = buildExportObjectContract({
    objectId: "p1-boundary-chart",
    objectKind: "chart-visual",
    renderTarget: "visual-snapshot",
    objectRole: "primary",
    dataContract: {
      type: "chart-bar",
      categories: ["A", "B"],
      series: [{ name: "Series", values: [1, 2] }],
    },
    ownsText: false,
    ownsShapes: false,
    ownsSvg: false,
  });
  const document = new DOMParser().parseFromString(
    [
      '<section class="page" data-page-number="1" data-page-title="Chart">',
      `<figure id="${contract.objectId}" data-export-object-id="${contract.objectId}" data-semantic-kind="chart-visual" data-render-target="visual-snapshot" data-ownership-scope="">Visible chart</figure>`,
      "</section>",
    ].join(""),
    "text/html",
  );
  const pageElement = document.querySelector("section") as HTMLElement;
  const root = document.querySelector(`#${contract.objectId}`) as HTMLElement;
  mockRect(pageElement, { left: 0, top: 0, width: 1600, height: 900 });
  mockRect(root, { left: 120, top: 100, width: 720, height: 420 });

  const inspection = inspectSemanticExportChartsForPage({
    pageElement,
    pageNumber: 1,
    expectedContracts: [contract],
  });

  assert.equal(inspection.chartNodes.length, 0);
  assert.equal(
    inspection.warnings.some(
      (warning) =>
        warning.code === "visual-chart-snapshot-missing" &&
        warning.exportObjectId === contract.objectId &&
        /data-snapshot-boundary/.test(warning.message),
    ),
    true,
  );
});

test("fallback detectors do not inspect descendants inside semantic export roots", () => {
  if (typeof DOMParser === "undefined") {
    return;
  }
  const contract = buildExportObjectContract({
    objectId: "p1-secondary-analysis",
    objectKind: "text",
    renderTarget: "editable-text",
    objectRole: "secondary",
    dataContract: null,
    ownsText: true,
    ownsShapes: false,
    ownsSvg: false,
  });
  const childChartSpec: HtmlChartSpec = {
    kind: "bar",
    title: "Child chart",
    subtitle: "",
    insight: "",
    unit: "",
    categories: ["A", "B"],
    series: [{ id: "child", label: "Child", values: [1, 2] }],
  };
  const document = new DOMParser().parseFromString(
    [
      '<section class="page" data-page-number="1" data-page-title="Semantic root">',
      `<article id="${contract.objectId}" ${exportContractRootAttrs(contract)}>`,
      '<table id="inner-table"><tr><th>Metric</th><th>Value</th></tr><tr><td>Legacy</td><td>999</td></tr></table>',
      `<div id="inner-chart" data-html-chart-spec="${htmlJsonAttribute(childChartSpec)}">Legacy chart</div>`,
      "</article>",
      "</section>",
    ].join(""),
    "text/html",
  );
  const pageElement = document.querySelector("section") as HTMLElement;
  const root = document.querySelector(`#${contract.objectId}`) as HTMLElement;
  const table = document.querySelector("#inner-table") as HTMLElement;
  const chart = document.querySelector("#inner-chart") as HTMLElement;
  mockRect(pageElement, { left: 0, top: 0, width: 1600, height: 900 });
  mockRect(root, { left: 100, top: 90, width: 760, height: 520 });
  mockRect(table, { left: 130, top: 120, width: 360, height: 180 });
  mockRect(chart, { left: 520, top: 120, width: 320, height: 220 });

  const inspection = inspectPptxExportAnnotationsForPage({
    pageElement,
    pageNumber: 1,
    expectedContracts: [contract],
  });

  assert.equal(inspection.chartNodes.length, 0);
  assert.equal(inspection.tableNodes.length, 0);
  assert.equal(
    inspection.warnings.some((warning) => warning.code === "unlabeled-fallback-used"),
    false,
  );
});

test("legacy chart frames snapshot the rendered plot and leave surrounding text native", () => {
  if (typeof DOMParser === "undefined") {
    return;
  }
  const chartSpec: HtmlChartSpec = {
    kind: "line",
    title: "",
    subtitle: "",
    insight: "",
    unit: "",
    categories: ["Y1", "Y2", "Y3"],
    series: [{ id: "series", label: "Demand", values: [100, 120, 140] }],
  };
  const document = new DOMParser().parseFromString(
    [
      '<section class="page" data-page-number="1" data-page-title="Legacy visual chart">',
      '<div id="outer-frame" data-html-visual-id="visual-1-chart-frame-4" data-html-visual-kind="chart-frame" data-export-role="chart-frame" style="position:absolute;left:50px;top:250px;width:865px;height:508px;background:#fcfaf6;border:1px solid #dbd1c2;">',
      '<div data-html-block-id="block-title" data-html-block-kind="heading" data-html-fit-role="content">Illustrative demand pathways show divergence</div>',
      '<div id="plot" data-html-visual-id="visual-1-surface-5" data-html-visual-kind="surface" data-export-role="surface" style="position:relative;margin-top:18px;width:760px;height:340px;border-left:2px solid #a9a093;border-bottom:2px solid #a9a093;">',
      '<div data-html-block-id="axis-y1" data-html-block-kind="eyebrow" data-html-fit-role="content" style="position:absolute;bottom:-30px;left:2%;">Y1</div>',
      `<svg id="line-chart" viewBox="0 0 760 340" width="100%" height="100%" data-html-module-kind="chart" data-html-visual-kind="chart-frame" data-html-chart-spec="${htmlJsonAttribute(chartSpec)}" style="position:absolute;left:0;top:0;overflow:visible;">`,
      '<line x1="0" y1="10" x2="760" y2="10" stroke="#e7ded2"></line>',
      '<line x1="0" y1="100" x2="760" y2="100" stroke="#e7ded2"></line>',
      '<polyline points="16,275 148,255 282,218" fill="none" stroke="#b55638" stroke-width="4"></polyline>',
      "</svg>",
      "</div>",
      "</div>",
      '<div id="hidden-frame" data-html-canvas-placeholder="true" style="visibility:hidden;position:absolute;left:50px;top:250px;width:865px;height:508px;">',
      `<div data-html-chart-spec="${htmlJsonAttribute(chartSpec)}">Hidden duplicate chart</div>`,
      "</div>",
      "</section>",
    ].join(""),
    "text/html",
  );
  const pageElement = document.querySelector("section") as HTMLElement;
  const outerFrame = document.querySelector("#outer-frame") as HTMLElement;
  const plot = document.querySelector("#plot") as HTMLElement;
  const svg = document.querySelector("#line-chart") as HTMLElement;
  const hiddenFrame = document.querySelector("#hidden-frame") as HTMLElement;
  const hiddenChart = hiddenFrame.querySelector("[data-html-chart-spec]") as HTMLElement;
  mockRect(pageElement, { left: 0, top: 0, width: 1600, height: 900 });
  mockRect(outerFrame, { left: 50, top: 250, width: 865, height: 508 });
  mockRect(plot, { left: 72, top: 310, width: 760, height: 340 });
  mockRect(svg, { left: 72, top: 310, width: 760, height: 340 });
  mockRect(hiddenFrame, { left: 50, top: 250, width: 865, height: 508 });
  mockRect(hiddenChart, { left: 72, top: 310, width: 760, height: 340 });

  const inspection = inspectPptxExportAnnotationsForPage({ pageElement, pageNumber: 1 });
  const chart = inspection.chartNodes[0];

  assert.equal(inspection.chartNodes.length, 1);
  assert.equal(chart?.sourceElementId, "visual-1-surface-5");
  assert.equal(chart?.renderMode, "image");
  assert.equal(chart?.fallbackAsset?.reason, "visual-chart-exported");
  assert.equal(chart?.w, Number((760 / (1600 / 13.333)).toFixed(3)));
  assert.equal(
    inspection.textNodes.some((node) => node.text.includes("Illustrative demand pathways")),
    true,
  );
  assert.equal(
    inspection.textNodes.some((node) => node.text === "Y1" || node.text.includes("Hidden duplicate")),
    false,
  );
});

test("DOM chart frames stay authoritative when scene chart order is shuffled", () => {
  if (typeof DOMParser === "undefined") {
    return;
  }
  const waterfallSpec: HtmlChartSpec = {
    kind: "waterfall",
    title: "Waterfall DOM",
    subtitle: "",
    insight: "",
    unit: "",
    categories: ["Start", "Delta", "End"],
    series: [{ id: "series", label: "Bridge", values: [10, -2, 8] }],
  };
  const lineSpec: HtmlChartSpec = {
    kind: "line",
    title: "Line DOM",
    subtitle: "",
    insight: "",
    unit: "",
    categories: ["Q1", "Q2", "Q3"],
    series: [{ id: "series", label: "Trend", values: [4, 5, 8] }],
  };
  const bubbleSpec: HtmlChartSpec = {
    kind: "bubble",
    title: "Bubble DOM",
    subtitle: "",
    insight: "",
    unit: "",
    xLabel: "Reach",
    yLabel: "Margin",
    sizeLabel: "Revenue",
    points: [
      { id: "a", label: "A", x: 1, y: 2, size: 4 },
      { id: "b", label: "B", x: 2, y: 3, size: 5 },
    ],
  };
  const document = new DOMParser().parseFromString(
    [
      '<section class="page" data-page-number="1" data-page-title="Charts">',
      `<figure id="waterfall-frame" data-html-visual-id="waterfall-frame" data-html-visual-kind="chart-frame" data-html-chart-spec="${htmlJsonAttribute(waterfallSpec)}">Waterfall chart</figure>`,
      `<figure id="line-frame" data-html-visual-id="line-frame" data-html-visual-kind="chart-frame" data-html-chart-spec="${htmlJsonAttribute(lineSpec)}">Line chart</figure>`,
      `<figure id="bubble-frame" data-html-visual-id="bubble-frame" data-html-visual-kind="chart-frame" data-html-chart-spec="${htmlJsonAttribute(bubbleSpec)}">Bubble chart</figure>`,
      "</section>",
    ].join(""),
    "text/html",
  );
  const pageElement = document.querySelector("section") as HTMLElement;
  const waterfallFrame = document.querySelector("#waterfall-frame") as HTMLElement;
  const lineFrame = document.querySelector("#line-frame") as HTMLElement;
  const bubbleFrame = document.querySelector("#bubble-frame") as HTMLElement;
  mockRect(pageElement, { left: 0, top: 0, width: 1600, height: 900 });
  mockRect(waterfallFrame, { left: 80, top: 120, width: 420, height: 300 });
  mockRect(lineFrame, { left: 580, top: 120, width: 420, height: 300 });
  mockRect(bubbleFrame, { left: 1080, top: 120, width: 420, height: 300 });

  const scene: SlideScene = {
    width: 1600,
    height: 900,
    background: "#ffffff",
    objects: [
      {
        id: "scene-bubble",
        kind: "chart",
        chartKind: "bar",
        title: "Bubble scene",
        x: 1080,
        y: 120,
        w: 420,
        h: 300,
        series: [],
        chartData: {
          categories: ["Wrong"],
          series: [{ name: "Scene", values: [99] }],
        },
      },
      {
        id: "scene-waterfall",
        kind: "chart",
        chartKind: "waterfall",
        title: "Waterfall scene",
        x: 80,
        y: 120,
        w: 420,
        h: 300,
        series: [],
        chartData: {
          categories: ["Wrong"],
          series: [{ name: "Scene", values: [99] }],
        },
      },
      {
        id: "scene-line",
        kind: "chart",
        chartKind: "line",
        title: "Line scene",
        x: 580,
        y: 120,
        w: 420,
        h: 300,
        series: [],
        chartData: {
          categories: ["Wrong"],
          series: [{ name: "Scene", values: [99] }],
        },
      },
    ],
  };

  const inspection = inspectSemanticExportChartsForPage({
    pageElement,
    pageNumber: 1,
    scene,
  });

  assert.deepEqual(
    inspection.chartNodes.map((node) => node.chartKind),
    ["waterfall", "line", "bubble"],
  );
  assert.deepEqual(
    inspection.chartNodes.map((node) => node.sourceElementId),
    ["waterfall-frame", "line-frame", "bubble-frame"],
  );
  assert.deepEqual(
    inspection.chartNodes.map((node) => node.title),
    ["Waterfall DOM", "Line DOM", "Bubble DOM"],
  );
  const snapshotIds = inspection.chartNodes.flatMap((node) => {
    const asset = node.fallbackAsset;
    return asset?.kind === "dom-snapshot" ? [asset.snapshotId] : [];
  });
  assert.equal(snapshotIds.length, 3);
  const serializedHtml = document.documentElement.outerHTML;
  for (const snapshotId of snapshotIds) {
    assert.match(serializedHtml, new RegExp(`data-ppt-snapshot-id="${snapshotId}"`));
  }
  assert.equal(
    inspection.warnings.some((warning) => warning.code === "chart-dom-scene-mismatch"),
    true,
  );
});

test("deterministic data contract normalizer accepts metadata aliases", () => {
  if (typeof DOMParser === "undefined") {
    return;
  }
  const objectId = "p1-primary-bar";
  const looseContract = {
    family: "bar",
    categories: ["Games", "Ads"],
    series: [{ name: "Growth", data: [7.8, 12] }],
    valueAxis: { title: "Growth rate" },
  };
  const document = new DOMParser().parseFromString(
    [
      '<section class="page" data-page-number="1" data-page-title="Chart">',
      `<figure id="${objectId}" data-export-object-id="${objectId}" data-export-object-kind="bar-chart" data-render-target="pptx-native-chart" data-snapshot-boundary="object-root" data-ownership-scope="chart-container,chart-labels,chart-axis" data-forbidden-interpretation="table,card-wall" data-quality-intent="contract-first-export" data-export-contract="${htmlJsonAttribute(looseContract)}">`,
      '<div>Visible chart layer</div>',
      "</figure>",
      "</section>",
    ].join(""),
    "text/html",
  );
  const pageElement = document.querySelector("section") as HTMLElement;
  const root = document.querySelector(`#${objectId}`) as HTMLElement;
  mockRect(pageElement, { left: 0, top: 0, width: 1600, height: 900 });
  mockRect(root, { left: 120, top: 100, width: 720, height: 420 });

  const inspection = inspectSemanticExportChartsForPage({
    pageElement,
    pageNumber: 1,
  });
  const chart = inspection.chartNodes[0];

  assert.equal(inspection.chartNodes.length, 1);
  assert.deepEqual(inspection.objects[0], {
    objectId,
    objectKind: "chart-visual",
    renderTarget: "visual-snapshot",
  });
  assert.equal(chart?.exportObjectId, objectId);
  assert.equal(chart?.chartKind, "bar");
  assert.equal(chart?.chartContract?.source, "data-contract");
  assert.equal(chart?.renderMode, "image");
  assert.equal(chart?.fallbackAsset?.reason, "visual-chart-exported");
  assert.deepEqual(chart?.labels, ["Games", "Ads"]);
  assert.deepEqual(chart?.series[0]?.values, [7.8, 12]);
  assert.equal(chart?.yAxisTitle, "Growth rate");
  assert.equal(
    inspection.warnings.some((warning) => warning.code === "export-data-contract-minimum-data-missing"),
    false,
  );
});

test("semantic text roots block inner chart fallback recognition", () => {
  if (typeof DOMParser === "undefined") {
    return;
  }
  const textContract = buildExportObjectContract({
    objectId: "p1-text-object",
    objectKind: "text",
    renderTarget: "editable-text",
    objectRole: "primary",
    dataContract: null,
    ownsShapes: false,
    ownsSvg: false,
    forbiddenInterpretation: ["native-chart", "native-table"],
  });
  const chartPayload = {
    kind: "bar",
    categories: ["A", "B"],
    series: [{ name: "Series", values: [1, 2] }],
  };
  const document = new DOMParser().parseFromString(
    [
      '<section class="page" data-page-number="1" data-page-title="Text object">',
      `<main id="${textContract.objectId}" ${exportContractRootAttrs(textContract)}>`,
      `<figure id="inner-chart" data-export-chart="${htmlJsonAttribute(chartPayload)}">Fallback bait</figure>`,
      "</main>",
      "</section>",
    ].join(""),
    "text/html",
  );
  const pageElement = document.querySelector("section") as HTMLElement;
  const root = document.querySelector(`#${textContract.objectId}`) as HTMLElement;
  const innerChart = document.querySelector("#inner-chart") as HTMLElement;
  mockRect(pageElement, { left: 0, top: 0, width: 1600, height: 900 });
  mockRect(root, { left: 100, top: 100, width: 820, height: 520 });
  mockRect(innerChart, { left: 140, top: 150, width: 620, height: 320 });

  const inspection = inspectSemanticExportChartsForPage({
    pageElement,
    pageNumber: 1,
    expectedContracts: [textContract],
  });

  assert.equal(inspection.chartNodes.length, 0);
  assert.equal(
    inspection.warnings.some(
      (warning) =>
        warning.code === "export-contract-forbidden-violation" &&
        warning.exportObjectId === textContract.objectId &&
        /native-chart/.test(warning.message),
    ),
    true,
  );
  assert.equal(
    inspection.warnings.some((warning) => warning.code === "unlabeled-fallback-used"),
    false,
  );
});

test("shared strong data contract fixtures mirror UI export validation", () => {
  if (typeof DOMParser === "undefined") {
    return;
  }
  const fixtures = readSharedExportDataContractFixtures();
  for (const fixture of fixtures.valid) {
    const inspection = inspectSharedExportDataContractFixture(fixture);
    const dataContractType = (fixture.dataContract as ExportDataContract).type;
    assert.equal(
      inspection.warnings.some((warning) => warning.code.startsWith("export-data-contract-")),
      false,
      fixture.name,
    );
    if (fixture.objectKind === "native-table") {
      assert.equal(inspection.tableNodes.length, 1, fixture.name);
      continue;
    }
    assert.equal(inspection.chartNodes.length, 1, fixture.name);
    assert.equal(inspection.chartNodes[0]?.chartContract?.source, "data-contract", fixture.name);
    if (dataContractType === "matrix") {
      assert.equal(inspection.chartNodes[0]?.fallbackMode, "native-matrix-shapes", fixture.name);
    } else if (dataContractType.startsWith("chart-")) {
      assert.equal(inspection.chartNodes[0]?.renderMode, "image", fixture.name);
      assert.equal(inspection.chartNodes[0]?.fallbackAsset?.reason, "visual-chart-exported", fixture.name);
    }
  }

  for (const fixture of fixtures.invalid) {
    const inspection = inspectSharedExportDataContractFixture(fixture);
    assert.equal(
      inspection.warnings.some((warning) => warning.code === fixture.expectedDiagnosticCode),
      true,
      fixture.name,
    );
    assert.equal(inspection.chartNodes.length + inspection.tableNodes.length, 0, fixture.name);
  }
});

test("rendered strong data contract satisfies an inferred missing-data placeholder", () => {
  if (typeof DOMParser === "undefined") {
    return;
  }
  const expected = buildExportObjectContract({
    objectId: "p1-inferred-chart",
    objectKind: "chart-visual",
    renderTarget: "visual-snapshot",
    objectRole: "primary",
    dataContract: {
      type: "missing-data",
      expected: "native-chart",
      reason: "Preflight has no structured chart data.",
      requiredFields: ["series"],
    },
    ownsText: false,
    ownsShapes: false,
    ownsSvg: false,
  });
  const renderedContract: ExportObjectContract = {
    ...expected,
    dataContract: {
      type: "chart-bar",
      categories: ["Generated A", "Generated B"],
      series: [{ name: "Generated", values: [3, 5] }],
    },
  };
  const document = new DOMParser().parseFromString(
    [
      '<section class="page" data-page-number="1" data-page-title="Generated chart">',
      `<figure id="${expected.objectId}" data-export-object-id="${expected.objectId}" data-semantic-kind="chart-visual" data-render-target="visual-snapshot" data-snapshot-boundary="object-root" data-ownership-scope="" data-export-contract="${htmlJsonAttribute(renderedContract)}">Generated chart</figure>`,
      "</section>",
    ].join(""),
    "text/html",
  );
  const pageElement = document.querySelector("section") as HTMLElement;
  const root = document.querySelector(`#${expected.objectId}`) as HTMLElement;
  mockRect(pageElement, { left: 0, top: 0, width: 1600, height: 900 });
  mockRect(root, { left: 120, top: 100, width: 720, height: 420 });

  const inspection = inspectSemanticExportChartsForPage({
    pageElement,
    pageNumber: 1,
    expectedContracts: [expected],
  });

  assert.equal(inspection.chartNodes.length, 1);
  assert.deepEqual(inspection.chartNodes[0]?.labels, ["Generated A", "Generated B"]);
  assert.equal(inspection.chartNodes[0]?.renderMode, "image");
  assert.equal(
    inspection.warnings.some((warning) => warning.code === "export-data-contract-minimum-data-missing"),
    false,
  );
});

test("contracted chart and table roots consume dataContract instead of legacy DOM data", () => {
  if (typeof DOMParser === "undefined") {
    return;
  }
  const chartContract = buildExportObjectContract({
    objectId: "p1-contract-chart",
    objectKind: "chart-visual",
    renderTarget: "visual-snapshot",
    objectRole: "primary",
    dataContract: {
      type: "chart-bar",
      categories: ["Contract A", "Contract B"],
      series: [{ name: "Contract", values: [7, 11] }],
    },
    ownsText: false,
    ownsShapes: false,
    ownsSvg: false,
  });
  const tableContract = buildExportObjectContract({
    objectId: "p1-contract-table",
    objectKind: "native-table",
    renderTarget: "native-table",
    objectRole: "secondary",
    dataContract: {
      type: "table",
      columns: [{ label: "Contract metric" }, { label: "Contract value" }],
      rows: [["Contract row", "42"]],
      headerPolicy: "first-row",
      nativeTableAllowed: true,
    },
    ownsText: false,
    ownsShapes: false,
    ownsSvg: false,
  });
  const legacySpec: HtmlChartSpec = {
    kind: "line",
    title: "Legacy",
    subtitle: "",
    insight: "",
    unit: "",
    categories: ["Legacy A"],
    series: [{ id: "legacy", label: "Legacy", values: [999] }],
  };
  const document = new DOMParser().parseFromString(
    [
      '<section class="page" data-page-number="1" data-page-title="Contract only">',
      `<figure id="${chartContract.objectId}" data-export-object-id="${chartContract.objectId}" data-semantic-kind="chart-visual" data-render-target="visual-snapshot" data-snapshot-boundary="object-root" data-ownership-scope="">`,
      `<div data-html-chart-spec="${htmlJsonAttribute(legacySpec)}">Legacy chart spec</div>`,
      "</figure>",
      `<aside id="${tableContract.objectId}" data-export-object-id="${tableContract.objectId}" data-semantic-kind="native-table" data-render-target="native-table" data-snapshot-boundary="object-root" data-ownership-scope="">`,
      "<table><tr><th>DOM metric</th><th>DOM value</th></tr><tr><td>DOM row</td><td>999</td></tr></table>",
      "</aside>",
      "</section>",
    ].join(""),
    "text/html",
  );
  const pageElement = document.querySelector("section") as HTMLElement;
  const chartRoot = document.querySelector(`#${chartContract.objectId}`) as HTMLElement;
  const tableRoot = document.querySelector(`#${tableContract.objectId}`) as HTMLElement;
  const legacyTable = document.querySelector("table") as HTMLElement;
  mockRect(pageElement, { left: 0, top: 0, width: 1600, height: 900 });
  mockRect(chartRoot, { left: 80, top: 100, width: 720, height: 420 });
  mockRect(tableRoot, { left: 880, top: 140, width: 480, height: 260 });
  mockRect(legacyTable, { left: 900, top: 170, width: 420, height: 160 });

  const chartInspection = inspectSemanticExportChartsForPage({
    pageElement,
    pageNumber: 1,
    expectedContracts: [chartContract, tableContract],
  });
  const tableInspection = inspectSemanticExportTablesForPage({
    pageElement,
    pageNumber: 1,
    expectedContracts: [chartContract, tableContract],
  });

  assert.deepEqual(chartInspection.chartNodes[0]?.labels, ["Contract A", "Contract B"]);
  assert.equal(chartInspection.chartNodes[0]?.series[0]?.values[0], 7);
  assert.deepEqual(tableInspection.tableNodes[0]?.rows[0], ["Contract metric", "Contract value"]);
  assert.deepEqual(tableInspection.tableNodes[0]?.rows[1], ["Contract row", "42"]);
});

test("matrix data contract produces matrix shapes and blocks native table fallback", () => {
  if (typeof DOMParser === "undefined") {
    return;
  }
  const contract = buildExportObjectContract({
    objectId: "p1-primary-matrix",
    objectKind: "matrix",
    renderTarget: "editable-shapes",
    objectRole: "primary",
    forbiddenInterpretation: ["native-table"],
  });
  const document = new DOMParser().parseFromString(
    [
      '<section class="page" data-page-number="1" data-page-title="Matrix">',
      `<main id="${contract.objectId}" data-export-object-id="${contract.objectId}" data-semantic-kind="matrix" data-render-target="editable-shapes" data-snapshot-boundary="object-root" data-ownership-scope="text,shape,svg" data-forbidden-export="native-table">`,
      "<table><tr><th>DOM quadrant</th><th>DOM signal</th></tr><tr><td>Core</td><td>High</td></tr></table>",
      "</main>",
      "</section>",
    ].join(""),
    "text/html",
  );
  const pageElement = document.querySelector("section") as HTMLElement;
  const root = document.querySelector(`#${contract.objectId}`) as HTMLElement;
  const table = document.querySelector("table") as HTMLElement;
  mockRect(pageElement, { left: 0, top: 0, width: 1600, height: 900 });
  mockRect(root, { left: 100, top: 90, width: 760, height: 520 });
  mockRect(table, { left: 140, top: 150, width: 620, height: 360 });

  const chartInspection = inspectSemanticExportChartsForPage({
    pageElement,
    pageNumber: 1,
    expectedContracts: [contract],
  });
  const tableInspection = inspectSemanticExportTablesForPage({
    pageElement,
    pageNumber: 1,
    expectedContracts: [contract],
  });

  assert.equal(chartInspection.chartNodes[0]?.chartKind, "matrix");
  assert.equal(chartInspection.chartNodes[0]?.fallbackMode, "native-matrix-shapes");
  assert.equal(chartInspection.chartNodes[0]?.semanticSpec?.kind, "matrix");
  assert.equal(tableInspection.tableNodes.length, 0);
  assert.equal(
    tableInspection.warnings.some(
      (warning) =>
        warning.code === "export-contract-forbidden-violation" &&
        warning.exportObjectId === contract.objectId,
    ),
    true,
  );
});

test("matrix missing-data placeholder exports visible object root as a DOM snapshot", () => {
  if (typeof DOMParser === "undefined") {
    return;
  }
  const contract = buildExportObjectContract({
    objectId: "p1-primary-matrix",
    objectKind: "matrix",
    renderTarget: "editable-shapes",
    objectRole: "primary",
    dataContract: {
      type: "missing-data",
      expected: "matrix",
      reason: "Preflight identified a matrix but has no coordinates.",
      requiredFields: ["axes", "items"],
    },
    forbiddenInterpretation: ["native-table"],
  });
  const attrs = exportContractRootAttrs(contract);
  const document = new DOMParser().parseFromString(
    [
      '<section class="page" data-page-number="1" data-page-title="Matrix">',
      `<div id="hidden-matrix" ${attrs} data-html-canvas-placeholder="true" style="position:absolute;left:120px;top:100px;width:900px;height:520px;visibility:hidden;pointer-events:none;">`,
      '<svg width="900" height="520"><rect x="10" y="10" width="880" height="500"></rect></svg>',
      "</div>",
      `<div id="visible-matrix" ${attrs} data-html-freeform="true" data-html-canvas-target="visual" data-html-visual-id="visual-p1-matrix" style="position:absolute;left:120px;top:100px;width:900px;height:520px;">`,
      '<svg width="900" height="520"><rect x="40" y="40" width="820" height="420"></rect><line x1="450" y1="40" x2="450" y2="460"></line><line x1="40" y1="250" x2="860" y2="250"></line></svg>',
      '<div data-html-block-id="block-1" data-html-fit-role="content" style="position:absolute;left:500px;top:80px;">Object Systems</div>',
      '<div data-html-block-id="block-2" data-html-fit-role="content" style="position:absolute;left:140px;top:330px;">Scaffold dependence</div>',
      "</div>",
      "</section>",
    ].join(""),
    "text/html",
  );
  const pageElement = document.querySelector("section") as HTMLElement;
  const hiddenRoot = document.querySelector("#hidden-matrix") as HTMLElement;
  const visibleRoot = document.querySelector("#visible-matrix") as HTMLElement;
  mockRect(pageElement, { left: 0, top: 0, width: 1600, height: 900 });
  mockRect(hiddenRoot, { left: 120, top: 100, width: 900, height: 520 });
  mockRect(visibleRoot, { left: 120, top: 100, width: 900, height: 520 });

  const inspection = inspectSemanticExportChartsForPage({
    pageElement,
    pageNumber: 1,
    expectedContracts: [contract],
  });
  const chart = inspection.chartNodes[0];

  assert.equal(inspection.chartNodes.length, 1);
  assert.equal(chart?.exportObjectId, contract.objectId);
  assert.equal(chart?.chartKind, "matrix");
  assert.equal(chart?.renderMode, "image");
  assert.equal(chart?.fallbackMode, "visual-chart-snapshot");
  assert.equal(chart?.fallbackAsset?.kind, "dom-snapshot");
  if (chart?.fallbackAsset?.kind === "dom-snapshot") {
    assert.equal(visibleRoot.getAttribute("data-ppt-snapshot-id"), chart.fallbackAsset.snapshotId);
    assert.equal(hiddenRoot.hasAttribute("data-ppt-snapshot-id"), false);
  }
  assert.equal(
    inspection.warnings.some((warning) => warning.code === "export-data-contract-minimum-data-missing"),
    false,
  );
  assert.equal(
    inspection.warnings.some((warning) => warning.code === "export-contract-duplicate-ownership"),
    false,
  );
});

test("Tencent-style quality fixture classifies core visuals or blocking diagnostics", () => {
  if (typeof DOMParser === "undefined") {
    return;
  }
  const pages = [
    {
      pageNumber: 1,
      title: "Tencent revenue engines",
      inspection: inspectSharedExportDataContractFixture({
        name: "Tencent visual chart",
        objectId: "p1-tencent-chart",
        objectKind: "chart-visual",
        renderTarget: "visual-snapshot",
        dataContract: {
          type: "chart-bar",
          categories: ["Games", "Ads", "FinTech"],
          series: [{ name: "Revenue", values: [180, 120, 210] }],
        },
      }),
    },
    {
      pageNumber: 2,
      title: "Tencent position matrix",
      inspection: inspectSharedExportDataContractFixture({
        name: "Tencent matrix",
        objectId: "p2-tencent-matrix",
        objectKind: "matrix",
        renderTarget: "editable-shapes",
        forbiddenInterpretation: ["native-table"],
        dataContract: {
          type: "matrix",
          axes: {
            x: { label: "Growth option value" },
            y: { label: "Execution confidence" },
          },
          items: [
            { label: "Video Accounts", x: 0.78, y: 0.66 },
            { label: "Cloud", x: 0.52, y: 0.44 },
          ],
          renderTarget: "editable-shapes",
        },
      }),
    },
    {
      pageNumber: 3,
      title: "Tencent segment table",
      inspection: inspectSharedExportDataContractFixture({
        name: "Tencent native table",
        objectId: "p3-tencent-table",
        objectKind: "native-table",
        renderTarget: "native-table",
        dataContract: {
          type: "table",
          columns: [{ label: "Segment" }, { label: "Signal" }],
          rows: [
            ["Games", "cash engine"],
            ["Ads", "growth engine"],
          ],
          headerPolicy: "first-row",
          nativeTableAllowed: true,
        },
      }),
    },
    {
      pageNumber: 4,
      title: "Tencent missing chart",
      inspection: inspectSharedExportDataContractFixture({
        name: "Tencent visual chart without structured data",
        objectId: "p4-tencent-chart",
        objectKind: "chart-visual",
        renderTarget: "visual-snapshot",
        dataContract: {
          type: "chart-bar",
          categories: ["Games", "Ads"],
          series: [{ name: "Revenue", values: [180, 120] }],
        },
      }),
    },
  ];
  const diagnostics = pages.flatMap((page) => page.inspection.warnings);
  const exportDocument = buildPptxExportDocument({
    slides: pages.map((page) => ({
      pageNumber: page.pageNumber,
      title: page.title,
      backgroundColor: "FFFFFF",
      theme: buildExportQualityTestTheme(),
      textNodes: [],
      shapeNodes: [],
      chartNodes: page.inspection.chartNodes,
      tableNodes: page.inspection.tableNodes,
    })),
    diagnostics,
  });
  const report = buildPptxExportQualityReport(exportDocument);

  assert.equal(report.nativeChartCountByKind.matrix, 1);
  assert.equal(report.fallbackCountByReason["visual-chart-exported"], 2);
  assert.equal(report.exportContracts.strongDataContractCount, 4);
  assert.equal(report.exportContracts.blockedCoreVisualCount, 0);
  assert.equal(report.exportContracts.contractIssueCount, 0);
  assert.equal(report.exportContracts.byDataContractType["chart-bar"], 2);
  assert.equal(report.exportContracts.byDataContractType.matrix, 1);
  assert.equal(report.exportContracts.byDataContractType.table, 1);
  assert.equal(
    diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "visual-chart-exported" &&
        diagnostic.exportObjectId === "p4-tencent-chart",
    ),
    true,
  );
});

test("visual chart rasterization failure is a fatal quality blocker", () => {
  const exportDocument = buildPptxExportDocument({
    slides: [
      {
        pageNumber: 1,
        title: "Visual chart",
        backgroundColor: "FFFFFF",
        theme: buildExportQualityTestTheme(),
        textNodes: [],
        shapeNodes: [],
        chartNodes: [],
        tableNodes: [],
      },
    ],
    diagnostics: [
      {
        code: "visual-chart-rasterization-failed",
        pageNumber: 1,
        sourceKind: "chart",
        exportObjectId: "p1-chart",
        exportObjectKind: "chart-visual",
        exportRenderTarget: "visual-snapshot",
        message: "Visual chart snapshot could not be rasterized to PNG.",
      },
    ],
  });
  const report = buildPptxExportQualityReport(exportDocument);

  assert.equal(report.fatalCount >= 1, true);
  assert.equal(
    report.pages[0]?.issues.some((issue) => issue.code === "visual-chart-rasterization-failed"),
    true,
  );
  assert.equal(report.acceptanceFailures.includes("fatal-export-issues"), true);
});

function makeSnapshotSlide(): PptExportSlideModel {
  return {
    pageNumber: 1,
    title: "Visual chart",
    backgroundColor: "FFFFFF",
    theme: buildExportQualityTestTheme(),
    textNodes: [],
    shapeNodes: [],
    tableNodes: [],
    chartNodes: [
      {
        kind: "chart",
        exportObjectId: "p1-chart",
        renderMode: "image",
        x: 1,
        y: 1,
        w: 4,
        h: 2,
        layoutRole: "chart-panel",
        fallbackMode: "visual-chart-snapshot",
        chartKind: "bar",
        labels: ["A"],
        series: [],
        colors: [],
        themeTokens: buildExportQualityTestTheme(),
        fallbackAsset: {
          kind: "dom-snapshot",
          reason: "visual-chart-exported",
          snapshotId: "snapshot-1",
          pageNumber: 1,
          exportObjectId: "p1-chart",
        },
      },
    ],
  };
}

test("server rasterizer PNG response replaces pending visual snapshot asset", async () => {
  const slide = makeSnapshotSlide();
  const warnings = await rasterizeVisualChartSnapshots({
    framesByPageNumber: new Map([
      [
        1,
        {
          document: {
            doctype: null,
            documentElement: {
              outerHTML: "<html><body><section class=\"page\"><div data-ppt-snapshot-id=\"snapshot-1\"></div></section></body></html>",
            },
            querySelector: (selector: string) =>
              selector === '[data-ppt-snapshot-id="snapshot-1"]' ? {} : null,
          },
          pageElement: {},
          iframe: {},
          pageNumber: 1,
        } as never,
      ],
    ]),
    slides: [slide],
    rasterizeClient: async () => ({
      results: [
        {
          pageNumber: 1,
          snapshotId: "snapshot-1",
          pngDataUri: "data:image/png;base64,AAAA",
        },
      ],
    }),
  });

  assert.deepEqual(warnings, []);
  assert.equal(slide.chartNodes[0]?.fallbackAsset?.kind, "png");
  assert.equal(slide.chartNodes[0]?.fallbackAsset?.data, "data:image/png;base64,AAAA");
});

test("server rasterizer failure blocks visual snapshot export with server reason", async () => {
  const slide = makeSnapshotSlide();
  const warnings = await rasterizeVisualChartSnapshots({
    framesByPageNumber: new Map([
      [
        1,
        {
          document: {
            doctype: null,
            documentElement: {
              outerHTML: "<html><body><section class=\"page\"><div data-ppt-snapshot-id=\"snapshot-1\"></div></section></body></html>",
            },
            querySelector: (selector: string) =>
              selector === '[data-ppt-snapshot-id="snapshot-1"]' ? {} : null,
          },
          pageElement: {},
          iframe: {},
          pageNumber: 1,
        } as never,
      ],
    ]),
    slides: [slide],
    rasterizeClient: async () => ({
      results: [
        {
          pageNumber: 1,
          snapshotId: "snapshot-1",
          error: "Snapshot target snapshot-1 was not found.",
        },
      ],
    }),
  });

  assert.equal(warnings[0]?.code, "visual-chart-rasterization-failed");
  assert.match(warnings[0]?.message ?? "", /Snapshot target snapshot-1 was not found/);
  assert.equal(slide.chartNodes[0]?.fallbackAsset?.kind, "dom-snapshot");
});

test("visual snapshot rasterizer validates local snapshot ids before server request", async () => {
  const slide = makeSnapshotSlide();
  let called = false;
  const warnings = await rasterizeVisualChartSnapshots({
    framesByPageNumber: new Map([
      [
        1,
        {
          document: {
            doctype: null,
            documentElement: { outerHTML: "<html><body><section class=\"page\"></section></body></html>" },
            querySelector: () => null,
          },
          pageElement: {},
          iframe: {},
          pageNumber: 1,
        } as never,
      ],
    ]),
    slides: [slide],
    rasterizeClient: async () => {
      called = true;
      return { results: [] };
    },
  });

  assert.equal(called, false);
  assert.equal(warnings[0]?.code, "visual-chart-rasterization-failed");
  assert.match(warnings[0]?.message ?? "", /snapshot-1/);
  assert.match(warnings[0]?.message ?? "", /serialized page HTML/);
});

test("unlabeled chart and table fallback records quality diagnostics", () => {
  if (typeof DOMParser === "undefined") {
    return;
  }
  const chartSpec: HtmlChartSpec = {
    kind: "bar",
    title: "Legacy chart",
    subtitle: "",
    insight: "",
    unit: "",
    categories: ["A", "B"],
    series: [{ id: "series", label: "Series", values: [1, 2] }],
  };
  const document = new DOMParser().parseFromString(
    [
      '<section class="page" data-page-number="1" data-page-title="Fallback">',
      `<figure id="legacy-chart" data-html-chart-spec="${htmlJsonAttribute(chartSpec)}">Legacy chart</figure>`,
      '<table id="legacy-table"><tr><th>Metric</th><th>Value</th></tr><tr><td>A</td><td>1</td></tr></table>',
      "</section>",
    ].join(""),
    "text/html",
  );
  const pageElement = document.querySelector("section") as HTMLElement;
  const chartRoot = document.querySelector("#legacy-chart") as HTMLElement;
  const tableRoot = document.querySelector("#legacy-table") as HTMLElement;
  mockRect(pageElement, { left: 0, top: 0, width: 1600, height: 900 });
  mockRect(chartRoot, { left: 120, top: 120, width: 640, height: 360 });
  mockRect(tableRoot, { left: 840, top: 160, width: 420, height: 180 });

  const chartInspection = inspectSemanticExportChartsForPage({ pageElement, pageNumber: 1 });
  const tableInspection = inspectSemanticExportTablesForPage({ pageElement, pageNumber: 1 });
  const exportDocument = buildPptxExportDocument({
    slides: [
      {
        pageNumber: 1,
        title: "Fallback",
        backgroundColor: "FFFFFF",
        theme: buildExportQualityTestTheme(),
        textNodes: [],
        shapeNodes: [],
        chartNodes: [],
        tableNodes: [],
      },
    ],
    diagnostics: [...chartInspection.warnings, ...tableInspection.warnings],
  });
  const report = buildPptxExportQualityReport(exportDocument);

  assert.equal(chartInspection.chartNodes.length, 1);
  assert.equal(tableInspection.tableNodes.length, 1);
  assert.equal(
    chartInspection.warnings.some((warning) => warning.code === "unlabeled-fallback-used"),
    true,
  );
  assert.equal(
    tableInspection.warnings.some((warning) => warning.code === "unlabeled-fallback-used"),
    true,
  );
  assert.equal(report.exportContracts.unlabeledFallbackCount, 2);
});

test("shared ownership overlap between contract roots is reported", () => {
  if (typeof DOMParser === "undefined") {
    return;
  }
  const primary = buildExportObjectContract({
    objectId: "p1-primary-matrix",
    objectKind: "matrix",
    renderTarget: "editable-shapes",
    objectRole: "primary",
    ownsText: true,
    ownsShapes: false,
    ownsSvg: false,
  });
  const secondary = buildExportObjectContract({
    objectId: "p1-secondary-note",
    objectKind: "text",
    renderTarget: "editable-text",
    objectRole: "secondary",
    ownsText: true,
    ownsShapes: false,
    ownsSvg: false,
  });
  const document = new DOMParser().parseFromString(
    [
      '<section class="page" data-page-number="1" data-page-title="Matrix">',
      `<div id="${primary.objectId}" data-export-object-id="${primary.objectId}" data-semantic-kind="matrix" data-render-target="editable-shapes" data-snapshot-boundary="object-root" data-ownership-scope="text">Matrix</div>`,
      `<aside id="${secondary.objectId}" data-export-object-id="${secondary.objectId}" data-semantic-kind="text" data-render-target="editable-text" data-ownership-scope="text">Note</aside>`,
      "</section>",
    ].join(""),
    "text/html",
  );
  const pageElement = document.querySelector("section") as HTMLElement;
  const primaryElement = document.querySelector(`#${primary.objectId}`) as HTMLElement;
  const secondaryElement = document.querySelector(`#${secondary.objectId}`) as HTMLElement;
  mockRect(pageElement, { left: 0, top: 0, width: 1600, height: 900 });
  mockRect(primaryElement, { left: 100, top: 100, width: 400, height: 300 });
  mockRect(secondaryElement, { left: 250, top: 200, width: 240, height: 160 });

  const inspection = inspectSemanticExportObjectForElement({
    pageElement,
    element: primaryElement,
    pageNumber: 1,
    expectedContracts: [primary, secondary],
  });

  assert.equal(
    inspection.warnings.some(
      (warning) =>
        warning.code === "export-contract-duplicate-ownership" &&
        /overlap geometrically/.test(warning.message),
    ),
    true,
  );
});
