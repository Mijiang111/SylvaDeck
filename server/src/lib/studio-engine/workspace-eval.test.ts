import test from "node:test";
import assert from "node:assert/strict";
import { resolveDeckStyleProfile } from "../industry-style.js";
import { buildPagePrompt } from "./core.js";
import { preferredDeepFamilies } from "./complexity.js";
import { resolveStudioGenerationPreparation } from "./eval.js";
import { resolveFreeformLayoutPlan } from "./freeform-layout.js";

const SHIPPING_CASE_PROMPT = `2 page ppt for case-study of application of Robotic in Shipping
\`\`\`{
As the cornerstone of global trade, the shipping industry handles over 80% of international trade volume. This report will review robotics applications in shipping and analyze typical case practices.
}\`\`\``;

const VALUATION_PROMPT = "1 page Top Ibank level Codex Product Valuation";

test("eval override can force thinking mode without mutating task inputs", () => {
  const preparation = resolveStudioGenerationPreparation({
    brief: SHIPPING_CASE_PROMPT,
    requestedPageCount: 2,
    evalOverrides: {
      forceThinkingMode: "neutral",
    },
  });

  assert.equal(preparation.thinkingContext.mode, "neutral");
  assert.match(preparation.thinkingContext.reason, /Eval override forced thinking mode/i);
  assert.equal(preparation.briefSynthesis.thinkingMode, "neutral");
});

test("eval override can force fast lane and remove task grammar packs", () => {
  const preparation = resolveStudioGenerationPreparation({
    brief: VALUATION_PROMPT,
    requestedPageCount: 1,
    evalOverrides: {
      forceWorkloadLane: "fast",
      disableTaskGrammarPacks: true,
    },
  });

  assert.equal(preparation.complexityProfile.workloadLane, "fast");
  assert.equal(preparation.complexityProfile.rigorLevel, "standard");
  assert.equal(preparation.complexityProfile.taskGrammarPacks.length, 0);
  assert.equal(preparation.complexityProfile.specializedArtifact, null);
  assert.equal(preparation.briefSynthesis.deliverable, "PPT");
  assert.equal(preparation.briefSynthesis.structuredSparseMode, false);
});

test("long-form page budgets promote the preparation lane to deep", () => {
  const preparation = resolveStudioGenerationPreparation({
    brief:
      "Create a 10 page long-form deck on enterprise AI rollout. Cover operating model, governance, adoption risks, capability roadmap, measurement, and executive implications.",
    requestedPageCount: 10,
  });

  assert.equal(preparation.complexityProfile.workloadLane, "deep");
  assert.equal(preparation.complexityProfile.rigorLevel, "high-spec");
  assert.ok(
    preparation.complexityProfile.taskGrammarPacks.some((pack) => pack.id === "unstructured-synthesis"),
    "long-form budgets should add an explicit synthesis grammar pack",
  );
  assert.match(preparation.complexityProfile.reason, /Long-form page budget/i);
});

test("page workspace stays creative-brief-first and disableLayoutPlanningBlock suppresses old layout scaffolding", () => {
  const preparation = resolveStudioGenerationPreparation({
    brief: VALUATION_PROMPT,
    requestedPageCount: 1,
  });
  const styleProfile = resolveDeckStyleProfile({
    brief: VALUATION_PROMPT,
  }).profile;
  const page = {
    pageNumber: 1,
    pageTitle: "Codex valuation frame",
    goal: "What valuation frame best explains Codex?",
    story: "Codex valuation turns on a small set of drivers and scenario boundaries.",
  };

  const basePrompt = buildPagePrompt({
    brief: VALUATION_PROMPT,
    deckTitle: "Codex valuation frame",
    page,
    allPages: [page],
    styleProfile,
    thinkingContext: preparation.thinkingContext,
    briefSynthesis: preparation.briefSynthesis,
    complexityProfile: preparation.complexityProfile,
    pageArgument: {
      pageQuestion: page.goal,
      headlineClaim: page.story,
      supportBullets: ["Value depends on a small set of product and monetization drivers."],
      evidenceCallouts: ["No hard numbers supplied."],
      takeaway: "Keep the valuation qualitative if hard data is absent.",
    },
  });
  const disabledPrompt = buildPagePrompt({
    brief: VALUATION_PROMPT,
    deckTitle: "Codex valuation frame",
    page,
    allPages: [page],
    styleProfile,
    thinkingContext: preparation.thinkingContext,
    briefSynthesis: preparation.briefSynthesis,
    complexityProfile: preparation.complexityProfile,
    evalOverrides: {
      disableLayoutPlanningBlock: true,
    },
    pageArgument: {
      pageQuestion: page.goal,
      headlineClaim: page.story,
      supportBullets: ["Value depends on a small set of product and monetization drivers."],
      evidenceCallouts: ["No hard numbers supplied."],
      takeaway: "Keep the valuation qualitative if hard data is absent.",
    },
  });

  assert.match(basePrompt, /## Creative brief/);
  assert.match(basePrompt, /## Page intent/);
  assert.match(basePrompt, /## Primary visual/);
  assert.match(basePrompt, /## Evidence and boundaries/);
  assert.match(basePrompt, /## Active capability cards/);
  assert.equal(basePrompt.includes("## Layout strategy"), false);
  assert.equal(basePrompt.includes("## Private layout plan"), false);
  assert.match(basePrompt, /institutional evidence-page composition/);
  assert.match(basePrompt, /audience-facing labels rather than meta-copy/);
  assert.doesNotMatch(disabledPrompt, /## Layout strategy/);
  assert.doesNotMatch(disabledPrompt, /## Private layout plan/);
  assert.match(disabledPrompt, /## Evidence and boundaries/);
});

test("brain-to-deck auto-detect forces deep lane, evidence-wall layout, and rejects 3d", () => {
  const brief = `Hey so we had this all-hands last Tuesday and honestly it was kind of a mess but there were some good numbers in there. Sarah from product said MAU is up 18% quarter over quarter which is nice, but churn also ticked up to 4.2% which is worrying. The new onboarding flow seems to be helping activation—Day-1 retention improved from 31% to 38% according to the experiment dashboard. Tom raised concerns about the enterprise pipeline; we have 14 POCs running but only 3 committed to expand so far. Marketing wants to rebrand the landing page around "speed" instead of "simplicity" because the user research showed speed is the top buying criteria for mid-market buyers. Design has three explorations but nothing approved yet. Can you turn this mess into a one-page summary deck we can share with the board?`;

  const preparation = resolveStudioGenerationPreparation({
    brief,
    requestedPageCount: 1,
  });

  assert.equal(preparation.workingMemory.userOperation, "synthesize");
  assert.equal(preparation.workingMemory.thinkingModeHint, "brain-to-deck");
  assert.equal(preparation.thinkingContext.mode, "brain-to-deck");
  assert.equal(preparation.complexityProfile.workloadLane, "deep");
  assert.ok(
    preparation.complexityProfile.taskGrammarPacks.some((p) => p.id === "strict-style-enforcement"),
    "should inject strict-style-enforcement pack",
  );

  const deepFamilies = preferredDeepFamilies(preparation.complexityProfile);
  assert.ok(deepFamilies.includes("evidence-wall"), "deep families should include evidence-wall");

  const freeformPlan = resolveFreeformLayoutPlan({
    selectedTemplateCount: 0,
    mode: "brain-to-deck",
    pageNumber: 1,
    pageCount: 1,
    supportCount: 3,
    evidenceCount: 2,
    synthesis: preparation.briefSynthesis,
    complexityProfile: preparation.complexityProfile,
    usedCompositionFingerprints: [],
  });

  assert.ok(freeformPlan, "should produce a freeform layout plan");
  assert.ok(
    freeformPlan!.avoidPattern.some((line) => /no\s+3d|no\s+shadows|strict\s+action-titles/i.test(line)),
    "avoidPattern should reject 3d, shadows, and enforce action titles",
  );
});
