import {
  clampText,
  normalizeStudioText,
  splitBriefLines,
  splitBriefSentences,
  stripInstructionalLead,
  uniqueStrings,
} from "./brief.js";
import { extractRequestedDeckPageCount } from "./page-count.js";
import type {
  DeckThinkingMode,
  SegmentedThinkingInputs,
  SemanticCorrectionResult,
  StudioEvidenceRegime,
  StudioOperator,
  StudioUserOperation,
  StudioWorkingMemory,
  WorkingMemoryAcceptanceResult,
  WorkingMemorySlotConfidence,
} from "./contracts.js";

const QUALITY_BAR_PATTERN =
  /\b(?:top\s+ibank\s+level|ibank(?:-|\s)?level|top\s+financial\s+institution(?:\s+like\s+[a-z0-9 .'-]+)?|institutional(?:\s+investor)?(?:-|\s)?grade|board(?:-|\s)?grade|publishable|expert(?:-|\s)?level|top(?:-|\s)?tier|premium|jp\s*morgan(?:\s+style)?|goldman\s+sachs(?:\s+style)?|morgan\s+stanley(?:\s+style)?)\b/gi;
const GENERIC_OBJECT_PATTERN =
  /^(?:ppt|deck|slides?|presentation|report|brief|memo|study|review|analysis|valuation|question|object|topic)$/i;
const INVALID_OBJECT_EDGE_PATTERN = /^(?:of|for|to)\b|\b(?:of|for|to)$/i;
const TASK_SHELL_PATTERN =
  /\b(?:\d+\s*pages?|page\s+\d+|page\s+ppt|ppt|slides?|deck|presentation|report|brief|memo)\b/gi;
const EXPORT_METADATA_TOKEN_PATTERN =
  /\b(?:data-export-[\w-]*|data-render-target|data-quality-intent|data-forbidden-interpretation|data-export-contract|semantic metadata)\b/i;

type ParsedObjectCandidate = {
  value: string;
  confidence: WorkingMemorySlotConfidence;
};

function compactDigest(text: string, maxItems: number) {
  if (!text.trim()) {
    return [];
  }

  return uniqueStrings([
    ...splitBriefLines(text).map((line) => stripInstructionalLead(line)),
    ...splitBriefSentences(text).map((sentence) => stripInstructionalLead(sentence)),
  ])
    .map((line) => clampText(line, 180))
    .filter(Boolean)
    .slice(0, maxItems);
}

function sentenceCaseOperation(operation: StudioUserOperation) {
  switch (operation) {
    case "compare":
      return "compare";
    case "value":
      return "value";
    case "critique":
      return "critique";
    case "narrate":
      return "narrate";
    case "synthesize":
      return "synthesize";
    case "explain":
      return "explain";
    default:
      return "understand";
  }
}

function humanizeEvidenceRegime(regime: StudioEvidenceRegime) {
  switch (regime) {
    case "source-backed":
      return "source-backed";
    case "mixed-inline-evidence":
      return "task inline evidence only";
    case "sparse-no-hard-data":
      return "sparse with no hard data";
    default:
      return "unknown";
  }
}

function hasEvidenceCue(text: string) {
  return (
    /(?:\d[\d,.]*\s*(?:%|x|times|bps|m|bn|k|million|billion)|[$€£¥]\s*\d|\b(?:according to|evidence|metric|revenue|cost|margin|volume|accident|safety|growth|decline|increase|decrease|result|finding|method)\b|:\s*[$€£¥]?\d)/i.test(
      text,
    ) || /(?:根据|证据|指标|收入|成本|利润|增长|下降|提升|事故|安全|结果|方法)/.test(text)
  );
}

function normalizeCandidate(text: string) {
  return normalizeStudioText(text)
    .replace(/^["'`([{]+|["'`)\]}]+$/g, "")
    .replace(/[{}]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripQualityBars(text: string) {
  return normalizeCandidate(text).replace(QUALITY_BAR_PATTERN, " ").replace(/\s+/g, " ").trim();
}

function cleanAudienceBar(text: string) {
  return normalizeCandidate(text)
    .replace(/^of\s+/i, "")
    .replace(/\bto\s+(?:do|create|build|make|prepare|draft)\b.*$/i, "")
    .replace(/\b(?:ppt|deck|slides?|presentation|report|brief|memo)\b.*$/i, "")
    .replace(/\b(?:valuation|case\s*study|architecture\s+review|research\s+readout|research\s+presentation|compare)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanObjectCandidate(text: string) {
  return normalizeCandidate(text)
    .replace(
      /\b(?:subject|topic|focus|object|source constraint|observed facts?|page plan|page\s*\d+|slide\s*\d+|主题|主題|对象|對象)\s*[:：][\s\S]*$/i,
      " ",
    )
    .replace(/^\d+\s*pages?\b/gi, " ")
    .replace(/^\d+\s*page\b/gi, " ")
    .replace(/^["'`([{]+|["'`)\]}]+$/g, "")
    .replace(/^of\s+/i, "")
    .replace(/^for\s+/i, "")
    .replace(/^to\s+/i, "")
    .replace(/^(?:a|an)\s+case(?:-|\s)?study\s+with\s+(?:a|an|the)?\s*(?:3d|three-dimensional|pseudo-3d)?\s*(?:cutaway|diagram|view|model)\s+of\s+/i, "")
    .replace(/\b(?:ppt|deck|slides?|presentation|report|brief|memo)\b/gi, " ")
    .replace(/\b(?:product\s+)?valuation\b$/i, " ")
    .replace(/\b(?:technical\s+)?architecture\s+review\b$/i, " ")
    .replace(/\bresearch\s+readout\b$/i, " ")
    .replace(/\b(?:case\s*study|case-study)\b$/i, " ")
    .replace(/\b(?:about|on|for)\b$/gi, " ")
    .replace(/\b(?:what|why|how)\b.*$/i, "")
    .replace(QUALITY_BAR_PATTERN, " ")
    .replace(/[.?!,;:。！？；：]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/([)\]}])\.$/, "$1");
}

function extractExplicitObjectCue(text: string) {
  for (const line of splitBriefLines(text)) {
    const match = line.match(/^\s*(?:subject|topic|focus|object|company|主题|主題|对象|對象|公司)\s*[:：]\s*(.+)$/i);
    const candidate = cleanObjectCandidate(match?.[1] ?? "");
    if (candidate && isPlausibleObject(candidate)) {
      return candidate;
    }
  }

  const inlineMatch = normalizeStudioText(text).match(
    /\b(?:subject|topic|focus|company|主题|主題|对象|對象|公司)\s*[:：]\s*([\s\S]*?)(?=\s+(?:source constraint|observed facts?|page plan|page\s*\d+|slide\s*\d+|layout|tone|anti-patterns|visual thesis|主题|主題|证据|證據)\s*[:：]|$)/i,
  );
  const inlineCandidate = cleanObjectCandidate(inlineMatch?.[1] ?? "");
  if (inlineCandidate && isPlausibleObject(inlineCandidate)) {
    return inlineCandidate;
  }

  return null;
}

function isPlausibleObject(text: string) {
  if (!text.trim()) {
    return false;
  }
  if (GENERIC_OBJECT_PATTERN.test(text)) {
    return false;
  }
  if (INVALID_OBJECT_EDGE_PATTERN.test(text)) {
    return false;
  }
  if (new RegExp(QUALITY_BAR_PATTERN.source, "i").test(text)) {
    return false;
  }
  if (EXPORT_METADATA_TOKEN_PATTERN.test(text)) {
    return false;
  }
  if (/^undefined$/i.test(text)) {
    return false;
  }
  return text.length >= 2;
}

function strongerSlotConfidence(
  left: WorkingMemorySlotConfidence,
  right: WorkingMemorySlotConfidence,
): WorkingMemorySlotConfidence {
  const rank: Record<WorkingMemorySlotConfidence, number> = {
    unknown: 0,
    low: 1,
    medium: 2,
    high: 3,
  };
  return rank[right] > rank[left] ? right : left;
}

function extractRequestedPageCount(taskText: string, requestedPageCount?: number | null) {
  return extractRequestedDeckPageCount(taskText, requestedPageCount);
}

function deriveDeliverable(taskText: string, requestedPageCount?: number | null) {
  const pageCount = extractRequestedPageCount(taskText, requestedPageCount);
  const normalized = normalizeStudioText(taskText);
  const base =
    /\bmemo\b/i.test(normalized)
      ? "memo deck"
      : /\breport\b/i.test(normalized) && !/\bppt|deck|slides?|presentation\b/i.test(normalized)
        ? "report"
        : "PPT";

  if (pageCount && base === "PPT") {
    return `${pageCount}-page PPT`;
  }
  if (pageCount && base !== "PPT") {
    return `${pageCount}-page ${base}`;
  }
  return base;
}

function extractAudienceBar(taskText: string) {
  const normalized = normalizeStudioText(taskText);
  const explicitContextMatch = normalized.match(
    /\bof\s+((?:top|leading|institutional|board(?:-|\s)?grade|expert(?:-|\s)?level|publishable|premium|jp\s*morgan|goldman\s+sachs|morgan\s+stanley)[^,.;]*?)\s+to\s+(?:do|create|build|make|prepare|draft)\b/i,
  );
  if (explicitContextMatch?.[1]) {
    const cleaned = cleanAudienceBar(explicitContextMatch[1]);
    if (cleaned) {
      return {
        value: cleaned,
        confidence: "high" as const,
      };
    }
  }

  const genericMatches = Array.from(normalized.matchAll(new RegExp(QUALITY_BAR_PATTERN.source, "gi")))
    .map((match) => cleanAudienceBar(match[0] ?? ""))
    .filter(Boolean);

  if (genericMatches.length > 0) {
    return {
      value: uniqueStrings(genericMatches).join(" | "),
      confidence: "medium" as const,
    };
  }

  return {
    value: null,
    confidence: "unknown" as const,
  };
}

function extractPrimaryObject(args: {
  taskText: string;
  globalHintsText: string;
  sourceMaterialText: string;
  audienceBar?: string | null;
}): ParsedObjectCandidate {
  const normalizedTask = normalizeStudioText(args.taskText);
  const audienceStrippedTask = args.audienceBar
    ? normalizeStudioText(normalizedTask.replace(args.audienceBar, " "))
    : normalizedTask;
  const explicitObjectCue = extractExplicitObjectCue(
    [args.taskText, args.globalHintsText, args.sourceMaterialText].filter(Boolean).join("\n"),
  );
  if (explicitObjectCue) {
    return {
      value: explicitObjectCue,
      confidence: "high",
    };
  }

  const specializedPatterns: Array<{ pattern: RegExp; confidence: WorkingMemorySlotConfidence }> = [
    { pattern: /\b(?:deck|presentation|slides?|ppt|report)\s+titled\s+["“]([^"”]+)["”]/i, confidence: "medium" },
    { pattern: /\b(?:deck|presentation|slides?|ppt|report)\s+titled\s+([^.;\n]+)/i, confidence: "medium" },
    { pattern: /\b(?:product\s+)?valuation\s+of\s+(.+)$/i, confidence: "high" },
    { pattern: /\b(?:technical\s+)?architecture\s+review\s+of\s+(.+)$/i, confidence: "high" },
    { pattern: /\bresearch\s+readout\s+(?:on|of|about)\s+(.+)$/i, confidence: "high" },
    { pattern: /\b(?:case\s*study|case-study)\s+(?:of|about|on|for)\s+(.+)$/i, confidence: "high" },
    { pattern: /\b(?:cutaway|diagram|view|model)\s+of\s+(?:a|an|the)?\s*(.+)$/i, confidence: "high" },
    { pattern: /\bcompare\s+(.+?\s+vs\.?\s+.+)$/i, confidence: "high" },
    { pattern: /\b(.+?)\s+(?:product\s+)?valuation\b/i, confidence: "high" },
    { pattern: /\b(?:ppt|deck|slides?|presentation|report)\s+(?:for|on|about)\s+(.+)$/i, confidence: "medium" },
  ];

  for (const entry of specializedPatterns) {
    const match = audienceStrippedTask.match(entry.pattern);
    const candidate = cleanObjectCandidate(match?.[1] ?? "");
    if (candidate && isPlausibleObject(candidate)) {
      return {
        value: candidate,
        confidence: entry.confidence,
      };
    }
  }

  const strippedTask = cleanObjectCandidate(
    stripQualityBars(
      audienceStrippedTask
        .replace(/^\d+\s*pages?\b/gi, " ")
        .replace(/\b(?:create|prepare|build|draft|design|make|need|want|show|do)\b/gi, " ")
        .replace(TASK_SHELL_PATTERN, " "),
    ),
  );
  if (strippedTask && isPlausibleObject(strippedTask)) {
    return {
      value: strippedTask,
      confidence: "medium",
    };
  }

  const fallback = compactDigest(
    [args.globalHintsText, args.sourceMaterialText].filter(Boolean).join("\n"),
    1,
  )[0];
  const cleanedFallback = cleanObjectCandidate(fallback ?? "");
  if (cleanedFallback && isPlausibleObject(cleanedFallback)) {
    return {
      value: cleanedFallback,
      confidence: "low",
    };
  }

  return {
    value: "unknown object",
    confidence: "unknown",
  };
}

function detectBrainToDeck(taskText: string, brief: string): boolean {
  const text = normalizeStudioText(taskText) || normalizeStudioText(brief);
  if (text.length > 500) return true;
  const hasBrainDumpCue =
    /\b(?:brain\s+dump|messy\s+notes|scattered\s+ideas|meeting\s+notes|meeting\s+minutes|raw\s+thoughts|unstructured|organize\s+my\s+thoughts|turn\s+this\s+into\s+(?:a\s+)?(?:ppt|deck|presentation)|make\s+this\s+presentable|visualize\s+my\s+ideas|structure\s+this|create\s+a\s+deck\s+from|one-pager|summarize\s+and\s+visualize|use\s+this\s+style|learn\s+this\s+template|extract\s+(?:the\s+)?design\s+style|整合|结构化|可视化|按这个风格|提取风格|学习这个模板)\b/i.test(
      text,
    );
  if (hasBrainDumpCue) return true;
  if (text.length > 200) {
    // If long and lacks a clear task shell (e.g., "1 page ppt of X"), treat as unstructured
    const hasTaskShell =
      /\b(?:\d+\s*pages?\s+(?:of|for|on|about)|\b(?:create|make|build)\s+a\s+(?:\d+\s*page\s+)?(?:ppt|deck|slides?|presentation)\s+(?:for|on|about))\b/i.test(text);
    if (!hasTaskShell) return true;
  }
  return false;
}

function deriveUserOperation(taskText: string): {
  value: StudioUserOperation;
  confidence: WorkingMemorySlotConfidence;
  thinkingModeHint: DeckThinkingMode | null;
} {
  const normalized = normalizeStudioText(taskText);

  if (/\bcompare\s+.+\bvs\.?\b.+/i.test(normalized)) {
    return {
      value: "compare",
      confidence: "high",
      thinkingModeHint: null,
    };
  }
  if (/\b(?:product\s+)?valuation|investment\s+case|diligence|valuation\s+memo|dcf|sotp|comps?\b/i.test(normalized)) {
    return {
      value: "value",
      confidence: "high",
      thinkingModeHint: null,
    };
  }
  if (/\b(?:case\s*study|case-study|application\s+case|customer\s+case|client\s+case|company\s+story|customer\s+story)\b/i.test(normalized) || /案例|应用案例|客户案例|实践案例/.test(taskText)) {
    return {
      value: "narrate",
      confidence: "high",
      thinkingModeHint: "case-study",
    };
  }
  if (/\b(?:research\s+readout|research\s+presentation|paper\s+presentation|result\s+synthesis|experiment|method|results?|discussion|limitations?)\b/i.test(normalized) || /论文汇报|研究汇报|学术汇报|研究报告/.test(taskText)) {
    return {
      value: "synthesize",
      confidence: "high",
      thinkingModeHint: "academic-research",
    };
  }
  if (/\b(?:architecture\s+review|technical\s+architecture|system\s+architecture|review|critique|teardown)\b/i.test(normalized)) {
    return {
      value: "critique",
      confidence: "medium",
      thinkingModeHint: null,
    };
  }

  return {
    value: "explain",
    confidence: normalized ? "medium" : "unknown",
    thinkingModeHint: null,
  };
}

function extractInlineEvidence(taskIntentText: string, primaryObject: string) {
  const objectKey = normalizeStudioText(primaryObject).toLowerCase();
  return splitBriefLines(taskIntentText)
    .map((line) => stripInstructionalLead(line))
    .filter((line) => {
      const normalized = normalizeStudioText(line);
      if (!normalized || normalized.toLowerCase() === objectKey) {
        return false;
      }
      if (TASK_SHELL_PATTERN.test(normalized) && !hasEvidenceCue(normalized)) {
        return false;
      }
      return normalized.length >= 24 && hasEvidenceCue(normalized);
    })
    .join("\n");
}

function deriveEvidenceRegime(args: {
  inputs: SegmentedThinkingInputs;
  primaryObject: string;
}): {
  regime: StudioEvidenceRegime;
  confidence: WorkingMemorySlotConfidence;
  evidenceBoundary: string[];
  sourceMaterialDigest: string[];
} {
  const inlineEvidence = extractInlineEvidence(args.inputs.taskIntentText, args.primaryObject);
  const sourceMaterialDigest = compactDigest(
    [args.inputs.sourceMaterialText, inlineEvidence].filter(Boolean).join("\n\n"),
    6,
  );

  if (args.inputs.sourceMaterialText.trim().length > 0) {
    return {
      regime: "source-backed",
      confidence: "high",
      evidenceBoundary: [
        "Treat source material as the only hard-evidence layer for metrics, citations, and factual callouts.",
        ...(sourceMaterialDigest.length > 0
          ? sourceMaterialDigest.slice(0, 3).map((item) => `Source cue: ${item}`)
          : []),
      ],
      sourceMaterialDigest,
    };
  }

  if (inlineEvidence.trim().length > 0) {
    return {
      regime: "mixed-inline-evidence",
      confidence: "medium",
      evidenceBoundary: [
        "Use only inline evidence explicitly present in the user task when citing facts or metrics.",
        "Do not upgrade thin inline context into source-backed certainty.",
        ...sourceMaterialDigest.slice(0, 2).map((item) => `Inline cue: ${item}`),
      ],
      sourceMaterialDigest,
    };
  }

  return {
    regime: "sparse-no-hard-data",
    confidence: "high",
    evidenceBoundary: [
      "No hard data is supplied; use qualitative reasoning only.",
      "Do not invent numeric metrics, dated facts, citations, or source-backed claims.",
    ],
    sourceMaterialDigest,
  };
}

function buildHardConstraints(args: {
  taskText: string;
  requestedPageCount?: number | null;
  evidenceRegime: StudioEvidenceRegime;
}) {
  const constraints = [
    ...(extractRequestedPageCount(args.taskText, args.requestedPageCount)
      ? [`Keep the deliverable within ${extractRequestedPageCount(args.taskText, args.requestedPageCount)} page(s).`]
      : []),
    ...(hasEvidenceCue(args.taskText) ? [] : ["Keep proof restrained when hard evidence is absent."]),
    ...(args.evidenceRegime === "sparse-no-hard-data"
      ? ["Never fabricate hard evidence to make the page feel fuller."]
      : []),
  ];

  return uniqueStrings(constraints);
}

function buildUnknowns(args: {
  primaryObject: string;
  objectConfidence: WorkingMemorySlotConfidence;
  audienceBar: string | null;
  evidenceRegime: StudioEvidenceRegime;
}) {
  const unknowns: string[] = [];
  if (args.objectConfidence === "low" || args.objectConfidence === "unknown" || !isPlausibleObject(args.primaryObject)) {
    unknowns.push("Primary object is still low-confidence; keep claims conservative and object-centered.");
  }
  if (!args.audienceBar) {
    unknowns.push("Audience quality bar is implicit rather than explicit.");
  }
  if (args.evidenceRegime === "sparse-no-hard-data") {
    unknowns.push("No hard data is available for evidence-backed metrics.");
  }
  return unknowns;
}

function buildTaskOperator(operation: StudioUserOperation, primaryObject: string): StudioOperator {
  switch (operation) {
    case "value":
      return {
        id: "task.value",
        kind: "task",
        title: "Valuation operator",
        lines: [
          `Treat ${primaryObject} as the valuation object, not as a generic overview topic.`,
          "Hold the page around one valuation frame, one or two drivers, and one disciplined conclusion.",
        ],
        rendererLines: [
          "Keep the page in valuation mode rather than drifting into a general company description.",
        ],
      };
    case "narrate":
      return {
        id: "task.narrate",
        kind: "task",
        title: "Case narrative operator",
        lines: [
          `Frame ${primaryObject} as a case story with context, challenge, intervention, and outcome.`,
        ],
        rendererLines: ["Keep the page anchored in one visible case move or case lesson."],
      };
    case "synthesize":
      return {
        id: "task.synthesize",
        kind: "task",
        title: "Research synthesis operator",
        lines: [
          `Treat ${primaryObject} as a result synthesis problem: question, method boundary, result, and interpretation.`,
        ],
        rendererLines: ["Keep the result pattern tied to the evidence or method boundary."],
      };
    case "critique":
      return {
        id: "task.critique",
        kind: "task",
        title: "Review operator",
        lines: [
          `Use one judgment lens to critique or review ${primaryObject} rather than broad descriptive filler.`,
        ],
        rendererLines: ["Center the page on one judgment, constraint, or trade-off."],
      };
    case "compare":
      return {
        id: "task.compare",
        kind: "task",
        title: "Comparison operator",
        lines: [
          `Keep ${primaryObject} as a direct comparison instead of collapsing it into a single-topic explainer.`,
        ],
        rendererLines: ["Make the comparison logic legible in one scan."],
      };
    default:
      return {
        id: "task.explain",
        kind: "task",
        title: "Explain operator",
        lines: [`Explain ${primaryObject} through one claim and one proof pattern.`],
        rendererLines: ["Keep the page centered on one audience-facing point."],
      };
  }
}

function buildEvidenceOperator(regime: StudioEvidenceRegime): StudioOperator {
  return {
    id: `evidence.${regime}`,
    kind: "evidence",
    title: "Evidence operator",
    lines:
      regime === "source-backed"
        ? ["Use source-backed material for factual callouts and keep unsupported filler out."]
        : regime === "mixed-inline-evidence"
          ? ["Treat inline evidence as thin support only; do not overstate certainty."]
          : ["Reason qualitatively and do not fabricate hard proof."],
    rendererLines:
      regime === "source-backed"
        ? ["Use only the supplied evidence for factual callouts."]
        : ["Do not fabricate numeric or source-backed proof."],
  };
}

function buildCurrentPageMission(args: {
  primaryObject: string;
  userOperation: StudioUserOperation;
  evidenceRegime: StudioEvidenceRegime;
}) {
  const object = args.primaryObject || "the object";
  const commonLead = `Answer one question about ${object} and land one clear claim.`;
  switch (args.userOperation) {
    case "value":
      return [
        commonLead,
        `Value ${object} through one disciplined frame, one or two drivers, and a bounded conclusion.`,
        args.evidenceRegime === "sparse-no-hard-data"
          ? "Stay qualitative; do not invent valuation outputs, comps, or multiples."
          : "Use factual evidence only where the supplied material supports it.",
      ];
    case "narrate":
      return [
        commonLead,
        `Keep the case mission around one challenge, intervention, or outcome for ${object}.`,
      ];
    case "synthesize":
      return [
        commonLead,
        `Keep the research mission around one result pattern and one careful interpretation for ${object}.`,
      ];
    case "critique":
      return [
        commonLead,
        `Use one judgment lens, one constraint, or one trade-off to critique ${object}.`,
      ];
    case "compare":
      return [
        commonLead,
        `Keep the page as one comparison read, not two unrelated mini-pages about ${object}.`,
      ];
    default:
      return [
        commonLead,
        `Explain ${object} with only the support needed to make the main claim understandable.`,
      ];
  }
}

function buildAcceptanceChecks(operation: StudioUserOperation) {
  return uniqueStrings([
    "Primary object must remain the thing being analyzed, not the audience bar or quality standard.",
    "Deliverable, operation, and object must point to the same task.",
    "Current page mission must stay anchored to the primary object.",
    "Sparse evidence mode must not produce invented hard proof.",
    ...(operation === "value"
      ? ["Valuation pages must preserve value, driver, or scenario language once the object is correct."]
      : []),
  ]);
}

export function assessStudioWorkingMemory(memory: StudioWorkingMemory): WorkingMemoryAcceptanceResult {
  const reasons: string[] = [];
  if (!isPlausibleObject(memory.primaryObject)) {
    reasons.push("primary object is implausible or malformed");
  }
  if (memory.audienceBar && normalizeStudioText(memory.primaryObject).includes(normalizeStudioText(memory.audienceBar))) {
    reasons.push("audience bar leaked into the primary object");
  }
  if (INVALID_OBJECT_EDGE_PATTERN.test(memory.primaryObject)) {
    reasons.push("primary object starts or ends with a dangling connector");
  }
  if (memory.userOperation === "value" && !/\bvalue|valuation|asset|product\b/i.test(memory.currentPageMission.join(" "))) {
    reasons.push("valuation mission lost valuation semantics");
  }
  if (memory.evidenceRegime === "sparse-no-hard-data" && memory.sourceMaterialDigest.length > 0) {
    reasons.push("sparse evidence regime conflicts with detected source material");
  }
  return {
    pass: reasons.length === 0,
    reasons,
  };
}

function applySemanticCorrection(args: {
  rawBrief: string;
  taskText: string;
  inputs: SegmentedThinkingInputs;
  memory: Omit<StudioWorkingMemory, "semanticCorrection" | "acceptanceResult">;
}): Pick<StudioWorkingMemory, "primaryObject" | "audienceBar" | "unknowns" | "slotConfidence" | "semanticCorrection" | "acceptanceResult"> {
  const acceptanceResult = assessStudioWorkingMemory({
    ...args.memory,
    semanticCorrection: {
      attempted: false,
      pass: true,
      reason: "not evaluated yet",
      correctedSlots: [],
    },
    acceptanceResult: {
      pass: true,
      reasons: [],
    },
  });

  if (
    acceptanceResult.pass &&
    args.memory.slotConfidence.primaryObject !== "low" &&
    args.memory.slotConfidence.primaryObject !== "unknown"
  ) {
    return {
      primaryObject: args.memory.primaryObject,
      audienceBar: args.memory.audienceBar,
      unknowns: args.memory.unknowns,
      slotConfidence: args.memory.slotConfidence,
      semanticCorrection: {
        attempted: false,
        pass: true,
        reason: "deterministic parse was already stable",
        correctedSlots: [],
      },
      acceptanceResult,
    };
  }

  const fallbackObject = extractPrimaryObject({
    taskText: args.taskText
      .replace(/\bof\s+((?:top|leading|institutional|board(?:-|\s)?grade|expert(?:-|\s)?level|publishable|premium|jp\s*morgan|goldman\s+sachs|morgan\s+stanley)[^,.;]*?)\s+to\s+(?:do|create|build|make|prepare|draft)\b/i, " ")
      .replace(/\bfor\s+((?:top|leading|institutional|board(?:-|\s)?grade|expert(?:-|\s)?level|publishable|premium|jp\s*morgan|goldman\s+sachs|morgan\s+stanley)[^,.;]*)$/i, " "),
    globalHintsText: args.inputs.globalHintsText,
    sourceMaterialText: args.inputs.sourceMaterialText,
    audienceBar: args.memory.audienceBar,
  });
  const correctedPrimaryObject =
    isPlausibleObject(fallbackObject.value) && fallbackObject.value !== args.memory.primaryObject
      ? fallbackObject.value
      : args.memory.primaryObject;
  const correctedObjectConfidence =
    isPlausibleObject(fallbackObject.value) && fallbackObject.value === args.memory.primaryObject
      ? strongerSlotConfidence(args.memory.slotConfidence.primaryObject, fallbackObject.confidence)
      : correctedPrimaryObject !== args.memory.primaryObject
        ? fallbackObject.confidence
        : args.memory.slotConfidence.primaryObject;
  const slotConfidence = {
    ...args.memory.slotConfidence,
    primaryObject: correctedObjectConfidence,
  };
  const correctedUnknowns = buildUnknowns({
    primaryObject: correctedPrimaryObject,
    objectConfidence: slotConfidence.primaryObject,
    audienceBar: args.memory.audienceBar,
    evidenceRegime: args.memory.evidenceRegime,
  });
  const correctedMemory = {
    ...args.memory,
    primaryObject: correctedPrimaryObject,
    unknowns: correctedUnknowns,
    slotConfidence,
  };
  const correctedAcceptance = assessStudioWorkingMemory({
    ...correctedMemory,
    semanticCorrection: {
      attempted: true,
      pass: true,
      reason: "deterministic correction applied",
      correctedSlots: correctedPrimaryObject !== args.memory.primaryObject ? ["primaryObject"] : [],
    },
    acceptanceResult: {
      pass: true,
      reasons: [],
    },
  });

  return {
    primaryObject: correctedPrimaryObject,
    audienceBar: args.memory.audienceBar,
    unknowns: correctedUnknowns,
    slotConfidence,
    semanticCorrection: {
      attempted: true,
      pass: correctedAcceptance.pass,
      reason:
        correctedPrimaryObject !== args.memory.primaryObject
          ? `Corrected the primary object from "${args.memory.primaryObject}" to "${correctedPrimaryObject}".`
          : "Tried a deterministic correction pass but kept the original slots.",
      correctedSlots: correctedPrimaryObject !== args.memory.primaryObject ? ["primaryObject"] : [],
    } satisfies SemanticCorrectionResult,
    acceptanceResult: correctedAcceptance,
  };
}

export function buildStudioWorkingMemory(args: {
  brief: string;
  inputs: SegmentedThinkingInputs;
  requestedPageCount?: number | null;
}): StudioWorkingMemory {
  const taskText =
    normalizeStudioText([args.inputs.taskIntentText, args.inputs.globalHintsText].filter(Boolean).join(" ")) ||
    normalizeStudioText(args.brief);
  const audience = extractAudienceBar(taskText);
  const object = extractPrimaryObject({
    taskText,
    globalHintsText: args.inputs.globalHintsText,
    sourceMaterialText: args.inputs.sourceMaterialText,
    audienceBar: audience.value,
  });
  const isBrainToDeck = detectBrainToDeck(taskText, args.brief);
  const baseOperation = deriveUserOperation(taskText);
  const operation = isBrainToDeck
    ? {
        value: "synthesize" as StudioUserOperation,
        confidence: "medium" as WorkingMemorySlotConfidence,
        thinkingModeHint: "brain-to-deck" as DeckThinkingMode,
      }
    : baseOperation;
  const deliverable = deriveDeliverable(taskText, args.requestedPageCount);
  const evidence = deriveEvidenceRegime({
    inputs: args.inputs,
    primaryObject: object.value,
  });
  const brainDumpDigest = isBrainToDeck ? compactDigest(args.brief, 10) : [];
  const sourceMaterialDigest = isBrainToDeck
    ? uniqueStrings([...brainDumpDigest, ...evidence.sourceMaterialDigest]).slice(0, 10)
    : evidence.sourceMaterialDigest;
  const baseMemory = {
    rawBrief: args.brief,
    primaryObject: object.value,
    userOperation: operation.value,
    deliverable,
    audienceBar: audience.value,
    evidenceRegime: evidence.regime,
    hardConstraints: buildHardConstraints({
      taskText,
      requestedPageCount: args.requestedPageCount,
      evidenceRegime: evidence.regime,
    }),
    unknowns: buildUnknowns({
      primaryObject: object.value,
      objectConfidence: object.confidence,
      audienceBar: audience.value,
      evidenceRegime: evidence.regime,
    }),
    currentPageMission: buildCurrentPageMission({
      primaryObject: object.value,
      userOperation: operation.value,
      evidenceRegime: evidence.regime,
    }),
    acceptanceChecks: buildAcceptanceChecks(operation.value),
    slotConfidence: {
      primaryObject: object.confidence,
      userOperation: operation.confidence,
      deliverable: (deliverable === "PPT" ? "medium" : "high") as WorkingMemorySlotConfidence,
      audienceBar: audience.confidence,
      evidenceRegime: evidence.confidence,
    },
    sourceMaterialDigest,
    evidenceBoundary: evidence.evidenceBoundary,
    internalOperators: [
      buildTaskOperator(operation.value, object.value),
      buildEvidenceOperator(evidence.regime),
    ],
    thinkingModeHint: operation.thinkingModeHint,
  };

  const correction = applySemanticCorrection({
    rawBrief: args.brief,
    taskText,
    inputs: args.inputs,
    memory: baseMemory,
  });

  return {
    ...baseMemory,
    primaryObject: correction.primaryObject,
    audienceBar: correction.audienceBar,
    unknowns: correction.unknowns,
    slotConfidence: correction.slotConfidence,
    semanticCorrection: correction.semanticCorrection,
    acceptanceResult: correction.acceptanceResult,
    currentPageMission: buildCurrentPageMission({
      primaryObject: correction.primaryObject,
      userOperation: operation.value,
      evidenceRegime: evidence.regime,
    }),
    internalOperators: [
      buildTaskOperator(operation.value, correction.primaryObject),
      buildEvidenceOperator(evidence.regime),
    ],
  };
}

export function buildWorkingMemoryHypothesisLines(args: {
  workingMemory: StudioWorkingMemory;
  thinkingMode?: DeckThinkingMode | null;
  workloadLane?: "fast" | "deep" | null;
  specializedArtifact?: string | null;
  visualOperatorLines?: string[];
}) {
  return uniqueStrings([
    `Primary object: ${args.workingMemory.primaryObject}.`,
    `User operation: ${sentenceCaseOperation(args.workingMemory.userOperation)}.`,
    `Requested deliverable: ${args.workingMemory.deliverable}.`,
    ...(args.specializedArtifact ? [`Artifact: ${args.specializedArtifact}.`] : []),
    ...(args.workingMemory.audienceBar ? [`Audience bar: ${args.workingMemory.audienceBar}.`] : []),
    ...(args.thinkingMode ? [`Internal mode hint: ${args.thinkingMode}.`] : []),
    ...(args.workloadLane ? [`Internal depth: ${args.workloadLane}.`] : []),
    ...args.workingMemory.internalOperators.flatMap((operator) => operator.rendererLines ?? []),
    ...(args.visualOperatorLines ?? []),
  ]).map((line) => clampText(line, 220));
}

export function buildWorkingMemoryBoundaryLines(workingMemory: StudioWorkingMemory) {
  return uniqueStrings([
    `Evidence regime: ${humanizeEvidenceRegime(workingMemory.evidenceRegime)}.`,
    ...workingMemory.evidenceBoundary,
    ...(workingMemory.unknowns.length > 0
      ? ["Known unknowns:", ...workingMemory.unknowns]
      : ["No major unknowns were detected beyond the stated evidence boundary."]),
  ]).map((line) => clampText(line, 220));
}

export function buildWorkingMemoryTraceMeta(memory: StudioWorkingMemory) {
  return {
    wmPrimaryObject: memory.primaryObject,
    wmUserOperation: memory.userOperation,
    wmAudienceBar: memory.audienceBar,
    wmEvidenceRegime: memory.evidenceRegime,
    wmUnknownCount: memory.unknowns.length,
    semanticCorrectionAttempted: memory.semanticCorrection.attempted,
    semanticCorrectionPass: memory.semanticCorrection.pass,
    workingMemoryAcceptancePass: memory.acceptanceResult.pass,
    workingMemoryAcceptanceReasons: memory.acceptanceResult.reasons,
  };
}
