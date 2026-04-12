import {
  startTransition,
  type ChangeEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Maximize2,
  Minimize2,
  RefreshCcw,
  SendHorizontal,
  WandSparkles,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useLocation, useNavigate } from "@/lib/router";
import { downloadPublishedHtml } from "@/features/studio/export";
import {
  createHtmlReportPages,
  createGeneratedDraftAsset,
  createGenerationSignature,
  detectImplicitLongFormClarification,
  hasPageFitFailure,
  inferRequestedHtmlPageCount,
  resolveGenerationIntent,
  streamReviseHtmlReport,
  streamGenerateHtmlReport,
  type PageFitMeasurement,
  type StudioGenerateStreamEvent,
} from "@/features/studio/generation";
import {
  exportProjectToPptx,
  type PptExportResult,
} from "@/features/studio/pptx/export-pptx";
import {
  getGeneratedHtmlReportBlockCanvasTransform,
  getGeneratedHtmlReportVisualCanvasTransform,
  updateGeneratedHtmlReportCanvasBlockTransform,
  updateGeneratedHtmlReportCanvasVisualTransform,
} from "@/features/studio/html-report-canvas";
import { updateGeneratedHtmlReportLayoutZone } from "@/features/studio/html-report-layout";
import { updateGeneratedHtmlReportBlock } from "@/features/studio/html-report-structure";
import {
  addGeneratedHtmlReportVisualNode,
  deleteGeneratedHtmlReportVisualContentNode,
  deleteGeneratedHtmlReportVisualNode,
  duplicateGeneratedHtmlReportVisualContentNode,
  duplicateGeneratedHtmlReportVisualNode,
  extractGeneratedHtmlReportVisualNodeContent,
  extractHtmlPageVisualStyle,
  type HtmlVisualInsertionMode,
  updateGeneratedHtmlReportVisualNode,
  updateGeneratedHtmlReportVisualStyle,
} from "@/features/studio/html-report-visuals";
import { loadPublishedModuleManifests } from "@/features/studio/module-assets";
import { buildReportSourceInput } from "@/features/studio/module-runtime-input";
import {
  createModuleAuthoringHandoffFromHtmlBlock,
  createModuleAuthoringHandoffFromLayoutZone,
  createModuleAuthoringHandoffFromVisualNode,
  storeModuleAuthoringHandoff,
} from "@/features/studio/module-authoring-handoff";
import { getIndustryStyleProfile } from "@/features/studio/industry-style";
import type {
  GeneratedDraftAsset,
  HtmlCanvasFrame,
  HtmlEditableBlock,
  HtmlLayoutZoneKind,
  HtmlLayoutZone,
  HtmlVisualContentNode,
  HtmlVisualNode,
  HtmlVisualNodeKind,
  HtmlVisualNodeStyle,
  HtmlPageVisualStyle,
  LayoutPage,
  LongFormClarificationResolution,
  LongFormClarificationTrigger,
  PublishedModuleManifest,
  TemplateId,
  WorkbenchModuleUsageMode,
  WorkbenchProject,
} from "@/features/studio/types";
import { buildBriefReadLine, buildBriefSummary, createIntakeThread, getUserBriefMessages } from "./runtime-intake";
import { LibraryReportCard } from "./homepage/LibraryReportCard";
import type { LibraryCardRecord } from "./homepage/types";
import { HtmlReportPageFilmstrip, StreamingReportCanvasView, WorkbenchReportView } from "./runtime-report-views";
import { waitForRenderableSurface } from "./studio/export";
import { formatVersionTimestamp } from "./runtime-presentational";
import { createStageDraft } from "./runtime-storyline";
import { useStudioWorkspace } from "./studio/useStudioWorkspace";
import {
  useStudioBriefState,
  useStudioHistoryState,
  useStudioLibraryState,
  useStudioProjectActions,
  useStudioProjectState,
  useStudioSelectionState,
  useStudioShellState,
  useWorkbenchStudioStore,
} from "./studio/store";
import {
  WorkbenchStudioInspector,
  type InspectorSchema,
} from "./studio/WorkbenchStudioInspector";
import {
  WorkbenchStudioVirtualList,
} from "./studio/WorkbenchStudioVirtual";
import { filterVisibleProjects, findProjectLocation, getWorkspaceById } from "./studio/utils";
import {
  DEFAULT_STREAM_UI_STATE,
  formatPptxWarningSummary,
  type StreamUiState,
} from "./runtime-shell-contract";
import { useLongFormClarification } from "./hooks/useLongFormClarification";
import { useStudioDeckReviewFlow } from "./hooks/useStudioDeckReviewFlow";
import { useStudioExportActions } from "./hooks/useStudioExportActions";
import { useStudioGenerationFlow } from "./hooks/useStudioGenerationFlow";
import { useStudioTranscriptState } from "./hooks/useStudioTranscriptState";
import type { Message, StreamingReportPage } from "./runtime-types";

const INSPECTOR_TABS = [
  { id: "page", label: "Page" },
  { id: "text", label: "Text" },
  { id: "visual", label: "Visual" },
  { id: "layout", label: "Layout" },
  { id: "history", label: "History" },
  { id: "export", label: "Export" },
] as const;

const SIDEBAR_TABS = INSPECTOR_TABS.filter(
  (tab) => tab.id !== "text" && tab.id !== "layout",
);

const MODULE_USAGE_OPTIONS: Array<{
  value: WorkbenchModuleUsageMode;
  label: string;
}> = [
  { value: "disabled", label: "Templates: Off" },
  { value: "fallback", label: "Fallback only" },
  { value: "chart-only", label: "Charts only" },
];

const GENERAL_CONSULTING_PROFILE = getIndustryStyleProfile("general-consulting");

function inferVisualKindForModule(manifest: PublishedModuleManifest): HtmlVisualNodeKind {
  if (
    manifest.supportedChartKinds.length > 0 ||
    manifest.kind === "bars" ||
    manifest.kind === "line" ||
    manifest.kind === "gantt"
  ) {
    return "chart-frame";
  }
  if (manifest.kind === "flow" || manifest.kind === "phases") {
    return "rail";
  }
  if (manifest.kind === "matrix") {
    return "annotation";
  }
  return "surface";
}

function buildVisualStylePresetFromModule(
  manifest: PublishedModuleManifest,
  pageStyle: HtmlPageVisualStyle,
  kind: HtmlVisualNodeKind,
): Partial<HtmlVisualNodeStyle> {
  const chartLike =
    manifest.supportedChartKinds.length > 0 ||
    manifest.kind === "bars" ||
    manifest.kind === "line" ||
    manifest.kind === "gantt";

  return {
    background:
      kind === "highlight"
        ? pageStyle.surfaceFill
        : kind === "rail"
          ? pageStyle.pageBackground
          : pageStyle.surfaceFill,
    border: pageStyle.dividerColor,
    borderWidth: chartLike ? 1.5 : 1,
    radius: kind === "badge" ? 999 : kind === "rail" ? 26 : kind === "annotation" ? 22 : 24,
    accent: pageStyle.accentColor,
    opacity: 1,
    minHeight: chartLike ? 260 : kind === "rail" ? 180 : undefined,
    padding: kind === "badge" ? 8 : 20,
  };
}

function resolveModulePageStyleFallback(project: WorkbenchProject | null): HtmlPageVisualStyle {
  return {
    pageBackground:
      project?.generatedDraft?.htmlReport?.styleProfile?.pageBackground ??
      GENERAL_CONSULTING_PROFILE.tokens.pageBackground,
    dividerColor:
      project?.generatedDraft?.htmlReport?.styleProfile?.dividerColor ??
      GENERAL_CONSULTING_PROFILE.tokens.borderSubtle,
    surfaceFill:
      project?.generatedDraft?.htmlReport?.styleProfile?.surfaceFill ??
      GENERAL_CONSULTING_PROFILE.tokens.surfacePrimary,
    accentColor:
      project?.generatedDraft?.htmlReport?.styleProfile?.accentColor ??
      GENERAL_CONSULTING_PROFILE.tokens.accentPrimary,
  };
}

function formatSaveStatus(saveState: string, lastSavedAt: string | null) {
  if (saveState === "saving") {
    return "Saving locally...";
  }
  if (saveState === "error") {
    return "Local save failed";
  }
  if (lastSavedAt) {
    return `Saved ${formatVersionTimestamp(lastSavedAt)}`;
  }
  return "Local-first Studio";
}

export function StudioProjectEditPage({ projectId }: { projectId: string }) {
  const { workspaceRepository } = useStudioWorkspace({ projectId });
  const location = useLocation();
  const navigate = useNavigate();
  const [chatInput, setChatInput] = useState("");
  const [canvasMoreOpen, setCanvasMoreOpen] = useState(false);
  const [pagesStripVisible, setPagesStripVisible] = useState(true);
  const [propertiesVisible, setPropertiesVisible] = useState(true);
  const [resolvedCanvasScale, setResolvedCanvasScale] = useState(1);
  const [streamUi, setStreamUi] = useState<StreamUiState>(DEFAULT_STREAM_UI_STATE);
  const canvasMoreButtonRef = useRef<HTMLButtonElement | null>(null);
  const canvasMoreMenuRef = useRef<HTMLDivElement | null>(null);

  const shell = useStudioShellState();
  const library = useStudioLibraryState();
  const documentState = useStudioProjectState();
  const selection = useStudioSelectionState();
  const brief = useStudioBriefState();
  const historyState = useStudioHistoryState();
  const publishedModuleOptions = useMemo(
    () => loadPublishedModuleManifests(),
    [location.pathname, location.search],
  );

  const {
    replaceCurrentProject,
    setHomeSection,
    setStatusLine,
    setEditView,
    setCanvasDrawer,
    setCanvasScale,
    setCurrentCanvasPageId,
    setWorkspaceName,
    setProjectName,
    setSourceText,
    setBriefMessages,
    setIntakeInput,
    setBuildingStoryline,
    setGeneratingReport,
    selectWorkspace,
    selectProject,
    createWorkspace,
    deleteCurrentWorkspace,
    createProject,
    duplicateCurrentProject,
    deleteCurrentProject,
    updatePages,
    updateGeneratedDraft,
    commitGeneration,
    recordPublish,
    setSaveState,
    markSaved,
    selectPage,
    selectHtmlBlock,
    selectVisualNode,
    selectLayoutZone,
    clearSelection,
    recordHtmlOverflow,
    undo,
    redo,
    importBundle,
    setInspectorTab,
  } = useStudioProjectActions();

  const project = documentState.project;

  const draft = useMemo(() => {
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

  const intakeMessages = useMemo<Message[]>(
    () => (project ? createIntakeThread(project.briefMessages) : createIntakeThread([])),
    [project],
  );
  const {
    longFormClarification,
    clarificationPrompt,
    clarificationReceipt,
    clarificationOptions,
  } = useLongFormClarification(project?.longFormClarification);
  const briefSummary = useMemo(
    () => buildBriefSummary(intakeMessages, brief.intakeInput),
    [brief.intakeInput, intakeMessages],
  );
  const userBriefTurnCount = useMemo(
    () => getUserBriefMessages(intakeMessages).length,
    [intakeMessages],
  );
  const hasStartedBrief = userBriefTurnCount > 0;
  const intakeStatusLine =
    shell.statusLine ||
    (hasStartedBrief
      ? buildBriefReadLine(briefSummary)
      : "Start a new report with one sentence or paste rough notes.");

  const generatedHtmlReport = project?.generatedDraft?.htmlReport ?? null;
  const displayProjectTitle = useMemo(() => {
    if (generatedHtmlReport?.title) {
      return generatedHtmlReport.title;
    }
    if (streamUi.deckTitle && streamUi.deckTitle !== DEFAULT_STREAM_UI_STATE.deckTitle) {
      return streamUi.deckTitle;
    }
    return project?.projectName ?? "Untitled report";
  }, [generatedHtmlReport?.title, project?.projectName, streamUi.deckTitle]);
  const {
    resetStreamUi,
    appendStreamTranscript,
    handleStreamEvent,
  } = useStudioTranscriptState({
    projectName: project?.projectName,
    setPropertiesVisible,
    setPagesStripVisible,
    setCurrentCanvasPageId,
    streamUi,
    setStreamUi,
  });
  const hasStreamingPreview =
    streamUi.partialPages.length > 0 &&
    (streamUi.isStreaming || Boolean(streamUi.error));
  const currentCanvasPageId =
    shell.currentCanvasPageId ??
    selection.activePageId ??
    (hasStreamingPreview ? String(streamUi.partialPages[0]?.pageNumber ?? "1") : null) ??
    project?.pages[0]?.id ??
    null;
  const currentCanvasPageNumber = Math.max(1, Number.parseInt(currentCanvasPageId || "1", 10));
  const currentCanvasPageTitle = useMemo(() => {
    if (!project && !hasStreamingPreview) {
      return "";
    }

    const pageIndex = Math.max(0, currentCanvasPageNumber - 1);
    return (
      streamUi.partialPages[pageIndex]?.title ??
      streamUi.pageTitles[pageIndex] ??
      generatedHtmlReport?.pageTitles[pageIndex] ??
      project?.pages[pageIndex]?.title ??
      project?.pages[0]?.title ??
      ""
    );
  }, [
    currentCanvasPageNumber,
    generatedHtmlReport?.pageTitles,
    hasStreamingPreview,
    project,
    streamUi.pageTitles,
    streamUi.partialPages,
  ]);
  const {
    deckReview,
    isDeckReviewLocked,
    currentPageMeasurement,
    handleHtmlPageOverflow,
    handleHtmlPageMeasurement,
    queueDeckReview,
    stopDeckOptimization,
    optimizeCurrentPage,
  } = useStudioDeckReviewFlow({
    project,
    generatedHtmlReport,
    briefAiSettings: brief.aiSettings,
    currentCanvasPageNumber,
    hasStreamingPreview,
    selectionHtmlPageOverflows: selection.htmlPageOverflows,
    setPropertiesVisible,
  });
  const activePage = useMemo(
    () => project?.pages.find((page) => page.id === selection.activePageId) ?? project?.pages[0] ?? null,
    [project, selection.activePageId],
  );
  const activeHtmlPageTitle = useMemo(() => {
    if (!generatedHtmlReport || !project) {
      return "";
    }

    const pageIndex = Math.max(0, Number.parseInt(selection.activePageId || "1", 10) - 1);
    return (
      generatedHtmlReport.pageTitles[pageIndex] ??
      project.pages[pageIndex]?.title ??
      activePage?.title ??
      ""
    );
  }, [activePage, generatedHtmlReport, project, selection.activePageId]);
  const activeHtmlStructurePage = useMemo(() => {
    if (!generatedHtmlReport?.structure?.pages?.length) {
      return null;
    }

    const pageNumber = Math.max(1, Number.parseInt(selection.activePageId || "1", 10));
    return (
      generatedHtmlReport.structure.pages.find((page) => page.pageNumber === pageNumber) ??
      generatedHtmlReport.structure.pages[0] ??
      null
    );
  }, [generatedHtmlReport, selection.activePageId]);
  const activeHtmlBlock = useMemo(() => {
    if (!activeHtmlStructurePage || !selection.selectedHtmlBlockId) {
      return null;
    }

    const block =
      activeHtmlStructurePage.blocks.find((block) => block.id === selection.selectedHtmlBlockId) ??
      null;
    if (!block || !generatedHtmlReport) {
      return block;
    }

    const override = getGeneratedHtmlReportBlockCanvasTransform({
      report: generatedHtmlReport,
      pageNumber: activeHtmlStructurePage.pageNumber,
      blockId: block.id,
    });
    if (!override?.fontSize) {
      return block;
    }

    return {
      ...block,
      fontSize: override.fontSize,
    };
  }, [activeHtmlStructurePage, generatedHtmlReport, selection.selectedHtmlBlockId]);
  const activeHtmlBlockCanvasTransform = useMemo(() => {
    if (!activeHtmlStructurePage || !selection.selectedHtmlBlockId || !generatedHtmlReport) {
      return null;
    }

    return getGeneratedHtmlReportBlockCanvasTransform({
      report: generatedHtmlReport,
      pageNumber: activeHtmlStructurePage.pageNumber,
      blockId: selection.selectedHtmlBlockId,
    });
  }, [activeHtmlStructurePage, generatedHtmlReport, selection.selectedHtmlBlockId]);
  const activeHtmlVisualStyle = useMemo(() => {
    if (!generatedHtmlReport) {
      return null;
    }

    return extractHtmlPageVisualStyle({
      report: generatedHtmlReport,
      pageNumber: Math.max(1, Number.parseInt(selection.activePageId || "1", 10)),
    });
  }, [generatedHtmlReport, selection.activePageId]);
  const activeHtmlVisualPage = useMemo(() => {
    if (!generatedHtmlReport?.visualStructure?.pages?.length) {
      return null;
    }

    return (
      generatedHtmlReport.visualStructure.pages.find(
        (page) => page.pageNumber === Math.max(1, Number.parseInt(selection.activePageId || "1", 10)),
      ) ?? null
    );
  }, [generatedHtmlReport, selection.activePageId]);
  const activeHtmlVisualNode = useMemo<HtmlVisualNode | null>(() => {
    if (!activeHtmlVisualPage || !selection.selectedVisualNodeId) {
      return null;
    }

    const node =
      activeHtmlVisualPage.nodes.find((node) => node.id === selection.selectedVisualNodeId) ?? null;
    if (!node || !generatedHtmlReport) {
      return node;
    }

    const override = getGeneratedHtmlReportVisualCanvasTransform({
      report: generatedHtmlReport,
      pageNumber: activeHtmlVisualPage.pageNumber,
      nodeId: node.id,
    });
    if (!override) {
      return node;
    }

    return {
      ...node,
      style: {
        ...node.style,
        widthPercent: undefined,
        height: override.frame.h,
        minHeight: override.frame.h,
      },
    };
  }, [activeHtmlVisualPage, generatedHtmlReport, selection.selectedVisualNodeId]);
  const activeHtmlVisualCanvasTransform = useMemo(() => {
    if (!activeHtmlVisualPage || !selection.selectedVisualNodeId || !generatedHtmlReport) {
      return null;
    }

    return getGeneratedHtmlReportVisualCanvasTransform({
      report: generatedHtmlReport,
      pageNumber: activeHtmlVisualPage.pageNumber,
      nodeId: selection.selectedVisualNodeId,
    });
  }, [activeHtmlVisualPage, generatedHtmlReport, selection.selectedVisualNodeId]);
  const activeHtmlVisualContentNodes = useMemo<HtmlVisualContentNode[]>(() => {
    if (!generatedHtmlReport || !selection.selectedVisualNodeId) {
      return [];
    }

    return extractGeneratedHtmlReportVisualNodeContent({
      report: generatedHtmlReport,
      pageNumber: Math.max(1, Number.parseInt(selection.activePageId || "1", 10)),
      nodeId: selection.selectedVisualNodeId,
    });
  }, [generatedHtmlReport, selection.activePageId, selection.selectedVisualNodeId]);
  const activeHtmlLayoutPage = useMemo(() => {
    if (!generatedHtmlReport?.layoutStructure?.pages?.length) {
      return null;
    }

    return (
      generatedHtmlReport.layoutStructure.pages.find(
        (page) => page.pageNumber === Math.max(1, Number.parseInt(selection.activePageId || "1", 10)),
      ) ?? null
    );
  }, [generatedHtmlReport, selection.activePageId]);
  const activeHtmlLayoutZone = useMemo(() => {
    if (!activeHtmlLayoutPage || !selection.selectedLayoutZoneId) {
      return null;
    }

    return activeHtmlLayoutPage.zones.find((zone) => zone.id === selection.selectedLayoutZoneId) ?? null;
  }, [activeHtmlLayoutPage, selection.selectedLayoutZoneId]);

  useEffect(() => {
    if (!activeHtmlStructurePage || !selection.selectedHtmlBlockId) {
      return;
    }

    if (!activeHtmlStructurePage.blocks.some((block) => block.id === selection.selectedHtmlBlockId)) {
      clearSelection("page");
    }
  }, [activeHtmlStructurePage, clearSelection, selection.selectedHtmlBlockId]);

  useEffect(() => {
    if (!activeHtmlVisualPage || !selection.selectedVisualNodeId) {
      return;
    }

    if (!activeHtmlVisualPage.nodes.some((node) => node.id === selection.selectedVisualNodeId)) {
      clearSelection("page");
    }
  }, [activeHtmlVisualPage, clearSelection, selection.selectedVisualNodeId]);

  useEffect(() => {
    if (!activeHtmlLayoutPage || !selection.selectedLayoutZoneId) {
      return;
    }

    if (!activeHtmlLayoutPage.zones.some((zone) => zone.id === selection.selectedLayoutZoneId)) {
      clearSelection("page");
    }
  }, [activeHtmlLayoutPage, clearSelection, selection.selectedLayoutZoneId]);

  const publishedHref = project
    ? `/projects/${project.id}/published`
    : "/";
  const {
    bundleInput,
    setBundleInput,
    lastPptxExportResult,
    copyProjectBundleJson,
    copyWorkspaceBundleJson,
    handleImportBundle,
    downloadCurrentHtml,
    downloadCurrentPptx,
    openPublishedReport,
  } = useStudioExportActions({
    workspaceRepository,
    project,
    draft,
    generatedHtmlReport,
    publishedHref,
  });
  const {
    buildStorylineFromInput,
    regenerateReportContent,
    continueConversation,
    cancelStreamingGeneration,
    handleLongFormClarificationChoice,
    updateProjectModuleUsageMode,
  } = useStudioGenerationFlow({
    project,
    streamUi,
    isDeckReviewLocked,
    intakeMessages,
    generatedHtmlReport,
    longFormClarification,
    shellBootState: shell.bootState,
    handleStreamEvent,
    resetStreamUi,
    setStreamUi,
    appendStreamTranscript,
    onConversationQueued: () => setChatInput(""),
    queueDeckReview,
  });

  const deferredLibraryQuery = useDeferredValue(library.query);
  const allLibraryProjectCards = useMemo<LibraryCardRecord[]>(() => {
    if (!library.snapshot) {
      return [];
    }

    const snapshot = library.snapshot;
    return library.projectSummaries
      .map((summary) => {
        const workspace = getWorkspaceById(snapshot, summary.workspaceId);
        const storedProject =
          workspace?.projects.find((entry) => entry.id === summary.id) ?? null;
        if (!storedProject || !filterVisibleProjects(storedProject)) {
          return null;
        }

        return {
          project: summary,
          htmlReport: storedProject.generatedDraft?.htmlReport ?? null,
          isPublished: summary.publishCount > 0,
        } satisfies LibraryCardRecord;
      })
      .filter((entry): entry is LibraryCardRecord => Boolean(entry));
  }, [library.projectSummaries, library.snapshot]);
  const filteredLibraryProjects = useMemo(() => {
    const query = deferredLibraryQuery.trim().toLowerCase();
    let cards = allLibraryProjectCards;

    if (library.view === "recent") {
      cards = cards.slice(0, 12);
    } else if (library.view === "published") {
      cards = cards.filter((entry) => entry.isPublished);
    }

    if (!query) {
      return cards;
    }

    return cards.filter(({ project: summary }) =>
      [
        summary.projectName,
        summary.workspaceName,
        summary.workflowStage,
        summary.coverSubtitle,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [allLibraryProjectCards, deferredLibraryQuery, library.view]);

  function focusPage(pageId: string) {
    selectPage(pageId);
    const targetId = hasStreamingPreview ? `ppt-stream-page-${pageId}` : `ppt-page-${pageId}`;
    document.getElementById(targetId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function updateActivePage(nextPatch: Partial<LayoutPage>, statusLine?: string) {
    if (!project || !activePage) {
      return;
    }

    const nextPages = project.pages.map((page) =>
      page.id === activePage.id ? { ...page, ...nextPatch } : page,
    );
    updatePages(nextPages, {
      scope: "pages",
      label: "Update page brief",
      statusLine,
    });
  }

  function updateHtmlBlockOnPage(
    pageNumber: number,
    blockId: string,
    nextContent: { text?: string; items?: string[]; fontSize?: number },
  ) {
    if (!project?.generatedDraft?.htmlReport) {
      return;
    }

    const nextHtmlReport = updateGeneratedHtmlReportBlock({
      report: project.generatedDraft.htmlReport,
      pageNumber,
      blockId,
      ...nextContent,
    });

    if (nextHtmlReport.html === project.generatedDraft.htmlReport.html) {
      return;
    }

    const nextPages = project.pages.map((page, index) => ({
      ...page,
      title: nextHtmlReport.pageTitles[index] ?? page.title,
    }));

    updateGeneratedDraft({
      generatedDraft: {
        ...project.generatedDraft,
        htmlReport: nextHtmlReport,
      } satisfies GeneratedDraftAsset,
      pages: nextPages,
      projectName:
        project.projectName === project.generatedDraft.htmlReport.title
          ? nextHtmlReport.title
          : project.projectName,
      label: "Edit HTML block",
      scope: "text",
      inspectorTab: "text",
      statusLine: "Updated the current HTML page structure.",
    });
  }

  function updateHtmlBlockTransformOnPage(
    pageNumber: number,
    blockId: string,
    frame: HtmlCanvasFrame,
    fontSize?: number,
  ) {
    if (!project?.generatedDraft?.htmlReport) {
      return;
    }

    const baseReport =
      typeof fontSize === "number" && Number.isFinite(fontSize) && fontSize > 0
        ? updateGeneratedHtmlReportBlock({
            report: project.generatedDraft.htmlReport,
            pageNumber,
            blockId,
            fontSize,
          })
        : project.generatedDraft.htmlReport;

    const nextHtmlReport = updateGeneratedHtmlReportCanvasBlockTransform({
      report: baseReport,
      pageNumber,
      id: blockId,
      frame,
      fontSize,
    });

    updateGeneratedDraft({
      generatedDraft: {
        ...project.generatedDraft,
        htmlReport: nextHtmlReport,
      },
      label: "Move text block",
      scope: "text",
      inspectorTab: "text",
      statusLine: "Moved the selected text block on the page canvas.",
    });
  }

  function updateActiveHtmlVisualStyle(nextStyle: HtmlPageVisualStyle) {
    if (!project?.generatedDraft?.htmlReport) {
      return;
    }

    const nextHtmlReport = updateGeneratedHtmlReportVisualStyle({
      report: project.generatedDraft.htmlReport,
      pageNumber: Math.max(1, Number.parseInt(selection.activePageId || "1", 10)),
      style: nextStyle,
    });

    if (nextHtmlReport.html === project.generatedDraft.htmlReport.html) {
      return;
    }

    updateGeneratedDraft({
      generatedDraft: {
        ...project.generatedDraft,
        htmlReport: nextHtmlReport,
      },
      label: "Edit page visual system",
      scope: "visual",
      inspectorTab: "visual",
      statusLine: "Updated the current page visuals.",
    });
  }

  function updateActiveHtmlVisualNodeStyle(nextStyle: Partial<HtmlVisualNodeStyle>) {
    if (!project?.generatedDraft?.htmlReport || !selection.selectedVisualNodeId) {
      return;
    }

    const nextHtmlReport = updateGeneratedHtmlReportVisualNode({
      report: project.generatedDraft.htmlReport,
      pageNumber: Math.max(1, Number.parseInt(selection.activePageId || "1", 10)),
      nodeId: selection.selectedVisualNodeId,
      style: nextStyle,
    });

    if (nextHtmlReport.html === project.generatedDraft.htmlReport.html) {
      return;
    }

    updateGeneratedDraft({
      generatedDraft: {
        ...project.generatedDraft,
        htmlReport: nextHtmlReport,
      },
      label: "Edit visual module",
      scope: "visual",
      inspectorTab: "visual",
      statusLine: "Updated the selected visual element.",
    });
  }

  function updateHtmlVisualTransformOnPage(
    pageNumber: number,
    nodeId: string,
    frame: HtmlCanvasFrame,
  ) {
    if (!project?.generatedDraft?.htmlReport) {
      return;
    }

    const nextHtmlReport = updateGeneratedHtmlReportCanvasVisualTransform({
      report: project.generatedDraft.htmlReport,
      pageNumber,
      id: nodeId,
      frame,
    });

    updateGeneratedDraft({
      generatedDraft: {
        ...project.generatedDraft,
        htmlReport: nextHtmlReport,
      },
      label: "Move visual block",
      scope: "visual",
      inspectorTab: "visual",
      statusLine: "Moved the selected visual element on the page canvas.",
    });
  }

  function addVisualElement(
    kind: HtmlVisualNodeKind,
    placement: HtmlVisualInsertionMode = "page-end",
  ) {
    if (!project?.generatedDraft?.htmlReport) {
      return;
    }

    const actualPlacement =
      selection.selectedVisualNodeId && placement !== "page-end" ? placement : "page-end";
    const { report: nextHtmlReport, nodeId } = addGeneratedHtmlReportVisualNode({
      report: project.generatedDraft.htmlReport,
      pageNumber: Math.max(1, Number.parseInt(selection.activePageId || "1", 10)),
      kind,
      placement: actualPlacement,
      anchorNodeId: selection.selectedVisualNodeId,
    });

    if (nextHtmlReport.html === project.generatedDraft.htmlReport.html) {
      return;
    }

    updateGeneratedDraft({
      generatedDraft: {
        ...project.generatedDraft,
        htmlReport: nextHtmlReport,
      },
      label: "Insert visual module",
      scope: "visual",
      inspectorTab: "visual",
      statusLine: `Added a ${kind.replace(/-/g, " ")} to this page.`,
    });
    if (nodeId) {
      selectVisualNode(Math.max(1, Number.parseInt(selection.activePageId || "1", 10)), nodeId);
    }
  }

  function duplicateSelectedVisualElement() {
    if (!project?.generatedDraft?.htmlReport || !selection.selectedVisualNodeId) {
      return;
    }

    const { report: nextHtmlReport, nodeId } = duplicateGeneratedHtmlReportVisualNode({
      report: project.generatedDraft.htmlReport,
      pageNumber: Math.max(1, Number.parseInt(selection.activePageId || "1", 10)),
      nodeId: selection.selectedVisualNodeId,
    });

    if (nextHtmlReport.html === project.generatedDraft.htmlReport.html) {
      return;
    }

    updateGeneratedDraft({
      generatedDraft: {
        ...project.generatedDraft,
        htmlReport: nextHtmlReport,
      },
      label: "Duplicate visual module",
      scope: "visual",
      inspectorTab: "visual",
      statusLine: "Duplicated the selected visual element.",
    });
    if (nodeId) {
      selectVisualNode(Math.max(1, Number.parseInt(selection.activePageId || "1", 10)), nodeId);
    }
  }

  function deleteSelectedVisualElement() {
    if (!project?.generatedDraft?.htmlReport || !selection.selectedVisualNodeId) {
      return;
    }

    const nextHtmlReport = deleteGeneratedHtmlReportVisualNode({
      report: project.generatedDraft.htmlReport,
      pageNumber: Math.max(1, Number.parseInt(selection.activePageId || "1", 10)),
      nodeId: selection.selectedVisualNodeId,
    });

    if (nextHtmlReport.html === project.generatedDraft.htmlReport.html) {
      return;
    }

    updateGeneratedDraft({
      generatedDraft: {
        ...project.generatedDraft,
        htmlReport: nextHtmlReport,
      },
      label: "Delete visual module",
      scope: "visual",
      inspectorTab: "page",
      statusLine: "Removed the selected visual element.",
    });
    clearSelection("page");
  }

  function duplicateVisualContentElement(contentNodeId: string) {
    if (!project?.generatedDraft?.htmlReport || !selection.selectedVisualNodeId) {
      return;
    }

    const nextHtmlReport = duplicateGeneratedHtmlReportVisualContentNode({
      report: project.generatedDraft.htmlReport,
      pageNumber: Math.max(1, Number.parseInt(selection.activePageId || "1", 10)),
      nodeId: selection.selectedVisualNodeId,
      contentNodeId,
    });

    if (nextHtmlReport.html === project.generatedDraft.htmlReport.html) {
      return;
    }

    updateGeneratedDraft({
      generatedDraft: {
        ...project.generatedDraft,
        htmlReport: nextHtmlReport,
      },
      label: "Duplicate visual content",
      scope: "visual",
      inspectorTab: "visual",
      statusLine: "Duplicated an element inside the selected visual module.",
    });
  }

  function deleteVisualContentElement(contentNodeId: string) {
    if (!project?.generatedDraft?.htmlReport || !selection.selectedVisualNodeId) {
      return;
    }

    const nextHtmlReport = deleteGeneratedHtmlReportVisualContentNode({
      report: project.generatedDraft.htmlReport,
      pageNumber: Math.max(1, Number.parseInt(selection.activePageId || "1", 10)),
      nodeId: selection.selectedVisualNodeId,
      contentNodeId,
    });

    if (nextHtmlReport.html === project.generatedDraft.htmlReport.html) {
      return;
    }

    updateGeneratedDraft({
      generatedDraft: {
        ...project.generatedDraft,
        htmlReport: nextHtmlReport,
      },
      label: "Delete visual content",
      scope: "visual",
      inspectorTab: "visual",
      statusLine: "Deleted an element inside the selected visual module.",
    });
  }

  const extractSelectionAsModule = useCallback(
    (
      source:
        | { kind: "text"; block: HtmlEditableBlock }
        | { kind: "visual"; node: HtmlVisualNode; contentNodes: HtmlVisualContentNode[] }
        | { kind: "layout"; zone: HtmlLayoutZone },
    ) => {
      if (!project) {
        return;
      }

      const pageNumber = Math.max(
        1,
        Number.parseInt(selection.activePageId || currentCanvasPageId || "1", 10),
      );
      const selectionContext = {
        projectName: project.projectName,
        pageTitle:
          activeHtmlPageTitle ||
          activePage?.title ||
          currentCanvasPageTitle ||
          `Page ${pageNumber}`,
        pageNumber,
        pageStyle: activeHtmlVisualStyle,
      };

      const handoff =
        source.kind === "text"
          ? createModuleAuthoringHandoffFromHtmlBlock({
              ...selectionContext,
              block: source.block,
            })
          : source.kind === "visual"
            ? createModuleAuthoringHandoffFromVisualNode({
                ...selectionContext,
                node: source.node,
                contentNodes: source.contentNodes,
              })
            : createModuleAuthoringHandoffFromLayoutZone({
                ...selectionContext,
                zone: source.zone,
              });

      const token = storeModuleAuthoringHandoff(handoff);
      setStatusLine(`${handoff.sourceLabel} Opening it in the author workspace.`);
      navigate(`/templates/new?extract=${token}&stage=${handoff.preferredStage}`);
    },
    [
      activeHtmlPageTitle,
      activeHtmlVisualStyle,
      activePage?.title,
      currentCanvasPageId,
      currentCanvasPageTitle,
      navigate,
      project,
      selection.activePageId,
      setStatusLine,
    ],
  );

  const recommendedModuleManifests = useMemo(() => {
    const selectedKind = activeHtmlVisualNode?.kind ?? null;

    return [...publishedModuleOptions]
      .map((manifest) => {
        let score = manifest.trustScore * 10 + manifest.publishCount;

        if (manifest.hasPassingEvidence) {
          score += 2;
        }
        if (selectedKind && inferVisualKindForModule(manifest) === selectedKind) {
          score += 4;
        }
        if (selectedKind === "chart-frame" && manifest.supportedChartKinds.length > 0) {
          score += 3;
        }
        if (
          (currentCanvasPageTitle || activePage?.title || "")
            .toLowerCase()
            .includes(manifest.semanticRole.toLowerCase().slice(0, 18))
        ) {
          score += 1;
        }

        return { manifest, score };
      })
      .sort((left, right) => right.score - left.score || left.manifest.label.localeCompare(right.manifest.label))
      .map((item) => item.manifest)
      .slice(0, 6);
  }, [activeHtmlVisualNode?.kind, activePage?.title, currentCanvasPageTitle, publishedModuleOptions]);

  const replaceSelectedVisualWithModule = useCallback(
    (manifest: PublishedModuleManifest) => {
      if (!project?.generatedDraft?.htmlReport || !selection.selectedVisualNodeId) {
        return;
      }

      const pageNumber = Math.max(1, Number.parseInt(selection.activePageId || "1", 10));
      const nextKind = inferVisualKindForModule(manifest);
      const pageStyle = activeHtmlVisualStyle ?? resolveModulePageStyleFallback(project);
      const nextHtmlReport = updateGeneratedHtmlReportVisualNode({
        report: project.generatedDraft.htmlReport,
        pageNumber,
        nodeId: selection.selectedVisualNodeId,
        kind: nextKind,
        moduleId: manifest.moduleId,
        moduleLabel: manifest.label,
        style: buildVisualStylePresetFromModule(manifest, pageStyle, nextKind),
      });

      if (nextHtmlReport.html === project.generatedDraft.htmlReport.html) {
        return;
      }

      updateGeneratedDraft({
        generatedDraft: {
          ...project.generatedDraft,
          htmlReport: nextHtmlReport,
        },
        label: "Replace visual module",
        scope: "visual",
        inspectorTab: "visual",
        statusLine: `Applied ${manifest.label} to the selected visual module.`,
      });
    },
    [
      activeHtmlVisualStyle,
      project,
      selection.activePageId,
      selection.selectedVisualNodeId,
      updateGeneratedDraft,
    ],
  );

  const insertPublishedModule = useCallback(
    (manifest: PublishedModuleManifest) => {
      if (!project?.generatedDraft?.htmlReport) {
        return;
      }

      const pageNumber = Math.max(1, Number.parseInt(selection.activePageId || "1", 10));
      const nextKind = inferVisualKindForModule(manifest);
      const inserted = addGeneratedHtmlReportVisualNode({
        report: project.generatedDraft.htmlReport,
        pageNumber,
        kind: nextKind,
        anchorNodeId: selection.selectedVisualNodeId,
        placement: selection.selectedVisualNodeId ? "below" : "page-end",
      });
      if (!inserted.nodeId) {
        return;
      }

      const pageStyle =
        activeHtmlVisualStyle ?? resolveModulePageStyleFallback(project);
      const styledReport = updateGeneratedHtmlReportVisualNode({
        report: inserted.report,
        pageNumber,
        nodeId: inserted.nodeId,
        kind: nextKind,
        moduleId: manifest.moduleId,
        moduleLabel: manifest.label,
        style: buildVisualStylePresetFromModule(manifest, pageStyle, nextKind),
      });

      updateGeneratedDraft({
        generatedDraft: {
          ...project.generatedDraft,
          htmlReport: styledReport,
        },
        label: "Insert published module",
        scope: "visual",
        inspectorTab: "visual",
        statusLine: `Inserted ${manifest.label} into this page.`,
      });
      selectVisualNode(pageNumber, inserted.nodeId);
      setPropertiesVisible(true);
    },
    [
      activeHtmlVisualStyle,
      project,
      selectVisualNode,
      selection.activePageId,
      selection.selectedVisualNodeId,
      updateGeneratedDraft,
    ],
  );

  function commitHtmlLayoutZone(pageNumber: number, zoneId: string, splitPercent: number) {
    if (!project?.generatedDraft?.htmlReport) {
      return;
    }

    const nextHtmlReport = updateGeneratedHtmlReportLayoutZone({
      report: project.generatedDraft.htmlReport,
      pageNumber,
      zoneId,
      splitPercent,
    });

    if (nextHtmlReport.html === project.generatedDraft.htmlReport.html) {
      setStatusLine("Layout unchanged (needs a two-child column container).");
      return;
    }

    updateGeneratedDraft({
      generatedDraft: {
        ...project.generatedDraft,
        htmlReport: nextHtmlReport,
      },
      label: "Adjust layout zone",
      scope: "layout",
      inspectorTab: "layout",
      statusLine: "Adjusted column balance for this page.",
    });
  }

  function returnToHome() {
    if (project) {
      setHomeSection(project.generatedDraft?.htmlReport ? "library" : "ai");
    }
    navigate("/");
  }

  function setCanvasView(nextView: "split" | "canvas") {
    setEditView(nextView);
    if (nextView === "canvas") {
      navigate(`${location.pathname}?view=canvas`, { replace: false });
      return;
    }
    navigate(location.pathname, { replace: false });
  }

  function openSidebarTab(tab: "page" | "text" | "visual" | "layout" | "history" | "export") {
    setCanvasDrawer(tab);
    if (tab === "page" || tab === "text" || tab === "visual" || tab === "layout") {
      setInspectorTab(tab);
    }
    setPropertiesVisible(true);
  }

  function openPropertiesPanel() {
    if (selection.selectedHtmlBlockId) {
      openSidebarTab("text");
      return;
    }
    if (selection.selectedVisualNodeId) {
      openSidebarTab("visual");
      return;
    }
    if (selection.selectedLayoutZoneId) {
      openSidebarTab("layout");
      return;
    }

    const targetPageId = currentCanvasPageId ?? selection.activePageId ?? project?.pages[0]?.id ?? "1";
    selectPage(targetPageId);
    openSidebarTab("page");
  }

  function zoomCanvasBy(delta: number) {
    const baseScale =
      shell.canvasScaleMode === "manual" && shell.canvasScale !== null
        ? shell.canvasScale
        : resolvedCanvasScale;
    const nextScale = Math.max(0.36, Math.min(1.4, Number((baseScale + delta).toFixed(2))));
    setCanvasScale(nextScale, "manual");
  }

  function resetCanvasScale() {
    setCanvasScale(null, "fit");
  }

  function handleCanvasPageJump(pageNumber: number) {
    const pageId = String(pageNumber);
    setCurrentCanvasPageId(pageId);
    focusPage(pageId);
  }

  useEffect(() => {
    const requestedView =
      new URLSearchParams(location.search).get("view") === "canvas" ? "canvas" : "split";
    if (shell.editView !== requestedView) {
      setEditView(requestedView);
    }
  }, [location.search, setEditView, shell.editView]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (canvasMoreOpen) {
        setCanvasMoreOpen(false);
        return;
      }

      if (propertiesVisible) {
        setPropertiesVisible(false);
        return;
      }

      if (shell.editView === "canvas") {
        setCanvasView("split");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canvasMoreOpen, propertiesVisible, shell.editView]);

  useEffect(() => {
    if (!canvasMoreOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (canvasMoreButtonRef.current?.contains(event.target as Node)) {
        return;
      }

      if (canvasMoreMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setCanvasMoreOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [canvasMoreOpen]);

  useEffect(() => {
    if (
      shell.canvasDrawer === "text" ||
      shell.canvasDrawer === "visual" ||
      shell.canvasDrawer === "layout" ||
      shell.canvasDrawer === "history" ||
      shell.canvasDrawer === "export"
    ) {
      setPropertiesVisible(true);
    }
  }, [shell.canvasDrawer]);

  useEffect(() => {
    if (!hasStreamingPreview) {
      return;
    }

    setPropertiesVisible(false);
    setCanvasDrawer(null);
  }, [hasStreamingPreview, setCanvasDrawer]);

  useEffect(() => {
    if (lastPptxExportResult?.warningCount) {
      openSidebarTab("export");
    }
  }, [lastPptxExportResult]);

  const historyEntries = useMemo(() => {
    if (!project) {
      return [];
    }

    return [
      ...project.generationHistory.map((entry) => ({
        id: `gen-${entry.id}`,
        kind: "Generation",
        label: `${entry.mode === "content" ? "HTML report" : "Outline"} / ${entry.provider}`,
        createdAt: entry.createdAt,
        detail: entry.snapshot.projectName,
      })),
      ...project.publishSnapshots.map((entry) => ({
        id: `publish-${entry.id}`,
        kind: "Export",
        label: entry.format.toUpperCase(),
        createdAt: entry.createdAt,
        detail: entry.publishedUrl ?? "Local export",
      })),
    ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [project]);

  const pageInspectorSchema = useMemo<InspectorSchema | null>(() => {
    if (!project || !activePage) {
      return null;
    }

    const isBriefMode = shell.mode === "brief";
    const pageFields: InspectorSchema["sections"][number]["fields"] = [
      generatedHtmlReport
        ? {
            id: `page-title-${activePage.id}`,
            kind: "readonly",
            label: "Page title",
            value: activeHtmlPageTitle || activePage.title,
          }
        : {
            id: `page-title-${activePage.id}`,
            kind: "text",
            label: "Page title",
            value: activePage.title,
            onChange: (value: string) =>
              updateActivePage(
                { title: value },
                "Updated the page title in the Studio outline.",
              ),
          },
    ];

    if (isBriefMode) {
      pageFields.push(
        {
          id: `page-instruction-${activePage.id}`,
          kind: "textarea",
          label: "Page instruction",
          value: activePage.instruction ?? "",
          placeholder: "What should this page prove or explain?",
          onChange: (value: string) =>
            updateActivePage(
              { instruction: value },
              "Updated the page instruction.",
            ),
          debounceMs: 280,
        },
        {
          id: `page-note-${activePage.id}`,
          kind: "textarea",
          label: "Page note",
          value: activePage.note ?? "",
          placeholder: "Any delivery notes or context for this page.",
          onChange: (value: string) =>
            updateActivePage({ note: value }, "Updated the page note."),
          debounceMs: 280,
        },
      );
    }

    const sections: InspectorSchema["sections"] = [
      ...(isBriefMode
        ? [
            {
              id: "project",
              title: "Project",
              fields: [
                {
                  id: "project-name",
                  kind: "text" as const,
                  label: "Project name",
                  value: project.projectName,
                  onChange: setProjectName,
                  debounceMs: 220,
                },
                {
                  id: "source-text",
                  kind: "textarea" as const,
                  label: "Brief",
                  value: project.sourceText,
                  placeholder:
                    "Paste the brief or source material that should drive the HTML report.",
                  onChange: setSourceText,
                  debounceMs: 280,
                },
              ],
            },
          ]
        : []),
      {
        id: "page",
        title: "Page",
        fields: pageFields,
      },
    ];

    if (!isBriefMode && recommendedModuleManifests.length > 0) {
      sections.push({
        id: "page-modules",
        title: "Insert published module",
        fields: [
          {
            id: `page-module-insert-${activePage.id}`,
            kind: "actions",
            label: "Published capabilities",
            description: "Insert a published module into the current page without leaving the editor.",
            actions: recommendedModuleManifests.map((manifest) => ({
              id: `insert-module-${manifest.moduleId}`,
              label: manifest.label,
              onPress: () => insertPublishedModule(manifest),
            })),
          },
        ],
      });
    }

    if (activeHtmlVisualStyle) {
      sections.push({
        id: "page-visual",
        title: "Page visual system",
        fields: [
          {
            id: "page-background",
            kind: "color",
            label: "Page background",
            value: activeHtmlVisualStyle.pageBackground,
            onChange: (value: string) =>
              updateActiveHtmlVisualStyle({
                ...activeHtmlVisualStyle,
                pageBackground: value,
              }),
          },
          {
            id: "surface-fill",
            kind: "color",
            label: "Surface fill",
            value: activeHtmlVisualStyle.surfaceFill,
            onChange: (value: string) =>
              updateActiveHtmlVisualStyle({
                ...activeHtmlVisualStyle,
                surfaceFill: value,
              }),
          },
          {
            id: "divider-color",
            kind: "color",
            label: "Divider color",
            value: activeHtmlVisualStyle.dividerColor,
            onChange: (value: string) =>
              updateActiveHtmlVisualStyle({
                ...activeHtmlVisualStyle,
                dividerColor: value,
              }),
          },
        ],
      });
    }

    return {
      id: "page-inspector",
      title: "Project and page",
      description:
        shell.mode === "brief"
          ? "Shape the brief before generation, then move straight into the editor."
          : "Use the canvas for content edits and keep this panel focused on page-level controls.",
      sections,
    };
  }, [
    activeHtmlPageTitle,
    activeHtmlVisualStyle,
    activePage,
    generatedHtmlReport,
    insertPublishedModule,
    project,
    recommendedModuleManifests,
    setProjectName,
    setSourceText,
    shell.mode,
  ]);

  const textInspectorSchema = useMemo<InspectorSchema | null>(() => {
    if (!activeHtmlBlock) {
      return pageInspectorSchema;
    }

    return {
      id: "text-inspector",
      title: "Text block",
      description: "Text editing now lives directly on the canvas. Double-click the selected block to rewrite it in place.",
      sections: [
        {
          id: "meta",
          title: "Selection",
          fields: [
            {
              id: `block-extract-${activeHtmlBlock.id}`,
              kind: "actions",
              label: "Authoring handoff",
              actions: [
                {
                  id: `extract-block-${activeHtmlBlock.id}`,
                  label: "Extract as module",
                  onPress: () =>
                    extractSelectionAsModule({
                      kind: "text",
                      block: activeHtmlBlock,
                    }),
                },
              ],
            },
            {
              id: `block-kind-${activeHtmlBlock.id}`,
              kind: "readonly",
              label: "Block kind",
              value: activeHtmlBlock.kind,
            },
            {
              id: `block-source-${activeHtmlBlock.id}`,
              kind: "readonly",
              label: "Source tag",
              value: activeHtmlBlock.sourceTag,
            },
            {
              id: `block-canvas-mode-${activeHtmlBlock.id}`,
              kind: "readonly",
              label: "Canvas mode",
              value: activeHtmlBlockCanvasTransform
                ? `Freeform · ${Math.round(activeHtmlBlockCanvasTransform.frame.x)}, ${Math.round(activeHtmlBlockCanvasTransform.frame.y)}`
                : "Flow layout",
              description: activeHtmlBlockCanvasTransform
                ? "This block is currently placed freely on the canvas."
                : "This block is following the page flow.",
            },
          ],
        },
        {
          id: "typography",
          title: "Typography",
          fields: [
            {
              id: `block-font-size-${activeHtmlBlock.id}`,
              kind: "number",
              label: "Font size",
              value: Math.round(activeHtmlBlock.fontSize ?? 12),
              min: 8,
              max: 120,
              step: 1,
              description: "Adjust the selected text block without affecting the rest of the page.",
              onChange: (value: number) =>
                updateHtmlBlockOnPage(
                  Math.max(1, Number.parseInt(selection.activePageId || "1", 10)),
                  activeHtmlBlock.id,
                  { fontSize: value },
                ),
              debounceMs: 180,
            },
          ],
        },
        {
          id: "canvas-editing",
          title: "Canvas editing",
          fields: [
            {
              id: `block-content-preview-${activeHtmlBlock.id}`,
              kind: "readonly",
              label: activeHtmlBlock.items?.length ? "Current list" : "Current text",
              value: activeHtmlBlock.items?.length
                ? activeHtmlBlock.items.join("\n")
                : activeHtmlBlock.text ?? "",
            },
            {
              id: `block-editing-note-${activeHtmlBlock.id}`,
              kind: "readonly",
              label: "How to edit",
              value:
                "Double-click the selected text block on the canvas to edit copy. Text controls no longer live in the side panel.",
            },
          ],
        },
      ],
    };
  }, [
    activeHtmlBlock,
    activeHtmlBlockCanvasTransform,
    extractSelectionAsModule,
    pageInspectorSchema,
    selection.activePageId,
  ]);

  const visualInspectorSchema = useMemo<InspectorSchema | null>(() => {
    if (!activeHtmlVisualNode) {
      return pageInspectorSchema;
    }

    return {
      id: "visual-inspector",
      title: "Visual module",
      description: "Treat each annotation, surface, divider, or frame as an addressable design node.",
      sections: [
        {
          id: "selected-node",
          title: "Selected module",
          fields: [
            ...(activeHtmlVisualNode.moduleLabel
              ? [
                  {
                    id: `node-module-${activeHtmlVisualNode.id}`,
                    kind: "readonly" as const,
                    label: "Applied capability",
                    value: activeHtmlVisualNode.moduleLabel,
                  },
                ]
              : []),
            {
              id: "node-kind",
              kind: "readonly",
              label: "Kind",
              value: activeHtmlVisualNode.kind,
            },
            {
              id: `node-canvas-mode-${activeHtmlVisualNode.id}`,
              kind: "readonly",
              label: "Canvas mode",
              value: activeHtmlVisualCanvasTransform
                ? `Freeform · ${Math.round(activeHtmlVisualCanvasTransform.frame.x)}, ${Math.round(activeHtmlVisualCanvasTransform.frame.y)}`
                : "Flow layout",
              description: activeHtmlVisualCanvasTransform
                ? "This visual node is currently placed freely on the canvas."
                : "This visual node is following the page flow.",
            },
            {
              id: "node-actions",
              kind: "actions",
              label: "Node actions",
              actions: [
                {
                  id: "duplicate-node",
                  label: "Duplicate",
                  onPress: duplicateSelectedVisualElement,
                },
                {
                  id: "extract-node",
                  label: "Extract as module",
                  onPress: () =>
                    extractSelectionAsModule({
                      kind: "visual",
                      node: activeHtmlVisualNode,
                      contentNodes: activeHtmlVisualContentNodes,
                    }),
                },
                {
                  id: "delete-node",
                  label: "Delete",
                  onPress: deleteSelectedVisualElement,
                  tone: "danger",
                },
              ],
            },
          ],
        },
        ...(recommendedModuleManifests.length > 0
          ? [
              {
                id: "replace-node",
                title: "Replace with module",
                fields: [
                  {
                    id: `replace-node-actions-${activeHtmlVisualNode.id}`,
                    kind: "actions" as const,
                    label: "Published capabilities",
                    description: "Swap the selected visual region onto a published module style and contract.",
                    actions: recommendedModuleManifests.map((manifest) => ({
                      id: `replace-node-${manifest.moduleId}`,
                      label: manifest.label,
                      onPress: () => replaceSelectedVisualWithModule(manifest),
                    })),
                  },
                ],
              },
            ]
          : []),
        {
          id: "new-node",
          title: "Add nearby module",
          fields: [
            {
              id: "add-node-actions",
              kind: "actions",
              label: "Add visual",
              actions: (
                [
                  "surface",
                  "divider",
                  "badge",
                  "highlight",
                  "annotation",
                  "rail",
                  "chart-frame",
                ] as HtmlVisualNodeKind[]
              ).map((kind) => ({
                id: `add-${kind}`,
                label: kind.replace(/-/g, " "),
                onPress: () => addVisualElement(kind),
              })),
            },
          ],
        },
        {
          id: "node-style",
          title: "Style",
          fields: [
            {
              id: "node-background",
              kind: "color",
              label: "Background",
              value: activeHtmlVisualNode.style.background ?? "#ffffff",
              onChange: (value: string) =>
                updateActiveHtmlVisualNodeStyle({ background: value }),
            },
            {
              id: "node-border",
              kind: "color",
              label: "Border",
              value: activeHtmlVisualNode.style.border ?? "#d7d1c6",
              onChange: (value: string) =>
                updateActiveHtmlVisualNodeStyle({ border: value }),
            },
            {
              id: "node-accent",
              kind: "color",
              label: "Accent",
              value: activeHtmlVisualNode.style.accent ?? "#c6994a",
              onChange: (value: string) =>
                updateActiveHtmlVisualNodeStyle({ accent: value }),
            },
            {
              id: "node-opacity",
              kind: "range",
              label: "Opacity",
              value: Math.round((activeHtmlVisualNode.style.opacity ?? 1) * 100),
              min: 10,
              max: 100,
              step: 5,
              onChange: (value: number) =>
                updateActiveHtmlVisualNodeStyle({ opacity: value / 100 }),
            },
            {
              id: "node-radius",
              kind: "number",
              label: "Radius",
              value: Math.round(activeHtmlVisualNode.style.radius ?? 0),
              min: 0,
              max: 48,
              step: 1,
              onChange: (value: number) =>
                updateActiveHtmlVisualNodeStyle({ radius: value }),
            },
            {
              id: "node-padding",
              kind: "number",
              label: "Padding",
              value: Math.round(activeHtmlVisualNode.style.padding ?? 0),
              min: 0,
              max: 64,
              step: 1,
              onChange: (value: number) =>
                updateActiveHtmlVisualNodeStyle({ padding: value }),
            },
            {
              id: "node-width",
              kind: "number",
              label: "Width %",
              value: Math.round(activeHtmlVisualNode.style.widthPercent ?? 100),
              min: 10,
              max: 100,
              step: 1,
              onChange: (value: number) =>
                updateActiveHtmlVisualNodeStyle({ widthPercent: value }),
            },
          ],
        },
        ...(activeHtmlVisualContentNodes.length
          ? [
              {
                id: "node-content",
                title: "Content nodes",
                fields: activeHtmlVisualContentNodes.flatMap((contentNode) => [
                  {
                    id: `content-${contentNode.id}`,
                    kind: "readonly" as const,
                    label: `${contentNode.kind}`,
                    value: contentNode.text,
                  },
                  {
                    id: `content-actions-${contentNode.id}`,
                    kind: "actions" as const,
                    label: "Content actions",
                    actions: [
                      {
                        id: `duplicate-${contentNode.id}`,
                        label: "Duplicate",
                        onPress: () => duplicateVisualContentElement(contentNode.id),
                      },
                      {
                        id: `delete-${contentNode.id}`,
                        label: "Delete",
                        onPress: () => deleteVisualContentElement(contentNode.id),
                        tone: "danger" as const,
                      },
                    ],
                  },
                ]),
              },
            ]
          : []),
      ],
    };
  }, [
    activeHtmlVisualContentNodes,
    activeHtmlVisualNode,
    activeHtmlVisualCanvasTransform,
    extractSelectionAsModule,
    pageInspectorSchema,
    recommendedModuleManifests,
    replaceSelectedVisualWithModule,
  ]);

  const layoutInspectorSchema = useMemo<InspectorSchema | null>(() => {
    if (!activeHtmlLayoutZone) {
      return pageInspectorSchema;
    }

    return {
      id: "layout-inspector",
      title: "Layout zone",
      description: "Layout balancing now happens on the canvas. Select the zone and drag the divider handle directly.",
      sections: [
        {
          id: "layout-meta",
          title: "Zone",
          fields: [
            {
              id: `zone-extract-${activeHtmlLayoutZone.id}`,
              kind: "actions",
              label: "Authoring handoff",
              actions: [
                {
                  id: `extract-zone-${activeHtmlLayoutZone.id}`,
                  label: "Extract as module",
                  onPress: () =>
                    extractSelectionAsModule({
                      kind: "layout",
                      zone: activeHtmlLayoutZone,
                    }),
                },
              ],
            },
            {
              id: `zone-kind-${activeHtmlLayoutZone.id}`,
              kind: "readonly",
              label: "Zone kind",
              value: activeHtmlLayoutZone.kind,
            },
            {
              id: `zone-split-${activeHtmlLayoutZone.id}`,
              kind: "readonly",
              label: "Current split",
              value: `${Math.round(activeHtmlLayoutZone.splitPercent)}% / ${100 - Math.round(activeHtmlLayoutZone.splitPercent)}%`,
            },
            {
              id: `zone-layout-note-${activeHtmlLayoutZone.id}`,
              kind: "readonly",
              label: "How to edit",
              value:
                "Use the divider handle on the canvas to rebalance this layout zone. The side panel no longer owns layout dragging.",
            },
          ],
        },
      ],
    };
  }, [activeHtmlLayoutZone, extractSelectionAsModule, pageInspectorSchema]);

  const inspectorSchema = useMemo(() => {
    if (shell.inspectorTab === "text") {
      return textInspectorSchema;
    }
    if (shell.inspectorTab === "visual") {
      return visualInspectorSchema;
    }
    if (shell.inspectorTab === "layout") {
      return layoutInspectorSchema;
    }
    return pageInspectorSchema;
  }, [
    layoutInspectorSchema,
    pageInspectorSchema,
    shell.inspectorTab,
    textInspectorSchema,
    visualInspectorSchema,
  ]);

  const canvasScaleLabel = `${Math.round(resolvedCanvasScale * 100)}%`;
  const activeSidebarTab = useMemo(
    () => (shell.canvasDrawer && shell.canvasDrawer !== "pages" ? shell.canvasDrawer : shell.inspectorTab),
    [shell.canvasDrawer, shell.inspectorTab],
  );
  const activeSidebarTitle = useMemo(() => {
    if (activeSidebarTab === "history") {
      return "History";
    }
    if (activeSidebarTab === "export") {
      return "Export";
    }
    if (activeSidebarTab === "text") {
      return "Text";
    }
    if (activeSidebarTab === "visual") {
      return "Visual";
    }
    if (activeSidebarTab === "layout") {
      return "Layout";
    }
    return "Page";
  }, [activeSidebarTab]);

  const routeProjectExists = useMemo(() => {
    if (!projectId) {
      return true;
    }

    return Boolean(library.snapshot && findProjectLocation(library.snapshot, projectId));
  }, [library.snapshot, projectId]);
  const toolbarButtonClass =
    "inline-flex h-8 items-center gap-2 border border-transparent px-2.5 text-[11px] font-medium tracking-[0.02em] text-[var(--studio-ink)] transition hover:border-[var(--studio-line)] hover:bg-[rgba(255,255,255,0.04)] disabled:cursor-not-allowed disabled:opacity-35";
  const toolbarToggleClass =
    "inline-flex h-8 items-center gap-2 border px-2.5 text-[11px] font-medium tracking-[0.02em] transition";
  const sidebarTabClass =
    "border-b border-transparent px-0 pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--studio-muted-strong)] transition hover:text-[var(--studio-ink)]";
  const sidebarActionClass =
    "inline-flex h-9 items-center border border-[var(--studio-line)] px-3 text-[11px] font-medium tracking-[0.02em] text-[var(--studio-ink)] transition hover:border-[rgba(0,242,255,0.28)] hover:bg-[rgba(0,242,255,0.06)] disabled:cursor-not-allowed disabled:opacity-35";
  const canvasMoreButtonRect =
    canvasMoreOpen && canvasMoreButtonRef.current
      ? canvasMoreButtonRef.current.getBoundingClientRect()
      : null;

  if (shell.bootState === "booting") {
    return (
      <article className="studio-terminal-root flex h-screen items-center justify-center px-6 text-[var(--studio-ink)]">
        <div className="studio-terminal-panel px-8 py-7">
          <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--studio-muted)]">
            PPT Studio
          </div>
          <div className="mt-4 text-[1.14rem] font-semibold tracking-[-0.03em]">
            Opening project editor
          </div>
        </div>
      </article>
    );
  }

  if (shell.bootState === "error") {
    return (
      <article className="studio-terminal-root flex h-screen items-center justify-center px-6 text-[var(--studio-ink)]">
        <div className="studio-terminal-panel max-w-xl px-8 py-7">
          <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--studio-accent)]">
            Studio failed to load
          </div>
          <div className="mt-4 text-[1.14rem] font-semibold tracking-[-0.03em]">
            {shell.lastError ?? "Unknown error"}
          </div>
        </div>
      </article>
    );
  }

  if (!routeProjectExists) {
    return (
      <article className="studio-terminal-root flex h-screen items-center justify-center px-6 text-[var(--studio-ink)]">
        <div className="studio-terminal-panel max-w-xl px-8 py-7">
          <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--studio-muted)]">
            Project not found
          </div>
          <div className="mt-4 text-[1.14rem] font-semibold tracking-[-0.03em]">
            The requested project is not available in this Studio library.
          </div>
          <button
            type="button"
            onClick={() => navigate("/", { replace: true })}
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-[rgba(0,242,255,0.35)] bg-[rgba(0,242,255,0.08)] px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-ink)] transition hover:bg-[rgba(0,242,255,0.16)]"
          >
            Back to home
            <ArrowLeft className="h-4 w-4 text-[var(--studio-accent)]" />
          </button>
        </div>
      </article>
    );
  }

  if (!project || !draft) {
    return null;
  }

  return (
    <article className="studio-terminal-root h-screen overflow-hidden text-[var(--studio-ink)]">
      <div
        className={[
          "studio-edit-layout h-full",
          shell.editView === "canvas" ? "studio-edit-layout--canvas" : "",
        ].join(" ")}
      >
        {shell.editView === "canvas" ? null : (
          <aside className="studio-edit-gutter border-r border-[var(--studio-line)] bg-[linear-gradient(180deg,#050505_0%,#000_100%)] px-5 py-6">
            <div className="space-y-6">
              <div>
                <div className="text-[18px] font-extrabold tracking-[0.08em] text-[var(--studio-ink)]">
                  PPT STUDIO
                </div>
                <div className="mt-2 text-[10px] uppercase tracking-[0.42em] text-[var(--studio-muted)]">
                  CHAT // CANVAS
                </div>
              </div>

              <div className="studio-terminal-panel-soft px-4 py-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--studio-muted)]">
                  Workspace
                </div>
                <div className="mt-3 text-[1rem] font-semibold text-[var(--studio-ink)]">
                  {documentState.workspaceName}
                </div>
                <div className="mt-2 text-[12px] leading-6 text-[var(--studio-muted-strong)]">
                  {generatedHtmlReport?.pageCount ?? project.pages.length} pages
                </div>
              </div>

              <div className="studio-terminal-panel-soft px-4 py-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--studio-muted)]">
                  Status
                </div>
                <div className="mt-3 text-[12px] leading-6 text-[var(--studio-muted-strong)]">
                  {formatSaveStatus(historyState.saveState, historyState.lastSavedAt)}
                </div>
                <div className="mt-3 rounded-full border border-[rgba(0,242,255,0.28)] bg-[rgba(0,242,255,0.08)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--studio-ink)]">
                  {project.workflowStage === "generated" ? "Deck generated" : "Awaiting draft"}
                </div>
              </div>

              <div className="text-[11px] leading-6 text-[var(--studio-muted-strong)]">
                The left rail stays intentionally quiet. The working conversation lives in the center, and the editable deck lives on the right.
              </div>
            </div>
          </aside>
        )}

        {shell.editView === "canvas" ? null : (
          <section className="studio-edit-chat min-h-0 border-r border-[var(--studio-line)] bg-[rgba(6,6,6,0.94)]">
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-[var(--studio-line)] px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={returnToHome}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--studio-line)] bg-[rgba(255,255,255,0.03)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-ink)] transition hover:border-[rgba(0,242,255,0.3)] hover:bg-[rgba(0,242,255,0.06)]"
                  >
                    <ArrowLeft className="h-4 w-4 text-[var(--studio-accent)]" />
                    Back to home
                  </button>
                  <div className="text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--studio-muted)]">
                      Conversation
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--studio-muted-strong)]">
                      {project.briefMessages.length} user turns
                    </div>
                  </div>
                </div>

                  <div className="mt-4">
                  <div className="truncate text-[1.2rem] font-semibold tracking-[-0.03em] text-[var(--studio-ink)]">
                    {displayProjectTitle}
                  </div>
                  <div className="mt-2 text-[13px] leading-6 text-[var(--studio-muted-strong)]">
                    {shell.statusLine || intakeStatusLine}
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                <div className="space-y-3">
                  {intakeMessages.map((message, index) => (
                    <div
                      key={`${project.id}-${index}`}
                      className={[
                        "max-w-[88%] rounded-[22px] border px-4 py-3 text-[13px] leading-6",
                        message.role === "assistant"
                          ? "border-[var(--studio-line)] bg-[rgba(255,255,255,0.03)] text-[var(--studio-ink)]"
                          : "ml-auto border-[rgba(0,242,255,0.28)] bg-[rgba(0,242,255,0.08)] text-[var(--studio-ink)]",
                      ].join(" ")}
                    >
                      {message.text}
                    </div>
                  ))}
                  {longFormClarification.status !== "idle" && longFormClarification.trigger ? (
                    <>
                      <div className="max-w-[92%] rounded-[22px] border border-[var(--studio-line)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-[13px] leading-6 text-[var(--studio-ink)]">
                        <div>{clarificationPrompt}</div>
                        {longFormClarification.status === "pending" ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {clarificationOptions.map((option) => (
                              <button
                                key={option.resolution}
                                type="button"
                                onClick={() => void handleLongFormClarificationChoice(option.resolution)}
                                disabled={brief.isGeneratingReport || streamUi.isStreaming || isDeckReviewLocked}
                                className="inline-flex items-center rounded-full border border-[var(--studio-line)] bg-[rgba(255,255,255,0.03)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--studio-ink)] transition hover:border-[rgba(0,242,255,0.28)] hover:bg-[rgba(0,242,255,0.08)] disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      {clarificationReceipt ? (
                        <div className="ml-auto max-w-[88%] rounded-[22px] border border-[rgba(0,242,255,0.28)] bg-[rgba(0,242,255,0.08)] px-4 py-3 text-[13px] leading-6 text-[var(--studio-ink)]">
                          {clarificationReceipt}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {streamUi.transcriptRendered ? (
                    <div className="max-w-[92%] border border-[var(--studio-line)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-[13px] leading-6 whitespace-pre-wrap text-[var(--studio-ink)]">
                      {streamUi.transcriptRendered}
                    </div>
                  ) : null}
                  {streamUi.error ? (
                    <div className="max-w-[92%] border border-[rgba(255,120,120,0.28)] bg-[rgba(255,120,120,0.08)] px-4 py-3 text-[13px] leading-6 text-[#ffc4c4]">
                      {streamUi.error}
                    </div>
                  ) : null}
                  {deckReview.warning && !isDeckReviewLocked ? (
                    <div className="max-w-[92%] rounded-[22px] border border-[rgba(255,184,0,0.26)] bg-[rgba(24,20,10,0.9)] px-4 py-3 text-[13px] leading-6 text-[#f7e7b2]">
                      {deckReview.warning}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="border-t border-[var(--studio-line)] px-5 py-4">
                <Textarea
                  value={chatInput}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                    setChatInput(event.target.value)
                  }
                  disabled={isDeckReviewLocked}
                  placeholder="Ask for a rewrite, add a new page, change the tone, or restructure the deck."
                  className="min-h-[140px] border-[var(--studio-line)] bg-[rgba(255,255,255,0.03)] px-4 py-4 text-[14px] leading-7 text-[var(--studio-ink)] placeholder:text-[var(--studio-muted)]"
                />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-3">
                    <div className="text-[12px] leading-6 text-[var(--studio-muted-strong)]">
                      {streamUi.isStreaming
                        ? streamUi.stage || "Codex is generating the deck page by page."
                        : "Keep talking naturally. Every new request updates the same project thread."}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {MODULE_USAGE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => updateProjectModuleUsageMode(option.value)}
                          disabled={brief.isGeneratingReport || isDeckReviewLocked}
                          className={[
                            "inline-flex items-center rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition disabled:cursor-not-allowed disabled:opacity-40",
                            project.moduleUsageMode === option.value
                              ? "border-[rgba(0,242,255,0.35)] bg-[rgba(0,242,255,0.1)] text-[var(--studio-ink)]"
                              : "border-[var(--studio-line)] bg-[rgba(255,255,255,0.03)] text-[var(--studio-muted-strong)] hover:border-[rgba(0,242,255,0.2)] hover:text-[var(--studio-ink)]",
                          ].join(" ")}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {streamUi.isStreaming ? (
                      <button
                        type="button"
                        onClick={cancelStreamingGeneration}
                        className="inline-flex items-center gap-2 border border-[rgba(255,120,120,0.28)] bg-[rgba(255,120,120,0.08)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#ffc4c4] transition hover:bg-[rgba(255,120,120,0.14)]"
                      >
                        Cancel
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void continueConversation(chatInput)}
                      disabled={!chatInput.trim() || brief.isGeneratingReport || isDeckReviewLocked}
                      className="inline-flex items-center gap-2 rounded-full border border-[rgba(0,242,255,0.35)] bg-[rgba(0,242,255,0.1)] px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-ink)] transition hover:bg-[rgba(0,242,255,0.16)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {brief.isGeneratingReport ? "Generating..." : "Send"}
                      <SendHorizontal className="h-4 w-4 text-[var(--studio-accent)]" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="studio-edit-canvas min-h-0 overflow-hidden bg-[rgba(5,5,5,0.98)]">
          <div className="studio-editor-shell">
            <header className="studio-editor-toolbar px-4">
              <div className="flex h-full items-center gap-2 overflow-x-auto">
                {hasStreamingPreview ? (
                  <>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                      {streamUi.isStreaming ? streamUi.stage || "Streaming preview" : "Preview frozen"}
                    </div>

                    <div className="h-4 w-px shrink-0 bg-[var(--studio-line)]" />

                    <button
                      type="button"
                      onClick={() => setPagesStripVisible((current) => !current)}
                      className={[
                        toolbarToggleClass,
                        pagesStripVisible
                          ? "border-[rgba(0,242,255,0.3)] text-[var(--studio-ink)]"
                          : "border-transparent text-[var(--studio-ink)] hover:border-[var(--studio-line)] hover:bg-[rgba(255,255,255,0.04)]",
                      ].join(" ")}
                    >
                      Pages
                    </button>
                    <button
                      type="button"
                      onClick={() => setCanvasView(shell.editView === "canvas" ? "split" : "canvas")}
                      className={toolbarButtonClass}
                    >
                      {shell.editView === "canvas" ? (
                        <Minimize2 className="h-3.5 w-3.5 text-[var(--studio-accent)]" />
                      ) : (
                        <Maximize2 className="h-3.5 w-3.5 text-[var(--studio-accent)]" />
                      )}
                      {shell.editView === "canvas" ? "Exit full screen" : "Full screen"}
                    </button>
                    {streamUi.isStreaming ? (
                      <button
                        type="button"
                        onClick={cancelStreamingGeneration}
                        className="inline-flex h-8 items-center border border-[rgba(255,120,120,0.28)] px-2.5 text-[11px] font-medium tracking-[0.02em] text-[#ffc4c4] transition hover:bg-[rgba(255,120,120,0.08)]"
                      >
                        Cancel
                      </button>
                    ) : streamUi.error ? (
                      <button
                        type="button"
                        onClick={() => {
                          resetStreamUi();
                          void regenerateReportContent();
                        }}
                        className={toolbarButtonClass}
                      >
                        Retry
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={undo}
                        disabled={isDeckReviewLocked || !historyState.undoStack.length}
                        className={toolbarButtonClass}
                      >
                        Undo
                      </button>
                      <button
                        type="button"
                        onClick={redo}
                        disabled={isDeckReviewLocked || !historyState.redoStack.length}
                        className={toolbarButtonClass}
                      >
                        Redo
                      </button>
                    </div>

                    <div className="h-4 w-px shrink-0 bg-[var(--studio-line)]" />

                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => zoomCanvasBy(-0.08)} className={toolbarButtonClass}>
                        -
                      </button>
                      <button
                        type="button"
                        onClick={resetCanvasScale}
                        className="inline-flex h-8 items-center border border-[var(--studio-line)] px-2.5 text-[11px] font-medium tracking-[0.02em] text-[var(--studio-muted-strong)] transition hover:border-[rgba(0,242,255,0.28)] hover:text-[var(--studio-ink)]"
                      >
                        {canvasScaleLabel}
                      </button>
                      <button type="button" onClick={() => zoomCanvasBy(0.08)} className={toolbarButtonClass}>
                        +
                      </button>
                      <button type="button" onClick={resetCanvasScale} className={toolbarButtonClass}>
                        Fit
                      </button>
                    </div>

                    <div className="h-4 w-px shrink-0 bg-[var(--studio-line)]" />

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (isDeckReviewLocked) {
                            return;
                          }
                          if (propertiesVisible) {
                            setPropertiesVisible(false);
                            return;
                          }
                          openPropertiesPanel();
                        }}
                        className={[
                          toolbarToggleClass,
                          propertiesVisible
                            ? "border-[rgba(0,242,255,0.3)] text-[var(--studio-ink)]"
                            : "border-transparent text-[var(--studio-ink)] hover:border-[var(--studio-line)] hover:bg-[rgba(255,255,255,0.04)]",
                        ].join(" ")}
                        disabled={isDeckReviewLocked}
                      >
                        Properties
                      </button>
                      <button
                        type="button"
                        onClick={() => setPagesStripVisible((current) => !current)}
                        className={[
                          toolbarToggleClass,
                          pagesStripVisible
                            ? "border-[rgba(0,242,255,0.3)] text-[var(--studio-ink)]"
                            : "border-transparent text-[var(--studio-ink)] hover:border-[var(--studio-line)] hover:bg-[rgba(255,255,255,0.04)]",
                        ].join(" ")}
                      >
                        Pages
                      </button>
                      <button
                        type="button"
                        onClick={() => setCanvasView(shell.editView === "canvas" ? "split" : "canvas")}
                        className={toolbarButtonClass}
                      >
                        {shell.editView === "canvas" ? (
                          <Minimize2 className="h-3.5 w-3.5 text-[var(--studio-accent)]" />
                        ) : (
                          <Maximize2 className="h-3.5 w-3.5 text-[var(--studio-accent)]" />
                        )}
                        {shell.editView === "canvas" ? "Exit full screen" : "Full screen"}
                      </button>
                    </div>

                    <div className="ml-auto">
                      <button
                        ref={canvasMoreButtonRef}
                        type="button"
                        onClick={() => setCanvasMoreOpen((current) => !current)}
                        data-testid="editor-actions-button"
                        className={toolbarButtonClass}
                        disabled={isDeckReviewLocked}
                      >
                        Actions
                      </button>
                    </div>
                    {canvasMoreOpen && canvasMoreButtonRect
                      ? createPortal(
                          <div
                            ref={canvasMoreMenuRef}
                            className="fixed z-[90] w-56 border border-[var(--studio-line)] bg-[rgba(8,8,8,0.98)] p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.3)]"
                            style={{
                              top: canvasMoreButtonRect.bottom + 8,
                              left: Math.max(12, canvasMoreButtonRect.right - 224),
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setCanvasMoreOpen(false);
                                void regenerateReportContent();
                              }}
                              disabled={brief.isGeneratingReport || isDeckReviewLocked}
                              className="flex h-9 w-full items-center px-3 text-left text-[12px] text-[var(--studio-ink)] transition hover:bg-[rgba(255,255,255,0.04)] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {brief.isGeneratingReport ? "Regenerating..." : "Regenerate"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCanvasMoreOpen(false);
                                void openPublishedReport();
                              }}
                              className="flex h-9 w-full items-center px-3 text-left text-[12px] text-[var(--studio-ink)] transition hover:bg-[rgba(255,255,255,0.04)]"
                            >
                              Open published
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCanvasMoreOpen(false);
                                void downloadCurrentHtml();
                              }}
                              data-testid="action-export-html"
                              disabled={!generatedHtmlReport}
                              className="flex h-9 w-full items-center px-3 text-left text-[12px] text-[var(--studio-ink)] transition hover:bg-[rgba(255,255,255,0.04)] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Export HTML
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCanvasMoreOpen(false);
                                void downloadCurrentPptx();
                              }}
                              data-testid="action-export-pptx"
                              disabled={!generatedHtmlReport}
                              className="flex h-9 w-full items-center px-3 text-left text-[12px] text-[var(--studio-ink)] transition hover:bg-[rgba(255,255,255,0.04)] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Export PPTX
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCanvasMoreOpen(false);
                                openSidebarTab("export");
                              }}
                              className="flex h-9 w-full items-center px-3 text-left text-[12px] text-[var(--studio-ink)] transition hover:bg-[rgba(255,255,255,0.04)]"
                            >
                              Import / export bundle
                            </button>
                          </div>,
                          document.body,
                        )
                      : null}
                  </>
                )}
              </div>
            </header>

            <div className="studio-editor-main">
              <div className="relative min-h-0 flex-1 overflow-hidden bg-[rgba(5,5,5,0.98)]">
                {hasStreamingPreview ? (
                  <>
                    <StreamingReportCanvasView
                      deckTitle={displayProjectTitle}
                      pages={streamUi.partialPages}
                      selectedPageNumber={currentCanvasPageNumber}
                      onVisiblePageChange={(pageNumber) =>
                        setCurrentCanvasPageId(String(pageNumber))
                      }
                    />

                    <div className="pointer-events-none absolute bottom-5 left-5 z-10 flex flex-wrap items-center gap-2">
                      <div className="border border-[rgba(0,242,255,0.22)] bg-[rgba(5,9,11,0.88)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-ink)]">
                        {streamUi.isStreaming ? (
                          <span className="inline-flex items-center gap-2">
                            <RefreshCcw className="h-4 w-4 animate-spin text-[var(--studio-accent)]" />
                            {streamUi.stage || "Streaming preview"}
                          </span>
                        ) : (
                          streamUi.stage || "Streaming preview paused"
                        )}
                      </div>
                      <div className="border border-[var(--studio-line)] bg-[rgba(5,5,5,0.88)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-muted-strong)]">
                        {streamUi.partialPages.filter((page) => page.status === "ready").length}
                        {" / "}
                        {streamUi.expectedPageCount || streamUi.partialPages.length} pages ready
                      </div>
                    </div>
                  </>
                ) : brief.isGeneratingReport && !generatedHtmlReport ? (
                  <div className="flex h-full items-center justify-center px-8 py-10">
                    <div className="max-w-xl text-center">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--studio-muted)]">
                        Generating
                      </div>
                      <div className="mt-4 text-[1.5rem] font-semibold tracking-[-0.04em] text-[var(--studio-ink)]">
                        Codex is building the first editable draft
                      </div>
                      <div className="mt-3 text-[14px] leading-7 text-[var(--studio-muted-strong)]">
                        The generation pipeline is calling the Studio model route now. Large decks usually
                        take around 30 to 90 seconds before the first canvas appears.
                      </div>
                      <div className="mt-6 inline-flex items-center gap-2 border border-[rgba(0,242,255,0.3)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--studio-ink)]">
                        <RefreshCcw className="h-4 w-4 animate-spin text-[var(--studio-accent)]" />
                        Waiting for /api/studio/generate-html
                      </div>
                    </div>
                  </div>
                ) : generatedHtmlReport ? (
                  <>
                    <WorkbenchReportView
                      pages={project.pages}
                      draft={draft}
                      workflowStage={project.workflowStage}
                      rootId="studio-main"
                      htmlReport={generatedHtmlReport}
                      mode="immersive"
                      selectedHtmlPageNumber={currentCanvasPageNumber}
                      selectedHtmlBlockId={selection.selectedHtmlBlockId}
                      selectedHtmlVisualNodeId={selection.selectedVisualNodeId}
                      selectedHtmlLayoutZoneId={selection.selectedLayoutZoneId}
                      onSelectHtmlBlock={isDeckReviewLocked ? undefined : selectHtmlBlock}
                      onSelectHtmlVisualNode={
                        isDeckReviewLocked
                          ? undefined
                          : (pageNumber, nodeId, _kind) =>
                              selectVisualNode(pageNumber, nodeId)
                      }
                      onSelectHtmlLayoutZone={
                        isDeckReviewLocked
                          ? undefined
                          : (pageNumber, zoneId, _kind: HtmlLayoutZoneKind) =>
                              selectLayoutZone(pageNumber, zoneId)
                      }
                      onCommitHtmlLayoutZone={isDeckReviewLocked ? undefined : commitHtmlLayoutZone}
                      onQuickEditHtmlBlock={
                        isDeckReviewLocked
                          ? undefined
                          : (pageNumber, blockId, nextContent) => {
                              selectHtmlBlock(pageNumber, blockId);
                              updateHtmlBlockOnPage(pageNumber, blockId, nextContent);
                            }
                      }
                      onCommitHtmlBlockTransform={
                        isDeckReviewLocked
                          ? undefined
                          : (pageNumber, blockId, frame, fontSize) => {
                              selectHtmlBlock(pageNumber, blockId);
                              updateHtmlBlockTransformOnPage(pageNumber, blockId, frame, fontSize);
                            }
                      }
                      onCommitHtmlVisualTransform={
                        isDeckReviewLocked
                          ? undefined
                          : (pageNumber, nodeId, frame) => {
                              selectVisualNode(pageNumber, nodeId);
                              updateHtmlVisualTransformOnPage(pageNumber, nodeId, frame);
                            }
                      }
                      onHtmlPageOverflow={handleHtmlPageOverflow}
                      onHtmlPageMeasurement={handleHtmlPageMeasurement}
                      scaleMode={shell.canvasScaleMode}
                      scale={shell.canvasScale}
                      onResolvedScaleChange={setResolvedCanvasScale}
                      onVisiblePageChange={(pageNumber) =>
                        setCurrentCanvasPageId(String(pageNumber))
                      }
                    />

                    {brief.isGeneratingReport ? (
                      <div className="pointer-events-none absolute bottom-5 left-5 z-10 border border-[rgba(0,242,255,0.22)] bg-[rgba(5,9,11,0.88)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-ink)]">
                        <span className="inline-flex items-center gap-2">
                          <RefreshCcw className="h-4 w-4 animate-spin text-[var(--studio-accent)]" />
                          Updating deck
                        </span>
                      </div>
                    ) : null}

                    {isDeckReviewLocked ? (
                      <div
                        data-testid="deck-review-status"
                        data-review-phase={deckReview.phase}
                        className="absolute bottom-5 left-5 z-10 flex flex-wrap items-center gap-2"
                      >
                        <div className="pointer-events-none border border-[rgba(0,242,255,0.22)] bg-[rgba(5,9,11,0.88)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-ink)]">
                          <span className="inline-flex items-center gap-2">
                            <RefreshCcw className="h-4 w-4 animate-spin text-[var(--studio-accent)]" />
                            {deckReview.phase === "repairing" ? "Optimizing" : "Reviewing"}
                          </span>
                        </div>
                        <div className="pointer-events-none border border-[var(--studio-line)] bg-[rgba(5,5,5,0.88)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-muted-strong)]">
                          {deckReview.stage || "Checking page fit"}
                        </div>
                        <button
                          type="button"
                          onClick={() => stopDeckOptimization()}
                          data-testid="stop-optimizing"
                          className="pointer-events-auto border border-[rgba(255,184,0,0.28)] bg-[rgba(28,20,10,0.92)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f7e7b2] transition hover:bg-[rgba(42,30,16,0.96)]"
                        >
                          Stop optimizing
                        </button>
                      </div>
                    ) : null}

                    {(!isDeckReviewLocked && (deckReview.warning || currentPageMeasurement)) ? (
                      <div className="absolute bottom-5 left-5 z-10 flex flex-wrap items-center gap-2">
                        {deckReview.warning ? (
                          <div className="pointer-events-none border border-[rgba(255,184,0,0.26)] bg-[rgba(24,20,10,0.9)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f7e7b2]">
                            {deckReview.warning}
                          </div>
                        ) : null}
                        {currentPageMeasurement ? (
                          <button
                            type="button"
                            onClick={() => void optimizeCurrentPage()}
                            data-testid="optimize-current-page"
                            className="border border-[rgba(0,242,255,0.28)] bg-[rgba(5,9,11,0.9)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--studio-ink)] transition hover:bg-[rgba(8,15,18,0.96)] disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            {`Optimize page ${currentPageMeasurement.pageNumber}`}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center px-8 py-10">
                    <div className="max-w-xl text-center">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--studio-muted)]">
                        Canvas ready
                      </div>
                      <div className="mt-4 text-[1.5rem] font-semibold tracking-[-0.04em] text-[var(--studio-ink)]">
                        Generate the first deck to unlock the full editor
                      </div>
                      <div className="mt-3 text-[14px] leading-7 text-[var(--studio-muted-strong)]">
                        Once the first HTML report lands, this area becomes the full PPT canvas with
                        text, visual, and layout editing.
                      </div>
                      <button
                        type="button"
                        onClick={() => void continueConversation()}
                        disabled={!project.sourceText.trim() || brief.isGeneratingReport}
                        className="mt-6 inline-flex items-center gap-2 border border-[rgba(0,242,255,0.35)] bg-[rgba(0,242,255,0.1)] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-ink)] transition hover:bg-[rgba(0,242,255,0.16)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <WandSparkles className="h-4 w-4 text-[var(--studio-accent)]" />
                        Generate first draft
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {propertiesVisible && !hasStreamingPreview && !isDeckReviewLocked ? (
                <aside className="studio-editor-sidebar border-l border-[var(--studio-line)]">
                  <div className="flex h-full min-h-0 flex-col bg-[rgba(4,4,4,0.96)]">
                    <div className="border-b border-[var(--studio-line)] px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                            {activeSidebarTitle}
                          </div>
                          <div className="mt-1 text-[12px] leading-5 text-[var(--studio-muted-strong)]">
                            {activeSidebarTab === "history"
                              ? `${historyEntries.length} timeline entries`
                              : activeSidebarTab === "export"
                                ? "Bundles, HTML, and publish tools"
                                : currentCanvasPageTitle || `Page ${currentCanvasPageNumber}`}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPropertiesVisible(false)}
                          className="inline-flex h-7 items-center border border-[var(--studio-line)] px-2 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--studio-muted-strong)] transition hover:border-[rgba(0,242,255,0.28)] hover:text-[var(--studio-ink)]"
                        >
                          Hide
                        </button>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-[var(--studio-line-soft)] pt-3">
                        {SIDEBAR_TABS.map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => openSidebarTab(tab.id)}
                            className={[
                              sidebarTabClass,
                              activeSidebarTab === tab.id
                                ? "border-[rgba(0,242,255,0.8)] text-[var(--studio-ink)]"
                                : "",
                            ].join(" ")}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto">
                      {activeSidebarTab === "history" ? (
                        <div className="h-full px-4 py-3">
                          <WorkbenchStudioVirtualList
                            items={historyEntries}
                            itemKey={(entry) => entry.id}
                            estimateSize={84}
                            threshold={7}
                            height="100%"
                            className="pr-1"
                            renderItem={(entry) => (
                              <div className="border-b border-[var(--studio-line-soft)] py-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                                      {entry.kind}
                                    </div>
                                    <div className="mt-1 text-[13px] font-semibold text-[var(--studio-ink)]">
                                      {entry.label}
                                    </div>
                                    <div className="mt-1 text-[12px] leading-5 text-[var(--studio-muted-strong)]">
                                      {entry.detail}
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-[var(--studio-muted)]">
                                    {formatVersionTimestamp(entry.createdAt)}
                                  </div>
                                </div>
                              </div>
                            )}
                          />
                        </div>
                      ) : activeSidebarTab === "export" ? (
                        <div className="space-y-6 px-4 py-4">
                          <section className="border-b border-[var(--studio-line-soft)] pb-5">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                              Export
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button type="button" onClick={() => void copyProjectBundleJson()} className={sidebarActionClass}>
                                Copy project bundle
                              </button>
                              <button type="button" onClick={() => void copyWorkspaceBundleJson()} className={sidebarActionClass}>
                                Copy workspace bundle
                              </button>
                              <button
                                type="button"
                                onClick={() => void downloadCurrentHtml()}
                                data-testid="sidebar-export-html"
                                disabled={!generatedHtmlReport}
                                className={sidebarActionClass}
                              >
                                Download HTML
                              </button>
                              <button
                                type="button"
                                onClick={() => void downloadCurrentPptx()}
                                data-testid="sidebar-export-pptx"
                                disabled={!generatedHtmlReport}
                                className={sidebarActionClass}
                              >
                                Download PPTX
                              </button>
                              <button type="button" onClick={() => void openPublishedReport()} className={sidebarActionClass}>
                                Open published
                              </button>
                            </div>
                          </section>

                          {lastPptxExportResult ? (
                            <section className="border-b border-[var(--studio-line-soft)] pb-5">
                              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                                Latest PPTX export
                              </div>
                              <div className="mt-3 text-[12px] leading-6 text-[var(--studio-muted-strong)]">
                                {lastPptxExportResult.fileName} · {lastPptxExportResult.slideCount} slides
                              </div>
                              {lastPptxExportResult.warnings.length > 0 ? (
                                <div className="mt-3 space-y-2">
                                  {lastPptxExportResult.warnings.slice(0, 8).map((warning, index) => (
                                    <div
                                      key={`${warning.code}-${warning.pageNumber ?? 0}-${index}`}
                                      className="border border-[rgba(255,184,0,0.22)] bg-[rgba(24,20,10,0.74)] px-3 py-3 text-[12px] leading-6 text-[#f7e7b2]"
                                    >
                                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f0d58f]">
                                        {warning.pageNumber ? `Page ${warning.pageNumber}` : "Deck"} · {warning.code}
                                      </div>
                                      <div className="mt-1">
                                        {formatPptxWarningSummary(warning.code)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="mt-3 border border-[rgba(0,242,255,0.2)] bg-[rgba(0,242,255,0.06)] px-3 py-3 text-[12px] leading-6 text-[var(--studio-ink)]">
                                  The latest PPTX export completed without export notes.
                                </div>
                              )}
                            </section>
                          ) : null}

                          <section className="border-b border-[var(--studio-line-soft)] pb-5">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                              Import bundle
                            </div>
                            <textarea
                              value={bundleInput}
                              onChange={(event) => setBundleInput(event.target.value)}
                              placeholder="Paste a project or workspace bundle JSON here."
                              className="mt-3 min-h-[220px] w-full border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-3 py-3 text-[13px] leading-6 text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.35)]"
                            />
                            <div className="mt-3">
                              <button
                                type="button"
                                onClick={() => void handleImportBundle()}
                                className={sidebarActionClass}
                              >
                                Import bundle
                              </button>
                            </div>
                          </section>

                          <section>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                              Local-first notes
                            </div>
                            <div className="mt-3 space-y-2 text-[12px] leading-6 text-[var(--studio-muted-strong)]">
                              <p>Studio state saves to IndexedDB first and stays local during normal editing.</p>
                              <p>Published pages and exports continue to use the Studio routes without falling back to legacy workbench surfaces.</p>
                              <p>The same project can now move from AI conversation to library card without changing data models.</p>
                            </div>
                          </section>
                        </div>
                      ) : (
                        <div className="flex h-full min-h-0 flex-col px-4 py-4">
                          <WorkbenchStudioInspector schema={inspectorSchema} />
                        </div>
                      )}
                    </div>
                  </div>
                </aside>
              ) : null}
            </div>

            {pagesStripVisible ? (
              <footer className="studio-editor-filmstrip border-t border-[var(--studio-line)] bg-[rgba(4,4,4,0.96)] px-4 py-2">
                {hasStreamingPreview ? (
                  <div className="flex items-start gap-3 overflow-x-auto pb-1">
                    {streamUi.partialPages.map((page) => (
                      <button
                        key={`stream-filmstrip-${page.pageNumber}`}
                        type="button"
                        onClick={() => handleCanvasPageJump(page.pageNumber)}
                        className={[
                          "min-w-[148px] border-b-2 px-1 pb-2 pt-1 text-left transition",
                          currentCanvasPageNumber === page.pageNumber
                            ? "border-[rgba(0,242,255,0.85)]"
                            : "border-transparent hover:border-[rgba(255,255,255,0.22)]",
                        ].join(" ")}
                      >
                        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--studio-muted)]">
                          Page {page.pageNumber}
                        </div>
                        <div className="mt-1 truncate text-[11px] font-medium text-[var(--studio-ink)]">
                          {page.title}
                        </div>
                        <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--studio-muted-strong)]">
                          {page.stage === "ready"
                            ? "Ready"
                            : page.stage === "error"
                              ? "Failed"
                              : page.stage === "generating"
                                ? "Generating"
                                : "Queued"}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : generatedHtmlReport ? (
                  <HtmlReportPageFilmstrip
                    htmlReport={generatedHtmlReport}
                    selectedPageNumber={currentCanvasPageNumber}
                    overflowMap={selection.htmlPageOverflows}
                    onSelectPage={handleCanvasPageJump}
                  />
                ) : (
                  <div className="flex items-start gap-3 overflow-x-auto pb-1">
                    {project.pages.map((page) => (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => handleCanvasPageJump(Number.parseInt(page.id, 10))}
                        className={[
                          "min-w-[144px] border-b-2 px-1 pb-2 pt-1 text-left transition",
                          currentCanvasPageId === page.id
                            ? "border-[rgba(0,242,255,0.85)]"
                            : "border-transparent hover:border-[rgba(255,255,255,0.22)]",
                        ].join(" ")}
                      >
                        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--studio-muted)]">
                          Page {page.id}
                        </div>
                        <div className="mt-1 truncate text-[11px] font-medium text-[var(--studio-ink)]">
                          {page.title}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </footer>
            ) : null}
          </div>
        </section>
      </div>
    </article>
  );
}
