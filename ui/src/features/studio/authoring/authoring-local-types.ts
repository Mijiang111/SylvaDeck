import type {
  ModuleFrameLayout,
  ModuleThinkingFlowNode,
} from "@/features/studio/types";

export type AuthoringStage =
  | "define"
  | "compose"
  | "semantics"
  | "test"
  | "publish";
export type CanvasMode = "visual" | "semantic" | "output";
export type StageState = "idle" | "active" | "complete" | "warning";

export type ModuleFrameInteractionMode =
  | "move"
  | "resize-nw"
  | "resize-ne"
  | "resize-se"
  | "resize-sw";

export type ModuleFrameInteractionState = {
  mode: ModuleFrameInteractionMode;
  startX: number;
  startY: number;
  initialFrame: ModuleFrameLayout;
};

export type ThinkingFlowNodeState = "ready" | "warning" | "idle";

export type ThinkingFlowCanvasNode = ModuleThinkingFlowNode & {
  state: ThinkingFlowNodeState;
  locked: boolean;
  movable: boolean;
};

export type ThinkingFlowNodeDragState = {
  nodeId: string;
  affectedNodeIds: string[];
  startX: number;
  startY: number;
  initialPositions: Record<string, { x: number; y: number }>;
};

export type FlowBoardPanState = {
  startX: number;
  startY: number;
  initialX: number;
  initialY: number;
};

export type FlowMarqueeSelectionState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};
