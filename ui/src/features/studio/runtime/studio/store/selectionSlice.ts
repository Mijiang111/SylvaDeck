import type { WorkbenchStudioStore, WorkbenchStudioSlice } from "./shared";
import { DEFAULT_SELECTION_STATE } from "./shared";

type SelectionSlice = Pick<
  WorkbenchStudioStore,
  | "selection"
  | "selectPage"
  | "selectHtmlBlock"
  | "selectVisualNode"
  | "setSelectionFacet"
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
        selectedObjectId: null,
        activeFacet: null,
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

  selectHtmlBlock(pageNumber, blockId, objectId) {
    set((state) => ({
      selection: {
        ...state.selection,
        activePageId: String(pageNumber),
        selectedObjectId: objectId ?? `page:${pageNumber}:text:${blockId}`,
        activeFacet: "text",
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

  selectVisualNode(pageNumber, nodeId, objectId) {
    set((state) => ({
      selection: {
        ...state.selection,
        activePageId: String(pageNumber),
        selectedObjectId: objectId ?? `page:${pageNumber}:visual:${nodeId}`,
        activeFacet: "shape",
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

  setSelectionFacet(facet) {
    set((state) => ({
      selection: {
        ...state.selection,
        activeFacet: facet,
      },
    }));
  },

  clearSelection(tab = "page") {
    set((state) => ({
      selection: {
        ...state.selection,
        selectedObjectId: null,
        activeFacet: null,
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
