import type {
  GeneratedHtmlReport,
  WorkbenchProjectSummary,
} from "@/features/studio/types";

export type HomeSection = "library" | "ai" | "author";
export type LibraryView = "recent" | "all" | "published";

export type LibraryCardRecord = {
  project: WorkbenchProjectSummary;
  htmlReport: GeneratedHtmlReport | null;
  isPublished: boolean;
};
