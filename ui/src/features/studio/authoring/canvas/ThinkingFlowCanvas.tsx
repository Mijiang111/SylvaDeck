import type {
  Dispatch,
  PointerEvent,
  RefObject,
  SetStateAction,
  WheelEvent,
} from "react";
import { Link2, Minus, Plus, Trash2 } from "lucide-react";
import type {
  ModuleTemplateField,
  ModuleThinkingFlowBranch,
  ModuleThinkingFlowEdge,
  ModuleThinkingFlowNodeKind,
} from "@/features/studio/types";
import type {
  FlowBoardPanState,
  FlowMarqueeSelectionState,
  ThinkingFlowCanvasNode,
} from "../authoring-local-types";
import { buildOrthogonalConnectionPath } from "../authoring-canvas-utils";
import { getThinkingFlowNodeLabel } from "../flow-runtime";
import {
  FLOW_NODE_PORT_OFFSET,
  THINKING_FLOW_BOARD_HEIGHT,
  THINKING_FLOW_BOARD_WIDTH,
  buildThinkingFlowEdgePath,
  getNextThinkingFlowBranchForSource,
  getThinkingFlowBranchLabel,
  getThinkingFlowBranchTone,
  getThinkingFlowHandlePoint,
  getThinkingFlowNodeDisplayLabel,
  getThinkingFlowNodeIcon,
  getThinkingFlowNodeTheme,
} from "../thinking-flow-model";

type CanvasPoint = {
  x: number;
  y: number;
};

type ThinkingFlowCanvasProps = {
  view: {
    thinkingFlowViewportRef: RefObject<HTMLDivElement | null>;
    thinkingFlowBoardRef: RefObject<HTMLDivElement | null>;
    flowViewportOffset: CanvasPoint;
    flowViewportScale: number;
    flowInteractionMode: "select" | "pan";
    flowPanState: FlowBoardPanState | null;
    thinkingFlowEdges: ModuleThinkingFlowEdge[];
    thinkingFlowNodeById: Map<string, ThinkingFlowCanvasNode>;
    selectedFlowNodeIdSet: Set<string>;
    pendingFlowEdgeSourceId: string | null;
    flowEdgePreviewPoint: CanvasPoint | null;
    selectedFlowNodeIds: string[];
    thinkingFlowNodes: ThinkingFlowCanvasNode[];
    flowMarqueeState: FlowMarqueeSelectionState | null;
    flowOutputFields: ModuleTemplateField[];
  };
  actions: {
    handleFlowViewportWheel: (event: WheelEvent<HTMLDivElement>) => void;
    startFlowViewportInteraction: (event: PointerEvent<HTMLDivElement>) => void;
    toggleThinkingFlowEdgeBranch: (
      edgeId: string,
      currentBranch: ModuleThinkingFlowBranch
    ) => void;
    removeThinkingFlowEdge: (edgeId: string) => void;
    completeThinkingFlowConnection: (targetNodeId: string) => void;
    selectThinkingFlowNode: (nodeId: string, additive?: boolean) => void;
    startThinkingFlowConnection: (
      nodeId: string,
      event: PointerEvent<HTMLButtonElement>
    ) => void;
    startThinkingFlowDrag: (
      nodeId: string,
      event: PointerEvent<HTMLButtonElement>
    ) => void;
    addThinkingFlowNode: (
      kind: Exclude<ModuleThinkingFlowNodeKind, "start" | "output">
    ) => void;
    setFlowInteractionMode: Dispatch<SetStateAction<"select" | "pan">>;
    zoomFlowBoard: (nextScale: number) => void;
    fitFlowBoardToView: () => void;
  };
};

export function ThinkingFlowCanvas({ view, actions }: ThinkingFlowCanvasProps) {
  const {
    thinkingFlowViewportRef,
    thinkingFlowBoardRef,
    flowViewportOffset,
    flowViewportScale,
    flowInteractionMode,
    flowPanState,
    thinkingFlowEdges,
    thinkingFlowNodeById,
    selectedFlowNodeIdSet,
    pendingFlowEdgeSourceId,
    flowEdgePreviewPoint,
    selectedFlowNodeIds,
    thinkingFlowNodes,
    flowMarqueeState,
    flowOutputFields,
  } = view;
  const {
    handleFlowViewportWheel,
    startFlowViewportInteraction,
    toggleThinkingFlowEdgeBranch,
    removeThinkingFlowEdge,
    completeThinkingFlowConnection,
    selectThinkingFlowNode,
    startThinkingFlowConnection,
    startThinkingFlowDrag,
    addThinkingFlowNode,
    setFlowInteractionMode,
    zoomFlowBoard,
    fitFlowBoardToView,
  } = actions;

  return (
    <div className="absolute inset-0 z-30 bg-[#090d1c]">
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(circle at 18% 84%, rgba(49,212,194,0.18) 0%, rgba(49,212,194,0) 28%), radial-gradient(circle at 76% 14%, rgba(139,143,255,0.22) 0%, rgba(139,143,255,0) 32%), radial-gradient(circle at 78% 74%, rgba(255,93,141,0.16) 0%, rgba(255,93,141,0) 24%), linear-gradient(180deg, #151b37 0%, #090d1c 100%)",
                    }}
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage:
                        "radial-gradient(circle, rgba(222,231,255,0.1) 0.55px, transparent 0.75px)",
                      backgroundSize: "10px 10px",
                    }}
                  />
                  <div className="absolute inset-0">
                    <div
                      ref={thinkingFlowViewportRef}
                      onWheel={handleFlowViewportWheel}
                      className="h-full w-full overflow-hidden"
                    >
                      <div className="relative h-full w-full">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.24)_0%,rgba(255,255,255,0)_62%)]" />
                        <div
                          ref={thinkingFlowBoardRef}
                          className="relative overflow-visible"
                          style={{
                            width: `${THINKING_FLOW_BOARD_WIDTH}px`,
                            height: `${THINKING_FLOW_BOARD_HEIGHT}px`,
                            transform: `translate(${flowViewportOffset.x}px, ${flowViewportOffset.y}px) scale(${flowViewportScale})`,
                            transformOrigin: "top left",
                          }}
                        >
                          <div
                            className={[
                              "absolute inset-0",
                              flowInteractionMode === "pan"
                                ? flowPanState
                                  ? "cursor-grabbing"
                                  : "cursor-grab"
                                : "cursor-crosshair",
                            ].join(" ")}
                            onPointerDown={startFlowViewportInteraction}
                            style={{
                              backgroundImage:
                                "linear-gradient(rgba(222,231,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(222,231,255,0.08) 1px, transparent 1px)",
                              backgroundSize: "16px 16px",
                            }}
                          />
                          <svg
                            className="pointer-events-none absolute inset-0"
                            width={THINKING_FLOW_BOARD_WIDTH}
                            height={THINKING_FLOW_BOARD_HEIGHT}
                            viewBox={`0 0 ${THINKING_FLOW_BOARD_WIDTH} ${THINKING_FLOW_BOARD_HEIGHT}`}
                          >
                            {thinkingFlowEdges.map((edge, index) => {
                              const source = thinkingFlowNodeById.get(
                                edge.sourceNodeId
                              );
                              const target = thinkingFlowNodeById.get(
                                edge.targetNodeId
                              );
                              if (!source || !target) {
                                return null;
                              }
                              const isLinkedToSelection =
                                selectedFlowNodeIdSet.has(edge.sourceNodeId) ||
                                selectedFlowNodeIdSet.has(edge.targetNodeId);
                              const sourceTheme =
                                getThinkingFlowNodeTheme(source);
                              const branch =
                                source.kind === "if"
                                  ? edge.branch ?? "yes"
                                  : null;
                              const branchTone = branch
                                ? getThinkingFlowBranchTone(branch)
                                : null;
                              const stroke = branchTone
                                ? branchTone.stroke
                                : target.kind === "output" &&
                                  target.state !== "ready"
                                ? "#ffbf8a"
                                : isLinkedToSelection
                                ? "#ffffff"
                                : sourceTheme.line;
                              const path = buildThinkingFlowEdgePath(
                                source,
                                target,
                                index % 4
                              );
                              return (
                                <g key={edge.id}>
                                  <path
                                    d={path}
                                    fill="none"
                                    stroke={
                                      branchTone?.glow ?? sourceTheme.glow
                                    }
                                    strokeWidth={isLinkedToSelection ? 12 : 10}
                                    strokeOpacity={0.9}
                                    strokeLinecap="round"
                                  />
                                  <path
                                    d={path}
                                    fill="none"
                                    stroke={stroke}
                                    strokeWidth={isLinkedToSelection ? 4 : 3}
                                    strokeOpacity={0.96}
                                    strokeLinecap="round"
                                    strokeDasharray={
                                      branch === "no" ? "10 8" : undefined
                                    }
                                  />
                                </g>
                              );
                            })}
                            {pendingFlowEdgeSourceId && flowEdgePreviewPoint
                              ? (() => {
                                  const source = thinkingFlowNodeById.get(
                                    pendingFlowEdgeSourceId
                                  );
                                  if (!source) {
                                    return null;
                                  }
                                  const sourceHandle =
                                    getThinkingFlowHandlePoint(source, "right");
                                  const sourceTheme =
                                    getThinkingFlowNodeTheme(source);
                                  const pendingBranch =
                                    source.kind === "if"
                                      ? getNextThinkingFlowBranchForSource(
                                          source.id,
                                          thinkingFlowEdges
                                        )
                                      : null;
                                  const pendingBranchTone = pendingBranch
                                    ? getThinkingFlowBranchTone(pendingBranch)
                                    : null;
                                  const path = buildOrthogonalConnectionPath(
                                    sourceHandle.x,
                                    sourceHandle.y,
                                    flowEdgePreviewPoint.x,
                                    flowEdgePreviewPoint.y
                                  );
                                  return (
                                    <g>
                                      <path
                                        d={path}
                                        fill="none"
                                        stroke={
                                          pendingBranchTone?.glow ??
                                          sourceTheme.glow
                                        }
                                        strokeWidth={10}
                                        strokeOpacity={0.88}
                                        strokeLinecap="round"
                                      />
                                      <path
                                        d={path}
                                        fill="none"
                                        stroke={
                                          pendingBranchTone?.stroke ?? "#ffffff"
                                        }
                                        strokeWidth={3}
                                        strokeDasharray="10 8"
                                        strokeOpacity={0.96}
                                        strokeLinecap="round"
                                      />
                                    </g>
                                  );
                                })()
                              : null}
                          </svg>

                          {thinkingFlowEdges.map((edge) => {
                            const source = thinkingFlowNodeById.get(
                              edge.sourceNodeId
                            );
                            const target = thinkingFlowNodeById.get(
                              edge.targetNodeId
                            );
                            if (!source || !target) {
                              return null;
                            }
                            const showDeleteControl =
                              selectedFlowNodeIds.length > 0 &&
                              (selectedFlowNodeIdSet.has(source.id) ||
                                selectedFlowNodeIdSet.has(target.id));
                            const showBranchControl = source.kind === "if";
                            if (!showDeleteControl && !showBranchControl) {
                              return null;
                            }
                            const midpointX =
                              (source.x + source.w + target.x) / 2;
                            const midpointY =
                              (source.y +
                                source.h / 2 +
                                target.y +
                                target.h / 2) /
                              2;
                            return (
                              <div key={`${edge.id}-controls`}>
                                {showBranchControl ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleThinkingFlowEdgeBranch(
                                        edge.id,
                                        edge.branch ?? "yes"
                                      )
                                    }
                                    className="absolute inline-flex h-8 items-center justify-center rounded-full border px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] shadow-[0_8px_18px_rgba(0,0,0,0.22)] transition hover:scale-[1.02]"
                                    style={{
                                      left: `${midpointX - 20}px`,
                                      top: `${midpointY - 42}px`,
                                      borderColor: getThinkingFlowBranchTone(
                                        edge.branch ?? "yes"
                                      ).stroke,
                                      background: getThinkingFlowBranchTone(
                                        edge.branch ?? "yes"
                                      ).bg,
                                      color: getThinkingFlowBranchTone(
                                        edge.branch ?? "yes"
                                      ).text,
                                    }}
                                  >
                                    {getThinkingFlowBranchLabel(
                                      edge.branch ?? "yes"
                                    )}
                                  </button>
                                ) : null}
                                {showDeleteControl ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeThinkingFlowEdge(edge.id)
                                    }
                                    className="absolute inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#d8d1c6] bg-white text-[#173043] shadow-[0_8px_18px_rgba(16,40,56,0.12)] transition hover:bg-[#f3ede3]"
                                    style={{
                                      left: `${midpointX - 14}px`,
                                      top: `${midpointY - 14}px`,
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                              </div>
                            );
                          })}

                          {thinkingFlowNodes.map((node) => {
                            const theme = getThinkingFlowNodeTheme(node);
                            const NodeIcon = getThinkingFlowNodeIcon(node.kind);
                            const isSelected = selectedFlowNodeIdSet.has(
                              node.id
                            );
                            const canReceive =
                              pendingFlowEdgeSourceId &&
                              pendingFlowEdgeSourceId !== node.id &&
                              node.kind !== "start";
                            return (
                              <div
                                key={node.id}
                                className="absolute"
                                style={{
                                  left: `${node.x}px`,
                                  top: `${node.y}px`,
                                  width: `${node.w}px`,
                                  height: `${node.h}px`,
                                }}
                              >
                                {node.kind !== "start" ? (
                                  <div
                                    className="pointer-events-none absolute top-1/2 h-[4px] -translate-y-1/2 rounded-full"
                                    style={{
                                      left: `${-FLOW_NODE_PORT_OFFSET}px`,
                                      width: `${FLOW_NODE_PORT_OFFSET}px`,
                                      background: `linear-gradient(90deg, ${theme.badge} 0%, ${theme.line} 100%)`,
                                      boxShadow: `0 0 16px ${theme.glow}`,
                                    }}
                                  />
                                ) : null}
                                {node.kind !== "start" ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      canReceive
                                        ? completeThinkingFlowConnection(
                                            node.id
                                          )
                                        : selectThinkingFlowNode(node.id)
                                    }
                                    className={[
                                      "absolute top-1/2 z-20 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border transition",
                                      canReceive ? "scale-110" : "opacity-80",
                                    ].join(" ")}
                                    style={{
                                      left: `${-FLOW_NODE_PORT_OFFSET - 14}px`,
                                      borderColor: theme.badge,
                                      background: "#ffffff",
                                      color: theme.innerText,
                                      boxShadow: `0 0 18px ${theme.glow}, 0 10px 20px rgba(6,10,24,0.3)`,
                                    }}
                                  >
                                    +
                                  </button>
                                ) : null}

                                {node.kind !== "output" ? (
                                  <div
                                    className="pointer-events-none absolute top-1/2 h-[4px] -translate-y-1/2 rounded-full"
                                    style={{
                                      left: `${node.w}px`,
                                      width: `${FLOW_NODE_PORT_OFFSET}px`,
                                      background: `linear-gradient(90deg, ${theme.line} 0%, ${theme.badge} 100%)`,
                                      boxShadow: `0 0 16px ${theme.glow}`,
                                    }}
                                  />
                                ) : null}

                                {node.kind !== "output" ? (
                                  <button
                                    type="button"
                                    onPointerDown={(event) =>
                                      startThinkingFlowConnection(
                                        node.id,
                                        event
                                      )
                                    }
                                    className={[
                                      "absolute top-1/2 z-20 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border transition",
                                      pendingFlowEdgeSourceId === node.id
                                        ? "scale-110"
                                        : "",
                                    ].join(" ")}
                                    style={{
                                      left: `${
                                        node.w + FLOW_NODE_PORT_OFFSET - 14
                                      }px`,
                                      borderColor: theme.badge,
                                      background: "#0c1124",
                                      color: theme.badge,
                                      boxShadow: `0 0 18px ${theme.glow}, 0 12px 22px rgba(6,10,24,0.34)`,
                                    }}
                                  >
                                    <Link2 className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}

                                <button
                                  type="button"
                                  onClick={(event) =>
                                    selectThinkingFlowNode(
                                      node.id,
                                      event.metaKey || event.ctrlKey
                                    )
                                  }
                                  onPointerDown={(event) =>
                                    pendingFlowEdgeSourceId
                                      ? undefined
                                      : startThinkingFlowDrag(node.id, event)
                                  }
                                  className={[
                                    "relative h-full w-full overflow-visible rounded-full transition",
                                    isSelected
                                      ? ""
                                      : "hover:translate-y-[-2px]",
                                  ].join(" ")}
                                >
                                  <div
                                    className="flex h-full w-full items-center justify-center rounded-full border-[5px]"
                                    style={{
                                      borderColor: theme.border,
                                      background: theme.background,
                                      boxShadow: isSelected
                                        ? `0 0 0 4px rgba(255,255,255,0.12), 0 0 34px ${theme.glow}, 0 32px 40px rgba(5,8,18,0.48)`
                                        : `0 0 28px ${theme.glow}, 0 26px 36px rgba(5,8,18,0.42), inset 0 14px 20px rgba(255,255,255,0.06), inset 0 -18px 24px rgba(0,0,0,0.32)`,
                                    }}
                                  >
                                    <div
                                      className="flex h-[70px] w-[70px] items-center justify-center rounded-full border"
                                      style={{
                                        borderColor: "rgba(11,17,36,0.08)",
                                        background: theme.inner,
                                        boxShadow:
                                          "inset 0 6px 10px rgba(255,255,255,0.88), 0 8px 16px rgba(8,12,24,0.18)",
                                      }}
                                    >
                                      <NodeIcon
                                        className="h-7 w-7"
                                        style={{ color: theme.innerText }}
                                      />
                                    </div>
                                  </div>
                                  <div className="pointer-events-none absolute left-1/2 top-[calc(100%+12px)] w-[156px] -translate-x-1/2 text-center">
                                    <div
                                      className="text-[11px] font-medium leading-4"
                                      style={{ color: theme.text }}
                                    >
                                      {getThinkingFlowNodeDisplayLabel(node)}
                                    </div>
                                    {node.kind === "output" ? (
                                      <div className="mt-1 text-[9px] uppercase tracking-[0.12em] text-[#9fa8c7]">
                                        Layout output
                                      </div>
                                    ) : null}
                                  </div>
                                </button>
                              </div>
                            );
                          })}
                          {flowMarqueeState ? (
                            <div
                              className="pointer-events-none absolute border border-[#6bb7ff] bg-[#6bb7ff]/12"
                              style={{
                                left: `${Math.min(
                                  flowMarqueeState.startX,
                                  flowMarqueeState.currentX
                                )}px`,
                                top: `${Math.min(
                                  flowMarqueeState.startY,
                                  flowMarqueeState.currentY
                                )}px`,
                                width: `${Math.abs(
                                  flowMarqueeState.currentX -
                                    flowMarqueeState.startX
                                )}px`,
                                height: `${Math.abs(
                                  flowMarqueeState.currentY -
                                    flowMarqueeState.startY
                                )}px`,
                              }}
                            />
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center px-4">
                      <div className="pointer-events-auto max-w-full overflow-x-auto">
                        <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[#0e1429]/86 p-1.5 text-white shadow-[0_22px_40px_rgba(0,0,0,0.34)] backdrop-blur">
                          {(
                            ["brief", "think", "if", "tool", "calc"] as const
                          ).map((kind) => (
                            <button
                              key={kind}
                              type="button"
                              onClick={() => addThinkingFlowNode(kind)}
                              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-[#eef3ff] transition hover:bg-white/10"
                            >
                              <Plus className="h-4 w-4" />
                              <span>{getThinkingFlowNodeLabel(kind)}</span>
                            </button>
                          ))}
                          <span className="mx-1 h-6 w-px bg-white/10" />
                          {(["select", "pan"] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setFlowInteractionMode(mode)}
                              className={[
                                "inline-flex items-center rounded-full px-3 py-2 text-sm font-semibold transition",
                                flowInteractionMode === mode
                                  ? "bg-white text-[#0e1429]"
                                  : "text-[#eef3ff] hover:bg-white/10",
                              ].join(" ")}
                            >
                              {mode === "select" ? "Select" : "Pan"}
                            </button>
                          ))}
                          <span className="mx-1 h-6 w-px bg-white/10" />
                          <button
                            type="button"
                            onClick={() =>
                              zoomFlowBoard(flowViewportScale - 0.1)
                            }
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#eef3ff] transition hover:bg-white/10"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={fitFlowBoardToView}
                            className="inline-flex items-center rounded-full px-3 py-2 text-sm font-semibold text-[#eef3ff] transition hover:bg-white/10"
                          >
                            {Math.round(flowViewportScale * 100)}%
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              zoomFlowBoard(flowViewportScale + 0.1)
                            }
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#eef3ff] transition hover:bg-white/10"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          {flowOutputFields.length === 0 ? (
                            <>
                              <span className="mx-1 h-6 w-px bg-white/10" />
                              <div className="px-3 text-[12px] leading-5 text-[#95a3c9]">
                                Add AI-output or chart blocks in Layout first.
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
  );
}
