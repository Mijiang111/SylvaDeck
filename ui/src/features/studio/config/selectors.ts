import type { BlockKind, ModuleRegistryEntry, ModuleSkillPreset, ModuleTemplateId, SkillDefinition } from '../types';
import { BLOCK_KIND_PRESETS } from './constants';
import { MODULE_REGISTRY } from './modules';
import { MODULE_SKILL_PRESETS } from './moduleSkillPresets';
import { SKILL_REGISTRY } from './skills';

export const MODULE_REGISTRY_BY_ID: Record<ModuleTemplateId, ModuleRegistryEntry> = Object.fromEntries(
  MODULE_REGISTRY.map((entry) => [entry.id, entry]),
) as Record<ModuleTemplateId, ModuleRegistryEntry>;

export const SKILL_REGISTRY_BY_ID = Object.fromEntries(
  SKILL_REGISTRY.map((entry) => [entry.id, entry]),
) as Record<string, SkillDefinition>;

export const MODULE_SKILL_PRESETS_BY_ID = Object.fromEntries(
  MODULE_SKILL_PRESETS.map((entry) => [entry.id, entry]),
) as Record<string, ModuleSkillPreset>;

export const DEFAULT_MODULE_REGISTRY_BY_KIND: Record<BlockKind, ModuleRegistryEntry> = Object.fromEntries(
  (Object.keys(BLOCK_KIND_PRESETS) as BlockKind[]).map((kind) => {
    const preferred =
      MODULE_REGISTRY.find(
        (entry) => entry.kind === kind && entry.family === "primitive" && entry.featured,
      ) ?? MODULE_REGISTRY.find((entry) => entry.kind === kind);

    return [kind, preferred as ModuleRegistryEntry];
  }),
) as Record<BlockKind, ModuleRegistryEntry>;

export function getModuleRegistryEntryById(moduleId: ModuleTemplateId) {
  return MODULE_REGISTRY_BY_ID[moduleId];
}

export function getDefaultModuleRegistryEntry(kind: BlockKind) {
  return DEFAULT_MODULE_REGISTRY_BY_KIND[kind];
}

export function resolveModuleRegistryEntry(
  moduleId: ModuleTemplateId | null | undefined,
  kind: BlockKind,
) {
  if (moduleId) {
    const explicitEntry = getModuleRegistryEntryById(moduleId);
    if (explicitEntry) {
      return explicitEntry;
    }
  }

  return getDefaultModuleRegistryEntry(kind);
}

export function getModuleRegistryEntry(kind: BlockKind) {
  return getDefaultModuleRegistryEntry(kind);
}

export function getSkillDefinitionById(skillId: string) {
  return SKILL_REGISTRY_BY_ID[skillId];
}

export function getModuleSkillPresetById(presetId: string) {
  return MODULE_SKILL_PRESETS_BY_ID[presetId];
}

export function getModuleSkillPresetsByModuleId(moduleId: ModuleTemplateId) {
  return MODULE_SKILL_PRESETS.filter((preset) => preset.moduleId === moduleId);
}

export const MODULE_LIBRARY: Array<{ kind: BlockKind; label: string }> = MODULE_REGISTRY.map(
  ({ kind, label }) => ({ kind, label }),
);
