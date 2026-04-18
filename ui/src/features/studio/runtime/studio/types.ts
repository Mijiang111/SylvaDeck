import type {
  GeneratedDraftAsset,
  HtmlOutputMode,
  GenerationHistoryEntry,
  LayoutPage,
  PublishSnapshot,
  TemplateId,
  WorkflowStage,
  WorkbenchProject,
  WorkbenchProjectSummary,
  WorkbenchWorkspace,
  WorkbenchWorkspaceSummary,
} from "@/features/studio/types";
import type { WorkbenchAiSettings } from "@/features/studio/ai-settings";

export type StudioMode = "library" | "brief" | "editor" | "author";
export type StudioHomeSection = "library" | "ai" | "author";
export type StudioEditView = "split" | "canvas";
export type StudioInspectorTab = "page" | "text" | "visual" | "layout" | "history" | "export";
export type StudioCanvasDrawer =
  | "pages"
  | "page"
  | "text"
  | "visual"
  | "layout"
  | "history"
  | "export"
  | null;
export type StudioCanvasScaleMode = "fit" | "manual";
export type StudioSaveState = "booting" | "ready" | "saving" | "saved" | "error";
export type StudioBootState = "booting" | "ready" | "error";
export type StudioHistoryScope =
  | "brief"
  | "pages"
  | "text"
  | "visual"
  | "layout"
  | "workflow"
  | "generation";
export type StudioLibraryView = "recent" | "all" | "published";

export type StudioLibrarySnapshot = {
  version: number;
  activeWorkspaceId: string;
  workspaces: WorkbenchWorkspace[];
};

export type StoredWorkspaceRecord = Omit<WorkbenchWorkspace, "projects"> & {
  projectIds: string[];
};

export type StoredProjectRecord = WorkbenchProject & {
  workspaceId: string;
};

export type StudioSession = {
  activeWorkspaceId: string;
  activeProjectId: string;
  migratedAt: string | null;
};

export type StudioAssetRef = {
  id: string;
  kind: "image" | "bundle" | "html-report" | "other";
  mimeType: string;
  createdAt: string;
  size: number;
  workspaceId?: string;
  projectId?: string;
};

export type StudioAssetRecord = StudioAssetRef & {
  blob: Blob;
};

export type StudioPatchPayload = Partial<
  Pick<
    WorkbenchProject,
    | "starterPackId"
    | "starterThemeId"
    | "starterBindings"
    | "starterApplicationMode"
    | "htmlOutputMode"
    | "projectName"
    | "sourceText"
    | "generationMode"
    | "moduleUsageMode"
    | "requestedPageCount"
    | "briefMessages"
    | "pages"
    | "generatedDraft"
    | "workflowStage"
    | "generationHistory"
    | "publishSnapshots"
  >
>;

export type StudioHistoryPatch = {
  id: string;
  scope: StudioHistoryScope;
  label: string;
  at: string;
  before: StudioPatchPayload;
  after: StudioPatchPayload;
};

export type StudioDocumentState = {
  workspaceId: string;
  workspaceName: string;
  project: WorkbenchProject | null;
  fixedTemplateId?: TemplateId;
};

export type StudioLibraryState = {
  snapshot: StudioLibrarySnapshot | null;
  projectSummaries: WorkbenchProjectSummary[];
  workspaceSummaries: WorkbenchWorkspaceSummary[];
  query: string;
  view: StudioLibraryView;
};

export type StudioShellState = {
  mode: StudioMode;
  homeSection: StudioHomeSection;
  selectedLibraryProjectId: string | null;
  selectedChatProjectId: string | null;
  editView: StudioEditView;
  inspectorTab: StudioInspectorTab;
  canvasToolbarVisible: boolean;
  canvasToolbarPinned: boolean;
  canvasDrawer: StudioCanvasDrawer;
  canvasScaleMode: StudioCanvasScaleMode;
  canvasScale: number | null;
  currentCanvasPageId: string | null;
  statusLine: string;
  bootState: StudioBootState;
  lastError: string | null;
};

export type StudioSelectionState = {
  activePageId: string;
  selectedHtmlBlockId: string | null;
  selectedVisualNodeId: string | null;
  selectedLayoutZoneId: string | null;
  htmlPageOverflows: Record<number, boolean>;
};

export type StudioBriefState = {
  intakeInput: string;
  aiSettings: WorkbenchAiSettings;
  isBuildingStoryline: boolean;
  isGeneratingReport: boolean;
};

export type StudioAuthoringState = {
  workspaceScale: number;
  workspaceOffset: { x: number; y: number };
  showGrid: boolean;
  snapToGrid: boolean;
  showGuides: boolean;
};

export type StudioHistoryState = {
  undoStack: StudioHistoryPatch[];
  redoStack: StudioHistoryPatch[];
  dirty: boolean;
  saveState: StudioSaveState;
  lastSavedAt: string | null;
  limit: number;
};

export type StudioGenerationCommit = {
  projectName: string;
  sourceText: string;
  generationMode: WorkbenchProject["generationMode"];
  moduleUsageMode: WorkbenchProject["moduleUsageMode"];
  htmlOutputMode: HtmlOutputMode;
  requestedPageCount: WorkbenchProject["requestedPageCount"];
  pages: LayoutPage[];
  generatedDraft: GeneratedDraftAsset;
  workflowStage: WorkflowStage;
};

export type StudioPublishCommit = {
  format: PublishSnapshot["format"];
  publishedUrl?: string | null;
};
