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
  removeGeneratedHtmlReportCanvasBlockTransform,
  removeGeneratedHtmlReportCanvasVisualTransform,
  shiftGeneratedHtmlReportCanvasBlockLayer,
  shiftGeneratedHtmlReportCanvasVisualLayer,
  updateGeneratedHtmlReportCanvasBlockTransform,
  updateGeneratedHtmlReportCanvasVisualTransform,
} from "@/features/studio/html-report-canvas";
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
import {
  fireAndForget,
  getAsyncActionErrorMessage,
} from "@/features/studio/runtime/fire-and-forget";
import {
  createStarterLayoutPage,
  getStarterPackManifest,
  isStarterPackDeck,
  isStarterPackLayout,
  listStarterPackManifests,
  listStarterPackThemes,
  recommendStarterPackManifests,
} from "@/features/studio/starter-packs";
import type { WorkbenchAgentProvider } from "@/features/studio/ai-settings";
import type {
  GeneratedDraftAsset,
  HtmlOutputMode,
  HtmlCanvasFrame,
  HtmlEditableBlock,
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
  { id: "history", label: "History" },
  { id: "export", label: "Export" },
] as const;

const SIDEBAR_TABS = INSPECTOR_TABS.filter((tab) => tab.id !== "text");

const MODULE_USAGE_OPTIONS: Array<{
  value: WorkbenchModuleUsageMode;
  label: string;
}> = [
  { value: "disabled", label: "Templates: Off" },
  { value: "fallback", label: "Fallback only" },
  { value: "chart-only", label: "Charts only" },
];

const HTML_OUTPUT_MODE_OPTIONS: Array<{
  value: HtmlOutputMode;
  label: string;
}> = [
  { value: "static", label: "Static HTML" },
  { value: "animated-preview-js", label: "Animated HTML" },
];

const GENERAL_CONSULTING_PROFILE = getIndustryStyleProfile("general-consulting");

function describeHtmlOutputMode(mode: HtmlOutputMode) {
  return mode === "animated-preview-js" ? "Animated HTML mode" : "Static HTML mode";
}

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

function resolvePageNumberFromId(
  pageId: string | null | undefined,
  pages: LayoutPage[] | null | undefined,
) {
  if (pageId && pages?.length) {
    const pageIndex = pages.findIndex((page) => page.id === pageId);
    if (pageIndex >= 0) {
      return pageIndex + 1;
    }
  }

  const parsed = Number.parseInt(pageId ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

function resolvePageIdFromNumber(
  pageNumber: number,
  pages: LayoutPage[] | null | undefined,
) {
  return pages?.[pageNumber - 1]?.id ?? String(pageNumber);
}

function buildStarterBindingIntent(
  pages: LayoutPage[],
  starterBindings: Record<string, string>,
) {
  return pages.flatMap((page, index) => {
    const starter = getStarterPackManifest(starterBindings[page.id] ?? page.starterLayoutId ?? null);
    if (!isStarterPackLayout(starter)) {
      return [];
    }
    return [
      {
        pageId: page.id,
        pageNumber: index + 1,
        starterId: starter.id,
      },
    ];
  });
}

function resolveStarterMode(args: {
  starterPackId?: string | null;
  starterThemeId?: string | null;
  starterBindings?: Record<string, string>;
  themeOnly?: boolean;
}): WorkbenchProject["starterApplicationMode"] {
  const hasDeckStarter = isStarterPackDeck(getStarterPackManifest(args.starterPackId ?? null));
  const hasThemeStarter = Boolean(args.starterThemeId);
  const hasPageStarter = Object.values(args.starterBindings ?? {}).some((starterId) =>
    isStarterPackLayout(getStarterPackManifest(starterId)),
  );

  if (args.themeOnly && hasThemeStarter) {
    return "theme";
  }
  if (hasDeckStarter && (hasThemeStarter || hasPageStarter)) {
    return "mixed";
  }
  if (hasDeckStarter) {
    return "deck";
  }
  if (hasThemeStarter || hasPageStarter) {
    return "theme";
  }
  return "deck";
}

function renumberPagesWithStarterBindings(args: {
  pages: LayoutPage[];
  starterBindings: Record<string, string>;
}) {
  const nextStarterBindings: Record<string, string> = {};
  const nextPages = args.pages.map((page, index) => {
    const nextId = String(index + 1);
    const starter = getStarterPackManifest(args.starterBindings[page.id] ?? page.starterLayoutId ?? null);
    if (isStarterPackLayout(starter)) {
      nextStarterBindings[nextId] = starter.id;
    }
    return {
      ...page,
      id: nextId,
      chapter: `Page ${index + 1}`,
      starterLayoutId: isStarterPackLayout(starter) ? starter.id : null,
      blocks: page.blocks.map((block) => ({ ...block })),
    };
  });

  return {
    pages: nextPages,
    starterBindings: nextStarterBindings,
  };
}

export function StudioProjectEditPage({ projectId }: { projectId: string }) {
  const { workspaceRepository } = useStudioWorkspace({ projectId });
  const location = useLocation();
  const navigate = useNavigate();
  const [chatInput, setChatInput] = useState("");
  const [pendingDeckStarterId, setPendingDeckStarterId] = useState("");
  const [pendingThemeId, setPendingThemeId] = useState("");
  const [pendingPageStarterId, setPendingPageStarterId] = useState("");
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
    clearSelection,
    recordHtmlOverflow,
    undo,
    redo,
    importBundle,
    setInspectorTab,
    setAiSettings,
  } = useStudioProjectActions();

  const runAsyncAction = useCallback(
    (promise: Promise<unknown>, fallback: string) => {
      fireAndForget(promise, (error) => {
        setStatusLine(getAsyncActionErrorMessage(error, fallback));
      });
    },
    [setStatusLine],
  );

  const project = documentState.project;
  const starterDeckOptions = useMemo(
    () => listStarterPackManifests("deck").filter(isStarterPackDeck),
    [],
  );
  const starterPageOptions = useMemo(
    () => listStarterPackManifests("layout").filter(isStarterPackLayout),
    [],
  );
  const starterThemeOptions = useMemo(() => listStarterPackThemes(), []);

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
  const resolvedHtmlOutputMode: HtmlOutputMode =
    generatedHtmlReport?.htmlOutputMode ?? project?.htmlOutputMode ?? "static";
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
  const activePage = useMemo(
    () => project?.pages.find((page) => page.id === selection.activePageId) ?? project?.pages[0] ?? null,
    [project, selection.activePageId],
  );
  const activePageStarterId =
    (activePage && project?.starterBindings[activePage.id]) ?? activePage?.starterLayoutId ?? "";
  const currentCanvasPageId =
    shell.currentCanvasPageId ??
    selection.activePageId ??
    (hasStreamingPreview ? String(streamUi.partialPages[0]?.pageNumber ?? "1") : null) ??
    project?.pages[0]?.id ??
    null;
  const currentCanvasPageNumber = resolvePageNumberFromId(currentCanvasPageId, project?.pages);
  const activePageNumber = resolvePageNumberFromId(
    selection.activePageId || currentCanvasPageId,
    project?.pages,
  );
  const selectedCanvasPageId =
    selection.selectedHtmlBlockId || selection.selectedVisualNodeId
      ? selection.activePageId || currentCanvasPageId
      : currentCanvasPageId;
  const selectedCanvasPageNumber = resolvePageNumberFromId(selectedCanvasPageId, project?.pages);
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
  const activeHtmlPageTitle = useMemo(() => {
    if (!generatedHtmlReport || !project) {
      return "";
    }

    const pageIndex = Math.max(0, activePageNumber - 1);
    return (
      generatedHtmlReport.pageTitles[pageIndex] ??
      project.pages[pageIndex]?.title ??
      activePage?.title ??
      ""
    );
  }, [activePage, activePageNumber, generatedHtmlReport, project]);
  const activeHtmlStructurePage = useMemo(() => {
    if (!generatedHtmlReport?.structure?.pages?.length) {
      return null;
    }

    const pageNumber = activePageNumber;
    return (
      generatedHtmlReport.structure.pages.find((page) => page.pageNumber === pageNumber) ??
      generatedHtmlReport.structure.pages[0] ??
      null
    );
  }, [activePageNumber, generatedHtmlReport]);
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
      pageNumber: activePageNumber,
    });
  }, [activePageNumber, generatedHtmlReport]);
  const activeHtmlVisualPage = useMemo(() => {
    if (!generatedHtmlReport?.visualStructure?.pages?.length) {
      return null;
    }

    return (
      generatedHtmlReport.visualStructure.pages.find(
        (page) => page.pageNumber === activePageNumber,
      ) ?? null
    );
  }, [activePageNumber, generatedHtmlReport]);
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
      pageNumber: activePageNumber,
      nodeId: selection.selectedVisualNodeId,
    });
  }, [activePageNumber, generatedHtmlReport, selection.selectedVisualNodeId]);

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
    regenerateReportWithIntent,
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
  const recommendedDeckStarters = useMemo(
    () =>
      recommendStarterPackManifests({
        briefText: project?.sourceText ?? brief.intakeInput,
        kind: "deck",
        limit: 3,
      }).filter(isStarterPackDeck),
    [brief.intakeInput, project?.sourceText],
  );
  const recommendedPageStarters = useMemo(
    () =>
      recommendStarterPackManifests({
        briefText: [
          project?.sourceText ?? "",
          activePage?.title ?? "",
          activePage?.note ?? "",
          activePage?.instruction ?? "",
        ]
          .filter(Boolean)
          .join("\n"),
        kind: "layout",
        limit: 4,
      }).filter(isStarterPackLayout),
    [activePage?.instruction, activePage?.note, activePage?.title, project?.sourceText],
  );

  useEffect(() => {
    setPendingDeckStarterId(project?.starterPackId ?? "");
  }, [project?.id, project?.starterPackId]);

  useEffect(() => {
    setPendingThemeId(project?.starterThemeId ?? "");
  }, [project?.id, project?.starterThemeId]);

  useEffect(() => {
    setPendingPageStarterId(activePageStarterId);
  }, [activePage?.id, activePageStarterId, project?.id]);

  const selectedDeckStarter = useMemo(() => {
    const starter = getStarterPackManifest(pendingDeckStarterId || null);
    return isStarterPackDeck(starter) ? starter : null;
  }, [pendingDeckStarterId]);

  const selectedPageStarter = useMemo(() => {
    const starter = getStarterPackManifest(pendingPageStarterId || null);
    return isStarterPackLayout(starter) ? starter : null;
  }, [pendingPageStarterId]);

  const selectedTheme = useMemo(
    () => starterThemeOptions.find((theme) => theme.id === pendingThemeId) ?? null,
    [pendingThemeId, starterThemeOptions],
  );

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

  function updateProjectHtmlOutputMode(nextMode: HtmlOutputMode) {
    if (!project || generatedHtmlReport || project.htmlOutputMode === nextMode) {
      return;
    }

    replaceCurrentProject(
      {
        ...project,
        htmlOutputMode: nextMode,
        updatedAt: new Date().toISOString(),
      },
      {
        history: {
          scope: "brief",
          label: "Change HTML output mode",
          fields: ["htmlOutputMode"],
        },
        mode: "editor",
        statusLine:
          nextMode === "animated-preview-js"
            ? "This project will generate the first draft in animated HTML preview mode."
            : "This project will generate the first draft in static HTML mode.",
      },
    );
  }

  async function regenerateWithStarterIntent(args: {
    starterPackId?: string | null;
    starterThemeId?: string | null;
    starterApplicationMode?: WorkbenchProject["starterApplicationMode"];
    starterBindings?: Record<string, string>;
    requestedPageCount?: number | null;
    statusLine: string;
  }) {
    if (!project?.sourceText.trim()) {
      setStatusLine("Starter selection saved. Add a brief, then generate to see it applied.");
      return;
    }

    const nextStarterPackId =
      "starterPackId" in args ? args.starterPackId ?? null : project.starterPackId;
    const nextStarterThemeId =
      "starterThemeId" in args ? args.starterThemeId ?? null : project.starterThemeId;
    const nextRequestedPageCount =
      "requestedPageCount" in args
        ? args.requestedPageCount ?? null
        : project.requestedPageCount;

    await regenerateReportWithIntent(
      {
        starterPackId: nextStarterPackId,
        starterThemeId: nextStarterThemeId,
        starterApplicationMode: args.starterApplicationMode ?? project.starterApplicationMode,
        starterBindings: buildStarterBindingIntent(
          project.pages,
          args.starterBindings ?? project.starterBindings,
        ),
        requestedPageCount: nextRequestedPageCount,
      },
      args.statusLine,
    );
  }

  function replaceProjectStarterState(args: {
    starterPackId?: string | null;
    starterThemeId?: string | null;
    starterBindings?: Record<string, string>;
    starterApplicationMode?: WorkbenchProject["starterApplicationMode"];
    pages?: LayoutPage[];
    requestedPageCount?: number | null;
    label: string;
    fields: Array<
      | "starterPackId"
      | "starterThemeId"
      | "starterBindings"
      | "starterApplicationMode"
      | "pages"
      | "requestedPageCount"
    >;
    statusLine: string;
    resetSelection?: boolean;
  }) {
    if (!project) {
      return;
    }

    const nextStarterPackId =
      "starterPackId" in args ? args.starterPackId ?? null : project.starterPackId;
    const nextStarterThemeId =
      "starterThemeId" in args ? args.starterThemeId ?? null : project.starterThemeId;
    const nextRequestedPageCount =
      "requestedPageCount" in args
        ? args.requestedPageCount ?? null
        : project.requestedPageCount;

    replaceCurrentProject(
      {
        ...project,
        starterPackId: nextStarterPackId,
        starterThemeId: nextStarterThemeId,
        starterBindings: args.starterBindings ?? project.starterBindings,
        starterApplicationMode:
          args.starterApplicationMode ?? project.starterApplicationMode,
        pages: args.pages ?? project.pages,
        requestedPageCount: nextRequestedPageCount,
        updatedAt: new Date().toISOString(),
      },
      {
        history: {
          scope: "brief",
          label: args.label,
          fields: args.fields,
        },
        mode: "editor",
        resetSelection: args.resetSelection,
        statusLine: args.statusLine,
      },
    );
  }

  async function handleRegenerateWithSelectedStarter() {
    if (!project) {
      return;
    }

    const nextStarterPackId = selectedDeckStarter?.id ?? null;
    const nextStarterApplicationMode = resolveStarterMode({
      starterPackId: nextStarterPackId,
      starterThemeId: project.starterThemeId,
      starterBindings: project.starterBindings,
    });

    replaceProjectStarterState({
      starterPackId: nextStarterPackId,
      starterApplicationMode: nextStarterApplicationMode,
      label: nextStarterPackId ? "Select deck starter" : "Clear deck starter",
      fields: ["starterPackId", "starterApplicationMode"],
      statusLine: nextStarterPackId
        ? `Selected ${selectedDeckStarter?.label ?? "starter pack"} as the deck starter.`
        : "Cleared the current deck starter.",
    });

    await regenerateWithStarterIntent({
      starterPackId: nextStarterPackId,
      starterApplicationMode: nextStarterApplicationMode,
      statusLine: nextStarterPackId
        ? `Regenerating with ${selectedDeckStarter?.label ?? "the selected starter"}...`
        : "Regenerating without a deck starter...",
    });
  }

  async function handleApplySelectedStarterTheme() {
    if (!project) {
      return;
    }

    const nextStarterThemeId = selectedTheme?.id ?? null;
    const nextStarterApplicationMode = nextStarterThemeId
      ? "theme"
      : resolveStarterMode({
          starterPackId: project.starterPackId,
          starterThemeId: null,
          starterBindings: project.starterBindings,
        });

    replaceProjectStarterState({
      starterThemeId: nextStarterThemeId,
      starterApplicationMode: nextStarterApplicationMode,
      label: nextStarterThemeId ? "Apply starter theme" : "Clear starter theme",
      fields: ["starterThemeId", "starterApplicationMode"],
      statusLine: nextStarterThemeId
        ? `Applied ${selectedTheme?.label ?? "the selected starter theme"} as a theme-only constraint.`
        : "Cleared the starter theme override.",
    });

    await regenerateWithStarterIntent({
      starterThemeId: nextStarterThemeId,
      starterApplicationMode: nextStarterApplicationMode,
      statusLine: nextStarterThemeId
        ? `Applying ${selectedTheme?.label ?? "starter theme"} across the deck...`
        : "Regenerating after clearing the starter theme...",
    });
  }

  async function handleReplaceCurrentPageWithStarter() {
    if (!project || !activePage) {
      return;
    }

    if (!selectedPageStarter && !activePageStarterId) {
      setStatusLine("Choose a page starter first, then replace the current page scaffold.");
      return;
    }

    const starterScaffold = selectedPageStarter
      ? createStarterLayoutPage({
          starter: selectedPageStarter,
          pageId: activePage.id,
          pageNumber: activePageNumber,
          title: activePage.title,
        })
      : null;
    const nextStarterBindings = { ...project.starterBindings };
    if (selectedPageStarter) {
      nextStarterBindings[activePage.id] = selectedPageStarter.id;
    } else {
      delete nextStarterBindings[activePage.id];
    }
    const nextPages = project.pages.map((page) =>
      page.id === activePage.id
        ? {
            ...page,
            starterLayoutId: selectedPageStarter?.id ?? null,
            note: page.note || starterScaffold?.note || "",
            instruction: page.instruction || starterScaffold?.instruction || "",
            blocks: page.blocks.map((block) => ({ ...block })),
          }
        : page,
    );
    const nextStarterApplicationMode = resolveStarterMode({
      starterPackId: project.starterPackId,
      starterThemeId: project.starterThemeId,
      starterBindings: nextStarterBindings,
    });

    replaceProjectStarterState({
      pages: nextPages,
      starterBindings: nextStarterBindings,
      starterApplicationMode: nextStarterApplicationMode,
      label: selectedPageStarter
        ? "Replace current page with starter"
        : "Clear current page starter",
      fields: ["pages", "starterBindings", "starterApplicationMode"],
      statusLine: selectedPageStarter
        ? `Bound ${selectedPageStarter.label} to the current page.`
        : "Cleared the current page starter binding.",
    });

    await regenerateWithStarterIntent({
      starterBindings: nextStarterBindings,
      starterApplicationMode: nextStarterApplicationMode,
      statusLine: selectedPageStarter
        ? `Regenerating page ${activePageNumber} with ${selectedPageStarter.label}...`
        : `Regenerating page ${activePageNumber} without a page starter...`,
    });
  }

  async function handleInsertStarterPage() {
    if (!project || !selectedPageStarter) {
      setStatusLine("Choose a page starter first, then insert a starter page.");
      return;
    }

    const insertIndex = activePage
      ? Math.max(0, project.pages.findIndex((page) => page.id === activePage.id))
      : project.pages.length - 1;
    const provisionalPage = createStarterLayoutPage({
      starter: selectedPageStarter,
      pageId: `insert-${Date.now()}`,
      pageNumber: insertIndex + 2,
      title: selectedPageStarter.label,
    });
    const provisionalPages = [
      ...project.pages.slice(0, insertIndex + 1),
      provisionalPage,
      ...project.pages.slice(insertIndex + 1),
    ];
    const provisionalBindings = {
      ...project.starterBindings,
      [provisionalPage.id]: selectedPageStarter.id,
    };
    const {
      pages: nextPages,
      starterBindings: nextStarterBindings,
    } = renumberPagesWithStarterBindings({
      pages: provisionalPages,
      starterBindings: provisionalBindings,
    });
    const insertedPageId = String(insertIndex + 2);
    const nextRequestedPageCount = nextPages.length;
    const nextStarterApplicationMode = resolveStarterMode({
      starterPackId: project.starterPackId,
      starterThemeId: project.starterThemeId,
      starterBindings: nextStarterBindings,
    });

    replaceProjectStarterState({
      pages: nextPages,
      starterBindings: nextStarterBindings,
      starterApplicationMode: nextStarterApplicationMode,
      requestedPageCount: nextRequestedPageCount,
      label: "Insert starter page",
      fields: ["pages", "starterBindings", "starterApplicationMode", "requestedPageCount"],
      statusLine: `Inserted a ${selectedPageStarter.label} starter page after the current page.`,
      resetSelection: false,
    });
    selectPage(insertedPageId);
    setCurrentCanvasPageId(insertedPageId);
    setPropertiesVisible(true);

    await regenerateReportWithIntent(
      {
        requestedPageCount: nextRequestedPageCount,
        starterPackId: project.starterPackId,
        starterThemeId: project.starterThemeId,
        starterApplicationMode: nextStarterApplicationMode,
        starterBindings: buildStarterBindingIntent(nextPages, nextStarterBindings),
      },
      `Regenerating with a new ${selectedPageStarter.label} starter page...`,
    );
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

  function returnHtmlBlockToFlow(pageNumber: number, blockId: string) {
    if (!project?.generatedDraft?.htmlReport) {
      return;
    }

    const nextHtmlReport = removeGeneratedHtmlReportCanvasBlockTransform({
      report: project.generatedDraft.htmlReport,
      pageNumber,
      id: blockId,
    });

    updateGeneratedDraft({
      generatedDraft: {
        ...project.generatedDraft,
        htmlReport: nextHtmlReport,
      },
      label: "Return text block to flow",
      scope: "text",
      inspectorTab: "text",
      statusLine: "Returned the selected text block to the page flow.",
    });
  }

  function updateActiveHtmlVisualStyle(nextStyle: HtmlPageVisualStyle) {
    if (!project?.generatedDraft?.htmlReport) {
      return;
    }

    const nextHtmlReport = updateGeneratedHtmlReportVisualStyle({
      report: project.generatedDraft.htmlReport,
      pageNumber: activePageNumber,
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
      pageNumber: activePageNumber,
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

  function returnHtmlVisualToFlow(pageNumber: number, nodeId: string) {
    if (!project?.generatedDraft?.htmlReport) {
      return;
    }

    const nextHtmlReport = removeGeneratedHtmlReportCanvasVisualTransform({
      report: project.generatedDraft.htmlReport,
      pageNumber,
      id: nodeId,
    });

    updateGeneratedDraft({
      generatedDraft: {
        ...project.generatedDraft,
        htmlReport: nextHtmlReport,
      },
      label: "Return visual to flow",
      scope: "visual",
      inspectorTab: "visual",
      statusLine: "Returned the selected visual element to the page flow.",
    });
  }

  function shiftHtmlBlockCanvasLayer(
    pageNumber: number,
    blockId: string,
    direction: "forward" | "backward",
    frame: HtmlCanvasFrame,
    fontSize?: number,
  ) {
    if (!project?.generatedDraft?.htmlReport) {
      return;
    }

    const nextHtmlReport = shiftGeneratedHtmlReportCanvasBlockLayer({
      report: project.generatedDraft.htmlReport,
      pageNumber,
      id: blockId,
      direction,
      frame,
      fontSize,
    });

    updateGeneratedDraft({
      generatedDraft: {
        ...project.generatedDraft,
        htmlReport: nextHtmlReport,
      },
      label: direction === "forward" ? "Bring text block forward" : "Send text block backward",
      scope: "text",
      inspectorTab: "text",
      statusLine: "Adjusted the selected text block layer on the canvas.",
    });
  }

  function shiftHtmlVisualCanvasLayer(
    pageNumber: number,
    nodeId: string,
    direction: "forward" | "backward",
    frame: HtmlCanvasFrame,
  ) {
    if (!project?.generatedDraft?.htmlReport) {
      return;
    }

    const nextHtmlReport = shiftGeneratedHtmlReportCanvasVisualLayer({
      report: project.generatedDraft.htmlReport,
      pageNumber,
      id: nodeId,
      direction,
      frame,
    });

    updateGeneratedDraft({
      generatedDraft: {
        ...project.generatedDraft,
        htmlReport: nextHtmlReport,
      },
      label:
        direction === "forward" ? "Bring visual element forward" : "Send visual element backward",
      scope: "visual",
      inspectorTab: "visual",
      statusLine: "Adjusted the selected visual element layer on the canvas.",
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
      pageNumber: activePageNumber,
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
      selectVisualNode(activePageNumber, nodeId);
    }
  }

  function duplicateSelectedVisualElement() {
    if (!project?.generatedDraft?.htmlReport || !selection.selectedVisualNodeId) {
      return;
    }

    const { report: nextHtmlReport, nodeId } = duplicateGeneratedHtmlReportVisualNode({
      report: project.generatedDraft.htmlReport,
      pageNumber: activePageNumber,
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
      selectVisualNode(activePageNumber, nodeId);
    }
  }

  function deleteSelectedVisualElement() {
    if (!project?.generatedDraft?.htmlReport || !selection.selectedVisualNodeId) {
      return;
    }

    const nextHtmlReport = deleteGeneratedHtmlReportVisualNode({
      report: project.generatedDraft.htmlReport,
      pageNumber: activePageNumber,
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
      pageNumber: activePageNumber,
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
      pageNumber: activePageNumber,
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

      const pageNumber = activePageNumber;
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

      const pageNumber = activePageNumber;
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

      const pageNumber = activePageNumber;
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

  function openSidebarTab(tab: "page" | "text" | "visual" | "history" | "export") {
    setCanvasDrawer(tab);
    if (tab === "page" || tab === "text" || tab === "visual") {
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
    const pageId = hasStreamingPreview
      ? String(pageNumber)
      : resolvePageIdFromNumber(pageNumber, project?.pages);
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
      {
        id: "starter-deck",
        title: "Starter deck",
        fields: [
          {
            id: `starter-deck-select-${project.id}`,
            kind: "select",
            label: "Deck starter",
            value: pendingDeckStarterId,
            description:
              "Select a deck starter, then explicitly regenerate to apply its cadence and visual starting language.",
            options: [
              { value: "", label: "Blank (default)" },
              ...starterDeckOptions.map((starter) => ({
                value: starter.id,
                label: `${starter.label} · ${starter.pageCount} pages`,
              })),
            ],
            onChange: setPendingDeckStarterId,
          },
          {
            id: `starter-deck-mode-${project.id}`,
            kind: "readonly",
            label: "Active starter mode",
            value:
              project.starterApplicationMode === "theme"
                ? "Theme-only"
                : project.starterApplicationMode === "mixed"
                  ? "Deck plus page/theme"
                  : "Deck starter",
          },
          {
            id: `starter-deck-actions-${project.id}`,
            kind: "actions",
            label: "Deck starter actions",
            actions: [
              {
                id: `regenerate-with-starter-${project.id}`,
                label: selectedDeckStarter ? "Regenerate with starter" : "Clear deck starter",
                onPress: () =>
                  runAsyncAction(
                    handleRegenerateWithSelectedStarter(),
                    "Studio could not regenerate with the selected starter.",
                  ),
              },
            ],
          },
        ],
      },
      {
        id: "starter-page",
        title: "Page starter",
        fields: [
          {
            id: `starter-page-select-${activePage.id}`,
            kind: "select",
            label: "Current page starter",
            value: pendingPageStarterId,
            description:
              "Use this to bind a starter silhouette to the current page without changing the rest of the deck.",
            options: [
              { value: "", label: "Blank (default)" },
              ...starterPageOptions.map((starter) => ({
                value: starter.id,
                label: `${starter.label} · ${starter.pageFamily}`,
              })),
            ],
            onChange: setPendingPageStarterId,
          },
          {
            id: `starter-page-actions-${activePage.id}`,
            kind: "actions",
            label: "Page starter actions",
            actions: [
              {
                id: `replace-with-starter-${activePage.id}`,
                label: selectedPageStarter ? "Replace current page with starter" : "Clear current page starter",
                onPress: () =>
                  runAsyncAction(
                    handleReplaceCurrentPageWithStarter(),
                    "Studio could not replace the current page with the selected starter.",
                  ),
              },
              {
                id: `insert-starter-page-${activePage.id}`,
                label: "Insert starter page",
                onPress: () =>
                  runAsyncAction(
                    handleInsertStarterPage(),
                    "Studio could not insert the selected starter page.",
                  ),
              },
            ],
          },
        ],
      },
    ];

    if (recommendedDeckStarters.length > 0 || recommendedPageStarters.length > 0) {
      sections.push({
        id: "starter-recommendations",
        title: "Recommended starters",
        fields: [
          ...(recommendedDeckStarters.length > 0
            ? [
                {
                  id: `recommended-deck-${project.id}`,
                  kind: "actions" as const,
                  label: "Deck recommendations",
                  description:
                    "Recommendations are assistive only. Choosing one here just stages it for confirmation.",
                  actions: recommendedDeckStarters.map((starter) => ({
                    id: `recommend-deck-${starter.id}`,
                    label: starter.label,
                    onPress: () => setPendingDeckStarterId(starter.id),
                  })),
                },
              ]
            : []),
          ...(recommendedPageStarters.length > 0
            ? [
                {
                  id: `recommended-page-${activePage.id}`,
                  kind: "actions" as const,
                  label: "Page recommendations",
                  description:
                    "These recommendations do not write starter metadata until you use one of the page actions above.",
                  actions: recommendedPageStarters.map((starter) => ({
                    id: `recommend-page-${starter.id}`,
                    label: starter.label,
                    onPress: () => setPendingPageStarterId(starter.id),
                  })),
                },
              ]
            : []),
        ],
      });
    }

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
    handleInsertStarterPage,
    handleRegenerateWithSelectedStarter,
    handleReplaceCurrentPageWithStarter,
    generatedHtmlReport,
    insertPublishedModule,
    pendingDeckStarterId,
    pendingPageStarterId,
    project,
    project?.starterApplicationMode,
    recommendedModuleManifests,
    recommendedDeckStarters,
    recommendedPageStarters,
    selectedDeckStarter,
    setProjectName,
    setPendingDeckStarterId,
    setPendingPageStarterId,
    setSourceText,
    shell.mode,
    starterDeckOptions,
    starterPageOptions,
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
                  activePageNumber,
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
              id: `node-background-${activeHtmlVisualNode.id}`,
              kind: "color",
              label: "Background",
              value: activeHtmlVisualNode.style.background ?? "#ffffff",
              onChange: (value: string) =>
                updateActiveHtmlVisualNodeStyle({ background: value }),
            },
            {
              id: `node-border-${activeHtmlVisualNode.id}`,
              kind: "color",
              label: "Border",
              value: activeHtmlVisualNode.style.border ?? "#d7d1c6",
              onChange: (value: string) =>
                updateActiveHtmlVisualNodeStyle({ border: value }),
            },
            {
              id: `node-accent-${activeHtmlVisualNode.id}`,
              kind: "color",
              label: "Accent",
              value: activeHtmlVisualNode.style.accent ?? "#c6994a",
              onChange: (value: string) =>
                updateActiveHtmlVisualNodeStyle({ accent: value }),
            },
            {
              id: `node-opacity-${activeHtmlVisualNode.id}`,
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
              id: `node-radius-${activeHtmlVisualNode.id}`,
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
              id: `node-padding-${activeHtmlVisualNode.id}`,
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
              id: `node-width-${activeHtmlVisualNode.id}`,
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

  const inspectorSchema = useMemo(() => {
    if (shell.inspectorTab === "text") {
      return textInspectorSchema;
    }
    if (shell.inspectorTab === "visual") {
      return visualInspectorSchema;
    }
    return pageInspectorSchema;
  }, [
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
  const preferredHtmlSelectionType = useMemo(() => {
    if (activeSidebarTab === "text") {
      return "text" as const;
    }
    if (activeSidebarTab === "visual") {
      return "visual" as const;
    }
    return "page" as const;
  }, [activeSidebarTab]);
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
                                onClick={() =>
                                  runAsyncAction(
                                    handleLongFormClarificationChoice(option.resolution),
                                    "Studio could not update the requested deck length.",
                                  )
                                }
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
                    {generatedHtmlReport ? (
                      <div className="inline-flex items-center border border-[rgba(0,242,255,0.22)] bg-[rgba(0,242,255,0.06)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--studio-ink)]">
                        {describeHtmlOutputMode(resolvedHtmlOutputMode)}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {HTML_OUTPUT_MODE_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => updateProjectHtmlOutputMode(option.value)}
                            disabled={brief.isGeneratingReport || streamUi.isStreaming || isDeckReviewLocked}
                            className={[
                              "inline-flex items-center rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition disabled:cursor-not-allowed disabled:opacity-40",
                              resolvedHtmlOutputMode === option.value
                                ? "border-[rgba(0,242,255,0.35)] bg-[rgba(0,242,255,0.1)] text-[var(--studio-ink)]"
                                : "border-[var(--studio-line)] bg-[rgba(255,255,255,0.03)] text-[var(--studio-muted-strong)] hover:border-[rgba(0,242,255,0.2)] hover:text-[var(--studio-ink)]",
                            ].join(" ")}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
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
                      onClick={() =>
                        runAsyncAction(
                          continueConversation(chatInput),
                          "Studio could not continue the conversation.",
                        )
                      }
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
                          runAsyncAction(
                            regenerateReportContent(),
                            "Studio could not retry the generation.",
                          );
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

                    <div className="h-4 w-px shrink-0 bg-[var(--studio-line)]" />

                    <div className="flex items-center gap-2">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--studio-muted)]">
                        Starter theme
                      </div>
                      <select
                        value={pendingThemeId}
                        onChange={(event) => setPendingThemeId(event.target.value)}
                        className="h-8 min-w-[170px] border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-2.5 text-[11px] text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.28)]"
                        disabled={isDeckReviewLocked}
                      >
                        <option value="">None</option>
                        {starterThemeOptions.map((theme) => (
                          <option key={theme.id} value={theme.id}>
                            {theme.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          runAsyncAction(
                            handleApplySelectedStarterTheme(),
                            "Studio could not apply the selected starter theme.",
                          )
                        }
                        className={toolbarButtonClass}
                        disabled={isDeckReviewLocked}
                      >
                        {pendingThemeId ? "Apply starter theme" : "Clear theme"}
                      </button>
                    </div>

                    {generatedHtmlReport ? (
                      <div className="inline-flex items-center border border-[rgba(0,242,255,0.22)] bg-[rgba(0,242,255,0.06)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--studio-ink)]">
                        {describeHtmlOutputMode(resolvedHtmlOutputMode)}
                      </div>
                    ) : null}

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
                                runAsyncAction(
                                  regenerateReportContent(),
                                  "Studio could not regenerate the report.",
                                );
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
                                runAsyncAction(
                                  handleRegenerateWithSelectedStarter(),
                                  "Studio could not regenerate with the selected starter.",
                                );
                              }}
                              disabled={brief.isGeneratingReport || isDeckReviewLocked}
                              className="flex h-9 w-full items-center px-3 text-left text-[12px] text-[var(--studio-ink)] transition hover:bg-[rgba(255,255,255,0.04)] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Regenerate with starter
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCanvasMoreOpen(false);
                                runAsyncAction(
                                  openPublishedReport(),
                                  "Studio could not open the published report.",
                                );
                              }}
                              className="flex h-9 w-full items-center px-3 text-left text-[12px] text-[var(--studio-ink)] transition hover:bg-[rgba(255,255,255,0.04)]"
                            >
                              Open published
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCanvasMoreOpen(false);
                                runAsyncAction(
                                  downloadCurrentHtml(),
                                  "Studio could not export the HTML report.",
                                );
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
                                runAsyncAction(
                                  downloadCurrentPptx(),
                                  "Studio could not export the PPTX file.",
                                );
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
                      selectedHtmlPageNumber={selectedCanvasPageNumber}
                      selectedHtmlBlockId={selection.selectedHtmlBlockId}
                      selectedHtmlBlockTransform={activeHtmlBlockCanvasTransform}
                      selectedHtmlVisualNodeId={selection.selectedVisualNodeId}
                      selectedHtmlVisualTransform={activeHtmlVisualCanvasTransform}
                      preferredHtmlSelectionType={preferredHtmlSelectionType}
                      onSelectHtmlBlock={isDeckReviewLocked ? undefined : selectHtmlBlock}
                      onSelectHtmlVisualNode={
                        isDeckReviewLocked
                          ? undefined
                          : (pageNumber, nodeId, _kind) =>
                              selectVisualNode(pageNumber, nodeId)
                      }
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
                      onReturnHtmlBlockToFlow={
                        isDeckReviewLocked
                          ? undefined
                          : (pageNumber, blockId) => {
                              selectHtmlBlock(pageNumber, blockId);
                              returnHtmlBlockToFlow(pageNumber, blockId);
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
                      onReturnHtmlVisualToFlow={
                        isDeckReviewLocked
                          ? undefined
                          : (pageNumber, nodeId) => {
                              selectVisualNode(pageNumber, nodeId);
                              returnHtmlVisualToFlow(pageNumber, nodeId);
                            }
                      }
                      onShiftHtmlBlockLayer={
                        isDeckReviewLocked
                          ? undefined
                          : (pageNumber, blockId, direction, frame, fontSize) => {
                              selectHtmlBlock(pageNumber, blockId);
                              shiftHtmlBlockCanvasLayer(
                                pageNumber,
                                blockId,
                                direction,
                                frame,
                                fontSize,
                              );
                            }
                      }
                      onShiftHtmlVisualLayer={
                        isDeckReviewLocked
                          ? undefined
                          : (pageNumber, nodeId, direction, frame) => {
                              selectVisualNode(pageNumber, nodeId);
                              shiftHtmlVisualCanvasLayer(pageNumber, nodeId, direction, frame);
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
                            onClick={() =>
                              runAsyncAction(
                                optimizeCurrentPage(),
                                "Studio could not optimize the current page.",
                              )
                            }
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
                        text and visual editing.
                      </div>
                      <div className="mt-5 inline-flex items-center border border-[rgba(0,242,255,0.22)] bg-[rgba(0,242,255,0.06)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--studio-ink)]">
                        {describeHtmlOutputMode(resolvedHtmlOutputMode)}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          runAsyncAction(
                            continueConversation(),
                            "Studio could not generate the first draft.",
                          )
                        }
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
                              <button
                                type="button"
                                onClick={() =>
                                  runAsyncAction(
                                    copyProjectBundleJson(),
                                    "Studio could not copy the project bundle.",
                                  )
                                }
                                className={sidebarActionClass}
                              >
                                Copy project bundle
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  runAsyncAction(
                                    copyWorkspaceBundleJson(),
                                    "Studio could not copy the workspace bundle.",
                                  )
                                }
                                className={sidebarActionClass}
                              >
                                Copy workspace bundle
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  runAsyncAction(
                                    downloadCurrentHtml(),
                                    "Studio could not export the HTML report.",
                                  )
                                }
                                data-testid="sidebar-export-html"
                                disabled={!generatedHtmlReport}
                                className={sidebarActionClass}
                              >
                                Download HTML
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  runAsyncAction(
                                    downloadCurrentPptx(),
                                    "Studio could not export the PPTX file.",
                                  )
                                }
                                data-testid="sidebar-export-pptx"
                                disabled={!generatedHtmlReport}
                                className={sidebarActionClass}
                              >
                                Download PPTX
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  runAsyncAction(
                                    openPublishedReport(),
                                    "Studio could not open the published report.",
                                  )
                                }
                                className={sidebarActionClass}
                              >
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
                                onClick={() =>
                                  runAsyncAction(
                                    handleImportBundle(),
                                    "Studio could not import the selected bundle.",
                                  )
                                }
                                className={sidebarActionClass}
                              >
                                Import bundle
                              </button>
                            </div>
                          </section>

                          <section className="border-b border-[var(--studio-line-soft)] pb-5">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                              AI Provider
                            </div>
                            <div className="mt-3 space-y-3">
                              <label className="block text-[12px] text-[var(--studio-muted-strong)]">
                                Provider
                                <select
                                  value={brief.aiSettings.provider}
                                  onChange={(e) => {
                                    const provider = e.target.value as WorkbenchAgentProvider;
                                    setAiSettings({ ...brief.aiSettings, provider });
                                  }}
                                  disabled={brief.isGeneratingReport || streamUi.isStreaming}
                                  className="mt-1 block w-full cursor-pointer border border-[var(--studio-line)] bg-[rgba(8,8,8,0.98)] px-2 py-2 text-[12px] text-[var(--studio-ink)] transition hover:border-[rgba(0,242,255,0.28)] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <option value="cursor">Cursor</option>
                                  <option value="codex">Codex</option>
                                  <option value="kimi">Kimi</option>
                                </select>
                              </label>

                              {brief.aiSettings.provider === "cursor" ? (
                                <>
                                  <label className="block text-[12px] text-[var(--studio-muted-strong)]">
                                    Command
                                    <input
                                      type="text"
                                      value={brief.aiSettings.cursor.command}
                                      onChange={(e) =>
                                        setAiSettings({
                                          ...brief.aiSettings,
                                          cursor: { ...brief.aiSettings.cursor, command: e.target.value },
                                        })
                                      }
                                      placeholder="agent"
                                      className="mt-1 block w-full border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-2 py-2 text-[12px] text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.35)]"
                                    />
                                  </label>
                                  <label className="block text-[12px] text-[var(--studio-muted-strong)]">
                                    Model
                                    <input
                                      type="text"
                                      value={brief.aiSettings.cursor.model}
                                      onChange={(e) =>
                                        setAiSettings({
                                          ...brief.aiSettings,
                                          cursor: { ...brief.aiSettings.cursor, model: e.target.value },
                                        })
                                      }
                                      placeholder="auto"
                                      className="mt-1 block w-full border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-2 py-2 text-[12px] text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.35)]"
                                    />
                                  </label>
                                  <label className="block text-[12px] text-[var(--studio-muted-strong)]">
                                    Working directory
                                    <input
                                      type="text"
                                      value={brief.aiSettings.cursor.cwd}
                                      onChange={(e) =>
                                        setAiSettings({
                                          ...brief.aiSettings,
                                          cursor: { ...brief.aiSettings.cursor, cwd: e.target.value },
                                        })
                                      }
                                      placeholder=""
                                      className="mt-1 block w-full border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-2 py-2 text-[12px] text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.35)]"
                                    />
                                  </label>
                                </>
                              ) : brief.aiSettings.provider === "codex" ? (
                                <>
                                  <label className="block text-[12px] text-[var(--studio-muted-strong)]">
                                    Command
                                    <input
                                      type="text"
                                      value={brief.aiSettings.codex.command}
                                      onChange={(e) =>
                                        setAiSettings({
                                          ...brief.aiSettings,
                                          codex: { ...brief.aiSettings.codex, command: e.target.value },
                                        })
                                      }
                                      placeholder="codex"
                                      className="mt-1 block w-full border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-2 py-2 text-[12px] text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.35)]"
                                    />
                                  </label>
                                  <label className="block text-[12px] text-[var(--studio-muted-strong)]">
                                    Model
                                    <input
                                      type="text"
                                      value={brief.aiSettings.codex.model}
                                      onChange={(e) =>
                                        setAiSettings({
                                          ...brief.aiSettings,
                                          codex: { ...brief.aiSettings.codex, model: e.target.value },
                                        })
                                      }
                                      placeholder="gpt-5.4"
                                      className="mt-1 block w-full border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-2 py-2 text-[12px] text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.35)]"
                                    />
                                  </label>
                                  <label className="block text-[12px] text-[var(--studio-muted-strong)]">
                                    Working directory
                                    <input
                                      type="text"
                                      value={brief.aiSettings.codex.cwd}
                                      onChange={(e) =>
                                        setAiSettings({
                                          ...brief.aiSettings,
                                          codex: { ...brief.aiSettings.codex, cwd: e.target.value },
                                        })
                                      }
                                      placeholder=""
                                      className="mt-1 block w-full border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-2 py-2 text-[12px] text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.35)]"
                                    />
                                  </label>
                                </>
                              ) : (
                                <>
                                  <label className="block text-[12px] text-[var(--studio-muted-strong)]">
                                    Command
                                    <input
                                      type="text"
                                      value={brief.aiSettings.kimi.command}
                                      onChange={(e) =>
                                        setAiSettings({
                                          ...brief.aiSettings,
                                          kimi: { ...brief.aiSettings.kimi, command: e.target.value },
                                        })
                                      }
                                      placeholder="node"
                                      className="mt-1 block w-full border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-2 py-2 text-[12px] text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.35)]"
                                    />
                                  </label>
                                  <label className="block text-[12px] text-[var(--studio-muted-strong)]">
                                    Model
                                    <input
                                      type="text"
                                      value={brief.aiSettings.kimi.model}
                                      onChange={(e) =>
                                        setAiSettings({
                                          ...brief.aiSettings,
                                          kimi: { ...brief.aiSettings.kimi, model: e.target.value },
                                        })
                                      }
                                      placeholder="moonshot-v1-128k"
                                      className="mt-1 block w-full border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-2 py-2 text-[12px] text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.35)]"
                                    />
                                  </label>
                                  <label className="block text-[12px] text-[var(--studio-muted-strong)]">
                                    Working directory
                                    <input
                                      type="text"
                                      value={brief.aiSettings.kimi.cwd}
                                      onChange={(e) =>
                                        setAiSettings({
                                          ...brief.aiSettings,
                                          kimi: { ...brief.aiSettings.kimi, cwd: e.target.value },
                                        })
                                      }
                                      placeholder=""
                                      className="mt-1 block w-full border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-2 py-2 text-[12px] text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.35)]"
                                    />
                                  </label>
                                  <label className="block text-[12px] text-[var(--studio-muted-strong)]">
                                    API Key
                                    <input
                                      type="password"
                                      value={brief.aiSettings.kimi.apiKey}
                                      onChange={(e) =>
                                        setAiSettings({
                                          ...brief.aiSettings,
                                          kimi: { ...brief.aiSettings.kimi, apiKey: e.target.value },
                                        })
                                      }
                                      placeholder="sk-..."
                                      className="mt-1 block w-full border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-2 py-2 text-[12px] text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.35)]"
                                    />
                                  </label>
                                  <label className="block text-[12px] text-[var(--studio-muted-strong)]">
                                    Base URL
                                    <input
                                      type="text"
                                      value={brief.aiSettings.kimi.baseUrl}
                                      onChange={(e) =>
                                        setAiSettings({
                                          ...brief.aiSettings,
                                          kimi: { ...brief.aiSettings.kimi, baseUrl: e.target.value },
                                        })
                                      }
                                      placeholder="https://api.moonshot.cn/v1"
                                      className="mt-1 block w-full border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-2 py-2 text-[12px] text-[var(--studio-ink)] outline-none transition focus:border-[rgba(0,242,255,0.35)]"
                                    />
                                  </label>
                                </>
                              )}
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
                    selectedPageNumber={selectedCanvasPageNumber}
                    overflowMap={selection.htmlPageOverflows}
                    onSelectPage={handleCanvasPageJump}
                  />
                ) : (
                  <div className="flex items-start gap-3 overflow-x-auto pb-1">
                    {project.pages.map((page) => (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() =>
                          handleCanvasPageJump(resolvePageNumberFromId(page.id, project.pages))
                        }
                        className={[
                          "min-w-[144px] border-b-2 px-1 pb-2 pt-1 text-left transition",
                          currentCanvasPageId === page.id
                            ? "border-[rgba(0,242,255,0.85)]"
                            : "border-transparent hover:border-[rgba(255,255,255,0.22)]",
                        ].join(" ")}
                      >
                        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--studio-muted)]">
                          Page {resolvePageNumberFromId(page.id, project.pages)}
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
