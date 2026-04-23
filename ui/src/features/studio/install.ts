import { API_BASE, ApiError, api } from "@/api/client";

export type InstallAgentId = "codex" | "claude-code" | "cursor";

export const INSTALL_SKILL_REPO = "Mijiang111/claw-design";
export const INSTALL_SKILL_NAME = "ppt-workbench-studio";
export const INSTALL_SKILL_COMMAND = `npx --yes skills add ${INSTALL_SKILL_REPO} --skill ${INSTALL_SKILL_NAME} -g -y`;
export const MANUAL_ONBOARD_COMMAND = "pnpm studio:onboard";
export const MANUAL_RUN_COMMAND = "pnpm dev";
export const MANUAL_DOCTOR_COMMAND = "pnpm studio:doctor";

export type InstallAgentStatus = {
  id: InstallAgentId;
  label: string;
  visible: boolean;
  supported: boolean;
  detected: boolean;
  authReady: boolean;
  skillInstalled: boolean;
  status: string;
  installMode: string;
  targetPath: string | null;
  notes: string[];
};

export type InstallStatusResponse = {
  serverHealthy: boolean;
  repoPath: string;
  platform: string;
  nodeReady: boolean;
  pnpmReady: boolean;
  nodeVersion: string | null;
  pnpmVersion: string | null;
  recommendedAgentId: InstallAgentId;
  skillSourcePath: string;
  skillGithubUrl: string;
  bootstrapCommands: {
    onboard: string;
    doctor: string;
    dev: string;
  };
  agents: InstallAgentStatus[];
};

export type InstallOnboardRequest = {
  agentId?: InstallAgentId;
  installSkill?: boolean;
  installDependencies?: boolean;
  startDevHint?: boolean;
};

export type InstallStepEvent =
  | {
      type: "log";
      level: "info" | "warn" | "success" | "error";
      step: string;
      message: string;
    }
  | {
      type: "status";
      status: InstallStatusResponse;
    }
  | {
      type: "complete";
      status: InstallStatusResponse;
    }
  | {
      type: "error";
      message: string;
    };

export function fetchStudioInstallStatus() {
  return api.get<InstallStatusResponse>("/install/status");
}

function formatApiErrorMessage(status: number, body: unknown) {
  if (typeof body === "string" && body.trim()) {
    return body.trim();
  }
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error?: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }
  return `Request failed: ${status}`;
}

export async function streamStudioInstallOnboard(
  payload: InstallOnboardRequest,
  onEvent: (event: InstallStepEvent) => void,
) {
  const res = await fetch(`${API_BASE}/install/onboard/stream`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(formatApiErrorMessage(res.status, body), res.status, body);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("Install stream did not return a readable body.");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const event = JSON.parse(trimmed) as InstallStepEvent;
      onEvent(event);
    }
  }

  const tail = buffer.trim();
  if (tail) {
    const event = JSON.parse(tail) as InstallStepEvent;
    onEvent(event);
  }
}

export function getInstallAgent(
  status: InstallStatusResponse | null,
  agentId: InstallAgentId,
) {
  return status?.agents.find((agent) => agent.id === agentId) ?? null;
}

export function isCodexInstallReady(status: InstallStatusResponse | null) {
  const codex = getInstallAgent(status, "codex");
  return Boolean(
    status &&
      codex &&
      codex.supported &&
      codex.detected &&
      codex.authReady &&
      codex.skillInstalled,
  );
}
