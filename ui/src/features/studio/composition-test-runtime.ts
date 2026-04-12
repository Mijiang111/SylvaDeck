import { canDefineOutputContract } from "./authoring/output-contract";
import type { ThinkingFlowStepExecutor } from "./authoring/flow-runtime";
import { BLOCK_KIND_PRESETS } from "./config";
import {
  createModuleInstanceComposition,
  resolveModuleInstanceComposition,
} from "./module-composition";
import {
  executeModuleRegistryEntryDraft,
  type ExecutedModuleDraft,
} from "./module-execution";
import {
  buildModuleRuntimeInput,
  buildReportSourceInput,
  type ModuleRuntimeInput,
} from "./module-runtime-input";
import {
  getAvailableModuleRegistryEntryById,
  getAvailableSkillDefinitionById,
} from "./registry";
import type {
  CompositionEvaluation,
  CompositionTestCase,
  CompositionTestResult,
  CompositionTestRun,
  LayoutBlock,
  ModuleInstanceComposition,
  ModuleRegistryEntry,
  SerializableBlockDraft,
  SkillDefinitionId,
} from "./types";

const TEST_PAGE_ID = "composition-test-page";

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function buildCompositionTestBlock(
  entry: ModuleRegistryEntry,
  testCase: CompositionTestCase
): LayoutBlock {
  const preset = BLOCK_KIND_PRESETS[entry.kind];
  const blockOverride = testCase.runtimeInputOverride?.block;

  return {
    id: `composition-test-${testCase.id}`,
    moduleId: entry.id,
    title: blockOverride?.title?.trim() || testCase.label.trim() || entry.label,
    detail:
      blockOverride?.detail?.trim() ||
      entry.description.trim() ||
      preset.detail,
    intent:
      blockOverride?.intent?.trim() ||
      testCase.runtimeInputOverride?.page?.intent?.trim() ||
      entry.promptHint.trim(),
    kind: entry.kind,
    tone: preset.tone,
    x: 1,
    y: 1,
    w: preset.defaultW,
    h: preset.defaultH,
    minW: preset.minW,
    minH: preset.minH,
    visualScale: preset.defaultScale,
  };
}

function resolveCompositionTestModule(
  testCase: CompositionTestCase,
  entry?: ModuleRegistryEntry
) {
  const resolvedEntry =
    entry ?? getAvailableModuleRegistryEntryById(testCase.moduleId);
  if (!resolvedEntry) {
    throw new Error(`Unknown module test target: ${testCase.moduleId}`);
  }
  return resolvedEntry;
}

function toSerializableDraft(
  blockId: string,
  draft: ExecutedModuleDraft["draft"]
): SerializableBlockDraft {
  return {
    ...draft,
    blockId,
  };
}

function getDraftText(draft: SerializableBlockDraft) {
  return [
    draft.summary,
    ...draft.metrics.map((item) => `${item.value} ${item.label}`),
    ...draft.cards.map((item) => `${item.title} ${item.body}`),
    ...draft.steps.map((item) => `${item.title} ${item.body}`),
  ]
    .filter(Boolean)
    .join("\n");
}

function evaluateMatches(
  expected: string[],
  actualText: string
): {
  result: CompositionTestResult;
  matched: string[];
  missing: string[];
} {
  if (expected.length === 0) {
    return {
      result: "pass",
      matched: [],
      missing: [],
    };
  }

  const normalizedActual = normalizeText(actualText);
  const matched = expected.filter((item) =>
    normalizedActual.includes(normalizeText(item))
  );
  const missing = expected.filter((item) => !matched.includes(item));

  return {
    result:
      matched.length === expected.length
        ? "pass"
        : matched.length > 0
        ? "warn"
        : "fail",
    matched,
    missing,
  };
}

function rankResult(result: CompositionTestResult) {
  if (result === "fail") {
    return 2;
  }
  if (result === "warn") {
    return 1;
  }
  return 0;
}

function mergeResults(
  ...results: CompositionTestResult[]
): CompositionTestResult {
  return results.reduce((current, result) =>
    rankResult(result) > rankResult(current) ? result : current
  , "pass");
}

function evaluateFieldCoverage(
  run: ExecutedModuleDraft,
  entry: ModuleRegistryEntry
): {
  result: CompositionTestResult;
  notes: string[];
} {
  const requiredOutputFields = entry.fields.filter(
    (field) => canDefineOutputContract(field) && field.required
  );
  const producedFieldIds = new Set(run.artifact.outputs.map((output) => output.fieldId));
  const missingRequiredFields = requiredOutputFields.filter(
    (field) => !producedFieldIds.has(field.id)
  );

  if (requiredOutputFields.length === 0) {
    return {
      result: run.artifact.outputs.length > 0 ? "pass" : "warn",
      notes:
        run.artifact.outputs.length > 0
          ? [`Produced ${run.artifact.outputs.length} output fields.`]
          : ["No required output fields are defined yet."],
    };
  }

  return {
    result:
      missingRequiredFields.length === 0
        ? "pass"
        : missingRequiredFields.length < requiredOutputFields.length
        ? "warn"
        : "fail",
    notes:
      missingRequiredFields.length === 0
        ? [`Covered all ${requiredOutputFields.length} required output fields.`]
        : [
            `Missing required outputs for ${missingRequiredFields
              .map((field) => field.label)
              .join(", ")}.`,
          ],
  };
}

function evaluateFrameworkCorrectness(
  testCase: CompositionTestCase,
  entry: ModuleRegistryEntry,
  run: ExecutedModuleDraft
): {
  result: CompositionTestResult;
  notes: string[];
} {
  const requiredSkillIds = (entry.defaultSkillRequirements ?? [])
    .filter((requirement) => requirement.status === "required")
    .map((requirement) => requirement.skillId);
  const missingRequiredSkillIds = requiredSkillIds.filter(
    (skillId) => !testCase.skillIds.includes(skillId)
  );
  const warningMatch = evaluateMatches(
    testCase.expectedWarnings,
    run.artifact.warnings.join("\n")
  );

  const skillResult =
    missingRequiredSkillIds.length === 0 ? "pass" : "fail";
  const warningResult =
    testCase.expectedWarnings.length === 0
      ? run.artifact.warnings.length === 0
        ? "pass"
        : "warn"
      : warningMatch.result;

  const notes: string[] = [];
  if (missingRequiredSkillIds.length > 0) {
    notes.push(
      `Missing required skills: ${missingRequiredSkillIds.join(", ")}.`
    );
  }
  if (warningMatch.matched.length > 0) {
    notes.push(`Matched expected warnings: ${warningMatch.matched.join(", ")}.`);
  }
  if (warningMatch.missing.length > 0) {
    notes.push(`Missing expected warnings: ${warningMatch.missing.join(", ")}.`);
  }
  if (testCase.expectedWarnings.length === 0 && run.artifact.warnings.length > 0) {
    notes.push(`Runtime warnings: ${run.artifact.warnings.join(" | ")}.`);
  }

  return {
    result: mergeResults(skillResult, warningResult),
    notes,
  };
}

function evaluateSlideQuality(run: ExecutedModuleDraft) {
  const draft = run.draft;
  const contentCount =
    draft.metrics.length + draft.cards.length + draft.steps.length;

  if (!draft.summary.trim() || contentCount === 0) {
    return {
      result: "fail" as const,
      notes: ["Generated draft is missing either summary or content items."],
    };
  }

  if (contentCount < 2) {
    return {
      result: "warn" as const,
      notes: ["Generated draft is structurally valid but still sparse."],
    };
  }

  return {
    result: "pass" as const,
    notes: [`Generated ${contentCount} content items with a summary.`],
  };
}

function buildEvaluationNotes(args: {
  testCase: CompositionTestCase;
  matchedBehaviors: string[];
  missingBehaviors: string[];
  resolvedSkillIds: SkillDefinitionId[];
  unresolvedSkillIds: SkillDefinitionId[];
}) {
  const notes: string[] = [];

  if (args.resolvedSkillIds.length > 0) {
    notes.push(`Resolved skills: ${args.resolvedSkillIds.join(", ")}.`);
  }
  if (args.unresolvedSkillIds.length > 0) {
    notes.push(`Unknown skills: ${args.unresolvedSkillIds.join(", ")}.`);
  }
  if (args.matchedBehaviors.length > 0) {
    notes.push(
      `Matched expected behaviors: ${args.matchedBehaviors.join(", ")}.`
    );
  }
  if (args.missingBehaviors.length > 0) {
    notes.push(
      `Missing expected behaviors: ${args.missingBehaviors.join(", ")}.`
    );
  }
  if (args.testCase.runtimeInputOverride?.planItems?.length) {
    notes.push(
      `Applied ${args.testCase.runtimeInputOverride.planItems.length} runtime plan overrides.`
    );
  }

  return notes;
}

export function buildModuleInstanceCompositionFromTestCase(
  testCase: CompositionTestCase
): ModuleInstanceComposition {
  return createModuleInstanceComposition({
    pageId: TEST_PAGE_ID,
    blockId: `composition-test-${testCase.id}`,
    moduleId: testCase.moduleId,
    presetId: null,
    enabledSkillIds: [...testCase.skillIds],
    disabledDefaultSkillIds: [],
    pageInstruction: testCase.runtimeInputOverride?.page?.instruction,
    blockIntent: testCase.runtimeInputOverride?.block?.intent,
  });
}

export function buildRuntimeInputFromCompositionTestCase(args: {
  testCase: CompositionTestCase;
  entry?: ModuleRegistryEntry;
}): {
  entry: ModuleRegistryEntry;
  block: LayoutBlock;
  runtimeInput: ModuleRuntimeInput;
} {
  const entry = resolveCompositionTestModule(args.testCase, args.entry);
  const block = buildCompositionTestBlock(entry, args.testCase);
  const runtimeOverride = args.testCase.runtimeInputOverride;
  const composition = buildModuleInstanceCompositionFromTestCase(args.testCase);
  const resolvedComposition = resolveModuleInstanceComposition({
    entry,
    composition,
  });

  return {
    entry,
    block,
    runtimeInput: buildModuleRuntimeInput({
      block,
      entry,
      resolvedComposition,
      reportSource: buildReportSourceInput({
        sourceText: runtimeOverride?.sourceText ?? args.testCase.brief,
      }),
      page: {
        id: TEST_PAGE_ID,
        chapter: "Module test",
        title:
          runtimeOverride?.page?.title?.trim() ||
          `${entry.label} test case`,
        note:
          runtimeOverride?.page?.note?.trim() ||
          entry.semanticRole.trim() ||
          entry.description.trim(),
        instruction: runtimeOverride?.page?.instruction ?? "",
        role:
          runtimeOverride?.page?.role?.trim() ||
          entry.semanticRole.trim(),
        intent:
          runtimeOverride?.page?.intent?.trim() ||
          entry.promptHint.trim(),
        story:
          runtimeOverride?.page?.story?.trim() ||
          entry.description.trim() ||
          entry.semanticRole.trim(),
      },
      deck: {
        previousPageSummary:
          runtimeOverride?.deck?.previousPageSummary ?? "",
        nextPageBridge: runtimeOverride?.deck?.nextPageBridge ?? "",
      },
      planItems: runtimeOverride?.planItems ?? [],
    }),
  };
}

export function evaluateCompositionTestRun(args: {
  testCase: CompositionTestCase;
  entry: ModuleRegistryEntry;
  run: ExecutedModuleDraft;
}): CompositionEvaluation {
  const fieldCoverage = evaluateFieldCoverage(args.run, args.entry);
  const behaviorMatch = evaluateMatches(
    args.testCase.expectedBehaviors,
    getDraftText(toSerializableDraft(args.run.artifact.moduleId, args.run.draft))
  );
  const frameworkCorrectness = evaluateFrameworkCorrectness(
    args.testCase,
    args.entry,
    args.run
  );
  const slideQuality = evaluateSlideQuality(args.run);
  const resolvedSkillIds = args.testCase.skillIds.filter((skillId) =>
    Boolean(getAvailableSkillDefinitionById(skillId))
  );
  const unresolvedSkillIds = args.testCase.skillIds.filter(
    (skillId) => !getAvailableSkillDefinitionById(skillId)
  );

  return {
    fieldCoverage: fieldCoverage.result,
    semanticCorrectness: behaviorMatch.result,
    frameworkCorrectness: frameworkCorrectness.result,
    slideQuality: slideQuality.result,
    notes: [
      ...fieldCoverage.notes,
      ...frameworkCorrectness.notes,
      ...slideQuality.notes,
      ...buildEvaluationNotes({
        testCase: args.testCase,
        matchedBehaviors: behaviorMatch.matched,
        missingBehaviors: behaviorMatch.missing,
        resolvedSkillIds,
        unresolvedSkillIds,
      }),
    ],
  };
}

export function runCompositionTestCase(args: {
  testCase: CompositionTestCase;
  entry?: ModuleRegistryEntry;
  stepExecutor?: ThinkingFlowStepExecutor;
}): CompositionTestRun | null {
  const startedAt = new Date().toISOString();
  const compiled = buildRuntimeInputFromCompositionTestCase({
    testCase: args.testCase,
    entry: args.entry,
  });
  const executedDraft = executeModuleRegistryEntryDraft({
    block: compiled.block,
    entry: compiled.entry,
    runtimeInput: compiled.runtimeInput,
    stepExecutor: args.stepExecutor,
  });

  if (!executedDraft) {
    return null;
  }

  const composedOutput = toSerializableDraft(compiled.block.id, executedDraft.draft);
  const evaluation = evaluateCompositionTestRun({
    testCase: args.testCase,
    entry: compiled.entry,
    run: executedDraft,
  });
  const result = mergeResults(
    evaluation.fieldCoverage,
    evaluation.semanticCorrectness,
    evaluation.frameworkCorrectness,
    evaluation.slideQuality
  );

  return {
    id: `composition-run-${args.testCase.id}-${Date.now()}`,
    caseId: args.testCase.id,
    moduleId: compiled.entry.id,
    skillIds: [...args.testCase.skillIds],
    provider: "local",
    model: null,
    startedAt,
    finishedAt: new Date().toISOString(),
    result,
    baselineOutput: null,
    composedOutput,
    evaluation,
  };
}
