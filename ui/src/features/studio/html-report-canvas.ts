import type {
  GeneratedHtmlReport,
  GeneratedHtmlReportCanvasOverrides,
  HtmlCanvasFrame,
  HtmlCanvasPageOverrides,
  HtmlCanvasTransform,
  HtmlEditableStructure,
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

function normalizeFrame(frame: HtmlCanvasFrame): HtmlCanvasFrame {
  return {
    x: Math.max(0, Math.round(frame.x)),
    y: Math.max(0, Math.round(frame.y)),
    w: Math.max(8, Math.round(frame.w)),
    h: Math.max(8, Math.round(frame.h)),
  };
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
    lockedByUser: true,
  };
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

  return {
    pageNumber,
    blockOverrides: normalizeBucket(candidate.blockOverrides),
    visualOverrides: normalizeBucket(candidate.visualOverrides),
  };
}

function clonePageOverrides(page: HtmlCanvasPageOverrides): HtmlCanvasPageOverrides {
  return {
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
  };
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

        return {
          pageNumber: page.pageNumber,
          blockOverrides,
          visualOverrides,
        } satisfies HtmlCanvasPageOverrides;
      })
      .filter((page): page is HtmlCanvasPageOverrides => Boolean(page)),
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

  const nextTransform: HtmlCanvasTransform = {
    mode: "freeform",
    frame: normalizeFrame(args.frame),
    fontSize:
      args.target === "block" &&
      Number.isFinite(args.fontSize) &&
      (args.fontSize ?? 0) > 0
        ? Math.round(args.fontSize as number)
        : undefined,
    lockedByUser: true,
  };

  if (args.target === "block") {
    pageOverrides.blockOverrides[args.id] = nextTransform;
  } else {
    pageOverrides.visualOverrides[args.id] = nextTransform;
  }

  if (!existingPage) {
    overrides.pages.push(pageOverrides);
  }

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

function ensureFreeformOverlayRoot(pageElement: HTMLElement) {
  let overlayRoot = pageElement.querySelector(
    "[data-html-canvas-overlay-root='true']",
  ) as HTMLElement | null;
  if (overlayRoot) {
    return overlayRoot;
  }

  overlayRoot = pageElement.ownerDocument.createElement("div");
  overlayRoot.setAttribute("data-html-canvas-overlay-root", "true");
  overlayRoot.style.position = "absolute";
  overlayRoot.style.inset = "0";
  overlayRoot.style.pointerEvents = "none";
  overlayRoot.style.zIndex = "6";
  pageElement.appendChild(overlayRoot);
  return overlayRoot;
}

function promoteElementToFreeform(args: {
  pageElement: HTMLElement;
  targetElement: HTMLElement;
  target: CanvasTargetKind;
  targetId: string;
  transform: HtmlCanvasTransform;
}) {
  const { pageElement, targetElement, target, targetId, transform } = args;
  const overlayRoot = ensureFreeformOverlayRoot(pageElement);
  const clone = targetElement.cloneNode(true) as HTMLElement;

  if (target === "block") {
    targetElement.removeAttribute("data-html-block-id");
    targetElement.removeAttribute("data-html-block-kind");
    clone.setAttribute("data-html-block-id", targetId);
  } else {
    targetElement.removeAttribute("data-html-visual-id");
    targetElement.removeAttribute("data-html-visual-kind");
    clone.setAttribute("data-html-visual-id", targetId);
  }

  targetElement.setAttribute("data-html-canvas-placeholder", "true");
  targetElement.setAttribute("data-html-canvas-placeholder-for", targetId);
  targetElement.setAttribute("data-html-canvas-placeholder-target", target);
  targetElement.setAttribute("data-html-canvas-source-id", targetId);
  targetElement.style.visibility = "hidden";
  targetElement.style.pointerEvents = "none";
  targetElement.style.userSelect = "none";

  clone.setAttribute("data-html-freeform", "true");
  clone.setAttribute("data-html-canvas-target", target);
  clone.setAttribute("data-html-canvas-source-id", targetId);
  clone.style.position = "absolute";
  clone.style.left = `${transform.frame.x}px`;
  clone.style.top = `${transform.frame.y}px`;
  clone.style.width = `${transform.frame.w}px`;
  clone.style.maxWidth = `${transform.frame.w}px`;
  clone.style.minWidth = `${Math.max(8, transform.frame.w)}px`;
  clone.style.minHeight = `${Math.max(8, transform.frame.h)}px`;
  clone.style.boxSizing = "border-box";
  clone.style.margin = "0";
  clone.style.pointerEvents = "auto";
  clone.style.zIndex = "2";
  if (target === "block" && transform.fontSize) {
    clone.style.fontSize = `${Math.round(transform.fontSize)}px`;
    clone.setAttribute("data-html-freeform-font-size", String(Math.round(transform.fontSize)));
  }
  clone.style.height = `${transform.frame.h}px`;

  overlayRoot.appendChild(clone);
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

  for (const [blockId, transform] of Object.entries(pageOverrides.blockOverrides)) {
    const targetElement = args.pageElement.querySelector(
      `[data-html-block-id="${blockId}"]`,
    ) as HTMLElement | null;
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
    const targetElement = args.pageElement.querySelector(
      `[data-html-visual-id="${visualId}"]`,
    ) as HTMLElement | null;
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
