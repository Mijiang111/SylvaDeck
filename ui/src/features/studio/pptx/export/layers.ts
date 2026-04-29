import type { PptExportLayerRole } from "./types";

export type ExportCanvasLayer = "background" | "content" | "foreground";

const LAYER_BASE_ORDER: Record<PptExportLayerRole, number> = {
  "native-chart-data": -1000000,
  background: 0,
  shape: 1,
  chart: 2,
  table: 3,
  text: 4,
  foreground: 5,
};

const CANVAS_LAYER_BASE_ORDER: Record<ExportCanvasLayer, number> = {
  background: 0,
  content: 1000000,
  foreground: 2000000,
};

export function readOwnZIndex(view: Window, element: Element) {
  const value = view.getComputedStyle(element).zIndex;
  if (!value || value === "auto") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function numericZIndex(view: Window, element: Element, pageElement?: HTMLElement) {
  if (!pageElement) {
    return readOwnZIndex(view, element) ?? 0;
  }

  let current: Element | null = element;
  while (current && current !== pageElement.parentElement) {
    const ownZIndex = readOwnZIndex(view, current);
    if (ownZIndex !== null) {
      return ownZIndex;
    }
    if (current === pageElement) {
      break;
    }
    current = current.parentElement;
  }

  return 0;
}

export function readExportCanvasLayer(element: Element, pageElement: HTMLElement): {
  canvasLayer: ExportCanvasLayer;
  canvasLayerOrder: number;
} {
  let current: Element | null = element;
  while (current && current !== pageElement.parentElement) {
    const rawLayer =
      current.getAttribute("data-html-canvas-layer") ??
      current.getAttribute("data-html-canvas-overlay-root");
    if (rawLayer === "background" || rawLayer === "foreground") {
      const rawLayerOrder = current.getAttribute("data-html-canvas-layer-order");
      const parsedLayerOrder = rawLayerOrder ? Number.parseInt(rawLayerOrder, 10) : 0;
      return {
        canvasLayer: rawLayer,
        canvasLayerOrder: Number.isFinite(parsedLayerOrder) ? parsedLayerOrder : 0,
      };
    }
    if (current === pageElement) {
      break;
    }
    current = current.parentElement;
  }
  return {
    canvasLayer: "content",
    canvasLayerOrder: 0,
  };
}

export function layerZOrder(args: {
  layerRole: PptExportLayerRole;
  sourceOrder?: number;
  zIndex?: number;
  canvasLayer?: ExportCanvasLayer;
  canvasLayerOrder?: number;
  offset?: number;
}) {
  if (args.layerRole === "native-chart-data") {
    return (
      LAYER_BASE_ORDER[args.layerRole] +
      (args.zIndex ?? 0) * 1000 +
      (args.sourceOrder ?? 0) * 10 +
      (args.offset ?? 0)
    );
  }
  return (
    CANVAS_LAYER_BASE_ORDER[args.canvasLayer ?? "content"] +
    (args.canvasLayerOrder ?? 0) * 100000 +
    (args.zIndex ?? 0) * 1000 +
    (args.sourceOrder ?? 0) * 10 +
    LAYER_BASE_ORDER[args.layerRole] +
    (args.offset ?? 0)
  );
}
