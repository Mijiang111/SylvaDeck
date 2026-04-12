import type {
  GenerationSkillDefinition,
} from "./generation-contract";
import {
  createModuleInstanceComposition,
  resolveModuleInstanceComposition,
  type ResolvedModuleInstanceComposition,
} from "./module-composition";
import { resolveAvailableModuleRegistryEntry } from "./registry";
import type {
  CompositionRuntimeOverride,
  ConversationMessage,
  LayoutBlock,
  LayoutPage,
  MetricFact,
  ModuleGenerationRouteDecision,
  ModuleInstanceComposition,
  ModuleRegistryEntry,
  ModuleTemplateField,
  NarrativeItem,
  SkillDefinition,
} from "./types";

function normalizeRuntimeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function clampRuntimeText(text: string, max: number) {
  const normalized = normalizeRuntimeText(text);
  return normalized.length > max ? normalized.slice(0, max) : normalized;
}

const REPORT_SOURCE_BRIEF_MAX_CHARS = 60_000;

export type ReportSourceInput = {
  sourceKind: "manual" | "conversation";
  sourceText: string;
  briefMessages: ConversationMessage[];
  pendingInput: string;
  briefText: string;
};

export type ModuleRuntimePlanItem =
  | {
      kind: "metric";
      value: string;
      label: string;
    }
  | {
      kind: "narrative";
      title: string;
      body: string;
    };

export type ModuleRuntimeSkillDefinition = {
  id: GenerationSkillDefinition["id"];
  label: GenerationSkillDefinition["label"];
  class: SkillDefinition["class"];
  semanticPromise: GenerationSkillDefinition["semanticPromise"];
  summary: GenerationSkillDefinition["summary"];
  logicBlocks: GenerationSkillDefinition["logicBlocks"];
  fieldRules: GenerationSkillDefinition["fieldRules"];
  antiPatterns: GenerationSkillDefinition["antiPatterns"];
  evidenceRules: GenerationSkillDefinition["evidenceRules"];
  styleRules: GenerationSkillDefinition["styleRules"];
};

export type ModuleRuntimeInput = {
  reportSource: ReportSourceInput;
  module: {
    id: string;
    label: string;
    family: string;
    semanticRole: string;
    promptHint: string;
    skillIds: string[];
    skillHints: string[];
    skills: ModuleRuntimeSkillDefinition[];
    fields: ModuleTemplateField[];
  };
  routing: ModuleGenerationRouteDecision;
  composition: {
    presetId: string | null;
    enabledSkillIds: string[];
    unresolvedSkillIds: string[];
    disabledDefaultSkillIds: string[];
    runtimeOverrides: CompositionRuntimeOverride[];
    warnings: string[];
  };
  block: {
    id: string;
    kind: LayoutBlock["kind"];
    title: string;
    detail: string;
    intent: string;
    planRole: string;
    planPatternId: string;
  };
  page: {
    id: string;
    chapter: string;
    title: string;
    note: string;
    instruction: string;
    role: string;
    intent: string;
    story: string;
  };
  deck: {
    previousPageSummary: string;
    nextPageBridge: string;
  };
  planItems: ModuleRuntimePlanItem[];
  briefText: string;
};

export type GenerationBlockInput = {
  id: string;
  moduleId: string;
  moduleLabel: string;
  moduleFamily: string;
  moduleSemanticRole: string;
  modulePromptHint: string;
  moduleSkillIds: string[];
  moduleSkillHints: string[];
  moduleSkills: ModuleRuntimeSkillDefinition[];
  modulePresetId: string | null;
  modulePresetLabel: string;
  modulePresetDescription: string;
  moduleRequiredSkillIds: string[];
  moduleUnresolvedSkillIds: string[];
  moduleIncompatibleSkillIds: string[];
  moduleCompositionWarnings: string[];
  modulePlanRole: string;
  modulePlanPatternId: string;
  moduleRouteMode: ModuleGenerationRouteDecision["routeMode"];
  moduleRouteReason: string;
  moduleRouteScore: number;
  moduleRuntimeOverrides: CompositionRuntimeOverride[];
  moduleFields: ModuleTemplateField[];
  title: string;
  detail: string;
  intent: string;
  kind: LayoutBlock["kind"];
};

function serializeRuntimeSkillDefinition(
  skill: SkillDefinition
): ModuleRuntimeSkillDefinition {
  return {
    id: skill.id,
    label: clampRuntimeText(skill.label, 80),
    class: skill.class,
    semanticPromise: clampRuntimeText(skill.semanticPromise, 220),
    summary: clampRuntimeText(skill.summary, 220),
    logicBlocks: skill.logicBlocks
      .map((block) =>
        clampRuntimeText(
          [block.label, block.description].filter(Boolean).join(": "),
          220
        )
      )
      .filter(Boolean)
      .slice(0, 4),
    fieldRules: skill.fieldRules.slice(0, 6).map((rule) => ({
      fieldId: clampRuntimeText(rule.fieldId, 80),
      rule: clampRuntimeText(rule.rule, 220),
      required: rule.required,
      examples: rule.examples
        .map((example) => clampRuntimeText(example, 120))
        .filter(Boolean)
        .slice(0, 3),
    })),
    antiPatterns: skill.antiPatterns
      .map((pattern) =>
        clampRuntimeText(
          [pattern.label, pattern.description].filter(Boolean).join(": "),
          220
        )
      )
      .filter(Boolean)
      .slice(0, 4),
    evidenceRules: skill.evidenceRules
      .map((rule) => clampRuntimeText(rule.description, 220))
      .filter(Boolean)
      .slice(0, 4),
    styleRules: skill.styleRules
      .map((rule) => clampRuntimeText(rule.description, 220))
      .filter(Boolean)
      .slice(0, 4),
  };
}

function toModuleRuntimePlanItem(
  item: MetricFact | NarrativeItem | ModuleRuntimePlanItem
): ModuleRuntimePlanItem {
  if ("kind" in item) {
    return item;
  }

  if ("value" in item) {
    return {
      kind: "metric",
      value: item.value,
      label: item.label,
    };
  }

  return {
    kind: "narrative",
    title: item.title,
    body: item.body,
  };
}

function buildRuntimeKindSummary(input: Omit<ModuleRuntimeInput, "briefText">) {
  const story = normalizeRuntimeText(input.page.story);
  const role = normalizeRuntimeText(input.page.role);
  const focus = normalizeRuntimeText(input.block.intent);

  if (!story && !role) {
    return "";
  }

  if (story && role) {
    return focus ? `${story} Focus on ${focus}.` : story;
  }

  if (story) {
    return story;
  }

  return focus ? `${role}: ${focus}.` : role;
}

function summarizeModuleRuntimeSkillHints(input: Omit<ModuleRuntimeInput, "briefText">) {
  return input.module.skillHints.map((hint) => `Skill guidance: ${hint}`);
}

function summarizeModuleRuntimeSkills(input: Omit<ModuleRuntimeInput, "briefText">) {
  return input.module.skills.flatMap((skill) => {
    const lines = [
      `${skill.class} skill ${skill.label}: ${skill.semanticPromise}`,
      ...skill.logicBlocks.map((block) => `Logic: ${block}`),
      ...skill.fieldRules.map((rule) =>
        `Field rule ${rule.fieldId}: ${rule.rule}${
          rule.examples.length ? ` Examples: ${rule.examples.join("; ")}` : ""
        }`
      ),
      ...skill.antiPatterns.map((item) => `Avoid: ${item}`),
      ...skill.evidenceRules.map((item) => `Evidence: ${item}`),
      ...skill.styleRules.map((item) => `Style: ${item}`),
    ];

    return lines.slice(0, 8);
  });
}

function summarizeModuleRuntimeOverrides(input: Omit<ModuleRuntimeInput, "briefText">) {
  return input.composition.runtimeOverrides.map(
    (override) => `Runtime override ${override.key}: ${override.value}`
  );
}

function summarizeModuleRuntimePlanner(input: Omit<ModuleRuntimeInput, "briefText">) {
  const parts: string[] = [];
  if (input.block.planRole) {
    parts.push(`Planner role: ${input.block.planRole}`);
  }
  if (input.block.planPatternId) {
    parts.push(`Planner pattern: ${input.block.planPatternId}`);
  }
  return parts;
}

function summarizeModuleRuntimeRouting(input: Omit<ModuleRuntimeInput, "briefText">) {
  if (!input.routing.reason) {
    return [];
  }

  return [
    `Routing (${input.routing.routeMode}, score ${input.routing.score}): ${input.routing.reason}`,
  ];
}

export function summarizeModuleRuntimePlanItems(
  items: ModuleRuntimePlanItem[]
): string[] {
  return items.slice(0, 4).map((item) =>
    item.kind === "metric"
      ? `${item.value}: ${item.label}`
      : `${item.title}: ${item.body}`
  );
}

export function composeBriefSource(
  messages: ConversationMessage[],
  pendingInput = ""
) {
  const parts = messages
    .filter((message) => message.role === "user")
    .map((message) => message.text.trim())
    .filter(Boolean);

  if (pendingInput.trim()) {
    parts.push(pendingInput.trim());
  }

  return parts.join("\n\n");
}

export function buildReportSourceInput(args: {
  sourceText?: string;
  briefMessages?: ConversationMessage[];
  pendingInput?: string;
}): ReportSourceInput {
  const sourceText = normalizeRuntimeText(args.sourceText ?? "");
  const briefMessages = args.briefMessages ?? [];
  const pendingInput = args.pendingInput ?? "";
  const conversationBrief = normalizeRuntimeText(
    composeBriefSource(briefMessages, pendingInput)
  );
  const briefText = clampRuntimeText(
    sourceText || conversationBrief,
    REPORT_SOURCE_BRIEF_MAX_CHARS,
  );

  return {
    sourceKind: sourceText ? "manual" : "conversation",
    sourceText,
    briefMessages,
    pendingInput,
    briefText,
  };
}

export function buildGenerationBlockInput(
  block: LayoutBlock,
  entry?: ModuleRegistryEntry,
  resolvedComposition?: ResolvedModuleInstanceComposition,
  routeDecision?: ModuleGenerationRouteDecision
): GenerationBlockInput {
  const resolvedEntry =
    entry ?? resolveAvailableModuleRegistryEntry(block.moduleId, block.kind);
  const nextResolvedComposition =
    resolvedComposition ??
    resolveModuleInstanceComposition({
      entry: resolvedEntry,
      composition: createModuleInstanceComposition({
        pageId: "",
        blockId: block.id,
        moduleId: resolvedEntry.id,
        blockIntent: block.intent ?? "",
      }),
    });

  return {
    id: clampRuntimeText(block.id, 120),
    moduleId: clampRuntimeText(resolvedEntry.id, 160),
    moduleLabel: clampRuntimeText(resolvedEntry.label, 120),
    moduleFamily: clampRuntimeText(resolvedEntry.family, 80),
    moduleSemanticRole: clampRuntimeText(resolvedEntry.semanticRole, 220),
    modulePromptHint: clampRuntimeText(resolvedEntry.promptHint, 240),
    moduleSkillIds: nextResolvedComposition.resolvedSkillIds
      .map((id) => clampRuntimeText(id, 160))
      .filter(Boolean)
      .slice(0, 8),
    moduleSkillHints: nextResolvedComposition.skillHints
      .map((hint) => clampRuntimeText(hint, 240))
      .filter(Boolean)
      .slice(0, 6),
    moduleSkills: nextResolvedComposition.resolvedSkills.map(
      serializeRuntimeSkillDefinition
    ).slice(0, 8),
    modulePresetId: nextResolvedComposition.composition.presetId
      ? clampRuntimeText(nextResolvedComposition.composition.presetId, 160)
      : null,
    modulePresetLabel: clampRuntimeText(nextResolvedComposition.preset?.label ?? "", 120),
    modulePresetDescription: clampRuntimeText(
      nextResolvedComposition.preset?.description ?? "",
      240,
    ),
    moduleRequiredSkillIds: nextResolvedComposition.requiredSkillIds
      .map((id) => clampRuntimeText(id, 160))
      .filter(Boolean)
      .slice(0, 8),
    moduleUnresolvedSkillIds: nextResolvedComposition.unresolvedSkillIds
      .map((id) => clampRuntimeText(id, 160))
      .filter(Boolean)
      .slice(0, 8),
    moduleIncompatibleSkillIds: nextResolvedComposition.incompatibleSkillIds
      .map((id) => clampRuntimeText(id, 160))
      .filter(Boolean)
      .slice(0, 8),
    moduleCompositionWarnings: nextResolvedComposition.warnings
      .map((warning) => clampRuntimeText(warning, 240))
      .filter(Boolean)
      .slice(0, 8),
    modulePlanRole: clampRuntimeText(block.plannerRole ?? "", 80),
    modulePlanPatternId: clampRuntimeText(block.plannerPatternId ?? "", 80),
    moduleRouteMode: routeDecision?.routeMode ?? "default",
    moduleRouteReason: clampRuntimeText(
      routeDecision?.reason ??
        `Use ${resolvedEntry.label} as the default ${resolvedEntry.kind} module.`,
      320,
    ),
    moduleRouteScore: routeDecision?.score ?? 0,
    moduleRuntimeOverrides: (nextResolvedComposition.composition.runtimeOverrides ?? [])
      .map((override) => ({
        key: clampRuntimeText(override.key, 120),
        value: clampRuntimeText(override.value, 240),
      }))
      .filter((override) => override.key && override.value)
      .slice(0, 8),
    moduleFields: resolvedEntry.fields.slice(0, 8).map((field) => ({
      ...field,
      id: clampRuntimeText(field.id, 80),
      label: clampRuntimeText(field.label, 80),
      description: clampRuntimeText(field.description, 220),
      example: field.example ? clampRuntimeText(field.example, 160) : undefined,
    })),
    title: clampRuntimeText(block.title, 160),
    detail: clampRuntimeText(block.detail, 240),
    intent: clampRuntimeText(block.intent ?? "", 320),
    kind: block.kind,
  };
}

export function buildModuleRuntimeInput(args: {
  block: LayoutBlock;
  entry: ModuleRegistryEntry;
  composition?: ModuleInstanceComposition;
  resolvedComposition?: ResolvedModuleInstanceComposition;
  routeDecision?: ModuleGenerationRouteDecision;
  reportSource?: ReportSourceInput;
  page?: Partial<ModuleRuntimeInput["page"]>;
  deck?: Partial<ModuleRuntimeInput["deck"]>;
  planItems?: Array<MetricFact | NarrativeItem | ModuleRuntimePlanItem>;
}): ModuleRuntimeInput {
  const resolvedComposition =
    args.resolvedComposition ??
    resolveModuleInstanceComposition({
      entry: args.entry,
      composition:
        args.composition ??
        createModuleInstanceComposition({
          pageId: args.page?.id ?? "",
          blockId: args.block.id,
          moduleId: args.entry.id,
          presetId: args.block.presetId ?? null,
          enabledSkillIds: args.block.enabledSkillIds ?? [],
          disabledDefaultSkillIds: args.block.disabledDefaultSkillIds ?? [],
          pageInstruction: args.page?.instruction ?? "",
          blockIntent: args.block.intent ?? "",
        }),
    });
  const baseInput = {
    reportSource:
      args.reportSource ??
      buildReportSourceInput({
        sourceText: "",
      }),
    module: {
      id: args.entry.id,
      label: args.entry.label,
      family: args.entry.family,
      semanticRole: args.entry.semanticRole,
      promptHint: args.entry.promptHint,
      skillIds: resolvedComposition.resolvedSkillIds,
      skillHints: resolvedComposition.skillHints,
      skills: resolvedComposition.resolvedSkills.map(
        serializeRuntimeSkillDefinition
      ),
      fields: args.entry.fields,
    },
    routing: args.routeDecision ?? {
      currentModuleId: args.entry.id,
      selectedModuleId: args.entry.id,
      routeMode: "default",
      reason: `Use ${args.entry.label} as the default ${args.entry.kind} module.`,
      score: 0,
    },
    composition: {
      presetId: resolvedComposition.composition.presetId,
      enabledSkillIds: resolvedComposition.resolvedSkillIds,
      unresolvedSkillIds: resolvedComposition.unresolvedSkillIds,
      disabledDefaultSkillIds:
        resolvedComposition.composition.disabledDefaultSkillIds,
      runtimeOverrides: resolvedComposition.composition.runtimeOverrides ?? [],
      warnings: resolvedComposition.warnings,
    },
    block: {
      id: args.block.id,
      kind: args.block.kind,
      title: args.block.title,
      detail: args.block.detail,
      intent: normalizeRuntimeText(args.block.intent ?? ""),
      planRole: args.block.plannerRole ?? "",
      planPatternId: args.block.plannerPatternId ?? "",
    },
    page: {
      id: args.page?.id ?? "",
      chapter: args.page?.chapter ?? "",
      title: args.page?.title ?? "",
      note: args.page?.note ?? "",
      instruction: normalizeRuntimeText(args.page?.instruction ?? ""),
      role: normalizeRuntimeText(args.page?.role ?? ""),
      intent: normalizeRuntimeText(args.page?.intent ?? ""),
      story: normalizeRuntimeText(args.page?.story ?? ""),
    },
    deck: {
      previousPageSummary: normalizeRuntimeText(
        args.deck?.previousPageSummary ?? ""
      ),
      nextPageBridge: normalizeRuntimeText(args.deck?.nextPageBridge ?? ""),
    },
    planItems: (args.planItems ?? []).map(toModuleRuntimePlanItem),
  } satisfies Omit<ModuleRuntimeInput, "briefText">;

  return {
    ...baseInput,
    briefText: serializeModuleRuntimeBrief(baseInput),
  };
}

export function serializeModuleRuntimeBrief(
  input: Omit<ModuleRuntimeInput, "briefText">
) {
  return [
    input.reportSource.briefText,
    input.page.title,
    input.page.note,
    input.page.instruction,
    buildRuntimeKindSummary(input),
    ...summarizeModuleRuntimePlanner(input),
    ...summarizeModuleRuntimeRouting(input),
    ...summarizeModuleRuntimeSkillHints(input),
    ...summarizeModuleRuntimeSkills(input),
    ...summarizeModuleRuntimeOverrides(input),
    input.block.title,
    input.block.detail,
    input.block.intent,
    input.deck.previousPageSummary,
    input.deck.nextPageBridge,
    ...summarizeModuleRuntimePlanItems(input.planItems),
  ]
    .filter(Boolean)
    .join("\n");
}
