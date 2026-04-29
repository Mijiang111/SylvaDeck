import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveDeckStyleProfile } from "../../server/src/lib/industry-style.js";
import { buildSkillBackedPlanningPrompt } from "../../server/src/lib/studio-engine/core.js";
import { resolveStudioGenerationPreparation } from "../../server/src/lib/studio-engine/eval.js";
import {
  loadStudio3dHeroSkill,
  loadStudioAnalysisSkill,
  loadStudioThinkingModeSkill,
} from "../../server/src/lib/studio-engine/skills.js";
import { getStudioAiWorkspacePromptMeta } from "../../server/src/lib/studio-engine/workspace.js";
import type {
  DeckThinkingMode,
  StudioAiWorkspaceBlockId,
  StudioCapabilityCardId,
  StudioWorkloadLane,
} from "../../server/src/lib/studio-engine/contracts.js";
import type {
  GenerateStudioReportRequest,
  GenerationMode,
  ModuleUsageMode,
} from "../../server/src/lib/studio-engine/schemas.js";

type GoldenScenario = {
  id: string;
  label: string;
  prompt: string;
  pageCount?: number;
  generationMode?: GenerationMode;
  moduleUsageMode?: ModuleUsageMode;
  expectations: {
    thinkingMode?: DeckThinkingMode;
    workloadLane?: StudioWorkloadLane;
    subjectIncludes?: string[];
    deliverableIncludes?: string[];
    minPageIntents?: number;
    requiredWorkspaceBlocks?: StudioAiWorkspaceBlockId[];
    forbiddenWorkspaceBlocks?: StudioAiWorkspaceBlockId[];
    requiredCapabilityCards?: StudioCapabilityCardId[];
    forbiddenCapabilityCards?: StudioCapabilityCardId[];
    requiredTaskGrammarPackIds?: string[];
    minScore?: number;
  };
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactBaseDir = path.join(__dirname, "artifacts");

type GoldenCheck = {
  id: string;
  label: string;
  passed: boolean;
  points: number;
  detail: string;
};

function parseArgs(argv: string[]) {
  const scenarioIds: string[] = [];
  let outputDir: string | null = null;
  let noFail = false;

  for (const arg of argv) {
    if (arg.startsWith("--scenario=")) {
      scenarioIds.push(...arg.slice("--scenario=".length).split(",").map((item) => item.trim()).filter(Boolean));
      continue;
    }
    if (arg.startsWith("--output-dir=")) {
      outputDir = arg.slice("--output-dir=".length).trim() || null;
      continue;
    }
    if (arg === "--no-fail") {
      noFail = true;
    }
  }

  return {
    scenarioIds,
    outputDir,
    noFail,
  };
}

function includesToken(value: string, token: string) {
  return value.toLowerCase().includes(token.toLowerCase());
}

function includesAll(value: string, tokens: string[] | undefined) {
  return (tokens ?? []).every((token) => includesToken(value, token));
}

function addCheck(checks: GoldenCheck[], check: GoldenCheck) {
  checks.push(check);
}

function scoreChecks(checks: GoldenCheck[]) {
  const total = checks.reduce((sum, check) => sum + check.points, 0);
  const passed = checks
    .filter((check) => check.passed)
    .reduce((sum, check) => sum + check.points, 0);
  if (total <= 0) {
    return 100;
  }
  return Math.round((passed / total) * 100);
}

function createGeneratePayload(scenario: GoldenScenario): GenerateStudioReportRequest {
  return {
    brief: scenario.prompt,
    pageCount: scenario.pageCount,
    generationMode: scenario.generationMode ?? "standard",
    moduleUsageMode: scenario.moduleUsageMode ?? "disabled",
    htmlOutputMode: "static",
    agentConfig: {},
    publishedModules: [],
    moduleManifestSignature: "",
    attachments: [],
  };
}

function evaluateScenario(scenario: GoldenScenario) {
  const payload = createGeneratePayload(scenario);
  const preparation = resolveStudioGenerationPreparation({
    brief: payload.brief,
    requestedPageCount: payload.pageCount ?? null,
  });
  const styleProfile = resolveDeckStyleProfile({
    brief: payload.brief,
  }).profile;
  const planningPrompt = buildSkillBackedPlanningPrompt({
    payload,
    skill: loadStudioAnalysisSkill(),
    styleProfile,
    heroSkill: loadStudio3dHeroSkill(),
    thinkingContext: preparation.thinkingContext,
    thinkingSkill: loadStudioThinkingModeSkill(preparation.thinkingContext.mode),
    briefSynthesis: preparation.briefSynthesis,
    complexityProfile: preparation.complexityProfile,
    evalOverrides: preparation.evalOverrides,
  });
  const planningMeta = getStudioAiWorkspacePromptMeta(planningPrompt);
  const workspaceBlockIds = planningMeta?.workspaceBlockIds ?? [];
  const capabilityCardIds = planningMeta?.workspaceCapabilityCardIds ?? [];
  const taskGrammarPackIds = preparation.complexityProfile.taskGrammarPacks.map((pack) => pack.id);
  const checks: GoldenCheck[] = [];
  const expectations = scenario.expectations;

  if (expectations.thinkingMode) {
    addCheck(checks, {
      id: "thinking-mode",
      label: "Thinking mode",
      passed: preparation.thinkingContext.mode === expectations.thinkingMode,
      points: 18,
      detail: `expected ${expectations.thinkingMode}, got ${preparation.thinkingContext.mode}`,
    });
  }
  if (expectations.workloadLane) {
    addCheck(checks, {
      id: "workload-lane",
      label: "Workload lane",
      passed: preparation.complexityProfile.workloadLane === expectations.workloadLane,
      points: 16,
      detail: `expected ${expectations.workloadLane}, got ${preparation.complexityProfile.workloadLane}`,
    });
  }
  if (expectations.subjectIncludes?.length) {
    addCheck(checks, {
      id: "subject",
      label: "Subject extraction",
      passed: includesAll(preparation.briefSynthesis.subject, expectations.subjectIncludes),
      points: 14,
      detail: `subject "${preparation.briefSynthesis.subject}" should include ${expectations.subjectIncludes.join(", ")}`,
    });
  }
  if (expectations.deliverableIncludes?.length) {
    addCheck(checks, {
      id: "deliverable",
      label: "Deliverable extraction",
      passed: includesAll(preparation.briefSynthesis.deliverable, expectations.deliverableIncludes),
      points: 12,
      detail: `deliverable "${preparation.briefSynthesis.deliverable}" should include ${expectations.deliverableIncludes.join(", ")}`,
    });
  }
  if (expectations.minPageIntents) {
    addCheck(checks, {
      id: "page-intents",
      label: "Page intent coverage",
      passed: preparation.briefSynthesis.pageIntents.length >= expectations.minPageIntents,
      points: 14,
      detail: `expected at least ${expectations.minPageIntents}, got ${preparation.briefSynthesis.pageIntents.length}`,
    });
  }
  for (const blockId of expectations.requiredWorkspaceBlocks ?? []) {
    addCheck(checks, {
      id: `required-workspace-block:${blockId}`,
      label: `Required workspace block ${blockId}`,
      passed: workspaceBlockIds.includes(blockId),
      points: 8,
      detail: `planning workspace blocks: ${workspaceBlockIds.join(", ") || "none"}`,
    });
  }
  for (const blockId of expectations.forbiddenWorkspaceBlocks ?? []) {
    addCheck(checks, {
      id: `forbidden-workspace-block:${blockId}`,
      label: `Forbidden workspace block ${blockId}`,
      passed: !workspaceBlockIds.includes(blockId),
      points: 8,
      detail: `planning workspace blocks: ${workspaceBlockIds.join(", ") || "none"}`,
    });
  }
  for (const cardId of expectations.requiredCapabilityCards ?? []) {
    addCheck(checks, {
      id: `required-capability-card:${cardId}`,
      label: `Required capability card ${cardId}`,
      passed: capabilityCardIds.includes(cardId),
      points: 8,
      detail: `capability cards: ${capabilityCardIds.join(", ") || "none"}`,
    });
  }
  for (const cardId of expectations.forbiddenCapabilityCards ?? []) {
    addCheck(checks, {
      id: `forbidden-capability-card:${cardId}`,
      label: `Forbidden capability card ${cardId}`,
      passed: !capabilityCardIds.includes(cardId),
      points: 8,
      detail: `capability cards: ${capabilityCardIds.join(", ") || "none"}`,
    });
  }
  for (const packId of expectations.requiredTaskGrammarPackIds ?? []) {
    addCheck(checks, {
      id: `required-task-grammar:${packId}`,
      label: `Required task grammar ${packId}`,
      passed: taskGrammarPackIds.includes(packId),
      points: 8,
      detail: `task grammar packs: ${taskGrammarPackIds.join(", ") || "none"}`,
    });
  }

  const score = scoreChecks(checks);
  const minScore = expectations.minScore ?? 85;

  return {
    scenarioId: scenario.id,
    label: scenario.label,
    score,
    minScore,
    passed: score >= minScore && checks.every((check) => check.passed || score >= minScore),
    route: {
      thinkingMode: preparation.thinkingContext.mode,
      workloadLane: preparation.complexityProfile.workloadLane,
      subject: preparation.briefSynthesis.subject,
      deliverable: preparation.briefSynthesis.deliverable,
      contentConfidence: preparation.briefSynthesis.contentConfidence,
      taskGrammarPackIds,
    },
    workspace: {
      workspaceBlockIds,
      capabilityCardIds,
      workspacePromptChars: planningMeta?.workspacePromptChars ?? planningPrompt.length,
    },
    checks,
  };
}

function buildFailureReasons(result: ReturnType<typeof evaluateScenario>) {
  const reasons = result.checks
    .filter((check) => !check.passed)
    .map((check) => `${check.id}: ${check.detail}`);
  if (result.score < result.minScore) {
    reasons.unshift(`score ${result.score} is below minScore ${result.minScore}`);
  }
  return reasons;
}

function buildSummaryMarkdown(args: {
  results: ReturnType<typeof evaluateScenario>[];
  artifactRoot: string;
  latestRoot: string;
}) {
  const { results } = args;
  const passed = results.filter((result) => result.passed).length;
  const averageScore =
    results.length > 0
      ? Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length)
      : 0;
  const lines = [
    "# Golden Set Summary",
    "",
    `- scenarios: ${results.length}`,
    `- passed: ${passed}/${results.length}`,
    `- averageScore: ${averageScore}`,
    `- artifacts: ${args.artifactRoot}`,
    `- latest: ${args.latestRoot}`,
    "",
    "## Runs",
  ];

  for (const result of results) {
    const failedChecks = result.checks.filter((check) => !check.passed);
    lines.push(
      `- ${result.scenarioId}: score=${result.score}/${result.minScore}; ${result.passed ? "pass" : "fail"}; thinking=${result.route.thinkingMode}; lane=${result.route.workloadLane}${failedChecks.length ? `; failed=${failedChecks.map((check) => check.id).join(", ")}` : ""}`,
    );
    if (!result.passed || failedChecks.length > 0) {
      for (const reason of buildFailureReasons(result)) {
        lines.push(`  - ${reason}`);
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

async function readScenarios() {
  const scenarioPath = path.join(__dirname, "scenarios.json");
  const raw = await fs.readFile(scenarioPath, "utf8");
  return JSON.parse(raw) as GoldenScenario[];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scenarios = await readScenarios();
  const filteredScenarios = scenarios.filter(
    (scenario) => args.scenarioIds.length === 0 || args.scenarioIds.includes(scenario.id),
  );
  if (filteredScenarios.length === 0) {
    throw new Error("No golden-set scenarios matched the current filters.");
  }

  const results = filteredScenarios.map(evaluateScenario);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const artifactRoot = args.outputDir
    ? path.resolve(args.outputDir)
    : path.join(artifactBaseDir, timestamp);
  const latestRoot = path.join(artifactBaseDir, "latest");
  const summaryMarkdown = buildSummaryMarkdown({
    results,
    artifactRoot,
    latestRoot,
  });
  const summary = {
    generatedAt: new Date().toISOString(),
    artifactRoot,
    latestRoot,
    scenarioCount: results.length,
    passedCount: results.filter((result) => result.passed).length,
    averageScore: Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length),
    results: results.map((result) => ({
      ...result,
      failureReasons: buildFailureReasons(result),
    })),
  };

  await fs.mkdir(artifactRoot, { recursive: true });
  await fs.writeFile(path.join(artifactRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(artifactRoot, "summary.md"), summaryMarkdown, "utf8");
  await fs.rm(latestRoot, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(path.dirname(latestRoot), { recursive: true });
  await fs.cp(artifactRoot, latestRoot, { recursive: true });

  process.stdout.write(`${summaryMarkdown}\n`);

  if (!args.noFail && results.some((result) => !result.passed)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
