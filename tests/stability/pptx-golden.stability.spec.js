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

function expectShapesInsideSlide(pptx) {
  for (const bounds of allShapeBounds(pptx)) {
    expect(bounds.x).toBeGreaterThanOrEqual(-0.01);
    expect(bounds.y).toBeGreaterThanOrEqual(-0.01);
    expect(bounds.x + bounds.w).toBeLessThanOrEqual(13.343);
    expect(bounds.y + bounds.h).toBeLessThanOrEqual(7.51);
  }
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
    expect(pptx.objectCounts.connectorCount + pptx.objectCounts.ellipseCount).toBeGreaterThan(0);
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
    expect(Math.min(...chartFrameHeights)).toBeGreaterThan(1);
    expect(pptx.objectCounts.lineChartCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.barChartCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.bubbleChartCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.connectorCount).toBeGreaterThanOrEqual(20);
    expect(pptx.objectCounts.ellipseCount).toBeGreaterThanOrEqual(7);
    expect(pptx.objectCounts.axisMinCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.axisMaxCount).toBeGreaterThan(0);
    expect(chartXml).toContain("<C:V>A</C:V>");
    expect(chartXml).toContain("<C:V>D</C:V>");
    expect(slideXml).toContain('TYPEFACE="TIMES"');
    expect(pptx.combinedText).toContain("Impact");
    expect(slideXml.indexOf('NAME="CHART 0"')).toBeLessThan(
      slideXml.indexOf('NAME="P1-SHAPE-1"'),
    );
    expect(packageXml).toContain("B55638");
    expect(packageXml).toContain("305C63");
    expect(packageXml).toContain("D08F73");
    await expect(page.getByText(/Downloaded editable PPTX, quality (9\d|100)/)).toBeVisible();
    await expect(page.getByText("gradient-flattened")).toHaveCount(0);
  });

  test("Tesla-style quadrant matrix exports as semantic editable shapes without overflow", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "tesla-quadrant-export-1page");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);

    expect(pptx.slideCount).toBe(1);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.combinedText).toContain("Tesla operating quadrant");
    expect(pptx.combinedText).toContain("Charging density");
    expect(pptx.combinedText).toContain("Right conclusion box");
    expect(pptx.objectCounts.chartRelCount).toBe(0);
    expect(pptx.objectCounts.imageRelCount).toBe(0);
    expect(pptx.mediaFiles).toHaveLength(0);
    expect(pptx.objectCounts.roundRectCount).toBeGreaterThanOrEqual(6);
    expectShapesInsideSlide(pptx);
    await expect(page.getByText(/Downloaded editable PPTX, quality (9\d|100)/)).toBeVisible();
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
