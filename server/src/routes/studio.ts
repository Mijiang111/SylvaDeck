import { randomUUID } from "node:crypto";
import { Router } from "express";
import { logger } from "../middleware/logger.js";
import { validate } from "../middleware/validate.js";
import {
  generateStudioReportRequestSchema,
  reviseStudioReportRequestSchema,
  type GenerateStudioReportRequest,
  type ReviseStudioReportRequest,
} from "../lib/studio-engine/schemas.js";
import {
  createStreamWriter,
  getBlockingAgentChecks,
  resolveAgentConfig,
  testAgentConfig,
} from "../lib/studio-engine/agent.js";
import {
  isLongFormGenerationRequest,
  runStudioGeneration,
  runStudioRevision,
} from "../lib/studio-engine/core.js";
import { compactBriefForGeneration } from "../lib/studio-engine/brief.js";
import {
  loadStudio3dHeroSkill,
  loadStudioAnalysisSkill,
  loadStudioLayoutRepairSkill,
} from "../lib/studio-engine/skills.js";

export function studioRoutes() {
  loadStudioAnalysisSkill();
  loadStudioLayoutRepairSkill();
  loadStudio3dHeroSkill();
  const router = Router();

  router.post("/studio/generate-html", validate(generateStudioReportRequestSchema), async (req, res) => {
    const payload = req.body as GenerateStudioReportRequest;
    const compactedBrief = compactBriefForGeneration(
      payload.brief,
      isLongFormGenerationRequest(payload) ? 24_000 : 12_000,
    );
    const preparedPayload: GenerateStudioReportRequest = {
      ...payload,
      brief: compactedBrief.brief,
    };
    const agentConfig = resolveAgentConfig(payload.agentConfig);
    const runId = `studio-${randomUUID()}`;

    try {
      logger.info(
        {
          briefLength: payload.brief.length,
          effectiveBriefLength: preparedPayload.brief.length,
          briefCompacted: compactedBrief.compacted,
          pageCount: payload.pageCount,
          generationMode: payload.generationMode,
          command: agentConfig.command,
          model: agentConfig.model,
          runId,
        },
        "studio generate request started",
      );

      const environment = await testAgentConfig(agentConfig);
      const blockingErrors = getBlockingAgentChecks(environment);
      if (blockingErrors.length > 0) {
        const reason = blockingErrors.map((check) => check.message).join(" ");
        logger.warn(
          {
            command: agentConfig.command,
            cwd: agentConfig.cwd,
            reason,
          },
          "studio generate request unavailable",
        );
        res.json({
          provider: "unavailable",
          model: null,
          reason,
        });
        return;
      }

      const result = await runStudioGeneration({
        payload: preparedPayload,
        agentConfig,
        runId,
      });

      logger.info(
        {
          runId,
          pageCount: result.report.pageCount,
          command: agentConfig.command,
          model: result.model ?? agentConfig.model,
        },
        "studio generate request succeeded",
      );

      res.json({
        provider: "model",
        model: result.model ?? agentConfig.model,
        report: result.report,
      });
    } catch (error) {
      const reason =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Studio generation failed.";
      logger.error(
        {
          err: error,
          command: agentConfig.command,
          model: agentConfig.model,
          reason,
          runId,
        },
        "studio generate request errored",
      );
      res.json({
        provider: "error",
        model: null,
        reason,
      });
    }
  });

  router.post("/studio/generate-html/stream", validate(generateStudioReportRequestSchema), async (req, res) => {
    const payload = req.body as GenerateStudioReportRequest;
    const compactedBrief = compactBriefForGeneration(
      payload.brief,
      isLongFormGenerationRequest(payload) ? 24_000 : 12_000,
    );
    const preparedPayload: GenerateStudioReportRequest = {
      ...payload,
      brief: compactedBrief.brief,
    };
    const agentConfig = resolveAgentConfig(payload.agentConfig);
    const runId = `studio-${randomUUID()}`;
    const abortController = new AbortController();

    req.on("aborted", () => {
      abortController.abort();
    });
    res.on("close", () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    res.status(200);
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const emit = createStreamWriter(res);

    try {
      logger.info(
        {
          briefLength: payload.brief.length,
          effectiveBriefLength: preparedPayload.brief.length,
          briefCompacted: compactedBrief.compacted,
          pageCount: payload.pageCount,
          generationMode: payload.generationMode,
          command: agentConfig.command,
          model: agentConfig.model,
          runId,
        },
        "studio generate stream started",
      );

      const environment = await testAgentConfig(agentConfig);
      const blockingErrors = getBlockingAgentChecks(environment);
      if (blockingErrors.length > 0) {
        const reason = blockingErrors.map((check) => check.message).join(" ");
        await emit({
          type: "error",
          runId,
          reason,
        });
        res.end();
        return;
      }

      await runStudioGeneration({
        payload: preparedPayload,
        agentConfig,
        runId,
        signal: abortController.signal,
        emit,
      });

      res.end();
    } catch (error) {
      const reason =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Studio generation failed.";
      logger.error(
        {
          err: error,
          command: agentConfig.command,
          model: agentConfig.model,
          reason,
          runId,
        },
        "studio generate stream errored",
      );

      if (!res.writableEnded) {
        await emit({
          type: "error",
          runId,
          reason,
        });
        res.end();
      }
    }
  });

  router.post("/studio/revise-html/stream", validate(reviseStudioReportRequestSchema), async (req, res) => {
    const payload = req.body as ReviseStudioReportRequest;
    const compactedBrief = compactBriefForGeneration(payload.brief);
    const preparedPayload: ReviseStudioReportRequest = {
      ...payload,
      brief: compactedBrief.brief,
    };
    const agentConfig = resolveAgentConfig(payload.agentConfig);
    const runId = `studio-revise-${randomUUID()}`;
    const abortController = new AbortController();

    req.on("aborted", () => {
      abortController.abort();
    });
    res.on("close", () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    res.status(200);
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const emit = createStreamWriter(res);

    try {
      logger.info(
        {
          briefLength: payload.brief.length,
          effectiveBriefLength: preparedPayload.brief.length,
          briefCompacted: compactedBrief.compacted,
          pageCount: payload.report.pageCount,
          measuredPages: payload.pageMeasurements.length,
          command: agentConfig.command,
          model: agentConfig.model,
          runId,
        },
        "studio revise stream started",
      );

      const environment = await testAgentConfig(agentConfig);
      const blockingErrors = getBlockingAgentChecks(environment);
      if (blockingErrors.length > 0) {
        const reason = blockingErrors.map((check) => check.message).join(" ");
        await emit({
          type: "error",
          runId,
          reason,
        });
        res.end();
        return;
      }

      await runStudioRevision({
        payload: preparedPayload,
        agentConfig,
        runId,
        signal: abortController.signal,
        emit,
      });

      res.end();
    } catch (error) {
      const reason =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Studio revision failed.";
      logger.error(
        {
          err: error,
          command: agentConfig.command,
          model: agentConfig.model,
          reason,
          runId,
        },
        "studio revise stream errored",
      );

      if (!res.writableEnded) {
        await emit({
          type: "error",
          runId,
          reason,
        });
        res.end();
      }
    }
  });

  return router;
}
