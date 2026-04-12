import type {
  ModuleTemplateField,
  ModuleThinkingFlowBranch,
  ModuleThinkingFlowEdge,
  ModuleThinkingFlowNode,
  ModuleThinkingFlowNodeKind,
} from "@/features/studio/types";

import { getCanvasObjectKind } from "../module-fields";
import {
  getFieldOutputFormat,
  getFieldOutputGoal,
  getFieldOutputLength,
  OUTPUT_CONTRACT_FORMAT_LABEL,
  OUTPUT_CONTRACT_LENGTH_LABEL,
} from "./output-contract";
import {
  buildThinkingFlowTracePreview,
  shortenThinkingFlowRunText,
  splitThinkingFlowRunSentences,
} from "./tool-adapters";
import { deterministicThinkingFlowStepExecutor } from "./step-executors";
import type {
  ThinkingFlowStepExecution,
  ThinkingFlowStepExecutor,
} from "./step-executors";

export { deterministicThinkingFlowStepExecutor } from "./step-executors";
export type {
  ThinkingFlowStepExecution,
  ThinkingFlowStepExecutionArgs,
  ThinkingFlowStepExecutor,
} from "./step-executors";

export type ThinkingFlowRunFieldOutput = {
  title: string;
  body: string;
  bullets: string[];
  sourceNodeId: string | null;
  usedFallback: boolean;
};

export type ThinkingFlowRunTraceStep = {
  nodeId: string;
  kind: ModuleThinkingFlowNodeKind;
  label: string;
  detail: string;
  traceLabel: string;
  inputSummary: string;
  outputSummary: string;
  traceItems: string[];
  status: ThinkingFlowStepExecution["status"] | "skipped";
  branchDecision?: ModuleThinkingFlowBranch;
};

export type ThinkingFlowRunResult = {
  brief: string;
  ranAt: string;
  executedNodeIds: string[];
  nodeTexts: Record<string, string>;
  fieldOutputs: Record<string, ThinkingFlowRunFieldOutput>;
  steps: ThinkingFlowRunTraceStep[];
  warnings: string[];
};

function titleCaseThinkingFlowText(text: string, fallback: string) {
  const clean = text
    .replace(/^[\-\d.\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) {
    return fallback;
  }

  const slice = clean.split(/\s+/).slice(0, 6).join(" ");
  return slice.charAt(0).toUpperCase() + slice.slice(1);
}

function buildThinkingFlowRunBullets(
  texts: string[],
  fallback: string,
  maxItems = 3
) {
  const bullets = texts
    .flatMap((text) => splitThinkingFlowRunSentences(text))
    .map((sentence) => shortenThinkingFlowRunText(sentence, 120))
    .filter(Boolean)
    .slice(0, maxItems);
  return bullets.length > 0 ? bullets : [fallback];
}

export function getThinkingFlowNodeLabel(kind: ModuleThinkingFlowNodeKind) {
  if (kind === "brief") return "Read Brief";
  if (kind === "think") return "Think";
  if (kind === "if") return "If / Branch";
  if (kind === "tool") return "Tool Call";
  if (kind === "calc") return "Calc";
  if (kind === "output") return "Output";
  return "Start";
}

function buildThinkingFlowFieldRunOutput(args: {
  field: ModuleTemplateField;
  node: ModuleThinkingFlowNode;
  sourceText: string;
  fallbackText: string;
}) {
  const objectKind = getCanvasObjectKind(args.field);
  const outputGoal = getFieldOutputGoal(
    args.field,
    args.node.detail.trim() || `Fill ${args.field.label}.`
  );
  const outputFormat = getFieldOutputFormat(args.field);
  const outputLength = getFieldOutputLength(args.field);
  const mustInclude = args.field.outputContract?.mustInclude?.trim();
  const bodyMaxLength =
    outputLength === "tight" ? 140 : outputLength === "full" ? 320 : 220;
  const bulletCount =
    outputFormat === "point"
      ? outputLength === "full"
        ? 2
        : 0
      : outputLength === "tight"
      ? 2
      : outputLength === "full"
      ? 4
      : 3;
  const exampleTitle =
    splitThinkingFlowRunSentences(args.field.example ?? "")[0] ?? "";
  const sourceSentences = splitThinkingFlowRunSentences(args.sourceText);
  const fallbackSentences = splitThinkingFlowRunSentences(args.fallbackText);
  const narrativeSeed =
    sourceSentences[0] ??
    fallbackSentences[0] ??
    outputGoal ??
    args.field.label;
  const requiredTail = mustInclude ? ` Must show ${mustInclude}.` : "";
  const narrativeSentences =
    sourceSentences.length > 0 ? sourceSentences : fallbackSentences;

  if (objectKind === "chart") {
    return {
      title:
        exampleTitle ||
        titleCaseThinkingFlowText(
          outputGoal,
          args.field.label || "Chart output"
        ),
      body: shortenThinkingFlowRunText(
        `${outputGoal}${requiredTail} ${
          sourceSentences[0] ||
          "Use the connected data block to support the point."
        }`,
        bodyMaxLength
      ),
      bullets: buildThinkingFlowRunBullets(
        mustInclude ? [mustInclude, ...sourceSentences] : sourceSentences,
        "Connect a data block to complete the chart story.",
        bulletCount
      ),
    };
  }

  if (outputFormat === "bullets") {
    return {
      title:
        exampleTitle ||
        titleCaseThinkingFlowText(
          args.field.label,
          args.field.label || "Output"
        ),
      body: shortenThinkingFlowRunText(
        `${outputGoal}${requiredTail}`,
        bodyMaxLength
      ),
      bullets: buildThinkingFlowRunBullets(
        mustInclude ? [mustInclude, ...narrativeSentences] : narrativeSentences,
        outputGoal,
        bulletCount
      ),
    };
  }

  if (outputFormat === "comparison") {
    return {
      title:
        exampleTitle ||
        titleCaseThinkingFlowText(
          `${args.field.label} comparison`,
          args.field.label || "Comparison"
        ),
      body: shortenThinkingFlowRunText(
        `${outputGoal}${requiredTail} Contrast the strongest options using ${
          sourceSentences[0] ||
          fallbackSentences[0] ||
          "the best supporting evidence."
        }`,
        bodyMaxLength
      ),
      bullets: buildThinkingFlowRunBullets(
        mustInclude ? [mustInclude, ...narrativeSentences] : narrativeSentences,
        outputGoal,
        bulletCount
      ),
    };
  }

  return {
    title:
      exampleTitle ||
      titleCaseThinkingFlowText(
        `${args.field.label} ${narrativeSeed}`,
        args.field.label || "Output"
      ),
    body: shortenThinkingFlowRunText(
      `${outputGoal}${requiredTail} ${
        sourceSentences[0] ||
        fallbackSentences[0] ||
        "No preview generated yet."
      }`,
      bodyMaxLength
    ),
    bullets:
      bulletCount > 0
        ? buildThinkingFlowRunBullets(
            narrativeSentences,
            outputGoal,
            bulletCount
          )
        : [],
  };
}

export function executeThinkingFlowRun(args: {
  brief: string;
  promptHint: string;
  semanticRole: string;
  nodes: ModuleThinkingFlowNode[];
  edges: ModuleThinkingFlowEdge[];
  fieldsById: Map<string, ModuleTemplateField>;
  stepExecutor?: ThinkingFlowStepExecutor;
}) {
  const cleanBrief = args.brief.trim();
  const stepExecutor =
    args.stepExecutor ?? deterministicThinkingFlowStepExecutor;
  const warnings: string[] = [];
  const nodeById = new Map(args.nodes.map((node) => [node.id, node]));
  const incomingById = new Map<string, ModuleThinkingFlowEdge[]>();
  const outgoingById = new Map<string, ModuleThinkingFlowEdge[]>();
  const fieldOutputs: Record<string, ThinkingFlowRunFieldOutput> = {};

  args.edges.forEach((edge) => {
    const currentIncoming = incomingById.get(edge.targetNodeId) ?? [];
    currentIncoming.push(edge);
    incomingById.set(edge.targetNodeId, currentIncoming);

    const currentOutgoing = outgoingById.get(edge.sourceNodeId) ?? [];
    currentOutgoing.push(edge);
    outgoingById.set(edge.sourceNodeId, currentOutgoing);
  });

  const cache = new Map<string, string>();
  const activeByNodeId = new Map<string, boolean>();
  const traceById = new Map<string, ThinkingFlowRunTraceStep>();
  const branchByNodeId = new Map<string, ModuleThinkingFlowBranch>();
  const executionOrder: string[] = [];
  const resolving = new Set<string>();

  function resolveNodeText(nodeId: string): string {
    if (cache.has(nodeId)) {
      return cache.get(nodeId) ?? "";
    }
    const node = nodeById.get(nodeId);
    if (!node) {
      return "";
    }
    if (resolving.has(nodeId)) {
      return node.detail.trim() || node.label;
    }

    resolving.add(nodeId);
    const allIncomingEdges = incomingById.get(nodeId) ?? [];
    const upstreamResolutions = allIncomingEdges.map((edge) => {
      const source = nodeById.get(edge.sourceNodeId);
      const sourceText = resolveNodeText(edge.sourceNodeId);
      const sourceActive = activeByNodeId.get(edge.sourceNodeId) ?? false;
      if (!source || !sourceActive) {
        return {
          edge,
          source,
          active: false,
          text: sourceText,
        };
      }
      if (source.kind === "if") {
        const activeBranch = branchByNodeId.get(source.id) ?? "yes";
        return {
          edge,
          source,
          active: (edge.branch ?? "yes") === activeBranch,
          text: sourceText,
        };
      }
      return {
        edge,
        source,
        active: true,
        text: sourceText,
      };
    });
    const activeUpstreamResolutions = upstreamResolutions.filter(
      (resolution) => resolution.active
    );
    const upstreamIds = activeUpstreamResolutions.map(
      (resolution) => resolution.edge.sourceNodeId
    );
    const upstreamTexts = activeUpstreamResolutions
      .map((resolution) => resolution.text)
      .filter(Boolean);
    let text = "";
    const hasIncomingEdges = allIncomingEdges.length > 0;

    if (
      node.kind !== "start" &&
      hasIncomingEdges &&
      activeUpstreamResolutions.length === 0
    ) {
      activeByNodeId.set(nodeId, false);

      if (node.kind === "output" && node.fieldId) {
        const field = args.fieldsById.get(node.fieldId);
        if (field) {
          fieldOutputs[node.fieldId] = {
            title: field.label || "Inactive output",
            body: "No active branch reached this output in the current run.",
            bullets: [],
            sourceNodeId: null,
            usedFallback: true,
          };
        }
      }

      traceById.set(node.id, {
        nodeId: node.id,
        kind: node.kind,
        label: node.label.trim() || getThinkingFlowNodeLabel(node.kind),
        detail: node.detail,
        traceLabel: node.kind === "output" ? "Deliver" : "Skipped",
        inputSummary: "No active upstream branch reached this node.",
        outputSummary:
          node.kind === "output"
            ? "Skipped because the active branch did not reach this output."
            : "Skipped because the active branch did not reach this step.",
        traceItems: ["This node stayed on an inactive branch."],
        status: "skipped",
      });
      resolving.delete(nodeId);
      cache.set(nodeId, "");
      if (!executionOrder.includes(nodeId)) {
        executionOrder.push(nodeId);
      }
      return "";
    }

    if (node.kind === "output") {
      const field = node.fieldId ? args.fieldsById.get(node.fieldId) : null;
      const fallbackText =
        cache.get("flow-start") ||
        cleanBrief ||
        args.promptHint ||
        args.semanticRole ||
        node.detail ||
        node.label;
      if (!cache.has("flow-start") && node.id !== "flow-start") {
        resolveNodeText("flow-start");
      }
      const resolvedFallbackText =
        cache.get("flow-start") || fallbackText || "Start from the user brief.";

      if (field && node.fieldId) {
        if (!hasIncomingEdges) {
          warnings.push(
            `${field.label} is not connected yet. Preview used the start brief directly.`
          );
        }
        const output = buildThinkingFlowFieldRunOutput({
          field,
          node,
          sourceText: upstreamTexts.join(" "),
          fallbackText: resolvedFallbackText,
        });
        fieldOutputs[node.fieldId] = {
          ...output,
          sourceNodeId: upstreamIds[0] ?? null,
          usedFallback: upstreamIds.length === 0,
        };
        text = [output.title, output.body, ...output.bullets].join(" ").trim();
        traceById.set(node.id, {
          nodeId: node.id,
          kind: node.kind,
          label: node.label.trim() || getThinkingFlowNodeLabel(node.kind),
          detail: node.detail,
          traceLabel: "Deliver",
          inputSummary: buildThinkingFlowTracePreview(
            upstreamTexts.join(" ") || resolvedFallbackText,
            "No upstream input yet."
          ),
          outputSummary: buildThinkingFlowTracePreview(
            `${output.title}. ${output.body}`,
            "No output generated."
          ),
          traceItems: [
            `Format: ${
              OUTPUT_CONTRACT_FORMAT_LABEL[getFieldOutputFormat(field)]
            }`,
            `Density: ${
              OUTPUT_CONTRACT_LENGTH_LABEL[getFieldOutputLength(field)]
            }`,
            ...(field.outputContract?.mustInclude?.trim()
              ? [`Must show: ${field.outputContract.mustInclude.trim()}`]
              : []),
          ]
            .concat(output.bullets.slice(0, 2))
            .slice(0, 4),
          status: upstreamIds.length === 0 ? "warning" : "ready",
        });
      } else {
        text = shortenThinkingFlowRunText(
          upstreamTexts.join(" ") || resolvedFallbackText,
          220
        );
        traceById.set(node.id, {
          nodeId: node.id,
          kind: node.kind,
          label: node.label.trim() || getThinkingFlowNodeLabel(node.kind),
          detail: node.detail,
          traceLabel: "Deliver",
          inputSummary: buildThinkingFlowTracePreview(
            upstreamTexts.join(" ") || resolvedFallbackText,
            "No upstream input yet."
          ),
          outputSummary: buildThinkingFlowTracePreview(
            text,
            "No output generated."
          ),
          traceItems: ["Output field is missing from the layout draft."],
          status: "warning",
        });
      }
      activeByNodeId.set(nodeId, true);
    } else {
      const step = stepExecutor({
        node,
        upstreamTexts,
        brief: cleanBrief,
        promptHint: args.promptHint,
        semanticRole: args.semanticRole,
      });
      text = step.text;
      if (step.warning) {
        warnings.push(step.warning);
      }
      if (node.kind === "if" && step.branchDecision) {
        branchByNodeId.set(node.id, step.branchDecision);
        const branchEdges = outgoingById.get(node.id) ?? [];
        if (branchEdges.length < 2) {
          const missingBranch = branchEdges.some(
            (edge) => (edge.branch ?? "yes") === "yes"
          )
            ? "No"
            : "Yes";
          warnings.push(
            `${node.label} is missing a ${missingBranch} branch connection.`
          );
        }
      }
      if (node.kind !== "start" && !hasIncomingEdges) {
        warnings.push(
          `${node.label} is not connected yet. Preview used the brief directly.`
        );
      }
      traceById.set(node.id, {
        nodeId: node.id,
        kind: node.kind,
        label: node.label.trim() || getThinkingFlowNodeLabel(node.kind),
        detail: node.detail,
        traceLabel: step.traceLabel,
        inputSummary: step.inputSummary,
        outputSummary: step.outputSummary,
        traceItems: step.traceItems,
        status: step.status,
        branchDecision: step.branchDecision,
      });
      activeByNodeId.set(nodeId, true);
    }

    resolving.delete(nodeId);
    cache.set(nodeId, text);
    if (!executionOrder.includes(nodeId)) {
      executionOrder.push(nodeId);
    }
    return text;
  }

  const nodeTexts = Object.fromEntries(
    args.nodes.map((node) => [node.id, resolveNodeText(node.id)])
  );
  const steps = executionOrder
    .map((nodeId) => traceById.get(nodeId) ?? null)
    .filter((step): step is ThinkingFlowRunTraceStep => Boolean(step));

  return {
    brief: cleanBrief,
    ranAt: new Date().toISOString(),
    executedNodeIds: executionOrder,
    nodeTexts,
    fieldOutputs,
    steps,
    warnings,
  } satisfies ThinkingFlowRunResult;
}
