import { normalizeStudioText } from "./brief.js";
import { buildStudioBriefSynthesis } from "./brief-synthesis.js";
import { resolveStudioComplexityProfile } from "./complexity.js";
import type {
  EvidenceGraph,
  ResolvedThinkingContext,
  SegmentedThinkingInputs,
  StudioBriefSynthesis,
  StudioComplexityProfile,
  StudioEvalOverrides,
  StudioWorkingMemory,
} from "./contracts.js";
import { getThinkingModePlugin, resolveDeckThinkingMode, segmentThinkingInputs } from "./thinking-mode.js";
import { buildStudioWorkingMemory } from "./working-memory.js";

function buildGenericEvalDeliverable(brief: string, inputs: SegmentedThinkingInputs) {
  const taskText =
    normalizeStudioText([inputs.taskIntentText, inputs.globalHintsText].filter(Boolean).join(" ")) ||
    normalizeStudioText(brief);
  if (/\bmemo\b/i.test(taskText)) {
    return "decision memo deck";
  }
  if (/\breview\b/i.test(taskText)) {
    return "review deck";
  }
  return "PPT";
}

export function applyStudioEvalOverridesToThinkingContext(args: {
  thinkingContext: ResolvedThinkingContext;
  evalOverrides?: StudioEvalOverrides | null;
}) {
  const overrideMode = args.evalOverrides?.forceThinkingMode;
  if (!overrideMode) {
    return args.thinkingContext;
  }

  return {
    ...args.thinkingContext,
    mode: overrideMode,
    plugin: getThinkingModePlugin(overrideMode),
    reason:
      overrideMode === args.thinkingContext.mode
        ? `Eval override kept the resolved thinking mode at ${overrideMode}.`
        : `Eval override forced thinking mode to ${overrideMode}; base mode was ${args.thinkingContext.mode}.`,
    lockedByTaskIntent: false,
  } satisfies ResolvedThinkingContext;
}

export function applyWorkingMemoryToThinkingContext(args: {
  thinkingContext: ResolvedThinkingContext;
  workingMemory: StudioWorkingMemory;
}) {
  const hint = args.workingMemory.thinkingModeHint;
  if (!hint || hint === args.thinkingContext.mode) {
    return args.thinkingContext;
  }

  if (args.thinkingContext.lockedByTaskIntent && args.thinkingContext.mode !== hint) {
    return args.thinkingContext;
  }

  return {
    ...args.thinkingContext,
    mode: hint,
    plugin: getThinkingModePlugin(hint),
    reason: `Working memory normalized the task as ${hint}; base mode was ${args.thinkingContext.mode}. ${args.thinkingContext.reason}`,
    lockedByTaskIntent: args.thinkingContext.lockedByTaskIntent || hint !== "neutral",
  } satisfies ResolvedThinkingContext;
}

export function applyStudioEvalOverridesToComplexityProfile(args: {
  brief: string;
  inputs: SegmentedThinkingInputs;
  complexityProfile: StudioComplexityProfile;
  evalOverrides?: StudioEvalOverrides | null;
}) {
  const overrides = args.evalOverrides;
  if (!overrides) {
    return args.complexityProfile;
  }

  let nextProfile: StudioComplexityProfile = {
    ...args.complexityProfile,
    taskGrammarPacks: [...args.complexityProfile.taskGrammarPacks],
    signalGroups: [...args.complexityProfile.signalGroups],
    signalPhrases: [...args.complexityProfile.signalPhrases],
    taskDrivenSignalGroups: [...args.complexityProfile.taskDrivenSignalGroups],
    sourceSupplementSignalGroups: [...args.complexityProfile.sourceSupplementSignalGroups],
  };

  if (overrides.disableTaskGrammarPacks) {
    nextProfile = {
      ...nextProfile,
      taskGrammarPacks: [],
      specializedArtifact: null,
      deliverable: buildGenericEvalDeliverable(args.brief, args.inputs),
      reason: `${nextProfile.reason} Eval override removed task grammar packs.`,
    };
  }

  if (overrides.forceWorkloadLane) {
    nextProfile = {
      ...nextProfile,
      workloadLane: overrides.forceWorkloadLane,
      rigorLevel: overrides.forceWorkloadLane === "deep" ? "high-spec" : "standard",
      reason:
        overrides.forceWorkloadLane === args.complexityProfile.workloadLane
          ? `Eval override kept workload lane at ${overrides.forceWorkloadLane}.`
          : `Eval override forced workload lane to ${overrides.forceWorkloadLane}; base lane was ${args.complexityProfile.workloadLane}.`,
    };
  }

  return nextProfile;
}

export function applyWorkingMemoryToComplexityProfile(args: {
  complexityProfile: StudioComplexityProfile;
  workingMemory: StudioWorkingMemory;
}) {
  if (args.workingMemory.acceptanceResult.pass) {
    return args.complexityProfile;
  }

  if (args.complexityProfile.workloadLane !== "deep") {
    return args.complexityProfile;
  }

  return {
    ...args.complexityProfile,
    workloadLane: "fast",
    rigorLevel: "standard",
    reason: `${args.complexityProfile.reason} Working memory remained low-confidence, so Studio stayed on the conservative fast lane.`,
    taskGrammarPacks: [],
    specializedArtifact: null,
  } satisfies StudioComplexityProfile;
}

export function buildStudioEvalTraceMeta(evalOverrides?: StudioEvalOverrides | null) {
  if (!evalOverrides) {
    return {};
  }

  return {
    evalForceThinkingMode: evalOverrides.forceThinkingMode ?? null,
    evalForceWorkloadLane: evalOverrides.forceWorkloadLane ?? null,
    evalDisableTaskGrammarPacks: evalOverrides.disableTaskGrammarPacks === true,
    evalDisableLayoutPlanningBlock: evalOverrides.disableLayoutPlanningBlock === true,
  };
}

export function resolveStudioGenerationPreparation(args: {
  brief: string;
  requestedPageCount?: number | null;
  segmentedInputs?: SegmentedThinkingInputs;
  evidenceGraph?: Pick<EvidenceGraph, "claims" | "comparisonSets" | "timelineSets" | "nodes"> | null;
  evalOverrides?: StudioEvalOverrides | null;
}) {
  const segmentedInputs = args.segmentedInputs ?? segmentThinkingInputs(args.brief);
  const workingMemory = buildStudioWorkingMemory({
    brief: args.brief,
    inputs: segmentedInputs,
    requestedPageCount: args.requestedPageCount,
  });
  const thinkingContext = applyStudioEvalOverridesToThinkingContext({
    thinkingContext: applyWorkingMemoryToThinkingContext({
      thinkingContext: resolveDeckThinkingMode(args.brief, args.evidenceGraph, segmentedInputs),
      workingMemory,
    }),
    evalOverrides: args.evalOverrides,
  });
  const complexityProfile = applyStudioEvalOverridesToComplexityProfile({
    brief: args.brief,
    inputs: segmentedInputs,
    complexityProfile: applyWorkingMemoryToComplexityProfile({
      complexityProfile: resolveStudioComplexityProfile({
        brief: args.brief,
        inputs: segmentedInputs,
      }),
      workingMemory,
    }),
    evalOverrides: args.evalOverrides,
  });
  const briefSynthesis: StudioBriefSynthesis = buildStudioBriefSynthesis({
    brief: args.brief,
    thinkingContext,
    requestedPageCount: args.requestedPageCount,
    complexityProfile,
    workingMemory,
  });

  return {
    segmentedInputs,
    workingMemory,
    thinkingContext,
    complexityProfile,
    briefSynthesis,
  };
}
