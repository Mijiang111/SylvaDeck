import type {
  ChartPageIntent,
  DeckCompositionDiversityReport,
  HeroModelIntent,
  LongFormPageClass,
  PageCompositionFingerprint,
  PageFitMeasurement,
  PageOverflowCause,
  PageReviewDecision,
  PageReviewReason,
  PageRepairProfile,
} from "./contracts.js";
import { assessGeneratedTitleQuality, deriveSpecificStudioTitle } from "./brief.js";
import { escapeHtml } from "./render.js";

export function summarizeCompositionFingerprintForPrompt(fingerprint: PageCompositionFingerprint) {
  return `${fingerprint.family}; columns=${fingerprint.columnCount}; hero=${fingerprint.hasHero ? "yes" : "no"}; chart=${fingerprint.hasChart ? "yes" : "no"}; right-rail=${fingerprint.hasRightRail ? "yes" : "no"}; footer=${fingerprint.hasFooter ? "yes" : "no"}; primary=${fingerprint.primaryEvidenceRegion}`;
}

function normalizeInlineText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function shortenPlainText(text: string, maxLength: number) {
  const normalized = normalizeInlineText(text);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const sentenceBoundary = normalized.lastIndexOf(". ", maxLength);
  if (sentenceBoundary >= Math.floor(maxLength * 0.55)) {
    return `${normalized.slice(0, sentenceBoundary + 1).trim()}`;
  }

  const commaBoundary = normalized.lastIndexOf(", ", maxLength);
  if (commaBoundary >= Math.floor(maxLength * 0.55)) {
    return `${normalized.slice(0, commaBoundary).trim()}.`;
  }

  const spaceBoundary = normalized.lastIndexOf(" ", maxLength);
  if (spaceBoundary >= Math.floor(maxLength * 0.55)) {
    return `${normalized.slice(0, spaceBoundary).trim()}...`;
  }

  return `${normalized.slice(0, maxLength).trim()}...`;
}

function extractRepairTitleSeed(text?: string | null) {
  if (!text) {
    return "";
  }
  return normalizeInlineText(
    text
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

export function sanitizeRepairTitle(args: {
  title: string;
  pageNumber: number;
  pageClass: LongFormPageClass;
  fallbackSeed?: string | null;
}) {
  const trimmed = normalizeInlineText(args.title);
  const cleaned = trimmed
    .replace(/^(?:opening|create|build|make|prepare|draft|write|design|generate)\b[^A-Za-z0-9]+/i, "")
    .replace(/\b(?:a|an|the)?\s*(?:three-page|board-ready|board|leadership)\s+deck\b/gi, "")
    .replace(/\b(?:use the following evidence|what the deck should do|tone)\b.*$/i, "")
    .replace(/^[\s:;-]+|[\s:;-]+$/g, "");

  const cleanedQuality = assessGeneratedTitleQuality(cleaned);
  if (
    cleaned &&
    !cleanedQuality.promptLeak &&
    !cleanedQuality.repeatedInstruction &&
    !cleanedQuality.truncated
  ) {
    return cleaned;
  }

  const fallbackSeed = extractRepairTitleSeed(args.fallbackSeed);
  return deriveSpecificStudioTitle({
    seeds: [fallbackSeed, trimmed],
    fallback:
      args.pageClass === "opening-core"
        ? "Opening focus"
        : args.pageClass === "proof-analysis"
          ? "Evidence focus"
          : "Support focus",
    shortSuffix:
      args.pageClass === "opening-core"
        ? "focus"
        : args.pageClass === "proof-analysis"
          ? "proof"
          : "support",
    maxWords: 6,
  });
}

export function replacePageTitleInSection(sectionHtml: string, nextTitle: string) {
  let updated = sectionHtml.replace(
    /data-page-title=(["'])[^"']*\1/i,
    `data-page-title="${escapeHtml(nextTitle)}"`,
  );
  const replaceHeading = (tag: "h1" | "h2") => {
    const pattern = new RegExp(`<${tag}([^>]*)>([^<]*)<\\/${tag}>`, "i");
    if (!pattern.test(updated)) {
      return false;
    }
    updated = updated.replace(
      pattern,
      `<${tag}$1>${escapeHtml(nextTitle)}</${tag}>`,
    );
    return true;
  };

  if (!replaceHeading("h1")) {
    replaceHeading("h2");
  }

  return updated;
}

function dedupeSimpleListItems(html: string) {
  return html.replace(/<ul\b([^>]*)>([\s\S]*?)<\/ul>/gi, (_match, attrs, inner) => {
    const seen = new Set<string>();
    const items = Array.from(
      inner.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/gi),
    ) as RegExpMatchArray[];
    if (items.length === 0) {
      return `<ul${attrs}>${inner}</ul>`;
    }

    const deduped = items
      .filter((item) => {
        const key = normalizeInlineText(item[2].replace(/<[^>]+>/g, ""));
        if (!key || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .map((item) => `<li${item[1]}>${item[2]}</li>`)
      .join("");

    return `<ul${attrs}>${deduped}</ul>`;
  });
}

function limitSimpleListItems(html: string, maxItems: number, maxChars: number) {
  return html.replace(/<ul\b([^>]*)>([\s\S]*?)<\/ul>/gi, (_match, attrs, inner) => {
    const items = (
      Array.from(
        inner.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/gi),
      ) as RegExpMatchArray[]
    ).slice(0, maxItems);
    if (items.length === 0) {
      return `<ul${attrs}>${inner}</ul>`;
    }

    const limited = items
      .map((item) => {
        const rawText = item[2].replace(/<[^>]+>/g, "");
        if (/<[^>]+>/.test(item[2])) {
          return `<li${item[1]}>${item[2]}</li>`;
        }
        return `<li${item[1]}>${escapeHtml(shortenPlainText(rawText, maxChars))}</li>`;
      })
      .join("");

    return `<ul${attrs}>${limited}</ul>`;
  });
}

function shortenSimpleTextTags(
  html: string,
  tags: string[],
  maxLength: number,
) {
  const pattern = new RegExp(
    `<(${tags.join("|")})([^>]*)>([^<]+)<\\/\\1>`,
    "gi",
  );
  return html.replace(pattern, (_match, tagName, attrs, text) => {
    const shortened = shortenPlainText(text, maxLength);
    return `<${tagName}${attrs}>${escapeHtml(shortened)}</${tagName}>`;
  });
}

function shortenTextOnlyDivs(html: string, maxLength: number) {
  const pattern = new RegExp(`<div([^>]*)>([^<]{${Math.max(1, maxLength + 1)},})<\\/div>`, "gi");
  return html.replace(pattern, (_match, attrs, text) => {
    const shortened = shortenPlainText(text, maxLength);
    return `<div${attrs}>${escapeHtml(shortened)}</div>`;
  });
}

function removeTaggedRegion(
  html: string,
  matcher: RegExp,
  maxRemovals = 1,
) {
  let removals = 0;
  return html.replace(matcher, (match) => {
    if (removals >= maxRemovals) {
      return match;
    }
    removals += 1;
    return "";
  });
}

function findContainerRange(html: string, startIndex: number) {
  const openingTag = html.slice(startIndex).match(/^<(div|aside|footer)\b[^>]*>/i);
  if (!openingTag) {
    return null;
  }

  const tagPattern = /<\/?(div|aside|footer)\b[^>]*>/gi;
  tagPattern.lastIndex = startIndex;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html))) {
    const isClosing = match[0].startsWith("</");
    if (isClosing) {
      depth -= 1;
      if (depth === 0) {
        return {
          start: startIndex,
          end: tagPattern.lastIndex,
        };
      }
      continue;
    }
    depth += 1;
  }

  return null;
}

function removeContainerAroundText(html: string, targets: string[], maxRemovals = 1) {
  let updated = html;
  const removed: string[] = [];

  for (const target of targets) {
    if (removed.length >= maxRemovals) {
      break;
    }

    const targetIndex = updated.toLowerCase().indexOf(target.toLowerCase());
    if (targetIndex < 0) {
      continue;
    }

    const tagPattern = /<\/?(div|aside|footer)\b[^>]*>/gi;
    const stack: Array<{ start: number }> = [];
    let match: RegExpExecArray | null;
    while ((match = tagPattern.exec(updated))) {
      if (match.index > targetIndex) {
        break;
      }
      if (match[0].startsWith("</")) {
        stack.pop();
      } else {
        stack.push({ start: match.index });
      }
    }

    while (stack.length > 0) {
      const candidate = stack.pop();
      if (!candidate) {
        continue;
      }
      const range = findContainerRange(updated, candidate.start);
      if (!range || range.end < targetIndex) {
        continue;
      }
      updated = `${updated.slice(0, range.start)}${updated.slice(range.end)}`;
      removed.push(target);
      break;
    }
  }

  return {
    html: updated,
    removed,
  };
}

function collapseWeakSecondaryRegions(
  html: string,
  overflowCause: PageOverflowCause,
) {
  let updated = html;
  if (overflowCause === "chart+sidebar" || overflowCause === "comparison-grid" || overflowCause === "mixed-density") {
    updated = removeTaggedRegion(
      updated,
      /<(?:aside|div)\b[^>]*(?:data-html-layout-key=["'][^"']*(?:comparison-right|chart-right)[^"']*["']|data-html-visual-kind=["']rail["'])[^>]*>[\s\S]*?<\/(?:aside|div)>/gi,
      1,
    );
  }
  if (overflowCause === "footer/appendix" || overflowCause === "mixed-density") {
    updated = removeTaggedRegion(
      updated,
      /<(?:div|footer)\b[^>]*data-html-visual-kind=["']annotation["'][^>]*>[\s\S]*?<\/(?:div|footer)>/gi,
      1,
    );
    updated = removeTaggedRegion(
      updated,
      /<(?:div|footer)\b[^>]*data-html-visual-kind=["']rail["'][^>]*>[\s\S]*?<\/(?:div|footer)>/gi,
      1,
    );
  }
  return updated;
}

export function applyDeterministicShrink(args: {
  sectionHtml: string;
  measurement: PageFitMeasurement;
  pageTitle: string;
  profile: PageRepairProfile;
  chartPageIntent: ChartPageIntent;
  heroModelIntent: HeroModelIntent;
}) {
  let sectionHtml = args.sectionHtml;
  const notes: string[] = [];
  const textOverflowMeasurements = (args.measurement.textMeasurements ?? []).filter(
    (measurement) => measurement.overflowRisk !== "none",
  );
  const textOverflowRoles = new Set(
    textOverflowMeasurements.map((measurement) => measurement.role),
  );
  const textRootHints = args.measurement.predictedOverflowRoots ?? [];

  if (
    args.measurement.pageTitleQuality.promptLeak ||
    args.measurement.pageTitleQuality.truncated ||
    args.measurement.pageTitleQuality.repeatedInstruction
  ) {
    const cleanedTitle = sanitizeRepairTitle({
      title: args.pageTitle,
      pageNumber: args.measurement.pageNumber,
      pageClass: args.profile.pageClass,
      fallbackSeed: args.sectionHtml,
    });
    if (cleanedTitle && cleanedTitle !== args.pageTitle) {
      sectionHtml = replacePageTitleInSection(sectionHtml, cleanedTitle);
      notes.push(`Normalized the page title to "${cleanedTitle}".`);
    }
  }

  if (textOverflowRoles.has("title") || textOverflowRoles.has("headline") || textOverflowRoles.has("heading")) {
    const beforeHeadlineTighten = sectionHtml;
    sectionHtml = shortenSimpleTextTags(sectionHtml, ["h1", "h2"], 72);
    if (sectionHtml !== beforeHeadlineTighten) {
      notes.push("Tightened primary title and headline text based on predicted text overflow.");
    }
  }

  const beforeDedupe = sectionHtml;
  sectionHtml = dedupeSimpleListItems(sectionHtml);
  if (sectionHtml !== beforeDedupe) {
    notes.push("Removed duplicate proof points from simple lists.");
  }

  const beforeListLimit = sectionHtml;
  sectionHtml = limitSimpleListItems(
    sectionHtml,
    textOverflowRoles.has("list")
      ? Math.min(args.profile.densityBudget.maxListItemsPerList, 2)
      : args.profile.densityBudget.maxListItemsPerList,
    textOverflowRoles.has("list")
      ? Math.min(args.profile.densityBudget.maxListItemCharacters, 56)
      : args.profile.densityBudget.maxListItemCharacters,
  );
  if (sectionHtml !== beforeListLimit) {
    notes.push(
      textOverflowRoles.has("list")
        ? "Compressed list density based on predicted list overflow."
        : "Compressed list density to fit the page budget.",
    );
  }

  if (args.chartPageIntent.enabled) {
    const beforeChartListLimit = sectionHtml;
    sectionHtml = limitSimpleListItems(sectionHtml, 2, 78);
    if (sectionHtml !== beforeChartListLimit) {
      notes.push("Tightened chart-page support lists to keep the figure dominant.");
    }
  }

  if (args.heroModelIntent.enabled) {
    const beforeHeroListLimit = sectionHtml;
    sectionHtml = limitSimpleListItems(sectionHtml, 2, 68);
    if (sectionHtml !== beforeHeroListLimit) {
      notes.push("Tightened hero-page labels and support lists to protect the dominant model.");
    }
  }

  const paragraphLimit =
    args.chartPageIntent.enabled
      ? Math.min(args.profile.densityBudget.maxParagraphCharacters, 112)
      : args.profile.overflowCause === "hero-copy"
        ? Math.min(args.profile.densityBudget.maxParagraphCharacters, 180)
        : args.measurement.predictedTextOverflow || textOverflowRoles.has("paragraph")
          ? Math.min(args.profile.densityBudget.maxParagraphCharacters, 148)
          : args.profile.densityBudget.maxParagraphCharacters;
  const beforeTextShorten = sectionHtml;
  sectionHtml = shortenSimpleTextTags(sectionHtml, ["p", "li", "h3", "h4"], paragraphLimit);
  if (sectionHtml !== beforeTextShorten) {
    notes.push("Shortened long copy blocks before escalating to model repair.");
  }

  if (args.chartPageIntent.enabled) {
    const beforeDivShorten = sectionHtml;
    sectionHtml = shortenTextOnlyDivs(
      sectionHtml,
      args.profile.overflowCause === "chart+sidebar" ? 92 : 104,
    );
    if (sectionHtml !== beforeDivShorten) {
      notes.push("Shortened chart-side explanatory copy while preserving the primary figure.");
    }
  }

  if (args.heroModelIntent.enabled) {
    const beforeHeroDivShorten = sectionHtml;
    sectionHtml = shortenTextOnlyDivs(sectionHtml, 82);
    if (sectionHtml !== beforeHeroDivShorten) {
      notes.push("Shortened hero-page explanatory copy before touching the model.");
    }
  }

  if (
    textOverflowRoles.has("annotation") ||
    textOverflowRoles.has("rail") ||
    textOverflowRoles.has("badge") ||
    textRootHints.some((root) => /\b(annotation|rail|badge)\b/i.test(root))
  ) {
    const beforeTextAdornmentCleanup = sectionHtml;
    sectionHtml = removeTaggedRegion(
      sectionHtml,
      /<(?:div|aside|footer)\b[^>]*(?:data-html-visual-kind=["']annotation["']|data-html-visual-kind=["']rail["']|data-html-visual-kind=["']badge["'])[^>]*>[\s\S]*?<\/(?:div|aside|footer)>/gi,
      1,
    );
    if (sectionHtml !== beforeTextAdornmentCleanup) {
      notes.push("Reduced annotation, rail, or badge copy based on predicted text overflow roots.");
    }
  }

  const beforeSecondaryCollapse = sectionHtml;
  sectionHtml = collapseWeakSecondaryRegions(sectionHtml, args.profile.overflowCause);
  if (sectionHtml !== beforeSecondaryCollapse) {
    notes.push("Collapsed weak secondary rails or support blocks to preserve the primary composition.");
  }

  if (args.chartPageIntent.enabled && args.profile.overflowCause === "chart+sidebar") {
    const beforeChartCleanup = sectionHtml;
    sectionHtml = removeTaggedRegion(
      sectionHtml,
      /<(?:div|aside|footer)\b[^>]*(?:data-html-visual-kind=["']annotation["']|data-html-visual-kind=["']rail["'])[^>]*>[\s\S]*?<\/(?:div|aside|footer)>/gi,
      1,
    );
    if (sectionHtml !== beforeChartCleanup) {
      notes.push("Reduced chart-side annotation weight to protect the dominant figure.");
    }

    const targetedTrim = removeContainerAroundText(
      sectionHtml,
      [
        "Three evidence points",
        "Investment mix",
        "Supporting evidence",
        "Evidence points",
        "Additional evidence",
      ],
      2,
    );
    if (targetedTrim.html !== sectionHtml) {
      sectionHtml = targetedTrim.html;
      notes.push(
        `Removed secondary chart support blocks (${targetedTrim.removed.join(", ")}) before escalating to model repair.`,
      );
    }
  }

  if (args.heroModelIntent.enabled) {
    const beforeHeroCleanup = sectionHtml;
    sectionHtml = removeTaggedRegion(
      sectionHtml,
      /<(?:div|aside|footer)\b[^>]*(?:data-html-visual-kind=["']annotation["']|data-html-visual-kind=["']rail["']|data-html-visual-kind=["']surface["'])[^>]*>[\s\S]*?<\/(?:div|aside|footer)>/gi,
      args.profile.isCriticalPage ? 1 : 2,
    );
    if (sectionHtml !== beforeHeroCleanup) {
      notes.push("Reduced hero-page callouts or secondary surface blocks before escalating to model repair.");
    }
  }

  return {
    sectionHtml,
    changed: sectionHtml !== args.sectionHtml,
    notes,
  };
}

function resolveRepairReviewPageClass(pageNumber: number, pageCount?: number | null): LongFormPageClass {
  if ((pageCount ?? 0) >= 10) {
    if (pageNumber <= 3) {
      return "opening-core";
    }
    if (pageNumber <= 8) {
      return "proof-analysis";
    }
    return "synthesis-support";
  }
  return "opening-core";
}

function countLongTextBlocks(measurement: PageFitMeasurement) {
  return (measurement.textMeasurements ?? []).filter(
    (item) =>
      (item.role === "paragraph" || item.role === "list") &&
      item.predictedLineCount > 4,
  ).length;
}

function isShortDeckReviewContext(args: {
  pageCount?: number | null;
  softenSemanticDensity?: boolean;
}) {
  if (typeof args.softenSemanticDensity === "boolean") {
    return args.softenSemanticDensity;
  }
  return args.pageCount == null || args.pageCount < 10;
}

export function hasSemanticDensityFailure(
  measurement: PageFitMeasurement,
  pageCount?: number | null,
) {
  const pageClass = resolveRepairReviewPageClass(measurement.pageNumber, pageCount);
  const longTextBlockCount = countLongTextBlocks(measurement);

  if (pageClass === "opening-core") {
    return Boolean(
      measurement.topLevelRegions.length > 3 ||
        measurement.semanticModuleCount > 7 ||
        measurement.textCharacterCount > 520 ||
        longTextBlockCount >= 2,
    );
  }

  if (pageClass === "proof-analysis") {
    return Boolean(
      measurement.topLevelRegions.length > 3 ||
        measurement.semanticModuleCount > 6 ||
        measurement.textCharacterCount > 460 ||
        longTextBlockCount >= 2,
    );
  }

  return Boolean(
    measurement.topLevelRegions.length > 2 ||
      measurement.semanticModuleCount > 5 ||
      measurement.textCharacterCount > 380 ||
      longTextBlockCount >= 1,
  );
}

export function resolvePageReviewDecision(
  measurement: PageFitMeasurement,
  options?: {
    pageCount?: number | null;
    softenSemanticDensity?: boolean;
  },
): PageReviewDecision {
  const reasons: PageReviewReason[] = [];
  if (measurement.overflowX) {
    reasons.push("overflow-x");
  }
  if (measurement.overflowY) {
    reasons.push("overflow-y");
  }
  if (measurement.pageTitleQuality.promptLeak) {
    reasons.push("title-prompt-leak");
  }
  if (measurement.pageTitleQuality.truncated) {
    reasons.push("title-truncated");
  }
  if (measurement.pageTitleQuality.repeatedInstruction) {
    reasons.push("title-repeated-instruction");
  }

  const semanticDensityFailure = hasSemanticDensityFailure(measurement, options?.pageCount);
  if (semanticDensityFailure) {
    reasons.push("semantic-density");
  }

  const hasHardFailure = reasons.some((reason) => reason !== "semantic-density");
  if (hasHardFailure) {
    return {
      severity: "hard-fail",
      reasons,
    };
  }

  if (semanticDensityFailure) {
    return {
      severity: isShortDeckReviewContext(options ?? {}) ? "soft-warning" : "hard-fail",
      reasons,
    };
  }

  return {
    severity: "pass",
    reasons,
  };
}

export function measurementNeedsRepair(
  measurement: PageFitMeasurement,
  pageCount?: number | null,
  options?: {
    includeSoftWarnings?: boolean;
    softenSemanticDensity?: boolean;
  },
) {
  const decision = resolvePageReviewDecision(measurement, {
    pageCount,
    softenSemanticDensity: options?.softenSemanticDensity,
  });
  return options?.includeSoftWarnings
    ? decision.severity !== "pass"
    : decision.severity === "hard-fail";
}

export function summarizeMeasurementIssues(measurement: PageFitMeasurement) {
  const decision = resolvePageReviewDecision(measurement);
  const issues: string[] = [
    `Dominant overflow region: ${measurement.dominantOverflowRegion}.`,
    `Composition fingerprint: ${summarizeCompositionFingerprintForPrompt(measurement.compositionFingerprint)}.`,
  ];
  if (measurement.overflowY) {
    issues.push(
      `Vertical overflow: ${measurement.scrollHeight}px content inside ${measurement.clientHeight}px budget.`,
    );
  }
  if (measurement.overflowX) {
    issues.push(
      `Horizontal overflow: ${measurement.scrollWidth}px content inside ${measurement.clientWidth}px budget.`,
    );
  }
  if (measurement.pageTitleQuality.promptLeak) {
    issues.push(
      measurement.pageTitleQuality.reason ??
        `Prompt leak: "${measurement.pageTitleQuality.title}" reads like prompt text.`,
    );
  }
  if (measurement.pageTitleQuality.truncated) {
    issues.push(`Title may be truncated: "${measurement.pageTitleQuality.title}".`);
  }
  if (measurement.pageTitleQuality.repeatedInstruction) {
    issues.push(`Title repeats instruction language: "${measurement.pageTitleQuality.title}".`);
  }
  if (measurement.semanticModuleCount > 0) {
    issues.push(
      `Semantic module count: ${measurement.semanticModuleCount}; chart regions: ${measurement.chartRegionCount}; text characters: ${measurement.textCharacterCount}.`,
    );
  }
  if (decision.reasons.includes("semantic-density")) {
    issues.push(
      decision.severity === "soft-warning"
        ? "Semantic density is high enough to warrant simplification even though the page still fits."
        : "Semantic density is too high for the page class: reduce equal-weight modules, long paragraphs, or supporting clutter before changing the core claim.",
    );
  }
  if (measurement.predictedTextOverflow && (measurement.predictedOverflowRoots?.length ?? 0) > 0) {
    issues.push(
      `Primary text overflow roots: ${measurement.predictedOverflowRoots.slice(0, 4).join("; ")}.`,
    );
  }
  if (measurement.rightRailHeight > 0) {
    issues.push(`Right rail height: ${measurement.rightRailHeight}px.`);
  }
  if (measurement.footerHeight > 0) {
    issues.push(`Footer or appendix height: ${measurement.footerHeight}px.`);
  }
  if (measurement.longestBlockHeight > 0) {
    issues.push(`Tallest semantic block: ${measurement.longestBlockHeight}px.`);
  }
  return issues;
}

export function summarizeDeckCompositionDiversityForPrompt(report: DeckCompositionDiversityReport) {
  const repeated =
    report.repeatedFamilies.length > 0
      ? ` Repeated families: ${report.repeatedFamilies.join(", ")}.`
      : "";
  return `Deck composition diversity score ${report.diversityScore} with ${report.uniqueFamilyCount} unique families and a largest repeat run of ${report.largestRepeatRun}.${repeated}`;
}

export function formatMeasurementElements(elements: PageFitMeasurement["suspectElements"]) {
  if (elements.length === 0) {
    return ["No semantic suspect elements were captured; simplify the densest top-level region."];
  }

  return elements.slice(0, 8).map((element) => {
    const overflowFlags = [
      element.overflowX ? "overflow-x" : null,
      element.overflowY ? "overflow-y" : null,
    ]
      .filter(Boolean)
      .join(", ");
    const anchors = [
      element.blockId ? `block=${element.blockId}` : null,
      element.layoutId ? `layout=${element.layoutId}` : null,
      element.visualKind ? `visual=${element.visualKind}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const selector = element.selector ? ` selector ${element.selector}` : "";
    const preview = element.textPreview ? ` text "${element.textPreview}"` : "";
    return `${element.label} (${element.kind}) at ${element.left},${element.top} size ${element.width}×${element.height}${overflowFlags ? ` [${overflowFlags}]` : ""}${anchors ? ` {${anchors}}` : ""}${selector}${preview}`;
  });
}

export function formatTextMeasurementsForPrompt(
  textMeasurements: PageFitMeasurement["textMeasurements"] = [],
) {
  if (textMeasurements.length === 0) {
    return ["No structured text measurements were captured for this page."];
  }

  const highlighted = textMeasurements
    .filter((measurement) => measurement.overflowRisk !== "none")
    .slice(0, 8);
  if (highlighted.length === 0) {
    return ["Structured text measurements found no explicit overflow-risk text blocks."];
  }

  return highlighted.map((measurement) => {
      const anchors = [
        measurement.blockId ? `block=${measurement.blockId}` : null,
        measurement.layoutId ? `layout=${measurement.layoutId}` : null,
        measurement.selector ? `selector=${measurement.selector}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      const preview = measurement.textPreview ? ` text "${measurement.textPreview}"` : "";
      return `${measurement.role}${anchors ? ` {${anchors}}` : ""}: predicted ${measurement.predictedLineCount} lines, predicted height ${measurement.predictedHeight}px vs actual ${measurement.actualHeight}px, tight width ${measurement.tightWidth}px for ${measurement.width}px box, risk=${measurement.overflowRisk}.${preview}`;
    });
}
