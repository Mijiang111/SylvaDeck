import {
  toGeneratedReportStyleProfile,
} from "../industry-style.js";
import type {
  GenerateStudioReportRequest,
  ReviseStudioReportRequest,
  DeckPlan,
  PublishedModuleManifest,
  PageRecipePlan,
  PageFitMeasurement,
  ModuleChartKind,
  RepairMode,
  GenerationMode,
  HtmlAnimationPage,
  HtmlAnimationStructure,
  HtmlPageAnimationManifest,
  ModuleUsageMode,
  HtmlOutputMode,
  PageOverflowCause,
  PageCompositionFingerprint,
} from "./schemas.js";

export type {
  GenerateStudioReportRequest,
  ReviseStudioReportRequest,
  DeckPlan,
  PublishedModuleManifest,
  PageRecipePlan,
  PageFitMeasurement,
  ModuleChartKind,
  RepairMode,
  GenerationMode,
  HtmlAnimationPage,
  HtmlAnimationStructure,
  HtmlPageAnimationManifest,
  ModuleUsageMode,
  HtmlOutputMode,
  PageOverflowCause,
  PageCompositionFingerprint,
} from "./schemas.js";

export type GeneratedReportStyleProfile = ReturnType<typeof toGeneratedReportStyleProfile>;
export type Studio3dHeroReferenceName =
  | "object-grammar-chip-platform"
  | "composition-families"
  | "material-and-annotation-language"
  | "prompt-examples";

export type DeckPressureBudget = {
  mode: "standard" | "long-form";
  maxPagePromptChars: number;
  maxRepairPromptChars: number;
};
export type PageContextBundle = {
  briefDigest: string[];
  evidenceBundle: string[];
};
export type RepairContextBundle = {
  briefDigest: string[];
  evidenceBundle: string[];
  deckPageMap: Array<{ pageNumber: number; pageTitle: string }>;
};
export type StagePressureReport = {
  stage: string;
  promptLength: number;
  payloadChars: number;
  durationMs: number;
  moduleUsageMode: ModuleUsageMode;
  publishedModuleCount: number;
};

export type StudioEvalOverrides = {
  forceThinkingMode?: DeckThinkingMode;
  forceWorkloadLane?: StudioWorkloadLane;
  disableTaskGrammarPacks?: boolean;
  disableLayoutPlanningBlock?: boolean;
  injectTaskGrammarPackIds?: StudioTaskGrammarPackId[];
};

export type StudioStageTraceEntry = {
  stage: string;
  status: "succeeded" | "failed";
  traceMeta: Record<string, unknown>;
  pressureReport: StagePressureReport;
  promptTracePath: string;
  latestPromptTracePath: string;
};

export type StudioAiWorkspaceStage = "planning" | "page" | "repair";

export type StudioAiWorkspaceBlockId =
  | "raw-brief"
  | "ai-understanding"
  | "visual-thinking"
  | "user-task"
  | "working-hypothesis"
  | "unknowns-boundary"
  | "page-mission"
  | "starter-pack"
  | "task-rigor-brief"
  | "renderer-brief"
  | "proof-plan"
  | "layout-strategy"
  | "private-layout-plan"
  | "source-material"
  | "page-intent"
  | "template-contract"
  | "capability-cards"
  | "output-rules";

export type StudioCapabilityCardId =
  | "thinking-mode"
  | "analysis"
  | "task-grammar"
  | "chart"
  | "template"
  | "density-budget"
  | "craft-direction"
  | "style-direction"
  | "composition-direction"
  | "explicit-3d"
  | "layout-repair"
  | "template-repair";

export type StudioCapabilityCard = {
  id: StudioCapabilityCardId;
  title: string;
  lines: string[];
};

export type StudioAiWorkspaceBlock = {
  id: StudioAiWorkspaceBlockId;
  title: string;
  lines: string[];
  rawText?: string | null;
};

export type StudioAiWorkspace = {
  stage: StudioAiWorkspaceStage;
  blocks: StudioAiWorkspaceBlock[];
  capabilityCards: StudioCapabilityCard[];
  selectedTemplateIds: string[];
  workloadLane?: StudioWorkloadLane;
  taskGrammarPackIds?: StudioTaskGrammarPackId[];
  rigorLevel?: StudioTaskRigor;
  freeformLayoutPlan?: FreeformLayoutPlan | null;
  workingMemory?: StudioWorkingMemory | null;
  preflight?: StudioPreflightPlan | null;
};

export type StudioAiWorkspacePromptMeta = {
  workspaceBlockIds: StudioAiWorkspaceBlockId[];
  workspaceCapabilityCardIds: StudioCapabilityCardId[];
  workspaceSelectedTemplateIds: string[];
  workspaceIncludes3dCard: boolean;
  workspacePromptChars: number;
  workloadLane?: StudioWorkloadLane;
  taskGrammarPackIds?: StudioTaskGrammarPackId[];
  complexitySignalGroups?: StudioComplexitySignalGroup[];
  complexitySignalPhrases?: string[];
  rigorLevel?: StudioTaskRigor;
  freeformLayoutFamily?: FreeformLayoutFamily | null;
  freeformVisualAnchor?: string | null;
  freeformReadingPath?: string | null;
  freeformAvoidedDefaultRail?: boolean | null;
  layoutStrategyFamily?: FreeformLayoutFamily | null;
  wmPrimaryObject?: string | null;
  wmUserOperation?: StudioUserOperation | null;
  wmAudienceBar?: string | null;
  wmEvidenceRegime?: StudioEvidenceRegime | null;
  wmUnknownCount?: number;
  semanticCorrectionAttempted?: boolean;
  semanticCorrectionPass?: boolean;
  preflightSubject?: string | null;
  preflightCoreTask?: string | null;
  preflightEvidenceTier?: StudioEvidenceTier | null;
  preflightIncludes3dActivation?: boolean;
};
export type StudioGenerateStage =
  | "preflight"
  | "planning"
  | "evidence"
  | "modules"
  | "pages"
  | "review"
  | "finalizing"
  | `page-${number}`
  | `page-recipe-${number}`
  | `page-render-${number}`
  | `repair-page-${number}`;

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
      report: {
        title: string;
        html: string;
        pageCount: number;
        pageTitles: string[];
        htmlOutputMode?: HtmlOutputMode;
        animationStructure?: HtmlAnimationStructure;
        styleProfileId?: string;
        styleProfile?: GeneratedReportStyleProfile;
      };
    }
  | {
      type: "error";
      runId: string;
      reason: string;
    };

export type ExecuteStageResult = {
  summary: string;
  model: string | null;
  streamedAssistantText: string;
};

export type EvidenceNodeKind = "metric" | "comparison" | "timeline" | "claim";

export type EvidenceNode = {
  id: string;
  kind: EvidenceNodeKind;
  label: string;
  sourceText: string;
  valueText?: string;
  numericValue?: number | null;
  category?: string;
  seriesName?: string;
  timeLabel?: string;
};

export type FactTable = {
  items: EvidenceNode[];
};

export type ComparisonSet = {
  id: string;
  title: string;
  items: Array<{
    label: string;
    valueText: string;
    numericValue: number | null;
  }>;
};

export type TimelineSet = {
  id: string;
  title: string;
  categories: string[];
  values: number[];
  unit: string | null;
};

export type SeriesTable = {
  id: string;
  title: string;
  categories: string[];
  series: Array<{
    name: string;
    values: number[];
    color?: string;
  }>;
  unit: string | null;
};

export type EvidenceGraph = {
  normalizedBrief: string;
  nodes: EvidenceNode[];
  factTable: FactTable;
  comparisonSets: ComparisonSet[];
  timelineSets: TimelineSet[];
  seriesTables: SeriesTable[];
  claims: string[];
};

export type ChartFallbackMode = "metric-strip" | "comparison" | "annotation";

export type ChartSpec = {
  kind: ModuleChartKind;
  categories: string[];
  series: Array<{
    name: string;
    values: number[];
    color?: string;
  }>;
  unit: string;
  title: string;
  insight: string;
  confidence: number;
  fallbackMode: ChartFallbackMode;
  sourceEvidenceIds: string[];
};

export type CompositeChartSpec = ChartSpec & {
  composite: "annotation-rail" | "metric-strip" | "decision-footer";
};


export type DeckCompositionBrief = {
  motif: string;
  rhythm: string;
  guidance: string[];
};

export type DeckCompositionDiversityReport = {
  uniqueFamilyCount: number;
  largestRepeatRun: number;
  diversityScore: number;
  repeatedFamilies: string[];
};

export type FreeformLayoutFamily =
  | "poster-claim"
  | "center-stage-figure"
  | "single-proof-canvas"
  | "vertical-story-strip"
  | "case-timeline"
  | "annotation-stage"
  | "evidence-wall"
  | "asymmetric-proof-field";

export type StudioWorkloadLane = "fast" | "deep";

export type StudioTaskRigor = "standard" | "high-spec";

export type StudioComplexitySignalGroup =
  | "high-spec-modifier"
  | "specialized-artifact"
  | "high-pressure-constraint"
  | "structured-proof";

export type StudioTaskGrammarPackId =
  | "valuation-finance-grade"
  | "operator-product-teardown"
  | "technical-architecture-review"
  | "research-result-synthesis"
  | "unstructured-synthesis"
  | "strict-style-enforcement";

export type StudioTaskGrammarPack = {
  id: StudioTaskGrammarPackId;
  title: string;
  artifactLabel: string;
  deliverableLabel: string;
  lines: string[];
  proofPlanLines: string[];
  layoutPreferenceLines: string[];
  downgradeGuard: string;
};

export type StudioComplexityProfile = {
  workloadLane: StudioWorkloadLane;
  rigorLevel: StudioTaskRigor;
  reason: string;
  deliverable: string;
  specializedArtifact: string | null;
  signalGroups: StudioComplexitySignalGroup[];
  signalPhrases: string[];
  taskDrivenSignalGroups: StudioComplexitySignalGroup[];
  sourceSupplementSignalGroups: StudioComplexitySignalGroup[];
  taskGrammarPacks: StudioTaskGrammarPack[];
};

export type FreeformLayoutPlan = {
  layoutFamily: FreeformLayoutFamily;
  visualAnchor: string;
  readingPath: string;
  regionPlan: string[];
  copyPlacement: string[];
  avoidPattern: string[];
};

export type PageRecipe = {
  pageNumber: number;
  pageTitle: string;
  pageIntent: string;
  objective: string;
  insight: string;
  pageClass: LongFormPageClass;
  densityBudget: PageDensityBudget;
  compositionHint: string | null;
  layout: "hero-proof" | "comparison" | "chart-insight" | "sequence" | "decision";
  chartPriority: "none" | "suggested" | "required";
  evidenceIds: string[];
  evidenceBundle: string[];
  heroClaim: string;
  supportBullets: string[];
  evidenceBullets: string[];
  takeaway: string;
  moduleBinding: PublishedModuleManifest | null;
  chartSpec: CompositeChartSpec | null;
  fallbackReason: string | null;
  freeformLayoutPlan?: FreeformLayoutPlan | null;
  briefSynthesisConfidence?: StudioBriefSynthesisConfidence;
  sparseBriefMode?: boolean;
  workloadLane?: StudioWorkloadLane;
  taskGrammarPackIds?: StudioTaskGrammarPackId[];
  complexitySignalPhrases?: string[];
  evidenceSourceUsed?: StudioBriefSynthesisEvidenceSource;
  pageIntentQuality?: StudioPageIntentQualityResult;
  intentRefinementAttempted?: boolean;
  deepQa?: StudioDeepPageQualityResult | null;
};

export type ChartPressureMode = "single-dominant-figure" | "standard";

export type ChartPageIntent = {
  enabled: boolean;
  pressureMode: ChartPressureMode;
  question: string | null;
  explanationBudget: string[];
  reason: string;
};

export type HeroObjectFamily =
  | "chip-die-substrate"
  | "platform-stack"
  | "interconnect-fabric"
  | "system-cutaway";

export type HeroCompositionFamily =
  | "right-dominant-cutaway"
  | "exploded-stack"
  | "layered-chip-slab"
  | "platform-block-diagram-3d";

export type HeroAnnotationMode =
  | "anchored-side-labels"
  | "perimeter-callouts"
  | "etched-inline-labels";

export type HeroModelIntent = {
  enabled: boolean;
  objectFocus: string | null;
  objectFamily: HeroObjectFamily | null;
  recommendedCompositionFamily: HeroCompositionFamily | null;
  materialHints: string[];
  annotationMode: HeroAnnotationMode | null;
  narrativeBudget: string[];
  reason: string;
};

export type DeckHeroArtDirection = {
  materialDirection: string;
  spatialMood: string;
  annotationTone: string;
  explanationDirection: string;
  objectVocabulary: string[];
  structuralLanguage: string[];
  guidance: string[];
};

export type V2RecipePlanPage = PageRecipePlan["pages"][number];

export type GenerationFallbackReason =
  | "recipe_planning_failed"
  | "recipe_invalid"
  | "module_manifest_failed"
  | "evidence_graph_failed"
  | "page_render_failed";

export type LoadedStudioAnalysisSkill = {
  path: string | null;
  body: string;
  hash: string;
  source: "file" | "fallback";
};

export type LoadedStudioLayoutRepairSkill = {
  path: string | null;
  body: string;
  hash: string;
  source: "file" | "fallback";
};

export type DeckThinkingMode =
  | "neutral"
  | "strategy"
  | "case-study"
  | "academic-research"
  | "brain-to-deck";

export type ThinkingModePlugin = {
  mode: DeckThinkingMode;
  label: string;
  summary: string;
  questionLabel: string;
  planningPromptLines: string[];
  pagePromptLines: string[];
  repairPromptLines: string[];
  heuristicPlanningLines: string[];
  longFormSequencingLines: string[];
  bannedLexicon: string[];
};

export type ThinkingSourceWeightProfile = {
  taskIntentChars: number;
  sourceMaterialChars: number;
  globalHintsChars: number;
  sourceMaterialBlockCount: number;
  sourceDominant: boolean;
};

export type SegmentedThinkingInputs = {
  taskIntentText: string;
  sourceMaterialText: string;
  globalHintsText: string;
  sourceWeightProfile: ThinkingSourceWeightProfile;
};

export type ResolvedThinkingContext = {
  mode: DeckThinkingMode;
  reason: string;
  plugin: ThinkingModePlugin;
  inputs: SegmentedThinkingInputs;
  lockedByTaskIntent: boolean;
};

export type WorkingMemorySlotConfidence = "high" | "medium" | "low" | "unknown";

export type StudioUserOperation =
  | "explain"
  | "compare"
  | "value"
  | "critique"
  | "narrate"
  | "synthesize"
  | "unknown";

export type StudioEvidenceRegime =
  | "source-backed"
  | "mixed-inline-evidence"
  | "sparse-no-hard-data"
  | "unknown";

export type StudioEvidenceTier =
  | "source-backed"
  | "axiomatic/common-knowledge"
  | "explicit assumption";

export type StudioVisualThinking = {
  dominantVisualAnchor: string;
  readingPath: string;
  regionStrategy: string;
  densityPosture: string;
  avoidPattern: string;
};

export type StudioCapabilityActivationKind =
  | "style"
  | "3d"
  | "chart"
  | "template"
  | "data-visualization"
  | "freeform-layout";

export type StudioCapabilityActivation = {
  kind: StudioCapabilityActivationKind;
  reason: string;
  lines?: string[];
};

export type StudioPageMission = {
  pageNumber: number;
  title: string;
  mission: string;
  headlineClaim: string;
  supportPoints: string[];
  evidenceNotes: string[];
  preferredVisual: string | null;
  missionScope: "page" | "deck";
  structureCue: "matrix" | "quadrant" | "chart" | null;
};

export type StudioPreflightPlan = {
  rawBrief: string;
  subject: string;
  deliverable: string;
  pageCount: number | null;
  audienceOrQualityBar: string | null;
  coreTask: string;
  evidencePolicy: {
    tier: StudioEvidenceTier;
    summary: string;
    lines: string[];
  };
  pageMissions: StudioPageMission[];
  visualThinking: StudioVisualThinking;
  capabilityActivations: StudioCapabilityActivation[];
  assumptionPolicy: string[];
};

export type SemanticCorrectionResult = {
  attempted: boolean;
  pass: boolean;
  reason: string;
  correctedSlots: Array<"primaryObject" | "userOperation" | "audienceBar" | "evidenceRegime">;
};

export type WorkingMemoryAcceptanceResult = {
  pass: boolean;
  reasons: string[];
};

export type StudioOperator = {
  id: string;
  kind: "task" | "evidence" | "visual";
  title: string;
  lines: string[];
  rendererLines?: string[];
};

export type StudioWorkingMemory = {
  rawBrief: string;
  primaryObject: string;
  userOperation: StudioUserOperation;
  deliverable: string;
  audienceBar: string | null;
  evidenceRegime: StudioEvidenceRegime;
  hardConstraints: string[];
  unknowns: string[];
  currentPageMission: string[];
  acceptanceChecks: string[];
  slotConfidence: {
    primaryObject: WorkingMemorySlotConfidence;
    userOperation: WorkingMemorySlotConfidence;
    deliverable: WorkingMemorySlotConfidence;
    audienceBar: WorkingMemorySlotConfidence;
    evidenceRegime: WorkingMemorySlotConfidence;
  };
  sourceMaterialDigest: string[];
  evidenceBoundary: string[];
  internalOperators: StudioOperator[];
  semanticCorrection: SemanticCorrectionResult;
  acceptanceResult: WorkingMemoryAcceptanceResult;
  thinkingModeHint: DeckThinkingMode | null;
};

export type StudioBriefSynthesisConfidence =
  | "source-backed"
  | "deep-structured-sparse"
  | "sparse-safe-common-sense"
  | "insufficient";

export type StudioBriefSynthesisEvidenceSource =
  | "source-material"
  | "structured-common-sense"
  | "safe-common-sense"
  | "none";

export type StudioPageIntentSynthesis = {
  pageNumber: number;
  pageTitle: string;
  pageQuestion: string;
  headlineClaim: string;
  supportBullets: string[];
  evidenceCallouts: string[];
  takeaway: string;
};

export type StudioBriefSynthesis = {
  workingMemory: StudioWorkingMemory;
  taskGoal: string;
  subject: string;
  deliverable: string;
  thinkingMode: DeckThinkingMode;
  workloadLane: StudioWorkloadLane;
  rigorLevel: StudioTaskRigor;
  specializedArtifact: string | null;
  contentConfidence: StudioBriefSynthesisConfidence;
  safeKnowledgePolicy: string[];
  sourceMaterialDigest: string[];
  evidenceCandidates: string[];
  audienceFacingThesisCandidates: string[];
  pageIntents: StudioPageIntentSynthesis[];
  evidenceInputText: string;
  evidenceSourceUsed: StudioBriefSynthesisEvidenceSource;
  sparseBriefMode: boolean;
  structuredSparseMode: boolean;
  taskGrammarPacks: StudioTaskGrammarPack[];
  complexitySignalGroups: StudioComplexitySignalGroup[];
  complexitySignalPhrases: string[];
};

export type StudioPageIntentQualityResult = {
  pass: boolean;
  reasons: string[];
};

export type StudioDeepPageQualityResult = {
  pass: boolean;
  reasons: string[];
};

export type LoadedStudioThinkingModeSkill = {
  mode: DeckThinkingMode;
  path: string | null;
  body: string;
  hash: string;
  source: "file" | "fallback";
};

export type LoadedStudio3dHeroSkill = {
  path: string | null;
  body: string;
  hash: string;
  source: "file" | "fallback";
  references: Record<
    "object-grammar-chip-platform" | "composition-families" | "material-and-annotation-language" | "prompt-examples",
    {
      path: string | null;
      body: string;
      hash: string;
      source: "file" | "fallback";
    }
  >;
};

export type LongFormPageClass = "opening-core" | "proof-analysis" | "synthesis-support";

export type PageDensityBudget = {
  maxMajorRegions: number;
  maxSupportBullets: number;
  maxEvidenceBullets: number;
  maxParagraphCharacters: number;
  maxListItemCharacters: number;
  maxListItemsPerList: number;
  allowRightRail: boolean;
  allowFooterRail: boolean;
};

export type PageRepairProfile = {
  pageClass: LongFormPageClass;
  densityBudget: PageDensityBudget;
  overflowCause: PageOverflowCause;
  isCriticalPage: boolean;
  preserveComposition: boolean;
};

export type LongFormReviewBudget = {
  hardTimeoutMs: number;
  maxPagesPerPass: number;
  maxAggressivePages: number;
};

export type LongFormSectionSummary = {
  id: string;
  title: string;
  summary: string;
  lines: string[];
  evidenceIds: string[];
  chartCandidate: ModuleChartKind | "none";
};

export type LongFormEvidenceBundle = {
  id: string;
  title: string;
  summary: string;
  evidenceIds: string[];
  chartCandidate: ModuleChartKind | "none";
  pageClass: LongFormPageClass;
};

export type FileContext = {
  name: string;
  type: string;
  content: string;
};

export type WorkspaceEvalScenarioClass =
  | "ordinary-sparse"
  | "mode-sensitive"
  | "deep-grade"
  | "controls";

export type WorkspaceEvalVariantId =
  | "auto"
  | "forced-deep"
  | "forced-fast"
  | "forced-neutral-mode"
  | "disable-task-grammar"
  | "disable-layout-planning";

export type WorkspaceEvalScenario = {
  id: string;
  label: string;
  category: WorkspaceEvalScenarioClass;
  prompt: string;
  pageCount?: number;
  generationMode?: GenerationMode;
  moduleUsageMode?: ModuleUsageMode;
  autoExpectations: {
    thinkingMode?: DeckThinkingMode;
    workloadLane?: StudioWorkloadLane;
    subjectIncludes?: string[];
    deliverableIncludes?: string[];
    requiredHtmlPhrases?: string[];
    forbiddenHtmlPhrases?: string[];
  };
};

export type WorkspaceEvalScorecard = {
  runId: string;
  scenarioId: string;
  variantId: WorkspaceEvalVariantId;
  liveExecuted: boolean;
  qualityScore: number;
  routeIssues: string[];
  hygieneIssues: string[];
  genreIssues: string[];
  structureIssues: string[];
  disciplineIssues: string[];
};

export const LONG_FORM_REVIEW_BUDGET: LongFormReviewBudget = {
  hardTimeoutMs: 180_000,
  maxPagesPerPass: 3,
  maxAggressivePages: 2,
};
