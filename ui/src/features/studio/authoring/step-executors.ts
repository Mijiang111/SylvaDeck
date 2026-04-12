import type {
  ModuleThinkingFlowBranch,
  ModuleThinkingFlowNode,
} from "@/features/studio/types";

import {
  THINKING_FLOW_TOOL_ADAPTERS,
  buildThinkingFlowTracePreview,
  extractThinkingFlowKeywords,
  formatThinkingFlowGap,
  getThinkingFlowToolConfig,
  parseThinkingFlowNumericAnchors,
  shortenThinkingFlowRunText,
  splitThinkingFlowRunSentences,
} from "./tool-adapters";

const THINKING_FLOW_BRANCH_LABEL: Record<ModuleThinkingFlowBranch, string> = {
  yes: "Yes",
  no: "No",
};

export type ThinkingFlowStepExecutionArgs = {
  node: ModuleThinkingFlowNode;
  upstreamTexts: string[];
  brief: string;
  promptHint: string;
  semanticRole: string;
};

export type ThinkingFlowStepExecution = {
  text: string;
  traceLabel: string;
  inputSummary: string;
  outputSummary: string;
  traceItems: string[];
  status: "ready" | "warning";
  warning?: string;
  branchDecision?: ModuleThinkingFlowBranch;
};

export type ThinkingFlowStepExecutor = (
  args: ThinkingFlowStepExecutionArgs
) => ThinkingFlowStepExecution;

function getThinkingFlowBranchLabel(branch: ModuleThinkingFlowBranch) {
  return THINKING_FLOW_BRANCH_LABEL[branch];
}

export const deterministicThinkingFlowStepExecutor: ThinkingFlowStepExecutor = (
  args
) => {
  const upstreamText = args.upstreamTexts.filter(Boolean).join(" ");
  const contextText = [
    args.brief,
    upstreamText,
    args.promptHint,
    args.semanticRole,
  ]
    .filter(Boolean)
    .join(" ");
  const sentences = splitThinkingFlowRunSentences(args.brief || upstreamText);
  const firstSentence = sentences[0] ?? "No brief provided yet.";
  const secondSentence = sentences[1] ?? "";
  const upstream = shortenThinkingFlowRunText(upstreamText, 180);
  const hasRiskBias =
    /risk|issue|decline|constraint|gap|pressure|blocker|exposure/i.test(
      contextText
    );
  const hasGrowthBias =
    /growth|expand|upside|increase|gain|opportunity|momentum/i.test(
      contextText
    );
  const numbers = parseThinkingFlowNumericAnchors(contextText);
  const keywords = extractThinkingFlowKeywords(contextText);
  const focusLabel = keywords.slice(0, 3).join(", ");
  const inputSummary = buildThinkingFlowTracePreview(
    upstreamText || args.brief || args.promptHint || args.semanticRole,
    "No upstream input yet."
  );

  if (args.node.kind === "start") {
    const text = shortenThinkingFlowRunText(
      args.brief.trim() ||
        args.promptHint.trim() ||
        args.semanticRole.trim() ||
        "Start from the user brief.",
      220
    );
    return {
      text,
      traceLabel: "Start brief",
      inputSummary: args.brief.trim()
        ? "User brief provided."
        : "No brief yet. Using module prompt fallback.",
      outputSummary: buildThinkingFlowTracePreview(text, "No brief yet."),
      traceItems: [
        args.brief.trim()
          ? `Brief: ${buildThinkingFlowTracePreview(
              firstSentence,
              firstSentence,
              96
            )}`
          : `Fallback: ${buildThinkingFlowTracePreview(text, text, 96)}`,
      ],
      status: args.brief.trim() ? "ready" : "warning",
      warning: args.brief.trim()
        ? undefined
        : "No brief yet. Preview is using the module prompt as fallback.",
    };
  }
  if (args.node.kind === "brief") {
    const text = shortenThinkingFlowRunText(
      `${args.node.detail || "Read the brief."} Key ask: ${firstSentence}${
        secondSentence ? ` ${secondSentence}` : ""
      }`,
      220
    );
    return {
      text,
      traceLabel: "Brief parse",
      inputSummary,
      outputSummary: buildThinkingFlowTracePreview(
        `Key ask: ${firstSentence}`,
        "No brief interpreted yet."
      ),
      traceItems: [
        `Ask: ${buildThinkingFlowTracePreview(
          firstSentence,
          "No ask yet.",
          96
        )}`,
        secondSentence
          ? `Context: ${buildThinkingFlowTracePreview(
              secondSentence,
              secondSentence,
              96
            )}`
          : focusLabel
          ? `Focus: ${focusLabel}`
          : "Focus: broad module ask",
      ],
      status: "ready",
    };
  }
  if (args.node.kind === "think") {
    const mode = hasRiskBias
      ? "Risk-aware"
      : numbers.length > 0
      ? "Evidence-led"
      : hasGrowthBias
      ? "Growth-led"
      : "Argument-led";
    const text = shortenThinkingFlowRunText(
      `${args.node.detail || "Shape the point of view."} ${mode} synthesis. ${
        upstream || firstSentence
      } ${focusLabel ? `Focus on ${focusLabel}.` : ""}`,
      220
    );
    return {
      text,
      traceLabel: "Synthesis",
      inputSummary,
      outputSummary: buildThinkingFlowTracePreview(
        `${mode} point of view ${focusLabel ? `around ${focusLabel}` : ""}.`,
        "General point of view."
      ),
      traceItems: [
        `Mode: ${mode}`,
        focusLabel ? `Focus: ${focusLabel}` : "Focus: main ask",
        numbers.length > 0
          ? `Anchors: ${numbers
              .slice(0, 2)
              .map((item) => item.raw)
              .join(", ")}`
          : "Anchors: qualitative only",
      ],
      status: upstream ? "ready" : "warning",
      warning: upstream
        ? undefined
        : `${args.node.label} has no upstream step. Preview used the brief directly.`,
    };
  }
  if (args.node.kind === "if") {
    const detailKeywords = extractThinkingFlowKeywords(args.node.detail);
    const matchedKeywords = detailKeywords.filter((keyword) =>
      keywords.includes(keyword)
    );
    const conditionMatched =
      matchedKeywords.length > 0 ||
      (/risk|issue|decline|constraint|gap|pressure|blocker|exposure/i.test(
        args.node.detail
      ) &&
        hasRiskBias) ||
      (/growth|expand|upside|increase|gain|opportunity|momentum/i.test(
        args.node.detail
      ) &&
        hasGrowthBias) ||
      (/(number|quant|threshold|compare|rank|delta|gap|percent|share|value)/i.test(
        args.node.detail
      ) &&
        numbers.length >= 2) ||
      (!args.node.detail.trim() &&
        (hasRiskBias || hasGrowthBias || numbers.length >= 2));
    const branchDecision: ModuleThinkingFlowBranch = conditionMatched
      ? "yes"
      : "no";
    const decision = conditionMatched
      ? "Condition matched"
      : "Condition not met";
    const reason = hasRiskBias
      ? "The brief contains downside or blocker signals."
      : numbers.length >= 2
      ? "There are enough numeric anchors to compare."
      : hasGrowthBias
      ? "The brief leans toward upside and expansion."
      : "No dominant signal, so the default path stays active.";
    const text = shortenThinkingFlowRunText(
      `${
        args.node.detail || "Choose a path."
      } Decision: ${decision}. ${reason} ${upstream || firstSentence}`,
      220
    );
    return {
      text,
      traceLabel: "Decision",
      inputSummary,
      outputSummary: buildThinkingFlowTracePreview(
        `Selected ${getThinkingFlowBranchLabel(
          branchDecision
        )} branch. ${reason}`,
        "Decision not made."
      ),
      traceItems: [
        `Decision: ${decision}`,
        `Branch: ${getThinkingFlowBranchLabel(branchDecision)}`,
        `Reason: ${buildThinkingFlowTracePreview(reason, reason, 96)}`,
        focusLabel ? `Signal: ${focusLabel}` : "Signal: general brief context",
      ],
      status: upstream ? "ready" : "warning",
      branchDecision,
      warning: upstream
        ? undefined
        : `${args.node.label} has no upstream step. Preview decided directly from the brief.`,
    };
  }
  if (args.node.kind === "tool") {
    const toolConfig = getThinkingFlowToolConfig(args.node);
    const adapter = THINKING_FLOW_TOOL_ADAPTERS[toolConfig.adapterId];
    const toolRun = adapter.execute({
      node: args.node,
      brief: args.brief,
      upstreamText,
      promptHint: args.promptHint,
      semanticRole: args.semanticRole,
      focusPrompt: toolConfig.focusPrompt ?? "",
      maxItems: toolConfig.maxItems,
      keywords,
      numbers,
      sentences,
    });
    return {
      text: toolRun.text,
      traceLabel: toolRun.traceLabel,
      inputSummary,
      outputSummary: toolRun.outputSummary,
      traceItems: toolRun.traceItems,
      status: upstream ? "ready" : "warning",
      warning: upstream
        ? undefined
        : `${args.node.label} has no upstream step. Preview retrieved support directly from the brief.`,
    };
  }
  if (args.node.kind === "calc") {
    const sortedAnchors = [...numbers].sort(
      (left, right) => right.value - left.value
    );
    const topAnchor = sortedAnchors[0];
    const nextAnchor = sortedAnchors[1];
    const calcSummary = topAnchor
      ? nextAnchor
        ? `Top anchor ${topAnchor.raw} vs ${
            nextAnchor.raw
          }; gap ${formatThinkingFlowGap(topAnchor, nextAnchor)}.`
        : `Primary anchor ${topAnchor.raw}.`
      : focusLabel
      ? `Ranked themes: ${focusLabel}.`
      : "Used qualitative comparison.";
    const text = shortenThinkingFlowRunText(
      `${args.node.detail || "Compare and quantify."} ${calcSummary} ${
        upstream || firstSentence
      }`,
      220
    );
    return {
      text,
      traceLabel: "Calculation",
      inputSummary,
      outputSummary: buildThinkingFlowTracePreview(
        calcSummary,
        "No calculation yet."
      ),
      traceItems: topAnchor
        ? [
            `Anchors: ${sortedAnchors
              .slice(0, 3)
              .map((item) => item.raw)
              .join(", ")}`,
            nextAnchor
              ? `Gap: ${formatThinkingFlowGap(topAnchor, nextAnchor)}`
              : "Gap: single anchor only",
            `Lead: ${topAnchor.raw}`,
          ]
        : [
            focusLabel ? `Ranked: ${focusLabel}` : "Ranked: main ask only",
            "Mode: qualitative comparison",
          ],
      status: upstream ? "ready" : "warning",
      warning: upstream
        ? undefined
        : `${args.node.label} has no upstream step. Preview calculated directly from the brief.`,
    };
  }
  const text = shortenThinkingFlowRunText(
    `${args.node.detail || args.node.label} ${upstream || firstSentence}`,
    220
  );
  return {
    text,
    traceLabel: "Step",
    inputSummary,
    outputSummary: buildThinkingFlowTracePreview(text, "Step ran."),
    traceItems: [focusLabel ? `Focus: ${focusLabel}` : "Focus: main ask"],
    status: "ready",
  };
};
