import { spawn, type ChildProcess } from "node:child_process";
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";

export const DEFAULT_CURSOR_LOCAL_MODEL = "auto";
export const DEFAULT_CODEX_LOCAL_MODEL = "gpt-5.4-mini";
export const DEFAULT_CODEX_REASONING_EFFORT = "medium";

type CursorStream = "stdout" | "stderr";

type CursorEnvironmentCheck = {
  code: string;
  level: "info" | "warn" | "error";
  message: string;
  detail?: string | null;
  hint?: string | null;
};

type CursorEnvironmentTestContext = {
  adapterType: "cursor";
  config: {
    command?: unknown;
    cwd?: unknown;
    model?: unknown;
    mode?: unknown;
    env?: unknown;
    extraArgs?: unknown;
    args?: unknown;
  };
  [key: string]: unknown;
};

type CursorEnvironmentTestResult = {
  adapterType: "cursor";
  status: "pass" | "warn" | "fail";
  checks: CursorEnvironmentCheck[];
  testedAt: string;
};

type CursorExecuteContext = {
  runId: string;
  config: {
    command?: unknown;
    cwd?: unknown;
    model?: unknown;
    mode?: unknown;
    promptTemplate?: unknown;
    env?: unknown;
    extraArgs?: unknown;
    args?: unknown;
    timeoutSec?: unknown;
    graceSec?: unknown;
  };
  signal?: AbortSignal;
  onLog: (stream: CursorStream, chunk: string) => Promise<void>;
  [key: string]: unknown;
};

type CursorExecuteResult = {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  errorMessage: string | null;
  model: string | null;
  resultJson: {
    stdout: string;
    stderr: string;
  };
  summary: string | null;
};

type RunProcessResult = {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
};

type ChildProcessWithEvents = ChildProcess & {
  on(event: "error", listener: (err: Error) => void): ChildProcess;
  on(
    event: "close",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): ChildProcess;
};

const CURSOR_AUTH_REQUIRED_RE =
  /(?:authentication\s+required|not\s+authenticated|not\s+logged\s+in|unauthorized|invalid(?:\s+or\s+missing)?\s+api(?:[_\s-]?key)?|cursor[_\s-]?api[_\s-]?key|run\s+'?agent\s+login'?\s+first|api(?:[_\s-]?key)?(?:\s+is)?\s+required)/i;
const CODEX_AUTH_REQUIRED_RE =
  /(?:not\s+logged\s+in|login\s+required|authentication\s+required|unauthorized|invalid(?:\s+or\s+missing)?\s+api(?:[_\s-]?key)?|openai[_\s-]?api[_\s-]?key|api[_\s-]?key.*required|please\s+run\s+`?codex\s+login`?)/i;

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function parseJson(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function appendWithCap(prev: string, chunk: string, cap = 4 * 1024 * 1024) {
  const combined = prev + chunk;
  return combined.length > cap ? combined.slice(combined.length - cap) : combined;
}

function defaultPathForPlatform() {
  if (process.platform === "win32") {
    return "C:\\Windows\\System32;C:\\Windows;C:\\Windows\\System32\\Wbem";
  }
  return "/usr/local/bin:/opt/homebrew/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin";
}

function ensurePathInEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (typeof env.PATH === "string" && env.PATH.length > 0) return env;
  if (typeof env.Path === "string" && env.Path.length > 0) return env;
  return { ...env, PATH: defaultPathForPlatform() };
}

async function ensureAbsoluteDirectory(cwd: string, opts: { createIfMissing?: boolean } = {}) {
  if (!path.isAbsolute(cwd)) {
    throw new Error(`Working directory must be an absolute path: "${cwd}"`);
  }

  const assertDirectory = async () => {
    const stats = await fs.stat(cwd);
    if (!stats.isDirectory()) {
      throw new Error(`Working directory is not a directory: "${cwd}"`);
    }
  };

  try {
    await assertDirectory();
    return;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (!opts.createIfMissing || code !== "ENOENT") {
      if (code === "ENOENT") {
        throw new Error(`Working directory does not exist: "${cwd}"`);
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  try {
    await fs.mkdir(cwd, { recursive: true });
    await assertDirectory();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not create working directory "${cwd}": ${reason}`);
  }
}

async function ensureCommandResolvable(command: string, cwd: string, env: NodeJS.ProcessEnv) {
  const hasPathSeparator = command.includes("/") || command.includes("\\");
  if (hasPathSeparator) {
    const absolute = path.isAbsolute(command) ? command : path.resolve(cwd, command);
    try {
      await fs.access(absolute, fsConstants.X_OK);
    } catch {
      throw new Error(`Command is not executable: "${command}" (resolved: "${absolute}")`);
    }
    return;
  }

  const pathValue = env.PATH ?? env.Path ?? "";
  const delimiter = process.platform === "win32" ? ";" : ":";
  const dirs = pathValue.split(delimiter).filter(Boolean);
  const windowsExt =
    process.platform === "win32"
      ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
      : [""];

  for (const dir of dirs) {
    for (const ext of windowsExt) {
      const candidate = path.join(dir, process.platform === "win32" ? `${command}${ext}` : command);
      try {
        await fs.access(candidate, fsConstants.X_OK);
        return;
      } catch {
        continue;
      }
    }
  }

  throw new Error(`Command not found in PATH: "${command}"`);
}

async function runChildProcess(
  runId: string,
  command: string,
  args: string[],
  opts: {
    cwd: string;
    env: Record<string, string>;
    timeoutSec: number;
    graceSec: number;
    signal?: AbortSignal;
    stdin?: string;
    onLog: (stream: CursorStream, chunk: string) => Promise<void>;
  },
): Promise<RunProcessResult> {
  return new Promise<RunProcessResult>((resolve, reject) => {
    const mergedEnv = ensurePathInEnv({ ...process.env, ...opts.env });
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: mergedEnv,
      shell: false,
      stdio: [opts.stdin != null ? "pipe" : "ignore", "pipe", "pipe"],
    }) as ChildProcessWithEvents;

    if (opts.stdin != null && child.stdin) {
      child.stdin.write(opts.stdin);
      child.stdin.end();
    }

    let timedOut = false;
    let aborted = false;
    let stdout = "";
    let stderr = "";
    let logChain: Promise<void> = Promise.resolve();

    const timeout =
      opts.timeoutSec > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
            setTimeout(() => {
              if (!child.killed) {
                child.kill("SIGKILL");
              }
          }, Math.max(1, opts.graceSec) * 1000);
        }, opts.timeoutSec * 1000)
        : null;

    const abortHandler = () => {
      aborted = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, Math.max(1, opts.graceSec) * 1000);
    };

    if (opts.signal) {
      if (opts.signal.aborted) {
        abortHandler();
      } else {
        opts.signal.addEventListener("abort", abortHandler, { once: true });
      }
    }

    child.stdout?.on("data", (chunk: unknown) => {
      const text = String(chunk);
      stdout = appendWithCap(stdout, text);
      logChain = logChain.then(() => opts.onLog("stdout", text));
    });

    child.stderr?.on("data", (chunk: unknown) => {
      const text = String(chunk);
      stderr = appendWithCap(stderr, text);
      logChain = logChain.then(() => opts.onLog("stderr", text));
    });

    child.on("error", (err: Error) => {
      if (timeout) clearTimeout(timeout);
      if (opts.signal) {
        opts.signal.removeEventListener("abort", abortHandler);
      }
      const pathValue = mergedEnv.PATH ?? mergedEnv.Path ?? "";
      reject(
        new Error(
          `Failed to start command "${command}" in "${opts.cwd}": ${err.message}. PATH=${pathValue}`,
        ),
      );
    });

    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      if (timeout) clearTimeout(timeout);
      if (opts.signal) {
        opts.signal.removeEventListener("abort", abortHandler);
      }
      void logChain.finally(() => {
        if (aborted) {
          reject(new Error("Execution aborted"));
          return;
        }
        resolve({
          exitCode: code,
          signal,
          timedOut,
          stdout,
          stderr,
        });
      });
    });
  });
}

function normalizeCursorStreamLine(rawLine: string) {
  const trimmed = rawLine.trim();
  if (!trimmed) return { stream: null as CursorStream | null, line: "" };

  const prefixed = trimmed.match(/^(stdout|stderr)\s*[:=]?\s*([\[{].*)$/i);
  if (!prefixed) {
    return { stream: null as CursorStream | null, line: trimmed };
  }

  const stream = prefixed[1]?.toLowerCase() === "stderr" ? "stderr" : "stdout";
  return {
    stream,
    line: (prefixed[2] ?? "").trim(),
  };
}

function firstNonEmptyLine(text: string) {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}

function asErrorText(value: unknown): string {
  if (typeof value === "string") return value;
  const record = parseObject(value);
  const message =
    asString(record.message, "") ||
    asString(record.error, "") ||
    asString(record.code, "") ||
    asString(record.detail, "");
  if (message) return message;
  try {
    return JSON.stringify(record);
  } catch {
    return "";
  }
}

function collectAssistantText(message: unknown): string[] {
  if (typeof message === "string") {
    const trimmed = message.trim();
    return trimmed ? [trimmed] : [];
  }

  const record = parseObject(message);
  const direct = asString(record.text, "").trim();
  const lines: string[] = direct ? [direct] : [];
  const content = Array.isArray(record.content) ? record.content : [];

  for (const partRaw of content) {
    const part = parseObject(partRaw);
    const type = asString(part.type, "").trim();
    if (type === "output_text" || type === "text") {
      const text = asString(part.text, "").trim();
      if (text) lines.push(text);
    }
  }

  return lines;
}

function readSessionId(event: Record<string, unknown>) {
  return (
    asString(event.session_id, "").trim() ||
    asString(event.sessionId, "").trim() ||
    asString(event.sessionID, "").trim() ||
    null
  );
}

function parseCursorJsonl(stdout: string) {
  let sessionId: string | null = null;
  const messages: string[] = [];
  let errorMessage: string | null = null;

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = normalizeCursorStreamLine(rawLine).line;
    if (!line) continue;

    const event = parseJson(line);
    if (!event) continue;

    const foundSession = readSessionId(event);
    if (foundSession) sessionId = foundSession;

    const type = asString(event.type, "").trim();

    if (type === "assistant") {
      messages.push(...collectAssistantText(event.message));
      continue;
    }

    if (type === "result") {
      const isError = event.is_error === true || asString(event.subtype, "").toLowerCase() === "error";
      const resultText = asString(event.result, "").trim();
      if (resultText && messages.length === 0) {
        messages.push(resultText);
      }
      if (isError) {
        const resultError = asErrorText(event.error ?? event.message ?? event.result).trim();
        if (resultError) errorMessage = resultError;
      }
      continue;
    }

    if (type === "error") {
      const message = asErrorText(event.message ?? event.error ?? event.detail).trim();
      if (message) errorMessage = message;
      continue;
    }

    if (type === "system") {
      const subtype = asString(event.subtype, "").trim().toLowerCase();
      if (subtype === "error") {
        const message = asErrorText(event.message ?? event.error ?? event.detail).trim();
        if (message) errorMessage = message;
      }
      continue;
    }

    if (type === "text") {
      const part = parseObject(event.part);
      const text = asString(part.text, "").trim();
      if (text) messages.push(text);
    }
  }

  return {
    sessionId,
    summary: messages.join("\n\n").trim(),
    errorMessage,
  };
}

function parseCodexJsonl(stdout: string) {
  let sessionId: string | null = null;
  const messages: string[] = [];
  let errorMessage: string | null = null;

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const event = parseJson(line);
    if (!event) continue;

    const type = asString(event.type, "").trim();

    if (type === "thread.started") {
      sessionId = asString(event.thread_id, sessionId ?? "") || sessionId;
      continue;
    }

    if (type === "error") {
      const message = asString(event.message, "").trim();
      if (message) errorMessage = message;
      continue;
    }

    if (type === "item.completed") {
      const item = parseObject(event.item);
      if (asString(item.type, "") === "agent_message") {
        const text = asString(item.text, "").trim();
        if (text) messages.push(text);
      } else if (asString(item.type, "") === "error") {
        const message = asString(item.message, "").trim();
        if (message) errorMessage = message;
      }
      continue;
    }

    if (type === "turn.failed") {
      const err = parseObject(event.error);
      const message = asString(err.message, "").trim();
      if (message) errorMessage = message;
      continue;
    }
  }

  return {
    sessionId,
    summary: messages.join("\n\n").trim(),
    errorMessage,
  };
}

function hasCursorTrustBypassArg(args: readonly string[]) {
  return args.some(
    (arg) =>
      arg === "--trust" ||
      arg === "--yolo" ||
      arg === "-f" ||
      arg.startsWith("--trust="),
  );
}

function summarizeStatus(checks: CursorEnvironmentCheck[]): CursorEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function commandLooksLike(command: string, expected: string) {
  const base = path.basename(command).toLowerCase();
  return base === expected || base === `${expected}.cmd` || base === `${expected}.exe`;
}

function summarizeProbeDetail(stdout: string, stderr: string, parsedError: string | null) {
  const raw = parsedError?.trim() || firstNonEmptyLine(stderr) || firstNonEmptyLine(stdout);
  if (!raw) return null;
  const clean = raw.replace(/\s+/g, " ").trim();
  return clean.length > 240 ? `${clean.slice(0, 239)}…` : clean;
}

function resolveEnv(config: { env?: unknown }) {
  const envConfig = parseObject(config.env);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }
  return env;
}

function resolveExtraArgs(config: { extraArgs?: unknown; args?: unknown }) {
  const extraArgs = asStringArray(config.extraArgs);
  if (extraArgs.length > 0) return extraArgs;
  return asStringArray(config.args);
}

function hasCodexReasoningOverride(args: readonly string[]) {
  return args.some(
    (arg, index) =>
      arg.includes("model_reasoning_effort") ||
      (arg === "-c" && typeof args[index + 1] === "string" && args[index + 1]!.includes("model_reasoning_effort")),
  );
}

export async function testEnvironment(
  ctx: CursorEnvironmentTestContext,
): Promise<CursorEnvironmentTestResult> {
  const checks: CursorEnvironmentCheck[] = [];
  const command = asString(ctx.config.command, "agent");
  const cwd = asString(ctx.config.cwd, process.cwd());
  const isCodex = commandLooksLike(command, "codex");

  try {
    await ensureAbsoluteDirectory(cwd, { createIfMissing: true });
    checks.push({
      code: "cursor_cwd_valid",
      level: "info",
      message: `Working directory is valid: ${cwd}`,
    });
  } catch (err) {
    checks.push({
      code: "cursor_cwd_invalid",
      level: "error",
      message: err instanceof Error ? err.message : "Invalid working directory",
      detail: cwd,
    });
  }

  const env = resolveEnv(ctx.config);
  const runtimeEnv = ensurePathInEnv({ ...process.env, ...env });

  try {
    await ensureCommandResolvable(command, cwd, runtimeEnv);
    checks.push({
      code: "cursor_command_resolvable",
      level: "info",
      message: `Command is executable: ${command}`,
    });
  } catch (err) {
    checks.push({
      code: "cursor_command_unresolvable",
      level: "error",
      message: err instanceof Error ? err.message : "Command is not executable",
      detail: command,
    });
  }

  if (isCodex) {
    const configOpenAiKey = env.OPENAI_API_KEY;
    const hostOpenAiKey = process.env.OPENAI_API_KEY;
    if (isNonEmpty(configOpenAiKey) || isNonEmpty(hostOpenAiKey)) {
      const source = isNonEmpty(configOpenAiKey) ? "adapter config env" : "server environment";
      checks.push({
        code: "codex_api_key_present",
        level: "info",
        message: "OPENAI_API_KEY is set for Codex authentication.",
        detail: `Detected in ${source}.`,
      });
    } else {
      checks.push({
        code: "codex_api_key_missing",
        level: "warn",
        message: "OPENAI_API_KEY is not set. Codex may rely on local login/session auth.",
        hint: "Set OPENAI_API_KEY or run `codex login` if Codex asks for authentication.",
      });
    }
  } else {
    const configCursorApiKey = env.CURSOR_API_KEY;
    const hostCursorApiKey = process.env.CURSOR_API_KEY;
    if (isNonEmpty(configCursorApiKey) || isNonEmpty(hostCursorApiKey)) {
      const source = isNonEmpty(configCursorApiKey) ? "adapter config env" : "server environment";
      checks.push({
        code: "cursor_api_key_present",
        level: "info",
        message: "CURSOR_API_KEY is set for Cursor authentication.",
        detail: `Detected in ${source}.`,
      });
    } else {
      checks.push({
        code: "cursor_api_key_missing",
        level: "warn",
        message: "CURSOR_API_KEY is not set. Cursor runs may fail until authentication is configured.",
        hint: "Set CURSOR_API_KEY in the shell or run `agent login`.",
      });
    }
  }

  const canRunProbe =
    checks.every((check) => check.code !== "cursor_cwd_invalid" && check.code !== "cursor_command_unresolvable");
  if (canRunProbe) {
    if (isCodex) {
      const model = asString(ctx.config.model, DEFAULT_CODEX_LOCAL_MODEL).trim();
      const extraArgs = resolveExtraArgs(ctx.config);
      const args = ["exec", "--json", "--skip-git-repo-check"];
      if (!hasCodexReasoningOverride(extraArgs)) {
        args.push("-c", `model_reasoning_effort="${DEFAULT_CODEX_REASONING_EFFORT}"`);
      }
      if (model) args.push("--model", model);
      if (extraArgs.length > 0) args.push(...extraArgs);
      args.push("-");

      const probe = await runChildProcess(
        `codex-envtest-${Date.now()}`,
        command,
        args,
        {
          cwd,
          env,
          timeoutSec: 45,
          graceSec: 5,
          stdin: "Respond with hello.",
          onLog: async () => {},
        },
      );
      const parsed = parseCodexJsonl(probe.stdout);
      const detail = summarizeProbeDetail(probe.stdout, probe.stderr, parsed.errorMessage);
      const authEvidence = `${parsed.errorMessage ?? ""}\n${probe.stdout}\n${probe.stderr}`.trim();

      if (probe.timedOut) {
        checks.push({
          code: "codex_hello_probe_timed_out",
          level: "warn",
          message: "Codex hello probe timed out.",
          hint: "Retry the probe or run `codex exec --json -` manually.",
        });
      } else if ((probe.exitCode ?? 1) === 0) {
        const summary = parsed.summary.trim();
        const hasHello = /\bhello\b/i.test(summary);
        checks.push({
          code: hasHello ? "codex_hello_probe_passed" : "codex_hello_probe_unexpected_output",
          level: hasHello ? "info" : "warn",
          message: hasHello
            ? "Codex hello probe succeeded."
            : "Codex probe ran but did not return `hello` as expected.",
          ...(summary ? { detail: summary.replace(/\s+/g, " ").trim().slice(0, 240) } : {}),
        });
      } else if (CODEX_AUTH_REQUIRED_RE.test(authEvidence)) {
        checks.push({
          code: "codex_hello_probe_auth_required",
          level: "warn",
          message: "Codex CLI is installed, but authentication is not ready.",
          ...(detail ? { detail } : {}),
          hint: "Run `codex login` or configure OPENAI_API_KEY, then retry the probe.",
        });
      } else {
        checks.push({
          code: "codex_hello_probe_failed",
          level: "error",
          message: "Codex hello probe failed.",
          ...(detail ? { detail } : {}),
          hint: "Run `codex exec --json -` manually in this working directory to debug.",
        });
      }
    } else if (!commandLooksLike(command, "agent")) {
      checks.push({
        code: "cursor_hello_probe_skipped_custom_command",
        level: "info",
        message: "Skipped hello probe because command is not `agent`.",
        detail: command,
      });
    } else {
      const model = asString(ctx.config.model, DEFAULT_CURSOR_LOCAL_MODEL).trim();
      const extraArgs = resolveExtraArgs(ctx.config);
      const autoTrustEnabled = !hasCursorTrustBypassArg(extraArgs);
      const args = ["-p", "--mode", "ask", "--output-format", "stream-json", "--workspace", cwd];
      if (model) args.push("--model", model);
      if (autoTrustEnabled) args.push("--yolo");
      if (extraArgs.length > 0) args.push(...extraArgs);

      const probe = await runChildProcess(
        `cursor-envtest-${Date.now()}`,
        command,
        args,
        {
          cwd,
          env,
          timeoutSec: 45,
          graceSec: 5,
          stdin: "Respond with hello.",
          onLog: async () => {},
        },
      );
      const parsed = parseCursorJsonl(probe.stdout);
      const detail = summarizeProbeDetail(probe.stdout, probe.stderr, parsed.errorMessage);
      const authEvidence = `${parsed.errorMessage ?? ""}\n${probe.stdout}\n${probe.stderr}`.trim();

      if (probe.timedOut) {
        checks.push({
          code: "cursor_hello_probe_timed_out",
          level: "warn",
          message: "Cursor hello probe timed out.",
          hint: "Retry the probe or run `agent -p --mode ask --output-format stream-json` manually.",
        });
      } else if ((probe.exitCode ?? 1) === 0) {
        const summary = parsed.summary.trim();
        const hasHello = /\bhello\b/i.test(summary);
        checks.push({
          code: hasHello ? "cursor_hello_probe_passed" : "cursor_hello_probe_unexpected_output",
          level: hasHello ? "info" : "warn",
          message: hasHello
            ? "Cursor hello probe succeeded."
            : "Cursor probe ran but did not return `hello` as expected.",
          ...(summary ? { detail: summary.replace(/\s+/g, " ").trim().slice(0, 240) } : {}),
        });
      } else if (CURSOR_AUTH_REQUIRED_RE.test(authEvidence)) {
        checks.push({
          code: "cursor_hello_probe_auth_required",
          level: "warn",
          message: "Cursor CLI is installed, but authentication is not ready.",
          ...(detail ? { detail } : {}),
          hint: "Run `agent login` or configure CURSOR_API_KEY, then retry the probe.",
        });
      } else {
        checks.push({
          code: "cursor_hello_probe_failed",
          level: "error",
          message: "Cursor hello probe failed.",
          ...(detail ? { detail } : {}),
          hint: "Run the same command manually in this working directory to debug.",
        });
      }
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}

export async function execute(ctx: CursorExecuteContext): Promise<CursorExecuteResult> {
  const command = asString(ctx.config.command, "agent");
  const cwd = asString(ctx.config.cwd, process.cwd());
  const isCodex = commandLooksLike(command, "codex");
  const model = asString(
    ctx.config.model,
    isCodex ? DEFAULT_CODEX_LOCAL_MODEL : DEFAULT_CURSOR_LOCAL_MODEL,
  ).trim();
  const mode = asString(ctx.config.mode, "ask").trim() || "ask";
  const prompt = asString(ctx.config.promptTemplate, "").trim();
  const env = resolveEnv(ctx.config);
  const runtimeEnv = ensurePathInEnv({ ...process.env, ...env });

  await ensureAbsoluteDirectory(cwd, { createIfMissing: true });
  await ensureCommandResolvable(command, cwd, runtimeEnv);

  const extraArgs = resolveExtraArgs(ctx.config);
  const args = isCodex
    ? (() => {
        const nextArgs = ["exec", "--json", "--skip-git-repo-check"];
        if (!hasCodexReasoningOverride(extraArgs)) {
          nextArgs.push("-c", `model_reasoning_effort="${DEFAULT_CODEX_REASONING_EFFORT}"`);
        }
        if (model) nextArgs.push("--model", model);
        if (extraArgs.length > 0) nextArgs.push(...extraArgs);
        nextArgs.push("-");
        return nextArgs;
      })()
    : (() => {
        const autoTrustEnabled = !hasCursorTrustBypassArg(extraArgs);
        const nextArgs = ["-p", "--output-format", "stream-json", "--workspace", cwd];
        if (model) nextArgs.push("--model", model);
        if (mode) nextArgs.push("--mode", mode);
        if (autoTrustEnabled) nextArgs.push("--yolo");
        if (extraArgs.length > 0) nextArgs.push(...extraArgs);
        return nextArgs;
      })();

  const proc = await runChildProcess(ctx.runId, command, args, {
    cwd,
    env,
    timeoutSec: asNumber(ctx.config.timeoutSec, 180),
    graceSec: asNumber(ctx.config.graceSec, 10),
    signal: ctx.signal,
    stdin: prompt,
    onLog: ctx.onLog,
  });
  const parsed = isCodex ? parseCodexJsonl(proc.stdout) : parseCursorJsonl(proc.stdout);
  const parsedError = typeof parsed.errorMessage === "string" ? parsed.errorMessage.trim() : "";
  const stderrLine = firstNonEmptyLine(proc.stderr);
  const fallbackErrorMessage =
    parsedError ||
    stderrLine ||
    firstNonEmptyLine(proc.stdout) ||
    `${isCodex ? "Codex" : "Cursor"} exited with code ${proc.exitCode ?? -1}`;

  return {
    exitCode: proc.exitCode,
    signal: proc.signal,
    timedOut: proc.timedOut,
    errorMessage:
      proc.timedOut || (proc.exitCode ?? 0) !== 0
        ? proc.timedOut
          ? `Timed out after ${asNumber(ctx.config.timeoutSec, 180)}s`
          : fallbackErrorMessage
        : null,
    model: model || null,
    resultJson: {
      stdout: proc.stdout,
      stderr: proc.stderr,
    },
    summary: parsed.summary || null,
  };
}
