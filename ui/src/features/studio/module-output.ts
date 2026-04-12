import type {
  BlockDraft,
  LayoutBlock,
  MetricFact,
  ModuleCanvasObjectKind,
  NarrativeItem,
  ModuleTemplateId,
} from "./types";

export type ModuleExecutionOutputItem = {
  fieldId: string;
  label: string;
  objectKind: ModuleCanvasObjectKind;
  title: string;
  body: string;
  bullets: string[];
  sourceNodeId: string | null;
  usedFallback: boolean;
};

export type ModuleExecutionArtifact = {
  moduleId: ModuleTemplateId;
  usedFlow: boolean;
  summary: string;
  outputs: ModuleExecutionOutputItem[];
  warnings: string[];
};

function joinOutputBody(body: string, bullets: string[]) {
  return [body, ...bullets].filter(Boolean).join(" ").trim();
}

function toMetricFact(output: ModuleExecutionOutputItem): MetricFact {
  return {
    value: output.title || "POINT",
    label: joinOutputBody(output.body, output.bullets) || "Generated output",
  };
}

function toNarrativeItem(output: ModuleExecutionOutputItem): NarrativeItem {
  return {
    title: output.title || "Output",
    body: joinOutputBody(output.body, output.bullets) || "Generated output",
  };
}

export function adaptModuleExecutionArtifactToBlockDraft(args: {
  block: LayoutBlock;
  artifact: ModuleExecutionArtifact;
}): BlockDraft {
  const narratives = args.artifact.outputs.map(toNarrativeItem);
  const metrics = args.artifact.outputs.map(toMetricFact);
  const summarySeed =
    args.artifact.outputs.find((output) => !output.usedFallback)?.body ||
    args.artifact.outputs[0]?.body ||
    args.block.detail ||
    args.block.title ||
    "Generated module output";

  if (args.block.kind === "metrics" || args.block.kind === "bars") {
    return {
      summary: summarySeed,
      metrics,
      cards: [],
      steps: [],
    };
  }

  if (args.block.kind === "flow" || args.block.kind === "gantt") {
    return {
      summary: summarySeed,
      metrics: [],
      cards: [],
      steps: narratives,
    };
  }

  if (args.block.kind === "line") {
    return {
      summary: summarySeed,
      metrics: metrics.slice(0, 2),
      cards: narratives,
      steps: [],
    };
  }

  return {
    summary: summarySeed,
    metrics: [],
    cards: narratives,
    steps: [],
  };
}
