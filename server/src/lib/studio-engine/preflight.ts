import type {
  DeckExportContract,
  ExportDataContract,
  ExportObjectContract,
  ExportObjectKind,
  ExportRenderTarget,
  FreeformLayoutPlan,
  HeroModelIntent,
  PageComposition,
  PageDensity,
  PageExportContract,
  PageLayoutArchetype,
  PageVisualGrammar,
  SegmentedThinkingInputs,
  StudioBriefSynthesis,
  StudioCapabilityActivation,
  StudioCapabilityCard,
  StudioEvidenceRegime,
  StudioEvidenceTier,
  StudioPageMission,
  StudioPreflightPlan,
  StudioSemanticWarning,
  StudioTaskRoute,
  StudioTaskRouteCapabilities,
  StudioTaskRoutePageBlueprint,
  StudioTaskRoutePrimaryKind,
  StudioVisualThinking,
  StudioWorkingMemory,
} from "./contracts.js";
import {
  clampText,
  compactBoardTitle,
  normalizeStudioText,
  splitBriefLines,
  splitBriefSentences,
  stripInstructionalLead,
  uniqueStrings,
} from "./brief.js";
import { buildStudioWorkingMemory } from "./working-memory.js";
import { extractRequestedDeckPageCount } from "./page-count.js";
import { deckExportContractSchema } from "./schemas.js";

function detectRequestedPageCount(brief: string, requestedPageCount?: number | null) {
  return extractRequestedDeckPageCount(brief, requestedPageCount) ?? 1;
}

function resolveRequestedPageCountForExportContract(args: {
  requestedPageCount?: number | null;
  exportContract?: DeckExportContract | null;
}) {
  return args.requestedPageCount ?? args.exportContract?.pages.length ?? null;
}

function createEmptySourceWeightProfile(brief: string) {
  return {
    taskIntentChars: brief.length,
    sourceMaterialChars: 0,
    globalHintsChars: 0,
    sourceMaterialBlockCount: 0,
    sourceDominant: false,
  };
}

export function createRawBriefThinkingInputs(brief: string): SegmentedThinkingInputs {
  return {
    taskIntentText: brief,
    sourceMaterialText: "",
    globalHintsText: "",
    sourceWeightProfile: createEmptySourceWeightProfile(brief),
  };
}

function hasExplicitThreeDimensionalRequest(brief: string) {
  return (
    /\b(?:3d|three-dimensional|pseudo-3d|hero model|cutaway|exploded view|exploded)\b/i.test(brief) ||
    /(?:三维|立体|剖面|爆炸图|拆解图|芯片结构图|架构示意图|系统结构图)/.test(brief)
  );
}

function hasExplicitChartRequest(brief: string) {
  return /\b(?:chart|graph|bar chart|line chart|waterfall chart|combo chart|bubble chart|stacked (?:bar|column )?chart)\b/i.test(
    brief,
  ) || /(?:矩阵|矩陣|四象限|波士顿矩阵|波士頓矩陣|BCG矩阵|BCG矩陣|二维矩阵|二維矩陣)/i.test(brief);
}

function hasProcessFlowRequest(brief: string) {
  return (
    /\b(?:flowchart|process\s+flow|swimlane|workflow|lane headers?|phase bands?|connectors?|decision diamonds?)\b/i.test(
      brief,
    ) || /(?:流程图|流程圖|泳道|阶段|階段|车道|泳道图|泳道圖|连接线|連接線|决策节点|決策節點)/i.test(brief)
  );
}

function countSourceEvidenceSignals(brief: string) {
  const matches = brief.match(
    /(?:observed facts?|source-backed|research note|equity strategy|pdf|report|analysis|revenue|margin|profit|market share|valuation|FY\d{2,4}|20\d{2}|Q[1-4]|%|\$|RMB|USD|HKD|研报|研報|报告|報告|分析|财报|財報|收入|利润|利潤|毛利率|市场份额|市場份額|同比|环比|環比|亿元|億)/gi,
  );
  return matches?.length ?? 0;
}

function hasSourceBackedAnalysisCue(brief: string) {
  const evidenceSignals = countSourceEvidenceSignals(brief);
  return (
    evidenceSignals >= 3 ||
    /(?:observed facts?|source-backed|research note|equity strategy|pdf|研报|研報|财报|財報|腾讯|騰訊|Tencent)/i.test(
      brief,
    )
  );
}

function hasClearSubjectCue(brief: string) {
  return (
    /\b(?:about|on|for|of)\s+[\p{L}\p{N}][\s\S]{2,}/iu.test(brief) ||
    /(?:关于|關於|介绍|介紹|分析|讲|講|围绕|圍繞|针对|針對|把|將|将).{2,}/i.test(brief)
  );
}

function isAmbiguousBriefRequest(brief: string) {
  const normalized = normalizeStudioText(brief).toLowerCase();
  if (!normalized) {
    return true;
  }
  if (hasClearSubjectCue(brief)) {
    return false;
  }

  const contentRemainder = normalized
    .replace(
      /\b(?:make|create|generate|build|prepare|design|a|an|the|ppt|powerpoint|presentation|deck|slides?|nice|good|great|premium|beautiful|professional|simple|high-end|polished)\b/gi,
      " ",
    )
    .replace(/(?:做|做个|做一份|生成|制作|製作|帮我|幫我|一个|一份|PPT|ppt|演示|簡報|简报|好看|高级|高級|专业|專業|漂亮|简单|簡單)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length <= 100 && contentRemainder.length <= 12;
}

const CHINESE_PAGE_NUMBER_TOKEN_PATTERN = /[一二两三四五六七八九十]{1,3}/;
const EXPLICIT_PAGE_MARKER_PATTERN = new RegExp(
  `\\b(?:page|slide)\\s*(\\d{1,2})\\b|第\\s*(\\d{1,2}|${CHINESE_PAGE_NUMBER_TOKEN_PATTERN.source})\\s*(?:页|頁|张|張)`,
  "gi",
);
const MATRIX_STRUCTURE_CUE_PATTERN =
  /(?:\bbcg\b|\bbcg matrix\b|\bmatrix\b|波士顿矩阵|波士頓矩陣|矩阵|矩陣)/i;
const QUADRANT_STRUCTURE_CUE_PATTERN =
  /(?:\bquadrant\b|\b2x2\b|\b2 x 2\b|四象限)/i;
const CHART_STRUCTURE_CUE_PATTERN =
  /(?:\bchart\b|\bgraph\b|\bbar chart\b|\bline chart\b|\bwaterfall chart\b|\bcombo chart\b|\bbubble chart\b|\bstacked (?:bar|column )?chart\b)/i;
const MATRIX_AXIS_SIGNAL_PATTERN =
  /\b(?:2x2|2 x 2|x[-\s]*axis|y[-\s]*axis|axes?|quadrants?|bcg)\b|(?:四象限|横轴|橫軸|纵轴|縱軸|象限|以.{2,80}为轴|以.{2,80}為軸)/i;
const COMPARISON_GRID_SIGNAL_PATTERN =
  /\b(?:comparison\s+grid|compare\s+across|4[-\s]?column|four[-\s]?column|engine\s+comparison|business\s+engine|engine\s+grid|side[-\s]?by[-\s]?side|columns?)\b|(?:四列|4列|四栏|四欄|对比网格|比較網格|比较网格|业务引擎|業務引擎|并列比较|並列比較)/i;
const BUSINESS_AI_CONTEXT_PATTERN =
  /\b(?:business|business\s+model|commercial|moneti[sz]ation|finance|financial|equity|investment|investor|valuation|revenue|margin|growth|cagr|ads?|advertising|games?|cloud\s+(?:revenue|growth|business)|platform\s+(?:case|strategy|business|moat|economics)|moat|tencent|tesla|consulting|strategy)\b|(?:商业|商業|业务|業務|收入|广告|廣告|游戏|遊戲|金融|投资|投資|估值|增长|增長|平台逻辑|平台邏輯|护城河|護城河|腾讯|騰訊|特斯拉)/i;
const SCIENTIFIC_VISUAL_INTENT_PATTERN =
  /\b(?:scientific\s+(?:figure|diagram|visual)|research\s+paper|lab\s+(?:result|experiment)|neural\s+network\s+experiment|experiment|methodology|molecular|cellular|protein|clinical\s+trial)\b|(?:科学图|科學圖|科研图|科研圖|论文图|論文圖|实验|實驗|神经网络实验|神經網絡實驗)/i;
const TECHNICAL_SYSTEM_INTENT_PATTERN =
  /\b(?:technical\s+system|technical\s+architecture|system\s+architecture|cloud\s+architecture|infrastructure\s+architecture|architecture\s+diagram|system\s+diagram|component\s+diagram|network\s+topology|api\s+gateway|database\s+schema|kubernetes)\b|(?:技术架构|技術架構|系统架构|系統架構|架构图|架構圖|系统图|系統圖|组件图|組件圖|网络拓扑|網絡拓撲)/i;
const DECK_SCOPED_PAGE_MISSION_PATTERN =
  /\b(?:deck|slides?|presentation|storyboard|flow|overall|two-page|three-page|request understanding|presentation intent|slide\s*1|slide\s*2|page\s*1|page\s*2|first\b.*second\b)\b/i;
const CHINESE_DECK_SCOPED_PAGE_MISSION_PATTERN =
  /(?:整份|整个|整個|两页|兩頁|三页|三頁|第一页.*第二页|先.*再|演示流程|汇报流程|簡報流程|presentation flow|request understanding)/i;
const PAGE_ROLE_TITLE_PATTERNS: Array<{
  pattern: RegExp;
  title: string;
}> = [
  { pattern: /\b(?:worth doing|why this is worth doing|why it matters)\b/i, title: "Why This Is Worth Doing" },
  { pattern: /(?:值得做|为什么值得做|為什麼值得做)/i, title: "Why This Is Worth Doing" },
  { pattern: /\b(?:architecture|switching architecture|provider switching)\b/i, title: "Provider Switching Architecture" },
  { pattern: /(?:架构|架構|切换架构|切換架構)/i, title: "Provider Switching Architecture" },
  { pattern: /\b(?:use cases?|fit by use case|scenarios?)\b/i, title: "Provider Fit by Use Case" },
  { pattern: /(?:适用场景|適用場景|场景|場景)/i, title: "Provider Fit by Use Case" },
  { pattern: /\b(?:data needed|required data)\b/i, title: "Data Needed" },
  { pattern: /(?:所需字段|所需欄位|需要哪些数据|需要哪些數據|数据需求|數據需求)/i, title: "Data Needed" },
  { pattern: /\b(?:risk|risks|rollback)\b/i, title: "Migration Risks and Rollback" },
  { pattern: /(?:风险|風險|回滚|回滾)/i, title: "Migration Risks and Rollback" },
  { pattern: /\b(?:next week|execution plan|next-step|next steps)\b/i, title: "Next-Week Execution Plan" },
  { pattern: /(?:下周执行计划|下週執行計劃|执行计划|執行計劃|下一步)/i, title: "Next-Week Execution Plan" },
];

function parsePageReferenceToken(value: string | null | undefined) {
  const normalized = normalizeStudioText(value ?? "").toLowerCase();
  if (!normalized) {
    return null;
  }

  const numericValue = Number.parseInt(normalized, 10);
  if (Number.isInteger(numericValue) && numericValue >= 1 && numericValue <= 12) {
    return numericValue;
  }

  switch (normalized) {
    case "一":
      return 1;
    case "二":
    case "两":
      return 2;
    case "三":
      return 3;
    case "四":
      return 4;
    case "五":
      return 5;
    case "六":
      return 6;
    case "七":
      return 7;
    case "八":
      return 8;
    case "九":
      return 9;
    case "十":
      return 10;
    case "十一":
      return 11;
    case "十二":
      return 12;
    default:
      return null;
  }
}

function normalizeMissionScope(
  value: string | null | undefined,
  combinedText: string,
): StudioPageMission["missionScope"] {
  const normalized = normalizeStudioText(value ?? "").toLowerCase();
  if (normalized === "page") {
    return "page";
  }
  if (normalized === "deck") {
    return "deck";
  }

  return DECK_SCOPED_PAGE_MISSION_PATTERN.test(combinedText) ||
    CHINESE_DECK_SCOPED_PAGE_MISSION_PATTERN.test(combinedText)
    ? "deck"
    : "page";
}

function hasTrueMatrixSignal(text: string) {
  const normalized = normalizeStudioText(text);
  return MATRIX_AXIS_SIGNAL_PATTERN.test(normalized);
}

function hasComparisonGridSignal(text: string) {
  const normalized = normalizeStudioText(text);
  return COMPARISON_GRID_SIGNAL_PATTERN.test(normalized);
}

function hasBusinessAiContext(text: string) {
  const normalized = normalizeStudioText(text);
  return BUSINESS_AI_CONTEXT_PATTERN.test(normalized);
}

function hasExplicitScientificVisualIntent(text: string) {
  const normalized = normalizeStudioText(text);
  return SCIENTIFIC_VISUAL_INTENT_PATTERN.test(normalized);
}

function hasExplicitTechnicalSystemIntent(text: string) {
  const normalized = normalizeStudioText(text);
  return TECHNICAL_SYSTEM_INTENT_PATTERN.test(normalized);
}

function normalizeStructureCue(
  value: string | null | undefined,
  combinedText: string,
): StudioPageMission["structureCue"] {
  const normalized = normalizeStudioText(value ?? "").toLowerCase();
  if (hasComparisonGridSignal(combinedText) && !hasTrueMatrixSignal(combinedText)) {
    return null;
  }
  if (normalized.includes("quadrant")) {
    return "quadrant";
  }
  if (normalized.includes("matrix") || normalized.includes("bcg")) {
    return "matrix";
  }
  if (normalized.includes("chart")) {
    return "chart";
  }

  if (hasComparisonGridSignal(combinedText) && !hasTrueMatrixSignal(combinedText)) {
    return null;
  }
  if (QUADRANT_STRUCTURE_CUE_PATTERN.test(combinedText)) {
    return "quadrant";
  }
  if (MATRIX_STRUCTURE_CUE_PATTERN.test(combinedText)) {
    return "matrix";
  }
  if (CHART_STRUCTURE_CUE_PATTERN.test(combinedText)) {
    return "chart";
  }
  return null;
}

function buildPreferredVisualFromStructureCue(
  cue: StudioPageMission["structureCue"],
): string | null {
  switch (cue) {
    case "matrix":
      return "matrix-first 2x2 quadrant frame";
    case "quadrant":
      return "quadrant-first 2x2 frame";
    case "chart":
      return "chart-first evidence view";
    default:
      return null;
  }
}

function inferEvidenceTierFromWorkingMemory(memory: StudioWorkingMemory): StudioEvidenceTier {
  switch (memory.evidenceRegime) {
    case "source-backed":
    case "mixed-inline-evidence":
      return "source-backed";
    case "sparse-no-hard-data":
      return "axiomatic/common-knowledge";
    default:
      return "explicit assumption";
  }
}

export function mapEvidenceTierToEvidenceRegime(tier: StudioEvidenceTier): StudioEvidenceRegime {
  switch (tier) {
    case "source-backed":
      return "source-backed";
    case "axiomatic/common-knowledge":
      return "sparse-no-hard-data";
    case "explicit assumption":
      return "unknown";
    default:
      return "unknown";
  }
}

function deriveCoreTaskFromMemory(memory: StudioWorkingMemory) {
  switch (memory.userOperation) {
    case "value":
      return `Produce a disciplined valuation view of ${memory.primaryObject}.`;
    case "compare":
      return `Compare ${memory.primaryObject} and land one clear verdict.`;
    case "critique":
      return `Review ${memory.primaryObject} and surface the key judgment.`;
    case "narrate":
      return `Tell the case story of ${memory.primaryObject} with one clear through-line.`;
    case "synthesize":
      return `Synthesize the key finding on ${memory.primaryObject}.`;
    case "explain":
      return `Explain ${memory.primaryObject} clearly in presentation form.`;
    default:
      return `Understand what matters about ${memory.primaryObject}.`;
  }
}

function sanitizeDeterministicSubject(value: string, brief: string) {
  const cleaned = normalizeStudioText(value)
    .replace(/\bfor\s+(?:a|an|the)$/i, "")
    .replace(/\bto\s+(?:do|make|create|build|prepare)$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || compactBoardTitle(brief, "Core subject", 6);
}

function resolveAmbiguousBriefSubject(value: string, brief: string) {
  const candidate = sanitizeDeterministicSubject(value, brief);
  if (
    !candidate ||
    /^(?:ppt|powerpoint|presentation|deck|slides?|演示|簡報|简报|core subject)$/i.test(candidate)
  ) {
    return "the requested topic";
  }
  return candidate;
}

function buildDeterministicVisualThinking(args: {
  memory: StudioWorkingMemory;
  route: StudioTaskRoute;
}): StudioVisualThinking {
  if (args.route.primaryKind === "ambiguous-brief") {
    return {
      dominantVisualAnchor: "one conservative story frame for a sparse request",
      readingPath: "plain title -> assumption-labeled story frame -> simple support -> next step",
      regionStrategy: "use a simple thesis canvas or three-part structure rather than pretending there is source evidence",
      densityPosture: "light, explicit, and assumption-aware",
      avoidPattern: "fake data, fake case facts, over-specific charts, or ornate design that hides missing intent",
    };
  }
  if (args.route.primaryKind === "process-flow") {
    return {
      dominantVisualAnchor: "one structured flow or swimlane map",
      readingPath: "phase or lane headers -> ordered nodes -> connector logic -> short implication",
      regionStrategy: "let the process diagram own the main field with only compact annotations outside it",
      densityPosture: "diagram-first, label-disciplined, and connector-light",
      avoidPattern: "card wall, generic roadmap, or prose summary that replaces the flow itself",
    };
  }
  if (args.route.primaryKind === "chart-matrix-figure") {
    return {
      dominantVisualAnchor: "one dominant analytical chart, matrix, or figure",
      readingPath: "headline claim -> figure frame -> annotation -> takeaway",
      regionStrategy: "figure-first composition with one compact explanation zone",
      densityPosture: "evidence-led, compact, and readable",
      avoidPattern: "equal-weight dashboard tiles or decorative chart-like shapes without a clear argument",
    };
  }
  if (args.route.primaryKind === "visual-hero-3d") {
    return {
      dominantVisualAnchor: "one explicit pseudo-3D hero object",
      readingPath: "object first -> anchored labels -> concise explanation",
      regionStrategy: "hero object owns the page while text stays peripheral",
      densityPosture: "object-heavy, sparse, and annotation-friendly",
      avoidPattern: "flat cards, dashboard tiles, glass panels, or generic left-right explainers",
    };
  }
  if (args.route.primaryKind === "source-backed-analysis") {
    return {
      dominantVisualAnchor: "one evidence-backed analytical proof field",
      readingPath: "claim -> source fact -> implication",
      regionStrategy: "use source evidence as the main surface and keep interpretation compact",
      densityPosture: "analytical, concise, and citation-disciplined",
      avoidPattern: "unsupported market claims, fake precision, or decorative summary cards",
    };
  }
  if (args.route.primaryKind === "explicit-page-blueprint") {
    return {
      dominantVisualAnchor: "the page-specific visual object named by the blueprint",
      readingPath: "page title -> one claim -> named visual -> short support",
      regionStrategy: "each page follows its own blueprint and avoids repeating deck-level scaffolding",
      densityPosture: "page-scoped, concise, and one-visual-thesis per page",
      avoidPattern: "request-understanding pages, repeated generic openers, or ignoring the page blueprint",
    };
  }

  const memory = args.memory;
  switch (memory.userOperation) {
    case "value":
      return {
        dominantVisualAnchor: "one disciplined proof board anchored by the valuation lens",
        readingPath: "headline claim -> core frame -> two short drivers -> disciplined conclusion",
        regionStrategy: "one dominant proof field with at most one compact secondary support zone",
        densityPosture: "restrained, finance-grade, no filler cards",
        avoidPattern: "default left/right split, decorative chips, broad company-overview filler",
      };
    case "compare":
      return {
        dominantVisualAnchor: "one dominant comparison field",
        readingPath: "verdict -> comparison logic -> compact support evidence",
        regionStrategy: "one primary comparison surface with one compact annotation cluster",
        densityPosture: "tight and legible",
        avoidPattern: "equal-weight dashboard cards and overbuilt side rails",
      };
    case "narrate":
      return {
        dominantVisualAnchor: "one story field that frames the case immediately",
        readingPath: "context -> challenge -> intervention or outcome",
        regionStrategy: "one dominant narrative region with one small support region",
        densityPosture: "editorial and light",
        avoidPattern: "generic strategy memo framing and repetitive left/right rails",
      };
    case "critique":
      return {
        dominantVisualAnchor: "one system judgment surface",
        readingPath: "core judgment -> constraint or bottleneck -> trade-off",
        regionStrategy: "one dominant technical field with compact callouts",
        densityPosture: "precise and uncluttered",
        avoidPattern: "broad generic openers and decorative card walls",
      };
    case "synthesize":
      return {
        dominantVisualAnchor: "one result or interpretation surface",
        readingPath: "question -> result -> interpretation",
        regionStrategy: "one dominant result field with one compact support strip",
        densityPosture: "research-light, annotation-friendly",
        avoidPattern: "board-language framing and same-weight card walls",
      };
    default:
      return {
        dominantVisualAnchor: "one dominant thesis field",
        readingPath: "headline -> one proof pattern -> short close",
        regionStrategy: "one main region plus at most one small support region",
        densityPosture: "restrained and spacious",
        avoidPattern: "default left/right split and filler panels",
      };
  }
}

function buildRouteCapabilityActivations(route: StudioTaskRoute): StudioCapabilityActivation[] {
  return [
    {
      kind: "style",
      reason: "Every page still needs a coherent professional visual system.",
      lines: ["Use a coherent, presentation-grade visual language with strong hierarchy and intentional spacing."],
    },
    ...(route.capabilities.threeD
      ? [
          {
            kind: "3d" as const,
            reason: "The task route detected an explicit 3D request.",
            lines: [
              "Treat the page as one fabricated 3D hero object, not a flat UI composition.",
              "Show perspective, visible thickness, overlap or occlusion, and cutaway or exploded layer logic.",
              "Let the object dominate the page and keep copy peripheral.",
              "Do not resolve as floating cards, glass panels, dashboard tiles, or shallow neumorphic surfaces.",
            ],
          },
        ]
      : []),
    ...(route.capabilities.chart || route.capabilities.matrix
      ? [
          {
            kind: "chart" as const,
            reason: route.capabilities.matrix
              ? "The task route detected an explicit matrix or quadrant request."
              : "The task route detected an explicit chart or figure request.",
            lines: ["Use a chart only when the page has real quantitative evidence or a clearly labeled assumption frame."],
          },
        ]
      : []),
    ...(route.capabilities.freeformLayout
      ? [
          {
            kind: "freeform-layout" as const,
            reason: "The task route requires content-led page composition.",
            lines: ["Choose a composition from the page mission instead of defaulting to a left/right split."],
          },
        ]
      : []),
  ];
}

function buildDeterministicPageMissions(args: {
  brief: string;
  memory: StudioWorkingMemory;
  pageCount: number;
  evidenceTier: StudioEvidenceTier;
}) {
  const subject = args.memory.primaryObject;
  const deckStructureCue = normalizeStructureCue(undefined, args.brief);
  if (args.pageCount <= 1) {
    return [
      {
        pageNumber: 1,
        title: compactBoardTitle(subject, subject || "Core subject", 6),
        mission: deriveCoreTaskFromMemory(args.memory),
        headlineClaim:
          args.memory.userOperation === "value"
            ? `${subject} should be framed through one clear valuation lens, not a generic overview.`
            : args.memory.userOperation === "critique"
              ? `${subject} should be judged through one core architectural or system constraint.`
              : args.memory.userOperation === "narrate"
                ? `${subject} works best as one focused case story instead of a broad survey.`
                : `${subject} should be expressed as one clear point on one page.`,
        supportPoints:
          args.memory.userOperation === "value"
            ? [
                "Use at most two qualitative drivers or scenario boundaries.",
                "Keep the conclusion disciplined when hard data is absent.",
              ]
            : [
                "Use at most two supporting points.",
                "Keep all secondary content clearly subordinate.",
              ],
        evidenceNotes:
          args.evidenceTier === "source-backed"
            ? ["Use only evidence the brief actually supplies."]
            : ["Use qualitative framing or explicit assumptions instead of fake hard evidence."],
        preferredVisual:
          buildPreferredVisualFromStructureCue(deckStructureCue) ??
          (args.memory.userOperation === "value"
            ? "single-proof-canvas"
            : args.memory.userOperation === "critique"
              ? "annotation-stage"
              : args.memory.userOperation === "narrate"
                ? "vertical-story-strip"
                : "poster-claim"),
        missionScope: "page",
        structureCue: deckStructureCue,
      },
    ] satisfies StudioPageMission[];
  }

  const pageMissions: StudioPageMission[] = [];
  pageMissions.push({
    pageNumber: 1,
    title: compactBoardTitle(`${subject} overview`, subject || "Overview", 6),
    mission: `Open the story of ${subject} clearly and immediately.`,
    headlineClaim: `${subject} should be framed through one clear opening point before secondary detail.`,
    supportPoints: ["Start with the main framing only.", "Keep the opener disciplined and easy to scan."],
    evidenceNotes:
      args.evidenceTier === "source-backed"
        ? ["Use the strongest evidence or framing clue the brief actually gives."]
        : ["Use only qualitative framing if the brief does not supply hard evidence."],
    preferredVisual: args.memory.userOperation === "narrate" ? "vertical-story-strip" : "poster-claim",
    missionScope: "page",
    structureCue: null,
  });

  for (let index = 2; index <= args.pageCount; index += 1) {
    const isLast = index === args.pageCount;
    pageMissions.push({
      pageNumber: index,
      title: compactBoardTitle(
        isLast ? `${subject} conclusion` : `${subject} proof`,
        isLast ? "Conclusion" : "Proof",
        6,
      ),
      mission: isLast
        ? `Close the ${subject} story with a distinct final synthesis step.`
        : `Develop proof step ${index - 1} for ${subject}.`,
      headlineClaim: isLast
        ? `${subject} should end with a distinct closing synthesis instead of repeating an earlier proof page.`
        : `${subject} needs a distinct proof step on this page instead of reusing another page mission.`,
      supportPoints: ["Keep support short and subordinate.", "Do not split the page into equal-weight zones."],
      evidenceNotes:
        args.evidenceTier === "source-backed"
          ? ["Pull only from evidence already present in the brief."]
          : ["If evidence is weak, use labeled assumptions or qualitative structure."],
      preferredVisual: isLast ? "single-proof-canvas" : "annotation-stage",
      missionScope: "page",
      structureCue: null,
    });
  }

  return pageMissions;
}

function buildAmbiguousBriefPageMissions(args: {
  brief: string;
  memory: StudioWorkingMemory;
  pageCount: number;
}) {
  const subject = resolveAmbiguousBriefSubject(args.memory.primaryObject, args.brief);
  const missionTemplates = [
    {
      title: "Core Story Frame",
      mission: `Turn the sparse request into one conservative presentation frame around ${subject}.`,
      headlineClaim: `${subject} should be presented with explicit assumptions because the brief does not supply enough source detail.`,
      preferredVisual: "simple-thesis-canvas",
    },
    {
      title: "Audience Need",
      mission: `Explain the likely audience need for ${subject} without inventing specific customer or market facts.`,
      headlineClaim: `${subject} needs a clear audience problem before any detailed proof is claimed.`,
      preferredVisual: "problem-to-response-strip",
    },
    {
      title: "Basic Structure",
      mission: `Show the basic structure or components of ${subject} using qualitative labels only.`,
      headlineClaim: `${subject} should be organized into a simple, editable structure before adding unsupported detail.`,
      preferredVisual: "three-part-structure",
    },
    {
      title: "Knowns And Assumptions",
      mission: `Separate what the user actually supplied about ${subject} from assumptions needed to complete the deck.`,
      headlineClaim: `${subject} can stay useful if assumptions are visible instead of disguised as source-backed facts.`,
      preferredVisual: "assumption-boundary-board",
    },
    {
      title: "Next Step",
      mission: `Close with the most reasonable next step for refining or using the ${subject} deck.`,
      headlineClaim: `${subject} should end with a clear next action rather than fake precision.`,
      preferredVisual: "next-step-panel",
    },
  ];

  return Array.from({ length: args.pageCount }, (_value, index) => {
    const template = missionTemplates[Math.min(index, missionTemplates.length - 1)]!;
    const pageNumber = index + 1;
    return {
      pageNumber,
      title: args.pageCount === 1 ? template.title : template.title,
      mission: template.mission,
      headlineClaim: template.headlineClaim,
      supportPoints: [
        "Use the user's sparse wording as the boundary.",
        "Keep missing detail assumption-labeled instead of fabricating specifics.",
      ],
      evidenceNotes: ["No source-backed evidence was supplied; avoid hard numbers, citations, or named proof points."],
      preferredVisual: template.preferredVisual,
      missionScope: "page",
      structureCue: null,
    } satisfies StudioPageMission;
  });
}

function sanitizeMission(mission: StudioPageMission, pageNumber: number): StudioPageMission {
  const combinedText = [mission.title, mission.mission, mission.headlineClaim, mission.preferredVisual]
    .filter(Boolean)
    .join(" ");
  const structureCue = normalizeStructureCue(mission.structureCue, combinedText);
  return {
    pageNumber,
    title: clampTitleText(mission.title || `Page ${pageNumber}`, 80),
    mission: clampText(mission.mission || "Resolve one clear page mission.", 220),
    headlineClaim: clampText(mission.headlineClaim || mission.mission || "Land one clear claim.", 220),
    supportPoints: uniqueStrings((mission.supportPoints ?? []).map((line) => clampText(line, 180))).slice(0, 3),
    evidenceNotes: uniqueStrings((mission.evidenceNotes ?? []).map((line) => clampText(line, 180))).slice(0, 3),
    preferredVisual: clampText(
      mission.preferredVisual || buildPreferredVisualFromStructureCue(structureCue) || "",
      180,
    ) || null,
    missionScope: normalizeMissionScope(mission.missionScope, combinedText),
    structureCue,
  };
}

type ExplicitPageSegment = {
  pageNumber: number;
  text: string;
};

function trimExplicitPageSegmentText(value: string) {
  const trimmed = value
    .replace(/^[\s:：\-—–,，。.;；、]+/, "")
    .replace(/\n\s*[-*]\s*(?!第|\bpage\b|\bslide\b)[\s\S]*$/i, "")
    .replace(/\b(?:one page, one claim|evidence first|do not fabricate metrics)\b[\s\S]*$/i, "")
    .replace(/(?:一页一(?:个)?(?:结论|观点|主张|问题)|证据优先|不要捏造数据)[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return trimmed.replace(/[\s,，。.;；、]+$/g, "").trim();
}

function clampTitleText(value: string, max = 80) {
  const normalized = normalizeStudioText(value);
  if (normalized.length <= max) {
    return normalized;
  }
  const wordBoundaryTitle = normalized
    .slice(0, max)
    .replace(/\s+\S*$/g, "")
    .replace(/[\s,，。.;；:：\-–—、]+$/g, "")
    .trim();
  return wordBoundaryTitle.length >= 20 ? wordBoundaryTitle : normalized.slice(0, max).trim();
}

function cleanExplicitSegmentTitleCandidate(value: string) {
  const cleaned = normalizeStudioText(value)
    .replace(/^(?:page|slide)\s*title\s*[:：\-–—]\s*/i, "")
    .replace(/^(?:title|headline|标题|標題)\s*[:：\-–—]\s*/i, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/[\s,，。.;；、]+$/g, "")
    .trim();
  if (!cleaned || cleaned.length < 4) {
    return null;
  }
  if (/^(?:story claim|claim|evidence|layout|visual|must not become)\s*[:：]/i.test(cleaned)) {
    return null;
  }
  if (
    /^(?:create|make|generate|build|prepare|design)\b/i.test(cleaned) ||
    /(?:\b\d+\s*-\s*page\b|\bpage\s*\d+\b|\bslide\s*\d+\b|第\s*[一二两三四五六七八九十\d]\s*(?:页|頁|张|張))/i.test(
      cleaned,
    )
  ) {
    return null;
  }
  return clampTitleText(cleaned, 80);
}

function extractExplicitSegmentTitle(segment: string) {
  const normalizedSegment = normalizeStudioText(segment);
  if (!normalizedSegment) {
    return null;
  }

  const quotedTitle =
    normalizedSegment.match(/^["“]([^"”]{4,180})["”]/)?.[1] ??
    normalizedSegment.match(/^['‘]([^'’]{4,180})['’]/)?.[1];
  const cleanedQuotedTitle = quotedTitle ? cleanExplicitSegmentTitleCandidate(quotedTitle) : null;
  if (cleanedQuotedTitle) {
    return cleanedQuotedTitle;
  }

  const labeledTitle = normalizedSegment.match(
    /^(?:page|slide)\s*title\s*[:：\-–—]\s*([\s\S]*?)(?=\s+(?:story claim|claim|evidence|layout|visual|must not become|support|notes?)\s*[:：]|$)/i,
  )?.[1] ?? normalizedSegment.match(
    /^(?:title|headline|标题|標題)\s*[:：\-–—]\s*([\s\S]*?)(?=\s+(?:story claim|claim|evidence|layout|visual|must not become|support|notes?)\s*[:：]|$)/i,
  )?.[1];
  const cleanedLabeledTitle = labeledTitle ? cleanExplicitSegmentTitleCandidate(labeledTitle) : null;
  if (cleanedLabeledTitle) {
    return cleanedLabeledTitle;
  }

  const directTitle = normalizedSegment.match(
    /^([\s\S]*?)(?=\s+(?:story claim|claim|evidence|layout(?:\s*cue)?|primary visual object|object kind|render target|required(?:\s+(?:labels?|quadrants?|bridge steps?|phase labels?|side rail))?|forbidden interpretation|visual|must not become|support|notes?)\s*[:：]|$)/i,
  )?.[1];
  const cleanedDirectTitle = directTitle ? cleanExplicitSegmentTitleCandidate(directTitle) : null;
  if (cleanedDirectTitle) {
    return cleanedDirectTitle;
  }

  return null;
}

function extractExplicitPageSegments(brief: string, pageCount: number) {
  EXPLICIT_PAGE_MARKER_PATTERN.lastIndex = 0;
  const matches = Array.from(brief.matchAll(EXPLICIT_PAGE_MARKER_PATTERN))
    .map((match) => {
      const pageNumber = parsePageReferenceToken(match[1] ?? match[2] ?? "");
      const start = match.index ?? -1;
      if (pageNumber === null || start < 0 || pageNumber > pageCount) {
        return null;
      }
      return {
        pageNumber,
        start,
        end: start + match[0].length,
      };
    })
    .filter((entry): entry is { pageNumber: number; start: number; end: number } => entry !== null);

  const segments = new Map<number, ExplicitPageSegment>();
  matches.forEach((entry, index) => {
    const next = matches[index + 1];
    const rawSegment = brief.slice(entry.end, next?.start ?? brief.length);
    const text = trimExplicitPageSegmentText(rawSegment);
    if (!text) {
      return;
    }
    segments.set(entry.pageNumber, {
      pageNumber: entry.pageNumber,
      text,
    });
  });

  return segments;
}

function resolveExplicitMissionTitle(args: {
  segment: string;
  pageNumber: number;
  subject: string;
  structureCue: StudioPageMission["structureCue"];
}) {
  const explicitTitle = extractExplicitSegmentTitle(args.segment);
  if (explicitTitle) {
    return explicitTitle;
  }

  const normalizedSegment = normalizeStudioText(args.segment);
  for (const entry of PAGE_ROLE_TITLE_PATTERNS) {
    if (entry.pattern.test(args.segment) || entry.pattern.test(normalizedSegment)) {
      return entry.title;
    }
  }

  const normalizedSubject = normalizeStudioText(args.subject);
  const safeSubject =
    normalizedSubject &&
    normalizedSubject.length <= 60 &&
    !/^(?:create|make|generate|build|prepare|design)\b/i.test(normalizedSubject) &&
    !/(?:\b\d+\s*-\s*page\b|\bpage\s*\d+\b|\bslide\s*\d+\b|第\s*[一二两三四五六七八九十\d]\s*(?:页|頁|张|張)|observed facts?|page plan)/i.test(
      normalizedSubject,
    )
      ? normalizedSubject
      : "";
  const shortSubject = safeSubject ? compactBoardTitle(safeSubject, "Core subject", 4) : "";
  if (args.structureCue === "matrix" || args.structureCue === "quadrant") {
    return shortSubject && shortSubject !== "Core subject"
      ? `${shortSubject} in a BCG Matrix`
      : "BCG Matrix View";
  }
  if (args.structureCue === "chart") {
    return shortSubject && shortSubject !== "Core subject"
      ? `${shortSubject} Through One Chart`
      : "Chart-Led Proof";
  }
  if (/\b(?:3d|three-dimensional)\b/i.test(args.segment) || /(?:3D|三维|立体|建模)/i.test(args.segment)) {
    return "3D Product Profit Logic";
  }

  const candidate = clampText(args.segment.replace(/^[上用把讲講写寫做是來来去]/, "").trim(), 60);
  return candidate || `Page ${args.pageNumber}`;
}

function buildExplicitSegmentSupportPoints(args: {
  segment: string;
  structureCue: StudioPageMission["structureCue"];
}) {
  if (args.structureCue === "matrix" || args.structureCue === "quadrant") {
    return [
      "Use one 2x2 frame with explicit axes and named quadrants.",
      "Place the company, business line, or product into the matrix instead of summarizing the whole deck.",
    ];
  }

  if (args.structureCue === "chart") {
    return [
      "Keep one dominant chart or figure as the primary proof surface.",
      "Use a compact annotation zone instead of a second narrative panel.",
    ];
  }

  if (/\b(?:3d|three-dimensional)\b/i.test(args.segment) || /(?:3D|三维|立体|建模)/i.test(args.segment)) {
    return [
      "Keep one dominant product or system object with compact annotations.",
      "Use assumption-labeled reasoning instead of unsupported metrics.",
    ];
  }

  return [
    "Resolve only the stated page task and keep secondary detail subordinate.",
    "Keep this page focused on its own blueprint rather than a deck-wide overview or request-understanding card.",
  ];
}

function buildExplicitSegmentEvidenceNotes(args: {
  structureCue: StudioPageMission["structureCue"];
  evidenceTier: StudioEvidenceTier;
}) {
  if (args.evidenceTier === "source-backed") {
    return args.structureCue === "matrix" || args.structureCue === "quadrant"
      ? ["Keep axis labels and quadrant placements anchored to evidence already present in the brief."]
      : ["Use only evidence already supplied in the raw brief."];
  }

  if (args.structureCue === "matrix" || args.structureCue === "quadrant") {
    return ["If matrix evidence is missing, use qualitative placement or explicit assumptions instead of fake market-share data."];
  }

  return ["If evidence is missing, use qualitative framing or explicit assumptions instead of fake hard data."];
}

function extractExplicitSegmentField(segment: string, labelPattern: string) {
  const normalized = normalizeStudioText(segment);
  const stopLabels =
    "story claim|claim|evidence|layout(?:\\s*/\\s*structure)?(?:\\s+cue)?|structure cue|primary visual object|required(?:\\s+(?:labels?|quadrants?|bridge steps?|phase labels?|side rail))?|must not become|visual thesis|tone|anti-patterns?|source constraint|support|notes?";
  const match = normalized.match(
    new RegExp(`${labelPattern}\\s*[:：]\\s*([\\s\\S]*?)(?=\\s+(?:${stopLabels})\\s*[:：]|$)`, "i"),
  );
  return match?.[1]?.trim().replace(/[\s,，。.;；、]+$/g, "") || null;
}

function splitRequiredLabelItems(value: string | null | undefined) {
  return normalizeStudioText(value ?? "")
    .split(/\s*(?:;|；|\||、|，|,|\n)\s*/g)
    .map((item) => item.trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, ""))
    .filter(Boolean);
}

function formatRequiredLabelsForPrompt(value: string | null | undefined) {
  const labels = splitRequiredLabelItems(value);
  if (labels.length === 0) {
    return {
      requiredLabels: null,
      evidencePoolLabels: null,
      labelCount: 0,
    };
  }
  if (labels.length <= 8) {
    return {
      requiredLabels: labels.join("; "),
      evidencePoolLabels: null,
      labelCount: labels.length,
    };
  }
  return {
    requiredLabels: labels.slice(0, 8).join("; "),
    evidencePoolLabels: labels.slice(8).join("; "),
    labelCount: labels.length,
  };
}

function buildExplicitSegmentDetailLines(segment: string) {
  const layoutCue = extractExplicitSegmentField(segment, "layout(?:\\s*/\\s*structure)?(?:\\s+cue)?|structure cue");
  const primaryVisual = extractExplicitSegmentField(segment, "primary visual object");
  const rawRequiredLabels = extractExplicitSegmentField(
    segment,
    "required(?:\\s+(?:labels?|quadrants?|bridge steps?|phase labels?|side rail))?",
  );
  const requiredLabelBudget = formatRequiredLabelsForPrompt(rawRequiredLabels);
  const mustNotBecome = extractExplicitSegmentField(segment, "must not become");
  return {
    layoutCue,
    primaryVisual,
    requiredLabels: requiredLabelBudget.requiredLabels,
    rawRequiredLabels,
    requiredLabelCount: requiredLabelBudget.labelCount,
    mustNotBecome,
    supportPoints: [
      ...(layoutCue ? [`Layout cue: ${layoutCue}`] : []),
      ...(primaryVisual ? [`Primary visual object: ${primaryVisual}`] : []),
    ],
    evidenceNotes: [
      ...(requiredLabelBudget.requiredLabels ? [`Required labels: ${requiredLabelBudget.requiredLabels}`] : []),
      ...(requiredLabelBudget.evidencePoolLabels ? [`Evidence pool labels: ${requiredLabelBudget.evidencePoolLabels}`] : []),
      ...(mustNotBecome ? [`Must not become: ${mustNotBecome}`] : []),
    ],
  };
}

function buildMissionFromExplicitPageSegment(args: {
  segment: ExplicitPageSegment;
  subject: string;
  evidenceTier: StudioEvidenceTier;
}) {
  const structureCue = normalizeStructureCue(undefined, args.segment.text);
  const explicitDetails = buildExplicitSegmentDetailLines(args.segment.text);
  const explicitStoryClaim = extractExplicitSegmentField(args.segment.text, "story claim|claim");
  const explicitEvidence = extractExplicitSegmentField(args.segment.text, "evidence");
  const scopedSegmentSummary = clampText(args.segment.text, 140);
  const normalizedSubject = normalizeStudioText(args.subject);
  const safeSubject =
    normalizedSubject &&
    normalizedSubject.length <= 60 &&
    !/\b(?:page|slide)\s*\d|\b\d+\s*-\s*page\b|第\s*[一二两三四五六七八九十\d]/i.test(normalizedSubject)
      ? normalizedSubject
      : "the subject";
  const titleSubject = safeSubject === "the subject" ? "The subject" : safeSubject;
  const title = resolveExplicitMissionTitle({
    segment: args.segment.text,
    pageNumber: args.segment.pageNumber,
    subject: args.subject,
    structureCue,
  });
  const mission =
    structureCue === "matrix" || structureCue === "quadrant"
      ? `Build one 2x2 matrix for ${scopedSegmentSummary}.`
      : structureCue === "chart"
        ? `Explain one chart-led evidence view focused on ${scopedSegmentSummary}.`
        : /\b(?:3d|three-dimensional)\b/i.test(args.segment.text) || /(?:3D|三维|立体|建模)/i.test(args.segment.text)
          ? `Explain one 3D-model-centered page focused on ${scopedSegmentSummary}.`
          : `Resolve page ${args.segment.pageNumber} around: ${clampText(args.segment.text, 140)}.`;
  const headlineClaim = explicitStoryClaim || (
    structureCue === "matrix" || structureCue === "quadrant"
      ? `${titleSubject} is clarified through one focused quadrant matrix for ${scopedSegmentSummary}.`
      : structureCue === "chart"
        ? `The page should use one chart-led proof pattern to answer ${scopedSegmentSummary}.`
        : /\b(?:3d|three-dimensional)\b/i.test(args.segment.text) || /(?:3D|三维|立体|建模)/i.test(args.segment.text)
          ? `The page should use one dominant 3D product or system model focused on ${scopedSegmentSummary}.`
          : clampText(args.segment.text, 180)
  );

  return sanitizeMission(
    {
      pageNumber: args.segment.pageNumber,
      title,
      mission,
      headlineClaim,
      supportPoints: [
        ...explicitDetails.supportPoints,
        ...buildExplicitSegmentSupportPoints({
          segment: args.segment.text,
          structureCue,
        }),
      ],
      evidenceNotes: [
        ...(explicitEvidence ? [`Evidence: ${explicitEvidence}`] : []),
        ...explicitDetails.evidenceNotes,
        ...buildExplicitSegmentEvidenceNotes({
          structureCue,
          evidenceTier: args.evidenceTier,
        }),
      ],
      preferredVisual: explicitDetails.primaryVisual || buildPreferredVisualFromStructureCue(structureCue),
      missionScope: "page",
      structureCue,
    },
    args.segment.pageNumber,
  );
}

function resolveRouteConfidence(args: {
  primaryKind: StudioTaskRoutePrimaryKind;
  explicitSegmentCount: number;
  pageCount: number;
  sourceSignalCount: number;
}) {
  if (args.primaryKind === "explicit-page-blueprint") {
    const requiredCoverage = Math.max(1, Math.ceil(args.pageCount * 0.6));
    return args.explicitSegmentCount >= args.pageCount || args.explicitSegmentCount >= requiredCoverage
      ? "high"
      : "medium";
  }
  if (args.primaryKind === "source-backed-analysis") {
    return args.sourceSignalCount >= 4 ? "high" : "medium";
  }
  if (
    args.primaryKind === "chart-matrix-figure" ||
    args.primaryKind === "process-flow" ||
    args.primaryKind === "visual-hero-3d"
  ) {
    return "high";
  }
  return "low";
}

function buildRouteReasonCodes(args: {
  primaryKind: StudioTaskRoutePrimaryKind;
  explicitSegmentCount: number;
  pageCount: number;
  sourceSignalCount: number;
  capabilities: StudioTaskRouteCapabilities;
}) {
  return uniqueStrings([
    `kind:${args.primaryKind}`,
    ...(args.explicitSegmentCount > 0
      ? [`explicit-page-segments:${args.explicitSegmentCount}/${args.pageCount}`]
      : []),
    ...(args.sourceSignalCount > 0 ? [`source-signals:${args.sourceSignalCount}`] : []),
    ...(args.capabilities.matrix ? ["capability:matrix"] : []),
    ...(args.capabilities.chart ? ["capability:chart"] : []),
    ...(args.capabilities.flow ? ["capability:flow"] : []),
    ...(args.capabilities.threeD ? ["capability:3d"] : []),
    ...(args.capabilities.sourceBacked ? ["capability:source-backed"] : []),
  ]).slice(0, 8);
}

function buildRoutePageBlueprint(args: {
  segments: Map<number, ExplicitPageSegment>;
  pageCount: number;
}): StudioTaskRoutePageBlueprint[] {
  return Array.from(args.segments.values())
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .slice(0, args.pageCount)
    .map((segment) => {
      const structureCue = normalizeStructureCue(undefined, segment.text);
      const explicitDetails = buildExplicitSegmentDetailLines(segment.text);
      const has3dCue = hasExplicitThreeDimensionalRequest(segment.text);
      const hasFlowCue = hasProcessFlowRequest(segment.text);
      const hasSwimlaneCue = /\b(?:swimlane|lane headers?|phase bands?)\b|泳道/.test(segment.text);
      const hasComparisonCue = hasComparisonGridSignal(segment.text) && !hasTrueMatrixSignal(segment.text);
      return {
        pageNumber: segment.pageNumber,
        title: resolveExplicitMissionTitle({
          segment: segment.text,
          pageNumber: segment.pageNumber,
          subject: "",
          structureCue,
        }),
        storyClaim: clampText(segment.text, 180),
        evidenceNotes: explicitDetails.evidenceNotes,
        layoutCue: has3dCue ? "3d" : hasFlowCue ? "flow" : hasComparisonCue ? "comparison-grid" : structureCue,
        primaryVisual:
          explicitDetails.primaryVisual ?? (has3dCue
            ? "explicit 3D hero object"
            : hasFlowCue
              ? hasSwimlaneCue
                ? "structured swimlane map"
                : "structured process flow"
              : hasComparisonCue
                ? "business comparison grid"
              : buildPreferredVisualFromStructureCue(structureCue)),
        rawText: segment.text,
      };
    });
}

export function resolveStudioTaskRoute(args: {
  brief: string;
  requestedPageCount?: number | null;
}): StudioTaskRoute {
  const pageCount = detectRequestedPageCount(args.brief, args.requestedPageCount);
  const explicitSegments = extractExplicitPageSegments(args.brief, pageCount);
  const explicitSegmentCount = explicitSegments.size;
  const sourceSignalCount = countSourceEvidenceSignals(args.brief);
  const ambiguousBrief = isAmbiguousBriefRequest(args.brief);
  const capabilities: StudioTaskRouteCapabilities = {
    chart: hasExplicitChartRequest(args.brief),
    matrix:
      MATRIX_STRUCTURE_CUE_PATTERN.test(args.brief) ||
      QUADRANT_STRUCTURE_CUE_PATTERN.test(args.brief),
    flow: hasProcessFlowRequest(args.brief),
    threeD: hasExplicitThreeDimensionalRequest(args.brief),
    sourceBacked: hasSourceBackedAnalysisCue(args.brief),
    freeformLayout: true,
  };
  const explicitPageThreshold = Math.max(1, Math.ceil(pageCount * 0.6));
  const primaryKind: StudioTaskRoutePrimaryKind =
    explicitSegmentCount >= explicitPageThreshold
      ? "explicit-page-blueprint"
      : capabilities.sourceBacked
        ? "source-backed-analysis"
        : capabilities.chart || capabilities.matrix
          ? "chart-matrix-figure"
          : capabilities.flow
            ? "process-flow"
            : capabilities.threeD
              ? "visual-hero-3d"
              : ambiguousBrief
                ? "ambiguous-brief"
              : "generic-presentation";
  const confidence = resolveRouteConfidence({
    primaryKind,
    explicitSegmentCount,
    pageCount,
    sourceSignalCount,
  });

  return {
    primaryKind,
    confidence,
    reasonCodes: buildRouteReasonCodes({
      primaryKind,
      explicitSegmentCount,
      pageCount,
      sourceSignalCount,
      capabilities,
    }),
    capabilities,
    pageBlueprint:
      primaryKind === "explicit-page-blueprint"
        ? buildRoutePageBlueprint({
            segments: explicitSegments,
            pageCount,
          })
        : [],
    workspaceMode: confidence === "low" ? "full-brief" : "page-scoped",
  };
}

function fingerprintStudioPageMission(mission: StudioPageMission) {
  return normalizeStudioText([mission.title, mission.mission, mission.headlineClaim].join(" "))
    .toLowerCase()
    .replace(new RegExp(EXPLICIT_PAGE_MARKER_PATTERN.source, "gi"), " ")
    .replace(/\b(?:page|slide|deck|presentation|ppt|overall|storyboard|flow)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDeckPageMissions(args: {
  brief: string;
  pageCount: number;
  subject: string;
  evidenceTier: StudioEvidenceTier;
  inputPageMissions: StudioPageMission[];
  deterministicPageMissions: StudioPageMission[];
}) {
  const explicitSegments = extractExplicitPageSegments(args.brief, args.pageCount);
  const deterministicByPage = new Map(
    args.deterministicPageMissions.map((mission) => [mission.pageNumber, sanitizeMission(mission, mission.pageNumber)]),
  );
  const providedByPage = new Map(
    args.inputPageMissions.map((mission, index) => [
      mission.pageNumber || index + 1,
      sanitizeMission(mission, mission.pageNumber || index + 1),
    ]),
  );

  const initialMissions = Array.from({ length: args.pageCount }, (_value, index) => {
    const pageNumber = index + 1;
    const explicitSegment = explicitSegments.get(pageNumber);
    if (explicitSegment) {
      return buildMissionFromExplicitPageSegment({
        segment: explicitSegment,
        subject: args.subject,
        evidenceTier: args.evidenceTier,
      });
    }

    return (
      providedByPage.get(pageNumber) ??
      args.inputPageMissions[index] ??
      deterministicByPage.get(pageNumber) ??
      sanitizeMission(
        {
          pageNumber,
          title: `Page ${pageNumber}`,
          mission: "Resolve one clear page mission.",
          headlineClaim: "Land one clear claim.",
          supportPoints: [],
          evidenceNotes: [],
          preferredVisual: null,
          missionScope: "page",
          structureCue: null,
        },
        pageNumber,
      )
    );
  });

  const duplicateFingerprints = new Set(
    Array.from(
      initialMissions.reduce((accumulator, mission) => {
        const fingerprint = fingerprintStudioPageMission(mission);
        accumulator.set(fingerprint, (accumulator.get(fingerprint) ?? 0) + 1);
        return accumulator;
      }, new Map<string, number>()),
    )
      .filter(([fingerprint, count]) => Boolean(fingerprint) && count > 1)
      .map(([fingerprint]) => fingerprint),
  );

  return initialMissions.map((mission, index) => {
    const pageNumber = index + 1;
    const explicitSegment = explicitSegments.get(pageNumber);
    if (explicitSegment) {
      return buildMissionFromExplicitPageSegment({
        segment: explicitSegment,
        subject: args.subject,
        evidenceTier: args.evidenceTier,
      });
    }

    if (
      mission.missionScope === "deck" ||
      duplicateFingerprints.has(fingerprintStudioPageMission(mission))
    ) {
      return (
        deterministicByPage.get(pageNumber) ??
        sanitizeMission(
          {
            ...mission,
            pageNumber,
            title: `Page ${pageNumber}`,
            mission: `Resolve page ${pageNumber} through one page-scoped argument.`,
            headlineClaim: `Page ${pageNumber} should land its own claim, not a deck-wide intent.`,
            supportPoints: [
              "Keep this page scoped to one page-specific task.",
              "Do not repeat the same deck-level framing from another page.",
            ],
            evidenceNotes: buildExplicitSegmentEvidenceNotes({
              structureCue: mission.structureCue,
              evidenceTier: args.evidenceTier,
            }),
            preferredVisual:
              mission.preferredVisual || buildPreferredVisualFromStructureCue(mission.structureCue),
            missionScope: "page",
          },
          pageNumber,
        )
      );
    }

    return sanitizeMission(
      {
        ...mission,
        pageNumber,
      },
      pageNumber,
    );
  });
}

function slugifyExportObjectId(value: string) {
  const slug = normalizeStudioText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "primary";
}

function hasEditableFigureSignal(text: string) {
  return /\b(?:editable\s+figure|figure-led|figure led|central\s+(?:scale\s+)?marker|scale\s+marker|large\s+central|callouts?|proof\s+figure|dominant\s+figure)\b/i.test(text) ||
    /(?:可编辑图形|可編輯圖形|中心指标|中心指標|核心数字|核心數字|标注|標注|图解|圖解)/i.test(text);
}

function hasConsultingDiagramSignal(text: string) {
  return /\b(?:operating\s+model|business\s+model|workflow\s+figure|workflow\s+map|process\s+model|bridge\s+explanation|explanation\s+bridge|value\s+chain|capability\s+model|org\s+model|service\s+blueprint|conceptual\s+model|model\s+diagram|architecture\s+(?:overview|model|diagram))\b/i.test(text) ||
    /(?:运营模型|營運模型|经营模型|經營模型|工作流|流程图解|模型图|模型圖|能力模型|价值链|價值鏈|架构图|架構圖|解释桥|解釋橋)/i.test(text);
}

function hasLayeredDiagramSignal(text: string) {
  return /\b(?:stacked\s+layers?|three\s+stacked\s+layers?|layered\s+(?:operating\s+)?model|operating[-\s]?model\s+layers?)\b/i.test(text);
}

function hasBridgeDiagramSignal(text: string) {
  return /\b(?:bridge[-\s]?explanation|bridge\s+figure|bridge\s+visual|waterfall[-\s]?style\s+(?:visual|figure)|bridge\s+diagram|margin\s+bridge|cost[-\s]?to[-\s]?income\s+bridge)\b/i.test(text);
}

function hasQualitativeRankedBarSignal(text: string) {
  return /\b(?:qualitative\s+rank(?:ed|ing)|relative\s+(?:priority|pressure|ranking)|ranked\s+bar\s+(?:figure|visual|diagram|chart))\b/i.test(text) &&
    !hasExecutableChartDataSignal(text);
}

function parseNumericValue(value: string | null | undefined) {
  const match = normalizeStudioText(value ?? "").match(/[-+]?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }
  const numericValue = Number.parseFloat(match[0]);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function splitChartList(value: string | null | undefined) {
  return normalizeStudioText(value ?? "")
    .split(/\s*(?:,|;|\||、|，)\s*/g)
    .map((item) => item.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim())
    .filter(Boolean);
}

function extractStructuredChartClause(text: string, labelPattern: string) {
  const normalized = normalizeStudioText(text);
  const match = normalized.match(
    new RegExp(`\\b(?:${labelPattern})\\b\\s*[:=]\\s*([\\s\\S]*?)(?=\\s+\\b(?:categories?|labels?|series(?:\\s+values?)?|values?|data|dataset|points?|numeric\\s+steps?|steps?)\\b\\s*[:=]|[.\\n]|$)`, "i"),
  );
  return match?.[1]?.trim() || null;
}

function parseLabelValuePairs(clause: string | null | undefined) {
  return splitChartList(clause)
    .map((entry) => {
      const match = entry.match(/^(.+?)(?:\s*[:=]\s*|\s+)([-+]?\d+(?:\.\d+)?\s*(?:%|bp|bps|x|m|bn|b|k)?)$/i);
      if (!match) {
        return null;
      }
      const label = normalizeStudioText(match[1] ?? "")
        .replace(/^(?:and|then)\s+/i, "")
        .trim();
      const value = parseNumericValue(match[2]);
      if (!label || value === null) {
        return null;
      }
      return { label, value };
    })
    .filter((entry): entry is { label: string; value: number } => entry !== null);
}

function resolveChartDataKind(text: string) {
  if (/\bwaterfall\s+chart\b/i.test(text)) {
    return "chart-waterfall" as const;
  }
  if (/\bstacked\s+(?:bar\s+|column\s+)?chart\b/i.test(text)) {
    return "chart-stacked" as const;
  }
  if (/\bline\s+chart\b/i.test(text)) {
    return "chart-line" as const;
  }
  if (/\bbar\s+chart\b|\branked\s+bar\s+chart\b/i.test(text)) {
    return "chart-bar" as const;
  }
  return null;
}

function structuredChartDataContractFromText(text: string): ExportDataContract | null {
  const normalized = normalizeStudioText(text);
  const kind = resolveChartDataKind(normalized);
  if (!kind) {
    return null;
  }

  if (kind === "chart-waterfall") {
    const stepsClause = extractStructuredChartClause(normalized, "numeric\\s+steps?|steps?");
    const pairs = parseLabelValuePairs(stepsClause);
    if (pairs.length < 2) {
      return null;
    }
    return {
      type: "chart-waterfall",
      steps: pairs.map((pair, index) => ({
        label: pair.label,
        value: pair.value,
        kind: /\bstart|current|baseline\b/i.test(pair.label)
          ? "start"
          : /\bend|target|final\b/i.test(pair.label) || index === pairs.length - 1
            ? "end"
            : pair.value < 0
              ? "decrease"
              : "increase",
      })),
    };
  }

  const categories = splitChartList(
    extractStructuredChartClause(normalized, "categories?|labels?"),
  );
  const values = splitChartList(
    extractStructuredChartClause(normalized, "series\\s+values?|values?"),
  )
    .map((value) => parseNumericValue(value))
    .filter((value): value is number => value !== null);

  if (categories.length >= 2 && categories.length === values.length) {
    return {
      type: kind,
      categories,
      series: [
        {
          name: "Value",
          values,
        },
      ],
      ...(kind === "chart-stacked" ? { stackMode: "absolute" as const } : {}),
    };
  }

  const pairClause = extractStructuredChartClause(normalized, "data|dataset|series");
  const pairs = parseLabelValuePairs(pairClause);
  if (pairs.length >= 2) {
    return {
      type: kind,
      categories: pairs.map((pair) => pair.label),
      series: [
        {
          name: "Value",
          values: pairs.map((pair) => pair.value),
        },
      ],
      ...(kind === "chart-stacked" ? { stackMode: "absolute" as const } : {}),
    };
  }

  return null;
}

function hasExecutableChartDataSignal(text: string) {
  return structuredChartDataContractFromText(text) !== null;
}

function hasChartFamilySignal(text: string) {
  const normalized = normalizeStudioText(text);
  return /\b(?:native\s+chart|bar\s+chart|ranked\s+(?:bar\s+)?chart|line\s+chart|waterfall\s+chart|combo\s+chart|bubble\s+chart|stacked\s+(?:bar|column\s+)?chart|bar\s+series|line\s+series|plot|series|axis|trend)\b/i.test(normalized) ||
    /(?:原生图表|原生圖表|柱状图|柱狀圖|折线图|折線圖|瀑布图|瀑布圖|气泡图|氣泡圖|走势图|走勢圖)/i.test(text);
}

function hasNativeChartSignal(text: string) {
  return hasChartFamilySignal(text) ||
    /\b(?:chart-led|chart led|chart\s*[- ]?first)\b/i.test(text);
}

function hasNativeTableSignal(text: string) {
  const normalized = normalizeStudioText(text);
  return /\b(?:native table|data table|table with rows|rows and columns|financial table)\b/i.test(normalized) ||
    /(?:原生表格|数据表|資料表|明细表|明細表|表格.{0,8}行列|行列.{0,8}表格)/i.test(normalized);
}

function inferExportObjectKind(args: {
  mission: StudioPageMission;
  route: StudioTaskRoute;
}): ExportObjectKind {
  const blueprint = args.route.pageBlueprint.find(
    (entry) => entry.pageNumber === args.mission.pageNumber,
  );
  const blueprintText = normalizeStudioText(
    [
      blueprint?.layoutCue,
      blueprint?.primaryVisual,
      blueprint?.storyClaim,
      blueprint?.rawText,
    ].join(" "),
  ).toLowerCase();
  const explicitBlueprintText = normalizeStudioText(blueprint?.rawText ?? "").toLowerCase();
  const haystack = normalizeStudioText(
    [
      args.mission.title,
      args.mission.mission,
      args.mission.headlineClaim,
      args.mission.preferredVisual,
      args.mission.structureCue,
      blueprint?.layoutCue,
      blueprint?.primaryVisual,
      blueprint?.storyClaim,
      blueprint?.rawText,
    ].join(" "),
  ).toLowerCase();

  if (hasComparisonGridSignal(haystack) && !hasTrueMatrixSignal(haystack) && !hasNativeTableSignal(haystack)) {
    return "comparison-grid";
  }
  if (
    args.mission.structureCue === "matrix" ||
    args.mission.structureCue === "quadrant" ||
    ((/\b(?:matrix|quadrant|2x2|bcg)\b/i.test(haystack) ||
      /(?:矩阵|矩陣|四象限|二维|二維)/i.test(haystack)) &&
      !(hasComparisonGridSignal(haystack) && !hasTrueMatrixSignal(haystack)))
  ) {
    return "matrix";
  }
  if (hasChartFamilySignal(explicitBlueprintText || blueprintText || haystack)) {
    const chartDataContract = structuredChartDataContractFromText(
      explicitBlueprintText || blueprintText || haystack,
    );
    if (chartDataContract) {
      return "chart-visual";
    }
  }
  if (
    hasEditableFigureSignal(explicitBlueprintText || blueprintText || haystack) &&
    !hasNativeChartSignal(explicitBlueprintText)
  ) {
    return "diagram";
  }
  if (
    hasLayeredDiagramSignal(explicitBlueprintText || blueprintText || haystack) ||
    hasBridgeDiagramSignal(explicitBlueprintText || blueprintText || haystack) ||
    hasQualitativeRankedBarSignal(explicitBlueprintText || blueprintText || haystack)
  ) {
    return "diagram";
  }
  if (
    hasConsultingDiagramSignal(explicitBlueprintText || blueprintText || haystack) &&
    !hasChartFamilySignal(explicitBlueprintText || blueprintText)
  ) {
    return "diagram";
  }
  if (
    (args.mission.structureCue === "chart" || hasChartFamilySignal(haystack)) &&
    hasExecutableChartDataSignal(explicitBlueprintText || blueprintText || haystack)
  ) {
    return "chart-visual";
  }
  if (
    (
      /\b(?:graph|plot|bar|line|combo|bubble|series|axis|trend)\b/i.test(haystack) ||
      /(?:图表|圖表|柱状图|柱狀圖|折线图|折線圖|瀑布图|瀑布圖|气泡图|氣泡圖|走势图|走勢圖)/i.test(haystack)
    ) &&
    hasExecutableChartDataSignal(haystack)
  ) {
    return "chart-visual";
  }
  if (args.mission.structureCue === "chart" || hasChartFamilySignal(haystack)) {
    return "diagram";
  }
  if (hasNativeTableSignal(haystack)) {
    return "native-table";
  }
  if (
    blueprint?.layoutCue === "flow" ||
    args.route.primaryKind === "process-flow" ||
    /\b(?:diagram|flow|flowchart|swimlane|workflow|process|roadmap|timeline|gantt|3d|hero model)\b/i.test(haystack) ||
    /(?:流程|泳道|图解|圖解|架构|架構|路线图|路線圖|时间线|時間線)/i.test(haystack)
  ) {
    return "diagram";
  }
  if (
    /\b(?:compare|comparison|versus|vs\.?|trade-?off|options?|alternatives?)\b/i.test(haystack) ||
    /(?:对比|比較|比较|取舍|方案|选项|選項)/i.test(haystack)
  ) {
    return "comparison-grid";
  }
  if (
    /\b(?:metric|kpi|scorecard|dashboard|stats?|numbers?|facts?|evidence wall)\b/i.test(haystack) ||
    /(?:指标|指標|数据点|數據點|事实|事實|证据|證據)/i.test(haystack)
  ) {
    return "metric-grid";
  }
  if (
    /\b(?:cards?|pillars?|themes?|drivers?|buckets?|modules?)\b/i.test(haystack) ||
    /(?:卡片|支柱|主题|主題|驱动|驅動|模块|模塊)/i.test(haystack)
  ) {
    return "card-grid";
  }
  return "text";
}

function renderTargetForExportObjectKind(kind: ExportObjectKind): ExportRenderTarget {
  if (kind === "chart-visual") {
    return "visual-snapshot";
  }
  if (kind === "native-chart") {
    return "native-chart";
  }
  if (kind === "native-table") {
    return "native-table";
  }
  if (kind === "text") {
    return "editable-text";
  }
  return "editable-shapes";
}

function forbiddenInterpretationForExportObjectKind(kind: ExportObjectKind) {
  switch (kind) {
    case "chart-visual":
      return ["native-table", "native-chart"];
    case "native-chart":
      return ["native-table"];
    case "matrix":
    case "comparison-grid":
    case "metric-grid":
    case "card-grid":
      return ["native-table"];
    case "diagram":
      return ["native-table", "native-chart"];
    case "text":
      return ["native-table", "native-chart"];
    case "native-table":
    default:
      return [];
  }
}

function childRolesForExportObjectKind(kind: ExportObjectKind) {
  switch (kind) {
    case "chart-visual":
    case "native-chart":
      return ["chart-frame", "plot", "axis", "legend", "annotation"];
    case "native-table":
      return ["table", "row", "column", "cell", "caption"];
    case "matrix":
      return ["axis", "quadrant", "cell", "item", "annotation"];
    case "comparison-grid":
      return ["option", "dimension", "evidence", "annotation"];
    case "metric-grid":
      return ["metric", "label", "delta", "annotation"];
    case "card-grid":
      return ["card", "heading", "body", "annotation"];
    case "diagram":
      return ["node", "connector", "lane", "phase", "annotation"];
    case "text":
    default:
      return ["headline", "body", "annotation"];
  }
}

function missingDataContractForExportObjectKind(
  kind: Extract<ExportObjectKind, "native-chart" | "native-table" | "matrix">,
): ExportDataContract {
  if (kind === "native-chart") {
    return {
      type: "missing-data",
      expected: "native-chart",
      reason: "Preflight identified a chart object but does not have structured chart data.",
      requiredFields: ["chart family", "categories or points", "series or steps"],
    };
  }
  if (kind === "native-table") {
    return {
      type: "missing-data",
      expected: "native-table",
      reason: "Preflight identified a table object but does not have structured table rows and columns.",
      requiredFields: ["columns", "rows"],
    };
  }
  return {
    type: "missing-data",
    expected: "matrix",
    reason: "Preflight identified a matrix object but does not have structured axes and items.",
    requiredFields: ["axes", "items"],
  };
}

function chartDataContractFromMission(
  mission: StudioPageMission,
  route: StudioTaskRoute,
): ExportDataContract | null {
  const blueprint = route.pageBlueprint.find((entry) => entry.pageNumber === mission.pageNumber);
  const candidates = [
    blueprint?.rawText,
    blueprint?.primaryVisual,
    mission.preferredVisual,
    ...mission.supportPoints,
    ...mission.evidenceNotes,
  ]
    .map((candidate) => normalizeStudioText(candidate ?? ""))
    .filter((candidate) =>
      /\b(?:bar|line|stacked|waterfall)\s+(?:bar\s+|column\s+)?chart\b|\b(?:categories?|labels?|series|values?|data|dataset|steps?)\s*[:=]/i.test(
        candidate,
      ),
    );

  for (const candidate of candidates) {
    const contract = structuredChartDataContractFromText(candidate);
    if (contract) {
      return contract;
    }
  }
  return null;
}

type MatrixDataContract = Extract<ExportDataContract, { type: "matrix" }>;
type MatrixVariant = NonNullable<MatrixDataContract["variant"]>;

function cleanMatrixLabel(value: string | null | undefined, fallback = "Dimension") {
  const cleaned = normalizeStudioText(value ?? "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/\s*(?:为轴|as axes?|axis|维度|dimension)\s*$/i, "")
    .replace(/^[：:,\s]+|[：:,\s]+$/g, "")
    .trim();
  return clampText(cleaned || fallback, 80);
}

function matrixAxisShortLabel(label: string) {
  return cleanMatrixLabel(label)
    .split(/[\/／|]/)[0]
    ?.trim() || label;
}

function matrixSlug(value: string) {
  return normalizeStudioText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "item";
}

function inferMatrixAxisPairFromText(text: string): { x: string; y: string } | null {
  const normalized = normalizeStudioText(text);
  const explicitXThenY =
    normalized.match(/\bx[-\s]*axis\s*(?:is|=|:)?\s*["“]?([^"”;,，；]+)["”]?(?:[^.\n]{0,80}?)\by[-\s]*axis\s*(?:is|=|:)?\s*["“]?([^"”;,，；]+)["”]?/i) ??
    normalized.match(/横轴\s*[：:=]?\s*["“]?([^"”;,，；]+)["”]?(?:[^。\n]{0,80}?)纵轴\s*[：:=]?\s*["“]?([^"”;,，；]+)["”]?/i);
  if (explicitXThenY) {
    return {
      x: cleanMatrixLabel(explicitXThenY[1], "X axis"),
      y: cleanMatrixLabel(explicitXThenY[2], "Y axis"),
    };
  }

  const explicitYThenX =
    normalized.match(/\by[-\s]*axis\s*(?:is|=|:)?\s*["“]?([^"”;,，；]+)["”]?(?:[^.\n]{0,80}?)\bx[-\s]*axis\s*(?:is|=|:)?\s*["“]?([^"”;,，；]+)["”]?/i) ??
    normalized.match(/纵轴\s*[：:=]?\s*["“]?([^"”;,，；]+)["”]?(?:[^。\n]{0,80}?)横轴\s*[：:=]?\s*["“]?([^"”;,，；]+)["”]?/i);
  if (explicitYThenX) {
    return {
      x: cleanMatrixLabel(explicitYThenX[2], "X axis"),
      y: cleanMatrixLabel(explicitYThenX[1], "Y axis"),
    };
  }

  const quotedAxes =
    normalized.match(/\b(?:with\s+)?axes?\s+(?:are\s+)?["“]([^"”]+)["”]\s*(?:and|\/|,|，|与|和|及|、)\s*["“]([^"”]+)["”]/i) ??
    normalized.match(/以\s*["“]?([^"”。，,、；;]{2,60})["”]?\s*(?:与|和|及|\/|、)\s*["“]?([^"”。，,、；;]{2,60})["”]?\s*为轴/i);
  if (quotedAxes) {
    return {
      x: cleanMatrixLabel(quotedAxes[2], "X axis"),
      y: cleanMatrixLabel(quotedAxes[1], "Y axis"),
    };
  }

  const looseAxes = normalized.match(/\bwith\s+axes?\s+([^.;\n]{2,60}?)\s+(?:and|\/)\s+([^.;\n]{2,60})(?:[.;\n]|$)/i);
  if (looseAxes) {
    return {
      x: cleanMatrixLabel(looseAxes[2], "X axis"),
      y: cleanMatrixLabel(looseAxes[1], "Y axis"),
    };
  }

  return null;
}

function isFinanceMatrixText(text: string, route: StudioTaskRoute) {
  return (
    route.capabilities.sourceBacked ||
    /\b(?:finance|financial|equity|investment|investor|valuation|tesla|robotaxi|fsd|platform)\b/i.test(text) ||
    /(?:投资|投資|估值|财务|財務|平台|兑现|兌現|特斯拉|算力|超充|运营网络|運營網絡)/i.test(text)
  );
}

function defaultMatrixAxes(text: string, route: StudioTaskRoute) {
  if (/(?:特斯拉|Tesla|Robotaxi|FSD|超充|平台成熟|运营网络|運營網絡)/i.test(text)) {
    return {
      x: "运营网络扩展度 / 城市与节点覆盖",
      y: "平台成熟度 / 可运营化程度",
    };
  }
  if (isFinanceMatrixText(text, route)) {
    return {
      x: "兑现可见度",
      y: "投资上行弹性",
    };
  }
  return {
    x: "Market attractiveness",
    y: "Ability to execute",
  };
}

function splitMatrixList(value: string | null | undefined) {
  return normalizeStudioText(value ?? "")
    .split(/\s*(?:;|；|\||、|，|,|\n)\s*/g)
    .map((item) => cleanMatrixLabel(item, ""))
    .filter((item) => item.length > 0);
}

function extractMatrixQuadrantLabels(text: string, axes: { x: string; y: string }) {
  const explicit =
    text.match(/required\s+quadrants?\s*[:：]\s*([^\n.]+)/i)?.[1] ??
    text.match(/quadrants?\s*[:：]\s*([^\n.]+)/i)?.[1] ??
    text.match(/象限\s*[:：]\s*([^\n。]+)/i)?.[1] ??
    null;
  const labels = splitMatrixList(explicit).slice(0, 4);
  if (labels.length >= 4) {
    return labels;
  }
  const xShort = matrixAxisShortLabel(axes.x);
  const yShort = matrixAxisShortLabel(axes.y);
  return [
    `高${yShort} / 低${xShort}`,
    `高${yShort} / 高${xShort}`,
    `低${yShort} / 低${xShort}`,
    `低${yShort} / 高${xShort}`,
  ];
}

function matrixQuadrantsFromLabels(labels: string[]): MatrixDataContract["quadrants"] {
  const positions = [
    { id: "high-y-low-x", x: 0, y: 0.5, w: 0.5, h: 0.5 },
    { id: "high-y-high-x", x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    { id: "low-y-low-x", x: 0, y: 0, w: 0.5, h: 0.5 },
    { id: "low-y-high-x", x: 0.5, y: 0, w: 0.5, h: 0.5 },
  ];
  return positions.map((position, index) => ({
    ...position,
    label: labels[index] ?? `Quadrant ${index + 1}`,
  }));
}

function extractMatrixRequiredLabels(text: string) {
  const labelsText =
    text.match(/required\s+labels?\s*[:：]\s*([^\n.]+)/i)?.[1] ??
    text.match(/items?\s*[:：]\s*([^\n.]+)/i)?.[1] ??
    text.match(/assets?\s*[:：]\s*([^\n.]+)/i)?.[1] ??
    text.match(/标签\s*[:：]\s*([^\n。]+)/i)?.[1] ??
    null;
  return splitMatrixList(labelsText);
}

function isLikelyMatrixItem(label: string, axes: { x: string; y: string }, quadrants: readonly string[]) {
  const normalized = normalizeStudioText(label).toLowerCase();
  if (normalized.length < 2 || normalized.length > 80) {
    return false;
  }
  const axisText = `${axes.x} ${axes.y}`.toLowerCase();
  if (axisText.includes(normalized) || quadrants.some((quadrant) => quadrant.toLowerCase() === normalized)) {
    return false;
  }
  return !/\b(?:axis|axes|quadrant|source|constraint|evidence|layout|matrix|x-axis|y-axis)\b/i.test(normalized) &&
    !/(?:轴|象限|资料来源|資料來源|矩阵|矩陣)/.test(normalized);
}

function teslaMatrixItems(text: string): MatrixDataContract["items"] | null {
  if (!/(?:特斯拉|Tesla|Robotaxi|FSD|超充|算力)/i.test(text)) {
    return null;
  }
  return [
    {
      id: "ai-training-compute",
      label: "AI 训练算力",
      detail: /Cortex|H100e|算力/i.test(text) ? "Cortex / H100e 披露显示训练基础设施进入扩张期" : "训练基础设施支撑自动驾驶与平台能力",
      x: 0.32,
      y: 0.72,
    },
    {
      id: "robotaxi",
      label: "Robotaxi",
      detail: /Austin|Dallas|Houston|奥斯汀|达拉斯|休斯敦/i.test(text) ? "运营城市与无人监督里程正在扩展" : "商业化落地仍依赖城市运营扩展",
      x: 0.72,
      y: 0.74,
    },
    {
      id: "fsd-subscription",
      label: "FSD 订阅",
      detail: /128万|128|subscription|订阅/i.test(text) ? "订阅基础扩容，是软件层兑现的关键抓手" : "软件订阅基础决定平台兑现可见度",
      x: 0.72,
      y: 0.28,
    },
    {
      id: "supercharger-network",
      label: "超充网络",
      detail: /79,?918|8,?463|超充/i.test(text) ? "连接器与站点覆盖构成运营网络底座" : "充电基础设施提供网络覆盖和运营触点",
      x: 0.30,
      y: 0.28,
    },
  ];
}

function matrixItemsFromText(text: string, axes: { x: string; y: string }, quadrants: readonly string[]) {
  const teslaItems = teslaMatrixItems(text);
  if (teslaItems) {
    return teslaItems;
  }

  const labels = uniqueStrings(
    [
      ...extractMatrixRequiredLabels(text),
      ...Array.from(text.matchAll(/["“]([^"”]{2,40})["”]/g)).map((match) => match[1] ?? ""),
    ]
      .map((label) => cleanMatrixLabel(label, ""))
      .filter((label) => isLikelyMatrixItem(label, axes, quadrants)),
  ).slice(0, 8);

  const safeLabels = labels.length > 0
    ? labels
    : ["Core bet", "Scale option", "Watch item", "Support asset"];
  const positions = [
    { x: 0.34, y: 0.72 },
    { x: 0.72, y: 0.72 },
    { x: 0.32, y: 0.30 },
    { x: 0.70, y: 0.30 },
    { x: 0.46, y: 0.56 },
    { x: 0.58, y: 0.44 },
    { x: 0.24, y: 0.48 },
    { x: 0.82, y: 0.52 },
  ];

  return safeLabels.map((label, index) => ({
    id: matrixSlug(label),
    label,
    x: positions[index % positions.length]!.x,
    y: positions[index % positions.length]!.y,
  }));
}

function matrixVariantFromText(text: string, route: StudioTaskRoute): MatrixVariant {
  if (/\b(?:asset|card|evidence card|evidence block|screenshot)\b/i.test(text) || /(?:证据卡|證據卡|资产块|資產塊|截图|截圖)/i.test(text)) {
    return "asset-card-map";
  }
  if (isFinanceMatrixText(text, route)) {
    return "asset-card-map";
  }
  return "point-map";
}

function matrixDataContractFromMission(
  mission: StudioPageMission,
  route: StudioTaskRoute,
): MatrixDataContract {
  const blueprint = route.pageBlueprint.find((entry) => entry.pageNumber === mission.pageNumber);
  const text = normalizeStudioText([
    blueprint?.rawText,
    blueprint?.primaryVisual,
    blueprint?.storyClaim,
    mission.title,
    mission.mission,
    mission.headlineClaim,
    mission.preferredVisual,
    ...mission.supportPoints,
    ...mission.evidenceNotes,
  ].join("\n"));
  const axes = inferMatrixAxisPairFromText(text) ?? defaultMatrixAxes(text, route);
  const quadrantLabels = extractMatrixQuadrantLabels(text, axes);
  return {
    type: "matrix",
    variant: matrixVariantFromText(text, route),
    axes: {
      x: { label: axes.x },
      y: { label: axes.y },
    },
    quadrants: matrixQuadrantsFromLabels(quadrantLabels),
    items: matrixItemsFromText(text, axes, quadrantLabels),
    labels: quadrantLabels,
    callout: {
      title: "Conclusion rail",
      body: clampText(mission.headlineClaim || mission.mission, 240),
    },
    renderTarget: "editable-shapes",
  };
}

function dataContractForExportObjectKind(
  kind: ExportObjectKind,
  mission: StudioPageMission,
  route: StudioTaskRoute,
): ExportDataContract | null {
  if (kind === "chart-visual") {
    return chartDataContractFromMission(mission, route);
  }
  if (kind === "native-chart") {
    return missingDataContractForExportObjectKind("native-chart");
  }
  if (kind === "native-table") {
    return missingDataContractForExportObjectKind("native-table");
  }
  if (kind === "matrix") {
    return matrixDataContractFromMission(mission, route);
  }
  return null;
}

type PageIrDefaults = {
  layoutArchetype: PageLayoutArchetype;
  visualGrammar: PageVisualGrammar;
  composition: PageComposition;
  density: PageDensity;
};

function pageIrBlueprintForRoute(route: StudioTaskRoute, pageNumber: number) {
  return route.pageBlueprint.find((entry) => entry.pageNumber === pageNumber) ?? null;
}

function pageIrText(args: {
  page: PageExportContract;
  route: StudioTaskRoute;
  mission?: StudioPageMission | null;
}) {
  const primaryObject =
    args.page.objects.find((object) => object.objectId === args.page.primaryObjectId) ??
    args.page.objects.find((object) => object.objectRole === "primary") ??
    args.page.objects[0] ??
    null;
  const blueprint = pageIrBlueprintForRoute(args.route, args.page.pageNumber);
  return normalizeStudioText(
    [
      args.page.pageStory,
      args.page.primaryVisualObject,
      args.page.layoutArchetype,
      args.page.visualGrammar,
      args.page.composition,
      args.page.density,
      args.mission?.title,
      args.mission?.mission,
      args.mission?.headlineClaim,
      args.mission?.preferredVisual,
      args.mission?.structureCue,
      blueprint?.layoutCue,
      blueprint?.primaryVisual,
      blueprint?.storyClaim,
      blueprint?.rawText,
      primaryObject?.objectKind,
      primaryObject?.primaryVisualObject,
      primaryObject?.dataContract?.type,
    ].join(" "),
  ).toLowerCase();
}

function inferPageLayoutArchetype(args: {
  page: PageExportContract;
  route: StudioTaskRoute;
  mission?: StudioPageMission | null;
  text: string;
}): PageLayoutArchetype {
  const primaryObject =
    args.page.objects.find((object) => object.objectId === args.page.primaryObjectId) ??
    args.page.objects.find((object) => object.objectRole === "primary") ??
    args.page.objects[0] ??
    null;
  const blueprint = pageIrBlueprintForRoute(args.route, args.page.pageNumber);
  const text = args.text;

  if (
    primaryObject?.objectKind === "comparison-grid" ||
    (hasComparisonGridSignal(text) && !hasTrueMatrixSignal(text))
  ) {
    return "comparison-grid";
  }
  if (
    primaryObject?.objectKind === "matrix" ||
    ((/\b(?:matrix|quadrant|2x2|bcg)\b|矩阵|矩陣|四象限/.test(text)) &&
      !(hasComparisonGridSignal(text) && !hasTrueMatrixSignal(text))) ||
    blueprint?.layoutCue === "matrix" ||
    blueprint?.layoutCue === "quadrant" ||
    args.mission?.structureCue === "matrix" ||
    args.mission?.structureCue === "quadrant"
  ) {
    return "matrix-first";
  }
  if (/\b(?:waterfall|valuation\s+bridge|economics\s+bridge|bridge\s+explanation|upside\s+waterfall|value\s+bridge|business\s+bridge)\b|瀑布图|瀑布圖|桥接|橋接/.test(text)) {
    return "bridge-explanation";
  }
  if (/\b(?:before[-\s/]+after|before\s+and\s+after|from\s+.+\s+to\s+)\b|前后对比|前後對比/.test(text)) {
    return "before-after";
  }
  if (/\b(?:flywheel|virtuous\s+cycle|reinforcing\s+loop)\b|飞轮|飛輪|正循环|正循環/.test(text)) {
    return "flywheel";
  }
  if (/\b(?:bubble|bubble\s+chart|scatter)\b|气泡图|氣泡圖/.test(text)) {
    return "bubble-landscape";
  }
  if (/\b(?:swimlane|lane headers?|phase bands?)\b|泳道/.test(text)) {
    return "swimlane";
  }
  if (/\b(?:operating\s+model|governance\s+model|roles?\s+and\s+cadence|cadence\s+model)\b|运营模式|營運模式|治理模式/.test(text)) {
    return "operating-model";
  }
  if (/\b(?:timeline|roadmap|milestones?)\b|时间线|時間線|路线图|路線圖/.test(text)) {
    return /\b(?:case|rollout|implementation|lesson|turning\s+point)\b|案例|复盘|復盤/.test(text)
      ? "case-timeline"
      : "timeline-led";
  }
  if (/\b(?:decision\s+tree|decision\s+nodes?|decision diamonds?)\b|决策树|決策樹|决策节点|決策節點/.test(text)) {
    return "decision-tree";
  }
  if (primaryObject?.objectKind === "native-table" || /\b(?:benchmark\s+table|native\s+table|data\s+table|table)\b|表格|基准表|基準表/.test(text)) {
    return "benchmark-table";
  }
  if (/\b(?:funnel|conversion)\b|漏斗/.test(text)) {
    return "funnel";
  }
  if (/\b(?:risk\s+heat\s*map|risk\s+heatmap|heat\s*map)\b|风险热力图|風險熱力圖/.test(text)) {
    return "risk-heatmap";
  }
  if (/\b(?:market\s+map|landscape\s+map|positioning\s+map)\b|市场地图|市場地圖/.test(text)) {
    return "market-map";
  }
  if (/\b(?:portfolio\s+grid)\b|组合矩阵|組合矩陣/.test(text)) {
    return "portfolio-grid";
  }
  if (/\b(?:capability\s+model)\b|能力模型/.test(text)) {
    return "capability-model";
  }
  if (/\b(?:annotation\s+stage|annotated\s+figure|figure\s+stage|callout\s+ring|annotation\s+ring|moat|ecosystem)\b|标注|標注|生态|生態/.test(text)) {
    return "annotation-stage";
  }
  if (/\b(?:evidence\s+wall|proof\s+wall|fact\s+base|evidence\s+hierarchy|cash-flow\s+engines|facts?)\b|证据墙|證據牆|事实墙|事實牆/.test(text)) {
    return "evidence-wall";
  }
  if (/\b(?:layered\s+stack|stack\s+diagram|platform\s+stack|3d|three-dimensional|hero\s+model)\b|分层|分層|堆栈|堆疊|三维|三維|立体/.test(text) || blueprint?.layoutCue === "3d") {
    return "layered-stack";
  }
  if (blueprint?.layoutCue === "flow" || args.route.primaryKind === "process-flow" || /\b(?:process\s+flow|flowchart|workflow|process)\b|流程/.test(text)) {
    return "process-flow";
  }
  if (primaryObject?.objectKind === "chart-visual" || blueprint?.layoutCue === "chart" || args.mission?.structureCue === "chart") {
    return "chart-with-insight-rail";
  }
  if (/\b(?:hero\s+metric|big\s+number|kpi)\b|核心数字|核心數字|指标/.test(text)) {
    return "hero-metric";
  }
  if (/\b(?:single\s+dominant|dominant\s+visual|one\s+dominant)\b|主视觉|主視覺/.test(text)) {
    return "single-dominant-visual";
  }
  return "thesis-evidence-board";
}

function inferPageVisualGrammar(args: {
  route: StudioTaskRoute;
  text: string;
}): PageVisualGrammar {
  if (/\b(?:equity\s+research|investment\s+research|valuation|investor|financial\s+analysis|financial\s+model|investment\s+case)\b|研报|研報|估值|投资|投資/.test(args.text)) {
    return "equity-research";
  }
  const businessContext = hasBusinessAiContext(args.text);
  if (hasExplicitScientificVisualIntent(args.text) && !businessContext) {
    return "scientific-figure";
  }
  if (hasExplicitTechnicalSystemIntent(args.text) && !businessContext) {
    return "technical-system";
  }
  if (/\b(?:product\s+strategy|product\s+vision|go-to-market|gtm)\b|产品策略|產品策略/.test(args.text)) {
    return "product-strategy";
  }
  return "consulting";
}

function inferPageDensity(args: {
  route: StudioTaskRoute;
  text: string;
}): PageDensity {
  if (/\b(?:sparse|minimal|minimalist|hero\s+page)\b|留白|稀疏/.test(args.text)) {
    return "sparse";
  }
  if (/\b(?:dense|data-rich|data\s+rich|detail-heavy|technical appendix)\b|密集|高密度/.test(args.text)) {
    return "dense";
  }
  if (args.route.primaryKind === "source-backed-analysis" || args.route.capabilities.sourceBacked) {
    return "executive";
  }
  return "executive";
}

function explicitCompositionFromText(text: string): PageComposition | null {
  if (/\bdominant\s+left\b|\bleft\s+dominant\b/.test(text)) {
    return "dominant-left-rail-right";
  }
  if (/\bdominant\s+right\b|\bright\s+dominant\b/.test(text)) {
    return "dominant-right-rail-left";
  }
  if (/\b(?:full\s*bleed|top\s+title)\b/.test(text)) {
    return "top-title-full-bleed-visual";
  }
  if (/\b(?:center\s+canvas|annotation\s+ring)\b/.test(text)) {
    return "center-canvas-annotation-ring";
  }
  if (/\b(?:two\s+column|2-column|contrast\s+columns?)\b/.test(text)) {
    return "two-column-contrast";
  }
  if (/\b(?:three\s+band|3-band|narrative\s+bands?)\b/.test(text)) {
    return "three-band-narrative";
  }
  if (/\b(?:grid|hierarchy)\b/.test(text)) {
    return "grid-with-hierarchy";
  }
  return null;
}

function compositionForPageLayoutArchetype(layoutArchetype: PageLayoutArchetype): PageComposition {
  switch (layoutArchetype) {
    case "chart-with-insight-rail":
      return "dominant-left-rail-right";
    case "bubble-landscape":
    case "matrix-first":
    case "market-map":
    case "risk-heatmap":
    case "flywheel":
    case "annotation-stage":
      return "center-canvas-annotation-ring";
    case "timeline-led":
    case "process-flow":
    case "swimlane":
    case "decision-tree":
    case "layered-stack":
    case "funnel":
    case "operating-model":
    case "case-timeline":
    case "bridge-explanation":
      return "three-band-narrative";
    case "before-after":
      return "two-column-contrast";
    case "single-dominant-visual":
    case "hero-metric":
      return "top-title-full-bleed-visual";
    case "benchmark-table":
    case "comparison-grid":
    case "portfolio-grid":
    case "capability-model":
    case "thesis-evidence-board":
    case "evidence-wall":
    default:
      return "grid-with-hierarchy";
  }
}

function inferPageIrDefaults(args: {
  page: PageExportContract;
  route: StudioTaskRoute;
  mission?: StudioPageMission | null;
}): PageIrDefaults {
  const text = pageIrText(args);
  const layoutArchetype = inferPageLayoutArchetype({
    page: args.page,
    route: args.route,
    mission: args.mission,
    text,
  });
  return {
    layoutArchetype,
    visualGrammar: inferPageVisualGrammar({
      route: args.route,
      text,
    }),
    composition: explicitCompositionFromText(text) ?? compositionForPageLayoutArchetype(layoutArchetype),
    density: inferPageDensity({
      route: args.route,
      text,
    }),
  };
}

function withPageIrDefaults(args: {
  page: PageExportContract;
  route: StudioTaskRoute;
  mission?: StudioPageMission | null;
}): PageExportContract {
  const defaults = inferPageIrDefaults(args);
  return {
    ...args.page,
    layoutArchetype: args.page.layoutArchetype ?? defaults.layoutArchetype,
    visualGrammar: args.page.visualGrammar ?? defaults.visualGrammar,
    composition: args.page.composition ?? defaults.composition,
    density: args.page.density ?? defaults.density,
  };
}

function buildPrimaryExportObjectContract(args: {
  mission: StudioPageMission;
  route: StudioTaskRoute;
}): ExportObjectContract {
  const objectKind = inferExportObjectKind(args);
  const objectId = `p${args.mission.pageNumber}-primary-${slugifyExportObjectId(objectKind)}`;
  const renderTarget = renderTargetForExportObjectKind(objectKind);
  return {
    objectId,
    pageNumber: args.mission.pageNumber,
    pageStory: args.mission.headlineClaim || args.mission.mission,
    primaryVisualObject:
      args.mission.preferredVisual ||
      args.mission.structureCue ||
      args.mission.title ||
      objectKind,
    objectKind,
    objectRole: "primary",
    dataContract: dataContractForExportObjectKind(objectKind, args.mission, args.route),
    renderTarget,
    ownershipScope: {
      rootId: objectId,
      ownsText: objectKind !== "chart-visual" && objectKind !== "native-chart" && objectKind !== "native-table",
      ownsShapes: renderTarget === "editable-shapes" || renderTarget === "visual-snapshot",
      ownsSvg: objectKind === "chart-visual" || objectKind === "matrix" || objectKind === "diagram",
      childRoles: childRolesForExportObjectKind(objectKind),
    },
    forbiddenInterpretation: forbiddenInterpretationForExportObjectKind(objectKind),
  };
}

function buildDeckExportContract(args: {
  pageMissions: StudioPageMission[];
  route: StudioTaskRoute;
}): DeckExportContract {
  return {
    version: 1,
    pages: args.pageMissions.map((mission) => {
      const primaryObject = buildPrimaryExportObjectContract({
        mission,
        route: args.route,
      });
      return withPageIrDefaults({
        route: args.route,
        mission,
        page: {
          pageNumber: mission.pageNumber,
          pageStory: mission.headlineClaim || mission.mission,
          primaryVisualObject: primaryObject.primaryVisualObject,
          primaryObjectId: primaryObject.objectId,
          objects: [primaryObject],
        },
      });
    }),
  };
}

function primaryObjectForPage(page: PageExportContract) {
  return page.objects.find((object) => object.objectId === page.primaryObjectId) ??
    page.objects.find((object) => object.objectRole === "primary") ??
    page.objects[0] ??
    null;
}

function buildSemanticIntentWarnings(args: {
  route: StudioTaskRoute;
  pageMissions: StudioPageMission[];
  exportContract: DeckExportContract;
}): StudioSemanticWarning[] {
  const warnings: StudioSemanticWarning[] = [];
  const missionByPage = new Map(args.pageMissions.map((mission) => [mission.pageNumber, mission]));

  for (const page of args.exportContract.pages) {
    const mission = missionByPage.get(page.pageNumber) ?? null;
    const blueprint = pageIrBlueprintForRoute(args.route, page.pageNumber);
    const primaryObject = primaryObjectForPage(page);
    const text = pageIrText({
      page,
      route: args.route,
      mission,
    });
    const rawPageText = normalizeStudioText([
      blueprint?.rawText,
      mission?.evidenceNotes.join("\n"),
    ].join("\n"));
    const requiredLabels = splitRequiredLabelItems(
      extractExplicitSegmentField(rawPageText, "required(?:\\s+(?:labels?|quadrants?|bridge steps?|phase labels?|side rail))?") ??
      mission?.evidenceNotes.find((note) => /^Required labels:/i.test(note))?.replace(/^Required labels:\s*/i, "") ??
      "",
    );

    if (
      hasBusinessAiContext(text) &&
      (page.visualGrammar === "scientific-figure" || page.visualGrammar === "technical-system")
    ) {
      warnings.push({
        code: "business-ai-scientific-visual-drift",
        severity: "soft-warning",
        pageNumber: page.pageNumber,
        message: "Business AI/cloud/platform page is labeled as scientific or technical-system visual grammar.",
      });
    }

    if (
      hasComparisonGridSignal(text) &&
      !hasTrueMatrixSignal(text) &&
      (page.layoutArchetype === "matrix-first" || primaryObject?.objectKind === "matrix")
    ) {
      warnings.push({
        code: "comparison-grid-mislabeled-as-matrix",
        severity: "soft-warning",
        pageNumber: page.pageNumber,
        message: "A comparison-grid page is still labeled as matrix-first or matrix object.",
      });
    }

    if (requiredLabels.length > 8) {
      warnings.push({
        code: "required-labels-over-budget",
        severity: "soft-warning",
        pageNumber: page.pageNumber,
        message: `Required labels list has ${requiredLabels.length} items; keep 4-8 as required labels and treat the rest as evidence pool.`,
      });
    }
  }

  return warnings;
}

function isChartDataContract(contract: ExportDataContract | null): contract is Extract<
  ExportDataContract,
  { type: `chart-${string}` }
> {
  return Boolean(contract?.type.startsWith("chart-"));
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

function chartDataContractHasMinimumData(contract: Extract<
  ExportDataContract,
  { type: `chart-${string}` }
>) {
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
  return false;
}

function validateExternalExportObjectDataContract(args: {
  pageNumber: number;
  object: ExportObjectContract;
}) {
  const { object } = args;
  const contract = object.dataContract;
  if (contract?.type === "missing-data") {
    throw new Error(
      `External exportContract object ${object.objectId} on page ${args.pageNumber} cannot use missing-data; supply a complete dataContract.`,
    );
  }
  if (object.objectKind === "chart-visual") {
    if (object.renderTarget !== "visual-snapshot") {
      throw new Error(
        `External exportContract object ${object.objectId} must use renderTarget visual-snapshot for chart-visual objects.`,
      );
    }
    if (contract && !isChartDataContract(contract)) {
      throw new Error(
        `External exportContract object ${object.objectId} can only carry chart dataContract metadata for chart-visual objects.`,
      );
    }
    if (contract && !chartDataContractHasMinimumData(contract)) {
      throw new Error(
        `External exportContract object ${object.objectId} must include a complete chart dataContract when chart-visual metadata is supplied.`,
      );
    }
    return;
  }
  if (object.objectKind === "native-chart") {
    throw new Error(
      `External exportContract object ${object.objectId} uses unsupported native-chart export mode; use objectKind chart-visual with renderTarget visual-snapshot.`,
    );
  }
  if (object.renderTarget === "native-chart") {
    throw new Error(
      `External exportContract object ${object.objectId} uses unsupported native-chart renderTarget; use renderTarget visual-snapshot for chart visuals.`,
    );
  }
  if (object.objectKind === "native-table") {
    if (object.renderTarget !== "native-table") {
      throw new Error(
        `External exportContract object ${object.objectId} must use renderTarget native-table for native-table objects.`,
      );
    }
    if (contract?.type !== "table") {
      throw new Error(
        `External exportContract object ${object.objectId} must include a table dataContract.`,
      );
    }
    return;
  }
  if (object.objectKind === "matrix") {
    if (object.renderTarget !== "editable-shapes") {
      throw new Error(
        `External exportContract object ${object.objectId} must use renderTarget editable-shapes for matrix objects.`,
      );
    }
    if (contract?.type !== "matrix") {
      throw new Error(
        `External exportContract object ${object.objectId} must include a matrix dataContract.`,
      );
    }
    if (!object.forbiddenInterpretation.includes("native-table")) {
      throw new Error(
        `External exportContract object ${object.objectId} must forbid native-table interpretation for matrix objects.`,
      );
    }
    return;
  }
  if (contract && (isChartDataContract(contract) || contract.type === "table" || contract.type === "matrix")) {
    throw new Error(
      `External exportContract object ${object.objectId} dataContract ${contract.type} is incompatible with objectKind ${object.objectKind}.`,
    );
  }
}

function normalizeExternalPageExportContract(args: {
  page: DeckExportContract["pages"][number];
  route: StudioTaskRoute;
  mission?: StudioPageMission | null;
}): DeckExportContract["pages"][number] {
  const seenObjectIds = new Set<string>();
  for (const object of args.page.objects) {
    validateExternalExportObjectDataContract({
      pageNumber: args.page.pageNumber,
      object,
    });
    if (seenObjectIds.has(object.objectId)) {
      throw new Error(
        `External exportContract page ${args.page.pageNumber} has duplicate objectId ${object.objectId}.`,
      );
    }
    seenObjectIds.add(object.objectId);
  }

  const primaryObjectId = args.page.primaryObjectId?.trim() || null;
  const primaryRoleObjects = args.page.objects.filter((object) => object.objectRole === "primary");
  if (primaryRoleObjects.length > 1) {
    throw new Error(
      `External exportContract page ${args.page.pageNumber} has multiple primary objects: ${primaryRoleObjects
        .map((object) => object.objectId)
        .join(", ")}.`,
    );
  }

  const resolvedPrimaryId =
    primaryObjectId ??
    primaryRoleObjects[0]?.objectId ??
    (args.page.objects.length === 1 && !args.page.objects[0]?.objectRole
      ? args.page.objects[0]?.objectId
      : null);

  if (!resolvedPrimaryId) {
    throw new Error(
      `External exportContract page ${args.page.pageNumber} must declare primaryObjectId or exactly one primary object.`,
    );
  }
  const primaryObject = args.page.objects.find((object) => object.objectId === resolvedPrimaryId);
  if (!primaryObject) {
    throw new Error(
      `External exportContract page ${args.page.pageNumber} primaryObjectId ${resolvedPrimaryId} does not match any object.`,
    );
  }
  if (primaryObject.objectRole && primaryObject.objectRole !== "primary") {
    throw new Error(
      `External exportContract page ${args.page.pageNumber} object ${resolvedPrimaryId} cannot be both primaryObjectId and ${primaryObject.objectRole}.`,
    );
  }
  if (primaryRoleObjects[0] && primaryRoleObjects[0].objectId !== resolvedPrimaryId) {
    throw new Error(
      `External exportContract page ${args.page.pageNumber} primaryObjectId ${resolvedPrimaryId} conflicts with primary object ${primaryRoleObjects[0].objectId}.`,
    );
  }

  return withPageIrDefaults({
    route: args.route,
    mission: args.mission,
    page: {
      ...args.page,
      primaryObjectId: resolvedPrimaryId,
      objects: args.page.objects.map((object) => ({
        ...object,
        objectRole: object.objectId === resolvedPrimaryId ? "primary" : object.objectRole ?? "secondary",
      })),
    },
  });
}

export function resolveExternalDeckExportContract(args: {
  external?: DeckExportContract | null;
  inferred: DeckExportContract;
  pageCount: number;
  route: StudioTaskRoute;
  pageMissions?: StudioPageMission[];
}): DeckExportContract {
  if (!args.external) {
    return args.inferred;
  }

  const external = deckExportContractSchema.parse(args.external);
  if (external.pages.length !== args.pageCount) {
    throw new Error(
      `External exportContract page count mismatch: expected ${args.pageCount}, received ${external.pages.length}.`,
    );
  }

  const seenPageNumbers = new Set<number>();
  for (const page of external.pages) {
    if (seenPageNumbers.has(page.pageNumber)) {
      throw new Error(`External exportContract has duplicate page number ${page.pageNumber}.`);
    }
    seenPageNumbers.add(page.pageNumber);

    for (const object of page.objects) {
      if (object.pageNumber !== page.pageNumber) {
        throw new Error(
          `External exportContract object ${object.objectId} declares pageNumber ${object.pageNumber} but belongs to page ${page.pageNumber}.`,
        );
      }
    }
  }

  const missingPageNumbers: number[] = [];
  for (let pageNumber = 1; pageNumber <= args.pageCount; pageNumber += 1) {
    if (!seenPageNumbers.has(pageNumber)) {
      missingPageNumbers.push(pageNumber);
    }
  }
  if (missingPageNumbers.length > 0) {
    throw new Error(
      `External exportContract missing page coverage for page(s): ${missingPageNumbers.join(", ")}.`,
    );
  }

  return {
    ...external,
    pages: external.pages.map((page) =>
      normalizeExternalPageExportContract({
        page,
        route: args.route,
        mission: args.pageMissions?.find((mission) => mission.pageNumber === page.pageNumber) ?? null,
      })),
  };
}

export function buildDeterministicStudioPreflightPlan(args: {
  brief: string;
  requestedPageCount?: number | null;
  route?: StudioTaskRoute | null;
  exportContract?: DeckExportContract | null;
}): StudioPreflightPlan {
  const rawInputs = createRawBriefThinkingInputs(args.brief);
  const requestedPageCount = resolveRequestedPageCountForExportContract({
    requestedPageCount: args.requestedPageCount,
    exportContract: args.exportContract,
  });
  const workingMemory = buildStudioWorkingMemory({
    brief: args.brief,
    inputs: rawInputs,
    requestedPageCount,
  });
  const pageCount = detectRequestedPageCount(args.brief, requestedPageCount);
  const route =
    args.route ??
    resolveStudioTaskRoute({
      brief: args.brief,
      requestedPageCount,
    });
  const evidenceTier: StudioEvidenceTier =
    route.capabilities.sourceBacked
      ? "source-backed"
      : route.primaryKind === "ambiguous-brief"
        ? "explicit assumption"
        : inferEvidenceTierFromWorkingMemory(workingMemory);
  const deterministicPageMissions =
    route.primaryKind === "ambiguous-brief"
      ? buildAmbiguousBriefPageMissions({
          brief: args.brief,
          memory: workingMemory,
          pageCount,
        }).map((mission) => sanitizeMission(mission, mission.pageNumber))
      : buildDeterministicPageMissions({
          brief: args.brief,
          memory: workingMemory,
          pageCount,
          evidenceTier,
        }).map((mission) => sanitizeMission(mission, mission.pageNumber));
  const pageMissions = normalizeDeckPageMissions({
    brief: args.brief,
    pageCount,
    subject: workingMemory.primaryObject,
    evidenceTier,
    inputPageMissions: deterministicPageMissions,
    deterministicPageMissions,
  });
  const inferredExportContract = buildDeckExportContract({
    pageMissions,
    route,
  });
  const exportContract = resolveExternalDeckExportContract({
    external: args.exportContract,
    inferred: inferredExportContract,
    pageCount,
    route,
    pageMissions,
  });
  const semanticWarnings = buildSemanticIntentWarnings({
    route,
    pageMissions,
    exportContract,
  });

  return {
    rawBrief: args.brief,
    route,
    subject:
      route.primaryKind === "ambiguous-brief"
        ? resolveAmbiguousBriefSubject(workingMemory.primaryObject, args.brief)
        : sanitizeDeterministicSubject(
            workingMemory.primaryObject || compactBoardTitle(args.brief, "Core subject", 6),
            args.brief,
          ),
    deliverable: workingMemory.deliverable || (pageCount === 1 ? "1-page PPT" : `${pageCount}-page PPT`),
    pageCount,
    audienceOrQualityBar: workingMemory.audienceBar,
    coreTask:
      route.primaryKind === "ambiguous-brief"
        ? "Resolve a sparse presentation request with explicit assumptions and no invented evidence."
        : deriveCoreTaskFromMemory(workingMemory),
    evidencePolicy: {
      tier: evidenceTier,
      summary:
        evidenceTier === "source-backed"
          ? "The brief includes evidence that can support source-backed claims."
          : evidenceTier === "axiomatic/common-knowledge"
            ? "The brief is sparse, so complete the page with broad common knowledge and explicit discipline."
            : "The brief needs clearly labeled assumptions rather than hard-evidence language.",
      lines:
        evidenceTier === "source-backed"
          ? [
              "Use evidence directly present in the raw brief.",
              "Citations, newer facts, and hard metrics need direct support from the raw brief.",
            ]
          : [
              "You may complete the page with broad common knowledge and explicit assumptions.",
              "Present assumptions as assumptions and keep sparse evidence qualitative.",
            ],
    },
    pageMissions,
    visualThinking: buildDeterministicVisualThinking({
      memory: workingMemory,
      route,
    }),
    capabilityActivations: buildRouteCapabilityActivations(route),
    assumptionPolicy:
      evidenceTier === "source-backed"
        ? ["Keep claims tied to the raw brief's evidence; extra hard facts need source support."]
        : [
            "If the page needs completion, use assumption-labeled or qualitative framing.",
            "Citations, exact financials, market shares, and recent factual claims require supplied source support.",
          ],
    exportContract,
    semanticWarnings,
  };
}

function mapEvidenceSourceFromTier(tier: StudioEvidenceTier): StudioBriefSynthesis["evidenceSourceUsed"] {
  switch (tier) {
    case "source-backed":
      return "source-material";
    case "axiomatic/common-knowledge":
      return "safe-common-sense";
    case "explicit assumption":
      return "safe-common-sense";
    default:
      return "none";
  }
}

function mapConfidenceFromTier(tier: StudioEvidenceTier): StudioBriefSynthesis["contentConfidence"] {
  switch (tier) {
    case "source-backed":
      return "source-backed";
    case "axiomatic/common-knowledge":
      return "sparse-safe-common-sense";
    case "explicit assumption":
      return "sparse-safe-common-sense";
    default:
      return "insufficient";
  }
}

function buildEvidenceDigestFromRawBrief(brief: string, tier: StudioEvidenceTier) {
  if (tier !== "source-backed") {
    return [];
  }
  return uniqueStrings(
    [...splitBriefLines(brief), ...splitBriefSentences(brief)]
      .map((line) => stripInstructionalLead(line))
      .filter(Boolean)
      .map((line) => clampText(line, 140)),
  ).slice(0, 6);
}

export function buildPreflightEvidenceInput(args: {
  brief: string;
  preflight: StudioPreflightPlan;
}) {
  if (args.preflight.evidencePolicy.tier !== "source-backed") {
    return "";
  }
  return args.brief;
}

export function mergeStudioPreflightIntoBriefSynthesis(args: {
  synthesis: StudioBriefSynthesis;
  preflight: StudioPreflightPlan;
  rawBrief: string;
}): StudioBriefSynthesis {
  const mappedEvidenceRegime = mapEvidenceTierToEvidenceRegime(args.preflight.evidencePolicy.tier);
  const mergedWorkingMemory: StudioWorkingMemory = {
    ...args.synthesis.workingMemory,
    rawBrief: args.preflight.rawBrief,
    primaryObject: args.preflight.subject || args.synthesis.workingMemory.primaryObject,
    deliverable: args.preflight.deliverable || args.synthesis.workingMemory.deliverable,
    audienceBar: args.preflight.audienceOrQualityBar ?? args.synthesis.workingMemory.audienceBar,
    evidenceRegime: mappedEvidenceRegime,
    currentPageMission: args.preflight.pageMissions.map((mission) => mission.mission).slice(0, 3),
    evidenceBoundary: uniqueStrings([
      ...args.preflight.evidencePolicy.lines,
      ...args.preflight.assumptionPolicy,
    ]).slice(0, 4),
  };

  return {
    ...args.synthesis,
    workingMemory: mergedWorkingMemory,
    taskGoal: args.preflight.coreTask || args.synthesis.taskGoal,
    subject: args.preflight.subject || args.synthesis.subject,
    deliverable: args.preflight.deliverable || args.synthesis.deliverable,
    contentConfidence: mapConfidenceFromTier(args.preflight.evidencePolicy.tier),
    safeKnowledgePolicy: uniqueStrings([
      `Raw brief first: keep the deck anchored to ${args.preflight.subject || args.synthesis.subject}.`,
      ...(args.preflight.audienceOrQualityBar ? [`Audience or quality bar: ${args.preflight.audienceOrQualityBar}.`] : []),
      ...args.preflight.evidencePolicy.lines,
      ...args.preflight.assumptionPolicy,
    ]).slice(0, 6),
    sourceMaterialDigest: buildEvidenceDigestFromRawBrief(args.rawBrief, args.preflight.evidencePolicy.tier),
    evidenceCandidates: buildEvidenceDigestFromRawBrief(args.rawBrief, args.preflight.evidencePolicy.tier),
    pageIntents:
      args.preflight.pageMissions.length > 0
        ? args.preflight.pageMissions.map((mission) => ({
            pageNumber: mission.pageNumber,
            pageTitle: mission.title,
            pageQuestion: mission.mission,
            headlineClaim: mission.headlineClaim,
            supportBullets: mission.supportPoints.slice(0, 2),
            evidenceCallouts: mission.evidenceNotes.slice(0, 2),
            takeaway: mission.evidenceNotes[0] ?? mission.mission,
          }))
        : args.synthesis.pageIntents,
    evidenceInputText: buildPreflightEvidenceInput({
      brief: args.rawBrief,
      preflight: args.preflight,
    }),
    evidenceSourceUsed: mapEvidenceSourceFromTier(args.preflight.evidencePolicy.tier),
    sparseBriefMode: args.preflight.evidencePolicy.tier !== "source-backed",
    structuredSparseMode:
      args.preflight.evidencePolicy.tier !== "source-backed" && args.synthesis.workloadLane === "deep",
  };
}

export function findStudioPageMission(args: {
  preflight: StudioPreflightPlan;
  pageNumber: number;
  fallbackTitle?: string | null;
  fallbackMission?: string | null;
}) {
  const mission =
    args.preflight.pageMissions.find((entry) => entry.pageNumber === args.pageNumber) ??
    null;
  if (!mission) {
    return {
      pageNumber: args.pageNumber,
      title: clampText(args.fallbackTitle || `Page ${args.pageNumber}`, 80),
      mission: clampText(args.fallbackMission || "Resolve one clear page mission.", 220),
      headlineClaim: clampText(args.fallbackMission || "Land one clear page claim.", 220),
      supportPoints: [],
      evidenceNotes: args.preflight.evidencePolicy.lines.slice(0, 2),
      preferredVisual: null,
      missionScope: "page",
      structureCue: null,
    } satisfies StudioPageMission;
  }

  return mission;
}

export function buildVisualThinkingLines(args: {
  preflight: StudioPreflightPlan;
  visualOperatorLines?: string[];
  freeformLayoutPlan?: FreeformLayoutPlan | null;
  preferredVisual?: string | null;
  structureCue?: StudioPageMission["structureCue"];
  heroModelIntent?: HeroModelIntent | null;
  wowPage?: boolean;
}) {
  if (args.heroModelIntent?.enabled) {
    return [
      args.wowPage
        ? "Dominant visual anchor: one fabricated pseudo-3D hero object with visible depth, internal structure, and premium surface treatment."
        : "Dominant visual anchor: one fabricated pseudo-3D hero object with visible depth and internal structure.",
      args.wowPage
        ? "Reading path: object first, then headline claim, then elegant compact annotations and support."
        : "Reading path: object first, then headline claim, then compact annotations and support.",
      args.wowPage
        ? "Region strategy: hero-object-first composition with one memorable spatial gesture and only slim peripheral narrative."
        : "Region strategy: hero-object-first composition with the object taking most of the page and only slim peripheral narrative.",
      args.wowPage
        ? "Density posture: crafted, premium, object-heavy, with negative space and material contrast doing real work."
        : "Density posture: object-heavy, sparse text, compact annotations, and no competing regions.",
      ...(args.wowPage
        ? ["Craft note: refine surfaces, shadow discipline, and callout placement until the object feels designed, not merely arranged."]
        : []),
      "Watch-out: flat cards, dashboard tiles, glass panels, shallow neumorphism, or generic left-right explainers.",
      ...(args.heroModelIntent.recommendedCompositionFamily
        ? [`3D composition family: ${args.heroModelIntent.recommendedCompositionFamily}.`]
        : []),
      ...(args.heroModelIntent.objectFamily ? [`3D object family: ${args.heroModelIntent.objectFamily}.`] : []),
      ...(args.visualOperatorLines ?? []).slice(0, 2),
    ].map((line) => clampText(line, 220));
  }

  if (args.structureCue === "matrix" || args.structureCue === "quadrant") {
    return [
      "Dominant visual anchor: one BCG-style 2x2 matrix occupying the main page field.",
      "Reading path: headline claim -> axis frame -> quadrant placement -> short takeaway.",
      "Region strategy: let the matrix own the page, with only a compact label or takeaway zone outside it.",
      "Density posture: figure-first, spatially simple, and disciplined enough to stay out of memo-opener territory.",
      "Watch-out: poster-claim openers, request-understanding cards, generic split layouts, or narrative summary boxes that replace the matrix itself.",
      ...(args.visualOperatorLines ?? []).slice(0, 2),
    ].map((line) => clampText(line, 220));
  }

  const visualThinking = args.preflight.visualThinking;
  const freeformLines = args.freeformLayoutPlan
    ? [
        `Freeform family: ${args.freeformLayoutPlan.layoutFamily}.`,
        `Anchor the page around ${args.freeformLayoutPlan.visualAnchor}.`,
      ]
    : [];

  return [
    `Dominant visual anchor: ${args.preferredVisual ?? visualThinking.dominantVisualAnchor}.`,
    `Reading path: ${visualThinking.readingPath}.`,
    args.wowPage
      ? `Region strategy: lead with one memorable visual gesture and one compact support region; ${visualThinking.regionStrategy}.`
      : `Region strategy: ${visualThinking.regionStrategy}.`,
    args.wowPage
      ? "Density posture: crafted, deliberate, premium, and spacious enough for negative space to do real compositional work."
      : `Density posture: ${visualThinking.densityPosture}.`,
    ...(args.wowPage
      ? ["Craft note: refine typography tension, surface contrast, shadow discipline, and annotation placement until the page feels intentional."]
      : []),
    `Watch-out: ${visualThinking.avoidPattern}.`,
    ...freeformLines,
    ...(args.visualOperatorLines ?? []).slice(0, 2),
  ].map((line) => clampText(line, 220));
}

export function buildPreflightCapabilityCards(args: {
  preflight: StudioPreflightPlan;
  baseCards?: StudioCapabilityCard[];
  forceKinds?: StudioCapabilityActivation["kind"][];
}) {
  const baseCards = args.baseCards ?? [];
  const activeKinds = new Set([
    ...args.preflight.capabilityActivations.map((item) => item.kind),
    ...(args.forceKinds ?? []),
  ]);
  return baseCards.filter((card) => {
    if (card.id === "explicit-3d") {
      return activeKinds.has("3d");
    }
    if (card.id === "chart") {
      return activeKinds.has("chart") || activeKinds.has("data-visualization");
    }
    if (card.id === "template") {
      return activeKinds.has("template");
    }
    if (card.id === "style-direction") {
      return true;
    }
    if (card.id === "craft-direction") {
      return true;
    }
    if (card.id === "composition-direction") {
      return activeKinds.has("template");
    }
    return false;
  });
}
