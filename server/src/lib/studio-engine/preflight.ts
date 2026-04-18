import type {
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
import { extractJsonDocument } from "./render.js";
import { buildStudioWorkingMemory } from "./working-memory.js";
import { extractRequestedDeckPageCount } from "./page-count.js";

function detectRequestedPageCount(brief: string, requestedPageCount?: number | null) {
  return extractRequestedDeckPageCount(brief, requestedPageCount) ?? 1;
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

function matchesThreeDimensionalCue(value: string | undefined) {
  const normalized = normalizeStudioText(value ?? "").toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes("3d") ||
    normalized.includes("three dimensional") ||
    normalized.includes("three-dimensional") ||
    normalized.includes("pseudo 3d") ||
    normalized.includes("pseudo-3d") ||
    normalized.includes("hero model") ||
    normalized.includes("hero-model") ||
    normalized.includes("cutaway") ||
    normalized.includes("exploded view") ||
    normalized.includes("exploded stack") ||
    normalized.includes("exploded")
  );
}

function hasExplicitChartRequest(brief: string) {
  return /\b(?:chart|graph|bar chart|line chart|waterfall|visualize|figure|matrix|quadrant|2x2|bcg)\b/i.test(
    brief,
  ) || /(?:矩阵|矩陣|四象限|波士顿矩阵|波士頓矩陣|BCG矩阵|BCG矩陣|二维矩阵|二維矩陣)/i.test(brief);
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

function sanitizeFallbackSubject(value: string, brief: string) {
  const cleaned = normalizeStudioText(value)
    .replace(/\bfor\s+(?:a|an|the)$/i, "")
    .replace(/\bto\s+(?:do|make|create|build|prepare)$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || compactBoardTitle(brief, "Core subject", 6);
}

function buildFallbackVisualThinking(memory: StudioWorkingMemory): StudioVisualThinking {
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

function buildFallbackCapabilityActivations(args: {
  brief: string;
  memory: StudioWorkingMemory;
}): StudioCapabilityActivation[] {
  return [
    {
      kind: "style",
      reason: "Every page still needs a coherent professional visual system.",
      lines: ["Use a coherent, presentation-grade visual language with strong hierarchy and intentional spacing."],
    },
    ...(hasExplicitThreeDimensionalRequest(args.brief)
      ? [
          {
            kind: "3d" as const,
            reason: "The brief explicitly requests 3D treatment.",
            lines: [
              "Treat the page as one fabricated 3D hero object, not a flat UI composition.",
              "Show perspective, visible thickness, overlap or occlusion, and cutaway or exploded layer logic.",
              "Let the object dominate the page and keep copy peripheral.",
              "Do not resolve as floating cards, glass panels, dashboard tiles, or shallow neumorphic surfaces.",
            ],
          },
        ]
      : []),
    ...(hasExplicitChartRequest(args.brief)
      ? [
          {
            kind: "chart" as const,
            reason: "The brief explicitly requests a chart or figure.",
            lines: ["Use a chart only when the page has real quantitative evidence or a clearly labeled assumption frame."],
          },
        ]
      : []),
    {
      kind: "freeform-layout",
      reason: "No template is guaranteed, so layout must stay content-led.",
      lines: ["Choose a composition from the page mission instead of defaulting to a left/right split."],
    },
  ];
}

function buildFallbackPageMission(args: {
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
        ? `Close the same ${subject} story without adding a new thesis.`
        : `Add one focused proof step for ${subject}.`,
      headlineClaim: isLast
        ? `${subject} should close on the same through-line, not a new argument.`
        : `${subject} is best supported through one focused proof pattern per page.`,
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

function sanitizeMission(mission: StudioPageMission, pageNumber: number): StudioPageMission {
  const combinedText = [mission.title, mission.mission, mission.headlineClaim, mission.preferredVisual]
    .filter(Boolean)
    .join(" ");
  const structureCue = normalizeStructureCue(mission.structureCue, combinedText);
  return {
    pageNumber,
    title: clampText(mission.title || `Page ${pageNumber}`, 80),
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

function extractExplicitPageSegments(brief: string, pageCount: number) {
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
  const normalizedSegment = normalizeStudioText(args.segment);
  for (const entry of PAGE_ROLE_TITLE_PATTERNS) {
    if (entry.pattern.test(args.segment) || entry.pattern.test(normalizedSegment)) {
      return entry.title;
    }
  }

  const shortSubject = compactBoardTitle(args.subject, "Core subject", 4);
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
  const title = resolveExplicitMissionTitle({
    segment: args.segment.text,
    pageNumber: args.segment.pageNumber,
    subject: args.subject,
    structureCue,
  });
  const mission =
    structureCue === "matrix" || structureCue === "quadrant"
      ? `Frame ${args.subject || "the subject"} through one BCG-style 2x2 matrix.`
      : structureCue === "chart"
        ? `Explain ${args.subject || "the subject"} through one chart-led evidence view.`
        : /\b(?:3d|three-dimensional)\b/i.test(args.segment.text) || /(?:3D|三维|立体|建模)/i.test(args.segment.text)
          ? `Explain ${args.subject || "the subject"} through one 3D-model-centered page.`
          : `Resolve page ${args.segment.pageNumber} around: ${clampText(args.segment.text, 140)}.`;
  const headlineClaim =
    structureCue === "matrix" || structureCue === "quadrant"
      ? `${args.subject || "The subject"} should be positioned through one quadrant matrix before deeper explanation.`
      : structureCue === "chart"
        ? `${args.subject || "The subject"} is best supported through one chart-led proof pattern.`
        : /\b(?:3d|three-dimensional)\b/i.test(args.segment.text) || /(?:3D|三维|立体|建模)/i.test(args.segment.text)
          ? `${args.subject || "The subject"} is best explained through one dominant 3D product or system model.`
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

function fingerprintStudioPageMission(mission: StudioPageMission) {
  return normalizeStudioText([mission.title, mission.mission, mission.headlineClaim].join(" "))
    .toLowerCase()
    .replace(EXPLICIT_PAGE_MARKER_PATTERN, " ")
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
  fallbackPageMissions: StudioPageMission[];
}) {
  const explicitSegments = extractExplicitPageSegments(args.brief, args.pageCount);
  const fallbackByPage = new Map(
    args.fallbackPageMissions.map((mission) => [mission.pageNumber, sanitizeMission(mission, mission.pageNumber)]),
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
      fallbackByPage.get(pageNumber) ??
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
        fallbackByPage.get(pageNumber) ??
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

export function buildFallbackStudioPreflightPlan(args: {
  brief: string;
  requestedPageCount?: number | null;
}): StudioPreflightPlan {
  const rawInputs = createRawBriefThinkingInputs(args.brief);
  const workingMemory = buildStudioWorkingMemory({
    brief: args.brief,
    inputs: rawInputs,
    requestedPageCount: args.requestedPageCount,
  });
  const pageCount = detectRequestedPageCount(args.brief, args.requestedPageCount);
  const evidenceTier = inferEvidenceTierFromWorkingMemory(workingMemory);
  const fallbackPageMissions = buildFallbackPageMission({
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
    inputPageMissions: fallbackPageMissions,
    fallbackPageMissions,
  });

  return {
    rawBrief: args.brief,
    subject: sanitizeFallbackSubject(
      workingMemory.primaryObject || compactBoardTitle(args.brief, "Core subject", 6),
      args.brief,
    ),
    deliverable: workingMemory.deliverable || (pageCount === 1 ? "1-page PPT" : `${pageCount}-page PPT`),
    pageCount,
    audienceOrQualityBar: workingMemory.audienceBar,
    coreTask: deriveCoreTaskFromMemory(workingMemory),
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
    visualThinking: buildFallbackVisualThinking(workingMemory),
    capabilityActivations: buildFallbackCapabilityActivations({
      brief: args.brief,
      memory: workingMemory,
    }),
    assumptionPolicy:
      evidenceTier === "source-backed"
        ? ["Keep claims tied to the raw brief's evidence and do not invent extra hard facts."]
        : [
            "If the page needs completion, use assumption-labeled or qualitative framing.",
            "Never fabricate citations, exact financials, market shares, or recent factual claims.",
          ],
  };
}

type ParsedPreflightPayload = Partial<StudioPreflightPlan> & {
  evidencePolicy?: Partial<StudioPreflightPlan["evidencePolicy"]>;
  visualThinking?: Partial<StudioVisualThinking>;
  capabilityActivations?: Array<Partial<StudioCapabilityActivation>>;
  pageMissions?: Array<Partial<StudioPageMission>>;
};

function normalizeEvidenceTier(value: string | undefined, fallback: StudioEvidenceTier): StudioEvidenceTier {
  const normalized = normalizeStudioText(value ?? "").toLowerCase();
  if (normalized.includes("source")) {
    return "source-backed";
  }
  if (normalized.includes("axiomatic") || normalized.includes("common")) {
    return "axiomatic/common-knowledge";
  }
  if (normalized.includes("assumption")) {
    return "explicit assumption";
  }
  return fallback;
}

function normalizeCapabilityKind(value: string | undefined): StudioCapabilityActivation["kind"] | null {
  const normalized = normalizeStudioText(value ?? "").toLowerCase();
  if (!normalized) {
    return null;
  }
  if (matchesThreeDimensionalCue(normalized)) {
    return "3d";
  }
  if (normalized.includes("chart") || normalized.includes("matrix") || normalized.includes("quadrant") || normalized.includes("bcg")) {
    return "chart";
  }
  if (normalized.includes("template")) {
    return "template";
  }
  if (normalized.includes("data")) {
    return "data-visualization";
  }
  if (normalized.includes("layout")) {
    return "freeform-layout";
  }
  return "style";
}

function sanitizeVisualThinking(
  value: Partial<StudioVisualThinking> | undefined,
  fallback: StudioVisualThinking,
): StudioVisualThinking {
  return {
    dominantVisualAnchor: clampText(value?.dominantVisualAnchor || fallback.dominantVisualAnchor, 140),
    readingPath: clampText(value?.readingPath || fallback.readingPath, 140),
    regionStrategy: clampText(value?.regionStrategy || fallback.regionStrategy, 180),
    densityPosture: clampText(value?.densityPosture || fallback.densityPosture, 120),
    avoidPattern: clampText(value?.avoidPattern || fallback.avoidPattern, 140),
  };
}

function sanitizeCapabilityActivations(
  value: Array<Partial<StudioCapabilityActivation>> | undefined,
  fallback: StudioCapabilityActivation[],
): StudioCapabilityActivation[] {
  const items = (value ?? [])
    .map((entry) => {
      const kind = normalizeCapabilityKind(typeof entry.kind === "string" ? entry.kind : "");
      const reason = clampText(String(entry.reason ?? "").trim(), 180);
      if (!kind || !reason) {
        return null;
      }
      return {
        kind,
        reason,
        lines: uniqueStrings((entry.lines ?? []).map((line) => clampText(String(line ?? ""), 160))).slice(0, 3),
      } satisfies StudioCapabilityActivation;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return items.length > 0 ? items : fallback;
}

export function parseStudioPreflightPlan(args: {
  text: string;
  brief: string;
  requestedPageCount?: number | null;
}): StudioPreflightPlan {
  const fallback = buildFallbackStudioPreflightPlan({
    brief: args.brief,
    requestedPageCount: args.requestedPageCount,
  });
  const rawJson = extractJsonDocument(args.text);
  if (!rawJson) {
    return fallback;
  }

  let parsed: ParsedPreflightPayload;
  try {
    parsed = JSON.parse(rawJson) as ParsedPreflightPayload;
  } catch {
    return fallback;
  }

  const pageCount = Math.max(
    1,
    Number.isFinite(parsed.pageCount) ? Number(parsed.pageCount) : fallback.pageCount ?? 1,
  );
  const evidenceTier = normalizeEvidenceTier(parsed.evidencePolicy?.tier as string | undefined, fallback.evidencePolicy.tier);

  const parsedPageMissions =
    (parsed.pageMissions ?? [])
      .slice(0, pageCount)
      .map((mission, index) =>
        sanitizeMission(
          {
            pageNumber: mission.pageNumber ?? index + 1,
            title: String(mission.title ?? ""),
            mission: String(mission.mission ?? ""),
            headlineClaim: String(mission.headlineClaim ?? ""),
            supportPoints: Array.isArray(mission.supportPoints) ? mission.supportPoints.map(String) : [],
            evidenceNotes: Array.isArray(mission.evidenceNotes) ? mission.evidenceNotes.map(String) : [],
            preferredVisual:
              mission.preferredVisual === null || mission.preferredVisual === undefined
                ? null
                : String(mission.preferredVisual),
            missionScope:
              mission.missionScope === null || mission.missionScope === undefined
                ? "page"
                : normalizeMissionScope(String(mission.missionScope), String(mission.mission ?? "")),
            structureCue:
              mission.structureCue === null || mission.structureCue === undefined
                ? null
                : normalizeStructureCue(String(mission.structureCue), String(mission.mission ?? "")),
          },
          index + 1,
        ),
      )
      .filter((mission) => mission.title || mission.mission);
  const pageMissions = normalizeDeckPageMissions({
    brief: args.brief,
    pageCount,
    subject: String(parsed.subject ?? fallback.subject),
    evidenceTier,
    inputPageMissions: parsedPageMissions.length > 0 ? parsedPageMissions : fallback.pageMissions,
    fallbackPageMissions: fallback.pageMissions,
  });

  return {
    rawBrief: args.brief,
    subject: clampText(String(parsed.subject ?? fallback.subject), 120),
    deliverable: clampText(String(parsed.deliverable ?? fallback.deliverable), 120),
    pageCount,
    audienceOrQualityBar:
      parsed.audienceOrQualityBar === null || parsed.audienceOrQualityBar === undefined
        ? fallback.audienceOrQualityBar
        : clampText(String(parsed.audienceOrQualityBar), 140),
    coreTask: clampText(String(parsed.coreTask ?? fallback.coreTask), 220),
    evidencePolicy: {
      tier: evidenceTier,
      summary: clampText(String(parsed.evidencePolicy?.summary ?? fallback.evidencePolicy.summary), 220),
      lines: uniqueStrings(
        (Array.isArray(parsed.evidencePolicy?.lines) ? parsed.evidencePolicy?.lines : fallback.evidencePolicy.lines)
          .map(String)
          .map((line) => clampText(line, 180)),
      ).slice(0, 3),
    },
    pageMissions,
    visualThinking: sanitizeVisualThinking(parsed.visualThinking, fallback.visualThinking),
    capabilityActivations: sanitizeCapabilityActivations(parsed.capabilityActivations, fallback.capabilityActivations),
    assumptionPolicy: uniqueStrings(
      (Array.isArray(parsed.assumptionPolicy) ? parsed.assumptionPolicy : fallback.assumptionPolicy)
        .map(String)
        .map((line) => clampText(line, 180)),
    ).slice(0, 3),
  };
}

export function buildStudioPreflightPrompt(args: {
  brief: string;
  requestedPageCount?: number | null;
}) {
  const requestedPageCount = detectRequestedPageCount(args.brief, args.requestedPageCount);
  return [
    "You are Codex preparing a very small JSON-only understanding plan for a presentation request.",
    "Read the raw brief as a whole. Do not break it into platform-defined sub-blocks before understanding it.",
    "Do not write page copy or HTML.",
    "Return JSON only with this exact shape:",
    "{",
    '  "rawBrief": string,',
    '  "subject": string,',
    '  "deliverable": string,',
    '  "pageCount": number,',
    '  "audienceOrQualityBar": string | null,',
    '  "coreTask": string,',
    '  "evidencePolicy": {',
    '    "tier": "source-backed" | "axiomatic/common-knowledge" | "explicit assumption",',
    '    "summary": string,',
    '    "lines": string[]',
    "  },",
    '  "pageMissions": [{',
    '    "pageNumber": number,',
    '    "title": string,',
    '    "mission": string,',
    '    "headlineClaim": string,',
    '    "supportPoints": string[],',
    '    "evidenceNotes": string[],',
    '    "preferredVisual": string | null,',
    '    "missionScope": "page" | "deck",',
    '    "structureCue": "matrix" | "quadrant" | "chart" | null',
    "  }],",
    '  "visualThinking": {',
    '    "dominantVisualAnchor": string,',
    '    "readingPath": string,',
    '    "regionStrategy": string,',
    '    "densityPosture": string,',
    '    "avoidPattern": string',
    "  },",
    '  "capabilityActivations": [{ "kind": string, "reason": string, "lines": string[] }],',
    '  "assumptionPolicy": string[]',
    "}",
    "Rules:",
    `- Honor the raw brief exactly as written and keep it in rawBrief unchanged.`,
    `- Requested page count: ${requestedPageCount}.`,
    "- Identify the real subject and do not confuse audience or quality bar with the subject.",
    "- Activate 3D only if the raw brief explicitly asks for 3D, cutaway, exploded view, or hero model.",
    "- Activate chart only if the raw brief explicitly asks for a chart, matrix, quadrant, or the page is truly figure-first.",
    "- If evidence is weak, allow axiomatic/common-knowledge or explicit assumption framing, but never invent citations, recent facts, market shares, financial numbers, or valuation multiples.",
    "- Keep page missions tight: one page, one mission, one headline claim.",
    "- For multi-page decks, pageMissions must be page-scoped and specific to that page. Do not reuse one deck-level mission across multiple pages.",
    "",
    "Raw brief:",
    args.brief,
  ].join("\n");
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
