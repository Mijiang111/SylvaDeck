import test from "node:test";
import assert from "node:assert/strict";
import { resolveDeckStyleProfile } from "../industry-style.js";
import { buildPagePrompt } from "./core.js";
import { resolveStudioGenerationPreparation } from "./eval.js";

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

test("page workspace stays raw-brief-first and disableLayoutPlanningBlock suppresses old layout scaffolding", () => {
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

  assert.match(basePrompt, /## AI understanding/);
  assert.match(basePrompt, /## Current page mission/);
  assert.match(basePrompt, /## Visual thinking/);
  assert.match(basePrompt, /## Active capability cards/);
  assert.equal(basePrompt.includes("## Layout strategy"), false);
  assert.equal(basePrompt.includes("## Private layout plan"), false);
  assert.doesNotMatch(disabledPrompt, /## Layout strategy/);
  assert.doesNotMatch(disabledPrompt, /## Private layout plan/);
  assert.match(disabledPrompt, /## AI understanding/);
});
