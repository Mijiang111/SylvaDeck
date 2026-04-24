import {
  toGeneratedReportStyleProfile,
  type DeckStyleProfile,
} from "../industry-style.js";
import type {
  ChartDensity,
  ChartSpec,
  GeneratedReportStyleProfile,
  HtmlAnimationPage,
  HtmlAnimationStructure,
  HtmlPageAnimationManifest,
  HtmlOutputMode,
  PageRecipe,
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

function formatConsultingChartValue(value: number, unit: string) {
  const normalizedUnit = unit.trim();
  const absolute = Math.abs(value);
  const decimals = absolute < 10 && !Number.isInteger(value) ? 1 : 0;
  const body = absolute.toLocaleString("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
  const sign = value < 0 ? "-" : "";
  if (normalizedUnit.startsWith("$")) {
    const suffix = normalizedUnit.slice(1).trim();
    return `${sign}$${body}${suffix}`;
  }
  if (normalizedUnit.includes("%")) {
    return `${sign}${body}%`;
  }
  return normalizedUnit && normalizedUnit.length <= 5 ? `${sign}${body}${normalizedUnit}` : `${sign}${body}`;
}

function buildConsultingYProjector(args: {
  top: number;
  bottom: number;
  minValue: number;
  maxValue: number;
}) {
  const range = Math.max(1, args.maxValue - args.minValue);
  return (value: number) => args.bottom - ((value - args.minValue) / range) * (args.bottom - args.top);
}

function buildConsultingChartGrid(args: {
  left: number;
  right: number;
  top: number;
  bottom: number;
  minValue: number;
  maxValue: number;
  unit: string;
  theme: DeterministicRenderTheme;
}) {
  return Array.from({ length: 4 }, (_, index) => {
    const ratio = index / 3;
    const y = args.bottom - ratio * (args.bottom - args.top);
    const value = args.minValue + ratio * (args.maxValue - args.minValue);
    return `<line x1="${args.left}" y1="${y}" x2="${args.right}" y2="${y}" stroke="${withHexAlpha(
      args.theme.borderSubtle,
      index === 0 ? 0.95 : 0.58,
    )}" stroke-width="${index === 0 ? 1.2 : 0.8}" />
      <text x="${args.left - 14}" y="${y + 4}" text-anchor="end" font-size="12" fill="${args.theme.textMuted}">${escapeHtml(
        formatConsultingChartValue(value, args.unit),
      )}</text>`;
  }).join("");
}

function renderBarChartSvg(spec: ChartSpec, theme: DeterministicRenderTheme) {
  const values = spec.series[0]?.values ?? [];
  const width = 1040;
  const height = 430;
  const left = 92;
  const right = width - 38;
  const top = 46;
  const bottom = height - 72;

  if (spec.kind === "waterfall") {
    let running = 0;
    const steps = spec.categories.map((category, index) => {
      const rawValue = values[index] ?? 0;
      const isEndpoint = index === 0 || index === spec.categories.length - 1;
      const start = isEndpoint ? 0 : running;
      const end = isEndpoint ? rawValue : running + rawValue;
      if (!isEndpoint) {
        running = end;
      }
      return { category, rawValue, start, end, isEndpoint, index };
    });
    const minValue = Math.min(0, ...steps.flatMap((step) => [step.start, step.end]));
    const maxValue = Math.max(1, ...steps.flatMap((step) => [step.start, step.end]));
    const yFor = buildConsultingYProjector({ top, bottom, minValue, maxValue });
    const slotWidth = (right - left) / Math.max(1, steps.length);
    const barWidth = Math.min(92, slotWidth * 0.54);
    const zeroY = yFor(0);
    return `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:100%;display:block;" xmlns="http://www.w3.org/2000/svg">
      ${buildConsultingChartGrid({ left, right, top, bottom, minValue, maxValue, unit: spec.unit, theme })}
      <line x1="${left}" y1="${zeroY}" x2="${right}" y2="${zeroY}" stroke="${withHexAlpha(theme.textMuted, 0.72)}" stroke-width="1.2" />
      ${steps.map((step) => {
        const x = left + step.index * slotWidth + (slotWidth - barWidth) / 2;
        const y1 = yFor(step.start);
        const y2 = yFor(step.end);
        const y = Math.min(y1, y2);
        const h = Math.max(10, Math.abs(y2 - y1));
        const color = step.isEndpoint
          ? theme.textPrimary
          : step.rawValue >= 0
            ? theme.chartPalette[0] ?? theme.accentPrimary
            : theme.chartPalette[2] ?? theme.accentSecondary;
        const previous = steps[step.index - 1];
        const connector = previous
          ? `<line x1="${x - slotWidth + barWidth}" y1="${yFor(previous.end)}" x2="${x}" y2="${yFor(
              step.start,
            )}" stroke="${withHexAlpha(theme.textMuted, 0.45)}" stroke-width="1" stroke-dasharray="5 6" />`
          : "";
        return `${connector}<g>
          <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="4" fill="${color}" />
          <text x="${x + barWidth / 2}" y="${Math.max(top + 14, y - 10)}" text-anchor="middle" font-size="13" font-weight="700" fill="${theme.textPrimary}">${escapeHtml(
            formatConsultingChartValue(step.rawValue, spec.unit),
          )}</text>
          <text x="${x + barWidth / 2}" y="${bottom + 28}" text-anchor="middle" font-size="12" font-weight="600" fill="${theme.textMuted}">${escapeHtml(step.category)}</text>
        </g>`;
      }).join("")}
    </svg>`;
  }

  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(1, ...values);
  const yFor = buildConsultingYProjector({ top, bottom, minValue, maxValue });
  const slotWidth = (right - left) / Math.max(1, spec.categories.length);
  const groupWidth = slotWidth * 0.56;
  const barWidth = Math.max(18, groupWidth / Math.max(1, spec.series.length));
  const zeroY = yFor(0);
  const primarySeries = spec.series[0];
  const highlightIndex = values.reduce(
    (best, value, index) => (Math.abs(value) > Math.abs(values[best] ?? 0) ? index : best),
    0,
  );

  return `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:100%;display:block;" xmlns="http://www.w3.org/2000/svg">
    ${buildConsultingChartGrid({ left, right, top, bottom, minValue, maxValue, unit: spec.unit, theme })}
    <line x1="${left}" y1="${zeroY}" x2="${right}" y2="${zeroY}" stroke="${withHexAlpha(theme.textMuted, 0.72)}" stroke-width="1.2" />
    ${spec.categories.map((category, categoryIndex) =>
      spec.series.map((series, seriesIndex) => {
        const value = series.values[categoryIndex] ?? 0;
        const x = left + categoryIndex * slotWidth + (slotWidth - groupWidth) / 2 + seriesIndex * barWidth;
        const y = value >= 0 ? yFor(value) : zeroY;
        const h = Math.max(4, Math.abs(yFor(value) - zeroY));
        const isHighlight = series === primarySeries && categoryIndex === highlightIndex;
        const color =
          series.color ??
          (isHighlight
            ? theme.textPrimary
            : theme.chartPalette[seriesIndex % Math.max(theme.chartPalette.length, 1)] ?? theme.accentPrimary);
        return `<g>
          <rect x="${x}" y="${y}" width="${Math.max(14, barWidth - 8)}" height="${h}" rx="4" fill="${color}" opacity="${isHighlight ? 1 : 0.78}" />
          <text x="${x + Math.max(14, barWidth - 8) / 2}" y="${value >= 0 ? Math.max(top + 14, y - 10) : y + h + 18}" text-anchor="middle" font-size="12" font-weight="700" fill="${theme.textPrimary}">${escapeHtml(
            formatConsultingChartValue(value, spec.unit),
          )}</text>
          ${seriesIndex === 0 ? `<text x="${left + categoryIndex * slotWidth + slotWidth / 2}" y="${bottom + 28}" text-anchor="middle" font-size="12" font-weight="600" fill="${theme.textMuted}">${escapeHtml(category)}</text>` : ""}
        </g>`;
      }).join("")
    ).join("")}
  </svg>`;
}

function renderLineChartSvg(spec: ChartSpec, theme: DeterministicRenderTheme) {
  const values = spec.series[0]?.values ?? [];
  const width = 1040;
  const height = 430;
  const left = 92;
  const right = width - 42;
  const top = 46;
  const bottom = height - 72;
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const yFor = buildConsultingYProjector({ top, bottom, minValue, maxValue });
  const stepX = values.length > 1 ? (right - left) / (values.length - 1) : 0;
  const points = values.map((value, index) => ({
    x: values.length > 1 ? left + index * stepX : (left + right) / 2,
    y: yFor(value),
    value,
    label: spec.categories[index] ?? "",
  }));
  const color = spec.series[0]?.color ?? theme.chartPalette[0] ?? theme.accentPrimary;
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const last = points.at(-1);

  return `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:100%;display:block;" xmlns="http://www.w3.org/2000/svg">
    ${buildConsultingChartGrid({ left, right, top, bottom, minValue, maxValue, unit: spec.unit, theme })}
    <path d="${path} L ${last?.x ?? left} ${bottom} L ${points[0]?.x ?? left} ${bottom} Z" fill="${withHexAlpha(color, 0.10)}" />
    <path d="${path}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
    ${points.map((point, index) => `<g>
      <circle cx="${point.x}" cy="${point.y}" r="${index === points.length - 1 ? 6.5 : 4.5}" fill="${index === points.length - 1 ? theme.textPrimary : color}" stroke="#fff" stroke-width="2" />
      <text x="${point.x}" y="${bottom + 28}" text-anchor="middle" font-size="12" font-weight="600" fill="${theme.textMuted}">${escapeHtml(point.label)}</text>
      ${index === points.length - 1 ? `<text x="${point.x}" y="${Math.max(top + 14, point.y - 14)}" text-anchor="middle" font-size="13" font-weight="700" fill="${theme.textPrimary}">${escapeHtml(formatConsultingChartValue(point.value, spec.unit))}</text>` : ""}
    </g>`).join("")}
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
  const width = 1040;
  const height = 430;
  const left = 92;
  const right = width - 38;
  const top = 46;
  const bottom = height - 72;
  const yFor = buildConsultingYProjector({ top, bottom, minValue: 0, maxValue: maxTotal });
  const slotWidth = (right - left) / Math.max(1, spec.categories.length);
  const barWidth = Math.min(96, slotWidth * 0.52);

  return `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:100%;display:block;" xmlns="http://www.w3.org/2000/svg">
    ${buildConsultingChartGrid({ left, right, top, bottom, minValue: 0, maxValue: maxTotal, unit: spec.unit, theme })}
    ${spec.categories.map((category, categoryIndex) => {
      const x = left + categoryIndex * slotWidth + (slotWidth - barWidth) / 2;
      let cursorY = bottom;
      let cumulative = 0;
      const segments = spec.series.map((series, seriesIndex) => {
        const value = Math.max(0, series.values[categoryIndex] ?? 0);
        cumulative += value;
        const nextY = yFor(cumulative);
        const segmentHeight = Math.max(4, cursorY - nextY);
        cursorY = nextY;
        return `<rect x="${x}" y="${nextY}" width="${barWidth}" height="${segmentHeight}" rx="4" fill="${series.color ?? colors[seriesIndex % colors.length]}" opacity="${seriesIndex === 0 ? 0.95 : 0.78}" />`;
      }).join("");
      return `<g>${segments}<text x="${x + barWidth / 2}" y="${Math.max(top + 14, cursorY - 10)}" text-anchor="middle" font-size="13" font-weight="700" fill="${theme.textPrimary}">${escapeHtml(
        formatConsultingChartValue(totals[categoryIndex] ?? 0, spec.unit),
      )}</text><text x="${x + barWidth / 2}" y="${bottom + 28}" text-anchor="middle" font-size="12" font-weight="600" fill="${theme.textMuted}">${escapeHtml(category)}</text></g>`;
    }).join("")}
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

function inferHtmlChartExhibitPreset(spec: ChartSpec) {
  if (spec.chartPreset && spec.chartPreset !== "auto") {
    return spec.chartPreset;
  }
  if (spec.kind === "waterfall") {
    return "margin-bridge";
  }
  if (spec.kind === "stacked") {
    return "segment-mix";
  }
  if (spec.kind === "line") {
    return "growth-line";
  }
  return "headline-bars";
}

function inferHtmlChartValueFormat(unit: string) {
  const normalized = unit.trim();
  if (!normalized) {
    return { decimals: 0, scale: "raw" };
  }
  if (normalized.includes("%")) {
    return { suffix: "%", decimals: 0, scale: "raw" };
  }
  const currency = /^([$€£¥])\s*(.*)$/.exec(normalized);
  if (currency) {
    return {
      prefix: currency[1],
      suffix: currency[2]?.trim() || undefined,
      decimals: currency[2]?.trim() ? 1 : 0,
      scale: "raw",
    };
  }
  return {
    suffix: normalized.length <= 5 ? normalized : ` ${normalized}`,
    decimals: normalized.length <= 5 ? 0 : 1,
    scale: "raw",
  };
}

function buildHtmlChartPayload(spec: ChartSpec, theme: DeterministicRenderTheme) {
  const series = spec.series.map((series, index) => ({
    id: `series-${index + 1}`,
    label: series.name,
    values: series.values,
    color: series.color ?? theme.chartPalette[index % Math.max(theme.chartPalette.length, 1)] ?? theme.accentPrimary,
    role: spec.kind === "line" ? "line" : "bar",
    axis: "primary",
  }));
  const firstSeries = series[0];
  const bestIndex = firstSeries?.values.length
    ? firstSeries.values.reduce(
        (best, value, index) => (Math.abs(value) > Math.abs(firstSeries.values[best] ?? 0) ? index : best),
        0,
      )
    : 0;

  return {
    kind: spec.kind,
    title: spec.title,
    subtitle: "",
    insight: spec.insight,
    unit: spec.unit,
    categories: spec.categories,
    series,
    presentation: {
      version: 2,
      preset: "investor-editorial",
      exhibitPreset: inferHtmlChartExhibitPreset(spec),
      density: spec.density ?? "hero",
      valueFormat: inferHtmlChartValueFormat(spec.unit),
      emphasis: firstSeries
        ? [
            {
              id: spec.kind === "line" ? "emphasis-latest-point" : "emphasis-largest-value",
              target: {
                category: spec.kind === "line" ? spec.categories.at(-1) : spec.categories[bestIndex],
                seriesId: firstSeries.id,
                pointIndex: spec.kind === "line" ? Math.max(0, spec.categories.length - 1) : bestIndex,
              },
              role: "primary",
            },
          ]
        : [],
      annotations: spec.insight
        ? [
            {
              id: "chart-insight",
              target: {
                category: spec.kind === "line" ? spec.categories.at(-1) : spec.categories[bestIndex],
                seriesId: firstSeries?.id,
                pointIndex: spec.kind === "line" ? Math.max(0, spec.categories.length - 1) : bestIndex,
              },
              text: spec.insight,
              placement: "auto",
            },
          ]
        : [],
    },
  };
}

function getChartPanelDensitySettings(density: ChartDensity = "hero") {
  if (density === "sidecar") {
    return {
      padding: "18px 18px 14px",
      minHeight: 340,
      gap: 10,
      headerGap: 14,
      titleSize: 20,
      insightSize: 12,
      unitSize: 15,
      chartMinHeight: 230,
      footerSize: 10,
    };
  }
  if (density === "peer") {
    return {
      padding: "20px 20px 15px",
      minHeight: 392,
      gap: 12,
      headerGap: 18,
      titleSize: 23,
      insightSize: 13,
      unitSize: 16,
      chartMinHeight: 270,
      footerSize: 10,
    };
  }
  return {
    padding: "24px 26px 18px",
    minHeight: 456,
    gap: 14,
    headerGap: 22,
    titleSize: 28,
    insightSize: 14,
    unitSize: 18,
    chartMinHeight: 318,
    footerSize: 11,
  };
}

function renderChartPanelForSpec(args: {
  chartSpec: ChartSpec;
  theme: DeterministicRenderTheme;
  density?: ChartDensity;
}) {
  const chartSpec = args.chartSpec;
  const theme = args.theme;
  const density = args.density ?? chartSpec.density ?? "hero";
  const densitySettings = getChartPanelDensitySettings(density);
  if (!chartSpec) {
    return "";
  }

  const legend = chartSpec.series
    .map(
      (series, index) =>
        `<div style="display:flex;align-items:center;gap:10px;"><span style="width:12px;height:12px;border-radius:999px;background:${series.color ?? theme.chartPalette[index % Math.max(theme.chartPalette.length, 1)] ?? theme.accentPrimary};display:inline-block;"></span><span>${escapeHtml(
          series.name,
        )}</span></div>`,
    )
    .join("");
  const htmlChartPayload = buildHtmlChartPayload({
    ...chartSpec,
    density,
  }, theme);
  const exhibitPreset = htmlChartPayload.presentation.exhibitPreset ?? "auto";

  return `<div class="html-chart-module" data-html-module-kind="chart" data-html-module-label="Chart" data-html-visual-kind="chart-frame" data-html-fit-role="content" data-chart-presentation-version="2" data-chart-exhibit-preset="${escapeHtml(exhibitPreset)}" data-chart-density="${escapeHtml(density)}" data-html-chart-spec="${escapeHtml(
    JSON.stringify(htmlChartPayload),
  )}" data-export-chart="${escapeHtml(
    JSON.stringify({
      kind: chartSpec.kind,
      categories: chartSpec.categories,
      series: htmlChartPayload.series.map((series) => ({
        name: series.label,
        label: series.label,
        values: series.values,
        color: series.color,
        role: series.role,
        axis: series.axis,
      })),
      title: chartSpec.title,
      subtitle: "",
      insight: chartSpec.insight,
      unit: chartSpec.unit,
    }),
  )}" style="border:1px solid ${withHexAlpha(
    theme.borderSubtle,
    0.95,
  )};border-radius:8px;background:${theme.surfacePrimary};padding:${densitySettings.padding};min-height:${densitySettings.minHeight}px;display:flex;flex-direction:column;gap:${densitySettings.gap}px;box-shadow:none;">
    <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:${densitySettings.headerGap}px;align-items:start;border-bottom:1px solid ${withHexAlpha(theme.borderSubtle, 0.82)};padding-bottom:14px;">
      <div>
        <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${theme.accentSecondary};font-weight:800;margin-bottom:8px;">Exhibit</div>
        <h3 style="margin:0;font-size:${densitySettings.titleSize}px;line-height:1.12;color:${theme.textPrimary};font-family:Georgia, 'Times New Roman', serif;">${escapeHtml(
        chartSpec.title,
      )}</h3>
        ${chartSpec.insight ? `<p style="margin:8px 0 0 0;font-size:${densitySettings.insightSize}px;line-height:1.42;color:${theme.textMuted};max-width:760px;">${escapeHtml(chartSpec.insight)}</p>` : ""}
      </div>
      <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${theme.textMuted};font-weight:800;text-align:right;">Unit<br/><span style="font-size:${densitySettings.unitSize}px;letter-spacing:-0.02em;text-transform:none;color:${theme.textPrimary};">${escapeHtml(chartSpec.unit || "value")}</span></div>
    </div>
    <div style="flex:1;min-height:${densitySettings.chartMinHeight}px;padding:0 2px;">${renderChartSvg(chartSpec, theme)}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:20px;border-top:1px solid ${withHexAlpha(theme.borderSubtle, 0.7)};padding-top:10px;font-size:${densitySettings.footerSize + 1}px;color:${theme.textMuted};">
      <div style="display:flex;gap:16px;flex-wrap:wrap;">${legend}</div>
      <div style="font-size:${densitySettings.footerSize}px;letter-spacing:0.12em;text-transform:uppercase;">Structured chart data</div>
    </div>
  </div>`;
}

function renderChartPanel(recipe: PageRecipe, theme: DeterministicRenderTheme) {
  return recipe.chartSpec
    ? renderChartPanelForSpec({
        chartSpec: recipe.chartSpec,
        theme,
        density: recipe.chartSpec.density ?? "hero",
      })
    : "";
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

function renderDualChartInsightSection(recipe: PageRecipe, theme: DeterministicRenderTheme) {
  if (!recipe.chartSpec || !recipe.secondaryChartSpec) {
    return "";
  }

  const twoPanel = recipe.compositionPreset === "two-panel-exhibit";
  if (twoPanel) {
    return `<div data-page-body data-html-composition-preset="two-panel-exhibit" style="display:flex;flex-direction:column;gap:16px;">
      <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:22px;align-items:start;">
        ${renderChartPanelForSpec({
          chartSpec: recipe.chartSpec,
          theme,
          density: "peer",
        })}
        ${renderChartPanelForSpec({
          chartSpec: recipe.secondaryChartSpec,
          theme,
          density: "peer",
        })}
      </div>
      <div data-html-visual-kind="annotation" style="border-top:1px solid ${withHexAlpha(theme.borderSubtle, 0.82)};padding-top:12px;font-size:20px;line-height:1.38;color:${theme.textPrimary};">${escapeHtml(
        recipe.takeaway,
      )}</div>
    </div>`;
  }

  return `<div data-page-body data-html-composition-preset="hero-sidecar" style="display:grid;grid-template-columns:minmax(0,1.55fr) minmax(330px,0.85fr);gap:22px;align-items:start;">
    <div data-html-layout-key="chart-primary" style="display:flex;flex-direction:column;gap:14px;">
      ${renderChartPanelForSpec({
        chartSpec: recipe.chartSpec,
        theme,
        density: "hero",
      })}
    </div>
    <aside data-html-layout-key="chart-sidecar" style="display:flex;flex-direction:column;gap:14px;">
      ${renderChartPanelForSpec({
        chartSpec: recipe.secondaryChartSpec,
        theme,
        density: "sidecar",
      })}
      <div data-html-visual-kind="annotation" style="border-top:1px solid ${withHexAlpha(
        theme.borderSubtle,
        0.82,
      )};padding-top:12px;font-size:19px;line-height:1.36;color:${theme.textPrimary};">${escapeHtml(
        recipe.takeaway,
      )}</div>
    </aside>
  </div>`;
}

function renderChartInsightSection(recipe: PageRecipe, theme: DeterministicRenderTheme) {
  if (recipe.chartSpec && recipe.secondaryChartSpec) {
    return renderDualChartInsightSection(recipe, theme);
  }

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
