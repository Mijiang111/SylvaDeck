import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Play, RefreshCcw, Sparkles, TerminalSquare } from "lucide-react";
import {
  fetchStudioInstallStatus,
  getInstallAgent,
  isCodexInstallReady,
  streamStudioInstallOnboard,
  INSTALL_SKILL_COMMAND,
  MANUAL_DOCTOR_COMMAND,
  MANUAL_ONBOARD_COMMAND,
  MANUAL_RUN_COMMAND,
  type InstallAgentStatus,
  type InstallStatusResponse,
  type InstallStepEvent,
} from "@/features/studio/install";
import { Link, useLocation, useNavigate } from "@/lib/router";

const FALLBACK_GITHUB_SKILL_URL =
  "https://github.com/Mijiang111/claw-design/tree/main/skills/ppt-workbench-studio";

const STATIC_AGENT_CARDS: InstallAgentStatus[] = [
  {
    id: "codex",
    label: "Codex",
    visible: true,
    supported: true,
    detected: false,
    authReady: false,
    skillInstalled: false,
    status: "docs",
    installMode: "one-click",
    targetPath: "~/.codex/skills/ppt-workbench-studio",
    notes: ["Recommended in V1. One-command setup installs dependencies and links the repo skill."],
  },
  {
    id: "claude-code",
    label: "Claude Code",
    visible: true,
    supported: false,
    detected: false,
    authReady: false,
    skillInstalled: false,
    status: "manual-soon",
    installMode: "manual",
    targetPath: null,
    notes: ["Visible in V1. Manual setup guidance is coming soon."],
  },
  {
    id: "cursor",
    label: "Cursor",
    visible: true,
    supported: false,
    detected: false,
    authReady: false,
    skillInstalled: false,
    status: "manual-soon",
    installMode: "manual",
    targetPath: null,
    notes: ["Visible in V1. Manual setup guidance is coming soon."],
  },
];

function CopyButton({
  label,
  value,
  onCopied,
}: {
  label: string;
  value: string;
  onCopied: (label: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => onCopied(label)).catch(() => undefined);
      }}
      className="inline-flex items-center gap-2 border border-[var(--studio-line)] px-3 py-2 text-[11px] font-medium tracking-[0.06em] text-[var(--studio-ink)] transition hover:border-[rgba(0,242,255,0.3)] hover:bg-[rgba(0,242,255,0.06)]"
    >
      <Copy className="h-3.5 w-3.5" />
      Copy
    </button>
  );
}

function statusTone(status: string) {
  if (status === "ready") {
    return "border-emerald-400/40 bg-emerald-400/10 text-emerald-200";
  }
  if (status === "missing-command" || status === "missing-auth" || status === "missing-skill") {
    return "border-amber-400/40 bg-amber-400/10 text-amber-100";
  }
  return "border-[var(--studio-line)] bg-[rgba(255,255,255,0.04)] text-[var(--studio-muted-strong)]";
}

function AgentCard({ agent }: { agent: InstallAgentStatus }) {
  return (
    <div className="border border-[var(--studio-line)] bg-[rgba(8,8,8,0.92)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--studio-muted)]">
            Agent
          </div>
          <h3 className="mt-2 text-[1.05rem] font-semibold tracking-[-0.03em] text-[var(--studio-ink)]">
            {agent.label}
          </h3>
        </div>
        <span className={`border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${statusTone(agent.status)}`}>
          {agent.status}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-[12px] text-[var(--studio-muted-strong)]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">Detected</div>
          <div className="mt-1 text-[var(--studio-ink)]">{agent.detected ? "Yes" : "No"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">Install mode</div>
          <div className="mt-1 text-[var(--studio-ink)]">{agent.installMode}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">Auth</div>
          <div className="mt-1 text-[var(--studio-ink)]">{agent.authReady ? "Ready" : "Pending"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">Skill</div>
          <div className="mt-1 text-[var(--studio-ink)]">{agent.skillInstalled ? "Installed" : "Not installed"}</div>
        </div>
      </div>

      <div className="mt-4 border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] p-3 text-[11px] leading-6 text-[var(--studio-muted-strong)]">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">Install location</div>
        <div className="mt-1 break-all text-[var(--studio-ink)]">
          {agent.targetPath ?? "Manual setup guidance coming soon"}
        </div>
      </div>

      {agent.notes.length ? (
        <ul className="mt-4 space-y-2 text-[12px] leading-6 text-[var(--studio-muted-strong)]">
          {agent.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function normalizeReturnPath(value: string | null) {
  if (!value || !value.startsWith("/")) {
    return "/";
  }
  return value;
}

export function StudioInstallPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<InstallStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusChecked, setStatusChecked] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [logs, setLogs] = useState<Array<{ tone: string; text: string }>>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const returnPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return normalizeReturnPath(params.get("return"));
  }, [location.search]);

  const loadStatus = useCallback(async () => {
    try {
      setStatusError(null);
      const next = await fetchStudioInstallStatus();
      setStatus(next);
    } catch (error) {
      setStatus(null);
      setStatusError(error instanceof Error ? error.message : "Local install API is unavailable.");
    } finally {
      setStatusChecked(true);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const codexReady = isCodexInstallReady(status);
  const mode = status ? "connected" : statusChecked ? "docs" : "checking";
  const skillGithubUrl = status?.skillGithubUrl ?? FALLBACK_GITHUB_SKILL_URL;
  const agents = status?.agents ?? STATIC_AGENT_CARDS;
  const codexAgent = getInstallAgent(status, "codex") ?? STATIC_AGENT_CARDS[0];

  const appendLog = useCallback((event: InstallStepEvent) => {
    if (event.type === "status") {
      setStatus(event.status);
      return;
    }
    if (event.type === "complete") {
      setStatus(event.status);
      setLogs((current) => [
        ...current,
        { tone: "success", text: "Onboarding finished. Codex is ready for Studio." },
      ]);
      return;
    }
    if (event.type === "error") {
      setLogs((current) => [...current, { tone: "error", text: event.message }]);
      return;
    }
    setLogs((current) => [...current, { tone: event.level, text: `${event.step}: ${event.message}` }]);
  }, []);

  const handleCopied = useCallback((label: string) => {
    setCopiedKey(label);
    window.setTimeout(() => setCopiedKey((current) => (current === label ? null : current)), 1600);
  }, []);

  const startOnboarding = useCallback(async () => {
    setLogs([{ tone: "info", text: "Starting Codex onboarding…" }]);
    setIsOnboarding(true);
    try {
      await streamStudioInstallOnboard(
        {
          agentId: "codex",
          installSkill: true,
          installDependencies: true,
          startDevHint: true,
        },
        appendLog,
      );
      await loadStatus();
    } catch (error) {
      setLogs((current) => [
        ...current,
        {
          tone: "error",
          text: error instanceof Error ? error.message : "Studio onboarding failed.",
        },
      ]);
    } finally {
      setIsOnboarding(false);
    }
  }, [appendLog, loadStatus]);

  return (
    <article className="studio-terminal-root h-screen overflow-y-auto text-[var(--studio-ink)]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 sm:px-8">
        <div className="flex items-center justify-between gap-4 border border-[var(--studio-line)] bg-[rgba(8,8,8,0.92)] px-5 py-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--studio-muted)]">
              Studio Install
            </div>
            <h1 className="mt-2 text-[1.6rem] font-semibold tracking-[-0.04em] text-[var(--studio-ink)]">
              Two ways to get started
            </h1>
            <p className="mt-3 max-w-3xl text-[13px] leading-7 text-[var(--studio-muted-strong)]">
              Start with an AI coding agent if you can. If not, use the local manual path and open Studio yourself.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={returnPath}
              className="inline-flex items-center gap-2 border border-[var(--studio-line)] px-3 py-2 text-[11px] font-medium tracking-[0.06em] text-[var(--studio-ink)] transition hover:border-[rgba(0,242,255,0.28)] hover:bg-[rgba(0,242,255,0.06)]"
            >
              Back to Studio
            </Link>
            <a
              href={skillGithubUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 border border-[var(--studio-line)] px-3 py-2 text-[11px] font-medium tracking-[0.06em] text-[var(--studio-ink)] transition hover:border-[rgba(0,242,255,0.28)] hover:bg-[rgba(0,242,255,0.06)]"
            >
              GitHub skill
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <section className="border border-[rgba(0,242,255,0.28)] bg-[linear-gradient(180deg,rgba(0,242,255,0.09),rgba(8,8,8,0.96))] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--studio-muted)]">
                  Option 1
                </div>
                <div className="mt-3 text-[1.32rem] font-semibold tracking-[-0.04em] text-[var(--studio-ink)]">
                  With an AI coding agent (recommended)
                </div>
              </div>
              <span className="inline-flex items-center gap-2 border border-[rgba(0,242,255,0.28)] bg-[rgba(0,242,255,0.08)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-ink)]">
                <Sparkles className="h-3.5 w-3.5 text-[var(--studio-accent)]" />
                Skill first
              </span>
            </div>

            <p className="mt-4 max-w-2xl text-[13px] leading-7 text-[var(--studio-muted-strong)]">
              Install the Claw Design skill, refresh your agent, then simply describe the deck you want.
              The skill teaches the agent to read sources, shape a Studio-ready prompt, and launch Studio through the local bridge.
            </p>

            <div className="mt-6 border border-[var(--studio-line)] bg-[rgba(0,0,0,0.32)] p-4">
              <div className="flex items-center justify-between gap-4">
                <code className="block text-[13px] leading-7 text-[var(--studio-ink)]">
                  {INSTALL_SKILL_COMMAND}
                </code>
                <div className="flex shrink-0 items-center gap-2">
                  <CopyButton label="Agent install" value={INSTALL_SKILL_COMMAND} onCopied={handleCopied} />
                  {copiedKey === "Agent install" ? (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-emerald-200">
                      <Check className="h-3.5 w-3.5" />
                      Copied
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-[12px] leading-7 text-[var(--studio-muted-strong)]">
              <div>1. Install the repo skill.</div>
              <div>2. Restart or refresh your AI coding agent.</div>
              <div>3. Tell the agent what deck you want. It will use the repo skill + Studio bridge.</div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={skillGithubUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 border border-[var(--studio-line)] px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--studio-ink)] transition hover:border-[rgba(0,242,255,0.28)] hover:bg-[rgba(0,242,255,0.06)]"
              >
                GitHub skill
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              {codexReady ? (
                <button
                  type="button"
                  onClick={() => navigate(returnPath)}
                  className="inline-flex items-center gap-2 border border-[rgba(0,242,255,0.35)] bg-[rgba(0,242,255,0.08)] px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--studio-ink)] transition hover:bg-[rgba(0,242,255,0.16)]"
                >
                  Continue to Studio
                </button>
              ) : null}
            </div>
          </section>

          <section className="border border-[var(--studio-line)] bg-[rgba(8,8,8,0.92)] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--studio-muted)]">
                  Option 2
                </div>
                <div className="mt-3 text-[1.32rem] font-semibold tracking-[-0.04em] text-[var(--studio-ink)]">
                  Local manual setup
                </div>
              </div>
              <span className="inline-flex items-center gap-2 border border-[var(--studio-line)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-ink)]">
                <TerminalSquare className="h-3.5 w-3.5" />
                Manual
              </span>
            </div>

            <p className="mt-4 max-w-2xl text-[13px] leading-7 text-[var(--studio-muted-strong)]">
              If you do not want the skill path, bootstrap the local environment yourself, then open Studio in the browser.
            </p>

            <div className="mt-6 space-y-4">
              <div className="border border-[var(--studio-line)] bg-[rgba(0,0,0,0.32)] p-4">
                <div className="flex items-center justify-between gap-4">
                  <code className="block text-[13px] leading-7 text-[var(--studio-ink)]">
                    {MANUAL_ONBOARD_COMMAND}
                  </code>
                  <div className="flex shrink-0 items-center gap-2">
                    <CopyButton label="Manual onboard" value={MANUAL_ONBOARD_COMMAND} onCopied={handleCopied} />
                    {copiedKey === "Manual onboard" ? (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-emerald-200">
                        <Check className="h-3.5 w-3.5" />
                        Copied
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="border border-[var(--studio-line)] bg-[rgba(0,0,0,0.32)] p-4">
                <div className="flex items-center justify-between gap-4">
                  <code className="block text-[13px] leading-7 text-[var(--studio-ink)]">
                    {MANUAL_RUN_COMMAND}
                  </code>
                  <div className="flex shrink-0 items-center gap-2">
                    <CopyButton label="Run Studio" value={MANUAL_RUN_COMMAND} onCopied={handleCopied} />
                    {copiedKey === "Run Studio" ? (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-emerald-200">
                        <Check className="h-3.5 w-3.5" />
                        Copied
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-[12px] leading-7 text-[var(--studio-muted-strong)]">
              <div>1. Run local bootstrap once.</div>
              <div>2. Start the Studio server and UI.</div>
              <div>3. Open <span className="text-[var(--studio-ink)]">http://127.0.0.1:5174</span>.</div>
            </div>
          </section>
        </div>

        <details className="mt-6 border border-[var(--studio-line)] bg-[rgba(8,8,8,0.92)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--studio-ink)]">
            <span>Advanced / Diagnostics</span>
            <span className="text-[10px] tracking-[0.18em] text-[var(--studio-muted)]">
              {mode === "connected" ? "Local status available" : mode === "docs" ? "Docs mode" : "Checking"}
            </span>
          </summary>

          <div className="border-t border-[var(--studio-line)] px-6 py-6">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void loadStatus()}
                disabled={isOnboarding}
                className="inline-flex items-center gap-2 border border-[var(--studio-line)] px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--studio-ink)] transition hover:border-[rgba(0,242,255,0.28)] hover:bg-[rgba(0,242,255,0.06)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                Refresh status
              </button>
              <button
                type="button"
                onClick={() => void startOnboarding()}
                disabled={isOnboarding}
                className="inline-flex items-center gap-2 border border-[rgba(0,242,255,0.35)] bg-[rgba(0,242,255,0.08)] px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--studio-ink)] transition hover:bg-[rgba(0,242,255,0.16)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Play className="h-3.5 w-3.5" />
                {isOnboarding ? "Installing…" : "Run onboarding here"}
              </button>
              <CopyButton label="Doctor" value={MANUAL_DOCTOR_COMMAND} onCopied={handleCopied} />
            </div>

            {mode === "connected" ? (
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] p-4">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">Repo</div>
                  <div className="mt-2 break-all text-[12px] leading-6 text-[var(--studio-ink)]">{status?.repoPath}</div>
                </div>
                <div className="border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] p-4">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">Node / pnpm</div>
                  <div className="mt-2 text-[12px] leading-6 text-[var(--studio-ink)]">
                    {status?.nodeReady ? status.nodeVersion ?? "ready" : "missing"} /{" "}
                    {status?.pnpmReady ? status.pnpmVersion ?? "ready" : "missing"}
                  </div>
                </div>
                <div className="border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] p-4">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">Codex target</div>
                  <div className="mt-2 break-all text-[12px] leading-6 text-[var(--studio-ink)]">
                    {codexAgent.targetPath ?? "Pending"}
                  </div>
                </div>
              </div>
            ) : mode === "docs" ? (
              <div className="mt-6 border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] p-4 text-[12px] leading-7 text-[var(--studio-muted-strong)]">
                Local install APIs are not reachable right now, so this page is showing the public/docs path. You can still use the skill install command or the manual local setup commands above.
              </div>
            ) : (
              <div className="mt-6 border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] p-4 text-[12px] leading-7 text-[var(--studio-muted-strong)]">
                Checking the local Studio server and Codex environment…
              </div>
            )}

            {statusError && mode === "docs" ? (
              <div className="mt-4 text-[12px] leading-7 text-amber-100">{statusError}</div>
            ) : null}

            <div className="mt-6">
              <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                <div className="border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] p-4">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">What gets installed</div>
                  <ul className="mt-4 space-y-3 text-[12px] leading-7 text-[var(--studio-muted-strong)]">
                    <li>Checks Node, pnpm, Codex CLI, and Codex authentication.</li>
                    <li>Installs workspace dependencies when they are missing.</li>
                    <li>Links the repo skill from <code className="text-[var(--studio-ink)]">skills/ppt-workbench-studio/</code> into the global Codex skills directory.</li>
                    <li>Keeps Claude Code and Cursor visible in diagnostics without blocking Studio entry.</li>
                  </ul>
                </div>
                <div className="border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] p-4">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">Why this page exists</div>
                  <ul className="mt-4 space-y-3 text-[12px] leading-7 text-[var(--studio-muted-strong)]">
                    <li>The first screen stays simple: agent-first or manual local setup.</li>
                    <li>The install page and the first-run Studio guide share one status source, so CLI and UI do not drift.</li>
                    <li>The repo skill path stays stable enough to publish on GitHub and reuse in onboarding docs.</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--studio-muted)]">Agent matrix</div>
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                {agents.filter((agent) => agent.visible).map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            </div>

            <div className="mt-6 border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">Logs</div>
              <div className="mt-3 max-h-[240px] space-y-2 overflow-y-auto text-[12px] leading-6">
                {logs.length === 0 ? (
                  <div className="text-[var(--studio-muted-strong)]">
                    Use this section if you want live status, onboarding logs, or manual diagnostics.
                  </div>
                ) : (
                  logs.map((entry, index) => (
                    <div
                      key={`${entry.text}-${index}`}
                      className={
                        entry.tone === "error"
                          ? "text-rose-200"
                          : entry.tone === "success"
                            ? "text-emerald-200"
                            : entry.tone === "warn"
                              ? "text-amber-100"
                              : "text-[var(--studio-ink)]"
                      }
                    >
                      {entry.text}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </details>
      </div>
    </article>
  );
}
