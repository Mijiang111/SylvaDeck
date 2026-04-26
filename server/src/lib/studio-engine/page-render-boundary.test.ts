import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveDeckStyleProfile,
  toGeneratedReportStyleProfile,
} from "../industry-style.js";
import type { HtmlAnimationPage, PageRecipe } from "./contracts.js";
import {
  buildFinalStudioReport,
  collectStudioDeckSections,
  collectStudioPageRenderResults,
  recoverDeterministicPageAfterRenderFailures,
  renderDeterministicPageFromRecipe,
} from "./page-render-boundary.js";

const styleProfile = resolveDeckStyleProfile({
  brief: "Create an industrial robotics adoption deck for shipping operations.",
}).profile;
const reportStyleProfile = toGeneratedReportStyleProfile(styleProfile);

const baseRecipe: PageRecipe = {
  pageNumber: 1,
  pageTitle: "Operator Trust Adoption",
  pageIntent: "Explain why robotics adoption depends on operator trust.",
  objective: "What unlocks robotics adoption in shipping operations?",
  insight: "Adoption moves when operators trust the handoff between robots and dock teams.",
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
  compositionHint: "hero-proof",
  layout: "hero-proof",
  chartPriority: "none",
  evidenceIds: [],
  evidenceBundle: [],
  heroClaim: "Operator trust is the adoption bottleneck.",
  supportBullets: [
    "Robots need explicit handoff boundaries.",
    "Teams need exception cues they can scan quickly.",
  ],
  evidenceBullets: ["Brief supplies a qualitative adoption claim, not measured data."],
  takeaway: "Design the operating model around trust before scaling automation.",
  moduleBinding: null,
  chartSpec: null,
  diagramSpec: null,
  fallbackReason: null,
};

test("deterministic page rendering validates a recipe-backed HTML page", () => {
  const page = renderDeterministicPageFromRecipe({
    deckTitle: "Robotics Adoption",
    recipe: baseRecipe,
    styleProfile,
    reportStyleProfile,
    htmlOutputMode: "static",
  });

  assert.equal(page.pageTitle, "Operator Trust Adoption");
  assert.match(page.pageHtml, /<!DOCTYPE html>/);
  assert.match(page.sectionHtml, /data-page-number="1"/);
  assert.match(page.sectionHtml, /Operator trust is the adoption bottleneck/);
});

test("page result collection orders sections and preserves first resolved model", () => {
  const animationPage: HtmlAnimationPage = {
    pageNumber: 1,
    anchors: ["hero"],
    manifest: null,
  };
  const results = [
    {
      pageNumber: 2,
      sectionHtml: '<section class="page" data-page-number="2"></section>',
      model: "gpt-page-2",
      animationPage: null,
    },
    {
      pageNumber: 1,
      sectionHtml: '<section class="page" data-page-number="1"></section>',
      model: null,
      animationPage,
    },
  ];

  const collection = collectStudioPageRenderResults(results);

  assert.deepEqual(
    collection.pageSections.map((section) => section.match(/data-page-number="(\d+)"/)?.[1]),
    ["1", "2"],
  );
  assert.deepEqual(results.map((result) => result.pageNumber), [2, 1]);
  assert.equal(collection.resolvedModel, "gpt-page-2");
  assert.deepEqual(collection.pageAnimationPages, [animationPage]);
});

test("deterministic recovery returns a valid page when primary and classic rendering fail", () => {
  const recovery = recoverDeterministicPageAfterRenderFailures({
    deckTitle: "Robotics Adoption",
    recipe: baseRecipe,
    styleProfile,
    reportStyleProfile,
    htmlOutputMode: "static",
    model: "gpt-fallback-test",
    primaryError: new Error("primary page renderer unavailable"),
    fallbackError: new Error("classic HTML prompt failed validation"),
  });

  assert.equal(recovery.model, "gpt-fallback-test");
  assert.equal(recovery.page.pageTitle, "Operator Trust Adoption");
  assert.match(recovery.pageSummary, /<!DOCTYPE html>/);
  assert.match(recovery.page.sectionHtml, /data-page-number="1"/);
  assert.deepEqual(recovery.failureSummary, {
    primary: "primary page renderer unavailable",
    fallback: "classic HTML prompt failed validation",
  });
});

test("deck section collection and final report builder share one assembly contract", () => {
  const page = renderDeterministicPageFromRecipe({
    deckTitle: "Robotics Adoption",
    recipe: baseRecipe,
    styleProfile,
    reportStyleProfile,
    htmlOutputMode: "static",
  });
  const collection = collectStudioDeckSections([
    {
      pageNumber: 2,
      sectionHtml:
        '<section class="page" data-page-number="2" data-page-title="Scale Proof" style="width:1600px;height:900px;"></section>',
      animationPage: null,
    },
    {
      pageNumber: 1,
      sectionHtml: page.sectionHtml,
      animationPage: page.animationPage ?? null,
    },
  ]);
  const report = buildFinalStudioReport({
    title: "Robotics Adoption",
    sections: collection.pageSections,
    brief: "Create an industrial robotics adoption deck for shipping operations.",
    styleProfile: reportStyleProfile,
    htmlOutputMode: "static",
    animationPages: collection.pageAnimationPages,
  });

  assert.equal(report.title, "Robotics Adoption");
  assert.equal(report.pageCount, 2);
  assert.deepEqual(report.pageTitles, ["Operator Trust Adoption", "Scale Proof"]);
  assert.equal(report.htmlOutputMode, "static");
});
