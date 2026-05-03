import type {
  DataTableModel,
  DeckExportContract,
  GeneratedHtmlReport,
  HtmlFitParticipation,
  HtmlIframeObjectDiagnostic,
  HtmlIframeObjectDiagnosticCode,
  HtmlVisualAtomizationRole,
  HtmlChartSpec,
  HtmlPageVisualStyle,
  HtmlVisualContentNode,
  HtmlVisualContentNodeKind,
  HtmlVisualNode,
  HtmlVisualNodeKind,
  HtmlVisualSelectionPriority,
  HtmlVisualNodeStyle,
  HtmlVisualPage,
  HtmlVisualStructure,
} from "./types";
import {
  CHART_MODULE_KIND,
  HTML_CHART_SPEC_ATTRIBUTE,
  HTML_TABLE_SPEC_ATTRIBUTE,
  TABLE_MODULE_KIND,
  canonicalizeDataBackedModulesOnPage,
  parseHtmlChartSpec,
  parseHtmlTableSpec,
  renderHtmlChartModule,
  renderHtmlTableModule,
  serializeHtmlChartSpec,
  serializeHtmlTableSpec,
} from "./html-report-data-modules";
import {
  HTML_FIT_ROLE_ATTRIBUTE,
  readHtmlFitParticipation,
  resolveHtmlVisualFitParticipation,
  setHtmlFitParticipation,
} from "./html-fit-role";
import {
  duplicateGeneratedHtmlReportCanvasVisualTransform,
  pruneGeneratedHtmlReportCanvasOverrides,
  removeGeneratedHtmlReportCanvasVisualTransform,
} from "./html-report-canvas";
import { collectHtmlEditableCandidates, extractHtmlEditableStructure } from "./html-report-structure";
import { getIndustryStyleProfile } from "./industry-style";
import {
  SCIENTIFIC_DIAGRAM_MODULE_KIND,
  SCIENTIFIC_DIAGRAM_SPEC_ATTRIBUTE,
  buildScientificDiagramTheme,
  parseScientificDiagramSpec,
  renderScientificDiagramModule,
  serializeScientificDiagramSpec,
} from "./scientific-diagram";

const GENERAL_CONSULTING_PROFILE = getIndustryStyleProfile("general-consulting");
const DEFAULT_PAGE_BACKGROUND = GENERAL_CONSULTING_PROFILE.tokens.pageBackground;
const DEFAULT_DIVIDER_COLOR = GENERAL_CONSULTING_PROFILE.tokens.borderSubtle;
const DEFAULT_SURFACE_FILL = GENERAL_CONSULTING_PROFILE.tokens.surfacePrimary;
const DEFAULT_SURFACE_BORDER = GENERAL_CONSULTING_PROFILE.tokens.borderSubtle;
const DEFAULT_ACCENT_COLOR = GENERAL_CONSULTING_PROFILE.tokens.accentPrimary;
const OBJECT_ANCHOR_SELECTOR = "[data-studio-object-id],[data-export-object-id]";
const VISUAL_SELECTOR = [
  OBJECT_ANCHOR_SELECTOR,
  "div",
  "aside",
  "article",
  "section",
  "hr",
  "figure",
  "table",
  "svg",
  "g",
  "rect",
  "circle",
  "ellipse",
  "line",
  "path",
  "polygon",
  "polyline",
].join(",");
const TEXTUAL_SELECTOR = "h1, h2, h3, h4, h5, h6, p, ul, ol, li";
const DEFAULT_ELEMENT_INSERTION_KINDS = new Set<HtmlVisualNodeKind>([
  "surface",
  "divider",
  "badge",
  "highlight",
  "annotation",
]);
export type HtmlVisualInsertionMode = "page-end" | "below" | "beside";

type InternalVisualCandidate = {
  element: Element;
  sourceIndex: number;
  sourcePath: string;
  sourceTag: string;
  kind: HtmlVisualNodeKind;
  parentIndex: number | null;
  childIndices: number[];
  moduleId?: string;
  moduleLabel?: string;
  moduleKind?: string;
  diagramSpec?: HtmlVisualNode["diagramSpec"];
  chartSpec?: HtmlChartSpec | null;
  tableSpec?: HtmlVisualNode["tableSpec"];
  dataTable?: DataTableModel | null;
  fitParticipation: HtmlFitParticipation;
  atomizationRole: HtmlVisualAtomizationRole;
  selectionPriority: HtmlVisualSelectionPriority;
  style: HtmlVisualNodeStyle;
  studioObjectId?: string;
  exportObjectId?: string;
  exportObjectKind?: string;
  objectRole?: string;
  studioSlot?: string;
  renderTarget?: string;
  snapshotBoundary?: string;
  isContractRoot: boolean;
};

function resolveReportStyleFallback(
  report: Pick<GeneratedHtmlReport, "styleProfile" | "styleProfileId"> | null | undefined,
): HtmlPageVisualStyle {
  return {
    pageBackground: report?.styleProfile?.pageBackground ?? DEFAULT_PAGE_BACKGROUND,
    dividerColor: report?.styleProfile?.dividerColor ?? DEFAULT_DIVIDER_COLOR,
    surfaceFill: report?.styleProfile?.surfaceFill ?? DEFAULT_SURFACE_FILL,
    accentColor: report?.styleProfile?.accentColor ?? DEFAULT_ACCENT_COLOR,
  };
}

function createSerializableHtml(document: Document) {
  const doctype = document.doctype
    ? `<!DOCTYPE ${document.doctype.name}>`
    : "<!DOCTYPE html>";
  return `${doctype}\n${document.documentElement.outerHTML}`;
}

function normalizeCssPaint(value: string, fallback: string) {
  const normalized = value.trim();
  return normalized || fallback;
}

function normalizeStyleColor(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return normalized || undefined;
}

function isTransparentPaint(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "transparent" || normalized === "none") {
    return true;
  }
  return /rgba?\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(normalized);
}

function parsePixelValue(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  if (!normalized) {
    return undefined;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePercentValue(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  if (!normalized) {
    return undefined;
  }

  const parsed = Number.parseFloat(normalized.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeOpacity(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  if (!normalized) {
    return undefined;
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.max(0.1, Math.min(1, parsed));
}

function normalizePlainText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function readStudioObjectId(element: Element) {
  return element.getAttribute("data-studio-object-id")?.trim() || undefined;
}

function readExportObjectId(element: Element) {
  return element.getAttribute("data-export-object-id")?.trim() || undefined;
}

function isObjectAnchorElement(element: Element) {
  return Boolean(readStudioObjectId(element) || readExportObjectId(element));
}

function buildElementSourcePath(root: Element, element: Element) {
  const parts: number[] = [];
  let current: Element | null = element;

  while (current && current !== root) {
    const parent: Element | null = current.parentElement;
    if (!parent) {
      break;
    }
    const index = Array.from(parent.children).indexOf(current);
    parts.push(index);
    current = parent;
  }

  return parts.reverse().join(".");
}

function buildPageBackground(background: string) {
  return `linear-gradient(180deg, rgba(255,255,255,0.34), rgba(255,255,255,0.08)), ${background}`;
}

function buildDividerBackground(color: string) {
  if (/(gradient|url)\(/i.test(color)) {
    return color;
  }
  return `linear-gradient(90deg, ${color}, transparent)`;
}

function shouldPromoteEditableVisualToContent(kind: HtmlVisualNodeKind) {
  return (
    kind === "badge" ||
    kind === "annotation" ||
    kind === "rail" ||
    kind === "chart-frame" ||
    kind === "shape" ||
    kind === "connector" ||
    kind === "node" ||
    kind === "label-surface"
  );
}

function shouldTreatPaintedTextGroupAsContent(element: Element, kind: HtmlVisualNodeKind) {
  if (kind !== "surface" && kind !== "rail" && kind !== "annotation" && kind !== "highlight") {
    return false;
  }
  const areaRatio = estimateInlineElementAreaRatio(element);
  return (
    areaRatio >= 0.004 &&
    areaRatio <= 0.55 &&
    hasExplicitPaint(element) &&
    hasVisibleTextContent(element) &&
    !looksLikeLayoutShell(element)
  );
}

function shouldExposeObjectDescendantVisual(args: {
  element: Element;
  kind: HtmlVisualNodeKind;
  isSvgPrimitive: boolean;
  hasInlineStyle: boolean;
  hasStrongKeyword: boolean;
}) {
  if (isHiddenLikeElement(args.element)) {
    return false;
  }
  if (args.isSvgPrimitive) {
    return true;
  }
  if (shouldTreatPaintedTextGroupAsContent(args.element, args.kind)) {
    return true;
  }
  if (
    args.kind === "badge" ||
    args.kind === "annotation" ||
    args.kind === "rail" ||
    args.kind === "label-surface" ||
    args.kind === "node" ||
    args.kind === "connector"
  ) {
    return true;
  }
  if (!args.hasInlineStyle && !args.hasStrongKeyword) {
    return false;
  }
  if (!hasExplicitPaint(args.element)) {
    return false;
  }
  const areaRatio = estimateInlineElementAreaRatio(args.element);
  return areaRatio >= 0.001 && areaRatio <= 0.65;
}

function getClassTokens(element: Element) {
  const className =
    typeof (element as HTMLElement).className === "string"
      ? (element as HTMLElement).className
      : "";
  return className
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeVisualIdentityToken(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function hashVisualIdentity(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function collectVisualAncestorSignature(element: Element) {
  const parts: string[] = [];
  let current = element.parentElement;

  while (current && !current.matches("section.page") && parts.length < 3) {
    const classSignature = getClassTokens(current)
      .slice(0, 4)
      .map((token) => normalizeVisualIdentityToken(token))
      .filter(Boolean)
      .join(".");
    if (classSignature) {
      parts.push(classSignature);
    } else if (current.hasAttribute("data-page-body")) {
      parts.push("page-body");
    } else {
      parts.push(current.tagName.toLowerCase());
    }
    current = current.parentElement;
  }

  return parts;
}

function collectVisualChildSignature(element: Element) {
  return Array.from(element.children)
    .slice(0, 6)
    .map((child) => {
      const childClass = getClassTokens(child)
        .slice(0, 2)
        .map((token) => normalizeVisualIdentityToken(token))
        .filter(Boolean)
        .join(".");
      return childClass ? `${child.tagName.toLowerCase()}.${childClass}` : child.tagName.toLowerCase();
    })
    .join("|");
}

function collectVisualTextTagSignature(element: Element) {
  return Array.from(element.children)
    .filter((child) => child.matches(TEXTUAL_SELECTOR))
    .slice(0, 6)
    .map((node) => node.tagName.toLowerCase())
    .join("|");
}

function buildVisualIdentitySignature(args: {
  element: Element;
  kind: HtmlVisualNodeKind;
}) {
  const classTokens = getClassTokens(args.element)
    .slice(0, 8)
    .map((token) => normalizeVisualIdentityToken(token))
    .filter(Boolean);
  const roleToken = normalizeVisualIdentityToken(args.element.getAttribute("role"));
  const ariaToken = normalizeVisualIdentityToken(args.element.getAttribute("aria-label"));
  const moduleId = normalizeVisualIdentityToken(args.element.getAttribute("data-html-module-id"));
  const moduleLabel = normalizeVisualIdentityToken(args.element.getAttribute("data-html-module-label"));
  const moduleKind = normalizeVisualIdentityToken(args.element.getAttribute("data-html-module-kind"));
  const childSignature = collectVisualChildSignature(args.element);
  const textTagSignature = collectVisualTextTagSignature(args.element);
  const ancestorSignature = collectVisualAncestorSignature(args.element).join("/");

  return [
    args.kind,
    args.element.tagName.toLowerCase(),
    classTokens.join("."),
    roleToken ? `role:${roleToken}` : "",
    ariaToken ? `aria:${ariaToken}` : "",
    moduleId ? `module:${moduleId}` : "",
    moduleLabel ? `label:${moduleLabel}` : "",
    moduleKind ? `module-kind:${moduleKind}` : "",
    childSignature ? `children:${childSignature}` : "",
    textTagSignature ? `text-tags:${textTagSignature}` : "",
    ancestorSignature ? `ancestors:${ancestorSignature}` : "",
  ]
    .filter(Boolean)
    .join("|");
}

export function buildStableVisualFallbackId(args: {
  pageNumber: number;
  kind: HtmlVisualNodeKind;
  signature: string;
  duplicateOrdinal?: number;
}) {
  const duplicateOrdinal = args.duplicateOrdinal ?? 0;
  const baseId = `visual-${args.pageNumber}-${args.kind}-${hashVisualIdentity(args.signature)}`;
  return duplicateOrdinal > 0 ? `${baseId}-${duplicateOrdinal + 1}` : baseId;
}

function hasVisualKeyword(tokens: string[]) {
  return tokens.some((token) =>
    [
      "card",
      "panel",
      "surface",
      "kpi",
      "insight",
      "action",
      "matrix",
      "quadrant",
      "chart",
      "chartbox",
      "quote",
      "badge",
      "pill",
      "tag",
      "label",
      "highlight",
      "accent",
      "annotation",
      "callout",
      "note",
      "rail",
      "divider",
      "rule",
      "separator",
    ].some((keyword) => token.includes(keyword)),
  );
}

function isTextLikeVisualSurface(element: Element) {
  const text = normalizePlainText(element.textContent);
  if (!text || text.length > 96) {
    return false;
  }

  return !element.querySelector(TEXTUAL_SELECTOR);
}

function parseInlineDimensionPx(value: string | null | undefined, pageSize: number) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized.endsWith("%")) {
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? pageSize * (parsed / 100) : undefined;
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function estimateInlineElementAreaRatio(element: Element) {
  const style = (element as HTMLElement).style;
  const styleText = (element.getAttribute("style") ?? "").toLowerCase();
  const explicitInsetFill =
    /position\s*:\s*(?:absolute|fixed)/i.test(styleText) &&
    /inset\s*:\s*0(?:px)?\b/i.test(styleText);
  const width =
    parseInlineDimensionPx(style.width, 1600) ??
    parseInlineDimensionPx(element.getAttribute("width"), 1600) ??
    (explicitInsetFill ? 1600 : undefined);
  const height =
    parseInlineDimensionPx(style.height, 900) ??
    parseInlineDimensionPx(element.getAttribute("height"), 900) ??
    (explicitInsetFill ? 900 : undefined);
  if (!width || !height) {
    return 0;
  }
  return Math.max(0, Math.min(1, (width * height) / (1600 * 900)));
}

function hasExplicitPaint(element: Element) {
  const htmlElement = element as HTMLElement;
  const style = htmlElement.style;
  const borderWidth =
    parsePixelValue(style.borderWidth) ??
    parsePixelValue(style.borderLeftWidth) ??
    parsePixelValue(style.borderTopWidth) ??
    0;
  const background =
    style.background ||
    style.backgroundColor ||
    element.getAttribute("data-html-visual-fill") ||
    element.getAttribute("data-export-fill");
  const border =
    style.border ||
    style.borderColor ||
    style.borderLeftColor ||
    element.getAttribute("data-html-visual-border") ||
    element.getAttribute("data-export-border");
  return (
    !isTransparentPaint(background) ||
    (borderWidth > 0 && !isTransparentPaint(border)) ||
    Boolean(style.boxShadow?.trim())
  );
}

function hasOwnVisibleText(element: Element) {
  if (isHiddenLikeElement(element)) {
    return false;
  }
  const text = normalizePlainText(element.textContent);
  if (!text) {
    return false;
  }
  const childText = Array.from(element.children)
    .map((child) => normalizePlainText(child.textContent))
    .join(" ");
  return normalizePlainText(childText) !== text || element.children.length === 0;
}

function hasVisibleTextContent(element: Element) {
  return !isHiddenLikeElement(element) && Boolean(normalizePlainText(element.textContent));
}

function hasVisibleContent(element: Element) {
  if (isHiddenLikeElement(element)) {
    return false;
  }
  return Boolean(
    normalizePlainText(element.textContent) ||
      element.querySelector("svg, img, canvas, video, table"),
  );
}

function isHiddenLikeElement(element: Element) {
  const htmlElement = element as HTMLElement;
  const style = htmlElement.style;
  const styleText = (element.getAttribute("style") ?? "").toLowerCase();
  return (
    element.hasAttribute("hidden") ||
    element.getAttribute("aria-hidden") === "true" ||
    element.getAttribute("data-html-canvas-placeholder") === "true" ||
    style.display === "none" ||
    style.visibility === "hidden" ||
    styleText.includes("display:none") ||
    styleText.includes("display: none") ||
    styleText.includes("visibility:hidden") ||
    styleText.includes("visibility: hidden")
  );
}

function looksLikeLayoutShell(element: Element) {
  const tokens = getClassTokens(element);
  const styleText = (element.getAttribute("style") ?? "").toLowerCase();
  return (
    element.hasAttribute("data-page-body") ||
    tokens.some((token) =>
      /^(?:layout|shell|wrapper|container|grid|row|column|frame|stage|canvas|background|overlay)$/.test(token) ||
      token.includes("layout") ||
      token.includes("wrapper") ||
      token.includes("shell") ||
      token.includes("overlay") ||
      token.includes("background"),
    ) ||
    styleText.includes("display:grid") ||
    styleText.includes("display: grid") ||
    styleText.includes("display:flex") ||
    styleText.includes("display: flex")
  );
}

export type IframeObjectChromeSignals = {
  areaRatio: number;
  isPageElement?: boolean;
  isObjectAnchor?: boolean;
  pointerEventsNone?: boolean;
  opacity?: number;
  hasOwnVisibleText?: boolean;
  hasVisibleContent?: boolean;
  hasExplicitPaint?: boolean;
  looksLikeLayoutShell?: boolean;
};

export type IframeObjectBoundarySignals = IframeObjectChromeSignals & {
  objectId?: string;
  parentObjectId?: string;
  exportObjectKind?: string;
  renderTarget?: string;
  objectRole?: string;
  studioSlot?: string;
  snapshotBoundary?: string;
  ownershipScope?: string;
  repeatedObjectRootCount?: number;
  textOverflow?: boolean;
  hasVisibleText?: boolean;
  chartVisualHasModule?: boolean;
  chartVisualHasDataContract?: boolean;
};

const SNAPSHOT_BOUNDARY_VALUES = new Set(["object-root", "visual-frame", "plot-area"]);

export function normalizeIframeSnapshotBoundary(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return SNAPSHOT_BOUNDARY_VALUES.has(normalized) ? normalized : null;
}

function iframeObjectRequiresSnapshotBoundary(signals: Pick<IframeObjectBoundarySignals, "exportObjectKind" | "renderTarget">) {
  return (
    signals.exportObjectKind === "chart-visual" ||
    signals.exportObjectKind === "native-table" ||
    signals.exportObjectKind === "matrix" ||
    signals.exportObjectKind === "diagram" ||
    signals.renderTarget === "visual-snapshot" ||
    signals.renderTarget === "native-table"
  );
}

function metadataTokens(value: string | null | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean),
  );
}

export function diagnoseIframeObjectBoundarySignals(
  signals: IframeObjectBoundarySignals,
): HtmlIframeObjectDiagnosticCode[] {
  if (!signals.isObjectAnchor) {
    return [];
  }
  const codes: HtmlIframeObjectDiagnosticCode[] = [];
  const hasVisibleContent = signals.hasVisibleContent ?? signals.hasOwnVisibleText ?? false;
  const hasExplicitPaint = signals.hasExplicitPaint ?? false;
  const snapshotBoundary = normalizeIframeSnapshotBoundary(signals.snapshotBoundary);
  const requiresSnapshotBoundary = iframeObjectRequiresSnapshotBoundary(signals);
  const ownershipTokens = metadataTokens(signals.ownershipScope);
  const isPrimaryVisual = signals.objectRole === "primary" || signals.studioSlot === "primary-visual";
  const isAnnotationLike =
    signals.objectRole === "annotation" ||
    signals.objectRole === "source" ||
    signals.studioSlot === "annotation" ||
    signals.studioSlot === "source-note";

  if (!hasVisibleContent && !hasExplicitPaint) {
    codes.push("iframe-object-empty-root");
  }
  if ((signals.areaRatio <= 0.001 && !hasVisibleContent) || (signals.looksLikeLayoutShell && !hasVisibleContent && !hasExplicitPaint)) {
    codes.push("iframe-object-unstable-bounds");
  }
  if (requiresSnapshotBoundary && !snapshotBoundary) {
    codes.push("iframe-snapshot-root-missing");
  }
  if (requiresSnapshotBoundary && snapshotBoundary && !hasVisibleContent && !hasExplicitPaint) {
    codes.push("iframe-snapshot-blank");
  }
  if (signals.textOverflow) {
    codes.push("iframe-text-overflow");
  }
  if (isAnnotationLike && signals.parentObjectId && signals.parentObjectId !== signals.objectId) {
    codes.push("iframe-annotation-ownership-leak");
  }
  if (
    (signals.exportObjectKind === "card-grid" || signals.exportObjectKind === "comparison-grid") &&
    (signals.repeatedObjectRootCount ?? 0) >= 7
  ) {
    codes.push("iframe-repeated-card-wall");
  }
  if (
    isPrimaryVisual &&
    signals.hasVisibleText &&
    !ownershipTokens.has("text") &&
    signals.exportObjectKind !== "chart-visual"
  ) {
    codes.push("primary-visual-text-facet-missing");
  }
  if (
    signals.exportObjectKind === "chart-visual" &&
    !signals.chartVisualHasModule &&
    !signals.chartVisualHasDataContract
  ) {
    codes.push("chart-visual-module-missing");
  }

  return codes.filter((code, index) => codes.indexOf(code) === index);
}

export function shouldRejectIframeBackgroundObjectCandidate(
  signals: IframeObjectChromeSignals,
) {
  if (signals.pointerEventsNone) {
    return true;
  }
  if (signals.areaRatio < 0.7) {
    return false;
  }
  const opacity = signals.opacity ?? 1;
  const hasVisibleContent = signals.hasVisibleContent ?? signals.hasOwnVisibleText ?? false;
  return (
    opacity <= 0.12 ||
    (!hasVisibleContent && !signals.hasExplicitPaint) ||
    (Boolean(signals.looksLikeLayoutShell) && !signals.isObjectAnchor)
  );
}

export function shouldRejectIframeFullPageChromeCandidate(
  signals: IframeObjectChromeSignals,
) {
  if (signals.isPageElement) {
    return true;
  }
  if (signals.areaRatio < 0.98) {
    return false;
  }
  if (!signals.isObjectAnchor) {
    return true;
  }
  return shouldRejectIframeBackgroundObjectCandidate(signals);
}

function getIframeObjectChromeSignals(element: Element): IframeObjectChromeSignals {
  const htmlElement = element as HTMLElement;
  const hidden = isHiddenLikeElement(element);
  return {
    areaRatio: estimateInlineElementAreaRatio(element),
    isPageElement: element.matches("section.page"),
    isObjectAnchor: isObjectAnchorElement(element),
    pointerEventsNone: hidden || htmlElement.style.pointerEvents === "none",
    opacity: normalizeOpacity(htmlElement.style.opacity) ?? 1,
    hasOwnVisibleText: hidden ? false : hasOwnVisibleText(element),
    hasVisibleContent: hidden ? false : hasVisibleContent(element),
    hasExplicitPaint: hidden ? false : hasExplicitPaint(element),
    looksLikeLayoutShell: looksLikeLayoutShell(element),
  };
}

function shouldRejectIframeBackgroundObject(element: Element) {
  return shouldRejectIframeBackgroundObjectCandidate(getIframeObjectChromeSignals(element));
}

function shouldRejectIframeFullPageChrome(element: Element) {
  return shouldRejectIframeFullPageChromeCandidate(getIframeObjectChromeSignals(element));
}

function isHiddenCanvasPlaceholderAnchor(element: Element) {
  return (
    element.getAttribute("data-html-canvas-placeholder") === "true" &&
    isObjectAnchorElement(element)
  );
}

function elementHasChartModuleEvidence(element: Element) {
  const moduleKind = element.getAttribute("data-html-module-kind")?.trim();
  if (
    moduleKind === CHART_MODULE_KIND &&
    (element.hasAttribute(HTML_CHART_SPEC_ATTRIBUTE) || element.hasAttribute("data-export-chart"))
  ) {
    return true;
  }
  return Boolean(
    element.querySelector(
      `[data-html-module-kind="${CHART_MODULE_KIND}"][${HTML_CHART_SPEC_ATTRIBUTE}],[data-html-module-kind="${CHART_MODULE_KIND}"][data-export-chart]`,
    ),
  );
}

function chartSeriesHasMinimumData(contract: { categories?: unknown; series?: unknown }) {
  const categories = Array.isArray(contract.categories) ? contract.categories : [];
  const series = Array.isArray(contract.series) ? contract.series : [];
  return (
    categories.length > 0 &&
    series.length > 0 &&
    series.every((entry) => {
      const values = entry && typeof entry === "object" ? (entry as { values?: unknown }).values : null;
      return Array.isArray(values) && values.length === categories.length;
    })
  );
}

function chartDataContractHasMinimumData(contract: unknown) {
  if (!contract || typeof contract !== "object") {
    return false;
  }
  const typed = contract as Record<string, unknown>;
  if (typed.type === "chart-bar" || typed.type === "chart-line" || typed.type === "chart-stacked") {
    return chartSeriesHasMinimumData(typed);
  }
  if (typed.type === "chart-combo") {
    return (
      chartSeriesHasMinimumData({ categories: typed.categories, series: typed.barSeries }) &&
      chartSeriesHasMinimumData({ categories: typed.categories, series: typed.lineSeries })
    );
  }
  if (typed.type === "chart-waterfall") {
    return Array.isArray(typed.steps) && typed.steps.length > 0;
  }
  if (typed.type === "chart-bubble") {
    return Array.isArray(typed.points) && typed.points.length > 0;
  }
  return false;
}

function elementHasCompleteChartDataContract(element: Element) {
  const raw = element.getAttribute("data-export-contract");
  if (!raw) {
    return false;
  }
  try {
    const parsed = JSON.parse(raw) as { dataContract?: unknown };
    return chartDataContractHasMinimumData(parsed.dataContract);
  } catch {
    return false;
  }
}

function estimateTextOverflowRisk(element: Element) {
  const htmlElement = element as HTMLElement;
  const style = htmlElement.style;
  const text = normalizePlainText(element.textContent);
  if (text.length < 80 || isHiddenLikeElement(element)) {
    return false;
  }
  const styleText = (element.getAttribute("style") ?? "").toLowerCase();
  const clipsOverflow =
    style.overflow === "hidden" ||
    style.overflow === "clip" ||
    styleText.includes("overflow:hidden") ||
    styleText.includes("overflow: hidden") ||
    styleText.includes("overflow:clip") ||
    styleText.includes("overflow: clip");
  if (!clipsOverflow) {
    return false;
  }
  const width = parseInlineDimensionPx(style.width, 1600);
  const height = parseInlineDimensionPx(style.height, 900) ?? parseInlineDimensionPx(style.maxHeight, 900);
  if (!width || !height) {
    return false;
  }
  const fontSize = parsePixelValue(style.fontSize) ?? 18;
  const lineHeight = parsePixelValue(style.lineHeight) ?? fontSize * 1.25;
  const charsPerLine = Math.max(8, Math.floor(width / Math.max(7, fontSize * 0.52)));
  const estimatedLines = Math.ceil(text.length / charsPerLine);
  return estimatedLines * lineHeight > height * 1.08;
}

function countCardWallUnits(element: Element) {
  const descendants = Array.from(
    element.querySelectorAll<HTMLElement>(
      "article,.card,.surface-card,.tile,.panel,[data-html-visual-kind=\"surface\"]",
    ),
  );
  return descendants.filter((candidate) => candidate !== element && !isHiddenLikeElement(candidate)).length;
}

function iframeDiagnosticSeverity(code: HtmlIframeObjectDiagnosticCode): HtmlIframeObjectDiagnostic["severity"] {
  return code === "iframe-transparent-scaffold-suppressed" ? "info" : "warning";
}

function iframeDiagnosticMessage(args: {
  code: HtmlIframeObjectDiagnosticCode;
  objectId?: string;
}) {
  const objectLabel = args.objectId ?? "unknown";
  switch (args.code) {
    case "iframe-object-anchor-missing":
      return `Iframe object ${objectLabel} is promised by contract but no data-studio-object-id or data-export-object-id anchor was found.`;
    case "iframe-object-ambiguous-root":
      return `Iframe object ${objectLabel} matched multiple root anchors; Studio will not guess object ownership.`;
    case "iframe-background-object-rejected":
      return `Iframe object ${objectLabel} was rejected because page background/chrome cannot be a selectable object.`;
    case "iframe-transparent-scaffold-suppressed":
      return `Iframe object ${objectLabel} was treated as scaffold because it is transparent or non-interactive chrome.`;
    case "iframe-object-empty-root":
      return `Iframe object ${objectLabel} has an empty canonical root.`;
    case "iframe-object-unstable-bounds":
      return `Iframe object ${objectLabel} has unstable or layout-only bounds.`;
    case "iframe-snapshot-root-missing":
      return `Iframe object ${objectLabel} requires data-snapshot-boundary before it can be used as a snapshot source.`;
    case "iframe-snapshot-blank":
      return `Iframe object ${objectLabel} declares a snapshot boundary but the boundary appears blank.`;
    case "iframe-text-overflow":
      return `Iframe object ${objectLabel} has likely clipped text overflow inside its object boundary.`;
    case "iframe-annotation-ownership-leak":
      return `Iframe object ${objectLabel} is annotation/source content owned by a different object root.`;
    case "iframe-repeated-card-wall":
      return `Iframe object ${objectLabel} looks like a repeated card wall rather than a stable primary visual object.`;
    case "primary-visual-text-facet-missing":
      return `Iframe primary visual ${objectLabel} has visible text but does not expose text ownership.`;
    case "chart-visual-module-missing":
      return `Iframe chart visual ${objectLabel} has neither an editable chart module nor executable chart data.`;
    case "iframe-hidden-placeholder-anchor":
      return `Iframe hidden canvas placeholder ${objectLabel} carried object ownership attributes and was skipped.`;
  }
}

export function shouldCountIframeObjectAnchorRoot(args: {
  objectId?: string;
  parentObjectId?: string;
}) {
  return !args.objectId || args.objectId !== args.parentObjectId;
}

export function inferVisualKind(element: Element): HtmlVisualNodeKind | null {
  const tagName = element.tagName.toUpperCase();
  const tokens = getClassTokens(element);
  const style = (element.getAttribute("style") ?? "").toLowerCase();
  const explicitKind = element.getAttribute("data-html-visual-kind");
  const exportObjectKind = element.getAttribute("data-export-object-kind")?.trim();
  const renderTarget = element.getAttribute("data-render-target")?.trim();
  if (
    explicitKind === "surface" ||
    explicitKind === "divider" ||
    explicitKind === "badge" ||
    explicitKind === "highlight" ||
    explicitKind === "annotation" ||
    explicitKind === "rail" ||
    explicitKind === "chart-frame" ||
    explicitKind === "shape" ||
    explicitKind === "connector" ||
    explicitKind === "node" ||
    explicitKind === "label-surface"
  ) {
    return explicitKind;
  }

  if (exportObjectKind === "chart-visual" || renderTarget === "visual-snapshot") {
    return "chart-frame";
  }

  if (
    exportObjectKind === "native-table" ||
    exportObjectKind === "matrix" ||
    exportObjectKind === "comparison-grid" ||
    exportObjectKind === "metric-grid" ||
    exportObjectKind === "card-grid"
  ) {
    return "surface";
  }

  if (exportObjectKind === "diagram") {
    return "rail";
  }

  if (isObjectAnchorElement(element)) {
    return "surface";
  }

  if (tagName === "LINE" || tagName === "PATH") {
    return "connector";
  }

  if (tagName === "POLYLINE") {
    return "connector";
  }

  if (tagName === "POLYGON") {
    return "shape";
  }

  if (tagName === "CIRCLE" || tagName === "ELLIPSE") {
    return "node";
  }

  if (tagName === "RECT") {
    return "shape";
  }

  if (tagName === "SVG") {
    return "chart-frame";
  }

  if (tagName === "TABLE") {
    return "surface";
  }

  if (tagName === "G") {
    return "surface";
  }

  if (
    tagName === "HR" ||
    tokens.some((token) => token.includes("rule") || token.includes("divider") || token.includes("separator"))
  ) {
    return "divider";
  }

  if (tokens.some((token) => token.includes("badge") || token.includes("pill") || token.includes("tag"))) {
    return "badge";
  }

  if (tokens.some((token) => token.includes("highlight") || token.includes("accent") || token.includes("emphasis"))) {
    return "highlight";
  }

  if (
    tokens.some(
      (token) =>
        token.includes("annotation") ||
        token.includes("callout") ||
        token.includes("note") ||
        token.includes("quote"),
    )
  ) {
    return "annotation";
  }

  if (tokens.some((token) => token.includes("rail") || token.includes("sidebar"))) {
    return "rail";
  }

  if (
    tokens.some((token) => token.includes("chart") || token.includes("plot") || token.includes("graph")) ||
    style.includes("aspect-ratio") ||
    (style.includes("min-height") &&
      (tokens.some((token) => token.includes("chart")) || element.querySelector("svg")))
  ) {
    return "chart-frame";
  }

  if (
    tokens.some(
      (token) =>
        token.includes("card") ||
        token.includes("panel") ||
        token.includes("surface") ||
        token.includes("kpi") ||
        token.includes("insight") ||
        token.includes("action") ||
        token.includes("matrix") ||
        token.includes("quadrant") ||
        token.includes("tile") ||
        token.includes("box"),
    )
  ) {
    return "surface";
  }

  if (
    style.includes("background") ||
    style.includes("border") ||
    style.includes("border-radius") ||
    style.includes("box-shadow")
  ) {
    return isTextLikeVisualSurface(element) ? "label-surface" : "surface";
  }

  return null;
}

function isLikelyVisualElement(element: Element) {
  if (element.matches("section.page")) {
    return false;
  }

  const isObjectAnchor = isObjectAnchorElement(element);

  if (!isObjectAnchor && (element.matches(TEXTUAL_SELECTOR) || element.closest(TEXTUAL_SELECTOR))) {
    return false;
  }

  if (shouldRejectIframeFullPageChrome(element) || shouldRejectIframeBackgroundObject(element)) {
    return false;
  }

  const kind = inferVisualKind(element);
  if (!kind) {
    return false;
  }

  const tokens = getClassTokens(element);
  const hasInlineStyle = Boolean((element.getAttribute("style") ?? "").trim());
  const hasStrongKeyword = hasVisualKeyword(tokens);
  const tagName = element.tagName.toUpperCase();
  const isSvgPrimitive =
    tagName === "SVG" ||
    tagName === "G" ||
    tagName === "RECT" ||
    tagName === "CIRCLE" ||
    tagName === "ELLIPSE" ||
    tagName === "LINE" ||
    tagName === "PATH" ||
    tagName === "POLYGON" ||
    tagName === "POLYLINE";

  const objectRoot = element.parentElement?.closest(OBJECT_ANCHOR_SELECTOR);
  if (
    !isObjectAnchor &&
    objectRoot &&
    objectRoot !== element &&
    isObjectAnchorElement(objectRoot) &&
    !shouldExposeObjectDescendantVisual({
      element,
      kind,
      isSvgPrimitive,
      hasInlineStyle,
      hasStrongKeyword,
    })
  ) {
    return false;
  }

  if (!isObjectAnchor && !isSvgPrimitive && !hasInlineStyle && !hasStrongKeyword && element.children.length > 6) {
    return false;
  }

  const moduleRoot = element.closest("[data-html-module-kind]");
  const moduleKind = moduleRoot?.getAttribute("data-html-module-kind")?.trim();

  if (moduleRoot && moduleRoot !== element) {
    if (moduleKind === CHART_MODULE_KIND || moduleKind === TABLE_MODULE_KIND) {
      return false;
    }
    if (
      moduleKind === SCIENTIFIC_DIAGRAM_MODULE_KIND &&
      !hasInlineStyle &&
      !isSvgPrimitive
    ) {
      return false;
    }
  }

  return true;
}

export function collectHtmlVisualCandidates(page: Element) {
  return Array.from(page.querySelectorAll(VISUAL_SELECTOR))
    .filter(isLikelyVisualElement);
}

function collectIframeObjectDiagnostics(args: {
  page: Element;
  pageNumber: number;
  exportContract?: DeckExportContract | null;
}): HtmlIframeObjectDiagnostic[] {
  const diagnostics: HtmlIframeObjectDiagnostic[] = [];
  const anchorElements = Array.from(
    args.page.querySelectorAll(OBJECT_ANCHOR_SELECTOR),
  );
  const hiddenPlaceholderAnchors = anchorElements.filter(isHiddenCanvasPlaceholderAnchor);
  hiddenPlaceholderAnchors.forEach((element) => {
    const objectId = readExportObjectId(element) ?? readStudioObjectId(element);
    diagnostics.push({
      code: "iframe-hidden-placeholder-anchor",
      severity: "warning",
      pageNumber: args.pageNumber,
      objectId,
      message: iframeDiagnosticMessage({
        code: "iframe-hidden-placeholder-anchor",
        objectId,
      }),
    });
  });
  const anchorRootElements = anchorElements.filter((element) => {
    if (isHiddenCanvasPlaceholderAnchor(element)) {
      return false;
    }
    const objectId = readExportObjectId(element) ?? readStudioObjectId(element);
    const parentAnchor = element.parentElement?.closest(OBJECT_ANCHOR_SELECTOR);
    const parentObjectId = parentAnchor
      ? readExportObjectId(parentAnchor) ?? readStudioObjectId(parentAnchor)
      : undefined;
    return shouldCountIframeObjectAnchorRoot({ objectId, parentObjectId });
  });
  const anchorCounts = new Map<string, number>();
  const cardLikeAnchorCount = anchorRootElements.filter((element) => {
    const kind = element.getAttribute("data-export-object-kind")?.trim();
    return kind === "card-grid" || kind === "comparison-grid";
  }).length;
  anchorRootElements.forEach((element) => {
    const objectId = readExportObjectId(element) ?? readStudioObjectId(element);
    if (!objectId) {
      return;
    }
    anchorCounts.set(objectId, (anchorCounts.get(objectId) ?? 0) + 1);
  });

  const pageContract = args.exportContract?.pages.find(
    (pageContract) => pageContract.pageNumber === args.pageNumber,
  );
  pageContract?.objects.forEach((object) => {
    if (!anchorCounts.has(object.objectId)) {
      diagnostics.push({
        code: "iframe-object-anchor-missing",
        severity: "warning",
        pageNumber: args.pageNumber,
        objectId: object.objectId,
        message: `Iframe object ${object.objectId} is promised by contract but no data-studio-object-id or data-export-object-id anchor was found.`,
      });
    }
  });
  anchorCounts.forEach((count, objectId) => {
    if (count > 1) {
      diagnostics.push({
        code: "iframe-object-ambiguous-root",
        severity: "warning",
        pageNumber: args.pageNumber,
        objectId,
        message: `Iframe object ${objectId} matched ${count} root anchors; Studio will not guess object ownership.`,
      });
    }
  });

  anchorRootElements.forEach(
    (element) => {
      const objectId = readExportObjectId(element) ?? readStudioObjectId(element);
      const parentAnchor = element.parentElement?.closest(OBJECT_ANCHOR_SELECTOR);
      const parentObjectId = parentAnchor
        ? readExportObjectId(parentAnchor) ?? readStudioObjectId(parentAnchor)
        : undefined;
      const boundaryCodes = diagnoseIframeObjectBoundarySignals({
        ...getIframeObjectChromeSignals(element),
        objectId,
        parentObjectId,
        exportObjectKind: element.getAttribute("data-export-object-kind")?.trim() || undefined,
        renderTarget: element.getAttribute("data-render-target")?.trim() || undefined,
        objectRole: element.getAttribute("data-object-role")?.trim() || undefined,
        studioSlot: element.getAttribute("data-studio-slot")?.trim() || undefined,
        snapshotBoundary: element.getAttribute("data-snapshot-boundary")?.trim() || undefined,
        ownershipScope: element.getAttribute("data-ownership-scope")?.trim() || undefined,
        repeatedObjectRootCount: Math.max(
          objectId ? anchorCounts.get(objectId) ?? 0 : 0,
          cardLikeAnchorCount,
          countCardWallUnits(element),
        ),
        textOverflow: estimateTextOverflowRisk(element),
        hasVisibleText: hasVisibleTextContent(element),
        chartVisualHasModule: elementHasChartModuleEvidence(element),
        chartVisualHasDataContract: elementHasCompleteChartDataContract(element),
      });
      boundaryCodes.forEach((code) => {
        diagnostics.push({
          code,
          severity: iframeDiagnosticSeverity(code),
          pageNumber: args.pageNumber,
          objectId,
          message: iframeDiagnosticMessage({
            code,
            objectId,
          }),
        });
      });
      if (shouldRejectIframeFullPageChrome(element)) {
        diagnostics.push({
          code: "iframe-background-object-rejected",
          severity: "warning",
          pageNumber: args.pageNumber,
          objectId,
          message: `Iframe object ${objectId ?? "unknown"} was rejected because page background/chrome cannot be a selectable object.`,
        });
        return;
      }
      if (shouldRejectIframeBackgroundObject(element)) {
        diagnostics.push({
          code: "iframe-transparent-scaffold-suppressed",
          severity: "info",
          pageNumber: args.pageNumber,
          objectId,
          message: `Iframe object ${objectId ?? "unknown"} was treated as scaffold because it is transparent or non-interactive chrome.`,
        });
      }
    },
  );
  return diagnostics;
}

function buildDefaultVisualNodeStyle(
  kind: HtmlVisualNodeKind,
  pageStyle: HtmlPageVisualStyle,
): HtmlVisualNodeStyle {
  switch (kind) {
    case "divider":
      return {
        background: pageStyle.dividerColor,
        border: pageStyle.dividerColor,
        borderWidth: 1,
        opacity: 1,
      };
    case "badge":
      return {
        background: pageStyle.surfaceFill,
        border: pageStyle.dividerColor,
        borderWidth: 1,
        radius: 999,
        accent: pageStyle.accentColor,
        opacity: 1,
      };
    case "highlight":
      return {
        background: "#fff4d8",
        border: pageStyle.dividerColor,
        borderWidth: 1,
        radius: 18,
        accent: pageStyle.accentColor,
        opacity: 1,
      };
    case "annotation":
      return {
        background: pageStyle.surfaceFill,
        border: pageStyle.dividerColor,
        borderWidth: 1,
        radius: 22,
        accent: pageStyle.accentColor,
        opacity: 1,
      };
    case "rail":
      return {
        background: "#f6f1e8",
        border: pageStyle.dividerColor,
        borderWidth: 1,
        radius: 26,
        accent: pageStyle.accentColor,
        opacity: 1,
      };
    case "chart-frame":
      return {
        background: pageStyle.surfaceFill,
        border: pageStyle.dividerColor,
        borderWidth: 1,
        radius: 18,
        accent: pageStyle.accentColor,
        opacity: 1,
      };
    case "label-surface":
      return {
        background: pageStyle.surfaceFill,
        border: pageStyle.dividerColor,
        borderWidth: 1,
        radius: 14,
        accent: pageStyle.accentColor,
        opacity: 1,
      };
    case "shape":
      return {
        background: pageStyle.surfaceFill,
        border: pageStyle.dividerColor,
        borderWidth: 1,
        radius: 12,
        opacity: 1,
      };
    case "connector":
      return {
        background: "transparent",
        border: pageStyle.dividerColor,
        borderWidth: 2,
        accent: pageStyle.accentColor,
        opacity: 1,
      };
    case "node":
      return {
        background: pageStyle.surfaceFill,
        border: pageStyle.accentColor,
        borderWidth: 2,
        radius: 999,
        accent: pageStyle.accentColor,
        opacity: 1,
      };
    case "surface":
    default:
      return {
        background: pageStyle.surfaceFill,
        border: DEFAULT_SURFACE_BORDER,
        borderWidth: 1,
        radius: 24,
        opacity: 1,
      };
  }
}

function extractNodeStyle(
  element: Element,
  kind: HtmlVisualNodeKind,
  pageStyle: HtmlPageVisualStyle,
): HtmlVisualNodeStyle {
  const node = element as HTMLElement;
  const inlineStyle = node.style;
  const base = buildDefaultVisualNodeStyle(kind, pageStyle);
  const borderWidth =
    parsePixelValue(node.getAttribute("data-html-visual-border-width")) ??
    parsePixelValue(inlineStyle.borderWidth) ??
    parsePixelValue(inlineStyle.borderLeftWidth) ??
    parsePixelValue(inlineStyle.borderTopWidth) ??
    base.borderWidth;

  return {
    background:
      normalizeStyleColor(node.getAttribute("data-html-visual-fill")) ??
      normalizeStyleColor(inlineStyle.background) ??
      normalizeStyleColor(inlineStyle.backgroundColor) ??
      base.background,
    border:
      normalizeStyleColor(node.getAttribute("data-html-visual-border")) ??
      normalizeStyleColor(inlineStyle.borderColor) ??
      normalizeStyleColor(inlineStyle.borderLeftColor) ??
      normalizeStyleColor(inlineStyle.borderTopColor) ??
      base.border,
    borderWidth,
    radius:
      parsePixelValue(node.getAttribute("data-html-visual-radius")) ??
      parsePixelValue(inlineStyle.borderRadius) ??
      base.radius,
    accent:
      normalizeStyleColor(node.getAttribute("data-html-visual-accent")) ??
      normalizeStyleColor(inlineStyle.getPropertyValue("--ppt-accent")) ??
      normalizeStyleColor(inlineStyle.borderLeftColor) ??
      base.accent,
    opacity:
      normalizeOpacity(node.getAttribute("data-html-visual-opacity")) ??
      normalizeOpacity(inlineStyle.opacity) ??
      base.opacity,
    widthPercent:
      parsePercentValue(node.getAttribute("data-html-visual-width")) ??
      parsePercentValue(inlineStyle.width) ??
      parsePercentValue(inlineStyle.flexBasis),
    height:
      parsePixelValue(node.getAttribute("data-html-visual-height")) ??
      parsePixelValue(inlineStyle.height),
    minHeight:
      parsePixelValue(node.getAttribute("data-html-visual-min-height")) ??
      parsePixelValue(inlineStyle.minHeight) ??
      parsePixelValue(inlineStyle.height),
    padding:
      parsePixelValue(node.getAttribute("data-html-visual-padding")) ??
      parsePixelValue(inlineStyle.padding),
  };
}

function getCandidateSelectionPriority(
  fitParticipation: HtmlFitParticipation,
): HtmlVisualSelectionPriority {
  return fitParticipation === "content" ? "primary" : "secondary";
}

function getCandidateAtomizationRole(args: {
  kind: HtmlVisualNodeKind;
  childCount: number;
  fitParticipation: HtmlFitParticipation;
  moduleKind?: string;
  sourceTag: string;
}) {
  if (args.moduleKind === CHART_MODULE_KIND || args.moduleKind === TABLE_MODULE_KIND) {
    return "leaf" satisfies HtmlVisualAtomizationRole;
  }

  if (args.childCount === 0) {
    return "leaf" satisfies HtmlVisualAtomizationRole;
  }

  if (args.sourceTag === "svg" || args.sourceTag === "g") {
    return "container" satisfies HtmlVisualAtomizationRole;
  }

  if (args.kind === "chart-frame" || args.kind === "annotation" || args.kind === "label-surface") {
    return "container" satisfies HtmlVisualAtomizationRole;
  }

  if (args.kind === "surface" || args.kind === "rail" || args.kind === "highlight") {
    return args.fitParticipation === "content"
      ? "container" satisfies HtmlVisualAtomizationRole
      : "scaffold" satisfies HtmlVisualAtomizationRole;
  }

  if (
    args.kind === "divider" ||
    args.moduleKind === SCIENTIFIC_DIAGRAM_MODULE_KIND
  ) {
    return "scaffold" satisfies HtmlVisualAtomizationRole;
  }

  return args.fitParticipation === "content" ? "container" : "scaffold";
}

function buildAtomizedVisualNodes(args: {
  page: Element;
  pageNumber: number;
  pageStyle: HtmlPageVisualStyle;
}) {
  const candidates = collectHtmlVisualCandidates(args.page);
  const editableCandidates = new Set(collectHtmlEditableCandidates(args.page));
  const fallbackIdCounts = new Map<string, number>();
  const indexByElement = new Map<Element, number>();

  const prepared: InternalVisualCandidate[] = candidates.map((element, sourceIndex) => {
    indexByElement.set(element, sourceIndex);
    const kind = inferVisualKind(element) ?? "surface";
    const moduleId = element.getAttribute("data-html-module-id")?.trim();
    const moduleLabel = element.getAttribute("data-html-module-label")?.trim();
    const moduleKind = element.getAttribute("data-html-module-kind")?.trim();
    const studioObjectId = readStudioObjectId(element);
    const exportObjectId = readExportObjectId(element);
    const exportObjectKind = element.getAttribute("data-export-object-kind")?.trim() || undefined;
    const objectRole = element.getAttribute("data-object-role")?.trim() || undefined;
    const studioSlot = element.getAttribute("data-studio-slot")?.trim() || undefined;
    const renderTarget = element.getAttribute("data-render-target")?.trim() || undefined;
    const snapshotBoundary = element.getAttribute("data-snapshot-boundary")?.trim() || undefined;
    const diagramSpec =
      moduleKind === SCIENTIFIC_DIAGRAM_MODULE_KIND
        ? parseScientificDiagramSpec(element.getAttribute(SCIENTIFIC_DIAGRAM_SPEC_ATTRIBUTE))
        : null;
    const chartSpec =
      moduleKind === CHART_MODULE_KIND
        ? parseHtmlChartSpec(element.getAttribute(HTML_CHART_SPEC_ATTRIBUTE))
        : null;
    const tableSpec =
      moduleKind === TABLE_MODULE_KIND
        ? parseHtmlTableSpec(element.getAttribute(HTML_TABLE_SPEC_ATTRIBUTE))
        : null;
    const fitParticipation = resolveHtmlVisualFitParticipation({
      kind,
      explicitFitParticipation: readHtmlFitParticipation(element),
      hasModuleBinding: Boolean(moduleId || moduleLabel),
      hasEditableText:
        (editableCandidates.has(element) &&
          shouldPromoteEditableVisualToContent(kind)) ||
        shouldTreatPaintedTextGroupAsContent(element, kind),
    });

    return {
      element,
      sourceIndex,
      sourceTag: element.tagName.toLowerCase(),
      sourcePath: buildElementSourcePath(args.page, element),
      kind,
      moduleId,
      moduleLabel,
      moduleKind,
      diagramSpec,
      chartSpec,
      tableSpec,
      dataTable: tableSpec,
      fitParticipation,
      parentIndex: null,
      childIndices: [] as number[],
      atomizationRole: "leaf" as HtmlVisualAtomizationRole,
      selectionPriority: "secondary" as HtmlVisualSelectionPriority,
      style: extractNodeStyle(element, kind, args.pageStyle),
      studioObjectId,
      exportObjectId,
      exportObjectKind,
      objectRole,
      studioSlot,
      renderTarget,
      snapshotBoundary,
      isContractRoot: Boolean(studioObjectId || exportObjectId),
    };
  });

  prepared.forEach((candidate, index) => {
    let parent = candidate.element.parentElement;
    while (parent && parent !== args.page) {
      const parentIndex = indexByElement.get(parent);
      if (typeof parentIndex === "number") {
        candidate.parentIndex = parentIndex;
        prepared[parentIndex]?.childIndices.push(index);
        break;
      }
      parent = parent.parentElement;
    }
  });

  const ids = prepared.map((candidate) => {
    const persistentId = candidate.element.getAttribute("data-html-visual-key")?.trim();
    if (persistentId) {
      return persistentId;
    }

    const fallbackSignature = buildVisualIdentitySignature({
      element: candidate.element,
      kind: candidate.kind,
    });
    const fallbackOrdinal = fallbackIdCounts.get(fallbackSignature) ?? 0;
    fallbackIdCounts.set(fallbackSignature, fallbackOrdinal + 1);
    return buildStableVisualFallbackId({
      pageNumber: args.pageNumber,
      kind: candidate.kind,
      signature: fallbackSignature,
      duplicateOrdinal: fallbackOrdinal,
    });
  });

  return prepared.map((candidate, index) => {
    const atomizationRole = getCandidateAtomizationRole({
      kind: candidate.kind,
      childCount: candidate.childIndices.length,
      fitParticipation: candidate.fitParticipation,
      moduleKind: candidate.moduleKind,
      sourceTag: candidate.sourceTag,
    });
    candidate.atomizationRole = atomizationRole;
    candidate.selectionPriority =
      candidate.moduleKind === CHART_MODULE_KIND || candidate.moduleKind === TABLE_MODULE_KIND
        ? "primary"
        : atomizationRole === "leaf"
        ? getCandidateSelectionPriority(candidate.fitParticipation)
        : "secondary";
    return {
      id: ids[index]!,
      kind: candidate.kind,
      fitParticipation: candidate.fitParticipation,
      pageNumber: args.pageNumber,
      sourceTag: candidate.sourceTag,
      sourceIndex: candidate.sourceIndex,
      sourcePath: candidate.sourcePath,
      studioObjectId: candidate.studioObjectId,
      exportObjectId: candidate.exportObjectId,
      exportObjectKind: candidate.exportObjectKind,
      objectRole: candidate.objectRole,
      studioSlot: candidate.studioSlot,
      renderTarget: candidate.renderTarget,
      snapshotBoundary: candidate.snapshotBoundary,
      isContractRoot: candidate.isContractRoot || undefined,
      moduleId: candidate.moduleId || undefined,
      moduleLabel: candidate.moduleLabel || undefined,
      moduleKind:
        candidate.moduleKind === SCIENTIFIC_DIAGRAM_MODULE_KIND ||
        candidate.moduleKind === CHART_MODULE_KIND ||
        candidate.moduleKind === TABLE_MODULE_KIND
          ? candidate.moduleKind
          : undefined,
      diagramSpec: candidate.diagramSpec,
      chartSpec: candidate.chartSpec,
      tableSpec: candidate.tableSpec,
      dataTable: candidate.dataTable,
      parentId: candidate.parentIndex == null ? null : ids[candidate.parentIndex]!,
      childIds: candidate.childIndices.map((childIndex) => ids[childIndex]!).filter(Boolean),
      atomizationRole,
      selectionPriority: candidate.selectionPriority,
      style: candidate.style,
    } satisfies HtmlVisualNode;
  });
}

function extractPageVisualNodes(
  page: Element,
  pageNumber: number,
  pageStyle: HtmlPageVisualStyle,
) {
  return buildAtomizedVisualNodes({
    page,
    pageNumber,
    pageStyle,
  });
}

export function extractHtmlPageVisualStyle(args: {
  report: GeneratedHtmlReport;
  pageNumber: number;
}): HtmlPageVisualStyle {
  const fallbackStyle = resolveReportStyleFallback(args.report);
  if (typeof DOMParser === "undefined") {
    return fallbackStyle;
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(args.report.html, "text/html");
  const page = document.querySelectorAll("section.page")[args.pageNumber - 1];
  if (!page) {
    return fallbackStyle;
  }

  return {
    pageBackground: normalizeCssPaint(
      page.getAttribute("data-page-bg") ?? "",
      fallbackStyle.pageBackground,
    ),
    dividerColor: normalizeCssPaint(
      page.getAttribute("data-divider-color") ?? "",
      fallbackStyle.dividerColor,
    ),
    surfaceFill: normalizeCssPaint(
      page.getAttribute("data-surface-fill") ?? "",
      fallbackStyle.surfaceFill,
    ),
    accentColor: normalizeCssPaint(
      page.getAttribute("data-page-accent") ?? "",
      fallbackStyle.accentColor,
    ),
  };
}

export function extractHtmlVisualStructure(args: {
  html: string;
  pageTitles?: string[];
  styleProfile?: GeneratedHtmlReport["styleProfile"];
  exportContract?: DeckExportContract | null;
}): HtmlVisualStructure {
  const fallbackStyle = resolveReportStyleFallback(
    args.styleProfile ? { styleProfile: args.styleProfile, styleProfileId: args.styleProfile.id } : null,
  );
  if (typeof DOMParser === "undefined") {
    return { pages: [] };
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(args.html, "text/html");
  const pages = Array.from(document.querySelectorAll("section.page")).map((page, index) => {
    canonicalizeDataBackedModulesOnPage(page);
    const pageNumber = index + 1;
    const pageStyle = {
      pageBackground: normalizeCssPaint(
        page.getAttribute("data-page-bg") ?? "",
        fallbackStyle.pageBackground,
      ),
      dividerColor: normalizeCssPaint(
        page.getAttribute("data-divider-color") ?? "",
        fallbackStyle.dividerColor,
      ),
      surfaceFill: normalizeCssPaint(
        page.getAttribute("data-surface-fill") ?? "",
        fallbackStyle.surfaceFill,
      ),
      accentColor: normalizeCssPaint(
        page.getAttribute("data-page-accent") ?? "",
        fallbackStyle.accentColor,
      ),
    };

    return {
      pageNumber,
      nodes: extractPageVisualNodes(page, pageNumber, pageStyle),
      objectDiagnostics: collectIframeObjectDiagnostics({
        page,
        pageNumber,
        exportContract: args.exportContract,
      }),
    } satisfies HtmlVisualPage;
  });

  return { pages };
}

export function ensureHtmlVisualStructure(
  report: Pick<
    GeneratedHtmlReport,
    "html" | "pageTitles" | "visualStructure" | "styleProfile" | "styleProfileId"
    | "exportContract"
  >,
): HtmlVisualStructure {
  const extracted = extractHtmlVisualStructure({
    html: report.html,
    pageTitles: report.pageTitles,
    styleProfile: report.styleProfile,
    exportContract: report.exportContract,
  });

  const hasReusableStructure = report.visualStructure?.pages?.length
    ? report.visualStructure.pages.every((page) =>
        page.nodes.every(
          (node) =>
            typeof node.sourceTag === "string" &&
            node.sourceTag.length > 0 &&
            typeof node.sourceIndex === "number" &&
            Number.isFinite(node.sourceIndex) &&
            (node.fitParticipation === "content" || node.fitParticipation === "decorative"),
        ),
      )
    : false;

  if (hasReusableStructure && report.visualStructure) {
    const extractedIntroducesModules = extracted.pages.some((page, pageIndex) => {
      const existingPage = report.visualStructure?.pages[pageIndex];
      return page.nodes.some((node, nodeIndex) => {
        const existingNode = existingPage?.nodes[nodeIndex];
        return Boolean(node.moduleKind && !existingNode?.moduleKind);
      });
    });

    if (extractedIntroducesModules) {
      return extracted;
    }

    const extractedHasMoreCoverage = extracted.pages.some((page, pageIndex) => {
      const existingPage = report.visualStructure?.pages[pageIndex];
      if (!existingPage) {
        return true;
      }
      return page.nodes.length > existingPage.nodes.length;
    });

    if (!extractedHasMoreCoverage) {
      return report.visualStructure;
    }
  }

  return extracted;
}

export function annotateHtmlFitRolesOnPage(pageElement: Element): void {
  canonicalizeDataBackedModulesOnPage(pageElement);
  const explicitRoles = new Map<Element, NonNullable<ReturnType<typeof readHtmlFitParticipation>>>();
  pageElement
    .querySelectorAll(`[${HTML_FIT_ROLE_ATTRIBUTE}]`)
    .forEach((element) => {
      const fitParticipation = readHtmlFitParticipation(element);
      if (fitParticipation) {
        explicitRoles.set(element, fitParticipation);
      }
      element.removeAttribute(HTML_FIT_ROLE_ATTRIBUTE);
    });

  setHtmlFitParticipation(pageElement, "decorative", {
    preserveContent: false,
  });

  const editableCandidates = collectHtmlEditableCandidates(pageElement);
  const editableSet = new Set(editableCandidates);
  editableCandidates.forEach((element) => {
    setHtmlFitParticipation(element, "content", {
      preserveContent: false,
    });
  });

  collectHtmlVisualCandidates(pageElement).forEach((element) => {
    const kind = inferVisualKind(element) ?? "surface";
    const moduleId = element.getAttribute("data-html-module-id")?.trim();
    const moduleLabel = element.getAttribute("data-html-module-label")?.trim();
    setHtmlFitParticipation(
      element,
      resolveHtmlVisualFitParticipation({
        kind,
        explicitFitParticipation: explicitRoles.get(element) ?? null,
        hasModuleBinding: Boolean(moduleId || moduleLabel),
        hasEditableText:
          editableSet.has(element) &&
          shouldPromoteEditableVisualToContent(kind),
      }),
      {
        preserveContent: false,
      },
    );
  });
}

function refreshReportVisualArtifacts(args: {
  report: GeneratedHtmlReport;
  document: Document;
}) {
  args.document
    .querySelectorAll("section.page")
    .forEach((page) => annotateHtmlFitRolesOnPage(page));
  const nextHtml = createSerializableHtml(args.document);
  const nextStructure = extractHtmlEditableStructure({
    html: nextHtml,
    pageTitles: args.report.pageTitles,
  });
  const nextVisualStructure = extractHtmlVisualStructure({
    html: nextHtml,
    pageTitles: nextStructure.pages.map((page) => page.title),
    styleProfile: args.report.styleProfile,
  });

  return {
    ...args.report,
    html: nextHtml,
    pageTitles: nextStructure.pages.map((page) => page.title),
    structure: nextStructure,
    visualStructure: nextVisualStructure,
    layoutStructure: args.report.layoutStructure,
    canvasOverrides: pruneGeneratedHtmlReportCanvasOverrides({
      overrides: args.report.canvasOverrides,
      structure: nextStructure,
      visualStructure: nextVisualStructure,
    }),
  };
}

function applyDividerStyle(element: HTMLElement, style: HtmlVisualNodeStyle) {
  const fill = normalizeStyleColor(style.background) || DEFAULT_DIVIDER_COLOR;
  const borderWidth = Math.max(1, Math.round(style.borderWidth ?? 1));
  element.style.height = `${borderWidth}px`;
  element.style.minHeight = `${borderWidth}px`;
  element.style.border = "0";
  element.style.borderRadius = "999px";
  element.style.background = buildDividerBackground(fill);
  if (style.opacity !== undefined) {
    element.style.opacity = String(style.opacity);
  }
  element.setAttribute("data-html-visual-fill", fill);
  element.setAttribute("data-html-visual-border", fill);
  element.setAttribute("data-html-visual-border-width", String(borderWidth));
  element.setAttribute("data-export-role", "divider");
  element.setAttribute("data-export-fill", fill);
  element.setAttribute("data-export-border", fill);
  element.setAttribute("data-export-border-width", String(borderWidth));
  element.setAttribute("data-export-radius", "999");
}

function applyPanelStyle(
  element: HTMLElement,
  kind: HtmlVisualNodeKind,
  style: HtmlVisualNodeStyle,
) {
  const fill = normalizeStyleColor(style.background);
  const border = normalizeStyleColor(style.border);
  const borderWidth = Math.max(0, Math.round(style.borderWidth ?? 1));
  const radius = Math.max(0, Math.round(style.radius ?? 18));
  const accent = normalizeStyleColor(style.accent);
  const widthPercent =
    style.widthPercent !== undefined
      ? Math.max(18, Math.min(100, Math.round(style.widthPercent)))
      : undefined;
  const height =
    style.height !== undefined
      ? Math.max(0, Math.round(style.height))
      : undefined;
  const minHeight =
    style.minHeight !== undefined
      ? Math.max(0, Math.round(style.minHeight))
      : undefined;
  const padding =
    style.padding !== undefined
      ? Math.max(0, Math.round(style.padding))
      : undefined;

  if (fill) {
    element.style.background = fill;
    element.setAttribute("data-html-visual-fill", fill);
    element.setAttribute("data-export-fill", fill);
  }
  if (border) {
    element.style.borderStyle = borderWidth > 0 ? "solid" : "none";
    element.style.borderColor = border;
    element.style.borderWidth = `${borderWidth}px`;
    element.setAttribute("data-html-visual-border", border);
    element.setAttribute("data-export-border", border);
  }
  element.setAttribute("data-html-visual-border-width", String(borderWidth));
  element.setAttribute("data-export-border-width", String(borderWidth));
  element.style.borderRadius = `${radius}px`;
  element.setAttribute("data-html-visual-radius", String(radius));
  element.setAttribute("data-export-radius", String(radius));

  if (accent) {
    element.style.setProperty("--ppt-accent", accent);
    element.setAttribute("data-html-visual-accent", accent);
    element.setAttribute("data-export-accent", accent);

    if (kind === "highlight" || kind === "annotation" || kind === "rail") {
      element.style.boxShadow = `inset 4px 0 0 ${accent}`;
      element.style.paddingLeft = "20px";
    }

    if (kind === "badge") {
      element.style.color = accent;
    }
  } else if (kind === "highlight" || kind === "annotation" || kind === "rail") {
    element.style.removeProperty("box-shadow");
  }

  if (style.opacity !== undefined) {
    element.style.opacity = String(style.opacity);
    element.setAttribute("data-html-visual-opacity", String(style.opacity));
    element.setAttribute("data-export-opacity", String(style.opacity));
  }

  if (widthPercent !== undefined) {
    element.style.width = `${widthPercent}%`;
    element.style.maxWidth = "100%";
    element.style.flexBasis = `${widthPercent}%`;
    element.setAttribute("data-html-visual-width", String(widthPercent));
  }

  if (height !== undefined) {
    element.style.height = height > 0 ? `${height}px` : "";
    element.setAttribute("data-html-visual-height", String(height));
  }

  if (minHeight !== undefined) {
    element.style.minHeight = minHeight > 0 ? `${minHeight}px` : "";
    element.setAttribute("data-html-visual-min-height", String(minHeight));
  }

  if (padding !== undefined && kind !== "divider") {
    element.style.padding = `${padding}px`;
    element.setAttribute("data-html-visual-padding", String(padding));
  }
}

function applyVisualNodeStyleToElement(
  element: HTMLElement,
  kind: HtmlVisualNodeKind,
  style: HtmlVisualNodeStyle,
) {
  element.setAttribute("data-html-visual-kind", kind);
  element.setAttribute("data-export-role", kind);
  if (kind === "divider") {
    applyDividerStyle(element, style);
  } else {
    applyPanelStyle(element, kind, style);
  }

  setHtmlFitParticipation(
    element,
    resolveHtmlVisualFitParticipation({
      kind,
      explicitFitParticipation: readHtmlFitParticipation(element),
      hasModuleBinding: Boolean(
        element.getAttribute("data-html-module-id")?.trim() ||
          element.getAttribute("data-html-module-label")?.trim(),
      ),
      hasEditableText:
        Boolean(element.getAttribute("data-html-block-id")?.trim()) &&
        shouldPromoteEditableVisualToContent(kind),
    }),
    {
      preserveContent: false,
    },
  );
}

function buildPageScopedReport(args: {
  report: GeneratedHtmlReport;
  pageNumber: number;
}) {
  const parser = new DOMParser();
  const document = parser.parseFromString(args.report.html, "text/html");
  const page = document.querySelectorAll("section.page")[args.pageNumber - 1];
  if (page) {
    canonicalizeDataBackedModulesOnPage(page);
  }
  return {
    document,
    page: page as HTMLElement | undefined,
  };
}

function findVisualNodeElement(args: {
  page: Element;
  node: HtmlVisualNode;
}) {
  const candidates = collectHtmlVisualCandidates(args.page);
  const element = candidates[args.node.sourceIndex] as HTMLElement | undefined;
  if (!element) {
    return null;
  }

  if (element.tagName.toLowerCase() !== args.node.sourceTag.toLowerCase()) {
    return null;
  }

  return element;
}

function createVisualSeedId(kind: HtmlVisualNodeKind) {
  return `visual-added-${kind}-${Math.random().toString(36).slice(2, 8)}`;
}

function findVisualInsertionContainer(page: HTMLElement) {
  const selectors = [
    "[data-page-body]",
    ".page-body",
    ".content-grid",
    ".page-grid",
    ".content",
    ".body",
    ".grid",
    "main",
  ];

  for (const selector of selectors) {
    const match = page.querySelector(selector);
    if (match instanceof HTMLElement) {
      return match;
    }
  }

  return page;
}

function insertElementBelow(target: HTMLElement, element: HTMLElement) {
  const rowContainer =
    target.closest<HTMLElement>('[data-codex-visual-row="true"]') ?? target;
  rowContainer.insertAdjacentElement("afterend", element);
}

function ensureVisualRowContainer(document: Document, target: HTMLElement) {
  const existingRow = target.closest<HTMLElement>('[data-codex-visual-row="true"]');
  if (existingRow) {
    return existingRow;
  }

  const row = document.createElement("div");
  row.className = "codex-added-visual-row";
  row.setAttribute("data-codex-visual-row", "true");
  row.style.display = "grid";
  row.style.gridTemplateColumns = "minmax(0, 1fr) minmax(0, 1fr)";
  row.style.gap = "18px";
  row.style.alignItems = "stretch";
  row.style.marginTop = "18px";
  target.insertAdjacentElement("beforebegin", row);
  row.appendChild(target);
  return row;
}

function insertElementBeside(args: {
  document: Document;
  target: HTMLElement;
  element: HTMLElement;
}) {
  const parent = args.target.parentElement as HTMLElement | null;
  const view = args.document.defaultView;
  const parentDisplay =
    parent && view
      ? view.getComputedStyle(parent).display
      : (parent?.style.display ?? "");

  if (parent && (parentDisplay.includes("grid") || parentDisplay.includes("flex"))) {
    args.element.style.marginTop = "0";
    args.target.insertAdjacentElement("afterend", args.element);
    return;
  }

  const row = ensureVisualRowContainer(args.document, args.target);
  args.element.style.marginTop = "0";
  row.appendChild(args.element);
}

function insertVisualElement(args: {
  document: Document;
  page: HTMLElement;
  target: HTMLElement | null;
  element: HTMLElement;
  placement: HtmlVisualInsertionMode;
}) {
  if (!args.target || args.placement === "page-end") {
    const insertionContainer = findVisualInsertionContainer(args.page);
    insertionContainer.appendChild(args.element);
    return;
  }

  if (args.placement === "below") {
    insertElementBelow(args.target, args.element);
    return;
  }

  insertElementBeside({
    document: args.document,
    target: args.target,
    element: args.element,
  });
}

function createInsertedVisualElement(args: {
  document: Document;
  kind: HtmlVisualNodeKind;
  pageStyle: HtmlPageVisualStyle;
  id: string;
}) {
  const baseStyle = buildDefaultVisualNodeStyle(args.kind, args.pageStyle);

  const createCard = (tagName: string, className: string) => {
    const element = args.document.createElement(tagName);
    element.className = className;
    element.setAttribute("data-html-visual-key", args.id);
    element.setAttribute("data-html-visual-kind", args.kind);
    element.setAttribute("data-codex-added-visual-node", "true");
    applyVisualNodeStyleToElement(element, args.kind, baseStyle);
    return element;
  };

  switch (args.kind) {
    case "divider": {
      const divider = createCard("div", "codex-added-visual-node codex-divider rule");
      divider.setAttribute("aria-hidden", "true");
      divider.style.width = "100%";
      divider.style.margin = "24px 0";
      return divider;
    }
    case "badge": {
      const badge = createCard("div", "codex-added-visual-node codex-badge");
      badge.textContent = "New badge";
      badge.style.display = "inline-flex";
      badge.style.alignItems = "center";
      badge.style.justifyContent = "center";
      badge.style.padding = "6px 14px";
      badge.style.fontSize = "12px";
      badge.style.fontWeight = "700";
      badge.style.letterSpacing = "0.08em";
      badge.style.textTransform = "uppercase";
      badge.style.marginTop = "18px";
      return badge;
    }
    case "highlight": {
      const highlight = createCard("div", "codex-added-visual-node codex-highlight");
      highlight.style.padding = "18px 20px";
      highlight.style.marginTop = "18px";
      const title = args.document.createElement("h4");
      title.textContent = "Highlight";
      const body = args.document.createElement("p");
      body.textContent = "Add the emphasized point here.";
      highlight.append(title, body);
      return highlight;
    }
    case "annotation": {
      const annotation = createCard("aside", "codex-added-visual-node codex-annotation");
      annotation.style.padding = "18px 20px";
      annotation.style.marginTop = "18px";
      const title = args.document.createElement("h4");
      title.textContent = "Annotation";
      const body = args.document.createElement("p");
      body.textContent = "Add supporting context or a side note here.";
      annotation.append(title, body);
      return annotation;
    }
    case "surface":
    default: {
      const surface = createCard("article", "codex-added-visual-node codex-surface");
      surface.style.padding = "22px 24px";
      surface.style.marginTop = "18px";
      const title = args.document.createElement("h3");
      title.textContent = "New surface";
      const body = args.document.createElement("p");
      body.textContent = "Add supporting content here.";
      surface.append(title, body);
      return surface;
    }
  }
}

export function updateGeneratedHtmlReportVisualStyle(args: {
  report: GeneratedHtmlReport;
  pageNumber: number;
  style: HtmlPageVisualStyle;
}): GeneratedHtmlReport {
  if (typeof DOMParser === "undefined") {
    return args.report;
  }

  const { document, page } = buildPageScopedReport(args);
  if (!page) {
    return args.report;
  }

  const pageBackground = normalizeCssPaint(args.style.pageBackground, DEFAULT_PAGE_BACKGROUND);
  const dividerColor = normalizeCssPaint(args.style.dividerColor, DEFAULT_DIVIDER_COLOR);
  const surfaceFill = normalizeCssPaint(args.style.surfaceFill, DEFAULT_SURFACE_FILL);
  const accentColor = normalizeCssPaint(
    args.style.accentColor,
    args.report.styleProfile?.accentColor ?? DEFAULT_ACCENT_COLOR,
  );

  page.style.background = buildPageBackground(pageBackground);
  page.setAttribute("data-page-bg", pageBackground);
  page.setAttribute("data-divider-color", dividerColor);
  page.setAttribute("data-surface-fill", surfaceFill);
  page.setAttribute("data-page-accent", accentColor);
  page.setAttribute("data-export-page-bg", pageBackground);
  page.setAttribute("data-export-divider-color", dividerColor);
  page.setAttribute("data-export-surface-fill", surfaceFill);
  page.setAttribute("data-export-accent", accentColor);

  page.querySelectorAll(".rule").forEach((element) => {
    (element as HTMLElement).style.background = buildDividerBackground(dividerColor);
  });

  page
    .querySelectorAll(".kpi, .insight, .action, .chartbox, .quote, .codex-surface, .codex-annotation, .codex-highlight")
    .forEach((element) => {
      (element as HTMLElement).style.background = surfaceFill;
    });

  return refreshReportVisualArtifacts({
    report: args.report,
    document,
  });
}

export function updateGeneratedHtmlReportVisualNode(args: {
  report: GeneratedHtmlReport;
  pageNumber: number;
  nodeId: string;
  kind?: HtmlVisualNodeKind;
  moduleId?: string | null;
  moduleLabel?: string | null;
  style: Partial<HtmlVisualNodeStyle>;
}): GeneratedHtmlReport {
  if (typeof DOMParser === "undefined") {
    return args.report;
  }

  const visualStructure = ensureHtmlVisualStructure(args.report);
  const targetPage = visualStructure.pages.find((page) => page.pageNumber === args.pageNumber) ?? null;
  const targetNode = targetPage?.nodes.find((node) => node.id === args.nodeId) ?? null;
  if (!targetPage || !targetNode) {
    return args.report;
  }

  const { document, page } = buildPageScopedReport(args);
  if (!page) {
    return args.report;
  }

  const element = findVisualNodeElement({
    page,
    node: targetNode,
  });
  if (!element) {
    return args.report;
  }

  element.setAttribute("data-html-visual-key", targetNode.id);
  const nextKind = args.kind ?? targetNode.kind;
  const nextStyle = {
    ...buildDefaultVisualNodeStyle(
      nextKind,
      extractHtmlPageVisualStyle({ report: args.report, pageNumber: args.pageNumber }),
    ),
    ...targetNode.style,
    ...args.style,
  };
  if (args.moduleId) {
    element.setAttribute("data-html-module-id", args.moduleId);
  } else if (args.moduleId === null) {
    element.removeAttribute("data-html-module-id");
  }
  if (args.moduleLabel) {
    element.setAttribute("data-html-module-label", args.moduleLabel);
  } else if (args.moduleLabel === null) {
    element.removeAttribute("data-html-module-label");
  }

  let targetElement = element;
  if (targetNode.moduleKind === SCIENTIFIC_DIAGRAM_MODULE_KIND && targetNode.diagramSpec) {
    const template = document.createElement("template");
    template.innerHTML = renderScientificDiagramModule({
      spec: targetNode.diagramSpec,
      theme: buildScientificDiagramTheme({
        report: args.report,
        accent: nextStyle.accent ?? null,
        border: nextStyle.border ?? null,
        background: nextStyle.background ?? null,
      }),
    });
    const replacement = template.content.firstElementChild as HTMLElement | null;
    if (replacement) {
      replacement.setAttribute("data-html-visual-key", targetNode.id);
      targetElement = replacement;
      element.replaceWith(replacement);
    }
  } else if (targetNode.moduleKind === CHART_MODULE_KIND && targetNode.chartSpec) {
    const template = document.createElement("template");
    template.innerHTML = renderHtmlChartModule({
      spec: targetNode.chartSpec,
      accent: nextStyle.accent ?? null,
      border: nextStyle.border ?? null,
      background: nextStyle.background ?? null,
    });
    const replacement = template.content.firstElementChild as HTMLElement | null;
    if (replacement) {
      replacement.setAttribute("data-html-visual-key", targetNode.id);
      targetElement = replacement;
      element.replaceWith(replacement);
    }
  } else if (targetNode.moduleKind === TABLE_MODULE_KIND && targetNode.tableSpec) {
    const template = document.createElement("template");
    template.innerHTML = renderHtmlTableModule({
      tableSpec: targetNode.tableSpec,
      accent: nextStyle.accent ?? null,
      border: nextStyle.border ?? null,
      background: nextStyle.background ?? null,
    });
    const replacement = template.content.firstElementChild as HTMLElement | null;
    if (replacement) {
      replacement.setAttribute("data-html-visual-key", targetNode.id);
      targetElement = replacement;
      element.replaceWith(replacement);
    }
  }

  applyVisualNodeStyleToElement(targetElement, nextKind, nextStyle);

  return refreshReportVisualArtifacts({
    report: args.report,
    document,
  });
}

export function updateGeneratedHtmlReportScientificDiagram(args: {
  report: GeneratedHtmlReport;
  pageNumber: number;
  nodeId: string;
  diagramSpec: HtmlVisualNode["diagramSpec"];
}) {
  if (typeof DOMParser === "undefined") {
    return args.report;
  }

  const visualStructure = ensureHtmlVisualStructure(args.report);
  const targetPage = visualStructure.pages.find((page) => page.pageNumber === args.pageNumber) ?? null;
  const targetNode = targetPage?.nodes.find((node) => node.id === args.nodeId) ?? null;
  if (!targetPage || !targetNode || targetNode.moduleKind !== SCIENTIFIC_DIAGRAM_MODULE_KIND) {
    return args.report;
  }

  const { document, page } = buildPageScopedReport(args);
  if (!page) {
    return args.report;
  }

  const element = findVisualNodeElement({
    page,
    node: targetNode,
  });
  if (!element) {
    return args.report;
  }

  const nextSpec = args.diagramSpec ? parseScientificDiagramSpec(serializeScientificDiagramSpec(args.diagramSpec)) : null;
  if (!nextSpec) {
    return args.report;
  }

  const template = document.createElement("template");
  template.innerHTML = renderScientificDiagramModule({
    spec: nextSpec,
    theme: buildScientificDiagramTheme({
      report: args.report,
      accent: targetNode.style.accent ?? null,
      border: targetNode.style.border ?? null,
      background: targetNode.style.background ?? null,
    }),
  });
  const replacement = template.content.firstElementChild as HTMLElement | null;
  if (!replacement) {
    return args.report;
  }

  replacement.setAttribute("data-html-visual-key", targetNode.id);
  replacement.setAttribute("data-html-module-kind", SCIENTIFIC_DIAGRAM_MODULE_KIND);
  replacement.setAttribute(SCIENTIFIC_DIAGRAM_SPEC_ATTRIBUTE, serializeScientificDiagramSpec(nextSpec));
  element.replaceWith(replacement);
  applyVisualNodeStyleToElement(replacement, targetNode.kind, {
    ...targetNode.style,
    accent: targetNode.style.accent ?? args.report.styleProfile?.accentColor ?? targetNode.style.accent,
  });

  return refreshReportVisualArtifacts({
    report: args.report,
    document,
  });
}

export function updateGeneratedHtmlReportChartModule(args: {
  report: GeneratedHtmlReport;
  pageNumber: number;
  nodeId: string;
  chartSpec: HtmlVisualNode["chartSpec"];
}) {
  if (typeof DOMParser === "undefined") {
    return args.report;
  }

  const visualStructure = ensureHtmlVisualStructure(args.report);
  const targetPage = visualStructure.pages.find((page) => page.pageNumber === args.pageNumber) ?? null;
  const targetNode = targetPage?.nodes.find((node) => node.id === args.nodeId) ?? null;
  if (!targetPage || !targetNode || targetNode.moduleKind !== CHART_MODULE_KIND) {
    return args.report;
  }

  const { document, page } = buildPageScopedReport(args);
  if (!page) {
    return args.report;
  }

  const element = findVisualNodeElement({
    page,
    node: targetNode,
  });
  if (!element) {
    return args.report;
  }

  const nextSpec = args.chartSpec ? parseHtmlChartSpec(serializeHtmlChartSpec(args.chartSpec)) : null;
  if (!nextSpec) {
    return args.report;
  }

  const template = document.createElement("template");
  template.innerHTML = renderHtmlChartModule({
    spec: nextSpec,
    accent: targetNode.style.accent ?? null,
    border: targetNode.style.border ?? null,
    background: targetNode.style.background ?? null,
  });
  const replacement = template.content.firstElementChild as HTMLElement | null;
  if (!replacement) {
    return args.report;
  }

  replacement.setAttribute("data-html-visual-key", targetNode.id);
  replacement.setAttribute("data-html-module-kind", CHART_MODULE_KIND);
  replacement.setAttribute(HTML_CHART_SPEC_ATTRIBUTE, serializeHtmlChartSpec(nextSpec));
  element.replaceWith(replacement);
  applyVisualNodeStyleToElement(replacement, "chart-frame", {
    ...targetNode.style,
    accent: targetNode.style.accent ?? args.report.styleProfile?.accentColor ?? targetNode.style.accent,
  });

  return refreshReportVisualArtifacts({
    report: args.report,
    document,
  });
}

export function updateGeneratedHtmlReportTableModule(args: {
  report: GeneratedHtmlReport;
  pageNumber: number;
  nodeId: string;
  tableSpec: HtmlVisualNode["tableSpec"];
}) {
  if (typeof DOMParser === "undefined") {
    return args.report;
  }

  const visualStructure = ensureHtmlVisualStructure(args.report);
  const targetPage = visualStructure.pages.find((page) => page.pageNumber === args.pageNumber) ?? null;
  const targetNode = targetPage?.nodes.find((node) => node.id === args.nodeId) ?? null;
  if (!targetPage || !targetNode || targetNode.moduleKind !== TABLE_MODULE_KIND) {
    return args.report;
  }

  const { document, page } = buildPageScopedReport(args);
  if (!page) {
    return args.report;
  }

  const element = findVisualNodeElement({
    page,
    node: targetNode,
  });
  if (!element) {
    return args.report;
  }

  const nextSpec = args.tableSpec ? parseHtmlTableSpec(serializeHtmlTableSpec(args.tableSpec)) : null;
  if (!nextSpec) {
    return args.report;
  }

  const template = document.createElement("template");
  template.innerHTML = renderHtmlTableModule({
    tableSpec: nextSpec,
    accent: targetNode.style.accent ?? null,
    border: targetNode.style.border ?? null,
    background: targetNode.style.background ?? null,
  });
  const replacement = template.content.firstElementChild as HTMLElement | null;
  if (!replacement) {
    return args.report;
  }

  replacement.setAttribute("data-html-visual-key", targetNode.id);
  replacement.setAttribute("data-html-module-kind", TABLE_MODULE_KIND);
  replacement.setAttribute(HTML_TABLE_SPEC_ATTRIBUTE, serializeHtmlTableSpec(nextSpec));
  element.replaceWith(replacement);
  applyVisualNodeStyleToElement(replacement, "surface", {
    ...targetNode.style,
    accent: targetNode.style.accent ?? args.report.styleProfile?.accentColor ?? targetNode.style.accent,
  });

  return refreshReportVisualArtifacts({
    report: args.report,
    document,
  });
}

export function addGeneratedHtmlReportVisualNode(args: {
  report: GeneratedHtmlReport;
  pageNumber: number;
  kind: HtmlVisualNodeKind;
  anchorNodeId?: string | null;
  placement?: HtmlVisualInsertionMode;
}) {
  if (typeof DOMParser === "undefined" || !DEFAULT_ELEMENT_INSERTION_KINDS.has(args.kind)) {
    return { report: args.report, nodeId: null as string | null };
  }

  const { document, page } = buildPageScopedReport(args);
  if (!page) {
    return { report: args.report, nodeId: null as string | null };
  }

  const pageStyle = extractHtmlPageVisualStyle({
    report: args.report,
    pageNumber: args.pageNumber,
  });
  const nodeId = createVisualSeedId(args.kind);
  const element = createInsertedVisualElement({
    document,
    kind: args.kind,
    pageStyle,
    id: nodeId,
  });
  const anchorNode =
    args.anchorNodeId && args.placement && args.placement !== "page-end"
      ? targetPageNodeElement({
          report: args.report,
          page,
          pageNumber: args.pageNumber,
          nodeId: args.anchorNodeId,
        })
      : null;

  insertVisualElement({
    document,
    page,
    target: anchorNode,
    element,
    placement: args.placement ?? "page-end",
  });

  const nextReport = refreshReportVisualArtifacts({
    report: args.report,
    document,
  });
  const selectedNodeId =
    nextReport.visualStructure?.pages
      .find((visualPage) => visualPage.pageNumber === args.pageNumber)
      ?.nodes.find((node) => node.id === nodeId)?.id ?? null;

  return {
    report: nextReport,
    nodeId: selectedNodeId,
  };
}

function targetPageNodeElement(args: {
  report: GeneratedHtmlReport;
  page: HTMLElement;
  pageNumber: number;
  nodeId: string;
}) {
  const visualStructure = ensureHtmlVisualStructure(args.report);
  const targetPage = visualStructure.pages.find((page) => page.pageNumber === args.pageNumber) ?? null;
  const targetNode = targetPage?.nodes.find((node) => node.id === args.nodeId) ?? null;
  if (!targetNode) {
    return null;
  }

  return findVisualNodeElement({
    page: args.page,
    node: targetNode,
  });
}

function normalizeVisualContentText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function inferVisualContentKind(tagName: string, text: string): HtmlVisualContentNodeKind {
  const normalized = normalizeVisualContentText(text);
  if (tagName === "P") {
    return "paragraph";
  }
  if (tagName === "LI") {
    return "list-item";
  }
  if (tagName === "H1" || tagName === "H2") {
    return "headline";
  }
  if (/^H[3-6]$/.test(tagName)) {
    return "heading";
  }
  if (normalized.length <= 48) {
    return "label";
  }
  return "paragraph";
}

export function extractGeneratedHtmlReportVisualNodeContent(args: {
  report: GeneratedHtmlReport;
  pageNumber: number;
  nodeId: string;
}) {
  if (typeof DOMParser === "undefined") {
    return [] as HtmlVisualContentNode[];
  }

  const { page } = buildPageScopedReport(args);
  if (!page) {
    return [] as HtmlVisualContentNode[];
  }

  const targetElement = targetPageNodeElement({
    report: args.report,
    page,
    pageNumber: args.pageNumber,
    nodeId: args.nodeId,
  });
  if (!targetElement) {
    return [] as HtmlVisualContentNode[];
  }

  const candidates = collectHtmlEditableCandidates(targetElement);
  const nodes: HtmlVisualContentNode[] = [];

  candidates.forEach((element, sourceIndex) => {
    const tagName = element.tagName.toUpperCase();
    if (tagName === "UL" || tagName === "OL") {
      Array.from(element.querySelectorAll(":scope > li")).forEach((item, listItemIndex) => {
        const text = normalizeVisualContentText(item.textContent ?? "");
        if (!text) {
          return;
        }
        nodes.push({
          id: `content-${sourceIndex + 1}-li-${listItemIndex + 1}`,
          kind: "list-item",
          sourceTag: tagName.toLowerCase(),
          sourceIndex,
          listItemIndex,
          text,
        });
      });
      return;
    }

    const text = normalizeVisualContentText(element.textContent ?? "");
    if (!text) {
      return;
    }

    nodes.push({
      id: `content-${sourceIndex + 1}`,
      kind: inferVisualContentKind(tagName, text),
      sourceTag: tagName.toLowerCase(),
      sourceIndex,
      text,
    });
  });

  return nodes;
}

function findVisualContentElement(args: {
  targetElement: HTMLElement;
  item: HtmlVisualContentNode;
}) {
  const candidates = collectHtmlEditableCandidates(args.targetElement);
  const element = candidates[args.item.sourceIndex] as HTMLElement | undefined;
  if (!element) {
    return null;
  }

  if (element.tagName.toLowerCase() !== args.item.sourceTag.toLowerCase()) {
    return null;
  }

  if (args.item.kind === "list-item") {
    const listItem = element.querySelectorAll(":scope > li")[args.item.listItemIndex ?? -1] as HTMLElement | undefined;
    return listItem ?? null;
  }

  return element;
}

export function duplicateGeneratedHtmlReportVisualContentNode(args: {
  report: GeneratedHtmlReport;
  pageNumber: number;
  nodeId: string;
  contentNodeId: string;
}) {
  if (typeof DOMParser === "undefined") {
    return args.report;
  }

  const { document, page } = buildPageScopedReport(args);
  if (!page) {
    return args.report;
  }

  const targetElement = targetPageNodeElement({
    report: args.report,
    page,
    pageNumber: args.pageNumber,
    nodeId: args.nodeId,
  });
  if (!targetElement) {
    return args.report;
  }

  const contentNode = extractGeneratedHtmlReportVisualNodeContent(args).find(
    (item) => item.id === args.contentNodeId,
  );
  if (!contentNode) {
    return args.report;
  }

  const element = findVisualContentElement({
    targetElement,
    item: contentNode,
  });
  if (!element) {
    return args.report;
  }

  const clone = element.cloneNode(true) as HTMLElement;
  element.insertAdjacentElement("afterend", clone);

  return refreshReportVisualArtifacts({
    report: args.report,
    document,
  });
}

export function deleteGeneratedHtmlReportVisualContentNode(args: {
  report: GeneratedHtmlReport;
  pageNumber: number;
  nodeId: string;
  contentNodeId: string;
}) {
  if (typeof DOMParser === "undefined") {
    return args.report;
  }

  const { document, page } = buildPageScopedReport(args);
  if (!page) {
    return args.report;
  }

  const targetElement = targetPageNodeElement({
    report: args.report,
    page,
    pageNumber: args.pageNumber,
    nodeId: args.nodeId,
  });
  if (!targetElement) {
    return args.report;
  }

  const contentNode = extractGeneratedHtmlReportVisualNodeContent(args).find(
    (item) => item.id === args.contentNodeId,
  );
  if (!contentNode) {
    return args.report;
  }

  const element = findVisualContentElement({
    targetElement,
    item: contentNode,
  });
  if (!element) {
    return args.report;
  }

  if (contentNode.kind === "list-item" && element.parentElement?.children.length === 1) {
    element.parentElement.remove();
  } else {
    element.remove();
  }

  return refreshReportVisualArtifacts({
    report: args.report,
    document,
  });
}

export function duplicateGeneratedHtmlReportVisualNode(args: {
  report: GeneratedHtmlReport;
  pageNumber: number;
  nodeId: string;
}) {
  if (typeof DOMParser === "undefined") {
    return { report: args.report, nodeId: null as string | null };
  }

  const visualStructure = ensureHtmlVisualStructure(args.report);
  const targetPage = visualStructure.pages.find((page) => page.pageNumber === args.pageNumber) ?? null;
  const targetNode = targetPage?.nodes.find((node) => node.id === args.nodeId) ?? null;
  if (!targetPage || !targetNode) {
    return { report: args.report, nodeId: null as string | null };
  }

  const { document, page } = buildPageScopedReport(args);
  if (!page) {
    return { report: args.report, nodeId: null as string | null };
  }

  const element = findVisualNodeElement({
    page,
    node: targetNode,
  });
  if (!element) {
    return { report: args.report, nodeId: null as string | null };
  }

  const duplicateId = createVisualSeedId(targetNode.kind);
  const clone = element.cloneNode(true) as HTMLElement;
  clone.setAttribute("data-html-visual-key", duplicateId);
  clone.setAttribute("data-codex-added-visual-node", "true");
  element.insertAdjacentElement("afterend", clone);

  const nextReport = refreshReportVisualArtifacts({
    report: args.report,
    document,
  });

  return {
    report: duplicateGeneratedHtmlReportCanvasVisualTransform({
      report: nextReport,
      pageNumber: args.pageNumber,
      sourceId: args.nodeId,
      nextId:
        nextReport.visualStructure?.pages
          .find((visualPage) => visualPage.pageNumber === args.pageNumber)
          ?.nodes.find((node) => node.id === duplicateId)?.id ?? null,
    }),
    nodeId:
      nextReport.visualStructure?.pages
        .find((visualPage) => visualPage.pageNumber === args.pageNumber)
        ?.nodes.find((node) => node.id === duplicateId)?.id ?? null,
  };
}

export function deleteGeneratedHtmlReportVisualNode(args: {
  report: GeneratedHtmlReport;
  pageNumber: number;
  nodeId: string;
}) {
  if (typeof DOMParser === "undefined") {
    return args.report;
  }

  const visualStructure = ensureHtmlVisualStructure(args.report);
  const targetPage = visualStructure.pages.find((page) => page.pageNumber === args.pageNumber) ?? null;
  const targetNode = targetPage?.nodes.find((node) => node.id === args.nodeId) ?? null;
  if (!targetPage || !targetNode) {
    return args.report;
  }

  const { document, page } = buildPageScopedReport(args);
  if (!page) {
    return args.report;
  }

  const element = findVisualNodeElement({
    page,
    node: targetNode,
  });
  if (!element) {
    return args.report;
  }

  element.remove();

  return removeGeneratedHtmlReportCanvasVisualTransform({
    report: refreshReportVisualArtifacts({
      report: args.report,
      document,
    }),
    pageNumber: args.pageNumber,
    id: args.nodeId,
  });
}
