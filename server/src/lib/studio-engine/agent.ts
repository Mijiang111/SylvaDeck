import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Response } from "express";
import {
  execute as executeAgent,
  testEnvironment as testAgentEnvironment,
} from "../cursor-cli.js";
import { logger } from "../../middleware/logger.js";
import type {
  ExecuteStageResult,
  ModuleUsageMode,
  StagePressureReport,
  StudioStageTraceEntry,
  StudioGenerateStreamEvent,
} from "./contracts.js";

export type StudioAgentConfig = {
  command: string;
  model: string;
  cwd: string;
};

function resolveStageTimeoutSec(stage: string) {
  if (stage.startsWith("repair-page-")) {
    return 170;
  }
  if (stage.startsWith("page-render-")) {
    return 120;
  }
  return 95;
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
    command: string;
    model: string;
    cwd: string;
  }> | null,
) {
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
    commandOverride === "codex" && detectedCommand ? detectedCommand : commandOverride;

  return {
    command: effectiveCommandOverride || explicitCommand || detectedCommand || "codex",
    model: modelOverride || "gpt-5.4-mini",
    cwd:
      cwdOverride ||
      explicitCwd ||
      (fs.existsSync(asciiWorkspaceRoot) ? asciiWorkspaceRoot : projectRoot),
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

export function getBlockingAgentChecks(result: Awaited<ReturnType<typeof testAgentConfig>>) {
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
      command: args.agentConfig.command,
      cwd: args.agentConfig.cwd,
      model: args.agentConfig.model,
      mode: "ask",
      promptTemplate: args.prompt,
      extraArgs: ["-c", 'model_reasoning_effort="low"', "-c", "mcp_servers={}"],
      timeoutSec: resolveStageTimeoutSec(args.stage),
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
