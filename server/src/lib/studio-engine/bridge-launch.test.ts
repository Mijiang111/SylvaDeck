import test from "node:test";
import assert from "node:assert/strict";
import {
  consumeStudioBridgeLaunch,
  createStudioBridgeLaunch,
  resetStudioBridgeLaunchStore,
} from "./bridge-launch.js";

test.afterEach(() => {
  resetStudioBridgeLaunchStore();
});

test("createStudioBridgeLaunch returns launch metadata and a browser-openable URL", () => {
  const launch = createStudioBridgeLaunch({
    prompt: "Create a one-page product intro.",
    projectName: null,
    generationMode: "standard",
    moduleUsageMode: "disabled",
    htmlOutputMode: "static",
    requestedPageCount: null,
    mode: "inject-and-generate",
  }, {
    now: Date.parse("2026-04-23T10:00:00.000Z"),
    uiBaseUrl: "http://127.0.0.1:5174/",
  });

  assert.ok(launch.launchId.length > 0);
  assert.equal(
    launch.openUrl,
    `http://127.0.0.1:5174/?bridgeLaunch=${launch.launchId}`,
  );
  assert.equal(launch.expiresAt, "2026-04-23T10:15:00.000Z");
});

test("consumeStudioBridgeLaunch returns a valid payload once", () => {
  const launch = createStudioBridgeLaunch({
    prompt: "Create a three-page market update.",
    projectName: "Market update",
    generationMode: "standard",
    moduleUsageMode: "chart-only",
    htmlOutputMode: "animated-preview-js",
    requestedPageCount: 3,
    mode: "inject-and-generate",
  }, {
    now: Date.parse("2026-04-23T10:00:00.000Z"),
  });

  const firstConsume = consumeStudioBridgeLaunch(launch.launchId, {
    now: Date.parse("2026-04-23T10:02:00.000Z"),
  });
  const secondConsume = consumeStudioBridgeLaunch(launch.launchId, {
    now: Date.parse("2026-04-23T10:02:00.000Z"),
  });

  assert.deepEqual(firstConsume, {
    launchId: launch.launchId,
    prompt: "Create a three-page market update.",
    projectName: "Market update",
    generationMode: "standard",
    moduleUsageMode: "chart-only",
    htmlOutputMode: "animated-preview-js",
    requestedPageCount: 3,
    mode: "inject-and-generate",
    expiresAt: "2026-04-23T10:15:00.000Z",
  });
  assert.equal(secondConsume, null);
});

test("expired launch ids fail cleanly", () => {
  const launch = createStudioBridgeLaunch({
    prompt: "Create a one-page summary.",
    projectName: null,
    generationMode: "standard",
    moduleUsageMode: "disabled",
    htmlOutputMode: "static",
    requestedPageCount: null,
    mode: "inject-and-generate",
  }, {
    now: Date.parse("2026-04-23T10:00:00.000Z"),
    ttlMs: 5_000,
  });

  const consumed = consumeStudioBridgeLaunch(launch.launchId, {
    now: Date.parse("2026-04-23T10:00:06.000Z"),
  });

  assert.equal(consumed, null);
});
