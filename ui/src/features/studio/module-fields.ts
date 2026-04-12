import type { ModuleCanvasObjectKind, ModuleTemplateField } from "./types";

export function getCanvasObjectKind(
  field: ModuleTemplateField
): ModuleCanvasObjectKind {
  return field.objectKind ?? "slot";
}

export function isAiTextField(field: ModuleTemplateField) {
  const kind = getCanvasObjectKind(field);
  if (kind === "slot") {
    return true;
  }
  return (
    kind === "text" &&
    (field.aiState === "ai-fill" || field.aiState === "summarize-linked-data")
  );
}

export function isSemanticTemplateSlotField(field: ModuleTemplateField) {
  const kind = getCanvasObjectKind(field);
  if (isAiTextField(field)) {
    return true;
  }
  if (kind === "chart") {
    return true;
  }
  return kind === "data" && field.aiState === "summarize-linked-data";
}

export function isDecorativeTemplateField(field: ModuleTemplateField) {
  const kind = getCanvasObjectKind(field);
  if (kind === "line" || kind === "ellipse" || kind === "rectangle") {
    return true;
  }
  return kind === "text" && !isAiTextField(field);
}

export function isSquareTemplateField(field: ModuleTemplateField) {
  return (
    getCanvasObjectKind(field) === "rectangle" &&
    field.style?.aspectLock === "square"
  );
}
