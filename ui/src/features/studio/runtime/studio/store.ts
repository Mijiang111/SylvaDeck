import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { createAuthoringSlice } from "./store/authoringSlice";
import { createBriefSlice } from "./store/briefSlice";
import { createHistorySlice } from "./store/historySlice";
import { createImportExportSlice } from "./store/importExportSlice";
import { createLibrarySlice } from "./store/librarySlice";
import { createProjectSlice } from "./store/projectSlice";
import { createSelectionSlice } from "./store/selectionSlice";
import { createShellSlice } from "./store/shellSlice";
import type { HydrateOptions, WorkbenchStudioStore } from "./store/shared";

export const useWorkbenchStudioStore = create<WorkbenchStudioStore>()((...args) => ({
  ...createShellSlice(...args),
  ...createLibrarySlice(...args),
  ...createBriefSlice(...args),
  ...createAuthoringSlice(...args),
  ...createProjectSlice(...args),
  ...createSelectionSlice(...args),
  ...createHistorySlice(...args),
  ...createImportExportSlice(...args),
}));

export function useCurrentStudioProject() {
  return useWorkbenchStudioStore((state) => state.document.project);
}

export function useCurrentStudioWorkspace() {
  return useWorkbenchStudioStore((state) => ({
    workspaceId: state.document.workspaceId,
    workspaceName: state.document.workspaceName,
  }));
}

export function useStudioShellState() {
  return useWorkbenchStudioStore((state) => state.shell);
}

export function useStudioProjectState() {
  return useWorkbenchStudioStore((state) => state.document);
}

export function useStudioSelectionState() {
  return useWorkbenchStudioStore((state) => state.selection);
}

export function useStudioHistoryState() {
  return useWorkbenchStudioStore((state) => state.history);
}

export function useStudioBriefState() {
  return useWorkbenchStudioStore((state) => state.brief);
}

export function useStudioLibraryState() {
  return useWorkbenchStudioStore((state) => state.library);
}

export function useStudioProjectActions() {
  return useWorkbenchStudioStore(
    useShallow((state) => ({
      hydrate: state.hydrate,
      setBootError: state.setBootError,
      setMode: state.setMode,
      setHomeSection: state.setHomeSection,
      setSelectedLibraryProjectId: state.setSelectedLibraryProjectId,
      setSelectedChatProjectId: state.setSelectedChatProjectId,
      setEditView: state.setEditView,
      setInspectorTab: state.setInspectorTab,
      setCanvasToolbarVisible: state.setCanvasToolbarVisible,
      setCanvasToolbarPinned: state.setCanvasToolbarPinned,
      setCanvasDrawer: state.setCanvasDrawer,
      setCanvasScale: state.setCanvasScale,
      setCurrentCanvasPageId: state.setCurrentCanvasPageId,
      setStatusLine: state.setStatusLine,
      setWorkspaceName: state.setWorkspaceName,
      setProjectName: state.setProjectName,
      setSourceText: state.setSourceText,
      setBriefMessages: state.setBriefMessages,
      setIntakeInput: state.setIntakeInput,
      setAiSettings: state.setAiSettings,
      setBuildingStoryline: state.setBuildingStoryline,
      setGeneratingReport: state.setGeneratingReport,
      selectWorkspace: state.selectWorkspace,
      selectProject: state.selectProject,
      createWorkspace: state.createWorkspace,
      deleteCurrentWorkspace: state.deleteCurrentWorkspace,
      createProject: state.createProject,
      duplicateCurrentProject: state.duplicateCurrentProject,
      deleteCurrentProject: state.deleteCurrentProject,
      deleteProject: state.deleteProject,
      replaceCurrentProject: state.replaceCurrentProject,
      updatePages: state.updatePages,
      updateGeneratedDraft: state.updateGeneratedDraft,
      commitGeneration: state.commitGeneration,
      recordPublish: state.recordPublish,
      setWorkflowStage: state.setWorkflowStage,
      setSaveState: state.setSaveState,
      markSaved: state.markSaved,
      selectPage: state.selectPage,
      selectHtmlBlock: state.selectHtmlBlock,
      selectVisualNode: state.selectVisualNode,
      selectLayoutZone: state.selectLayoutZone,
      clearSelection: state.clearSelection,
      recordHtmlOverflow: state.recordHtmlOverflow,
      undo: state.undo,
      redo: state.redo,
      importBundle: state.importBundle,
    })),
  );
}

export type { HydrateOptions, WorkbenchStudioStore } from "./store/shared";
