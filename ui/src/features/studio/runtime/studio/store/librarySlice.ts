import type { WorkbenchStudioStore, WorkbenchStudioSlice } from "./shared";
import { DEFAULT_LIBRARY_STATE } from "./shared";

type LibrarySlice = Pick<
  WorkbenchStudioStore,
  "library" | "setLibraryQuery" | "setLibraryView"
>;

export const createLibrarySlice: WorkbenchStudioSlice<LibrarySlice> = (set) => ({
  library: DEFAULT_LIBRARY_STATE,

  setLibraryQuery(query) {
    set((state) => ({
      library: {
        ...state.library,
        query,
      },
    }));
  },

  setLibraryView(view) {
    set((state) => ({
      library: {
        ...state.library,
        view,
      },
    }));
  },
});
