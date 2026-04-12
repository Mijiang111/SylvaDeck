import { DEFAULT_TEMPLATE_ID } from "../config";
import type { TemplateId, WorkbenchTemplate } from "../types";
import { blankTemplate } from "./blankTemplate";

export const TEMPLATE_DEFINITIONS: Record<TemplateId, WorkbenchTemplate> = {
  blank: blankTemplate,
};

export const TEMPLATE_LIBRARY = Object.values(TEMPLATE_DEFINITIONS).map((template) => ({
  id: template.id,
  name: template.meta.name,
  description: template.meta.description,
  industry: template.meta.industry,
}));

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === "string" && value in TEMPLATE_DEFINITIONS;
}

export function getTemplateDefinition(templateId: TemplateId) {
  return TEMPLATE_DEFINITIONS[templateId] ?? TEMPLATE_DEFINITIONS[DEFAULT_TEMPLATE_ID];
}
