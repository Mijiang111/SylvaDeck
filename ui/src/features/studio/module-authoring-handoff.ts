import { MODULE_AUTHORING_HANDOFF_STORAGE_KEY } from "./config";
import type {
  BlockKind,
  HtmlEditableBlock,
  HtmlLayoutZone,
  HtmlPageVisualStyle,
  HtmlVisualContentNode,
  HtmlVisualNode,
  ModuleChartKind,
  ModuleRegistryCategory,
  ModuleRegistryEntry,
  ModuleRendererCapability,
  ModuleTemplateFamily,
  ModuleTemplateField,
  ModuleTemplateFieldType,
} from "./types";

export type ModuleAuthoringStageTarget =
  | "define"
  | "compose"
  | "semantics"
  | "test"
  | "publish";

export type ModuleAuthoringHandoff = {
  draft: ModuleRegistryEntry;
  preferredStage: ModuleAuthoringStageTarget;
  sourceLabel: string;
};

type BaseSelectionContext = {
  projectName: string;
  pageTitle: string;
  pageNumber: number;
  pageStyle: HtmlPageVisualStyle | null;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function trimText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, Math.max(0, length - 1)).trim()}…` : value;
}

function createDraftId(kind: BlockKind, label: string) {
  const createdAt = Date.now().toString(36);
  const slug = slugify(label || "custom-module") || "custom-module";
  return `private.${slug}-${createdAt}.${kind}`;
}

function inferFamily(kind: BlockKind): ModuleTemplateFamily {
  if (kind === "metrics" || kind === "bars" || kind === "line" || kind === "gantt") {
    return "primitive";
  }
  if (kind === "flow" || kind === "phases") {
    return "story-pattern";
  }
  return "framework";
}

function inferCategory(kind: BlockKind): ModuleRegistryCategory {
  if (kind === "metrics" || kind === "line") {
    return "evidence";
  }
  if (kind === "bars" || kind === "matrix") {
    return "comparison";
  }
  if (kind === "gantt" || kind === "phases") {
    return "roadmap";
  }
  return "logic";
}

function inferRendererCapabilities(kind: BlockKind): ModuleRendererCapability[] {
  if (kind === "metrics") return ["metric-grid"];
  if (kind === "bars") return ["bar-comparison"];
  if (kind === "line") return ["trend-line"];
  if (kind === "flow") return ["step-flow"];
  if (kind === "gantt") return ["timeline-roadmap"];
  if (kind === "phases") return ["phase-summary"];
  return ["matrix-grid"];
}

function buildField(args: {
  id: string;
  label: string;
  description: string;
  type?: ModuleTemplateFieldType;
  objectKind?: ModuleTemplateField["objectKind"];
  required?: boolean;
  example?: string;
  chartKind?: ModuleChartKind;
  style?: ModuleTemplateField["style"];
  outputGoal?: string;
}) {
  return {
    id: args.id,
    label: args.label,
    type: args.type ?? "custom",
    objectKind: args.objectKind ?? "slot",
    aiState: "ai-fill" as const,
    surface: "artboard" as const,
    description: args.description,
    required: args.required ?? true,
    example: args.example,
    chartSpec: args.chartKind ? { kind: args.chartKind } : undefined,
    style: args.style,
    outputContract: args.outputGoal
      ? {
          goal: args.outputGoal,
        }
      : undefined,
  } satisfies ModuleTemplateField;
}

function inferDraftKindFromBlock(block: HtmlEditableBlock): BlockKind {
  const content = trimText(block.items?.join(" ") || block.text);
  if (block.kind === "list") {
    return "flow";
  }
  if (/\b(20\d{2}|q[1-4]|quarter|month|year|trajectory|trend|from\b.*\bto)\b/i.test(content)) {
    return "line";
  }
  if (/\d/.test(content)) {
    return "metrics";
  }
  if (block.kind === "headline" || block.kind === "heading") {
    return "matrix";
  }
  return "matrix";
}

function inferChartKindFromVisual(args: {
  pageTitle: string;
  node: HtmlVisualNode;
  contentNodes: HtmlVisualContentNode[];
}): ModuleChartKind | null {
  if (args.node.kind !== "chart-frame") {
    return null;
  }

  const text = [
    args.pageTitle,
    ...args.contentNodes.map((item) => item.text),
  ]
    .map(trimText)
    .filter(Boolean)
    .join(" ");

  if (/\b(waterfall|bridge|delta)\b/i.test(text)) {
    return "waterfall";
  }
  if (/\b(20\d{2}|q[1-4]|quarter|month|year|trend|trajectory|from\b.*\bto)\b/i.test(text)) {
    return "line";
  }
  if (/\b(stack|mix|share|split)\b/i.test(text)) {
    return "stacked";
  }
  return "bar";
}

function createBaseDraft(args: {
  kind: BlockKind;
  label: string;
  category?: ModuleRegistryCategory;
  family?: ModuleTemplateFamily;
  semanticRole: string;
  description: string;
  promptHint: string;
  useCases: string[];
  searchTerms: string[];
  fields: ModuleTemplateField[];
}) {
  return {
    id: createDraftId(args.kind, args.label),
    kind: args.kind,
    label: args.label,
    category: args.category ?? inferCategory(args.kind),
    scope: "private" as const,
    status: "draft" as const,
    family: args.family ?? inferFamily(args.kind),
    semanticRole: args.semanticRole,
    description: args.description,
    promptHint: args.promptHint,
    useCases: args.useCases,
    searchTerms: args.searchTerms,
    rendererCapabilities: inferRendererCapabilities(args.kind),
    skillBindings: [],
    defaultSkillRequirements: [],
    supportedSkillClasses: ["framework", "domain", "output"],
    incompatibleSkillIds: [],
    examples: [],
    moduleFrame: {
      x: 12,
      y: 10,
      w: 136,
      h: 70,
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

export function createModuleAuthoringHandoffFromHtmlBlock(
  args: BaseSelectionContext & {
    block: HtmlEditableBlock;
  },
): ModuleAuthoringHandoff {
  const kind = inferDraftKindFromBlock(args.block);
  const content = trimText(args.block.items?.join(" · ") || args.block.text);
  const labelSeed =
    args.block.kind === "headline" || args.block.kind === "heading"
      ? content
      : `${args.pageTitle} insight`;
  const label = truncate(labelSeed || `${args.pageTitle} module`, 42);
  const pageAccent = args.pageStyle?.dividerColor ?? "#d8d0c2";
  const pageFill = args.pageStyle?.surfaceFill ?? "#ffffff";

  return {
    draft: createBaseDraft({
      kind,
      label,
      semanticRole: `Reusable ${args.block.kind} capability extracted from "${args.pageTitle}" to carry one evidence-led point cleanly.`,
      description: `Created from a selected ${args.block.kind} block on page ${args.pageNumber} of ${args.projectName}. Use it when one clear point or evidence thread should be made reusable.`,
      promptHint: `Use this module when the page needs to express a ${args.block.kind} insight from a brief without rewriting the whole page.`,
      useCases: [
        `Lift one high-signal point from "${args.pageTitle}" into a reusable module.`,
        `Reapply the same argument shape across multiple executive pages.`,
      ],
      searchTerms: [args.pageTitle, args.block.kind, "extracted block", args.projectName]
        .map(slugify)
        .filter(Boolean),
      fields: [
        buildField({
          id: "field-primary-message",
          label: "Primary message",
          objectKind: kind === "metrics" ? "text" : "slot",
          description: "Carry the main point or text structure extracted from the selected page block.",
          example: content,
          style: {
            fill: kind === "metrics" ? pageFill : undefined,
            stroke: pageAccent,
          },
          outputGoal: "Land the main message in a concise, executive-ready way.",
        }),
        buildField({
          id: "field-evidence-detail",
          label: "Evidence detail",
          objectKind: "text",
          required: false,
          description: "Optional supporting evidence or context that should travel with the primary message.",
          example: content,
          style: {
            fill: pageFill,
            stroke: pageAccent,
          },
          outputGoal: "Support the main message with one concrete proof point.",
        }),
      ],
    }),
    preferredStage: "compose",
    sourceLabel: `Extracted from a selected ${args.block.kind} block on page ${args.pageNumber}.`,
  };
}

export function createModuleAuthoringHandoffFromVisualNode(
  args: BaseSelectionContext & {
    node: HtmlVisualNode;
    contentNodes: HtmlVisualContentNode[];
  },
): ModuleAuthoringHandoff {
  const chartKind = inferChartKindFromVisual(args);
  const kind: BlockKind =
    chartKind === "line" ? "line" : chartKind === "waterfall" ? "gantt" : chartKind ? "bars" : "matrix";
  const contentPreview = args.contentNodes.map((item) => trimText(item.text)).filter(Boolean).join(" · ");
  const label = truncate(
    contentPreview || `${args.pageTitle} ${args.node.kind.replace(/-/g, " ")}`,
    42,
  );

  return {
    draft: createBaseDraft({
      kind,
      label,
      semanticRole:
        args.node.kind === "chart-frame"
          ? `Reusable chart capability extracted from "${args.pageTitle}" for evidence-led comparisons or trends.`
          : `Reusable visual container extracted from "${args.pageTitle}" for structured evidence presentation.`,
      description: `Created from a selected ${args.node.kind} on page ${args.pageNumber} of ${args.projectName}. Use it when that visual pattern should become a reusable capability.`,
      promptHint:
        args.node.kind === "chart-frame"
          ? "Use this module when the page needs a structured chart plus an explanatory takeaway."
          : "Use this module when the page needs a reusable visual surface with optional annotation.",
      useCases: [
        `Turn the ${args.node.kind.replace(/-/g, " ")} from "${args.pageTitle}" into a reusable module.`,
        "Keep the visual treatment reusable while allowing the evidence payload to change.",
      ],
      searchTerms: [args.pageTitle, args.node.kind, chartKind ?? "visual", args.projectName]
        .map(slugify)
        .filter(Boolean),
      fields: [
        buildField({
          id: "field-primary-visual",
          label: chartKind ? "Primary chart" : "Primary surface",
          objectKind: chartKind ? "chart" : "slot",
          description:
            chartKind
              ? "Main chart payload and structure for the extracted visual."
              : "Main visual payload that should fill this extracted module.",
          chartKind: chartKind ?? undefined,
          style: {
            fill: args.node.style.background ?? args.pageStyle?.surfaceFill,
            stroke: args.node.style.border ?? args.pageStyle?.dividerColor,
          },
          outputGoal:
            chartKind
              ? "Show the evidence in a chart only when the underlying data really supports it."
              : "Present the evidence in a reusable visual surface.",
        }),
        buildField({
          id: "field-annotation",
          label: "Annotation",
          objectKind: "text",
          required: false,
          description: "Optional annotation or takeaway that explains why the visual matters.",
          example: contentPreview,
          style: {
            fill: args.node.style.background ?? args.pageStyle?.surfaceFill,
            stroke: args.node.style.accent ?? args.pageStyle?.dividerColor,
          },
          outputGoal: "Add one concise explanation or implication next to the visual.",
        }),
      ],
    }),
    preferredStage: "compose",
    sourceLabel: `Extracted from a selected ${args.node.kind} on page ${args.pageNumber}.`,
  };
}

export function createModuleAuthoringHandoffFromLayoutZone(
  args: BaseSelectionContext & {
    zone: HtmlLayoutZone;
  },
): ModuleAuthoringHandoff {
  const label = truncate(`${args.pageTitle} ${args.zone.kind} split`, 42);
  const leftShare = Math.round(args.zone.splitPercent);
  const rightShare = 100 - leftShare;

  return {
    draft: createBaseDraft({
      kind: "matrix",
      label,
      semanticRole: `Reusable ${args.zone.kind} layout capability extracted from "${args.pageTitle}" to hold a two-zone argument or summary split.`,
      description: `Created from a selected ${args.zone.kind} layout zone on page ${args.pageNumber} of ${args.projectName}. Use it when a repeatable split layout should become a module.`,
      promptHint: `Use this module when the page needs a ${leftShare}/${rightShare} split between two related ideas, such as claim vs proof or summary vs detail.`,
      useCases: [
        `Reuse the ${leftShare}/${rightShare} split from "${args.pageTitle}".`,
        "Apply the same structural rhythm to multiple pages without rebuilding the layout manually.",
      ],
      searchTerms: [args.pageTitle, args.zone.kind, "layout", "split", args.projectName]
        .map(slugify)
        .filter(Boolean),
      fields: [
        buildField({
          id: "field-left-zone",
          label: args.zone.kind === "header" ? "Primary pane" : "Left pane",
          objectKind: "slot",
          description: "Primary pane content for the extracted layout split.",
          style: {
            fill: args.pageStyle?.surfaceFill,
            stroke: args.pageStyle?.dividerColor,
          },
          outputGoal: "Anchor the stronger claim or summary in the leading pane.",
        }),
        buildField({
          id: "field-right-zone",
          label: args.zone.kind === "header" ? "Support pane" : "Right pane",
          objectKind: "slot",
          description: "Secondary pane content for the extracted layout split.",
          style: {
            fill: args.pageStyle?.surfaceFill,
            stroke: args.pageStyle?.dividerColor,
          },
          outputGoal: "Carry the supporting proof, detail, or comparison alongside the primary pane.",
        }),
      ],
    }),
    preferredStage: "compose",
    sourceLabel: `Extracted from a selected ${args.zone.kind} layout zone on page ${args.pageNumber}.`,
  };
}

export function storeModuleAuthoringHandoff(payload: ModuleAuthoringHandoff) {
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  if (!canUseStorage()) {
    return token;
  }

  window.sessionStorage.setItem(
    `${MODULE_AUTHORING_HANDOFF_STORAGE_KEY}:${token}`,
    JSON.stringify(payload),
  );
  return token;
}

export function consumeModuleAuthoringHandoff(token: string) {
  if (!canUseStorage()) {
    return null;
  }

  const storageKey = `${MODULE_AUTHORING_HANDOFF_STORAGE_KEY}:${token}`;
  const raw = window.sessionStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  window.sessionStorage.removeItem(storageKey);

  try {
    return JSON.parse(raw) as ModuleAuthoringHandoff;
  } catch {
    return null;
  }
}
