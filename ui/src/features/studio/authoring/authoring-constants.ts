import type {
  ModuleChartKind,
  ModuleRegistryEntry,
  ModuleRegistryScope,
  ModuleTemplateFamily,
} from "@/features/studio/types";

export const MODULE_LIBRARY_RECENTS_STORAGE_KEY =
  "ppt-workbench-studio:module-library-recents";
export const MAX_RECENT_MODULES = 8;

export const MODULE_SCOPE_SHORT_LABEL: Record<ModuleRegistryScope, string> = {
  core: "Core",
  community: "Comm",
  private: "Priv",
};

export const MODULE_FAMILY_SHORT_LABEL: Record<ModuleTemplateFamily, string> = {
  primitive: "Prim",
  framework: "Frame",
  "story-pattern": "Story",
};

export const MODULE_CATEGORY_SHORT_LABEL: Record<
  ModuleRegistryEntry["category"],
  string
> = {
  evidence: "Proof",
  comparison: "Comp",
  logic: "Logic",
  roadmap: "Road",
};

export const CHART_KIND_LABEL: Record<ModuleChartKind, string> = {
  bar: "Bar",
  stacked: "Stacked",
  line: "Line",
  waterfall: "Waterfall",
};

export const WORKBENCH_DARK_BACKGROUND =
  "radial-gradient(circle at 18% 84%, rgba(0,242,255,0.12) 0%, rgba(0,242,255,0) 28%), radial-gradient(circle at 76% 14%, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 32%), radial-gradient(circle at 78% 74%, rgba(0,242,255,0.08) 0%, rgba(0,242,255,0) 24%), linear-gradient(180deg, #050505 0%, #020202 100%)";
