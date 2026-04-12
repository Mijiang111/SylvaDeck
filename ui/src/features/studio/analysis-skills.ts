import type {
  DeckThinkingMode,
  GenerationAnalysisSkillDefinition,
  GenerationDesignPlan,
} from "./generation-contract";

const ANALYSIS_SKILL_REGISTRY: GenerationAnalysisSkillDefinition[] = [
  {
    id: "analysis.strategy-brief",
    label: "Strategy Brief",
    summary:
      "Use a recommendation-first analytical brief with one thesis, a few support points, and a practical close.",
    questionFrame: "What direction should the audience take now, and why?",
    argumentShape: [
      "Answer one decision question on the page.",
      "Lead with one explicit recommendation or thesis.",
      "Support it with two or three concise reasons or priorities.",
      "Close with one implication, action, or prioritization takeaway.",
    ],
    evidenceShape: [
      "Use short support points rather than long memo sections.",
      "Compress evidence into a few proof bullets or compact data clusters.",
    ],
    visualStrategy: [
      "Use one dominant headline zone, one support cluster, and one closing strip.",
      "Favor an authored editorial page over many equal panels.",
    ],
    preferredObjects: ["text", "rectangle", "line", "data"],
    avoidPatterns: [
      "Do not turn the page into a memo template with many section headings.",
      "Do not waste copy explaining that the page is only an overview.",
    ],
  },
  {
    id: "analysis.neutral-brief",
    label: "Neutral Brief",
    summary:
      "Use a genre-neutral explanatory page with one claim, a few support points, and one clean takeaway.",
    questionFrame: "What is the page trying to explain clearly?",
    argumentShape: [
      "Answer one page question on the page.",
      "Lead with one explicit claim.",
      "Support it with two or three concise reasons or proof points.",
      "Close with one implication or interpretive takeaway.",
    ],
    evidenceShape: [
      "Use short support points rather than long memo sections.",
      "Compress evidence into a few proof bullets or compact data clusters.",
    ],
    visualStrategy: [
      "Use one dominant headline zone, one support cluster, and one closing strip.",
      "Favor an authored editorial page over many equal panels.",
    ],
    preferredObjects: ["text", "rectangle", "line", "data"],
    avoidPatterns: [
      "Do not turn the page into a memo template with many section headings.",
      "Do not waste copy explaining that the page is only an overview.",
    ],
  },
  {
    id: "analysis.case-study-narrative",
    label: "Case Study Narrative",
    summary:
      "Use a case-study page grammar that moves through situation, challenge, intervention, outcome, or lesson without turning into a strategy memo.",
    questionFrame: "What happened in this case, what changed, and why does it matter?",
    argumentShape: [
      "Answer one case question on the page.",
      "Frame the situation, the move, or the outcome clearly.",
      "Keep the story causal and easy to follow.",
      "Close with one lesson or implication, not a second thesis.",
    ],
    evidenceShape: [
      "Use concrete artifacts, before/after proof, or outcomes from the case.",
      "Keep evidence close to the stage of the story it supports.",
    ],
    visualStrategy: [
      "Favor story, progression, and proof patterns over memo-like headers.",
      "Let one stage of the case dominate the page, with one small supporting zone.",
    ],
    preferredObjects: ["text", "rectangle", "line", "data"],
    avoidPatterns: [
      "Do not rewrite the page into a leadership recommendation.",
      "Do not flatten the case into many same-weight summary cards.",
    ],
  },
  {
    id: "analysis.academic-research",
    label: "Academic Research",
    summary:
      "Use research presentation grammar built around question, method, result, interpretation, and limitation.",
    questionFrame: "What is the research question, what did the method show, and how should the result be interpreted?",
    argumentShape: [
      "Answer one research question on the page.",
      "State the question, method, result, or interpretation directly.",
      "Keep one research move per page.",
      "Use interpretation carefully and avoid recommendation theater.",
    ],
    evidenceShape: [
      "Use result figures, method cues, annotations, or brief interpretation notes.",
      "Keep evidence traceable and technically legible.",
    ],
    visualStrategy: [
      "Favor chart, result, or annotation-led layouts over large hero rails.",
      "Keep support zones slim so the result stays dominant.",
    ],
    preferredObjects: ["chart", "text", "line", "rectangle", "data"],
    avoidPatterns: [
      "Do not turn a research page into an executive memo.",
      "Do not add recommendation-first language unless the brief explicitly asks for applied strategy framing.",
    ],
  },
  {
    id: "analysis.priority-stack",
    label: "Priority Stack",
    summary:
      "Structure the page around a ranked set of priorities, with explicit ordering and one directional takeaway.",
    questionFrame: "What should come first, second, and third?",
    argumentShape: [
      "Answer one ordering question on the page.",
      "State the overall direction first.",
      "Present the top priorities in ranked order.",
      "Explain what makes the leading priority matter most.",
    ],
    evidenceShape: [
      "Use ordered evidence, ranked drivers, or sequenced priorities.",
      "Keep each priority specific enough to act on.",
    ],
    visualStrategy: [
      "Create a strong primary thesis and one ordered evidence stack.",
      "Use one compact secondary panel for implication or risk.",
    ],
    preferredObjects: ["text", "data", "line", "rectangle"],
    avoidPatterns: [
      "Do not present all priorities as equal cards.",
      "Do not use decorative chronology when the page is really about ranking.",
    ],
  },
  {
    id: "analysis.comparison-tradeoff",
    label: "Comparison And Trade-off",
    summary:
      "Use the page to compare options, trade-offs, or benchmark positions and resolve toward one conclusion.",
    questionFrame: "Which option, position, or trade-off is better, and on what basis?",
    argumentShape: [
      "Answer one comparison question on the page.",
      "Define the comparison frame clearly.",
      "Show the key dimensions that separate the options.",
      "Resolve to one implication or recommendation.",
    ],
    evidenceShape: [
      "Use contrasted evidence, side-by-side criteria, or benchmark differences.",
      "Keep the dimensions meaningful and decision-relevant.",
    ],
    visualStrategy: [
      "Use a comparison-led composition with one conclusion zone.",
      "Asymmetry is better than two identical columns when one side wins.",
    ],
    preferredObjects: ["text", "data", "chart", "line", "rectangle"],
    avoidPatterns: [
      "Do not default to a generic 2x2 card wall.",
      "Do not list options without resolving the trade-off.",
    ],
  },
  {
    id: "analysis.time-series-relationship",
    label: "Time-Series Relationship",
    summary:
      "Explain how one or two changing variables move over time, highlight inflection points, and tie those changes to the page thesis.",
    questionFrame: "What changed over time, where did the relationship shift, and why does it matter?",
    argumentShape: [
      "Answer one trend question on the page.",
      "State the relationship or trend in one sentence.",
      "Highlight the most important turning points or regime changes.",
      "Close with the implication of the pattern.",
    ],
    evidenceShape: [
      "Use a time-series or dual-series view when the source supports it.",
      "Annotate inflection points rather than dumping raw chronology.",
    ],
    visualStrategy: [
      "Use one primary chart zone supported by a small insight or takeaway area.",
      "Annotations should point to inflection points, not repeat the axis labels.",
    ],
    preferredObjects: ["chart", "text", "line", "rectangle", "data"],
    avoidPatterns: [
      "Do not replace a true relationship page with a generic bullet summary.",
      "Do not use a chart unless the source actually supports the time pattern.",
    ],
  },
];

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function countRegexMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function countYears(text: string) {
  const matches = text.match(/\b(19|20)\d{2}\b/g);
  return matches ? matches.length : 0;
}

function getAnalysisSkill(skillId: GenerationAnalysisSkillDefinition["id"]) {
  return ANALYSIS_SKILL_REGISTRY.find((skill) => skill.id === skillId) ?? null;
}

export function resolveGenerationAnalysisSkill(args: {
  sourceText: string;
  pageTitle: string;
  pageNote: string;
  plan: GenerationDesignPlan;
  thinkingMode: DeckThinkingMode;
}) {
  const text = normalizeText([args.sourceText, args.pageTitle, args.pageNote].join(" "));

  const timeSeriesScore =
    countYears(text) +
    countRegexMatches(text, [
      /\bvs\b/,
      /\bversus\b/,
      /\btrend\b/,
      /\bover time\b/,
      /\btime[- ]series\b/,
      /\brelationship\b/,
      /\bcorrelation\b/,
      /\brate\b/,
      /\bprice\b/,
      /\byield\b/,
      /\bindex\b/,
    ]);
  if (timeSeriesScore >= 3) {
    return getAnalysisSkill("analysis.time-series-relationship");
  }

  const comparisonScore = countRegexMatches(text, [
    /\bcompare\b/,
    /\bcomparison\b/,
    /\bbenchmark\b/,
    /\bversus\b/,
    /\btrade[- ]?off\b/,
    /\boption\b/,
    /\balternative\b/,
    /\bscenario\b/,
    /\bchoice\b/,
  ]);
  if (comparisonScore >= 2) {
    return getAnalysisSkill("analysis.comparison-tradeoff");
  }

  const priorityScore = countRegexMatches(text, [
    /\bpriority\b/,
    /\bpriorities\b/,
    /\brank\b/,
    /\branking\b/,
    /\bfirst\b/,
    /\bsecond\b/,
    /\bthird\b/,
    /\bfocus\b/,
    /\bsequence\b/,
    /\broadmap\b/,
    /\bnext step\b/,
    /\baction\b/,
  ]);
  if (priorityScore >= 2) {
    return getAnalysisSkill("analysis.priority-stack");
  }

  if (args.thinkingMode === "academic-research") {
    return getAnalysisSkill("analysis.academic-research");
  }

  if (args.thinkingMode === "case-study") {
    return getAnalysisSkill("analysis.case-study-narrative");
  }

  if (args.thinkingMode === "strategy") {
    return getAnalysisSkill("analysis.strategy-brief");
  }

  return getAnalysisSkill("analysis.neutral-brief");
}

export { ANALYSIS_SKILL_REGISTRY };
