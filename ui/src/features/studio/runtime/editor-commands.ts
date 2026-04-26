import type { GeneratedHtmlReport, HtmlVisualModuleKind, HtmlVisualNodeKind } from "../types";
import type { HtmlEditorSelectionObject } from "./editor-selection-model";

export type HtmlEditorCommandName =
  | "edit-text"
  | "edit-visual-style"
  | "edit-visual-content"
  | "edit-data-module"
  | "edit-scientific-diagram"
  | "duplicate-visual"
  | "delete-visual"
  | "replace-visual-module"
  | "return-to-flow"
  | "extract-module";

export type HtmlEditorCommandTarget =
  | {
      kind: "page";
      pageNumber: number;
      pageTitle: string;
      objectId: string;
    }
  | {
      kind: "text";
      pageNumber: number;
      pageTitle: string;
      objectId: string;
      blockId: string;
    }
  | {
      kind: "visual";
      pageNumber: number;
      pageTitle: string;
      objectId: string;
      nodeId: string;
      visualKind: HtmlVisualNodeKind;
      moduleKind?: HtmlVisualModuleKind;
    };

export type HtmlEditorVisualInsertionPlacement = "page-end" | "below" | "beside";

export type HtmlEditorVisualInsertionTarget = {
  pageNumber: number;
  anchorNodeId: string | null;
  placement: HtmlEditorVisualInsertionPlacement;
};

function resolveCommandTargetPageTitle(args: {
  report?: GeneratedHtmlReport | null;
  pageNumber: number;
  fallbackPageTitle?: string | null;
}) {
  return (
    args.report?.pageTitles[Math.max(0, args.pageNumber - 1)] ??
    args.fallbackPageTitle ??
    `Page ${args.pageNumber}`
  );
}

function pageTarget(selection: HtmlEditorSelectionObject): HtmlEditorCommandTarget {
  return {
    kind: "page",
    pageNumber: selection.pageNumber,
    pageTitle: selection.pageTitle,
    objectId: `page:${selection.pageNumber}`,
  };
}

function textTarget(selection: Extract<HtmlEditorSelectionObject, { kind: "text" }>): HtmlEditorCommandTarget {
  return {
    kind: "text",
    pageNumber: selection.pageNumber,
    pageTitle: selection.pageTitle,
    objectId: selection.objectId,
    blockId: selection.blockId,
  };
}

function visualTarget(selection: Extract<HtmlEditorSelectionObject, { kind: "visual" }>): HtmlEditorCommandTarget {
  return {
    kind: "visual",
    pageNumber: selection.pageNumber,
    pageTitle: selection.pageTitle,
    objectId: selection.objectId,
    nodeId: selection.nodeId,
    visualKind: selection.node.kind,
    moduleKind: selection.node.moduleKind,
  };
}

export function resolveHtmlEditorCommandTarget(
  selection: HtmlEditorSelectionObject,
  command: HtmlEditorCommandName,
): HtmlEditorCommandTarget | null {
  if (selection.kind === "stale") {
    return null;
  }

  if (command === "extract-module") {
    if (selection.kind === "text" && selection.capabilities.canExtractModule) {
      return textTarget(selection);
    }
    if (selection.kind === "visual" && selection.capabilities.canExtractModule) {
      return visualTarget(selection);
    }
    return null;
  }

  if (command === "return-to-flow") {
    if (
      (selection.kind === "text" || selection.kind === "visual") &&
      selection.capabilities.canReturnToFlow
    ) {
      return selection.kind === "text" ? textTarget(selection) : visualTarget(selection);
    }
    return null;
  }

  if (command === "edit-text") {
    return selection.kind === "text" && selection.capabilities.canEditText
      ? textTarget(selection)
      : null;
  }

  if (selection.kind !== "visual") {
    return null;
  }

  if (command === "edit-data-module" && !selection.capabilities.canEditDataModule) {
    return null;
  }

  if (
    command === "edit-scientific-diagram" &&
    !selection.capabilities.canEditScientificDiagram
  ) {
    return null;
  }

  return visualTarget(selection);
}

export function resolveHtmlEditorVisualInsertionTarget(args: {
  selection: HtmlEditorSelectionObject;
  requestedPlacement?: HtmlEditorVisualInsertionPlacement;
}): HtmlEditorVisualInsertionTarget {
  const requestedPlacement = args.requestedPlacement ?? "page-end";

  if (args.selection.kind !== "visual" || requestedPlacement === "page-end") {
    return {
      pageNumber: args.selection.pageNumber,
      anchorNodeId: null,
      placement: "page-end",
    };
  }

  return {
    pageNumber: args.selection.pageNumber,
    anchorNodeId: args.selection.nodeId,
    placement: requestedPlacement,
  };
}

export function createHtmlEditorTextCanvasCommandTarget(args: {
  report?: GeneratedHtmlReport | null;
  pageNumber: number;
  blockId: string;
  fallbackPageTitle?: string | null;
}): Extract<HtmlEditorCommandTarget, { kind: "text" }> {
  return {
    kind: "text",
    pageNumber: args.pageNumber,
    pageTitle: resolveCommandTargetPageTitle(args),
    objectId: `page:${args.pageNumber}:text:${args.blockId}`,
    blockId: args.blockId,
  };
}

export function createHtmlEditorVisualCanvasCommandTarget(args: {
  report?: GeneratedHtmlReport | null;
  pageNumber: number;
  nodeId: string;
  fallbackPageTitle?: string | null;
}): Extract<HtmlEditorCommandTarget, { kind: "visual" }> {
  const node =
    args.report?.visualStructure?.pages
      .find((page) => page.pageNumber === args.pageNumber)
      ?.nodes.find((entry) => entry.id === args.nodeId) ?? null;

  return {
    kind: "visual",
    pageNumber: args.pageNumber,
    pageTitle: resolveCommandTargetPageTitle(args),
    objectId: `page:${args.pageNumber}:visual:${args.nodeId}`,
    nodeId: args.nodeId,
    visualKind: node?.kind ?? "surface",
    moduleKind: node?.moduleKind,
  };
}
