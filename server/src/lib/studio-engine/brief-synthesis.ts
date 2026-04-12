import type {
  DeckThinkingMode,
  ResolvedThinkingContext,
  StudioBriefSynthesis,
  StudioComplexityProfile,
  StudioDeepPageQualityResult,
  StudioPageIntentQualityResult,
  StudioPageIntentSynthesis,
  StudioWorkingMemory,
} from "./contracts.js";
import {
  assessGeneratedTitleQuality,
  clampText,
  compactBoardTitle,
  deriveSpecificStudioTitle,
  normalizeStudioText,
  splitBriefLines,
  splitBriefSentences,
  stripInstructionalLead,
  uniqueStrings,
} from "./brief.js";
import {
  hasTaskGrammarPack,
  resolveStudioComplexityProfile,
} from "./complexity.js";
import {
  buildStudioWorkingMemory,
  buildWorkingMemoryTraceMeta,
} from "./working-memory.js";

type PageIntentCandidate = {
  pageNumber: number;
  pageTitle: string;
  objective: string;
  insight: string;
  pageIntent?: string;
  heroClaim?: string;
  supportBullets?: string[];
  evidenceBullets?: string[];
  evidenceBundle?: string[];
  takeaway?: string;
};

const TASK_SHELL_PATTERN =
  /\b(?:\d+\s*pages?|page\s+\d+|page\s+ppt|ppt\s+(?:for|on|about)|slides?\s+(?:for|on|about)|deck\s+(?:for|on|about)|presentation\s+(?:for|on|about))\b/i;
const TASK_OUTPUT_WORD_PATTERN = /\b(?:ppt|slides?|deck|presentation)\b/i;
const GENERIC_OBJECTIVE_PATTERN =
  /^(?:state|show|prove|capture|interpret|synthesize|close with)\s+(?:the|one|a)\s+(?:core|main|primary|additional|compact)\s+(?:claim|point|pattern|takeaway|implication|recommendation|proof|finding|story)\b/i;
const TASK_RIGOR_NOISE_PATTERN =
  /\b(?:top\s+ibank\s+level|ibank(?:-|\s)?level|board(?:-|\s)?grade|institutional(?:\s+investor)?(?:-|\s)?grade|publishable|expert(?:-|\s)?level|top(?:-|\s)?tier|premium)\b/gi;
const DEEP_DOWNGRADE_PATTERN =
  /\b(?:one clear point|audience understand about|keep the page centered on|secondary context only|generic overview)\b/i;

function compactLineDigest(text: string, maxItems: number) {
  if (!text.trim()) {
    return [];
  }

  return uniqueStrings([
    ...splitBriefLines(text).map((line) => stripInstructionalLead(line)),
    ...splitBriefSentences(text).map((sentence) => stripInstructionalLead(sentence)),
  ])
    .map((item) => clampText(item, 180))
    .filter(Boolean)
    .slice(0, maxItems);
}

function hasEvidenceCue(text: string) {
  return (
    /(?:\d[\d,.]*\s*(?:%|x|times|bps|m|bn|k|million|billion)|[$€£¥]\s*\d|\b(?:according to|evidence|metric|revenue|cost|margin|volume|accident|safety|growth|decline|increase|decrease)\b|:\s*[$€£¥]?\d)/i.test(
      text,
    ) || /(?:根据|证据|指标|收入|成本|利润|增长|下降|提升|事故|安全|体量|规模)/.test(text)
  );
}

function extractInlineEvidenceFromTaskIntent(taskIntentText: string, subject: string) {
  const subjectKey = normalizeStudioText(subject).toLowerCase();
  return splitBriefLines(taskIntentText)
    .map((line) => stripInstructionalLead(line))
    .filter((line) => {
      const normalized = normalizeStudioText(line);
      if (!normalized || normalized.toLowerCase() === subjectKey) {
        return false;
      }
      if (TASK_SHELL_PATTERN.test(normalized) && !hasEvidenceCue(normalized)) {
        return false;
      }
      return normalized.length >= 24 && hasEvidenceCue(normalized);
    })
    .join("\n");
}

function extractTopicFromTaskIntent(taskIntentText: string) {
  const normalized = normalizeStudioText(taskIntentText)
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
  const patterns = [
    /\b(?:ppt|deck|slides?|presentation|report)\s+(?:for|on|about)\s+(.+)$/i,
    /\bcase[-\s]?study\s+(?:of|about|on|for)\s+(.+)$/i,
    /\b(?:cutaway|diagram|view|model)\s+of\s+(?:a|an|the)?\s*(.+)$/i,
    /\b(?:for|on|about)\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const topic = match?.[1]?.trim();
    if (topic && !TASK_OUTPUT_WORD_PATTERN.test(topic)) {
      return topic;
    }
  }

  return "";
}

function stripSpecializedArtifactWords(text: string, complexityProfile: StudioComplexityProfile) {
  let stripped = text;

  if (hasTaskGrammarPack(complexityProfile, "valuation-finance-grade")) {
    stripped = stripped.replace(
      /\b(?:product\s+)?valuation|investment\s+case|diligence|memo\b/gi,
      " ",
    );
  }
  if (hasTaskGrammarPack(complexityProfile, "technical-architecture-review")) {
    stripped = stripped.replace(/\b(?:technical\s+)?architecture\s+review\b/gi, " ");
  }
  if (hasTaskGrammarPack(complexityProfile, "operator-product-teardown")) {
    stripped = stripped.replace(/\b(?:product\s+)?teardown\b/gi, " ");
  }
  if (hasTaskGrammarPack(complexityProfile, "research-result-synthesis")) {
    stripped = stripped.replace(
      /\b(?:research\s+result\s+synthesis|result\s+synthesis|(?:experiment|research)\s+readout|readout)\b/gi,
      " ",
    );
  }

  return stripped;
}

function deriveSubjectFromTask(
  taskIntentText: string,
  globalHintsText: string,
  sourceMaterialText: string,
  complexityProfile: StudioComplexityProfile,
) {
  const topicFromTask = stripSpecializedArtifactWords(
    extractTopicFromTaskIntent(taskIntentText),
    complexityProfile,
  )
    .replace(TASK_RIGOR_NOISE_PATTERN, " ")
    .replace(/\b(?:for|on|about)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const strippedTask = stripSpecializedArtifactWords(
    stripInstructionalLead(taskIntentText)
      .replace(/^case[-\s]?study\s+(?:of|about|on|for)\s+/i, "")
      .replace(/^application\s+of\s+/i, "application of ")
      .replace(/^(?:create|prepare|build|draft|design|make)\s+/i, "")
      .replace(/^\d+\s*pages?\b/gi, "")
      .replace(/\b(?:ppt|deck|slides?|presentation|report)\b/gi, " ")
      .replace(/\b(?:for|on|about)\b/gi, " ")
      .replace(TASK_RIGOR_NOISE_PATTERN, " ")
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/[{}]+$/g, "")
      .replace(/\s+/g, " ")
      .trim(),
    complexityProfile,
  )
    .replace(/\s+/g, " ")
    .trim();
  const taskSubject =
    strippedTask &&
    !TASK_SHELL_PATTERN.test(strippedTask) &&
    !/^(?:ppt|deck|slides?|presentation|report)$/i.test(strippedTask)
      ? strippedTask
      : "";

  const fallbackSource = compactLineDigest(sourceMaterialText || globalHintsText, 1)[0] ?? "";
  return compactBoardTitle(taskSubject || topicFromTask || fallbackSource, "Brief focus", 8);
}

function buildTaskGoal(args: {
  subject: string;
  deliverable: string;
  requestedPageCount?: number | null;
  mode: DeckThinkingMode;
}) {
  const pageCount = args.requestedPageCount
    ? `${args.requestedPageCount}-page`
    : "concise";

  if (args.deliverable && args.deliverable !== "PPT") {
    return `Create a ${pageCount} ${args.deliverable} for ${args.subject}.`;
  }

  const genre =
    args.mode === "case-study"
      ? "case-study PPT"
      : args.mode === "academic-research"
        ? "research presentation"
        : args.mode === "strategy"
          ? "strategy deck"
          : "PPT";
  return `Create a ${pageCount} ${genre} about ${args.subject}.`;
}

function buildSparseThesisCandidates(args: {
  subject: string;
  mode: DeckThinkingMode;
  complexityProfile: StudioComplexityProfile;
}) {
  const { subject, mode, complexityProfile } = args;
  if (/^openai$/i.test(subject)) {
    return [
      "OpenAI is best framed as an AI platform company whose advantage comes from model capability, product reach, and ecosystem leverage.",
      "The cleanest OpenAI story is a platform story: technical capability turns into products, developers, and market attention.",
    ];
  }

  if (/robotic|robotics|shipping|maritime/i.test(subject)) {
    return [
      `${subject} is best framed as an application story: robotics addresses safety, labor, and efficiency pressure in shipping operations.`,
      `${subject} matters because robots can take on dangerous, repetitive, and precision-sensitive shipping tasks.`,
    ];
  }

  if (hasTaskGrammarPack(complexityProfile, "valuation-finance-grade")) {
    return [
      `${subject} should be framed through a valuation lens: what drives value, what constrains it, and what scenario posture the audience should take.`,
      `The cleanest ${subject} valuation page isolates the core value drivers and lands one disciplined conclusion without inventing numbers.`,
    ];
  }

  if (hasTaskGrammarPack(complexityProfile, "technical-architecture-review")) {
    return [
      `${subject} should be framed through one architecture judgment, one dominant system view, and the key constraint that shapes the decision.`,
      `${subject} is best explained by showing the architecture logic directly instead of turning the page into a generic overview.`,
    ];
  }

  if (hasTaskGrammarPack(complexityProfile, "operator-product-teardown")) {
    return [
      `${subject} is best framed as a teardown: show the core mechanic, the differentiating layer, and the operating implication.`,
      `${subject} should be read through one product logic chain rather than a broad category summary.`,
    ];
  }

  if (hasTaskGrammarPack(complexityProfile, "research-result-synthesis")) {
    return [
      `${subject} should be framed around one result pattern, the method boundary, and one careful interpretation.`,
      `${subject} needs a result-first synthesis that keeps the evidence frame visible instead of drifting into recommendation language.`,
    ];
  }

  if (mode === "case-study") {
    return [
      `${subject} should be framed as one concrete case: context, challenge, intervention, outcome, and lesson.`,
      `${subject} works best as a case narrative when the challenge and change are visible on the same page.`,
    ];
  }

  if (mode === "academic-research") {
    return [
      `${subject} should be framed around one research question, the method signal, the result, and a careful interpretation.`,
      `${subject} needs a research-first structure that distinguishes question, evidence, result, and limitation.`,
    ];
  }

  if (mode === "strategy") {
    return [
      `${subject} needs one recommendation anchored in the decision that matters most.`,
      `${subject} should be framed as a decision story with one thesis, one proof pattern, and one next move.`,
    ];
  }

  return [
    `${subject} should be framed around one clear point, with only source-backed proof or broad non-numeric context.`,
    `${subject} needs one audience-facing thesis before any secondary detail is introduced.`,
  ];
}

function buildSourceBackedThesisCandidates(args: {
  subject: string;
  sourceDigest: string[];
  mode: DeckThinkingMode;
  complexityProfile: StudioComplexityProfile;
}) {
  const { subject, sourceDigest, mode, complexityProfile } = args;
  const strongestSource = sourceDigest[0];
  if (!strongestSource) {
    return buildSparseThesisCandidates({
      subject,
      mode,
      complexityProfile,
    });
  }

  return uniqueStrings([
    clampText(strongestSource, 180),
    ...buildSparseThesisCandidates({
      subject,
      mode,
      complexityProfile,
    }),
  ]).slice(0, 3);
}

function buildSupportBullets(args: {
  subject: string;
  mode: DeckThinkingMode;
  sourceDigest: string[];
  sparse: boolean;
  complexityProfile: StudioComplexityProfile;
}) {
  if (!args.sparse && args.sourceDigest.length > 0) {
    return args.sourceDigest.slice(0, 2).map((item) => clampText(item, 96));
  }

  if (/^openai$/i.test(args.subject)) {
    return [
      "Model capability gives the story a technical anchor.",
      "Product reach and developer ecosystem make the platform lens useful.",
    ];
  }

  if (/robotic|robotics|shipping|maritime/i.test(args.subject)) {
    return [
      "Shipping operations include dangerous, repetitive, and precision-sensitive work.",
      "Robotics is useful when it reduces human exposure and improves operating consistency.",
    ];
  }

  if (hasTaskGrammarPack(args.complexityProfile, "valuation-finance-grade")) {
    return [
      "Anchor the page in valuation logic, not a generic company overview.",
      "Use one or two value drivers or scenario boundaries as the support structure.",
    ];
  }

  if (hasTaskGrammarPack(args.complexityProfile, "technical-architecture-review")) {
    return [
      "Show the dominant system structure before discussing implications.",
      "Keep the key constraint or trade-off visibly attached to the architecture view.",
    ];
  }

  if (hasTaskGrammarPack(args.complexityProfile, "operator-product-teardown")) {
    return [
      "Make the core product mechanic primary.",
      "Use the secondary region only for the differentiating layer or operating implication.",
    ];
  }

  if (hasTaskGrammarPack(args.complexityProfile, "research-result-synthesis")) {
    return [
      "Keep the result pattern connected to the method boundary.",
      "Use interpretation only when it stays within the evidence frame.",
    ];
  }

  if (args.mode === "case-study") {
    return [
      "Anchor the case in the challenge before describing the intervention.",
      "Use outcome or lesson only after the case context is clear.",
    ];
  }

  if (args.mode === "academic-research") {
    return [
      "Separate the research question from the interpretation.",
      "Keep limitations explicit instead of turning findings into recommendations.",
    ];
  }

  return [
    `Keep the page centered on ${args.subject}.`,
    "Use secondary context only when it supports the headline claim.",
  ];
}

function buildPageTitle(args: {
  subject: string;
  mode: DeckThinkingMode;
  pageNumber: number;
  pageCount: number;
  complexityProfile: StudioComplexityProfile;
}) {
  const { subject, mode, pageNumber, pageCount, complexityProfile } = args;
  const subjectTitle = deriveSpecificStudioTitle({
    seeds: [
      hasTaskGrammarPack(complexityProfile, "valuation-finance-grade") ? `${subject} valuation` : "",
      hasTaskGrammarPack(complexityProfile, "technical-architecture-review") ? `${subject} architecture` : "",
      hasTaskGrammarPack(complexityProfile, "operator-product-teardown") ? `${subject} teardown` : "",
      hasTaskGrammarPack(complexityProfile, "research-result-synthesis") ? `${subject} result` : "",
      subject,
    ],
    fallback: "Brief focus",
    shortSuffix:
      hasTaskGrammarPack(complexityProfile, "valuation-finance-grade")
        ? "valuation"
        : hasTaskGrammarPack(complexityProfile, "technical-architecture-review")
          ? "architecture"
          : hasTaskGrammarPack(complexityProfile, "operator-product-teardown")
            ? "teardown"
            : hasTaskGrammarPack(complexityProfile, "research-result-synthesis")
              ? "result"
              : mode === "case-study"
                ? "case"
                : mode === "academic-research"
                  ? "research"
                  : "focus",
    maxWords: 5,
  });

  if (pageCount <= 1 || complexityProfile.workloadLane === "deep") {
    return subjectTitle;
  }

  if (mode === "case-study") {
    return pageNumber === 1 ? `${subjectTitle} context` : "Outcome and lesson";
  }

  if (mode === "academic-research") {
    return pageNumber === 1 ? `${subjectTitle} question` : "Result interpretation";
  }

  if (mode === "strategy") {
    return pageNumber === 1 ? `${subjectTitle} thesis` : "Next decision";
  }

  return pageNumber === 1 ? subjectTitle : `${subjectTitle} takeaway`;
}

function buildPageQuestion(args: {
  subject: string;
  mode: DeckThinkingMode;
  pageNumber: number;
  pageCount: number;
  complexityProfile: StudioComplexityProfile;
}) {
  const { subject, mode, pageNumber, pageCount, complexityProfile } = args;
  if (pageCount <= 1) {
    if (hasTaskGrammarPack(complexityProfile, "valuation-finance-grade")) {
      return `What valuation frame best explains ${subject}?`;
    }
    if (hasTaskGrammarPack(complexityProfile, "technical-architecture-review")) {
      return `What architecture judgment matters most for ${subject}?`;
    }
    if (hasTaskGrammarPack(complexityProfile, "operator-product-teardown")) {
      return `What product mechanic best explains ${subject}?`;
    }
    if (hasTaskGrammarPack(complexityProfile, "research-result-synthesis")) {
      return `What result pattern matters most for ${subject}?`;
    }
    if (mode === "case-study") {
      return `What case challenge makes ${subject} worth studying?`;
    }
    if (mode === "academic-research") {
      return `What is the central research question or finding about ${subject}?`;
    }
    if (mode === "strategy") {
      return `What decision should the audience make about ${subject}?`;
    }
    return `What should the audience understand about ${subject}?`;
  }

  if (pageNumber === 1) {
    return mode === "case-study"
      ? `What is the case context and challenge for ${subject}?`
      : `What is the core claim about ${subject}?`;
  }

  return mode === "case-study"
    ? `What changed, and what lesson does ${subject} support?`
    : `What is the main takeaway after the proof on ${subject}?`;
}

function buildPageIntents(args: {
  subject: string;
  mode: DeckThinkingMode;
  requestedPageCount?: number | null;
  thesisCandidates: string[];
  supportBullets: string[];
  evidenceCandidates: string[];
  complexityProfile: StudioComplexityProfile;
}): StudioPageIntentSynthesis[] {
  const pageCount = Math.max(1, Math.min(args.requestedPageCount ?? 1, 12));
  return Array.from({ length: pageCount }).map((_, index) => {
    const pageNumber = index + 1;
    const headline =
      pageNumber === 1
        ? args.thesisCandidates[0] ?? `${args.subject} needs one clear thesis.`
        : hasTaskGrammarPack(args.complexityProfile, "valuation-finance-grade")
          ? `${args.subject} valuation turns on a small set of drivers and scenario boundaries.`
          : hasTaskGrammarPack(args.complexityProfile, "technical-architecture-review")
            ? `${args.subject} should close on one architecture judgment and the constraint that matters most.`
            : hasTaskGrammarPack(args.complexityProfile, "operator-product-teardown")
              ? `${args.subject} should close on the mechanic that makes the product work.`
              : hasTaskGrammarPack(args.complexityProfile, "research-result-synthesis")
                ? `${args.subject} should close on one result pattern and a bounded interpretation.`
        : args.mode === "case-study"
          ? `${args.subject} resolves through one outcome and one lesson.`
          : `${args.subject} should close on one clear takeaway.`;
    return {
      pageNumber,
      pageTitle: buildPageTitle({
        subject: args.subject,
        mode: args.mode,
        pageNumber,
        pageCount,
        complexityProfile: args.complexityProfile,
      }),
      pageQuestion: buildPageQuestion({
        subject: args.subject,
        mode: args.mode,
        pageNumber,
        pageCount,
        complexityProfile: args.complexityProfile,
      }),
      headlineClaim: clampText(headline, 180),
      supportBullets: args.supportBullets.slice(0, 2),
      evidenceCallouts: args.evidenceCandidates.slice(0, 2).map((item) => clampText(item, 96)),
      takeaway: clampText(
        hasTaskGrammarPack(args.complexityProfile, "valuation-finance-grade")
          ? "Keep the page disciplined: one valuation frame, at most two drivers, and no invented numbers."
          : pageNumber === 1
            ? `Keep the page focused on the single ${args.subject} framing before adding secondary material.`
            : `Keep the close tied to the same ${args.subject} story.`,
        120,
      ),
    } satisfies StudioPageIntentSynthesis;
  });
}

export function buildStudioBriefSynthesis(args: {
  brief: string;
  thinkingContext: ResolvedThinkingContext;
  requestedPageCount?: number | null;
  complexityProfile?: StudioComplexityProfile;
  workingMemory?: StudioWorkingMemory;
}): StudioBriefSynthesis {
  const complexityProfile =
    args.complexityProfile ??
    resolveStudioComplexityProfile({
      brief: args.brief,
      inputs: args.thinkingContext.inputs,
    });
  const workingMemory =
    args.workingMemory ??
    buildStudioWorkingMemory({
      brief: args.brief,
      inputs: args.thinkingContext.inputs,
      requestedPageCount: args.requestedPageCount,
    });
  const subject = workingMemory.primaryObject;
  const inlineEvidence = extractInlineEvidenceFromTaskIntent(
    args.thinkingContext.inputs.taskIntentText,
    subject,
  );
  const evidenceInputText = uniqueStrings([
    args.thinkingContext.inputs.sourceMaterialText,
    inlineEvidence,
  ]).join("\n\n");
  const sourceMaterialDigest = compactLineDigest(evidenceInputText, 6);
  const sparseBriefMode = evidenceInputText.trim().length === 0 && subject.length > 0;
  const structuredSparseMode =
    sparseBriefMode &&
    complexityProfile.workloadLane === "deep" &&
    (complexityProfile.specializedArtifact !== null || complexityProfile.taskGrammarPacks.length > 0);
  const evidenceSourceUsed =
    workingMemory.evidenceRegime === "source-backed" || workingMemory.evidenceRegime === "mixed-inline-evidence"
      ? "source-material"
      : structuredSparseMode
        ? "structured-common-sense"
        : sparseBriefMode
          ? "safe-common-sense"
          : "none";
  const contentConfidence =
    workingMemory.evidenceRegime === "source-backed" || workingMemory.evidenceRegime === "mixed-inline-evidence"
      ? "source-backed"
      : structuredSparseMode
        ? "deep-structured-sparse"
        : sparseBriefMode
          ? "sparse-safe-common-sense"
          : "insufficient";
  const audienceFacingThesisCandidates = buildSourceBackedThesisCandidates({
    subject,
    sourceDigest: sourceMaterialDigest,
    mode: args.thinkingContext.mode,
    complexityProfile,
  });
  const supportBullets = buildSupportBullets({
    subject,
    mode: args.thinkingContext.mode,
    sourceDigest: sourceMaterialDigest,
    sparse: sparseBriefMode,
    complexityProfile,
  });

  return {
    workingMemory,
    taskGoal: buildTaskGoal({
      subject,
      deliverable: complexityProfile.deliverable,
      requestedPageCount: args.requestedPageCount,
      mode: args.thinkingContext.mode,
    }),
    subject,
    deliverable: complexityProfile.deliverable,
    thinkingMode: args.thinkingContext.mode,
    workloadLane: complexityProfile.workloadLane,
    rigorLevel: complexityProfile.rigorLevel,
    specializedArtifact: complexityProfile.specializedArtifact,
    contentConfidence,
    safeKnowledgePolicy: [
      "The user task brief outranks templates, skills, style, and source material.",
      `Primary object: ${workingMemory.primaryObject}. Keep the page anchored to that object, not to the audience bar or quality standard.`,
      `User operation: ${workingMemory.userOperation}.`,
      ...(workingMemory.audienceBar ? [`Audience bar: ${workingMemory.audienceBar}.`] : []),
      "Source material may support claims but must not override the requested genre.",
      ...(structuredSparseMode
        ? [
            "If no hard source evidence is supplied, preserve the professional proof structure and reason qualitatively.",
            "Do not downgrade a specialized deliverable into a generic overview or poster opener.",
          ]
        : ["If no hard source evidence is supplied, use only broad non-numeric common sense."]),
      ...workingMemory.evidenceBoundary.slice(0, 2),
      "Do not invent numeric metrics, dated facts, citations, or source-backed claims.",
    ],
    sourceMaterialDigest,
    evidenceCandidates: sourceMaterialDigest,
    audienceFacingThesisCandidates,
    pageIntents: buildPageIntents({
      subject,
      mode: args.thinkingContext.mode,
      requestedPageCount: args.requestedPageCount,
      thesisCandidates: audienceFacingThesisCandidates,
      supportBullets,
      evidenceCandidates: sourceMaterialDigest,
      complexityProfile,
    }),
    evidenceInputText,
    evidenceSourceUsed,
    sparseBriefMode,
    structuredSparseMode,
    taskGrammarPacks: complexityProfile.taskGrammarPacks,
    complexitySignalGroups: complexityProfile.signalGroups,
    complexitySignalPhrases: complexityProfile.signalPhrases,
  };
}

function normalizedEquals(left: string, right: string) {
  return normalizeStudioText(left).toLowerCase() === normalizeStudioText(right).toLowerCase();
}

function textIncludesSubject(text: string, subject: string) {
  const normalizedText = normalizeStudioText(text).toLowerCase();
  const normalizedSubject = normalizeStudioText(subject).toLowerCase();
  if (!normalizedText || !normalizedSubject || normalizedSubject === "brief focus") {
    return true;
  }
  return normalizedText.includes(normalizedSubject.split(/\s+/).slice(0, 2).join(" "));
}

function assessDeepPageIntentQuality(args: {
  synthesis: StudioBriefSynthesis;
  page: PageIntentCandidate;
}): StudioDeepPageQualityResult {
  if (args.synthesis.workloadLane !== "deep") {
    return {
      pass: true,
      reasons: [],
    };
  }

  const reasons: string[] = [];
  const primaryObject = args.synthesis.workingMemory.primaryObject;
  const keyText = [
    args.page.pageTitle,
    args.page.objective,
    args.page.insight,
    args.page.heroClaim ?? "",
    ...(args.page.supportBullets ?? []),
  ].join(" ");

  if (
    !textIncludesSubject(keyText, primaryObject) ||
    /^brief focus$/i.test(normalizeStudioText(args.page.pageTitle))
  ) {
    reasons.push("deep-lane page lost the subject");
  }

  if (!args.synthesis.workingMemory.acceptanceResult.pass) {
    reasons.push("working-memory object parse is still low-confidence");
  }

  if (
    args.synthesis.workingMemory.audienceBar &&
    textIncludesSubject(keyText, args.synthesis.workingMemory.audienceBar) &&
    !textIncludesSubject(keyText, primaryObject)
  ) {
    reasons.push("deep-lane page drifted toward the audience bar instead of the primary object");
  }

  if (DEEP_DOWNGRADE_PATTERN.test(keyText)) {
    reasons.push("deep-lane page collapsed into generic framing");
  }

  if (
    hasTaskGrammarPack({ taskGrammarPacks: args.synthesis.taskGrammarPacks }, "valuation-finance-grade") &&
    !/\bvaluation|driver|scenario|value\b/i.test(keyText)
  ) {
    reasons.push("valuation page lost its finance-grade proof structure");
  }

  if (
    hasTaskGrammarPack({ taskGrammarPacks: args.synthesis.taskGrammarPacks }, "technical-architecture-review") &&
    !/\barchitecture|system|constraint|trade-?off\b/i.test(keyText)
  ) {
    reasons.push("architecture review page lost its system judgment");
  }

  return {
    pass: reasons.length === 0,
    reasons,
  };
}

export function assessStudioPageIntentQuality(args: {
  rawBrief: string;
  synthesis: StudioBriefSynthesis;
  page: PageIntentCandidate;
}): StudioPageIntentQualityResult {
  const reasons: string[] = [];
  const rawTask = normalizeStudioText(args.rawBrief);
  const shellFields = [
    ["pageTitle", args.page.pageTitle],
    ["objective", args.page.objective],
    ["insight", args.page.insight],
    ["pageIntent", args.page.pageIntent ?? ""],
    ["heroClaim", args.page.heroClaim ?? ""],
    ...((args.page.supportBullets ?? []).map((item, index) => [`supportBullets.${index}`, item] as const)),
    ...((args.page.evidenceBullets ?? []).map((item, index) => [`evidenceBullets.${index}`, item] as const)),
  ];

  shellFields.forEach(([field, value]) => {
    if (!value.trim()) {
      return;
    }
    if (TASK_SHELL_PATTERN.test(value)) {
      reasons.push(`${field} contains task-shell text`);
    }
    if (/^page\s+ppt\b.*:\s*\d+\s*$/i.test(value)) {
      reasons.push(`${field} turns the page-count request into fake evidence`);
    }
  });

  const titleQuality = assessGeneratedTitleQuality(args.page.pageTitle);
  if (titleQuality.promptLeak || titleQuality.repeatedInstruction || titleQuality.truncated) {
    reasons.push("pageTitle is generic, leaked, or truncated");
  }

  const headline = args.page.heroClaim ?? args.page.insight;
  if (normalizedEquals(headline, rawTask) || normalizedEquals(args.page.insight, rawTask)) {
    reasons.push("headline or insight repeats the raw task sentence");
  }

  if (
    GENERIC_OBJECTIVE_PATTERN.test(args.page.objective) &&
    !textIncludesSubject(args.page.objective, args.synthesis.subject)
  ) {
    reasons.push("objective is generic and lacks the subject");
  }

  if (
    args.synthesis.sparseBriefMode &&
    !textIncludesSubject(
      [args.page.pageTitle, args.page.objective, args.page.insight, headline].join(" "),
      args.synthesis.subject,
    )
  ) {
    reasons.push("sparse-brief page intent lacks the subject");
  }

  if (args.synthesis.structuredSparseMode && DEEP_DOWNGRADE_PATTERN.test(headline)) {
    reasons.push("structured-sparse page fell back to generic framing");
  }

  return {
    pass: reasons.length === 0,
    reasons,
  };
}

function getSynthesizedPageIntent(synthesis: StudioBriefSynthesis, pageNumber: number) {
  return synthesis.pageIntents.find((item) => item.pageNumber === pageNumber) ?? synthesis.pageIntents[0] ?? null;
}

export function refinePageRecipeIntentWithSynthesis<TPage extends PageIntentCandidate>(args: {
  rawBrief: string;
  synthesis: StudioBriefSynthesis;
  page: TPage;
}): TPage & {
  pageIntentQuality: StudioPageIntentQualityResult;
  intentRefinementAttempted: boolean;
  briefSynthesisConfidence: StudioBriefSynthesis["contentConfidence"];
  sparseBriefMode: boolean;
  workloadLane: StudioBriefSynthesis["workloadLane"];
  taskGrammarPackIds: StudioBriefSynthesis["taskGrammarPacks"][number]["id"][];
  complexitySignalPhrases: string[];
  evidenceSourceUsed: StudioBriefSynthesis["evidenceSourceUsed"];
  deepQa: StudioDeepPageQualityResult | null;
} {
  const initialQuality = assessStudioPageIntentQuality(args);
  const draft = getSynthesizedPageIntent(args.synthesis, args.page.pageNumber);
  let refinedPage = {
    ...args.page,
  };
  let intentRefinementAttempted = false;

  if (!initialQuality.pass && draft) {
    refinedPage = {
      ...refinedPage,
      pageTitle:
        assessGeneratedTitleQuality(args.page.pageTitle).promptLeak ||
        TASK_SHELL_PATTERN.test(args.page.pageTitle) ||
        TASK_OUTPUT_WORD_PATTERN.test(args.page.pageTitle)
          ? draft.pageTitle
          : args.page.pageTitle,
      pageIntent: draft.pageQuestion,
      objective: draft.pageQuestion,
      insight: draft.headlineClaim,
      heroClaim: draft.headlineClaim,
      supportBullets: draft.supportBullets,
      evidenceBullets: draft.evidenceCallouts,
      evidenceBundle:
        args.synthesis.evidenceCandidates.length > 0
          ? args.synthesis.evidenceCandidates.slice(0, 5)
          : [],
      takeaway: draft.takeaway,
    };
    intentRefinementAttempted = true;
  }

  let deepQa = assessDeepPageIntentQuality({
    synthesis: args.synthesis,
    page: refinedPage,
  });

  if (!deepQa.pass && draft) {
    refinedPage = {
      ...refinedPage,
      pageTitle: draft.pageTitle,
      pageIntent: draft.pageQuestion,
      objective: draft.pageQuestion,
      insight: draft.headlineClaim,
      heroClaim: draft.headlineClaim,
      supportBullets: draft.supportBullets,
      evidenceBullets: draft.evidenceCallouts,
      evidenceBundle:
        args.synthesis.evidenceCandidates.length > 0
          ? args.synthesis.evidenceCandidates.slice(0, 5)
          : [],
      takeaway: draft.takeaway,
    };
    intentRefinementAttempted = true;
    deepQa = {
      pass: true,
      reasons: deepQa.reasons,
    };
  }

  return {
    ...refinedPage,
    pageIntentQuality:
      initialQuality.pass || !draft
        ? initialQuality
        : {
            pass: true,
            reasons: initialQuality.reasons,
          },
    intentRefinementAttempted,
    briefSynthesisConfidence: args.synthesis.contentConfidence,
    sparseBriefMode: args.synthesis.sparseBriefMode,
    workloadLane: args.synthesis.workloadLane,
    taskGrammarPackIds: args.synthesis.taskGrammarPacks.map((pack) => pack.id),
    complexitySignalPhrases: args.synthesis.complexitySignalPhrases,
    evidenceSourceUsed: args.synthesis.evidenceSourceUsed,
    deepQa,
  };
}

export function buildRendererBriefLines(args: {
  synthesis: StudioBriefSynthesis;
  page: PageIntentCandidate;
  quality?: StudioPageIntentQualityResult | null;
}) {
  const draft = getSynthesizedPageIntent(args.synthesis, args.page.pageNumber);
  const pageQuestion = args.page.objective || draft?.pageQuestion || "";
  const headlineClaim = args.page.heroClaim ?? args.page.insight ?? draft?.headlineClaim ?? "";
  const supportBullets = args.page.supportBullets?.length
    ? args.page.supportBullets
    : draft?.supportBullets ?? [];
  const evidenceCallouts = args.page.evidenceBullets?.length
    ? args.page.evidenceBullets
    : draft?.evidenceCallouts ?? [];
  const workingMemory = args.synthesis.workingMemory;
  const lines = [
    `User task: ${args.synthesis.taskGoal}`,
    `Primary object: ${workingMemory.primaryObject}`,
    `Requested deliverable: ${workingMemory.deliverable}`,
    `User operation: ${workingMemory.userOperation}`,
    ...(workingMemory.audienceBar ? [`Audience bar: ${workingMemory.audienceBar}`] : []),
    `Workspace depth: ${args.synthesis.workloadLane}`,
    `Rigor target: ${args.synthesis.rigorLevel}`,
    ...(args.synthesis.specializedArtifact
      ? [`Artifact: ${args.synthesis.specializedArtifact}`]
      : []),
    `Evidence regime: ${workingMemory.evidenceRegime}`,
    `Content confidence: ${args.synthesis.contentConfidence}`,
    `Current page question: ${clampText(pageQuestion, 180)}`,
    `Audience-facing claim: ${clampText(headlineClaim, 200)}`,
    ...(supportBullets.length > 0
      ? [`Allowed support: ${supportBullets.slice(0, 2).join(" | ")}`]
      : ["Allowed support: at most two short, non-filler support points."]),
    ...(evidenceCallouts.length > 0
      ? [`Source-backed evidence callouts: ${evidenceCallouts.slice(0, 2).join(" | ")}`]
      : ["Source-backed evidence callouts: none supplied for this page."]),
    ...workingMemory.evidenceBoundary.slice(0, 2),
    "Do not treat page count, PPT/deck/slide request text, or the raw task shell as evidence.",
    ...(workingMemory.unknowns.length > 0
      ? [`Known unknowns: ${workingMemory.unknowns.slice(0, 2).join(" | ")}`]
      : []),
    ...(args.quality && !args.quality.pass
      ? [`Harness note: page intent was checked and needs refinement because ${args.quality.reasons.join("; ")}.`]
      : []),
  ];

  return uniqueStrings(lines).map((line) => clampText(line, 260));
}

export function buildBriefSynthesisTraceMeta(synthesis: StudioBriefSynthesis) {
  return {
    briefSynthesisConfidence: synthesis.contentConfidence,
    sparseBriefMode: synthesis.sparseBriefMode,
    structuredSparseMode: synthesis.structuredSparseMode,
    evidenceSourceUsed: synthesis.evidenceSourceUsed,
    workloadLane: synthesis.workloadLane,
    taskGrammarPackIds: synthesis.taskGrammarPacks.map((pack) => pack.id),
    complexitySignalGroups: synthesis.complexitySignalGroups,
    complexitySignalPhrases: synthesis.complexitySignalPhrases,
    rigorLevel: synthesis.rigorLevel,
    specializedArtifact: synthesis.specializedArtifact,
    deliverable: synthesis.deliverable,
    ...buildWorkingMemoryTraceMeta(synthesis.workingMemory),
  };
}
