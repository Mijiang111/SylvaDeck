import test from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultWorkbenchAiSettings,
  normalizeWorkbenchAiSettings,
  resolveAgentConfigFromAiSettings,
} from "./ai-settings";

test("resolveAgentConfigFromAiSettings preserves kimi command and cwd", () => {
  const settings = createDefaultWorkbenchAiSettings();
  settings.provider = "kimi";
  settings.kimi.command = "/opt/homebrew/bin/node";
  settings.kimi.cwd = "/tmp/studio-kimi";
  settings.kimi.model = "moonshot-v1-32k";
  settings.kimi.apiKey = "sk-test";
  settings.kimi.baseUrl = "https://api.moonshot.cn/v1";

  const config = resolveAgentConfigFromAiSettings(settings);

  assert.deepEqual(config, {
    provider: "kimi",
    command: "/opt/homebrew/bin/node",
    model: "moonshot-v1-32k",
    cwd: "/tmp/studio-kimi",
    apiKey: "sk-test",
    baseUrl: "https://api.moonshot.cn/v1",
  });
});

test("normalizeWorkbenchAiSettings keeps kimi defaults stable when provider is kimi", () => {
  const normalized = normalizeWorkbenchAiSettings({
    version: 3,
    provider: "kimi",
    kimi: {
      command: "",
      model: "",
      cwd: "",
      apiKey: "",
      baseUrl: "",
    },
  });

  assert.equal(normalized.provider, "kimi");
  assert.equal(normalized.kimi.model, "moonshot-v1-128k");
  assert.equal(normalized.kimi.baseUrl, "https://api.moonshot.cn/v1");
});
