import type {
  DeckThinkingMode,
  EvidenceGraph,
  ResolvedThinkingContext,
  SegmentedThinkingInputs,
  ThinkingModePlugin,
} from "./contracts.js";

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function countMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function stripCodeFence(block: string) {
  return block
    .replace(/^```[^\n]*\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
}

function splitParagraphs(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function compactParagraphs(paragraphs: string[]) {
  return paragraphs
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function hasTaskShapeCue(text: string) {
  return /\b(\d+\s*page|page\s+\d+|ppt|deck|slides?|presentation|report|case study|research presentation|academic presentation|board deck|investor deck|brief)\b/.test(
    text,
  ) || /(?:\d+\s*页|PPT|汇报|报告|案例|演示文稿|做一页|做两页)/.test(text);
}

function hasTaskVerbCue(text: string) {
  return /\b(create|make|build|generate|design|prepare|write|draft|turn|convert|summarize|outline|need|want)\b/.test(
    text,
  ) || /(?:生成|制作|准备|整理|输出|总结|撰写|写一个|做一个|做两页|想做|需要)/.test(text);
}

function isLikelyTaskIntentParagraph(text: string, index: number) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return false;
  }

  if (index === 0 && normalized.length <= 320 && (hasTaskShapeCue(normalized) || hasTaskVerbCue(normalized))) {
    return true;
  }

  if (normalized.length > 340) {
    return false;
  }

  return hasTaskShapeCue(normalized) && (hasTaskVerbCue(normalized) || index <= 1);
}

function isLikelyGlobalHintParagraph(text: string) {
  const normalized = normalizeText(text);
  if (!normalized || normalized.length > 260) {
    return false;
  }

  return /\b(keep|avoid|use|prefer|do not|don't|must|should|tone|style|professional|restrained|light|3d|single claim|one page|one answer|chart)\b/.test(
    normalized,
  ) || /(?:保持|避免|不要|克制|专业|轻一点|图表|3d|单页|一页|一个论点|一件事)/.test(text);
}

function isLikelySourceMaterialParagraph(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return false;
  }

  const sentenceLikeCount = text
    .split(/[.!?。！？]/)
    .map((entry) => entry.trim())
    .filter(Boolean).length;

  return (
    text.length >= 420 ||
    sentenceLikeCount >= 5 ||
    /^>/.test(text) ||
    /\[[0-9]+\]/.test(text) ||
    /\b(according to|background|abstract|introduction|literature review|discussion|methodology|this report|the report|as the cornerstone)\b/.test(
      normalized,
    ) ||
    /(?:根据|背景|摘要|引言|文献综述|讨论|方法|本报告|研究背景)/.test(text)
  );
}

const EXPLICIT_CASE_STUDY_TASK_PATTERNS = [
  /\bcase study\b/,
  /\bcase-study\b/,
  /\bapplication case\b/,
  /\bimplementation case\b/,
  /\bpractice case\b/,
  /\bcustomer case\b/,
  /\bclient case\b/,
  /\bcompany story\b/,
  /\bcustomer story\b/,
  /案例/,
  /案例分析/,
  /应用案例/,
  /实践案例/,
  /客户案例/,
];

const EXPLICIT_ACADEMIC_TASK_PATTERNS = [
  /\bresearch presentation\b/,
  /\bacademic presentation\b/,
  /\bpaper presentation\b/,
  /\bconference presentation\b/,
  /\bjournal presentation\b/,
  /\bscientific presentation\b/,
  /论文汇报/,
  /研究汇报/,
  /学术汇报/,
  /研究报告/,
  /论文报告/,
];

const EXPLICIT_STRATEGY_TASK_PATTERNS = [
  /\bboard deck\b/,
  /\binvestor deck\b/,
  /\bexecutive deck\b/,
  /\bdecision brief\b/,
  /\brecommendation\b/,
  /\bpriorit(?:y|ies)\b/,
  /\bleadership\b/,
  /\bsteerco\b/,
  /\bsteering committee\b/,
  /董事会/,
  /管理层/,
  /投资人/,
  /优先级/,
  /决策/,
  /建议/,
];

export const THINKING_MODE_PLUGINS: Record<DeckThinkingMode, ThinkingModePlugin> = {
  neutral: {
    mode: "neutral",
    label: "Neutral Core",
    summary: "Keep the deck genre-neutral and let the material choose the narrative shape.",
    questionLabel: "Page question",
    planningPromptLines: [
      "Use neutral report language by default. Do not assume the deck is for a board, leadership team, or investor audience unless the brief says so.",
      "Choose the most natural narrative order for the material instead of forcing a strategy-report structure.",
    ],
    pagePromptLines: [
      "Keep the page genre-neutral: one question, one claim, one proof pattern.",
      "Favor direct explanatory language over memo headers or recommendation theater.",
    ],
    repairPromptLines: [
      "Preserve a neutral report tone during repair.",
      "Do not add leadership, board, investor, or recommendation framing unless it was already present in the brief or page.",
    ],
    heuristicPlanningLines: [
      "When page count is tight, delete weak secondary material instead of inventing a formal recommendation close.",
      "Use page titles that describe the content plainly and professionally.",
    ],
    longFormSequencingLines: [
      "Opening pages should establish the question, core claim, and the first important pattern.",
      "Middle pages should concentrate on proof, evidence, or structured analysis.",
      "Tail pages should synthesize, qualify, or support the story without assuming an appendix mindset.",
    ],
    bannedLexicon: ["board-ready", "leadership action", "executive summary", "strategic implications"],
  },
  strategy: {
    mode: "strategy",
    label: "Strategy",
    summary: "Use thesis / proof / implication / decision grammar when the brief is explicitly strategic.",
    questionLabel: "Decision question",
    planningPromptLines: [
      "A recommendation-first structure is allowed when the brief explicitly asks for direction, prioritization, or decision support.",
      "Use thesis, proof, implication, and decision sequencing without overloading any one page.",
    ],
    pagePromptLines: [
      "Let the page answer one decision question and resolve to one clear recommendation, implication, or prioritization move.",
      "Strategy language is allowed, but keep it evidence-led rather than generic consulting filler.",
    ],
    repairPromptLines: [
      "Preserve the decision-support framing during repair.",
      "Compress copy before weakening the recommendation or the proof chain behind it.",
    ],
    heuristicPlanningLines: [
      "Use recommendation-first logic only when the brief clearly asks for strategic direction.",
      "Close with one implication, prioritization, or next move rather than generic wrap-up language.",
    ],
    longFormSequencingLines: [
      "Opening pages may establish the thesis early.",
      "Middle pages should prove the argument through evidence and trade-offs.",
      "Tail pages may resolve priorities, guardrails, or supporting evidence.",
    ],
    bannedLexicon: [],
  },
  "case-study": {
    mode: "case-study",
    label: "Case Study",
    summary: "Use context / challenge / intervention / outcome / lesson grammar for narrative case material.",
    questionLabel: "Case question",
    planningPromptLines: [
      "Treat the deck as a case narrative when the brief is about one company, customer, rollout, or before/after story.",
      "Prefer context, challenge, intervention, outcome, and lesson sequencing over recommendation-first strategy logic.",
    ],
    pagePromptLines: [
      "Keep the page in case-study mode: frame the situation, the move, or the outcome clearly.",
      "Do not rewrite the case as a leadership memo or strategy recommendation unless the brief explicitly asks for that lens.",
    ],
    repairPromptLines: [
      "Preserve the case-study voice during repair.",
      "Do not convert context, intervention, or outcome pages into generic executive-summary language.",
    ],
    heuristicPlanningLines: [
      "Let the story move through situation, tension, action, and result.",
      "If page count is fixed, cut side commentary before mixing the lesson and the intervention into the same page.",
    ],
    longFormSequencingLines: [
      "Opening pages should orient the audience to the case and the central challenge.",
      "Middle pages should show intervention, evidence, and outcome patterns.",
      "Tail pages should capture lessons, limitations, or supporting details.",
    ],
    bannedLexicon: ["board question", "strategic implications", "decision priorities", "leadership action"],
  },
  "academic-research": {
    mode: "academic-research",
    label: "Academic Research",
    summary: "Use question / background / method / result / interpretation / limitation grammar for research decks.",
    questionLabel: "Research question",
    planningPromptLines: [
      "Treat the deck as an academic or scientific presentation when the brief signals a paper, study, experiment, or results presentation.",
      "Use question, background, method, result, interpretation, and limitation-or-next-work sequencing.",
    ],
    pagePromptLines: [
      "Keep the page in research mode: state the question, method, result, or interpretation directly.",
      "Do not default to recommendation-first, leadership, or board framing unless the brief explicitly asks for an applied decision brief.",
    ],
    repairPromptLines: [
      "Preserve the research framing during repair.",
      "Do not rewrite results, methods, or limitations into strategic recommendations.",
    ],
    heuristicPlanningLines: [
      "Lead with the research question or key finding, not a generic executive summary.",
      "Protect method/result/interpretation separation when page count is fixed.",
    ],
    longFormSequencingLines: [
      "Opening pages should establish the question, context, and method or key finding.",
      "Middle pages should concentrate on results and supporting analysis.",
      "Tail pages should interpret findings, acknowledge limitations, and include supporting detail only when needed.",
    ],
    bannedLexicon: ["board-ready", "leadership action", "recommendation-first", "strategic implications"],
  },
  "brain-to-deck": {
    mode: "brain-to-deck",
    label: "Brain-to-Deck",
    summary: "Transform raw, unstructured brain dumps into a polished, visually disciplined deck.",
    questionLabel: "Core theme",
    planningPromptLines: [
      "Treat the brief as raw material: extract 3-7 core themes and rebuild them into a coherent narrative.",
      "Lead with conclusions: every slide title must be an action title (a complete sentence stating the point).",
      "Strip decoration: no 3D, no shadows, no rounded corners, no gradients, no glow.",
    ],
    pagePromptLines: [
      "Restructure the page around one clear claim and the strongest supporting evidence.",
      "Preserve the user's original data points, but reframe them into a visual hierarchy.",
      "Avoid generic corporate filler; keep the voice close to the source material.",
    ],
    repairPromptLines: [
      "During repair, preserve the action-title discipline and visual restraint.",
      "Do not let decorative defaults creep back in.",
    ],
    heuristicPlanningLines: [
      "Identify the single most important insight and make it the headline.",
      "Group supporting details into one dominant proof region and at most one compact annotation.",
    ],
    longFormSequencingLines: [
      "Opening: state the synthesized thesis or the most important takeaway.",
      "Middle: present evidence, comparisons, and data in a structured flow.",
      "Close: land one clear implication or next step without generic wrap-up language.",
    ],
    bannedLexicon: ["3D", "shadow", "rounded corners", "gradient", "glow", "decorative"],
  },
};

function detectAcademicResearch(text: string) {
  const scrubbedText = text.replace(/\bcase study\b/g, "case-narrative");
  const financeOrBusinessResearchContext =
    /\b(equity[- ]research|investment[- ]research|sell[- ]side research|market research|broker research|morgan stanley research|china equity strategy|valuation|sotp|dcf|target price|price target|upside|downside|roe|eps|p\/e|p\/b|market cap|business model|business-model|investor deck|investment deck|equity investment|financial model|finance)\b/.test(
      scrubbedText,
    ) ||
    /(?:股票研究|证券研究|投研|估值|目标价|上行空间|下行空间|投资组合|商业模式|金融|财经|券商|摩根士丹利)/.test(
      text,
    );
  const strictAcademicCue =
    /\b(academic|scientific|paper|experiment|hypothesis|literature review|methodology|methods|poster session|conference paper|journal|dataset|clinical trial|lab result|laboratory)\b/.test(
      scrubbedText,
    ) || /(?:学术|科学|论文|实验|假设|文献综述|研究方法|期刊|数据集|临床试验|实验室)/.test(text);

  if (financeOrBusinessResearchContext && !strictAcademicCue) {
    return false;
  }

  const explicitResearchCue = /\b(academic|research|scientific|paper|study|experiment|hypothesis|literature review|methodology|methods|results|discussion|poster session|conference paper|journal|dataset)\b/.test(
    scrubbedText,
  );
  const score = countMatches(scrubbedText, [
    /\bpaper\b/,
    /\bresearch\b/,
    /\bstudy\b/,
    /\bexperiment\b/,
    /\bhypothesis\b/,
    /\bmethod\b/,
    /\bresults\b/,
    /\bdiscussion\b/,
    /\bliterature review\b/,
    /\bdataset\b/,
    /\bfindings\b/,
    /\babstract\b/,
  ]);
  return explicitResearchCue || score >= 2;
}

function detectCaseStudy(text: string) {
  const explicitCaseCue = /\b(case study|customer story|client story|company story|before[- ]after|problem[- ]solution|rollout|implementation case|transformation case|use case|case narrative)\b/.test(
    text,
  );
  const score = countMatches(text, [
    /\bcase study\b/,
    /\bcustomer\b/,
    /\bclient\b/,
    /\bbefore[- ]after\b/,
    /\bproblem[- ]solution\b/,
    /\bintervention\b/,
    /\brollout\b/,
    /\bimplementation\b/,
    /\boutcome\b/,
    /\blesson\b/,
  ]);
  return explicitCaseCue || score >= 2;
}

function detectStrategy(text: string) {
  const explicitStrategyCue = /\b(board|leadership|executive|investor|recommendation|decision|priorit(?:y|ies)|investment priorities|steerco|steering committee|operating model)\b/.test(
    text,
  );
  const score = countMatches(text, [
    /\bboard\b/,
    /\bleadership\b/,
    /\binvestor\b/,
    /\brecommendation\b/,
    /\bdecision\b/,
    /\bpriority\b/,
    /\bpriorities\b/,
    /\bstrategy\b/,
    /\bportfolio\b/,
    /\bnext move\b/,
  ]);
  return explicitStrategyCue || score >= 2;
}

function detectExplicitTaskMode(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return null;
  }

  if (
    EXPLICIT_ACADEMIC_TASK_PATTERNS.some((pattern) => pattern.test(normalized) || pattern.test(text)) ||
    ((/\b(method|methods|result|results|discussion)\b/.test(normalized) ||
      /(?:方法|结果|讨论)/.test(text)) &&
      /\b(research|paper|study|academic|scientific)\b/.test(normalized))
  ) {
    return "academic-research" as const;
  }

  if (EXPLICIT_CASE_STUDY_TASK_PATTERNS.some((pattern) => pattern.test(normalized) || pattern.test(text))) {
    return "case-study" as const;
  }

  if (EXPLICIT_STRATEGY_TASK_PATTERNS.some((pattern) => pattern.test(normalized) || pattern.test(text))) {
    return "strategy" as const;
  }

  return null;
}

function resolveSegmentedMode(text: string) {
  if (!text) {
    return null;
  }

  if (detectCaseStudy(text)) {
    return "case-study" as const;
  }

  if (detectAcademicResearch(text)) {
    return "academic-research" as const;
  }

  if (detectStrategy(text)) {
    return "strategy" as const;
  }

  return null;
}

export function getThinkingModePlugin(mode: DeckThinkingMode) {
  return THINKING_MODE_PLUGINS[mode];
}

export function segmentThinkingInputs(brief: string): SegmentedThinkingInputs {
  const sourceMaterialBlocks: string[] = [];
  const fencedMatches = [...brief.matchAll(/```[\s\S]*?```/g)];
  fencedMatches.forEach((match) => {
    const block = stripCodeFence(match[0]);
    if (block) {
      sourceMaterialBlocks.push(block);
    }
  });

  const briefWithoutFences = brief.replace(/```[\s\S]*?```/g, "\n\n");
  const paragraphs = splitParagraphs(briefWithoutFences);
  const taskIntentParagraphs: string[] = [];
  const globalHintParagraphs: string[] = [];

  paragraphs.forEach((paragraph, index) => {
    if (isLikelyTaskIntentParagraph(paragraph, index) && taskIntentParagraphs.length === 0) {
      taskIntentParagraphs.push(paragraph);
      return;
    }

    if (isLikelySourceMaterialParagraph(paragraph)) {
      sourceMaterialBlocks.push(paragraph);
      return;
    }

    if (taskIntentParagraphs.length === 0 && index === 0) {
      taskIntentParagraphs.push(paragraph);
      return;
    }

    if (isLikelyGlobalHintParagraph(paragraph) || paragraph.length <= 220) {
      globalHintParagraphs.push(paragraph);
      return;
    }

    sourceMaterialBlocks.push(paragraph);
  });

  const taskIntentText = compactParagraphs(taskIntentParagraphs);
  const sourceMaterialText = compactParagraphs(sourceMaterialBlocks);
  const globalHintsText = compactParagraphs(globalHintParagraphs);

  return {
    taskIntentText,
    sourceMaterialText,
    globalHintsText,
    sourceWeightProfile: {
      taskIntentChars: taskIntentText.length,
      sourceMaterialChars: sourceMaterialText.length,
      globalHintsChars: globalHintsText.length,
      sourceMaterialBlockCount: sourceMaterialBlocks.length,
      sourceDominant: sourceMaterialText.length > Math.max(taskIntentText.length, 1) * 1.4,
    },
  };
}

export function resolveDeckThinkingMode(
  brief: string,
  evidenceGraph?: Pick<EvidenceGraph, "claims" | "comparisonSets" | "timelineSets" | "nodes"> | null,
  segmentedInputs?: SegmentedThinkingInputs,
): ResolvedThinkingContext {
  const evidenceText = evidenceGraph
    ? [
        ...(evidenceGraph.claims ?? []),
        ...(evidenceGraph.comparisonSets ?? []).map((entry) => entry.title),
        ...(evidenceGraph.timelineSets ?? []).map((entry) => entry.title),
        ...(evidenceGraph.nodes ?? []).slice(0, 12).map((entry) => entry.label),
      ].join(" ")
    : "";
  const inputs = segmentedInputs ?? segmentThinkingInputs(brief);
  const directIntentText = normalizeText(
    [inputs.taskIntentText, inputs.globalHintsText, evidenceText].filter(Boolean).join(" "),
  );
  const sourceSupplementText = normalizeText(
    [inputs.sourceMaterialText, evidenceText].filter(Boolean).join(" "),
  );
  const explicitTaskMode = detectExplicitTaskMode(inputs.taskIntentText);

  if (explicitTaskMode) {
    return {
      mode: explicitTaskMode,
      reason:
        explicitTaskMode === "case-study"
          ? "The user task brief explicitly asks for a case-study genre, so source material cannot override it."
          : explicitTaskMode === "academic-research"
            ? "The user task brief explicitly asks for an academic or research presentation."
            : "The user task brief explicitly asks for a decision-support or strategy framing.",
      plugin: THINKING_MODE_PLUGINS[explicitTaskMode],
      inputs,
      lockedByTaskIntent: true,
    };
  }

  const intentMode = resolveSegmentedMode(directIntentText);
  if (intentMode) {
    return {
      mode: intentMode,
      reason:
        intentMode === "case-study"
          ? "The task intent and short user hints read most clearly as a case narrative."
          : intentMode === "academic-research"
            ? "The task intent reads most clearly as a research presentation."
            : "The task intent reads most clearly as a strategic decision brief.",
      plugin: THINKING_MODE_PLUGINS[intentMode],
      inputs,
      lockedByTaskIntent: false,
    };
  }

  const sourceSupplementMode = resolveSegmentedMode(sourceSupplementText);
  if (sourceSupplementMode) {
    return {
      mode: sourceSupplementMode,
      reason:
        sourceSupplementMode === "academic-research"
          ? "The brief lacks an explicit task genre, so the source material leans most clearly toward research framing."
          : sourceSupplementMode === "case-study"
            ? "The brief lacks an explicit task genre, so the source material reads most clearly as a case narrative."
            : "The brief lacks an explicit task genre, so the source material leans toward decision-support framing.",
      plugin: THINKING_MODE_PLUGINS[sourceSupplementMode],
      inputs,
      lockedByTaskIntent: false,
    };
  }

  return {
    mode: "neutral",
    reason:
      inputs.sourceWeightProfile.sourceDominant
        ? "The brief includes a large source-material block but no explicit presentation genre, so the deck stays neutral."
        : "The brief does not explicitly require a strategic, case-study, or academic framing.",
    plugin: THINKING_MODE_PLUGINS.neutral,
    inputs,
    lockedByTaskIntent: false,
  };
}
