export type BlockKind =
  | "metrics"
  | "bars"
  | "line"
  | "matrix"
  | "flow"
  | "gantt"
  | "phases";
export type BlockTone = "teal" | "navy" | "amber";
export type TemplateId = "blank";
export type StarterPackId = string;
export type StarterPackSource = "html-ppt-skill";
export type StarterPackKind = "layout" | "deck";
export type StarterPackUsageMode = "deck" | "page" | "theme";
export type StarterApplicationMode = "deck" | "theme" | "mixed";
export type StarterPackMappingStatus = "shell-only" | "manual-workbench" | "compiled-template";
export type ConversationMessageRole = "assistant" | "user";
export type ModuleRegistryCategory =
  | "evidence"
  | "comparison"
  | "logic"
  | "roadmap";
export type ModuleRegistryScope = "core" | "community" | "private";
export type ModuleRegistryStatus = "draft" | "experimental" | "beta" | "stable";
export type ModuleTemplateFamily = "primitive" | "framework" | "story-pattern";
export type SkillClass = "framework" | "domain" | "output";
export type SkillRegistryScope = ModuleRegistryScope;
export type SkillRegistryStatus = "draft" | "beta" | "stable";
export type WorkbenchGenerationMode = "standard" | "long-form";
export type WorkbenchModuleUsageMode = "disabled" | "fallback" | "chart-only";
export type DeckThinkingMode =
  | "neutral"
  | "strategy"
  | "case-study"
  | "academic-research"
  | "brain-to-deck";
export type LongFormClarificationTrigger =
  | "explicit-8-9-pages"
  | "long-input-opportunity";
export type LongFormClarificationStatus = "idle" | "pending" | "resolved";
export type LongFormClarificationResolution =
  | "keep-standard"
  | "long-form-10"
  | "long-form-12"
  | "dismissed";
export type ModuleRendererCapability =
  | "metric-grid"
  | "bar-comparison"
  | "trend-line"
  | "matrix-grid"
  | "step-flow"
  | "timeline-roadmap"
  | "phase-summary";
export type ModuleTemplateFieldType =
  | "page-goal"
  | "comparison-axis"
  | "dimension"
  | "evidence"
  | "step"
  | "phase"
  | "curve"
  | "custom";
export type ModuleCanvasObjectKind =
  | "slot"
  | "rectangle"
  | "ellipse"
  | "line"
  | "text"
  | "image"
  | "data"
  | "chart";
export type ModuleFieldStrokeStyle = "solid" | "dashed";
export type ModuleCanvasSurface = "artboard" | "pasteboard";
export type ModuleConnectionKind = "link" | "data-flow" | "explain" | "ai-fill";
export type ModuleAiState = "locked" | "ai-fill" | "summarize-linked-data";
export type ModuleDataColumnType =
  | "text"
  | "number"
  | "percent"
  | "currency"
  | "date";
export type ModuleChartKind = "bar" | "stacked" | "line" | "waterfall";
export type DataTableColumn = {
  id: string;
  label: string;
  type: ModuleDataColumnType;
};
export type DataTableModel = {
  raw: string;
  hasHeader: boolean;
  columns: DataTableColumn[];
  rows: string[][];
};
export type ModuleThinkingFlowBranch = "yes" | "no";
export type ModuleThinkingFlowToolAdapterId =
  | "support"
  | "keywords"
  | "numbers"
  | "quotes";
export type ModuleFieldOutputFormat =
  | "point"
  | "bullets"
  | "comparison"
  | "chart";
export type ModuleFieldOutputLength = "tight" | "short" | "full";
export type ModuleThinkingFlowNodeKind =
  | "start"
  | "brief"
  | "think"
  | "if"
  | "tool"
  | "calc"
  | "output";
export type ModuleSkillBindingStatus = "required" | "recommended" | "optional";
export type ModuleSkillRequirementRole =
  | "framework"
  | "domain"
  | "output"
  | "custom";
export type ModuleSkillCompatibilityStatus =
  | "supported"
  | "recommended"
  | "experimental"
  | "incompatible";
export type CompositionTestResult = "pass" | "warn" | "fail";
export type ModuleTemplateId = string;
export type SkillDefinitionId = string;
export type ModuleSkillPresetId = string;

export type ConversationMessage = {
  role: ConversationMessageRole;
  text: string;
};

export type WorkbenchLongFormClarificationState = {
  status: LongFormClarificationStatus;
  trigger: LongFormClarificationTrigger | null;
  resolution: LongFormClarificationResolution | null;
};

export type WorkbenchDeckOptimizationState = {
  autoOptimizedReportKey: string | null;
  autoOptimizedVersion: number | null;
};

export type LayoutBlock = {
  id: string;
  moduleId?: ModuleTemplateId;
  presetId?: ModuleSkillPresetId | null;
  enabledSkillIds?: SkillDefinitionId[];
  disabledDefaultSkillIds?: SkillDefinitionId[];
  plannerRole?: PageCompositionSlotRole;
  plannerPatternId?: PageCompositionPatternId;
  plannerReason?: string;
  plannerScore?: number;
  title: string;
  detail: string;
  intent?: string;
  kind: BlockKind;
  tone: BlockTone;
  x: number;
  y: number;
  w: number;
  h: number;
  minW: number;
  minH: number;
  visualScale: number;
};

export type ModuleSkillBinding = {
  id: string;
  label: string;
  status: ModuleSkillBindingStatus;
  description: string;
  source: "builtin" | "skill";
  skillPath?: string;
};

export type ModuleSkillRequirement = {
  skillId: SkillDefinitionId;
  status: ModuleSkillBindingStatus;
  reason: string;
  role: ModuleSkillRequirementRole;
  defaultEnabled: boolean;
  order: number;
  label?: string;
  description?: string;
  source?: ModuleSkillBinding["source"];
  skillPath?: string;
};

export type ModuleTemplateField = {
  id: string;
  label: string;
  type: ModuleTemplateFieldType;
  objectKind?: ModuleCanvasObjectKind;
  aiState?: ModuleAiState;
  surface?: ModuleCanvasSurface;
  groupId?: string;
  description: string;
  required: boolean;
  example?: string;
  outputContract?: {
    goal?: string;
    format?: ModuleFieldOutputFormat;
    length?: ModuleFieldOutputLength;
    mustInclude?: string;
  };
  dataTable?: DataTableModel;
  chartSpec?: {
    kind: ModuleChartKind;
  };
  imageAsset?: ImportedSourceAssetRef;
  imageFit?: "cover" | "contain";
  importSource?: {
    imported: true;
    sourceFileName: string;
    slideNumber: number;
    sourceObjectId: string;
    sourceObjectKind: ImportedSourceObjectKind;
    reviewState?: "ready" | "needs-review";
    reviewNote?: string;
    sourceName?: string;
    sourcePath?: string;
  };
  style?: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    strokeStyle?: ModuleFieldStrokeStyle;
    radius?: "none" | "soft" | "round";
    textAlign?: "left" | "center" | "right";
    rotation?: number;
    aspectLock?: "square";
  };
  layout?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
};

export type ModuleExampleRef = {
  id: string;
  label: string;
  description: string;
};

export type ModuleFrameLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ModuleConnection = {
  id: string;
  sourceFieldId: string;
  targetFieldId: string;
  kind: ModuleConnectionKind;
};

export type ModuleThinkingFlowNode = {
  id: string;
  label: string;
  detail: string;
  kind: ModuleThinkingFlowNodeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  fieldId?: string;
  toolConfig?: {
    adapterId?: ModuleThinkingFlowToolAdapterId;
    focusPrompt?: string;
    maxItems?: number;
  };
};

export type ModuleThinkingFlowEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  branch?: ModuleThinkingFlowBranch;
};

export type ModuleThinkingFlow = {
  nodes: ModuleThinkingFlowNode[];
  edges: ModuleThinkingFlowEdge[];
};

export type ModuleRegistryEntry = {
  id: ModuleTemplateId;
  kind: BlockKind;
  label: string;
  category: ModuleRegistryCategory;
  scope: ModuleRegistryScope;
  status: ModuleRegistryStatus;
  family: ModuleTemplateFamily;
  semanticRole: string;
  description: string;
  promptHint: string;
  useCases: string[];
  searchTerms: string[];
  rendererCapabilities: ModuleRendererCapability[];
  skillBindings: ModuleSkillBinding[];
  defaultSkillRequirements?: ModuleSkillRequirement[];
  supportedSkillClasses?: SkillClass[];
  incompatibleSkillIds?: SkillDefinitionId[];
  examples?: ModuleExampleRef[];
  moduleFrame?: ModuleFrameLayout;
  connections?: ModuleConnection[];
  thinkingFlow?: ModuleThinkingFlow;
  fields: ModuleTemplateField[];
  order: number;
  featured: boolean;
};

export type PublishedModuleDeterministicCapability =
  | "native"
  | "flow"
  | "hybrid"
  | "fallback";

export type PublishedModuleManifestField = {
  fieldId: string;
  label: string;
  required: boolean;
  objectKind?: ModuleCanvasObjectKind;
  outputFormat?: ModuleFieldOutputFormat;
  outputGoal?: string;
  chartKind?: ModuleChartKind;
};

export type TemplateManifestGeometry = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PublishedTemplateSlotVisualWeight =
  | "primary"
  | "secondary"
  | "supporting";
export type PublishedTemplateSlotKind =
  | "ai-text"
  | "chart"
  | "data-summary";
export type PublishedTemplateDecorativeKind =
  | "locked-text"
  | "rectangle"
  | "square"
  | "circle"
  | "line"
  | "image";

export type PublishedTemplateShape =
  | "page-template"
  | "poster-claim"
  | "center-stage-figure"
  | "vertical-story-strip"
  | "single-proof-canvas"
  | "case-timeline"
  | "evidence-wall"
  | "annotation-stage"
  | "module-fragment";

export type PublishedTemplateSlotManifest = {
  slotId: string;
  label: string;
  slotKind: PublishedTemplateSlotKind;
  role: string;
  required: boolean;
  canHide: boolean;
  objectKind?: ModuleCanvasObjectKind;
  outputFormat?: ModuleFieldOutputFormat;
  outputGoal?: string;
  chartKind?: ModuleChartKind;
  geometry?: TemplateManifestGeometry;
  visualWeight: PublishedTemplateSlotVisualWeight;
  contentBudget: string[];
};

export type PublishedTemplateDecorativeManifest = {
  id: string;
  label: string;
  kind: PublishedTemplateDecorativeKind;
  role: string;
  geometry?: TemplateManifestGeometry;
  asset?: ImportedSourceAssetRef;
  fit?: "cover" | "contain";
  style?: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    strokeStyle?: ModuleFieldStrokeStyle;
    radius?: "none" | "soft" | "round";
    textAlign?: "left" | "center" | "right";
    rotation?: number;
  };
};

export type PublishedTemplateManifest = {
  templateId: ModuleTemplateId;
  sourceModuleId: ModuleTemplateId;
  label: string;
  family: ModuleTemplateFamily;
  shape: PublishedTemplateShape;
  frame?: TemplateManifestGeometry;
  visualHierarchy: string[];
  slotManifest: PublishedTemplateSlotManifest[];
  decorativeManifest: PublishedTemplateDecorativeManifest[];
  copyBudget: string[];
  allowedAdaptations: string[];
  fitRules: string[];
  promptContract: string[];
};

export type PublishedModuleManifest = {
  moduleId: ModuleTemplateId;
  kind: BlockKind;
  category: ModuleRegistryCategory;
  status: ModuleRegistryStatus;
  label: string;
  semanticRole: string;
  promptHint: string;
  rendererCapabilities: ModuleRendererCapability[];
  supportedChartKinds: ModuleChartKind[];
  deterministicCapability: PublishedModuleDeterministicCapability;
  outputContractSummary: string[];
  fieldManifest: PublishedModuleManifestField[];
  publishCount: number;
  lastPublishedAt: string | null;
  hasPassingEvidence: boolean;
  trustScore: number;
  signature: string;
  template?: PublishedTemplateManifest;
};

export type SkillFieldRule = {
  fieldId: string;
  rule: string;
  required: boolean;
  examples: string[];
};

export type SkillAntiPattern = {
  id: string;
  label: string;
  description: string;
};

export type SkillEvidenceRule = {
  id: string;
  description: string;
  severity: ModuleSkillBindingStatus;
};

export type SkillStyleRule = {
  id: string;
  description: string;
};

export type SkillLogicBlock = {
  id: string;
  label: string;
  description: string;
};

export type SkillDefinition = {
  id: SkillDefinitionId;
  version: number;
  label: string;
  class: SkillClass;
  scope: SkillRegistryScope;
  status: SkillRegistryStatus;
  semanticPromise: string;
  summary: string;
  targetModuleFamilies: ModuleTemplateFamily[];
  targetModuleIds: ModuleTemplateId[];
  fieldRules: SkillFieldRule[];
  antiPatterns: SkillAntiPattern[];
  evidenceRules: SkillEvidenceRule[];
  styleRules: SkillStyleRule[];
  logicBlocks: SkillLogicBlock[];
  createdAt: string;
  updatedAt: string;
  ownerId: string;
};

export type ModuleSkillPreset = {
  id: ModuleSkillPresetId;
  version: number;
  label: string;
  moduleId: ModuleTemplateId;
  skillIds: SkillDefinitionId[];
  requiredSkillIds: SkillDefinitionId[];
  optionalSkillIds: SkillDefinitionId[];
  scope: ModuleRegistryScope;
  status: SkillRegistryStatus;
  description: string;
  useCases: string[];
  compatibilitySignature: string;
  testSummary: CompositionTestSummary;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
};

export type CompositionRuntimeOverride = {
  key: string;
  value: string;
};

export type ModuleInstanceComposition = {
  pageId: string;
  blockId: string;
  moduleId: ModuleTemplateId;
  presetId: ModuleSkillPresetId | null;
  enabledSkillIds: SkillDefinitionId[];
  disabledDefaultSkillIds: SkillDefinitionId[];
  pageInstruction?: string;
  blockIntent?: string;
  runtimeOverrides?: CompositionRuntimeOverride[];
};

export type ModuleGenerationRouteMode = "explicit" | "default" | "routed";

export type ModuleGenerationRouteDecision = {
  currentModuleId: ModuleTemplateId;
  selectedModuleId: ModuleTemplateId;
  routeMode: ModuleGenerationRouteMode;
  reason: string;
  score: number;
};

export type PageCompositionSlotRole =
  | "framework"
  | "evidence"
  | "supportingEvidence"
  | "trend"
  | "annotation"
  | "takeaway"
  | "implication"
  | "sequence"
  | "risk";

export type PageCompositionPatternId =
  | "heroProof"
  | "frameworkDiagnostic"
  | "trendExplain"
  | "executionBridge";

export type PageSemanticTarget = {
  pageId: string;
  summary: string;
  keywords: string[];
  preferredPatternId: PageCompositionPatternId | null;
  evidenceWeight: number;
  frameworkWeight: number;
  trendWeight: number;
  executionWeight: number;
  implicationWeight: number;
  domainKeywords: string[];
};

export type PageCompositionPatternSlot = {
  id: string;
  role: PageCompositionSlotRole;
  preferredKinds: BlockKind[];
  x: number;
  y: number;
  w: number;
  h: number;
  requiredSkillClasses: SkillClass[];
  optionalSkillClasses: SkillClass[];
};

export type PageCompositionPattern = {
  id: PageCompositionPatternId;
  label: string;
  blockCount: 2 | 3;
  summary: string;
  slots: PageCompositionPatternSlot[];
};

export type ModulePlanCandidate = {
  moduleId: ModuleTemplateId;
  kind: BlockKind;
  score: number;
  reason: string;
  enabledSkillIds: SkillDefinitionId[];
  role: PageCompositionSlotRole;
  patternId: PageCompositionPatternId;
};

export type ModulePlanDecision = {
  pageId: string;
  patternId: PageCompositionPatternId;
  role: PageCompositionSlotRole;
  moduleId: ModuleTemplateId;
  kind: BlockKind;
  enabledSkillIds: SkillDefinitionId[];
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  detail: string;
  intent: string;
  reason: string;
  score: number;
};

export type ModuleSkillCompatibility = {
  id: string;
  moduleId: ModuleTemplateId;
  skillId: SkillDefinitionId;
  status: ModuleSkillCompatibilityStatus;
  reason: string;
  requiredFields: string[];
  warnings: string[];
  notes: string[];
  testedAt: string | null;
  testedBy: string | null;
};

export type CompositionEvaluation = {
  fieldCoverage: CompositionTestResult;
  semanticCorrectness: CompositionTestResult;
  frameworkCorrectness: CompositionTestResult;
  slideQuality: CompositionTestResult;
  notes: string[];
};

export type CompositionTestSummary = {
  totalRuns: number;
  passRuns: number;
  warnRuns: number;
  failRuns: number;
  lastRunAt: string | null;
};

export type CompositionTestInputOverride = {
  sourceText?: string;
  page?: {
    title?: string;
    note?: string;
    instruction?: string;
    role?: string;
    intent?: string;
    story?: string;
  };
  deck?: {
    previousPageSummary?: string;
    nextPageBridge?: string;
  };
  block?: {
    title?: string;
    detail?: string;
    intent?: string;
  };
  planItems?: Array<
    | {
        kind: "metric";
        value: string;
        label: string;
      }
    | {
        kind: "narrative";
        title: string;
        body: string;
      }
  >;
};

export type CompositionTestCase = {
  id: string;
  label: string;
  brief: string;
  moduleId: ModuleTemplateId;
  skillIds: SkillDefinitionId[];
  expectedBehaviors: string[];
  expectedWarnings: string[];
  tags: string[];
  runtimeInputOverride?: CompositionTestInputOverride;
};

export type LayoutPage = {
  id: string;
  chapter: string;
  title: string;
  note: string;
  instruction?: string;
  starterLayoutId?: StarterPackId | null;
  storyPagePlan?: StoryPagePlan;
  blocks: LayoutBlock[];
};

export type StoryPageRole =
  | "opening-frame"
  | "evidence-layer"
  | "middle-chapter"
  | "decision-bridge"
  | "closing-synthesis"
  | "standalone-page";

export type SlideVisualType = BlockKind;

export type EditableFieldKind =
  | "title"
  | "subtitle"
  | "summary"
  | "narrative"
  | "metric"
  | "chart-type"
  | "data"
  | "module"
  | "palette"
  | "tone";

export type EditableContentItem =
  | {
      id: string;
      kind: "metric";
      label: string;
      value: string;
    }
  | {
      id: string;
      kind: "narrative";
      title: string;
      body: string;
    };

export type SlideContentRegionRole =
  | "visual"
  | "supporting-evidence"
  | "annotation"
  | "takeaway"
  | "implication"
  | "sequence"
  | "risk"
  | "freeform";

export type SlideContentRegion = {
  id: string;
  role: SlideContentRegionRole;
  title: string;
  summary: string;
  visualType: SlideVisualType;
  blockId?: string;
  items: EditableContentItem[];
};

export type StoryPagePlan = {
  pageId: string;
  pageIndex: number;
  chapter: string;
  title: string;
  pageRole: StoryPageRole;
  objective: string;
  keyClaim: string;
  supportingPoints: string[];
  evidenceNeeded: string[];
  evidenceNotes: string[];
  transitionFromPrevious: string;
  bridgeToNext: string;
};

export type SlideModuleConfig = {
  blockId: string;
  moduleId: ModuleTemplateId;
  presetId: ModuleSkillPresetId | null;
  enabledSkillIds: SkillDefinitionId[];
  disabledDefaultSkillIds: SkillDefinitionId[];
  routeMode: ModuleGenerationRouteMode;
  routeReason: string;
  routeScore: number;
};

export type EditableField = {
  id: string;
  label: string;
  kind: EditableFieldKind;
  path: string;
  regionId?: string;
  blockId?: string;
};

export type EditableSlideSpec = {
  pageId: string;
  pageIndex: number;
  chapter: string;
  title: string;
  subtitle: string;
  pageRole: StoryPageRole;
  storyIntent: string;
  visualIntent: string;
  visualType: SlideVisualType;
  moduleConfigs: SlideModuleConfig[];
  contentRegions: SlideContentRegion[];
  densityBudget: {
    maxVisualLabels: number;
    maxNarrativeItemsPerRegion: number;
    maxBulletsPerRegion: number;
    maxWordsPerItem: number;
  };
  styleTokens: {
    tone: BlockTone;
    palette: string;
  };
  editableFields: EditableField[];
};

export type MetricFact = {
  value: string;
  label: string;
};

export type NarrativeItem = {
  title: string;
  body: string;
};

export type SlideSceneTextAlign = "left" | "center" | "right";
export type SlideSceneDataLayout = "stack" | "grid-2" | "grid-4" | "row";
export type SlideSceneDataAppearance = "plain" | "panel" | "stat" | "list";
export type SlideSceneChartAppearance = "panel" | "minimal";
export type SlideSceneObjectKind = Exclude<ModuleCanvasObjectKind, "slot" | "image">;

export type SlideSceneBaseObject = {
  id: string;
  kind: SlideSceneObjectKind;
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex?: number;
  rotation?: number;
  opacity?: number;
};

export type SlideSceneTextObject = SlideSceneBaseObject & {
  kind: "text";
  text: string;
  color?: string;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: SlideSceneTextAlign;
  italic?: boolean;
  uppercase?: boolean;
  fill?: string;
  radius?: number;
  padding?: number;
};

export type SlideSceneShapeObject = SlideSceneBaseObject & {
  kind: "rectangle" | "ellipse";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
};

export type SlideSceneLineObject = SlideSceneBaseObject & {
  kind: "line";
  stroke?: string;
  strokeWidth?: number;
};

export type SlideSceneDataItem = {
  eyebrow?: string;
  title: string;
  body?: string;
  value?: string;
  accent?: string;
};

export type SlideSceneDataObject = SlideSceneBaseObject & {
  kind: "data";
  eyebrow?: string;
  title?: string;
  body?: string;
  value?: string;
  items?: SlideSceneDataItem[];
  layout?: SlideSceneDataLayout;
  appearance?: SlideSceneDataAppearance;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  color?: string;
  textAlign?: SlideSceneTextAlign;
};

export type SlideSceneChartSeriesItem = {
  label: string;
  value: string;
  color?: string;
};

export type SlideSceneChartDataSeries = {
  name?: string;
  values: number[];
  color?: string;
};

export type SlideSceneChartData = {
  categories: string[];
  series: SlideSceneChartDataSeries[];
  xAxisTitle?: string;
  yAxisTitle?: string;
};

export type SlideSceneChartObject = SlideSceneBaseObject & {
  kind: "chart";
  chartKind: ModuleChartKind;
  title?: string;
  body?: string;
  series: SlideSceneChartSeriesItem[];
  chartData?: SlideSceneChartData;
  appearance?: SlideSceneChartAppearance;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  color?: string;
};

export type SlideSceneObject =
  | SlideSceneTextObject
  | SlideSceneShapeObject
  | SlideSceneLineObject
  | SlideSceneDataObject
  | SlideSceneChartObject;

export type SlideScene = {
  width: number;
  height: number;
  background: string;
  objects: SlideSceneObject[];
};

export type BlockDraft = {
  summary: string;
  metrics: MetricFact[];
  cards: NarrativeItem[];
  steps: NarrativeItem[];
};

export type BlockMarkdownArtifact = {
  markdown: string;
  adapterWarnings: string[];
};

export type PageDraft = {
  summary: string;
  scene?: SlideScene;
  blocks: Record<string, BlockDraft>;
  markdown?: string;
  blockMarkdown?: Record<string, BlockMarkdownArtifact>;
};

export type DraftProvider = "local" | "model";
export type GeneratedDraftMode = "outline" | "content";
export type WorkflowStage = "intake" | "layout" | "generated";

export type GeneratedDraftVersion = 1 | 2 | 3 | 4;
export type ProjectSnapshotVersion = 1;
export type GenerationHistoryVersion = 1;
export type PublishSnapshotVersion = 1;
export type PublishSnapshotFormat = "web" | "html" | "pdf" | "pptx";

export type SerializableBlockDraft = BlockDraft & {
  blockId: string;
  markdown?: string;
  adapterWarnings?: string[];
};

export type CompositionTestRun = {
  id: string;
  caseId: string;
  moduleId: ModuleTemplateId;
  skillIds: SkillDefinitionId[];
  provider: DraftProvider;
  model: string | null;
  startedAt: string;
  finishedAt: string;
  result: CompositionTestResult;
  baselineOutput: SerializableBlockDraft | null;
  composedOutput: SerializableBlockDraft;
  evaluation: CompositionEvaluation;
};

export type SerializablePageDraft = {
  pageId: string;
  summary?: string;
  scene?: SlideScene;
  blocks?: SerializableBlockDraft[];
  markdown?: string;
};

export type SerializableWorkbenchDraft = {
  title: string;
  subtitle?: string;
  pageDrafts: SerializablePageDraft[];
};

export type HtmlEditableBlockKind =
  | "eyebrow"
  | "headline"
  | "heading"
  | "paragraph"
  | "list";

export type HtmlEditableBlock = {
  id: string;
  kind: HtmlEditableBlockKind;
  text?: string;
  items?: string[];
  fontSize?: number;
  sourceTag: string;
  sourceIndex: number;
  sourcePath?: string;
  studioObjectId?: string;
  exportObjectId?: string;
  objectId?: string;
};

export type HtmlEditablePage = {
  id: string;
  pageNumber: number;
  title: string;
  headline?: string;
  blocks: HtmlEditableBlock[];
};

export type HtmlEditableStructure = {
  pages: HtmlEditablePage[];
};

export type HtmlVisualNodeKind =
  | "surface"
  | "divider"
  | "badge"
  | "highlight"
  | "annotation"
  | "rail"
  | "chart-frame"
  | "shape"
  | "connector"
  | "node"
  | "label-surface";

export type ScientificDiagramFamily = "neural-network";

export type NeuralNetworkDiagramConnectivity =
  | "dense"
  | "residual"
  | "encoder-decoder";

export type NeuralNetworkDiagramLayerRole =
  | "input"
  | "hidden"
  | "output"
  | "encoder"
  | "bottleneck"
  | "decoder";

export type NeuralNetworkDiagramLayer = {
  id: string;
  role: NeuralNetworkDiagramLayerRole;
  label: string;
  nodeCount: number;
};

export type ScientificDiagramSideNote = {
  id: string;
  text: string;
  side: "left" | "right";
};

export type NeuralNetworkDiagramSpec = {
  family: "neural-network";
  title: string;
  caption: string;
  layers: NeuralNetworkDiagramLayer[];
  connectivity: NeuralNetworkDiagramConnectivity;
  topLabel: string;
  bottomLabel: string;
  sideNotes: ScientificDiagramSideNote[];
  stylePreset: "paper-white";
};

export type ScientificDiagramSpec = NeuralNetworkDiagramSpec;

export type HtmlChartKind = ModuleChartKind | "combo" | "bubble" | "matrix";
export type HtmlChartSeriesRole = "bar" | "line";
export type HtmlChartAxisRole = "primary" | "secondary";
export type HtmlChartValueScale = "raw" | "thousand" | "million" | "billion";
export type HtmlChartExhibitPreset =
  | "auto"
  | "headline-bars"
  | "growth-line"
  | "margin-bridge"
  | "segment-mix"
  | "combo-trend-bars";
export type HtmlChartDensity = "hero" | "peer" | "sidecar";
export type HtmlChartValueFormat = {
  prefix?: string;
  suffix?: string;
  decimals?: number;
  scale?: HtmlChartValueScale;
};
export type HtmlChartPresentationTarget = {
  category?: string;
  seriesId?: string;
  pointIndex?: number;
};
export type HtmlChartPresentationEmphasis = {
  id: string;
  target: HtmlChartPresentationTarget;
  role: "primary" | "positive" | "negative" | "muted";
};
export type HtmlChartPresentationAnnotation = {
  id: string;
  target: HtmlChartPresentationTarget;
  text: string;
  placement?: "auto" | "above" | "right" | "below";
};
export type HtmlChartPresentationSpec = {
  version: 2;
  preset: "investor-editorial";
  exhibitPreset?: HtmlChartExhibitPreset;
  density?: HtmlChartDensity;
  valueFormat?: HtmlChartValueFormat;
  emphasis?: HtmlChartPresentationEmphasis[];
  annotations?: HtmlChartPresentationAnnotation[];
};
export type HtmlChartLineDash = "solid" | "dash" | "dot";
export type HtmlChartShadowStyle = {
  color?: string | null;
  opacity?: number;
  blurPt?: number;
  offsetPt?: number;
  angle?: number;
};
export type HtmlChartAxisStyle = {
  lineColor?: string | null;
  lineWidthPt?: number;
  lineDash?: HtmlChartLineDash | "none";
  gridColor?: string | null;
  gridWidthPt?: number;
  gridDash?: HtmlChartLineDash | "none";
  labelColor?: string | null;
  labelFontSize?: number;
};
export type HtmlChartNativeStyle = {
  xAxis?: HtmlChartAxisStyle;
  yAxis?: HtmlChartAxisStyle;
  secondaryYAxis?: HtmlChartAxisStyle;
  chartShadow?: HtmlChartShadowStyle | null;
  plotShadow?: HtmlChartShadowStyle | null;
  bubbleScale?: number;
};
export type HtmlChartSeriesStyle = {
  lineDash?: HtmlChartLineDash;
  lineWidthPt?: number;
  marker?: "circle" | "none";
  shadow?: HtmlChartShadowStyle | null;
};
export type HtmlChartSeries = {
  id: string;
  label: string;
  values: number[];
  color?: string | null;
  role?: HtmlChartSeriesRole;
  axis?: HtmlChartAxisRole;
  style?: HtmlChartSeriesStyle;
};
export type HtmlBubblePoint = {
  id: string;
  label: string;
  x: number;
  y: number;
  size: number;
  color?: string | null;
  group?: string | null;
};
export type HtmlBasicChartSpec = {
  kind: "bar" | "stacked" | "line" | "waterfall";
  title: string;
  subtitle: string;
  insight: string;
  unit: string;
  categories: string[];
  series: HtmlChartSeries[];
  presentation?: HtmlChartPresentationSpec;
  valueAxisMin?: number;
  valueAxisMax?: number;
  style?: HtmlChartNativeStyle;
};
export type HtmlComboChartSpec = {
  kind: "combo";
  title: string;
  subtitle: string;
  insight: string;
  unit: string;
  secondaryUnit?: string;
  categories: string[];
  series: HtmlChartSeries[];
  presentation?: HtmlChartPresentationSpec;
  valueAxisMin?: number;
  valueAxisMax?: number;
  style?: HtmlChartNativeStyle;
};
export type HtmlBubbleChartSpec = {
  kind: "bubble";
  title: string;
  subtitle: string;
  insight: string;
  unit: string;
  xLabel: string;
  yLabel: string;
  sizeLabel: string;
  points: HtmlBubblePoint[];
  presentation?: HtmlChartPresentationSpec;
  style?: HtmlChartNativeStyle;
};
export type HtmlMatrixItem = {
  id: string;
  label: string;
  detail: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string | null;
  textColor?: string | null;
};
export type HtmlMatrixCallout = {
  title: string;
  body: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string | null;
  textColor?: string | null;
  borderColor?: string | null;
};
export type HtmlMatrixPlotBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
};
export type HtmlMatrixQuadrant = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string | null;
  textColor?: string | null;
};
export type HtmlMatrixChartSpec = {
  kind: "matrix";
  title: string;
  subtitle: string;
  insight: string;
  xLabel: string;
  yLabel: string;
  xMinLabel?: string;
  xMaxLabel?: string;
  yMinLabel?: string;
  yMaxLabel?: string;
  plotBounds?: HtmlMatrixPlotBounds | null;
  quadrants?: HtmlMatrixQuadrant[];
  items: HtmlMatrixItem[];
  callout?: HtmlMatrixCallout | null;
  colors?: string[];
  presentation?: HtmlChartPresentationSpec;
};
export type HtmlChartSpec =
  | HtmlBasicChartSpec
  | HtmlComboChartSpec
  | HtmlBubbleChartSpec
  | HtmlMatrixChartSpec;
export type HtmlTableSpec = DataTableModel;

export type HtmlVisualModuleKind = "scientific-diagram" | "chart" | "table";

export type HtmlFitParticipation = "content" | "decorative";

export type HtmlVisualNodeStyle = {
  background?: string;
  border?: string;
  borderWidth?: number;
  radius?: number;
  accent?: string;
  opacity?: number;
  widthPercent?: number;
  height?: number;
  minHeight?: number;
  padding?: number;
};

export type HtmlVisualAtomizationRole = "leaf" | "container" | "scaffold";
export type HtmlVisualSelectionPriority = "primary" | "secondary";

export type HtmlVisualNode = {
  id: string;
  kind: HtmlVisualNodeKind;
  fitParticipation: HtmlFitParticipation;
  pageNumber: number;
  sourceTag: string;
  sourceIndex: number;
  studioObjectId?: string;
  exportObjectId?: string;
  exportObjectKind?: string;
  objectRole?: string;
  studioSlot?: string;
  renderTarget?: string;
  snapshotBoundary?: string;
  isContractRoot?: boolean;
  moduleId?: ModuleTemplateId;
  moduleLabel?: string;
  moduleKind?: HtmlVisualModuleKind;
  diagramSpec?: ScientificDiagramSpec | null;
  chartSpec?: HtmlChartSpec | null;
  tableSpec?: HtmlTableSpec | null;
  dataTable?: DataTableModel | null;
  sourcePath?: string;
  parentId?: string | null;
  childIds?: string[];
  atomizationRole?: HtmlVisualAtomizationRole;
  selectionPriority?: HtmlVisualSelectionPriority;
  style: HtmlVisualNodeStyle;
};

export type HtmlCanvasObjectFacet = "text" | "shape" | "data" | "export";
export type HtmlIframeObjectDiagnosticCode =
  | "iframe-object-anchor-missing"
  | "iframe-object-ambiguous-root"
  | "iframe-transparent-scaffold-suppressed"
  | "iframe-background-object-rejected"
  | "iframe-object-empty-root"
  | "iframe-object-unstable-bounds"
  | "iframe-snapshot-root-missing"
  | "iframe-snapshot-blank"
  | "iframe-text-overflow"
  | "iframe-annotation-ownership-leak"
  | "iframe-repeated-card-wall"
  | "primary-visual-text-facet-missing"
  | "chart-visual-module-missing"
  | "iframe-hidden-placeholder-anchor";

export type HtmlIframeObjectDiagnostic = {
  code: HtmlIframeObjectDiagnosticCode;
  severity: "info" | "warning";
  pageNumber: number;
  objectId?: string;
  message: string;
};

export type HtmlCanvasObject = {
  id: string;
  pageNumber: number;
  role: "contract" | "detected";
  rootNodeId: string | null;
  exportObjectId?: string;
  studioObjectId?: string;
  objectKind?: string;
  renderTarget?: string;
  textBlockIds: string[];
  visualNodeIds: string[];
  editableFacets: HtmlCanvasObjectFacet[];
};

export type HtmlVisualPage = {
  pageNumber: number;
  nodes: HtmlVisualNode[];
  objectDiagnostics?: HtmlIframeObjectDiagnostic[];
};

export type HtmlVisualStructure = {
  pages: HtmlVisualPage[];
};

export type HtmlLayoutZoneKind = "header" | "content";

export type HtmlLayoutZone = {
  id: string;
  kind: HtmlLayoutZoneKind;
  pageNumber: number;
  sourceTag: string;
  sourceIndex: number;
  splitPercent: number;
};

export type HtmlLayoutPage = {
  pageNumber: number;
  zones: HtmlLayoutZone[];
};

export type HtmlLayoutStructure = {
  pages: HtmlLayoutPage[];
};

export type HtmlCanvasFrame = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type HtmlCanvasLayer = "background" | "foreground";

export type HtmlCanvasTransform = {
  mode: "flow" | "freeform";
  frame: HtmlCanvasFrame;
  fontSize?: number;
  layer: HtmlCanvasLayer;
  layerOrder: number;
  lockedByUser: true;
};

export type HtmlCanvasPageOverrides = {
  pageNumber: number;
  blockOverrides: Record<string, HtmlCanvasTransform>;
  visualOverrides: Record<string, HtmlCanvasTransform>;
};

export type GeneratedHtmlReportCanvasOverrides = {
  pages: HtmlCanvasPageOverrides[];
};

export type HtmlVisualContentNodeKind =
  | "headline"
  | "heading"
  | "paragraph"
  | "list-item"
  | "label";

export type HtmlVisualContentNode = {
  id: string;
  kind: HtmlVisualContentNodeKind;
  sourceTag: string;
  sourceIndex: number;
  listItemIndex?: number;
  text: string;
};

export type HtmlPageVisualStyle = {
  pageBackground: string;
  dividerColor: string;
  surfaceFill: string;
  accentColor: string;
};

export type GeneratedHtmlReportStyleProfile = {
  id: string;
  label: string;
  industryLabel: string;
  summary: string;
  materialDirection: string;
  toneNotes: string[];
  pageBackground: string;
  surfaceFill: string;
  surfaceSecondary: string;
  dividerColor: string;
  accentColor: string;
  textPrimary: string;
  textMuted: string;
  chartPalette: string[];
};

export type HtmlOutputMode = "static" | "animated-preview-js";
export type HtmlAnimationEntryPreset =
  | "fade-up"
  | "fade-in"
  | "slide-right"
  | "slide-left"
  | "scale-in"
  | "chart-reveal";
export type HtmlPageAnimationStartMode = "entry-then-loop";

export type HtmlEntryTrack = {
  anchor: string;
  preset: HtmlAnimationEntryPreset;
  delayMs: number;
  durationMs: number;
  order: number;
};

export type HtmlRotateLoopEffect = {
  kind: "rotate";
  anchor: string;
  durationMs: number;
  direction?: "clockwise" | "counterclockwise";
  angleDeg?: number;
};

export type HtmlTickerLoopEffect = {
  kind: "ticker";
  anchor: string;
  items: string[];
  stepMs: number;
};

export type HtmlTypewriterLoopEffect = {
  kind: "typewriter";
  anchor: string;
  items: string[];
  typeMs: number;
  holdMs: number;
  deleteMs: number;
};

export type HtmlPulseLoopEffect = {
  kind: "pulse";
  anchor: string;
  durationMs: number;
  scaleFrom?: number;
  scaleTo?: number;
  opacityFrom?: number;
  opacityTo?: number;
};

export type HtmlOrbitLoopEffect = {
  kind: "orbit";
  anchor: string;
  durationMs: number;
  radiusPx: number;
  axis?: "x" | "y" | "xy";
};

export type HtmlLoopEffect =
  | HtmlRotateLoopEffect
  | HtmlTickerLoopEffect
  | HtmlTypewriterLoopEffect
  | HtmlPulseLoopEffect
  | HtmlOrbitLoopEffect;

export type HtmlPageAnimationManifest = {
  version: 1;
  startMode: HtmlPageAnimationStartMode;
  entryTracks?: HtmlEntryTrack[];
  loopEffects?: HtmlLoopEffect[];
};

export type HtmlAnimationPage = {
  pageNumber: number;
  anchors: string[];
  manifest: HtmlPageAnimationManifest | null;
};

export type HtmlAnimationStructure = {
  pages: HtmlAnimationPage[];
};

export type ExportObjectKind =
  | "chart-visual"
  | "native-chart"
  | "matrix"
  | "native-table"
  | "comparison-grid"
  | "metric-grid"
  | "card-grid"
  | "diagram"
  | "text";

export type ExportRenderTarget =
  | "visual-snapshot"
  | "native-chart"
  | "native-table"
  | "editable-shapes"
  | "editable-text"
  | "html-visual";

export type ExportObjectRole = "primary" | "secondary" | "annotation" | "source";

export type ExportOwnershipScope = {
  rootId: string;
  ownsText: boolean;
  ownsShapes: boolean;
  ownsSvg: boolean;
  childRoles: string[];
};

export type ExportDataAxisContract = {
  label?: string;
  unit?: string;
  min?: number;
  max?: number;
};

export type ExportDataSeriesContract = {
  name: string;
  values: number[];
  color?: string | null;
  axis?: "primary" | "secondary";
  role?: "bar" | "line";
};

export type ExportChartDataContract =
  | {
      type: "chart-bar" | "chart-stacked" | "chart-line";
      categories: string[];
      series: ExportDataSeriesContract[];
      axis?: {
        x?: ExportDataAxisContract;
        y?: ExportDataAxisContract;
      };
      colors?: string[];
      style?: Record<string, unknown>;
      stackMode?: "absolute" | "percent";
      totals?: number[];
      lineStyle?: Record<string, unknown>;
      markers?: boolean;
    }
  | {
      type: "chart-combo";
      categories: string[];
      barSeries: ExportDataSeriesContract[];
      lineSeries: ExportDataSeriesContract[];
      primaryAxis?: ExportDataAxisContract;
      secondaryAxis?: ExportDataAxisContract;
      colors?: string[];
      style?: Record<string, unknown>;
    }
  | {
      type: "chart-waterfall";
      steps: Array<{
        id?: string;
        label: string;
        value: number;
        kind?: "start" | "increase" | "decrease" | "subtotal" | "end";
        color?: string | null;
      }>;
      start?: number;
      end?: number;
      subtotalIds?: string[];
      axis?: {
        x?: ExportDataAxisContract;
        y?: ExportDataAxisContract;
      };
      colors?: string[];
      style?: Record<string, unknown>;
    }
  | {
      type: "chart-bubble";
      points: Array<{
        x: number;
        y: number;
        size: number;
        label: string;
        color?: string | null;
        group?: string | null;
      }>;
      xAxis?: ExportDataAxisContract;
      yAxis?: ExportDataAxisContract;
      sizeAxis?: ExportDataAxisContract;
      colors?: string[];
      style?: Record<string, unknown>;
    };

export type ExportMatrixDataContract = {
  type: "matrix";
  axes: {
    x: ExportDataAxisContract & { label: string };
    y: ExportDataAxisContract & { label: string };
  };
  quadrants?: Array<{
    id?: string;
    label: string;
    x: number;
    y: number;
    w: number;
    h: number;
    color?: string | null;
    textColor?: string | null;
  }>;
  items: Array<{
    id?: string;
    x: number;
    y: number;
    label: string;
    detail?: string;
    color?: string | null;
  }>;
  labels?: string[];
  callout?: {
    title: string;
    body?: string;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
  } | null;
  renderTarget: "editable-shapes";
};

export type ExportTableDataContract = {
  type: "table";
  columns: Array<{
    id?: string;
    label: string;
    type?: "text" | "number" | "date" | "percent" | "currency";
  }>;
  rows: string[][];
  cellRoles?: Record<string, string>;
  headerPolicy?: "first-row" | "none";
  nativeTableAllowed: true;
  sourceNote?: string;
};

export type ExportMissingDataContract = {
  type: "missing-data";
  expected: "native-chart" | "native-table" | "matrix";
  reason: string;
  requiredFields: string[];
};

export type ExportDataContract =
  | ExportChartDataContract
  | ExportMatrixDataContract
  | ExportTableDataContract
  | ExportMissingDataContract;

export type ExportObjectContract = {
  objectId: string;
  pageNumber: number;
  pageStory: string;
  primaryVisualObject: string;
  objectKind: ExportObjectKind;
  objectRole?: ExportObjectRole;
  dataContract: ExportDataContract | null;
  renderTarget: ExportRenderTarget;
  ownershipScope: ExportOwnershipScope;
  forbiddenInterpretation: string[];
};

export type PageLayoutArchetype =
  | "single-dominant-visual"
  | "hero-metric"
  | "chart-with-insight-rail"
  | "matrix-first"
  | "bubble-landscape"
  | "timeline-led"
  | "process-flow"
  | "swimlane"
  | "benchmark-table"
  | "decision-tree"
  | "layered-stack"
  | "market-map"
  | "portfolio-grid"
  | "capability-model"
  | "funnel"
  | "risk-heatmap"
  | "thesis-evidence-board"
  | "before-after"
  | "flywheel"
  | "operating-model"
  | "annotation-stage"
  | "evidence-wall"
  | "case-timeline"
  | "bridge-explanation";

export type PageVisualGrammar =
  | "consulting"
  | "equity-research"
  | "technical-system"
  | "product-strategy"
  | "operating-model"
  | "scientific-figure";

export type PageComposition =
  | "dominant-left-rail-right"
  | "dominant-right-rail-left"
  | "top-title-full-bleed-visual"
  | "center-canvas-annotation-ring"
  | "two-column-contrast"
  | "three-band-narrative"
  | "grid-with-hierarchy";

export type PageDensity = "sparse" | "executive" | "dense";

export type PageExportContract = {
  pageNumber: number;
  pageStory: string;
  primaryVisualObject: string;
  primaryObjectId?: string;
  layoutArchetype?: PageLayoutArchetype;
  visualGrammar?: PageVisualGrammar;
  composition?: PageComposition;
  density?: PageDensity;
  objects: ExportObjectContract[];
};

export type DeckExportContract = {
  version: 1;
  pages: PageExportContract[];
};

export type GeneratedHtmlReport = {
  title: string;
  html: string;
  pageCount: number;
  pageTitles: string[];
  htmlOutputMode?: HtmlOutputMode;
  animationStructure?: HtmlAnimationStructure;
  styleProfileId?: string;
  styleProfile?: GeneratedHtmlReportStyleProfile;
  structure?: HtmlEditableStructure;
  visualStructure?: HtmlVisualStructure;
  layoutStructure?: HtmlLayoutStructure;
  canvasOverrides?: GeneratedHtmlReportCanvasOverrides;
  exportContract?: DeckExportContract;
};

export type GeneratedDraftAsset = {
  version: GeneratedDraftVersion;
  templateId: TemplateId;
  provider: DraftProvider;
  mode: GeneratedDraftMode;
  model: string | null;
  signature: string;
  generatedAt: string;
  draft: SerializableWorkbenchDraft;
  htmlReport?: GeneratedHtmlReport;
};

export type WorkbenchProjectSnapshot = {
  version: ProjectSnapshotVersion;
  templateId: TemplateId;
  starterPackId: StarterPackId | null;
  starterThemeId: string | null;
  starterBindings: Record<string, StarterPackId>;
  starterApplicationMode: StarterApplicationMode;
  htmlOutputMode: HtmlOutputMode;
  projectName: string;
  sourceText: string;
  generationMode: WorkbenchGenerationMode;
  moduleUsageMode: WorkbenchModuleUsageMode;
  requestedPageCount: number | null;
  exportContract?: DeckExportContract;
  longFormClarification: WorkbenchLongFormClarificationState;
  deckOptimization: WorkbenchDeckOptimizationState;
  pages: LayoutPage[];
  workflowStage: WorkflowStage;
  generatedDraft: GeneratedDraftAsset | null;
  capturedAt: string;
};

export type GenerationHistoryEntry = {
  id: string;
  version: GenerationHistoryVersion;
  mode: GeneratedDraftMode;
  provider: DraftProvider;
  model: string | null;
  signature: string;
  createdAt: string;
  snapshot: WorkbenchProjectSnapshot;
};

export type PublishSnapshot = {
  id: string;
  version: PublishSnapshotVersion;
  format: PublishSnapshotFormat;
  signature: string;
  createdAt: string;
  publishedUrl: string | null;
  snapshot: WorkbenchProjectSnapshot;
};

export type CompositionPublishArtifact = {
  id: string;
  version: number;
  moduleId: ModuleTemplateId;
  skillIds: SkillDefinitionId[];
  presetId: ModuleSkillPresetId | null;
  publishedScope: ModuleRegistryScope;
  publishedStatus: Exclude<SkillRegistryStatus, "draft">;
  basedOnTestRunIds: string[];
  versionNote: string;
  publishedAt: string;
  publishedBy: string;
};

export type DeckTemplatePackId = string;
export type PackPublishResult = "published" | "warning" | "blocked";
export type ImportedSourceObjectKind =
  | "text"
  | "shape"
  | "line"
  | "image"
  | "chart"
  | "unsupported";
export type ImportedSourceShapeKind = "rectangle" | "ellipse";
export type ImportedSourceProvenance = {
  slideRelId?: string;
  slideObjectId?: string;
  sourceName?: string;
  sourcePath?: string;
};
export type ImportedSourceAssetRef = {
  assetId: string;
  mimeType: string;
  size: number;
  alt?: string;
};
export type ImportedSourceChartSeries = {
  name?: string;
  values: number[];
  color?: string;
};
export type ImportedSourceObjectBase = {
  id: string;
  kind: ImportedSourceObjectKind;
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  rotation?: number;
  opacity?: number;
  provenance?: ImportedSourceProvenance;
};
export type ImportedTextSourceObject = ImportedSourceObjectBase & {
  kind: "text";
  text: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  italic?: boolean;
  align?: "left" | "center" | "right";
  color?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
};
export type ImportedShapeSourceObject = ImportedSourceObjectBase & {
  kind: "shape";
  shape: ImportedSourceShapeKind;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
};
export type ImportedLineSourceObject = ImportedSourceObjectBase & {
  kind: "line";
  stroke?: string;
  strokeWidth?: number;
};
export type ImportedImageSourceObject = ImportedSourceObjectBase & {
  kind: "image";
  asset: ImportedSourceAssetRef;
  fit?: "cover" | "contain";
};
export type ImportedChartSourceObject = ImportedSourceObjectBase & {
  kind: "chart";
  chartKind?: ModuleChartKind;
  title?: string;
  categories: string[];
  series: ImportedSourceChartSeries[];
};
export type ImportedUnsupportedSourceObject = ImportedSourceObjectBase & {
  kind: "unsupported";
  label: string;
  reason: string;
};
export type ImportedSourceObject =
  | ImportedTextSourceObject
  | ImportedShapeSourceObject
  | ImportedLineSourceObject
  | ImportedImageSourceObject
  | ImportedChartSourceObject
  | ImportedUnsupportedSourceObject;
export type PackSemanticSlotKind = "ai-text" | "chart";
export type PackSemanticSlotRole =
  | "page-title"
  | "body"
  | "support"
  | "caption"
  | "chart"
  | "metric";
export type PackSemanticSlot = {
  id: string;
  kind: PackSemanticSlotKind;
  label: string;
  role: PackSemanticSlotRole;
  sourceObjectIds: string[];
  required: boolean;
  canHide: boolean;
  notes?: string;
};
export type PackSemanticDecoration = {
  id: string;
  label: string;
  kind: "locked-text" | "shape" | "line" | "image" | "chart";
  sourceObjectIds: string[];
  locked: boolean;
};
export type PackImportWarning = {
  id: string;
  severity: "warning" | "blocking";
  message: string;
  sourceObjectIds: string[];
};
export type DeckTemplatePackPageRole =
  | "cover"
  | "section"
  | "content"
  | "chart"
  | "closing";
export type DeckTemplatePackPage = {
  id: string;
  pageNumber: number;
  title: string;
  background: string;
  sourceObjects: ImportedSourceObject[];
  semanticSlots: PackSemanticSlot[];
  semanticDecorations: PackSemanticDecoration[];
  unresolvedObjectIds: string[];
  warnings: PackImportWarning[];
  pageRole: DeckTemplatePackPageRole;
  reusablePattern: string;
  briefHint: string;
  editableRule: "semantic-only" | "mixed";
};
export type PackPublishArtifact = {
  id: string;
  version: number;
  packId: DeckTemplatePackId;
  versionNote: string;
  result: PackPublishResult;
  pageCount: number;
  blockingIssueCount: number;
  warningCount: number;
  publishedAt: string;
  publishedBy: string;
};
export type DeckTemplatePack = {
  id: DeckTemplatePackId;
  label: string;
  sourceFileName: string;
  pageWidth: number;
  pageHeight: number;
  pages: DeckTemplatePackPage[];
  publishArtifacts: PackPublishArtifact[];
  createdAt: string;
  updatedAt: string;
};

export type ModuleAssetRecord = {
  moduleId: ModuleTemplateId;
  entry: ModuleRegistryEntry;
  testCases: CompositionTestCase[];
  testRuns: CompositionTestRun[];
  publishArtifacts: CompositionPublishArtifact[];
  publishedManifest: PublishedModuleManifest | null;
  updatedAt: string;
};

export type ModuleTrustSummary = {
  moduleId: ModuleTemplateId;
  totalTestCases: number;
  totalTestRuns: number;
  passRuns: number;
  warnRuns: number;
  failRuns: number;
  latestRunAt: string | null;
  latestRunResult: CompositionTestResult | null;
  publishArtifacts: number;
  hasPassingEvidence: boolean;
};

export type WorkbenchDraft = {
  title: string;
  subtitle: string;
  pageDrafts: Map<string, PageDraft>;
  provider: DraftProvider;
};

export type DragState = {
  pageId: string;
  blockId: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  initialX: number;
  initialY: number;
  initialW: number;
  initialH: number;
  canvasWidth: number;
  canvasHeight: number;
};

export type WorkbenchProject = {
  id: string;
  version: number;
  templateId: TemplateId;
  starterPackId: StarterPackId | null;
  starterThemeId: string | null;
  starterBindings: Record<string, StarterPackId>;
  starterApplicationMode: StarterApplicationMode;
  htmlOutputMode: HtmlOutputMode;
  projectName: string;
  sourceText: string;
  generationMode: WorkbenchGenerationMode;
  moduleUsageMode: WorkbenchModuleUsageMode;
  requestedPageCount: number | null;
  exportContract?: DeckExportContract;
  longFormClarification: WorkbenchLongFormClarificationState;
  deckOptimization: WorkbenchDeckOptimizationState;
  briefMessages: ConversationMessage[];
  pages: LayoutPage[];
  generatedDraft: GeneratedDraftAsset | null;
  generationHistory: GenerationHistoryEntry[];
  publishSnapshots: PublishSnapshot[];
  workflowStage: WorkflowStage;
  updatedAt: string;
  exportedAt: string;
};

export type WorkbenchProjectSummary = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  templateId: TemplateId;
  starterPackId: StarterPackId | null;
  starterThemeId?: string | null;
  projectName: string;
  updatedAt: string;
  chatUpdatedAt: string;
  pageCount: number;
  workflowStage: WorkflowStage;
  hasHtmlReport: boolean;
  hasGeneratedDeck: boolean;
  hasConversation: boolean;
  chatLabel: string;
  coverTitle: string;
  coverSubtitle: string;
  generationCount: number;
  publishCount: number;
};

export type WorkbenchWorkspace = {
  id: string;
  version: number;
  name: string;
  projects: WorkbenchProject[];
  activeProjectId: string;
  createdAt: string;
  updatedAt: string;
  exportedAt: string;
};

export type WorkbenchWorkspaceSummary = {
  id: string;
  name: string;
  projectCount: number;
  updatedAt: string;
};

export type TemplatePlanKey =
  | "metrics"
  | "ranking"
  | "cards"
  | "flowSteps"
  | "timeline"
  | "roadmap"
  | "phases";

export type TemplateModuleMapping = Record<
  BlockKind,
  {
    planKey: TemplatePlanKey;
    role: string;
    fallbackPrefix: string;
  }
>;

export type TemplateMetadata = {
  id: TemplateId;
  name: string;
  description: string;
  industry: string;
};

export type StarterPackPreview = {
  eyebrow: string;
  title: string;
  body: string;
  tone: "light" | "dark";
};

export type StarterPageContract = {
  preferredVisualOperator: string;
  dominantGeometry: string;
  allowedSecondaryZones: string[];
  copyDensityBudget: string;
  noGoPatterns: string[];
};

export type StarterPackTheme = {
  id: string;
  source: StarterPackSource;
  label: string;
  description: string;
  vendoredPath: string;
};

export type StarterPackLayout = {
  id: StarterPackId;
  source: StarterPackSource;
  kind: "layout";
  usageModes: StarterPackUsageMode[];
  mappingStatus: StarterPackMappingStatus;
  label: string;
  description: string;
  themeId: string;
  pageFamily: string;
  vendoredPath: string;
  visualRules: string[];
  suggestedLayoutFamilies: string[];
  pageContract?: StarterPageContract;
  preview: StarterPackPreview;
};

export type StarterPackDeck = {
  id: StarterPackId;
  source: StarterPackSource;
  kind: "deck";
  usageModes: StarterPackUsageMode[];
  mappingStatus: StarterPackMappingStatus;
  label: string;
  description: string;
  themeId: string;
  pageFamily: string;
  vendoredPath: string;
  pageCount: number;
  pageTitles: string[];
  pageArchetypes?: string[];
  visualRules: string[];
  suggestedLayoutFamilies: string[];
  preview: StarterPackPreview;
};

export type StarterPackManifest = {
  id: StarterPackId;
  source: StarterPackSource;
  kind: StarterPackKind;
  usageModes: StarterPackUsageMode[];
  mappingStatus: StarterPackMappingStatus;
  label: string;
  description: string;
  themeId: string;
  pageFamily: string;
  vendoredPath: string;
  readOnly: true;
  visualRules: string[];
  suggestedLayoutFamilies: string[];
  pageContract?: StarterPageContract;
  preview: StarterPackPreview;
  pageCount?: number;
  pageTitles?: string[];
  pageArchetypes?: string[];
};

export type WorkbenchTemplate = {
  id: TemplateId;
  meta: TemplateMetadata;
  defaultProjectName: string;
  defaultSourceText: string;
  defaultPages: LayoutPage[];
  starterPageSummaries: Record<string, string>;
  starterBlockDrafts: Record<string, BlockDraft>;
  blockAliases: Record<string, string[]>;
  moduleMapping: TemplateModuleMapping;
};
