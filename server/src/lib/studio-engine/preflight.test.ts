import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFallbackStudioPreflightPlan,
  buildPreflightEvidenceInput,
  buildStudioPreflightPrompt,
  parseStudioPreflightPlan,
} from "./preflight.js";

test("fallback preflight keeps the raw brief intact and separates subject from audience bar", () => {
  const brief =
    "1 page Top Ibank level product valuation of Codex for a top financial institution like JP Morgan.";
  const plan = buildFallbackStudioPreflightPlan({
    brief,
    requestedPageCount: 1,
  });

  assert.equal(plan.rawBrief, brief);
  assert.equal(plan.subject, "Codex");
  assert.match(plan.deliverable, /1-page ppt/i);
  assert.match(plan.audienceOrQualityBar ?? "", /top ibank level|jp morgan/i);
  assert.match(plan.coreTask, /valuation/i);
  assert.equal(plan.evidencePolicy.tier, "axiomatic/common-knowledge");
});

test("preflight parser prefers the model JSON but keeps the original raw brief", () => {
  const brief = "2 page case study of OpenAI";
  const summary = `Here is the JSON:
  {
    "rawBrief": "ignored rewritten brief",
    "subject": "OpenAI",
    "deliverable": "2-page PPT",
    "pageCount": 2,
    "audienceOrQualityBar": null,
    "coreTask": "Tell a focused case story about OpenAI.",
    "evidencePolicy": {
      "tier": "explicit assumption",
      "summary": "No hard evidence supplied.",
      "lines": ["Use explicit assumptions when detail is missing."]
    },
    "pageMissions": [
      {
        "pageNumber": 1,
        "title": "Case setup",
        "mission": "Frame the case.",
        "headlineClaim": "OpenAI works best as one focused case.",
        "supportPoints": ["Keep the opener tight."],
        "evidenceNotes": ["Do not fake data."],
        "preferredVisual": "vertical-story-strip"
      }
    ],
    "visualThinking": {
      "dominantVisualAnchor": "story opener",
      "readingPath": "setup to challenge",
      "regionStrategy": "one main story field",
      "densityPosture": "light",
      "avoidPattern": "generic memo framing"
    },
    "capabilityActivations": [
      { "kind": "style", "reason": "Keep a coherent visual system.", "lines": ["Use one restrained visual system."] }
    ],
    "assumptionPolicy": ["Keep assumptions explicit."]
  }`;

  const plan = parseStudioPreflightPlan({
    text: summary,
    brief,
    requestedPageCount: 2,
  });

  assert.equal(plan.rawBrief, brief);
  assert.equal(plan.subject, "OpenAI");
  assert.equal(plan.pageCount, 2);
  assert.equal(plan.evidencePolicy.tier, "explicit assumption");
  assert.equal(plan.pageMissions[0]?.title, "Case setup");
  assert.equal(plan.visualThinking.dominantVisualAnchor, "story opener");
});

test("preflight prompt keeps the raw brief whole instead of asking for segmented inputs", () => {
  const brief = "1 page ppt for OpenAI";
  const prompt = buildStudioPreflightPrompt({
    brief,
    requestedPageCount: 1,
  });

  assert.match(prompt, /Read the raw brief as a whole/i);
  assert.doesNotMatch(prompt, /task\/source\/global/i);
  assert.match(prompt, /Raw brief:/i);
  assert.match(prompt, /1 page ppt for OpenAI/);
});

test("preflight evidence input only forwards the raw brief when the tier is source-backed", () => {
  const brief = "Revenue: $10M\nMargin: 20%";
  const sparse = buildFallbackStudioPreflightPlan({
    brief: "1 page ppt for OpenAI",
    requestedPageCount: 1,
  });
  const sourced = parseStudioPreflightPlan({
    text: JSON.stringify({
      rawBrief: brief,
      subject: "OpenAI",
      deliverable: "1-page PPT",
      pageCount: 1,
      audienceOrQualityBar: null,
      coreTask: "Explain OpenAI.",
      evidencePolicy: {
        tier: "source-backed",
        summary: "Use the supplied metrics.",
        lines: ["Use only the supplied metrics."],
      },
      pageMissions: [],
      visualThinking: {
        dominantVisualAnchor: "one proof field",
        readingPath: "claim to proof",
        regionStrategy: "one main field",
        densityPosture: "light",
        avoidPattern: "filler cards",
      },
      capabilityActivations: [],
      assumptionPolicy: [],
    }),
    brief,
    requestedPageCount: 1,
  });

  assert.equal(buildPreflightEvidenceInput({ brief, preflight: sparse }), "");
  assert.equal(buildPreflightEvidenceInput({ brief, preflight: sourced }), brief);
});
