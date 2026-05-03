import {
  getGeneratedHtmlReportBlockCanvasTransform,
  getGeneratedHtmlReportVisualCanvasTransform,
} from "../html-report-canvas";
import type {
  GeneratedHtmlReport,
  HtmlCanvasObject,
  HtmlCanvasObjectFacet,
  HtmlCanvasTransform,
  HtmlEditableBlock,
  HtmlVisualContentNode,
  HtmlVisualNode,
} from "../types";
import type { StudioInspectorTab, StudioSelectionState } from "./studio/types";

export type HtmlEditorSelectionKind = "page" | "object" | "text" | "visual" | "stale";

export type HtmlEditorObjectCapabilities = {
  canEditText: boolean;
  canEditStyle: boolean;
  canTransform: boolean;
  canReturnToFlow: boolean;
  canExtractModule: boolean;
  canEditDataModule: boolean;
  canEditScientificDiagram: boolean;
};

export type HtmlEditorResolvedObject = {
  selectedObjectId: string;
  activeFacet: HtmlCanvasObjectFacet;
  availableFacets: HtmlCanvasObjectFacet[];
  textBlockIds: string[];
  visualNodeIds: string[];
  rootNodeId: string | null;
  exportObjectId?: string;
};

export type HtmlEditorPageObject = {
  kind: "page";
  objectId: string;
  pageNumber: number;
  pageTitle: string;
  capabilities: HtmlEditorObjectCapabilities;
};

export type HtmlEditorGenericObject = {
  kind: "object";
  objectId: string;
  object: HtmlEditorResolvedObject;
  pageNumber: number;
  pageTitle: string;
  capabilities: HtmlEditorObjectCapabilities;
};

export type HtmlEditorTextObject = {
  kind: "text";
  objectId: string;
  object: HtmlEditorResolvedObject;
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
  object: HtmlEditorResolvedObject;
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
  | HtmlEditorGenericObject
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

const OBJECT_CAPABILITIES: HtmlEditorObjectCapabilities = {
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

function genericObject(args: {
  pageNumber: number;
  pageTitle: string;
  object: HtmlEditorResolvedObject;
}): HtmlEditorGenericObject {
  return {
    kind: "object",
    objectId: args.object.selectedObjectId,
    object: args.object,
    pageNumber: args.pageNumber,
    pageTitle: args.pageTitle,
    capabilities: OBJECT_CAPABILITIES,
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

function pathContains(parentPath: string | undefined, childPath: string | undefined) {
  if (!parentPath || !childPath) {
    return false;
  }
  return childPath === parentPath || childPath.startsWith(`${parentPath}.`);
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function objectIdForVisualNode(node: HtmlVisualNode) {
  return node.exportObjectId ?? node.studioObjectId ?? null;
}

function objectIdsForBlock(block: HtmlEditableBlock) {
  return uniqueStrings([block.objectId, block.exportObjectId, block.studioObjectId]);
}

function blockBelongsToObject(block: HtmlEditableBlock, objectId: string) {
  return objectIdsForBlock(block).includes(objectId);
}

function visualSourcePathDepth(node: HtmlVisualNode) {
  if (!node.sourcePath) {
    return Number.MAX_SAFE_INTEGER;
  }
  if (!node.sourcePath.trim()) {
    return 0;
  }
  return node.sourcePath.split(".").length;
}

function chooseCanonicalObjectRoot(nodes: HtmlVisualNode[]) {
  return [...nodes].sort((left, right) => {
    const leftRank = left.isContractRoot
      ? 0
      : left.parentId == null
        ? 1
        : left.atomizationRole === "container"
          ? 2
          : 3;
    const rightRank = right.isContractRoot
      ? 0
      : right.parentId == null
        ? 1
        : right.atomizationRole === "container"
          ? 2
          : 3;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    const leftDepth = visualSourcePathDepth(left);
    const rightDepth = visualSourcePathDepth(right);
    if (leftDepth !== rightDepth) {
      return leftDepth - rightDepth;
    }
    return left.sourceIndex - right.sourceIndex;
  })[0] ?? null;
}

function facetsForObject(args: {
  textBlockIds: string[];
  visualNodeIds: string[];
  rootNode?: HtmlVisualNode | null;
  exportObjectId?: string;
}) {
  const facets: HtmlCanvasObjectFacet[] = [];
  if (args.textBlockIds.length > 0) {
    facets.push("text");
  }
  if (args.visualNodeIds.length > 0) {
    facets.push("shape");
  }
  if (args.rootNode?.moduleKind === "chart" || args.rootNode?.moduleKind === "table") {
    facets.push("data");
  }
  if (args.exportObjectId) {
    facets.push("export");
  }
  return facets.length > 0 ? facets : (["shape"] satisfies HtmlCanvasObjectFacet[]);
}

export function buildHtmlCanvasObjects(args: {
  report: GeneratedHtmlReport;
  pageNumber: number;
}): HtmlCanvasObject[] {
  const textPage = args.report.structure?.pages.find(
    (page) => page.pageNumber === args.pageNumber,
  );
  const visualPage = args.report.visualStructure?.pages.find(
    (page) => page.pageNumber === args.pageNumber,
  );
  const blocks = textPage?.blocks ?? [];
  const nodes = visualPage?.nodes ?? [];
  const consumedBlocks = new Set<string>();
  const consumedNodes = new Set<string>();

  const objectNodeGroups = new Map<string, HtmlVisualNode[]>();
  nodes.forEach((node) => {
    const objectId = objectIdForVisualNode(node);
    if (!objectId) {
      return;
    }
    const group = objectNodeGroups.get(objectId) ?? [];
    group.push(node);
    objectNodeGroups.set(objectId, group);
  });

  const contractObjects = Array.from(objectNodeGroups.entries()).map(([objectId, objectNodes]) => {
      const rootNode = chooseCanonicalObjectRoot(objectNodes) ?? objectNodes[0]!;
      const groupedNodeIds = new Set(objectNodes.map((node) => node.id));
      const textBlockIds = uniqueStrings(
        blocks
          .filter(
            (block) =>
              blockBelongsToObject(block, objectId) ||
              pathContains(rootNode.sourcePath, block.sourcePath),
          )
          .map((block) => block.id),
      );
      const visualNodeIds = uniqueStrings(
        nodes
          .filter(
            (node) =>
              groupedNodeIds.has(node.id) ||
              (!objectIdForVisualNode(node) && pathContains(rootNode.sourcePath, node.sourcePath)),
          )
          .map((node) => node.id),
      );
      textBlockIds.forEach((id) => consumedBlocks.add(id));
      visualNodeIds.forEach((id) => consumedNodes.add(id));
      return {
        id: objectId,
        pageNumber: args.pageNumber,
        role: "contract",
        rootNodeId: rootNode.id,
        exportObjectId: rootNode.exportObjectId,
        studioObjectId: rootNode.studioObjectId,
        objectKind: rootNode.exportObjectKind,
        renderTarget: rootNode.renderTarget,
        textBlockIds,
        visualNodeIds,
        editableFacets: facetsForObject({
          textBlockIds,
          visualNodeIds,
          rootNode,
          exportObjectId: rootNode.exportObjectId,
        }),
      } satisfies HtmlCanvasObject;
    });

  const detectedVisualObjects = nodes
    .filter((node) => !consumedNodes.has(node.id) && node.atomizationRole !== "scaffold")
    .map((node) => {
      const textBlockIds = uniqueStrings(
        blocks
          .filter((block) => pathContains(node.sourcePath, block.sourcePath))
          .map((block) => block.id),
      );
      textBlockIds.forEach((id) => consumedBlocks.add(id));
      consumedNodes.add(node.id);
      return {
        id: `page:${args.pageNumber}:visual:${node.id}`,
        pageNumber: args.pageNumber,
        role: "detected",
        rootNodeId: node.id,
        textBlockIds,
        visualNodeIds: [node.id],
        editableFacets: facetsForObject({
          textBlockIds,
          visualNodeIds: [node.id],
          rootNode: node,
          exportObjectId: node.exportObjectId,
        }),
      } satisfies HtmlCanvasObject;
    });

  const detectedTextObjects = blocks
    .filter((block) => !consumedBlocks.has(block.id))
    .map((block) => ({
      id: `page:${args.pageNumber}:text:${block.id}`,
      pageNumber: args.pageNumber,
      role: "detected" as const,
      rootNodeId: null,
      textBlockIds: [block.id],
      visualNodeIds: [],
      editableFacets: ["text"] satisfies HtmlCanvasObjectFacet[],
    }));

  const exportedObjectIds = new Set(
    contractObjects.flatMap((object) => [object.id, object.exportObjectId]).filter(Boolean),
  );
  const expectedContractObjects =
    args.report.exportContract?.pages
      .find((page) => page.pageNumber === args.pageNumber)
      ?.objects.filter((object) => !exportedObjectIds.has(object.objectId))
      .map((object) => ({
        id: object.objectId,
        pageNumber: args.pageNumber,
        role: "contract" as const,
        rootNodeId: null,
        exportObjectId: object.objectId,
        objectKind: object.objectKind,
        renderTarget: object.renderTarget,
        textBlockIds: [],
        visualNodeIds: [],
        editableFacets: ["export"] satisfies HtmlCanvasObjectFacet[],
      })) ?? [];

  return [
    ...contractObjects,
    ...expectedContractObjects,
    ...detectedVisualObjects,
    ...detectedTextObjects,
  ];
}

function objectForBlock(objects: HtmlCanvasObject[], blockId: string) {
  return objects.find((object) => object.textBlockIds.includes(blockId)) ?? null;
}

function objectForVisualNode(objects: HtmlCanvasObject[], nodeId: string) {
  return objects.find((object) => object.visualNodeIds.includes(nodeId)) ?? null;
}

function objectForId(objects: HtmlCanvasObject[], objectId: string | null | undefined) {
  if (!objectId) {
    return null;
  }
  return (
    objects.find(
      (object) =>
        object.id === objectId ||
        object.exportObjectId === objectId ||
        object.studioObjectId === objectId,
    ) ?? null
  );
}

function resolvedObjectMetadata(args: {
  object: HtmlCanvasObject | null;
  fallbackObjectId: string;
  activeFacet: HtmlCanvasObjectFacet;
}): HtmlEditorResolvedObject {
  const availableFacets = args.object?.editableFacets.length
    ? args.object.editableFacets
    : [args.activeFacet];
  return {
    selectedObjectId: args.object?.id ?? args.fallbackObjectId,
    activeFacet: availableFacets.includes(args.activeFacet)
      ? args.activeFacet
      : availableFacets[0] ?? args.activeFacet,
    availableFacets,
    textBlockIds: args.object?.textBlockIds ?? [],
    visualNodeIds: args.object?.visualNodeIds ?? [],
    rootNodeId: args.object?.rootNodeId ?? null,
    exportObjectId: args.object?.exportObjectId,
  };
}

function chooseObjectTextBlockId(args: {
  object: HtmlCanvasObject | null;
  selectedBlockId: string | null | undefined;
}) {
  if (!args.object) {
    return args.selectedBlockId ?? null;
  }
  if (
    args.selectedBlockId &&
    args.object.textBlockIds.includes(args.selectedBlockId)
  ) {
    return args.selectedBlockId;
  }
  return args.object.textBlockIds[0] ?? null;
}

function chooseObjectVisualNodeId(args: {
  object: HtmlCanvasObject | null;
  selectedVisualNodeId: string | null | undefined;
}) {
  if (!args.object) {
    return args.selectedVisualNodeId ?? null;
  }
  if (
    args.selectedVisualNodeId &&
    args.object.visualNodeIds.includes(args.selectedVisualNodeId)
  ) {
    return args.selectedVisualNodeId;
  }
  if (args.object.rootNodeId && args.object.visualNodeIds.includes(args.object.rootNodeId)) {
    return args.object.rootNodeId;
  }
  return args.object.visualNodeIds[0] ?? null;
}

function buildObjectFallbackId(args: {
  pageNumber: number;
  blockId?: string | null;
  nodeId?: string | null;
  objectId?: string | null;
}) {
  if (args.objectId) {
    return args.objectId;
  }
  if (args.blockId) {
    return `page:${args.pageNumber}:text:${args.blockId}`;
  }
  if (args.nodeId) {
    return `page:${args.pageNumber}:visual:${args.nodeId}`;
  }
  return `page:${args.pageNumber}`;
}

export function resolveHtmlEditorSelection(args: {
  report?: GeneratedHtmlReport | null;
  selection: Pick<
    StudioSelectionState,
    "selectedHtmlBlockId" | "selectedVisualNodeId" | "selectedObjectId" | "activeFacet"
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

  const canvasObjects = buildHtmlCanvasObjects({
    report: args.report,
    pageNumber: args.pageNumber,
  });
  const selectedObject =
    objectForId(canvasObjects, args.selection.selectedObjectId) ??
    (blockId ? objectForBlock(canvasObjects, blockId) : null) ??
    (nodeId ? objectForVisualNode(canvasObjects, nodeId) : null);
  const requestedFacet =
    args.selection.activeFacet ?? (blockId ? "text" : nodeId ? "shape" : "shape");
  const resolvedObject = resolvedObjectMetadata({
    object: selectedObject,
    fallbackObjectId: buildObjectFallbackId({
      pageNumber: args.pageNumber,
      blockId,
      nodeId,
      objectId: args.selection.selectedObjectId,
    }),
    activeFacet: requestedFacet,
  });
  const resolvedBlockId = chooseObjectTextBlockId({
    object: selectedObject,
    selectedBlockId: blockId,
  });
  const resolvedNodeId = chooseObjectVisualNodeId({
    object: selectedObject,
    selectedVisualNodeId: nodeId,
  });
  const wantsText = resolvedObject.activeFacet === "text";
  const wantsVisual =
    resolvedObject.activeFacet === "shape" ||
    resolvedObject.activeFacet === "data" ||
    resolvedObject.activeFacet === "export";

  if (wantsText && resolvedBlockId) {
    const page = args.report.structure?.pages.find(
      (entry) => entry.pageNumber === args.pageNumber,
    );
    const block = page?.blocks.find((entry) => entry.id === resolvedBlockId) ?? null;
    if (!block) {
      return staleObject({
        pageNumber: args.pageNumber,
        pageTitle,
        requestedKind: "text",
        requestedId: resolvedBlockId,
      });
    }

    const transform = getGeneratedHtmlReportBlockCanvasTransform({
      report: args.report,
      pageNumber: args.pageNumber,
      blockId: resolvedBlockId,
    });
    return {
      kind: "text",
      objectId: resolvedObject.selectedObjectId,
      object: resolvedObject,
      pageNumber: args.pageNumber,
      pageTitle,
      blockId: resolvedBlockId,
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

  if (wantsVisual && resolvedNodeId) {
    const page = args.report.visualStructure?.pages.find(
      (entry) => entry.pageNumber === args.pageNumber,
    );
    const node = page?.nodes.find((entry) => entry.id === resolvedNodeId) ?? null;
    if (!node) {
      return staleObject({
        pageNumber: args.pageNumber,
        pageTitle,
        requestedKind: "visual",
        requestedId: resolvedNodeId,
      });
    }

    const transform = getGeneratedHtmlReportVisualCanvasTransform({
      report: args.report,
      pageNumber: args.pageNumber,
      nodeId: resolvedNodeId,
    });
    return {
      kind: "visual",
      objectId: resolvedObject.selectedObjectId,
      object: resolvedObject,
      pageNumber: args.pageNumber,
      pageTitle,
      nodeId: resolvedNodeId,
      node: withVisualTransformSize(node, transform),
      transform,
      contentNodes: args.getVisualContentNodes?.({
        report: args.report,
        pageNumber: args.pageNumber,
        nodeId: resolvedNodeId,
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

  if (resolvedBlockId) {
    return resolveHtmlEditorSelection({
      ...args,
      selection: {
        ...args.selection,
        activeFacet: "text",
        selectedHtmlBlockId: resolvedBlockId,
        selectedVisualNodeId: null,
      },
    });
  }

  if (resolvedNodeId) {
    return resolveHtmlEditorSelection({
      ...args,
      selection: {
        ...args.selection,
        activeFacet: "shape",
        selectedHtmlBlockId: null,
        selectedVisualNodeId: resolvedNodeId,
      },
    });
  }

  if (selectedObject || args.selection.selectedObjectId) {
    return genericObject({
      pageNumber: args.pageNumber,
      pageTitle,
      object: resolvedObject,
    });
  }

  return pageObject({ pageNumber: args.pageNumber, pageTitle });
}

export function getHtmlEditorSelectionInspectorTab(
  selection: HtmlEditorSelectionObject,
): Extract<StudioInspectorTab, "page" | "text" | "visual" | "export"> {
  if (selection.kind === "text") {
    return "text";
  }
  if (selection.kind === "visual") {
    if (selection.object.activeFacet === "export") {
      return "export";
    }
    return "visual";
  }
  if (selection.kind === "object") {
    if (selection.object.activeFacet === "text") {
      return "text";
    }
    if (selection.object.activeFacet === "shape" || selection.object.activeFacet === "data") {
      return "visual";
    }
    if (selection.object.activeFacet === "export") {
      return "export";
    }
  }
  return "page";
}
