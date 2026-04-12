import type {
  ModuleConnection,
  ModuleTemplateField,
} from "@/features/studio/types";

export function isAiEditableField(field: ModuleTemplateField) {
  return (
    field.aiState === "ai-fill" || field.aiState === "summarize-linked-data"
  );
}

export function getConnectionStroke(kind: ModuleConnection["kind"]) {
  if (kind === "data-flow") return "#4c7f68";
  if (kind === "ai-fill") return "#4d7ca6";
  if (kind === "explain") return "#b07b42";
  return "#627987";
}

export function getConnectionMarkerId(kind: ModuleConnection["kind"]) {
  if (kind === "data-flow") return "module-connection-arrow-data";
  if (kind === "ai-fill") return "module-connection-arrow-ai";
  if (kind === "explain") return "module-connection-arrow-explain";
  return "module-connection-arrow-link";
}

export function buildOrthogonalConnectionPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  laneOffset = 0
) {
  const horizontalGap = 28;
  const startStubX = startX + horizontalGap;
  const endStubX = endX - horizontalGap;

  if (endX >= startX + horizontalGap * 2) {
    const midX = (startStubX + endStubX) / 2;
    return `M ${startX} ${startY} L ${startStubX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endStubX} ${endY} L ${endX} ${endY}`;
  }

  const laneY = Math.min(startY, endY) - 34 - laneOffset * 14;
  return `M ${startX} ${startY} L ${startStubX} ${startY} L ${startStubX} ${laneY} L ${endStubX} ${laneY} L ${endStubX} ${endY} L ${endX} ${endY}`;
}
