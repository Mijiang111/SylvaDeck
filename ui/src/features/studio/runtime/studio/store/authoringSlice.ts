import type { WorkbenchStudioStore, WorkbenchStudioSlice } from "./shared";
import { DEFAULT_AUTHORING_STATE } from "./shared";

type AuthoringSlice = Pick<WorkbenchStudioStore, "authoring">;

export const createAuthoringSlice: WorkbenchStudioSlice<AuthoringSlice> = () => ({
  authoring: DEFAULT_AUTHORING_STATE,
});
