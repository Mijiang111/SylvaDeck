import type {
  GeneratedHtmlReport,
  HtmlPageVisualStyle,
  HtmlVisualContentNode,
  HtmlVisualContentNodeKind,
  HtmlVisualNode,
  HtmlVisualNodeKind,
  HtmlVisualNodeStyle,
  HtmlVisualPage,
  HtmlVisualStructure,
} from "./types";
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

const GENERAL_CONSULTING_PROFILE = getIndustryStyleProfile("general-consulting");
const DEFAULT_PAGE_BACKGROUND = GENERAL_CONSULTING_PROFILE.tokens.pageBackground;
const DEFAULT_DIVIDER_COLOR = GENERAL_CONSULTING_PROFILE.tokens.borderSubtle;
const DEFAULT_SURFACE_FILL = GENERAL_CONSULTING_PROFILE.tokens.surfacePrimary;
const DEFAULT_SURFACE_BORDER = GENERAL_CONSULTING_PROFILE.tokens.borderSubtle;
const DEFAULT_ACCENT_COLOR = GENERAL_CONSULTING_PROFILE.tokens.accentPrimary;
const MAX_VISUAL_NODES_PER_PAGE = 36;
const VISUAL_SELECTOR = "div, aside, article, section, hr, figure";
const TEXTUAL_SELECTOR = "h1, h2, h3, h4, h5, h6, p, ul, ol, li";
const DEFAULT_ELEMENT_INSERTION_KINDS = new Set<HtmlVisualNodeKind>([
  "surface",
  "divider",
  "badge",
  "highlight",
  "annotation",
]);
export type HtmlVisualInsertionMode = "page-end" | "below" | "beside";

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

function buildPageBackground(background: string) {
  return `linear-gradient(180deg, rgba(255,255,255,0.34), rgba(255,255,255,0.08)), ${background}`;
}

function buildDividerBackground(color: string) {
  if (/(gradient|url)\(/i.test(color)) {
    return color;
  }
  return `linear-gradient(90deg, ${color}, transparent)`;
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

function hasVisualKeyword(tokens: string[]) {
  return tokens.some((token) =>
    [
      "card",
      "panel",
      "surface",
      "kpi",
      "insight",
      "action",
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

export function inferVisualKind(element: Element): HtmlVisualNodeKind | null {
  const tagName = element.tagName.toUpperCase();
  const tokens = getClassTokens(element);
  const style = (element.getAttribute("style") ?? "").toLowerCase();
  const explicitKind = element.getAttribute("data-html-visual-kind");
  if (
    explicitKind === "surface" ||
    explicitKind === "divider" ||
    explicitKind === "badge" ||
    explicitKind === "highlight" ||
    explicitKind === "annotation" ||
    explicitKind === "rail" ||
    explicitKind === "chart-frame"
  ) {
    return explicitKind;
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
    style.includes("min-height")
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
    return "surface";
  }

  return null;
}

function isLikelyVisualElement(element: Element) {
  if (element.matches("section.page")) {
    return false;
  }

  if (element.matches(TEXTUAL_SELECTOR) || element.closest(TEXTUAL_SELECTOR)) {
    return false;
  }

  const kind = inferVisualKind(element);
  if (!kind) {
    return false;
  }

  const tokens = getClassTokens(element);
  const hasInlineStyle = Boolean((element.getAttribute("style") ?? "").trim());
  const hasStrongKeyword = hasVisualKeyword(tokens);

  if (!hasInlineStyle && !hasStrongKeyword && element.children.length > 6) {
    return false;
  }

  return true;
}

export function collectHtmlVisualCandidates(page: Element) {
  return Array.from(page.querySelectorAll(VISUAL_SELECTOR))
    .filter(isLikelyVisualElement)
    .slice(0, MAX_VISUAL_NODES_PER_PAGE);
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

function extractPageVisualNodes(
  page: Element,
  pageNumber: number,
  pageStyle: HtmlPageVisualStyle,
) {
  const candidates = collectHtmlVisualCandidates(page);
  const editableCandidates = new Set(collectHtmlEditableCandidates(page));

  return candidates.map((element, sourceIndex) => {
    const kind = inferVisualKind(element) ?? "surface";
    const persistentId = element.getAttribute("data-html-visual-key")?.trim();
    const moduleId = element.getAttribute("data-html-module-id")?.trim();
    const moduleLabel = element.getAttribute("data-html-module-label")?.trim();
    return {
      id: persistentId || `visual-${pageNumber}-${kind}-${sourceIndex + 1}`,
      kind,
      pageNumber,
      sourceTag: element.tagName.toLowerCase(),
      sourceIndex,
      moduleId: moduleId || undefined,
      moduleLabel: moduleLabel || undefined,
      fitParticipation: resolveHtmlVisualFitParticipation({
        kind,
        explicitFitParticipation: readHtmlFitParticipation(element),
        hasModuleBinding: Boolean(moduleId || moduleLabel),
        hasEditableText: editableCandidates.has(element),
      }),
      style: extractNodeStyle(element, kind, pageStyle),
    } satisfies HtmlVisualNode;
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
    } satisfies HtmlVisualPage;
  });

  return { pages };
}

export function ensureHtmlVisualStructure(
  report: Pick<
    GeneratedHtmlReport,
    "html" | "pageTitles" | "visualStructure" | "styleProfile" | "styleProfileId"
  >,
): HtmlVisualStructure {
  const extracted = extractHtmlVisualStructure({
    html: report.html,
    pageTitles: report.pageTitles,
    styleProfile: report.styleProfile,
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
        hasEditableText: editableSet.has(element),
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
      hasEditableText: Boolean(element.getAttribute("data-html-block-id")?.trim()),
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

  applyVisualNodeStyleToElement(element, nextKind, nextStyle);

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
