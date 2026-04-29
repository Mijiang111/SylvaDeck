import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  resolveDeckStyleProfile,
  toGeneratedReportStyleProfile,
} from "../industry-style.js";
import type { PageRecipe, PageRecipePlan } from "./contracts.js";
import type { GenerateStudioReportRequest } from "./schemas.js";
import type { StudioAgentConfig } from "./agent.js";
import { renderDeterministicPageFromRecipe } from "./page-render-boundary.js";
import { runStudioGenerationV2 } from "./core.js";
import { buildStructuredDiagramSpec } from "./structured-diagram.js";

const CONSULTING_SWIMLANE_BRIEF = `
Create one PPT page as a swimlane flowchart for a consulting project operating process.
Swimlanes: 客户 / 项目小组 / 专家委员会 / 埃森克咨询
Phase bands: 现状诊断 / 方案设计 / 辅导实施 / 长期服务
Process nodes to reproduce:
1 现场调研
2 标杆企业研究
3 形成诊断意见
4 讨论诊断报告
5 判断是否可行
6 汇报诊断结果
7 认可诊断报告
8 提出方案框架
9 讨论方案框架
10 判断是否可行
11 方案设计
12 审核项目成果
13 判断是否可行
14 汇报项目结果
15 认可项目成果
16 培训
17 分阶段辅导实施
18 长期顾问服务
`;

const CONSULTING_LABELS = [
  "现场调研",
  "标杆企业研究",
  "形成诊断意见",
  "讨论诊断报告",
  "判断是否可行",
  "汇报诊断结果",
  "认可诊断报告",
  "提出方案框架",
  "讨论方案框架",
  "方案设计",
  "审核项目成果",
  "汇报项目结果",
  "认可项目成果",
  "培训",
  "分阶段辅导实施",
  "长期顾问服务",
];

function createPage(overrides: Partial<PageRecipePlan["pages"][number]> = {}) {
  return {
    pageNumber: 1,
    pageTitle: "咨询业务项目运作流程",
    objective: "Reproduce the consulting process as a structured diagram.",
    insight: "A swimlane flow makes roles, stages, decisions, and handoffs explicit.",
    pageClass: "opening-core",
    compositionHint: "Use a swimlane process diagram.",
    layout: "sequence",
    desiredChartKind: "none",
    composite: "none",
    evidenceIds: [],
    moduleHints: [],
    ...overrides,
  } satisfies PageRecipePlan["pages"][number];
}

const styleProfile = resolveDeckStyleProfile({
  brief: CONSULTING_SWIMLANE_BRIEF,
}).profile;
const reportStyleProfile = toGeneratedReportStyleProfile(styleProfile);

function createRecipe(spec: NonNullable<ReturnType<typeof buildStructuredDiagramSpec>>): PageRecipe {
  return {
    pageNumber: 1,
    pageTitle: "咨询业务项目运作流程",
    pageIntent: "Reproduce a structured process diagram.",
    objective: "Reproduce a structured process diagram.",
    insight: "The process is organized by role, stage, and decision gate.",
    pageClass: "opening-core",
    densityBudget: {
      maxMajorRegions: 3,
      maxSupportBullets: 3,
      maxEvidenceBullets: 2,
      maxParagraphCharacters: 180,
      maxListItemCharacters: 90,
      maxListItemsPerList: 3,
      allowRightRail: true,
      allowFooterRail: false,
    },
    compositionHint: "Render the deterministic structured process diagram.",
    compositionPreset: "single-exhibit",
    layout: "sequence",
    chartPriority: "none",
    evidenceIds: [],
    evidenceBundle: [],
    heroClaim: "The operating process moves through role-owned decision gates.",
    supportBullets: [],
    evidenceBullets: [],
    takeaway: "Use the diagram structure as the slide body.",
    moduleBinding: null,
    chartSpec: null,
    secondaryChartSpec: null,
    diagramSpec: null,
    structuredDiagramSpec: spec,
    fallbackReason: null,
  };
}

test("structured diagram detection routes the consulting prompt to swimlane", () => {
  const spec = buildStructuredDiagramSpec({
    brief: CONSULTING_SWIMLANE_BRIEF,
    page: createPage(),
  });

  assert.ok(spec);
  assert.equal(spec.kind, "swimlane");
  assert.equal(spec.title, "咨询业务项目运作流程");
  assert.equal(spec.nodes.length, 18);
  assert.equal(spec.nodes.at(-1)?.label, "长期顾问服务");
  assert.equal(spec.nodes.filter((node) => node.shape === "decision").length, 3);
  assert.deepEqual(
    spec.lanes.map((lane) => lane.label),
    ["客户", "项目小组", "专家委员会", "埃森克咨询"],
  );
  assert.deepEqual(
    spec.phases.map((phase) => phase.label),
    ["现状诊断", "方案设计", "辅导实施", "长期服务"],
  );
});

test("structured diagram detection routes explicit gantt and roadmap prompts", () => {
  const spec = buildStructuredDiagramSpec({
    brief: `
Create a Gantt roadmap for the implementation workstreams.
Time buckets: Q1 2026 / Q2 2026 / Q3 2026 / Q4 2026
Workstreams: 1 Discovery, 2 Architecture, 3 Build, 4 Launch milestone
`,
    page: createPage({
      pageTitle: "Implementation Roadmap",
      objective: "Show the delivery roadmap as a Gantt chart.",
      insight: "The workstreams move from discovery to launch over four quarters.",
      compositionHint: "Use a Gantt chart.",
    }),
  });

  assert.ok(spec);
  assert.equal(spec.kind, "gantt");
  assert.deepEqual(spec.timeBuckets, ["Q1 2026", "Q2 2026", "Q3 2026", "Q4 2026"]);
  assert.equal(spec.tasks.length, 4);
  assert.equal(spec.tasks.at(-1)?.milestone, true);
});

test("structured diagram detection keeps project planning flowcharts out of the gantt lane", () => {
  const spec = buildStructuredDiagramSpec({
    brief: `
Observed facts - Create exactly one PPT page: a 25-step project planning process diagram.
Page title: 数字化转型项目规划流程.
This is a process diagram / flowchart / 流程图, not a prose project summary.
Use exactly these 25 numbered project planning steps:
1 明确项目愿景
2 确定业务目标
3 识别关键干系人
4 建立治理机制
5 梳理现状流程
6 盘点系统资产
7 评估数据质量
8 识别痛点机会
9 定义范围边界
10 拆解关键里程碑
11 设计目标蓝图
12 制定实施路线
13 评估资源能力
14 测算预算投入
15 确认优先级
16 形成项目章程
17 搭建核心团队
18 制定沟通计划
19 设计风险清单
20 判断是否具备启动条件
21 完成方案评审
22 锁定试点场景
23 启动第一阶段实施
24 监控进度偏差
25 复盘并进入下一阶段
Planning phases: 对齐目标 / 诊断评估 / 方案设计 / 启动实施 / 复盘迭代.
Visual thesis - planning moves through roadmap design, launch readiness, and iteration.
`,
    page: createPage({
      pageTitle: "数字化转型项目规划流程",
      objective: "Show the 25-step project planning process as a flowchart.",
      insight: "The planning process moves from alignment to iteration.",
      compositionHint: "Use a deterministic flowchart.",
    }),
  });

  assert.ok(spec);
  assert.equal(spec.kind, "flowchart");
  assert.equal(spec.nodes.length, 25);
  assert.equal(spec.tasks.length, 0);
  assert.equal(spec.nodes.filter((node) => node.shape === "decision").length, 1);
  assert.deepEqual(
    spec.phases.map((phase) => phase.label),
    ["对齐目标", "诊断评估", "方案设计", "启动实施", "复盘迭代"],
  );
  assert.equal(spec.nodes[0]?.label, "明确项目愿景");
  assert.equal(spec.nodes.at(-1)?.label, "复盘并进入下一阶段");
});

test("structured diagram detection requires timing cues for non-gantt roadmap wording", () => {
  const spec = buildStructuredDiagramSpec({
    brief: "Create a roadmap design summary with 1 Vision, 2 Discovery, 3 Launch, but no timed schedule.",
    page: createPage({
      pageTitle: "Roadmap Design Summary",
      objective: "Summarize roadmap design as prose.",
      insight: "Roadmap design needs sequencing but no diagram.",
      compositionHint: "Use a written summary.",
    }),
  });

  assert.equal(spec, null);
});

test("structured diagram detection avoids weak cash-flow and prose-only process prompts", () => {
  assert.equal(
    buildStructuredDiagramSpec({
      brief: "Create a one-page summary showing how cash flow improved after pricing work.",
      page: createPage({ compositionHint: "Use a concise executive summary." }),
    }),
    null,
  );
  assert.equal(
    buildStructuredDiagramSpec({
      brief: "Create a one-page process improvement summary with three findings and no diagram.",
      page: createPage({ compositionHint: "Use three concise narrative findings." }),
    }),
    null,
  );
});

test("swimlane renderer emits one deterministic page with labels, diamonds, lanes, phases, and metadata", () => {
  const spec = buildStructuredDiagramSpec({
    brief: CONSULTING_SWIMLANE_BRIEF,
    page: createPage(),
  });
  assert.ok(spec);

  const page = renderDeterministicPageFromRecipe({
    deckTitle: "Consulting Process",
    recipe: createRecipe(spec),
    styleProfile,
    reportStyleProfile,
    htmlOutputMode: "static",
  });

  assert.match(page.sectionHtml, /data-page-number="1"/);
  assert.equal((page.sectionHtml.match(/<section class="page"/g) ?? []).length, 1);
  assert.match(page.sectionHtml, /data-html-visual-kind="structured-diagram"/);
  assert.match(page.sectionHtml, /data-structured-diagram-kind="swimlane"/);
  assert.match(page.sectionHtml, /data-diagram-lane-id=/);
  assert.match(page.sectionHtml, /data-diagram-phase-id=/);
  assert.equal((page.sectionHtml.match(/data-diagram-node-shape="decision"/g) ?? []).length, 3);
  for (const label of CONSULTING_LABELS) {
    assert.match(page.sectionHtml, new RegExp(label));
  }
  for (const header of ["客户", "项目小组", "专家委员会", "埃森克咨询", "现状诊断", "方案设计", "辅导实施", "长期服务"]) {
    assert.match(page.sectionHtml, new RegExp(header));
  }
});

test("gantt renderer emits time buckets, task bars, milestones, and metadata", () => {
  const spec = buildStructuredDiagramSpec({
    brief: `
Create a Gantt roadmap for the implementation workstreams.
Time buckets: Q1 / Q2 / Q3 / Q4
Workstreams: 1 Discovery, 2 Architecture, 3 Build, 4 Launch milestone
`,
    page: createPage({
      pageTitle: "Implementation Roadmap",
      objective: "Show the delivery roadmap as a Gantt chart.",
      insight: "The workstreams move from discovery to launch over four quarters.",
      compositionHint: "Use a Gantt chart.",
    }),
  });
  assert.ok(spec);

  const page = renderDeterministicPageFromRecipe({
    deckTitle: "Implementation Roadmap",
    recipe: createRecipe(spec),
    styleProfile,
    reportStyleProfile,
    htmlOutputMode: "static",
  });

  assert.match(page.sectionHtml, /data-structured-diagram-kind="gantt"/);
  for (const bucket of ["Q1", "Q2", "Q3", "Q4"]) {
    assert.match(page.sectionHtml, new RegExp(bucket));
  }
  assert.match(page.sectionHtml, /data-gantt-task-id="task-1"/);
  assert.match(page.sectionHtml, /data-gantt-track-id="track-1"/);
  assert.match(page.sectionHtml, /data-gantt-milestone="true"/);
});

test("recognized structured diagram pages bypass model page-render and classic fallback", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "structured-diagram-stage-"));
  const commandPath = path.join(tempDir, "fake-agent.cjs");
  const promptLogPath = path.join(tempDir, "prompts.log");
  fs.writeFileSync(
    commandPath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const input = fs.readFileSync(0, "utf8");
fs.appendFileSync(${JSON.stringify(promptLogPath)}, input + "\\n---PROMPT---\\n");
process.stdout.write(JSON.stringify({ type: "assistant", message: { text: "{}" } }) + "\\n");
`,
  );
  fs.chmodSync(commandPath, 0o755);

  const agentConfig: StudioAgentConfig = {
    provider: "cursor",
    command: commandPath,
    model: "fake-model",
    cwd: tempDir,
    apiKey: "",
    baseUrl: "",
  };
  const payload: GenerateStudioReportRequest = {
    brief: CONSULTING_SWIMLANE_BRIEF,
    pageCount: 1,
    generationMode: "standard",
    moduleUsageMode: "disabled",
    htmlOutputMode: "static",
    agentConfig,
    publishedModules: [],
    moduleManifestSignature: "",
    attachments: [],
  };
  const assistantChunks: string[] = [];

  const result = await runStudioGenerationV2({
    payload,
    agentConfig,
    runId: "structured-diagram-test",
    emit: async (event) => {
      if (event.type === "assistant_chunk") {
        assistantChunks.push(event.content);
      }
    },
  });

  const loggedPrompts = fs
    .readFileSync(promptLogPath, "utf8")
    .split("\n---PROMPT---\n")
    .filter((entry) => entry.trim().length > 0);
  assert.equal(loggedPrompts.length, 1);
  assert.ok(
    assistantChunks.some((chunk) => chunk.includes("matched the structured-diagram lane (swimlane)")),
  );
  assert.equal(
    assistantChunks.some((chunk) => chunk.includes("fell back to the classic HTML prompt path")),
    false,
  );
  assert.match(result.report.html, /data-structured-diagram-kind="swimlane"/);
  assert.match(result.report.html, /长期顾问服务/);
});
