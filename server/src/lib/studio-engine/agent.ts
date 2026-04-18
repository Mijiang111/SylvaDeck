import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Response } from "express";
import {
  DEFAULT_CODEX_LOCAL_MODEL,
  execute as executeAgent,
  testEnvironment as testAgentEnvironment,
} from "../cursor-cli.js";
import {
  DEFAULT_KIMI_BASE_URL,
  DEFAULT_KIMI_MODEL,
  type KimiEnvironmentCheck,
  type KimiEnvironmentTestResult,
  testEnvironment as testKimiEnvironment,
} from "./kimi-adapter.js";
import { logger } from "../../middleware/logger.js";
import type {
  ExecuteStageResult,
  ModuleUsageMode,
  StagePressureReport,
  StudioStageTraceEntry,
  StudioGenerateStreamEvent,
} from "./contracts.js";

export type StudioAgentConfig = {
  provider: "cursor" | "codex" | "kimi";
  command: string;
  model: string;
  cwd: string;
  apiKey: string;
  baseUrl: string;
};

function normalizeStudioAgentModel(provider: StudioAgentConfig["provider"], model: string | null | undefined) {
  const normalized = model?.trim();
  if (!normalized || normalized.toLowerCase() === "auto") {
    if (provider === "kimi") return DEFAULT_KIMI_MODEL;
    return DEFAULT_CODEX_LOCAL_MODEL;
  }
  if (normalized === "gpt-5.4-mini") {
    return DEFAULT_CODEX_LOCAL_MODEL;
  }
  return normalized;
}

function resolveStageTimeoutSec(stage: string) {
  if (stage.startsWith("repair-page-")) {
    return 170;
  }
  if (stage.startsWith("page-render-")) {
    return 120;
  }
  return 95;
}

function summarizeKimiStatus(checks: KimiEnvironmentCheck[]): KimiEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) {
    return "fail";
  }
  if (checks.some((check) => check.level === "warn")) {
    return "warn";
  }
  return "pass";
}

function getKimiWrapperPath() {
  return path.resolve(import.meta.dirname || process.cwd(), "kimi-exec.mjs");
}

function buildKimiExecutionConfig(
  agentConfig: StudioAgentConfig,
  options?: {
    selfCheck?: boolean;
    prompt?: string;
    timeoutSec?: number;
  },
) {
  return {
    command: agentConfig.command || process.execPath,
    cwd: agentConfig.cwd,
    model: agentConfig.model,
    mode: "ask" as const,
    promptTemplate: options?.prompt ?? "",
    extraArgs: [
      "--kimi-wrapper",
      getKimiWrapperPath(),
      ...(options?.selfCheck ? ["--self-check"] : []),
    ],
    env: {
      KIMI_API_KEY: agentConfig.apiKey,
      KIMI_BASE_URL: agentConfig.baseUrl,
    },
    timeoutSec: options?.timeoutSec,
  };
}


function parseRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function collectAssistantTextParts(message: unknown) {
  if (typeof message === "string") {
    return message.trim() ? [message.trim()] : [];
  }

  const record = parseRecord(message);
  const directText = readString(record.text).trim();
  const nextParts = directText ? [directText] : [];
  const content = Array.isArray(record.content) ? record.content : [];

  for (const entry of content) {
    const part = parseRecord(entry);
    const type = readString(part.type).trim();
    if (type === "text" || type === "output_text") {
      const text = readString(part.text).trim();
      if (text) {
        nextParts.push(text);
      }
    }
  }

  return nextParts;
}

function extractAssistantTextFromStdoutLine(rawLine: string) {
  const trimmed = rawLine.trim();
  if (!trimmed) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }

  const event = parseRecord(parsed);
  const type = readString(event.type).trim();
  if (!type) {
    return [];
  }

  if (type === "assistant") {
    return collectAssistantTextParts(event.message);
  }

  if (type === "item.completed") {
    const item = parseRecord(event.item);
    if (readString(item.type) === "agent_message") {
      return collectAssistantTextParts(item.text || item);
    }
    return [];
  }

  if (type === "text") {
    return collectAssistantTextParts(parseRecord(event.part));
  }

  return [];
}

export function resolveAgentConfig(
  overrides?: Partial<{
    provider: string;
    command: string;
    model: string;
    cwd: string;
    apiKey: string;
    baseUrl: string;
  }> | null,
) {
  const rawProvider = overrides?.provider?.trim().toLowerCase() || process.env.PPT_STUDIO_AGENT_PROVIDER?.trim().toLowerCase() || "";
  const provider: StudioAgentConfig["provider"] =
    rawProvider === "cursor" || rawProvider === "kimi" ? rawProvider : "codex";

  const localCodexAppPath = "/Applications/Codex.app/Contents/Resources/codex";
  const commandOverride = overrides?.command?.trim();
  const cwdOverride = overrides?.cwd?.trim();
  const modelOverride = overrides?.model?.trim();
  const homeDocuments = path.join(os.homedir(), "Documents");
  const asciiWorkspaceRoot = path.join(homeDocuments, "New project");
  const projectRoot = path.resolve(process.cwd(), "..");
  const detectedCommand = fs.existsSync(localCodexAppPath) ? localCodexAppPath : null;
  const explicitCommand = process.env.PPT_STUDIO_AGENT_COMMAND?.trim();
  const explicitCwd = process.env.PPT_STUDIO_AGENT_CWD?.trim();
  const effectiveCommandOverride =
    provider === "codex" && commandOverride === "codex" && detectedCommand
      ? detectedCommand
      : commandOverride;
  const effectiveExplicitCommand =
    provider === "codex" && explicitCommand === "codex" && detectedCommand
      ? detectedCommand
      : explicitCommand;
  const fallbackCommand =
    provider === "cursor"
      ? "agent"
      : provider === "kimi"
        ? process.execPath
        : detectedCommand || "codex";

  return {
    provider,
    command: effectiveCommandOverride || effectiveExplicitCommand || fallbackCommand,
    model: normalizeStudioAgentModel(provider, modelOverride),
    cwd:
      cwdOverride ||
      explicitCwd ||
      (fs.existsSync(asciiWorkspaceRoot) ? asciiWorkspaceRoot : projectRoot),
    apiKey: overrides?.apiKey?.trim() || process.env.KIMI_API_KEY?.trim() || "",
    baseUrl: overrides?.baseUrl?.trim() || process.env.KIMI_BASE_URL?.trim() || DEFAULT_KIMI_BASE_URL,
  };
}

function getPromptLogDirectory() {
  const override = process.env.PPT_STUDIO_PROMPT_LOG_DIR?.trim();
  return override || path.resolve(process.cwd(), "..", ".logs", "prompt-traces");
}

function writePromptTrace(args: {
  prompt: string;
  payload: unknown;
  agentConfig: StudioAgentConfig;
  stage: string;
  runId: string;
  traceMeta?: Record<string, unknown>;
}) {
  const directory = getPromptLogDirectory();
  fs.mkdirSync(directory, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${timestamp}-studio-${args.stage}-${args.runId}.md`;
  const absolutePath = path.join(directory, filename);
  const latestPath = path.join(directory, `latest-studio-${args.stage}.md`);
  const contents = [
    "# Studio generate prompt trace",
    "",
    `- capturedAt: ${new Date().toISOString()}`,
    `- runId: ${args.runId}`,
    `- stage: ${args.stage}`,
    `- command: ${args.agentConfig.command}`,
    `- model: ${args.agentConfig.model}`,
    `- cwd: ${args.agentConfig.cwd}`,
    "",
    "## Trace metadata",
    "```json",
    JSON.stringify(args.traceMeta ?? {}, null, 2),
    "```",
    "",
    "## Payload",
    "```json",
    JSON.stringify(args.payload, null, 2),
    "```",
    "",
    "## Prompt",
    "```text",
    args.prompt,
    "```",
    "",
  ].join("\n");

  fs.writeFileSync(absolutePath, contents, "utf8");
  fs.writeFileSync(latestPath, contents, "utf8");

  return { absolutePath, latestPath };
}

export async function testAgentConfig(agentConfig: StudioAgentConfig) {
  if (agentConfig.provider === "kimi") {
    const remote = await testKimiEnvironment({
      apiKey: agentConfig.apiKey,
      baseUrl: agentConfig.baseUrl,
      model: agentConfig.model,
    });
    const localChecks: KimiEnvironmentCheck[] = [];

    try {
      const localProbe = await executeAgent({
        runId: `studio-kimi-self-check-${Date.now()}`,
        agent: {
          id: "studio-kimi-self-check",
          companyId: "studio",
          name: "Studio Kimi Self Check",
          adapterType: "cursor",
          adapterConfig: null,
        },
        runtime: {
          sessionId: null,
          sessionParams: null,
          sessionDisplayId: null,
          taskKey: null,
        },
        config: buildKimiExecutionConfig(agentConfig, {
          selfCheck: true,
          prompt: "Kimi self-check.",
          timeoutSec: 20,
        }),
        context: {
          surface: "studio_generate",
          stage: "kimi-self-check",
        },
        onLog: async () => {},
      });

      if ((localProbe.exitCode ?? 1) === 0 && !localProbe.errorMessage) {
        localChecks.push({
          code: "kimi_local_probe_passed",
          level: "info",
          message: "Kimi local wrapper self-check succeeded.",
          detail: `Command: ${agentConfig.command || process.execPath}`,
        });
      } else {
        localChecks.push({
          code: "kimi_local_probe_failed",
          level: "error",
          message: "Kimi local wrapper self-check failed.",
          detail: localProbe.errorMessage ?? "Wrapper exited unsuccessfully.",
          hint: "Verify the configured command can run the local Kimi wrapper script.",
        });
      }
    } catch (error) {
      localChecks.push({
        code: "kimi_local_probe_failed",
        level: "error",
        message: "Kimi local wrapper self-check failed.",
        detail: error instanceof Error ? error.message : String(error),
        hint: "Verify the configured command and working directory for Kimi.",
      });
    }

    const checks = [...remote.checks, ...localChecks];
    return {
      adapterType: "kimi" as const,
      status: summarizeKimiStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }
  return testAgentEnvironment({
    companyId: "studio",
    adapterType: "cursor",
    config: {
      command: agentConfig.command,
      cwd: agentConfig.cwd,
      model: agentConfig.model,
      mode: "ask",
    },
  });
}

export function getBlockingAgentChecks(
  result: Awaited<ReturnType<typeof testAgentConfig>>,
) {
  if (result.adapterType === "kimi") {
    return result.checks.filter(
      (check) =>
        check.level === "error" &&
        (
          check.code === "kimi_api_key_missing" ||
          check.code === "kimi_base_url_missing" ||
          check.code === "kimi_hello_probe_failed" ||
          check.code === "kimi_local_probe_failed"
        ),
    );
  }
  return result.checks.filter(
    (check) =>
      check.level === "error" &&
      (check.code === "cursor_cwd_invalid" || check.code === "cursor_command_unresolvable"),
  );
}

export function createStreamWriter(res: Response) {
  return async (event: StudioGenerateStreamEvent) => {
    if (res.writableEnded) {
      return;
    }
    res.write(`${JSON.stringify(event)}\n`);
  };
}

export async function executeStudioStage(args: {
  runId: string;
  stage: string;
  prompt: string;
  payload: unknown;
  agentConfig: StudioAgentConfig;
  assistantTextParser?: (text: string) => string;
  onAssistantChunk?: (content: string) => Promise<void>;
  onStageTrace?: (entry: StudioStageTraceEntry) => Promise<void> | void;
  traceMeta?: Record<string, unknown>;
  signal?: AbortSignal;
}) {
  const stageStartedAt = Date.now();
  const payloadChars = JSON.stringify(args.payload).length;
  const promptTrace = writePromptTrace({
    prompt: args.prompt,
    payload: args.payload,
    agentConfig: args.agentConfig,
    stage: args.stage,
    runId: args.runId,
    traceMeta: {
      ...(args.traceMeta ?? {}),
      promptLength: args.prompt.length,
      payloadChars,
    },
  });
  const stderrChunks: string[] = [];
  const streamedAssistantChunks: string[] = [];
  let stdoutBuffer = "";
  const isKimi = args.agentConfig.provider === "kimi";

  const result = await executeAgent({
    runId: `${args.runId}-${args.stage}`,
    agent: {
      id: "studio-runtime",
      companyId: "studio",
      name: "Studio Runtime",
      adapterType: "cursor",
      adapterConfig: null,
    },
    runtime: {
      sessionId: null,
      sessionParams: null,
      sessionDisplayId: null,
      taskKey: null,
    },
    config: {
      ...(isKimi
        ? buildKimiExecutionConfig(args.agentConfig, {
            prompt: args.prompt,
            timeoutSec: resolveStageTimeoutSec(args.stage),
          })
        : {
            command: args.agentConfig.command,
            cwd: args.agentConfig.cwd,
            model: args.agentConfig.model,
            mode: "ask" as const,
            promptTemplate: args.prompt,
            extraArgs: ["-c", 'model_reasoning_effort="low"', "-c", "mcp_servers={}"],
            env: undefined,
            timeoutSec: resolveStageTimeoutSec(args.stage),
          }),
    },
    context: {
      surface: "studio_generate",
      stage: args.stage,
    },
    signal: args.signal,
    onLog: async (stream, chunk) => {
      if (stream === "stdout") {
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? "";

        if (args.onAssistantChunk) {
          for (const line of lines) {
            const textParts = extractAssistantTextFromStdoutLine(line);
            for (const textPart of textParts) {
              const cleaned = (args.assistantTextParser?.(textPart) ?? textPart).trim();
              if (!cleaned || streamedAssistantChunks.includes(cleaned)) {
                continue;
              }
              streamedAssistantChunks.push(cleaned);
              await args.onAssistantChunk(cleaned);
            }
          }
        }
        return;
      }

      if (stream === "stderr") {
        stderrChunks.push(chunk);
      }
    },
  });

  if (args.onAssistantChunk && stdoutBuffer.trim()) {
    const textParts = extractAssistantTextFromStdoutLine(stdoutBuffer);
    for (const textPart of textParts) {
      const cleaned = (args.assistantTextParser?.(textPart) ?? textPart).trim();
      if (!cleaned || streamedAssistantChunks.includes(cleaned)) {
        continue;
      }
      streamedAssistantChunks.push(cleaned);
      await args.onAssistantChunk(cleaned);
    }
  }

  const pressureReport: StagePressureReport = {
    stage: args.stage,
    promptLength: args.prompt.length,
    payloadChars,
    durationMs: Date.now() - stageStartedAt,
    moduleUsageMode:
      typeof args.traceMeta?.moduleUsageMode === "string"
        ? (args.traceMeta.moduleUsageMode as ModuleUsageMode)
        : "disabled",
    publishedModuleCount:
      typeof args.traceMeta?.publishedModuleCount === "number"
        ? (args.traceMeta.publishedModuleCount as number)
        : 0,
  };
  const executionSection = [
    "",
    "## Execution",
    "```json",
    JSON.stringify(pressureReport, null, 2),
    "```",
    "",
  ].join("\n");
  fs.appendFileSync(promptTrace.absolutePath, executionSection, "utf8");
  fs.appendFileSync(promptTrace.latestPath, executionSection, "utf8");

  const stageTraceBase = {
    stage: args.stage,
    traceMeta: {
      ...(args.traceMeta ?? {}),
      promptLength: args.prompt.length,
      payloadChars,
    },
    pressureReport,
    promptTracePath: promptTrace.absolutePath,
    latestPromptTracePath: promptTrace.latestPath,
  } satisfies Omit<StudioStageTraceEntry, "status">;

  if ((result.exitCode ?? 1) !== 0) {
    await args.onStageTrace?.({
      ...stageTraceBase,
      status: "failed",
    });
    throw new Error(
      result.errorMessage ||
        stderrChunks.join("").trim().slice(0, 400) ||
        `Studio ${args.stage} generation failed.`,
    );
  }

  logger.info(
    {
      stage: args.stage,
      command: args.agentConfig.command,
      model: result.model ?? args.agentConfig.model,
      promptLogPath: promptTrace.absolutePath,
      latestPromptLogPath: promptTrace.latestPath,
    },
    "studio generation stage succeeded",
  );

  await args.onStageTrace?.({
    ...stageTraceBase,
    status: "succeeded",
  });

  return {
    summary: result.summary ?? "",
    model: result.model ?? args.agentConfig.model,
    streamedAssistantText: streamedAssistantChunks.join("\n\n").trim(),
  } satisfies ExecuteStageResult;
}
