import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import type { StudioGenerateStreamEvent } from "@/features/studio/generation";
import {
  DEFAULT_STREAM_UI_STATE,
  type StreamPreviewPageState,
  type StreamUiState,
} from "../runtime-shell-contract";

type UseStudioTranscriptStateArgs = {
  projectName: string | null | undefined;
  setPropertiesVisible: Dispatch<SetStateAction<boolean>>;
  setPagesStripVisible: Dispatch<SetStateAction<boolean>>;
  setCurrentCanvasPageId: (pageId: string | null) => void;
  streamUi: StreamUiState;
  setStreamUi: Dispatch<SetStateAction<StreamUiState>>;
};

export function useStudioTranscriptState(args: UseStudioTranscriptStateArgs) {
  const {
    projectName,
    setPropertiesVisible,
    setPagesStripVisible,
    setCurrentCanvasPageId,
    streamUi,
    setStreamUi,
  } = args;

  const resetStreamUi = useCallback(() => {
    setStreamUi(DEFAULT_STREAM_UI_STATE);
  }, [setStreamUi]);

  const appendStreamTranscript = useCallback(
    (text: string) => {
      if (!text.trim()) {
        return;
      }

      setStreamUi((current) => ({
        ...current,
        transcriptTarget: `${current.transcriptTarget}${current.transcriptTarget ? "\n\n" : ""}${text.trim()}`,
      }));
    },
    [setStreamUi],
  );

  const appendUniqueStreamTranscript = useCallback(
    (text: string) => {
      const normalized = text.trim();
      if (!normalized) {
        return;
      }

      setStreamUi((current) => {
        const existingLines = current.transcriptTarget
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        if (existingLines.includes(normalized)) {
          return current;
        }
        return {
          ...current,
          transcriptTarget: `${current.transcriptTarget}${current.transcriptTarget ? "\n" : ""}${normalized}`,
        };
      });
    },
    [setStreamUi],
  );

  const initializeStreamPlaceholders = useCallback(
    (pageTitles: string[], deckTitle: string) => {
      setStreamUi((current) => ({
        ...current,
        pageTitles,
        expectedPageCount: pageTitles.length,
        deckTitle: deckTitle || current.deckTitle,
        partialPages: pageTitles.map((title, index) => ({
          pageNumber: index + 1,
          title,
          srcDoc: null,
          status: "pending",
          stage: "pending",
        })),
      }));
    },
    [setStreamUi],
  );

  const handleStreamEvent = useCallback(
    (event: StudioGenerateStreamEvent) => {
      if (event.type === "run_started") {
        setStreamUi({
          ...DEFAULT_STREAM_UI_STATE,
          runId: event.runId,
          isStreaming: true,
          stage: "Preparing generation",
        });
        setPropertiesVisible(false);
        setPagesStripVisible(true);
        return;
      }

      if (event.type === "stage_started") {
        setStreamUi((current) => ({
          ...current,
          stage: event.label,
          expectedPageCount: event.expectedPageCount ?? current.expectedPageCount,
          pageTitles: event.pageTitles ?? current.pageTitles,
          deckTitle:
            current.deckTitle === DEFAULT_STREAM_UI_STATE.deckTitle && projectName
              ? projectName
              : current.deckTitle,
        }));
        if (event.stage === "planning") {
          return;
        }
        if (event.stage === "evidence") {
          return;
        }
        if (event.stage === "modules") {
          return;
        }
        if (event.stage === "pages" && event.pageTitles?.length) {
          initializeStreamPlaceholders(event.pageTitles, projectName ?? "Streaming preview");
        }
        return;
      }

      if (event.type === "assistant_chunk") {
        return;
      }

      if (event.type === "page_started") {
        setStreamUi((current) => ({
          ...current,
          partialPages: (
            current.partialPages.length > 0
              ? current.partialPages.map((page) =>
                  page.pageNumber === event.pageNumber
                    ? { ...page, title: event.pageTitle, stage: "generating" as const }
                    : page,
                )
              : [
                  ...current.partialPages,
                  {
                    pageNumber: event.pageNumber,
                    title: event.pageTitle,
                    srcDoc: null,
                    status: "pending" as const,
                    stage: "generating" as const,
                  },
                ]
          ) satisfies StreamPreviewPageState[],
        }));
        setCurrentCanvasPageId(String(event.pageNumber));
        appendUniqueStreamTranscript(`Page ${event.pageNumber}: ${event.pageTitle}`);
        return;
      }

      if (event.type === "page_ready") {
        setStreamUi((current) => {
          const nextPages = (
            current.partialPages.length > 0
              ? current.partialPages.map((page) =>
                  page.pageNumber === event.pageNumber
                    ? {
                        ...page,
                        title: event.pageTitle,
                        srcDoc: event.pageHtml,
                        status: "ready" as const,
                        stage: "ready" as const,
                      }
                    : page,
                )
              : [
                  ...current.partialPages,
                  {
                    pageNumber: event.pageNumber,
                    title: event.pageTitle,
                    srcDoc: event.pageHtml,
                    status: "ready" as const,
                    stage: "ready" as const,
                  },
                ]
          ) satisfies StreamPreviewPageState[];

          return {
            ...current,
            partialPages: [...nextPages].sort(
              (left, right) => left.pageNumber - right.pageNumber,
            ),
          };
        });
        setCurrentCanvasPageId(String(event.pageNumber));
        return;
      }

      if (event.type === "final_report") {
        setStreamUi((current) => ({
          ...current,
          stage: "Finalizing editable deck",
          deckTitle: event.report.title || current.deckTitle,
          pageTitles: event.report.pageTitles.length
            ? event.report.pageTitles
            : current.pageTitles,
          expectedPageCount: event.report.pageCount || current.expectedPageCount,
        }));
        return;
      }

      if (event.type === "error") {
        setStreamUi((current) => ({
          ...current,
          isStreaming: false,
          error: event.reason,
          stage: "Generation failed",
          partialPages: current.partialPages.map((page) =>
            page.srcDoc
              ? page
              : {
                  ...page,
                  status: "error",
                  stage: "error",
                },
          ),
        }));
        appendStreamTranscript(`[Error]\n${event.reason}`);
      }
    },
    [
      appendUniqueStreamTranscript,
      appendStreamTranscript,
      initializeStreamPlaceholders,
      projectName,
      setCurrentCanvasPageId,
      setPagesStripVisible,
      setPropertiesVisible,
      setStreamUi,
    ],
  );

  useEffect(() => {
    if (streamUi.transcriptRendered.length >= streamUi.transcriptTarget.length) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStreamUi((current) => ({
        ...current,
        transcriptRendered: current.transcriptTarget.slice(
          0,
          Math.min(current.transcriptTarget.length, current.transcriptRendered.length + 3),
        ),
      }));
    }, 12);

    return () => window.clearTimeout(timeoutId);
  }, [setStreamUi, streamUi.transcriptRendered, streamUi.transcriptTarget]);

  return {
    streamUi,
    setStreamUi,
    resetStreamUi,
    appendStreamTranscript,
    handleStreamEvent,
  };
}
