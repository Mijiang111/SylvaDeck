import { useEffect, useMemo } from "react";
import { persistWorkbenchAiSettings } from "@/features/studio/ai-settings";
import { createWorkspaceRepository, readStudioSession } from "./repository";
import {
  useStudioBriefState,
  useStudioHistoryState,
  useStudioLibraryState,
  useStudioProjectActions,
  useStudioProjectState,
  useStudioShellState,
} from "./store";
import { findProjectLocation } from "./utils";

export function useStudioWorkspace(options?: {
  projectId?: string;
}) {
  const workspaceRepository = useMemo(() => createWorkspaceRepository(), []);

  const shell = useStudioShellState();
  const library = useStudioLibraryState();
  const projectState = useStudioProjectState();
  const brief = useStudioBriefState();
  const history = useStudioHistoryState();
  const {
    hydrate,
    selectProject,
    setBootError,
    setSaveState,
    markSaved,
  } = useStudioProjectActions();
  const shellBootState = shell.bootState;
  const librarySnapshot = library.snapshot;
  const currentProjectId = projectState.project?.id ?? null;
  const aiSettings = brief.aiSettings;
  const historyDirty = history.dirty;

  useEffect(() => {
    if (shellBootState === "ready" && librarySnapshot) {
      return;
    }

    let cancelled = false;

    async function bootstrapStudio() {
      try {
        const snapshot = await workspaceRepository.hydrate();
        if (cancelled) {
          return;
        }

        const session = readStudioSession();
        hydrate(snapshot, {
          workspaceId: session?.activeWorkspaceId,
          projectId: options?.projectId ?? session?.activeProjectId,
        });
      } catch (error) {
        if (!cancelled) {
          setBootError(
            error instanceof Error
              ? error.message
              : "Failed to load the local Studio workspace.",
          );
        }
      }
    }

    void bootstrapStudio();

    return () => {
      cancelled = true;
    };
  }, [
    hydrate,
    librarySnapshot,
    options?.projectId,
    setBootError,
    shellBootState,
    workspaceRepository,
  ]);

  useEffect(() => {
    persistWorkbenchAiSettings(aiSettings);
  }, [aiSettings]);

  useEffect(() => {
    if (
      shellBootState !== "ready" ||
      !historyDirty ||
      !librarySnapshot
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          setSaveState("saving");
          await workspaceRepository.saveLibrary(librarySnapshot);
          markSaved(new Date().toISOString());
        } catch (error) {
          setSaveState(
            "error",
            error instanceof Error ? error.message : "Failed to persist studio snapshot.",
          );
        }
      })();
    }, 260);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    historyDirty,
    librarySnapshot,
    markSaved,
    setSaveState,
    shellBootState,
    workspaceRepository,
  ]);

  useEffect(() => {
    if (
      !options?.projectId ||
      !librarySnapshot ||
      shellBootState !== "ready" ||
      currentProjectId === options.projectId
    ) {
      return;
    }

    const resolved = findProjectLocation(librarySnapshot, options.projectId);
    if (!resolved) {
      return;
    }

    selectProject(resolved.workspace.id, resolved.project.id, "editor");
  }, [
    currentProjectId,
    librarySnapshot,
    options?.projectId,
    selectProject,
    shellBootState,
  ]);

  return {
    workspaceRepository,
  };
}
