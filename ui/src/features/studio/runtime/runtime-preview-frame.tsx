import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
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
  hasPageFitFailure,
  type PageFitMeasurement,
} from "@/features/studio/generation";
import type {
  HtmlCanvasFrame,
  HtmlCanvasTransform,
  HtmlEditableBlockKind,
  HtmlFitParticipation,
  HtmlVisualAtomizationRole,
  HtmlVisualNodeKind,
  HtmlVisualSelectionPriority,
} from "@/features/studio/types";
import type { TextLayoutWhiteSpace } from "@/features/studio/text-layout/text-layout-types";
import {
  HTML_REPORT_PAGE_HEIGHT,
  HTML_REPORT_PAGE_WIDTH,
  type HtmlReportPagePreview,
} from "./runtime-export-annotations";
import { HTML_REPORT_PAGE_RADIUS } from "./runtime-report-view-math";
import type { PreviewSelectionPreference } from "./preview-selection";
import {
  resolvePreviewBlockSizingBehavior,
  type PreviewBlockSizingBehavior,
} from "./preview-transform-policy";

type PreviewInteractionMode = "idle" | "selected";
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
  pointerId: number;
  initialFrame: HtmlCanvasFrame;
  initialFontSize?: number;
  blockTextLayout?: {
    kind: HtmlEditableBlockKind;
    text: string;
    items: string[];
    baseFontSizePx: number;
    fontFamily: string;
    fontWeight: string;
    fontStyle: string;
    lineHeightPx: number;
    whiteSpace: TextLayoutWhiteSpace;
  };
  linkedVisualNodeId?: string | null;
  sizingBehavior: PreviewBlockSizingBehavior;
  originClientX: number;
  originClientY: number;
  anchorX: number;
  anchorY: number;
};

type PreviewRectPayload = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type SelectedBlockRect = PreviewRectPayload & {
  fontSize?: number;
  blockKind: HtmlEditableBlockKind;
  text: string;
  items: string[];
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  lineHeightPx: number;
  whiteSpace: TextLayoutWhiteSpace;
  linkedVisualNodeId?: string | null;
  linkedVisualKind?: HtmlVisualNodeKind | null;
  linkedVisualFitParticipation?: HtmlFitParticipation | null;
  linkedVisualAtomizationRole?: HtmlVisualAtomizationRole | null;
  linkedVisualSelectionPriority?: HtmlVisualSelectionPriority | null;
  sharesSource: boolean;
  sizingBehavior: PreviewBlockSizingBehavior;
};

type SelectedVisualRect = PreviewRectPayload;

type PreviewSelectionMeasurementPayload = {
  type: "ppt-html-preview-selection-measure";
  pageNumber: number;
  target?: "block" | "visual" | null;
  blockId?: string;
  blockKind?: HtmlEditableBlockKind;
  visualNodeId?: string;
  visualKind?: HtmlVisualNodeKind;
  rect?: PreviewRectPayload;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  lineHeight?: number;
  linkedVisualNodeId?: string;
  linkedVisualKind?: HtmlVisualNodeKind;
  linkedVisualFitParticipation?: HtmlFitParticipation;
  linkedVisualAtomizationRole?: HtmlVisualAtomizationRole;
  linkedVisualSelectionPriority?: HtmlVisualSelectionPriority;
  sharesSource?: boolean;
  sizingBehavior?: PreviewBlockSizingBehavior;
  whiteSpace?: TextLayoutWhiteSpace;
  text?: string;
  items?: string[];
};

function isDomHTMLElement(value: unknown): value is HTMLElement {
  return Boolean(
    value &&
      typeof value === "object" &&
      "nodeType" in value &&
      (value as Node).nodeType === Node.ELEMENT_NODE,
  );
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

function scaleFrameToPreviewRect(frame: HtmlCanvasFrame, previewScale: number) {
  return {
    top: frame.y * previewScale,
    left: frame.x * previewScale,
    width: frame.w * previewScale,
    height: frame.h * previewScale,
  };
}

function isFinitePreviewRect(value: unknown): value is PreviewRectPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const rect = value as PreviewRectPayload;
  return (
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height)
  );
}

function HtmlReportPreviewFrame({
  htmlReportTitle,
  pagePreview,
  pageCount,
  previewScale,
  interactive = true,
  onSelectBlock,
  onSelectVisualNode,
  onCommitBlockTransform,
  onCommitVisualTransform,
  onReturnBlockToFlow,
  onReturnVisualToFlow,
  onShiftBlockLayer,
  onShiftVisualLayer,
  onPageOverflow,
  onPageMeasurement,
  preferredSelectionType = "page",
  selectedBlockId,
  selectedBlockTransform,
  selectedVisualNodeId,
  selectedVisualTransform,
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
  onPageOverflow?: (pageNumber: number, overflows: boolean) => void;
  onPageMeasurement?: (measurement: PageFitMeasurement) => void;
  preferredSelectionType?: PreviewSelectionPreference;
  selectedBlockId?: string | null;
  selectedBlockTransform?: HtmlCanvasTransform | null;
  selectedVisualNodeId?: string | null;
  selectedVisualTransform?: HtmlCanvasTransform | null;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const frameContainerRef = useRef<HTMLDivElement | null>(null);
  const [frameEpoch, setFrameEpoch] = useState(0);
  const [isFrameVisible, setIsFrameVisible] = useState(false);
  const [selectedBlockRect, setSelectedBlockRect] = useState<SelectedBlockRect | null>(null);
  const [selectedVisualRect, setSelectedVisualRect] = useState<SelectedVisualRect | null>(null);
  const [transformPreview, setTransformPreview] = useState<null | {
    target: "block" | "visual";
    id: string;
    frame: HtmlCanvasFrame;
    fontSize?: number;
  }>(null);
  const [interactionMode, setInteractionMode] = useState<PreviewInteractionMode>("idle");
  const [transformSession, setTransformSession] = useState<PreviewTransformSession | null>(null);
  const previewBridgeTargetRef = useRef<string | null>(null);
  const transformPreviewRafRef = useRef<number | null>(null);
  const transformLatestPointerRef = useRef<null | { clientX: number; clientY: number }>(null);
  const transformPointerCaptureTargetRef = useRef<HTMLElement | null>(null);
  const transformPointerIdRef = useRef<number | null>(null);
  const selectedBlockIdRef = useRef<string | null>(selectedBlockId ?? null);
  const selectedVisualNodeIdRef = useRef<string | null>(selectedVisualNodeId ?? null);

  const scaledWidth = Math.round(HTML_REPORT_PAGE_WIDTH * previewScale);
  const scaledHeight = Math.round(HTML_REPORT_PAGE_HEIGHT * previewScale);

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

  const clearTransformPreviewRaf = useCallback(() => {
    if (typeof window !== "undefined" && transformPreviewRafRef.current !== null) {
      window.cancelAnimationFrame(transformPreviewRafRef.current);
    }
    transformPreviewRafRef.current = null;
    transformLatestPointerRef.current = null;
  }, []);

  const releaseTransformPointerCapture = useCallback((pointerId?: number | null) => {
    const captureTarget = transformPointerCaptureTargetRef.current;
    const resolvedPointerId = pointerId ?? transformPointerIdRef.current;
    if (
      captureTarget &&
      resolvedPointerId != null &&
      typeof captureTarget.releasePointerCapture === "function"
    ) {
      try {
        if (captureTarget.hasPointerCapture(resolvedPointerId)) {
          captureTarget.releasePointerCapture(resolvedPointerId);
        }
      } catch {
        // Ignore capture release failures when the pointer was already lost.
      }
    }
    transformPointerCaptureTargetRef.current = null;
    transformPointerIdRef.current = null;
  }, []);

  const scheduleSelectionRemeasure = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.requestAnimationFrame(() => {
      postPreviewCommand({
        action: "measure-selection",
      });
    });
  }, [pagePreview.pageNumber]);

  function queueTransformCancel(nextMode: PreviewInteractionMode = "selected") {
    releaseTransformPointerCapture(transformSession?.pointerId ?? null);
    clearTransformPreviewRaf();
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

  useEffect(() => {
    const node = frameContainerRef.current;
    if (!node || typeof window === "undefined") {
      return;
    }

    const updateVisibilityFromRect = () => {
      const rect = node.getBoundingClientRect();
      setIsFrameVisible(
        rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < window.innerHeight &&
          rect.left < window.innerWidth,
      );
    };

    updateVisibilityFromRect();

    if (typeof window.IntersectionObserver === "function") {
      const observer = new window.IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry) {
            return;
          }
          setIsFrameVisible(
            entry.isIntersecting &&
              entry.intersectionRect.width > 0 &&
              entry.intersectionRect.height > 0,
          );
        },
        { threshold: 0.05 },
      );
      observer.observe(node);
      return () => observer.disconnect();
    }

    window.addEventListener("scroll", updateVisibilityFromRect, true);
    window.addEventListener("resize", updateVisibilityFromRect);
    return () => {
      window.removeEventListener("scroll", updateVisibilityFromRect, true);
      window.removeEventListener("resize", updateVisibilityFromRect);
    };
  }, [pagePreview.pageNumber, pagePreview.srcDoc, previewScale]);

  useLayoutEffect(() => {
    if (frameEpoch < 1) {
      return;
    }

    postPreviewCommand({
      action: "selection-context",
      preferredSelectionType,
      selectedBlockId,
      selectedVisualNodeId,
      selectedVisualTransformMode: selectedVisualTransform?.mode ?? null,
    });
  }, [
    frameEpoch,
    pagePreview.pageNumber,
    preferredSelectionType,
    selectedBlockId,
    selectedVisualNodeId,
    selectedVisualTransform,
  ]);

  useEffect(() => {
    if (frameEpoch < 1) {
      return;
    }

    scheduleSelectionRemeasure();
  }, [
    frameEpoch,
    pagePreview.srcDoc,
    previewScale,
    selectedBlockId,
    selectedBlockTransform,
    selectedVisualNodeId,
    selectedVisualTransform,
    scheduleSelectionRemeasure,
  ]);

  useEffect(() => {
    if (frameEpoch < 1) {
      return;
    }

    postPreviewCommand({
      action: "preview-runtime-visibility",
      active: isFrameVisible,
    });
  }, [frameEpoch, isFrameVisible, pagePreview.pageNumber]);

  useEffect(
    () => () => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: "ppt-html-preview-command",
          pageNumber: pagePreview.pageNumber,
          action: "preview-runtime-visibility",
          active: false,
        },
        "*",
      );
    },
    [pagePreview.pageNumber],
  );

  useEffect(() => {
    selectedBlockIdRef.current = selectedBlockId ?? null;
  }, [selectedBlockId]);

  useEffect(() => {
    selectedVisualNodeIdRef.current = selectedVisualNodeId ?? null;
  }, [selectedVisualNodeId]);

  useEffect(() => {
    if (!selectedBlockId && !selectedVisualNodeId) {
      setInteractionMode("idle");
      setSelectedBlockRect(null);
      setSelectedVisualRect(null);
      return;
    }

    setInteractionMode("selected");
  }, [selectedBlockId, selectedVisualNodeId]);

  const applySelectionMeasurement = useCallback(
    (payload: PreviewSelectionMeasurementPayload) => {
      if (payload.pageNumber !== pagePreview.pageNumber) {
        return;
      }

      if (!payload.target) {
        if (!selectedBlockIdRef.current && !selectedVisualNodeIdRef.current) {
          setSelectedBlockRect(null);
          setSelectedVisualRect(null);
        }
        return;
      }

      if (!isFinitePreviewRect(payload.rect)) {
        return;
      }

      const scaledRect = {
        top: payload.rect.top * previewScale,
        left: payload.rect.left * previewScale,
        width: payload.rect.width * previewScale,
        height: payload.rect.height * previewScale,
      };

      if (payload.target === "block") {
        if (!payload.blockId || payload.blockId !== selectedBlockIdRef.current) {
          return;
        }
        const blockKind = payload.blockKind ?? "paragraph";
        const linkedVisualNodeId = payload.linkedVisualNodeId ?? null;
        const linkedVisualKind = payload.linkedVisualKind ?? null;
        const linkedVisualFitParticipation = payload.linkedVisualFitParticipation ?? null;
        const linkedVisualAtomizationRole = payload.linkedVisualAtomizationRole ?? null;
        const sharesSource = payload.sharesSource ?? Boolean(linkedVisualNodeId);
        setSelectedVisualRect(null);
        setSelectedBlockRect({
          ...scaledRect,
          fontSize:
            Number.isFinite(payload.fontSize) && (payload.fontSize ?? 0) > 0
              ? payload.fontSize
              : undefined,
          blockKind,
          text: payload.text ?? "",
          items: payload.items ?? [],
          fontFamily: payload.fontFamily || "Arial",
          fontWeight: payload.fontWeight || "400",
          fontStyle: payload.fontStyle || "normal",
          lineHeightPx:
            Number.isFinite(payload.lineHeight) && (payload.lineHeight ?? 0) > 0
              ? payload.lineHeight!
              : Number.isFinite(payload.fontSize) && (payload.fontSize ?? 0) > 0
                ? payload.fontSize! * 1.2
                : 19.2,
          whiteSpace:
            payload.whiteSpace === "pre-wrap" || payload.whiteSpace === "normal"
              ? payload.whiteSpace
              : "normal",
          linkedVisualNodeId,
          linkedVisualKind,
          linkedVisualFitParticipation,
          linkedVisualAtomizationRole,
          linkedVisualSelectionPriority: payload.linkedVisualSelectionPriority ?? null,
          sharesSource,
          sizingBehavior:
            payload.sizingBehavior ??
            resolvePreviewBlockSizingBehavior({
              blockKind,
              linkedVisualNodeId,
              linkedVisualKind,
              linkedVisualFitParticipation,
              linkedVisualAtomizationRole,
              sharesSource,
            }),
        });
        return;
      }

      if (
        payload.target === "visual" &&
        payload.visualNodeId &&
        payload.visualNodeId === selectedVisualNodeIdRef.current
      ) {
        setSelectedBlockRect(null);
        setSelectedVisualRect(scaledRect);
      }
    },
    [pagePreview.pageNumber, previewScale],
  );

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
        onPageMeasurement?.(payload.measurement);
        onPageOverflow?.(
          payload.measurement.pageNumber,
          hasPageFitFailure(payload.measurement, pageCount),
        );
        return;
      }

      if (event.data.type === "ppt-html-preview-selection-measure") {
        applySelectionMeasurement(event.data as PreviewSelectionMeasurementPayload);
        return;
      }

      if (event.data.type !== "ppt-html-preview-interaction") {
        return;
      }

      const payload = event.data as PreviewSelectionMeasurementPayload & {
        action?: "select" | "inspect" | "background";
      };

      if (payload.action === "background") {
        queueTransformCancel("selected");
        return;
      }

      if (payload.visualNodeId && payload.visualKind) {
        selectedBlockIdRef.current = null;
        selectedVisualNodeIdRef.current = payload.visualNodeId;
        onSelectVisualNode?.(payload.pageNumber, payload.visualNodeId, payload.visualKind);
        queueTransformCancel("selected");
        setInteractionMode("selected");
        applySelectionMeasurement({ ...payload, target: "visual" });
        return;
      }

      if (!payload.blockId) {
        return;
      }

      if (payload.action === "select") {
        selectedBlockIdRef.current = payload.blockId;
        selectedVisualNodeIdRef.current = null;
        onSelectBlock?.(payload.pageNumber, payload.blockId);
        queueTransformCancel("selected");
        setInteractionMode("selected");
        applySelectionMeasurement({ ...payload, target: "block" });
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [
    onPageMeasurement,
    onPageOverflow,
    onSelectBlock,
    onSelectVisualNode,
    applySelectionMeasurement,
    scheduleSelectionRemeasure,
  ]);

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
      releaseTransformPointerCapture(null);
    }
  }, [releaseTransformPointerCapture, transformSession]);

  useEffect(() => {
    if (!transformSession) {
      return;
    }

    if (
      (transformSession.target === "block" && transformSession.id !== selectedBlockId) ||
      (transformSession.target === "visual" && transformSession.id !== selectedVisualNodeId)
    ) {
      queueTransformCancel("selected");
    }
  }, [selectedBlockId, selectedVisualNodeId, transformSession]);

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
    let finalFontSize = transformPreview?.fontSize ?? transformSession.initialFontSize;

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

    const applyTransformPreviewFromPointer = (clientX: number, clientY: number) => {
      finalFrame = computeFrame(clientX, clientY);
      if (transformSession.target === "block") {
        if (
          transformSession.sizingBehavior === "text-auto" &&
          transformSession.blockTextLayout
        ) {
          const baseFontSize =
            transformSession.initialFontSize ??
            transformSession.blockTextLayout.baseFontSizePx ??
            16;
          const scaleRatio = Math.max(
            0.55,
            Math.min(2.4, finalFrame.w / Math.max(1, transformSession.initialFrame.w)),
          );
          finalFontSize = Math.max(10, Math.round(baseFontSize * scaleRatio));
          finalFrame = resolveAutoSizedBlockFrame({
            frame: finalFrame,
            mode: transformSession.mode,
            blockTextLayout: transformSession.blockTextLayout,
            fontSizePx: finalFontSize,
            initialFrame: transformSession.initialFrame,
          });
        } else {
          finalFontSize = undefined;
        }
      } else {
        finalFontSize = undefined;
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

    const flushPendingTransformPreview = () => {
      if (typeof window !== "undefined" && transformPreviewRafRef.current !== null) {
        window.cancelAnimationFrame(transformPreviewRafRef.current);
      }
      transformPreviewRafRef.current = null;
      const latestPointer = transformLatestPointerRef.current;
      if (latestPointer) {
        applyTransformPreviewFromPointer(latestPointer.clientX, latestPointer.clientY);
      }
      transformLatestPointerRef.current = null;
    };

    const commitTransform = () => {
      flushPendingTransformPreview();
      const frameChanged =
        finalFrame.x !== transformSession.initialFrame.x ||
        finalFrame.y !== transformSession.initialFrame.y ||
        finalFrame.w !== transformSession.initialFrame.w ||
        finalFrame.h !== transformSession.initialFrame.h;
      const fontSizeChanged =
        (finalFontSize ?? null) !== (transformSession.initialFontSize ?? null);

      if (!frameChanged && !fontSizeChanged) {
        queueTransformCancel("selected");
        return;
      }

      releaseTransformPointerCapture(transformSession.pointerId);
      postPreviewCommand({
        action: "transform-preview-commit",
        target: transformSession.target,
        targetId: transformSession.id,
        frame: finalFrame,
        fontSize: finalFontSize,
      });
      previewBridgeTargetRef.current = null;
      setTransformPreview(null);
      setTransformSession(null);
      setInteractionMode("selected");
      scheduleSelectionRemeasure();
      if (transformSession.target === "block") {
        setSelectedBlockRect((current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            ...scaleFrameToPreviewRect(finalFrame, previewScale),
            fontSize: finalFontSize ?? current.fontSize,
          };
        });
      } else {
        setSelectedVisualRect(scaleFrameToPreviewRect(finalFrame, previewScale));
      }
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
      if (moveEvent.pointerId !== transformSession.pointerId) {
        return;
      }
      transformLatestPointerRef.current = {
        clientX: moveEvent.clientX,
        clientY: moveEvent.clientY,
      };
      if (transformPreviewRafRef.current !== null || typeof window === "undefined") {
        return;
      }
      transformPreviewRafRef.current = window.requestAnimationFrame(() => {
        transformPreviewRafRef.current = null;
        const latestPointer = transformLatestPointerRef.current;
        if (!latestPointer) {
          return;
        }
        applyTransformPreviewFromPointer(latestPointer.clientX, latestPointer.clientY);
      });
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== transformSession.pointerId) {
        return;
      }
      commitTransform();
    };

    const handlePointerCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== transformSession.pointerId) {
        return;
      }
      cancelTransform();
    };

    const handleKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== "Escape") {
        return;
      }
      keyEvent.preventDefault();
      cancelTransform();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("pointercancel", handlePointerCancel, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTransformPreviewRaf();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerCancel, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    clearTransformPreviewRaf,
    onCommitBlockTransform,
    onCommitVisualTransform,
    pagePreview.pageNumber,
    previewScale,
    scheduleSelectionRemeasure,
    transformSession,
  ]);

  function beginTransformInteraction(
    target: "block" | "visual",
    mode: PreviewTransformMode,
    event: ReactPointerEvent<HTMLButtonElement | HTMLDivElement>,
    options?: { centerOnPointer?: boolean },
  ) {
    const targetRect = target === "block" ? selectedBlockRect : selectedVisualRect;
    const targetId = target === "block" ? selectedBlockId : selectedVisualNodeId;
    const containerRect = frameContainerRef.current?.getBoundingClientRect();
    if (!targetRect || !targetId || !containerRect) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (
      isDomHTMLElement(event.currentTarget) &&
      typeof event.currentTarget.setPointerCapture === "function"
    ) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
        transformPointerCaptureTargetRef.current = event.currentTarget;
        transformPointerIdRef.current = event.pointerId;
      } catch {
        transformPointerCaptureTargetRef.current = null;
        transformPointerIdRef.current = null;
      }
    } else {
      transformPointerCaptureTargetRef.current = null;
      transformPointerIdRef.current = null;
    }

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

    setInteractionMode("selected");
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
      pointerId: event.pointerId,
      initialFrame,
      initialFontSize,
      blockTextLayout:
        target === "block" &&
        selectedBlockRect &&
        selectedBlockRect.sizingBehavior === "text-auto"
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
      linkedVisualNodeId:
        target === "block" ? selectedBlockRect?.linkedVisualNodeId ?? null : null,
      sizingBehavior:
        target === "block"
          ? selectedBlockRect?.sizingBehavior ??
            resolvePreviewBlockSizingBehavior({
              blockKind: selectedBlockRect?.blockKind ?? null,
              linkedVisualNodeId: selectedBlockRect?.linkedVisualNodeId ?? null,
              linkedVisualKind: selectedBlockRect?.linkedVisualKind ?? null,
              linkedVisualFitParticipation:
                selectedBlockRect?.linkedVisualFitParticipation ?? null,
              linkedVisualAtomizationRole:
                selectedBlockRect?.linkedVisualAtomizationRole ?? null,
              sharesSource: selectedBlockRect?.sharesSource ?? false,
            })
          : "frame-only",
      originClientX: event.clientX,
      originClientY: event.clientY,
      anchorX,
      anchorY,
    });
  }

  const activeBlockFrame = useMemo(() => {
    if (preferredSelectionType === "visual") {
      return null;
    }
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
  }, [
    pagePreview.pageNumber,
    preferredSelectionType,
    previewScale,
    selectedBlockId,
    selectedBlockRect,
    transformPreview,
  ]);

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
    const hasReturnAction = Boolean(
      selectionChrome.target === "block" ? selectedBlockTransform : selectedVisualTransform,
    );
    const toolbarWidth =
      selectionChrome.target === "block"
        ? hasReturnAction
          ? 184
          : 142
        : hasReturnAction
          ? 154
          : 112;
    const toolbarHeight = 24;
    const toolbarTop =
      top > toolbarHeight + 6
        ? top - toolbarHeight - 2
        : Math.min(scaledHeight - toolbarHeight - 6, top + 4);
    const toolbarLeft = Math.max(
      8,
      Math.min(left + width - toolbarWidth, scaledWidth - toolbarWidth - 6),
    );

    return {
      top: `${toolbarTop}px`,
      left: `${toolbarLeft}px`,
      width: `${toolbarWidth}px`,
      minHeight: `${toolbarHeight}px`,
    };
  }, [
    previewScale,
    scaledHeight,
    scaledWidth,
    selectionChrome,
    selectedBlockTransform,
    selectedVisualTransform,
  ]);

  function handleReturnToFlow() {
    if (selectionChrome?.target === "block" && selectedBlockId && selectedBlockTransform) {
      onReturnBlockToFlow?.(pagePreview.pageNumber, selectedBlockId);
      return;
    }

    if (selectionChrome?.target === "visual" && selectedVisualNodeId && selectedVisualTransform) {
      onReturnVisualToFlow?.(pagePreview.pageNumber, selectedVisualNodeId);
    }
  }

  function handleShiftLayer(direction: "forward" | "backward") {
    if (selectionChrome?.target === "block" && selectedBlockId && activeBlockFrame) {
      onShiftBlockLayer?.(
        pagePreview.pageNumber,
        selectedBlockId,
        direction,
        activeBlockFrame.frame,
        selectedBlockRect?.sizingBehavior === "frame-only"
          ? undefined
          : activeBlockFrame.fontSize,
      );
      return;
    }

    if (selectionChrome?.target === "visual" && selectedVisualNodeId && activeVisualFrame) {
      onShiftVisualLayer?.(
        pagePreview.pageNumber,
        selectedVisualNodeId,
        direction,
        activeVisualFrame.frame,
      );
    }
  }

  function handleSelectedBlockFramePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }

    beginTransformInteraction("block", "move", event);
  }

  function handleSelectedVisualFramePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }

    beginTransformInteraction("visual", "move", event);
  }

  const isTransforming = Boolean(transformSession);
  const selectionChromeHasReturnAction = Boolean(
    selectionChrome &&
      (selectionChrome.target === "block" ? selectedBlockTransform : selectedVisualTransform),
  );
  const selectionToolbarButtonClass =
    "h-6 px-2 text-[8px] font-medium tracking-[0.02em] text-[#183746] transition-colors hover:bg-[rgba(15,23,31,0.05)]";
  const selectionToolbarSeparatedButtonClass = `${selectionToolbarButtonClass} border-l border-[rgba(15,23,31,0.11)]`;
  const selectionToolbarHasLeadingAction = selectionChromeHasReturnAction;

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
        sandbox="allow-scripts"
        data-ppt-export-page-frame={pagePreview.pageNumber}
        data-testid={`report-page-frame-${pagePreview.pageNumber}`}
        onLoad={() => {
          previewBridgeTargetRef.current = null;
          setFrameEpoch((current) => current + 1);
        }}
        className={[
          "block border-0 shadow-[0_12px_28px_rgba(15,23,31,0.16)]",
          interactive ? "" : "pointer-events-none",
        ].join(" ")}
        style={{
          width: `${HTML_REPORT_PAGE_WIDTH}px`,
          height: `${HTML_REPORT_PAGE_HEIGHT}px`,
          transform: `scale(${previewScale})`,
          transformOrigin: "top left",
          borderRadius: `${HTML_REPORT_PAGE_RADIUS}px`,
          background: "transparent",
        }}
      />

      {interactive && selectionChrome && selectionToolbarStyle ? (
        <div
          data-testid={`preview-selection-toolbar-${pagePreview.pageNumber}`}
          className="absolute z-[12] inline-flex items-stretch overflow-hidden border border-[rgba(15,23,31,0.18)] bg-[rgba(248,247,244,0.98)] shadow-[0_3px_10px_rgba(15,23,31,0.08)] backdrop-blur-sm"
          style={selectionToolbarStyle}
          onClick={(event) => event.stopPropagation()}
        >
          {selectionChromeHasReturnAction ? (
            <button
              type="button"
              onClick={handleReturnToFlow}
              className={
                selectionChrome.target === "block"
                  ? selectionToolbarSeparatedButtonClass
                  : selectionToolbarButtonClass
              }
            >
              Return
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => handleShiftLayer("forward")}
            className={
              selectionToolbarHasLeadingAction
                ? selectionToolbarSeparatedButtonClass
                : selectionToolbarButtonClass
            }
          >
            Forward
          </button>
          <button
            type="button"
            onClick={() => handleShiftLayer("backward")}
            className={selectionToolbarSeparatedButtonClass}
          >
            Backward
          </button>
        </div>
      ) : null}

      {interactive && activeBlockFrame ? (
        <div
          data-testid={`preview-selection-block-frame-${pagePreview.pageNumber}`}
          className={[
            "pointer-events-auto absolute z-[10] cursor-move rounded-[8px] border-[1.5px]",
            isTransforming
              ? "border-[rgba(10,196,214,0.96)] bg-[rgba(10,196,214,0.10)] shadow-[0_0_0_1px_rgba(255,255,255,0.58),0_0_20px_rgba(10,196,214,0.16)]"
              : "border-[rgba(10,196,214,0.82)] bg-[rgba(10,196,214,0.04)] shadow-[0_0_0_1px_rgba(255,255,255,0.42)]",
          ].join(" ")}
          onPointerDown={handleSelectedBlockFramePointerDown}
          style={{
            top: `${activeBlockFrame.frame.y * previewScale}px`,
            left: `${activeBlockFrame.frame.x * previewScale}px`,
            width: `${activeBlockFrame.frame.w * previewScale}px`,
            height: `${activeBlockFrame.frame.h * previewScale}px`,
          }}
        >
          {[
            ["resize-nw", "-left-2 -top-2 cursor-nwse-resize"],
            ["resize-ne", "-right-2 -top-2 cursor-nesw-resize"],
            ["resize-se", "-bottom-2 -right-2 cursor-nwse-resize"],
            ["resize-sw", "-bottom-2 -left-2 cursor-nesw-resize"],
          ].map(([mode, className]) => (
            <button
              key={mode}
              type="button"
              onPointerDown={(event) =>
                beginTransformInteraction(
                  "block",
                  mode as "resize-nw" | "resize-ne" | "resize-se" | "resize-sw",
                  event,
                )
              }
              data-testid={`preview-resize-block-${mode}-${pagePreview.pageNumber}`}
              className={[
                "pointer-events-auto absolute h-4 w-4 rounded-[2px] border border-[rgba(10,196,214,0.96)] bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.9),0_2px_8px_rgba(10,196,214,0.18)]",
                className,
              ].join(" ")}
              aria-label={`Resize text block ${mode}`}
            />
          ))}
        </div>
      ) : null}

      {interactive && activeVisualFrame ? (
        <div
          data-testid={`preview-selection-visual-frame-${pagePreview.pageNumber}`}
          className={[
            "pointer-events-auto absolute z-[10] cursor-move rounded-[4px] border border-dashed",
            isTransforming
              ? "border-[rgba(28,40,50,0.96)] bg-[rgba(28,40,50,0.08)] shadow-[0_0_0_1px_rgba(255,255,255,0.36)]"
              : "border-[rgba(28,40,50,0.7)] bg-[rgba(28,40,50,0.03)] shadow-[0_0_0_1px_rgba(255,255,255,0.22)]",
          ].join(" ")}
          onPointerDown={handleSelectedVisualFramePointerDown}
          style={{
            top: `${activeVisualFrame.frame.y * previewScale}px`,
            left: `${activeVisualFrame.frame.x * previewScale}px`,
            width: `${activeVisualFrame.frame.w * previewScale}px`,
            height: `${activeVisualFrame.frame.h * previewScale}px`,
          }}
        >
          {[
            ["resize-nw", "-left-2 -top-2 cursor-nwse-resize"],
            ["resize-ne", "-right-2 -top-2 cursor-nesw-resize"],
            ["resize-se", "-bottom-2 -right-2 cursor-nwse-resize"],
            ["resize-sw", "-bottom-2 -left-2 cursor-nesw-resize"],
          ].map(([mode, className]) => (
            <button
              key={mode}
              type="button"
              onPointerDown={(event) =>
                beginTransformInteraction(
                  "visual",
                  mode as "resize-nw" | "resize-ne" | "resize-se" | "resize-sw",
                  event,
                )
              }
              data-testid={`preview-resize-visual-${mode}-${pagePreview.pageNumber}`}
              className={[
                "pointer-events-auto absolute h-4 w-4 rounded-none border border-[rgba(230,235,239,0.94)] bg-[#16232d] shadow-[0_2px_8px_rgba(0,0,0,0.26)]",
                className,
              ].join(" ")}
              aria-label={`Resize visual element ${mode}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export { HtmlReportPreviewFrame };
