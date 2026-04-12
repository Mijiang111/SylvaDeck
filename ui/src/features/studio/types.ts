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
  dataTable?: {
    raw: string;
    hasHeader: boolean;
    columns: Array<{
      id: string;
      label: string;
      type: ModuleDataColumnType;
    }>;
    rows: string[][];
  };
  chartSpec?: {
    kind: ModuleChartKind;
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
  | "line";

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
export type SlideSceneObjectKind = Exclude<ModuleCanvasObjectKind, "slot">;

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
  | "chart-frame";

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

export type HtmlVisualNode = {
  id: string;
  kind: HtmlVisualNodeKind;
  pageNumber: number;
  sourceTag: string;
  sourceIndex: number;
  moduleId?: ModuleTemplateId;
  moduleLabel?: string;
  style: HtmlVisualNodeStyle;
};

export type HtmlVisualPage = {
  pageNumber: number;
  nodes: HtmlVisualNode[];
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

export type HtmlCanvasTransform = {
  mode: "flow" | "freeform";
  frame: HtmlCanvasFrame;
  fontSize?: number;
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

export type GeneratedHtmlReport = {
  title: string;
  html: string;
  pageCount: number;
  pageTitles: string[];
  styleProfileId?: string;
  styleProfile?: GeneratedHtmlReportStyleProfile;
  structure?: HtmlEditableStructure;
  visualStructure?: HtmlVisualStructure;
  layoutStructure?: HtmlLayoutStructure;
  canvasOverrides?: GeneratedHtmlReportCanvasOverrides;
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
  projectName: string;
  sourceText: string;
  generationMode: WorkbenchGenerationMode;
  moduleUsageMode: WorkbenchModuleUsageMode;
  requestedPageCount: number | null;
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
  projectName: string;
  sourceText: string;
  generationMode: WorkbenchGenerationMode;
  moduleUsageMode: WorkbenchModuleUsageMode;
  requestedPageCount: number | null;
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
