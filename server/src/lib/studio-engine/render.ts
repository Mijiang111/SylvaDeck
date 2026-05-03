import {
  toGeneratedReportStyleProfile,
  type DeckStyleProfile,
} from "../industry-style.js";
import type {
  ChartDensity,
  ChartSpec,
  DeckExportContract,
  ExportDataContract,
  ExportObjectContract,
  GeneratedReportStyleProfile,
  HtmlAnimationPage,
  HtmlAnimationStructure,
  HtmlPageAnimationManifest,
  HtmlOutputMode,
  PageExportContract,
  PageRecipe,
  StructuredDiagramNode,
  StructuredDiagramSpec,
} from "./contracts.js";
import {
  exportDataContractSchema,
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
  [
    /\b(?:page thesis|page mission|supplied page mission|page rendered only from supplied|no additional metrics are introduced|illustrative trajectory|source basis:\s*page rendered)\b/i,
    "generation meta-copy",
  ],
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

function surfaceBorderRadius(_theme: DeterministicRenderTheme, _fallbackPx: number) {
  return "0px";
}

function svgCornerRadius(_theme: DeterministicRenderTheme, _fallbackPx: number) {
  return 0;
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

export type PageExportContractDiagnostic = {
  code:
    | "export-metadata-anchor-missing"
    | "export-metadata-anchor-ambiguous"
    | "primary-export-object-metadata-missing"
    | "primary-export-object-kind-mismatch"
    | "primary-export-object-render-target-missing"
    | "export-object-metadata-missing"
    | "export-object-kind-mismatch"
    | "export-object-render-target-missing"
    | "export-object-duplicate-root"
    | "export-contract-ownership-scope-missing"
    | "export-contract-forbidden-interpretation-missing"
    | "export-contract-quality-intent-missing"
    | "export-contract-page-ir-metadata-missing"
    | "export-data-contract-missing"
    | "export-data-contract-invalid"
    | "export-data-contract-incompatible"
    | "export-data-contract-minimum-data-missing"
    | "chart-visual-module-missing";
  severity: "warning";
  pageNumber: number;
  objectId: string;
  message: string;
};

function readHtmlAttribute(tagHtml: string, name: string) {
  const match = tagHtml.match(new RegExp(`\\s${name}=(["'])([\\s\\S]*?)\\1`, "i"));
  return match?.[2] ?? null;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasHtmlAttribute(tagHtml: string, name: string) {
  return new RegExp(`\\s${escapeRegex(name)}(?:\\s*=|\\s|>|/)`, "i").test(tagHtml);
}

function setHtmlAttribute(tagHtml: string, name: string, value: string) {
  const encodedValue = escapeHtml(value);
  if (hasHtmlAttribute(tagHtml, name)) {
    const quotedAttribute = new RegExp(`(\\s${escapeRegex(name)}\\s*=\\s*)(["'])([\\s\\S]*?)\\2`, "i");
    if (quotedAttribute.test(tagHtml)) {
      return tagHtml.replace(
        quotedAttribute,
        (_match, prefix: string) => `${prefix}"${encodedValue}"`,
      );
    }
    const unquotedAttribute = new RegExp(`(\\s${escapeRegex(name)}\\s*=\\s*)([^\\s>/]+)`, "i");
    if (unquotedAttribute.test(tagHtml)) {
      return tagHtml.replace(
        unquotedAttribute,
        (_match, prefix: string) => `${prefix}"${encodedValue}"`,
      );
    }
  }

  const insertion = ` ${name}="${encodedValue}"`;
  if (tagHtml.endsWith("/>")) {
    return `${tagHtml.slice(0, -2)}${insertion} />`;
  }
  return `${tagHtml.slice(0, -1)}${insertion}>`;
}

function decodeHtmlAttribute(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function findElementOpenTagByExportObjectId(sectionHtml: string, objectId: string) {
  return findElementOpenTagsByExportObjectId(sectionHtml, objectId)[0] ?? null;
}

type ElementOpenTagMatch = {
  tag: string;
  startIndex: number;
};

function extractElementOpenTagMatches(sectionHtml: string) {
  const tags: ElementOpenTagMatch[] = [];
  let searchIndex = 0;
  while (searchIndex < sectionHtml.length) {
    const startIndex = sectionHtml.indexOf("<", searchIndex);
    if (startIndex < 0) {
      break;
    }
    const nextChar = sectionHtml[startIndex + 1] ?? "";
    if (!/[a-z]/i.test(nextChar)) {
      searchIndex = startIndex + 1;
      continue;
    }
    const tagEnd = findTagEnd(sectionHtml, startIndex);
    if (tagEnd < 0) {
      break;
    }
    tags.push({
      tag: sectionHtml.slice(startIndex, tagEnd + 1),
      startIndex,
    });
    searchIndex = tagEnd + 1;
  }
  return tags;
}

function extractElementOpenTags(sectionHtml: string) {
  return extractElementOpenTagMatches(sectionHtml).map((match) => match.tag);
}

function findElementOpenTagMatchesByAttributeValue(
  sectionHtml: string,
  attributeName: string,
  attributeValue: string,
) {
  return extractElementOpenTagMatches(sectionHtml).filter((match) => {
    const raw = readHtmlAttribute(match.tag, attributeName);
    return raw !== null && decodeHtmlAttribute(raw) === attributeValue;
  });
}

function findElementOpenTagsByAttributeValue(
  sectionHtml: string,
  attributeName: string,
  attributeValue: string,
) {
  return findElementOpenTagMatchesByAttributeValue(
    sectionHtml,
    attributeName,
    attributeValue,
  ).map((match) => match.tag);
}

function uniqueTagMatches(matches: ElementOpenTagMatch[]) {
  const seen = new Set<number>();
  return matches.filter((match) => {
    if (seen.has(match.startIndex)) {
      return false;
    }
    seen.add(match.startIndex);
    return true;
  });
}

function findElementOpenTagsByExportObjectId(sectionHtml: string, objectId: string) {
  return findElementOpenTagsByAttributeValue(
    sectionHtml,
    "data-export-object-id",
    objectId,
  );
}

function ownershipScopeAttribute(contract: ExportObjectContract) {
  return [
    contract.ownershipScope.ownsText ? "text" : "",
    contract.ownershipScope.ownsShapes ? "shape" : "",
    contract.ownershipScope.ownsSvg ? "svg" : "",
  ].filter(Boolean).join(",");
}

function studioSlotForExportObject(contract: ExportObjectContract) {
  if (contract.objectRole === "primary") {
    return "primary-visual";
  }
  if (contract.objectRole === "source") {
    return "source-note";
  }
  if (contract.objectRole === "annotation") {
    return "annotation";
  }
  if (contract.objectKind === "text" || contract.objectKind === "native-table" || contract.objectKind === "metric-grid") {
    return "evidence-note";
  }
  return "callout";
}

function snapshotBoundaryForExportObject(contract: ExportObjectContract) {
  if (
    contract.objectKind === "chart-visual" ||
    contract.objectKind === "native-table" ||
    contract.objectKind === "matrix" ||
    contract.objectKind === "diagram"
  ) {
    return "object-root";
  }
  return null;
}

function compiledExportMetadataAttributes(
  contract: ExportObjectContract,
  pageContract?: Pick<PageExportContract, "layoutArchetype" | "visualGrammar"> | null,
) {
  const snapshotBoundary = snapshotBoundaryForExportObject(contract);
  return [
    ["data-studio-object-id", contract.objectId],
    ["data-export-object-id", contract.objectId],
    ["data-semantic-kind", contract.objectKind],
    ["data-export-object-kind", contract.objectKind],
    ["data-object-role", contract.objectRole ?? "secondary"],
    ["data-studio-slot", studioSlotForExportObject(contract)],
    ["data-render-target", contract.renderTarget],
    ...(snapshotBoundary ? [["data-snapshot-boundary", snapshotBoundary]] : []),
    ["data-ownership-scope", ownershipScopeAttribute(contract)],
    ["data-forbidden-export", contract.forbiddenInterpretation.join(",")],
    ["data-forbidden-interpretation", contract.forbiddenInterpretation.join(",")],
    ["data-quality-intent", "contract-first-export"],
    ...(pageContract?.layoutArchetype
      ? [["data-layout-archetype", pageContract.layoutArchetype]]
      : []),
    ...(pageContract?.visualGrammar
      ? [["data-visual-grammar", pageContract.visualGrammar]]
      : []),
    ["data-export-contract", JSON.stringify(contract)],
  ] as Array<[string, string]>;
}

function compileExportMetadataTag(args: {
  tag: string;
  contract: ExportObjectContract;
  pageContract?: Pick<PageExportContract, "layoutArchetype" | "visualGrammar"> | null;
}) {
  return compiledExportMetadataAttributes(args.contract, args.pageContract).reduce(
    (nextTag, [name, value]) => setHtmlAttribute(nextTag, name, value),
    args.tag,
  );
}

function findPrimaryVisualSlotAnchorTagMatches(sectionHtml: string) {
  const slotTags = findElementOpenTagMatchesByAttributeValue(
    sectionHtml,
    "data-studio-slot",
    "primary-visual",
  );
  const classTags = extractElementOpenTagMatches(sectionHtml).filter((match) =>
    tagHasClassToken(match.tag, "primary-visual"),
  );
  return uniqueTagMatches([...slotTags, ...classTags]);
}

export function compileGeneratedPageExportMetadata(args: {
  sectionHtml: string;
  pageNumber: number;
  contracts?: readonly ExportObjectContract[] | null;
  pageContract?: Pick<PageExportContract, "layoutArchetype" | "visualGrammar"> | null;
}) {
  const contracts = args.contracts ?? [];
  let sectionHtml = args.sectionHtml;
  const diagnostics: PageExportContractDiagnostic[] = [];
  const compiledObjectIds: string[] = [];
  const missingObjectIds: string[] = [];
  const ambiguousObjectIds: string[] = [];

  if (contracts.length === 0) {
    return {
      sectionHtml,
      diagnostics,
      compiledObjectIds,
      missingObjectIds,
      ambiguousObjectIds,
    };
  }

  const singleObjectContract = contracts.length === 1;
  for (const contract of contracts) {
    const exactAnchorTags = uniqueTagMatches([
      ...findElementOpenTagMatchesByAttributeValue(
        sectionHtml,
        "data-export-object-id",
        contract.objectId,
      ),
      ...findElementOpenTagMatchesByAttributeValue(
        sectionHtml,
        "data-studio-object-id",
        contract.objectId,
      ),
    ]);
    const candidateTags =
      exactAnchorTags.length > 0
        ? exactAnchorTags
        : singleObjectContract
          ? findPrimaryVisualSlotAnchorTagMatches(sectionHtml)
          : [];

    if (candidateTags.length === 0) {
      missingObjectIds.push(contract.objectId);
      diagnostics.push({
        code: "export-metadata-anchor-missing",
        severity: "warning",
        pageNumber: args.pageNumber,
        objectId: contract.objectId,
        message:
          `Export object ${contract.objectId} could not be metadata-compiled because no data-studio-object-id anchor was found.`,
      });
      continue;
    }

    if (candidateTags.length > 1) {
      ambiguousObjectIds.push(contract.objectId);
      diagnostics.push({
        code: "export-metadata-anchor-ambiguous",
        severity: "warning",
        pageNumber: args.pageNumber,
        objectId: contract.objectId,
        message:
          `Export object ${contract.objectId} matched ${candidateTags.length} possible roots; Studio compiler will not guess between anchors.`,
      });
      continue;
    }

    const originalTag = candidateTags[0]!.tag;
    const compiledTag = compileExportMetadataTag({
      tag: originalTag,
      contract,
      pageContract: args.pageContract,
    });
    if (compiledTag !== originalTag) {
      sectionHtml = sectionHtml.replace(originalTag, compiledTag);
    }
    compiledObjectIds.push(contract.objectId);
  }

  return {
    sectionHtml,
    diagnostics,
    compiledObjectIds,
    missingObjectIds,
    ambiguousObjectIds,
  };
}

function normalizeMetadataList(value: string | null | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function metadataListIncludesExpected(actual: string | null, expected: readonly string[]) {
  const actualTokens = new Set(normalizeMetadataList(actual));
  return expected.every((token) => actualTokens.has(token));
}

function chartContractCompatibleWithNativeChart(type: string | undefined) {
  return Boolean(type?.startsWith("chart-"));
}

function expectedDataContractTypeForObject(contract: ExportObjectContract) {
  if (contract.objectKind === "chart-visual") {
    return null;
  }
  if (contract.objectKind === "native-chart") {
    return "chart-*";
  }
  if (contract.objectKind === "native-table") {
    return "table";
  }
  if (contract.objectKind === "matrix") {
    return "matrix";
  }
  return null;
}

function dataContractCompatibleWithObject(args: {
  objectKind: ExportObjectContract["objectKind"];
  renderTarget: ExportObjectContract["renderTarget"];
  type: string;
}) {
  if (args.type === "missing-data") {
    return false;
  }
  if (args.objectKind === "native-chart") {
    return args.renderTarget === "native-chart" && chartContractCompatibleWithNativeChart(args.type);
  }
  if (args.objectKind === "chart-visual") {
    return args.renderTarget === "visual-snapshot" && chartContractCompatibleWithNativeChart(args.type);
  }
  if (args.objectKind === "native-table") {
    return args.renderTarget === "native-table" && args.type === "table";
  }
  if (args.objectKind === "matrix") {
    return args.renderTarget === "editable-shapes" && args.type === "matrix";
  }
  return !(chartContractCompatibleWithNativeChart(args.type) || args.type === "table" || args.type === "matrix");
}

function finiteSeriesValuesMatchCategories(
  categories: readonly string[],
  series: readonly { values: readonly number[] }[],
) {
  return (
    categories.length > 0 &&
    series.length > 0 &&
    series.every((item) =>
      item.values.length === categories.length &&
      item.values.every((value) => Number.isFinite(value)))
  );
}

function dataContractHasMinimumData(contract: ExportDataContract) {
  if (contract.type === "chart-bar" || contract.type === "chart-stacked" || contract.type === "chart-line") {
    return finiteSeriesValuesMatchCategories(contract.categories, contract.series);
  }
  if (contract.type === "chart-combo") {
    return (
      finiteSeriesValuesMatchCategories(contract.categories, contract.barSeries) &&
      finiteSeriesValuesMatchCategories(contract.categories, contract.lineSeries)
    );
  }
  if (contract.type === "chart-waterfall") {
    return contract.steps.length > 0 && contract.steps.every((step) => Number.isFinite(step.value));
  }
  if (contract.type === "chart-bubble") {
    return contract.points.length > 0 &&
      contract.points.every((point) =>
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        Number.isFinite(point.size) &&
        point.size > 0);
  }
  if (contract.type === "matrix") {
    return contract.items.length > 0;
  }
  if (contract.type === "table") {
    return contract.columns.length > 0 && contract.rows.length > 0;
  }
  return false;
}

function exportDataContractFromChartSpec(chartSpec: ChartSpec): ExportDataContract | null {
  if (
    chartSpec.categories.length === 0 ||
    chartSpec.series.length === 0 ||
    chartSpec.series.some((series) => series.values.length !== chartSpec.categories.length)
  ) {
    return null;
  }

  if (chartSpec.kind === "bar" || chartSpec.kind === "stacked" || chartSpec.kind === "line") {
    return {
      type: chartSpec.kind === "bar" ? "chart-bar" : chartSpec.kind === "line" ? "chart-line" : "chart-stacked",
      categories: chartSpec.categories,
      series: chartSpec.series.map((series) => ({
        name: series.name,
        values: series.values,
        color: series.color,
      })),
      axis: {
        y: chartSpec.unit ? { label: chartSpec.unit, unit: chartSpec.unit } : undefined,
      },
      stackMode: chartSpec.kind === "stacked" ? "absolute" : undefined,
    };
  }

  if (chartSpec.kind === "waterfall") {
    const firstSeries = chartSpec.series[0];
    if (!firstSeries) {
      return null;
    }
    return {
      type: "chart-waterfall",
      steps: chartSpec.categories.map((label, index) => ({
        label,
        value: firstSeries.values[index] ?? 0,
      })),
      axis: {
        y: chartSpec.unit ? { label: chartSpec.unit, unit: chartSpec.unit } : undefined,
      },
    };
  }

  return null;
}

function chartVisualContractHasExecutableData(contract: ExportObjectContract) {
  return Boolean(
    contract.dataContract &&
      chartContractCompatibleWithNativeChart(contract.dataContract.type) &&
      dataContractHasMinimumData(contract.dataContract),
  );
}

function hasChartModuleEvidence(sectionHtml: string, tag: string) {
  return (
    /data-html-module-kind=(?:"chart"|'chart')/i.test(tag) ||
    /data-html-module-kind=(?:"chart"|'chart')/i.test(sectionHtml) ||
    /data-html-chart-spec=/i.test(tag) ||
    /data-html-chart-spec=/i.test(sectionHtml) ||
    /data-export-chart=/i.test(tag) ||
    /data-export-chart=/i.test(sectionHtml)
  );
}

function validateRenderedDataContract(args: {
  tag: string;
  expected: ExportObjectContract;
  pageNumber: number;
}): PageExportContractDiagnostic[] {
  const raw = readHtmlAttribute(args.tag, "data-export-contract");
  if (!raw) {
    return [
      {
        code: "export-data-contract-missing",
        severity: "warning",
        pageNumber: args.pageNumber,
        objectId: args.expected.objectId,
        message: `Export object ${args.expected.objectId} is missing data-export-contract metadata.`,
      },
    ];
  }
  const expectedType = expectedDataContractTypeForObject(args.expected);
  if (!expectedType) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeHtmlAttribute(raw));
  } catch {
    return [
      {
        code: "export-data-contract-invalid",
        severity: "warning",
        pageNumber: args.pageNumber,
        objectId: args.expected.objectId,
        message: `Export object ${args.expected.objectId} rendered data-export-contract that is not valid JSON.`,
      },
    ];
  }
  const rendered = parsed as Partial<ExportObjectContract>;
  const dataContract = rendered.dataContract;
  const validation = exportDataContractSchema.safeParse(dataContract);
  if (!validation.success) {
    return [
      {
        code: "export-data-contract-invalid",
        severity: "warning",
        pageNumber: args.pageNumber,
        objectId: args.expected.objectId,
        message: `Export object ${args.expected.objectId} rendered an invalid dataContract for ${expectedType}.`,
      },
    ];
  }
  if (validation.data.type === "missing-data") {
    return [
      {
        code: "export-data-contract-minimum-data-missing",
        severity: "warning",
        pageNumber: args.pageNumber,
        objectId: args.expected.objectId,
        message: `Export object ${args.expected.objectId} still has missing-data instead of executable ${expectedType} data.`,
      },
    ];
  }
  if (!dataContractHasMinimumData(validation.data)) {
    return [
      {
        code: "export-data-contract-minimum-data-missing",
        severity: "warning",
        pageNumber: args.pageNumber,
        objectId: args.expected.objectId,
        message: `Export object ${args.expected.objectId} rendered ${validation.data.type} data without the minimum executable fields.`,
      },
    ];
  }
  if (
    !dataContractCompatibleWithObject({
      objectKind: args.expected.objectKind,
      renderTarget: args.expected.renderTarget,
      type: validation.data.type,
    })
  ) {
    return [
      {
        code: "export-data-contract-incompatible",
        severity: "warning",
        pageNumber: args.pageNumber,
        objectId: args.expected.objectId,
        message: `Export object ${args.expected.objectId} expected ${expectedType} data but rendered ${validation.data.type}.`,
      },
    ];
  }
  return [];
}

function validateChartVisualModule(args: {
  sectionHtml: string;
  tag: string;
  expected: ExportObjectContract;
  pageNumber: number;
}): PageExportContractDiagnostic[] {
  if (args.expected.objectKind !== "chart-visual") {
    return [];
  }
  if (chartVisualContractHasExecutableData(args.expected)) {
    return [];
  }
  if (hasChartModuleEvidence(args.sectionHtml, args.tag)) {
    return [];
  }
  return [
    {
      code: "chart-visual-module-missing",
      severity: "warning",
      pageNumber: args.pageNumber,
      objectId: args.expected.objectId,
      message: `Export object ${args.expected.objectId} is chart-visual but rendered neither an html chart module nor executable chart data.`,
    },
  ];
}

function validateExportObjectMetadata(args: {
  sectionHtml: string;
  pageNumber: number;
  contracts?: readonly ExportObjectContract[] | null;
  pageContract?: Pick<PageExportContract, "layoutArchetype" | "visualGrammar"> | null;
}): PageExportContractDiagnostic[] {
  const contracts = args.contracts ?? [];
  if (contracts.length === 0) {
    return [];
  }

  const diagnostics: PageExportContractDiagnostic[] = [];
  for (const contract of contracts) {
    const tags = findElementOpenTagsByExportObjectId(args.sectionHtml, contract.objectId);
    const tag = tags[0] ?? null;
    if (!tag) {
      diagnostics.push({
        code: "export-object-metadata-missing",
        severity: "warning",
        pageNumber: args.pageNumber,
        objectId: contract.objectId,
        message: `Export object ${contract.objectId} is promised by contract but no root element carries data-export-object-id.`,
      });
      continue;
    }
    if (tags.length > 1) {
      diagnostics.push({
        code: "export-object-duplicate-root",
        severity: "warning",
        pageNumber: args.pageNumber,
        objectId: contract.objectId,
        message: `Export object ${contract.objectId} appears on ${tags.length} root elements; each objectId must be unique per page.`,
      });
    }

    const semanticKind = readHtmlAttribute(tag, "data-semantic-kind");
    const exportObjectKind = readHtmlAttribute(tag, "data-export-object-kind");
    if (semanticKind !== contract.objectKind || exportObjectKind !== contract.objectKind) {
      diagnostics.push({
        code: "export-object-kind-mismatch",
        severity: "warning",
        pageNumber: args.pageNumber,
        objectId: contract.objectId,
        message: `Export object ${contract.objectId} expected data-semantic-kind and data-export-object-kind ${contract.objectKind} but rendered ${semanticKind || "missing"}/${exportObjectKind || "missing"}.`,
      });
    }

    const renderTarget = readHtmlAttribute(tag, "data-render-target");
    if (renderTarget !== contract.renderTarget) {
      diagnostics.push({
        code: "export-object-render-target-missing",
        severity: "warning",
        pageNumber: args.pageNumber,
        objectId: contract.objectId,
        message: `Export object ${contract.objectId} expected data-render-target ${contract.renderTarget} but rendered ${renderTarget || "missing"}.`,
      });
    }
    const ownershipScope = readHtmlAttribute(tag, "data-ownership-scope");
    if (ownershipScope === null || ownershipScopeAttribute(contract) !== decodeHtmlAttribute(ownershipScope)) {
      diagnostics.push({
        code: "export-contract-ownership-scope-missing",
        severity: "warning",
        pageNumber: args.pageNumber,
        objectId: contract.objectId,
        message: `Export object ${contract.objectId} expected data-ownership-scope="${ownershipScopeAttribute(contract)}" but rendered ${ownershipScope ?? "missing"}.`,
      });
    }
    const forbiddenExport = readHtmlAttribute(tag, "data-forbidden-export");
    const forbiddenInterpretation = readHtmlAttribute(tag, "data-forbidden-interpretation");
    if (
      forbiddenExport === null ||
      forbiddenInterpretation === null ||
      !metadataListIncludesExpected(decodeHtmlAttribute(forbiddenExport), contract.forbiddenInterpretation) ||
      !metadataListIncludesExpected(decodeHtmlAttribute(forbiddenInterpretation), contract.forbiddenInterpretation)
    ) {
      diagnostics.push({
        code: "export-contract-forbidden-interpretation-missing",
        severity: "warning",
        pageNumber: args.pageNumber,
        objectId: contract.objectId,
        message: `Export object ${contract.objectId} expected forbidden interpretation metadata ${contract.forbiddenInterpretation.join(",") || "empty"} on data-forbidden-export and data-forbidden-interpretation.`,
      });
    }
    const qualityIntent = readHtmlAttribute(tag, "data-quality-intent");
    if (qualityIntent !== "contract-first-export") {
      diagnostics.push({
        code: "export-contract-quality-intent-missing",
        severity: "warning",
        pageNumber: args.pageNumber,
        objectId: contract.objectId,
        message: `Export object ${contract.objectId} is missing data-quality-intent="contract-first-export".`,
      });
    }
    if (
      args.pageContract?.layoutArchetype &&
      readHtmlAttribute(tag, "data-layout-archetype") !== args.pageContract.layoutArchetype
    ) {
      diagnostics.push({
        code: "export-contract-page-ir-metadata-missing",
        severity: "warning",
        pageNumber: args.pageNumber,
        objectId: contract.objectId,
        message: `Export object ${contract.objectId} is missing data-layout-archetype="${args.pageContract.layoutArchetype}".`,
      });
    }
    if (
      args.pageContract?.visualGrammar &&
      readHtmlAttribute(tag, "data-visual-grammar") !== args.pageContract.visualGrammar
    ) {
      diagnostics.push({
        code: "export-contract-page-ir-metadata-missing",
        severity: "warning",
        pageNumber: args.pageNumber,
        objectId: contract.objectId,
        message: `Export object ${contract.objectId} is missing data-visual-grammar="${args.pageContract.visualGrammar}".`,
      });
    }
    diagnostics.push(...validateRenderedDataContract({
      tag,
      expected: contract,
      pageNumber: args.pageNumber,
    }));
    diagnostics.push(...validateChartVisualModule({
      sectionHtml: args.sectionHtml,
      tag,
      expected: contract,
      pageNumber: args.pageNumber,
    }));
  }

  return diagnostics;
}

export function validateGeneratedPageHtml(args: {
  html: string;
  expectedPageNumber: number;
  expectedPageTitle: string;
  htmlOutputMode?: HtmlOutputMode;
  previousAnimationPage?: HtmlAnimationPage | null;
  expectedExportObjectContract?: ExportObjectContract | null;
  expectedExportObjectContracts?: readonly ExportObjectContract[] | null;
  expectedPageExportContract?: Pick<PageExportContract, "layoutArchetype" | "visualGrammar"> | null;
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
  const expectedExportObjectContracts =
    args.expectedExportObjectContracts ??
    (args.expectedExportObjectContract ? [args.expectedExportObjectContract] : []);
  const compiledExportMetadata = compileGeneratedPageExportMetadata({
    sectionHtml: sanitizedAnimation.sectionHtml,
    pageNumber: args.expectedPageNumber,
    contracts: expectedExportObjectContracts,
    pageContract: args.expectedPageExportContract,
  });
  const sectionHtml = compiledExportMetadata.sectionHtml;
  const exportContractDiagnostics = validateExportObjectMetadata({
    sectionHtml,
    pageNumber: args.expectedPageNumber,
    contracts: expectedExportObjectContracts,
    pageContract: args.expectedPageExportContract,
  });
  exportContractDiagnostics.unshift(...compiledExportMetadata.diagnostics);
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
    exportContractDiagnostics,
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
  exportContract?: DeckExportContract;
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
    exportContract: args.exportContract,
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
        )};border-radius:${surfaceBorderRadius(theme, 22)};background:${theme.surfaceSecondary};padding:20px 22px;min-height:108px;"><div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};margin-bottom:12px;">Signal ${index + 1}</div><div style="font-size:22px;line-height:1.35;color:${theme.textPrimary};">${escapeHtml(
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
          <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="${svgCornerRadius(theme, 4)}" fill="${color}" />
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
          <rect x="${x}" y="${y}" width="${Math.max(14, barWidth - 8)}" height="${h}" rx="${svgCornerRadius(theme, 4)}" fill="${color}" opacity="${isHighlight ? 1 : 0.78}" />
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
        return `<rect x="${x}" y="${nextY}" width="${barWidth}" height="${segmentHeight}" rx="${svgCornerRadius(theme, 4)}" fill="${series.color ?? colors[seriesIndex % colors.length]}" opacity="${seriesIndex === 0 ? 0.95 : 0.78}" />`;
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
  )};border-radius:${surfaceBorderRadius(theme, 8)};background:${theme.surfacePrimary};padding:${densitySettings.padding};min-height:${densitySettings.minHeight}px;display:flex;flex-direction:column;gap:${densitySettings.gap}px;box-shadow:none;">
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
      return `<g data-gantt-task-id="${escapeHtml(task.id)}" data-gantt-track-id="${escapeHtml(task.trackId)}"><line x1="${left}" y1="${y + rowHeight}" x2="${chartLeft + chartWidth}" y2="${y + rowHeight}" stroke="${theme.borderSubtle}" stroke-width="1" /><text x="${left}" y="${y + rowHeight / 2}" dominant-baseline="middle" font-size="19" font-weight="650" fill="${theme.textPrimary}">${escapeHtml(task.label)}</text><rect x="${startX}" y="${y + rowHeight / 2 - 13}" width="${width}" height="26" rx="${svgCornerRadius(theme, 13)}" fill="${barColor}" opacity="0.9" />${milestone}</g>`;
    })
    .join("");

  return `<svg data-html-visual-kind="structured-diagram" data-structured-diagram-kind="gantt" viewBox="0 0 1600 900" role="img" aria-label="${escapeHtml(spec.title)}" style="position:absolute;inset:0;width:100%;height:100%;display:block;">
    <rect x="${left}" y="${top}" width="${labelWidth + chartWidth}" height="${rowHeight * tasks.length + 64}" fill="#ffffff" stroke="${theme.borderSubtle}" stroke-width="1.4" />
    ${grid}
    ${rows}
  </svg>`;
}

function renderStructuredDiagramPageSection(
  recipe: PageRecipe,
  theme: DeterministicRenderTheme,
  exportObjectContract?: ExportObjectContract | null,
  pageExportContract?: Pick<PageExportContract, "layoutArchetype" | "visualGrammar"> | null,
) {
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
    <main ${exportContractDataAttributes(exportObjectContract, pageExportContract)} style="position:absolute;inset:0;">${diagramSvg}</main>
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
      )};border-radius:${surfaceBorderRadius(theme, 30)};background:${theme.surfacePrimary};padding:28px 30px;">
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
              )};border-radius:${surfaceBorderRadius(theme, 26)};background:${index === 0 ? theme.surfaceSecondary : theme.surfacePrimary};padding:24px 24px;"><div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};margin-bottom:10px;">Evidence ${index + 1}</div><div style="font-size:24px;line-height:1.45;color:${theme.textPrimary};">${escapeHtml(
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
      )};border-radius:${surfaceBorderRadius(theme, 24)};background:${theme.surfaceSecondary};padding:22px 24px;font-size:24px;line-height:1.45;color:${theme.textPrimary};">${escapeHtml(
        recipe.takeaway,
      )}</div>` : ""}
    </div>
    <aside data-html-layout-key="chart-right" style="display:flex;flex-direction:column;gap:16px;">
      <div data-html-visual-kind="badge" style="display:inline-flex;align-self:flex-start;padding:10px 16px;border-radius:${surfaceBorderRadius(theme, 999)};border:1px solid ${withHexAlpha(
        theme.borderSubtle,
        0.9,
      )};background:${theme.surfacePrimary};font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};">Data-driven view</div>
      <h2 style="margin:0;font-size:34px;line-height:1.08;color:${theme.textPrimary};">${escapeHtml(recipe.heroClaim)}</h2>
      <ul style="margin:0;padding-left:24px;">${renderListItems(recipe.supportBullets.slice(0, 3), theme)}</ul>
      <div data-html-visual-kind="rail" style="border:1px solid ${withHexAlpha(
        theme.borderSubtle,
        0.9,
      )};border-radius:${surfaceBorderRadius(theme, 24)};background:${theme.surfaceSecondary};padding:20px 22px;"><div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};margin-bottom:10px;">Decision</div><div style="font-size:24px;line-height:1.42;color:${theme.textPrimary};">${escapeHtml(
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
            )};border-radius:${surfaceBorderRadius(theme, 28)};background:${theme.surfacePrimary};padding:22px 24px;min-height:180px;"><div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};margin-bottom:18px;">Step ${index + 1}</div><div style="font-size:26px;line-height:1.38;color:${theme.textPrimary};">${escapeHtml(
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
            )};border-radius:${surfaceBorderRadius(theme, 24)};background:${index === 0 ? theme.surfaceSecondary : theme.surfacePrimary};padding:20px 22px;"><div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};margin-bottom:10px;">Comparison ${index + 1}</div><div style="font-size:23px;line-height:1.42;color:${theme.textPrimary};">${escapeHtml(
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

function exportContractDataAttributes(
  contract?: ExportObjectContract | null,
  pageContract?: Pick<PageExportContract, "layoutArchetype" | "visualGrammar"> | null,
) {
  if (!contract) {
    return "";
  }
  return compiledExportMetadataAttributes(contract, pageContract)
    .map(([name, value]) => `${name}="${escapeHtml(value)}"`)
    .join(" ");
}

function exportObjectContractForRenderedRecipe(
  contract: ExportObjectContract | null | undefined,
  recipe: Pick<PageRecipe, "chartSpec">,
) {
  if (!contract || contract.objectKind !== "chart-visual" || contract.dataContract || !recipe.chartSpec) {
    return contract ?? null;
  }
  const dataContract = exportDataContractFromChartSpec(recipe.chartSpec);
  return dataContract
    ? {
        ...contract,
        dataContract,
      }
    : contract;
}

type MatrixDataContract = Extract<ExportDataContract, { type: "matrix" }>;
type MatrixVariant = NonNullable<MatrixDataContract["variant"]>;
type MatrixItemContract = MatrixDataContract["items"][number];
type MatrixQuadrantContract = NonNullable<MatrixDataContract["quadrants"]>[number];

function compactMatrixText(value: string | null | undefined, maxLength: number) {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function clampMatrixCoordinate(value: number | null | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0.08, Math.min(0.92, value));
}

function matrixPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

function defaultMatrixQuadrants(axes: MatrixDataContract["axes"]): MatrixQuadrantContract[] {
  const xShort = compactMatrixText(axes.x.label.split(/[\/／|]/)[0] ?? axes.x.label, 28);
  const yShort = compactMatrixText(axes.y.label.split(/[\/／|]/)[0] ?? axes.y.label, 28);
  return [
    { id: "high-y-low-x", label: `High ${yShort} / low ${xShort}`, x: 0, y: 0.5, w: 0.5, h: 0.5 },
    { id: "high-y-high-x", label: `High ${yShort} / high ${xShort}`, x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    { id: "low-y-low-x", label: `Low ${yShort} / low ${xShort}`, x: 0, y: 0, w: 0.5, h: 0.5 },
    { id: "low-y-high-x", label: `Low ${yShort} / high ${xShort}`, x: 0.5, y: 0, w: 0.5, h: 0.5 },
  ];
}

function fallbackMatrixItems(recipe: PageRecipe): MatrixItemContract[] {
  const labels = [
    ...recipe.evidenceBullets,
    ...recipe.supportBullets,
    recipe.takeaway,
  ]
    .map((item) => compactMatrixText(item, 130))
    .filter(Boolean)
    .slice(0, 6);
  const safeLabels = labels.length > 0
    ? labels
    : [
        compactMatrixText(recipe.heroClaim, 110) || "Core opportunity",
        "Scale option",
        "Watch item",
        "Support asset",
      ];
  const positions = [
    { x: 0.68, y: 0.72 },
    { x: 0.32, y: 0.70 },
    { x: 0.70, y: 0.30 },
    { x: 0.32, y: 0.28 },
    { x: 0.50, y: 0.56 },
    { x: 0.56, y: 0.42 },
  ];
  return safeLabels.map((label, index) => ({
    id: `matrix-item-${index + 1}`,
    label,
    x: positions[index % positions.length]!.x,
    y: positions[index % positions.length]!.y,
  }));
}

function matrixDataForRender(
  contract: ExportObjectContract | null | undefined,
  recipe: PageRecipe,
): MatrixDataContract {
  if (contract?.dataContract?.type === "matrix") {
    return {
      ...contract.dataContract,
      variant: contract.dataContract.variant ?? "point-map",
      quadrants: contract.dataContract.quadrants?.length
        ? contract.dataContract.quadrants
        : defaultMatrixQuadrants(contract.dataContract.axes),
    };
  }

  const axes = {
    x: { label: "Execution visibility" },
    y: { label: "Upside potential" },
  };
  return {
    type: "matrix",
    variant: "asset-card-map",
    axes,
    quadrants: defaultMatrixQuadrants(axes),
    items: fallbackMatrixItems(recipe),
    callout: {
      title: "Conclusion",
      body: compactMatrixText(recipe.takeaway || recipe.insight, 260),
    },
    renderTarget: "editable-shapes",
  };
}

function renderMatrixQuadrants(data: MatrixDataContract, theme: DeterministicRenderTheme) {
  const quadrants = data.quadrants?.length ? data.quadrants.slice(0, 4) : defaultMatrixQuadrants(data.axes);
  return quadrants
    .map((quadrant, index) => {
      const left = matrixPercent(Math.max(0, Math.min(1, quadrant.x)));
      const bottom = matrixPercent(Math.max(0, Math.min(1, quadrant.y)));
      const width = matrixPercent(Math.max(0.12, Math.min(1, quadrant.w)));
      const height = matrixPercent(Math.max(0.12, Math.min(1, quadrant.h)));
      const fill = index === 1 || index === 2
        ? withHexAlpha(theme.surfaceSecondary, 0.72)
        : withHexAlpha(theme.surfacePrimary, 0.86);
      return `<div data-html-visual-kind="matrix-quadrant" style="position:absolute;left:${left};bottom:${bottom};width:${width};height:${height};box-sizing:border-box;padding:28px 30px;background:${fill};">
        <div style="font-size:25px;line-height:1.12;font-weight:800;color:${theme.textPrimary};max-width:330px;">${escapeHtml(
          compactMatrixText(quadrant.label, 64),
        )}</div>
      </div>`;
    })
    .join("");
}

function renderMatrixAssetCards(data: MatrixDataContract, theme: DeterministicRenderTheme) {
  return data.items
    .slice(0, 8)
    .map((item, index) => {
      const x = clampMatrixCoordinate(item.x, index % 2 === 0 ? 0.68 : 0.32);
      const y = clampMatrixCoordinate(item.y, index < 2 ? 0.70 : 0.30);
      const color = item.color ?? theme.chartPalette[index % theme.chartPalette.length] ?? theme.accentPrimary;
      const prominent = index === 0 || index === 1;
      return `<div data-html-visual-kind="matrix-asset-card" style="position:absolute;left:${matrixPercent(x)};top:${matrixPercent(
        1 - y,
      )};transform:translate(-50%,-50%);width:${prominent ? 280 : 260}px;min-height:${prominent ? 118 : 104}px;box-sizing:border-box;border:1px solid ${withHexAlpha(
        color,
        0.72,
      )};border-radius:${surfaceBorderRadius(theme, 16)};background:${prominent ? color : theme.surfacePrimary};padding:20px 22px;box-shadow:0 16px 38px ${withHexAlpha(
        theme.textPrimary,
        0.10,
      )};">
        <div style="font-size:${prominent ? 30 : 25}px;line-height:1.06;font-weight:850;color:${prominent ? "#ffffff" : theme.textPrimary};">${escapeHtml(
          compactMatrixText(item.label, 44),
        )}</div>
        ${item.detail
          ? `<div style="margin-top:10px;font-size:${prominent ? 18 : 17}px;line-height:1.28;color:${prominent ? withHexAlpha("#ffffff", 0.88) : theme.textMuted};">${escapeHtml(
              compactMatrixText(item.detail, 96),
            )}</div>`
          : ""}
      </div>`;
    })
    .join("");
}

function renderMatrixPoints(data: MatrixDataContract, theme: DeterministicRenderTheme) {
  return data.items
    .slice(0, 10)
    .map((item, index) => {
      const x = clampMatrixCoordinate(item.x, index % 2 === 0 ? 0.68 : 0.32);
      const y = clampMatrixCoordinate(item.y, index < 2 ? 0.70 : 0.30);
      const color = item.color ?? theme.chartPalette[index % theme.chartPalette.length] ?? theme.accentPrimary;
      return `<div data-html-visual-kind="matrix-point" style="position:absolute;left:${matrixPercent(x)};top:${matrixPercent(
        1 - y,
      )};transform:translate(-12px,-12px);display:flex;align-items:flex-start;gap:11px;max-width:310px;">
        <span style="width:22px;height:22px;border-radius:999px;background:${color};border:4px solid ${withHexAlpha(
          color,
          0.25,
        )};box-shadow:0 0 0 6px ${withHexAlpha(color, 0.12)};flex:0 0 auto;"></span>
        <span data-html-visual-kind="matrix-point-label" style="font-size:21px;line-height:1.18;font-weight:760;color:${theme.textPrimary};padding-top:1px;">${escapeHtml(
          compactMatrixText(item.label, 62),
        )}</span>
      </div>`;
    })
    .join("");
}

function renderDeterministicMatrixPageSection(
  recipe: PageRecipe,
  theme: DeterministicRenderTheme,
  contract?: ExportObjectContract | null,
  pageContract?: Pick<PageExportContract, "layoutArchetype" | "visualGrammar"> | null,
) {
  const data = matrixDataForRender(contract, recipe);
  const variant: MatrixVariant = data.variant ?? "point-map";
  const calloutTitle = data.callout?.title && data.callout.title !== "Conclusion rail"
    ? data.callout.title
    : theme.profileId === "finance"
      ? "Investment conclusion"
      : "Conclusion";
  const calloutBody = compactMatrixText(data.callout?.body || recipe.takeaway || recipe.insight, 270);
  const supportItems = [
    ...recipe.supportBullets,
    ...recipe.evidenceBullets,
  ]
    .map((item) => compactMatrixText(item, 110))
    .filter(Boolean)
    .slice(0, 3);

  return `<section class="page" data-page-number="${recipe.pageNumber}" data-page-title="${escapeHtml(
    recipe.pageTitle,
  )}" data-page-bg="${theme.pageBackground}" data-divider-color="${theme.borderSubtle}" data-surface-fill="${theme.surfacePrimary}" data-page-accent="${theme.accentPrimary}" data-style-profile-id="${theme.profileId}" data-export-page-bg="${theme.pageBackground}" data-export-divider-color="${theme.borderSubtle}" data-export-surface-fill="${theme.surfacePrimary}" data-export-accent="${theme.accentPrimary}" style="width:1600px;height:900px;box-sizing:border-box;padding:44px 58px 40px 58px;background:${theme.pageBackground};display:flex;flex-direction:column;gap:22px;font-family:Inter,'PingFang SC','Microsoft YaHei',Arial,sans-serif;overflow:hidden;">
    <header data-html-layout-key="matrix-header" style="border-bottom:1px solid ${withHexAlpha(
      theme.borderSubtle,
      0.95,
    )};padding-bottom:18px;">
      <div style="font-size:14px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};font-weight:760;margin-bottom:12px;">${escapeHtml(
        recipe.pageTitle,
      )}</div>
      <h1 style="margin:0;font-size:43px;line-height:1.08;color:${theme.textPrimary};font-family:Georgia,'Times New Roman',serif;font-weight:850;max-width:1260px;">${escapeHtml(
        compactMatrixText(recipe.heroClaim || recipe.insight || recipe.pageTitle, 128),
      )}</h1>
      <p style="margin:12px 0 0 0;font-size:20px;line-height:1.36;color:${theme.textMuted};max-width:1260px;">${escapeHtml(
        compactMatrixText(recipe.insight || recipe.objective, 180),
      )}</p>
    </header>
    <main ${exportContractDataAttributes(contract, pageContract)} data-html-visual-kind="matrix-deliverable" data-matrix-variant="${variant}" style="flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:28px;align-items:stretch;">
      <div data-html-layout-key="matrix-canvas" style="position:relative;min-height:0;">
        <div data-html-visual-kind="matrix-field" style="position:absolute;left:48px;right:18px;top:18px;bottom:56px;border:2px solid ${withHexAlpha(
          theme.borderSubtle,
          0.95,
        )};background:${withHexAlpha(theme.surfacePrimary, 0.82)};overflow:hidden;">
          ${renderMatrixQuadrants(data, theme)}
          <div style="position:absolute;left:50%;top:0;bottom:0;border-left:2px solid ${withHexAlpha(theme.borderSubtle, 0.95)};"></div>
          <div style="position:absolute;left:0;right:0;top:50%;border-top:2px solid ${withHexAlpha(theme.borderSubtle, 0.95)};"></div>
          ${variant === "asset-card-map" ? renderMatrixAssetCards(data, theme) : renderMatrixPoints(data, theme)}
        </div>
        <div style="position:absolute;left:48px;right:18px;bottom:14px;text-align:center;font-size:24px;font-weight:800;color:${theme.textPrimary};">${escapeHtml(
          compactMatrixText(data.axes.x.label, 90),
        )}</div>
        <div style="position:absolute;left:0;top:18px;bottom:56px;width:34px;display:flex;align-items:center;justify-content:center;">
          <div style="transform:rotate(-90deg);white-space:nowrap;font-size:24px;font-weight:800;color:${theme.textPrimary};">${escapeHtml(
            compactMatrixText(data.axes.y.label, 90),
          )}</div>
        </div>
        <div style="position:absolute;left:50px;bottom:58px;font-size:16px;color:${theme.textMuted};">Low</div>
        <div style="position:absolute;right:22px;bottom:58px;font-size:16px;color:${theme.textMuted};">High</div>
        <div style="position:absolute;left:50px;top:20px;font-size:16px;color:${theme.textMuted};">High</div>
        <div style="position:absolute;left:50px;bottom:88px;font-size:16px;color:${theme.textMuted};">Low</div>
      </div>
      <aside data-html-visual-kind="matrix-conclusion-rail" style="border-left:1px solid ${withHexAlpha(
        theme.borderSubtle,
        0.95,
      )};padding-left:28px;display:flex;flex-direction:column;justify-content:space-between;gap:22px;">
        <div>
          <div style="font-size:14px;letter-spacing:0.16em;text-transform:uppercase;color:${theme.accentSecondary};font-weight:780;margin-bottom:22px;">${escapeHtml(
            calloutTitle,
          )}</div>
          <div style="font-size:31px;line-height:1.22;color:${theme.textPrimary};font-weight:830;">${escapeHtml(
            calloutBody,
          )}</div>
        </div>
        ${supportItems.length > 0
          ? `<div style="border-top:1px solid ${withHexAlpha(theme.borderSubtle, 0.9)};padding-top:18px;display:flex;flex-direction:column;gap:12px;">${supportItems.map((item) => `<div style="font-size:17px;line-height:1.34;color:${theme.textMuted};">${escapeHtml(item)}</div>`).join("")}</div>`
          : ""}
      </aside>
    </main>
  </section>`;
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

export function composeDeterministicPageSection(
  recipe: PageRecipe,
  styleProfile: DeckStyleProfile,
  exportObjectContract?: ExportObjectContract | null,
  pageExportContract?: Pick<PageExportContract, "layoutArchetype" | "visualGrammar"> | null,
) {
  const theme = resolveDeterministicRenderTheme(styleProfile);
  const renderedExportObjectContract = exportObjectContractForRenderedRecipe(
    exportObjectContract,
    recipe,
  );
  if (
    pageExportContract?.layoutArchetype === "matrix-first" ||
    renderedExportObjectContract?.objectKind === "matrix"
  ) {
    return renderDeterministicMatrixPageSection(recipe, theme, renderedExportObjectContract, pageExportContract);
  }
  if (recipe.structuredDiagramSpec) {
    return renderStructuredDiagramPageSection(recipe, theme, renderedExportObjectContract, pageExportContract);
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
      <div data-html-visual-kind="badge" style="display:inline-flex;align-items:center;padding:10px 14px;border-radius:${surfaceBorderRadius(theme, 999)};border:1px solid ${withHexAlpha(
        theme.borderSubtle,
        0.9,
      )};background:${theme.surfacePrimary};font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:${theme.accentSecondary};">${escapeHtml(
        moduleLabel,
      )}</div>
    </header>
    <main ${exportContractDataAttributes(renderedExportObjectContract, pageExportContract)} style="flex:1;display:block;">${body}</main>
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
