import assert from "node:assert/strict";
import test from "node:test";
import type {
  DataTableModel,
  HtmlChartSpec,
  HtmlEditableBlock,
  HtmlVisualContentNode,
  HtmlVisualNode,
  HtmlVisualNodeStyle,
  PublishedModuleManifest,
  ScientificDiagramSpec,
} from "../types";
import {
  createHtmlEditorChartModuleInspectorSections,
  createHtmlEditorScientificDiagramInspectorSections,
  createHtmlEditorTableModuleInspectorSections,
  createHtmlEditorTextInspectorSchema,
  createHtmlEditorVisualInspectorSchema,
} from "./editor-inspector-schemas";

const textBlock: HtmlEditableBlock = {
  id: "headline",
  kind: "headline",
  text: "Operator trust is the bottleneck",
  sourceTag: "h1",
  sourceIndex: 0,
  fontSize: 36,
};

const listBlock: HtmlEditableBlock = {
  id: "bullets",
  kind: "list",
  items: ["Fast setup", "Recoverable sessions"],
  sourceTag: "ul",
  sourceIndex: 1,
};

test("text inspector schema exposes selection, typography, and content fields", () => {
  const patches: Array<{ pageNumber: number; blockId: string; nextContent: unknown }> = [];
  const extracted: HtmlEditableBlock[] = [];
  const schema = createHtmlEditorTextInspectorSchema({
    block: textBlock,
    transform: {
      mode: "freeform",
      frame: { x: 24.2, y: 48.7, w: 360, h: 90 },
      layer: "foreground",
      layerOrder: 0,
      lockedByUser: true,
    },
    pageNumber: 2,
    updateBlock: (pageNumber, blockId, nextContent) =>
      patches.push({ pageNumber, blockId, nextContent }),
    extractBlockAsModule: (block) => extracted.push(block),
  });

  assert.equal(schema.id, "text-inspector");
  assert.equal(schema.sections[0]?.fields[3]?.kind, "readonly");
  assert.equal(schema.sections[0]?.fields[3]?.value, "Freeform · 24, 49");

  const fontSizeField = schema.sections[1]?.fields[0];
  assert.equal(fontSizeField?.kind, "number");
  if (fontSizeField?.kind === "number") {
    fontSizeField.onChange(42);
  }
  assert.deepEqual(patches.pop(), {
    pageNumber: 2,
    blockId: "headline",
    nextContent: { fontSize: 42 },
  });

  const contentField = schema.sections[2]?.fields[0];
  assert.equal(contentField?.kind, "textarea");
  if (contentField?.kind === "textarea") {
    contentField.onChange("New headline");
  }
  assert.deepEqual(patches.pop(), {
    pageNumber: 2,
    blockId: "headline",
    nextContent: { text: "New headline" },
  });

  const extractAction = schema.sections[0]?.fields[0];
  assert.equal(extractAction?.kind, "actions");
  if (extractAction?.kind === "actions") {
    extractAction.actions[0]?.onPress();
  }
  assert.deepEqual(extracted, [textBlock]);
});

test("list inspector schema trims empty list items before patching", () => {
  const patches: Array<{ pageNumber: number; blockId: string; nextContent: unknown }> = [];
  const schema = createHtmlEditorTextInspectorSchema({
    block: listBlock,
    transform: null,
    pageNumber: 1,
    updateBlock: (pageNumber, blockId, nextContent) =>
      patches.push({ pageNumber, blockId, nextContent }),
    extractBlockAsModule: () => undefined,
  });

  const canvasModeField = schema.sections[0]?.fields[3];
  assert.equal(canvasModeField?.kind, "readonly");
  assert.equal(canvasModeField?.value, "Flow layout");

  const contentField = schema.sections[2]?.fields[0];
  assert.equal(contentField?.kind, "textarea");
  if (contentField?.kind === "textarea") {
    contentField.onChange(" First \n\n Second ");
  }

  assert.deepEqual(patches, [
    {
      pageNumber: 1,
      blockId: "bullets",
      nextContent: { items: ["First", "Second"] },
    },
  ]);
});

test("table module inspector schema exposes raw data, shape, columns, and accent", () => {
  const tableSpec: DataTableModel = {
    raw: "Metric\tValue\nRevenue\t120\nMargin\t32%",
    hasHeader: true,
    columns: [
      { id: "metric", label: "Metric", type: "text" },
      { id: "value", label: "Value", type: "text" },
    ],
    rows: [
      ["Revenue", "120"],
      ["Margin", "32%"],
    ],
  };
  const patchedTables: DataTableModel[] = [];
  const patchedStyles: Array<Partial<HtmlVisualNodeStyle>> = [];

  const [section] = createHtmlEditorTableModuleInspectorSections({
    nodeId: "table",
    tableSpec,
    nodeStyle: { accent: "#123456" },
    parseTableRaw: (raw) => ({
      raw,
      hasHeader: true,
      columns: [
        { id: "name", label: "Name", type: "text" },
        { id: "score", label: "Score", type: "number" },
      ],
      rows: [
        ["A", "1"],
        ["B", "2"],
      ],
    }),
    updateTableSpec: (nextTableSpec) => patchedTables.push(nextTableSpec),
    updateNodeStyle: (nextStyle) => patchedStyles.push(nextStyle),
  });

  assert.equal(section?.id, "table-module");
  assert.equal(section.fields[1]?.kind, "readonly");
  assert.equal(section.fields[1]?.value, "2 columns · 2 rows");
  assert.equal(section.fields[2]?.kind, "readonly");
  assert.equal(section.fields[2]?.value, "Metric · text | Value · text");

  const dataField = section.fields[0];
  assert.equal(dataField?.kind, "textarea");
  if (dataField?.kind === "textarea") {
    dataField.onChange("Name,Score\nA,1\nB,2");
  }
  assert.equal(patchedTables[0]?.columns.length, 2);
  assert.equal(patchedTables[0]?.rows.length, 2);

  const accentField = section.fields[3];
  assert.equal(accentField?.kind, "color");
  assert.equal(accentField?.value, "#123456");
  if (accentField?.kind === "color") {
    accentField.onChange("#abcdef");
  }
  assert.deepEqual(patchedStyles, [{ accent: "#abcdef" }]);
});

test("chart module inspector schema patches structured chart fields and combo series", () => {
  const chartSpec: HtmlChartSpec = {
    kind: "combo",
    title: "Revenue mix",
    subtitle: "By product",
    insight: "Software expands",
    unit: "$m",
    secondaryUnit: "%",
    categories: ["FY25", "FY26"],
    series: [
      {
        id: "revenue",
        label: "Revenue",
        values: [120, 150],
        role: "bar",
        axis: "primary",
        color: "#224466",
      },
    ],
  };
  const chartDataTable: DataTableModel = {
    raw: "Year\tRevenue\nFY25\t120\nFY26\t150",
    hasHeader: true,
    columns: [
      { id: "year", label: "Year", type: "text" },
      { id: "revenue", label: "Revenue", type: "number" },
    ],
    rows: [
      ["FY25", "120"],
      ["FY26", "150"],
    ],
  };
  const patchedCharts: HtmlChartSpec[] = [];
  const rebuiltRawValues: string[] = [];
  const patchedStyles: Array<Partial<HtmlVisualNodeStyle>> = [];
  const sections = createHtmlEditorChartModuleInspectorSections({
    nodeId: "chart",
    chartSpec,
    chartDataTable,
    nodeStyle: { accent: "#778899" },
    getChartRawData: () => "raw-from-current",
    rebuildChartSpecFromRawData: ({ current, raw }) => {
      rebuiltRawValues.push(raw);
      return {
        ...current,
        subtitle: raw,
      };
    },
    patchChartSpec: (updater) => {
      const next = updater(chartSpec);
      if (next) {
        patchedCharts.push(next);
      }
    },
    updateNodeStyle: (nextStyle) => patchedStyles.push(nextStyle),
  });

  const chartSection = sections[0];
  assert.equal(chartSection?.id, "chart-module");
  const summaryField = chartSection.fields.find((field) => field.id === "chart-summary-chart");
  assert.equal(summaryField?.kind, "readonly");
  if (summaryField?.kind === "readonly") {
    assert.equal(summaryField.value, "2 categories · 1 series");
  }

  const kindField = chartSection.fields.find((field) => field.id === "chart-kind-chart");
  assert.equal(kindField?.kind, "select");
  if (kindField?.kind === "select") {
    kindField.onChange("line");
  }
  assert.equal(rebuiltRawValues[0], "raw-from-current");
  assert.equal(patchedCharts[0]?.kind, "line");

  const dataField = chartSection.fields.find((field) => field.id === "chart-data-chart");
  assert.equal(dataField?.kind, "textarea");
  if (dataField?.kind === "textarea") {
    dataField.onChange("new raw chart data");
  }
  assert.equal(rebuiltRawValues[1], "new raw chart data");

  const accentField = chartSection.fields.find((field) => field.id === "chart-accent-chart");
  assert.equal(accentField?.kind, "color");
  assert.equal(accentField?.value, "#778899");
  if (accentField?.kind === "color") {
    accentField.onChange("#abcdef");
  }
  assert.deepEqual(patchedStyles, [{ accent: "#abcdef" }]);

  const seriesSection = sections[1];
  assert.equal(seriesSection?.id, "chart-series-1");
  const seriesLabelField = seriesSection.fields.find(
    (field) => field.id === "chart-series-label-chart-revenue",
  );
  assert.equal(seriesLabelField?.kind, "text");
  if (seriesLabelField?.kind === "text") {
    seriesLabelField.onChange("Bookings");
  }
  const patchedSeriesChart = patchedCharts.at(-1);
  assert.equal(patchedSeriesChart?.kind, "combo");
  if (patchedSeriesChart?.kind === "combo") {
    assert.equal(patchedSeriesChart.series[0]?.label, "Bookings");
  }
});

test("scientific diagram inspector schema patches topology, notes, layers, and accent", () => {
  const diagramSpec: ScientificDiagramSpec = {
    family: "neural-network",
    title: "Model architecture",
    caption: "Encoder-decoder flow",
    connectivity: "dense",
    topLabel: "Inputs",
    bottomLabel: "Outputs",
    stylePreset: "paper-white",
    sideNotes: [{ id: "note-left", side: "left", text: "Training signal" }],
    layers: [
      { id: "input", role: "input", label: "Input", nodeCount: 4 },
      { id: "hidden", role: "hidden", label: "Hidden", nodeCount: 5 },
      { id: "output", role: "output", label: "Output", nodeCount: 2 },
    ],
  };
  const patchedDiagrams: ScientificDiagramSpec[] = [];
  const patchedStyles: Array<Partial<HtmlVisualNodeStyle>> = [];
  const sections = createHtmlEditorScientificDiagramInspectorSections({
    nodeId: "diagram",
    diagramSpec,
    nodeStyle: { accent: "#334455" },
    connectivityOptions: [
      { value: "dense", label: "Dense" },
      { value: "residual", label: "Residual" },
    ] as const,
    getLayerCountBounds: () => ({ min: 3, max: 6 }),
    switchConnectivity: (current, connectivity) => ({
      ...current,
      connectivity,
    }),
    resizeLayers: (current, layerCount) => ({
      ...current,
      layers: current.layers.slice(0, layerCount),
    }),
    patchDiagramSpec: (updater) => patchedDiagrams.push(updater(diagramSpec)),
    updateNodeStyle: (nextStyle) => patchedStyles.push(nextStyle),
  });

  const diagramSection = sections[0];
  assert.equal(diagramSection?.id, "scientific-diagram");

  const connectivityField = diagramSection.fields.find(
    (field) => field.id === "diagram-connectivity-diagram",
  );
  assert.equal(connectivityField?.kind, "select");
  if (connectivityField?.kind === "select") {
    connectivityField.onChange("residual");
  }
  assert.equal(patchedDiagrams[0]?.connectivity, "residual");

  const layerCountField = diagramSection.fields.find(
    (field) => field.id === "diagram-layer-count-diagram",
  );
  assert.equal(layerCountField?.kind, "number");
  if (layerCountField?.kind === "number") {
    assert.equal(layerCountField.min, 3);
    assert.equal(layerCountField.max, 6);
    layerCountField.onChange(2);
  }
  assert.equal(patchedDiagrams[1]?.layers.length, 2);

  const leftNoteField = diagramSection.fields.find(
    (field) => field.id === "diagram-note-left-diagram",
  );
  assert.equal(leftNoteField?.kind, "textarea");
  if (leftNoteField?.kind === "textarea") {
    leftNoteField.onChange("  Updated note  ");
  }
  assert.equal(
    patchedDiagrams[2]?.sideNotes.find((note) => note.side === "left")?.text,
    "Updated note",
  );

  const accentField = diagramSection.fields.find(
    (field) => field.id === "diagram-accent-diagram",
  );
  assert.equal(accentField?.kind, "color");
  assert.equal(accentField?.value, "#334455");
  if (accentField?.kind === "color") {
    accentField.onChange("#abcdef");
  }
  assert.deepEqual(patchedStyles, [{ accent: "#abcdef" }]);

  const hiddenLayerSection = sections.find((section) => section.id === "scientific-diagram-layer-2");
  const nodeCountField = hiddenLayerSection?.fields.find(
    (field) => field.id === "diagram-layer-nodes-diagram-hidden",
  );
  assert.equal(nodeCountField?.kind, "number");
  if (nodeCountField?.kind === "number") {
    assert.equal(nodeCountField.min, 2);
    nodeCountField.onChange(20);
  }
  assert.equal(patchedDiagrams.at(-1)?.layers[1]?.nodeCount, 9);
});

test("visual inspector schema composes node actions, module replacement, style, and content sections", () => {
  const visualNode: HtmlVisualNode = {
    id: "visual",
    kind: "chart-frame",
    fitParticipation: "content",
    pageNumber: 1,
    sourceTag: "figure",
    sourceIndex: 0,
    moduleLabel: "Chart module",
    style: {
      background: "#111111",
      border: "#222222",
      accent: "#333333",
      opacity: 0.75,
      radius: 12,
      padding: 16,
      widthPercent: 80,
    },
  };
  const contentNodes: HtmlVisualContentNode[] = [
    {
      id: "caption",
      kind: "paragraph",
      text: "Editable caption",
      sourceTag: "figcaption",
      sourceIndex: 1,
    },
  ];
  const manifest = {
    moduleId: "module-chart",
    label: "Published chart",
  } as PublishedModuleManifest;
  const calls: string[] = [];
  const patchedStyles: Array<Partial<HtmlVisualNodeStyle>> = [];
  const schema = createHtmlEditorVisualInspectorSchema({
    node: visualNode,
    transform: {
      mode: "freeform",
      frame: { x: 10, y: 20, w: 300, h: 160 },
      layer: "foreground",
      layerOrder: 0,
      lockedByUser: true,
    },
    contentNodes,
    moduleSections: [
      {
        id: "module-specific",
        title: "Module specific",
        fields: [],
      },
    ],
    recommendedModuleManifests: [manifest],
    addVisualKinds: ["surface", "badge"],
    duplicateNode: () => calls.push("duplicate-node"),
    extractVisualAsModule: (node, nodes) => calls.push(`extract:${node.id}:${nodes.length}`),
    deleteNode: () => calls.push("delete-node"),
    replaceWithModule: (nextManifest) => calls.push(`replace:${nextManifest.label}`),
    addVisualElement: (kind) => calls.push(`add:${kind}`),
    updateNodeStyle: (nextStyle) => patchedStyles.push(nextStyle),
    duplicateContentNode: (contentNodeId) => calls.push(`duplicate-content:${contentNodeId}`),
    deleteContentNode: (contentNodeId) => calls.push(`delete-content:${contentNodeId}`),
  });

  assert.equal(schema.id, "visual-inspector");
  assert.equal(schema.sections[0]?.id, "selected-node");
  const canvasModeField = schema.sections[0]?.fields.find(
    (field) => field.id === "node-canvas-mode-visual",
  );
  assert.equal(canvasModeField?.kind, "readonly");
  if (canvasModeField?.kind === "readonly") {
    assert.equal(canvasModeField.value, "Freeform · 10, 20");
  }

  const nodeActionsField = schema.sections[0]?.fields.find((field) => field.id === "node-actions");
  assert.equal(nodeActionsField?.kind, "actions");
  if (nodeActionsField?.kind === "actions") {
    nodeActionsField.actions[0]?.onPress();
    nodeActionsField.actions[1]?.onPress();
    nodeActionsField.actions[2]?.onPress();
  }
  assert.deepEqual(calls.slice(0, 3), [
    "duplicate-node",
    "extract:visual:1",
    "delete-node",
  ]);

  const replaceSection = schema.sections.find((section) => section.id === "replace-node");
  const replaceField = replaceSection?.fields[0];
  assert.equal(replaceField?.kind, "actions");
  if (replaceField?.kind === "actions") {
    replaceField.actions[0]?.onPress();
  }
  assert.equal(calls.at(-1), "replace:Published chart");

  assert.equal(schema.sections.some((section) => section.id === "module-specific"), true);

  const addSection = schema.sections.find((section) => section.id === "new-node");
  const addField = addSection?.fields[0];
  assert.equal(addField?.kind, "actions");
  if (addField?.kind === "actions") {
    addField.actions[1]?.onPress();
  }
  assert.equal(calls.at(-1), "add:badge");

  const styleSection = schema.sections.find((section) => section.id === "node-style");
  const opacityField = styleSection?.fields.find((field) => field.id === "node-opacity-visual");
  assert.equal(opacityField?.kind, "range");
  if (opacityField?.kind === "range") {
    assert.equal(opacityField.value, 75);
    opacityField.onChange(55);
  }
  assert.deepEqual(patchedStyles.at(-1), { opacity: 0.55 });

  const contentSection = schema.sections.find((section) => section.id === "node-content");
  const contentActionsField = contentSection?.fields.find(
    (field) => field.id === "content-actions-caption",
  );
  assert.equal(contentActionsField?.kind, "actions");
  if (contentActionsField?.kind === "actions") {
    contentActionsField.actions[0]?.onPress();
    contentActionsField.actions[1]?.onPress();
  }
  assert.deepEqual(calls.slice(-2), [
    "duplicate-content:caption",
    "delete-content:caption",
  ]);
});
