import { expect, test } from "@playwright/test";
import { generateDeckFromPrompt } from "./helpers/browser-helpers.mjs";

const liveEnabled = process.env.STUDIO_STABILITY_LIVE === "1";

test.describe("Studio live canary", () => {
  test.skip(!liveEnabled, "Set STUDIO_STABILITY_LIVE=1 to run live model canaries.");

  test("@canary live standard 3-page generation reaches editor", async ({ page }) => {
    await generateDeckFromPrompt(
      page,
      "Create a 3-page executive deck on why an outpatient clinic network is still congested even after adding more clinicians.",
    );
    await expect(page.getByTestId("studio-editor-ready")).toBeVisible();
  });

  test("@canary live 3D hero generation reaches editor", async ({ page }) => {
    await generateDeckFromPrompt(
      page,
      "Create a 3-page executive deck on a next-generation AI chip system. Make page 1 a strong concept page that explains the physical system object.",
    );
    await expect(page.getByTestId("studio-editor-ready")).toBeVisible();
  });
});
