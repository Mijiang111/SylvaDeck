import { createHash } from "node:crypto";
import { chromium, type Browser } from "@playwright/test";

export type StudioSnapshotRasterizePage = {
  pageNumber: number;
  html: string;
};

export type StudioSnapshotRasterizeJob = {
  pageNumber: number;
  snapshotId: string;
};

export type StudioSnapshotRasterizeResult = {
  pageNumber: number;
  snapshotId: string;
  pngDataUri?: string;
  error?: string;
};

const MAX_CACHE_ENTRIES = 96;
const snapshotCache = new Map<string, string>();
let browserPromise: Promise<Browser> | null = null;

function htmlHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function cssStringLiteral(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function rememberSnapshot(key: string, dataUri: string) {
  if (snapshotCache.has(key)) {
    snapshotCache.delete(key);
  }
  snapshotCache.set(key, dataUri);
  while (snapshotCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = snapshotCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    snapshotCache.delete(oldestKey);
  }
}

async function getBrowser() {
  browserPromise ??= chromium.launch({ headless: true });
  return browserPromise;
}

export async function rasterizeStudioSnapshotJobs(args: {
  pages: StudioSnapshotRasterizePage[];
  jobs: StudioSnapshotRasterizeJob[];
}): Promise<StudioSnapshotRasterizeResult[]> {
  const pagesByNumber = new Map(args.pages.map((page) => [page.pageNumber, page]));
  const jobsByPageNumber = new Map<number, StudioSnapshotRasterizeJob[]>();
  args.jobs.forEach((job) => {
    const jobs = jobsByPageNumber.get(job.pageNumber) ?? [];
    jobs.push(job);
    jobsByPageNumber.set(job.pageNumber, jobs);
  });

  const results: StudioSnapshotRasterizeResult[] = [];
  const pendingPages = Array.from(jobsByPageNumber.entries()).filter(([pageNumber, jobs]) => {
    const page = pagesByNumber.get(pageNumber);
    if (!page) {
      jobs.forEach((job) => {
        results.push({
          pageNumber: job.pageNumber,
          snapshotId: job.snapshotId,
          error: `Page ${job.pageNumber} HTML was not provided to the snapshot rasterizer.`,
        });
      });
      return false;
    }

    const pageHash = htmlHash(page.html);
    const pendingJobs = jobs.filter((job) => {
      const cacheKey = `${pageHash}:${job.snapshotId}`;
      const cached = snapshotCache.get(cacheKey);
      if (cached) {
        results.push({
          pageNumber: job.pageNumber,
          snapshotId: job.snapshotId,
          pngDataUri: cached,
        });
        return false;
      }
      return true;
    });
    jobsByPageNumber.set(pageNumber, pendingJobs);
    return pendingJobs.length > 0;
  });

  if (pendingPages.length === 0) {
    return results;
  }

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 2,
  });
  try {
    for (const [pageNumber] of pendingPages) {
      const pageSource = pagesByNumber.get(pageNumber);
      const jobs = jobsByPageNumber.get(pageNumber) ?? [];
      if (!pageSource || jobs.length === 0) {
        continue;
      }
      const pageHash = htmlHash(pageSource.html);
      const page = await context.newPage();
      try {
        await page.setContent(pageSource.html, {
          waitUntil: "networkidle",
          timeout: 10_000,
        });
        await page.evaluate(() => document.fonts?.ready);
        for (const job of jobs) {
          const cacheKey = `${pageHash}:${job.snapshotId}`;
          try {
            const selector = `[data-ppt-snapshot-id="${cssStringLiteral(job.snapshotId)}"]`;
            const element = await page.$(selector);
            if (!element) {
              throw new Error(`Snapshot target ${job.snapshotId} was not found.`);
            }
            const box = await element.boundingBox();
            if (!box || box.width < 1 || box.height < 1) {
              throw new Error(`Snapshot target ${job.snapshotId} has empty bounds.`);
            }
            const png = await page.screenshot({
              type: "png",
              clip: {
                x: Math.max(0, box.x),
                y: Math.max(0, box.y),
                width: Math.max(1, box.width),
                height: Math.max(1, box.height),
              },
              timeout: 10_000,
            });
            const pngDataUri = `data:image/png;base64,${png.toString("base64")}`;
            rememberSnapshot(cacheKey, pngDataUri);
            results.push({
              pageNumber: job.pageNumber,
              snapshotId: job.snapshotId,
              pngDataUri,
            });
          } catch (error) {
            results.push({
              pageNumber: job.pageNumber,
              snapshotId: job.snapshotId,
              error:
                error instanceof Error && error.message.trim()
                  ? error.message
                  : "Snapshot target could not be rasterized.",
            });
          }
        }
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await context.close().catch(() => undefined);
  }

  return results;
}
