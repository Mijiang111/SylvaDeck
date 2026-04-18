import { execFileSync, spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const projectPorts = [3101, 5174];
const cleanOnly = process.argv.includes("--clean-only");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(rootDir, ".env"));

function listPidsOnPort(port) {
  try {
    const output = execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    if (!output) {
      return [];
    }

    return output
      .split("\n")
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value));
  } catch {
    return [];
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function releasePort(port) {
  const initialPids = listPidsOnPort(port);
  if (initialPids.length === 0) {
    console.log(`[dev] port ${port} already free`);
    return;
  }

  console.log(`[dev] releasing port ${port}: ${initialPids.join(", ")}`);
  for (const pid of initialPids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      continue;
    }
  }

  await sleep(350);

  const remainingPids = listPidsOnPort(port);
  for (const pid of remainingPids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      continue;
    }
  }

  await sleep(150);
  const finalPids = listPidsOnPort(port);
  if (finalPids.length > 0) {
    throw new Error(`port ${port} is still busy: ${finalPids.join(", ")}`);
  }

  console.log(`[dev] port ${port} cleared`);
}

async function releaseProjectPorts() {
  for (const port of projectPorts) {
    await releasePort(port);
  }
}

function spawnProcess(name, args) {
  return spawn("corepack", ["pnpm", ...args], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  }).on("spawn", () => {
    console.log(`[dev] started ${name}`);
  });
}

async function main() {
  await releaseProjectPorts();

  if (cleanOnly) {
    return;
  }

  const children = [
    spawnProcess("server", ["--dir", "server", "dev"]),
    spawnProcess("ui", ["--dir", "ui", "dev"]),
  ];

  let shuttingDown = false;

  const shutdown = (signal = "SIGTERM") => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    for (const child of children) {
      if (!child.killed) {
        try {
          child.kill(signal);
        } catch {
          continue;
        }
      }
    }
  };

  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });

  for (const child of children) {
    child.on("exit", (code, signal) => {
      shutdown("SIGTERM");
      if (signal) {
        process.exitCode = 1;
        return;
      }
      process.exitCode = process.exitCode || code || 0;
    });
  }
}

main().catch((error) => {
  console.error(`[dev] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
