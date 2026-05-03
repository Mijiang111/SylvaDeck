import {
  PPT_LAYOUT,
  type PptExportChartModel,
  type PptExportDiagnostic,
  type PptExportSlideModel,
  type PptExportTableModel,
  type PptExportTextNode,
  type PptExportVisualNode,
  type PptxExportChartNode,
  type PptxExportDocument,
  type PptxExportIssueSeverity,
  type PptxExportNode,
  type PptxExportPageQualityReport,
  type PptxExportQualityIssue,
  type PptxExportQualityReport,
  type PptxExportShapeNode,
  type PptxExportSlide,
  type PptxExportTableNode,
  type PptxExportTextNode,
} from "./types";
import { buildPptxContractQualityIssues } from "./contract-repair";

function boundsFromNode(node: { x: number; y: number; w: number; h: number }) {
  return {
    x: node.x,
    y: node.y,
    w: node.w,
    h: node.h,
  };
}

function defaultDiagnosticSeverity(diagnostic: Pick<PptExportDiagnostic, "code">): PptxExportIssueSeverity {
  switch (diagnostic.code) {
    case "html-report-missing":
    case "frame-missing":
    case "page-missing":
    case "xml-package-invalid":
    case "relationship-target-missing":
    case "export-contract-render-target-missing":
    case "visual-chart-snapshot-missing":
    case "visual-chart-rasterization-failed":
    case "zero-size-ext":
    case "slide-transparent-only":
    case "contract-owner-rendered-nothing":
    case "powerpoint-repair-risk-xml":
      return "fatal";
    case "block-missing":
    case "visual-missing":
    case "chart-native-unsupported":
    case "chart-image-fallback":
    case "table-native-unsupported":
    case "gradient-flattened":
    case "color-fallback":
      return "degraded";
    case "native-chart-exported":
    case "visual-chart-exported":
    case "native-chart-visible":
    case "chart-contract-detected":
    case "export-contract-detected":
    case "hidden-native-chart-data":
    case "page-archetype-detected":
      return "success";
    case "chart-contract-blocked":
      return "info";
    case "export-contract-missing":
    case "export-contract-kind-mismatch":
    case "export-contract-forbidden-violation":
    case "export-contract-native-table-missing-data":
    case "export-data-contract-missing":
    case "export-data-contract-invalid":
    case "export-data-contract-incompatible":
    case "export-data-contract-minimum-data-missing":
      return "degraded";
    case "export-contract-duplicate-ownership":
      return "degraded";
    case "hybrid-chart-exported":
    case "visual-clipped":
    case "text-owned":
    case "shape-owned":
    case "dom-geometry-chart-visible":
    case "container-text-suppressed":
    case "hidden-placeholder-skipped":
    case "unlabeled-fallback-used":
    case "page-archetype-repeated":
    case "page-ir-metadata-missing":
      return "info";
    case "ownership-conflict":
      return "degraded";
    default:
      return "info";
  }
}

function defaultCountsAgainstQuality(severity: PptxExportIssueSeverity) {
  return severity === "fatal" || severity === "degraded";
}

export function normalizePptxDiagnostics(diagnostics: PptExportDiagnostic[]) {
  return diagnostics.map((diagnostic) => {
    const severity = diagnostic.severity ?? defaultDiagnosticSeverity(diagnostic);
    return {
      ...diagnostic,
      severity,
      countsAgainstQuality:
        diagnostic.countsAgainstQuality ?? defaultCountsAgainstQuality(severity),
    } satisfies PptExportDiagnostic;
  });
}

export function filterPptxWarnings(diagnostics: PptExportDiagnostic[]) {
  return normalizePptxDiagnostics(diagnostics).filter(
    (diagnostic) => diagnostic.severity === "fatal" || diagnostic.severity === "degraded",
  );
}

function issuesFromDiagnostics(diagnostics: PptExportDiagnostic[]) {
  return normalizePptxDiagnostics(diagnostics).map(
    (diagnostic): PptxExportQualityIssue => ({
      code: diagnostic.code,
      severity: diagnostic.severity ?? defaultDiagnosticSeverity(diagnostic),
      message: diagnostic.message,
      pageNumber: diagnostic.pageNumber,
      sourceId: diagnostic.sourceId,
      sourceKind: diagnostic.sourceKind,
      renderMode: diagnostic.renderMode,
      countsAgainstQuality: diagnostic.countsAgainstQuality,
      chartFamily: diagnostic.chartFamily,
      chartNativeEligibility: diagnostic.chartNativeEligibility,
      chartBlockedReason: diagnostic.chartBlockedReason,
      exportObjectId: diagnostic.exportObjectId,
      exportObjectKind: diagnostic.exportObjectKind,
      exportRenderTarget: diagnostic.exportRenderTarget,
      exportDataContractType: diagnostic.exportDataContractType,
      pageLayoutArchetype: diagnostic.pageLayoutArchetype,
      pageVisualGrammar: diagnostic.pageVisualGrammar,
    }),
  );
}

function dedupeIssues(issues: PptxExportQualityIssue[]) {
  const seen = new Set<string>();
  const deduped: PptxExportQualityIssue[] = [];

  for (const issue of issues) {
    const key = [
      issue.code,
      issue.pageNumber ?? "deck",
      issue.nodeId ?? "",
      issue.sourceId ?? "",
      issue.message,
    ].join(":");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(issue);
  }

  return deduped;
}

function countsAgainstQuality(issue: PptxExportQualityIssue) {
  return issue.countsAgainstQuality ?? defaultCountsAgainstQuality(issue.severity);
}

function textToIrNode(
  node: PptExportTextNode,
  pageNumber: number,
  index: number,
): PptxExportTextNode {
  return {
    ...node,
    nodeType: "text",
    id: `p${pageNumber}-text-${index + 1}`,
    sourceId: node.sourceElementId ?? node.ownerId ?? `text-${index + 1}`,
    sourceKind:
      node.ownerKind === "chart" ||
      node.ownerKind === "matrix" ||
      node.ownerKind === "diagram" ||
      node.ownerKind === "table" ||
      node.ownerKind === "page" ||
      node.ownerKind === "block"
        ? node.ownerKind
        : "block",
    sourceOrder: node.sourceOrder,
    zOrder: node.zOrder,
    layerRole: node.layerRole ?? "text",
    boundsIn: boundsFromNode(node),
    editability: "native",
    qualityIssues: [],
  };
}

function shapeToIrNode(
  node: PptExportVisualNode,
  pageNumber: number,
  index: number,
): PptxExportShapeNode {
  return {
    ...node,
    nodeType: "shape",
    id: `p${pageNumber}-shape-${index + 1}`,
    sourceId: node.sourceElementId ?? node.ownerId ?? node.role ?? `shape-${index + 1}`,
    sourceKind:
      node.ownerKind === "chart" ||
      node.ownerKind === "matrix" ||
      node.ownerKind === "diagram" ||
      node.ownerKind === "table" ||
      node.ownerKind === "page"
        ? node.ownerKind
        : "visual",
    sourceOrder: node.sourceOrder,
    zOrder: node.zOrder,
    layerRole: node.layerRole ?? "shape",
    boundsIn: boundsFromNode(node),
    editability: "native",
    qualityIssues: [],
  };
}

function chartToIrNode(
  node: PptExportChartModel,
  pageNumber: number,
  index: number,
): PptxExportChartNode {
  const qualityIssues: PptxExportQualityIssue[] = [];
  if (node.renderMode === "image") {
    if (node.fallbackAsset?.reason !== "visual-chart-exported") {
      qualityIssues.push({
        code: "object-image-fallback",
        severity: "degraded",
        pageNumber,
        message: "Chart was exported as an image fallback.",
        renderMode: "image",
        countsAgainstQuality: true,
      });
    }
  } else if (node.renderMode === "hybrid") {
    qualityIssues.push({
      code: "object-hybrid-fallback",
      severity: "degraded",
      pageNumber,
      message: "Chart used hybrid export to preserve visibility.",
      renderMode: "hybrid",
      countsAgainstQuality: true,
    });
  }

  return {
    ...node,
    nodeType: "chart",
    id: `p${pageNumber}-chart-${index + 1}`,
    sourceId: node.sourceElementId ?? node.title ?? node.chartKind ?? `chart-${index + 1}`,
    sourceKind: "chart",
    sourceOrder: node.sourceOrder,
    zOrder: node.zOrder,
    layerRole: node.layerRole ?? "chart",
    boundsIn: boundsFromNode(node),
    editability:
      node.renderMode === "native" ? "native" : node.renderMode === "hybrid" ? "hybrid" : "image",
    qualityIssues,
  };
}

function tableToIrNode(
  node: PptExportTableModel,
  pageNumber: number,
  index: number,
): PptxExportTableNode {
  const qualityIssues: PptxExportQualityIssue[] =
    node.renderMode === "image"
      ? [
          {
            code: "table-unsupported",
            severity: "degraded",
            pageNumber,
            message: "Table required an image fallback instead of a native PowerPoint table.",
            renderMode: "image",
            countsAgainstQuality: true,
          },
        ]
      : [];

  return {
    ...node,
    nodeType: "table",
    id: `p${pageNumber}-table-${index + 1}`,
    sourceId: node.sourceElementId ?? `table-${index + 1}`,
    sourceKind: "table",
    sourceOrder: node.sourceOrder,
    zOrder: node.zOrder,
    layerRole: node.layerRole ?? "table",
    boundsIn: boundsFromNode(node),
    editability: node.renderMode === "native" ? "native" : "image",
    qualityIssues,
  };
}

function slideToIr(slide: PptExportSlideModel): PptxExportSlide {
  const nodes = [
    ...slide.textNodes.map((node, index) => textToIrNode(node, slide.pageNumber, index)),
    ...slide.shapeNodes.map((node, index) => shapeToIrNode(node, slide.pageNumber, index)),
    ...slide.chartNodes.map((node, index) => chartToIrNode(node, slide.pageNumber, index)),
    ...(slide.tableNodes ?? []).map((node, index) => tableToIrNode(node, slide.pageNumber, index)),
  ].sort((left, right) => {
    const zDelta = (left.zOrder ?? 0) - (right.zOrder ?? 0);
    if (zDelta !== 0) {
      return zDelta;
    }
    return (left.sourceOrder ?? 0) - (right.sourceOrder ?? 0);
  });

  return {
    pageNumber: slide.pageNumber,
    title: slide.title,
    backgroundColor: slide.backgroundColor,
    theme: slide.theme,
    size: {
      widthInches: PPT_LAYOUT.widthInches,
      heightInches: PPT_LAYOUT.heightInches,
    },
    nodes,
  };
}

export function buildPptxExportDocument(args: {
  slides: PptExportSlideModel[];
  diagnostics: PptExportDiagnostic[];
}): PptxExportDocument {
  const diagnostics = normalizePptxDiagnostics(args.diagnostics);
  return {
    version: 1,
    layout: PPT_LAYOUT,
    slides: args.slides.map(slideToIr),
    diagnostics,
    warnings: filterPptxWarnings(diagnostics),
  };
}

function validateNode(slide: PptxExportSlide, node: PptxExportNode) {
  const issues = [...node.qualityIssues];
  const left = Math.min(node.boundsIn.x, node.boundsIn.x + node.boundsIn.w);
  const top = Math.min(node.boundsIn.y, node.boundsIn.y + node.boundsIn.h);
  const right = Math.max(node.boundsIn.x, node.boundsIn.x + node.boundsIn.w);
  const bottom = Math.max(node.boundsIn.y, node.boundsIn.y + node.boundsIn.h);
  const outOfBounds =
    left < -0.01 ||
    top < -0.01 ||
    right > slide.size.widthInches + 0.01 ||
    bottom > slide.size.heightInches + 0.01;

  const hasZeroSizeExtent =
    node.nodeType === "shape" && node.shape === "line"
      ? Math.abs(node.boundsIn.w) < 1e-9 && Math.abs(node.boundsIn.h) < 1e-9
      : Math.abs(node.boundsIn.w) < 1e-9 || Math.abs(node.boundsIn.h) < 1e-9;
  if (hasZeroSizeExtent) {
    issues.push({
      code: "zero-size-ext",
      severity: "fatal",
      pageNumber: slide.pageNumber,
      nodeId: node.id,
      sourceId: node.sourceId,
      sourceKind: node.sourceKind,
      countsAgainstQuality: true,
      message: "Export object has a zero-size PowerPoint extent.",
    });
  }

  if (outOfBounds) {
    issues.push({
      code: "object-out-of-bounds",
      severity: "degraded",
      pageNumber: slide.pageNumber,
      nodeId: node.id,
      sourceId: node.sourceId,
      sourceKind: node.sourceKind,
      countsAgainstQuality: true,
      message: "Export object extends outside the 16:9 slide bounds.",
    });
  }

  const tooSmall =
    node.nodeType === "shape" && node.shape === "line"
      ? Math.hypot(node.boundsIn.w, node.boundsIn.h) < 0.04
      : Math.abs(node.boundsIn.w) < 0.04 || Math.abs(node.boundsIn.h) < 0.04;

  if (tooSmall) {
    issues.push({
      code: "object-too-small",
      severity: "degraded",
      pageNumber: slide.pageNumber,
      nodeId: node.id,
      sourceId: node.sourceId,
      sourceKind: node.sourceKind,
      countsAgainstQuality: true,
      message: "Export object is too small to remain reliable in PowerPoint.",
    });
  }

  if (node.nodeType === "text" && !node.text.trim() && !node.items?.length) {
    issues.push({
      code: "object-empty-text",
      severity: "degraded",
      pageNumber: slide.pageNumber,
      nodeId: node.id,
      sourceId: node.sourceId,
      sourceKind: node.sourceKind,
      countsAgainstQuality: true,
      message: "Text object has no exportable content.",
    });
  }

  return issues;
}

function paintIsVisible(paint: PptExportVisualNode["paint"]) {
  if (paint.type === "solid") {
    return (paint.transparency ?? 0) < 100;
  }
  if (paint.type === "linearGradient") {
    return paint.stops.some((stop) => (stop.transparency ?? 0) < 100);
  }
  return false;
}

function nodeContributesVisibleContent(node: PptxExportNode) {
  if (node.nodeType === "text") {
    return Boolean(node.text.trim() || node.items?.some((item) => item.trim()));
  }
  if (node.nodeType === "chart") {
    return node.renderMode !== "image" || Boolean(node.fallbackAsset?.data);
  }
  if (node.nodeType === "table") {
    return node.rows.some((row) => row.some((cell) => cell.trim()));
  }
  if (node.nodeType === "shape") {
    return (
      paintIsVisible(node.paint) ||
      Boolean(node.lineColor && (node.lineTransparency ?? 0) < 100 && (node.lineWidthPt ?? 0.75) > 0)
    );
  }
  return false;
}

function validateSlide(slide: PptxExportSlide) {
  const issues: PptxExportQualityIssue[] = [];
  if (!slide.nodes.length) {
    issues.push({
      code: "slide-empty",
      severity: "fatal",
      pageNumber: slide.pageNumber,
      countsAgainstQuality: true,
      message: "Slide has no exportable PowerPoint objects.",
    });
  }

  if (slide.nodes.length && !slide.nodes.some(nodeContributesVisibleContent)) {
    issues.push({
      code: "slide-transparent-only",
      severity: "fatal",
      pageNumber: slide.pageNumber,
      countsAgainstQuality: true,
      message: "Slide has export objects, but none contribute visible content.",
    });
  }

  slide.nodes.forEach((node) => {
    issues.push(...validateNode(slide, node));
  });

  return issues;
}

function countByEditability(slide: PptxExportSlide, editability: "native" | "hybrid" | "image") {
  return slide.nodes.filter((node) => node.editability === editability).length;
}

function isVisualChartSnapshotNode(node: PptxExportNode) {
  return (
    node.nodeType === "chart" &&
    node.editability === "image" &&
    node.fallbackAsset?.reason === "visual-chart-exported"
  );
}

function countQualityFallbackObjects(slide: PptxExportSlide) {
  return slide.nodes.filter(
    (node) => (node.editability === "hybrid" || node.editability === "image") && !isVisualChartSnapshotNode(node),
  ).length;
}

function pageReportForSlide(
  slide: PptxExportSlide,
  diagnosticIssues: PptxExportQualityIssue[],
): PptxExportPageQualityReport {
  const issues = dedupeIssues([
    ...diagnosticIssues.filter((issue) => issue.pageNumber === slide.pageNumber),
    ...validateSlide(slide),
  ]);
  const fatalCount = issues.filter(
    (issue) => issue.severity === "fatal" && countsAgainstQuality(issue),
  ).length;
  const degradedCount = issues.filter(
    (issue) => issue.severity === "degraded" && countsAgainstQuality(issue),
  ).length;

  return {
    pageNumber: slide.pageNumber,
    issueCount: issues.length,
    fatalCount,
    degradedCount,
    nativeObjectCount: countByEditability(slide, "native"),
    fallbackObjectCount: countQualityFallbackObjects(slide),
    chartContractCandidateCount:
      slide.nodes.filter((node) => node.nodeType === "chart" && node.chartContract).length +
      issues.filter((issue) => issue.code === "chart-contract-blocked").length,
    blockedChartContractCount: issues.filter((issue) => issue.code === "chart-contract-blocked").length,
    exportContractCandidateCount: issues.filter((issue) => issue.code === "export-contract-detected").length,
    exportContractViolationCount: issues.filter(
      (issue) =>
        issue.code === "export-contract-missing" ||
        issue.code === "export-contract-kind-mismatch" ||
        issue.code === "export-contract-forbidden-violation" ||
        issue.code === "export-contract-native-table-missing-data" ||
        issue.code === "export-contract-duplicate-ownership" ||
        issue.code === "export-contract-render-target-missing" ||
        issue.code === "export-data-contract-missing" ||
        issue.code === "export-data-contract-invalid" ||
        issue.code === "export-data-contract-incompatible" ||
        issue.code === "export-data-contract-minimum-data-missing",
    ).length,
    issues,
  };
}

function incrementRecord(record: Record<string, number>, key: string) {
  record[key] = (record[key] ?? 0) + 1;
}

function fallbackReasonForNode(node: PptxExportNode) {
  if (node.editability === "native") {
    return null;
  }
  if (node.nodeType === "chart") {
    return node.fallbackAsset?.reason ?? node.fallbackMode ?? node.renderMode;
  }
  if (node.nodeType === "table") {
    return node.fallbackAsset?.reason ?? "table-fallback";
  }
  return "object-fallback";
}

function pageArchetypeSequenceFromDiagnostics(diagnostics: PptExportDiagnostic[]) {
  const byPage = new Map<number, NonNullable<PptExportDiagnostic["pageLayoutArchetype"]>>();
  for (const diagnostic of diagnostics) {
    if (
      diagnostic.code === "page-archetype-detected" &&
      diagnostic.pageNumber &&
      diagnostic.pageLayoutArchetype
    ) {
      byPage.set(diagnostic.pageNumber, diagnostic.pageLayoutArchetype);
    }
  }
  return Array.from(byPage.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([pageNumber, archetype]) => ({ pageNumber, archetype }));
}

function buildRepeatedArchetypeIssues(
  sequence: ReturnType<typeof pageArchetypeSequenceFromDiagnostics>,
): PptxExportQualityIssue[] {
  const issues: PptxExportQualityIssue[] = [];
  let runStart = 0;
  for (let index = 1; index <= sequence.length; index += 1) {
    const current = sequence[index];
    const previous = sequence[index - 1];
    if (current && previous && current.archetype === previous.archetype) {
      continue;
    }
    const run = sequence.slice(runStart, index);
    if (run.length >= 3 && run[0]) {
      issues.push({
        code: "page-archetype-repeated",
        severity: "info",
        pageNumber: run[0].pageNumber,
        sourceKind: "deck",
        pageLayoutArchetype: run[0].archetype,
        countsAgainstQuality: false,
        message: `${run.length} consecutive pages use layoutArchetype ${run[0].archetype}; vary the visual grammar unless the source demands repetition.`,
      });
    }
    runStart = index;
  }
  return issues;
}

function summarizePageArchetypes(args: {
  diagnostics: PptExportDiagnostic[];
  repeatedIssues: PptxExportQualityIssue[];
}) {
  const sequence = pageArchetypeSequenceFromDiagnostics(args.diagnostics);
  const byArchetype: Record<string, number> = {};
  let repeatedRunLength = 0;
  let currentRunLength = 0;
  let currentArchetype: string | null = null;
  for (const item of sequence) {
    incrementRecord(byArchetype, item.archetype);
    if (item.archetype === currentArchetype) {
      currentRunLength += 1;
    } else {
      currentArchetype = item.archetype;
      currentRunLength = 1;
    }
    repeatedRunLength = Math.max(repeatedRunLength, currentRunLength);
  }
  return {
    sequence,
    byArchetype,
    repeatedRunLength,
    repeatedRunWarningCount: args.repeatedIssues.length,
    metadataWarningCount: args.diagnostics.filter((diagnostic) => diagnostic.code === "page-ir-metadata-missing").length,
  };
}

export function buildPptxExportQualityReport(document: PptxExportDocument): PptxExportQualityReport {
  const pageArchetypeSequence = pageArchetypeSequenceFromDiagnostics(document.diagnostics);
  const repeatedArchetypeIssues = buildRepeatedArchetypeIssues(pageArchetypeSequence);
  const diagnosticIssues = [
    ...issuesFromDiagnostics(document.diagnostics),
    ...repeatedArchetypeIssues,
  ];
  const contractRepairIssues = buildPptxContractQualityIssues({
    diagnostics: document.diagnostics,
  });
  const deckIssues = diagnosticIssues.filter((issue) => !issue.pageNumber);
  const pages = document.slides.map((slide) => pageReportForSlide(slide, diagnosticIssues));
  const fatalCount =
    deckIssues.filter((issue) => issue.severity === "fatal" && countsAgainstQuality(issue)).length +
    pages.reduce((sum, page) => sum + page.fatalCount, 0);
  const degradedCount =
    deckIssues.filter((issue) => issue.severity === "degraded" && countsAgainstQuality(issue)).length +
    pages.reduce((sum, page) => sum + page.degradedCount, 0);
  const infoCount =
    deckIssues.filter((issue) => issue.severity === "info" || issue.severity === "success").length +
    pages.reduce(
      (sum, page) =>
        sum +
        page.issues.filter((issue) => issue.severity === "info" || issue.severity === "success")
          .length,
      0,
    );
  const nativeObjectCount = pages.reduce((sum, page) => sum + page.nativeObjectCount, 0);
  const fallbackObjectCount = pages.reduce((sum, page) => sum + page.fallbackObjectCount, 0);
  const issueCount = fatalCount + degradedCount + infoCount;
  const fallbackCountByReason: Record<string, number> = {};
  const nativeChartCountByKind: Record<string, number> = {};
  const chartContractByFamily: Record<string, number> = {};
  const chartContractByEligibility: Record<string, number> = {};
  const exportContractByKind: Record<string, number> = {};
  const exportContractByRenderTarget: Record<string, number> = {};
  const exportContractByDataContractType: Record<string, number> = {};
  let chartContractCandidateCount = 0;
  let blockedChartContractCount = 0;
  let exportContractCandidateCount = 0;
  let exportContractViolationCount = 0;
  let strongDataContractCount = 0;
  let invalidDataContractCount = 0;
  let unlabeledFallbackCount = 0;
  let blockedCoreVisualCount = 0;
  let snapshotObjectCount = 0;
  let nativeTableCount = 0;
  let matrixShapeCount = 0;
  let blockedInterpretationCount = 0;
  let contractMismatchCount = 0;
  let rasterizationFailureCount = 0;
  const pageArchetypeSummary = summarizePageArchetypes({
    diagnostics: document.diagnostics,
    repeatedIssues: repeatedArchetypeIssues,
  });

  for (const slide of document.slides) {
    for (const node of slide.nodes) {
      const fallbackReason = fallbackReasonForNode(node);
      if (fallbackReason) {
        incrementRecord(fallbackCountByReason, fallbackReason);
      }
      if (node.nodeType === "chart" && node.editability === "native") {
        incrementRecord(nativeChartCountByKind, node.chartKind ?? "chart");
      }
      if (
        node.nodeType === "chart" &&
        node.renderMode === "image" &&
        node.fallbackAsset?.reason === "visual-chart-exported"
      ) {
        snapshotObjectCount += 1;
      }
      if (node.nodeType === "table" && node.editability === "native") {
        nativeTableCount += 1;
      }
      if (node.nodeType === "chart" && node.chartKind === "matrix" && node.renderMode === "native") {
        matrixShapeCount += 1;
      }
      if (node.nodeType === "chart" && node.chartContract) {
        chartContractCandidateCount += 1;
        incrementRecord(chartContractByFamily, node.chartContract.family);
        incrementRecord(chartContractByEligibility, node.chartContract.nativeEligibility);
        if (node.chartContract.nativeEligibility === "blocked") {
          blockedChartContractCount += 1;
        }
      }
    }
  }
  for (const diagnostic of document.diagnostics) {
    if (diagnostic.code === "chart-contract-blocked") {
      chartContractCandidateCount += 1;
      incrementRecord(chartContractByFamily, diagnostic.chartFamily ?? "unknown");
      incrementRecord(chartContractByEligibility, diagnostic.chartNativeEligibility ?? "blocked");
      blockedChartContractCount += 1;
    }
    if (diagnostic.code === "export-contract-detected") {
      exportContractCandidateCount += 1;
      incrementRecord(exportContractByKind, diagnostic.exportObjectKind ?? "unknown");
      incrementRecord(exportContractByRenderTarget, diagnostic.exportRenderTarget ?? "unknown");
      if (diagnostic.exportDataContractType && diagnostic.exportDataContractType !== "missing-data") {
        strongDataContractCount += 1;
        incrementRecord(exportContractByDataContractType, diagnostic.exportDataContractType);
      }
    }
    if (diagnostic.code === "unlabeled-fallback-used") {
      unlabeledFallbackCount += 1;
    }
    if (diagnostic.code === "export-contract-forbidden-violation") {
      blockedInterpretationCount += 1;
    }
    if (diagnostic.code === "visual-chart-rasterization-failed") {
      rasterizationFailureCount += 1;
    }
    if (
      diagnostic.code === "export-contract-missing" ||
      diagnostic.code === "export-contract-kind-mismatch" ||
      diagnostic.code === "export-contract-forbidden-violation" ||
      diagnostic.code === "export-contract-native-table-missing-data" ||
      diagnostic.code === "export-contract-duplicate-ownership" ||
      diagnostic.code === "export-contract-render-target-missing" ||
      diagnostic.code === "export-data-contract-missing" ||
      diagnostic.code === "export-data-contract-invalid" ||
      diagnostic.code === "export-data-contract-incompatible" ||
      diagnostic.code === "export-data-contract-minimum-data-missing"
    ) {
      exportContractViolationCount += 1;
      contractMismatchCount += 1;
      if (
        diagnostic.code === "export-data-contract-invalid" ||
        diagnostic.code === "export-data-contract-incompatible"
      ) {
        invalidDataContractCount += 1;
      }
      if (
        diagnostic.code === "export-data-contract-missing" ||
        diagnostic.code === "export-data-contract-invalid" ||
        diagnostic.code === "export-data-contract-incompatible" ||
        diagnostic.code === "export-data-contract-minimum-data-missing" ||
        diagnostic.code === "export-contract-render-target-missing"
      ) {
        blockedCoreVisualCount += 1;
      }
      if (diagnostic.exportObjectKind) {
        incrementRecord(exportContractByKind, diagnostic.exportObjectKind);
      }
      if (diagnostic.exportRenderTarget) {
        incrementRecord(exportContractByRenderTarget, diagnostic.exportRenderTarget);
      }
      if (diagnostic.exportDataContractType) {
        incrementRecord(exportContractByDataContractType, diagnostic.exportDataContractType);
      }
    }
  }

  const fatalPenalty = fatalCount * 25;
  const degradedPenalty = degradedCount * 5;
  const fallbackPenalty = fallbackObjectCount * 10;
  const score = Math.max(
    0,
    Math.min(100, 100 - fatalPenalty - degradedPenalty - fallbackPenalty),
  );
  const acceptanceFailures = [
    ...(fatalCount ? ["fatal-export-issues"] : []),
    ...(degradedCount ? ["degraded-export-issues"] : []),
    ...(fallbackObjectCount ? ["unexpected-fallback-objects"] : []),
  ];

  return {
    score,
    scoreBreakdown: {
      base: 100,
      fatalPenalty,
      degradedPenalty,
      fallbackPenalty,
      final: score,
      countsAgainstQualityIssueCount: fatalCount + degradedCount,
    },
    nativeObjectCount,
    fallbackObjectCount,
    fallbackCountByReason,
    nativeChartCountByKind,
    chartContracts: {
      candidateCount: chartContractCandidateCount,
      blockedCount: blockedChartContractCount,
      byFamily: chartContractByFamily,
      byEligibility: chartContractByEligibility,
    },
    exportContracts: {
      candidateCount: exportContractCandidateCount,
      violationCount: exportContractViolationCount,
      strongDataContractCount,
      invalidDataContractCount,
      unlabeledFallbackCount,
      blockedCoreVisualCount,
      contractIssueCount: contractRepairIssues.length,
      contractIssues: contractRepairIssues,
      contractRepairIssueCount: contractRepairIssues.length,
      repairIssues: contractRepairIssues,
      byKind: exportContractByKind,
      byRenderTarget: exportContractByRenderTarget,
      byDataContractType: exportContractByDataContractType,
    },
    deterministicConsumer: {
      contractObjects: exportContractCandidateCount,
      snapshotObjects: snapshotObjectCount,
      nativeTables: nativeTableCount,
      matrixShapes: matrixShapeCount,
      legacyFallbacks: unlabeledFallbackCount,
      blockedInterpretations: blockedInterpretationCount,
      contractMismatches: contractMismatchCount,
      rasterizationFailures: rasterizationFailureCount,
    },
    pageArchetypes: pageArchetypeSummary,
    acceptanceFailures,
    fatalCount,
    degradedCount,
    issueCount,
    pages,
  };
}
