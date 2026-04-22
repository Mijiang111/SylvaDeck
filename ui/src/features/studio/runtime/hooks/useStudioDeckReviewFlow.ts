import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  applyDeterministicTitleRepairToReport,
  buildLayoutPlaceholderDraft,
  createHtmlReportPages,
  createGenerationSignature,
  createGeneratedDraftAsset,
  didPageReviewImprove,
  hasPageFitFailure,
  isTitleOnlyHardFail,
  resolvePageReviewDecision,
  streamReviseHtmlReport,
  type PageFitMeasurement,
  type StudioGenerateStreamEvent,
} from "@/features/studio/generation";
import type {
  GeneratedDraftAsset,
  TemplateId,
  WorkbenchProject,
} from "@/features/studio/types";
import { useStudioProjectActions, useWorkbenchStudioStore } from "../studio/store";
import {
  DEFAULT_DECK_REVIEW_STATE,
  LONG_FORM_DECK_REVIEW_HARD_TIMEOUT_MS,
  MAX_AUTO_REPAIR_PAGES_PER_PASS,
  MAX_LONG_FORM_AGGRESSIVE_REPAIR_PAGES,
  STANDARD_DECK_REVIEW_HARD_TIMEOUT_MS,
  type DeckReviewState,
} from "../runtime-shell-contract";
import {
  COMPLETED_AUTO_OPTIMIZATION_VERSION,
  hasPersistedCompletedAutoOptimization,
  resolveDeckReviewTimeoutState,
  shouldPersistCompletedAutoOptimization,
} from "./deck-review-helpers";

function buildDeckReviewKey(report: GeneratedDraftAsset["htmlReport"] | null | undefined) {
  if (!report) {
    return null;
  }

  return [
    report.title,
    report.pageCount,
    report.html.length,
    report.pageTitles.join("|"),
  ].join("::");
}

function resolveDeckReviewPageClass(pageNumber: number, pageCount: number) {
  if (pageCount >= 10) {
    if (pageNumber <= 3) {
      return "opening-core";
    }
    if (pageNumber <= 8) {
      return "proof-analysis";
    }
    return "synthesis-support";
  }
  return "opening-core";
}

function scorePageFitFailure(
  measurement: PageFitMeasurement,
  pageCount: number,
  currentPageNumber: number | null,
) {
  const verticalOverflow = Math.max(
    0,
    measurement.scrollHeight - measurement.clientHeight,
  );
  const horizontalOverflow = Math.max(
    0,
    measurement.scrollWidth - measurement.clientWidth,
  );
  const titlePenalty =
    measurement.pageTitleQuality.promptLeak ||
    measurement.pageTitleQuality.truncated ||
    measurement.pageTitleQuality.repeatedInstruction
      ? 2_500
      : 0;
  const causeBonus =
    measurement.dominantOverflowRegion === "hero-copy"
      ? 1_600
      : measurement.dominantOverflowRegion === "chart+sidebar"
        ? 1_400
        : measurement.dominantOverflowRegion === "comparison-grid"
          ? 1_100
          : measurement.dominantOverflowRegion === "footer/appendix"
            ? 750
            : measurement.dominantOverflowRegion === "title"
              ? 2_000
              : 400;
  const pageClass = resolveDeckReviewPageClass(measurement.pageNumber, pageCount);
  const pageClassBonus =
    pageClass === "opening-core"
      ? 2_000
      : pageClass === "proof-analysis"
        ? 1_000
        : 250;
  const currentPageBonus =
    currentPageNumber && measurement.pageNumber === currentPageNumber ? 1_500 : 0;
  const predictedTextBonus = measurement.predictedTextOverflow ? 900 : 0;
  const predictedRootBonus = Math.min(
    1_200,
    (measurement.predictedOverflowRoots?.length ?? 0) * 250,
  );

  return (
    verticalOverflow * 4 +
    horizontalOverflow * 2 +
    titlePenalty +
    causeBonus +
    pageClassBonus +
    currentPageBonus +
    predictedTextBonus +
    predictedRootBonus
  );
}

function prioritizeRepairMeasurements(
  measurements: PageFitMeasurement[],
  pageCount: number,
  currentPageNumber: number | null,
) {
  return [...measurements].sort(
    (left, right) =>
      scorePageFitFailure(right, pageCount, currentPageNumber) -
      scorePageFitFailure(left, pageCount, currentPageNumber),
  );
}

function formatPageLabelList(pageNumbers: number[]) {
  return [...new Set(pageNumbers)]
    .sort((left, right) => left - right)
    .map((pageNumber) => `P${pageNumber}`)
    .join(", ");
}

function buildSoftWarningMessage(pageNumbers: number[], prefix: string) {
  const labels = formatPageLabelList(pageNumbers);
  return labels
    ? `${prefix} ${labels} may still benefit from manual simplification.`
    : prefix;
}

type UseStudioDeckReviewFlowArgs = {
  project: WorkbenchProject | null;
  generatedHtmlReport: GeneratedDraftAsset["htmlReport"] | null;
  briefAiSettings: ReturnType<typeof useWorkbenchStudioStore.getState>["brief"]["aiSettings"];
  currentCanvasPageNumber: number;
  hasStreamingPreview: boolean;
  selectionHtmlPageOverflows: Record<number, boolean>;
  setPropertiesVisible: Dispatch<SetStateAction<boolean>>;
};

export function useStudioDeckReviewFlow(args: UseStudioDeckReviewFlowArgs) {
  const {
    project,
    generatedHtmlReport,
    briefAiSettings,
    currentCanvasPageNumber,
    hasStreamingPreview,
    selectionHtmlPageOverflows,
    setPropertiesVisible,
  } = args;

  const [deckReview, setDeckReview] = useState<DeckReviewState>(DEFAULT_DECK_REVIEW_STATE);
  const [latestMeasuredPages, setLatestMeasuredPages] = useState<Record<number, PageFitMeasurement>>(
    {},
  );
  const autoReviewedReportKeysRef = useRef<Set<string>>(new Set());
  const seededMeasurementsByReportKeyRef = useRef<Record<string, Record<number, PageFitMeasurement>>>(
    {},
  );
  const reviewAbortControllerRef = useRef<AbortController | null>(null);

  const {
    recordHtmlOverflow,
    replaceCurrentProject,
    updateGeneratedDraft,
    setStatusLine,
  } = useStudioProjectActions();

  const currentDeckReviewKey = useMemo(
    () => buildDeckReviewKey(generatedHtmlReport),
    [generatedHtmlReport],
  );
  const isDeckReviewLocked =
    deckReview.phase === "reviewing" || deckReview.phase === "repairing";
  const currentPageMeasurement = latestMeasuredPages[currentCanvasPageNumber] ?? null;

  const mergeLatestMeasuredPages = useCallback((measurements: Record<number, PageFitMeasurement>) => {
    const entries = Object.entries(measurements);
    if (entries.length === 0) {
      return;
    }

    setLatestMeasuredPages((current) => {
      let changed = false;
      const next = { ...current };
      for (const [pageNumber, measurement] of entries) {
        const numericPageNumber = Number(pageNumber);
        if (
          current[numericPageNumber] &&
          JSON.stringify(current[numericPageNumber]) === JSON.stringify(measurement)
        ) {
          continue;
        }
        next[numericPageNumber] = measurement;
        changed = true;
      }
      return changed ? next : current;
    });
  }, []);

  const clearOverflowFlags = useCallback(
    (pageNumbers: number[]) => {
      for (const pageNumber of [...new Set(pageNumbers)]) {
        if (Number.isFinite(pageNumber) && pageNumber > 0) {
          recordHtmlOverflow(pageNumber, false);
        }
      }
    },
    [recordHtmlOverflow],
  );

  const handleHtmlPageOverflow = useCallback(
    (pageNumber: number, overflows: boolean) => {
      recordHtmlOverflow(pageNumber, overflows);
    },
    [recordHtmlOverflow],
  );

  const handleHtmlPageMeasurement = useCallback(
    (measurement: PageFitMeasurement) => {
      const failed = hasPageFitFailure(
        measurement,
        generatedHtmlReport?.pageCount ?? project?.pages.length ?? null,
      );
      recordHtmlOverflow(measurement.pageNumber, failed);
      setLatestMeasuredPages((current) => {
        const previous = current[measurement.pageNumber];
        if (previous && JSON.stringify(previous) === JSON.stringify(measurement)) {
          return current;
        }
        return {
          ...current,
          [measurement.pageNumber]: measurement,
        };
      });
      setDeckReview((current) => {
        if (
          current.phase === "idle" ||
          !currentDeckReviewKey ||
          current.reportKey !== currentDeckReviewKey
        ) {
          return current;
        }

        const previous = current.measurements[measurement.pageNumber];
        if (
          previous &&
          JSON.stringify(previous) === JSON.stringify(measurement)
        ) {
          return current;
        }

        return {
          ...current,
          measurements: {
            ...current.measurements,
            [measurement.pageNumber]: measurement,
          },
        };
      });
    },
    [currentDeckReviewKey, generatedHtmlReport?.pageCount, project?.pages.length, recordHtmlOverflow],
  );

  const persistCompletedAutoOptimizedReportKey = useCallback((reportKey: string | null) => {
    if (!reportKey) {
      return;
    }

    const latestProject = useWorkbenchStudioStore.getState().document.project;
    if (
      !latestProject ||
      hasPersistedCompletedAutoOptimization(latestProject.deckOptimization, reportKey)
    ) {
      return;
    }

    replaceCurrentProject(
      {
        ...latestProject,
        deckOptimization: {
          autoOptimizedReportKey: reportKey,
          autoOptimizedVersion: COMPLETED_AUTO_OPTIMIZATION_VERSION,
        },
        updatedAt: new Date().toISOString(),
      },
      {
        history: false,
        mode: "editor",
      },
    );
  }, [replaceCurrentProject]);

  const queueDeckReview = useCallback(
    (
      briefSource: string,
      report: NonNullable<typeof generatedHtmlReport>,
      repairPass = 0,
      options?: {
        seededMeasurements?: Record<number, PageFitMeasurement>;
        pendingPages?: number[];
        startedAt?: number | null;
        mode?: "auto" | "manual";
        markAutoOptimized?: boolean;
        lastRepairMeasurements?: Record<number, PageFitMeasurement>;
      },
    ) => {
      const reportKey = buildDeckReviewKey(report);
      if (!reportKey) {
        return;
      }

      autoReviewedReportKeysRef.current.add(reportKey);
      setPropertiesVisible(false);
      if (options?.seededMeasurements) {
        seededMeasurementsByReportKeyRef.current[reportKey] = options.seededMeasurements;
        mergeLatestMeasuredPages(options.seededMeasurements);
      } else {
        delete seededMeasurementsByReportKeyRef.current[reportKey];
      }
      const pendingPages =
        options?.pendingPages && options.pendingPages.length > 0
          ? [...options.pendingPages].sort((left, right) => left - right)
          : Array.from({ length: report.pageCount }, (_, index) => index + 1);
      setDeckReview((current) => ({
        phase: "reviewing",
        mode: options?.mode ?? "auto",
        reportKey,
        briefSource,
        stage:
          repairPass > 0
            ? repairPass > 1
              ? "Reviewing aggressively repaired deck"
              : "Reviewing repaired deck"
            : "Reviewing generated deck",
        measurements: options?.seededMeasurements ?? {},
        pendingPages,
        failedPages: [],
        repairPass,
        warning: null,
        startedAt:
          options?.startedAt ??
          (current.reportKey === reportKey && current.startedAt
            ? current.startedAt
            : Date.now()),
        lastRepairMeasurements: options?.lastRepairMeasurements ?? {},
      }));
      setStatusLine(
        repairPass > 0
          ? repairPass > 1
            ? "Reviewing the aggressively repaired deck before editing unlocks."
            : "Reviewing the repaired deck before editing unlocks."
          : "Reviewing the generated deck for fit issues before editing unlocks.",
      );
    },
    [mergeLatestMeasuredPages, setPropertiesVisible, setStatusLine],
  );

  const handleReviewStreamEvent = useCallback((event: StudioGenerateStreamEvent) => {
    if (event.type === "run_started") {
      setDeckReview((current) => ({
        ...current,
        phase: "repairing",
        stage: "Starting auto-repair",
      }));
      return;
    }

    if (event.type === "stage_started") {
      setDeckReview((current) => ({
        ...current,
        phase: "repairing",
        stage: event.label,
      }));
      return;
    }

    if (event.type === "assistant_chunk") {
      setDeckReview((current) => ({
        ...current,
        phase: "repairing",
        stage: event.content || current.stage,
      }));
      return;
    }

    if (event.type === "error") {
      setDeckReview((current) => ({
        ...current,
        stage: "Auto-repair failed",
        warning: event.reason,
      }));
    }
  }, []);

  const runDeckRepair = useCallback(async (repairArgs: {
    briefSource: string;
    report: NonNullable<typeof generatedHtmlReport>;
    measurements: PageFitMeasurement[];
    repairPass: number;
    mode?: "auto" | "manual";
  }) => {
    if (!project) {
      return;
    }

    reviewAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    reviewAbortControllerRef.current = abortController;

    try {
      const result = await streamReviseHtmlReport(
        repairArgs.briefSource,
        repairArgs.report,
        repairArgs.measurements,
        briefAiSettings,
        {
          repairMode: repairArgs.repairPass > 1 ? "aggressive" : "standard",
          generationMode: project.generationMode,
          moduleUsageMode: project.moduleUsageMode,
          requestedPageCount: project.requestedPageCount,
          starterPackId: project.starterPackId,
          starterThemeId: project.starterThemeId,
          starterApplicationMode: project.starterApplicationMode,
          starterBindings: project.pages.flatMap((page, index) =>
            project.starterBindings[page.id] || page.starterLayoutId
              ? [
                  {
                    pageId: page.id,
                    pageNumber: index + 1,
                    starterId: project.starterBindings[page.id] ?? page.starterLayoutId ?? "",
                  },
                ]
              : [],
          ),
          signal: abortController.signal,
          onEvent: handleReviewStreamEvent,
        },
      );

      if (abortController.signal.aborted) {
        return;
      }

      if (result.provider !== "model" || !result.htmlReport) {
        setDeckReview({
          ...DEFAULT_DECK_REVIEW_STATE,
          warning:
            result.reason ??
            "Auto-repair failed, editing the original draft instead.",
        });
        setStatusLine(
          result.reason ??
            "Auto-repair failed, editing the original draft instead.",
        );
        return;
      }

      const repairedPages = createHtmlReportPages(result.htmlReport, repairArgs.briefSource);
      const asset = createGeneratedDraftAsset({
        draft: result.draft,
        signature: createGenerationSignature(
          repairArgs.briefSource,
          repairedPages,
          (project.templateId ?? "blank") as TemplateId,
        ),
        templateId: (project.templateId ?? "blank") as TemplateId,
        provider: result.provider,
        mode: "content",
        model: result.model,
        htmlReport: result.htmlReport,
      });

      updateGeneratedDraft({
        generatedDraft: asset,
        pages: repairedPages,
        projectName: result.htmlReport.title,
        workflowStage: "generated",
        label:
          repairArgs.repairPass > 1
            ? "Apply aggressive auto-repair"
            : "Auto-repair deck fit",
        scope: "generation",
        statusLine:
          repairArgs.repairPass > 1
            ? "Applied an aggressive repair pass to keep the deck inside the canvas."
            : "Applied automatic layout repairs to the generated deck.",
      });

      const repairedPageNumbers = repairArgs.measurements.map(
        (measurement) => measurement.pageNumber,
      );
      const seededMeasurements = Object.fromEntries(
        Object.entries(deckReview.measurements).filter(([pageNumber]) =>
          !repairedPageNumbers.includes(Number(pageNumber)),
        ),
      ) as Record<number, PageFitMeasurement>;
      const lastRepairMeasurements = Object.fromEntries(
        repairArgs.measurements.map((measurement) => [measurement.pageNumber, measurement]),
      ) as Record<number, PageFitMeasurement>;

      queueDeckReview(repairArgs.briefSource, result.htmlReport, repairArgs.repairPass, {
        seededMeasurements,
        pendingPages: repairedPageNumbers,
        startedAt: deckReview.startedAt,
        mode: repairArgs.mode ?? "auto",
        markAutoOptimized: (repairArgs.mode ?? "auto") === "auto",
        lastRepairMeasurements,
      });
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }

      const reason =
        error instanceof Error
          ? error.message
          : "Auto-repair failed, editing the original draft instead.";
      setDeckReview({
        ...DEFAULT_DECK_REVIEW_STATE,
        warning: reason,
      });
      setStatusLine(reason);
    } finally {
      if (reviewAbortControllerRef.current === abortController) {
        reviewAbortControllerRef.current = null;
      }
    }
  }, [
    briefAiSettings,
    deckReview.measurements,
    deckReview.startedAt,
    handleReviewStreamEvent,
    project,
    queueDeckReview,
    setStatusLine,
    updateGeneratedDraft,
  ]);

  const stopDeckOptimization = useCallback((message = "Optimization stopped. Editing the current draft.") => {
    reviewAbortControllerRef.current?.abort();
    reviewAbortControllerRef.current = null;
    mergeLatestMeasuredPages(deckReview.measurements);
    clearOverflowFlags([...deckReview.pendingPages, ...deckReview.failedPages]);
    setDeckReview({
      ...DEFAULT_DECK_REVIEW_STATE,
      warning: message,
    });
    setStatusLine(message);
  }, [
    clearOverflowFlags,
    deckReview.failedPages,
    deckReview.measurements,
    deckReview.pendingPages,
    mergeLatestMeasuredPages,
    setStatusLine,
  ]);

  const optimizeCurrentPage = useCallback(async () => {
    if (!project || !generatedHtmlReport || !currentPageMeasurement || isDeckReviewLocked) {
      return;
    }

    setDeckReview((current) => ({
      ...current,
      phase: "repairing",
      mode: "manual",
      stage: `Optimizing page ${currentPageMeasurement.pageNumber}`,
      failedPages: [currentPageMeasurement.pageNumber],
      repairPass: 1,
      warning: null,
      startedAt: Date.now(),
    }));
    setStatusLine(`Optimizing page ${currentPageMeasurement.pageNumber}.`);

    await runDeckRepair({
      briefSource: project.sourceText,
      report: generatedHtmlReport,
      measurements: [currentPageMeasurement],
      repairPass: 1,
      mode: "manual",
    });
  }, [
    currentPageMeasurement,
    generatedHtmlReport,
    isDeckReviewLocked,
    project,
    runDeckRepair,
    setStatusLine,
  ]);

  useEffect(() => {
    return () => {
      reviewAbortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    seededMeasurementsByReportKeyRef.current = {};
    setLatestMeasuredPages({});
  }, [project?.id]);

  useEffect(() => {
    if (!currentDeckReviewKey) {
      return;
    }

    const seededMeasurements = seededMeasurementsByReportKeyRef.current[currentDeckReviewKey];
    if (!seededMeasurements) {
      return;
    }

    mergeLatestMeasuredPages(seededMeasurements);
  }, [currentDeckReviewKey, mergeLatestMeasuredPages]);

  useEffect(() => {
    if (
      !project ||
      !generatedHtmlReport ||
      hasStreamingPreview ||
      isDeckReviewLocked ||
      !currentDeckReviewKey ||
      hasPersistedCompletedAutoOptimization(project.deckOptimization, currentDeckReviewKey) ||
      autoReviewedReportKeysRef.current.has(currentDeckReviewKey) ||
      Object.keys(selectionHtmlPageOverflows).length > 0
    ) {
      return;
    }

    autoReviewedReportKeysRef.current.add(currentDeckReviewKey);
    queueDeckReview(project.sourceText, generatedHtmlReport, 0, {
      mode: "auto",
      markAutoOptimized: true,
    });
  }, [
    currentDeckReviewKey,
    generatedHtmlReport,
    hasStreamingPreview,
    isDeckReviewLocked,
    project,
    queueDeckReview,
    selectionHtmlPageOverflows,
  ]);

  useEffect(() => {
    if (
      deckReview.phase !== "reviewing" ||
      !generatedHtmlReport ||
      !currentDeckReviewKey ||
      deckReview.reportKey !== currentDeckReviewKey
    ) {
      return;
    }

    const requiredPages =
      deckReview.pendingPages.length > 0
        ? deckReview.pendingPages
        : Array.from({ length: generatedHtmlReport.pageCount }, (_, index) => index + 1);
    const collectedMeasurements = Array.from({ length: generatedHtmlReport.pageCount }, (_, index) =>
      deckReview.measurements[index + 1],
    ).filter((measurement): measurement is PageFitMeasurement => Boolean(measurement));

    const hasAllRequiredMeasurements = requiredPages.every((pageNumber) =>
      Boolean(deckReview.measurements[pageNumber]),
    );
    if (!hasAllRequiredMeasurements) {
      return;
    }

    const reviewDecisions = Object.fromEntries(
      collectedMeasurements.map((measurement) => [
        measurement.pageNumber,
        resolvePageReviewDecision(measurement, generatedHtmlReport.pageCount),
      ]),
    );
    const hardFailMeasurements = collectedMeasurements.filter(
      (measurement) => reviewDecisions[measurement.pageNumber]?.severity === "hard-fail",
    );
    const softWarningMeasurements = collectedMeasurements.filter(
      (measurement) => reviewDecisions[measurement.pageNumber]?.severity === "soft-warning",
    );

    if (hardFailMeasurements.length === 0) {
      if (shouldPersistCompletedAutoOptimization(deckReview.mode)) {
        persistCompletedAutoOptimizedReportKey(deckReview.reportKey);
      }
      mergeLatestMeasuredPages(deckReview.measurements);
      const softWarningPageNumbers = softWarningMeasurements.map(
        (measurement) => measurement.pageNumber,
      );
      const baseSuccessMessage =
        deckReview.mode === "manual"
          ? `Page ${requiredPages[0] ?? currentCanvasPageNumber} optimization complete.`
          : deckReview.repairPass > 0
            ? "Auto-repair complete. Deck is ready to edit."
            : "Deck review complete. Editing is now unlocked.";
      const warning =
        softWarningPageNumbers.length > 0
          ? buildSoftWarningMessage(
              softWarningPageNumbers,
              deckReview.mode === "manual"
                ? "Optimization complete."
                : deckReview.repairPass > 0
                  ? "Auto-repair complete."
                  : "Review complete.",
            )
          : null;
      setDeckReview(
        warning
          ? {
              ...DEFAULT_DECK_REVIEW_STATE,
              warning,
            }
          : DEFAULT_DECK_REVIEW_STATE,
      );
      setStatusLine(warning ?? baseSuccessMessage);
      return;
    }

    const latestProject = useWorkbenchStudioStore.getState().document.project;
    const latestGeneratedDraft =
      latestProject?.generatedDraft ??
      latestProject?.generationHistory.at(-1)?.snapshot.generatedDraft ??
      project?.generatedDraft ??
      project?.generationHistory.at(-1)?.snapshot.generatedDraft;
    const templateId = (project?.templateId ?? latestProject?.templateId ?? "blank") as TemplateId;

    if (deckReview.mode === "auto") {
      const titleOnlyHardFails = hardFailMeasurements.filter((measurement) =>
        isTitleOnlyHardFail(measurement, generatedHtmlReport.pageCount),
      );
      if (titleOnlyHardFails.length > 0) {
        const deterministicTitleRepair = applyDeterministicTitleRepairToReport({
          report: generatedHtmlReport,
          measurements: titleOnlyHardFails,
        });
        if (deterministicTitleRepair) {
          const repairedPages = createHtmlReportPages(
            deterministicTitleRepair.report,
            deckReview.briefSource,
          );
          const signature = createGenerationSignature(
            deckReview.briefSource,
            repairedPages,
            templateId,
          );
          const asset = latestGeneratedDraft
            ? {
                ...latestGeneratedDraft,
                signature,
                generatedAt: new Date().toISOString(),
                htmlReport: deterministicTitleRepair.report,
              }
            : createGeneratedDraftAsset({
                draft: buildLayoutPlaceholderDraft({
                  title: deterministicTitleRepair.report.title,
                  subtitle: deckReview.briefSource,
                  pages: repairedPages,
                }),
                signature,
                templateId,
                provider: "local",
                mode: "content",
                model: null,
                htmlReport: deterministicTitleRepair.report,
              });
          updateGeneratedDraft({
            generatedDraft: asset,
            pages: repairedPages,
            projectName: deterministicTitleRepair.report.title,
            workflowStage: "generated",
            label: "Normalize leaked page titles",
            scope: "generation",
            statusLine: "Applied deterministic title cleanup before escalating to AI repair.",
          });

          const repairedPageNumbers = deterministicTitleRepair.repairedPageNumbers;
          const seededMeasurements = Object.fromEntries(
            Object.entries(deckReview.measurements).filter(([pageNumber]) =>
              !repairedPageNumbers.includes(Number(pageNumber)),
            ),
          ) as Record<number, PageFitMeasurement>;

          queueDeckReview(
            deckReview.briefSource,
            deterministicTitleRepair.report,
            deckReview.repairPass,
            {
              seededMeasurements,
              pendingPages: repairedPageNumbers,
              startedAt: deckReview.startedAt,
              mode: deckReview.mode,
              markAutoOptimized: true,
              lastRepairMeasurements: deckReview.lastRepairMeasurements,
            },
          );
          return;
        }
      }
    }

    if (deckReview.mode === "manual") {
      const failedLabel = formatPageLabelList(
        hardFailMeasurements.map((measurement) => measurement.pageNumber),
      );
      mergeLatestMeasuredPages(deckReview.measurements);
      setDeckReview({
        ...DEFAULT_DECK_REVIEW_STATE,
        warning: `Optimization finished, but ${failedLabel} still need manual cleanup.`,
      });
      setStatusLine(`Optimization finished, but ${failedLabel} still need manual cleanup.`);
      return;
    }

    if (deckReview.repairPass >= 2) {
      if (shouldPersistCompletedAutoOptimization(deckReview.mode)) {
        persistCompletedAutoOptimizedReportKey(deckReview.reportKey);
      }
      const failedLabel = formatPageLabelList(
        hardFailMeasurements.map((measurement) => measurement.pageNumber),
      );
      mergeLatestMeasuredPages(deckReview.measurements);
      setDeckReview({
        ...DEFAULT_DECK_REVIEW_STATE,
        warning: `Auto-repair improved the draft, but ${failedLabel} still need manual cleanup.`,
      });
      setStatusLine(
        `Auto-repair improved the draft, but ${failedLabel} still need manual cleanup.`,
      );
      return;
    }

    if (deckReview.repairPass > 0) {
      const repairedEntries = Object.entries(deckReview.lastRepairMeasurements);
      const materialImprovement =
        repairedEntries.length === 0 ||
        repairedEntries.some(([pageNumber, previousMeasurement]) => {
          const currentMeasurement = deckReview.measurements[Number(pageNumber)];
          if (!currentMeasurement) {
            return false;
          }
          return didPageReviewImprove({
            before: previousMeasurement,
            after: currentMeasurement,
            pageCount: generatedHtmlReport.pageCount,
          });
        });

      if (!materialImprovement) {
        if (shouldPersistCompletedAutoOptimization(deckReview.mode)) {
          persistCompletedAutoOptimizedReportKey(deckReview.reportKey);
        }
        const failedLabel = formatPageLabelList(
          hardFailMeasurements.map((measurement) => measurement.pageNumber),
        );
        mergeLatestMeasuredPages(deckReview.measurements);
        const warning = `Auto-repair stopped after one pass because ${failedLabel} did not materially improve. Manual cleanup is still needed.`;
        setDeckReview({
          ...DEFAULT_DECK_REVIEW_STATE,
          warning,
        });
        setStatusLine(warning);
        return;
      }
    }

    const isLongFormDeck =
      project?.generationMode === "long-form" || generatedHtmlReport.pageCount >= 10;
    const prioritizedFailedMeasurements = prioritizeRepairMeasurements(
      hardFailMeasurements,
      generatedHtmlReport.pageCount,
      currentCanvasPageNumber,
    );
    const candidateMeasurements =
      isLongFormDeck && deckReview.repairPass > 0
        ? prioritizedFailedMeasurements.filter((measurement) => {
            const pageClass = resolveDeckReviewPageClass(
              measurement.pageNumber,
              generatedHtmlReport.pageCount,
            );
            return pageClass !== "synthesis-support" && measurement.pageNumber <= 5;
          })
        : prioritizedFailedMeasurements;
    const repairMeasurements = candidateMeasurements.slice(
      0,
      isLongFormDeck && deckReview.repairPass > 0
        ? MAX_LONG_FORM_AGGRESSIVE_REPAIR_PAGES
        : MAX_AUTO_REPAIR_PAGES_PER_PASS,
    );
    if (repairMeasurements.length === 0) {
      if (shouldPersistCompletedAutoOptimization(deckReview.mode)) {
        persistCompletedAutoOptimizedReportKey(deckReview.reportKey);
      }
      const failedLabel = formatPageLabelList(
        hardFailMeasurements.map((measurement) => measurement.pageNumber),
      );
      mergeLatestMeasuredPages(deckReview.measurements);
      setDeckReview({
        ...DEFAULT_DECK_REVIEW_STATE,
        warning: `Studio unlocked the deck. ${failedLabel} still need manual cleanup.`,
      });
      setStatusLine(`Studio unlocked the deck. ${failedLabel} still need manual cleanup.`);
      return;
    }
    const deferredPageCount = Math.max(
      0,
      candidateMeasurements.length - repairMeasurements.length,
    );

    setDeckReview((current) => ({
      ...current,
      phase: "repairing",
      stage:
        deferredPageCount > 0
          ? `Repairing the ${repairMeasurements.length} worst-fit pages first`
          : current.repairPass > 0
            ? "Applying aggressive repair pass"
            : "Repairing overflowed pages",
      failedPages: repairMeasurements.map((measurement) => measurement.pageNumber),
    }));
    void runDeckRepair({
      briefSource: deckReview.briefSource,
      report: generatedHtmlReport,
      measurements: repairMeasurements,
      repairPass: deckReview.repairPass + 1,
      mode: "auto",
    });
  }, [
    currentCanvasPageNumber,
    currentDeckReviewKey,
    deckReview,
    generatedHtmlReport,
    project?.generationMode,
    project?.generatedDraft,
    project?.templateId,
    queueDeckReview,
    runDeckRepair,
    setStatusLine,
    mergeLatestMeasuredPages,
    persistCompletedAutoOptimizedReportKey,
    updateGeneratedDraft,
  ]);

  useEffect(() => {
    if (deckReview.phase !== "reviewing") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const warning = "Auto-review timed out, editing the current draft instead.";
      let didUnlock = false;
      let measurementsToMerge: Record<number, PageFitMeasurement> = {};
      let pagesToClear: number[] = [];

      setDeckReview((current) => {
        const next = resolveDeckReviewTimeoutState({
          current,
          expectedStartedAt: deckReview.startedAt,
          allowedPhases: ["reviewing"],
          warning,
        });
        didUnlock = next !== current;
        if (didUnlock) {
          measurementsToMerge = current.measurements;
          pagesToClear = [...current.pendingPages, ...current.failedPages];
        }
        return next;
      });

      if (!didUnlock) {
        return;
      }

      mergeLatestMeasuredPages(measurementsToMerge);
      clearOverflowFlags(pagesToClear);
      setStatusLine(warning);
    }, 12_000);

    return () => window.clearTimeout(timeoutId);
  }, [
    clearOverflowFlags,
    deckReview.failedPages,
    deckReview.measurements,
    deckReview.pendingPages,
    deckReview.phase,
    deckReview.reportKey,
    mergeLatestMeasuredPages,
    setStatusLine,
  ]);

  useEffect(() => {
    if (
      (deckReview.phase !== "reviewing" && deckReview.phase !== "repairing") ||
      !deckReview.startedAt
    ) {
      return;
    }

    const hardTimeoutMs =
      project?.generationMode === "long-form" ||
      (generatedHtmlReport?.pageCount ?? 0) >= 10
        ? LONG_FORM_DECK_REVIEW_HARD_TIMEOUT_MS
        : STANDARD_DECK_REVIEW_HARD_TIMEOUT_MS;
    const remainingMs =
      deckReview.startedAt + hardTimeoutMs - Date.now();
    if (remainingMs <= 0) {
      const warning =
        project?.generationMode === "long-form" ||
        (generatedHtmlReport?.pageCount ?? 0) >= 10
          ? "Long-form auto-review took too long, so Studio unlocked the current draft."
          : "Auto-review took too long, so Studio unlocked the current draft.";
      let didUnlock = false;
      let measurementsToMerge: Record<number, PageFitMeasurement> = {};
      let pagesToClear: number[] = [];

      setDeckReview((current) => {
        const next = resolveDeckReviewTimeoutState({
          current,
          expectedStartedAt: deckReview.startedAt,
          allowedPhases: ["reviewing", "repairing"],
          warning,
        });
        didUnlock = next !== current;
        if (didUnlock) {
          measurementsToMerge = current.measurements;
          pagesToClear = [...current.pendingPages, ...current.failedPages];
        }
        return next;
      });

      if (!didUnlock) {
        return;
      }

      mergeLatestMeasuredPages(measurementsToMerge);
      clearOverflowFlags(pagesToClear);
      setStatusLine(warning);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const warning =
        project?.generationMode === "long-form" ||
        (generatedHtmlReport?.pageCount ?? 0) >= 10
          ? "Long-form auto-review stopped and Studio unlocked the current draft."
          : "Auto-review took too long, so Studio unlocked the current draft.";
      let didUnlock = false;
      let measurementsToMerge: Record<number, PageFitMeasurement> = {};
      let pagesToClear: number[] = [];

      setDeckReview((current) => {
        const next = resolveDeckReviewTimeoutState({
          current,
          expectedStartedAt: deckReview.startedAt,
          allowedPhases: ["reviewing", "repairing"],
          warning,
        });
        didUnlock = next !== current;
        if (didUnlock) {
          measurementsToMerge = current.measurements;
          pagesToClear = [...current.pendingPages, ...current.failedPages];
        }
        return next;
      });

      if (!didUnlock) {
        return;
      }

      mergeLatestMeasuredPages(measurementsToMerge);
      clearOverflowFlags(pagesToClear);
      setStatusLine(warning);
    }, remainingMs);

    return () => window.clearTimeout(timeoutId);
  }, [
    clearOverflowFlags,
    deckReview.failedPages,
    deckReview.measurements,
    deckReview.pendingPages,
    deckReview.phase,
    deckReview.startedAt,
    generatedHtmlReport?.pageCount,
    mergeLatestMeasuredPages,
    project?.generationMode,
    setStatusLine,
  ]);

  return {
    deckReview,
    latestMeasuredPages,
    isDeckReviewLocked,
    currentDeckReviewKey,
    currentPageMeasurement,
    handleHtmlPageOverflow,
    handleHtmlPageMeasurement,
    queueDeckReview,
    stopDeckOptimization,
    optimizeCurrentPage,
  };
}
