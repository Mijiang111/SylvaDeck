import type {
  GenerationPageArchetypeDefinition,
  HtmlPageGrammarDefinition,
} from "./generation-contract";

const HTML_PAGE_GRAMMARS: HtmlPageGrammarDefinition[] = [
  {
    id: "hero-left-rail-right",
    label: "Hero Left + Evidence Rail",
    summary:
      "An editorial opener with one dominant left hero field, one smaller evidence rail, and one compact takeaway.",
    layoutIntent:
      "Use asymmetry, generous whitespace, and one clear reading path from headline to thesis to evidence to close.",
    slotOrder: ["eyebrow", "headline", "subtitle", "thesis", "support_list", "evidence_rail", "takeaway"],
    zoneRules: [
      "Keep the hero field dominant and left-weighted.",
      "Use the right rail for proof, implications, or watch-outs.",
      "Place the takeaway low and keep it compact.",
    ],
    copyRules: [
      "Do not repeat the headline inside thesis or support blocks.",
      "Use one visible thesis, then short support items.",
      "If evidence is weak, keep the rail short rather than filling space.",
    ],
    avoidPatterns: [
      "Do not create a second hero-sized paragraph.",
      "Do not turn the rail into stacked memo sections.",
    ],
    expectedSlots: [
      {
        id: "eyebrow",
        label: "Eyebrow",
        kind: "text",
        required: false,
        maxChars: 40,
        description: "Short chapter or section label.",
      },
      {
        id: "headline",
        label: "Headline",
        kind: "text",
        required: true,
        maxChars: 90,
        description: "The page title or main claim header.",
      },
      {
        id: "subtitle",
        label: "Subtitle",
        kind: "text",
        required: false,
        maxChars: 110,
        description: "Short scene-setting subheader below the headline.",
      },
      {
        id: "thesis",
        label: "Thesis",
        kind: "text",
        required: true,
        maxChars: 140,
        description: "The main visible claim of the page.",
      },
      {
        id: "support_list",
        label: "Support List",
        kind: "list",
        required: true,
        maxItems: 3,
        maxChars: 70,
        description: "Two or three short supporting statements.",
      },
      {
        id: "evidence_rail",
        label: "Evidence Rail",
        kind: "list",
        required: false,
        maxItems: 3,
        maxChars: 60,
        description: "Compact proof points or implications placed in the side rail.",
      },
      {
        id: "takeaway",
        label: "Takeaway",
        kind: "text",
        required: true,
        maxChars: 90,
        description: "One concise closing takeaway.",
      },
    ],
  },
  {
    id: "priority-stack-rail",
    label: "Priority Stack + Rail",
    summary:
      "A ranked-priority report page with one top direction, one ordered stack, and one smaller execution rail.",
    layoutIntent:
      "Make ordering obvious, avoid equal-weight cards, and let the top priority carry more visual weight.",
    slotOrder: ["eyebrow", "headline", "thesis", "priority_stack", "execution_rail", "takeaway"],
    zoneRules: [
      "Make the order obvious in numbering, spacing, or hierarchy.",
      "Use the rail for execution conditions, risks, or operating implications.",
      "Close with what should happen first.",
    ],
    copyRules: [
      "Do not explain that this is a priority page.",
      "Each priority must say something different.",
      "Keep execution rail copy tighter than the stack.",
    ],
    avoidPatterns: [
      "Do not turn all priorities into equal tiles.",
      "Do not use long body paragraphs inside the stack.",
    ],
    expectedSlots: [
      {
        id: "eyebrow",
        label: "Eyebrow",
        kind: "text",
        required: false,
        maxChars: 40,
        description: "Short chapter or section label.",
      },
      {
        id: "headline",
        label: "Headline",
        kind: "text",
        required: true,
        maxChars: 86,
        description: "The page title.",
      },
      {
        id: "thesis",
        label: "Thesis",
        kind: "text",
        required: true,
        maxChars: 110,
        description: "One directional statement that frames the priorities.",
      },
      {
        id: "priority_stack",
        label: "Priority Stack",
        kind: "list",
        required: true,
        maxItems: 3,
        maxChars: 52,
        description: "Ranked priorities in descending order of importance.",
      },
      {
        id: "execution_rail",
        label: "Execution Rail",
        kind: "list",
        required: false,
        maxItems: 3,
        maxChars: 44,
        description: "Execution constraints, risks, or operating conditions.",
      },
      {
        id: "takeaway",
        label: "Takeaway",
        kind: "text",
        required: true,
        maxChars: 78,
        description: "One short action-oriented close.",
      },
    ],
  },
  {
    id: "verdict-asymmetry",
    label: "Verdict + Asymmetric Comparison",
    summary:
      "A comparison page that resolves to a verdict, with a larger preferred side and a smaller trade-off side.",
    layoutIntent:
      "Bias the page toward the winning direction and use contrast to support the conclusion.",
    slotOrder: ["eyebrow", "headline", "verdict", "lead_case", "tradeoffs", "takeaway"],
    zoneRules: [
      "Open with the verdict before evidence details.",
      "Give more area to the preferred direction.",
      "Use the smaller side to manage trade-offs, not reopen the decision.",
    ],
    copyRules: [
      "Each comparison dimension must be decision-relevant.",
      "Do not restate the verdict in every block.",
      "Keep the close decisive.",
    ],
    avoidPatterns: [
      "Do not make both sides equal if one side clearly wins.",
      "Do not build a generic 2x2 card wall.",
    ],
    expectedSlots: [
      {
        id: "eyebrow",
        label: "Eyebrow",
        kind: "text",
        required: false,
        maxChars: 40,
        description: "Short chapter or section label.",
      },
      {
        id: "headline",
        label: "Headline",
        kind: "text",
        required: true,
        maxChars: 84,
        description: "The page title.",
      },
      {
        id: "verdict",
        label: "Verdict",
        kind: "text",
        required: true,
        maxChars: 96,
        description: "The preferred direction or final conclusion.",
      },
      {
        id: "lead_case",
        label: "Lead Case",
        kind: "list",
        required: true,
        maxItems: 3,
        maxChars: 44,
        description: "The strongest reasons supporting the preferred direction.",
      },
      {
        id: "tradeoffs",
        label: "Trade-offs",
        kind: "list",
        required: false,
        maxItems: 3,
        maxChars: 40,
        description: "Key trade-offs or constraints to manage.",
      },
      {
        id: "takeaway",
        label: "Takeaway",
        kind: "text",
        required: true,
        maxChars: 72,
        description: "One short closing implication.",
      },
    ],
  },
  {
    id: "chart-annotation-stage",
    label: "Chart Stage + Annotation",
    summary:
      "A chart-led report page with a dominant central plot, compact annotations, and a short implication.",
    layoutIntent:
      "Let the chart own the page and use only a few carefully placed annotations or insight notes.",
    slotOrder: ["eyebrow", "headline", "subtitle", "chart_panel", "annotations", "takeaway"],
    zoneRules: [
      "The chart should be the dominant zone.",
      "Use one or two compact annotation clusters, not a heavy side rail.",
      "Keep the takeaway short and secondary to the chart.",
    ],
    copyRules: [
      "Do not explain the chart with a long paragraph.",
      "Annotations should add insight, not repeat axis or legend labels.",
      "Use only when the source truly supports a chart.",
    ],
    avoidPatterns: [
      "Do not surround the chart with many competing panels.",
      "Do not turn a chart page into a bullet summary.",
    ],
    expectedSlots: [
      {
        id: "eyebrow",
        label: "Eyebrow",
        kind: "text",
        required: false,
        maxChars: 40,
        description: "Short chapter or section label.",
      },
      {
        id: "headline",
        label: "Headline",
        kind: "text",
        required: true,
        maxChars: 82,
        description: "The chart page title.",
      },
      {
        id: "subtitle",
        label: "Subtitle",
        kind: "text",
        required: false,
        maxChars: 100,
        description: "Short relationship statement or setup.",
      },
      {
        id: "chart_panel",
        label: "Chart Panel",
        kind: "chart",
        required: true,
        description: "The dominant chart zone.",
      },
      {
        id: "annotations",
        label: "Annotations",
        kind: "annotation",
        required: false,
        maxItems: 3,
        maxChars: 48,
        description: "Short callouts tied to turning points or regimes.",
      },
      {
        id: "takeaway",
        label: "Takeaway",
        kind: "text",
        required: true,
        maxChars: 68,
        description: "A short implication of the chart pattern.",
      },
    ],
  },
];

function getGrammar(id: HtmlPageGrammarDefinition["id"]) {
  return HTML_PAGE_GRAMMARS.find((grammar) => grammar.id === id) ?? HTML_PAGE_GRAMMARS[0];
}

export function resolveHtmlPageGrammar(args: {
  pageArchetype: GenerationPageArchetypeDefinition;
}): HtmlPageGrammarDefinition {
  if (args.pageArchetype.id === "chart-insight") {
    return getGrammar("chart-annotation-stage");
  }
  if (args.pageArchetype.id === "priority-rail") {
    return getGrammar("priority-stack-rail");
  }
  if (args.pageArchetype.id === "verdict-comparison") {
    return getGrammar("verdict-asymmetry");
  }
  return getGrammar("hero-left-rail-right");
}

export { HTML_PAGE_GRAMMARS };
