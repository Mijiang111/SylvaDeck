import type { ConversationMessage, ModuleRegistryCategory, TemplateId } from "@/features/studio/types";
import { MODULE_LIBRARY_COLLECTIONS } from "@/features/studio/config";

export type Message = ConversationMessage;

export type BriefSummary = {
  topic: string;
  audience: string;
  objective: string;
  evidence: string;
  format: string;
  assumptions: string[];
  missing: string[];
  ready: boolean;
  confirmed: boolean;
};

export type StreamingReportPage = {
  pageNumber: number;
  title: string;
  srcDoc: string | null;
  status: "pending" | "ready" | "error";
};

export type PptWorkbenchRuntimeProps = {
  fixedTemplateId?: TemplateId;
};

export type PptWorkbenchPublishedPageProps = PptWorkbenchRuntimeProps & {
  projectId: string;
};

export type SidebarMode = "projects" | "history" | "source" | "share";
export type ModuleLibraryMode = "closed" | "add" | "replace";
export type ModuleLibraryCollection = (typeof MODULE_LIBRARY_COLLECTIONS)[number]["id"];
export type ModuleLibraryCategoryFilter = "all" | ModuleRegistryCategory;
