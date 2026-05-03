import { randomUUID } from "node:crypto";
import type {
  ConsumeStudioBridgeLaunchResponse,
  CreateStudioBridgeLaunchRequest,
  CreateStudioBridgeLaunchResponse,
} from "./contracts.js";

const DEFAULT_BRIDGE_LAUNCH_TTL_MS = 15 * 60 * 1000;
const DEFAULT_STUDIO_UI_BASE_URL = "http://127.0.0.1:5174/";

type StoredStudioBridgeLaunch = {
  launchId: string;
  prompt: string;
  projectName: string | null;
  generationMode: CreateStudioBridgeLaunchRequest["generationMode"];
  moduleUsageMode: CreateStudioBridgeLaunchRequest["moduleUsageMode"];
  htmlOutputMode: CreateStudioBridgeLaunchRequest["htmlOutputMode"];
  requestedPageCount: number | null;
  exportContract: CreateStudioBridgeLaunchRequest["exportContract"];
  mode: CreateStudioBridgeLaunchRequest["mode"];
  expiresAt: string;
};

const studioBridgeLaunchStore = new Map<string, StoredStudioBridgeLaunch>();

function getStudioUiBaseUrl() {
  const raw = process.env.STUDIO_UI_BASE_URL?.trim();
  if (!raw) {
    return DEFAULT_STUDIO_UI_BASE_URL;
  }
  return raw.endsWith("/") ? raw : `${raw}/`;
}

function cleanupExpiredLaunches(now = Date.now()) {
  for (const [launchId, entry] of studioBridgeLaunchStore.entries()) {
    if (Date.parse(entry.expiresAt) <= now) {
      studioBridgeLaunchStore.delete(launchId);
    }
  }
}

function buildStudioBridgeOpenUrl(launchId: string) {
  const url = new URL(getStudioUiBaseUrl());
  url.searchParams.set("bridgeLaunch", launchId);
  return url.toString();
}

export function createStudioBridgeLaunch(
  payload: CreateStudioBridgeLaunchRequest,
  options?: {
    now?: number;
    ttlMs?: number;
    uiBaseUrl?: string;
  },
): CreateStudioBridgeLaunchResponse {
  const now = options?.now ?? Date.now();
  cleanupExpiredLaunches(now);

  const launchId = randomUUID();
  const ttlMs = Math.max(1_000, options?.ttlMs ?? DEFAULT_BRIDGE_LAUNCH_TTL_MS);
  const expiresAt = new Date(now + ttlMs).toISOString();
  const uiBaseUrl = options?.uiBaseUrl?.trim();
  const openUrl = (() => {
    if (!uiBaseUrl) {
      return buildStudioBridgeOpenUrl(launchId);
    }
    const url = new URL(uiBaseUrl.endsWith("/") ? uiBaseUrl : `${uiBaseUrl}/`);
    url.searchParams.set("bridgeLaunch", launchId);
    return url.toString();
  })();

  studioBridgeLaunchStore.set(launchId, {
    launchId,
    prompt: payload.prompt.trim(),
    projectName: payload.projectName?.trim() ? payload.projectName.trim() : null,
    generationMode: payload.generationMode ?? "standard",
    moduleUsageMode: payload.moduleUsageMode ?? "disabled",
    htmlOutputMode: payload.htmlOutputMode ?? "static",
    requestedPageCount: payload.requestedPageCount ?? null,
    exportContract: payload.exportContract,
    mode: payload.mode ?? "inject-and-generate",
    expiresAt,
  });

  return {
    launchId,
    openUrl,
    expiresAt,
  };
}

export function consumeStudioBridgeLaunch(
  launchId: string,
  options?: {
    now?: number;
  },
): ConsumeStudioBridgeLaunchResponse | null {
  const now = options?.now ?? Date.now();
  cleanupExpiredLaunches(now);

  const entry = studioBridgeLaunchStore.get(launchId);
  if (!entry) {
    return null;
  }

  studioBridgeLaunchStore.delete(launchId);
  if (Date.parse(entry.expiresAt) <= now) {
    return null;
  }

  return {
    launchId: entry.launchId,
    prompt: entry.prompt,
    projectName: entry.projectName,
    generationMode: entry.generationMode,
    moduleUsageMode: entry.moduleUsageMode,
    htmlOutputMode: entry.htmlOutputMode,
    requestedPageCount: entry.requestedPageCount,
    exportContract: entry.exportContract,
    mode: entry.mode,
    expiresAt: entry.expiresAt,
  };
}

export function resetStudioBridgeLaunchStore() {
  studioBridgeLaunchStore.clear();
}
