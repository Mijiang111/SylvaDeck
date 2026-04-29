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

function getSidebarTab(page, label) {
  return page.locator(".studio-editor-sidebar").getByRole("button", { name: label, exact: true });
}

async function openSidebarTab(page, label) {
  const sidebar = page.locator(".studio-editor-sidebar");
  if (!(await sidebar.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Properties", exact: true }).click();
    await expect(sidebar).toBeVisible({ timeout: 10_000 });
  }
  await getSidebarTab(page, label).click();
}

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
    expect(pptx.objectCounts.textRunCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.shapeCount).toBeGreaterThan(0);
    expect(
      pptx.objectCounts.connectorCount +
        pptx.objectCounts.roundRectCount +
        pptx.objectCounts.ellipseCount,
    ).toBeGreaterThan(0);
    expect(pptx.objectCounts.imageRelCount).toBe(0);
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
    const pageOnePreview = page
      .locator('[data-ppt-report-root="studio-main"] [data-testid="report-page-frame-1"]')
      .locator("xpath=..");
    const headline = pageOneFrame.locator('[data-html-block-id="block-1"]').first();
    await headline.click({ force: true });

    const selectedBlockFrame = pageOnePreview.getByTestId("preview-selection-block-frame-1");
    await expect(selectedBlockFrame).toBeVisible({ timeout: 10_000 });
    const blockBoxBefore = await selectedBlockFrame.boundingBox();
    if (!blockBoxBefore) {
      throw new Error("Expected the selected block frame to have a bounding box.");
    }

    await dragLocatorBy(page, selectedBlockFrame, 84, 42);

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
    const pageTwoPreview = page
      .locator('[data-ppt-report-root="studio-main"] [data-testid="report-page-frame-2"]')
      .locator("xpath=..");
    await openSidebarTab(page, "Visual");
    const chart = pageTwoFrame.locator('[data-html-visual-kind="chart-frame"]').first();
    const chartVisualId = await chart.getAttribute("data-html-visual-id");
    if (!chartVisualId) {
      throw new Error("Expected the selected chart to have a stable visual id.");
    }
    await chart.click({ force: true });

    const selectedVisualFrame = pageTwoPreview.getByTestId("preview-selection-visual-frame-2");
    await expect(selectedVisualFrame).toBeVisible({ timeout: 10_000 });
    const visualBoxBefore = await selectedVisualFrame.boundingBox();
    if (!visualBoxBefore) {
      throw new Error("Expected the selected visual frame to have a bounding box.");
    }

    await dragLocatorBy(page, selectedVisualFrame, 132, 56, {
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

    const deleteNodeButton = page.getByTestId("inspector-action-delete-node");
    const addNearbyModuleHeading = page.getByText("Add nearby module", { exact: true });
    await expect(deleteNodeButton).toBeVisible();
    await expect(addNearbyModuleHeading).toBeVisible();

    const deleteNodeBox = await deleteNodeButton.boundingBox();
    const addNearbyModuleBox = await addNearbyModuleHeading.boundingBox();
    if (!deleteNodeBox || !addNearbyModuleBox) {
      throw new Error("Expected the inspector controls to expose measurable layout boxes.");
    }
    expect(addNearbyModuleBox.y).toBeGreaterThan(deleteNodeBox.y + deleteNodeBox.height + 8);
  });

  test("@quick iframe title editing and decorative closing surfaces follow PPT-like selection flow", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "iframe-opening-closing-selection");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pageOneFrame = page
      .locator('[data-ppt-report-root="studio-main"]')
      .frameLocator('[data-testid="report-page-frame-1"]');
    const pageOnePreview = page
      .locator('[data-ppt-report-root="studio-main"] [data-testid="report-page-frame-1"]')
      .locator("xpath=..");
    const headline = pageOneFrame.locator('[data-html-block-kind="headline"]').first();
    const closingCard = pageOneFrame.locator(".closing-strip-card").first();
    const selectedBlockFrame = pageOnePreview.getByTestId("preview-selection-block-frame-1");
    const updatedHeadline = "Coordination closing view keeps the decorative strip secondary to editable text.";

    await headline.click({ force: true });
    await expect(selectedBlockFrame).toBeVisible({
      timeout: 10_000,
    });
    const headlineInput = page.locator('[data-testid^="inspector-textarea-block-content-"]').first();
    await expect(headlineInput).toBeVisible({ timeout: 10_000 });
    await headlineInput.fill(updatedHeadline);
    await expect(pageOneFrame.locator('[data-html-block-kind="headline"]').first()).toContainText(
      updatedHeadline,
      { timeout: 10_000 },
    );

    await openSidebarTab(page, "Page");
    await expect(pageOneFrame.locator("html")).toHaveAttribute("data-ppt-selection-mode", "page");
    await closingCard.click({ force: true });
    await expect(pageOnePreview.getByTestId("preview-selection-visual-frame-1")).toBeHidden();
    await expect(selectedBlockFrame).toBeVisible();

    await openSidebarTab(page, "Visual");
    await expect(pageOneFrame.locator("html")).toHaveAttribute("data-ppt-selection-mode", "visual");
    await expect(selectedBlockFrame).toBeHidden();
    await expect(closingCard).toHaveAttribute("data-html-visual-id", /.+/);
    await expect(closingCard).toHaveAttribute("data-html-visual-kind", "surface");
  });

  test("@quick matrix cards stay primary while shells fall back to secondary visual scaffolds", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "matrix-nested-visual-selection");

    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pageOneFrame = page
      .locator('[data-ppt-report-root="studio-main"]')
      .frameLocator('[data-testid="report-page-frame-1"]');
    const pageOnePreview = page
      .locator('[data-ppt-report-root="studio-main"] [data-testid="report-page-frame-1"]')
      .locator("xpath=..");
    const matrixShell = pageOneFrame.locator(".matrix-shell").first();
    const rightCard = pageOneFrame.locator(".matrix-card-top-right").first();
    const leftCard = pageOneFrame.locator(".matrix-card-top-left").first();
    const rightCardTitle = pageOneFrame.locator(".matrix-card-top-right h3").first();

    await rightCardTitle.click({ force: true });
    const selectedBlockFrame = pageOnePreview.getByTestId("preview-selection-block-frame-1");
    await expect(selectedBlockFrame).toBeVisible({ timeout: 10_000 });
    await expect(pageOnePreview.getByTestId("preview-selection-visual-frame-1")).toBeHidden();
    await expect(page.locator('[data-testid^="inspector-textarea-block-content-"]').first()).toBeVisible({
      timeout: 10_000,
    });

    await openSidebarTab(page, "Visual");
    await expect(matrixShell).toBeVisible();
    await expect(rightCard).toBeVisible();
    await expect(leftCard).toBeVisible();
    await expect(matrixShell).toHaveAttribute("data-html-visual-id", /.+/);
    await expect(rightCard).toHaveAttribute("data-html-visual-id", /.+/);
    await expect(leftCard).toHaveAttribute("data-html-visual-id", /.+/);

    await rightCard.click({ force: true });
    const selectedVisualFrame = pageOnePreview.getByTestId("preview-selection-visual-frame-1");
    await expect(selectedVisualFrame).toBeVisible({ timeout: 10_000 });

    const shellBox = await matrixShell.boundingBox();
    const selectedBox = await selectedVisualFrame.boundingBox();
    if (!shellBox || !selectedBox) {
      throw new Error("Expected the matrix shell and selected card to expose measurable bounds.");
    }

    expect(selectedBox.width).toBeLessThan(shellBox.width * 0.8);
    expect(selectedBox.height).toBeLessThan(shellBox.height * 0.8);
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

  test("@quick scientific diagram fixture keeps caption editable and atomized visual nodes selectable", async ({
    page,
  }) => {
    const fixture = await installStudioFixtureRoutes(page, "academic-neural-network-3page");
    await generateDeckFromPrompt(page, fixture.scenario.prompt);

    const pageTwoFrame = page
      .locator('[data-ppt-report-root="studio-main"]')
      .frameLocator('[data-testid="report-page-frame-2"]');
    const pageTwoPreview = page
      .locator('[data-ppt-report-root="studio-main"] [data-testid="report-page-frame-2"]')
      .locator("xpath=..");
    const caption = pageTwoFrame.locator(".scientific-diagram-caption");
    const shell = pageTwoFrame.locator(".scientific-diagram-shell");
    const topLabel = pageTwoFrame.locator(".scientific-diagram-top-label").first();

    await caption.click({ force: true });
    await expect(pageTwoPreview.getByTestId("preview-selection-block-frame-2")).toBeVisible({
      timeout: 10_000,
    });
    await expect(pageTwoPreview.getByTestId("preview-selection-visual-frame-2")).toBeHidden();

    await topLabel.click({ force: true });
    await expect(pageTwoPreview.getByTestId("preview-selection-block-frame-2")).toBeVisible({
      timeout: 10_000,
    });

    await openSidebarTab(page, "Visual");
    const node = pageTwoFrame.locator(".scientific-diagram-network circle").first();
    const connector = pageTwoFrame.locator(".scientific-diagram-network line, .scientific-diagram-network path").first();
    await expect(shell).toHaveAttribute("data-html-visual-id", /.+/);
    await expect(node).toHaveCount(1);
    await expect(connector).toHaveCount(1);

    await node.evaluate((element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await expect(pageTwoPreview.getByTestId("preview-selection-visual-frame-2")).toBeVisible({
      timeout: 10_000,
    });
    await connector.evaluate((element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await expect(pageTwoPreview.getByTestId("preview-selection-visual-frame-2")).toBeVisible({
      timeout: 10_000,
    });

    await expect(shell).toHaveCount(1);
    await expect(pageTwoFrame.locator(".scientific-diagram-layer-label", { hasText: "Input layer" })).toHaveCount(1);
    await expect(pageTwoFrame.locator(".scientific-diagram-layer-label", { hasText: "Hidden 2" })).toHaveCount(1);

    const htmlDownload = await downloadFromActions(page, "action-export-html");
    const htmlText = await readDownloadedText(htmlDownload);
    expect(htmlText).toContain("Dense reranking network");
    expect(htmlText).toContain("Input layer");
    expect(htmlText).not.toContain("Executive summary");

    const pptxDownload = await downloadFromActions(page, "action-export-pptx");
    const pptx = await readDownloadedPptx(pptxDownload);
    expect(pptx.slideCount).toBe(3);
    expect(pptx.layoutSize?.aspectRatio ?? 0).toBeCloseTo(16 / 9, 2);
    expect(pptx.objectCounts.textRunCount).toBeGreaterThan(0);
    expect(pptx.objectCounts.connectorCount).toBeGreaterThanOrEqual(40);
    expect(pptx.objectCounts.ellipseCount).toBeGreaterThanOrEqual(15);
    expect(pptx.objectCounts.imageRelCount).toBe(0);
    expect(pptx.combinedText.toLowerCase()).toContain("dense reranking network");
    expect(pptx.combinedText.toLowerCase()).toContain("input layer");
  });

  test("@quick deep valuation fixture stays out of generic sparse framing", async ({ page }) => {
    const fixture = await installStudioFixtureRoutes(page, "valuation-deep-1page");
    await generateDeckFromPrompt(page, fixture.scenario.prompt);
    await expect(page.getByTestId("filmstrip-page-1")).toContainText("Codex valuation frame");
    await expect(page.getByText("Brief focus")).toHaveCount(0);
    await expect(page.getByText("one clear point")).toHaveCount(0);
  });
});
