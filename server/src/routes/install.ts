import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { logger } from "../middleware/logger.js";
import { validate } from "../middleware/validate.js";
import {
  installOnboardRequestSchema,
  type InstallOnboardRequest,
} from "../lib/install/schemas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");
const INSTALL_SCRIPT_PATH = path.join(REPO_ROOT, "scripts", "studio-install.mjs");

function runInstallDoctorJson() {
  return new Promise<unknown>((resolve, reject) => {
    execFile(
      process.execPath,
      [INSTALL_SCRIPT_PATH, "doctor", "--json"],
      {
        cwd: REPO_ROOT,
        env: process.env,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              stderr.trim() || error.message || "Studio install doctor failed.",
            ),
          );
          return;
        }

        try {
          resolve(JSON.parse(stdout));
        } catch (parseError) {
          reject(
            parseError instanceof Error
              ? parseError
              : new Error("Failed to parse Studio install doctor response."),
          );
        }
      },
    );
  });
}

export function installRoutes() {
  const router = Router();

  router.get("/install/status", async (_req, res, next) => {
    try {
      const status = await runInstallDoctorJson();
      res.json(status);
    } catch (error) {
      next(error);
    }
  });

  router.post("/install/onboard/stream", validate(installOnboardRequestSchema), (req, res) => {
    const payload = req.body as InstallOnboardRequest;
    const args = [
      INSTALL_SCRIPT_PATH,
      "onboard",
      "--json-lines",
      `--agent=${payload.agentId ?? "codex"}`,
      `--install-skill=${payload.installSkill ?? true ? "true" : "false"}`,
      `--install-dependencies=${payload.installDependencies ?? true ? "true" : "false"}`,
      `--start-dev-hint=${payload.startDevHint ?? true ? "true" : "false"}`,
    ];

    const childProcess = spawn(process.execPath, args, {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    logger.info(
      {
        agentId: payload.agentId ?? "codex",
        installSkill: payload.installSkill ?? true,
        installDependencies: payload.installDependencies ?? true,
      },
      "studio install onboarding started",
    );

    req.on("aborted", () => {
      childProcess.kill("SIGTERM");
    });
    res.on("close", () => {
      if (!res.writableEnded) {
        childProcess.kill("SIGTERM");
      }
    });

    res.status(200);
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    childProcess.stdout.on("data", (chunk: Buffer | string) => {
      if (!res.writableEnded) {
        res.write(chunk);
      }
    });

    let stderr = "";
    childProcess.stderr.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });

    childProcess.on("error", (error: Error) => {
      logger.error({ err: error }, "studio install onboarding process errored");
      if (!res.writableEnded) {
        res.write(`${JSON.stringify({ type: "error", message: error.message })}\n`);
        res.end();
      }
    });

    childProcess.on("close", (code: number | null) => {
      if (code && code !== 0 && stderr.trim() && !res.writableEnded) {
        res.write(`${JSON.stringify({ type: "error", message: stderr.trim() })}\n`);
      }
      if (!res.writableEnded) {
        res.end();
      }
      logger.info(
        {
          exitCode: code,
        },
        "studio install onboarding finished",
      );
    });
  });

  return router;
}
