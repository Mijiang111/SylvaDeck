import { extractHtmlPageVisualStyle } from "@/features/studio/html-report-visuals";
import JSZip from "jszip";
import {
  HTML_CHART_SPEC_ATTRIBUTE,
  HTML_TABLE_SPEC_ATTRIBUTE,
  TABLE_MODULE_KIND,
  parseHtmlChartSpec,
  parseHtmlTableSpec,
} from "@/features/studio/html-report-data-modules";
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
  HtmlChartKind,
  HtmlPageVisualStyle,
  HtmlTableSpec,
  ModuleChartKind,
  SlideScene,
  SlideSceneChartData,
  SlideSceneChartObject,
  WorkbenchDraft,
  WorkbenchProject,
} from "@/features/studio/types";
import {
  collectRenderedExportPageFrames,
  type ExportPageFrame,
} from "./export/collector";
import {
  buildPptxExportDocument,
  buildPptxExportQualityReport,
  filterPptxWarnings,
  normalizePptxDiagnostics,
} from "./export/quality";
import { renderExportDocumentToPptx } from "./export/renderer";
import {
  PPT_LAYOUT,
  PX_PER_INCH,
  type PptExportBubblePoint,
  type PptExportChartModel,
  type PptExportChartSeries,
  type PptExportChartThemeTokens,
  type PptExportDiagnostic,
  type PptExportMatrixCallout,
  type PptExportMatrixItem,
  type PptExportMatrixQuadrant,
  type PptExportPaint,
  type PptExportSemanticChartSpec,
  type PptExportSlideModel,
  type PptExportTableModel,
  type PptExportTextNode,
  type PptExportThemeSnapshot,
  type PptExportVisualNode,
  type PptExportWarning,
  type PptExportResult,
  type PptxExportDocument,
  type PptxExportShapeNode,
} from "./export/types";

export type {
  PptExportChartModel,
  PptExportResult,
  PptExportSlideModel,
  PptExportVisualNode,
  PptExportWarning,
  PptxExportQualityReport,
} from "./export/types";

const DEFAULT_BACKGROUND = "FBF8F2";
const DEFAULT_SURFACE_FILL = "FFFFFF";
const DEFAULT_DIVIDER = "D8D0C2";
const DEFAULT_TEXT = "102838";
const DEFAULT_BODY = "5B6B77";
const DEFAULT_ACCENT = "C6994A";

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
  skipTextElements: HTMLElement[];
  skipPrimitiveWithinElements: HTMLElement[];
  ownedTextNodes: PptExportTextNode[];
};

type TableCollectionResult = {
  tableNodes: PptExportTableModel[];
  skipVisualIds: Set<string>;
  skipTextElements: HTMLElement[];
  skipPrimitiveWithinElements: HTMLElement[];
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
  valueAxisMin?: number;
  valueAxisMax?: number;
};

type ParsedDiagramSpec = {
  title?: string;
  caption?: string;
  topLabel?: string;
  bottomLabel?: string;
  layers?: Array<{
    label?: string;
    nodeCount?: number;
  }>;
  sideNotes?: Array<{
    text?: string;
    side?: "left" | "right" | string;
  }>;
};

type SupportedNativeChartKind = Extract<
  HtmlChartKind,
  "bar" | "stacked" | "line" | "waterfall" | "combo" | "bubble" | "matrix"
>;

type NormalizedChartContract = {
  chartKind: SupportedNativeChartKind;
  labels: string[];
  series: PptExportChartSeries[];
  title?: string;
  subtitle?: string;
  insight?: string;
  xAxisTitle?: string;
  yAxisTitle?: string;
  secondaryYAxisTitle?: string;
  sizeAxisTitle?: string;
  valueAxisMin?: number;
  valueAxisMax?: number;
  colors: string[];
  showInlineHeading?: boolean;
  bubblePoints?: PptExportBubblePoint[];
  renderMode: "native" | "hybrid";
  fallbackMode?:
    | "native-chart"
    | "native-combo-chart"
    | "native-bubble-chart"
    | "native-waterfall-chart"
    | "native-matrix-shapes"
    | "hybrid-waterfall";
  semanticSpec?: PptExportSemanticChartSpec;
};

type ParsedSolidPaint = {
  type: "solid";
  hex: string;
  alpha: number;
};

type ParsedGradientPaint = {
  type: "linear-gradient";
  angle: number;
  stops: Array<ParsedSolidPaint & { position?: number }>;
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

function pxRectToInches(rect: RectPx) {
  return {
    x: pxToInches(rect.x),
    y: pxToInches(rect.y),
    w: pxToInches(rect.w),
    h: pxToInches(rect.h),
  };
}

function pxFontToPoints(value: number) {
  return pxLineToPoints(value);
}

function pxLineToPoints(value: number) {
  return Number(Math.max(0.5, (value / PX_PER_INCH) * 72).toFixed(1));
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

function pxToPoints(value: number) {
  return Number(Math.max(0, (value / PX_PER_INCH) * 72).toFixed(1));
}

function normalizeAlign(value?: string | null) {
  if (value === "center" || value === "right") {
    return value;
  }
  return "left";
}

function normalizeVerticalAlign(computed: CSSStyleDeclaration) {
  if (
    computed.display.includes("flex") &&
    computed.alignItems === "center" &&
    computed.justifyContent === "center"
  ) {
    return "mid" as const;
  }

  return "top" as const;
}

function resolveElementRotationDegrees(element: HTMLElement) {
  const inlineTransform = element.style.transform || "";
  const rotateMatch = inlineTransform.match(/rotate\((-?\d+(?:\.\d+)?)deg\)/i);
  if (rotateMatch?.[1]) {
    return Number(rotateMatch[1]);
  }

  const computedTransform =
    element.ownerDocument.defaultView?.getComputedStyle(element).transform ?? "";
  const matrixMatch = computedTransform.match(/^matrix\(([^,]+),\s*([^,]+),/i);
  if (!matrixMatch?.[1] || !matrixMatch[2]) {
    return undefined;
  }

  const a = Number(matrixMatch[1]);
  const b = Number(matrixMatch[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return undefined;
  }

  const degrees = Math.round((Math.atan2(b, a) * 180) / Math.PI);
  return degrees === 0 ? undefined : degrees;
}

function resolvePptTextBoxWidthPx(args: {
  rect: { w: number; h: number };
  measurement: ReturnType<typeof measurePptTextLayout>;
  lineHeightPx: number;
  rotate?: number;
}) {
  const normalizedRotation = Math.abs(args.rotate ?? 0) % 180;
  if (normalizedRotation > 1) {
    return Math.max(args.rect.w, args.rect.h + 12, args.measurement.maxLineWidth + 16);
  }

  const singleLineBox = args.measurement.lineCount <= 1 || args.rect.h <= args.lineHeightPx * 1.45;
  if (!singleLineBox) {
    return args.rect.w;
  }

  return Math.max(args.rect.w, args.measurement.maxLineWidth + 6);
}

function parseNumericValue(value: string) {
  const normalized = value.replace(/[^0-9.\-]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveComputedLineHeightPx(computed: CSSStyleDeclaration, fontSizePx: number) {
  const computedLineHeight = parseNumericValue(computed.lineHeight || "");
  return Number.isFinite(computedLineHeight) && computedLineHeight > 0
    ? computedLineHeight
    : fontSizePx * 1.2;
}

function toLineSpacingMultiple(lineHeightPx: number, fontSizePx: number) {
  return Number(clamp(lineHeightPx / Math.max(fontSizePx, 1), 0.8, 2.5).toFixed(2));
}

function resolveParagraphSpacingAfterPt(args: {
  computed: CSSStyleDeclaration;
  lineHeightPx: number;
  isList: boolean;
}) {
  if (args.isList) {
    return pxLineToPoints(Math.max(4, args.lineHeightPx * 0.28));
  }

  const marginBottomPx = parseNumericValue(args.computed.marginBottom || "");
  return marginBottomPx > 0 ? pxLineToPoints(marginBottomPx) : undefined;
}

function resolveParagraphSpacingBeforePt(computed: CSSStyleDeclaration) {
  const marginTopPx = parseNumericValue(computed.marginTop || "");
  return marginTopPx > 0 ? pxLineToPoints(marginTopPx) : undefined;
}

function resolveListStyle(args: {
  element: HTMLElement;
  computed: CSSStyleDeclaration;
  fontSizePx: number;
}) {
  const listElement = args.element.matches("ul,ol")
    ? args.element
    : args.element.querySelector<HTMLElement>("ul,ol");
  if (!listElement) {
    return undefined;
  }

  const listComputed =
    listElement === args.element
      ? args.computed
      : listElement.ownerDocument.defaultView?.getComputedStyle(listElement) ?? args.computed;
  const paddingLeftPx = parseNumericValue(listComputed.paddingLeft || "");
  const indentPt = pxLineToPoints(
    clamp(paddingLeftPx > 0 ? paddingLeftPx : args.fontSizePx * 1.4, 16, 64),
  );

  return {
    kind: listElement.tagName.toLowerCase() === "ol" ? "number" : "bullet",
    indentPt,
    numberStartAt: listElement.tagName.toLowerCase() === "ol" ? 1 : undefined,
  } satisfies NonNullable<PptExportTextNode["listStyle"]>;
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

function splitCssTopLevelList(value: string) {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth = Math.max(0, depth - 1);
    }

    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

let cssColorCanvasContext: CanvasRenderingContext2D | null | undefined;

function parseCssColor(value?: string | null): ParsedSolidPaint | null {
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
    const alpha =
      expanded.length === 8
        ? clamp(Number.parseInt(expanded.slice(6, 8), 16) / 255, 0, 1)
        : 1;
    return {
      type: "solid",
      hex: expanded.slice(0, 6).toUpperCase(),
      alpha,
    } satisfies ParsedSolidPaint;
  }

  const rgbMatch = next.match(
    /^rgba?\(\s*([0-9.]+%?)[,\s]+([0-9.]+%?)[,\s]+([0-9.]+%?)(?:[\/,\s]+([0-9.]+%?))?\s*\)$/i,
  );
  if (rgbMatch) {
    const parseChannel = (raw: string) =>
      raw.includes("%")
        ? clamp((Number.parseFloat(raw) / 100) * 255, 0, 255)
        : clamp(Number.parseFloat(raw), 0, 255);
    const parseAlpha = (raw?: string) => {
      if (raw === undefined) {
        return 1;
      }
      return raw.includes("%")
        ? clamp(Number.parseFloat(raw) / 100, 0, 1)
        : clamp(Number.parseFloat(raw), 0, 1);
    };

    const red = parseChannel(rgbMatch[1] ?? "0");
    const green = parseChannel(rgbMatch[2] ?? "0");
    const blue = parseChannel(rgbMatch[3] ?? "0");
    const alpha = parseAlpha(rgbMatch[4]);
    const hex = [red, green, blue]
      .map((channel) => Math.round(channel).toString(16).padStart(2, "0").toUpperCase())
      .join("");

    return { type: "solid", hex, alpha } satisfies ParsedSolidPaint;
  }

  if (typeof document !== "undefined") {
    cssColorCanvasContext ??= document.createElement("canvas").getContext("2d");
    if (cssColorCanvasContext) {
      cssColorCanvasContext.fillStyle = "#000000";
      cssColorCanvasContext.fillStyle = next;
      const normalized = cssColorCanvasContext.fillStyle;
      if (normalized && normalized !== next && normalized !== "#000000") {
        return parseCssColor(normalized);
      }
      if (/^black$/i.test(next)) {
        return { type: "solid", hex: "000000", alpha: 1 };
      }
    }
  }

  return null;
}

function parseLinearGradient(value?: string | null): ParsedGradientPaint | null {
  if (!value) {
    return null;
  }

  const next = value.trim();
  const gradientMatch = next.match(/^linear-gradient\((.*)\)$/i);
  if (!gradientMatch?.[1]) {
    return null;
  }

  const parts = splitCssTopLevelList(gradientMatch[1]);
  if (parts.length < 2) {
    return null;
  }

  let angle = 180;
  let stopParts = parts;
  const firstPart = parts[0]?.toLowerCase() ?? "";
  if (firstPart.startsWith("to ")) {
    stopParts = parts.slice(1);
    const direction = firstPart.replace(/^to\s+/, "").trim();
    const hasTop = direction.includes("top");
    const hasBottom = direction.includes("bottom");
    const hasLeft = direction.includes("left");
    const hasRight = direction.includes("right");
    if (hasTop && hasRight) {
      angle = 45;
    } else if (hasBottom && hasRight) {
      angle = 135;
    } else if (hasBottom && hasLeft) {
      angle = 225;
    } else if (hasTop && hasLeft) {
      angle = 315;
    } else if (hasRight) {
      angle = 90;
    } else if (hasBottom) {
      angle = 180;
    } else if (hasLeft) {
      angle = 270;
    } else if (hasTop) {
      angle = 0;
    }
  } else {
    const angleMatch = firstPart.match(/^(-?[0-9.]+)(deg|rad|turn|grad)$/i);
    if (angleMatch?.[1] && angleMatch[2]) {
      stopParts = parts.slice(1);
      const rawAngle = Number.parseFloat(angleMatch[1]);
      const unit = angleMatch[2].toLowerCase();
      if (Number.isFinite(rawAngle)) {
        if (unit === "rad") {
          angle = (rawAngle * 180) / Math.PI;
        } else if (unit === "turn") {
          angle = rawAngle * 360;
        } else if (unit === "grad") {
          angle = rawAngle * 0.9;
        } else {
          angle = rawAngle;
        }
      }
    }
  }

  const parsedStops: Array<ParsedSolidPaint & { position?: number }> = [];
  for (const part of stopParts) {
    const colorMatch = part.match(
      /^\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\)|[a-z]+)\s*(.*)$/i,
    );
    const color = parseCssColor(colorMatch?.[1] ?? "");
    if (!color) {
      continue;
    }
    const positionMatch = colorMatch?.[2]?.match(/(-?[0-9.]+)%/);
    const position = positionMatch?.[1]
      ? clamp(Math.round(Number.parseFloat(positionMatch[1]) * 1000), 0, 100000)
      : undefined;
    parsedStops.push(position === undefined ? color : { ...color, position });
  }

  if (parsedStops.length < 2) {
    return null;
  }

  const stops = parsedStops.map((stop, index) => {
    const fallbackPosition =
      parsedStops.length <= 1
        ? 0
        : Math.round((index / Math.max(1, parsedStops.length - 1)) * 100000);
    return {
      type: "solid" as const,
      hex: stop.hex,
      alpha: stop.alpha,
      position: stop.position ?? fallbackPosition,
    };
  });

  return {
    type: "linear-gradient",
    angle: ((angle % 360) + 360) % 360,
    stops,
  };
}

function parseCssPaint(value?: string | null): ParsedCssPaint | null {
  return parseLinearGradient(value) ?? parseCssColor(value);
}

function alphaIsVisible(paint: ParsedSolidPaint | null) {
  return Boolean(paint && paint.alpha > 0);
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

function createLinearGradientSvg(args: {
  width: number;
  height: number;
  gradient: ParsedGradientPaint;
  radius?: number;
}) {
  const { width, height, gradient } = args;
  const svgAngle = ((450 - gradient.angle) % 360 + 360) % 360;
  const radians = (svgAngle * Math.PI) / 180;
  const x1 = 50 - Math.cos(radians) * 50;
  const y1 = 50 + Math.sin(radians) * 50;
  const x2 = 50 + Math.cos(radians) * 50;
  const y2 = 50 - Math.sin(radians) * 50;
  const radius = Math.max(0, args.radius ?? 0);

  return createSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="g" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">
          <stop offset="0%" stop-color="#${gradient.stops[0].hex}" stop-opacity="${gradient.stops[0].alpha}" />
          <stop offset="100%" stop-color="#${gradient.stops[1].hex}" stop-opacity="${gradient.stops[1].alpha}" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="url(#g)" />
    </svg>
  `);
}

function readElementFillPaint(args: {
  element: HTMLElement;
  computed: CSSStyleDeclaration;
}) {
  const backgroundImage = args.computed.backgroundImage;
  if (backgroundImage && backgroundImage !== "none") {
    const gradient = parseLinearGradient(backgroundImage);
    if (gradient) {
      return gradient;
    }
  }

  const computedColor = parseCssColor(args.computed.backgroundColor);
  if (alphaIsVisible(computedColor)) {
    return computedColor;
  }

  return computedColor;
}

function nonePaint(): PptExportPaint {
  return { type: "none" };
}

function paintFromCssPaint(paint: ParsedCssPaint | null, opacity: number): PptExportPaint {
  if (!paint) {
    return nonePaint();
  }

  if (paint.type === "solid") {
    return {
      type: "solid",
      color: paint.hex,
      transparency: toTransparency(paint.alpha * opacity),
    };
  }

  return {
    type: "linearGradient",
    angle: paint.angle,
    stops: paint.stops.map((stop, index) => ({
      color: stop.hex,
      transparency: toTransparency(stop.alpha * opacity),
      position:
        stop.position ??
        (paint.stops.length <= 1
          ? 0
          : Math.round((index / Math.max(1, paint.stops.length - 1)) * 100000)),
    })),
  };
}

type RectPx = {
  x: number;
  y: number;
  w: number;
  h: number;
};

function rectsDiffer(left: RectPx, right: RectPx) {
  return (
    Math.abs(left.x - right.x) > 0.5 ||
    Math.abs(left.y - right.y) > 0.5 ||
    Math.abs(left.w - right.w) > 0.5 ||
    Math.abs(left.h - right.h) > 0.5
  );
}

function intersectRects(left: RectPx, right: RectPx): RectPx {
  const x1 = Math.max(left.x, right.x);
  const y1 = Math.max(left.y, right.y);
  const x2 = Math.min(left.x + left.w, right.x + right.w);
  const y2 = Math.min(left.y + left.h, right.y + right.h);
  return {
    x: x1,
    y: y1,
    w: Math.max(0, x2 - x1),
    h: Math.max(0, y2 - y1),
  };
}

function pageClipBounds(pageElement: HTMLElement): RectPx {
  const pageRect = pageElement.getBoundingClientRect();
  return {
    x: 0,
    y: 0,
    w: pageRect.width,
    h: pageRect.height,
  };
}

function elementBoundsInPage(pageElement: HTMLElement, element: Element): RectPx {
  const pageRect = pageElement.getBoundingClientRect();
  const targetRect = element.getBoundingClientRect();
  return {
    x: targetRect.left - pageRect.left,
    y: targetRect.top - pageRect.top,
    w: targetRect.width,
    h: targetRect.height,
  };
}

function measureElementRect(pageElement: HTMLElement, element: Element, clipBounds?: RectPx) {
  const sourceBounds = elementBoundsInPage(pageElement, element);
  const resolvedClipBounds = clipBounds ?? pageClipBounds(pageElement);
  const clippedBounds = intersectRects(sourceBounds, resolvedClipBounds);
  return {
    ...clippedBounds,
    sourceBounds,
    clipBounds: resolvedClipBounds,
    clipped: rectsDiffer(sourceBounds, clippedBounds),
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
    if (kind) {
      args.warnings.push({
        code: "chart-native-unsupported",
        pageNumber: args.pageNumber,
        message: `${kind} chart on page ${args.pageNumber} is not yet supported as a native PowerPoint chart.`,
      });
    }
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
    valueAxisMin: args.parsed.valueAxisMin,
    valueAxisMax: args.parsed.valueAxisMax,
    colors: clippedSeries.map((item) => item.color).filter((item): item is string => Boolean(item)),
    renderMode: "native",
    fallbackMode: kind === "waterfall" ? "native-waterfall-chart" : "native-chart",
  } satisfies NormalizedChartContract;
}

function normalizeMatrixItemColor(value: string | null | undefined, fallback: string) {
  return parseCssColor(value)?.hex ?? fallback;
}

function semanticSpecFromNormalizedChart(
  contract: Pick<
    NormalizedChartContract,
    | "chartKind"
    | "labels"
    | "series"
    | "bubblePoints"
    | "xAxisTitle"
    | "yAxisTitle"
    | "sizeAxisTitle"
    | "valueAxisMin"
    | "valueAxisMax"
    | "colors"
    | "semanticSpec"
  >,
): PptExportSemanticChartSpec | undefined {
  if (contract.semanticSpec) {
    return contract.semanticSpec;
  }
  if (contract.chartKind === "line") {
    return {
      kind: "line",
      labels: contract.labels,
      series: contract.series,
      valueAxisMin: contract.valueAxisMin,
      valueAxisMax: contract.valueAxisMax,
      xAxisTitle: contract.xAxisTitle,
      yAxisTitle: contract.yAxisTitle,
    };
  }
  if (contract.chartKind === "waterfall") {
    return {
      kind: "waterfall",
      labels: contract.labels,
      values: contract.series[0]?.values ?? [],
      colors: contract.colors,
      yAxisTitle: contract.yAxisTitle,
    };
  }
  if (contract.chartKind === "bubble") {
    return {
      kind: "bubble",
      points: contract.bubblePoints ?? [],
      xAxisTitle: contract.xAxisTitle,
      yAxisTitle: contract.yAxisTitle,
      sizeAxisTitle: contract.sizeAxisTitle,
    };
  }
  return undefined;
}

function normalizeChartContractFromSpec(args: {
  spec: HtmlChartSpec;
  pageNumber: number;
  warnings: PptExportWarning[];
}): NormalizedChartContract | null {
  if (args.spec.kind === "bubble") {
    const points = args.spec.points
      .map((point, index) => ({
        label: normalizeText(point.label || `Point ${index + 1}`) || `Point ${index + 1}`,
        x: Number(point.x) || 0,
        y: Number(point.y) || 0,
        size: Math.max(1, Number(point.size) || 1),
        color: parseCssColor(point.color)?.hex,
        group: normalizeText(point.group ?? "") || null,
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.size));

    if (!points.length) {
      args.warnings.push({
        code: "chart-native-unsupported",
        pageNumber: args.pageNumber,
        message: `Bubble chart on page ${args.pageNumber} did not expose enough structured point data for editable PPTX export.`,
      });
      return null;
    }

    return {
      chartKind: "bubble",
      labels: points.map((point) => point.label),
      series: [],
      bubblePoints: points,
      title: normalizeText(args.spec.title) || undefined,
      subtitle: normalizeText(args.spec.subtitle) || undefined,
      insight: normalizeText(args.spec.insight) || undefined,
      xAxisTitle: normalizeText(args.spec.xLabel) || undefined,
      yAxisTitle: normalizeText(args.spec.yLabel) || undefined,
      sizeAxisTitle: normalizeText(args.spec.sizeLabel) || undefined,
      colors: points.map((point) => point.color).filter((item): item is string => Boolean(item)),
      renderMode: "native",
      fallbackMode: "native-bubble-chart",
    } satisfies NormalizedChartContract;
  }

  if (args.spec.kind === "matrix") {
    const fallbackColors = args.spec.colors?.length ? args.spec.colors : ["#F8F3EC", "#EAF3F5", "#F5E7DF", "#EFF2EC"];
    const items: PptExportMatrixItem[] = args.spec.items
      .map((item, index) => ({
        label: normalizeText(item.label || `Item ${index + 1}`) || `Item ${index + 1}`,
        detail: normalizeText(item.detail),
        x: clamp(Number(item.x) || 0, 0, 1),
        y: clamp(Number(item.y) || 0, 0, 1),
        w: clamp(Number(item.w) || 0.28, 0.04, 1),
        h: clamp(Number(item.h) || 0.18, 0.04, 1),
        color: normalizeMatrixItemColor(item.color, fallbackColors[index % fallbackColors.length] ?? "#FFFFFF"),
        textColor: parseCssColor(item.textColor)?.hex ?? null,
      }))
      .filter((item) => item.label);
    if (!items.length) {
      args.warnings.push({
        code: "chart-native-unsupported",
        pageNumber: args.pageNumber,
        message: `Matrix chart on page ${args.pageNumber} did not expose enough structured item data for editable PPTX export.`,
      });
      return null;
    }
    const quadrants: PptExportMatrixQuadrant[] | undefined = args.spec.quadrants?.map((quadrant, index) => ({
      label: normalizeText(quadrant.label),
      x: clamp(Number(quadrant.x) || 0, 0, 1),
      y: clamp(Number(quadrant.y) || 0, 0, 1),
      w: clamp(Number(quadrant.w) || 0.5, 0, 1),
      h: clamp(Number(quadrant.h) || 0.5, 0, 1),
      color: normalizeMatrixItemColor(quadrant.color, fallbackColors[index % fallbackColors.length] ?? "#FFFFFF"),
      textColor: parseCssColor(quadrant.textColor)?.hex ?? null,
    }));
    const callout: PptExportMatrixCallout | null = args.spec.callout
      ? {
          title: normalizeText(args.spec.callout.title),
          body: normalizeText(args.spec.callout.body),
          x: clamp(Number(args.spec.callout.x) || 0.68, 0, 1),
          y: clamp(Number(args.spec.callout.y) || 0.12, 0, 1),
          w: clamp(Number(args.spec.callout.w) || 0.24, 0.04, 1),
          h: clamp(Number(args.spec.callout.h) || 0.2, 0.04, 1),
          color: normalizeMatrixItemColor(args.spec.callout.color, "#FFFFFF"),
          textColor: parseCssColor(args.spec.callout.textColor)?.hex ?? null,
          borderColor: parseCssColor(args.spec.callout.borderColor)?.hex ?? null,
        }
      : null;
    return {
      chartKind: "matrix",
      labels: [],
      series: [],
      title: normalizeText(args.spec.title) || undefined,
      subtitle: normalizeText(args.spec.subtitle) || undefined,
      insight: normalizeText(args.spec.insight) || undefined,
      xAxisTitle: normalizeText(args.spec.xLabel) || undefined,
      yAxisTitle: normalizeText(args.spec.yLabel) || undefined,
      colors: items.map((item) => item.color).filter((item): item is string => Boolean(item)),
      renderMode: "native",
      fallbackMode: "native-matrix-shapes",
      semanticSpec: {
        kind: "matrix",
        xLabel: normalizeText(args.spec.xLabel) || "X axis",
        yLabel: normalizeText(args.spec.yLabel) || "Y axis",
        xMinLabel: normalizeText(args.spec.xMinLabel ?? ""),
        xMaxLabel: normalizeText(args.spec.xMaxLabel ?? ""),
        yMinLabel: normalizeText(args.spec.yMinLabel ?? ""),
        yMaxLabel: normalizeText(args.spec.yMaxLabel ?? ""),
        plotBounds: args.spec.plotBounds
          ? {
              x: clamp(Number(args.spec.plotBounds.x) || 0, 0, 1),
              y: clamp(Number(args.spec.plotBounds.y) || 0, 0, 1),
              w: clamp(Number(args.spec.plotBounds.w) || 1, 0, 1),
              h: clamp(Number(args.spec.plotBounds.h) || 1, 0, 1),
            }
          : null,
        quadrants,
        items,
        callout,
        colors: items.map((item) => item.color).filter((item): item is string => Boolean(item)),
      },
    } satisfies NormalizedChartContract;
  }

  const labels = args.spec.categories.map((label) => normalizeText(label)).filter(Boolean);
  const series = args.spec.series
    .map((item, index) => {
      const role =
        args.spec.kind === "combo"
          ? item.role ?? (index === 0 ? "bar" : "line")
          : args.spec.kind === "line"
            ? "line"
            : "bar";
      const axis =
        args.spec.kind === "combo"
          ? item.axis ?? (index > 0 ? "secondary" : "primary")
          : "primary";
      return {
        name: normalizeText(item.label || `Series ${index + 1}`) || `Series ${index + 1}`,
        values: item.values.slice(0, labels.length).map((value) => Number(value) || 0),
        color: parseCssColor(item.color)?.hex,
        role,
        axis,
      };
    })
    .filter((item) => item.values.length > 0);

  if (!labels.length || !series.length) {
    args.warnings.push({
      code: "chart-native-unsupported",
      pageNumber: args.pageNumber,
      message: `Chart on page ${args.pageNumber} did not expose enough structured data for editable PPTX export.`,
    });
    return null;
  }

  return {
    chartKind: args.spec.kind,
    labels,
    series,
    title: normalizeText(args.spec.title) || undefined,
    subtitle: normalizeText(args.spec.subtitle) || undefined,
    insight: normalizeText(args.spec.insight) || undefined,
    yAxisTitle: args.spec.unit || undefined,
    secondaryYAxisTitle:
      args.spec.kind === "combo" ? args.spec.secondaryUnit || undefined : undefined,
    valueAxisMin: args.spec.valueAxisMin,
    valueAxisMax: args.spec.valueAxisMax,
    colors: series.map((item) => item.color).filter((item): item is string => Boolean(item)),
    renderMode: "native",
    fallbackMode:
      args.spec.kind === "waterfall"
        ? "native-waterfall-chart"
        : args.spec.kind === "combo"
          ? "native-combo-chart"
          : "native-chart",
  } satisfies NormalizedChartContract;
}

function normalizeChartContractFromElement(args: {
  element: HTMLElement;
  pageNumber: number;
  warnings: PptExportWarning[];
}) {
  const spec = parseHtmlChartSpec(args.element.getAttribute(HTML_CHART_SPEC_ATTRIBUTE));
  if (!spec) {
    return null;
  }

  return normalizeChartContractFromSpec({
    spec,
    pageNumber: args.pageNumber,
    warnings: args.warnings,
  });
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
  const lineHeightPx = resolveComputedLineHeightPx(computed, fontSizePx);
  const items = args.element.matches("ul,ol")
    ? Array.from(args.element.querySelectorAll(":scope li"))
        .map((item) => normalizeText(item.textContent ?? ""))
        .filter(Boolean)
    : undefined;
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
    items,
    whiteSpace: resolveElementTextLayoutWhiteSpace(args.element),
  });
  const isList = Boolean(items?.length);
  const rotate = resolveElementRotationDegrees(args.element);
  const textBoxWidthPx = resolvePptTextBoxWidthPx({
    rect,
    measurement,
    lineHeightPx,
    rotate,
  });
  const textBoxHeightPx =
    Math.abs(rotate ?? 0) % 180 > 1
      ? Math.max(lineHeightPx + 8, Math.min(Math.max(rect.h, measurement.height), lineHeightPx * 1.35 + 8))
      : Math.max(rect.h, measurement.height) + 8;

  return {
    kind: "text",
    x: pxToInches(rect.x),
    y: pxToInches(rect.y),
    w: pxToInches(textBoxWidthPx),
    h: pxToInches(textBoxHeightPx),
    text,
    items,
    fontSize: pxFontToPoints(fontSizePx),
    fontFamily: primaryFontFamily(computed.fontFamily),
    color,
    bold: Number.parseInt(computed.fontWeight || "400", 10) >= 600,
    italic: computed.fontStyle === "italic",
    align: normalizeAlign(computed.textAlign),
    valign: normalizeVerticalAlign(computed),
    rotate,
    fillColor: fillColor?.alpha && fillColor.alpha > 0 ? fillColor.hex : null,
    lineSpacingMultiple: toLineSpacingMultiple(lineHeightPx, fontSizePx),
    paraSpaceAfterPt: resolveParagraphSpacingAfterPt({
      computed,
      lineHeightPx,
      isList,
    }),
    paraSpaceBeforePt: resolveParagraphSpacingBeforePt(computed),
    listStyle: isList
      ? resolveListStyle({
          element: args.element,
          computed,
          fontSizePx,
        })
      : undefined,
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
      const lineHeightPx = resolveComputedLineHeightPx(computed, fontSizePx);
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
        lineSpacingMultiple: toLineSpacingMultiple(lineHeightPx, fontSizePx),
        paraSpaceAfterPt: resolveParagraphSpacingAfterPt({
          computed,
          lineHeightPx,
          isList: true,
        }),
        paraSpaceBeforePt: resolveParagraphSpacingBeforePt(computed),
        listStyle: resolveListStyle({
          element: list,
          computed,
          fontSizePx,
        }),
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

function isCircleLikeElement(element: HTMLElement) {
  const width = parseNumericValue(element.style.width || "");
  const height = parseNumericValue(element.style.height || "");
  const radius = normalizeText(element.style.borderRadius || "");
  return width >= 12 && Math.abs(width - height) <= 18 && radius.includes("50%");
}

function hasReadableTextChild(element: HTMLElement) {
  return Array.from(element.children).some(
    (child) =>
      child instanceof HTMLElement &&
      normalizeText(child.innerText || child.textContent || "").length > 0,
  );
}

function hasReadableStructuralTextChild(element: HTMLElement) {
  const structuralSelector = [
    '[data-html-fit-role="content"]',
    "[data-html-block-id]",
    "[data-html-module-kind]",
    "[data-html-visual-kind]",
    "[data-export-role]",
    `[${HTML_TABLE_SPEC_ATTRIBUTE}]`,
    `[${HTML_CHART_SPEC_ATTRIBUTE}]`,
    "section",
    "article",
    "main",
    "aside",
    "header",
    "footer",
    "figure",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "td",
    "th",
    "ul",
    "ol",
    "li",
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
  ].join(",");

  return Array.from(element.children).some((child) => {
    if (!(child instanceof HTMLElement)) {
      return false;
    }
    const text = normalizeMultilineText(child.innerText || child.textContent || "");
    if (!text) {
      return false;
    }
    return child.matches(structuralSelector) || Boolean(child.querySelector(structuralSelector));
  });
}

function isStructuralTextOwner(element: HTMLElement) {
  return element.matches(
    [
      "[data-html-block-id]",
      "[data-html-module-kind]",
      '[data-html-visual-kind="chart-frame"]',
      `[${HTML_TABLE_SPEC_ATTRIBUTE}]`,
      `[${HTML_CHART_SPEC_ATTRIBUTE}]`,
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
    ].join(","),
  );
}

function collectChartInternalSupportTextNodes(args: {
  pageElement: HTMLElement;
  frame: ChartFrameCandidate;
  includeTextPattern?: RegExp;
}) {
  const view = args.pageElement.ownerDocument.defaultView;
  if (!view) {
    return [];
  }

  const collected: PptExportTextNode[] = [];
  const candidates = Array.from(
    args.frame.element.querySelectorAll<HTMLElement>("div,span,p,h1,h2,h3,h4,h5,h6"),
  );

  for (const element of candidates) {
    if (element.closest("[data-html-block-id]")) {
      continue;
    }
    if (hasReadableTextChild(element)) {
      continue;
    }

    const text = normalizeMultilineText(element.innerText || element.textContent || "");
    if (!text) {
      continue;
    }
    if (args.includeTextPattern && !args.includeTextPattern.test(text)) {
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

    collected.push({
      ...node,
      text,
    });
  }

  return dedupeTextNodes(collected);
}

function collectBlockTextNodes(args: {
  pageElement: HTMLElement;
  warnings: PptExportWarning[];
  pageNumber: number;
  skipTextWithinElements?: HTMLElement[];
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
    if (args.skipTextWithinElements?.some((container) => container.contains(element))) {
      continue;
    }

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

    const lineHeightPx = resolveComputedLineHeightPx(computed, fontSizePx);
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
    const textBoxWidthPx = resolvePptTextBoxWidthPx({
      rect,
      measurement: adjustedMeasurement,
      lineHeightPx: adjustedLineHeightPx,
      rotate: resolveElementRotationDegrees(element),
    });
    const rotate = resolveElementRotationDegrees(element);
    const textBoxHeightPx =
      Math.abs(rotate ?? 0) % 180 > 1
        ? Math.max(
            adjustedLineHeightPx + 8,
            Math.min(
              Math.max(contentHeight, adjustedMeasurement.height),
              adjustedLineHeightPx * 1.35 + 8,
            ),
          )
        : Math.max(contentHeight, adjustedMeasurement.height) + 8;

    textNodes.push({
      kind: "text",
      x: pxToInches(rect.x),
      y: pxToInches(rect.y),
      w: pxToInches(textBoxWidthPx),
      h: pxToInches(textBoxHeightPx),
      text,
      items,
      fontSize: pxFontToPoints(adjustedFontSizePx),
      fontFamily: primaryFontFamily(computed.fontFamily),
      color,
      bold: Number.parseInt(computed.fontWeight || "400", 10) >= 600,
      italic: computed.fontStyle === "italic",
      align: normalizeAlign(computed.textAlign),
      valign: normalizeVerticalAlign(computed),
      rotate,
      fillColor: fillColor?.alpha && fillColor.alpha > 0 ? fillColor.hex : null,
      lineSpacingMultiple: toLineSpacingMultiple(adjustedLineHeightPx, adjustedFontSizePx),
      paraSpaceAfterPt: resolveParagraphSpacingAfterPt({
        computed,
        lineHeightPx: adjustedLineHeightPx,
        isList: Boolean(items?.length),
      }),
      paraSpaceBeforePt: resolveParagraphSpacingBeforePt(computed),
      listStyle: items?.length
        ? resolveListStyle({
            element,
            computed,
            fontSizePx: adjustedFontSizePx,
          })
        : undefined,
    });
  }

  return textNodes;
}

function collectLooseContentTextNodes(args: {
  pageElement: HTMLElement;
  skipTextWithinElements?: HTMLElement[];
}) {
  const view = args.pageElement.ownerDocument.defaultView;
  if (!view) {
    return [];
  }

  const candidates = Array.from(
    args.pageElement.querySelectorAll<HTMLElement>(
      [
        '[data-html-fit-role="content"]',
        "[data-html-diagram-spec] h1",
        "[data-html-diagram-spec] h2",
        "[data-html-diagram-spec] h3",
        "[data-html-diagram-spec] h4",
        "[data-html-diagram-spec] h5",
        "[data-html-diagram-spec] h6",
        "[data-html-diagram-spec] p",
      ].join(","),
    ),
  );
  const textNodes: PptExportTextNode[] = [];

  for (const element of candidates) {
    if (element.closest("[data-html-block-id]")) {
      continue;
    }
    if (isStructuralTextOwner(element)) {
      continue;
    }
    if (args.skipTextWithinElements?.some((container) => container.contains(element))) {
      continue;
    }

    const text = normalizeMultilineText(element.innerText || element.textContent || "");
    if (!text) {
      continue;
    }

    const childContent = Array.from(
      element.querySelectorAll<HTMLElement>('[data-html-fit-role="content"]'),
    ).some(
      (child) =>
        child !== element &&
        !child.closest("[data-html-block-id]") &&
        normalizeMultilineText(child.innerText || child.textContent || ""),
    );
    if (childContent) {
      continue;
    }
    if (hasReadableStructuralTextChild(element)) {
      continue;
    }

    const computed = view.getComputedStyle(element);
    if (
      computed.display === "none" ||
      computed.visibility === "hidden" ||
      Number.parseFloat(computed.opacity || "1") <= 0
    ) {
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

    textNodes.push({
      ...node,
      text,
    });
  }

  return dedupeTextNodes(textNodes);
}

function parseDiagramSpecFromElement(element: HTMLElement): ParsedDiagramSpec | null {
  const raw = element.getAttribute("data-html-diagram-spec");
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as ParsedDiagramSpec;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function createSyntheticDiagramTextNode(args: {
  rect: RectPx;
  text: string;
  fontSizePt: number;
  color?: string;
  align?: "left" | "center" | "right";
}) {
  return {
    kind: "text",
    x: pxToInches(args.rect.x),
    y: pxToInches(args.rect.y),
    w: pxToInches(args.rect.w),
    h: pxToInches(args.rect.h),
    text: args.text,
    fontSize: args.fontSizePt,
    fontFamily: "Inter",
    color: args.color ?? DEFAULT_BODY,
    bold: false,
    align: args.align ?? "left",
    fillColor: null,
  } satisfies PptExportTextNode;
}

function collectDiagramTextNodes(args: { pageElement: HTMLElement }) {
  const view = args.pageElement.ownerDocument.defaultView;
  if (!view) {
    return [];
  }

  const textNodes: PptExportTextNode[] = [];
  const diagramElements = Array.from(args.pageElement.querySelectorAll<HTMLElement>("[data-html-diagram-spec]"));

  for (const diagramElement of diagramElements) {
    const measuredTextElements = Array.from(
      diagramElement.querySelectorAll<HTMLElement>(
        [
          ".scientific-diagram-layer-label",
          ".scientific-diagram-bottom-label",
          ".scientific-diagram-side-note",
          ".scientific-diagram-caption",
          ".scientific-diagram-title",
          ".scientific-diagram-top-label",
        ].join(","),
      ),
    );

    for (const element of measuredTextElements) {
      const node = buildTextNodeFromElement({
        pageElement: args.pageElement,
        element,
        view,
      });
      if (node) {
        textNodes.push(node);
      }
    }

    const spec = parseDiagramSpecFromElement(diagramElement);
    const frame = measureElementRect(args.pageElement, diagramElement);
    if (!spec || !frame.w || !frame.h) {
      continue;
    }

    const seenText = new Set(textNodes.map((node) => normalizeText(node.text).toLowerCase()));
    const addIfMissing = (node: PptExportTextNode) => {
      const key = normalizeText(node.text).toLowerCase();
      if (!key || seenText.has(key)) {
        return;
      }
      seenText.add(key);
      textNodes.push(node);
    };

    const layers = (spec.layers ?? [])
      .map((layer) => normalizeText(layer.label ?? ""))
      .filter(Boolean);
    const plotLeft = frame.x + frame.w * 0.2;
    const plotRight = frame.x + frame.w * 0.8;
    const plotWidth = Math.max(1, plotRight - plotLeft);
    layers.forEach((label, index) => {
      const x =
        layers.length > 1
          ? plotLeft + (index / Math.max(1, layers.length - 1)) * plotWidth
          : frame.x + frame.w / 2;
      addIfMissing(
        createSyntheticDiagramTextNode({
          rect: {
            x: x - 70,
            y: frame.y + frame.h * 0.36,
            w: 140,
            h: 24,
          },
          text: label,
          fontSizePt: 8,
          color: DEFAULT_BODY,
          align: "center",
        }),
      );
    });

    const bottomLabel = normalizeText(spec.bottomLabel ?? "");
    if (bottomLabel) {
      addIfMissing(
        createSyntheticDiagramTextNode({
          rect: {
            x: frame.x + frame.w * 0.28,
            y: frame.y + frame.h * 0.77,
            w: frame.w * 0.44,
            h: 26,
          },
          text: bottomLabel,
          fontSizePt: 8.5,
          color: DEFAULT_BODY,
          align: "center",
        }),
      );
    }

    for (const note of spec.sideNotes ?? []) {
      const text = normalizeText(note.text ?? "");
      if (!text) {
        continue;
      }
      const isRight = note.side === "right";
      addIfMissing(
        createSyntheticDiagramTextNode({
          rect: {
            x: isRight ? frame.x + frame.w - 185 : frame.x + 32,
            y: frame.y + (isRight ? frame.h * 0.42 : frame.h * 0.32),
            w: 150,
            h: 78,
          },
          text,
          fontSizePt: 8,
          color: DEFAULT_BODY,
        }),
      );
    }
  }

  return dedupeTextNodes(textNodes);
}

function collectDiagramElements(pageElement: HTMLElement) {
  return Array.from(pageElement.querySelectorAll<HTMLElement>("[data-html-diagram-spec]"));
}

function collectDiagramShapeNodes(args: { pageElement: HTMLElement }) {
  const nodes: PptExportVisualNode[] = [];
  const diagramElements = collectDiagramElements(args.pageElement);

  for (const diagramElement of diagramElements) {
    const spec = parseDiagramSpecFromElement(diagramElement);
    const layers = (spec?.layers ?? [])
      .map((layer) => ({
        label: normalizeText(layer.label ?? ""),
        nodeCount: Math.max(1, Math.min(8, Math.round(Number(layer.nodeCount) || 1))),
      }))
      .filter((layer) => layer.label);
    if (layers.length < 2) {
      continue;
    }

    const frame = measureElementRect(args.pageElement, diagramElement);
    if (!frame.w || !frame.h) {
      continue;
    }

    const network = {
      x: frame.x + frame.w * 0.2,
      y: frame.y + frame.h * 0.42,
      w: frame.w * 0.6,
      h: frame.h * 0.24,
    };
    const layerNodes = layers.map((layer, layerIndex) => {
      const x =
        layers.length > 1
          ? network.x + (layerIndex / Math.max(1, layers.length - 1)) * network.w
          : network.x + network.w / 2;
      const yStep = layer.nodeCount > 1 ? network.h / (layer.nodeCount - 1) : 0;
      const radius = Math.max(8, Math.min(14, 16 - Math.max(0, layer.nodeCount - 4)));
      return Array.from({ length: layer.nodeCount }, (_, nodeIndex) => ({
        x,
        y: layer.nodeCount === 1 ? network.y + network.h / 2 : network.y + yStep * nodeIndex,
        radius,
      }));
    });

    for (let layerIndex = 0; layerIndex + 1 < layerNodes.length; layerIndex += 1) {
      for (const sourceNode of layerNodes[layerIndex] ?? []) {
        for (const targetNode of layerNodes[layerIndex + 1] ?? []) {
          nodes.push({
            kind: "shape",
            role: "diagram-connector",
            x: pxToInches(sourceNode.x),
            y: pxToInches(sourceNode.y),
            w: pxToInches(targetNode.x - sourceNode.x),
            h: pxToInches(targetNode.y - sourceNode.y),
            shape: "line",
            paint: nonePaint(),
            lineColor: "2F5D84",
            lineTransparency: 62,
            lineWidthPt: pxLineToPoints(2.2),
          });
        }
      }
    }

    for (const node of layerNodes.flat()) {
      nodes.push({
        kind: "shape",
        role: "diagram-node",
        x: pxToInches(node.x - node.radius),
        y: pxToInches(node.y - node.radius),
        w: pxToInches(node.radius * 2),
        h: pxToInches(node.radius * 2),
        shape: "ellipse",
        paint: {
          type: "solid",
          color: "DFE8EE",
          transparency: 0,
        },
        lineColor: "2F5D84",
        lineTransparency: 18,
        lineWidthPt: pxLineToPoints(3),
      });
    }
  }

  return nodes;
}

function shouldRenderVisualAsLine(role: string, rect: { w: number; h: number }) {
  return role === "divider" || role === "rail" || rect.h <= 4 || rect.w <= 4;
}

function resolveComputedBorderPaint(computed: CSSStyleDeclaration) {
  const width = Number.parseFloat(computed.borderWidth || "0");
  if (!Number.isFinite(width) || width <= 0 || computed.borderStyle === "none") {
    return null;
  }

  return parseCssColor(computed.borderColor);
}

function resolveLineDash(computed: CSSStyleDeclaration): PptExportVisualNode["lineDash"] {
  if (computed.borderStyle === "dotted") {
    return "sysDot";
  }
  if (computed.borderStyle === "dashed") {
    return "dash";
  }
  return "solid";
}

function extractShadowColorToken(value: string) {
  const matches = Array.from(value.matchAll(/#[0-9a-f]{3,8}|rgba?\([^)]*\)|\b[a-z]+\b/gi));
  for (const match of matches) {
    const token = match[0];
    const color = parseCssColor(token);
    if (color) {
      return { token, color };
    }
  }
  return null;
}

function resolveBoxShadow(computed: CSSStyleDeclaration, opacity: number): PptExportVisualNode["shadow"] {
  const rawShadow = computed.boxShadow;
  if (!rawShadow || rawShadow === "none") {
    return undefined;
  }

  for (const layer of splitCssTopLevelList(rawShadow)) {
    if (/\binset\b/i.test(layer)) {
      continue;
    }

    const colorToken = extractShadowColorToken(layer);
    if (!colorToken || colorToken.color.alpha <= 0) {
      continue;
    }

    const numericPart = layer.replace(colorToken.token, "").replace(/\binset\b/gi, "");
    const lengths = Array.from(numericPart.matchAll(/(-?[0-9.]+)px/gi)).map((match) =>
      Number.parseFloat(match[1] ?? "0"),
    );
    const offsetX = lengths[0] ?? 0;
    const offsetY = lengths[1] ?? 0;
    const blurPx = Math.max(0, lengths[2] ?? 0);
    const distancePx = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
    const effectiveOpacity = clamp(colorToken.color.alpha * opacity, 0, 1);
    if (effectiveOpacity <= 0 || (blurPx <= 0 && distancePx <= 0)) {
      continue;
    }

    const rawAngle = (Math.atan2(offsetY, offsetX) * 180) / Math.PI;
    const angle = Math.round(((rawAngle % 360) + 360) % 360);
    return {
      type: "outer",
      color: colorToken.color.hex,
      opacity: effectiveOpacity,
      blurPt: pxToPoints(blurPx),
      offsetPt: pxToPoints(distancePx),
      angle,
    };
  }

  return undefined;
}

function resolveBorderRadiusPx(computed: CSSStyleDeclaration, rect: { w: number; h: number }) {
  const raw = computed.borderTopLeftRadius || computed.borderRadius || "0";
  const first = raw.split(/\s+/)[0] ?? "0";
  const parsed = Number.parseFloat(first);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  if (first.includes("%")) {
    return (Math.min(rect.w, rect.h) * parsed) / 100;
  }

  return parsed;
}

function resolveVisualShapeKind(args: {
  lineLike: boolean;
  borderRadiusPx: number;
  rect: { w: number; h: number };
}): PptExportVisualNode["shape"] {
  if (args.lineLike) {
    return "line";
  }

  const minSide = Math.max(1, Math.min(args.rect.w, args.rect.h));
  if (args.borderRadiusPx >= minSide * 0.44) {
    return "ellipse";
  }

  return args.borderRadiusPx >= 4 ? "roundRect" : "rect";
}

type SvgViewport = {
  rect: DOMRect;
  minX: number;
  minY: number;
  width: number;
  height: number;
};

function parseSvgNumber(value?: string | null) {
  if (!value) {
    return 0;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseSvgPoints(value?: string | null) {
  if (!value) {
    return [];
  }

  const values = value
    .trim()
    .split(/[\s,]+/)
    .map((item) => Number.parseFloat(item))
    .filter((item) => Number.isFinite(item));
  const points: Array<{ x: number; y: number }> = [];
  for (let index = 0; index + 1 < values.length; index += 2) {
    points.push({ x: values[index]!, y: values[index + 1]! });
  }
  return points;
}

function readSvgViewport(svg: SVGSVGElement): SvgViewport | null {
  const rect = svg.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  const viewBox = svg.viewBox.baseVal;
  const width = viewBox?.width || parseSvgNumber(svg.getAttribute("width")) || rect.width;
  const height = viewBox?.height || parseSvgNumber(svg.getAttribute("height")) || rect.height;
  if (!width || !height) {
    return null;
  }

  return {
    rect,
    minX: viewBox?.x || 0,
    minY: viewBox?.y || 0,
    width,
    height,
  };
}

function mapSvgPointToPagePx(args: {
  pageElement: HTMLElement;
  viewport: SvgViewport;
  x: number;
  y: number;
}) {
  const pageRect = args.pageElement.getBoundingClientRect();
  return {
    x:
      args.viewport.rect.left -
      pageRect.left +
      ((args.x - args.viewport.minX) / args.viewport.width) * args.viewport.rect.width,
    y:
      args.viewport.rect.top -
      pageRect.top +
      ((args.y - args.viewport.minY) / args.viewport.height) * args.viewport.rect.height,
  };
}

function readSvgOpacity(element: SVGElement, computed: CSSStyleDeclaration, paintOpacityProperty: string) {
  const elementOpacity = Number.parseFloat(element.getAttribute("opacity") ?? computed.opacity ?? "1");
  const paintOpacity = Number.parseFloat(
    element.getAttribute(paintOpacityProperty) ?? computed.getPropertyValue(paintOpacityProperty) ?? "1",
  );

  return clamp(
    (Number.isFinite(elementOpacity) ? elementOpacity : 1) *
      (Number.isFinite(paintOpacity) ? paintOpacity : 1),
    0,
    1,
  );
}

function readSvgSolidPaint(args: {
  element: SVGElement;
  computed: CSSStyleDeclaration;
  property: "fill" | "stroke";
}) {
  const rawAttribute = args.element.getAttribute(args.property);
  const rawComputed = args.computed.getPropertyValue(args.property);
  const raw =
    rawAttribute && rawAttribute !== "currentColor"
      ? rawAttribute
      : rawComputed === "currentColor"
        ? args.computed.color
        : rawComputed;
  const normalized = normalizeText(raw || "");
  if (!normalized || normalized === "none" || normalized.startsWith("url(")) {
    return null;
  }

  return parseCssColor(normalized);
}

function collectSvgLineSegmentNode(args: {
  pageElement: HTMLElement;
  viewport: SvgViewport;
  start: { x: number; y: number };
  end: { x: number; y: number };
  strokePaint: ParsedSolidPaint | null;
  strokeOpacity: number;
  strokeWidth: number;
  dashArray?: string | null;
}): PptExportVisualNode | null {
  if (!args.strokePaint || args.strokeOpacity <= 0) {
    return null;
  }

  const start = mapSvgPointToPagePx({
    pageElement: args.pageElement,
    viewport: args.viewport,
    x: args.start.x,
    y: args.start.y,
  });
  const end = mapSvgPointToPagePx({
    pageElement: args.pageElement,
    viewport: args.viewport,
    x: args.end.x,
    y: args.end.y,
  });
  const width = end.x - start.x;
  const height = end.y - start.y;
  if (Math.abs(width) < 0.5 && Math.abs(height) < 0.5) {
    return null;
  }

  return {
    kind: "shape",
    role: "svg-line",
    x: pxToInches(start.x),
    y: pxToInches(start.y),
    w: pxToInches(width),
    h: pxToInches(height),
    shape: "line",
    paint: nonePaint(),
    lineColor: args.strokePaint.hex,
    lineTransparency: toTransparency(args.strokePaint.alpha * args.strokeOpacity),
    lineWidthPt: pxLineToPoints(args.strokeWidth),
    lineDash: args.dashArray && args.dashArray !== "none" ? "dash" : "solid",
  };
}

function collectSvgPrimitiveNodes(args: { pageElement: HTMLElement; skipWithinElements?: HTMLElement[] }) {
  const view = args.pageElement.ownerDocument.defaultView;
  if (!view) {
    return [];
  }

  const nodes: PptExportVisualNode[] = [];
  const svgs = Array.from(args.pageElement.querySelectorAll<SVGSVGElement>("svg")).filter(
    (svg) => !args.skipWithinElements?.some((container) => container.contains(svg)),
  );
  for (const svg of svgs) {
    const viewport = readSvgViewport(svg);
    if (!viewport) {
      continue;
    }

    const primitives = Array.from(
      svg.querySelectorAll<SVGElement>("polygon,polyline,line,circle,rect"),
    );
    for (const primitive of primitives) {
      const computed = view.getComputedStyle(primitive);
      const fillPaint = readSvgSolidPaint({
        element: primitive,
        computed,
        property: "fill",
      });
      const strokePaint = readSvgSolidPaint({
        element: primitive,
        computed,
        property: "stroke",
      });
      const fillOpacity = readSvgOpacity(primitive, computed, "fill-opacity");
      const strokeOpacity = readSvgOpacity(primitive, computed, "stroke-opacity");
      const strokeWidth = Math.max(
        0,
        parseSvgNumber(primitive.getAttribute("stroke-width") ?? computed.getPropertyValue("stroke-width")),
      );
      const dashArray =
        primitive.getAttribute("stroke-dasharray") ?? computed.getPropertyValue("stroke-dasharray");
      const tagName = primitive.tagName.toLowerCase();

      if (tagName === "polyline" || tagName === "polygon") {
        const rawPoints = parseSvgPoints(primitive.getAttribute("points"));
        if (tagName === "polyline") {
          for (let index = 0; index + 1 < rawPoints.length; index += 1) {
            const node = collectSvgLineSegmentNode({
              pageElement: args.pageElement,
              viewport,
              start: rawPoints[index]!,
              end: rawPoints[index + 1]!,
              strokePaint,
              strokeOpacity,
              strokeWidth,
              dashArray,
            });
            if (node) {
              nodes.push(node);
            }
          }
          continue;
        }

        if (!fillPaint || fillOpacity <= 0 || rawPoints.length < 3) {
          continue;
        }

        const pagePoints = rawPoints.map((point) =>
          mapSvgPointToPagePx({
            pageElement: args.pageElement,
            viewport,
            x: point.x,
            y: point.y,
          }),
        );
        const minX = Math.min(...pagePoints.map((point) => point.x));
        const minY = Math.min(...pagePoints.map((point) => point.y));
        const maxX = Math.max(...pagePoints.map((point) => point.x));
        const maxY = Math.max(...pagePoints.map((point) => point.y));
        const width = maxX - minX;
        const height = maxY - minY;
        if (width <= 0 || height <= 0) {
          continue;
        }

        nodes.push({
          kind: "shape",
          role: "svg-polygon",
          x: pxToInches(minX),
          y: pxToInches(minY),
          w: pxToInches(width),
          h: pxToInches(height),
          shape: "freeform",
          paint: paintFromCssPaint(fillPaint, fillOpacity),
          freeformPoints: pagePoints.map((point) => ({
            x: Math.round(((point.x - minX) / width) * 100000),
            y: Math.round(((point.y - minY) / height) * 100000),
          })),
          lineColor: strokePaint?.hex ?? null,
          lineTransparency: strokePaint ? toTransparency(strokePaint.alpha * strokeOpacity) : 100,
          lineWidthPt: strokePaint && strokeWidth > 0 ? pxLineToPoints(strokeWidth) : 0,
          lineDash: dashArray && dashArray !== "none" ? "dash" : "solid",
        });
        continue;
      }

      if (tagName === "line") {
        const node = collectSvgLineSegmentNode({
          pageElement: args.pageElement,
          viewport,
          start: {
            x: parseSvgNumber(primitive.getAttribute("x1")),
            y: parseSvgNumber(primitive.getAttribute("y1")),
          },
          end: {
            x: parseSvgNumber(primitive.getAttribute("x2")),
            y: parseSvgNumber(primitive.getAttribute("y2")),
          },
          strokePaint,
          strokeOpacity,
          strokeWidth,
          dashArray,
        });
        if (node) {
          nodes.push(node);
        }
        continue;
      }

      if (tagName === "circle") {
        if (!fillPaint || fillOpacity <= 0) {
          continue;
        }
        const cx = parseSvgNumber(primitive.getAttribute("cx"));
        const cy = parseSvgNumber(primitive.getAttribute("cy"));
        const r = parseSvgNumber(primitive.getAttribute("r"));
        if (r <= 0) {
          continue;
        }
        const topLeft = mapSvgPointToPagePx({
          pageElement: args.pageElement,
          viewport,
          x: cx - r,
          y: cy - r,
        });
        const bottomRight = mapSvgPointToPagePx({
          pageElement: args.pageElement,
          viewport,
          x: cx + r,
          y: cy + r,
        });

        nodes.push({
          kind: "shape",
          role: "svg-circle",
          x: pxToInches(topLeft.x),
          y: pxToInches(topLeft.y),
          w: pxToInches(bottomRight.x - topLeft.x),
          h: pxToInches(bottomRight.y - topLeft.y),
          shape: "ellipse",
          paint: paintFromCssPaint(fillPaint, fillOpacity),
          lineColor: strokePaint?.hex ?? null,
          lineTransparency: strokePaint ? toTransparency(strokePaint.alpha * strokeOpacity) : 100,
          lineWidthPt: strokePaint && strokeWidth > 0 ? pxLineToPoints(strokeWidth) : 0,
        });
        continue;
      }

      if (tagName === "rect") {
        if (!fillPaint && !strokePaint) {
          continue;
        }
        const x = parseSvgNumber(primitive.getAttribute("x"));
        const y = parseSvgNumber(primitive.getAttribute("y"));
        const width = parseSvgNumber(primitive.getAttribute("width"));
        const height = parseSvgNumber(primitive.getAttribute("height"));
        if (width <= 0 || height <= 0) {
          continue;
        }
        const topLeft = mapSvgPointToPagePx({
          pageElement: args.pageElement,
          viewport,
          x,
          y,
        });
        const bottomRight = mapSvgPointToPagePx({
          pageElement: args.pageElement,
          viewport,
          x: x + width,
          y: y + height,
        });
        const rx = parseSvgNumber(primitive.getAttribute("rx"));

        nodes.push({
          kind: "shape",
          role: "svg-rect",
          x: pxToInches(topLeft.x),
          y: pxToInches(topLeft.y),
          w: pxToInches(bottomRight.x - topLeft.x),
          h: pxToInches(bottomRight.y - topLeft.y),
          shape: rx > 0 ? "roundRect" : "rect",
          paint: paintFromCssPaint(fillPaint, fillOpacity),
          lineColor: strokePaint?.hex ?? null,
          lineTransparency: strokePaint ? toTransparency(strokePaint.alpha * strokeOpacity) : 100,
          lineWidthPt: strokePaint && strokeWidth > 0 ? pxLineToPoints(strokeWidth) : 0,
        });
      }
    }
  }

  return nodes;
}

function collectVisualShapeElements(pageElement: HTMLElement, skipVisualIds: Set<string>) {
  const candidates = Array.from(
    pageElement.querySelectorAll<HTMLElement>(
      [
        "[data-html-visual-id]",
        "[data-export-role]",
        '[data-html-visual-kind="divider"]',
        '[data-html-visual-kind="rail"]',
        '[data-html-visual-kind="badge"]',
      ].join(","),
    ),
  );

  return candidates.filter((element, index) => {
    return candidates.indexOf(element) === index;
  });
}

function hasStructuredChartContract(element: Element) {
  return Boolean(
    parseHtmlChartSpec(element.getAttribute(HTML_CHART_SPEC_ATTRIBUTE)) ||
      element.getAttribute("data-export-chart"),
  );
}

function hasSvgChartPrimitives(element: HTMLElement) {
  if (element.querySelector("svg,canvas")) {
    return true;
  }

  return false;
}

function hasAbsoluteBarPrimitives(element: HTMLElement) {
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

function hasBubblePointPrimitives(element: HTMLElement) {
  const bubblePoints = Array.from(
    element.querySelectorAll<HTMLElement>("[style*='border-radius:50%'],[style*='border-radius: 50%']"),
  ).filter((candidate) => {
    const width = parseNumericValue(candidate.style.width || "");
    const height = parseNumericValue(candidate.style.height || "");
    return width >= 20 && Math.abs(width - height) <= 18;
  });

  return bubblePoints.length >= 3;
}

function hasAxisScaffold(element: HTMLElement) {
  const style = element.style;
  const borderLeft = style.borderLeft || style.border;
  const borderBottom = style.borderBottom || style.border;
  return Boolean(borderLeft && borderBottom && parseNumericValue(style.height || "") >= 80);
}

function hasUnstructuredChartPrimitives(element: HTMLElement) {
  return (
    hasSvgChartPrimitives(element) ||
    hasAbsoluteBarPrimitives(element) ||
    hasBubblePointPrimitives(element)
  );
}

function findChartPlotElement(frame: HTMLElement) {
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

function resolveChartRenderRect(pageElement: HTMLElement, frame: ChartFrameCandidate) {
  const plotElement = findChartPlotElement(frame.element);
  if (!plotElement) {
    return frame.rect;
  }

  const rect = measureElementRect(pageElement, plotElement);
  return rect.w && rect.h ? rect : frame.rect;
}

function resolveShapeClipBounds(pageElement: HTMLElement, element: HTMLElement): RectPx {
  const pageBounds = pageClipBounds(pageElement);
  const parentElement = element.parentElement;
  const chartFrame = element.closest<HTMLElement>('[data-html-visual-kind="chart-frame"]');
  if (chartFrame && chartFrame !== element) {
    const plotElement = findChartPlotElement(chartFrame);
    if (plotElement && plotElement.contains(element)) {
      const plotBounds = measureElementRect(pageElement, plotElement, pageBounds);
      return plotBounds.w > 0 && plotBounds.h > 0 ? plotBounds : pageBounds;
    }
    const frameBounds = measureElementRect(pageElement, chartFrame, pageBounds);
    return frameBounds.w > 0 && frameBounds.h > 0 ? frameBounds : pageBounds;
  }

  const container = parentElement?.closest<HTMLElement>(
    [
      '[data-html-visual-kind="surface"]',
      '[data-html-visual-kind="highlight"]',
      '[data-html-visual-kind="chart-frame"]',
      "[data-html-module-kind]",
      ".surface-card",
      ".chart-frame",
      "article",
      "figure",
      "aside",
    ].join(","),
  );
  if (container && container !== element && container !== pageElement) {
    const containerBounds = measureElementRect(pageElement, container, pageBounds);
    return containerBounds.w > 0 && containerBounds.h > 0 ? containerBounds : pageBounds;
  }

  return pageBounds;
}

function collectChartFrames(pageElement: HTMLElement) {
  const candidates = Array.from(
    pageElement.querySelectorAll<HTMLElement>('[data-html-visual-kind="chart-frame"]'),
  )
    .filter((element) => {
      const moduleKind = element.getAttribute("data-html-module-kind");
      return !moduleKind || moduleKind === "chart" || hasStructuredChartContract(element);
    })
    .map((element) => ({
      visualId: element.getAttribute("data-html-visual-id") ?? `chart-frame-${Math.random()}`,
      element,
      rect: measureElementRect(pageElement, element),
    }));

  return candidates.filter((candidate, index) => {
    const structured = hasStructuredChartContract(candidate.element);
    const exportable = structured || hasUnstructuredChartPrimitives(candidate.element);
    const hasStructuredDescendant = candidates.some(
      (other) =>
        other !== candidate &&
        candidate.element.contains(other.element) &&
        hasStructuredChartContract(other.element),
    );
    const hasStructuredAncestor = candidates.some(
      (other) =>
        other !== candidate &&
        other.element.contains(candidate.element) &&
        hasStructuredChartContract(other.element),
    );
    const hasExportableChartDescendant = candidates.some(
      (other) =>
        other !== candidate &&
        candidate.element.contains(other.element) &&
        (hasStructuredChartContract(other.element) || hasUnstructuredChartPrimitives(other.element)) &&
        other.rect.w >= 180 &&
        other.rect.h >= 110,
    );

    if (structured && hasStructuredAncestor) {
      return false;
    }

    if (!structured && hasStructuredDescendant) {
      return false;
    }

    if (!structured && hasExportableChartDescendant) {
      return false;
    }

    if (!exportable) {
      return false;
    }

    if (!structured && (candidate.rect.w < 180 || candidate.rect.h < 110)) {
      return false;
    }

    return candidates.findIndex((entry) => entry.element === candidate.element) === index;
  });
}

function warnIfUnsupportedStructuredChart(args: {
  element: HTMLElement;
  warnings: PptExportWarning[];
  pageNumber: number;
}) {
  const spec = parseHtmlChartSpec(args.element.getAttribute(HTML_CHART_SPEC_ATTRIBUTE));
  args.warnings.push({
    code: "chart-native-unsupported",
    severity: "degraded",
    pageNumber: args.pageNumber,
    message: spec
      ? `${spec.kind} chart on page ${args.pageNumber} was skipped because it could not be exported as a strict native/semantic PPT object.`
      : `Chart frame on page ${args.pageNumber} was skipped because it could not be exported as a strict native/semantic PPT object.`,
  });
}

function collectTableElements(pageElement: HTMLElement) {
  const selector = `[data-html-module-kind="${TABLE_MODULE_KIND}"],[${HTML_TABLE_SPEC_ATTRIBUTE}],table`;
  const candidates = Array.from(pageElement.querySelectorAll<HTMLElement>(selector));
  return candidates.filter((element, index) => {
    const firstMatchingAncestor = candidates.find(
      (candidate) => candidate !== element && candidate.contains(element),
    );
    return !firstMatchingAncestor || candidates.indexOf(firstMatchingAncestor) > index;
  });
}

function readTableSpecFromElement(element: HTMLElement) {
  const explicitSpec = parseHtmlTableSpec(element.getAttribute(HTML_TABLE_SPEC_ATTRIBUTE));
  if (explicitSpec) {
    return explicitSpec;
  }

  if (element.tagName.toLowerCase() !== "table") {
    return null;
  }

  const rows = Array.from(element.querySelectorAll("tr"))
    .map((row) =>
      Array.from(row.querySelectorAll("th, td"))
        .map((cell) => normalizeText(cell.textContent ?? ""))
        .filter((cell) => cell.length > 0),
    )
    .filter((row) => row.length > 0);
  if (rows.length < 2) {
    return null;
  }

  const columns = rows[0]!.map((label, index) => ({
    id: `column-${index + 1}`,
    label: label || `Column ${index + 1}`,
    type: "text" as const,
  }));
  const dataRows = rows.slice(1);
  return {
    raw: [columns.map((column) => column.label), ...dataRows].map((row) => row.join("\t")).join("\n"),
    hasHeader: true,
    columns,
    rows: dataRows,
  };
}

function normalizeTableRows(spec: HtmlTableSpec) {
  const columnCount = Math.max(spec.columns.length, ...spec.rows.map((row) => row.length), 1);
  const bodyRows = spec.rows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => normalizeText(row[index] ?? "")),
  );
  if (spec.hasHeader === false) {
    return bodyRows;
  }

  return [
    Array.from({ length: columnCount }, (_, index) =>
      normalizeText(spec.columns[index]?.label ?? `Column ${index + 1}`),
    ),
    ...bodyRows,
  ];
}

function collectTableModels(args: {
  pageElement?: HTMLElement | null;
  theme: PptExportThemeSnapshot;
  warnings: PptExportWarning[];
  pageNumber: number;
}): TableCollectionResult {
  const tableNodes: PptExportTableModel[] = [];
  const skipVisualIds = new Set<string>();
  const skipTextElements: HTMLElement[] = [];
  const skipPrimitiveWithinElements: HTMLElement[] = [];
  const themeTokens = buildChartThemeTokens(args.theme);
  const tableElements = args.pageElement ? collectTableElements(args.pageElement) : [];

  for (const element of tableElements) {
    skipTextElements.push(element);
    skipPrimitiveWithinElements.push(element);
    const visualId = element.getAttribute("data-html-visual-id");
    if (visualId) {
      skipVisualIds.add(visualId);
    }

    const rect = args.pageElement ? measureElementRect(args.pageElement, element) : null;
    if (!rect?.w || !rect.h) {
      continue;
    }

    const spec = readTableSpecFromElement(element);
    if (!spec) {
      args.warnings.push({
        code: "table-native-unsupported",
        pageNumber: args.pageNumber,
        message: `Table on page ${args.pageNumber} did not expose enough structured data for native PPTX export.`,
      });
      continue;
    }

    const rows = normalizeTableRows(spec);
    if (!rows.length || rows.every((row) => row.every((cell) => !cell))) {
      args.warnings.push({
        code: "table-native-unsupported",
        pageNumber: args.pageNumber,
        message: `Table on page ${args.pageNumber} had no exportable cell content.`,
      });
      continue;
    }

    tableNodes.push({
      kind: "table",
      renderMode: "native",
      x: pxToInches(rect.x),
      y: pxToInches(rect.y),
      w: pxToInches(rect.w),
      h: pxToInches(rect.h),
      rows,
      headerRow: spec.hasHeader !== false,
      themeTokens,
    });
  }

  return {
    tableNodes,
    skipVisualIds,
    skipTextElements: skipTextElements.filter((element, index) => skipTextElements.indexOf(element) === index),
    skipPrimitiveWithinElements: skipPrimitiveWithinElements.filter(
      (element, index) => skipPrimitiveWithinElements.indexOf(element) === index,
    ),
  };
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
  skipPrimitiveWithinElements?: HTMLElement[];
  warnings: PptExportWarning[];
  pageNumber: number;
}) {
  const shapeNodes: PptExportVisualNode[] = [];
  const view = args.pageElement.ownerDocument.defaultView;
  const visualElements = collectVisualShapeElements(args.pageElement, args.skipVisualIds);

  if (!view) {
    return shapeNodes;
  }

  for (const element of visualElements) {
    const nodeId =
      element.getAttribute("data-html-visual-id") ??
      readAttribute(element, "data-export-role", "data-html-visual-kind") ??
      "unknown";
    if (args.skipVisualIds.has(nodeId)) {
      continue;
    }

    if (
      args.skipPrimitiveWithinElements?.some((container) => container !== element && container.contains(element))
    ) {
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

    const rect = measureElementRect(
      args.pageElement,
      element,
      resolveShapeClipBounds(args.pageElement, element),
    );
    if (!rect.w || !rect.h) {
      continue;
    }

    const computed = view.getComputedStyle(element);
    const fillPaint = readElementFillPaint({ element, computed });
    const computedBorderWidth = Number.parseFloat(computed.borderWidth || "0");
    const computedBorderPaint = resolveComputedBorderPaint(computed);
    const explicitBorderWidth = readNumericAttribute(
      element,
      "data-export-border-width",
      "data-html-visual-border-width",
    );
    const explicitBorderPaint = parseCssColor(
      readAttribute(element, "data-export-border", "data-html-visual-border"),
    );
    const hasComputedBorder = Boolean(computedBorderPaint && computedBorderWidth > 0);
    const borderPaint = hasComputedBorder ? computedBorderPaint : explicitBorderPaint;
    const borderWidth =
      hasComputedBorder && Number.isFinite(computedBorderWidth)
        ? computedBorderWidth
        : (explicitBorderWidth ?? 0);
    const borderRadius = resolveBorderRadiusPx(computed, rect);
    const opacity =
      readNumericAttribute(element, "data-export-opacity", "data-html-visual-opacity") ??
      clamp(Number.parseFloat(computed.opacity || "1") || 1, 0, 1);
    const shadow = resolveBoxShadow(computed, opacity);
    const lineDash = resolveLineDash(computed);

    const lineLike = shouldRenderVisualAsLine(role, rect);
    const paint = lineLike ? nonePaint() : paintFromCssPaint(fillPaint, opacity);
    const solidLineColor =
      fillPaint?.type === "solid" ? fillPaint.hex : borderPaint?.hex ?? null;
    const solidLineAlpha =
      fillPaint?.type === "solid" ? fillPaint.alpha * opacity : (borderPaint?.alpha ?? 1) * opacity;

    if (!lineLike && paint.type === "none" && !borderPaint?.hex) {
      args.warnings.push({
        code: "visual-missing",
        pageNumber: args.pageNumber,
        message: `Visual node ${nodeId} on page ${args.pageNumber} had no exportable fill or stroke.`,
      });
      continue;
    }

    const lineThicknessPx = Math.max(
      borderWidth,
      lineLike ? Math.min(rect.w, rect.h) : 0,
      1,
    );

    if (rect.clipped) {
      args.warnings.push({
        code: "visual-clipped",
        severity: "info",
        countsAgainstQuality: false,
        pageNumber: args.pageNumber,
        sourceId: nodeId,
        sourceKind: "visual",
        message: `Visual node ${nodeId} on page ${args.pageNumber} was clipped to its export container.`,
      });
    }

    shapeNodes.push({
      kind: "shape",
      role,
      x: pxToInches(rect.x),
      y: pxToInches(rect.y),
      w: pxToInches(rect.w),
      h: pxToInches(rect.h),
      shape: resolveVisualShapeKind({ lineLike, borderRadiusPx: borderRadius, rect }),
      paint,
      lineColor: lineLike ? solidLineColor : borderPaint?.hex ?? null,
      lineTransparency: lineLike
        ? toTransparency(solidLineAlpha)
        : toTransparency((borderPaint?.alpha ?? 1) * opacity),
      lineWidthPt: lineLike ? pxLineToPoints(lineThicknessPx) : borderWidth > 0 ? pxLineToPoints(borderWidth) : 0,
      lineDash,
      shadow: lineLike ? undefined : shadow,
      sourceBounds: pxRectToInches(rect.sourceBounds),
      clipBounds: pxRectToInches(rect.clipBounds),
      clipped: rect.clipped,
    });
  }

  return [
    ...shapeNodes,
    ...collectSvgPrimitiveNodes({
      pageElement: args.pageElement,
      skipWithinElements: args.skipPrimitiveWithinElements,
    }),
  ];
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
        valueAxisMin: undefined,
        valueAxisMax: undefined,
        colors: series.map((item) => item.color).filter((item): item is string => Boolean(item)),
        renderMode: "native",
        fallbackMode:
          args.chart.chartKind === "waterfall" ? "native-waterfall-chart" : "native-chart",
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
      valueAxisMin: undefined,
      valueAxisMax: undefined,
      colors: args.chart.series
        .map((series) => parseCssColor(series.color)?.hex)
        .filter((item): item is string => Boolean(item)),
      renderMode: "native",
      fallbackMode:
        args.chart.chartKind === "waterfall" ? "native-waterfall-chart" : "native-chart",
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
  const skipTextElements: HTMLElement[] = [];
  const skipPrimitiveWithinElements: HTMLElement[] = [];
  const ownedTextNodes: PptExportTextNode[] = [];
  const chartFrames = args.pageElement ? collectChartFrames(args.pageElement) : [];
  const sceneCharts = (args.scene?.objects ?? []).filter(
    (object): object is SlideSceneChartObject => object.kind === "chart",
  );
  const nativeFrameIndexes = new Set<number>();
  const themeTokens = buildChartThemeTokens(args.theme);

  const skipUnsupportedFrame = (frame: ChartFrameCandidate) => {
    skipVisualIds.add(frame.visualId);
    skipTextElements.push(frame.element);
    skipPrimitiveWithinElements.push(frame.element);
    warnIfUnsupportedStructuredChart({
      element: frame.element,
      warnings: args.warnings,
      pageNumber: args.pageNumber,
    });
  };

  const addNativeChart = (
    normalized: NormalizedChartContract,
    frame: ChartFrameCandidate | null,
    sceneChart?: SlideSceneChartObject,
  ) => {
    const chartRect =
      frame && args.pageElement
        ? normalized.chartKind === "matrix"
          ? frame.rect
          : resolveChartRenderRect(args.pageElement, frame)
        : null;
    const semanticSpec = frame ? semanticSpecFromNormalizedChart(normalized) : undefined;
    if (frame) {
      if (semanticSpec) {
        skipTextElements.push(frame.element);
        if (args.pageElement && normalized.chartKind !== "matrix") {
          ownedTextNodes.push(
            ...collectChartInternalSupportTextNodes({
              pageElement: args.pageElement,
              frame,
              includeTextPattern:
                /\b(?:takeaway|note|source|legend|callout|quick win|strategic build|selective bet|deprioritize)\b|=/i,
            }),
          );
        }
      }
      skipPrimitiveWithinElements.push(frame.element);
    }
    chartNodes.push({
      kind: "chart",
      renderMode: "native",
      x: pxToInches(chartRect?.x ?? frame?.rect.x ?? sceneChart?.x ?? 0),
      y: pxToInches(chartRect?.y ?? frame?.rect.y ?? sceneChart?.y ?? 0),
      w: pxToInches(chartRect?.w ?? frame?.rect.w ?? sceneChart?.w ?? 0),
      h: pxToInches(chartRect?.h ?? frame?.rect.h ?? sceneChart?.h ?? 0),
      title: normalized.title ?? sceneChart?.title,
      subtitle: normalized.subtitle ?? sceneChart?.body,
      insight: normalized.insight,
      layoutRole: frame ? inferChartLayoutRole(frame) : "chart-panel",
      fallbackMode: normalized.fallbackMode,
      chartKind: normalized.chartKind,
      frameBounds: frame ? pxRectToInches(frame.rect) : undefined,
      semanticSpec,
      labels: normalized.labels,
      series: normalized.series,
      bubblePoints: normalized.bubblePoints,
      xAxisTitle: normalized.xAxisTitle,
      yAxisTitle: normalized.yAxisTitle,
      secondaryYAxisTitle: normalized.secondaryYAxisTitle,
      sizeAxisTitle: normalized.sizeAxisTitle,
      valueAxisMin: normalized.valueAxisMin,
      valueAxisMax: normalized.valueAxisMax,
      colors: normalized.colors,
      showInlineHeading: frame ? false : normalized.showInlineHeading,
      themeTokens,
    });
    args.warnings.push({
      code: "native-chart-exported",
      pageNumber: args.pageNumber,
      message: `Chart on page ${args.pageNumber} exported as a PowerPoint-native chart.`,
    });
  };

  sceneCharts.forEach((chart, index) => {
    const sceneNormalized = normalizeSceneChartDataModel({
      chart,
      warnings: args.warnings,
      pageNumber: args.pageNumber,
    });
    const frame = chartFrames[index] ?? null;
    const domNormalized =
      frame
        ? normalizeChartContractFromElement({
            element: frame.element,
            warnings: args.warnings,
            pageNumber: args.pageNumber,
          }) ??
          (parseExportChartData(frame.element)
            ? normalizeChartContractFromParsed({
                parsed: parseExportChartData(frame.element)!,
                warnings: args.warnings,
                pageNumber: args.pageNumber,
                fallbackTitle: chart.title,
                fallbackSubtitle: chart.body,
              })
            : null)
        : null;
    const normalized = sceneNormalized ?? domNormalized;
    if (!normalized && !frame) {
      return;
    }

    if (frame) {
      nativeFrameIndexes.add(index);
    }

    if (normalized) {
      addNativeChart(normalized, frame, chart);
      return;
    }

    if (frame) {
      skipUnsupportedFrame(frame);
    }
  });

  chartFrames.forEach((frame, index) => {
    if (nativeFrameIndexes.has(index)) {
      return;
    }

    const parsed = parseExportChartData(frame.element);
    const normalized =
      normalizeChartContractFromElement({
        element: frame.element,
        warnings: args.warnings,
        pageNumber: args.pageNumber,
      }) ??
      (parsed
        ? normalizeChartContractFromParsed({
            parsed,
            warnings: args.warnings,
            pageNumber: args.pageNumber,
          })
        : null);
    if (normalized) {
      addNativeChart(normalized, frame);
      return;
    }

    skipUnsupportedFrame(frame);
  });

  return {
    chartNodes,
    skipVisualIds,
    ownedTextNodes: dedupeTextNodes(ownedTextNodes),
    skipTextElements: skipTextElements.filter((element, index) => skipTextElements.indexOf(element) === index),
    skipPrimitiveWithinElements: skipPrimitiveWithinElements.filter(
      (element, index) => skipPrimitiveWithinElements.indexOf(element) === index,
    ),
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
    warnings: args.warnings,
    pageNumber: args.pageNumber,
  });
  const diagramElements = collectDiagramElements(args.frame.pageElement);
  const skipVisualIds = new Set([
    ...chartCollection.skipVisualIds,
    ...tableCollection.skipVisualIds,
  ]);
  const skipTextWithinElements = [
    ...chartCollection.skipTextElements,
    ...tableCollection.skipTextElements,
  ].filter((element, index, elements) => elements.indexOf(element) === index);
  const skipPrimitiveWithinElements = [
    ...chartCollection.skipPrimitiveWithinElements,
    ...tableCollection.skipPrimitiveWithinElements,
    ...diagramElements,
  ].filter((element, index, elements) => elements.indexOf(element) === index);

  return {
    theme,
    textNodes: dedupeTextNodes([
      ...collectBlockTextNodes({
        pageElement: args.frame.pageElement,
        warnings: args.warnings,
        pageNumber: args.pageNumber,
        skipTextWithinElements,
      }),
      ...collectLooseContentTextNodes({
        pageElement: args.frame.pageElement,
        skipTextWithinElements,
      }),
      ...collectDiagramTextNodes({
        pageElement: args.frame.pageElement,
      }),
      ...chartCollection.ownedTextNodes,
    ]),
    shapeNodes: [
      ...collectVisualShapeNodes({
        pageElement: args.frame.pageElement,
        skipVisualIds,
        skipPrimitiveWithinElements,
        warnings: args.warnings,
        pageNumber: args.pageNumber,
      }),
      ...collectDiagramShapeNodes({
        pageElement: args.frame.pageElement,
      }),
    ],
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

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildGradientFillXml(paint: Extract<PptExportPaint, { type: "linearGradient" }>) {
  const angle = Math.round((((450 - paint.angle) % 360) + 360) % 360) * 60000;
  const stops = paint.stops.length
    ? paint.stops
    : [
        { color: "FFFFFF", position: 0, transparency: 0 },
        { color: "FFFFFF", position: 100000, transparency: 0 },
      ];

  return `<a:gradFill rotWithShape="1"><a:gsLst>${stops
    .map((stop) => {
      const alpha = Math.round((100 - (stop.transparency ?? 0)) * 1000);
      return `<a:gs pos="${clamp(stop.position, 0, 100000)}"><a:srgbClr val="${escapeXml(stop.color)}">${
        alpha < 100000 ? `<a:alpha val="${clamp(alpha, 0, 100000)}"/>` : ""
      }</a:srgbClr></a:gs>`;
    })
    .join("")}</a:gsLst><a:lin ang="${angle}" scaled="0"/></a:gradFill>`;
}

function replaceShapeFillXml(shapeXml: string, fillXml: string) {
  const fillPattern = /<a:(?:solidFill|gradFill)\b[\s\S]*?<\/a:(?:solidFill|gradFill)>|<a:noFill\s*\/>/;
  if (fillPattern.test(shapeXml)) {
    return shapeXml.replace(fillPattern, fillXml);
  }

  return shapeXml.replace(/(<a:prstGeom\b[\s\S]*?<\/a:prstGeom>)/, `$1${fillXml}`);
}

function buildFreeformGeometryXml(shape: PptxExportShapeNode) {
  const points = shape.freeformPoints ?? [];
  if (shape.shape !== "freeform" || points.length < 3) {
    return null;
  }

  const normalizedPoints = points.map((point) => ({
    x: Math.round(clamp(point.x, 0, 100000)),
    y: Math.round(clamp(point.y, 0, 100000)),
  }));
  const [firstPoint, ...remainingPoints] = normalizedPoints;
  if (!firstPoint) {
    return null;
  }

  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst><a:path w="100000" h="100000"><a:moveTo><a:pt x="${firstPoint.x}" y="${firstPoint.y}"/></a:moveTo>${remainingPoints
    .map((point) => `<a:lnTo><a:pt x="${point.x}" y="${point.y}"/></a:lnTo>`)
    .join("")}<a:close/></a:path></a:pathLst></a:custGeom>`;
}

function replaceShapeGeometryXml(shapeXml: string, geometryXml: string) {
  const geometryPattern = /<a:(?:prstGeom|custGeom)\b[\s\S]*?<\/a:(?:prstGeom|custGeom)>/;
  if (geometryPattern.test(shapeXml)) {
    return shapeXml.replace(geometryPattern, geometryXml);
  }

  return shapeXml;
}

function patchSlideNativeShapes(xml: string, shapes: PptxExportShapeNode[]) {
  let nextXml = xml;

  for (const shape of shapes) {
    const objectName = escapeRegExp(escapeXml(shape.id));
    const shapePattern = new RegExp(
      `(<p:sp>[\\s\\S]*?<p:cNvPr\\b[^>]*\\bname="${objectName}"[^>]*>[\\s\\S]*?<p:spPr>)([\\s\\S]*?)(</p:spPr>[\\s\\S]*?</p:sp>)`,
    );
    nextXml = nextXml.replace(shapePattern, (_match, prefix, shapeBody, suffix) => {
      let patchedShapeBody = shapeBody;
      const geometryXml = buildFreeformGeometryXml(shape);
      if (geometryXml) {
        patchedShapeBody = replaceShapeGeometryXml(patchedShapeBody, geometryXml);
      }
      if (shape.paint.type === "linearGradient") {
        patchedShapeBody = replaceShapeFillXml(patchedShapeBody, buildGradientFillXml(shape.paint));
      }
      return `${prefix}${patchedShapeBody}${suffix}`;
    });
  }

  return nextXml;
}

async function patchNativeGradientFills(args: {
  arrayBuffer: ArrayBuffer;
  document: PptxExportDocument;
}) {
  const patchEntries = args.document.slides
    .map((slide) => ({
      slide,
      shapes: slide.nodes.filter(
        (node): node is PptxExportShapeNode =>
          node.nodeType === "shape" &&
          (node.paint.type === "linearGradient" || node.shape === "freeform"),
      ),
    }))
    .filter((entry) => entry.shapes.length > 0);

  if (!patchEntries.length) {
    return new Blob([args.arrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
  }

  const zip = await JSZip.loadAsync(args.arrayBuffer);
  await Promise.all(
    patchEntries.map(async ({ slide, shapes }) => {
      const slidePath = `ppt/slides/slide${slide.pageNumber}.xml`;
      const file = zip.file(slidePath);
      if (!file) {
        return;
      }
      const xml = await file.async("string");
      zip.file(slidePath, patchSlideNativeShapes(xml, shapes));
    }),
  );

  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}

function downloadBlob(args: {
  document: Document;
  fileName: string;
  blob: Blob;
}) {
  const view = args.document.defaultView ?? window;
  const url = view.URL.createObjectURL(args.blob);
  const anchor = args.document.createElement("a");
  anchor.href = url;
  anchor.download = args.fileName;
  args.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  view.setTimeout(() => view.URL.revokeObjectURL(url), 500);
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
  const frames = await collectRenderedExportPageFrames(args.reportRoot);
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
  const diagnostics = normalizePptxDiagnostics(dedupedWarnings);
  const visibleWarnings = filterPptxWarnings(diagnostics);
  const exportDocument = buildPptxExportDocument({
    slides,
    diagnostics,
  });
  const qualityReport = buildPptxExportQualityReport(exportDocument);

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

  renderExportDocumentToPptx({
    pptx,
    document: exportDocument,
  });

  const fileName = args.fileName || slugifyFileName(args.project.projectName);
  const rawPptx = (await pptx.write({
    outputType: "arraybuffer",
    compression: true,
  })) as ArrayBuffer;
  const pptxBlob = await patchNativeGradientFills({
    arrayBuffer: rawPptx,
    document: exportDocument,
  });
  downloadBlob({
    document: args.document,
    fileName,
    blob: pptxBlob,
  });

  return {
    fileName,
    slideCount: slides.length,
    warningCount: visibleWarnings.length,
    warnings: visibleWarnings,
    diagnostics,
    slides,
    qualityReport,
  } satisfies PptExportResult;
}
