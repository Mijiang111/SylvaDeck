import { extractHtmlPageVisualStyle } from "@/features/studio/html-report-visuals";
import {
  HTML_CHART_SPEC_ATTRIBUTE,
  HTML_TABLE_SPEC_ATTRIBUTE,
  parseHtmlChartSpec,
  parseHtmlTableSpec,
} from "@/features/studio/html-report-data-modules";
import {
  buildHtmlReportPagePreviews,
  HTML_REPORT_PAGE_HEIGHT,
  HTML_REPORT_PAGE_WIDTH,
} from "@/features/studio/runtime/runtime-export-annotations";
import {
  SCIENTIFIC_DIAGRAM_MODULE_KIND,
  SCIENTIFIC_DIAGRAM_SPEC_ATTRIBUTE,
} from "@/features/studio/scientific-diagram";
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
  HtmlChartSpec,
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

type PptExportSupportedChartKind = "bar" | "stacked" | "line" | "waterfall" | "combo";

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
  runs?: PptExportTextRun[];
  fontSize: number;
  fontFamily?: string;
  color: string;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  fillColor?: string | null;
  rotation?: number;
};

type PptExportTextRun = {
  text: string;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
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
  role?: "bar" | "line";
  axis?: "primary" | "secondary";
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
  chartKind?: PptExportSupportedChartKind;
  labels: string[];
  series: PptExportChartSeries[];
  xAxisTitle?: string;
  yAxisTitle?: string;
  colors: string[];
  themeTokens: PptExportChartThemeTokens;
  fallbackAsset?: PptExportFallbackAsset;
};

export type PptExportTableModel = {
  kind: "table";
  x: number;
  y: number;
  w: number;
  h: number;
  columns: string[];
  rows: string[][];
  themeTokens: PptExportChartThemeTokens;
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
  tableNodes: PptExportTableModel[];
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

type TableCollectionResult = {
  tableNodes: PptExportTableModel[];
  skipVisualIds: Set<string>;
};

type ParsedExportChartData = {
  kind?: PptExportSupportedChartKind;
  categories?: string[];
  series?: Array<{
    name?: string;
    values?: number[];
    value?: number;
    color?: string;
    label?: string;
    role?: "bar" | "line";
    axis?: "primary" | "secondary";
  }>;
  title?: string;
  subtitle?: string;
  insight?: string;
  unit?: string;
  secondaryUnit?: string;
  xAxisTitle?: string;
  yAxisTitle?: string;
};

type NormalizedChartContract = {
  chartKind: PptExportSupportedChartKind;
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
  tableNodes: PptExportTableModel[];
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

function normalizeMultilineText(value: string) {
  return value
    .split(/\n+/)
    .map((line) => normalizeText(line))
    .filter(Boolean)
    .join("\n");
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

function normalizeRotation(value: number) {
  const normalized = ((value % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

function parseCssRotation(transform?: string | null) {
  if (!transform || transform === "none") {
    return undefined;
  }

  const rotateMatch = transform.match(/rotate\((-?[0-9.]+)deg\)/i);
  if (rotateMatch) {
    const parsed = Number.parseFloat(rotateMatch[1] ?? "");
    return Number.isFinite(parsed) ? normalizeRotation(parsed) : undefined;
  }

  const matrixMatch = transform.match(/matrix\(([^)]+)\)/i);
  if (!matrixMatch) {
    return undefined;
  }

  const values = matrixMatch[1]
    ?.split(",")
    .map((value) => Number.parseFloat(value.trim())) ?? [];
  const [a, b] = values;
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return undefined;
  }

  return normalizeRotation((Math.atan2(b, a) * 180) / Math.PI);
}

function isElementHiddenForExport(element: HTMLElement, view: Window) {
  if (element.getAttribute("data-html-canvas-placeholder") === "true") {
    return true;
  }
  const computed = view.getComputedStyle(element);
  return (
    computed.display === "none" ||
    computed.visibility === "hidden" ||
    Number.parseFloat(computed.opacity || "1") <= 0.02
  );
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

function parseAlphaChannel(value?: string) {
  if (value === undefined) {
    return 1;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 1;
  }

  if (trimmed.endsWith("%")) {
    const percent = Number.parseFloat(trimmed.slice(0, -1));
    return clamp(Number.isFinite(percent) ? percent / 100 : 1, 0, 1);
  }

  const parsed = Number.parseFloat(trimmed);
  return clamp(Number.isFinite(parsed) ? parsed : 1, 0, 1);
}

function parseCssColor(value?: string | null) {
  if (!value) {
    return null;
  }

  const next = value.trim();
  if (!next || next === "transparent" || next === "inherit" || next === "currentColor") {
    return null;
  }

  const hexMatch = next.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hexMatch) {
    const raw = hexMatch[1];
    const expanded =
      raw.length === 3 || raw.length === 4
        ? raw
            .split("")
            .map((char) => char + char)
            .join("")
        : raw;
    const hex = expanded.slice(0, 6);
    const alpha =
      expanded.length === 8
        ? clamp(Number.parseInt(expanded.slice(6, 8), 16) / 255, 0, 1)
        : 1;
    return {
      type: "solid",
      hex: hex.toUpperCase(),
      alpha,
    } satisfies ParsedSolidPaint;
  }

  const rgbMatch = next.match(
    /^rgba?\(\s*([0-9.]+%?)[,\s]+([0-9.]+%?)[,\s]+([0-9.]+%?)(?:[\/,\s]+([0-9.]+%?))?\s*\)$/i,
  );
  if (!rgbMatch) {
    return null;
  }

  const parseRgbChannel = (channel: string | undefined) => {
    const raw = channel ?? "0";
    if (raw.endsWith("%")) {
      const percent = Number.parseFloat(raw.slice(0, -1));
      return clamp(Number.isFinite(percent) ? (percent / 100) * 255 : 0, 0, 255);
    }
    return clamp(Number.parseFloat(raw), 0, 255);
  };

  const red = parseRgbChannel(rgbMatch[1]);
  const green = parseRgbChannel(rgbMatch[2]);
  const blue = parseRgbChannel(rgbMatch[3]);
  const alpha = parseAlphaChannel(rgbMatch[4]);

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
  const left = clamp(targetRect.left - pageRect.left, 0, pageRect.width);
  const top = clamp(targetRect.top - pageRect.top, 0, pageRect.height);
  const right = clamp(targetRect.right - pageRect.left, 0, pageRect.width);
  const bottom = clamp(targetRect.bottom - pageRect.top, 0, pageRect.height);

  return {
    x: left,
    y: top,
    w: Math.max(0, right - left),
    h: Math.max(0, bottom - top),
  };
}

function parseComputedPx(value?: string | null) {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveElementInsets(computed: CSSStyleDeclaration) {
  return {
    top: parseComputedPx(computed.paddingTop),
    right: parseComputedPx(computed.paddingRight),
    bottom: parseComputedPx(computed.paddingBottom),
    left: parseComputedPx(computed.paddingLeft),
  };
}

function resolveVisibleTextBox(args: {
  rect: { w: number; h: number };
  insets: ReturnType<typeof resolveElementInsets>;
  lineHeightPx: number;
}) {
  const widthPx = Math.max(24, args.rect.w - args.insets.left - args.insets.right);
  const heightPx = Math.max(args.lineHeightPx, args.rect.h - args.insets.top - args.insets.bottom);
  return { widthPx, heightPx };
}

function fitPptTextLayout(args: {
  widthPx: number;
  targetHeightPx: number;
  fontSizePx: number;
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  lineHeightPx: number;
  text?: string;
  items?: string[];
  whiteSpace?: "normal" | "pre-wrap";
}) {
  const minFontSizePx = Math.max(8, args.fontSizePx * 0.62);
  const lineHeightRatio = args.lineHeightPx / Math.max(args.fontSizePx, 1);
  const measureAt = (fontSizePx: number) => {
    const lineHeightPx = Math.max(fontSizePx * 1.05, fontSizePx * lineHeightRatio);
    return {
      fontSizePx,
      lineHeightPx,
      measurement: measurePptTextLayout({
        widthPx: args.widthPx,
        fontSizePx,
        fontFamily: args.fontFamily,
        fontWeight: args.fontWeight,
        fontStyle: args.fontStyle,
        lineHeightPx,
        text: args.text,
        items: args.items,
        whiteSpace: args.whiteSpace,
      }),
    };
  };

  const base = measureAt(args.fontSizePx);
  if (base.measurement.height <= args.targetHeightPx * 1.04) {
    return base;
  }

  let low = minFontSizePx;
  let high = args.fontSizePx;
  let best = measureAt(low);
  for (let index = 0; index < 8; index += 1) {
    const mid = (low + high) / 2;
    const candidate = measureAt(mid);
    if (candidate.measurement.height <= args.targetHeightPx * 1.02) {
      best = candidate;
      low = mid;
    } else {
      high = mid;
    }
  }

  return best;
}

function resolvePptTextNodeHeightPx(args: {
  rect: { y: number; h: number };
  insets: ReturnType<typeof resolveElementInsets>;
  measuredHeightPx: number;
}) {
  const desiredHeight = Math.max(args.rect.h, args.measuredHeightPx + args.insets.top + args.insets.bottom + 6);
  const remainingPageHeight = PPT_LAYOUT.pageHeightPx - args.rect.y;
  return clamp(desiredHeight, 8, Math.max(8, remainingPageHeight));
}

function appendTextRun(runs: PptExportTextRun[], run: PptExportTextRun) {
  if (!run.text) {
    return;
  }

  const previous = runs.at(-1);
  if (
    previous &&
    previous.fontFamily === run.fontFamily &&
    previous.fontSize === run.fontSize &&
    previous.color === run.color &&
    previous.bold === run.bold &&
    previous.italic === run.italic
  ) {
    previous.text += run.text;
    return;
  }

  runs.push(run);
}

function collectInlineTextRuns(args: {
  element: HTMLElement;
  view: Window;
  baseText: string;
  baseFontSizePx: number;
}) {
  const runs: PptExportTextRun[] = [];
  let pendingSpace = false;

  const appendRawText = (raw: string, sourceElement: HTMLElement) => {
    const collapsed = raw.replace(/\s+/g, " ");
    if (!collapsed.trim()) {
      pendingSpace = runs.length > 0 || pendingSpace;
      return;
    }

    const computed = args.view.getComputedStyle(sourceElement);
    const text = `${pendingSpace && runs.length ? " " : ""}${collapsed.trim()}`;
    pendingSpace = /\s$/.test(collapsed);
    appendTextRun(runs, {
      text,
      fontFamily: primaryFontFamily(computed.fontFamily),
      fontSize:
        Math.abs(parseComputedPx(computed.fontSize) - args.baseFontSizePx) > 0.5
          ? pxFontToPoints(parseComputedPx(computed.fontSize))
          : undefined,
      color: parseCssColor(computed.color)?.hex,
      bold: Number.parseInt(computed.fontWeight || "400", 10) >= 600,
      italic: computed.fontStyle === "italic",
    });
  };

  const walk = (node: Node, sourceElement: HTMLElement) => {
    if (node.nodeType === 3) {
      appendRawText(node.textContent ?? "", sourceElement);
      return;
    }

    if (!isHtmlElementNode(node)) {
      return;
    }

    const tagName = node.tagName.toLowerCase();
    if (tagName === "script" || tagName === "style" || tagName === "svg") {
      return;
    }

    const display = args.view.getComputedStyle(node).display;
    const startsBlock = runs.length > 0 && /^(block|flex|grid|list-item|table)/.test(display);
    if (startsBlock) {
      pendingSpace = true;
    }

    for (const child of Array.from(node.childNodes)) {
      walk(child, node);
    }
  };

  for (const child of Array.from(args.element.childNodes)) {
    walk(child, args.element);
  }

  const normalizedRunsText = normalizeText(runs.map((run) => run.text).join(""));
  if (runs.length < 2 || normalizedRunsText !== args.baseText) {
    return undefined;
  }

  const hasMeaningfulStyleChange = runs.some(
    (run) =>
      run.fontFamily ||
      run.fontSize !== undefined ||
      (run.color && run.color !== parseCssColor(args.view.getComputedStyle(args.element).color)?.hex) ||
      run.bold !== (Number.parseInt(args.view.getComputedStyle(args.element).fontWeight || "400", 10) >= 600) ||
      run.italic !== (args.view.getComputedStyle(args.element).fontStyle === "italic"),
  );

  return hasMeaningfulStyleChange ? runs : undefined;
}

function dedupeTextNodes(nodes: PptExportTextNode[]) {
  const seen = new Set<string>();
  const deduped: PptExportTextNode[] = [];

  for (const node of nodes) {
    const runKey =
      node.runs
        ?.map((run) => `${run.text}:${run.color ?? ""}:${run.bold ?? ""}:${run.italic ?? ""}`)
        .join("|") ?? "";
    const key = `${node.x}:${node.y}:${node.w}:${node.h}:${node.text}:${node.items?.join("|") ?? ""}:${runKey}`;
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
  const chartSpec = parseHtmlChartSpec(element.getAttribute(HTML_CHART_SPEC_ATTRIBUTE));
  const parsedSpec = chartSpec ? parsedExportChartDataFromHtmlSpec(chartSpec) : null;
  if (parsedSpec) {
    return parsedSpec;
  }

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

function parsedExportChartDataFromHtmlSpec(spec: HtmlChartSpec): ParsedExportChartData | null {
  if (spec.kind === "bubble") {
    return null;
  }
  return {
    kind: spec.kind,
    categories: spec.categories,
    series: spec.series.map((series) => ({
      name: series.label,
      label: series.label,
      values: series.values,
      color: series.color ?? undefined,
      role: series.role,
      axis: series.axis,
    })),
    title: spec.title,
    subtitle: spec.subtitle,
    insight: spec.insight,
    unit: spec.unit,
    secondaryUnit: spec.kind === "combo" ? spec.secondaryUnit : undefined,
  };
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
  if (kind !== "bar" && kind !== "stacked" && kind !== "line" && kind !== "waterfall" && kind !== "combo") {
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
        role: item.role ?? (kind === "combo" && index > 0 ? "line" : kind === "line" ? "line" : "bar"),
        axis: item.axis ?? (kind === "combo" && index > 0 ? "secondary" : "primary"),
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
    renderMode: kind === "waterfall" || kind === "combo" ? "hybrid" : "native",
    fallbackMode: kind === "waterfall" ? "hybrid-waterfall" : kind === "combo" ? undefined : "native-chart",
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

function buildMeasuredTextNode(args: {
  pageElement: HTMLElement;
  element: HTMLElement;
  view: Window;
  text: string;
  items?: string[];
}) {
  const rect = measureElementRect(args.pageElement, args.element);
  if (!rect.w || !rect.h) {
    return null;
  }

  const computed = args.view.getComputedStyle(args.element);
  if (isElementHiddenForExport(args.element, args.view)) {
    return null;
  }
  const color = parseCssColor(computed.color)?.hex ?? DEFAULT_TEXT;
  const fillColor = parseCssColor(computed.backgroundColor);
  const computedFontSize = Number.parseFloat(computed.fontSize || "");
  const fontSizePx = Number.isFinite(computedFontSize) ? computedFontSize : 16;
  const lineHeightPx = Math.max(parseNumericValue(computed.lineHeight || ""), fontSizePx * 1.2);
  const insets = resolveElementInsets(computed);
  const textBox = resolveVisibleTextBox({
    rect,
    insets,
    lineHeightPx,
  });
  const text = normalizeText(args.text);
  const items = args.items?.map((item) => normalizeText(item)).filter(Boolean);
  if (!text && !items?.length) {
    return null;
  }

  const fitted = fitPptTextLayout({
    widthPx: textBox.widthPx,
    targetHeightPx: textBox.heightPx,
    fontSizePx,
    fontFamily: primaryFontFamily(computed.fontFamily) || "Arial",
    fontWeight: computed.fontWeight || "400",
    fontStyle: computed.fontStyle || "normal",
    lineHeightPx,
    text,
    items,
    whiteSpace: resolveElementTextLayoutWhiteSpace(args.element),
  });
  const heightPx = resolvePptTextNodeHeightPx({
    rect,
    insets,
    measuredHeightPx: fitted.measurement.height,
  });

  return {
    kind: "text",
    x: pxToInches(rect.x),
    y: pxToInches(rect.y),
    w: pxToInches(rect.w),
    h: pxToInches(heightPx),
    text,
    items,
    runs: items?.length
      ? undefined
      : collectInlineTextRuns({
          element: args.element,
          view: args.view,
          baseText: text,
          baseFontSizePx: fontSizePx,
        }),
    fontSize: pxFontToPoints(fitted.fontSizePx),
    fontFamily: primaryFontFamily(computed.fontFamily),
    color,
    bold: Number.parseInt(computed.fontWeight || "400", 10) >= 600,
    italic: computed.fontStyle === "italic",
    align: normalizeAlign(computed.textAlign),
    fillColor: fillColor?.alpha && fillColor.alpha > 0 ? fillColor.hex : null,
    rotation: parseCssRotation(computed.transform),
  } satisfies PptExportTextNode;
}

function buildTextNodeFromElement(args: {
  pageElement: HTMLElement;
  element: HTMLElement;
  view: Window;
}) {
  return buildMeasuredTextNode({
    ...args,
    text: args.element.innerText ?? "",
  });
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
      const node = buildMeasuredTextNode({
        pageElement: args.pageElement,
        element: list,
        view,
        text: items.join("\n"),
        items,
      });
      if (node) {
        collected.push(node);
      }
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

const SCIENTIFIC_DIAGRAM_TEXT_SELECTOR = [
  ".scientific-diagram-kicker",
  ".scientific-diagram-title",
  ".scientific-diagram-top-label",
  ".scientific-diagram-side-note",
  ".scientific-diagram-layer-label",
  ".scientific-diagram-bottom-label",
  ".scientific-diagram-caption",
].join(",");

function isScientificDiagramFrame(frame: ChartFrameCandidate) {
  return (
    frame.element.getAttribute("data-html-module-kind") === SCIENTIFIC_DIAGRAM_MODULE_KIND ||
    frame.element.hasAttribute(SCIENTIFIC_DIAGRAM_SPEC_ATTRIBUTE) ||
    frame.element.classList.contains("scientific-diagram-shell")
  );
}

function collectScientificDiagramTextNodes(args: {
  pageElement: HTMLElement;
  frame: ChartFrameCandidate;
}) {
  if (!isScientificDiagramFrame(args.frame)) {
    return [];
  }

  const view = args.pageElement.ownerDocument.defaultView;
  if (!view) {
    return [];
  }

  const collected: PptExportTextNode[] = [];
  const candidates = Array.from(
    args.frame.element.querySelectorAll<HTMLElement>(SCIENTIFIC_DIAGRAM_TEXT_SELECTOR),
  );

  for (const element of candidates) {
    const node = buildTextNodeFromElement({
      pageElement: args.pageElement,
      element,
      view,
    });
    if (node) {
      collected.push(node);
    }
  }

  return dedupeTextNodes(collected);
}

function collectChartFrameSupportTextNodes(args: {
  pageElement: HTMLElement;
  frame: ChartFrameCandidate;
}) {
  return dedupeTextNodes([
    ...collectChartSupportTextNodes(args),
    ...collectScientificDiagramTextNodes(args),
  ]);
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

async function collectExportPageFrames(args: {
  document: Document;
  htmlReport: GeneratedHtmlReport;
}) {
  const pagePreviews = buildHtmlReportPagePreviews(args.htmlReport);
  const container = args.document.createElement("div");
  container.setAttribute("data-ppt-transient-export-frames", "true");
  container.style.cssText = `
    position: fixed;
    visibility: hidden;
    pointer-events: none;
    opacity: 0;
    top: -10000px;
    left: 0;
    width: ${HTML_REPORT_PAGE_WIDTH}px;
    height: ${HTML_REPORT_PAGE_HEIGHT}px;
    overflow: hidden;
  `;
  args.document.body.appendChild(container);

  const frames = pagePreviews.map((pagePreview) => {
    const iframe = args.document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("sandbox", "allow-same-origin");
    iframe.setAttribute("data-ppt-transient-export-page-frame", String(pagePreview.pageNumber));
    iframe.tabIndex = -1;
    iframe.style.cssText = `
      display: block;
      width: ${HTML_REPORT_PAGE_WIDTH}px;
      height: ${HTML_REPORT_PAGE_HEIGHT}px;
      border: 0;
    `;
    iframe.srcdoc = pagePreview.srcDoc;
    container.appendChild(iframe);
    return iframe;
  });

  await Promise.all(frames.map((frame) => waitForFrameReady(frame)));

  const collected = frames
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

  return {
    frames: collected,
    cleanup: () => container.remove(),
  };
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
    if (isElementHiddenForExport(element, view)) {
      continue;
    }

    const rect = measureElementRect(args.pageElement, element);
    if (!rect.w || !rect.h) {
      continue;
    }

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

    const node = buildMeasuredTextNode({
      pageElement: args.pageElement,
      element,
      view,
      text,
      items,
    });
    if (node) {
      textNodes.push(node);
    }
  }

  return textNodes;
}

function textNodeOverlapsExisting(
  candidate: PptExportTextNode,
  existingNodes: PptExportTextNode[],
) {
  const candidateText = normalizeText(candidate.text);
  return existingNodes.some((node) => {
    if (normalizeText(node.text) !== candidateText) {
      return false;
    }
    const horizontalOverlap = Math.max(
      0,
      Math.min(candidate.x + candidate.w, node.x + node.w) - Math.max(candidate.x, node.x),
    );
    const verticalOverlap = Math.max(
      0,
      Math.min(candidate.y + candidate.h, node.y + node.h) - Math.max(candidate.y, node.y),
    );
    const overlapArea = horizontalOverlap * verticalOverlap;
    const candidateArea = Math.max(candidate.w * candidate.h, 0.01);
    return overlapArea / candidateArea > 0.58;
  });
}

function hasTextCandidateDescendant(element: HTMLElement) {
  return Boolean(
    element.querySelector(
      'h1,h2,h3,h4,h5,h6,p,button,label,figcaption,li,[data-html-block-id],[data-html-visual-kind="annotation"],[data-html-visual-kind="rail"],[data-html-visual-kind="badge"]',
    ),
  );
}

function shouldCollectLooseTextElement(element: HTMLElement) {
  if (
    element.getAttribute("data-html-canvas-placeholder") === "true" ||
    element.closest("[data-html-block-id]") ||
    element.closest('[data-html-visual-kind="chart-frame"]') ||
    element.closest("[data-ppt-transient-export-frames]")
  ) {
    return false;
  }

  const text = normalizeText(element.innerText ?? element.textContent ?? "");
  if (!text || text.length < 2) {
    return false;
  }

  const tagName = element.tagName.toLowerCase();
  if (tagName === "script" || tagName === "style" || tagName === "svg") {
    return false;
  }

  if (["h1", "h2", "h3", "h4", "h5", "h6", "p", "button", "label", "figcaption", "li"].includes(tagName)) {
    return true;
  }

  const visualKind = element.getAttribute("data-html-visual-kind");
  if (visualKind === "annotation" || visualKind === "rail" || visualKind === "badge" || visualKind === "label-surface") {
    return true;
  }

  if ((tagName === "div" || tagName === "span") && !hasTextCandidateDescendant(element)) {
    return true;
  }

  return false;
}

function collectLooseTextNodes(args: {
  pageElement: HTMLElement;
  existingTextNodes: PptExportTextNode[];
}) {
  const view = args.pageElement.ownerDocument.defaultView;
  if (!view) {
    return [];
  }

  const collected: PptExportTextNode[] = [];
  const candidates = Array.from(
    args.pageElement.querySelectorAll<HTMLElement>(
      'h1,h2,h3,h4,h5,h6,p,button,label,figcaption,li,span,div,[data-html-visual-kind="annotation"],[data-html-visual-kind="rail"],[data-html-visual-kind="badge"],[data-html-visual-kind="label-surface"]',
    ),
  ).sort((left, right) => left.childElementCount - right.childElementCount);

  for (const element of candidates) {
    if (!shouldCollectLooseTextElement(element)) {
      continue;
    }

    if (isElementHiddenForExport(element, view)) {
      continue;
    }

    const node = buildTextNodeFromElement({
      pageElement: args.pageElement,
      element,
      view,
    });
    if (!node || textNodeOverlapsExisting(node, [...args.existingTextNodes, ...collected])) {
      continue;
    }
    collected.push(node);
  }

  return dedupeTextNodes(collected);
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

function shouldExportNativeTableModel(
  element: HTMLElement,
  tableSpec: NonNullable<ReturnType<typeof parseHtmlTableSpec>>,
) {
  const absoluteDescendantCount = Array.from(element.querySelectorAll<HTMLElement>("[style]")).filter((child) =>
    /position\s*:\s*absolute/i.test(child.getAttribute("style") ?? ""),
  ).length;
  if (absoluteDescendantCount > 4) {
    return false;
  }

  const cellCount = tableSpec.columns.length * Math.max(tableSpec.rows.length, 1);
  const emptyCellCount = tableSpec.rows.flat().filter((cell) => !normalizeText(cell)).length;
  const emptyRatio = cellCount > 0 ? emptyCellCount / cellCount : 0;
  if (tableSpec.rows.length > 8 && emptyRatio > 0.42) {
    return false;
  }

  if (element.classList.contains("html-table-module")) {
    return true;
  }

  return Array.from(element.children).some((child) =>
    /display\s*:\s*grid/i.test((child as HTMLElement).getAttribute("style") ?? ""),
  );
}

function collectTableModels(args: {
  pageElement?: HTMLElement | null;
  theme: PptExportThemeSnapshot;
}): TableCollectionResult {
  const tableNodes: PptExportTableModel[] = [];
  const skipVisualIds = new Set<string>();
  const tableElements = args.pageElement
    ? Array.from(args.pageElement.querySelectorAll<HTMLElement>('[data-html-module-kind="table"]'))
    : [];

  for (const element of tableElements) {
    const tableSpec = parseHtmlTableSpec(element.getAttribute(HTML_TABLE_SPEC_ATTRIBUTE));
    const rect = args.pageElement ? measureElementRect(args.pageElement, element) : null;
    if (!tableSpec || !rect?.w || !rect.h || !shouldExportNativeTableModel(element, tableSpec)) {
      continue;
    }

    const visualId = element.getAttribute("data-html-visual-id");
    if (visualId) {
      skipVisualIds.add(visualId);
    }

    tableNodes.push({
      kind: "table",
      x: pxToInches(rect.x),
      y: pxToInches(rect.y),
      w: pxToInches(rect.w),
      h: pxToInches(rect.h),
      columns: tableSpec.columns.map((column, index) => normalizeText(column.label) || `Column ${index + 1}`),
      rows: tableSpec.rows.map((row) => row.map((cell) => normalizeMultilineText(cell))),
      themeTokens: buildChartThemeTokens(args.theme),
    });
  }

  return { tableNodes, skipVisualIds };
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

    if (readAttribute(element, "data-export-omit") === "true" || isElementHiddenForExport(element, view)) {
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
        ? collectChartFrameSupportTextNodes({
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
      ? collectChartFrameSupportTextNodes({
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
      tableNodes: [],
    };
  }

  const chartCollection = collectChartModels({
    pageElement: args.frame.pageElement,
    theme,
    scene: args.scene,
    warnings: args.warnings,
    pageNumber: args.pageNumber,
  });
  const tableCollection = collectTableModels({
    pageElement: args.frame.pageElement,
    theme,
  });
  const skipVisualIds = new Set([
    ...chartCollection.skipVisualIds,
    ...tableCollection.skipVisualIds,
  ]);
  const structuredTextNodes = dedupeTextNodes([
    ...collectBlockTextNodes({
      pageElement: args.frame.pageElement,
      warnings: args.warnings,
      pageNumber: args.pageNumber,
    }),
    ...chartCollection.supportTextNodes,
  ]);

  return {
    theme,
    textNodes: dedupeTextNodes([
      ...structuredTextNodes,
      ...collectLooseTextNodes({
        pageElement: args.frame.pageElement,
        existingTextNodes: structuredTextNodes,
      }),
    ]),
    shapeNodes: collectVisualShapeNodes({
      pageElement: args.frame.pageElement,
      skipVisualIds,
      warnings: args.warnings,
      pageNumber: args.pageNumber,
    }),
    chartNodes: chartCollection.chartNodes,
    tableNodes: tableCollection.tableNodes,
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
    tableNodes: annotations.tableNodes,
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

function buildChartDomain(values: number[], options?: { includeZero?: boolean; paddingRatio?: number }) {
  const finiteValues = values.filter(Number.isFinite);
  const includeZero = options?.includeZero ?? true;
  let minValue = finiteValues.length ? Math.min(...finiteValues) : 0;
  let maxValue = finiteValues.length ? Math.max(...finiteValues) : 1;

  if (includeZero) {
    minValue = Math.min(minValue, 0);
    maxValue = Math.max(maxValue, 0);
  }

  if (minValue === maxValue) {
    const spread = Math.max(1, Math.abs(maxValue) * 0.2);
    minValue -= spread;
    maxValue += spread;
  }

  const range = Math.max(maxValue - minValue, 1);
  const padding = range * (options?.paddingRatio ?? 0.08);
  return {
    min: minValue - padding,
    max: maxValue + padding,
  };
}

function scaleChartY(value: number, domain: { min: number; max: number }, plotY: number, plotH: number) {
  const range = Math.max(domain.max - domain.min, 1);
  return plotY + ((domain.max - value) / range) * plotH;
}

function shouldRenderCategoryLabel(index: number, total: number, plotW: number) {
  const maxLabels = Math.max(2, Math.floor(plotW / 0.62));
  const step = Math.max(1, Math.ceil(total / maxLabels));
  return index === 0 || index === total - 1 || index % step === 0;
}

function resolveSeriesColor(chartNode: PptExportChartModel, series: PptExportChartSeries | undefined, index = 0) {
  return (
    series?.color ??
    chartNode.themeTokens.chartPalette[index % Math.max(chartNode.themeTokens.chartPalette.length, 1)] ??
    chartNode.themeTokens.accent
  );
}

function renderChartGridLines(args: {
  pptx: any;
  slide: any;
  chartNode: PptExportChartModel;
  plotX: number;
  plotY: number;
  plotW: number;
  plotH: number;
  domain: { min: number; max: number };
  baseline?: boolean;
}) {
  [0.25, 0.5, 0.75].forEach((ratio) => {
    const y = args.plotY + ratio * args.plotH;
    args.slide.addShape(args.pptx.ShapeType.line, {
      x: args.plotX,
      y,
      w: args.plotW,
      h: 0,
      line: {
        color: args.chartNode.themeTokens.dividerColor,
        width: 0.45,
        transparency: 36,
        dash: "dash",
      },
    });
  });

  if (args.baseline !== false && args.domain.min <= 0 && args.domain.max >= 0) {
    args.slide.addShape(args.pptx.ShapeType.line, {
      x: args.plotX,
      y: scaleChartY(0, args.domain, args.plotY, args.plotH),
      w: args.plotW,
      h: 0,
      line: { color: args.chartNode.themeTokens.dividerColor, width: 1.1 },
    });
  }
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

  const domain = buildChartDomain(totals, { includeZero: true, paddingRatio: 0.06 });
  const stepWidth = plotW / Math.max(values.length, 1);
  const barWidth = Math.max(0.14, Math.min(0.42, stepWidth * 0.52));

  renderChartGridLines({
    pptx,
    slide,
    chartNode,
    plotX,
    plotY,
    plotW,
    plotH,
    domain,
  });

  let cumulative = 0;
  values.forEach((value, index) => {
    const nextTotal = cumulative + value;
    const segmentTop = scaleChartY(Math.max(cumulative, nextTotal), domain, plotY, plotH);
    const segmentBottom = scaleChartY(Math.min(cumulative, nextTotal), domain, plotY, plotH);
    const barHeight = Math.max(0.12, segmentBottom - segmentTop);
    const x = plotX + index * stepWidth + (stepWidth - barWidth) / 2;
    const fillColor =
      value >= 0
        ? resolveSeriesColor(chartNode, chartNode.series[0], 0)
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
      const connectorY = scaleChartY(cumulative, domain, plotY, plotH);
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
      y:
        value >= 0
          ? clamp(segmentTop - 0.22, plotY - 0.02, plotY + plotH - 0.1)
          : clamp(segmentBottom + 0.04, plotY, plotY + plotH + 0.08),
      w: barWidth + 0.16,
      h: 0.2,
      fontFace: "Avenir Next",
      fontSize: 8,
      align: "center",
      color: chartNode.themeTokens.textMuted,
      margin: 0,
    });

    if (shouldRenderCategoryLabel(index, values.length, plotW)) {
      slide.addText(chartNode.labels[index] ?? `Step ${index + 1}`, {
        x: plotX + index * stepWidth,
        y: plotY + plotH + 0.12,
        w: stepWidth,
        h: 0.3,
        fontFace: "Avenir Next",
        fontSize: values.length > 8 ? 7 : 8,
        align: "center",
        color: chartNode.themeTokens.textMuted,
        margin: 0,
        fit: "shrink",
      });
    }

    cumulative = nextTotal;
  });
}

function renderHybridComboChart(pptx: any, slide: any, chartNode: PptExportChartModel) {
  const barSeries = chartNode.series.filter((series) => (series.role ?? "bar") !== "line");
  const lineSeries = chartNode.series.filter((series) => (series.role ?? "bar") === "line");
  if (!chartNode.labels.length || (!barSeries.length && !lineSeries.length)) {
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

  const leftPad = 0.42;
  const rightPad = 0.34;
  const topPad = 0.2;
  const bottomPad = 0.62;
  const plotX = chartNode.x + leftPad;
  const plotY = chartTop + topPad;
  const plotW = Math.max(0.4, chartNode.w - leftPad - rightPad);
  const plotH = Math.max(0.6, chartHeight - topPad - bottomPad);
  const primaryValues = barSeries.flatMap((series) => series.values);
  const secondaryValues = lineSeries.flatMap((series) => series.values);
  const primaryDomain = buildChartDomain(primaryValues, { includeZero: true, paddingRatio: 0.08 });
  const secondaryDomain = buildChartDomain(secondaryValues, {
    includeZero: false,
    paddingRatio: 0.12,
  });
  const primaryY = (value: number) => scaleChartY(value, primaryDomain, plotY, plotH);
  const secondaryY = (value: number) => scaleChartY(value, secondaryDomain, plotY, plotH);
  const baselineY = primaryY(0);
  const stepWidth = plotW / Math.max(chartNode.labels.length, 1);
  const groupWidth = Math.min(stepWidth * 0.62, stepWidth - 0.06);
  const barWidth = Math.max(0.08, groupWidth / Math.max(barSeries.length, 1));

  renderChartGridLines({
    pptx,
    slide,
    chartNode,
    plotX,
    plotY,
    plotW,
    plotH,
    domain: primaryDomain,
  });

  chartNode.labels.forEach((label, categoryIndex) => {
    const xBase = plotX + categoryIndex * stepWidth + (stepWidth - groupWidth) / 2;
    barSeries.forEach((series, seriesIndex) => {
      const value = series.values[categoryIndex] ?? 0;
      const y = primaryY(value);
      const barTop = Math.min(y, baselineY);
      const h = Math.max(0.06, Math.abs(baselineY - y));
      const fillColor = resolveSeriesColor(chartNode, series, seriesIndex);
      slide.addShape(pptx.ShapeType.rect, {
        x: xBase + seriesIndex * barWidth,
        y: barTop,
        w: Math.max(0.06, barWidth - 0.035),
        h,
        fill: { color: fillColor, transparency: 8 },
        line: { color: fillColor, transparency: 18, width: 0.4 },
      });
    });

    if (shouldRenderCategoryLabel(categoryIndex, chartNode.labels.length, plotW)) {
      slide.addText(label, {
        x: plotX + categoryIndex * stepWidth,
        y: plotY + plotH + 0.12,
        w: stepWidth,
        h: 0.28,
        fontFace: "Avenir Next",
        fontSize: chartNode.labels.length > 8 ? 7 : 8,
        align: "center",
        color: chartNode.themeTokens.textMuted,
        margin: 0,
        fit: "shrink",
      });
    }
  });

  lineSeries.forEach((series, seriesIndex) => {
    const color = resolveSeriesColor(chartNode, series, barSeries.length + seriesIndex);
    const points = chartNode.labels.map((_, categoryIndex) => ({
      x: plotX + categoryIndex * stepWidth + stepWidth / 2,
      y: secondaryY(series.values[categoryIndex] ?? 0),
      value: series.values[categoryIndex] ?? 0,
    }));

    points.slice(1).forEach((point, pointIndex) => {
      const previous = points[pointIndex]!;
      slide.addShape(pptx.ShapeType.line, {
        x: previous.x,
        y: previous.y,
        w: point.x - previous.x,
        h: point.y - previous.y,
        line: { color, width: 2.2 },
      });
    });

    points.forEach((point, pointIndex) => {
      slide.addShape(pptx.ShapeType.ellipse, {
        x: point.x - 0.035,
        y: point.y - 0.035,
        w: 0.07,
        h: 0.07,
        fill: { color, transparency: 0 },
        line: { color: "FFFFFF", width: 0.8 },
      });
      if (pointIndex === points.length - 1) {
        slide.addText(formatChartValue(point.value), {
          x: point.x - 0.28,
          y: Math.max(plotY, point.y - 0.28),
          w: 0.56,
          h: 0.2,
          fontFace: "Avenir Next",
          fontSize: 8,
          bold: true,
          align: "center",
          color: chartNode.themeTokens.textPrimary,
          margin: 0,
        });
      }
    });
  });
}

function resolveTableColumnWidths(tableNode: PptExportTableModel) {
  const weights = tableNode.columns.map((column, columnIndex) => {
    const columnValues = tableNode.rows.map((row) => row[columnIndex] ?? "");
    const maxLength = Math.max(column.length, ...columnValues.map((value) => value.length), 4);
    const preferred = Math.sqrt(maxLength);
    return clamp(preferred, columnIndex === 0 ? 1.35 : 0.9, columnIndex === 0 ? 2.4 : 1.8);
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return weights.map((weight) => Number(((tableNode.w * weight) / totalWeight).toFixed(3)));
}

function resolveTableRowHeights(tableNode: PptExportTableModel) {
  const rowCount = tableNode.rows.length + 1;
  if (rowCount <= 1) {
    return [tableNode.h];
  }

  const headerHeight = clamp(tableNode.h * 0.16, 0.18, Math.min(0.34, tableNode.h * 0.34));
  const bodyHeight = Math.max(0.05, (tableNode.h - headerHeight) / Math.max(tableNode.rows.length, 1));
  return [
    Number(headerHeight.toFixed(3)),
    ...tableNode.rows.map(() => Number(bodyHeight.toFixed(3))),
  ];
}

function renderTableNodes(slide: any, slideModel: PptExportSlideModel) {
  for (const tableNode of slideModel.tableNodes) {
    if (!tableNode.columns.length) {
      continue;
    }

    const rowCount = tableNode.rows.length + 1;
    const fontSize = rowCount > 10 ? 6.5 : rowCount > 8 ? 7 : rowCount > 5 ? 8 : 9;
    const border = {
      type: "solid" as const,
      color: tableNode.themeTokens.dividerColor,
      pt: 0.5,
    };
    const headerFill = {
      color: tableNode.themeTokens.surfaceSecondary,
      transparency: 0,
    };
    const bodyFill = {
      color: tableNode.themeTokens.surfaceFill,
      transparency: 4,
    };
    const zebraFill = {
      color: tableNode.themeTokens.surfaceSecondary,
      transparency: 18,
    };
    const rows = [
      tableNode.columns.map((column) => ({
        text: column,
        options: {
          bold: true,
          color: tableNode.themeTokens.textPrimary,
          fill: headerFill,
          border,
          fontSize: Math.max(7, fontSize - 1),
          margin: [0.05, 0.07, 0.05, 0.07],
          valign: "middle" as const,
          fit: "shrink" as const,
        },
      })),
      ...tableNode.rows.map((row, rowIndex) =>
        tableNode.columns.map((_, columnIndex) => ({
          text: row[columnIndex] ?? "",
          options: {
            bold: columnIndex === 0,
            color:
              columnIndex === 0
                ? tableNode.themeTokens.textPrimary
                : tableNode.themeTokens.textMuted,
            fill: rowIndex % 2 === 0 ? bodyFill : zebraFill,
            border,
            fontSize,
            margin: [0.05, 0.07, 0.05, 0.07],
            valign: "top" as const,
            fit: "shrink" as const,
          },
        })),
      ),
    ];

    slide.addTable(rows, {
      x: tableNode.x,
      y: tableNode.y,
      w: tableNode.w,
      h: tableNode.h,
      colW: resolveTableColumnWidths(tableNode),
      rowH: resolveTableRowHeights(tableNode),
      fontFace: "Avenir Next",
      fontSize,
      color: tableNode.themeTokens.textMuted,
      margin: 0,
      border,
      fit: "shrink",
      autoPage: false,
    });
  }
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

    if (chartNode.renderMode === "hybrid" && chartNode.chartKind === "combo") {
      renderHybridComboChart(pptx, slide, chartNode);
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
    const nativeChartHeight = Math.max(0.8, chartHeight);
    const axisLabelFontSize =
      chartNode.labels.length > 10 ? 7 : chartNode.labels.length > 6 ? 8 : 9;
    const showLegend = chartNode.series.length > 1 && chartNode.w >= 3.2 && nativeChartHeight >= 1.45;

    slide.addChart(chartType, chartData, {
      x: chartNode.x,
      y: chartTop,
      w: chartNode.w,
      h: nativeChartHeight,
      showLegend,
      showTitle: false,
      catAxisLabelFontSize: axisLabelFontSize,
      valAxisLabelFontSize: Math.max(7, axisLabelFontSize - 1),
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
      fit: "shrink" as const,
      rotate: textNode.rotation,
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

    if (textNode.runs?.length) {
      slide.addText(
        textNode.runs.map((run) => ({
          text: run.text,
          options: {
            fontFace: run.fontFamily,
            fontSize: run.fontSize,
            bold: run.bold,
            italic: run.italic,
            color: run.color,
          },
        })),
        baseOptions,
      );
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
  renderTableNodes(slide, args.slideModel);
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
  const exportFrames = await collectExportPageFrames({
    document: args.document,
    htmlReport,
  });
  const warnings: PptExportWarning[] = [];
  let slides: PptExportSlideModel[];
  try {
    slides = args.project.pages.map((_, pageIndex) => {
      const built = normalizeSlideModel({
        project: args.project,
        draft: args.draft,
        htmlReport,
        pageIndex,
        frame: exportFrames.frames[pageIndex] ?? null,
      });
      warnings.push(...built.warnings);
      return built.slide;
    });
  } finally {
    exportFrames.cleanup();
  }
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
