import { randomUUID } from "node:crypto";
import { Router } from "express";
import { logger } from "../middleware/logger.js";
import { validate } from "../middleware/validate.js";
import {
  createStudioBridgeLaunchRequestSchema,
  generateStudioReportRequestSchema,
  reviseStudioReportRequestSchema,
  type CreateStudioBridgeLaunchRequest,
  type GenerateStudioReportRequest,
  type ReviseStudioReportRequest,
} from "../lib/studio-engine/schemas.js";
import {
  createStudioBridgeLaunch,
  consumeStudioBridgeLaunch,
} from "../lib/studio-engine/bridge-launch.js";
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
import { createStudioRunSessionRecorder } from "../lib/studio-engine/run-session.js";
import { compactBriefForGeneration } from "../lib/studio-engine/brief.js";
import {
  loadStudio3dHeroSkill,
  loadStudioAnalysisSkill,
  loadStudioLayoutRepairSkill,
} from "../lib/studio-engine/skills.js";

function normalizeGenerateRequestPageCount(
  payload: GenerateStudioReportRequest,
): GenerateStudioReportRequest {
  if (payload.pageCount !== undefined || !payload.exportContract?.pages.length) {
    return payload;
  }
  return {
    ...payload,
    pageCount: payload.exportContract.pages.length,
  };
}

export function studioRoutes() {
  loadStudioAnalysisSkill();
  loadStudioLayoutRepairSkill();
  loadStudio3dHeroSkill();
  const router = Router();

  router.post("/studio/bridge/launch", validate(createStudioBridgeLaunchRequestSchema), (req, res) => {
    const payload = req.body as CreateStudioBridgeLaunchRequest;
    const launch = createStudioBridgeLaunch(payload);

    logger.info(
      {
        launchId: launch.launchId,
        mode: payload.mode ?? "inject-and-generate",
        generationMode: payload.generationMode ?? "standard",
        requestedPageCount: payload.requestedPageCount ?? null,
      },
      "studio bridge launch created",
    );

    res.json(launch);
  });

  router.get("/studio/bridge/launch/:launchId", (req, res) => {
    const launchId = typeof req.params.launchId === "string" ? req.params.launchId.trim() : "";
    if (!launchId) {
      res.status(404).json({
        error: "Studio launch link was not found or has already expired.",
      });
      return;
    }

    const payload = consumeStudioBridgeLaunch(launchId);
    if (!payload) {
      res.status(404).json({
        error: "Studio launch link was not found or has already expired.",
      });
      return;
    }

    logger.info(
      {
        launchId,
        mode: payload.mode,
      },
      "studio bridge launch consumed",
    );

    res.json(payload);
  });

  router.post("/studio/generate-html", validate(generateStudioReportRequestSchema), async (req, res) => {
    const payload = normalizeGenerateRequestPageCount(req.body as GenerateStudioReportRequest);
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
    const runSession = createStudioRunSessionRecorder({
      kind: "generate",
      runId,
      payload: preparedPayload,
      agentConfig,
    });

    try {
      logger.info(
        {
          briefLength: payload.brief.length,
          effectiveBriefLength: preparedPayload.brief.length,
          briefCompacted: compactedBrief.compacted,
          pageCount: payload.pageCount,
          generationMode: payload.generationMode,
          attachmentCount: preparedPayload.attachments.length,
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
        runSession.finishFailed(reason);
        return;
      }

      const result = await runStudioGeneration({
        payload: preparedPayload,
        agentConfig,
        runId,
        onStageTrace: async (entry) => {
          runSession.recordStageTrace(entry);
        },
      });
      runSession.finishSucceeded({
        model: result.model ?? agentConfig.model,
        enginePath: result.enginePath,
        title: result.report.title,
        pageCount: result.report.pageCount,
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
      runSession.finishFailed(reason);
      res.json({
        provider: "error",
        model: null,
        reason,
      });
    }
  });

  router.post("/studio/generate-html/stream", validate(generateStudioReportRequestSchema), async (req, res) => {
    const payload = normalizeGenerateRequestPageCount(req.body as GenerateStudioReportRequest);
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
    const runSession = createStudioRunSessionRecorder({
      kind: "generate",
      runId,
      payload: preparedPayload,
      agentConfig,
    });
    const emitWithRunSession = async (event: Parameters<typeof emit>[0]) => {
      runSession.recordStreamEvent(event);
      await emit(event);
    };

    try {
      logger.info(
        {
          briefLength: payload.brief.length,
          effectiveBriefLength: preparedPayload.brief.length,
          briefCompacted: compactedBrief.compacted,
          pageCount: payload.pageCount,
          generationMode: payload.generationMode,
          attachmentCount: preparedPayload.attachments.length,
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
        await emitWithRunSession({
          type: "error",
          runId,
          reason,
        });
        runSession.finishFailed(reason);
        res.end();
        return;
      }

      await runStudioGeneration({
        payload: preparedPayload,
        agentConfig,
        runId,
        signal: abortController.signal,
        emit: emitWithRunSession,
        onStageTrace: async (entry) => {
          runSession.recordStageTrace(entry);
        },
      });
      runSession.finishSucceeded();

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
        await emitWithRunSession({
          type: "error",
          runId,
          reason,
        });
        res.end();
      }
      runSession.finishFailed(reason);
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
    const runSession = createStudioRunSessionRecorder({
      kind: "revise",
      runId,
      payload: preparedPayload,
      agentConfig,
    });
    const emitWithRunSession = async (event: Parameters<typeof emit>[0]) => {
      runSession.recordStreamEvent(event);
      await emit(event);
    };

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
        await emitWithRunSession({
          type: "error",
          runId,
          reason,
        });
        runSession.finishFailed(reason);
        res.end();
        return;
      }

      await runStudioRevision({
        payload: preparedPayload,
        agentConfig,
        runId,
        signal: abortController.signal,
        emit: emitWithRunSession,
        onStageTrace: async (entry) => {
          runSession.recordStageTrace(entry);
        },
      });
      runSession.finishSucceeded();

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
        await emitWithRunSession({
          type: "error",
          runId,
          reason,
        });
        res.end();
      }
      runSession.finishFailed(reason);
    }
  });

  return router;
}
