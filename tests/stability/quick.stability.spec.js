import { expect, test } from "@playwright/test";
import {
  dragLocatorBy,
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
    expect(htmlText).not.toContain('data-ppt-report-root="studio-main"');
    expect(htmlText).not.toContain("bg-[#040404]");

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);
    expect(pptx.slideCount).toBe(3);
    expect(pptx.layoutSize).not.toBeNull();
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
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

  test("@quick iframe direct drag keeps selection stable for blocks and visuals", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "freeform-edit-export");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pageOneFrame = page
      .locator('[data-ppt-report-root="studio-main"]')
      .frameLocator('[data-testid="report-page-frame-1"]');
    const headline = pageOneFrame.locator('[data-html-block-id="block-1"]').first();
    await headline.click({ force: true });

    const selectedBlockFrame = page.getByTestId("preview-selection-block-frame-1");
    await expect(selectedBlockFrame).toBeVisible({ timeout: 10_000 });
    const blockBoxBefore = await selectedBlockFrame.boundingBox();
    if (!blockBoxBefore) {
      throw new Error("Expected the selected block frame to have a bounding box.");
    }

    await dragLocatorBy(page, page.getByTestId("preview-move-block-1"), 84, 42);

    const blockBoxAfter = await selectedBlockFrame.boundingBox();
    if (!blockBoxAfter) {
      throw new Error("Expected the moved block frame to keep a bounding box.");
    }
    expect(Math.abs(blockBoxAfter.x - blockBoxBefore.x)).toBeGreaterThan(40);
    expect(Math.abs(blockBoxAfter.y - blockBoxBefore.y)).toBeGreaterThan(20);
    await expect(page.getByTestId("preview-resize-block-resize-se-1")).toBeVisible();
    await expect(pageOneFrame.locator('[data-html-block-id="block-1"]')).toHaveCount(1);

    const pageTwoFrame = page
      .locator('[data-ppt-report-root="studio-main"]')
      .frameLocator('[data-testid="report-page-frame-2"]');
    await page.getByRole("button", { name: "Visual" }).click();
    const chart = pageTwoFrame.locator('[data-html-visual-kind="chart-frame"]').first();
    const chartVisualId = await chart.getAttribute("data-html-visual-id");
    if (!chartVisualId) {
      throw new Error("Expected the selected chart to have a stable visual id.");
    }
    await chart.click({ force: true });

    const selectedVisualFrame = page.getByTestId("preview-selection-visual-frame-2");
    await expect(selectedVisualFrame).toBeVisible({ timeout: 10_000 });
    const visualBoxBefore = await selectedVisualFrame.boundingBox();
    if (!visualBoxBefore) {
      throw new Error("Expected the selected visual frame to have a bounding box.");
    }

    await dragLocatorBy(page, page.getByTestId("preview-move-visual-2"), 132, 56, {
      steps: 3,
    });

    const visualBoxAfter = await selectedVisualFrame.boundingBox();
    if (!visualBoxAfter) {
      throw new Error("Expected the moved visual frame to keep a bounding box.");
    }
    expect(Math.abs(visualBoxAfter.x - visualBoxBefore.x)).toBeGreaterThan(40);
    expect(Math.abs(visualBoxAfter.y - visualBoxBefore.y)).toBeGreaterThan(20);
    expect(Math.abs(visualBoxAfter.width - visualBoxBefore.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(visualBoxAfter.height - visualBoxBefore.height)).toBeLessThanOrEqual(2);
    await expect(page.getByTestId("preview-resize-visual-resize-se-2")).toBeVisible();
    await expect(pageTwoFrame.locator(`[data-html-visual-id="${chartVisualId}"]`)).toHaveCount(1);
  });

  test("@quick iframe title editing and decorative closing surfaces follow PPT-like selection flow", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "iframe-opening-closing-selection");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pageOneFrame = page
      .locator('[data-ppt-report-root="studio-main"]')
      .frameLocator('[data-testid="report-page-frame-1"]');
    const headline = pageOneFrame.locator('[data-html-block-kind="headline"]').first();
    const closingCard = pageOneFrame.locator(".closing-strip-card").first();
    const selectedBlockFrame = page.getByTestId("preview-selection-block-frame-1");

    await headline.click({ force: true });
    await expect(selectedBlockFrame).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByTestId("quick-edit-popover")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("quick-edit-popover")).toBeHidden();

    await page.getByRole("button", { name: "Page", exact: true }).click();
    await closingCard.evaluate((element) => element.click());
    await expect(page.getByTestId("preview-selection-visual-frame-1")).toBeHidden();
    await expect(selectedBlockFrame).toBeVisible();

    await page.getByRole("button", { name: "Visual", exact: true }).click();
    await closingCard.evaluate((element) => element.click());
    await expect(page.getByTestId("preview-selection-visual-frame-1")).toBeVisible({
      timeout: 10_000,
    });
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

  test("@quick semantic density stays as a simplification warning instead of AI repair", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "dense-semantic-review");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    await expect.poll(() => fixture.state.reviseCalls.length).toBe(0);
    await expect(page.getByText(/may still benefit from manual simplification/i).first()).toBeVisible();
    await expect(page.getByTestId("filmstrip-page-1")).toContainText(
      "The deck is readable, but page 1 is still too dense to stay clear",
    );
  });

  test("@quick title-only review is repaired locally without AI revise", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "title-only-review");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    await expect.poll(() => fixture.state.reviseCalls.length).toBe(0);
    await expect(page.getByTestId("filmstrip-page-1")).toContainText(
      "Coordination logic remains the constraint",
    );
  });

  test("@quick mixed title and overflow review only revises the true hard-fail page", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "mixed-hard-and-title-review");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    await expect.poll(() => fixture.state.reviseCalls.length).toBe(1);
    const revisePayload = fixture.state.reviseCalls[0];
    expect(revisePayload?.pageMeasurements?.map((measurement) => measurement.pageNumber)).toEqual([2]);
    await expect(page.getByTestId("filmstrip-page-1")).toContainText(
      "Coordination logic remains the constraint",
    );
    await expect(page.getByTestId("filmstrip-page-2")).toContainText(
      "Action sequencing absorbs the residual delay before the queue peaks",
    );
  });

  test("@quick auto-review stops after one unproductive repair pass", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "second-pass-no-improvement");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    await expect.poll(() => fixture.state.reviseCalls.length).toBe(1);
    await expect(page.getByText(/did not materially improve/i).first()).toBeVisible();
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
