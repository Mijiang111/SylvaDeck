import {
  HTML_CHART_SPEC_ATTRIBUTE,
  parseHtmlChartSpec,
} from "@/features/studio/html-report-data-modules";
import type { HtmlChartSpec } from "@/features/studio/types";
import { parseNumericValue } from "../style";
import type {
  PptExportChartBlockedReason,
  PptExportChartContract,
  PptExportChartContractConfidence,
  PptExportChartContractSource,
  PptExportChartFamily,
  PptExportChartNativeEligibility,
  PptxExportBounds,
} from "../types";

const SUPPORTED_CHART_FAMILIES: readonly PptExportChartFamily[] = [
  "bar",
  "stacked",
  "line",
  "combo",
  "waterfall",
  "bubble",
  "matrix",
] as const;

const chartLikeTextPatterns: Array<{ pattern: RegExp; family: PptExportChartFamily | "unknown"; reason: string }> = [
  { pattern: /\bchart-led\b/i, family: "unknown", reason: "chart-led-copy" },
  { pattern: /\b(?:chart|plot|graph)\s+(?:view|says|shows|surface)\b/i, family: "unknown", reason: "chart-copy" },
  { pattern: /\b(?:line|trend|trajectory)\s+(?:chart|view|plot)\b/i, family: "line", reason: "line-copy" },
  { pattern: /\b(?:bar|column)\s+chart\b/i, family: "bar", reason: "bar-copy" },
  { pattern: /\bstacked\s+(?:bar|column|chart)\b/i, family: "stacked", reason: "stacked-copy" },
  { pattern: /\bcombo\s+chart\b/i, family: "combo", reason: "combo-copy" },
  { pattern: /\b(?:waterfall|bridge)\s+(?:chart|view)?\b/i, family: "waterfall", reason: "waterfall-copy" },
  { pattern: /\bbubble\s+(?:chart|matrix|plot)\b/i, family: "bubble", reason: "bubble-copy" },
  { pattern: /\b(?:matrix|quadrant)\s+(?:view|chart|plot|map)\b/i, family: "matrix", reason: "matrix-copy" },
  { pattern: /\bwhat\s+the\s+(?:chart|range|plot)\s+says\b/i, family: "unknown", reason: "chart-interpretation-copy" },
  { pattern: /\b(?:x[- ]axis|y[- ]axis|axis label|gridline)\b/i, family: "unknown", reason: "axis-copy" },
];

export function isSupportedChartFamily(value: unknown): value is PptExportChartFamily {
  return typeof value === "string" && SUPPORTED_CHART_FAMILIES.includes(value as PptExportChartFamily);
}

function nativeEligibilityForFamily(
  family: PptExportChartFamily | "unknown",
  blockedReason?: PptExportChartBlockedReason,
): PptExportChartNativeEligibility {
  if (blockedReason || family === "unknown") {
    return "blocked";
  }
  if (family === "matrix") {
    return "matrix-shapes";
  }
  return "visual-snapshot";
}

function boundsToContractBounds(bounds?: PptxExportBounds): PptxExportBounds | undefined {
  if (!bounds || !Number.isFinite(bounds.w) || !Number.isFinite(bounds.h)) {
    return undefined;
  }
  return bounds;
}

function contractFromParts(args: {
  family: PptExportChartFamily | "unknown";
  confidence: PptExportChartContractConfidence;
  source: PptExportChartContractSource;
  reasonCodes: string[];
  bounds?: PptxExportBounds;
  ownerElementIds?: string[];
  blockedReason?: PptExportChartBlockedReason;
  diagnostics?: string[];
}): PptExportChartContract {
  return {
    family: args.family,
    confidence: args.confidence,
    source: args.source,
    reasonCodes: [...new Set(args.reasonCodes.filter(Boolean))],
    bounds: boundsToContractBounds(args.bounds),
    ownerElementIds: args.ownerElementIds ?? [],
    nativeEligibility: nativeEligibilityForFamily(args.family, args.blockedReason),
    blockedReason: args.blockedReason,
    diagnostics: args.diagnostics ?? [],
  };
}

function minimumDataFailureForSpec(spec: HtmlChartSpec): PptExportChartBlockedReason | null {
  if (spec.kind === "bubble") {
    return spec.points.length ? null : "missing-data";
  }
  if (spec.kind === "matrix") {
    return spec.items.length ? null : "missing-data";
  }

  const labels = spec.categories.map((item) => item.trim()).filter(Boolean);
  const series = spec.series.filter((item) => item.values.length > 0);
  if (!labels.length || !series.length) {
    return "missing-data";
  }
  if (spec.kind === "combo") {
    const hasBar = series.some((item, index) => (item.role ?? (index === 0 ? "bar" : "line")) === "bar");
    const hasLine = series.some((item, index) => (item.role ?? (index === 0 ? "bar" : "line")) === "line");
    return hasBar && hasLine ? null : "sparse-series";
  }
  return null;
}

export function buildExportChartContractFromSpec(args: {
  spec: HtmlChartSpec;
  source?: PptExportChartContractSource;
  bounds?: PptxExportBounds;
  ownerElementIds?: string[];
}): PptExportChartContract {
  const blockedReason = minimumDataFailureForSpec(args.spec);
  return contractFromParts({
    family: args.spec.kind,
    confidence: "high",
    source: args.source ?? "spec",
    reasonCodes: [`explicit-${args.spec.kind}-spec`, blockedReason ? "minimum-data-failed" : "minimum-data-ok"],
    bounds: args.bounds,
    ownerElementIds: args.ownerElementIds,
    blockedReason: blockedReason ?? undefined,
    diagnostics: blockedReason ? [`${args.spec.kind} chart contract is missing minimum chart data.`] : [],
  });
}

export function completeExportChartContract(
  contract: PptExportChartContract,
  args: {
    bounds?: PptxExportBounds;
    ownerElementIds?: string[];
    nativeEligibility?: PptExportChartNativeEligibility;
  },
): PptExportChartContract {
  return {
    ...contract,
    bounds: boundsToContractBounds(args.bounds) ?? contract.bounds,
    ownerElementIds: args.ownerElementIds?.length ? args.ownerElementIds : contract.ownerElementIds,
    nativeEligibility: args.nativeEligibility ?? contract.nativeEligibility,
  };
}

function chartTextClassification(element: HTMLElement): {
  family: PptExportChartFamily | "unknown";
  reasonCodes: string[];
  ambiguous: boolean;
} | null {
  const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return null;
  }
  const matches = chartLikeTextPatterns.filter((entry) => entry.pattern.test(text));
  if (!matches.length) {
    return null;
  }
  const familyMatches = matches
    .map((entry) => entry.family)
    .filter((family): family is PptExportChartFamily => family !== "unknown");
  const uniqueFamilies: PptExportChartFamily[] = [...new Set(familyMatches)];
  return {
    family: uniqueFamilies.length === 1 ? uniqueFamilies[0]! : "unknown",
    reasonCodes: matches.map((entry) => entry.reason),
    ambiguous: uniqueFamilies.length > 1,
  };
}

export function classifyUnstructuredChartElement(element: HTMLElement): PptExportChartContract | null {
  if (hasBubblePointPrimitives(element)) {
    return contractFromParts({
      family: "bubble",
      confidence: "medium",
      source: "dom",
      reasonCodes: ["bubble-primitives"],
      blockedReason: "missing-data",
      diagnostics: ["Bubble-like DOM primitives were found without a point data contract."],
    });
  }

  if (hasAbsoluteBarPrimitives(element)) {
    return contractFromParts({
      family: "bar",
      confidence: "medium",
      source: "dom",
      reasonCodes: ["absolute-bar-primitives"],
      blockedReason: "missing-data",
      diagnostics: ["Bar-like DOM primitives were found without category/series data."],
    });
  }

  if (hasSvgChartPrimitives(element)) {
    return contractFromParts({
      family: "line",
      confidence: "medium",
      source: "svg",
      reasonCodes: ["svg-primitives"],
      blockedReason: "missing-data",
      diagnostics: ["SVG chart primitives were found without a semantic chart data contract."],
    });
  }

  const textMatch = chartTextClassification(element);
  if (!textMatch) {
    return null;
  }
  return contractFromParts({
    family: textMatch.family,
    confidence: "low",
    source: "text-layout",
    reasonCodes: textMatch.reasonCodes,
    blockedReason: textMatch.ambiguous ? "ambiguous-family" : "missing-data",
    diagnostics: [
      textMatch.ambiguous
        ? "Chart-like text references multiple chart families without a data contract."
        : "Chart-like text was found without a data contract.",
    ],
  });
}

export function hasChartLikeEvidence(element: HTMLElement) {
  return Boolean(
    hasStructuredChartContract(element) ||
      hasUnstructuredChartPrimitives(element) ||
      classifyUnstructuredChartElement(element),
  );
}

export function hasStructuredChartContract(element: Element) {
  return Boolean(
    parseHtmlChartSpec(element.getAttribute(HTML_CHART_SPEC_ATTRIBUTE)) ||
      element.getAttribute("data-export-chart"),
  );
}

export function findChartContractElement(element: HTMLElement) {
  if (hasStructuredChartContract(element)) {
    return element;
  }

  return (
    Array.from(
      element.querySelectorAll<HTMLElement>(
        [`[${HTML_CHART_SPEC_ATTRIBUTE}]`, "[data-export-chart]"].join(","),
      ),
    ).find((candidate) => hasStructuredChartContract(candidate)) ?? null
  );
}

export function hasSvgChartPrimitives(element: HTMLElement) {
  const svgs = Array.from(element.querySelectorAll<SVGSVGElement>("svg"));
  return svgs.some((svg) => {
    const polylines = svg.querySelectorAll("polyline,path[stroke]").length;
    const axisLines = svg.querySelectorAll("line").length;
    return polylines > 0 && axisLines >= 2;
  });
}

export function hasAbsoluteBarPrimitives(element: HTMLElement) {
  const absoluteBars = Array.from(
    element.querySelectorAll<HTMLElement>("[style*='position:absolute'],[style*='position: absolute']"),
  ).filter((candidate) => {
    const width = parseNumericValue(candidate.style.width || "");
    const height = parseNumericValue(candidate.style.height || "");
    const bottom = candidate.style.bottom;
    const background = candidate.style.backgroundColor || candidate.style.background;
    return Boolean(bottom && background && width >= 16 && height >= 8 && Math.abs(width - height) > 8);
  });

  return absoluteBars.length >= 3;
}

export function hasBubblePointPrimitives(element: HTMLElement) {
  const bubblePoints = Array.from(
    element.querySelectorAll<HTMLElement>("[style*='border-radius:50%'],[style*='border-radius: 50%']"),
  ).filter((candidate) => {
    const width = parseNumericValue(candidate.style.width || "");
    const height = parseNumericValue(candidate.style.height || "");
    return width >= 20 && Math.abs(width - height) <= 18;
  });

  return bubblePoints.length >= 3;
}

export function hasAxisScaffold(element: HTMLElement) {
  const style = element.style;
  const borderLeft = style.borderLeft || style.border;
  const borderBottom = style.borderBottom || style.border;
  return Boolean(borderLeft && borderBottom && parseNumericValue(style.height || "") >= 80);
}

export function hasUnstructuredChartPrimitives(element: HTMLElement) {
  return (
    hasSvgChartPrimitives(element) ||
    hasAbsoluteBarPrimitives(element) ||
    hasBubblePointPrimitives(element)
  );
}

export function findChartPlotElement(frame: HTMLElement) {
  const candidates = Array.from(
    frame.querySelectorAll<HTMLElement>("[style*='position:relative'],[style*='position: relative']"),
  )
    .filter((candidate) => candidate !== frame)
    .map((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const primitiveScore =
        (hasSvgChartPrimitives(candidate) ? 3 : 0) +
        (hasAbsoluteBarPrimitives(candidate) ? 3 : 0) +
        (hasBubblePointPrimitives(candidate) ? 3 : 0) +
        (hasAxisScaffold(candidate) ? 1 : 0);
      return {
        element: candidate,
        rect,
        primitiveScore,
        area: rect.width * rect.height,
      };
    })
    .filter((candidate) => candidate.rect.width >= 140 && candidate.rect.height >= 70 && candidate.primitiveScore > 0)
    .sort((left, right) => {
      if (right.primitiveScore !== left.primitiveScore) {
        return right.primitiveScore - left.primitiveScore;
      }
      return left.area - right.area;
    });

  return candidates[0]?.element ?? null;
}
