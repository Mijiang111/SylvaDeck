import type { DeckThinkingMode } from "./generation-contract";

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function countMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function stripCodeFence(block: string) {
  return block
    .replace(/^```[^\n]*\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
}

function splitParagraphs(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function hasTaskShapeCue(text: string) {
  return /\b(\d+\s*page|page\s+\d+|ppt|deck|slides?|presentation|report|case study|research presentation|academic presentation|board deck|investor deck|brief)\b/.test(
    text,
  ) || /(?:\d+\s*页|PPT|汇报|报告|案例|演示文稿|做一页|做两页)/.test(text);
}

function hasTaskVerbCue(text: string) {
  return /\b(create|make|build|generate|design|prepare|write|draft|turn|convert|summarize|outline|need|want)\b/.test(
    text,
  ) || /(?:生成|制作|准备|整理|输出|总结|撰写|写一个|做一个|做两页|想做|需要)/.test(text);
}

function isLikelyTaskIntentParagraph(text: string, index: number) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return false;
  }

  if (index === 0 && normalized.length <= 320 && (hasTaskShapeCue(normalized) || hasTaskVerbCue(normalized))) {
    return true;
  }

  if (normalized.length > 340) {
    return false;
  }

  return hasTaskShapeCue(normalized) && (hasTaskVerbCue(normalized) || index <= 1);
}

function isLikelySourceMaterialParagraph(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return false;
  }

  const sentenceLikeCount = text
    .split(/[.!?。！？]/)
    .map((entry) => entry.trim())
    .filter(Boolean).length;

  return (
    text.length >= 420 ||
    sentenceLikeCount >= 5 ||
    /^>/.test(text) ||
    /\[[0-9]+\]/.test(text) ||
    /\b(according to|background|abstract|introduction|literature review|discussion|methodology|this report|the report|as the cornerstone)\b/.test(
      normalized,
    ) ||
    /(?:根据|背景|摘要|引言|文献综述|讨论|方法|本报告|研究背景)/.test(text)
  );
}

function compactParagraphs(paragraphs: string[]) {
  return paragraphs
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function detectAcademicResearch(text: string) {
  const scrubbedText = text.replace(/\bcase study\b/g, "case-narrative");
  const academicScore = countMatches(scrubbedText, [
    /\bacademic\b/,
    /\bresearch\b/,
    /\bpaper\b/,
    /\bstudy\b/,
    /\bexperiment\b/,
    /\bhypothesis\b/,
    /\bmethod\b/,
    /\bresults\b/,
    /\bdiscussion\b/,
    /\bliterature review\b/,
    /\bdataset\b/,
  ]);
  return academicScore >= 2;
}

function detectCaseStudy(text: string) {
  const caseStudyScore = countMatches(text, [
    /\bcase study\b/,
    /\bcustomer\b/,
    /\bclient\b/,
    /\bcompany story\b/,
    /\bbefore[- ]after\b/,
    /\bproblem[- ]solution\b/,
    /\bintervention\b/,
    /\boutcome\b/,
    /\brollout\b/,
    /\bimplementation\b/,
    /案例/,
  ]);
  return caseStudyScore >= 1;
}

function detectStrategy(text: string) {
  const strategyScore = countMatches(text, [
    /\bboard\b/,
    /\bleadership\b/,
    /\binvestor\b/,
    /\brecommendation\b/,
    /\bdecision\b/,
    /\bpriority\b/,
    /\bpriorities\b/,
    /\bstrategy\b/,
    /\bsteerco\b/,
    /\binvestment priorities\b/,
  ]);
  return strategyScore >= 2;
}

function detectExplicitTaskMode(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return null;
  }

  if (
    /\b(research presentation|academic presentation|paper presentation|conference presentation|journal presentation|scientific presentation)\b/.test(
      normalized,
    ) ||
    /(?:论文汇报|研究汇报|学术汇报|研究报告|论文报告)/.test(text) ||
    (((/\b(method|methods|result|results|discussion)\b/.test(normalized)) ||
      /(?:方法|结果|讨论)/.test(text)) &&
      /\b(research|paper|study|academic|scientific)\b/.test(normalized))
  ) {
    return "academic-research" as const;
  }

  if (
    /\b(case study|case-study|application case|implementation case|practice case|customer case|client case|company story|customer story)\b/.test(
      normalized,
    ) ||
    /(?:案例|案例分析|应用案例|实践案例|客户案例)/.test(text)
  ) {
    return "case-study" as const;
  }

  if (
    /\b(board deck|investor deck|executive deck|decision brief|recommendation|priorit(?:y|ies)|leadership|steerco|steering committee)\b/.test(
      normalized,
    ) ||
    /(?:董事会|管理层|投资人|优先级|决策|建议)/.test(text)
  ) {
    return "strategy" as const;
  }

  return null;
}

function segmentThinkingInputs(sourceText: string) {
  const sourceMaterialBlocks: string[] = [];
  const fencedMatches = [...sourceText.matchAll(/```[\s\S]*?```/g)];
  fencedMatches.forEach((match) => {
    const block = stripCodeFence(match[0]);
    if (block) {
      sourceMaterialBlocks.push(block);
    }
  });

  const sourceWithoutFences = sourceText.replace(/```[\s\S]*?```/g, "\n\n");
  const paragraphs = splitParagraphs(sourceWithoutFences);
  const taskIntentParagraphs: string[] = [];
  const globalHintParagraphs: string[] = [];

  paragraphs.forEach((paragraph, index) => {
    if (isLikelyTaskIntentParagraph(paragraph, index) && taskIntentParagraphs.length === 0) {
      taskIntentParagraphs.push(paragraph);
      return;
    }

    if (isLikelySourceMaterialParagraph(paragraph)) {
      sourceMaterialBlocks.push(paragraph);
      return;
    }

    if (taskIntentParagraphs.length === 0 && index === 0) {
      taskIntentParagraphs.push(paragraph);
      return;
    }

    globalHintParagraphs.push(paragraph);
  });

  return {
    taskIntentText: compactParagraphs(taskIntentParagraphs),
    sourceMaterialText: compactParagraphs(sourceMaterialBlocks),
    globalHintsText: compactParagraphs(globalHintParagraphs),
  };
}

export function resolveGenerationThinkingMode(sourceText: string): DeckThinkingMode {
  const segmented = segmentThinkingInputs(sourceText);
  const explicitTaskMode = detectExplicitTaskMode(segmented.taskIntentText);
  if (explicitTaskMode) {
    return explicitTaskMode;
  }

  const directIntentText = normalizeText(
    [segmented.taskIntentText, segmented.globalHintsText].filter(Boolean).join(" "),
  );
  if (detectCaseStudy(directIntentText)) {
    return "case-study";
  }

  if (detectAcademicResearch(directIntentText)) {
    return "academic-research";
  }

  if (detectStrategy(directIntentText)) {
    return "strategy";
  }

  const sourceTextOnly = normalizeText(segmented.sourceMaterialText);
  if (detectCaseStudy(sourceTextOnly)) {
    return "case-study";
  }

  if (detectAcademicResearch(sourceTextOnly)) {
    return "academic-research";
  }

  if (detectStrategy(sourceTextOnly)) {
    return "strategy";
  }

  return "neutral";
}
