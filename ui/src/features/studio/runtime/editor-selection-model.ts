import {
  getGeneratedHtmlReportBlockCanvasTransform,
  getGeneratedHtmlReportVisualCanvasTransform,
} from "../html-report-canvas";
import type {
  GeneratedHtmlReport,
  HtmlCanvasTransform,
  HtmlEditableBlock,
  HtmlVisualContentNode,
  HtmlVisualNode,
} from "../types";
import type { StudioInspectorTab, StudioSelectionState } from "./studio/types";

export type HtmlEditorSelectionKind = "page" | "text" | "visual" | "stale";

export type HtmlEditorObjectCapabilities = {
  canEditText: boolean;
  canEditStyle: boolean;
  canTransform: boolean;
  canReturnToFlow: boolean;
  canExtractModule: boolean;
  canEditDataModule: boolean;
  canEditScientificDiagram: boolean;
};

export type HtmlEditorPageObject = {
  kind: "page";
  objectId: string;
  pageNumber: number;
  pageTitle: string;
  capabilities: HtmlEditorObjectCapabilities;
};

export type HtmlEditorTextObject = {
  kind: "text";
  objectId: string;
  pageNumber: number;
  pageTitle: string;
  blockId: string;
  block: HtmlEditableBlock;
  transform: HtmlCanvasTransform | null;
  capabilities: HtmlEditorObjectCapabilities;
};

export type HtmlEditorVisualObject = {
  kind: "visual";
  objectId: string;
  pageNumber: number;
  pageTitle: string;
  nodeId: string;
  node: HtmlVisualNode;
  transform: HtmlCanvasTransform | null;
  contentNodes: HtmlVisualContentNode[];
  capabilities: HtmlEditorObjectCapabilities;
};

export type HtmlEditorStaleObject = {
  kind: "stale";
  objectId: string;
  pageNumber: number;
  pageTitle: string;
  requestedKind: "text" | "visual";
  requestedId: string;
  capabilities: HtmlEditorObjectCapabilities;
};

export type HtmlEditorSelectionObject =
  | HtmlEditorPageObject
  | HtmlEditorTextObject
  | HtmlEditorVisualObject
  | HtmlEditorStaleObject;

const PAGE_CAPABILITIES: HtmlEditorObjectCapabilities = {
  canEditText: false,
  canEditStyle: true,
  canTransform: false,
  canReturnToFlow: false,
  canExtractModule: false,
  canEditDataModule: false,
  canEditScientificDiagram: false,
};

const STALE_CAPABILITIES: HtmlEditorObjectCapabilities = {
  canEditText: false,
  canEditStyle: false,
  canTransform: false,
  canReturnToFlow: false,
  canExtractModule: false,
  canEditDataModule: false,
  canEditScientificDiagram: false,
};

function pageObject(args: {
  pageNumber: number;
  pageTitle: string;
}): HtmlEditorPageObject {
  return {
    kind: "page",
    objectId: `page:${args.pageNumber}`,
    pageNumber: args.pageNumber,
    pageTitle: args.pageTitle,
    capabilities: PAGE_CAPABILITIES,
  };
}

function staleObject(args: {
  pageNumber: number;
  pageTitle: string;
  requestedKind: "text" | "visual";
  requestedId: string;
}): HtmlEditorStaleObject {
  return {
    kind: "stale",
    objectId: `page:${args.pageNumber}:${args.requestedKind}:stale:${args.requestedId}`,
    pageNumber: args.pageNumber,
    pageTitle: args.pageTitle,
    requestedKind: args.requestedKind,
    requestedId: args.requestedId,
    capabilities: STALE_CAPABILITIES,
  };
}

function resolvePageTitle(args: {
  report?: GeneratedHtmlReport | null;
  pageNumber: number;
  fallbackTitle?: string | null;
}) {
  return (
    args.fallbackTitle?.trim() ||
    args.report?.pageTitles[Math.max(0, args.pageNumber - 1)] ||
    `Page ${args.pageNumber}`
  );
}

function withBlockTransformFontSize(
  block: HtmlEditableBlock,
  transform: HtmlCanvasTransform | null,
): HtmlEditableBlock {
  if (!transform?.fontSize) {
    return block;
  }

  return {
    ...block,
    fontSize: transform.fontSize,
  };
}

function withVisualTransformSize(
  node: HtmlVisualNode,
  transform: HtmlCanvasTransform | null,
): HtmlVisualNode {
  if (!transform) {
    return node;
  }

  return {
    ...node,
    style: {
      ...node.style,
      widthPercent: undefined,
      height: transform.frame.h,
      minHeight: transform.frame.h,
    },
  };
}

export function resolveHtmlEditorSelection(args: {
  report?: GeneratedHtmlReport | null;
  selection: Pick<
    StudioSelectionState,
    "selectedHtmlBlockId" | "selectedVisualNodeId"
  >;
  pageNumber: number;
  pageTitle?: string | null;
  getVisualContentNodes?: (args: {
    report: GeneratedHtmlReport;
    pageNumber: number;
    nodeId: string;
  }) => HtmlVisualContentNode[];
}): HtmlEditorSelectionObject {
  const pageTitle = resolvePageTitle({
    report: args.report,
    pageNumber: args.pageNumber,
    fallbackTitle: args.pageTitle,
  });
  const blockId = args.selection.selectedHtmlBlockId;
  const nodeId = blockId ? null : args.selection.selectedVisualNodeId;

  if (!args.report) {
    if (blockId) {
      return staleObject({
        pageNumber: args.pageNumber,
        pageTitle,
        requestedKind: "text",
        requestedId: blockId,
      });
    }
    if (nodeId) {
      return staleObject({
        pageNumber: args.pageNumber,
        pageTitle,
        requestedKind: "visual",
        requestedId: nodeId,
      });
    }
    return pageObject({ pageNumber: args.pageNumber, pageTitle });
  }

  if (blockId) {
    const page = args.report.structure?.pages.find(
      (entry) => entry.pageNumber === args.pageNumber,
    );
    const block = page?.blocks.find((entry) => entry.id === blockId) ?? null;
    if (!block) {
      return staleObject({
        pageNumber: args.pageNumber,
        pageTitle,
        requestedKind: "text",
        requestedId: blockId,
      });
    }

    const transform = getGeneratedHtmlReportBlockCanvasTransform({
      report: args.report,
      pageNumber: args.pageNumber,
      blockId,
    });
    return {
      kind: "text",
      objectId: `page:${args.pageNumber}:text:${blockId}`,
      pageNumber: args.pageNumber,
      pageTitle,
      blockId,
      block: withBlockTransformFontSize(block, transform),
      transform,
      capabilities: {
        canEditText: true,
        canEditStyle: false,
        canTransform: true,
        canReturnToFlow: Boolean(transform),
        canExtractModule: true,
        canEditDataModule: false,
        canEditScientificDiagram: false,
      },
    };
  }

  if (nodeId) {
    const page = args.report.visualStructure?.pages.find(
      (entry) => entry.pageNumber === args.pageNumber,
    );
    const node = page?.nodes.find((entry) => entry.id === nodeId) ?? null;
    if (!node) {
      return staleObject({
        pageNumber: args.pageNumber,
        pageTitle,
        requestedKind: "visual",
        requestedId: nodeId,
      });
    }

    const transform = getGeneratedHtmlReportVisualCanvasTransform({
      report: args.report,
      pageNumber: args.pageNumber,
      nodeId,
    });
    return {
      kind: "visual",
      objectId: `page:${args.pageNumber}:visual:${nodeId}`,
      pageNumber: args.pageNumber,
      pageTitle,
      nodeId,
      node: withVisualTransformSize(node, transform),
      transform,
      contentNodes: args.getVisualContentNodes?.({
        report: args.report,
        pageNumber: args.pageNumber,
        nodeId,
      }) ?? [],
      capabilities: {
        canEditText: false,
        canEditStyle: true,
        canTransform: true,
        canReturnToFlow: Boolean(transform),
        canExtractModule: true,
        canEditDataModule: node.moduleKind === "chart" || node.moduleKind === "table",
        canEditScientificDiagram: node.moduleKind === "scientific-diagram",
      },
    };
  }

  return pageObject({ pageNumber: args.pageNumber, pageTitle });
}

export function getHtmlEditorSelectionInspectorTab(
  selection: HtmlEditorSelectionObject,
): Extract<StudioInspectorTab, "page" | "text" | "visual"> {
  if (selection.kind === "text") {
    return "text";
  }
  if (selection.kind === "visual") {
    return "visual";
  }
  return "page";
}
