import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  testDir: __dirname,
  timeout: process.env.STUDIO_STABILITY_LIVE ? 6 * 60 * 1000 : 2 * 60 * 1000,
  expect: {
    timeout: 30_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: path.join(projectRoot, "playwright-report") }],
  ],
  outputDir: path.join(projectRoot, "test-results"),
  use: {
    baseURL: "http://127.0.0.1:5174",
    headless: true,
    viewport: { width: 1440, height: 960 },
    acceptDownloads: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    cwd: projectRoot,
    command: "corepack pnpm dev",
    url: "http://127.0.0.1:5174/",
    timeout: 180_000,
    reuseExistingServer: true,
  },
});
