import {
  MODULE_SKILL_PRESET_STORAGE_KEY,
  MODULE_SKILL_PRESETS,
  MODULE_REGISTRY,
  MODULE_REGISTRY_DELETED_STORAGE_KEY,
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

import {
  MODULE_REGISTRY_LIBRARY_VERSION,
  SKILL_REGISTRY_LIBRARY_VERSION,
  MODULE_SKILL_PRESET_LIBRARY_VERSION,
  canUseStorage,
  isStoredModuleRegistryLibrary,
  isStoredSkillRegistryLibrary,
  isStoredModuleSkillPresetLibrary,
  normalizeModuleRegistryEntry,
  normalizeModuleSkillPreset,
  normalizeSkillDefinition,
} from './helpers';
import type {
  StoredModuleRegistryLibrary,
  StoredSkillRegistryLibrary,
  StoredModuleSkillPresetLibrary,
} from './helpers';

function readStoredModuleLibrary() {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(MODULE_REGISTRY_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isStoredModuleRegistryLibrary(parsed)) {
      return null;
    }

    return {
      version: MODULE_REGISTRY_LIBRARY_VERSION,
      modules: parsed.modules.map(normalizeModuleRegistryEntry),
    } satisfies StoredModuleRegistryLibrary;
  } catch {
    return null;
  }
}

function readStoredSkillLibrary() {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SKILL_REGISTRY_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isStoredSkillRegistryLibrary(parsed)) {
      return null;
    }

    return {
      version: SKILL_REGISTRY_LIBRARY_VERSION,
      skills: parsed.skills.map(normalizeSkillDefinition),
    } satisfies StoredSkillRegistryLibrary;
  } catch {
    return null;
  }
}

function readStoredPresetLibrary() {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(MODULE_SKILL_PRESET_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isStoredModuleSkillPresetLibrary(parsed)) {
      return null;
    }

    return {
      version: MODULE_SKILL_PRESET_LIBRARY_VERSION,
      presets: parsed.presets.map(normalizeModuleSkillPreset),
    } satisfies StoredModuleSkillPresetLibrary;
  } catch {
    return null;
  }
}

function writeStoredModuleLibrary(entries: ModuleRegistryEntry[]) {
  if (!canUseStorage()) {
    return;
  }

  const payload: StoredModuleRegistryLibrary = {
    version: MODULE_REGISTRY_LIBRARY_VERSION,
    modules: entries.map(normalizeModuleRegistryEntry),
  };

  window.localStorage.setItem(MODULE_REGISTRY_STORAGE_KEY, JSON.stringify(payload));
}

function writeStoredSkillLibrary(entries: SkillDefinition[]) {
  if (!canUseStorage()) {
    return;
  }

  const payload: StoredSkillRegistryLibrary = {
    version: SKILL_REGISTRY_LIBRARY_VERSION,
    skills: entries.map(normalizeSkillDefinition),
  };

  window.localStorage.setItem(SKILL_REGISTRY_STORAGE_KEY, JSON.stringify(payload));
}

function writeStoredPresetLibrary(entries: ModuleSkillPreset[]) {
  if (!canUseStorage()) {
    return;
  }

  const payload: StoredModuleSkillPresetLibrary = {
    version: MODULE_SKILL_PRESET_LIBRARY_VERSION,
    presets: entries.map(normalizeModuleSkillPreset),
  };

  window.localStorage.setItem(MODULE_SKILL_PRESET_STORAGE_KEY, JSON.stringify(payload));
}

export function loadCustomModuleRegistry() {
  return readStoredModuleLibrary()?.modules ?? [];
}

function readDeletedModuleIds(): string[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(MODULE_REGISTRY_DELETED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

function writeDeletedModuleIds(ids: string[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(
    MODULE_REGISTRY_DELETED_STORAGE_KEY,
    JSON.stringify(Array.from(new Set(ids)))
  );
}

export function loadAvailableModuleRegistry() {
  const deletedIds = new Set(readDeletedModuleIds());
  return [
    ...MODULE_REGISTRY.filter((m) => !deletedIds.has(m.id)),
    ...loadCustomModuleRegistry().filter((m) => !deletedIds.has(m.id)),
  ].sort((a, b) => a.order - b.order);
}

export function loadCustomSkillRegistry() {
  return readStoredSkillLibrary()?.skills ?? [];
}

export function loadAvailableSkillRegistry() {
  return [...SKILL_REGISTRY, ...loadCustomSkillRegistry()].sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

export function loadCustomModuleSkillPresetRegistry() {
  return readStoredPresetLibrary()?.presets ?? [];
}

export function loadAvailableModuleSkillPresets() {
  return [...MODULE_SKILL_PRESETS, ...loadCustomModuleSkillPresetRegistry()].sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

export function getAvailableModuleRegistryEntryById(moduleId: ModuleTemplateId) {
  return loadAvailableModuleRegistry().find((entry) => entry.id === moduleId) ?? null;
}

export function getAvailableSkillDefinitionById(skillId: SkillDefinitionId) {
  return loadAvailableSkillRegistry().find((skill) => skill.id === skillId) ?? null;
}

export function getAvailableModuleSkillPresetById(presetId: string) {
  return loadAvailableModuleSkillPresets().find((preset) => preset.id === presetId) ?? null;
}

export function getAvailableModuleSkillPresetsByModuleId(moduleId: ModuleTemplateId) {
  return loadAvailableModuleSkillPresets().filter((preset) => preset.moduleId === moduleId);
}

export function resolveAvailableModuleRegistryEntry(
  moduleId: ModuleTemplateId | null | undefined,
  kind: BlockKind,
) {
  if (moduleId) {
    const explicitEntry = getAvailableModuleRegistryEntryById(moduleId);
    if (explicitEntry) {
      return explicitEntry;
    }
  }

  return getDefaultModuleRegistryEntry(kind);
}

export function upsertCustomModuleRegistryEntry(entry: ModuleRegistryEntry) {
  const normalized = normalizeModuleRegistryEntry(entry);
  const current = loadCustomModuleRegistry();
  const next = current.some((item) => item.id === normalized.id)
    ? current.map((item) => (item.id === normalized.id ? normalized : item))
    : [...current, normalized];

  writeStoredModuleLibrary(next);

  const deletedIds = readDeletedModuleIds();
  if (deletedIds.includes(normalized.id)) {
    writeDeletedModuleIds(deletedIds.filter((id) => id !== normalized.id));
  }

  return next;
}

export function deleteCustomModuleRegistryEntry(moduleId: ModuleTemplateId) {
  const next = loadCustomModuleRegistry().filter((entry) => entry.id !== moduleId);
  writeStoredModuleLibrary(next);

  const deletedIds = readDeletedModuleIds();
  if (!deletedIds.includes(moduleId)) {
    writeDeletedModuleIds([...deletedIds, moduleId]);
  }

  return next;
}

export function upsertCustomSkillRegistryEntry(skill: SkillDefinition) {
  const normalized = normalizeSkillDefinition(skill);
  const current = loadCustomSkillRegistry();
  const next = current.some((item) => item.id === normalized.id)
    ? current.map((item) => (item.id === normalized.id ? normalized : item))
    : [...current, normalized];

  writeStoredSkillLibrary(next);
  return next;
}

export function deleteCustomSkillRegistryEntry(skillId: SkillDefinitionId) {
  const next = loadCustomSkillRegistry().filter((skill) => skill.id !== skillId);
  writeStoredSkillLibrary(next);
  return next;
}

export function upsertCustomModuleSkillPreset(entry: ModuleSkillPreset) {
  const normalized = normalizeModuleSkillPreset(entry);
  const current = loadCustomModuleSkillPresetRegistry();
  const next = current.some((item) => item.id === normalized.id)
    ? current.map((item) => (item.id === normalized.id ? normalized : item))
    : [...current, normalized];

  writeStoredPresetLibrary(next);
  return next;
}

export function deleteCustomModuleSkillPreset(presetId: string) {
  const next = loadCustomModuleSkillPresetRegistry().filter((preset) => preset.id !== presetId);
  writeStoredPresetLibrary(next);
  return next;
}
