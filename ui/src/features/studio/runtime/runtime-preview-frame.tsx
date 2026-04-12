import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import {
  clampCanvasFrameToPage,
  snapCanvasValue,
} from "@/features/studio/html-report-canvas";
import {
  measureListBlock,
  measureTextBlock,
  resolveFontDescriptorToCss,
} from "@/features/studio/text-layout/pretext-engine";
import {
  measurePageTextLayoutPrediction,
} from "@/features/studio/text-layout/text-layout-dom";
import {
  hasPageFitFailure,
  type PageFitMeasurement,
} from "@/features/studio/generation";
import type {
  HtmlCanvasFrame,
  HtmlLayoutZoneKind,
  HtmlVisualNodeKind,
} from "@/features/studio/types";
import type { TextLayoutWhiteSpace } from "@/features/studio/text-layout/text-layout-types";
import {
  buildHtmlReportPagePreviews,
  HTML_REPORT_PAGE_HEIGHT,
  HTML_REPORT_PAGE_WIDTH,
  type HtmlReportPagePreview,
} from "./runtime-export-annotations";

type PreviewInteractionMode = "idle" | "selected" | "editing-text" | "arranging";
type PreviewTransformMode =
  | "move"
  | "resize-nw"
  | "resize-ne"
  | "resize-se"
  | "resize-sw";
type PreviewTransformSession = {
  target: "block" | "visual";
  id: string;
  mode: PreviewTransformMode;
  initialFrame: HtmlCanvasFrame;
  initialFontSize?: number;
  blockTextLayout?: {
    kind: string;
    text: string;
    items: string[];
    baseFontSizePx: number;
    fontFamily: string;
    fontWeight: string;
    fontStyle: string;
    lineHeightPx: number;
    whiteSpace: TextLayoutWhiteSpace;
  };
  originClientX: number;
  originClientY: number;
  anchorX: number;
  anchorY: number;
};

function enrichMeasurementWithTextLayout(
  iframe: HTMLIFrameElement | null,
  measurement: PageFitMeasurement,
): PageFitMeasurement {
  const pageRoot = iframe?.contentDocument?.querySelector("section.page");
  if (!(pageRoot instanceof HTMLElement)) {
    return measurement;
  }

  const textPrediction = measurePageTextLayoutPrediction({ pageRoot });
  return {
    ...measurement,
    textMeasurements: textPrediction.textMeasurements,
    predictedTextOverflow: textPrediction.predictedTextOverflow,
    predictedOverflowRoots: textPrediction.predictedOverflowRoots,
  };
}

function resolveAutoSizedBlockFrame(args: {
  frame: HtmlCanvasFrame;
  mode: PreviewTransformMode;
  blockTextLayout: NonNullable<PreviewTransformSession["blockTextLayout"]>;
  fontSizePx: number;
  initialFrame: HtmlCanvasFrame;
}) {
  const font = resolveFontDescriptorToCss({
    family: args.blockTextLayout.fontFamily,
    sizePx: args.fontSizePx,
    weight: args.blockTextLayout.fontWeight,
    style: args.blockTextLayout.fontStyle,
  });
  const lineHeightRatio =
    args.blockTextLayout.baseFontSizePx > 0
      ? args.blockTextLayout.lineHeightPx / args.blockTextLayout.baseFontSizePx
      : 1.2;
  const normalizedLineHeight = Math.max(1, args.fontSizePx * Math.max(0.82, lineHeightRatio));
  const textMeasure =
    args.blockTextLayout.kind === "list"
      ? measureListBlock({
          items: args.blockTextLayout.items,
          widthPx: Math.max(24, args.frame.w),
          lineHeightPx: normalizedLineHeight,
          font,
          whiteSpace: args.blockTextLayout.whiteSpace,
          itemGapPx: Math.max(4, normalizedLineHeight * 0.28),
          bulletIndentPx: Math.max(14, args.fontSizePx * 0.85),
        })
      : measureTextBlock({
          text: args.blockTextLayout.text,
          widthPx: Math.max(24, args.frame.w),
          lineHeightPx: normalizedLineHeight,
          font,
          whiteSpace: args.blockTextLayout.whiteSpace,
        });
  const autoHeight = Math.max(32, Math.round(textMeasure.height + Math.max(8, args.fontSizePx * 0.5)));
  const nextFrame = {
    ...args.frame,
    h: autoHeight,
  };
  if (args.mode === "resize-nw" || args.mode === "resize-ne") {
    const bottom = args.initialFrame.y + args.initialFrame.h;
    nextFrame.y = bottom - autoHeight;
  }
  return clampCanvasFrameToPage(nextFrame);
}

function HtmlReportPreviewFrame({
  htmlReportTitle,
  pagePreview,
  pageCount,
  previewScale,
  interactive = true,
  onSelectBlock,
  onSelectVisualNode,
  onSelectLayoutZone,
  onCommitLayoutZone,
  onQuickEditBlock,
  onCommitBlockTransform,
  onCommitVisualTransform,
  onPageOverflow,
  onPageMeasurement,
  selectedBlockId,
  selectedVisualNodeId,
  selectedLayoutZoneId,
}: {
  htmlReportTitle: string;
  pagePreview: HtmlReportPagePreview;
  pageCount?: number | null;
  previewScale: number;
  interactive?: boolean;
  onSelectBlock?: (pageNumber: number, blockId: string) => void;
  onSelectVisualNode?: (
    pageNumber: number,
    nodeId: string,
    kind: HtmlVisualNodeKind,
  ) => void;
  onSelectLayoutZone?: (
    pageNumber: number,
    zoneId: string,
    kind: HtmlLayoutZoneKind,
  ) => void;
  onCommitLayoutZone?: (
    pageNumber: number,
    zoneId: string,
    splitPercent: number,
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
  onPageOverflow?: (pageNumber: number, overflows: boolean) => void;
  onPageMeasurement?: (measurement: PageFitMeasurement) => void;
  selectedBlockId?: string | null;
  selectedVisualNodeId?: string | null;
  selectedLayoutZoneId?: string | null;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const frameContainerRef = useRef<HTMLDivElement | null>(null);
  const quickEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const [frameEpoch, setFrameEpoch] = useState(0);
  const [selectedLayoutRect, setSelectedLayoutRect] = useState<null | {
    top: number;
    left: number;
    width: number;
    height: number;
  }>(null);
  const [selectedBlockRect, setSelectedBlockRect] = useState<null | {
    top: number;
    left: number;
    width: number;
    height: number;
    fontSize?: number;
    blockKind: string;
    text: string;
    items: string[];
    fontFamily: string;
    fontWeight: string;
    fontStyle: string;
    lineHeightPx: number;
    whiteSpace: TextLayoutWhiteSpace;
  }>(null);
  const [selectedVisualRect, setSelectedVisualRect] = useState<null | {
    top: number;
    left: number;
    width: number;
    height: number;
  }>(null);
  const [layoutPreviewSplit, setLayoutPreviewSplit] = useState<number | null>(null);
  const [quickEditor, setQuickEditor] = useState<null | {
    blockId: string;
    kind: string;
    value: string;
    top: number;
    left: number;
    width: number;
    height: number;
  }>(null);
  const [transformPreview, setTransformPreview] = useState<null | {
    target: "block" | "visual";
    id: string;
    frame: HtmlCanvasFrame;
    fontSize?: number;
  }>(null);
  const [interactionMode, setInteractionMode] = useState<PreviewInteractionMode>("idle");
  const [transformSession, setTransformSession] = useState<PreviewTransformSession | null>(null);
  const previewBridgeTargetRef = useRef<string | null>(null);
  const suppressNextArrangeClickRef = useRef(false);

  const scaledWidth = Math.round(HTML_REPORT_PAGE_WIDTH * previewScale);
  const scaledHeight = Math.round(HTML_REPORT_PAGE_HEIGHT * previewScale);
  const selectedLayoutZone = useMemo(
    () => pagePreview.layoutPage?.zones.find((zone) => zone.id === selectedLayoutZoneId) ?? null,
    [pagePreview.layoutPage, selectedLayoutZoneId],
  );

  function postPreviewCommand(payload: Record<string, unknown>) {
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "ppt-html-preview-command",
        pageNumber: pagePreview.pageNumber,
        ...payload,
      },
      "*",
    );
  }

  function queueTransformCancel(nextMode: PreviewInteractionMode = "selected") {
    if (previewBridgeTargetRef.current) {
      postPreviewCommand({
        action: "transform-preview-cancel",
      });
      previewBridgeTargetRef.current = null;
    }
    setTransformPreview(null);
    setTransformSession(null);
    setInteractionMode(nextMode);
  }

  function suppressNextArrangeClick() {
    suppressNextArrangeClickRef.current = true;
  }

  useEffect(() => {
    if (!quickEditor) {
      return;
    }

    window.setTimeout(() => {
      const editor = quickEditorRef.current;
      if (!editor) {
        return;
      }
      editor.focus();
      const caretPosition = editor.value.length;
      editor.setSelectionRange(caretPosition, caretPosition);
    }, 30);
  }, [quickEditor]);

  useEffect(() => {
    if (!quickEditor) {
      return;
    }

    if (
      selectedVisualNodeId ||
      selectedLayoutZoneId ||
      !selectedBlockId ||
      selectedBlockId !== quickEditor.blockId
    ) {
      setQuickEditor(null);
    }
  }, [quickEditor, selectedBlockId, selectedLayoutZoneId, selectedVisualNodeId]);

  useEffect(() => {
    if (quickEditor) {
      setInteractionMode("editing-text");
      return;
    }

    if (!selectedBlockId && !selectedVisualNodeId && !selectedLayoutZoneId) {
      setInteractionMode("idle");
      return;
    }

    setInteractionMode((current) => (current === "arranging" ? current : "selected"));
  }, [quickEditor, selectedBlockId, selectedLayoutZoneId, selectedVisualNodeId]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow || !event.data) {
        return;
      }

      if (event.data.type === "ppt-html-preview-fit-report") {
        const payload = event.data as { measurement?: PageFitMeasurement };
        if (!payload.measurement) {
          return;
        }
        const enrichedMeasurement = enrichMeasurementWithTextLayout(
          iframeRef.current,
          payload.measurement,
        );
        onPageMeasurement?.(enrichedMeasurement);
        onPageOverflow?.(
          enrichedMeasurement.pageNumber,
          hasPageFitFailure(enrichedMeasurement, pageCount),
        );
        return;
      }

      if (event.data.type !== "ppt-html-preview-interaction") {
        return;
      }

      const payload = event.data as {
        action?: "select" | "edit" | "inspect" | "background";
        pageNumber: number;
        blockId: string;
        blockKind: string;
        fontSize?: number;
        fontFamily?: string;
        fontWeight?: string;
        fontStyle?: string;
        lineHeight?: number;
        whiteSpace?: TextLayoutWhiteSpace;
        visualNodeId?: string;
        visualKind?: HtmlVisualNodeKind;
        layoutZoneId?: string;
        layoutKind?: HtmlLayoutZoneKind;
        splitPercent?: number;
        text?: string;
        items?: string[];
        rect?: { top: number; left: number; width: number; height: number };
      };

      if (payload.action === "background") {
        queueTransformCancel("selected");
        return;
      }

      if (payload.visualNodeId && payload.visualKind) {
        onSelectVisualNode?.(payload.pageNumber, payload.visualNodeId, payload.visualKind);
        queueTransformCancel("selected");
        setInteractionMode("selected");
        if (payload.rect) {
          setSelectedVisualRect({
            top: payload.rect.top * previewScale,
            left: payload.rect.left * previewScale,
            width: payload.rect.width * previewScale,
            height: payload.rect.height * previewScale,
          });
        }
        setSelectedBlockRect(null);
        return;
      }

      if (payload.layoutZoneId && payload.layoutKind) {
        onSelectLayoutZone?.(payload.pageNumber, payload.layoutZoneId, payload.layoutKind);
        queueTransformCancel("selected");
        setInteractionMode("selected");
        if (payload.rect) {
          setSelectedLayoutRect({
            top: payload.rect.top * previewScale,
            left: payload.rect.left * previewScale,
            width: payload.rect.width * previewScale,
            height: payload.rect.height * previewScale,
          });
        }
        if (payload.action === "select") {
          setLayoutPreviewSplit(
            Number.isFinite(payload.splitPercent) ? Number(payload.splitPercent) : null,
          );
        }
        setSelectedBlockRect(null);
        setSelectedVisualRect(null);
        return;
      }

      if (!payload.blockId) {
        return;
      }

      if (payload.action === "select") {
        onSelectBlock?.(payload.pageNumber, payload.blockId);
        queueTransformCancel("selected");
        setInteractionMode("selected");
        if (payload.rect) {
          setSelectedBlockRect({
            top: payload.rect.top * previewScale,
            left: payload.rect.left * previewScale,
            width: payload.rect.width * previewScale,
            height: payload.rect.height * previewScale,
            fontSize:
              Number.isFinite(payload.fontSize) && (payload.fontSize ?? 0) > 0
                ? payload.fontSize
                : undefined,
            blockKind: payload.blockKind,
            text: payload.text ?? "",
            items: payload.items ?? [],
            fontFamily: payload.fontFamily ?? "Arial",
            fontWeight: payload.fontWeight ?? "400",
            fontStyle: payload.fontStyle ?? "normal",
            lineHeightPx:
              Number.isFinite(payload.lineHeight) && (payload.lineHeight ?? 0) > 0
                ? Number(payload.lineHeight)
                : (Number.isFinite(payload.fontSize) && (payload.fontSize ?? 0) > 0
                    ? Number(payload.fontSize) * 1.2
                    : 19.2),
            whiteSpace: payload.whiteSpace === "pre-wrap" ? "pre-wrap" : "normal",
          });
        }
        setSelectedVisualRect(null);
      }

      if (payload.action !== "edit" || !onQuickEditBlock || !payload.rect) {
        return;
      }

      onSelectBlock?.(payload.pageNumber, payload.blockId);

      const initialValue =
        payload.blockKind === "list"
          ? (payload.items ?? []).join("\n")
          : (payload.text ?? "").replace(/\s+/g, " ").trim();

      setQuickEditor({
        blockId: payload.blockId,
        kind: payload.blockKind,
        value: initialValue,
        top: Math.max(12, payload.rect.top * previewScale),
        left: Math.max(12, payload.rect.left * previewScale),
        width: Math.min(payload.rect.width * previewScale + 12, scaledWidth - 24),
        height: Math.max(payload.rect.height * previewScale, payload.blockKind === "list" ? 120 : 88),
      });
      queueTransformCancel("editing-text");
      setInteractionMode("editing-text");
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [
    onCommitLayoutZone,
    onPageMeasurement,
    onPageOverflow,
    onQuickEditBlock,
    onSelectBlock,
    onSelectLayoutZone,
    onSelectVisualNode,
    previewScale,
    scaledHeight,
    scaledWidth,
  ]);

  useEffect(() => {
    const document = iframeRef.current?.contentDocument;
    if (!document) {
      return;
    }

    document.querySelectorAll("[data-html-block-selected='true']").forEach((element) => {
      element.removeAttribute("data-html-block-selected");
    });

    if (!selectedBlockId) {
      setSelectedBlockRect(null);
      return;
    }

    const selectedElement = document.querySelector(
      `[data-html-block-id="${selectedBlockId}"]`,
    ) as HTMLElement | null;
    if (selectedElement) {
      selectedElement.setAttribute("data-html-block-selected", "true");
      const rect = selectedElement.getBoundingClientRect();
      const computed = window.getComputedStyle(selectedElement);
      const fontSize = Number.parseFloat(computed.fontSize ?? "");
      const lineHeight = Number.parseFloat(computed.lineHeight ?? "");
      const blockKind = selectedElement.getAttribute("data-html-block-kind") ?? "paragraph";
      const items =
        blockKind === "list"
          ? Array.from(selectedElement.querySelectorAll(":scope li"))
              .map((item) => item.textContent?.replace(/\s+/g, " ").trim() ?? "")
              .filter(Boolean)
          : [];
      setSelectedBlockRect({
        top: rect.top * previewScale,
        left: rect.left * previewScale,
        width: rect.width * previewScale,
        height: rect.height * previewScale,
        fontSize: Number.isFinite(fontSize) ? fontSize : undefined,
        blockKind,
        text: selectedElement.textContent?.replace(/\s+/g, " ").trim() ?? "",
        items,
        fontFamily: computed.fontFamily || "Arial",
        fontWeight: computed.fontWeight || "400",
        fontStyle: computed.fontStyle || "normal",
        lineHeightPx:
          Number.isFinite(lineHeight) && lineHeight > 0
            ? lineHeight
            : (Number.isFinite(fontSize) && fontSize > 0 ? fontSize * 1.2 : 19.2),
        whiteSpace:
          computed.whiteSpace === "pre-wrap" || computed.whiteSpace === "pre-line"
            ? "pre-wrap"
            : "normal",
      });
    } else {
      setSelectedBlockRect(null);
    }
  }, [frameEpoch, previewScale, selectedBlockId, pagePreview.srcDoc]);

  useEffect(() => {
    const document = iframeRef.current?.contentDocument;
    if (!document) {
      return;
    }

    document.querySelectorAll("[data-html-visual-selected='true']").forEach((element) => {
      element.removeAttribute("data-html-visual-selected");
    });

    if (!selectedVisualNodeId) {
      setSelectedVisualRect(null);
      return;
    }

    const selectedElement = document.querySelector(
      `[data-html-visual-id="${selectedVisualNodeId}"]`,
    ) as HTMLElement | null;
    if (selectedElement) {
      selectedElement.setAttribute("data-html-visual-selected", "true");
      const rect = selectedElement.getBoundingClientRect();
      setSelectedVisualRect({
        top: rect.top * previewScale,
        left: rect.left * previewScale,
        width: rect.width * previewScale,
        height: rect.height * previewScale,
      });
    } else {
      setSelectedVisualRect(null);
    }
  }, [frameEpoch, previewScale, selectedVisualNodeId, pagePreview.srcDoc]);

  useEffect(() => {
    const document = iframeRef.current?.contentDocument;
    if (!document) {
      return;
    }

    document.querySelectorAll("[data-html-layout-selected='true']").forEach((element) => {
      element.removeAttribute("data-html-layout-selected");
    });

    if (!selectedLayoutZoneId) {
      setSelectedLayoutRect(null);
      return;
    }

    const selectedElement = document.querySelector(
      `[data-html-layout-id="${selectedLayoutZoneId}"]`,
    ) as HTMLElement | null;
    if (selectedElement) {
      selectedElement.setAttribute("data-html-layout-selected", "true");
      const rect = selectedElement.getBoundingClientRect();
      setSelectedLayoutRect({
        top: rect.top * previewScale,
        left: rect.left * previewScale,
        width: rect.width * previewScale,
        height: rect.height * previewScale,
      });
      if (layoutPreviewSplit === null) {
        const splitPercent = Number.parseFloat(selectedElement.getAttribute("data-layout-split") ?? "");
        if (Number.isFinite(splitPercent)) {
          setLayoutPreviewSplit(splitPercent);
        }
      }
    } else {
      setSelectedLayoutRect(null);
    }
  }, [frameEpoch, layoutPreviewSplit, previewScale, selectedLayoutZoneId, pagePreview.srcDoc]);

  useEffect(() => {
    if (!selectedLayoutZoneId) {
      setLayoutPreviewSplit(null);
      return;
    }

    if (!selectedLayoutZone) {
      setSelectedLayoutRect(null);
      setLayoutPreviewSplit(null);
      return;
    }

    if (layoutPreviewSplit === null) {
      setLayoutPreviewSplit(selectedLayoutZone.splitPercent);
    }
  }, [layoutPreviewSplit, selectedLayoutZone, selectedLayoutZoneId]);

  useEffect(() => {
    setTransformPreview((current) => {
      if (!current) {
        return current;
      }
      if (current.target === "block" && current.id !== selectedBlockId) {
        return null;
      }
      if (current.target === "visual" && current.id !== selectedVisualNodeId) {
        return null;
      }
      return current;
    });
  }, [selectedBlockId, selectedVisualNodeId]);

  useEffect(() => {
    if (!transformSession) {
      return;
    }

    if (interactionMode !== "arranging") {
      queueTransformCancel("selected");
      return;
    }

    if (
      (transformSession.target === "block" && transformSession.id !== selectedBlockId) ||
      (transformSession.target === "visual" && transformSession.id !== selectedVisualNodeId)
    ) {
      queueTransformCancel("selected");
    }
  }, [interactionMode, selectedBlockId, selectedVisualNodeId, transformSession]);

  function applyQuickEdit() {
    if (!quickEditor || !onQuickEditBlock) {
      setQuickEditor(null);
      return;
    }

    const normalized = quickEditor.value.replace(/\r/g, "").trim();
    if (!normalized) {
      setQuickEditor(null);
      return;
    }

    if (quickEditor.kind === "list") {
      const items = normalized
        .split("\n")
        .map((item) => item.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      onQuickEditBlock(pagePreview.pageNumber, quickEditor.blockId, { items });
    } else {
      onQuickEditBlock(pagePreview.pageNumber, quickEditor.blockId, {
        text: normalized.replace(/\s+/g, " ").trim(),
      });
    }

    setQuickEditor(null);
  }

  function openQuickEditorForSelectedBlock() {
    if (!selectedBlockId || !selectedBlockRect || !pagePreview.pageStructure || !onQuickEditBlock) {
      return;
    }

    const selectedBlock =
      pagePreview.pageStructure.blocks.find((block) => block.id === selectedBlockId) ?? null;
    if (!selectedBlock) {
      return;
    }

    const initialValue =
      selectedBlock.kind === "list"
        ? (selectedBlock.items ?? []).join("\n")
        : (selectedBlock.text ?? "").replace(/\s+/g, " ").trim();

    setQuickEditor({
      blockId: selectedBlock.id,
      kind: selectedBlock.kind,
      value: initialValue,
      top: Math.max(12, selectedBlockRect.top),
      left: Math.max(12, selectedBlockRect.left),
      width: Math.min(selectedBlockRect.width + 12, scaledWidth - 24),
      height: Math.max(selectedBlockRect.height, selectedBlock.kind === "list" ? 120 : 88),
    });
    setInteractionMode("editing-text");
  }

  function postLayoutPreview(zoneId: string, splitPercent: number) {
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "ppt-html-preview-command",
        action: "layout-preview",
        pageNumber: pagePreview.pageNumber,
        zoneId,
        splitPercent,
      },
      "*",
    );
  }

  function beginLayoutDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!selectedLayoutZone || !selectedLayoutRect || !frameContainerRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const containerRect = frameContainerRef.current.getBoundingClientRect();
    const zoneRect = selectedLayoutRect;

    const computeSplit = (clientX: number) => {
      const localX = clientX - containerRect.left - zoneRect.left;
      const next = (localX / Math.max(1, zoneRect.width)) * 100;
      return Math.max(28, Math.min(72, Math.round(next)));
    };

    const applyPreview = (clientX: number) => {
      const nextSplit = computeSplit(clientX);
      setLayoutPreviewSplit(nextSplit);
      postLayoutPreview(selectedLayoutZone.id, nextSplit);
      return nextSplit;
    };

    let lastSplit = applyPreview(event.clientX);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      lastSplit = applyPreview(moveEvent.clientX);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      onCommitLayoutZone?.(pagePreview.pageNumber, selectedLayoutZone.id, lastSplit);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function snapFrame(frame: HtmlCanvasFrame) {
    const normalized = clampCanvasFrameToPage(frame);
    const snappedX = snapCanvasValue(normalized.x, [
      0,
      Math.round((HTML_REPORT_PAGE_WIDTH - normalized.w) / 2),
      HTML_REPORT_PAGE_WIDTH - normalized.w,
    ]);
    const snappedY = snapCanvasValue(normalized.y, [
      0,
      Math.round((HTML_REPORT_PAGE_HEIGHT - normalized.h) / 2),
      HTML_REPORT_PAGE_HEIGHT - normalized.h,
    ]);
    return clampCanvasFrameToPage({
      ...normalized,
      x: snappedX,
      y: snappedY,
    });
  }

  useEffect(() => {
    const activePreview =
      transformPreview ??
      (transformSession
        ? {
            target: transformSession.target,
            id: transformSession.id,
            frame: transformSession.initialFrame,
            fontSize: transformSession.initialFontSize,
          }
        : null);
    if (!activePreview) {
      previewBridgeTargetRef.current = null;
      return;
    }

    postPreviewCommand({
      action: "transform-preview-start",
      target: activePreview.target,
      targetId: activePreview.id,
      frame: activePreview.frame,
      fontSize: activePreview.fontSize,
    });
    previewBridgeTargetRef.current = `${activePreview.target}:${activePreview.id}`;
  }, [frameEpoch]);

  useEffect(() => {
    if (!transformSession) {
      return;
    }

    const minSize = 32;
    let finalFrame = transformPreview?.frame ?? transformSession.initialFrame;
    let finalFontSize = transformSession.initialFontSize;

    const computeFrame = (clientX: number, clientY: number) => {
      const deltaX = (clientX - transformSession.originClientX) / previewScale;
      const deltaY = (clientY - transformSession.originClientY) / previewScale;
      const containerRect = frameContainerRef.current?.getBoundingClientRect();
      let nextFrame = { ...transformSession.initialFrame };

      if (transformSession.mode === "move") {
        if (!containerRect) {
          return snapFrame(nextFrame);
        }

        const pointerPageX = (clientX - containerRect.left) / previewScale;
        const pointerPageY = (clientY - containerRect.top) / previewScale;
        nextFrame = {
          ...transformSession.initialFrame,
          x: pointerPageX - transformSession.anchorX,
          y: pointerPageY - transformSession.anchorY,
        };
      } else if (transformSession.mode === "resize-nw") {
        const right = transformSession.initialFrame.x + transformSession.initialFrame.w;
        const bottom = transformSession.initialFrame.y + transformSession.initialFrame.h;
        const nextX = Math.min(right - minSize, transformSession.initialFrame.x + deltaX);
        const nextY = Math.min(bottom - minSize, transformSession.initialFrame.y + deltaY);
        nextFrame = {
          x: nextX,
          y: nextY,
          w: right - nextX,
          h: bottom - nextY,
        };
      } else if (transformSession.mode === "resize-ne") {
        const bottom = transformSession.initialFrame.y + transformSession.initialFrame.h;
        const nextRight = Math.max(
          transformSession.initialFrame.x + minSize,
          transformSession.initialFrame.x + transformSession.initialFrame.w + deltaX,
        );
        const nextY = Math.min(bottom - minSize, transformSession.initialFrame.y + deltaY);
        nextFrame = {
          x: transformSession.initialFrame.x,
          y: nextY,
          w: nextRight - transformSession.initialFrame.x,
          h: bottom - nextY,
        };
      } else if (transformSession.mode === "resize-sw") {
        const right = transformSession.initialFrame.x + transformSession.initialFrame.w;
        const nextX = Math.min(right - minSize, transformSession.initialFrame.x + deltaX);
        const nextBottom = Math.max(
          transformSession.initialFrame.y + minSize,
          transformSession.initialFrame.y + transformSession.initialFrame.h + deltaY,
        );
        nextFrame = {
          x: nextX,
          y: transformSession.initialFrame.y,
          w: right - nextX,
          h: nextBottom - transformSession.initialFrame.y,
        };
      } else {
        const nextRight = Math.max(
          transformSession.initialFrame.x + minSize,
          transformSession.initialFrame.x + transformSession.initialFrame.w + deltaX,
        );
        const nextBottom = Math.max(
          transformSession.initialFrame.y + minSize,
          transformSession.initialFrame.y + transformSession.initialFrame.h + deltaY,
        );
        nextFrame = {
          x: transformSession.initialFrame.x,
          y: transformSession.initialFrame.y,
          w: nextRight - transformSession.initialFrame.x,
          h: nextBottom - transformSession.initialFrame.y,
        };
      }

      return snapFrame(nextFrame);
    };

    const commitTransform = () => {
      postPreviewCommand({
        action: "transform-preview-commit",
        target: transformSession.target,
        targetId: transformSession.id,
        frame: finalFrame,
        fontSize: finalFontSize,
      });
      previewBridgeTargetRef.current = null;
      suppressNextArrangeClick();
      setTransformPreview(null);
      setTransformSession(null);
      setInteractionMode("arranging");
      if (transformSession.target === "block") {
        onCommitBlockTransform?.(
          pagePreview.pageNumber,
          transformSession.id,
          finalFrame,
          finalFontSize,
        );
      } else {
        onCommitVisualTransform?.(pagePreview.pageNumber, transformSession.id, finalFrame);
      }
    };

    const cancelTransform = () => {
      queueTransformCancel("selected");
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      finalFrame = computeFrame(moveEvent.clientX, moveEvent.clientY);
      if (transformSession.target === "block") {
        const baseFontSize = transformSession.initialFontSize ?? transformSession.blockTextLayout?.baseFontSizePx ?? 16;
        const scaleRatio = Math.max(
          0.55,
          Math.min(2.4, finalFrame.w / Math.max(1, transformSession.initialFrame.w)),
        );
        finalFontSize = Math.max(10, Math.round(baseFontSize * scaleRatio));
        if (transformSession.blockTextLayout) {
          finalFrame = resolveAutoSizedBlockFrame({
            frame: finalFrame,
            mode: transformSession.mode,
            blockTextLayout: transformSession.blockTextLayout,
            fontSizePx: finalFontSize,
            initialFrame: transformSession.initialFrame,
          });
        }
      }

      const previewKey = `${transformSession.target}:${transformSession.id}`;
      setTransformPreview({
        target: transformSession.target,
        id: transformSession.id,
        frame: finalFrame,
        fontSize: finalFontSize,
      });
      postPreviewCommand({
        action:
          previewBridgeTargetRef.current === previewKey
            ? "transform-preview-update"
            : "transform-preview-start",
        target: transformSession.target,
        targetId: transformSession.id,
        frame: finalFrame,
        fontSize: finalFontSize,
      });
      previewBridgeTargetRef.current = previewKey;
    };

    const handlePointerDown = () => {
      commitTransform();
    };

    const handleKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== "Escape") {
        return;
      }
      keyEvent.preventDefault();
      cancelTransform();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    onCommitBlockTransform,
    onCommitVisualTransform,
    pagePreview.pageNumber,
    previewScale,
    transformSession,
  ]);

  useEffect(() => {
    if (interactionMode !== "arranging" || transformSession) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setInteractionMode("selected");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [interactionMode, transformSession]);

  function beginTransformInteraction(
    target: "block" | "visual",
    mode: PreviewTransformMode,
    event: ReactMouseEvent<HTMLButtonElement | HTMLDivElement>,
    options?: { centerOnPointer?: boolean },
  ) {
    const targetRect = target === "block" ? selectedBlockRect : selectedVisualRect;
    const targetId = target === "block" ? selectedBlockId : selectedVisualNodeId;
    const containerRect = frameContainerRef.current?.getBoundingClientRect();
    if (!targetRect || !targetId || !containerRect) {
      return;
    }

    if (suppressNextArrangeClickRef.current) {
      suppressNextArrangeClickRef.current = false;
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const initialFrame: HtmlCanvasFrame = {
      x: Math.round(targetRect.left / previewScale),
      y: Math.round(targetRect.top / previewScale),
      w: Math.round(targetRect.width / previewScale),
      h: Math.round(targetRect.height / previewScale),
    };
    const initialFontSize =
      target === "block" &&
      Number.isFinite(selectedBlockRect?.fontSize) &&
      (selectedBlockRect?.fontSize ?? 0) > 0
        ? selectedBlockRect?.fontSize
        : undefined;
    const pointerPageX = (event.clientX - containerRect.left) / previewScale;
    const pointerPageY = (event.clientY - containerRect.top) / previewScale;
    const anchorX =
      mode === "move"
        ? options?.centerOnPointer
          ? initialFrame.w / 2
          : Math.max(0, Math.min(initialFrame.w, pointerPageX - initialFrame.x))
        : 0;
    const anchorY =
      mode === "move"
        ? options?.centerOnPointer
          ? initialFrame.h / 2
          : Math.max(0, Math.min(initialFrame.h, pointerPageY - initialFrame.y))
        : 0;
    const initialPreviewFrame =
      mode === "move"
        ? snapFrame({
            ...initialFrame,
            x: pointerPageX - anchorX,
            y: pointerPageY - anchorY,
          })
        : initialFrame;

    setInteractionMode("arranging");
    setTransformPreview({
      target,
      id: targetId,
      frame: initialPreviewFrame,
      fontSize: initialFontSize,
    });
    postPreviewCommand({
      action: "transform-preview-start",
      target,
      targetId,
      frame: initialPreviewFrame,
      fontSize: initialFontSize,
    });
    previewBridgeTargetRef.current = `${target}:${targetId}`;
    setTransformSession({
      target,
      id: targetId,
      mode,
      initialFrame,
      initialFontSize,
      blockTextLayout:
        target === "block" && selectedBlockRect
          ? {
              kind: selectedBlockRect.blockKind,
              text: selectedBlockRect.text,
              items: selectedBlockRect.items,
              baseFontSizePx: selectedBlockRect.fontSize ?? 16,
              fontFamily: selectedBlockRect.fontFamily,
              fontWeight: selectedBlockRect.fontWeight,
              fontStyle: selectedBlockRect.fontStyle,
              lineHeightPx: selectedBlockRect.lineHeightPx,
              whiteSpace: selectedBlockRect.whiteSpace,
            }
          : undefined,
      originClientX: event.clientX,
      originClientY: event.clientY,
      anchorX,
      anchorY,
    });
  }

  function beginSelectedObjectArrangement(event: ReactMouseEvent<HTMLButtonElement>) {
    if (interactionMode === "arranging") {
      queueTransformCancel("selected");
      return;
    }

    setQuickEditor(null);
    if (!selectionChrome) {
      return;
    }

    beginTransformInteraction(selectionChrome.target, "move", event, {
      centerOnPointer: true,
    });
  }

  const activeBlockFrame = useMemo(() => {
    if (!selectedBlockId || !selectedBlockRect) {
      return null;
    }
    if (transformPreview?.target === "block" && transformPreview.id === selectedBlockId) {
      return transformPreview;
    }

    return {
      target: "block" as const,
      id: selectedBlockId,
      frame: {
        x: Math.round(selectedBlockRect.left / previewScale),
        y: Math.round(selectedBlockRect.top / previewScale),
        w: Math.round(selectedBlockRect.width / previewScale),
        h: Math.round(selectedBlockRect.height / previewScale),
      },
      fontSize: selectedBlockRect.fontSize,
    };
  }, [pagePreview.pageNumber, previewScale, selectedBlockId, selectedBlockRect, transformPreview]);

  const activeVisualFrame = useMemo(() => {
    if (!selectedVisualNodeId || !selectedVisualRect) {
      return null;
    }
    if (transformPreview?.target === "visual" && transformPreview.id === selectedVisualNodeId) {
      return transformPreview;
    }
    return {
      target: "visual" as const,
      id: selectedVisualNodeId,
      frame: {
        x: Math.round(selectedVisualRect.left / previewScale),
        y: Math.round(selectedVisualRect.top / previewScale),
        w: Math.round(selectedVisualRect.width / previewScale),
        h: Math.round(selectedVisualRect.height / previewScale),
      },
    };
  }, [previewScale, selectedVisualNodeId, selectedVisualRect, transformPreview]);

  const selectionChrome = useMemo(() => {
    if (activeBlockFrame) {
      return {
        target: "block" as const,
        frame: activeBlockFrame.frame,
      };
    }
    if (activeVisualFrame) {
      return {
        target: "visual" as const,
        frame: activeVisualFrame.frame,
      };
    }
    return null;
  }, [activeBlockFrame, activeVisualFrame]);

  const selectionToolbarStyle = useMemo(() => {
    if (!selectionChrome) {
      return null;
    }

    const top = selectionChrome.frame.y * previewScale;
    const left = selectionChrome.frame.x * previewScale;
    const width = selectionChrome.frame.w * previewScale;
    const toolbarTop = top > 42 ? top - 38 : Math.min(scaledHeight - 34, top + 6);
    const toolbarLeft = Math.max(8, Math.min(left, scaledWidth - 220));

    return {
      top: `${toolbarTop}px`,
      left: `${toolbarLeft}px`,
      maxWidth: `${Math.max(160, Math.min(width, 220))}px`,
    };
  }, [previewScale, scaledHeight, scaledWidth, selectionChrome]);

  return (
    <div
      ref={frameContainerRef}
      className="relative"
      style={{ width: `${scaledWidth}px`, height: `${scaledHeight}px` }}
    >
      <iframe
        ref={iframeRef}
        title={`${htmlReportTitle} - page ${pagePreview.pageNumber}`}
        srcDoc={pagePreview.srcDoc}
        data-testid={`report-page-frame-${pagePreview.pageNumber}`}
        onLoad={() => {
          previewBridgeTargetRef.current = null;
          setFrameEpoch((current) => current + 1);
        }}
        className={[
          "block border-0 bg-white shadow-[0_12px_28px_rgba(15,23,31,0.16)]",
          interactive ? "" : "pointer-events-none",
        ].join(" ")}
        style={{
          width: `${HTML_REPORT_PAGE_WIDTH}px`,
          height: `${HTML_REPORT_PAGE_HEIGHT}px`,
          transform: `scale(${previewScale})`,
          transformOrigin: "top left",
        }}
      />

      {interactionMode === "arranging" ? (
        <button
          type="button"
          className="absolute inset-0 z-[7] cursor-crosshair bg-transparent"
          onClick={() => {
            if (suppressNextArrangeClickRef.current) {
              suppressNextArrangeClickRef.current = false;
              return;
            }
            if (transformSession) {
              return;
            }
            setInteractionMode("selected");
          }}
          aria-label="Canvas arrange surface"
        />
      ) : null}

      {selectedLayoutZone && selectedLayoutRect ? (
        <div
          className="pointer-events-none absolute z-[9] rounded-[14px] border border-[rgba(198,153,74,0.34)] bg-[rgba(198,153,74,0.06)]"
          style={{
            top: `${selectedLayoutRect.top}px`,
            left: `${selectedLayoutRect.left}px`,
            width: `${selectedLayoutRect.width}px`,
            height: `${selectedLayoutRect.height}px`,
          }}
        >
          <button
            type="button"
            onPointerDown={beginLayoutDrag}
            className="pointer-events-auto absolute top-1/2 z-10 h-[42px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(198,153,74,0.46)] bg-[rgba(255,250,241,0.94)] shadow-[0_10px_20px_rgba(15,23,31,0.12)] transition hover:bg-white"
            style={{
              left: `${((layoutPreviewSplit ?? selectedLayoutZone.splitPercent) / 100) * selectedLayoutRect.width}px`,
            }}
            aria-label={`Adjust ${selectedLayoutZone.kind} split`}
            title={`Drag to rebalance the ${selectedLayoutZone.kind} columns`}
          >
            <span className="mx-auto block h-5 w-[2px] rounded-full bg-[rgba(198,153,74,0.82)]" />
          </button>
        </div>
      ) : null}

      {selectionChrome && selectionToolbarStyle && interactionMode !== "editing-text" ? (
        <div
          className="absolute z-[12] flex items-center gap-1 rounded-full border border-[rgba(15,23,31,0.18)] bg-[rgba(255,255,255,0.92)] px-1.5 py-1 shadow-[0_10px_24px_rgba(15,23,31,0.14)] backdrop-blur-sm"
          style={selectionToolbarStyle}
          onClick={(event) => event.stopPropagation()}
        >
          {selectionChrome.target === "block" ? (
            <button
              type="button"
              onClick={() => openQuickEditorForSelectedBlock()}
              className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#173748] transition hover:bg-[rgba(15,23,31,0.08)]"
            >
              Edit
            </button>
          ) : null}
          <button
            type="button"
            onClick={beginSelectedObjectArrangement}
            className="rounded-full border border-[rgba(15,23,31,0.12)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#102838] transition hover:bg-[rgba(15,23,31,0.08)]"
          >
            {interactionMode === "arranging" ? "Done" : "Arrange"}
          </button>
          {interactionMode === "arranging" ? (
            <div className="px-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#6f7b84]">
              {transformSession
                ? "Click again to place"
                : "Click object to move or a corner to resize"}
            </div>
          ) : null}
        </div>
      ) : null}

      {activeBlockFrame ? (
        <div
          className={[
            "pointer-events-none absolute z-[10] rounded-[12px] border",
            interactionMode === "arranging"
              ? "border-[rgba(0,242,255,0.82)] bg-[rgba(0,242,255,0.08)]"
              : "border-[rgba(0,242,255,0.46)] bg-[rgba(0,242,255,0.03)]",
          ].join(" ")}
          style={{
            top: `${activeBlockFrame.frame.y * previewScale}px`,
            left: `${activeBlockFrame.frame.x * previewScale}px`,
            width: `${activeBlockFrame.frame.w * previewScale}px`,
            height: `${activeBlockFrame.frame.h * previewScale}px`,
          }}
        >
          {interactionMode === "arranging" ? (
            <>
              <button
                type="button"
                onClick={(event) => beginTransformInteraction("block", "move", event)}
                className="pointer-events-auto absolute inset-0 cursor-move rounded-[12px]"
                aria-label="Move text block"
              />
              {[
                ["resize-nw", "-left-2 -top-2 cursor-nwse-resize"],
                ["resize-ne", "-right-2 -top-2 cursor-nesw-resize"],
                ["resize-se", "-bottom-2 -right-2 cursor-nwse-resize"],
                ["resize-sw", "-bottom-2 -left-2 cursor-nesw-resize"],
              ].map(([mode, className]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={(event) =>
                    beginTransformInteraction(
                      "block",
                      mode as "resize-nw" | "resize-ne" | "resize-se" | "resize-sw",
                      event,
                    )
                  }
                  className={[
                    "pointer-events-auto absolute h-4 w-4 rounded-full border border-[rgba(0,242,255,0.92)] bg-white shadow-[0_0_14px_rgba(0,242,255,0.24)]",
                    className,
                  ].join(" ")}
                  aria-label={`Resize text block ${mode}`}
                />
              ))}
            </>
          ) : null}
        </div>
      ) : null}

      {activeVisualFrame ? (
        <div
          className={[
            "pointer-events-none absolute z-[10] rounded-[12px] border",
            interactionMode === "arranging"
              ? "border-[rgba(255,255,255,0.82)] bg-[rgba(255,255,255,0.06)]"
              : "border-[rgba(255,255,255,0.42)] bg-[rgba(255,255,255,0.02)]",
          ].join(" ")}
          style={{
            top: `${activeVisualFrame.frame.y * previewScale}px`,
            left: `${activeVisualFrame.frame.x * previewScale}px`,
            width: `${activeVisualFrame.frame.w * previewScale}px`,
            height: `${activeVisualFrame.frame.h * previewScale}px`,
          }}
        >
          {interactionMode === "arranging" ? (
            <>
              <button
                type="button"
                onClick={(event) => beginTransformInteraction("visual", "move", event)}
                className="pointer-events-auto absolute inset-0 cursor-move rounded-[12px]"
                aria-label="Move visual element"
              />
              {[
                ["resize-nw", "-left-2 -top-2 cursor-nwse-resize"],
                ["resize-ne", "-right-2 -top-2 cursor-nesw-resize"],
                ["resize-se", "-bottom-2 -right-2 cursor-nwse-resize"],
                ["resize-sw", "-bottom-2 -left-2 cursor-nesw-resize"],
              ].map(([mode, className]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={(event) =>
                    beginTransformInteraction(
                      "visual",
                      mode as "resize-nw" | "resize-ne" | "resize-se" | "resize-sw",
                      event,
                    )
                  }
                  className={[
                    "pointer-events-auto absolute h-4 w-4 rounded-full border border-white bg-[#0f1720] shadow-[0_0_14px_rgba(0,0,0,0.34)]",
                    className,
                  ].join(" ")}
                  aria-label={`Resize visual element ${mode}`}
                />
              ))}
            </>
          ) : null}
        </div>
      ) : null}

      {quickEditor ? (
        <div
          data-testid="quick-edit-popover"
          className="absolute z-10 rounded-[12px] border border-[rgba(220,207,185,0.68)] bg-[rgba(255,251,244,0.82)] p-2 shadow-[0_10px_24px_rgba(15,23,31,0.12)] backdrop-blur-md"
          style={{
            top: `${Math.min(quickEditor.top, scaledHeight - quickEditor.height - 28)}px`,
            left: `${Math.min(quickEditor.left, scaledWidth - quickEditor.width - 20)}px`,
            width: `${Math.max(180, Math.min(quickEditor.width, scaledWidth - 24))}px`,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#887a67]">
              {quickEditor.kind === "list" ? "Edit list" : "Edit text"}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setQuickEditor(null)}
                className="rounded-full px-2 py-0.5 text-[10px] font-medium text-[#707a84] transition hover:bg-[rgba(240,235,226,0.72)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyQuickEdit}
                data-testid="quick-edit-apply"
                className="rounded-full bg-[#102838] px-2 py-0.5 text-[10px] font-semibold text-white transition hover:bg-[#173748]"
              >
                Apply
              </button>
            </div>
          </div>

          <Textarea
            ref={quickEditorRef}
            value={quickEditor.value}
            data-testid="quick-edit-input"
            onChange={(event) => {
              setQuickEditor((current) =>
                current
                  ? {
                      ...current,
                      value: event.target.value,
                    }
                  : current,
              );
            }}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                applyQuickEdit();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setQuickEditor(null);
              }
            }}
            className="min-h-[84px] rounded-[10px] border border-[rgba(226,217,203,0.58)] bg-[rgba(255,255,255,0.42)] p-2 text-[12px] leading-5 text-[#122a39] shadow-none placeholder:text-[#8e9aa2]"
          />
          <div className="mt-1 text-[9px] text-[#91826d]">
            {quickEditor.kind === "list" ? "One line per item." : "Cmd/Ctrl + Enter applies."}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { HtmlReportPreviewFrame };
