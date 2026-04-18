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

test("preflight prompt respects Chinese six-page requests even with one-page-per-slide constraints", () => {
  const brief = `做一份 6 页英文 PPT。
第 1 页讲为什么值得做。
第 2 页讲切换架构。
第 3 页讲适用场景。
第 4 页讲 data needed。
第 5 页讲 migration risks。
第 6 页讲 execution plan。
one page, one claim.`;
  const prompt = buildStudioPreflightPrompt({
    brief,
  });

  assert.match(prompt, /Requested page count: 6\./);
});

test("preflight prompt supports Chinese number words for page counts", () => {
  const brief = "生成两页ppt，第一页讲BCG矩阵，第二页讲3D建模，一页一结论。";
  const prompt = buildStudioPreflightPrompt({
    brief,
  });

  assert.match(prompt, /Requested page count: 2\./);
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

test("preflight normalizes three-dimensional capability kinds to explicit 3d", () => {
  const brief = "Create a one-page 3D hero model page.";
  const plan = parseStudioPreflightPlan({
    text: JSON.stringify({
      rawBrief: brief,
      subject: "AI-native work",
      deliverable: "1-page PPT",
      pageCount: 1,
      audienceOrQualityBar: null,
      coreTask: "Present one 3D concept page.",
      evidencePolicy: {
        tier: "axiomatic/common-knowledge",
        summary: "Use conceptual framing only.",
        lines: ["Do not invent metrics."],
      },
      pageMissions: [],
      visualThinking: {
        dominantVisualAnchor: "hero object",
        readingPath: "object first",
        regionStrategy: "hero object first",
        densityPosture: "sparse",
        avoidPattern: "flat cards",
      },
      capabilityActivations: [
        { kind: "three-dimensional", reason: "The brief explicitly asks for 3D.", lines: ["Use a fabricated hero object."] },
        { kind: "hero model", reason: "The page needs a hero model.", lines: ["Keep it object-first."] },
      ],
      assumptionPolicy: ["Keep assumptions explicit."],
    }),
    brief,
    requestedPageCount: 1,
  });

  assert.deepEqual(
    plan.capabilityActivations.map((item) => item.kind),
    ["3d", "3d"],
  );
});

test("generic architecture wording does not trigger fallback 3d activation", () => {
  const plan = buildFallbackStudioPreflightPlan({
    brief: "Create a one-page architecture overview of an AI platform.",
    requestedPageCount: 1,
  });

  assert.equal(plan.capabilityActivations.some((item) => item.kind === "3d"), false);
});

test("preflight parser rewrites repeated deck-intent missions into page-scoped missions from explicit page segments", () => {
  const brief = "生成两页ppt , 第一页上BCG矩阵，讲苹果这个公司，第二页是最赚钱产品的3D建模，解释为什么赚钱？";
  const summary = JSON.stringify({
    rawBrief: brief,
    subject: "Apple and the profit logic behind its most profitable product",
    deliverable: "2-page PPT",
    pageCount: 2,
    audienceOrQualityBar: null,
    coreTask:
      "Understand a requested two-page presentation: page 1 uses a BCG matrix to frame Apple as a company, and page 2 uses a 3D model of its most profitable product to explain why it makes so much money.",
    evidencePolicy: {
      tier: "explicit assumption",
      summary: "Use explicit assumptions.",
      lines: ["Do not invent metrics."],
    },
    pageMissions: [
      {
        pageNumber: 1,
        title: "Request Understanding",
        mission: "Unify the two requested slides into one clear presentation intent.",
        headlineClaim:
          "The presentation is about positioning Apple strategically and then explaining, through a 3D product view, why its top-earning product is so profitable.",
        supportPoints: [
          "Slide 1 is explicitly BCG-matrix-first and company-level.",
          "Slide 2 is explicitly 3D-model-first and product-level.",
        ],
        evidenceNotes: ["Keep assumptions explicit."],
        preferredVisual: "poster-claim",
        missionScope: "deck",
        structureCue: null,
      },
      {
        pageNumber: 2,
        title: "Request Understanding",
        mission: "Unify the two requested slides into one clear presentation intent.",
        headlineClaim:
          "The presentation is about positioning Apple strategically and then explaining, through a 3D product view, why its top-earning product is so profitable.",
        supportPoints: [
          "Slide 1 is explicitly BCG-matrix-first and company-level.",
          "Slide 2 is explicitly 3D-model-first and product-level.",
        ],
        evidenceNotes: ["Keep assumptions explicit."],
        preferredVisual: "poster-claim",
        missionScope: "deck",
        structureCue: null,
      },
    ],
    visualThinking: {
      dominantVisualAnchor: "storyboard",
      readingPath: "left to right",
      regionStrategy: "split the two ideas",
      densityPosture: "lean",
      avoidPattern: "generic opener",
    },
    capabilityActivations: [],
    assumptionPolicy: ["Keep assumptions explicit."],
  });

  const plan = parseStudioPreflightPlan({
    text: summary,
    brief,
    requestedPageCount: 2,
  });

  assert.equal(plan.pageMissions.length, 2);
  assert.equal(plan.pageMissions[0]?.missionScope, "page");
  assert.equal(plan.pageMissions[1]?.missionScope, "page");
  assert.equal(plan.pageMissions[0]?.structureCue, "matrix");
  assert.match(plan.pageMissions[0]?.preferredVisual ?? "", /matrix-first|quadrant/i);
  assert.notEqual(plan.pageMissions[0]?.mission, plan.pageMissions[1]?.mission);
  assert.match(
    `${plan.pageMissions[1]?.title} ${plan.pageMissions[1]?.mission} ${plan.pageMissions[1]?.headlineClaim}`,
    /3d|建模/i,
  );
});

test("preflight parser synthesizes missing later page missions instead of reusing page one", () => {
  const brief = `做一份 6 页英文 PPT。
第 1 页讲为什么值得做。
第 2 页讲切换架构。
第 3 页讲适用场景。
第 4 页讲 data needed。
第 5 页讲 migration risks。
第 6 页讲 next-week execution plan。`;
  const summary = JSON.stringify({
    rawBrief: brief,
    subject: "Why our Studio should support switchable providers",
    deliverable: "6-page PPT",
    pageCount: 6,
    audienceOrQualityBar: null,
    coreTask: "Explain the case for switchable providers.",
    evidencePolicy: {
      tier: "axiomatic/common-knowledge",
      summary: "Use common-sense framing only.",
      lines: ["Do not fabricate metrics."],
    },
    pageMissions: [
      {
        pageNumber: 1,
        title: "Why This Is Worth Doing",
        mission: "Explain why the work matters.",
        headlineClaim: "Switchable providers make Studio more resilient.",
        supportPoints: ["Different providers fit different workflows."],
        evidenceNotes: ["Use qualitative framing."],
        preferredVisual: "poster-claim",
        missionScope: "page",
        structureCue: null,
      },
    ],
    visualThinking: {
      dominantVisualAnchor: "one claim",
      readingPath: "claim to proof",
      regionStrategy: "one main region",
      densityPosture: "light",
      avoidPattern: "filler cards",
    },
    capabilityActivations: [],
    assumptionPolicy: [],
  });

  const plan = parseStudioPreflightPlan({
    text: summary,
    brief,
    requestedPageCount: 6,
  });

  assert.equal(plan.pageMissions.length, 6);
  assert.equal(plan.pageMissions[1]?.pageNumber, 2);
  assert.notEqual(plan.pageMissions[0]?.title, plan.pageMissions[1]?.title);
  assert.equal(plan.pageMissions[1]?.missionScope, "page");
});
