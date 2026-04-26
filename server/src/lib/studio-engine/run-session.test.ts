import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createStudioRunSessionRecorder,
  recoverLatestStudioRunSession,
} from "./run-session.js";
import type { StudioAgentConfig } from "./agent.js";
import type { GenerateStudioReportRequest } from "./schemas.js";

const agentConfig: StudioAgentConfig = {
  provider: "codex",
  command: "codex",
  model: "gpt-5.4",
  cwd: "/tmp",
  apiKey: "",
  baseUrl: "",
};

const payload: GenerateStudioReportRequest = {
  brief: "Create a one-page product intro.",
  pageCount: 1,
  generationMode: "standard",
  moduleUsageMode: "disabled",
  htmlOutputMode: "static",
  agentConfig,
  publishedModules: [],
  moduleManifestSignature: "",
  attachments: [],
};

test("run session recorder persists stream events, page snapshots, and final status", () => {
  const previousDir = process.env.PPT_STUDIO_RUN_SESSION_DIR;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-run-session-"));
  process.env.PPT_STUDIO_RUN_SESSION_DIR = tempDir;

  try {
    const recorder = createStudioRunSessionRecorder({
      kind: "generate",
      runId: "studio-test-run",
      payload,
      agentConfig,
    });

    recorder.recordStreamEvent({
      type: "page_ready",
      runId: "studio-test-run",
      pageNumber: 1,
      pageTitle: "Product intro",
      pageHtml: '<section class="page" data-page-number="1" data-page-title="Product intro" style="width:1600px;height:900px;"></section>',
    });
    recorder.recordStageTrace({
      stage: "page-render-1",
      status: "succeeded",
      traceMeta: {
        thinkingMode: "neutral",
      },
      pressureReport: {
        stage: "page-render-1",
        promptLength: 120,
        payloadChars: 80,
        durationMs: 15,
        moduleUsageMode: "disabled",
        publishedModuleCount: 0,
      },
      promptTracePath: "/tmp/prompt.md",
      latestPromptTracePath: "/tmp/latest.md",
    });
    recorder.recordStreamEvent({
      type: "final_report",
      runId: "studio-test-run",
      model: "gpt-5.4",
      report: {
        title: "Product intro",
        html: "<!DOCTYPE html><html><body></body></html>",
        pageCount: 1,
        pageTitles: ["Product intro"],
        htmlOutputMode: "static",
      },
    });
    recorder.finishSucceeded({
      enginePath: "v2",
    });

    const stored = JSON.parse(fs.readFileSync(recorder.path, "utf8")) as {
      status: string;
      pageSnapshots: Array<{ pageNumber: number; pageHtml: string }>;
      finalReport: { title: string; pageCount: number } | null;
      stageTraces: Array<{ stage: string }>;
      result: { enginePath?: string } | null;
    };
    const latest = JSON.parse(fs.readFileSync(recorder.latestPath, "utf8")) as {
      runId: string;
    };
    const recovery = recoverLatestStudioRunSession({
      kind: "generate",
    });

    assert.equal(stored.status, "succeeded");
    assert.equal(stored.pageSnapshots.length, 1);
    assert.equal(stored.pageSnapshots[0]!.pageNumber, 1);
    assert.match(stored.pageSnapshots[0]!.pageHtml, /Product intro/);
    assert.equal(stored.finalReport?.title, "Product intro");
    assert.equal(stored.finalReport?.pageCount, 1);
    assert.deepEqual(stored.stageTraces.map((entry) => entry.stage), ["page-render-1"]);
    assert.equal(stored.result?.enginePath, "v2");
    assert.equal(latest.runId, "studio-test-run");
    assert.ok(recovery);
    assert.equal(recovery.runId, "studio-test-run");
    assert.equal(recovery.finalReport?.title, "Product intro");
    assert.equal(recovery.pageSnapshots.length, 1);
    assert.match(recovery.pageSnapshots[0]!.pageHtml, /Product intro/);
  } finally {
    if (previousDir === undefined) {
      delete process.env.PPT_STUDIO_RUN_SESSION_DIR;
    } else {
      process.env.PPT_STUDIO_RUN_SESSION_DIR = previousDir;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
