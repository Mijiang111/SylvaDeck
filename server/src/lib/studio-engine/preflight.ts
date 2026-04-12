import type {
  FreeformLayoutPlan,
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

function detectRequestedPageCount(brief: string, requestedPageCount?: number | null) {
  if (requestedPageCount && requestedPageCount > 0) {
    return requestedPageCount;
  }

  const normalized = normalizeStudioText(brief);
  const numericMatch = normalized.match(/\b(\d+)\s*pages?\b/i);
  if (numericMatch?.[1]) {
    return Number.parseInt(numericMatch[1], 10) || 1;
  }
  if (/\bone\s+page\b/i.test(normalized)) {
    return 1;
  }
  if (/\btwo\s+pages?\b/i.test(normalized)) {
    return 2;
  }
  if (/\bthree\s+pages?\b/i.test(normalized)) {
    return 3;
  }
  return 1;
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
  return /\b(?:chart|graph|bar chart|line chart|waterfall|visualize|figure)\b/i.test(brief);
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
      lines: ["Use a restrained, presentation-grade visual language and keep it consistent."],
    },
    ...(hasExplicitThreeDimensionalRequest(args.brief)
      ? [
          {
            kind: "3d" as const,
            reason: "The brief explicitly requests 3D treatment.",
            lines: ["Use one dominant 3D concept object only if it directly serves the page mission."],
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
  memory: StudioWorkingMemory;
  pageCount: number;
  evidenceTier: StudioEvidenceTier;
}) {
  const subject = args.memory.primaryObject;
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
          args.memory.userOperation === "value"
            ? "single-proof-canvas"
            : args.memory.userOperation === "critique"
              ? "annotation-stage"
              : args.memory.userOperation === "narrate"
                ? "vertical-story-strip"
                : "poster-claim",
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
    });
  }

  return pageMissions;
}

function sanitizeMission(mission: StudioPageMission, pageNumber: number): StudioPageMission {
  return {
    pageNumber,
    title: clampText(mission.title || `Page ${pageNumber}`, 80),
    mission: clampText(mission.mission || "Resolve one clear page mission.", 220),
    headlineClaim: clampText(mission.headlineClaim || mission.mission || "Land one clear claim.", 220),
    supportPoints: uniqueStrings((mission.supportPoints ?? []).map((line) => clampText(line, 120))).slice(0, 2),
    evidenceNotes: uniqueStrings((mission.evidenceNotes ?? []).map((line) => clampText(line, 120))).slice(0, 2),
    preferredVisual: mission.preferredVisual ? clampText(mission.preferredVisual, 60) : null,
  };
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
  const pageMissions = buildFallbackPageMission({
    memory: workingMemory,
    pageCount,
    evidenceTier,
  }).map((mission) => sanitizeMission(mission, mission.pageNumber));

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
  if (normalized.includes("3d")) {
    return "3d";
  }
  if (normalized.includes("chart")) {
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

  const pageMissions =
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
          },
          index + 1,
        ),
      )
      .filter((mission) => mission.title || mission.mission);

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
    pageMissions: pageMissions.length > 0 ? pageMissions : fallback.pageMissions,
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
    '    "preferredVisual": string | null',
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
    "- Activate chart only if the raw brief explicitly asks for a chart or the page is truly chart-first.",
    "- If evidence is weak, allow axiomatic/common-knowledge or explicit assumption framing, but never invent citations, recent facts, market shares, financial numbers, or valuation multiples.",
    "- Keep page missions tight: one page, one mission, one headline claim.",
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
    args.preflight.pageMissions[0] ??
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
    } satisfies StudioPageMission;
  }

  return mission;
}

export function buildVisualThinkingLines(args: {
  preflight: StudioPreflightPlan;
  visualOperatorLines?: string[];
  freeformLayoutPlan?: FreeformLayoutPlan | null;
  preferredVisual?: string | null;
}) {
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
    `Region strategy: ${visualThinking.regionStrategy}.`,
    `Density posture: ${visualThinking.densityPosture}.`,
    `Avoid pattern: ${visualThinking.avoidPattern}.`,
    ...freeformLines,
    ...(args.visualOperatorLines ?? []).slice(0, 2),
  ].map((line) => clampText(line, 220));
}

export function buildPreflightCapabilityCards(args: {
  preflight: StudioPreflightPlan;
  baseCards?: StudioCapabilityCard[];
}) {
  const baseCards = args.baseCards ?? [];
  const activeKinds = new Set(args.preflight.capabilityActivations.map((item) => item.kind));
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
    if (card.id === "composition-direction") {
      return activeKinds.has("template");
    }
    return false;
  });
}
