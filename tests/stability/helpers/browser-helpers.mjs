import { expect } from "@playwright/test";

export async function goToAiChat(page) {
  await page.goto("/");
  await page.getByTestId("home-nav-ai").click();
  await expect(page.getByTestId("ai-chat-prompt")).toBeVisible();
}

function getSidebar(page) {
  return page.locator(".studio-editor-sidebar");
}

async function ensurePropertiesPanelVisible(page) {
  const sidebar = getSidebar(page);
  if (await sidebar.isVisible().catch(() => false)) {
    return sidebar;
  }

  const propertiesButton = page.getByRole("button", { name: "Properties", exact: true });
  await expect(propertiesButton).toBeVisible({ timeout: 10_000 });

  // The editor can briefly restore the sidebar after streaming/review settles.
  // Give that passive recovery window a moment before we force-open it.
  try {
    await expect(sidebar).toBeVisible({ timeout: 1_500 });
    return sidebar;
  } catch {
    // Fall through to the explicit Properties toggle path.
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await sidebar.isVisible().catch(() => false)) {
      return sidebar;
    }

    await propertiesButton.click();
    try {
      await expect(sidebar).toBeVisible({ timeout: 4_000 });
      return sidebar;
    } catch {
      await page.waitForTimeout(250);
    }
  }

  return sidebar;
}

export async function generateDeckFromPrompt(page, prompt, options = {}) {
  await goToAiChat(page);
  await page.getByTestId("ai-chat-prompt").fill(prompt);
  await Promise.all([
    page.waitForURL(/\/projects\/.+\/edit/),
    page.getByTestId("ai-chat-generate").click({ force: true, noWaitAfter: true }),
  ]);
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
  await headline.click({ force: true });
  await ensurePropertiesPanelVisible(page);
  const contentInput = page.locator('[data-testid^="inspector-textarea-block-content-"]').first();
  await expect(contentInput).toBeVisible({ timeout: 10_000 });
  await contentInput.fill(nextText);
  await expect(headline).toContainText(nextText, { timeout: 10_000 });
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
