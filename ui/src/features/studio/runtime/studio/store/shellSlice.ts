import type { WorkbenchStudioStore, WorkbenchStudioSlice } from "./shared";
import { DEFAULT_SHELL_STATE } from "./shared";

type ShellSlice = Pick<
  WorkbenchStudioStore,
  | "shell"
  | "setMode"
  | "setHomeSection"
  | "setSelectedLibraryProjectId"
  | "setSelectedChatProjectId"
  | "setEditView"
  | "setInspectorTab"
  | "setCanvasToolbarVisible"
  | "setCanvasToolbarPinned"
  | "setCanvasDrawer"
  | "setCanvasScale"
  | "setCurrentCanvasPageId"
  | "setStatusLine"
>;

export const createShellSlice: WorkbenchStudioSlice<ShellSlice> = (set) => ({
  shell: DEFAULT_SHELL_STATE,

  setMode(mode) {
    set((state) => ({
      shell: {
        ...state.shell,
        mode,
        canvasDrawer: null,
      },
    }));
  },

  setHomeSection(homeSection) {
    set((state) => ({
      shell: {
        ...state.shell,
        homeSection,
      },
    }));
  },

  setSelectedLibraryProjectId(projectId) {
    set((state) => ({
      shell: {
        ...state.shell,
        selectedLibraryProjectId: projectId,
      },
    }));
  },

  setSelectedChatProjectId(projectId) {
    set((state) => ({
      shell: {
        ...state.shell,
        selectedChatProjectId: projectId,
      },
    }));
  },

  setEditView(editView) {
    set((state) => ({
      shell: {
        ...state.shell,
        editView,
        canvasToolbarVisible: editView === "canvas" ? state.shell.canvasToolbarVisible : false,
        canvasToolbarPinned: editView === "canvas" ? state.shell.canvasToolbarPinned : false,
        canvasDrawer: editView === "canvas" ? state.shell.canvasDrawer : null,
      },
    }));
  },

  setInspectorTab(tab) {
    set((state) => ({
      shell: {
        ...state.shell,
        inspectorTab: tab,
      },
    }));
  },

  setCanvasToolbarVisible(visible) {
    set((state) => ({
      shell: {
        ...state.shell,
        canvasToolbarVisible: visible,
      },
    }));
  },

  setCanvasToolbarPinned(pinned) {
    set((state) => ({
      shell: {
        ...state.shell,
        canvasToolbarPinned: pinned,
        canvasToolbarVisible: pinned ? true : state.shell.canvasToolbarVisible,
      },
    }));
  },

  setCanvasDrawer(drawer) {
    set((state) => ({
      shell: {
        ...state.shell,
        canvasDrawer: drawer,
        canvasToolbarVisible: drawer ? true : state.shell.canvasToolbarVisible,
      },
    }));
  },

  setCanvasScale(scale, mode = scale === null ? "fit" : "manual") {
    set((state) => ({
      shell: {
        ...state.shell,
        canvasScale: scale,
        canvasScaleMode: mode,
      },
    }));
  },

  setCurrentCanvasPageId(pageId) {
    set((state) => ({
      shell: {
        ...state.shell,
        currentCanvasPageId: pageId,
      },
    }));
  },

  setStatusLine(statusLine) {
    set((state) => ({
      shell: {
        ...state.shell,
        statusLine,
      },
    }));
  },
});
