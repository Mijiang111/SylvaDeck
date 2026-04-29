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

function expectChartLabel(chartXml, label) {
  expect(
    chartXml.includes(`<C:V>${label}</C:V>`) || chartXml.includes(`<A:T>${label}</A:T>`),
  ).toBeTruthy();
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

  test("unstructured SVG line chart is promoted to a native PowerPoint line chart", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "svg-line-export-1page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);

    expect(pptx.slideCount).toBe(1);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.combinedText).toContain("Illustrative demand pathways");
    expect(pptx.objectCounts.chartRelCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.lineChartCount).toBeGreaterThan(0);
  });

  test("attached McKinsey-style chart target exports native charts and computed styling", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "mckinsey-chart-target-1page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);
    const slideXml = firstSlideXml(pptx).toUpperCase();
    const chartXml = combinedChartXml(pptx).toUpperCase();
    const packageXml = `${slideXml}\n${chartXml}`;

    expect(pptx.slideCount).toBe(1);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.combinedText).toContain("Complex quantitative stories");
    expect(packageXml).toContain("ACCELERATED ADOPTION");
    expect(pptx.combinedText).toContain("Low effort");
    expect(pptx.combinedText).toContain("High effort");
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
    expect(pptx.objectCounts.chartRelCount).toBe(3);
    expect(pptx.objectCounts.imageRelCount).toBe(0);
    expect(pptx.mediaFiles).toHaveLength(0);
    const chartFrameHeights = pptx.slideObjects.flatMap((slide) =>
      slide.chartFrameBounds.map((bounds) => bounds.h),
    );
    expect(chartFrameHeights).toHaveLength(3);
    expect(Math.min(...chartFrameHeights)).toBeGreaterThan(0.8);
    expect(slideXml).not.toContain('HIDDEN="1"');
    expect(slideXml).not.toContain('DESCR=""/ HIDDEN');
    expect(pptx.objectCounts.lineChartCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.barChartCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.bubbleChartCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.connectorCount).toBe(0);
    expect(pptx.objectCounts.ellipseCount).toBe(0);
    expect(pptx.objectCounts.axisMinCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.axisMaxCount).toBeGreaterThan(0);
    expectChartLabel(chartXml, "A");
    expectChartLabel(chartXml, "D");
    expect(slideXml).toContain('TYPEFACE="TIMES"');
    expect(pptx.combinedText).toContain("Impact");
    expect(slideXml.indexOf('NAME="CHART 0"')).toBeGreaterThan(
      slideXml.indexOf('NAME="P1-SHAPE-1"'),
    );
    expect(packageXml).toContain("B55638");
    expect(packageXml).toContain("305C63");
    expect(packageXml).toContain("D08F73");
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
    expect(pptx.objectCounts.imageRelCount).toBe(0);
    expect(pptx.objectCounts.chartRelCount).toBe(3);
    expect(pptx.objectCounts.lineChartCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.barChartCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.bubbleChartCount).toBeGreaterThan(0);
    expect(pptx.slideObjects[0].chartFrameBounds).toHaveLength(3);
    expect(Math.min(...pptx.slideObjects[0].chartFrameBounds.map((bounds) => bounds.h))).toBeGreaterThan(0.8);
    expect(textShapeBounds(pptx.slideObjects[0], "Volume")?.w ?? 0).toBeGreaterThan(0.42);
    expect(textShapeBounds(pptx.slideObjects[0], "+29")?.w ?? 0).toBeGreaterThan(0.28);
    expect(textShapeBounds(pptx.slideObjects[0], "Impact")?.w ?? 0).toBeGreaterThan(0.35);
    const decorativePageFrame = (pptx.slideObjects[0]?.shapeBounds ?? []).find(
      (bounds) => bounds.x < 0.45 && bounds.y < 0.35 && bounds.w > 12 && bounds.h > 6.5,
    );
    expect(decorativePageFrame).toBeTruthy();
    expect(decorativePageFrame?.fillTransparency ?? 0).toBeGreaterThanOrEqual(95);
    expect(combinedChartXml(pptx).toUpperCase()).toContain("ACCELERATED ADOPTION");
    expectChartLabel(combinedChartXml(pptx).toUpperCase(), "A");
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

  test("div-built waterfall chart is promoted to a native editable chart", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "div-waterfall-export-1page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);

    expect(pptx.slideCount).toBe(1);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.combinedText).toContain("Illustrative value bridge");
    expect(pptx.objectCounts.chartRelCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.barChartCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.imageRelCount).toBe(0);
    expect(pptx.objectCounts.shapeCount).toBeGreaterThanOrEqual(8);
  });

  test("small div-built bubble matrix is promoted to a native bubble chart", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "bubble-matrix-export-1page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);

    expect(pptx.slideCount).toBe(1);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.combinedText).toContain("Prioritization matrix");
    expect(pptx.objectCounts.chartRelCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.bubbleChartCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.imageRelCount).toBe(0);
    expect(pptx.objectCounts.ellipseCount).toBe(0);
    expect(pptx.slideObjects[0].chartFrameBounds.length).toBeGreaterThan(0);
    expect(Math.max(...pptx.slideObjects[0].chartFrameBounds.map((bounds) => bounds.h))).toBeGreaterThan(1);
  });

  test("structured combo chart exports native bar and line chart parts", async ({ page }) => {
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
    expect(pptx.objectCounts.chartRelCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.barChartCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.lineChartCount).toBeGreaterThan(0);
  });

  test("structured bubble chart exports as a native PowerPoint bubble chart", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "bubble-export-1page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);

    expect(pptx.slideCount).toBe(1);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.combinedText).toContain("Scientific segmentation");
    expect(pptx.objectCounts.chartRelCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.bubbleChartCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.bubbleSeriesCount).toBe(1);
    expect(pptx.objectCounts.chartBubbleScaleCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.chartDataPointCount).toBeGreaterThanOrEqual(3);
    expect(pptx.objectCounts.chartEmptyValueCount).toBe(0);
    expect(combinedChartXml(pptx).toUpperCase()).toContain("COHORT A");
    expect(combinedChartXml(pptx).toUpperCase()).toContain("20D3FF");
  });

  test("structured line chart preserves native dash axis grid and shadow styling", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "line-style-export-1page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);
    const chartXml = combinedChartXml(pptx).toUpperCase();

    expect(pptx.slideCount).toBe(1);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.combinedText).toContain("Scenario confidence");
    expect(pptx.objectCounts.chartRelCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.lineChartCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.chartDashCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.chartOuterShadowCount).toBeGreaterThan(0);
    expect(chartXml).toContain('PRSTDASH VAL="DASH"');
    expect(chartXml).toContain('SYMBOL VAL="NONE"');
    expect(chartXml).toContain("305C63");
    expect(chartXml).toContain("D8CFBC");
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

  test("extreme pressure fixture preserves chart table ownership and layer order", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "pptx-extreme-pressure-3page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);
    const slideXml = combinedSlideXml(pptx).toUpperCase();
    const chartXml = combinedChartXml(pptx).toUpperCase();
    const slide3Shapes = pptx.slideObjects[2]?.shapeBounds ?? [];
    const backgroundSlab = slide3Shapes.find(
      (bounds) => bounds.x < 0.7 && bounds.y > 5.5 && bounds.w > 11 && bounds.h < 0.5,
    );
    const foregroundStamp = slide3Shapes.find(
      (bounds) => bounds.x > 9.8 && bounds.y < 1.3 && bounds.w > 2 && bounds.h < 0.7,
    );

    expect(pptx.slideCount).toBe(3);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.objectCounts.imageRelCount).toBe(0);
    expect(pptx.objectCounts.chartRelCount).toBeGreaterThanOrEqual(3);
    expect(pptx.objectCounts.lineChartCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.barChartCount).toBeGreaterThan(1);
    expect(pptx.objectCounts.bubbleChartCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.bubbleSeriesCount).toBe(1);
    expect(pptx.objectCounts.chartBubbleScaleCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.chartDataPointCount).toBeGreaterThanOrEqual(4);
    expect(pptx.objectCounts.chartEmptyValueCount).toBe(0);
    expect(pptx.slideObjects[0]?.chartFrameBounds ?? []).toHaveLength(3);
    expect(Math.min(...pptx.slideObjects[0].chartFrameBounds.map((bounds) => bounds.h))).toBeGreaterThan(0.8);
    expect(pptx.slideObjects[1]?.tableCount ?? 0).toBe(1);
    expect(pptx.slideObjects[1]?.chartFrameBounds ?? []).toHaveLength(0);
    expect(pptx.slideObjects[1]?.shapeCount ?? 0).toBeGreaterThan(12);
    expect(chartXml).toContain("QUEUE VOLUME");
    expect(chartXml).toContain("QUALITY GATE PASS");
    expect(chartXml).toContain("FIXES");
    expectChartLabel(chartXml, "A");
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
