import type {
  DeckThinkingMode,
  GenerationAnalysisSkillDefinition,
  GenerationDesignPlan,
  GenerationPageArchetypeDefinition,
} from "./generation-contract";
import type { PageLayoutArchetype } from "./types";

export const CANONICAL_LAYOUT_ARCHETYPE_TO_GENERATION_ARCHETYPE = {
  "single-dominant-visual": "hero-rail",
  "hero-metric": "hero-rail",
  "chart-with-insight-rail": "chart-insight",
  "matrix-first": "verdict-comparison",
  "bubble-landscape": "chart-insight",
  "timeline-led": "priority-rail",
  "process-flow": "priority-rail",
  swimlane: "priority-rail",
  "benchmark-table": "verdict-comparison",
  "decision-tree": "priority-rail",
  "layered-stack": "research-figure-stage",
  "market-map": "verdict-comparison",
  "portfolio-grid": "priority-rail",
  "capability-model": "priority-rail",
  funnel: "priority-rail",
  "risk-heatmap": "verdict-comparison",
  "thesis-evidence-board": "hero-rail",
  "before-after": "verdict-comparison",
  flywheel: "priority-rail",
  "operating-model": "priority-rail",
  "annotation-stage": "research-figure-stage",
  "evidence-wall": "hero-rail",
  "case-timeline": "priority-rail",
  "bridge-explanation": "chart-insight",
} satisfies Record<PageLayoutArchetype, GenerationPageArchetypeDefinition["id"]>;

const PAGE_ARCHETYPE_REGISTRY: GenerationPageArchetypeDefinition[] = [
  {
    id: "hero-rail",
    label: "Hero With Evidence Rail",
    summary:
      "Lead with one dominant thesis zone, then place concise proof or implications in a smaller supporting rail.",
    layoutGrammar: [
      "Start with a strong hero area that owns the page.",
      "Use a smaller side rail for proof, implications, or watch-outs.",
      "Close with one compact takeaway rather than a second body paragraph.",
    ],
    compositionMoves: [
      "Keep the thesis visible within one short claim block.",
      "Let support copy cluster into one or two grouped objects, not many equal cards.",
      "Use the rail to create contrast in scale, not just another column of the same weight.",
    ],
    objectStrategy: [
      "Favor text, line, rectangle, and list-style data objects.",
      "Keep surfaces light so typography does the work.",
    ],
    copyBudget: {
      totalVisibleWords: 52,
      headlineMaxChars: 88,
      thesisMaxChars: 108,
      supportingPointCount: 2,
      supportingPointMaxChars: 48,
      evidenceItemCount: 2,
      evidenceItemMaxChars: 40,
      closeMaxChars: 68,
      recommendedObjectMin: 5,
      recommendedObjectMax: 7,
    },
    avoidPatterns: [
      "Do not create one giant body paragraph beside another giant body paragraph.",
      "Do not turn the rail into stacked memo sections.",
    ],
  },
  {
    id: "priority-rail",
    label: "Priority Rail",
    summary:
      "Use one clear direction, then an ordered stack of priorities with a compact implication or risk rail.",
    layoutGrammar: [
      "Set the direction first, then show the ranked stack.",
      "Give the lead priority more room than the rest.",
      "Reserve a smaller zone for implications, risks, or execution conditions.",
    ],
    compositionMoves: [
      "Make the ranking obvious in copy and spacing.",
      "Use short action-oriented labels rather than long explanations.",
      "Close by reinforcing what should happen first.",
    ],
    objectStrategy: [
      "Favor text, list data, simple dividers, and restrained support panels.",
      "Use one stack object or one ordered cluster rather than many separate cards.",
    ],
    copyBudget: {
      totalVisibleWords: 52,
      headlineMaxChars: 82,
      thesisMaxChars: 92,
      supportingPointCount: 2,
      supportingPointMaxChars: 40,
      evidenceItemCount: 2,
      evidenceItemMaxChars: 34,
      closeMaxChars: 64,
      recommendedObjectMin: 5,
      recommendedObjectMax: 7,
    },
    avoidPatterns: [
      "Do not present every priority as an equal floating card.",
      "Do not waste copy re-explaining that the page contains priorities.",
    ],
  },
  {
    id: "verdict-comparison",
    label: "Verdict Comparison",
    summary:
      "Frame the comparison, show the meaningful differences, and resolve toward one conclusion.",
    layoutGrammar: [
      "Open with the verdict before detailing the comparison.",
      "Use two contrasted evidence zones or one dominant option plus one smaller foil.",
      "End with one resolved takeaway rather than leaving both sides open.",
    ],
    compositionMoves: [
      "Keep the comparison dimensions short and decision-relevant.",
      "Bias scale toward the winning or preferred direction.",
      "Use the footer to land the choice, not to reopen the debate.",
    ],
    objectStrategy: [
      "Favor text, data lists, simple dividers, and occasional charts when evidence supports them.",
      "Use asymmetry rather than mirrored card walls when one side clearly wins.",
    ],
    copyBudget: {
      totalVisibleWords: 52,
      headlineMaxChars: 80,
      thesisMaxChars: 84,
      supportingPointCount: 2,
      supportingPointMaxChars: 30,
      evidenceItemCount: 2,
      evidenceItemMaxChars: 30,
      closeMaxChars: 62,
      recommendedObjectMin: 6,
      recommendedObjectMax: 8,
    },
    avoidPatterns: [
      "Do not build a generic 2x2 wall of same-sized comparison cards.",
      "Do not describe the comparison process instead of the actual verdict.",
    ],
  },
  {
    id: "chart-insight",
    label: "Chart With Insights",
    summary:
      "Let the time-series or relationship view lead, then annotate the few shifts that matter and close with one implication.",
    layoutGrammar: [
      "Give the primary graphic the most room on the page.",
      "Use a narrow insight rail for annotations and inflection points.",
      "Keep the close short so the chart remains the page center.",
    ],
    compositionMoves: [
      "Turn data into one clear relationship statement first.",
      "Highlight regime changes or turning points, not every timestamp.",
      "Use annotations to interpret the chart, not repeat the axis labels.",
    ],
    objectStrategy: [
      "Favor one chart, a few short annotations, and one small close.",
      "Use supporting shapes lightly so the chart stays dominant.",
    ],
    copyBudget: {
      totalVisibleWords: 46,
      headlineMaxChars: 80,
      thesisMaxChars: 82,
      supportingPointCount: 2,
      supportingPointMaxChars: 24,
      evidenceItemCount: 2,
      evidenceItemMaxChars: 24,
      closeMaxChars: 56,
      recommendedObjectMin: 5,
      recommendedObjectMax: 7,
    },
    avoidPatterns: [
      "Do not replace a chart-led page with a giant paragraph summary.",
      "Do not overload the graphic with too many separate callout blocks.",
    ],
  },
  {
    id: "research-figure-stage",
    label: "Research Figure Stage",
    summary:
      "Use one dominant scientific figure in the center, then keep captions, labels, and method notes compact around it.",
    layoutGrammar: [
      "Give one central figure the clear majority of the page area.",
      "Keep surrounding annotations short and tied directly to the figure.",
      "Use the footer or caption to land one careful interpretation rather than a recommendation close.",
    ],
    compositionMoves: [
      "Treat the figure as the page's main object, not one card among many.",
      "Let labels and method cues feel paper-like and restrained.",
      "Avoid equal-weight side rails or consultant memo framing.",
    ],
    objectStrategy: [
      "Favor one deterministic figure shell with a few editable labels and notes.",
      "Keep shapes, rules, and accents thin so the page reads like a conference slide.",
    ],
    copyBudget: {
      totalVisibleWords: 44,
      headlineMaxChars: 78,
      thesisMaxChars: 84,
      supportingPointCount: 2,
      supportingPointMaxChars: 28,
      evidenceItemCount: 2,
      evidenceItemMaxChars: 24,
      closeMaxChars: 56,
      recommendedObjectMin: 4,
      recommendedObjectMax: 6,
    },
    avoidPatterns: [
      "Do not split the page into many same-weight cards.",
      "Do not wrap the figure in executive-summary or recommendation language.",
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

function getArchetype(id: GenerationPageArchetypeDefinition["id"]) {
  return PAGE_ARCHETYPE_REGISTRY.find((archetype) => archetype.id === id) ?? PAGE_ARCHETYPE_REGISTRY[0];
}

export function resolveGenerationPageArchetype(args: {
  sourceText?: string;
  pageTitle: string;
  pageNote: string;
  plan: GenerationDesignPlan;
  analysisSkill: GenerationAnalysisSkillDefinition | null;
  thinkingMode: DeckThinkingMode;
}): GenerationPageArchetypeDefinition {
  const rawText = normalizeText([args.sourceText ?? "", args.pageTitle, args.pageNote].join(" "));

  if (args.analysisSkill?.id === "analysis.time-series-relationship") {
    return getArchetype("chart-insight");
  }

  if (args.analysisSkill?.id === "analysis.comparison-tradeoff") {
    return getArchetype("verdict-comparison");
  }

  if (args.analysisSkill?.id === "analysis.priority-stack") {
    const explicitPrioritySignal = countRegexMatches(rawText, [
      /\bpriority\b/,
      /\bpriorities\b/,
      /\brank\b/,
      /\branking\b/,
      /\btop\b/,
      /\border\b/,
      /\bsequence\b/,
      /\broadmap\b/,
      /\bnext step\b/,
      /\baction\b/,
      /\bphase\b/,
      /\bportfolio\b/,
    ]);
    return explicitPrioritySignal >= 2 ? getArchetype("priority-rail") : getArchetype("hero-rail");
  }

  const text = rawText;

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
      /\btrajectory\b/,
    ]);
  if (timeSeriesScore >= 3) {
    return getArchetype("chart-insight");
  }

  const comparisonScore = countRegexMatches(text, [
    /\bcompare\b/,
    /\bcomparison\b/,
    /\bbenchmark\b/,
    /\btrade[- ]?off\b/,
    /\boption\b/,
    /\balternative\b/,
    /\bscenario\b/,
    /\bchoice\b/,
    /\bversus\b/,
  ]);
  if (comparisonScore >= 2) {
    return getArchetype("verdict-comparison");
  }

  const priorityScore =
    countRegexMatches(text, [
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
      /\bphase\b/,
      /\btop\b/,
      /\border\b/,
      /\bportfolio\b/,
    ]);
  if (priorityScore >= 3) {
    return getArchetype("priority-rail");
  }

  if (args.thinkingMode === "academic-research") {
    if (/(?:neural network|mlp|hidden layer|input layer|output layer|encoder|decoder|topology)/.test(text)) {
      return getArchetype("research-figure-stage");
    }
    return timeSeriesScore >= 2 || /(?:method|result|results|finding|findings|study|experiment|dataset)/.test(text)
      ? getArchetype("chart-insight")
      : getArchetype("verdict-comparison");
  }

  if (args.thinkingMode === "case-study") {
    return /(?:before[- ]after|outcome|intervention|rollout|implementation|lesson)/.test(text)
      ? getArchetype("priority-rail")
      : getArchetype("hero-rail");
  }

  if (args.thinkingMode === "strategy") {
    return getArchetype("hero-rail");
  }

  return getArchetype("hero-rail");
}

export { PAGE_ARCHETYPE_REGISTRY };
