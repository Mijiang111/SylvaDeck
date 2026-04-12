import type {
  Dispatch,
  PointerEvent,
  RefObject,
  SetStateAction,
  WheelEvent,
} from "react";
import { Link2, Plus } from "lucide-react";
import type {
  ModuleCanvasObjectKind,
  ModuleConnection,
  ModuleFrameLayout,
  ModuleRegistryEntry,
  ModuleTemplateField,
  ModuleThinkingFlowBranch,
  ModuleThinkingFlowEdge,
  ModuleThinkingFlowNodeKind,
} from "@/features/studio/types";
import {
  isAiTextField,
  isSquareTemplateField,
} from "@/features/studio/module-fields";
import type { ThinkingFlowRunResult } from "../flow-runtime";
import type {
  AuthoringStage,
  CanvasMode,
  FlowBoardPanState,
  FlowMarqueeSelectionState,
  ModuleFrameInteractionMode,
  ThinkingFlowCanvasNode,
} from "../authoring-local-types";
import {
  ARTBOARD_OFFSET_X,
  ARTBOARD_OFFSET_Y,
  MODULE_ARTBOARD_HEIGHT,
  MODULE_ARTBOARD_WIDTH,
  MODULE_CANVAS_COLUMNS,
  MODULE_CANVAS_ROWS,
  MODULE_SCENE_COLUMNS,
  MODULE_SCENE_HEIGHT,
  MODULE_SCENE_ROWS,
  MODULE_SCENE_WIDTH,
  MODULE_UNIT_SIZE,
  createDefaultFieldLayout,
  createEmptyDataTable,
  getCanvasObjectKind,
  getFieldKindTone,
  getFieldSurface,
  getSceneLayout,
  isFieldConnectable,
  isLayoutInsideModuleFrame,
} from "../helpers";
import type {
  CanvasEditMode,
  CanvasObjectPreset,
  MarqueeSelectionState,
  WorkspacePanState,
} from "../helpers";
import {
  CHART_KIND_LABEL,
  WORKBENCH_DARK_BACKGROUND,
} from "../authoring-constants";
import { getConnectionMarkerId } from "../authoring-canvas-utils";
import {
  CHART_SERIES_COLORS,
  getChartKind,
  getChartStatusMessage,
  renderChartGraphic,
} from "../chart-preview";
import type { deriveChartPreview } from "../chart-preview";
import { buildOutputContractPreviewCopy } from "../output-contract";
import { TemplateCanvasToolbar } from "./TemplateCanvasToolbar";
import { ThinkingFlowCanvas } from "./ThinkingFlowCanvas";

type CanvasPoint = {
  x: number;
  y: number;
};

type DerivedChartPreview = ReturnType<typeof deriveChartPreview>;

type ConnectionRenderItem = {
  connection: ModuleConnection;
  sourceField: ModuleTemplateField;
  targetField: ModuleTemplateField;
  label: string;
  stroke: string;
  path: string;
};

type TemplateCanvasStageProps = {
  view: {
    activeStage: AuthoringStage;
    artboardFields: ModuleTemplateField[];
    canvasMode: CanvasMode;
    canvasRef: RefObject<HTMLDivElement | null>;
    chartPreviewByFieldId: Map<string, DerivedChartPreview>;
    chartSourceByFieldId: Map<string, ModuleTemplateField | null>;
    connectionRenderItems: ConnectionRenderItem[];
    connections: ModuleConnection[];
    draft: ModuleRegistryEntry;
    flowEdgePreviewPoint: CanvasPoint | null;
    flowInteractionMode: "select" | "pan";
    flowMarqueeState: FlowMarqueeSelectionState | null;
    flowOutputFields: ModuleTemplateField[];
    flowPanState: FlowBoardPanState | null;
    flowRunResult: ThinkingFlowRunResult | null;
    flowViewportOffset: CanvasPoint;
    flowViewportScale: number;
    isFlowStage: boolean;
    isLibraryOpen: boolean;
    isModuleFrameInteracting: boolean;
    marqueeState: MarqueeSelectionState | null;
    moduleFrame: ModuleFrameLayout;
    panState: WorkspacePanState | null;
    pasteboardFields: ModuleTemplateField[];
    pendingConnectionRender: string | null;
    pendingConnectionSourceId: string | null;
    pendingFlowEdgeSourceId: string | null;
    sceneRef: RefObject<HTMLDivElement | null>;
    selectedField: ModuleTemplateField | null;
    selectedFieldIds: string[];
    selectedFlowNodeIdSet: Set<string>;
    selectedFlowNodeIds: string[];
    selectedObjectKind: ModuleCanvasObjectKind | null;
    thinkingFlowBoardRef: RefObject<HTMLDivElement | null>;
    thinkingFlowEdges: ModuleThinkingFlowEdge[];
    thinkingFlowNodeById: Map<string, ThinkingFlowCanvasNode>;
    thinkingFlowNodes: ThinkingFlowCanvasNode[];
    thinkingFlowViewportRef: RefObject<HTMLDivElement | null>;
    workspaceOffset: CanvasPoint;
    workspaceScale: number;
    workspaceViewportRef: RefObject<HTMLDivElement | null>;
  };
  actions: {
    addCanvasObject: (
      kind?: ModuleCanvasObjectKind,
      preset?: CanvasObjectPreset
    ) => void;
    addThinkingFlowNode: (
      kind: Exclude<ModuleThinkingFlowNodeKind, "start" | "output">
    ) => void;
    completeConnection: (
      targetFieldId: string,
      event?: PointerEvent<HTMLElement>
    ) => void;
    completeThinkingFlowConnection: (targetNodeId: string) => void;
    fitFlowBoardToView: () => void;
    fitWorkspaceToView: () => void;
    getScenePoint: (clientX: number, clientY: number) => CanvasPoint | null;
    handleFieldSelection: (fieldId: string, additive: boolean) => void;
    handleFlowViewportWheel: (event: WheelEvent<HTMLDivElement>) => void;
    handleStageChange: (stage: AuthoringStage) => void;
    handleWorkspaceWheel: (event: WheelEvent<HTMLDivElement>) => void;
    openLibraryModal: () => void;
    removeThinkingFlowEdge: (edgeId: string) => void;
    selectThinkingFlowNode: (nodeId: string, additive?: boolean) => void;
    setConnectionPreviewPoint: Dispatch<SetStateAction<CanvasPoint | null>>;
    setDraft: Dispatch<SetStateAction<ModuleRegistryEntry>>;
    setFlowInteractionMode: Dispatch<SetStateAction<"select" | "pan">>;
    setSelectedFieldIds: Dispatch<SetStateAction<string[]>>;
    startConnection: (
      fieldId: string,
      event: PointerEvent<HTMLElement>
    ) => void;
    startFieldDrag: (
      event: PointerEvent<HTMLElement>,
      fieldId: string,
      mode: CanvasEditMode
    ) => void;
    startFlowViewportInteraction: (event: PointerEvent<HTMLDivElement>) => void;
    startMarqueeSelection: (event: PointerEvent<HTMLElement>) => void;
    startModuleFrameInteraction: (
      mode: ModuleFrameInteractionMode,
      event: PointerEvent<HTMLElement>
    ) => void;
    startThinkingFlowConnection: (
      nodeId: string,
      event: PointerEvent<HTMLButtonElement>
    ) => void;
    startThinkingFlowDrag: (
      nodeId: string,
      event: PointerEvent<HTMLButtonElement>
    ) => void;
    startWorkspacePan: (event: PointerEvent<HTMLDivElement>) => void;
    toggleThinkingFlowEdgeBranch: (
      edgeId: string,
      currentBranch: ModuleThinkingFlowBranch
    ) => void;
    zoomFlowBoard: (nextScale: number) => void;
    zoomWorkspace: (
      nextScale: number,
      anchor?: { clientX: number; clientY: number }
    ) => void;
  };
};

function getFieldBadge(field: ModuleTemplateField) {
  const objectKind = getCanvasObjectKind(field);
  if (objectKind === "data") return "Data";
  if (objectKind === "chart") return "Chart";
  if (objectKind === "line") return "Line";
  if (isAiTextField(field)) return "AI";
  if (objectKind === "text") return "Locked";
  return "Shape";
}

export function TemplateCanvasStage({ view, actions }: TemplateCanvasStageProps) {
  const {
    activeStage,
    artboardFields,
    canvasMode,
    canvasRef,
    chartPreviewByFieldId,
    chartSourceByFieldId,
    connectionRenderItems,
    connections,
    draft,
    flowEdgePreviewPoint,
    flowInteractionMode,
    flowMarqueeState,
    flowOutputFields,
    flowPanState,
    flowRunResult,
    flowViewportOffset,
    flowViewportScale,
    isFlowStage,
    isLibraryOpen,
    isModuleFrameInteracting,
    marqueeState,
    moduleFrame,
    panState,
    pasteboardFields,
    pendingConnectionRender,
    pendingConnectionSourceId,
    pendingFlowEdgeSourceId,
    sceneRef,
    selectedField,
    selectedFieldIds,
    selectedFlowNodeIdSet,
    selectedFlowNodeIds,
    selectedObjectKind,
    thinkingFlowBoardRef,
    thinkingFlowEdges,
    thinkingFlowNodeById,
    thinkingFlowNodes,
    thinkingFlowViewportRef,
    workspaceOffset,
    workspaceScale,
    workspaceViewportRef,
  } = view;
  const {
    addCanvasObject,
    addThinkingFlowNode,
    completeConnection,
    completeThinkingFlowConnection,
    fitFlowBoardToView,
    fitWorkspaceToView,
    getScenePoint,
    handleFieldSelection,
    handleFlowViewportWheel,
    handleStageChange,
    handleWorkspaceWheel,
    openLibraryModal,
    removeThinkingFlowEdge,
    selectThinkingFlowNode,
    setConnectionPreviewPoint,
    setDraft,
    setFlowInteractionMode,
    setSelectedFieldIds,
    startConnection,
    startFieldDrag,
    startFlowViewportInteraction,
    startMarqueeSelection,
    startModuleFrameInteraction,
    startThinkingFlowConnection,
    startThinkingFlowDrag,
    startWorkspacePan,
    toggleThinkingFlowEdgeBranch,
    zoomFlowBoard,
    zoomWorkspace,
  } = actions;

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden border-r border-[var(--studio-line)] bg-[rgba(10,10,10,0.88)]">
      <div
        ref={workspaceViewportRef}
        className="relative min-h-0 flex-1 overflow-hidden bg-[#020202]"
        onWheel={handleWorkspaceWheel}
        onPointerMove={(event) => {
          if (!pendingConnectionSourceId) {
            return;
          }
          const point = getScenePoint(event.clientX, event.clientY);
          setConnectionPreviewPoint(point);
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: WORKBENCH_DARK_BACKGROUND,
            cursor: panState
              ? "grabbing"
              : isModuleFrameInteracting
              ? "grabbing"
              : marqueeState
              ? "crosshair"
              : "default",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.1) 0.55px, transparent 0.75px)",
            backgroundSize: "10px 10px",
            cursor: panState
              ? "grabbing"
              : isModuleFrameInteracting
              ? "grabbing"
              : marqueeState
              ? "crosshair"
              : "default",
          }}
          onPointerDown={(event) => {
            if (event.altKey) {
              startWorkspacePan(event);
              return;
            }
            startMarqueeSelection(event);
          }}
        />

        {!isFlowStage ? (
          <div className="absolute left-5 top-5 z-20 inline-flex items-center rounded-full border border-[var(--studio-line)] bg-[rgba(5,5,5,0.88)] text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-muted)] shadow-[0_22px_40px_rgba(0,0,0,0.34)] backdrop-blur">
            <button
              type="button"
              onClick={() => zoomWorkspace(workspaceScale * 0.9)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-l-full border-r border-[var(--studio-line)] text-[var(--studio-ink)] transition hover:bg-[rgba(0,242,255,0.08)]"
            >
              -
            </button>
            <button
              type="button"
              onClick={fitWorkspaceToView}
              className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-ink)] transition hover:bg-[rgba(0,242,255,0.08)]"
            >
              {Math.round(workspaceScale * 100)}%
            </button>
            <button
              type="button"
              onClick={() => zoomWorkspace(workspaceScale * 1.1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-r-full border-l border-[var(--studio-line)] text-[var(--studio-ink)] transition hover:bg-[rgba(0,242,255,0.08)]"
            >
              +
            </button>
          </div>
        ) : null}

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div
            style={{
              transform: `translate3d(${workspaceOffset.x}px, ${workspaceOffset.y}px, 0) scale(${workspaceScale})`,
              transformOrigin: "center center",
              willChange: "transform",
            }}
          >
            <div
              ref={sceneRef}
              className="relative"
              style={{
                width: `${MODULE_SCENE_WIDTH}px`,
                height: `${MODULE_SCENE_HEIGHT}px`,
              }}
            >
              <div
                ref={canvasRef}
                className={[
                  "absolute select-none overflow-hidden border border-white/10 bg-[#f7f8fc]",
                  isFlowStage ? "pointer-events-none opacity-0" : "",
                ].join(" ")}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedFieldIds([]);
                }}
                onPointerDown={(event) => {
                  if (event.target === event.currentTarget) {
                    if (event.altKey) {
                      startWorkspacePan(event);
                      return;
                    }
                    startMarqueeSelection(event);
                  }
                }}
                onDragStart={(event) => event.preventDefault()}
                style={{
                  left: `${ARTBOARD_OFFSET_X * MODULE_UNIT_SIZE}px`,
                  top: `${ARTBOARD_OFFSET_Y * MODULE_UNIT_SIZE}px`,
                  width: `${MODULE_ARTBOARD_WIDTH}px`,
                  height: `${MODULE_ARTBOARD_HEIGHT}px`,
                  backfaceVisibility: "hidden",
                  transform: "translateZ(0)",
                  boxShadow:
                    "0 38px 70px rgba(3,6,20,0.42), 0 0 0 1px rgba(255,255,255,0.04)",
                }}
              >
                <div
                  className={[
                    "pointer-events-none absolute z-[2] border-[3px] transition",
                    activeStage === "define"
                      ? "border-[#31d4c2]"
                      : "border-[#8b8fff]/80",
                  ].join(" ")}
                  style={{
                    left: `${(moduleFrame.x / MODULE_CANVAS_COLUMNS) * 100}%`,
                    top: `${(moduleFrame.y / MODULE_CANVAS_ROWS) * 100}%`,
                    width: `${(moduleFrame.w / MODULE_CANVAS_COLUMNS) * 100}%`,
                    height: `${(moduleFrame.h / MODULE_CANVAS_ROWS) * 100}%`,
                    background:
                      activeStage === "define"
                        ? "rgba(49, 212, 194, 0.08)"
                        : "transparent",
                    boxShadow:
                      activeStage === "define"
                        ? "0 0 0 1px rgba(255,255,255,0.24) inset, 0 0 24px rgba(49,212,194,0.2)"
                        : "0 0 0 1px rgba(255,255,255,0.1) inset, 0 0 18px rgba(139,143,255,0.12)",
                  }}
                >
                  {activeStage === "define" ? (
                    <>
                      <button
                        type="button"
                        onPointerDown={(event) =>
                          startModuleFrameInteraction("move", event)
                        }
                        className="pointer-events-auto absolute inset-x-0 top-0 flex h-10 cursor-move items-center justify-between border-b border-white/10 bg-[#0d1428]/86 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#effaff] backdrop-blur"
                        style={{ touchAction: "none" }}
                      >
                        <span>Template</span>
                        <span className="text-[#97b8cf]">Drag frame</span>
                      </button>
                      {[
                        {
                          mode: "resize-nw" as const,
                          className: "-left-2 -top-2 cursor-nwse-resize",
                        },
                        {
                          mode: "resize-ne" as const,
                          className: "-right-2 -top-2 cursor-nesw-resize",
                        },
                        {
                          mode: "resize-se" as const,
                          className: "-bottom-2 -right-2 cursor-nwse-resize",
                        },
                        {
                          mode: "resize-sw" as const,
                          className: "-bottom-2 -left-2 cursor-nesw-resize",
                        },
                      ].map((handle) => (
                        <button
                          key={handle.mode}
                          type="button"
                          aria-label={`Resize template frame ${handle.mode}`}
                          onPointerDown={(event) =>
                            startModuleFrameInteraction(handle.mode, event)
                          }
                          className={[
                            "pointer-events-auto absolute h-5 w-5 rounded-full border border-[#31d4c2] bg-white shadow-[0_0_18px_rgba(49,212,194,0.22)]",
                            handle.className,
                          ].join(" ")}
                          style={{ touchAction: "none" }}
                        />
                      ))}
                    </>
                  ) : (
                    <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/10 bg-[#0d1428]/86 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#eef3ff] backdrop-blur">
                      Template
                    </div>
                  )}
                </div>
                {artboardFields.length === 0 ? (
                  <div className="absolute inset-x-12 top-1/2 z-[1] -translate-y-1/2 text-center">
                    <div className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#627987]">
                      {canvasMode === "output"
                        ? "No output preview yet"
                        : "Empty artboard"}
                    </div>
                    <div className="mt-3 text-[18px] font-semibold text-[#173043]">
                      {canvasMode === "semantic"
                        ? "No blocks or links are visible in the flow yet."
                        : canvasMode === "output"
                        ? "There is nothing to preview in output mode yet."
                        : "Nothing is visible in the center yet."}
                    </div>
                    <div className="mt-2 text-sm leading-7 text-[#5f7682]">
                      {canvasMode === "output"
                        ? "Switch to Flow mode to wire blocks together, then return here to inspect how the template will read with generated content."
                        : activeStage === "define"
                        ? "Drag the template frame from its header, resize it from the corners, then describe what this page template is for."
                        : pasteboardFields.length > 0
                        ? "This template has objects on the pasteboard. Drag them into the 16:9 artboard if they belong in the final page template."
                        : "Open a base template or add AI Text, Locked Text, Data, Chart, Shape, or Line from the bottom toolbar to build the template."}
                    </div>
                  </div>
                ) : null}
              </div>
              {canvasMode === "semantic" ? (
                <svg
                  className="pointer-events-none absolute left-0 top-0 z-[1]"
                  width={MODULE_SCENE_WIDTH}
                  height={MODULE_SCENE_HEIGHT}
                  viewBox={`0 0 ${MODULE_SCENE_WIDTH} ${MODULE_SCENE_HEIGHT}`}
                >
                  <defs>
                    <marker
                      id="module-connection-arrow-data"
                      markerWidth="10"
                      markerHeight="10"
                      refX="7"
                      refY="5"
                      orient="auto"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#4c7f68" />
                    </marker>
                    <marker
                      id="module-connection-arrow-ai"
                      markerWidth="10"
                      markerHeight="10"
                      refX="7"
                      refY="5"
                      orient="auto"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#4d7ca6" />
                    </marker>
                    <marker
                      id="module-connection-arrow-explain"
                      markerWidth="10"
                      markerHeight="10"
                      refX="7"
                      refY="5"
                      orient="auto"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#b07b42" />
                    </marker>
                    <marker
                      id="module-connection-arrow-link"
                      markerWidth="10"
                      markerHeight="10"
                      refX="7"
                      refY="5"
                      orient="auto"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#627987" />
                    </marker>
                    <marker
                      id="module-connection-arrow-pending"
                      markerWidth="10"
                      markerHeight="10"
                      refX="7"
                      refY="5"
                      orient="auto"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#173043" />
                    </marker>
                  </defs>
                  {connectionRenderItems.map((item) => {
                    const isActive = selectedField
                      ? item.connection.sourceFieldId === selectedField.id ||
                        item.connection.targetFieldId === selectedField.id
                      : false;
                    return (
                      <g key={item.connection.id}>
                        <path
                          d={item.path}
                          fill="none"
                          stroke={item.stroke}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeOpacity={isActive ? 0.96 : 0.58}
                          strokeWidth={isActive ? 3.2 : 2.2}
                          strokeDasharray={
                            item.connection.kind === "ai-fill"
                              ? "8 6"
                              : undefined
                          }
                          markerEnd={`url(#${getConnectionMarkerId(
                            item.connection.kind
                          )})`}
                        />
                      </g>
                    );
                  })}
                  {pendingConnectionRender ? (
                    <path
                      d={pendingConnectionRender}
                      fill="none"
                      stroke="#173043"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeOpacity={0.68}
                      strokeWidth={2.4}
                      strokeDasharray="8 6"
                      markerEnd="url(#module-connection-arrow-pending)"
                    />
                  ) : null}
                </svg>
              ) : null}

              {draft.fields.map((field, index) => {
                const layout =
                  field.layout ??
                  createDefaultFieldLayout(draft.kind, index, draft.fields.length);
                const sceneLayout = getSceneLayout(field, layout);
                const fieldInsideModuleFrame =
                  getFieldSurface(field) === "artboard"
                    ? isLayoutInsideModuleFrame(layout, moduleFrame)
                    : false;
                const selected = selectedFieldIds.includes(field.id);
                const objectKind = getCanvasObjectKind(field);
                const isSlot = objectKind === "slot";
                const isAiText = isAiTextField(field);
                const isSquare = isSquareTemplateField(field);
                const isConnectable = isFieldConnectable(field);
                const fieldTone = getFieldKindTone(field);
                const dataTable = field.dataTable ?? createEmptyDataTable("");
                const chartSource = chartSourceByFieldId.get(field.id) ?? null;
                const chartPreview = chartPreviewByFieldId.get(field.id) ?? {
                  kind: getChartKind(field),
                  status: "needs-data",
                  sourceLabel: null,
                  rowCount: 0,
                  numericColumnCount: 0,
                  seriesLabels: [],
                  bars: [],
                  stacks: [],
                  waterfall: [],
                  minValue: 0,
                  maxValue: 0,
                };
                const flowRunFieldOutput =
                  flowRunResult?.fieldOutputs[field.id] ?? null;
                const outputPreviewTitle =
                  flowRunFieldOutput?.title ||
                  field.example?.trim() ||
                  field.label ||
                  "Generated preview";
                const outputPreviewBody = flowRunFieldOutput
                  ? [flowRunFieldOutput.body]
                      .concat(
                        flowRunFieldOutput.bullets.map(
                          (bullet) => `• ${bullet}`
                        )
                      )
                      .join(" ")
                  : buildOutputContractPreviewCopy(field);
                const outgoingConnections = connections.filter(
                  (connection) => connection.sourceFieldId === field.id
                );
                const incomingConnections = connections.filter(
                  (connection) => connection.targetFieldId === field.id
                );
                const fill =
                  field.style?.fill ??
                  (objectKind === "slot"
                    ? "#ffffff"
                    : objectKind === "data"
                    ? "#f6f7f2"
                    : "#dce9ee");
                const stroke = field.style?.stroke ?? "#9bb6c2";
                const strokeWidth = field.style?.strokeWidth ?? 1;
                const strokeStyle = field.style?.strokeStyle ?? "solid";
                const rotation = field.style?.rotation ?? 0;
                const radius =
                  objectKind === "ellipse"
                    ? "9999px"
                    : isSquare
                    ? "12px"
                    : field.style?.radius === "round"
                    ? "28px"
                    : field.style?.radius === "none"
                    ? "8px"
                    : "18px";
                return (
                  <button
                    key={field.id}
                    type="button"
                    draggable={false}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleFieldSelection(
                        field.id,
                        event.metaKey || event.ctrlKey
                      );
                    }}
                    onPointerDown={(event) =>
                      startFieldDrag(event, field.id, "move")
                    }
                    onDragStart={(event) => event.preventDefault()}
                    className={[
                      "absolute select-none text-left transition",
                      "relative",
                      selected ? "ring-2 ring-[#6bb7ff]/60" : "",
                    ].join(" ")}
                    style={{
                      left: `${(sceneLayout.x / MODULE_SCENE_COLUMNS) * 100}%`,
                      top: `${(sceneLayout.y / MODULE_SCENE_ROWS) * 100}%`,
                      width: `${(sceneLayout.w / MODULE_SCENE_COLUMNS) * 100}%`,
                      height: `${(sceneLayout.h / MODULE_SCENE_ROWS) * 100}%`,
                      transform: `rotate(${rotation}deg)`,
                      transformOrigin: "center center",
                      opacity:
                        canvasMode === "output" &&
                        !isSlot &&
                        objectKind !== "text" &&
                        objectKind !== "data" &&
                        objectKind !== "chart"
                          ? 0.78
                          : getFieldSurface(field) === "artboard" &&
                            !fieldInsideModuleFrame
                          ? 0.58
                          : 1,
                      borderRadius: radius,
                      background:
                        objectKind === "line"
                          ? "transparent"
                          : objectKind === "slot"
                          ? canvasMode === "output"
                            ? "#fffdf8"
                            : canvasMode === "semantic"
                            ? "#edf5f8"
                            : "#dcecf3"
                          : objectKind === "data"
                          ? canvasMode === "semantic"
                            ? "#f4f5ef"
                            : "#f6f7f2"
                          : objectKind === "chart"
                          ? canvasMode === "semantic"
                            ? "#f8f3ea"
                            : "#fcf8ef"
                          : fill,
                      border:
                        objectKind === "line"
                          ? "none"
                          : objectKind === "slot"
                          ? canvasMode === "output"
                            ? `1px solid ${stroke || "#78a8bf"}`
                            : `2px dashed ${stroke || "#78a8bf"}`
                          : objectKind === "data"
                          ? `1px solid ${stroke || "#9bb6c2"}`
                          : objectKind === "chart"
                          ? `1px solid ${stroke || "#9bb6c2"}`
                          : `${strokeWidth}px solid ${stroke}`,
                      borderStyle:
                        objectKind === "slot" ||
                        objectKind === "data" ||
                        objectKind === "chart"
                          ? undefined
                          : strokeStyle,
                      boxShadow:
                        objectKind === "slot" ||
                        objectKind === "text" ||
                        objectKind === "data" ||
                        objectKind === "chart"
                          ? "0 10px 24px rgba(16,40,56,0.06)"
                          : "none",
                    }}
                  >
                    {objectKind === "line" ? (
                      <div className="relative h-full w-full">
                        <div
                          className="absolute left-0 top-1/2 w-full -translate-y-1/2 rounded-full"
                          style={{
                            height: `${Math.max(2, strokeWidth)}px`,
                            background:
                              strokeStyle === "dashed"
                                ? `repeating-linear-gradient(90deg, ${stroke} 0 12px, transparent 12px 20px)`
                                : stroke,
                          }}
                        />
                        <div className="absolute left-2 top-2 rounded-full border border-white/10 bg-[#0d1428]/86 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#eef3ff]">
                          {getFieldBadge(field)}
                        </div>
                      </div>
                    ) : objectKind === "rectangle" ||
                      objectKind === "ellipse" ? (
                      <div className="flex h-full items-end justify-between p-3">
                        <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-white/75 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#5f7682]">
                          {getFieldBadge(field)}
                        </div>
                        <div className="rounded-full bg-white/75 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5f7682]">
                          {isSquare ? "Square" : field.label}
                        </div>
                      </div>
                    ) : objectKind === "text" ? (
                      <div className="flex h-full flex-col justify-between p-3">
                        <div className="mb-2 inline-flex w-fit rounded-full border border-white/10 bg-white/75 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#5f7682]">
                          {getFieldBadge(field)}
                        </div>
                        <div
                          className={[
                            "text-[15px] font-semibold text-[#173043]",
                            field.style?.textAlign === "center"
                              ? "text-center"
                              : field.style?.textAlign === "right"
                              ? "text-right"
                              : "text-left",
                          ].join(" ")}
                          style={{ color: fill }}
                        >
                          {field.label}
                        </div>
                        <div className="text-[11px] leading-5 text-[#5c7280]">
                          {field.description ||
                            "Locked template copy lives here."}
                        </div>
                      </div>
                    ) : objectKind === "data" ? (
                      <div className="flex h-full flex-col overflow-hidden p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5f7682]">
                            {getFieldBadge(field)}
                          </div>
                          <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
                            {dataTable.rows.length} rows
                          </div>
                        </div>
                        <div className="mt-2 overflow-hidden rounded-[12px] border border-[#d8ddd1] bg-white">
                          <div
                            className="grid border-b border-[#e6eadf] bg-[#f5f7f0] text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5f7682]"
                            style={{
                              gridTemplateColumns: `repeat(${Math.min(
                                Math.max(dataTable.columns.length, 1),
                                3
                              )}, minmax(0, 1fr))`,
                            }}
                          >
                            {dataTable.columns.slice(0, 3).map((column) => (
                              <div
                                key={column.id}
                                className="truncate border-r border-[#e6eadf] px-2 py-1.5 last:border-r-0"
                              >
                                {column.label}
                              </div>
                            ))}
                          </div>
                          <div className="divide-y divide-[#eef1ea]">
                            {dataTable.rows.length > 0 ? (
                              dataTable.rows.slice(0, 3).map((row, rowIndex) => (
                                <div
                                  key={`${field.id}-row-${rowIndex}`}
                                  className="grid text-[11px] leading-5 text-[#173043]"
                                  style={{
                                    gridTemplateColumns: `repeat(${Math.min(
                                      Math.max(dataTable.columns.length, 1),
                                      3
                                    )}, minmax(0, 1fr))`,
                                  }}
                                >
                                  {row.slice(0, 3).map((cell, cellIndex) => (
                                    <div
                                      key={`${field.id}-cell-${rowIndex}-${cellIndex}`}
                                      className="truncate border-r border-[#eef1ea] px-2 py-1.5 last:border-r-0"
                                    >
                                      {cell || "—"}
                                    </div>
                                  ))}
                                </div>
                              ))
                            ) : (
                              <div className="px-2 py-3 text-[11px] leading-5 text-[#7a8e99]">
                                Paste spreadsheet data to populate this block.
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-[#627987]">
                          <span>{dataTable.columns.length} cols</span>
                          <span>
                            {outgoingConnections.length +
                              incomingConnections.length >
                            0
                              ? `${
                                  outgoingConnections.length +
                                  incomingConnections.length
                                } links`
                              : "No links"}
                          </span>
                        </div>
                      </div>
                    ) : objectKind === "chart" ? (
                      <div className="flex h-full flex-col overflow-hidden p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f6b54]">
                              {getFieldBadge(field)} · {CHART_KIND_LABEL[chartPreview.kind]} chart
                            </div>
                            <div className="mt-1 truncate text-[12px] font-semibold text-[#173043]">
                              {chartSource?.label ?? "Awaiting data"}
                            </div>
                          </div>
                          <div className="text-[10px] uppercase tracking-[0.16em] text-[#927b5e]">
                            {chartPreview.status === "ready"
                              ? chartPreview.kind === "stacked"
                                ? `${chartPreview.stacks.length} stacks`
                                : chartPreview.kind === "waterfall"
                                ? `${chartPreview.waterfall.length} steps`
                                : `${chartPreview.bars.length} bars`
                              : getChartStatusMessage(chartPreview)}
                          </div>
                        </div>
                        <div className="mt-3 flex-1 overflow-hidden rounded-[12px] border border-[#e2d8c7] bg-white/90 px-3 py-3">
                          {chartPreview.status === "ready" ? (
                            <div className="flex h-full flex-col">
                              <div className="flex-1">
                                <div className="h-full rounded-[10px] border border-[#f0e7da] bg-[#fcfaf6] px-3 py-3">
                                  {renderChartGraphic(chartPreview)}
                                </div>
                              </div>
                              <div className="mt-3 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-[#927b5e]">
                                <span>{chartPreview.rowCount} rows</span>
                                <span>
                                  {chartPreview.kind === "stacked"
                                    ? `${chartPreview.seriesLabels.length} series`
                                    : CHART_KIND_LABEL[chartPreview.kind]}
                                </span>
                              </div>
                              {chartPreview.kind === "stacked" &&
                              chartPreview.seriesLabels.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {chartPreview.seriesLabels.map(
                                    (label, seriesIndex) => (
                                      <span
                                        key={`${field.id}-legend-${label}`}
                                        className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#927b5e]"
                                      >
                                        <span
                                          className="inline-block h-2.5 w-2.5 rounded-full"
                                          style={{
                                            background:
                                              CHART_SERIES_COLORS[
                                                seriesIndex %
                                                  CHART_SERIES_COLORS.length
                                              ],
                                          }}
                                        />
                                        {label}
                                      </span>
                                    )
                                  )}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            renderChartGraphic(chartPreview)
                          )}
                        </div>
                        <div className="mt-3 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-[#927b5e]">
                          <span>
                            {chartSource ? `from ${chartSource.label}` : "No source"}
                          </span>
                          <span>
                            {outgoingConnections.length +
                              incomingConnections.length >
                            0
                              ? `${
                                  outgoingConnections.length +
                                  incomingConnections.length
                                } links`
                              : "No links"}
                          </span>
                        </div>
                      </div>
                    ) : canvasMode === "output" ? (
                      <div className="flex h-full flex-col justify-between p-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5f7682]">
                              {field.label}
                            </div>
                            <span className="rounded-full border border-[#cbd9df] bg-white/85 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#5f7682]">
                              {getFieldBadge(field)}
                            </span>
                          </div>
                          <div className="mt-2 text-[13px] font-semibold leading-5 text-[#173043]">
                            {outputPreviewTitle}
                          </div>
                          <div className="mt-2 line-clamp-4 text-[11px] leading-5 text-[#5c7280]">
                            {outputPreviewBody}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-[#627987]">
                          <span>{field.required ? "Must have" : "Optional"}</span>
                          <span>
                            {flowRunFieldOutput
                              ? "Run preview"
                              : field.aiState === "summarize-linked-data"
                              ? "AI + data"
                              : field.aiState === "ai-fill"
                              ? "AI fill"
                              : fieldTone}
                          </span>
                        </div>
                      </div>
                    ) : canvasMode === "semantic" ? (
                      <div className="flex h-full flex-col justify-between p-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-[#102838]">
                              {field.label}
                            </div>
                            <span className="border border-[#cbd9df] bg-white/85 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#5f7682]">
                              {getFieldBadge(field)}
                            </span>
                            <span className="border border-[#cbd9df] bg-white/85 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#5f7682]">
                              {field.aiState === "summarize-linked-data"
                                ? "AI + Data"
                                : field.aiState === "ai-fill"
                                ? "AI Fill"
                                : "Locked"}
                            </span>
                          </div>
                          <div className="mt-2 line-clamp-4 text-[11px] leading-5 text-[#5c7280]">
                            {field.description ||
                              "Describe what this block should do in the template."}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#627987]">
                            {incomingConnections.length +
                              outgoingConnections.length}{" "}
                            links
                          </div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#627987]">
                            {getFieldSurface(field)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full flex-col justify-between p-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold text-[#102838]">
                              {field.label}
                            </div>
                            <span className="rounded-full bg-[#eef3f6] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#5f7682]">
                              {getFieldBadge(field)}
                            </span>
                            {field.groupId ? (
                              <span className="rounded-full bg-[#eef3f6] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#5f7682]">
                                Group
                              </span>
                            ) : null}
                            {getFieldSurface(field) === "pasteboard" ? (
                              <span className="rounded-full bg-[#eef3f6] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#5f7682]">
                                Pasteboard
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 line-clamp-4 text-[11px] leading-5 text-[#5c7280]">
                            {field.description ||
                              "Describe what this block should do in the template."}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <div className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5f7682] shadow-[0_3px_10px_rgba(16,40,56,0.06)]">
                            {fieldTone}
                          </div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#627987]">
                            {isAiText
                              ? field.aiState === "summarize-linked-data"
                                ? "AI + data"
                                : "AI fill"
                              : field.aiState === "summarize-linked-data"
                              ? "AI + data"
                              : field.aiState === "ai-fill"
                              ? "AI fill"
                              : "Locked"}
                          </div>
                        </div>
                      </div>
                    )}
                    {canvasMode === "semantic" && isConnectable ? (
                      <>
                        <span
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onClick={() => completeConnection(field.id)}
                          className={[
                            "absolute left-[-10px] top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-[#173043] bg-[#f7f3eb] text-[10px] font-semibold text-[#173043] shadow-[0_4px_10px_rgba(16,40,56,0.12)]",
                            pendingConnectionSourceId &&
                            pendingConnectionSourceId !== field.id
                              ? "opacity-100"
                              : "opacity-70",
                          ].join(" ")}
                        >
                          +
                        </span>
                        <span
                          onPointerDown={(event) => startConnection(field.id, event)}
                          className={[
                            "absolute right-[-10px] top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-[#173043] bg-[#173043] text-[10px] font-semibold text-white shadow-[0_4px_10px_rgba(16,40,56,0.18)]",
                            pendingConnectionSourceId === field.id
                              ? "scale-110"
                              : "",
                          ].join(" ")}
                        >
                          <Link2 className="h-3 w-3" />
                        </span>
                      </>
                    ) : null}
                    {objectKind !== "line" ? (
                      <span
                        onPointerDown={(event) =>
                          startFieldDrag(event, field.id, "resize")
                        }
                        className="absolute bottom-2 right-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#102838] text-white"
                      >
                        <Plus className="h-3 w-3 rotate-45" />
                      </span>
                    ) : null}
                  </button>
                );
              })}

              {marqueeState ? (
                <div
                  className="pointer-events-none absolute border border-[#69b4ff] bg-[#69b4ff]/12"
                  style={{
                    left: `${Math.min(
                      marqueeState.startX,
                      marqueeState.currentX
                    )}px`,
                    top: `${Math.min(
                      marqueeState.startY,
                      marqueeState.currentY
                    )}px`,
                    width: `${Math.abs(
                      marqueeState.currentX - marqueeState.startX
                    )}px`,
                    height: `${Math.abs(
                      marqueeState.currentY - marqueeState.startY
                    )}px`,
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>

        {isFlowStage ? (
          <ThinkingFlowCanvas
            view={{
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
            }}
            actions={{
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
            }}
          />
        ) : null}

        <TemplateCanvasToolbar
          isActive={!isFlowStage}
          view={{
            selectedField,
            selectedObjectKind,
            isLibraryOpen,
          }}
          actions={{
            setDraft,
            openLibraryModal,
            addCanvasObject,
            handleStageChange,
          }}
        />
      </div>
    </main>
  );
}
