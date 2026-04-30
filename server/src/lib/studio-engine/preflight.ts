import type {
  DeckExportContract,
  ExportObjectContract,
  ExportObjectKind,
  ExportRenderTarget,
  FreeformLayoutPlan,
  HeroModelIntent,
  SegmentedThinkingInputs,
  StudioBriefSynthesis,
  StudioCapabilityActivation,
  StudioCapabilityCard,
  StudioEvidenceRegime,
  StudioEvidenceTier,
  StudioPageMission,
  StudioPreflightPlan,
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
  return /\b(?:chart|graph|bar chart|line chart|waterfall|visualize|figure|matrix|quadrant|2x2|bcg)\b/i.test(
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
  /(?:\bchart\b|\bgraph\b|\bbar chart\b|\bline chart\b|\bwaterfall\b|\bfigure\b|\bvisualize\b)/i;
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

function normalizeStructureCue(
  value: string | null | undefined,
  combinedText: string,
): StudioPageMission["structureCue"] {
  const normalized = normalizeStudioText(value ?? "").toLowerCase();
  if (normalized.includes("quadrant")) {
    return "quadrant";
  }
  if (normalized.includes("matrix") || normalized.includes("bcg")) {
    return "matrix";
  }
  if (normalized.includes("chart")) {
    return "chart";
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
    supportPoints: uniqueStrings((mission.supportPoints ?? []).map((line) => clampText(line, 120))).slice(0, 2),
    evidenceNotes: uniqueStrings((mission.evidenceNotes ?? []).map((line) => clampText(line, 120))).slice(0, 2),
    preferredVisual: clampText(
      mission.preferredVisual || buildPreferredVisualFromStructureCue(structureCue) || "",
      60,
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
    "Do not turn this page into a deck-wide overview or request-understanding card.",
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

function buildMissionFromExplicitPageSegment(args: {
  segment: ExplicitPageSegment;
  subject: string;
  evidenceTier: StudioEvidenceTier;
}) {
  const structureCue = normalizeStructureCue(undefined, args.segment.text);
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
      ? `Frame ${safeSubject} through one BCG-style 2x2 matrix focused on ${scopedSegmentSummary}.`
      : structureCue === "chart"
        ? `Explain one chart-led evidence view focused on ${scopedSegmentSummary}.`
        : /\b(?:3d|three-dimensional)\b/i.test(args.segment.text) || /(?:3D|三维|立体|建模)/i.test(args.segment.text)
          ? `Explain one 3D-model-centered page focused on ${scopedSegmentSummary}.`
          : `Resolve page ${args.segment.pageNumber} around: ${clampText(args.segment.text, 140)}.`;
  const headlineClaim =
    structureCue === "matrix" || structureCue === "quadrant"
      ? `${titleSubject} should be positioned through one quadrant matrix that specifically answers ${scopedSegmentSummary}.`
      : structureCue === "chart"
        ? `The page should use one chart-led proof pattern to answer ${scopedSegmentSummary}.`
        : /\b(?:3d|three-dimensional)\b/i.test(args.segment.text) || /(?:3D|三维|立体|建模)/i.test(args.segment.text)
          ? `The page should use one dominant 3D product or system model focused on ${scopedSegmentSummary}.`
          : clampText(args.segment.text, 180);

  return sanitizeMission(
    {
      pageNumber: args.segment.pageNumber,
      title,
      mission,
      headlineClaim,
      supportPoints: buildExplicitSegmentSupportPoints({
        segment: args.segment.text,
        structureCue,
      }),
      evidenceNotes: buildExplicitSegmentEvidenceNotes({
        structureCue,
        evidenceTier: args.evidenceTier,
      }),
      preferredVisual: buildPreferredVisualFromStructureCue(structureCue),
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
      const has3dCue = hasExplicitThreeDimensionalRequest(segment.text);
      const hasFlowCue = hasProcessFlowRequest(segment.text);
      return {
        pageNumber: segment.pageNumber,
        title: resolveExplicitMissionTitle({
          segment: segment.text,
          pageNumber: segment.pageNumber,
          subject: "",
          structureCue,
        }),
        storyClaim: clampText(segment.text, 180),
        evidenceNotes: [],
        layoutCue: has3dCue ? "3d" : hasFlowCue ? "flow" : structureCue,
        primaryVisual:
          has3dCue
            ? "explicit 3D hero object"
            : hasFlowCue
              ? "structured flow or swimlane map"
              : buildPreferredVisualFromStructureCue(structureCue),
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

function inferExportObjectKind(args: {
  mission: StudioPageMission;
  route: StudioTaskRoute;
}): ExportObjectKind {
  const blueprint = args.route.pageBlueprint.find(
    (entry) => entry.pageNumber === args.mission.pageNumber,
  );
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

  if (
    args.mission.structureCue === "matrix" ||
    args.mission.structureCue === "quadrant" ||
    /\b(?:matrix|quadrant|2x2|bcg)\b/i.test(haystack) ||
    /(?:矩阵|矩陣|四象限|二维|二維)/i.test(haystack)
  ) {
    return "matrix";
  }
  if (
    args.mission.structureCue === "chart" ||
    /\b(?:chart|graph|plot|bar|line|waterfall|combo|bubble|series|axis|trend)\b/i.test(haystack) ||
    /(?:图表|圖表|柱状图|柱狀圖|折线图|折線圖|瀑布图|瀑布圖|气泡图|氣泡圖|走势图|走勢圖)/i.test(haystack)
  ) {
    return "native-chart";
  }
  if (
    /\b(?:native table|data table|table with rows|rows and columns|financial table)\b/i.test(haystack) ||
    /(?:原生表格|数据表|資料表|明细表|明細表|表格.{0,8}行列|行列.{0,8}表格)/i.test(haystack)
  ) {
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

function dataContractForExportObjectKind(kind: ExportObjectKind, mission: StudioPageMission) {
  if (kind === "native-chart") {
    return {
      expected: "chart-spec",
      source: mission.structureCue === "chart" ? "structure-cue" : "visual-cue",
      requiredFields: ["categories", "series"],
    };
  }
  if (kind === "native-table") {
    return {
      expected: "table-spec",
      requiredFields: ["columns", "rows"],
    };
  }
  if (kind === "matrix") {
    return {
      expected: "matrix-object",
      nativeTableAllowed: false,
    };
  }
  return null;
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
    dataContract: dataContractForExportObjectKind(objectKind, args.mission),
    renderTarget,
    ownershipScope: {
      rootId: objectId,
      ownsText: objectKind !== "native-chart" && objectKind !== "native-table",
      ownsShapes: renderTarget === "editable-shapes",
      ownsSvg: objectKind === "matrix" || objectKind === "diagram",
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
      return {
        pageNumber: mission.pageNumber,
        pageStory: mission.headlineClaim || mission.mission,
        primaryVisualObject: primaryObject.primaryVisualObject,
        objects: [primaryObject],
      };
    }),
  };
}

export function resolveExternalDeckExportContract(args: {
  external?: DeckExportContract | null;
  inferred: DeckExportContract;
  pageCount: number;
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

  return external;
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
              "Do not invent citations, newer facts, or unsupported metrics.",
            ]
          : [
              "You may complete the page with broad common knowledge and explicit assumptions.",
              "Do not present assumptions as source-backed truth or precise market data.",
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
        ? ["Keep claims tied to the raw brief's evidence and do not invent extra hard facts."]
        : [
            "If the page needs completion, use assumption-labeled or qualitative framing.",
            "Never fabricate citations, exact financials, market shares, or recent factual claims.",
          ],
    exportContract,
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
      "Avoid pattern: flat cards, dashboard tiles, glass panels, shallow neumorphism, or generic left-right explainers.",
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
      "Density posture: figure-first, spatially simple, and disciplined enough to avoid turning the page into a memo opener.",
      "Avoid pattern: poster-claim openers, request-understanding cards, generic split layouts, or narrative summary boxes that replace the matrix itself.",
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
    `Avoid pattern: ${visualThinking.avoidPattern}.`,
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
