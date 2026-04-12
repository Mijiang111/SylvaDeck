import type { WorkbenchStudioStore, WorkbenchStudioSlice } from "./shared";
import { DEFAULT_BRIEF_STATE } from "./shared";

type BriefSlice = Pick<
  WorkbenchStudioStore,
  | "brief"
  | "setIntakeInput"
  | "setAiSettings"
  | "setBuildingStoryline"
  | "setGeneratingReport"
>;

export const createBriefSlice: WorkbenchStudioSlice<BriefSlice> = (set) => ({
  brief: DEFAULT_BRIEF_STATE,

  setIntakeInput(value) {
    set((state) => ({
      brief: {
        ...state.brief,
        intakeInput: value,
      },
    }));
  },

  setAiSettings(settings) {
    set((state) => ({
      brief: {
        ...state.brief,
        aiSettings: settings,
      },
    }));
  },

  setBuildingStoryline(value) {
    set((state) => ({
      brief: {
        ...state.brief,
        isBuildingStoryline: value,
      },
    }));
  },

  setGeneratingReport(value) {
    set((state) => ({
      brief: {
        ...state.brief,
        isGeneratingReport: value,
      },
    }));
  },
});
