import { api } from "@/api/client";
import type {
  HtmlOutputMode,
  WorkbenchGenerationMode,
  WorkbenchModuleUsageMode,
} from "./types";

export type StudioBridgeLaunchMode = "inject-and-generate" | "inject-only";

export type CreateStudioBridgeLaunchRequest = {
  prompt: string;
  projectName?: string | null;
  generationMode?: WorkbenchGenerationMode;
  moduleUsageMode?: WorkbenchModuleUsageMode;
  htmlOutputMode?: HtmlOutputMode;
  requestedPageCount?: number | null;
  mode?: StudioBridgeLaunchMode;
};

export type CreateStudioBridgeLaunchResponse = {
  launchId: string;
  openUrl: string;
  expiresAt: string;
};

export type ConsumeStudioBridgeLaunchResponse = {
  launchId: string;
  prompt: string;
  projectName?: string | null;
  generationMode?: WorkbenchGenerationMode;
  moduleUsageMode?: WorkbenchModuleUsageMode;
  htmlOutputMode?: HtmlOutputMode;
  requestedPageCount?: number | null;
  mode?: StudioBridgeLaunchMode;
  expiresAt: string;
};

export function createStudioBridgeLaunch(
  payload: CreateStudioBridgeLaunchRequest,
) {
  return api.post<CreateStudioBridgeLaunchResponse>("/studio/bridge/launch", payload);
}

export function consumeStudioBridgeLaunch(launchId: string) {
  return api.get<ConsumeStudioBridgeLaunchResponse>(
    `/studio/bridge/launch/${encodeURIComponent(launchId)}`,
  );
}
