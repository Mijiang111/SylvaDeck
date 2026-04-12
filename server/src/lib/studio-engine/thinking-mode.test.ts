import test from "node:test";
import assert from "node:assert/strict";
import { resolveDeckStyleProfile } from "../industry-style.js";
import {
  buildEvidenceGraph,
  buildPagePrompt,
  buildSkillBackedPagePrompt,
  buildSkillBackedPlanningPrompt,
} from "./core.js";
import {
  assessStudioPageIntentQuality,
  buildStudioBriefSynthesis,
} from "./brief-synthesis.js";
import { assessGeneratedTitleQuality, deriveSpecificStudioTitle } from "./brief.js";
import { resolveStudioComplexityProfile } from "./complexity.js";
import { sanitizeRepairTitle } from "./repair.js";
import { validateGeneratedPageHtml } from "./render.js";
import { getThinkingModePlugin, resolveDeckThinkingMode, segmentThinkingInputs } from "./thinking-mode.js";
import { createTemplateContractWorkspaceBlock } from "./workspace.js";

const SHIPPING_CASE_STUDY_PROMPT = `2 page ppt for case-study of application of Robotic in Shipping
\`\`\`{
As the cornerstone of global trade, the shipping industry handles over 80% of international trade volume, making its operational efficiency, safety, and sustainability critically important to global economic stability and development. For a long time, the traditional shipping industry has relied heavily on manual labor, facing multiple challenges such as harsh working environments, high labor intensity, continuously rising human resource costs, and frequent safety accidents caused by human error. According to the International Maritime Organization (IMO), 80% to 90% of maritime accidents are directly or indirectly related to unsafe human behaviors or decision-making errors [1]. At the same time, the global shipping industry is confronting increasingly stringent environmental regulations and intense market competition. This report will follow the user’s requirements by organizing its own structure. It will first comprehensively review the various technological forms and core principles of robotics applications in the current shipping industry. Then, through typical case studies, it will analyze specific practices and outcomes.
}\`\`\``;

const mockAnalysisSkill = {
  path: null,
  body: "Use content logic first and keep the methodology lightweight.",
  hash: "analysis",
  source: "fallback" as const,
};

const mockHeroSkill = {
  path: null,
  body: "Use 3D only when the brief explicitly asks for it.",
  hash: "hero",
  source: "fallback" as const,
  references: {
    "object-grammar-chip-platform": { path: null, body: "", hash: "a", source: "fallback" as const },
    "composition-families": { path: null, body: "", hash: "b", source: "fallback" as const },
    "material-and-annotation-language": { path: null, body: "", hash: "c", source: "fallback" as const },
    "prompt-examples": { path: null, body: "", hash: "d", source: "fallback" as const },
  },
};

const neutralHeroIntent = {
  enabled: false,
  objectFocus: null,
  objectFamily: null,
  recommendedCompositionFamily: null,
  materialHints: [],
  annotationMode: null,
  narrativeBudget: [],
  reason: "not a 3d hero page",
};

const neutralChartIntent = {
  enabled: false,
  pressureMode: "standard" as const,
  question: null,
  explanationBudget: [],
  reason: "not a chart page",
};

const neutralStyleProfile = resolveDeckStyleProfile({
  brief: SHIPPING_CASE_STUDY_PROMPT,
}).profile;

const mockTemplateModules = [
  {
    moduleId: "template.poster-claim",
    kind: "matrix" as const,
    category: "logic" as const,
    status: "stable" as const,
    label: "Poster claim",
    semanticRole: "A full-page poster claim shape with one dominant proof slot.",
    promptHint: "Use as a page shape, not as a content script.",
    rendererCapabilities: [],
    supportedChartKinds: [],
    deterministicCapability: "fallback" as const,
    outputContractSummary: ["Claim: one headline claim", "Proof: one compact proof slot"],
    fieldManifest: [],
    publishCount: 2,
    lastPublishedAt: null,
    hasPassingEvidence: true,
    trustScore: 0.9,
    signature: "poster",
    template: {
      templateId: "template.poster-claim",
      sourceModuleId: "template.poster-claim",
      label: "Poster claim",
      family: "story-pattern" as const,
      shape: "poster-claim" as const,
      frame: { x: 0, y: 0, w: 160, h: 90 },
      visualHierarchy: ["1. Claim as headline-claim", "2. Proof as evidence-proof"],
      slotManifest: [
        {
          slotId: "claim",
          label: "Claim",
          slotKind: "ai-text" as const,
          role: "headline-claim",
          required: true,
          canHide: false,
          visualWeight: "primary" as const,
          geometry: { x: 12, y: 12, w: 116, h: 28 },
          contentBudget: ["Use one compact headline claim."],
        },
      ],
      decorativeManifest: [
        {
          id: "divider",
          label: "Divider line",
          kind: "line" as const,
          role: "divider-line",
          geometry: { x: 12, y: 44, w: 120, h: 2 },
          style: {
            stroke: "#9bb6c2",
            strokeWidth: 2,
            strokeStyle: "solid" as const,
          },
        },
        {
          id: "eyebrow",
          label: "Locked eyebrow",
          kind: "locked-text" as const,
          role: "locked-label",
          geometry: { x: 12, y: 8, w: 40, h: 6 },
          style: {
            fill: "#173043",
            textAlign: "left" as const,
          },
        },
      ],
      copyBudget: ["One page, one answer, one headline claim."],
      allowedAdaptations: ["Hide optional slots when content is weak."],
      fitRules: ["Do not invent filler just to occupy empty slots."],
      promptContract: ["Shape contract only."],
    },
  },
  {
    moduleId: "template.annotation-stage",
    kind: "bars" as const,
    category: "evidence" as const,
    status: "stable" as const,
    label: "Annotation stage",
    semanticRole: "A dominant evidence stage with compact annotations.",
    promptHint: "Use when the page needs one proof anchor.",
    rendererCapabilities: [],
    supportedChartKinds: ["bar" as const],
    deterministicCapability: "fallback" as const,
    outputContractSummary: [],
    fieldManifest: [],
    publishCount: 1,
    lastPublishedAt: null,
    hasPassingEvidence: true,
    trustScore: 0.8,
    signature: "annotation",
    template: {
      templateId: "template.annotation-stage",
      sourceModuleId: "template.annotation-stage",
      label: "Annotation stage",
      family: "framework" as const,
      shape: "annotation-stage" as const,
      visualHierarchy: ["1. Figure as evidence-proof"],
      slotManifest: [],
      decorativeManifest: [],
      copyBudget: ["Keep annotations compact."],
      allowedAdaptations: ["Use built-in freeform if evidence is too weak."],
      fitRules: ["Do not add a heavy footer."],
      promptContract: ["Proof-stage shape."],
    },
  },
  {
    moduleId: "template.third",
    kind: "flow" as const,
    category: "roadmap" as const,
    status: "stable" as const,
    label: "Third unused template",
    semanticRole: "A third template that should not enter the page workspace.",
    promptHint: "Should be filtered out by workspace pressure limits.",
    rendererCapabilities: [],
    supportedChartKinds: [],
    deterministicCapability: "fallback" as const,
    outputContractSummary: [],
    fieldManifest: [],
    publishCount: 1,
    lastPublishedAt: null,
    hasPassingEvidence: true,
    trustScore: 0.7,
    signature: "third",
  },
];

const mockThreeDimensionalTemplateModule = {
  moduleId: "template.3d-cutaway",
  kind: "matrix" as const,
  category: "logic" as const,
  status: "stable" as const,
  label: "3D cutaway hero",
  semanticRole: "A three-dimensional hero model template for explicit 3D cutaway requests.",
  promptHint: "Use only when the user explicitly requested a 3D hero model or cutaway.",
  rendererCapabilities: [],
  supportedChartKinds: [],
  deterministicCapability: "fallback" as const,
  outputContractSummary: [],
  fieldManifest: [],
  publishCount: 1,
  lastPublishedAt: null,
  hasPassingEvidence: true,
  trustScore: 0.95,
  signature: "3d-cutaway",
  template: {
    templateId: "template.3d-cutaway",
    sourceModuleId: "template.3d-cutaway",
    label: "3D cutaway hero",
    family: "story-pattern" as const,
    shape: "center-stage-figure" as const,
    visualHierarchy: ["1. Dominant pseudo-3D hero model", "2. Compact annotation labels"],
    slotManifest: [],
    decorativeManifest: [],
    copyBudget: ["Use only a few labels around the hero object."],
    allowedAdaptations: ["Hide optional labels when evidence is weak."],
    fitRules: ["Do not use this template without an explicit 3D request."],
    promptContract: ["3D hero model template for explicit cutaway requests."],
  },
};

const explicitHeroIntent = {
  enabled: true,
  objectFocus: "shipping robotics system",
  objectFamily: "system-cutaway" as const,
  recommendedCompositionFamily: "right-dominant-cutaway" as const,
  materialHints: ["marine-grade metal"],
  annotationMode: "anchored-side-labels" as const,
  narrativeBudget: ["one core object explanation"],
  reason: "explicit 3D cutaway request",
};

function assertPromptOrder(prompt: string, earlier: string, later: string) {
  assert.ok(prompt.includes(earlier), `Expected prompt to include ${earlier}`);
  assert.ok(prompt.includes(later), `Expected prompt to include ${later}`);
  assert.ok(
    prompt.indexOf(earlier) < prompt.indexOf(later),
    `Expected ${earlier} to appear before ${later}`,
  );
}

test("strategy cues resolve to strategy mode", () => {
  const context = resolveDeckThinkingMode(
    "Create a board deck with one recommendation for leadership and investor-facing decision priorities.",
    null,
  );
  assert.equal(context.mode, "strategy");
});

test("case-study cues resolve to case-study mode", () => {
  const context = resolveDeckThinkingMode(
    "Create a case study about a customer rollout with before-after evidence, the intervention, and the final outcome.",
    null,
  );
  assert.equal(context.mode, "case-study");
});

test("academic research cues resolve to academic-research mode", () => {
  const context = resolveDeckThinkingMode(
    "Create a research presentation for a paper with hypothesis, method, results, discussion, and literature review context.",
    null,
  );
  assert.equal(context.mode, "academic-research");
});

test("task-first segmentation separates the task request from fenced source material", () => {
  const inputs = segmentThinkingInputs(SHIPPING_CASE_STUDY_PROMPT);
  assert.match(inputs.taskIntentText, /2 page ppt for case-study/i);
  assert.match(inputs.sourceMaterialText, /cornerstone of global trade/i);
  assert.equal(inputs.sourceWeightProfile.sourceMaterialBlockCount >= 1, true);
});

test("explicit case-study task stays case-study even when the source material sounds academic", () => {
  const context = resolveDeckThinkingMode(SHIPPING_CASE_STUDY_PROMPT, null);
  assert.equal(context.mode, "case-study");
  assert.equal(context.lockedByTaskIntent, true);
});

test("explicit research presentation stays academic even when the source material reads like a case", () => {
  const context = resolveDeckThinkingMode(
    "Create a 3-page research presentation on a warehouse intervention, with question, method, results, and discussion.\n\nThe case follows one customer rollout from before to after adoption.",
    null,
  );
  assert.equal(context.mode, "academic-research");
  assert.equal(context.lockedByTaskIntent, true);
});

test("ambiguous briefs fall back to neutral mode", () => {
  const context = resolveDeckThinkingMode(
    "Create a short deck about how queue timing changed after a workflow redesign.",
    null,
  );
  assert.equal(context.mode, "neutral");
});

test("brief synthesis keeps sparse task text out of evidence", () => {
  const context = resolveDeckThinkingMode("1 page ppt for OpenAI", null);
  const synthesis = buildStudioBriefSynthesis({
    brief: "1 page ppt for OpenAI",
    thinkingContext: context,
    requestedPageCount: 1,
  });
  const evidenceGraph = buildEvidenceGraph(synthesis.evidenceInputText, 1);

  assert.equal(synthesis.subject, "OpenAI");
  assert.equal(synthesis.contentConfidence, "sparse-safe-common-sense");
  assert.equal(synthesis.sparseBriefMode, true);
  assert.equal(synthesis.evidenceCandidates.length, 0);
  assert.equal(evidenceGraph.factTable.items.length, 0);
  assert.equal(evidenceGraph.claims.length, 0);
  assert.equal(
    evidenceGraph.factTable.items.some((item) => /page ppt/i.test(`${item.label}: ${item.valueText}`)),
    false,
  );
});

test("high-spec valuation briefs resolve to the deep workspace lane", () => {
  const brief = "1 page Top Ibank level Codex Product Valuation";
  const inputs = segmentThinkingInputs(brief);
  const profile = resolveStudioComplexityProfile({
    brief,
    inputs,
  });

  assert.equal(profile.workloadLane, "deep");
  assert.equal(profile.rigorLevel, "high-spec");
  assert.equal(profile.taskGrammarPacks[0]?.id, "valuation-finance-grade");
  assert.equal(profile.deliverable, "product valuation deck");
});

test("deep valuation synthesis keeps the subject and valuation frame", () => {
  const brief = "1 page Top Ibank level Codex Product Valuation";
  const inputs = segmentThinkingInputs(brief);
  const profile = resolveStudioComplexityProfile({
    brief,
    inputs,
  });
  const context = resolveDeckThinkingMode(brief, null, inputs);
  const synthesis = buildStudioBriefSynthesis({
    brief,
    thinkingContext: context,
    requestedPageCount: 1,
    complexityProfile: profile,
  });

  assert.equal(synthesis.subject, "Codex");
  assert.equal(synthesis.workloadLane, "deep");
  assert.equal(synthesis.contentConfidence, "deep-structured-sparse");
  assert.equal(synthesis.structuredSparseMode, true);
  assert.equal(synthesis.deliverable, "product valuation deck");
  assert.match(synthesis.pageIntents[0]?.pageQuestion ?? "", /valuation frame/i);
  assert.equal(
    /brief focus/i.test([synthesis.subject, synthesis.pageIntents[0]?.pageTitle ?? "", synthesis.pageIntents[0]?.headlineClaim ?? ""].join(" ")),
    false,
  );
});

test("evidence graph rejects page-count task shell metrics even when called directly", () => {
  const evidenceGraph = buildEvidenceGraph("1 page ppt for OpenAI", 1);
  assert.equal(evidenceGraph.factTable.items.length, 0);
  assert.equal(evidenceGraph.claims.length, 0);
});

test("brief synthesis extracts a subject from non-ppt task phrasing", () => {
  const brief = "Create a 1 page case-study with a 3D cutaway of a shipping robotics system.";
  const context = resolveDeckThinkingMode(brief, null);
  const synthesis = buildStudioBriefSynthesis({
    brief,
    thinkingContext: context,
    requestedPageCount: 1,
  });

  assert.equal(synthesis.subject, "shipping robotics system");
  assert.match(synthesis.pageIntents[0]?.pageQuestion ?? "", /shipping robotics system/i);
});

test("page intent quality gate rejects task shell leakage", () => {
  const context = resolveDeckThinkingMode("1 page ppt for OpenAI", null);
  const synthesis = buildStudioBriefSynthesis({
    brief: "1 page ppt for OpenAI",
    thinkingContext: context,
    requestedPageCount: 1,
  });
  const quality = assessStudioPageIntentQuality({
    rawBrief: "1 page ppt for OpenAI",
    synthesis,
    page: {
      pageNumber: 1,
      pageTitle: "OpenAI focus",
      objective: "State the core claim immediately.",
      insight: "1 page ppt for OpenAI",
      heroClaim: "1 page ppt for OpenAI",
      supportBullets: ["1 page ppt for OpenAI"],
      evidenceBullets: ["page ppt for OpenAI: 1"],
    },
  });

  assert.equal(quality.pass, false);
  assert.equal(quality.reasons.some((reason) => /task-shell|fake evidence|raw task/i.test(reason)), true);
});

test("case-study plugin prompt lines stay out of board language", () => {
  const plugin = getThinkingModePlugin("case-study");
  const combined = plugin.pagePromptLines.join(" ").toLowerCase();
  assert.equal(combined.includes("board question"), false);
  assert.equal(combined.includes("decision priorities"), false);
});

test("academic research plugin prompt lines avoid leadership framing", () => {
  const plugin = getThinkingModePlugin("academic-research");
  const combined = plugin.pagePromptLines.join(" ").toLowerCase();
  assert.equal(combined.includes("leadership action"), false);
  assert.equal(combined.includes("board-ready"), false);
});

test("strategy plugin still allows recommendation-first logic", () => {
  const plugin = getThinkingModePlugin("strategy");
  const combined = [
    ...plugin.planningPromptLines,
    ...plugin.pagePromptLines,
  ]
    .join(" ")
    .toLowerCase();
  assert.equal(combined.includes("recommendation"), true);
});

test("title quality rejects generic placeholders without rejecting useful short titles", () => {
  for (const title of ["Core thesis", "Opening thesis", "Evidence page 1"]) {
    const quality = assessGeneratedTitleQuality(title);
    assert.equal(quality.promptLeak, true, `${title} should be treated as a generic placeholder`);
  }

  for (const title of ["OpenAI moat", "CII pressure", "Case overview"]) {
    const quality = assessGeneratedTitleQuality(title);
    assert.equal(quality.promptLeak, false, `${title} should not be treated as a prompt leak`);
    assert.equal(quality.truncated, false, `${title} should not fail just because it is short`);
  }
});

test("specific title helper avoids core thesis fallback for short neutral briefs", () => {
  const title = deriveSpecificStudioTitle({
    seeds: ["Core view", "The brief points to a clear central claim.", "OpenAI"],
    fallback: "Core thesis",
    shortSuffix: "focus",
    maxWords: 6,
  });

  assert.equal(title, "OpenAI focus");
});

test("repair title sanitizer does not fall back to generic internal titles", () => {
  const title = sanitizeRepairTitle({
    title: "Core thesis",
    pageNumber: 1,
    pageClass: "opening-core",
    fallbackSeed: "<section><h1>OpenAI platform moat</h1></section>",
  });

  assert.equal(title, "OpenAI platform moat");
});

test("planning prompt uses workspace order with user task before capability cards", () => {
  const context = resolveDeckThinkingMode(SHIPPING_CASE_STUDY_PROMPT, null);
  const synthesis = buildStudioBriefSynthesis({
    brief: SHIPPING_CASE_STUDY_PROMPT,
    thinkingContext: context,
    requestedPageCount: 2,
  });
  const prompt = buildSkillBackedPlanningPrompt({
    payload: {
      brief: SHIPPING_CASE_STUDY_PROMPT,
      pageCount: 2,
      generationMode: "standard",
      moduleUsageMode: "disabled",
      agentConfig: {
        command: "",
        model: "",
        cwd: "",
      },
      publishedModules: [],
      moduleManifestSignature: "",
    },
    skill: mockAnalysisSkill,
    styleProfile: neutralStyleProfile,
    heroSkill: mockHeroSkill,
    thinkingContext: context,
    thinkingSkill: null,
    briefSynthesis: synthesis,
  });

  assert.ok(prompt.includes("## AI workspace"));
  assertPromptOrder(prompt, "## User task brief", "## Brief synthesis");
  assertPromptOrder(prompt, "## Brief synthesis", "## Source material");
  assertPromptOrder(prompt, "## Source material", "## Deck planning intent");
  assertPromptOrder(prompt, "## Deck planning intent", "## Selected template contract");
  assertPromptOrder(prompt, "## Selected template contract", "## Active capability cards");
  assertPromptOrder(prompt, "## Active capability cards", "## Output rules");
  assertPromptOrder(prompt, "## User task brief", "Thinking mode:");
  assertPromptOrder(prompt, "## User task brief", "Analysis:");
  assert.equal(prompt.includes("Explicit 3D:"), false);
});

test("template contract workspace only lists semantic slots and preserves decoration separately", () => {
  const block = createTemplateContractWorkspaceBlock([mockTemplateModules[0]!]);
  const text = block.lines.join("\n");

  assert.match(text, /slot Claim: kind=ai-text/i);
  assert.match(text, /decoration Divider line: kind=line/i);
  assert.match(text, /locked template furniture/i);
});

test("deep valuation prompt uses the raw-brief-first page workspace", () => {
  const brief = "1 page Top Ibank level Codex Product Valuation";
  const inputs = segmentThinkingInputs(brief);
  const profile = resolveStudioComplexityProfile({
    brief,
    inputs,
  });
  const context = resolveDeckThinkingMode(brief, null, inputs);
  const synthesis = buildStudioBriefSynthesis({
    brief,
    thinkingContext: context,
    requestedPageCount: 1,
    complexityProfile: profile,
  });
  const prompt = buildPagePrompt({
    brief,
    deckTitle: "Codex valuation",
    page: {
      pageNumber: 1,
      pageTitle: "Codex valuation",
      goal: "What valuation frame best explains Codex?",
      story: "Codex should be framed through one valuation lens, its core value drivers, and one disciplined conclusion.",
    },
    allPages: [
      {
        pageNumber: 1,
        pageTitle: "Codex valuation",
        goal: "What valuation frame best explains Codex?",
        story: "Codex should be framed through one valuation lens, its core value drivers, and one disciplined conclusion.",
      },
    ],
    styleProfile: neutralStyleProfile,
    heroSkill: mockHeroSkill,
    heroModelIntent: neutralHeroIntent,
    thinkingContext: context,
    thinkingSkill: null,
    briefSynthesis: synthesis,
    complexityProfile: profile,
    moduleOptions: [],
    chartPageIntent: neutralChartIntent,
    pageArgument: {
      pageQuestion: "What valuation frame best explains Codex?",
      headlineClaim: "Codex should be framed through one valuation lens, its core value drivers, and one disciplined conclusion.",
      supportBullets: [
        "Anchor the page in valuation logic, not a generic company overview.",
        "Use one or two value drivers or scenario boundaries as the support structure.",
      ],
      evidenceCallouts: [],
      takeaway: "Keep the page disciplined: one valuation frame, at most two drivers, and no invented numbers.",
    },
  });

  assertPromptOrder(prompt, "## Raw brief", "## AI understanding");
  assertPromptOrder(prompt, "## AI understanding", "## Current page mission");
  assertPromptOrder(prompt, "## Current page mission", "## Visual thinking");
  assertPromptOrder(prompt, "## Visual thinking", "## Active capability cards");
  assertPromptOrder(prompt, "## Active capability cards", "## Output rules");
  assert.equal(prompt.includes("## Task rigor brief"), false);
  assert.equal(prompt.includes("## Renderer brief"), false);
  assert.equal(prompt.includes("## Proof plan"), false);
  assert.equal(prompt.includes("## Layout strategy"), false);
  assert.equal(prompt.includes("## Private layout plan"), false);
  assert.equal(prompt.includes("Brief focus"), false);
  assert.equal(prompt.includes("poster-claim"), false);
  assert.match(prompt, /Visual operator: freeform family (asymmetric-proof-field|evidence-wall|single-proof-canvas)/);
  assert.match(prompt, /Subject: Codex/);
});

test("skill-backed page prompt keeps a compact raw-brief-first workspace", () => {
  const context = resolveDeckThinkingMode(SHIPPING_CASE_STUDY_PROMPT, null);
  const synthesis = buildStudioBriefSynthesis({
    brief: SHIPPING_CASE_STUDY_PROMPT,
    thinkingContext: context,
    requestedPageCount: 2,
  });
  const prompt = buildSkillBackedPagePrompt({
    brief: SHIPPING_CASE_STUDY_PROMPT,
    deckTitle: "Robotics in shipping",
    page: {
      pageNumber: 1,
      pageTitle: "Case overview",
      pageIntent: "Frame the shipping robotics case and the operational challenge.",
      objective: "Frame the shipping robotics case and the operational challenge.",
      insight: "Manual shipping operations face labor, safety, and efficiency limits that robotics can relieve.",
      pageClass: "opening-core",
      densityBudget: {
        maxMajorRegions: 2,
        maxSupportBullets: 2,
        maxEvidenceBullets: 2,
        maxParagraphCharacters: 180,
        maxListItemCharacters: 96,
        maxListItemsPerList: 2,
        allowRightRail: true,
        allowFooterRail: false,
      },
      compositionHint: "Use one dominant story field with a compact supporting zone.",
      layout: "hero-proof",
      chartPriority: "none",
      evidenceIds: [],
      evidenceBundle: [
        "Shipping handles over 80% of international trade volume.",
        "80% to 90% of maritime accidents are linked to unsafe human behaviors or decision-making errors.",
      ],
      heroClaim: "Robotics matters because it addresses the shipping case's safety and efficiency problem directly.",
      supportBullets: [
        "Manual work stays expensive and high-risk in harsh shipping environments.",
        "Automation can absorb dangerous, repetitive, and timing-critical tasks.",
      ],
      evidenceBullets: [
        "Shipping moves more than 80% of global trade.",
        "IMO attributes most accidents to human behavior or decision errors.",
      ],
      takeaway: "The case should open on the operational challenge before diving into specific applications.",
      moduleBinding: null,
      chartSpec: null,
      fallbackReason: null,
    },
    allPages: [
      {
        pageNumber: 1,
        pageTitle: "Case overview",
        pageIntent: "Frame the shipping robotics case and the operational challenge.",
        objective: "Frame the shipping robotics case and the operational challenge.",
        insight: "Manual shipping operations face labor, safety, and efficiency limits that robotics can relieve.",
        pageClass: "opening-core",
        densityBudget: {
          maxMajorRegions: 2,
          maxSupportBullets: 2,
          maxEvidenceBullets: 2,
          maxParagraphCharacters: 180,
          maxListItemCharacters: 96,
          maxListItemsPerList: 2,
          allowRightRail: true,
          allowFooterRail: false,
        },
        compositionHint: "Use one dominant story field with a compact supporting zone.",
        layout: "hero-proof",
        chartPriority: "none",
        evidenceIds: [],
        evidenceBundle: [],
        heroClaim: "Robotics matters because it addresses the shipping case's safety and efficiency problem directly.",
        supportBullets: [],
        evidenceBullets: [],
        takeaway: "Open with the case challenge.",
        moduleBinding: null,
        chartSpec: null,
        fallbackReason: null,
      },
    ],
    skill: mockAnalysisSkill,
    thinkingContext: context,
    thinkingSkill: null,
    moduleOptions: mockTemplateModules,
    styleProfile: neutralStyleProfile,
    compositionBrief: {
      motif: "Use a restrained narrative rhythm.",
      rhythm: "Let the case move from challenge to application.",
      guidance: ["Prefer one dominant content field over a card wall."],
    },
    usedCompositionFingerprints: [],
    chartPageIntent: neutralChartIntent,
    heroSkill: mockHeroSkill,
    heroModelIntent: neutralHeroIntent,
    heroArtDirection: {
      materialDirection: "Neutral material direction",
      spatialMood: "Neutral spatial mood",
      annotationTone: "Neutral annotation tone",
      explanationDirection: "Neutral explanation direction",
      objectVocabulary: [],
      structuralLanguage: [],
      guidance: [],
    },
    heroReferenceLines: [],
    briefSynthesis: synthesis,
  });

  assert.ok(prompt.includes("## AI workspace"));
  assertPromptOrder(prompt, "## Raw brief", "## AI understanding");
  assertPromptOrder(prompt, "## AI understanding", "## Current page mission");
  assertPromptOrder(prompt, "## Current page mission", "## Visual thinking");
  assertPromptOrder(prompt, "## Visual thinking", "## Active capability cards");
  assertPromptOrder(prompt, "## Active capability cards", "## Output rules");
  assert.equal(prompt.includes("## Selected template contract"), false);
  assert.equal(prompt.includes("## Private layout plan"), false);
  assert.ok(prompt.includes("Visual operator: shape-first template Poster claim."));
  assert.equal(prompt.includes("template.third"), false);
  assert.equal(prompt.includes("## Available modules"), false);
  assert.equal(prompt.includes("Explicit 3D:"), false);
});

test("fallback page prompt uses the same compact workspace and filters 3D templates unless explicit", () => {
  const context = resolveDeckThinkingMode(SHIPPING_CASE_STUDY_PROMPT, null);
  const synthesis = buildStudioBriefSynthesis({
    brief: SHIPPING_CASE_STUDY_PROMPT,
    thinkingContext: context,
    requestedPageCount: 2,
  });
  const prompt = buildPagePrompt({
    brief: SHIPPING_CASE_STUDY_PROMPT,
    deckTitle: "Robotics in shipping",
    page: {
      pageNumber: 1,
      pageTitle: "Case overview",
      goal: "Frame the robotics-in-shipping case study.",
      story: "The case starts with a safety and efficiency challenge before showing applications.",
    },
    allPages: [
      {
        pageNumber: 1,
        pageTitle: "Case overview",
        goal: "Frame the robotics-in-shipping case study.",
        story: "The case starts with a safety and efficiency challenge before showing applications.",
      },
    ],
    styleProfile: neutralStyleProfile,
    heroSkill: mockHeroSkill,
    heroModelIntent: neutralHeroIntent,
    thinkingContext: context,
    thinkingSkill: null,
    briefSynthesis: synthesis,
    moduleOptions: [mockThreeDimensionalTemplateModule, ...mockTemplateModules],
    chartPageIntent: neutralChartIntent,
    pageArgument: {
      pageQuestion: "What case challenge makes robotics relevant to shipping?",
      headlineClaim: "Shipping robotics is a case response to safety, labor, and efficiency pressure.",
      supportBullets: ["Manual work is risky and costly.", "Robotics can absorb dangerous tasks."],
      evidenceCallouts: ["80%+ of trade volume moves by sea."],
      takeaway: "Start from the operational challenge, not a research-method frame.",
    },
  });

  assert.ok(prompt.includes("## AI workspace"));
  assertPromptOrder(prompt, "## Raw brief", "## AI understanding");
  assert.equal(prompt.includes("## Selected template contract"), false);
  assert.equal(prompt.includes("## Private layout plan"), false);
  assert.equal(prompt.includes("template.3d-cutaway"), false);
  assert.equal(prompt.includes("Explicit 3D:"), false);
  assert.ok(prompt.includes("Visual operator: shape-first template Poster claim."));
});

test("explicit 3D page prompt may include one 3D template and 3D card", () => {
  const explicitBrief = "Create a 1 page case-study with a 3D cutaway of a shipping robotics system.";
  const context = resolveDeckThinkingMode(explicitBrief, null);
  const synthesis = buildStudioBriefSynthesis({
    brief: explicitBrief,
    thinkingContext: context,
    requestedPageCount: 1,
  });
  const prompt = buildPagePrompt({
    brief: explicitBrief,
    deckTitle: "Robotics in shipping",
    page: {
      pageNumber: 1,
      pageTitle: "3D system cutaway",
      goal: "Explain the shipping robotics system shape.",
      story: "A single cutaway view clarifies the core system components.",
    },
    allPages: [
      {
        pageNumber: 1,
        pageTitle: "3D system cutaway",
        goal: "Explain the shipping robotics system shape.",
        story: "A single cutaway view clarifies the core system components.",
      },
    ],
    styleProfile: neutralStyleProfile,
    heroSkill: mockHeroSkill,
    heroModelIntent: explicitHeroIntent,
    heroArtDirection: {
      materialDirection: "Marine-grade metal and glass.",
      spatialMood: "Cutaway, precise, and restrained.",
      annotationTone: "Short technical labels.",
      explanationDirection: "Explain structure, not strategy.",
      objectVocabulary: ["robotics system"],
      structuralLanguage: ["cutaway"],
      guidance: ["Use one dominant model."],
    },
    heroReferenceLines: ["Use a cutaway object family only because the brief explicitly asks for 3D."],
    thinkingContext: context,
    thinkingSkill: null,
    briefSynthesis: synthesis,
    moduleOptions: [mockThreeDimensionalTemplateModule, ...mockTemplateModules],
    chartPageIntent: neutralChartIntent,
  });

  assert.ok(prompt.includes("Visual operator: explicit 3D hero page"));
  assert.ok(prompt.includes("Keep the hero object primary; do not flatten it into a generic two-column explainer."));
  assert.equal(prompt.includes("## Private layout plan"), false);
});

test("sparse OpenAI renderer prompt uses synthesis instead of fake evidence", () => {
  const brief = "1 page ppt for OpenAI";
  const context = resolveDeckThinkingMode(brief, null);
  const synthesis = buildStudioBriefSynthesis({
    brief,
    thinkingContext: context,
    requestedPageCount: 1,
  });
  const prompt = buildPagePrompt({
    brief,
    deckTitle: "OpenAI platform focus",
    page: {
      pageNumber: 1,
      pageTitle: "OpenAI platform focus",
      goal: "What should the audience understand about OpenAI?",
      story: "OpenAI is best framed as an AI platform company whose advantage comes from model capability, product reach, and ecosystem leverage.",
    },
    allPages: [
      {
        pageNumber: 1,
        pageTitle: "OpenAI platform focus",
        goal: "What should the audience understand about OpenAI?",
        story: "OpenAI is best framed as an AI platform company whose advantage comes from model capability, product reach, and ecosystem leverage.",
      },
    ],
    styleProfile: neutralStyleProfile,
    heroSkill: mockHeroSkill,
    heroModelIntent: neutralHeroIntent,
    thinkingContext: context,
    thinkingSkill: null,
    moduleOptions: mockTemplateModules,
    chartPageIntent: neutralChartIntent,
    briefSynthesis: synthesis,
    pageArgument: {
      pageQuestion: "What should the audience understand about OpenAI?",
      headlineClaim: "OpenAI is best framed as an AI platform company whose advantage comes from model capability, product reach, and ecosystem leverage.",
      supportBullets: [
        "Model capability gives the story a technical anchor.",
        "Product reach and developer ecosystem make the platform lens useful.",
      ],
      evidenceCallouts: [],
      takeaway: "Keep the page focused on the single OpenAI framing before adding secondary material.",
    },
  });

  assertPromptOrder(prompt, "## Raw brief", "## AI understanding");
  assertPromptOrder(prompt, "## AI understanding", "## Current page mission");
  assert.ok(
    prompt.includes("Do not fabricate citations, precise market sizes, valuation multiples, revenue numbers, or recent factual claims."),
  );
  assert.equal(prompt.includes("page ppt for OpenAI: 1"), false);
  assert.equal(prompt.includes("Evidence callouts: page ppt for OpenAI: 1"), false);
});

test("no-template sparse brief keeps freeform layout internal and visible only as a compact visual operator", () => {
  const brief = "1 page ppt for OpenAI";
  const context = resolveDeckThinkingMode(brief, null);
  const synthesis = buildStudioBriefSynthesis({
    brief,
    thinkingContext: context,
    requestedPageCount: 1,
  });
  const prompt = buildPagePrompt({
    brief,
    deckTitle: "OpenAI platform focus",
    page: {
      pageNumber: 1,
      pageTitle: "OpenAI platform focus",
      goal: "What should the audience understand about OpenAI?",
      story: "OpenAI is best framed as an AI platform company whose advantage comes from model capability, product reach, and ecosystem leverage.",
    },
    allPages: [
      {
        pageNumber: 1,
        pageTitle: "OpenAI platform focus",
        goal: "What should the audience understand about OpenAI?",
        story: "OpenAI is best framed as an AI platform company whose advantage comes from model capability, product reach, and ecosystem leverage.",
      },
    ],
    styleProfile: neutralStyleProfile,
    heroSkill: mockHeroSkill,
    heroModelIntent: neutralHeroIntent,
    thinkingContext: context,
    thinkingSkill: null,
    moduleOptions: [],
    chartPageIntent: neutralChartIntent,
    briefSynthesis: synthesis,
    pageArgument: {
      pageQuestion: "What should the audience understand about OpenAI?",
      headlineClaim: "OpenAI is best framed as an AI platform company whose advantage comes from model capability, product reach, and ecosystem leverage.",
      supportBullets: [
        "Model capability gives the story a technical anchor.",
        "Product reach and developer ecosystem make the platform lens useful.",
      ],
      evidenceCallouts: [],
      takeaway: "Keep the page focused on the single OpenAI framing before adding secondary material.",
    },
  });

  assertPromptOrder(prompt, "## AI understanding", "## Current page mission");
  assertPromptOrder(prompt, "## Current page mission", "## Visual thinking");
  assert.equal(prompt.includes("## Task rigor brief"), false);
  assert.equal(prompt.includes("## Proof plan"), false);
  assert.equal(prompt.includes("## Layout strategy"), false);
  assert.equal(prompt.includes("## Private layout plan"), false);
  assert.match(prompt, /Visual operator: freeform family (poster-claim|center-stage-figure)/);
  assert.ok(prompt.includes("If no template is active, do not default to a generic left/right split."));
  assert.ok(prompt.includes("Use Visual thinking privately before writing HTML."));
});

test("no-template case-study prompt prefers story progression freeform layout", () => {
  const context = resolveDeckThinkingMode(SHIPPING_CASE_STUDY_PROMPT, null);
  const synthesis = buildStudioBriefSynthesis({
    brief: SHIPPING_CASE_STUDY_PROMPT,
    thinkingContext: context,
    requestedPageCount: 2,
  });
  const prompt = buildPagePrompt({
    brief: SHIPPING_CASE_STUDY_PROMPT,
    deckTitle: "Robotics in shipping",
    page: {
      pageNumber: 1,
      pageTitle: "Case overview",
      goal: "What is the case context and challenge for robotics in shipping?",
      story: "Shipping robotics is a case response to safety, labor, and efficiency pressure.",
    },
    allPages: [
      {
        pageNumber: 1,
        pageTitle: "Case overview",
        goal: "What is the case context and challenge for robotics in shipping?",
        story: "Shipping robotics is a case response to safety, labor, and efficiency pressure.",
      },
      {
        pageNumber: 2,
        pageTitle: "Application outcome",
        goal: "What changed, and what lesson does robotics in shipping support?",
        story: "The case resolves around safer and more reliable operating flow.",
      },
    ],
    styleProfile: neutralStyleProfile,
    heroSkill: mockHeroSkill,
    heroModelIntent: neutralHeroIntent,
    thinkingContext: context,
    thinkingSkill: null,
    moduleOptions: [],
    chartPageIntent: neutralChartIntent,
    briefSynthesis: synthesis,
    pageArgument: {
      pageQuestion: "What is the case context and challenge for robotics in shipping?",
      headlineClaim: "Shipping robotics is a case response to safety, labor, and efficiency pressure.",
      supportBullets: ["Manual work is risky and costly.", "Robotics can absorb dangerous tasks."],
      evidenceCallouts: ["80%+ of trade volume moves by sea."],
      takeaway: "Start from the operational challenge, not a research-method frame.",
    },
  });

  assert.equal(prompt.includes("## Private layout plan"), false);
  assert.match(prompt, /Visual operator: freeform family (case-timeline|vertical-story-strip|asymmetric-proof-field)/);
  assert.equal(prompt.includes("Executive summary"), false);
});

test("deep academic result prompts keep deep layout internal while preserving a research-grade family", () => {
  const brief = "Create a 3-page research presentation about a retrieval experiment with method, results, discussion, and limitations.";
  const context = resolveDeckThinkingMode(brief, null);
  const synthesis = buildStudioBriefSynthesis({
    brief,
    thinkingContext: context,
    requestedPageCount: 3,
  });
  const prompt = buildPagePrompt({
    brief,
    deckTitle: "Retrieval experiment",
    page: {
      pageNumber: 2,
      pageTitle: "Result interpretation",
      goal: "What result pattern anchors the retrieval experiment?",
      story: "The result should be interpreted cautiously through the method and limitations.",
    },
    allPages: [
      { pageNumber: 1, pageTitle: "Research question", goal: "What question does the study answer?", story: "The study starts from one retrieval question." },
      { pageNumber: 2, pageTitle: "Result interpretation", goal: "What result pattern anchors the retrieval experiment?", story: "The result should be interpreted cautiously through the method and limitations." },
      { pageNumber: 3, pageTitle: "Interpretation and next work", goal: "What does the result mean?", story: "Interpretation stays careful and bounded." },
    ],
    styleProfile: neutralStyleProfile,
    heroSkill: mockHeroSkill,
    heroModelIntent: neutralHeroIntent,
    thinkingContext: context,
    thinkingSkill: null,
    moduleOptions: [],
    chartPageIntent: neutralChartIntent,
    briefSynthesis: synthesis,
    pageArgument: {
      pageQuestion: "What result pattern anchors the retrieval experiment?",
      headlineClaim: "The result should be interpreted cautiously through the method and limitations.",
      supportBullets: ["Separate method from interpretation.", "Keep limitations visible."],
      evidenceCallouts: [],
      takeaway: "Do not turn the research page into a recommendation memo.",
    },
  });

  assert.ok(prompt.includes("## AI understanding"));
  assert.ok(prompt.includes("## Visual thinking"));
  assert.ok(prompt.includes("## Current page mission"));
  assert.equal(prompt.includes("## Task rigor brief"), false);
  assert.equal(prompt.includes("## Proof plan"), false);
  assert.equal(prompt.includes("## Layout strategy"), false);
  assert.equal(prompt.includes("## Private layout plan"), false);
  assert.match(prompt, /Visual operator: freeform family (annotation-stage|single-proof-canvas|asymmetric-proof-field)/);
});

test("chart-first no-template prompt does not override chart with freeform layout", () => {
  const brief = "Create a 1 page ppt about OpenAI with one chart.";
  const context = resolveDeckThinkingMode(brief, null);
  const synthesis = buildStudioBriefSynthesis({
    brief,
    thinkingContext: context,
    requestedPageCount: 1,
  });
  const prompt = buildPagePrompt({
    brief,
    deckTitle: "OpenAI chart",
    page: {
      pageNumber: 1,
      pageTitle: "OpenAI chart focus",
      goal: "Show one chart-first read about OpenAI.",
      story: "The page should stay chart-first.",
    },
    allPages: [
      {
        pageNumber: 1,
        pageTitle: "OpenAI chart focus",
        goal: "Show one chart-first read about OpenAI.",
        story: "The page should stay chart-first.",
      },
    ],
    styleProfile: neutralStyleProfile,
    heroSkill: mockHeroSkill,
    heroModelIntent: neutralHeroIntent,
    thinkingContext: context,
    thinkingSkill: null,
    moduleOptions: [],
    chartPageIntent: {
      enabled: true,
      pressureMode: "single-dominant-figure",
      question: "What is the chart-first read?",
      explanationBudget: ["Keep interpretation short."],
      reason: "explicit chart request",
    },
    briefSynthesis: synthesis,
  });

  assert.equal(prompt.includes("## Private layout plan"), false);
  assert.ok(prompt.includes("Visual operator: chart-first page with one dominant figure"));
  assert.equal(prompt.includes("Visual operator: freeform family"), false);
});

test("page validation rejects visible workspace scaffold labels", () => {
  const html = `<!DOCTYPE html><html><body><section class="page" data-page-number="1" data-page-title="Case overview" style="width:1600px;height:900px"><h1>Case overview</h1><div>Support bullet 1</div><p>Headline claim: the page is using the supplied brief.</p></section></body></html>`;

  assert.throws(
    () =>
      validateGeneratedPageHtml({
        html,
        expectedPageNumber: 1,
        expectedPageTitle: "Case overview",
      }),
    /workspace scaffolding/i,
  );
});

test("page validation still allows audience-facing evidence labels", () => {
  const html = `<!DOCTYPE html><html><body><section class="page" data-page-number="1" data-page-title="Case overview" style="width:1600px;height:900px"><h1>Case overview</h1><div>Evidence 1</div><p>Shipping robotics reduces inspection risk for crews.</p></section></body></html>`;

  const page = validateGeneratedPageHtml({
    html,
    expectedPageNumber: 1,
    expectedPageTitle: "Case overview",
  });

  assert.equal(page.pageTitle, "Case overview");
});
