import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveDeckStyleProfile } from "../industry-style.js";
import { buildPagePrompt } from "./core.js";
import { resolveStudioGenerationPreparation } from "./eval.js";
import {
  buildDeterministicStudioPreflightPlan,
  buildPreflightEvidenceInput,
  resolveStudioTaskRoute,
} from "./preflight.js";
import {
  generateStudioReportRequestSchema,
  type DeckExportContract,
  type ExportDataContract,
  type ExportObjectContract,
} from "./schemas.js";

type SharedExportDataContractFixture = {
  name: string;
  objectId: string;
  objectKind: ExportObjectContract["objectKind"];
  renderTarget: ExportObjectContract["renderTarget"];
  forbiddenInterpretation?: string[];
  expectedDiagnosticCode?: string;
  dataContract: unknown;
};

function readSharedExportDataContractFixtures() {
  return JSON.parse(
    readFileSync(
      new URL("../../../../tests/fixtures/export-data-contract-fixtures.json", import.meta.url),
      "utf8",
    ),
  ) as {
    valid: SharedExportDataContractFixture[];
    invalid: SharedExportDataContractFixture[];
  };
}

function extractOutputRulesBlock(prompt: string) {
  const marker = "## Output rules";
  const start = prompt.indexOf(marker);
  assert.notEqual(start, -1);
  const rest = prompt.slice(start + marker.length);
  const nextBlock = rest.search(/\n## /);
  return (nextBlock >= 0 ? rest.slice(0, nextBlock) : rest).trim();
}

function countExplicitPromptNegations(prompt: string) {
  return prompt.match(/\b(?:Do not|Never|Avoid)\b/g)?.length ?? 0;
}

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
        primaryObjectId: objectId,
        objects: [
          {
            objectId,
            pageNumber,
            pageStory: `External story ${pageNumber}`,
            primaryVisualObject: "Externally supplied matrix",
            objectKind: "matrix",
            objectRole: "primary",
            dataContract: {
              type: "matrix",
              axes: {
                x: { label: "Market growth" },
                y: { label: "Competitive position" },
              },
              items: [
                { label: "Core", x: 0.72, y: 0.68 },
              ],
              renderTarget: "editable-shapes",
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

function buildExternalMultiObjectExportContract(): DeckExportContract {
  const base = buildExternalMatrixExportContract(1);
  const primary = base.pages[0]!.objects[0]!;
  const secondaryObjectId = "p1-secondary-text";
  return {
    version: 1,
    pages: [
      {
        pageNumber: 1,
        pageStory: "External story 1",
        primaryVisualObject: "Externally supplied matrix",
        primaryObjectId: primary.objectId,
        objects: [
          primary,
          {
            objectId: secondaryObjectId,
            pageNumber: 1,
            pageStory: "External story 1",
            primaryVisualObject: "Secondary explanatory note",
            objectKind: "text",
            objectRole: "secondary",
            dataContract: null,
            renderTarget: "editable-text",
            ownershipScope: {
              rootId: secondaryObjectId,
              ownsText: true,
              ownsShapes: false,
              ownsSvg: false,
              childRoles: ["note"],
            },
            forbiddenInterpretation: ["native-chart", "native-table"],
          },
        ],
      },
    ],
  };
}

function buildExternalSingleObjectExportContract(args: {
  objectId: string;
  objectKind: ExportObjectContract["objectKind"];
  renderTarget: ExportObjectContract["renderTarget"];
  dataContract: ExportDataContract | null;
  forbiddenInterpretation?: string[];
}): DeckExportContract {
  return {
    version: 1,
    pages: [
      {
        pageNumber: 1,
        pageStory: "External story 1",
        primaryVisualObject: args.objectKind,
        primaryObjectId: args.objectId,
        objects: [
          {
            objectId: args.objectId,
            pageNumber: 1,
            pageStory: "External story 1",
            primaryVisualObject: args.objectKind,
            objectKind: args.objectKind,
            objectRole: "primary",
            dataContract: args.dataContract,
            renderTarget: args.renderTarget,
            ownershipScope: {
              rootId: args.objectId,
              ownsText: args.objectKind !== "chart-visual" && args.objectKind !== "native-chart" && args.objectKind !== "native-table",
              ownsShapes: args.objectKind === "matrix" || args.objectKind === "chart-visual",
              ownsSvg: args.objectKind === "matrix" || args.objectKind === "chart-visual",
              childRoles: [],
            },
            forbiddenInterpretation: args.forbiddenInterpretation ?? (args.objectKind === "matrix" ? ["native-table"] : []),
          },
        ],
      },
    ],
  };
}

function strongDataContractFixtures(): Array<{
  objectId: string;
  objectKind: ExportObjectContract["objectKind"];
  renderTarget: ExportObjectContract["renderTarget"];
  dataContract: ExportDataContract;
}> {
  return [
    {
      objectId: "p1-bar-chart",
      objectKind: "chart-visual",
      renderTarget: "visual-snapshot",
      dataContract: {
        type: "chart-bar",
        categories: ["Ads", "Games"],
        series: [{ name: "Revenue", values: [42, 58] }],
      },
    },
    {
      objectId: "p1-line-chart",
      objectKind: "chart-visual",
      renderTarget: "visual-snapshot",
      dataContract: {
        type: "chart-line",
        categories: ["Q1", "Q2"],
        series: [{ name: "Margin", values: [18, 22] }],
        axis: { y: { label: "Margin %" } },
      },
    },
    {
      objectId: "p1-stacked-chart",
      objectKind: "chart-visual",
      renderTarget: "visual-snapshot",
      dataContract: {
        type: "chart-stacked",
        categories: ["2025", "2026"],
        series: [
          { name: "Core", values: [35, 42] },
          { name: "Growth", values: [12, 18] },
        ],
        stackMode: "absolute",
      },
    },
    {
      objectId: "p1-combo-chart",
      objectKind: "chart-visual",
      renderTarget: "visual-snapshot",
      dataContract: {
        type: "chart-combo",
        categories: ["2025", "2026"],
        barSeries: [{ name: "Revenue", values: [100, 118] }],
        lineSeries: [{ name: "Margin", values: [21, 25] }],
      },
    },
    {
      objectId: "p1-bubble-chart",
      objectKind: "chart-visual",
      renderTarget: "visual-snapshot",
      dataContract: {
        type: "chart-bubble",
        points: [{ label: "Ads", x: 0.72, y: 0.62, size: 34 }],
      },
    },
    {
      objectId: "p1-waterfall-chart",
      objectKind: "chart-visual",
      renderTarget: "visual-snapshot",
      dataContract: {
        type: "chart-waterfall",
        steps: [
          { label: "Start", value: 100, kind: "start" },
          { label: "Growth", value: 18, kind: "increase" },
        ],
      },
    },
    {
      objectId: "p1-matrix",
      objectKind: "matrix",
      renderTarget: "editable-shapes",
      dataContract: {
        type: "matrix",
        axes: { x: { label: "Impact" }, y: { label: "Readiness" } },
        items: [{ label: "Core", x: 0.7, y: 0.6 }],
        renderTarget: "editable-shapes",
      },
    },
    {
      objectId: "p1-native-table",
      objectKind: "native-table",
      renderTarget: "native-table",
      dataContract: {
        type: "table",
        columns: [{ label: "Metric" }, { label: "Value" }],
        rows: [["Revenue", "42"]],
        headerPolicy: "first-row",
        nativeTableAllowed: true,
      },
    },
  ];
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

test("explicit chart wording without executable data stays editable diagram by default", () => {
  const brief = `Create a 4-page Tencent deck.
Slide 1 title: Tencent is China's 2C AI compounder.
Layout: matrix-first page, one dominant editable 2x2 quadrant matrix.
Primary visual object: editable matrix / quadrant map.
Slide 2 title: Games and ads carry the quantified growth case.
Layout: chart-led page with one native bar chart.
Primary visual object: native bar chart.
Slide 3 title: WeChat scale lowers AI distribution risk.
Layout: figure-led page, large central scale marker plus three small moat callouts.
Primary visual object: editable figure, not a table.
Required labels: 1.4bn MAU; network effects; value-chain position; regulatory barriers.
Slide 4 title: Valuation balances near-term AI cost with long-term option value.
Layout: native table plus takeaway.
Primary visual object: native table.`;

  const plan = buildDeterministicStudioPreflightPlan({
    brief,
    requestedPageCount: 4,
  });
  const objectByPage = new Map(
    plan.exportContract.pages.map((page) => [page.pageNumber, page.objects[0]]),
  );

  assert.equal(objectByPage.get(2)?.objectKind, "diagram");
  assert.equal(objectByPage.get(2)?.renderTarget, "editable-shapes");
  assert.equal(objectByPage.get(2)?.dataContract, null);
  assert.equal(plan.exportContract.pages[1]?.layoutArchetype, "chart-with-insight-rail");
  assert.equal(plan.exportContract.pages[1]?.composition, "dominant-left-rail-right");
  assert.equal(objectByPage.get(3)?.objectKind, "diagram");
  assert.equal(objectByPage.get(3)?.renderTarget, "editable-shapes");
  assert.deepEqual(objectByPage.get(3)?.forbiddenInterpretation, ["native-table", "native-chart"]);
});

test("conceptual operating-model primary visuals are diagrams, not chart snapshots", () => {
  const plan = buildDeterministicStudioPreflightPlan({
    brief: [
      "Create a one-page consulting-style operating model chart.",
      "Page 1: Show the operating model as a workflow figure across teams, handoffs, and governance layers.",
      "Primary visual object: operating model diagram with internal labels, not a data chart.",
    ].join("\n"),
    requestedPageCount: 1,
  });
  const primary = plan.exportContract.pages[0]?.objects[0];

  assert.equal(primary?.objectKind, "diagram");
  assert.equal(primary?.renderTarget, "editable-shapes");
  assert.equal(primary?.ownershipScope.ownsText, true);
  assert.equal(primary?.ownershipScope.ownsSvg, true);
  assert.deepEqual(primary?.forbiddenInterpretation, ["native-table", "native-chart"]);
});

test("operating-model figure wording does not become chart-led metadata", () => {
  const plan = buildDeterministicStudioPreflightPlan({
    brief: [
      "Create a 3-page consulting-style strategy deck.",
      "Page 1 title: AI margin reset requires an operating model shift.",
      "Story claim: The gap is caused by unresolved digital work, not lack of AI tools.",
      "Layout / structure cue: hero + evidence rail.",
      "Primary visual object: one dominant operating-model figure showing demand migration, workflow automation, and control layer.",
      "Required labels: 48% digital contacts, 18% straight-through, 62% cost-to-income.",
      "Page 2 title: Four journeys concentrate the cost opportunity.",
      "Layout / structure cue: chart-led page with one dominant ranked bar chart.",
      "Primary visual object: one horizontal ranked bar chart comparing relative cost pressure by journey.",
      "Page 3 title: The portfolio needs two-speed governance.",
      "Layout / structure cue: matrix-first page.",
      "Primary visual object: one 2x2 matrix.",
    ].join("\n"),
    requestedPageCount: 3,
  });
  const primary = plan.exportContract.pages[0]?.objects[0];

  assert.equal(plan.pageMissions[0]?.structureCue, null);
  assert.equal(primary?.objectKind, "diagram");
  assert.equal(primary?.renderTarget, "editable-shapes");
  assert.equal(primary?.ownershipScope.ownsText, true);
  assert.equal(/chart-led/i.test(plan.pageMissions[0]?.headlineClaim ?? ""), false);
});

test("consulting operating-model smoke prompt preserves editable IR across five pages", () => {
  const brief = `Create a 5-page consulting-style strategy deck.
Observed facts:
- Synthetic case: a mid-market consumer bank is trying to reset profitability in 2026 through AI-enabled operating model changes.
- Revenue growth slowed from 9% to 3% over two years.
- Cost-to-income ratio is 62%, above a 52-55% target range.
- 48% of service contacts are now digital, but only 18% are resolved without human escalation.
- Four journeys drive most operating cost pressure: onboarding, servicing, disputes, and collections.
- AI automation is estimated to reduce selected back-office unit costs by 18-24% if governance and workflow redesign are in place.
- Risk constraint: customer-impacting AI decisions require human override, audit trails, and policy controls.
Page 1 title: AI margin reset requires an operating model shift, not more tools
Story claim: The bank’s profitability gap is driven by unresolved digital work, not lack of channels.
Evidence: revenue growth 9% to 3%; cost-to-income 62%; digital contacts 48%; straight-through resolution only 18%.
Layout / structure cue: hero + evidence rail.
Primary visual object: one dominant operating-model figure showing three stacked layers: demand migration, workflow automation, control layer.
Required labels: “48% digital contacts”, “18% straight-through”, “62% cost-to-income”.
Must not become: generic title slide, icon row, or four equal cards.
Page 2 title: Four journeys concentrate the cost opportunity
Story claim: AI value should start where volume, rework, and manual judgment overlap.
Evidence: onboarding, servicing, disputes, collections are the four named cost-pressure journeys.
Layout / structure cue: chart-led page with one dominant ranked bar chart and sparse callouts.
Primary visual object: one horizontal ranked bar chart comparing relative cost pressure by journey. Use qualitative ranking only; do not invent absolute values.
Required labels: onboarding, servicing, disputes, collections; callout “start where rework is highest”.
Must not become: dashboard with several mini charts.
Page 3 title: The portfolio needs two-speed governance
Story claim: Not every AI use case should move through the same approval lane.
Evidence: human override and audit trails are required for customer-impacting decisions.
Layout / structure cue: matrix-first page.
Primary visual object: one 2x2 matrix with axes “Customer impact” and “Automation confidence”.
Required quadrants: “Fast-track assist”, “Controlled automation”, “Human-led”, “Do not automate yet”.
Must not become: native table, spreadsheet, or equal cards.
Page 4 title: Margin upside comes from three compounding levers
Story claim: The 18-24% unit-cost opportunity depends on workflow redesign before model deployment.
Evidence: automation estimate 18-24%; cost-to-income target 52-55%.
Layout / structure cue: bridge-explanation / waterfall-style visual.
Primary visual object: one bridge figure from current 62% cost-to-income toward 52-55% target range.
Required bridge steps: demand deflection, workflow automation, exception reduction, control investment.
Must not become: dense finance table or generic process diagram.
Page 5 title: A 90-day launch path keeps ambition inside control
Story claim: The first wave should prove value while building the risk-control muscle.
Evidence: customer-impacting AI requires human override, audit trails, and policy controls.
Layout / structure cue: timeline-led operating roadmap.
Primary visual object: one horizontal 90-day roadmap with three phases.
Required phase labels: “Diagnose journeys”, “Redesign workflows”, “Launch governed pilots”.
Required side rail: three control requirements: human override, audit trail, policy owner.
Must not become: project-management Gantt clutter or long checklist.
Source constraint: Treat the observed facts above as the complete source. If a number is not listed, do not invent it.`;

  const plan = buildDeterministicStudioPreflightPlan({
    brief,
    requestedPageCount: 5,
  });
  const pages = plan.exportContract.pages;

  assert.deepEqual(pages.map((page) => page.objects[0]?.objectKind), [
    "diagram",
    "diagram",
    "matrix",
    "diagram",
    "diagram",
  ]);
  assert.deepEqual(pages.map((page) => page.objects[0]?.renderTarget), [
    "editable-shapes",
    "editable-shapes",
    "editable-shapes",
    "editable-shapes",
    "editable-shapes",
  ]);
  assert.deepEqual(pages.map((page) => page.layoutArchetype), [
    "operating-model",
    "chart-with-insight-rail",
    "matrix-first",
    "bridge-explanation",
    "timeline-led",
  ]);
  assert.deepEqual(pages.map((page) => page.visualGrammar), [
    "consulting",
    "consulting",
    "consulting",
    "consulting",
    "consulting",
  ]);
  assert.match(plan.pageMissions[0]?.preferredVisual ?? "", /operating-model figure/i);
  assert.match(plan.pageMissions[0]?.evidenceNotes.join(" "), /48% digital contacts/);
  assert.match(plan.pageMissions[0]?.evidenceNotes.join(" "), /generic title slide/);
});

test("standard consulting page-render prompts stay compact with one small output rules block", () => {
  const brief = `Create a 5-page consulting-style strategy deck.
Observed facts:
- Mid-market consumer bank needs a 2026 AI operating-model reset.
- Revenue growth slowed from 9% to 3%; cost-to-income is 62% vs. a 52-55% target.
- Digital contacts are 48%, but only 18% resolve without human escalation.
- Cost pressure concentrates in onboarding, servicing, disputes, and collections.
- AI automation can reduce selected unit costs by 18-24% if workflow redesign and governance are in place.
- Customer-impacting AI needs human override, audit trails, and policy controls.
Page 1 title: AI margin reset requires an operating model shift
Story claim: The profitability gap is unresolved digital work, not lack of channels.
Layout / structure cue: hero + evidence rail.
Primary visual object: one dominant operating-model figure with three layers: demand migration, workflow automation, control layer.
Required labels: 48% digital contacts; 18% straight-through; 62% cost-to-income.
Page 2 title: Four journeys concentrate the cost opportunity
Story claim: AI value should start where volume, rework, and manual judgment overlap.
Layout / structure cue: chart-led page with one dominant ranked bar figure.
Primary visual object: one horizontal ranked bar figure comparing onboarding, servicing, disputes, and collections. Use qualitative ranking only.
Page 3 title: The portfolio needs two-speed governance
Story claim: Not every AI use case should move through the same approval lane.
Layout / structure cue: matrix-first page.
Primary visual object: one 2x2 matrix with axes Customer impact and Automation confidence.
Required quadrants: Fast-track assist; Controlled automation; Human-led; Do not automate yet.
Page 4 title: Margin upside comes from three compounding levers
Story claim: The 18-24% unit-cost opportunity depends on workflow redesign before model deployment.
Layout / structure cue: bridge-explanation visual.
Primary visual object: one bridge figure from current 62% cost-to-income toward 52-55% target range.
Required steps: demand deflection; workflow automation; exception reduction; control investment.
Page 5 title: A 90-day launch path keeps ambition inside control
Story claim: The first wave should prove value while building the risk-control muscle.
Layout / structure cue: timeline-led operating roadmap.
Primary visual object: one horizontal 90-day roadmap with three phases.
Required phase labels: Diagnose journeys; Redesign workflows; Launch governed pilots.
Source constraint: Treat observed facts as complete.`;
  const preflight = buildDeterministicStudioPreflightPlan({
    brief,
    requestedPageCount: 5,
  });
  const preparation = resolveStudioGenerationPreparation({
    brief,
    requestedPageCount: 5,
  });
  const styleProfile = resolveDeckStyleProfile({ brief }).profile;
  const pages = preflight.pageMissions.map((mission) => ({
    pageNumber: mission.pageNumber,
    pageTitle: mission.title,
    goal: mission.mission,
    story: mission.headlineClaim,
  }));

  assert.equal(pages.length, 5);

  for (const page of pages) {
    const prompt = buildPagePrompt({
      brief,
      deckTitle: "AI operating-model reset",
      page,
      allPages: pages,
      styleProfile,
      thinkingContext: preparation.thinkingContext,
      briefSynthesis: preparation.briefSynthesis,
      complexityProfile: preparation.complexityProfile,
      preflight,
    });
    const outputRulesBlock = extractOutputRulesBlock(prompt);
    const outputRuleLines = outputRulesBlock
      .split("\n")
      .filter((line) => line.trim().startsWith("- "));

    assert.ok(prompt.length <= 7000, `page ${page.pageNumber} prompt was ${prompt.length} chars`);
    assert.equal(prompt.match(/^## Output rules$/gm)?.length ?? 0, 1);
    assert.ok(outputRuleLines.length <= 8, `page ${page.pageNumber} had ${outputRuleLines.length} output rules`);
    assert.ok(countExplicitPromptNegations(prompt) <= 10, `page ${page.pageNumber} used too many hard negations`);
    assert.match(prompt, /exactly one <section class="page"> block/);
    assert.match(prompt, /1600px by 900px/);
    assert.match(prompt, /inline style attributes only/);
    assert.match(prompt, /external assets\/scripts/);
    assert.match(prompt, /data-studio-object-id/);
  }
});

test("chart classification requires paired labels and values for chart contracts", () => {
  const stackedLayers = buildDeterministicStudioPreflightPlan({
    brief: [
      "Create a 1-page consulting slide.",
      "Page 1 title: Operating model layers.",
      "Primary visual object: three stacked layers showing demand migration, workflow automation, and control layer.",
    ].join("\n"),
    requestedPageCount: 1,
  });
  assert.equal(stackedLayers.exportContract.pages[0]?.objects[0]?.objectKind, "diagram");

  const unpairedStackedChart = buildDeterministicStudioPreflightPlan({
    brief: [
      "Create a 1-page chart slide.",
      "Page 1 title: Segment mix.",
      "Primary visual object: stacked bar chart with series values: 10, 20, 30.",
    ].join("\n"),
    requestedPageCount: 1,
  });
  assert.equal(unpairedStackedChart.exportContract.pages[0]?.objects[0]?.objectKind, "diagram");
  assert.equal(unpairedStackedChart.exportContract.pages[0]?.objects[0]?.dataContract, null);

  const stackedChart = buildDeterministicStudioPreflightPlan({
    brief: [
      "Create a 1-page chart slide.",
      "Page 1 title: Segment mix.",
      "Primary visual object: stacked bar chart with categories: Ads, Games, Cloud; values: 10, 20, 30.",
    ].join("\n"),
    requestedPageCount: 1,
  });
  const stackedData = stackedChart.exportContract.pages[0]?.objects[0]?.dataContract;
  assert.equal(stackedChart.exportContract.pages[0]?.objects[0]?.objectKind, "chart-visual");
  assert.equal(stackedData?.type, "chart-stacked");
  assert.deepEqual(stackedData?.type === "chart-stacked" ? stackedData.categories : [], ["Ads", "Games", "Cloud"]);
  assert.deepEqual(stackedData?.type === "chart-stacked" ? stackedData.series[0]?.values : [], [10, 20, 30]);

  const bridgeDiagram = buildDeterministicStudioPreflightPlan({
    brief: [
      "Create a 1-page consulting slide.",
      "Page 1 title: Margin bridge.",
      "Primary visual object: waterfall-style bridge figure without values, showing demand deflection and workflow automation.",
    ].join("\n"),
    requestedPageCount: 1,
  });
  assert.equal(bridgeDiagram.exportContract.pages[0]?.objects[0]?.objectKind, "diagram");

  const evidenceOnlyRankedChart = buildDeterministicStudioPreflightPlan({
    brief: [
      "Create a 1-page consulting slide.",
      "Page 1 title: Four journeys concentrate the cost opportunity.",
      "Evidence: revenue growth slowed from 9% to 3%; cost-to-income is 62%; digital contacts are 48%; straight-through is 18%.",
      "Primary visual object: one horizontal ranked bar chart comparing onboarding, servicing, disputes, and collections.",
      "Required labels: onboarding, servicing, disputes, collections.",
    ].join("\n"),
    requestedPageCount: 1,
  });
  assert.equal(evidenceOnlyRankedChart.exportContract.pages[0]?.objects[0]?.objectKind, "diagram");
  assert.equal(evidenceOnlyRankedChart.exportContract.pages[0]?.objects[0]?.dataContract, null);

  const waterfallChart = buildDeterministicStudioPreflightPlan({
    brief: [
      "Create a 1-page chart slide.",
      "Page 1 title: Cost-to-income waterfall.",
      "Primary visual object: waterfall chart with numeric steps: start 62, demand deflection -3, workflow automation -4, end 55.",
    ].join("\n"),
    requestedPageCount: 1,
  });
  const waterfallData = waterfallChart.exportContract.pages[0]?.objects[0]?.dataContract;
  assert.equal(waterfallChart.exportContract.pages[0]?.objects[0]?.objectKind, "chart-visual");
  assert.equal(waterfallData?.type, "chart-waterfall");
  assert.deepEqual(waterfallData?.type === "chart-waterfall" ? waterfallData.steps.map((step) => step.label) : [], [
    "start",
    "demand deflection",
    "workflow automation",
    "end",
  ]);
  assert.deepEqual(waterfallData?.type === "chart-waterfall" ? waterfallData.steps.map((step) => step.value) : [], [
    62,
    -3,
    -4,
    55,
  ]);

  const marginBridgeWaterfallChart = buildDeterministicStudioPreflightPlan({
    brief: [
      "Create a 1-page chart slide.",
      "Page 1 title: Margin bridge.",
      "Primary visual object: waterfall chart for a margin bridge with numeric steps: start 62, demand deflection -3, workflow automation -4, end 55.",
    ].join("\n"),
    requestedPageCount: 1,
  });
  assert.equal(marginBridgeWaterfallChart.exportContract.pages[0]?.objects[0]?.objectKind, "chart-visual");
  assert.equal(marginBridgeWaterfallChart.exportContract.pages[0]?.objects[0]?.dataContract?.type, "chart-waterfall");

  const stackedLayersChart = buildDeterministicStudioPreflightPlan({
    brief: [
      "Create a 1-page chart slide.",
      "Page 1 title: Layered mix.",
      "Primary visual object: stacked bar chart for three stacked layers with categories: Demand, Workflow, Control; values: 10, 20, 30.",
    ].join("\n"),
    requestedPageCount: 1,
  });
  const stackedLayersData = stackedLayersChart.exportContract.pages[0]?.objects[0]?.dataContract;
  assert.equal(stackedLayersChart.exportContract.pages[0]?.objects[0]?.objectKind, "chart-visual");
  assert.equal(stackedLayersData?.type, "chart-stacked");
  assert.deepEqual(stackedLayersData?.type === "chart-stacked" ? stackedLayersData.categories : [], [
    "Demand",
    "Workflow",
    "Control",
  ]);
});

test("preflight fills deterministic page-level Studio IR defaults", () => {
  const brief = [
    "Create a 4-page source-backed analysis deck.",
    "Observed facts: revenue grew 8%, margin expanded 240bps, churn declined, and cash conversion improved.",
    "Page 1: Use a bubble chart to position segments by growth, margin, and revenue scale.",
    "Page 2: Use a matrix-first page to compare segment attractiveness.",
    "Page 3: Use a native table to benchmark revenue, margin, growth, and cash conversion.",
    "Page 4: Use a swimlane process flow for the operating cadence.",
  ].join("\n");
  const plan = buildDeterministicStudioPreflightPlan({
    brief,
    requestedPageCount: 4,
  });

  assert.equal(plan.exportContract.pages[0]?.layoutArchetype, "bubble-landscape");
  assert.equal(plan.exportContract.pages[0]?.composition, "center-canvas-annotation-ring");
  assert.equal(plan.exportContract.pages[0]?.visualGrammar, "consulting");
  assert.equal(plan.exportContract.pages[0]?.density, "executive");
  assert.equal(plan.exportContract.pages[1]?.layoutArchetype, "matrix-first");
  assert.equal(plan.exportContract.pages[2]?.layoutArchetype, "benchmark-table");
  assert.equal(plan.exportContract.pages[2]?.composition, "grid-with-hierarchy");
  assert.equal(plan.exportContract.pages[3]?.layoutArchetype, "swimlane");
  assert.equal(plan.exportContract.pages[3]?.composition, "three-band-narrative");
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
  assert.equal(plan.exportContract.pages[0]?.layoutArchetype, "thesis-evidence-board");
  assert.equal(plan.exportContract.pages[0]?.visualGrammar, "consulting");
  assert.equal(plan.exportContract.pages[0]?.composition, "grid-with-hierarchy");
  assert.equal(plan.exportContract.pages[0]?.density, "executive");
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
  assert.equal(plan.exportContract.pages[1]?.objects[0]?.objectKind, "diagram");
  assert.equal(plan.exportContract.pages[1]?.objects[0]?.renderTarget, "editable-shapes");
  assert.equal(plan.exportContract.pages[3]?.objects[0]?.objectKind, "native-table");
  assert.equal(plan.exportContract.pages[5]?.objects[0]?.objectKind, "matrix");
  assert.deepEqual(
    plan.exportContract.pages.map((page) => page.layoutArchetype),
    [
      "thesis-evidence-board",
      "chart-with-insight-rail",
      "bubble-landscape",
      "benchmark-table",
      "bridge-explanation",
      "matrix-first",
    ],
  );
  assert.ok(new Set(plan.exportContract.pages.map((page) => page.layoutArchetype)).size >= 5);
  assert.equal(plan.exportContract.pages[1]?.objects[0]?.dataContract, null);
  assert.equal(plan.exportContract.pages[3]?.objects[0]?.dataContract?.type, "missing-data");
  assert.equal(plan.exportContract.pages[5]?.objects[0]?.dataContract?.type, "matrix");
  assert.ok(
    plan.exportContract.pages[5]?.objects[0]?.dataContract?.type === "matrix" &&
      plan.exportContract.pages[5].objects[0].dataContract.items.length >= 1,
  );
  assert.deepEqual(plan.exportContract.pages[5]?.objects[0]?.forbiddenInterpretation, ["native-table"]);
});

test("Tesla finance matrix pages infer an editable asset-card matrix contract", () => {
  const brief = `Create a 4-page finance equity research deck on Tesla Q1 2026.
Observed facts:
- AI training compute: Cortex 1 is in production with more than 100k H100e.
- Robotaxi operations: paid miles nearly doubled and service expanded in Austin, Dallas, and Houston.
- FSD subscriptions: 1.28 million, up 51% year over year.
- Supercharger network: 79,918 connectors and 8,463 stations, up 19% year over year.
Page 1 title: Tesla Q1 update reframes the platform case.
Story claim: The quarter matters because autonomy, software, and infrastructure are converging.
Page 2 title: Automotive economics still carry the near-term risk.
Story claim: Delivery and margin pressure remain the gating factor.
Page 3 title: Energy and services provide ballast but not the main option.
Story claim: Adjacent businesses help resilience but do not drive the platform thesis.
Page 4 title: AI, FSD, Robotaxi and charging form the platform operating layer.
Story claim: The disclosed progress shows compute, subscription software, fleet operations, and charging infrastructure moving toward one operating flywheel.
Layout / structure cue: matrix-first page.
Primary visual object: one 2x2 matrix with axes “平台成熟度 / 可运营化程度” and “运营网络扩展度 / 城市与节点覆盖”.
Required labels: AI 训练算力; Robotaxi; FSD 订阅; 超充网络.
Source constraint: Treat supplied facts as complete.`;

  const plan = buildDeterministicStudioPreflightPlan({
    brief,
    requestedPageCount: 4,
  });
  const page4 = plan.exportContract.pages[3];
  const primary = page4?.objects[0];
  const data = primary?.dataContract;

  assert.equal(page4?.layoutArchetype, "matrix-first");
  assert.equal(primary?.objectKind, "matrix");
  assert.equal(data?.type, "matrix");
  if (data?.type !== "matrix") {
    assert.fail("Expected Tesla page 4 to produce a matrix data contract.");
  }
  assert.equal(data.variant, "asset-card-map");
  assert.match(data.axes.x.label, /运营网络扩展度|城市与节点覆盖/);
  assert.match(data.axes.y.label, /平台成熟度|可运营化程度/);
  const itemLabels = data.items.map((item) => item.label).join(" | ");
  assert.match(itemLabels, /AI 训练算力/);
  assert.match(itemLabels, /Robotaxi/);
  assert.match(itemLabels, /FSD 订阅/);
  assert.match(itemLabels, /超充网络/);
});

test("Tencent business AI pages stay in business-model exhibit grammar", () => {
  const brief = `Create a 4-page Chinese equity research deck on Tencent.
Observed facts:
- Games revenue grows through evergreen titles and overseas contribution.
- Online Ads benefits from Video Accounts and AI-assisted targeting.
- FinTech and Business Services stabilize cash flow while Cloud shifts toward quality growth.
- AI capability improves ad load, content recommendation, game production, and cloud products.
- Key risks are regulation, AI capex intensity, game approvals, and macro ad demand.
Page 1 title: Tencent's upside is a business-model compounding case.
Story claim: The investment case is driven by monetization surfaces rather than one technical breakthrough.
Evidence: Games, ads, fintech, cloud, and AI capability all reinforce monetization.
Layout / structure cue: hero + evidence rail.
Primary visual object: one investment thesis board.
Required labels: Games; Online Ads; FinTech; Cloud.
Page 2 title: Four business engines explain the Tencent model.
Story claim: Games, Online Ads, FinTech, and Cloud each carry a different growth and margin role.
Evidence: Games, Online Ads, FinTech, Cloud.
Layout / structure cue: 4-column business engine comparison grid.
Primary visual object: one 4-column comparison grid with columns Games, Online Ads, FinTech, Cloud and shared rows for role, AI leverage, and monetization read.
Required labels: Games; Online Ads; FinTech; Cloud; role; AI leverage; monetization read.
Page 3 title: Games and Online Ads carry the growth proof.
Story claim: Growth quality is clearest where content and ad systems convert engagement into revenue.
Evidence: Games CAGR 8%; Online Ads CAGR 12%.
Layout / structure cue: chart-led page with one business bar chart.
Primary visual object: one bar chart with categories: Games, Online Ads; values: 8, 12.
Required labels: Games CAGR; Online Ads CAGR; Video Accounts; evergreen titles.
Page 4 title: AI strengthens the moat but does not remove execution risk.
Story claim: AI is best read as a monetization bridge with a risk strip, not a neural-network or cloud architecture story.
Evidence: AI improves ads, recommendation, game production, and cloud products; risks are regulation, capex, approvals, and macro demand.
Layout / structure cue: business bridge figure + opportunity-risk strip.
Primary visual object: one business bridge from AI capability to monetization surfaces with a bottom risk strip.
Required labels: AI capability; ad targeting; recommendation; game production; cloud products; regulation; capex intensity; game approvals.
Source constraint: Use only the observed facts above.`;

  const plan = buildDeterministicStudioPreflightPlan({
    brief,
    requestedPageCount: 4,
  });
  const page2 = plan.exportContract.pages[1];
  const page3 = plan.exportContract.pages[2];
  const page4 = plan.exportContract.pages[3];

  assert.equal(page2?.layoutArchetype, "comparison-grid");
  assert.equal(page2?.objects[0]?.objectKind, "comparison-grid");
  assert.notEqual(page2?.layoutArchetype, "matrix-first");
  assert.notEqual(page2?.objects[0]?.objectKind, "matrix");
  assert.notEqual(page2?.objects[0]?.objectKind, "native-table");

  assert.equal(page3?.layoutArchetype, "chart-with-insight-rail");
  assert.equal(page3?.objects[0]?.objectKind, "chart-visual");
  assert.equal(page3?.objects[0]?.dataContract?.type, "chart-bar");
  assert.notEqual(page3?.visualGrammar, "scientific-figure");
  assert.notEqual(page3?.visualGrammar, "technical-system");

  assert.equal(page4?.layoutArchetype, "bridge-explanation");
  assert.equal(page4?.objects[0]?.objectKind, "diagram");
  assert.notEqual(page4?.visualGrammar, "scientific-figure");
  assert.notEqual(page4?.visualGrammar, "technical-system");
  assert.deepEqual(
    plan.semanticWarnings.filter((warning) =>
      warning.code === "business-ai-scientific-visual-drift" ||
      warning.code === "comparison-grid-mislabeled-as-matrix"),
    [],
  );
});

test("semantic intent guardrail boundaries separate business AI, science, grids, and true matrices", () => {
  const businessAi = buildDeterministicStudioPreflightPlan({
    brief: [
      "Create a 1-page consulting deck.",
      "Page 1 title: AI cloud business model creates monetization leverage.",
      "Story claim: AI and cloud matter as business-model levers.",
      "Primary visual object: one business model exhibit connecting AI capability, cloud products, revenue, and margin.",
    ].join("\n"),
    requestedPageCount: 1,
  });
  assert.notEqual(businessAi.exportContract.pages[0]?.visualGrammar, "scientific-figure");
  assert.notEqual(businessAi.exportContract.pages[0]?.visualGrammar, "technical-system");

  const science = buildDeterministicStudioPreflightPlan({
    brief: [
      "Create a 1-page scientific presentation.",
      "Page 1 title: Neural network experiment shows method lift.",
      "Story claim: The experiment isolates the method effect.",
      "Primary visual object: one scientific neural network experiment diagram with method, dataset, and result annotations.",
    ].join("\n"),
    requestedPageCount: 1,
  });
  assert.equal(science.exportContract.pages[0]?.visualGrammar, "scientific-figure");

  const comparison = buildDeterministicStudioPreflightPlan({
    brief: [
      "Create a 1-page business deck.",
      "Page 1 title: Four-column business engine comparison.",
      "Story claim: The model has four engines with different jobs.",
      "Layout / structure cue: 4-column comparison grid.",
      "Primary visual object: one 4-column comparison grid across Games, Ads, FinTech, and Cloud.",
    ].join("\n"),
    requestedPageCount: 1,
  });
  assert.equal(comparison.exportContract.pages[0]?.layoutArchetype, "comparison-grid");
  assert.equal(comparison.exportContract.pages[0]?.objects[0]?.objectKind, "comparison-grid");

  const matrix = buildDeterministicStudioPreflightPlan({
    brief: [
      "Create a 1-page business deck.",
      "Page 1 title: Prioritize initiatives by impact and confidence.",
      "Story claim: A 2x2 matrix shows where to move first.",
      "Layout / structure cue: matrix-first.",
      "Primary visual object: one 2x2 matrix with axes Customer impact and Automation confidence.",
    ].join("\n"),
    requestedPageCount: 1,
  });
  assert.equal(matrix.exportContract.pages[0]?.layoutArchetype, "matrix-first");
  assert.equal(matrix.exportContract.pages[0]?.objects[0]?.objectKind, "matrix");
});

test("semantic warnings report mislabels and required label over-budget without blocking", () => {
  const longLabels = buildDeterministicStudioPreflightPlan({
    brief: [
      "Create a 1-page consulting deck.",
      "Page 1 title: The operating model needs focus.",
      "Story claim: Required labels should be budgeted.",
      "Primary visual object: one operating model exhibit.",
      "Required labels: A; B; C; D; E; F; G; H; I; J; K.",
    ].join("\n"),
    requestedPageCount: 1,
  });
  assert.equal(
    longLabels.semanticWarnings.some((warning) => warning.code === "required-labels-over-budget"),
    true,
  );
  assert.match(longLabels.pageMissions[0]?.evidenceNotes.join(" ") ?? "", /Required labels: A; B; C; D; E; F; G; H/);
  assert.match(longLabels.pageMissions[0]?.evidenceNotes.join(" ") ?? "", /Evidence pool labels: I; J; K/);

  const mislabeledMatrix = buildDeterministicStudioPreflightPlan({
    brief: [
      "Create a 1-page business deck.",
      "Page 1 title: Four-column business engine comparison.",
      "Story claim: The page compares four engines.",
      "Layout / structure cue: 4-column comparison grid.",
      "Primary visual object: one 4-column comparison grid across Games, Ads, FinTech, and Cloud.",
    ].join("\n"),
    requestedPageCount: 1,
    exportContract: buildExternalMatrixExportContract(1),
  });
  assert.equal(
    mislabeledMatrix.semanticWarnings.some((warning) => warning.code === "comparison-grid-mislabeled-as-matrix"),
    true,
  );

  const businessDriftContract = buildExternalSingleObjectExportContract({
    objectId: "p1-business-ai",
    objectKind: "diagram",
    renderTarget: "editable-shapes",
    dataContract: null,
  });
  businessDriftContract.pages[0] = {
    ...businessDriftContract.pages[0]!,
    pageStory: "AI cloud business model improves revenue and margin.",
    primaryVisualObject: "AI cloud business model exhibit",
    visualGrammar: "scientific-figure",
  };
  const businessDrift = buildDeterministicStudioPreflightPlan({
    brief: "Create a 1-page business deck. Page 1 title: AI cloud business model. Story claim: AI cloud capability improves revenue and margin.",
    requestedPageCount: 1,
    exportContract: businessDriftContract,
  });
  assert.equal(
    businessDrift.semanticWarnings.some((warning) => warning.code === "business-ai-scientific-visual-drift"),
    true,
  );
});

test("preflight maps object families to distinct visual grammar archetypes", () => {
  const brief = `Create a 7-page source-backed operations deck.
Page 1: Use one chart to show weekly volume trend.
Page 2: Use a bubble chart to position segments by margin, growth, and scale.
Page 3: Use a matrix-first page to prioritize operating bets.
Page 4: Use a native table to benchmark owners, SLAs, and cost.
Page 5: Use a process flow to show intake, triage, approval, and launch.
Page 6: Use a swimlane with customer, ops, and engineering lanes.
Page 7: Build an evidence wall from the observed facts.`;

  const plan = buildDeterministicStudioPreflightPlan({
    brief,
    requestedPageCount: 7,
  });

  assert.deepEqual(
    plan.exportContract.pages.map((page) => page.layoutArchetype),
    [
      "chart-with-insight-rail",
      "bubble-landscape",
      "matrix-first",
      "benchmark-table",
      "process-flow",
      "swimlane",
      "evidence-wall",
    ],
  );
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

test("explicit page-level Studio IR fields pass schema and survive preflight", () => {
  const exportContract = buildExternalMatrixExportContract(1);
  exportContract.pages[0] = {
    ...exportContract.pages[0]!,
    layoutArchetype: "market-map",
    visualGrammar: "product-strategy",
    composition: "two-column-contrast",
    density: "dense",
  };
  const payload = generateStudioReportRequestSchema.parse({
    brief: "Create one page about a market matrix.",
    exportContract,
  });
  const plan = buildDeterministicStudioPreflightPlan({
    brief: "Create one page about a market matrix.",
    requestedPageCount: 1,
    exportContract,
  });

  assert.deepEqual(payload.exportContract, exportContract);
  assert.equal(plan.exportContract.pages[0]?.layoutArchetype, "market-map");
  assert.equal(plan.exportContract.pages[0]?.visualGrammar, "product-strategy");
  assert.equal(plan.exportContract.pages[0]?.composition, "two-column-contrast");
  assert.equal(plan.exportContract.pages[0]?.density, "dense");
});

test("invalid page-level Studio IR enum values fail schema validation", () => {
  const exportContract = buildExternalMatrixExportContract(1) as unknown as Record<string, unknown>;
  const pages = exportContract.pages as Array<Record<string, unknown>>;
  pages[0] = {
    ...pages[0]!,
    layoutArchetype: "freeform-collage",
  };

  assert.throws(
    () =>
      generateStudioReportRequestSchema.parse({
        brief: "Create one page about a market matrix.",
        exportContract,
      }),
    /layoutArchetype/i,
  );
});

test("generate request schema rejects public native chart export contracts", () => {
  const exportContract = buildExternalSingleObjectExportContract({
    objectId: "p1-native-chart",
    objectKind: "native-chart",
    renderTarget: "native-chart",
    dataContract: {
      type: "chart-bar",
      categories: ["A"],
      series: [{ name: "Series", values: [1] }],
    },
  });

  assert.throws(
    () =>
      generateStudioReportRequestSchema.parse({
        brief: "Create one native chart page.",
        exportContract,
      }),
    /native-chart export is currently unsupported/i,
  );
});

test("external strong data contracts are accepted for chart, matrix, and native table families", () => {
  for (const fixture of strongDataContractFixtures()) {
    const exportContract = buildExternalSingleObjectExportContract({
      objectId: fixture.objectId,
      objectKind: fixture.objectKind,
      renderTarget: fixture.renderTarget,
      dataContract: fixture.dataContract,
    });
    const plan = buildDeterministicStudioPreflightPlan({
      brief: `Create one page for ${fixture.objectId}.`,
      requestedPageCount: 1,
      exportContract,
    });

    assert.equal(plan.exportContract.pages[0]?.objects[0]?.dataContract?.type, fixture.dataContract.type);
    assert.deepEqual(plan.exportContract.pages[0]?.objects[0]?.dataContract, fixture.dataContract);
  }
});

test("shared strong data contract fixtures mirror server preflight validation", () => {
  const fixtures = readSharedExportDataContractFixtures();
  for (const fixture of fixtures.valid) {
    const exportContract = buildExternalSingleObjectExportContract({
      objectId: fixture.objectId,
      objectKind: fixture.objectKind,
      renderTarget: fixture.renderTarget,
      forbiddenInterpretation: fixture.forbiddenInterpretation,
      dataContract: fixture.dataContract as ExportDataContract,
    });
    const plan = buildDeterministicStudioPreflightPlan({
      brief: `Create one page for ${fixture.name}.`,
      requestedPageCount: 1,
      exportContract,
    });

    assert.equal(
      plan.exportContract.pages[0]?.objects[0]?.dataContract?.type,
      (fixture.dataContract as ExportDataContract).type,
      fixture.name,
    );
  }

  for (const fixture of fixtures.invalid) {
    const exportContract = buildExternalSingleObjectExportContract({
      objectId: fixture.objectId,
      objectKind: fixture.objectKind,
      renderTarget: fixture.renderTarget,
      forbiddenInterpretation: fixture.forbiddenInterpretation,
      dataContract: fixture.dataContract as ExportDataContract,
    });

    assert.throws(
      () =>
        buildDeterministicStudioPreflightPlan({
          brief: `Create one page for ${fixture.name}.`,
          requestedPageCount: 1,
          exportContract,
        }),
      fixture.name,
    );
  }
});

test("external strong data contract failures hard fail clearly", () => {
  const invalidCases: Array<{
    label: string;
    exportContract: DeckExportContract;
    message: RegExp;
  }> = [
    {
      label: "explicit native chart unsupported",
      exportContract: buildExternalSingleObjectExportContract({
        objectId: "p1-native-chart",
        objectKind: "native-chart",
        renderTarget: "native-chart",
        dataContract: {
          type: "chart-bar",
          categories: ["A"],
          series: [{ name: "Series", values: [1] }],
        },
      }),
      message: /unsupported native-chart export mode|native-chart export is currently unsupported/i,
    },
    {
      label: "chart missing series",
      exportContract: buildExternalSingleObjectExportContract({
        objectId: "p1-bad-chart",
        objectKind: "chart-visual",
        renderTarget: "visual-snapshot",
        dataContract: {
          type: "chart-bar",
          categories: ["A"],
        } as unknown as ExportDataContract,
      }),
      message: /series/i,
    },
    {
      label: "bubble missing positive size",
      exportContract: buildExternalSingleObjectExportContract({
        objectId: "p1-bad-bubble",
        objectKind: "chart-visual",
        renderTarget: "visual-snapshot",
        dataContract: {
          type: "chart-bubble",
          points: [{ label: "A", x: 1, y: 2, size: 0 }],
        } as unknown as ExportDataContract,
      }),
      message: /size/i,
    },
    {
      label: "chart series length mismatch",
      exportContract: buildExternalSingleObjectExportContract({
        objectId: "p1-short-series-chart",
        objectKind: "chart-visual",
        renderTarget: "visual-snapshot",
        dataContract: {
          type: "chart-line",
          categories: ["Q1", "Q2"],
          series: [{ name: "Margin", values: [18] }],
        },
      }),
      message: /complete chart dataContract/i,
    },
    {
      label: "table missing rows",
      exportContract: buildExternalSingleObjectExportContract({
        objectId: "p1-bad-table",
        objectKind: "native-table",
        renderTarget: "native-table",
        dataContract: {
          type: "table",
          columns: [{ label: "Metric" }],
          nativeTableAllowed: true,
        } as unknown as ExportDataContract,
      }),
      message: /rows/i,
    },
    {
      label: "matrix missing items",
      exportContract: buildExternalSingleObjectExportContract({
        objectId: "p1-bad-matrix",
        objectKind: "matrix",
        renderTarget: "editable-shapes",
        dataContract: {
          type: "matrix",
          axes: { x: { label: "Impact" }, y: { label: "Readiness" } },
          renderTarget: "editable-shapes",
        } as unknown as ExportDataContract,
      }),
      message: /items/i,
    },
    {
      label: "native table with chart data",
      exportContract: buildExternalSingleObjectExportContract({
        objectId: "p1-incompatible-table",
        objectKind: "native-table",
        renderTarget: "native-table",
        dataContract: {
          type: "chart-bar",
          categories: ["A"],
          series: [{ name: "Series", values: [1] }],
        },
      }),
      message: /table dataContract/i,
    },
    {
      label: "external missing-data placeholder",
      exportContract: buildExternalSingleObjectExportContract({
        objectId: "p1-missing-data",
        objectKind: "chart-visual",
        renderTarget: "visual-snapshot",
        dataContract: {
          type: "missing-data",
          expected: "native-chart",
          reason: "Missing source data.",
          requiredFields: ["series"],
        },
      }),
      message: /cannot use missing-data/i,
    },
  ];

  for (const invalidCase of invalidCases) {
    assert.throws(
      () =>
        buildDeterministicStudioPreflightPlan({
          brief: `Create one page for ${invalidCase.label}.`,
          requestedPageCount: 1,
          exportContract: invalidCase.exportContract,
        }),
      invalidCase.message,
      invalidCase.label,
    );
  }
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
  assert.equal(plan.exportContract.pages[0]?.layoutArchetype, "matrix-first");
  assert.equal(plan.exportContract.pages[0]?.composition, "center-canvas-annotation-ring");
  assert.deepEqual(plan.exportContract.pages[0]?.objects, exportContract.pages[0]?.objects);
});

test("external multi-object export contract preserves primary and secondary roles", () => {
  const exportContract = buildExternalMultiObjectExportContract();
  const plan = buildDeterministicStudioPreflightPlan({
    brief: "Create a one-page matrix with a short supporting note.",
    requestedPageCount: 1,
    exportContract,
  });

  const page = plan.exportContract.pages[0]!;
  assert.equal(page.primaryObjectId, "p1-external-matrix");
  assert.equal(page.objects.length, 2);
  assert.equal(page.objects[0]?.objectRole, "primary");
  assert.equal(page.objects[1]?.objectRole, "secondary");
  assert.equal(page.objects[1]?.objectKind, "text");
});

test("legacy single-object export contract normalizes to a primary object", () => {
  const exportContract = buildExternalMatrixExportContract(1);
  delete exportContract.pages[0]!.primaryObjectId;
  delete exportContract.pages[0]!.objects[0]!.objectRole;

  const plan = buildDeterministicStudioPreflightPlan({
    brief: "Create a one-page matrix.",
    requestedPageCount: 1,
    exportContract,
  });

  assert.equal(plan.exportContract.pages[0]?.primaryObjectId, "p1-external-matrix");
  assert.equal(plan.exportContract.pages[0]?.objects[0]?.objectRole, "primary");
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

test("external multi-object export contract primary errors throw clearly", () => {
  const noPrimaryContract = buildExternalMultiObjectExportContract();
  delete noPrimaryContract.pages[0]!.primaryObjectId;
  noPrimaryContract.pages[0]!.objects = noPrimaryContract.pages[0]!.objects.map((object) => ({
    ...object,
    objectRole: "secondary",
  }));
  assert.throws(
    () =>
      buildDeterministicStudioPreflightPlan({
        brief: "Create one page.",
        requestedPageCount: 1,
        exportContract: noPrimaryContract,
      }),
    /External exportContract page 1 must declare primaryObjectId or exactly one primary object\./,
  );

  const twoPrimaryContract = buildExternalMultiObjectExportContract();
  twoPrimaryContract.pages[0]!.objects = twoPrimaryContract.pages[0]!.objects.map((object) => ({
    ...object,
    objectRole: "primary",
  }));
  assert.throws(
    () =>
      buildDeterministicStudioPreflightPlan({
        brief: "Create one page.",
        requestedPageCount: 1,
        exportContract: twoPrimaryContract,
      }),
    /External exportContract page 1 has multiple primary objects:/,
  );

  const badPrimaryIdContract = buildExternalMultiObjectExportContract();
  badPrimaryIdContract.pages[0]!.primaryObjectId = "missing-object";
  badPrimaryIdContract.pages[0]!.objects = badPrimaryIdContract.pages[0]!.objects.map((object) => ({
    ...object,
    objectRole: object.objectRole === "primary" ? undefined : object.objectRole,
  }));
  assert.throws(
    () =>
      buildDeterministicStudioPreflightPlan({
        brief: "Create one page.",
        requestedPageCount: 1,
        exportContract: badPrimaryIdContract,
      }),
    /External exportContract page 1 primaryObjectId missing-object does not match any object\./,
  );

  const duplicateObjectContract = buildExternalMultiObjectExportContract();
  duplicateObjectContract.pages[0]!.objects[1] = {
    ...duplicateObjectContract.pages[0]!.objects[1]!,
    objectId: duplicateObjectContract.pages[0]!.objects[0]!.objectId,
  };
  assert.throws(
    () =>
      buildDeterministicStudioPreflightPlan({
        brief: "Create one page.",
        requestedPageCount: 1,
        exportContract: duplicateObjectContract,
      }),
    /External exportContract page 1 has duplicate objectId p1-external-matrix\./,
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

  assert.match(prompt, /Semantic object boundaries:/);
  assert.match(prompt, /primary: place data-studio-object-id="p1-external-matrix" on the primary-visual matrix root/);
  assert.match(prompt, /data-studio-object-id="p1-external-matrix"/);
  assert.doesNotMatch(prompt, /Object grammar:/);
  assert.doesNotMatch(prompt, /Page content must be composed from root objects/);
  assert.match(prompt, /not a visible frame, card, panel, or module shell/);
  assert.doesNotMatch(prompt, /Required root attrs:/);
  assert.doesNotMatch(prompt, /data-export-contract='/);
  assert.doesNotMatch(prompt, /metadata compiler/i);
  assert.doesNotMatch(prompt, /data-export-/);
  assert.doesNotMatch(prompt, /missing-data/i);
  assert.doesNotMatch(prompt, /renderTarget/i);
  assert.match(prompt, /Matrix brief: build one editable point-map 2x2 field/);
  assert.match(prompt, /point-map means an open coordinate field with dots or bubbles and direct text labels beside the points/);
  assert.match(prompt, /x-axis "Market growth" and y-axis "Competitive position"/);
  assert.match(prompt, /right-side conclusion rail subordinate/);
  assert.match(prompt, /Shape language: square-corner rectangles/);
  assert.match(prompt, /Visual intent: consulting matrix-led decision field, center canvas with annotation ring, executive density\./);
  assert.doesNotMatch(prompt, /^- (?:Page IR v1|layoutArchetype:|visualGrammar:|composition:|density:)/m);
  assert.doesNotMatch(prompt, /^- (?:Visual Grammar Registry|dominant slot:|required slots:|watch-outs:)/m);
  assert.match(prompt, /workspace headings, route labels, and planning titles are private context/i);
});

test("page prompt lists family-specific strong chart data contract requirements", () => {
  const rawBrief = "Create a one-page visual chart comparing revenue by segment.";
  const exportContract = buildExternalSingleObjectExportContract({
    objectId: "p1-primary-chart",
    objectKind: "chart-visual",
    renderTarget: "visual-snapshot",
    dataContract: {
      type: "chart-bar",
      categories: ["Ads", "Games"],
      series: [{ name: "Revenue", values: [42, 58] }],
    },
  });
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
    pageTitle: "Revenue by segment",
    goal: "Compare revenue by segment.",
    story: "The chart should use contract data.",
  };

  const prompt = buildPagePrompt({
    brief: rawBrief,
    deckTitle: "Revenue by segment",
    page,
    allPages: [page],
    styleProfile,
    thinkingContext: preparation.thinkingContext,
    briefSynthesis: preparation.briefSynthesis,
    complexityProfile: preparation.complexityProfile,
    preflight,
  });

  assert.match(prompt, /primary: place data-studio-object-id="p1-primary-chart" on the primary-visual chart-visual root/);
  assert.match(prompt, /data-studio-object-id="p1-primary-chart"/);
  assert.doesNotMatch(prompt, /data-export-contract='/);
  assert.match(prompt, /Chart module: render the chart inside this root/);
  assert.match(prompt, /data-html-chart-spec/);
});

test("page prompt includes primary and secondary export object metadata rules", () => {
  const rawBrief = "Create a one-page matrix with a supporting text note.";
  const exportContract = buildExternalMultiObjectExportContract();
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
    pageTitle: "Matrix with note",
    goal: "Compare segment positions and add a note.",
    story: "The matrix is primary while the note is secondary.",
  };

  const prompt = buildPagePrompt({
    brief: rawBrief,
    deckTitle: "Matrix with note",
    page,
    allPages: [page],
    styleProfile,
    thinkingContext: preparation.thinkingContext,
    briefSynthesis: preparation.briefSynthesis,
    complexityProfile: preparation.complexityProfile,
    preflight,
  });

  assert.match(prompt, /primary: place data-studio-object-id="p1-external-matrix" on the primary-visual matrix root/);
  assert.match(prompt, /secondary: place data-studio-object-id="p1-secondary-text" on the evidence-note\/callout text root/);
  assert.doesNotMatch(prompt, /Every contract object must have its own independent root element/);
  assert.doesNotMatch(prompt, /Object grammar:/);
  assert.match(prompt, /data-studio-object-id="p1-secondary-text"/);
  assert.match(prompt, /Multiple objects: use separate roots only for genuinely separate exhibits/);
});

test("diagram page prompt keeps chart and export implementation words out of the creative brief", () => {
  const rawBrief = [
    "Create a 1-page consulting-style strategy slide.",
    "Observed facts: 48% digital contacts, 18% straight-through resolution, 62% cost-to-income.",
    "Page 1 title: AI margin reset requires an operating model shift.",
    "Story claim: The profitability gap is driven by unresolved digital work, not lack of channels.",
    "Layout / structure cue: hero + evidence rail.",
    "Primary visual object: one dominant operating-model figure showing three stacked layers: demand migration, workflow automation, control layer.",
    "Required labels: 48% digital contacts, 18% straight-through, 62% cost-to-income.",
    "Must not become: generic title slide, icon row, dashboard, or four equal cards.",
  ].join("\n");
  const preflight = buildDeterministicStudioPreflightPlan({
    brief: rawBrief,
    requestedPageCount: 1,
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
    pageTitle: "AI margin reset requires an operating model shift",
    goal: "Show the operating-model figure.",
    story: "The profitability gap is driven by unresolved digital work.",
  };

  const prompt = buildPagePrompt({
    brief: rawBrief,
    deckTitle: "AI margin reset",
    page,
    allPages: [page],
    styleProfile,
    thinkingContext: preparation.thinkingContext,
    briefSynthesis: preparation.briefSynthesis,
    complexityProfile: preparation.complexityProfile,
    preflight,
  });

  assert.equal(preflight.exportContract.pages[0]?.objects[0]?.objectKind, "diagram");
  assert.doesNotMatch(prompt, /html-chart-module|data-html-chart-spec|chart-visual|metadata compiler|data-export-/i);
  assert.match(prompt, /Primary visual object: one dominant operating-model figure/);
  assert.match(prompt, /Required labels: 48% digital contacts/);
  assert.match(prompt, /Must not become: generic title slide/);
  assert.ok((prompt.match(/\bDo not\b/g)?.length ?? 0) <= 10);
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

test("explicit page blueprint preserves unquoted titles before role fallback keywords", () => {
  const brief = `Create a 5-page Tencent deck.
Page 1: Tencent has four cash-flow engines, but AI monetization should be read through mix quality
Story claim: Tencent's 2C AI case is strongest when games, ads, fintech, and cloud are shown as one cash-flow portfolio.
Page 2: The AI opportunity clusters where Tencent already owns users, content, and payments
Story claim: The most investable AI use cases sit in the upper-right.
Page 3: Growth looks like a bar-and-line story: revenue scale plus margin recovery
Story claim: The valuation bridge needs both revenue recovery and margin recovery.
Page 4: The debate is not one risk; it is a three-column trade-off
Story claim: Risks should be expressed as an editable native table.
Page 5: The investment case is an upside waterfall, not a single-point target
Story claim: Final page should show base value, optionality, and execution risk.`;

  const plan = buildDeterministicStudioPreflightPlan({
    brief,
    requestedPageCount: 5,
  });

  assert.equal(plan.route.primaryKind, "explicit-page-blueprint");
  assert.equal(
    plan.pageMissions[1]?.title,
    "The AI opportunity clusters where Tencent already owns users, content, and",
  );
  assert.equal(plan.pageMissions[3]?.title, "The debate is not one risk; it is a three-column trade-off");
  assert.notEqual(plan.pageMissions[1]?.title, "Provider Fit by Use Case");
  assert.notEqual(plan.pageMissions[3]?.title, "Migration Risks and Rollback");
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
  assert.equal(plan.route.capabilities.sourceBacked, true);
  assert.ok(new Set(plan.exportContract.pages.map((page) => page.layoutArchetype)).size >= 3);
  assert.equal(plan.exportContract.pages[1]?.layoutArchetype, "annotation-stage");
  assert.equal(plan.exportContract.pages[2]?.layoutArchetype, "bubble-landscape");
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
  assert.match(prompt, /Page intent/);
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
