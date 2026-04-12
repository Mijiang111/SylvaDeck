import { createHash } from "node:crypto";
import {
  buildDeckStylePromptLines,
  resolveDeckStyleProfile,
  toGeneratedReportStyleProfile,
  type DeckStyleProfile,
} from "../industry-style.js";
import { logger } from "../../middleware/logger.js";
import {
  LONG_FORM_REVIEW_BUDGET,
} from "./contracts.js";
import type {
  ChartPageIntent,
  ChartSpec,
  ComparisonSet,
  CompositeChartSpec,
  DeckThinkingMode,
  DeckCompositionBrief,
  DeckCompositionDiversityReport,
  DeckPressureBudget,
  DeckPlan,
  EvidenceGraph,
  EvidenceNode,
  FactTable,
  FreeformLayoutPlan,
  GeneratedReportStyleProfile,
  GenerationFallbackReason,
  GenerateStudioReportRequest,
  DeckHeroArtDirection,
  HeroAnnotationMode,
  HeroCompositionFamily,
  HeroModelIntent,
  HeroObjectFamily,
  LongFormEvidenceBundle,
  LongFormPageClass,
  LongFormSectionSummary,
  LoadedStudioAnalysisSkill,
  LoadedStudioLayoutRepairSkill,
  LoadedStudio3dHeroSkill,
  LoadedStudioThinkingModeSkill,
  PageCompositionFingerprint,
  PageContextBundle,
  PageDensityBudget,
  PageRecipe,
  PageRecipePlan,
  PageRepairProfile,
  PublishedModuleManifest,
  RepairContextBundle,
  ResolvedThinkingContext,
  StudioComplexityProfile,
  Studio3dHeroReferenceName,
  StudioBriefSynthesis,
  StudioEvalOverrides,
  StudioGenerateStreamEvent,
  StudioPreflightPlan,
  StudioStageTraceEntry,
  StudioWorkingMemory,
  ReviseStudioReportRequest,
  SeriesTable,
  TimelineSet,
  V2RecipePlanPage,
} from "./contracts.js";
import { deckPlanSchema, pageRecipePlanSchema } from "./schemas.js";
import type {
  GenerationMode,
  ModuleChartKind,
  ModuleUsageMode,
  PageFitMeasurement,
  PageOverflowCause,
  RepairMode,
} from "./schemas.js";
import {
  executeStudioStage,
  type StudioAgentConfig,
} from "./agent.js";
import {
  loadStudio3dHeroSkill,
  loadStudioAnalysisSkill,
  loadStudioLayoutRepairSkill,
  loadStudioThinkingModeSkill,
  extractMarkdownSection,
} from "./skills.js";
import { resolveDeckThinkingMode } from "./thinking-mode.js";
import {
  assessGeneratedTitleQuality,
  clampText,
  chunkBriefBlock,
  compactBoardTitle,
  compactBriefForGeneration,
  deriveEvidenceTitle,
  deriveSpecificStudioTitle,
  inferUnitFromText,
  isInstructionalBriefLine,
  normalizeStudioText,
  normalizeMultilineStudioText,
  parseNumericValue,
  sentenceTitle,
  sha1,
  splitBriefLines,
  splitBriefSentences,
  stripInstructionalLead,
  uniqueStrings,
} from "./brief.js";
import {
  buildSanitizedFinalReport,
  composeDeckHtml,
  composeDeterministicPageSection,
  composeSinglePageHtml,
  countPages,
  escapeHtml,
  extractDeckSections,
  extractDocumentTitle,
  extractHtmlDocument,
  extractJsonDocument,
  extractPageTitles,
  extractSinglePageSection,
  extractTextBeforeHtml,
  extractTextBeforeJson,
  replaceDocumentTitle,
  validateGeneratedPageHtml,
} from "./render.js";
import {
  applyDeterministicShrink,
  formatMeasurementElements,
  formatTextMeasurementsForPrompt,
  measurementNeedsRepair,
  sanitizeRepairTitle,
  summarizeDeckCompositionDiversityForPrompt,
  summarizeMeasurementIssues,
} from "./repair.js";
import {
  buildStudioAiWorkspace,
  createStudioCapabilityCard,
  createThinkingModeCapabilityCard,
  getStudioAiWorkspacePromptMeta,
  rememberStudioAiWorkspacePromptMeta,
  renderStudioAiWorkspace,
  selectStudioTemplateWorkspaceManifests,
} from "./workspace.js";
import {
  buildBriefSynthesisTraceMeta,
  buildRendererBriefLines,
  buildStudioBriefSynthesis,
  refinePageRecipeIntentWithSynthesis,
} from "./brief-synthesis.js";
import {
  resolveFreeformLayoutPlan,
} from "./freeform-layout.js";
import {
  buildComplexityTraceMeta,
  buildLayoutStrategyLines,
  buildProofPlanLines,
  buildTaskGrammarCardLines,
  buildTaskRigorBriefLines,
  resolveStudioComplexityProfile,
} from "./complexity.js";
import {
  buildStudioEvalTraceMeta,
  resolveStudioGenerationPreparation,
} from "./eval.js";
import {
  buildStudioWorkingMemory,
} from "./working-memory.js";
import {
  buildFallbackStudioPreflightPlan,
  buildPreflightCapabilityCards,
  buildPreflightEvidenceInput,
  buildStudioPreflightPrompt,
  buildVisualThinkingLines,
  createRawBriefThinkingInputs,
  findStudioPageMission,
  mergeStudioPreflightIntoBriefSynthesis,
  parseStudioPreflightPlan,
} from "./preflight.js";

const evidenceGraphCache = new Map<string, EvidenceGraph>();
const publishedModuleManifestCache = new Map<string, PublishedModuleManifest[]>();

async function runStudioPreflightStage(args: {
  brief: string;
  requestedPageCount?: number | null;
  agentConfig: StudioAgentConfig;
  runId: string;
  signal?: AbortSignal;
  emit?: (event: StudioGenerateStreamEvent) => Promise<void>;
  onStageTrace?: (entry: StudioStageTraceEntry) => Promise<void> | void;
}): Promise<StudioPreflightPlan> {
  const emit = args.emit ?? (async () => {});
  await emit({
    type: "stage_started",
    runId: args.runId,
    stage: "preflight",
    label: "Understanding the raw brief",
  });
  const prompt = buildStudioPreflightPrompt({
    brief: args.brief,
    requestedPageCount: args.requestedPageCount,
  });
  const preflightResult = await executeStudioStage({
    runId: args.runId,
    stage: "preflight",
    prompt,
    payload: {
      brief: args.brief,
      pageCount: args.requestedPageCount ?? null,
    },
    agentConfig: args.agentConfig,
    assistantTextParser: extractTextBeforeJson,
    onAssistantChunk: async (content) => {
      if (!content.trim()) {
        return;
      }
      await emit({
        type: "assistant_chunk",
        runId: args.runId,
        stage: "preflight",
        content,
      });
    },
    onStageTrace: args.onStageTrace,
    signal: args.signal,
  });
  const preflight = parseStudioPreflightPlan({
    text: preflightResult.summary,
    brief: args.brief,
    requestedPageCount: args.requestedPageCount,
  });
  await emit({
    type: "assistant_chunk",
    runId: args.runId,
    stage: "preflight",
    content: `Preflight understood the request as ${preflight.deliverable} about ${preflight.subject}${preflight.audienceOrQualityBar ? ` for ${preflight.audienceOrQualityBar}` : ""}, with ${preflight.evidencePolicy.tier} evidence handling.`,
  });
  return preflight;
}

function applyPreflightToDeckPlan(args: {
  pages: Array<{ pageNumber: number; pageTitle: string; goal: string; story: string }>;
  preflight: StudioPreflightPlan;
}) {
  return args.pages.map((page, index) => {
    const mission =
      args.preflight.pageMissions.find((entry) => entry.pageNumber === page.pageNumber) ??
      args.preflight.pageMissions[index] ??
      null;
    if (!mission) {
      return page;
    }
    return {
      ...page,
      pageTitle: mission.title || page.pageTitle,
      goal: mission.mission || page.goal,
      story: mission.headlineClaim || page.story,
    };
  });
}

function applyPreflightToRecipePlan(args: {
  pages: PageRecipePlan["pages"];
  preflight: StudioPreflightPlan;
}) {
  return args.pages.map((page, index) => {
    const mission =
      args.preflight.pageMissions.find((entry) => entry.pageNumber === page.pageNumber) ??
      args.preflight.pageMissions[index] ??
      null;
    if (!mission) {
      return page;
    }
    return {
      ...page,
      pageTitle: mission.title || page.pageTitle,
      objective: mission.mission || page.objective,
      insight: mission.headlineClaim || page.insight,
      compositionHint: mission.preferredVisual
        ? `Prefer ${mission.preferredVisual} while keeping one dominant page mission.`
        : page.compositionHint,
    };
  });
}

export function buildSkillBackedPlanningPrompt(args: {
  payload: GenerateStudioReportRequest;
  skill: LoadedStudioAnalysisSkill;
  styleProfile: DeckStyleProfile;
  heroSkill: LoadedStudio3dHeroSkill;
  thinkingContext: ResolvedThinkingContext;
  thinkingSkill?: LoadedStudioThinkingModeSkill | null;
  briefSynthesis?: StudioBriefSynthesis;
  complexityProfile?: StudioComplexityProfile;
  evalOverrides?: StudioEvalOverrides | null;
}) {
  const payload = args.payload;
  const complexityProfile =
    args.complexityProfile ??
    resolveStudioComplexityProfile({
      brief: payload.brief,
      inputs: args.thinkingContext.inputs,
    });
  const isLongForm = isLongFormGenerationRequest(payload);
  const briefDigest = buildBriefDigestForPrompt({
    brief: payload.brief,
    synthesis: args.briefSynthesis,
    maxItems: 8,
  });
  const heroPageOpportunity = hasExplicitHeroModelRequest(payload.brief);
  const heroPlanningIntent = heroPageOpportunity
    ? ({
        enabled: true,
        objectFocus: compactBoardTitle(payload.brief, "Core system", 8),
        objectFamily: resolveHeroObjectFamily(payload.brief),
        recommendedCompositionFamily: resolveHeroCompositionFamily({
          objectFamily: resolveHeroObjectFamily(payload.brief),
          text: payload.brief,
          pageClass: "opening-core",
        }),
        materialHints: resolveHeroMaterialHints(resolveHeroObjectFamily(payload.brief)),
        annotationMode: resolveHeroAnnotationMode(resolveHeroObjectFamily(payload.brief)),
        narrativeBudget: [],
        reason: "brief explicitly requests one 3D concept page",
      } satisfies HeroModelIntent)
    : null;
  const heroPlanningContext =
    heroPlanningIntent && heroPlanningIntent.enabled
      ? buildHeroReferenceContext({
          skill: args.heroSkill,
          intent: heroPlanningIntent,
          stage: "planning",
        })
      : { lines: [], referenceFiles: [] };
  const pageCountInstruction = payload.pageCount
    ? `Return exactly ${payload.pageCount} pages.`
    : isLongForm
      ? "Return a long-form deck between 10 and 12 pages."
      : "Choose the smallest page count that tells the story clearly, usually between 2 and 5 pages.";
  const layoutPlanningDisabled = args.evalOverrides?.disableLayoutPlanningBlock === true;
  const capabilityCards = [
    createThinkingModeCapabilityCard({
      thinkingContext: args.thinkingContext,
      thinkingSkill: args.thinkingSkill,
      stage: "planning",
    }),
    createStudioCapabilityCard({
      id: "analysis",
      title: "Analysis",
      body: args.skill.body,
      maxLines: 5,
    }),
    createStudioCapabilityCard({
      id: "style-direction",
      title: "Style direction",
      lines: buildDeckStylePromptLines(args.styleProfile),
      maxLines: 5,
    }),
    ...(complexityProfile.taskGrammarPacks.length > 0
      ? [
          createStudioCapabilityCard({
            id: "task-grammar",
            title: "Task grammar",
            lines: buildTaskGrammarCardLines(complexityProfile),
            maxLines: 6,
          }),
        ]
      : []),
    ...(heroPageOpportunity
      ? [
          createStudioCapabilityCard({
            id: "explicit-3d",
            title: "Explicit 3D",
            body: args.heroSkill.body,
            fallbackLines: heroPlanningContext.lines,
            maxLines: 5,
          }),
        ]
      : []),
  ];
  const workspace = buildStudioAiWorkspace({
    stage: "planning",
    thinkingContext: args.thinkingContext,
    workloadLane: complexityProfile.workloadLane,
    rigorLevel: complexityProfile.rigorLevel,
    taskGrammarPackIds: complexityProfile.taskGrammarPacks.map((pack) => pack.id),
    requestedPageCount: payload.pageCount ?? null,
    generationMode: payload.generationMode,
    sourceMaxItems: 4,
    taskRigorLines: buildTaskRigorBriefLines({
      profile: complexityProfile,
      subject: args.briefSynthesis?.subject ?? compactBoardTitle(payload.brief, "Brief focus", 8),
    }),
    rendererBriefLines: args.briefSynthesis
      ? [
          `User wants: ${args.briefSynthesis.taskGoal}`,
          `Subject: ${args.briefSynthesis.subject}`,
          `Deliverable: ${args.briefSynthesis.deliverable}`,
          `Workload lane: ${args.briefSynthesis.workloadLane}`,
          `Rigor target: ${args.briefSynthesis.rigorLevel}`,
          `Content confidence: ${args.briefSynthesis.contentConfidence}`,
          `Evidence source: ${args.briefSynthesis.evidenceSourceUsed}`,
          ...args.briefSynthesis.safeKnowledgePolicy.slice(0, 2),
        ]
      : [],
    proofPlanLines: buildProofPlanLines({
      profile: complexityProfile,
      subject: args.briefSynthesis?.subject ?? compactBoardTitle(payload.brief, "Brief focus", 8),
      stage: "planning",
    }),
    layoutStrategyLines: layoutPlanningDisabled
      ? []
      : buildLayoutStrategyLines({
          profile: complexityProfile,
          subject: args.briefSynthesis?.subject ?? compactBoardTitle(payload.brief, "Brief focus", 8),
        }),
    pageIntentLines: [
      pageCountInstruction,
      ...(isLongForm
        ? [
            "Use opening-core pages first, then proof-analysis pages, then synthesis-support pages.",
            ...args.thinkingContext.plugin.longFormSequencingLines,
          ]
        : []),
      "Number pages sequentially from 1 and keep the map concise.",
      "Keep page titles editorial, professional, and mode-appropriate.",
      "Every page must answer one page question and land one clear claim.",
      "Goals should state the single thing the page must prove.",
      "Stories should explain the page role in one sentence without adding a second argument.",
      "Do not merge summary, implications, and next steps into one page objective.",
      "Let later page rendering choose the composition; do not lock every page into the same structure.",
      ...(heroPageOpportunity
        ? [
            "Reserve at most one early page as a dominant 3D concept page.",
            "That concept page should explain the object itself, not a chart or trailing support page.",
          ]
        : []),
      "Do not invent unsupported numeric evidence.",
      "Brief digest:",
      ...briefDigest,
    ],
    templateManifests: [],
    capabilityCards,
    outputRules: [
      "First, write one short planning note.",
      "Then output one ```json block with this exact shape:",
      '{ "title": string, "pages": [{ "pageNumber": number, "pageTitle": string, "goal": string, "story": string }] }',
    ],
  });
  const renderedWorkspace = renderStudioAiWorkspace(workspace);
  const prompt = [
    "You are Codex generating a page map for a professional HTML report deck.",
    "Use the AI workspace below in priority order; do not let planning heuristics override the user task.",
    "",
    renderedWorkspace.text,
  ].join("\n");
  rememberStudioAiWorkspacePromptMeta(prompt, renderedWorkspace.meta);
  return prompt;
}

function buildPageArgumentContract(args: {
  pageQuestion: string;
  questionLabel?: string;
  headlineClaim: string;
  supportBullets?: string[];
  evidenceCallouts?: string[];
  takeaway?: string | null;
  allowEvidenceException?: boolean;
}) {
  const supportBullets = args.supportBullets?.map((item) => clampText(item, 96)).slice(0, 2) ?? [];
  const evidenceCallouts = args.evidenceCallouts?.map((item) => clampText(item, 96)).slice(0, 2) ?? [];
  const takeaway = args.takeaway ? clampText(args.takeaway, 96) : null;

  return [
    "## Page argument contract",
    "- This page must answer exactly one page question and land one headline claim.",
    `- ${args.questionLabel ?? "Page question"}: ${clampText(args.pageQuestion, 140)}`,
    `- Headline claim: ${clampText(args.headlineClaim, 140)}`,
    `- Support bullets: ${supportBullets.length > 0 ? supportBullets.join(" | ") : "At most 2 short bullets if support is needed."}`,
    `- Evidence callouts: ${evidenceCallouts.length > 0 ? evidenceCallouts.join(" | ") : "At most 2 short callouts if evidence needs labels."}`,
    `- Takeaway: ${takeaway ?? "At most 1 short takeaway sentence."}`,
    "- Do not write a second thesis paragraph or create two equal-weight argument zones.",
    ...(args.allowEvidenceException
      ? ["- Because this is a comparison or chart page, multiple proof items are allowed only if they resolve to one verdict."]
      : ["- Do not turn the page into a same-weight card wall, memo stack, or dashboard grid."]),
  ];
}

export function buildPagePrompt(args: {
  brief: string;
  deckTitle: string;
  page: DeckPlan["pages"][number];
  allPages: DeckPlan["pages"];
  styleProfile: DeckStyleProfile;
  compositionBrief?: DeckCompositionBrief;
  usedCompositionFingerprints?: PageCompositionFingerprint[];
  heroSkill?: LoadedStudio3dHeroSkill;
  heroModelIntent?: HeroModelIntent;
  heroArtDirection?: DeckHeroArtDirection;
  heroReferenceLines?: string[];
  moduleOptions?: PublishedModuleManifest[];
  chartPageIntent?: ChartPageIntent;
  thinkingContext: ResolvedThinkingContext;
  thinkingSkill?: LoadedStudioThinkingModeSkill | null;
  briefSynthesis?: StudioBriefSynthesis;
  complexityProfile?: StudioComplexityProfile;
  freeformLayoutPlan?: FreeformLayoutPlan | null;
  evalOverrides?: StudioEvalOverrides | null;
  preflight?: StudioPreflightPlan | null;
  pageArgument?: {
    pageQuestion: string;
    headlineClaim: string;
    supportBullets?: string[];
    evidenceCallouts?: string[];
    takeaway?: string | null;
    allowEvidenceException?: boolean;
  };
}) {
  const complexityProfile =
    args.complexityProfile ??
    resolveStudioComplexityProfile({
      brief: args.brief,
      inputs: args.thinkingContext.inputs,
    });
  const workingMemory =
    args.briefSynthesis?.workingMemory ??
    buildStudioWorkingMemory({
      brief: args.brief,
      inputs: args.thinkingContext.inputs,
      requestedPageCount: args.allPages.length,
    });
  const preflight =
    args.preflight ??
    buildFallbackStudioPreflightPlan({
      brief: args.brief,
      requestedPageCount: args.allPages.length,
    });
  const pageArgumentBlock = buildPageArgumentContract({
    pageQuestion: args.pageArgument?.pageQuestion ?? args.page.goal,
    questionLabel: args.thinkingContext.plugin.questionLabel,
    headlineClaim: args.pageArgument?.headlineClaim ?? args.page.story ?? args.page.goal,
    supportBullets: args.pageArgument?.supportBullets,
    evidenceCallouts: args.pageArgument?.evidenceCallouts,
    takeaway: args.pageArgument?.takeaway ?? args.page.goal,
    allowEvidenceException: args.pageArgument?.allowEvidenceException ?? false,
  });
  const templateOptions = selectStudioTemplateWorkspaceManifests({
    moduleOptions: args.moduleOptions ?? [],
    heroModelIntent: args.heroModelIntent,
    chartKind: null,
  });
  const supportCount = args.pageArgument?.supportBullets?.length ?? 0;
  const evidenceCount = args.pageArgument?.evidenceCallouts?.length ?? 0;
  const layoutPlanningDisabled = args.evalOverrides?.disableLayoutPlanningBlock === true;
  const freeformLayoutPlan =
    layoutPlanningDisabled
      ? null
      : (args.freeformLayoutPlan ??
        resolveFreeformLayoutPlan({
          selectedTemplateCount: templateOptions.length,
          chartPageIntent: args.chartPageIntent,
          hasChartSpec: false,
          heroModelIntent: args.heroModelIntent,
          mode: args.thinkingContext.mode,
          pageNumber: args.page.pageNumber,
          pageCount: args.allPages.length,
          supportCount,
          evidenceCount,
          synthesis: args.briefSynthesis,
          complexityProfile,
          usedCompositionFingerprints: args.usedCompositionFingerprints,
        }));
  const compositionLines = args.compositionBrief
    ? [args.compositionBrief.motif, args.compositionBrief.rhythm, ...args.compositionBrief.guidance]
    : [
        "Choose the spatial organization that best fits the page argument.",
        "Vary dominant region placement and page rhythm across the deck.",
      ];
  const recentCompositionLines =
    args.usedCompositionFingerprints && args.usedCompositionFingerprints.length > 0
      ? [
          "Recent composition families already used:",
          ...args.usedCompositionFingerprints.map((fingerprint, index) =>
            `Prior page ${index + 1}: ${summarizeCompositionFingerprintForPrompt(fingerprint)}`,
          ),
          "Avoid repeating one of those families again unless the evidence absolutely demands it.",
        ]
      : [];
  const visualOperatorLines = buildPageVisualOperatorLines({
    templateOptions,
    chartPageIntent: args.chartPageIntent,
    heroModelIntent: args.heroModelIntent,
    freeformLayoutPlan,
  });
  const pageMission = findStudioPageMission({
    preflight,
    pageNumber: args.page.pageNumber,
    fallbackTitle: args.page.pageTitle,
    fallbackMission: args.pageArgument?.pageQuestion ?? args.page.goal,
  });
  const capabilityCards = buildPreflightCapabilityCards({
    preflight,
    baseCards: [
    createStudioCapabilityCard({
      id: "style-direction",
      title: "Style direction",
      lines: buildDeckStylePromptLines(args.styleProfile),
      maxLines: 4,
    }),
    ...(args.chartPageIntent?.enabled
      ? [
          createStudioCapabilityCard({
            id: "chart",
            title: "Chart",
            lines: [
              `Chart-first mode: ${args.chartPageIntent.reason}`,
              ...(args.chartPageIntent.question ? [`Question: ${args.chartPageIntent.question}`] : []),
              ...args.chartPageIntent.explanationBudget,
            ],
            maxLines: 4,
          }),
        ]
      : []),
    ...(templateOptions.length > 0
      ? [
          createStudioCapabilityCard({
            id: "template",
            title: "Template",
            lines: [
              `Primary template: ${templateOptions[0]?.label || templateOptions[0]?.moduleId}.`,
              "Respect the page shape, but hide optional areas when content is weak.",
              "Do not invent filler to satisfy the template.",
            ],
            maxLines: 4,
          }),
        ]
      : []),
    ...(args.heroModelIntent?.enabled && args.heroSkill
      ? [
          createStudioCapabilityCard({
            id: "explicit-3d",
            title: "Explicit 3D",
            body: args.heroSkill.body,
            fallbackLines: [
              ...(args.heroReferenceLines ?? []),
              ...(args.heroArtDirection
                ? buildHeroModelContractLines(args.heroModelIntent, args.heroArtDirection)
                : []),
            ],
            maxLines: 4,
          }),
        ]
      : []),
    ],
  });
  const workspace = buildStudioAiWorkspace({
    stage: "page",
    thinkingContext: args.thinkingContext,
    workingMemory,
    preflight,
    workloadLane: complexityProfile.workloadLane,
    rigorLevel: complexityProfile.rigorLevel,
    taskGrammarPackIds: complexityProfile.taskGrammarPacks.map((pack) => pack.id),
    sourceMaxItems: 4,
    freeformLayoutPlan,
    pageMission,
    pageIntentLines: [
      `Mission: ${pageMission.mission}`,
      `Headline claim: ${pageMission.headlineClaim}`,
    ],
    templateManifests: templateOptions,
    capabilityCards,
    visualOperatorLines,
    visualThinkingLines: buildVisualThinkingLines({
      preflight,
      visualOperatorLines,
      freeformLayoutPlan,
      preferredVisual: pageMission.preferredVisual,
    }),
    specializedArtifact: args.briefSynthesis?.specializedArtifact ?? complexityProfile.specializedArtifact,
    outputRules: [
      'Output raw HTML only, starting with "<!DOCTYPE html>".',
      "Output a full HTML document with exactly one <section class=\"page\"> block.",
      "Use inline style attributes only. Do not use <style>, <script>, <link>, external assets, or markdown fences.",
      "The single page must be exactly 1600px by 900px.",
      `The section must include data-page-number="${args.page.pageNumber}" and data-page-title="${escapeHtml(args.page.pageTitle)}".`,
      "The data-page-title must be audience-facing, specific, and grounded in the user brief or page claim; never use internal placeholders like Core thesis, Opening thesis, or Page 1.",
      "No internal scrolling, no cut-off content, and no placeholder language.",
      "Use Visual thinking privately before writing HTML. Do not output the reasoning or scaffold.",
      "If no template is active, do not default to a generic left/right split.",
      "If content is sparse, preserve negative space and scale the main claim rather than inventing filler cards.",
      "Keep the page light, restrained, and professional.",
      "Design a fresh, coherent light-theme visual system for this deck and keep it consistent with the supplied tone direction.",
      "Let the raw brief and current page mission choose the composition instead of defaulting to a safe template.",
      ...(preflight.evidencePolicy.tier === "source-backed"
        ? ["Only present hard evidence that is directly supported by the raw brief."]
        : [
            "If the page needs evidence framing, use qualitative structure, common knowledge, or clearly labeled assumptions.",
            "Do not fabricate citations, precise market sizes, valuation multiples, revenue numbers, or recent factual claims.",
            "If quantitative evidence is missing, prefer conceptual or annotated visuals over fake charts.",
          ]),
    ],
  });
  const renderedWorkspace = renderStudioAiWorkspace(workspace);
  const prompt = [
    "You are Codex generating one professional HTML report page.",
    "Use the AI workspace below in priority order; do not let capability cards override the raw brief or the current page mission.",
    "",
    renderedWorkspace.text,
  ].join("\n");
  rememberStudioAiWorkspacePromptMeta(prompt, renderedWorkspace.meta);
  return prompt;
}

function parseDeckPlan(summary: string, requestedPageCount?: number) {
  const rawJson = extractJsonDocument(summary);
  if (!rawJson) {
    throw new Error("The planner did not return a parseable JSON deck plan.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("The planner deck plan JSON could not be parsed.");
  }

  const result = deckPlanSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("The planner deck plan did not match the expected schema.");
  }

  const sortedPages = [...result.data.pages].sort((left, right) => left.pageNumber - right.pageNumber);
  const normalizedPages = sortedPages.map((page, index) => ({
    ...page,
    pageNumber: index + 1,
  }));

  if (requestedPageCount && normalizedPages.length !== requestedPageCount) {
    throw new Error(`Expected ${requestedPageCount} pages but the planner returned ${normalizedPages.length}.`);
  }

  return {
    title: result.data.title.trim(),
    pages: normalizedPages,
  } satisfies DeckPlan;
}

class StudioV2FallbackError extends Error {
  reason: GenerationFallbackReason;

  constructor(reason: GenerationFallbackReason, message: string) {
    super(message);
    this.name = "StudioV2FallbackError";
    this.reason = reason;
  }
}

function isStudioAbortError(error: unknown) {
  return (
    error instanceof Error &&
    /aborted|canceled|cancelled/i.test(error.message)
  );
}

function parseComparisonItemsFromLine(line: string) {
  let normalized = line
    .replace(/^[\-\d.)\s]+/, "")
    .replace(/[|]/g, ",")
    .replace(/\s+and\s+/gi, ", ")
    .trim();
  if (!normalized) {
    return [];
  }

  const colonIndex = normalized.indexOf(":");
  if (colonIndex > 0 && normalized.slice(colonIndex + 1).includes(",")) {
    normalized = normalized.slice(colonIndex + 1).trim();
  }

  const segments = normalized.split(/,(?![^()]*\))/).map((segment) => segment.trim());
  const items = segments
    .map((segment) => {
      const match =
        segment.match(/^([A-Za-z][A-Za-z0-9/&()'’\-\s]{1,48})\s*\(([$€£¥]?-?\d[\d,.]*(?:\.\d+)?%?)\)$/) ??
        segment.match(/^([A-Za-z][A-Za-z0-9/&()'’\-\s]{1,40})[:\-]\s*([$€£¥]?-?\d[\d,.]*(?:\.\d+)?%?)/) ??
        segment.match(/^([A-Za-z][A-Za-z0-9/&()'’\-\s]{1,40})\s+([$€£¥]?-?\d[\d,.]*(?:\.\d+)?%?)$/);
      if (!match) {
        return null;
      }

      const label = normalizeStudioText(match[1] ?? "");
      const valueText = normalizeStudioText(match[2] ?? "");
      if (!label || !valueText) {
        return null;
      }

      return {
        label,
        valueText,
        numericValue: parseNumericValue(valueText),
      };
    })
    .filter(
      (
        item,
      ): item is { label: string; valueText: string; numericValue: number | null } =>
        Boolean(item),
    );

  return items;
}

function parseTimelineFromLine(line: string) {
  const matches = Array.from(
    line.matchAll(/((?:19|20)\d{2})[^0-9%$€£¥-]{0,16}([$€£¥]?-?\d[\d,.]*(?:\.\d+)?%?)/g),
  ).map((match) => ({
    category: match[1] ?? "",
    valueText: match[2] ?? "",
  }));

  if (matches.length >= 2) {
    const categories = matches.map((match) => match.category.trim());
    const values = matches.map((match) => parseNumericValue(match.valueText)).filter(
      (value): value is number => Number.isFinite(value),
    );

    if (values.length === matches.length) {
      return {
        title: deriveEvidenceTitle(line, `Timeline ${categories[0] ?? ""}`),
        categories,
        values,
        unit: inferUnitFromText(matches.map((match) => match.valueText).join(" ")),
      };
    }
  }

  const valueThenYearMatches = Array.from(
    line.matchAll(/([$€£¥]?-?\d[\d,.]*(?:\.\d+)?%?)(?:\s+([A-Za-z%]+))?[^.\n]{0,24}?\b(?:in|during)\s+((?:19|20)\d{2})/gi),
  ).map((match) => ({
    valueText: `${match[1] ?? ""}${match[2] ? ` ${match[2]}` : ""}`.trim(),
    category: match[3] ?? "",
  }));

  if (valueThenYearMatches.length >= 2) {
    const categories = valueThenYearMatches.map((match) => match.category.trim());
    const values = valueThenYearMatches.map((match) => parseNumericValue(match.valueText)).filter(
      (value): value is number => Number.isFinite(value),
    );

    if (values.length === valueThenYearMatches.length) {
      return {
        title: deriveEvidenceTitle(line, `Timeline ${categories[0] ?? ""}`),
        categories,
        values,
        unit: inferUnitFromText(valueThenYearMatches.map((match) => match.valueText).join(" ")),
      };
    }
  }

  const fromToMatch = line.match(
    /\bfrom\s+([$€£¥]?-?\d[\d,.]*(?:\.\d+)?%?)(?:\s+([A-Za-z%]+))?.*?\bto\s+([$€£¥]?-?\d[\d,.]*(?:\.\d+)?%?)(?:\s+([A-Za-z%]+))?/i,
  );
  if (!fromToMatch) {
    return null;
  }

  const firstValueText = `${fromToMatch[1] ?? ""}${fromToMatch[2] ? ` ${fromToMatch[2]}` : ""}`.trim();
  const secondValueText = `${fromToMatch[3] ?? ""}${fromToMatch[4] ? ` ${fromToMatch[4]}` : ""}`.trim();
  const firstValue = parseNumericValue(firstValueText);
  const secondValue = parseNumericValue(secondValueText);
  if (!Number.isFinite(firstValue) || !Number.isFinite(secondValue)) {
    return null;
  }

  const years = Array.from(line.matchAll(/\b((?:19|20)\d{2})\b/g)).map((match) => match[1] ?? "");
  const categories = years.length >= 2 ? years.slice(0, 2) : ["Before", "After"];

  return {
    title: deriveEvidenceTitle(line, "Before and after"),
    categories,
    values: [firstValue, secondValue].filter((value): value is number => Number.isFinite(value)),
    unit: inferUnitFromText(`${firstValueText} ${secondValueText}`),
  };
}

function isStrongComparisonSet(set: ComparisonSet) {
  return (
    set.items.length >= 3 &&
    set.items.filter((item) => item.numericValue !== null).length >= 3 &&
    new Set(set.items.map((item) => item.label.trim().toLowerCase()).filter(Boolean)).size >= 3
  );
}

function isStrongTimelineSet(set: TimelineSet) {
  return (
    set.categories.length >= 3 &&
    set.values.length >= 3 &&
    new Set(set.categories.map((item) => item.trim().toLowerCase()).filter(Boolean)).size >= 3
  );
}

function isStrongSeriesTable(table: SeriesTable) {
  return (
    table.categories.length >= 3 &&
    table.series.length >= 2 &&
    table.series.every((series) => series.values.length >= table.categories.length)
  );
}

function findComparisonSetForPage(page: V2RecipePlanPage, evidenceGraph: EvidenceGraph) {
  return (
    evidenceGraph.comparisonSets.find((set) =>
      page.evidenceIds.some((id) => id === set.id || id.startsWith(`${set.id}-item-`)),
    ) ?? evidenceGraph.comparisonSets[0] ?? null
  );
}

function findTimelineSetForPage(page: V2RecipePlanPage, evidenceGraph: EvidenceGraph) {
  return (
    evidenceGraph.timelineSets.find((set) =>
      page.evidenceIds.some((id) => id === set.id || id.startsWith(`${set.id}-point-`)),
    ) ?? evidenceGraph.timelineSets[0] ?? null
  );
}

function pickPrimaryStoryLabel(args: { evidenceGraph: EvidenceGraph; fallback: string }) {
  const timelineTitle = args.evidenceGraph.timelineSets[0]?.title;
  if (timelineTitle) {
    return timelineTitle;
  }
  const comparisonTitle = args.evidenceGraph.comparisonSets[0]?.title;
  if (comparisonTitle) {
    return comparisonTitle;
  }
  const factLabel = args.evidenceGraph.factTable.items[0]?.label;
  if (factLabel) {
    return compactBoardTitle(factLabel, args.fallback, 6);
  }
  const claim = args.evidenceGraph.claims[0];
  if (claim) {
    return compactBoardTitle(claim, args.fallback, 6);
  }
  return args.fallback;
}

function inferDefaultPageCountFromEvidenceGraph(args: {
  brief: string;
  evidenceGraph: EvidenceGraph;
}) {
  const lineCount = splitBriefLines(args.brief).length;
  const sentenceCount = splitBriefSentences(args.brief).length;
  const strongTimelineCount = args.evidenceGraph.timelineSets.filter(isStrongTimelineSet).length;
  const strongComparisonCount = args.evidenceGraph.comparisonSets.filter(isStrongComparisonSet).length;
  const strongSeriesCount = args.evidenceGraph.seriesTables.filter(isStrongSeriesTable).length;
  const metricCount = args.evidenceGraph.factTable.items.filter((item) => item.numericValue !== null).length;
  const claimCount = args.evidenceGraph.claims.length;
  const briefLength = args.evidenceGraph.normalizedBrief.length;

  let score = 0;

  score += strongTimelineCount * 2;
  score += strongComparisonCount * 2;
  score += strongSeriesCount * 2;

  if (metricCount >= 4) {
    score += 1;
  }
  if (metricCount >= 8) {
    score += 1;
  }
  if (claimCount >= 5) {
    score += 1;
  }
  if (lineCount >= 8) {
    score += 1;
  }
  if (lineCount >= 14) {
    score += 1;
  }
  if (sentenceCount >= 8) {
    score += 1;
  }
  if (sentenceCount >= 14) {
    score += 1;
  }
  if (briefLength >= 2_500) {
    score += 1;
  }
  if (briefLength >= 6_000) {
    score += 1;
  }

  if (strongTimelineCount > 0 && strongComparisonCount > 0) {
    score += 1;
  }

  if (score >= 9) {
    return 4;
  }
  if (score >= 4) {
    return 3;
  }
  return 2;
}

export function isLongFormGenerationRequest(
  payload: Pick<GenerateStudioReportRequest, "generationMode" | "pageCount">,
) {
  return payload.generationMode === "long-form" || (payload.pageCount ?? 0) >= 10;
}

function resolveLongFormPageClass(pageNumber: number, pageCount: number): LongFormPageClass {
  if (pageNumber <= Math.min(3, pageCount)) {
    return "opening-core";
  }
  if (pageNumber <= Math.min(8, pageCount - 2 <= 3 ? pageCount : 8)) {
    return "proof-analysis";
  }
  return "synthesis-support";
}

function resolvePageDensityBudget(pageClass: LongFormPageClass): PageDensityBudget {
  if (pageClass === "opening-core") {
    return {
      maxMajorRegions: 2,
      maxSupportBullets: 2,
      maxEvidenceBullets: 2,
      maxParagraphCharacters: 180,
      maxListItemCharacters: 96,
      maxListItemsPerList: 2,
      allowRightRail: true,
      allowFooterRail: false,
    };
  }

  if (pageClass === "proof-analysis") {
    return {
      maxMajorRegions: 2,
      maxSupportBullets: 2,
      maxEvidenceBullets: 2,
      maxParagraphCharacters: 150,
      maxListItemCharacters: 84,
      maxListItemsPerList: 2,
      allowRightRail: true,
      allowFooterRail: false,
    };
  }

  return {
    maxMajorRegions: 2,
    maxSupportBullets: 2,
    maxEvidenceBullets: 2,
    maxParagraphCharacters: 120,
    maxListItemCharacters: 72,
    maxListItemsPerList: 2,
    allowRightRail: false,
    allowFooterRail: false,
  };
}

function describeDensityBudget(pageClass: LongFormPageClass, budget: PageDensityBudget) {
  if (pageClass === "opening-core") {
    return [
      `Use at most ${budget.maxMajorRegions} meaningful regions on the page.`,
      "Let one thesis area and one primary proof pattern dominate; any support should stay clearly secondary.",
      `Keep support bullets to ${budget.maxSupportBullets} and evidence callouts to ${budget.maxEvidenceBullets}.`,
      "Do not fill the page with many equal-weight cards or deep sidebars.",
    ];
  }

  if (pageClass === "proof-analysis") {
    return [
      `Keep the page to at most ${budget.maxMajorRegions} meaningful regions, with one evidence anchor dominating the composition.`,
      `Keep paragraphs under roughly ${budget.maxParagraphCharacters} characters and cap bullets at ${budget.maxListItemsPerList}.`,
      "Do not spread the story across many equal-weight evidence cards.",
    ];
  }

  return [
    "Keep synthesis-support pages compact, light, and evidence-led.",
    `Keep paragraphs under roughly ${budget.maxParagraphCharacters} characters and lists to ${budget.maxListItemsPerList} items.`,
    "Avoid heavy sidebars, oversized footers, and stacked narrative cards.",
  ];
}

function describeCompositionFreedom(pageClass: LongFormPageClass) {
  if (pageClass === "opening-core") {
    return [
      "Opening pages should feel authored, not templated.",
      "Choose the spatial organization that best frames the thesis and one primary proof pattern.",
      "Avoid reusing the same hero-with-sidebar composition repeatedly.",
      "Consider poster-claim, center-stage figure, or single-proof canvas structures before choosing another split layout.",
    ];
  }

  if (pageClass === "proof-analysis") {
    return [
      "Evidence pages may vary between annotation-stage, center-figure, stacked editorial, evidence-wall, timeline, or asymmetric comparison compositions.",
      "Keep one clearly dominant evidence region; do not spread the story across many equal cards.",
      "Avoid repeating the exact same chart-plus-rail construction across consecutive pages.",
    ];
  }

  return [
    "Synthesis-support pages can be simpler, but should still vary between compact comparison, sequence, single-column evidence, timeline, or poster takeaway layouts.",
    "Prefer compositional restraint over decorative repetition.",
  ];
}

function isChartDrivenPageIntent(text: string) {
  return /\b(trend|trajectory|shift|compare|comparison|gap|mix|distribution|breakdown|pattern|delta|movement|evidence|performance|change|allocation|adoption|decline|increase|decrease)\b/i.test(
    text,
  );
}

function extractExplicitChartRequestPages(brief: string) {
  const requestedPages = new Set<number>();
  const entries = [...splitBriefLines(brief), ...splitBriefSentences(brief)].map((entry) =>
    normalizeStudioText(entry),
  );

  let lastReferencedPage: number | null = null;

  entries.forEach((entry) => {
    if (!entry) {
      return;
    }

    const pageMatch = entry.match(/\bpage\s+(\d{1,2})\b/i);
    if (pageMatch) {
      const pageNumber = Number.parseInt(pageMatch[1] ?? "", 10);
      if (Number.isFinite(pageNumber)) {
        lastReferencedPage = pageNumber;
      }
    }

    const mentionsChart =
      /\b(chart|graph|figure|visual)\b/i.test(entry) ||
      /\b(hero|dominant object|main evidence page|primary proof)\b/i.test(entry);

    if (!mentionsChart) {
      return;
    }

    if (pageMatch && lastReferencedPage !== null) {
      requestedPages.add(lastReferencedPage);
      return;
    }

    if (lastReferencedPage !== null && /\b(keep|make|let|treat)\b/i.test(entry)) {
      requestedPages.add(lastReferencedPage);
    }
  });

  return requestedPages;
}

function resolvePageChartPriority(args: {
  brief: string;
  page: V2RecipePlanPage;
}) {
  const explicitChartPages = extractExplicitChartRequestPages(args.brief);
  if (explicitChartPages.has(args.page.pageNumber)) {
    return "required" as const;
  }

  if (
    args.page.desiredChartKind !== "none" ||
    args.page.layout === "chart-insight" ||
    /\b(chart|graph|figure|visual|primary proof)\b/i.test(
      [args.page.pageTitle, args.page.objective, args.page.insight, args.page.compositionHint]
        .filter(Boolean)
        .join(" "),
    )
  ) {
    return "suggested" as const;
  }

  return "none" as const;
}

function buildChartPageQuestion(page: Pick<PageRecipe, "pageTitle" | "pageIntent" | "objective" | "insight">) {
  const candidate = compactBoardTitle(
    `${page.pageTitle} ${page.pageIntent}`.trim(),
    page.pageTitle || page.objective || page.insight || "Primary chart question",
    12,
  );
  return candidate.length > 0 ? candidate : null;
}

function isRenderableComparisonSet(set: ComparisonSet) {
  return (
    set.items.length >= 2 &&
    set.items.filter((item) => item.numericValue !== null).length >= 2 &&
    new Set(set.items.map((item) => item.label.trim().toLowerCase()).filter(Boolean)).size >= 2
  );
}

function isRenderableTimelineSet(set: TimelineSet) {
  return (
    set.categories.length >= 2 &&
    set.values.length >= 2 &&
    new Set(set.categories.map((item) => item.trim().toLowerCase()).filter(Boolean)).size >= 2
  );
}

function isChartPageEligible(
  page: Pick<
    PageRecipe,
    | "chartSpec"
    | "chartPriority"
    | "pageClass"
    | "pageIntent"
    | "objective"
    | "insight"
    | "pageTitle"
    | "compositionHint"
    | "layout"
  >,
) {
  if (page.pageClass === "synthesis-support") {
    return false;
  }

  const hasChartSignal =
    page.chartPriority !== "none" ||
    Boolean(page.chartSpec) ||
    page.layout === "chart-insight" ||
    /\b(chart|graph|figure|visual|primary proof)\b/i.test(
      [page.pageIntent, page.objective, page.insight, page.pageTitle, page.compositionHint]
        .filter(Boolean)
        .join(" "),
    );
  if (!hasChartSignal) {
    return false;
  }

  const intentText = [page.pageIntent, page.objective, page.insight, page.pageTitle]
    .filter(Boolean)
    .join(" ");
  return page.chartPriority === "required" || isChartDrivenPageIntent(intentText);
}

const HERO_MODEL_KEYWORDS = [
  "架构",
  "芯片",
  "引擎",
  "系统",
  "平台",
  "层级结构",
  "核心部件",
  "互连",
  "拓扑",
  "物理栈",
  "设备",
  "network fabric",
  "topology",
  "interconnect",
  "substrate",
  "die",
  "chip",
  "engine",
  "system",
  "platform",
  "architecture",
  "device",
  "component",
  "stack",
  "fabric",
  "module",
  "hardware",
  "semiconductor",
];

const EXPLICIT_HERO_MODEL_REQUEST_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "3d", pattern: /\b3d\b/i },
  { label: "three-dimensional", pattern: /\bthree-dimensional\b/i },
  { label: "pseudo-3d", pattern: /\bpseudo-3d\b/i },
  { label: "hero model", pattern: /\bhero model\b/i },
  { label: "cutaway", pattern: /\bcutaway\b/i },
  { label: "exploded view", pattern: /\bexploded view\b/i },
  { label: "chip diagram", pattern: /\bchip diagram\b/i },
  { label: "architecture diagram", pattern: /\barchitecture diagram\b/i },
  { label: "system structure diagram", pattern: /\bsystem structure diagram\b/i },
  { label: "三维", pattern: /三维/ },
  { label: "立体", pattern: /立体/ },
  { label: "剖面", pattern: /剖面/ },
  { label: "爆炸图", pattern: /爆炸图/ },
  { label: "拆解图", pattern: /拆解图/ },
  { label: "芯片结构图", pattern: /芯片结构图/ },
  { label: "架构示意图", pattern: /架构示意图/ },
  { label: "系统结构图", pattern: /系统结构图/ },
];

function collectHeroModelSignals(text: string) {
  const normalized = text.toLowerCase();
  return HERO_MODEL_KEYWORDS.filter((keyword) => normalized.includes(keyword.toLowerCase()));
}

function collectExplicitHeroModelRequests(text: string) {
  return EXPLICIT_HERO_MODEL_REQUEST_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ label }) => label,
  );
}

function hasExplicitHeroModelRequest(text: string) {
  return collectExplicitHeroModelRequests(text).length > 0;
}

function hasExistingHeroModelCue(sectionHtml: string) {
  return /hero-model-shell|chip-stack|transform-style\s*:\s*preserve-3d|preserve-3d|rotatex|rotatey|rotatez|translatez|perspective|cutaway|exploded-stack|layered-chip-slab|platform-block-diagram-3d|etched-inline-labels|perimeter-callouts/i.test(
    sectionHtml,
  );
}

function resolveHeroObjectFamily(text: string): HeroObjectFamily {
  const normalized = text.toLowerCase();
  if (
    /\b(chip|die|substrate|wafer|semiconductor|silicon|memory die|compute die|package)\b/i.test(normalized) ||
    /(?:芯片|硅片|基板|晶圆|封装|存储裸片|计算裸片)/.test(text)
  ) {
    return "chip-die-substrate";
  }

  if (
    /\b(interconnect|fabric|mesh|lane|bridge|bus|noc|network-on-chip|topology)\b/i.test(normalized) ||
    /(?:互连|拓扑|织构|总线|通道|网络芯片)/.test(text)
  ) {
    return "interconnect-fabric";
  }

  if (
    /\b(platform|stack|layered stack|software stack|platform architecture|control plane|data plane)\b/i.test(
      normalized,
    ) ||
    /(?:平台|分层栈|技术栈|控制面|数据面)/.test(text)
  ) {
    return "platform-stack";
  }

  return "system-cutaway";
}

function resolveHeroCompositionFamily(args: {
  objectFamily: HeroObjectFamily;
  text: string;
  pageClass: LongFormPageClass;
}): HeroCompositionFamily {
  const normalized = args.text.toLowerCase();
  if (
    /\b(exploded|stacked layers|layer by layer|stack|stacked)\b/i.test(normalized) ||
    /(?:分层展开|逐层|堆叠)/.test(args.text)
  ) {
    return "exploded-stack";
  }

  if (args.objectFamily === "chip-die-substrate") {
    return "layered-chip-slab";
  }

  if (args.objectFamily === "platform-stack") {
    return "platform-block-diagram-3d";
  }

  if (args.objectFamily === "interconnect-fabric" && args.pageClass !== "synthesis-support") {
    return "right-dominant-cutaway";
  }

  return "right-dominant-cutaway";
}

function resolveHeroMaterialHints(objectFamily: HeroObjectFamily) {
  switch (objectFamily) {
    case "chip-die-substrate":
      return [
        "Use satin silicon planes, etched grids, metallic seams, and substrate edges.",
        "Show hierarchy through stacked slabs, chamfered edges, and restrained glow only where structural.",
      ];
    case "platform-stack":
      return [
        "Use layered plates, lifted blocks, and engineered spacing to show the platform stack.",
        "Make each layer feel fabricated and load-bearing, not like a flat card stack.",
      ];
    case "interconnect-fabric":
      return [
        "Use channels, bridges, seams, and directional lanes so the object feels like a real fabric.",
        "Let connective structure, not decorative glow, explain the system.",
      ];
    case "system-cutaway":
    default:
      return [
        "Use a machined shell, visible internal tiers, and disciplined shadows to create a cutaway object.",
        "Keep the object inspectable and physically plausible.",
      ];
  }
}

function resolveHeroAnnotationMode(objectFamily: HeroObjectFamily): HeroAnnotationMode {
  switch (objectFamily) {
    case "chip-die-substrate":
      return "etched-inline-labels";
    case "interconnect-fabric":
      return "perimeter-callouts";
    case "platform-stack":
    case "system-cutaway":
    default:
      return "anchored-side-labels";
  }
}

function buildHeroModelObjectFocus(
  page: Pick<PageRecipe, "pageTitle" | "pageIntent" | "objective" | "insight">,
) {
  const candidate = compactBoardTitle(
    `${page.pageTitle} ${page.objective} ${page.insight}`.trim(),
    page.pageTitle || page.objective || page.insight || "Core system",
    8,
  );
  return candidate.length > 0 ? candidate : null;
}

function isHeroModelNarrativeIntent(text: string) {
  return /\b(architecture|chip|engine|system|platform|device|component|stack|topology|interconnect|fabric|inside|overview|how it works|what it is|physical|layered|core)\b/i.test(
    text,
  ) || /(?:架构|芯片|引擎|系统|平台|结构|层级|核心部件|互连|拓扑|设备|物理)/.test(text);
}

function isHeroModelPageEligible(args: {
  page: Pick<
    PageRecipe,
    | "pageClass"
    | "pageTitle"
    | "pageIntent"
    | "objective"
    | "insight"
    | "compositionHint"
    | "layout"
    | "chartPriority"
    | "chartSpec"
  >;
  brief: string;
}) {
  if (args.page.pageClass === "synthesis-support") {
    return false;
  }

  if (!hasExplicitHeroModelRequest(args.brief)) {
    return false;
  }

  if (args.page.chartPriority === "required") {
    return false;
  }

  if (args.page.chartSpec && (args.page.layout === "chart-insight" || args.page.pageClass !== "opening-core")) {
    return false;
  }

  const combinedText = [
    args.brief,
    args.page.pageTitle,
    args.page.pageIntent,
    args.page.objective,
    args.page.insight,
    args.page.compositionHint,
  ]
    .filter(Boolean)
    .join(" ");
  const signals = collectHeroModelSignals(combinedText);
  if (signals.length === 0) {
    return false;
  }

  return isHeroModelNarrativeIntent(
    [args.page.pageTitle, args.page.pageIntent, args.page.objective, args.page.insight]
      .filter(Boolean)
      .join(" "),
  );
}

function resolveHeroModelIntent(args: {
  page: PageRecipe;
  allPages: PageRecipe[];
  brief: string;
}) {
  if (!isHeroModelPageEligible({ page: args.page, brief: args.brief })) {
    return {
      enabled: false,
      objectFocus: null,
      objectFamily: null,
      recommendedCompositionFamily: null,
      materialHints: [],
      annotationMode: null,
      narrativeBudget: [],
      reason: "page is not a concept-led system or object explanation page",
    } satisfies HeroModelIntent;
  }

  const eligiblePages = args.allPages.filter((page) => isHeroModelPageEligible({ page, brief: args.brief }));
  const isLongForm = args.allPages.length >= 10;
  const preferredPage =
    (isLongForm
      ? eligiblePages.find((page) => page.pageClass === "opening-core") ?? eligiblePages[0]
      : eligiblePages.find((page) => page.pageNumber === 1) ?? eligiblePages[0]) ?? null;

  if (preferredPage && preferredPage.pageNumber !== args.page.pageNumber) {
    return {
      enabled: false,
      objectFocus: null,
      objectFamily: null,
      recommendedCompositionFamily: null,
      materialHints: [],
      annotationMode: null,
      narrativeBudget: [],
      reason: "another page already owns the primary hero-model role in this deck",
    } satisfies HeroModelIntent;
  }

  const familyText = [
    args.brief,
    args.page.pageTitle,
    args.page.pageIntent,
    args.page.objective,
    args.page.insight,
    args.page.compositionHint,
  ]
    .filter(Boolean)
    .join(" ");
  const objectFamily = resolveHeroObjectFamily(familyText);
  const recommendedCompositionFamily = resolveHeroCompositionFamily({
    objectFamily,
    text: familyText,
    pageClass: args.page.pageClass,
  });

  return {
    enabled: true,
    objectFocus: buildHeroModelObjectFocus(args.page),
    objectFamily,
    recommendedCompositionFamily,
    materialHints: resolveHeroMaterialHints(objectFamily),
    annotationMode: resolveHeroAnnotationMode(objectFamily),
    narrativeBudget: [
      "Keep the narrative on the left to one short explanation and a few terse labels.",
      "Do not add long copy under the model.",
      "Use at most one brief takeaway if it sharpens the object explanation.",
    ],
    reason: "brief signals a concept-led page that should explain one core system or object through a dominant model",
  } satisfies HeroModelIntent;
}

function resolveChartPageIntent(args: {
  page: PageRecipe;
  allPages: PageRecipe[];
}) {
  if (!isChartPageEligible(args.page)) {
    return {
      enabled: false,
      pressureMode: "standard",
      question: null,
      explanationBudget: [],
      reason: "page is not a chart-led evidence page",
    } satisfies ChartPageIntent;
  }

  const isLongForm = args.allPages.length >= 10;
  if (!isLongForm) {
    const eligiblePages = args.allPages.filter((page) => isChartPageEligible(page));
    const firstChartPage =
      eligiblePages.find((page) => page.chartPriority === "required") ??
      eligiblePages[0] ??
      null;
    if (firstChartPage && firstChartPage.pageNumber !== args.page.pageNumber) {
      return {
        enabled: false,
        pressureMode: "standard",
        question: null,
        explanationBudget: [],
        reason: "standard deck already has a primary chart page",
      } satisfies ChartPageIntent;
    }
  } else if (args.page.pageClass === "opening-core") {
    const firstOpeningChartPage =
      args.allPages.find(
        (page) => page.pageClass === "opening-core" && isChartPageEligible(page),
      ) ?? null;
    if (firstOpeningChartPage && firstOpeningChartPage.pageNumber !== args.page.pageNumber) {
      return {
        enabled: false,
        pressureMode: "standard",
        question: null,
        explanationBudget: [],
        reason: "opening section already has a primary chart page",
      } satisfies ChartPageIntent;
    }
  }

  return {
    enabled: true,
    pressureMode: "single-dominant-figure",
    question: buildChartPageQuestion(args.page),
    explanationBudget: [
      `Keep the explanation rail to at most ${args.page.pageClass === "opening-core" ? 3 : 2} short points.`,
      "Allow only one concise takeaway sentence.",
      "At most one tiny metric strip is allowed if it strengthens the main chart.",
    ],
    reason:
      args.page.chartPriority === "required"
        ? "brief explicitly asks for a dominant chart page"
        : "page has strong chart evidence and should be chart-led",
  } satisfies ChartPageIntent;
}

function resolveRepairChartPageIntent(args: {
  pageClass: LongFormPageClass;
  pageTitle: string;
  measurement: PageFitMeasurement;
}) {
  if (args.pageClass === "synthesis-support") {
    return {
      enabled: false,
      pressureMode: "standard",
      question: null,
      explanationBudget: [],
      reason: "synthesis-support pages do not keep chart-first repair by default",
    } satisfies ChartPageIntent;
  }

  if (
    args.measurement.chartRegionCount <= 0 &&
    args.measurement.dominantOverflowRegion !== "chart+sidebar" &&
    !args.measurement.compositionFingerprint.hasChart &&
    args.measurement.compositionFingerprint.primaryEvidenceRegion !== "chart"
  ) {
    return {
      enabled: false,
      pressureMode: "standard",
      question: null,
      explanationBudget: [],
      reason: "review did not identify a chart-led page",
    } satisfies ChartPageIntent;
  }

  return {
    enabled: true,
    pressureMode: "single-dominant-figure",
    question: compactBoardTitle(args.pageTitle, args.pageTitle || "Primary chart question", 12),
    explanationBudget: [
      "Shrink the explanation rail before touching the chart.",
      "Keep only one takeaway and the shortest supporting proof points.",
      "Do not introduce new support cards below the chart.",
    ],
    reason: "page already contains a chart region and should remain chart-led",
  } satisfies ChartPageIntent;
}

function resolveRepairHeroModelIntent(args: {
  pageClass: LongFormPageClass;
  pageTitle: string;
  brief: string;
  sectionHtml: string;
  measurement: PageFitMeasurement;
}) {
  if (args.pageClass === "synthesis-support") {
    return {
      enabled: false,
      objectFocus: null,
      objectFamily: null,
      recommendedCompositionFamily: null,
      materialHints: [],
      annotationMode: null,
      narrativeBudget: [],
      reason: "synthesis-support pages do not keep hero-model repair by default",
    } satisfies HeroModelIntent;
  }

  const has3dCue = hasExistingHeroModelCue(args.sectionHtml);

  if (!has3dCue) {
    return {
      enabled: false,
      objectFocus: null,
      objectFamily: null,
      recommendedCompositionFamily: null,
      materialHints: [],
      annotationMode: null,
      narrativeBudget: [],
      reason: "review did not identify a hero-model explanation page",
    } satisfies HeroModelIntent;
  }

  const familyText = [args.brief, args.pageTitle, args.sectionHtml].join(" ");
  const objectFamily = resolveHeroObjectFamily(familyText);
  const recommendedCompositionFamily = resolveHeroCompositionFamily({
    objectFamily,
    text: familyText,
    pageClass: args.pageClass,
  });

  return {
    enabled: true,
    objectFocus: compactBoardTitle(args.pageTitle, args.pageTitle || "Core system", 8),
    objectFamily,
    recommendedCompositionFamily,
    materialHints: resolveHeroMaterialHints(objectFamily),
    annotationMode: resolveHeroAnnotationMode(objectFamily),
    narrativeBudget: [
      "Compress left-side explanation and labels before touching the model.",
      "Trim callouts and footer copy before simplifying the hero object.",
      "Do not turn the page into a generic explanation split unless the model cannot fit after density reduction.",
    ],
    reason: "page already reads as a hero-model concept page and should preserve that identity during repair",
  } satisfies HeroModelIntent;
}

function buildDeckHeroArtDirection(args: { brief: string; styleProfile: DeckStyleProfile }) {
  const normalized = args.brief.toLowerCase();
  const semiconductorCue =
    /\b(chip|semiconductor|silicon|substrate|interconnect|die|wafer|gpu|cpu)\b/i.test(normalized) ||
    /(?:芯片|硅片|基板|互连|晶圆|核心)/.test(args.brief);
  const deviceCue =
    /\b(device|instrument|engine|module|hardware|equipment)\b/i.test(normalized) ||
    /(?:设备|器械|引擎|模组|硬件)/.test(args.brief);
  const objectVocabulary = semiconductorCue
    ? ["layered substrate", "etched die surface", "interconnect seams", "floating callout labels"]
    : deviceCue
      ? ["machined shell", "layered housing", "structural cutaway", "anchored callout labels"]
      : ["layered core object", "structural seams", "material depth", "measured callout labels"];

  return {
    materialDirection: semiconductorCue
      ? "Design the model with satin silicon, layered substrate planes, etched metallic seams, and disciplined glow accents."
      : deviceCue
        ? "Design the model as an engineered object with machined surfaces, visible depth, structural joins, and restrained highlights."
        : `Design the model with ${args.styleProfile.materialDirection.toLowerCase()} and clear fabricated depth cues.`,
    spatialMood: semiconductorCue
      ? "Present the object as a floating cutaway with visible layers and precise spacing."
      : "Present the object as one dominant technical artifact with clear depth and restrained empty space around it.",
    annotationTone: "Use terse technical callouts and short labels, not marketing copy.",
    explanationDirection:
      semiconductorCue
        ? "Explain the object as a fabricated layered system whose physical architecture creates performance."
        : "Explain the object through one inspectable engineered artifact, not through multiple equal cards.",
    objectVocabulary,
    structuralLanguage: semiconductorCue
      ? ["substrate plane", "die slab", "etched seam", "interconnect lane"]
      : deviceCue
        ? ["machined shell", "cutaway tier", "structural join", "service layer"]
        : ["layered core object", "structural seam", "anchored label", "depth plane"],
    guidance: [
      "The object should feel inspectable, layered, and physically plausible.",
      "Use perspective, thickness, highlights, shadows, and seams to sell depth without leaving the deck's professional visual language.",
      "Keep labels sparse so the model remains the hero.",
    ],
  } satisfies DeckHeroArtDirection;
}

function buildDeckCompositionBrief(args: {
  deckTitle: string;
  pageCount: number;
  isLongForm: boolean;
  styleProfile: DeckStyleProfile;
}) {
  const motif = args.isLongForm
    ? "Build one cohesive editorial report language across the deck, but let each page find its own spatial logic."
    : "Treat the deck as a short report narrative with deliberate page-to-page variation.";
  const rhythm = args.isLongForm
    ? "Front-load high-clarity narrative pages, then let evidence pages explore different compositions before settling into lighter tail pages."
    : "Keep the deck tight, but avoid making every page feel like a copy of the first.";

  return {
    motif,
    rhythm,
    guidance: [
      `This is a ${args.styleProfile.industryLabel.toLowerCase()} light-theme report deck.`,
      "Vary dominant region placement, reading direction, and supporting structures across pages.",
      "Do not repeat the same composition family more than twice in a row.",
      "Prefer a few large purposeful regions over grids of many similar cards.",
      "Use non-left/right families when they fit: poster claim, center-stage figure, vertical story strip, single-proof canvas, case timeline, evidence wall, or annotation stage.",
    ],
  } satisfies DeckCompositionBrief;
}

function inferPageRecipeCompositionFingerprint(
  recipe: Pick<PageRecipe, "pageClass" | "layout" | "chartSpec" | "compositionHint" | "freeformLayoutPlan">,
): PageCompositionFingerprint {
  const family =
    recipe.freeformLayoutPlan?.layoutFamily ??
    (recipe.layout === "sequence"
      ? "sequence-grid"
      : recipe.layout === "comparison"
        ? "comparison-split"
        : recipe.layout === "chart-insight"
          ? recipe.chartSpec?.composite === "annotation-rail" || recipe.chartSpec?.composite === "decision-footer"
            ? "chart-rail"
            : "hero-chart"
          : recipe.pageClass === "synthesis-support"
            ? "single-column"
            : "hero-proof");

  const hasChart = Boolean(recipe.chartSpec);
  const hasRightRail =
    !recipe.freeformLayoutPlan &&
    (family === "chart-rail" ||
      family === "comparison-split" ||
      recipe.compositionHint?.toLowerCase().includes("rail") === true);
  const hasFooter =
    recipe.chartSpec?.composite === "decision-footer" ||
    recipe.compositionHint?.toLowerCase().includes("footer") === true;
  const freeformColumnCount =
    family === "evidence-wall"
      ? 3
      : family === "asymmetric-proof-field"
        ? 2
        : 1;

  return {
    family,
    columnCount:
      recipe.freeformLayoutPlan
        ? freeformColumnCount
        : family === "single-column"
        ? 1
        : family === "sequence-grid"
          ? 3
          : 2,
    hasHero: family === "hero-proof" || family === "hero-chart",
    hasChart,
    hasRightRail,
    hasFooter,
    primaryEvidenceRegion: hasChart
      ? "chart"
      : family === "annotation-stage"
        ? "text"
        : family === "evidence-wall" || family === "asymmetric-proof-field"
          ? "metrics"
      : family === "comparison-split"
        ? "comparison"
        : recipe.pageClass === "synthesis-support"
          ? "metrics"
          : "text",
  };
}

function summarizeCompositionFingerprintForPrompt(fingerprint: PageCompositionFingerprint) {
  return `${fingerprint.family}; columns=${fingerprint.columnCount}; hero=${fingerprint.hasHero ? "yes" : "no"}; chart=${fingerprint.hasChart ? "yes" : "no"}; right-rail=${fingerprint.hasRightRail ? "yes" : "no"}; footer=${fingerprint.hasFooter ? "yes" : "no"}; primary=${fingerprint.primaryEvidenceRegion}`;
}

function buildDeckCompositionDiversityReport(fingerprints: PageCompositionFingerprint[]) {
  if (fingerprints.length === 0) {
    return {
      uniqueFamilyCount: 0,
      largestRepeatRun: 0,
      diversityScore: 1,
      repeatedFamilies: [],
    } satisfies DeckCompositionDiversityReport;
  }

  const uniqueFamilyCount = new Set(fingerprints.map((fingerprint) => fingerprint.family)).size;
  let largestRepeatRun = 1;
  let currentRun = 1;
  const repeatedFamilies = new Set<string>();

  for (let index = 1; index < fingerprints.length; index += 1) {
    if (fingerprints[index]?.family === fingerprints[index - 1]?.family) {
      currentRun += 1;
      repeatedFamilies.add(fingerprints[index]!.family);
      largestRepeatRun = Math.max(largestRepeatRun, currentRun);
    } else {
      currentRun = 1;
    }
  }

  const diversityScore = Number(
    Math.max(0, Math.min(1, uniqueFamilyCount / Math.max(1, fingerprints.length) - Math.max(0, largestRepeatRun - 2) * 0.14)).toFixed(2),
  );

  return {
    uniqueFamilyCount,
    largestRepeatRun,
    diversityScore,
    repeatedFamilies: [...repeatedFamilies],
  } satisfies DeckCompositionDiversityReport;
}

function isLongFormRevisionPayload(
  payload: Pick<ReviseStudioReportRequest, "generationMode" | "requestedPageCount" | "report">,
) {
  return payload.generationMode === "long-form" || (payload.requestedPageCount ?? payload.report.pageCount) >= 10;
}

function inferLongFormPageCountFromEvidenceGraph(args: {
  brief: string;
  evidenceGraph: EvidenceGraph;
}) {
  const normalizedBrief = normalizeMultilineStudioText(args.brief);
  const sectionCount = normalizedBrief
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean).length;
  const lineCount = splitBriefLines(args.brief).length;
  const sentenceCount = splitBriefSentences(args.brief).length;
  const metricCount = args.evidenceGraph.factTable.items.filter((item) => item.numericValue !== null).length;
  const strongTimelineCount = args.evidenceGraph.timelineSets.filter(isStrongTimelineSet).length;
  const strongComparisonCount = args.evidenceGraph.comparisonSets.filter(isStrongComparisonSet).length;
  const strongSeriesCount = args.evidenceGraph.seriesTables.filter(isStrongSeriesTable).length;

  let score = 0;
  score += strongTimelineCount * 2;
  score += strongComparisonCount * 2;
  score += strongSeriesCount * 2;
  if (sectionCount >= 5) {
    score += 2;
  }
  if (sectionCount >= 8) {
    score += 1;
  }
  if (lineCount >= 20) {
    score += 1;
  }
  if (sentenceCount >= 18) {
    score += 1;
  }
  if (metricCount >= 10) {
    score += 1;
  }
  if (metricCount >= 16) {
    score += 1;
  }
  if (normalizedBrief.length >= 7_000) {
    score += 1;
  }
  if (normalizedBrief.length >= 12_000) {
    score += 1;
  }

  return score >= 9 ? 12 : 10;
}

function buildLongFormSectionSummaries(args: {
  brief: string;
  evidenceGraph: EvidenceGraph;
}) {
  const normalizedBrief = normalizeMultilineStudioText(args.brief);
  const rawBlocks = normalizedBrief
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const blocks =
    rawBlocks.length > 0
      ? rawBlocks.flatMap((block) => chunkBriefBlock(block, 900))
      : chunkBriefBlock(normalizedBrief, 900);

  return blocks
    .map((block, index) => {
      const lines = splitBriefLines(block).slice(0, 8);
      const sentences = splitBriefSentences(block);
      const evidenceIds = uniqueStrings(
        args.evidenceGraph.nodes
          .filter((node) =>
            lines.some((line) => line.includes(node.sourceText) || node.sourceText.includes(line)),
          )
          .map((node) => node.id),
      ).slice(0, 6);
      const evidenceNodes = args.evidenceGraph.nodes.filter((node) => evidenceIds.includes(node.id));
      const comparisonNodes = evidenceNodes.filter((node) => node.kind === "comparison");
      const timelineNodes = evidenceNodes.filter((node) => node.kind === "timeline");
      const comparisonHasNegative = comparisonNodes.some((node) => (node.numericValue ?? 0) < 0);
      const chartCandidate: ModuleChartKind | "none" =
        timelineNodes.length >= 3
          ? "line"
          : comparisonNodes.length >= 3
            ? comparisonHasNegative
              ? "waterfall"
              : "bar"
            : "none";
      const summary =
        clampText(
          sentences.slice(0, 2).join(". ") ||
            lines.slice(0, 2).join(" "),
          240,
        ) || `Section ${index + 1} evidence summary`;
      const title = compactBoardTitle(
        deriveEvidenceTitle(lines[0] ?? summary, `Section ${index + 1}`),
        `Section ${index + 1}`,
        7,
      );

      return {
        id: `section-${index + 1}`,
        title,
        summary,
        lines,
        evidenceIds,
        chartCandidate,
      } satisfies LongFormSectionSummary;
    })
    .filter((section) => section.summary.length > 0)
    .slice(0, 12);
}

function buildLongFormEvidenceBundles(args: {
  brief: string;
  evidenceGraph: EvidenceGraph;
}) {
  const bundles: LongFormEvidenceBundle[] = [];
  const seen = new Set<string>();

  function pushBundle(bundle: LongFormEvidenceBundle) {
    const key = `${bundle.title}::${bundle.evidenceIds.join("|")}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    bundles.push(bundle);
  }

  buildLongFormSectionSummaries(args).forEach((section, index) => {
    pushBundle({
      id: section.id,
      title: section.title,
      summary: section.summary,
      evidenceIds: section.evidenceIds,
      chartCandidate: section.chartCandidate,
      pageClass: index < 5 ? "proof-analysis" : "synthesis-support",
    });
  });

  args.evidenceGraph.timelineSets
    .filter(isStrongTimelineSet)
    .slice(0, 3)
    .forEach((timeline, index) => {
      pushBundle({
        id: `timeline-bundle-${index + 1}`,
        title: compactBoardTitle(`${timeline.title} trajectory`, "Trajectory over time", 7),
        summary: clampText(
          `${timeline.categories[0] ?? "Start"} to ${
            timeline.categories[timeline.categories.length - 1] ?? "finish"
          } captures the main performance shift.`,
          240,
        ),
        evidenceIds: args.evidenceGraph.nodes
          .filter((node) => node.id.startsWith(`${timeline.id}-point-`))
          .slice(0, 6)
          .map((node) => node.id),
        chartCandidate: "line",
        pageClass: "proof-analysis",
      });
    });

  args.evidenceGraph.comparisonSets
    .filter(isStrongComparisonSet)
    .slice(0, 4)
    .forEach((comparison, index) => {
      const chartCandidate: ModuleChartKind =
        comparison.items.some((item) => (item.numericValue ?? 0) < 0) ? "waterfall" : "bar";
      pushBundle({
        id: `comparison-bundle-${index + 1}`,
        title: compactBoardTitle(comparison.title, "Where the gaps matter", 7),
        summary: clampText(
          comparison.items
            .slice(0, 3)
            .map((item) => `${item.label} ${item.valueText}`)
            .join(" | "),
          240,
        ),
        evidenceIds: comparison.items.slice(0, 5).map((_, itemIndex) => `${comparison.id}-item-${itemIndex + 1}`),
        chartCandidate,
        pageClass: "proof-analysis",
      });
    });

  args.evidenceGraph.claims.slice(0, 6).forEach((claim, index) => {
    pushBundle({
      id: `claim-bundle-${index + 1}`,
      title: compactBoardTitle(claim, `Claim evidence ${index + 1}`, 7),
      summary: clampText(claim, 220),
      evidenceIds: args.evidenceGraph.factTable.items
        .slice(index, index + 3)
        .map((item) => item.id),
      chartCandidate: "none",
      pageClass: index < 3 ? "proof-analysis" : "synthesis-support",
    });
  });

  return bundles.slice(0, 14);
}

function isTaskShellOnlyEvidenceLine(line: string) {
  const normalized = normalizeStudioText(line);
  const stripped = stripInstructionalLead(normalized);
  if (!normalized) {
    return true;
  }
  if (
    /\b(?:\d+\s*pages?|page\s+\d+|page\s+ppt|ppt\s+(?:for|on|about)|slides?\s+(?:for|on|about)|deck\s+(?:for|on|about)|presentation\s+(?:for|on|about))\b/i.test(
      normalized,
    ) &&
    !/(?:%|[$€£¥]|\b(?:according to|metric|revenue|cost|margin|accident|growth|decline|increase|decrease)\b|:\s*[$€£¥]?\d)/i.test(
      stripped,
    )
  ) {
    return true;
  }
  return false;
}

export function buildEvidenceGraph(brief: string, requestedPageCount?: number) {
  const normalizedBrief = normalizeStudioText(brief);
  const cacheKey = sha1(`${normalizedBrief}::${requestedPageCount ?? ""}`);
  const cached = evidenceGraphCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const lines = splitBriefLines(brief).filter((line) => !isTaskShellOnlyEvidenceLine(line));
  const sentences = splitBriefSentences(lines.join("\n"));
  const nodes: EvidenceNode[] = [];
  const comparisonSets: ComparisonSet[] = [];
  const timelineSets: TimelineSet[] = [];
  const seriesTables: SeriesTable[] = [];
  const factItems: EvidenceNode[] = [];

  lines.forEach((line, index) => {
    const timeline = parseTimelineFromLine(line);
    if (timeline) {
      const nodeId = `timeline-${timelineSets.length + 1}`;
      timelineSets.push({
        id: nodeId,
        title: timeline.title,
        categories: timeline.categories,
        values: timeline.values,
        unit: timeline.unit,
      });
      timeline.categories.forEach((category, valueIndex) => {
        nodes.push({
          id: `${nodeId}-point-${valueIndex + 1}`,
          kind: "timeline",
          label: category,
          sourceText: line,
          valueText: String(timeline.values[valueIndex] ?? ""),
          numericValue: timeline.values[valueIndex] ?? null,
          category,
          timeLabel: category,
        });
      });
      return;
    }

    const comparisonItems = parseComparisonItemsFromLine(line);
    if (comparisonItems.length >= 3) {
      const setId = `comparison-${comparisonSets.length + 1}`;
      comparisonSets.push({
        id: setId,
        title: deriveEvidenceTitle(line, `Comparison ${comparisonSets.length + 1}`),
        items: comparisonItems,
      });
      comparisonItems.forEach((item, itemIndex) => {
        nodes.push({
          id: `${setId}-item-${itemIndex + 1}`,
          kind: "comparison",
          label: item.label,
          sourceText: line,
          valueText: item.valueText,
          numericValue: item.numericValue,
          category: item.label,
        });
      });
      return;
    }

    const metricMatch =
      line.match(/^([A-Za-z][A-Za-z0-9/&()'’\-\s]{1,48})[:\-]\s*([$€£¥]?-?\d[\d,.]*(?:\.\d+)?%?)/) ??
      line.match(/^([$€£¥]?-?\d[\d,.]*(?:\.\d+)?%?)\s+([A-Za-z][A-Za-z0-9/&()'’\-\s]{1,48})$/);
    if (metricMatch) {
      const firstToken = metricMatch[1] ?? "";
      const secondToken = metricMatch[2] ?? "";
      const firstLooksNumeric = /^[€£¥$-]?\d/.test(firstToken.trim());
      const label = normalizeStudioText(firstLooksNumeric ? secondToken : firstToken);
      const valueText = normalizeStudioText(firstLooksNumeric ? firstToken : secondToken);
      if (label && valueText) {
        const node: EvidenceNode = {
          id: `fact-${factItems.length + 1}`,
          kind: "metric",
          label,
          sourceText: line,
          valueText,
          numericValue: parseNumericValue(valueText),
        };
        nodes.push(node);
        factItems.push(node);
      }
      return;
    }

    if (index < 8 && line.length > 20 && !isInstructionalBriefLine(line)) {
      nodes.push({
        id: `claim-${index + 1}`,
        kind: "claim",
        label: compactBoardTitle(deriveEvidenceTitle(line, `Insight ${index + 1}`), `Insight ${index + 1}`, 7),
        sourceText: line,
      });
    }
  });

  if (comparisonSets.length === 0) {
    const singleFacts = factItems.filter((item) => item.numericValue !== null);
    if (singleFacts.length >= 3) {
      comparisonSets.push({
        id: "comparison-facts",
        title: "Key metrics",
        items: singleFacts.slice(0, 5).map((item) => ({
          label: item.label,
          valueText: item.valueText ?? "",
          numericValue: item.numericValue ?? null,
        })),
      });
    }
  }

  const graph: EvidenceGraph = {
    normalizedBrief,
    nodes,
    factTable: {
      items: factItems.slice(0, 10),
    },
    comparisonSets,
    timelineSets,
    seriesTables,
    claims: uniqueStrings(
      [
        ...sentences.slice(0, 6),
        ...nodes
          .filter((node) => node.kind === "claim")
          .map((node) => node.sourceText),
      ].slice(0, 8),
    ),
  };

  evidenceGraphCache.set(cacheKey, graph);
  return graph;
}

function buildModuleManifestIndex(
  payload: Pick<
    GenerateStudioReportRequest,
    "publishedModules" | "moduleManifestSignature" | "moduleUsageMode"
  >,
  options?: {
    phase?: "render" | "repair";
  },
) {
  if (payload.moduleUsageMode === "disabled") {
    return [] as PublishedModuleManifest[];
  }

  const signature =
    `${payload.moduleUsageMode}:${options?.phase ?? "render"}:${
      payload.moduleManifestSignature.trim() || sha1(JSON.stringify(payload.publishedModules))
    }`;
  const cached = publishedModuleManifestCache.get(signature);
  if (cached) {
    return cached;
  }

  const manifests = payload.publishedModules
    .filter((manifest) => manifest.status === "stable")
    .filter((manifest) => manifest.hasPassingEvidence)
    .filter((manifest) => manifest.trustScore >= 0.6)
    .filter((manifest) =>
      payload.moduleUsageMode === "chart-only"
        ? manifest.supportedChartKinds.length > 0
        : true,
    )
    .sort(
      (left, right) =>
        right.trustScore - left.trustScore ||
        right.publishCount - left.publishCount ||
        left.label.localeCompare(right.label),
    );

  publishedModuleManifestCache.set(signature, manifests);
  return manifests;
}

function summarizeEvidenceGraphForPrompt(graph: EvidenceGraph) {
  const parts: string[] = [];

  graph.factTable.items.slice(0, 8).forEach((item) => {
    parts.push(`${item.id}: metric ${item.label} = ${item.valueText ?? item.sourceText}`);
  });

  graph.comparisonSets.slice(0, 4).forEach((set) => {
    parts.push(
      `${set.id}: comparison ${set.items
        .map((item) => `${item.label} ${item.valueText}`)
        .join(" | ")}`,
    );
  });

  graph.timelineSets.slice(0, 3).forEach((set) => {
    parts.push(
      `${set.id}: timeline ${set.categories
        .map((category, index) => `${category} ${set.values[index]}`)
        .join(" | ")}`,
    );
  });

  graph.claims.slice(0, 6).forEach((claim, index) => {
    parts.push(`claim-${index + 1}: ${claim}`);
  });

  return parts.slice(0, 16);
}

function summarizePublishedModulesForPrompt(manifests: PublishedModuleManifest[]) {
  return manifests.slice(0, 8).map((manifest) => {
    const chartKinds = manifest.supportedChartKinds.length
      ? ` charts=${manifest.supportedChartKinds.join("/")}`
      : "";
    const contracts = manifest.outputContractSummary.length
      ? ` outputs=${manifest.outputContractSummary.slice(0, 2).join(" ; ")}`
      : "";
    const templateShape = manifest.template?.shape
      ? ` template=${manifest.template.shape}`
      : " template=module-fragment";

    return `${manifest.moduleId}: kind=${manifest.kind}${templateShape} capability=${manifest.deterministicCapability}${chartKinds} role=${manifest.semanticRole}.${contracts}`;
  });
}

function buildBriefDigestForPrompt(args: {
  brief: string;
  evidenceGraph?: EvidenceGraph;
  synthesis?: StudioBriefSynthesis;
  maxItems?: number;
}) {
  const evidenceText = args.synthesis?.evidenceInputText ?? args.brief;
  const lines = splitBriefLines(evidenceText)
    .map((line) => stripInstructionalLead(line))
    .filter(Boolean);
  const sentences = splitBriefSentences(evidenceText)
    .map((sentence) => stripInstructionalLead(sentence))
    .filter(Boolean);
  const evidenceHighlights = args.evidenceGraph
    ? [
        ...args.evidenceGraph.factTable.items
          .slice(0, 4)
          .map((item) => clampText(`${item.label}: ${item.valueText ?? item.sourceText}`, 140)),
        ...args.evidenceGraph.claims.slice(0, 3).map((claim) => clampText(claim, 140)),
      ]
    : [];

  return uniqueStrings([
    ...(args.synthesis?.subject ? [`Subject: ${args.synthesis.subject}`] : []),
    ...(args.synthesis?.sparseBriefMode
      ? ["No hard source evidence was supplied; use safe non-numeric common sense only."]
      : []),
    ...(args.synthesis?.sourceMaterialDigest ?? []),
    ...lines.slice(0, 4),
    ...sentences.slice(0, 4),
    ...evidenceHighlights,
  ]).slice(0, args.maxItems ?? 8);
}

function resolveDeckPressureBudget(args: {
  generationMode?: GenerationMode;
  pageCount?: number | null;
}): DeckPressureBudget {
  const isLongForm = args.generationMode === "long-form" || (args.pageCount ?? 0) >= 10;
  return isLongForm
    ? {
        mode: "long-form",
        maxPagePromptChars: 18_000,
        maxRepairPromptChars: 22_000,
      }
    : {
        mode: "standard",
        maxPagePromptChars: 14_000,
        maxRepairPromptChars: 18_000,
      };
}

function resolvePageModuleOptions(args: {
  moduleUsageMode: ModuleUsageMode;
  pageClass: LongFormPageClass;
  chartKind?: ModuleChartKind | null;
  manifests: PublishedModuleManifest[];
}) {
  if (args.moduleUsageMode === "disabled") {
    return [] as PublishedModuleManifest[];
  }

  if (args.moduleUsageMode === "chart-only") {
    if (args.pageClass !== "proof-analysis" || !args.chartKind) {
      return [] as PublishedModuleManifest[];
    }

    return args.manifests.filter((manifest) =>
      manifest.supportedChartKinds.includes(args.chartKind!),
    );
  }

  return args.manifests;
}

function buildDeckRecipePlanPrompt(args: {
  payload: GenerateStudioReportRequest;
  evidenceGraph: EvidenceGraph;
  modules: PublishedModuleManifest[];
  thinkingContext: ResolvedThinkingContext;
  thinkingSkill?: LoadedStudioThinkingModeSkill | null;
  briefSynthesis?: StudioBriefSynthesis;
}) {
  const briefDigest = buildBriefDigestForPrompt({
    brief: args.payload.brief,
    evidenceGraph: args.evidenceGraph,
    synthesis: args.briefSynthesis,
    maxItems: 8,
  });
  const pageCountInstruction = args.payload.pageCount
    ? `Return exactly ${args.payload.pageCount} pages.`
    : "Choose the smallest page count that tells the story clearly, usually between 2 and 5 pages.";
  const heroPlanningIntent = hasExplicitHeroModelRequest(args.payload.brief)
    ? ({
        enabled: true,
        objectFocus: compactBoardTitle(args.payload.brief, "Core system", 8),
        objectFamily: resolveHeroObjectFamily(args.payload.brief),
        recommendedCompositionFamily: resolveHeroCompositionFamily({
          objectFamily: resolveHeroObjectFamily(args.payload.brief),
          text: args.payload.brief,
          pageClass: "opening-core",
        }),
        materialHints: resolveHeroMaterialHints(resolveHeroObjectFamily(args.payload.brief)),
        annotationMode: resolveHeroAnnotationMode(resolveHeroObjectFamily(args.payload.brief)),
        narrativeBudget: [],
        reason: "brief explicitly requests one 3D concept page",
      } satisfies HeroModelIntent)
    : null;
  const templateOptions = selectStudioTemplateWorkspaceManifests({
    moduleOptions: args.modules,
    heroModelIntent: heroPlanningIntent,
    chartKind: null,
  });
  const workspace = buildStudioAiWorkspace({
    stage: "planning",
    thinkingContext: args.thinkingContext,
    requestedPageCount: args.payload.pageCount ?? null,
    generationMode: args.payload.generationMode,
    evidenceGraph: args.evidenceGraph,
    sourceMaxItems: 4,
    rendererBriefLines: args.briefSynthesis
      ? [
          `User wants: ${args.briefSynthesis.taskGoal}`,
          `Subject: ${args.briefSynthesis.subject}`,
          `Content confidence: ${args.briefSynthesis.contentConfidence}`,
          `Evidence source: ${args.briefSynthesis.evidenceSourceUsed}`,
          ...args.briefSynthesis.safeKnowledgePolicy.slice(0, 2),
        ]
      : [],
    pageIntentLines: [
      pageCountInstruction,
      "Every page must answer one page question and land one clear claim.",
      "Keep every objective and insight to a single argumentative move.",
      "Do not combine summary, implications, and next steps into one page.",
      "Use only the supplied evidence ids. Do not invent series or categories.",
      "Only request a chart when the evidence supports it.",
      "Prefer moduleHints only from the supplied published template capabilities.",
      "Keep page titles professional, editorial, and mode-appropriate.",
      "Prefer strong content logic first; use compositionHint for tone, and only add layout when it truly helps.",
      "Evidence graph:",
      ...summarizeEvidenceGraphForPrompt(args.evidenceGraph),
      "Published template capabilities:",
      ...summarizePublishedModulesForPrompt(args.modules),
      "Brief digest:",
      ...briefDigest,
    ],
    templateManifests: templateOptions,
    capabilityCards: [
      createThinkingModeCapabilityCard({
        thinkingContext: args.thinkingContext,
        thinkingSkill: args.thinkingSkill,
        stage: "heuristic",
      }),
    ],
    outputRules: [
      "First, write 2-4 short plain-English sentences about the deck logic.",
      "Then output one ```json block with this exact shape:",
      '{ "title": string, "pages": [{ "pageNumber": number, "pageTitle": string, "objective": string, "insight": string, "pageClass"?: "opening-core"|"proof-analysis"|"synthesis-support", "compositionHint"?: string, "layout"?: "hero-proof"|"comparison"|"chart-insight"|"sequence"|"decision", "desiredChartKind": "none"|"bar"|"stacked"|"line"|"waterfall", "composite": "none"|"annotation-rail"|"metric-strip"|"decision-footer", "evidenceIds": string[], "moduleHints": string[] }] }',
    ],
  });
  const renderedWorkspace = renderStudioAiWorkspace(workspace);
  const prompt = [
    "You are Codex planning a professional report deck.",
    "Use the AI workspace below in priority order; planning heuristics must not override the user task.",
    "",
    renderedWorkspace.text,
  ].join("\n");
  rememberStudioAiWorkspacePromptMeta(prompt, renderedWorkspace.meta);
  return prompt;
}

function parseRecipePlan(summary: string, requestedPageCount?: number) {
  const rawJson = extractJsonDocument(summary);
  if (!rawJson) {
    throw new StudioV2FallbackError(
      "recipe_planning_failed",
      "The V2 recipe planner did not return parseable JSON.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new StudioV2FallbackError(
      "recipe_planning_failed",
      "The V2 recipe planner JSON could not be parsed.",
    );
  }

  const result = pageRecipePlanSchema.safeParse(parsed);
  if (!result.success) {
    throw new StudioV2FallbackError(
      "recipe_invalid",
      "The V2 recipe planner response did not match the expected schema.",
    );
  }

  const normalizedPages = [...result.data.pages]
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .map((page, index) => ({
      ...page,
      pageNumber: index + 1,
    }));

  if (requestedPageCount && normalizedPages.length !== requestedPageCount) {
    throw new StudioV2FallbackError(
      "recipe_invalid",
      `Expected ${requestedPageCount} recipe pages but received ${normalizedPages.length}.`,
    );
  }

  return {
    title: result.data.title.trim(),
    pages: normalizedPages,
  } satisfies PageRecipePlan;
}

function buildStandardHeuristicRecipePlan(args: {
  payload: GenerateStudioReportRequest;
  evidenceGraph: EvidenceGraph;
  modules: PublishedModuleManifest[];
  thinkingContext: ResolvedThinkingContext;
  briefSynthesis: StudioBriefSynthesis;
}) {
  const thinkingMode = args.thinkingContext.mode;
  const strongestClaim =
    args.evidenceGraph.claims[0] ??
    args.briefSynthesis.audienceFacingThesisCandidates[0] ??
    args.evidenceGraph.timelineSets[0]?.title ??
    args.evidenceGraph.comparisonSets[0]?.title ??
    args.evidenceGraph.factTable.items[0]?.label ??
    (thinkingMode === "strategy"
      ? "The brief points to a clear decision story."
      : thinkingMode === "case-study"
        ? "The brief points to a clear case story."
        : thinkingMode === "academic-research"
          ? "The brief points to a clear research finding."
          : "The brief points to a clear central claim.");
  const primaryStoryLabel = pickPrimaryStoryLabel({
    evidenceGraph: args.evidenceGraph,
    fallback: args.briefSynthesis.subject ||
      (thinkingMode === "strategy"
        ? "Decision view"
        : thinkingMode === "case-study"
          ? "Case view"
          : thinkingMode === "academic-research"
            ? "Research view"
            : "Core view"),
  });
  const chartCapableModules = args.modules.filter(
    (manifest) => manifest.supportedChartKinds.length > 0,
  );
  const defaultPageCount = inferDefaultPageCountFromEvidenceGraph({
    brief: args.payload.brief,
    evidenceGraph: args.evidenceGraph,
  });
  const pageCount = Math.max(1, Math.min(args.payload.pageCount ?? defaultPageCount, 5));
  const pages: PageRecipePlan["pages"] = [];
  const reserveDecisionPage = pageCount > 1;
  const canAddEvidencePage = () => pages.length < pageCount - (reserveDecisionPage ? 1 : 0);
  const baseTitleSeeds = [
    primaryStoryLabel,
    strongestClaim,
    args.evidenceGraph.factTable.items[0]?.label,
    args.evidenceGraph.claims[0],
    args.payload.brief,
  ];
  const openingPageTitle =
    thinkingMode === "strategy"
      ? "Executive summary"
      : thinkingMode === "case-study"
        ? "Case overview"
        : thinkingMode === "academic-research"
          ? "Research question"
          : deriveSpecificStudioTitle({
              seeds: baseTitleSeeds,
              fallback: "Brief focus",
              shortSuffix: "focus",
              maxWords: 6,
            });
  const openingPageObjective =
    args.briefSynthesis.pageIntents[0]?.pageQuestion ??
    (thinkingMode === "strategy"
      ? "State the core recommendation immediately."
      : thinkingMode === "case-study"
        ? "Frame the case and the central challenge immediately."
        : thinkingMode === "academic-research"
          ? "State the research question and key finding immediately."
          : `State the core claim about ${args.briefSynthesis.subject || "the brief"} immediately.`);
  const closingPageTitle =
    thinkingMode === "strategy"
      ? "What to do next"
      : thinkingMode === "case-study"
        ? "Outcome and lesson"
        : thinkingMode === "academic-research"
          ? "Interpretation and next work"
          : deriveSpecificStudioTitle({
              seeds: [primaryStoryLabel, strongestClaim, args.payload.brief],
              fallback: "Where this leads",
              shortSuffix: "next",
              maxWords: 6,
            });
  const closingPageObjective =
    thinkingMode === "strategy"
      ? "Recommend the next move."
      : thinkingMode === "case-study"
        ? "Show what changed and what the case teaches."
        : thinkingMode === "academic-research"
          ? "Interpret what the result means and what comes next."
          : "Close with the main implication or next takeaway.";
  const closingPageInsight =
    thinkingMode === "strategy"
      ? `${primaryStoryLabel} now supports one clear next move.`
      : thinkingMode === "case-study"
        ? `${primaryStoryLabel} now reads most clearly through the resulting outcome and lesson.`
        : thinkingMode === "academic-research"
          ? `${primaryStoryLabel} now supports one clear interpretation and next research step.`
          : `${primaryStoryLabel} now points to one clear implication.`;
  const closingPageCompositionHint =
    thinkingMode === "strategy"
      ? "Present the decision path as a directional sequence or stepped argument, not a card grid."
      : thinkingMode === "case-study"
        ? "Land the case through one clear outcome pattern and one brief lesson, not a recommendation memo."
        : thinkingMode === "academic-research"
          ? "Keep the close interpretive and restrained, with one result reading and one next-work note."
          : "Close with one implication-led sequence or synthesis, not a memo stack.";

  pages.push({
    pageNumber: 1,
    pageTitle: openingPageTitle,
    objective: openingPageObjective,
    insight: clampText(args.briefSynthesis.pageIntents[0]?.headlineClaim ?? strongestClaim, 260),
    compositionHint: "Open with a thesis-led page that feels editorial and decisive, not a standard left-text right-card split.",
    layout: "hero-proof",
    desiredChartKind: "none",
    composite: "metric-strip",
    evidenceIds: args.evidenceGraph.factTable.items.slice(0, 4).map((item) => item.id),
    moduleHints: ["core.metrics"],
  });

  if (canAddEvidencePage() && args.evidenceGraph.timelineSets[0] && isStrongTimelineSet(args.evidenceGraph.timelineSets[0])) {
    const timeline = args.evidenceGraph.timelineSets[0];
    pages.push({
      pageNumber: pages.length + 1,
      pageTitle: compactBoardTitle(`${timeline.title} trajectory`, "Trajectory over time", 6),
      objective: "Show the trend that changes the story.",
      insight: clampText(
        `${timeline.categories[0] ?? "Start"} to ${
          timeline.categories[timeline.categories.length - 1] ?? "finish"
        } captures the main performance shift.`,
        260,
      ),
      compositionHint: "Let the time-series evidence dominate, with concise commentary tucked around it rather than a heavy sidebar.",
      layout: "chart-insight",
      desiredChartKind: "line",
      composite: "decision-footer",
      evidenceIds: args.evidenceGraph.nodes
        .filter((node) => node.kind === "timeline")
        .slice(0, 6)
        .map((node) => node.id),
      moduleHints: ["core.line", ...chartCapableModules.slice(0, 1).map((item) => item.moduleId)],
    });
  }

  if (canAddEvidencePage() && args.evidenceGraph.comparisonSets[0] && isStrongComparisonSet(args.evidenceGraph.comparisonSets[0])) {
    const comparison = args.evidenceGraph.comparisonSets[0];
    const waterfallCapable = comparison.items.some((item) => (item.numericValue ?? 0) < 0);
    pages.push({
      pageNumber: pages.length + 1,
      pageTitle: compactBoardTitle(comparison.title, "Where the gaps matter", 6),
      objective: "Show the gap that matters most.",
      insight: clampText(
        comparison.items
          .slice(0, 2)
          .map((item) => `${item.label} at ${item.valueText}`)
          .join(" versus "),
        260,
      ),
      compositionHint: "Build an unequal split comparison where one side clearly carries more weight than the other.",
      layout: "comparison",
      desiredChartKind: waterfallCapable ? "waterfall" : "bar",
      composite: "annotation-rail",
      evidenceIds: comparison.items.slice(0, 5).map((_, index) => `${comparison.id}-item-${index + 1}`),
      moduleHints: [waterfallCapable ? "core.gantt" : "core.bars", ...chartCapableModules.slice(0, 1).map((item) => item.moduleId)],
    });
  }

  while (pages.length < pageCount - (reserveDecisionPage ? 1 : 0)) {
    const draftPageIntent = args.briefSynthesis.pageIntents[pages.length] ?? null;
    const fallbackClaim =
      draftPageIntent?.headlineClaim ??
      args.evidenceGraph.claims[pages.length] ??
      args.evidenceGraph.factTable.items[pages.length]?.label ??
      args.briefSynthesis.audienceFacingThesisCandidates[0] ??
      args.briefSynthesis.subject;
    pages.push({
      pageNumber: pages.length + 1,
      pageTitle: draftPageIntent?.pageTitle ?? compactBoardTitle(fallbackClaim, `Page ${pages.length + 1}`, 6),
      objective: draftPageIntent?.pageQuestion ?? "Prove one additional evidence-backed point.",
      insight: clampText(fallbackClaim, 260),
      compositionHint:
        pages.length % 2 === 0
          ? "Use a single dominant content field with one compact supporting zone."
          : "Use a lighter stacked editorial composition rather than another hero template.",
      layout: "hero-proof",
      desiredChartKind: "none",
      composite: "none",
      evidenceIds: args.evidenceGraph.factTable.items
        .slice(Math.max(0, pages.length - 1), Math.max(0, pages.length - 1) + 3)
        .map((item) => item.id),
      moduleHints: ["core.metrics"],
    });
  }

  if (reserveDecisionPage) {
    pages.push({
      pageNumber: pages.length + 1,
      pageTitle: closingPageTitle,
      objective: closingPageObjective,
      insight: clampText(closingPageInsight, 260),
      compositionHint: closingPageCompositionHint,
      layout: "sequence",
      desiredChartKind: "none",
      composite: "none",
      evidenceIds: args.evidenceGraph.factTable.items.slice(0, 3).map((item) => item.id),
      moduleHints: ["core.flow"],
    });
  }

  return {
    title: compactBoardTitle(
      thinkingMode === "case-study"
        ? `${primaryStoryLabel} case study`
        : thinkingMode === "academic-research"
          ? `${primaryStoryLabel} research deck`
          : thinkingMode === "strategy"
            ? `${primaryStoryLabel} strategy review`
            : `${primaryStoryLabel} report`,
      "Generated studio report",
      6,
    ),
    pages,
  } satisfies PageRecipePlan;
}

function buildLongFormHeuristicRecipePlan(args: {
  payload: GenerateStudioReportRequest;
  evidenceGraph: EvidenceGraph;
  modules: PublishedModuleManifest[];
  thinkingContext: ResolvedThinkingContext;
  briefSynthesis: StudioBriefSynthesis;
}) {
  const targetPageCount = Math.max(
    10,
    Math.min(
      args.payload.pageCount ?? inferLongFormPageCountFromEvidenceGraph({
        brief: args.payload.brief,
        evidenceGraph: args.evidenceGraph,
      }),
      12,
    ),
  );
  const thinkingMode = args.thinkingContext.mode;
  const primaryStoryLabel = pickPrimaryStoryLabel({
    evidenceGraph: args.evidenceGraph,
    fallback: args.briefSynthesis.subject ||
      (thinkingMode === "strategy"
        ? "Decision review"
        : thinkingMode === "case-study"
          ? "Case review"
          : thinkingMode === "academic-research"
            ? "Research review"
            : "Report review"),
  });
  const strongestClaim =
    args.evidenceGraph.claims[0] ??
    args.briefSynthesis.audienceFacingThesisCandidates[0] ??
    args.evidenceGraph.timelineSets[0]?.title ??
    args.evidenceGraph.comparisonSets[0]?.title ??
    args.evidenceGraph.factTable.items[0]?.label ??
    (thinkingMode === "strategy"
      ? "The brief supports a broader decision story."
      : thinkingMode === "case-study"
        ? "The brief supports a broader case narrative."
        : thinkingMode === "academic-research"
          ? "The brief supports a broader research story."
          : "The brief supports a broader evidence-led story.");
  const evidenceBundles = buildLongFormEvidenceBundles({
    brief: args.briefSynthesis.evidenceInputText,
    evidenceGraph: args.evidenceGraph,
  });
  const chartCapableModules = args.modules.filter(
    (manifest) => manifest.supportedChartKinds.length > 0,
  );
  const pages: PageRecipePlan["pages"] = [];
  const openingPageCount = Math.min(3, targetPageCount);
  const proofPageCount = Math.min(5, Math.max(0, targetPageCount - openingPageCount - 2));
  const synthesisPageCount = Math.max(0, targetPageCount - openingPageCount - proofPageCount);
  const baseTitleSeeds = [
    primaryStoryLabel,
    strongestClaim,
    args.evidenceGraph.factTable.items[0]?.label,
    args.evidenceGraph.claims[0],
    args.payload.brief,
  ];
  const neutralOpeningTitle = deriveSpecificStudioTitle({
    seeds: baseTitleSeeds,
    fallback: "Brief focus",
    shortSuffix: "focus",
    maxWords: 6,
  });
  const neutralPatternTitle = deriveSpecificStudioTitle({
    seeds: baseTitleSeeds,
    fallback: "Evidence pattern",
    shortSuffix: "pattern",
    maxWords: 6,
  });
  const neutralInterpretationTitle = deriveSpecificStudioTitle({
    seeds: [evidenceBundles[0]?.title, evidenceBundles[0]?.summary, ...baseTitleSeeds],
    fallback: "Evidence reading",
    shortSuffix: "reading",
    maxWords: 7,
  });
  const neutralSynthesisTitle = deriveSpecificStudioTitle({
    seeds: [primaryStoryLabel, strongestClaim, args.payload.brief],
    fallback: "Main synthesis",
    shortSuffix: "synthesis",
    maxWords: 6,
  });

  function buildModuleHintsForChart(kind: ModuleChartKind | "none") {
    if (kind === "line") {
      return ["core.line", ...chartCapableModules.filter((item) => item.supportedChartKinds.includes("line")).slice(0, 2).map((item) => item.moduleId)];
    }
    if (kind === "stacked") {
      return ["core.bars", ...chartCapableModules.filter((item) => item.supportedChartKinds.includes("stacked")).slice(0, 2).map((item) => item.moduleId)];
    }
    if (kind === "bar") {
      return ["core.bars", ...chartCapableModules.filter((item) => item.supportedChartKinds.includes("bar")).slice(0, 2).map((item) => item.moduleId)];
    }
    if (kind === "waterfall") {
      return ["core.gantt", ...chartCapableModules.filter((item) => item.supportedChartKinds.includes("waterfall")).slice(0, 2).map((item) => item.moduleId)];
    }
    return ["core.metrics"];
  }

  if (openingPageCount >= 1) {
    pages.push({
      pageNumber: 1,
      pageTitle:
        thinkingMode === "strategy"
          ? "Executive summary"
          : thinkingMode === "case-study"
            ? "Case overview"
            : thinkingMode === "academic-research"
              ? "Research question"
              : neutralOpeningTitle,
      objective:
        args.briefSynthesis.pageIntents[0]?.pageQuestion ??
        (thinkingMode === "strategy"
          ? "State the main recommendation immediately."
          : thinkingMode === "case-study"
            ? "Frame the case and the main challenge immediately."
            : thinkingMode === "academic-research"
              ? "State the research question and primary finding immediately."
              : `State the main claim about ${args.briefSynthesis.subject || "the brief"} immediately.`),
      insight: clampText(args.briefSynthesis.pageIntents[0]?.headlineClaim ?? strongestClaim, 260),
      pageClass: "opening-core",
      compositionHint: "Make the opening page thesis-led and editorial, with one dominant proof region and no generic dashboard symmetry.",
      layout: "hero-proof",
      desiredChartKind: "none",
      composite: "metric-strip",
      evidenceIds: args.evidenceGraph.factTable.items.slice(0, 4).map((item) => item.id),
      moduleHints: ["core.metrics"],
    });
  }

  if (openingPageCount >= 2) {
    const primaryTimeline = args.evidenceGraph.timelineSets.find(isStrongTimelineSet) ?? null;
    const primaryComparison = args.evidenceGraph.comparisonSets.find(isStrongComparisonSet) ?? null;
    const desiredChartKind: V2RecipePlanPage["desiredChartKind"] =
      primaryTimeline
        ? "line"
        : primaryComparison
          ? primaryComparison.items.some((item) => (item.numericValue ?? 0) < 0)
            ? "waterfall"
            : "bar"
          : "none";
    const evidenceIds = primaryTimeline
      ? args.evidenceGraph.nodes
          .filter((node) => node.kind === "timeline")
          .slice(0, 6)
          .map((node) => node.id)
      : primaryComparison
        ? primaryComparison.items.slice(0, 5).map((_, index) => `${primaryComparison.id}-item-${index + 1}`)
        : args.evidenceGraph.factTable.items.slice(0, 4).map((item) => item.id);
    pages.push({
      pageNumber: 2,
      pageTitle: primaryTimeline
        ? compactBoardTitle(
            `${primaryTimeline.title} trajectory`,
            thinkingMode === "strategy"
              ? "Performance shift"
              : thinkingMode === "case-study"
                ? "Case turning point"
                : thinkingMode === "academic-research"
                  ? "Method and key pattern"
                  : neutralPatternTitle,
            7,
          )
        : primaryComparison
          ? compactBoardTitle(
              primaryComparison.title,
              thinkingMode === "strategy"
                ? "Performance shift"
                : thinkingMode === "case-study"
                  ? "Challenge pattern"
                  : thinkingMode === "academic-research"
                    ? "Method and key pattern"
                    : neutralPatternTitle,
              7,
            )
          : thinkingMode === "strategy"
            ? "Performance shift"
            : thinkingMode === "case-study"
              ? "Challenge pattern"
              : thinkingMode === "academic-research"
                ? "Method and key pattern"
                : neutralPatternTitle,
      objective:
        thinkingMode === "strategy"
          ? "Show the evidence pattern that changes the decision."
          : thinkingMode === "case-study"
            ? "Show the challenge pattern that defines the case."
            : thinkingMode === "academic-research"
              ? "Show the method or empirical pattern that anchors the study."
              : "Show the core evidence pattern.",
      insight: primaryTimeline
        ? clampText(
            `${primaryTimeline.categories[0] ?? "Start"} to ${
              primaryTimeline.categories[primaryTimeline.categories.length - 1] ?? "finish"
            } shows the main directional shift.`,
            260,
          )
        : primaryComparison
          ? clampText(
              primaryComparison.items
                .slice(0, 2)
                .map((item) => `${item.label} at ${item.valueText}`)
                .join(" versus "),
              260,
            )
          : clampText(strongestClaim, 260),
      pageClass: "opening-core",
      compositionHint:
        desiredChartKind === "none"
          ? "Compose this as an asymmetrical evidence split, not another hero page."
          : "Give the core evidence pattern the largest visual field and keep commentary peripheral.",
      layout: desiredChartKind === "none" ? "comparison" : "chart-insight",
      desiredChartKind,
      composite: desiredChartKind === "none" ? "annotation-rail" : "decision-footer",
      evidenceIds,
      moduleHints: buildModuleHintsForChart(desiredChartKind),
    });
  }

  if (openingPageCount >= 3) {
    const openingBundle = evidenceBundles[0] ?? null;
    const desiredChartKind = openingBundle?.chartCandidate ?? "none";
    pages.push({
      pageNumber: 3,
      pageTitle: openingBundle
        ? compactBoardTitle(
            openingBundle.title,
            thinkingMode === "strategy"
              ? "Strategic implications"
              : thinkingMode === "case-study"
                ? "Intervention and response"
                : thinkingMode === "academic-research"
                  ? "Interpretation frame"
                  : neutralInterpretationTitle,
            7,
          )
        : thinkingMode === "strategy"
          ? "Strategic implications"
          : thinkingMode === "case-study"
            ? "Intervention and response"
            : thinkingMode === "academic-research"
              ? "Interpretation frame"
              : neutralInterpretationTitle,
      objective:
        thinkingMode === "strategy"
          ? "Interpret why the primary evidence matters for the decision."
          : thinkingMode === "case-study"
            ? "Show how the intervention changed the case."
            : thinkingMode === "academic-research"
              ? "Interpret what the early evidence says."
              : "Interpret why the primary evidence matters.",
      insight: openingBundle?.summary
        ? clampText(openingBundle.summary, 260)
        : clampText(
            args.evidenceGraph.claims[1] ?? strongestClaim,
            260,
          ),
      pageClass: "opening-core",
      compositionHint:
        desiredChartKind === "none"
          ? "Treat this as an editorial synthesis page with a different reading rhythm from the first two pages."
          : "Use a proof-led composition that feels distinct from the prior chart page.",
      layout: desiredChartKind === "none" ? "hero-proof" : "comparison",
      desiredChartKind,
      composite: desiredChartKind === "none" ? "none" : "annotation-rail",
      evidenceIds: openingBundle?.evidenceIds.length
        ? openingBundle.evidenceIds
        : args.evidenceGraph.factTable.items.slice(1, 5).map((item) => item.id),
      moduleHints: desiredChartKind === "none" ? ["core.metrics", "core.matrix"] : buildModuleHintsForChart(desiredChartKind),
    });
  }

  const evidenceCandidates = evidenceBundles.slice(0, Math.max(proofPageCount, 5));
  while (pages.length < openingPageCount + proofPageCount) {
    const evidenceIndex = pages.length - openingPageCount;
    const bundle = evidenceCandidates[evidenceIndex] ?? evidenceBundles[evidenceIndex] ?? null;
    const desiredChartKind = bundle?.chartCandidate ?? "none";
    const fallbackSummary =
      bundle?.summary ??
      args.evidenceGraph.claims[evidenceIndex + 1] ??
      strongestClaim;
    pages.push({
      pageNumber: pages.length + 1,
      pageTitle: bundle
        ? compactBoardTitle(
            bundle.title,
            thinkingMode === "case-study"
              ? `Case evidence ${evidenceIndex + 1}`
              : thinkingMode === "academic-research"
                ? `Results page ${evidenceIndex + 1}`
                : deriveSpecificStudioTitle({
                    seeds: [bundle.title, bundle.summary, primaryStoryLabel, strongestClaim],
                    fallback: `Proof focus ${evidenceIndex + 1}`,
                    shortSuffix: "proof",
                    maxWords: 7,
                  }),
            7,
          )
        : thinkingMode === "case-study"
          ? `Case evidence ${evidenceIndex + 1}`
          : thinkingMode === "academic-research"
            ? `Results page ${evidenceIndex + 1}`
            : deriveSpecificStudioTitle({
                seeds: [fallbackSummary, primaryStoryLabel, strongestClaim, args.payload.brief],
                fallback: `Proof focus ${evidenceIndex + 1}`,
                shortSuffix: "proof",
                maxWords: 7,
              }),
      objective:
        thinkingMode === "strategy"
          ? "Prove one focused strategic point."
          : thinkingMode === "case-study"
            ? "Show one focused stage of the case with supporting proof."
            : thinkingMode === "academic-research"
              ? "Show one focused result or analytical pattern."
              : "Prove one focused analytical point.",
      insight: clampText(fallbackSummary, 260),
      pageClass: "proof-analysis",
      compositionHint:
        evidenceIndex % 3 === 0
          ? "Use one anchor evidence region with a slim supporting annotation field."
          : evidenceIndex % 3 === 1
            ? "Let the proof read as an unequal split view, not a repeated left-right template."
            : "Favor a stacked editorial evidence composition with one primary visual field.",
      layout:
        desiredChartKind === "line" || desiredChartKind === "stacked"
          ? "chart-insight"
          : desiredChartKind === "bar" || desiredChartKind === "waterfall"
            ? "comparison"
            : "hero-proof",
      desiredChartKind,
      composite: desiredChartKind === "none" ? "none" : "annotation-rail",
      evidenceIds: bundle?.evidenceIds.length
        ? bundle.evidenceIds
        : args.evidenceGraph.factTable.items
            .slice(evidenceIndex, evidenceIndex + 4)
            .map((item) => item.id),
      moduleHints:
        desiredChartKind === "none"
          ? ["core.metrics", "core.matrix"]
          : buildModuleHintsForChart(desiredChartKind),
    });
  }

  for (let tailIndex = 0; tailIndex < synthesisPageCount; tailIndex += 1) {
    const bundle = evidenceBundles[proofPageCount + tailIndex] ?? null;
    const pageNumber = pages.length + 1;
    if (tailIndex === 0) {
      pages.push({
        pageNumber,
        pageTitle:
          thinkingMode === "strategy"
            ? "Decision priorities"
            : thinkingMode === "case-study"
              ? "Outcome and lesson"
              : thinkingMode === "academic-research"
                ? "Interpretation"
                : neutralSynthesisTitle,
        objective:
          thinkingMode === "strategy"
            ? "Prioritize the next decisions."
            : thinkingMode === "case-study"
              ? "Show the outcome and the lesson the case supports."
              : thinkingMode === "academic-research"
                ? "Interpret the findings without overstating them."
                : "Synthesize the story into one main takeaway.",
        insight: clampText(
          thinkingMode === "strategy"
            ? `${primaryStoryLabel} now needs one clear decision path.`
            : thinkingMode === "case-study"
              ? `${primaryStoryLabel} now resolves most clearly through the outcome and lesson.`
              : thinkingMode === "academic-research"
                ? `${primaryStoryLabel} now supports one careful interpretation.`
                : `${primaryStoryLabel} now supports one clear synthesis.`,
          260,
        ),
        pageClass: "synthesis-support",
        compositionHint:
          thinkingMode === "strategy"
            ? "Use a directional decision sequence with clear progression instead of stacked narrative boxes."
            : thinkingMode === "case-study"
              ? "Land the case through one visible outcome and one brief lesson rather than a recommendation memo."
              : thinkingMode === "academic-research"
                ? "Keep the page interpretive and restrained, with one result reading and minimal side commentary."
                : "Use one clear synthesis path instead of stacked narrative boxes.",
        layout: "sequence",
        desiredChartKind: "none",
        composite: "none",
        evidenceIds: bundle?.evidenceIds.length
          ? bundle.evidenceIds
          : args.evidenceGraph.factTable.items.slice(0, 4).map((item) => item.id),
        moduleHints: ["core.flow"],
      });
      continue;
    }

    if (tailIndex === 1) {
      pages.push({
        pageNumber,
        pageTitle:
          thinkingMode === "strategy"
            ? "Risks and guardrails"
            : thinkingMode === "case-study"
              ? "Constraints and follow-through"
              : thinkingMode === "academic-research"
                ? "Limitations and next work"
                : "Open questions and conditions",
        objective:
          thinkingMode === "strategy"
            ? "Surface the risks that shape the recommendation."
            : thinkingMode === "case-study"
              ? "Surface the constraints that shaped the case and what remained unresolved."
              : thinkingMode === "academic-research"
                ? "Acknowledge limitations and define the next research step."
                : "Surface the conditions or open questions that qualify the story.",
        insight: clampText(
          bundle?.summary ??
            (thinkingMode === "strategy"
              ? "Execution credibility depends on a small set of explicit guardrails."
              : thinkingMode === "case-study"
                ? "The case still depends on a few explicit constraints and follow-through conditions."
                : thinkingMode === "academic-research"
                  ? "The findings are strongest when the main limits and next work are stated explicitly."
                  : "The story depends on a small set of explicit qualifiers."),
          260,
        ),
        pageClass: "synthesis-support",
        compositionHint:
          thinkingMode === "strategy"
            ? "Keep this page compact and comparative, with risk and guardrail tension visible at a glance."
            : thinkingMode === "academic-research"
              ? "Keep this page compact and structured, with limitations and next work visible at a glance."
              : "Keep this page compact and comparative, with the qualifying tension visible at a glance.",
        layout: "comparison",
        desiredChartKind: bundle?.chartCandidate ?? "none",
        composite: bundle?.chartCandidate && bundle.chartCandidate !== "none" ? "annotation-rail" : "none",
        evidenceIds: bundle?.evidenceIds.length
          ? bundle.evidenceIds
          : args.evidenceGraph.factTable.items.slice(2, 6).map((item) => item.id),
        moduleHints:
          bundle?.chartCandidate && bundle.chartCandidate !== "none"
            ? buildModuleHintsForChart(bundle.chartCandidate)
            : ["core.matrix", "core.metrics"],
      });
      continue;
    }

    const supportNumber = tailIndex - 1;
    const desiredChartKind = bundle?.chartCandidate ?? "none";
    pages.push({
      pageNumber,
      pageTitle: bundle
        ? compactBoardTitle(
            `${
              thinkingMode === "case-study"
                ? `Supporting detail ${supportNumber}`
                : thinkingMode === "academic-research"
                  ? `Supporting result ${supportNumber}`
                  : "Supporting focus"
            }: ${bundle.title}`,
            thinkingMode === "case-study"
              ? `Supporting detail ${supportNumber}`
              : thinkingMode === "academic-research"
                  ? `Supporting result ${supportNumber}`
                  : deriveSpecificStudioTitle({
                      seeds: [bundle.title, bundle.summary, primaryStoryLabel, strongestClaim],
                      fallback: `Support focus ${supportNumber}`,
                      shortSuffix: "support",
                      maxWords: 7,
                    }),
            7,
          )
        : thinkingMode === "case-study"
          ? `Supporting detail ${supportNumber}`
          : thinkingMode === "academic-research"
            ? `Supporting result ${supportNumber}`
            : deriveSpecificStudioTitle({
                seeds: [primaryStoryLabel, strongestClaim, args.payload.brief],
                fallback: `Support focus ${supportNumber}`,
                shortSuffix: "support",
                maxWords: 7,
              }),
      objective: "Capture one compact supporting proof point.",
      insight: clampText(
        bundle?.summary ?? "Provide one compact supporting evidence snapshot without overloading the page.",
        260,
      ),
      pageClass: "synthesis-support",
      compositionHint:
        supportNumber % 2 === 1
          ? "Use a compact single-column support composition with one dominant artifact."
          : "Use a slim dual-zone support layout that stays visually lighter than the main proof pages.",
      layout:
        desiredChartKind === "none"
          ? "comparison"
          : desiredChartKind === "line" || desiredChartKind === "stacked"
            ? "chart-insight"
            : "comparison",
      desiredChartKind,
      composite: desiredChartKind === "none" ? "none" : "metric-strip",
      evidenceIds: bundle?.evidenceIds.length
        ? bundle.evidenceIds
        : args.evidenceGraph.factTable.items.slice(tailIndex, tailIndex + 4).map((item) => item.id),
      moduleHints:
        desiredChartKind === "none"
          ? ["core.metrics", "core.matrix"]
          : buildModuleHintsForChart(desiredChartKind),
    });
  }

  return {
    title: compactBoardTitle(
      thinkingMode === "strategy"
        ? `${primaryStoryLabel} long-form strategy review`
        : thinkingMode === "case-study"
          ? `${primaryStoryLabel} long-form case study`
          : thinkingMode === "academic-research"
            ? `${primaryStoryLabel} long-form research deck`
            : `${primaryStoryLabel} long-form report`,
      "Generated studio report",
      7,
    ),
    pages,
  } satisfies PageRecipePlan;
}

function buildHeuristicRecipePlan(args: {
  payload: GenerateStudioReportRequest;
  evidenceGraph: EvidenceGraph;
  modules: PublishedModuleManifest[];
  thinkingContext: ResolvedThinkingContext;
  briefSynthesis: StudioBriefSynthesis;
}) {
  if (isLongFormGenerationRequest(args.payload)) {
    return buildLongFormHeuristicRecipePlan(args);
  }
  return buildStandardHeuristicRecipePlan(args);
}

function buildChartPageContractLines(intent: ChartPageIntent) {
  if (!intent.enabled) {
    return [];
  }

  return [
    "This page is a chart-first page.",
    "Build the page around one dominant chart or composite figure, not multiple equal-weight regions.",
    "Let the chart occupy the main visual field; center-stage, full-width, or asymmetrical placements are all acceptable.",
    "Treat the chart height as unpredictable; do not depend on free space underneath it for long copy.",
    "Keep interpretation in a compact annotation cluster, inset, or slim explanation zone.",
    ...intent.explanationBudget,
    "Do not place long narrative paragraphs below the chart.",
    "Do not add a heavy footer, a second comparison block, or multiple narrative cards.",
    "If the page needs sophistication, express it inside the primary chart rather than adding more regions.",
    ...(intent.question ? [`Primary chart question: ${intent.question}.`] : []),
  ];
}

function buildPageVisualOperatorLines(args: {
  templateOptions: PublishedModuleManifest[];
  chartPageIntent?: ChartPageIntent;
  heroModelIntent?: HeroModelIntent;
  freeformLayoutPlan?: FreeformLayoutPlan | null;
}) {
  if (args.heroModelIntent?.enabled) {
    return [
      "Visual operator: explicit 3D hero page with one dominant object and compact annotations.",
      "Keep the hero object primary; do not flatten it into a generic two-column explainer.",
    ];
  }

  if (args.chartPageIntent?.enabled) {
    return [
      "Visual operator: chart-first page with one dominant figure and only a compact explanation zone.",
      "Keep the chart as the primary proof surface instead of adding equal-weight cards.",
    ];
  }

  if (args.templateOptions.length > 0) {
    const primary = args.templateOptions[0]!;
    return [
      `Visual operator: shape-first template ${primary.label || primary.moduleId}.`,
      "Preserve the primary geometry, hide optional slots when content is weak, and never invent filler to satisfy the template.",
    ];
  }

  if (args.freeformLayoutPlan) {
    return [
      `Visual operator: freeform family ${args.freeformLayoutPlan.layoutFamily}.`,
      `Use ${args.freeformLayoutPlan.visualAnchor} as the visual anchor and avoid a default left/right rail.`,
    ];
  }

  return ["Visual operator: use one dominant region and keep secondary support visibly subordinate."];
}

function summarizeHeroFamilyLabel(family: HeroObjectFamily | null) {
  switch (family) {
    case "chip-die-substrate":
      return "chip / die / substrate object";
    case "platform-stack":
      return "platform stack object";
    case "interconnect-fabric":
      return "interconnect fabric object";
    case "system-cutaway":
      return "system cutaway object";
    default:
      return "core system object";
  }
}

function summarizeHeroCompositionFamily(family: HeroCompositionFamily | null) {
  switch (family) {
    case "right-dominant-cutaway":
      return "right-dominant cutaway";
    case "exploded-stack":
      return "exploded stack";
    case "layered-chip-slab":
      return "layered chip slab";
    case "platform-block-diagram-3d":
      return "3D platform block diagram";
    default:
      return "hero model";
  }
}

function buildHeroReferenceContext(args: {
  skill: LoadedStudio3dHeroSkill;
  intent: HeroModelIntent;
  stage: "planning" | "render" | "repair";
}) {
  if (!args.intent.enabled) {
    return {
      lines: [] as string[],
      referenceFiles: [] as string[],
    };
  }

  const referenceSections: Array<{ title: string; name: Studio3dHeroReferenceName; body: string }> = [];
  const compositionReference = args.skill.references["composition-families"];
  const materialReference = args.skill.references["material-and-annotation-language"];
  const examplesReference = args.skill.references["prompt-examples"];
  const objectReference = args.skill.references["object-grammar-chip-platform"];

  const objectSection = args.intent.objectFamily
    ? extractMarkdownSection(objectReference.body, args.intent.objectFamily)
    : "";
  if (objectSection) {
    referenceSections.push({
      title: "3D hero object grammar",
      name: "object-grammar-chip-platform",
      body: objectSection,
    });
  }

  const compositionSection = args.intent.recommendedCompositionFamily
    ? extractMarkdownSection(compositionReference.body, args.intent.recommendedCompositionFamily)
    : "";
  if (compositionSection) {
    referenceSections.push({
      title: "3D hero composition family",
      name: "composition-families",
      body: compositionSection,
    });
  }

  referenceSections.push({
    title: "3D hero material and annotation language",
    name: "material-and-annotation-language",
    body: materialReference.body,
  });

  if (args.stage !== "planning" && args.intent.objectFamily) {
    const exampleSection = extractMarkdownSection(examplesReference.body, args.intent.objectFamily);
    if (exampleSection) {
      referenceSections.push({
        title: "3D hero prompt examples",
        name: "prompt-examples",
        body: exampleSection,
      });
    }
  }

  const uniqueFiles = Array.from(new Set(referenceSections.map((section) => section.name)));
  return {
    lines: referenceSections.flatMap((section) => ["", `## ${section.title}`, section.body]),
    referenceFiles: uniqueFiles,
  };
}

function buildHeroModelContractLines(intent: HeroModelIntent, artDirection: DeckHeroArtDirection) {
  if (!intent.enabled) {
    return [];
  }

  return [
    "This page is a 3D hero-model page.",
    `Object family: ${summarizeHeroFamilyLabel(intent.objectFamily)}.`,
    `Recommended composition family: ${summarizeHeroCompositionFamily(intent.recommendedCompositionFamily)}.`,
    "Build the page around one dominant pseudo-3D object, usually on the right, with the narrative on the left.",
    "The model is the explanatory center of the page, not decoration.",
    "Do not turn the right side into a dashboard, icon collage, or multi-card panel.",
    "Use HTML/CSS depth cues such as perspective, layered planes, thickness, highlights, shadows, etched detail, and restrained callout labels.",
    "The model should show at least three or four clear spatial cues so it feels fabricated and layered.",
    ...(intent.materialHints.length > 0 ? intent.materialHints : []),
    ...(intent.annotationMode ? [`Annotation mode: ${intent.annotationMode}.`] : []),
    ...intent.narrativeBudget,
    `Material direction: ${artDirection.materialDirection}`,
    `Spatial mood: ${artDirection.spatialMood}`,
    `Annotation tone: ${artDirection.annotationTone}`,
    `Explanation direction: ${artDirection.explanationDirection}`,
    `Object vocabulary: ${artDirection.objectVocabulary.join(", ")}.`,
    `Structural language: ${artDirection.structuralLanguage.join(", ")}.`,
    ...artDirection.guidance,
    ...(intent.objectFocus ? [`Core object: ${intent.objectFocus}.`] : []),
  ];
}

export function buildSkillBackedPagePrompt(args: {
  brief: string;
  deckTitle: string;
  page: PageRecipe;
  allPages: PageRecipe[];
  skill: LoadedStudioAnalysisSkill;
  thinkingContext: ResolvedThinkingContext;
  thinkingSkill?: LoadedStudioThinkingModeSkill | null;
  moduleOptions: PublishedModuleManifest[];
  styleProfile: DeckStyleProfile;
  compositionBrief: DeckCompositionBrief;
  usedCompositionFingerprints: PageCompositionFingerprint[];
  chartPageIntent: ChartPageIntent;
  heroSkill: LoadedStudio3dHeroSkill;
  heroModelIntent: HeroModelIntent;
  heroArtDirection: DeckHeroArtDirection;
  heroReferenceLines: string[];
  briefSynthesis?: StudioBriefSynthesis;
  complexityProfile?: StudioComplexityProfile;
  freeformLayoutPlan?: FreeformLayoutPlan | null;
  evalOverrides?: StudioEvalOverrides | null;
  preflight?: StudioPreflightPlan | null;
}) {
  const complexityProfile =
    args.complexityProfile ??
    resolveStudioComplexityProfile({
      brief: args.brief,
      inputs: args.thinkingContext.inputs,
    });
  const workingMemory =
    args.briefSynthesis?.workingMemory ??
    buildStudioWorkingMemory({
      brief: args.brief,
      inputs: args.thinkingContext.inputs,
      requestedPageCount: args.allPages.length,
    });
  const preflight =
    args.preflight ??
    buildFallbackStudioPreflightPlan({
      brief: args.brief,
      requestedPageCount: args.allPages.length,
    });
  const chartBlock = args.page.chartSpec
    ? [
        `Suggested chart candidate: ${args.page.chartSpec.kind}.`,
        `Chart evidence: ${args.page.chartSpec.categories.join(", ")}.`,
        `Chart unit: ${args.page.chartSpec.unit}.`,
        `Chart insight: ${args.page.chartSpec.insight}.`,
      ]
    : args.chartPageIntent.enabled
      ? [
          "This page should resolve as one dominant chart page, even if the proof is a simple before/after or focused comparison.",
          "Use the chart as the primary proof surface and keep the explanation peripheral.",
          ...args.chartPageIntent.explanationBudget,
        ]
      : [];
  const templateOptions = selectStudioTemplateWorkspaceManifests({
    moduleOptions: args.moduleOptions,
    heroModelIntent: args.heroModelIntent,
    chartKind: args.page.chartSpec?.kind ?? null,
  });
  const layoutPlanningDisabled = args.evalOverrides?.disableLayoutPlanningBlock === true;
  const freeformLayoutPlan =
    layoutPlanningDisabled
      ? null
      : (args.freeformLayoutPlan ??
        resolveFreeformLayoutPlan({
          selectedTemplateCount: templateOptions.length,
          chartPageIntent: args.chartPageIntent,
          hasChartSpec: Boolean(args.page.chartSpec),
          heroModelIntent: args.heroModelIntent,
          mode: args.thinkingContext.mode,
          pageClass: args.page.pageClass,
          pageNumber: args.page.pageNumber,
          pageCount: args.allPages.length,
          supportCount: args.page.supportBullets.length,
          evidenceCount: args.page.evidenceBullets.length,
          synthesis: args.briefSynthesis,
          complexityProfile,
          usedCompositionFingerprints: args.usedCompositionFingerprints,
        }));
  const densityBudgetBlock = describeDensityBudget(
    args.page.pageClass,
    args.page.densityBudget,
  );
  const compositionHintBlock = args.page.compositionHint
    ? [`Composition hint: ${args.page.compositionHint}`]
    : [];
  const pageArgumentBlock = buildPageArgumentContract({
    pageQuestion: args.page.objective,
    questionLabel: args.thinkingContext.plugin.questionLabel,
    headlineClaim: args.page.heroClaim,
    supportBullets: args.page.supportBullets,
    evidenceCallouts: args.page.evidenceBullets,
    takeaway: args.page.takeaway,
    allowEvidenceException:
      args.page.layout === "comparison" ||
      args.page.layout === "chart-insight" ||
      Boolean(args.page.chartSpec),
  });
  const pageMission = findStudioPageMission({
    preflight,
    pageNumber: args.page.pageNumber,
    fallbackTitle: args.page.pageTitle,
    fallbackMission: args.page.objective,
  });
  const capabilityCards = buildPreflightCapabilityCards({
    preflight,
    baseCards: [
      createStudioCapabilityCard({
      id: "density-budget",
      title: "Density budget",
      lines: densityBudgetBlock,
      maxLines: 4,
    }),
    createStudioCapabilityCard({
      id: "style-direction",
      title: "Style direction",
      lines: buildDeckStylePromptLines(args.styleProfile),
      maxLines: 4,
    }),
    ...(chartBlock.length > 0 || args.chartPageIntent.enabled
      ? [
          createStudioCapabilityCard({
            id: "chart",
            title: "Chart",
            lines: [
              ...chartBlock,
              ...(args.chartPageIntent.enabled
                ? buildChartPageContractLines(args.chartPageIntent)
                : []),
            ],
            maxLines: 4,
          }),
        ]
      : []),
    ...(templateOptions.length > 0
      ? [
          createStudioCapabilityCard({
            id: "template",
            title: "Template",
            lines: [
              `Primary template: ${templateOptions[0]?.label || templateOptions[0]?.moduleId}.`,
              "Treat the template as a shape contract, not as a script.",
              "Hide optional slots when content is weak and never invent filler.",
            ],
            maxLines: 4,
          }),
        ]
      : []),
    ...(args.heroModelIntent.enabled
      ? [
          createStudioCapabilityCard({
            id: "explicit-3d",
            title: "Explicit 3D",
            body: args.heroSkill.body,
            fallbackLines: [
              ...args.heroReferenceLines,
              ...buildHeroModelContractLines(args.heroModelIntent, args.heroArtDirection),
            ],
            maxLines: 4,
          }),
        ]
      : []),
    ],
  });
  const visualOperatorLines = buildPageVisualOperatorLines({
    templateOptions,
    chartPageIntent: args.chartPageIntent,
    heroModelIntent: args.heroModelIntent,
    freeformLayoutPlan,
  });
  const workspace = buildStudioAiWorkspace({
    stage: "page",
    thinkingContext: args.thinkingContext,
    workingMemory,
    preflight,
    workloadLane: complexityProfile.workloadLane,
    rigorLevel: complexityProfile.rigorLevel,
    taskGrammarPackIds: complexityProfile.taskGrammarPacks.map((pack) => pack.id),
    sourceMaxItems: 4,
    freeformLayoutPlan,
    pageMission,
    pageIntentLines: [
      `Mission: ${pageMission.mission}`,
      `Headline claim: ${pageMission.headlineClaim}`,
    ],
    templateManifests: templateOptions,
    capabilityCards,
    visualOperatorLines,
    visualThinkingLines: buildVisualThinkingLines({
      preflight,
      visualOperatorLines,
      freeformLayoutPlan,
      preferredVisual: pageMission.preferredVisual,
    }),
    specializedArtifact: args.briefSynthesis?.specializedArtifact ?? complexityProfile.specializedArtifact,
    outputRules: [
      'Output raw HTML only, starting with "<!DOCTYPE html>".',
      "Output a full HTML document with exactly one <section class=\"page\"> block.",
      "Use inline style attributes only. Do not use <style>, <script>, <link>, external assets, or markdown fences.",
      "The single page must be exactly 1600px by 900px.",
      `The section must include data-page-number="${args.page.pageNumber}" and data-page-title="${escapeHtml(args.page.pageTitle)}".`,
      "The data-page-title must be audience-facing, specific, and grounded in the user brief or page claim; never use internal placeholders like Core thesis, Opening thesis, or Page 1.",
      "No internal scrolling, no cut-off content, and no placeholder language.",
      "Use Visual thinking privately before writing HTML. Do not output the reasoning or scaffold.",
      "If no template is active, do not default to a generic left/right split.",
      "If content is sparse, preserve negative space and scale the main claim rather than inventing filler cards.",
      "Keep the page light, restrained, and professional.",
      "Design a fresh, coherent light-theme visual system for this deck and keep it consistent across pages.",
      `Page class: ${args.page.pageClass}.`,
      ...(preflight.evidencePolicy.tier === "source-backed"
        ? ["Every hard metric, label, or chart claim must be traceable to the raw brief."]
        : [
            "If quantitative evidence is missing, use conceptual, qualitative, or assumption-labeled visuals instead of fake data charts.",
            "Do not fabricate citations, dated facts, precise market sizes, or valuation multiples.",
          ]),
      "Let the raw brief and current page mission choose the composition. Do not fall back to the same safe layout every time.",
    ],
  });
  const renderedWorkspace = renderStudioAiWorkspace(workspace);
  const prompt = [
    "You are Codex generating one HTML report page.",
    "Use the AI workspace below in priority order; do not let capability cards override the raw brief or the current page mission.",
    "",
    renderedWorkspace.text,
  ].join("\n");
  rememberStudioAiWorkspacePromptMeta(prompt, renderedWorkspace.meta);
  return prompt;
}

function resolveStageTimeoutSec(stage: string) {
  if (stage.startsWith("repair-page-")) {
    return 170;
  }
  if (stage.startsWith("page-render-")) {
    return 120;
  }
  return 95;
}

async function mapWithConcurrency<TItem, TResult>(
  items: TItem[],
  limit: number,
  worker: (item: TItem, index: number) => Promise<TResult>,
) {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }).map(async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await worker(items[currentIndex]!, currentIndex);
      }
    }),
  );

  return results;
}

function pickBestModuleManifest(args: {
  page: V2RecipePlanPage;
  manifests: PublishedModuleManifest[];
  chartKind?: ModuleChartKind | null;
}) {
  return rankModuleManifestsForPage(args)[0]?.manifest ?? null;
}

function createBarLikeChartSpec(
  set: ComparisonSet,
  kind: Extract<ModuleChartKind, "bar" | "waterfall">,
  insight: string,
  sourceEvidenceIds: string[],
): ChartSpec {
  return {
    kind,
    categories: set.items.map((item) => item.label),
    series: [
      {
        name: kind === "waterfall" ? "Delta" : "Value",
        values: set.items.map((item) => item.numericValue ?? 0),
      },
    ],
    unit: inferUnitFromText(set.items.map((item) => item.valueText).join(" ")) ?? "value",
    title: set.title,
    insight,
    confidence: 0.78,
    fallbackMode: kind === "waterfall" ? "annotation" : "comparison",
    sourceEvidenceIds,
  };
}

function createLineChartSpec(
  set: TimelineSet,
  insight: string,
  sourceEvidenceIds: string[],
): ChartSpec {
  return {
    kind: "line",
    categories: set.categories,
    series: [
      {
        name: set.title,
        values: set.values,
      },
    ],
    unit: set.unit ?? "value",
    title: set.title,
    insight,
    confidence: 0.82,
    fallbackMode: "annotation",
    sourceEvidenceIds,
  };
}

function createStackedChartSpec(
  table: SeriesTable,
  insight: string,
  sourceEvidenceIds: string[],
): ChartSpec {
  return {
    kind: "stacked",
    categories: table.categories,
    series: table.series,
    unit: table.unit ?? "value",
    title: table.title,
    insight,
    confidence: 0.74,
    fallbackMode: "metric-strip",
    sourceEvidenceIds,
  };
}

function resolveChartSpec(args: {
  page: V2RecipePlanPage;
  evidenceGraph: EvidenceGraph;
  allowFlexibleChart?: boolean;
}) {
  const desiredChartKind = args.page.desiredChartKind;
  const sourceEvidenceIds = args.page.evidenceIds.slice(0, 6);
  const flexibleChartOk = args.allowFlexibleChart || args.page.layout === "chart-insight";

  if (desiredChartKind === "line") {
    const timeline = findTimelineSetForPage(args.page, args.evidenceGraph);
    if (timeline && (isStrongTimelineSet(timeline) || (flexibleChartOk && isRenderableTimelineSet(timeline)))) {
      return createLineChartSpec(timeline, args.page.insight, sourceEvidenceIds);
    }
    return null;
  }

  if (desiredChartKind === "stacked") {
    const stacked = args.evidenceGraph.seriesTables[0];
    if (stacked && isStrongSeriesTable(stacked)) {
      return createStackedChartSpec(stacked, args.page.insight, sourceEvidenceIds);
    }
    return null;
  }

  if (desiredChartKind === "bar" || desiredChartKind === "waterfall") {
    const comparison = findComparisonSetForPage(args.page, args.evidenceGraph);
    if (
      comparison &&
      (isStrongComparisonSet(comparison) || (flexibleChartOk && isRenderableComparisonSet(comparison)))
    ) {
      return createBarLikeChartSpec(comparison, desiredChartKind, args.page.insight, sourceEvidenceIds);
    }
    return null;
  }

  if (args.page.layout === "chart-insight") {
    const timeline = findTimelineSetForPage(args.page, args.evidenceGraph);
    if (timeline && (isStrongTimelineSet(timeline) || isRenderableTimelineSet(timeline))) {
      return createLineChartSpec(
        timeline,
        args.page.insight,
        sourceEvidenceIds,
      );
    }
    const comparison = findComparisonSetForPage(args.page, args.evidenceGraph);
    if (comparison && (isStrongComparisonSet(comparison) || isRenderableComparisonSet(comparison))) {
      return createBarLikeChartSpec(
        comparison,
        "bar",
        args.page.insight,
        sourceEvidenceIds,
      );
    }
  }

  return null;
}

function resolveEvidenceBullets(page: V2RecipePlanPage, evidenceGraph: EvidenceGraph) {
  const evidenceById = new Map(evidenceGraph.nodes.map((node) => [node.id, node] as const));
  const fromIds = page.evidenceIds
    .map((id) => evidenceById.get(id))
    .filter((node): node is EvidenceNode => Boolean(node))
    .map((node) =>
      node.valueText ? `${node.label}: ${node.valueText}` : node.sourceText,
    );

  if (fromIds.length > 0) {
    return uniqueStrings(fromIds).slice(0, 2);
  }

  return uniqueStrings([
    ...evidenceGraph.factTable.items.slice(0, 3).map((item) => `${item.label}: ${item.valueText ?? item.sourceText}`),
    ...evidenceGraph.claims.slice(0, 2),
  ]).slice(0, 2);
}

function resolveSupportBullets(page: V2RecipePlanPage, evidenceGraph: EvidenceGraph) {
  return uniqueStrings([
    ...evidenceGraph.claims.slice(0, 3),
    page.objective,
  ])
    .map((item) => clampText(item, 120))
    .slice(0, 2);
}

function resolveRelevantEvidenceBundle(page: V2RecipePlanPage, evidenceGraph: EvidenceGraph) {
  const evidenceById = new Map(evidenceGraph.nodes.map((node) => [node.id, node] as const));
  const directEvidence = page.evidenceIds
    .map((id) => evidenceById.get(id))
    .filter((node): node is EvidenceNode => Boolean(node))
    .map((node) => clampText(node.sourceText || `${node.label}${node.valueText ? `: ${node.valueText}` : ""}`, 220));

  if (directEvidence.length > 0) {
    return uniqueStrings(directEvidence).slice(0, 5);
  }

  return uniqueStrings([
    ...evidenceGraph.factTable.items
      .slice(0, 3)
      .map((item) => clampText(item.sourceText || `${item.label}: ${item.valueText ?? ""}`, 220)),
    ...evidenceGraph.claims.slice(0, 2).map((item) => clampText(item, 220)),
  ]).slice(0, 5);
}

function rankModuleManifestsForPage(args: {
  page: V2RecipePlanPage;
  manifests: PublishedModuleManifest[];
  chartKind?: ModuleChartKind | null;
}) {
  const hints = new Set(args.page.moduleHints.map((item) => item.trim()).filter(Boolean));

  return args.manifests
    .map((manifest) => {
      let score = manifest.trustScore;

      if (hints.has(manifest.moduleId)) {
        score += 3;
      }
      if (args.chartKind && manifest.supportedChartKinds.includes(args.chartKind)) {
        score += 2.5;
      }
      if (args.page.layout === "chart-insight" && manifest.supportedChartKinds.length > 0) {
        score += 1.2;
      }
      if (args.page.layout === "comparison" && (manifest.kind === "bars" || manifest.kind === "matrix")) {
        score += 1.1;
      }
      if (args.page.layout === "sequence" && (manifest.kind === "flow" || manifest.kind === "phases")) {
        score += 1.1;
      }
      if (args.page.layout === "hero-proof" && manifest.kind === "metrics") {
        score += 1;
      }
      if (manifest.deterministicCapability === "hybrid") {
        score += 0.4;
      }
      if (manifest.deterministicCapability === "native") {
        score += 0.25;
      }

      return { manifest, score };
    })
    .sort((left, right) => right.score - left.score);
}

function resolvePageCompositionHint(args: {
  page: V2RecipePlanPage;
  effectiveLayout: PageRecipe["layout"];
  chartSpec: ChartSpec | null;
}) {
  if (args.page.compositionHint?.trim()) {
    return args.page.compositionHint.trim();
  }

  if (args.page.pageClass === "opening-core") {
    if (args.chartSpec) {
      return "Let one dominant chart or proof figure command the page, with only a very short annotation cluster and no long copy beneath it.";
    }
    if (args.effectiveLayout === "comparison") {
      return "Use an unequal editorial split rather than a balanced dashboard look.";
    }
    return "Lead with a thesis block, then arrange supporting proof asymmetrically so the page feels authored rather than templated.";
  }

  if (args.page.pageClass === "proof-analysis") {
    if (args.chartSpec?.kind === "line" || args.chartSpec?.kind === "stacked") {
      return "Make one dominant chart the anchor, keep explanation in compact annotations, and avoid placing long copy below the figure.";
    }
    if (args.chartSpec) {
      return "Build the page around one dominant chart-led evidence field with only a compact explanation zone and minimal secondary clutter.";
    }
    if (args.effectiveLayout === "comparison") {
      return "Organize the page around one dominant comparison field with only one secondary support cluster.";
    }
    return "Use one focused evidence composition with a clear anchor region and minimal secondary clutter.";
  }

  if (args.effectiveLayout === "sequence") {
    return "Keep the page lean and directional, with a clear sequence instead of stacked narrative cards.";
  }

  return "Keep this page compact and decisive, varying the structure from prior pages while preserving a light support role.";
}

function resolvePageRecipe(args: {
  page: V2RecipePlanPage;
  brief: string;
  evidenceGraph: EvidenceGraph;
  briefSynthesis: StudioBriefSynthesis;
  manifests: PublishedModuleManifest[];
  totalPages: number;
}) {
  const chartPriority = resolvePageChartPriority({
    brief: args.brief,
    page: args.page,
  });
  const chartSpec =
    resolveChartSpec({
      page: args.page,
      evidenceGraph: args.evidenceGraph,
      allowFlexibleChart: chartPriority !== "none",
    }) ??
    (chartPriority === "required"
      ? resolveChartSpec({
          page: {
            ...args.page,
            desiredChartKind:
              args.evidenceGraph.timelineSets.some(isRenderableTimelineSet)
                ? "line"
                : args.evidenceGraph.comparisonSets.some(isRenderableComparisonSet)
                  ? "bar"
                  : "none",
            layout: "chart-insight",
          },
          evidenceGraph: args.evidenceGraph,
          allowFlexibleChart: true,
        })
      : null);
  const effectiveLayout =
    args.page.layout === "chart-insight" && !chartSpec ? "comparison" : args.page.layout;
  const pageClass =
    args.page.pageClass ?? resolveLongFormPageClass(args.page.pageNumber, args.totalPages);
  const densityBudget = resolvePageDensityBudget(pageClass);
  const candidateManifests =
    pageClass === "opening-core"
      ? args.manifests.filter((manifest) => manifest.kind === "metrics")
      : pageClass === "synthesis-support"
        ? args.manifests.filter((manifest) =>
            manifest.kind === "metrics" ||
            manifest.kind === "matrix" ||
            manifest.kind === "flow" ||
            manifest.kind === "phases",
          )
        : args.manifests;
  const moduleBinding = pickBestModuleManifest({
    page: {
      ...args.page,
      layout: effectiveLayout,
    },
    manifests: candidateManifests,
    chartKind: chartSpec?.kind ?? null,
  });
  const composite =
    args.page.composite === "none"
      ? chartSpec
        ? "annotation-rail"
        : null
      : args.page.composite;
  const compositionHint = resolvePageCompositionHint({
    page: args.page,
    effectiveLayout,
    chartSpec,
  });
  const synthesizedIntent =
    args.briefSynthesis.pageIntents.find((item) => item.pageNumber === args.page.pageNumber) ??
    args.briefSynthesis.pageIntents[0] ??
    null;

  const recipe = {
    pageNumber: args.page.pageNumber,
    pageTitle: args.page.pageTitle,
    pageIntent: args.page.objective,
    objective: args.page.objective,
    insight: args.page.insight,
    pageClass,
    densityBudget,
    compositionHint,
    layout: effectiveLayout,
    chartPriority,
    evidenceIds: args.page.evidenceIds,
    evidenceBundle: resolveRelevantEvidenceBundle(args.page, args.evidenceGraph),
    heroClaim: synthesizedIntent?.headlineClaim ?? args.page.insight,
    supportBullets:
      synthesizedIntent && args.briefSynthesis.sparseBriefMode
        ? synthesizedIntent.supportBullets
        : resolveSupportBullets(args.page, args.evidenceGraph),
    evidenceBullets:
      synthesizedIntent && args.briefSynthesis.sparseBriefMode
        ? synthesizedIntent.evidenceCallouts
        : resolveEvidenceBullets(args.page, args.evidenceGraph),
    takeaway: synthesizedIntent?.takeaway ?? args.page.objective,
    moduleBinding,
    chartSpec: chartSpec
      ? {
          ...chartSpec,
          composite:
            composite === "metric-strip" ||
            composite === "decision-footer" ||
            composite === "annotation-rail"
              ? composite
              : "annotation-rail",
        }
      : null,
    fallbackReason:
      args.page.desiredChartKind !== "none" && !chartSpec ? "Requested chart data was not strong enough." : null,
    workloadLane: args.briefSynthesis.workloadLane,
    taskGrammarPackIds: args.briefSynthesis.taskGrammarPacks.map((pack) => pack.id),
    complexitySignalPhrases: args.briefSynthesis.complexitySignalPhrases,
  } satisfies PageRecipe;

  return refinePageRecipeIntentWithSynthesis({
    rawBrief: args.brief,
    synthesis: args.briefSynthesis,
    page: recipe,
  }) satisfies PageRecipe;
}

function buildPageRepairProfile(args: {
  measurement: PageFitMeasurement;
  generationMode?: GenerationMode;
  requestedPageCount?: number | null;
  pageCount: number;
}) {
  const isLongForm =
    args.generationMode === "long-form" ||
    (args.requestedPageCount ?? args.pageCount) >= 10;
  const pageClass = isLongForm
    ? resolveLongFormPageClass(args.measurement.pageNumber, args.pageCount)
    : "opening-core";

  return {
    pageClass,
    densityBudget: resolvePageDensityBudget(pageClass),
    overflowCause: args.measurement.dominantOverflowRegion,
    isCriticalPage:
      pageClass === "opening-core" ||
      (pageClass === "proof-analysis" && args.measurement.pageNumber <= 5),
    preserveComposition: true,
  } satisfies PageRepairProfile;
}

function buildLayoutRepairPrompt(args: {
  brief: string;
  skill: LoadedStudioLayoutRepairSkill;
  heroSkill: LoadedStudio3dHeroSkill;
  thinkingContext: ResolvedThinkingContext;
  thinkingSkill?: LoadedStudioThinkingModeSkill | null;
  repairMode: RepairMode;
  pageNumber: number;
  pageTitle: string;
  deckTitle: string;
  deckPageMap: Array<{ pageNumber: number; pageTitle: string }>;
  measurement: PageFitMeasurement;
  sectionHtml: string;
  evidenceGraph: EvidenceGraph;
  briefSynthesis?: StudioBriefSynthesis;
  complexityProfile?: StudioComplexityProfile;
  moduleOptions: PublishedModuleManifest[];
  repairProfile: PageRepairProfile;
  deterministicNotes: string[];
  styleProfile: DeckStyleProfile;
  deckDiversityReport: DeckCompositionDiversityReport;
  chartPageIntent: ChartPageIntent;
  heroModelIntent: HeroModelIntent;
  heroReferenceLines: string[];
  evalOverrides?: StudioEvalOverrides | null;
  preflight?: StudioPreflightPlan | null;
}) {
  const complexityProfile =
    args.complexityProfile ??
    resolveStudioComplexityProfile({
      brief: args.brief,
      inputs: args.thinkingContext.inputs,
    });
  const evidenceBundle = summarizeEvidenceGraphForPrompt(args.evidenceGraph).slice(0, 12);
  const briefDigest = buildBriefDigestForPrompt({
    brief: args.brief,
    evidenceGraph: args.evidenceGraph,
    synthesis: args.briefSynthesis,
    maxItems: 6,
  });
  const repairContext: RepairContextBundle = {
    briefDigest,
    evidenceBundle,
    deckPageMap: args.deckPageMap,
  };
  const templateOptions = selectStudioTemplateWorkspaceManifests({
    moduleOptions: args.moduleOptions,
    heroModelIntent: args.heroModelIntent,
    chartKind: null,
  });
  const layoutPlanningDisabled = args.evalOverrides?.disableLayoutPlanningBlock === true;
  const repairModeGuidance =
    args.repairMode === "aggressive"
      ? [
          "- This is the second repair pass. Be aggressively compact.",
          "- Keep one primary proof region and at most one small secondary support region.",
          "- Shorten paragraphs to one or two sentences and collapse weak side rails.",
          "- If a chart still causes density, replace it with the simplest evidence expression that preserves the truth.",
        ]
      : [
          "- This is the first repair pass. Reduce density while preserving the structure when possible.",
        ];
  const chartRepairBlock = args.chartPageIntent.enabled
    ? [
        "## Chart-first repair rules",
        "This page must remain a chart-first page with one dominant figure.",
        "Preserve the main chart region and its visual priority.",
        "First compress the explanation rail, annotations, footer, and secondary support blocks.",
        "Do not move the narrative below the chart or turn the page into a generic explanatory split.",
        "Only degrade the chart to comparison, metric strip, or annotation if the chart itself remains the overflow root after slimming surrounding copy.",
        ...args.chartPageIntent.explanationBudget,
        "",
      ]
    : [];
  const heroRepairBlock = args.heroModelIntent.enabled
    ? [
        "## 3D hero repair rules",
        "This page must remain a hero-model page with one dominant pseudo-3D object.",
        `Preserve the object family: ${summarizeHeroFamilyLabel(args.heroModelIntent.objectFamily)}.`,
        `Preserve the composition family: ${summarizeHeroCompositionFamily(args.heroModelIntent.recommendedCompositionFamily)}.`,
        "Preserve the model object and its visual priority on the page.",
        "First compress left-side narrative, labels, footer copy, and minor annotations.",
        "Do not flatten the page into a generic two-column explanation layout.",
        "Only simplify outer callouts, ornament, or model-adjacent decoration if fit still fails after slimming copy.",
        "Only as a last resort may the hero page degrade into a simpler structure diagram.",
        ...(args.heroModelIntent.materialHints.length > 0 ? args.heroModelIntent.materialHints : []),
        ...(args.heroModelIntent.annotationMode
          ? [`Keep annotation language consistent with ${args.heroModelIntent.annotationMode}.`]
          : []),
        ...args.heroModelIntent.narrativeBudget,
        "",
      ]
    : [];

  const preflight =
    args.preflight ??
    buildFallbackStudioPreflightPlan({
      brief: args.brief,
      requestedPageCount: args.deckPageMap.length,
    });
  const capabilityCards = buildPreflightCapabilityCards({
    preflight,
    baseCards: [
    createStudioCapabilityCard({
      id: "layout-repair",
      title: "Layout repair",
      body: args.skill.body,
      fallbackLines: repairModeGuidance.map((line) => line.replace(/^-\s*/, "")),
      maxLines: 5,
    }),
    createStudioCapabilityCard({
      id: "density-budget",
      title: "Density budget",
      lines: describeDensityBudget(args.repairProfile.pageClass, args.repairProfile.densityBudget),
      maxLines: 6,
    }),
    createStudioCapabilityCard({
      id: "style-direction",
      title: "Style direction",
      lines: buildDeckStylePromptLines(args.styleProfile),
      maxLines: 5,
    }),
    createStudioCapabilityCard({
      id: "composition-direction",
      title: "Composition direction",
      lines: [
        summarizeDeckCompositionDiversityForPrompt(args.deckDiversityReport),
        ...describeCompositionFreedom(args.repairProfile.pageClass),
        `Preserve composition: ${args.repairProfile.preserveComposition ? "yes" : "no"}`,
      ],
      maxLines: 5,
    }),
    ...(complexityProfile.taskGrammarPacks.length > 0
      ? [
          createStudioCapabilityCard({
            id: "task-grammar",
            title: "Task grammar",
            lines: buildTaskGrammarCardLines(complexityProfile),
            maxLines: 6,
          }),
        ]
      : []),
    ...(args.chartPageIntent.enabled
      ? [
          createStudioCapabilityCard({
            id: "chart",
            title: "Chart repair",
            lines: chartRepairBlock.filter((line) => line && !line.startsWith("##")),
            maxLines: 6,
          }),
        ]
      : []),
    ...(args.heroModelIntent.enabled
      ? [
          createStudioCapabilityCard({
            id: "explicit-3d",
            title: "Explicit 3D repair",
            body: args.heroSkill.body,
            fallbackLines: [
              ...heroRepairBlock.filter((line) => line && !line.startsWith("##")),
              ...args.heroReferenceLines,
            ],
            maxLines: 5,
          }),
        ]
      : []),
    ],
  });
  const pageMission = findStudioPageMission({
    preflight,
    pageNumber: args.pageNumber,
    fallbackTitle: args.pageTitle,
    fallbackMission: `Repair page ${args.pageNumber} while preserving its main claim.`,
  });
  const workspace = buildStudioAiWorkspace({
    stage: "repair",
    thinkingContext: args.thinkingContext,
    preflight,
    workloadLane: complexityProfile.workloadLane,
    rigorLevel: complexityProfile.rigorLevel,
    taskGrammarPackIds: complexityProfile.taskGrammarPacks.map((pack) => pack.id),
    evidenceGraph: args.evidenceGraph,
    sourceMaxItems: 4,
    pageMission,
    pageIntentLines: [
      "Preserve one dominant claim for the page.",
      "Keep at most two support bullets, two evidence callouts, and one takeaway.",
      "Remove weak secondary material before rewriting the page argument.",
      `Page class: ${args.repairProfile.pageClass}`,
      `Overflow cause: ${args.repairProfile.overflowCause}`,
      `Deck title: ${args.deckTitle}`,
      "Deck page map:",
      ...args.deckPageMap.map((page) => `${page.pageNumber}. ${page.pageTitle}`),
      `Current page: ${args.pageNumber}: ${args.pageTitle}`,
      `Original composition fingerprint: ${summarizeCompositionFingerprintForPrompt(args.measurement.compositionFingerprint)}`,
      "Review findings:",
      ...summarizeMeasurementIssues(args.measurement),
      "Primary text overflow roots:",
      ...(args.measurement.predictedOverflowRoots?.length
        ? args.measurement.predictedOverflowRoots
        : ["No predicted text overflow roots were identified."]),
      "Text layout measurements:",
      ...formatTextMeasurementsForPrompt(args.measurement.textMeasurements),
      "Suspect elements:",
      "Target these anchors first before searching the full page. Treat block/layout ids and selectors as the fastest way to find the overflowing or overly dense regions.",
      ...formatMeasurementElements(args.measurement.suspectElements),
      ...(args.deterministicNotes.length > 0
        ? ["Deterministic shrink already applied:", ...args.deterministicNotes]
        : []),
      "Evidence bundle:",
      ...repairContext.evidenceBundle,
      "Brief digest:",
      ...repairContext.briefDigest,
    ],
    pageIntentRawText: ["## Current page HTML", args.sectionHtml].join("\n"),
    templateManifests: templateOptions,
    capabilityCards,
    visualThinkingLines: buildVisualThinkingLines({
      preflight,
      visualOperatorLines: [
        `Current page fingerprint: ${summarizeCompositionFingerprintForPrompt(args.measurement.compositionFingerprint)}`,
        ...(args.chartPageIntent.enabled ? ["Repair around the dominant chart instead of flattening the page."] : []),
        ...(args.heroModelIntent.enabled ? ["Repair around the dominant 3D object instead of flattening the page."] : []),
      ],
      preferredVisual: pageMission.preferredVisual,
    }),
    outputRules: [
      "First, write one short sentence describing the repair strategy.",
      'Immediately after that, output raw HTML only, starting with "<!DOCTYPE html>".',
      "Output a full HTML document with exactly one <section class=\"page\"> block.",
      "Use inline style attributes only. Do not use <style>, <script>, <link>, external assets, or markdown fences.",
      "The single page must remain exactly 1600px by 900px.",
      `Keep data-page-number="${args.pageNumber}".`,
      "Preserve the page role, evidence, and numeric truth. Do not invent new data.",
      "Remove density and simplify secondary regions before changing the thesis.",
      "Fix obvious prompt-leak or truncated titles when they appear.",
      "No internal scrolling, no cut-off content, no placeholder language.",
      "Preserve the existing deck's visual system instead of reverting to a generic palette.",
      "Preserve the page's current composition family and dominant spatial organization whenever possible.",
      "Do not output workspace labels, repair scaffolding, or internal reasoning.",
      ...(preflight.evidencePolicy.tier === "source-backed"
        ? ["Do not invent hard evidence that is not already supported by the raw brief."]
        : [
            "If the page needs evidence framing, keep it qualitative or explicitly assumption-labeled.",
            "Do not turn assumptions into sourced metrics, dated facts, or precise external claims.",
          ]),
      ...repairModeGuidance.map((line) => line.replace(/^-\s*/, "")),
    ],
  });
  const renderedWorkspace = renderStudioAiWorkspace(workspace);
  const prompt = [
    "You are Codex repairing one generated HTML report page after a real render-fit review.",
    "Use the AI workspace below in priority order; repair guidance must not override the user task, page role, or numeric truth.",
    "",
    renderedWorkspace.text,
  ].join("\n");
  rememberStudioAiWorkspacePromptMeta(prompt, renderedWorkspace.meta);
  return prompt;
}

export async function runStudioGenerationV2(args: {
  payload: GenerateStudioReportRequest;
  agentConfig: StudioAgentConfig;
  runId: string;
  signal?: AbortSignal;
  emit?: (event: StudioGenerateStreamEvent) => Promise<void>;
  evalOverrides?: StudioEvalOverrides | null;
  onStageTrace?: (entry: StudioStageTraceEntry) => Promise<void> | void;
}) {
  const emit = args.emit ?? (async () => {});
  const analysisSkill = loadStudioAnalysisSkill();
  const heroSkill = loadStudio3dHeroSkill();
  const isLongForm = isLongFormGenerationRequest(args.payload);
  const pressureBudget = resolveDeckPressureBudget({
    generationMode: args.payload.generationMode,
    pageCount: args.payload.pageCount ?? null,
  });
  await emit({
    type: "run_started",
    runId: args.runId,
  });

  const preflight = await runStudioPreflightStage({
    brief: args.payload.brief,
    requestedPageCount: args.payload.pageCount ?? null,
    agentConfig: args.agentConfig,
    runId: args.runId,
    signal: args.signal,
    emit,
    onStageTrace: args.onStageTrace,
  });

  await emit({
    type: "stage_started",
    runId: args.runId,
    stage: "evidence",
    label: "Synthesizing brief and structuring source evidence",
  });

  const runtimeInputs = createRawBriefThinkingInputs(args.payload.brief);
  const preparation = resolveStudioGenerationPreparation({
    brief: args.payload.brief,
    requestedPageCount: args.payload.pageCount ?? null,
    segmentedInputs: runtimeInputs,
    evalOverrides: args.evalOverrides,
  });
  const complexityProfile = preparation.complexityProfile;
  const thinkingContext = preparation.thinkingContext;
  const briefSynthesis = mergeStudioPreflightIntoBriefSynthesis({
    synthesis: preparation.briefSynthesis,
    preflight,
    rawBrief: args.payload.brief,
  });
  const evidenceGraph = buildEvidenceGraph(
    buildPreflightEvidenceInput({
      brief: args.payload.brief,
      preflight,
    }),
    args.payload.pageCount,
  );
  if (
    evidenceGraph.factTable.items.length === 0 &&
    evidenceGraph.comparisonSets.length === 0 &&
    evidenceGraph.timelineSets.length === 0 &&
    evidenceGraph.claims.length === 0 &&
    briefSynthesis.contentConfidence === "insufficient"
  ) {
    throw new StudioV2FallbackError(
      "evidence_graph_failed",
      "The V2 evidence graph could not find enough usable structure in the brief.",
    );
  }

  await emit({
    type: "assistant_chunk",
    runId: args.runId,
    stage: "evidence",
    content: `Preflight resolved ${preflight.subject} and the render path is keeping the raw brief primary. Evidence graph extracted ${evidenceGraph.factTable.items.length} fact nodes, ${evidenceGraph.comparisonSets.length} comparison sets, and ${evidenceGraph.timelineSets.length} timeline sets from ${briefSynthesis.evidenceSourceUsed}.`,
  });
  const thinkingSkill = loadStudioThinkingModeSkill(thinkingContext.mode);

  await emit({
    type: "stage_started",
    runId: args.runId,
    stage: "modules",
    label: "Loading published template manifests",
  });

  const moduleManifests = buildModuleManifestIndex(args.payload, { phase: "render" });
  const { profile: styleProfile } = resolveDeckStyleProfile({
    brief: args.payload.brief,
    moduleSemanticRoles: [],
  });
  const heroArtDirection = buildDeckHeroArtDirection({
    brief: args.payload.brief,
    styleProfile,
  });
  const reportStyleProfile = toGeneratedReportStyleProfile(styleProfile);
  await emit({
    type: "assistant_chunk",
    runId: args.runId,
    stage: "modules",
    content:
      moduleManifests.length > 0
        ? `Loaded ${moduleManifests.length} published templates for lightweight routing.`
        : "No published templates were available, so built-in composition will take the lead.",
  });
  await emit({
    type: "assistant_chunk",
    runId: args.runId,
    stage: "modules",
    content: `Resolved an implicit ${styleProfile.industryLabel} style profile with a light, professional visual system.`,
  });
  await emit({
    type: "assistant_chunk",
    runId: args.runId,
    stage: "modules",
    content: `Resolved ${thinkingContext.plugin.label.toLowerCase()} thinking mode. ${thinkingContext.reason}`,
  });
  await emit({
    type: "assistant_chunk",
    runId: args.runId,
    stage: "modules",
    content:
      complexityProfile.workloadLane === "deep"
        ? `Detected a high-spec task, so Studio is using the deep workspace lane with ${complexityProfile.taskGrammarPacks.length > 0 ? complexityProfile.taskGrammarPacks.map((pack) => pack.title).join(", ") : "generic professional"} grammar.`
        : "The brief fits the fast workspace lane, so Studio will keep the prompt light unless a later page needs a heavier structure.",
  });
  if (hasExplicitHeroModelRequest(args.payload.brief)) {
    await emit({
      type: "assistant_chunk",
      runId: args.runId,
      stage: "modules",
      content: "The brief explicitly asks for one 3D concept page, so Studio may reserve a single dominant hero-model page for the core system or object.",
    });
  }

  await emit({
    type: "stage_started",
    runId: args.runId,
    stage: "planning",
    label: isLongForm ? "Planning long-form page map" : "Planning page map",
  });
  const recipePlan = buildHeuristicRecipePlan({
    payload: args.payload,
    evidenceGraph,
    modules: moduleManifests,
    thinkingContext,
    briefSynthesis,
  });
  const alignedRecipePlan = {
    ...recipePlan,
    pages: applyPreflightToRecipePlan({
      pages: recipePlan.pages,
      preflight,
    }),
  };
  const deckCompositionBrief = buildDeckCompositionBrief({
    deckTitle: alignedRecipePlan.title,
    pageCount: alignedRecipePlan.pages.length,
    isLongForm,
    styleProfile,
  });
  await emit({
    type: "assistant_chunk",
    runId: args.runId,
    stage: "planning",
    content: isLongForm
      ? `Built a ${alignedRecipePlan.pages.length}-page long-form plan with opening pages first, proof pages through the middle, and lighter synthesis support at the end.`
      : `Built a ${alignedRecipePlan.pages.length}-page evidence-led plan from the raw brief, then routed each page toward the strongest selected template or built-in composition.`,
  });
  await emit({
    type: "stage_started",
    runId: args.runId,
    stage: "pages",
    label: "Generating pages from evidence-rich HTML prompts",
    expectedPageCount: alignedRecipePlan.pages.length,
    pageTitles: alignedRecipePlan.pages.map((page) => page.pageTitle),
  });

  const pageRecipes = alignedRecipePlan.pages.map((page) =>
    resolvePageRecipe({
      page,
      brief: args.payload.brief,
      evidenceGraph,
      briefSynthesis,
      manifests: moduleManifests,
      totalPages: alignedRecipePlan.pages.length,
    }),
  );

  let releasePageOneReady: (() => void) | null = null;
  const pageOneReadyGate = new Promise<void>((resolve) => {
    releasePageOneReady = resolve;
  });

  const renderPageRecipe = async (recipe: PageRecipe, waitForPageOneReady = false) => {
    const allPages = pageRecipes;
    const usedCompositionFingerprints = pageRecipes
      .filter((page) => page.pageNumber < recipe.pageNumber)
      .slice(-3)
      .map((page) => inferPageRecipeCompositionFingerprint(page));
    const chartPageIntent = resolveChartPageIntent({
      page: recipe,
      allPages,
    });
    const heroModelIntent = resolveHeroModelIntent({
      page: recipe,
      allPages,
      brief: args.payload.brief,
    });
    const heroReferenceContext = buildHeroReferenceContext({
      skill: heroSkill,
      intent: heroModelIntent,
      stage: "render",
    });
    const deckDiversityReport = buildDeckCompositionDiversityReport([
      ...usedCompositionFingerprints,
      inferPageRecipeCompositionFingerprint(recipe),
    ]);
    await emit({
      type: "stage_started",
      runId: args.runId,
      stage: `page-recipe-${recipe.pageNumber}`,
      label: `Resolving page ${recipe.pageNumber} recipe`,
      pageNumber: recipe.pageNumber,
    });
    await emit({
      type: "assistant_chunk",
      runId: args.runId,
      stage: `page-recipe-${recipe.pageNumber}`,
      content: recipe.chartSpec
        ? `Page ${recipe.pageNumber} is an ${recipe.pageClass} page using a ${recipe.chartSpec.kind} chart with ${recipe.chartSpec.categories.length} categories${chartPageIntent.enabled ? " in chart-first mode" : ""}.`
        : heroModelIntent.enabled
          ? `Page ${recipe.pageNumber} is an ${recipe.pageClass} page and will render as a dominant hero-model concept page for ${heroModelIntent.objectFocus ?? "the core system"}.`
          : `Page ${recipe.pageNumber} is an ${recipe.pageClass} page with a ${recipe.compositionHint ?? "content-led"} composition direction and ${recipe.moduleBinding?.label ?? "built-in"} template support.`,
    });
    await emit({
      type: "page_started",
      runId: args.runId,
      pageNumber: recipe.pageNumber,
      pageTitle: recipe.pageTitle,
    });
    await emit({
      type: "stage_started",
      runId: args.runId,
      stage: `page-render-${recipe.pageNumber}`,
      label: `Rendering page ${recipe.pageNumber}`,
      pageNumber: recipe.pageNumber,
    });
    const eligibleModuleOptions = resolvePageModuleOptions({
      moduleUsageMode: args.payload.moduleUsageMode,
      pageClass: recipe.pageClass,
      chartKind: recipe.chartSpec?.kind ?? null,
      manifests: moduleManifests,
    });
    const rankedModuleOptions = rankModuleManifestsForPage({
      page: {
        pageNumber: recipe.pageNumber,
        pageTitle: recipe.pageTitle,
        objective: recipe.pageIntent,
        insight: recipe.insight,
        compositionHint: recipe.compositionHint ?? "",
        layout: recipe.layout,
        desiredChartKind: recipe.chartSpec?.kind ?? "none",
        composite: recipe.chartSpec?.composite ?? "none",
        evidenceIds: recipe.evidenceIds,
        moduleHints: recipe.moduleBinding ? [recipe.moduleBinding.moduleId] : [],
      },
      manifests: eligibleModuleOptions,
      chartKind: recipe.chartSpec?.kind ?? null,
    }).map((item) => item.manifest);
    const primaryPrompt = buildSkillBackedPagePrompt({
      brief: args.payload.brief,
      deckTitle: alignedRecipePlan.title,
      page: recipe,
      allPages,
      skill: analysisSkill,
      thinkingContext,
      thinkingSkill,
      moduleOptions: rankedModuleOptions,
      styleProfile,
      compositionBrief: deckCompositionBrief,
      usedCompositionFingerprints,
      chartPageIntent,
      heroSkill,
      heroModelIntent,
      heroArtDirection,
      heroReferenceLines: heroReferenceContext.lines,
      briefSynthesis,
      complexityProfile,
      preflight,
      evalOverrides: args.evalOverrides,
    });
    const primaryWorkspaceMeta = getStudioAiWorkspacePromptMeta(primaryPrompt);
    let pageSummary = "";
    let pageModel: string | null = null;
    let validatedPage: ReturnType<typeof validateGeneratedPageHtml> | null = null;

    try {
      const pageResult = await executeStudioStage({
        runId: args.runId,
        stage: `page-render-${recipe.pageNumber}`,
        prompt: primaryPrompt,
        payload: args.payload,
        agentConfig: args.agentConfig,
        onStageTrace: args.onStageTrace,
        traceMeta: {
          ...(primaryWorkspaceMeta ?? {}),
          ...buildComplexityTraceMeta(complexityProfile),
          ...buildStudioEvalTraceMeta(args.evalOverrides),
          skillLoaded: analysisSkill.source === "file",
          skillPath: analysisSkill.path,
          skillHash: analysisSkill.hash,
          skillSource: analysisSkill.source,
          thinkingMode: thinkingContext.mode,
          thinkingModeSkillLoaded: thinkingSkill?.source === "file",
          thinkingModeSkillPath: thinkingSkill?.path ?? null,
          thinkingModeSkillHash: thinkingSkill?.hash ?? null,
          moduleUsageMode: args.payload.moduleUsageMode,
          chartPageIntent: chartPageIntent.enabled,
          chartPressureMode: chartPageIntent.pressureMode,
          heroModelIntent: heroModelIntent.enabled,
          heroObjectFocus: heroModelIntent.objectFocus,
          heroObjectFamily: heroModelIntent.objectFamily,
          heroCompositionFamily: heroModelIntent.recommendedCompositionFamily,
          heroSkillLoaded: heroSkill.source === "file",
          heroSkillPath: heroSkill.path,
          heroSkillHash: heroSkill.hash,
          heroReferenceFiles: heroReferenceContext.referenceFiles,
          publishedModuleCount: rankedModuleOptions.length,
          compositionHint: recipe.compositionHint,
          compositionFingerprint: inferPageRecipeCompositionFingerprint(recipe),
          deckDiversityScore: deckDiversityReport.diversityScore,
          pressureBudget,
          ...buildBriefSynthesisTraceMeta(briefSynthesis),
          pageIntentQualityPass: recipe.pageIntentQuality?.pass ?? null,
          pageIntentQualityReasons: recipe.pageIntentQuality?.reasons ?? [],
          deepQaPass: recipe.deepQa?.pass ?? null,
          deepQaReasons: recipe.deepQa?.reasons ?? [],
          intentRefinementAttempted: recipe.intentRefinementAttempted ?? false,
        },
        assistantTextParser: extractTextBeforeHtml,
        onAssistantChunk: async (content) => {
          await emit({
            type: "assistant_chunk",
            runId: args.runId,
            stage: `page-render-${recipe.pageNumber}`,
            content,
          });
        },
        signal: args.signal,
      });
      pageSummary = pageResult.summary;
      pageModel = pageResult.model;
      validatedPage = validateGeneratedPageHtml({
        html: pageResult.summary,
        expectedPageNumber: recipe.pageNumber,
        expectedPageTitle: recipe.pageTitle,
      });
    } catch (error) {
      const fallbackPrompt = buildPagePrompt({
        brief: args.payload.brief,
        deckTitle: alignedRecipePlan.title,
        page: {
          pageNumber: recipe.pageNumber,
          pageTitle: recipe.pageTitle,
          goal: recipe.objective,
          story: recipe.insight,
        },
        allPages: allPages.map((page) => ({
          pageNumber: page.pageNumber,
          pageTitle: page.pageTitle,
          goal: page.objective,
          story: page.insight,
        })),
        styleProfile,
        compositionBrief: deckCompositionBrief,
        usedCompositionFingerprints,
        heroSkill,
        heroModelIntent,
        heroArtDirection,
        moduleOptions: rankedModuleOptions,
        chartPageIntent,
        thinkingContext,
        thinkingSkill,
        briefSynthesis,
        complexityProfile,
        preflight,
        evalOverrides: args.evalOverrides,
        pageArgument: {
          pageQuestion: recipe.objective,
          headlineClaim: recipe.heroClaim,
          supportBullets: recipe.supportBullets,
          evidenceCallouts: recipe.evidenceBullets,
          takeaway: recipe.takeaway,
          allowEvidenceException:
            recipe.layout === "comparison" ||
            recipe.layout === "chart-insight" ||
            Boolean(recipe.chartSpec),
        },
      });
      const fallbackWorkspaceMeta = getStudioAiWorkspacePromptMeta(fallbackPrompt);
      await emit({
        type: "assistant_chunk",
        runId: args.runId,
        stage: `page-render-${recipe.pageNumber}`,
        content: `Page ${recipe.pageNumber} fell back to the classic HTML prompt path: ${
          error instanceof Error ? error.message : "render failure"
        }.`,
      });
      const fallbackResult = await executeStudioStage({
        runId: args.runId,
        stage: `page-fallback-${recipe.pageNumber}`,
        prompt: fallbackPrompt,
        payload: args.payload,
        agentConfig: args.agentConfig,
        onStageTrace: args.onStageTrace,
        traceMeta: {
          ...(fallbackWorkspaceMeta ?? {}),
          ...buildComplexityTraceMeta(complexityProfile),
          ...buildStudioEvalTraceMeta(args.evalOverrides),
          skillLoaded: analysisSkill.source === "file",
          skillPath: analysisSkill.path,
          skillHash: analysisSkill.hash,
          thinkingMode: thinkingContext.mode,
          thinkingModeSkillLoaded: thinkingSkill?.source === "file",
          thinkingModeSkillPath: thinkingSkill?.path ?? null,
          thinkingModeSkillHash: thinkingSkill?.hash ?? null,
          moduleUsageMode: args.payload.moduleUsageMode,
          publishedModuleCount: rankedModuleOptions.length,
          skillSource: analysisSkill.source,
          compositionHint: recipe.compositionHint,
          compositionFingerprint: inferPageRecipeCompositionFingerprint(recipe),
          deckDiversityScore: deckDiversityReport.diversityScore,
          pressureBudget,
          ...buildBriefSynthesisTraceMeta(briefSynthesis),
          pageIntentQualityPass: recipe.pageIntentQuality?.pass ?? null,
          pageIntentQualityReasons: recipe.pageIntentQuality?.reasons ?? [],
          deepQaPass: recipe.deepQa?.pass ?? null,
          deepQaReasons: recipe.deepQa?.reasons ?? [],
          intentRefinementAttempted: recipe.intentRefinementAttempted ?? false,
        },
        assistantTextParser: extractTextBeforeHtml,
        onAssistantChunk: async (content) => {
          await emit({
            type: "assistant_chunk",
            runId: args.runId,
            stage: `page-render-${recipe.pageNumber}`,
            content,
          });
        },
        signal: args.signal,
      });
      pageSummary = fallbackResult.summary;
      pageModel = fallbackResult.model;
      validatedPage = validateGeneratedPageHtml({
        html: fallbackResult.summary,
        expectedPageNumber: recipe.pageNumber,
        expectedPageTitle: recipe.pageTitle,
      });
    }

    if (!validatedPage) {
      throw new StudioV2FallbackError(
        "page_render_failed",
        `Page ${recipe.pageNumber} could not be rendered through V2 or fallback HTML generation.`,
      );
    }

    const pageNarrative = extractTextBeforeHtml(pageSummary);
    if (pageNarrative) {
      await emit({
        type: "assistant_chunk",
        runId: args.runId,
        stage: `page-render-${recipe.pageNumber}`,
        content: pageNarrative,
      });
    }
    if (waitForPageOneReady) {
      await pageOneReadyGate;
    }

    await emit({
      type: "page_ready",
      runId: args.runId,
      pageNumber: recipe.pageNumber,
      pageTitle: validatedPage.pageTitle,
      pageHtml: validatedPage.pageHtml,
    });

    if (recipe.pageNumber === 1) {
      releasePageOneReady?.();
      releasePageOneReady = null;
    }

    return {
      pageNumber: recipe.pageNumber,
      sectionHtml: validatedPage.sectionHtml,
      model: pageModel,
    };
  };

  let pageResults: Array<{
    pageNumber: number;
    sectionHtml: string;
    model: string | null;
  }> = [];

  if (isLongForm) {
    const firstWave = pageRecipes.slice(0, 3);
    const secondWave = pageRecipes.slice(3, 8);
    const thirdWave = pageRecipes.slice(8);

    const firstPageResult = firstWave[0]
      ? await renderPageRecipe(firstWave[0], false)
      : null;
    const remainingFirstWave =
      firstWave.length > 1
        ? await mapWithConcurrency(firstWave.slice(1), Math.min(2, firstWave.length - 1), async (recipe) =>
            renderPageRecipe(recipe, true),
          )
        : [];
    const secondWaveResults =
      secondWave.length > 0
        ? await mapWithConcurrency(secondWave, Math.min(3, secondWave.length), async (recipe) =>
            renderPageRecipe(recipe, true),
          )
        : [];
    const thirdWaveResults =
      thirdWave.length > 0
        ? await mapWithConcurrency(thirdWave, Math.min(2, thirdWave.length), async (recipe) =>
            renderPageRecipe(recipe, true),
          )
        : [];

    pageResults = [
      ...(firstPageResult ? [firstPageResult] : []),
      ...remainingFirstWave,
      ...secondWaveResults,
      ...thirdWaveResults,
    ];
  } else {
    const firstPagePromise = pageRecipes[0]
      ? renderPageRecipe(pageRecipes[0], false)
      : Promise.resolve(null);
    const remainingResultsPromise =
      pageRecipes.length > 1
        ? mapWithConcurrency(pageRecipes.slice(1), 2, async (recipe) =>
            renderPageRecipe(recipe, true),
          )
        : Promise.resolve([]);

    const firstPageResult = await firstPagePromise;
    const remainingResults = await remainingResultsPromise;
    pageResults = [
      ...(firstPageResult ? [firstPageResult] : []),
      ...remainingResults,
    ];
  }

  const pageSections: string[] = [];
  let resolvedModel: string | null = null;
  pageResults
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .forEach((result) => {
      pageSections.push(result.sectionHtml);
      resolvedModel = resolvedModel ?? result.model;
    });

  await emit({
    type: "stage_started",
    runId: args.runId,
    stage: "finalizing",
    label: "Finalizing editable deck",
  });

  const finalReport = buildSanitizedFinalReport({
    html: composeDeckHtml({
      title: alignedRecipePlan.title,
      sections: pageSections,
      styleProfile: reportStyleProfile,
    }),
    brief: args.payload.brief,
    fallbackTitle: alignedRecipePlan.title,
    styleProfile: reportStyleProfile,
  });

  await emit({
    type: "final_report",
    runId: args.runId,
    model: resolvedModel,
    report: finalReport,
  });

  return {
    model: resolvedModel,
    report: finalReport,
    enginePath: "v2" as const,
  };
}

export async function runStudioGenerationV1(args: {
  payload: GenerateStudioReportRequest;
  agentConfig: StudioAgentConfig;
  runId: string;
  signal?: AbortSignal;
  emit?: (event: StudioGenerateStreamEvent) => Promise<void>;
  evalOverrides?: StudioEvalOverrides | null;
  onStageTrace?: (entry: StudioStageTraceEntry) => Promise<void> | void;
}) {
  const emit = args.emit ?? (async () => {});
  const analysisSkill = loadStudioAnalysisSkill();
  const heroSkill = loadStudio3dHeroSkill();
  const preflight = await runStudioPreflightStage({
    brief: args.payload.brief,
    requestedPageCount: args.payload.pageCount ?? null,
    agentConfig: args.agentConfig,
    runId: args.runId,
    signal: args.signal,
    emit,
    onStageTrace: args.onStageTrace,
  });
  const runtimeInputs = createRawBriefThinkingInputs(args.payload.brief);
  const preparation = resolveStudioGenerationPreparation({
    brief: args.payload.brief,
    requestedPageCount: args.payload.pageCount ?? null,
    segmentedInputs: runtimeInputs,
    evalOverrides: args.evalOverrides,
  });
  const complexityProfile = preparation.complexityProfile;
  const thinkingContext = preparation.thinkingContext;
  const briefSynthesis = mergeStudioPreflightIntoBriefSynthesis({
    synthesis: preparation.briefSynthesis,
    preflight,
    rawBrief: args.payload.brief,
  });
  const thinkingSkill = loadStudioThinkingModeSkill(thinkingContext.mode);
  const moduleManifests = buildModuleManifestIndex(args.payload, { phase: "render" });
  const pressureBudget = resolveDeckPressureBudget({
    generationMode: args.payload.generationMode,
    pageCount: args.payload.pageCount ?? null,
  });
  const { profile: styleProfile } = resolveDeckStyleProfile({
    brief: args.payload.brief,
    moduleSemanticRoles: [],
  });
  const heroArtDirection = buildDeckHeroArtDirection({
    brief: args.payload.brief,
    styleProfile,
  });
  const reportStyleProfile = toGeneratedReportStyleProfile(styleProfile);
  await emit({
    type: "run_started",
    runId: args.runId,
  });

  await emit({
    type: "stage_started",
    runId: args.runId,
    stage: "planning",
    label: "Planning deck structure",
  });

  const planPrompt = buildSkillBackedPlanningPrompt({
    payload: args.payload,
    skill: analysisSkill,
    styleProfile,
    heroSkill,
    thinkingContext,
    thinkingSkill,
    briefSynthesis,
    complexityProfile,
    evalOverrides: args.evalOverrides,
  });
  const planningWorkspaceMeta = getStudioAiWorkspacePromptMeta(planPrompt);
  const planning = await executeStudioStage({
    runId: args.runId,
    stage: "planning",
    prompt: planPrompt,
    payload: args.payload,
    agentConfig: args.agentConfig,
    onStageTrace: args.onStageTrace,
    traceMeta: {
      ...(planningWorkspaceMeta ?? {}),
      ...buildComplexityTraceMeta(complexityProfile),
      ...buildStudioEvalTraceMeta(args.evalOverrides),
      skillLoaded: analysisSkill.source === "file",
      skillPath: analysisSkill.path,
      skillHash: analysisSkill.hash,
      skillSource: analysisSkill.source,
      thinkingMode: thinkingContext.mode,
      thinkingModeSkillLoaded: thinkingSkill?.source === "file",
      thinkingModeSkillPath: thinkingSkill?.path ?? null,
      thinkingModeSkillHash: thinkingSkill?.hash ?? null,
      moduleUsageMode: args.payload.moduleUsageMode,
      publishedModuleCount: moduleManifests.length,
      pressureBudget,
      ...buildBriefSynthesisTraceMeta(briefSynthesis),
    },
    assistantTextParser: extractTextBeforeJson,
    onAssistantChunk: async (content) => {
      await emit({
        type: "assistant_chunk",
        runId: args.runId,
        stage: "planning",
        content,
      });
    },
    signal: args.signal,
  });
  const planningNarrative = extractTextBeforeJson(planning.summary);
  if (planningNarrative && !planning.streamedAssistantText) {
    await emit({
      type: "assistant_chunk",
      runId: args.runId,
      stage: "planning",
      content: planningNarrative,
    });
  }

  const deckPlan = parseDeckPlan(planning.summary, args.payload.pageCount);
  const alignedDeckPlan = {
    ...deckPlan,
    pages: applyPreflightToDeckPlan({
      pages: deckPlan.pages,
      preflight,
    }),
  };
  const deckCompositionBrief = buildDeckCompositionBrief({
    deckTitle: alignedDeckPlan.title,
    pageCount: alignedDeckPlan.pages.length,
    isLongForm: false,
    styleProfile,
  });
  const heroCandidatePages: PageRecipe[] = alignedDeckPlan.pages.map((page) => {
    const pageClass: LongFormPageClass = page.pageNumber === 1 ? "opening-core" : "proof-analysis";
    return {
      pageNumber: page.pageNumber,
      pageTitle: page.pageTitle,
      pageIntent: page.goal,
      objective: page.goal,
      insight: page.story || page.goal,
      pageClass,
      densityBudget: resolvePageDensityBudget(pageClass),
      compositionHint: null,
      layout: "hero-proof",
      chartPriority: "none",
      evidenceIds: [],
      evidenceBundle: [],
      heroClaim: page.story || page.goal,
      supportBullets: [],
      evidenceBullets: [],
      takeaway: page.goal,
      moduleBinding: null,
      chartSpec: null,
      fallbackReason: null,
    };
  });
  await emit({
    type: "stage_started",
    runId: args.runId,
    stage: "pages",
    label: "Generating pages",
    expectedPageCount: alignedDeckPlan.pages.length,
    pageTitles: alignedDeckPlan.pages.map((page) => page.pageTitle),
  });

  const pageSections: string[] = [];
  let resolvedModel: string | null = planning.model;

  for (const page of alignedDeckPlan.pages) {
    if (args.signal?.aborted) {
      throw new Error("Studio generation aborted.");
    }

    await emit({
      type: "page_started",
      runId: args.runId,
      pageNumber: page.pageNumber,
      pageTitle: page.pageTitle,
    });
    await emit({
      type: "stage_started",
      runId: args.runId,
      stage: `page-${page.pageNumber}`,
      label: `Generating page ${page.pageNumber}`,
      pageNumber: page.pageNumber,
    });

    const heroModelIntent = resolveHeroModelIntent({
      page: heroCandidatePages[page.pageNumber - 1]!,
      allPages: heroCandidatePages,
      brief: args.payload.brief,
    });
    const heroReferenceContext = buildHeroReferenceContext({
      skill: heroSkill,
      intent: heroModelIntent,
      stage: "render",
    });
    const pagePrompt = buildPagePrompt({
      brief: args.payload.brief,
      deckTitle: alignedDeckPlan.title,
      page,
      allPages: alignedDeckPlan.pages,
      styleProfile,
      compositionBrief: deckCompositionBrief,
      usedCompositionFingerprints: [],
      heroSkill,
      heroModelIntent,
      heroArtDirection,
      heroReferenceLines: heroReferenceContext.lines,
      thinkingContext,
      thinkingSkill,
      moduleOptions: moduleManifests,
      briefSynthesis,
      complexityProfile,
      preflight,
      evalOverrides: args.evalOverrides,
      pageArgument: {
        pageQuestion: page.goal,
        headlineClaim: page.story || page.goal,
        takeaway: page.goal,
      },
    });
    const pageWorkspaceMeta = getStudioAiWorkspacePromptMeta(pagePrompt);
    const pageResult = await executeStudioStage({
      runId: args.runId,
      stage: `page-${page.pageNumber}`,
      prompt: pagePrompt,
      payload: args.payload,
      agentConfig: args.agentConfig,
      onStageTrace: args.onStageTrace,
      traceMeta: {
        ...(pageWorkspaceMeta ?? {}),
        ...buildComplexityTraceMeta(complexityProfile),
        ...buildStudioEvalTraceMeta(args.evalOverrides),
        moduleUsageMode: args.payload.moduleUsageMode,
        publishedModuleCount: moduleManifests.length,
        pressureBudget,
        thinkingMode: thinkingContext.mode,
        thinkingModeSkillLoaded: thinkingSkill?.source === "file",
        thinkingModeSkillPath: thinkingSkill?.path ?? null,
        thinkingModeSkillHash: thinkingSkill?.hash ?? null,
        heroModelIntent: heroModelIntent.enabled,
        heroObjectFocus: heroModelIntent.objectFocus,
        heroObjectFamily: heroModelIntent.objectFamily,
        heroCompositionFamily: heroModelIntent.recommendedCompositionFamily,
        heroReferenceFiles: heroReferenceContext.referenceFiles,
        heroSkillLoaded: heroSkill.source === "file",
        heroSkillPath: heroSkill.path,
        heroSkillHash: heroSkill.hash,
        ...buildBriefSynthesisTraceMeta(briefSynthesis),
      },
      assistantTextParser: extractTextBeforeHtml,
      onAssistantChunk: async (content) => {
        await emit({
          type: "assistant_chunk",
          runId: args.runId,
          stage: `page-${page.pageNumber}`,
          content,
        });
      },
      signal: args.signal,
    });
    resolvedModel = pageResult.model;

    const pageNarrative = extractTextBeforeHtml(pageResult.summary);
    if (pageNarrative && !pageResult.streamedAssistantText) {
      await emit({
        type: "assistant_chunk",
        runId: args.runId,
        stage: `page-${page.pageNumber}`,
        content: pageNarrative,
      });
    }

    const validatedPage = validateGeneratedPageHtml({
      html: pageResult.summary,
      expectedPageNumber: page.pageNumber,
      expectedPageTitle: page.pageTitle,
    });
    pageSections.push(validatedPage.sectionHtml);

    await emit({
      type: "page_ready",
      runId: args.runId,
      pageNumber: page.pageNumber,
      pageTitle: validatedPage.pageTitle,
      pageHtml: validatedPage.pageHtml,
    });
  }

  await emit({
    type: "stage_started",
    runId: args.runId,
    stage: "finalizing",
    label: "Assembling final deck",
  });

  const finalReport = buildSanitizedFinalReport({
    html: composeDeckHtml({
      title: alignedDeckPlan.title,
      sections: pageSections,
      styleProfile: reportStyleProfile,
    }),
    brief: args.payload.brief,
    fallbackTitle: alignedDeckPlan.title,
    styleProfile: reportStyleProfile,
  });

  await emit({
    type: "final_report",
    runId: args.runId,
    model: resolvedModel,
    report: finalReport,
  });

  return {
    model: resolvedModel,
    report: finalReport,
    enginePath: "v1" as const,
  };
}

export async function runStudioGeneration(args: {
  payload: GenerateStudioReportRequest;
  agentConfig: StudioAgentConfig;
  runId: string;
  signal?: AbortSignal;
  emit?: (event: StudioGenerateStreamEvent) => Promise<void>;
  evalOverrides?: StudioEvalOverrides | null;
  onStageTrace?: (entry: StudioStageTraceEntry) => Promise<void> | void;
}) {
  try {
    return await runStudioGenerationV2(args);
  } catch (error) {
    if (isStudioAbortError(error)) {
      throw error;
    }

    const shouldFallback =
      error instanceof StudioV2FallbackError &&
      (error.reason === "evidence_graph_failed" ||
        error.reason === "module_manifest_failed" ||
        error.reason === "recipe_invalid" ||
        error.reason === "recipe_planning_failed");

    if (!shouldFallback) {
      throw error;
    }

    logger.warn(
      {
        runId: args.runId,
        reason: error.reason,
        message: error.message,
      },
      "studio generation v2 fell back to v1",
    );

    if (args.emit) {
      await args.emit({
        type: "stage_started",
        runId: args.runId,
        stage: "planning",
        label: "Falling back to classic HTML generation",
      });
      await args.emit({
        type: "assistant_chunk",
        runId: args.runId,
        stage: "planning",
        content:
          "The evidence-first V2 path could not complete cleanly for this brief, so Studio switched to the classic model-authored HTML path for stability.",
      });
    }

    const fallbackResult = await runStudioGenerationV1(args);
    return {
      ...fallbackResult,
      enginePath: "v1-fallback" as const,
    };
  }
}

export async function runStudioRevision(args: {
  payload: ReviseStudioReportRequest;
  agentConfig: StudioAgentConfig;
  runId: string;
  signal?: AbortSignal;
  emit?: (event: StudioGenerateStreamEvent) => Promise<void>;
  evalOverrides?: StudioEvalOverrides | null;
  onStageTrace?: (entry: StudioStageTraceEntry) => Promise<void> | void;
}) {
  const emit = args.emit ?? (async () => {});
  const repairSkill = loadStudioLayoutRepairSkill();
  const heroSkill = loadStudio3dHeroSkill();
  const preflight = await runStudioPreflightStage({
    brief: args.payload.brief,
    requestedPageCount: args.payload.report.pageCount,
    agentConfig: args.agentConfig,
    runId: args.runId,
    signal: args.signal,
    emit,
    onStageTrace: args.onStageTrace,
  });
  const runtimeInputs = createRawBriefThinkingInputs(args.payload.brief);
  const preparation = resolveStudioGenerationPreparation({
    brief: args.payload.brief,
    requestedPageCount: args.payload.report.pageCount,
    segmentedInputs: runtimeInputs,
    evalOverrides: args.evalOverrides,
  });
  const complexityProfile = preparation.complexityProfile;
  const thinkingContext = preparation.thinkingContext;
  const briefSynthesis = mergeStudioPreflightIntoBriefSynthesis({
    synthesis: preparation.briefSynthesis,
    preflight,
    rawBrief: args.payload.brief,
  });
  const evidenceGraph = buildEvidenceGraph(
    buildPreflightEvidenceInput({
      brief: args.payload.brief,
      preflight,
    }),
    args.payload.report.pageCount,
  );
  const thinkingSkill = loadStudioThinkingModeSkill(thinkingContext.mode);
  const moduleManifests = buildModuleManifestIndex(args.payload, { phase: "repair" });
  const { profile: styleProfile } = resolveDeckStyleProfile({
    brief: args.payload.brief,
    moduleSemanticRoles: [],
    preferredProfileId:
      (args.payload.report as { styleProfileId?: string }).styleProfileId ??
      (args.payload.report as { styleProfile?: { id?: string } }).styleProfile?.id ??
      null,
  });
  const reportStyleProfile = toGeneratedReportStyleProfile(styleProfile);
  const deckSections = extractDeckSections(args.payload.report.html);
  const deckTitle = extractDocumentTitle(args.payload.report.html);
  const isLongForm = isLongFormRevisionPayload(args.payload);
  const reviewBudget = isLongForm ? LONG_FORM_REVIEW_BUDGET : null;
  const deckDiversityReport = buildDeckCompositionDiversityReport(
    args.payload.pageMeasurements.map((measurement) => measurement.compositionFingerprint),
  );
  const deckPageMap = deckSections.map((section) => ({
    pageNumber: section.pageNumber,
    pageTitle: section.pageTitle,
  }));
  const failingMeasurements = [...args.payload.pageMeasurements]
    .filter((measurement) => measurementNeedsRepair(measurement, args.payload.report.pageCount))
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .filter((measurement) => {
      if (!reviewBudget || args.payload.repairMode !== "aggressive") {
        return true;
      }
      const profile = buildPageRepairProfile({
        measurement,
        generationMode: args.payload.generationMode,
        requestedPageCount: args.payload.requestedPageCount,
        pageCount: args.payload.report.pageCount,
      });
      return profile.isCriticalPage;
    })
    .slice(
      0,
      reviewBudget
        ? args.payload.repairMode === "aggressive"
          ? reviewBudget.maxAggressivePages
          : reviewBudget.maxPagesPerPass
        : args.payload.pageMeasurements.length,
    );

  await emit({
    type: "run_started",
    runId: args.runId,
  });
  await emit({
    type: "stage_started",
    runId: args.runId,
    stage: "review",
    label: "Reviewing rendered pages",
    expectedPageCount: args.payload.report.pageCount,
    pageTitles: deckPageMap.map((page) => page.pageTitle),
  });
  await emit({
    type: "assistant_chunk",
    runId: args.runId,
    stage: "review",
    content:
      failingMeasurements.length > 0
        ? `Detected fit or title issues on pages ${failingMeasurements
            .map((measurement) => measurement.pageNumber)
            .join(", ")}.${reviewBudget ? ` Repair budget is capped at ${reviewBudget.maxPagesPerPass} pages per pass and about ${Math.round(reviewBudget.hardTimeoutMs / 1000)} seconds overall.` : ""} ${summarizeDeckCompositionDiversityForPrompt(deckDiversityReport)}`
        : "No fit issues were detected, so the original generated deck can remain unchanged.",
  });

  if (failingMeasurements.length === 0) {
    const passthroughReport = buildSanitizedFinalReport({
      html: args.payload.report.html,
      brief: args.payload.brief,
      fallbackTitle: args.payload.report.title,
      styleProfile: reportStyleProfile,
    });
    await emit({
      type: "final_report",
      runId: args.runId,
      model: args.agentConfig.model,
      report: passthroughReport,
    });
    return {
      model: args.agentConfig.model,
      report: passthroughReport,
    };
  }

  const repairSinglePage = async (measurement: PageFitMeasurement) => {
    if (args.signal?.aborted) {
      throw new Error("Studio revision aborted.");
    }

    const currentSection =
      deckSections.find((section) => section.pageNumber === measurement.pageNumber) ??
      deckSections[measurement.pageNumber - 1];
    if (!currentSection) {
      throw new Error(`Page ${measurement.pageNumber} could not be found in the original report.`);
    }
    const repairProfile = buildPageRepairProfile({
      measurement,
      generationMode: args.payload.generationMode,
      requestedPageCount: args.payload.requestedPageCount,
      pageCount: args.payload.report.pageCount,
    });
    const chartPageIntent = resolveRepairChartPageIntent({
      pageClass: repairProfile.pageClass,
      pageTitle: currentSection.pageTitle,
      measurement,
    });
    const heroModelIntent = resolveRepairHeroModelIntent({
      pageClass: repairProfile.pageClass,
      pageTitle: currentSection.pageTitle,
      brief: args.payload.brief,
      sectionHtml: currentSection.sectionHtml,
      measurement,
    });
    const heroReferenceContext = buildHeroReferenceContext({
      skill: heroSkill,
      intent: heroModelIntent,
      stage: "repair",
    });
    const pageModuleOptions = resolvePageModuleOptions({
      moduleUsageMode: args.payload.moduleUsageMode,
      pageClass: repairProfile.pageClass,
      chartKind:
        measurement.chartRegionCount > 0 || repairProfile.overflowCause === "chart+sidebar"
          ? "bar"
          : null,
      manifests: moduleManifests,
    });
    const deterministicShrink = applyDeterministicShrink({
      sectionHtml: currentSection.sectionHtml,
      measurement,
      pageTitle: currentSection.pageTitle,
      profile: repairProfile,
      chartPageIntent,
      heroModelIntent,
    });
    const shrunkSectionHtml = deterministicShrink.sectionHtml;
    const titleOnlyRepair =
      deterministicShrink.changed &&
      !measurement.overflowX &&
      !measurement.overflowY &&
      (
        measurement.pageTitleQuality.promptLeak ||
        measurement.pageTitleQuality.truncated ||
        measurement.pageTitleQuality.repeatedInstruction
      );

    await emit({
      type: "page_started",
      runId: args.runId,
      pageNumber: measurement.pageNumber,
      pageTitle: currentSection.pageTitle,
    });
    await emit({
      type: "stage_started",
      runId: args.runId,
      stage: `repair-page-${measurement.pageNumber}`,
      label: `Repairing page ${measurement.pageNumber} (${repairProfile.pageClass})`,
      pageNumber: measurement.pageNumber,
    });

    if (deterministicShrink.notes.length > 0) {
      await emit({
        type: "assistant_chunk",
        runId: args.runId,
        stage: `repair-page-${measurement.pageNumber}`,
        content: `Deterministic shrink: ${deterministicShrink.notes.join(" ")}`,
      });
    }

    if (titleOnlyRepair) {
      const deterministicPage = validateGeneratedPageHtml({
        html: composeSinglePageHtml({
          title: deckTitle,
          sectionHtml: shrunkSectionHtml,
          styleProfile: reportStyleProfile,
        }),
        expectedPageNumber: measurement.pageNumber,
        expectedPageTitle: sanitizeRepairTitle({
          title: currentSection.pageTitle,
          pageNumber: measurement.pageNumber,
          pageClass: repairProfile.pageClass,
          fallbackSeed: currentSection.sectionHtml,
        }),
      });

      await emit({
        type: "page_ready",
        runId: args.runId,
        pageNumber: measurement.pageNumber,
        pageTitle: deterministicPage.pageTitle,
        pageHtml: deterministicPage.pageHtml,
      });

      return {
        pageNumber: measurement.pageNumber,
        sectionHtml: deterministicPage.sectionHtml,
        model: args.agentConfig.model,
      };
    }

    const prompt = buildLayoutRepairPrompt({
      brief: args.payload.brief,
      skill: repairSkill,
      heroSkill,
      thinkingContext,
      thinkingSkill,
      complexityProfile,
      repairMode: args.payload.repairMode,
      pageNumber: measurement.pageNumber,
      pageTitle: currentSection.pageTitle,
      deckTitle,
      deckPageMap,
      measurement,
      sectionHtml: shrunkSectionHtml,
      evidenceGraph,
      briefSynthesis,
      moduleOptions: pageModuleOptions,
      repairProfile,
      deterministicNotes: deterministicShrink.notes,
      styleProfile,
      deckDiversityReport,
      chartPageIntent,
      heroModelIntent,
      heroReferenceLines: heroReferenceContext.lines,
      evalOverrides: args.evalOverrides,
      preflight,
    });
    const repairWorkspaceMeta = getStudioAiWorkspacePromptMeta(prompt);

    const repairResult = await executeStudioStage({
      runId: args.runId,
      stage: `repair-page-${measurement.pageNumber}`,
      prompt,
      payload: args.payload,
      agentConfig: args.agentConfig,
      assistantTextParser: extractTextBeforeHtml,
      onStageTrace: args.onStageTrace,
      traceMeta: {
        ...(repairWorkspaceMeta ?? {}),
        ...buildComplexityTraceMeta(complexityProfile),
        ...buildStudioEvalTraceMeta(args.evalOverrides),
        skillLoaded: repairSkill.source === "file",
        skillPath: repairSkill.path,
        skillHash: repairSkill.hash,
        skillSource: repairSkill.source,
        thinkingMode: thinkingContext.mode,
        thinkingModeSkillLoaded: thinkingSkill?.source === "file",
        thinkingModeSkillPath: thinkingSkill?.path ?? null,
        thinkingModeSkillHash: thinkingSkill?.hash ?? null,
        repairPageNumber: measurement.pageNumber,
        repairMode: args.payload.repairMode,
        pageClass: repairProfile.pageClass,
        overflowCause: repairProfile.overflowCause,
        compositionFingerprint: measurement.compositionFingerprint,
        deckDiversityScore: deckDiversityReport.diversityScore,
        repairPreservedComposition: repairProfile.preserveComposition,
        chartPageIntent: chartPageIntent.enabled,
        chartPressureMode: chartPageIntent.pressureMode,
        heroModelIntent: heroModelIntent.enabled,
        heroObjectFocus: heroModelIntent.objectFocus,
        heroObjectFamily: heroModelIntent.objectFamily,
        heroCompositionFamily: heroModelIntent.recommendedCompositionFamily,
        ...buildBriefSynthesisTraceMeta(briefSynthesis),
        heroReferenceFiles: heroReferenceContext.referenceFiles,
        heroRepairPreservedFamily:
          heroModelIntent.enabled &&
          heroModelIntent.objectFamily === resolveHeroObjectFamily(currentSection.sectionHtml),
        moduleUsageMode: args.payload.moduleUsageMode,
        publishedModuleCount: pageModuleOptions.length,
      },
      onAssistantChunk: async (content) => {
        await emit({
          type: "assistant_chunk",
          runId: args.runId,
          stage: `repair-page-${measurement.pageNumber}`,
          content,
        });
      },
      signal: args.signal,
    });

    const validatedPage = validateGeneratedPageHtml({
      html: repairResult.summary,
      expectedPageNumber: measurement.pageNumber,
      expectedPageTitle: currentSection.pageTitle,
    });

    await emit({
      type: "page_ready",
      runId: args.runId,
      pageNumber: measurement.pageNumber,
      pageTitle: validatedPage.pageTitle,
      pageHtml: validatedPage.pageHtml,
    });

    return {
      pageNumber: measurement.pageNumber,
      sectionHtml: validatedPage.sectionHtml,
      model: repairResult.model,
    };
  };

  const firstRepair = failingMeasurements[0] ?? null;
  const remainingRepairs = failingMeasurements.slice(1);
  const firstRepairResult = firstRepair ? await repairSinglePage(firstRepair) : null;
  const remainingRepairResults = await mapWithConcurrency(
    remainingRepairs,
    2,
    async (measurement) => repairSinglePage(measurement),
  );

  const repairedSections = new Map<number, { sectionHtml: string; model: string | null }>();
  [firstRepairResult, ...remainingRepairResults].forEach((result) => {
    if (!result) {
      return;
    }
    repairedSections.set(result.pageNumber, {
      sectionHtml: result.sectionHtml,
      model: result.model,
    });
  });

  await emit({
    type: "stage_started",
    runId: args.runId,
    stage: "finalizing",
    label: "Finalizing repaired deck",
  });

  const finalReport = buildSanitizedFinalReport({
    html: composeDeckHtml({
      title: deckTitle,
      sections: deckSections
        .sort((left, right) => left.pageNumber - right.pageNumber)
        .map((section) => repairedSections.get(section.pageNumber)?.sectionHtml ?? section.sectionHtml),
      styleProfile: reportStyleProfile,
    }),
    brief: args.payload.brief,
    fallbackTitle: deckTitle,
    styleProfile: reportStyleProfile,
  });

  await emit({
    type: "final_report",
    runId: args.runId,
    model:
      firstRepairResult?.model ??
      remainingRepairResults.find((result) => result?.model)?.model ??
      args.agentConfig.model,
    report: finalReport,
  });

  return {
    model:
      firstRepairResult?.model ??
      remainingRepairResults.find((result) => result?.model)?.model ??
      args.agentConfig.model,
    report: finalReport,
  };
}
