import { extractHtmlEditableStructure } from "./html-report-structure";
import { extractHtmlVisualStructure } from "./html-report-visuals";
import { pruneGeneratedHtmlReportCanvasOverrides } from "./html-report-canvas";
import type {
  GeneratedHtmlReport,
  HtmlLayoutPage,
  HtmlLayoutStructure,
  HtmlLayoutZone,
  HtmlLayoutZoneKind,
} from "./types";

const DEFAULT_HEADER_SPLIT_PERCENT = 64;
const DEFAULT_CONTENT_SPLIT_PERCENT = 50;
const LAYOUT_ZONE_SELECTOR = "div, section, article, header, main, aside";

function createSerializableHtml(document: Document) {
  const doctype = document.doctype
    ? `<!DOCTYPE ${document.doctype.name}>`
    : "<!DOCTYPE html>";
  return `${doctype}\n${document.documentElement.outerHTML}`;
}

function clampSplitPercent(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(28, Math.min(72, Math.round(value ?? fallback)));
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
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

function findLayoutSearchRoot(page: Element) {
  const selectors = [
    "[data-page-body]",
    ".page-body",
    ".content-grid",
    ".page-grid",
    ".content",
    ".body",
    "main",
  ];

  for (const selector of selectors) {
    const match = page.querySelector(selector);
    if (match instanceof HTMLElement) {
      return match;
    }
  }

  return page as HTMLElement;
}

function parseSplitPercentFromColumns(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  if (!normalized) {
    return undefined;
  }

  const percentMatches = normalized.match(/([\d.]+)%/g);
  if (percentMatches && percentMatches.length >= 2) {
    const parsed = Number.parseFloat(percentMatches[0]!.replace("%", ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  const frMatches = Array.from(normalized.matchAll(/([\d.]+)fr/g)).map((match) =>
    Number.parseFloat(match[1] ?? ""),
  );
  if (frMatches.length >= 2 && frMatches.every(Number.isFinite)) {
    const total = frMatches[0]! + frMatches[1]!;
    return total > 0 ? (frMatches[0]! / total) * 100 : undefined;
  }

  return undefined;
}

function inferSplitPercent(element: HTMLElement, kind: HtmlLayoutZoneKind) {
  const fromAttribute = Number.parseFloat(element.getAttribute("data-layout-split") ?? "");
  if (Number.isFinite(fromAttribute)) {
    return clampSplitPercent(fromAttribute, kind === "header" ? DEFAULT_HEADER_SPLIT_PERCENT : DEFAULT_CONTENT_SPLIT_PERCENT);
  }

  const fromGrid = parseSplitPercentFromColumns(element.style.gridTemplateColumns);
  if (fromGrid !== undefined) {
    return clampSplitPercent(fromGrid, kind === "header" ? DEFAULT_HEADER_SPLIT_PERCENT : DEFAULT_CONTENT_SPLIT_PERCENT);
  }

  const children = Array.from(element.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  if (children.length === 2) {
    const firstStyleWidth =
      parseSplitPercentFromColumns(children[0].style.width) ??
      parseSplitPercentFromColumns(children[0].style.flexBasis);
    if (firstStyleWidth !== undefined) {
      return clampSplitPercent(firstStyleWidth, kind === "header" ? DEFAULT_HEADER_SPLIT_PERCENT : DEFAULT_CONTENT_SPLIT_PERCENT);
    }
  }

  return kind === "header" ? DEFAULT_HEADER_SPLIT_PERCENT : DEFAULT_CONTENT_SPLIT_PERCENT;
}

function isLikelyLayoutContainer(element: Element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.matches("section.page, hr, .rule")) {
    return false;
  }

  const children = Array.from(element.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  if (children.length !== 2) {
    return false;
  }

  const tokens = getClassTokens(element);
  const inlineStyle = (element.getAttribute("style") ?? "").toLowerCase();
  const hasHeading = Boolean(element.querySelector("h1, h2, h3"));
  const totalTextLength = normalizeText(element.textContent).length;
  const childDenseText = children.some((child) => normalizeText(child.textContent).length >= 48);

  return (
    inlineStyle.includes("grid") ||
    inlineStyle.includes("flex") ||
    hasHeading ||
    totalTextLength >= 120 ||
    childDenseText ||
    tokens.some((token) =>
      ["grid", "columns", "split", "layout", "hero", "header", "content", "summary"].some((keyword) =>
        token.includes(keyword),
      ),
    )
  );
}

export function collectHtmlLayoutCandidates(page: Element) {
  const root = findLayoutSearchRoot(page);
  const all = Array.from(root.querySelectorAll(LAYOUT_ZONE_SELECTOR)).filter(isLikelyLayoutContainer);
  return all.filter(
    (candidate) => !all.some((other) => other !== candidate && other.contains(candidate)),
  );
}

function extractPageLayoutZones(page: Element, pageNumber: number) {
  const candidates = collectHtmlLayoutCandidates(page).slice(0, 2);

  return candidates.map((element, index) => {
    const kind: HtmlLayoutZoneKind = index === 0 ? "header" : "content";
    const persistentId = element.getAttribute("data-html-layout-key")?.trim();
    const sourceIndex = candidates.indexOf(element);

    return {
      id: persistentId || `layout-${pageNumber}-${kind}-${sourceIndex + 1}`,
      kind,
      pageNumber,
      sourceTag: element.tagName.toLowerCase(),
      sourceIndex,
      splitPercent: inferSplitPercent(element as HTMLElement, kind),
    } satisfies HtmlLayoutZone;
  });
}

export function extractHtmlLayoutStructure(args: {
  html: string;
  pageTitles?: string[];
}): HtmlLayoutStructure {
  if (typeof DOMParser === "undefined") {
    return { pages: [] };
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(args.html, "text/html");

  return {
    pages: Array.from(document.querySelectorAll("section.page")).map((page, index) => ({
      pageNumber: index + 1,
      zones: extractPageLayoutZones(page, index + 1),
    })) satisfies HtmlLayoutPage[],
  };
}

export function ensureHtmlLayoutStructure(
  report: Pick<GeneratedHtmlReport, "html" | "pageTitles" | "layoutStructure">,
): HtmlLayoutStructure {
  const extracted = extractHtmlLayoutStructure({
    html: report.html,
    pageTitles: report.pageTitles,
  });

  const hasReusableStructure = report.layoutStructure?.pages?.length
    ? report.layoutStructure.pages.every((page) =>
        page.zones.every(
          (zone) =>
            typeof zone.sourceTag === "string" &&
            zone.sourceTag.length > 0 &&
            typeof zone.sourceIndex === "number" &&
            Number.isFinite(zone.sourceIndex),
        ),
      )
    : false;

  if (hasReusableStructure && report.layoutStructure) {
    const extractedHasMoreCoverage = extracted.pages.some((page, pageIndex) => {
      const existingPage = report.layoutStructure?.pages[pageIndex];
      if (!existingPage) {
        return true;
      }

      return page.zones.length > existingPage.zones.length;
    });

    if (!extractedHasMoreCoverage) {
      return report.layoutStructure;
    }
  }

  return extracted;
}

function applyLayoutSplitToElement(element: HTMLElement, splitPercent: number) {
  const children = Array.from(element.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  if (children.length !== 2) {
    return;
  }

  const clampedSplit = clampSplitPercent(
    splitPercent,
    element.getAttribute("data-html-layout-kind") === "header"
      ? DEFAULT_HEADER_SPLIT_PERCENT
      : DEFAULT_CONTENT_SPLIT_PERCENT,
  );
  element.style.display = "grid";
  element.style.gridTemplateColumns = `minmax(0, ${clampedSplit}fr) minmax(0, ${100 - clampedSplit}fr)`;
  element.style.alignItems = "start";
  children.forEach((child) => {
    child.style.minWidth = "0";
  });
  element.setAttribute("data-layout-split", String(clampedSplit));
}

function refreshReportArtifacts(args: {
  report: GeneratedHtmlReport;
  document: Document;
}) {
  const nextHtml = createSerializableHtml(args.document);
  const nextStructure = extractHtmlEditableStructure({
    html: nextHtml,
    pageTitles: args.report.pageTitles,
  });
  const nextVisualStructure = extractHtmlVisualStructure({
    html: nextHtml,
    pageTitles: nextStructure.pages.map((page) => page.title),
  });
  const nextLayoutStructure = extractHtmlLayoutStructure({
    html: nextHtml,
    pageTitles: nextStructure.pages.map((page) => page.title),
  });

  return {
    ...args.report,
    html: nextHtml,
    pageTitles: nextStructure.pages.map((page) => page.title),
    structure: nextStructure,
    visualStructure: nextVisualStructure,
    layoutStructure: nextLayoutStructure,
    canvasOverrides: pruneGeneratedHtmlReportCanvasOverrides({
      overrides: args.report.canvasOverrides,
      structure: nextStructure,
      visualStructure: nextVisualStructure,
    }),
  };
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

function findLayoutZoneElement(args: {
  page: Element;
  zone: HtmlLayoutZone;
}) {
  const candidates = collectHtmlLayoutCandidates(args.page);
  const element = candidates[args.zone.sourceIndex] as HTMLElement | undefined;
  if (!element) {
    return null;
  }

  if (element.tagName.toLowerCase() !== args.zone.sourceTag.toLowerCase()) {
    return null;
  }

  return element;
}

export function updateGeneratedHtmlReportLayoutZone(args: {
  report: GeneratedHtmlReport;
  pageNumber: number;
  zoneId: string;
  splitPercent: number;
}): GeneratedHtmlReport {
  if (typeof DOMParser === "undefined") {
    return args.report;
  }

  const layoutStructure = ensureHtmlLayoutStructure(args.report);
  const targetPage = layoutStructure.pages.find((page) => page.pageNumber === args.pageNumber) ?? null;
  const targetZone = targetPage?.zones.find((zone) => zone.id === args.zoneId) ?? null;
  if (!targetPage || !targetZone) {
    return args.report;
  }

  const { document, page } = buildPageScopedReport(args);
  if (!page) {
    return args.report;
  }

  const element = findLayoutZoneElement({
    page,
    zone: targetZone,
  });
  if (!element) {
    return args.report;
  }

  element.setAttribute("data-html-layout-key", targetZone.id);
  element.setAttribute("data-html-layout-kind", targetZone.kind);
  applyLayoutSplitToElement(element, args.splitPercent);

  return refreshReportArtifacts({
    report: args.report,
    document,
  });
}
