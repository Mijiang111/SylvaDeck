import type {
  ModuleThinkingFlowNode,
  ModuleThinkingFlowToolAdapterId,
} from "@/features/studio/types";

const THINKING_FLOW_STOPWORDS = new Set([
  "about",
  "after",
  "against",
  "around",
  "because",
  "before",
  "being",
  "between",
  "could",
  "focus",
  "should",
  "their",
  "there",
  "these",
  "those",
  "through",
  "under",
  "using",
  "which",
  "while",
  "with",
  "within",
  "would",
]);

const NUMBER_LABEL_STOPWORDS = new Set([
  "about",
  "above",
  "across",
  "after",
  "against",
  "among",
  "around",
  "at",
  "before",
  "below",
  "between",
  "by",
  "for",
  "from",
  "grew",
  "in",
  "into",
  "is",
  "of",
  "on",
  "reached",
  "rose",
  "to",
  "up",
  "versus",
  "vs",
  "was",
  "were",
  "with",
]);

export const THINKING_FLOW_TOOL_ADAPTER_IDS: ModuleThinkingFlowToolAdapterId[] =
  ["support", "keywords", "numbers", "quotes"];

export const THINKING_FLOW_TOOL_ADAPTER_LABEL: Record<
  ModuleThinkingFlowToolAdapterId,
  string
> = {
  support: "Support",
  keywords: "Keywords",
  numbers: "Numbers",
  quotes: "Quotes",
};

export type ThinkingFlowNumericAnchor = {
  raw: string;
  value: number;
  isPercent: boolean;
  isCurrency: boolean;
  sentence: string;
  label?: string;
};

export type ThinkingFlowToolAdapterExecution = {
  traceLabel: string;
  outputSummary: string;
  traceItems: string[];
  text: string;
};

export type ThinkingFlowToolAdapterDefinition = {
  id: ModuleThinkingFlowToolAdapterId;
  label: string;
  summary: string;
  execute: (args: {
    node: ModuleThinkingFlowNode;
    brief: string;
    upstreamText: string;
    promptHint: string;
    semanticRole: string;
    focusPrompt: string;
    maxItems: number;
    keywords: string[];
    numbers: ThinkingFlowNumericAnchor[];
    sentences: string[];
  }) => ThinkingFlowToolAdapterExecution;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isThinkingFlowToolAdapterId(
  value: unknown
): value is ModuleThinkingFlowToolAdapterId {
  return (
    value === "support" ||
    value === "keywords" ||
    value === "numbers" ||
    value === "quotes"
  );
}

function normalizeFocusTerms(focusPrompt: string) {
  return (
    focusPrompt
      .toLowerCase()
      .match(/[a-z][a-z-]{2,}/g)
      ?.filter((token) => !THINKING_FLOW_STOPWORDS.has(token)) ?? []
  );
}

function extractNumericLabel(sentence: string, startIndex: number) {
  const localLeft = sentence
    .slice(0, startIndex)
    .split(/[,:;()]/)
    .at(-1)
    ?.trim();

  if (!localLeft) {
    return undefined;
  }

  const tokens = localLeft.match(/[A-Za-z][A-Za-z&/-]*/g) ?? [];
  const filtered = tokens.filter(
    (token) => !NUMBER_LABEL_STOPWORDS.has(token.toLowerCase())
  );
  if (filtered.length === 0) {
    return undefined;
  }

  return filtered.slice(-3).join(" ");
}

function scoreEvidenceSentence(args: {
  sentence: string;
  focusTerms: string[];
  keywords: string[];
  numbers: ThinkingFlowNumericAnchor[];
}) {
  const normalized = args.sentence.toLowerCase();
  let score = 0;

  args.focusTerms.forEach((term) => {
    if (normalized.includes(term)) {
      score += 4;
    }
  });
  args.keywords.forEach((keyword) => {
    if (normalized.includes(keyword)) {
      score += 2;
    }
  });
  args.numbers.forEach((anchor) => {
    if (normalized.includes(anchor.raw.toLowerCase())) {
      score += 3;
    }
    if (anchor.label && normalized.includes(anchor.label.toLowerCase())) {
      score += 2;
    }
  });
  if (/\d/.test(args.sentence)) {
    score += 2;
  }

  return score;
}

export function splitThinkingFlowRunSentences(text: string) {
  return text
    .replace(/\r/g, " ")
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function shortenThinkingFlowRunText(text: string, maxLength = 220) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) {
    return "";
  }
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function buildThinkingFlowTracePreview(
  text: string,
  fallback: string,
  max = 140
) {
  return shortenThinkingFlowRunText(text || fallback, max);
}

export function extractThinkingFlowKeywords(text: string) {
  const seen = new Set<string>();
  const matches = text.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? [];
  return matches
    .filter((word) => !THINKING_FLOW_STOPWORDS.has(word))
    .filter((word) => {
      if (seen.has(word)) {
        return false;
      }
      seen.add(word);
      return true;
    })
    .slice(0, 6);
}

export function parseThinkingFlowNumericAnchors(text: string) {
  const sentences = splitThinkingFlowRunSentences(text);
  const anchors: ThinkingFlowNumericAnchor[] = [];

  sentences.forEach((sentence) => {
    Array.from(sentence.matchAll(/\$?\d+(?:\.\d+)?%?/g)).forEach((match) => {
      const raw = match[0];
      const value = Number(raw.replace(/[$,%]/g, ""));
      if (!Number.isFinite(value)) {
        return;
      }
      anchors.push({
        raw,
        value,
        isPercent: raw.includes("%"),
        isCurrency: raw.includes("$"),
        sentence,
        label: extractNumericLabel(sentence, match.index ?? 0),
      });
    });
  });

  return anchors.slice(0, 8);
}

export function formatThinkingFlowGap(
  left: ThinkingFlowNumericAnchor,
  right: ThinkingFlowNumericAnchor
) {
  const gap = Math.abs(left.value - right.value);
  if (left.isPercent || right.isPercent) {
    return `${gap} pts`;
  }
  if (left.isCurrency || right.isCurrency) {
    return `$${gap}`;
  }
  return `${gap}`;
}

export function normalizeThinkingFlowToolConfig(
  config: ModuleThinkingFlowNode["toolConfig"]
) {
  if (!config) {
    return undefined;
  }
  const adapterId = isThinkingFlowToolAdapterId(config.adapterId)
    ? config.adapterId
    : "support";
  const focusPrompt = config.focusPrompt?.trim();
  const maxItems = clamp(Math.round(config.maxItems ?? 3), 1, 4);
  return {
    adapterId,
    focusPrompt,
    maxItems,
  };
}

export function getThinkingFlowToolConfig(node: ModuleThinkingFlowNode) {
  return (
    normalizeThinkingFlowToolConfig(node.toolConfig) ?? {
      adapterId: "support" as const,
      focusPrompt: undefined,
      maxItems: 3,
    }
  );
}

export const THINKING_FLOW_TOOL_ADAPTERS: Record<
  ModuleThinkingFlowToolAdapterId,
  ThinkingFlowToolAdapterDefinition
> = {
  support: {
    id: "support",
    label: "Support",
    summary: "Retrieve the strongest evidence sentences for the current claim.",
    execute(args) {
      const focusTerms = normalizeFocusTerms(args.focusPrompt);
      const rankedSentences = args.sentences
        .map((sentence) => ({
          sentence,
          score: scoreEvidenceSentence({
            sentence,
            focusTerms,
            keywords: args.keywords,
            numbers: args.numbers,
          }),
        }))
        .sort((left, right) => right.score - left.score)
        .filter((item) => item.score > 0)
        .slice(0, args.maxItems);

      const evidenceItems =
        rankedSentences.length > 0
          ? rankedSentences.map((item) =>
              buildThinkingFlowTracePreview(item.sentence, item.sentence, 96)
            )
          : args.numbers.length > 0
          ? args.numbers.slice(0, args.maxItems).map((anchor) => {
              const label = anchor.label ? `${anchor.label}: ` : "";
              return `${label}${anchor.raw}`;
            })
          : ["No concrete support sentence matched the brief."];

      const primaryEvidence = evidenceItems[0] ?? "No support gathered.";

      return {
        traceLabel: "Evidence",
        outputSummary: buildThinkingFlowTracePreview(
          `Retrieved ${Math.max(
            1,
            rankedSentences.length
          )} supporting evidence items${
            args.focusPrompt ? ` for ${args.focusPrompt}` : ""
          }.`,
          "No support gathered."
        ),
        traceItems: evidenceItems.map((item) => `Evidence: ${item}`),
        text: shortenThinkingFlowRunText(
          `${args.node.detail || "Retrieve supporting evidence."} ${
            args.focusPrompt ? `Focus on ${args.focusPrompt}. ` : ""
          }Primary support: ${primaryEvidence}.`,
          220
        ),
      };
    },
  },
  keywords: {
    id: "keywords",
    label: "Keywords",
    summary: "Extract the dominant themes or entities.",
    execute(args) {
      const items = args.keywords
        .slice(0, args.maxItems)
        .map((keyword) => `Theme: ${keyword}`);
      return {
        traceLabel: "Themes",
        outputSummary: buildThinkingFlowTracePreview(
          items.length > 0
            ? `Extracted ${items.length} high-signal themes.`
            : "No strong themes found.",
          "No strong themes found."
        ),
        traceItems: items.length > 0 ? items : ["Theme: general brief context"],
        text: shortenThinkingFlowRunText(
          `${args.node.detail || "Extract the dominant themes."} ${
            items.length > 0
              ? items.join(" ")
              : "Use the main brief context as the only theme."
          } ${args.focusPrompt ? `Bias toward ${args.focusPrompt}.` : ""}`,
          220
        ),
      };
    },
  },
  numbers: {
    id: "numbers",
    label: "Numbers",
    summary: "Pull numeric anchors, ranking, and gap clues from the brief.",
    execute(args) {
      const anchors = args.numbers.slice(0, args.maxItems);
      const topAnchor = anchors[0];
      const nextAnchor = anchors[1];
      const anchorItems =
        anchors.length > 0
          ? anchors.map((anchor, index) => {
              const prefix = anchor.label ? `${anchor.label}: ` : "";
              const suffix =
                index === 1 && topAnchor
                  ? ` (gap ${formatThinkingFlowGap(topAnchor, anchor)})`
                  : "";
              return `Anchor ${index + 1}: ${prefix}${anchor.raw}${suffix}`;
            })
          : ["Anchor 1: no explicit number found"];

      return {
        traceLabel: "Numbers",
        outputSummary: buildThinkingFlowTracePreview(
          anchors.length > 0
            ? `Captured ${anchors.length} numeric anchors${
                topAnchor?.label ? ` around ${topAnchor.label}` : ""
              }.`
            : "No numeric anchors found.",
          "No numeric anchors found."
        ),
        traceItems: anchorItems,
        text: shortenThinkingFlowRunText(
          `${args.node.detail || "Extract numeric anchors."} ${
            anchors.length > 0
              ? `Use ${anchorItems.join(" ")}`
              : "No explicit numbers were found in the input."
          }${
            topAnchor && nextAnchor
              ? ` Priority gap is ${formatThinkingFlowGap(
                  topAnchor,
                  nextAnchor
                )}.`
              : ""
          } ${args.focusPrompt ? `Focus on ${args.focusPrompt}.` : ""}`,
          220
        ),
      };
    },
  },
  quotes: {
    id: "quotes",
    label: "Quotes",
    summary: "Pull short excerpts straight from the brief.",
    execute(args) {
      const excerpts = args.sentences
        .filter(Boolean)
        .slice(0, args.maxItems)
        .map((sentence) =>
          buildThinkingFlowTracePreview(sentence, sentence, 96)
        );
      return {
        traceLabel: "Excerpts",
        outputSummary: buildThinkingFlowTracePreview(
          excerpts.length > 0
            ? `Captured ${excerpts.length} source excerpts.`
            : "No source excerpts found.",
          "No source excerpts found."
        ),
        traceItems:
          excerpts.length > 0
            ? excerpts.map((excerpt) => `Excerpt: ${excerpt}`)
            : ["Excerpt: no sentence extracted"],
        text: shortenThinkingFlowRunText(
          `${args.node.detail || "Pull source excerpts."} ${
            excerpts[0] ||
            args.upstreamText ||
            args.brief ||
            "No excerpt found."
          } ${args.focusPrompt ? `Focus on ${args.focusPrompt}.` : ""}`,
          220
        ),
      };
    },
  },
};
