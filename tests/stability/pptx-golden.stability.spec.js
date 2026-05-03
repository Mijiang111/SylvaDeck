import { expect, test } from "@playwright/test";
import {
  downloadFromActions,
  generateDeckFromPrompt,
  renameFirstHeadline,
} from "./helpers/browser-helpers.mjs";
import { readDownloadedPptx } from "./helpers/download-helpers.mjs";
import { installStudioFixtureRoutes } from "./helpers/fixture-routes.mjs";

function firstSlideXml(pptx) {
  return pptx.slideXml[0]?.xml ?? "";
}

function combinedSlideXml(pptx) {
  return pptx.slideXml.map((entry) => entry.xml).join("\n");
}

function combinedChartXml(pptx) {
  return pptx.slideRelationships
    .flatMap((entry) => entry.chartXmlEntries ?? [])
    .map((entry) => entry.xml)
    .join("\n");
}

function allShapeBounds(pptx) {
  return pptx.slideObjects.flatMap((slide) => slide.shapeBounds ?? []);
}

function countTextOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

function countTextOccurrencesCaseInsensitive(text, needle) {
  return countTextOccurrences(text.toLowerCase(), needle.toLowerCase());
}

function expectNoNativeCharts(pptx) {
  expect(pptx.objectCounts.chartRelCount).toBe(0);
  expect(pptx.objectCounts.chartCount).toBe(0);
  expect(combinedChartXml(pptx)).toBe("");
}

function expectVisualChartSnapshots(pptx, expectedMinCount = 1) {
  expect(pptx.objectCounts.imageRelCount).toBeGreaterThanOrEqual(expectedMinCount);
  expect(pptx.objectCounts.pictureCount).toBeGreaterThanOrEqual(expectedMinCount);
  expect(pptx.mediaFiles.length).toBeGreaterThanOrEqual(expectedMinCount);
}

function expectShapesInsideSlide(pptx) {
  for (const bounds of allShapeBounds(pptx)) {
    expect(bounds.x).toBeGreaterThanOrEqual(-0.01);
    expect(bounds.y).toBeGreaterThanOrEqual(-0.01);
    expect(bounds.x + bounds.w).toBeLessThanOrEqual(13.343);
    expect(bounds.y + bounds.h).toBeLessThanOrEqual(7.51);
  }
}

function diagonalLineBounds(slideObject) {
  return (slideObject?.shapeBounds ?? []).filter(
    (bounds) =>
      bounds.preset === "line" &&
      Math.abs(bounds.w) > 0.2 &&
      Math.abs(bounds.h) > 0.02,
  );
}

function textShapeBounds(slideObject, text) {
  return (slideObject?.shapeBounds ?? []).find((bounds) => bounds.text === text);
}

test.describe("PPTX export golden matrix", () => {
  test("basic generated deck exports a measurable editable object mix", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "freeform-edit-export");
    const editedHeadline = "Export quality gate keeps the edited headline available in PowerPoint";

    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    await renameFirstHeadline(page, editedHeadline);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);

    expect(pptx.slideCount).toBe(3);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.combinedText.toLowerCase()).toContain(editedHeadline.toLowerCase());
    expect(pptx.objectCounts.textRunCount).toBeGreaterThan(4);
    expect(pptx.objectCounts.shapeCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.imageRelCount).toBe(0);
  });

  test("scientific diagram export keeps explanatory text editable and figure visible", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "academic-neural-network-3page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);

    expect(pptx.slideCount).toBe(3);
    expect(pptx.combinedText.toLowerCase()).toContain("dense reranking network");
    expect(pptx.combinedText.toLowerCase()).toContain("input layer");
    expect(pptx.objectCounts.textRunCount).toBeGreaterThan(4);
    expect(countTextOccurrencesCaseInsensitive(pptx.combinedText, "Input layer")).toBe(1);
    expect(countTextOccurrencesCaseInsensitive(pptx.combinedText, "Hidden 1")).toBe(1);
    expect(countTextOccurrencesCaseInsensitive(pptx.combinedText, "Hidden 2")).toBe(1);
    expect(
      countTextOccurrencesCaseInsensitive(
        pptx.combinedText,
        "Output score for final document order",
      ),
    ).toBe(1);
    expect(
      countTextOccurrences(
        pptx.combinedText,
        "Input features bundle lexical overlap, retrieval score, and context-quality signals.",
      ),
    ).toBe(1);
    expect(
      countTextOccurrences(
        pptx.combinedText,
        "A dense reranking MLP concentrates the method page into one editable figure",
      ),
    ).toBe(1);
    expect(pptx.objectCounts.connectorCount).toBeGreaterThanOrEqual(40);
    expect(pptx.objectCounts.ellipseCount).toBeGreaterThanOrEqual(15);
    expect(pptx.objectCounts.imageRelCount).toBe(0);
  });

  test("structured table exports as a native PowerPoint table", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "table-export-1page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);

    expect(pptx.slideCount).toBe(1);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.combinedText).toContain("Intake handoff");
    expect(pptx.combinedText).toContain("Exception routing");
    expect(pptx.objectCounts.tableCount).toBeGreaterThan(0);
  });

  test("unstructured SVG line chart exports as a stable visual snapshot", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "svg-line-export-1page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);

    expect(pptx.slideCount).toBe(1);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.combinedText).toContain("Illustrative demand pathways");
    expectNoNativeCharts(pptx);
    expectVisualChartSnapshots(pptx, 1);
  });

  test("attached McKinsey-style chart target exports stable visual snapshots", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "mckinsey-chart-target-1page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);
    const slideXml = firstSlideXml(pptx).toUpperCase();

    expect(pptx.slideCount).toBe(1);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.combinedText).toContain("Complex quantitative stories");
    expect(pptx.combinedText).toContain("A = quick win");
    expect(countTextOccurrences(pptx.combinedText, "A = quick win")).toBe(1);
    expect(
      countTextOccurrences(
        pptx.combinedText,
        "Illustrative demand pathways show divergence across scenarios",
      ),
    ).toBe(1);
    expect(pptx.combinedText).toContain("WHAT THIS DEMONSTRATES");
    expect(pptx.combinedText).toContain("EXECUTIVE STRUCTURING");
    expect(pptx.combinedText).toContain("DESIGN LANGUAGE");
    expectNoNativeCharts(pptx);
    expectVisualChartSnapshots(pptx, 3);
    expect(slideXml).not.toContain('HIDDEN="1"');
    expect(slideXml).not.toContain('DESCR=""/ HIDDEN');
    expect(pptx.objectCounts.connectorCount).toBe(0);
    expect(pptx.objectCounts.ellipseCount).toBe(0);
    expect(slideXml).toContain('TYPEFACE="TIMES"');
    await expect(page.getByText(/Downloaded editable PPTX, quality (9\d|100)/)).toBeVisible();
    await expect(page.getByText("gradient-flattened")).toHaveCount(0);
  });

  test("exported McKinsey chart HTML remains exportable", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "exported-mckinsey-chart-regression-1page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);
    const combinedUpper = pptx.combinedText.toUpperCase();

    expect(pptx.slideCount).toBe(1);
    expect(pptx.combinedText).toContain("Complex quantitative stories");
    expect(combinedUpper).toContain("USE CASE");
    expect(pptx.combinedText).toContain("Illustrative demand pathways");
    expect(pptx.combinedText).toContain("Illustrative value bridge");
    expect(pptx.combinedText).toContain("Prioritization matrix");
    expect(combinedUpper).toContain("LINE + AREA CHART");
    expect(combinedUpper).toContain("WATERFALL");
    expect(combinedUpper).toContain("BUBBLE MATRIX");
    expect(pptx.objectCounts.textRunCount).toBeGreaterThan(12);
    expect(pptx.objectCounts.shapeCount).toBeGreaterThan(20);
    expectNoNativeCharts(pptx);
    expectVisualChartSnapshots(pptx, 3);
    const decorativePageFrame = (pptx.slideObjects[0]?.shapeBounds ?? []).find(
      (bounds) => bounds.x < 0.45 && bounds.y < 0.35 && bounds.w > 12 && bounds.h > 6.5,
    );
    expect(decorativePageFrame).toBeTruthy();
    expect(decorativePageFrame?.fillTransparency ?? 0).toBeGreaterThanOrEqual(95);
    expect(firstSlideXml(pptx).toUpperCase()).not.toContain('DESCR=""/ HIDDEN');
    expect(firstSlideXml(pptx).toUpperCase()).not.toContain('HIDDEN="1"');
  });

  test("Tesla-style quadrant matrix exports DOM-geometry editable shapes without overflow", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "tesla-quadrant-export-1page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);

    expect(pptx.slideCount).toBe(1);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.combinedText).toContain("Tesla operating quadrant");
    expect(pptx.combinedText).toContain("Charging density");
    expect(pptx.combinedText).toContain("Right conclusion box");
    expect(countTextOccurrences(pptx.combinedText, "Charging density")).toBe(1);
    expect(countTextOccurrences(pptx.combinedText, "Right conclusion box")).toBe(1);
    expect(countTextOccurrences(pptx.combinedText, "High complexity")).toBe(1);
    expect(countTextOccurrences(pptx.combinedText, "Low complexity")).toBe(1);
    expect(pptx.objectCounts.chartRelCount).toBe(0);
    expect(pptx.objectCounts.imageRelCount).toBe(0);
    expect(pptx.mediaFiles).toHaveLength(0);
    expect(pptx.objectCounts.roundRectCount).toBeGreaterThanOrEqual(6);
    expectShapesInsideSlide(pptx);
    await expect(page.getByText(/Downloaded editable PPTX, quality (9\d|100)/)).toBeVisible();
  });

  test("observed facts Q1 matrix stays DOM geometry instead of native table", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "observed-facts-q1-regression-3page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);
    const slide3Text = pptx.slideTexts[2]?.text ?? "";
    const slide3Objects = pptx.slideObjects[2];

    expect(pptx.slideCount).toBe(3);
    expect(slide3Text).toContain("Robotaxi / AI 软件平台");
    expect(slide3Text).toContain("FSD 订阅扩张");
    expect(slide3Text).toContain("Cortex 1");
    expect(slide3Objects?.tableCount ?? 0).toBe(0);
    expect(slide3Objects?.shapeCount ?? 0).toBeGreaterThan(8);
    expect(pptx.objectCounts.imageRelCount).toBe(0);
  });

  test("filled visual containers suppress parent text overlays", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "text-ownership-regression-1page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);

    expect(pptx.slideCount).toBe(1);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.objectCounts.imageRelCount).toBe(0);
    expect(pptx.objectCounts.shapeCount).toBeGreaterThanOrEqual(3);
    expect(countTextOccurrences(pptx.combinedText, "Key signal")).toBe(1);
    expect(countTextOccurrences(pptx.combinedText, "Services revenue grew 42%")).toBe(1);
    expect(countTextOccurrences(pptx.combinedText, "Interpretation")).toBe(1);
    expect(countTextOccurrences(pptx.combinedText, "Investment meaning")).toBe(1);
    expect(
      countTextOccurrences(
        pptx.combinedText,
        "The ownership planner should choose leaf text",
      ),
    ).toBe(1);
  });

  test("div-built waterfall chart exports as a stable visual snapshot", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "div-waterfall-export-1page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);

    expect(pptx.slideCount).toBe(1);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.combinedText).toContain("Illustrative value bridge");
    expectNoNativeCharts(pptx);
    expectVisualChartSnapshots(pptx, 1);
  });

  test("small div-built bubble matrix exports as a stable visual snapshot", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "bubble-matrix-export-1page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);

    expect(pptx.slideCount).toBe(1);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.combinedText).toContain("Prioritization matrix");
    expectNoNativeCharts(pptx);
    expectVisualChartSnapshots(pptx, 1);
    expect(pptx.objectCounts.ellipseCount).toBe(0);
  });

  test("structured combo chart exports as a stable visual snapshot", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "combo-export-1page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);

    expect(pptx.slideCount).toBe(1);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.combinedText).toContain("Throughput and release quality");
    expect(
      countTextOccurrences(
        pptx.combinedText,
        "Throughput and release quality move on different axes",
      ),
    ).toBe(1);
    expectNoNativeCharts(pptx);
    expectVisualChartSnapshots(pptx, 1);
  });

  test("structured bubble chart exports as a stable visual snapshot", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "bubble-export-1page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);

    expect(pptx.slideCount).toBe(1);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.combinedText).toContain("Scientific segmentation");
    expectNoNativeCharts(pptx);
    expectVisualChartSnapshots(pptx, 1);
  });

  test("structured line chart preserves styling through a visual snapshot", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "line-style-export-1page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);

    expect(pptx.slideCount).toBe(1);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.combinedText).toContain("Scenario confidence");
    expectNoNativeCharts(pptx);
    expectVisualChartSnapshots(pptx, 1);
  });

  test("text and list export preserves editable paragraph spacing and bullets", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "text-list-export-1page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);

    expect(pptx.slideCount).toBe(1);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.combinedText).toContain("Preserve readable spacing");
    expect(pptx.objectCounts.textRunCount).toBeGreaterThan(6);
    expect(pptx.objectCounts.bulletCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.numberedBulletCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.lineSpacingCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.paragraphSpacingAfterCount).toBeGreaterThan(0);
  });

  test("gradient visual export keeps visible fill and native rounded boundary", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "gradient-shape-export-1page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);
    const slideXml = firstSlideXml(pptx).toUpperCase();

    expect(pptx.slideCount).toBe(1);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.combinedText).toContain("Gradient visual export");
    expect(pptx.objectCounts.imageRelCount).toBe(0);
    expect(pptx.mediaFiles).toHaveLength(0);
    expect(pptx.objectCounts.gradFillCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.outerShadowCount).toBeGreaterThan(0);
    expect(slideXml).toContain("20D3FF");
    expect(slideXml).toContain("D08F73");
    expect(slideXml).toContain("5D7F9D");
    expect(pptx.objectCounts.roundRectCount).toBeGreaterThan(0);
    await expect(page.getByText("gradient-flattened")).toHaveCount(0);
  });

  test("visual fidelity export prefers computed geometry color and browser font scale", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "visual-fidelity-export-1page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);
    const slideXml = firstSlideXml(pptx).toUpperCase();

    expect(pptx.slideCount).toBe(1);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.combinedText).toContain("Visual fidelity export");
    expect(pptx.objectCounts.roundRectCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.ellipseCount).toBeGreaterThan(0);
    expect(slideXml).toContain("305C63");
    expect(slideXml).toContain("D08F73");
    expect(slideXml).toContain('SZ="2400"');
  });

  test("native visual shape export preserves dividers rails and badges", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "native-shape-export-1page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);

    expect(pptx.slideCount).toBe(1);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.combinedText).toContain("Native visual shape export");
    expect(pptx.objectCounts.connectorCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.roundRectCount).toBeGreaterThan(0);
  });

  test("extreme pressure fixture preserves chart snapshots table ownership and layer order", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "pptx-extreme-pressure-3page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);
    const slideXml = combinedSlideXml(pptx).toUpperCase();
    const slide3Shapes = pptx.slideObjects[2]?.shapeBounds ?? [];
    const backgroundSlab = slide3Shapes.find(
      (bounds) => bounds.x < 0.7 && bounds.y > 5.5 && bounds.w > 11 && bounds.h < 0.5,
    );
    const foregroundStamp = slide3Shapes.find(
      (bounds) => bounds.x > 9.8 && bounds.y < 1.3 && bounds.w > 2 && bounds.h < 0.7,
    );

    expect(pptx.slideCount).toBe(3);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expectNoNativeCharts(pptx);
    expectVisualChartSnapshots(pptx, 3);
    expect(pptx.slideObjects[1]?.tableCount ?? 0).toBe(1);
    expect(pptx.slideObjects[1]?.chartFrameBounds ?? []).toHaveLength(0);
    expect(pptx.slideObjects[1]?.shapeCount ?? 0).toBeGreaterThan(12);
    expect(countTextOccurrences(pptx.combinedText, "Alpha containment")).toBe(1);
    expect(countTextOccurrences(pptx.combinedText, "Beta containment")).toBe(1);
    expect(countTextOccurrences(pptx.combinedText, "Gamma containment")).toBe(1);
    expect(countTextOccurrences(pptx.combinedText, "Escalation overlay stays on top")).toBe(1);
    expect(pptx.combinedText).toContain("Foreground audit stamp");
    expect(pptx.combinedText).not.toContain("Hidden duplicate chart should never");
    expect(pptx.combinedText).not.toContain("Hidden placeholder text must not leak");
    expect(slideXml).not.toContain('DESCR=""/ HIDDEN');
    expect(slideXml).not.toContain('HIDDEN="1"');
    expect(backgroundSlab).toBeTruthy();
    expect(foregroundStamp).toBeTruthy();
    expect(backgroundSlab.order).toBeLessThan(foregroundStamp.order);
  });

  test("long deck export preserves page count and object inventory", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "longform-10page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);

    expect(pptx.slideCount).toBe(10);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.combinedText).toContain("Operating storyline page 10");
    expect(pptx.objectCounts.textRunCount).toBeGreaterThan(20);
  });
});
