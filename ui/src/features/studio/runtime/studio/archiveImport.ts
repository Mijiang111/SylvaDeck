import type { StudioLibrarySnapshot } from "./types";
import { ensureSnapshotScaffold } from "./utils";

const ARCHIVED_PROJECT_LIBRARY_STORAGE_KEY = "ppt-workbench-project-library-v4";
const ARCHIVE_IMPORT_STORAGE_KEY = "studio-imported-from-archive-v1";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function hasArchiveImportCompleted() {
  if (!canUseStorage()) {
    return false;
  }

  try {
    return window.localStorage.getItem(ARCHIVE_IMPORT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markArchiveImportCompleted() {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(ARCHIVE_IMPORT_STORAGE_KEY, "1");
  } catch {
    // Ignore storage failures and keep the studio runtime usable.
  }
}

export function readArchivedWorkbenchSnapshot(): StudioLibrarySnapshot | null {
  if (!canUseStorage() || hasArchiveImportCompleted()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(ARCHIVED_PROJECT_LIBRARY_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StudioLibrarySnapshot> | null;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.activeWorkspaceId !== "string" ||
      !Array.isArray(parsed.workspaces)
    ) {
      return null;
    }

    return ensureSnapshotScaffold(
      {
        version: typeof parsed.version === "number" ? parsed.version : 1,
        activeWorkspaceId: parsed.activeWorkspaceId,
        workspaces: parsed.workspaces as StudioLibrarySnapshot["workspaces"],
      },
      undefined,
    );
  } catch {
    return null;
  }
}
