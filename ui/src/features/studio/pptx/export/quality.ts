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
    case "native-chart-visible":
    case "hidden-native-chart-data":
      return "success";
    case "hybrid-chart-exported":
    case "visual-clipped":
    case "text-owned":
    case "shape-owned":
    case "dom-geometry-chart-visible":
    case "container-text-suppressed":
    case "hidden-placeholder-skipped":
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
    qualityIssues.push({
      code: "object-image-fallback",
      severity: "degraded",
      pageNumber,
      message: "Chart was exported as an image fallback.",
      renderMode: "image",
      countsAgainstQuality: true,
    });
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

  slide.nodes.forEach((node) => {
    issues.push(...validateNode(slide, node));
  });

  return issues;
}

function countByEditability(slide: PptxExportSlide, editability: "native" | "hybrid" | "image") {
  return slide.nodes.filter((node) => node.editability === editability).length;
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
    fallbackObjectCount: countByEditability(slide, "hybrid") + countByEditability(slide, "image"),
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

export function buildPptxExportQualityReport(document: PptxExportDocument): PptxExportQualityReport {
  const diagnosticIssues = issuesFromDiagnostics(document.diagnostics);
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

  for (const slide of document.slides) {
    for (const node of slide.nodes) {
      const fallbackReason = fallbackReasonForNode(node);
      if (fallbackReason) {
        incrementRecord(fallbackCountByReason, fallbackReason);
      }
      if (node.nodeType === "chart" && node.editability === "native") {
        incrementRecord(nativeChartCountByKind, node.chartKind ?? "chart");
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
    acceptanceFailures,
    fatalCount,
    degradedCount,
    issueCount,
    pages,
  };
}
