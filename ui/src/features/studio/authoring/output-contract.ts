import type {
  ModuleFieldOutputFormat,
  ModuleFieldOutputLength,
  ModuleTemplateField,
} from "@/features/studio/types";

import { getCanvasObjectKind } from "../module-fields";

export const OUTPUT_CONTRACT_FORMAT_LABEL: Record<
  ModuleFieldOutputFormat,
  string
> = {
  point: "Point",
  bullets: "List",
  comparison: "Compare",
  chart: "Chart",
};

export const OUTPUT_CONTRACT_LENGTH_LABEL: Record<
  ModuleFieldOutputLength,
  string
> = {
  tight: "Tight",
  short: "Short",
  full: "Full",
};

function isAiEditableField(field: ModuleTemplateField) {
  return (
    field.aiState === "ai-fill" || field.aiState === "summarize-linked-data"
  );
}

export function canDefineOutputContract(field: ModuleTemplateField) {
  const objectKind = getCanvasObjectKind(field);
  return (
    objectKind === "slot" ||
    objectKind === "chart" ||
    (objectKind === "text" && isAiEditableField(field))
  );
}

export function normalizeFieldOutputContract(
  contract: ModuleTemplateField["outputContract"]
) {
  if (!contract) {
    return undefined;
  }

  const goal = contract.goal?.trim();
  const mustInclude = contract.mustInclude?.trim();
  const format = contract.format;
  const length = contract.length;

  if (!goal && !mustInclude && !format && !length) {
    return undefined;
  }

  return {
    goal,
    format,
    length,
    mustInclude,
  };
}

export function getFieldOutputGoal(
  field: ModuleTemplateField,
  fallback?: string
) {
  return (
    field.outputContract?.goal?.trim() ||
    field.description.trim() ||
    fallback ||
    `Fill ${field.label}.`
  );
}

export function getFieldOutputFormat(field: ModuleTemplateField) {
  return (
    field.outputContract?.format ??
    (getCanvasObjectKind(field) === "chart" ? "chart" : "point")
  );
}

export function getFieldOutputLength(field: ModuleTemplateField) {
  return field.outputContract?.length ?? "short";
}

export function getOutputContractFormatOptions(field: ModuleTemplateField) {
  const objectKind = getCanvasObjectKind(field);
  if (objectKind === "chart") {
    return ["chart", "point", "comparison"] as const;
  }
  return ["point", "bullets", "comparison"] as const;
}

export function buildOutputContractPreviewCopy(field: ModuleTemplateField) {
  const goal = getFieldOutputGoal(
    field,
    "AI output preview appears here once the block is connected and described."
  );
  const mustInclude = field.outputContract?.mustInclude?.trim();
  return [goal, mustInclude ? `Must show ${mustInclude}.` : ""]
    .filter(Boolean)
    .join(" ");
}
