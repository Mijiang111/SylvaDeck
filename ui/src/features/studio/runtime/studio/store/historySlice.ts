import type { WorkbenchStudioStore, WorkbenchStudioSlice } from "./shared";
import {
  DEFAULT_HISTORY_STATE,
  applyPatchPayload,
  createEmptyStudioSnapshot,
  ensureSelection,
  getWorkspaceById,
  replaceProjectInSnapshot,
} from "./shared";
import { buildProjectSummaries, buildWorkspaceSummaries } from "../utils";

type HistorySlice = Pick<
  WorkbenchStudioStore,
  "history" | "setSaveState" | "markSaved" | "undo" | "redo"
>;

export const createHistorySlice: WorkbenchStudioSlice<HistorySlice> = (set) => ({
  history: DEFAULT_HISTORY_STATE,

  setSaveState(saveState, lastError = null) {
    set((state) => ({
      history: {
        ...state.history,
        saveState,
      },
      shell: {
        ...state.shell,
        lastError: lastError ?? state.shell.lastError,
      },
    }));
  },

  markSaved(savedAt) {
    set((state) => ({
      history: {
        ...state.history,
        dirty: false,
        saveState: "saved",
        lastSavedAt: savedAt,
      },
    }));
  },

  undo() {
    set((state) => {
      const patch = state.history.undoStack[0];
      if (!patch || !state.document.project) {
        return {};
      }

      const nextProject = applyPatchPayload(state.document.project, patch.before);
      const nextSnapshot = replaceProjectInSnapshot(
        state.library.snapshot ?? createEmptyStudioSnapshot(state.document.fixedTemplateId),
        state.document.workspaceId,
        nextProject,
      );
      const workspace =
        getWorkspaceById(nextSnapshot, state.document.workspaceId) ??
        nextSnapshot.workspaces[0];

      return {
        document: {
          ...state.document,
          project: nextProject,
          workspaceName: workspace.name,
        },
        library: {
          ...state.library,
          snapshot: nextSnapshot,
          projectSummaries: buildProjectSummaries(nextSnapshot, state.document.fixedTemplateId),
          workspaceSummaries: buildWorkspaceSummaries(nextSnapshot),
        },
        selection: ensureSelection(state.selection, nextProject),
        history: {
          ...state.history,
          dirty: true,
          undoStack: state.history.undoStack.slice(1),
          redoStack: [patch, ...state.history.redoStack].slice(0, state.history.limit),
        },
        shell: {
          ...state.shell,
          statusLine: `Undid: ${patch.label}.`,
        },
      };
    });
  },

  redo() {
    set((state) => {
      const patch = state.history.redoStack[0];
      if (!patch || !state.document.project) {
        return {};
      }

      const nextProject = applyPatchPayload(state.document.project, patch.after);
      const nextSnapshot = replaceProjectInSnapshot(
        state.library.snapshot ?? createEmptyStudioSnapshot(state.document.fixedTemplateId),
        state.document.workspaceId,
        nextProject,
      );
      const workspace =
        getWorkspaceById(nextSnapshot, state.document.workspaceId) ??
        nextSnapshot.workspaces[0];

      return {
        document: {
          ...state.document,
          project: nextProject,
          workspaceName: workspace.name,
        },
        library: {
          ...state.library,
          snapshot: nextSnapshot,
          projectSummaries: buildProjectSummaries(nextSnapshot, state.document.fixedTemplateId),
          workspaceSummaries: buildWorkspaceSummaries(nextSnapshot),
        },
        selection: ensureSelection(state.selection, nextProject),
        history: {
          ...state.history,
          dirty: true,
          redoStack: state.history.redoStack.slice(1),
          undoStack: [patch, ...state.history.undoStack].slice(0, state.history.limit),
        },
        shell: {
          ...state.shell,
          statusLine: `Redid: ${patch.label}.`,
        },
      };
    });
  },
});
