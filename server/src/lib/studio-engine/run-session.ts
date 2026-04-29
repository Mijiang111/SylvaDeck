import fs from "node:fs";
import path from "node:path";
import type { StudioAgentConfig } from "./agent.js";
import type {
  StudioGenerateStreamEvent,
  StudioStageTraceEntry,
} from "./contracts.js";
import type {
  GenerateStudioReportRequest,
  ReviseStudioReportRequest,
} from "./schemas.js";

export type StudioRunSessionKind = "generate" | "revise";
export type StudioRunSessionStatus = "running" | "succeeded" | "failed";

type StudioRunSessionEventSummary =
  | {
      type: "run_started";
      runId: string;
      capturedAt: string;
    }
  | {
      type: "stage_started";
      runId: string;
      capturedAt: string;
      stage: string;
      label: string;
      expectedPageCount?: number;
      pageNumber?: number;
      pageTitles?: string[];
    }
  | {
      type: "assistant_chunk";
      runId: string;
      capturedAt: string;
      stage: string;
      contentPreview: string;
      contentLength: number;
    }
  | {
      type: "page_started";
      runId: string;
      capturedAt: string;
      pageNumber: number;
      pageTitle: string;
    }
  | {
      type: "page_ready";
      runId: string;
      capturedAt: string;
      pageNumber: number;
      pageTitle: string;
      pageHtmlLength: number;
    }
  | {
      type: "final_report";
      runId: string;
      capturedAt: string;
      model: string | null;
      title: string;
      pageCount: number;
      pageTitles: string[];
      htmlLength: number;
      htmlOutputMode?: string;
    }
  | {
      type: "error";
      runId: string;
      capturedAt: string;
      reason: string;
    };

export type StudioRunPageSnapshot = {
  pageNumber: number;
  pageTitle: string;
  pageHtml: string;
  capturedAt: string;
};

export type StudioRunFinalReportSnapshot = Extract<
  StudioGenerateStreamEvent,
  { type: "final_report" }
>["report"];

export type StudioRunSessionRecord = {
  version: 1;
  runId: string;
  kind: StudioRunSessionKind;
  status: StudioRunSessionStatus;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  payloadSummary: Record<string, unknown>;
  agent: {
    provider: StudioAgentConfig["provider"];
    command: string;
    model: string;
    cwd: string;
    hasApiKey: boolean;
    baseUrl: string;
  };
  events: StudioRunSessionEventSummary[];
  stageTraces: StudioStageTraceEntry[];
  pageSnapshots: StudioRunPageSnapshot[];
  finalReport: StudioRunFinalReportSnapshot | null;
  result: Record<string, unknown> | null;
  error: {
    reason: string;
    capturedAt: string;
  } | null;
};

export type StudioRunSessionRecoverySnapshot = {
  path: string;
  latestPath: string | null;
  runId: string;
  kind: StudioRunSessionKind;
  status: StudioRunSessionStatus;
  updatedAt: string;
  finalReport: StudioRunFinalReportSnapshot | null;
  pageSnapshots: StudioRunPageSnapshot[];
  stageTraces: StudioStageTraceEntry[];
  result: Record<string, unknown> | null;
  error: StudioRunSessionRecord["error"];
};

function getStudioRunSessionDirectory() {
  const override = process.env.PPT_STUDIO_RUN_SESSION_DIR?.trim();
  return override || path.resolve(process.cwd(), "..", ".logs", "studio-runs");
}

function sanitizeRunId(runId: string) {
  return runId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "studio-run";
}

function sessionFilenameForRunId(runId: string) {
  return `${sanitizeRunId(runId)}.json`;
}

function compactPreview(value: string, limit = 360) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 3).trimEnd()}...`;
}

function summarizePayload(
  kind: StudioRunSessionKind,
  payload: GenerateStudioReportRequest | ReviseStudioReportRequest,
) {
  if (kind === "revise") {
    const revisePayload = payload as ReviseStudioReportRequest;
    return {
      briefLength: revisePayload.brief.length,
      reportTitle: revisePayload.report.title,
      reportPageCount: revisePayload.report.pageCount,
      reportHtmlLength: revisePayload.report.html.length,
      measuredPages: revisePayload.pageMeasurements.length,
      repairMode: revisePayload.repairMode,
      generationMode: revisePayload.generationMode ?? null,
      moduleUsageMode: revisePayload.moduleUsageMode,
      requestedPageCount: revisePayload.requestedPageCount,
      publishedModuleCount: revisePayload.publishedModules.length,
    };
  }

  const generatePayload = payload as GenerateStudioReportRequest;
  return {
    briefLength: generatePayload.brief.length,
    pageCount: generatePayload.pageCount ?? null,
    generationMode: generatePayload.generationMode,
    moduleUsageMode: generatePayload.moduleUsageMode,
    htmlOutputMode: generatePayload.htmlOutputMode,
    attachmentCount: generatePayload.attachments.length,
    publishedModuleCount: generatePayload.publishedModules.length,
  };
}

function summarizeAgentConfig(agentConfig: StudioAgentConfig) {
  return {
    provider: agentConfig.provider,
    command: agentConfig.command,
    model: agentConfig.model,
    cwd: agentConfig.cwd,
    hasApiKey: agentConfig.apiKey.trim().length > 0,
    baseUrl: agentConfig.baseUrl,
  };
}

function toRecoverySnapshot(args: {
  path: string;
  latestPath: string | null;
  record: StudioRunSessionRecord;
}): StudioRunSessionRecoverySnapshot {
  return {
    path: args.path,
    latestPath: args.latestPath,
    runId: args.record.runId,
    kind: args.record.kind,
    status: args.record.status,
    updatedAt: args.record.updatedAt,
    finalReport: args.record.finalReport,
    pageSnapshots: args.record.pageSnapshots,
    stageTraces: args.record.stageTraces,
    result: args.record.result,
    error: args.record.error,
  };
}

export function readStudioRunSessionRecord(recordPath: string) {
  if (!fs.existsSync(recordPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(recordPath, "utf8")) as StudioRunSessionRecord;
}

export function recoverLatestStudioRunSession(args: {
  kind: StudioRunSessionKind;
}): StudioRunSessionRecoverySnapshot | null {
  const directory = getStudioRunSessionDirectory();
  const latestPath = path.join(directory, `latest-${args.kind}.json`);
  const latestRecord = readStudioRunSessionRecord(latestPath);
  if (!latestRecord) {
    return null;
  }
  const sessionPath = path.join(directory, sessionFilenameForRunId(latestRecord.runId));

  return toRecoverySnapshot({
    path: fs.existsSync(sessionPath) ? sessionPath : latestPath,
    latestPath,
    record: latestRecord,
  });
}

function summarizeStreamEvent(event: StudioGenerateStreamEvent): StudioRunSessionEventSummary {
  const capturedAt = new Date().toISOString();
  if (event.type === "assistant_chunk") {
    return {
      type: event.type,
      runId: event.runId,
      capturedAt,
      stage: event.stage,
      contentPreview: compactPreview(event.content),
      contentLength: event.content.length,
    };
  }
  if (event.type === "page_ready") {
    return {
      type: event.type,
      runId: event.runId,
      capturedAt,
      pageNumber: event.pageNumber,
      pageTitle: event.pageTitle,
      pageHtmlLength: event.pageHtml.length,
    };
  }
  if (event.type === "final_report") {
    return {
      type: event.type,
      runId: event.runId,
      capturedAt,
      model: event.model,
      title: event.report.title,
      pageCount: event.report.pageCount,
      pageTitles: event.report.pageTitles,
      htmlLength: event.report.html.length,
      htmlOutputMode: event.report.htmlOutputMode,
    };
  }
  if (event.type === "stage_started") {
    return {
      type: event.type,
      runId: event.runId,
      capturedAt,
      stage: event.stage,
      label: event.label,
      expectedPageCount: event.expectedPageCount,
      pageNumber: event.pageNumber,
      pageTitles: event.pageTitles,
    };
  }
  if (event.type === "page_started") {
    return {
      type: event.type,
      runId: event.runId,
      capturedAt,
      pageNumber: event.pageNumber,
      pageTitle: event.pageTitle,
    };
  }
  if (event.type === "error") {
    return {
      type: event.type,
      runId: event.runId,
      capturedAt,
      reason: event.reason,
    };
  }
  return {
    type: event.type,
    runId: event.runId,
    capturedAt,
  };
}

export function createStudioRunSessionRecorder(args: {
  kind: StudioRunSessionKind;
  runId: string;
  payload: GenerateStudioReportRequest | ReviseStudioReportRequest;
  agentConfig: StudioAgentConfig;
}) {
  const directory = getStudioRunSessionDirectory();
  fs.mkdirSync(directory, { recursive: true });

  const filename = sessionFilenameForRunId(args.runId);
  const absolutePath = path.join(directory, filename);
  const latestPath = path.join(directory, `latest-${args.kind}.json`);
  const now = new Date().toISOString();
  const record: StudioRunSessionRecord = {
    version: 1,
    runId: args.runId,
    kind: args.kind,
    status: "running",
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
    payloadSummary: summarizePayload(args.kind, args.payload),
    agent: summarizeAgentConfig(args.agentConfig),
    events: [],
    stageTraces: [],
    pageSnapshots: [],
    finalReport: null,
    result: null,
    error: null,
  };

  const flush = () => {
    record.updatedAt = new Date().toISOString();
    const serialized = `${JSON.stringify(record, null, 2)}\n`;
    const tmpPath = `${absolutePath}.tmp`;
    fs.writeFileSync(tmpPath, serialized, "utf8");
    fs.renameSync(tmpPath, absolutePath);
    fs.writeFileSync(latestPath, serialized, "utf8");
  };

  flush();

  return {
    path: absolutePath,
    latestPath,

    recordStreamEvent(event: StudioGenerateStreamEvent) {
      record.events.push(summarizeStreamEvent(event));
      if (event.type === "page_ready") {
        record.pageSnapshots = [
          ...record.pageSnapshots.filter((page) => page.pageNumber !== event.pageNumber),
          {
            pageNumber: event.pageNumber,
            pageTitle: event.pageTitle,
            pageHtml: event.pageHtml,
            capturedAt: new Date().toISOString(),
          },
        ].sort((left, right) => left.pageNumber - right.pageNumber);
      }
      if (event.type === "final_report") {
        record.finalReport = event.report;
        record.result = {
          model: event.model,
          title: event.report.title,
          pageCount: event.report.pageCount,
          pageTitles: event.report.pageTitles,
        };
      }
      if (event.type === "error") {
        record.error = {
          reason: event.reason,
          capturedAt: new Date().toISOString(),
        };
      }
      flush();
    },

    recordStageTrace(entry: StudioStageTraceEntry) {
      record.stageTraces.push(entry);
      flush();
    },

    finishSucceeded(result?: Record<string, unknown>) {
      record.status = "succeeded";
      record.finishedAt = new Date().toISOString();
      if (result) {
        record.result = {
          ...(record.result ?? {}),
          ...result,
        };
      }
      flush();
    },

    finishFailed(reason: string) {
      record.status = "failed";
      record.finishedAt = new Date().toISOString();
      record.error = {
        reason,
        capturedAt: new Date().toISOString(),
      };
      flush();
    },
  };
}
