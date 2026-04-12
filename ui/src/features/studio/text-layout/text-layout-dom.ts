import {
  measureListBlock,
  measureTextBlock,
  resolveFontDescriptorToCss,
} from "./pretext-engine";
import type {
  PageTextLayoutPrediction,
  TextLayoutMeasurement,
  TextLayoutOverflowRisk,
  TextLayoutRole,
  TextLayoutWhiteSpace,
} from "./text-layout-types";

function normalizeInlineText(text: string) {
  return text.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

function parseNumericCssPx(value: string | null | undefined, fallback: number) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveElementWhiteSpace(element: HTMLElement) {
  const computed = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!computed) {
    return "normal" satisfies TextLayoutWhiteSpace;
  }
  return computed.whiteSpace === "pre-wrap" || computed.whiteSpace === "pre-line"
    ? "pre-wrap"
    : "normal";
}

function resolveTextLayoutRole(element: HTMLElement): TextLayoutRole {
  const explicitBlockKind = element.getAttribute("data-html-block-kind");
  if (explicitBlockKind === "headline") {
    return "headline";
  }
  if (explicitBlockKind === "heading" || /^H[2-6]$/.test(element.tagName)) {
    return "heading";
  }
  if (explicitBlockKind === "eyebrow" || explicitBlockKind === "paragraph" || element.tagName === "P") {
    return "paragraph";
  }
  if (explicitBlockKind === "list" || element.matches("ul,ol")) {
    return "list";
  }
  if (/^H1$/.test(element.tagName)) {
    return "title";
  }

  const visualKind = element.getAttribute("data-html-visual-kind");
  if (visualKind === "annotation") {
    return "annotation";
  }
  if (visualKind === "rail") {
    return "rail";
  }
  if (visualKind === "badge") {
    return "badge";
  }
  if (element.matches("button")) {
    return "button";
  }
  if (element.matches("label")) {
    return "label";
  }
  return "unknown";
}

function resolveElementSelector(element: HTMLElement) {
  const blockId = element.getAttribute("data-html-block-id");
  if (blockId) {
    return `[data-html-block-id="${blockId}"]`;
  }
  const visualId = element.getAttribute("data-html-visual-id");
  if (visualId) {
    return `[data-html-visual-id="${visualId}"]`;
  }
  const layoutId = element.getAttribute("data-html-layout-id");
  if (layoutId) {
    return `[data-html-layout-id="${layoutId}"]`;
  }
  if (element.id) {
    return `#${element.id}`;
  }
  return element.tagName.toLowerCase();
}

function resolveOverflowRisk(args: {
  actualHeight: number;
  predictedHeight: number;
  width: number;
  tightWidth: number;
}): TextLayoutOverflowRisk {
  const heightDelta = args.predictedHeight - args.actualHeight;
  const widthDelta = args.tightWidth - args.width;
  if (heightDelta > 8 || widthDelta > 12) {
    return "overflow";
  }
  if (heightDelta > -2 || widthDelta > 0) {
    return "tight";
  }
  return "none";
}

export function formatTextOverflowRoot(measurement: TextLayoutMeasurement) {
  const anchors = [
    measurement.blockId ? `block=${measurement.blockId}` : null,
    measurement.layoutId ? `layout=${measurement.layoutId}` : null,
    measurement.selector ? `selector=${measurement.selector}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const preview = measurement.textPreview ? ` text="${measurement.textPreview}"` : "";
  return `${measurement.role}${anchors ? ` {${anchors}}` : ""}${preview}`;
}

export function measureDomTextElement(args: {
  element: HTMLElement;
  role?: TextLayoutRole;
  selector?: string | null;
  blockId?: string | null;
  layoutId?: string | null;
}): TextLayoutMeasurement | null {
  const view = args.element.ownerDocument.defaultView;
  if (!view) {
    return null;
  }

  const rect = args.element.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const actualHeight = Math.max(
    Math.round(rect.height),
    Math.round(args.element.scrollHeight || 0),
    Math.round(args.element.offsetHeight || 0),
  );
  if (!width || !actualHeight) {
    return null;
  }

  const computed = view.getComputedStyle(args.element);
  const fontSize = parseNumericCssPx(computed.fontSize, 16);
  const lineHeight = parseNumericCssPx(computed.lineHeight, fontSize * 1.2);
  const whiteSpace = resolveElementWhiteSpace(args.element);
  const role = args.role ?? resolveTextLayoutRole(args.element);
  const blockId = args.blockId ?? args.element.getAttribute("data-html-block-id");
  const layoutId = args.layoutId ?? args.element.getAttribute("data-html-layout-id");
  const selector = args.selector ?? resolveElementSelector(args.element);
  const items =
    role === "list"
      ? Array.from(args.element.querySelectorAll(":scope li"))
          .map((item) => normalizeInlineText(item.textContent ?? ""))
          .filter(Boolean)
      : [];
  const text =
    role === "list"
      ? items.join("\n")
      : normalizeInlineText(args.element.innerText || args.element.textContent || "");
  if (!text) {
    return null;
  }

  const font = resolveFontDescriptorToCss({
    family: computed.fontFamily || "Arial",
    sizePx: fontSize,
    weight: computed.fontWeight || "400",
    style: computed.fontStyle || "normal",
  });
  const result =
    role === "list"
      ? measureListBlock({
          items,
          widthPx: width,
          lineHeightPx: lineHeight,
          font,
          whiteSpace,
          itemGapPx: Math.max(4, lineHeight * 0.28),
          bulletIndentPx: Math.max(14, fontSize * 0.85),
        })
      : measureTextBlock({
          text,
          widthPx: width,
          lineHeightPx: lineHeight,
          font,
          whiteSpace,
        });

  return {
    blockId,
    layoutId,
    selector,
    role,
    width,
    fontSize,
    lineHeight,
    predictedHeight: Math.max(1, Math.round(result.height)),
    predictedLineCount: result.lineCount,
    actualHeight,
    tightWidth: Math.max(0, Math.round(result.tightWidth)),
    overflowRisk: resolveOverflowRisk({
      actualHeight,
      predictedHeight: result.height,
      width,
      tightWidth: result.tightWidth,
    }),
    textPreview: normalizeInlineText(text).slice(0, 140) || null,
  };
}

export function measurePageTextLayoutPrediction(args: {
  pageRoot: HTMLElement;
}): PageTextLayoutPrediction {
  const measurements: TextLayoutMeasurement[] = [];
  const seen = new Set<HTMLElement>();
  const topLevelBlocks = Array.from(
    args.pageRoot.querySelectorAll<HTMLElement>("[data-html-block-id]"),
  ).filter((element) => !element.parentElement?.closest("[data-html-block-id]"));

  for (const block of topLevelBlocks) {
    const measurement = measureDomTextElement({ element: block });
    if (measurement) {
      measurements.push(measurement);
      seen.add(block);
    }
  }

  const extraSelectors = [
    '[data-html-visual-kind="annotation"]',
    '[data-html-visual-kind="rail"]',
    '[data-html-visual-kind="badge"]',
    "h1,h2,h3,h4,h5,h6,p,button,label",
  ];
  const extraElements = Array.from(
    args.pageRoot.querySelectorAll<HTMLElement>(extraSelectors.join(",")),
  );

  for (const element of extraElements) {
    if (seen.has(element) || element.closest("[data-html-block-id]")) {
      continue;
    }
    const measurement = measureDomTextElement({ element });
    if (!measurement) {
      continue;
    }
    seen.add(element);
    measurements.push(measurement);
  }

  const rankedMeasurements = [...measurements].sort((left, right) => {
    const leftRisk = left.overflowRisk === "overflow" ? 2 : left.overflowRisk === "tight" ? 1 : 0;
    const rightRisk = right.overflowRisk === "overflow" ? 2 : right.overflowRisk === "tight" ? 1 : 0;
    if (leftRisk !== rightRisk) {
      return rightRisk - leftRisk;
    }
    const leftDelta =
      Math.max(0, left.predictedHeight - left.actualHeight) +
      Math.max(0, left.tightWidth - left.width);
    const rightDelta =
      Math.max(0, right.predictedHeight - right.actualHeight) +
      Math.max(0, right.tightWidth - right.width);
    return rightDelta - leftDelta;
  });

  const predictedOverflowRoots = rankedMeasurements
    .filter((measurement) => measurement.overflowRisk !== "none")
    .slice(0, 6)
    .map(formatTextOverflowRoot);

  return {
    textMeasurements: measurements,
    predictedTextOverflow: predictedOverflowRoots.length > 0,
    predictedOverflowRoots,
  };
}

export function resolveElementTextLayoutWhiteSpace(element: HTMLElement) {
  return resolveElementWhiteSpace(element);
}
