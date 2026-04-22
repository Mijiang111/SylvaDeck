import { HTML_REPORT_PAGE_HEIGHT, HTML_REPORT_PAGE_WIDTH } from "./html-report-canvas";
import { HTML_FIT_ROLE_ATTRIBUTE } from "./html-fit-role";
import { annotateHtmlFitRolesOnPage } from "./html-report-visuals";
import type { TextLayoutRole } from "./text-layout/text-layout-types";

export type ShrinkToFitOptions = {
  maxHeight: number;
  maxWidth: number;
  minFontSizes: Record<TextLayoutRole, number>;
  dampening: number;
  binarySearchIterations: number;
};

export type ShrinkToFitPageResult = {
  pageNumber: number;
  success: boolean;
  originalHeight: number;
  finalHeight: number;
  scaleRatio: number;
  spaceRatio: number;
  textRatio: number;
  notes: string[];
  violation?: "font-size" | "predicted-height";
};

export type ShrinkToFitReportResult = {
  html: string;
  pages: ShrinkToFitPageResult[];
  changed: boolean;
};

const DEFAULT_SHRINK_OPTIONS: ShrinkToFitOptions = {
  maxHeight: HTML_REPORT_PAGE_HEIGHT,
  maxWidth: HTML_REPORT_PAGE_WIDTH,
  minFontSizes: {
    title: 26,
    headline: 22,
    heading: 18,
    paragraph: 13,
    list: 13,
    annotation: 12,
    rail: 12,
    badge: 11,
    label: 11,
    button: 12,
    unknown: 11,
  },
  dampening: 0.99,
  binarySearchIterations: 4,
};

const SCALABLE_SPACE_PROPERTY_LIST = [
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "gap",
  "column-gap",
  "row-gap",
  "border-radius",
];

const SCALABLE_TEXT_PROPERTY_LIST = ["font-size", "line-height"];

const SCALABLE_BOX_PROPERTY_LIST = [
  "width",
  "min-width",
  "max-width",
  "height",
  "min-height",
  "max-height",
  "top",
  "right",
  "bottom",
  "left",
  "border-width",
  "transform",
  "background-size",
  "background-position",
];
const SCALABLE_GEOMETRY_BOX_PROPERTY_LIST = new Set([
  "width",
  "min-width",
  "max-width",
  "height",
  "min-height",
  "max-height",
  "top",
  "right",
  "bottom",
  "left",
  "transform",
  "background-size",
  "background-position",
]);

const SCALABLE_SPACE_PROPERTIES = new Set(SCALABLE_SPACE_PROPERTY_LIST);
const SCALABLE_TEXT_PROPERTIES = new Set(SCALABLE_TEXT_PROPERTY_LIST);
const SCALABLE_BOX_PROPERTIES = new Set(SCALABLE_BOX_PROPERTY_LIST);

export function scalePxValue(value: string, ratio: number): string {
  return value.replace(/(-?\d+(?:\.\d+)?)px/g, (_, num) => {
    const scaled = Number.parseFloat(num) * ratio;
    return scaled < 1 ? "0px" : `${Math.round(scaled * 10) / 10}px`;
  });
}

export function scaleInlineStyle(styleString: string, ratio: number): string {
  const declarations = styleString.split(";");
  const scaled = declarations.map((decl) => {
    const colonIndex = decl.indexOf(":");
    if (colonIndex === -1) return decl;
    const prop = decl.slice(0, colonIndex).trim();
    const val = decl.slice(colonIndex + 1).trim();

    if (!SCALABLE_SPACE_PROPERTIES.has(prop) && !SCALABLE_TEXT_PROPERTIES.has(prop) && !SCALABLE_BOX_PROPERTIES.has(prop)) {
      return decl;
    }

    if (prop === "line-height") {
      const numeric = Number.parseFloat(val);
      if (Number.isFinite(numeric) && !val.includes("px")) {
        return decl;
      }
    }

    if (prop === "border-width") {
      const scaled = val.replace(/(-?\d+(?:\.\d+)?)px/g, (_, num) => {
        const v = Math.max(1, Math.round(Number.parseFloat(num) * ratio));
        return `${v}px`;
      });
      return `${prop}: ${scaled}`;
    }

    return `${prop}: ${scalePxValue(val, ratio)}`;
  });
  return scaled.join("; ");
}

function resolveTextLayoutRole(element: HTMLElement): TextLayoutRole {
  const explicitBlockKind = element.getAttribute("data-html-block-kind");
  if (explicitBlockKind === "headline") return "headline";
  if (explicitBlockKind === "heading" || /^H[2-6]$/i.test(element.tagName)) {
    return "heading";
  }
  if (explicitBlockKind === "eyebrow" || explicitBlockKind === "paragraph" || element.tagName === "P") {
    return "paragraph";
  }
  if (explicitBlockKind === "list" || element.matches("ul, ol")) {
    return "list";
  }
  if (/^H1$/i.test(element.tagName)) {
    return "title";
  }
  const visualKind = element.getAttribute("data-html-visual-kind");
  if (visualKind === "annotation") return "annotation";
  if (visualKind === "rail") return "rail";
  if (visualKind === "badge") return "badge";
  if (element.matches("button")) return "button";
  if (element.matches("label")) return "label";
  return "unknown";
}

function parseInlineStyleDeclarations(style: string | null): Map<string, string> {
  const declarations = new Map<string, string>();
  if (!style) {
    return declarations;
  }

  for (const rawDecl of style.split(";")) {
    const decl = rawDecl.trim();
    if (!decl) {
      continue;
    }

    const colonIndex = decl.indexOf(":");
    if (colonIndex === -1) {
      continue;
    }

    const prop = decl.slice(0, colonIndex).trim();
    const value = decl.slice(colonIndex + 1).trim();
    if (!prop || !value) {
      continue;
    }

    declarations.set(prop, value);
  }

  return declarations;
}

function resolveScalableVarName(prop: string): string | null {
  if (SCALABLE_SPACE_PROPERTIES.has(prop)) {
    return "--st-space";
  }
  if (SCALABLE_TEXT_PROPERTIES.has(prop)) {
    return "--st-text";
  }
  if (SCALABLE_BOX_PROPERTIES.has(prop)) {
    return "--st-ratio";
  }
  return null;
}

export function shouldScaleBoxPropertyForShrink(args: {
  prop: string;
  position?: string | null;
  isPageRoot?: boolean;
}) {
  if (!SCALABLE_BOX_PROPERTIES.has(args.prop)) {
    return false;
  }

  if (args.prop === "border-width") {
    return true;
  }

  if (args.isPageRoot) {
    return false;
  }

  const normalizedPosition = (args.position ?? "").trim().toLowerCase();
  if (
    (normalizedPosition === "absolute" || normalizedPosition === "fixed") &&
    SCALABLE_GEOMETRY_BOX_PROPERTY_LIST.has(args.prop)
  ) {
    return false;
  }

  return true;
}

function resolveScalableDeclarationValue(
  el: HTMLElement,
  prop: string,
  inlineDeclarations: Map<string, string>,
): string | null {
  const inlineValue = inlineDeclarations.get(prop) ?? null;
  const computedValue =
    inlineValue === null &&
    (SCALABLE_SPACE_PROPERTIES.has(prop) || SCALABLE_TEXT_PROPERTIES.has(prop))
      ? (el.ownerDocument.defaultView?.getComputedStyle(el).getPropertyValue(prop).trim() ?? "")
      : "";
  const candidate = (inlineValue ?? computedValue).trim();

  if (!candidate) {
    return null;
  }

  if (prop === "line-height") {
    const numeric = Number.parseFloat(candidate);
    if (Number.isFinite(numeric) && !candidate.includes("px")) {
      return inlineValue !== null ? candidate : null;
    }
  }

  if (!candidate.includes("px")) {
    return inlineValue !== null ? candidate : null;
  }

  return candidate;
}

function preprocessElementStyles(el: HTMLElement): void {
  const inlineDeclarations = parseInlineStyleDeclarations(el.getAttribute("style"));
  const computedPosition =
    el.ownerDocument.defaultView?.getComputedStyle(el).position ?? el.style.position;
  const isPageRoot = el.matches("section.page");
  const newDecls: string[] = [];
  for (const [prop, value] of inlineDeclarations) {
    if (
      SCALABLE_BOX_PROPERTIES.has(prop) &&
      !shouldScaleBoxPropertyForShrink({
        prop,
        position: computedPosition,
        isPageRoot,
      })
    ) {
      newDecls.push(`${prop}: ${value}`);
      continue;
    }
    if (resolveScalableVarName(prop)) {
      continue;
    }
    newDecls.push(`${prop}: ${value}`);
  }

  for (const prop of [
    ...SCALABLE_SPACE_PROPERTY_LIST,
    ...SCALABLE_TEXT_PROPERTY_LIST,
    ...SCALABLE_BOX_PROPERTY_LIST,
  ]) {
    if (
      SCALABLE_BOX_PROPERTIES.has(prop) &&
      !shouldScaleBoxPropertyForShrink({
        prop,
        position: computedPosition,
        isPageRoot,
      })
    ) {
      continue;
    }
    const value = resolveScalableDeclarationValue(el, prop, inlineDeclarations);
    const varName = resolveScalableVarName(prop);
    if (!value || !varName) {
      continue;
    }
    const calcVal = value.replace(/(-?\d+(?:\.\d+)?)px/g, (_, num) => {
      return `calc(${num}px * var(${varName}, 1))`;
    });
    newDecls.push(`${prop}: ${calcVal}`);
  }

  if (newDecls.length === 0) {
    el.removeAttribute("style");
    return;
  }

  el.setAttribute("style", newDecls.join("; "));
}

function preprocessSvgForShrink(svg: SVGSVGElement): void {
  const w = svg.getAttribute("width");
  const h = svg.getAttribute("height");

  if (w && /^\d+(\.\d+)?$/.test(w.trim())) {
    svg.style.width = `calc(${w}px * var(--st-ratio, 1))`;
    svg.removeAttribute("width");
  }
  if (h && /^\d+(\.\d+)?$/.test(h.trim())) {
    svg.style.height = `calc(${h}px * var(--st-ratio, 1))`;
    svg.removeAttribute("height");
  }

  // For SVGs without percentage width/height in style, ensure they can scale
  const styleWidth = svg.style.width;
  const styleHeight = svg.style.height;
  if (!styleWidth && !styleHeight) {
    svg.style.width = "100%";
    svg.style.height = "100%";
  }
}

function preprocessPageForShrink(page: HTMLElement): void {
  annotateHtmlFitRolesOnPage(page);
  const allElements = Array.from(page.querySelectorAll<HTMLElement>("*"));
  for (const el of allElements) {
    preprocessElementStyles(el);
  }
  for (const svg of Array.from(page.querySelectorAll<SVGSVGElement>("svg"))) {
    preprocessSvgForShrink(svg);
  }
  preprocessElementStyles(page);
}

type PageContentBounds = {
  right: number;
  bottom: number;
  hasContent: boolean;
};

function measurePageContentBounds(page: HTMLElement): PageContentBounds {
  const pageRect = page.getBoundingClientRect();
  const fitContentElements = Array.from(
    page.querySelectorAll<HTMLElement>(`[${HTML_FIT_ROLE_ATTRIBUTE}="content"]`),
  ).filter((element) => {
    const isPlaceholder =
      element.closest("[data-html-canvas-placeholder='true']") ||
      element.closest("[data-html-transform-preview-placeholder='true']");
    if (isPlaceholder) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  });

  if (fitContentElements.length === 0) {
    return {
      right: 0,
      bottom: 0,
      hasContent: false,
    };
  }

  return fitContentElements.reduce<PageContentBounds>(
    (current, element) => {
      const rect = element.getBoundingClientRect();
      return {
        right: Math.max(current.right, Math.max(0, rect.right - pageRect.left)),
        bottom: Math.max(current.bottom, Math.max(0, rect.bottom - pageRect.top)),
        hasContent: true,
      };
    },
    {
      right: 0,
      bottom: 0,
      hasContent: false,
    },
  );
}

function computeMinTextRatio(page: HTMLElement, minFontSizes: Record<TextLayoutRole, number>): number {
  let minRatio = 0.3;
  const frameWindow = page.ownerDocument.defaultView;
  const allElements = Array.from(page.querySelectorAll<HTMLElement>("*"));
  for (const el of allElements) {
    const computedFontSize = frameWindow?.getComputedStyle(el).fontSize ?? "";
    const fontSize = Number.parseFloat(el.style.fontSize || computedFontSize || "");
    if (fontSize > 0) {
      const role = resolveTextLayoutRole(el);
      const min = minFontSizes[role] ?? minFontSizes.unknown;
      const requiredRatio = min / fontSize;
      minRatio = Math.max(minRatio, requiredRatio);
    }
  }
  return minRatio;
}

function applyDifferentialRatios(page: HTMLElement, baseRatio: number, minTextRatio: number): void {
  const spaceRatio = Math.max(0.4, 1 + (baseRatio - 1) * 1.2);
  const textRatio = Math.max(minTextRatio, 1 + (baseRatio - 1) * 0.8);

  page.style.setProperty("--st-ratio", String(baseRatio));
  page.style.setProperty("--st-space", String(spaceRatio));
  page.style.setProperty("--st-text", String(textRatio));
}

function flattenElementStyles(
  el: HTMLElement,
  ratio: number,
  spaceRatio: number,
  textRatio: number,
): void {
  const style = el.getAttribute("style");
  if (!style) return;

  const declarations = style.split(";").map((rawDecl) => {
    const decl = rawDecl.trim();
    if (!decl) return "";
    const colonIndex = decl.indexOf(":");
    if (colonIndex === -1) return decl;
    const prop = decl.slice(0, colonIndex).trim();
    const val = decl.slice(colonIndex + 1).trim();

    if (prop === "border-width") {
      const flattened = val
        .replace(/calc\((-?\d+(?:\.\d+)?)px\s*\*\s*var\(--st-ratio,\s*1\)\)/g, (_, num) => {
          return `${Math.max(1, Math.round(Number.parseFloat(num) * ratio))}px`;
        })
        .replace(/calc\((-?\d+(?:\.\d+)?)px\s*\*\s*var\(--st-space,\s*1\)\)/g, (_, num) => {
          return `${Math.max(1, Math.round(Number.parseFloat(num) * spaceRatio))}px`;
        })
        .replace(/calc\((-?\d+(?:\.\d+)?)px\s*\*\s*var\(--st-text,\s*1\)\)/g, (_, num) => {
          return `${Math.max(1, Math.round(Number.parseFloat(num) * textRatio))}px`;
        });
      return `${prop}: ${flattened}`;
    }

    const flattened = val
      .replace(/calc\((-?\d+(?:\.\d+)?)px\s*\*\s*var\(--st-ratio,\s*1\)\)/g, (_, num) => {
        const scaled = Number.parseFloat(num) * ratio;
        return scaled < 1 ? "0px" : `${Math.round(scaled * 10) / 10}px`;
      })
      .replace(/calc\((-?\d+(?:\.\d+)?)px\s*\*\s*var\(--st-space,\s*1\)\)/g, (_, num) => {
        const scaled = Number.parseFloat(num) * spaceRatio;
        return scaled < 1 ? "0px" : `${Math.round(scaled * 10) / 10}px`;
      })
      .replace(/calc\((-?\d+(?:\.\d+)?)px\s*\*\s*var\(--st-text,\s*1\)\)/g, (_, num) => {
        const scaled = Number.parseFloat(num) * textRatio;
        return scaled < 1 ? "0px" : `${Math.round(scaled * 10) / 10}px`;
      });
    return `${prop}: ${flattened}`;
  });

  el.setAttribute("style", declarations.filter(Boolean).join("; "));
  el.style.removeProperty("--st-ratio");
  el.style.removeProperty("--st-space");
  el.style.removeProperty("--st-text");
}

function flattenSvgDimensions(svg: SVGSVGElement, ratio: number): void {
  const widthStyle = svg.style.width;
  const heightStyle = svg.style.height;

  if (widthStyle && widthStyle.includes("var(--st-ratio")) {
    const match = widthStyle.match(/calc\(([\d.]+)px\s*\*\s*var\(--st-ratio/);
    if (match) {
      const scaled = Number.parseFloat(match[1]!) * ratio;
      svg.style.width = scaled < 1 ? "0px" : `${Math.round(scaled)}px`;
    }
  }
  if (heightStyle && heightStyle.includes("var(--st-ratio")) {
    const match = heightStyle.match(/calc\(([\d.]+)px\s*\*\s*var\(--st-ratio/);
    if (match) {
      const scaled = Number.parseFloat(match[1]!) * ratio;
      svg.style.height = scaled < 1 ? "0px" : `${Math.round(scaled)}px`;
    }
  }
}

function flattenPageShrink(page: HTMLElement, ratio: number, spaceRatio: number, textRatio: number): void {
  const allElements = Array.from(page.querySelectorAll<HTMLElement>("*"));
  for (const el of allElements) {
    flattenElementStyles(el, ratio, spaceRatio, textRatio);
  }
  for (const svg of Array.from(page.querySelectorAll<SVGSVGElement>("svg"))) {
    flattenSvgDimensions(svg, ratio);
  }
  flattenElementStyles(page, ratio, spaceRatio, textRatio);
}

async function waitForContainerFonts(container: HTMLElement): Promise<void> {
  const fontFamilies = new Set<string>();
  const allElements = container.querySelectorAll<HTMLElement>("*");
  const fontSet = container.ownerDocument.fonts;
  const frameWindow = container.ownerDocument.defaultView;

  for (const el of allElements) {
    const computed = frameWindow?.getComputedStyle(el).fontFamily ?? "";
    if (computed) {
      const families = computed.split(",").map((f) => f.trim().replace(/^["']|["']$/g, ""));
      for (const family of families) {
        if (
          family &&
          !/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace)$/i.test(
            family,
          )
        ) {
          fontFamilies.add(family);
        }
      }
    }
  }

  const promises = Array.from(fontFamilies).map((family) => {
    return fontSet.load(`1em "${family}"`).catch(() => undefined);
  });

  await Promise.race([Promise.all(promises), new Promise<void>((resolve) => setTimeout(resolve, 1500))]);

  container.getBoundingClientRect();
}

async function createShrinkMeasurementFrame(
  fullHtml: string,
  maxWidth: number,
): Promise<HTMLIFrameElement> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("sandbox", "allow-same-origin");
  iframe.tabIndex = -1;
  iframe.style.cssText = `
    position: fixed;
    visibility: hidden;
    top: -9999px;
    left: 0;
    width: ${maxWidth}px;
    height: ${HTML_REPORT_PAGE_HEIGHT}px;
    border: 0;
    pointer-events: none;
    opacity: 0;
  `;

  const loadPromise = new Promise<HTMLIFrameElement>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      iframe.remove();
      reject(new Error("Shrink-to-fit measurement frame timed out."));
    }, 5_000);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      iframe.onload = null;
      iframe.onerror = null;
    };

    iframe.onload = () => {
      cleanup();
      resolve(iframe);
    };
    iframe.onerror = () => {
      cleanup();
      iframe.remove();
      reject(new Error("Shrink-to-fit measurement frame failed to load."));
    };
  });

  iframe.srcdoc = fullHtml;
  document.body.appendChild(iframe);
  return loadPromise;
}

async function findOptimalShrinkRatio(args: {
  page: HTMLElement;
  maxHeight: number;
  maxWidth: number;
  minFontSizes: Record<TextLayoutRole, number>;
  dampening: number;
  iterations: number;
}): Promise<Omit<ShrinkToFitPageResult, "pageNumber"> & { spaceRatio: number; textRatio: number }> {
  const { page, maxHeight, maxWidth, minFontSizes, dampening, iterations } = args;

  page.style.setProperty("--st-ratio", "1");
  page.style.setProperty("--st-space", "1");
  page.style.setProperty("--st-text", "1");
  const originalBounds = measurePageContentBounds(page);
  const originalHeight = originalBounds.bottom;

  if (
    !originalBounds.hasContent ||
    (originalBounds.bottom <= maxHeight && originalBounds.right <= maxWidth)
  ) {
    return {
      success: true,
      originalHeight,
      finalHeight: originalHeight,
      scaleRatio: 1,
      spaceRatio: 1,
      textRatio: 1,
      notes: ["No overflow detected."],
    };
  }

  const minTextRatio = computeMinTextRatio(page, minFontSizes);
  const floorRatio = Math.max(0.4, minTextRatio);

  let low = floorRatio;
  let high = 1.0;
  let bestRatio = floorRatio;
  let bestSpaceRatio = Math.max(0.4, 1 + (floorRatio - 1) * 1.2);
  let bestTextRatio = Math.max(minTextRatio, 1 + (floorRatio - 1) * 0.8);
  let bestHeight = originalHeight;

  for (let i = 0; i < iterations; i++) {
    const mid = (low + high) / 2;
    applyDifferentialRatios(page, mid, minTextRatio);
    const bounds = measurePageContentBounds(page);
    const height = bounds.bottom;
    const width = bounds.right;

    if (height <= maxHeight && width <= maxWidth) {
      bestRatio = mid;
      bestHeight = height;
      bestSpaceRatio = Math.max(0.4, 1 + (mid - 1) * 1.2);
      bestTextRatio = Math.max(minTextRatio, 1 + (mid - 1) * 0.8);
      low = mid;
    } else {
      high = mid;
    }
  }

  // Apply dampening to the final best ratio for a slight safety margin
  const finalRatio = bestRatio * dampening;
  applyDifferentialRatios(page, finalRatio, minTextRatio);
  const finalBounds = measurePageContentBounds(page);
  const finalHeight = finalBounds.bottom;

  if (finalHeight > maxHeight + 4 || finalBounds.right > maxWidth + 4) {
    return {
      success: false,
      originalHeight,
      finalHeight,
      scaleRatio: finalRatio,
      spaceRatio: Math.max(0.4, 1 + (finalRatio - 1) * 1.2),
      textRatio: Math.max(minTextRatio, 1 + (finalRatio - 1) * 0.8),
      notes: [
        `Best ratio ${bestRatio.toFixed(3)} (dampened ${finalRatio.toFixed(3)}) still results in ${finalHeight}px height and ${Math.round(finalBounds.right)}px width.`,
      ],
      violation: "predicted-height",
    };
  }

  return {
    success: true,
    originalHeight,
    finalHeight,
    scaleRatio: finalRatio,
    spaceRatio: Math.max(0.4, 1 + (finalRatio - 1) * 1.2),
    textRatio: Math.max(minTextRatio, 1 + (finalRatio - 1) * 0.8),
    notes: [
      `Binary search found optimal ratio ${bestRatio.toFixed(3)}, dampened to ${finalRatio.toFixed(3)}.`,
      `Height reduced from ${originalHeight}px to ${finalHeight}px.`,
      `Text scaled by ${Math.max(minTextRatio, 1 + (finalRatio - 1) * 0.8).toFixed(3)}, spacing by ${Math.max(0.4, 1 + (finalRatio - 1) * 1.2).toFixed(3)}.`,
    ],
  };
}

export async function applyShrinkToFitToReport(
  fullHtml: string,
  options?: Partial<ShrinkToFitOptions>,
): Promise<ShrinkToFitReportResult> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return { html: fullHtml, pages: [], changed: false };
  }

  const opts = { ...DEFAULT_SHRINK_OPTIONS, ...options };
  const iframe = await createShrinkMeasurementFrame(fullHtml, opts.maxWidth);

  try {
    const frameDocument = iframe.contentDocument;
    if (!frameDocument) {
      return { html: fullHtml, pages: [], changed: false };
    }

    const pageElements = Array.from(
      frameDocument.querySelectorAll<HTMLElement>("section.page"),
    );

    if (pageElements.length === 0) {
      return { html: fullHtml, pages: [], changed: false };
    }

    await waitForContainerFonts(frameDocument.body);

    const pages: ShrinkToFitPageResult[] = [];
    let changed = false;

    for (let i = 0; i < pageElements.length; i++) {
      const page = pageElements[i]!;
      const pageNumber = i + 1;

      preprocessPageForShrink(page);

      const result = await findOptimalShrinkRatio({
        page,
        maxHeight: opts.maxHeight,
        maxWidth: opts.maxWidth,
        minFontSizes: opts.minFontSizes,
        dampening: opts.dampening,
        iterations: opts.binarySearchIterations,
      });

      if (!result.success) {
        pages.push({ pageNumber, ...result });
        flattenPageShrink(page, 1, 1, 1);
        continue;
      }

      if (result.scaleRatio >= 1) {
        pages.push({ pageNumber, ...result });
        flattenPageShrink(page, 1, 1, 1);
        continue;
      }

      flattenPageShrink(page, result.scaleRatio, result.spaceRatio, result.textRatio);
      changed = true;

      pages.push({
        pageNumber,
        ...result,
      });
    }

    const finalHtml = `<!DOCTYPE html>\n${frameDocument.documentElement.outerHTML}`;
    return { html: finalHtml, pages, changed };
  } finally {
    iframe.remove();
  }
}
