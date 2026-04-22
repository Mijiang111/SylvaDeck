import type { WorkbenchStudioStore, WorkbenchStudioSlice } from "./shared";
import { DEFAULT_SELECTION_STATE } from "./shared";

type SelectionSlice = Pick<
  WorkbenchStudioStore,
  | "selection"
  | "selectPage"
  | "selectHtmlBlock"
  | "selectVisualNode"
  | "clearSelection"
  | "recordHtmlOverflow"
>;

export const createSelectionSlice: WorkbenchStudioSlice<SelectionSlice> = (set) => ({
  selection: DEFAULT_SELECTION_STATE,

  selectPage(pageId) {
    set((state) => ({
      selection: {
        ...state.selection,
        activePageId: pageId,
        selectedHtmlBlockId: null,
        selectedVisualNodeId: null,
      },
      shell: {
        ...state.shell,
        inspectorTab: "page",
        canvasDrawer: "page",
        currentCanvasPageId: pageId,
      },
    }));
  },

  selectHtmlBlock(pageNumber, blockId) {
    set((state) => ({
      selection: {
        ...state.selection,
        activePageId: String(pageNumber),
        selectedHtmlBlockId: blockId,
        selectedVisualNodeId: null,
      },
      shell: {
        ...state.shell,
        inspectorTab: "text",
        canvasDrawer: "text",
        canvasToolbarVisible: true,
        currentCanvasPageId: String(pageNumber),
      },
    }));
  },

  selectVisualNode(pageNumber, nodeId) {
    set((state) => ({
      selection: {
        ...state.selection,
        activePageId: String(pageNumber),
        selectedHtmlBlockId: null,
        selectedVisualNodeId: nodeId,
      },
      shell: {
        ...state.shell,
        inspectorTab: "visual",
        canvasDrawer: "visual",
        canvasToolbarVisible: true,
        currentCanvasPageId: String(pageNumber),
      },
    }));
  },

  clearSelection(tab = "page") {
    set((state) => ({
      selection: {
        ...state.selection,
        selectedHtmlBlockId: null,
        selectedVisualNodeId: null,
      },
      shell: {
        ...state.shell,
        inspectorTab: tab,
        canvasDrawer: tab,
      },
    }));
  },

  recordHtmlOverflow(pageNumber, overflows) {
    set((state) => ({
      selection: {
        ...state.selection,
        htmlPageOverflows:
          state.selection.htmlPageOverflows[pageNumber] === overflows
            ? state.selection.htmlPageOverflows
            : {
                ...state.selection.htmlPageOverflows,
                [pageNumber]: overflows,
              },
      },
    }));
  },
});
