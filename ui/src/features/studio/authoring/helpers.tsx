import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "@/lib/router";
import {
  ArrowLeft,
  Circle,
  Minus,
  Plus,
  Save,
  Search,
  Square,
  Trash2,
  Type,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  BLOCK_KIND_PRESETS,
  MODULE_LIBRARY_COLLECTIONS,
  MODULE_REGISTRY_CATEGORIES,
} from "@/features/studio/config";
import {
  getCanvasObjectKind,
  isAiTextField,
  isSemanticTemplateSlotField,
  isSquareTemplateField,
} from "@/features/studio/module-fields";
import {
  deleteCustomModuleRegistryEntry,
  getAvailableSkillDefinitionById,
  getAvailableModuleSkillPresetsByModuleId,
  loadAvailableModuleRegistry,
  loadAvailableSkillRegistry,
  upsertCustomModuleRegistryEntry,
} from "@/features/studio/registry";
import { PreviewBlock } from "@/features/studio/renderers";
import type {
  BlockKind,
  BlockDraft,
  LayoutBlock,
  ModuleConnectionKind,
  ModuleCanvasSurface,
  ModuleFrameLayout,
  ModuleRegistryEntry,
  ModuleSkillRequirement,
  ModuleCanvasObjectKind,
  ModuleDataColumnType,
  ModuleTemplateFamily,
  ModuleTemplateField,
  ModuleTemplateFieldType,
  SkillDefinition,
  ModuleRegistryScope,
} from "@/features/studio/types";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function toLines(values: string[]) {
  return values.join("\n");
}

function updateFieldAt<T>(items: T[], index: number, updater: (item: T) => T) {
  return items.map((item, currentIndex) =>
    currentIndex === index ? updater(item) : item
  );
}

const LEGACY_MODULE_CANVAS_COLUMNS = 12;
const LEGACY_MODULE_CANVAS_ROWS = 8;
const MODULE_CANVAS_COLUMNS = 160;
const MODULE_CANVAS_ROWS = 90;
const MODULE_ARTBOARD_WIDTH = 1180;
const MODULE_ARTBOARD_HEIGHT = MODULE_ARTBOARD_WIDTH * (9 / 16);
const MODULE_UNIT_SIZE = MODULE_ARTBOARD_WIDTH / MODULE_CANVAS_COLUMNS;
const PASTEBOARD_MARGIN_COLUMNS = 220;
const PASTEBOARD_MARGIN_ROWS = 130;
const MODULE_SCENE_COLUMNS =
  MODULE_CANVAS_COLUMNS + PASTEBOARD_MARGIN_COLUMNS * 2;
const MODULE_SCENE_ROWS = MODULE_CANVAS_ROWS + PASTEBOARD_MARGIN_ROWS * 2;
const MODULE_SCENE_WIDTH = MODULE_SCENE_COLUMNS * MODULE_UNIT_SIZE;
const MODULE_SCENE_HEIGHT = MODULE_SCENE_ROWS * MODULE_UNIT_SIZE;
const ARTBOARD_OFFSET_X = PASTEBOARD_MARGIN_COLUMNS;
const ARTBOARD_OFFSET_Y = PASTEBOARD_MARGIN_ROWS;
const WORKSPACE_FIT_PADDING_X = 96;
const WORKSPACE_FIT_PADDING_Y = 120;
const WORKSPACE_PAN_MARGIN = 96;
const DEFAULT_MODULE_FRAME_MARGIN_X = 12;
const DEFAULT_MODULE_FRAME_MARGIN_Y = 10;

type CanvasEditMode = "move" | "resize";
type CanvasObjectPreset = "default" | "square";
type FieldLayoutPresetId = "auto" | "two-up" | "hero" | "timeline";

type FieldCanvasDragState = {
  fieldId: string;
  affectedFieldIds: string[];
  initialLayouts: Record<string, CanvasLayout>;
  initialSceneLayouts: Record<string, CanvasLayout>;
  mode: CanvasEditMode;
  startX: number;
  startY: number;
};

type WorkspacePanState = {
  startX: number;
  startY: number;
  initialX: number;
  initialY: number;
};

type MarqueeSelectionState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

type CanvasLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distributeSpan(total: number, segments: number) {
  const safeSegments = Math.max(1, segments);
  const base = Math.floor(total / safeSegments);
  let remainder = total % safeSegments;
  let offset = 0;

  return Array.from({ length: safeSegments }, () => {
    const size = base + (remainder > 0 ? 1 : 0);
    const segment = { start: offset, size };
    offset += size;
    remainder = Math.max(0, remainder - 1);
    return segment;
  });
}

function buildGridLayouts(count: number, columns: number): CanvasLayout[] {
  const safeCount = Math.max(1, count);
  const safeColumns = Math.max(1, Math.min(columns, safeCount));
  const rows = Math.ceil(safeCount / safeColumns);
  const xSegments = distributeSpan(MODULE_CANVAS_COLUMNS, safeColumns);
  const ySegments = distributeSpan(MODULE_CANVAS_ROWS, rows);

  return Array.from({ length: safeCount }, (_, index) => {
    const row = Math.floor(index / safeColumns);
    const col = index % safeColumns;
    return {
      x: xSegments[col]?.start ?? 0,
      y: ySegments[row]?.start ?? 0,
      w: xSegments[col]?.size ?? MODULE_CANVAS_COLUMNS,
      h: ySegments[row]?.size ?? MODULE_CANVAS_ROWS,
    };
  });
}

function scaleLegacyValue(value: number, legacyMax: number, nextMax: number) {
  return Math.round((value / legacyMax) * nextMax);
}

function normalizeLayout(
  layout: ModuleTemplateField["layout"] | undefined,
  fallback: CanvasLayout
): CanvasLayout {
  if (!layout) {
    return fallback;
  }

  const looksLegacy =
    layout.x <= LEGACY_MODULE_CANVAS_COLUMNS &&
    layout.y <= LEGACY_MODULE_CANVAS_ROWS &&
    layout.w <= LEGACY_MODULE_CANVAS_COLUMNS &&
    layout.h <= LEGACY_MODULE_CANVAS_ROWS;

  const scaled = looksLegacy
    ? {
        x: scaleLegacyValue(
          layout.x,
          LEGACY_MODULE_CANVAS_COLUMNS,
          MODULE_CANVAS_COLUMNS
        ),
        y: scaleLegacyValue(
          layout.y,
          LEGACY_MODULE_CANVAS_ROWS,
          MODULE_CANVAS_ROWS
        ),
        w: Math.max(
          8,
          scaleLegacyValue(
            layout.w,
            LEGACY_MODULE_CANVAS_COLUMNS,
            MODULE_CANVAS_COLUMNS
          )
        ),
        h: Math.max(
          6,
          scaleLegacyValue(
            layout.h,
            LEGACY_MODULE_CANVAS_ROWS,
            MODULE_CANVAS_ROWS
          )
        ),
      }
    : layout;

  return {
    x: clamp(scaled.x, 0, MODULE_CANVAS_COLUMNS - 1),
    y: clamp(scaled.y, 0, MODULE_CANVAS_ROWS - 1),
    w: clamp(scaled.w, 2, MODULE_CANVAS_COLUMNS),
    h: clamp(scaled.h, 2, MODULE_CANVAS_ROWS),
  };
}

function getFieldSurface(field: ModuleTemplateField): ModuleCanvasSurface {
  return field.surface ?? "artboard";
}

function getSceneLayout(
  field: ModuleTemplateField,
  fallback: CanvasLayout
): CanvasLayout {
  const layout = field.layout ?? fallback;
  if (getFieldSurface(field) === "pasteboard") {
    return {
      x: clamp(layout.x, 0, MODULE_SCENE_COLUMNS - layout.w),
      y: clamp(layout.y, 0, MODULE_SCENE_ROWS - layout.h),
      w: clamp(layout.w, 2, MODULE_SCENE_COLUMNS),
      h: clamp(layout.h, 2, MODULE_SCENE_ROWS),
    };
  }

  return {
    x: ARTBOARD_OFFSET_X + clamp(layout.x, 0, MODULE_CANVAS_COLUMNS - layout.w),
    y: ARTBOARD_OFFSET_Y + clamp(layout.y, 0, MODULE_CANVAS_ROWS - layout.h),
    w: clamp(layout.w, 2, MODULE_CANVAS_COLUMNS),
    h: clamp(layout.h, 2, MODULE_CANVAS_ROWS),
  };
}

function clampLayoutToSurface(
  layout: CanvasLayout,
  surface: ModuleCanvasSurface
): CanvasLayout {
  if (surface === "pasteboard") {
    return {
      x: clamp(layout.x, 0, MODULE_SCENE_COLUMNS - layout.w),
      y: clamp(layout.y, 0, MODULE_SCENE_ROWS - layout.h),
      w: clamp(layout.w, 2, MODULE_SCENE_COLUMNS),
      h: clamp(layout.h, 2, MODULE_SCENE_ROWS),
    };
  }

  return {
    x: clamp(layout.x, 0, MODULE_CANVAS_COLUMNS - layout.w),
    y: clamp(layout.y, 0, MODULE_CANVAS_ROWS - layout.h),
    w: clamp(layout.w, 2, MODULE_CANVAS_COLUMNS),
    h: clamp(layout.h, 2, MODULE_CANVAS_ROWS),
  };
}

function getDefaultModuleFrameLayout(): ModuleFrameLayout {
  return {
    x: DEFAULT_MODULE_FRAME_MARGIN_X,
    y: DEFAULT_MODULE_FRAME_MARGIN_Y,
    w: MODULE_CANVAS_COLUMNS - DEFAULT_MODULE_FRAME_MARGIN_X * 2,
    h: MODULE_CANVAS_ROWS - DEFAULT_MODULE_FRAME_MARGIN_Y * 2,
  };
}

function normalizeModuleFrameLayout(
  layout: ModuleFrameLayout | undefined,
  fallback: ModuleFrameLayout = getDefaultModuleFrameLayout()
): ModuleFrameLayout {
  const source = layout ?? fallback;
  const width = clamp(source.w, 8, MODULE_CANVAS_COLUMNS);
  const height = clamp(source.h, 8, MODULE_CANVAS_ROWS);
  return {
    x: clamp(source.x, 0, MODULE_CANVAS_COLUMNS - width),
    y: clamp(source.y, 0, MODULE_CANVAS_ROWS - height),
    w: width,
    h: height,
  };
}

function buildModuleFrameFromBox(
  box: CanvasLayout,
  paddingX = 4,
  paddingY = 4
): ModuleFrameLayout {
  return normalizeModuleFrameLayout({
    x: box.x - paddingX,
    y: box.y - paddingY,
    w: box.w + paddingX * 2,
    h: box.h + paddingY * 2,
  });
}

function getModuleFrameLayout(
  entry: Pick<ModuleRegistryEntry, "moduleFrame" | "fields" | "kind">
) {
  if (entry.moduleFrame) {
    return normalizeModuleFrameLayout(entry.moduleFrame);
  }

  const artboardLayouts = withFieldLayouts(entry.fields ?? [], entry.kind)
    .filter((field) => getFieldSurface(field) === "artboard")
    .map(
      (field, index, collection) =>
        field.layout ??
        createDefaultFieldLayout(
          entry.kind,
          index,
          Math.max(collection.length, 1)
        )
    );

  if (artboardLayouts.length === 0) {
    return getDefaultModuleFrameLayout();
  }

  return buildModuleFrameFromBox(getLayoutsBoundingBox(artboardLayouts));
}

function isLayoutInsideModuleFrame(
  layout: CanvasLayout,
  frame: ModuleFrameLayout
) {
  return (
    layout.x >= frame.x &&
    layout.y >= frame.y &&
    layout.x + layout.w <= frame.x + frame.w &&
    layout.y + layout.h <= frame.y + frame.h
  );
}

function getLayoutsBoundingBox(layouts: CanvasLayout[]) {
  if (layouts.length === 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }

  const minX = Math.min(...layouts.map((layout) => layout.x));
  const minY = Math.min(...layouts.map((layout) => layout.y));
  const maxX = Math.max(...layouts.map((layout) => layout.x + layout.w));
  const maxY = Math.max(...layouts.map((layout) => layout.y + layout.h));

  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  };
}

function isBoxInsideArtboard(box: {
  x: number;
  y: number;
  w: number;
  h: number;
}) {
  return (
    box.x >= ARTBOARD_OFFSET_X &&
    box.y >= ARTBOARD_OFFSET_Y &&
    box.x + box.w <= ARTBOARD_OFFSET_X + MODULE_CANVAS_COLUMNS &&
    box.y + box.h <= ARTBOARD_OFFSET_Y + MODULE_CANVAS_ROWS
  );
}

function getNextPasteboardOrigin(
  existingFields: ModuleTemplateField[],
  box: { w: number; h: number }
) {
  const pasteboardFields = existingFields.filter(
    (field) => getFieldSurface(field) === "pasteboard"
  );
  if (pasteboardFields.length === 0) {
    return {
      x: ARTBOARD_OFFSET_X + MODULE_CANVAS_COLUMNS + 24,
      y: ARTBOARD_OFFSET_Y + 24,
    };
  }

  const pasteboardBox = getLayoutsBoundingBox(
    pasteboardFields.map((field) =>
      clampLayoutToSurface(
        field.layout ?? {
          x: ARTBOARD_OFFSET_X + MODULE_CANVAS_COLUMNS + 24,
          y: ARTBOARD_OFFSET_Y + 24,
          w: 24,
          h: 16,
        },
        "pasteboard"
      )
    )
  );

  const proposedX = pasteboardBox.x + pasteboardBox.w + 16;
  const clampedX = clamp(proposedX, 0, MODULE_SCENE_COLUMNS - box.w - 8);

  if (clampedX !== proposedX) {
    return {
      x: ARTBOARD_OFFSET_X + 24,
      y: clamp(
        pasteboardBox.y + pasteboardBox.h + 16,
        0,
        MODULE_SCENE_ROWS - box.h - 8
      ),
    };
  }

  return {
    x: clampedX,
    y: clamp(pasteboardBox.y, 0, MODULE_SCENE_ROWS - box.h - 8),
  };
}

function clampWorkspaceOffset(
  offset: { x: number; y: number },
  viewportWidth: number,
  viewportHeight: number,
  scale: number
) {
  const scaledWidth = MODULE_SCENE_WIDTH * scale;
  const scaledHeight = MODULE_SCENE_HEIGHT * scale;
  const xLimit = Math.max(
    WORKSPACE_PAN_MARGIN,
    Math.max(0, (scaledWidth - viewportWidth) / 2) + WORKSPACE_PAN_MARGIN
  );
  const yLimit = Math.max(
    WORKSPACE_PAN_MARGIN,
    Math.max(0, (scaledHeight - viewportHeight) / 2) + WORKSPACE_PAN_MARGIN
  );

  return {
    x: clamp(offset.x, -xLimit, xLimit),
    y: clamp(offset.y, -yLimit, yLimit),
  };
}

function getViewportPointInScene(
  viewport: HTMLDivElement,
  clientX: number,
  clientY: number,
  scale: number,
  offset: { x: number; y: number }
) {
  const rect = viewport.getBoundingClientRect();
  const pointX = clientX - rect.left;
  const pointY = clientY - rect.top;

  return {
    x: (pointX - rect.width / 2 - offset.x) / scale + MODULE_SCENE_WIDTH / 2,
    y: (pointY - rect.height / 2 - offset.y) / scale + MODULE_SCENE_HEIGHT / 2,
  };
}

function createDefaultFieldLayout(
  kind: BlockKind,
  index: number,
  total: number
): CanvasLayout {
  const contentFrame = {
    x: 14,
    y: 18,
    w: MODULE_CANVAS_COLUMNS - 28,
    h: MODULE_CANVAS_ROWS - 30,
  };

  const buildFramedGrid = (count: number, columns: number): CanvasLayout[] => {
    const safeCount = Math.max(1, count);
    const safeColumns = Math.max(1, Math.min(columns, safeCount));
    const rows = Math.ceil(safeCount / safeColumns);
    const xSegments = distributeSpan(contentFrame.w, safeColumns);
    const ySegments = distributeSpan(contentFrame.h, rows);

    return Array.from({ length: safeCount }, (_, currentIndex) => {
      const row = Math.floor(currentIndex / safeColumns);
      const col = currentIndex % safeColumns;
      const segmentX = xSegments[col];
      const segmentY = ySegments[row];
      return {
        x: contentFrame.x + (segmentX?.start ?? 0),
        y: contentFrame.y + (segmentY?.start ?? 0),
        w: Math.max(14, segmentX?.size ?? contentFrame.w),
        h: Math.max(10, segmentY?.size ?? contentFrame.h),
      };
    });
  };

  if (total <= 1) {
    if (kind === "line") {
      return {
        x: 18,
        y: 26,
        w: MODULE_CANVAS_COLUMNS - 36,
        h: 26,
      };
    }

    if (kind === "flow" || kind === "gantt") {
      return {
        x: 16,
        y: 22,
        w: MODULE_CANVAS_COLUMNS - 32,
        h: 34,
      };
    }

    return {
      x: 16,
      y: 20,
      w: MODULE_CANVAS_COLUMNS - 32,
      h: 42,
    };
  }

  if (
    kind === "matrix" ||
    kind === "metrics" ||
    kind === "bars" ||
    kind === "phases"
  ) {
    return (
      buildFramedGrid(total, Math.min(2, total))[index] ??
      buildFramedGrid(total, Math.min(2, total))[0]
    );
  }

  if (kind === "flow" || kind === "gantt") {
    const xSegments = distributeSpan(contentFrame.w, total);
    return {
      x: contentFrame.x + (xSegments[index]?.start ?? 0),
      y: 28,
      w: Math.max(16, xSegments[index]?.size ?? contentFrame.w),
      h: 18,
    };
  }

  if (kind === "line") {
    const xSegments = distributeSpan(contentFrame.w, total);
    return {
      x: contentFrame.x + (xSegments[index]?.start ?? 0),
      y: 34,
      w: Math.max(16, xSegments[index]?.size ?? contentFrame.w),
      h: 12,
    };
  }

  return (
    buildFramedGrid(total, Math.min(2, total))[index] ??
    buildFramedGrid(total, Math.min(2, total))[0]
  );
}

function createEmptyDataTable(
  raw = ""
): NonNullable<ModuleTemplateField["dataTable"]> {
  return {
    raw,
    hasHeader: true,
    columns: [
      { id: "column-1", label: "Label", type: "text" },
      { id: "column-2", label: "Value", type: "number" },
    ],
    rows: [],
  };
}

function parseDelimitedRow(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function inferDataColumnType(values: string[]): ModuleDataColumnType {
  const samples = values.map((value) => value.trim()).filter(Boolean);
  if (samples.length === 0) {
    return "text";
  }

  const isPercent = samples.every((value) => /^-?\d+(\.\d+)?%$/.test(value));
  if (isPercent) {
    return "percent";
  }

  const isCurrency = samples.every((value) =>
    /^[$€£¥]-?\d{1,3}(,\d{3})*(\.\d+)?$|^[$€£¥]-?\d+(\.\d+)?$/.test(value)
  );
  if (isCurrency) {
    return "currency";
  }

  const isNumber = samples.every((value) =>
    /^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$/.test(value)
  );
  if (isNumber) {
    return "number";
  }

  const isDateLike = samples.every((value) => !Number.isNaN(Date.parse(value)));
  if (isDateLike) {
    return "date";
  }

  return "text";
}

function parseDataBlockInput(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return createEmptyDataTable("");
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.replace(/\r/g, "").trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return createEmptyDataTable(raw);
  }

  const delimiter = lines.some((line) => line.includes("\t")) ? "\t" : ",";
  const rows = lines.map((line) => parseDelimitedRow(line, delimiter));
  const columnCount = Math.max(...rows.map((row) => row.length), 1);
  const normalizedRows = rows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] ?? "")
  );
  const hasHeader = normalizedRows.length > 1;
  const header = hasHeader
    ? normalizedRows[0]
    : Array.from({ length: columnCount }, (_, index) => `Column ${index + 1}`);
  const dataRows = hasHeader ? normalizedRows.slice(1) : normalizedRows;

  return {
    raw,
    hasHeader,
    columns: header.map((label, index) => ({
      id: `column-${index + 1}`,
      label: label || `Column ${index + 1}`,
      type: inferDataColumnType(dataRows.map((row) => row[index] ?? "")),
    })),
    rows: dataRows,
  } satisfies NonNullable<ModuleTemplateField["dataTable"]>;
}

function isFieldConnectable(field: ModuleTemplateField) {
  const kind = getCanvasObjectKind(field);
  return kind === "data" || kind === "chart" || isSemanticTemplateSlotField(field);
}

function canConnectFields(
  source: ModuleTemplateField,
  target: ModuleTemplateField
) {
  const sourceKind = getCanvasObjectKind(source);
  const targetKind = getCanvasObjectKind(target);

  if (source.id === target.id) {
    return false;
  }

  if (!isFieldConnectable(source) || !isFieldConnectable(target)) {
    return false;
  }

  if (targetKind === "data") {
    return false;
  }

  if (targetKind === "chart") {
    return sourceKind === "data";
  }

  if (sourceKind === "chart") {
    return isSemanticTemplateSlotField(target);
  }

  if (sourceKind === "data") {
    return isSemanticTemplateSlotField(target);
  }

  return isSemanticTemplateSlotField(target);
}

function inferConnectionKind(
  source: ModuleTemplateField,
  target: ModuleTemplateField
): ModuleConnectionKind {
  const sourceKind = getCanvasObjectKind(source);
  const targetKind = getCanvasObjectKind(target);

  if (sourceKind === "data") {
    if (targetKind === "slot") {
      return "ai-fill";
    }
    return "data-flow";
  }

  if (isSemanticTemplateSlotField(source) || isSemanticTemplateSlotField(target)) {
    return "ai-fill";
  }

  return "explain";
}

function getConnectionKindLabel(kind: ModuleConnectionKind) {
  if (kind === "data-flow") return "Data flow";
  if (kind === "ai-fill") return "AI fill";
  if (kind === "explain") return "Explain";
  return "Link";
}

function getFieldKindTone(field: ModuleTemplateField) {
  const kind = getCanvasObjectKind(field);
  if (kind === "data") return "Data";
  if (kind === "chart") return "Chart";
  if (isAiTextField(field)) return "AI Text";
  if (kind === "text") return "Locked Text";
  if (kind === "line") return "Line";
  if (isSquareTemplateField(field)) return "Square";
  if (kind === "ellipse") return "Circle";
  return "Shape";
}

function createCanvasObject(
  kind: ModuleCanvasObjectKind,
  blockKind: BlockKind,
  index: number,
  total: number,
  preset: CanvasObjectPreset = "default"
): ModuleTemplateField {
  const id = `field-${Math.random().toString(36).slice(2, 8)}`;

  if (kind === "rectangle") {
    const isSquare = preset === "square";
    return {
      id,
      label: isSquare ? "Square" : "Rectangle",
      type: "custom",
      objectKind: "rectangle",
      surface: "artboard",
      description: isSquare
        ? "A square shape for badges, callouts, or locked visual anchors."
        : "A filled rectangular shape you can use as a background or grouping surface.",
      required: false,
      style: {
        fill: "#dce9ee",
        stroke: "#9bb6c2",
        strokeWidth: 1,
        strokeStyle: "solid",
        radius: "soft",
        aspectLock: isSquare ? "square" : undefined,
      },
      layout: isSquare
        ? { x: 24, y: 18, w: 22, h: 22 }
        : { x: 24, y: 18, w: 42, h: 24 },
    };
  }

  if (kind === "ellipse") {
    return {
      id,
      label: "Ellipse",
      type: "custom",
      objectKind: "ellipse",
      surface: "artboard",
      description: "A circular or oval shape for markers, emphasis, or badges.",
      required: false,
      style: {
        fill: "#dce9ee",
        stroke: "#9bb6c2",
        strokeWidth: 1,
        strokeStyle: "solid",
        radius: "round",
      },
      layout: { x: 24, y: 18, w: 18, h: 18 },
    };
  }

  if (kind === "line") {
    return {
      id,
      label: "Line",
      type: "custom",
      objectKind: "line",
      surface: "artboard",
      description: "A line for separation, direction, or flow.",
      required: false,
      style: {
        stroke: "#133a50",
        strokeWidth: 4,
        strokeStyle: "solid",
        rotation: 0,
      },
      layout: { x: 24, y: 24, w: 54, h: 2 },
    };
  }

  if (kind === "text") {
    return {
      id,
      label: "Locked Text",
      type: "custom",
      objectKind: "text",
      aiState: "locked",
      surface: "artboard",
      description: "Use this for template-owned labels, headings, or callouts that AI should not overwrite.",
      required: false,
      style: {
        textAlign: "left",
        fill: "#173043",
      },
      layout: { x: 24, y: 18, w: 38, h: 12 },
    };
  }

  if (kind === "data") {
    return {
      id,
      label: "Data",
      type: "custom",
      objectKind: "data",
      aiState: "locked",
      surface: "artboard",
      description:
        "Paste spreadsheet data here, then connect this block to AI or chart blocks later.",
      required: false,
      dataTable: parseDataBlockInput(
        "Label\tValue\nNorth America\t42\nEurope\t34\nAsia\t28"
      ),
      style: {
        fill: "#f6f7f2",
        stroke: "#9bb6c2",
        strokeWidth: 1,
        strokeStyle: "solid",
        radius: "soft",
      },
      layout: { x: 22, y: 20, w: 56, h: 26 },
    };
  }

  if (kind === "chart") {
    return {
      id,
      label: "Chart",
      type: "custom",
      objectKind: "chart",
      aiState: "locked",
      surface: "artboard",
      description:
        "Connect a data block to this chart and the module will render it automatically.",
      required: false,
      chartSpec: {
        kind: "bar",
      },
      style: {
        fill: "#f7f3eb",
        stroke: "#9bb6c2",
        strokeWidth: 1,
        strokeStyle: "solid",
        radius: "soft",
      },
      layout: { x: 28, y: 18, w: 52, h: 28 },
    };
  }

  return {
    id,
    label: "AI Text",
    type: "custom",
    objectKind: "slot",
    aiState: "ai-fill",
    surface: "artboard",
    description:
      "Describe the audience-facing copy or proof that AI should place in this template slot.",
    required: true,
    layout: createDefaultFieldLayout(blockKind, index, total),
  };
}

function withFieldLayouts(fields: ModuleTemplateField[], kind: BlockKind) {
  return fields.map((field, index) => ({
    ...field,
    layout: normalizeLayout(
      field.layout,
      createDefaultFieldLayout(kind, index, Math.max(fields.length, 1))
    ),
  }));
}

function applyFieldLayoutPreset(
  fields: ModuleTemplateField[],
  kind: BlockKind,
  preset: FieldLayoutPresetId
) {
  if (fields.length === 0) {
    return fields;
  }

  const layouts =
    preset === "auto"
      ? fields.map((_, index) =>
          createDefaultFieldLayout(kind, index, fields.length)
        )
      : preset === "two-up"
      ? buildGridLayouts(fields.length, Math.min(2, fields.length))
      : preset === "hero"
      ? (() => {
          if (fields.length === 1) {
            return [
              normalizeLayout(undefined, {
                x: 0,
                y: 0,
                w: 12,
                h: 8,
              }),
            ];
          }

          const lowerSegments = distributeSpan(
            MODULE_CANVAS_COLUMNS,
            Math.max(1, fields.length - 1)
          );
          return [
            normalizeLayout(undefined, {
              x: 0,
              y: 0,
              w: 12,
              h: 4,
            }),
            ...lowerSegments.map((segment) => ({
              x: segment.start,
              y: scaleLegacyValue(
                4,
                LEGACY_MODULE_CANVAS_ROWS,
                MODULE_CANVAS_ROWS
              ),
              w: segment.size,
              h: scaleLegacyValue(
                4,
                LEGACY_MODULE_CANVAS_ROWS,
                MODULE_CANVAS_ROWS
              ),
            })),
          ];
        })()
      : distributeSpan(MODULE_CANVAS_COLUMNS, fields.length).map((segment) => ({
          x: segment.start,
          y: scaleLegacyValue(5, LEGACY_MODULE_CANVAS_ROWS, MODULE_CANVAS_ROWS),
          w: segment.size,
          h: scaleLegacyValue(3, LEGACY_MODULE_CANVAS_ROWS, MODULE_CANVAS_ROWS),
        }));

  return fields.map((field, index) => ({
    ...field,
    layout:
      layouts[index] ??
      field.layout ??
      createDefaultFieldLayout(kind, index, fields.length),
  }));
}

function getFieldTypeLabel(type: ModuleTemplateFieldType) {
  if (type === "page-goal") return "Goal";
  if (type === "comparison-axis") return "Axis";
  if (type === "dimension") return "Dimension";
  if (type === "evidence") return "Proof";
  if (type === "step") return "Step";
  if (type === "phase") return "Phase";
  if (type === "curve") return "Curve";
  return "Field";
}

function getObjectKindLabel(kind: ModuleCanvasObjectKind) {
  if (kind === "slot") return "AI Text";
  if (kind === "rectangle") return "Rectangle";
  if (kind === "ellipse") return "Circle";
  if (kind === "line") return "Line";
  if (kind === "data") return "Data";
  if (kind === "chart") return "Chart";
  return "Locked Text";
}

function createBlankModuleDraft(): ModuleRegistryEntry {
  const createdAt = Date.now().toString(36);
  return {
    id: `private.custom-${createdAt}.matrix`,
    kind: "matrix",
    label: "New module",
    category: "comparison",
    scope: "private",
    status: "draft",
    family: "framework",
    semanticRole:
      "A reusable page template that gives AI a clear shape, a small set of semantic slots, and a stable reading order.",
    description:
      "Describe the template shape so Studio can reuse it as a page contract instead of a one-off composition.",
    promptHint:
      "Tell Studio what this template is for, what the AI text slots should communicate, and what should remain locked decoration.",
    useCases: ["Turn one page idea into a reusable page template."],
    searchTerms: ["custom template", "draft"],
    rendererCapabilities: ["matrix-grid"],
    skillBindings: [],
    defaultSkillRequirements: [],
    supportedSkillClasses: ["framework", "domain", "output"],
    incompatibleSkillIds: [],
    examples: [],
    moduleFrame: getDefaultModuleFrameLayout(),
    connections: [],
    thinkingFlow: {
      nodes: [],
      edges: [],
    },
    fields: [
      {
        id: "field-1",
        label: "AI Text",
        type: "custom",
        objectKind: "slot",
        aiState: "ai-fill",
        surface: "artboard",
        description:
          "Describe the primary audience-facing message or proof that AI should place here.",
        required: true,
        layout: createDefaultFieldLayout("matrix", 0, 1),
      },
    ],
    order: 900,
    featured: false,
  };
}

function cloneEntryForAuthoring(
  entry: ModuleRegistryEntry
): ModuleRegistryEntry {
  const cloned: ModuleRegistryEntry = {
    ...entry,
    skillBindings: entry.skillBindings.map((binding) => ({ ...binding })),
    defaultSkillRequirements: (entry.defaultSkillRequirements ?? []).map(
      (requirement) => ({
        ...requirement,
      })
    ),
    connections: (entry.connections ?? []).map((connection) => ({
      ...connection,
    })),
    thinkingFlow: entry.thinkingFlow
      ? {
          nodes: entry.thinkingFlow.nodes.map((node) => ({
            ...node,
            toolConfig: node.toolConfig
              ? {
                  ...node.toolConfig,
                }
              : undefined,
          })),
          edges: entry.thinkingFlow.edges.map((edge) => ({
            ...edge,
          })),
        }
      : {
          nodes: [],
          edges: [],
        },
    fields: withFieldLayouts(
      entry.fields.map((field) => ({
        ...field,
        aiState:
          field.aiState ??
          ((field.objectKind ?? "slot") === "slot" ? "ai-fill" : "locked"),
        outputContract: field.outputContract
          ? {
              ...field.outputContract,
            }
          : undefined,
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
      })),
      entry.kind
    ),
    useCases: [...entry.useCases],
    searchTerms: [...entry.searchTerms],
    rendererCapabilities: [...entry.rendererCapabilities],
    supportedSkillClasses: [...(entry.supportedSkillClasses ?? [])],
    incompatibleSkillIds: [...(entry.incompatibleSkillIds ?? [])],
    examples: (entry.examples ?? []).map((example) => ({ ...example })),
    moduleFrame: getModuleFrameLayout(entry),
  };

  if (entry.scope === "private" || entry.scope === "community") {
    return cloned;
  }

  const label = `${entry.label} Copy`;
  const idPrefix = slugify(label) || "custom-module";
  return {
    ...cloned,
    id: `private.${idPrefix}.${entry.kind}`,
    label,
    scope: "private",
    status: "experimental",
    featured: false,
  };
}

function ensureDraftVisibleOnArtboard(
  entry: ModuleRegistryEntry
): ModuleRegistryEntry {
  const visibleFields = withFieldLayouts(
    entry.fields.map((field) => ({
      ...field,
      surface: "artboard" as const,
    })),
    entry.kind
  );

  const totalArea = MODULE_CANVAS_COLUMNS * MODULE_CANVAS_ROWS;
  const occupiedArea = visibleFields.reduce((sum, field) => {
    const layout = field.layout;
    return sum + (layout ? layout.w * layout.h : 0);
  }, 0);
  const nextFields =
    visibleFields.length > 0 && occupiedArea / totalArea < 0.08
      ? applyFieldLayoutPreset(visibleFields, entry.kind, "auto")
      : visibleFields;

  return {
    ...entry,
    moduleFrame: getModuleFrameLayout({
      ...entry,
      fields: nextFields,
    }),
    fields: nextFields,
  };
}

function buildModulePreviewBlock(entry: ModuleRegistryEntry): LayoutBlock {
  return {
    id: `${entry.id}-preview`,
    moduleId: entry.id,
    title: entry.label,
    detail: entry.description,
    intent: entry.promptHint,
    kind: entry.kind,
    tone: BLOCK_KIND_PRESETS[entry.kind].tone,
    x: 1,
    y: 1,
    w:
      entry.kind === "gantt" || entry.kind === "phases"
        ? 12
        : entry.kind === "line"
        ? 10
        : 8,
    h: entry.kind === "gantt" ? 7 : entry.kind === "phases" ? 4 : 5,
    minW: BLOCK_KIND_PRESETS[entry.kind].minW,
    minH: BLOCK_KIND_PRESETS[entry.kind].minH,
    visualScale: entry.kind === "gantt" ? 0.82 : 0.92,
  };
}

function buildModulePreviewDraft(entry: ModuleRegistryEntry): BlockDraft {
  const summary = entry.semanticRole || entry.description || entry.promptHint;
  const fieldCards = (entry.fields ?? []).map((field) => ({
    title: field.label,
    body: field.description,
  }));
  const metricFacts = (entry.fields ?? []).slice(0, 4).map((field, index) => ({
    value: `0${index + 1}`,
    label: field.label,
  }));
  const flowSteps = (entry.fields ?? []).slice(0, 4).map((field) => ({
    title: field.label,
    body: field.description,
  }));

  return {
    summary,
    metrics:
      metricFacts.length > 0
        ? metricFacts
        : [
            {
              value: "01",
              label:
                "Use this module when a page needs a strong visual proof structure.",
            },
          ],
    cards:
      fieldCards.length > 0
        ? fieldCards
        : [
            {
              title: "Primary slot",
              body: "Define the semantic fields of this module so the AI knows what belongs here.",
            },
          ],
    steps:
      flowSteps.length > 0
        ? flowSteps
        : [
            {
              title: "Stage 1",
              body: "Map the intended logic or progression the module should express.",
            },
          ],
  };
}

function isLibraryCollectionMatch(
  entry: ModuleRegistryEntry,
  collectionId: string
) {
  if (collectionId === "all") return true;
  if (collectionId === "featured") return entry.featured;
  if (collectionId === "frameworks") return entry.family === "framework";
  if (collectionId === "core") return entry.scope === "core";
  if (collectionId === "community") return entry.scope === "community";
  if (collectionId === "private") return entry.scope === "private";
  return true;
}

export {
  slugify,
  splitLines,
  toLines,
  updateFieldAt,
  MODULE_CANVAS_COLUMNS,
  MODULE_CANVAS_ROWS,
  MODULE_ARTBOARD_WIDTH,
  MODULE_ARTBOARD_HEIGHT,
  MODULE_UNIT_SIZE,
  MODULE_SCENE_COLUMNS,
  MODULE_SCENE_ROWS,
  MODULE_SCENE_WIDTH,
  MODULE_SCENE_HEIGHT,
  ARTBOARD_OFFSET_X,
  ARTBOARD_OFFSET_Y,
  WORKSPACE_FIT_PADDING_X,
  WORKSPACE_FIT_PADDING_Y,
  clamp,
  getFieldSurface,
  getSceneLayout,
  clampLayoutToSurface,
  getDefaultModuleFrameLayout,
  normalizeModuleFrameLayout,
  buildModuleFrameFromBox,
  getModuleFrameLayout,
  isLayoutInsideModuleFrame,
  getLayoutsBoundingBox,
  isBoxInsideArtboard,
  clampWorkspaceOffset,
  getViewportPointInScene,
  createDefaultFieldLayout,
  getCanvasObjectKind,
  createCanvasObject,
  createEmptyDataTable,
  parseDataBlockInput,
  isFieldConnectable,
  inferConnectionKind,
  canConnectFields,
  getConnectionKindLabel,
  getFieldKindTone,
  withFieldLayouts,
  applyFieldLayoutPreset,
  getObjectKindLabel,
  createBlankModuleDraft,
  cloneEntryForAuthoring,
  ensureDraftVisibleOnArtboard,
  buildModulePreviewBlock,
  buildModulePreviewDraft,
  isLibraryCollectionMatch,
};

export type {
  CanvasObjectPreset,
  CanvasEditMode,
  FieldLayoutPresetId,
  FieldCanvasDragState,
  WorkspacePanState,
  MarqueeSelectionState,
};
