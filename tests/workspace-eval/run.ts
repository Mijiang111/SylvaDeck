import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { resolveDeckStyleProfile } from "../../server/src/lib/industry-style.js";
import {
  getBlockingAgentChecks,
  resolveAgentConfig,
  testAgentConfig,
} from "../../server/src/lib/studio-engine/agent.js";
import {
  buildStudioEvalTraceMeta,
  resolveStudioGenerationPreparation,
} from "../../server/src/lib/studio-engine/eval.js";
import {
  buildPagePrompt,
  buildSkillBackedPlanningPrompt,
  runStudioGeneration,
} from "../../server/src/lib/studio-engine/core.js";
import {
  normalizeStudioText,
} from "../../server/src/lib/studio-engine/brief.js";
import {
  detectPromptScaffoldLeak,
  extractDeckSections,
} from "../../server/src/lib/studio-engine/render.js";
import {
  measurementNeedsRepair,
} from "../../server/src/lib/studio-engine/repair.js";
import {
  getStudioAiWorkspacePromptMeta,
} from "../../server/src/lib/studio-engine/workspace.js";

const VARIANTS = {
  auto: {
    id: "auto",
    label: "Auto routing",
    overrides: {},
  },
  "forced-deep": {
    id: "forced-deep",
    label: "Forced deep lane",
    overrides: {
      forceWorkloadLane: "deep",
    },
  },
  "forced-fast": {
    id: "forced-fast",
    label: "Forced fast lane",
    overrides: {
      forceWorkloadLane: "fast",
    },
  },
  "forced-neutral-mode": {
    id: "forced-neutral-mode",
    label: "Forced neutral mode",
    overrides: {
      forceThinkingMode: "neutral",
    },
  },
  "disable-task-grammar": {
    id: "disable-task-grammar",
    label: "Task grammar removed",
    overrides: {
      disableTaskGrammarPacks: true,
    },
  },
  "disable-layout-planning": {
    id: "disable-layout-planning",
    label: "Layout planning removed",
    overrides: {
      disableLayoutPlanningBlock: true,
    },
  },
};

const EVAL_ANALYSIS_SKILL = {
  path: null,
  body: "Use content logic first and keep the methodology lightweight.",
  hash: "workspace-eval-analysis",
  source: "fallback",
};

const EVAL_HERO_SKILL = {
  path: null,
  body: "Use 3D only when the brief explicitly asks for it.",
  hash: "workspace-eval-hero",
  source: "fallback",
  references: {
    "object-grammar-chip-platform": { path: null, body: "", hash: "a", source: "fallback" },
    "composition-families": { path: null, body: "", hash: "b", source: "fallback" },
    "material-and-annotation-language": { path: null, body: "", hash: "c", source: "fallback" },
    "prompt-examples": { path: null, body: "", hash: "d", source: "fallback" },
  },
};

const SCENARIOS = [
  {
    id: "ordinary-openai",
    label: "Ordinary sparse OpenAI",
    category: "ordinary-sparse",
    prompt: "1 page ppt for OpenAI",
    pageCount: 1,
    autoExpectations: {
      thinkingMode: "neutral",
      workloadLane: "fast",
      subjectIncludes: ["openai"],
      requiredPhraseGroups: [[/\bopenai\b/i]],
      forbiddenPhrases: [/\bbrief focus\b/i, /\bcore thesis\b/i, /\bone clear point\b/i],
    },
  },
  {
    id: "mode-case-study-shipping",
    label: "Task-first case-study",
    category: "mode-sensitive",
    prompt: `2 page ppt for case-study of application of Robotic in Shipping
\`\`\`{
As the cornerstone of global trade, the shipping industry handles over 80% of international trade volume, making its operational efficiency, safety, and sustainability critically important to global economic stability and development. For a long time, the traditional shipping industry has relied heavily on manual labor, facing multiple challenges such as harsh working environments, high labor intensity, continuously rising human resource costs, and frequent safety accidents caused by human error. According to the International Maritime Organization (IMO), 80% to 90% of maritime accidents are directly or indirectly related to unsafe human behaviors or decision-making errors [1]. At the same time, the global shipping industry is confronting increasingly stringent environmental regulations and intense market competition. This report will first comprehensively review the various technological forms and core principles of robotics applications in the current shipping industry.
}\`\`\``,
    pageCount: 2,
    autoExpectations: {
      thinkingMode: "case-study",
      subjectIncludes: ["shipping", "robotic", "robotics"],
      requiredPhraseGroups: [[/\bcase\b/i, /\bapplication\b/i], [/\boutcome\b/i, /\blesson\b/i, /\bchallenge\b/i]],
      forbiddenPhrases: [/\bresearch question\b/i, /\bmethod and result\b/i, /\bexecutive summary\b/i, /\bstrategic implications\b/i],
    },
  },
  {
    id: "mode-academic-research",
    label: "Academic research presentation",
    category: "mode-sensitive",
    prompt:
      "3 page academic research presentation on long-context retrieval degradation in enterprise QA. Keep research question, method, result, and interpretation explicit.",
    pageCount: 3,
    autoExpectations: {
      thinkingMode: "academic-research",
      subjectIncludes: ["retrieval", "enterprise qa", "long-context"],
      requiredPhraseGroups: [[/\bresearch question\b/i], [/\bmethod\b/i], [/\bresult\b/i], [/\binterpretation\b/i]],
      forbiddenPhrases: [/\bstrategic implications\b/i, /\bexecutive summary\b/i, /\brecommendation\b/i],
    },
  },
  {
    id: "deep-valuation",
    label: "Finance-grade valuation",
    category: "deep-grade",
    prompt: "1 page Top Ibank level Codex Product Valuation",
    pageCount: 1,
    autoExpectations: {
      workloadLane: "deep",
      subjectIncludes: ["codex"],
      deliverableIncludes: ["valuation"],
      requiredPhraseGroups: [[/\bvaluation\b/i], [/\bdriver\b/i, /\bdrivers\b/i, /\bvalue\b/i], [/\bscenario\b/i]],
      forbiddenPhrases: [/\bbrief focus\b/i, /\bone clear point\b/i, /\bcore thesis\b/i],
    },
  },
  {
    id: "deep-architecture-review",
    label: "Technical architecture review",
    category: "deep-grade",
    prompt:
      "3 page technical architecture review of a low-latency enterprise retrieval serving stack. Focus on system judgment, bottleneck, constraint, and trade-off.",
    pageCount: 3,
    autoExpectations: {
      workloadLane: "deep",
      subjectIncludes: ["retrieval", "serving stack", "enterprise"],
      requiredPhraseGroups: [[/\barchitecture\b/i, /\bsystem\b/i], [/\bconstraint\b/i, /\bbottleneck\b/i], [/\btrade-?off\b/i]],
      forbiddenPhrases: [/\bexecutive summary\b/i, /\bstrategic implications\b/i],
    },
  },
  {
    id: "deep-research-readout",
    label: "Research result readout",
    category: "deep-grade",
    prompt:
      "2 page research result readout on long-context retrieval degradation in enterprise QA. Keep the method boundary and interpretation explicit.",
    pageCount: 2,
    autoExpectations: {
      thinkingMode: "academic-research",
      workloadLane: "deep",
      subjectIncludes: ["retrieval", "enterprise qa", "long-context"],
      requiredPhraseGroups: [[/\bresult\b/i, /\breadout\b/i], [/\bmethod\b/i], [/\binterpretation\b/i, /\bboundary\b/i]],
      forbiddenPhrases: [/\bstrategic implications\b/i, /\bexecutive summary\b/i],
    },
  },
  {
    id: "control-explicit-3d",
    label: "Explicit 3D control",
    category: "controls",
    prompt:
      "Create a 3-page report on a next-generation AI chip system. Make page 1 a strong 3D cutaway concept page that explains the physical system object.",
    pageCount: 3,
    autoExpectations: {
      requiredPhraseGroups: [],
      forbiddenPhrases: [],
      control: "explicit-3d",
    },
  },
  {
    id: "control-chart-first",
    label: "Chart-first control",
    category: "controls",
    prompt:
      "Create a 2-page report on outpatient clinic congestion. Make page 1 a bar chart comparing referral intake, clinician capacity, and discharge lag.",
    pageCount: 2,
    autoExpectations: {
      requiredPhraseGroups: [],
      forbiddenPhrases: [],
      control: "chart-first",
    },
  },
];

const VARIANTS_BY_CATEGORY = {
  "ordinary-sparse": ["auto", "forced-deep", "disable-layout-planning"],
  "mode-sensitive": ["auto", "forced-neutral-mode"],
  "deep-grade": ["auto", "forced-fast", "disable-task-grammar", "disable-layout-planning"],
  controls: ["auto"],
};

function parseArgs(argv) {
  const args = {
    live: process.env.STUDIO_WORKSPACE_EVAL_LIVE === "1",
    scenarioIds: [],
    variantIds: [],
    outputDir: process.env.PPT_STUDIO_WORKSPACE_EVAL_OUTPUT_DIR?.trim() || "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--live") {
      args.live = true;
      continue;
    }
    if (token === "--scenario" && argv[index + 1]) {
      args.scenarioIds.push(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === "--variant" && argv[index + 1]) {
      args.variantIds.push(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === "--output" && argv[index + 1]) {
      args.outputDir = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

function resolveScenarioVariants(scenario, filters) {
  const variantIds = VARIANTS_BY_CATEGORY[scenario.category] ?? ["auto"];
  if (!filters.variantIds.length) {
    return variantIds;
  }
  return variantIds.filter((id) => filters.variantIds.includes(id));
}

function normalizeText(text) {
  return normalizeStudioText(String(text ?? "")).toLowerCase();
}

function includesAny(text, candidates) {
  const normalized = normalizeText(text);
  return candidates.some((candidate) => normalized.includes(normalizeText(candidate)));
}

function scoreCompositionDiversity(fingerprints) {
  if (fingerprints.length === 0) {
    return {
      uniqueFamilyCount: 0,
      largestRepeatRun: 0,
      diversityScore: 1,
      repeatedFamilies: [],
    };
  }

  const families = fingerprints.map((fingerprint) => fingerprint.family);
  const uniqueFamilyCount = new Set(families).size;
  let largestRepeatRun = 1;
  let currentRun = 1;
  const repeatedFamilies = new Set();

  for (let index = 1; index < families.length; index += 1) {
    if (families[index] === families[index - 1]) {
      currentRun += 1;
      repeatedFamilies.add(families[index]);
      largestRepeatRun = Math.max(largestRepeatRun, currentRun);
    } else {
      currentRun = 1;
    }
  }

  return {
    uniqueFamilyCount,
    largestRepeatRun,
    diversityScore: Number(
      Math.max(
        0,
        Math.min(1, uniqueFamilyCount / Math.max(1, families.length) - Math.max(0, largestRepeatRun - 2) * 0.14),
      ).toFixed(2),
    ),
    repeatedFamilies: [...repeatedFamilies],
  };
}

async function createBrowser() {
  return chromium.launch({ headless: true });
}

function buildStandaloneSectionHtml(sectionHtml) {
  return [
    "<!DOCTYPE html>",
    '<html><head><meta charset="utf-8" /></head>',
    '<body style="margin:0;padding:0;background:#ece7df;">',
    sectionHtml,
    "</body></html>",
  ].join("");
}

async function measureReport(browser, report) {
  const page = await browser.newPage({
    viewport: { width: 1720, height: 980 },
  });

  try {
    const sections = extractDeckSections(report.html);
    const measurements = [];

    for (const section of sections) {
      await page.setContent(buildStandaloneSectionHtml(section.sectionHtml), {
        waitUntil: "domcontentloaded",
      });
      await page.evaluate(async () => {
        if (document.fonts?.ready) {
          await document.fonts.ready.catch(() => {});
        }
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
      });

      const measurement = await page.evaluate((pageNumber) => {
        const pageRoot = document.querySelector("section.page");
        if (!pageRoot) {
          return null;
        }

        const pageWidth = pageRoot.clientWidth || 1600;
        const pageHeight = pageRoot.clientHeight || 900;
        const titleText = (
          pageRoot.getAttribute("data-page-title") ||
          pageRoot.querySelector("h1")?.textContent ||
          ""
        ).replace(/\s+/g, " ").trim();
        const normalizedTitle = titleText.toLowerCase();
        const genericTitle =
          /^(?:core thesis|opening thesis|key pattern|what the evidence suggests)$/.test(normalizedTitle) ||
          /^(?:evidence page|results page|support|supporting detail|supporting result|page)\s+\d+$/.test(normalizedTitle) ||
          /^(?:synthesis|open questions)$/.test(normalizedTitle) ||
          /^(?:core view|case view|decision view|research view|report review|case review|decision review|research review)$/.test(normalizedTitle) ||
          /^the brief (?:points to|supports)\b/.test(normalizedTitle);
        const promptLeak =
          /^(create|build|make|prepare|draft|write|design|generate)\b/i.test(titleText) ||
          /\b(?:three-page|board deck|deck should|use the following evidence)\b/i.test(normalizedTitle) ||
          genericTitle;
        const repeatedInstruction =
          /\b(?:use the following evidence|what the deck should do|tone)\b/i.test(normalizedTitle);
        const truncated =
          titleText.length > 0 &&
          /[\s:-](?:on|for|with|about|to)$/i.test(titleText);

        function detectPromptScaffoldLeakLocal(text) {
          const normalizedText = text.replace(/\s+/g, " ").trim();
          return (
            /\b(?:user task brief|task rigor brief|renderer brief|proof plan|layout strategy|source material|selected template contract|capability cards|output rules|page argument contract|deck planning intent)\b/i.test(normalizedText) ||
            /\b(?:headline claim|support bullets?|evidence callouts?|evidence bullets?|page evidence bundle|brief digest|current page (?:goal|story|intent|objective)|page question)\s*:/i.test(normalizedText) ||
            /\bsupport bullet\s*\d+\b/i.test(normalizedText) ||
            /\bone-page thesis\b/i.test(normalizedText) ||
            /\bselected deep family\b/i.test(normalizedText) ||
            /\bthis page must answer exactly one\b/i.test(normalizedText) ||
            /\bat most\s+2\s+short\s+(?:bullets|callouts)\b/i.test(normalizedText) ||
            /\b(?:using|tied to|based on)\s+the supplied brief\b/i.test(normalizedText)
          );
        }

        function summarizeElement(element) {
          const rect = element.getBoundingClientRect();
          const top = Math.max(0, Math.round(rect.top));
          const left = Math.max(0, Math.round(rect.left));
          const width = Math.max(0, Math.round(rect.width));
          const height = Math.max(0, Math.round(rect.height));
          const right = Math.max(0, Math.round(rect.right));
          const bottom = Math.max(0, Math.round(rect.bottom));
          const blockId = element.getAttribute("data-html-block-id");
          const visualKind = element.getAttribute("data-html-visual-kind");
          const layoutId = element.getAttribute("data-html-layout-id");
          const tag = element.tagName.toLowerCase();
          const label = (blockId || visualKind || layoutId || tag).slice(0, 120);
          const textPreview = (element.innerText || "").replace(/\s+/g, " ").trim().slice(0, 120) || null;
          const kind =
            visualKind ||
            (tag === "svg" || tag === "canvas" ? "chart-frame" : tag === "li" ? "list" : tag);
          return {
            kind,
            role: element.getAttribute("data-export-role") || "",
            label,
            blockId,
            layoutId,
            visualKind,
            selector: blockId
              ? `[data-html-block-id="${blockId}"]`
              : layoutId
                ? `[data-html-layout-id="${layoutId}"]`
                : visualKind
                  ? `[data-html-visual-kind="${visualKind}"]`
                  : tag,
            textPreview,
            top,
            left,
            width,
            height,
            right,
            bottom,
            overflowX: right > pageWidth + 2,
            overflowY: bottom > pageHeight + 2,
          };
        }

        const topLevelRegions = Array.from(pageRoot.children)
          .slice(0, 16)
          .map((element) => summarizeElement(element));
        const semanticNodeElements = Array.from(
          pageRoot.querySelectorAll(
            '[data-html-visual-kind], [data-html-block-id], [data-html-layout-id], h1, h2, h3, p, li, svg, canvas, figure, aside, article, section > div, section > article, section > aside'
          ),
        ).filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width >= 32 && rect.height >= 12;
        });
        const semanticSummaries = semanticNodeElements.map((element) => summarizeElement(element));
        const textCharacterCount = (pageRoot.innerText || "").replace(/\s+/g, " ").trim().length;
        const promptScaffoldLeak = detectPromptScaffoldLeakLocal(pageRoot.innerText || "");
        const chartRegionCount = pageRoot.querySelectorAll(
          '[data-html-visual-kind="chart-frame"], svg, canvas',
        ).length;
        const semanticModuleCount = semanticSummaries.length;
        const longestBlockHeight = semanticSummaries.reduce(
          (maxHeight, element) => Math.max(maxHeight, element.height),
          0,
        );
        const footerCandidates = topLevelRegions.filter(
          (element) => element.top >= pageHeight * 0.74 || element.bottom >= pageHeight - 90,
        );
        const footerHeight =
          footerCandidates.length > 0
            ? Math.max(...footerCandidates.map((element) => element.bottom)) -
              Math.min(...footerCandidates.map((element) => element.top))
            : 0;
        const rightRailCandidates = [...semanticSummaries, ...topLevelRegions].filter(
          (element) => element.left >= pageWidth * 0.58,
        );
        const rightRailHeight =
          rightRailCandidates.length > 0
            ? Math.max(...rightRailCandidates.map((element) => element.bottom)) -
              Math.min(...rightRailCandidates.map((element) => element.top))
            : 0;
        const denseGridCount = semanticSummaries.filter(
          (element) => element.width >= 180 && element.width <= 520 && element.height >= 120,
        ).length;
        const suspectElements = semanticSummaries
          .filter((element) => element.overflowX || element.overflowY)
          .slice(0, 12);

        function inferColumnCount() {
          const candidateRegions = topLevelRegions
            .filter((element) => element.width >= 180 && element.height >= 80)
            .sort((left, right) => left.left - right.left);
          const anchors = [];
          for (const element of candidateRegions) {
            const existing = anchors.find((anchor) => Math.abs(anchor - element.left) <= 120);
            if (existing === undefined) {
              anchors.push(element.left);
            }
          }
          return Math.max(1, Math.min(4, anchors.length || 1));
        }

        const columnCount = inferColumnCount();
        const hasHero =
          Array.from(pageRoot.querySelectorAll("h1, h2")).some((element) => {
            const rect = element.getBoundingClientRect();
            return rect.top <= pageHeight * 0.3 && rect.width >= pageWidth * 0.3;
          }) ||
          topLevelRegions.some((element) => element.top <= pageHeight * 0.24 && element.width >= pageWidth * 0.45);
        const hasChart = chartRegionCount > 0;
        const hasRightRail = rightRailHeight >= pageHeight * 0.28;
        const hasFooter = footerHeight >= 120;
        const primaryEvidenceRegion = hasChart
          ? "chart"
          : denseGridCount >= 4
            ? "comparison"
            : semanticSummaries.filter((element) => ["metric", "badge", "surface", "highlight"].includes(element.kind)).length >= 3
              ? "metrics"
              : "text";
        const family = hasChart && hasRightRail
          ? "chart-rail"
          : hasChart && hasHero
            ? "hero-chart"
            : denseGridCount >= 4
              ? "comparison-split"
              : semanticSummaries.filter((element) => element.kind === "div" && element.height >= 140).length >= 3 && columnCount >= 3
                ? "sequence-grid"
                : columnCount <= 1
                  ? "single-column"
                  : hasHero
                    ? "hero-proof"
                    : "mixed-editorial";

        let dominantOverflowRegion = "mixed-density";
        if (promptLeak || promptScaffoldLeak || truncated || repeatedInstruction) {
          dominantOverflowRegion = "title";
        } else if (chartRegionCount > 0 && rightRailHeight >= pageHeight * 0.34) {
          dominantOverflowRegion = "chart+sidebar";
        } else if (
          textCharacterCount >= 1800 &&
          longestBlockHeight >= pageHeight * 0.32 &&
          semanticSummaries.some((element) => element.top <= pageHeight * 0.32)
        ) {
          dominantOverflowRegion = "hero-copy";
        } else if (denseGridCount >= 4) {
          dominantOverflowRegion = "comparison-grid";
        } else if (footerHeight >= 160) {
          dominantOverflowRegion = "footer/appendix";
        }

        return {
          pageNumber,
          scrollHeight: pageRoot.scrollHeight,
          clientHeight: pageHeight,
          scrollWidth: pageRoot.scrollWidth,
          clientWidth: pageWidth,
          overflowX: pageRoot.scrollWidth > pageWidth + 2,
          overflowY: pageRoot.scrollHeight > pageHeight + 2,
          semanticModuleCount,
          textCharacterCount,
          chartRegionCount,
          dominantOverflowRegion,
          footerHeight,
          rightRailHeight,
          longestBlockHeight,
          topLevelRegions,
          suspectElements,
          compositionFingerprint: {
            family,
            columnCount,
            hasHero,
            hasChart,
            hasRightRail,
            hasFooter,
            primaryEvidenceRegion,
          },
          pageTitleQuality: {
            title: titleText,
            promptLeak: promptLeak || promptScaffoldLeak,
            truncated,
            repeatedInstruction,
            reason:
              promptLeak
                ? genericTitle
                  ? "title is a generic internal placeholder"
                  : "title looks like leaked prompt text"
                : promptScaffoldLeak
                  ? "visible page text contains workspace scaffold labels"
                : truncated
                  ? "title appears truncated"
                : repeatedInstruction
                  ? "title repeats instruction language"
                : null,
          },
          textMeasurements: [],
          predictedTextOverflow: false,
          predictedOverflowRoots: [],
        };
      }, section.pageNumber);

      if (measurement) {
        measurements.push(measurement);
      }
    }

    return measurements;
  } finally {
    await page.close();
  }
}

function buildPayloadForScenario(scenario) {
  return {
    brief: scenario.prompt,
    pageCount: scenario.pageCount ?? null,
    generationMode: scenario.generationMode ?? "standard",
    moduleUsageMode: scenario.moduleUsageMode ?? "disabled",
  };
}

function buildOfflineWorkspaceSnapshot(payload, preparation, variant) {
  const styleProfile = resolveDeckStyleProfile({
    brief: payload.brief,
  }).profile;
  const planningPrompt = buildSkillBackedPlanningPrompt({
    payload,
    skill: EVAL_ANALYSIS_SKILL,
    styleProfile,
    heroSkill: EVAL_HERO_SKILL,
    thinkingContext: preparation.thinkingContext,
    briefSynthesis: preparation.briefSynthesis,
    complexityProfile: preparation.complexityProfile,
    evalOverrides: variant.overrides,
  });
  const planningMeta = getStudioAiWorkspacePromptMeta(planningPrompt);
  const syntheticPages = preparation.briefSynthesis.pageIntents.map((pageIntent) => ({
    pageNumber: pageIntent.pageNumber,
    pageTitle: pageIntent.pageTitle,
    goal: pageIntent.pageQuestion,
    story: pageIntent.headlineClaim,
  }));
  const firstPage = preparation.briefSynthesis.pageIntents[0] ?? null;
  const firstPagePrompt = firstPage
    ? buildPagePrompt({
        brief: payload.brief,
        deckTitle: firstPage.pageTitle || preparation.briefSynthesis.subject || "Studio page",
        page: syntheticPages[0],
        allPages: syntheticPages,
        styleProfile,
        thinkingContext: preparation.thinkingContext,
        briefSynthesis: preparation.briefSynthesis,
        complexityProfile: preparation.complexityProfile,
        evalOverrides: variant.overrides,
        pageArgument: {
          pageQuestion: firstPage.pageQuestion,
          headlineClaim: firstPage.headlineClaim,
          supportBullets: firstPage.supportBullets,
          evidenceCallouts: firstPage.evidenceCallouts,
          takeaway: firstPage.takeaway,
        },
      })
    : null;
  const firstPageMeta = firstPagePrompt ? getStudioAiWorkspacePromptMeta(firstPagePrompt) : null;

  return {
    workspace: {
      planning: planningMeta
        ? {
            workspaceBlockIds: planningMeta.workspaceBlockIds,
            workspacePromptChars: planningMeta.workspacePromptChars,
            taskGrammarPackIds: planningMeta.taskGrammarPackIds ?? [],
          }
        : null,
      firstPage: firstPageMeta
        ? {
            workspaceBlockIds: firstPageMeta.workspaceBlockIds,
            workspacePromptChars: firstPageMeta.workspacePromptChars,
            selectedTemplateIds: firstPageMeta.workspaceSelectedTemplateIds ?? [],
            freeformLayoutFamily: firstPageMeta.freeformLayoutFamily ?? null,
            layoutStrategyFamily: firstPageMeta.layoutStrategyFamily ?? null,
          }
        : null,
    },
    preview: {
      planningPromptChars: planningPrompt.length,
      pagePromptChars: firstPagePrompt?.length ?? null,
    },
  };
}

function expectedRouteForScenario(scenario) {
  return {
    thinkingMode: scenario.autoExpectations.thinkingMode ?? null,
    workloadLane: scenario.autoExpectations.workloadLane ?? null,
  };
}

function evaluateRoute(scenario, variant, preparation) {
  const issues = [];
  const expectedRoute = expectedRouteForScenario(scenario);
  const subject = preparation.briefSynthesis.subject;
  const deliverable = preparation.briefSynthesis.deliverable;

  if (expectedRoute.thinkingMode && preparation.thinkingContext.mode !== expectedRoute.thinkingMode) {
    issues.push(`thinking mode expected ${expectedRoute.thinkingMode} but resolved ${preparation.thinkingContext.mode}`);
  }
  if (expectedRoute.workloadLane && preparation.complexityProfile.workloadLane !== expectedRoute.workloadLane) {
    issues.push(`workload lane expected ${expectedRoute.workloadLane} but resolved ${preparation.complexityProfile.workloadLane}`);
  }
  if (scenario.autoExpectations.subjectIncludes?.length && !includesAny(subject, scenario.autoExpectations.subjectIncludes)) {
    issues.push(`subject "${subject}" missed expected topic tokens`);
  }
  if (
    variant.id === "auto" &&
    scenario.autoExpectations.deliverableIncludes?.length &&
    !includesAny(deliverable, scenario.autoExpectations.deliverableIncludes)
  ) {
    issues.push(`deliverable "${deliverable}" missed expected deliverable tokens`);
  }

  return issues;
}

function evaluateOfflineWorkspacePreview(scenario, snapshot) {
  const structureIssues = [];
  const disciplineIssues = [];
  const planningBlocks = snapshot.workspace.planning?.workspaceBlockIds ?? [];
  const firstPageBlocks = snapshot.workspace.firstPage?.workspaceBlockIds ?? [];
  const taskGrammarPackIds = snapshot.workspace.planning?.taskGrammarPackIds ?? [];
  const layoutStrategyFamily = snapshot.workspace.firstPage?.layoutStrategyFamily ?? null;
  const selectedTemplateIds = snapshot.workspace.firstPage?.selectedTemplateIds ?? [];

  if (scenario.category === "ordinary-sparse") {
    if (
      planningBlocks.includes("task-rigor-brief") ||
      firstPageBlocks.includes("task-rigor-brief") ||
      firstPageBlocks.includes("proof-plan") ||
      firstPageBlocks.includes("layout-strategy")
    ) {
      disciplineIssues.push("ordinary sparse brief escalated into deep workspace blocks");
    }
  }

  if (scenario.category === "deep-grade") {
    if (!planningBlocks.includes("task-rigor-brief")) {
      structureIssues.push("deep-grade brief is missing task-rigor workspace guidance");
    }
    if (!planningBlocks.includes("proof-plan") && !firstPageBlocks.includes("proof-plan")) {
      structureIssues.push("deep-grade brief is missing proof-plan workspace guidance");
    }
    if (taskGrammarPackIds.length === 0) {
      structureIssues.push("deep-grade brief is missing task grammar packs");
    }
    if (!layoutStrategyFamily && selectedTemplateIds.length === 0) {
      disciplineIssues.push("deep-grade brief is missing layout-strategy guidance");
    }
  }

  return {
    structureIssues,
    disciplineIssues,
  };
}

function evaluateLiveHtml(scenario, reportHtml) {
  const hygieneIssues = [];
  const genreIssues = [];
  const structureIssues = [];
  const normalizedHtml = reportHtml.toLowerCase();

  if (/\bbrief focus\b/i.test(reportHtml)) {
    hygieneIssues.push('report HTML leaked "Brief focus"');
  }
  if (/\bcore thesis\b/i.test(reportHtml)) {
    hygieneIssues.push('report HTML leaked "Core thesis"');
  }
  if (detectPromptScaffoldLeak(reportHtml)) {
    hygieneIssues.push("report HTML leaked workspace scaffold language");
  }

  for (const phrase of scenario.autoExpectations.forbiddenPhrases ?? []) {
    if (phrase.test(reportHtml)) {
      if (scenario.category === "mode-sensitive") {
        genreIssues.push(`forbidden phrase matched: ${phrase}`);
      } else {
        structureIssues.push(`forbidden phrase matched: ${phrase}`);
      }
    }
  }

  for (const group of scenario.autoExpectations.requiredPhraseGroups ?? []) {
    if (group.length > 0 && !group.some((pattern) => pattern.test(reportHtml))) {
      structureIssues.push(
        `missing required phrase group: ${group.map((pattern) => pattern.toString()).join(" | ")}`,
      );
    }
  }

  if (/\bpage ppt\b/i.test(normalizedHtml) || /\bppt for\b/i.test(normalizedHtml) || /\bslides?\b/i.test(normalizedHtml)) {
    hygieneIssues.push("report HTML still contains task-shell language");
  }

  return {
    hygieneIssues,
    genreIssues,
    structureIssues,
  };
}

function evaluateControls(scenario, stageTraces, measurements) {
  const issues = [];
  const pageTraceEntries = stageTraces.filter((entry) =>
    /^page-render-|^page-fallback-|^page-\d+$/.test(entry.stage),
  );
  if (scenario.autoExpectations.control === "explicit-3d") {
    const threeDimensionalTraces = pageTraceEntries.filter(
      (entry) => entry.traceMeta.workspaceIncludes3dCard === true || entry.traceMeta.heroModelIntent === true,
    );
    if (threeDimensionalTraces.length !== 1) {
      issues.push(`expected exactly one explicit 3D page, found ${threeDimensionalTraces.length}`);
    }
  }

  if (scenario.autoExpectations.control === "chart-first") {
    const chartTrace = pageTraceEntries.some((entry) => entry.traceMeta.chartPageIntent === true);
    const chartMeasurement = measurements.some((measurement) => measurement.chartRegionCount > 0);
    if (!chartTrace && !chartMeasurement) {
      issues.push("expected chart-first evidence, but no chart signal was detected");
    }
  }

  return issues;
}

function buildQualityScore(args) {
  const baseScore = 100;
  const score =
    baseScore -
    args.routeIssues.length * 18 -
    args.hygieneIssues.length * 12 -
    args.genreIssues.length * 10 -
    args.structureIssues.length * 10 -
    args.disciplineIssues.length * 8;
  return Math.max(0, Math.min(100, score));
}

function summarizeWorkspace(stageTraces) {
  const planningTrace = stageTraces.find((entry) => entry.stage === "planning") ?? null;
  const firstPageTrace =
    stageTraces.find((entry) => entry.stage === "page-render-1") ??
    stageTraces.find((entry) => entry.stage === "page-fallback-1") ??
    stageTraces.find((entry) => entry.stage === "page-1") ??
    null;
  return {
    planning: planningTrace
      ? {
          workspaceBlockIds: planningTrace.traceMeta.workspaceBlockIds ?? [],
          workspacePromptChars: planningTrace.traceMeta.workspacePromptChars ?? null,
          taskGrammarPackIds: planningTrace.traceMeta.taskGrammarPackIds ?? [],
        }
      : null,
    firstPage: firstPageTrace
      ? {
          workspaceBlockIds: firstPageTrace.traceMeta.workspaceBlockIds ?? [],
          workspacePromptChars: firstPageTrace.traceMeta.workspacePromptChars ?? null,
          selectedTemplateIds: firstPageTrace.traceMeta.workspaceSelectedTemplateIds ?? [],
          freeformLayoutFamily: firstPageTrace.traceMeta.freeformLayoutFamily ?? null,
          layoutStrategyFamily: firstPageTrace.traceMeta.layoutStrategyFamily ?? null,
        }
      : null,
  };
}

async function runScenarioVariant(args) {
  const {
    browser,
    live,
    scenario,
    variant,
    agentConfig,
  } = args;
  const payload = buildPayloadForScenario(scenario);
  const runId = `workspace-eval-${scenario.id}-${variant.id}-${randomUUID().slice(0, 8)}`;
  const stageTraces = [];
  const startedAt = Date.now();
  const preparation = resolveStudioGenerationPreparation({
    brief: payload.brief,
    requestedPageCount: payload.pageCount,
    evalOverrides: variant.overrides,
  });
  const offlineWorkspaceSnapshot = buildOfflineWorkspaceSnapshot(payload, preparation, variant);
  const routeIssues = evaluateRoute(scenario, variant, preparation);
  const offlineWorkspaceIssues = evaluateOfflineWorkspacePreview(scenario, offlineWorkspaceSnapshot);
  let report = null;
  let enginePath = null;
  let measurements = [];
  let generationError = null;

  if (live) {
    try {
      const result = await runStudioGeneration({
        payload,
        agentConfig,
        runId,
        evalOverrides: variant.overrides,
        onStageTrace: async (entry) => {
          stageTraces.push(entry);
        },
      });
      report = result.report;
      enginePath = result.enginePath ?? null;
      measurements = await measureReport(browser, report);
    } catch (error) {
      generationError = error instanceof Error ? error.message : String(error);
    }
  }

  const durationMs = Date.now() - startedAt;
  const workspace = live ? summarizeWorkspace(stageTraces) : offlineWorkspaceSnapshot.workspace;
  const reviewMetrics = measurements.length
    ? {
        measurements,
        failingPages: measurements.filter((measurement) => measurementNeedsRepair(measurement, report?.pageCount)).map(
          (measurement) => measurement.pageNumber,
        ),
        repairCount: measurements.filter((measurement) => measurementNeedsRepair(measurement, report?.pageCount)).length,
        diversity: scoreCompositionDiversity(measurements.map((measurement) => measurement.compositionFingerprint)),
      }
    : {
        measurements: [],
        failingPages: [],
        repairCount: 0,
        diversity: scoreCompositionDiversity([]),
      };

  const htmlIssues = report ? evaluateLiveHtml(scenario, report.html) : {
    hygieneIssues: [],
    genreIssues: [],
    structureIssues: [...offlineWorkspaceIssues.structureIssues],
  };
  const disciplineIssues = [...offlineWorkspaceIssues.disciplineIssues];

  if (reviewMetrics.repairCount > 0) {
    disciplineIssues.push(`${reviewMetrics.repairCount} page(s) would enter repair`);
  }
  if (reviewMetrics.diversity.largestRepeatRun > 2) {
    disciplineIssues.push(`deck repeated one family ${reviewMetrics.diversity.largestRepeatRun} pages in a row`);
  }
  for (const measurement of reviewMetrics.measurements) {
    if (measurement.pageTitleQuality.promptLeak || measurement.pageTitleQuality.truncated || measurement.pageTitleQuality.repeatedInstruction) {
      htmlIssues.hygieneIssues.push(
        `page ${measurement.pageNumber} title quality issue: ${measurement.pageTitleQuality.reason ?? "title quality failure"}`,
      );
    }
  }
  const controlIssues = report ? evaluateControls(scenario, stageTraces, measurements) : [];
  disciplineIssues.push(...controlIssues);

  const qualityScore = buildQualityScore({
    routeIssues,
    hygieneIssues: htmlIssues.hygieneIssues,
    genreIssues: htmlIssues.genreIssues,
    structureIssues: htmlIssues.structureIssues,
    disciplineIssues,
  });

  return {
    runId,
    scenarioId: scenario.id,
    scenarioLabel: scenario.label,
    category: scenario.category,
    variantId: variant.id,
    variantLabel: variant.label,
    evalOverrides: variant.overrides,
    liveExecuted: live,
    generationError,
    route: {
      thinkingMode: preparation.thinkingContext.mode,
      workloadLane: preparation.complexityProfile.workloadLane,
      taskGrammarPackIds: preparation.complexityProfile.taskGrammarPacks.map((pack) => pack.id),
      subject: preparation.briefSynthesis.subject,
      deliverable: preparation.briefSynthesis.deliverable,
      contentConfidence: preparation.briefSynthesis.contentConfidence,
      routeIssues,
    },
    workspace,
    render: report
      ? {
          title: report.title,
          pageCount: report.pageCount,
          pageTitles: report.pageTitles,
          enginePath,
          pageFallbackCount: stageTraces.filter((entry) => entry.stage.startsWith("page-fallback-")).length,
          reviewMetrics,
          hygieneIssues: htmlIssues.hygieneIssues,
          genreIssues: htmlIssues.genreIssues,
          structureIssues: htmlIssues.structureIssues,
          disciplineIssues,
        }
      : null,
    performance: {
      totalDurationMs: durationMs,
      stageDurations: Object.fromEntries(stageTraces.map((entry) => [entry.stage, entry.pressureReport.durationMs])),
      stagePromptChars: live
        ? Object.fromEntries(stageTraces.map((entry) => [entry.stage, entry.pressureReport.promptLength]))
        : {
            planning: offlineWorkspaceSnapshot.preview.planningPromptChars,
            "page-render-1": offlineWorkspaceSnapshot.preview.pagePromptChars,
          },
      stagePayloadChars: live
        ? Object.fromEntries(stageTraces.map((entry) => [entry.stage, entry.pressureReport.payloadChars]))
        : {
            planning: JSON.stringify(payload).length,
            "page-render-1": JSON.stringify(payload).length,
          },
      evalTraceMeta: buildStudioEvalTraceMeta(variant.overrides),
    },
    stageTraces,
    scorecard: {
      runId,
      scenarioId: scenario.id,
      variantId: variant.id,
      liveExecuted: live,
      qualityScore,
      routeIssues,
      hygieneIssues: htmlIssues.hygieneIssues,
      genreIssues: htmlIssues.genreIssues,
      structureIssues: htmlIssues.structureIssues,
      disciplineIssues,
    },
  };
}

function comparePair(results, category, leftVariantId, rightVariantId) {
  const categoryResults = results.filter((result) => result.category === category);
  const scenarioIds = [...new Set(categoryResults.map((result) => result.scenarioId))];
  const comparisons = [];

  for (const scenarioId of scenarioIds) {
    const left = categoryResults.find(
      (result) => result.scenarioId === scenarioId && result.variantId === leftVariantId,
    );
    const right = categoryResults.find(
      (result) => result.scenarioId === scenarioId && result.variantId === rightVariantId,
    );
    if (!left || !right) {
      continue;
    }
    comparisons.push({
      scenarioId,
      leftVariantId,
      rightVariantId,
      delta: left.scorecard.qualityScore - right.scorecard.qualityScore,
      winner:
        left.scorecard.qualityScore === right.scorecard.qualityScore
          ? "tie"
          : left.scorecard.qualityScore > right.scorecard.qualityScore
            ? leftVariantId
            : rightVariantId,
    });
  }

  const leftWins = comparisons.filter((item) => item.winner === leftVariantId).length;
  const tieCount = comparisons.filter((item) => item.winner === "tie").length;
  const decidedTotal = comparisons.length - tieCount;
  return {
    category,
    leftVariantId,
    rightVariantId,
    comparisons,
    leftWins,
    tieCount,
    decidedTotal,
    total: comparisons.length,
    winRate: decidedTotal > 0 ? Number((leftWins / decidedTotal).toFixed(2)) : null,
  };
}

function buildSummary(results) {
  const routingAuto = results.filter((result) => result.variantId === "auto");
  const explicitModeScenarios = routingAuto.filter((result) =>
    ["mode-case-study-shipping", "mode-academic-research"].includes(result.scenarioId),
  );
  const deepLaneScenarios = routingAuto.filter((result) =>
    ["deep-valuation", "deep-architecture-review", "deep-research-readout"].includes(result.scenarioId),
  );
  const explicitModeRouteAccuracy =
    explicitModeScenarios.length > 0
      ? Number(
          (
            explicitModeScenarios.filter((result) => result.route.routeIssues.length === 0).length /
            explicitModeScenarios.length
          ).toFixed(2),
        )
      : null;
  const deepLaneRouteAccuracy =
    deepLaneScenarios.length > 0
      ? Number(
          (
            deepLaneScenarios.filter((result) => result.route.routeIssues.length === 0).length /
            deepLaneScenarios.length
          ).toFixed(2),
        )
      : null;

  const deepVsFast = comparePair(results, "deep-grade", "auto", "forced-fast");
  const sparseVsForcedDeep = comparePair(results, "ordinary-sparse", "auto", "forced-deep");
  const modeVsNeutral = comparePair(results, "mode-sensitive", "auto", "forced-neutral-mode");
  const grammarContribution = comparePair(results, "deep-grade", "auto", "disable-task-grammar");
  const layoutContributionDeep = comparePair(results, "deep-grade", "auto", "disable-layout-planning");
  const layoutContributionOrdinary = comparePair(results, "ordinary-sparse", "auto", "disable-layout-planning");

  const deepBenefits = deepVsFast.comparisons.filter((item) => item.delta > 0).map((item) => item.scenarioId);
  const overInterference = [
    ...sparseVsForcedDeep.comparisons.filter((item) => item.delta < 0).map((item) => item.scenarioId),
    ...modeVsNeutral.comparisons.filter((item) => item.delta < 0).map((item) => item.scenarioId),
  ];

  return {
    generatedAt: new Date().toISOString(),
    runCount: results.length,
    explicitModeRouteAccuracy,
    deepLaneRouteAccuracy,
    comparisons: {
      deepVsFast,
      sparseVsForcedDeep,
      modeVsNeutral,
      grammarContribution,
      layoutContributionDeep,
      layoutContributionOrdinary,
    },
    questions: {
      deepBenefits,
      overInterference,
      blockContribution: {
        taskGrammarAverageDelta:
          grammarContribution.comparisons.length > 0
            ? Number(
                (
                  grammarContribution.comparisons.reduce((sum, item) => sum + item.delta, 0) /
                  grammarContribution.comparisons.length
                ).toFixed(2),
              )
            : null,
        layoutAverageDeltaDeep:
          layoutContributionDeep.comparisons.length > 0
            ? Number(
                (
                  layoutContributionDeep.comparisons.reduce((sum, item) => sum + item.delta, 0) /
                  layoutContributionDeep.comparisons.length
                ).toFixed(2),
              )
            : null,
        layoutAverageDeltaOrdinary:
          layoutContributionOrdinary.comparisons.length > 0
            ? Number(
                (
                  layoutContributionOrdinary.comparisons.reduce((sum, item) => sum + item.delta, 0) /
                  layoutContributionOrdinary.comparisons.length
                ).toFixed(2),
              )
            : null,
      },
    },
    thresholds: {
      explicitModeRouteAccuracyPass: explicitModeRouteAccuracy === null ? null : explicitModeRouteAccuracy >= 1,
      deepLaneRouteAccuracyPass: deepLaneRouteAccuracy === null ? null : deepLaneRouteAccuracy >= 1,
      deepVsFastPass: deepVsFast.winRate === null ? null : deepVsFast.winRate >= 0.8,
      sparseVsForcedDeepPass: sparseVsForcedDeep.winRate === null ? null : sparseVsForcedDeep.winRate >= 0.8,
      modeVsNeutralPass: modeVsNeutral.winRate === null ? null : modeVsNeutral.winRate >= 0.9,
    },
  };
}

function buildSummaryMarkdown(summary, results, live) {
  const lines = [
    "# Workspace eval summary",
    "",
    `- live: ${live ? "yes" : "no"}`,
    `- runs: ${summary.runCount}`,
    `- explicit mode route accuracy: ${summary.explicitModeRouteAccuracy ?? "n/a"}`,
    `- deep lane route accuracy: ${summary.deepLaneRouteAccuracy ?? "n/a"}`,
    "",
    "## Counterfactuals",
    `- deep-grade auto vs forced-fast win rate: ${summary.comparisons.deepVsFast.winRate ?? "n/a"}`,
    `- ordinary-sparse auto vs forced-deep win rate: ${summary.comparisons.sparseVsForcedDeep.winRate ?? "n/a"}`,
    `- mode-sensitive auto vs forced-neutral win rate: ${summary.comparisons.modeVsNeutral.winRate ?? "n/a"}`,
    "",
    "## Questions",
    `- deep lane clearly helped: ${summary.questions.deepBenefits.join(", ") || "none"}`,
    `- over-interference candidates: ${summary.questions.overInterference.join(", ") || "none"}`,
    `- task grammar average delta: ${summary.questions.blockContribution.taskGrammarAverageDelta ?? "n/a"}`,
    `- layout planning average delta on deep scenarios: ${summary.questions.blockContribution.layoutAverageDeltaDeep ?? "n/a"}`,
    `- layout planning average delta on ordinary scenarios: ${summary.questions.blockContribution.layoutAverageDeltaOrdinary ?? "n/a"}`,
    "",
    "## Runs",
  ];

  for (const result of results) {
    lines.push(
      `- ${result.scenarioId} / ${result.variantId}: score=${result.scorecard.qualityScore}; route=${result.route.routeIssues.length}; hygiene=${result.scorecard.hygieneIssues.length}; genre=${result.scorecard.genreIssues.length}; structure=${result.scorecard.structureIssues.length}; discipline=${result.scorecard.disciplineIssues.length}${result.generationError ? `; error=${result.generationError}` : ""}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filteredScenarios = SCENARIOS.filter(
    (scenario) => args.scenarioIds.length === 0 || args.scenarioIds.includes(scenario.id),
  );

  if (filteredScenarios.length === 0) {
    throw new Error("No workspace-eval scenarios matched the current filters.");
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const artifactRoot =
    args.outputDir ||
    path.resolve(process.cwd(), "..", "tests", "workspace-eval", "artifacts", timestamp);
  await ensureDir(artifactRoot);

  const agentConfig = resolveAgentConfig();
  if (args.live) {
    const environment = await testAgentConfig(agentConfig);
    const blockingErrors = getBlockingAgentChecks(environment);
    if (blockingErrors.length > 0) {
      throw new Error(blockingErrors.map((check) => check.message).join(" "));
    }
  }

  const browser = args.live ? await createBrowser() : null;
  const results = [];

  try {
    for (const scenario of filteredScenarios) {
      const variantIds = resolveScenarioVariants(scenario, args);
      for (const variantId of variantIds) {
        const variant = VARIANTS[variantId];
        const result = await runScenarioVariant({
          browser,
          live: args.live,
          scenario,
          variant,
          agentConfig,
        });
        results.push(result);
        await fs.writeFile(
          path.join(artifactRoot, `${scenario.id}__${variant.id}__per-run.json`),
          JSON.stringify(result, null, 2),
          "utf8",
        );
      }
    }
  } finally {
    await browser?.close();
  }

  const summary = buildSummary(results);
  const summaryMarkdown = buildSummaryMarkdown(summary, results, args.live);
  await fs.writeFile(path.join(artifactRoot, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  await fs.writeFile(path.join(artifactRoot, "summary.md"), summaryMarkdown, "utf8");

  const latestRoot = path.resolve(process.cwd(), "..", "tests", "workspace-eval", "artifacts", "latest");
  await fs.rm(latestRoot, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(path.dirname(latestRoot), { recursive: true });
  await fs.cp(artifactRoot, latestRoot, { recursive: true });

  process.stdout.write(`${summaryMarkdown}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
