import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSanitizedFinalReport,
  compileGeneratedPageExportMetadata,
  composeDeterministicPageSection,
  extractHtmlDocument,
  extractPageTitles,
  validateGeneratedPageHtml,
} from "./render.js";
import { getDeckStyleProfile } from "../industry-style.js";
import type { PageRecipe } from "./contracts.js";
import type { ExportObjectContract } from "./schemas.js";

function buildSinglePageHtml(sectionBody: string) {
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    "<title>Revenue moat</title>",
    "</head>",
    "<body>",
    `<section class="page" data-page-number="1" data-page-title="Revenue moat" style="width:1600px;height:900px;">${sectionBody}</section>`,
    "</body>",
    "</html>",
  ].join("");
}

function buildRecorderManifest(overrides?: Record<string, unknown>) {
  return {
    version: 1,
    startMode: "entry-then-loop",
    entryTracks: [
      {
        anchor: "recorder-wheel",
        preset: "scale-in",
        delayMs: 120,
        durationMs: 720,
        order: 0,
      },
      {
        anchor: "signal-word",
        preset: "fade-up",
        delayMs: 260,
        durationMs: 680,
        order: 1,
      },
    ],
    loopEffects: [
      {
        kind: "rotate",
        anchor: "recorder-wheel",
        durationMs: 2800,
        direction: "clockwise",
      },
      {
        kind: "ticker",
        anchor: "signal-word",
        items: ["SIGNAL", "ARCHIVE", "TRACE"],
        stepMs: 960,
      },
      {
        kind: "pulse",
        anchor: "status-light",
        durationMs: 1400,
        scaleFrom: 0.92,
        scaleTo: 1.08,
        opacityFrom: 0.35,
        opacityTo: 1,
      },
      {
        kind: "orbit",
        anchor: "orbit-accent",
        durationMs: 2400,
        radiusPx: 12,
        axis: "xy",
      },
    ],
    ...overrides,
  };
}

function buildRecorderAnimationSection(manifest: Record<string, unknown>) {
  return [
    '<h1 data-anim-anchor="signal-word">Archive the signal</h1>',
    '<div data-anim-anchor="recorder-wheel">Wheel</div>',
    '<div data-anim-anchor="status-light">Light</div>',
    '<div data-anim-anchor="orbit-accent">Accent</div>',
    '<template data-studio-animation-manifest>',
    JSON.stringify(manifest),
    "</template>",
  ].join("");
}

function buildExportObjectContract(
  objectId: string,
  objectKind: ExportObjectContract["objectKind"],
  renderTarget: ExportObjectContract["renderTarget"],
  objectRole: ExportObjectContract["objectRole"],
  dataContract?: ExportObjectContract["dataContract"],
): ExportObjectContract {
  return {
    objectId,
    pageNumber: 1,
    pageStory: "Export contract fixture.",
    primaryVisualObject: objectKind,
    objectKind,
    objectRole,
    dataContract: dataContract === undefined
      ? objectKind === "matrix"
        ? {
            type: "matrix",
            axes: {
              x: { label: "Impact" },
              y: { label: "Readiness" },
            },
            items: [
              { label: "Core", x: 0.7, y: 0.6 },
            ],
            renderTarget: "editable-shapes",
          }
        : objectKind === "native-chart"
          ? {
              type: "chart-bar",
              categories: ["A", "B"],
              series: [{ name: "Series", values: [1, 2] }],
            }
          : objectKind === "native-table"
            ? {
                type: "table",
                columns: [{ label: "Metric" }, { label: "Value" }],
                rows: [["Revenue", "42"]],
                headerPolicy: "first-row",
                nativeTableAllowed: true,
              }
            : null
      : dataContract,
    renderTarget,
    ownershipScope: {
      rootId: objectId,
      ownsText: true,
      ownsShapes: objectKind !== "text",
      ownsSvg: objectKind !== "text",
      childRoles: [],
    },
    forbiddenInterpretation: objectKind === "matrix" ? ["native-table"] : [],
  };
}

function exportContractAttr(contract: ExportObjectContract) {
  return JSON.stringify(contract).replaceAll('"', "&quot;");
}

function exportContractRootAttrs(
  contract: ExportObjectContract,
  options?: {
    dataContract?: string;
    layoutArchetype?: string;
    visualGrammar?: string;
  },
) {
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
    ...(options?.layoutArchetype ? [`data-layout-archetype="${options.layoutArchetype}"`] : []),
    ...(options?.visualGrammar ? [`data-visual-grammar="${options.visualGrammar}"`] : []),
    options?.dataContract === undefined
      ? `data-export-contract="${exportContractAttr(contract)}"`
      : options.dataContract,
  ].filter(Boolean).join(" ");
}

test("validateGeneratedPageHtml rejects generation meta-copy leaks", () => {
  assert.throws(
    () =>
      validateGeneratedPageHtml({
        html: buildSinglePageHtml(
          [
            "<h1>Revenue moat</h1>",
            "<p>The page thesis argues that the setup is attractive.</p>",
            "<p>Illustrative trajectory of the supplied page thesis; no additional metrics are introduced.</p>",
          ].join(""),
        ),
        expectedPageNumber: 1,
        expectedPageTitle: "Revenue moat",
      }),
    /workspace scaffolding.*generation meta-copy/i,
  );
});

test("validateGeneratedPageHtml warns when a secondary export object is missing", () => {
  const primary = buildExportObjectContract(
    "p1-primary-matrix",
    "matrix",
    "editable-shapes",
    "primary",
  );
  const secondary = buildExportObjectContract(
    "p1-secondary-note",
    "text",
    "editable-text",
    "secondary",
  );

  const result = validateGeneratedPageHtml({
    html: buildSinglePageHtml(
      [
        "<h1>Revenue moat</h1>",
        `<div ${exportContractRootAttrs(primary)}>Primary matrix</div>`,
        "<p>The support note is not shown here.</p>",
      ].join(""),
    ),
    expectedPageNumber: 1,
    expectedPageTitle: "Revenue moat",
    expectedExportObjectContracts: [primary, secondary],
  });

  assert.deepEqual(
    result.exportContractDiagnostics.map((diagnostic) => diagnostic.code),
    ["export-metadata-anchor-missing", "export-object-metadata-missing"],
  );
  assert.equal(result.exportContractDiagnostics[0]?.objectId, "p1-secondary-note");
});

test("validateGeneratedPageHtml compiles a lightweight data-studio-object-id anchor", () => {
  const primary = buildExportObjectContract(
    "p1-primary-matrix",
    "matrix",
    "editable-shapes",
    "primary",
  );

  const result = validateGeneratedPageHtml({
    html: buildSinglePageHtml(
      [
        "<h1>Revenue moat</h1>",
        `<div data-studio-object-id="${primary.objectId}" class="matrix-root">Primary matrix</div>`,
      ].join(""),
    ),
    expectedPageNumber: 1,
    expectedPageTitle: "Revenue moat",
    expectedExportObjectContracts: [primary],
    expectedPageExportContract: {
      layoutArchetype: "matrix-first",
      visualGrammar: "consulting",
    },
  });

  assert.deepEqual(result.exportContractDiagnostics, []);
  assert.match(result.sectionHtml, /data-studio-object-id="p1-primary-matrix"/);
  assert.match(result.sectionHtml, /data-export-object-id="p1-primary-matrix"/);
  assert.match(result.sectionHtml, /data-semantic-kind="matrix"/);
  assert.match(result.sectionHtml, /data-object-role="primary"/);
  assert.match(result.sectionHtml, /data-studio-slot="primary-visual"/);
  assert.match(result.sectionHtml, /data-render-target="editable-shapes"/);
  assert.match(result.sectionHtml, /data-snapshot-boundary="object-root"/);
  assert.match(result.sectionHtml, /data-ownership-scope="text,shape,svg"/);
  assert.match(result.sectionHtml, /data-forbidden-interpretation="native-table"/);
  assert.match(result.sectionHtml, /data-quality-intent="contract-first-export"/);
  assert.match(result.sectionHtml, /data-layout-archetype="matrix-first"/);
  assert.match(result.sectionHtml, /data-visual-grammar="consulting"/);
  assert.match(result.sectionHtml, /data-export-contract="/);
  assert.equal((result.sectionHtml.match(/data-export-object-id="p1-primary-matrix"/g) ?? []).length, 1);
});

test("validateGeneratedPageHtml compiles a single-object primary visual slot anchor", () => {
  const primary = buildExportObjectContract(
    "p1-primary-chart",
    "chart-visual",
    "visual-snapshot",
    "primary",
    {
      type: "chart-bar",
      categories: ["A", "B"],
      series: [{ name: "Series", values: [1, 2] }],
    },
  );

  const result = validateGeneratedPageHtml({
    html: buildSinglePageHtml(
      [
        "<h1>Revenue moat</h1>",
        '<figure data-studio-slot="primary-visual">Visible chart</figure>',
      ].join(""),
    ),
    expectedPageNumber: 1,
    expectedPageTitle: "Revenue moat",
    expectedExportObjectContracts: [primary],
  });

  assert.deepEqual(result.exportContractDiagnostics, []);
  assert.match(result.sectionHtml, /<figure[^>]+data-studio-slot="primary-visual"[^>]+data-studio-object-id="p1-primary-chart"[^>]+data-export-object-id="p1-primary-chart"/);
});

test("validateGeneratedPageHtml does not guess slot-only secondary anchors on multi-object pages", () => {
  const primary = buildExportObjectContract(
    "p1-primary-matrix",
    "matrix",
    "editable-shapes",
    "primary",
  );
  const secondary = buildExportObjectContract(
    "p1-secondary-note",
    "text",
    "editable-text",
    "secondary",
    null,
  );

  const result = validateGeneratedPageHtml({
    html: buildSinglePageHtml(
      [
        "<h1>Revenue moat</h1>",
        `<div data-studio-object-id="${primary.objectId}">Primary matrix</div>`,
        '<aside data-studio-slot="primary-visual">Support note</aside>',
      ].join(""),
    ),
    expectedPageNumber: 1,
    expectedPageTitle: "Revenue moat",
    expectedExportObjectContracts: [primary, secondary],
  });

  const secondaryCodes = result.exportContractDiagnostics
    .filter((diagnostic) => diagnostic.objectId === "p1-secondary-note")
    .map((diagnostic) => diagnostic.code);
  assert.deepEqual(secondaryCodes, [
    "export-metadata-anchor-missing",
    "export-object-metadata-missing",
  ]);
  assert.doesNotMatch(result.sectionHtml, /<aside[^>]+data-export-object-id="p1-secondary-note"/);
});

test("compileGeneratedPageExportMetadata reports duplicate lightweight anchors without wrapping DOM", () => {
  const primary = buildExportObjectContract(
    "p1-primary-matrix",
    "matrix",
    "editable-shapes",
    "primary",
  );
  const sectionHtml = [
    '<section class="page" data-page-number="1" data-page-title="Revenue moat" style="width:1600px;height:900px;">',
    "<h1>Revenue moat</h1>",
    `<div data-studio-object-id="${primary.objectId}">Matrix A</div>`,
    `<div data-studio-object-id="${primary.objectId}">Matrix B</div>`,
    "</section>",
  ].join("");

  const compiled = compileGeneratedPageExportMetadata({
    sectionHtml,
    pageNumber: 1,
    contracts: [primary],
  });

  assert.deepEqual(compiled.compiledObjectIds, []);
  assert.deepEqual(compiled.ambiguousObjectIds, ["p1-primary-matrix"]);
  assert.equal(compiled.sectionHtml, sectionHtml);
  assert.equal(compiled.diagnostics[0]?.code, "export-metadata-anchor-ambiguous");
});

test("validateGeneratedPageHtml warns when a rendered export objectId is duplicated", () => {
  const primary = buildExportObjectContract(
    "p1-primary-matrix",
    "matrix",
    "editable-shapes",
    "primary",
  );

  const result = validateGeneratedPageHtml({
    html: buildSinglePageHtml(
      [
        "<h1>Revenue moat</h1>",
        `<div ${exportContractRootAttrs(primary)}>Primary matrix</div>`,
        `<div ${exportContractRootAttrs(primary)}>Duplicate matrix</div>`,
      ].join(""),
    ),
    expectedPageNumber: 1,
    expectedPageTitle: "Revenue moat",
    expectedExportObjectContracts: [primary],
  });

  const codes = result.exportContractDiagnostics.map((diagnostic) => diagnostic.code);
  assert.ok(codes.includes("export-metadata-anchor-ambiguous"));
  assert.ok(codes.includes("export-object-duplicate-root"));
  assert.equal(result.exportContractDiagnostics[0]?.objectId, "p1-primary-matrix");
});

test("validateGeneratedPageHtml normalizes existing full export metadata attrs", () => {
  const primary = buildExportObjectContract(
    "p1-primary-matrix",
    "matrix",
    "editable-shapes",
    "primary",
  );
  const incompleteAttrs = exportContractRootAttrs(primary, {
    layoutArchetype: "matrix-first",
    visualGrammar: "consulting",
  })
    .replace(/\sdata-ownership-scope="[^"]*"/, "")
    .replace(/\sdata-forbidden-export="[^"]*"/, "")
    .replace(/\sdata-forbidden-interpretation="[^"]*"/, "")
    .replace(/\sdata-quality-intent="[^"]*"/, "")
    .replace(/\sdata-layout-archetype="[^"]*"/, "")
    .replace(/\sdata-visual-grammar="[^"]*"/, "");

  const result = validateGeneratedPageHtml({
    html: buildSinglePageHtml(
      [
        "<h1>Revenue moat</h1>",
        `<div ${incompleteAttrs}>Primary matrix</div>`,
      ].join(""),
    ),
    expectedPageNumber: 1,
    expectedPageTitle: "Revenue moat",
    expectedExportObjectContracts: [primary],
    expectedPageExportContract: {
      layoutArchetype: "matrix-first",
      visualGrammar: "consulting",
    },
  });

  const codes = result.exportContractDiagnostics.map((diagnostic) => diagnostic.code);
  assert.deepEqual(codes, []);
  assert.match(result.sectionHtml, /data-ownership-scope="text,shape,svg"/);
  assert.match(result.sectionHtml, /data-forbidden-export="native-table"/);
  assert.match(result.sectionHtml, /data-forbidden-interpretation="native-table"/);
  assert.match(result.sectionHtml, /data-quality-intent="contract-first-export"/);
  assert.match(result.sectionHtml, /data-layout-archetype="matrix-first"/);
  assert.match(result.sectionHtml, /data-visual-grammar="consulting"/);
});

test("validateGeneratedPageHtml validates compiler-owned serialized data contracts", () => {
  const expectedChart = buildExportObjectContract(
    "p1-primary-chart",
    "native-chart",
    "native-chart",
    "primary",
  );
  const expectedMatrix = buildExportObjectContract(
    "p1-primary-matrix",
    "matrix",
    "editable-shapes",
    "primary",
  );
  const missingDataChart: ExportObjectContract = {
    ...expectedChart,
    dataContract: {
      type: "missing-data",
      expected: "native-chart",
      reason: "No generated data.",
      requiredFields: ["series"],
    },
  };
  const incompatibleMatrix: ExportObjectContract = {
    ...expectedMatrix,
    dataContract: {
      type: "table",
      columns: [{ label: "Metric" }],
      rows: [["A"]],
      nativeTableAllowed: true,
    },
  };

  const missingDataResult = validateGeneratedPageHtml({
    html: buildSinglePageHtml(
      [
        "<h1>Revenue moat</h1>",
        `<div ${exportContractRootAttrs(missingDataChart, { dataContract: "" })}>Chart</div>`,
      ].join(""),
    ),
    expectedPageNumber: 1,
    expectedPageTitle: "Revenue moat",
    expectedExportObjectContracts: [missingDataChart],
  });
  assert.equal(
    missingDataResult.exportContractDiagnostics.some((diagnostic) =>
      diagnostic.code === "export-data-contract-minimum-data-missing"),
    true,
  );

  const normalizedResult = validateGeneratedPageHtml({
    html: buildSinglePageHtml(
      [
        "<h1>Revenue moat</h1>",
        `<div ${exportContractRootAttrs(expectedMatrix, { dataContract: `data-export-contract="${exportContractAttr(incompatibleMatrix)}"` })}>Matrix</div>`,
      ].join(""),
    ),
    expectedPageNumber: 1,
    expectedPageTitle: "Revenue moat",
    expectedExportObjectContracts: [expectedMatrix],
  });
  const normalizedCodes = normalizedResult.exportContractDiagnostics.map((diagnostic) => diagnostic.code);
  assert.deepEqual(normalizedCodes, []);
  assert.doesNotMatch(normalizedResult.sectionHtml, /nativeTableAllowed/);
  assert.match(normalizedResult.sectionHtml, /&quot;type&quot;:&quot;matrix&quot;/);
});

test("validateGeneratedPageHtml warns when chart-visual lacks chart module and data", () => {
  const primary: ExportObjectContract = {
    ...buildExportObjectContract(
      "p1-primary-chart",
      "chart-visual",
      "visual-snapshot",
      "primary",
      null,
    ),
    ownershipScope: {
      rootId: "p1-primary-chart",
      ownsText: false,
      ownsShapes: true,
      ownsSvg: true,
      childRoles: ["chart-frame", "plot", "axis", "legend", "annotation"],
    },
    forbiddenInterpretation: ["native-table", "native-chart"],
  };

  const result = validateGeneratedPageHtml({
    html: buildSinglePageHtml(
      [
        "<h1>Revenue moat</h1>",
        `<main ${exportContractRootAttrs(primary)}><svg viewBox="0 0 400 240"><text x="40" y="40">Revenue bridge</text></svg></main>`,
      ].join(""),
    ),
    expectedPageNumber: 1,
    expectedPageTitle: "Revenue moat",
    expectedExportObjectContracts: [primary],
  });

  assert.equal(
    result.exportContractDiagnostics.some((diagnostic) =>
      diagnostic.code === "chart-visual-module-missing"),
    true,
  );
});

function buildRecipeWithTwoCharts(): PageRecipe {
  const densityBudget = {
    maxMajorRegions: 2,
    maxSupportBullets: 2,
    maxEvidenceBullets: 2,
    maxParagraphCharacters: 150,
    maxListItemCharacters: 84,
    maxListItemsPerList: 2,
    allowRightRail: true,
    allowFooterRail: false,
  };

  return {
    pageNumber: 1,
    pageTitle: "Margin and mix",
    pageIntent: "Explain margin recovery and segment mix.",
    objective: "Show the two drivers behind operating performance.",
    insight: "Margin recovery is broadening while mix remains uneven.",
    pageClass: "proof-analysis",
    densityBudget,
    compositionHint: "Use a consulting two-chart exhibit.",
    compositionPreset: "hero-sidecar",
    layout: "chart-insight",
    chartPriority: "required",
    evidenceIds: ["bridge"],
    evidenceBundle: [],
    heroClaim: "Margin recovery has two visible drivers.",
    supportBullets: [],
    evidenceBullets: [],
    takeaway: "Use the bridge as the main proof and mix as the context.",
    moduleBinding: null,
    chartSpec: {
      kind: "waterfall",
      categories: ["Start", "Volume", "Cost", "End"],
      series: [{ name: "Bridge", values: [0.4, 0.8, -0.3, 0.9] }],
      unit: "$bn",
      title: "Operating income bridge",
      insight: "Volume more than offsets cost pressure.",
      confidence: 0.82,
      fallbackMode: "annotation",
      sourceEvidenceIds: ["bridge"],
      composite: "annotation-rail",
      chartPreset: "margin-bridge",
      density: "hero",
    },
    secondaryChartSpec: {
      kind: "stacked",
      categories: ["Q1", "Q2"],
      series: [
        { name: "Automotive", values: [16.2, 16.7] },
        { name: "Services", values: [3.7, 3.9] },
      ],
      unit: "$bn",
      title: "Revenue mix",
      insight: "Services expands its contribution.",
      confidence: 0.8,
      fallbackMode: "metric-strip",
      sourceEvidenceIds: ["mix"],
      composite: "annotation-rail",
      chartPreset: "segment-mix",
      density: "sidecar",
    },
    diagramSpec: null,
    fallbackReason: null,
  };
}

function buildMatrixRecipe(): PageRecipe {
  return {
    ...buildRecipeWithTwoCharts(),
    pageTitle: "Tesla platform layer",
    pageIntent: "Show platform assets in one matrix.",
    objective: "Compare maturity and network expansion across platform assets.",
    insight: "The platform case depends on assets moving together, not one isolated metric.",
    compositionHint: "Use one large 2x2 matrix with a right conclusion rail.",
    layout: "sequence",
    chartPriority: "none",
    heroClaim: "Tesla's platform assets are converging toward an operating flywheel.",
    supportBullets: [
      "Robotaxi operations are expanding by city.",
      "FSD subscription base is growing.",
      "Charging coverage underpins the operating network.",
    ],
    evidenceBullets: [
      "AI training compute supports autonomy development.",
      "Supercharger network adds operating nodes.",
    ],
    takeaway: "The strongest read is platform convergence, while execution timing remains the watch item.",
    chartSpec: null,
    secondaryChartSpec: null,
    diagramSpec: null,
    structuredDiagramSpec: null,
  };
}

test("composeDeterministicPageSection renders two editable consulting chart modules", () => {
  const html = composeDeterministicPageSection(
    buildRecipeWithTwoCharts(),
    getDeckStyleProfile("general-consulting"),
  );

  assert.equal((html.match(/data-html-chart-spec="/g) ?? []).length, 2);
  assert.match(html, /data-html-composition-preset="hero-sidecar"/);
  assert.match(html, /data-chart-exhibit-preset="margin-bridge"/);
  assert.match(html, /data-chart-exhibit-preset="segment-mix"/);
  assert.match(html, /data-chart-density="sidecar"/);
});

test("composeDeterministicPageSection emits Phase 2 attrs for contracted roots", () => {
  const contract = buildExportObjectContract(
    "p1-primary-chart",
    "chart-visual",
    "visual-snapshot",
    "primary",
  );
  const html = composeDeterministicPageSection(
    buildRecipeWithTwoCharts(),
    getDeckStyleProfile("general-consulting"),
    contract,
    {
      layoutArchetype: "chart-with-insight-rail",
      visualGrammar: "equity-research",
    },
  );

  assert.match(html, /data-layout-archetype="chart-with-insight-rail"/);
  assert.match(html, /data-visual-grammar="equity-research"/);
  assert.match(html, /data-quality-intent="contract-first-export"/);
  assert.match(html, /&quot;dataContract&quot;:\{&quot;type&quot;:&quot;chart-waterfall&quot;/);
});

test("composeDeterministicPageSection renders a point-map matrix fallback as a real 2x2 field", () => {
  const contract = buildExportObjectContract(
    "p1-primary-matrix",
    "matrix",
    "editable-shapes",
    "primary",
    {
      type: "matrix",
      variant: "point-map",
      axes: {
        x: { label: "兑现可见度" },
        y: { label: "投资上行弹性" },
      },
      quadrants: [
        { id: "hy-lx", label: "高上行 / 低可见度", x: 0, y: 0.5, w: 0.5, h: 0.5 },
        { id: "hy-hx", label: "高上行 / 高可见度", x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
        { id: "ly-lx", label: "低上行 / 低可见度", x: 0, y: 0, w: 0.5, h: 0.5 },
        { id: "ly-hx", label: "低上行 / 高可见度", x: 0.5, y: 0, w: 0.5, h: 0.5 },
      ],
      items: [
        { id: "robotaxi", label: "Robotaxi", x: 0.34, y: 0.72 },
        { id: "fsd", label: "FSD 订阅", x: 0.74, y: 0.30 },
      ],
      callout: {
        title: "投资结论",
        body: "看多逻辑并未缺席，但兑现节奏仍取决于高弹性业务落地。",
      },
      renderTarget: "editable-shapes",
    },
  );
  const html = composeDeterministicPageSection(
    buildMatrixRecipe(),
    getDeckStyleProfile("finance"),
    contract,
    {
      layoutArchetype: "matrix-first",
      visualGrammar: "equity-research",
    },
  );

  assert.match(html, /<main[^>]+data-studio-object-id="p1-primary-matrix"[^>]+data-export-object-id="p1-primary-matrix"/);
  assert.match(html, /data-html-visual-kind="matrix-field"/);
  assert.match(html, /data-matrix-variant="point-map"/);
  assert.match(html, /data-html-visual-kind="matrix-point"/);
  assert.match(html, /data-html-visual-kind="matrix-point-label"/);
  assert.doesNotMatch(html, /data-html-visual-kind="matrix-asset-card"/);
  assert.doesNotMatch(html, /data-html-visual-kind="matrix-point-label" style="[^"]*background/);
  assert.match(html, /兑现可见度/);
  assert.match(html, /投资上行弹性/);
  assert.match(html, /高上行 \/ 低可见度/);
  assert.match(html, /Robotaxi/);
  assert.match(html, /FSD 订阅/);
  assert.doesNotMatch(html, /Built-in renderer|Step 1|Primary visual object|Semantic intent|The subject should be positioned/);
});

test("composeDeterministicPageSection renders an asset-card matrix fallback with a conclusion rail", () => {
  const contract = buildExportObjectContract(
    "p1-primary-matrix",
    "matrix",
    "editable-shapes",
    "primary",
    {
      type: "matrix",
      variant: "asset-card-map",
      axes: {
        x: { label: "运营网络扩展度 / 城市与节点覆盖" },
        y: { label: "平台成熟度 / 可运营化程度" },
      },
      quadrants: [
        { id: "hy-lx", label: "技术就绪，网络待扩张", x: 0, y: 0.5, w: 0.5, h: 0.5 },
        { id: "hy-hx", label: "平台层核心资产", x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
        { id: "ly-lx", label: "能力储备", x: 0, y: 0, w: 0.5, h: 0.5 },
        { id: "ly-hx", label: "规模化抓手", x: 0.5, y: 0, w: 0.5, h: 0.5 },
      ],
      items: [
        { id: "ai-compute", label: "AI 训练算力", detail: "Cortex / H100e 支撑训练基础设施扩张", x: 0.30, y: 0.72 },
        { id: "robotaxi", label: "Robotaxi", detail: "运营城市与付费里程持续扩展", x: 0.72, y: 0.74 },
        { id: "fsd", label: "FSD 订阅", detail: "软件订阅基础扩大", x: 0.72, y: 0.28 },
        { id: "charging", label: "超充网络", detail: "站点与连接器构成网络底座", x: 0.30, y: 0.28 },
      ],
      callout: {
        title: "投资结论",
        body: "平台层逻辑正在形成，但下一阶段回报仍依赖运营兑现。",
      },
      renderTarget: "editable-shapes",
    },
  );
  const html = composeDeterministicPageSection(
    buildMatrixRecipe(),
    getDeckStyleProfile("finance"),
    contract,
    {
      layoutArchetype: "matrix-first",
      visualGrammar: "equity-research",
    },
  );

  assert.match(html, /<main[^>]+data-studio-object-id="p1-primary-matrix"[^>]+data-export-object-id="p1-primary-matrix"/);
  assert.match(html, /data-html-visual-kind="matrix-field"/);
  assert.match(html, /data-matrix-variant="asset-card-map"/);
  assert.match(html, /data-html-visual-kind="matrix-asset-card"/);
  assert.match(html, /data-html-visual-kind="matrix-conclusion-rail"/);
  assert.match(html, /AI 训练算力/);
  assert.match(html, /Robotaxi/);
  assert.match(html, /FSD 订阅/);
  assert.match(html, /超充网络/);
  assert.doesNotMatch(html, /Built-in renderer|Step 1|Primary visual object|Semantic intent|The subject should be positioned/);
});

test("deterministic sections use square rectangular surfaces across style profiles", () => {
  for (const profileId of ["general-consulting", "finance", "technology", "academic"] as const) {
    const html = composeDeterministicPageSection(
      buildRecipeWithTwoCharts(),
      getDeckStyleProfile(profileId),
    );

    assert.doesNotMatch(html, /border-radius:(?!0px|999px)\d+px/);
    assert.doesNotMatch(html, /rx="(?:4|13)"/);
    assert.match(html, /border-radius:0px/);
  }
});

test("extractHtmlDocument keeps the full HTML document when surrounded by extra text", () => {
  const html = buildSinglePageHtml("<h1>Revenue moat</h1>");
  const wrapped = [
    "Notes before the document",
    "Literal stray token </html> in prose",
    html,
    "Trailing commentary after the document",
  ].join("\n");

  assert.equal(extractHtmlDocument(wrapped), html);
});

test("extractHtmlDocument ignores stray closing tags inside the wrapped body text", () => {
  const html = buildSinglePageHtml("<pre>Literal stray </html> token inside a code example</pre>");
  const wrapped = [
    "Notes before the document",
    html,
    "Trailing commentary after the document",
  ].join("\n");

  assert.equal(extractHtmlDocument(wrapped), html);
});

test("extractHtmlDocument ignores stray closing tags in trailing commentary", () => {
  const html = buildSinglePageHtml("<h1>Revenue moat</h1>");
  const wrapped = [
    "Notes before the document",
    html,
    "Trailing commentary mentioning </html> as literal text",
  ].join("\n");

  assert.equal(extractHtmlDocument(wrapped), html);
});

test("extractPageTitles scans page sections without regex backtracking", () => {
  const html = [
    "<!DOCTYPE html>",
    "<html>",
    "<body>",
    '<section class="hero" data-page-title="Ignore me"></section>',
    '<section data-note="a > b" class="cover page featured" data-page-title="Intro"></section>',
    "<section class='page detail' data-page-title='Appendix'></section>",
    "</body>",
    "</html>",
  ].join("");

  assert.deepEqual(extractPageTitles(html), ["Intro", "Appendix"]);
});

test("validateGeneratedPageHtml rejects animation metadata outside animated preview mode", () => {
  const html = buildSinglePageHtml(
    '<h1>Revenue moat</h1><div data-anim-role="hero" data-anim-enter="fade-up" data-anim-delay="0" data-anim-duration="640" data-anim-order="0">Hero</div>',
  );

  assert.throws(
    () =>
      validateGeneratedPageHtml({
        html,
        expectedPageNumber: 1,
        expectedPageTitle: "Revenue moat",
        htmlOutputMode: "static",
      }),
    /animation metadata outside animated preview mode/i,
  );
});

test("validateGeneratedPageHtml accepts allowed animation metadata in animated preview mode", () => {
  const html = buildSinglePageHtml(
    '<h1>Revenue moat</h1><div data-anim-role="hero" data-anim-enter="fade-up" data-anim-delay="0" data-anim-duration="640" data-anim-order="0">Hero</div>',
  );

  const result = validateGeneratedPageHtml({
    html,
    expectedPageNumber: 1,
    expectedPageTitle: "Revenue moat",
    htmlOutputMode: "animated-preview-js",
  });

  assert.equal(result.pageTitle, "Revenue moat");
  assert.match(result.sectionHtml, /data-anim-role="hero"/);
});

test("validateGeneratedPageHtml accepts common timing units in animated preview mode", () => {
  const html = buildSinglePageHtml(
    '<h1>Revenue moat</h1><div data-anim-role="hero" data-anim-enter="fade-up" data-anim-delay="80ms" data-anim-duration="0.64s" data-anim-order="0">Hero</div>',
  );

  const result = validateGeneratedPageHtml({
    html,
    expectedPageNumber: 1,
    expectedPageTitle: "Revenue moat",
    htmlOutputMode: "animated-preview-js",
  });

  assert.equal(result.pageTitle, "Revenue moat");
  assert.match(result.sectionHtml, /data-anim-duration="0.64s"/);
});

test("validateGeneratedPageHtml extracts page animation manifests and strips template markup", () => {
  const html = buildSinglePageHtml(buildRecorderAnimationSection(buildRecorderManifest()));

  const result = validateGeneratedPageHtml({
    html,
    expectedPageNumber: 1,
    expectedPageTitle: "Revenue moat",
    htmlOutputMode: "animated-preview-js",
  });

  assert.equal(result.pageTitle, "Revenue moat");
  assert.ok(!result.sectionHtml.includes("data-studio-animation-manifest"));
  assert.ok(!result.pageHtml.includes("data-studio-animation-manifest"));
  assert.deepEqual(result.animationPage, {
    pageNumber: 1,
    anchors: ["signal-word", "recorder-wheel", "status-light", "orbit-accent"],
    manifest: {
      version: 1,
      startMode: "entry-then-loop",
      entryTracks: [
        {
          anchor: "recorder-wheel",
          preset: "scale-in",
          delayMs: 120,
          durationMs: 720,
          order: 0,
        },
        {
          anchor: "signal-word",
          preset: "fade-up",
          delayMs: 260,
          durationMs: 680,
          order: 1,
        },
      ],
      loopEffects: [
        {
          kind: "rotate",
          anchor: "recorder-wheel",
          durationMs: 2800,
          direction: "clockwise",
        },
        {
          kind: "ticker",
          anchor: "signal-word",
          items: ["SIGNAL", "ARCHIVE", "TRACE"],
          stepMs: 960,
        },
        {
          kind: "pulse",
          anchor: "status-light",
          durationMs: 1400,
          scaleFrom: 0.92,
          scaleTo: 1.08,
          opacityFrom: 0.35,
          opacityTo: 1,
        },
        {
          kind: "orbit",
          anchor: "orbit-accent",
          durationMs: 2400,
          radiusPx: 12,
          axis: "xy",
        },
      ],
    },
  });
});

test("validateGeneratedPageHtml normalizes safe manifest near-misses", () => {
  const html = buildSinglePageHtml(
    buildRecorderAnimationSection({
      entryTracks: [
        {
          anchor: "recorder-wheel",
          preset: "scale-in",
          delayMs: "120",
          durationMs: "720",
          order: "0",
        },
      ],
      loopEffects: [
        {
          kind: "rotate",
          anchor: "recorder-wheel",
          durationMs: "2800",
          direction: "clockwise",
        },
      ],
    }),
  );

  const result = validateGeneratedPageHtml({
    html,
    expectedPageNumber: 1,
    expectedPageTitle: "Revenue moat",
    htmlOutputMode: "animated-preview-js",
  });

  assert.deepEqual(result.animationPage?.manifest, {
    version: 1,
    startMode: "entry-then-loop",
    entryTracks: [
      {
        anchor: "recorder-wheel",
        preset: "scale-in",
        delayMs: 120,
        durationMs: 720,
        order: 0,
      },
    ],
    loopEffects: [
      {
        kind: "rotate",
        anchor: "recorder-wheel",
        durationMs: 2800,
        direction: "clockwise",
      },
    ],
  });
});

test("validateGeneratedPageHtml drops malformed manifest items but keeps valid survivors", () => {
  const html = buildSinglePageHtml(
    buildRecorderAnimationSection({
      version: 1,
      startMode: "entry-then-loop",
      entryTracks: [
        {
          anchor: "recorder-wheel",
          preset: "scale-in",
          delayMs: 120,
          durationMs: 720,
          order: 0,
        },
        {
          anchor: "signal-word",
          preset: "spin-in",
          delayMs: 260,
          durationMs: 680,
          order: 1,
        },
      ],
      loopEffects: [
        {
          kind: "rotate",
          anchor: "recorder-wheel",
          durationMs: 2800,
        },
        {
          kind: "ticker",
          anchor: "signal-word",
          items: ["SIGNAL"],
          stepMs: "fast",
        },
      ],
    }),
  );

  const result = validateGeneratedPageHtml({
    html,
    expectedPageNumber: 1,
    expectedPageTitle: "Revenue moat",
    htmlOutputMode: "animated-preview-js",
  });

  assert.deepEqual(result.animationPage?.manifest, {
    version: 1,
    startMode: "entry-then-loop",
    entryTracks: [
      {
        anchor: "recorder-wheel",
        preset: "scale-in",
        delayMs: 120,
        durationMs: 720,
        order: 0,
      },
    ],
    loopEffects: [
      {
        kind: "rotate",
        anchor: "recorder-wheel",
        durationMs: 2800,
      },
    ],
  });
});

test("validateGeneratedPageHtml rejects animation manifest anchors missing from the page", () => {
  const html = buildSinglePageHtml(
    [
      '<h1 data-anim-anchor="headline">Revenue moat</h1>',
      '<template data-studio-animation-manifest>',
      JSON.stringify({
        version: 1,
        startMode: "entry-then-loop",
        loopEffects: [
          {
            kind: "rotate",
            anchor: "missing-anchor",
            durationMs: 1600,
          },
        ],
      }),
      "</template>",
    ].join(""),
  );

  assert.throws(
    () =>
      validateGeneratedPageHtml({
        html,
        expectedPageNumber: 1,
        expectedPageTitle: "Revenue moat",
        htmlOutputMode: "animated-preview-js",
      }),
    /missing anchor: missing-anchor/i,
  );
});

test("validateGeneratedPageHtml rejects unsupported animation loop kinds with a specific error", () => {
  const html = buildSinglePageHtml(
    buildRecorderAnimationSection({
      version: 1,
      startMode: "entry-then-loop",
      loopEffects: [
        {
          kind: "sparkle",
          anchor: "recorder-wheel",
          durationMs: 1600,
        },
      ],
    }),
  );

  assert.throws(
    () =>
      validateGeneratedPageHtml({
        html,
        expectedPageNumber: 1,
        expectedPageTitle: "Revenue moat",
        htmlOutputMode: "animated-preview-js",
      }),
    /unsupported animation loop kind: sparkle/i,
  );
});

test("validateGeneratedPageHtml rejects invalid manifest anchors with a specific error", () => {
  const html = buildSinglePageHtml(
    buildRecorderAnimationSection({
      version: 1,
      startMode: "entry-then-loop",
      loopEffects: [
        {
          kind: "rotate",
          anchor: "Recorder Wheel",
          durationMs: 1600,
        },
      ],
    }),
  );

  assert.throws(
    () =>
      validateGeneratedPageHtml({
        html,
        expectedPageNumber: 1,
        expectedPageTitle: "Revenue moat",
        htmlOutputMode: "animated-preview-js",
      }),
    /invalid animation anchor: Recorder Wheel/i,
  );
});

test("validateGeneratedPageHtml rejects non-json animation manifests", () => {
  const html = buildSinglePageHtml(
    [
      '<h1 data-anim-anchor="signal-word">Archive the signal</h1>',
      '<template data-studio-animation-manifest>this is not json</template>',
    ].join(""),
  );

  assert.throws(
    () =>
      validateGeneratedPageHtml({
        html,
        expectedPageNumber: 1,
        expectedPageTitle: "Revenue moat",
        htmlOutputMode: "animated-preview-js",
      }),
    /invalid animation manifest json/i,
  );
});

test("validateGeneratedPageHtml preserves only surviving repair-time loop effects", () => {
  const html = buildSinglePageHtml(
    '<h1 data-anim-anchor="dial">Revenue moat</h1><div data-anim-anchor="dial">Dial</div>',
  );

  const result = validateGeneratedPageHtml({
    html,
    expectedPageNumber: 1,
    expectedPageTitle: "Revenue moat",
    htmlOutputMode: "animated-preview-js",
    previousAnimationPage: {
      pageNumber: 1,
      anchors: ["dial", "letters"],
      manifest: {
        version: 1,
        startMode: "entry-then-loop",
        loopEffects: [
          {
            kind: "rotate",
            anchor: "dial",
            durationMs: 1600,
            direction: "clockwise",
          },
          {
            kind: "ticker",
            anchor: "letters",
            items: ["A", "B"],
            stepMs: 420,
          },
        ],
      },
    },
  });

  assert.deepEqual(result.animationPage, {
    pageNumber: 1,
    anchors: ["dial"],
    manifest: {
      version: 1,
      startMode: "entry-then-loop",
      loopEffects: [
        {
          kind: "rotate",
          anchor: "dial",
          durationMs: 1600,
          direction: "clockwise",
        },
      ],
    },
  });
});

test("buildSanitizedFinalReport preserves htmlOutputMode", () => {
  const html = buildSinglePageHtml("<h1>Revenue moat</h1><p>Keep one strong claim per page.</p>");
  const report = buildSanitizedFinalReport({
    html,
    brief: "Create an animated preview page about a revenue moat.",
    fallbackTitle: "Revenue moat",
    htmlOutputMode: "animated-preview-js",
  });

  assert.equal(report.htmlOutputMode, "animated-preview-js");
});

test("buildSanitizedFinalReport preserves animationStructure", () => {
  const html = buildSinglePageHtml("<h1 data-anim-anchor=\"dial\">Revenue moat</h1>");
  const report = buildSanitizedFinalReport({
    html,
    brief: "Create an animated preview page about a revenue moat.",
    fallbackTitle: "Revenue moat",
    htmlOutputMode: "animated-preview-js",
    animationStructure: {
      pages: [
        {
          pageNumber: 1,
          anchors: ["dial"],
          manifest: {
            version: 1,
            startMode: "entry-then-loop",
            loopEffects: [
              {
                kind: "rotate",
                anchor: "dial",
                durationMs: 1600,
                direction: "clockwise",
              },
            ],
          },
        },
      ],
    },
  });

  assert.deepEqual(report.animationStructure, {
    pages: [
      {
        pageNumber: 1,
        anchors: ["dial"],
        manifest: {
          version: 1,
          startMode: "entry-then-loop",
          loopEffects: [
            {
              kind: "rotate",
              anchor: "dial",
              durationMs: 1600,
              direction: "clockwise",
            },
          ],
        },
      },
    ],
  });
});
