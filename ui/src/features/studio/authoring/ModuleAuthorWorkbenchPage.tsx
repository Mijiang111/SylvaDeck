import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "@/lib/router";
import {
  BLOCK_KIND_PRESETS,
  MODULE_REGISTRY_CATEGORIES,
} from "@/features/studio/config";
import {
  deleteCustomModuleRegistryEntry,
  getAvailableSkillDefinitionById,
  getAvailableModuleSkillPresetsByModuleId,
  getAvailableModuleRegistryEntryById,
  loadAvailableModuleRegistry,
  loadAvailableSkillRegistry,
} from "@/features/studio/registry";
import { runCompositionTestCase } from "@/features/studio/composition-test-runtime";
import { executeModuleRegistryEntryRun } from "@/features/studio/module-execution";
import {
  appendCompositionPublishArtifactRecord,
  appendCompositionTestRunRecord,
  buildPublishedTemplateManifest,
  buildModuleTrustSummary,
  deleteCompositionTestCaseRecord,
  deleteModuleAsset,
  getModuleAssetRecord,
  saveCompositionTestCaseRecord,
  saveModuleAssetEntry,
} from "@/features/studio/module-assets";
import {
  buildModuleRuntimeInput,
  buildReportSourceInput,
} from "@/features/studio/module-runtime-input";
import { consumeModuleAuthoringHandoff } from "@/features/studio/module-authoring-handoff";
import type {
  CompositionPublishArtifact,
  CompositionTestCase,
  CompositionTestRun,
  ModuleAiState,
  ModuleChartKind,
  ModuleCanvasSurface,
  ModuleConnection,
  ModuleRegistryEntry,
  ModuleSkillRequirement,
  ModuleCanvasObjectKind,
  ModuleThinkingFlowBranch,
  ModuleThinkingFlow,
  ModuleThinkingFlowNode,
  ModuleThinkingFlowNodeKind,
  ModuleTemplateField,
  SkillDefinition,
} from "@/features/studio/types";

import {
  applyFieldLayoutPreset,
  ARTBOARD_OFFSET_X,
  ARTBOARD_OFFSET_Y,
  buildModulePreviewBlock,
  canConnectFields,
  clamp,
  clampLayoutToSurface,
  clampWorkspaceOffset,
  cloneEntryForAuthoring,
  createBlankModuleDraft,
  createCanvasObject,
  createEmptyDataTable,
  createDefaultFieldLayout,
  ensureDraftVisibleOnArtboard,
  getCanvasObjectKind,
  getConnectionKindLabel,
  getFieldSurface,
  inferConnectionKind,
  isFieldConnectable,
  getLayoutsBoundingBox,
  getModuleFrameLayout,
  getObjectKindLabel,
  getSceneLayout,
  getViewportPointInScene,
  isBoxInsideArtboard,
  isLayoutInsideModuleFrame,
  MODULE_ARTBOARD_HEIGHT,
  MODULE_ARTBOARD_WIDTH,
  MODULE_CANVAS_COLUMNS,
  MODULE_CANVAS_ROWS,
  MODULE_SCENE_COLUMNS,
  MODULE_SCENE_ROWS,
  MODULE_SCENE_WIDTH,
  MODULE_SCENE_HEIGHT,
  MODULE_UNIT_SIZE,
  normalizeModuleFrameLayout,
  parseDataBlockInput,
  slugify,
  splitLines,
  toLines,
  updateFieldAt,
  withFieldLayouts,
  WORKSPACE_FIT_PADDING_X,
  WORKSPACE_FIT_PADDING_Y,
} from "./helpers";
import type {
  CanvasEditMode,
  CanvasObjectPreset,
  FieldCanvasDragState,
  FieldLayoutPresetId,
  MarqueeSelectionState,
  WorkspacePanState,
} from "./helpers";
import {
  THINKING_FLOW_TOOL_ADAPTERS,
  THINKING_FLOW_TOOL_ADAPTER_IDS,
  THINKING_FLOW_TOOL_ADAPTER_LABEL,
  getThinkingFlowToolConfig,
  normalizeThinkingFlowToolConfig,
} from "./tool-adapters";
import { getThinkingFlowNodeLabel } from "./flow-runtime";
import type {
  ThinkingFlowRunFieldOutput,
  ThinkingFlowRunResult,
  ThinkingFlowRunTraceStep,
} from "./flow-runtime";
import {
  canDefineOutputContract,
  normalizeFieldOutputContract,
} from "./output-contract";
import type {
  AuthoringStage,
  CanvasMode,
  FlowBoardPanState,
  FlowMarqueeSelectionState,
  ModuleFrameInteractionMode,
  ModuleFrameInteractionState,
  StageState,
  ThinkingFlowCanvasNode,
  ThinkingFlowNodeDragState,
  ThinkingFlowNodeState,
} from "./authoring-local-types";
import {
  CHART_KIND_LABEL,
} from "./authoring-constants";
import {
  buildOrthogonalConnectionPath,
  getConnectionStroke,
  isAiEditableField,
} from "./authoring-canvas-utils";
import { deriveChartPreview } from "./chart-preview";
import {
  areThinkingFlowsEqual,
  buildThinkingFlowEdgePath,
  canConnectThinkingFlowNodes,
  clampFlowViewportOffset,
  clampThinkingFlowNode,
  createThinkingFlowNode,
  FLOW_NODE_PORT_OFFSET,
  FLOW_VIEWPORT_PADDING,
  getFlowFitState,
  getNextThinkingFlowBranchForSource,
  getThinkingFlowBranchLabel,
  getThinkingFlowBranchTone,
  getThinkingFlowHandlePoint,
  getThinkingFlowNodeDisplayLabel,
  getThinkingFlowNodeIcon,
  getThinkingFlowNodeTheme,
  normalizeThinkingFlowEdges,
  syncThinkingFlowWithLayout,
  THINKING_FLOW_BOARD_HEIGHT,
  THINKING_FLOW_BOARD_WIDTH,
} from "./thinking-flow-model";
import { TemplateLibraryModal } from "./TemplateLibraryModal";
import {
  AuthoringStageRail,
  ComposeStagePanel,
  DefineStagePanel,
  PublishStagePanel,
  SemanticsStagePanel,
  TestStagePanel,
} from "./panels";
import { TemplateCanvasStage } from "./canvas";
import { useTemplateLibraryController } from "./useTemplateLibraryController";

export function ModuleAuthorWorkbenchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ moduleId?: string }>();
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const workspaceViewportRef = useRef<HTMLDivElement | null>(null);
  const thinkingFlowViewportRef = useRef<HTMLDivElement | null>(null);
  const thinkingFlowBoardRef = useRef<HTMLDivElement | null>(null);
  const [availableModules, setAvailableModules] = useState<
    ModuleRegistryEntry[]
  >(() => loadAvailableModuleRegistry());
  const [availableSkills, setAvailableSkills] = useState<SkillDefinition[]>(
    () => loadAvailableSkillRegistry()
  );
  const [draft, setDraft] = useState<ModuleRegistryEntry>(() =>
    createBlankModuleDraft()
  );
  const [status, setStatus] = useState("");
  const {
    isOpen: isLibraryOpen,
    searchQuery,
    selectedCollection,
    filteredModules,
    recentModules,
    recommendedBaseModules,
    setSearchQuery,
    setSelectedCollection,
    open: openTemplateLibrary,
    close: closeTemplateLibrary,
    markRecent: markTemplateRecent,
  } = useTemplateLibraryController({ availableModules, draft });
  const [moduleFrameInteractionState, setModuleFrameInteractionState] =
    useState<ModuleFrameInteractionState | null>(null);
  const [activeStage, setActiveStage] = useState<AuthoringStage>("define");
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("visual");
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [selectedFlowNodeIds, setSelectedFlowNodeIds] = useState<string[]>([]);
  const [copiedFields, setCopiedFields] = useState<ModuleTemplateField[]>([]);
  const [dragState, setDragState] = useState<FieldCanvasDragState | null>(null);
  const [workspaceScale, setWorkspaceScale] = useState(1);
  const [workspaceOffset, setWorkspaceOffset] = useState({ x: 0, y: 0 });
  const [panState, setPanState] = useState<WorkspacePanState | null>(null);
  const [marqueeState, setMarqueeState] =
    useState<MarqueeSelectionState | null>(null);
  const [pendingConnectionSourceId, setPendingConnectionSourceId] = useState<
    string | null
  >(null);
  const [connectionPreviewPoint, setConnectionPreviewPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [selectedFlowNodeId, setSelectedFlowNodeId] = useState<string | null>(
    null
  );
  const [flowInteractionMode, setFlowInteractionMode] = useState<
    "select" | "pan"
  >("select");
  const [flowViewportScale, setFlowViewportScale] = useState(1);
  const [flowViewportOffset, setFlowViewportOffset] = useState({
    x: FLOW_VIEWPORT_PADDING,
    y: FLOW_VIEWPORT_PADDING,
  });
  const [flowPanState, setFlowPanState] = useState<FlowBoardPanState | null>(
    null
  );
  const [flowMarqueeState, setFlowMarqueeState] =
    useState<FlowMarqueeSelectionState | null>(null);
  const [flowNodeDragState, setFlowNodeDragState] =
    useState<ThinkingFlowNodeDragState | null>(null);
  const [pendingFlowEdgeSourceId, setPendingFlowEdgeSourceId] = useState<
    string | null
  >(null);
  const [flowEdgePreviewPoint, setFlowEdgePreviewPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [flowRunBrief, setFlowRunBrief] = useState("");
  const [flowRunResult, setFlowRunResult] =
    useState<ThinkingFlowRunResult | null>(null);
  const [savedTestCases, setSavedTestCases] = useState<CompositionTestCase[]>([]);
  const [savedTestRuns, setSavedTestRuns] = useState<CompositionTestRun[]>([]);
  const [selectedSavedTestCaseId, setSelectedSavedTestCaseId] = useState<string | null>(
    null
  );
  const [publishVersionNote, setPublishVersionNote] = useState("");
  const openedDraftIdRef = useRef<string | null>(null);
  const fittedFlowDraftIdRef = useRef<string | null>(null);

  function loadDraftEvidence(moduleId: string) {
    const asset = getModuleAssetRecord(moduleId);
    setSavedTestCases(asset?.testCases ?? []);
    setSavedTestRuns(asset?.testRuns ?? []);
    setSelectedSavedTestCaseId(asset?.testCases[0]?.id ?? null);
  }

  function openAuthoringDraft(
    nextDraft: ModuleRegistryEntry,
    nextStatus: string,
    nextStage?: AuthoringStage
  ) {
    const visibleDraft = ensureDraftVisibleOnArtboard(nextDraft);
    setDraft(visibleDraft);
    setFlowRunBrief("");
    setFlowRunResult(null);
    fittedFlowDraftIdRef.current = null;
    setSelectedFlowNodeId(null);
    setSelectedFlowNodeIds([]);
    setSelectedFieldIds(visibleDraft.fields[0] ? [visibleDraft.fields[0].id] : []);
    if (nextStage) {
      setActiveStage(nextStage);
    }
    loadDraftEvidence(visibleDraft.id);
    setStatus(nextStatus);
    requestAnimationFrame(() => fitWorkspaceToView());
  }

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const sourceId = searchParams.get("from");
    const extractToken = searchParams.get("extract");
    const requestedStage = searchParams.get("stage");
    const routeModuleId = params.moduleId ?? "";

    const normalizedStage =
      requestedStage === "define" ||
      requestedStage === "compose" ||
      requestedStage === "semantics" ||
      requestedStage === "test" ||
      requestedStage === "publish"
        ? requestedStage
        : undefined;

    if (routeModuleId) {
      const source = getAvailableModuleRegistryEntryById(routeModuleId);
      if (!source) {
        return;
      }

      openAuthoringDraft(
        cloneEntryForAuthoring(source),
        `Opened ${source.label} for editing.`,
        normalizedStage
      );
      return;
    }

    if (extractToken) {
      const handoff = consumeModuleAuthoringHandoff(extractToken);
      if (handoff) {
        openAuthoringDraft(
          handoff.draft,
          handoff.sourceLabel,
          normalizedStage ?? handoff.preferredStage
        );
        return;
      }
    }

    if (!sourceId) {
      loadDraftEvidence(draft.id);
      return;
    }

    const source = loadAvailableModuleRegistry().find(
      (entry) => entry.id === sourceId
    );
    if (!source) {
      return;
    }

    openAuthoringDraft(
      cloneEntryForAuthoring(source),
      `Opened ${source.label} as an editable draft.`,
      normalizedStage
    );
  }, [location.search, params.moduleId]);

  useEffect(() => {
    setDraft((current) => {
      const nextFields = withFieldLayouts(current.fields, current.kind);
      const changed = nextFields.some(
        (field, index) => field.layout !== current.fields[index]?.layout
      );
      if (!changed) {
        return current;
      }
      return {
        ...current,
        fields: nextFields,
      };
    });
  }, [draft.kind]);

  useEffect(() => {
    if (draft.fields.length === 0) {
      setSelectedFieldIds([]);
      return;
    }
    setSelectedFieldIds((current) =>
      current.filter((id) => draft.fields.some((field) => field.id === id))
    );
  }, [draft.fields]);

  useEffect(() => {
    if (!draft.fields.length) {
      openedDraftIdRef.current = draft.id;
      fittedFlowDraftIdRef.current = null;
      return;
    }

    if (openedDraftIdRef.current !== draft.id) {
      openedDraftIdRef.current = draft.id;
      fittedFlowDraftIdRef.current = null;
      setSelectedFieldIds([draft.fields[0].id]);
    }
  }, [draft.id, draft.fields]);

  useEffect(() => {
    loadDraftEvidence(draft.id);
  }, [draft.id]);

  const currentRendererDetail = useMemo(
    () => BLOCK_KIND_PRESETS[draft.kind],
    [draft.kind]
  );
  const relatedPresets = useMemo(
    () => getAvailableModuleSkillPresetsByModuleId(draft.id),
    [draft.id]
  );
  const selectedFields = draft.fields.filter((field) =>
    selectedFieldIds.includes(field.id)
  );
  const selectedField = selectedFields[0] ?? null;
  const selectedFieldCount = selectedFieldIds.length;
  const selectedGroupId =
    selectedFields.length > 0 &&
    selectedFields.every(
      (field) => field.groupId === selectedFields[0]?.groupId
    )
      ? selectedFields[0]?.groupId
      : undefined;
  const selectedObjectKind = selectedField
    ? getCanvasObjectKind(selectedField)
    : null;
  const selectedOutputField =
    selectedField && canDefineOutputContract(selectedField)
      ? selectedField
      : null;
  const fieldById = useMemo(
    () => new Map(draft.fields.map((field) => [field.id, field])),
    [draft.fields]
  );
  const dataFields = draft.fields.filter(
    (field) => getCanvasObjectKind(field) === "data"
  );
  const chartFields = draft.fields.filter(
    (field) => getCanvasObjectKind(field) === "chart"
  );
  const connectableFields = draft.fields.filter(isFieldConnectable);
  const aiEditableFields = draft.fields.filter(isAiEditableField);
  const validFieldIds = useMemo(
    () => new Set(draft.fields.map((field) => field.id)),
    [draft.fields]
  );
  const connections = useMemo(() => {
    return (draft.connections ?? []).filter((connection, index, collection) => {
      const sourceField = fieldById.get(connection.sourceFieldId);
      const targetField = fieldById.get(connection.targetFieldId);
      return (
        validFieldIds.has(connection.sourceFieldId) &&
        validFieldIds.has(connection.targetFieldId) &&
        connection.sourceFieldId !== connection.targetFieldId &&
        Boolean(sourceField) &&
        Boolean(targetField) &&
        canConnectFields(sourceField!, targetField!) &&
        collection.findIndex(
          (candidate) =>
            candidate.sourceFieldId === connection.sourceFieldId &&
            candidate.targetFieldId === connection.targetFieldId
        ) === index
      );
    });
  }, [draft.fields, draft.connections, fieldById, validFieldIds]);
  const selectedDataField =
    selectedField && selectedObjectKind === "data" ? selectedField : null;
  const selectedChartField =
    selectedField && selectedObjectKind === "chart" ? selectedField : null;
  const selectedConnections = selectedField
    ? connections.filter(
        (connection) =>
          connection.sourceFieldId === selectedField.id ||
          connection.targetFieldId === selectedField.id
      )
    : [];
  const artboardFields = draft.fields.filter(
    (field) => getFieldSurface(field) === "artboard"
  );
  const pasteboardFields = draft.fields.filter(
    (field) => getFieldSurface(field) === "pasteboard"
  );
  const moduleFrame = useMemo(() => getModuleFrameLayout(draft), [draft]);
  const isModuleFrameInteracting = Boolean(moduleFrameInteractionState);
  const artboardFieldLayouts = artboardFields.map((field, index) => ({
    field,
    layout:
      field.layout ??
      createDefaultFieldLayout(
        draft.kind,
        index,
        Math.max(artboardFields.length, 1)
      ),
  }));
  const frameContainedFields = artboardFieldLayouts.filter(({ layout }) =>
    isLayoutInsideModuleFrame(layout, moduleFrame)
  );
  const frameOutsideFields = artboardFieldLayouts.filter(
    ({ layout }) => !isLayoutInsideModuleFrame(layout, moduleFrame)
  );
  const sceneFieldLayouts = new Map(
    draft.fields.map((field, index) => {
      const fallback = createDefaultFieldLayout(
        draft.kind,
        index,
        Math.max(draft.fields.length, 1)
      );
      return [field.id, getSceneLayout(field, fallback)];
    })
  );
  const chartSourceByFieldId = useMemo(
    () =>
      new Map(
        chartFields.map((field) => {
          const sourceConnection = connections.find(
            (connection) =>
              connection.kind === "data-flow" &&
              connection.targetFieldId === field.id &&
              getCanvasObjectKind(fieldById.get(connection.sourceFieldId)!) ===
                "data"
          );
          return [
            field.id,
            sourceConnection
              ? fieldById.get(sourceConnection.sourceFieldId) ?? null
              : null,
          ] as const;
        })
      ),
    [chartFields, connections, fieldById]
  );
  const chartPreviewByFieldId = useMemo(
    () =>
      new Map(
        chartFields.map((field) => [
          field.id,
          deriveChartPreview(field, chartSourceByFieldId.get(field.id)),
        ])
      ),
    [chartFields, chartSourceByFieldId]
  );
  const connectionRenderItems = connections
    .map((connection, index) => {
      const sourceLayout = sceneFieldLayouts.get(connection.sourceFieldId);
      const targetLayout = sceneFieldLayouts.get(connection.targetFieldId);
      const sourceField = fieldById.get(connection.sourceFieldId);
      const targetField = fieldById.get(connection.targetFieldId);
      if (!sourceLayout || !targetLayout || !sourceField || !targetField) {
        return null;
      }

      const startX = (sourceLayout.x + sourceLayout.w) * MODULE_UNIT_SIZE;
      const startY =
        (sourceLayout.y + Math.max(4, sourceLayout.h / 2)) * MODULE_UNIT_SIZE;
      const endX = targetLayout.x * MODULE_UNIT_SIZE;
      const endY =
        (targetLayout.y + Math.max(4, targetLayout.h / 2)) * MODULE_UNIT_SIZE;
      return {
        connection,
        sourceField,
        targetField,
        label: getConnectionKindLabel(connection.kind),
        stroke: getConnectionStroke(connection.kind),
        path: buildOrthogonalConnectionPath(
          startX,
          startY,
          endX,
          endY,
          index % 4
        ),
      };
    })
    .filter(
      (
        item
      ): item is {
        connection: ModuleConnection;
        sourceField: ModuleTemplateField;
        targetField: ModuleTemplateField;
        label: string;
        stroke: string;
        path: string;
      } => Boolean(item)
    );
  const pendingConnectionRender =
    pendingConnectionSourceId && connectionPreviewPoint
      ? (() => {
          const sourceLayout = sceneFieldLayouts.get(pendingConnectionSourceId);
          if (!sourceLayout) {
            return null;
          }
          const startX = (sourceLayout.x + sourceLayout.w) * MODULE_UNIT_SIZE;
          const startY =
            (sourceLayout.y + Math.max(4, sourceLayout.h / 2)) *
            MODULE_UNIT_SIZE;
          const endX = connectionPreviewPoint.x;
          const endY = connectionPreviewPoint.y;
          return buildOrthogonalConnectionPath(startX, startY, endX, endY);
        })()
      : null;
  const incompleteAiBlocks = aiEditableFields.filter(
    (field) => !field.label.trim() || !field.description.trim()
  );
  const orphanDataFields = dataFields.filter(
    (field) =>
      !connections.some(
        (connection) =>
          connection.sourceFieldId === field.id ||
          connection.targetFieldId === field.id
      )
  );
  const orphanChartFields = chartFields.filter(
    (field) =>
      !connections.some(
        (connection) =>
          connection.kind === "data-flow" &&
          connection.targetFieldId === field.id
      )
  );
  const invalidChartFields = chartFields.filter((field) => {
    const preview = chartPreviewByFieldId.get(field.id);
    return Boolean(
      preview && preview.status !== "ready" && preview.status !== "needs-data"
    );
  });
  const flowOutputFields = draft.fields.filter((field) => {
    const objectKind = getCanvasObjectKind(field);
    return isAiEditableField(field) || objectKind === "chart";
  });
  useEffect(() => {
    setDraft((current) => {
      const currentOutputFields = current.fields.filter((field) => {
        const objectKind = getCanvasObjectKind(field);
        return isAiEditableField(field) || objectKind === "chart";
      });
      const nextFlow = syncThinkingFlowWithLayout(
        current.thinkingFlow,
        currentOutputFields,
        current.promptHint,
        current.semanticRole,
        current.fields.filter((field) => getCanvasObjectKind(field) === "data")
          .length,
        current.fields.filter((field) => getCanvasObjectKind(field) === "chart")
          .length
      );
      const previousFlow = current.thinkingFlow ?? { nodes: [], edges: [] };
      if (areThinkingFlowsEqual(previousFlow, nextFlow)) {
        return current;
      }
      return {
        ...current,
        thinkingFlow: nextFlow,
      };
    });
  }, [draft.fields, draft.promptHint, draft.semanticRole]);
  const storedThinkingFlow = draft.thinkingFlow ?? { nodes: [], edges: [] };
  const thinkingFlowNodes = useMemo(
    () =>
      storedThinkingFlow.nodes.map((node) => {
        let state: ThinkingFlowNodeState = "ready";
        if (node.kind === "brief") {
          state = draft.promptHint.trim() ? "ready" : "warning";
        } else if (node.kind === "think") {
          state = draft.semanticRole.trim() ? "ready" : "warning";
        } else if (node.kind === "tool") {
          state = dataFields.length > 0 ? "ready" : "idle";
        } else if (node.kind === "calc") {
          state = chartFields.length > 0 ? "ready" : "idle";
        } else if (node.kind === "output" && node.fieldId) {
          const field = fieldById.get(node.fieldId);
          const objectKind = field ? getCanvasObjectKind(field) : "slot";
          const preview =
            field && objectKind === "chart"
              ? chartPreviewByFieldId.get(node.fieldId)
              : undefined;
          state =
            objectKind === "chart"
              ? preview?.status === "ready"
                ? "ready"
                : "warning"
              : field?.label.trim() && field.description.trim()
              ? "ready"
              : "warning";
        }

        return {
          ...node,
          state,
          locked: node.kind === "start" || node.kind === "output",
          movable: true,
        } satisfies ThinkingFlowCanvasNode;
      }),
    [
      chartFields.length,
      chartPreviewByFieldId,
      dataFields.length,
      draft.promptHint,
      draft.semanticRole,
      fieldById,
      storedThinkingFlow.nodes,
    ]
  );
  const thinkingFlowNodeById = useMemo(
    () => new Map(thinkingFlowNodes.map((node) => [node.id, node])),
    [thinkingFlowNodes]
  );
  const thinkingFlowEdges = useMemo(() => {
    return normalizeThinkingFlowEdges(
      storedThinkingFlow.edges,
      thinkingFlowNodeById,
      new Set(thinkingFlowNodes.map((node) => node.id))
    );
  }, [storedThinkingFlow.edges, thinkingFlowNodeById, thinkingFlowNodes]);
  const flowOutputNodes = thinkingFlowNodes.filter(
    (node) => node.kind === "output"
  );
  const incompleteIfNodes = thinkingFlowNodes.filter(
    (node) =>
      node.kind === "if" &&
      thinkingFlowEdges.filter((edge) => edge.sourceNodeId === node.id).length <
        2
  );
  const missingFlowOutputLinks = flowOutputNodes.filter(
    (node) => !thinkingFlowEdges.some((edge) => edge.targetNodeId === node.id)
  );
  const modulePalette = Array.from(
    new Set(
      draft.fields.flatMap((field) =>
        [field.style?.fill, field.style?.stroke].filter(
          (value): value is string => Boolean(value)
        )
      )
    )
  ).slice(0, 8);
  const defineReady = Boolean(
    draft.label.trim() &&
      draft.semanticRole.trim() &&
      draft.promptHint.trim() &&
      moduleFrame.w >= 8 &&
      moduleFrame.h >= 8
  );
  const composeReady = artboardFields.length > 0;
  const colorReady = modulePalette.length >= 2;
  const publishedTemplatePreview = useMemo(
    () => buildPublishedTemplateManifest(draft),
    [draft]
  );
  const hasSemanticSlots = publishedTemplatePreview.slotManifest.length > 0;
  const hasAiTextSlot = publishedTemplatePreview.slotManifest.some(
    (slot) => slot.slotKind === "ai-text"
  );
  const requiresAiTextSlot = publishedTemplatePreview.shape !== "module-fragment";
  const trustSummary = buildModuleTrustSummary({
    moduleId: draft.id,
    entry: draft,
    testCases: savedTestCases,
    testRuns: savedTestRuns,
    publishArtifacts: getModuleAssetRecord(draft.id)?.publishArtifacts ?? [],
    publishedManifest: getModuleAssetRecord(draft.id)?.publishedManifest ?? null,
    updatedAt: new Date().toISOString(),
  });
  const latestSavedTestRun = savedTestRuns[0] ?? null;
  const testEvidenceReady =
    savedTestCases.length > 0 && Boolean(trustSummary.hasPassingEvidence);
  const connectReady =
    incompleteAiBlocks.length === 0 &&
    orphanDataFields.length === 0 &&
    orphanChartFields.length === 0 &&
    invalidChartFields.length === 0 &&
    missingFlowOutputLinks.length === 0 &&
    incompleteIfNodes.length === 0;
  const publishReady =
    defineReady &&
    composeReady &&
    hasSemanticSlots &&
    (!requiresAiTextSlot || hasAiTextSlot) &&
    connectReady &&
    colorReady &&
    testEvidenceReady;
  const publishChecklist = [
    {
      label: "Capability identity",
      done: Boolean(draft.label.trim() && draft.id.trim() && draft.kind),
      detail: "Name, id, and renderer are set.",
    },
    {
      label: "Capability contract",
      done: defineReady,
      detail: "Semantic role and prompt hint explain the job of the template.",
    },
    {
      label: "Template boundary",
      done: frameOutsideFields.length === 0,
      detail: "Artboard objects sit inside the reusable template boundary.",
    },
    {
      label: "Composable structure",
      done: composeReady,
      detail: "At least one object is placed on the artboard.",
    },
    {
      label: "Semantic slots",
      done: hasSemanticSlots && (!requiresAiTextSlot || hasAiTextSlot),
      detail:
        hasSemanticSlots && (!requiresAiTextSlot || hasAiTextSlot)
          ? "The template exposes clear AI text or chart slots for downstream rendering."
          : requiresAiTextSlot
          ? "Add at least one AI Text slot inside the template frame before publishing."
          : "Add at least one semantic slot before publishing this template.",
    },
    {
      label: "Advanced logic",
      done: connectReady,
      detail: "Flow and data connections are in a runnable state when you choose to wire advanced logic.",
    },
    {
      label: "Reusable visual system",
      done: colorReady,
      detail: "Semantic tones are present beyond a single flat color.",
    },
    {
      label: "Verification evidence",
      done: testEvidenceReady,
      detail:
        savedTestCases.length === 0
          ? "Save at least one test case for this template."
          : trustSummary.hasPassingEvidence
          ? "A saved test case has at least one passing run."
          : "Run and save a passing composition test before publishing.",
    },
  ] satisfies Array<{
    label: string;
    done: boolean;
    detail: string;
  }>;
  const stageItems = [
    {
      id: "define" as const,
      label: "Define",
      description: "Set the page template purpose, boundary, and author guidance",
      compactDescription: "Define template",
      state:
        activeStage === "define"
          ? "active"
          : defineReady
          ? "complete"
          : "warning",
    },
    {
      id: "compose" as const,
      label: "Compose",
      description: "Place AI text slots, locked text, data, charts, shapes, and lines",
      compactDescription: "Compose template",
      state:
        activeStage === "compose"
          ? "active"
          : composeReady
          ? "complete"
          : "idle",
    },
    {
      id: "semantics" as const,
      label: "Semantics",
      description: "Wire advanced logic, data links, and slot behavior when the template needs it",
      compactDescription: "Advanced logic",
      state:
        activeStage === "semantics"
          ? "active"
          : connectReady
          ? "complete"
          : "warning",
    },
    {
      id: "test" as const,
      label: "Test",
      description: "Check palette, slot clarity, and sample output behavior",
      compactDescription: "Test template",
      state:
        activeStage === "test"
          ? "active"
          : colorReady
          ? "complete"
          : composeReady
          ? "warning"
          : "idle",
    },
    {
      id: "publish" as const,
      label: "Publish",
      description: "Verify semantic slots and release trusted templates into reuse",
      compactDescription: "Release template",
      state:
        activeStage === "publish"
          ? "active"
          : publishReady
          ? "complete"
          : "warning",
    },
  ] satisfies Array<{
    id: AuthoringStage;
    label: string;
    description: string;
    compactDescription: string;
    state: StageState;
  }>;
  const activeStageMeta =
    stageItems.find((item) => item.id === activeStage) ?? stageItems[0];
  const completedStageCount = stageItems.filter(
    (item) => item.state === "complete"
  ).length;
  const activeStageIndex = stageItems.findIndex(
    (item) => item.id === activeStage
  );
  const nextSuggestedStage =
    stageItems.find(
      (item) => item.state === "warning" || item.state === "idle"
    ) ?? stageItems[stageItems.length - 1];
  const isFlowStage = activeStage === "semantics";
  const selectedFlowNodes = thinkingFlowNodes.filter((node) =>
    selectedFlowNodeIds.includes(node.id)
  );
  const selectedFlowNodeIdSet = new Set(selectedFlowNodeIds);
  const selectedFlowNode = selectedFlowNodeId
    ? thinkingFlowNodeById.get(selectedFlowNodeId) ?? null
    : selectedFlowNodes[0] ?? null;
  const selectedFlowField = selectedFlowNode?.fieldId
    ? draft.fields.find((field) => field.id === selectedFlowNode.fieldId) ??
      null
    : null;
  const selectedFlowNodeTheme = selectedFlowNode
    ? getThinkingFlowNodeTheme(selectedFlowNode)
    : null;
  const selectedFlowToolConfig =
    selectedFlowNode && selectedFlowNode.kind === "tool"
      ? getThinkingFlowToolConfig(selectedFlowNode)
      : null;
  const SelectedFlowNodeIcon = selectedFlowNode
    ? getThinkingFlowNodeIcon(selectedFlowNode.kind)
    : null;
  const removableSelectedFlowNodes = selectedFlowNodes.filter(
    (node) => !node.locked
  );
  const flowRunOutputEntries = flowRunResult
    ? Object.entries(flowRunResult.fieldOutputs)
        .map(([fieldId, output]) => ({
          fieldId,
          field: fieldById.get(fieldId) ?? null,
          output,
        }))
        .filter(
          (
            item
          ): item is {
            fieldId: string;
            field: ModuleTemplateField;
            output: ThinkingFlowRunFieldOutput;
          } => Boolean(item.field)
        )
    : [];
  const flowRunTraceSteps = flowRunResult?.steps ?? [];
  const selectedSavedTestCase =
    savedTestCases.find((testCase) => testCase.id === selectedSavedTestCaseId) ??
    savedTestCases[0] ??
    null;



  const handleStageChange = useCallback((nextStage: AuthoringStage) => {
    setActiveStage(nextStage);
    if (nextStage !== "define") {
      setModuleFrameInteractionState(null);
    }
    if (nextStage !== "semantics") {
      setPendingConnectionSourceId(null);
      setConnectionPreviewPoint(null);
      setPendingFlowEdgeSourceId(null);
      setFlowEdgePreviewPoint(null);
      setFlowNodeDragState(null);
    }

    if (nextStage === "define") {
      setCanvasMode("visual");
      return;
    }

    if (nextStage === "compose") {
      setCanvasMode("visual");
      return;
    }

    if (nextStage === "semantics") {
      setCanvasMode("semantic");
      return;
    }

    if (nextStage === "test") {
      setCanvasMode("visual");
      return;
    }

    setCanvasMode("visual");
  }, []);

  function refreshModules(nextDraft?: ModuleRegistryEntry) {
    setAvailableModules(loadAvailableModuleRegistry());
    setAvailableSkills(loadAvailableSkillRegistry());
    if (nextDraft) {
      setDraft(nextDraft);
    }
  }

  function getArtboardPoint(clientX: number, clientY: number) {
    if (!canvasRef.current) {
      return null;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const x = clamp(
      Math.round(((clientX - rect.left) / rect.width) * MODULE_CANVAS_COLUMNS),
      0,
      MODULE_CANVAS_COLUMNS
    );
    const y = clamp(
      Math.round(((clientY - rect.top) / rect.height) * MODULE_CANVAS_ROWS),
      0,
      MODULE_CANVAS_ROWS
    );

    return { x, y };
  }

  function updateDraftFieldById(
    fieldId: string,
    updater: (field: ModuleTemplateField) => ModuleTemplateField
  ) {
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.id === fieldId ? updater(field) : field
      ),
    }));
  }

  function updateFieldOutputContract(
    fieldId: string,
    updater: (
      contract: NonNullable<ModuleTemplateField["outputContract"]>
    ) => NonNullable<ModuleTemplateField["outputContract"]>
  ) {
    updateDraftFieldById(fieldId, (field) => ({
      ...field,
      outputContract: normalizeFieldOutputContract(
        updater(field.outputContract ?? {})
      ),
    }));
  }

  function updateThinkingFlow(
    updater: (flow: ModuleThinkingFlow) => ModuleThinkingFlow
  ) {
    setDraft((current) => {
      const baseFlow = current.thinkingFlow ?? { nodes: [], edges: [] };
      return {
        ...current,
        thinkingFlow: updater(baseFlow),
      };
    });
  }

  function updateThinkingFlowNode(
    nodeId: string,
    updater: (node: ModuleThinkingFlowNode) => ModuleThinkingFlowNode
  ) {
    updateThinkingFlow((flow) => ({
      ...flow,
      nodes: flow.nodes.map((node) =>
        node.id === nodeId ? clampThinkingFlowNode(updater(node)) : node
      ),
    }));
  }

  function getThinkingFlowPoint(clientX: number, clientY: number) {
    const board = thinkingFlowBoardRef.current;
    if (!board) {
      return null;
    }

    const rect = board.getBoundingClientRect();
    return {
      x: clamp(
        Math.round(
          ((clientX - rect.left) / rect.width) * THINKING_FLOW_BOARD_WIDTH
        ),
        0,
        THINKING_FLOW_BOARD_WIDTH
      ),
      y: clamp(
        Math.round(
          ((clientY - rect.top) / rect.height) * THINKING_FLOW_BOARD_HEIGHT
        ),
        0,
        THINKING_FLOW_BOARD_HEIGHT
      ),
    };
  }

  const handleFieldSelection = useCallback((fieldId: string, additive: boolean) => {
    setSelectedFieldIds((current) => {
      if (!additive) {
        return [fieldId];
      }
      return current.includes(fieldId)
        ? current.filter((id) => id !== fieldId)
        : [...current, fieldId];
    });

    const nextField = draft.fields.find((field) => field.id === fieldId);
    if (nextField && activeStage === "semantics" && canvasMode === "visual") {
      setCanvasMode("semantic");
    }
  }, [draft.fields, activeStage, canvasMode]);

  const fitFlowBoardToView = useCallback(() => {
    const viewport = thinkingFlowViewportRef.current;
    if (!viewport) {
      return;
    }

    const next = getFlowFitState(viewport.clientWidth, viewport.clientHeight);
    setFlowViewportScale(next.scale);
    setFlowViewportOffset(next.offset);
  }, []);

  const zoomFlowBoard = useCallback((nextScale: number) => {
    const viewport = thinkingFlowViewportRef.current;
    if (!viewport) {
      setFlowViewportScale(clamp(nextScale, 0.55, 1.8));
      return;
    }

    const clampedScale = clamp(nextScale, 0.55, 1.8);
    setFlowViewportScale(clampedScale);
    setFlowViewportOffset((current) =>
      clampFlowViewportOffset(
        current,
        viewport.clientWidth,
        viewport.clientHeight,
        clampedScale
      )
    );
  }, []);

  const selectThinkingFlowNode = useCallback((nodeId: string, additive = false) => {
    const node = thinkingFlowNodeById.get(nodeId);
    if (!node) {
      return;
    }

    const nextIds = !additive
      ? [nodeId]
      : selectedFlowNodeIds.includes(nodeId)
      ? selectedFlowNodeIds.filter((candidate) => candidate !== nodeId)
      : [...selectedFlowNodeIds, nodeId];
    setSelectedFlowNodeIds(nextIds);
    setSelectedFlowNodeId(
      nextIds.includes(nodeId) ? nodeId : nextIds[0] ?? null
    );
    if (!additive && node.fieldId) {
      handleFieldSelection(node.fieldId, false);
    } else {
      setSelectedFieldIds([]);
    }
  }, [thinkingFlowNodeById, selectedFlowNodeIds, handleFieldSelection]);

  const addThinkingFlowNode = useCallback((
    kind: Exclude<ModuleThinkingFlowNodeKind, "start" | "output">
  ) => {
    const existingCount = thinkingFlowNodes.filter(
      (node) => node.kind === kind
    ).length;
    const nextNode = createThinkingFlowNode(kind, existingCount);
    updateThinkingFlow((flow) => ({
      ...flow,
      nodes: [...flow.nodes, nextNode],
    }));
    setSelectedFlowNodeIds([nextNode.id]);
    setSelectedFlowNodeId(nextNode.id);
    setSelectedFieldIds([]);
    setStatus(`${getThinkingFlowNodeLabel(kind)} added to the flow.`);
  }, [thinkingFlowNodes]);

  function runThinkingFlowPreview() {
    const previewBlock = buildModulePreviewBlock(draft);
    const runtimeInput = buildModuleRuntimeInput({
      block: previewBlock,
      entry: draft,
      reportSource: buildReportSourceInput({
        sourceText: flowRunBrief,
      }),
    });
    const executedPreview = executeModuleRegistryEntryRun({
      block: previewBlock,
      entry: draft,
      runtimeInput,
    });
    if (!executedPreview) {
      setFlowRunResult(null);
      setStatus(
        "Connect Start to at least one output before running the flow."
      );
      return;
    }
    const result = executedPreview.run;
    setFlowRunResult(result);
    setCanvasMode("output");
    setStatus(
      `Preview ran across ${result.steps.length} steps and ${
        Object.keys(result.fieldOutputs).length
      } outputs.`
    );
  }

  function clearThinkingFlowPreview() {
    setFlowRunResult(null);
    setCanvasMode("visual");
    setStatus("Cleared flow preview.");
  }

  function removeThinkingFlowNode(nodeId: string) {
    const node = thinkingFlowNodeById.get(nodeId);
    if (!node || node.locked) {
      return;
    }

    updateThinkingFlow((flow) => ({
      nodes: flow.nodes.filter((candidate) => candidate.id !== nodeId),
      edges: flow.edges.filter(
        (edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId
      ),
    }));
    setSelectedFlowNodeIds(["flow-start"]);
    setSelectedFlowNodeId("flow-start");
    setStatus(`${node.label} removed from the flow.`);
  }

  function removeSelectedThinkingFlowNodes() {
    if (removableSelectedFlowNodes.length === 0) {
      return;
    }

    const removableIds = new Set(
      removableSelectedFlowNodes.map((node) => node.id)
    );
    updateThinkingFlow((flow) => ({
      nodes: flow.nodes.filter((node) => !removableIds.has(node.id)),
      edges: flow.edges.filter(
        (edge) =>
          !removableIds.has(edge.sourceNodeId) &&
          !removableIds.has(edge.targetNodeId)
      ),
    }));
    setSelectedFlowNodeIds(["flow-start"]);
    setSelectedFlowNodeId("flow-start");
    setStatus(`Removed ${removableSelectedFlowNodes.length} flow nodes.`);
  }

  const startThinkingFlowDrag = useCallback((
    nodeId: string,
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (flowInteractionMode === "pan") {
      setFlowPanState({
        startX: event.clientX,
        startY: event.clientY,
        initialX: flowViewportOffset.x,
        initialY: flowViewportOffset.y,
      });
      return;
    }
    const node = thinkingFlowNodeById.get(nodeId);
    const point = getThinkingFlowPoint(event.clientX, event.clientY);
    if (!node || !point) {
      return;
    }

    const affectedNodeIds =
      selectedFlowNodeIds.includes(nodeId) && selectedFlowNodeIds.length > 0
        ? selectedFlowNodeIds.filter(
            (candidateId) => thinkingFlowNodeById.get(candidateId)?.movable
          )
        : node.movable
        ? [nodeId]
        : [];
    const initialPositions = Object.fromEntries(
      affectedNodeIds
        .map((candidateId) => {
          const candidate = thinkingFlowNodeById.get(candidateId);
          return candidate
            ? [candidateId, { x: candidate.x, y: candidate.y }]
            : null;
        })
        .filter((entry): entry is [string, { x: number; y: number }] =>
          Boolean(entry)
        )
    );
    if (affectedNodeIds.length === 0) {
      selectThinkingFlowNode(nodeId, event.metaKey || event.ctrlKey);
      return;
    }

    setFlowNodeDragState({
      nodeId,
      affectedNodeIds,
      startX: point.x,
      startY: point.y,
      initialPositions,
    });
    setSelectedFlowNodeId(nodeId);
    setSelectedFlowNodeIds(affectedNodeIds);
    setSelectedFieldIds([]);
  }, [flowInteractionMode, flowViewportOffset, thinkingFlowNodeById, selectedFlowNodeIds, selectThinkingFlowNode, getThinkingFlowPoint]);

  const startThinkingFlowConnection = useCallback((
    nodeId: string,
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const node = thinkingFlowNodeById.get(nodeId);
    const point = getThinkingFlowPoint(event.clientX, event.clientY);
    if (!node || !point || node.kind === "output") {
      return;
    }
    const nextBranch =
      node.kind === "if"
        ? getNextThinkingFlowBranchForSource(node.id, thinkingFlowEdges)
        : null;
    if (node.kind === "if" && !nextBranch) {
      setStatus(
        `${node.label} already has both Yes and No branches. Remove one edge first.`
      );
      return;
    }

    setPendingFlowEdgeSourceId(nodeId);
    setFlowEdgePreviewPoint(point);
    selectThinkingFlowNode(nodeId);
    setStatus(
      node.kind === "if"
        ? nextBranch
          ? `Connecting ${getThinkingFlowBranchLabel(nextBranch)} from ${
              node.label
            }. Choose another node to finish.`
          : `${node.label} already has both Yes and No branches. Remove one edge first.`
        : `Connecting from ${node.label}. Choose another node to finish.`
    );
  }, [thinkingFlowNodeById, thinkingFlowEdges, selectThinkingFlowNode, getThinkingFlowPoint]);

  const completeThinkingFlowConnection = useCallback((targetNodeId: string) => {
    if (!pendingFlowEdgeSourceId) {
      return;
    }

    const sourceNode = thinkingFlowNodeById.get(pendingFlowEdgeSourceId);
    const targetNode = thinkingFlowNodeById.get(targetNodeId);
    if (!sourceNode || !targetNode) {
      setPendingFlowEdgeSourceId(null);
      setFlowEdgePreviewPoint(null);
      return;
    }

    if (!canConnectThinkingFlowNodes(sourceNode, targetNode)) {
      setPendingFlowEdgeSourceId(null);
      setFlowEdgePreviewPoint(null);
      setStatus(`Cannot connect ${sourceNode.label} to ${targetNode.label}.`);
      return;
    }

    const existing = thinkingFlowEdges.find(
      (edge) =>
        edge.sourceNodeId === sourceNode.id &&
        edge.targetNodeId === targetNode.id
    );
    if (!existing) {
      const assignedBranch =
        sourceNode.kind === "if"
          ? getNextThinkingFlowBranchForSource(
              sourceNode.id,
              thinkingFlowEdges
            ) ?? undefined
          : undefined;
      if (sourceNode.kind === "if" && !assignedBranch) {
        setPendingFlowEdgeSourceId(null);
        setFlowEdgePreviewPoint(null);
        setStatus(
          `${sourceNode.label} already uses both Yes and No branches. Remove one edge first.`
        );
        return;
      }
      updateThinkingFlow((flow) => ({
        ...flow,
        edges: [
          ...flow.edges,
          {
            id: `edge-${sourceNode.id}-${targetNode.id}`,
            sourceNodeId: sourceNode.id,
            targetNodeId: targetNode.id,
            branch: assignedBranch,
          },
        ],
      }));
      setStatus(
        sourceNode.kind === "if" && assignedBranch
          ? `${sourceNode.label} now routes ${getThinkingFlowBranchLabel(
              assignedBranch
            )} to ${targetNode.label}.`
          : `${sourceNode.label} now feeds ${targetNode.label}.`
      );
    }

    setPendingFlowEdgeSourceId(null);
    setFlowEdgePreviewPoint(null);
    selectThinkingFlowNode(targetNodeId);
  }, [pendingFlowEdgeSourceId, thinkingFlowNodeById, thinkingFlowEdges, selectThinkingFlowNode]);

  const removeThinkingFlowEdge = useCallback((edgeId: string) => {
    updateThinkingFlow((flow) => ({
      ...flow,
      edges: flow.edges.filter((edge) => edge.id !== edgeId),
    }));
    setStatus("Flow link removed.");
  }, [updateThinkingFlow]);

  const toggleThinkingFlowEdgeBranch = useCallback((
    edgeId: string,
    currentBranch: ModuleThinkingFlowBranch
  ) => {
    const edge = thinkingFlowEdges.find((candidate) => candidate.id === edgeId);
    if (!edge) {
      return;
    }
    const nextBranch: ModuleThinkingFlowBranch =
      currentBranch === "yes" ? "no" : "yes";
    updateThinkingFlow((flow) => {
      const conflictingEdge = flow.edges.find(
        (candidate) =>
          candidate.id !== edgeId &&
          candidate.sourceNodeId === edge.sourceNodeId &&
          (candidate.branch ?? "yes") === nextBranch
      );
      return {
        ...flow,
        edges: flow.edges.map((candidate) => {
          if (candidate.id === edgeId) {
            return {
              ...candidate,
              branch: nextBranch,
            };
          }
          if (conflictingEdge && candidate.id === conflictingEdge.id) {
            return {
              ...candidate,
              branch: currentBranch,
            };
          }
          return candidate;
        }),
      };
    });
    setStatus(
      `${getThinkingFlowBranchLabel(nextBranch)} branch now routes to ${
        thinkingFlowNodeById.get(edge.targetNodeId)?.label ?? "that node"
      }.`
    );
  }, [thinkingFlowEdges, thinkingFlowNodeById, updateThinkingFlow]);

  const startFlowViewportInteraction = useCallback((
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    const point = getThinkingFlowPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    setPendingFlowEdgeSourceId(null);
    setFlowEdgePreviewPoint(null);

    if (flowInteractionMode === "pan") {
      setFlowPanState({
        startX: event.clientX,
        startY: event.clientY,
        initialX: flowViewportOffset.x,
        initialY: flowViewportOffset.y,
      });
      return;
    }

    setSelectedFlowNodeIds([]);
    setSelectedFlowNodeId(null);
    setSelectedFieldIds([]);
    setFlowMarqueeState({
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    });
  }, [flowInteractionMode, flowViewportOffset, getThinkingFlowPoint]);

  const handleFlowViewportWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 0.1 : -0.1;
    zoomFlowBoard(flowViewportScale + direction);
  }, [flowViewportScale, zoomFlowBoard]);

  function getScenePoint(clientX: number, clientY: number) {
    const viewport = workspaceViewportRef.current;
    if (!viewport) {
      return null;
    }

    return getViewportPointInScene(
      viewport,
      clientX,
      clientY,
      workspaceScale,
      workspaceOffset
    );
  }

  function updateFieldAiState(fieldId: string, aiState: ModuleAiState) {
    updateDraftFieldById(fieldId, (field) => ({
      ...field,
      aiState,
    }));
  }

  function updateDataBlockRaw(fieldId: string, raw: string) {
    updateDraftFieldById(fieldId, (field) => ({
      ...field,
      dataTable: raw.trim()
        ? parseDataBlockInput(raw)
        : createEmptyDataTable(""),
    }));
  }

  function updateChartKind(fieldId: string, kind: ModuleChartKind) {
    updateDraftFieldById(fieldId, (field) => ({
      ...field,
      chartSpec: {
        kind,
      },
    }));
    setStatus(`Chart set to ${CHART_KIND_LABEL[kind]}.`);
  }

  const startConnection = useCallback((
    fieldId: string,
    event: React.PointerEvent<HTMLElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const source = draft.fields.find((field) => field.id === fieldId);
    if (!source || !isFieldConnectable(source)) {
      return;
    }

    const point = getScenePoint(event.clientX, event.clientY);
    setPendingConnectionSourceId(fieldId);
    setConnectionPreviewPoint(point);
    handleFieldSelection(fieldId, false);
    if (activeStage !== "semantics") {
      handleStageChange("semantics");
    }
    setStatus(
      `Connecting from ${source.label}. Choose another block to finish the link.`
    );
  }, [draft.fields, getScenePoint, handleFieldSelection, activeStage, handleStageChange]);

  const completeConnection = useCallback((
    targetFieldId: string,
    event?: React.PointerEvent<HTMLElement>
  ) => {
    event?.preventDefault();
    event?.stopPropagation();

    if (
      !pendingConnectionSourceId ||
      pendingConnectionSourceId === targetFieldId
    ) {
      setPendingConnectionSourceId(null);
      setConnectionPreviewPoint(null);
      return;
    }

    const source = draft.fields.find(
      (field) => field.id === pendingConnectionSourceId
    );
    const target = draft.fields.find((field) => field.id === targetFieldId);
    if (!source || !target || !isFieldConnectable(target)) {
      setPendingConnectionSourceId(null);
      setConnectionPreviewPoint(null);
      return;
    }

    if (!canConnectFields(source, target)) {
      setPendingConnectionSourceId(null);
      setConnectionPreviewPoint(null);
      setStatus(`Cannot connect ${source.label} to ${target.label}.`);
      return;
    }

    const nextKind = inferConnectionKind(source, target);
    const existingConnection = connections.find(
      (connection) =>
        connection.sourceFieldId === source.id &&
        connection.targetFieldId === target.id
    );

    if (!existingConnection) {
      setDraft((current) => ({
        ...current,
        connections: [
          ...(current.connections ?? []).filter((connection) =>
            nextKind === "data-flow" && getCanvasObjectKind(target) === "chart"
              ? !(
                  connection.kind === "data-flow" &&
                  connection.targetFieldId === target.id
                )
              : true
          ),
          {
            id: `connection-${Math.random().toString(36).slice(2, 8)}`,
            sourceFieldId: source.id,
            targetFieldId: target.id,
            kind: nextKind,
          },
        ],
      }));
      setStatus(
        nextKind === "data-flow" && getCanvasObjectKind(target) === "chart"
          ? `${source.label} now drives ${target.label}.`
          : `${source.label} now connects to ${target.label}.`
      );
    }

    setPendingConnectionSourceId(null);
    setConnectionPreviewPoint(null);
  }, [pendingConnectionSourceId, draft.fields, connections, setDraft, setPendingConnectionSourceId, setConnectionPreviewPoint, setStatus]);

  function removeConnection(connectionId: string) {
    setDraft((current) => ({
      ...current,
      connections: (current.connections ?? []).filter(
        (connection) => connection.id !== connectionId
      ),
    }));
  }

  const openLibraryModal = useCallback(() => {
    setModuleFrameInteractionState(null);
    setPendingConnectionSourceId(null);
    setConnectionPreviewPoint(null);
    openTemplateLibrary();
  }, [openTemplateLibrary]);

  function closeLibraryModal() {
    closeTemplateLibrary();
  }

  const startModuleFrameInteraction = useCallback((
    mode: ModuleFrameInteractionMode,
    event: React.PointerEvent<HTMLElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const point = getArtboardPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    setModuleFrameInteractionState({
      mode,
      startX: point.x,
      startY: point.y,
      initialFrame: moduleFrame,
    });
  }, [getArtboardPoint, moduleFrame]);

  function resolveModuleFrameInteraction(
    interaction: ModuleFrameInteractionState,
    point: { x: number; y: number }
  ) {
    const minSize = 8;
    const deltaX = point.x - interaction.startX;
    const deltaY = point.y - interaction.startY;
    const { initialFrame } = interaction;

    if (interaction.mode === "move") {
      return normalizeModuleFrameLayout(
        {
          ...initialFrame,
          x: clamp(
            initialFrame.x + deltaX,
            0,
            MODULE_CANVAS_COLUMNS - initialFrame.w
          ),
          y: clamp(
            initialFrame.y + deltaY,
            0,
            MODULE_CANVAS_ROWS - initialFrame.h
          ),
        },
        initialFrame
      );
    }

    if (interaction.mode === "resize-nw") {
      const right = initialFrame.x + initialFrame.w;
      const bottom = initialFrame.y + initialFrame.h;
      const nextX = clamp(initialFrame.x + deltaX, 0, right - minSize);
      const nextY = clamp(initialFrame.y + deltaY, 0, bottom - minSize);
      return normalizeModuleFrameLayout(
        {
          x: nextX,
          y: nextY,
          w: right - nextX,
          h: bottom - nextY,
        },
        initialFrame
      );
    }

    if (interaction.mode === "resize-ne") {
      const bottom = initialFrame.y + initialFrame.h;
      const nextRight = clamp(
        initialFrame.x + initialFrame.w + deltaX,
        initialFrame.x + minSize,
        MODULE_CANVAS_COLUMNS
      );
      const nextY = clamp(initialFrame.y + deltaY, 0, bottom - minSize);
      return normalizeModuleFrameLayout(
        {
          x: initialFrame.x,
          y: nextY,
          w: nextRight - initialFrame.x,
          h: bottom - nextY,
        },
        initialFrame
      );
    }

    if (interaction.mode === "resize-sw") {
      const right = initialFrame.x + initialFrame.w;
      const nextX = clamp(initialFrame.x + deltaX, 0, right - minSize);
      const nextBottom = clamp(
        initialFrame.y + initialFrame.h + deltaY,
        initialFrame.y + minSize,
        MODULE_CANVAS_ROWS
      );
      return normalizeModuleFrameLayout(
        {
          x: nextX,
          y: initialFrame.y,
          w: right - nextX,
          h: nextBottom - initialFrame.y,
        },
        initialFrame
      );
    }

    const nextRight = clamp(
      initialFrame.x + initialFrame.w + deltaX,
      initialFrame.x + minSize,
      MODULE_CANVAS_COLUMNS
    );
    const nextBottom = clamp(
      initialFrame.y + initialFrame.h + deltaY,
      initialFrame.y + minSize,
      MODULE_CANVAS_ROWS
    );
    return normalizeModuleFrameLayout(
      {
        x: initialFrame.x,
        y: initialFrame.y,
        w: nextRight - initialFrame.x,
        h: nextBottom - initialFrame.y,
      },
      initialFrame
    );
  }

  useEffect(() => {
    if (!dragState) {
      return;
    }
    const activeDrag = dragState;

    function onPointerMove(event: PointerEvent) {
      const rect = activeDrag.sceneRect;
      const deltaColumns = Math.round(
        ((event.clientX - activeDrag.startX) / rect.width) *
          MODULE_SCENE_COLUMNS
      );
      const deltaRows = Math.round(
        ((event.clientY - activeDrag.startY) / rect.height) * MODULE_SCENE_ROWS
      );

      setDraft((current) => {
        if (activeDrag.mode === "move") {
          const movedSceneLayouts = Object.fromEntries(
            activeDrag.affectedFieldIds.map((fieldId) => {
              const baseLayout = activeDrag.initialSceneLayouts[fieldId];
              const nextLayout = {
                ...baseLayout,
                x: clamp(
                  baseLayout.x + deltaColumns,
                  0,
                  MODULE_SCENE_COLUMNS - baseLayout.w
                ),
                y: clamp(
                  baseLayout.y + deltaRows,
                  0,
                  MODULE_SCENE_ROWS - baseLayout.h
                ),
              };
              return [fieldId, nextLayout];
            })
          );
          const movedBox = getLayoutsBoundingBox(
            Object.values(movedSceneLayouts)
          );
          const nextSurface: ModuleCanvasSurface = isBoxInsideArtboard(movedBox)
            ? "artboard"
            : "pasteboard";

          return {
            ...current,
            fields: current.fields.map((field) => {
              if (!activeDrag.affectedFieldIds.includes(field.id)) {
                return field;
              }

              const sceneLayout = movedSceneLayouts[field.id];
              const nextLayout =
                nextSurface === "artboard"
                  ? clampLayoutToSurface(
                      {
                        x: sceneLayout.x - ARTBOARD_OFFSET_X,
                        y: sceneLayout.y - ARTBOARD_OFFSET_Y,
                        w: sceneLayout.w,
                        h: sceneLayout.h,
                      },
                      "artboard"
                    )
                  : clampLayoutToSurface(sceneLayout, "pasteboard");

              return {
                ...field,
                surface: nextSurface,
                layout: nextLayout,
              };
            }),
          };
        }

        return {
          ...current,
          fields: current.fields.map((field) => {
            if (!activeDrag.affectedFieldIds.includes(field.id)) {
              return field;
            }

            const currentLayout =
              activeDrag.initialLayouts[field.id] ??
              field.layout ??
              createDefaultFieldLayout(
                current.kind,
                current.fields.findIndex((item) => item.id === field.id),
                current.fields.length
              );
            const surface = getFieldSurface(field);
            const nextW =
              surface === "pasteboard"
                ? clamp(
                    currentLayout.w + deltaColumns,
                    2,
                    MODULE_SCENE_COLUMNS - currentLayout.x
                  )
                : clamp(
                    currentLayout.w + deltaColumns,
                    2,
                    MODULE_CANVAS_COLUMNS - currentLayout.x
                  );
            const nextH =
              surface === "pasteboard"
                ? clamp(
                    currentLayout.h + deltaRows,
                    2,
                    MODULE_SCENE_ROWS - currentLayout.y
                  )
                : clamp(
                    currentLayout.h + deltaRows,
                    2,
                    MODULE_CANVAS_ROWS - currentLayout.y
                  );
            const squareLocked = field.style?.aspectLock === "square";
            const maxSquareSize =
              surface === "pasteboard"
                ? Math.min(
                    MODULE_SCENE_COLUMNS - currentLayout.x,
                    MODULE_SCENE_ROWS - currentLayout.y
                  )
                : Math.min(
                    MODULE_CANVAS_COLUMNS - currentLayout.x,
                    MODULE_CANVAS_ROWS - currentLayout.y
                  );
            const dominantDelta =
              Math.abs(deltaColumns) >= Math.abs(deltaRows)
                ? deltaColumns
                : deltaRows;
            const nextSquareSize = clamp(
              currentLayout.w + dominantDelta,
              2,
              maxSquareSize
            );

            return {
              ...field,
              layout: {
                ...currentLayout,
                w: squareLocked ? nextSquareSize : nextW,
                h: squareLocked ? nextSquareSize : nextH,
              },
            };
          }),
        };
      });
    }

    function onPointerUp() {
      setDragState(null);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [dragState]);

  useEffect(() => {
    if (!moduleFrameInteractionState) {
      return;
    }

    const activeInteraction = moduleFrameInteractionState;

    function onPointerMove(event: PointerEvent) {
      const point = getArtboardPoint(event.clientX, event.clientY);
      if (!point) {
        return;
      }

      const nextFrame = resolveModuleFrameInteraction(activeInteraction, point);
      setDraft((current) => ({
        ...current,
        moduleFrame: nextFrame,
      }));
    }

    function onPointerUp(event: PointerEvent) {
      const point = getArtboardPoint(event.clientX, event.clientY);
      setModuleFrameInteractionState(null);

      if (!point) {
        return;
      }

      const nextFrame = resolveModuleFrameInteraction(activeInteraction, point);
      setDraft((current) => ({
        ...current,
        moduleFrame: nextFrame,
      }));
      setStatus("Template frame updated.");
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [moduleFrameInteractionState]);

  useEffect(() => {
    if (!flowNodeDragState) {
      return;
    }

    const activeDrag = flowNodeDragState;

    function onPointerMove(event: PointerEvent) {
      const point = getThinkingFlowPoint(event.clientX, event.clientY);
      if (!point) {
        return;
      }

      if (activeDrag.affectedNodeIds.length === 0) {
        return;
      }

      const deltaX = point.x - activeDrag.startX;
      const deltaY = point.y - activeDrag.startY;
      updateThinkingFlow((flow) => ({
        ...flow,
        nodes: flow.nodes.map((node) => {
          if (!activeDrag.affectedNodeIds.includes(node.id)) {
            return node;
          }
          const initialPosition = activeDrag.initialPositions[node.id];
          if (!initialPosition) {
            return node;
          }
          return clampThinkingFlowNode({
            ...node,
            x: initialPosition.x + deltaX,
            y: initialPosition.y + deltaY,
          });
        }),
      }));
    }

    function onPointerUp() {
      setFlowNodeDragState(null);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [flowNodeDragState, thinkingFlowNodeById]);

  useEffect(() => {
    if (!flowPanState) {
      return;
    }

    const activePan = flowPanState;

    function onPointerMove(event: PointerEvent) {
      const viewport = thinkingFlowViewportRef.current;
      if (!viewport) {
        return;
      }

      setFlowViewportOffset(
        clampFlowViewportOffset(
          {
            x: activePan.initialX + (event.clientX - activePan.startX),
            y: activePan.initialY + (event.clientY - activePan.startY),
          },
          viewport.clientWidth,
          viewport.clientHeight,
          flowViewportScale
        )
      );
    }

    function onPointerUp() {
      setFlowPanState(null);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [flowPanState, flowViewportScale]);

  useEffect(() => {
    if (!flowMarqueeState) {
      return;
    }

    function onPointerMove(event: PointerEvent) {
      const point = getThinkingFlowPoint(event.clientX, event.clientY);
      if (!point) {
        return;
      }

      setFlowMarqueeState((current) =>
        current
          ? {
              ...current,
              currentX: point.x,
              currentY: point.y,
            }
          : current
      );
    }

    function onPointerUp() {
      setFlowMarqueeState((current) => {
        if (!current) {
          return current;
        }

        const left = Math.min(current.startX, current.currentX);
        const top = Math.min(current.startY, current.currentY);
        const right = Math.max(current.startX, current.currentX);
        const bottom = Math.max(current.startY, current.currentY);
        const selectionTooSmall =
          Math.abs(current.currentX - current.startX) < 8 &&
          Math.abs(current.currentY - current.startY) < 8;
        const hits = selectionTooSmall
          ? []
          : thinkingFlowNodes
              .filter(
                (node) =>
                  node.x + node.w >= left &&
                  node.x <= right &&
                  node.y + node.h >= top &&
                  node.y <= bottom
              )
              .map((node) => node.id);
        setSelectedFlowNodeIds(hits);
        setSelectedFlowNodeId(hits[0] ?? null);
        setSelectedFieldIds([]);
        return null;
      });
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [flowMarqueeState, thinkingFlowNodes]);

  useEffect(() => {
    if (!pendingFlowEdgeSourceId) {
      return;
    }

    function onPointerMove(event: PointerEvent) {
      setFlowEdgePreviewPoint(
        getThinkingFlowPoint(event.clientX, event.clientY)
      );
    }

    window.addEventListener("pointermove", onPointerMove);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [pendingFlowEdgeSourceId]);

  useEffect(() => {
    if (
      pendingConnectionSourceId &&
      !draft.fields.some((field) => field.id === pendingConnectionSourceId)
    ) {
      setPendingConnectionSourceId(null);
      setConnectionPreviewPoint(null);
    }
  }, [draft.fields, pendingConnectionSourceId]);

  useEffect(() => {
    if (
      selectedFlowNodeId &&
      !thinkingFlowNodes.some((node) => node.id === selectedFlowNodeId)
    ) {
      setSelectedFlowNodeId(thinkingFlowNodes[0]?.id ?? null);
      setSelectedFlowNodeIds(
        thinkingFlowNodes[0] ? [thinkingFlowNodes[0].id] : []
      );
    }
  }, [selectedFlowNodeId, thinkingFlowNodes]);

  useEffect(() => {
    if (
      pendingFlowEdgeSourceId &&
      !thinkingFlowNodes.some((node) => node.id === pendingFlowEdgeSourceId)
    ) {
      setPendingFlowEdgeSourceId(null);
      setFlowEdgePreviewPoint(null);
    }
  }, [pendingFlowEdgeSourceId, thinkingFlowNodes]);

  useEffect(() => {
    if (
      selectedFlowNodeIds.length > 0 &&
      selectedFlowNodeIds.some(
        (nodeId) => !thinkingFlowNodes.some((node) => node.id === nodeId)
      )
    ) {
      const nextIds = selectedFlowNodeIds.filter((nodeId) =>
        thinkingFlowNodes.some((node) => node.id === nodeId)
      );
      setSelectedFlowNodeIds(nextIds);
      if (!nextIds.includes(selectedFlowNodeId ?? "")) {
        setSelectedFlowNodeId(nextIds[0] ?? null);
      }
    }
  }, [selectedFlowNodeId, selectedFlowNodeIds, thinkingFlowNodes]);

  useEffect(() => {
    if (!isFlowStage) {
      return;
    }

    if (fittedFlowDraftIdRef.current !== draft.id) {
      fittedFlowDraftIdRef.current = draft.id;
      requestAnimationFrame(() => fitFlowBoardToView());
    }

    function onResize() {
      const viewport = thinkingFlowViewportRef.current;
      if (!viewport) {
        return;
      }

      setFlowViewportOffset((current) =>
        clampFlowViewportOffset(
          current,
          viewport.clientWidth,
          viewport.clientHeight,
          flowViewportScale
        )
      );
    }

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draft.id, flowViewportScale, isFlowStage]);



  useEffect(() => {
    if (!panState) {
      return;
    }

    const activePan = panState;

    function onPointerMove(event: PointerEvent) {
      const viewport = workspaceViewportRef.current;
      if (!viewport) {
        return;
      }

      setWorkspaceOffset(
        clampWorkspaceOffset(
          {
            x: activePan.initialX + (event.clientX - activePan.startX),
            y: activePan.initialY + (event.clientY - activePan.startY),
          },
          viewport.clientWidth,
          viewport.clientHeight,
          workspaceScale
        )
      );
    }

    function onPointerUp() {
      setPanState(null);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [panState]);

  useEffect(() => {
    if (!marqueeState) {
      return;
    }

    function onPointerMove(event: PointerEvent) {
      const viewport = workspaceViewportRef.current;
      if (!viewport) {
        return;
      }

      const point = getViewportPointInScene(
        viewport,
        event.clientX,
        event.clientY,
        workspaceScale,
        workspaceOffset
      );
      setMarqueeState((current) =>
        current
          ? {
              ...current,
              currentX: point.x,
              currentY: point.y,
            }
          : current
      );
    }

    function onPointerUp() {
      setMarqueeState((current) => {
        if (!current) {
          return current;
        }

        const left = Math.min(current.startX, current.currentX);
        const top = Math.min(current.startY, current.currentY);
        const right = Math.max(current.startX, current.currentX);
        const bottom = Math.max(current.startY, current.currentY);

        const hits = draft.fields
          .filter((field, index) => {
            const layout = getSceneLayout(
              field,
              createDefaultFieldLayout(draft.kind, index, draft.fields.length)
            );
            const fieldLeft = layout.x * MODULE_UNIT_SIZE;
            const fieldTop = layout.y * MODULE_UNIT_SIZE;
            const fieldRight = fieldLeft + layout.w * MODULE_UNIT_SIZE;
            const fieldBottom = fieldTop + layout.h * MODULE_UNIT_SIZE;
            return (
              fieldRight >= left &&
              fieldLeft <= right &&
              fieldBottom >= top &&
              fieldTop <= bottom
            );
          })
          .map((field) => field.id);

        setSelectedFieldIds(hits);
        return null;
      });
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [draft.fields, draft.kind, marqueeState, workspaceOffset, workspaceScale]);

  useEffect(() => {
    const viewport = workspaceViewportRef.current;
    if (viewport && viewport.clientWidth > 0 && viewport.clientHeight > 0) {
      fitWorkspaceToView();
      return;
    }
    const timer = window.setInterval(() => {
      const v = workspaceViewportRef.current;
      if (v && v.clientWidth > 0 && v.clientHeight > 0) {
        fitWorkspaceToView();
        window.clearInterval(timer);
      }
    }, 16);
    const timeout = window.setTimeout(() => window.clearInterval(timer), 500);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isEditingText =
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        Boolean(target?.isContentEditable);

      if (isEditingText) {
        return;
      }

      const hasMeta = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (hasMeta && key === "c") {
        event.preventDefault();
        copySelectedFieldsToClipboard();
        return;
      }

      if (hasMeta && key === "v") {
        event.preventDefault();
        pasteCopiedFields();
        return;
      }

      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        activeStage === "semantics" &&
        removableSelectedFlowNodes.length > 0
      ) {
        event.preventDefault();
        removeSelectedThinkingFlowNodes();
        return;
      }

      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        selectedFieldIds.length > 0
      ) {
        event.preventDefault();
        removeFields(selectedFieldIds);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeStage,
    copiedFields.length,
    selectedFieldIds,
    selectedFields,
    selectedFlowNode,
    removableSelectedFlowNodes.length,
  ]);

  function openLibraryEntry(entry: ModuleRegistryEntry) {
    const nextDraft = ensureDraftVisibleOnArtboard(
      cloneEntryForAuthoring(entry)
    );
    setDraft(nextDraft);
    setFlowRunBrief("");
    setFlowRunResult(null);
    setSelectedFlowNodeId(null);
    setSelectedFlowNodeIds([]);
    setSelectedFieldIds(nextDraft.fields[0] ? [nextDraft.fields[0].id] : []);
    closeTemplateLibrary();
    setModuleFrameInteractionState(null);
    setPendingConnectionSourceId(null);
    setConnectionPreviewPoint(null);
    markTemplateRecent(entry.id);
    handleStageChange("define");
    setStatus(`Loaded ${entry.label} as the starting point for this template.`);
    requestAnimationFrame(() => fitWorkspaceToView());
  }

  const addCanvasObject = useCallback((
    kind: ModuleCanvasObjectKind = "slot",
    preset: CanvasObjectPreset = "default"
  ) => {
    let createdId = "";
    let createdLabel = "";
    handleStageChange("compose");
    setDraft((current) => {
      const nextField = createCanvasObject(
        kind,
        current.kind,
        current.fields.length,
        current.fields.length + 1,
        preset
      );
      const nextFrame = getModuleFrameLayout(current);
      const nextLayout = nextField.layout
        ? {
            ...nextField.layout,
            x: clamp(
              nextField.layout.x,
              nextFrame.x,
              nextFrame.x + nextFrame.w - nextField.layout.w
            ),
            y: clamp(
              nextField.layout.y,
              nextFrame.y,
              nextFrame.y + nextFrame.h - nextField.layout.h
            ),
          }
        : undefined;
      createdId = nextField.id;
      createdLabel = nextField.label;
      const nextFields = [
        ...current.fields,
        {
          ...nextField,
          layout: nextLayout,
        },
      ];

      return {
        ...current,
        fields: nextFields,
      };
    });
    setSelectedFieldIds(createdId ? [createdId] : []);
    setStatus(`Added ${createdLabel || getObjectKindLabel(kind)} to the canvas.`);
  }, []);

  function groupSelectedFields() {
    if (selectedFields.length < 2) {
      setStatus("Select at least two objects to group them.");
      return;
    }

    const nextGroupId = `group-${Math.random().toString(36).slice(2, 8)}`;
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        selectedFieldIds.includes(field.id)
          ? {
              ...field,
              groupId: nextGroupId,
            }
          : field
      ),
    }));
    setStatus(`Grouped ${selectedFields.length} objects.`);
  }

  function ungroupSelectedFields() {
    if (!selectedGroupId && selectedFields.every((field) => !field.groupId)) {
      setStatus("Select grouped objects to ungroup them.");
      return;
    }

    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        selectedFieldIds.includes(field.id) ||
        (selectedGroupId ? field.groupId === selectedGroupId : false)
          ? {
              ...field,
              groupId: undefined,
            }
          : field
      ),
    }));
    setStatus("Ungrouped the selected objects.");
  }

  function duplicateSelectedField() {
    if (selectedFields.length === 0) {
      setStatus(
        "Select one or more objects on the canvas before duplicating them."
      );
      return;
    }

    const createdIds: string[] = [];
    setDraft((current) => {
      const selectedSet = new Set(selectedFieldIds);
      const nextFields: ModuleTemplateField[] = [];
      current.fields.forEach((field, index) => {
        nextFields.push(field);
        if (!selectedSet.has(field.id)) {
          return;
        }
        const sourceLayout =
          field.layout ??
          createDefaultFieldLayout(current.kind, index, current.fields.length);
        const nextId = `field-${Math.random().toString(36).slice(2, 8)}`;
        createdIds.push(nextId);
        nextFields.push({
          ...field,
          id: nextId,
          label: `${field.label} Copy`,
          layout: clampLayoutToSurface(
            {
              ...sourceLayout,
              x: sourceLayout.x + 4,
              y: sourceLayout.y + 4,
            },
            getFieldSurface(field)
          ),
        });
      });
      return {
        ...current,
        fields: nextFields,
      };
    });
    setSelectedFieldIds(createdIds);
    setStatus(
      createdIds.length === 1
        ? `Duplicated ${selectedFields[0]?.label}.`
        : `Duplicated ${createdIds.length} objects.`
    );
  }

  function copySelectedFieldsToClipboard() {
    if (selectedFields.length === 0) {
      return;
    }
    setCopiedFields(
      selectedFields.map((field) => ({
        ...field,
        style: field.style ? { ...field.style } : undefined,
        layout: field.layout ? { ...field.layout } : undefined,
        dataTable: field.dataTable
          ? {
              ...field.dataTable,
              columns: field.dataTable.columns.map((column) => ({
                ...column,
              })),
              rows: field.dataTable.rows.map((row) => [...row]),
            }
          : undefined,
        chartSpec: field.chartSpec ? { ...field.chartSpec } : undefined,
      }))
    );
    setStatus(
      selectedFields.length === 1
        ? `Copied ${selectedField?.label}.`
        : `Copied ${selectedFields.length} objects.`
    );
  }

  function pasteCopiedFields() {
    if (copiedFields.length === 0) {
      return;
    }

    const copiedGroupMap = new Map<string, string>();
    const createdIds: string[] = [];

    setDraft((current) => {
      const nextFields = copiedFields.map((field, index) => {
        const nextId = `field-${Math.random().toString(36).slice(2, 8)}`;
        createdIds.push(nextId);
        const nextGroupId = field.groupId
          ? copiedGroupMap.get(field.groupId) ??
            (() => {
              const generated = `group-${Math.random()
                .toString(36)
                .slice(2, 8)}`;
              copiedGroupMap.set(field.groupId!, generated);
              return generated;
            })()
          : undefined;
        const baseLayout =
          field.layout ??
          createDefaultFieldLayout(current.kind, index, copiedFields.length);
        return {
          ...field,
          id: nextId,
          groupId: nextGroupId,
          label:
            copiedFields.length === 1 ? `${field.label} Copy` : field.label,
          layout: clampLayoutToSurface(
            {
              ...baseLayout,
              x: baseLayout.x + 6,
              y: baseLayout.y + 6,
            },
            getFieldSurface(field)
          ),
        };
      });

      return {
        ...current,
        fields: [...current.fields, ...nextFields],
      };
    });

    setSelectedFieldIds(createdIds);
    setStatus(
      createdIds.length === 1
        ? "Pasted 1 object."
        : `Pasted ${createdIds.length} objects.`
    );
  }

  function removeFields(fieldIds: string[]) {
    const removableIds = fieldIds.filter((fieldId) =>
      draft.fields.some((item) => item.id === fieldId)
    );
    if (removableIds.length === 0) {
      return;
    }

    setDraft((current) => ({
      ...current,
      fields: current.fields.filter((item) => !removableIds.includes(item.id)),
      connections: (current.connections ?? []).filter(
        (connection) =>
          !removableIds.includes(connection.sourceFieldId) &&
          !removableIds.includes(connection.targetFieldId)
      ),
    }));
    setSelectedFieldIds((current) =>
      current.filter((id) => !removableIds.includes(id))
    );
    setStatus(
      removableIds.length === 1
        ? "Removed the object from the template canvas."
        : `Removed ${removableIds.length} objects from the template canvas.`
    );
  }

  function alignSelectedField(direction: "left" | "center" | "right") {
    if (selectedFields.length === 0) {
      setStatus("Select one or more objects before aligning them.");
      return;
    }

    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field) => {
        if (!selectedFieldIds.includes(field.id)) {
          return field;
        }
        const layout =
          field.layout ??
          createDefaultFieldLayout(
            current.kind,
            current.fields.findIndex((item) => item.id === field.id),
            current.fields.length
          );
        const nextX =
          direction === "left"
            ? 0
            : direction === "center"
            ? Math.round((MODULE_CANVAS_COLUMNS - layout.w) / 2)
            : MODULE_CANVAS_COLUMNS - layout.w;
        return {
          ...field,
          layout: {
            ...layout,
            x: clamp(nextX, 0, MODULE_CANVAS_COLUMNS - layout.w),
          },
        };
      }),
    }));
    setStatus(
      selectedFields.length === 1
        ? `Aligned ${selectedField?.label} ${
            direction === "center" ? "to center" : `to the ${direction}`
          }.`
        : `Aligned ${selectedFields.length} objects ${
            direction === "center" ? "to center" : `to the ${direction}`
          }.`
    );
  }

  function distributeSelectedFields() {
    if (selectedFields.length < 3) {
      setStatus("Select at least three objects to distribute them.");
      return;
    }

    const ordered = [...selectedFields].sort(
      (a, b) => (a.layout?.x ?? 0) - (b.layout?.x ?? 0)
    );
    const first = ordered[0]?.layout;
    const last = ordered[ordered.length - 1]?.layout;
    if (!first || !last) {
      return;
    }

    const totalWidth = ordered.reduce(
      (sum, field) => sum + (field.layout?.w ?? 0),
      0
    );
    const availableGap = last.x + last.w - first.x - totalWidth;
    const gap = Math.round(availableGap / Math.max(1, ordered.length - 1));
    let cursor = first.x;
    const nextPositions = new Map<string, number>();

    ordered.forEach((field) => {
      const width = field.layout?.w ?? 0;
      nextPositions.set(field.id, cursor);
      cursor += width + gap;
    });

    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field) => {
        if (!nextPositions.has(field.id)) {
          return field;
        }
        const layout =
          field.layout ??
          createDefaultFieldLayout(
            current.kind,
            current.fields.findIndex((item) => item.id === field.id),
            current.fields.length
          );
        return {
          ...field,
          layout: {
            ...layout,
            x: clamp(
              nextPositions.get(field.id) ?? layout.x,
              0,
              MODULE_CANVAS_COLUMNS - layout.w
            ),
          },
        };
      }),
    }));
    setStatus(`Distributed ${selectedFields.length} objects horizontally.`);
  }

  function applyLayoutPreset(preset: FieldLayoutPresetId) {
    setDraft((current) => ({
      ...current,
      fields: applyFieldLayoutPreset(current.fields, current.kind, preset),
    }));
    setStatus(
      preset === "auto"
        ? "Reset object layout to the default arrangement."
        : preset === "two-up"
        ? "Applied a two-column object layout."
        : preset === "hero"
        ? "Applied a hero-plus-supporting-objects layout."
        : "Applied a timeline layout across the canvas."
    );
  }

  const fitWorkspaceToView = useCallback(() => {
    const viewport = workspaceViewportRef.current;
    if (!viewport) {
      setWorkspaceScale(1);
      setWorkspaceOffset({ x: 0, y: 0 });
      return;
    }

    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    const nextScale = clamp(
      Math.min(
        (viewportWidth - WORKSPACE_FIT_PADDING_X) / MODULE_ARTBOARD_WIDTH,
        (viewportHeight - WORKSPACE_FIT_PADDING_Y) / MODULE_ARTBOARD_HEIGHT
      ),
      0.65,
      1.8
    );
    setWorkspaceScale(nextScale);
    setWorkspaceOffset({ x: 0, y: 0 });
  }, []);

  const zoomWorkspace = useCallback((
    nextScale: number,
    anchor?: { clientX: number; clientY: number }
  ) => {
    const viewport = workspaceViewportRef.current;
    const clampedScale = clamp(nextScale, 0.65, 8);
    if (!viewport || !anchor) {
      setWorkspaceScale(clampedScale);
      if (viewport) {
        setWorkspaceOffset((current) =>
          clampWorkspaceOffset(
            current,
            viewport.clientWidth,
            viewport.clientHeight,
            clampedScale
          )
        );
      }
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const pointX = anchor.clientX - rect.left;
    const pointY = anchor.clientY - rect.top;
    const sceneX =
      (pointX - rect.width / 2 - workspaceOffset.x) / workspaceScale;
    const sceneY =
      (pointY - rect.height / 2 - workspaceOffset.y) / workspaceScale;

    setWorkspaceScale(clampedScale);
    setWorkspaceOffset(
      clampWorkspaceOffset(
        {
          x: pointX - rect.width / 2 - sceneX * clampedScale,
          y: pointY - rect.height / 2 - sceneY * clampedScale,
        },
        viewport.clientWidth,
        viewport.clientHeight,
        clampedScale
      )
    );
  }, [workspaceOffset, workspaceScale]);

  const handleWorkspaceWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const direction = event.deltaY > 0 ? 0.92 : 1.08;
    zoomWorkspace(workspaceScale * direction, {
      clientX: event.clientX,
      clientY: event.clientY,
    });
  }, [workspaceScale, zoomWorkspace]);

  const startWorkspacePan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    setPanState({
      startX: event.clientX,
      startY: event.clientY,
      initialX: workspaceOffset.x,
      initialY: workspaceOffset.y,
    });
  }, [workspaceOffset]);

  const startMarqueeSelection = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const viewport = workspaceViewportRef.current;
    if (!viewport) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const point = getViewportPointInScene(
      viewport,
      event.clientX,
      event.clientY,
      workspaceScale,
      workspaceOffset
    );
    setMarqueeState({
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    });
  }, [workspaceScale, workspaceOffset]);

  const startFieldDrag = useCallback((
    event: React.PointerEvent<HTMLElement>,
    fieldId: string,
    mode: CanvasEditMode
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const field = draft.fields.find((item) => item.id === fieldId);
    if (!field?.layout) {
      return;
    }

    const affectedFieldIds =
      mode === "move" &&
      selectedFieldIds.includes(fieldId) &&
      selectedFieldIds.length > 0
        ? selectedFieldIds
        : [fieldId];
    const initialLayouts = Object.fromEntries(
      draft.fields
        .filter((item) => affectedFieldIds.includes(item.id))
        .map((item, index) => [
          item.id,
          item.layout ??
            createDefaultFieldLayout(draft.kind, index, draft.fields.length),
        ])
    );
    const initialSceneLayouts = Object.fromEntries(
      draft.fields
        .filter((item) => affectedFieldIds.includes(item.id))
        .map((item, index) => [
          item.id,
          getSceneLayout(
            item,
            item.layout ??
              createDefaultFieldLayout(draft.kind, index, draft.fields.length)
          ),
        ])
    );

    const sceneRect = sceneRef.current?.getBoundingClientRect();
    setSelectedFieldIds(affectedFieldIds);
    setDragState({
      fieldId,
      affectedFieldIds,
      initialLayouts,
      initialSceneLayouts,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      sceneRect: sceneRect
        ? { width: sceneRect.width, height: sceneRect.height }
        : { width: MODULE_SCENE_WIDTH, height: MODULE_SCENE_HEIGHT },
    });
  }, [draft.fields, draft.kind, selectedFieldIds]);

  function saveSelectedAsModule() {
    if (selectedFields.length === 0) {
      setStatus(
        "Select one or more objects before saving them as a template asset."
      );
      return;
    }

    const sceneLayouts = selectedFields.map((field, index) =>
      getSceneLayout(
        field,
        createDefaultFieldLayout(draft.kind, index, selectedFields.length)
      )
    );
    const box = getLayoutsBoundingBox(sceneLayouts);
    const labelBase =
      selectedFields.length === 1
        ? selectedField?.label || draft.label
        : `${draft.label} Fragment`;
    const nextLabel = `${labelBase} Template`;
    const nextId = `private.${slugify(nextLabel) || "template-fragment"}.${
      draft.kind
    }`;
    const selectedIdMap = new Map(
      selectedFields.map((field) => [
        field.id,
        `field-${Math.random().toString(36).slice(2, 8)}`,
      ])
    );

    const nextEntry: ModuleRegistryEntry = {
      ...createBlankModuleDraft(),
      id: nextId,
      kind: draft.kind,
      label: nextLabel,
      category: draft.category,
      family: draft.family,
      scope: "private",
      status: "experimental",
      semanticRole: draft.semanticRole,
      description:
        selectedFields.length === 1
          ? `Reusable fragment based on ${selectedField?.label}.`
          : `Reusable fragment built from ${selectedFields.length} selected objects.`,
      promptHint: draft.promptHint,
      useCases: [...draft.useCases],
      searchTerms: [
        ...new Set([...draft.searchTerms, "fragment", "pasteboard"]),
      ],
      rendererCapabilities: [...draft.rendererCapabilities],
      skillBindings: draft.skillBindings.map((binding) => ({ ...binding })),
      defaultSkillRequirements: (draft.defaultSkillRequirements ?? []).map(
        (requirement) => ({ ...requirement })
      ),
      supportedSkillClasses: [
        ...(draft.supportedSkillClasses ?? ["framework", "domain", "output"]),
      ],
      incompatibleSkillIds: [...(draft.incompatibleSkillIds ?? [])],
      examples: (draft.examples ?? []).map((example) => ({ ...example })),
      moduleFrame: normalizeModuleFrameLayout({
        x: 0,
        y: 0,
        w: box.w,
        h: box.h,
      }),
      connections: connections
        .filter(
          (connection) =>
            selectedIdMap.has(connection.sourceFieldId) &&
            selectedIdMap.has(connection.targetFieldId)
        )
        .map((connection) => ({
          ...connection,
          id: `connection-${Math.random().toString(36).slice(2, 8)}`,
          sourceFieldId: selectedIdMap.get(connection.sourceFieldId)!,
          targetFieldId: selectedIdMap.get(connection.targetFieldId)!,
        })),
      order: 950,
      featured: false,
      fields: selectedFields.map((field, index) => {
        const sceneLayout = getSceneLayout(
          field,
          createDefaultFieldLayout(draft.kind, index, selectedFields.length)
        );
        return {
          ...field,
          id: selectedIdMap.get(field.id)!,
          surface: "artboard" as const,
          dataTable: field.dataTable
            ? {
                ...field.dataTable,
                columns: field.dataTable.columns.map((column) => ({
                  ...column,
                })),
                rows: field.dataTable.rows.map((row) => [...row]),
              }
            : undefined,
          chartSpec: field.chartSpec ? { ...field.chartSpec } : undefined,
          layout: clampLayoutToSurface(
            {
              x: sceneLayout.x - box.x,
              y: sceneLayout.y - box.y,
              w: sceneLayout.w,
              h: sceneLayout.h,
            },
            "artboard"
          ),
        };
      }),
    };

    saveModuleAssetEntry(nextEntry);
    setAvailableModules(loadAvailableModuleRegistry());
    handleStageChange("publish");
    setStatus(
      `Saved ${nextEntry.label} to the template library from the current selection.`
    );
  }

  function saveCurrentBriefAsTestCase() {
    const brief = flowRunBrief.trim();
    if (!brief) {
      setStatus("Write a realistic brief before saving a test case.");
      return;
    }

    const testCase: CompositionTestCase = {
      id: `case-${Math.random().toString(36).slice(2, 10)}`,
      label: `Case ${savedTestCases.length + 1}`,
      brief,
      moduleId: draft.id,
      skillIds: (draft.defaultSkillRequirements ?? [])
        .filter((requirement) => requirement.defaultEnabled)
        .map((requirement) => requirement.skillId),
      expectedBehaviors: [],
      expectedWarnings: [],
      tags: ["local"],
    };

    const asset = saveCompositionTestCaseRecord({
      moduleId: draft.id,
      entry: draft,
      testCase,
    });
    setSavedTestCases(asset.testCases);
    setSavedTestRuns(asset.testRuns);
    setSelectedSavedTestCaseId(testCase.id);
    setStatus(`Saved ${testCase.label} for this template.`);
  }

  function runSavedCompositionCase(testCase: CompositionTestCase) {
    const run = runCompositionTestCase({
      testCase,
      entry: draft,
    });
    if (!run) {
      setStatus("Connect Start to at least one output before running tests.");
      return;
    }

    const asset = appendCompositionTestRunRecord({
      moduleId: draft.id,
      entry: draft,
      run,
    });
    setSavedTestCases(asset.testCases);
    setSavedTestRuns(asset.testRuns);
    setSelectedSavedTestCaseId(testCase.id);
    setStatus(
      `${testCase.label} completed with ${run.result.toUpperCase()} evaluation.`
    );
  }

  function removeSavedCompositionCase(caseId: string) {
    const asset = deleteCompositionTestCaseRecord({
      moduleId: draft.id,
      caseId,
    });
    setSavedTestCases(asset?.testCases ?? []);
    setSavedTestRuns(asset?.testRuns ?? []);
    setSelectedSavedTestCaseId((current) =>
      current === caseId ? asset?.testCases[0]?.id ?? null : current
    );
    setStatus("Removed the saved test case.");
  }

  function saveDraft() {
    const normalizedId = draft.id.trim();
    if (!normalizedId) {
      setStatus("Template id is required.");
      return;
    }

    const normalizedRequirements = (draft.defaultSkillRequirements ?? [])
      .map((requirement) => {
        const resolvedSkill = getAvailableSkillDefinitionById(
          requirement.skillId
        );
        return {
          ...requirement,
          skillId: requirement.skillId.trim(),
          reason: requirement.reason.trim(),
          label:
            requirement.label?.trim() ||
            resolvedSkill?.label ||
            requirement.skillId,
          description:
            requirement.description?.trim() ||
            resolvedSkill?.semanticPromise ||
            requirement.reason,
          source: requirement.source ?? "skill",
        } satisfies ModuleSkillRequirement;
      })
      .filter((requirement) => requirement.skillId && requirement.reason);

    const nextSkillBindings = normalizedRequirements.map((requirement) => ({
      id: requirement.skillId,
      label: requirement.label ?? requirement.skillId,
      status: requirement.status,
      description: requirement.description ?? requirement.reason,
      source: requirement.source ?? "skill",
      skillPath: requirement.skillPath,
    }));

    const nextDraft: ModuleRegistryEntry = {
      ...draft,
      id: normalizedId,
      label: draft.label.trim() || "Untitled template",
      semanticRole: draft.semanticRole.trim(),
      description: draft.description.trim(),
      promptHint: draft.promptHint.trim(),
      useCases: splitLines(toLines(draft.useCases)),
      searchTerms: splitLines(toLines(draft.searchTerms)),
      moduleFrame: normalizeModuleFrameLayout(draft.moduleFrame, moduleFrame),
      connections: connections.map((connection) => ({
        ...connection,
        id:
          connection.id.trim() ||
          `connection-${Math.random().toString(36).slice(2, 8)}`,
      })),
      thinkingFlow: {
        nodes: thinkingFlowNodes.map((node) => ({
          id: node.id.trim(),
          label: node.label.trim() || getThinkingFlowNodeLabel(node.kind),
          detail: node.detail.trim(),
          kind: node.kind,
          x: node.x,
          y: node.y,
          w: node.w,
          h: node.h,
          fieldId: node.fieldId,
          toolConfig: normalizeThinkingFlowToolConfig(node.toolConfig),
        })),
        edges: thinkingFlowEdges.map((edge) => ({
          ...edge,
          id:
            edge.id.trim() || `edge-${Math.random().toString(36).slice(2, 8)}`,
        })),
      },
      fields: draft.fields
        .map((field) => ({
          ...field,
          id:
            field.id.trim() ||
            `field-${Math.random().toString(36).slice(2, 8)}`,
          label: field.label.trim() || "Untitled field",
          description:
            field.description.trim() ||
            "Describe what this block should communicate or help generate.",
          example: field.example?.trim() || undefined,
          outputContract: normalizeFieldOutputContract(field.outputContract),
          dataTable: field.dataTable
            ? {
                ...field.dataTable,
                raw: field.dataTable.raw,
                columns: field.dataTable.columns.map((column) => ({
                  ...column,
                  id: column.id.trim(),
                  label: column.label.trim() || "Column",
                })),
                rows: field.dataTable.rows.map((row) =>
                  row.map((cell) => cell.trim())
                ),
              }
            : undefined,
          chartSpec: field.chartSpec ? { ...field.chartSpec } : undefined,
          surface: getFieldSurface(field),
          layout: field.layout
            ? clampLayoutToSurface(field.layout, getFieldSurface(field))
            : undefined,
        }))
        .filter((field) => field.label && field.description),
      defaultSkillRequirements: normalizedRequirements,
      skillBindings: nextSkillBindings,
      supportedSkillClasses: draft.supportedSkillClasses ?? [
        "framework",
        "domain",
        "output",
      ],
      incompatibleSkillIds: (draft.incompatibleSkillIds ?? [])
        .map((value) => value.trim())
        .filter(Boolean),
      examples: (draft.examples ?? [])
        .map((example) => ({
          ...example,
          id:
            example.id.trim() ||
            `example-${Math.random().toString(36).slice(2, 8)}`,
          label: example.label.trim() || "Example",
          description:
            example.description.trim() ||
            "Describe where this template is strongest.",
        }))
        .filter((example) => example.label && example.description),
    };

    if (
      (nextDraft.status === "beta" || nextDraft.status === "stable") &&
      !testEvidenceReady
    ) {
      setStatus(
        "Save and pass at least one composition test before promoting this template into the public beta or stable lanes."
      );
      return;
    }

    const asset = saveModuleAssetEntry(nextDraft);
    if ((nextDraft.status === "beta" || nextDraft.status === "stable") && latestSavedTestRun) {
      const artifact: CompositionPublishArtifact = {
        id: `publish-${Math.random().toString(36).slice(2, 10)}`,
        version: 1,
        moduleId: nextDraft.id,
        skillIds: latestSavedTestRun.skillIds,
        presetId: null,
        publishedScope: nextDraft.scope,
        publishedStatus: nextDraft.status,
        basedOnTestRunIds: [latestSavedTestRun.id],
        versionNote: publishVersionNote.trim() || "Local authoring release",
        publishedAt: new Date().toISOString(),
        publishedBy: "local-author",
      };
      appendCompositionPublishArtifactRecord({
        moduleId: nextDraft.id,
        entry: nextDraft,
        artifact,
      });
    }

    setSavedTestCases(asset.testCases);
    setSavedTestRuns(asset.testRuns);
    refreshModules(nextDraft);
    navigate(`/templates/${encodeURIComponent(nextDraft.id)}`);
    setStatus(`Saved ${nextDraft.label} to the template platform.`);
  }

  function removeDraft() {
    if (draft.scope === "core") {
      setStatus("Core templates cannot be deleted here. Fork them instead.");
      return;
    }
    if (
      !window.confirm(`Delete "${draft.label}" from your local template library?`)
    ) {
      return;
    }

    deleteModuleAsset(draft.id);
    refreshModules(createBlankModuleDraft());
    setFlowRunBrief("");
    setFlowRunResult(null);
    setSavedTestCases([]);
    setSavedTestRuns([]);
    setSelectedFlowNodeId(null);
    setSelectedFlowNodeIds([]);
    setStatus("Deleted the template from your local library.");
  }

  function createFromBlank() {
    const nextDraft = createBlankModuleDraft();
    setDraft(nextDraft);
    setFlowRunBrief("");
    setFlowRunResult(null);
    setSelectedFlowNodeId(null);
    setSelectedFlowNodeIds([]);
    setSelectedFieldIds(nextDraft.fields[0] ? [nextDraft.fields[0].id] : []);
    closeTemplateLibrary();
    setModuleFrameInteractionState(null);
    setPendingConnectionSourceId(null);
    setConnectionPreviewPoint(null);
    handleStageChange("define");
    setStatus("Started a blank page template.");
    requestAnimationFrame(() => fitWorkspaceToView());
  }

  return (
    <article className="studio-terminal-root h-screen overflow-hidden text-[var(--studio-ink)]">
      <div className="mx-auto grid h-full max-w-[1880px] xl:grid-cols-[248px_minmax(0,1fr)_320px]">
        <AuthoringStageRail
          view={{
            draft,
            currentRendererLabel: currentRendererDetail.label,
            stageItems,
            completedStageCount,
            activeStageMeta,
            activeStageIndex,
            nextSuggestedStage,
            connectionCount: connections.length,
          }}
          actions={{
            handleStageChange,
          }}
        />

        <div className="relative min-h-0">
          <TemplateCanvasStage
            view={{
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
            }}
            actions={{
              addCanvasObject,
              addThinkingFlowNode,
              completeConnection,
              completeThinkingFlowConnection,
              fitFlowBoardToView,
              fitWorkspaceToView,
              getScenePoint,
              handleFieldSelection,
              handleFlowViewportWheel,
              handleWorkspaceWheel,
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
            }}
          />

          <TemplateLibraryModal
            isOpen={isLibraryOpen}
            searchQuery={searchQuery}
            selectedCollection={selectedCollection}
            draft={draft}
            recentModules={recentModules}
            recommendedBaseModules={recommendedBaseModules}
            filteredModules={filteredModules}
            onClose={closeLibraryModal}
            onCreateFromBlank={createFromBlank}
            onOpenEntry={openLibraryEntry}
            onSearchQueryChange={setSearchQuery}
            onSelectedCollectionChange={setSelectedCollection}
          />
        </div>

        <aside className="min-h-0 overflow-y-auto border-l border-[var(--studio-line)] bg-[rgba(10,10,10,0.92)]">
          <div className="border-b border-[var(--studio-line)] px-4 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
              Inspector
            </div>
            <div className="mt-1 text-sm font-semibold text-[var(--studio-ink)]">
              {activeStageMeta.label}
            </div>
            <div className="mt-1 text-[12px] leading-5 text-[var(--studio-muted)]">
              {activeStageMeta.description}
            </div>
          </div>

          <div className="space-y-0">
            {activeStage === "define" ? (
              <DefineStagePanel
                draft={draft}
                rendererLabel={currentRendererDetail.label}
                frameContainedCount={frameContainedFields.length}
                frameOutsideCount={frameOutsideFields.length}
                moduleFrame={moduleFrame}
                isReady={defineReady}
                onOpenLibrary={openLibraryModal}
                onCreateFromBlank={createFromBlank}
                onLabelChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    label: value,
                    id:
                      current.scope === "core"
                        ? current.id
                        : `${current.scope}.${
                            slugify(value || "custom-template") ||
                            "custom-template"
                          }.${current.kind}`,
                  }))
                }
                onSemanticRoleChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    semanticRole: value,
                  }))
                }
                onPromptHintChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    promptHint: value,
                  }))
                }
                onContinue={() => handleStageChange("compose")}
              />
            ) : null}

            {activeStage === "compose" ? (
              <ComposeStagePanel
                view={{
                  draft,
                  selectedFieldIds,
                  selectedFieldCount,
                  selectedField,
                  selectedObjectKind,
                  selectedOutputField,
                  selectedConnections,
                  chartPreviewByFieldId,
                  chartSourceByFieldId,
                }}
                actions={{
                  handleFieldSelection,
                  saveSelectedAsModule,
                  updateDraftFieldById,
                  updateFieldAiState,
                  updateFieldOutputContract,
                  updateDataBlockRaw,
                  updateChartKind,
                  removeConnection,
                  setDraft,
                }}
              />
            ) : null}

            {activeStage === "semantics" ? (
              <SemanticsStagePanel
                view={{
                  selectedFlowNodeIds,
                  selectedFlowNode,
                  selectedFlowNodeTheme,
                  SelectedFlowNodeIcon,
                  selectedFlowField,
                  selectedFlowToolConfig,
                }}
                actions={{
                  updateFieldOutputContract,
                  updateThinkingFlowNode,
                }}
              />
            ) : null}

            {activeStage === "test" ? (
              <TestStagePanel
                view={{
                  colorReady,
                  modulePalette,
                  selectedField,
                  selectedObjectKind,
                }}
                actions={{
                  updateDraftFieldById,
                }}
              />
            ) : null}

            {activeStage === "publish" ? (
              <PublishStagePanel
                view={{
                  flowRunResult,
                  flowRunTraceSteps,
                  flowRunOutputEntries,
                  flowRunBrief,
                  savedTestCases,
                  savedTestRuns,
                  selectedSavedTestCase,
                  trustSummary,
                  publishReady,
                  publishChecklist,
                  draft,
                  publishVersionNote,
                  availableSkills,
                  relatedPresets,
                }}
                actions={{
                  setFlowRunBrief,
                  runThinkingFlowPreview,
                  saveCurrentBriefAsTestCase,
                  setCanvasMode,
                  clearThinkingFlowPreview,
                  setSelectedSavedTestCaseId,
                  runSavedCompositionCase,
                  removeSavedCompositionCase,
                  setDraft,
                  setPublishVersionNote,
                  saveDraft,
                  removeDraft,
                }}
              />
            ) : null}
          </div>
        </aside>
      </div>
    </article>
  );
}
