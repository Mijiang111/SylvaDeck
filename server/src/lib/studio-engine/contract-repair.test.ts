import assert from "node:assert/strict";
import test from "node:test";
import {
  applyContractRepairMicroPatches,
  buildContractRepairIssues,
} from "./contract-repair.js";
import {
  composeSinglePageHtml,
  type PageExportContractDiagnostic,
  validateGeneratedPageHtml,
} from "./render.js";
import type { ExportObjectContract } from "./schemas.js";

function buildExportObjectContract(
  objectId: string,
  objectKind: ExportObjectContract["objectKind"],
  renderTarget: ExportObjectContract["renderTarget"],
  dataContract: ExportObjectContract["dataContract"],
): ExportObjectContract {
  return {
    objectId,
    pageNumber: 1,
    pageStory: "Contract repair fixture.",
    primaryVisualObject: objectKind,
    objectKind,
    objectRole: "primary",
    dataContract,
    renderTarget,
    ownershipScope: {
      rootId: objectId,
      ownsText: objectKind !== "chart-visual" && objectKind !== "native-chart" && objectKind !== "native-table",
      ownsShapes: objectKind === "matrix",
      ownsSvg: objectKind === "matrix",
      childRoles: [],
    },
    forbiddenInterpretation:
      objectKind === "chart-visual"
        ? ["native-table", "native-chart"]
        : objectKind === "matrix"
          ? ["native-table"]
          : [],
  };
}

function validateSection(sectionHtml: string, expectedContracts: readonly ExportObjectContract[]) {
  return validateGeneratedPageHtml({
    html: composeSinglePageHtml({
      title: "Contract repair",
      sectionHtml,
    }),
    expectedPageNumber: 1,
    expectedPageTitle: "Contract repair",
    expectedExportObjectContracts: expectedContracts,
  });
}

function exportContractAttr(contract: unknown) {
  return JSON.stringify(contract).replaceAll('"', "&quot;");
}

function diagnostic(
  code: PageExportContractDiagnostic["code"],
  objectId: string,
): PageExportContractDiagnostic {
  return {
    code,
    severity: "warning",
    pageNumber: 1,
    objectId,
    message: `Fixture diagnostic: ${code}.`,
  };
}

test("contract repair micro-patches missing mechanical metadata", () => {
  const expected = buildExportObjectContract(
    "p1-primary-chart",
    "chart-visual",
    "visual-snapshot",
    {
      type: "chart-bar",
      categories: ["A", "B"],
      series: [{ name: "Series", values: [1, 2] }],
    },
  );
  const sectionHtml = [
    '<section class="page" data-page-number="1" data-page-title="Contract repair" style="width:1600px;height:900px;">',
    '<h1>Contract repair</h1>',
    `<div data-export-object-id="${expected.objectId}">Chart</div>`,
    "</section>",
  ].join("");
  const issues = buildContractRepairIssues({
    pageNumber: 1,
    sectionHtml,
    diagnostics: [
      diagnostic("export-object-kind-mismatch", expected.objectId),
      diagnostic("export-object-render-target-missing", expected.objectId),
      diagnostic("export-contract-ownership-scope-missing", expected.objectId),
      diagnostic("export-contract-forbidden-interpretation-missing", expected.objectId),
      diagnostic("export-contract-quality-intent-missing", expected.objectId),
      diagnostic("export-data-contract-missing", expected.objectId),
    ],
    expectedContracts: [expected],
  });
  const patched = applyContractRepairMicroPatches({
    sectionHtml,
    issues,
    expectedContracts: [expected],
  });
  const repaired = validateSection(patched.sectionHtml, [expected]);

  assert.equal(patched.changed, true);
  assert.match(patched.sectionHtml, /data-semantic-kind="chart-visual"/);
  assert.match(patched.sectionHtml, /data-render-target="visual-snapshot"/);
  assert.match(patched.sectionHtml, /data-ownership-scope=""/);
  assert.match(patched.sectionHtml, /data-forbidden-export="native-table,native-chart"/);
  assert.match(patched.sectionHtml, /data-export-contract="/);
  assert.deepEqual(repaired.exportContractDiagnostics, []);
});

test("compiler main path handles missing mechanical metadata before contract repair", () => {
  const expected = buildExportObjectContract(
    "p1-primary-chart",
    "chart-visual",
    "visual-snapshot",
    {
      type: "chart-bar",
      categories: ["A", "B"],
      series: [{ name: "Series", values: [1, 2] }],
    },
  );
  const compiled = validateSection(
    [
      '<section class="page" data-page-number="1" data-page-title="Contract repair" style="width:1600px;height:900px;">',
      '<h1>Contract repair</h1>',
      `<div data-export-object-id="${expected.objectId}">Chart</div>`,
      "</section>",
    ].join(""),
    [expected],
  );

  assert.deepEqual(compiled.exportContractDiagnostics, []);
  assert.match(compiled.sectionHtml, /data-semantic-kind="chart-visual"/);
  assert.match(compiled.sectionHtml, /data-render-target="visual-snapshot"/);
  assert.match(compiled.sectionHtml, /data-export-contract="/);
});

test("contract repair does not synthesize missing-data placeholders", () => {
  const expected = buildExportObjectContract(
    "p1-primary-chart",
    "chart-visual",
    "visual-snapshot",
    {
      type: "missing-data",
      expected: "native-chart",
      reason: "Preflight did not have chart data.",
      requiredFields: ["categories", "series"],
    },
  );
  const sectionHtml = [
    '<section class="page" data-page-number="1" data-page-title="Contract repair" style="width:1600px;height:900px;">',
    '<h1>Contract repair</h1>',
    `<div data-export-object-id="${expected.objectId}" data-semantic-kind="chart-visual" data-render-target="visual-snapshot">Chart</div>`,
    "</section>",
  ].join("");
  const issues = buildContractRepairIssues({
    pageNumber: 1,
    sectionHtml,
    diagnostics: [diagnostic("export-data-contract-missing", expected.objectId)],
    expectedContracts: [expected],
  });
  const patched = applyContractRepairMicroPatches({
    sectionHtml,
    issues,
    expectedContracts: [expected],
  });

  assert.equal(
    issues.some((issue) => issue.code === "export-data-contract-missing" && issue.repairTier === "object-model"),
    true,
  );
  assert.equal(patched.sectionHtml.includes("data-export-contract"), false);
});

test("duplicate roots remain object-level diagnostics", () => {
  const expected = buildExportObjectContract(
    "p1-primary-matrix",
    "matrix",
    "editable-shapes",
    {
      type: "matrix",
      axes: { x: { label: "Impact" }, y: { label: "Readiness" } },
      items: [{ label: "Core", x: 0.7, y: 0.6 }],
      renderTarget: "editable-shapes",
    },
  );
  const initial = validateSection(
    [
      '<section class="page" data-page-number="1" data-page-title="Contract repair" style="width:1600px;height:900px;">',
      '<h1>Contract repair</h1>',
      `<div data-export-object-id="${expected.objectId}" data-semantic-kind="matrix" data-render-target="editable-shapes" data-export-contract="${JSON.stringify(expected).replaceAll('"', "&quot;")}">Matrix A</div>`,
      `<div data-export-object-id="${expected.objectId}" data-semantic-kind="matrix" data-render-target="editable-shapes" data-export-contract="${JSON.stringify(expected).replaceAll('"', "&quot;")}">Matrix B</div>`,
      "</section>",
    ].join(""),
    [expected],
  );
  const issues = buildContractRepairIssues({
    pageNumber: 1,
    sectionHtml: initial.sectionHtml,
    diagnostics: initial.exportContractDiagnostics,
    expectedContracts: [expected],
  });
  const duplicateIssue = issues.find((issue) => issue.code === "export-object-duplicate-root");

  assert.equal(duplicateIssue?.repairTier, "object-model");
  assert.equal(duplicateIssue?.ownershipConflict, "duplicate root elements carry the same objectId");
});

test("contract repair normalizes lenient matrix data contracts during deterministic micro-patch", () => {
  const expected = buildExportObjectContract(
    "p1-primary-matrix",
    "matrix",
    "editable-shapes",
    {
      type: "missing-data",
      expected: "matrix",
      reason: "Preflight did not have matrix coordinates.",
      requiredFields: ["axes", "items"],
    },
  );
  const renderedContract = {
    ...expected,
    dataContract: {
      type: "matrix",
      axes: {
        x: { label: "Traffic base", minLabel: "Lower", maxLabel: "Higher" },
        y: { label: "AI monetization clarity", minLabel: "Less evidenced", maxLabel: "More evidenced" },
      },
      quadrants: [
        { id: "q1", label: "High traffic / high AI visibility" },
        { id: "q2", label: "Lower traffic / high AI visibility" },
      ],
      items: [
        { id: "games", label: "Games", x: 84, y: 80, note: "7.8% 2025-30 revenue CAGR" },
        { id: "ads", label: "Ads", x: 74, y: 69, note: "12.4% 2025-30 revenue CAGR" },
      ],
      callout: { text: "AI monetization clusters where Tencent already has scale." },
      renderTarget: "editable-shapes",
    },
  };
  const sectionHtml = [
    '<section class="page" data-page-number="1" data-page-title="Contract repair" style="width:1600px;height:900px;">',
    '<h1>Contract repair</h1>',
    `<div data-export-object-id="${expected.objectId}" data-semantic-kind="matrix" data-render-target="editable-shapes" data-ownership-scope="text,shape,svg" data-forbidden-export="native-table" data-export-contract="${exportContractAttr(renderedContract)}">Matrix</div>`,
    "</section>",
  ].join("");
  const issues = buildContractRepairIssues({
    pageNumber: 1,
    sectionHtml,
    diagnostics: [diagnostic("export-data-contract-invalid", expected.objectId)],
    expectedContracts: [expected],
  });
  const patched = applyContractRepairMicroPatches({
    sectionHtml,
    issues,
    expectedContracts: [expected],
  });

  assert.equal(
    issues.some((issue) => issue.code === "export-data-contract-invalid"),
    true,
  );
  assert.equal(patched.changed, true);
  assert.match(patched.sectionHtml, /&quot;x&quot;:0\.84/);
  assert.match(patched.sectionHtml, /&quot;y&quot;:0\.8/);
  assert.match(patched.sectionHtml, /&quot;detail&quot;:&quot;7\.8% 2025-30 revenue CAGR&quot;/);
  assert.match(patched.sectionHtml, /&quot;title&quot;:&quot;AI monetization clusters where Tencent already has scale\.&quot;/);
});
