import {
  Bot,
  Brain,
  FileText,
  GitBranch,
  Sigma,
  Target,
  Wrench,
} from "lucide-react";
import type {
  ModuleTemplateField,
  ModuleThinkingFlow,
  ModuleThinkingFlowBranch,
  ModuleThinkingFlowEdge,
  ModuleThinkingFlowNode,
  ModuleThinkingFlowNodeKind,
} from "@/features/studio/types";
import { getCanvasObjectKind, clamp } from "./helpers";
import { getThinkingFlowNodeLabel } from "./flow-runtime";
import { getFieldOutputGoal } from "./output-contract";
import { buildOrthogonalConnectionPath } from "./authoring-canvas-utils";
import type { ThinkingFlowCanvasNode } from "./authoring-local-types";

const THINKING_FLOW_BRANCH_LABEL: Record<ModuleThinkingFlowBranch, string> = {
  yes: "Yes",
  no: "No",
};

export const THINKING_FLOW_BOARD_WIDTH = 2560;
export const THINKING_FLOW_BOARD_HEIGHT = 1600;
export const FLOW_NODE_SIZE = 132;
export const FLOW_NODE_MIN_WIDTH = FLOW_NODE_SIZE;
export const FLOW_NODE_MIN_HEIGHT = FLOW_NODE_SIZE;
export const FLOW_NODE_EDGE_MARGIN = 32;
export const FLOW_VIEWPORT_PADDING = 120;
export const FLOW_OUTPUT_COLUMN_X =
  THINKING_FLOW_BOARD_WIDTH - FLOW_NODE_SIZE - 260;
export const FLOW_NODE_PORT_OFFSET = 24;

const BASE_THINKING_FLOW_NODE_IDS = ["flow-start"] as const;

const BASE_THINKING_FLOW_NODE_LAYOUTS: Record<
  Exclude<ModuleThinkingFlowNodeKind, "output">,
  Omit<ModuleThinkingFlowNode, "id" | "fieldId" | "detail">
> = {
  start: {
    label: "Start",
    kind: "start",
    x: 220,
    y: 734,
    w: FLOW_NODE_SIZE,
    h: FLOW_NODE_SIZE,
  },
  brief: {
    label: "Read Brief",
    kind: "brief",
    x: 560,
    y: 664,
    w: FLOW_NODE_SIZE,
    h: FLOW_NODE_SIZE,
  },
  think: {
    label: "Think",
    kind: "think",
    x: 940,
    y: 662,
    w: FLOW_NODE_SIZE,
    h: FLOW_NODE_SIZE,
  },
  if: {
    label: "If / Branch",
    kind: "if",
    x: 1320,
    y: 468,
    w: FLOW_NODE_SIZE,
    h: FLOW_NODE_SIZE,
  },
  tool: {
    label: "Tool Call",
    kind: "tool",
    x: 1700,
    y: 328,
    w: FLOW_NODE_SIZE,
    h: FLOW_NODE_SIZE,
  },
  calc: {
    label: "Calc",
    kind: "calc",
    x: 1700,
    y: 832,
    w: FLOW_NODE_SIZE,
    h: FLOW_NODE_SIZE,
  },
};

function getThinkingFlowAutoDetail(
  kind: Exclude<ModuleThinkingFlowNodeKind, "output">,
  promptHint: string,
  semanticRole: string,
  dataCount: number,
  chartCount: number
) {
  if (kind === "start") {
    return "Begin with the user's brief and the slide job.";
  }
  if (kind === "brief") {
    return promptHint.trim() || "Interpret the user's text input.";
  }
  if (kind === "think") {
    return (
      semanticRole.trim() ||
      "Turn the brief into a structured argument for the layout."
    );
  }
  if (kind === "if") {
    return "Branch when judgment, evidence, or alternate paths are needed.";
  }
  if (kind === "tool") {
    return dataCount > 0
      ? "Retrieve evidence or structured facts when the template needs support."
      : "Optional step for search, retrieval, or lookup.";
  }
  return chartCount > 0
    ? "Transform numbers, rank options, or compute the final point."
    : "Optional step for scoring, comparison, or calculation.";
}

function getThinkingFlowOutputDetail(field: ModuleTemplateField) {
  return getFieldOutputGoal(
    field,
    getCanvasObjectKind(field) === "chart"
      ? "Chart output"
      : "AI fills this block in the final template."
  );
}

export function getThinkingFlowBranchTone(branch: ModuleThinkingFlowBranch) {
  return branch === "yes"
    ? {
        stroke: "#31d4c2",
        glow: "rgba(49,212,194,0.34)",
        bg: "rgba(49,212,194,0.14)",
        text: "#dffcf8",
      }
    : {
        stroke: "#ff5d8d",
        glow: "rgba(255,93,141,0.34)",
        bg: "rgba(255,93,141,0.14)",
        text: "#ffe4ef",
      };
}

export function getThinkingFlowBranchLabel(branch: ModuleThinkingFlowBranch) {
  return THINKING_FLOW_BRANCH_LABEL[branch];
}

function isThinkingFlowBranch(
  value: unknown
): value is ModuleThinkingFlowBranch {
  return value === "yes" || value === "no";
}

function getDefaultThinkingFlowBranchForIndex(index: number) {
  return index === 1 ? "no" : "yes";
}

function getNormalizedThinkingFlowEdgeBranch(
  edge: ModuleThinkingFlowEdge,
  edges: ModuleThinkingFlowEdge[]
) {
  if (isThinkingFlowBranch(edge.branch)) {
    return edge.branch;
  }
  const siblingIndex = edges.findIndex((candidate) => candidate.id === edge.id);
  return getDefaultThinkingFlowBranchForIndex(siblingIndex);
}

function getUsedThinkingFlowBranches(
  sourceNodeId: string,
  edges: ModuleThinkingFlowEdge[]
) {
  const outgoing = edges.filter((edge) => edge.sourceNodeId === sourceNodeId);
  return new Set<ModuleThinkingFlowBranch>(
    outgoing.map((edge) => getNormalizedThinkingFlowEdgeBranch(edge, outgoing))
  );
}

export function getNextThinkingFlowBranchForSource(
  sourceNodeId: string,
  edges: ModuleThinkingFlowEdge[]
) {
  const used = getUsedThinkingFlowBranches(sourceNodeId, edges);
  if (!used.has("yes")) {
    return "yes" as const;
  }
  if (!used.has("no")) {
    return "no" as const;
  }
  return null;
}

export function normalizeThinkingFlowEdges(
  edges: ModuleThinkingFlowEdge[],
  nodeById: Map<string, ModuleThinkingFlowNode>,
  validNodeIds: Set<string>
) {
  const seenEdges = new Set<string>();
  const ifBranchUsage = new Map<string, Set<ModuleThinkingFlowBranch>>();

  return edges
    .map((edge) => ({
      ...edge,
      id: edge.id.trim(),
      sourceNodeId: edge.sourceNodeId.trim(),
      targetNodeId: edge.targetNodeId.trim(),
      branch: isThinkingFlowBranch(edge.branch) ? edge.branch : undefined,
    }))
    .filter((edge) => {
      if (
        !edge.sourceNodeId ||
        !edge.targetNodeId ||
        edge.sourceNodeId === edge.targetNodeId ||
        !validNodeIds.has(edge.sourceNodeId) ||
        !validNodeIds.has(edge.targetNodeId)
      ) {
        return false;
      }

      const source = nodeById.get(edge.sourceNodeId);
      const target = nodeById.get(edge.targetNodeId);
      if (
        !source ||
        !target ||
        source.kind === "output" ||
        target.kind === "start"
      ) {
        return false;
      }

      const signature = `${edge.sourceNodeId}->${edge.targetNodeId}`;
      if (seenEdges.has(signature)) {
        return false;
      }

      if (source.kind === "if") {
        const usedBranches = ifBranchUsage.get(source.id) ?? new Set();
        const desiredBranch =
          edge.branch ??
          (!usedBranches.has("yes")
            ? "yes"
            : !usedBranches.has("no")
            ? "no"
            : null);
        if (!desiredBranch || usedBranches.has(desiredBranch)) {
          return false;
        }
        usedBranches.add(desiredBranch);
        ifBranchUsage.set(source.id, usedBranches);
        edge.branch = desiredBranch;
      } else {
        edge.branch = undefined;
      }

      seenEdges.add(signature);
      return true;
    });
}

export function clampThinkingFlowNode(node: ModuleThinkingFlowNode) {
  const size = FLOW_NODE_SIZE;
  return {
    ...node,
    w: size,
    h: size,
    x: clamp(
      Math.round(node.x),
      FLOW_NODE_EDGE_MARGIN,
      THINKING_FLOW_BOARD_WIDTH - size - FLOW_NODE_EDGE_MARGIN
    ),
    y: clamp(
      Math.round(node.y),
      FLOW_NODE_EDGE_MARGIN,
      THINKING_FLOW_BOARD_HEIGHT - size - FLOW_NODE_EDGE_MARGIN
    ),
  };
}

function createDefaultThinkingFlow(
  outputFields: ModuleTemplateField[],
  promptHint: string,
  semanticRole: string,
  dataCount: number,
  chartCount: number
): ModuleThinkingFlow {
  const outputCount = Math.max(outputFields.length, 1);
  const outputGap =
    outputCount > 1
      ? Math.min(196, (THINKING_FLOW_BOARD_HEIGHT - 280) / (outputCount - 1))
      : 0;
  const outputStartY =
    outputCount > 1
      ? Math.max(
          180,
          (THINKING_FLOW_BOARD_HEIGHT -
            outputGap * (outputCount - 1) -
            FLOW_NODE_SIZE) /
            2
        )
      : THINKING_FLOW_BOARD_HEIGHT / 2 - FLOW_NODE_SIZE / 2;

  const startLayout = BASE_THINKING_FLOW_NODE_LAYOUTS.start;
  const startNode = clampThinkingFlowNode({
    id: "flow-start",
    ...startLayout,
    detail: getThinkingFlowAutoDetail(
      "start",
      promptHint,
      semanticRole,
      dataCount,
      chartCount
    ),
  });

  const outputNodes = outputFields.map((field, index) =>
    clampThinkingFlowNode({
      id: `flow-output-${field.id}`,
      label: field.label || "Untitled output",
      detail: getThinkingFlowOutputDetail(field),
      kind: "output",
      x: FLOW_OUTPUT_COLUMN_X,
      y: outputStartY + index * outputGap,
      w: FLOW_NODE_SIZE,
      h: FLOW_NODE_SIZE,
      fieldId: field.id,
    })
  );

  return {
    nodes: [startNode, ...outputNodes],
    edges: [],
  };
}

export function areThinkingFlowsEqual(
  left: ModuleThinkingFlow,
  right: ModuleThinkingFlow
) {
  if (
    left.nodes.length !== right.nodes.length ||
    left.edges.length !== right.edges.length
  ) {
    return false;
  }

  return (
    left.nodes.every((node, index) => {
      const candidate = right.nodes[index];
      return Boolean(
        candidate &&
          candidate.id === node.id &&
          candidate.label === node.label &&
          candidate.detail === node.detail &&
          candidate.kind === node.kind &&
          candidate.x === node.x &&
          candidate.y === node.y &&
          candidate.w === node.w &&
          candidate.h === node.h &&
          candidate.fieldId === node.fieldId
      );
    }) &&
    left.edges.every((edge, index) => {
      const candidate = right.edges[index];
      return Boolean(
        candidate &&
          candidate.id === edge.id &&
          candidate.sourceNodeId === edge.sourceNodeId &&
          candidate.targetNodeId === edge.targetNodeId &&
          candidate.branch === edge.branch
      );
    })
  );
}

export function syncThinkingFlowWithLayout(
  currentFlow: ModuleThinkingFlow | undefined,
  outputFields: ModuleTemplateField[],
  promptHint: string,
  semanticRole: string,
  dataCount: number,
  chartCount: number
): ModuleThinkingFlow {
  const fallback = createDefaultThinkingFlow(
    outputFields,
    promptHint,
    semanticRole,
    dataCount,
    chartCount
  );

  if (!currentFlow || currentFlow.nodes.length === 0) {
    return fallback;
  }

  const existingById = new Map(
    currentFlow.nodes.map((node) => [node.id, node])
  );
  const existingOutputByFieldId = new Map(
    currentFlow.nodes
      .filter((node) => node.kind === "output" && node.fieldId)
      .map((node) => [node.fieldId as string, node])
  );

  const startLayout = BASE_THINKING_FLOW_NODE_LAYOUTS.start;
  const existingStart = existingById.get("flow-start");
  const startNode = clampThinkingFlowNode({
    id: "flow-start",
    kind: "start",
    label: existingStart?.label?.trim() || startLayout.label,
    detail:
      existingStart?.detail?.trim() ||
      getThinkingFlowAutoDetail(
        "start",
        promptHint,
        semanticRole,
        dataCount,
        chartCount
      ),
    x: existingStart?.x ?? startLayout.x,
    y: existingStart?.y ?? startLayout.y,
    w: existingStart?.w ?? startLayout.w,
    h: existingStart?.h ?? startLayout.h,
  });

  const outputCount = Math.max(outputFields.length, 1);
  const outputGap =
    outputCount > 1
      ? Math.min(196, (THINKING_FLOW_BOARD_HEIGHT - 280) / (outputCount - 1))
      : 0;
  const outputStartY =
    outputCount > 1
      ? Math.max(
          180,
          (THINKING_FLOW_BOARD_HEIGHT -
            outputGap * (outputCount - 1) -
            FLOW_NODE_SIZE) /
            2
        )
      : THINKING_FLOW_BOARD_HEIGHT / 2 - FLOW_NODE_SIZE / 2;

  const outputNodes = outputFields.map((field, index) => {
    const existing =
      existingOutputByFieldId.get(field.id) ??
      existingById.get(`flow-output-${field.id}`);
    return clampThinkingFlowNode({
      id: `flow-output-${field.id}`,
      label: field.label || "Untitled output",
      detail: getThinkingFlowOutputDetail(field),
      kind: "output",
      x: existing?.x ?? FLOW_OUTPUT_COLUMN_X,
      y: existing?.y ?? outputStartY + index * outputGap,
      w: FLOW_NODE_SIZE,
      h: FLOW_NODE_SIZE,
      fieldId: field.id,
    });
  });

  const customNodes = currentFlow.nodes
    .filter(
      (node) =>
        !BASE_THINKING_FLOW_NODE_IDS.includes(
          node.id as (typeof BASE_THINKING_FLOW_NODE_IDS)[number]
        ) && node.kind !== "output"
    )
    .map((node) =>
      clampThinkingFlowNode({
        ...node,
        label: node.label.trim() || "Untitled node",
        detail: node.detail.trim(),
      })
    );

  const nodes = [startNode, ...customNodes, ...outputNodes];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const validNodeIds = new Set(nodes.map((node) => node.id));
  const edges = normalizeThinkingFlowEdges(
    currentFlow.edges ?? [],
    nodeById,
    validNodeIds
  );

  return {
    nodes,
    edges,
  };
}

export function getThinkingFlowHandlePoint(
  node: Pick<ModuleThinkingFlowNode, "x" | "y" | "w" | "h">,
  side: "left" | "right"
) {
  return {
    x:
      side === "left"
        ? node.x - FLOW_NODE_PORT_OFFSET
        : node.x + node.w + FLOW_NODE_PORT_OFFSET,
    y: node.y + node.h / 2,
  };
}

export function buildThinkingFlowEdgePath(
  sourceNode: Pick<ModuleThinkingFlowNode, "x" | "y" | "w" | "h">,
  targetNode: Pick<ModuleThinkingFlowNode, "x" | "y" | "w" | "h">,
  laneOffset = 0
) {
  const source = getThinkingFlowHandlePoint(sourceNode, "right");
  const target = getThinkingFlowHandlePoint(targetNode, "left");
  return buildOrthogonalConnectionPath(
    source.x,
    source.y,
    target.x,
    target.y,
    laneOffset
  );
}

export function getThinkingFlowNodeDisplayLabel(node: ThinkingFlowCanvasNode) {
  return node.label.trim() || getThinkingFlowNodeLabel(node.kind);
}

export function getThinkingFlowNodeIcon(kind: ModuleThinkingFlowNodeKind) {
  if (kind === "brief") return FileText;
  if (kind === "think") return Brain;
  if (kind === "if") return GitBranch;
  if (kind === "tool") return Wrench;
  if (kind === "calc") return Sigma;
  if (kind === "output") return Target;
  return Bot;
}

export function createThinkingFlowNode(
  kind: Exclude<ModuleThinkingFlowNodeKind, "start" | "output">,
  index: number
): ModuleThinkingFlowNode {
  const base = BASE_THINKING_FLOW_NODE_LAYOUTS[kind];
  const laneOffset = index % 4;
  return clampThinkingFlowNode({
    id: `flow-${kind}-${Math.random().toString(36).slice(2, 8)}`,
    label: getThinkingFlowNodeLabel(kind),
    detail:
      kind === "brief"
        ? "Read the brief and extract the slide task."
        : kind === "think"
        ? "Turn the brief into a structured point of view."
        : kind === "if"
        ? "Choose a path based on the evidence or context."
        : kind === "tool"
        ? "Call a tool, search, or retriever."
        : "Compute, rank, or compare to get the answer.",
    kind,
    x: base.x - 180 + laneOffset * 84,
    y: base.y + 220 + laneOffset * 54,
    w: FLOW_NODE_SIZE,
    h: FLOW_NODE_SIZE,
    toolConfig:
      kind === "tool"
        ? {
            adapterId: "support",
            maxItems: 3,
          }
        : undefined,
  });
}

export function canConnectThinkingFlowNodes(
  sourceNode: ModuleThinkingFlowNode,
  targetNode: ModuleThinkingFlowNode
) {
  return (
    sourceNode.id !== targetNode.id &&
    sourceNode.kind !== "output" &&
    targetNode.kind !== "start"
  );
}

export function clampFlowViewportOffset(
  offset: { x: number; y: number },
  viewportWidth: number,
  viewportHeight: number,
  scale: number
) {
  const scaledWidth = THINKING_FLOW_BOARD_WIDTH * scale;
  const scaledHeight = THINKING_FLOW_BOARD_HEIGHT * scale;
  const horizontalPadding = FLOW_VIEWPORT_PADDING;
  const verticalPadding = FLOW_VIEWPORT_PADDING;

  const minX =
    scaledWidth + horizontalPadding * 2 <= viewportWidth
      ? Math.round((viewportWidth - scaledWidth) / 2)
      : viewportWidth - scaledWidth - horizontalPadding;
  const maxX =
    scaledWidth + horizontalPadding * 2 <= viewportWidth
      ? Math.round((viewportWidth - scaledWidth) / 2)
      : horizontalPadding;
  const minY =
    scaledHeight + verticalPadding * 2 <= viewportHeight
      ? Math.round((viewportHeight - scaledHeight) / 2)
      : viewportHeight - scaledHeight - verticalPadding;
  const maxY =
    scaledHeight + verticalPadding * 2 <= viewportHeight
      ? Math.round((viewportHeight - scaledHeight) / 2)
      : verticalPadding;

  return {
    x: clamp(offset.x, minX, maxX),
    y: clamp(offset.y, minY, maxY),
  };
}

export function getFlowFitState(viewportWidth: number, viewportHeight: number) {
  const scale = clamp(
    Math.min(
      (viewportWidth - FLOW_VIEWPORT_PADDING * 2) / THINKING_FLOW_BOARD_WIDTH,
      (viewportHeight - FLOW_VIEWPORT_PADDING * 2) / THINKING_FLOW_BOARD_HEIGHT
    ),
    0.55,
    1
  );

  return {
    scale,
    offset: clampFlowViewportOffset(
      { x: FLOW_VIEWPORT_PADDING, y: FLOW_VIEWPORT_PADDING },
      viewportWidth,
      viewportHeight,
      scale
    ),
  };
}

export function getThinkingFlowNodeTheme(node: ThinkingFlowCanvasNode) {
  const baseBackground =
    "radial-gradient(circle at 30% 22%, rgba(46,57,98,0.9) 0%, rgba(23,30,60,0.98) 44%, rgba(9,13,28,1) 100%)";
  if (node.kind === "start") {
    return {
      border: "#f3f7ff",
      background: baseBackground,
      text: "#eff5ff",
      badge: "#f3f7ff",
      inner: "#ffffff",
      innerText: "#13203c",
      glow: "rgba(255,255,255,0.34)",
      line: "#f3f7ff",
    };
  }
  if (node.kind === "brief") {
    return {
      border: "#31d4c2",
      background: baseBackground,
      text: "#dff7f1",
      badge: "#31d4c2",
      inner: "#ffffff",
      innerText: "#127d72",
      glow: "rgba(49,212,194,0.34)",
      line: "#47dfcf",
    };
  }
  if (node.kind === "think") {
    return {
      border: "#8b8fff",
      background: baseBackground,
      text: "#e9e9ff",
      badge: "#8b8fff",
      inner: "#ffffff",
      innerText: "#5458d5",
      glow: "rgba(139,143,255,0.34)",
      line: "#a4a7ff",
    };
  }
  if (node.kind === "if") {
    return {
      border: "#ff5d8d",
      background: baseBackground,
      text: "#ffe4eb",
      badge: "#ff5d8d",
      inner: "#ffffff",
      innerText: "#c43a67",
      glow: "rgba(255,93,141,0.34)",
      line: "#ff6e98",
    };
  }
  if (node.kind === "tool") {
    return {
      border: "#29c8b6",
      background: baseBackground,
      text: "#e0f9f5",
      badge: "#29c8b6",
      inner: "#ffffff",
      innerText: "#168777",
      glow: "rgba(41,200,182,0.34)",
      line: "#40d9c7",
    };
  }
  if (node.kind === "calc") {
    return {
      border: "#ffe466",
      background: baseBackground,
      text: "#fff7d1",
      badge: "#ffe466",
      inner: "#ffffff",
      innerText: "#c8a31d",
      glow: "rgba(255,228,102,0.34)",
      line: "#ffe98a",
    };
  }
  if (node.kind === "output") {
    return {
      border: node.state === "ready" ? "#7f85ff" : "#ffad6a",
      background: baseBackground,
      text: node.state === "ready" ? "#ececff" : "#fff0db",
      badge: node.state === "ready" ? "#7f85ff" : "#ffad6a",
      inner: "#ffffff",
      innerText: node.state === "ready" ? "#565ce2" : "#bf7228",
      glow:
        node.state === "ready"
          ? "rgba(127,133,255,0.34)"
          : "rgba(255,173,106,0.32)",
      line: node.state === "ready" ? "#a1a6ff" : "#ffbf8a",
    };
  }
  return {
    border: "#7f95ff",
    background: baseBackground,
    text: "#e8ebff",
    badge: "#7f95ff",
    inner: "#ffffff",
    innerText: "#5358da",
    glow: "rgba(127,149,255,0.34)",
    line: "#9aa5ff",
  };
}
