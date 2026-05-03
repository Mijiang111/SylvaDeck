import type {
  ExportObjectKind,
  PageDensity,
  PageLayoutArchetype,
} from "./schemas.js";
import { pageLayoutArchetypeSchema } from "./schemas.js";

export type VisualGrammarSlotDefinition = {
  id: string;
  label: string;
  allowedObjectKinds: ExportObjectKind[];
  guidance: string;
};

export type VisualGrammarRegistryEntry = {
  archetype: PageLayoutArchetype;
  requiredSlots: string[];
  optionalSlots: string[];
  allowedObjectKinds: ExportObjectKind[];
  dominantSlot: string;
  densityLimit: PageDensity;
  ownershipBoundary: string;
  snapshotBoundary: string;
  avoidPatterns: string[];
  slots: VisualGrammarSlotDefinition[];
};

const BASIC_OBJECTS: ExportObjectKind[] = ["text", "diagram", "metric-grid", "comparison-grid", "card-grid"];
const CHART_OBJECTS: ExportObjectKind[] = ["chart-visual", "matrix", "native-table", ...BASIC_OBJECTS];
const DIAGRAM_OBJECTS: ExportObjectKind[] = ["diagram", "matrix", "text", "metric-grid", "comparison-grid"];

function slot(
  id: string,
  label: string,
  allowedObjectKinds: ExportObjectKind[],
  guidance: string,
): VisualGrammarSlotDefinition {
  return { id, label, allowedObjectKinds, guidance };
}

function entry(args: Omit<VisualGrammarRegistryEntry, "slots"> & {
  slots: Array<[string, string, ExportObjectKind[], string]>;
}): VisualGrammarRegistryEntry {
  return {
    ...args,
    slots: args.slots.map(([id, label, allowedObjectKinds, guidance]) =>
      slot(id, label, allowedObjectKinds, guidance),
    ),
  };
}

export const PAGE_LAYOUT_ARCHETYPE_VALUES = pageLayoutArchetypeSchema.options;

export const VISUAL_GRAMMAR_REGISTRY = {
  "single-dominant-visual": entry({
    archetype: "single-dominant-visual",
    requiredSlots: ["primary-visual"],
    optionalSlots: ["insight-rail", "callout", "evidence-note", "annotation", "source-note"],
    allowedObjectKinds: ["diagram", "chart-visual", "text", "metric-grid"],
    dominantSlot: "primary-visual",
    densityLimit: "sparse",
    ownershipBoundary: "The primary-visual contract root owns the dominant figure, labels, and internal annotations; support notes are separate secondary roots.",
    snapshotBoundary: "Only a contracted primary-visual with data-snapshot-boundary may become a visual snapshot; text support remains editable.",
    avoidPatterns: ["card wall", "default left/right memo split", "multiple equal hero objects"],
    slots: [
      ["primary-visual", "Primary visual", ["diagram", "chart-visual", "metric-grid", "text"], "Use one oversized visual or figure as the page center of gravity."],
      ["insight-rail", "Insight rail", ["text", "metric-grid"], "Use only when the dominant object needs a compact reading guide."],
      ["callout", "Callout", ["text", "diagram"], "Attach one evidence-backed emphasis to the primary visual, not a separate mini-card."],
      ["evidence-note", "Evidence note", ["text", "metric-grid"], "Use only when evidence exists; keep it subordinate."],
      ["annotation", "Annotation", ["text", "diagram"], "Keep labels inside the primary visual scope when they explain marks or shapes."],
      ["source-note", "Source note", ["text"], "Use only for supplied source context."],
    ],
  }),
  "hero-metric": entry({
    archetype: "hero-metric",
    requiredSlots: ["metric-hero", "interpretation"],
    optionalSlots: ["evidence-strip"],
    allowedObjectKinds: ["metric-grid", "text", "chart-visual"],
    dominantSlot: "metric-hero",
    densityLimit: "sparse",
    ownershipBoundary: "The metric hero owns numeric text; any evidence strip is a separate editable support region.",
    snapshotBoundary: "Do not snapshot the metric hero unless it is a contracted chart-visual.",
    avoidPatterns: ["KPI dashboard wall", "three unrelated big numbers", "tiny metric tiles"],
    slots: [
      ["metric-hero", "Hero metric", ["metric-grid", "text"], "Make one number or indexed statement dominant."],
      ["interpretation", "Interpretation line", ["text"], "Explain what the metric changes for the audience."],
      ["evidence-strip", "Evidence strip", ["text", "chart-visual"], "Optional compact proof, never a second dashboard."],
    ],
  }),
  "chart-with-insight-rail": entry({
    archetype: "chart-with-insight-rail",
    requiredSlots: ["primary-visual", "insight-rail"],
    optionalSlots: ["callout", "annotation", "source-note"],
    allowedObjectKinds: CHART_OBJECTS,
    dominantSlot: "primary-visual",
    densityLimit: "executive",
    ownershipBoundary: "The chart contract root wraps the primary-visual only; insight rail, callouts, and source notes are secondary unless explicitly contracted.",
    snapshotBoundary: "chart-visual primary-visual objects require data-snapshot-boundary; rail and source note remain editable.",
    avoidPatterns: ["chart plus card wall", "duplicated chart summary paragraph", "many equal annotations"],
    slots: [
      ["primary-visual", "Primary visual", ["chart-visual"], "Give the rendered chart the most area and preserve its contract root."],
      ["insight-rail", "Insight rail", ["text", "metric-grid"], "Use two or three short implications tied to the chart."],
      ["callout", "Callout", ["text", "diagram"], "Place only evidence-backed annotation near the relevant chart region."],
      ["annotation", "Annotation", ["text", "diagram"], "Keep chart labels and mark explanations owned by the chart scope when they explain the plot."],
      ["source-note", "Source note", ["text"], "Use only when the brief supplies source context."],
    ],
  }),
  "matrix-first": entry({
    archetype: "matrix-first",
    requiredSlots: ["primary-visual"],
    optionalSlots: ["callout", "evidence-note", "annotation", "source-note"],
    allowedObjectKinds: ["matrix", "text", "metric-grid"],
    dominantSlot: "primary-visual",
    densityLimit: "executive",
    ownershipBoundary: "The matrix contract root owns the matrix canvas, axis labels, item labels, and SVG/shapes inside it.",
    snapshotBoundary: "Matrix stays editable-shapes; if missing data forces a visual snapshot, screenshot only the declared data-snapshot-boundary root.",
    avoidPatterns: ["table pretending to be a matrix", "four equal text cards", "unlabeled axes"],
    slots: [
      ["primary-visual", "Primary visual", ["matrix"], "Render one 2D decision space with clear axes and placed items."],
      ["callout", "Callout", ["text"], "Optional recommendation or reading rule."],
      ["evidence-note", "Evidence note", ["text", "metric-grid"], "Optional category key only if it improves reading."],
      ["annotation", "Annotation", ["text"], "Keep axis labels, item labels, and quadrant labels inside the matrix root when contracted."],
      ["source-note", "Source note", ["text"], "Use only for supplied source context."],
    ],
  }),
  "comparison-grid": entry({
    archetype: "comparison-grid",
    requiredSlots: ["comparison-field"],
    optionalSlots: ["verdict-rail", "evidence-note", "source-note"],
    allowedObjectKinds: ["comparison-grid", "diagram", "metric-grid", "text"],
    dominantSlot: "comparison-field",
    densityLimit: "executive",
    ownershipBoundary: "The comparison-grid root owns aligned columns, row/dimension labels, and direct evidence labels inside the comparison field.",
    snapshotBoundary: "Comparison grids remain editable shapes/text and are not native tables unless a table contract is explicit.",
    avoidPatterns: ["fake x/y axes", "native table default", "four unrelated cards"],
    slots: [
      ["comparison-field", "Comparison field", ["comparison-grid"], "Use aligned business columns or lanes with a shared comparison logic."],
      ["verdict-rail", "Verdict rail", ["text"], "Optional concise implication that reads the grid."],
      ["evidence-note", "Evidence note", ["text", "metric-grid"], "Use only compact evidence labels that support the comparison."],
      ["source-note", "Source note", ["text"], "Use only for supplied source context."],
    ],
  }),
  "bubble-landscape": entry({
    archetype: "bubble-landscape",
    requiredSlots: ["bubble-field", "interpretation-ring"],
    optionalSlots: ["legend", "method-note"],
    allowedObjectKinds: ["chart-visual", "text", "metric-grid"],
    dominantSlot: "bubble-field",
    densityLimit: "executive",
    ownershipBoundary: "The bubble chart contract root owns the bubble field and in-plot labels; interpretation ring is separate support.",
    snapshotBoundary: "The bubble field is visual-snapshot unless a later native chart phase explicitly supports it.",
    avoidPatterns: ["scatterplot without size meaning", "legend as card wall", "overlapping labels everywhere"],
    slots: [
      ["bubble-field", "Bubble field", ["chart-visual"], "Use x/y/size as the dominant visual grammar."],
      ["interpretation-ring", "Interpretation ring", ["text"], "Place two or three labels around the landscape, not a rail of cards."],
      ["legend", "Legend", ["text", "metric-grid"], "Define size/color only when needed."],
      ["method-note", "Method note", ["text"], "State assumptions briefly if coordinates are qualitative."],
    ],
  }),
  "timeline-led": entry({
    archetype: "timeline-led",
    requiredSlots: ["time-spine", "milestone-nodes"],
    optionalSlots: ["phase-band", "decision-note"],
    allowedObjectKinds: ["diagram", "text", "metric-grid"],
    dominantSlot: "time-spine",
    densityLimit: "executive",
    ownershipBoundary: "Timeline nodes and connectors share one diagram root; narrative notes are secondary roots if contracted.",
    snapshotBoundary: "Timeline remains editable shapes and text; no chart snapshot unless a chart object is separately contracted.",
    avoidPatterns: ["roadmap card row", "too many milestone paragraphs", "unconnected dates"],
    slots: [
      ["time-spine", "Time spine", ["diagram"], "Use one clear chronological axis or vertical path."],
      ["milestone-nodes", "Milestone nodes", ["diagram", "text"], "Group milestones by phase, not as loose cards."],
      ["phase-band", "Phase band", ["diagram", "text"], "Optional stage bands for dense sequences."],
      ["decision-note", "Decision note", ["text"], "Optional implication at the end of the path."],
    ],
  }),
  "process-flow": entry({
    archetype: "process-flow",
    requiredSlots: ["flow-path", "stage-labels"],
    optionalSlots: ["owner-tags", "exception-note"],
    allowedObjectKinds: DIAGRAM_OBJECTS,
    dominantSlot: "flow-path",
    densityLimit: "executive",
    ownershipBoundary: "Flow nodes, connectors, and stage labels share one diagram root unless lanes are separately contracted.",
    snapshotBoundary: "Process flow stays editable shapes; avoid chart/table fallback.",
    avoidPatterns: ["generic roadmap", "floating process cards without connectors", "dense memo paragraph"],
    slots: [
      ["flow-path", "Flow path", ["diagram"], "Draw connected steps with visible direction."],
      ["stage-labels", "Stage labels", ["diagram", "text"], "Name phases or gates compactly."],
      ["owner-tags", "Owner tags", ["text"], "Optional ownership labels when the brief supplies actors."],
      ["exception-note", "Exception note", ["text"], "Optional risk or handoff note."],
    ],
  }),
  "swimlane": entry({
    archetype: "swimlane",
    requiredSlots: ["lane-grid", "handoff-path"],
    optionalSlots: ["phase-band", "control-note"],
    allowedObjectKinds: DIAGRAM_OBJECTS,
    dominantSlot: "lane-grid",
    densityLimit: "dense",
    ownershipBoundary: "Lane headers, phase bands, nodes, and connectors live under one swimlane diagram root.",
    snapshotBoundary: "Swimlane remains editable shapes and text; no visual snapshot unless explicitly contracted.",
    avoidPatterns: ["timeline without owners", "equal cards outside lanes", "diagonal spaghetti connectors"],
    slots: [
      ["lane-grid", "Lane grid", ["diagram"], "Create explicit lanes and align nodes into them."],
      ["handoff-path", "Handoff path", ["diagram"], "Show cross-lane transitions with clear connectors."],
      ["phase-band", "Phase band", ["diagram", "text"], "Optional horizontal or vertical phase grouping."],
      ["control-note", "Control note", ["text"], "Optional governance or risk note."],
    ],
  }),
  "benchmark-table": entry({
    archetype: "benchmark-table",
    requiredSlots: ["table-root", "takeaway"],
    optionalSlots: ["sort-key", "source-note"],
    allowedObjectKinds: ["native-table", "text", "metric-grid"],
    dominantSlot: "table-root",
    densityLimit: "dense",
    ownershipBoundary: "The native-table contract root owns rows and columns only; takeaway text is separate.",
    snapshotBoundary: "Native table exports as a table when dataContract is complete; do not rasterize it as a chart.",
    avoidPatterns: ["matrix-as-table confusion", "decorative table with no data contract", "too many mini cards"],
    slots: [
      ["table-root", "Benchmark table", ["native-table"], "Use structured columns and rows from the contract."],
      ["takeaway", "Table takeaway", ["text"], "State what the table proves in one sentence."],
      ["sort-key", "Sort key", ["text", "metric-grid"], "Optional ranking or filter cue."],
      ["source-note", "Source note", ["text"], "Optional source note when supplied."],
    ],
  }),
  "decision-tree": entry({
    archetype: "decision-tree",
    requiredSlots: ["decision-root", "branches"],
    optionalSlots: ["outcome-note", "criteria"],
    allowedObjectKinds: DIAGRAM_OBJECTS,
    dominantSlot: "decision-root",
    densityLimit: "executive",
    ownershipBoundary: "Decision nodes and branches share one diagram root; criteria notes are separate support.",
    snapshotBoundary: "Decision tree stays editable shapes and connectors.",
    avoidPatterns: ["linear flow without branching", "branch labels as long paragraphs", "unclear decision criteria"],
    slots: [
      ["decision-root", "Decision root", ["diagram"], "Start with one question or gate."],
      ["branches", "Branches", ["diagram"], "Use two to four clear branch outcomes."],
      ["outcome-note", "Outcome note", ["text"], "Optional implication for the selected branch."],
      ["criteria", "Criteria", ["text", "metric-grid"], "Optional criteria list."],
    ],
  }),
  "layered-stack": entry({
    archetype: "layered-stack",
    requiredSlots: ["stack-layers", "integration-note"],
    optionalSlots: ["dependency-callout", "capability-key"],
    allowedObjectKinds: DIAGRAM_OBJECTS,
    dominantSlot: "stack-layers",
    densityLimit: "executive",
    ownershipBoundary: "Layer boxes and dependency connectors share the diagram root.",
    snapshotBoundary: "Layered stack stays editable; do not snapshot unless it is a contracted 3D/visual object.",
    avoidPatterns: ["technology word cloud", "flat list of layers", "decorative 3D with no labels"],
    slots: [
      ["stack-layers", "Stack layers", ["diagram"], "Arrange layers vertically or in depth with clear hierarchy."],
      ["integration-note", "Integration note", ["text"], "Explain how layers work together."],
      ["dependency-callout", "Dependency callout", ["text", "diagram"], "Optional critical dependency."],
      ["capability-key", "Capability key", ["metric-grid", "text"], "Optional legend for layer roles."],
    ],
  }),
  "market-map": entry({
    archetype: "market-map",
    requiredSlots: ["market-canvas", "positioning-labels"],
    optionalSlots: ["segment-key", "winner-note"],
    allowedObjectKinds: ["matrix", "diagram", "text", "metric-grid"],
    dominantSlot: "market-canvas",
    densityLimit: "executive",
    ownershipBoundary: "Map regions and positioned entities share one root; segment key is secondary if contracted.",
    snapshotBoundary: "Market map exports as editable shapes/matrix, not a table.",
    avoidPatterns: ["logo soup", "unlabeled quadrants", "market map as card grid"],
    slots: [
      ["market-canvas", "Market map canvas", ["matrix", "diagram"], "Use spatial placement to encode positioning."],
      ["positioning-labels", "Positioning labels", ["text"], "Keep labels short and tied to positions."],
      ["segment-key", "Segment key", ["text", "metric-grid"], "Optional segment legend."],
      ["winner-note", "Winner note", ["text"], "Optional implication callout."],
    ],
  }),
  "portfolio-grid": entry({
    archetype: "portfolio-grid",
    requiredSlots: ["portfolio-canvas", "portfolio-rule"],
    optionalSlots: ["priority-note", "risk-key"],
    allowedObjectKinds: ["matrix", "comparison-grid", "metric-grid", "text"],
    dominantSlot: "portfolio-canvas",
    densityLimit: "executive",
    ownershipBoundary: "Portfolio items belong to the grid/matrix root; notes are secondary.",
    snapshotBoundary: "Portfolio grid stays editable shapes and labels.",
    avoidPatterns: ["equal card wall", "no prioritization rule", "too many tiny portfolio items"],
    slots: [
      ["portfolio-canvas", "Portfolio canvas", ["matrix", "comparison-grid"], "Show items against a visible prioritization rule."],
      ["portfolio-rule", "Portfolio rule", ["text"], "State the decision rule for placement."],
      ["priority-note", "Priority note", ["text", "metric-grid"], "Optional recommended focus."],
      ["risk-key", "Risk key", ["text"], "Optional risk/return legend."],
    ],
  }),
  "capability-model": entry({
    archetype: "capability-model",
    requiredSlots: ["capability-architecture", "maturity-signal"],
    optionalSlots: ["gap-note", "dependency"],
    allowedObjectKinds: ["diagram", "metric-grid", "text", "comparison-grid"],
    dominantSlot: "capability-architecture",
    densityLimit: "dense",
    ownershipBoundary: "Capability blocks and relationships share one diagram root; maturity signals can be separate metric roots.",
    snapshotBoundary: "Capability model remains editable shapes/text.",
    avoidPatterns: ["capability card wall", "taxonomy with no relationships", "decorative maturity badges"],
    slots: [
      ["capability-architecture", "Capability architecture", ["diagram"], "Show how capabilities relate, not just a list."],
      ["maturity-signal", "Maturity signal", ["metric-grid", "text"], "Use compact status or maturity cues."],
      ["gap-note", "Gap note", ["text"], "Optional gap or constraint."],
      ["dependency", "Dependency", ["diagram", "text"], "Optional dependency callout."],
    ],
  }),
  funnel: entry({
    archetype: "funnel",
    requiredSlots: ["funnel-path", "conversion-logic"],
    optionalSlots: ["dropoff-note", "next-action"],
    allowedObjectKinds: ["diagram", "metric-grid", "chart-visual", "text"],
    dominantSlot: "funnel-path",
    densityLimit: "executive",
    ownershipBoundary: "Funnel stages and conversion labels share one root.",
    snapshotBoundary: "Funnel stays editable unless represented as a contracted chart-visual.",
    avoidPatterns: ["stacked cards pretending to be funnel", "unquantified conversion claims", "too many stage notes"],
    slots: [
      ["funnel-path", "Funnel path", ["diagram", "chart-visual"], "Use narrowing stages with clear flow."],
      ["conversion-logic", "Conversion logic", ["text", "metric-grid"], "Explain the conversion claim."],
      ["dropoff-note", "Dropoff note", ["text"], "Optional leakage or friction point."],
      ["next-action", "Next action", ["text"], "Optional action implication."],
    ],
  }),
  "risk-heatmap": entry({
    archetype: "risk-heatmap",
    requiredSlots: ["heatmap-canvas", "risk-legend"],
    optionalSlots: ["mitigation-note", "watchlist"],
    allowedObjectKinds: ["matrix", "metric-grid", "text"],
    dominantSlot: "heatmap-canvas",
    densityLimit: "dense",
    ownershipBoundary: "Risk cells and labels live inside the matrix/heatmap root.",
    snapshotBoundary: "Risk heatmap remains editable shapes; do not export as native table.",
    avoidPatterns: ["risk register table", "red/amber/green card wall", "unlabeled axes"],
    slots: [
      ["heatmap-canvas", "Risk heatmap canvas", ["matrix"], "Use likelihood/impact or equivalent axes."],
      ["risk-legend", "Risk legend", ["text", "metric-grid"], "Define color/intensity succinctly."],
      ["mitigation-note", "Mitigation note", ["text"], "Optional mitigation for the highest risk."],
      ["watchlist", "Watchlist", ["text", "metric-grid"], "Optional monitored items."],
    ],
  }),
  "thesis-evidence-board": entry({
    archetype: "thesis-evidence-board",
    requiredSlots: ["primary-visual", "evidence-note"],
    optionalSlots: ["insight-rail", "callout", "annotation", "source-note"],
    allowedObjectKinds: BASIC_OBJECTS,
    dominantSlot: "primary-visual",
    densityLimit: "executive",
    ownershipBoundary: "The primary-visual is the thesis/proof structure; evidence notes and callouts remain separate roots unless they directly label that structure.",
    snapshotBoundary: "No snapshot by default; keep narrative evidence editable.",
    avoidPatterns: ["generic card wall", "memo paragraphs", "unsupported filler evidence"],
    slots: [
      ["primary-visual", "Primary visual", ["text", "diagram", "metric-grid"], "Lead with one precise claim expressed as a hierarchy, proof board, or structured thesis field."],
      ["insight-rail", "Insight rail", ["text", "metric-grid"], "Use only when the reader needs a compact interpretation path."],
      ["callout", "Callout", ["text"], "Optional consequence or caveat when the brief supports it."],
      ["evidence-note", "Evidence note", ["metric-grid", "text", "diagram"], "Group evidence into a hierarchy, not equal cards."],
      ["annotation", "Annotation", ["text", "diagram"], "Use labels that clarify evidence ownership without becoming extra cards."],
      ["source-note", "Source note", ["text"], "Use only for supplied source context."],
    ],
  }),
  "before-after": entry({
    archetype: "before-after",
    requiredSlots: ["before-state", "after-state", "change-driver"],
    optionalSlots: ["proof-note"],
    allowedObjectKinds: ["comparison-grid", "diagram", "metric-grid", "text"],
    dominantSlot: "change-driver",
    densityLimit: "executive",
    ownershipBoundary: "Before and after states remain separate roots when independently contracted; the change driver can bridge them.",
    snapshotBoundary: "Before/after stays editable shapes/text unless a contracted chart supplies proof.",
    avoidPatterns: ["two undifferentiated columns", "before/after without a mechanism", "too many cards per side"],
    slots: [
      ["before-state", "Before state", ["comparison-grid", "text", "diagram"], "Show the starting condition compactly."],
      ["after-state", "After state", ["comparison-grid", "text", "diagram"], "Show the changed condition with visual contrast."],
      ["change-driver", "Change driver", ["diagram", "metric-grid", "text"], "Make the mechanism or intervention visible."],
      ["proof-note", "Proof note", ["text", "metric-grid"], "Optional evidence if supplied."],
    ],
  }),
  flywheel: entry({
    archetype: "flywheel",
    requiredSlots: ["cycle", "momentum-proof"],
    optionalSlots: ["entry-point", "constraint"],
    allowedObjectKinds: ["diagram", "metric-grid", "text"],
    dominantSlot: "cycle",
    densityLimit: "executive",
    ownershipBoundary: "Cycle nodes and arrows share one diagram root; proof notes are separate support.",
    snapshotBoundary: "Flywheel remains editable shapes and arrows.",
    avoidPatterns: ["linear process disguised as flywheel", "cycle with no reinforcing mechanism", "too many orbiting notes"],
    slots: [
      ["cycle", "Reinforcing cycle", ["diagram"], "Show a circular or looped sequence with momentum."],
      ["momentum-proof", "Momentum proof", ["metric-grid", "text"], "Tie the loop to one evidence signal."],
      ["entry-point", "Entry point", ["text", "diagram"], "Optional start point or wedge."],
      ["constraint", "Constraint", ["text"], "Optional limiter or risk."],
    ],
  }),
  "operating-model": entry({
    archetype: "operating-model",
    requiredSlots: ["operating-layers", "governance-path"],
    optionalSlots: ["roles", "cadence"],
    allowedObjectKinds: DIAGRAM_OBJECTS,
    dominantSlot: "operating-layers",
    densityLimit: "dense",
    ownershipBoundary: "Operating layers, roles, and governance path share a diagram root unless a secondary table is explicitly contracted.",
    snapshotBoundary: "Operating model stays editable diagram geometry.",
    avoidPatterns: ["org chart only", "process cards without governance", "default swimlane when roles are not supplied"],
    slots: [
      ["operating-layers", "Operating layers", ["diagram"], "Show layers, teams, or workstreams as a system."],
      ["governance-path", "Governance path", ["diagram", "text"], "Make decision or escalation flow visible."],
      ["roles", "Roles", ["text", "metric-grid"], "Optional role labels if supplied."],
      ["cadence", "Cadence", ["text", "diagram"], "Optional rhythm or meeting cycle."],
    ],
  }),
  "annotation-stage": entry({
    archetype: "annotation-stage",
    requiredSlots: ["figure-stage", "annotation-ring"],
    optionalSlots: ["caption", "method-note"],
    allowedObjectKinds: ["diagram", "chart-visual", "text", "metric-grid"],
    dominantSlot: "figure-stage",
    densityLimit: "executive",
    ownershipBoundary: "The figure root owns the annotated visual; outer captions are secondary support.",
    snapshotBoundary: "A chart figure may snapshot, but diagram annotations remain editable.",
    avoidPatterns: ["annotation cards detached from figure", "figure hidden inside a card", "too many labels"],
    slots: [
      ["figure-stage", "Figure stage", ["diagram", "chart-visual"], "Place the object being explained at center stage."],
      ["annotation-ring", "Annotation ring", ["text", "diagram"], "Attach short labels around the figure."],
      ["caption", "Caption", ["text"], "Optional interpretation caption."],
      ["method-note", "Method note", ["text"], "Optional caveat or method note."],
    ],
  }),
  "evidence-wall": entry({
    archetype: "evidence-wall",
    requiredSlots: ["evidence-hierarchy", "reading-rule"],
    optionalSlots: ["hero-fact", "implication"],
    allowedObjectKinds: ["metric-grid", "text", "native-table", "chart-visual"],
    dominantSlot: "evidence-hierarchy",
    densityLimit: "dense",
    ownershipBoundary: "Each contracted evidence object owns its own root; never merge tables/charts into generic evidence cards.",
    snapshotBoundary: "Only chart-visual evidence snapshots; text, metric, and table evidence remain editable/native.",
    avoidPatterns: ["flat equal card wall", "unprioritized facts", "unsupported filler stats"],
    slots: [
      ["evidence-hierarchy", "Evidence hierarchy", ["metric-grid", "text", "native-table"], "Rank evidence by importance, not by equal tile size."],
      ["reading-rule", "Reading rule", ["text"], "Tell the audience how to read the evidence."],
      ["hero-fact", "Hero fact", ["metric-grid", "text"], "Optional lead fact."],
      ["implication", "Implication", ["text"], "Optional consequence."],
    ],
  }),
  "case-timeline": entry({
    archetype: "case-timeline",
    requiredSlots: ["case-spine", "turning-points"],
    optionalSlots: ["lesson", "outcome-proof"],
    allowedObjectKinds: ["diagram", "text", "metric-grid"],
    dominantSlot: "case-spine",
    densityLimit: "executive",
    ownershipBoundary: "Case events share one timeline diagram root; lesson/outcome support is secondary.",
    snapshotBoundary: "Case timeline remains editable shapes and text.",
    avoidPatterns: ["generic roadmap", "chronology with no lesson", "too many event cards"],
    slots: [
      ["case-spine", "Case spine", ["diagram"], "Use chronology to explain a case, not just list dates."],
      ["turning-points", "Turning points", ["diagram", "text"], "Mark the few moments that changed the outcome."],
      ["lesson", "Lesson", ["text"], "Optional lesson for the audience."],
      ["outcome-proof", "Outcome proof", ["metric-grid", "text"], "Optional outcome evidence."],
    ],
  }),
  "bridge-explanation": entry({
    archetype: "bridge-explanation",
    requiredSlots: ["primary-visual", "evidence-note"],
    optionalSlots: ["callout", "annotation", "source-note"],
    allowedObjectKinds: ["chart-visual", "diagram", "metric-grid", "text"],
    dominantSlot: "primary-visual",
    densityLimit: "executive",
    ownershipBoundary: "Bridge chart/diagram owns the start, driver, end labels, connectors, and internal annotations; driver notes are separate only when contracted.",
    snapshotBoundary: "Waterfall or bridge chart primary-visual objects require data-snapshot-boundary; conceptual bridges remain editable diagrams.",
    avoidPatterns: ["waterfall with no start/end", "drivers as unrelated cards", "bridge explanation buried in prose"],
    slots: [
      ["primary-visual", "Primary visual", ["chart-visual", "diagram"], "Show how one state/value converts into another."],
      ["callout", "Callout", ["text", "diagram"], "Optional scenario, caveat, or driver highlight."],
      ["evidence-note", "Evidence note", ["metric-grid", "text", "diagram"], "Name the bridge drivers in sequence."],
      ["annotation", "Annotation", ["text", "diagram"], "Keep start, driver, and end labels attached to the bridge root."],
      ["source-note", "Source note", ["text"], "Use only for supplied source context."],
    ],
  }),
} satisfies Record<PageLayoutArchetype, VisualGrammarRegistryEntry>;

export function getVisualGrammarRegistryEntry(archetype: PageLayoutArchetype) {
  return VISUAL_GRAMMAR_REGISTRY[archetype];
}

export function buildVisualGrammarRegistryPromptLines(archetype: PageLayoutArchetype) {
  const registry = getVisualGrammarRegistryEntry(archetype);
  const dominantSlot = registry.slots.find((slotItem) => slotItem.id === registry.dominantSlot);
  const requiredSlots = registry.requiredSlots
    .map((slotId) => registry.slots.find((slotItem) => slotItem.id === slotId))
    .filter((slotItem): slotItem is VisualGrammarSlotDefinition => Boolean(slotItem));

  return [
    "Visual Grammar Registry v1: slot-driven structure only; registry field names are private layout context.",
    `dominant slot: ${registry.dominantSlot}${dominantSlot ? ` - ${dominantSlot.guidance}` : ""}`,
    `required slots: ${requiredSlots.map((slotItem) => `${slotItem.id} (${slotItem.label})`).join("; ")}`,
    `watch-outs: ${registry.avoidPatterns.join("; ")}`,
    "Use secondary slots only when they serve the page claim; otherwise leave them out or compress them.",
  ];
}
