import { API_BASE, ApiError, api } from "@/api/client";
import { resolveGenerationAnalysisSkill } from "./analysis-skills";
import { resolveAgentConfigFromAiSettings, type WorkbenchAiSettings } from "./ai-settings";
import { DEFAULT_TEMPLATE_ID } from "./config";
import {
  canReuseGeneratedDraft,
  createGeneratedDraftAsset,
  hydrateDraftAsset,
} from "./generation-assets";
import { applyShrinkToFitToReport } from "./html-report-fit";
import { inferRequestedHtmlPageCount } from "./page-count";
import {
  ensureHtmlEditableStructure,
  normalizeGeneratedHtmlReportTypography,
} from "./html-report-structure";
import { normalizeHtmlAnimationStructure } from "./html-report-animation";
import {
  normalizeGeneratedHtmlReportCanvasOverrides,
  pruneGeneratedHtmlReportCanvasOverrides,
} from "./html-report-canvas";
import { ensureHtmlLayoutStructure } from "./html-report-layout";
import { ensureHtmlVisualStructure } from "./html-report-visuals";
import {
  createPublishedModuleManifestSignature,
  loadPublishedModuleManifests,
} from "./module-assets";
import {
  createStarterPackTransportManifest,
  createStarterThemeTransportManifest,
  getStarterPackManifest,
  isStarterPackDeck,
  isStarterPackLayout,
} from "./starter-packs";
import { buildFallbackPageScene } from "./slide-scene";
import { buildReportSourceInput } from "./module-runtime-input";
import { resolveGenerationPageArchetype } from "./page-archetypes";
import { resolveGenerationTemplateSkill } from "./template-skills";
import type {
  DeckThinkingMode,
  GenerationAnalysisSkillDefinition,
  GenerationDesignPlan,
  GenerationPageArchetypeDefinition,
  GenerationPageInput,
  GenerationTemplateSkillDefinition,
} from "./generation-contract";
import { buildGenerationSkillContext } from "./generation-skills";
import type { TextLayoutMeasurement } from "./text-layout/text-layout-types";
import { getTemplateDefinition } from "./templates";
import type {
  BlockKind,
  DraftProvider,
  EditableContentItem,
  EditableField,
  EditableSlideSpec,
  GeneratedHtmlReport,
  HtmlOutputMode,
  LayoutBlock,
  LayoutPage,
  MetricFact,
  NarrativeItem,
  PageDraft,
  SlideContentRegion,
  SlideContentRegionRole,
  SlideModuleConfig,
  StoryPagePlan,
  StoryPageRole,
  TemplateId,
  LongFormClarificationTrigger,
  WorkbenchGenerationMode,
  WorkbenchModuleUsageMode,
  WorkbenchDraft,
  PublishedModuleManifest,
} from "./types";

export { inferRequestedHtmlPageCount } from "./page-count";

type SourceSection = {
  heading: string;
  body: string;
  bullets: string[];
  index: number;
};

type SourceFact = MetricFact & {
  sentence: string;
  numericValue: number | null;
  year: number | null;
  index: number;
};

type NarrativeCandidate = NarrativeItem & {
  index: number;
  year: number | null;
};

type ParsedSource = {
  title: string;
  subtitle: string;
  sections: SourceSection[];
  facts: SourceFact[];
  narratives: NarrativeCandidate[];
};

type PageSeed = {
  summary: string;
  metrics: MetricFact[];
  cards: NarrativeItem[];
  steps: NarrativeItem[];
};

type PageNarrativePlan = {
  summary: string;
  metrics: MetricFact[];
  ranking: MetricFact[];
  cards: NarrativeItem[];
  flowSteps: NarrativeItem[];
  timeline: NarrativeItem[];
  phases: NarrativeItem[];
  roadmap: NarrativeItem[];
};

type DeckPlanPage = {
  pageId: string;
  pageRole: string;
  pageIntent: string;
  pageStory: string;
  previousPageSummary: string;
  nextPageBridge: string;
};

type PageGenerationContext = {
  page: LayoutPage;
  plan: PageNarrativePlan;
  deckPlan: DeckPlanPage;
};

type HtmlReportRequest = {
  brief: string;
  pageCount?: number;
  generationMode?: WorkbenchGenerationMode;
  moduleUsageMode?: WorkbenchModuleUsageMode;
  htmlOutputMode?: HtmlOutputMode;
  agentConfig?: {
    provider: string;
    command: string;
    model: string;
    cwd: string;
    apiKey: string;
    baseUrl: string;
  };
  publishedModules?: PublishedModuleManifest[];
  moduleManifestSignature?: string;
  attachments?: Array<{ name: string; type: string; content: string }>;
};

export type GenerationRequestIntent = {
  generationMode?: WorkbenchGenerationMode;
  requestedPageCount?: number | null;
  moduleUsageMode?: WorkbenchModuleUsageMode;
  htmlOutputMode?: HtmlOutputMode;
  suppressInferredPageCount?: boolean;
  starterPackId?: string | null;
  starterThemeId?: string | null;
  starterApplicationMode?: "deck" | "theme" | "mixed";
  starterBindings?: Array<{
    pageId: string;
    pageNumber: number;
    starterId: string;
  }>;
};

export type LongFormClarificationSuggestion = {
  trigger: LongFormClarificationTrigger;
  paragraphCount: number;
};

type RemoteHtmlReportResponse =
  | {
      provider: "model";
      model: string;
      report: GeneratedHtmlReport;
    }
  | {
      provider: "unavailable" | "error";
      model: null;
      reason: string;
    };

export type StudioGenerateStage =
  | "planning"
  | "evidence"
  | "modules"
  | "pages"
  | "review"
  | `page-${number}`
  | `page-recipe-${number}`
  | `page-render-${number}`
  | `repair-page-${number}`
  | "finalizing";

export type PageFitIssueCode =
  | "overflow-x"
  | "overflow-y"
  | "title-prompt-leak"
  | "title-truncated"
  | "title-repeated-instruction";

export type PageOverflowCause =
  | "title"
  | "hero-copy"
  | "chart+sidebar"
  | "comparison-grid"
  | "footer/appendix"
  | "mixed-density";

export type PageFitElementMeasurement = {
  kind: string;
  role: string;
  label: string;
  blockId?: string | null;
  layoutId?: string | null;
  visualKind?: string | null;
  selector?: string | null;
  textPreview?: string | null;
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
  overflowX: boolean;
  overflowY: boolean;
};

export type PageTitleQuality = {
  title: string;
  promptLeak: boolean;
  truncated: boolean;
  repeatedInstruction: boolean;
  reason: string | null;
};

export type PageCompositionFingerprint = {
  family:
    | "hero-proof"
    | "hero-chart"
    | "chart-rail"
    | "comparison-split"
    | "sequence-grid"
    | "single-column"
    | "poster-claim"
    | "center-stage-figure"
    | "single-proof-canvas"
    | "vertical-story-strip"
    | "case-timeline"
    | "annotation-stage"
    | "evidence-wall"
    | "asymmetric-proof-field"
    | "mixed-editorial";
  columnCount: number;
  hasHero: boolean;
  hasChart: boolean;
  hasRightRail: boolean;
  hasFooter: boolean;
  primaryEvidenceRegion: "chart" | "comparison" | "metrics" | "text";
};

export type PageFitMeasurement = {
  pageNumber: number;
  scrollHeight: number;
  clientHeight: number;
  scrollWidth: number;
  clientWidth: number;
  overflowX: boolean;
  overflowY: boolean;
  semanticModuleCount: number;
  textCharacterCount: number;
  chartRegionCount: number;
  dominantOverflowRegion: PageOverflowCause;
  footerHeight: number;
  rightRailHeight: number;
  longestBlockHeight: number;
  topLevelRegions: PageFitElementMeasurement[];
  suspectElements: PageFitElementMeasurement[];
  compositionFingerprint: PageCompositionFingerprint;
  pageTitleQuality: PageTitleQuality;
  textMeasurements?: TextLayoutMeasurement[];
  predictedTextOverflow?: boolean;
  predictedOverflowRoots?: string[];
};

export type DeckCompositionDiversityReport = {
  uniqueFamilyCount: number;
  largestRepeatRun: number;
  diversityScore: number;
  repeatedFamilies: string[];
};

export type PageFitIssue = {
  pageNumber: number;
  codes: PageFitIssueCode[];
  measurement: PageFitMeasurement;
};

export type StudioGenerateStreamEvent =
  | {
      type: "run_started";
      runId: string;
    }
  | {
      type: "stage_started";
      runId: string;
      stage: StudioGenerateStage;
      label: string;
      expectedPageCount?: number;
      pageTitles?: string[];
      pageNumber?: number;
    }
  | {
      type: "assistant_chunk";
      runId: string;
      stage: StudioGenerateStage;
      content: string;
    }
  | {
      type: "page_started";
      runId: string;
      pageNumber: number;
      pageTitle: string;
    }
  | {
      type: "page_ready";
      runId: string;
      pageNumber: number;
      pageTitle: string;
      pageHtml: string;
    }
  | {
      type: "final_report";
      runId: string;
      model: string | null;
      report: GeneratedHtmlReport;
    }
  | {
      type: "error";
      runId: string;
      reason: string;
    };

type StreamGenerateHtmlReportOptions = {
  signal?: AbortSignal;
  onEvent?: (event: StudioGenerateStreamEvent) => void;
  intent?: GenerationRequestIntent;
};

type StreamReviseHtmlReportOptions = {
  signal?: AbortSignal;
  onEvent?: (event: StudioGenerateStreamEvent) => void;
  repairMode?: "standard" | "aggressive";
  generationMode?: WorkbenchGenerationMode;
  moduleUsageMode?: WorkbenchModuleUsageMode;
  htmlOutputMode?: HtmlOutputMode;
  requestedPageCount?: number | null;
  starterPackId?: string | null;
  starterThemeId?: string | null;
  starterApplicationMode?: "deck" | "theme" | "mixed";
  starterBindings?: GenerationRequestIntent["starterBindings"];
};

export type OutlineGenerationResult = {
  pages: LayoutPage[];
  draft: WorkbenchDraft;
  provider: DraftProvider;
  model: string | null;
  storyPagePlans: StoryPagePlan[];
  editableSlideSpecs: EditableSlideSpec[];
  reason?: string;
};

export type HtmlReportGenerationResult = {
  pages: LayoutPage[];
  draft: WorkbenchDraft;
  provider: DraftProvider;
  model: string | null;
  htmlReport?: GeneratedHtmlReport;
  reason?: string;
};

type ReviseHtmlReportRequest = {
  brief: string;
  report: GeneratedHtmlReport;
  pageMeasurements: PageFitMeasurement[];
  repairMode?: "standard" | "aggressive";
  generationMode?: WorkbenchGenerationMode;
  htmlOutputMode?: HtmlOutputMode;
  requestedPageCount?: number | null;
  moduleUsageMode?: WorkbenchModuleUsageMode;
  agentConfig?: HtmlReportRequest["agentConfig"];
  publishedModules?: PublishedModuleManifest[];
  moduleManifestSignature?: string;
};

function isWorkbenchDebugEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const host = window.location.hostname;
    const isLocalhost = host === "localhost" || host === "127.0.0.1";
    return (
      isLocalhost || window.localStorage.getItem("ppt-workbench-studio-debug") === "1"
    );
  } catch {
    return false;
  }
}

function summarizeHtmlReportRequest(payload: HtmlReportRequest) {
  return {
    briefLength: payload.brief.length,
    pageCount: payload.pageCount ?? null,
    generationMode: payload.generationMode ?? "standard",
    moduleUsageMode: payload.moduleUsageMode ?? "disabled",
    htmlOutputMode: payload.htmlOutputMode ?? "static",
    publishedModuleCount: payload.publishedModules?.length ?? 0,
  };
}

export function resolveGenerationIntent(
  briefText: string,
  intent?: GenerationRequestIntent,
) {
  const explicitRequestedPageCount = intent?.suppressInferredPageCount
    ? undefined
    : inferRequestedHtmlPageCount(briefText);
  const hasExplicitRequestedPageCount =
    Number.isInteger(explicitRequestedPageCount) &&
    (explicitRequestedPageCount ?? 0) >= 1;
  const requestedPageCount =
    hasExplicitRequestedPageCount
      ? explicitRequestedPageCount ?? null
      : Number.isInteger(intent?.requestedPageCount) && (intent?.requestedPageCount ?? 0) >= 1
        ? intent?.requestedPageCount ?? null
        : null;
  const generationMode: WorkbenchGenerationMode =
    hasExplicitRequestedPageCount
      ? (explicitRequestedPageCount ?? 0) >= 10
        ? "long-form"
        : "standard"
      : requestedPageCount !== null && requestedPageCount >= 10
      ? "long-form"
      : requestedPageCount !== null && requestedPageCount <= 5
        ? "standard"
        : intent?.generationMode ?? "standard";

  return {
    generationMode,
    moduleUsageMode: intent?.moduleUsageMode ?? "disabled",
    htmlOutputMode: intent?.htmlOutputMode ?? "static",
    requestedPageCount:
      generationMode === "long-form"
        ? requestedPageCount && requestedPageCount >= 10
          ? Math.min(requestedPageCount, 12)
          : 10
        : requestedPageCount,
    starterPackId: intent?.starterPackId ?? null,
    starterThemeId: intent?.starterThemeId ?? null,
    starterApplicationMode: intent?.starterApplicationMode ?? "deck",
    starterBindings: intent?.starterBindings ?? [],
  };
}

function resolvePublishedModulesForUsageMode(moduleUsageMode: WorkbenchModuleUsageMode) {
  if (moduleUsageMode === "disabled") {
    return [] as PublishedModuleManifest[];
  }

  return loadPublishedModuleManifests();
}

function resolveStarterTransportManifests(intent?: GenerationRequestIntent) {
  const manifests: PublishedModuleManifest[] = [];
  const starter = getStarterPackManifest(intent?.starterPackId ?? null);
  if (isStarterPackDeck(starter) && (intent?.starterApplicationMode ?? "deck") !== "theme") {
    manifests.push(createStarterPackTransportManifest(starter, { application: "deck" }));
  }

  const themeManifest = createStarterThemeTransportManifest(intent?.starterThemeId ?? "");
  if (themeManifest) {
    manifests.push(themeManifest);
  }

  (intent?.starterBindings ?? []).forEach((binding) => {
    const boundStarter = getStarterPackManifest(binding.starterId);
    if (isStarterPackLayout(boundStarter)) {
      manifests.push(
        createStarterPackTransportManifest(boundStarter, {
          application: "page",
          pageNumber: binding.pageNumber,
        }),
      );
    }
  });

  return manifests;
}

function createGenerationRequestPayload(
  briefText: string,
  aiSettings?: WorkbenchAiSettings,
  intent?: GenerationRequestIntent,
): HtmlReportRequest {
  const { generationMode, moduleUsageMode, htmlOutputMode, requestedPageCount } =
    resolveGenerationIntent(briefText, intent);
  const starterManifests = resolveStarterTransportManifests(intent);
  const publishedModules = [
    ...resolvePublishedModulesForUsageMode(moduleUsageMode),
    ...starterManifests,
  ];

  return {
    brief: briefText,
    pageCount: requestedPageCount ?? undefined,
    generationMode,
    moduleUsageMode,
    htmlOutputMode,
    agentConfig: aiSettings ? resolveAgentConfigFromAiSettings(aiSettings) : undefined,
    publishedModules,
    moduleManifestSignature: createPublishedModuleManifestSignature(publishedModules),
  };
}

function createRevisionRequestPayload(
  briefText: string,
  report: GeneratedHtmlReport,
  pageMeasurements: PageFitMeasurement[],
  aiSettings?: WorkbenchAiSettings,
  repairMode: "standard" | "aggressive" = "standard",
  intent?: GenerationRequestIntent,
): ReviseHtmlReportRequest {
  const moduleUsageMode = intent?.moduleUsageMode ?? "disabled";
  const starterManifests = resolveStarterTransportManifests(intent);
  const publishedModules = [
    ...resolvePublishedModulesForUsageMode(moduleUsageMode),
    ...starterManifests,
  ];

  return {
    brief: briefText,
    report,
    pageMeasurements,
    repairMode,
    generationMode: intent?.generationMode,
    htmlOutputMode: report.htmlOutputMode ?? intent?.htmlOutputMode ?? "static",
    requestedPageCount: intent?.requestedPageCount ?? null,
    moduleUsageMode,
    agentConfig: aiSettings ? resolveAgentConfigFromAiSettings(aiSettings) : undefined,
    publishedModules,
    moduleManifestSignature: createPublishedModuleManifestSignature(publishedModules),
  };
}

function resolvePageFitReviewClass(pageNumber: number, pageCount?: number | null) {
  if ((pageCount ?? 0) >= 10) {
    if (pageNumber <= 3) {
      return "opening-core" as const;
    }
    if (pageNumber <= 8) {
      return "proof-analysis" as const;
    }
    return "synthesis-support" as const;
  }
  return "opening-core" as const;
}

function countLongTextBlocks(measurement: PageFitMeasurement) {
  return (measurement.textMeasurements ?? []).filter(
    (item) =>
      (item.role === "paragraph" || item.role === "list") &&
      item.predictedLineCount > 4,
  ).length;
}

export function hasSemanticDensityFailure(
  measurement: PageFitMeasurement,
  pageCount?: number | null,
) {
  const pageClass = resolvePageFitReviewClass(measurement.pageNumber, pageCount);
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

export function hasPageFitFailure(
  measurement: PageFitMeasurement,
  pageCount?: number | null,
) {
  return Boolean(
    measurement.overflowX ||
      measurement.overflowY ||
      measurement.pageTitleQuality.promptLeak ||
      measurement.pageTitleQuality.truncated ||
      measurement.pageTitleQuality.repeatedInstruction ||
      hasSemanticDensityFailure(measurement, pageCount),
  );
}

export function collectPageFitIssues(measurement: PageFitMeasurement): PageFitIssueCode[] {
  const issues: PageFitIssueCode[] = [];
  if (measurement.overflowX) {
    issues.push("overflow-x");
  }
  if (measurement.overflowY) {
    issues.push("overflow-y");
  }
  if (measurement.pageTitleQuality.promptLeak) {
    issues.push("title-prompt-leak");
  }
  if (measurement.pageTitleQuality.truncated) {
    issues.push("title-truncated");
  }
  if (measurement.pageTitleQuality.repeatedInstruction) {
    issues.push("title-repeated-instruction");
  }
  return issues;
}

export function buildPageFitIssue(measurement: PageFitMeasurement): PageFitIssue | null {
  const codes = collectPageFitIssues(measurement);
  if (codes.length === 0) {
    return null;
  }
  return {
    pageNumber: measurement.pageNumber,
    codes,
    measurement,
  };
}

export function buildDeckCompositionDiversityReport(
  measurements: PageFitMeasurement[],
): DeckCompositionDiversityReport {
  const families = measurements.map((measurement) => measurement.compositionFingerprint.family);
  if (families.length === 0) {
    return {
      uniqueFamilyCount: 0,
      largestRepeatRun: 0,
      diversityScore: 1,
      repeatedFamilies: [],
    };
  }

  const uniqueFamilyCount = new Set(families).size;
  let largestRepeatRun = 1;
  let currentRun = 1;
  const repeatedFamilies = new Set<string>();

  for (let index = 1; index < families.length; index += 1) {
    if (families[index] === families[index - 1]) {
      currentRun += 1;
      repeatedFamilies.add(families[index]!);
      largestRepeatRun = Math.max(largestRepeatRun, currentRun);
    } else {
      currentRun = 1;
    }
  }

  return {
    uniqueFamilyCount,
    largestRepeatRun,
    diversityScore: Number(
      Math.max(
        0,
        Math.min(1, uniqueFamilyCount / Math.max(1, families.length) - Math.max(0, largestRepeatRun - 2) * 0.14),
      ).toFixed(2),
    ),
    repeatedFamilies: [...repeatedFamilies],
  };
}

const LONG_FORM_CLARIFICATION_LENGTH_THRESHOLD = 2400;
const LONG_FORM_CLARIFICATION_PARAGRAPH_THRESHOLD = 7;

function countPromptParagraphs(sourceText: string) {
  return sourceText
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean).length;
}

export function detectImplicitLongFormClarification(
  briefText: string,
  intent?: GenerationRequestIntent,
): LongFormClarificationSuggestion | null {
  const normalized = briefText.trim();
  if (!normalized) {
    return null;
  }

  const inferredPageCount = inferRequestedHtmlPageCount(normalized);
  if (inferredPageCount === 8 || inferredPageCount === 9) {
    return {
      trigger: "explicit-8-9-pages",
      paragraphCount: countPromptParagraphs(normalized),
    };
  }

  if (Number.isInteger(inferredPageCount) && (inferredPageCount ?? 0) >= 1) {
    return null;
  }

  if (
    intent?.generationMode === "long-form" ||
    (intent?.requestedPageCount ?? 0) >= 10
  ) {
    return null;
  }

  const paragraphCount = countPromptParagraphs(normalized);
  if (
    normalized.length >= LONG_FORM_CLARIFICATION_LENGTH_THRESHOLD ||
    paragraphCount >= LONG_FORM_CLARIFICATION_PARAGRAPH_THRESHOLD
  ) {
    return {
      trigger: "long-input-opportunity",
      paragraphCount,
    };
  }

  return null;
}

function workbenchDebugLog(event: string, details?: Record<string, unknown>) {
  if (!isWorkbenchDebugEnabled()) {
    return;
  }

  console.info(`[ppt-workbench] ${event}`, {
    timestamp: new Date().toISOString(),
    ...(details ?? {}),
  });
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "through",
  "where",
  "what",
  "when",
  "which",
  "why",
  "your",
  "their",
  "more",
  "than",
  "then",
  "only",
  "over",
  "under",
  "before",
  "after",
  "being",
  "been",
  "have",
  "has",
  "had",
  "does",
  "did",
  "will",
  "would",
  "should",
  "could",
  "can",
  "are",
  "were",
  "was",
  "they",
  "them",
  "these",
  "those",
  "page",
  "report",
  "chapter",
  "module",
]);

function normalizeText(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(text: string) {
  return normalizeText(text)
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const nextKey = key(item);
    if (!nextKey || seen.has(nextKey)) {
      continue;
    }
    seen.add(nextKey);
    result.push(item);
  }

  return result;
}

function sentenceTitle(text: string, fallback: string) {
  const clean = text.replace(/^[\-\d.\s]+/, "").trim();
  if (!clean) {
    return fallback;
  }

  const words = clean.split(/\s+/).slice(0, 4).join(" ");
  return words.length > 3 ? words : fallback;
}

function fallbackNarratives(prefix: string, count: number, body: string) {
  return Array.from({ length: count }).map((_, index) => ({
    title: `${prefix} ${index + 1}`,
    body,
  }));
}

function isPlaceholderPlanningText(text: string) {
  const normalized = normalizeDraftText(text).toLowerCase();
  if (!normalized) {
    return true;
  }

  return (
    /placeholder/.test(normalized) ||
    /^comparison\s+\d+$/.test(normalized) ||
    /^comparison\s+\d+[:\s]/.test(normalized) ||
    /^point\s+\d+$/.test(normalized) ||
    /^point\s+\d+[:\s]/.test(normalized) ||
    /^step\s+\d+$/.test(normalized) ||
    /^step\s+\d+[:\s]/.test(normalized) ||
    /^phase\s+\d+$/.test(normalized) ||
    /^track\s+\d+$/.test(normalized) ||
    /^stage\s+\d+$/.test(normalized) ||
    /^rank\s+\d+$/.test(normalized) ||
    /^add another\b/.test(normalized) ||
    /^continue the sequence\b/.test(normalized) ||
    /^close the deck\b/.test(normalized) ||
    /^use this page to set up\b/.test(normalized)
  );
}

function sanitizePlanningList(items: string[], maxItems: number) {
  return uniqueBy(
    items
      .map((item) => normalizeDraftText(item))
      .filter((item) => item && !isPlaceholderPlanningText(item)),
    (item) => item.toLowerCase(),
  ).slice(0, maxItems);
}

function sanitizeStoryPagePlanContent(
  plan: StoryPagePlan,
  page: Pick<LayoutPage, "title" | "note">,
  totalPages: number,
): StoryPagePlan {
  const fallbackThesis =
    normalizeDraftText(plan.keyClaim) ||
    normalizeDraftText(plan.objective) ||
    normalizeDraftText(page.note) ||
    normalizeDraftText(page.title);
  const isSinglePage = totalPages <= 1;

  return {
    ...plan,
    objective:
      normalizeDraftText(plan.objective) && !isPlaceholderPlanningText(plan.objective)
        ? normalizeDraftText(plan.objective)
        : fallbackThesis,
    keyClaim:
      normalizeDraftText(plan.keyClaim) && !isPlaceholderPlanningText(plan.keyClaim)
        ? normalizeDraftText(plan.keyClaim)
        : fallbackThesis,
    supportingPoints: sanitizePlanningList(plan.supportingPoints, isSinglePage ? 3 : 5),
    evidenceNeeded: sanitizePlanningList(plan.evidenceNeeded, isSinglePage ? 3 : 4),
    evidenceNotes: sanitizePlanningList(plan.evidenceNotes, isSinglePage ? 3 : 4),
    transitionFromPrevious:
      isSinglePage || isPlaceholderPlanningText(plan.transitionFromPrevious)
        ? ""
        : normalizeDraftText(plan.transitionFromPrevious),
    bridgeToNext:
      isSinglePage || isPlaceholderPlanningText(plan.bridgeToNext)
        ? ""
        : normalizeDraftText(plan.bridgeToNext),
  };
}

function isThinSource(parsed: ParsedSource) {
  return (
    parsed.facts.length === 0 &&
    parsed.sections.length <= 1 &&
    parsed.narratives.length <= 2
  );
}

function normalizeDraftText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function clampGenerationText(text: string, max: number) {
  const normalized = normalizeDraftText(text);
  return normalized.length > max ? normalized.slice(0, max) : normalized;
}

function clampGenerationNumber(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) {
    return minimum;
  }
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function clampGenerationAnalysisSkill(
  skill: GenerationAnalysisSkillDefinition,
): GenerationAnalysisSkillDefinition {
  return {
    id: clampGenerationText(skill.id, 160),
    label: clampGenerationText(skill.label, 80),
    summary: clampGenerationText(skill.summary, 220),
    questionFrame: clampGenerationText(skill.questionFrame, 220),
    argumentShape: skill.argumentShape
      .map((item) => clampGenerationText(item, 220))
      .filter(Boolean)
      .slice(0, 4),
    evidenceShape: skill.evidenceShape
      .map((item) => clampGenerationText(item, 220))
      .filter(Boolean)
      .slice(0, 4),
    visualStrategy: skill.visualStrategy
      .map((item) => clampGenerationText(item, 220))
      .filter(Boolean)
      .slice(0, 4),
    preferredObjects: skill.preferredObjects.slice(0, 6),
    avoidPatterns: skill.avoidPatterns
      .map((item) => clampGenerationText(item, 220))
      .filter(Boolean)
      .slice(0, 4),
  };
}

function clampGenerationPageArchetype(
  archetype: GenerationPageArchetypeDefinition,
): GenerationPageArchetypeDefinition {
  return {
    id: archetype.id,
    label: clampGenerationText(archetype.label, 80),
    summary: clampGenerationText(archetype.summary, 220),
    layoutGrammar: archetype.layoutGrammar
      .map((item) => clampGenerationText(item, 220))
      .filter(Boolean)
      .slice(0, 4),
    compositionMoves: archetype.compositionMoves
      .map((item) => clampGenerationText(item, 220))
      .filter(Boolean)
      .slice(0, 4),
    objectStrategy: archetype.objectStrategy
      .map((item) => clampGenerationText(item, 220))
      .filter(Boolean)
      .slice(0, 4),
    copyBudget: {
      totalVisibleWords: clampGenerationNumber(archetype.copyBudget.totalVisibleWords, 20, 120),
      headlineMaxChars: clampGenerationNumber(archetype.copyBudget.headlineMaxChars, 24, 160),
      thesisMaxChars: clampGenerationNumber(archetype.copyBudget.thesisMaxChars, 24, 180),
      supportingPointCount: clampGenerationNumber(archetype.copyBudget.supportingPointCount, 1, 5),
      supportingPointMaxChars: clampGenerationNumber(
        archetype.copyBudget.supportingPointMaxChars,
        18,
        120,
      ),
      evidenceItemCount: clampGenerationNumber(archetype.copyBudget.evidenceItemCount, 1, 4),
      evidenceItemMaxChars: clampGenerationNumber(
        archetype.copyBudget.evidenceItemMaxChars,
        18,
        120,
      ),
      closeMaxChars: clampGenerationNumber(archetype.copyBudget.closeMaxChars, 18, 140),
      recommendedObjectMin: clampGenerationNumber(
        archetype.copyBudget.recommendedObjectMin,
        3,
        12,
      ),
      recommendedObjectMax: clampGenerationNumber(
        archetype.copyBudget.recommendedObjectMax,
        4,
        16,
      ),
    },
    avoidPatterns: archetype.avoidPatterns
      .map((item) => clampGenerationText(item, 220))
      .filter(Boolean)
      .slice(0, 4),
  };
}

function clampGenerationTemplateSkill(
  skill: GenerationTemplateSkillDefinition,
): GenerationTemplateSkillDefinition {
  return {
    id: clampGenerationText(skill.id, 160),
    label: clampGenerationText(skill.label, 80),
    summary: clampGenerationText(skill.summary, 220),
    visualIntent: clampGenerationText(skill.visualIntent, 220),
    compositionPatterns: skill.compositionPatterns
      .map((item) => clampGenerationText(item, 220))
      .filter(Boolean)
      .slice(0, 4),
    typographyRules: skill.typographyRules
      .map((item) => clampGenerationText(item, 220))
      .filter(Boolean)
      .slice(0, 4),
    surfaceRules: skill.surfaceRules
      .map((item) => clampGenerationText(item, 220))
      .filter(Boolean)
      .slice(0, 4),
    chartRules: skill.chartRules
      .map((item) => clampGenerationText(item, 220))
      .filter(Boolean)
      .slice(0, 4),
    annotationRules: skill.annotationRules
      .map((item) => clampGenerationText(item, 220))
      .filter(Boolean)
      .slice(0, 4),
    paletteHints: skill.paletteHints
      .map((item) => clampGenerationText(item, 160))
      .filter(Boolean)
      .slice(0, 4),
    theme: {
      background: clampGenerationText(skill.theme.background, 32),
      surface: clampGenerationText(skill.theme.surface, 32),
      surfaceAlt: clampGenerationText(skill.theme.surfaceAlt, 32),
      accent: clampGenerationText(skill.theme.accent, 32),
      text: clampGenerationText(skill.theme.text, 32),
      muted: clampGenerationText(skill.theme.muted, 32),
      chartPrimary: clampGenerationText(skill.theme.chartPrimary ?? "", 32) || undefined,
      chartSecondary: clampGenerationText(skill.theme.chartSecondary ?? "", 32) || undefined,
    },
    avoidPatterns: skill.avoidPatterns
      .map((item) => clampGenerationText(item, 220))
      .filter(Boolean)
      .slice(0, 4),
  };
}

function clampDesignPlan(plan: GenerationDesignPlan): GenerationDesignPlan {
  const fallbackKeyClaim =
    normalizeDraftText(plan.keyClaim) && !isPlaceholderPlanningText(plan.keyClaim)
      ? clampGenerationText(plan.keyClaim, 320)
      : clampGenerationText(plan.objective, 240);

  return {
    pageRole: clampGenerationText(plan.pageRole, 80),
    objective: clampGenerationText(plan.objective, 240),
    keyClaim: fallbackKeyClaim,
    supportingPoints: sanitizePlanningList(plan.supportingPoints, 5)
      .map((item) => clampGenerationText(item, 220))
      .filter(Boolean)
      .slice(0, 5),
    evidenceNotes: sanitizePlanningList(plan.evidenceNotes, 4)
      .map((item) => clampGenerationText(item, 220))
      .filter(Boolean)
      .slice(0, 4),
    transitionFromPrevious: isPlaceholderPlanningText(plan.transitionFromPrevious)
      ? ""
      : clampGenerationText(plan.transitionFromPrevious, 320),
    bridgeToNext: isPlaceholderPlanningText(plan.bridgeToNext)
      ? ""
      : clampGenerationText(plan.bridgeToNext, 320),
  };
}

function clampStoryPagePlan(plan: StoryPagePlan): StoryPagePlan {
  return {
    ...plan,
    pageId: clampGenerationText(plan.pageId, 40),
    chapter: clampGenerationText(plan.chapter, 80),
    title: clampGenerationText(plan.title, 180),
    pageRole: clampGenerationText(plan.pageRole, 80) as StoryPageRole,
    objective: clampGenerationText(plan.objective, 240),
    keyClaim: clampGenerationText(plan.keyClaim, 320),
    supportingPoints: plan.supportingPoints
      .map((item) => clampGenerationText(item, 220))
      .filter(Boolean)
      .slice(0, 6),
    evidenceNeeded: plan.evidenceNeeded
      .map((item) => clampGenerationText(item, 220))
      .filter(Boolean)
      .slice(0, 6),
    evidenceNotes: plan.evidenceNotes
      .map((item) => clampGenerationText(item, 220))
      .filter(Boolean)
      .slice(0, 6),
    transitionFromPrevious: clampGenerationText(plan.transitionFromPrevious, 320),
    bridgeToNext: clampGenerationText(plan.bridgeToNext, 320),
  };
}

function buildOutlineRequestPages(pages: LayoutPage[]): Array<{
  id: string;
  chapter: string;
  title: string;
  note: string;
}> {
  return pages.map((page) => ({
    id: page.id,
    chapter: page.chapter,
    title: page.title,
    note: page.note,
  }));
}

function normalizeRemoteHtmlReport(report: GeneratedHtmlReport): GeneratedHtmlReport {
  const normalizedTypography = normalizeGeneratedHtmlReportTypography({
    html: report.html,
    pageTitles: report.pageTitles,
  });

  const normalizedReport = {
    ...report,
    htmlOutputMode: report.htmlOutputMode ?? "static",
    animationStructure: normalizeHtmlAnimationStructure(report.animationStructure, {
      pageCount: report.pageCount,
    }),
    html: normalizedTypography.html,
    structure: normalizedTypography.structure,
  };

  const structure = ensureHtmlEditableStructure(normalizedReport);
  const visualStructure = ensureHtmlVisualStructure(normalizedReport);
  const layoutStructure = ensureHtmlLayoutStructure(normalizedReport);

  return {
    ...normalizedReport,
    structure,
    visualStructure,
    layoutStructure,
    canvasOverrides: pruneGeneratedHtmlReportCanvasOverrides({
      overrides: normalizeGeneratedHtmlReportCanvasOverrides(report.canvasOverrides),
      structure,
      visualStructure,
    }),
  };
}

async function requestModelHtmlReport(
  payload: HtmlReportRequest,
  signal?: AbortSignal,
) {
  workbenchDebugLog("html_report_request_started", summarizeHtmlReportRequest(payload));
  const response = await api.post<RemoteHtmlReportResponse>(
    "/studio/generate-html",
    payload,
    { signal },
  );

  if (response.provider !== "model") {
    workbenchDebugLog("html_report_request_failed", {
      ...summarizeHtmlReportRequest(payload),
      provider: response.provider,
      reason: response.reason,
    });
    return {
      htmlReport: null,
      model: null,
      reason: response.reason,
    };
  }

  workbenchDebugLog("html_report_request_succeeded", {
    ...summarizeHtmlReportRequest(payload),
    provider: response.provider,
    model: response.model,
    title: response.report.title,
    pageCount: response.report.pageCount,
  });

  return {
    htmlReport: normalizeRemoteHtmlReport(response.report),
    model: response.model,
    reason: undefined,
  };
}

function buildStreamUrl(path: string) {
  if (typeof window === "undefined") {
    return `${API_BASE}${path}`;
  }

  return new URL(`${API_BASE}${path}`, window.location.origin).toString();
}

async function readStreamResponseBody(response: Response) {
  const body = await response.text().catch(() => "");
  try {
    return JSON.parse(body) as { reason?: string; error?: string };
  } catch {
    return body;
  }
}

function formatStreamApiErrorMessage(status: number, errorBody: unknown) {
  if (typeof errorBody === "string") {
    return errorBody || `Request failed: ${status}`;
  }

  const candidate = errorBody as
    | {
        error?: string;
        reason?: string;
        details?: Array<{ path?: unknown[]; message?: string }>;
      }
    | null;

  if (candidate?.details?.length) {
    const first = candidate.details[0];
    const pathLabel =
      Array.isArray(first?.path) && first.path.length > 0
        ? first.path.join(".")
        : "request";
    return `${candidate.error ?? candidate.reason ?? "Invalid request payload"}: ${pathLabel} ${first?.message ?? ""}`.trim();
  }

  return candidate?.reason ?? candidate?.error ?? `Request failed: ${status}`;
}

export async function streamGenerateHtmlReport(
  sourceText: string,
  aiSettings?: WorkbenchAiSettings,
  options?: StreamGenerateHtmlReportOptions,
): Promise<HtmlReportGenerationResult> {
  const briefText = buildReportSourceInput({ sourceText }).briefText;
  const payload = createGenerationRequestPayload(briefText, aiSettings, options?.intent);

  workbenchDebugLog("html_report_stream_started", summarizeHtmlReportRequest(payload));

  const response = await fetch(buildStreamUrl("/studio/generate-html/stream"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  if (!response.ok) {
    const errorBody = await readStreamResponseBody(response);
    const errorMessage = formatStreamApiErrorMessage(response.status, errorBody);
    throw new ApiError(
      errorMessage,
      response.status,
      errorBody,
    );
  }

  if (!response.body) {
    throw new Error("The Studio stream did not return a readable body.");
  }

  const { finalReport, model, failureReason } = await consumeStudioStreamResponse(
    response,
    options?.onEvent,
  );

  if (!finalReport) {
    workbenchDebugLog("html_report_stream_failed", {
      ...summarizeHtmlReportRequest(payload),
      reason: failureReason ?? "No final report event received.",
    });
    return {
      pages: [],
      draft: buildLayoutPlaceholderDraft({
        title: "HTML report unavailable",
        subtitle: "Codex could not generate the streamed report this time.",
        pages: [],
      }),
      provider: "local",
      model: null,
      reason: failureReason ?? "No final report event received.",
    };
  }

  workbenchDebugLog("html_report_stream_succeeded", {
    ...summarizeHtmlReportRequest(payload),
    model,
    title: finalReport.title,
    pageCount: finalReport.pageCount,
  });

  const shrinkResult = await applyShrinkToFitToReport(finalReport.html);
  if (shrinkResult.changed) {
    finalReport.html = shrinkResult.html;
    workbenchDebugLog("html_report_shrink_to_fit_applied", {
      pageCount: finalReport.pageCount,
      changedPages: shrinkResult.pages.filter((p) => p.success && p.scaleRatio < 1).length,
      failedPages: shrinkResult.pages.filter((p) => !p.success).length,
      notes: shrinkResult.pages.map((p) => `Page ${p.pageNumber}: ${p.notes.join("; ")}`),
    });
  }

  return buildHtmlReportGenerationResultFromReport({
    report: finalReport,
    briefText,
    model,
  });
}

async function consumeStudioStreamResponse(
  response: Response,
  onEvent?: (event: StudioGenerateStreamEvent) => void,
) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("The Studio stream did not return a readable body.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let finalReport: GeneratedHtmlReport | null = null;
  let model: string | null = null;
  let failureReason: string | undefined;

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const event = JSON.parse(trimmed) as StudioGenerateStreamEvent;
      onEvent?.(event);

      if (event.type === "final_report") {
        finalReport = normalizeRemoteHtmlReport(event.report);
        model = event.model;
      }

      if (event.type === "error") {
        failureReason = event.reason;
      }
    }
  }

  const trailing = buffer.trim();
  if (trailing) {
    const event = JSON.parse(trailing) as StudioGenerateStreamEvent;
    onEvent?.(event);
    if (event.type === "final_report") {
      finalReport = normalizeRemoteHtmlReport(event.report);
      model = event.model;
    }
    if (event.type === "error") {
      failureReason = event.reason;
    }
  }

  return { finalReport, model, failureReason };
}

export async function streamReviseHtmlReport(
  sourceText: string,
  report: GeneratedHtmlReport,
  pageMeasurements: PageFitMeasurement[],
  aiSettings?: WorkbenchAiSettings,
  options?: StreamReviseHtmlReportOptions,
): Promise<HtmlReportGenerationResult> {
  const briefText = buildReportSourceInput({ sourceText }).briefText;
  const payload = createRevisionRequestPayload(
    briefText,
    report,
    pageMeasurements,
    aiSettings,
    options?.repairMode ?? "standard",
    {
      generationMode: options?.generationMode,
      moduleUsageMode: options?.moduleUsageMode ?? "disabled",
      htmlOutputMode: options?.htmlOutputMode ?? report.htmlOutputMode ?? "static",
      requestedPageCount: options?.requestedPageCount ?? null,
      starterPackId: options?.starterPackId ?? null,
      starterThemeId: options?.starterThemeId ?? null,
      starterApplicationMode: options?.starterApplicationMode ?? "deck",
      starterBindings: options?.starterBindings ?? [],
    },
  );

  workbenchDebugLog("html_report_revise_stream_started", {
    briefLength: payload.brief.length,
    pageCount: payload.report.pageCount,
    failingPageCount: pageMeasurements.filter(hasPageFitFailure).length,
  });

  const response = await fetch(buildStreamUrl("/studio/revise-html/stream"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  if (!response.ok) {
    const errorBody = await readStreamResponseBody(response);
    const errorMessage = formatStreamApiErrorMessage(response.status, errorBody);
    throw new ApiError(errorMessage, response.status, errorBody);
  }

  const { finalReport, model, failureReason } = await consumeStudioStreamResponse(
    response,
    options?.onEvent,
  );

  if (!finalReport) {
    return {
      pages: [],
      draft: buildLayoutPlaceholderDraft({
        title: report.title,
        subtitle: "Studio layout repair could not produce a revised deck.",
        pages: [],
      }),
      provider: "local",
      model: null,
      reason: failureReason ?? "No revised final report event received.",
    };
  }

  workbenchDebugLog("html_report_revise_stream_succeeded", {
    briefLength: payload.brief.length,
    pageCount: finalReport.pageCount,
    model,
  });

  const shrinkResult = await applyShrinkToFitToReport(finalReport.html);
  if (shrinkResult.changed) {
    finalReport.html = shrinkResult.html;
    workbenchDebugLog("html_report_revise_shrink_to_fit_applied", {
      pageCount: finalReport.pageCount,
      changedPages: shrinkResult.pages.filter((p) => p.success && p.scaleRatio < 1).length,
      failedPages: shrinkResult.pages.filter((p) => !p.success).length,
      notes: shrinkResult.pages.map((p) => `Page ${p.pageNumber}: ${p.notes.join("; ")}`),
    });
  }

  return buildHtmlReportGenerationResultFromReport({
    report: finalReport,
    briefText,
    model,
  });
}

function buildHtmlReportGenerationResultFromReport(args: {
  report: GeneratedHtmlReport;
  briefText: string;
  model: string | null;
}): HtmlReportGenerationResult {
  const pages = createHtmlReportPages(args.report, args.briefText);
  const draft = buildLayoutPlaceholderDraft({
    title: args.report.title,
    subtitle: "Generated from Codex streamed HTML report.",
    pages,
  });

  return {
    pages,
    draft: {
      ...draft,
      provider: "model",
    },
    provider: "model",
    model: args.model,
    htmlReport: args.report,
  };
}

export function createHtmlReportPages(
  htmlReport: GeneratedHtmlReport,
  fallbackNote: string,
): LayoutPage[] {
  const pageTitles =
    htmlReport.pageTitles.length > 0
      ? htmlReport.pageTitles
      : Array.from({ length: htmlReport.pageCount }, (_, index) => `Page ${index + 1}`);

  return Array.from({ length: htmlReport.pageCount }, (_, index) => ({
    id: `${index + 1}`,
    chapter: `Page ${index + 1}`,
    title: pageTitles[index] || `Page ${index + 1}`,
    note: index === 0 ? normalizeDraftText(fallbackNote) || htmlReport.title : "",
    blocks: [],
  }));
}

export function createGenerationSignature(
  sourceText: string,
  pages: LayoutPage[],
  templateId: TemplateId = DEFAULT_TEMPLATE_ID
) {
  const planning = buildSkillPlanningArtifacts(sourceText, pages, templateId);
  const skillContext = buildGenerationSkillContext(sourceText);
  return JSON.stringify({
    templateId,
    sourceText: buildReportSourceInput({ sourceText }).briefText,
    pages: planning.contexts.map((context, index) =>
      createGenerationPageInput(
        sourceText,
        context,
        planning.storyPagePlans[index]!,
        skillContext.thinkingMode,
      )
    ),
    domainSkills: skillContext.domainSkills,
    thinkingMode: skillContext.thinkingMode,
  });
}

export function createOutlineSignature(
  sourceText: string,
  pages: LayoutPage[],
  templateId: TemplateId = DEFAULT_TEMPLATE_ID
) {
  const localOutline = buildLocalOutline(sourceText, pages, templateId);
  return JSON.stringify({
    templateId,
    mode: "outline",
    sourceText: buildReportSourceInput({ sourceText }).briefText,
    pages: buildOutlineRequestPages(localOutline.pages),
    storyPagePlans: localOutline.storyPagePlans,
  });
}

function parseNumericValue(raw: string) {
  const clean = raw.replace(/[<>,~]/g, "").trim();
  const numberMatch = clean.match(/^\d[\d,.]*(?:\.\d+)?/);
  if (!numberMatch) {
    return null;
  }

  const numeric = Number(numberMatch[0].replace(/,/g, ""));
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (/%$/.test(clean)) return numeric;
  if (/mwh/i.test(clean)) return numeric * 1_000;
  if (/m\b|million/i.test(clean)) return numeric * 1_000_000;
  if (/bn/i.test(clean)) return numeric * 1_000_000_000;

  return numeric;
}

function parseSource(text: string): ParsedSource {
  const blocks = text
    .split(/\n\s*\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const title = blocks[0]?.split("\n")[0]?.trim() || "Untitled report";
  const subtitle = blocks[1]?.replace(/\s+/g, " ").trim() || "";

  const sections = blocks.slice(2).map((block, index) => {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const headingCandidate = lines[0] ?? `Section ${index + 1}`;
    const bodyLines =
      lines.length > 1 && headingCandidate.length < 90 ? lines.slice(1) : lines;
    const heading =
      lines.length > 1 && headingCandidate.length < 90
        ? headingCandidate
        : `Section ${index + 1}`;
    const body = bodyLines.join(" ").replace(/\s+/g, " ").trim();
    const bullets = lines
      .filter((line) => /^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line))
      .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim());

    return {
      heading,
      body,
      bullets,
      index,
    } satisfies SourceSection;
  });

  const sentencePool = text
    .replace(/\n+/g, " ")
    .split(/[.!?。；;]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 12);

  const facts = uniqueBy(
    sentencePool.flatMap((sentence, index) => {
      const matches = sentence.match(
        /(?:<|>|~)?\d[\d,.]*(?:\.\d+)?(?:\+|%|MWh|TEU|kg|tons|bn|million|rows|systems|sec|min)?/gi
      );

      if (!matches?.length) {
        return [];
      }

      return matches.map((value) => {
        const yearMatch = value.match(/\b(19|20)\d{2}\b/);
        return {
          value,
          label:
            sentence.replace(value, "").replace(/\s+/g, " ").trim() ||
            "Reported metric",
          sentence,
          numericValue: parseNumericValue(value),
          year: yearMatch ? Number(yearMatch[0]) : null,
          index,
        } satisfies SourceFact;
      });
    }),
    (fact) => `${fact.value}-${fact.label}`
  );

  const narratives = uniqueBy(
    [
      ...sections.flatMap((section) => [
        section.body ? { body: section.body, index: section.index } : null,
        ...section.bullets.map((bullet, bulletIndex) => ({
          body: bullet,
          index: section.index * 10 + bulletIndex,
        })),
      ]),
      ...sentencePool.map((sentence, index) => ({
        body: sentence,
        index: 100 + index,
      })),
    ]
      .filter((item): item is { body: string; index: number } =>
        Boolean(item?.body)
      )
      .map((item, index) => {
        const yearMatch = item.body.match(/\b(19|20)\d{2}\b/);
        return {
          title: sentenceTitle(item.body, `Point ${index + 1}`),
          body: item.body,
          index: item.index,
          year: yearMatch ? Number(yearMatch[0]) : null,
        } satisfies NarrativeCandidate;
      }),
    (item) => `${item.title}-${item.body}`
  );

  return { title, subtitle, sections, facts, narratives };
}

function scoreText(text: string, keywords: string[]) {
  if (!keywords.length) {
    return 0;
  }

  const haystack = normalizeText(text);
  let score = 0;
  for (const keyword of keywords) {
    if (haystack.includes(keyword)) {
      score += keyword.length > 6 ? 4 : 2;
    }
  }
  return score;
}

function sortByPageRelevance<T>(
  items: T[],
  keywords: string[],
  getText: (item: T) => string,
  getIndex: (item: T) => number
) {
  return [...items].sort((a, b) => {
    const scoreA = scoreText(getText(a), keywords);
    const scoreB = scoreText(getText(b), keywords);
    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }
    return getIndex(a) - getIndex(b);
  });
}

function mergeMetrics(primary: MetricFact[], fallback: MetricFact[]) {
  return uniqueBy(
    [...primary, ...fallback],
    (metric) => `${metric.value}-${metric.label}`
  ).slice(0, 6);
}

function mergeNarratives(primary: NarrativeItem[], fallback: NarrativeItem[]) {
  return uniqueBy(
    [...primary, ...fallback],
    (item) => `${item.title}-${item.body}`
  ).slice(0, 8);
}

function ensureMetricCount(
  metrics: MetricFact[],
  summary: string,
  prefix: string,
  labels: string[] = []
) {
  const normalizeMetricLabel = (text: string) =>
    clampGenerationText(text.trim(), 160);
  const nextMetrics = [...metrics];
  while (nextMetrics.length < 4) {
    const index = nextMetrics.length;
    const label =
      labels[index] ||
      `${prefix} ${index + 1}: ${sentenceTitle(summary, "Key point")}`;
    nextMetrics.push({
      value: `${prefix} ${index + 1}`,
      label: normalizeMetricLabel(label),
    });
  }
  return nextMetrics.slice(0, 4).map((metric) => ({
    ...metric,
    label: normalizeMetricLabel(metric.label),
  }));
}

function ensureNarrativeCount(
  items: NarrativeItem[],
  summary: string,
  prefix: string,
  bodyPrefix: string,
  _minimumBodyLength = 146
) {
  const normalizeNarrativeBody = (text: string) =>
    clampGenerationText(text.trim(), 220);
  const nextItems = [...items];
  while (nextItems.length < 4) {
    const index = nextItems.length;
    nextItems.push({
      title: `${prefix} ${index + 1}`,
      body: normalizeNarrativeBody(`${bodyPrefix} ${summary}`),
    });
  }
  return nextItems.slice(0, 4).map((item) => ({
    ...item,
    body: normalizeNarrativeBody(item.body),
  }));
}

function buildTemplateSeeds(templateId: TemplateId) {
  const template = getTemplateDefinition(templateId);
  const entries = template.defaultPages.map((page) => {
    const metrics: MetricFact[] = [];
    const cards: NarrativeItem[] = [];
    const steps: NarrativeItem[] = [];

    for (const block of page.blocks) {
      const draft = template.starterBlockDrafts[block.id];
      if (!draft) {
        continue;
      }
      metrics.push(...draft.metrics);
      cards.push(...draft.cards);
      steps.push(...draft.steps);
    }

    return [
      page.id,
      {
        summary: template.starterPageSummaries[page.id] ?? "",
        metrics: uniqueBy(
          metrics,
          (metric) => `${metric.value}-${metric.label}`
        ).slice(0, 6),
        cards: uniqueBy(cards, (item) => `${item.title}-${item.body}`).slice(
          0,
          8
        ),
        steps: uniqueBy(steps, (item) => `${item.title}-${item.body}`).slice(
          0,
          8
        ),
      } satisfies PageSeed,
    ] as const;
  });

  return Object.fromEntries(entries) as Record<string, PageSeed>;
}

function deriveKeywords(page: LayoutPage) {
  return uniqueBy(
    [
      ...tokenize(page.title),
      ...tokenize(page.note),
      ...tokenize(page.instruction ?? ""),
      ...page.blocks.flatMap((block) =>
        tokenize(`${block.title} ${block.detail} ${block.intent ?? ""}`)
      ),
    ],
    (token) => token
  ).slice(0, 12);
}

function selectPageSummary(
  page: LayoutPage,
  parsed: ParsedSource,
  keywords: string[],
  seed: PageSeed
) {
  const explicitInstruction = normalizeDraftText(page.instruction ?? "");
  if (explicitInstruction) {
    return explicitInstruction;
  }

  const candidate = sortByPageRelevance(
    [
      ...parsed.sections.map((section) => ({
        text: section.body || section.heading,
        index: section.index,
      })),
      ...parsed.narratives.map((item) => ({
        text: item.body,
        index: item.index,
      })),
    ],
    keywords,
    (item) => item.text,
    (item) => item.index
  ).find((item) => item.text.length > 24)?.text;

  return candidate || seed.summary || parsed.subtitle;
}

function inferRequestedOutlinePageCount(sourceText: string) {
  const normalized = normalizeDraftText(sourceText).toLowerCase();
  if (!normalized) {
    return null;
  }

  if (
    /\b(one|single|1)\s*(page|slide|pager)\b/.test(normalized) ||
    /\bone[\s-]?pager\b/.test(normalized) ||
    /(^|[^\d])1页/.test(sourceText) ||
    /一页|单页|单张/.test(sourceText)
  ) {
    return 1;
  }

  return null;
}

function createOutlineSeedPages(parsed: ParsedSource, sourceText: string) {
  const sectionSeeds = parsed.sections
    .map((section) => ({
      title:
        !/^Section\s+\d+$/i.test(section.heading) &&
        normalizeDraftText(section.heading)
          ? normalizeDraftText(section.heading)
          : sentenceTitle(section.body, "Untitled page"),
      note: normalizeDraftText(section.body) || parsed.subtitle,
    }))
    .filter((item) => item.note);

  const narrativeSeeds = parsed.narratives.map((item) => ({
    title: normalizeDraftText(item.title) || "Untitled page",
    note: normalizeDraftText(item.body) || parsed.subtitle,
  }));

  const candidates = uniqueBy(
    [...sectionSeeds, ...narrativeSeeds],
    (item) => `${item.title}-${item.note}`
  );
  const requestedPageCount = inferRequestedOutlinePageCount(sourceText);
  const minimumDeckPages = requestedPageCount ?? 1;
  const desiredCount = Math.min(
    Math.max(Math.min(candidates.length || 0, 6), minimumDeckPages),
    8
  );
  const seeds = candidates.slice(0, desiredCount);

  while (seeds.length < desiredCount) {
    const pageNumber = seeds.length + 1;
    seeds.push({
      title: `Untitled page ${pageNumber}`,
      note: parsed.subtitle,
    });
  }

  return seeds.map((seed, index) => {
    return {
      id: `${index + 1}`,
      chapter: `Chapter ${index + 1}`,
      title: seed.title,
      note: seed.note,
      blocks: [],
    };
  });
}

function buildPagePlan(
  page: LayoutPage,
  parsed: ParsedSource,
  templateId: TemplateId
): PageNarrativePlan {
  const templateSeeds = buildTemplateSeeds(templateId);
  const seed = templateSeeds[page.id] ?? {
    summary: "",
    metrics: [],
    cards: [],
    steps: [],
  };
  const keywords = deriveKeywords(page);

  const rankedFacts = sortByPageRelevance(
    parsed.facts,
    keywords,
    (fact) => `${fact.label} ${fact.sentence}`,
    (fact) => fact.index
  );
  const rankedNarratives = sortByPageRelevance(
    parsed.narratives,
    keywords,
    (item) => `${item.title} ${item.body}`,
    (item) => item.index
  );

  const summary = selectPageSummary(page, parsed, keywords, seed);
  const baseMetrics = mergeMetrics(
    rankedFacts
      .map((fact) => ({ value: fact.value, label: fact.label }))
      .slice(0, 6),
    seed.metrics
  );
  const baseCards = mergeNarratives(
    rankedNarratives.slice(0, 6).map(({ title, body }) => ({ title, body })),
    seed.cards
  );
  const baseSteps = mergeNarratives(
    rankedNarratives.slice(0, 6).map(({ title, body }) => ({ title, body })),
    seed.steps.length ? seed.steps : baseCards
  );
  const thinSource = isThinSource(parsed);

  const timelineCandidates = mergeNarratives(
    rankedNarratives
      .filter((item) => item.year !== null)
      .map(({ title, body, year }) => ({
        title: String(year),
        body,
      }))
      .slice(0, 4),
    seed.cards.filter((item) => /\b(19|20)\d{2}\b/.test(item.title))
  );

  const phases = [
    { title: "Phase 1", body: baseSteps[0]?.body ?? summary },
    {
      title: "Phase 2",
      body: baseSteps[1]?.body ?? baseCards[1]?.body ?? summary,
    },
    {
      title: "Phase 3",
      body: baseSteps[2]?.body ?? baseCards[2]?.body ?? summary,
    },
    {
      title: "Phase 4",
      body: baseSteps[3]?.body ?? baseCards[3]?.body ?? summary,
    },
  ];

  const roadmap = mergeNarratives(
    seed.steps,
    baseSteps.length ? baseSteps : fallbackNarratives("Track", 4, summary)
  ).slice(0, 4);

  const ranking =
    baseMetrics.length >= 4
      ? baseMetrics.slice(0, 4)
      : [
          { value: "95", label: page.title },
          { value: "82", label: baseCards[0]?.title ?? "Primary opportunity" },
          { value: "71", label: baseCards[1]?.title ?? "Supporting enabler" },
          { value: "58", label: baseCards[2]?.title ?? "Longer-horizon move" },
        ];

  if (thinSource) {
    return {
      summary,
      metrics: baseMetrics.slice(0, 2),
      ranking: baseMetrics.slice(0, 2),
      cards: baseCards.slice(0, 3),
      flowSteps: baseSteps.slice(0, 3),
      timeline: timelineCandidates.slice(0, 3),
      phases: baseSteps.slice(0, 2).map((item, index) => ({
        title: `Phase ${index + 1}`,
        body: item.body,
      })),
      roadmap: baseSteps.slice(0, 3),
    };
  }

  return {
    summary,
    metrics: ensureMetricCount(
      baseMetrics.length > 0
        ? baseMetrics.slice(0, 4)
        : [
            {
              value: "Point 1",
              label: `Key point: ${sentenceTitle(summary, "Main takeaway")}`,
            },
          ],
      summary,
      "Point"
    ),
    ranking: ensureMetricCount(ranking.slice(0, 4), summary, "Rank"),
    cards: ensureNarrativeCount(
      baseCards.length > 0
        ? baseCards.slice(0, 4)
        : fallbackNarratives("Comparison", 4, summary),
      summary,
      "Comparison",
      "Add another comparison angle:"
    ),
    flowSteps: ensureNarrativeCount(
      baseSteps.length > 0
        ? baseSteps.slice(0, 4)
        : fallbackNarratives("Step", 4, summary),
      summary,
      "Step",
      "Continue the sequence with:",
      128
    ),
    timeline: ensureNarrativeCount(
      timelineCandidates.length > 0
        ? timelineCandidates.slice(0, 4)
        : [
            { title: "Stage 1", body: summary },
            { title: "Stage 2", body: baseSteps[0]?.body ?? summary },
            { title: "Stage 3", body: baseSteps[1]?.body ?? summary },
            { title: "Stage 4", body: baseSteps[2]?.body ?? summary },
          ],
      summary,
      "Stage",
      "Add another milestone:"
    ),
    phases: ensureNarrativeCount(
      phases,
      summary,
      "Phase",
      "Add another grouped phase:"
    ),
    roadmap: ensureNarrativeCount(
      roadmap.length > 0
        ? roadmap.slice(0, 4)
        : fallbackNarratives("Track", 4, summary),
      summary,
      "Track",
      "Add another execution track:",
      128
    ),
  };
}

function buildPageRole(index: number, total: number): StoryPageRole {
  if (total <= 1) {
    return "standalone-page";
  }

  if (index === 0) {
    return "opening-frame";
  }

  if (index === total - 1) {
    return "closing-synthesis";
  }

  if (index === 1) {
    return "evidence-layer";
  }

  if (index === total - 2) {
    return "decision-bridge";
  }

  return "middle-chapter";
}

function buildDeckPlan(
  pages: LayoutPage[],
  parsed: ParsedSource,
  templateId: TemplateId
): PageGenerationContext[] {
  const seededPages = pages.map((page, index) => {
    const plan = buildPagePlan(page, parsed, templateId);
    const blockIntentSummary = page.blocks
      .map((block) => normalizeDraftText(block.intent ?? ""))
      .filter(Boolean)
      .slice(0, 3)
      .join(" ");
    const pageInstruction = normalizeDraftText(page.instruction ?? "");
    return {
      page,
      plan,
      pageRole: buildPageRole(index, pages.length),
      pageIntent:
        pageInstruction ||
        blockIntentSummary ||
        normalizeDraftText(page.note) ||
        normalizeDraftText(page.title) ||
        normalizeDraftText(plan.summary) ||
        "Present the page argument clearly.",
    };
  });

  return seededPages.map((entry, index) => {
    const previousEntry = seededPages[index - 1];
    const nextEntry = seededPages[index + 1];
    const nextPageBridge =
      pages.length <= 1
        ? ""
        : nextEntry
      ? `Use this page to set up ${
          normalizeDraftText(nextEntry.page.title) ||
          `page ${nextEntry.page.id}`
        }.`
      : "Close the deck by consolidating the main implication and recommended action.";

    return {
      page: entry.page,
      plan: entry.plan,
      deckPlan: {
        pageId: entry.page.id,
        pageRole: entry.pageRole,
        pageIntent: entry.pageIntent,
        pageStory: entry.plan.summary,
        previousPageSummary: previousEntry?.plan.summary ?? "",
        nextPageBridge,
      },
    };
  });
}

function summarizeEvidenceNeeded(context: PageGenerationContext) {
  return uniqueBy(
    [
      ...context.plan.metrics.slice(0, 2).map((item) => item.label),
      ...context.plan.cards.slice(0, 2).map((item) => item.title),
      ...context.plan.timeline.slice(0, 1).map((item) => item.title),
      ...context.plan.phases.slice(0, 1).map((item) => item.title),
    ]
      .map((item) => normalizeDraftText(item))
      .filter((item) => item && !isPlaceholderPlanningText(item)),
    (item) => item,
  ).slice(0, 4);
}

function summarizeSupportingPoints(context: PageGenerationContext) {
  return uniqueBy(
    [
      ...context.plan.cards.slice(0, 3).map((item) => normalizeDraftText(item.title || item.body)),
      ...context.plan.flowSteps
        .slice(0, 2)
        .map((item) => normalizeDraftText(item.body || item.title)),
      normalizeDraftText(context.deckPlan.pageIntent),
    ].filter((item) => item && !isPlaceholderPlanningText(item)),
    (item) => item,
  ).slice(0, 5);
}

function summarizeEvidenceNotes(context: PageGenerationContext) {
  return uniqueBy(
    [
      ...context.plan.metrics
        .slice(0, 3)
        .map((item) => normalizeDraftText([item.value, item.label].filter(Boolean).join(": "))),
      ...context.plan.cards
        .slice(0, 2)
        .map((item) => normalizeDraftText(item.body || item.title)),
    ].filter((item) => item && !isPlaceholderPlanningText(item)),
    (item) => item,
  ).slice(0, 5);
}

function recommendedVisualTypesForPage(context: PageGenerationContext): BlockKind[] {
  const combined = normalizeDraftText(
    [
      context.deckPlan.pageRole,
      context.deckPlan.pageIntent,
      context.deckPlan.pageStory,
      context.page.title,
      context.page.note,
    ].join(" "),
  ).toLowerCase();

  if (/timeline|sequence|phase|roadmap|execution|step/.test(combined)) {
    return ["phases", "flow"];
  }
  if (/compare|comparison|trade-off|decision|option/.test(combined)) {
    return ["matrix", "bars"];
  }
  if (/evidence|signal|proof|diagnosis|ranking/.test(combined)) {
    return ["metrics", "bars"];
  }
  return ["phases", "metrics"];
}

function toEditableContentItems(
  items: Array<MetricFact | NarrativeItem>,
  regionId: string,
): EditableContentItem[] {
  return items.slice(0, 4).map((item, index) =>
    "value" in item
      ? {
          id: `${regionId}.metric.${index + 1}`,
          kind: "metric",
          label: item.label,
          value: item.value,
        }
      : {
          id: `${regionId}.narrative.${index + 1}`,
          kind: "narrative",
          title: item.title,
          body: item.body,
        },
  );
}

function buildStoryPagePlan(
  context: PageGenerationContext,
  pageIndex: number,
): StoryPagePlan {
  return {
    pageId: clampGenerationText(context.page.id, 40),
    pageIndex,
    chapter: clampGenerationText(context.page.chapter, 80),
    title: clampGenerationText(context.page.title, 180),
    pageRole: clampGenerationText(context.deckPlan.pageRole, 80) as StoryPageRole,
    objective: clampGenerationText(context.deckPlan.pageIntent, 240),
    keyClaim: clampGenerationText(context.deckPlan.pageStory, 320),
    supportingPoints: summarizeSupportingPoints(context)
      .map((item) => clampGenerationText(item, 220))
      .filter(Boolean)
      .slice(0, 6),
    evidenceNeeded: summarizeEvidenceNeeded(context)
      .map((item) => clampGenerationText(item, 220))
      .filter(Boolean)
      .slice(0, 6),
    evidenceNotes: summarizeEvidenceNotes(context)
      .map((item) => clampGenerationText(item, 220))
      .filter(Boolean)
      .slice(0, 6),
    transitionFromPrevious: clampGenerationText(context.deckPlan.previousPageSummary, 320),
    bridgeToNext: clampGenerationText(context.deckPlan.nextPageBridge, 320),
  };
}

function buildEditableFields(
  spec: Pick<EditableSlideSpec, "pageId" | "contentRegions" | "moduleConfigs">,
): EditableField[] {
  const fields: EditableField[] = [
    {
      id: `${spec.pageId}.title`,
      label: "Slide title",
      kind: "title",
      path: `slides.${spec.pageId}.title`,
    },
    {
      id: `${spec.pageId}.subtitle`,
      label: "Slide subtitle",
      kind: "subtitle",
      path: `slides.${spec.pageId}.subtitle`,
    },
  ];

  spec.contentRegions.forEach((region, regionIndex) => {
    fields.push({
      id: `${region.id}.summary`,
      label: `${region.title} summary`,
      kind: "summary",
      path: `slides.${spec.pageId}.regions.${regionIndex}.summary`,
      regionId: region.id,
      blockId: region.blockId,
    });
    fields.push({
      id: `${region.id}.visualType`,
      label: `${region.title} visual type`,
      kind: "chart-type",
      path: `slides.${spec.pageId}.regions.${regionIndex}.visualType`,
      regionId: region.id,
      blockId: region.blockId,
    });
    region.items.forEach((item, itemIndex) => {
      fields.push({
        id: item.id,
        label: item.kind === "metric" ? item.label : item.title,
        kind: item.kind,
        path: `slides.${spec.pageId}.regions.${regionIndex}.items.${itemIndex}`,
        regionId: region.id,
        blockId: region.blockId,
      });
    });
  });

  spec.moduleConfigs.forEach((config, configIndex) => {
    fields.push({
      id: `${config.blockId}.module`,
      label: `Module for ${config.blockId}`,
      kind: "module",
      path: `slides.${spec.pageId}.moduleConfigs.${configIndex}.moduleId`,
      blockId: config.blockId,
    });
  });

  fields.push({
    id: `${spec.pageId}.palette`,
    label: "Palette",
    kind: "palette",
    path: `slides.${spec.pageId}.styleTokens.palette`,
  });
  fields.push({
    id: `${spec.pageId}.tone`,
    label: "Tone",
    kind: "tone",
    path: `slides.${spec.pageId}.styleTokens.tone`,
  });

  return fields;
}

function narrativeItemsFromTextList(texts: string[], labelPrefix: string): NarrativeItem[] {
  return texts
    .filter(Boolean)
    .slice(0, 4)
    .map((text, index) => ({
      title: `${labelPrefix} ${index + 1}`,
      body: normalizeDraftText(text),
    }));
}

function toneForVisualType(visualType: BlockKind) {
  if (visualType === "matrix" || visualType === "bars" || visualType === "line" || visualType === "gantt") {
    return "navy" as const;
  }
  if (visualType === "phases") {
    return "amber" as const;
  }
  return "teal" as const;
}

function buildEditableSlideSpec(
  context: PageGenerationContext,
  templateId: TemplateId,
  pageIndex: number,
): EditableSlideSpec {
  const storyPlan = context.page.storyPagePlan;
  const recommendedVisualTypes = recommendedVisualTypesForPage(context);
  const primaryVisualType = recommendedVisualTypes[0] ?? "phases";
  const secondaryVisualType = recommendedVisualTypes[1] ?? primaryVisualType;
  const evidenceSummary = normalizeDraftText(
    storyPlan?.evidenceNotes.join("; ") ||
      storyPlan?.evidenceNeeded.join("; ") ||
      summarizeEvidenceNeeded(context).join("; ") ||
      context.deckPlan.pageIntent,
  );
  const supportingItems = narrativeItemsFromTextList(
    storyPlan?.supportingPoints.length
      ? storyPlan.supportingPoints
      : [storyPlan?.keyClaim || context.deckPlan.pageStory],
    "Point",
  );
  const evidenceItems = narrativeItemsFromTextList(
    storyPlan?.evidenceNotes.length
      ? storyPlan.evidenceNotes
      : storyPlan?.evidenceNeeded.length
        ? storyPlan.evidenceNeeded
        : summarizeEvidenceNotes(context),
    "Evidence",
  );
  const takeawayItems = narrativeItemsFromTextList(
    [storyPlan?.bridgeToNext || context.deckPlan.nextPageBridge].filter(Boolean),
    "Takeaway",
  );

  const contentRegions = [
    {
      id: `${context.page.id}.claim`,
      role: "visual" as SlideContentRegionRole,
      title: "Main claim",
      summary: normalizeDraftText(storyPlan?.keyClaim || context.deckPlan.pageStory),
      visualType: primaryVisualType,
      items: toEditableContentItems(supportingItems, `${context.page.id}.claim`),
    },
    {
      id: `${context.page.id}.evidence`,
      role: "supporting-evidence" as SlideContentRegionRole,
      title: "Evidence",
      summary: evidenceSummary,
      visualType: secondaryVisualType,
      items: toEditableContentItems(evidenceItems, `${context.page.id}.evidence`),
    },
    {
      id: `${context.page.id}.takeaway`,
      role: "takeaway" as SlideContentRegionRole,
      title: "Takeaway",
      summary: normalizeDraftText(storyPlan?.bridgeToNext || context.deckPlan.nextPageBridge),
      visualType: secondaryVisualType,
      items: toEditableContentItems(takeawayItems, `${context.page.id}.takeaway`),
    },
  ] satisfies SlideContentRegion[];
  const populatedContentRegions = contentRegions.filter(
    (region) => region.summary || region.items.length > 0,
  );

  const spec: EditableSlideSpec = {
    pageId: context.page.id,
    pageIndex,
    chapter: context.page.chapter,
    title: context.page.title,
    subtitle: context.page.note,
    pageRole: context.deckPlan.pageRole as StoryPageRole,
    storyIntent: context.deckPlan.pageStory,
    visualIntent: context.deckPlan.pageIntent,
    visualType: primaryVisualType,
    moduleConfigs: [],
    contentRegions: populatedContentRegions,
    densityBudget: {
      maxVisualLabels: 8,
      maxNarrativeItemsPerRegion: 4,
      maxBulletsPerRegion: 4,
      maxWordsPerItem: 18,
    },
    styleTokens: {
      tone: toneForVisualType(primaryVisualType),
      palette: `${templateId}-${toneForVisualType(primaryVisualType)}`,
    },
    editableFields: [],
  };

  spec.editableFields = buildEditableFields(spec);
  return spec;
}

function buildSkillPlanningArtifactsFromPages(
  sourceText: string,
  pages: LayoutPage[],
  templateId: TemplateId,
) {
  const parsed = parseSource(sourceText);
  const contexts = buildDeckPlan(pages, parsed, templateId);
  const totalPages = pages.length;
  const storyPagePlans = contexts.map((context, index) =>
    sanitizeStoryPagePlanContent(
      context.page.storyPagePlan ?? buildStoryPagePlan(context, index),
      context.page,
      totalPages,
    ),
  );
  const pagesWithStoryPlans = pages.map((page, index) => ({
    ...page,
    storyPagePlan:
      storyPagePlans.find((plan) => plan.pageId === page.id) ?? storyPagePlans[index],
    blocks: page.blocks.map((block) => ({ ...block })),
  }));
  return {
    parsed,
    contexts,
    pagesWithStoryPlans,
    storyPagePlans,
    editableSlideSpecs: contexts.map((context, index) =>
      buildEditableSlideSpec(context, templateId, index),
    ),
  };
}

export function buildSkillPlanningArtifacts(
  sourceText: string,
  pages: LayoutPage[],
  templateId: TemplateId = DEFAULT_TEMPLATE_ID,
) {
  const basePages = pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block) => ({ ...block })),
  }));
  const artifacts = buildSkillPlanningArtifactsFromPages(sourceText, basePages, templateId);
  return {
    plannedPages: artifacts.pagesWithStoryPlans,
    ...artifacts,
  };
}

export function buildLayoutPlaceholderDraft(args: {
  title: string;
  subtitle: string;
  pages: LayoutPage[];
}): WorkbenchDraft {
  const pageDrafts = new Map<string, PageDraft>();

  args.pages.forEach((page) => {
    const pageSummary =
      normalizeDraftText(page.note) ||
      normalizeDraftText(page.title) ||
      args.subtitle;
    const pageDraft: PageDraft = {
      summary: pageSummary,
      blocks: {},
    };
    pageDrafts.set(page.id, pageDraft);
  });

  return {
    title: normalizeDraftText(args.title) || "Untitled report",
    subtitle:
      normalizeDraftText(args.subtitle) ||
      "Brief captured. Generate the report when you are ready.",
    pageDrafts,
    provider: "local",
  };
}

export async function generateHtmlReport(
  sourceText: string,
  aiSettings?: WorkbenchAiSettings,
  intent?: GenerationRequestIntent,
  signal?: AbortSignal,
): Promise<HtmlReportGenerationResult> {
  const briefText = buildReportSourceInput({ sourceText }).briefText;
  const payload = createGenerationRequestPayload(briefText, aiSettings, intent);
  const response = await requestModelHtmlReport(payload, signal);

  if (!response.htmlReport) {
    return {
      pages: [],
      draft: buildLayoutPlaceholderDraft({
        title: "HTML report unavailable",
        subtitle: "Codex could not generate the report this time.",
        pages: [],
      }),
      provider: "local",
      model: null,
      reason: response.reason,
    };
  }

  const pages = createHtmlReportPages(response.htmlReport, briefText);
  const draft = buildLayoutPlaceholderDraft({
    title: response.htmlReport.title,
    subtitle: "Generated from Codex HTML report.",
    pages,
  });

  return {
    pages,
    draft: {
      ...draft,
      provider: "model",
    },
    provider: "model",
    model: response.model,
    htmlReport: response.htmlReport,
  };
}

function createGenerationPageInput(
  sourceText: string,
  context: PageGenerationContext,
  storyPagePlan: StoryPagePlan,
  thinkingMode: DeckThinkingMode,
): GenerationPageInput {
  const keyClaim =
    normalizeDraftText(storyPagePlan.keyClaim) ||
    normalizeDraftText(storyPagePlan.objective) ||
    normalizeDraftText(context.page.note) ||
    normalizeDraftText(context.page.title);

  const plan: GenerationDesignPlan = {
    pageRole: storyPagePlan.pageRole,
    objective: storyPagePlan.objective,
    keyClaim,
    supportingPoints: storyPagePlan.supportingPoints,
    evidenceNotes:
      storyPagePlan.evidenceNotes.length > 0
        ? storyPagePlan.evidenceNotes
        : storyPagePlan.evidenceNeeded,
    transitionFromPrevious: storyPagePlan.transitionFromPrevious,
    bridgeToNext: storyPagePlan.bridgeToNext,
  };
  const analysisSkill = resolveGenerationAnalysisSkill({
    sourceText,
    pageTitle: context.page.title,
    pageNote: context.page.note,
    plan,
    thinkingMode,
  });
  const pageArchetype = resolveGenerationPageArchetype({
    sourceText,
    pageTitle: context.page.title,
    pageNote: context.page.note,
    plan,
    analysisSkill,
    thinkingMode,
  });

  return {
    id: context.page.id,
    chapter: context.page.chapter,
    title: context.page.title,
    note: context.page.note,
    analysisSkill,
    pageArchetype,
    templateSkill: resolveGenerationTemplateSkill({
      sourceText,
      pageTitle: context.page.title,
      pageNote: context.page.note,
      plan,
      analysisSkill,
      pageArchetype,
    }),
    plan,
  };
}

function composeLocalPageDraft(
  context: PageGenerationContext,
  storyPagePlan: StoryPagePlan,
): PageDraft {
  const pageDraft: PageDraft = {
    summary: storyPagePlan.keyClaim || context.deckPlan.pageStory,
    blocks: {},
  };
  const pageWithPlan: LayoutPage = {
    ...context.page,
    storyPagePlan,
    blocks: context.page.blocks.map((block) => ({ ...block })),
  };

  return {
    ...pageDraft,
    scene: buildFallbackPageScene({
      page: pageWithPlan,
      pageDraft,
    }),
  };
}

function buildLocalDraftFromContexts(
  parsed: ParsedSource,
  contexts: PageGenerationContext[],
  storyPagePlans: StoryPagePlan[],
): WorkbenchDraft {
  const pageDrafts = new Map<string, PageDraft>();
  const pagePlansById = new Map(storyPagePlans.map((plan) => [plan.pageId, plan] as const));

  contexts.forEach((context) => {
    pageDrafts.set(
      context.page.id,
      composeLocalPageDraft(
        context,
        pagePlansById.get(context.page.id) ?? buildStoryPagePlan(context, 0),
      ),
    );
  });

  return {
    title: parsed.title,
    subtitle: parsed.subtitle,
    pageDrafts,
    provider: "local",
  };
}

function pickOutlineTitle(
  page: LayoutPage,
  parsed: ParsedSource,
  summary: string,
  pageIndex: number
) {
  const section = parsed.sections[pageIndex];
  const sectionHeading =
    section && !/^Section\s+\d+$/i.test(section.heading)
      ? section.heading
      : null;
  return sectionHeading || sentenceTitle(summary, page.title);
}

function buildOutlinedPages(
  sourceText: string,
  pages: LayoutPage[],
  templateId: TemplateId = DEFAULT_TEMPLATE_ID
) {
  const parsed = parseSource(sourceText);
  const basePages = pages.length > 0 ? pages : createOutlineSeedPages(parsed, sourceText);
  const nextPages = basePages.map((page, index) => {
    const plan = buildPagePlan(page, parsed, templateId);
    const title = pickOutlineTitle(page, parsed, plan.summary, index);
    return {
      ...page,
      chapter: `Chapter ${index + 1}`,
      title,
      note: plan.summary,
      blocks: page.blocks.map((block) => ({ ...block })),
    };
  });

  return {
    title: normalizeDraftText(parsed.title) || "Untitled report",
    subtitle:
      normalizeDraftText(parsed.subtitle) ||
      "Brief captured. Generate the report when you are ready.",
    pages: nextPages,
  };
}

function applyStoryPagePlansToPages(
  pages: LayoutPage[],
  storyPagePlans: StoryPagePlan[],
) {
  const totalPages = pages.length;
  return pages.map((page, index) => ({
    ...page,
    storyPagePlan: sanitizeStoryPagePlanContent(
      storyPagePlans.find((plan) => plan.pageId === page.id) ?? storyPagePlans[index],
      page,
      totalPages,
    ),
    blocks: page.blocks.map((block) => ({ ...block })),
  }));
}

export function buildLocalOutline(
  sourceText: string,
  pages: LayoutPage[],
  templateId: TemplateId = DEFAULT_TEMPLATE_ID
): OutlineGenerationResult {
  const outline = buildOutlinedPages(sourceText, pages, templateId);
  const planning = buildSkillPlanningArtifactsFromPages(sourceText, outline.pages, templateId);
  const plannedPages = applyStoryPagePlansToPages(outline.pages, planning.storyPagePlans);
  return {
    pages: plannedPages,
    draft: buildLayoutPlaceholderDraft({
      title: outline.title,
      subtitle: outline.subtitle,
      pages: plannedPages,
    }),
    provider: "local",
    model: null,
    storyPagePlans: planning.storyPagePlans,
    editableSlideSpecs: planning.editableSlideSpecs,
  };
}

export function buildLocalDraft(
  sourceText: string,
  pages: LayoutPage[],
  templateId: TemplateId = DEFAULT_TEMPLATE_ID
): WorkbenchDraft {
  const planning = buildSkillPlanningArtifacts(sourceText, pages, templateId);
  return buildLocalDraftFromContexts(
    planning.parsed,
    planning.contexts,
    planning.storyPagePlans,
  );
}

export {
  canReuseGeneratedDraft,
  createGeneratedDraftAsset,
  hydrateDraftAsset,
  serializeDraft,
} from "./generation-assets";
