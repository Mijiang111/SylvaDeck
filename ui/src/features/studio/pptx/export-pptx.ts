import { extractHtmlPageVisualStyle } from "@/features/studio/html-report-visuals";
import { api } from "@/api/client";
import {
  HTML_CHART_SPEC_ATTRIBUTE,
  HTML_TABLE_SPEC_ATTRIBUTE,
  TABLE_MODULE_KIND,
  canonicalizeDataBackedModulesOnPage,
  parseHtmlChartSpec,
  parseHtmlTableSpec,
} from "@/features/studio/html-report-data-modules";
import {
  buildHtmlReportPagePreviews,
  HTML_REPORT_PAGE_HEIGHT,
  HTML_REPORT_PAGE_WIDTH,
} from "@/features/studio/runtime/runtime-export-annotations";
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
  ExportDataContract,
  ExportObjectContract,
  ExportObjectKind,
  ExportRenderTarget,
  HtmlChartSpec,
  HtmlChartKind,
  HtmlPageVisualStyle,
  HtmlTableSpec,
  ModuleChartKind,
  PageExportContract,
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
  buildExportChartContractFromSpec,
  classifyUnstructuredChartElement,
  completeExportChartContract,
  findChartContractElement,
  findChartPlotElement,
  hasChartLikeEvidence,
  hasStructuredChartContract,
  hasUnstructuredChartPrimitives,
  isSupportedChartFamily,
} from "./export/recognition/chart";
import {
  buildPptxExportDocument,
  buildPptxExportQualityReport,
  filterPptxWarnings,
  normalizePptxDiagnostics,
} from "./export/quality";
import { renderExportDocumentToPptx } from "./export/renderer";
import { layerZOrder, numericZIndex, readExportCanvasLayer, type ExportCanvasLayer } from "./export/layers";
import {
  claimExportOwnership,
  dedupeOwners,
  recordForElement,
  resolveOwnerForElement,
  type ExportElementRecord,
  type ExportElementRegistry,
  type ExportOwner,
  type ExportPagePlan,
  type RectPx,
} from "./export/ownership";
import { patchPptxPackageXml, validatePptxPackageBlob } from "./export/package-patch";
import {
  DEFAULT_ACCENT,
  DEFAULT_BACKGROUND,
  DEFAULT_BODY,
  DEFAULT_DIVIDER,
  DEFAULT_SURFACE_FILL,
  DEFAULT_TEXT,
  alphaIsVisible,
  clamp,
  createLinearGradientSvg,
  nonePaint,
  normalizeChartNativeStyle,
  normalizeChartSeriesStyle,
  paintFromCssPaint,
  parseCssColor,
  parseCssPaint,
  parseNumericValue,
  primaryFontFamily,
  readElementFillPaint,
  resolveBorderRadiusPx,
  resolveBoxShadow,
  resolveComputedBorderPaint,
  resolveLineDash,
  splitCssTopLevelList,
  toTransparency,
  type ParsedCssPaint,
  type ParsedSolidPaint,
} from "./export/style";
import {
  PPT_LAYOUT,
  PX_PER_INCH,
  type PptExportBubblePoint,
  type PptExportChartContract,
  type PptExportChartBlockedReason,
  type PptExportChartModel,
  type PptExportChartNativeStyle,
  type PptExportChartSeries,
  type PptExportChartThemeTokens,
  type PptExportFallbackAsset,
  type PptExportMatrixCallout,
  type PptExportMatrixItem,
  type PptExportMatrixQuadrant,
  type PptExportLayerRole,
  type PptExportOwnerKind,
  type PptExportSemanticChartSpec,
  type PptExportSlideModel,
  type PptExportTableModel,
  type PptExportTextNode,
  type PptExportThemeSnapshot,
  type PptExportVisualNode,
  type PptExportWarning,
  type PptExportResult,
} from "./export/types";

export type {
  PptExportChartModel,
  PptExportResult,
  PptExportSlideModel,
  PptExportVisualNode,
  PptExportWarning,
  PptxExportQualityReport,
} from "./export/types";

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

type VisualChartSnapshotTarget = {
  element: HTMLElement;
  rect: RectPx;
};

type SnapshotRasterizeClient = (args: {
  pages: Array<{ pageNumber: number; html: string }>;
  jobs: Array<{ pageNumber: number; snapshotId: string }>;
}) => Promise<{
  results: Array<{
    pageNumber: number;
    snapshotId: string;
    pngDataUri?: string;
    error?: string;
  }>;
}>;

type ChartCollectionResult = {
  chartNodes: PptExportChartModel[];
  textNodes: PptExportTextNode[];
  skipVisualIds: Set<string>;
  skipTextElements: HTMLElement[];
  skipPrimitiveWithinElements: HTMLElement[];
  owners: ExportOwner[];
};

type TableCollectionResult = {
  tableNodes: PptExportTableModel[];
  skipVisualIds: Set<string>;
  skipTextElements: HTMLElement[];
  skipPrimitiveWithinElements: HTMLElement[];
  owners: ExportOwner[];
};

type SemanticExportObject = {
  objectId: string;
  element: HTMLElement;
  objectKind: ExportObjectKind;
  renderTarget: ExportRenderTarget;
  objectRole?: ExportObjectContract["objectRole"];
  snapshotBoundary?: string;
  forbiddenInterpretation: string[];
  ownershipScope: {
    ownsText: boolean;
    ownsShapes: boolean;
    ownsSvg: boolean;
  };
  contract?: ExportObjectContract;
};

type SemanticExportObjectRegistry = {
  objects: SemanticExportObject[];
  byElement: Map<HTMLElement, SemanticExportObject>;
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
    style?: unknown;
  }>;
  title?: string;
  subtitle?: string;
  insight?: string;
  unit?: string;
  xAxisTitle?: string;
  yAxisTitle?: string;
  valueAxisMin?: number;
  valueAxisMax?: number;
  style?: unknown;
};

type SupportedNativeChartKind = Extract<
  HtmlChartKind,
  "bar" | "stacked" | "line" | "waterfall" | "combo" | "bubble" | "matrix"
>;

type NormalizedChartContract = {
  chartKind: SupportedNativeChartKind;
  chartContract: PptExportChartContract;
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
  style?: PptExportChartNativeStyle;
  showInlineHeading?: boolean;
  bubblePoints?: PptExportBubblePoint[];
  renderMode: "native" | "hybrid" | "image";
  fallbackMode?:
    | "native-chart"
    | "native-combo-chart"
    | "native-bubble-chart"
    | "native-waterfall-chart"
    | "native-matrix-shapes"
    | "hybrid-waterfall"
    | "visual-chart-snapshot";
  semanticSpec?: PptExportSemanticChartSpec;
};

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

function selectorEscape(value: string) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value.replace(/["\\]/g, "\\$&");
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
  fontSizePx: number;
  text?: string;
  rotate?: number;
}) {
  const compactText = normalizeText(args.text ?? "");
  const singleLineSafetyWidth =
    compactText && !compactText.includes(" ")
      ? Math.min(320, compactText.length * args.fontSizePx * 0.72 + 18)
      : 0;
  const normalizedRotation = Math.abs(args.rotate ?? 0) % 180;
  if (normalizedRotation > 1) {
    return Math.max(
      args.rect.w,
      args.rect.h + 12,
      args.measurement.maxLineWidth + 16,
      singleLineSafetyWidth,
    );
  }

  const singleLineBox = args.measurement.lineCount <= 1 || args.rect.h <= args.lineHeightPx * 1.45;
  if (!singleLineBox) {
    return args.rect.w;
  }

  return Math.max(args.rect.w, args.measurement.maxLineWidth + 10, singleLineSafetyWidth);
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

function elementPathWithinPage(pageElement: HTMLElement, element: Element) {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== pageElement) {
    const parent: HTMLElement | null = current.parentElement;
    if (!parent) {
      break;
    }
    const index = Array.from(parent.children).indexOf(current);
    parts.push(`${current.tagName.toLowerCase()}-${Math.max(0, index)}`);
    current = parent;
  }
  return parts.reverse().join("/");
}

function sourceElementIdForElement(pageElement: HTMLElement, element: Element, fallbackPrefix = "dom") {
  if (isHtmlElementNode(element)) {
    const explicit =
      element.getAttribute("data-html-block-id") ??
      element.getAttribute("data-html-visual-id") ??
      element.getAttribute("data-html-layout-id") ??
      element.getAttribute("data-html-module-label") ??
      element.id;
    if (explicit) {
      return explicit;
    }
  }

  return `${fallbackPrefix}:${elementPathWithinPage(pageElement, element)}`;
}

function createDomOrderResolver(pageElement: HTMLElement) {
  const order = new Map<Element, number>();
  Array.from(pageElement.querySelectorAll("*")).forEach((element, index) => {
    order.set(element, index + 1);
  });
  return (element: Element) => order.get(element) ?? 0;
}

function closestExportPlaceholder(element: Element, pageElement: HTMLElement) {
  let current: Element | null = element;
  while (current && current !== pageElement.parentElement) {
    if (current.getAttribute("data-html-canvas-placeholder") === "true") {
      return current;
    }
    if (current === pageElement) {
      break;
    }
    current = current.parentElement;
  }
  return null;
}

function isHiddenForExport(args: {
  element: Element;
  pageElement: HTMLElement;
  view: Window;
}) {
  let current: Element | null = args.element;
  while (current && current !== args.pageElement.parentElement) {
    const computed = args.view.getComputedStyle(current);
    if (current.getAttribute("data-html-canvas-placeholder") === "true") {
      return { hidden: true, placeholder: current };
    }
    if (
      computed.display === "none" ||
      computed.visibility === "hidden" ||
      Number.parseFloat(computed.opacity || "1") <= 0
    ) {
      return { hidden: true, placeholder: null };
    }
    if (current === args.pageElement) {
      break;
    }
    current = current.parentElement;
  }
  return { hidden: false, placeholder: null };
}

function buildExportElementRegistry(args: {
  pageElement: HTMLElement;
  pageNumber: number;
  warnings: PptExportWarning[];
}): ExportElementRegistry | null {
  const view = args.pageElement.ownerDocument.defaultView;
  if (!view) {
    return null;
  }

  const byElement = new Map<HTMLElement, ExportElementRecord>();
  const records = Array.from(args.pageElement.querySelectorAll<HTMLElement>("*")).map((element, index) => {
    const hidden = isHiddenForExport({
      element,
      pageElement: args.pageElement,
      view,
    });
    const bounds = measureElementRect(args.pageElement, element);
    const canvasLayer = readExportCanvasLayer(element, args.pageElement);
    const record: ExportElementRecord = {
      element,
      elementId: sourceElementIdForElement(args.pageElement, element),
      bounds,
      sourceOrder: index + 1,
      zIndex: numericZIndex(view, element, args.pageElement),
      canvasLayer: canvasLayer.canvasLayer,
      canvasLayerOrder: canvasLayer.canvasLayerOrder,
      visible: !hidden.hidden,
      hiddenByPlaceholder: Boolean(hidden.placeholder),
      text: normalizeMultilineText(element.innerText || element.textContent || ""),
      visualId: element.getAttribute("data-html-visual-id") ?? undefined,
      visualKind: element.getAttribute("data-html-visual-kind") ?? undefined,
      exportRole: readAttribute(element, "data-export-role") ?? undefined,
      blockId: element.getAttribute("data-html-block-id") ?? undefined,
      blockKind: element.getAttribute("data-html-block-kind") ?? undefined,
    };
    byElement.set(element, record);
    return record;
  });

  return {
    pageElement: args.pageElement,
    view,
    records,
    byElement,
    placeholderWarnings: new Set(),
  };
}

function createExportPagePlan(args: {
  pageElement: HTMLElement;
  pageNumber: number;
  warnings: PptExportWarning[];
}): ExportPagePlan | null {
  const registry = buildExportElementRegistry(args);
  return registry
    ? {
        registry,
        pageNumber: args.pageNumber,
        warnings: args.warnings,
        owners: [],
      }
    : null;
}

function isExportObjectKind(value: string | null | undefined): value is ExportObjectKind {
  return (
    value === "chart-visual" ||
    value === "native-chart" ||
    value === "matrix" ||
    value === "native-table" ||
    value === "comparison-grid" ||
    value === "metric-grid" ||
    value === "card-grid" ||
    value === "diagram" ||
    value === "text"
  );
}

function isExportRenderTarget(value: string | null | undefined): value is ExportRenderTarget {
  return (
    value === "visual-snapshot" ||
    value === "native-chart" ||
    value === "native-table" ||
    value === "editable-shapes" ||
    value === "editable-text" ||
    value === "html-visual"
  );
}

function normalizeExportObjectKindAlias(value: string | null | undefined): ExportObjectKind | null {
  const normalized = normalizeText(value ?? "").toLowerCase().replace(/_/g, "-");
  if (
    normalized === "native-chart" ||
    normalized === "chart" ||
    normalized === "bar-chart" ||
    normalized === "line-chart" ||
    normalized === "combo-chart" ||
    normalized === "bubble-chart" ||
    normalized === "waterfall-chart" ||
    normalized === "stacked-chart" ||
    normalized === "pptx-native-chart" ||
    normalized === "native-chart"
  ) {
    return "chart-visual";
  }
  if (isExportObjectKind(normalized)) {
    return normalized;
  }
  if (normalized === "table" || normalized === "pptx-native-table") {
    return "native-table";
  }
  if (normalized === "quadrant" || normalized === "quadrant-matrix" || normalized === "matrix-shapes") {
    return "matrix";
  }
  return null;
}

function normalizeExportRenderTargetAlias(value: string | null | undefined): ExportRenderTarget | null {
  const normalized = normalizeText(value ?? "").toLowerCase().replace(/_/g, "-");
  if (normalized === "pptx-native-chart" || normalized === "native-chart" || normalized === "chart") {
    return "visual-snapshot";
  }
  if (isExportRenderTarget(normalized)) {
    return normalized;
  }
  if (normalized === "pptx-native-table" || normalized === "table") {
    return "native-table";
  }
  if (normalized === "matrix-shapes" || normalized === "pptx-editable-shapes") {
    return "editable-shapes";
  }
  if (normalized === "pptx-editable-text") {
    return "editable-text";
  }
  return null;
}

function parseExportContractAttribute(element: HTMLElement): ExportObjectContract | undefined {
  const raw = element.getAttribute("data-export-contract");
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ExportObjectContract> & Record<string, unknown>;
    const objectId = normalizeText(
      (typeof parsed.objectId === "string" ? parsed.objectId : "") ||
      element.getAttribute("data-export-object-id") ||
      "",
    );
    const objectKind = normalizeExportObjectKindAlias(
      (typeof parsed.objectKind === "string" ? parsed.objectKind : "") ||
      element.getAttribute("data-semantic-kind") ||
      element.getAttribute("data-export-object-kind") ||
      "",
    );
    const renderTarget = normalizeExportRenderTargetAlias(
      (typeof parsed.renderTarget === "string" ? parsed.renderTarget : "") ||
      element.getAttribute("data-render-target") ||
      "",
    );
    if (!objectId || !objectKind || !renderTarget) {
      return undefined;
    }
    const dataContract = normalizeExportDataContract(
      parsed.dataContract && typeof parsed.dataContract === "object"
        ? parsed.dataContract
        : parsed,
    ) as ExportDataContract | null;
    return {
      objectId,
      pageNumber: Number(element.closest<HTMLElement>("[data-page-number]")?.getAttribute("data-page-number")) || 0,
      pageStory: typeof parsed.pageStory === "string" ? parsed.pageStory : "",
      primaryVisualObject: typeof parsed.primaryVisualObject === "string" ? parsed.primaryVisualObject : objectKind,
      objectKind,
      objectRole: parsed.objectRole,
      dataContract,
      renderTarget,
      ownershipScope: parsed.ownershipScope ?? {
        rootId: objectId,
        ownsText: false,
        ownsShapes: false,
        ownsSvg: false,
        childRoles: [],
      },
      forbiddenInterpretation: Array.isArray(parsed.forbiddenInterpretation)
        ? parsed.forbiddenInterpretation.filter((item): item is string => typeof item === "string")
        : normalizeExportContractList(
            element.getAttribute("data-forbidden-export") ??
            element.getAttribute("data-forbidden-interpretation"),
          ),
    } satisfies ExportObjectContract;
  } catch {
    return undefined;
  }
}

function isCoreDataContractObject(object: Pick<SemanticExportObject, "objectKind">) {
  return (
    object.objectKind === "native-chart" ||
    object.objectKind === "native-table" ||
    object.objectKind === "matrix"
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim());
}

function isDataSeriesList(value: unknown, expectedLength?: number) {
  return Array.isArray(value) && value.length > 0 && value.every((series) => {
    if (!series || typeof series !== "object") {
      return false;
    }
    const candidate = series as { name?: unknown; values?: unknown };
    return (
      typeof candidate.name === "string" &&
      candidate.name.trim().length > 0 &&
      Array.isArray(candidate.values) &&
      candidate.values.length > 0 &&
      (expectedLength === undefined || candidate.values.length === expectedLength) &&
      candidate.values.every(isFiniteNumber)
    );
  });
}

function exportDataContractType(value: unknown): ExportDataContract["type"] | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" ? type as ExportDataContract["type"] : null;
}

function normalizeContractNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/%$/, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeCoordinate(value: unknown): number | null {
  const parsed = normalizeContractNumber(value);
  if (parsed === null) {
    return null;
  }
  if (parsed > 1 && parsed <= 100) {
    return parsed / 100;
  }
  return parsed;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeAxisContract(value: unknown): { label?: string; unit?: string; min?: number; max?: number } | undefined {
  const record = readRecord(value);
  if (!record) {
    return undefined;
  }
  const label = normalizeText(
    typeof record.label === "string"
      ? record.label
      : typeof record.title === "string"
        ? record.title
        : "",
  );
  const unit = normalizeText(typeof record.unit === "string" ? record.unit : "");
  const min = normalizeContractNumber(record.min);
  const max = normalizeContractNumber(record.max);
  const axis = {
    ...(label ? { label } : {}),
    ...(unit ? { unit } : {}),
    ...(min !== null ? { min } : {}),
    ...(max !== null ? { max } : {}),
  };
  return Object.keys(axis).length > 0 ? axis : undefined;
}

function normalizeAxisPair(candidate: Record<string, unknown>) {
  const axisRecord = readRecord(candidate.axis) ?? {};
  const x =
    normalizeAxisContract(axisRecord.x) ??
    normalizeAxisContract(candidate.xAxis) ??
    normalizeAxisContract(candidate.categoryAxis);
  const y =
    normalizeAxisContract(axisRecord.y) ??
    normalizeAxisContract(candidate.yAxis) ??
    normalizeAxisContract(candidate.valueAxis);
  return x || y ? { ...(x ? { x } : {}), ...(y ? { y } : {}) } : undefined;
}

function normalizeDataSeriesList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry, index) => {
    const record = readRecord(entry);
    if (!record) {
      return [];
    }
    const rawValues = Array.isArray(record.values)
      ? record.values
      : Array.isArray(record.data)
        ? record.data
        : [];
    const values = rawValues
      .map(normalizeContractNumber)
      .filter((item): item is number => item !== null);
    const name = normalizeText(
      typeof record.name === "string"
        ? record.name
        : typeof record.label === "string"
          ? record.label
          : `Series ${index + 1}`,
    );
    if (values.length === 0 || !name) {
      return [];
    }
    return [{
      name,
      values,
      ...(typeof record.color === "string" ? { color: record.color } : {}),
      ...(record.axis === "secondary" ? { axis: "secondary" as const } : record.axis === "primary" ? { axis: "primary" as const } : {}),
      ...(record.role === "line" ? { role: "line" as const } : record.role === "bar" ? { role: "bar" as const } : {}),
    }];
  });
}

function normalizeDataContractType(value: unknown): ExportDataContract["type"] | null {
  const raw = normalizeText(String(value ?? "")).toLowerCase().replace(/_/g, "-");
  if (!raw) {
    return null;
  }
  if (raw === "chart-bar" || raw === "bar" || raw === "bar-chart" || raw === "column" || raw === "column-chart") {
    return "chart-bar";
  }
  if (raw === "chart-stacked" || raw === "stacked" || raw === "stacked-bar" || raw === "stacked-bar-chart") {
    return "chart-stacked";
  }
  if (raw === "chart-line" || raw === "line" || raw === "line-chart") {
    return "chart-line";
  }
  if (raw === "chart-combo" || raw === "combo" || raw === "combo-chart") {
    return "chart-combo";
  }
  if (raw === "chart-waterfall" || raw === "waterfall" || raw === "waterfall-chart") {
    return "chart-waterfall";
  }
  if (raw === "chart-bubble" || raw === "bubble" || raw === "bubble-chart") {
    return "chart-bubble";
  }
  if (raw === "matrix" || raw === "quadrant" || raw === "quadrant-matrix") {
    return "matrix";
  }
  if (raw === "table" || raw === "native-table") {
    return "table";
  }
  if (raw === "missing-data") {
    return "missing-data";
  }
  return null;
}

function normalizeBubblePoints(candidate: Record<string, unknown>) {
  const directPoints = Array.isArray(candidate.points) ? candidate.points : [];
  const series = Array.isArray(candidate.series) ? candidate.series : [];
  const seriesPoints = series.flatMap((entry) => {
    const record = readRecord(entry);
    const points = record && Array.isArray(record.points)
      ? record.points
      : record && Array.isArray(record.data)
        ? record.data
        : [];
    return points.map((point) => ({
      point,
      group: typeof record?.name === "string" ? record.name : undefined,
    }));
  });
  return [
    ...directPoints.map((point) => ({ point, group: undefined })),
    ...seriesPoints,
  ].flatMap(({ point, group }, index) => {
    const record = readRecord(point);
    if (!record) {
      return [];
    }
    const x = normalizeCoordinate(record.x);
    const y = normalizeCoordinate(record.y);
    const size = normalizeContractNumber(record.size ?? record.r ?? record.radius);
    const label = normalizeText(
      typeof record.label === "string"
        ? record.label
        : typeof record.name === "string"
          ? record.name
          : `Point ${index + 1}`,
    );
    if (x === null || y === null || size === null || size <= 0 || !label) {
      return [];
    }
    return [{
      x,
      y,
      size,
      label,
      ...(typeof record.color === "string" ? { color: record.color } : {}),
      ...(typeof record.group === "string" ? { group: record.group } : group ? { group } : {}),
    }];
  });
}

function normalizeExportDataContract(value: unknown): unknown {
  const candidate = readRecord(value);
  if (!candidate) {
    return value;
  }
  const type = normalizeDataContractType(candidate.type ?? candidate.family ?? candidate.kind);
  if (!type || type === "missing-data") {
    return value;
  }

  if (type === "chart-bar" || type === "chart-stacked" || type === "chart-line") {
    const categories = isStringList(candidate.categories)
      ? candidate.categories
      : isStringList((readRecord(candidate.categoryAxis) ?? {}).categories)
        ? (readRecord(candidate.categoryAxis)!.categories as string[])
        : [];
    const series = normalizeDataSeriesList(candidate.series);
    return {
      ...candidate,
      type,
      categories,
      series,
      ...(type === "chart-stacked" && candidate.stackMode === "percent" ? { stackMode: "percent" as const } : {}),
      ...(normalizeAxisPair(candidate) ? { axis: normalizeAxisPair(candidate) } : {}),
    };
  }

  if (type === "chart-combo") {
    const categories = isStringList(candidate.categories) ? candidate.categories : [];
    const barSeries = normalizeDataSeriesList(candidate.barSeries);
    const lineSeries = normalizeDataSeriesList(candidate.lineSeries);
    return {
      ...candidate,
      type,
      categories,
      barSeries,
      lineSeries,
      ...(normalizeAxisContract(candidate.primaryAxis ?? candidate.valueAxis) ? { primaryAxis: normalizeAxisContract(candidate.primaryAxis ?? candidate.valueAxis) } : {}),
      ...(normalizeAxisContract(candidate.secondaryAxis) ? { secondaryAxis: normalizeAxisContract(candidate.secondaryAxis) } : {}),
    };
  }

  if (type === "chart-waterfall") {
    const steps = (Array.isArray(candidate.steps) ? candidate.steps : []).flatMap((entry, index) => {
      const record = readRecord(entry);
      if (!record) {
        return [];
      }
      const value = normalizeContractNumber(record.value ?? record.delta);
      const label = normalizeText(typeof record.label === "string" ? record.label : `Step ${index + 1}`);
      return value === null || !label ? [] : [{ ...record, label, value }];
    });
    return {
      ...candidate,
      type,
      steps,
      ...(normalizeAxisPair(candidate) ? { axis: normalizeAxisPair(candidate) } : {}),
    };
  }

  if (type === "chart-bubble") {
    return {
      ...candidate,
      type,
      points: normalizeBubblePoints(candidate),
      ...(normalizeAxisContract(candidate.xAxis ?? candidate.categoryAxis) ? { xAxis: normalizeAxisContract(candidate.xAxis ?? candidate.categoryAxis) } : {}),
      ...(normalizeAxisContract(candidate.yAxis ?? candidate.valueAxis) ? { yAxis: normalizeAxisContract(candidate.yAxis ?? candidate.valueAxis) } : {}),
    };
  }

  if (type === "matrix") {
    const axesRecord = readRecord(candidate.axes) ?? {};
    const xAxis = normalizeAxisContract(axesRecord.x ?? candidate.xAxis) ?? { label: "X" };
    const yAxis = normalizeAxisContract(axesRecord.y ?? candidate.yAxis) ?? { label: "Y" };
    const items = (Array.isArray(candidate.items) ? candidate.items : []).flatMap((entry, index) => {
      const record = readRecord(entry);
      if (!record) {
        return [];
      }
      const x = normalizeCoordinate(record.x);
      const y = normalizeCoordinate(record.y);
      const label = normalizeText(typeof record.label === "string" ? record.label : `Item ${index + 1}`);
      if (x === null || y === null || !label) {
        return [];
      }
      return [{
        ...record,
        x,
        y,
        label,
        ...(typeof record.detail === "string" ? { detail: record.detail } : typeof record.note === "string" ? { detail: record.note } : {}),
      }];
    });
    return {
      ...candidate,
      type,
      axes: {
        x: { ...xAxis, label: xAxis.label ?? "X" },
        y: { ...yAxis, label: yAxis.label ?? "Y" },
      },
      items,
      renderTarget: "editable-shapes",
    };
  }

  if (type === "table") {
    const columns = (Array.isArray(candidate.columns) ? candidate.columns : []).flatMap((entry, index) => {
      if (typeof entry === "string") {
        const label = normalizeText(entry);
        return label ? [{ id: `column-${index + 1}`, label }] : [];
      }
      const record = readRecord(entry);
      const label = normalizeText(typeof record?.label === "string" ? record.label : "");
      return label ? [{ ...record, label }] : [];
    });
    const rows = (Array.isArray(candidate.rows) ? candidate.rows : []).flatMap((row) =>
      Array.isArray(row) ? [row.map((cell) => normalizeText(String(cell ?? "")))] : [],
    );
    return {
      ...candidate,
      type,
      columns,
      rows,
      headerPolicy: candidate.headerPolicy === "none" ? "none" : "first-row",
      nativeTableAllowed: true,
    };
  }

  return value;
}

function validateExportDataContract(value: unknown): {
  ok: true;
  contract: ExportDataContract;
} | {
  ok: false;
  code: "export-data-contract-missing" | "export-data-contract-invalid" | "export-data-contract-minimum-data-missing";
  type?: ExportDataContract["type"];
} {
  if (!value || typeof value !== "object") {
    return { ok: false, code: "export-data-contract-missing" };
  }
  value = normalizeExportDataContract(value);
  const type = exportDataContractType(value);
  if (!type) {
    return { ok: false, code: "export-data-contract-invalid" };
  }
  const candidate = value as Record<string, unknown>;
  if (type === "missing-data") {
    return { ok: false, code: "export-data-contract-minimum-data-missing", type };
  }
  if (type === "chart-bar" || type === "chart-stacked" || type === "chart-line") {
    const categories = candidate.categories;
    if (!isStringList(categories)) {
      return { ok: false, code: "export-data-contract-minimum-data-missing", type };
    }
    const categoryCount = categories.length;
    if (!isDataSeriesList(candidate.series, categoryCount)) {
      return { ok: false, code: "export-data-contract-minimum-data-missing", type };
    }
    return { ok: true, contract: value as ExportDataContract };
  }
  if (type === "chart-combo") {
    const categories = candidate.categories;
    if (
      !isStringList(categories)
    ) {
      return { ok: false, code: "export-data-contract-minimum-data-missing", type };
    }
    const categoryCount = categories.length;
    if (
      !isDataSeriesList(candidate.barSeries, categoryCount) ||
      !isDataSeriesList(candidate.lineSeries, categoryCount)
    ) {
      return { ok: false, code: "export-data-contract-minimum-data-missing", type };
    }
    return { ok: true, contract: value as ExportDataContract };
  }
  if (type === "chart-waterfall") {
    const steps = candidate.steps;
    if (
      !Array.isArray(steps) ||
      steps.length === 0 ||
      !steps.every((step) => step && typeof step === "object" &&
        typeof (step as { label?: unknown }).label === "string" &&
        isFiniteNumber((step as { value?: unknown }).value))
    ) {
      return { ok: false, code: "export-data-contract-minimum-data-missing", type };
    }
    return { ok: true, contract: value as ExportDataContract };
  }
  if (type === "chart-bubble") {
    const points = candidate.points;
    if (
      !Array.isArray(points) ||
      points.length === 0 ||
      !points.every((point) => point && typeof point === "object" &&
        isFiniteNumber((point as { x?: unknown }).x) &&
        isFiniteNumber((point as { y?: unknown }).y) &&
        isFiniteNumber((point as { size?: unknown }).size) &&
        Number((point as { size?: unknown }).size) > 0 &&
        typeof (point as { label?: unknown }).label === "string" &&
        Boolean(((point as { label?: string }).label ?? "").trim()))
    ) {
      return { ok: false, code: "export-data-contract-minimum-data-missing", type };
    }
    return { ok: true, contract: value as ExportDataContract };
  }
  if (type === "matrix") {
    const axes = candidate.axes as { x?: { label?: unknown }; y?: { label?: unknown } } | undefined;
    const items = candidate.items;
    if (
      !axes?.x || !axes.y ||
      typeof axes.x.label !== "string" ||
      typeof axes.y.label !== "string" ||
      !axes.x.label.trim() ||
      !axes.y.label.trim() ||
      !Array.isArray(items) ||
      items.length === 0 ||
      !items.every((item) => item && typeof item === "object" &&
        isFiniteNumber((item as { x?: unknown }).x) &&
        isFiniteNumber((item as { y?: unknown }).y) &&
        typeof (item as { label?: unknown }).label === "string" &&
        Boolean(((item as { label?: string }).label ?? "").trim()))
    ) {
      return { ok: false, code: "export-data-contract-minimum-data-missing", type };
    }
    return { ok: true, contract: value as ExportDataContract };
  }
  if (type === "table") {
    const columns = candidate.columns;
    const rows = candidate.rows;
    if (
      !Array.isArray(columns) ||
      columns.length === 0 ||
      !columns.every((column) => column && typeof column === "object" &&
        typeof (column as { label?: unknown }).label === "string") ||
      !Array.isArray(rows) ||
      rows.length === 0 ||
      !rows.every((row) =>
        Array.isArray(row) &&
        row.every((cell) => typeof cell === "string"))
    ) {
      return { ok: false, code: "export-data-contract-minimum-data-missing", type };
    }
    return { ok: true, contract: value as ExportDataContract };
  }
  return { ok: false, code: "export-data-contract-invalid", type };
}

function dataContractCompatibleWithSemanticObject(
  object: Pick<SemanticExportObject, "objectKind" | "renderTarget">,
  contract: ExportDataContract,
) {
  if (contract.type === "missing-data") {
    return false;
  }
  if (object.objectKind === "native-chart") {
    return object.renderTarget === "native-chart" && contract.type.startsWith("chart-");
  }
  if (object.objectKind === "matrix") {
    return object.renderTarget === "editable-shapes" && contract.type === "matrix";
  }
  if (object.objectKind === "native-table") {
    return object.renderTarget === "native-table" && contract.type === "table";
  }
  return true;
}

function pushExportDataContractDiagnostic(args: {
  warnings: PptExportWarning[];
  pageElement: HTMLElement;
  pageNumber: number;
  object: SemanticExportObject;
  code: PptExportWarning["code"];
  message: string;
  type?: ExportDataContract["type"];
}) {
  args.warnings.push({
    code: args.code,
    severity: args.code === "export-data-contract-minimum-data-missing" ? "fatal" : "degraded",
    pageNumber: args.pageNumber,
    sourceId: sourceElementIdForElement(args.pageElement, args.object.element, "export-object"),
    sourceKind: sourceKindForExportObject(args.object.objectKind),
    countsAgainstQuality: true,
    exportObjectId: args.object.objectId,
    exportObjectKind: args.object.objectKind,
    exportRenderTarget: args.object.renderTarget,
    exportDataContractType: args.type,
    message: args.message,
  });
}

function pushSemanticObjectDataContractValidationFailure(args: {
  warnings: PptExportWarning[];
  pageElement: HTMLElement;
  pageNumber: number;
  object: SemanticExportObject;
  validation: ReturnType<typeof validateExportDataContract>;
}) {
  if (!args.validation.ok) {
    pushExportDataContractDiagnostic({
      ...args,
      code: args.validation.code,
      type: args.validation.type,
      message: `Export object ${args.object.objectId} does not have executable ${args.object.objectKind} dataContract.`,
    });
    return;
  }
  pushExportDataContractDiagnostic({
    ...args,
    code: "export-data-contract-incompatible",
    type: args.validation.contract.type,
    message: `Export object ${args.object.objectId} dataContract ${args.validation.contract.type} is incompatible with ${args.object.objectKind}/${args.object.renderTarget}.`,
  });
}

function pushUnlabeledFallbackDiagnostic(args: {
  warnings: PptExportWarning[];
  pageNumber: number;
  sourceId?: string;
  sourceKind: PptExportWarning["sourceKind"];
  message: string;
}) {
  args.warnings.push({
    code: "unlabeled-fallback-used",
    severity: "info",
    countsAgainstQuality: false,
    pageNumber: args.pageNumber,
    sourceId: args.sourceId,
    sourceKind: args.sourceKind,
    message: args.message,
  });
}

function validDataContractForSemanticObject(args: {
  warnings: PptExportWarning[];
  pageElement: HTMLElement;
  pageNumber: number;
  object: SemanticExportObject;
}) {
  if (!isCoreDataContractObject(args.object)) {
    return null;
  }
  const validation = validateExportDataContract(args.object.contract?.dataContract);
  if (!validation.ok) {
    pushSemanticObjectDataContractValidationFailure({
      ...args,
      validation,
    });
    return null;
  }
  if (!dataContractCompatibleWithSemanticObject(args.object, validation.contract)) {
    pushSemanticObjectDataContractValidationFailure({
      ...args,
      validation,
    });
    return null;
  }
  return validation.contract;
}

function normalizeExportContractList(value: string | null | undefined) {
  return normalizeText(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildSemanticExportObjectFromElement(element: HTMLElement): SemanticExportObject | null {
  const contract = parseExportContractAttribute(element);
  const objectId = normalizeText(
    element.getAttribute("data-export-object-id") ?? contract?.objectId ?? "",
  );
  const objectKind = normalizeExportObjectKindAlias(
    element.getAttribute("data-semantic-kind") ??
    element.getAttribute("data-export-object-kind") ??
    contract?.objectKind,
  );
  const renderTarget = normalizeExportRenderTargetAlias(
    element.getAttribute("data-render-target") ?? contract?.renderTarget,
  );
  if (!objectId || !objectKind || !renderTarget) {
    return null;
  }
  const ownershipTokens = new Set(normalizeExportContractList(element.getAttribute("data-ownership-scope")));
  const ownsLabelText =
    ownershipTokens.has("text") ||
    ownershipTokens.has("chart-labels") ||
    ownershipTokens.has("chart-axis") ||
    ownershipTokens.has("table-cells") ||
    ownershipTokens.has("matrix-items");
  const ownsVisualShapes =
    ownershipTokens.has("shape") ||
    ownershipTokens.has("shapes") ||
    ownershipTokens.has("chart-container") ||
    ownershipTokens.has("matrix-items");
  return {
    objectId,
    element,
    objectKind,
    renderTarget,
    objectRole: contract?.objectRole,
    snapshotBoundary: normalizeText(element.getAttribute("data-snapshot-boundary") ?? ""),
    forbiddenInterpretation:
      normalizeExportContractList(
        element.getAttribute("data-forbidden-export") ??
        element.getAttribute("data-forbidden-interpretation"),
      ).length > 0
        ? normalizeExportContractList(
            element.getAttribute("data-forbidden-export") ??
            element.getAttribute("data-forbidden-interpretation"),
          )
        : contract?.forbiddenInterpretation ?? [],
    ownershipScope: {
      ownsText: ownsLabelText || Boolean(contract?.ownershipScope?.ownsText),
      ownsShapes: ownsVisualShapes || Boolean(contract?.ownershipScope?.ownsShapes),
      ownsSvg: ownershipTokens.has("svg") || Boolean(contract?.ownershipScope?.ownsSvg),
    },
    contract,
  };
}

function isHiddenSemanticExportElement(pageElement: HTMLElement, element: HTMLElement) {
  const view = pageElement.ownerDocument.defaultView;
  return view
    ? isHiddenForExport({
        element,
        pageElement,
        view,
      }).hidden
    : false;
}

function renderedMatrixObjectHasSnapshotSurface(pageElement: HTMLElement, element: HTMLElement) {
  if (isHiddenSemanticExportElement(pageElement, element)) {
    return false;
  }
  if (element.matches("svg,canvas,img,picture") || element.querySelector("svg,canvas,img,picture")) {
    return true;
  }
  if (hasUnstructuredChartPrimitives(element)) {
    return true;
  }
  if (element.querySelector("[data-html-visual-id],[data-html-visual-key],[data-html-visual-kind]")) {
    return true;
  }
  const positionedChildren = Array.from(element.querySelectorAll<HTMLElement>("*"))
    .filter((child) => /position\s*:\s*absolute/i.test(child.getAttribute("style") ?? "")).length;
  const text = normalizeMultilineText(element.innerText || element.textContent || "");
  const matrixLanguage =
    /\b(?:matrix|quadrant|2x2|axis|impact|effort|readiness|certainty|object-root|ownership)\b/i.test(text) ||
    /矩阵|矩陣|四象限/.test(text);
  return positionedChildren >= 4 && matrixLanguage;
}

function semanticExportObjectCandidatePriority(pageElement: HTMLElement, object: SemanticExportObject) {
  const hidden = isHiddenSemanticExportElement(pageElement, object.element);
  const rect = measureElementRect(pageElement, object.element);
  let score = hidden ? 0 : 1000;
  if (object.element.getAttribute("data-html-canvas-placeholder") === "true") {
    score -= 200;
  }
  if (object.element.getAttribute("data-html-freeform") === "true") {
    score += 60;
  }
  if (object.element.getAttribute("data-html-canvas-target")) {
    score += 40;
  }
  if (object.contract?.dataContract?.type && object.contract.dataContract.type !== "missing-data") {
    score += 30;
  }
  if (object.objectKind === "matrix" && renderedMatrixObjectHasSnapshotSurface(pageElement, object.element)) {
    score += 20;
  }
  if (rect.w > 0 && rect.h > 0) {
    score += Math.min(50, (rect.w * rect.h) / 20000);
  }
  return score;
}

function shouldWarnDuplicateSemanticObjectRoot(args: {
  pageElement: HTMLElement;
  existing: SemanticExportObject;
  next: SemanticExportObject;
}) {
  const existingHidden = isHiddenSemanticExportElement(args.pageElement, args.existing.element);
  const nextHidden = isHiddenSemanticExportElement(args.pageElement, args.next.element);
  if (existingHidden !== nextHidden) {
    return false;
  }
  if (args.existing.element.contains(args.next.element) || args.next.element.contains(args.existing.element)) {
    return false;
  }
  return true;
}

function semanticOwnerKindForExportObject(kind: ExportObjectKind): PptExportOwnerKind {
  if (kind === "chart-visual" || kind === "native-chart") {
    return "chart";
  }
  if (kind === "native-table") {
    return "table";
  }
  if (kind === "matrix") {
    return "matrix";
  }
  if (kind === "diagram") {
    return "diagram";
  }
  return "block";
}

function sourceKindForExportObject(kind: ExportObjectKind): PptExportWarning["sourceKind"] {
  if (kind === "native-table") {
    return "table";
  }
  if (kind === "chart-visual" || kind === "native-chart") {
    return "chart";
  }
  if (kind === "matrix") {
    return "matrix";
  }
  if (kind === "diagram") {
    return "diagram";
  }
  return "visual";
}

function pushExportContractDetected(args: {
  pageElement: HTMLElement;
  pageNumber: number;
  warnings: PptExportWarning[];
  object: SemanticExportObject;
  materialized?: boolean;
}) {
  args.warnings.push({
    code: "export-contract-detected",
    severity: "success",
    pageNumber: args.pageNumber,
    sourceId: sourceElementIdForElement(args.pageElement, args.object.element, "export-object"),
    sourceKind: sourceKindForExportObject(args.object.objectKind),
    countsAgainstQuality: false,
    exportObjectId: args.object.objectId,
    exportObjectKind: args.object.objectKind,
    exportRenderTarget: args.object.renderTarget,
    exportDataContractType: exportDataContractType(args.object.contract?.dataContract) ?? undefined,
    message: args.materialized
      ? `Export contract ${args.object.objectId} on page ${args.pageNumber} was materialized from the report contract.`
      : `Export contract ${args.object.objectId} on page ${args.pageNumber} resolved as ${args.object.objectKind}.`,
  });
}

function pushNativeTableMissingDataWarning(args: {
  pageElement: HTMLElement;
  pageNumber: number;
  warnings: PptExportWarning[];
  object: SemanticExportObject;
}) {
  if (args.object.objectKind !== "native-table" || semanticNativeTableHasData(args.object.element)) {
    return;
  }
  args.warnings.push({
    code: "export-contract-native-table-missing-data",
    severity: "degraded",
    pageNumber: args.pageNumber,
    sourceId: sourceElementIdForElement(args.pageElement, args.object.element, "export-object"),
    sourceKind: "table",
    countsAgainstQuality: true,
    exportObjectId: args.object.objectId,
    exportObjectKind: args.object.objectKind,
    exportRenderTarget: args.object.renderTarget,
    message: `Native-table contract ${args.object.objectId} on page ${args.pageNumber} did not expose rows and columns through table metadata or a real table.`,
  });
}

function roleForExpectedContract(
  contract: ExportObjectContract,
  index: number,
  contracts: readonly ExportObjectContract[],
) {
  if (contract.objectRole) {
    return contract.objectRole;
  }
  return contracts.length === 1 && index === 0 ? "primary" : "secondary";
}

function exportObjectRoleRank(role: ExportObjectContract["objectRole"]) {
  return role === "primary" ? 0 : role === "secondary" ? 1 : role === "annotation" ? 2 : 3;
}

function sortExpectedContracts(contracts: readonly ExportObjectContract[]) {
  return contracts
    .map((contract, index) => ({
      contract: {
        ...contract,
        objectRole: roleForExpectedContract(contract, index, contracts),
      } satisfies ExportObjectContract,
      originalIndex: index,
    }))
    .sort((left, right) => {
      const roleDelta = exportObjectRoleRank(left.contract.objectRole) - exportObjectRoleRank(right.contract.objectRole);
      return roleDelta || left.originalIndex - right.originalIndex;
    })
    .map((entry) => entry.contract);
}

function applyExpectedExportContract(
  object: SemanticExportObject,
  expected: ExportObjectContract,
) {
  const renderedDataContract = object.contract?.dataContract ?? null;
  const expectedDataContract = expected.dataContract ?? null;
  const resolvedDataContract =
    expectedDataContract?.type === "missing-data"
      ? renderedDataContract ?? expectedDataContract
      : expectedDataContract ?? renderedDataContract;
  object.objectKind = expected.objectKind;
  object.renderTarget = expected.renderTarget;
  object.objectRole = expected.objectRole;
  object.forbiddenInterpretation = expected.forbiddenInterpretation;
  object.ownershipScope = {
    ownsText: expected.ownershipScope.ownsText,
    ownsShapes: expected.ownershipScope.ownsShapes,
    ownsSvg: expected.ownershipScope.ownsSvg,
  };
  object.contract = {
    ...expected,
    dataContract: resolvedDataContract,
  };
}

function sharedOwnershipModalities(left: SemanticExportObject, right: SemanticExportObject) {
  return [
    left.ownershipScope.ownsText && right.ownershipScope.ownsText ? "text" : null,
    left.ownershipScope.ownsShapes && right.ownershipScope.ownsShapes ? "shapes" : null,
    left.ownershipScope.ownsSvg && right.ownershipScope.ownsSvg ? "svg" : null,
  ].filter((item): item is string => Boolean(item));
}

function pushExportOwnershipConflict(args: {
  pageElement: HTMLElement;
  pageNumber: number;
  warnings: PptExportWarning[];
  object: SemanticExportObject;
  message: string;
}) {
  args.warnings.push({
    code: "export-contract-duplicate-ownership",
    severity: "degraded",
    pageNumber: args.pageNumber,
    sourceId: sourceElementIdForElement(args.pageElement, args.object.element, "export-object"),
    sourceKind: sourceKindForExportObject(args.object.objectKind),
    countsAgainstQuality: true,
    exportObjectId: args.object.objectId,
    exportObjectKind: args.object.objectKind,
    exportRenderTarget: args.object.renderTarget,
    message: args.message,
  });
}

function semanticObjectIntersectionRatio(
  pageElement: HTMLElement,
  left: SemanticExportObject,
  right: SemanticExportObject,
) {
  const leftRect = measureElementRect(pageElement, left.element);
  const rightRect = measureElementRect(pageElement, right.element);
  const intersection = intersectRects(leftRect, rightRect);
  if (intersection.w <= 2 || intersection.h <= 2) {
    return 0;
  }
  const leftArea = Math.max(1, leftRect.w * leftRect.h);
  const rightArea = Math.max(1, rightRect.w * rightRect.h);
  return (intersection.w * intersection.h) / Math.min(leftArea, rightArea);
}

function warnSemanticExportOwnershipConflicts(args: {
  pageElement: HTMLElement;
  pageNumber: number;
  warnings: PptExportWarning[];
  objects: SemanticExportObject[];
}) {
  const warned = new Set<string>();
  const warnPair = (
    left: SemanticExportObject,
    right: SemanticExportObject,
    reason: string,
    details: string,
  ) => {
    const key = [reason, left.objectId, right.objectId].sort().join(":");
    if (warned.has(key)) {
      return;
    }
    warned.add(key);
    pushExportOwnershipConflict({
      pageElement: args.pageElement,
      pageNumber: args.pageNumber,
      warnings: args.warnings,
      object: right,
      message: `Export objects ${left.objectId} and ${right.objectId} on page ${args.pageNumber} ${details}.`,
    });
  };

  for (let index = 0; index < args.objects.length; index += 1) {
    const left = args.objects[index]!;
    for (let nextIndex = index + 1; nextIndex < args.objects.length; nextIndex += 1) {
      const right = args.objects[nextIndex]!;
      const shared = sharedOwnershipModalities(left, right);
      if (left.element === right.element) {
        warnPair(left, right, "duplicate-root", "use the same root element");
        continue;
      }
      if (shared.length === 0) {
        continue;
      }
      if (left.element.contains(right.element) || right.element.contains(left.element)) {
        warnPair(
          left,
          right,
          "nested-owner",
          `claim nested roots with shared ${shared.join("/")} ownership`,
        );
        continue;
      }
      const overlapRatio = semanticObjectIntersectionRatio(args.pageElement, left, right);
      if (overlapRatio >= 0.15) {
        warnPair(
          left,
          right,
          "geometric-overlap",
          `overlap geometrically while sharing ${shared.join("/")} ownership`,
        );
      }
    }
  }
}

function collectSemanticExportObjects(args: {
  pageElement: HTMLElement;
  pageNumber: number;
  warnings: PptExportWarning[];
  expectedContract?: ExportObjectContract | null;
  expectedContracts?: readonly ExportObjectContract[] | null;
}): SemanticExportObjectRegistry {
  const candidates = Array.from(
    args.pageElement.querySelectorAll<HTMLElement>("[data-export-object-id],[data-semantic-kind]"),
  );
  const objects: SemanticExportObject[] = [];
  const byElement = new Map<HTMLElement, SemanticExportObject>();
  const objectById = new Map<string, SemanticExportObject>();
  const objectIndexById = new Map<string, number>();

  for (const element of candidates) {
    const object = buildSemanticExportObjectFromElement(element);
    if (!object) {
      continue;
    }
    const existing = objectById.get(object.objectId);
    if (existing) {
      const shouldWarn = shouldWarnDuplicateSemanticObjectRoot({
        pageElement: args.pageElement,
        existing,
        next: object,
      });
      const shouldReplace =
        semanticExportObjectCandidatePriority(args.pageElement, object) >
        semanticExportObjectCandidatePriority(args.pageElement, existing);
      if (shouldReplace) {
        const existingIndex = objectIndexById.get(object.objectId);
        if (existingIndex !== undefined) {
          objects[existingIndex] = object;
        }
        byElement.delete(existing.element);
        byElement.set(element, object);
        objectById.set(object.objectId, object);
      }
      if (!shouldWarn) {
        continue;
      }
      args.warnings.push({
        code: "export-contract-duplicate-ownership",
        severity: "degraded",
        pageNumber: args.pageNumber,
        sourceId: sourceElementIdForElement(args.pageElement, element, "export-object"),
        sourceKind: "visual",
        countsAgainstQuality: true,
        exportObjectId: object.objectId,
        exportObjectKind: object.objectKind,
        exportRenderTarget: object.renderTarget,
        message: `Export object ${object.objectId} on page ${args.pageNumber} appears more than once.`,
      });
      continue;
    }
    objectIndexById.set(object.objectId, objects.length);
    objects.push(object);
    byElement.set(element, object);
    objectById.set(object.objectId, object);
  }

  const expectedContracts = sortExpectedContracts(
    args.expectedContracts ?? (args.expectedContract ? [args.expectedContract] : []),
  );
  const claimedElements = new Map<HTMLElement, SemanticExportObject>();
  const materializedIds = new Set<string>();
  for (const object of objects) {
    claimedElements.set(object.element, object);
  }

  for (const expected of expectedContracts) {
    const rendered = objectById.get(expected.objectId);
    if (!rendered) {
      const materializedElement = findExpectedContractRootElement({
        pageElement: args.pageElement,
        contract: expected,
        claimedElements,
      });
      if (!materializedElement) {
        args.warnings.push({
          code: "export-contract-missing",
          severity: "degraded",
          pageNumber: args.pageNumber,
          sourceKind: sourceKindForExportObject(expected.objectKind),
          countsAgainstQuality: true,
          exportObjectId: expected.objectId,
          exportObjectKind: expected.objectKind,
          exportRenderTarget: expected.renderTarget,
          message: `Page ${args.pageNumber} promised export object ${expected.objectId}, but no clear DOM root could be materialized for that contract.`,
        });
        continue;
      }
      const claimedBy = claimedElements.get(materializedElement);
      if (claimedBy) {
        const conflictObject = exportObjectFromContract(expected, materializedElement);
        pushExportOwnershipConflict({
          pageElement: args.pageElement,
          pageNumber: args.pageNumber,
          warnings: args.warnings,
          object: conflictObject,
          message: `Export object ${expected.objectId} on page ${args.pageNumber} could not materialize because ${claimedBy.objectId} already uses the same root element.`,
        });
        continue;
      }
      const materializedObject = exportObjectFromContract(expected, materializedElement);
      objects.push(materializedObject);
      byElement.set(materializedElement, materializedObject);
      objectById.set(materializedObject.objectId, materializedObject);
      claimedElements.set(materializedElement, materializedObject);
      materializedIds.add(materializedObject.objectId);
      args.warnings.push({
        code: "export-contract-missing",
        severity: "degraded",
        pageNumber: args.pageNumber,
        sourceId: sourceElementIdForElement(args.pageElement, materializedElement, "export-object"),
        sourceKind: materializedElement === args.pageElement ? "page" : "visual",
        countsAgainstQuality: true,
        exportObjectId: expected.objectId,
        exportObjectKind: expected.objectKind,
        exportRenderTarget: expected.renderTarget,
        message: `Page ${args.pageNumber} promised export object ${expected.objectId}, but no DOM root carried matching semantic metadata; export applied the report contract to ${materializedElement === args.pageElement ? "the page root" : "the closest matching visual root"}.`,
      });
      continue;
    }

    const kindMismatch = rendered.objectKind !== expected.objectKind;
    const renderTargetMismatch = rendered.renderTarget !== expected.renderTarget;
    if (kindMismatch || renderTargetMismatch) {
      args.warnings.push({
        code: "export-contract-kind-mismatch",
        severity: "degraded",
        pageNumber: args.pageNumber,
        sourceId: sourceElementIdForElement(args.pageElement, rendered.element, "export-object"),
        sourceKind: "visual",
        countsAgainstQuality: true,
        exportObjectId: expected.objectId,
        exportObjectKind: expected.objectKind,
        exportRenderTarget: expected.renderTarget,
        message: `Page ${args.pageNumber} promised ${expected.objectKind}/${expected.renderTarget} for ${expected.objectId}, but the DOM marked it as ${rendered.objectKind}/${rendered.renderTarget}.`,
      });
    }
    applyExpectedExportContract(rendered, expected);
  }

  for (const object of objects) {
    pushExportContractDetected({
      pageElement: args.pageElement,
      pageNumber: args.pageNumber,
      warnings: args.warnings,
      object,
      materialized: materializedIds.has(object.objectId),
    });
    pushNativeTableMissingDataWarning({
      pageElement: args.pageElement,
      pageNumber: args.pageNumber,
      warnings: args.warnings,
      object,
    });
  }

  warnSemanticExportOwnershipConflicts({
    pageElement: args.pageElement,
    pageNumber: args.pageNumber,
    warnings: args.warnings,
    objects,
  });

  return { objects, byElement };
}

function collectSemanticExportOwners(args: {
  pageElement: HTMLElement;
  registry: SemanticExportObjectRegistry;
}) {
  return args.registry.objects
    .filter(
      (object) =>
        object.ownershipScope.ownsText ||
        object.ownershipScope.ownsShapes ||
        object.ownershipScope.ownsSvg,
    )
    .map((object, index) =>
      createExportOwner({
        pageElement: args.pageElement,
        element: object.element,
        kind: semanticOwnerKindForExportObject(object.objectKind),
        idPrefix: `export-${object.objectKind}`,
        index,
        ownsText: object.ownershipScope.ownsText,
        ownsShapes: object.ownershipScope.ownsShapes,
        ownsSvg: object.ownershipScope.ownsSvg,
      }),
    );
}

function closestSemanticExportObject(
  registry: SemanticExportObjectRegistry | undefined,
  element: Element,
) {
  if (!registry) {
    return null;
  }
  let current: Element | null = element;
  while (current) {
    if (current instanceof HTMLElement) {
      const object = registry.byElement.get(current);
      if (object) {
        return object;
      }
    }
    current = current.parentElement;
  }
  return null;
}

function semanticObjectForbids(
  registry: SemanticExportObjectRegistry | undefined,
  element: Element,
  interpretation: string,
) {
  const object = closestSemanticExportObject(registry, element);
  return Boolean(object?.forbiddenInterpretation.includes(interpretation));
}

function semanticObjectBlocksNativeTarget(
  registry: SemanticExportObjectRegistry | undefined,
  element: Element,
  renderTarget: "native-chart" | "native-table",
) {
  const object = closestSemanticExportObject(registry, element);
  if (!object) {
    return false;
  }
  return object.renderTarget !== renderTarget || object.forbiddenInterpretation.includes(renderTarget);
}

function semanticObjectBlocksChartSnapshot(
  registry: SemanticExportObjectRegistry | undefined,
  element: Element,
) {
  const object = closestSemanticExportObject(registry, element);
  if (!object) {
    return false;
  }
  if (object.objectKind === "chart-visual" || object.objectKind === "native-chart" || object.objectKind === "matrix") {
    return false;
  }
  return object.forbiddenInterpretation.includes("native-chart");
}

function pushForbiddenInterpretationBlockedDiagnostic(args: {
  warnings: PptExportWarning[];
  pageElement: HTMLElement;
  pageNumber: number;
  element: Element;
  object: SemanticExportObject;
  interpretation: "native-chart" | "native-table";
  sourceKind: "chart" | "table";
  blockedByObjectIds?: Set<string>;
}) {
  if (args.blockedByObjectIds?.has(args.object.objectId)) {
    return;
  }
  args.blockedByObjectIds?.add(args.object.objectId);
  args.warnings.push({
    code: "export-contract-forbidden-violation",
    severity: "degraded",
    pageNumber: args.pageNumber,
    sourceId: sourceElementIdForElement(args.pageElement, args.element, args.sourceKind),
    sourceKind: args.sourceKind,
    countsAgainstQuality: true,
    exportObjectId: args.object.objectId,
    exportObjectKind: args.object.objectKind,
    exportRenderTarget: args.object.renderTarget,
    message: `Export contract ${args.object.objectId} forbids ${args.interpretation}; ${args.sourceKind}-like DOM inside the semantic object was left to the contracted object consumer.`,
  });
}

function isInsideSemanticObjectRoot(
  registry: SemanticExportObjectRegistry | undefined,
  element: Element,
) {
  return Boolean(
    registry?.objects.some((object) => object.element !== element && object.element.contains(element)),
  );
}

export function inspectSemanticExportObjectForElement(args: {
  pageElement: HTMLElement;
  element: Element;
  pageNumber: number;
  expectedContract?: ExportObjectContract | null;
  expectedContracts?: readonly ExportObjectContract[] | null;
}) {
  const warnings: PptExportWarning[] = [];
  const registry = collectSemanticExportObjects({
    pageElement: args.pageElement,
    pageNumber: args.pageNumber,
    warnings,
    expectedContract: args.expectedContract,
    expectedContracts: args.expectedContracts,
  });
  const object = closestSemanticExportObject(registry, args.element);
  return {
    warnings,
    object: object
      ? {
          objectId: object.objectId,
          objectKind: object.objectKind,
          renderTarget: object.renderTarget,
          forbiddenInterpretation: object.forbiddenInterpretation,
        }
      : null,
    forbidsNativeTable: semanticObjectForbids(registry, args.element, "native-table"),
    forbidsNativeChart: semanticObjectForbids(registry, args.element, "native-chart"),
  };
}

function warnHiddenPlaceholder(plan: ExportPagePlan, element: HTMLElement) {
  const placeholder = closestExportPlaceholder(element, plan.registry.pageElement);
  if (!placeholder || plan.registry.placeholderWarnings.has(placeholder)) {
    return;
  }
  plan.registry.placeholderWarnings.add(placeholder);
  plan.warnings.push({
    code: "hidden-placeholder-skipped",
    severity: "info",
    countsAgainstQuality: false,
    pageNumber: plan.pageNumber,
    sourceId: sourceElementIdForElement(plan.registry.pageElement, placeholder, "placeholder"),
    sourceKind: "visual",
    message: `Hidden canvas placeholder on page ${plan.pageNumber} was skipped by the PPTX ownership planner.`,
  });
}

function isVisualContainerElement(element: HTMLElement) {
  const role = readAttribute(element, "data-export-role", "data-html-visual-kind");
  return Boolean(
    role ||
      element.getAttribute("data-html-visual-id") ||
      element.getAttribute("data-html-module-kind") ||
      element.classList.contains("surface-card"),
  );
}

function isExplicitTextElement(element: HTMLElement) {
  return Boolean(element.getAttribute("data-html-block-id") || element.matches("ul,ol"));
}

function suppressContainerTextIfNeeded(plan: ExportPagePlan | null | undefined, element: HTMLElement) {
  if (!plan || !isVisualContainerElement(element)) {
    return false;
  }
  if (!hasMultipleReadableTextChildren(element) && !hasReadableStructuralTextChild(element)) {
    return false;
  }
  claimExportOwnership({
    plan,
    element,
    ownership: recordForElement(plan, element)?.ownership ?? "visual-shape",
    reason: "container-text",
  });
  const record = recordForElement(plan, element);
  if (record?.suppressedTextReason !== "container-text-warned") {
    if (record) {
      record.suppressedTextReason = "container-text-warned";
    }
    plan.warnings.push({
      code: "container-text-suppressed",
      severity: "info",
      countsAgainstQuality: false,
      pageNumber: plan.pageNumber,
      sourceId: sourceElementIdForElement(plan.registry.pageElement, element, "container"),
      sourceKind: "visual",
      message: `Container text on page ${plan.pageNumber} was suppressed so child text remains the single editable source.`,
    });
  }
  return true;
}

function textElementBelongsToOtherOwner(args: {
  element: HTMLElement;
  owner?: ExportOwner;
  owners?: ExportOwner[];
}) {
  const owner = resolveOwnerForElement(args.element, args.owners);
  if (!owner) {
    return false;
  }
  return args.owner?.id !== owner.id;
}

function canEmitTextElement(args: {
  plan?: ExportPagePlan | null;
  element: HTMLElement;
  owner?: ExportOwner;
  owners?: ExportOwner[];
}) {
  const record = recordForElement(args.plan, args.element);
  if (record && !record.visible) {
    if (record.hiddenByPlaceholder && args.plan) {
      warnHiddenPlaceholder(args.plan, args.element);
    }
    return false;
  }
  if (
    textElementBelongsToOtherOwner({
      element: args.element,
      owner: args.owner,
      owners: args.owners ?? args.plan?.owners,
    })
  ) {
    return false;
  }
  if (suppressContainerTextIfNeeded(args.plan, args.element)) {
    return false;
  }
  if (isExplicitTextElement(args.element)) {
    return true;
  }
  return !hasReadableStructuralTextChild(args.element);
}

function allowTextFillForElement(args: {
  plan?: ExportPagePlan | null;
  element: HTMLElement;
}) {
  if (hasReadableStructuralTextChild(args.element) || hasReadableTextChild(args.element)) {
    return false;
  }
  const role = readAttribute(args.element, "data-export-role", "data-html-visual-kind") ?? "";
  return role === "badge" || role === "label-surface";
}

function nodeOrderingForElement(args: {
  plan?: ExportPagePlan | null;
  element: HTMLElement;
  layerRole: PptExportLayerRole;
  offset?: number;
}) {
  const record = recordForElement(args.plan, args.element);
  const sourceOrder =
    record?.sourceOrder ?? createDomOrderResolver(args.plan?.registry.pageElement ?? args.element)(args.element);
  const zIndex = record?.zIndex ?? 0;
  const canvasLayer = record?.canvasLayer ?? "content";
  const canvasLayerOrder = record?.canvasLayerOrder ?? 0;
  return {
    sourceOrder,
    zIndex,
    layerRole: args.layerRole,
    zOrder: layerZOrder({
      layerRole: args.layerRole,
      sourceOrder,
      zIndex,
      canvasLayer,
      canvasLayerOrder,
      offset: args.offset,
    }),
  };
}

function dedupeTextNodes(nodes: PptExportTextNode[]) {
  const seen = new Set<string>();
  const deduped: PptExportTextNode[] = [];

  for (const node of nodes) {
    const normalizedText = normalizeMultilineText(node.items?.join("\n") ?? node.text);
    const sourceKey = node.sourceElementId
      ? `source:${node.sourceElementId}:${normalizedText}`
      : "";
    const geometryKey = [
      "geom",
      node.ownerId ?? "",
      node.ownerKind ?? "",
      Math.round(node.x * 1000),
      Math.round(node.y * 1000),
      Math.round(node.w * 1000),
      Math.round(node.h * 1000),
      normalizedText,
    ].join(":");
    if ((sourceKey && seen.has(sourceKey)) || seen.has(geometryKey)) {
      continue;
    }
    if (sourceKey) {
      seen.add(sourceKey);
    }
    seen.add(geometryKey);
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

function elementHasSnapshotContent(element: HTMLElement) {
  const text = normalizeText(element.innerText || element.textContent || "");
  if (text) {
    return true;
  }
  if (element.matches("svg,canvas,img,picture")) {
    return true;
  }
  if (element.querySelector("svg,canvas,img,picture")) {
    return true;
  }
  if (hasUnstructuredChartPrimitives(element)) {
    return true;
  }
  const view = element.ownerDocument.defaultView;
  if (!view) {
    return Boolean(element.children.length);
  }
  return Array.from(element.querySelectorAll<HTMLElement>("*")).some((child) =>
    hasVisibleComputedShapePaint({
      pageElement: element,
      element: child,
      view,
    }),
  );
}

let visualSnapshotIdCounter = 0;

function nextVisualSnapshotId(args: {
  pageNumber: number;
  sourceId: string;
  exportObjectId?: string;
}) {
  visualSnapshotIdCounter += 1;
  const stablePart = (args.exportObjectId || args.sourceId || "chart")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "chart";
  return `ppt-snapshot-p${args.pageNumber}-${stablePart}-${visualSnapshotIdCounter}`;
}

function buildVisualChartSnapshotAsset(args: {
  pageElement: HTMLElement;
  element: HTMLElement;
  rect: RectPx;
  warnings: PptExportWarning[];
  pageNumber: number;
  sourceId: string;
  exportObjectId?: string;
  exportObjectKind?: ExportObjectKind;
  exportRenderTarget?: ExportRenderTarget;
}): PptExportFallbackAsset | null {
  const svgWrapper =
    args.element.tagName.toLowerCase() === "svg"
      ? resolveVisibleSvgSnapshotWrapper(args.pageElement, args.element)?.element ??
        args.element.parentElement
      : null;
  const snapshotElement = svgWrapper ?? args.element;
  const snapshotRect =
    snapshotElement === args.element
      ? args.rect
      : measureElementRect(args.pageElement, snapshotElement);
  const width = Math.round(snapshotRect.w);
  const height = Math.round(snapshotRect.h);
  if (width <= 0 || height <= 0) {
    args.warnings.push({
      code: "visual-chart-snapshot-missing",
      severity: "fatal",
      countsAgainstQuality: true,
      pageNumber: args.pageNumber,
      sourceId: args.sourceId,
      sourceKind: "chart",
      exportObjectId: args.exportObjectId,
      exportObjectKind: args.exportObjectKind,
      exportRenderTarget: args.exportRenderTarget,
      message: `Chart visual snapshot on page ${args.pageNumber} had zero-size bounds.`,
    });
    return null;
  }

  if (!elementHasSnapshotContent(snapshotElement)) {
    args.warnings.push({
      code: "contract-owner-rendered-nothing",
      severity: "fatal",
      countsAgainstQuality: true,
      pageNumber: args.pageNumber,
      sourceId: args.sourceId,
      sourceKind: "chart",
      exportObjectId: args.exportObjectId,
      exportObjectKind: args.exportObjectKind,
      exportRenderTarget: args.exportRenderTarget,
      message: `Chart visual snapshot root on page ${args.pageNumber} did not render visible chart content.`,
    });
    return null;
  }

  const snapshotId = nextVisualSnapshotId({
    pageNumber: args.pageNumber,
    sourceId: args.sourceId,
    exportObjectId: args.exportObjectId,
  });
  snapshotElement.setAttribute("data-ppt-snapshot-id", snapshotId);

  return {
    kind: "dom-snapshot",
    reason: "visual-chart-exported",
    snapshotId,
    pageNumber: args.pageNumber,
    exportObjectId: args.exportObjectId,
  };
}

function sceneChartRect(chart: SlideSceneChartObject): RectPx {
  return {
    x: chart.x,
    y: chart.y,
    w: chart.w,
    h: chart.h,
  };
}

function rectOverlapRatio(left: RectPx, right: RectPx) {
  const intersection = rectIntersectionArea(left, right);
  if (intersection <= 0) {
    return 0;
  }
  const leftArea = Math.max(1, left.w * left.h);
  const rightArea = Math.max(1, right.w * right.h);
  return intersection / Math.min(leftArea, rightArea);
}

function chartKindMatchesScene(
  normalized: Pick<NormalizedChartContract, "chartKind">,
  sceneChart: SlideSceneChartObject,
) {
  return normalized.chartKind === sceneChart.chartKind;
}

function chartTitleMatchesScene(
  normalized: Pick<NormalizedChartContract, "title">,
  sceneChart: SlideSceneChartObject,
) {
  const normalizedTitle = normalizeText(normalized.title ?? "").toLowerCase();
  const sceneTitle = normalizeText(sceneChart.title ?? "").toLowerCase();
  return Boolean(normalizedTitle && sceneTitle && normalizedTitle === sceneTitle);
}

function findSupplementalSceneChartForFrame(args: {
  normalized: NormalizedChartContract;
  frame: ChartFrameCandidate;
  sceneCharts: SlideSceneChartObject[];
  consumedSceneCharts: Set<SlideSceneChartObject>;
}) {
  const candidates = args.sceneCharts
    .filter((sceneChart) => !args.consumedSceneCharts.has(sceneChart))
    .map((sceneChart) => ({
      sceneChart,
      overlap: rectOverlapRatio(args.frame.rect, sceneChartRect(sceneChart)),
      titleMatch: chartTitleMatchesScene(args.normalized, sceneChart),
      kindMatch: chartKindMatchesScene(args.normalized, sceneChart),
    }))
    .filter((candidate) => candidate.overlap > 0.55 || candidate.titleMatch)
    .sort((left, right) => {
      if (Number(right.titleMatch) !== Number(left.titleMatch)) {
        return Number(right.titleMatch) - Number(left.titleMatch);
      }
      if (Number(right.kindMatch) !== Number(left.kindMatch)) {
        return Number(right.kindMatch) - Number(left.kindMatch);
      }
      return right.overlap - left.overlap;
    });

  return candidates[0]?.sceneChart ?? null;
}

function applySceneChartTextFallback(
  normalized: NormalizedChartContract,
  sceneChart: SlideSceneChartObject | null,
): NormalizedChartContract {
  if (!sceneChart) {
    return normalized;
  }
  return {
    ...normalized,
    title: normalized.title ?? (normalizeText(sceneChart.title ?? "") || undefined),
    subtitle: normalized.subtitle ?? (normalizeText(sceneChart.body ?? "") || undefined),
  };
}

function pushDomSceneMismatchDiagnostic(args: {
  warnings: PptExportWarning[];
  pageNumber: number;
  frame: ChartFrameCandidate;
  normalized: NormalizedChartContract;
  sceneChart: SlideSceneChartObject;
}) {
  const domTitle = normalizeText(args.normalized.title ?? "");
  const sceneTitle = normalizeText(args.sceneChart.title ?? "");
  const kindMismatch = args.normalized.chartKind !== args.sceneChart.chartKind;
  const titleMismatch = Boolean(domTitle && sceneTitle && domTitle !== sceneTitle);
  if (!kindMismatch && !titleMismatch) {
    return;
  }
  args.warnings.push({
    code: "chart-dom-scene-mismatch",
    severity: "info",
    countsAgainstQuality: false,
    pageNumber: args.pageNumber,
    sourceId: args.frame.visualId,
    sourceKind: "chart",
    chartFamily: args.normalized.chartKind,
    message: `Chart frame ${args.frame.visualId} on page ${args.pageNumber} used its DOM chart spec (${args.normalized.chartKind}${domTitle ? `, ${domTitle}` : ""}) instead of mismatched scene metadata (${args.sceneChart.chartKind}${sceneTitle ? `, ${sceneTitle}` : ""}).`,
  });
}

function pushChartContractDiagnostic(args: {
  warnings: PptExportWarning[];
  pageNumber: number;
  contract: PptExportChartContract;
  sourceId?: string;
  message?: string;
}) {
  const blocked = args.contract.nativeEligibility === "blocked";
  args.warnings.push({
    code: "chart-contract-detected",
    severity: "info",
    countsAgainstQuality: false,
    pageNumber: args.pageNumber,
    sourceId: args.sourceId,
    sourceKind: args.contract.family === "matrix" ? "matrix" : "chart",
    chartFamily: args.contract.family,
    chartContractConfidence: args.contract.confidence,
    chartNativeEligibility: args.contract.nativeEligibility,
    chartBlockedReason: args.contract.blockedReason,
    chartReasonCodes: args.contract.reasonCodes,
    message:
      args.message ??
      (blocked
        ? `Chart contract on page ${args.pageNumber} could not be normalized for native chart data and will rely on visual snapshot export.`
        : `Chart contract on page ${args.pageNumber} resolved as ${args.contract.family}.`),
  });
}

function blockedChartContractFromKind(args: {
  kind: unknown;
  source: PptExportChartContract["source"];
  reason: PptExportChartBlockedReason;
  diagnostic: string;
}) {
  const family = isSupportedChartFamily(args.kind) ? args.kind : "unknown";
  return {
    family,
    confidence: "high",
    source: args.source,
    reasonCodes: [`${String(args.kind || "unknown")}-chart-contract`, "minimum-data-failed"],
    ownerElementIds: [],
    nativeEligibility: "blocked",
    blockedReason: args.reason,
    diagnostics: [args.diagnostic],
  } satisfies PptExportChartContract;
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
      pushChartContractDiagnostic({
        warnings: args.warnings,
        pageNumber: args.pageNumber,
        contract: blockedChartContractFromKind({
          kind,
          source: "export-payload",
          reason: isSupportedChartFamily(kind) ? "missing-data" : "ambiguous-family",
          diagnostic: `${kind} export payload could not be normalized into a supported chart contract.`,
        }),
        message: `${kind} chart on page ${args.pageNumber} could not be normalized into the PPTX chart contract.`,
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
        style: normalizeChartSeriesStyle(item.style),
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
    pushChartContractDiagnostic({
      warnings: args.warnings,
      pageNumber: args.pageNumber,
      contract: blockedChartContractFromKind({
        kind,
        source: "export-payload",
        reason: "missing-data",
        diagnostic: "Export chart payload lacked labels or series values.",
      }),
      message: `Chart on page ${args.pageNumber} did not expose enough structured data for editable PPTX export.`,
    });
    return null;
  }

  const chartContract = {
    family: kind,
    confidence: "high",
    source: "export-payload",
    reasonCodes: [`export-payload-${kind}`, "minimum-data-ok"],
    ownerElementIds: [],
    nativeEligibility: "visual-snapshot",
    diagnostics: [],
  } satisfies PptExportChartContract;

  return {
    chartKind: kind,
    chartContract,
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
    style: normalizeChartNativeStyle(args.parsed.style),
    renderMode: "image",
    fallbackMode: "visual-chart-snapshot",
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
  const chartContract = buildExportChartContractFromSpec({
    spec: args.spec,
    source: "spec",
  });
  if (chartContract.nativeEligibility === "blocked") {
    pushChartContractDiagnostic({
      warnings: args.warnings,
      pageNumber: args.pageNumber,
      contract: chartContract,
      message: `${args.spec.kind} chart on page ${args.pageNumber} did not expose enough structured data for editable PPTX export.`,
    });
    return null;
  }

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
      pushChartContractDiagnostic({
        warnings: args.warnings,
        pageNumber: args.pageNumber,
        contract: blockedChartContractFromKind({
          kind: "bubble",
          source: "spec",
          reason: "missing-data",
          diagnostic: "Bubble chart spec had no finite points.",
        }),
        message: `Bubble chart on page ${args.pageNumber} did not expose enough structured point data for editable PPTX export.`,
      });
      return null;
    }

    return {
      chartKind: "bubble",
      chartContract,
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
      style: normalizeChartNativeStyle(args.spec.style),
      renderMode: "image",
      fallbackMode: "visual-chart-snapshot",
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
      pushChartContractDiagnostic({
        warnings: args.warnings,
        pageNumber: args.pageNumber,
        contract: blockedChartContractFromKind({
          kind: "matrix",
          source: "spec",
          reason: "missing-data",
          diagnostic: "Matrix chart spec had no items.",
        }),
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
      chartContract,
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
        style: normalizeChartSeriesStyle(item.style),
      };
    })
    .filter((item) => item.values.length > 0);

  if (!labels.length || !series.length) {
    pushChartContractDiagnostic({
      warnings: args.warnings,
      pageNumber: args.pageNumber,
      contract: blockedChartContractFromKind({
        kind: args.spec.kind,
        source: "spec",
        reason: "missing-data",
        diagnostic: "Series chart spec lacked labels or series values.",
      }),
      message: `Chart on page ${args.pageNumber} did not expose enough structured data for editable PPTX export.`,
    });
    return null;
  }

  return {
    chartKind: args.spec.kind,
    chartContract,
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
    style: normalizeChartNativeStyle(args.spec.style),
    renderMode: "image",
    fallbackMode:
      args.spec.kind === "waterfall"
        ? "visual-chart-snapshot"
        : args.spec.kind === "combo"
          ? "visual-chart-snapshot"
          : "visual-chart-snapshot",
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

function chartKindFromDataContractType(type: ExportDataContract["type"]): SupportedNativeChartKind | null {
  if (type === "chart-bar") {
    return "bar";
  }
  if (type === "chart-stacked") {
    return "stacked";
  }
  if (type === "chart-line") {
    return "line";
  }
  if (type === "chart-combo") {
    return "combo";
  }
  if (type === "chart-waterfall") {
    return "waterfall";
  }
  if (type === "chart-bubble") {
    return "bubble";
  }
  if (type === "matrix") {
    return "matrix";
  }
  return null;
}

function normalizeChartContractFromDataContract(args: {
  dataContract: ExportDataContract;
  pageNumber: number;
  warnings: PptExportWarning[];
}): NormalizedChartContract | null {
  if (args.dataContract.type === "table" || args.dataContract.type === "missing-data") {
    return null;
  }
  const chartKind = chartKindFromDataContractType(args.dataContract.type);
  if (!chartKind) {
    return null;
  }
  const chartContract = {
    family: chartKind,
    confidence: "high",
    source: "data-contract",
    reasonCodes: [`strong-${args.dataContract.type}`, "minimum-data-ok"],
    ownerElementIds: [],
    nativeEligibility: chartKind === "matrix" ? "matrix-shapes" : "visual-snapshot",
    diagnostics: [],
  } satisfies PptExportChartContract;

  if (args.dataContract.type === "chart-bubble") {
    const points = args.dataContract.points.map((point, index) => ({
      label: normalizeText(point.label || `Point ${index + 1}`) || `Point ${index + 1}`,
      x: point.x,
      y: point.y,
      size: point.size,
      color: parseCssColor(point.color)?.hex,
      group: normalizeText(point.group ?? "") || null,
    }));
    return {
      chartKind: "bubble",
      chartContract,
      labels: points.map((point) => point.label),
      series: [],
      bubblePoints: points,
      xAxisTitle: args.dataContract.xAxis?.label,
      yAxisTitle: args.dataContract.yAxis?.label,
      sizeAxisTitle: args.dataContract.sizeAxis?.label,
      colors: points.map((point) => point.color).filter((item): item is string => Boolean(item)),
      style: normalizeChartNativeStyle(args.dataContract.style),
      renderMode: "image",
      fallbackMode: "visual-chart-snapshot",
    };
  }

  if (args.dataContract.type === "matrix") {
    const fallbackColors = args.dataContract.quadrants?.map((quadrant) => quadrant.color ?? "")
      .filter(Boolean) ?? ["#F8F3EC", "#EAF3F5", "#F5E7DF", "#EFF2EC"];
    const items: PptExportMatrixItem[] = args.dataContract.items.map((item, index) => ({
      label: normalizeText(item.label || `Item ${index + 1}`) || `Item ${index + 1}`,
      detail: normalizeText(item.detail ?? ""),
      x: clamp(item.x, 0, 1),
      y: clamp(item.y, 0, 1),
      w: 0.28,
      h: 0.16,
      color: parseCssColor(item.color)?.hex ?? parseCssColor(fallbackColors[index % fallbackColors.length])?.hex ?? "FFFFFF",
      textColor: null,
    }));
    return {
      chartKind: "matrix",
      chartContract,
      labels: [],
      series: [],
      xAxisTitle: args.dataContract.axes.x.label,
      yAxisTitle: args.dataContract.axes.y.label,
      colors: items.map((item) => item.color).filter((item): item is string => Boolean(item)),
      renderMode: "native",
      fallbackMode: "native-matrix-shapes",
      semanticSpec: {
        kind: "matrix",
        xLabel: args.dataContract.axes.x.label,
        yLabel: args.dataContract.axes.y.label,
        xMinLabel: args.dataContract.axes.x.min !== undefined ? String(args.dataContract.axes.x.min) : "",
        xMaxLabel: args.dataContract.axes.x.max !== undefined ? String(args.dataContract.axes.x.max) : "",
        yMinLabel: args.dataContract.axes.y.min !== undefined ? String(args.dataContract.axes.y.min) : "",
        yMaxLabel: args.dataContract.axes.y.max !== undefined ? String(args.dataContract.axes.y.max) : "",
        plotBounds: null,
        quadrants: args.dataContract.quadrants?.map((quadrant, index) => ({
          label: normalizeText(quadrant.label),
          x: clamp(quadrant.x, 0, 1),
          y: clamp(quadrant.y, 0, 1),
          w: clamp(quadrant.w, 0, 1),
          h: clamp(quadrant.h, 0, 1),
          color: parseCssColor(quadrant.color)?.hex ?? parseCssColor(fallbackColors[index % fallbackColors.length])?.hex ?? "FFFFFF",
          textColor: parseCssColor(quadrant.textColor)?.hex ?? null,
        })),
        items,
        callout: args.dataContract.callout
          ? {
              title: normalizeText(args.dataContract.callout.title),
              body: normalizeText(args.dataContract.callout.body ?? ""),
              x: clamp(args.dataContract.callout.x ?? 0.68, 0, 1),
              y: clamp(args.dataContract.callout.y ?? 0.12, 0, 1),
              w: clamp(args.dataContract.callout.w ?? 0.24, 0.04, 1),
              h: clamp(args.dataContract.callout.h ?? 0.2, 0.04, 1),
              color: "FFFFFF",
              textColor: null,
              borderColor: null,
            }
          : null,
        colors: items.map((item) => item.color).filter((item): item is string => Boolean(item)),
      },
    };
  }

  if (args.dataContract.type === "chart-combo") {
    const series = [
      ...args.dataContract.barSeries.map((series) => ({ ...series, role: "bar" as const, axis: "primary" as const })),
      ...args.dataContract.lineSeries.map((series) => ({ ...series, role: "line" as const, axis: "secondary" as const })),
    ];
    return {
      chartKind: "combo",
      chartContract,
      labels: args.dataContract.categories,
      series: series.map((item) => ({
        name: item.name,
        values: item.values,
        color: parseCssColor(item.color)?.hex,
        role: item.role,
        axis: item.axis,
      })),
      yAxisTitle: args.dataContract.primaryAxis?.label,
      secondaryYAxisTitle: args.dataContract.secondaryAxis?.label,
      colors: series.map((item) => parseCssColor(item.color)?.hex).filter((item): item is string => Boolean(item)),
      style: normalizeChartNativeStyle(args.dataContract.style),
      renderMode: "image",
      fallbackMode: "visual-chart-snapshot",
    };
  }

  if (args.dataContract.type === "chart-waterfall") {
    return {
      chartKind: "waterfall",
      chartContract,
      labels: args.dataContract.steps.map((step) => step.label),
      series: [{
        name: "Waterfall",
        values: args.dataContract.steps.map((step) => step.value),
      }],
      yAxisTitle: args.dataContract.axis?.y?.label,
      colors: args.dataContract.steps.map((step) => parseCssColor(step.color)?.hex).filter((item): item is string => Boolean(item)),
      style: normalizeChartNativeStyle(args.dataContract.style),
      renderMode: "image",
      fallbackMode: "visual-chart-snapshot",
    };
  }

  return {
    chartKind,
    chartContract,
    labels: args.dataContract.categories,
    series: args.dataContract.series.map((series) => ({
      name: series.name,
      values: series.values,
      color: parseCssColor(series.color)?.hex,
      role: chartKind === "line" ? "line" : "bar",
      axis: series.axis,
    })),
    xAxisTitle: args.dataContract.axis?.x?.label,
    yAxisTitle: args.dataContract.axis?.y?.label,
    valueAxisMin: args.dataContract.axis?.y?.min,
    valueAxisMax: args.dataContract.axis?.y?.max,
    colors: args.dataContract.colors ?? args.dataContract.series.map((series) => parseCssColor(series.color)?.hex).filter((item): item is string => Boolean(item)),
    style: normalizeChartNativeStyle(args.dataContract.style),
    renderMode: "image",
    fallbackMode: "visual-chart-snapshot",
  };
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

function elementTextMatchesChartHeading(element: HTMLElement, heading: string) {
  const text = normalizeMultilineText(element.innerText || element.textContent || "");
  return text === heading || text.startsWith(`${heading} `);
}

function frameHasExportableDomHeading(frame: ChartFrameCandidate, heading: string | undefined) {
  const normalizedHeading = normalizeText(heading ?? "");
  if (!normalizedHeading) {
    return false;
  }

  return Array.from(
    frame.element.querySelectorAll<HTMLElement>(
      [
        "[data-html-block-id]",
        '[data-html-fit-role="content"]',
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "p",
        ".lede",
        ".eyebrow",
      ].join(","),
    ),
  ).some((element) => elementTextMatchesChartHeading(element, normalizedHeading));
}

function shouldRenderInlineHeadingForNativeChart(
  frame: ChartFrameCandidate | null,
  normalized: NormalizedChartContract,
) {
  if (!frame) {
    return normalized.showInlineHeading;
  }
  const title = normalizeText(normalized.title ?? "");
  const subtitle = normalizeText(normalized.subtitle ?? "");
  const hasSubstantiveHeading = title.length >= 16 || subtitle.length >= 16;
  if (!hasSubstantiveHeading) {
    return false;
  }
  if (frameHasExportableDomHeading(frame, title) && !frame.element.classList.contains("html-chart-module")) {
    return false;
  }
  return true;
}

function buildTextNodeFromElement(args: {
  pageElement: HTMLElement;
  element: HTMLElement;
  view: Window;
  owner?: ExportOwner;
  sourceElementId?: string;
  useFixedBounds?: boolean;
  allowFill?: boolean;
  ordering?: {
    sourceOrder?: number;
    zIndex?: number;
    zOrder?: number;
    layerRole?: PptExportLayerRole;
  };
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
  const text = normalizeMultilineText(args.element.innerText ?? args.element.textContent ?? "");
  if (!text) {
    return null;
  }
  const baseMeasurement = measurePptTextLayout({
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
  const allowedLines = Math.max(1, Math.floor(Math.max(rect.h, lineHeightPx) / Math.max(lineHeightPx, 1)));
  const overflowRatio =
    baseMeasurement.lineCount > allowedLines ? allowedLines / Math.max(baseMeasurement.lineCount, 1) : 1;
  const adjustedFontSizePx =
    overflowRatio < 1 ? fontSizePx * Math.max(0.66, overflowRatio) : fontSizePx;
  const adjustedLineHeightPx = Math.max(1, lineHeightPx * (adjustedFontSizePx / Math.max(fontSizePx, 1)));
  const measurement =
    adjustedFontSizePx === fontSizePx
      ? baseMeasurement
      : measurePptTextLayout({
          widthPx: Math.max(24, rect.w),
          fontSizePx: adjustedFontSizePx,
          fontFamily: primaryFontFamily(computed.fontFamily) || "Arial",
          fontWeight: computed.fontWeight || "400",
          fontStyle: computed.fontStyle || "normal",
          lineHeightPx: adjustedLineHeightPx,
          text,
          items,
          whiteSpace: resolveElementTextLayoutWhiteSpace(args.element),
        });
  const rotate = resolveElementRotationDegrees(args.element);
  const textBoxWidthPx = resolvePptTextBoxWidthPx({
    rect,
    measurement,
    lineHeightPx: adjustedLineHeightPx,
    fontSizePx: adjustedFontSizePx,
    text,
    rotate,
  });
  const textBoxHeightPx =
    Math.abs(rotate ?? 0) % 180 > 1
      ? Math.max(
          adjustedLineHeightPx + 8,
          Math.min(Math.max(rect.h, measurement.height), adjustedLineHeightPx * 1.35 + 8),
        )
      : Math.max(rect.h, measurement.height) + 8;

  return {
    kind: "text",
    sourceElementId: args.sourceElementId ?? sourceElementIdForElement(args.pageElement, args.element, "text"),
    ownerId: args.owner?.id,
    ownerKind: args.owner?.kind ?? (args.element.matches("[data-html-block-id]") ? "block" : undefined),
    sourceOrder: args.ordering?.sourceOrder,
    zIndex: args.ordering?.zIndex,
    zOrder: args.ordering?.zOrder,
    layerRole: args.ordering?.layerRole ?? "text",
    x: pxToInches(rect.x),
    y: pxToInches(rect.y),
    w: pxToInches(args.useFixedBounds ? Math.max(rect.w, textBoxWidthPx) : textBoxWidthPx),
    h: pxToInches(args.useFixedBounds ? Math.max(rect.h, textBoxHeightPx) : textBoxHeightPx),
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
    fillColor: args.allowFill && fillColor?.alpha && fillColor.alpha > 0 ? fillColor.hex : null,
    lineSpacingMultiple: toLineSpacingMultiple(adjustedLineHeightPx, adjustedFontSizePx),
    paraSpaceAfterPt: resolveParagraphSpacingAfterPt({
      computed,
      lineHeightPx: adjustedLineHeightPx,
      isList,
    }),
    paraSpaceBeforePt: resolveParagraphSpacingBeforePt(computed),
    listStyle: isList
      ? resolveListStyle({
          element: args.element,
          computed,
          fontSizePx: adjustedFontSizePx,
        })
      : undefined,
  } satisfies PptExportTextNode;
}

function hasReadableTextChild(element: HTMLElement) {
  return Array.from(element.children).some(
    (child) =>
      normalizeText((child instanceof HTMLElement ? child.innerText : child.textContent) || "").length > 0,
  );
}

function hasMultipleReadableTextChildren(element: HTMLElement) {
  let readableChildCount = 0;
  for (const child of Array.from(element.children)) {
    const text = normalizeText((child instanceof HTMLElement ? child.innerText : child.textContent) || "");
    if (!text) {
      continue;
    }
    readableChildCount += 1;
    if (readableChildCount > 1) {
      return true;
    }
  }
  return false;
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

function collectBlockTextNodes(args: {
  pageElement: HTMLElement;
  warnings: PptExportWarning[];
  pageNumber: number;
  skipTextWithinElements?: HTMLElement[];
  plan?: ExportPagePlan | null;
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
    if (
      !canEmitTextElement({
        plan: args.plan,
        element,
        owners: args.plan?.owners,
      })
    ) {
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
      fontSizePx: adjustedFontSizePx,
      text,
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
      sourceElementId: sourceElementIdForElement(args.pageElement, element, "block"),
      ownerId: blockId,
      ownerKind: "block",
      ...nodeOrderingForElement({
        plan: args.plan,
        element,
        layerRole: "text",
        offset: 5,
      }),
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
      fillColor:
        allowTextFillForElement({ plan: args.plan, element }) && fillColor?.alpha && fillColor.alpha > 0
          ? fillColor.hex
          : null,
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
  plan?: ExportPagePlan | null;
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
        ".surface-card h1",
        ".surface-card h2",
        ".surface-card h3",
        ".surface-card h4",
        ".surface-card h5",
        ".surface-card h6",
        ".surface-card p",
        ".page-footer",
        ".eyebrow",
        ".lede",
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
    if (
      !canEmitTextElement({
        plan: args.plan,
        element,
        owners: args.plan?.owners,
      })
    ) {
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
      useFixedBounds: true,
      allowFill: allowTextFillForElement({ plan: args.plan, element }),
      ordering: nodeOrderingForElement({
        plan: args.plan,
        element,
        layerRole: "text",
        offset: 5,
      }),
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

function collectStructuredChartModuleHeadingTextNodes(args: {
  pageElement: HTMLElement;
  theme: PptExportThemeSnapshot;
  plan?: ExportPagePlan | null;
}) {
  const nodes: PptExportTextNode[] = [];
  const modules = Array.from(
    args.pageElement.querySelectorAll<HTMLElement>(`.html-chart-module[${HTML_CHART_SPEC_ATTRIBUTE}]`),
  );

  for (const moduleElement of modules) {
    const spec = parseHtmlChartSpec(moduleElement.getAttribute(HTML_CHART_SPEC_ATTRIBUTE));
    if (!spec) {
      continue;
    }
    const title = normalizeText(spec.title ?? "");
    const subtitle = normalizeText(spec.subtitle || spec.insight || "");
    if (!title && !subtitle) {
      continue;
    }
    const rect = measureElementRect(args.pageElement, moduleElement);
    if (!rect.w || !rect.h) {
      continue;
    }
    const ordering = nodeOrderingForElement({
      plan: args.plan,
      element: moduleElement,
      layerRole: "text",
      offset: 6,
    });
    const sourceId = sourceElementIdForElement(args.pageElement, moduleElement, "chart-module-heading");
    if (title) {
      nodes.push({
        kind: "text",
        sourceElementId: `${sourceId}:title`,
        ownerKind: "chart",
        sourceOrder: ordering.sourceOrder,
        zIndex: ordering.zIndex,
        zOrder: ordering.zOrder,
        layerRole: ordering.layerRole,
        x: pxToInches(rect.x),
        y: pxToInches(rect.y),
        w: pxToInches(rect.w),
        h: pxToInches(30),
        text: title,
        fontSize: pxFontToPoints(18),
        fontFamily: "Iowan Old Style",
        color: args.theme.textPrimary,
        bold: true,
        fillColor: null,
      });
    }
    if (subtitle) {
      nodes.push({
        kind: "text",
        sourceElementId: `${sourceId}:subtitle`,
        ownerKind: "chart",
        sourceOrder: (ordering.sourceOrder ?? 0) + 1,
        zIndex: ordering.zIndex,
        zOrder: ordering.zOrder,
        layerRole: ordering.layerRole,
        x: pxToInches(rect.x),
        y: pxToInches(rect.y + 34),
        w: pxToInches(rect.w),
        h: pxToInches(24),
        text: subtitle,
        fontSize: pxFontToPoints(13),
        fontFamily: "Avenir Next",
        color: args.theme.textMuted,
        bold: false,
        fillColor: null,
      });
    }
  }

  return dedupeTextNodes(nodes);
}

function collectDiagramElements(pageElement: HTMLElement) {
  return Array.from(pageElement.querySelectorAll<HTMLElement>("[data-html-diagram-spec]"));
}

function createExportOwner(args: {
  pageElement: HTMLElement;
  element: HTMLElement;
  kind: PptExportOwnerKind;
  idPrefix?: string;
  index: number;
  ownsText?: boolean;
  ownsShapes?: boolean;
  ownsSvg?: boolean;
}): ExportOwner {
  return {
    id: `${args.idPrefix ?? args.kind}-${sourceElementIdForElement(args.pageElement, args.element, args.kind)}-${
      args.index + 1
    }`,
    kind: args.kind,
    element: args.element,
    bounds: measureElementRect(args.pageElement, args.element),
    ownsText: args.ownsText ?? true,
    ownsShapes: args.ownsShapes ?? true,
    ownsSvg: args.ownsSvg ?? true,
  };
}

function collectDiagramOwners(pageElement: HTMLElement) {
  return collectDiagramElements(pageElement).map((element, index) =>
    createExportOwner({
      pageElement,
      element,
      kind: "diagram",
      index,
    }),
  );
}

function buildSvgTextNodeFromElement(args: {
  pageElement: HTMLElement;
  element: SVGTextElement;
  view: Window;
  owner?: ExportOwner;
}) {
  const rect = measureElementRect(args.pageElement, args.element);
  if (!rect.w || !rect.h) {
    return null;
  }

  const text = normalizeMultilineText(args.element.textContent ?? "");
  if (!text) {
    return null;
  }

  const computed = args.view.getComputedStyle(args.element);
  const fontSizePx = Number.parseFloat(computed.fontSize || "") || 14;
  const lineHeightPx = resolveComputedLineHeightPx(computed, fontSizePx);
  const fillColor =
    parseCssColor(args.element.getAttribute("fill") ?? computed.getPropertyValue("fill")) ??
    parseCssColor(computed.color);
  const anchor = args.element.getAttribute("text-anchor") ?? computed.getPropertyValue("text-anchor");
  const transform = args.element.getAttribute("transform") || "";
  const rotateMatch = transform.match(/rotate\(\s*(-?[0-9.]+)/i);

  return {
    kind: "text",
    sourceElementId: sourceElementIdForElement(args.pageElement, args.element, "svg-text"),
    ownerId: args.owner?.id,
    ownerKind: args.owner?.kind,
    x: pxToInches(rect.x),
    y: pxToInches(rect.y),
    w: pxToInches(Math.max(rect.w, 8)),
    h: pxToInches(Math.max(rect.h, lineHeightPx + 4)),
    text,
    fontSize: pxFontToPoints(fontSizePx),
    fontFamily: primaryFontFamily(computed.fontFamily),
    color: fillColor?.hex ?? DEFAULT_TEXT,
    bold: Number.parseInt(computed.fontWeight || "400", 10) >= 600,
    italic: computed.fontStyle === "italic",
    align: anchor === "middle" ? "center" : anchor === "end" ? "right" : "left",
    rotate: rotateMatch ? Number.parseFloat(rotateMatch[1] ?? "0") : undefined,
    fillColor: null,
    lineSpacingMultiple: toLineSpacingMultiple(lineHeightPx, fontSizePx),
  } satisfies PptExportTextNode;
}

function shouldUseOwnedTextElement(element: HTMLElement) {
  if (element.matches("script,style,svg")) {
    return false;
  }
  if (element.matches("ul,ol")) {
    return true;
  }
  if (element.closest("ul,ol") && element.matches("li")) {
    return false;
  }
  return !hasReadableStructuralTextChild(element) && !hasReadableTextChild(element);
}

function collectOwnedTextNodes(args: {
  pageElement: HTMLElement;
  owners: ExportOwner[];
  plan?: ExportPagePlan | null;
}) {
  const view = args.pageElement.ownerDocument.defaultView;
  if (!view) {
    return [];
  }

  const textNodes: PptExportTextNode[] = [];
  for (const owner of args.owners) {
    if (!owner.ownsText) {
      continue;
    }

    const candidates = Array.from(
      owner.element.querySelectorAll<HTMLElement>(
        [
          "ul",
          "ol",
          "[data-html-block-id]",
          '[data-html-fit-role="content"]',
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "p",
          "li",
          "span",
          "div",
        ].join(","),
      ),
    );

    for (const element of candidates) {
      if (element !== owner.element && resolveOwnerForElement(element, args.owners)?.id !== owner.id) {
        continue;
      }
      if (!shouldUseOwnedTextElement(element)) {
        continue;
      }
      if (
        !canEmitTextElement({
          plan: args.plan,
          element,
          owner,
          owners: args.owners,
        })
      ) {
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
      const text = normalizeMultilineText(element.innerText || element.textContent || "");
      if (!text) {
        continue;
      }
      const node = buildTextNodeFromElement({
        pageElement: args.pageElement,
        element,
        view,
        owner,
        useFixedBounds: true,
        allowFill: allowTextFillForElement({ plan: args.plan, element }),
        ordering: nodeOrderingForElement({
          plan: args.plan,
          element,
          layerRole: "text",
          offset: 5,
        }),
      });
      if (node) {
        textNodes.push({
          ...node,
          text,
        });
      }
    }

    for (const element of Array.from(owner.element.querySelectorAll<SVGTextElement>("svg text"))) {
      const node = buildSvgTextNodeFromElement({
        pageElement: args.pageElement,
        element,
        view,
        owner,
      });
      if (node) {
        textNodes.push({
          ...node,
          ...nodeOrderingForElement({
            plan: args.plan,
            element: owner.element,
            layerRole: "text",
            offset: 5,
          }),
        });
      }
    }
  }

  return dedupeTextNodes(textNodes);
}

function shouldRenderVisualAsLine(role: string, rect: { w: number; h: number }) {
  return role === "divider" || role === "rail" || rect.h <= 4 || rect.w <= 4;
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

function collectPageLineSegmentNode(args: {
  pageElement: HTMLElement;
  sourceElement: SVGElement;
  start: { x: number; y: number };
  end: { x: number; y: number };
  strokePaint: ParsedSolidPaint | null;
  strokeOpacity: number;
  strokeWidth: number;
  dashArray?: string | null;
  owner?: ExportOwner;
  sourceOrder?: number;
  zIndex?: number;
  canvasLayer?: ExportCanvasLayer;
  canvasLayerOrder?: number;
}): PptExportVisualNode | null {
  if (!args.strokePaint || args.strokeOpacity <= 0) {
    return null;
  }

  const width = args.end.x - args.start.x;
  const height = args.end.y - args.start.y;
  if (Math.abs(width) < 0.5 && Math.abs(height) < 0.5) {
    return null;
  }

  return {
    kind: "shape",
    sourceElementId: sourceElementIdForElement(args.pageElement, args.sourceElement, "svg-line"),
    ownerId: args.owner?.id,
    ownerKind: args.owner?.kind,
    sourceOrder: args.sourceOrder,
    zIndex: args.zIndex,
    zOrder: layerZOrder({
      layerRole: "shape",
      sourceOrder: args.sourceOrder,
      zIndex: args.zIndex,
      canvasLayer: args.canvasLayer,
      canvasLayerOrder: args.canvasLayerOrder,
    }),
    layerRole: "shape",
    role: "svg-line",
    x: pxToInches(args.start.x),
    y: pxToInches(args.start.y),
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

function collectSvgLineSegmentNode(args: {
  pageElement: HTMLElement;
  sourceElement: SVGElement;
  viewport: SvgViewport;
  start: { x: number; y: number };
  end: { x: number; y: number };
  strokePaint: ParsedSolidPaint | null;
  strokeOpacity: number;
  strokeWidth: number;
  dashArray?: string | null;
  owner?: ExportOwner;
  sourceOrder?: number;
  zIndex?: number;
  canvasLayer?: ExportCanvasLayer;
  canvasLayerOrder?: number;
}): PptExportVisualNode | null {
  return collectPageLineSegmentNode({
    ...args,
    start: mapSvgPointToPagePx({
      pageElement: args.pageElement,
      viewport: args.viewport,
      x: args.start.x,
      y: args.start.y,
    }),
    end: mapSvgPointToPagePx({
      pageElement: args.pageElement,
      viewport: args.viewport,
      x: args.end.x,
      y: args.end.y,
    }),
  });
}

function withDefaultShapeOrdering(node: PptExportVisualNode) {
  if (node.zOrder !== undefined && node.layerRole) {
    return node;
  }
  const layerRole: PptExportLayerRole = node.layerRole ?? "shape";
  return {
    ...node,
    layerRole,
    zOrder: layerZOrder({
      layerRole,
      sourceOrder: node.sourceOrder,
      zIndex: node.zIndex,
      canvasLayer: "content",
      canvasLayerOrder: 0,
    }),
  };
}

function collectSvgPrimitiveNodes(args: {
  pageElement: HTMLElement;
  skipWithinElements?: HTMLElement[];
  owners?: ExportOwner[];
  orderForElement?: (element: Element) => number;
}) {
  const view = args.pageElement.ownerDocument.defaultView;
  if (!view) {
    return [];
  }

  const nodes: PptExportVisualNode[] = [];
  const svgs = Array.from(args.pageElement.querySelectorAll<SVGSVGElement>("svg")).filter(
    (svg) =>
      !args.skipWithinElements?.some((container) => container.contains(svg)) &&
      !isHiddenForExport({
        element: svg,
        pageElement: args.pageElement,
        view,
      }).hidden,
  );
  for (const svg of svgs) {
    const viewport = readSvgViewport(svg);
    if (!viewport) {
      continue;
    }
    const owner = resolveOwnerForElement(svg, args.owners);

    const primitives = Array.from(
      svg.querySelectorAll<SVGElement>("polygon,polyline,path,line,circle,rect"),
    );
    for (const primitive of primitives) {
      if (
        isHiddenForExport({
          element: primitive,
          pageElement: args.pageElement,
          view,
        }).hidden
      ) {
        continue;
      }
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
      const primitiveOrder = args.orderForElement?.(primitive);
      const primitiveZIndex = numericZIndex(view, primitive, args.pageElement);
      const primitiveCanvasLayer = readExportCanvasLayer(primitive, args.pageElement);

      if (tagName === "polyline" || tagName === "polygon") {
        const rawPoints = parseSvgPoints(primitive.getAttribute("points"));
        if (tagName === "polyline") {
          for (let index = 0; index + 1 < rawPoints.length; index += 1) {
            const node = collectSvgLineSegmentNode({
              pageElement: args.pageElement,
              sourceElement: primitive,
              viewport,
              start: rawPoints[index]!,
              end: rawPoints[index + 1]!,
              strokePaint,
              strokeOpacity,
              strokeWidth,
              dashArray,
              owner,
              sourceOrder: primitiveOrder,
              zIndex: primitiveZIndex,
              canvasLayer: primitiveCanvasLayer.canvasLayer,
              canvasLayerOrder: primitiveCanvasLayer.canvasLayerOrder,
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
          sourceElementId: sourceElementIdForElement(args.pageElement, primitive, "svg-polygon"),
          ownerId: owner?.id,
          ownerKind: owner?.kind,
          sourceOrder: primitiveOrder,
          zIndex: primitiveZIndex,
          zOrder: layerZOrder({
            layerRole: "shape",
            sourceOrder: primitiveOrder,
            zIndex: primitiveZIndex,
            canvasLayer: primitiveCanvasLayer.canvasLayer,
            canvasLayerOrder: primitiveCanvasLayer.canvasLayerOrder,
          }),
          layerRole: "shape",
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
          sourceElement: primitive,
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
          owner,
          sourceOrder: primitiveOrder,
          zIndex: primitiveZIndex,
          canvasLayer: primitiveCanvasLayer.canvasLayer,
          canvasLayerOrder: primitiveCanvasLayer.canvasLayerOrder,
        });
        if (node) {
          nodes.push(node);
        }
        continue;
      }

      if (tagName === "path") {
        const pathElement = primitive as SVGPathElement;
        let totalLength = 0;
        try {
          totalLength =
            typeof pathElement.getTotalLength === "function" ? pathElement.getTotalLength() : 0;
        } catch {
          totalLength = 0;
        }
        if (!Number.isFinite(totalLength) || totalLength <= 0) {
          continue;
        }
        const sampleCount = Math.max(2, Math.min(48, Math.ceil(totalLength / 18)));
        const pagePoints = Array.from({ length: sampleCount + 1 }, (_, index) => {
          const point = pathElement.getPointAtLength((index / sampleCount) * totalLength);
          return mapSvgPointToPagePx({
            pageElement: args.pageElement,
            viewport,
            x: point.x,
            y: point.y,
          });
        });
        if (fillPaint && fillOpacity > 0 && pagePoints.length >= 3) {
          const minX = Math.min(...pagePoints.map((point) => point.x));
          const minY = Math.min(...pagePoints.map((point) => point.y));
          const maxX = Math.max(...pagePoints.map((point) => point.x));
          const maxY = Math.max(...pagePoints.map((point) => point.y));
          const width = maxX - minX;
          const height = maxY - minY;
          if (width > 0 && height > 0) {
            nodes.push({
              kind: "shape",
              sourceElementId: sourceElementIdForElement(args.pageElement, primitive, "svg-path"),
              ownerId: owner?.id,
              ownerKind: owner?.kind,
              sourceOrder: primitiveOrder,
              zIndex: primitiveZIndex,
              zOrder: layerZOrder({
                layerRole: "shape",
                sourceOrder: primitiveOrder,
                zIndex: primitiveZIndex,
                canvasLayer: primitiveCanvasLayer.canvasLayer,
                canvasLayerOrder: primitiveCanvasLayer.canvasLayerOrder,
              }),
              layerRole: "shape",
              role: "svg-path",
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
          }
          continue;
        }

        for (let index = 0; index + 1 < pagePoints.length; index += 1) {
          const startPoint = pagePoints[index]!;
          const endPoint = pagePoints[index + 1]!;
          const node = collectPageLineSegmentNode({
            pageElement: args.pageElement,
            sourceElement: primitive,
            start: startPoint,
            end: endPoint,
            strokePaint,
            strokeOpacity,
            strokeWidth,
            dashArray,
            owner,
            sourceOrder: primitiveOrder,
            zIndex: primitiveZIndex,
            canvasLayer: primitiveCanvasLayer.canvasLayer,
            canvasLayerOrder: primitiveCanvasLayer.canvasLayerOrder,
          });
          if (node) {
            nodes.push(node);
          }
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
          sourceElementId: sourceElementIdForElement(args.pageElement, primitive, "svg-circle"),
          ownerId: owner?.id,
          ownerKind: owner?.kind,
          sourceOrder: primitiveOrder,
          zIndex: primitiveZIndex,
          zOrder: layerZOrder({
            layerRole: "shape",
            sourceOrder: primitiveOrder,
            zIndex: primitiveZIndex,
            canvasLayer: primitiveCanvasLayer.canvasLayer,
            canvasLayerOrder: primitiveCanvasLayer.canvasLayerOrder,
          }),
          layerRole: "shape",
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
          sourceElementId: sourceElementIdForElement(args.pageElement, primitive, "svg-rect"),
          ownerId: owner?.id,
          ownerKind: owner?.kind,
          sourceOrder: primitiveOrder,
          zIndex: primitiveZIndex,
          zOrder: layerZOrder({
            layerRole: "shape",
            sourceOrder: primitiveOrder,
            zIndex: primitiveZIndex,
            canvasLayer: primitiveCanvasLayer.canvasLayer,
            canvasLayerOrder: primitiveCanvasLayer.canvasLayerOrder,
          }),
          layerRole: "shape",
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

  return nodes.map(withDefaultShapeOrdering);
}

function collectVisualShapeElements(pageElement: HTMLElement, skipVisualIds: Set<string>) {
  const candidates = Array.from(
    pageElement.querySelectorAll<HTMLElement>(
      [
        "[data-html-visual-id]",
        "[data-export-role]",
        '[data-html-visual-kind="chart-frame"]',
        '[data-html-visual-kind="surface"]',
        '[data-html-visual-kind="highlight"]',
        '[data-html-module-kind="scientific-diagram"]',
        '[data-html-visual-kind="divider"]',
        '[data-html-visual-kind="rail"]',
        '[data-html-visual-kind="badge"]',
        ".surface-card",
      ].join(","),
    ),
  );

  return candidates.filter((element, index) => {
    return candidates.indexOf(element) === index;
  });
}

function hasVisibleComputedShapePaint(args: {
  pageElement: HTMLElement;
  element: HTMLElement;
  view: Window;
}) {
  if (args.element.closest("svg")) {
    return false;
  }
  if (readAttribute(args.element, "data-export-omit") === "true") {
    return false;
  }

  const computed = args.view.getComputedStyle(args.element);
  if (
    computed.display === "none" ||
    computed.visibility === "hidden" ||
    Number.parseFloat(computed.opacity || "1") <= 0
  ) {
    return false;
  }

  const rect = measureElementRect(
    args.pageElement,
    args.element,
    resolveShapeClipBounds(args.pageElement, args.element),
  );
  if (!rect.w || !rect.h) {
    return false;
  }

  const fillPaint = readElementFillPaint({
    element: args.element,
    computed,
  });
  const borderPaint = resolveComputedBorderPaint(computed);
  const borderWidth = Number.parseFloat(computed.borderWidth || "0");
  return alphaIsVisible(fillPaint) || Boolean(borderPaint && borderWidth > 0);
}

function closestNativeChartContractElement(element: Element) {
  const moduleElement = element.closest<HTMLElement>(
    `[data-html-module-kind="chart"][${HTML_CHART_SPEC_ATTRIBUTE}]`,
  );
  const spec = moduleElement ? parseHtmlChartSpec(moduleElement.getAttribute(HTML_CHART_SPEC_ATTRIBUTE)) : null;
  return spec && spec.kind !== "matrix" ? moduleElement : null;
}

function collectOwnerPrimitiveShapeElements(args: {
  pageElement: HTMLElement;
  owners?: ExportOwner[];
  view: Window;
  existingElements: HTMLElement[];
  plan?: ExportPagePlan | null;
}) {
  const seen = new Set(args.existingElements);
  const collected: HTMLElement[] = [];
  for (const owner of args.owners ?? []) {
    if (!owner.ownsShapes) {
      continue;
    }

    const candidates = Array.from(
      owner.element.querySelectorAll<HTMLElement>(
        [
          "article",
          "aside",
          "section",
          "figure",
          "div",
          "span",
          "p",
          "li",
        ].join(","),
      ),
    );

    for (const element of candidates) {
      if (seen.has(element)) {
        continue;
      }
      const record = recordForElement(args.plan, element);
      if (record && !record.visible) {
        if (record.hiddenByPlaceholder && args.plan) {
          warnHiddenPlaceholder(args.plan, element);
        }
        continue;
      }
      if (resolveOwnerForElement(element, args.owners)?.id !== owner.id) {
        continue;
      }
      if (
        !hasVisibleComputedShapePaint({
          pageElement: args.pageElement,
          element,
          view: args.view,
        })
      ) {
        continue;
      }
      seen.add(element);
      collected.push(element);
    }
  }

  return collected;
}

function resolveChartRenderRect(pageElement: HTMLElement, frame: ChartFrameCandidate) {
  const plotElement = findChartPlotElement(frame.element);
  if (!plotElement) {
    return frame.rect;
  }

  const rect = measureElementRect(pageElement, plotElement);
  return rect.w && rect.h ? rect : frame.rect;
}

function hasExplicitVisualChartSnapshotContract(
  frame: ChartFrameCandidate,
  semanticObject?: SemanticExportObject | null,
) {
  return Boolean(
    semanticObject?.objectKind === "chart-visual" ||
      semanticObject?.renderTarget === "visual-snapshot" ||
      frame.element.matches(
        [
          '[data-semantic-kind="chart-visual"]',
          '[data-export-object-kind="chart-visual"]',
          '[data-render-target="visual-snapshot"]',
        ].join(","),
      ),
  );
}

type ExplicitSnapshotBoundary = "object-root" | "visual-frame" | "plot-area";

const EXPLICIT_SNAPSHOT_BOUNDARY_VALUES = new Set<ExplicitSnapshotBoundary>(["object-root", "visual-frame", "plot-area"]);

function normalizeExplicitSnapshotBoundary(value: string | null | undefined): ExplicitSnapshotBoundary | null {
  const normalized = normalizeText(value ?? "");
  return EXPLICIT_SNAPSHOT_BOUNDARY_VALUES.has(normalized as ExplicitSnapshotBoundary)
    ? normalized as ExplicitSnapshotBoundary
    : null;
}

function semanticObjectRequiresSnapshotBoundary(object?: SemanticExportObject | null) {
  return Boolean(
    object &&
      (
        object.objectKind === "chart-visual" ||
        object.objectKind === "native-table" ||
        object.objectKind === "matrix" ||
        object.objectKind === "diagram" ||
        object.renderTarget === "visual-snapshot" ||
        object.renderTarget === "native-table"
      ),
  );
}

function findLargestVisibleSnapshotBoundaryElement(args: {
  pageElement: HTMLElement;
  root: HTMLElement;
  selectors: string[];
}) {
  const view = args.pageElement.ownerDocument.defaultView;
  const candidates = args.selectors.flatMap((selector) =>
    Array.from(args.root.querySelectorAll<HTMLElement>(selector)),
  );
  return candidates
    .filter((candidate, index) => {
      if (candidates.indexOf(candidate) !== index) {
        return false;
      }
      const hidden = view
        ? isHiddenForExport({
            element: candidate,
            pageElement: args.pageElement,
            view,
          }).hidden
        : false;
      if (hidden) {
        return false;
      }
      const rect = measureElementRect(args.pageElement, candidate);
      return rect.w > 0 && rect.h > 0;
    })
    .sort((left, right) => {
      const leftRect = measureElementRect(args.pageElement, left);
      const rightRect = measureElementRect(args.pageElement, right);
      return rightRect.w * rightRect.h - leftRect.w * leftRect.h;
    })[0] ?? null;
}

function resolveExplicitSnapshotBoundaryTarget(args: {
  pageElement: HTMLElement;
  root: HTMLElement;
  boundary: ExplicitSnapshotBoundary;
}) {
  if (args.boundary === "object-root") {
    return args.root;
  }
  if (args.boundary === "plot-area") {
    return findLargestVisibleSnapshotBoundaryElement({
      pageElement: args.pageElement,
      root: args.root,
      selectors: [
        "[data-snapshot-target=\"plot-area\"]",
        "[data-chart-plot-area]",
        "[data-html-chart-plot-area]",
        "[data-html-visual-kind=\"plot-area\"]",
        ".plot-area",
        "svg[data-html-module-kind=\"chart\"]",
        "svg",
      ],
    });
  }
  return findLargestVisibleSnapshotBoundaryElement({
    pageElement: args.pageElement,
    root: args.root,
    selectors: [
      "[data-snapshot-target=\"visual-frame\"]",
      "[data-studio-slot=\"primary-visual\"]",
      "[data-html-visual-kind=\"chart-frame\"]",
      "[data-html-module-kind=\"chart\"]",
      "[data-export-role=\"chart-frame\"]",
      "figure",
      "svg",
      "canvas",
      "img",
      "table",
    ],
  }) ?? args.root;
}

function pushSnapshotBoundaryMissingDiagnostic(args: {
  warnings: PptExportWarning[];
  pageElement: HTMLElement;
  pageNumber: number;
  frame: ChartFrameCandidate;
  semanticObject?: SemanticExportObject | null;
  reason: string;
}) {
  args.warnings.push({
    code: "visual-chart-snapshot-missing",
    severity: "fatal",
    countsAgainstQuality: true,
    pageNumber: args.pageNumber,
    sourceId: sourceElementIdForElement(args.pageElement, args.frame.element, "chart"),
    sourceKind: args.semanticObject?.objectKind === "matrix" ? "matrix" : "chart",
    exportObjectId: args.semanticObject?.objectId,
    exportObjectKind: args.semanticObject?.objectKind,
    exportRenderTarget: args.semanticObject?.renderTarget,
    message: args.semanticObject
      ? `Export object ${args.semanticObject.objectId} cannot be used as a visual snapshot source: ${args.reason}.`
      : `Chart on page ${args.pageNumber} cannot be used as a visual snapshot source: ${args.reason}.`,
  });
}

function resolveVisualChartSnapshotTarget(args: {
  pageElement: HTMLElement;
  frame: ChartFrameCandidate;
  semanticObject?: SemanticExportObject | null;
  warnings: PptExportWarning[];
  pageNumber: number;
}): VisualChartSnapshotTarget | null {
  if (semanticObjectRequiresSnapshotBoundary(args.semanticObject)) {
    const rawBoundary =
      args.semanticObject?.snapshotBoundary ||
      args.semanticObject?.element.getAttribute("data-snapshot-boundary") ||
      args.frame.element.getAttribute("data-snapshot-boundary");
    const boundary = normalizeExplicitSnapshotBoundary(rawBoundary);
    if (!boundary) {
      pushSnapshotBoundaryMissingDiagnostic({
        warnings: args.warnings,
        pageElement: args.pageElement,
        pageNumber: args.pageNumber,
        frame: args.frame,
        semanticObject: args.semanticObject,
        reason: "missing or invalid data-snapshot-boundary",
      });
      return null;
    }
    const root = args.semanticObject?.element ?? args.frame.element;
    const target = resolveExplicitSnapshotBoundaryTarget({
      pageElement: args.pageElement,
      root,
      boundary,
    });
    if (!target) {
      pushSnapshotBoundaryMissingDiagnostic({
        warnings: args.warnings,
        pageElement: args.pageElement,
        pageNumber: args.pageNumber,
        frame: args.frame,
        semanticObject: args.semanticObject,
        reason: `data-snapshot-boundary="${boundary}" did not resolve to a visible element`,
      });
      return null;
    }
    const rect = measureElementRect(args.pageElement, target);
    if (rect.w <= 0 || rect.h <= 0) {
      pushSnapshotBoundaryMissingDiagnostic({
        warnings: args.warnings,
        pageElement: args.pageElement,
        pageNumber: args.pageNumber,
        frame: args.frame,
        semanticObject: args.semanticObject,
        reason: `data-snapshot-boundary="${boundary}" resolved to empty bounds`,
      });
      return null;
    }
    return {
      element: target,
      rect,
    };
  }

  if (
    hasExplicitVisualChartSnapshotContract(args.frame, args.semanticObject) ||
    hasStructuredChartContract(args.frame.element) ||
    Boolean(parseExportChartData(args.frame.element))
  ) {
    return {
      element: args.frame.element,
      rect: args.frame.rect,
    };
  }

  const plotElement = findChartPlotElement(args.frame.element);
  if (plotElement && plotElement !== args.frame.element) {
    const rect = measureElementRect(args.pageElement, plotElement);
    if (rect.w > 0 && rect.h > 0) {
      return {
        element: plotElement,
        rect,
      };
    }
  }

  return {
    element: args.frame.element,
    rect: args.frame.rect,
  };
}

function chartKindFromContractElement(element: HTMLElement): SupportedNativeChartKind | null {
  const spec = parseHtmlChartSpec(element.getAttribute(HTML_CHART_SPEC_ATTRIBUTE));
  if (spec && isSupportedChartFamily(spec.kind)) {
    return spec.kind;
  }
  const parsed = parseExportChartData(element);
  return parsed?.kind && isSupportedChartFamily(parsed.kind) ? parsed.kind : null;
}

function findChartContractElementForKind(root: HTMLElement, chartKind: SupportedNativeChartKind) {
  const candidates = [
    root,
    ...Array.from(
      root.querySelectorAll<HTMLElement>(`[${HTML_CHART_SPEC_ATTRIBUTE}],[data-export-chart]`),
    ),
  ];
  return candidates.find((candidate) => chartKindFromContractElement(candidate) === chartKind) ?? null;
}

function resolveDirectChartFrameElement(element: HTMLElement) {
  if (element.tagName.toLowerCase() !== "svg") {
    return element;
  }
  return (
    element.parentElement?.closest<HTMLElement>(
      '[data-html-visual-id],[data-html-visual-kind="surface"],[data-html-visual-kind="chart-frame"]',
    ) ?? element
  );
}

function resolveVisibleSvgSnapshotWrapper(pageElement: HTMLElement, element: HTMLElement) {
  if (element.tagName.toLowerCase() !== "svg") {
    return null;
  }
  const view = pageElement.ownerDocument.defaultView;
  let current = element.parentElement;
  while (current && current !== pageElement.parentElement) {
    if (
      current.matches(
        '[data-html-visual-id],[data-html-visual-kind="surface"],[data-html-visual-kind="chart-frame"]',
      )
    ) {
      const rect = measureElementRect(pageElement, current);
      const hidden = view
        ? isHiddenForExport({
            element: current,
            pageElement,
            view,
          }).hidden
        : false;
      if (!hidden && rect.w > 0 && rect.h > 0) {
        return {
          element: current,
          rect,
        };
      }
    }
    if (current === pageElement) {
      break;
    }
    current = current.parentElement;
  }
  return null;
}

function alignSnapshotTargetToChartKind(args: {
  pageElement: HTMLElement;
  frame: ChartFrameCandidate;
  target: VisualChartSnapshotTarget;
  chartKind: SupportedNativeChartKind;
}): VisualChartSnapshotTarget {
  if (
    args.target.element.tagName.toLowerCase() === "svg" &&
    args.frame.element !== args.target.element &&
    args.frame.element.contains(args.target.element)
  ) {
    const rect = measureElementRect(args.pageElement, args.frame.element);
    if (rect.w > 0 && rect.h > 0) {
      return {
        element: args.frame.element,
        rect,
      };
    }
  }
  const visibleSvgWrapper = resolveVisibleSvgSnapshotWrapper(args.pageElement, args.target.element);
  if (visibleSvgWrapper) {
    return visibleSvgWrapper;
  }
  const targetKind = chartKindFromContractElement(args.target.element);
  if (!targetKind || targetKind === args.chartKind) {
    return args.target;
  }
  const matchingElement = findChartContractElementForKind(args.frame.element, args.chartKind);
  if (!matchingElement) {
    return args.target;
  }
  const rect = measureElementRect(args.pageElement, matchingElement);
  if (rect.w <= 0 || rect.h <= 0) {
    return args.target;
  }
  return {
    element: matchingElement,
    rect,
  };
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

function collectChartFrames(args: {
  pageElement: HTMLElement;
  pageNumber: number;
  warnings: PptExportWarning[];
  semanticRegistry?: SemanticExportObjectRegistry;
}) {
  const { pageElement, semanticRegistry } = args;
  const view = pageElement.ownerDocument.defaultView;
  if (!view) {
    return [];
  }
  const blockedByObjectIds = new Set<string>();
  const warnBlockedChartFallback = (element: Element) => {
    const object = closestSemanticExportObject(semanticRegistry, element);
    if (
      !object ||
      object.objectKind === "chart-visual" ||
      object.objectKind === "native-chart" ||
      object.objectKind === "matrix" ||
      !object.forbiddenInterpretation.includes("native-chart")
    ) {
      return;
    }
    pushForbiddenInterpretationBlockedDiagnostic({
      warnings: args.warnings,
      pageElement,
      pageNumber: args.pageNumber,
      element,
      object,
      interpretation: "native-chart",
      sourceKind: "chart",
      blockedByObjectIds,
    });
  };

  const explicitCandidates = Array.from(
    pageElement.querySelectorAll<HTMLElement>(
      [
        '[data-semantic-kind="chart-visual"]',
        '[data-export-object-kind="chart-visual"]',
        '[data-render-target="visual-snapshot"]',
        '[data-html-visual-kind="chart-frame"]',
        '[data-html-module-kind="chart"]',
        `[${HTML_CHART_SPEC_ATTRIBUTE}]`,
        "[data-export-chart]",
      ].join(","),
    ),
  );
  const diagnosticCandidates = Array.from(
    pageElement.querySelectorAll<HTMLElement>("article,aside,figure,section,div"),
  ).filter((element) => {
    if (element === pageElement || explicitCandidates.some((candidate) => candidate.contains(element))) {
      return false;
    }
    if (isInsideSemanticObjectRoot(semanticRegistry, element)) {
      warnBlockedChartFallback(element);
      return false;
    }
    const rect = measureElementRect(pageElement, element);
    if (rect.w < 180 || rect.h < 110) {
      return false;
    }
    if (rect.w > PPT_LAYOUT.pageWidthPx * 0.9 && rect.h > PPT_LAYOUT.pageHeightPx * 0.82) {
      return false;
    }
    return (
      (semanticObjectBlocksChartSnapshot(semanticRegistry, element)
        ? (warnBlockedChartFallback(element), false)
        : true) &&
      hasUnstructuredChartPrimitives(element)
    );
  });
  const candidates = [...explicitCandidates, ...diagnosticCandidates]
    .filter((element) => {
      if (isInsideSemanticObjectRoot(semanticRegistry, element)) {
        warnBlockedChartFallback(element);
        return false;
      }
      if (semanticObjectBlocksChartSnapshot(semanticRegistry, element)) {
        warnBlockedChartFallback(element);
        return false;
      }
      if (
        isHiddenForExport({
          element,
          pageElement,
          view,
        }).hidden
      ) {
        return false;
      }
      if (element.tagName.toLowerCase() === "svg" && !resolveVisibleSvgSnapshotWrapper(pageElement, element)) {
        return false;
      }
      if (closestSemanticExportObject(semanticRegistry, element)?.objectKind === "chart-visual") {
        return true;
      }
      if (hasStructuredChartContract(element)) {
        return true;
      }
      const moduleKind = element.getAttribute("data-html-module-kind");
      if (moduleKind === "chart") {
        return true;
      }
      return (
        (!moduleKind || moduleKind === "chart") &&
        (element.getAttribute("data-html-visual-kind") === "chart-frame" ||
          Boolean(findChartContractElement(element)) ||
          hasChartLikeEvidence(element))
      );
    })
    .map((element, index) => ({
      visualId: element.getAttribute("data-html-visual-id") ?? `chart-frame-${index + 1}`,
      element,
      rect: measureElementRect(pageElement, element),
    }));

  const filteredCandidates = candidates.filter((candidate, index) => {
    const semanticObject = closestSemanticExportObject(semanticRegistry, candidate.element);
    const structured = hasStructuredChartContract(candidate.element);
    const contractElement = findChartContractElement(candidate.element);
    const hasContractDescendant = Boolean(contractElement && contractElement !== candidate.element);
    const chartLikeEvidence = hasChartLikeEvidence(candidate.element);
    const exportable =
      semanticObject?.objectKind === "chart-visual" ||
      structured || hasContractDescendant || hasUnstructuredChartPrimitives(candidate.element) || chartLikeEvidence;
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
    const hasExportableAncestor = candidates.some(
      (other) =>
        other !== candidate &&
        other.element.contains(candidate.element) &&
        (Boolean(findChartContractElement(other.element)) ||
          hasUnstructuredChartPrimitives(other.element)) &&
        other.rect.w >= 180 &&
        other.rect.h >= 110,
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

    if (structured && hasExportableAncestor && !isDirectHtmlStructuredChartFrameElement(candidate.element)) {
      return false;
    }

    if (!structured && !hasContractDescendant && hasStructuredDescendant) {
      return false;
    }

    if (!structured && !hasContractDescendant && hasExportableChartDescendant) {
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

  return dedupeChartFrameCandidates(filteredCandidates);
}

function chartFrameContractFingerprint(candidate: ChartFrameCandidate) {
  const contractElement = findChartContractElement(candidate.element) ?? candidate.element;
  const spec = contractElement.getAttribute(HTML_CHART_SPEC_ATTRIBUTE);
  if (spec) {
    return `spec:${spec}`;
  }
  const exportChart = contractElement.getAttribute("data-export-chart");
  return exportChart ? `export:${exportChart}` : null;
}

function rectIntersectionArea(
  left: ChartFrameCandidate["rect"],
  right: ChartFrameCandidate["rect"],
) {
  const x1 = Math.max(left.x, right.x);
  const y1 = Math.max(left.y, right.y);
  const x2 = Math.min(left.x + left.w, right.x + right.w);
  const y2 = Math.min(left.y + left.h, right.y + right.h);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

function chartFrameCandidatesOverlap(left: ChartFrameCandidate, right: ChartFrameCandidate) {
  if (left.element.contains(right.element) || right.element.contains(left.element)) {
    return true;
  }
  const intersection = rectIntersectionArea(left.rect, right.rect);
  if (intersection <= 0) {
    return false;
  }
  const leftArea = Math.max(1, left.rect.w * left.rect.h);
  const rightArea = Math.max(1, right.rect.w * right.rect.h);
  return intersection / Math.min(leftArea, rightArea) > 0.6;
}

function isDirectHtmlStructuredChartFrameElement(element: HTMLElement) {
  return (
    hasStructuredChartContract(element) &&
    element.tagName.toLowerCase() !== "svg" &&
    Boolean(
      element.getAttribute("data-html-visual-id") ||
        element.getAttribute("data-html-visual-kind") === "chart-frame" ||
        element.getAttribute("data-html-module-kind") === "chart"
    )
  );
}

function chartFrameCandidatePriority(candidate: ChartFrameCandidate) {
  const contractElement = findChartContractElement(candidate.element);
  const hasContractDescendant = Boolean(contractElement && contractElement !== candidate.element);
  const structured = hasStructuredChartContract(candidate.element);
  const directHtmlFrame = isDirectHtmlStructuredChartFrameElement(candidate.element);
  const area = candidate.rect.w * candidate.rect.h;
  return (directHtmlFrame ? 4 : hasContractDescendant ? 3 : structured ? 2 : 1) * 1_000_000_000 + area;
}

function dedupeChartFrameCandidates(candidates: ChartFrameCandidate[]) {
  const deduped: ChartFrameCandidate[] = [];
  for (const candidate of candidates) {
    const fingerprint = chartFrameContractFingerprint(candidate);
    if (!fingerprint) {
      deduped.push(candidate);
      continue;
    }

    const duplicateIndex = deduped.findIndex(
      (existing) =>
        chartFrameContractFingerprint(existing) === fingerprint &&
        chartFrameCandidatesOverlap(existing, candidate),
    );
    if (duplicateIndex < 0) {
      deduped.push(candidate);
      continue;
    }

    const existing = deduped[duplicateIndex]!;
    if (chartFrameCandidatePriority(candidate) > chartFrameCandidatePriority(existing)) {
      deduped[duplicateIndex] = candidate;
    }
  }
  return deduped;
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

function semanticNativeTableHasData(element: HTMLElement) {
  if (readTableSpecFromElement(element)) {
    return true;
  }
  return Array.from(
    element.querySelectorAll<HTMLElement>(`[${HTML_TABLE_SPEC_ATTRIBUTE}],table`),
  ).some((candidate) => Boolean(readTableSpecFromElement(candidate)));
}

function exportObjectFromContract(
  contract: ExportObjectContract,
  element: HTMLElement,
): SemanticExportObject {
  return {
    objectId: contract.objectId,
    element,
    objectKind: contract.objectKind,
    renderTarget: contract.renderTarget,
    objectRole: contract.objectRole,
    snapshotBoundary: normalizeText(element.getAttribute("data-snapshot-boundary") ?? ""),
    forbiddenInterpretation: contract.forbiddenInterpretation,
    ownershipScope: {
      ownsText: contract.ownershipScope.ownsText,
      ownsShapes: contract.ownershipScope.ownsShapes,
      ownsSvg: contract.ownershipScope.ownsSvg,
    },
    contract,
  };
}

function candidateArea(pageElement: HTMLElement, element: HTMLElement) {
  const rect = measureElementRect(pageElement, element);
  return Math.max(0, rect.w) * Math.max(0, rect.h);
}

function preferredRootScore(pageElement: HTMLElement, element: HTMLElement) {
  const tagName = element.tagName.toLowerCase();
  const semanticWeight =
    tagName === "main"
      ? 1_000_000_000
      : element.hasAttribute("data-page-body")
        ? 900_000_000
        : element.hasAttribute("data-html-module-kind")
          ? 800_000_000
          : tagName === "figure" || tagName === "article"
            ? 700_000_000
            : element.hasAttribute("data-html-visual-kind")
              ? 600_000_000
              : 0;
  return semanticWeight + candidateArea(pageElement, element);
}

function largestPrimaryElement(pageElement: HTMLElement, selector: string) {
  const candidates = Array.from(pageElement.querySelectorAll<HTMLElement>(selector))
    .filter((element) => {
      const area = candidateArea(pageElement, element);
      return area > 0 && element !== pageElement;
    })
    .sort(
      (left, right) =>
        preferredRootScore(pageElement, right) - preferredRootScore(pageElement, left),
    );
  return candidates[0] ?? null;
}

function findFirstMatchingElement(pageElement: HTMLElement, selectors: string[]) {
  for (const selector of selectors) {
    if (pageElement.matches(selector)) {
      return pageElement;
    }
    const matched = pageElement.querySelector<HTMLElement>(selector);
    if (matched) {
      return matched;
    }
  }
  return null;
}

function findContractRootByDeclaredId(pageElement: HTMLElement, rootId: string) {
  const escaped = selectorEscape(rootId);
  return findFirstMatchingElement(pageElement, [
    `#${escaped}`,
    `[data-export-object-id="${escaped}"]`,
    `[data-export-root-id="${escaped}"]`,
    `[data-ownership-root-id="${escaped}"]`,
    `[data-semantic-root-id="${escaped}"]`,
    `[data-html-visual-id="${escaped}"]`,
    `[data-html-block-id="${escaped}"]`,
    `[data-html-module-id="${escaped}"]`,
  ]);
}

function primaryFallbackRoot(pageElement: HTMLElement) {
  return pageElement.querySelector<HTMLElement>("main,[data-page-body]") ?? pageElement;
}

function materializationSelectorsForKind(kind: ExportObjectKind) {
  if (kind === "chart-visual" || kind === "native-chart") {
    return [
      '[data-html-module-kind="chart"]',
      `[${HTML_CHART_SPEC_ATTRIBUTE}]`,
      '[data-html-visual-kind="chart-frame"]',
      "[data-export-chart]",
    ];
  }
  if (kind === "native-table") {
    return [
      `[${HTML_TABLE_SPEC_ATTRIBUTE}]`,
      `[data-html-module-kind="${TABLE_MODULE_KIND}"]`,
      "table",
    ];
  }
  if (kind === "diagram") {
    return [
      "[data-html-diagram-spec]",
      '[data-html-module-kind="scientific-diagram"]',
      '[data-html-visual-kind="structured-diagram"]',
      "figure",
      "article",
    ];
  }
  return [
    `[data-html-module-kind="${kind}"]`,
    `[data-html-visual-kind="${kind}"]`,
    "figure",
    "article",
  ];
}

function findExpectedContractRootElement(args: {
  pageElement: HTMLElement;
  contract: ExportObjectContract;
  claimedElements: Map<HTMLElement, SemanticExportObject>;
}) {
  const rootByDeclaredId = findContractRootByDeclaredId(
    args.pageElement,
    args.contract.ownershipScope.rootId || args.contract.objectId,
  );
  if (rootByDeclaredId) {
    return rootByDeclaredId;
  }

  const kindRoot = largestPrimaryElement(
    args.pageElement,
    materializationSelectorsForKind(args.contract.objectKind).join(","),
  );
  if (kindRoot && !args.claimedElements.has(kindRoot)) {
    return kindRoot;
  }

  if (args.contract.objectRole === "primary") {
    return primaryFallbackRoot(args.pageElement);
  }

  return null;
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

function tableSpecFromDataContract(contract: ExportDataContract): HtmlTableSpec | null {
  if (contract.type !== "table") {
    return null;
  }
  const columns = contract.columns.map((column, index) => ({
    id: column.id ?? `column-${index + 1}`,
    label: column.label,
    type: column.type ?? "text",
  }));
  return {
    raw: [
      columns.map((column) => column.label),
      ...contract.rows,
    ].map((row) => row.join("\t")).join("\n"),
    hasHeader: contract.headerPolicy !== "none",
    columns,
    rows: contract.rows,
  };
}

function shouldExportTableAsDomGeometry(element: HTMLElement, spec: HtmlTableSpec) {
  if (element.tagName.toLowerCase() === "table") {
    return false;
  }

  const columnCount = Math.max(spec.columns.length, ...spec.rows.map((row) => row.length), 1);
  const cells = spec.rows.flatMap((row) =>
    Array.from({ length: columnCount }, (_, index) => normalizeText(row[index] ?? "")),
  );
  const emptyRatio = cells.length
    ? cells.filter((cell) => !cell).length / cells.length
    : 0;
  const specText = normalizeMultilineText(
    [
      spec.raw,
      ...spec.columns.map((column) => column.label),
      ...spec.rows.flat(),
      element.getAttribute("data-html-module-label"),
    ].join("\n"),
  );
  const looksLikeQuadrant =
    (/重要性/.test(specText) && /确定性/.test(specText)) ||
    (/impact/i.test(specText) && /effort|confidence|certainty/i.test(specText)) ||
    /quadrant|matrix|2x2/i.test(specText);
  const hasPositionedVisualChildren = Array.from(element.querySelectorAll<HTMLElement>("*")).some((child) => {
    const style = child.getAttribute("style") ?? "";
    return /position\s*:\s*absolute/i.test(style);
  });

  return (
    looksLikeQuadrant &&
    spec.rows.length >= 6 &&
    columnCount <= 4 &&
    emptyRatio >= 0.35 &&
    hasPositionedVisualChildren
  );
}

function collectTableModels(args: {
  pageElement?: HTMLElement | null;
  theme: PptExportThemeSnapshot;
  warnings: PptExportWarning[];
  pageNumber: number;
  plan?: ExportPagePlan | null;
  semanticRegistry?: SemanticExportObjectRegistry;
}): TableCollectionResult {
  const tableNodes: PptExportTableModel[] = [];
  const skipVisualIds = new Set<string>();
  const skipTextElements: HTMLElement[] = [];
  const skipPrimitiveWithinElements: HTMLElement[] = [];
  const owners: ExportOwner[] = [];
  const themeTokens = buildChartThemeTokens(args.theme);
  const contractedTableRoots = new Set<HTMLElement>();
  const blockedByObjectIds = new Set<string>();
  if (args.pageElement && args.semanticRegistry) {
    for (const object of args.semanticRegistry.objects) {
      if (object.objectKind !== "native-table") {
        continue;
      }
      contractedTableRoots.add(object.element);
      const dataContract = validDataContractForSemanticObject({
        warnings: args.warnings,
        pageElement: args.pageElement,
        pageNumber: args.pageNumber,
        object,
      });
      const spec = dataContract ? tableSpecFromDataContract(dataContract) : null;
      if (!spec) {
        continue;
      }
      const rect = measureElementRect(args.pageElement, object.element);
      if (!rect.w || !rect.h) {
        continue;
      }
      const rows = normalizeTableRows(spec);
      const owner = createExportOwner({
        pageElement: args.pageElement,
        element: object.element,
        kind: "table",
        index: owners.length,
        ownsText: false,
        ownsShapes: false,
        ownsSvg: false,
      });
      owners.push(owner);
      claimExportOwnership({
        plan: args.plan,
        element: object.element,
        ownership: "table",
        ownerId: owner.id,
      });
      const ordering = nodeOrderingForElement({
        plan: args.plan,
        element: object.element,
        layerRole: "table",
      });
      tableNodes.push({
        kind: "table",
        sourceElementId: sourceElementIdForElement(args.pageElement, object.element, "table"),
        exportObjectId: object.objectId,
        sourceOrder: ordering.sourceOrder,
        zIndex: ordering.zIndex,
        zOrder: ordering.zOrder,
        layerRole: ordering.layerRole,
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
  }
  const tableElements = args.pageElement
    ? collectTableElements(args.pageElement).filter(
        (element) =>
          !Array.from(contractedTableRoots).some((root) => root.contains(element)),
      )
    : [];

  for (const [index, element] of tableElements.entries()) {
    const rect = args.pageElement ? measureElementRect(args.pageElement, element) : null;
    if (!rect?.w || !rect.h) {
      continue;
    }
    const semanticObject = closestSemanticExportObject(args.semanticRegistry, element);
    if (
      semanticObject &&
      semanticObjectBlocksNativeTarget(args.semanticRegistry, element, "native-table")
    ) {
      pushForbiddenInterpretationBlockedDiagnostic({
        warnings: args.warnings,
        pageElement: args.pageElement!,
        pageNumber: args.pageNumber,
        element,
        object: semanticObject,
        interpretation: "native-table",
        sourceKind: "table",
        blockedByObjectIds,
      });
      continue;
    }
    if (semanticObject && semanticObject.objectKind !== "native-table") {
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

    if (shouldExportTableAsDomGeometry(element, spec)) {
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

    if (!semanticObject) {
      pushUnlabeledFallbackDiagnostic({
        warnings: args.warnings,
        pageNumber: args.pageNumber,
        sourceId: sourceElementIdForElement(args.pageElement!, element, "table"),
        sourceKind: "table",
        message: `Unlabeled table-like object on page ${args.pageNumber} used legacy fallback recognition.`,
      });
    }

    skipTextElements.push(element);
    skipPrimitiveWithinElements.push(element);
    const visualId = element.getAttribute("data-html-visual-id");
    if (visualId) {
      skipVisualIds.add(visualId);
    }
    if (args.pageElement) {
      const owner = createExportOwner({
        pageElement: args.pageElement,
        element,
        kind: "table",
        index,
        ownsText: false,
        ownsShapes: false,
        ownsSvg: false,
      });
      owners.push(owner);
      claimExportOwnership({
        plan: args.plan,
        element,
        ownership: "table",
        ownerId: owner.id,
      });
    }

    const ordering = nodeOrderingForElement({
      plan: args.plan,
      element,
      layerRole: "table",
    });
    tableNodes.push({
      kind: "table",
      sourceElementId: sourceElementIdForElement(args.pageElement!, element, "table"),
      exportObjectId: semanticObject?.objectId,
      sourceOrder: ordering.sourceOrder,
      zIndex: ordering.zIndex,
      zOrder: ordering.zOrder,
      layerRole: ordering.layerRole,
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
    owners: dedupeOwners(owners),
  };
}

function buildSemanticExportInspectionTheme(): PptExportThemeSnapshot {
  return {
    backgroundColor: DEFAULT_BACKGROUND,
    surfaceFill: DEFAULT_SURFACE_FILL,
    surfaceSecondary: "F6F6F6",
    dividerColor: DEFAULT_DIVIDER,
    accent: DEFAULT_ACCENT,
    textPrimary: DEFAULT_TEXT,
    textMuted: DEFAULT_BODY,
    chartPalette: [DEFAULT_ACCENT],
  };
}

export function inspectSemanticExportChartsForPage(args: {
  pageElement: HTMLElement;
  pageNumber: number;
  scene?: SlideScene;
  expectedContracts?: readonly ExportObjectContract[] | null;
}) {
  const warnings: PptExportWarning[] = [];
  const semanticRegistry = collectSemanticExportObjects({
    pageElement: args.pageElement,
    pageNumber: args.pageNumber,
    warnings,
    expectedContracts: args.expectedContracts,
  });
  const chartCollection = collectChartModels({
    pageElement: args.pageElement,
    theme: buildSemanticExportInspectionTheme(),
    scene: args.scene,
    warnings,
    pageNumber: args.pageNumber,
    semanticRegistry,
  });
  return {
    warnings,
    chartNodes: chartCollection.chartNodes,
    objects: semanticRegistry.objects.map((object) => ({
      objectId: object.objectId,
      objectKind: object.objectKind,
      renderTarget: object.renderTarget,
    })),
  };
}

export function inspectSemanticExportTablesForPage(args: {
  pageElement: HTMLElement;
  pageNumber: number;
  expectedContracts?: readonly ExportObjectContract[] | null;
}) {
  const warnings: PptExportWarning[] = [];
  const semanticRegistry = collectSemanticExportObjects({
    pageElement: args.pageElement,
    pageNumber: args.pageNumber,
    warnings,
    expectedContracts: args.expectedContracts,
  });
  const tableCollection = collectTableModels({
    pageElement: args.pageElement,
    theme: buildSemanticExportInspectionTheme(),
    warnings,
    pageNumber: args.pageNumber,
    semanticRegistry,
  });
  return {
    warnings,
    tableNodes: tableCollection.tableNodes,
    objects: semanticRegistry.objects.map((object) => ({
      objectId: object.objectId,
      objectKind: object.objectKind,
      renderTarget: object.renderTarget,
    })),
  };
}

export function inspectPptxExportAnnotationsForPage(args: {
  pageElement: HTMLElement;
  pageNumber: number;
  expectedContracts?: readonly ExportObjectContract[] | null;
  expectedPageContract?: PageExportContract | null;
}) {
  const warnings: PptExportWarning[] = [];
  const iframe = args.pageElement.ownerDocument.createElement("iframe");
  pushPageVisualGrammarDiagnostics({
    pageContract: args.expectedPageContract,
    frame: {
      iframe,
      document: args.pageElement.ownerDocument,
      pageElement: args.pageElement,
      pageNumber: args.pageNumber,
    },
    pageNumber: args.pageNumber,
    warnings,
  });
  const annotations = collectExportAnnotations({
    frame: {
      iframe,
      document: args.pageElement.ownerDocument,
      pageElement: args.pageElement,
      pageNumber: args.pageNumber,
    },
    pageVisualStyle: {
      pageBackground: "#ffffff",
      dividerColor: "#dddddd",
      surfaceFill: "#ffffff",
      accentColor: "#305c63",
    },
    warnings,
    pageNumber: args.pageNumber,
    expectedExportObjectContracts: args.expectedContracts,
  });
  return {
    warnings,
    textNodes: annotations.textNodes,
    shapeNodes: annotations.shapeNodes,
    chartNodes: annotations.chartNodes,
    tableNodes: annotations.tableNodes,
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
  owners?: ExportOwner[];
  plan?: ExportPagePlan | null;
  warnings: PptExportWarning[];
  pageNumber: number;
}) {
  const shapeNodes: PptExportVisualNode[] = [];
  const view = args.pageElement.ownerDocument.defaultView;
  const annotatedVisualElements = collectVisualShapeElements(args.pageElement, args.skipVisualIds);
  const orderForElement = createDomOrderResolver(args.pageElement);

  if (!view) {
    return shapeNodes;
  }

  const visualElements = [
    ...annotatedVisualElements,
    ...collectOwnerPrimitiveShapeElements({
      pageElement: args.pageElement,
      owners: args.owners,
      view,
      existingElements: annotatedVisualElements,
      plan: args.plan,
    }),
  ];

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
    const record = recordForElement(args.plan, element);
    if (record && !record.visible) {
      if (record.hiddenByPlaceholder && args.plan) {
        warnHiddenPlaceholder(args.plan, element);
      }
      claimExportOwnership({
        plan: args.plan,
        element,
        ownership: "omit",
        reason: "hidden",
      });
      continue;
    }

    const nodeKind = element.getAttribute("data-html-visual-kind") ?? "surface";
    const role = readAttribute(element, "data-export-role") ?? nodeKind;
    if (role === "decorative") {
      claimExportOwnership({
        plan: args.plan,
        element,
        ownership: "owner-only",
        reason: "decorative",
      });
      continue;
    }
    const owner = resolveOwnerForElement(element, args.owners);

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
    const hasComputedBorder = Boolean(computedBorderPaint && computedBorderWidth > 0);
    const borderPaint = hasComputedBorder ? computedBorderPaint : null;
    const borderWidth =
      hasComputedBorder && Number.isFinite(computedBorderWidth)
        ? computedBorderWidth
        : 0;
    const borderRadius = resolveBorderRadiusPx(computed, rect);
    const opacity = clamp(Number.parseFloat(computed.opacity || "1") || 1, 0, 1);
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

    claimExportOwnership({
      plan: args.plan,
      element,
      ownership: "visual-shape",
    });

    const ordering = nodeOrderingForElement({
      plan: args.plan,
      element,
      layerRole: "shape",
      offset: lineLike ? 1 : 0,
    });

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
      sourceElementId: sourceElementIdForElement(args.pageElement, element, "shape"),
      ownerId: owner?.id,
      ownerKind: owner?.kind,
      sourceOrder: ordering.sourceOrder ?? orderForElement(element),
      zIndex: ordering.zIndex ?? numericZIndex(view, element, args.pageElement),
      zOrder: ordering.zOrder,
      layerRole: ordering.layerRole,
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
      owners: args.owners,
      orderForElement,
    }),
  ].sort((left, right) => {
    const zDelta = (left.zIndex ?? 0) - (right.zIndex ?? 0);
    if (zDelta !== 0) {
      return zDelta;
    }
    return (left.sourceOrder ?? 0) - (right.sourceOrder ?? 0);
  });
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
        chartContract: {
          family: isSupportedChartFamily(args.chart.chartKind) ? args.chart.chartKind : "bar",
          confidence: "high",
          source: "scene",
          reasonCodes: ["scene-chart-data", "minimum-data-ok"],
          ownerElementIds: [],
          nativeEligibility: "visual-snapshot",
          diagnostics: [],
        },
        labels,
        series,
        title: normalizeText(args.chart.title ?? "") || undefined,
        subtitle: normalizeText(args.chart.body ?? "") || undefined,
        xAxisTitle: chartData.xAxisTitle,
        yAxisTitle: chartData.yAxisTitle,
        valueAxisMin: undefined,
        valueAxisMax: undefined,
        colors: series.map((item) => item.color).filter((item): item is string => Boolean(item)),
        renderMode: "image",
        fallbackMode: "visual-chart-snapshot",
      };
    }
  }

  if (args.chart.series.length) {
    return {
      chartKind: (args.chart.chartKind === "line" ? "line" : args.chart.chartKind) as Extract<
        ModuleChartKind,
        "bar" | "stacked" | "line" | "waterfall"
      >,
      chartContract: {
        family: isSupportedChartFamily(args.chart.chartKind) ? args.chart.chartKind : "bar",
        confidence: "medium",
        source: "scene",
        reasonCodes: ["scene-series-values", "minimum-data-ok"],
        ownerElementIds: [],
        nativeEligibility: "visual-snapshot",
        diagnostics: [],
      },
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
      renderMode: "image",
      fallbackMode: "visual-chart-snapshot",
    };
  }

  pushChartContractDiagnostic({
    warnings: args.warnings,
    pageNumber: args.pageNumber,
    contract: blockedChartContractFromKind({
      kind: args.chart.chartKind,
      source: "scene",
      reason: "missing-data",
      diagnostic: "Scene chart object lacked categories/series data.",
    }),
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
  plan?: ExportPagePlan | null;
  semanticRegistry?: SemanticExportObjectRegistry;
}): ChartCollectionResult {
  const chartNodes: PptExportChartModel[] = [];
  const textNodes: PptExportTextNode[] = [];
  const skipVisualIds = new Set<string>();
  const skipTextElements: HTMLElement[] = [];
  const skipPrimitiveWithinElements: HTMLElement[] = [];
  const owners: ExportOwner[] = [];
  const contractedChartRoots = new Set(
    (args.semanticRegistry?.objects ?? [])
      .filter((object) => object.objectKind === "chart-visual" || object.objectKind === "native-chart" || object.objectKind === "matrix")
      .map((object) => object.element),
  );
  const semanticRoots = new Set((args.semanticRegistry?.objects ?? []).map((object) => object.element));
  const chartFrames = args.pageElement
    ? collectChartFrames({
        pageElement: args.pageElement,
        pageNumber: args.pageNumber,
        warnings: args.warnings,
        semanticRegistry: args.semanticRegistry,
      }).filter(
        (frame) =>
          !Array.from(contractedChartRoots).some((root) => root.contains(frame.element)) &&
          !Array.from(semanticRoots).some((root) => root !== frame.element && root.contains(frame.element)),
      )
    : [];
  const sceneCharts = (args.scene?.objects ?? []).filter(
    (object): object is SlideSceneChartObject => object.kind === "chart",
  );
  const consumedChartFrameElements = new Set<Element>();
  const consumedChartFrameRects: RectPx[] = [];
  const emittedChartContractFingerprints = new Set<string>();
  const consumedSceneCharts = new Set<SlideSceneChartObject>();
  const themeTokens = buildChartThemeTokens(args.theme);
  let addNativeChart: (
    normalized: NormalizedChartContract,
    frame: ChartFrameCandidate | null,
    sceneChart?: SlideSceneChartObject,
  ) => void;

  const consumeChartFrame = (frame: ChartFrameCandidate) => {
    consumedChartFrameElements.add(frame.element);
    consumedChartFrameRects.push(frame.rect);
  };

  const markEmittedChartFrame = (frame: ChartFrameCandidate) => {
    const fingerprint = chartFrameContractFingerprint(frame);
    if (fingerprint) {
      emittedChartContractFingerprints.add(fingerprint);
    }
  };

  const addFrameOwner = (
    frame: ChartFrameCandidate,
    chartKind?: SupportedNativeChartKind,
    ownerElement: HTMLElement = frame.element,
    ownsTextOverride?: boolean,
  ) => {
    if (!args.pageElement) {
      return null;
    }
    const ownsChartDom = ownsTextOverride ?? (!chartKind || chartKind === "matrix");
    const owner = createExportOwner({
      pageElement: args.pageElement,
      element: ownerElement,
      kind: chartKind === "matrix" ? "matrix" : "chart",
      idPrefix: frame.visualId,
      index: owners.length,
      ownsText: ownsChartDom,
      ownsShapes: ownsChartDom || !chartKind || chartKind === "matrix",
      ownsSvg: ownsChartDom || !chartKind || chartKind === "matrix",
    });
    if (!owners.some((existing) => existing.element === owner.element)) {
      owners.push(owner);
    }
    claimExportOwnership({
      plan: args.plan,
      element: ownerElement,
      ownership: "visual-shape",
      ownerId: owner.id,
    });
    return owner;
  };

  const visualFallbackNormalizedFromFrame = (frame: ChartFrameCandidate): NormalizedChartContract => {
    const contract =
      classifyUnstructuredChartElement(frame.element) ??
      blockedChartContractFromKind({
        kind: parseHtmlChartSpec(frame.element.getAttribute(HTML_CHART_SPEC_ATTRIBUTE))?.kind,
        source: hasStructuredChartContract(frame.element) ? "spec" : "text-layout",
        reason: "missing-data",
        diagnostic: "Chart frame could not be normalized into a supported export contract.",
      });
    pushChartContractDiagnostic({
      warnings: args.warnings,
      pageNumber: args.pageNumber,
      sourceId: frame.visualId,
      contract,
      message:
        contract.nativeEligibility === "blocked"
          ? `Chart-like object on page ${args.pageNumber} did not expose native chart data and will export as a visual snapshot: ${
              contract.blockedReason ?? "missing-data"
            }.`
          : undefined,
    });
    const chartKind =
      isSupportedChartFamily(contract.family) && contract.family !== "matrix"
        ? contract.family
        : "bar";
    return {
      chartKind,
      chartContract: contract,
      labels: [],
      series: [],
      colors: [],
      renderMode: "image",
      fallbackMode: "visual-chart-snapshot",
    };
  };

  const matrixVisualSnapshotNormalizedFromObject = (object: SemanticExportObject): NormalizedChartContract => ({
    chartKind: "matrix",
    chartContract: {
      family: "matrix",
      confidence: "medium",
      source: "data-contract",
      reasonCodes: ["matrix-missing-data", "dom-snapshot-fallback"],
      ownerElementIds: [],
      nativeEligibility: "visual-snapshot",
      blockedReason: "missing-data",
      diagnostics: [
        `Matrix object ${object.objectId} declared missing-data, so PPTX export preserved the rendered DOM as a PNG snapshot.`,
      ],
    },
    labels: [],
    series: [],
    colors: [],
    renderMode: "image",
    fallbackMode: "visual-chart-snapshot",
  });

  const skipUnsupportedFrame = (frame: ChartFrameCandidate) => {
    pushUnlabeledFallbackDiagnostic({
      warnings: args.warnings,
      pageNumber: args.pageNumber,
      sourceId: frame.visualId,
      sourceKind: "chart",
      message: `Unlabeled chart-like object on page ${args.pageNumber} used legacy fallback recognition.`,
    });
    addNativeChart(
      visualFallbackNormalizedFromFrame(frame),
      frame,
    );
  };

  const normalizeChartFrame = (frame: ChartFrameCandidate) => {
    const frameContractElement = findChartContractElement(frame.element) ?? frame.element;
    const parsed = parseExportChartData(frameContractElement);
    return (
      normalizeChartContractFromElement({
        element: frameContractElement,
        warnings: args.warnings,
        pageNumber: args.pageNumber,
      }) ??
      (parsed
        ? normalizeChartContractFromParsed({
            parsed,
            warnings: args.warnings,
            pageNumber: args.pageNumber,
          })
        : null)
    );
  };

  addNativeChart = (
    normalized: NormalizedChartContract,
    frame: ChartFrameCandidate | null,
    sceneChart?: SlideSceneChartObject,
  ) => {
    const isMatrix = normalized.chartKind === "matrix";
    const rendersNativeMatrix = isMatrix && normalized.renderMode === "native";
    const rendersVisualSnapshot = normalized.renderMode === "image";
    const semanticSpec = rendersNativeMatrix ? semanticSpecFromNormalizedChart(normalized) : undefined;
    const chartSemanticObject = frame
      ? closestSemanticExportObject(
          args.semanticRegistry,
          findChartContractElement(frame.element) ?? frame.element,
        )
      : null;
    const resolvedSnapshotTarget =
      frame && args.pageElement && rendersVisualSnapshot
        ? resolveVisualChartSnapshotTarget({
            pageElement: args.pageElement,
            frame,
            semanticObject: chartSemanticObject,
            warnings: args.warnings,
            pageNumber: args.pageNumber,
          })
        : null;
    const snapshotTarget =
      frame && args.pageElement && rendersVisualSnapshot && resolvedSnapshotTarget
        ? alignSnapshotTargetToChartKind({
            pageElement: args.pageElement,
            frame,
            target: resolvedSnapshotTarget,
            chartKind: normalized.chartKind,
          })
        : resolvedSnapshotTarget;
    const chartRect =
      frame && args.pageElement
        ? snapshotTarget?.rect ?? frame.rect
        : null;
    const sourceElement = snapshotTarget?.element ?? frame?.element ?? null;
    const sourceId = frame
      ? sourceElementIdForElement(args.pageElement!, sourceElement!, "chart")
      : normalized.title ?? sceneChart?.title ?? `chart-${chartNodes.length + 1}`;
    const fallbackAsset =
      frame && args.pageElement && rendersVisualSnapshot && snapshotTarget
        ? buildVisualChartSnapshotAsset({
            pageElement: args.pageElement,
            element: snapshotTarget.element,
            rect: snapshotTarget.rect,
            warnings: args.warnings,
            pageNumber: args.pageNumber,
            sourceId,
            exportObjectId: chartSemanticObject?.objectId,
            exportObjectKind: chartSemanticObject?.objectKind,
            exportRenderTarget: chartSemanticObject?.renderTarget,
          })
        : null;

    if (rendersVisualSnapshot && !fallbackAsset) {
      if (!frame) {
        args.warnings.push({
          code: "visual-chart-snapshot-missing",
          severity: "fatal",
          countsAgainstQuality: true,
          pageNumber: args.pageNumber,
          sourceId,
          sourceKind: "chart",
          exportObjectId: chartSemanticObject?.objectId,
          exportObjectKind: chartSemanticObject?.objectKind,
          exportRenderTarget: chartSemanticObject?.renderTarget,
          message: `Chart on page ${args.pageNumber} did not have a rendered DOM root for visual snapshot export.`,
        });
      }
      return;
    }
    const chartContract = completeExportChartContract(normalized.chartContract, {
      bounds: pxRectToInches(chartRect ?? frame?.rect ?? {
        x: sceneChart?.x ?? 0,
        y: sceneChart?.y ?? 0,
        w: sceneChart?.w ?? 0,
        h: sceneChart?.h ?? 0,
      }),
      ownerElementIds: [
        frame
          ? sourceElementIdForElement(args.pageElement!, sourceElement!, "chart")
          : normalized.title ?? sceneChart?.title ?? `chart-${chartNodes.length + 1}`,
      ],
      nativeEligibility: rendersNativeMatrix ? "matrix-shapes" : "visual-snapshot",
    });
    if (frame) {
      const plotElement =
        args.pageElement && !rendersNativeMatrix
          ? findChartPlotElement(frame.element)
          : null;
      const directChartElement = !plotElement && !rendersNativeMatrix;
      if (rendersVisualSnapshot) {
        const snapshotElement = snapshotTarget?.element ?? frame.element;
        const snapshotElementOwnsStructuredText =
          normalized.chartKind !== "combo" &&
          normalized.chartKind !== "matrix" &&
          (hasStructuredChartContract(snapshotElement) ||
            Boolean(parseExportChartData(snapshotElement)) ||
            hasExplicitVisualChartSnapshotContract(
              {
                ...frame,
                element: snapshotElement,
              },
              chartSemanticObject,
            ));
        if (!snapshotElementOwnsStructuredText) {
          skipTextElements.push(snapshotElement);
        }
        skipPrimitiveWithinElements.push(snapshotElement);
        const snapshotVisualId = snapshotElement.getAttribute("data-html-visual-id");
        if (snapshotVisualId) {
          skipVisualIds.add(snapshotVisualId);
        } else if (snapshotElement === frame.element && frame.visualId) {
          skipVisualIds.add(frame.visualId);
        }
        addFrameOwner(frame, normalized.chartKind, snapshotElement, snapshotElementOwnsStructuredText);
      } else if (plotElement) {
        skipTextElements.push(plotElement);
        skipPrimitiveWithinElements.push(plotElement);
        const plotVisualId = plotElement.getAttribute("data-html-visual-id");
        if (plotVisualId) {
          skipVisualIds.add(plotVisualId);
        }
      } else if (directChartElement) {
        skipPrimitiveWithinElements.push(frame.element);
        if (frame.visualId) {
          skipVisualIds.add(frame.visualId);
        }
      } else if (rendersNativeMatrix) {
        skipTextElements.push(frame.element);
      }
      const keepOverlayText =
        directChartElement || normalized.chartKind === "bubble" || normalized.chartKind === "waterfall";
      if (rendersNativeMatrix) {
        addFrameOwner(
          frame,
          normalized.chartKind,
          plotElement ?? frame.element,
          keepOverlayText ? true : undefined,
        );
      }
    }
    const layerRole: PptExportLayerRole = "chart";
    const ordering =
      frame && args.pageElement
        ? nodeOrderingForElement({
            plan: args.plan,
            element: sourceElement ?? frame.element,
            layerRole,
          })
        : {
            sourceOrder: sceneChart ? sceneCharts.indexOf(sceneChart) + 1 : chartNodes.length + 1,
            zIndex: 0,
            layerRole,
            zOrder: layerZOrder({
              layerRole,
              sourceOrder: sceneChart ? sceneCharts.indexOf(sceneChart) + 1 : chartNodes.length + 1,
            }),
          };
    const shouldAddHeadingText = rendersNativeMatrix && frame
      ? shouldRenderInlineHeadingForNativeChart(frame, normalized)
      : false;
    if (shouldAddHeadingText && frame && args.pageElement) {
      const title = normalizeText(normalized.title ?? "");
      const subtitle = normalizeText(normalized.subtitle ?? "");
      const headingOrdering = nodeOrderingForElement({
        plan: args.plan,
        element: frame.element,
        layerRole: "text",
        offset: 6,
      });
      const headingSourceId = sourceElementIdForElement(args.pageElement, frame.element, "chart-heading");
      if (title) {
        textNodes.push({
          kind: "text",
          sourceElementId: `${headingSourceId}:title`,
          ownerKind: "chart",
          sourceOrder: headingOrdering.sourceOrder,
          zIndex: headingOrdering.zIndex,
          zOrder: headingOrdering.zOrder,
          layerRole: headingOrdering.layerRole,
          x: pxToInches(frame.rect.x),
          y: pxToInches(frame.rect.y),
          w: pxToInches(frame.rect.w),
          h: pxToInches(30),
          text: title,
          fontSize: pxFontToPoints(18),
          fontFamily: "Iowan Old Style",
          color: args.theme.textPrimary,
          bold: true,
          fillColor: null,
        });
      }
      if (subtitle) {
        textNodes.push({
          kind: "text",
          sourceElementId: `${headingSourceId}:subtitle`,
          ownerKind: "chart",
          sourceOrder: (headingOrdering.sourceOrder ?? 0) + 1,
          zIndex: headingOrdering.zIndex,
          zOrder: headingOrdering.zOrder,
          layerRole: headingOrdering.layerRole,
          x: pxToInches(frame.rect.x),
          y: pxToInches(frame.rect.y + 34),
          w: pxToInches(frame.rect.w),
          h: pxToInches(24),
          text: subtitle,
          fontSize: pxFontToPoints(13),
          fontFamily: "Avenir Next",
          color: args.theme.textMuted,
          bold: false,
          fillColor: null,
        });
      }
    }
    if (frame && !chartSemanticObject && normalized.chartContract.source !== "data-contract") {
      pushUnlabeledFallbackDiagnostic({
        warnings: args.warnings,
        pageNumber: args.pageNumber,
        sourceId: frame.visualId,
        sourceKind: normalized.chartKind === "matrix" ? "matrix" : "chart",
        message: `Unlabeled chart-like object on page ${args.pageNumber} used legacy fallback recognition.`,
      });
    }
    chartNodes.push({
      kind: "chart",
      sourceElementId: sourceId,
      exportObjectId: chartSemanticObject?.objectId,
      sourceOrder: ordering.sourceOrder,
      zIndex: ordering.zIndex,
      zOrder: ordering.zOrder,
      layerRole: ordering.layerRole,
      renderMode: normalized.renderMode,
      x: pxToInches(chartRect?.x ?? frame?.rect.x ?? sceneChart?.x ?? 0),
      y: pxToInches(chartRect?.y ?? frame?.rect.y ?? sceneChart?.y ?? 0),
      w: pxToInches(chartRect?.w ?? frame?.rect.w ?? sceneChart?.w ?? 0),
      h: pxToInches(chartRect?.h ?? frame?.rect.h ?? sceneChart?.h ?? 0),
      title: normalized.title ?? sceneChart?.title,
      subtitle: normalized.subtitle ?? sceneChart?.body,
      insight: normalized.insight,
      layoutRole: frame ? inferChartLayoutRole(frame) : "chart-panel",
      fallbackMode: isMatrix ? normalized.fallbackMode : "visual-chart-snapshot",
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
      style: normalized.style,
      showInlineHeading: frame ? false : normalized.showInlineHeading,
      showNativeVisual: rendersNativeMatrix,
      themeTokens,
      chartContract,
      fallbackAsset: fallbackAsset ?? undefined,
    });
    pushChartContractDiagnostic({
      warnings: args.warnings,
      pageNumber: args.pageNumber,
      sourceId: frame?.visualId,
      contract: chartContract,
    });
    args.warnings.push({
      code: rendersNativeMatrix ? "native-chart-exported" : "visual-chart-exported",
      severity: "success",
      countsAgainstQuality: false,
      pageNumber: args.pageNumber,
      sourceId: frame?.visualId,
      sourceKind: isMatrix ? "matrix" : "chart",
      exportObjectId: chartSemanticObject?.objectId,
      exportObjectKind: chartSemanticObject?.objectKind,
      exportRenderTarget: chartSemanticObject?.renderTarget,
      message: rendersNativeMatrix
        ? `Matrix on page ${args.pageNumber} exported as editable PowerPoint shapes.`
        : isMatrix
          ? `Matrix on page ${args.pageNumber} exported as a stable visual snapshot because executable matrix data was unavailable.`
          : `Chart on page ${args.pageNumber} exported as a stable visual snapshot.`,
    });
    if (frame && rendersNativeMatrix) {
      args.warnings.push({
        code: "native-chart-visible",
        severity: "success",
        countsAgainstQuality: false,
        pageNumber: args.pageNumber,
        sourceId: frame.visualId,
        sourceKind: "matrix",
        message: `Matrix visible layer on page ${args.pageNumber} is rendered as editable PowerPoint shapes.`,
      });
    }
  };

  if (args.pageElement && args.semanticRegistry) {
    for (const object of args.semanticRegistry.objects) {
      if (object.objectKind === "chart-visual") {
        const frame = {
          visualId: object.objectId,
          element: object.element,
          rect: measureElementRect(args.pageElement, object.element),
        };
        const validation = validateExportDataContract(object.contract?.dataContract);
        const normalized =
          validation.ok && validation.contract.type.startsWith("chart-")
            ? normalizeChartContractFromDataContract({
                dataContract: validation.contract,
                pageNumber: args.pageNumber,
                warnings: args.warnings,
              })
            : null;
        consumeChartFrame(frame);
        addNativeChart(normalized ?? visualFallbackNormalizedFromFrame(frame), frame);
        continue;
      }
      if (object.objectKind !== "native-chart" && object.objectKind !== "matrix") {
        continue;
      }
      const frame = {
        visualId: object.objectId,
        element: object.element,
        rect: measureElementRect(args.pageElement, object.element),
      };

      if (object.objectKind === "matrix") {
        const validation = validateExportDataContract(object.contract?.dataContract);
        const canUseRenderedSnapshotFallback =
          object.renderTarget === "editable-shapes" &&
          !validation.ok &&
          (
            validation.code === "export-data-contract-missing" ||
            (
              validation.code === "export-data-contract-minimum-data-missing" &&
              validation.type === "missing-data"
            )
          ) &&
          renderedMatrixObjectHasSnapshotSurface(args.pageElement, object.element);
        if (canUseRenderedSnapshotFallback) {
          consumeChartFrame(frame);
          addNativeChart(matrixVisualSnapshotNormalizedFromObject(object), frame);
          continue;
        }
        if (!validation.ok || !dataContractCompatibleWithSemanticObject(object, validation.contract)) {
          pushSemanticObjectDataContractValidationFailure({
            warnings: args.warnings,
            pageElement: args.pageElement,
            pageNumber: args.pageNumber,
            object,
            validation,
          });
          continue;
        }
        const normalized = normalizeChartContractFromDataContract({
          dataContract: validation.contract,
          pageNumber: args.pageNumber,
          warnings: args.warnings,
        });
        if (!normalized) {
          continue;
        }
        consumeChartFrame(frame);
        addNativeChart(normalized, frame);
        continue;
      }

      const dataContract = validDataContractForSemanticObject({
        warnings: args.warnings,
        pageElement: args.pageElement,
        pageNumber: args.pageNumber,
        object,
      });
      if (!dataContract) {
        continue;
      }
      const normalized = normalizeChartContractFromDataContract({
        dataContract,
        pageNumber: args.pageNumber,
        warnings: args.warnings,
      });
      if (!normalized) {
        continue;
      }
      consumeChartFrame(frame);
      addNativeChart(normalized, frame);
    }
  }

  chartFrames.forEach((frame) => {
    const normalized = normalizeChartFrame(frame);
    if (normalized) {
      const sceneChart = findSupplementalSceneChartForFrame({
        normalized,
        frame,
        sceneCharts,
        consumedSceneCharts,
      });
      if (sceneChart) {
        consumedSceneCharts.add(sceneChart);
        pushDomSceneMismatchDiagnostic({
          warnings: args.warnings,
          pageNumber: args.pageNumber,
          frame,
          normalized,
          sceneChart,
        });
      }
      consumeChartFrame(frame);
      const beforeCount = chartNodes.length;
      addNativeChart(applySceneChartTextFallback(normalized, sceneChart), frame, sceneChart ?? undefined);
      if (chartNodes.length > beforeCount) {
        markEmittedChartFrame(frame);
      }
      return;
    }

    consumeChartFrame(frame);
    skipUnsupportedFrame(frame);
  });

  if (args.pageElement) {
    const view = args.pageElement.ownerDocument.defaultView;
    const directStructuredElements = Array.from(
      args.pageElement.querySelectorAll<HTMLElement>(`[${HTML_CHART_SPEC_ATTRIBUTE}],[data-export-chart]`),
    );
    directStructuredElements.forEach((element, index) => {
      const semanticObject = closestSemanticExportObject(args.semanticRegistry, element);
      if (semanticObject && semanticObject.element !== element) {
        return;
      }
      if (
        semanticObject &&
        semanticObject.objectKind !== "chart-visual" &&
        semanticObject.objectKind !== "native-chart" &&
        semanticObject.objectKind !== "matrix"
      ) {
        return;
      }
      const visibleSvgWrapper = resolveVisibleSvgSnapshotWrapper(args.pageElement!, element);
      if (element.tagName.toLowerCase() === "svg" && !visibleSvgWrapper) {
        return;
      }
      const frameElement = visibleSvgWrapper?.element ?? resolveDirectChartFrameElement(element);
      const frame: ChartFrameCandidate = {
        visualId: sourceElementIdForElement(args.pageElement!, frameElement, `chart-direct-${index + 1}`),
        element: frameElement,
        rect: measureElementRect(args.pageElement!, frameElement),
      };
      const fingerprint = chartFrameContractFingerprint(frame);
      if (fingerprint && emittedChartContractFingerprints.has(fingerprint)) {
        return;
      }
      if (
        view &&
        isHiddenForExport({
          element,
          pageElement: args.pageElement!,
          view,
        }).hidden
      ) {
        return;
      }
      if (frame.rect.w < 180 || frame.rect.h < 110) {
        return;
      }
      const normalized = normalizeChartFrame(frame);
      if (!normalized) {
        return;
      }
      consumeChartFrame(frame);
      const beforeCount = chartNodes.length;
      addNativeChart(normalized, frame);
      if (chartNodes.length > beforeCount) {
        markEmittedChartFrame(frame);
      }
    });
  }

  sceneCharts.forEach((chart) => {
    if (consumedSceneCharts.has(chart)) {
      return;
    }
    const overlapsConsumedFrame = consumedChartFrameRects.some(
      (rect) => rectOverlapRatio(rect, sceneChartRect(chart)) > 0.55,
    );
    if (overlapsConsumedFrame) {
      consumedSceneCharts.add(chart);
      return;
    }
    const sceneNormalized = normalizeSceneChartDataModel({
      chart,
      warnings: args.warnings,
      pageNumber: args.pageNumber,
    });
    if (sceneNormalized) {
      addNativeChart(sceneNormalized, null, chart);
    }
  });

  if (args.pageElement && chartNodes.length === 0) {
    const pageText = normalizeMultilineText(args.pageElement.innerText || args.pageElement.textContent || "");
    const chartLedWithoutContract =
      /\bchart-led\b/i.test(pageText) ||
      /\bwhat\s+the\s+(?:chart|range|plot)\s+says\b/i.test(pageText) ||
      /\b(?:illustrative|primary|native|figure-first)\s+(?:chart|plot|line|range|proof)\b/i.test(pageText) ||
      /\b(?:monetization evidence wall|matrix view|chart view)\b/i.test(pageText);
    if (chartLedWithoutContract) {
      pushUnlabeledFallbackDiagnostic({
        warnings: args.warnings,
        pageNumber: args.pageNumber,
        sourceKind: "chart",
        message: `Chart-led page ${args.pageNumber} had no semantic chart data contract and used legacy fallback diagnostics.`,
      });
      pushChartContractDiagnostic({
        warnings: args.warnings,
        pageNumber: args.pageNumber,
        contract: blockedChartContractFromKind({
          kind: "unknown",
          source: "text-layout",
          reason: "missing-data",
          diagnostic: "Page promised a chart-led proof surface but no exportable chart contract was produced.",
        }),
        message: `Page ${args.pageNumber} looks chart-led, but PPTX export found no native chart or matrix-shape chart contract.`,
      });
    }
  }

  return {
    chartNodes,
    textNodes: dedupeTextNodes(textNodes),
    skipVisualIds,
    owners: dedupeOwners(owners),
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
  expectedExportObjectContract?: ExportObjectContract | null;
  expectedExportObjectContracts?: readonly ExportObjectContract[] | null;
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

  const plan = createExportPagePlan({
    pageElement: args.frame.pageElement,
    pageNumber: args.pageNumber,
    warnings: args.warnings,
  });
  const semanticRegistry = collectSemanticExportObjects({
    pageElement: args.frame.pageElement,
    pageNumber: args.pageNumber,
    warnings: args.warnings,
    expectedContract: args.expectedExportObjectContract,
    expectedContracts: args.expectedExportObjectContracts,
  });
  const chartCollection = collectChartModels({
    pageElement: args.frame.pageElement,
    theme,
    scene: args.scene,
    warnings: args.warnings,
    pageNumber: args.pageNumber,
    plan,
    semanticRegistry,
  });
  const tableCollection = collectTableModels({
    pageElement: args.frame.pageElement,
    theme,
    warnings: args.warnings,
    pageNumber: args.pageNumber,
    plan,
    semanticRegistry,
  });
  const diagramElements = collectDiagramElements(args.frame.pageElement);
  const exportOwners = dedupeOwners([
    ...chartCollection.owners,
    ...tableCollection.owners,
    ...collectDiagramOwners(args.frame.pageElement),
    ...collectSemanticExportOwners({
      pageElement: args.frame.pageElement,
      registry: semanticRegistry,
    }),
  ]);
  if (plan) {
    plan.owners = exportOwners;
  }
  const skipVisualIds = new Set([
    ...chartCollection.skipVisualIds,
    ...tableCollection.skipVisualIds,
  ]);
  const skipTextWithinElements = [
    ...chartCollection.skipTextElements,
    ...tableCollection.skipTextElements,
    ...diagramElements,
  ].filter((element, index, elements) => elements.indexOf(element) === index);
  const skipPrimitiveWithinElements = [
    ...chartCollection.skipPrimitiveWithinElements,
    ...tableCollection.skipPrimitiveWithinElements,
  ].filter((element, index, elements) => elements.indexOf(element) === index);
  const ownedTextNodes = collectOwnedTextNodes({
    pageElement: args.frame.pageElement,
    owners: exportOwners,
    plan,
  });
  const shapeNodes = collectVisualShapeNodes({
    pageElement: args.frame.pageElement,
    skipVisualIds,
    skipPrimitiveWithinElements,
    owners: exportOwners,
    plan,
    warnings: args.warnings,
    pageNumber: args.pageNumber,
  });
  const ownedShapeCount = shapeNodes.filter((node) => node.ownerId).length;
  if (ownedTextNodes.length) {
    args.warnings.push({
      code: "text-owned",
      severity: "info",
      countsAgainstQuality: false,
      pageNumber: args.pageNumber,
      sourceKind: "page",
      message: `${ownedTextNodes.length} text nodes on page ${args.pageNumber} were exported through a single owner pass.`,
    });
  }
  if (ownedShapeCount) {
    args.warnings.push({
      code: "shape-owned",
      severity: "info",
      countsAgainstQuality: false,
      pageNumber: args.pageNumber,
      sourceKind: "page",
      message: `${ownedShapeCount} shape nodes on page ${args.pageNumber} were exported with chart/diagram ownership.`,
    });
  }

  return {
    theme,
    textNodes: dedupeTextNodes([
      ...collectBlockTextNodes({
        pageElement: args.frame.pageElement,
        warnings: args.warnings,
        pageNumber: args.pageNumber,
        skipTextWithinElements,
        plan,
      }),
      ...collectLooseContentTextNodes({
        pageElement: args.frame.pageElement,
        skipTextWithinElements,
        plan,
      }),
      ...collectStructuredChartModuleHeadingTextNodes({
        pageElement: args.frame.pageElement,
        theme,
        plan,
      }),
      ...chartCollection.textNodes,
      ...ownedTextNodes,
    ]),
    shapeNodes,
    chartNodes: chartCollection.chartNodes,
    tableNodes: tableCollection.tableNodes,
  };
}

function findExpectedPageExportContract(
  report: GeneratedHtmlReport,
  pageNumber: number,
) {
  return report.exportContract?.pages.find((entry) => entry.pageNumber === pageNumber) ?? null;
}

function findExpectedExportObjectContracts(
  report: GeneratedHtmlReport,
  pageNumber: number,
) {
  const page = findExpectedPageExportContract(report, pageNumber);
  if (!page) {
    return [];
  }
  const objects = page.objects.filter((object) => object.pageNumber === pageNumber);
  const primaryObjectId =
    page.primaryObjectId ??
    objects.find((object) => object.objectRole === "primary")?.objectId ??
    (objects.length === 1 ? objects[0]?.objectId : undefined);
  return objects
    .map((object) => ({
      ...object,
      objectKind: object.objectKind === "native-chart" ? "chart-visual" : object.objectKind,
      renderTarget:
        object.renderTarget === "native-chart" && object.objectKind === "native-chart"
          ? "visual-snapshot"
          : object.renderTarget,
      objectRole: object.objectId === primaryObjectId ? "primary" : object.objectRole ?? "secondary",
    }))
    .sort((left, right) => {
      const roleDelta = exportObjectRoleRank(left.objectRole) - exportObjectRoleRank(right.objectRole);
      return roleDelta || left.objectId.localeCompare(right.objectId);
    });
}

function hasPageIrDomMetadata(args: {
  frame: ExportPageFrame | null;
  pageContract: Pick<PageExportContract, "layoutArchetype" | "visualGrammar">;
}) {
  if (!args.frame) {
    return {
      hasLayoutArchetype: false,
      hasVisualGrammar: false,
    };
  }
  const layoutArchetype = args.pageContract.layoutArchetype ?? "";
  const visualGrammar = args.pageContract.visualGrammar ?? "";
  const pageElement = args.frame.pageElement;
  const hasLayoutArchetype =
    Boolean(layoutArchetype) &&
    (
      pageElement.getAttribute("data-layout-archetype") === layoutArchetype ||
      Boolean(pageElement.querySelector(`[data-layout-archetype="${selectorEscape(layoutArchetype)}"]`))
    );
  const hasVisualGrammar =
    Boolean(visualGrammar) &&
    (
      pageElement.getAttribute("data-visual-grammar") === visualGrammar ||
      Boolean(pageElement.querySelector(`[data-visual-grammar="${selectorEscape(visualGrammar)}"]`))
    );
  return {
    hasLayoutArchetype,
    hasVisualGrammar,
  };
}

function pushPageVisualGrammarDiagnostics(args: {
  pageContract?: PageExportContract | null;
  frame: ExportPageFrame | null;
  pageNumber: number;
  warnings: PptExportWarning[];
}) {
  const pageContract = args.pageContract;
  if (!pageContract?.layoutArchetype) {
    return;
  }
  args.warnings.push({
    code: "page-archetype-detected",
    severity: "success",
    pageNumber: args.pageNumber,
    sourceKind: "page",
    countsAgainstQuality: false,
    pageLayoutArchetype: pageContract.layoutArchetype,
    pageVisualGrammar: pageContract.visualGrammar,
    message: `Page ${args.pageNumber} declared layoutArchetype ${pageContract.layoutArchetype}.`,
  });
  const metadata = hasPageIrDomMetadata({
    frame: args.frame,
    pageContract,
  });
  if (!metadata.hasLayoutArchetype || (pageContract.visualGrammar && !metadata.hasVisualGrammar)) {
    args.warnings.push({
      code: "page-ir-metadata-missing",
      severity: "info",
      pageNumber: args.pageNumber,
      sourceKind: "page",
      countsAgainstQuality: false,
      pageLayoutArchetype: pageContract.layoutArchetype,
      pageVisualGrammar: pageContract.visualGrammar,
      message: `Page ${args.pageNumber} declares ${pageContract.layoutArchetype}/${pageContract.visualGrammar ?? "unknown grammar"} but the rendered DOM is missing matching page IR metadata attrs.`,
    });
  }
}

function warnIfExpectedRenderTargetMissing(args: {
  expectedContracts?: readonly ExportObjectContract[] | null;
  pageNumber: number;
  warnings: PptExportWarning[];
  chartNodes: PptExportChartModel[];
  tableNodes: PptExportTableModel[];
}) {
  const expectedContracts = args.expectedContracts ?? [];
  if (!expectedContracts.length) {
    return;
  }
  for (const expected of expectedContracts) {
    if (
      expected.renderTarget === "visual-snapshot" &&
      !args.chartNodes.some((node) => node.exportObjectId === expected.objectId && node.renderMode === "image")
    ) {
      args.warnings.push({
        code: "export-contract-render-target-missing",
        severity: "fatal",
        pageNumber: args.pageNumber,
        sourceKind: "chart",
        countsAgainstQuality: true,
        exportObjectId: expected.objectId,
        exportObjectKind: expected.objectKind,
        exportRenderTarget: expected.renderTarget,
        message: `Export contract ${expected.objectId} promised a visual chart snapshot on page ${args.pageNumber}, but no PPTX image chart object with that objectId was produced.`,
      });
    }
    if (
      expected.renderTarget === "native-chart" &&
      !args.chartNodes.some((node) => node.exportObjectId === expected.objectId)
    ) {
      args.warnings.push({
        code: "export-contract-render-target-missing",
        severity: "degraded",
        pageNumber: args.pageNumber,
        sourceKind: "chart",
        countsAgainstQuality: true,
        exportObjectId: expected.objectId,
        exportObjectKind: expected.objectKind,
        exportRenderTarget: expected.renderTarget,
        message: `Export contract ${expected.objectId} promised a native chart on page ${args.pageNumber}, but no PPTX chart object with that objectId was produced.`,
      });
    }
    if (
      expected.renderTarget === "native-table" &&
      !args.tableNodes.some((node) => node.exportObjectId === expected.objectId)
    ) {
      args.warnings.push({
        code: "export-contract-render-target-missing",
        severity: "degraded",
        pageNumber: args.pageNumber,
        sourceKind: "table",
        countsAgainstQuality: true,
        exportObjectId: expected.objectId,
        exportObjectKind: expected.objectKind,
        exportRenderTarget: expected.renderTarget,
        message: `Export contract ${expected.objectId} promised a native table on page ${args.pageNumber}, but no PPTX table object with that objectId was produced.`,
      });
    }
  }
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

  const expectedExportObjectContracts = findExpectedExportObjectContracts(
    args.htmlReport,
    pageNumber,
  );
  const expectedPageExportContract = findExpectedPageExportContract(args.htmlReport, pageNumber);
  pushPageVisualGrammarDiagnostics({
    pageContract: expectedPageExportContract,
    frame: args.frame,
    pageNumber,
    warnings,
  });
  const annotations = collectExportAnnotations({
    frame: args.frame,
    pageVisualStyle,
    reportStyleProfile: args.htmlReport.styleProfile,
    scene: pageDraft?.scene,
    warnings,
    pageNumber,
    expectedExportObjectContract:
      expectedExportObjectContracts.find((object) => object.objectRole === "primary") ?? null,
    expectedExportObjectContracts,
  });
  warnIfExpectedRenderTargetMissing({
    expectedContracts: expectedExportObjectContracts,
    pageNumber,
    warnings,
    chartNodes: annotations.chartNodes,
    tableNodes: annotations.tableNodes,
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

function pointsToEmu(value: number | undefined, fallback: number) {
  const next = Number.isFinite(value) ? value! : fallback;
  return Math.round(Math.max(0, next) * 12700);
}

function chartDashToPreset(value: "solid" | "dash" | "dot" | "none" | undefined) {
  if (value === "dot") {
    return "dot";
  }
  if (value === "dash") {
    return "dash";
  }
  return "solid";
}

function buildChartColorElement(color: string | null | undefined, opacity = 1) {
  const normalizedHex = typeof color === "string" ? color.trim().replace(/^#/, "").toUpperCase() : "";
  const parsed = /^[0-9A-F]{6}$/.test(normalizedHex) ? { hex: normalizedHex, alpha: 1 } : parseCssColor(color);
  const hex = parsed?.hex ?? "000000";
  const alpha = Math.round(clamp((parsed?.alpha ?? 1) * opacity, 0, 1) * 100000);
  return `<a:srgbClr val="${escapeXml(hex)}">${alpha < 100000 ? `<a:alpha val="${alpha}"/>` : ""}</a:srgbClr>`;
}

function buildChartSolidFillXml(color: string | null | undefined, opacity = 1) {
  return `<a:solidFill>${buildChartColorElement(color, opacity)}</a:solidFill>`;
}

function buildChartLineXml(args: {
  color?: string | null;
  widthPt?: number;
  dash?: "solid" | "dash" | "dot" | "none";
  fallbackColor: string;
  fallbackWidthPt: number;
}) {
  if (args.dash === "none") {
    return `<a:ln w="${pointsToEmu(args.widthPt, args.fallbackWidthPt)}" cap="flat"><a:noFill/><a:prstDash val="solid"/><a:round/></a:ln>`;
  }
  return `<a:ln w="${pointsToEmu(args.widthPt, args.fallbackWidthPt)}" cap="round">${buildChartSolidFillXml(
    args.color ?? args.fallbackColor,
  )}<a:prstDash val="${chartDashToPreset(args.dash)}"/><a:round/></a:ln>`;
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

async function collectTransientExportPageFrames(args: {
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
    height: ${HTML_REPORT_PAGE_HEIGHT * Math.max(pagePreviews.length, 1)}px;
    overflow: visible;
  `;
  args.document.body.appendChild(container);

  const iframes = pagePreviews.map((pagePreview) => {
    const iframe = args.document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("data-ppt-transient-export-page-frame", String(pagePreview.pageNumber));
    iframe.loading = "eager";
    iframe.tabIndex = -1;
    iframe.style.cssText = `
      display: block;
      width: ${HTML_REPORT_PAGE_WIDTH}px;
      height: ${HTML_REPORT_PAGE_HEIGHT}px;
      border: 0;
    `;
    container.appendChild(iframe);
    return {
      iframe,
      pageNumber: pagePreview.pageNumber,
      srcDoc: pagePreview.srcDoc,
    };
  });

  for (const { iframe, srcDoc } of iframes) {
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, 3000);
      iframe.addEventListener(
        "load",
        () => {
          window.clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
      iframe.srcdoc = srcDoc;
    });
    if (iframe.contentDocument) {
      await waitForRenderableSurface(iframe.contentDocument);
    }
    const deadline = window.performance.now() + 3000;
    while (!iframe.contentDocument?.querySelector("section.page") && window.performance.now() < deadline) {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    }
  }

  const frames = iframes
    .map(({ iframe, pageNumber }) => {
      const frameDocument = iframe.contentDocument;
      const pageElement = frameDocument?.querySelector("section.page");
      if (!frameDocument || !isHtmlElementNode(pageElement)) {
        return null;
      }
      canonicalizeDataBackedModulesOnPage(pageElement);
      return {
        iframe,
        document: frameDocument,
        pageElement,
        pageNumber,
      } satisfies ExportPageFrame;
    })
    .filter((frame): frame is ExportPageFrame => Boolean(frame));

  return {
    frames,
    cleanup: () => container.remove(),
  };
}

function indexExportPageFramesByPageNumber(frames: ExportPageFrame[]) {
  const indexed = new Map<number, ExportPageFrame>();
  for (const frame of frames) {
    if (Number.isFinite(frame.pageNumber) && frame.pageNumber >= 1) {
      indexed.set(frame.pageNumber, frame);
    }
  }
  return indexed;
}

function hasExportPageFramesForEveryPage(framesByPageNumber: Map<number, ExportPageFrame>, pageCount: number) {
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    if (!framesByPageNumber.has(pageNumber)) {
      return false;
    }
  }
  return true;
}

function serializeExportFrameDocument(frame: ExportPageFrame) {
  const doctype = frame.document.doctype
    ? `<!DOCTYPE ${frame.document.doctype.name}>`
    : "<!DOCTYPE html>";
  return `${doctype}\n${frame.document.documentElement.outerHTML}`;
}

function frameHasSnapshotTarget(frame: ExportPageFrame, snapshotId: string) {
  return Boolean(
    frame.document.querySelector(`[data-ppt-snapshot-id="${selectorEscape(snapshotId)}"]`),
  );
}

function findSnapshotSourceElement(frame: ExportPageFrame, chartNode: PptExportChartModel) {
  if (typeof frame.pageElement.querySelector !== "function") {
    return null;
  }
  const sourceId = chartNode.sourceElementId;
  if (sourceId) {
    const escapedSourceId = selectorEscape(sourceId);
    const bySourceId = frame.pageElement.querySelector<HTMLElement>(
      [
        `[data-html-visual-id="${escapedSourceId}"]`,
        `[data-html-block-id="${escapedSourceId}"]`,
        `[data-html-layout-id="${escapedSourceId}"]`,
        `[data-html-module-label="${escapedSourceId}"]`,
        `[id="${escapedSourceId}"]`,
      ].join(","),
    );
    if (bySourceId) {
      return bySourceId;
    }
  }

  const exportObjectId = chartNode.exportObjectId;
  if (!exportObjectId) {
    return null;
  }
  return frame.pageElement.querySelector<HTMLElement>(
    `[data-export-object-id="${selectorEscape(exportObjectId)}"]`,
  );
}

function ensureFrameSnapshotTarget(args: {
  frame: ExportPageFrame;
  chartNode: PptExportChartModel;
  snapshotId: string;
}) {
  if (frameHasSnapshotTarget(args.frame, args.snapshotId)) {
    return true;
  }
  const sourceElement = findSnapshotSourceElement(args.frame, args.chartNode);
  if (!sourceElement) {
    return false;
  }
  sourceElement.setAttribute("data-ppt-snapshot-id", args.snapshotId);
  return frameHasSnapshotTarget(args.frame, args.snapshotId);
}

const defaultSnapshotRasterizeClient: SnapshotRasterizeClient = (payload) =>
  api.post("/studio/export/rasterize-snapshots", payload);

export async function rasterizeVisualChartSnapshots(args: {
  framesByPageNumber: Map<number, ExportPageFrame>;
  slides: PptExportSlideModel[];
  rasterizeClient?: SnapshotRasterizeClient;
}) {
  const failures: PptExportWarning[] = [];
  const pending = args.slides.flatMap((slide) =>
    slide.chartNodes
      .filter((chartNode) => {
        const asset = chartNode.fallbackAsset;
        return (
          chartNode.renderMode === "image" &&
          asset?.kind === "dom-snapshot" &&
          asset.reason === "visual-chart-exported"
        );
      })
      .map((chartNode) => ({
        slide,
        chartNode,
        asset: chartNode.fallbackAsset as Extract<PptExportFallbackAsset, { kind: "dom-snapshot" }>,
      })),
  );

  if (pending.length === 0) {
    return failures;
  }

  const validPending: typeof pending = [];
  const pages = Array.from(
    new Set(pending.map((entry) => entry.slide.pageNumber)),
  ).flatMap((pageNumber) => {
    const frame = args.framesByPageNumber.get(pageNumber);
    if (!frame) {
      pending
        .filter((entry) => entry.slide.pageNumber === pageNumber)
        .forEach((entry) => {
          failures.push({
            code: "visual-chart-rasterization-failed",
            severity: "fatal",
            pageNumber,
            sourceId: entry.chartNode.exportObjectId,
            sourceKind: "chart",
            exportObjectId: entry.chartNode.exportObjectId,
            message: `Visual chart snapshot ${entry.chartNode.exportObjectId ?? entry.chartNode.chartKind} on page ${pageNumber} could not be rasterized to PNG by server rasterizer: page frame was unavailable.`,
          });
        });
      return [];
    }
    pending
      .filter((entry) => entry.slide.pageNumber === pageNumber)
      .forEach((entry) => {
        if (
          ensureFrameSnapshotTarget({
            frame,
            chartNode: entry.chartNode,
            snapshotId: entry.asset.snapshotId,
          })
        ) {
          validPending.push(entry);
          return;
        }
        failures.push({
          code: "visual-chart-rasterization-failed",
          severity: "fatal",
          pageNumber,
          sourceId: entry.chartNode.sourceElementId ?? entry.chartNode.exportObjectId,
          sourceKind: "chart",
          exportObjectId: entry.chartNode.exportObjectId,
          message: `Visual chart snapshot ${entry.chartNode.chartKind ?? "chart"} (${entry.chartNode.sourceElementId ?? entry.chartNode.exportObjectId ?? "unknown source"}) on page ${pageNumber} could not be rasterized to PNG: local snapshot target ${entry.asset.snapshotId} was not present in serialized page HTML.`,
        });
      });
    return [{
      pageNumber,
      html: serializeExportFrameDocument(frame),
    }];
  });
  const jobs = validPending
    .map((entry) => ({
      pageNumber: entry.slide.pageNumber,
      snapshotId: entry.asset.snapshotId,
    }));

  if (jobs.length === 0) {
    return failures;
  }

  try {
    const response = await (args.rasterizeClient ?? defaultSnapshotRasterizeClient)({
      pages,
      jobs,
    });
    const results = new Map(
      response.results.map((result) => [`${result.pageNumber}:${result.snapshotId}`, result]),
    );
    validPending.forEach((entry) => {
      const result = results.get(`${entry.slide.pageNumber}:${entry.asset.snapshotId}`);
      if (!result?.pngDataUri) {
        failures.push({
          code: "visual-chart-rasterization-failed",
          severity: "fatal",
          pageNumber: entry.slide.pageNumber,
          sourceId: entry.chartNode.sourceElementId ?? entry.chartNode.exportObjectId,
          sourceKind: "chart",
          exportObjectId: entry.chartNode.exportObjectId,
          message: `Visual chart snapshot ${entry.chartNode.exportObjectId ?? entry.chartNode.chartKind} (${entry.chartNode.sourceElementId ?? "unknown source"}, ${entry.asset.snapshotId}) on page ${entry.slide.pageNumber} could not be rasterized to PNG by server rasterizer: ${result?.error ?? "server returned no PNG data"}.`,
        });
        return;
      }
      entry.chartNode.fallbackAsset = {
        kind: "png",
        data: result.pngDataUri,
        reason: "visual-chart-exported",
      };
    });
  } catch (error) {
    const reason =
      error instanceof Error && error.message.trim()
        ? error.message
        : "server rasterizer request failed";
    validPending.forEach((entry) => {
      failures.push({
        code: "visual-chart-rasterization-failed",
        severity: "fatal",
        pageNumber: entry.slide.pageNumber,
        sourceId: entry.chartNode.sourceElementId ?? entry.chartNode.exportObjectId,
        sourceKind: "chart",
        exportObjectId: entry.chartNode.exportObjectId,
        message: `Visual chart snapshot ${entry.chartNode.exportObjectId ?? entry.chartNode.chartKind} (${entry.chartNode.sourceElementId ?? "unknown source"}, ${entry.asset.snapshotId}) on page ${entry.slide.pageNumber} could not be rasterized to PNG by server rasterizer: ${reason}.`,
      });
    });
  }
  return failures;
}

function cleanupSnapshotTargetAttributes(framesByPageNumber: Map<number, ExportPageFrame>) {
  framesByPageNumber.forEach((frame) => {
    frame.document
      .querySelectorAll("[data-ppt-snapshot-id]")
      .forEach((element) => element.removeAttribute("data-ppt-snapshot-id"));
  });
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

  visualSnapshotIdCounter = 0;
  await waitForRenderableSurface(args.reportRoot);
  const expectedPageCount = Math.max(args.project.pages.length, htmlReport.pageCount);
  const renderedFrames = await collectRenderedExportPageFrames(args.reportRoot);
  const framesByPageNumber = indexExportPageFramesByPageNumber(renderedFrames);
  let cleanupTransientFrames: (() => void) | null = null;
  if (!hasExportPageFramesForEveryPage(framesByPageNumber, expectedPageCount)) {
    const transient = await collectTransientExportPageFrames({
      document: args.document,
      htmlReport,
    });
    for (const frame of transient.frames) {
      if (!framesByPageNumber.has(frame.pageNumber)) {
        framesByPageNumber.set(frame.pageNumber, frame);
      }
    }
    cleanupTransientFrames = transient.cleanup;
  }
  const warnings: PptExportWarning[] = [];
  const slides: PptExportSlideModel[] = args.project.pages.map((_, pageIndex) => {
    const pageNumber = pageIndex + 1;
    const built = normalizeSlideModel({
      project: args.project,
      draft: args.draft,
      htmlReport,
      pageIndex,
      frame: framesByPageNumber.get(pageNumber) ?? null,
    });
    warnings.push(...built.warnings);
    return built.slide;
  });
  const rasterizationWarnings = await rasterizeVisualChartSnapshots({
    framesByPageNumber,
    slides,
  });
  warnings.push(...rasterizationWarnings);
  cleanupSnapshotTargetAttributes(framesByPageNumber);
  cleanupTransientFrames?.();
  const dedupedWarnings = dedupeWarnings(warnings);
  const diagnostics = normalizePptxDiagnostics(dedupedWarnings);
  const visibleWarnings = filterPptxWarnings(diagnostics);
  const rasterizationFailure = diagnostics.find(
    (diagnostic) => diagnostic.code === "visual-chart-rasterization-failed",
  );
  if (rasterizationFailure) {
    throw new Error(`PPTX export blocked: ${rasterizationFailure.code}: ${rasterizationFailure.message}`);
  }
  const exportDocument = buildPptxExportDocument({
    slides,
    diagnostics,
  });
  const qualityReport = buildPptxExportQualityReport(exportDocument);
  const blockingChartContract = diagnostics.find(
    (diagnostic) => diagnostic.code === "chart-contract-blocked",
  );
  const blockingDataContract = diagnostics.find(
    (diagnostic) =>
      diagnostic.code === "export-data-contract-missing" ||
      diagnostic.code === "export-data-contract-invalid" ||
      diagnostic.code === "export-data-contract-incompatible" ||
      diagnostic.code === "export-data-contract-minimum-data-missing" ||
      diagnostic.code === "export-contract-forbidden-violation",
  );
  if ((import.meta.env.DEV || import.meta.env.MODE === "test") && (blockingChartContract || blockingDataContract)) {
    const diagnostic = blockingChartContract ?? blockingDataContract!;
    throw new Error(`PPTX export contract blocked: ${diagnostic.message}`);
  }

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
  const pptxBlob = await patchPptxPackageXml({
    arrayBuffer: rawPptx,
    document: exportDocument,
  });
  const packageDiagnostics = await validatePptxPackageBlob(pptxBlob);
  if (packageDiagnostics.length) {
    const normalizedPackageDiagnostics = normalizePptxDiagnostics(packageDiagnostics);
    const firstMessage = normalizedPackageDiagnostics[0]?.message ?? "Unknown PPTX package error.";
    throw new Error(`PPTX package validation failed: ${firstMessage}`);
  }
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
