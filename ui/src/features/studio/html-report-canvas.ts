import type {
  GeneratedHtmlReport,
  GeneratedHtmlReportCanvasOverrides,
  HtmlCanvasFrame,
  HtmlCanvasLayer,
  HtmlCanvasPageOverrides,
  HtmlCanvasTransform,
  HtmlEditableBlock,
  HtmlEditableStructure,
  HtmlVisualNode,
  HtmlVisualStructure,
} from "./types";

export const HTML_REPORT_PAGE_WIDTH = 1600;
export const HTML_REPORT_PAGE_HEIGHT = 900;
export const HTML_REPORT_CANVAS_SNAP_PX = 12;

type CanvasTargetKind = "block" | "visual";

type UpsertCanvasTransformArgs = {
  report: GeneratedHtmlReport;
  pageNumber: number;
  id: string;
  frame: HtmlCanvasFrame;
  fontSize?: number;
};

type ShiftCanvasTransformLayerArgs = UpsertCanvasTransformArgs & {
  direction: "forward" | "backward";
};

type RemoveCanvasTransformArgs = {
  report: GeneratedHtmlReport;
  pageNumber: number;
  id: string;
};

type DuplicateCanvasTransformArgs = {
  report: GeneratedHtmlReport;
  pageNumber: number;
  sourceId: string;
  nextId: string | null;
};

type InternalUpsertCanvasTransformArgs = UpsertCanvasTransformArgs & {
  target: CanvasTargetKind;
};

type InternalRemoveCanvasTransformArgs = RemoveCanvasTransformArgs & {
  target: CanvasTargetKind;
};

type InternalDuplicateCanvasTransformArgs = DuplicateCanvasTransformArgs & {
  target: CanvasTargetKind;
};

type InternalShiftCanvasTransformLayerArgs = ShiftCanvasTransformLayerArgs & {
  target: CanvasTargetKind;
};

type PageTransformEntry = {
  target: CanvasTargetKind;
  id: string;
  transform: HtmlCanvasTransform;
};

const CANVAS_LAYERS: HtmlCanvasLayer[] = ["background", "foreground"];

function normalizeFrame(frame: HtmlCanvasFrame): HtmlCanvasFrame {
  return {
    x: Math.max(0, Math.round(frame.x)),
    y: Math.max(0, Math.round(frame.y)),
    w: Math.max(8, Math.round(frame.w)),
    h: Math.max(8, Math.round(frame.h)),
  };
}

function normalizeLayer(value: unknown): HtmlCanvasLayer {
  return value === "background" ? "background" : "foreground";
}

function normalizeLayerOrder(value: unknown) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value as number)) : 0;
}

function normalizeTransform(value: unknown): HtmlCanvasTransform | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<HtmlCanvasTransform>;
  if (
    candidate.mode !== "flow" &&
    candidate.mode !== "freeform"
  ) {
    return null;
  }

  if (
    !candidate.frame ||
    typeof candidate.frame !== "object" ||
    !Number.isFinite(candidate.frame.x) ||
    !Number.isFinite(candidate.frame.y) ||
    !Number.isFinite(candidate.frame.w) ||
    !Number.isFinite(candidate.frame.h)
  ) {
    return null;
  }

  return {
    mode: candidate.mode,
    frame: normalizeFrame(candidate.frame),
    fontSize:
      Number.isFinite(candidate.fontSize) && (candidate.fontSize ?? 0) > 0
        ? Math.round(candidate.fontSize as number)
        : undefined,
    layer: normalizeLayer(candidate.layer),
    layerOrder: normalizeLayerOrder(candidate.layerOrder),
    lockedByUser: true,
  };
}

function collectPageTransformEntries(pageOverrides: HtmlCanvasPageOverrides): PageTransformEntry[] {
  return [
    ...Object.entries(pageOverrides.blockOverrides).map(
      ([id, transform]) =>
        ({
          target: "block",
          id,
          transform,
        }) satisfies PageTransformEntry,
    ),
    ...Object.entries(pageOverrides.visualOverrides).map(
      ([id, transform]) =>
        ({
          target: "visual",
          id,
          transform,
        }) satisfies PageTransformEntry,
    ),
  ];
}

function resequencePageLayerOrders(pageOverrides: HtmlCanvasPageOverrides) {
  const entries = collectPageTransformEntries(pageOverrides);
  CANVAS_LAYERS.forEach((layer) => {
    entries
      .filter((entry) => entry.transform.layer === layer)
      .sort((left, right) => {
        if (left.transform.layerOrder !== right.transform.layerOrder) {
          return left.transform.layerOrder - right.transform.layerOrder;
        }
        if (left.target !== right.target) {
          return left.target.localeCompare(right.target);
        }
        return left.id.localeCompare(right.id);
      })
      .forEach((entry, index) => {
        entry.transform.layerOrder = index;
      });
  });

  return pageOverrides;
}

function normalizePageOverrides(value: unknown): HtmlCanvasPageOverrides | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<HtmlCanvasPageOverrides>;
  if (!Number.isInteger(candidate.pageNumber) || (candidate.pageNumber ?? 0) < 1) {
    return null;
  }
  const pageNumber = candidate.pageNumber as number;

  const normalizeBucket = (bucket: unknown) => {
    if (!bucket || typeof bucket !== "object") {
      return {} as Record<string, HtmlCanvasTransform>;
    }

    return Object.fromEntries(
      Object.entries(bucket).flatMap(([id, rawValue]) => {
        const normalized = normalizeTransform(rawValue);
        return normalized && id.trim() ? [[id.trim(), normalized]] : [];
      }),
    ) as Record<string, HtmlCanvasTransform>;
  };

  return resequencePageLayerOrders({
    pageNumber,
    blockOverrides: normalizeBucket(candidate.blockOverrides),
    visualOverrides: normalizeBucket(candidate.visualOverrides),
  });
}

function clonePageOverrides(page: HtmlCanvasPageOverrides): HtmlCanvasPageOverrides {
  return resequencePageLayerOrders({
    pageNumber: page.pageNumber,
    blockOverrides: Object.fromEntries(
      Object.entries(page.blockOverrides).map(([id, transform]) => [
        id,
        {
          ...transform,
          frame: { ...transform.frame },
        },
      ]),
    ),
    visualOverrides: Object.fromEntries(
      Object.entries(page.visualOverrides).map(([id, transform]) => [
        id,
        {
          ...transform,
          frame: { ...transform.frame },
        },
      ]),
    ),
  });
}

export function createEmptyGeneratedHtmlReportCanvasOverrides(): GeneratedHtmlReportCanvasOverrides {
  return {
    pages: [],
  };
}

export function normalizeGeneratedHtmlReportCanvasOverrides(
  value: unknown,
): GeneratedHtmlReportCanvasOverrides {
  if (!value || typeof value !== "object") {
    return createEmptyGeneratedHtmlReportCanvasOverrides();
  }

  const candidate = value as Partial<GeneratedHtmlReportCanvasOverrides>;
  if (!Array.isArray(candidate.pages)) {
    return createEmptyGeneratedHtmlReportCanvasOverrides();
  }

  return {
    pages: candidate.pages
      .map((page) => normalizePageOverrides(page))
      .filter((page): page is HtmlCanvasPageOverrides => Boolean(page)),
  };
}

export function cloneGeneratedHtmlReportCanvasOverrides(
  overrides: GeneratedHtmlReportCanvasOverrides | undefined,
): GeneratedHtmlReportCanvasOverrides {
  return {
    pages: (overrides?.pages ?? []).map(clonePageOverrides),
  };
}

export function getGeneratedHtmlReportCanvasPageOverrides(
  overrides: GeneratedHtmlReportCanvasOverrides | undefined,
  pageNumber: number,
): HtmlCanvasPageOverrides | null {
  return overrides?.pages.find((page) => page.pageNumber === pageNumber) ?? null;
}

function getValidIdsForPage(
  structure: HtmlEditableStructure | undefined,
  visualStructure: HtmlVisualStructure | undefined,
  pageNumber: number,
) {
  const blockIds = new Set(
    structure?.pages
      .find((page) => page.pageNumber === pageNumber)
      ?.blocks.map((block) => block.id) ?? [],
  );
  const visualIds = new Set(
    visualStructure?.pages
      .find((page) => page.pageNumber === pageNumber)
      ?.nodes.map((node) => node.id) ?? [],
  );

  return { blockIds, visualIds };
}

export function pruneGeneratedHtmlReportCanvasOverrides(args: {
  overrides: GeneratedHtmlReportCanvasOverrides | undefined;
  structure: HtmlEditableStructure | undefined;
  visualStructure: HtmlVisualStructure | undefined;
}): GeneratedHtmlReportCanvasOverrides {
  const normalized = normalizeGeneratedHtmlReportCanvasOverrides(args.overrides);

  return {
    pages: normalized.pages
      .map((page) => {
        const { blockIds, visualIds } = getValidIdsForPage(
          args.structure,
          args.visualStructure,
          page.pageNumber,
        );

        const blockOverrides = Object.fromEntries(
          Object.entries(page.blockOverrides).filter(([id]) => blockIds.has(id)),
        );
        const visualOverrides = Object.fromEntries(
          Object.entries(page.visualOverrides).filter(([id]) => visualIds.has(id)),
        );

        if (
          Object.keys(blockOverrides).length === 0 &&
          Object.keys(visualOverrides).length === 0
        ) {
          return null;
        }

        return resequencePageLayerOrders({
          pageNumber: page.pageNumber,
          blockOverrides,
          visualOverrides,
        } satisfies HtmlCanvasPageOverrides);
      })
      .filter((page): page is HtmlCanvasPageOverrides => Boolean(page)),
  };
}

function getPageBlock(page: HtmlEditableStructure | undefined, pageNumber: number, id: string) {
  return (
    page?.pages.find((entry) => entry.pageNumber === pageNumber)?.blocks.find((block) => block.id === id) ??
    null
  );
}

function getPageVisualNode(
  visualStructure: HtmlVisualStructure | undefined,
  pageNumber: number,
  id: string,
) {
  return (
    visualStructure?.pages
      .find((entry) => entry.pageNumber === pageNumber)
      ?.nodes.find((node) => node.id === id) ?? null
  );
}

function blockSharesVisualSource(block: HtmlEditableBlock | null, visualNode: HtmlVisualNode | null) {
  if (!block || !visualNode) {
    return false;
  }

  return (
    block.sourceIndex === visualNode.sourceIndex &&
    block.sourceTag.toLowerCase() === visualNode.sourceTag.toLowerCase()
  );
}

function resolveDefaultLayer(args: {
  report: GeneratedHtmlReport;
  pageNumber: number;
  target: CanvasTargetKind;
  id: string;
}) {
  if (args.target === "block") {
    return "foreground" satisfies HtmlCanvasLayer;
  }

  const visualNode = getPageVisualNode(args.report.visualStructure, args.pageNumber, args.id);
  if (!visualNode) {
    return "foreground" satisfies HtmlCanvasLayer;
  }

  const structuralKinds = new Set<HtmlVisualNode["kind"]>(["surface", "divider", "rail"]);
  if (!structuralKinds.has(visualNode.kind)) {
    return "foreground" satisfies HtmlCanvasLayer;
  }

  const matchingBlock =
    args.report.structure?.pages
      .find((page) => page.pageNumber === args.pageNumber)
      ?.blocks.find((block) => blockSharesVisualSource(block, visualNode)) ?? null;

  return matchingBlock ? "foreground" : "background";
}

function getNextLayerOrder(pageOverrides: HtmlCanvasPageOverrides, layer: HtmlCanvasLayer) {
  return (
    collectPageTransformEntries(pageOverrides)
      .filter((entry) => entry.transform.layer === layer)
      .reduce((maxOrder, entry) => Math.max(maxOrder, entry.transform.layerOrder), -1) + 1
  );
}

function createNextTransform(args: InternalUpsertCanvasTransformArgs): HtmlCanvasTransform {
  const existingPage =
    normalizeGeneratedHtmlReportCanvasOverrides(args.report.canvasOverrides).pages.find(
      (page) => page.pageNumber === args.pageNumber,
    ) ?? null;
  const resolvedPage =
    existingPage ??
    {
      pageNumber: args.pageNumber,
      blockOverrides: {},
      visualOverrides: {},
    };
  const existingTransform =
    args.target === "block"
      ? existingPage?.blockOverrides[args.id]
      : existingPage?.visualOverrides[args.id];
  const layer =
    existingTransform?.layer ??
    resolveDefaultLayer({
      report: args.report,
      pageNumber: args.pageNumber,
      target: args.target,
      id: args.id,
    });
  const layerOrder = existingTransform?.layerOrder ?? getNextLayerOrder(resolvedPage, layer);

  return {
    mode: "freeform",
    frame: normalizeFrame(args.frame),
    fontSize:
      args.target === "block" &&
      Number.isFinite(args.fontSize) &&
      (args.fontSize ?? 0) > 0
        ? Math.round(args.fontSize as number)
        : undefined,
    layer,
    layerOrder,
    lockedByUser: true,
  };
}

function withUpsertedTransform(args: InternalUpsertCanvasTransformArgs) {
  const overrides = cloneGeneratedHtmlReportCanvasOverrides(args.report.canvasOverrides);
  const existingPage =
    overrides.pages.find((page) => page.pageNumber === args.pageNumber) ?? null;
  const pageOverrides =
    existingPage ??
    {
      pageNumber: args.pageNumber,
      blockOverrides: {},
      visualOverrides: {},
    };

  const nextTransform = createNextTransform(args);

  if (args.target === "block") {
    pageOverrides.blockOverrides[args.id] = nextTransform;
  } else {
    pageOverrides.visualOverrides[args.id] = nextTransform;
  }

  if (!existingPage) {
    overrides.pages.push(pageOverrides);
  }

  resequencePageLayerOrders(pageOverrides);

  return pruneGeneratedHtmlReportCanvasOverrides({
    overrides,
    structure: args.report.structure,
    visualStructure: args.report.visualStructure,
  });
}

function withRemovedTransform(args: InternalRemoveCanvasTransformArgs) {
  const overrides = cloneGeneratedHtmlReportCanvasOverrides(args.report.canvasOverrides);
  const pageOverrides = overrides.pages.find((page) => page.pageNumber === args.pageNumber);
  if (!pageOverrides) {
    return overrides;
  }

  if (args.target === "block") {
    delete pageOverrides.blockOverrides[args.id];
  } else {
    delete pageOverrides.visualOverrides[args.id];
  }

  resequencePageLayerOrders(pageOverrides);

  return pruneGeneratedHtmlReportCanvasOverrides({
    overrides,
    structure: args.report.structure,
    visualStructure: args.report.visualStructure,
  });
}

function withDuplicatedTransform(args: InternalDuplicateCanvasTransformArgs) {
  if (!args.nextId) {
    return cloneGeneratedHtmlReportCanvasOverrides(args.report.canvasOverrides);
  }

  const overrides = cloneGeneratedHtmlReportCanvasOverrides(args.report.canvasOverrides);
  const pageOverrides = overrides.pages.find((page) => page.pageNumber === args.pageNumber);
  if (!pageOverrides) {
    return overrides;
  }

  const source =
    args.target === "block"
      ? pageOverrides.blockOverrides[args.sourceId]
      : pageOverrides.visualOverrides[args.sourceId];
  if (!source) {
    return overrides;
  }

  const nextTransform = {
    ...source,
    frame: { ...source.frame, x: source.frame.x + 24, y: source.frame.y + 24 },
  };
  if (args.target === "block") {
    pageOverrides.blockOverrides[args.nextId] = nextTransform;
  } else {
    pageOverrides.visualOverrides[args.nextId] = nextTransform;
  }

  resequencePageLayerOrders(pageOverrides);

  return pruneGeneratedHtmlReportCanvasOverrides({
    overrides,
    structure: args.report.structure,
    visualStructure: args.report.visualStructure,
  });
}

function rewriteLayerState(
  pageOverrides: HtmlCanvasPageOverrides,
  entriesByKey: Map<string, PageTransformEntry>,
  backgroundOrder: string[],
  foregroundOrder: string[],
) {
  backgroundOrder.forEach((key, index) => {
    const entry = entriesByKey.get(key);
    if (!entry) {
      return;
    }
    entry.transform.layer = "background";
    entry.transform.layerOrder = index;
  });

  foregroundOrder.forEach((key, index) => {
    const entry = entriesByKey.get(key);
    if (!entry) {
      return;
    }
    entry.transform.layer = "foreground";
    entry.transform.layerOrder = index;
  });

  return resequencePageLayerOrders(pageOverrides);
}

function withShiftedTransformLayer(args: InternalShiftCanvasTransformLayerArgs) {
  const existingTransform =
    args.target === "block"
      ? getGeneratedHtmlReportBlockCanvasTransform({
          report: args.report,
          pageNumber: args.pageNumber,
          blockId: args.id,
        })
      : getGeneratedHtmlReportVisualCanvasTransform({
          report: args.report,
          pageNumber: args.pageNumber,
          nodeId: args.id,
        });

  if (!existingTransform) {
    return withUpsertedTransform(args);
  }

  const overrides = cloneGeneratedHtmlReportCanvasOverrides(args.report.canvasOverrides);
  const pageOverrides = overrides.pages.find((page) => page.pageNumber === args.pageNumber);
  if (!pageOverrides) {
    return overrides;
  }

  const entries = collectPageTransformEntries(pageOverrides);
  const entriesByKey = new Map(entries.map((entry) => [`${entry.target}:${entry.id}`, entry]));
  const backgroundOrder = entries
    .filter((entry) => entry.transform.layer === "background")
    .sort((left, right) => left.transform.layerOrder - right.transform.layerOrder)
    .map((entry) => `${entry.target}:${entry.id}`);
  const foregroundOrder = entries
    .filter((entry) => entry.transform.layer === "foreground")
    .sort((left, right) => left.transform.layerOrder - right.transform.layerOrder)
    .map((entry) => `${entry.target}:${entry.id}`);
  const key = `${args.target}:${args.id}`;
  const entry = entriesByKey.get(key);
  if (!entry) {
    return overrides;
  }

  const moveWithinLayer = (order: string[], fromIndex: number, toIndex: number) => {
    const [moved] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, moved);
  };

  if (args.direction === "backward") {
    if (entry.transform.layer === "foreground") {
      const index = foregroundOrder.indexOf(key);
      if (index > 0) {
        moveWithinLayer(foregroundOrder, index, index - 1);
      } else if (index === 0) {
        foregroundOrder.splice(index, 1);
        backgroundOrder.push(key);
      }
    } else {
      const index = backgroundOrder.indexOf(key);
      if (index > 0) {
        moveWithinLayer(backgroundOrder, index, index - 1);
      }
    }
  } else if (entry.transform.layer === "background") {
    const index = backgroundOrder.indexOf(key);
    if (index >= 0 && index < backgroundOrder.length - 1) {
      moveWithinLayer(backgroundOrder, index, index + 1);
    } else if (index === backgroundOrder.length - 1) {
      backgroundOrder.splice(index, 1);
      foregroundOrder.unshift(key);
    }
  } else {
    const index = foregroundOrder.indexOf(key);
    if (index >= 0 && index < foregroundOrder.length - 1) {
      moveWithinLayer(foregroundOrder, index, index + 1);
    }
  }

  rewriteLayerState(pageOverrides, entriesByKey, backgroundOrder, foregroundOrder);

  return pruneGeneratedHtmlReportCanvasOverrides({
    overrides,
    structure: args.report.structure,
    visualStructure: args.report.visualStructure,
  });
}

export function updateGeneratedHtmlReportCanvasBlockTransform(args: UpsertCanvasTransformArgs) {
  return {
    ...args.report,
    canvasOverrides: withUpsertedTransform({
      ...args,
      target: "block",
    }),
  };
}

export function updateGeneratedHtmlReportCanvasVisualTransform(args: UpsertCanvasTransformArgs) {
  return {
    ...args.report,
    canvasOverrides: withUpsertedTransform({
      ...args,
      target: "visual",
    }),
  };
}

export function removeGeneratedHtmlReportCanvasBlockTransform(args: RemoveCanvasTransformArgs) {
  return {
    ...args.report,
    canvasOverrides: withRemovedTransform({
      ...args,
      target: "block",
    }),
  };
}

export function removeGeneratedHtmlReportCanvasVisualTransform(args: RemoveCanvasTransformArgs) {
  return {
    ...args.report,
    canvasOverrides: withRemovedTransform({
      ...args,
      target: "visual",
    }),
  };
}

export function duplicateGeneratedHtmlReportCanvasVisualTransform(args: DuplicateCanvasTransformArgs) {
  return {
    ...args.report,
    canvasOverrides: withDuplicatedTransform({
      ...args,
      target: "visual",
    }),
  };
}

export function shiftGeneratedHtmlReportCanvasBlockLayer(args: ShiftCanvasTransformLayerArgs) {
  return {
    ...args.report,
    canvasOverrides: withShiftedTransformLayer({
      ...args,
      target: "block",
    }),
  };
}

export function shiftGeneratedHtmlReportCanvasVisualLayer(args: ShiftCanvasTransformLayerArgs) {
  return {
    ...args.report,
    canvasOverrides: withShiftedTransformLayer({
      ...args,
      target: "visual",
    }),
  };
}

export function getGeneratedHtmlReportBlockCanvasTransform(args: {
  report: Pick<GeneratedHtmlReport, "canvasOverrides">;
  pageNumber: number;
  blockId: string;
}) {
  return (
    getGeneratedHtmlReportCanvasPageOverrides(args.report.canvasOverrides, args.pageNumber)?.blockOverrides[
      args.blockId
    ] ?? null
  );
}

export function getGeneratedHtmlReportVisualCanvasTransform(args: {
  report: Pick<GeneratedHtmlReport, "canvasOverrides">;
  pageNumber: number;
  nodeId: string;
}) {
  return (
    getGeneratedHtmlReportCanvasPageOverrides(args.report.canvasOverrides, args.pageNumber)?.visualOverrides[
      args.nodeId
    ] ?? null
  );
}

function ensureFlowContentPlane(pageElement: HTMLElement) {
  Array.from(pageElement.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) {
      return;
    }

    if (
      child.getAttribute("data-html-canvas-overlay-root") ||
      child.getAttribute("data-html-transform-preview-root")
    ) {
      return;
    }

    const computedPosition =
      child.ownerDocument.defaultView?.getComputedStyle(child).position ?? child.style.position;
    if (!computedPosition || computedPosition === "static") {
      child.style.position = "relative";
    }
    child.style.zIndex = "1";
  });
}

function findCanvasTargetElement(args: {
  pageElement: HTMLElement;
  target: CanvasTargetKind;
  targetId: string;
}) {
  const selector =
    args.target === "block"
      ? `[data-html-block-id="${args.targetId}"]`
      : `[data-html-visual-id="${args.targetId}"]`;

  const matches = Array.from(args.pageElement.querySelectorAll(selector)).filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElement &&
      element.getAttribute("data-html-canvas-placeholder") !== "true" &&
      element.getAttribute("data-html-transform-preview-placeholder") !== "true",
  );
  if (matches.length === 0) {
    return null;
  }

  return matches.sort((left, right) => {
    const leftFreeform = left.getAttribute("data-html-freeform") === "true" ? 0 : 1;
    const rightFreeform = right.getAttribute("data-html-freeform") === "true" ? 0 : 1;
    if (leftFreeform !== rightFreeform) {
      return leftFreeform - rightFreeform;
    }

    const leftArea = Math.max(1, left.getBoundingClientRect().width * left.getBoundingClientRect().height);
    const rightArea = Math.max(
      1,
      right.getBoundingClientRect().width * right.getBoundingClientRect().height,
    );
    return leftArea - rightArea;
  })[0];
}

function ensureFreeformOverlayRoot(pageElement: HTMLElement, layer: HtmlCanvasLayer) {
  let overlayRoot = pageElement.querySelector(
    `[data-html-canvas-overlay-root="${layer}"]`,
  ) as HTMLElement | null;
  if (overlayRoot) {
    return overlayRoot;
  }

  overlayRoot = pageElement.ownerDocument.createElement("div");
  overlayRoot.setAttribute("data-html-canvas-overlay-root", layer);
  overlayRoot.style.position = "absolute";
  overlayRoot.style.inset = "0";
  overlayRoot.style.pointerEvents = "none";
  overlayRoot.style.zIndex = layer === "background" ? "0" : "6";
  if (layer === "background" && pageElement.firstChild) {
    pageElement.insertBefore(overlayRoot, pageElement.firstChild);
  } else {
    pageElement.appendChild(overlayRoot);
  }
  return overlayRoot;
}

function stripCanvasSemanticAttributes(element: HTMLElement) {
  element.removeAttribute("id");
  element.removeAttribute("data-html-block-id");
  element.removeAttribute("data-html-block-kind");
  element.removeAttribute("data-html-visual-id");
  element.removeAttribute("data-html-visual-kind");
  element.removeAttribute("data-html-freeform");
  element.removeAttribute("data-html-canvas-target");
  element.removeAttribute("data-html-canvas-source-id");
  element.removeAttribute("data-html-canvas-layer");
  element.removeAttribute("data-html-canvas-layer-order");
  element.removeAttribute("data-html-freeform-font-size");
  element.removeAttribute("data-html-block-selected");
  element.removeAttribute("data-html-visual-selected");
  element.removeAttribute("data-html-transform-preview");
  element.removeAttribute("data-html-transform-preview-placeholder");
}

function createCanvasPlaceholder(args: {
  targetElement: HTMLElement;
  target: CanvasTargetKind;
  targetId: string;
}) {
  const placeholder = args.targetElement.cloneNode(true) as HTMLElement;
  stripCanvasSemanticAttributes(placeholder);
  placeholder.setAttribute("data-html-canvas-placeholder", "true");
  placeholder.setAttribute("data-html-canvas-placeholder-for", args.targetId);
  placeholder.setAttribute("data-html-canvas-placeholder-target", args.target);
  placeholder.style.visibility = "hidden";
  placeholder.style.pointerEvents = "none";
  placeholder.style.userSelect = "none";
  return placeholder;
}

function promoteElementToFreeform(args: {
  pageElement: HTMLElement;
  targetElement: HTMLElement;
  target: CanvasTargetKind;
  targetId: string;
  transform: HtmlCanvasTransform;
}) {
  const { pageElement, targetElement, target, targetId, transform } = args;
  const overlayRoot = ensureFreeformOverlayRoot(pageElement, transform.layer);

  if (targetElement.getAttribute("data-html-freeform") === "true") {
    targetElement.setAttribute("data-html-canvas-source-id", targetId);
    targetElement.setAttribute("data-html-canvas-layer", transform.layer);
    targetElement.setAttribute("data-html-canvas-layer-order", String(transform.layerOrder));
    targetElement.style.left = `${transform.frame.x}px`;
    targetElement.style.top = `${transform.frame.y}px`;
    targetElement.style.width = `${transform.frame.w}px`;
    targetElement.style.maxWidth = `${transform.frame.w}px`;
    targetElement.style.minWidth = `${Math.max(8, transform.frame.w)}px`;
    targetElement.style.minHeight = `${Math.max(8, transform.frame.h)}px`;
    targetElement.style.height = `${transform.frame.h}px`;
    targetElement.style.zIndex = String(Math.max(1, transform.layerOrder + 1));
    if (target === "block") {
      if (transform.fontSize) {
        targetElement.style.fontSize = `${Math.round(transform.fontSize)}px`;
        targetElement.setAttribute(
          "data-html-freeform-font-size",
          String(Math.round(transform.fontSize)),
        );
      } else {
        targetElement.style.removeProperty("font-size");
        targetElement.removeAttribute("data-html-freeform-font-size");
      }
    }
    overlayRoot.appendChild(targetElement);
    return;
  }

  const placeholder = createCanvasPlaceholder({
    targetElement,
    target,
    targetId,
  });
  targetElement.replaceWith(placeholder);

  targetElement.setAttribute("data-html-freeform", "true");
  targetElement.setAttribute("data-html-canvas-target", target);
  targetElement.setAttribute("data-html-canvas-source-id", targetId);
  targetElement.setAttribute("data-html-canvas-layer", transform.layer);
  targetElement.setAttribute("data-html-canvas-layer-order", String(transform.layerOrder));
  targetElement.style.position = "absolute";
  targetElement.style.left = `${transform.frame.x}px`;
  targetElement.style.top = `${transform.frame.y}px`;
  targetElement.style.width = `${transform.frame.w}px`;
  targetElement.style.maxWidth = `${transform.frame.w}px`;
  targetElement.style.minWidth = `${Math.max(8, transform.frame.w)}px`;
  targetElement.style.minHeight = `${Math.max(8, transform.frame.h)}px`;
  targetElement.style.boxSizing = "border-box";
  targetElement.style.margin = "0";
  targetElement.style.pointerEvents = "auto";
  targetElement.style.zIndex = String(Math.max(1, transform.layerOrder + 1));
  if (target === "block" && transform.fontSize) {
    targetElement.style.fontSize = `${Math.round(transform.fontSize)}px`;
    targetElement.setAttribute(
      "data-html-freeform-font-size",
      String(Math.round(transform.fontSize)),
    );
  } else {
    targetElement.style.removeProperty("font-size");
    targetElement.removeAttribute("data-html-freeform-font-size");
  }
  targetElement.style.height = `${transform.frame.h}px`;

  overlayRoot.appendChild(targetElement);
}

export function applyGeneratedHtmlReportCanvasOverridesToPage(args: {
  pageElement: HTMLElement;
  pageNumber: number;
  report: Pick<GeneratedHtmlReport, "canvasOverrides">;
}) {
  const pageOverrides = getGeneratedHtmlReportCanvasPageOverrides(
    args.report.canvasOverrides,
    args.pageNumber,
  );
  if (!pageOverrides) {
    return;
  }

  args.pageElement.style.position = "relative";
  args.pageElement.style.isolation = "isolate";
  ensureFlowContentPlane(args.pageElement);

  for (const [blockId, transform] of Object.entries(pageOverrides.blockOverrides)) {
    const targetElement = findCanvasTargetElement({
      pageElement: args.pageElement,
      target: "block",
      targetId: blockId,
    });
    if (!targetElement) {
      continue;
    }
    promoteElementToFreeform({
      pageElement: args.pageElement,
      targetElement,
      target: "block",
      targetId: blockId,
      transform,
    });
  }

  for (const [visualId, transform] of Object.entries(pageOverrides.visualOverrides)) {
    const targetElement = findCanvasTargetElement({
      pageElement: args.pageElement,
      target: "visual",
      targetId: visualId,
    });
    if (!targetElement) {
      continue;
    }
    promoteElementToFreeform({
      pageElement: args.pageElement,
      targetElement,
      target: "visual",
      targetId: visualId,
      transform,
    });
  }
}

export function snapCanvasValue(value: number, snaps: number[]) {
  for (const snap of snaps) {
    if (Math.abs(value - snap) <= HTML_REPORT_CANVAS_SNAP_PX) {
      return snap;
    }
  }
  return value;
}

export function clampCanvasFrameToPage(frame: HtmlCanvasFrame): HtmlCanvasFrame {
  return {
    x: Math.max(0, Math.min(frame.x, HTML_REPORT_PAGE_WIDTH - frame.w)),
    y: Math.max(0, Math.min(frame.y, HTML_REPORT_PAGE_HEIGHT - frame.h)),
    w: Math.max(8, Math.min(frame.w, HTML_REPORT_PAGE_WIDTH)),
    h: Math.max(8, Math.min(frame.h, HTML_REPORT_PAGE_HEIGHT)),
  };
}
