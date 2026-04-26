import {
  toGeneratedReportStyleProfile,
  type DeckStyleProfile,
} from "../industry-style.js";
import type {
  ChartSpec,
  GeneratedReportStyleProfile,
  HtmlAnimationPage,
  HtmlAnimationStructure,
  HtmlPageAnimationManifest,
  HtmlOutputMode,
  PageRecipe,
  StructuredDiagramNode,
  StructuredDiagramSpec,
} from "./contracts.js";
import {
  htmlEntryTrackSchema,
  htmlLoopEffectSchema,
  htmlPageAnimationManifestSchema,
} from "./schemas.js";
import {
  renderScientificDiagramShell,
} from "./scientific-diagram.js";
import {
  assessGeneratedTitleQuality,
  compactBoardTitle,
  deriveEvidenceTitle,
  splitBriefLines,
  stripInstructionalLead,
} from "./brief.js";

function stripCodeFences(text: string) {
  return text
    .replace(/^```(?:html|json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function indexOfCaseInsensitive(text: string, search: string, fromIndex = 0) {
  return text.toLowerCase().indexOf(search.toLowerCase(), fromIndex);
}

function findTagEnd(html: string, startIndex: number) {
  let activeQuote: '"' | "'" | null = null;
  for (let index = startIndex; index < html.length; index += 1) {
    const char = html[index];
    if (activeQuote) {
      if (char === activeQuote) {
        activeQuote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      activeQuote = char;
      continue;
    }
    if (char === ">") {
      return index;
    }
  }
  return -1;
}

function isAttributeBoundary(char: string | undefined) {
  return !char || /\s|<|>|\/|=/.test(char);
}

function readTagAttribute(tag: string, attributeName: string) {
  const lowerTag = tag.toLowerCase();
  const lowerName = attributeName.toLowerCase();
  let searchIndex = 0;

  while (searchIndex < lowerTag.length) {
    const attributeIndex = lowerTag.indexOf(lowerName, searchIndex);
    if (attributeIndex < 0) {
      return null;
    }

    const beforeChar = lowerTag[attributeIndex - 1];
    const afterNameChar = lowerTag[attributeIndex + lowerName.length];
    if (!isAttributeBoundary(beforeChar) || !isAttributeBoundary(afterNameChar)) {
      searchIndex = attributeIndex + lowerName.length;
      continue;
    }

    let valueStart = attributeIndex + lowerName.length;
    while (valueStart < tag.length && /\s/.test(tag[valueStart] ?? "")) {
      valueStart += 1;
    }
    if (tag[valueStart] !== "=") {
      searchIndex = attributeIndex + lowerName.length;
      continue;
    }
    valueStart += 1;
    while (valueStart < tag.length && /\s/.test(tag[valueStart] ?? "")) {
      valueStart += 1;
    }

    const quote = tag[valueStart];
    if (quote === '"' || quote === "'") {
      const valueEnd = tag.indexOf(quote, valueStart + 1);
      if (valueEnd < 0) {
        return null;
      }
      return tag.slice(valueStart + 1, valueEnd);
    }

    let valueEnd = valueStart;
    while (valueEnd < tag.length && !/[\s>]/.test(tag[valueEnd] ?? "")) {
      valueEnd += 1;
    }
    return tag.slice(valueStart, valueEnd);
  }

  return null;
}

function tagHasClassToken(tag: string, classToken: string) {
  const classValue = readTagAttribute(tag, "class");
  if (!classValue) {
    return false;
  }
  return classValue
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .includes(classToken);
}

export function extractHtmlDocument(text: string) {
  const cleaned = stripCodeFences(text);
  const lowered = cleaned.toLowerCase();
  const doctypeIndex = indexOfCaseInsensitive(cleaned, "<!doctype html>");
  const htmlIndex = indexOfCaseInsensitive(cleaned, "<html");
  const startIndex =
    doctypeIndex >= 0 ? doctypeIndex : htmlIndex >= 0 ? htmlIndex : 0;
  const bodyClosingIndex = lowered.lastIndexOf("</body>");
  const htmlClosingSearchStart =
    bodyClosingIndex >= startIndex ? bodyClosingIndex + "</body>".length : startIndex;
  const relativeClosingIndex = lowered.indexOf("</html>", htmlClosingSearchStart);
  const fallbackClosingIndex = lowered.lastIndexOf("</html>");
  const closingIndex =
    relativeClosingIndex >= 0 ? relativeClosingIndex : fallbackClosingIndex;
  if (closingIndex < 0) {
    return cleaned.slice(startIndex).trim();
  }
  return cleaned.slice(startIndex, closingIndex + "</html>".length).trim();
}

export function extractJsonDocument(text: string) {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBraceIndex = text.indexOf("{");
  const lastBraceIndex = text.lastIndexOf("}");
  if (firstBraceIndex < 0 || lastBraceIndex <= firstBraceIndex) {
    return "";
  }

  return text.slice(firstBraceIndex, lastBraceIndex + 1).trim();
}

export function extractTextBeforeHtml(text: string) {
  const doctypeIndex = text.search(/<!DOCTYPE html>/i);
  const htmlIndex = text.search(/<html[\s>]/i);
  const startIndex = doctypeIndex >= 0 ? doctypeIndex : htmlIndex >= 0 ? htmlIndex : -1;
  if (startIndex < 0) {
    return text.trim();
  }

  return text.slice(0, startIndex).replace(/```(?:html)?/gi, "").trim();
}

export function extractTextBeforeJson(text: string) {
  const fencedIndex = text.search(/```json/i);
  const firstBraceIndex = text.indexOf("{");
  const startIndex =
    fencedIndex >= 0
      ? fencedIndex
      : firstBraceIndex >= 0
        ? firstBraceIndex
        : -1;
  if (startIndex < 0) {
    return text.trim();
  }

  return text.slice(0, startIndex).replace(/```/g, "").trim();
}

export function extractPageTitles(html: string) {
  const titles: string[] = [];
  let searchIndex = 0;

  while (searchIndex < html.length) {
    const sectionIndex = indexOfCaseInsensitive(html, "<section", searchIndex);
    if (sectionIndex < 0) {
      break;
    }
    const tagEnd = findTagEnd(html, sectionIndex);
    if (tagEnd < 0) {
      break;
    }

    const tag = html.slice(sectionIndex, tagEnd + 1);
    if (tagHasClassToken(tag, "page")) {
      const pageTitle = readTagAttribute(tag, "data-page-title")?.trim();
      if (pageTitle) {
        titles.push(pageTitle);
      }
    }

    searchIndex = tagEnd + 1;
  }

  return titles;
}

export function extractDocumentTitle(html: string) {
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]?.trim()) {
    return titleMatch[1].trim();
  }
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match?.[1]?.trim()) {
    return h1Match[1].replace(/<[^>]+>/g, "").trim();
  }
  return "Generated studio report";
}

export function replaceDocumentTitle(html: string, title: string) {
  const titleTag = `<title>${escapeHtml(title)}</title>`;
  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/i, titleTag);
  }

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}\n${titleTag}`);
  }

  return html;
}

export function countPages(html: string) {
  return Array.from(
    html.matchAll(/<section[^>]*class=["'][^"']*\bpage\b[^"']*["'][^>]*>/gi),
  ).length;
}

const promptScaffoldLeakPatterns: Array<[RegExp, string]> = [
  [
    /\b(?:raw brief|ai understanding|visual thinking|active capability cards|user task brief|task rigor brief|renderer brief|proof plan|layout strategy|source material|selected template contract|capability cards|output rules|page argument contract|deck planning intent)\b/i,
    "workspace block label",
  ],
  [
    /\b(?:headline claim|support bullets?|evidence callouts?|evidence bullets?|page evidence bundle|brief digest|current page (?:goal|story|intent|objective)|page question)\s*:/i,
    "page contract label",
  ],
  [/\bsupport bullet\s*\d+\b/i, "support bullet scaffold label"],
  [/\bone-page thesis\b/i, "one-page thesis scaffold label"],
  [/\bselected deep family\b/i, "deep layout scaffold label"],
  [/\bthis page must answer exactly one\b/i, "page argument instruction"],
  [/\bat most\s+2\s+short\s+(?:bullets|callouts)\b/i, "copy-budget instruction"],
  [/\b(?:using|tied to|based on)\s+the supplied brief\b/i, "supplied brief instruction"],
];

function decodeBasicHtmlEntities(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function extractVisibleTextForLeakCheck(html: string) {
  return decodeBasicHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

const ALLOWED_ANIMATION_ATTRS = new Set([
  "data-anim-anchor",
  "data-anim-role",
  "data-anim-enter",
  "data-anim-delay",
  "data-anim-duration",
  "data-anim-order",
]);

const ALLOWED_ANIMATION_ROLES = new Set([
  "hero",
  "headline",
  "chart",
  "callout",
  "label",
  "quadrant",
  "rail",
  "surface",
  "metric",
  "annotation",
]);

const ALLOWED_ANIMATION_ENTERS = new Set([
  "fade-up",
  "fade-in",
  "slide-right",
  "slide-left",
  "scale-in",
  "chart-reveal",
]);
const ANIMATION_ANCHOR_ATTR = "data-anim-anchor";
const ANIMATION_MANIFEST_ATTR = "data-studio-animation-manifest";
const ANIMATION_ANCHOR_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;
const SUPPORTED_LOOP_EFFECT_KINDS = new Set(["rotate", "ticker", "typewriter", "pulse", "orbit"]);

function buildAnimationManifestFieldError(pageNumber: number, fieldPath: string) {
  return new Error(
    `Page ${pageNumber} returned an invalid animation manifest field: ${fieldPath}.`,
  );
}

function parseAnimationManifestIntegerLike(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return value;
  }

  return Number.parseInt(normalized, 10);
}

function normalizeAnimationManifestAnchor(args: {
  pageNumber: number;
  fieldPath: string;
  value: unknown;
}) {
  if (args.value === undefined || args.value === null) {
    return args.value;
  }
  if (typeof args.value !== "string") {
    throw buildAnimationManifestFieldError(args.pageNumber, args.fieldPath);
  }

  const normalized = args.value.trim();
  if (!ANIMATION_ANCHOR_PATTERN.test(normalized)) {
    throw new Error(
      `Page ${args.pageNumber} returned an invalid animation anchor: ${normalized}.`,
    );
  }
  return normalized;
}

function normalizeAnimationManifestEntryTrack(args: {
  pageNumber: number;
  value: unknown;
  index: number;
}) {
  if (!args.value || typeof args.value !== "object" || Array.isArray(args.value)) {
    return null;
  }

  const candidate = args.value as Record<string, unknown>;
  const normalized = {
    ...candidate,
    ...(candidate.anchor !== undefined
      ? {
          anchor: normalizeAnimationManifestAnchor({
            pageNumber: args.pageNumber,
            fieldPath: `entryTracks[${args.index}].anchor`,
            value: candidate.anchor,
          }),
        }
      : {}),
    ...(typeof candidate.preset === "string" ? { preset: candidate.preset.trim() } : {}),
    ...(candidate.delayMs !== undefined
      ? { delayMs: parseAnimationManifestIntegerLike(candidate.delayMs) }
      : {}),
    ...(candidate.durationMs !== undefined
      ? { durationMs: parseAnimationManifestIntegerLike(candidate.durationMs) }
      : {}),
    ...(candidate.order !== undefined
      ? { order: parseAnimationManifestIntegerLike(candidate.order) }
      : {}),
  };
  const parsed = htmlEntryTrackSchema.safeParse(normalized);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

function normalizeAnimationManifestLoopEffect(args: {
  pageNumber: number;
  value: unknown;
  index: number;
}) {
  if (!args.value || typeof args.value !== "object" || Array.isArray(args.value)) {
    return null;
  }

  const candidate = args.value as Record<string, unknown>;
  const rawKind =
    typeof candidate.kind === "string" ? candidate.kind.trim() : candidate.kind;
  if (rawKind !== undefined && rawKind !== null) {
    if (typeof rawKind !== "string") {
      return null;
    }
    if (!SUPPORTED_LOOP_EFFECT_KINDS.has(rawKind)) {
      throw new Error(
        `Page ${args.pageNumber} used an unsupported animation loop kind: ${rawKind}.`,
      );
    }
  }

  const normalizedBase = {
    ...candidate,
    ...(rawKind !== undefined ? { kind: rawKind } : {}),
    ...(candidate.anchor !== undefined
      ? {
          anchor: normalizeAnimationManifestAnchor({
            pageNumber: args.pageNumber,
            fieldPath: `loopEffects[${args.index}].anchor`,
            value: candidate.anchor,
          }),
        }
      : {}),
  };
  const normalized = (() => {
    if (rawKind === "rotate") {
      return {
        ...normalizedBase,
        ...(candidate.durationMs !== undefined
          ? { durationMs: parseAnimationManifestIntegerLike(candidate.durationMs) }
          : {}),
        ...(typeof candidate.direction === "string"
          ? { direction: candidate.direction.trim() }
          : {}),
        ...(candidate.angleDeg !== undefined
          ? { angleDeg: parseAnimationManifestIntegerLike(candidate.angleDeg) }
          : {}),
      };
    }
    if (rawKind === "ticker") {
      return {
        ...normalizedBase,
        ...(candidate.items !== undefined ? { items: candidate.items } : {}),
        ...(candidate.stepMs !== undefined
          ? { stepMs: parseAnimationManifestIntegerLike(candidate.stepMs) }
          : {}),
      };
    }
    if (rawKind === "typewriter") {
      return {
        ...normalizedBase,
        ...(candidate.items !== undefined ? { items: candidate.items } : {}),
        ...(candidate.typeMs !== undefined
          ? { typeMs: parseAnimationManifestIntegerLike(candidate.typeMs) }
          : {}),
        ...(candidate.holdMs !== undefined
          ? { holdMs: parseAnimationManifestIntegerLike(candidate.holdMs) }
          : {}),
        ...(candidate.deleteMs !== undefined
          ? { deleteMs: parseAnimationManifestIntegerLike(candidate.deleteMs) }
          : {}),
      };
    }
    if (rawKind === "pulse") {
      return {
        ...normalizedBase,
        ...(candidate.durationMs !== undefined
          ? { durationMs: parseAnimationManifestIntegerLike(candidate.durationMs) }
          : {}),
        ...(candidate.scaleFrom !== undefined ? { scaleFrom: candidate.scaleFrom } : {}),
        ...(candidate.scaleTo !== undefined ? { scaleTo: candidate.scaleTo } : {}),
        ...(candidate.opacityFrom !== undefined ? { opacityFrom: candidate.opacityFrom } : {}),
        ...(candidate.opacityTo !== undefined ? { opacityTo: candidate.opacityTo } : {}),
      };
    }
    if (rawKind === "orbit") {
      return {
        ...normalizedBase,
        ...(candidate.durationMs !== undefined
          ? { durationMs: parseAnimationManifestIntegerLike(candidate.durationMs) }
          : {}),
        ...(candidate.radiusPx !== undefined
          ? { radiusPx: parseAnimationManifestIntegerLike(candidate.radiusPx) }
          : {}),
        ...(typeof candidate.axis === "string" ? { axis: candidate.axis.trim() } : {}),
      };
    }
    return normalizedBase;
  })();
  const parsed = htmlLoopEffectSchema.safeParse(normalized);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

function normalizeAnimationManifestCandidate(args: {
  pageNumber: number;
  value: unknown;
}) {
  if (!args.value || typeof args.value !== "object" || Array.isArray(args.value)) {
    throw new Error(
      `Page ${args.pageNumber} returned an invalid animation manifest shape: manifest must be an object.`,
    );
  }

  const candidate = args.value as Record<string, unknown>;
  const version =
    candidate.version === undefined
      ? 1
      : parseAnimationManifestIntegerLike(candidate.version);
  if (version !== 1) {
    throw buildAnimationManifestFieldError(args.pageNumber, "version");
  }

  const startMode =
    candidate.startMode === undefined
      ? "entry-then-loop"
      : typeof candidate.startMode === "string"
        ? candidate.startMode.trim()
        : candidate.startMode;
  if (startMode !== "entry-then-loop") {
    throw buildAnimationManifestFieldError(args.pageNumber, "startMode");
  }

  if (candidate.entryTracks !== undefined && !Array.isArray(candidate.entryTracks)) {
    throw buildAnimationManifestFieldError(args.pageNumber, "entryTracks");
  }
  if (candidate.loopEffects !== undefined && !Array.isArray(candidate.loopEffects)) {
    throw buildAnimationManifestFieldError(args.pageNumber, "loopEffects");
  }
  const rawEntryTracks = Array.isArray(candidate.entryTracks) ? candidate.entryTracks : null;
  const rawLoopEffects = Array.isArray(candidate.loopEffects) ? candidate.loopEffects : null;
  if ((rawEntryTracks?.length ?? 0) > 6) {
    throw buildAnimationManifestFieldError(args.pageNumber, "entryTracks");
  }
  if ((rawLoopEffects?.length ?? 0) > 4) {
    throw buildAnimationManifestFieldError(args.pageNumber, "loopEffects");
  }

  const entryTracks = rawEntryTracks
    ? rawEntryTracks
        .map((track, index) =>
          normalizeAnimationManifestEntryTrack({
            pageNumber: args.pageNumber,
            value: track,
            index,
          }),
        )
        .filter(
          (
            track,
          ): track is NonNullable<HtmlPageAnimationManifest["entryTracks"]>[number] => Boolean(track),
        )
    : [];
  const loopEffects = rawLoopEffects
    ? rawLoopEffects
        .map((effect, index) =>
          normalizeAnimationManifestLoopEffect({
            pageNumber: args.pageNumber,
            value: effect,
            index,
          }),
        )
        .filter(
          (
            effect,
          ): effect is NonNullable<HtmlPageAnimationManifest["loopEffects"]>[number] => Boolean(effect),
        )
    : [];

  const parsed = htmlPageAnimationManifestSchema.safeParse({
    version: 1,
    startMode: "entry-then-loop",
    ...(entryTracks.length > 0 ? { entryTracks } : {}),
    ...(loopEffects.length > 0 ? { loopEffects } : {}),
  });
  if (!parsed.success) {
    const pathLabel = parsed.error.issues[0]?.path.join(".") || "manifest";
    throw buildAnimationManifestFieldError(args.pageNumber, pathLabel);
  }

  return parsed.data;
}

function parseAnimationTimingMetadata(
  attrName: "data-anim-delay" | "data-anim-duration" | "data-anim-order",
  attrValue: string,
) {
  const normalized = attrValue.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (attrName === "data-anim-order") {
    if (!/^\d{1,2}$/.test(normalized)) {
      return null;
    }
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (/^\d{1,4}$/.test(normalized)) {
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (/^\d{1,4}ms$/.test(normalized)) {
    const parsed = Number.parseInt(normalized.slice(0, -2), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (/^\d(?:\.\d{1,2})?s$/.test(normalized)) {
    const parsed = Math.round(Number.parseFloat(normalized.slice(0, -1)) * 1000);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function hasAnimationManifestContent(manifest: HtmlPageAnimationManifest | null | undefined) {
  return Boolean((manifest?.entryTracks?.length ?? 0) > 0 || (manifest?.loopEffects?.length ?? 0) > 0);
}

function buildAnimationLoopEffectKey(
  effect: NonNullable<HtmlPageAnimationManifest["loopEffects"]>[number],
) {
  return `${effect.kind}:${effect.anchor}`;
}

function mergeAnimationManifestPreservingPrevious(args: {
  anchors: string[];
  nextManifest: HtmlPageAnimationManifest | null;
  previousAnimationPage?: HtmlAnimationPage | null;
}) {
  const anchorSet = new Set(args.anchors);
  const nextManifest = args.nextManifest;
  const previousManifest = args.previousAnimationPage?.manifest ?? null;
  if (!previousManifest) {
    return hasAnimationManifestContent(nextManifest) ? nextManifest : null;
  }

  const nextEntryTracks = nextManifest?.entryTracks ?? [];
  const nextLoopEffects = nextManifest?.loopEffects ?? [];
  const nextEntryTrackAnchors = new Set(nextEntryTracks.map((track) => track.anchor));
  const nextLoopEffectKeys = new Set(nextLoopEffects.map((effect) => buildAnimationLoopEffectKey(effect)));

  const preservedEntryTracks = (previousManifest.entryTracks ?? []).filter(
    (track) => anchorSet.has(track.anchor) && !nextEntryTrackAnchors.has(track.anchor),
  );
  const preservedLoopEffects = (previousManifest.loopEffects ?? []).filter(
    (effect) =>
      anchorSet.has(effect.anchor) &&
      !nextLoopEffectKeys.has(buildAnimationLoopEffectKey(effect)),
  );

  const mergedEntryTracks = [...nextEntryTracks, ...preservedEntryTracks].sort(
    (left, right) => left.order - right.order,
  );
  const mergedLoopEffects = [...nextLoopEffects, ...preservedLoopEffects];
  if (mergedEntryTracks.length === 0 && mergedLoopEffects.length === 0) {
    return null;
  }

  return {
    version: 1,
    startMode: "entry-then-loop" as const,
    ...(mergedEntryTracks.length > 0 ? { entryTracks: mergedEntryTracks } : {}),
    ...(mergedLoopEffects.length > 0 ? { loopEffects: mergedLoopEffects } : {}),
  } satisfies HtmlPageAnimationManifest;
}

function sanitizeAnimationStructurePages(
  pages: Array<HtmlAnimationPage | null | undefined>,
): HtmlAnimationStructure | undefined {
  const resolvedPages = pages
    .filter((page): page is HtmlAnimationPage => Boolean(page))
    .sort((left, right) => left.pageNumber - right.pageNumber);
  if (resolvedPages.length === 0) {
    return undefined;
  }

  return {
    pages: resolvedPages,
  };
}

function resolveAnimationPage(
  structure: HtmlAnimationStructure | null | undefined,
  pageNumber: number,
) {
  return structure?.pages.find((page) => page.pageNumber === pageNumber) ?? null;
}

function sanitizeAnimationPageSection(args: {
  sectionHtml: string;
  htmlOutputMode: HtmlOutputMode;
  pageNumber: number;
  previousAnimationPage?: HtmlAnimationPage | null;
}) {
  const anchorMatches = Array.from(
    args.sectionHtml.matchAll(/\sdata-anim-anchor=["']([^"']+)["']/gi),
  );
  const anchors = anchorMatches.map((match) => match[1]?.trim() ?? "").filter(Boolean);
  const uniqueAnchors = Array.from(new Set(anchors));
  const templateMatches = Array.from(args.sectionHtml.matchAll(/<template\b[^>]*>[\s\S]*?<\/template>/gi));
  const manifestMatches = templateMatches.filter((match) =>
    new RegExp(`\\s${ANIMATION_MANIFEST_ATTR}(?:[=\\s>])`, "i").test(match[0] ?? ""),
  );
  const hasUnexpectedTemplate = templateMatches.some(
    (match) => !new RegExp(`\\s${ANIMATION_MANIFEST_ATTR}(?:[=\\s>])`, "i").test(match[0] ?? ""),
  );

  if (args.htmlOutputMode !== "animated-preview-js") {
    if (uniqueAnchors.length > 0) {
      throw new Error(
        `Page ${args.pageNumber} used animation anchors outside animated preview mode.`,
      );
    }
    if (templateMatches.length > 0) {
      throw new Error(
        `Page ${args.pageNumber} used animation manifests outside animated preview mode.`,
      );
    }
    return {
      sectionHtml: args.sectionHtml,
      animationPage: null,
    };
  }

  for (const anchor of uniqueAnchors) {
    if (!ANIMATION_ANCHOR_PATTERN.test(anchor)) {
      throw new Error(`Page ${args.pageNumber} used an invalid animation anchor: ${anchor}.`);
    }
  }

  if (hasUnexpectedTemplate) {
    throw new Error(
      `Page ${args.pageNumber} used an unsupported template tag in animated preview mode.`,
    );
  }

  if (manifestMatches.length > 1) {
    throw new Error(
      `Page ${args.pageNumber} used more than one animation manifest template.`,
    );
  }

  let manifest: HtmlPageAnimationManifest | null = null;
  if (manifestMatches[0]?.[0]) {
    const templateHtml = manifestMatches[0][0];
    const templateBody = templateHtml
      .replace(/^<template\b[^>]*>/i, "")
      .replace(/<\/template>\s*$/i, "")
      .trim();
    const manifestText = extractJsonDocument(templateBody) || templateBody;
    if (!manifestText) {
      throw new Error(`Page ${args.pageNumber} returned an empty animation manifest.`);
    }

    let parsedManifest: unknown;
    try {
      parsedManifest = JSON.parse(manifestText);
    } catch {
      throw new Error(`Page ${args.pageNumber} returned an invalid animation manifest JSON.`);
    }

    const normalizedManifest = normalizeAnimationManifestCandidate({
      pageNumber: args.pageNumber,
      value: parsedManifest,
    });

    const entryAnchors = new Set<string>();
    for (const track of normalizedManifest.entryTracks ?? []) {
      if (!uniqueAnchors.includes(track.anchor)) {
        throw new Error(
          `Page ${args.pageNumber} animation manifest referenced a missing anchor: ${track.anchor}.`,
        );
      }
      if (entryAnchors.has(track.anchor)) {
        throw new Error(
          `Page ${args.pageNumber} animation manifest duplicated an entry track anchor: ${track.anchor}.`,
        );
      }
      entryAnchors.add(track.anchor);
    }

    const loopEffectKeys = new Set<string>();
    for (const effect of normalizedManifest.loopEffects ?? []) {
      if (!uniqueAnchors.includes(effect.anchor)) {
        throw new Error(
          `Page ${args.pageNumber} animation manifest referenced a missing anchor: ${effect.anchor}.`,
        );
      }
      const effectKey = buildAnimationLoopEffectKey(effect);
      if (loopEffectKeys.has(effectKey)) {
        throw new Error(
          `Page ${args.pageNumber} animation manifest duplicated a loop effect for ${effectKey}.`,
        );
      }
      loopEffectKeys.add(effectKey);
    }

    manifest = normalizedManifest;
  }

  const mergedManifest = mergeAnimationManifestPreservingPrevious({
    anchors: uniqueAnchors,
    nextManifest: manifest,
    previousAnimationPage: args.previousAnimationPage,
  });
  const sectionHtml = manifestMatches.reduce(
    (current, match) => current.replace(match[0], ""),
    args.sectionHtml,
  ).trim();

  if (uniqueAnchors.length === 0 && !mergedManifest) {
    return {
      sectionHtml,
      animationPage: null,
    };
  }

  return {
    sectionHtml,
    animationPage: {
      pageNumber: args.pageNumber,
      anchors: uniqueAnchors,
      manifest: mergedManifest,
    } satisfies HtmlAnimationPage,
  };
}

function validateAnimationMetadata(args: {
  html: string;
  htmlOutputMode: HtmlOutputMode;
  pageNumber: number;
}) {
  const matches = Array.from(
    args.html.matchAll(/\s(data-anim-[a-z-]+)=["']([^"']*)["']/gi),
  );
  if (matches.length === 0) {
    return;
  }

  if (args.htmlOutputMode !== "animated-preview-js") {
    throw new Error(
      `Page ${args.pageNumber} used animation metadata outside animated preview mode.`,
    );
  }

  for (const match of matches) {
    const attrName = match[1]?.trim().toLowerCase() ?? "";
    const attrValue = match[2]?.trim() ?? "";
    if (!ALLOWED_ANIMATION_ATTRS.has(attrName)) {
      throw new Error(
        `Page ${args.pageNumber} used unsupported animation metadata: ${attrName}.`,
      );
    }

    if (attrName === "data-anim-role" && !ALLOWED_ANIMATION_ROLES.has(attrValue)) {
      throw new Error(
        `Page ${args.pageNumber} used an unsupported animation role: ${attrValue}.`,
      );
    }

    if (attrName === "data-anim-enter" && !ALLOWED_ANIMATION_ENTERS.has(attrValue)) {
      throw new Error(
        `Page ${args.pageNumber} used an unsupported animation preset: ${attrValue}.`,
      );
    }

    if (
      (attrName === "data-anim-delay" ||
        attrName === "data-anim-duration" ||
        attrName === "data-anim-order") &&
      parseAnimationTimingMetadata(
        attrName as "data-anim-delay" | "data-anim-duration" | "data-anim-order",
        attrValue,
      ) === null
    ) {
      throw new Error(
        `Page ${args.pageNumber} used invalid animation timing metadata: ${attrName}.`,
      );
    }
  }
}

export function detectPromptScaffoldLeak(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const match = promptScaffoldLeakPatterns.find(([pattern]) => pattern.test(normalized));
  return match?.[1] ?? null;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type DeterministicRenderTheme = {
  profileId: string;
  label: string;
  pageBackground: string;
  bodyBackground: string;
  surfacePrimary: string;
  surfaceSecondary: string;
  textPrimary: string;
  textMuted: string;
  accentPrimary: string;
  accentSecondary: string;
  borderSubtle: string;
  chartPalette: string[];
};

function withHexAlpha(hex: string, alpha: number) {
  const normalized = hex.replace("#", "").trim();
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return hex;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha))})`;
}

function resolveDeterministicRenderTheme(profile: DeckStyleProfile): DeterministicRenderTheme {
  return {
    profileId: profile.id,
    label: profile.label,
    pageBackground: profile.tokens.pageBackground,
    bodyBackground: profile.tokens.bodyBackground,
    surfacePrimary: profile.tokens.surfacePrimary,
    surfaceSecondary: profile.tokens.surfaceSecondary,
    textPrimary: profile.tokens.textPrimary,
    textMuted: profile.tokens.textMuted,
    accentPrimary: profile.tokens.accentPrimary,
    accentSecondary: profile.tokens.accentSecondary,
    borderSubtle: profile.tokens.borderSubtle,
    chartPalette: profile.tokens.chartPalette,
  };
}

function decorateSectionWithStyleMetadata(sectionHtml: string, styleProfile: GeneratedReportStyleProfile) {
  return sectionHtml.replace(
    /<section\b([^>]*)>/i,
    (match) => {
      let next = match;
      const attrs = [
        ["data-page-bg", styleProfile.pageBackground],
        ["data-divider-color", styleProfile.dividerColor],
        ["data-surface-fill", styleProfile.surfaceFill],
        ["data-page-accent", styleProfile.accentColor],
        ["data-style-profile-id", styleProfile.id],
        ["data-export-page-bg", styleProfile.pageBackground],
        ["data-export-divider-color", styleProfile.dividerColor],
        ["data-export-surface-fill", styleProfile.surfaceFill],
        ["data-export-accent", styleProfile.accentColor],
      ] as const;

      for (const [name, value] of attrs) {
        if (new RegExp(`${name}=["']`, "i").test(next)) {
          continue;
        }
        next = next.replace(/>$/, ` ${name}="${escapeHtml(value)}">`);
      }

      return next;
    },
  );
}

function decorateDeckHtmlWithStyleProfile(html: string, styleProfile: GeneratedReportStyleProfile) {
  const withBodyMetadata = html.replace(/<body\b([^>]*)>/i, (match) => {
    let next = match;
    if (!/data-style-profile-id=["']/i.test(next)) {
      next = next.replace(/>$/, ` data-style-profile-id="${escapeHtml(styleProfile.id)}">`);
    }
    return next;
  });

  return withBodyMetadata.replace(
    /<section\b[^>]*class=["'][^"']*\bpage\b[^"']*["'][^>]*>[\s\S]*?<\/section>/gi,
    (sectionHtml) => decorateSectionWithStyleMetadata(sectionHtml, styleProfile),
  );
}

export function extractSinglePageSection(html: string) {
  const sectionMatch = html.match(
    /<section[^>]*class=["'][^"']*\bpage\b[^"']*["'][^>]*>[\s\S]*?<\/section>/i,
  );
  if (!sectionMatch?.[0]) {
    throw new Error("The generated page did not contain a <section class=\"page\"> block.");
  }

  return sectionMatch[0].trim();
}

export function validateGeneratedPageHtml(args: {
  html: string;
  expectedPageNumber: number;
  expectedPageTitle: string;
  htmlOutputMode?: HtmlOutputMode;
  previousAnimationPage?: HtmlAnimationPage | null;
}) {
  const cleanedHtml = extractHtmlDocument(args.html);
  if (!cleanedHtml || !/<(?:!DOCTYPE html|html[\s>])/i.test(cleanedHtml)) {
    throw new Error(`Page ${args.expectedPageNumber} did not return a valid HTML document.`);
  }

  if (countPages(cleanedHtml) !== 1) {
    throw new Error(`Page ${args.expectedPageNumber} must contain exactly one slide section.`);
  }

  if (/<script[\s>]/i.test(cleanedHtml) || /<style[\s>]/i.test(cleanedHtml) || /<link[\s>]/i.test(cleanedHtml)) {
    throw new Error(`Page ${args.expectedPageNumber} used a disallowed tag.`);
  }

  if (/<(?:img|video|audio)[^>]+src=["'](?:https?:)?\/\//i.test(cleanedHtml)) {
    throw new Error(`Page ${args.expectedPageNumber} referenced an external asset.`);
  }

  if (/overflow\s*:\s*(?:auto|scroll)/i.test(cleanedHtml)) {
    throw new Error(`Page ${args.expectedPageNumber} introduced scrolling content.`);
  }

  const rawSectionHtml = extractSinglePageSection(cleanedHtml);
  validateAnimationMetadata({
    html: rawSectionHtml,
    htmlOutputMode: args.htmlOutputMode ?? "static",
    pageNumber: args.expectedPageNumber,
  });
  const sanitizedAnimation = sanitizeAnimationPageSection({
    sectionHtml: rawSectionHtml,
    htmlOutputMode: args.htmlOutputMode ?? "static",
    pageNumber: args.expectedPageNumber,
    previousAnimationPage: args.previousAnimationPage,
  });
  const sectionHtml = sanitizedAnimation.sectionHtml;
  const pageHtml = cleanedHtml.replace(rawSectionHtml, sectionHtml);
  const pageTitleMatches = extractPageTitles(cleanedHtml);
  const pageTitle = pageTitleMatches[0]?.trim();
  if (!pageTitle) {
    throw new Error(`Page ${args.expectedPageNumber} is missing data-page-title.`);
  }
  const pageTitleQuality = assessGeneratedTitleQuality(pageTitle);
  if (
    pageTitleQuality.promptLeak ||
    pageTitleQuality.repeatedInstruction ||
    pageTitleQuality.truncated
  ) {
    throw new Error(
      `Page ${args.expectedPageNumber} returned a weak or leaked title: "${pageTitle}".`,
    );
  }

  const pageNumberMatch = sectionHtml.match(/data-page-number=["'](\d+)["']/i);
  const pageNumber = Number.parseInt(pageNumberMatch?.[1] ?? "", 10);
  if (!Number.isInteger(pageNumber) || pageNumber !== args.expectedPageNumber) {
    throw new Error(`Page ${args.expectedPageNumber} returned an unexpected data-page-number.`);
  }

  if (!sectionHtml.includes("1600px") || !sectionHtml.includes("900px")) {
    throw new Error(`Page ${args.expectedPageNumber} is missing the required 1600×900 sizing.`);
  }

  const headingMatch = cleanedHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const headingText = headingMatch?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
  if (headingText) {
    const headingQuality = assessGeneratedTitleQuality(headingText);
    if (
      headingQuality.promptLeak ||
      headingQuality.repeatedInstruction ||
      headingQuality.truncated
    ) {
      throw new Error(
        `Page ${args.expectedPageNumber} rendered a weak or leaked heading: "${headingText}".`,
      );
    }
  }

  const promptScaffoldLeak = detectPromptScaffoldLeak(
    extractVisibleTextForLeakCheck(sectionHtml),
  );
  if (promptScaffoldLeak) {
    throw new Error(
      `Page ${args.expectedPageNumber} rendered workspace scaffolding as visible text: ${promptScaffoldLeak}.`,
    );
  }

  return {
    pageTitle,
    pageHtml,
    sectionHtml,
    animationPage: sanitizedAnimation.animationPage,
  };
}

export function composeDeckHtml(args: {
  title: string;
  sections: string[];
  styleProfile?: GeneratedReportStyleProfile;
  htmlOutputMode?: HtmlOutputMode;
}) {
  const bodyBackground = args.styleProfile?.pageBackground ?? "#efe7dc";
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(args.title)}</title>`,
    "</head>",
    `<body data-html-output-mode="${escapeHtml(args.htmlOutputMode ?? "static")}" style="margin:0;background:${escapeHtml(bodyBackground)};">`,
    args.sections.join("\n"),
    "</body>",
    "</html>",
  ].join("\n");
}

export function resolveSanitizedDeckTitle(args: {
  deckTitle: string;
  brief: string;
  pageTitles: string[];
  fallbackTitle?: string;
}) {
  const deckTitleQuality = assessGeneratedTitleQuality(args.deckTitle);
  if (
    deckTitleQuality.title.length >= 8 &&
    !deckTitleQuality.promptLeak &&
    !deckTitleQuality.repeatedInstruction &&
    !deckTitleQuality.truncated
  ) {
    return deckTitleQuality.title;
  }

  for (const pageTitle of args.pageTitles) {
    const pageTitleQuality = assessGeneratedTitleQuality(pageTitle);
    if (
      pageTitleQuality.title.length >= 8 &&
      !pageTitleQuality.promptLeak &&
      !pageTitleQuality.repeatedInstruction &&
      !pageTitleQuality.truncated
    ) {
      return pageTitleQuality.title;
    }
  }

  const briefSeed =
    splitBriefLines(args.brief).find((line) => stripInstructionalLead(line).length > 0) ??
    stripInstructionalLead(args.brief) ??
    args.fallbackTitle ??
    args.deckTitle;
  const compactedFallback = compactBoardTitle(
    deriveEvidenceTitle(briefSeed, args.fallbackTitle ?? "Generated studio report"),
    args.fallbackTitle ?? "Generated studio report",
    7,
  );
  const compactedQuality = assessGeneratedTitleQuality(compactedFallback);
  return compactedQuality.title || args.fallbackTitle || "Generated studio report";
}

export function buildSanitizedFinalReport(args: {
  html: string;
  brief: string;
  fallbackTitle?: string;
  styleProfile?: GeneratedReportStyleProfile;
  htmlOutputMode?: HtmlOutputMode;
  animationStructure?: HtmlAnimationStructure;
}) {
  const styledHtml = args.styleProfile
    ? decorateDeckHtmlWithStyleProfile(args.html, args.styleProfile)
    : args.html;
  const rawPageTitles = extractPageTitles(styledHtml);
  const safeTitle = resolveSanitizedDeckTitle({
    deckTitle: extractDocumentTitle(styledHtml),
    brief: args.brief,
    pageTitles: rawPageTitles,
    fallbackTitle: args.fallbackTitle,
  });
  const html = replaceDocumentTitle(styledHtml, safeTitle);

  return {
    title: safeTitle,
    html,
    pageCount: countPages(html),
    pageTitles: extractPageTitles(html),
    htmlOutputMode: args.htmlOutputMode ?? "static",
    animationStructure: sanitizeAnimationStructurePages(args.animationStructure?.pages ?? []),
    styleProfileId: args.styleProfile?.id,
    styleProfile: args.styleProfile,
  };
}

function renderListItems(items: string[], theme: DeterministicRenderTheme, accent = theme.textPrimary) {
  return items
    .map(
      (item) =>
        `<li style="margin:0 0 10px 0;color:${accent};font-size:24px;line-height:1.45;">${escapeHtml(
          item,
        )}</li>`,
    )
    .join("");
}

function renderMetricStrip(items: string[], theme: DeterministicRenderTheme) {
  return `<div data-html-visual-kind="rail" style="display:grid;grid-template-columns:repeat(${Math.max(
    2,
    Math.min(items.length, 4),
  )}, minmax(0,1fr));gap:18px;margin-top:28px;">${items
    .slice(0, 4)
    .map(
      (item, index) =>
        `<div data-html-visual-kind="surface" style="border:1px solid ${withHexAlpha(
          theme.borderSubtle,
          0.9,
        )};border-radius:22px;background:${theme.surfaceSecondary};padding:20px 22px;min-height:108px;"><div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};margin-bottom:12px;">Signal ${index + 1}</div><div style="font-size:22px;line-height:1.35;color:${theme.textPrimary};">${escapeHtml(
          item,
        )}</div></div>`,
    )
    .join("")}</div>`;
}

function renderBarChartSvg(spec: ChartSpec, theme: DeterministicRenderTheme) {
  const maxValue = Math.max(...spec.series[0]!.values.map((value) => Math.abs(value)), 1);
  const barWidth = 96;
  const gap = 40;
  const baseline = 300;
  return `<svg viewBox="0 0 820 360" style="width:100%;height:100%;display:block;" xmlns="http://www.w3.org/2000/svg">
    <line x1="48" y1="${baseline}" x2="772" y2="${baseline}" stroke="${theme.borderSubtle}" stroke-width="1" />
    ${spec.categories
      .map((category, index) => {
        const value = spec.series[0]!.values[index] ?? 0;
        const height = Math.max(8, Math.abs(value) / maxValue * 210);
        const x = 72 + index * (barWidth + gap);
        const y = value >= 0 ? baseline - height : baseline;
        const color =
          spec.series[0]!.color ??
          (value >= 0 ? theme.chartPalette[0] ?? theme.accentPrimary : theme.chartPalette[2] ?? theme.accentSecondary);
        return `<g>
          <rect x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="14" fill="${color}" />
          <text x="${x + barWidth / 2}" y="${baseline + 28}" text-anchor="middle" font-size="14" fill="${theme.textMuted}">${escapeHtml(
            category,
          )}</text>
          <text x="${x + barWidth / 2}" y="${y - 12}" text-anchor="middle" font-size="14" fill="${theme.textPrimary}">${escapeHtml(
            String(value),
          )}</text>
        </g>`;
      })
      .join("")}
  </svg>`;
}

function renderLineChartSvg(spec: ChartSpec, theme: DeterministicRenderTheme) {
  const values = spec.series[0]!.values;
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const range = Math.max(1, maxValue - minValue);
  const stepX = values.length > 1 ? 640 / (values.length - 1) : 0;
  const points = values.map((value, index) => {
    const x = 80 + index * stepX;
    const y = 280 - ((value - minValue) / range) * 180;
    return { x, y, value };
  });

  return `<svg viewBox="0 0 820 360" style="width:100%;height:100%;display:block;" xmlns="http://www.w3.org/2000/svg">
    <line x1="56" y1="292" x2="772" y2="292" stroke="${theme.borderSubtle}" stroke-width="1" />
    <polyline fill="none" stroke="${spec.series[0]!.color ?? theme.chartPalette[0] ?? theme.accentPrimary}" stroke-width="4" points="${points
      .map((point) => `${point.x},${point.y}`)
      .join(" ")}" />
    ${points
      .map(
        (point, index) =>
          `<g>
            <circle cx="${point.x}" cy="${point.y}" r="7" fill="${spec.series[0]!.color ?? theme.chartPalette[0] ?? theme.accentPrimary}" />
            <text x="${point.x}" y="320" text-anchor="middle" font-size="14" fill="${theme.textMuted}">${escapeHtml(
              spec.categories[index] ?? "",
            )}</text>
            <text x="${point.x}" y="${point.y - 14}" text-anchor="middle" font-size="14" fill="${theme.textPrimary}">${escapeHtml(
              String(point.value),
            )}</text>
          </g>`,
      )
      .join("")}
  </svg>`;
}

function renderStackedChartSvg(spec: ChartSpec, theme: DeterministicRenderTheme) {
  const totals = spec.categories.map((_, index) =>
    spec.series.reduce((sum, series) => sum + (series.values[index] ?? 0), 0),
  );
  const maxTotal = Math.max(...totals, 1);
  const colors = theme.chartPalette.length
    ? theme.chartPalette
    : [theme.accentPrimary, theme.accentSecondary, theme.surfaceSecondary, theme.textMuted];

  return `<svg viewBox="0 0 820 360" style="width:100%;height:100%;display:block;" xmlns="http://www.w3.org/2000/svg">
    <line x1="48" y1="300" x2="772" y2="300" stroke="${theme.borderSubtle}" stroke-width="1" />
    ${spec.categories
      .map((category, categoryIndex) => {
        const x = 86 + categoryIndex * 180;
        let cursorY = 300;
        const segments = spec.series
          .map((series, seriesIndex) => {
            const value = series.values[categoryIndex] ?? 0;
            const height = Math.max(10, (value / maxTotal) * 220);
            cursorY -= height;
            return `<rect x="${x}" y="${cursorY}" width="92" height="${height}" rx="12" fill="${series.color ?? colors[seriesIndex % colors.length]}" />`;
          })
          .join("");

        return `<g>${segments}<text x="${x + 46}" y="328" text-anchor="middle" font-size="14" fill="${theme.textMuted}">${escapeHtml(
          category,
        )}</text><text x="${x + 46}" y="${cursorY - 12}" text-anchor="middle" font-size="14" fill="${theme.textPrimary}">${escapeHtml(
          String(totals[categoryIndex]),
        )}</text></g>`;
      })
      .join("")}
  </svg>`;
}

function renderChartSvg(spec: ChartSpec, theme: DeterministicRenderTheme) {
  if (spec.kind === "line") {
    return renderLineChartSvg(spec, theme);
  }
  if (spec.kind === "stacked") {
    return renderStackedChartSvg(spec, theme);
  }
  return renderBarChartSvg(spec, theme);
}

function renderChartPanel(recipe: PageRecipe, theme: DeterministicRenderTheme) {
  if (!recipe.chartSpec) {
    return "";
  }

  const legend = recipe.chartSpec.series
    .map(
      (series, index) =>
        `<div style="display:flex;align-items:center;gap:10px;"><span style="width:12px;height:12px;border-radius:999px;background:${series.color ?? theme.chartPalette[index % Math.max(theme.chartPalette.length, 1)] ?? theme.accentPrimary};display:inline-block;"></span><span>${escapeHtml(
          series.name,
        )}</span></div>`,
    )
    .join("");

  return `<div data-html-visual-kind="chart-frame" data-export-chart="${escapeHtml(
    JSON.stringify({
      kind: recipe.chartSpec.kind,
      categories: recipe.chartSpec.categories,
      series: recipe.chartSpec.series,
      title: recipe.chartSpec.title,
      unit: recipe.chartSpec.unit,
    }),
  )}" style="border:1px solid ${withHexAlpha(
    theme.borderSubtle,
    0.9,
  )};border-radius:30px;background:${theme.surfacePrimary};padding:26px 28px;min-height:430px;display:flex;flex-direction:column;gap:18px;">
    <div>
      <div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};margin-bottom:10px;">Primary chart</div>
      <h3 style="margin:0;font-size:34px;line-height:1.12;color:${theme.textPrimary};">${escapeHtml(
        recipe.chartSpec.title,
      )}</h3>
    </div>
    <div style="flex:1;min-height:280px;">${renderChartSvg(recipe.chartSpec, theme)}</div>
    <div style="display:flex;justify-content:space-between;gap:20px;font-size:15px;color:${theme.textMuted};">
      <div style="display:flex;gap:18px;flex-wrap:wrap;">${legend}</div>
      <div>Unit: ${escapeHtml(recipe.chartSpec.unit)}</div>
    </div>
  </div>`;
}

function splitSvgTextLines(text: string, maxChars: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [""];
  }
  if (!/\s/.test(normalized)) {
    const lines: string[] = [];
    for (let index = 0; index < normalized.length; index += maxChars) {
      lines.push(normalized.slice(index, index + maxChars));
    }
    return lines.slice(0, 3);
  }

  const lines: string[] = [];
  let current = "";
  for (const word of normalized.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.slice(0, 3);
}

function renderSvgTextBlock(args: {
  text: string;
  x: number;
  y: number;
  maxChars: number;
  fontSize: number;
  color: string;
  weight?: number;
}) {
  const lines = splitSvgTextLines(args.text, args.maxChars);
  const firstYOffset = -((lines.length - 1) * args.fontSize * 0.58);
  return `<text x="${args.x}" y="${args.y + firstYOffset}" text-anchor="middle" dominant-baseline="middle" font-size="${args.fontSize}" font-weight="${args.weight ?? 500}" fill="${args.color}">${lines
    .map(
      (line, index) =>
        `<tspan x="${args.x}" dy="${index === 0 ? 0 : args.fontSize * 1.16}">${escapeHtml(line)}</tspan>`,
    )
    .join("")}</text>`;
}

type PositionedStructuredNode = {
  node: StructuredDiagramNode;
  x: number;
  y: number;
  w: number;
  h: number;
};

function positionFlowNodes(spec: StructuredDiagramSpec) {
  const lanes = spec.kind === "swimlane" && spec.lanes.length ? spec.lanes : [];
  const phaseWidth = spec.phases.length ? 92 : 0;
  const top = 168;
  const height = 642;
  const left = 78 + phaseWidth + (phaseWidth ? 22 : 0);
  const width = 1442 - phaseWidth - (phaseWidth ? 22 : 0);
  const laneCount = lanes.length || Math.min(4, Math.max(2, Math.ceil(Math.sqrt(spec.nodes.length))));
  const laneWidth = width / laneCount;
  const orderedNodeIds = [...spec.nodes]
    .sort((leftNode, rightNode) => (leftNode.number ?? 0) - (rightNode.number ?? 0))
    .map((node) => node.id);
  const orderedIndexById = new Map(orderedNodeIds.map((id, index) => [id, index] as const));
  const maxNodeHeight = 40;
  const rowStep = (height - maxNodeHeight) / Math.max(1, spec.nodes.length - 1);

  return spec.nodes.map((node, index) => {
    const laneIndex = lanes.length
      ? Math.max(0, lanes.findIndex((lane) => lane.id === node.laneId))
      : index % laneCount;
    const safeLaneIndex = laneIndex >= 0 ? laneIndex : index % laneCount;
    const nodeWidth = Math.max(116, Math.min(188, laneWidth * 0.68));
    const nodeHeight = node.shape === "decision" ? 40 : 30;
    const x = left + safeLaneIndex * laneWidth + (laneWidth - nodeWidth) / 2;
    const y = top + (orderedIndexById.get(node.id) ?? index) * rowStep;
    return {
      node,
      x,
      y: Math.min(top + height - nodeHeight, y),
      w: nodeWidth,
      h: nodeHeight,
    } satisfies PositionedStructuredNode;
  });
}

function renderStructuredNode(position: PositionedStructuredNode, theme: DeterministicRenderTheme) {
  const { node, x, y, w, h } = position;
  const centerX = x + w / 2;
  const centerY = y + h / 2;
  const nodeAttrs = `data-diagram-node-id="${escapeHtml(node.id)}" data-diagram-node-shape="${escapeHtml(node.shape)}"${node.laneId ? ` data-diagram-lane-id="${escapeHtml(node.laneId)}"` : ""}${node.phaseId ? ` data-diagram-phase-id="${escapeHtml(node.phaseId)}"` : ""}`;
  const badge = node.number
    ? `<rect x="${x - 34}" y="${centerY - 16}" width="28" height="28" rx="2" fill="${theme.accentSecondary}" opacity="0.72" /><text x="${x - 20}" y="${centerY}" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" font-size="14" font-weight="700">${node.number}</text>`
    : "";

  if (node.shape === "decision") {
    const points = `${centerX},${y} ${x + w},${centerY} ${centerX},${y + h} ${x},${centerY}`;
    return `<g ${nodeAttrs}>${badge}<polygon points="${points}" fill="#ffffff" stroke="${theme.textPrimary}" stroke-width="2" />${renderSvgTextBlock({
      text: node.label,
      x: centerX,
      y: centerY,
      maxChars: 7,
      fontSize: 13,
      color: theme.textPrimary,
      weight: 600,
    })}</g>`;
  }

  return `<g ${nodeAttrs}>${badge}<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="#ffffff" stroke="${theme.textPrimary}" stroke-width="2" />${renderSvgTextBlock({
    text: node.label,
    x: centerX,
    y: centerY,
    maxChars: 9,
    fontSize: 13,
    color: theme.textPrimary,
    weight: 500,
  })}</g>`;
}

function renderStructuredConnectors(
  spec: StructuredDiagramSpec,
  positions: PositionedStructuredNode[],
  theme: DeterministicRenderTheme,
  pageNumber: number,
) {
  const byId = new Map(positions.map((position) => [position.node.id, position] as const));
  const markerId = `structured-arrow-${pageNumber}`;
  const paths = spec.connectors
    .map((connector) => {
      const from = byId.get(connector.fromId);
      const to = byId.get(connector.toId);
      if (!from || !to) {
        return "";
      }
      const fromCenterX = from.x + from.w / 2;
      const fromCenterY = from.y + from.h / 2;
      const toCenterX = to.x + to.w / 2;
      const toCenterY = to.y + to.h / 2;
      const sameColumn = Math.abs(fromCenterX - toCenterX) < 30;
      const startX = sameColumn ? fromCenterX : fromCenterX <= toCenterX ? from.x + from.w : from.x;
      const startY = sameColumn ? from.y + from.h : fromCenterY;
      const endX = sameColumn ? toCenterX : fromCenterX <= toCenterX ? to.x : to.x + to.w;
      const endY = sameColumn ? to.y : toCenterY;
      const midX = sameColumn ? startX : (startX + endX) / 2;
      const d = sameColumn
        ? `M ${startX} ${startY} L ${endX} ${endY}`
        : `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
      return `<path data-diagram-connector-from="${escapeHtml(connector.fromId)}" data-diagram-connector-to="${escapeHtml(connector.toId)}" d="${d}" fill="none" stroke="${theme.textPrimary}" stroke-width="1.7" marker-end="url(#${markerId})" opacity="0.86" />`;
    })
    .join("");

  return `<defs><marker id="${markerId}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" fill="${theme.textPrimary}" /></marker></defs>${paths}`;
}

function renderStructuredFlowSvg(spec: StructuredDiagramSpec, theme: DeterministicRenderTheme, pageNumber: number) {
  const positions = positionFlowNodes(spec);
  const lanes = spec.kind === "swimlane" && spec.lanes.length ? spec.lanes : [];
  const phaseWidth = spec.phases.length ? 92 : 0;
  const top = 150;
  const bottom = 830;
  const left = 78 + phaseWidth + (phaseWidth ? 22 : 0);
  const width = 1442 - phaseWidth - (phaseWidth ? 22 : 0);
  const laneCount = lanes.length || Math.min(4, Math.max(2, Math.ceil(Math.sqrt(spec.nodes.length))));
  const laneWidth = width / laneCount;

  const phaseBands = spec.phases
    .map((phase, index) => {
      const phaseHeight = (bottom - top) / spec.phases.length;
      const y = top + index * phaseHeight;
      return `<g data-diagram-phase-id="${escapeHtml(phase.id)}"><rect x="52" y="${y}" width="${phaseWidth}" height="${phaseHeight - 8}" fill="${index % 2 === 0 ? theme.surfaceSecondary : theme.accentSecondary}" opacity="${index % 2 === 0 ? "0.78" : "0.92"}" /><text x="${52 + phaseWidth / 2}" y="${y + phaseHeight / 2}" text-anchor="middle" dominant-baseline="middle" font-size="20" font-weight="700" fill="${index % 2 === 0 ? theme.textPrimary : "#ffffff"}" writing-mode="tb">${escapeHtml(phase.label)}</text></g>`;
    })
    .join("");
  const laneHeaders = lanes.length ? Array.from({ length: laneCount }, (_, index) => {
    const lane = lanes[index];
    const x = left + index * laneWidth;
    return `<g ${lane ? `data-diagram-lane-id="${escapeHtml(lane.id)}"` : ""}><rect x="${x + laneWidth * 0.18}" y="106" width="${laneWidth * 0.64}" height="36" rx="1" fill="${index % 2 === 0 ? theme.accentPrimary : theme.accentSecondary}" opacity="0.92" /><text x="${x + laneWidth / 2}" y="124" text-anchor="middle" dominant-baseline="middle" font-size="19" font-weight="700" fill="#ffffff">${escapeHtml(lane?.label ?? `Lane ${index + 1}`)}</text></g>`;
  }).join("") : "";
  const laneSeparators = lanes.length ? Array.from({ length: Math.max(0, laneCount - 1) }, (_, index) => {
    const x = left + (index + 1) * laneWidth;
    return `<line x1="${x}" y1="94" x2="${x}" y2="838" stroke="${theme.textPrimary}" stroke-width="1.4" stroke-dasharray="7 7" opacity="0.72" />`;
  }).join("") : "";

  return `<svg data-html-visual-kind="structured-diagram" data-structured-diagram-kind="${escapeHtml(spec.kind)}" viewBox="0 0 1600 900" role="img" aria-label="${escapeHtml(spec.title)}" style="position:absolute;inset:0;width:100%;height:100%;display:block;">
    ${renderStructuredConnectors(spec, positions, theme, pageNumber)}
    <line x1="50" y1="150" x2="1532" y2="150" stroke="${theme.textPrimary}" stroke-width="2" />
    ${phaseBands}
    ${laneHeaders}
    ${laneSeparators}
    ${positions.map((position) => renderStructuredNode(position, theme)).join("")}
  </svg>`;
}

function renderStructuredGanttSvg(spec: StructuredDiagramSpec, theme: DeterministicRenderTheme) {
  const buckets = spec.timeBuckets.length ? spec.timeBuckets : ["Q1", "Q2", "Q3", "Q4"];
  const tasks = spec.tasks.slice(0, 10);
  const left = 84;
  const top = 168;
  const labelWidth = 292;
  const chartWidth = 1136;
  const rowHeight = Math.min(64, 590 / Math.max(1, tasks.length));
  const bucketWidth = chartWidth / buckets.length;
  const chartLeft = left + labelWidth;

  const grid = buckets
    .map((bucket, index) => {
      const x = chartLeft + index * bucketWidth;
      return `<g><rect x="${x}" y="${top}" width="${bucketWidth}" height="${rowHeight * tasks.length + 64}" fill="${index % 2 === 0 ? "#ffffff" : theme.surfaceSecondary}" opacity="0.78" /><line x1="${x}" y1="${top}" x2="${x}" y2="${top + rowHeight * tasks.length + 64}" stroke="${theme.borderSubtle}" stroke-width="1" /><text x="${x + bucketWidth / 2}" y="${top + 32}" text-anchor="middle" dominant-baseline="middle" font-size="18" font-weight="700" fill="${theme.textPrimary}">${escapeHtml(bucket)}</text></g>`;
    })
    .join("");

  const rows = tasks
    .map((task, index) => {
      const y = top + 64 + index * rowHeight;
      const startX = chartLeft + Math.max(0, Math.min(buckets.length - 1, task.startBucket)) * bucketWidth + 18;
      const endBucket = Math.max(task.startBucket, Math.min(buckets.length - 1, task.endBucket));
      const endX = chartLeft + (endBucket + 1) * bucketWidth - 18;
      const width = Math.max(42, endX - startX);
      const barColor = index % 3 === 0 ? theme.accentPrimary : index % 3 === 1 ? theme.accentSecondary : theme.chartPalette[2] ?? theme.accentPrimary;
      const milestone = task.milestone
        ? `<circle cx="${endX}" cy="${y + rowHeight / 2}" r="8" fill="${theme.textPrimary}" data-gantt-milestone="true" />`
        : "";
      return `<g data-gantt-task-id="${escapeHtml(task.id)}" data-gantt-track-id="${escapeHtml(task.trackId)}"><line x1="${left}" y1="${y + rowHeight}" x2="${chartLeft + chartWidth}" y2="${y + rowHeight}" stroke="${theme.borderSubtle}" stroke-width="1" /><text x="${left}" y="${y + rowHeight / 2}" dominant-baseline="middle" font-size="19" font-weight="650" fill="${theme.textPrimary}">${escapeHtml(task.label)}</text><rect x="${startX}" y="${y + rowHeight / 2 - 13}" width="${width}" height="26" rx="13" fill="${barColor}" opacity="0.9" />${milestone}</g>`;
    })
    .join("");

  return `<svg data-html-visual-kind="structured-diagram" data-structured-diagram-kind="gantt" viewBox="0 0 1600 900" role="img" aria-label="${escapeHtml(spec.title)}" style="position:absolute;inset:0;width:100%;height:100%;display:block;">
    <rect x="${left}" y="${top}" width="${labelWidth + chartWidth}" height="${rowHeight * tasks.length + 64}" fill="#ffffff" stroke="${theme.borderSubtle}" stroke-width="1.4" />
    ${grid}
    ${rows}
  </svg>`;
}

function renderStructuredDiagramPageSection(recipe: PageRecipe, theme: DeterministicRenderTheme) {
  const spec = recipe.structuredDiagramSpec;
  if (!spec) {
    return "";
  }
  const diagramSvg =
    spec.kind === "gantt"
      ? renderStructuredGanttSvg(spec, theme)
      : renderStructuredFlowSvg(spec, theme, recipe.pageNumber);

  return `<section class="page" data-page-number="${recipe.pageNumber}" data-page-title="${escapeHtml(
    recipe.pageTitle,
  )}" data-html-visual-kind="structured-diagram" data-structured-diagram-kind="${escapeHtml(
    spec.kind,
  )}" data-page-bg="#ffffff" data-divider-color="${theme.borderSubtle}" data-surface-fill="#ffffff" data-page-accent="${theme.accentPrimary}" data-style-profile-id="${theme.profileId}" data-export-page-bg="#ffffff" data-export-divider-color="${theme.borderSubtle}" data-export-surface-fill="#ffffff" data-export-accent="${theme.accentPrimary}" style="width:1600px;height:900px;box-sizing:border-box;position:relative;overflow:hidden;background:#ffffff;font-family:Inter,'PingFang SC','Microsoft YaHei',Arial,sans-serif;">
    <header style="position:absolute;left:52px;right:52px;top:24px;height:58px;display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid ${theme.borderSubtle};z-index:2;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div data-html-visual-kind="badge" style="width:42px;height:42px;border-radius:999px;border:2px solid ${theme.borderSubtle};display:grid;place-items:center;"><span style="width:17px;height:17px;border-radius:999px;border:4px solid ${theme.accentPrimary};display:block;"></span></div>
        <h1 style="margin:0;font-size:31px;line-height:1;color:${theme.textPrimary};font-weight:800;">${escapeHtml(
          recipe.pageTitle,
        )}</h1>
      </div>
      <div style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:${theme.textMuted};">${escapeHtml(
        spec.kind === "gantt" ? "Gantt / Roadmap" : spec.kind === "swimlane" ? "Swimlane flow" : "Flowchart",
      )}</div>
    </header>
    ${diagramSvg}
  </section>`;
}

function renderHeroProofSection(recipe: PageRecipe, theme: DeterministicRenderTheme) {
  return `<div data-page-body style="display:grid;grid-template-columns: minmax(0,1.35fr) minmax(320px,0.85fr);gap:28px;align-items:start;">
    <div data-html-layout-key="hero-left" style="display:flex;flex-direction:column;gap:22px;">
      <div>
        <h1 style="margin:0 0 18px 0;font-size:58px;line-height:0.98;color:${theme.textPrimary};font-family:Georgia, 'Times New Roman', serif;">${escapeHtml(
          recipe.heroClaim,
        )}</h1>
        <p style="margin:0;font-size:25px;line-height:1.45;color:${theme.textMuted};">${escapeHtml(
          recipe.objective,
        )}</p>
      </div>
      <div data-html-visual-kind="surface" style="border:1px solid ${withHexAlpha(
        theme.borderSubtle,
        0.9,
      )};border-radius:30px;background:${theme.surfacePrimary};padding:28px 30px;">
        <div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};margin-bottom:14px;">Supporting logic</div>
        <ul style="margin:0;padding-left:24px;">${renderListItems(recipe.supportBullets, theme)}</ul>
      </div>
      ${recipe.chartSpec && recipe.chartSpec.composite === "metric-strip" ? renderMetricStrip(recipe.evidenceBullets, theme) : ""}
    </div>
    <aside data-html-layout-key="hero-right" style="display:flex;flex-direction:column;gap:18px;">
      ${(recipe.chartSpec && recipe.chartSpec.composite !== "metric-strip"
        ? [renderChartPanel(recipe, theme)]
        : recipe.evidenceBullets.slice(0, 3).map(
            (item, index) =>
              `<div data-html-visual-kind="${index === 0 ? "highlight" : "surface"}" style="border:1px solid ${withHexAlpha(
                theme.borderSubtle,
                0.85,
              )};border-radius:26px;background:${index === 0 ? theme.surfaceSecondary : theme.surfacePrimary};padding:24px 24px;"><div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};margin-bottom:10px;">Evidence ${index + 1}</div><div style="font-size:24px;line-height:1.45;color:${theme.textPrimary};">${escapeHtml(
                item,
              )}</div></div>`,
          ))
        .join("")}
      <div data-html-visual-kind="rail" style="border-top:1px solid ${withHexAlpha(theme.borderSubtle, 0.95)};padding-top:18px;font-size:22px;line-height:1.45;color:${theme.textPrimary};">${escapeHtml(
        recipe.takeaway,
      )}</div>
    </aside>
  </div>`;
}

function renderChartInsightSection(recipe: PageRecipe, theme: DeterministicRenderTheme) {
  return `<div data-page-body style="display:grid;grid-template-columns:minmax(0,1.35fr) minmax(300px,0.85fr);gap:26px;align-items:start;">
    <div data-html-layout-key="chart-left" style="display:flex;flex-direction:column;gap:18px;">
      ${renderChartPanel(recipe, theme)}
      ${recipe.chartSpec?.composite === "metric-strip" ? renderMetricStrip(recipe.evidenceBullets, theme) : ""}
      ${recipe.chartSpec?.composite === "decision-footer" ? `<div data-html-visual-kind="annotation" style="border:1px solid ${withHexAlpha(
        theme.borderSubtle,
        0.9,
      )};border-radius:24px;background:${theme.surfaceSecondary};padding:22px 24px;font-size:24px;line-height:1.45;color:${theme.textPrimary};">${escapeHtml(
        recipe.takeaway,
      )}</div>` : ""}
    </div>
    <aside data-html-layout-key="chart-right" style="display:flex;flex-direction:column;gap:16px;">
      <div data-html-visual-kind="badge" style="display:inline-flex;align-self:flex-start;padding:10px 16px;border-radius:999px;border:1px solid ${withHexAlpha(
        theme.borderSubtle,
        0.9,
      )};background:${theme.surfacePrimary};font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};">Data-driven view</div>
      <h2 style="margin:0;font-size:34px;line-height:1.08;color:${theme.textPrimary};">${escapeHtml(recipe.heroClaim)}</h2>
      <ul style="margin:0;padding-left:24px;">${renderListItems(recipe.supportBullets.slice(0, 3), theme)}</ul>
      <div data-html-visual-kind="rail" style="border:1px solid ${withHexAlpha(
        theme.borderSubtle,
        0.9,
      )};border-radius:24px;background:${theme.surfaceSecondary};padding:20px 22px;"><div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};margin-bottom:10px;">Decision</div><div style="font-size:24px;line-height:1.42;color:${theme.textPrimary};">${escapeHtml(
        recipe.takeaway,
      )}</div></div>
    </aside>
  </div>`;
}

function renderSequenceSection(recipe: PageRecipe, theme: DeterministicRenderTheme) {
  return `<div data-page-body style="display:flex;flex-direction:column;gap:24px;">
    <div>
      <h1 style="margin:0 0 14px 0;font-size:54px;line-height:0.98;color:${theme.textPrimary};font-family:Georgia, 'Times New Roman', serif;">${escapeHtml(
        recipe.heroClaim,
      )}</h1>
      <p style="margin:0;font-size:24px;line-height:1.45;color:${theme.textMuted};">${escapeHtml(
        recipe.objective,
      )}</p>
    </div>
    <div data-html-layout-key="sequence" style="display:grid;grid-template-columns:repeat(${Math.max(
      3,
      Math.min(recipe.supportBullets.length, 4),
    )}, minmax(0,1fr));gap:18px;">
      ${recipe.supportBullets
        .slice(0, 4)
        .map(
          (item, index) =>
            `<div data-html-visual-kind="surface" style="border:1px solid ${withHexAlpha(
              theme.borderSubtle,
              0.9,
            )};border-radius:28px;background:${theme.surfacePrimary};padding:22px 24px;min-height:180px;"><div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};margin-bottom:18px;">Step ${index + 1}</div><div style="font-size:26px;line-height:1.38;color:${theme.textPrimary};">${escapeHtml(
              item,
            )}</div></div>`,
        )
        .join("")}
    </div>
    <div data-html-visual-kind="rail" style="font-size:23px;line-height:1.42;color:${theme.textPrimary};border-top:1px solid ${withHexAlpha(theme.borderSubtle, 0.95)};padding-top:16px;">${escapeHtml(
      recipe.takeaway,
    )}</div>
  </div>`;
}

function renderComparisonSection(recipe: PageRecipe, theme: DeterministicRenderTheme) {
  const comparisonItems = recipe.evidenceBullets.length
    ? recipe.evidenceBullets
    : recipe.supportBullets;

  return `<div data-page-body style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(300px,0.8fr);gap:24px;align-items:start;">
    <div data-html-layout-key="comparison-left" style="display:flex;flex-direction:column;gap:18px;">
      <div>
        <h1 style="margin:0 0 14px 0;font-size:54px;line-height:0.98;color:${theme.textPrimary};font-family:Georgia, 'Times New Roman', serif;">${escapeHtml(
          recipe.heroClaim,
        )}</h1>
        <p style="margin:0;font-size:24px;line-height:1.45;color:${theme.textMuted};">${escapeHtml(
          recipe.objective,
        )}</p>
      </div>
      ${recipe.chartSpec ? renderChartPanel(recipe, theme) : renderMetricStrip(comparisonItems, theme)}
    </div>
    <aside data-html-layout-key="comparison-right" style="display:flex;flex-direction:column;gap:16px;">
      ${comparisonItems
        .slice(0, 4)
        .map(
          (item, index) =>
            `<div data-html-visual-kind="${index === 0 ? "highlight" : "surface"}" style="border:1px solid ${withHexAlpha(
              theme.borderSubtle,
              0.85,
            )};border-radius:24px;background:${index === 0 ? theme.surfaceSecondary : theme.surfacePrimary};padding:20px 22px;"><div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};margin-bottom:10px;">Comparison ${index + 1}</div><div style="font-size:23px;line-height:1.42;color:${theme.textPrimary};">${escapeHtml(
              item,
            )}</div></div>`,
        )
        .join("")}
      <div data-html-visual-kind="annotation" style="border-top:1px solid ${withHexAlpha(theme.borderSubtle, 0.95)};padding-top:14px;font-size:22px;line-height:1.42;color:${theme.textPrimary};">${escapeHtml(
        recipe.takeaway,
      )}</div>
    </aside>
  </div>`;
}

function renderResearchFigureSection(recipe: PageRecipe, theme: DeterministicRenderTheme) {
  if (!recipe.diagramSpec) {
    return renderHeroProofSection(recipe, theme);
  }

  return `<div data-page-body style="display:flex;flex-direction:column;gap:22px;min-height:100%;">
    ${renderScientificDiagramShell({
      spec: recipe.diagramSpec,
      theme: {
        surfacePrimary: theme.surfacePrimary,
        surfaceSecondary: theme.surfaceSecondary,
        textPrimary: theme.textPrimary,
        textMuted: theme.textMuted,
        accentPrimary: theme.accentPrimary,
        accentSecondary: theme.accentSecondary,
        borderSubtle: theme.borderSubtle,
      },
    })}
  </div>`;
}

export function composeDeterministicPageSection(recipe: PageRecipe, styleProfile: DeckStyleProfile) {
  const theme = resolveDeterministicRenderTheme(styleProfile);
  if (recipe.structuredDiagramSpec) {
    return renderStructuredDiagramPageSection(recipe, theme);
  }

  const moduleLabel = recipe.diagramSpec ? "Scientific diagram" : recipe.moduleBinding?.label ?? "Built-in renderer";
  const body =
    recipe.diagramSpec
      ? renderResearchFigureSection(recipe, theme)
      : recipe.layout === "sequence"
      ? renderSequenceSection(recipe, theme)
      : recipe.layout === "chart-insight"
        ? renderChartInsightSection(recipe, theme)
        : recipe.layout === "comparison"
          ? renderComparisonSection(recipe, theme)
          : renderHeroProofSection(recipe, theme);

  return `<section class="page" data-page-number="${recipe.pageNumber}" data-page-title="${escapeHtml(
    recipe.pageTitle,
  )}" data-page-bg="${theme.pageBackground}" data-divider-color="${theme.borderSubtle}" data-surface-fill="${theme.surfacePrimary}" data-page-accent="${theme.accentPrimary}" data-style-profile-id="${theme.profileId}" data-export-page-bg="${theme.pageBackground}" data-export-divider-color="${theme.borderSubtle}" data-export-surface-fill="${theme.surfacePrimary}" data-export-accent="${theme.accentPrimary}" style="width:1600px;height:900px;box-sizing:border-box;padding:54px 64px;background:${theme.pageBackground};display:flex;flex-direction:column;gap:26px;font-family:Inter, system-ui, sans-serif;">
    <header data-html-layout-key="header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;">
      <div>
        <div style="font-size:14px;letter-spacing:0.22em;text-transform:uppercase;color:${theme.accentSecondary};margin-bottom:12px;">${escapeHtml(
          recipe.pageTitle,
        )}</div>
        <div style="font-size:20px;line-height:1.4;color:${theme.textMuted};max-width:980px;">${escapeHtml(
          recipe.insight,
        )}</div>
      </div>
      <div data-html-visual-kind="badge" style="display:inline-flex;align-items:center;padding:10px 14px;border-radius:999px;border:1px solid ${withHexAlpha(
        theme.borderSubtle,
        0.9,
      )};background:${theme.surfacePrimary};font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};">${escapeHtml(
        moduleLabel,
      )}</div>
    </header>
    <main style="flex:1;display:block;">${body}</main>
  </section>`;
}

export function composeSinglePageHtml(args: {
  title: string;
  sectionHtml: string;
  styleProfile?: GeneratedReportStyleProfile;
  htmlOutputMode?: HtmlOutputMode;
}) {
  return composeDeckHtml({
    title: args.title,
    sections: [args.sectionHtml],
    styleProfile: args.styleProfile,
    htmlOutputMode: args.htmlOutputMode,
  });
}

export function extractDeckSections(html: string) {
  const sections = Array.from(
    html.matchAll(
      /<section[^>]*class=["'][^"']*\bpage\b[^"']*["'][^>]*>[\s\S]*?<\/section>/gi,
    ),
  ).map((match) => match[0].trim());

  return sections.map((sectionHtml, index) => {
    const pageNumberMatch = sectionHtml.match(/data-page-number=["'](\d+)["']/i);
    const pageTitleMatch = sectionHtml.match(/data-page-title=["']([^"']+)["']/i);
    return {
      pageNumber: Number.parseInt(pageNumberMatch?.[1] ?? `${index + 1}`, 10),
      pageTitle: pageTitleMatch?.[1]?.trim() || `Page ${index + 1}`,
      sectionHtml,
    };
  });
}
