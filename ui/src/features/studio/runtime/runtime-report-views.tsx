import { useEffect, useMemo, useRef, useState } from "react";
import { SlideSceneCanvas } from "@/features/studio/slide-scene-renderer";
import type {
  GeneratedHtmlReport,
  HtmlCanvasFrame,
  HtmlCanvasTransform,
  HtmlVisualNodeKind,
  LayoutPage,
  WorkflowStage,
  WorkbenchDraft,
} from "@/features/studio/types";
import type { PageFitMeasurement } from "@/features/studio/generation";
import {
  HtmlReportPreviewFrame,
} from "./runtime-preview-frame";
import {
  buildHtmlReportPagePreviews,
  HTML_REPORT_PAGE_HEIGHT,
  HTML_REPORT_PAGE_WIDTH,
  type HtmlReportPagePreview,
} from "./runtime-export-annotations";
import { resolveCanvasPageViewportRadius } from "./runtime-report-view-math";
import { StorylineStructureCanvas } from "./runtime-storyline";
import type { StreamingReportPage } from "./runtime-types";
import type { PreviewSelectionPreference } from "./preview-selection";

const HTML_REPORT_MIN_SCALE = 0.24;
const HTML_REPORT_MAX_SCALE = 1.4;
const HTML_REPORT_CLASSIC_AUTO_MIN_SCALE = 0.72;
const HTML_REPORT_CANVAS_PADDING_X = 72;
const HTML_REPORT_CANVAS_PADDING_Y = 88;

function HtmlReportThumbnail({
  htmlReport,
}: {
  htmlReport: GeneratedHtmlReport;
}) {
  const pagePreview = useMemo(
    () => buildHtmlReportPagePreviews(htmlReport)[0] ?? null,
    [htmlReport],
  );

  if (!pagePreview) {
    return (
      <div className="aspect-[16/9] bg-[linear-gradient(180deg,#182633_0%,#111b25_100%)]" />
    );
  }

  const previewScale = 0.14;
  const scaledWidth = Math.round(HTML_REPORT_PAGE_WIDTH * previewScale);
  const scaledHeight = Math.round(HTML_REPORT_PAGE_HEIGHT * previewScale);

  return (
    <div className="relative aspect-[16/9] overflow-hidden bg-[#d8d3cb]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0)_58%)]" />
      <div className="absolute left-1/2 top-1/2" style={{ width: `${scaledWidth}px`, height: `${scaledHeight}px`, transform: "translate(-50%, -50%)" }}>
        <HtmlReportPreviewFrame
          htmlReportTitle={htmlReport.title}
          pagePreview={pagePreview}
          pageCount={htmlReport.pageCount}
          previewScale={previewScale}
          interactive={false}
        />
      </div>
    </div>
  );
}

type WorkbenchReportCanvasMode = "classic" | "immersive";
type WorkbenchReportScaleMode = "fit" | "manual";

function HtmlReportFrame({
  htmlReport,
  rootId,
  selectedPageNumber,
  selectedBlockId,
  selectedVisualNodeId,
  onSelectBlock,
  onSelectVisualNode,
  onQuickEditBlock,
  onCommitBlockTransform,
  onCommitVisualTransform,
  onReturnBlockToFlow,
  onReturnVisualToFlow,
  onShiftBlockLayer,
  onShiftVisualLayer,
  onHtmlPageOverflow,
  onHtmlPageMeasurement,
  preferredSelectionType = "page",
  selectedBlockTransform,
  selectedVisualTransform,
}: {
  htmlReport: GeneratedHtmlReport;
  rootId?: string;
  selectedPageNumber?: number | null;
  selectedBlockId?: string | null;
  selectedVisualNodeId?: string | null;
  onSelectBlock?: (pageNumber: number, blockId: string) => void;
  onSelectVisualNode?: (
    pageNumber: number,
    nodeId: string,
    kind: HtmlVisualNodeKind,
  ) => void;
  onQuickEditBlock?: (
    pageNumber: number,
    blockId: string,
    nextContent: { text?: string; items?: string[] },
  ) => void;
  onCommitBlockTransform?: (
    pageNumber: number,
    blockId: string,
    frame: HtmlCanvasFrame,
    fontSize?: number,
  ) => void;
  onCommitVisualTransform?: (
    pageNumber: number,
    nodeId: string,
    frame: HtmlCanvasFrame,
  ) => void;
  onReturnBlockToFlow?: (pageNumber: number, blockId: string) => void;
  onReturnVisualToFlow?: (pageNumber: number, nodeId: string) => void;
  onShiftBlockLayer?: (
    pageNumber: number,
    blockId: string,
    direction: "forward" | "backward",
    frame: HtmlCanvasFrame,
    fontSize?: number,
  ) => void;
  onShiftVisualLayer?: (
    pageNumber: number,
    nodeId: string,
    direction: "forward" | "backward",
    frame: HtmlCanvasFrame,
  ) => void;
  onHtmlPageOverflow?: (pageNumber: number, overflows: boolean) => void;
  onHtmlPageMeasurement?: (measurement: PageFitMeasurement) => void;
  preferredSelectionType?: PreviewSelectionPreference;
  selectedBlockTransform?: HtmlCanvasTransform | null;
  selectedVisualTransform?: HtmlCanvasTransform | null;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [manualScale, setManualScale] = useState<number | null>(null);
  const pagePreviews = useMemo(() => buildHtmlReportPagePreviews(htmlReport), [htmlReport]);

  useEffect(() => {
    const node = frameRef.current;
    if (!node || typeof window === "undefined") {
      return;
    }

    const measure = () => setContainerWidth(node.clientWidth);
    measure();

    const observer = new window.ResizeObserver(() => {
      measure();
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  const fitScale = useMemo(() => {
    if (!containerWidth) {
      return 0.76;
    }

    const nextScale = (containerWidth - 32) / HTML_REPORT_PAGE_WIDTH;
    return Math.max(HTML_REPORT_MIN_SCALE, Math.min(1, nextScale));
  }, [containerWidth]);

  const autoScale = useMemo(() => {
    return Math.max(fitScale, HTML_REPORT_CLASSIC_AUTO_MIN_SCALE);
  }, [fitScale]);

  const previewScale = manualScale ?? autoScale;

  function clampScale(nextScale: number) {
    return Math.max(HTML_REPORT_MIN_SCALE, Math.min(HTML_REPORT_MAX_SCALE, Number(nextScale.toFixed(2))));
  }

  function zoomBy(delta: number) {
    const base = manualScale ?? autoScale;
    setManualScale(clampScale(base + delta));
  }

  return (
    <div data-ppt-report-root={rootId} ref={frameRef} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#d7d1c6] bg-[rgba(247,243,235,0.94)] px-4 py-3 shadow-[0_10px_26px_rgba(15,23,31,0.05)]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#72828c]">
          Preview
        </div>

        <div className="flex items-center gap-2 rounded-full border border-[#ddd5ca] bg-white px-2 py-1.5 text-[12px] font-semibold text-[#243b4b]">
          <button
            type="button"
            onClick={() => zoomBy(-0.1)}
            className="rounded-full px-2.5 py-1 transition hover:bg-[#eef2f4]"
            aria-label="Zoom out"
            title="Zoom out"
          >
            -
          </button>
          <div className="min-w-[56px] text-center tabular-nums">{Math.round(previewScale * 100)}%</div>
          <button
            type="button"
            onClick={() => zoomBy(0.1)}
            className="rounded-full px-2.5 py-1 transition hover:bg-[#eef2f4]"
            aria-label="Zoom in"
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setManualScale(null)}
            className={[
              "rounded-full px-3 py-1 transition",
              manualScale === null ? "bg-[#102838] text-white" : "hover:bg-[#eef2f4]",
            ].join(" ")}
          >
            Auto
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {pagePreviews.map((pagePreview) => {
          const scaledWidth = Math.round(HTML_REPORT_PAGE_WIDTH * previewScale);
          const scaledHeight = Math.round(HTML_REPORT_PAGE_HEIGHT * previewScale);

          return (
            <section
              key={`html-preview-page-${pagePreview.pageNumber}`}
              id={`ppt-page-${pagePreview.pageNumber}`}
              className="rounded-[28px] border border-[#d8d1c3] bg-[rgba(246,241,233,0.9)] p-5 shadow-[0_22px_48px_rgba(15,23,31,0.08)]"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a8892]">
                    Page {pagePreview.pageNumber}
                  </div>
                  <div
                    className="mt-1 text-[1.1rem] leading-none text-[#122a39]"
                    style={{ fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif' }}
                  >
                    {pagePreview.title}
                  </div>
                </div>
                <div className="text-[12px] text-[#6d7d87]">
                  Canvas {HTML_REPORT_PAGE_WIDTH} × {HTML_REPORT_PAGE_HEIGHT}
                </div>
              </div>

              <div className="overflow-auto rounded-[22px] border border-[#dad3c6] bg-[#ddd9d3] p-4">
                <div style={{ width: `${scaledWidth}px`, height: `${scaledHeight}px` }}>
                  <HtmlReportPreviewFrame
                    htmlReportTitle={htmlReport.title}
                    pagePreview={pagePreview}
                    pageCount={htmlReport.pageCount}
                    previewScale={previewScale}
                    onSelectVisualNode={onSelectVisualNode}
                    onSelectBlock={onSelectBlock}
                    onQuickEditBlock={onQuickEditBlock}
                    onCommitBlockTransform={onCommitBlockTransform}
                    onCommitVisualTransform={onCommitVisualTransform}
                    onReturnBlockToFlow={onReturnBlockToFlow}
                    onReturnVisualToFlow={onReturnVisualToFlow}
                    onShiftBlockLayer={onShiftBlockLayer}
                    onShiftVisualLayer={onShiftVisualLayer}
                    onPageOverflow={onHtmlPageOverflow}
                    onPageMeasurement={onHtmlPageMeasurement}
                    preferredSelectionType={preferredSelectionType}
                    selectedBlockId={
                      selectedPageNumber === pagePreview.pageNumber ? selectedBlockId : null
                    }
                    selectedBlockTransform={
                      selectedPageNumber === pagePreview.pageNumber ? selectedBlockTransform : null
                    }
                    selectedVisualNodeId={
                      selectedPageNumber === pagePreview.pageNumber ? selectedVisualNodeId : null
                    }
                    selectedVisualTransform={
                      selectedPageNumber === pagePreview.pageNumber ? selectedVisualTransform : null
                    }
                  />
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function HtmlReportPageThumbnails({
  htmlReport,
  selectedPageNumber,
  onSelectPage,
  overflowMap,
}: {
  htmlReport: GeneratedHtmlReport;
  selectedPageNumber?: number | null;
  onSelectPage: (pageNumber: number) => void;
  overflowMap?: Record<number, boolean>;
}) {
  const pagePreviews = useMemo(() => buildHtmlReportPagePreviews(htmlReport), [htmlReport]);
  const previewScale = 0.11;

  return (
    <div className="space-y-3">
      {pagePreviews.map((pagePreview) => {
        const scaledWidth = Math.round(HTML_REPORT_PAGE_WIDTH * previewScale);
        const scaledHeight = Math.round(HTML_REPORT_PAGE_HEIGHT * previewScale);
        const selected = selectedPageNumber === pagePreview.pageNumber;
        const overflow = overflowMap?.[pagePreview.pageNumber] === true;

        return (
          <button
            key={`html-preview-thumb-${pagePreview.pageNumber}`}
            type="button"
            onClick={() => onSelectPage(pagePreview.pageNumber)}
            className={[
              "w-full rounded-[20px] border p-3 text-left transition",
              selected
                ? "border-[rgba(0,242,255,0.32)] bg-[rgba(0,242,255,0.08)]"
                : "border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.16)]",
            ].join(" ")}
          >
            <div className="overflow-hidden rounded-[14px] border border-[var(--studio-line)] bg-[#090909] p-2">
              <div
                className="mx-auto"
                style={{ width: `${scaledWidth}px`, height: `${scaledHeight}px` }}
              >
                <HtmlReportPreviewFrame
                  htmlReportTitle={htmlReport.title}
                  pagePreview={pagePreview}
                  pageCount={htmlReport.pageCount}
                  previewScale={previewScale}
                  interactive={false}
                />
              </div>
            </div>

            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                  Page {pagePreview.pageNumber}
                </div>
                <div className="mt-1 truncate text-[12px] font-semibold text-[var(--studio-ink)]">
                  {pagePreview.title}
                </div>
              </div>
              {overflow ? (
                <span className="rounded-full border border-[rgba(0,242,255,0.24)] bg-[rgba(0,242,255,0.08)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--studio-accent)]">
                  Overflow
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function HtmlReportPageFilmstrip({
  htmlReport,
  selectedPageNumber,
  onSelectPage,
  overflowMap,
}: {
  htmlReport: GeneratedHtmlReport;
  selectedPageNumber?: number | null;
  onSelectPage: (pageNumber: number) => void;
  overflowMap?: Record<number, boolean>;
}) {
  const pagePreviews = useMemo(() => buildHtmlReportPagePreviews(htmlReport), [htmlReport]);
  const previewScale = 0.08;

  return (
    <div className="flex items-start gap-3 overflow-x-auto pb-1">
      {pagePreviews.map((pagePreview) => {
        const scaledWidth = Math.round(HTML_REPORT_PAGE_WIDTH * previewScale);
        const scaledHeight = Math.round(HTML_REPORT_PAGE_HEIGHT * previewScale);
        const selected = selectedPageNumber === pagePreview.pageNumber;
        const overflow = overflowMap?.[pagePreview.pageNumber] === true;

        return (
          <button
            key={`html-preview-filmstrip-${pagePreview.pageNumber}`}
            type="button"
            onClick={() => onSelectPage(pagePreview.pageNumber)}
            data-testid={`filmstrip-page-${pagePreview.pageNumber}`}
            data-page-overflow-state={overflow ? "overflow" : "fit"}
            className={[
              "group min-w-[148px] max-w-[148px] border-b-2 px-1 pb-1 pt-0 text-left transition",
              selected
                ? "border-[rgba(0,242,255,0.85)]"
                : "border-transparent hover:border-[rgba(255,255,255,0.22)]",
            ].join(" ")}
          >
            <div className="overflow-hidden rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[#090909] p-1.5">
              <div
                className="mx-auto"
                style={{ width: `${scaledWidth}px`, height: `${scaledHeight}px` }}
              >
                <HtmlReportPreviewFrame
                  htmlReportTitle={htmlReport.title}
                  pagePreview={pagePreview}
                  pageCount={htmlReport.pageCount}
                  previewScale={previewScale}
                  interactive={false}
                />
              </div>
            </div>

            <div className="mt-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--studio-muted)]">
                  Page {pagePreview.pageNumber}
                </div>
                <div className="mt-1 truncate text-[11px] font-medium text-[var(--studio-ink)]">
                  {pagePreview.title}
                </div>
              </div>
              {overflow ? (
                <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--studio-accent)]">
                  !
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function HtmlReportCanvasFrame({
  htmlReport,
  rootId,
  selectedPageNumber,
  selectedBlockId,
  selectedVisualNodeId,
  onSelectBlock,
  onSelectVisualNode,
  onQuickEditBlock,
  onCommitBlockTransform,
  onCommitVisualTransform,
  onReturnBlockToFlow,
  onReturnVisualToFlow,
  onShiftBlockLayer,
  onShiftVisualLayer,
  onHtmlPageOverflow,
  onHtmlPageMeasurement,
  scaleMode = "fit",
  scale = null,
  onResolvedScaleChange,
  onVisiblePageChange,
  preferredSelectionType = "page",
  selectedBlockTransform,
  selectedVisualTransform,
}: {
  htmlReport: GeneratedHtmlReport;
  rootId?: string;
  selectedPageNumber?: number | null;
  selectedBlockId?: string | null;
  selectedVisualNodeId?: string | null;
  onSelectBlock?: (pageNumber: number, blockId: string) => void;
  onSelectVisualNode?: (
    pageNumber: number,
    nodeId: string,
    kind: HtmlVisualNodeKind,
  ) => void;
  onQuickEditBlock?: (
    pageNumber: number,
    blockId: string,
    nextContent: { text?: string; items?: string[] },
  ) => void;
  onCommitBlockTransform?: (
    pageNumber: number,
    blockId: string,
    frame: HtmlCanvasFrame,
    fontSize?: number,
  ) => void;
  onCommitVisualTransform?: (
    pageNumber: number,
    nodeId: string,
    frame: HtmlCanvasFrame,
  ) => void;
  onReturnBlockToFlow?: (pageNumber: number, blockId: string) => void;
  onReturnVisualToFlow?: (pageNumber: number, nodeId: string) => void;
  onShiftBlockLayer?: (
    pageNumber: number,
    blockId: string,
    direction: "forward" | "backward",
    frame: HtmlCanvasFrame,
    fontSize?: number,
  ) => void;
  onShiftVisualLayer?: (
    pageNumber: number,
    nodeId: string,
    direction: "forward" | "backward",
    frame: HtmlCanvasFrame,
  ) => void;
  onHtmlPageOverflow?: (pageNumber: number, overflows: boolean) => void;
  onHtmlPageMeasurement?: (measurement: PageFitMeasurement) => void;
  scaleMode?: WorkbenchReportScaleMode;
  scale?: number | null;
  onResolvedScaleChange?: (scale: number) => void;
  onVisiblePageChange?: (pageNumber: number) => void;
  preferredSelectionType?: PreviewSelectionPreference;
  selectedBlockTransform?: HtmlCanvasTransform | null;
  selectedVisualTransform?: HtmlCanvasTransform | null;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Record<number, HTMLElement | null>>({});
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const pagePreviews = useMemo(() => buildHtmlReportPagePreviews(htmlReport), [htmlReport]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || typeof window === "undefined") {
      return;
    }

    const measure = () => {
      setContainerWidth(node.clientWidth);
      setContainerHeight(node.clientHeight);
    };
    measure();

    const observer = new window.ResizeObserver(() => {
      measure();
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const fitScale = useMemo(() => {
    if (!containerWidth || !containerHeight) {
      return 1;
    }

    const nextScale = Math.min(
      (containerWidth - HTML_REPORT_CANVAS_PADDING_X * 2) / HTML_REPORT_PAGE_WIDTH,
      (containerHeight - HTML_REPORT_CANVAS_PADDING_Y * 2) / HTML_REPORT_PAGE_HEIGHT,
      1,
    );
    return Math.max(HTML_REPORT_MIN_SCALE, Math.min(1, nextScale));
  }, [containerHeight, containerWidth]);

  const resolvedScale = useMemo(() => {
    if (scaleMode === "manual" && scale !== null) {
      return Math.max(
        HTML_REPORT_MIN_SCALE,
        Math.min(HTML_REPORT_MAX_SCALE, Number(scale.toFixed(2))),
      );
    }

    return Math.max(HTML_REPORT_MIN_SCALE, fitScale);
  }, [fitScale, scale, scaleMode]);

  const scaledWidth = Math.round(HTML_REPORT_PAGE_WIDTH * resolvedScale);
  const scaledHeight = Math.round(HTML_REPORT_PAGE_HEIGHT * resolvedScale);
  const pageViewportRadius = resolveCanvasPageViewportRadius(resolvedScale);
  const workspaceWidth = Math.max(
    containerWidth,
    scaledWidth + HTML_REPORT_CANVAS_PADDING_X * 2,
  );
  const workspaceHeight = Math.max(
    containerHeight,
    scaledHeight + HTML_REPORT_CANVAS_PADDING_Y * 2,
  );
  const singlePageMinHeight =
    pagePreviews.length === 1
      ? Math.max(containerHeight - 24, scaledHeight + 24)
      : 0;

  useEffect(() => {
    onResolvedScaleChange?.(resolvedScale);
  }, [onResolvedScaleChange, resolvedScale]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || typeof window === "undefined" || pagePreviews.length === 0) {
      return;
    }

    const observer = new window.IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        if (!visible) {
          return;
        }

        const pageNumber = Number.parseInt(
          (visible.target as HTMLElement).dataset.pageNumber ?? "",
          10,
        );
        if (Number.isFinite(pageNumber)) {
          onVisiblePageChange?.(pageNumber);
        }
      },
      {
        root,
        threshold: [0.2, 0.45, 0.72],
      },
    );

    const observed = pagePreviews
      .map((pagePreview) => pageRefs.current[pagePreview.pageNumber])
      .filter((node): node is HTMLElement => Boolean(node));

    observed.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [onVisiblePageChange, pagePreviews, resolvedScale]);

  return (
    <div
      ref={scrollRef}
      data-ppt-report-root={rootId}
      className="h-full overflow-auto overscroll-contain bg-[#040404] px-3 py-3 md:px-5 md:py-5"
    >
      <div className="relative mx-auto min-h-full w-full">
        <div
          className="relative mx-auto overflow-hidden rounded-[30px] border border-[rgba(255,255,255,0.06)] bg-[rgba(7,7,7,0.82)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_28px_80px_rgba(0,0,0,0.42)]"
          style={{
            width: `${workspaceWidth}px`,
            minHeight: `${workspaceHeight}px`,
            backgroundImage: [
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
              "linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
              "radial-gradient(circle at center, rgba(0,242,255,0.06) 0%, rgba(0,0,0,0) 62%)",
            ].join(","),
            backgroundSize: "28px 28px, 28px 28px, 100% 100%",
            backgroundPosition: "center center",
          }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.05),_transparent_44%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />

          <div
            className="relative space-y-10 px-8 py-10 md:px-12 md:py-12"
            style={{
              minHeight: singlePageMinHeight ? `${singlePageMinHeight}px` : undefined,
            }}
          >
          {pagePreviews.map((pagePreview) => {
            const selected = selectedPageNumber === pagePreview.pageNumber;

            return (
              <section
                key={`html-canvas-page-${pagePreview.pageNumber}`}
                id={`ppt-page-${pagePreview.pageNumber}`}
                data-page-number={pagePreview.pageNumber}
                ref={(node) => {
                  pageRefs.current[pagePreview.pageNumber] = node;
                }}
                className={[
                  "flex justify-center",
                  pagePreviews.length === 1 ? "items-center" : "",
                ].join(" ")}
                style={{
                  minHeight: pagePreviews.length === 1 ? `${singlePageMinHeight}px` : undefined,
                }}
              >
                <div
                  className={[
                    "relative overflow-hidden rounded-[10px] border transition-shadow",
                    selected
                      ? "border-[rgba(0,242,255,0.32)] shadow-[0_0_0_1px_rgba(0,242,255,0.24),0_22px_56px_rgba(0,0,0,0.44)]"
                      : "border-[rgba(255,255,255,0.08)] shadow-[0_18px_42px_rgba(0,0,0,0.32)]",
                  ].join(" ")}
                  style={{
                    width: `${scaledWidth}px`,
                    height: `${scaledHeight}px`,
                    borderRadius: `${pageViewportRadius}px`,
                  }}
                >
                  <HtmlReportPreviewFrame
                    htmlReportTitle={htmlReport.title}
                    pagePreview={pagePreview}
                    pageCount={htmlReport.pageCount}
                    previewScale={resolvedScale}
                    onSelectVisualNode={onSelectVisualNode}
                    onSelectBlock={onSelectBlock}
                    onQuickEditBlock={onQuickEditBlock}
                    onCommitBlockTransform={onCommitBlockTransform}
                    onCommitVisualTransform={onCommitVisualTransform}
                    onReturnBlockToFlow={onReturnBlockToFlow}
                    onReturnVisualToFlow={onReturnVisualToFlow}
                    onShiftBlockLayer={onShiftBlockLayer}
                    onShiftVisualLayer={onShiftVisualLayer}
                    onPageOverflow={onHtmlPageOverflow}
                    onPageMeasurement={onHtmlPageMeasurement}
                    preferredSelectionType={preferredSelectionType}
                    selectedBlockId={
                      selectedPageNumber === pagePreview.pageNumber ? selectedBlockId : null
                    }
                    selectedBlockTransform={
                      selectedPageNumber === pagePreview.pageNumber ? selectedBlockTransform : null
                    }
                    selectedVisualNodeId={
                      selectedPageNumber === pagePreview.pageNumber ? selectedVisualNodeId : null
                    }
                    selectedVisualTransform={
                      selectedPageNumber === pagePreview.pageNumber ? selectedVisualTransform : null
                    }
                  />
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
    </div>
  );
}

function StreamingReportCanvasView({
  deckTitle,
  pages,
  selectedPageNumber,
  onVisiblePageChange,
}: {
  deckTitle: string;
  pages: StreamingReportPage[];
  selectedPageNumber?: number | null;
  onVisiblePageChange?: (pageNumber: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Record<number, HTMLElement | null>>({});
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || typeof window === "undefined") {
      return;
    }

    const measure = () => {
      setContainerWidth(node.clientWidth);
      setContainerHeight(node.clientHeight);
    };
    measure();

    const observer = new window.ResizeObserver(() => {
      measure();
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const fitScale = useMemo(() => {
    if (!containerWidth || !containerHeight) {
      return 1;
    }

    const nextScale = Math.min(
      (containerWidth - HTML_REPORT_CANVAS_PADDING_X * 2) / HTML_REPORT_PAGE_WIDTH,
      (containerHeight - HTML_REPORT_CANVAS_PADDING_Y * 2) / HTML_REPORT_PAGE_HEIGHT,
      1,
    );
    return Math.max(HTML_REPORT_MIN_SCALE, Math.min(1, nextScale));
  }, [containerHeight, containerWidth]);

  const scaledWidth = Math.round(HTML_REPORT_PAGE_WIDTH * fitScale);
  const scaledHeight = Math.round(HTML_REPORT_PAGE_HEIGHT * fitScale);
  const pageViewportRadius = resolveCanvasPageViewportRadius(fitScale);
  const workspaceWidth = Math.max(
    containerWidth,
    scaledWidth + HTML_REPORT_CANVAS_PADDING_X * 2,
  );
  const workspaceHeight = Math.max(
    containerHeight,
    scaledHeight + HTML_REPORT_CANVAS_PADDING_Y * 2,
  );

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || typeof window === "undefined" || pages.length === 0) {
      return;
    }

    const observer = new window.IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        if (!visible) {
          return;
        }

        const pageNumber = Number.parseInt(
          (visible.target as HTMLElement).dataset.pageNumber ?? "",
          10,
        );
        if (Number.isFinite(pageNumber)) {
          onVisiblePageChange?.(pageNumber);
        }
      },
      {
        root,
        threshold: [0.2, 0.45, 0.72],
      },
    );

    const observed = pages
      .map((page) => pageRefs.current[page.pageNumber])
      .filter((node): node is HTMLElement => Boolean(node));

    observed.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [onVisiblePageChange, pages]);

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-auto overscroll-contain bg-[#040404] px-3 py-3 md:px-5 md:py-5"
    >
      <div className="relative mx-auto min-h-full w-full">
        <div
          className="relative mx-auto overflow-hidden rounded-[30px] border border-[rgba(255,255,255,0.06)] bg-[rgba(7,7,7,0.82)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_28px_80px_rgba(0,0,0,0.42)]"
          style={{
            width: `${workspaceWidth}px`,
            minHeight: `${workspaceHeight}px`,
            backgroundImage: [
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
              "linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
              "radial-gradient(circle at center, rgba(0,242,255,0.06) 0%, rgba(0,0,0,0) 62%)",
            ].join(","),
            backgroundSize: "28px 28px, 28px 28px, 100% 100%",
            backgroundPosition: "center center",
          }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.05),_transparent_44%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />

          <div className="relative space-y-10 px-8 py-10 md:px-12 md:py-12">
            {pages.map((page) => {
              const selected = selectedPageNumber === page.pageNumber;
              const pagePreview =
                page.srcDoc === null
                  ? null
                  : ({
                      pageNumber: page.pageNumber,
                      title: page.title,
                      srcDoc: page.srcDoc,
                      pageStructure: null,
                      visualPage: null,
                      layoutPage: null,
                    } satisfies HtmlReportPagePreview);

              return (
                <section
                  key={`stream-canvas-page-${page.pageNumber}`}
                  id={`ppt-stream-page-${page.pageNumber}`}
                  data-page-number={page.pageNumber}
                  ref={(node) => {
                    pageRefs.current[page.pageNumber] = node;
                  }}
                  className="flex justify-center"
                >
                  <div
                    className={[
                      "relative overflow-hidden rounded-[10px] border transition-shadow",
                      selected
                        ? "border-[rgba(0,242,255,0.32)] shadow-[0_0_0_1px_rgba(0,242,255,0.24),0_22px_56px_rgba(0,0,0,0.44)]"
                        : "border-[rgba(255,255,255,0.08)] shadow-[0_18px_42px_rgba(0,0,0,0.32)]",
                    ].join(" ")}
                    style={{
                      width: `${scaledWidth}px`,
                      height: `${scaledHeight}px`,
                      borderRadius: `${pageViewportRadius}px`,
                    }}
                  >
                    {pagePreview ? (
                      <HtmlReportPreviewFrame
                        htmlReportTitle={deckTitle}
                        pagePreview={pagePreview}
                        pageCount={pages.length}
                        previewScale={fitScale}
                        interactive={false}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,#151515_0%,#0b0b0b_100%)]">
                        <div className="text-center">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                            {page.status === "error" ? "Failed" : "Waiting"}
                          </div>
                          <div className="mt-3 text-[1rem] font-semibold text-[var(--studio-ink)]">
                            {page.title || `Page ${page.pageNumber}`}
                          </div>
                          <div className="mt-2 text-[12px] leading-6 text-[var(--studio-muted-strong)]">
                            {page.status === "error"
                              ? "This page failed to generate."
                              : "Codex is still building this page."}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkbenchReportView({
  pages,
  draft,
  workflowStage = "generated",
  fullscreen = true,
  mode = "classic",
  rootId,
  htmlReport,
  selectedHtmlPageNumber,
  selectedHtmlBlockId,
  selectedHtmlVisualNodeId,
  onSelectHtmlBlock,
  onSelectHtmlVisualNode,
  onQuickEditHtmlBlock,
  onCommitHtmlBlockTransform,
  onCommitHtmlVisualTransform,
  onReturnHtmlBlockToFlow,
  onReturnHtmlVisualToFlow,
  onShiftHtmlBlockLayer,
  onShiftHtmlVisualLayer,
  onHtmlPageOverflow,
  onHtmlPageMeasurement,
  scaleMode = "fit",
  scale = null,
  onResolvedScaleChange,
  onVisiblePageChange,
  preferredHtmlSelectionType = "page",
  selectedHtmlBlockTransform,
  selectedHtmlVisualTransform,
}: {
  pages: LayoutPage[];
  draft: WorkbenchDraft;
  workflowStage?: WorkflowStage;
  fullscreen?: boolean;
  mode?: WorkbenchReportCanvasMode;
  rootId?: string;
  htmlReport?: GeneratedHtmlReport | null;
  selectedHtmlPageNumber?: number | null;
  selectedHtmlBlockId?: string | null;
  selectedHtmlVisualNodeId?: string | null;
  onSelectHtmlBlock?: (pageNumber: number, blockId: string) => void;
  onSelectHtmlVisualNode?: (
    pageNumber: number,
    nodeId: string,
    kind: HtmlVisualNodeKind,
  ) => void;
  onQuickEditHtmlBlock?: (
    pageNumber: number,
    blockId: string,
    nextContent: { text?: string; items?: string[] },
  ) => void;
  onCommitHtmlBlockTransform?: (
    pageNumber: number,
    blockId: string,
    frame: HtmlCanvasFrame,
    fontSize?: number,
  ) => void;
  onCommitHtmlVisualTransform?: (
    pageNumber: number,
    nodeId: string,
    frame: HtmlCanvasFrame,
  ) => void;
  onReturnHtmlBlockToFlow?: (pageNumber: number, blockId: string) => void;
  onReturnHtmlVisualToFlow?: (pageNumber: number, nodeId: string) => void;
  onShiftHtmlBlockLayer?: (
    pageNumber: number,
    blockId: string,
    direction: "forward" | "backward",
    frame: HtmlCanvasFrame,
    fontSize?: number,
  ) => void;
  onShiftHtmlVisualLayer?: (
    pageNumber: number,
    nodeId: string,
    direction: "forward" | "backward",
    frame: HtmlCanvasFrame,
  ) => void;
  onHtmlPageOverflow?: (pageNumber: number, overflows: boolean) => void;
  onHtmlPageMeasurement?: (measurement: PageFitMeasurement) => void;
  scaleMode?: WorkbenchReportScaleMode;
  scale?: number | null;
  onResolvedScaleChange?: (scale: number) => void;
  onVisiblePageChange?: (pageNumber: number) => void;
  preferredHtmlSelectionType?: PreviewSelectionPreference;
  selectedHtmlBlockTransform?: HtmlCanvasTransform | null;
  selectedHtmlVisualTransform?: HtmlCanvasTransform | null;
}) {
  if (workflowStage === "generated" && htmlReport) {
    if (mode === "immersive") {
      return (
        <HtmlReportCanvasFrame
          htmlReport={htmlReport}
          rootId={rootId}
          selectedPageNumber={selectedHtmlPageNumber}
          selectedBlockId={selectedHtmlBlockId}
          selectedVisualNodeId={selectedHtmlVisualNodeId}
          onSelectBlock={onSelectHtmlBlock}
          onSelectVisualNode={onSelectHtmlVisualNode}
          onQuickEditBlock={onQuickEditHtmlBlock}
          onCommitBlockTransform={onCommitHtmlBlockTransform}
          onCommitVisualTransform={onCommitHtmlVisualTransform}
          onReturnBlockToFlow={onReturnHtmlBlockToFlow}
          onReturnVisualToFlow={onReturnHtmlVisualToFlow}
          onShiftBlockLayer={onShiftHtmlBlockLayer}
          onShiftVisualLayer={onShiftHtmlVisualLayer}
          onHtmlPageOverflow={onHtmlPageOverflow}
          onHtmlPageMeasurement={onHtmlPageMeasurement}
          preferredSelectionType={preferredHtmlSelectionType}
          selectedBlockTransform={selectedHtmlBlockTransform}
          selectedVisualTransform={selectedHtmlVisualTransform}
          scaleMode={scaleMode}
          scale={scale}
          onResolvedScaleChange={onResolvedScaleChange}
          onVisiblePageChange={onVisiblePageChange}
        />
      );
    }

    return (
      <article
      data-testid={rootId === "studio-main" ? "studio-editor-ready" : undefined}
      className={`shipping-report-page ${
        fullscreen ? "h-screen" : "h-full"
      } overflow-y-auto overscroll-y-contain bg-[#e8e5df] px-10 py-8 print:h-auto print:overflow-visible`}
    >
      <div className="mx-auto max-w-[1880px]">
        <HtmlReportFrame
          htmlReport={htmlReport}
          rootId={rootId}
          selectedPageNumber={selectedHtmlPageNumber}
          selectedBlockId={selectedHtmlBlockId}
          selectedVisualNodeId={selectedHtmlVisualNodeId}
          onSelectBlock={onSelectHtmlBlock}
          onSelectVisualNode={onSelectHtmlVisualNode}
          onQuickEditBlock={onQuickEditHtmlBlock}
          onCommitBlockTransform={onCommitHtmlBlockTransform}
          onCommitVisualTransform={onCommitHtmlVisualTransform}
          onReturnBlockToFlow={onReturnHtmlBlockToFlow}
          onReturnVisualToFlow={onReturnHtmlVisualToFlow}
          onShiftBlockLayer={onShiftHtmlBlockLayer}
          onShiftVisualLayer={onShiftHtmlVisualLayer}
          onHtmlPageOverflow={onHtmlPageOverflow}
          onHtmlPageMeasurement={onHtmlPageMeasurement}
          preferredSelectionType={preferredHtmlSelectionType}
          selectedBlockTransform={selectedHtmlBlockTransform}
          selectedVisualTransform={selectedHtmlVisualTransform}
        />
      </div>
    </article>
  );
  }

  return (
    <article
      data-ppt-report-root={rootId}
      data-testid={rootId === "studio-main" ? "studio-editor-ready" : undefined}
      className={`shipping-report-page ${
        fullscreen ? "h-screen" : "h-full"
      } overflow-y-auto overscroll-y-contain bg-[#e8e5df] px-10 py-8 print:h-auto print:overflow-visible`}
    >
      <div className="mx-auto max-w-[1360px]">
        <div className="space-y-10">
          {pages.map((page) => {
            const pageDraft = draft.pageDrafts.get(page.id) ?? {
              summary: draft.subtitle,
              blocks: {},
            };

            return (
              <section
                key={page.id}
                className="report-slide overflow-hidden bg-[#f7f3eb] shadow-[0_18px_38px_rgba(15,23,31,0.08)] print:shadow-none"
              >
                {workflowStage === "generated" ? (
                  <SlideSceneCanvas page={page} pageDraft={pageDraft} />
                ) : (
                  <StorylineStructureCanvas page={page} pageDraft={pageDraft} />
                )}
              </section>
            );
          })}
        </div>
      </div>
    </article>
  );
}

export {
  HtmlReportThumbnail,
  HtmlReportFrame,
  HtmlReportPageThumbnails,
  HtmlReportPageFilmstrip,
  StreamingReportCanvasView,
  WorkbenchReportView,
};
