import {
  clampText,
  normalizeStudioText,
  uniqueStrings,
} from "./brief.js";
import type {
  FreeformLayoutFamily,
  FreeformLayoutPlan,
  SegmentedThinkingInputs,
  StudioComplexityProfile,
  StudioComplexitySignalGroup,
  StudioTaskGrammarPack,
  StudioTaskGrammarPackId,
} from "./contracts.js";

type PhraseMatcher = {
  label: string;
  pattern: RegExp;
};

const HIGH_SPEC_MODIFIER_MATCHERS: PhraseMatcher[] = [
  { label: "top ibank level", pattern: /\btop\s+ibank\s+level\b/i },
  { label: "ibank-level", pattern: /\bibank(?:-|\s)?level\b/i },
  { label: "board-grade", pattern: /\bboard(?:-|\s)?grade\b/i },
  { label: "institutional investor-grade", pattern: /\binstitutional(?:\s+investor)?(?:-|\s)?grade\b/i },
  { label: "publishable", pattern: /\bpublishable\b/i },
  { label: "expert-level", pattern: /\bexpert(?:-|\s)?level\b/i },
  { label: "top-tier", pattern: /\btop(?:-|\s)?tier\b/i },
  { label: "premium", pattern: /\bpremium\b/i },
];

const HIGH_PRESSURE_CONSTRAINT_MATCHERS: PhraseMatcher[] = [
  { label: "one page", pattern: /\b(?:1\s*page|one\s+page)\b/i },
  { label: "tight", pattern: /\btight\b/i },
  { label: "concise", pattern: /\bconcise\b/i },
  { label: "no fluff", pattern: /\bno\s+fluff\b/i },
  { label: "restrained", pattern: /\brestrained\b/i },
];

const STRUCTURED_PROOF_MATCHERS: PhraseMatcher[] = [
  { label: "valuation drivers", pattern: /\b(?:drivers?|valuation|dcf|sotp|comps?|multiple|sensitivity|bull|base|bear|scenario)\b/i },
  { label: "architecture proof", pattern: /\b(?:architecture\s+review|system\s+architecture|technical\s+architecture|constraints?|trade-?offs?)\b/i },
  { label: "research proof", pattern: /\b(?:method|results?|discussion|limitations?|readout|experiment)\b/i },
  { label: "teardown proof", pattern: /\b(?:teardown|stack|mechanic|operating\s+model|workflow)\b/i },
];

const STRONG_DEEP_MATCHERS: PhraseMatcher[] = [
  { label: "top ibank level", pattern: /\btop\s+ibank\s+level\b/i },
  { label: "board-grade", pattern: /\bboard(?:-|\s)?grade\b/i },
  { label: "institutional investor-grade", pattern: /\binstitutional(?:\s+investor)?(?:-|\s)?grade\b/i },
  { label: "publishable", pattern: /\bpublishable\b/i },
  { label: "expert-level", pattern: /\bexpert(?:-|\s)?level\b/i },
];

const TASK_GRAMMAR_PACKS: Array<
  StudioTaskGrammarPack & {
    taskMatchers: PhraseMatcher[];
    sourceMatchers: PhraseMatcher[];
  }
> = [
  {
    id: "valuation-finance-grade",
    title: "Finance-grade valuation",
    artifactLabel: "product valuation",
    deliverableLabel: "product valuation deck",
    taskMatchers: [
      { label: "valuation", pattern: /\b(?:product\s+)?valuation\b/i },
      { label: "investment case", pattern: /\binvestment\s+case\b/i },
      { label: "diligence", pattern: /\bdiligence\b/i },
      { label: "investment memo", pattern: /\b(?:investment|valuation)\s+memo\b/i },
      { label: "ibank", pattern: /\bibank\b/i },
    ],
    sourceMatchers: [
      { label: "dcf", pattern: /\bdcf\b/i },
      { label: "sotp", pattern: /\bsotp\b/i },
      { label: "comps", pattern: /\bcomps?\b/i },
      { label: "scenario", pattern: /\b(?:bull|base|bear|scenario)\b/i },
    ],
    lines: [
      "Treat the page as a valuation deliverable, not a generic company overview.",
      "Anchor the page in valuation logic, key drivers, and a disciplined conclusion.",
      "If hard numbers are missing, keep the valuation qualitative instead of inventing outputs.",
      "Avoid generic 'what it is / why it matters' framing.",
    ],
    proofPlanLines: [
      "Valuation question: what valuation frame best explains the asset?",
      "Method frame: state the lens without fabricating numbers or comps.",
      "Key drivers: isolate the one or two assumptions that actually move value.",
      "Scenario posture: if needed, discuss upside/downside qualitatively.",
      "Conclusion discipline: land one valuation stance, not a company description.",
    ],
    layoutPreferenceLines: [
      "Prefer a valuation proof board, asymmetric proof field, or evidence wall over a poster opener.",
      "Use one dominant valuation frame and one small driver or support cluster.",
      "Do not reduce the page to one oversized slogan with decorative chips.",
    ],
    downgradeGuard: "a generic overview page or poster opener",
  },
  {
    id: "operator-product-teardown",
    title: "Operator / product teardown",
    artifactLabel: "product teardown",
    deliverableLabel: "product teardown deck",
    taskMatchers: [
      { label: "teardown", pattern: /\bteardown\b/i },
      { label: "product teardown", pattern: /\bproduct\s+teardown\b/i },
      { label: "operator review", pattern: /\boperator\b/i },
    ],
    sourceMatchers: [
      { label: "stack", pattern: /\bstack\b/i },
      { label: "workflow", pattern: /\bworkflow\b/i },
      { label: "mechanic", pattern: /\bmechanic\b/i },
    ],
    lines: [
      "Treat the page as an operator-grade teardown, not a category summary.",
      "Show the core mechanic, the differentiating layer, and the operating implication.",
      "Avoid generic market context unless it directly supports the teardown.",
    ],
    proofPlanLines: [
      "Teardown question: what mechanic makes the product work?",
      "Core structure: show the stack or workflow that carries the page.",
      "Differentiator: isolate the layer that changes the outcome.",
      "Operating implication: end on the practical read, not broad narrative filler.",
    ],
    layoutPreferenceLines: [
      "Prefer an asymmetric proof field or vertical teardown strip over a poster opener.",
      "Make the core product mechanic visually primary.",
    ],
    downgradeGuard: "a generic feature list or poster opener",
  },
  {
    id: "technical-architecture-review",
    title: "Technical architecture review",
    artifactLabel: "technical architecture review",
    deliverableLabel: "technical architecture review deck",
    taskMatchers: [
      { label: "architecture review", pattern: /\b(?:technical\s+)?architecture\s+review\b/i },
      { label: "system architecture", pattern: /\bsystem\s+architecture\b/i },
      { label: "architecture", pattern: /\barchitecture\b/i },
    ],
    sourceMatchers: [
      { label: "constraints", pattern: /\bconstraints?\b/i },
      { label: "trade-offs", pattern: /\btrade-?offs?\b/i },
      { label: "system design", pattern: /\bsystem\s+design\b/i },
    ],
    lines: [
      "Treat the page as an architecture review, not a strategy memo or generic explainer.",
      "Center the page on one architecture judgment, one dominant structure view, and the key constraint.",
      "Avoid recommendation theater when the page needs system logic.",
    ],
    proofPlanLines: [
      "Architecture question: what design judgment matters most here?",
      "System view: show the dominant structure or component relationship.",
      "Constraint: isolate the trade-off or bottleneck that drives the judgment.",
      "Conclusion discipline: land one architecture read, not a broad survey.",
    ],
    layoutPreferenceLines: [
      "Prefer a center-stage figure or annotation stage over a poster opener.",
      "Let one system view dominate, with compact annotations around it.",
    ],
    downgradeGuard: "a generic overview poster or memo stack",
  },
  {
    id: "research-result-synthesis",
    title: "Research result synthesis",
    artifactLabel: "research result synthesis",
    deliverableLabel: "research result synthesis deck",
    taskMatchers: [
      { label: "research result", pattern: /\bresearch\s+result\b/i },
      { label: "result synthesis", pattern: /\bresult\s+synthesis\b/i },
      { label: "readout", pattern: /\breadout\b/i },
      { label: "experiment", pattern: /\bexperiment\b/i },
    ],
    sourceMatchers: [
      { label: "method", pattern: /\bmethod\b/i },
      { label: "discussion", pattern: /\bdiscussion\b/i },
      { label: "limitations", pattern: /\blimitations?\b/i },
    ],
    lines: [
      "Treat the page as a result synthesis, not a recommendation-first summary.",
      "Keep one result pattern, the method boundary, and one careful interpretation visible together.",
      "Do not flatten the page into a strategy-style opener.",
    ],
    proofPlanLines: [
      "Result question: what finding or pattern matters most?",
      "Method boundary: keep the method or evidence frame visible.",
      "Interpretation: land one careful read, not broad recommendation language.",
      "Limitation: add only the caveat that materially changes the read.",
    ],
    layoutPreferenceLines: [
      "Prefer an annotation stage or single proof canvas over a poster opener.",
      "Let one result stage dominate and keep interpretation compact.",
    ],
    downgradeGuard: "a generic overview or recommendation poster",
  },
];

function collectMatcherLabels(text: string, matchers: PhraseMatcher[]) {
  return matchers
    .filter((matcher) => matcher.pattern.test(text))
    .map((matcher) => matcher.label);
}

function collectSignalGroups(text: string) {
  return {
    "high-spec-modifier": collectMatcherLabels(text, HIGH_SPEC_MODIFIER_MATCHERS),
    "specialized-artifact": uniqueStrings(
      TASK_GRAMMAR_PACKS.flatMap((pack) => collectMatcherLabels(text, pack.taskMatchers)),
    ),
    "high-pressure-constraint": collectMatcherLabels(text, HIGH_PRESSURE_CONSTRAINT_MATCHERS),
    "structured-proof": collectMatcherLabels(text, STRUCTURED_PROOF_MATCHERS),
  } satisfies Record<StudioComplexitySignalGroup, string[]>;
}

function resolveTaskGrammarPacks(taskText: string, sourceText: string, allowSourceSupplement: boolean) {
  return TASK_GRAMMAR_PACKS.filter((pack) => {
    const taskHit = pack.taskMatchers.some((matcher) => matcher.pattern.test(taskText));
    if (taskHit) {
      return true;
    }
    return allowSourceSupplement && pack.sourceMatchers.some((matcher) => matcher.pattern.test(sourceText));
  }).map((pack) => ({
    id: pack.id,
    title: pack.title,
    artifactLabel: pack.artifactLabel,
    deliverableLabel: pack.deliverableLabel,
    lines: pack.lines,
    proofPlanLines: pack.proofPlanLines,
    layoutPreferenceLines: pack.layoutPreferenceLines,
    downgradeGuard: pack.downgradeGuard,
  }));
}

function buildGenericDeliverable(taskText: string) {
  if (/\bmemo\b/i.test(taskText)) {
    return "decision memo deck";
  }
  if (/\breview\b/i.test(taskText)) {
    return "review deck";
  }
  return "PPT";
}

function buildComplexityReason(args: {
  workloadLane: StudioComplexityProfile["workloadLane"];
  strongSignals: string[];
  signalGroups: StudioComplexitySignalGroup[];
  specializedArtifact: string | null;
}) {
  if (args.workloadLane === "deep") {
    if (args.strongSignals.length > 0) {
      return `The task brief contains a strong deep-lane cue (${args.strongSignals[0]}), so this request should use the heavier workspace.`;
    }

    if (args.specializedArtifact) {
      return `The task brief combines ${args.signalGroups.join(", ")} cues around ${args.specializedArtifact}, so it should use the deeper professional workspace.`;
    }

    return `The task brief combines ${args.signalGroups.join(", ")} cues, so it should use the deeper professional workspace.`;
  }

  return "The task brief reads like a standard Studio request, so the fast workspace remains the default.";
}

export function hasTaskGrammarPack(
  profile: Pick<StudioComplexityProfile, "taskGrammarPacks"> | null | undefined,
  id: StudioTaskGrammarPackId,
) {
  return profile?.taskGrammarPacks.some((pack) => pack.id === id) ?? false;
}

export function resolveStudioComplexityProfile(args: {
  brief: string;
  inputs: SegmentedThinkingInputs;
}): StudioComplexityProfile {
  const rawBriefText = normalizeStudioText(args.brief);
  const taskText =
    normalizeStudioText(
    [args.inputs.taskIntentText, args.inputs.globalHintsText].filter(Boolean).join(" "),
    ) || rawBriefText;
  const sourceText = normalizeStudioText(args.inputs.sourceMaterialText);
  const taskSignals = collectSignalGroups(taskText);
  const sourceSignals = collectSignalGroups(sourceText);
  const taskDrivenSignalGroups = (Object.entries(taskSignals) as Array<
    [StudioComplexitySignalGroup, string[]]
  >)
    .filter(([, matches]) => matches.length > 0)
    .map(([group]) => group) as StudioComplexitySignalGroup[];
  const sourceSupplementSignalGroups = (Object.entries(sourceSignals) as Array<
    [StudioComplexitySignalGroup, string[]]
  >)
    .filter(([group, matches]) => matches.length > 0 && !taskDrivenSignalGroups.includes(group))
    .map(([group]) => group) as StudioComplexitySignalGroup[];
  const strongSignals = collectMatcherLabels(taskText, STRONG_DEEP_MATCHERS);
  const workloadLane =
    strongSignals.length > 0 ||
    taskDrivenSignalGroups.length >= 2 ||
    (taskDrivenSignalGroups.length >= 1 && sourceSupplementSignalGroups.length >= 1)
      ? "deep"
      : "fast";
  const taskGrammarPacks = resolveTaskGrammarPacks(
    taskText,
    sourceText,
    taskDrivenSignalGroups.length > 0 || workloadLane === "deep",
  );
  const specializedArtifact = taskGrammarPacks[0]?.artifactLabel ?? null;
  const deliverable = taskGrammarPacks[0]?.deliverableLabel ?? buildGenericDeliverable(taskText);
  const signalGroups = uniqueStrings([
    ...taskDrivenSignalGroups,
    ...(workloadLane === "deep" ? sourceSupplementSignalGroups : []),
  ]) as StudioComplexitySignalGroup[];
  const signalPhrases = uniqueStrings([
    ...taskDrivenSignalGroups.flatMap((group) => taskSignals[group]),
    ...(workloadLane === "deep"
      ? sourceSupplementSignalGroups.flatMap((group) => sourceSignals[group])
      : []),
  ]).slice(0, 8);

  return {
    workloadLane,
    rigorLevel: workloadLane === "deep" ? "high-spec" : "standard",
    reason: buildComplexityReason({
      workloadLane,
      strongSignals,
      signalGroups,
      specializedArtifact,
    }),
    deliverable,
    specializedArtifact,
    signalGroups,
    signalPhrases,
    taskDrivenSignalGroups,
    sourceSupplementSignalGroups,
    taskGrammarPacks,
  };
}

export function buildTaskRigorBriefLines(args: {
  profile: StudioComplexityProfile;
  subject: string;
}) {
  if (args.profile.workloadLane !== "deep") {
    return [];
  }

  return uniqueStrings([
    `Workload lane: ${args.profile.workloadLane}.`,
    `Rigor target: ${args.profile.rigorLevel}.`,
    `Deliverable: ${args.profile.deliverable} for ${args.subject}.`,
    ...(args.profile.specializedArtifact
      ? [`Specialized artifact: ${args.profile.specializedArtifact}.`]
      : []),
    `Reason: ${args.profile.reason}`,
    ...(args.profile.taskGrammarPacks[0]
      ? [`Do not downgrade this into ${args.profile.taskGrammarPacks[0].downgradeGuard}.`]
      : ["Do not downgrade this into a generic overview or poster opener."]),
  ]).map((line) => clampText(line, 220));
}

export function buildTaskGrammarCardLines(profile: StudioComplexityProfile) {
  return uniqueStrings(profile.taskGrammarPacks.flatMap((pack) => pack.lines)).map((line) =>
    clampText(line, 220),
  );
}

export function buildProofPlanLines(args: {
  profile: StudioComplexityProfile;
  subject: string;
  stage: "planning" | "page" | "repair";
  pageQuestion?: string | null;
  headlineClaim?: string | null;
}) {
  if (args.profile.workloadLane !== "deep") {
    return [];
  }

  const packLines = uniqueStrings(args.profile.taskGrammarPacks.flatMap((pack) => pack.proofPlanLines));
  const genericLines =
    packLines.length > 0
      ? packLines
      : [
          `Define the professional question for ${args.subject}.`,
          "Isolate the one or two drivers that carry the page.",
          "Land one disciplined verdict instead of a broad overview.",
        ];

  const stageLead =
    args.stage === "planning"
      ? "Plan the page map around a professional proof structure, not a generic opener."
      : args.stage === "repair"
        ? "Repair the page without flattening its professional proof structure."
        : "Use this proof structure privately before writing the page.";

  return uniqueStrings([
    stageLead,
    ...(args.pageQuestion ? [`Page question: ${args.pageQuestion}`] : []),
    ...(args.headlineClaim ? [`Current claim target: ${clampText(args.headlineClaim, 160)}`] : []),
    ...genericLines,
  ])
    .slice(0, 6)
    .map((line) => clampText(line, 220));
}

export function buildLayoutStrategyLines(args: {
  profile: StudioComplexityProfile;
  subject: string;
  freeformLayoutPlan?: FreeformLayoutPlan | null;
  preserveCurrentFamily?: string | null;
}) {
  if (args.profile.workloadLane !== "deep") {
    return [];
  }

  const layoutLines = uniqueStrings(
    args.profile.taskGrammarPacks.flatMap((pack) => pack.layoutPreferenceLines),
  );
  const familyLine = args.freeformLayoutPlan
    ? `Selected deep family: ${args.freeformLayoutPlan.layoutFamily}.`
    : args.preserveCurrentFamily
      ? `Preserve the current dominant family: ${args.preserveCurrentFamily}.`
      : null;

  return uniqueStrings([
    "Use this layout strategy privately; do not render or narrate it.",
    ...(familyLine ? [familyLine] : []),
    ...(args.freeformLayoutPlan
      ? [
          `Visual anchor: ${args.freeformLayoutPlan.visualAnchor}.`,
          `Reading path: ${args.freeformLayoutPlan.readingPath}.`,
        ]
      : []),
    ...(layoutLines.length > 0
      ? layoutLines
      : [
          `Choose a proof-bearing composition for ${args.subject}, not a generic poster opener.`,
          "Let one professional proof region dominate and keep secondary support compact.",
        ]),
  ])
    .slice(0, 6)
    .map((line) => clampText(line, 220));
}

export function preferredDeepFamilies(profile: StudioComplexityProfile): FreeformLayoutFamily[] {
  if (hasTaskGrammarPack(profile, "valuation-finance-grade")) {
    return ["asymmetric-proof-field", "evidence-wall", "single-proof-canvas"];
  }
  if (hasTaskGrammarPack(profile, "technical-architecture-review")) {
    return ["center-stage-figure", "annotation-stage", "single-proof-canvas"];
  }
  if (hasTaskGrammarPack(profile, "research-result-synthesis")) {
    return ["annotation-stage", "single-proof-canvas", "asymmetric-proof-field"];
  }
  if (hasTaskGrammarPack(profile, "operator-product-teardown")) {
    return ["asymmetric-proof-field", "vertical-story-strip", "single-proof-canvas"];
  }
  return ["asymmetric-proof-field", "single-proof-canvas", "evidence-wall"];
}

export function buildComplexityTraceMeta(profile: StudioComplexityProfile) {
  return {
    workloadLane: profile.workloadLane,
    taskGrammarPackIds: profile.taskGrammarPacks.map((pack) => pack.id),
    complexitySignalGroups: profile.signalGroups,
    complexitySignalPhrases: profile.signalPhrases,
    rigorLevel: profile.rigorLevel,
  };
}
