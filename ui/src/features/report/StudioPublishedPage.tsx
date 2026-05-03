import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "@/lib/router";
import { downloadPublishedHtml } from "@/features/studio/export";
import { exportProjectToPptx } from "@/features/studio/pptx/export-pptx";
import type { PptExportResult } from "@/features/studio/pptx/export-pptx";
import { WorkbenchReportView } from "@/features/studio/runtime/runtime-report-views";
import { createStageDraft } from "@/features/studio/runtime/runtime-storyline";
import { waitForRenderableSurface } from "@/features/studio/runtime/studio/export";
import {
  createWorkspaceRepository,
} from "@/features/studio/runtime/studio/repository";
import {
  appendPublishSnapshot,
  findProjectLocation,
  replaceProjectInSnapshot,
} from "@/features/studio/runtime/studio/utils";
import type { WorkbenchProject } from "@/features/studio/types";

type PublishedProjectState = {
  project: WorkbenchProject;
  workspaceId: string;
};

function formatPptxWarningSummary(code: PptExportResult["warnings"][number]["code"]) {
  switch (code) {
    case "native-chart-exported":
      return "Native editable chart export";
    case "visual-chart-exported":
      return "Stable visual chart export";
    case "hybrid-chart-exported":
      return "Hybrid chart page export";
    case "color-fallback":
      return "Color fell back to the closest PowerPoint-safe value.";
    case "gradient-flattened":
      return "Complex gradient was flattened because it could not be represented as native PowerPoint fill.";
    case "chart-image-fallback":
      return "Chart was exported as a visual snapshot to preserve visibility.";
    case "chart-native-unsupported":
      return "Chart type is not natively supported by the current PPTX renderer.";
    case "table-native-unsupported":
      return "Table could not be converted into a native PowerPoint table.";
    case "frame-missing":
      return "One page surface was not ready when export started.";
    case "page-missing":
      return "A page could not be collected from the current report.";
    case "block-missing":
      return "A text block could not be mapped into the PowerPoint file.";
    case "visual-missing":
      return "A visual node could not be mapped into the PowerPoint file.";
    case "html-report-missing":
      return "The editable HTML report was not available for PPTX export.";
    default:
      return code;
  }
}

export function StudioPublishedPage({ projectId }: { projectId: string }) {
  const location = useLocation();
  const workspaceRepository = useMemo(() => createWorkspaceRepository(), []);
  const [projectState, setProjectState] = useState<PublishedProjectState | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [isExportingPptx, setIsExportingPptx] = useState(false);
  const [lastPptxExportResult, setLastPptxExportResult] = useState<PptExportResult | null>(null);
  const handledExportKeyRef = useRef<string | null>(null);
  const exportMode = useMemo(
    () => new URLSearchParams(location.search).get("export"),
    [location.search],
  );
  const publishedHref = useMemo(() => `/projects/${projectId}/published`, [projectId]);

  const project = projectState?.project ?? null;
  const generatedHtmlReport = project?.generatedDraft?.htmlReport ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadProject() {
      setIsBooting(true);
      const snapshot = await workspaceRepository.hydrate();
      if (cancelled) {
        return;
      }

      const resolved = findProjectLocation(snapshot, projectId);
      setProjectState(
        resolved
          ? {
              project: resolved.project,
              workspaceId: resolved.workspace.id,
            }
          : null,
      );
      setIsBooting(false);
    }

    void loadProject();

    return () => {
      cancelled = true;
    };
  }, [projectId, workspaceRepository]);

  useEffect(() => {
    function onStorage() {
      void (async () => {
        const snapshot = await workspaceRepository.hydrate();
        const resolved = findProjectLocation(snapshot, projectId);
        setProjectState(
          resolved
            ? {
                project: resolved.project,
                workspaceId: resolved.workspace.id,
              }
            : null,
        );
      })();
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [projectId, workspaceRepository]);

  const publishedDraft = useMemo(() => {
    if (!project) {
      return null;
    }

    return createStageDraft({
      workflowStage: project.workflowStage,
      projectName: project.projectName,
      sourceText: project.sourceText,
      pages: project.pages,
      templateId: project.templateId,
      asset: project.generatedDraft,
    });
  }, [project]);

  async function recordPublish(format: "web" | "html" | "pdf" | "pptx", publishedUrl: string) {
    const snapshot = await workspaceRepository.hydrate();
    const resolved = findProjectLocation(snapshot, projectId);
    if (!resolved) {
      return null;
    }

    const nextProject = appendPublishSnapshot(resolved.project, format, publishedUrl);
    const nextSnapshot = replaceProjectInSnapshot(snapshot, resolved.workspace.id, nextProject);
    await workspaceRepository.saveLibrary(nextSnapshot);
    setProjectState({
      project: nextProject,
      workspaceId: resolved.workspace.id,
    });
    return nextProject;
  }

  const exportRunKey =
    exportMode && project
      ? `${project.id}:${exportMode}:${project.generatedDraft?.signature ?? "draft"}`
      : null;

  useEffect(() => {
    handledExportKeyRef.current = null;
  }, [exportMode, projectId]);

  useEffect(() => {
    if (!project) {
      return;
    }

    document.title = `${project.projectName} | Published report`;
  }, [project]);

  useEffect(() => {
    if (!project || !publishedDraft || exportMode === "html" || exportMode === "pdf" || exportMode === "pptx") {
      return;
    }

    void recordPublish("web", window.location.href);
  }, [exportMode, project?.id, project?.generatedDraft?.signature, project?.updatedAt, publishedDraft]);

  useEffect(() => {
    if (!project || !publishedDraft || !generatedHtmlReport || exportMode !== "html") {
      return;
    }
    if (handledExportKeyRef.current === exportRunKey) {
      return;
    }
    handledExportKeyRef.current = exportRunKey;

    const timeout = window.setTimeout(() => {
      void (async () => {
        await recordPublish("html", window.location.href);
        downloadPublishedHtml({
          document,
          htmlReport: generatedHtmlReport,
          projectName: project.projectName,
          publishedUrl: window.location.href,
        });
      })();
    }, 260);

    return () => window.clearTimeout(timeout);
  }, [
    exportMode,
    generatedHtmlReport,
    project?.id,
    project?.generatedDraft?.signature,
    project?.updatedAt,
    publishedDraft,
  ]);

  useEffect(() => {
    if (!project || !publishedDraft || exportMode !== "pdf") {
      return;
    }
    if (handledExportKeyRef.current === exportRunKey) {
      return;
    }
    handledExportKeyRef.current = exportRunKey;

    const timeout = window.setTimeout(() => {
      void (async () => {
        await recordPublish("pdf", window.location.href);
        window.print();
      })();
    }, 260);

    return () => window.clearTimeout(timeout);
  }, [exportMode, project?.id, project?.generatedDraft?.signature, project?.updatedAt, publishedDraft]);

  useEffect(() => {
    if (!project || !publishedDraft || exportMode !== "pptx") {
      return;
    }
    if (handledExportKeyRef.current === exportRunKey) {
      return;
    }
    handledExportKeyRef.current = exportRunKey;

    const timeout = window.setTimeout(() => {
      void (async () => {
        const updatedProject = await recordPublish("pptx", window.location.href);
        if (!updatedProject) {
          return;
        }
        const reportRoot = document.querySelector("[data-ppt-report-root='published']");
        if (!(reportRoot instanceof HTMLElement)) {
          return;
        }

        await waitForRenderableSurface(reportRoot);
        const result = await exportProjectToPptx({
          document,
          project: updatedProject,
          draft: publishedDraft,
          reportRoot,
          publishedUrl: window.location.href,
        });
        setLastPptxExportResult(result);
      })();
    }, 260);

    return () => window.clearTimeout(timeout);
  }, [exportMode, project?.id, project?.generatedDraft?.signature, project?.updatedAt, publishedDraft]);

  if (!project || !publishedDraft) {
    return (
      <article className="flex h-screen items-center justify-center bg-[#e8e5df] px-6 text-[#102838]">
        <div className="max-w-md rounded-[24px] bg-[#f7f3eb] px-8 py-8 text-center shadow-[0_18px_38px_rgba(15,23,31,0.08)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#5c7581]">
            Published Report
          </div>
          <h1
            className="mt-3 text-[2rem] leading-[1.05]"
            style={{ fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif' }}
          >
            {isBooting ? "Loading published report" : "Project not found"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#4c6470]">
            {isBooting
              ? "Opening the published project from the local Studio workspace."
              : "The requested project id is not available in this studio library anymore."}
          </p>
        </div>
      </article>
    );
  }

  const hideChrome = exportMode === "html" || exportMode === "pdf" || exportMode === "pptx";

  if (hideChrome) {
    return (
      <WorkbenchReportView
        pages={project.pages}
        draft={publishedDraft}
        htmlReport={generatedHtmlReport}
        rootId="published"
      />
    );
  }

  async function handleManualPptxExport() {
    if (!project || !publishedDraft || isExportingPptx) {
      return;
    }

    const reportRoot = document.querySelector("[data-ppt-report-root='published']");
    if (!(reportRoot instanceof HTMLElement)) {
      return;
    }

    setIsExportingPptx(true);
    try {
      await waitForRenderableSurface(reportRoot);
      const result = await exportProjectToPptx({
        document,
        project,
        draft: publishedDraft,
        reportRoot,
        publishedUrl: window.location.href,
      });
      setLastPptxExportResult(result);
      await recordPublish("pptx", window.location.href);
    } finally {
      setIsExportingPptx(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-[#ddd9d3] text-[#102838]">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#12384c]/8 bg-[#f7f3eb] px-8 py-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5c7581]">
            Published report
          </div>
          <div
            className="mt-2 text-[1.5rem] leading-[1.02]"
            style={{ fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif' }}
          >
            {project.projectName}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6b7783]">
          <a
            href={`${publishedHref}?export=html`}
            className="rounded-full bg-white px-4 py-2 text-[#445864] transition hover:text-[#102838]"
          >
            Export HTML
          </a>
          <a
            href={`${publishedHref}?export=pdf`}
            className="rounded-full bg-white px-4 py-2 text-[#445864] transition hover:text-[#102838]"
          >
            Export PDF
          </a>
          <button
            type="button"
            onClick={() => {
              void handleManualPptxExport();
            }}
            disabled={isExportingPptx}
            className="rounded-full bg-white px-4 py-2 text-[#445864] transition hover:text-[#102838] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isExportingPptx ? "Exporting PPTX" : "Export PPTX"}
          </button>
        </div>
      </div>

      {lastPptxExportResult ? (
        <div className="border-b border-[#12384c]/8 bg-[#f3efe7] px-8 py-3 text-[#445864]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6b7783]">
            Latest PPTX export
          </div>
          <div className="mt-2 text-sm">
            {lastPptxExportResult.fileName} • {lastPptxExportResult.slideCount} slides
          </div>
          <div className="mt-2 text-xs uppercase tracking-[0.16em] text-[#5c7581]">
            Quality {lastPptxExportResult.qualityReport.score} •{" "}
            {lastPptxExportResult.qualityReport.nativeObjectCount} native •{" "}
            {lastPptxExportResult.qualityReport.fallbackObjectCount} fallback
          </div>
          {lastPptxExportResult.warningCount > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {lastPptxExportResult.warnings.slice(0, 6).map((warning, index) => (
                <div
                  key={`${warning.code}-${warning.pageNumber ?? "all"}-${index}`}
                  className="rounded-full border border-[#c7bda9] bg-white px-3 py-1 text-[11px] font-medium tracking-[0.02em] text-[#4f5f69]"
                >
                  {warning.pageNumber ? `P${warning.pageNumber} · ` : ""}
                  {formatPptxWarningSummary(warning.code)}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-xs uppercase tracking-[0.16em] text-[#6b7783]">
              No export notes
            </div>
          )}
          {lastPptxExportResult.diagnostics.some(
            (diagnostic) => diagnostic.severity === "success" || diagnostic.severity === "info",
          ) ? (
            <details className="mt-3 text-xs text-[#6b7783]">
              <summary className="cursor-pointer uppercase tracking-[0.16em]">
                Export diagnostics
              </summary>
              <div className="mt-2 flex flex-wrap gap-2">
                {lastPptxExportResult.diagnostics
                  .filter(
                    (diagnostic) =>
                      diagnostic.severity === "success" || diagnostic.severity === "info",
                  )
                  .slice(0, 6)
                  .map((diagnostic, index) => (
                    <span
                      key={`${diagnostic.code}-${diagnostic.pageNumber ?? "all"}-${index}`}
                      className="rounded-full border border-[#d9d0c0] bg-white/70 px-3 py-1"
                    >
                      {diagnostic.pageNumber ? `P${diagnostic.pageNumber} · ` : ""}
                      {diagnostic.code}
                    </span>
                  ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <WorkbenchReportView
        pages={project.pages}
        draft={publishedDraft}
        fullscreen={false}
        htmlReport={generatedHtmlReport}
        rootId="published"
      />
      </div>
    </div>
  );
}
