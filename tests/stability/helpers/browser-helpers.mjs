import { expect } from "@playwright/test";

export async function goToAiChat(page) {
  await page.goto("/");
  await page.getByTestId("home-nav-ai").click();
  await expect(page.getByTestId("ai-chat-prompt")).toBeVisible();
}

export async function generateDeckFromPrompt(page, prompt, options = {}) {
  await goToAiChat(page);
  await page.getByTestId("ai-chat-prompt").fill(prompt);
  await page.getByTestId("ai-chat-generate").click();
  await page.waitForURL(/\/projects\/.+\/edit/);
  await expect(page.locator('[data-ppt-report-root="studio-main"]')).toBeVisible({
    timeout: 60_000,
  });
  if (options.requireReviewSettle !== false) {
    await waitForReviewToSettle(page);
  }
}

export async function waitForReviewToSettle(page) {
  const reviewStatus = page.getByTestId("deck-review-status");
  try {
    await reviewStatus.waitFor({ state: "visible", timeout: 5_000 });
  } catch {
    // Review can complete before the assertion window opens.
  }
  await reviewStatus.waitFor({ state: "hidden", timeout: 60_000 }).catch(() => {});
  await expect(page.getByTestId("optimize-current-page")).toBeVisible({ timeout: 60_000 });
}

export async function openActionsMenu(page) {
  await page.getByTestId("editor-actions-button").click();
}

export async function downloadFromActions(page, actionTestId) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    (async () => {
      await openActionsMenu(page);
      await page.getByTestId(actionTestId).click();
    })(),
  ]);
  return download;
}

export async function renameFirstHeadline(page, nextText) {
  const frame = page
    .locator('[data-ppt-report-root="studio-main"]')
    .frameLocator('[data-testid="report-page-frame-1"]');
  const headline = frame.locator('[data-html-block-id="block-1"]').first();
  await headline.dblclick({ force: true });
  await expect(page.getByTestId("quick-edit-popover")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("quick-edit-input").fill(nextText);
  await page.getByTestId("quick-edit-apply").click();
  await expect(page.getByTestId("quick-edit-popover")).toBeHidden({ timeout: 10_000 });
  await expect(frame.locator("body")).toContainText(nextText);
}

export async function selectFilmstripPage(page, pageNumber) {
  await page.getByTestId(`filmstrip-page-${pageNumber}`).click();
  await expect(page.getByTestId("optimize-current-page")).toContainText(String(pageNumber));
}

export async function dragLocatorBy(page, locator, deltaX, deltaY, options = {}) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Locator is not visible enough to drag.");
  }

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const steps = Number.isFinite(options.steps) ? Math.max(1, Math.round(options.steps)) : 12;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps });
  await page.mouse.up();
}
