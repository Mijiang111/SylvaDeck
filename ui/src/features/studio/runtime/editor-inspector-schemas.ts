import type {
  DataTableModel,
  HtmlChartAxisRole,
  HtmlChartSeriesRole,
  HtmlChartSpec,
  HtmlCanvasTransform,
  HtmlEditableBlock,
  HtmlVisualContentNode,
  HtmlVisualNode,
  HtmlVisualNodeKind,
  HtmlVisualNodeStyle,
  PublishedModuleManifest,
  ScientificDiagramSpec,
} from "../types";
import type { InspectorSchema, InspectorSection } from "./studio/WorkbenchStudioInspector";

type ScientificDiagramConnectivityOption = {
  value: ScientificDiagramSpec["connectivity"];
  label: string;
};

const HTML_CHART_KIND_OPTIONS: Array<{
  value: HtmlChartSpec["kind"];
  label: string;
}> = [
  { value: "bar", label: "Bar" },
  { value: "stacked", label: "Stacked" },
  { value: "line", label: "Line" },
  { value: "waterfall", label: "Waterfall" },
  { value: "combo", label: "Combo" },
  { value: "bubble", label: "Bubble" },
  { value: "matrix", label: "Matrix" },
];

const CHART_SERIES_ROLE_OPTIONS: Array<{
  value: HtmlChartSeriesRole;
  label: string;
}> = [
  { value: "bar", label: "Bar series" },
  { value: "line", label: "Line series" },
];

const CHART_AXIS_ROLE_OPTIONS: Array<{
  value: HtmlChartAxisRole;
  label: string;
}> = [
  { value: "primary", label: "Primary axis" },
  { value: "secondary", label: "Secondary axis" },
];

const DEFAULT_VISUAL_NODE_KINDS: readonly HtmlVisualNodeKind[] = [
  "surface",
  "divider",
  "badge",
  "highlight",
  "annotation",
  "rail",
  "chart-frame",
];

export type HtmlEditorTextBlockPatch = {
  text?: string;
  items?: string[];
  fontSize?: number;
};

export function createHtmlEditorTextInspectorSchema(args: {
  block: HtmlEditableBlock;
  transform: HtmlCanvasTransform | null;
  pageNumber: number;
  updateBlock: (
    pageNumber: number,
    blockId: string,
    nextContent: HtmlEditorTextBlockPatch,
  ) => void;
  extractBlockAsModule: (block: HtmlEditableBlock) => void;
}): InspectorSchema {
  const { block, extractBlockAsModule, pageNumber, transform, updateBlock } = args;
  const contentField =
    block.kind === "list"
      ? {
          id: `block-items-${block.id}`,
          kind: "textarea" as const,
          label: "List items",
          value: (block.items ?? []).join("\n"),
          description: "One line per item. Updates the selected list directly from the side panel.",
          onChange: (value: string) =>
            updateBlock(pageNumber, block.id, {
              items: value
                .split("\n")
                .map((item) => item.trim())
                .filter(Boolean),
            }),
          debounceMs: 180,
        }
      : {
          id: `block-content-${block.id}`,
          kind: "textarea" as const,
          label: "Text",
          value: block.text ?? "",
          description: "Edit the selected text block directly from the side panel.",
          onChange: (value: string) =>
            updateBlock(pageNumber, block.id, {
              text: value,
            }),
          debounceMs: 180,
        };

  return {
    id: "text-inspector",
    title: "Text block",
    description: "Edit copy and typography for the selected text block from the side panel.",
    sections: [
      {
        id: "meta",
        title: "Selection",
        fields: [
          {
            id: `block-extract-${block.id}`,
            kind: "actions",
            label: "Authoring handoff",
            actions: [
              {
                id: `extract-block-${block.id}`,
                label: "Extract as module",
                onPress: () => extractBlockAsModule(block),
              },
            ],
          },
          {
            id: `block-kind-${block.id}`,
            kind: "readonly",
            label: "Block kind",
            value: block.kind,
          },
          {
            id: `block-source-${block.id}`,
            kind: "readonly",
            label: "Source tag",
            value: block.sourceTag,
          },
          {
            id: `block-canvas-mode-${block.id}`,
            kind: "readonly",
            label: "Canvas mode",
            value: transform
              ? `Freeform · ${Math.round(transform.frame.x)}, ${Math.round(transform.frame.y)}`
              : "Flow layout",
            description: transform
              ? "This block is currently placed freely on the canvas."
              : "This block is following the page flow.",
          },
        ],
      },
      {
        id: "typography",
        title: "Typography",
        fields: [
          {
            id: `block-font-size-${block.id}`,
            kind: "number",
            label: "Font size",
            value: Math.round(block.fontSize ?? 12),
            min: 8,
            max: 120,
            step: 1,
            description: "Adjust the selected text block without affecting the rest of the page.",
            onChange: (value: number) =>
              updateBlock(pageNumber, block.id, { fontSize: value }),
            debounceMs: 180,
          },
        ],
      },
      {
        id: "content",
        title: "Content",
        fields: [contentField],
      },
    ],
  };
}

export function createHtmlEditorVisualInspectorSchema(args: {
  node: HtmlVisualNode;
  transform: HtmlCanvasTransform | null;
  contentNodes: HtmlVisualContentNode[];
  moduleSections: InspectorSection[];
  recommendedModuleManifests: PublishedModuleManifest[];
  addVisualKinds?: readonly HtmlVisualNodeKind[];
  duplicateNode: () => void;
  extractVisualAsModule: (
    node: HtmlVisualNode,
    contentNodes: HtmlVisualContentNode[],
  ) => void;
  deleteNode: () => void;
  replaceWithModule: (manifest: PublishedModuleManifest) => void;
  addVisualElement: (kind: HtmlVisualNodeKind) => void;
  updateNodeStyle: (nextStyle: Partial<HtmlVisualNodeStyle>) => void;
  duplicateContentNode: (contentNodeId: string) => void;
  deleteContentNode: (contentNodeId: string) => void;
}): InspectorSchema {
  const {
    addVisualElement,
    addVisualKinds = DEFAULT_VISUAL_NODE_KINDS,
    contentNodes,
    deleteContentNode,
    deleteNode,
    duplicateContentNode,
    duplicateNode,
    extractVisualAsModule,
    moduleSections,
    node,
    recommendedModuleManifests,
    replaceWithModule,
    transform,
    updateNodeStyle,
  } = args;

  return {
    id: "visual-inspector",
    title: "Visual module",
    description: "Treat each annotation, surface, divider, or frame as an addressable design node.",
    sections: [
      {
        id: "selected-node",
        title: "Selected module",
        fields: [
          ...(node.moduleLabel
            ? [
                {
                  id: `node-module-${node.id}`,
                  kind: "readonly" as const,
                  label: "Applied capability",
                  value: node.moduleLabel,
                },
              ]
            : []),
          {
            id: "node-kind",
            kind: "readonly",
            label: "Kind",
            value: node.kind,
          },
          {
            id: `node-canvas-mode-${node.id}`,
            kind: "readonly",
            label: "Canvas mode",
            value: transform
              ? `Freeform · ${Math.round(transform.frame.x)}, ${Math.round(transform.frame.y)}`
              : "Flow layout",
            description: transform
              ? "This visual node is currently placed freely on the canvas."
              : "This visual node is following the page flow.",
          },
          {
            id: "node-actions",
            kind: "actions",
            label: "Node actions",
            actions: [
              {
                id: "duplicate-node",
                label: "Duplicate",
                onPress: duplicateNode,
              },
              {
                id: "extract-node",
                label: "Extract as module",
                onPress: () => extractVisualAsModule(node, contentNodes),
              },
              {
                id: "delete-node",
                label: "Delete",
                onPress: deleteNode,
                tone: "danger",
              },
            ],
          },
        ],
      },
      ...(recommendedModuleManifests.length > 0
        ? [
            {
              id: "replace-node",
              title: "Replace with module",
              fields: [
                {
                  id: `replace-node-actions-${node.id}`,
                  kind: "actions" as const,
                  label: "Published capabilities",
                  description: "Swap the selected visual region onto a published module style and contract.",
                  actions: recommendedModuleManifests.map((manifest) => ({
                    id: `replace-node-${manifest.moduleId}`,
                    label: manifest.label,
                    onPress: () => replaceWithModule(manifest),
                  })),
                },
              ],
            },
          ]
        : []),
      ...moduleSections,
      {
        id: "new-node",
        title: "Add nearby module",
        fields: [
          {
            id: "add-node-actions",
            kind: "actions",
            label: "Add visual",
            actions: addVisualKinds.map((kind) => ({
              id: `add-${kind}`,
              label: kind.replace(/-/g, " "),
              onPress: () => addVisualElement(kind),
            })),
          },
        ],
      },
      {
        id: "node-style",
        title: "Style",
        fields: [
          {
            id: `node-background-${node.id}`,
            kind: "color",
            label: "Background",
            value: node.style.background ?? "#ffffff",
            onChange: (value: string) => updateNodeStyle({ background: value }),
          },
          {
            id: `node-border-${node.id}`,
            kind: "color",
            label: "Border",
            value: node.style.border ?? "#d7d1c6",
            onChange: (value: string) => updateNodeStyle({ border: value }),
          },
          {
            id: `node-accent-${node.id}`,
            kind: "color",
            label: "Accent",
            value: node.style.accent ?? "#c6994a",
            onChange: (value: string) => updateNodeStyle({ accent: value }),
          },
          {
            id: `node-opacity-${node.id}`,
            kind: "range",
            label: "Opacity",
            value: Math.round((node.style.opacity ?? 1) * 100),
            min: 10,
            max: 100,
            step: 5,
            onChange: (value: number) => updateNodeStyle({ opacity: value / 100 }),
          },
          {
            id: `node-radius-${node.id}`,
            kind: "number",
            label: "Radius",
            value: Math.round(node.style.radius ?? 0),
            min: 0,
            max: 48,
            step: 1,
            onChange: (value: number) => updateNodeStyle({ radius: value }),
          },
          {
            id: `node-padding-${node.id}`,
            kind: "number",
            label: "Padding",
            value: Math.round(node.style.padding ?? 0),
            min: 0,
            max: 64,
            step: 1,
            onChange: (value: number) => updateNodeStyle({ padding: value }),
          },
          {
            id: `node-width-${node.id}`,
            kind: "number",
            label: "Width %",
            value: Math.round(node.style.widthPercent ?? 100),
            min: 10,
            max: 100,
            step: 1,
            onChange: (value: number) => updateNodeStyle({ widthPercent: value }),
          },
        ],
      },
      ...(contentNodes.length
        ? [
            {
              id: "node-content",
              title: "Content nodes",
              fields: contentNodes.flatMap((contentNode) => [
                {
                  id: `content-${contentNode.id}`,
                  kind: "readonly" as const,
                  label: `${contentNode.kind}`,
                  value: contentNode.text,
                },
                {
                  id: `content-actions-${contentNode.id}`,
                  kind: "actions" as const,
                  label: "Content actions",
                  actions: [
                    {
                      id: `duplicate-${contentNode.id}`,
                      label: "Duplicate",
                      onPress: () => duplicateContentNode(contentNode.id),
                    },
                    {
                      id: `delete-${contentNode.id}`,
                      label: "Delete",
                      onPress: () => deleteContentNode(contentNode.id),
                      tone: "danger" as const,
                    },
                  ],
                },
              ]),
            },
          ]
        : []),
    ],
  };
}

export function createHtmlEditorChartModuleInspectorSections(args: {
  nodeId: string;
  chartSpec: HtmlChartSpec;
  chartDataTable: DataTableModel;
  nodeStyle: HtmlVisualNodeStyle;
  getChartRawData: (current: HtmlChartSpec) => string;
  rebuildChartSpecFromRawData: (args: {
    current: HtmlChartSpec;
    raw: string;
  }) => HtmlChartSpec | null;
  patchChartSpec: (
    updater: (current: HtmlChartSpec) => HtmlChartSpec | null,
  ) => void;
  updateNodeStyle: (nextStyle: Partial<HtmlVisualNodeStyle>) => void;
}): InspectorSection[] {
  const {
    chartDataTable,
    chartSpec,
    getChartRawData,
    nodeId,
    nodeStyle,
    patchChartSpec,
    rebuildChartSpecFromRawData,
    updateNodeStyle,
  } = args;

  return [
    {
      id: "chart-module",
      title: "Chart module",
      description:
        "Edit the chart as structured data so titles, series values, and labels stay in sync.",
      fields: [
        {
          id: `chart-kind-${nodeId}`,
          kind: "select",
          label: "Chart kind",
          value: chartSpec.kind,
          options: HTML_CHART_KIND_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          })),
          onChange: (value: string) =>
            patchChartSpec((current) =>
              rebuildChartSpecFromRawData({
                current: {
                  ...current,
                  kind: value as HtmlChartSpec["kind"],
                } as HtmlChartSpec,
                raw: getChartRawData(current),
              }),
            ),
        },
        {
          id: `chart-title-${nodeId}`,
          kind: "text",
          label: "Title",
          value: chartSpec.title,
          onChange: (value: string) =>
            patchChartSpec((current) => ({
              ...current,
              title: value,
            })),
        },
        {
          id: `chart-subtitle-${nodeId}`,
          kind: "textarea",
          label: "Subtitle / insight",
          value: [chartSpec.subtitle, chartSpec.insight].filter(Boolean).join("\n"),
          onChange: (value: string) =>
            patchChartSpec((current) => {
              const [subtitle, ...rest] = value.split("\n");
              return {
                ...current,
                subtitle: subtitle?.trim() ?? "",
                insight: rest.join(" ").trim(),
              };
            }),
        },
        ...(chartSpec.kind === "matrix"
          ? []
          : [
              {
                id: `chart-unit-${nodeId}`,
                kind: "text" as const,
                label: "Primary unit",
                value: chartSpec.unit,
                onChange: (value: string) =>
                  patchChartSpec((current) =>
                    current.kind === "matrix"
                      ? current
                      : {
                          ...current,
                          unit: value,
                        },
                  ),
              },
            ]),
        ...(chartSpec.kind === "combo"
          ? [
              {
                id: `chart-secondary-unit-${nodeId}`,
                kind: "text" as const,
                label: "Secondary unit",
                value: chartSpec.secondaryUnit ?? "",
                onChange: (value: string) =>
                  patchChartSpec((current) =>
                    current.kind === "combo"
                      ? {
                          ...current,
                          secondaryUnit: value,
                        }
                      : current,
                  ),
              },
            ]
          : []),
        {
          id: `chart-data-${nodeId}`,
          kind: "textarea",
          label:
            chartSpec.kind === "bubble"
              ? "Bubble data (Label / X / Y / Size / Group)"
              : chartSpec.kind === "matrix"
                ? "Matrix data (Item / Detail / X / Y / W / H)"
              : "Chart data (Category + series)",
          value: chartDataTable.raw,
          description:
            "Paste TSV or CSV. Studio will rebuild the chart module from this table instead of loose SVG labels.",
          onChange: (value: string) =>
            patchChartSpec((current) =>
              rebuildChartSpecFromRawData({
                current,
                raw: value,
              }),
            ),
        },
        {
          id: `chart-summary-${nodeId}`,
          kind: "readonly",
          label: "Data summary",
          value:
            chartSpec.kind === "bubble"
              ? `${chartSpec.points.length} points · ${chartDataTable.columns.length} columns`
              : chartSpec.kind === "matrix"
                ? `${chartSpec.items.length} items · ${chartDataTable.columns.length} columns`
              : `${chartDataTable.rows.length} categories · ${chartSpec.series.length} series`,
        },
        {
          id: `chart-accent-${nodeId}`,
          kind: "color",
          label: "Accent color",
          value: nodeStyle.accent ?? "#2a6f97",
          onChange: (value: string) => updateNodeStyle({ accent: value }),
        },
      ],
    },
    ...(chartSpec.kind === "combo"
      ? chartSpec.series.map((series, index) => ({
          id: `chart-series-${index + 1}`,
          title: `Series ${index + 1}`,
          fields: [
            {
              id: `chart-series-label-${nodeId}-${series.id}`,
              kind: "text" as const,
              label: "Series label",
              value: series.label,
              onChange: (value: string) =>
                patchChartSpec((current) =>
                  current.kind === "combo"
                    ? {
                        ...current,
                        series: current.series.map((entry) =>
                          entry.id === series.id ? { ...entry, label: value } : entry,
                        ),
                      }
                    : current,
                ),
            },
            {
              id: `chart-series-role-${nodeId}-${series.id}`,
              kind: "select" as const,
              label: "Series role",
              value: series.role ?? "bar",
              options: CHART_SERIES_ROLE_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              })),
              onChange: (value: string) =>
                patchChartSpec((current) =>
                  current.kind === "combo"
                    ? {
                        ...current,
                        series: current.series.map((entry) =>
                          entry.id === series.id
                            ? { ...entry, role: value as HtmlChartSeriesRole }
                            : entry,
                        ),
                      }
                    : current,
                ),
            },
            {
              id: `chart-series-axis-${nodeId}-${series.id}`,
              kind: "select" as const,
              label: "Axis",
              value: series.axis ?? "primary",
              options: CHART_AXIS_ROLE_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              })),
              onChange: (value: string) =>
                patchChartSpec((current) =>
                  current.kind === "combo"
                    ? {
                        ...current,
                        series: current.series.map((entry) =>
                          entry.id === series.id
                            ? { ...entry, axis: value as HtmlChartAxisRole }
                            : entry,
                        ),
                      }
                    : current,
                ),
            },
            {
              id: `chart-series-color-${nodeId}-${series.id}`,
              kind: "color" as const,
              label: "Series color",
              value: series.color ?? "#2a6f97",
              onChange: (value: string) =>
                patchChartSpec((current) =>
                  current.kind === "combo"
                    ? {
                        ...current,
                        series: current.series.map((entry) =>
                          entry.id === series.id ? { ...entry, color: value } : entry,
                        ),
                      }
                    : current,
                ),
            },
          ],
        }))
      : []),
  ];
}

function updateScientificDiagramSideNote(args: {
  current: ScientificDiagramSpec;
  side: "left" | "right";
  value: string;
}): ScientificDiagramSpec {
  const existing = args.current.sideNotes.find((note) => note.side === args.side);
  const remaining = args.current.sideNotes.filter((note) => note.side !== args.side);
  const text = args.value.trim();

  return {
    ...args.current,
    sideNotes: text
      ? [
          ...remaining,
          {
            id: existing?.id ?? (args.side === "left" ? "note-1" : "note-2"),
            side: args.side,
            text,
          },
        ].sort((a, b) => a.side.localeCompare(b.side))
      : remaining,
  };
}

function getScientificDiagramLayerNodeMinimum(
  layer: ScientificDiagramSpec["layers"][number],
) {
  return layer.role === "output" || layer.role === "bottleneck" ? 1 : 2;
}

export function createHtmlEditorScientificDiagramInspectorSections(args: {
  nodeId: string;
  diagramSpec: ScientificDiagramSpec;
  nodeStyle: HtmlVisualNodeStyle;
  connectivityOptions: readonly ScientificDiagramConnectivityOption[];
  getLayerCountBounds: (
    connectivity: ScientificDiagramSpec["connectivity"],
  ) => { min: number; max: number };
  switchConnectivity: (
    current: ScientificDiagramSpec,
    connectivity: ScientificDiagramSpec["connectivity"],
  ) => ScientificDiagramSpec;
  resizeLayers: (
    current: ScientificDiagramSpec,
    layerCount: number,
  ) => ScientificDiagramSpec;
  patchDiagramSpec: (
    updater: (current: ScientificDiagramSpec) => ScientificDiagramSpec,
  ) => void;
  updateNodeStyle: (nextStyle: Partial<HtmlVisualNodeStyle>) => void;
}): InspectorSection[] {
  const {
    connectivityOptions,
    diagramSpec,
    getLayerCountBounds,
    nodeId,
    nodeStyle,
    patchDiagramSpec,
    resizeLayers,
    switchConnectivity,
    updateNodeStyle,
  } = args;
  const layerCountBounds = getLayerCountBounds(diagramSpec.connectivity);

  return [
    {
      id: "scientific-diagram",
      title: "Scientific diagram",
      description:
        "Edit the neural-network figure as one deterministic module instead of loose node-and-edge objects.",
      fields: [
        {
          id: `diagram-connectivity-${nodeId}`,
          kind: "select",
          label: "Topology",
          value: diagramSpec.connectivity,
          options: connectivityOptions.map((option) => ({
            value: option.value,
            label: option.label,
          })),
          onChange: (value: string) =>
            patchDiagramSpec((current) =>
              switchConnectivity(current, value as ScientificDiagramSpec["connectivity"]),
            ),
        },
        {
          id: `diagram-layer-count-${nodeId}`,
          kind: "number",
          label: "Layer count",
          value: diagramSpec.layers.length,
          min: layerCountBounds.min,
          max: layerCountBounds.max,
          step: 1,
          onChange: (value: number) =>
            patchDiagramSpec((current) => resizeLayers(current, value)),
        },
        {
          id: `diagram-title-${nodeId}`,
          kind: "text",
          label: "Title",
          value: diagramSpec.title,
          onChange: (value: string) =>
            patchDiagramSpec((current) => ({
              ...current,
              title: value,
            })),
        },
        {
          id: `diagram-caption-${nodeId}`,
          kind: "textarea",
          label: "Caption",
          value: diagramSpec.caption,
          onChange: (value: string) =>
            patchDiagramSpec((current) => ({
              ...current,
              caption: value,
            })),
        },
        {
          id: `diagram-top-label-${nodeId}`,
          kind: "text",
          label: "Top label",
          value: diagramSpec.topLabel,
          onChange: (value: string) =>
            patchDiagramSpec((current) => ({
              ...current,
              topLabel: value,
            })),
        },
        {
          id: `diagram-bottom-label-${nodeId}`,
          kind: "text",
          label: "Bottom label",
          value: diagramSpec.bottomLabel,
          onChange: (value: string) =>
            patchDiagramSpec((current) => ({
              ...current,
              bottomLabel: value,
            })),
        },
        {
          id: `diagram-note-left-${nodeId}`,
          kind: "textarea",
          label: "Left note",
          value: diagramSpec.sideNotes.find((note) => note.side === "left")?.text ?? "",
          onChange: (value: string) =>
            patchDiagramSpec((current) =>
              updateScientificDiagramSideNote({
                current,
                side: "left",
                value,
              }),
            ),
        },
        {
          id: `diagram-note-right-${nodeId}`,
          kind: "textarea",
          label: "Right note",
          value: diagramSpec.sideNotes.find((note) => note.side === "right")?.text ?? "",
          onChange: (value: string) =>
            patchDiagramSpec((current) =>
              updateScientificDiagramSideNote({
                current,
                side: "right",
                value,
              }),
            ),
        },
        {
          id: `diagram-accent-${nodeId}`,
          kind: "color",
          label: "Accent color",
          value: nodeStyle.accent ?? "#2f5d84",
          onChange: (value: string) => updateNodeStyle({ accent: value }),
        },
      ],
    },
    ...diagramSpec.layers.map((layer, index) => ({
      id: `scientific-diagram-layer-${index + 1}`,
      title: `Layer ${index + 1}`,
      fields: [
        {
          id: `diagram-layer-label-${nodeId}-${layer.id}`,
          kind: "text" as const,
          label: "Layer label",
          value: layer.label,
          onChange: (value: string) =>
            patchDiagramSpec((current) => ({
              ...current,
              layers: current.layers.map((entry) =>
                entry.id === layer.id ? { ...entry, label: value } : entry,
              ),
            })),
        },
        {
          id: `diagram-layer-nodes-${nodeId}-${layer.id}`,
          kind: "number" as const,
          label: "Node count",
          value: layer.nodeCount,
          min: getScientificDiagramLayerNodeMinimum(layer),
          max: 9,
          step: 1,
          onChange: (value: number) =>
            patchDiagramSpec((current) => ({
              ...current,
              layers: current.layers.map((entry) =>
                entry.id === layer.id
                  ? {
                      ...entry,
                      nodeCount: Math.max(
                        getScientificDiagramLayerNodeMinimum(layer),
                        Math.min(9, Math.round(value)),
                      ),
                    }
                  : entry,
              ),
            })),
        },
      ],
    })),
  ];
}

export function createHtmlEditorTableModuleInspectorSections(args: {
  nodeId: string;
  tableSpec: DataTableModel;
  nodeStyle: HtmlVisualNodeStyle;
  parseTableRaw: (raw: string) => DataTableModel;
  updateTableSpec: (nextTableSpec: DataTableModel) => void;
  updateNodeStyle: (nextStyle: Partial<HtmlVisualNodeStyle>) => void;
}): InspectorSection[] {
  const {
    nodeId,
    nodeStyle,
    parseTableRaw,
    tableSpec,
    updateNodeStyle,
    updateTableSpec,
  } = args;

  return [
    {
      id: "table-module",
      title: "Table module",
      description:
        "Edit the whole table as raw structured data instead of trying to select cell-by-cell surfaces.",
      fields: [
        {
          id: `table-data-${nodeId}`,
          kind: "textarea",
          label: "Table data (TSV / CSV)",
          value: tableSpec.raw,
          onChange: (value: string) => updateTableSpec(parseTableRaw(value)),
        },
        {
          id: `table-summary-${nodeId}`,
          kind: "readonly",
          label: "Shape",
          value: `${tableSpec.columns.length} columns · ${tableSpec.rows.length} rows`,
        },
        {
          id: `table-columns-${nodeId}`,
          kind: "readonly",
          label: "Columns",
          value: tableSpec.columns
            .map((column) => `${column.label} · ${column.type}`)
            .join(" | "),
        },
        {
          id: `table-accent-${nodeId}`,
          kind: "color",
          label: "Accent color",
          value: nodeStyle.accent ?? "#2a6f97",
          onChange: (value: string) => updateNodeStyle({ accent: value }),
        },
      ],
    },
  ];
}
