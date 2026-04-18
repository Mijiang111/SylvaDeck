import type {
  BlockKind,
  ModuleRegistryCategory,
  ModuleRegistryEntry,
  ModuleRendererCapability,
  ModuleTemplateFamily,
  ModuleTemplateField,
  ModuleTemplateFieldType,
} from "../types";
import type { ModuleAuthoringHandoff } from "../module-authoring-handoff";
import {
  getStarterPackManifest,
  getStarterPackTheme,
  isStarterPackLayout,
  type STARTER_PACK_LAYOUTS,
} from "./registry";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function buildField(args: {
  id: string;
  label: string;
  description: string;
  type?: ModuleTemplateFieldType;
  objectKind?: ModuleTemplateField["objectKind"];
  required?: boolean;
  goal?: string;
  layout: NonNullable<ModuleTemplateField["layout"]>;
  style?: ModuleTemplateField["style"];
  chartKind?: "bar";
}) {
  return {
    id: args.id,
    label: args.label,
    type: args.type ?? "custom",
    objectKind: args.objectKind ?? "slot",
    aiState:
      args.objectKind === "text" || args.objectKind === "rectangle" || args.objectKind === "line"
        ? ("locked" as const)
        : args.objectKind === "data"
          ? ("summarize-linked-data" as const)
          : ("ai-fill" as const),
    surface: "artboard" as const,
    description: args.description,
    required: args.required ?? true,
    outputContract: args.goal
      ? {
          goal: args.goal,
          format: args.objectKind === "chart" ? "chart" : "point",
          length: "short",
        }
      : undefined,
    layout: args.layout,
    style: args.style,
    chartSpec: args.chartKind ? { kind: args.chartKind } : undefined,
  } satisfies ModuleTemplateField;
}

function createDraft(args: {
  starterId: string;
  kind: BlockKind;
  family: ModuleTemplateFamily;
  category: ModuleRegistryCategory;
  label: string;
  semanticRole: string;
  description: string;
  promptHint: string;
  rendererCapabilities: ModuleRendererCapability[];
  useCases: string[];
  fields: ModuleTemplateField[];
}) {
  return {
    id: `private.${slugify(args.starterId)}.${Date.now().toString(36)}`,
    kind: args.kind,
    label: args.label,
    category: args.category,
    scope: "private",
    status: "draft",
    family: args.family,
    semanticRole: args.semanticRole,
    description: args.description,
    promptHint: args.promptHint,
    useCases: args.useCases,
    searchTerms: [args.label, args.starterId, "starter-pack", "template"].map(slugify),
    rendererCapabilities: args.rendererCapabilities,
    skillBindings: [],
    defaultSkillRequirements: [],
    supportedSkillClasses: ["framework", "domain", "output"],
    incompatibleSkillIds: [],
    examples: [],
    moduleFrame: {
      x: 10,
      y: 8,
      w: 140,
      h: 74,
    },
    connections: [],
    thinkingFlow: {
      nodes: [],
      edges: [],
    },
    fields: args.fields,
    order: 900,
    featured: false,
  } satisfies ModuleRegistryEntry;
}

function createLayoutDraft(starterId: string) {
  const starter = getStarterPackManifest(starterId);
  if (!isStarterPackLayout(starter)) {
    return null;
  }
  const theme = getStarterPackTheme(starter.themeId);
  const surface = theme?.id === "tokyo-night" || theme?.id === "cyberpunk-neon" ? "#0f1724" : "#ffffff";
  const stroke = theme?.id === "tokyo-night" || theme?.id === "cyberpunk-neon" ? "#31455f" : "#c8d3de";

  switch (starter.id) {
    case "starter.cover":
      return createDraft({
        starterId,
        kind: "matrix",
        family: "story-pattern",
        category: "logic",
        label: "Starter cover",
        semanticRole: "A full-page starter opener with one dominant title, one short lede, and light metadata.",
        description: "Imported from the html-ppt-skill cover starter as a read-only starter copy.",
        promptHint: "Use this when you want a hero opener with one title and one disciplined supporting line.",
        rendererCapabilities: ["matrix-grid"],
        useCases: ["Presentation opener", "Vision page", "Section cover"],
        fields: [
          buildField({
            id: "locked-kicker",
            label: "Locked kicker",
            description: "Fixed eyebrow text.",
            objectKind: "text",
            required: false,
            layout: { x: 14, y: 10, w: 28, h: 6 },
            style: { fill: "#173043", textAlign: "left" },
          }),
          buildField({
            id: "headline",
            label: "Headline",
            description: "Primary hero title.",
            goal: "State one memorable page-opening claim.",
            layout: { x: 14, y: 20, w: 86, h: 24 },
          }),
          buildField({
            id: "lede",
            label: "Lede",
            description: "Short supporting sentence.",
            required: false,
            goal: "Add one short sentence that grounds the opener.",
            layout: { x: 14, y: 48, w: 58, h: 14 },
          }),
          buildField({
            id: "metadata",
            label: "Metadata pills",
            description: "Compact chip-like metadata.",
            required: false,
            goal: "Use 2-3 compact metadata labels if the brief supports them.",
            layout: { x: 14, y: 66, w: 72, h: 10 },
          }),
          buildField({
            id: "divider",
            label: "Divider",
            description: "Decorative divider line.",
            objectKind: "line",
            required: false,
            layout: { x: 14, y: 62, w: 92, h: 2 },
            style: { stroke: stroke, strokeWidth: 2, strokeStyle: "solid" },
          }),
        ],
      });
    case "starter.section-divider":
      return createDraft({
        starterId,
        kind: "matrix",
        family: "story-pattern",
        category: "logic",
        label: "Starter section divider",
        semanticRole: "A section-break template with one section number and one strong divider title.",
        description: "Imported from the html-ppt-skill section-divider starter.",
        promptHint: "Use this for section breaks and chapter transitions, not for proof-heavy pages.",
        rendererCapabilities: ["matrix-grid"],
        useCases: ["Chapter break", "Section opener"],
        fields: [
          buildField({
            id: "section-number",
            label: "Section number",
            description: "Small chapter number.",
            goal: "Render a short section index or chapter number.",
            layout: { x: 14, y: 18, w: 22, h: 10 },
          }),
          buildField({
            id: "section-title",
            label: "Section title",
            description: "Large divider title.",
            goal: "State one strong section title.",
            layout: { x: 14, y: 34, w: 100, h: 18 },
          }),
          buildField({
            id: "rule",
            label: "Rule",
            description: "Structural divider line.",
            objectKind: "line",
            required: false,
            layout: { x: 14, y: 56, w: 110, h: 2 },
            style: { stroke: stroke, strokeWidth: 2, strokeStyle: "solid" },
          }),
        ],
      });
    case "starter.bullets":
      return createDraft({
        starterId,
        kind: "matrix",
        family: "primitive",
        category: "logic",
        label: "Starter bullets",
        semanticRole: "A text-first page with one title and one disciplined bullet stack.",
        description: "Imported from the html-ppt-skill bullets starter.",
        promptHint: "Use this when a page should read as one argument plus a clean bullet list.",
        rendererCapabilities: ["matrix-grid"],
        useCases: ["Narrative page", "Structured summary"],
        fields: [
          buildField({
            id: "title",
            label: "Title",
            description: "Page title.",
            goal: "State one concise page claim.",
            layout: { x: 14, y: 16, w: 96, h: 14 },
          }),
          buildField({
            id: "bullets",
            label: "Bullet stack",
            description: "Primary bullet list.",
            goal: "Produce 3-5 bullets with disciplined line length.",
            layout: { x: 14, y: 34, w: 104, h: 40 },
          }),
        ],
      });
    case "starter.two-column":
      return createDraft({
        starterId,
        kind: "matrix",
        family: "framework",
        category: "comparison",
        label: "Starter two-column",
        semanticRole: "A two-pane page with one dominant left column and one supporting right column.",
        description: "Imported from the html-ppt-skill two-column starter.",
        promptHint: "Use this when the page needs concept-plus-proof or thesis-plus-detail framing.",
        rendererCapabilities: ["matrix-grid"],
        useCases: ["Two-column comparison", "Claim plus detail"],
        fields: [
          buildField({
            id: "title",
            label: "Title",
            description: "Shared page title.",
            goal: "State one shared framing title across the page.",
            layout: { x: 14, y: 12, w: 104, h: 12 },
          }),
          buildField({
            id: "left-pane",
            label: "Left pane",
            description: "Primary pane content.",
            goal: "Carry the stronger claim or summary in the left pane.",
            layout: { x: 14, y: 28, w: 58, h: 44 },
            style: { fill: surface, stroke, strokeWidth: 1, radius: "soft" },
          }),
          buildField({
            id: "right-pane",
            label: "Right pane",
            description: "Secondary pane content.",
            required: false,
            goal: "Carry the supporting detail or comparison in the right pane.",
            layout: { x: 82, y: 28, w: 56, h: 44 },
            style: { fill: surface, stroke, strokeWidth: 1, radius: "soft" },
          }),
        ],
      });
    case "starter.comparison":
      return createDraft({
        starterId,
        kind: "matrix",
        family: "framework",
        category: "comparison",
        label: "Starter comparison",
        semanticRole: "A two-pane comparison page with an explicit axis and two contrasted sides.",
        description: "Imported from the html-ppt-skill comparison starter.",
        promptHint: "Use this when the page must compare two states, options, or positions.",
        rendererCapabilities: ["matrix-grid"],
        useCases: ["Before/after", "Option comparison", "Trade-off page"],
        fields: [
          buildField({
            id: "comparison-title",
            label: "Comparison title",
            description: "Comparison framing title.",
            goal: "State the axis or decision being compared.",
            layout: { x: 14, y: 12, w: 104, h: 12 },
          }),
          buildField({
            id: "left-side",
            label: "Left side",
            description: "First comparison side.",
            goal: "Describe one side of the comparison.",
            layout: { x: 14, y: 28, w: 58, h: 42 },
            style: { fill: surface, stroke, strokeWidth: 1, radius: "soft" },
          }),
          buildField({
            id: "right-side",
            label: "Right side",
            description: "Second comparison side.",
            goal: "Describe the second side of the comparison.",
            layout: { x: 82, y: 28, w: 58, h: 42 },
            style: { fill: surface, stroke, strokeWidth: 1, radius: "soft" },
          }),
        ],
      });
    case "starter.timeline":
      return createDraft({
        starterId,
        kind: "phases",
        family: "story-pattern",
        category: "roadmap",
        label: "Starter timeline",
        semanticRole: "A horizontal milestone path with one title and compact timeline markers.",
        description: "Imported from the html-ppt-skill timeline starter.",
        promptHint: "Use this for sequence, history, or roadmap pages that need one horizontal path.",
        rendererCapabilities: ["timeline-roadmap"],
        useCases: ["Timeline", "Milestones", "Roadmap"],
        fields: [
          buildField({
            id: "title",
            label: "Timeline title",
            description: "Timeline framing title.",
            goal: "State the timeline theme or sequencing question.",
            layout: { x: 14, y: 12, w: 90, h: 12 },
          }),
          buildField({
            id: "timeline-items",
            label: "Milestones",
            description: "Compact timeline milestones.",
            goal: "Use 4-5 short milestones along one linear path.",
            layout: { x: 14, y: 32, w: 120, h: 28 },
          }),
          buildField({
            id: "path-line",
            label: "Path line",
            description: "Horizontal timeline baseline.",
            objectKind: "line",
            required: false,
            layout: { x: 18, y: 50, w: 116, h: 2 },
            style: { stroke: stroke, strokeWidth: 2, strokeStyle: "solid" },
          }),
        ],
      });
    case "starter.arch-diagram":
      return createDraft({
        starterId,
        kind: "flow",
        family: "framework",
        category: "logic",
        label: "Starter architecture diagram",
        semanticRole: "A staged architecture page with one title, layered system regions, and compact labels.",
        description: "Imported from the html-ppt-skill architecture diagram starter.",
        promptHint: "Use this for architecture reviews and system layering pages.",
        rendererCapabilities: ["step-flow"],
        useCases: ["Architecture", "System stack", "Layered technical diagram"],
        fields: [
          buildField({
            id: "title",
            label: "Architecture title",
            description: "Shared page title.",
            goal: "State what system or architecture is being shown.",
            layout: { x: 14, y: 12, w: 104, h: 12 },
          }),
          buildField({
            id: "system-stage",
            label: "System stage",
            description: "Primary architecture figure.",
            goal: "Show one system stack or architecture stage with compact labels.",
            layout: { x: 14, y: 28, w: 88, h: 44 },
            style: { fill: surface, stroke, strokeWidth: 1, radius: "soft" },
          }),
          buildField({
            id: "annotations",
            label: "Annotations",
            description: "Compact explanatory labels.",
            required: false,
            goal: "Add short annotations around the architecture stage.",
            layout: { x: 106, y: 28, w: 34, h: 34 },
          }),
        ],
      });
    case "starter.chart-bar":
      return createDraft({
        starterId,
        kind: "bars",
        family: "primitive",
        category: "evidence",
        label: "Starter chart bar",
        semanticRole: "A chart-first page with one bar chart and one compact takeaway zone.",
        description: "Imported from the html-ppt-skill chart-bar starter.",
        promptHint: "Use this when the page should resolve around one bar chart and a short takeaway.",
        rendererCapabilities: ["bar-comparison"],
        useCases: ["Bar chart page", "KPI comparison", "Ranking proof"],
        fields: [
          buildField({
            id: "title",
            label: "Chart title",
            description: "Chart framing title.",
            goal: "State the question or comparison the chart answers.",
            layout: { x: 14, y: 12, w: 92, h: 12 },
          }),
          buildField({
            id: "chart",
            label: "Bar chart",
            description: "Primary chart slot.",
            objectKind: "chart",
            goal: "Render one dominant bar chart here.",
            layout: { x: 14, y: 28, w: 84, h: 42 },
            chartKind: "bar",
          }),
          buildField({
            id: "takeaway",
            label: "Takeaway",
            description: "Compact takeaway or annotation zone.",
            required: false,
            goal: "Interpret the chart in one compact note.",
            layout: { x: 104, y: 30, w: 36, h: 24 },
            style: { fill: surface, stroke, strokeWidth: 1, radius: "soft" },
          }),
        ],
      });
    default:
      return null;
  }
}

export function createStarterPackAuthoringHandoff(
  starterId: string,
): ModuleAuthoringHandoff | null {
  const starter = getStarterPackManifest(starterId);
  if (!isStarterPackLayout(starter)) {
    return null;
  }

  const draft = createLayoutDraft(starterId);
  if (!draft) {
    return null;
  }

  const theme = getStarterPackTheme(starter.themeId);
  return {
    draft,
    preferredStage: "compose",
    sourceLabel: `Read-only starter pack from ${starter.source}${theme ? ` · ${theme.label}` : ""}.`,
  };
}
