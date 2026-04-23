import type {
  GeneratedHtmlReport,
  HtmlEditableBlock,
  HtmlEditableBlockKind,
  HtmlEditablePage,
  HtmlEditableStructure,
} from "./types";
import {
  getGeneratedHtmlReportBlockCanvasTransform,
  pruneGeneratedHtmlReportCanvasOverrides,
} from "./html-report-canvas";

const SEMANTIC_EDITABLE_SELECTOR = "h1, h2, h3, h4, h5, h6, p, ul, ol";
const GENERIC_TEXT_SELECTOR = "div, span";
const INLINE_TEXT_TAGS = new Set(["A", "B", "BR", "CODE", "EM", "I", "SMALL", "SPAN", "STRONG", "SUB", "SUP"]);
const MAX_EDITABLE_BLOCKS_PER_PAGE = 40;

function normalizeStructureText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function sanitizeBlockItems(items: string[]) {
  return items
    .map((item) => normalizeStructureText(item))
    .filter(Boolean)
    .slice(0, 6);
}

function parseInlineFontSize(element: Element) {
  const value = (element as HTMLElement).style?.fontSize?.trim() ?? "";
  if (!value) {
    return undefined;
  }

  const match = value.match(/^([0-9]+(?:\.[0-9]+)?)px$/i);
  if (!match) {
    return undefined;
  }

  const parsed = Number.parseFloat(match[1] ?? "");
  return Number.isFinite(parsed) ? parsed : undefined;
}

function inferFallbackFontSize(tagName: string, kind: HtmlEditableBlockKind) {
  if (tagName === "H1") {
    return 18;
  }
  if (tagName === "H2") {
    return 14;
  }
  if (tagName === "H3") {
    return 14;
  }
  if (tagName === "H4") {
    return 14;
  }
  if (tagName === "H5" || tagName === "H6") {
    return 14;
  }
  if (kind === "headline") {
    return 18;
  }
  if (kind === "heading") {
    return 14;
  }
  if (kind === "eyebrow") {
    return 14;
  }
  if (kind === "list") {
    return 12;
  }
  return 12;
}

function getDefaultFontSizeForTagAndKind(tagName: string, kind: HtmlEditableBlockKind) {
  return inferFallbackFontSize(tagName, kind);
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

function createTextBlock(
  id: string,
  kind: HtmlEditableBlockKind,
  sourceTag: string,
  sourceIndex: number,
  text: string,
  fontSize?: number,
): HtmlEditableBlock | null {
  const normalized = normalizeStructureText(text);
  if (!normalized) {
    return null;
  }

  return {
    id,
    kind,
    text: normalized,
    fontSize,
    sourceTag,
    sourceIndex,
  };
}

function createListBlock(
  id: string,
  sourceTag: string,
  sourceIndex: number,
  items: string[],
  fontSize?: number,
): HtmlEditableBlock | null {
  const normalizedItems = sanitizeBlockItems(items);
  if (normalizedItems.length === 0) {
    return null;
  }

  return {
    id,
    kind: "list",
    items: normalizedItems,
    fontSize,
    sourceTag,
    sourceIndex,
  };
}

function inferHeadingKind(tagName: string, text: string): HtmlEditableBlockKind {
  const normalized = normalizeStructureText(text);
  if (tagName === "H1") {
    return "headline";
  }
  if (tagName === "H5" || tagName === "H6") {
    return "eyebrow";
  }
  if (normalized === normalized.toUpperCase() && normalized.length <= 48) {
    return "eyebrow";
  }
  return "heading";
}

function inferGenericTextKind(text: string): HtmlEditableBlockKind {
  const normalized = normalizeStructureText(text);
  if (normalized === normalized.toUpperCase() && normalized.length <= 48) {
    return "eyebrow";
  }
  if (normalized.length <= 84) {
    return "heading";
  }
  return "paragraph";
}

function isEditableGenericTextContainer(element: Element) {
  const tagName = element.tagName.toUpperCase();
  if (tagName !== "DIV" && tagName !== "SPAN") {
    return false;
  }

  if (element.closest("h1, h2, h3, h4, h5, h6, p, ul, ol, li")) {
    return false;
  }

  const hasNestedStructuredBlocks = Boolean(
    element.querySelector(`${SEMANTIC_EDITABLE_SELECTOR}, li`),
  );
  if (hasNestedStructuredBlocks) {
    return false;
  }

  const hasOnlyInlineChildren = Array.from(element.children).every((child) =>
    INLINE_TEXT_TAGS.has(child.tagName.toUpperCase()),
  );
  if (!hasOnlyInlineChildren) {
    return false;
  }

  const normalized = normalizeStructureText(element.textContent ?? "");
  return normalized.length > 0;
}

export function collectHtmlEditableCandidates(page: Element) {
  return Array.from(page.querySelectorAll(`${SEMANTIC_EDITABLE_SELECTOR}, ${GENERIC_TEXT_SELECTOR}`)).filter(
    (element) => {
      const tagName = element.tagName.toUpperCase();
      if (tagName === "UL" || tagName === "OL") {
        return true;
      }
      if (/^H[1-6]$/.test(tagName) || tagName === "P") {
        return true;
      }
      return isEditableGenericTextContainer(element);
    },
  );
}

function extractPageTitle(
  page: Element,
  index: number,
  fallbackTitle: string | undefined,
) {
  const attributeTitle = page.getAttribute("data-page-title");
  if (attributeTitle && normalizeStructureText(attributeTitle)) {
    return normalizeStructureText(attributeTitle);
  }

  const heading = page.querySelector("h1, h2");
  if (heading?.textContent && normalizeStructureText(heading.textContent)) {
    return normalizeStructureText(heading.textContent);
  }

  if (fallbackTitle && normalizeStructureText(fallbackTitle)) {
    return normalizeStructureText(fallbackTitle);
  }

  return `Page ${index + 1}`;
}

function extractPageBlocks(page: Element) {
  const blocks: HtmlEditableBlock[] = [];
  const seen = new Set<string>();
  const candidates = collectHtmlEditableCandidates(page);

  candidates.forEach((element, sourceIndex) => {
    const tagName = element.tagName.toUpperCase();
    const parsedFontSize = parseInlineFontSize(element);
    let block: HtmlEditableBlock | null = null;

    if (tagName === "UL" || tagName === "OL") {
      const items = Array.from(element.querySelectorAll(":scope > li")).map(
        (item) => item.textContent ?? "",
      );
      block = createListBlock(
        `block-${sourceIndex + 1}`,
        tagName.toLowerCase(),
        sourceIndex,
        items,
        parsedFontSize ?? inferFallbackFontSize(tagName, "list"),
      );
    } else if (tagName === "P") {
      block = createTextBlock(
        `block-${sourceIndex + 1}`,
        "paragraph",
        tagName.toLowerCase(),
        sourceIndex,
        element.textContent ?? "",
        parsedFontSize ?? inferFallbackFontSize(tagName, "paragraph"),
      );
    } else if (tagName === "DIV" || tagName === "SPAN") {
      const inferredKind = inferGenericTextKind(element.textContent ?? "");
      block = createTextBlock(
        `block-${sourceIndex + 1}`,
        inferredKind,
        tagName.toLowerCase(),
        sourceIndex,
        element.textContent ?? "",
        parsedFontSize ?? inferFallbackFontSize(tagName, inferredKind),
      );
    } else {
      const inferredKind = inferHeadingKind(tagName, element.textContent ?? "");
      block = createTextBlock(
        `block-${sourceIndex + 1}`,
        inferredKind,
        tagName.toLowerCase(),
        sourceIndex,
        element.textContent ?? "",
        parsedFontSize ?? inferFallbackFontSize(tagName, inferredKind),
      );
    }

    if (!block) {
      return;
    }

    block.sourcePath = buildElementSourcePath(page, element);

    const signature = block.text
      ? `${block.kind}:${block.text.toLowerCase()}`
      : `${block.kind}:${(block.items ?? []).join("|").toLowerCase()}`;
    if (seen.has(signature)) {
      return;
    }
    seen.add(signature);
    blocks.push(block);
  });

  return blocks.slice(0, MAX_EDITABLE_BLOCKS_PER_PAGE);
}

export function extractHtmlEditableStructure(args: {
  html: string;
  pageTitles?: string[];
}): HtmlEditableStructure {
  if (typeof DOMParser === "undefined") {
    return { pages: [] };
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(args.html, "text/html");
  const pages = Array.from(document.querySelectorAll("section.page")).map((page, index) => {
    const title = extractPageTitle(page, index, args.pageTitles?.[index]);
    const blocks = extractPageBlocks(page);
    const headline =
      blocks.find((block) => block.kind === "headline")?.text ??
      blocks.find((block) => block.kind === "heading")?.text;

    return {
      id: `${index + 1}`,
      pageNumber: index + 1,
      title,
      headline,
      blocks,
    } satisfies HtmlEditablePage;
  });

  return { pages };
}

export function ensureHtmlEditableStructure(
  report: Pick<GeneratedHtmlReport, "html" | "pageTitles" | "structure">,
): HtmlEditableStructure {
  const extracted = extractHtmlEditableStructure({
    html: report.html,
    pageTitles: report.pageTitles,
  });
  const hasReusableStructure = report.structure?.pages?.length
    ? report.structure.pages.every((page) =>
        page.blocks.every(
          (block) =>
            typeof block.sourceTag === "string" &&
            block.sourceTag.length > 0 &&
            typeof block.sourceIndex === "number" &&
            Number.isFinite(block.sourceIndex),
        ),
      )
    : false;

  if (hasReusableStructure && report.structure) {
    const extractedHasMoreCoverage = extracted.pages.some((page, pageIndex) => {
      const existingPage = report.structure?.pages[pageIndex];
      if (!existingPage) {
        return true;
      }
      return page.blocks.length > existingPage.blocks.length;
    });

    if (!extractedHasMoreCoverage) {
      return report.structure;
    }
  }

  return extracted;
}

export function normalizeGeneratedHtmlReportTypography(args: {
  html: string;
  pageTitles?: string[];
}): {
  html: string;
  structure: HtmlEditableStructure;
} {
  if (typeof DOMParser === "undefined") {
    const structure = extractHtmlEditableStructure(args);
    return {
      html: args.html,
      structure,
    };
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(args.html, "text/html");
  const pages = Array.from(document.querySelectorAll("section.page"));

  pages.forEach((page) => {
    const candidates = collectHtmlEditableCandidates(page);

    candidates.forEach((element) => {
      const tagName = element.tagName.toUpperCase();
      const existingInlineFontSize = parseInlineFontSize(element);
      let kind: HtmlEditableBlockKind;
      if (tagName === "UL" || tagName === "OL") {
        kind = "list";
      } else if (tagName === "P") {
        kind = "paragraph";
      } else if (tagName === "DIV" || tagName === "SPAN") {
        kind = inferGenericTextKind(element.textContent ?? "");
      } else {
        kind = inferHeadingKind(tagName, element.textContent ?? "");
      }

      if (!existingInlineFontSize) {
        return;
      }

      // Earlier builds wrote fallback editor sizes directly into the generated HTML,
      // which overrode the report's own CSS scale. If the inline size exactly matches
      // our fallback mapping, treat it as synthetic and remove it so the original
      // design system can render at full size again.
      const fallbackFontSize = getDefaultFontSizeForTagAndKind(tagName, kind);
      if (Math.abs(existingInlineFontSize - fallbackFontSize) > 0.1) {
        return;
      }

      const htmlElement = element as HTMLElement;
      const hasSemanticTag =
        /^H[1-6]$/.test(tagName) || tagName === "P" || tagName === "UL" || tagName === "OL";
      const className = typeof htmlElement.className === "string" ? htmlElement.className.trim() : "";
      const hasClassHook = className.length > 0;
      if (!hasSemanticTag && !hasClassHook) {
        return;
      }

      htmlElement.style.removeProperty("font-size");
      if (!htmlElement.getAttribute("style")?.trim()) {
        htmlElement.removeAttribute("style");
      }
    });
  });

  const nextHtml = createSerializableHtml(document);
  const structure = extractHtmlEditableStructure({
    html: nextHtml,
    pageTitles: args.pageTitles,
  });

  return {
    html: nextHtml,
    structure,
  };
}

function createSerializableHtml(document: Document) {
  const doctype = document.doctype
    ? `<!DOCTYPE ${document.doctype.name}>`
    : "<!DOCTYPE html>";
  return `${doctype}\n${document.documentElement.outerHTML}`;
}

function extractDocumentTitle(document: Document) {
  const documentTitle = normalizeStructureText(document.title);
  if (documentTitle) {
    return documentTitle;
  }

  const heading = document.querySelector("section.page h1, section.page h2");
  const headingText = normalizeStructureText(heading?.textContent ?? "");
  return headingText || "Generated consulting report";
}

function extractPageTitlesFromStructure(structure: HtmlEditableStructure) {
  return structure.pages.map((page) => page.title).filter(Boolean);
}

export function updateGeneratedHtmlReportBlock(args: {
  report: GeneratedHtmlReport;
  pageNumber: number;
  blockId: string;
  text?: string;
  items?: string[];
  fontSize?: number;
}): GeneratedHtmlReport {
  if (typeof DOMParser === "undefined") {
    return args.report;
  }

  const structure = ensureHtmlEditableStructure(args.report);
  const targetPage =
    structure.pages.find((page) => page.pageNumber === args.pageNumber) ?? null;
  const targetBlock = targetPage?.blocks.find((block) => block.id === args.blockId) ?? null;
  if (!targetPage || !targetBlock) {
    return args.report;
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(args.report.html, "text/html");
  const page = document.querySelectorAll("section.page")[args.pageNumber - 1];
  if (!page) {
    return args.report;
  }

  const candidates = collectHtmlEditableCandidates(page);
  const element = candidates[targetBlock.sourceIndex];
  if (!element) {
    return args.report;
  }

  if (targetBlock.kind === "list") {
    const nextItems = sanitizeBlockItems(args.items ?? targetBlock.items ?? []);
    if (nextItems.length === 0) {
      return args.report;
    }
    element.replaceChildren(
      ...nextItems.map((item) => {
        const listItem = document.createElement("li");
        listItem.textContent = item;
        return listItem;
      }),
    );
  } else {
    const nextText = normalizeStructureText(args.text ?? targetBlock.text ?? "");
    if (!nextText) {
      return args.report;
    }
    element.textContent = nextText;
  }

  if (typeof args.fontSize === "number" && Number.isFinite(args.fontSize) && args.fontSize > 0) {
    (element as HTMLElement).style.fontSize = `${Math.round(args.fontSize)}px`;
  }

  const nextHtml = createSerializableHtml(document);
  const nextStructure = extractHtmlEditableStructure({
    html: nextHtml,
    pageTitles: args.report.pageTitles,
  });

  return {
    ...args.report,
    title: extractDocumentTitle(document),
    html: nextHtml,
    pageTitles: extractPageTitlesFromStructure(nextStructure),
    structure: nextStructure,
    visualStructure: args.report.visualStructure,
    layoutStructure: args.report.layoutStructure,
    canvasOverrides: pruneGeneratedHtmlReportCanvasOverrides({
      overrides: (() => {
        if (
          typeof args.fontSize !== "number" ||
          !Number.isFinite(args.fontSize) ||
          args.fontSize <= 0
        ) {
          return args.report.canvasOverrides;
        }

        const existingOverride = getGeneratedHtmlReportBlockCanvasTransform({
          report: args.report,
          pageNumber: args.pageNumber,
          blockId: args.blockId,
        });
        if (!existingOverride) {
          return args.report.canvasOverrides;
        }
        const nextFontSize = Math.round(args.fontSize);

        return {
          pages:
            args.report.canvasOverrides?.pages.map((page) =>
              page.pageNumber !== args.pageNumber
                ? page
                : {
                    ...page,
                    blockOverrides: {
                      ...page.blockOverrides,
                      [args.blockId]: {
                        ...existingOverride,
                        fontSize: nextFontSize,
                      },
                    },
                  },
            ) ?? [],
        };
      })(),
      structure: nextStructure,
      visualStructure: args.report.visualStructure,
    }),
  };
}
