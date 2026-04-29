import { extractHtmlPageVisualStyle } from "@/features/studio/html-report-visuals";
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
  findChartContractElement,
  findChartPlotElement,
  hasStructuredChartContract,
  hasUnstructuredChartPrimitives,
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
  type PptExportChartModel,
  type PptExportChartNativeStyle,
  type PptExportChartSeries,
  type PptExportChartThemeTokens,
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

type ChartCollectionResult = {
  chartNodes: PptExportChartModel[];
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
    style: normalizeChartNativeStyle(args.parsed.style),
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
      style: normalizeChartNativeStyle(args.spec.style),
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
        style: normalizeChartSeriesStyle(item.style),
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
    style: normalizeChartNativeStyle(args.spec.style),
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
  const view = pageElement.ownerDocument.defaultView;
  if (!view) {
    return [];
  }

  const candidates = Array.from(
    pageElement.querySelectorAll<HTMLElement>(
      [
        '[data-html-visual-kind="chart-frame"]',
        `[${HTML_CHART_SPEC_ATTRIBUTE}]`,
        "[data-export-chart]",
      ].join(","),
    ),
  )
    .filter((element) => {
      if (
        isHiddenForExport({
          element,
          pageElement,
          view,
        }).hidden
      ) {
        return false;
      }
      if (hasStructuredChartContract(element)) {
        return true;
      }
      const moduleKind = element.getAttribute("data-html-module-kind");
      return (
        (!moduleKind || moduleKind === "chart") &&
        (element.getAttribute("data-html-visual-kind") === "chart-frame" ||
          Boolean(findChartContractElement(element)))
      );
    })
    .map((element, index) => ({
      visualId: element.getAttribute("data-html-visual-id") ?? `chart-frame-${index + 1}`,
      element,
      rect: measureElementRect(pageElement, element),
    }));

  return candidates.filter((candidate, index) => {
    const structured = hasStructuredChartContract(candidate.element);
    const contractElement = findChartContractElement(candidate.element);
    const hasContractDescendant = Boolean(contractElement && contractElement !== candidate.element);
    const exportable =
      structured || hasContractDescendant || hasUnstructuredChartPrimitives(candidate.element);
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

    if (structured && hasExportableAncestor) {
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
}

function warnIfUnsupportedStructuredChart(args: {
  element: HTMLElement;
  warnings: PptExportWarning[];
  pageNumber: number;
}) {
  const spec = parseHtmlChartSpec(args.element.getAttribute(HTML_CHART_SPEC_ATTRIBUTE));
  args.warnings.push({
    code: "chart-native-unsupported",
    severity: "info",
    countsAgainstQuality: false,
    pageNumber: args.pageNumber,
    message: spec
      ? `${spec.kind} chart on page ${args.pageNumber} skipped its native data relationship but kept editable DOM geometry.`
      : `Chart frame on page ${args.pageNumber} kept editable DOM geometry without a native data relationship.`,
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
}): TableCollectionResult {
  const tableNodes: PptExportTableModel[] = [];
  const skipVisualIds = new Set<string>();
  const skipTextElements: HTMLElement[] = [];
  const skipPrimitiveWithinElements: HTMLElement[] = [];
  const owners: ExportOwner[] = [];
  const themeTokens = buildChartThemeTokens(args.theme);
  const tableElements = args.pageElement ? collectTableElements(args.pageElement) : [];

  for (const [index, element] of tableElements.entries()) {
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
  plan?: ExportPagePlan | null;
}): ChartCollectionResult {
  const chartNodes: PptExportChartModel[] = [];
  const skipVisualIds = new Set<string>();
  const skipTextElements: HTMLElement[] = [];
  const skipPrimitiveWithinElements: HTMLElement[] = [];
  const owners: ExportOwner[] = [];
  const chartFrames = args.pageElement ? collectChartFrames(args.pageElement) : [];
  const sceneCharts = (args.scene?.objects ?? []).filter(
    (object): object is SlideSceneChartObject => object.kind === "chart",
  );
  const nativeFrameIndexes = new Set<number>();
  const themeTokens = buildChartThemeTokens(args.theme);

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
      ownsShapes: !chartKind || chartKind === "matrix",
      ownsSvg: !chartKind || chartKind === "matrix",
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

  const skipUnsupportedFrame = (frame: ChartFrameCandidate) => {
    skipTextElements.push(frame.element);
    addFrameOwner(frame);
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
      const plotElement =
        args.pageElement && normalized.chartKind !== "matrix"
          ? findChartPlotElement(frame.element)
          : null;
      const directChartElement = !plotElement && normalized.chartKind !== "matrix";
      if (plotElement) {
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
      } else if (normalized.chartKind === "matrix") {
        skipTextElements.push(frame.element);
      }
      const keepOverlayText = directChartElement;
      addFrameOwner(
        frame,
        normalized.chartKind,
        plotElement ?? frame.element,
        keepOverlayText ? true : undefined,
      );
    }
    const layerRole: PptExportLayerRole = "chart";
    const ordering =
      frame && args.pageElement
        ? nodeOrderingForElement({
            plan: args.plan,
            element: frame.element,
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
    chartNodes.push({
      kind: "chart",
      sourceElementId: frame
        ? sourceElementIdForElement(args.pageElement!, frame.element, "chart")
        : normalized.title ?? sceneChart?.title ?? `chart-${chartNodes.length + 1}`,
      sourceOrder: ordering.sourceOrder,
      zIndex: ordering.zIndex,
      zOrder: ordering.zOrder,
      layerRole: ordering.layerRole,
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
      style: normalized.style,
      showInlineHeading: frame ? false : normalized.showInlineHeading,
      showNativeVisual: true,
      themeTokens,
    });
    args.warnings.push({
      code: "native-chart-exported",
      pageNumber: args.pageNumber,
      message: `Chart on page ${args.pageNumber} exported as a PowerPoint-native chart.`,
    });
    if (frame) {
      args.warnings.push({
        code: "native-chart-visible",
        severity: "success",
        countsAgainstQuality: false,
        pageNumber: args.pageNumber,
        sourceId: frame.visualId,
        sourceKind: normalized.chartKind === "matrix" ? "matrix" : "chart",
        message: `Chart visible layer on page ${args.pageNumber} is rendered as a native PowerPoint chart.`,
      });
    }
  };

  sceneCharts.forEach((chart, index) => {
    const sceneNormalized = normalizeSceneChartDataModel({
      chart,
      warnings: args.warnings,
      pageNumber: args.pageNumber,
    });
    const frame = chartFrames[index] ?? null;
    const frameContractElement = frame ? findChartContractElement(frame.element) ?? frame.element : null;
    const domNormalized =
      frame
        ? normalizeChartContractFromElement({
            element: frameContractElement!,
            warnings: args.warnings,
            pageNumber: args.pageNumber,
          }) ??
          (parseExportChartData(frameContractElement!)
            ? normalizeChartContractFromParsed({
                parsed: parseExportChartData(frameContractElement!)!,
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

    const frameContractElement = findChartContractElement(frame.element) ?? frame.element;
    const parsed = parseExportChartData(frameContractElement);
    const normalized =
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
  const chartCollection = collectChartModels({
    pageElement: args.frame.pageElement,
    theme,
    scene: args.scene,
    warnings: args.warnings,
    pageNumber: args.pageNumber,
    plan,
  });
  const tableCollection = collectTableModels({
    pageElement: args.frame.pageElement,
    theme,
    warnings: args.warnings,
    pageNumber: args.pageNumber,
    plan,
  });
  const diagramElements = collectDiagramElements(args.frame.pageElement);
  const exportOwners = dedupeOwners([
    ...chartCollection.owners,
    ...tableCollection.owners,
    ...collectDiagramOwners(args.frame.pageElement),
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
      ...ownedTextNodes,
    ]),
    shapeNodes,
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
