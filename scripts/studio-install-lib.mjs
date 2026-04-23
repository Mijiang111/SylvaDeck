import { execFile, spawn } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const REPO_ROOT = path.resolve(__dirname, "..");
export const REPO_SKILL_PATH = path.join(REPO_ROOT, "skills", "ppt-workbench-studio");
export const GITHUB_SKILL_URL =
  "https://github.com/Mijiang111/claw-design/tree/main/skills/ppt-workbench-studio";

const CODEX_SKILL_TARGET = path.join(os.homedir(), ".codex", "skills", "ppt-workbench-studio");
const CODEX_AUTH_PATH = path.join(os.homedir(), ".codex", "auth.json");
const DEFAULT_COMMAND_TIMEOUT_MS = 7_000;

function trimOutput(value) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function pathExists(targetPath) {
  return existsSync(targetPath);
}

function uniqueBackupPath(targetPath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${targetPath}.backup-${stamp}`;
}

function splitLines(buffer, incoming) {
  const next = `${buffer}${incoming}`;
  const parts = next.split(/\r?\n/);
  return {
    lines: parts.slice(0, -1),
    remainder: parts[parts.length - 1] ?? "",
  };
}

export function formatInstallEvent(event) {
  if (event.type === "log") {
    return `${event.level.toUpperCase()} ${event.step}: ${event.message}`;
  }
  if (event.type === "complete") {
    return "Onboarding completed.";
  }
  if (event.type === "error") {
    return `ERROR: ${event.message}`;
  }
  if (event.type === "status") {
    return "Environment status refreshed.";
  }
  return "Install event received.";
}

function defaultEmit(event) {
  if (event.type === "status") {
    return;
  }
  const line = formatInstallEvent(event);
  const sink = event.type === "error" ? console.error : console.log;
  sink(line);
}

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd ?? REPO_ROOT,
        env: options.env ?? process.env,
        timeout: options.timeout ?? DEFAULT_COMMAND_TIMEOUT_MS,
        encoding: "utf8",
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: trimOutput(stdout),
          stderr: trimOutput(stderr),
          error,
        });
      },
    );
  });
}

async function probeCommand(command, args) {
  const result = await execFileAsync(command, args);
  return {
    ok: result.ok,
    output: result.stdout || result.stderr || "",
  };
}

async function detectCodexAuthReady() {
  if (trimOutput(process.env.OPENAI_API_KEY).length > 0) {
    return true;
  }
  if (!pathExists(CODEX_AUTH_PATH)) {
    return false;
  }
  try {
    const raw = trimOutput(await fs.readFile(CODEX_AUTH_PATH, "utf8"));
    if (!raw) {
      return false;
    }
    const parsed = JSON.parse(raw);
    return Boolean(parsed && typeof parsed === "object" && Object.keys(parsed).length > 0);
  } catch {
    return false;
  }
}

async function resolveSkillInstallState(targetPath, sourcePath) {
  if (!pathExists(targetPath)) {
    return {
      installed: false,
      targetPath,
      sourcePath,
      method: null,
      managed: false,
    };
  }

  const skillFile = path.join(targetPath, "SKILL.md");
  if (!pathExists(skillFile)) {
    return {
      installed: false,
      targetPath,
      sourcePath,
      method: null,
      managed: false,
    };
  }

  try {
    const stats = lstatSync(targetPath);
    if (stats.isSymbolicLink()) {
      const resolved = await fs.realpath(targetPath);
      const sourceResolved = await fs.realpath(sourcePath).catch(() => sourcePath);
      return {
        installed: true,
        targetPath,
        sourcePath,
        method: "symlink",
        managed: resolved === sourceResolved,
      };
    }
  } catch {
    // Fall through to plain directory install detection.
  }

  return {
    installed: true,
    targetPath,
    sourcePath,
    method: "copy",
    managed: false,
  };
}

function buildAgentStatus({
  id,
  label,
  visible = true,
  supported = false,
  detected = false,
  authReady = false,
  skillInstalled = false,
  installMode = "manual",
  targetPath = null,
  notes = [],
}) {
  let status = "manual-soon";
  if (supported) {
    if (!detected) {
      status = "missing-command";
    } else if (!authReady) {
      status = "missing-auth";
    } else if (!skillInstalled) {
      status = "missing-skill";
    } else {
      status = "ready";
    }
  } else if (detected) {
    status = "manual-setup";
  }

  return {
    id,
    label,
    visible,
    supported,
    detected,
    authReady,
    skillInstalled,
    status,
    installMode,
    targetPath,
    notes,
  };
}

function hasWorkspaceDependencies() {
  return pathExists(path.join(REPO_ROOT, "node_modules"));
}

export async function getInstallStatus() {
  const [nodeProbe, pnpmProbe, codexProbe, claudeProbe, cursorProbe, codexAuth, codexSkill] =
    await Promise.all([
      probeCommand("node", ["--version"]),
      probeCommand("corepack", ["pnpm", "--version"]),
      probeCommand("codex", ["--version"]),
      probeCommand("claude", ["--version"]),
      probeCommand("cursor", ["--version"]),
      detectCodexAuthReady(),
      resolveSkillInstallState(CODEX_SKILL_TARGET, REPO_SKILL_PATH),
    ]);

  return {
    serverHealthy: true,
    repoPath: REPO_ROOT,
    platform: process.platform,
    nodeReady: nodeProbe.ok,
    pnpmReady: pnpmProbe.ok,
    nodeVersion: nodeProbe.output || null,
    pnpmVersion: pnpmProbe.output || null,
    recommendedAgentId: "codex",
    skillSourcePath: REPO_SKILL_PATH,
    skillGithubUrl: GITHUB_SKILL_URL,
    bootstrapCommands: {
      onboard: "pnpm studio:onboard",
      doctor: "pnpm studio:doctor",
      dev: "pnpm dev",
    },
    agents: [
      buildAgentStatus({
        id: "codex",
        label: "Codex",
        supported: true,
        detected: codexProbe.ok,
        authReady: codexAuth,
        skillInstalled: codexSkill.installed,
        installMode: "one-click",
        targetPath: CODEX_SKILL_TARGET,
        notes: [
          codexProbe.output ? `CLI: ${codexProbe.output}` : "Codex CLI not detected yet.",
          codexSkill.installed
            ? codexSkill.method === "symlink"
              ? "Skill is linked into the global Codex skills directory."
              : "Skill is present in the global Codex skills directory."
            : "Skill has not been installed into the global Codex skills directory.",
        ],
      }),
      buildAgentStatus({
        id: "claude-code",
        label: "Claude Code",
        detected: claudeProbe.ok,
        supported: false,
        installMode: "manual",
        targetPath: null,
        notes: ["Visible in V1, but manual setup is still coming soon."],
      }),
      buildAgentStatus({
        id: "cursor",
        label: "Cursor",
        detected: cursorProbe.ok,
        supported: false,
        installMode: "manual",
        targetPath: null,
        notes: ["Visible in V1, but manual setup is still coming soon."],
      }),
    ],
  };
}

async function ensureCodexSkillInstalled() {
  await fs.mkdir(path.dirname(CODEX_SKILL_TARGET), { recursive: true });

  const existing = await resolveSkillInstallState(CODEX_SKILL_TARGET, REPO_SKILL_PATH);
  if (existing.installed && existing.method === "symlink" && existing.managed) {
    return {
      method: "symlink",
      backupPath: null,
      changed: false,
    };
  }

  let backupPath = null;
  if (pathExists(CODEX_SKILL_TARGET)) {
    backupPath = uniqueBackupPath(CODEX_SKILL_TARGET);
    await fs.rename(CODEX_SKILL_TARGET, backupPath);
  }

  try {
    await fs.symlink(REPO_SKILL_PATH, CODEX_SKILL_TARGET, "dir");
    return {
      method: "symlink",
      backupPath,
      changed: true,
    };
  } catch (symlinkError) {
    try {
      await fs.cp(REPO_SKILL_PATH, CODEX_SKILL_TARGET, {
        recursive: true,
        force: true,
      });
      return {
        method: "copy",
        backupPath,
        changed: true,
        symlinkError,
      };
    } catch (copyError) {
      await fs.rm(CODEX_SKILL_TARGET, { recursive: true, force: true }).catch(() => {});
      if (backupPath && pathExists(backupPath)) {
        await fs.rename(backupPath, CODEX_SKILL_TARGET).catch(() => {});
      }
      throw copyError ?? symlinkError;
    }
  }
}

async function runCommandStreaming(command, args, emit, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? REPO_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdoutRemainder = "";
    let stderrRemainder = "";

    child.stdout.on("data", (chunk) => {
      const next = splitLines(stdoutRemainder, String(chunk));
      stdoutRemainder = next.remainder;
      for (const line of next.lines) {
        const message = trimOutput(line);
        if (message) {
          emit({
            type: "log",
            level: "info",
            step: options.step ?? "command",
            message,
          });
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      const next = splitLines(stderrRemainder, String(chunk));
      stderrRemainder = next.remainder;
      for (const line of next.lines) {
        const message = trimOutput(line);
        if (message) {
          emit({
            type: "log",
            level: "warn",
            step: options.step ?? "command",
            message,
          });
        }
      }
    });

    child.on("error", reject);
    child.on("close", (code) => {
      const finalStdout = trimOutput(stdoutRemainder);
      const finalStderr = trimOutput(stderrRemainder);
      if (finalStdout) {
        emit({
          type: "log",
          level: "info",
          step: options.step ?? "command",
          message: finalStdout,
        });
      }
      if (finalStderr) {
        emit({
          type: "log",
          level: "warn",
          step: options.step ?? "command",
          message: finalStderr,
        });
      }
      if (code === 0) {
        resolve(undefined);
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}.`));
    });
  });
}

export async function runOnboard(options = {}, emit = defaultEmit) {
  const normalized = {
    agentId: options.agentId ?? "codex",
    installSkill: options.installSkill ?? true,
    installDependencies: options.installDependencies ?? true,
    startDevHint: options.startDevHint ?? true,
  };

  emit({
    type: "log",
    level: "info",
    step: "preflight",
    message: "Checking local environment.",
  });

  const initialStatus = await getInstallStatus();
  emit({
    type: "status",
    status: jsonClone(initialStatus),
  });

  if (normalized.agentId !== "codex") {
    throw new Error("V1 onboarding only supports Codex for one-click setup.");
  }

  const codexStatus = initialStatus.agents.find((agent) => agent.id === "codex");
  if (!initialStatus.nodeReady) {
    throw new Error("Node.js 20+ is required before Studio onboarding can continue.");
  }
  if (!initialStatus.pnpmReady) {
    throw new Error("pnpm 9+ must be available through corepack before onboarding can continue.");
  }
  if (!codexStatus?.detected) {
    throw new Error("Codex CLI is not installed or is not on PATH.");
  }
  if (!codexStatus.authReady) {
    throw new Error("Codex authentication was not detected. Run codex login or set OPENAI_API_KEY first.");
  }
  if (!pathExists(REPO_SKILL_PATH)) {
    throw new Error(`Repo skill not found at ${REPO_SKILL_PATH}.`);
  }

  if (normalized.installDependencies) {
    if (hasWorkspaceDependencies()) {
      emit({
        type: "log",
        level: "info",
        step: "dependencies",
        message: "Workspace dependencies are already present. Skipping pnpm install.",
      });
    } else {
      emit({
        type: "log",
        level: "info",
        step: "dependencies",
        message: "Installing workspace dependencies with pnpm.",
      });
      await runCommandStreaming(
        "corepack",
        ["pnpm", "install"],
        emit,
        { step: "dependencies" },
      );
      emit({
        type: "log",
        level: "success",
        step: "dependencies",
        message: "Workspace dependencies installed.",
      });
    }
  }

  if (normalized.installSkill) {
    emit({
      type: "log",
      level: "info",
      step: "skill",
      message: "Installing the PPT Workbench Studio skill into Codex.",
    });
    const result = await ensureCodexSkillInstalled();
    emit({
      type: "log",
      level: "success",
      step: "skill",
      message:
        result.changed
          ? result.method === "symlink"
            ? "Codex skill linked from the repo into ~/.codex/skills."
            : "Codex skill copied into ~/.codex/skills after symlink fallback."
          : "Codex skill is already linked from the repo.",
    });
    if (result.backupPath) {
      emit({
        type: "log",
        level: "info",
        step: "skill",
        message: `Previous Codex skill was backed up to ${result.backupPath}.`,
      });
    }
  }

  if (normalized.startDevHint) {
    emit({
      type: "log",
      level: "info",
      step: "next-step",
      message: "Next step: run pnpm dev to start the Studio server and UI together.",
    });
  }

  const finalStatus = await getInstallStatus();
  emit({
    type: "complete",
    status: jsonClone(finalStatus),
  });

  return finalStatus;
}

export function formatDoctorSummary(status) {
  const lines = [
    "Studio install doctor",
    `Repo: ${status.repoPath}`,
    `Platform: ${status.platform}`,
    `Node: ${status.nodeReady ? status.nodeVersion ?? "ready" : "missing"}`,
    `pnpm: ${status.pnpmReady ? status.pnpmVersion ?? "ready" : "missing"}`,
    "",
  ];

  for (const agent of status.agents) {
    lines.push(`${agent.label}: ${agent.status}`);
    lines.push(`  detected: ${agent.detected ? "yes" : "no"}`);
    lines.push(`  auth: ${agent.authReady ? "yes" : "no"}`);
    lines.push(`  skill: ${agent.skillInstalled ? "yes" : "no"}`);
    lines.push(
      `  install: ${agent.installMode}${agent.targetPath ? ` (${agent.targetPath})` : ""}`,
    );
    for (const note of agent.notes ?? []) {
      lines.push(`  note: ${note}`);
    }
    lines.push("");
  }

  lines.push(`Skill source: ${status.skillSourcePath}`);
  lines.push(`GitHub skill URL: ${status.skillGithubUrl}`);
  lines.push(`Bootstrap: ${status.bootstrapCommands.onboard}`);
  lines.push(`Doctor: ${status.bootstrapCommands.doctor}`);
  lines.push(`Run Studio: ${status.bootstrapCommands.dev}`);

  return lines.join("\n");
}
