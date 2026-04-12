import {
  getAvailableModuleSkillPresetById,
  getAvailableSkillDefinitionById,
} from "./registry";
import type {
  CompositionRuntimeOverride,
  ModuleInstanceComposition,
  ModuleRegistryEntry,
  ModuleSkillPreset,
  ModuleSkillRequirement,
  ModuleSkillRequirementRole,
  ModuleSkillPresetId,
  ModuleTemplateId,
  SkillDefinition,
  SkillDefinitionId,
} from "./types";

function uniqueSkillIds(skillIds: SkillDefinitionId[]) {
  const seen = new Set<SkillDefinitionId>();
  return skillIds.filter((skillId) => {
    if (!skillId || seen.has(skillId)) {
      return false;
    }
    seen.add(skillId);
    return true;
  });
}

function normalizeOverrideValue(value: CompositionRuntimeOverride) {
  return {
    key: value.key.trim(),
    value: value.value.trim(),
  };
}

function getRoleLabel(role: ModuleSkillRequirementRole | SkillDefinition["class"]) {
  if (role === "framework") {
    return "Framework";
  }
  if (role === "domain") {
    return "Domain";
  }
  if (role === "output") {
    return "Output";
  }
  return "Custom";
}

function buildSkillRequirementIndex(entry: ModuleRegistryEntry) {
  return new Map(
    (entry.defaultSkillRequirements ?? []).map((requirement) => [
      requirement.skillId,
      requirement,
    ])
  );
}

function buildResolvedSkillHints(args: {
  entry: ModuleRegistryEntry;
  resolvedSkills: SkillDefinition[];
  requirementBySkillId: Map<SkillDefinitionId, ModuleSkillRequirement>;
}) {
  const fieldLabelById = new Map(
    args.entry.fields.map((field) => [field.id, field.label] as const)
  );
  const hints: string[] = [];
  const seen = new Set<string>();

  function pushHint(text: string) {
    const normalized = text.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    hints.push(normalized);
  }

  args.resolvedSkills.forEach((skill) => {
    const requirement = args.requirementBySkillId.get(skill.id);
    const roleLabel = getRoleLabel(requirement?.role ?? skill.class);
    pushHint(`${roleLabel} skill ${skill.label}: ${skill.semanticPromise}`);

    const logicBlock = skill.logicBlocks[0];
    if (logicBlock) {
      pushHint(`${skill.label} logic: ${logicBlock.description}`);
    }

    const fieldRule = skill.fieldRules[0];
    if (fieldRule) {
      const fieldLabel = fieldLabelById.get(fieldRule.fieldId) ?? fieldRule.fieldId;
      pushHint(`${skill.label} field ${fieldLabel}: ${fieldRule.rule}`);
    }

    const evidenceRule = skill.evidenceRules[0];
    if (evidenceRule) {
      pushHint(`${skill.label} evidence: ${evidenceRule.description}`);
    }

    const styleRule = skill.styleRules[0];
    if (styleRule) {
      pushHint(`${skill.label} style: ${styleRule.description}`);
    }
  });

  return hints.slice(0, 6);
}

export type ResolvedModuleInstanceComposition = {
  composition: ModuleInstanceComposition;
  preset: ModuleSkillPreset | null;
  requiredSkillIds: SkillDefinitionId[];
  defaultEnabledSkillIds: SkillDefinitionId[];
  presetSkillIds: SkillDefinitionId[];
  explicitSkillIds: SkillDefinitionId[];
  requestedSkillIds: SkillDefinitionId[];
  resolvedSkillIds: SkillDefinitionId[];
  unresolvedSkillIds: SkillDefinitionId[];
  incompatibleSkillIds: SkillDefinitionId[];
  resolvedSkills: SkillDefinition[];
  skillHints: string[];
  warnings: string[];
};

export function createModuleInstanceComposition(args: {
  pageId: string;
  blockId: string;
  moduleId: ModuleTemplateId;
  presetId?: ModuleSkillPresetId | null;
  enabledSkillIds?: SkillDefinitionId[];
  disabledDefaultSkillIds?: SkillDefinitionId[];
  pageInstruction?: string;
  blockIntent?: string;
  runtimeOverrides?: CompositionRuntimeOverride[];
}): ModuleInstanceComposition {
  return {
    pageId: args.pageId,
    blockId: args.blockId,
    moduleId: args.moduleId,
    presetId: args.presetId ?? null,
    enabledSkillIds: uniqueSkillIds(args.enabledSkillIds ?? []),
    disabledDefaultSkillIds: uniqueSkillIds(args.disabledDefaultSkillIds ?? []),
    pageInstruction: args.pageInstruction?.trim() || undefined,
    blockIntent: args.blockIntent?.trim() || undefined,
    runtimeOverrides: (args.runtimeOverrides ?? [])
      .map(normalizeOverrideValue)
      .filter((override) => override.key && override.value),
  };
}

export function resolveModuleInstanceComposition(args: {
  entry: ModuleRegistryEntry;
  composition: ModuleInstanceComposition;
}): ResolvedModuleInstanceComposition {
  const requirementBySkillId = buildSkillRequirementIndex(args.entry);
  const requiredSkillIds = uniqueSkillIds(
    (args.entry.defaultSkillRequirements ?? [])
      .filter((requirement) => requirement.status === "required")
      .map((requirement) => requirement.skillId)
  );
  const defaultEnabledSkillIds = uniqueSkillIds(
    (args.entry.defaultSkillRequirements ?? [])
      .filter(
        (requirement) =>
          requirement.defaultEnabled && requirement.status !== "required"
      )
      .map((requirement) => requirement.skillId)
  );
  const preset =
    args.composition.presetId != null
      ? getAvailableModuleSkillPresetById(args.composition.presetId)
      : null;
  const presetSkillIds = uniqueSkillIds(
    preset?.moduleId === args.entry.id ? preset.skillIds : []
  );
  const explicitSkillIds = uniqueSkillIds(args.composition.enabledSkillIds);
  const disabledDefaultSkillIds = new Set(args.composition.disabledDefaultSkillIds);
  const warnings: string[] = [];

  if (args.composition.presetId && !preset) {
    warnings.push(`Unknown preset: ${args.composition.presetId}.`);
  }
  if (preset && preset.moduleId !== args.entry.id) {
    warnings.push(
      `Preset ${preset.id} targets module ${preset.moduleId}, not ${args.entry.id}.`
    );
  }

  const blockedRequiredSkillIds = requiredSkillIds.filter((skillId) =>
    disabledDefaultSkillIds.has(skillId)
  );
  if (blockedRequiredSkillIds.length > 0) {
    warnings.push(
      `Required skills cannot be disabled: ${blockedRequiredSkillIds.join(", ")}.`
    );
  }

  const requestedSkillIds = uniqueSkillIds([
    ...requiredSkillIds,
    ...defaultEnabledSkillIds.filter(
      (skillId) => !disabledDefaultSkillIds.has(skillId)
    ),
    ...presetSkillIds,
    ...explicitSkillIds,
  ]);

  const resolvedSkills: SkillDefinition[] = [];
  const unresolvedSkillIds: SkillDefinitionId[] = [];

  requestedSkillIds.forEach((skillId) => {
    const resolvedSkill = getAvailableSkillDefinitionById(skillId);
    if (!resolvedSkill) {
      unresolvedSkillIds.push(skillId);
      warnings.push(`Unknown skill: ${skillId}.`);
      return;
    }
    resolvedSkills.push(resolvedSkill);
  });

  const incompatibleSkillIds = resolvedSkills
    .map((skill) => skill.id)
    .filter((skillId) => args.entry.incompatibleSkillIds?.includes(skillId));

  if (incompatibleSkillIds.length > 0) {
    warnings.push(
      `Incompatible skills selected for ${args.entry.id}: ${incompatibleSkillIds.join(
        ", "
      )}.`
    );
  }

  return {
    composition: createModuleInstanceComposition(args.composition),
    preset,
    requiredSkillIds,
    defaultEnabledSkillIds,
    presetSkillIds,
    explicitSkillIds,
    requestedSkillIds,
    resolvedSkillIds: resolvedSkills.map((skill) => skill.id),
    unresolvedSkillIds,
    incompatibleSkillIds,
    resolvedSkills,
    skillHints: buildResolvedSkillHints({
      entry: args.entry,
      resolvedSkills,
      requirementBySkillId,
    }),
    warnings,
  };
}
