import test from "node:test";
import assert from "node:assert/strict";
import { resolveDeckStyleProfile } from "../industry-style.js";
import { buildPagePrompt } from "./core.js";
import { resolveStudioGenerationPreparation } from "./eval.js";
import {
  buildDeterministicStudioPreflightPlan,
  buildPreflightEvidenceInput,
  resolveStudioTaskRoute,
} from "./preflight.js";
import { generateStudioReportRequestSchema, type DeckExportContract } from "./schemas.js";

function buildExternalMatrixExportContract(pageCount = 1): DeckExportContract {
  return {
    version: 1,
    pages: Array.from({ length: pageCount }, (_, index) => {
      const pageNumber = index + 1;
      const objectId = `p${pageNumber}-external-matrix`;
      return {
        pageNumber,
        pageStory: `External story ${pageNumber}`,
        primaryVisualObject: "Externally supplied matrix",
        objects: [
          {
            objectId,
            pageNumber,
            pageStory: `External story ${pageNumber}`,
            primaryVisualObject: "Externally supplied matrix",
            objectKind: "matrix",
            dataContract: {
              expected: "external-matrix",
            },
            renderTarget: "editable-shapes",
            ownershipScope: {
              rootId: objectId,
              ownsText: true,
              ownsShapes: true,
              ownsSvg: true,
              childRoles: ["row", "column", "cell"],
            },
            forbiddenInterpretation: ["native-table"],
          },
        ],
      };
    }),
  };
}

test("router extracts a Chinese five-page blueprint without calling AI preflight", () => {
  const brief = `把腾讯的分析做成 5 页PPT。
第1页：腾讯商业模式总览，解释游戏、广告、金融科技和云如何组成现金流飞轮。
第2页：用收入和利润线索讲核心业务质量，不要泛泛介绍公司。
第3页：讲微信生态的护城河和商业化路径。
第4页：讲AI和视频号带来的增量选择权。
第5页：给出投资启示和主要风险。`;

  const plan = buildDeterministicStudioPreflightPlan({
    brief,
    requestedPageCount: 5,
  });

  assert.equal(plan.route.primaryKind, "explicit-page-blueprint");
  assert.equal(plan.route.confidence, "high");
  assert.equal(plan.route.workspaceMode, "page-scoped");
  assert.equal(plan.route.pageBlueprint.length, 5);
  assert.equal(plan.pageMissions.length, 5);
  assert.match(plan.pageMissions[0]?.headlineClaim ?? "", /腾讯商业模式总览|现金流飞轮/);
  assert.match(plan.pageMissions[4]?.headlineClaim ?? "", /投资启示|主要风险/);
});

test("Tencent research-style brief routes as source-backed analysis with page-scoped workspace", () => {
  const brief = [
    "China Equity Strategy report notes on Tencent, Q1 2026.",
    "Observed facts: revenue growth was 8%, gross margin expanded, advertising recovered, and fintech remained resilient.",
    "Create a 5-page analysis deck grounded only in the supplied facts.",
  ].join("\n");
  const route = resolveStudioTaskRoute({
    brief,
    requestedPageCount: 5,
  });
  const plan = buildDeterministicStudioPreflightPlan({
    brief,
    requestedPageCount: 5,
    route,
  });

  assert.equal(route.primaryKind, "source-backed-analysis");
  assert.equal(route.capabilities.sourceBacked, true);
  assert.equal(route.workspaceMode, "page-scoped");
  assert.equal(plan.evidencePolicy.tier, "source-backed");
  assert.equal(buildPreflightEvidenceInput({ brief, preflight: plan }), brief);
});

test("router capabilities isolate matrix, process-flow, and explicit 3D branches", () => {
  const matrix = resolveStudioTaskRoute({
    brief: "生成一页BCG矩阵，讲苹果公司不同业务的增长和份额。",
    requestedPageCount: 1,
  });
  const flow = resolveStudioTaskRoute({
    brief: "做一页泳道流程图，包含客户、项目小组、专家委员会三个lane和阶段连接线。",
    requestedPageCount: 1,
  });
  const threeD = resolveStudioTaskRoute({
    brief: "Create a one-page 3D exploded view hero model of an AI chip stack.",
    requestedPageCount: 1,
  });

  assert.equal(matrix.primaryKind, "chart-matrix-figure");
  assert.equal(matrix.capabilities.matrix, true);
  assert.equal(matrix.capabilities.chart, true);
  assert.equal(matrix.capabilities.threeD, false);
  assert.equal(flow.primaryKind, "process-flow");
  assert.equal(flow.capabilities.flow, true);
  assert.equal(flow.capabilities.threeD, false);
  assert.equal(threeD.primaryKind, "visual-hero-3d");
  assert.equal(threeD.capabilities.threeD, true);
});

test("generic architecture wording does not trigger 3D", () => {
  const plan = buildDeterministicStudioPreflightPlan({
    brief: "Create a one-page architecture overview of an AI platform.",
    requestedPageCount: 1,
  });

  assert.equal(plan.route.capabilities.threeD, false);
  assert.equal(plan.capabilityActivations.some((item) => item.kind === "3d"), false);
});

test("ambiguous brief requests use a dedicated low-confidence full-brief path", () => {
  const brief = "Make a beautiful PPT.";
  const plan = buildDeterministicStudioPreflightPlan({
    brief,
    requestedPageCount: 1,
  });

  assert.equal(plan.route.primaryKind, "ambiguous-brief");
  assert.equal(plan.route.confidence, "low");
  assert.equal(plan.route.workspaceMode, "full-brief");
  assert.equal(plan.route.capabilities.chart, false);
  assert.equal(plan.route.capabilities.threeD, false);
  assert.equal(plan.evidencePolicy.tier, "explicit assumption");
  assert.equal(plan.rawBrief, brief);
  assert.equal(plan.pageMissions.length, 1);
  assert.match(plan.pageMissions[0]?.mission ?? "", /sparse request|conservative presentation frame/i);
});

test("clear but nonspecialized requests still use generic presentation path", () => {
  const brief = "Make a simple PPT about team norms.";
  const plan = buildDeterministicStudioPreflightPlan({
    brief,
    requestedPageCount: 1,
  });

  assert.equal(plan.route.primaryKind, "generic-presentation");
  assert.equal(plan.route.confidence, "low");
  assert.equal(plan.route.workspaceMode, "full-brief");
  assert.equal(plan.pageMissions.length, 1);
  assert.ok(plan.subject.length > 0);
});

test("explicit chart-heavy page plans keep distinct page missions", () => {
  const brief = `Create a 6-page English consulting-style data-story deck.
Page 1: Executive headline and market shape.
Page 2: Use a composite bar-and-line chart to compare regional AI infrastructure capex by region against utilization growth on a secondary axis.
Page 3: Use a bubble chart to position major provider archetypes by scale, utilization, and margin quality.
Page 4: Use a premium analytical data table to compare operators across capacity, power cost, gross margin, and deployment lead time.
Page 5: Use a waterfall chart or economics bridge to explain how revenue converts into margin pressure through power, GPU depreciation, and networking cost.
Page 6: Use a matrix-first recommendation page to show where investment should focus across regions and operating models.`;

  const plan = buildDeterministicStudioPreflightPlan({
    brief,
    requestedPageCount: 6,
  });

  assert.equal(plan.route.primaryKind, "explicit-page-blueprint");
  assert.equal(plan.pageMissions.length, 6);
  assert.equal(plan.pageMissions[1]?.missionScope, "page");
  assert.equal(plan.pageMissions[4]?.missionScope, "page");
  assert.match(plan.pageMissions[1]?.mission ?? "", /regional ai infrastructure capex|utilization growth/i);
  assert.match(plan.pageMissions[4]?.mission ?? "", /margin pressure|gpu depreciation|networking cost/i);
  assert.notEqual(plan.pageMissions[1]?.mission, plan.pageMissions[4]?.mission);
  assert.equal(plan.exportContract.pages[1]?.objects[0]?.objectKind, "native-chart");
  assert.equal(plan.exportContract.pages[3]?.objects[0]?.objectKind, "native-table");
  assert.equal(plan.exportContract.pages[5]?.objects[0]?.objectKind, "matrix");
  assert.deepEqual(plan.exportContract.pages[5]?.objects[0]?.forbiddenInterpretation, ["native-table"]);
});

test("generate request schema accepts a valid explicit export contract", () => {
  const exportContract = buildExternalMatrixExportContract(1);
  const payload = generateStudioReportRequestSchema.parse({
    brief: "Create one page about a market matrix.",
    exportContract,
  });

  assert.deepEqual(payload.exportContract, exportContract);
  assert.equal(payload.pageCount, undefined);
});

test("external export contract wins over inferred primary object kind", () => {
  const exportContract = buildExternalMatrixExportContract(1);
  const plan = buildDeterministicStudioPreflightPlan({
    brief: "Create a one-page native bar chart comparing revenue by segment.",
    requestedPageCount: 1,
    exportContract,
  });

  assert.equal(plan.route.capabilities.chart, true);
  assert.equal(plan.exportContract.pages[0]?.objects[0]?.objectKind, "matrix");
  assert.equal(plan.exportContract.pages[0]?.objects[0]?.renderTarget, "editable-shapes");
  assert.deepEqual(plan.exportContract.pages[0]?.objects[0]?.forbiddenInterpretation, [
    "native-table",
  ]);
  assert.deepEqual(plan.exportContract, exportContract);
});

test("external export contract supplies the requested page count when omitted", () => {
  const exportContract = buildExternalMatrixExportContract(2);
  const plan = buildDeterministicStudioPreflightPlan({
    brief: "Create a concise deck about market position.",
    exportContract,
  });

  assert.equal(plan.pageCount, 2);
  assert.equal(plan.pageMissions.length, 2);
  assert.equal(plan.exportContract.pages.length, 2);
});

test("external export contract page count mismatch throws clearly", () => {
  assert.throws(
    () =>
      buildDeterministicStudioPreflightPlan({
        brief: "Create a two-page chart deck.",
        requestedPageCount: 2,
        exportContract: buildExternalMatrixExportContract(1),
      }),
    /External exportContract page count mismatch: expected 2, received 1\./,
  );
});

test("external export contract coverage errors throw clearly", () => {
  const duplicatePageContract = buildExternalMatrixExportContract(2);
  duplicatePageContract.pages[1] = {
    ...duplicatePageContract.pages[1]!,
    pageNumber: 1,
    objects: duplicatePageContract.pages[1]!.objects.map((object) => ({
      ...object,
      pageNumber: 1,
    })),
  };
  assert.throws(
    () =>
      buildDeterministicStudioPreflightPlan({
        brief: "Create a two-page deck.",
        requestedPageCount: 2,
        exportContract: duplicatePageContract,
      }),
    /External exportContract has duplicate page number 1\./,
  );

  const missingPageContract = buildExternalMatrixExportContract(2);
  missingPageContract.pages[1] = {
    ...missingPageContract.pages[1]!,
    pageNumber: 3,
    objects: missingPageContract.pages[1]!.objects.map((object) => ({
      ...object,
      pageNumber: 3,
    })),
  };
  assert.throws(
    () =>
      buildDeterministicStudioPreflightPlan({
        brief: "Create a two-page deck.",
        requestedPageCount: 2,
        exportContract: missingPageContract,
      }),
    /External exportContract missing page coverage for page\(s\): 2\./,
  );

  const objectMismatchContract = buildExternalMatrixExportContract(1);
  objectMismatchContract.pages[0] = {
    ...objectMismatchContract.pages[0]!,
    objects: objectMismatchContract.pages[0]!.objects.map((object) => ({
      ...object,
      pageNumber: 2,
    })),
  };
  assert.throws(
    () =>
      buildDeterministicStudioPreflightPlan({
        brief: "Create one page.",
        requestedPageCount: 1,
        exportContract: objectMismatchContract,
      }),
    /External exportContract object p1-external-matrix declares pageNumber 2 but belongs to page 1\./,
  );
});

test("page prompt uses metadata rules from an external export contract", () => {
  const rawBrief = "Create a one-page native chart comparing revenue by segment.";
  const exportContract = buildExternalMatrixExportContract(1);
  const preflight = buildDeterministicStudioPreflightPlan({
    brief: rawBrief,
    requestedPageCount: 1,
    exportContract,
  });
  const preparation = resolveStudioGenerationPreparation({
    brief: rawBrief,
    requestedPageCount: 1,
  });
  const styleProfile = resolveDeckStyleProfile({
    brief: rawBrief,
  }).profile;
  const page = {
    pageNumber: 1,
    pageTitle: "Revenue matrix",
    goal: "Compare segment positions.",
    story: "Segment positions should be shown as a matrix.",
  };

  const prompt = buildPagePrompt({
    brief: rawBrief,
    deckTitle: "Revenue matrix",
    page,
    allPages: [page],
    styleProfile,
    thinkingContext: preparation.thinkingContext,
    briefSynthesis: preparation.briefSynthesis,
    complexityProfile: preparation.complexityProfile,
    preflight,
  });

  assert.match(prompt, /Primary export object contract: objectId=p1-external-matrix; semantic kind=matrix/);
  assert.match(prompt, /data-export-object-id="p1-external-matrix"/);
  assert.match(prompt, /data-semantic-kind="matrix"/);
  assert.match(prompt, /data-forbidden-export="native-table"/);
});

test("explicit page blueprint preserves quoted page titles ahead of chart fallbacks", () => {
  const brief = `Create a 3-page English investment-analysis deck on Tencent Holdings.
Page 1: "Investment hook and valuation frame" Story claim: Tencent has a source-backed upside case.
Page 2: "WeChat ecosystem moat" Story claim: WeChat remains the core traffic and monetization surface.
Page 3: "Four monetization engines, two visible CAGRs" Story claim: Use one chart to show games, ads, fintech, and cloud. Evidence: games CAGR 7.8%, online ads CAGR 12.4%.`;

  const plan = buildDeterministicStudioPreflightPlan({
    brief,
    requestedPageCount: 3,
  });

  assert.equal(plan.route.primaryKind, "explicit-page-blueprint");
  assert.equal(plan.pageMissions[2]?.title, "Four monetization engines, two visible CAGRs");
  assert.equal(plan.route.pageBlueprint[2]?.title, "Four monetization engines, two visible CAGRs");
});

test("explicit page titles clamp at word boundaries instead of cutting words", () => {
  const brief = `Create a 1-page deck.
Page 1: "Investment conclusion: own the platform optionality, monitor AI and execution risk across every scenario" Story claim: close with the investment decision.`;

  const plan = buildDeterministicStudioPreflightPlan({
    brief,
    requestedPageCount: 1,
  });

  assert.equal(
    plan.pageMissions[0]?.title,
    "Investment conclusion: own the platform optionality, monitor AI and execution",
  );
  assert.doesNotMatch(plan.pageMissions[0]?.title ?? "", /\bri$/);
});

test("chart page titles do not leak deck-level task instructions", () => {
  const brief = `Create a 5-page English investment-analysis PPTX-style deck using only the facts below.
Observed facts: Tencent appears in BBM V2; target price HK$650; upside 31.2%; market cap US$587.2bn.
Page 1: Investment hook and valuation frame.
Page 2: WeChat ecosystem moat and commercial surfaces.
Page 3: Use a bubble chart to position games, ads, fintech, and cloud by growth, margin quality, and AI optionality.
Page 4: Build a risk-reward chart around bull/base/bear values.
Page 5: Close with investor implications and downside risks.`;

  const plan = buildDeterministicStudioPreflightPlan({
    brief,
    requestedPageCount: 5,
  });

  assert.equal(plan.route.primaryKind, "explicit-page-blueprint");
  assert.doesNotMatch(plan.pageMissions[2]?.title ?? "", /create a 5-page english/i);
  assert.notEqual(plan.pageMissions[2]?.title, "Create a 5-page English Through One Chart");
});

test("page-scoped workspace does not include the full raw brief text", () => {
  const rawBrief = "FULL_RAW_BRIEF_SENTINEL_DO_NOT_FORWARD_TO_PAGE_RENDER";
  const sourceBrief = `Create a 2-page deck.
Page 1: Show Tencent revenue quality.
Page 2: Show Tencent risk and conclusion.`;
  const preflight = {
    ...buildDeterministicStudioPreflightPlan({
      brief: sourceBrief,
      requestedPageCount: 2,
    }),
    rawBrief,
  };
  const preparation = resolveStudioGenerationPreparation({
    brief: rawBrief,
    requestedPageCount: 2,
  });
  const styleProfile = resolveDeckStyleProfile({
    brief: rawBrief,
  }).profile;
  const page = {
    pageNumber: 1,
    pageTitle: "Tencent revenue quality",
    goal: "Show Tencent revenue quality.",
    story: "Tencent revenue quality should be shown through one focused page claim.",
  };

  const prompt = buildPagePrompt({
    brief: rawBrief,
    deckTitle: "Tencent analysis",
    page,
    allPages: [page],
    styleProfile,
    thinkingContext: preparation.thinkingContext,
    briefSynthesis: preparation.briefSynthesis,
    complexityProfile: preparation.complexityProfile,
    preflight,
  });

  assert.equal(preflight.route.workspaceMode, "page-scoped");
  assert.equal(prompt.includes(rawBrief), false);
  assert.match(prompt, /Task route: explicit-page-blueprint/);
  assert.match(prompt, /Current page mission/);
});

test("full-brief workspace keeps the raw brief for low-confidence ambiguous routes", () => {
  const rawBrief = "FULL_BRIEF_AMBIGUOUS_SENTINEL_SHOULD_REMAIN";
  const preflight = {
    ...buildDeterministicStudioPreflightPlan({
      brief: "Make a beautiful PPT.",
      requestedPageCount: 1,
    }),
    rawBrief,
  };
  const preparation = resolveStudioGenerationPreparation({
    brief: rawBrief,
    requestedPageCount: 1,
  });
  const styleProfile = resolveDeckStyleProfile({
    brief: rawBrief,
  }).profile;
  const page = {
    pageNumber: 1,
    pageTitle: "Generic request",
    goal: "Resolve a simple generic presentation request.",
    story: "The page should remain grounded in the raw brief.",
  };

  const prompt = buildPagePrompt({
    brief: rawBrief,
    deckTitle: "Generic request",
    page,
    allPages: [page],
    styleProfile,
    thinkingContext: preparation.thinkingContext,
    briefSynthesis: preparation.briefSynthesis,
    complexityProfile: preparation.complexityProfile,
    preflight,
  });

  assert.equal(preflight.route.workspaceMode, "full-brief");
  assert.equal(preflight.route.primaryKind, "ambiguous-brief");
  assert.match(prompt, /FULL_BRIEF_AMBIGUOUS_SENTINEL_SHOULD_REMAIN/);
  assert.match(prompt, /Route: ambiguous-brief/);
});
