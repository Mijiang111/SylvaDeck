import type {
  ChartPageIntent,
  DeckThinkingMode,
  FreeformLayoutFamily,
  FreeformLayoutPlan,
  HeroModelIntent,
  LongFormPageClass,
  PageCompositionFingerprint,
  StudioComplexityProfile,
  StudioBriefSynthesis,
} from "./contracts.js";
import { clampText } from "./brief.js";
import { preferredDeepFamilies } from "./complexity.js";

const DEFAULT_FREEFORM_FAMILY_POOL: FreeformLayoutFamily[] = [
  "poster-claim",
  "center-stage-figure",
  "single-proof-canvas",
  "vertical-story-strip",
  "case-timeline",
  "annotation-stage",
  "evidence-wall",
  "asymmetric-proof-field",
];

function isRailLikeFamily(family: PageCompositionFingerprint["family"]) {
  return family === "chart-rail" || family === "comparison-split";
}

function chooseDiverseFamily(
  candidates: FreeformLayoutFamily[],
  usedCompositionFingerprints: PageCompositionFingerprint[],
) {
  const recentFamilies = usedCompositionFingerprints.slice(-3).map((fingerprint) => fingerprint.family);
  const lastFamily = recentFamilies.at(-1) ?? null;
  const railRun = recentFamilies.filter(isRailLikeFamily).length >= 2;
  const repeatedFamilyRun =
    recentFamilies.length >= 2 &&
    recentFamilies.at(-1) === recentFamilies.at(-2);

  if (!railRun && !repeatedFamilyRun) {
    return candidates[0] ?? DEFAULT_FREEFORM_FAMILY_POOL[0]!;
  }

  return (
    candidates.find((family) => family !== lastFamily && !recentFamilies.includes(family)) ??
    candidates.find((family) => family !== lastFamily) ??
    candidates[0] ??
    DEFAULT_FREEFORM_FAMILY_POOL[0]!
  );
}

function candidateFamilies(args: {
  mode: DeckThinkingMode;
  pageClass?: LongFormPageClass | null;
  sparseBriefMode?: boolean;
  pageNumber: number;
  pageCount: number;
  supportCount: number;
  evidenceCount: number;
  complexityProfile?: StudioComplexityProfile | null;
}): FreeformLayoutFamily[] {
  if (args.complexityProfile?.workloadLane === "deep") {
    const preferredFamilies = preferredDeepFamilies(args.complexityProfile);
    if (preferredFamilies.length > 0) {
      return preferredFamilies;
    }
  }

  if (args.sparseBriefMode && args.pageNumber === 1) {
    return ["poster-claim", "center-stage-figure", "single-proof-canvas"];
  }

  if (args.mode === "case-study") {
    return args.pageNumber === 1
      ? ["case-timeline", "vertical-story-strip", "asymmetric-proof-field"]
      : ["vertical-story-strip", "asymmetric-proof-field", "single-proof-canvas"];
  }

  if (args.mode === "academic-research") {
    return ["annotation-stage", "single-proof-canvas", "center-stage-figure"];
  }

  if (args.mode === "strategy") {
    return ["asymmetric-proof-field", "single-proof-canvas", "poster-claim"];
  }

  if (args.pageClass === "synthesis-support") {
    return ["single-proof-canvas", "poster-claim", "vertical-story-strip"];
  }

  if (args.evidenceCount >= 2 && args.supportCount >= 2) {
    return ["evidence-wall", "annotation-stage", "asymmetric-proof-field"];
  }

  return ["poster-claim", "center-stage-figure", "single-proof-canvas"];
}

function describeFamily(family: FreeformLayoutFamily, subject: string): FreeformLayoutPlan {
  switch (family) {
    case "poster-claim":
      return {
        layoutFamily: family,
        visualAnchor: "oversized headline claim with generous negative space",
        readingPath: "eyebrow -> large central claim -> one compact proof strip",
        regionPlan: [
          "One dominant central or upper-left claim field.",
          "One small proof strip or annotation cluster near the lower edge.",
        ],
        copyPlacement: [
          "Place the headline claim as the largest object on the page.",
          "Place at most two support points as small evidence chips, not a right-side card rail.",
        ],
        avoidPattern: [
          "Do not create a balanced left-text/right-card split.",
          "Do not add filler cards just to occupy empty space.",
        ],
      };
    case "center-stage-figure":
      return {
        layoutFamily: family,
        visualAnchor: `central non-3D conceptual figure for ${subject || "the topic"}`,
        readingPath: "title -> center figure -> perimeter annotations",
        regionPlan: [
          "One central figure or abstract map occupies the main field.",
          "Short annotations sit around the figure without becoming sidebars.",
        ],
        copyPlacement: [
          "Keep the main claim near the top or embedded as a label above the figure.",
          "Use two concise annotations instead of a paragraph rail.",
        ],
        avoidPattern: [
          "Do not imply pseudo-3D unless the brief explicitly asked for 3D.",
          "Do not turn annotations into a right-column dashboard.",
        ],
      };
    case "single-proof-canvas":
      return {
        layoutFamily: family,
        visualAnchor: "one proof canvas with one supporting annotation layer",
        readingPath: "claim -> proof canvas -> takeaway",
        regionPlan: [
          "One large proof field takes the center of the slide.",
          "A compact takeaway sits as a small bottom or corner annotation.",
        ],
        copyPlacement: [
          "Use the proof field for support and evidence callouts.",
          "Keep the takeaway separate but visually secondary.",
        ],
        avoidPattern: [
          "Do not split support into multiple equal cards.",
          "Do not add a heavy footer rail.",
        ],
      };
    case "vertical-story-strip":
      return {
        layoutFamily: family,
        visualAnchor: "vertical progression strip",
        readingPath: "top context -> middle change -> bottom outcome",
        regionPlan: [
          "Use a vertical story path instead of side-by-side columns.",
          "Limit the strip to two or three story beats.",
        ],
        copyPlacement: [
          "Place the main claim beside or above the strip.",
          "Use support bullets as story beats, not independent cards.",
        ],
        avoidPattern: [
          "Do not turn the case into a strategy memo.",
          "Do not make two equal thesis zones.",
        ],
      };
    case "case-timeline":
      return {
        layoutFamily: family,
        visualAnchor: "case progression timeline",
        readingPath: "context -> challenge -> intervention/outcome",
        regionPlan: [
          "Build one horizontal or vertical case timeline with two or three milestones.",
          "Let the case challenge be visually earlier than the outcome.",
        ],
        copyPlacement: [
          "Use support bullets as timeline milestones.",
          "Use evidence callouts as small labels attached to the relevant milestone.",
        ],
        avoidPattern: [
          "Do not write a recommendation-first strategy page.",
          "Do not use a generic left narrative plus right card stack.",
        ],
      };
    case "annotation-stage":
      return {
        layoutFamily: family,
        visualAnchor: "one annotated result or concept stage",
        readingPath: "question/claim -> annotated stage -> interpretation",
        regionPlan: [
          "Place one result/concept stage as the main visual field.",
          "Attach one or two short annotations directly to that stage.",
        ],
        copyPlacement: [
          "Keep interpretation as a short annotation, not a board recommendation.",
          "Place limitations or caveats as small secondary text only if needed.",
        ],
        avoidPattern: [
          "Do not use recommendation-first language for research pages.",
          "Do not create a right rail of unrelated notes.",
        ],
      };
    case "evidence-wall":
      return {
        layoutFamily: family,
        visualAnchor: "curated evidence field with one dominant proof surface",
        readingPath: "headline -> dominant proof surface -> one secondary cue",
        regionPlan: [
          "Use one dominant evidence field and one or two small supporting labels or insets.",
          "Keep the hierarchy visibly unequal.",
        ],
        copyPlacement: [
          "Place the main evidence callout inside or next to the dominant proof surface.",
          "Put support bullets into small direct labels around it.",
        ],
        avoidPattern: [
          "Do not create a wall of equal-weight cards or tiles.",
          "Do not exceed two supporting proof items.",
        ],
      };
    case "asymmetric-proof-field":
    default:
      return {
        layoutFamily: "asymmetric-proof-field",
        visualAnchor: "off-center proof field with a small counterweight",
        readingPath: "claim -> off-center proof -> small takeaway",
        regionPlan: [
          "Use an intentionally uneven spatial balance instead of 50/50 columns.",
          "Let one proof region dominate and one small note act as counterweight.",
        ],
        copyPlacement: [
          "Place support bullets near the proof region.",
          "Keep the takeaway as a small annotation, not a second thesis.",
        ],
        avoidPattern: [
          "Do not center two equal columns.",
          "Do not add decorative cards that do not support the claim.",
        ],
      };
  }
}

export function resolveFreeformLayoutPlan(args: {
  selectedTemplateCount: number;
  chartPageIntent?: ChartPageIntent | null;
  hasChartSpec?: boolean;
  heroModelIntent?: HeroModelIntent | null;
  mode: DeckThinkingMode;
  pageClass?: LongFormPageClass | null;
  pageNumber: number;
  pageCount: number;
  supportCount: number;
  evidenceCount: number;
  synthesis?: StudioBriefSynthesis | null;
  complexityProfile?: StudioComplexityProfile | null;
  usedCompositionFingerprints?: PageCompositionFingerprint[];
}) {
  if (
    args.selectedTemplateCount > 0 ||
    args.chartPageIntent?.enabled ||
    args.hasChartSpec ||
    args.heroModelIntent?.enabled
  ) {
    return null;
  }

  const candidates = candidateFamilies({
    mode: args.mode,
    pageClass: args.pageClass,
    sparseBriefMode: args.synthesis?.sparseBriefMode ?? false,
    pageNumber: args.pageNumber,
    pageCount: args.pageCount,
    supportCount: args.supportCount,
    evidenceCount: args.evidenceCount,
    complexityProfile: args.complexityProfile,
  });
  const family = chooseDiverseFamily(candidates, args.usedCompositionFingerprints ?? []);
  const plan = describeFamily(family, args.synthesis?.subject ?? "");

  const brainToDeckAvoidPatterns =
    args.mode === "brain-to-deck"
      ? [
          "no 3D elements, no shadows, no rounded corners",
          "strict action-titles: every title must be a complete sentence stating the conclusion",
          "no gradients, no glow, no decorative filler",
        ]
      : [];

  return {
    ...plan,
    visualAnchor: clampText(plan.visualAnchor, 180),
    readingPath: clampText(plan.readingPath, 180),
    regionPlan: plan.regionPlan.map((line) => clampText(line, 180)).slice(0, 3),
    copyPlacement: plan.copyPlacement.map((line) => clampText(line, 180)).slice(0, 3),
    avoidPattern: [...plan.avoidPattern, ...brainToDeckAvoidPatterns]
      .map((line) => clampText(line, 180))
      .slice(0, 5),
  } satisfies FreeformLayoutPlan;
}

export function renderFreeformLayoutPlanLines(plan: FreeformLayoutPlan) {
  return [
    "Use these steps privately for layout only; do not render or narrate them.",
    "1. Identify content load: one claim, at most two support points, and at most two evidence callouts.",
    `2. Choose visual anchor: ${plan.visualAnchor}.`,
    `3. Choose reading path: ${plan.readingPath}.`,
    `4. Map copy to regions: ${plan.regionPlan.join(" | ")}`,
    `5. Reject default left/right if not necessary: ${plan.avoidPattern.join(" | ")}`,
    `Selected freeform family: ${plan.layoutFamily}.`,
    `Copy placement: ${plan.copyPlacement.join(" | ")}`,
  ];
}

export function buildFreeformLayoutTraceMeta(plan?: FreeformLayoutPlan | null) {
  return {
    freeformLayoutFamily: plan?.layoutFamily ?? null,
    freeformVisualAnchor: plan?.visualAnchor ?? null,
    freeformReadingPath: plan?.readingPath ?? null,
    freeformAvoidedDefaultRail:
      plan?.avoidPattern.some((line) => /left\/right|right-card|right rail|right-column|rail/i.test(line)) ??
      null,
  };
}
