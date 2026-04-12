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
