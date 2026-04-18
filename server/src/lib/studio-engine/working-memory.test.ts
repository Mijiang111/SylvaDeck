import test from "node:test";
import assert from "node:assert/strict";
import { assessStudioWorkingMemory, buildStudioWorkingMemory } from "./working-memory.js";
import { segmentThinkingInputs } from "./thinking-mode.js";
import type { StudioWorkingMemory } from "./contracts.js";

function resolveWorkingMemory(brief: string, requestedPageCount?: number) {
  return buildStudioWorkingMemory({
    brief,
    inputs: segmentThinkingInputs(brief),
    requestedPageCount,
  });
}

test("working memory separates valuation object, audience bar, and deliverable", () => {
  const brief = "1 page ppt of Top Financial Institution like JP Morgan to do the valuation of Codex";
  const memory = resolveWorkingMemory(brief, 1);

  assert.equal(memory.primaryObject, "Codex");
  assert.equal(memory.userOperation, "value");
  assert.equal(memory.audienceBar, "Top Financial Institution like JP Morgan");
  assert.equal(memory.deliverable, "1-page PPT");
  assert.equal(memory.evidenceRegime, "sparse-no-hard-data");
  assert.equal(memory.acceptanceResult.pass, true);
});

test("working memory keeps case study object intact", () => {
  const memory = resolveWorkingMemory("2 page ppt for case study of OpenAI", 2);

  assert.equal(memory.primaryObject, "OpenAI");
  assert.equal(memory.userOperation, "narrate");
  assert.equal(memory.thinkingModeHint, "case-study");
});

test("working memory derives a six-page deliverable from Chinese briefs with per-page constraints", () => {
  const brief = `做一份 6 页英文 PPT。
第 1 页讲为什么值得做。
第 2 页讲切换架构。
第 3 页讲适用场景。
第 4 页讲 data needed。
第 5 页讲 migration risks。
第 6 页讲 execution plan。
one page, one claim.`;
  const memory = resolveWorkingMemory(brief);

  assert.equal(memory.deliverable, "6-page PPT");
});

test("working memory supports Chinese number-word page counts", () => {
  const memory = resolveWorkingMemory("生成两页PPT。第一页讲BCG矩阵，第二页讲3D建模。一页一结论。");

  assert.equal(memory.deliverable, "2-page PPT");
});

test("working memory maps research readout and architecture review into the same minimal skeleton", () => {
  const research = resolveWorkingMemory(
    "Create a research readout on retrieval latency with method, result, and limitation.",
  );
  const architecture = resolveWorkingMemory(
    "Create an architecture review of a low-latency retrieval serving stack.",
  );

  assert.equal(research.userOperation, "synthesize");
  assert.equal(research.primaryObject, "retrieval latency with method, result, and limitation");
  assert.equal(architecture.userOperation, "critique");
  assert.equal(architecture.primaryObject, "a low-latency retrieval serving stack");
});

test("working memory supports compare tasks without collapsing into a single generic object", () => {
  const memory = resolveWorkingMemory("Compare Codex vs Claude in a 1 page ppt", 1);

  assert.equal(memory.userOperation, "compare");
  assert.match(memory.primaryObject, /Codex vs Claude/i);
});

test("acceptance checks fail when the audience bar leaks into the primary object", () => {
  const invalidMemory = {
    rawBrief: "placeholder",
    primaryObject: "of Top Financial Institution like JP Morgan to",
    userOperation: "value",
    deliverable: "1-page PPT",
    audienceBar: "Top Financial Institution like JP Morgan",
    evidenceRegime: "sparse-no-hard-data",
    hardConstraints: [],
    unknowns: [],
    currentPageMission: ["Value the object."],
    acceptanceChecks: [],
    slotConfidence: {
      primaryObject: "low",
      userOperation: "high",
      deliverable: "high",
      audienceBar: "high",
      evidenceRegime: "high",
    },
    sourceMaterialDigest: [],
    evidenceBoundary: [],
    internalOperators: [],
    semanticCorrection: {
      attempted: false,
      pass: false,
      reason: "not tested",
      correctedSlots: [],
    },
    acceptanceResult: {
      pass: true,
      reasons: [],
    },
    thinkingModeHint: null,
  } satisfies StudioWorkingMemory;

  const result = assessStudioWorkingMemory(invalidMemory);
  assert.equal(result.pass, false);
  assert.equal(
    result.reasons.some((reason) => /audience bar|connector|implausible/i.test(reason)),
    true,
  );
});

test("working memory keeps awkward valuation phrasing centered on the real object", () => {
  const brief = "1 page Top Ibank level of Codex Product Valuation";
  const memory = resolveWorkingMemory(brief, 1);

  assert.equal(memory.primaryObject, "Codex");
  assert.equal(memory.userOperation, "value");
  assert.equal(memory.semanticCorrection.pass, true);
  assert.equal(memory.acceptanceResult.pass, true);
});

test("working memory detects brain-to-deck from messy long notes and synthesizes", () => {
  const brief = `Hey so we had this all-hands last Tuesday and honestly it was kind of a mess but there were some good numbers in there. Sarah from product said MAU is up 18% quarter over quarter which is nice, but churn also ticked up to 4.2% which is worrying. The new onboarding flow seems to be helping activation—Day-1 retention improved from 31% to 38% according to the experiment dashboard. Tom raised concerns about the enterprise pipeline; we have 14 POCs running but only 3 committed to expand so far. Marketing wants to rebrand the landing page around "speed" instead of "simplicity" because the user research showed speed is the top buying criteria for mid-market buyers. Design has three explorations but nothing approved yet. Can you turn this mess into a one-page summary deck we can share with the board?`;

  const memory = resolveWorkingMemory(brief, 1);

  assert.equal(memory.userOperation, "synthesize");
  assert.equal(memory.thinkingModeHint, "brain-to-deck");
  assert.ok(memory.sourceMaterialDigest.length >= 4, "should extract core entities into sourceMaterialDigest");
  assert.ok(
    memory.sourceMaterialDigest.some((line) => /MAU|churn|retention|pipeline|POC|rebrand|speed/i.test(line)),
    "sourceMaterialDigest should capture key data points",
  );
});
