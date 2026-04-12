import {
  MODULE_SKILL_PRESET_STORAGE_KEY,
  MODULE_SKILL_PRESETS,
  MODULE_REGISTRY,
  MODULE_REGISTRY_STORAGE_KEY,
  SKILL_REGISTRY,
  SKILL_REGISTRY_STORAGE_KEY,
  getDefaultModuleRegistryEntry,
} from "@/features/studio/config";
import type {
  BlockKind,
  ModuleRegistryEntry,
  ModuleSkillPreset,
  ModuleTemplateId,
  SkillDefinition,
  SkillDefinitionId,
} from "@/features/studio/types";

type StoredModuleRegistryLibrary = {
  version: 1;
  modules: ModuleRegistryEntry[];
};

type StoredSkillRegistryLibrary = {
  version: 1;
  skills: SkillDefinition[];
};

type StoredModuleSkillPresetLibrary = {
  version: 1;
  presets: ModuleSkillPreset[];
};

const MODULE_REGISTRY_LIBRARY_VERSION = 1 as const;
const SKILL_REGISTRY_LIBRARY_VERSION = 1 as const;
const MODULE_SKILL_PRESET_LIBRARY_VERSION = 1 as const;

function canUseStorage() {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function normalizeList(items: string[] | undefined) {
  return (items ?? []).map((item) => item.trim()).filter(Boolean);
}

function normalizeModuleRegistryEntry(
  entry: ModuleRegistryEntry
): ModuleRegistryEntry {
  return {
    ...entry,
    id: entry.id.trim(),
    label: entry.label.trim(),
    semanticRole: entry.semanticRole.trim(),
    description: entry.description.trim(),
    promptHint: entry.promptHint.trim(),
    useCases: normalizeList(entry.useCases),
    searchTerms: normalizeList(entry.searchTerms),
    defaultSkillRequirements: (entry.defaultSkillRequirements ?? []).map(
      (requirement) => ({
        ...requirement,
        skillId: requirement.skillId.trim(),
        reason: requirement.reason.trim(),
        label: requirement.label?.trim(),
        description: requirement.description?.trim(),
        skillPath: requirement.skillPath?.trim(),
      })
    ),
    supportedSkillClasses: entry.supportedSkillClasses ?? [],
    incompatibleSkillIds: normalizeList(entry.incompatibleSkillIds),
    examples: (entry.examples ?? []).map((example) => ({
      ...example,
      id: example.id.trim(),
      label: example.label.trim(),
      description: example.description.trim(),
    })),
    skillBindings: (entry.skillBindings ?? []).map((binding) => ({
      ...binding,
      id: binding.id.trim(),
      label: binding.label.trim(),
      description: binding.description.trim(),
      skillPath: binding.skillPath?.trim(),
    })),
    moduleFrame: entry.moduleFrame
      ? {
          x: entry.moduleFrame.x,
          y: entry.moduleFrame.y,
          w: entry.moduleFrame.w,
          h: entry.moduleFrame.h,
        }
      : undefined,
    connections: (entry.connections ?? []).map((connection) => ({
      ...connection,
      id: connection.id.trim(),
      sourceFieldId: connection.sourceFieldId.trim(),
      targetFieldId: connection.targetFieldId.trim(),
    })),
    thinkingFlow: {
      nodes: (entry.thinkingFlow?.nodes ?? []).map((node) => ({
        ...node,
        id: node.id.trim(),
        label: node.label.trim(),
        detail: node.detail.trim(),
        fieldId: node.fieldId?.trim(),
        toolConfig: node.toolConfig
          ? {
              adapterId: node.toolConfig.adapterId,
              focusPrompt: node.toolConfig.focusPrompt?.trim(),
              maxItems: node.toolConfig.maxItems,
            }
          : undefined,
      })),
      edges: (entry.thinkingFlow?.edges ?? []).map((edge) => ({
        ...edge,
        id: edge.id.trim(),
        sourceNodeId: edge.sourceNodeId.trim(),
        targetNodeId: edge.targetNodeId.trim(),
        branch:
          edge.branch === "yes" || edge.branch === "no"
            ? edge.branch
            : undefined,
      })),
    },
    fields: (entry.fields ?? []).map((field) => ({
      ...field,
      id: field.id.trim(),
      label: field.label.trim(),
      description: field.description.trim(),
      example: field.example?.trim(),
      outputContract: field.outputContract
        ? {
            goal: field.outputContract.goal?.trim(),
            format: field.outputContract.format,
            length: field.outputContract.length,
            mustInclude: field.outputContract.mustInclude?.trim(),
          }
        : undefined,
      aiState:
        field.aiState ??
        ((field.objectKind ?? "slot") === "slot" ? "ai-fill" : "locked"),
      dataTable: field.dataTable
        ? {
            raw: field.dataTable.raw,
            hasHeader: field.dataTable.hasHeader,
            columns: field.dataTable.columns.map((column) => ({
              id: column.id.trim(),
              label: column.label.trim(),
              type: column.type,
            })),
            rows: field.dataTable.rows.map((row) =>
              row.map((cell) => cell.trim())
            ),
          }
        : undefined,
      chartSpec: field.chartSpec
        ? {
            kind: field.chartSpec.kind,
          }
        : undefined,
      layout: field.layout
        ? {
            x: field.layout.x,
            y: field.layout.y,
            w: field.layout.w,
            h: field.layout.h,
          }
        : undefined,
    })),
  };
}

function normalizeSkillDefinition(skill: SkillDefinition): SkillDefinition {
  return {
    ...skill,
    id: skill.id.trim(),
    label: skill.label.trim(),
    semanticPromise: skill.semanticPromise.trim(),
    summary: skill.summary.trim(),
    targetModuleIds: normalizeList(skill.targetModuleIds),
    fieldRules: (skill.fieldRules ?? []).map((rule) => ({
      ...rule,
      fieldId: rule.fieldId.trim(),
      rule: rule.rule.trim(),
      examples: normalizeList(rule.examples),
    })),
    antiPatterns: (skill.antiPatterns ?? []).map((pattern) => ({
      ...pattern,
      id: pattern.id.trim(),
      label: pattern.label.trim(),
      description: pattern.description.trim(),
    })),
    evidenceRules: (skill.evidenceRules ?? []).map((rule) => ({
      ...rule,
      id: rule.id.trim(),
      description: rule.description.trim(),
    })),
    styleRules: (skill.styleRules ?? []).map((rule) => ({
      ...rule,
      id: rule.id.trim(),
      description: rule.description.trim(),
    })),
    logicBlocks: (skill.logicBlocks ?? []).map((block) => ({
      ...block,
      id: block.id.trim(),
      label: block.label.trim(),
      description: block.description.trim(),
    })),
  };
}

function normalizeModuleSkillPreset(
  preset: ModuleSkillPreset
): ModuleSkillPreset {
  return {
    ...preset,
    id: preset.id.trim(),
    label: preset.label.trim(),
    moduleId: preset.moduleId.trim(),
    skillIds: normalizeList(preset.skillIds),
    requiredSkillIds: normalizeList(preset.requiredSkillIds),
    optionalSkillIds: normalizeList(preset.optionalSkillIds),
    description: preset.description.trim(),
    useCases: normalizeList(preset.useCases),
    compatibilitySignature: preset.compatibilitySignature.trim(),
  };
}

function isStoredModuleRegistryLibrary(
  value: unknown
): value is StoredModuleRegistryLibrary {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<StoredModuleRegistryLibrary>;
  return (
    candidate.version === MODULE_REGISTRY_LIBRARY_VERSION &&
    Array.isArray(candidate.modules)
  );
}

function isStoredSkillRegistryLibrary(
  value: unknown
): value is StoredSkillRegistryLibrary {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<StoredSkillRegistryLibrary>;
  return (
    candidate.version === SKILL_REGISTRY_LIBRARY_VERSION &&
    Array.isArray(candidate.skills)
  );
}

function isStoredModuleSkillPresetLibrary(
  value: unknown
): value is StoredModuleSkillPresetLibrary {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<StoredModuleSkillPresetLibrary>;
  return (
    candidate.version === MODULE_SKILL_PRESET_LIBRARY_VERSION &&
    Array.isArray(candidate.presets)
  );
}

export {
  MODULE_REGISTRY_LIBRARY_VERSION,
  SKILL_REGISTRY_LIBRARY_VERSION,
  MODULE_SKILL_PRESET_LIBRARY_VERSION,
  canUseStorage,
  normalizeModuleRegistryEntry,
  normalizeSkillDefinition,
  normalizeModuleSkillPreset,
  isStoredModuleRegistryLibrary,
  isStoredSkillRegistryLibrary,
  isStoredModuleSkillPresetLibrary,
};

export type {
  StoredModuleRegistryLibrary,
  StoredSkillRegistryLibrary,
  StoredModuleSkillPresetLibrary,
};
