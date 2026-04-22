import test from "node:test";
import assert from "node:assert/strict";
import type { Response } from "express";
import { createStreamWriter, resolveAgentConfig, testAgentConfig } from "./agent.js";

test("resolveAgentConfig falls back to node for kimi when no command override is provided", () => {
  const originalProvider = process.env.PPT_STUDIO_AGENT_PROVIDER;
  const originalCommand = process.env.PPT_STUDIO_AGENT_COMMAND;

  try {
    delete process.env.PPT_STUDIO_AGENT_PROVIDER;
    delete process.env.PPT_STUDIO_AGENT_COMMAND;

    const config = resolveAgentConfig({
      provider: "kimi",
      command: "",
      cwd: process.cwd(),
      model: "moonshot-v1-128k",
      apiKey: "",
      baseUrl: "https://api.moonshot.cn/v1",
    });

    assert.equal(config.provider, "kimi");
    assert.equal(config.command, process.execPath);
  } finally {
    if (originalProvider === undefined) {
      delete process.env.PPT_STUDIO_AGENT_PROVIDER;
    } else {
      process.env.PPT_STUDIO_AGENT_PROVIDER = originalProvider;
    }
    if (originalCommand === undefined) {
      delete process.env.PPT_STUDIO_AGENT_COMMAND;
    } else {
      process.env.PPT_STUDIO_AGENT_COMMAND = originalCommand;
    }
  }
});

test("testAgentConfig performs a local kimi wrapper self-check", async () => {
  const result = await testAgentConfig({
    provider: "kimi",
    command: process.execPath,
    model: "moonshot-v1-128k",
    cwd: process.cwd(),
    apiKey: "",
    baseUrl: "https://api.moonshot.cn/v1",
  });

  assert.equal(result.adapterType, "kimi");
  assert.ok(result.checks.some((check) => check.code === "kimi_api_key_missing"));
  assert.ok(result.checks.some((check) => check.code === "kimi_local_probe_passed"));
  assert.equal(result.checks.some((check) => check.code === "kimi_local_probe_failed"), false);
});

test("createStreamWriter swallows disconnect-time write failures", async () => {
  const writer = createStreamWriter({
    writableEnded: false,
    write() {
      throw new Error("socket closed");
    },
  } as unknown as Response);

  await assert.doesNotReject(() =>
    writer({
      type: "run_started",
      runId: "run-1",
    }),
  );
});

test("createStreamWriter skips writes after the response has ended", async () => {
  let writeCalls = 0;
  const writer = createStreamWriter({
    writableEnded: true,
    write() {
      writeCalls += 1;
      return true;
    },
  } as unknown as Response);

  await writer({
    type: "run_started",
    runId: "run-1",
  });

  assert.equal(writeCalls, 0);
});
