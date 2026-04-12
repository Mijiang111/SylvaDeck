import { extractHtmlPageVisualStyle } from "@/features/studio/html-report-visuals";
import {
  measureListBlock,
  measureTextBlock,
  resolveFontDescriptorToCss,
} from "@/features/studio/text-layout/pretext-engine";
import { resolveElementTextLayoutWhiteSpace } from "@/features/studio/text-layout/text-layout-dom";
import { waitForRenderableSurface } from "@/features/studio/runtime/studio/export";
import type {
  GeneratedHtmlReport,
  GeneratedHtmlReportStyleProfile,
  HtmlPageVisualStyle,
  ModuleChartKind,
  SlideScene,
  SlideSceneChartData,
  SlideSceneChartObject,
  WorkbenchDraft,
  WorkbenchProject,
} from "@/features/studio/types";

const PPT_LAYOUT = {
  widthInches: 13.333,
  heightInches: 7.5,
  pageWidthPx: 1600,
  pageHeightPx: 900,
};

const PX_PER_INCH = PPT_LAYOUT.pageWidthPx / PPT_LAYOUT.widthInches;
const DEFAULT_BACKGROUND = "FBF8F2";
const DEFAULT_SURFACE_FILL = "FFFFFF";
const DEFAULT_DIVIDER = "D8D0C2";
const DEFAULT_TEXT = "102838";
const DEFAULT_BODY = "5B6B77";
const DEFAULT_ACCENT = "C6994A";

export type PptExportWarning = {
  code:
    | "html-report-missing"
    | "frame-missing"
    | "page-missing"
    | "block-missing"
    | "visual-missing"
    | "color-fallback"
    | "gradient-flattened"
    | "native-chart-exported"
    | "hybrid-chart-exported"
    | "chart-native-unsupported"
    | "chart-image-fallback";
  message: string;
  pageNumber?: number;
};

type PptExportTextNode = {
  kind: "text";
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  items?: string[];
  fontSize: number;
  fontFamily?: string;
  color: string;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  fillColor?: string | null;
};

export type PptExportVisualNode = {
  kind: "shape";
  role: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: "rect" | "roundRect";
  fillColor?: string | null;
  fillTransparency?: number;
  lineColor?: string | null;
  lineTransparency?: number;
  lineWidthPt?: number;
};

export type PptExportFallbackAsset = {
  kind: "svg";
  data: string;
  reason: "gradient-flattened" | "chart-image-fallback";
};

type PptExportChartLayoutRole =
  | "chart-panel"
  | "annotation-rail"
  | "metric-strip"
  | "decision-footer";

type PptExportChartThemeTokens = {
  textPrimary: string;
  textMuted: string;
  accent: string;
  dividerColor: string;
  surfaceFill: string;
  surfaceSecondary: string;
  chartPalette: string[];
};

type PptExportChartSeries = {
  name: string;
  values: number[];
  color?: string;
};

export type PptExportChartModel = {
  kind: "chart";
  renderMode: "native" | "hybrid" | "image";
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
  subtitle?: string;
  insight?: string;
  layoutRole: PptExportChartLayoutRole;
  fallbackMode?: "native-chart" | "hybrid-waterfall" | "chart-image";
  chartKind?: Extract<ModuleChartKind, "bar" | "stacked" | "line" | "waterfall">;
  labels: string[];
  series: PptExportChartSeries[];
  xAxisTitle?: string;
  yAxisTitle?: string;
  colors: string[];
  themeTokens: PptExportChartThemeTokens;
  fallbackAsset?: PptExportFallbackAsset;
};

export type PptExportThemeSnapshot = {
  backgroundColor: string;
  surfaceFill: string;
  surfaceSecondary: string;
  dividerColor: string;
  accent: string;
  textPrimary: string;
  textMuted: string;
  chartPalette: string[];
  backgroundImageData?: string;
};

export type PptExportSlideModel = {
  pageNumber: number;
  title: string;
  backgroundColor: string;
  theme: PptExportThemeSnapshot;
  textNodes: PptExportTextNode[];
  shapeNodes: PptExportVisualNode[];
  chartNodes: PptExportChartModel[];
};

export type PptExportResult = {
  fileName: string;
  slideCount: number;
  warningCount: number;
  warnings: PptExportWarning[];
  slides: PptExportSlideModel[];
};

type ExportPageFrame = {
  iframe: HTMLIFrameElement;
  document: Document;
  pageElement: HTMLElement;
};

type ChartFrameCandidate = {
  visualId: string;
  element: HTMLElement;
  rect: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
};

type ChartCollectionResult = {
  chartNodes: PptExportChartModel[];
  skipVisualIds: Set<string>;
  supportTextNodes: PptExportTextNode[];
};

type ParsedExportChartData = {
  kind?: ModuleChartKind;
  categories?: string[];
  series?: Array<{
    name?: string;
    values?: number[];
    value?: number;
    color?: string;
    label?: string;
  }>;
  title?: string;
  subtitle?: string;
  insight?: string;
  unit?: string;
  xAxisTitle?: string;
  yAxisTitle?: string;
};

type NormalizedChartContract = {
  chartKind: Extract<ModuleChartKind, "bar" | "stacked" | "line" | "waterfall">;
  labels: string[];
  series: PptExportChartSeries[];
  title?: string;
  subtitle?: string;
  insight?: string;
  xAxisTitle?: string;
  yAxisTitle?: string;
  colors: string[];
  renderMode: "native" | "hybrid";
  fallbackMode?: "native-chart" | "hybrid-waterfall";
};

type ParsedSolidPaint = {
  type: "solid";
  hex: string;
  alpha: number;
};

type ParsedGradientPaint = {
  type: "linear-gradient";
  angle: number;
  stops: ParsedSolidPaint[];
};

type ParsedCssPaint = ParsedSolidPaint | ParsedGradientPaint;

type CollectExportAnnotationsResult = {
  theme: PptExportThemeSnapshot;
  textNodes: PptExportTextNode[];
  shapeNodes: PptExportVisualNode[];
  chartNodes: PptExportChartModel[];
};

function dedupeWarnings(warnings: PptExportWarning[]) {
  const seen = new Set<string>();
  const deduped: PptExportWarning[] = [];

  for (const warning of warnings) {
    const key = `${warning.code}:${warning.pageNumber ?? "all"}:${warning.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(warning);
  }

  return deduped;
}

function isHtmlElementNode(value: unknown): value is HTMLElement {
  return Boolean(value) && typeof value === "object" && (value as Node).nodeType === 1;
}

function slugifyFileName(projectName: string) {
  const base = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "studio-deck"}.pptx`;
}

function pxToInches(value: number) {
  return Number((value / PX_PER_INCH).toFixed(3));
}

function pxFontToPoints(value: number) {
  // PowerPoint renders these browser-derived text boxes a little larger and
  // tighter than the HTML preview, so a slightly reduced px->pt conversion
  // keeps headings and dense card copy from wrapping too aggressively.
  return Number((value * 0.7).toFixed(1));
}

function pxLineToPoints(value: number) {
  return Number(Math.max(0.5, value * 0.75).toFixed(1));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripQuotes(value: string) {
  return value.replace(/^['"]+|['"]+$/g, "").trim();
}

function primaryFontFamily(fontFamily?: string | null) {
  if (!fontFamily) {
    return undefined;
  }

  const family = fontFamily
    .split(",")
    .map((item) => stripQuotes(item))
    .find(Boolean);
  return family || undefined;
}

function selectorEscape(value: string) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value.replace(/["\\]/g, "\\$&");
}

function toTransparency(alpha?: number | null) {
  if (alpha === null || alpha === undefined) {
    return undefined;
  }

  return clamp(Math.round((1 - alpha) * 100), 0, 100);
}

function normalizeAlign(value?: string | null) {
  if (value === "center" || value === "right") {
    return value;
  }
  return "left";
}

function parseNumericValue(value: string) {
  const normalized = value.replace(/[^0-9.\-]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function measurePptTextLayout(args: {
  widthPx: number;
  fontSizePx: number;
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  lineHeightPx: number;
  text?: string;
  items?: string[];
  whiteSpace?: "normal" | "pre-wrap";
}) {
  const font = resolveFontDescriptorToCss({
    family: args.fontFamily,
    sizePx: args.fontSizePx,
    weight: args.fontWeight,
    style: args.fontStyle,
  });
  if (args.items && args.items.length > 0) {
    return measureListBlock({
      items: args.items,
      widthPx: args.widthPx,
      lineHeightPx: args.lineHeightPx,
      font,
      whiteSpace: args.whiteSpace,
      itemGapPx: Math.max(4, args.lineHeightPx * 0.28),
      bulletIndentPx: Math.max(14, args.fontSizePx * 0.85),
    });
  }

  return measureTextBlock({
    text: args.text ?? "",
    widthPx: args.widthPx,
    lineHeightPx: args.lineHeightPx,
    font,
    whiteSpace: args.whiteSpace,
  });
}

function parseCssColor(value?: string | null) {
  if (!value) {
    return null;
  }

  const next = value.trim();
  if (!next || next === "transparent" || next === "inherit" || next === "currentColor") {
    return null;
  }

  const hexMatch = next.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const raw = hexMatch[1];
    const expanded = raw.length === 3 ? raw.split("").map((char) => char + char).join("") : raw;
    return {
      type: "solid",
      hex: expanded.toUpperCase(),
      alpha: 1,
    } satisfies ParsedSolidPaint;
  }

  const rgbMatch = next.match(
    /^rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)(?:[\/,\s]+([0-9.]+))?\s*\)$/i,
  );
  if (!rgbMatch) {
    return null;
  }

  const red = clamp(Number.parseFloat(rgbMatch[1] ?? "0"), 0, 255);
  const green = clamp(Number.parseFloat(rgbMatch[2] ?? "0"), 0, 255);
  const blue = clamp(Number.parseFloat(rgbMatch[3] ?? "0"), 0, 255);
  const parsedAlpha =
    rgbMatch[4] === undefined ? 1 : Number.parseFloat(rgbMatch[4] ?? "");
  const alpha = clamp(Number.isFinite(parsedAlpha) ? parsedAlpha : 1, 0, 1);

  const hex = [red, green, blue]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0").toUpperCase())
    .join("");

  return { type: "solid", hex, alpha } satisfies ParsedSolidPaint;
}

function parseLinearGradient(value?: string | null): ParsedGradientPaint | null {
  if (!value) {
    return null;
  }

  const next = value.trim();
  if (!next.startsWith("linear-gradient(")) {
    return null;
  }

  const colorMatches = next.match(/#[0-9a-f]{3,8}|rgba?\([^)]*\)/gi) ?? [];
  const stops = colorMatches
    .map((color) => parseCssColor(color))
    .filter((color): color is ParsedSolidPaint => Boolean(color))
    .slice(0, 2);

  if (stops.length < 2) {
    return null;
  }

  const angleMatch = next.match(/linear-gradient\(\s*(-?[0-9.]+)deg/i);
  const angle = Number.isFinite(Number.parseFloat(angleMatch?.[1] ?? ""))
    ? Number.parseFloat(angleMatch?.[1] ?? "180")
    : 180;

  return {
    type: "linear-gradient",
    angle,
    stops,
  };
}

function parseCssPaint(value?: string | null): ParsedCssPaint | null {
  return parseLinearGradient(value) ?? parseCssColor(value);
}

function readAttribute(element: Element, ...names: string[]) {
  for (const name of names) {
    const value = element.getAttribute(name)?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

function readNumericAttribute(element: Element, ...names: string[]) {
  const raw = readAttribute(element, ...names);
  if (!raw) {
    return undefined;
  }

  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function encodeBase64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function createSvgDataUri(svg: string) {
  return `data:image/svg+xml;base64,${encodeBase64Utf8(svg)}`;
}

function collectDocumentStyles(sourceDocument: Document) {
  return Array.from(sourceDocument.querySelectorAll("style"))
    .map((style) => style.textContent ?? "")
    .filter(Boolean)
    .join("\n");
}

function createLinearGradientSvg(args: {
  width: number;
  height: number;
  gradient: ParsedGradientPaint;
}) {
  const { width, height, gradient } = args;
  const svgAngle = ((450 - gradient.angle) % 360 + 360) % 360;
  const radians = (svgAngle * Math.PI) / 180;
  const x1 = 50 - Math.cos(radians) * 50;
  const y1 = 50 + Math.sin(radians) * 50;
  const x2 = 50 + Math.cos(radians) * 50;
  const y2 = 50 - Math.sin(radians) * 50;

  return createSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="g" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">
          <stop offset="0%" stop-color="#${gradient.stops[0].hex}" stop-opacity="${gradient.stops[0].alpha}" />
          <stop offset="100%" stop-color="#${gradient.stops[1].hex}" stop-opacity="${gradient.stops[1].alpha}" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#g)" />
    </svg>
  `);
}

function createElementSvgFallback(args: {
  sourceDocument: Document;
  element: HTMLElement;
  width: number;
  height: number;
}) {
  const styles = collectDocumentStyles(args.sourceDocument);
  const html = `
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${args.width}px;height:${args.height}px;overflow:hidden;">
      <style>
        html, body { margin: 0; padding: 0; }
        * { box-sizing: border-box; }
        ${styles}
      </style>
      <div style="width:${args.width}px;height:${args.height}px;overflow:hidden;">
        ${args.element.outerHTML}
      </div>
    </div>
  `;

  return createSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${args.width}" height="${args.height}" viewBox="0 0 ${args.width} ${args.height}">
      <foreignObject width="100%" height="100%">
        ${html}
      </foreignObject>
    </svg>
  `);
}

function measureElementRect(pageElement: HTMLElement, element: Element) {
  const pageRect = pageElement.getBoundingClientRect();
  const targetRect = element.getBoundingClientRect();
  return {
    x: clamp(targetRect.left - pageRect.left, 0, pageRect.width),
    y: clamp(targetRect.top - pageRect.top, 0, pageRect.height),
    w: clamp(targetRect.width, 0, pageRect.width),
    h: clamp(targetRect.height, 0, pageRect.height),
  };
}

function dedupeTextNodes(nodes: PptExportTextNode[]) {
  const seen = new Set<string>();
  const deduped: PptExportTextNode[] = [];

  for (const node of nodes) {
    const key = `${node.x}:${node.y}:${node.w}:${node.h}:${node.text}:${node.items?.join("|") ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(node);
  }

  return deduped;
}

function buildChartThemeTokens(theme: PptExportThemeSnapshot): PptExportChartThemeTokens {
  return {
    textPrimary: theme.textPrimary,
    textMuted: theme.textMuted,
    accent: theme.accent,
    dividerColor: theme.dividerColor,
    surfaceFill: theme.surfaceFill,
    surfaceSecondary: theme.surfaceSecondary,
    chartPalette: theme.chartPalette,
  };
}

function parseExportChartData(element: HTMLElement): ParsedExportChartData | null {
  const raw = element.getAttribute("data-export-chart");
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as ParsedExportChartData;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeChartContractFromParsed(args: {
  parsed: ParsedExportChartData;
  pageNumber: number;
  warnings: PptExportWarning[];
  fallbackTitle?: string;
  fallbackSubtitle?: string;
  fallbackInsight?: string;
}): NormalizedChartContract | null {
  const kind = args.parsed.kind;
  if (kind !== "bar" && kind !== "stacked" && kind !== "line" && kind !== "waterfall") {
    return null;
  }

  const labels = (args.parsed.categories ?? []).map((label) => normalizeText(label)).filter(Boolean);
  const multiSeries = (args.parsed.series ?? [])
    .map((item, index) => {
      const values = Array.isArray(item.values)
        ? item.values.map((value) => Number(value) || 0)
        : item.value !== undefined
          ? [Number(item.value) || 0]
          : [];
      return {
        name: normalizeText(item.name ?? item.label ?? `Series ${index + 1}`) || `Series ${index + 1}`,
        values,
        color: parseCssColor(item.color)?.hex,
      } satisfies PptExportChartSeries;
    })
    .filter((item) => item.values.length > 0);

  const inferredLabels =
    labels.length > 0
      ? labels
      : multiSeries.length === 1 && (args.parsed.series ?? []).every((item) => item.label)
        ? (args.parsed.series ?? []).map((item, index) => normalizeText(item.label ?? `Step ${index + 1}`))
        : [];

  const clippedSeries = multiSeries
    .map((item) => ({
      ...item,
      values: inferredLabels.length ? item.values.slice(0, inferredLabels.length) : item.values,
    }))
    .filter((item) => item.values.length > 0);

  if (!inferredLabels.length || !clippedSeries.length) {
    args.warnings.push({
      code: "chart-native-unsupported",
      pageNumber: args.pageNumber,
      message: `Chart on page ${args.pageNumber} did not expose enough structured data for editable PPTX export.`,
    });
    return null;
  }

  return {
    chartKind: kind,
    labels: inferredLabels,
    series: clippedSeries,
    title: normalizeText(args.parsed.title ?? args.fallbackTitle ?? "") || undefined,
    subtitle: normalizeText(args.parsed.subtitle ?? args.fallbackSubtitle ?? "") || undefined,
    insight: normalizeText(args.parsed.insight ?? args.fallbackInsight ?? "") || undefined,
    xAxisTitle: args.parsed.xAxisTitle,
    yAxisTitle: args.parsed.yAxisTitle,
    colors: clippedSeries.map((item) => item.color).filter((item): item is string => Boolean(item)),
    renderMode: kind === "waterfall" ? "hybrid" : "native",
    fallbackMode: kind === "waterfall" ? "hybrid-waterfall" : "native-chart",
  } satisfies NormalizedChartContract;
}

function inferChartLayoutRole(frame: ChartFrameCandidate) {
  const pageBody = frame.element.closest<HTMLElement>("[data-page-body]");
  if (!pageBody) {
    return "chart-panel" as const;
  }

  const supportSiblings = Array.from(pageBody.children).filter(
    (child): child is HTMLElement => isHtmlElementNode(child) && !child.contains(frame.element),
  );

  if (
    supportSiblings.some((element) =>
      Boolean(
        element.querySelector(
          '[data-html-visual-kind="rail"],[data-html-visual-kind="badge"],[data-html-visual-kind="annotation"]',
        ),
      ) || /right/i.test(element.getAttribute("data-html-layout-key") ?? ""),
    )
  ) {
    return "annotation-rail" as const;
  }

  const localSupport = Array.from(frame.element.parentElement?.children ?? []).filter(
    (child): child is HTMLElement => isHtmlElementNode(child) && child !== frame.element,
  );

  if (
    localSupport.some((element) =>
      Boolean(element.querySelector('[data-html-visual-kind="annotation"]')) ||
      element.getAttribute("data-html-visual-kind") === "annotation",
    )
  ) {
    return "decision-footer" as const;
  }

  if (
    localSupport.filter((element) =>
      ["surface", "highlight", "badge"].includes(element.getAttribute("data-html-visual-kind") ?? ""),
    ).length >= 2
  ) {
    return "metric-strip" as const;
  }

  return "chart-panel" as const;
}

function collectChartSupportRoots(frame: ChartFrameCandidate) {
  const roots: HTMLElement[] = [];
  const pageBody = frame.element.closest<HTMLElement>("[data-page-body]");
  const frameParent = frame.element.parentElement;

  if (pageBody) {
    for (const child of Array.from(pageBody.children)) {
      if (!isHtmlElementNode(child) || child.contains(frame.element)) {
        continue;
      }
      roots.push(child);
    }
  }

  if (frameParent) {
    for (const child of Array.from(frameParent.children)) {
      if (!isHtmlElementNode(child) || child === frame.element) {
        continue;
      }
      roots.push(child);
    }
  }

  return roots.filter((root, index) => roots.indexOf(root) === index);
}

function buildTextNodeFromElement(args: {
  pageElement: HTMLElement;
  element: HTMLElement;
  view: Window;
}) {
  const rect = measureElementRect(args.pageElement, args.element);
  if (!rect.w || !rect.h) {
    return null;
  }

  const computed = args.view.getComputedStyle(args.element);
  const color = parseCssColor(computed.color)?.hex ?? DEFAULT_TEXT;
  const fillColor = parseCssColor(computed.backgroundColor);
  const computedFontSize = Number.parseFloat(computed.fontSize || "");
  const fontSizePx = Number.isFinite(computedFontSize) ? computedFontSize : 16;
  const lineHeightPx = Math.max(parseNumericValue(computed.lineHeight || ""), fontSizePx * 1.2);
  const text = normalizeText(args.element.innerText ?? "");
  if (!text) {
    return null;
  }
  const measurement = measurePptTextLayout({
    widthPx: Math.max(24, rect.w),
    fontSizePx,
    fontFamily: primaryFontFamily(computed.fontFamily) || "Arial",
    fontWeight: computed.fontWeight || "400",
    fontStyle: computed.fontStyle || "normal",
    lineHeightPx,
    text,
    whiteSpace: resolveElementTextLayoutWhiteSpace(args.element),
  });

  return {
    kind: "text",
    x: pxToInches(rect.x),
    y: pxToInches(rect.y),
    w: pxToInches(rect.w),
    h: pxToInches(Math.max(rect.h, measurement.height) + 8),
    text,
    fontSize: pxFontToPoints(fontSizePx),
    fontFamily: primaryFontFamily(computed.fontFamily),
    color,
    bold: Number.parseInt(computed.fontWeight || "400", 10) >= 600,
    italic: computed.fontStyle === "italic",
    align: normalizeAlign(computed.textAlign),
    fillColor: fillColor?.alpha && fillColor.alpha > 0 ? fillColor.hex : null,
  } satisfies PptExportTextNode;
}

function collectChartSupportTextNodes(args: {
  pageElement: HTMLElement;
  frame: ChartFrameCandidate;
}) {
  const view = args.pageElement.ownerDocument.defaultView;
  if (!view) {
    return [];
  }

  const roots = collectChartSupportRoots(args.frame);
  const collected: PptExportTextNode[] = [];
  const seenElements = new Set<HTMLElement>();

  for (const root of roots) {
    const listContainers = Array.from(root.querySelectorAll<HTMLElement>("ul,ol"));
    for (const list of listContainers) {
      if (list.closest('[data-html-visual-kind="chart-frame"]') || list.closest("[data-html-block-id]")) {
        continue;
      }
      if (seenElements.has(list)) {
        continue;
      }
      seenElements.add(list);
      const rect = measureElementRect(args.pageElement, list);
      const items = Array.from(list.querySelectorAll(":scope li"))
        .map((item) => normalizeText(item.textContent ?? ""))
        .filter(Boolean);
      if (!rect.w || !rect.h || items.length === 0) {
        continue;
      }
      const computed = view.getComputedStyle(list);
      const fillColor = parseCssColor(computed.backgroundColor);
      const computedFontSize = Number.parseFloat(computed.fontSize || "");
      const fontSizePx = Number.isFinite(computedFontSize) ? computedFontSize : 16;
      const lineHeightPx = Math.max(parseNumericValue(computed.lineHeight || ""), fontSizePx * 1.2);
      const measurement = measurePptTextLayout({
        widthPx: Math.max(24, rect.w),
        fontSizePx,
        fontFamily: primaryFontFamily(computed.fontFamily) || "Arial",
        fontWeight: computed.fontWeight || "400",
        fontStyle: computed.fontStyle || "normal",
        lineHeightPx,
        items,
        whiteSpace: resolveElementTextLayoutWhiteSpace(list),
      });
      collected.push({
        kind: "text",
        x: pxToInches(rect.x),
        y: pxToInches(rect.y),
        w: pxToInches(rect.w),
        h: pxToInches(Math.max(rect.h, measurement.height) + 8),
        text: items.join("\n"),
        items,
        fontSize: pxFontToPoints(fontSizePx),
        fontFamily: primaryFontFamily(computed.fontFamily),
        color: parseCssColor(computed.color)?.hex ?? DEFAULT_TEXT,
        bold: Number.parseInt(computed.fontWeight || "400", 10) >= 600,
        italic: computed.fontStyle === "italic",
        align: normalizeAlign(computed.textAlign),
        fillColor: fillColor?.alpha && fillColor.alpha > 0 ? fillColor.hex : null,
      });
    }

    const candidates = Array.from(
      root.querySelectorAll<HTMLElement>(
        'h1,h2,h3,h4,h5,h6,p,[data-html-visual-kind="rail"],[data-html-visual-kind="annotation"],[data-html-visual-kind="badge"],div',
      ),
    );

    for (const element of candidates) {
      if (seenElements.has(element)) {
        continue;
      }
      if (element.closest('[data-html-visual-kind="chart-frame"]') || element.closest("[data-html-block-id]")) {
        continue;
      }
      if (element.matches("div") && element.querySelector("ul,ol,h1,h2,h3,h4,h5,h6,p,[data-html-visual-kind]")) {
        continue;
      }
      const node = buildTextNodeFromElement({
        pageElement: args.pageElement,
        element,
        view,
      });
      if (!node) {
        continue;
      }
      seenElements.add(element);
      collected.push(node);
    }
  }

  return dedupeTextNodes(collected);
}

async function waitForFrameReady(iframe: HTMLIFrameElement) {
  if (iframe.contentDocument?.readyState === "complete") {
    await waitForRenderableSurface(iframe.contentDocument);
    return;
  }

  await new Promise<void>((resolve) => {
    iframe.addEventListener("load", () => resolve(), { once: true });
  });

  if (iframe.contentDocument) {
    await waitForRenderableSurface(iframe.contentDocument);
  }
}

async function collectExportPageFrames(reportRoot: HTMLElement) {
  const frames = Array.from(reportRoot.querySelectorAll("iframe"));
  await Promise.all(frames.map((frame) => waitForFrameReady(frame)));

  return frames
    .map((iframe) => {
      const document = iframe.contentDocument;
      const pageElement = document?.querySelector("section.page");
      if (!document || !isHtmlElementNode(pageElement)) {
        return null;
      }

      return {
        iframe,
        document,
        pageElement,
      } satisfies ExportPageFrame;
    })
    .filter((frame): frame is ExportPageFrame => Boolean(frame));
}

function collectBlockTextNodes(args: {
  pageElement: HTMLElement;
  warnings: PptExportWarning[];
  pageNumber: number;
}) {
  const textNodes: PptExportTextNode[] = [];
  const view = args.pageElement.ownerDocument.defaultView;
  const blockElements = Array.from(
    args.pageElement.querySelectorAll<HTMLElement>("[data-html-block-id]"),
  ).filter((element) => !element.parentElement?.closest("[data-html-block-id]"));

  if (!view) {
    return textNodes;
  }

  for (const element of blockElements) {
    const blockId = element.getAttribute("data-html-block-id") ?? "unknown";
    const blockKind = element.getAttribute("data-html-block-kind") ?? "text";

    const rect = measureElementRect(args.pageElement, element);
    if (!rect.w || !rect.h) {
      continue;
    }

    const computed = view.getComputedStyle(element);
    const color = parseCssColor(computed.color)?.hex ?? DEFAULT_TEXT;
    const fillColor = parseCssColor(computed.backgroundColor);
    const computedFontSize = Number.parseFloat(computed.fontSize || "");
    const fontSizePx = Number.isFinite(computedFontSize) ? computedFontSize : 16;
    const items =
      blockKind === "list"
        ? Array.from(element.querySelectorAll(":scope li"))
            .map((item) => normalizeText(item.textContent ?? ""))
            .filter(Boolean)
        : undefined;
    const text =
      blockKind === "list"
        ? items?.join("\n") ?? normalizeText(element.innerText ?? "")
        : normalizeText(element.innerText ?? "");

    if (!text) {
      args.warnings.push({
        code: "block-missing",
        pageNumber: args.pageNumber,
        message: `Block ${blockId} on page ${args.pageNumber} had no exportable text content.`,
      });
      continue;
    }

    const computedLineHeight = parseNumericValue(computed.lineHeight || "");
    const lineHeightPx =
      Number.isFinite(computedLineHeight) && computedLineHeight > 0
        ? computedLineHeight
        : fontSizePx * 1.2;
    const contentHeight = Math.max(rect.h, element.scrollHeight || 0, element.offsetHeight || 0);
    const baseMeasurement = measurePptTextLayout({
      widthPx: Math.max(24, rect.w),
      fontSizePx,
      fontFamily: primaryFontFamily(computed.fontFamily) || "Arial",
      fontWeight: computed.fontWeight || "400",
      fontStyle: computed.fontStyle || "normal",
      lineHeightPx,
      text,
      items,
      whiteSpace: resolveElementTextLayoutWhiteSpace(element),
    });
    const allowedLines = Math.max(1, Math.round(contentHeight / lineHeightPx));
    const estimatedLineCount = Math.max(1, baseMeasurement.lineCount);
    const overflowRatio =
      estimatedLineCount > allowedLines ? allowedLines / estimatedLineCount : 1;
    const adjustedFontSizePx =
      overflowRatio < 1 ? fontSizePx * Math.max(0.72, overflowRatio) : fontSizePx;
    const adjustedLineHeightPx = Math.max(1, lineHeightPx * (adjustedFontSizePx / Math.max(fontSizePx, 1)));
    const adjustedMeasurement = measurePptTextLayout({
      widthPx: Math.max(24, rect.w),
      fontSizePx: adjustedFontSizePx,
      fontFamily: primaryFontFamily(computed.fontFamily) || "Arial",
      fontWeight: computed.fontWeight || "400",
      fontStyle: computed.fontStyle || "normal",
      lineHeightPx: adjustedLineHeightPx,
      text,
      items,
      whiteSpace: resolveElementTextLayoutWhiteSpace(element),
    });

    textNodes.push({
      kind: "text",
      x: pxToInches(rect.x),
      y: pxToInches(rect.y),
      w: pxToInches(rect.w),
      h: pxToInches(Math.max(contentHeight, adjustedMeasurement.height) + 8),
      text,
      items,
      fontSize: pxFontToPoints(adjustedFontSizePx),
      fontFamily: primaryFontFamily(computed.fontFamily),
      color,
      bold: Number.parseInt(computed.fontWeight || "400", 10) >= 600,
      italic: computed.fontStyle === "italic",
      align: normalizeAlign(computed.textAlign),
      fillColor: fillColor?.alpha && fillColor.alpha > 0 ? fillColor.hex : null,
    });
  }

  return textNodes;
}

function shouldRenderVisualAsLine(role: string, rect: { w: number; h: number }) {
  return role === "divider" || role === "rail" || rect.h <= 4 || rect.w <= 4;
}

function collectChartFrames(pageElement: HTMLElement) {
  return Array.from(
    pageElement.querySelectorAll<HTMLElement>('[data-html-visual-kind="chart-frame"]'),
  ).map((element) => ({
    visualId: element.getAttribute("data-html-visual-id") ?? `chart-frame-${Math.random()}`,
    element,
    rect: measureElementRect(pageElement, element),
  }));
}

function buildThemeSnapshot(args: {
  pageElement?: HTMLElement | null;
  pageVisualStyle: HtmlPageVisualStyle;
  reportStyleProfile?: GeneratedHtmlReportStyleProfile | null;
  scene?: SlideScene;
  warnings: PptExportWarning[];
  pageNumber: number;
}) {
  const pageElement = args.pageElement ?? null;
  const pagePaintSource =
    readAttribute(pageElement ?? document.createElement("div"), "data-export-page-bg", "data-page-bg") ??
    args.pageVisualStyle.pageBackground ??
    args.scene?.background ??
    `#${DEFAULT_BACKGROUND}`;
  const surfaceFillSource =
    readAttribute(pageElement ?? document.createElement("div"), "data-export-surface-fill", "data-surface-fill") ??
    args.pageVisualStyle.surfaceFill;
  const dividerSource =
    readAttribute(pageElement ?? document.createElement("div"), "data-export-divider-color", "data-divider-color") ??
    args.pageVisualStyle.dividerColor;
  const accentSource =
    pageElement?.querySelector("[data-export-accent]")?.getAttribute("data-export-accent") ??
    args.pageVisualStyle.accentColor ??
    `#${DEFAULT_ACCENT}`;

  const pagePaint = parseCssPaint(pagePaintSource);
  const surfaceFill = parseCssColor(surfaceFillSource)?.hex ?? DEFAULT_SURFACE_FILL;
  const dividerColor = parseCssColor(dividerSource)?.hex ?? DEFAULT_DIVIDER;
  const accent = parseCssColor(accentSource)?.hex ?? DEFAULT_ACCENT;
  const surfaceSecondary =
    parseCssColor(args.reportStyleProfile?.surfaceSecondary)?.hex ?? surfaceFill;
  const textPrimary =
    parseCssColor(args.reportStyleProfile?.textPrimary)?.hex ?? DEFAULT_TEXT;
  const textMuted =
    parseCssColor(args.reportStyleProfile?.textMuted)?.hex ?? DEFAULT_BODY;
  const chartPalette =
    Array.isArray(args.reportStyleProfile?.chartPalette) && args.reportStyleProfile.chartPalette.length
      ? args.reportStyleProfile.chartPalette
          .map((item) => parseCssColor(item)?.hex)
          .filter((item): item is string => Boolean(item))
      : [accent];

  let backgroundColor = DEFAULT_BACKGROUND;
  let backgroundImageData: string | undefined;

  if (pagePaint?.type === "solid") {
    backgroundColor = pagePaint.hex;
  } else if (pagePaint?.type === "linear-gradient") {
    backgroundColor = pagePaint.stops[0]?.hex ?? DEFAULT_BACKGROUND;
    backgroundImageData = createLinearGradientSvg({
      width: PPT_LAYOUT.pageWidthPx,
      height: PPT_LAYOUT.pageHeightPx,
      gradient: pagePaint,
    });
  } else {
    const fallback = parseCssColor(args.scene?.background)?.hex;
    backgroundColor = fallback ?? backgroundColor;
    args.warnings.push({
      code: "color-fallback",
      pageNumber: args.pageNumber,
      message: `Page ${args.pageNumber} used fallback background color during PPTX export.`,
    });
  }

  return {
    backgroundColor,
    surfaceFill,
    surfaceSecondary,
    dividerColor,
    accent,
    textPrimary,
    textMuted,
    chartPalette,
    backgroundImageData,
  } satisfies PptExportThemeSnapshot;
}

function collectVisualShapeNodes(args: {
  pageElement: HTMLElement;
  skipVisualIds: Set<string>;
  warnings: PptExportWarning[];
  pageNumber: number;
}) {
  const shapeNodes: PptExportVisualNode[] = [];
  const view = args.pageElement.ownerDocument.defaultView;
  const visualElements = Array.from(
    args.pageElement.querySelectorAll<HTMLElement>("[data-html-visual-id]"),
  );

  if (!view) {
    return shapeNodes;
  }

  for (const element of visualElements) {
    const nodeId = element.getAttribute("data-html-visual-id") ?? "unknown";
    if (args.skipVisualIds.has(nodeId)) {
      continue;
    }

    if (readAttribute(element, "data-export-omit") === "true") {
      continue;
    }

    const nodeKind = element.getAttribute("data-html-visual-kind") ?? "surface";
    const role = readAttribute(element, "data-export-role") ?? nodeKind;
    if (role === "decorative") {
      continue;
    }

    const rect = measureElementRect(args.pageElement, element);
    if (!rect.w || !rect.h) {
      continue;
    }

    const computed = view.getComputedStyle(element);
    const fillPaint = parseCssPaint(
      readAttribute(element, "data-export-fill", "data-html-visual-fill") ?? computed.backgroundColor,
    );
    const borderPaint = parseCssColor(
      readAttribute(element, "data-export-border", "data-html-visual-border") ?? computed.borderColor,
    );
    const computedBorderWidth = Number.parseFloat(computed.borderWidth || "0");
    const computedBorderRadius = Number.parseFloat(computed.borderRadius || "0");
    const borderWidth =
      readNumericAttribute(element, "data-export-border-width", "data-html-visual-border-width") ??
      (Number.isFinite(computedBorderWidth) ? computedBorderWidth : undefined) ??
      0;
    const borderRadius =
      readNumericAttribute(element, "data-export-radius", "data-html-visual-radius") ??
      (Number.isFinite(computedBorderRadius) ? computedBorderRadius : undefined) ??
      0;
    const opacity =
      readNumericAttribute(element, "data-export-opacity", "data-html-visual-opacity") ??
      clamp(Number.parseFloat(computed.opacity || "1") || 1, 0, 1);

    const lineLike = shouldRenderVisualAsLine(role, rect);
    let fillColor: string | null = null;
    let fillAlpha: number | undefined = opacity;

    if (fillPaint?.type === "solid") {
      fillColor = fillPaint.hex;
      fillAlpha = fillPaint.alpha * opacity;
    } else if (fillPaint?.type === "linear-gradient") {
      fillColor = fillPaint.stops[0]?.hex ?? null;
      fillAlpha = (fillPaint.stops[0]?.alpha ?? 1) * opacity;
      args.warnings.push({
        code: "gradient-flattened",
        pageNumber: args.pageNumber,
        message: `Visual node ${nodeId} on page ${args.pageNumber} flattened a gradient fill during PPTX export.`,
      });
    }

    if (lineLike && !fillColor && borderPaint?.hex) {
      fillColor = borderPaint.hex;
      fillAlpha = (borderPaint.alpha ?? 1) * opacity;
    }

    if (!lineLike && !fillColor && !borderPaint?.hex) {
      args.warnings.push({
        code: "visual-missing",
        pageNumber: args.pageNumber,
        message: `Visual node ${nodeId} on page ${args.pageNumber} had no exportable fill or stroke.`,
      });
      continue;
    }

    shapeNodes.push({
      kind: "shape",
      role,
      x: pxToInches(rect.x),
      y: pxToInches(rect.y),
      w: pxToInches(rect.w),
      h: pxToInches(rect.h),
      shape: lineLike ? "rect" : borderRadius >= 6 ? "roundRect" : "rect",
      fillColor,
      fillTransparency: toTransparency(fillAlpha),
      lineColor: lineLike ? null : borderPaint?.hex ?? null,
      lineTransparency: lineLike ? undefined : toTransparency((borderPaint?.alpha ?? 1) * opacity),
      lineWidthPt: lineLike ? 0 : borderWidth > 0 ? pxLineToPoints(borderWidth) : 0,
    });
  }

  return shapeNodes;
}

function normalizeSceneChartDataModel(args: {
  chart: SlideSceneChartObject;
  warnings: PptExportWarning[];
  pageNumber: number;
}): NormalizedChartContract | null {
  const chartData = args.chart.chartData as SlideSceneChartData | undefined;
  if (chartData?.categories?.length && chartData.series?.length) {
    const labels = chartData.categories.map((label) => normalizeText(label)).filter(Boolean);
    const series = chartData.series
      .map((item, index) => ({
        name: normalizeText(item.name ?? `Series ${index + 1}`) || `Series ${index + 1}`,
        values: item.values.slice(0, labels.length).map((value) => Number(value) || 0),
        color: parseCssColor(item.color)?.hex,
      }))
      .filter((item) => item.values.length > 0);

    if (labels.length && series.length) {
      return {
        chartKind: args.chart.chartKind as Extract<ModuleChartKind, "bar" | "stacked" | "line" | "waterfall">,
        labels,
        series,
        title: normalizeText(args.chart.title ?? "") || undefined,
        subtitle: normalizeText(args.chart.body ?? "") || undefined,
        xAxisTitle: chartData.xAxisTitle,
        yAxisTitle: chartData.yAxisTitle,
        colors: series.map((item) => item.color).filter((item): item is string => Boolean(item)),
        renderMode: args.chart.chartKind === "waterfall" ? "hybrid" : "native",
        fallbackMode: args.chart.chartKind === "waterfall" ? "hybrid-waterfall" : "native-chart",
      };
    }
  }

  if (args.chart.series.length) {
    return {
      chartKind: (args.chart.chartKind === "line" ? "line" : args.chart.chartKind) as Extract<
        ModuleChartKind,
        "bar" | "stacked" | "line" | "waterfall"
      >,
      labels: args.chart.series.map((series) => normalizeText(series.label)).filter(Boolean),
      series: [
        {
          name: normalizeText(args.chart.title ?? "Series") || "Series",
          values: args.chart.series.map((series) => parseNumericValue(series.value)),
          color: parseCssColor(args.chart.series[0]?.color)?.hex ?? parseCssColor(args.chart.color)?.hex,
        },
      ],
      title: normalizeText(args.chart.title ?? "") || undefined,
      subtitle: normalizeText(args.chart.body ?? "") || undefined,
      colors: args.chart.series
        .map((series) => parseCssColor(series.color)?.hex)
        .filter((item): item is string => Boolean(item)),
      renderMode: args.chart.chartKind === "waterfall" ? "hybrid" : "native",
      fallbackMode: args.chart.chartKind === "waterfall" ? "hybrid-waterfall" : "native-chart",
    };
  }

  args.warnings.push({
    code: "chart-native-unsupported",
    pageNumber: args.pageNumber,
    message: `Chart on page ${args.pageNumber} did not expose enough structured data for native PPT export.`,
  });
  return null;
}

function collectChartModels(args: {
  pageElement?: HTMLElement | null;
  theme: PptExportThemeSnapshot;
  scene?: SlideScene;
  warnings: PptExportWarning[];
  pageNumber: number;
}): ChartCollectionResult {
  const chartNodes: PptExportChartModel[] = [];
  const skipVisualIds = new Set<string>();
  const supportTextNodes: PptExportTextNode[] = [];
  const chartFrames = args.pageElement ? collectChartFrames(args.pageElement) : [];
  const sceneCharts = (args.scene?.objects ?? []).filter(
    (object): object is SlideSceneChartObject => object.kind === "chart",
  );
  const nativeFrameIndexes = new Set<number>();
  const themeTokens = buildChartThemeTokens(args.theme);

  sceneCharts.forEach((chart, index) => {
    const sceneNormalized = normalizeSceneChartDataModel({
      chart,
      warnings: args.warnings,
      pageNumber: args.pageNumber,
    });
    const frame = chartFrames[index] ?? null;
    const domNormalized =
      frame && parseExportChartData(frame.element)
        ? normalizeChartContractFromParsed({
            parsed: parseExportChartData(frame.element)!,
            warnings: args.warnings,
            pageNumber: args.pageNumber,
            fallbackTitle: chart.title,
            fallbackSubtitle: chart.body,
          })
        : null;
    const normalized = sceneNormalized ?? domNormalized;
    if (!normalized && !frame) {
      return;
    }

    const frameSupportTextNodes =
      frame && args.pageElement
        ? collectChartSupportTextNodes({
            pageElement: args.pageElement,
            frame,
          })
        : [];

    if (frame) {
      nativeFrameIndexes.add(index);
      skipVisualIds.add(frame.visualId);
      supportTextNodes.push(...frameSupportTextNodes);
    }

    if (normalized) {
      chartNodes.push({
        kind: "chart",
        renderMode: normalized.renderMode,
        x: pxToInches(frame?.rect.x ?? chart.x),
        y: pxToInches(frame?.rect.y ?? chart.y),
        w: pxToInches(frame?.rect.w ?? chart.w),
        h: pxToInches(frame?.rect.h ?? chart.h),
        title: normalized.title ?? chart.title,
        subtitle: normalized.subtitle ?? chart.body,
        insight: normalized.insight,
        layoutRole: frame ? inferChartLayoutRole(frame) : "chart-panel",
        fallbackMode: normalized.fallbackMode,
        chartKind: normalized.chartKind,
        labels: normalized.labels,
        series: normalized.series,
        xAxisTitle: normalized.xAxisTitle,
        yAxisTitle: normalized.yAxisTitle,
        colors: normalized.colors,
        themeTokens,
      });
      args.warnings.push({
        code: normalized.renderMode === "native" ? "native-chart-exported" : "hybrid-chart-exported",
        pageNumber: args.pageNumber,
        message:
          normalized.renderMode === "native"
            ? `Chart on page ${args.pageNumber} exported as a PowerPoint-native chart.`
            : `Chart on page ${args.pageNumber} exported in hybrid mode to preserve layout fidelity.`,
      });
      return;
    }

    if (frame) {
      const svgData = createElementSvgFallback({
        sourceDocument: args.pageElement?.ownerDocument ?? document,
        element: frame.element,
        width: Math.max(1, Math.round(frame.rect.w)),
        height: Math.max(1, Math.round(frame.rect.h)),
      });

      chartNodes.push({
        kind: "chart",
        renderMode: frameSupportTextNodes.length ? "hybrid" : "image",
        x: pxToInches(frame.rect.x),
        y: pxToInches(frame.rect.y),
        w: pxToInches(frame.rect.w),
        h: pxToInches(frame.rect.h),
        layoutRole: inferChartLayoutRole(frame),
        fallbackMode: "chart-image",
        labels: [],
        series: [],
        colors: [],
        themeTokens,
        fallbackAsset: {
          kind: "svg",
          data: svgData,
          reason: "chart-image-fallback",
        },
      });
      args.warnings.push({
        code: frameSupportTextNodes.length ? "hybrid-chart-exported" : "chart-image-fallback",
        pageNumber: args.pageNumber,
        message: frameSupportTextNodes.length
          ? `Chart on page ${args.pageNumber} used a hybrid export to preserve the chart page structure.`
          : `Chart frame on page ${args.pageNumber} used an SVG fallback so the chart remains visible in PPTX export.`,
      });
    }
  });

  chartFrames.forEach((frame, index) => {
    if (nativeFrameIndexes.has(index)) {
      return;
    }

    const parsed = parseExportChartData(frame.element);
    const normalized = parsed
      ? normalizeChartContractFromParsed({
          parsed,
          warnings: args.warnings,
          pageNumber: args.pageNumber,
        })
      : null;
    const frameSupportTextNodes = args.pageElement
      ? collectChartSupportTextNodes({
          pageElement: args.pageElement,
          frame,
        })
      : [];
    supportTextNodes.push(...frameSupportTextNodes);

    if (normalized) {
      chartNodes.push({
        kind: "chart",
        renderMode: normalized.renderMode,
        x: pxToInches(frame.rect.x),
        y: pxToInches(frame.rect.y),
        w: pxToInches(frame.rect.w),
        h: pxToInches(frame.rect.h),
        title: normalized.title,
        subtitle: normalized.subtitle,
        insight: normalized.insight,
        layoutRole: inferChartLayoutRole(frame),
        fallbackMode: normalized.fallbackMode,
        chartKind: normalized.chartKind,
        labels: normalized.labels,
        series: normalized.series,
        xAxisTitle: normalized.xAxisTitle,
        yAxisTitle: normalized.yAxisTitle,
        colors: normalized.colors,
        themeTokens,
      });
      skipVisualIds.add(frame.visualId);
      args.warnings.push({
        code: normalized.renderMode === "native" ? "native-chart-exported" : "hybrid-chart-exported",
        pageNumber: args.pageNumber,
        message:
          normalized.renderMode === "native"
            ? `Chart on page ${args.pageNumber} exported as a PowerPoint-native chart.`
            : `Chart on page ${args.pageNumber} exported in hybrid mode to preserve layout fidelity.`,
      });
      return;
    }

    const svgData = createElementSvgFallback({
      sourceDocument: args.pageElement?.ownerDocument ?? document,
      element: frame.element,
      width: Math.max(1, Math.round(frame.rect.w)),
      height: Math.max(1, Math.round(frame.rect.h)),
    });

    chartNodes.push({
      kind: "chart",
      renderMode: frameSupportTextNodes.length ? "hybrid" : "image",
      x: pxToInches(frame.rect.x),
      y: pxToInches(frame.rect.y),
      w: pxToInches(frame.rect.w),
      h: pxToInches(frame.rect.h),
      layoutRole: inferChartLayoutRole(frame),
      fallbackMode: "chart-image",
      labels: [],
      series: [],
      colors: [],
      themeTokens,
      fallbackAsset: {
        kind: "svg",
        data: svgData,
        reason: "chart-image-fallback",
      },
    });
    skipVisualIds.add(frame.visualId);
    args.warnings.push({
      code: frameSupportTextNodes.length ? "hybrid-chart-exported" : "chart-image-fallback",
      pageNumber: args.pageNumber,
      message: frameSupportTextNodes.length
        ? `Chart on page ${args.pageNumber} used a hybrid export to preserve the chart page structure.`
        : `Chart frame on page ${args.pageNumber} used an SVG fallback so the chart remains visible in PPTX export.`,
    });
  });

  return {
    chartNodes,
    skipVisualIds,
    supportTextNodes: dedupeTextNodes(supportTextNodes),
  };
}

function collectExportAnnotations(args: {
  frame: ExportPageFrame | null;
  pageVisualStyle: HtmlPageVisualStyle;
  reportStyleProfile?: GeneratedHtmlReportStyleProfile | null;
  scene?: SlideScene;
  warnings: PptExportWarning[];
  pageNumber: number;
}): CollectExportAnnotationsResult {
  const theme = buildThemeSnapshot({
    pageElement: args.frame?.pageElement ?? null,
    pageVisualStyle: args.pageVisualStyle,
    reportStyleProfile: args.reportStyleProfile,
    scene: args.scene,
    warnings: args.warnings,
    pageNumber: args.pageNumber,
  });

  if (!args.frame) {
    return {
      theme,
      textNodes: [],
      shapeNodes: [],
      chartNodes: collectChartModels({
        pageElement: null,
        theme,
        scene: args.scene,
        warnings: args.warnings,
        pageNumber: args.pageNumber,
      }).chartNodes,
    };
  }

  const chartCollection = collectChartModels({
    pageElement: args.frame.pageElement,
    theme,
    scene: args.scene,
    warnings: args.warnings,
    pageNumber: args.pageNumber,
  });

  return {
    theme,
    textNodes: dedupeTextNodes([
      ...collectBlockTextNodes({
        pageElement: args.frame.pageElement,
        warnings: args.warnings,
        pageNumber: args.pageNumber,
      }),
      ...chartCollection.supportTextNodes,
    ]),
    shapeNodes: collectVisualShapeNodes({
      pageElement: args.frame.pageElement,
      skipVisualIds: chartCollection.skipVisualIds,
      warnings: args.warnings,
      pageNumber: args.pageNumber,
    }),
    chartNodes: chartCollection.chartNodes,
  };
}

function normalizeSlideModel(args: {
  project: WorkbenchProject;
  draft: WorkbenchDraft;
  htmlReport: GeneratedHtmlReport;
  pageIndex: number;
  frame: ExportPageFrame | null;
}) {
  const pageNumber = args.pageIndex + 1;
  const page = args.project.pages[args.pageIndex];
  const pageDraft = args.draft.pageDrafts.get(page?.id ?? "");
  const warnings: PptExportWarning[] = [];
  const pageVisualStyle = extractHtmlPageVisualStyle({
    report: args.htmlReport,
    pageNumber,
  });

  if (!args.frame) {
    warnings.push({
      code: "frame-missing",
      pageNumber,
      message: `Rendered export frame for page ${pageNumber} was not available.`,
    });
  }

  const annotations = collectExportAnnotations({
    frame: args.frame,
    pageVisualStyle,
    reportStyleProfile: args.htmlReport.styleProfile,
    scene: pageDraft?.scene,
    warnings,
    pageNumber,
  });

  const slide: PptExportSlideModel = {
    pageNumber,
    title:
      args.htmlReport.pageTitles[args.pageIndex] ??
      page?.title ??
      `Page ${pageNumber}`,
    backgroundColor: annotations.theme.backgroundColor,
    theme: annotations.theme,
    textNodes: annotations.textNodes,
    shapeNodes: annotations.shapeNodes,
    chartNodes: annotations.chartNodes,
  };

  return { slide, warnings };
}

async function loadPptxGen() {
  const module = await import("pptxgenjs");
  return module.default;
}

function renderSlideBackground(pptx: any, slide: any, slideModel: PptExportSlideModel) {
  slide.background = { color: slideModel.theme.backgroundColor };
  if (slideModel.theme.backgroundImageData) {
    slide.addImage({
      data: slideModel.theme.backgroundImageData,
      x: 0,
      y: 0,
      w: PPT_LAYOUT.widthInches,
      h: PPT_LAYOUT.heightInches,
    });
  }
}

function renderVisualNodes(pptx: any, slide: any, slideModel: PptExportSlideModel) {
  for (const shapeNode of slideModel.shapeNodes) {
    slide.addShape(
      shapeNode.shape === "roundRect" ? pptx.ShapeType.roundRect : pptx.ShapeType.rect,
      {
        x: shapeNode.x,
        y: shapeNode.y,
        w: shapeNode.w,
        h: shapeNode.h,
        fill: shapeNode.fillColor
          ? {
              color: shapeNode.fillColor,
              transparency: shapeNode.fillTransparency,
            }
          : { color: "FFFFFF", transparency: 100 },
        line: shapeNode.lineColor
          ? {
              color: shapeNode.lineColor,
              transparency: shapeNode.lineTransparency,
              width: shapeNode.lineWidthPt ?? 0.75,
            }
          : { color: "FFFFFF", transparency: 100, width: 0 },
      },
    );
  }
}

function formatChartValue(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1000) {
    return `${Math.round(value)}`;
  }
  if (Number.isInteger(value)) {
    return `${value}`;
  }
  return value.toFixed(1);
}

function renderHybridWaterfallChart(pptx: any, slide: any, chartNode: PptExportChartModel) {
  const values = chartNode.series[0]?.values ?? [];
  if (!values.length || !chartNode.labels.length) {
    if (chartNode.fallbackAsset) {
      slide.addImage({
        data: chartNode.fallbackAsset.data,
        x: chartNode.x,
        y: chartNode.y,
        w: chartNode.w,
        h: chartNode.h,
      });
    }
    return;
  }

  let chartTop = chartNode.y;
  let chartHeight = chartNode.h;

  if (chartNode.title) {
    slide.addText(chartNode.title, {
      x: chartNode.x,
      y: chartTop,
      w: chartNode.w,
      h: 0.34,
      fontFace: "Iowan Old Style",
      fontSize: 16,
      bold: true,
      margin: 0,
      color: chartNode.themeTokens.textPrimary,
    });
    chartTop += 0.4;
    chartHeight -= 0.4;
  }

  if (chartNode.subtitle) {
    slide.addText(chartNode.subtitle, {
      x: chartNode.x,
      y: chartTop,
      w: chartNode.w,
      h: 0.3,
      fontFace: "Avenir Next",
      fontSize: 9,
      color: chartNode.themeTokens.textMuted,
      margin: 0,
    });
    chartTop += 0.36;
    chartHeight -= 0.36;
  }

  const leftPad = 0.38;
  const rightPad = 0.16;
  const topPad = 0.24;
  const bottomPad = 0.62;
  const plotX = chartNode.x + leftPad;
  const plotY = chartTop + topPad;
  const plotW = Math.max(0.4, chartNode.w - leftPad - rightPad);
  const plotH = Math.max(0.6, chartHeight - topPad - bottomPad);

  const totals = [0];
  let running = 0;
  values.forEach((value) => {
    running += value;
    totals.push(running);
  });

  const minValue = Math.min(...totals, 0);
  const maxValue = Math.max(...totals, 0);
  const valueRange = Math.max(maxValue - minValue, 1);
  const baselineY = plotY + ((maxValue - 0) / valueRange) * plotH;
  const stepWidth = plotW / Math.max(values.length, 1);
  const barWidth = Math.max(0.18, stepWidth * 0.5);

  slide.addShape(pptx.ShapeType.line, {
    x: plotX,
    y: baselineY,
    w: plotW,
    h: 0,
    line: { color: chartNode.themeTokens.dividerColor, width: 1.2 },
  });

  let cumulative = 0;
  values.forEach((value, index) => {
    const nextTotal = cumulative + value;
    const segmentTop = plotY + ((maxValue - Math.max(cumulative, nextTotal)) / valueRange) * plotH;
    const segmentBottom = plotY + ((maxValue - Math.min(cumulative, nextTotal)) / valueRange) * plotH;
    const barHeight = Math.max(0.12, segmentBottom - segmentTop);
    const x = plotX + index * stepWidth + (stepWidth - barWidth) / 2;
    const fillColor =
      value >= 0
        ? chartNode.series[0]?.color ?? chartNode.themeTokens.chartPalette[0] ?? chartNode.themeTokens.accent
        : chartNode.themeTokens.chartPalette[2] ?? chartNode.themeTokens.textMuted;

      slide.addShape(pptx.ShapeType.rect, {
      x,
      y: segmentTop,
      w: barWidth,
      h: barHeight,
      fill: { color: fillColor, transparency: 0 },
      line: { color: fillColor, width: 0.8 },
    });

    if (index > 0) {
      const connectorY = plotY + ((maxValue - cumulative) / valueRange) * plotH;
      const previousX = plotX + (index - 1) * stepWidth + stepWidth / 2;
      slide.addShape(pptx.ShapeType.line, {
        x: previousX,
        y: connectorY,
        w: stepWidth,
        h: 0,
        line: { color: chartNode.themeTokens.dividerColor, width: 1, dash: "dash" },
      });
    }

    slide.addText(formatChartValue(value), {
      x: x - 0.08,
      y: Math.max(plotY - 0.04, segmentTop - 0.22),
      w: barWidth + 0.16,
      h: 0.2,
      fontFace: "Avenir Next",
      fontSize: 8,
      align: "center",
      color: chartNode.themeTokens.textMuted,
      margin: 0,
    });

    slide.addText(chartNode.labels[index] ?? `Step ${index + 1}`, {
      x: x - 0.1,
      y: plotY + plotH + 0.12,
      w: barWidth + 0.2,
      h: 0.3,
      fontFace: "Avenir Next",
      fontSize: 8,
      align: "center",
      color: chartNode.themeTokens.textMuted,
      margin: 0,
    });

    cumulative = nextTotal;
  });
}

function renderChartNodes(pptx: any, slide: any, slideModel: PptExportSlideModel) {
  for (const chartNode of slideModel.chartNodes) {
    if (chartNode.renderMode === "image" && chartNode.fallbackAsset) {
      slide.addImage({
        data: chartNode.fallbackAsset.data,
        x: chartNode.x,
        y: chartNode.y,
        w: chartNode.w,
        h: chartNode.h,
      });
      continue;
    }

    if (chartNode.renderMode === "hybrid" && chartNode.chartKind === "waterfall") {
      renderHybridWaterfallChart(pptx, slide, chartNode);
      continue;
    }

    if (chartNode.renderMode === "hybrid" && chartNode.fallbackAsset) {
      slide.addImage({
        data: chartNode.fallbackAsset.data,
        x: chartNode.x,
        y: chartNode.y,
        w: chartNode.w,
        h: chartNode.h,
      });
      continue;
    }

    let chartTop = chartNode.y;
    let chartHeight = chartNode.h;

    if (chartNode.title) {
      slide.addText(chartNode.title, {
        x: chartNode.x,
        y: chartTop,
        w: chartNode.w,
        h: 0.34,
        fontFace: "Iowan Old Style",
        fontSize: 16,
        bold: true,
        margin: 0,
        color: chartNode.themeTokens.textPrimary,
      });
      chartTop += 0.4;
      chartHeight -= 0.4;
    }

    if (chartNode.subtitle) {
      slide.addText(chartNode.subtitle, {
        x: chartNode.x,
        y: chartTop,
        w: chartNode.w,
        h: 0.3,
        fontFace: "Avenir Next",
        fontSize: 9,
        color: chartNode.themeTokens.textMuted,
        margin: 0,
      });
      chartTop += 0.36;
      chartHeight -= 0.36;
    }

    const chartType =
      chartNode.chartKind === "line" ? pptx.ChartType.line : pptx.ChartType.bar;
    const chartData = chartNode.series.map((series, index) => ({
      name: series.name || `Series ${index + 1}`,
      labels: chartNode.labels,
      values: series.values,
    }));
    const chartColors = chartNode.series
      .map((series) => series.color)
      .filter((item): item is string => Boolean(item));

    slide.addChart(chartType, chartData, {
      x: chartNode.x,
      y: chartTop,
      w: chartNode.w,
      h: Math.max(0.8, chartHeight),
      showLegend: chartNode.series.length > 1,
      showTitle: false,
      catAxisLabelFontSize: 9,
      valAxisLabelFontSize: 8,
      showValue: false,
      chartColors: chartColors.length
        ? chartColors
        : chartNode.colors.length
          ? chartNode.colors
          : chartNode.themeTokens.chartPalette.length
            ? chartNode.themeTokens.chartPalette
            : [chartNode.themeTokens.accent],
      chartColorsOpacity: 100,
      showValAxisTitle: Boolean(chartNode.yAxisTitle),
      showCatAxisTitle: Boolean(chartNode.xAxisTitle),
      valAxisTitle: chartNode.yAxisTitle,
      catAxisTitle: chartNode.xAxisTitle,
      catAxisLabelColor: chartNode.themeTokens.textMuted,
      valAxisLabelColor: chartNode.themeTokens.textMuted,
      catAxisLabelPos: "nextTo",
      valAxisLabelPos: "nextTo",
      valGridLine: { color: chartNode.themeTokens.dividerColor, size: 1, style: "solid" },
      catGridLine: { color: "FFFFFF", size: 0, style: "none" },
      showSerName: false,
      showPercent: false,
      showLeaderLines: false,
      legendPos: "b",
      dataLabelPosition: "outEnd",
      barDir: "col",
      lineSize: chartNode.chartKind === "line" ? 2 : undefined,
      barGrouping: chartNode.chartKind === "stacked" ? "stacked" : "clustered",
    });
  }
}

function renderTextNodes(slide: any, slideModel: PptExportSlideModel) {
  for (const textNode of slideModel.textNodes) {
    const baseOptions = {
      x: textNode.x,
      y: textNode.y,
      w: textNode.w,
      h: textNode.h,
      fontFace: textNode.fontFamily || "Avenir Next",
      fontSize: textNode.fontSize,
      bold: textNode.bold ?? false,
      italic: textNode.italic ?? false,
      color: textNode.color,
      align: textNode.align,
      valign: "top" as const,
      margin: 0,
      breakLine: false,
      fill: textNode.fillColor
        ? { color: textNode.fillColor, transparency: 0, type: "solid" }
        : { color: "FFFFFF", transparency: 100, type: "none" },
      line: { color: "FFFFFF", transparency: 100, width: 0 },
    };

    if (textNode.items?.length) {
      slide.addText(textNode.items.join("\n"), {
        ...baseOptions,
        bullet: { indent: 12 },
        paraSpaceAfter: 4,
      });
      continue;
    }

    slide.addText(textNode.text, baseOptions);
  }
}

function renderSlideToPptx(args: {
  pptx: any;
  slideModel: PptExportSlideModel;
}) {
  const slide = args.pptx.addSlide();
  renderSlideBackground(args.pptx, slide, args.slideModel);
  renderVisualNodes(args.pptx, slide, args.slideModel);
  renderChartNodes(args.pptx, slide, args.slideModel);
  renderTextNodes(slide, args.slideModel);
}

export async function exportProjectToPptx(args: {
  document: Document;
  project: WorkbenchProject;
  draft: WorkbenchDraft;
  reportRoot: HTMLElement;
  publishedUrl: string;
  fileName?: string;
}) {
  const htmlReport = args.project.generatedDraft?.htmlReport;
  if (!htmlReport) {
    throw new Error("There is no generated HTML report to export yet.");
  }

  await waitForRenderableSurface(args.reportRoot);
  const frames = await collectExportPageFrames(args.reportRoot);
  const warnings: PptExportWarning[] = [];
  const slides: PptExportSlideModel[] = args.project.pages.map((_, pageIndex) => {
    const built = normalizeSlideModel({
      project: args.project,
      draft: args.draft,
      htmlReport,
      pageIndex,
      frame: frames[pageIndex] ?? null,
    });
    warnings.push(...built.warnings);
    return built.slide;
  });
  const dedupedWarnings = dedupeWarnings(warnings);

  const PptxGenJS = await loadPptxGen();
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "PPT Studio";
  pptx.company = "PPT Studio";
  pptx.subject = `Exported from ${args.publishedUrl}`;
  pptx.title = args.project.projectName;
  pptx.theme = {
    headFontFace: "Iowan Old Style",
    bodyFontFace: "Avenir Next",
  };

  for (const slideModel of slides) {
    renderSlideToPptx({
      pptx,
      slideModel,
    });
  }

  const fileName = args.fileName || slugifyFileName(args.project.projectName);
  await pptx.writeFile({ fileName, compression: true });

  return {
    fileName,
    slideCount: slides.length,
    warningCount: dedupedWarnings.length,
    warnings: dedupedWarnings,
    slides,
  } satisfies PptExportResult;
}
