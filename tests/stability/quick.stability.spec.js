import { expect, test } from "@playwright/test";
import {
  downloadFromActions,
  generateDeckFromPrompt,
  renameFirstHeadline,
  selectFilmstripPage,
} from "./helpers/browser-helpers.mjs";
import { readDownloadedPptx, readDownloadedText } from "./helpers/download-helpers.mjs";
import { installStudioFixtureRoutes } from "./helpers/fixture-routes.mjs";

test.describe("Studio stability quick gate", () => {
  test("@quick generate -> edit -> export remains stable", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "freeform-edit-export");
    const editedHeadline = "Coordination bottlenecks still cap clinic throughput after staffing expansion";

    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    await expect.poll(() => fixture.state.generateCalls.length).toBe(1);
    await renameFirstHeadline(page, editedHeadline);

    const htmlDownload = await downloadFromActions(page, "action-export-html");
    const htmlText = await readDownloadedText(htmlDownload);
    expect(htmlText).toContain(editedHeadline);
    expect(htmlText).toContain("<title>Clinic throughput remains coordination-bound</title>");

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);
    expect(pptx.slideCount).toBe(3);
    expect(pptx.combinedText.toLowerCase()).toContain(editedHeadline.toLowerCase());

    await page.reload();
    await expect(page.locator('[data-ppt-report-root="studio-main"]')).toBeVisible({
      timeout: 30_000,
    });
    await expect.poll(() => fixture.state.generateCalls.length).toBe(1);
  });

  test("@quick manual optimize page remains callable", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "optimize-3page-ops");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    await selectFilmstripPage(page, 2);
    const reviseCallsBefore = fixture.state.reviseCalls.length;

    await page.getByTestId("optimize-current-page").click();
    await expect.poll(() => fixture.state.reviseCalls.length).toBe(reviseCallsBefore + 1);
    await page.getByTestId("deck-review-status").waitFor({ state: "hidden", timeout: 60_000 }).catch(() => {});
    await expect(page.getByTestId("filmstrip-page-2")).toContainText(
      "Action sequencing absorbs the residual delay before the queue peaks",
    );
  });

  test("@quick architecture words alone do not trigger 3D hero output", async ({ page }) => {
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

  test("@quick semantic density can trigger auto-review without overflow", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "dense-semantic-review");

    await generateDeckFromPrompt(page, fixture.scenario.prompt, { requireReviewSettle: false });
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

  test("@quick case-study fixture avoids strategy-report headings", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "case-study-3page");
    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    await expect(page.getByTestId("filmstrip-page-1")).toContainText("Case overview");
    await expect(page.getByTestId("filmstrip-page-3")).toContainText("Outcome and lesson");
    await expect(page.getByText("Executive summary")).toHaveCount(0);
  });

  test("@quick task-first case-study fixture stays out of research-first framing", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "shipping-robotics-case-study-2page");
    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    await expect(page.getByTestId("filmstrip-page-1")).toContainText("Case overview");
    await expect(page.getByTestId("filmstrip-page-2")).toContainText("Application outcome");
    await expect(page.getByText("Research question")).toHaveCount(0);
    await expect(page.getByText("Method and result")).toHaveCount(0);
  });

  test("@quick academic research fixture avoids strategic framing", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "academic-research-3page");
    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    await expect(page.getByTestId("filmstrip-page-1")).toContainText("Research question");
    await expect(page.getByTestId("filmstrip-page-3")).toContainText("Interpretation and next work");
    await expect(page.getByText("Strategic implications")).toHaveCount(0);
  });

  test("@quick deep valuation fixture stays out of generic sparse framing", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "valuation-deep-1page");
    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    await expect(page.getByTestId("filmstrip-page-1")).toContainText("Codex valuation frame");
    await expect(page.getByText("Brief focus")).toHaveCount(0);
    await expect(page.getByText("one clear point")).toHaveCount(0);
  });
});
