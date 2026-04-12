import { expect, test } from "@playwright/test";
import {
  downloadFromActions,
  generateDeckFromPrompt,
} from "./helpers/browser-helpers.mjs";
import { readDownloadedText } from "./helpers/download-helpers.mjs";
import { installStudioFixtureRoutes } from "./helpers/fixture-routes.mjs";

test.describe("Studio stability full matrix", () => {
  test("chart-first fixture reaches editor and exports HTML", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "chart-first-3page");
    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    const htmlDownload = await downloadFromActions(page, "action-export-html");
    const htmlText = await readDownloadedText(htmlDownload);
    expect(htmlText).toContain("Referral release timing is now the main throughput governor");
    expect(htmlText).toContain("<title>Clinic throughput still stalls in coordination logic</title>");
  });

  test("architecture words alone do not render a 3D hero page", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "architecture-3page-no-hero");
    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    const pageOne = page
      .locator('[data-ppt-report-root="studio-main"]')
      .frameLocator('[data-testid="report-page-frame-1"]');
    const pageTwo = page
      .locator('[data-ppt-report-root="studio-main"]')
      .frameLocator('[data-testid="report-page-frame-2"]');
    const pageThree = page
      .locator('[data-ppt-report-root="studio-main"]')
      .frameLocator('[data-testid="report-page-frame-3"]');

    await expect(pageOne.locator(".hero-model-shell")).toHaveCount(0);
    await expect(pageTwo.locator(".hero-model-shell")).toHaveCount(0);
    await expect(pageThree.locator(".hero-model-shell")).toHaveCount(0);
  });

  test("explicit 3D request renders exactly one hero page", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "hero-3page-chip-explicit");
    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    const pageOne = page
      .locator('[data-ppt-report-root="studio-main"]')
      .frameLocator('[data-testid="report-page-frame-1"]');
    const pageTwo = page
      .locator('[data-ppt-report-root="studio-main"]')
      .frameLocator('[data-testid="report-page-frame-2"]');
    const pageThree = page
      .locator('[data-ppt-report-root="studio-main"]')
      .frameLocator('[data-testid="report-page-frame-3"]');

    await expect(pageOne.locator(".hero-model-shell")).toBeVisible();
    await expect(pageOne.locator(".chip-stack")).toBeVisible();
    await expect(pageTwo.locator(".hero-model-shell")).toHaveCount(0);
    await expect(pageThree.locator(".hero-model-shell")).toHaveCount(0);
  });

  test("single-claim fixture keeps support and evidence concise", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "single-claim-3page");
    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    const pageOne = page
      .locator('[data-ppt-report-root="studio-main"]')
      .frameLocator('[data-testid="report-page-frame-1"]');
    const pageTwo = page
      .locator('[data-ppt-report-root="studio-main"]')
      .frameLocator('[data-testid="report-page-frame-2"]');
    const pageThree = page
      .locator('[data-ppt-report-root="studio-main"]')
      .frameLocator('[data-testid="report-page-frame-3"]');

    expect(await pageOne.locator("h1").count()).toBe(1);
    expect(await pageOne.locator("li").count()).toBeLessThanOrEqual(2);
    expect(await pageTwo.locator(".annotation-card").count()).toBeLessThanOrEqual(2);
    expect(await pageThree.locator("li").count()).toBeLessThanOrEqual(2);
  });

  test("semantic density review triggers repair before editing unlocks", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "dense-semantic-review");
    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    await expect.poll(() => fixture.state.reviseCalls.length).toBe(1);
    const revisePayload = fixture.state.reviseCalls[0];
    const repairedMeasurement = revisePayload?.pageMeasurements?.find(
      (measurement) => measurement.pageNumber === 1,
    );
    expect(repairedMeasurement).toBeTruthy();
    expect(repairedMeasurement.overflowX).toBe(false);
    expect(repairedMeasurement.overflowY).toBe(false);
    await expect(page.getByTestId("filmstrip-page-1")).toContainText(
      "Coordination logic remains the single binding constraint on throughput",
    );
  });

  test("case-study fixture stays in case narrative mode", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "case-study-3page");
    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    const htmlDownload = await downloadFromActions(page, "action-export-html");
    const htmlText = await readDownloadedText(htmlDownload);
    expect(htmlText).toContain("Case overview: release timing, not staffing, caused the warehouse delay");
    expect(htmlText).toContain("Outcome and lesson");
    expect(htmlText).not.toContain("Executive summary");
    expect(htmlText).not.toContain("Strategic implications");
  });

  test("task-first shipping robotics case-study fixture avoids research-first headings", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "shipping-robotics-case-study-2page");
    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    const htmlDownload = await downloadFromActions(page, "action-export-html");
    const htmlText = await readDownloadedText(htmlDownload);
    expect(htmlText).toContain("Case overview: robotics enters shipping to solve unsafe, labor-heavy work first");
    expect(htmlText).toContain("Application outcome: robotics improves port flow and safety before broader autonomy arrives");
    expect(htmlText).not.toContain("Research question");
    expect(htmlText).not.toContain("Method and result");
  });

  test("academic research fixture stays in research presentation mode", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "academic-research-3page");
    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    const htmlDownload = await downloadFromActions(page, "action-export-html");
    const htmlText = await readDownloadedText(htmlDownload);
    expect(htmlText).toContain("Research question");
    expect(htmlText).toContain("Method and result");
    expect(htmlText).toContain("Interpretation and next work");
    expect(htmlText).not.toContain("Strategic implications");
  });

  test("deep valuation fixture stays finance-grade and avoids generic sparse framing", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "valuation-deep-1page");
    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    const htmlDownload = await downloadFromActions(page, "action-export-html");
    const htmlText = await readDownloadedText(htmlDownload);
    expect(htmlText).toContain("Codex valuation frame");
    expect(htmlText).toContain("valuation");
    expect(htmlText).toContain("scenario posture");
    expect(htmlText).not.toContain("Brief focus");
    expect(htmlText).not.toContain("one clear point");
  });

  test("architecture review fixture stays in architecture-review language", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "architecture-review-3page");
    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    const htmlDownload = await downloadFromActions(page, "action-export-html");
    const htmlText = await readDownloadedText(htmlDownload);
    expect(htmlText).toContain("Architecture judgment");
    expect(htmlText).toContain("Constraint and trade-off");
    expect(htmlText).not.toContain("Executive summary");
    expect(htmlText).not.toContain("Strategic implications");
  });

  test("research readout fixture stays result-first and avoids strategy framing", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "research-readout-2page");
    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    const htmlDownload = await downloadFromActions(page, "action-export-html");
    const htmlText = await readDownloadedText(htmlDownload);
    expect(htmlText).toContain("Result readout");
    expect(htmlText).toContain("Method boundary and interpretation");
    expect(htmlText).not.toContain("Strategic implications");
    expect(htmlText).not.toContain("Executive summary");
  });

  test("long-form fixture keeps ten pages and exports HTML", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "longform-10page");
    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    await expect(page.getByTestId("filmstrip-page-10")).toBeVisible();
    const htmlDownload = await downloadFromActions(page, "action-export-html");
    const htmlText = await readDownloadedText(htmlDownload);
    expect(htmlText).toContain("Operating storyline page 10");
  });
});
