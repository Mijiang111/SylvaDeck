import type { StateCreator } from "zustand";
import {
  loadWorkbenchAiSettings,
  type WorkbenchAiSettings,
} from "@/features/studio/ai-settings";
import {
  createProjectBundle,
  parseWorkbenchBundle,
} from "@/features/studio/state";
import type {
  GeneratedDraftAsset,
  LayoutPage,
  PublishSnapshotFormat,
  TemplateId,
  WorkbenchProject,
  WorkbenchWorkspace,
} from "@/features/studio/types";
import type {
  StudioAuthoringState,
  StudioBootState,
  StudioBriefState,
  StudioCanvasDrawer,
  StudioCanvasScaleMode,
  StudioDocumentState,
  StudioEditView,
  StudioGenerationCommit,
  StudioHomeSection,
  StudioHistoryPatch,
  StudioHistoryScope,
  StudioHistoryState,
  StudioInspectorTab,
  StudioLibrarySnapshot,
  StudioLibraryState,
  StudioLibraryView,
  StudioPatchPayload,
  StudioSaveState,
  StudioSelectionState,
  StudioShellState,
} from "../types";
import {
  appendGenerationHistory,
  appendPublishSnapshot,
  applyPatchPayload,
  buildProjectSummaries,
  buildWorkspaceSummaries,
  createEmptyStudioSnapshot,
  createHistoryPatch,
  createStudioProject,
  createStudioWorkspace,
  deepClone,
  ensureSnapshotScaffold,
  getWorkspaceById,
  replaceProjectInSnapshot,
  replaceWorkspaceInSnapshot,
} from "../utils";

export type HydrateOptions = {
  fixedTemplateId?: TemplateId;
  workspaceId?: string;
  projectId?: string;
  mode?: StudioShellState["mode"];
  statusLine?: string;
};

export type WorkbenchStudioStore = {
  shell: StudioShellState;
  library: StudioLibraryState;
  document: StudioDocumentState;
  selection: StudioSelectionState;
  brief: StudioBriefState;
  authoring: StudioAuthoringState;
  history: StudioHistoryState;
  hydrate: (snapshot: StudioLibrarySnapshot, options?: HydrateOptions) => void;
  setBootError: (message: string) => void;
  setMode: (mode: StudioShellState["mode"]) => void;
  setHomeSection: (section: StudioHomeSection) => void;
  setSelectedLibraryProjectId: (projectId: string | null) => void;
  setSelectedChatProjectId: (projectId: string | null) => void;
  setEditView: (view: StudioEditView) => void;
  setInspectorTab: (tab: StudioInspectorTab) => void;
  setCanvasToolbarVisible: (visible: boolean) => void;
  setCanvasToolbarPinned: (pinned: boolean) => void;
  setCanvasDrawer: (drawer: StudioCanvasDrawer) => void;
  setCanvasScale: (scale: number | null, mode?: StudioCanvasScaleMode) => void;
  setCurrentCanvasPageId: (pageId: string | null) => void;
  setStatusLine: (statusLine: string) => void;
  setLibraryQuery: (query: string) => void;
  setLibraryView: (view: StudioLibraryView) => void;
  setWorkspaceName: (name: string) => void;
  setProjectName: (projectName: string) => void;
  setSourceText: (sourceText: string) => void;
  setBriefMessages: (messages: WorkbenchProject["briefMessages"]) => void;
  setIntakeInput: (value: string) => void;
  setAiSettings: (settings: WorkbenchAiSettings) => void;
  setBuildingStoryline: (value: boolean) => void;
  setGeneratingReport: (value: boolean) => void;
  selectWorkspace: (workspaceId: string) => void;
  selectProject: (workspaceId: string, projectId: string, mode?: StudioShellState["mode"]) => void;
  createWorkspace: (name?: string) => void;
  deleteCurrentWorkspace: () => void;
  createProject: (projectName?: string) => void;
  duplicateCurrentProject: () => void;
  deleteCurrentProject: () => void;
  deleteProject: (workspaceId: string, projectId: string) => void;
  replaceCurrentProject: (
    nextProject: WorkbenchProject,
    options?: {
      history?: false | { scope: StudioHistoryScope; label: string; fields: Array<keyof StudioPatchPayload>; };
      inspectorTab?: StudioInspectorTab;
      mode?: StudioShellState["mode"];
      statusLine?: string;
      resetSelection?: boolean;
    },
  ) => void;
  updatePages: (
    pages: LayoutPage[],
    options?: {
      scope?: StudioHistoryScope;
      label?: string;
      inspectorTab?: StudioInspectorTab;
      statusLine?: string;
    },
  ) => void;
  updateGeneratedDraft: (args: {
    generatedDraft: GeneratedDraftAsset | null;
    pages?: LayoutPage[];
    projectName?: string;
    workflowStage?: WorkbenchProject["workflowStage"];
    generationHistory?: WorkbenchProject["generationHistory"];
    publishSnapshots?: WorkbenchProject["publishSnapshots"];
    scope?: StudioHistoryScope;
    label: string;
    inspectorTab?: StudioInspectorTab;
    statusLine?: string;
  }) => void;
  commitGeneration: (commit: StudioGenerationCommit, statusLine?: string) => void;
  recordPublish: (format: PublishSnapshotFormat, publishedUrl?: string | null) => void;
  setWorkflowStage: (workflowStage: WorkbenchProject["workflowStage"], label?: string) => void;
  setSaveState: (saveState: StudioSaveState, lastError?: string | null) => void;
  markSaved: (savedAt: string) => void;
  selectPage: (pageId: string) => void;
  selectHtmlBlock: (pageNumber: number, blockId: string, objectId?: string | null) => void;
  selectVisualNode: (pageNumber: number, nodeId: string, objectId?: string | null) => void;
  setSelectionFacet: (facet: StudioSelectionState["activeFacet"]) => void;
  clearSelection: (tab?: StudioInspectorTab) => void;
  recordHtmlOverflow: (pageNumber: number, overflows: boolean) => void;
  undo: () => void;
  redo: () => void;
  importBundle: (raw: string) => void;
};

export type WorkbenchStudioSlice<T> = StateCreator<WorkbenchStudioStore, [], [], T>;

export const DEFAULT_SHELL_STATE: StudioShellState = {
  mode: "library",
  homeSection: "library",
  selectedLibraryProjectId: null,
  selectedChatProjectId: null,
  editView: "split",
  inspectorTab: "page",
  canvasToolbarVisible: false,
  canvasToolbarPinned: false,
  canvasDrawer: null,
  canvasScaleMode: "fit",
  canvasScale: null,
  currentCanvasPageId: null,
  statusLine: "",
  bootState: "booting",
  lastError: null,
};

export const DEFAULT_LIBRARY_STATE: StudioLibraryState = {
  snapshot: null,
  projectSummaries: [],
  workspaceSummaries: [],
  query: "",
  view: "recent",
};

export const DEFAULT_SELECTION_STATE: StudioSelectionState = {
  activePageId: "",
  selectedObjectId: null,
  activeFacet: null,
  selectedHtmlBlockId: null,
  selectedVisualNodeId: null,
  htmlPageOverflows: {},
};

export const DEFAULT_BRIEF_STATE: StudioBriefState = {
  intakeInput: "",
  aiSettings: loadWorkbenchAiSettings(),
  isBuildingStoryline: false,
  isGeneratingReport: false,
};

export const DEFAULT_AUTHORING_STATE: StudioAuthoringState = {
  workspaceScale: 1,
  workspaceOffset: { x: 0, y: 0 },
  showGrid: true,
  snapToGrid: true,
  showGuides: true,
};

export const DEFAULT_HISTORY_STATE: StudioHistoryState = {
  undoStack: [],
  redoStack: [],
  dirty: false,
  saveState: "booting",
  lastSavedAt: null,
  limit: 60,
};

export const DEFAULT_DOCUMENT_STATE: StudioDocumentState = {
  workspaceId: "",
  workspaceName: "",
  project: null,
};

export function buildProjectPatchPayload(
  project: WorkbenchProject,
  fields: Array<keyof StudioPatchPayload>,
): StudioPatchPayload {
  const payload: StudioPatchPayload = {};

  for (const field of fields) {
    if (field === "starterPackId") {
      payload.starterPackId = project.starterPackId;
    } else if (field === "starterThemeId") {
      payload.starterThemeId = project.starterThemeId;
    } else if (field === "starterBindings") {
      payload.starterBindings = deepClone(project.starterBindings);
    } else if (field === "starterApplicationMode") {
      payload.starterApplicationMode = project.starterApplicationMode;
    } else if (field === "htmlOutputMode") {
      payload.htmlOutputMode = project.htmlOutputMode;
    } else if (field === "projectName") {
      payload.projectName = project.projectName;
    } else if (field === "sourceText") {
      payload.sourceText = project.sourceText;
    } else if (field === "generationMode") {
      payload.generationMode = project.generationMode;
    } else if (field === "moduleUsageMode") {
      payload.moduleUsageMode = project.moduleUsageMode;
    } else if (field === "requestedPageCount") {
      payload.requestedPageCount = project.requestedPageCount;
    } else if (field === "briefMessages") {
      payload.briefMessages = deepClone(project.briefMessages);
    } else if (field === "pages") {
      payload.pages = deepClone(project.pages);
    } else if (field === "generatedDraft") {
      payload.generatedDraft = deepClone(project.generatedDraft);
    } else if (field === "workflowStage") {
      payload.workflowStage = project.workflowStage;
    } else if (field === "generationHistory") {
      payload.generationHistory = deepClone(project.generationHistory);
    } else if (field === "publishSnapshots") {
      payload.publishSnapshots = deepClone(project.publishSnapshots);
    }
  }

  return payload;
}

export function ensureSelection(
  selection: StudioSelectionState,
  project: WorkbenchProject | null,
) {
  if (!project) {
    return DEFAULT_SELECTION_STATE;
  }

  return {
    ...selection,
    activePageId:
      project.pages.find((page) => page.id === selection.activePageId)?.id ??
      project.pages[0]?.id ??
      "",
  };
}

export function createImportedProject(project: WorkbenchProject) {
  const imported = createStudioProject(project.templateId, project.projectName);
  return createProjectBundle({
    id: imported.id,
    templateId: project.templateId,
    starterPackId: project.starterPackId,
    starterThemeId: project.starterThemeId,
    starterBindings: project.starterBindings,
    starterApplicationMode: project.starterApplicationMode,
    htmlOutputMode: project.htmlOutputMode,
    projectName: project.projectName,
    sourceText: project.sourceText,
    briefMessages: project.briefMessages,
    pages: project.pages,
    generatedDraft: project.generatedDraft,
    generationHistory: project.generationHistory,
    publishSnapshots: project.publishSnapshots,
    workflowStage: project.workflowStage,
    updatedAt: project.updatedAt,
    exportedAt: project.exportedAt,
  });
}

export function createImportedWorkspace(bundle: WorkbenchWorkspace) {
  const importedWorkspace = createStudioWorkspace(
    bundle.name,
    bundle.projects[0]?.templateId,
  );
  const importedProjects = bundle.projects.map(createImportedProject);
  const activeSourceProject =
    bundle.projects.find((project) => project.id === bundle.activeProjectId) ?? bundle.projects[0];
  const activeImportedProject =
    importedProjects.find(
      (_project, index) => bundle.projects[index]?.id === activeSourceProject?.id,
    ) ?? importedProjects[0];

  return {
    ...importedWorkspace,
    name: bundle.name,
    projects: importedProjects,
    activeProjectId: activeImportedProject.id,
    updatedAt: new Date().toISOString(),
  } satisfies WorkbenchWorkspace;
}

export function withSnapshotChrome(
  snapshot: StudioLibrarySnapshot,
  fixedTemplateId?: TemplateId,
): Pick<WorkbenchStudioStore, "library">["library"] {
  return {
    snapshot,
    projectSummaries: buildProjectSummaries(snapshot, fixedTemplateId),
    workspaceSummaries: buildWorkspaceSummaries(snapshot),
    query: DEFAULT_LIBRARY_STATE.query,
    view: DEFAULT_LIBRARY_STATE.view,
  };
}

export function replaceProjectState(args: {
  state: WorkbenchStudioStore;
  nextProject: WorkbenchProject;
  nextSnapshot: StudioLibrarySnapshot;
  nextWorkspaceId: string;
  nextWorkspaceName: string;
  pushHistory?: StudioHistoryPatch | null;
  inspectorTab?: StudioInspectorTab;
  mode?: StudioShellState["mode"];
  statusLine?: string;
  resetSelection?: boolean;
}): Partial<WorkbenchStudioStore> {
  const baseSelection = args.resetSelection ? DEFAULT_SELECTION_STATE : args.state.selection;
  const nextSelection = ensureSelection(baseSelection, args.nextProject);

  return {
    document: {
      workspaceId: args.nextWorkspaceId,
      workspaceName: args.nextWorkspaceName,
      project: args.nextProject,
      fixedTemplateId: args.state.document.fixedTemplateId,
    },
    library: {
      ...args.state.library,
      snapshot: args.nextSnapshot,
      projectSummaries: buildProjectSummaries(
        args.nextSnapshot,
        args.state.document.fixedTemplateId,
      ),
      workspaceSummaries: buildWorkspaceSummaries(args.nextSnapshot),
    },
    selection: nextSelection,
    history: {
      ...args.state.history,
      dirty: true,
      undoStack: args.pushHistory
        ? [args.pushHistory, ...args.state.history.undoStack].slice(0, args.state.history.limit)
        : args.state.history.undoStack,
      redoStack: args.pushHistory ? [] : args.state.history.redoStack,
      saveState:
        args.state.history.saveState === "booting" ? "ready" : args.state.history.saveState,
    },
    shell: {
      ...args.state.shell,
      mode: args.mode ?? args.state.shell.mode,
      selectedLibraryProjectId: args.nextProject.generatedDraft?.htmlReport
        ? args.nextProject.id
        : args.state.shell.selectedLibraryProjectId,
      selectedChatProjectId: args.nextProject.briefMessages.length
        ? args.nextProject.id
        : args.state.shell.selectedChatProjectId,
      inspectorTab: args.inspectorTab ?? args.state.shell.inspectorTab,
      currentCanvasPageId: nextSelection.activePageId,
      statusLine: args.statusLine ?? args.state.shell.statusLine,
      bootState: "ready" as StudioBootState,
      lastError: null,
    },
  };
}

export function mutateCurrentProject(args: {
  state: WorkbenchStudioStore;
  nextProject: WorkbenchProject;
  scope?: StudioHistoryScope;
  label?: string;
  fields?: Array<keyof StudioPatchPayload>;
  inspectorTab?: StudioInspectorTab;
  mode?: StudioShellState["mode"];
  statusLine?: string;
  resetSelection?: boolean;
  historyEnabled?: boolean;
}) {
  if (!args.state.document.project || !args.state.library.snapshot) {
    return {};
  }

  const nextSnapshot = replaceProjectInSnapshot(
    args.state.library.snapshot,
    args.state.document.workspaceId,
    args.nextProject,
  );
  const workspace =
    getWorkspaceById(nextSnapshot, args.state.document.workspaceId) ??
    nextSnapshot.workspaces[0];

  const patch =
    args.historyEnabled === false || !args.scope || !args.label || !args.fields?.length
      ? null
      : createHistoryPatch({
          scope: args.scope,
          label: args.label,
          before: buildProjectPatchPayload(args.state.document.project, args.fields),
          after: buildProjectPatchPayload(args.nextProject, args.fields),
        });

  return replaceProjectState({
    state: args.state,
    nextProject: args.nextProject,
    nextSnapshot,
    nextWorkspaceId: workspace.id,
    nextWorkspaceName: workspace.name,
    pushHistory: patch,
    inspectorTab: args.inspectorTab,
    mode: args.mode,
    statusLine: args.statusLine,
    resetSelection: args.resetSelection,
  });
}

export {
  appendGenerationHistory,
  appendPublishSnapshot,
  applyPatchPayload,
  createEmptyStudioSnapshot,
  createStudioProject,
  createStudioWorkspace,
  deepClone,
  ensureSnapshotScaffold,
  getWorkspaceById,
  parseWorkbenchBundle,
  replaceProjectInSnapshot,
  replaceWorkspaceInSnapshot,
};
