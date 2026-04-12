import { useCallback, useMemo, useState } from "react";
import { downloadPublishedHtml } from "@/features/studio/export";
import {
  exportProjectToPptx,
  type PptExportResult,
} from "@/features/studio/pptx/export-pptx";
import type { GeneratedDraftAsset, WorkbenchProject } from "@/features/studio/types";
import type { WorkspaceRepository } from "../studio/repository";
import {
  useStudioLibraryState,
  useStudioProjectActions,
  useStudioProjectState,
  useWorkbenchStudioStore,
} from "../studio/store";
import { waitForRenderableSurface } from "../studio/export";

function buildProjectBundle(project: WorkbenchProject) {
  return JSON.stringify(project, null, 2);
}

function buildWorkspaceBundleFromSnapshot(
  snapshot: {
    activeWorkspaceId: string;
    workspaces: Array<{
      id: string;
      name: string;
      projects: WorkbenchProject[];
      activeProjectId: string;
      createdAt: string;
      updatedAt: string;
      exportedAt: string;
      version: number;
    }>;
  } | null,
  workspaceId: string,
) {
  if (!snapshot) {
    return "{}";
  }

  const workspace =
    snapshot.workspaces.find((entry) => entry.id === workspaceId) ??
    snapshot.workspaces[0];

  return JSON.stringify(workspace, null, 2);
}

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

type UseStudioExportActionsArgs = {
  workspaceRepository: WorkspaceRepository;
  project: WorkbenchProject | null;
  draft: Parameters<typeof exportProjectToPptx>[0]["draft"] | null;
  generatedHtmlReport: GeneratedDraftAsset["htmlReport"] | null;
  publishedHref: string;
};

export function useStudioExportActions(args: UseStudioExportActionsArgs) {
  const { workspaceRepository, project, draft, generatedHtmlReport, publishedHref } = args;
  const [bundleInput, setBundleInputState] = useState("");
  const [lastPptxExportResult, setLastPptxExportResult] = useState<PptExportResult | null>(null);

  const library = useStudioLibraryState();
  const projectState = useStudioProjectState();
  const {
    importBundle,
    recordPublish,
    setSaveState,
    markSaved,
    setStatusLine,
  } = useStudioProjectActions();
  const librarySnapshot = library.snapshot;
  const workspaceId = projectState.workspaceId;

  const publishUrl = useMemo(
    () => new URL(publishedHref, window.location.origin).toString(),
    [publishedHref],
  );

  const flushStudioSnapshot = useCallback(async () => {
    const latestState = useWorkbenchStudioStore.getState();
    if (!latestState.library.snapshot) {
      return;
    }
    setSaveState("saving");
    await workspaceRepository.saveLibrary(latestState.library.snapshot);
    markSaved(new Date().toISOString());
  }, [markSaved, setSaveState, workspaceRepository]);

  const setBundleInput = useCallback((value: string) => {
    setBundleInputState(value);
  }, []);

  const copyProjectBundleJson = useCallback(async () => {
    if (!project) {
      return;
    }

    const projectBundleJson = buildProjectBundle(project);
    try {
      await copyToClipboard(projectBundleJson);
      setStatusLine("Copied current project bundle.");
    } catch {
      setBundleInputState(projectBundleJson);
      setStatusLine("Project bundle prepared below. Copy it manually if clipboard is blocked.");
    }
  }, [project, setStatusLine]);

  const copyWorkspaceBundleJson = useCallback(async () => {
    const workspaceBundleJson = buildWorkspaceBundleFromSnapshot(
      librarySnapshot,
      workspaceId,
    );
    try {
      await copyToClipboard(workspaceBundleJson);
      setStatusLine("Copied current workspace bundle.");
    } catch {
      setBundleInputState(workspaceBundleJson);
      setStatusLine("Workspace bundle prepared below. Copy it manually if clipboard is blocked.");
    }
  }, [librarySnapshot, setStatusLine, workspaceId]);

  const handleImportBundle = useCallback(async () => {
    if (!bundleInput.trim()) {
      setStatusLine("Paste a project or workspace bundle JSON first.");
      return;
    }

    try {
      importBundle(bundleInput);
      setBundleInputState("");
    } catch (error) {
      setStatusLine(
        error instanceof Error ? error.message : "Failed to import bundle.",
      );
    }
  }, [bundleInput, importBundle, setStatusLine]);

  const downloadCurrentHtml = useCallback(async () => {
    if (!project || !generatedHtmlReport || !draft) {
      return;
    }

    const reportRoot = document.querySelector(
      "[data-ppt-report-root='studio-main']",
    ) as HTMLElement | null;
    if (!reportRoot) {
      setStatusLine("The report surface is not ready for export yet.");
      return;
    }

    await waitForRenderableSurface(reportRoot);
    downloadPublishedHtml({
      document,
      reportRoot,
      projectName: project.projectName,
      publishedUrl: publishUrl,
    });
    recordPublish("html", publishUrl);
    await flushStudioSnapshot();
    setStatusLine("Downloaded standalone HTML.");
  }, [
    draft,
    flushStudioSnapshot,
    generatedHtmlReport,
    project,
    publishUrl,
    recordPublish,
    setStatusLine,
  ]);

  const downloadCurrentPptx = useCallback(async () => {
    if (!project || !generatedHtmlReport || !draft) {
      return;
    }

    const reportRoot = document.querySelector(
      "[data-ppt-report-root='studio-main']",
    ) as HTMLElement | null;
    if (!reportRoot) {
      setStatusLine("The report surface is not ready for PPTX export yet.");
      return;
    }

    try {
      const result = await exportProjectToPptx({
        document,
        project,
        draft,
        reportRoot,
        publishedUrl: publishUrl,
      });
      setLastPptxExportResult(result);
      recordPublish("pptx", publishUrl);
      await flushStudioSnapshot();
      setStatusLine(
        result.warningCount
          ? `Downloaded PPTX with ${result.warningCount} export notes.`
          : "Downloaded editable PPTX.",
      );
    } catch (error) {
      setStatusLine(
        error instanceof Error ? error.message : "PPTX export failed.",
      );
    }
  }, [
    draft,
    flushStudioSnapshot,
    generatedHtmlReport,
    project,
    publishUrl,
    recordPublish,
    setStatusLine,
  ]);

  const openPublishedReport = useCallback(async () => {
    if (!project) {
      return;
    }

    recordPublish("web", publishUrl);
    await flushStudioSnapshot();
    window.open(publishUrl, "_blank", "noopener,noreferrer");
  }, [flushStudioSnapshot, project, publishUrl, recordPublish]);

  return {
    bundleInput,
    setBundleInput,
    lastPptxExportResult,
    copyProjectBundleJson,
    copyWorkspaceBundleJson,
    handleImportBundle,
    downloadCurrentHtml,
    downloadCurrentPptx,
    openPublishedReport,
  };
}
