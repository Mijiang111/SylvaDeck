import type { LayoutBlock, ModuleRegistryEntry } from "./types";

import { executeThinkingFlowRun } from "./authoring/flow-runtime";
import type {
  ThinkingFlowRunResult,
  ThinkingFlowStepExecutor,
} from "./authoring/flow-runtime";
import type { ModuleRuntimeInput } from "./module-runtime-input";
import { canDefineOutputContract } from "./authoring/output-contract";
import { getCanvasObjectKind } from "./module-fields";
import type { ModuleExecutionArtifact } from "./module-output";
import { adaptModuleExecutionArtifactToBlockDraft } from "./module-output";

export type ExecutedModuleRun = {
  run: ThinkingFlowRunResult;
  artifact: ModuleExecutionArtifact;
};

export type ExecutedModuleDraft = ExecutedModuleRun & {
  draft: ReturnType<typeof adaptModuleExecutionArtifactToBlockDraft>;
};

function hasExecutableThinkingFlow(entry: ModuleRegistryEntry) {
  const nodes = entry.thinkingFlow?.nodes ?? [];
  const edges = entry.thinkingFlow?.edges ?? [];
  const outputNodeCount = nodes.filter(
    (node) => node.kind === "output" && node.fieldId
  ).length;

  return nodes.length > 0 && edges.length > 0 && outputNodeCount > 0;
}

export function executeModuleRegistryEntryRun(args: {
  block: LayoutBlock;
  entry: ModuleRegistryEntry;
  brief?: string;
  runtimeInput?: ModuleRuntimeInput;
  stepExecutor?: ThinkingFlowStepExecutor;
}): ExecutedModuleRun | null {
  if (!hasExecutableThinkingFlow(args.entry)) {
    return null;
  }

  const nodes = args.entry.thinkingFlow?.nodes ?? [];
  const edges = args.entry.thinkingFlow?.edges ?? [];
  const fieldsById = new Map(
    args.entry.fields.map((field) => [field.id, field] as const)
  );

  const run = executeThinkingFlowRun({
    brief: args.runtimeInput?.briefText ?? args.brief ?? "",
    promptHint: args.entry.promptHint,
    semanticRole: args.entry.semanticRole,
    nodes,
    edges,
    fieldsById,
    stepExecutor: args.stepExecutor,
  });

  const outputs = args.entry.fields
    .filter(canDefineOutputContract)
    .map((field) => {
      const output = run.fieldOutputs[field.id];
      if (!output) {
        return null;
      }
      return {
        fieldId: field.id,
        label: field.label,
        objectKind: getCanvasObjectKind(field),
        title: output.title,
        body: output.body,
        bullets: output.bullets,
        sourceNodeId: output.sourceNodeId,
        usedFallback: output.usedFallback,
      };
    })
    .filter((output): output is NonNullable<typeof output> => Boolean(output));

  if (outputs.length === 0) {
    return null;
  }

  return {
    run,
    artifact: {
      moduleId: args.entry.id,
      usedFlow: true,
      summary:
        outputs.find((output) => !output.usedFallback)?.body ||
        outputs[0]?.body ||
        args.block.detail ||
        args.block.title ||
        "Generated module output",
      outputs,
      warnings: run.warnings,
    },
  };
}

export function executeModuleRegistryEntryArtifact(args: {
  block: LayoutBlock;
  entry: ModuleRegistryEntry;
  brief?: string;
  runtimeInput?: ModuleRuntimeInput;
  stepExecutor?: ThinkingFlowStepExecutor;
}): ModuleExecutionArtifact | null {
  return executeModuleRegistryEntryRun(args)?.artifact ?? null;
}

export function executeModuleRegistryEntryDraft(args: {
  block: LayoutBlock;
  entry: ModuleRegistryEntry;
  brief?: string;
  runtimeInput?: ModuleRuntimeInput;
  stepExecutor?: ThinkingFlowStepExecutor;
}): ExecutedModuleDraft | null {
  const executedRun = executeModuleRegistryEntryRun(args);
  if (!executedRun) {
    return null;
  }

  return {
    ...executedRun,
    draft: adaptModuleExecutionArtifactToBlockDraft({
      block: args.block,
      artifact: executedRun.artifact,
    }),
  };
}
