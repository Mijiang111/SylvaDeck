import type {
  BlockDraft,
  LayoutPage,
  TemplateModuleMapping,
  WorkbenchTemplate,
} from "../types";

export const defaultProjectName = "New report";

export const defaultSourceText = "";

export const defaultPages: LayoutPage[] = [];

export const starterPageSummaries: Record<string, string> = {};

export const starterBlockDrafts: Record<string, BlockDraft> = {};

export const blockAliases: Record<string, string[]> = {
  report: ["report", "deck", "presentation", "storyline"],
  evidence: ["proof", "signal", "metric", "data"],
  comparison: ["matrix", "tradeoff", "comparison", "priority"],
  process: ["flow", "logic", "sequence", "journey"],
  roadmap: ["timeline", "roadmap", "plan", "phase"],
};

const blankTemplateModuleMapping: TemplateModuleMapping = {
  metrics: {
    planKey: "metrics",
    role: "quantitative proof",
    fallbackPrefix: "Proof",
  },
  bars: {
    planKey: "ranking",
    role: "comparative ranking",
    fallbackPrefix: "Rank",
  },
  line: {
    planKey: "timeline",
    role: "trend or milestone path",
    fallbackPrefix: "Milestone",
  },
  matrix: {
    planKey: "cards",
    role: "structured comparison",
    fallbackPrefix: "Lens",
  },
  flow: {
    planKey: "flowSteps",
    role: "operating logic",
    fallbackPrefix: "Step",
  },
  gantt: {
    planKey: "roadmap",
    role: "execution sequence",
    fallbackPrefix: "Track",
  },
  phases: {
    planKey: "phases",
    role: "phase takeaway",
    fallbackPrefix: "Phase",
  },
};

export const blankTemplate: WorkbenchTemplate = {
  id: "blank",
  meta: {
    id: "blank",
    name: "Blank report",
    description: "A neutral fixed-canvas workbench with no preloaded industry story.",
    industry: "General",
  },
  defaultProjectName,
  defaultSourceText,
  defaultPages,
  starterPageSummaries,
  starterBlockDrafts,
  blockAliases,
  moduleMapping: blankTemplateModuleMapping,
};
