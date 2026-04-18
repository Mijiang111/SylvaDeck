import type {
  BlockKind,
  BlockTone,
  ModuleExampleRef,
  ModuleRegistryCategory,
  ModuleRegistryEntry,
  ModuleSkillPreset,
  ModuleTemplateId,
  SkillDefinition,
  TemplateId,
} from "../types";

export const GRID_COLUMNS = 12;
export const GRID_ROWS = 12;
export const GRID_GAP = 12;

export const STORAGE_KEY = "studio-shell-v1";
export const LEGACY_STORAGE_KEY = "studio-template-shell-v1";
export const SOURCE_STORAGE_KEY = "studio-source-v1";
export const PROJECT_NAME_STORAGE_KEY = "studio-project-name-v1";
export const TEMPLATE_STORAGE_KEY = "studio-template-v1";
export const GENERATED_DRAFT_STORAGE_KEY = "studio-generated-draft-v1";
export const PROJECT_LIBRARY_STORAGE_KEY = "studio-project-library-v1";
export const MODULE_REGISTRY_STORAGE_KEY = "studio-module-registry-v1";
export const MODULE_REGISTRY_DELETED_STORAGE_KEY = "studio-module-registry-deleted-v1";
export const SKILL_REGISTRY_STORAGE_KEY = "studio-skill-registry-v1";
export const MODULE_SKILL_PRESET_STORAGE_KEY = "studio-module-skill-preset-registry-v1";
export const MODULE_ASSET_STORAGE_KEY = "studio-module-assets-v1";
export const MODULE_AUTHORING_HANDOFF_STORAGE_KEY = "studio-module-authoring-handoff-v1";
export const AI_SETTINGS_STORAGE_KEY = "studio-ai-settings-v1";
export const WORKSPACE_LIBRARY_VERSION = 4;
export const PROJECT_BUNDLE_VERSION = 6;
export const WORKSPACE_BUNDLE_VERSION = 1;
export const GENERATED_DRAFT_VERSION = 4 as const;
export const PROJECT_SNAPSHOT_VERSION = 1 as const;
export const GENERATION_HISTORY_VERSION = 1 as const;
export const PUBLISH_SNAPSHOT_VERSION = 1 as const;
export const DEFAULT_TEMPLATE_ID: TemplateId = "blank";

export const MODULE_REGISTRY_CATEGORIES: Array<{
  id: ModuleRegistryCategory;
  label: string;
  description: string;
}> = [
  {
    id: "evidence",
    label: "Evidence",
    description: "Quantitative proof, headline figures, and trend views.",
  },
  {
    id: "comparison",
    label: "Compare",
    description: "Tradeoff views, rankings, and structured comparisons.",
  },
  {
    id: "logic",
    label: "Logic",
    description: "Causal models, operating logic, and narrative stages.",
  },
  {
    id: "roadmap",
    label: "Roadmap",
    description: "Execution timing, milestones, and sequencing.",
  },
];

export const MODULE_LIBRARY_COLLECTIONS = [
  {
    id: "all",
    label: "All modules",
    description: "Everything in the shared library, regardless of family or scope.",
  },
  {
    id: "featured",
    label: "Featured",
    description: "Recommended starting points for common report pages.",
  },
  {
    id: "frameworks",
    label: "Frameworks",
    description: "Strategic thinking tools such as SWOT, Five Forces, and curve-based models.",
  },
  {
    id: "core",
    label: "Core",
    description: "Default building blocks that ship with the workbench.",
  },
  {
    id: "community",
    label: "Community",
    description: "Contributed templates that extend the module library.",
  },
  {
    id: "private",
    label: "Private",
    description: "Team- or workspace-specific module templates.",
  },
] as const;

export const SKILL_LIBRARY_COLLECTIONS = [
  {
    id: "all",
    label: "All skills",
    description: "Everything in the shared skill registry.",
  },
  {
    id: "framework",
    label: "Frameworks",
    description: "Reasoning skills for business and analytical frameworks.",
  },
  {
    id: "domain",
    label: "Domains",
    description: "Domain-specific skills that adapt modules to an industry or context.",
  },
  {
    id: "output",
    label: "Output styles",
    description: "Presentation and communication style skills for slide-ready output.",
  },
  {
    id: "core",
    label: "Core",
    description: "Default skills that ship with the workbench.",
  },
  {
    id: "community",
    label: "Community",
    description: "Shared skills contributed by module and skill authors.",
  },
  {
    id: "private",
    label: "Private",
    description: "Workspace-specific private skills and presets.",
  },
] as const;

export const BLOCK_KIND_PRESETS: Record<
  BlockKind,
  {
    label: string;
    tone: BlockTone;
    minW: number;
    minH: number;
    defaultW: number;
    defaultH: number;
    defaultScale: number;
    suffix: string;
    detail: string;
  }
> = {
  metrics: {
    label: "Metrics",
    tone: "teal",
    minW: 3,
    minH: 4,
    defaultW: 6,
    defaultH: 4,
    defaultScale: 0.96,
    suffix: "metrics",
    detail: "Quantitative evidence and reported numbers.",
  },
  bars: {
    label: "Bars",
    tone: "navy",
    minW: 5,
    minH: 4,
    defaultW: 6,
    defaultH: 4,
    defaultScale: 0.92,
    suffix: "bars",
    detail: "Comparative ranking or distribution view.",
  },
  line: {
    label: "Line",
    tone: "navy",
    minW: 6,
    minH: 4,
    defaultW: 8,
    defaultH: 5,
    defaultScale: 0.9,
    suffix: "trend",
    detail: "Trend and milestone view over time.",
  },
  matrix: {
    label: "Matrix",
    tone: "amber",
    minW: 6,
    minH: 4,
    defaultW: 6,
    defaultH: 5,
    defaultScale: 0.96,
    suffix: "matrix",
    detail: "Structured comparison across categories.",
  },
  flow: {
    label: "Flow",
    tone: "teal",
    minW: 6,
    minH: 4,
    defaultW: 6,
    defaultH: 5,
    defaultScale: 0.95,
    suffix: "logic",
    detail: "Sequential thought model or process path.",
  },
  gantt: {
    label: "Gantt",
    tone: "navy",
    minW: 8,
    minH: 5,
    defaultW: 12,
    defaultH: 7,
    defaultScale: 0.88,
    suffix: "gantt",
    detail: "Roadmap and execution timeline.",
  },
  phases: {
    label: "Phases",
    tone: "amber",
    minW: 6,
    minH: 3,
    defaultW: 12,
    defaultH: 4,
    defaultScale: 0.95,
    suffix: "phases",
    detail: "Phase summaries and takeaways.",
  },
};

export const BLOCK_KIND_ALIASES: Record<BlockKind, string[]> = {
  metrics: ["metrics", "metric", "kpi", "numbers", "指标"],
  bars: ["bars", "bar", "bar chart", "棒图", "对比图"],
  line: ["line", "trend", "line chart", "折线", "趋势"],
  matrix: ["matrix", "grid", "矩阵"],
  flow: ["flow", "logic", "process", "流程", "逻辑"],
  gantt: ["gantt", "roadmap", "timeline", "甘特", "路线图"],
  phases: ["phases", "phase", "cards", "summary", "阶段"],
};

export const SYSTEM_CREATED_AT = "2026-03-14T00:00:00.000Z";
export const SYSTEM_OWNER_ID = "system";

export const STRATEGY_MODULE_EXAMPLES: ModuleExampleRef[] = [
  {
    id: "example.market-entry",
    label: "Market entry",
    description: "Use the framework to explain an entry decision or strategic position.",
  },
  {
    id: "example.policy-brief",
    label: "Policy brief",
    description: "Use the framework to structure tradeoffs and external constraints.",
  },
];
