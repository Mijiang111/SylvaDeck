import { createHash } from "node:crypto";

export function normalizeStudioText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function normalizeMultilineStudioText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\t/g, " ")
    .replace(/[ \f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkBriefBlock(block: string, maxChunkLength = 560): string[] {
  const trimmed = block.trim();
  if (!trimmed) {
    return [];
  }
  if (trimmed.length <= maxChunkLength) {
    return [trimmed];
  }

  const sentences = trimmed
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'\-])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length <= 1) {
    return [
      trimmed.slice(0, maxChunkLength),
      ...chunkBriefBlock(trimmed.slice(maxChunkLength), maxChunkLength),
    ].filter(Boolean);
  }

  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
      continue;
    }
    if (`${current} ${sentence}`.length > maxChunkLength) {
      chunks.push(current);
      current = sentence;
      continue;
    }
    current = `${current} ${sentence}`;
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

export function compactBriefForGeneration(
  brief: string,
  maxLength = 12_000,
): {
  brief: string;
  compacted: boolean;
  originalLength: number;
} {
  const normalized = normalizeMultilineStudioText(brief);
  if (normalized.length <= maxLength) {
    return {
      brief: normalized,
      compacted: false,
      originalLength: normalized.length,
    };
  }

  const rawBlocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const blocks =
    rawBlocks.length > 0
      ? rawBlocks.flatMap((block) => chunkBriefBlock(block))
      : chunkBriefBlock(normalized);

  const keywordPattern =
    /\b(recommend|decision|risk|timeline|trend|compare|comparison|growth|decline|increase|decrease|board|action|metric|evidence|priority|investment|revenue|cost|margin|profit|page|deck|tone)\b/i;

  const scoredBlocks = blocks.map((block: string, index: number) => {
    const normalizedBlock = normalizeStudioText(block);
    let score = 0;

    if (index === 0) {
      score += 10;
    } else if (index < 3) {
      score += 4;
    }

    if (/^[-*•]\s|^\d+[.)]\s/m.test(block)) {
      score += 5;
    }
    if (/\d/.test(block)) {
      score += 6;
    }
    if (/%|\$|usd|eur|hkd|cny|rmb|¥|€|£/i.test(block)) {
      score += 2;
    }
    if (keywordPattern.test(block)) {
      score += 3;
    }
    if (normalizedBlock.length >= 60 && normalizedBlock.length <= 420) {
      score += 2;
    }
    if (/:\s*$/.test(block) || /^[A-Z][A-Za-z0-9\s/&-]{0,80}:/.test(block)) {
      score += 2;
    }

    return { block, index, score };
  });

  const selectedIndices = new Set<number>([0]);
  let totalLength = blocks[0]?.length ?? 0;
  const ranked = [...scoredBlocks].sort(
    (left, right) => right.score - left.score || left.index - right.index,
  );

  for (const candidate of ranked) {
    if (selectedIndices.has(candidate.index)) {
      continue;
    }
    const nextLength = totalLength + candidate.block.length + 2;
    if (nextLength > maxLength) {
      continue;
    }
    selectedIndices.add(candidate.index);
    totalLength = nextLength;
    if (totalLength >= maxLength * 0.92) {
      break;
    }
  }

  if (selectedIndices.size < 2 && blocks.length > 1) {
    for (let index = 1; index < blocks.length; index += 1) {
      const nextLength = totalLength + blocks[index]!.length + 2;
      if (nextLength > maxLength) {
        break;
      }
      selectedIndices.add(index);
      totalLength = nextLength;
      if (selectedIndices.size >= 3) {
        break;
      }
    }
  }

  const compactedBrief = [...selectedIndices]
    .sort((left, right) => left - right)
    .map((index) => blocks[index]!)
    .join("\n\n")
    .slice(0, maxLength)
    .trim();

  return {
    brief: compactedBrief || normalized.slice(0, maxLength),
    compacted: true,
    originalLength: normalized.length,
  };
}

export function sha1(value: string) {
  return createHash("sha1").update(value).digest("hex");
}

export function uniqueStrings(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

export function sentenceTitle(text: string, fallback: string) {
  const clean = text.replace(/^[\-\d.\s]+/, "").trim();
  if (!clean) {
    return fallback;
  }

  const words = clean.split(/\s+/).slice(0, 5).join(" ");
  return words.length > 3 ? words : fallback;
}

export function clampText(text: string, max: number) {
  const normalized = normalizeStudioText(text);
  return normalized.length > max ? normalized.slice(0, max) : normalized;
}

export function parseNumericValue(raw: string) {
  const clean = raw.replace(/[<>,~]/g, "").trim();
  const numberMatch = clean.match(/^-?\d[\d,.]*(?:\.\d+)?/);
  if (!numberMatch) {
    return null;
  }

  const numeric = Number(numberMatch[0].replace(/,/g, ""));
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (/%$/.test(clean)) return numeric;
  if (/mwh/i.test(clean)) return numeric * 1_000;
  if (/bn/i.test(clean)) return numeric * 1_000_000_000;
  if (/\bm\b|million/i.test(clean)) return numeric * 1_000_000;
  if (/\bk\b|thousand/i.test(clean)) return numeric * 1_000;

  return numeric;
}

export function inferUnitFromText(text: string) {
  if (/%/.test(text)) {
    return "%";
  }
  if (/\$|usd|eur|hkd|cny|rmb|¥|€|£/i.test(text)) {
    return "currency";
  }
  return null;
}

export function splitBriefLines(brief: string) {
  return brief
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function splitBriefSentences(brief: string) {
  return brief
    .replace(/\n+/g, " ")
    .split(/[.!?;。；]+/)
    .map((sentence) => normalizeStudioText(sentence))
    .filter((sentence) => sentence.length > 18)
    .filter((sentence) => !isInstructionalBriefLine(sentence));
}

export function isInstructionalBriefLine(text: string) {
  return (
    /^(create|build|make|prepare|draft|write|design|generate)\b/i.test(text) ||
    /^use the following evidence\b/i.test(text) ||
    /^recommend\b/i.test(text)
  );
}

export function stripInstructionalLead(text: string) {
  return normalizeStudioText(text)
    .replace(/^opening\s+/i, "")
    .replace(
      /^(?:\d+\s*(?:page|pages|slide|slides)\s+)?(?:ppt|presentation|deck|slide\s+deck)\s+(?:for|on|about)\s+/i,
      "",
    )
    .replace(
      /^(?:create|build|make|prepare|draft|write|design|generate)\s+(?:a|an|the)?\s*(?:\w+(?:-\w+)?\s+){0,5}deck\s+(?:on|for|about)\s+/i,
      "",
    )
    .replace(/^use the following evidence:?\s*/i, "")
    .replace(/^what the deck should do:?\s*/i, "")
    .trim();
}

export function isGenericStudioTitle(title: string) {
  const raw = normalizeStudioText(title).toLowerCase();
  const normalized = stripInstructionalLead(title).replace(/\s+/g, " ").trim().toLowerCase();
  return Boolean(
    /^(?:core thesis|opening thesis|key pattern|what the evidence suggests)$/.test(raw) ||
      /^(?:core thesis|opening thesis|key pattern|what the evidence suggests)$/.test(normalized) ||
      /^(?:evidence page|results page|support|supporting detail|supporting result|page)\s+\d+$/.test(normalized) ||
      /^(?:synthesis|open questions)$/.test(normalized) ||
      /^(?:core view|case view|decision view|research view|report review|case review|decision review|research review)$/.test(normalized) ||
      /^the brief (?:points to|supports)\b/.test(normalized),
  );
}

export function assessGeneratedTitleQuality(title: string) {
  const normalized = stripInstructionalLead(title).replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();
  const promptLeak =
    /^(?:opening\s+)?(?:create|build|make|prepare|draft|write|design|generate)\b/i.test(title) ||
    /\b(?:use the following evidence|what the deck should do)\b/i.test(
      title.toLowerCase(),
    ) ||
    isGenericStudioTitle(title);
  const repeatedInstruction =
    /\b(?:use the following evidence|what the deck should do|tone)\b/i.test(lower);
  const truncated =
    normalized.length > 0 &&
    /[\s:-](?:on|for|with|about|to)$/i.test(normalized);

  return {
    title: normalized,
    promptLeak,
    repeatedInstruction,
    truncated,
  };
}

export function compactBoardTitle(text: string, fallback: string, maxWords = 6) {
  const normalized = stripInstructionalLead(text)
    .replace(/[.:;,-]+$/g, "")
    .replace(/[\s:-](?:on|for|with|about|to)$/i, "")
    .replace(/^["'`]+|["'`]+$/g, "");
  if (!normalized) {
    return fallback;
  }

  const words = normalized.split(/\s+/).slice(0, maxWords);
  if (words.length === 0) {
    return fallback;
  }

  const title = words.join(" ");
  return title.length >= 4 ? title : fallback;
}

function escapeRegExpLiteral(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function deriveSpecificStudioTitle(args: {
  seeds: Array<string | null | undefined>;
  fallback: string;
  shortSuffix?: string;
  maxWords?: number;
}) {
  const maxWords = args.maxWords ?? 6;
  const candidates = [...args.seeds, args.fallback];

  for (const seed of candidates) {
    const baseTitle = compactBoardTitle(seed ?? "", "", maxWords)
      .replace(/^[\s:;-]+|[\s:;-]+$/g, "")
      .trim();
    if (!baseTitle) {
      continue;
    }
    const baseQuality = assessGeneratedTitleQuality(baseTitle);
    if (baseQuality.promptLeak || baseQuality.repeatedInstruction || baseQuality.truncated) {
      continue;
    }

    const needsSuffix =
      args.shortSuffix &&
      baseTitle.split(/\s+/).length <= 2 &&
      !new RegExp(`\\b${escapeRegExpLiteral(args.shortSuffix)}\\b`, "i").test(baseTitle);
    const candidate = needsSuffix ? `${baseTitle} ${args.shortSuffix}` : baseTitle;
    const quality = assessGeneratedTitleQuality(candidate);
    if (!quality.promptLeak && !quality.repeatedInstruction && !quality.truncated) {
      return quality.title;
    }
  }

  const fallback = args.shortSuffix ? `Brief ${args.shortSuffix}` : "Brief focus";
  const quality = assessGeneratedTitleQuality(fallback);
  return quality.promptLeak || quality.repeatedInstruction || quality.truncated
    ? "Brief focus"
    : quality.title;
}

export function deriveEvidenceTitle(line: string, fallback: string) {
  let candidate = line
    .replace(/^[\-\d.)\s]+/, "")
    .replace(/^use the following evidence:?\s*/i, "")
    .trim();

  const colonIndex = candidate.indexOf(":");
  if (colonIndex > 0 && colonIndex < 70) {
    candidate = candidate.slice(0, colonIndex).trim();
  }

  const verbMatch = candidate.match(
    /\b(fell|rose|grew|declined|decreased|increased|reduced|improved|dropped|climbed|expanded|contracted)\b/i,
  );
  if (verbMatch?.index && verbMatch.index > 3) {
    candidate = candidate.slice(0, verbMatch.index).trim();
  }

  candidate = candidate
    .replace(/^(the|our|this|these)\s+/i, "")
    .replace(/^top\s+\w+\s+/i, "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/\b(?:over|across|during|in)\b.*$/i, "")
    .replace(/[.:;,-]+$/g, "")
    .trim();

  return compactBoardTitle(candidate, fallback, 7);
}
