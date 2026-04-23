#!/usr/bin/env node
import {
  formatDoctorSummary,
  formatInstallEvent,
  getInstallStatus,
  runOnboard,
} from "./studio-install-lib.mjs";

function parseFlags(argv) {
  const flags = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      continue;
    }
    const withoutPrefix = arg.slice(2);
    const [key, rawValue] = withoutPrefix.split("=", 2);
    flags[key] = rawValue ?? true;
  }
  return flags;
}

function coerceBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  return fallback;
}

async function main() {
  const [, , command = "doctor", ...rest] = process.argv;
  const flags = parseFlags(rest);

  if (command === "doctor") {
    const status = await getInstallStatus();
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(status)}\n`);
      return;
    }
    process.stdout.write(`${formatDoctorSummary(status)}\n`);
    return;
  }

  if (command === "onboard") {
    const jsonLines = coerceBoolean(flags["json-lines"], false);
    const emit = (event) => {
      if (jsonLines) {
        process.stdout.write(`${JSON.stringify(event)}\n`);
        return;
      }
      if (event.type === "status") {
        return;
      }
      const sink = event.type === "error" ? process.stderr : process.stdout;
      sink.write(`${formatInstallEvent(event)}\n`);
    };

    try {
      await runOnboard(
        {
          agentId: typeof flags.agent === "string" ? flags.agent : "codex",
          installSkill: coerceBoolean(flags["install-skill"], true),
          installDependencies: coerceBoolean(flags["install-dependencies"], true),
          startDevHint: coerceBoolean(flags["start-dev-hint"], true),
        },
        emit,
      );
      return;
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Studio onboarding failed.";
      if (jsonLines) {
        process.stdout.write(`${JSON.stringify({ type: "error", message })}\n`);
      } else {
        process.stderr.write(`ERROR ${message}\n`);
      }
      process.exitCode = 1;
      return;
    }
  }

  process.stderr.write(`Unknown studio install command: ${command}\n`);
  process.exitCode = 1;
}

main().catch((error) => {
  const message =
    error instanceof Error && error.message.trim().length > 0
      ? error.message
      : "Studio install command failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
