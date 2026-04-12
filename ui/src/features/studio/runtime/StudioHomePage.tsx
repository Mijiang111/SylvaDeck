import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ArrowRight,
  Boxes,
  ChevronDown,
  History,
  LibraryBig,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { detectImplicitLongFormClarification } from "@/features/studio/generation";
import { createProjectBundle } from "@/features/studio/state";
import { loadAvailableModuleRegistry } from "@/features/studio/registry";
import { Link, useNavigate } from "@/lib/router";
import type { WorkbenchModuleUsageMode } from "@/features/studio/types";
import { createIntakeThread } from "./runtime-intake";
import { formatProjectTimestamp } from "./runtime-presentational";
import { LibraryReportCard } from "./homepage/LibraryReportCard";
import type { LibraryCardRecord } from "./homepage/types";
import { useStudioWorkspace } from "./studio/useStudioWorkspace";
import {
  useStudioLibraryState,
  useStudioProjectActions,
  useStudioShellState,
  useWorkbenchStudioStore,
} from "./studio/store";
import { getWorkspaceById } from "./studio/utils";

type HomeLibraryRecord = LibraryCardRecord & {
  id: string;
};

type HomeChatRecord = {
  id: string;
  projectName: string;
  chatLabel: string;
  updatedAt: string;
  workspaceId: string;
  workspaceName: string;
  messages: ReturnType<typeof createIntakeThread>;
  pageCount: number;
  hasGeneratedDeck: boolean;
};

const HOME_NAV_ITEMS = [
  { id: "library", label: "Library", icon: LibraryBig },
  { id: "ai", label: "AI Chat", icon: MessageSquareText },
  { id: "author", label: "Author Workspace", icon: Boxes },
] as const;

function deriveProjectNameFromPrompt(prompt: string) {
  const normalized = prompt
    .replace(/\s+/g, " ")
    .replace(/[.?!:;，。！？；：]+$/g, "")
    .trim();
  if (!normalized) {
    return "New AI report";
  }

  const compact = normalized.length > 48 ? `${normalized.slice(0, 45).trimEnd()}...` : normalized;
  return compact;
}

function EmptyState({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="studio-terminal-panel flex min-h-[320px] items-center justify-center p-8">
      <div className="max-w-lg text-center">
        <div className="text-[10px] font-semibold uppercase tracking-[0.34em] text-[var(--studio-muted)]">
          {eyebrow}
        </div>
        <h2 className="mt-4 text-[1.9rem] font-semibold tracking-[-0.04em] text-[var(--studio-ink)]">
          {title}
        </h2>
        <p className="mt-3 text-[14px] leading-7 text-[var(--studio-muted-strong)]">
          {body}
        </p>
      </div>
    </div>
  );
}

export function StudioHomePage() {
  useStudioWorkspace();

  const navigate = useNavigate();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [isLibraryExpanded, setIsLibraryExpanded] = useState(true);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);
  const [aiPrompt, setAiPrompt] = useState("");
  const [moduleUsageMode, setModuleUsageMode] = useState<WorkbenchModuleUsageMode>("disabled");
  const [visibleCount, setVisibleCount] = useState(12);

  const shell = useStudioShellState();
  const library = useStudioLibraryState();

  const {
    createProject,
    deleteProject,
    replaceCurrentProject,
    selectProject,
    setHomeSection,
    setSelectedLibraryProjectId,
    setSelectedChatProjectId,
    setStatusLine,
  } = useStudioProjectActions();

  const deferredHomeSection = useDeferredValue(shell.homeSection);

  const libraryCards = useMemo<HomeLibraryRecord[]>(() => {
    if (!library.snapshot) {
      return [];
    }

    return library.projectSummaries
      .filter((summary) => summary.hasGeneratedDeck)
      .map((summary) => {
        const workspace = getWorkspaceById(library.snapshot!, summary.workspaceId);
        const project = workspace?.projects.find((entry) => entry.id === summary.id) ?? null;
        if (!project) {
          return null;
        }

        return {
          id: summary.id,
          project: summary,
          htmlReport: project.generatedDraft?.htmlReport ?? null,
          isPublished: summary.publishCount > 0,
        } satisfies HomeLibraryRecord;
      })
      .filter((entry): entry is HomeLibraryRecord => Boolean(entry));
  }, [library.projectSummaries, library.snapshot]);

  const visibleLibraryCards = useMemo(
    () => libraryCards.slice(0, visibleCount),
    [libraryCards, visibleCount],
  );

  const chatHistory = useMemo<HomeChatRecord[]>(() => {
    if (!library.snapshot) {
      return [];
    }

    return library.projectSummaries
      .filter((summary) => summary.hasConversation)
      .map((summary) => {
        const workspace = getWorkspaceById(library.snapshot!, summary.workspaceId);
        const project = workspace?.projects.find((entry) => entry.id === summary.id) ?? null;
        if (!project) {
          return null;
        }

        return {
          id: summary.id,
          projectName: summary.projectName,
          chatLabel: summary.chatLabel,
          updatedAt: summary.chatUpdatedAt,
          workspaceId: summary.workspaceId,
          workspaceName: summary.workspaceName,
          messages: createIntakeThread(project.briefMessages),
          pageCount: summary.pageCount,
          hasGeneratedDeck: summary.hasGeneratedDeck,
        } satisfies HomeChatRecord;
      })
      .filter((entry): entry is HomeChatRecord => Boolean(entry));
  }, [library.projectSummaries, library.snapshot]);

  const selectedChatRecord = useMemo(
    () =>
      chatHistory.find((entry) => entry.id === shell.selectedChatProjectId) ??
      chatHistory[0] ??
      null,
    [chatHistory, shell.selectedChatProjectId],
  );

  const recentModules = useMemo(
    () => loadAvailableModuleRegistry().slice(0, 4),
    [],
  );

  useEffect(() => {
    if (libraryCards.length === 0) {
      return;
    }

    if (!shell.selectedLibraryProjectId) {
      setSelectedLibraryProjectId(libraryCards[0].id);
    }
  }, [libraryCards, setSelectedLibraryProjectId, shell.selectedLibraryProjectId]);

  useEffect(() => {
    if (chatHistory.length === 0) {
      return;
    }

    if (!shell.selectedChatProjectId) {
      setSelectedChatProjectId(chatHistory[0].id);
    }
  }, [chatHistory, setSelectedChatProjectId, shell.selectedChatProjectId]);

  useEffect(() => {
    setVisibleCount(12);
  }, [libraryCards.length, deferredHomeSection]);

  useEffect(() => {
    if (deferredHomeSection !== "library" || !loadMoreRef.current) {
      return;
    }

    const target = loadMoreRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          return;
        }

        setVisibleCount((current) => Math.min(current + 9, libraryCards.length));
      },
      {
        rootMargin: "0px 0px 320px 0px",
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [deferredHomeSection, libraryCards.length, visibleLibraryCards.length]);

  useEffect(() => {
    if (deferredHomeSection !== "library" || !shell.selectedLibraryProjectId) {
      return;
    }

    const element = cardRefs.current[shell.selectedLibraryProjectId];
    element?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [deferredHomeSection, shell.selectedLibraryProjectId]);

  async function openProjectFromLibrary(entry: HomeLibraryRecord) {
    startTransition(() => {
      selectProject(entry.project.workspaceId, entry.project.id, "editor");
      setSelectedLibraryProjectId(entry.project.id);
      setSelectedChatProjectId(entry.project.id);
      setStatusLine(`Opening ${entry.project.projectName} in the Studio editor.`);
    });
    navigate(`/projects/${entry.project.id}/edit`);
  }

  async function continueChatRecord(record: HomeChatRecord) {
    startTransition(() => {
      selectProject(record.workspaceId, record.id, "editor");
      setSelectedChatProjectId(record.id);
      if (record.hasGeneratedDeck) {
        setSelectedLibraryProjectId(record.id);
      }
      setStatusLine(`Continuing the AI conversation for ${record.projectName}.`);
    });
    navigate(`/projects/${record.id}/edit`);
  }

  function handleDeleteProject(args: {
    workspaceId: string;
    projectId: string;
    projectName: string;
  }) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete "${args.projectName}" from this Studio workspace?`)
    ) {
      return;
    }

    startTransition(() => {
      deleteProject(args.workspaceId, args.projectId);
    });
  }

  function handleCreateConversation() {
    const nextPrompt = aiPrompt.trim();
    if (!nextPrompt) {
      setStatusLine("Describe the PPT you want before opening a new conversation.");
      return;
    }

    const clarificationSuggestion = detectImplicitLongFormClarification(nextPrompt, {
      generationMode: "standard",
      requestedPageCount: null,
    });

    const nextProjectName = deriveProjectNameFromPrompt(nextPrompt);
    createProject(nextProjectName);

    const state = useWorkbenchStudioStore.getState();
    const project = state.document.project;
    if (!project) {
      setStatusLine("Studio could not create a new AI session.");
      return;
    }

    replaceCurrentProject(
      createProjectBundle({
        ...project,
        projectName: nextProjectName,
        sourceText: nextPrompt,
        generationMode: "standard",
        moduleUsageMode,
        requestedPageCount: null,
        longFormClarification:
          clarificationSuggestion?.trigger === "explicit-8-9-pages"
            ? {
                status: "pending",
                trigger: clarificationSuggestion.trigger,
                resolution: null,
              }
            : {
                status: "idle",
                trigger: null,
                resolution: null,
              },
        briefMessages: [{ role: "user", text: nextPrompt }],
        workflowStage: "intake",
        updatedAt: new Date().toISOString(),
      }),
      {
        history: {
          scope: "brief",
          label: "Start AI conversation",
          fields: [
            "projectName",
            "sourceText",
            "generationMode",
            "moduleUsageMode",
            "requestedPageCount",
            "briefMessages",
            "workflowStage",
          ],
        },
        mode: "editor",
        resetSelection: true,
        statusLine:
          clarificationSuggestion?.trigger === "explicit-8-9-pages"
            ? "Opened a new AI conversation. Pick 10 or 12 pages before Studio generates the deck."
            : "Opened a new AI conversation and queued the first draft.",
      },
    );

    setHomeSection("ai");
    setSelectedChatProjectId(project.id);
    setAiPrompt("");
    navigate(`/projects/${project.id}/edit`);
  }

  if (shell.bootState === "booting") {
    return (
      <article className="studio-terminal-root flex h-screen items-center justify-center px-6 text-[var(--studio-ink)]">
        <div className="studio-terminal-panel max-w-md px-8 py-7">
          <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--studio-muted)]">
            PPT Studio
          </div>
          <div className="mt-4 text-[1.18rem] font-semibold tracking-[-0.03em]">
            Opening local workspace
          </div>
          <p className="mt-2 text-[13px] leading-6 text-[var(--studio-muted-strong)]">
            Loading your Studio library, AI history, and template workspace from local storage.
          </p>
        </div>
      </article>
    );
  }

  if (shell.bootState === "error") {
    return (
      <article className="studio-terminal-root flex h-screen items-center justify-center px-6 text-[var(--studio-ink)]">
        <div className="studio-terminal-panel max-w-xl px-8 py-7">
          <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--studio-accent)]">
            Studio failed to load
          </div>
          <div className="mt-4 text-[1.18rem] font-semibold tracking-[-0.03em]">
            {shell.lastError ?? "Unknown error"}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="studio-terminal-root h-screen overflow-hidden text-[var(--studio-ink)]">
      <div className="studio-home-layout h-full">
        <aside
          className="border-b border-[var(--studio-line)] bg-[linear-gradient(180deg,#050505_0%,#000_100%)] px-4 py-5 md:border-b-0 md:border-r md:px-5"
          style={{ width: "clamp(280px, 22vw, 340px)" }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[18px] font-extrabold tracking-[0.08em] text-[var(--studio-ink)]">
                PPT STUDIO
              </div>
              <div className="mt-2 text-[10px] uppercase tracking-[0.42em] text-[var(--studio-muted)]">
                TERMINAL // WORKSPACE
              </div>
            </div>
            <div className="rounded-full border border-[var(--studio-line)] bg-[rgba(255,255,255,0.03)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
              Online
            </div>
          </div>

          <div className="mt-8 space-y-2">
            {HOME_NAV_ITEMS.map((entry) => {
              const Icon = entry.icon;
              const selected = shell.homeSection === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setHomeSection(entry.id)}
                  data-testid={`home-nav-${entry.id}`}
                  className={[
                    "flex w-full items-center justify-between rounded-[20px] border px-4 py-3 text-left transition",
                    selected
                      ? "border-[rgba(0,242,255,0.35)] bg-[rgba(0,242,255,0.08)] text-[var(--studio-ink)] shadow-[0_0_0_1px_rgba(0,242,255,0.12)]"
                      : "border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] text-[var(--studio-muted-strong)] hover:border-[rgba(255,255,255,0.16)] hover:text-[var(--studio-ink)]",
                  ].join(" ")}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4" />
                    <span className="text-[12px] font-semibold uppercase tracking-[0.18em]">
                      {entry.label}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 opacity-50" />
                </button>
              );
            })}
          </div>

          <div className="mt-8 space-y-5 overflow-hidden">
            <div className="studio-terminal-panel-soft overflow-hidden">
              <button
                type="button"
                onClick={() => setIsLibraryExpanded((value) => !value)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--studio-muted)]">
                  Library
                </span>
                {isLibraryExpanded ? (
                  <PanelLeftClose className="h-4 w-4 text-[var(--studio-muted)]" />
                ) : (
                  <PanelLeftOpen className="h-4 w-4 text-[var(--studio-muted)]" />
                )}
              </button>
              {isLibraryExpanded ? (
                <div className="max-h-[32vh] overflow-y-auto border-t border-[var(--studio-line-soft)] px-2 py-2">
                  {libraryCards.length === 0 ? (
                    <div className="px-3 py-3 text-[12px] leading-6 text-[var(--studio-muted-strong)]">
                      Generated projects will appear here after the first AI draft succeeds.
                    </div>
                  ) : (
                    libraryCards.map((entry) => (
                      <div
                        key={entry.id}
                        className={[
                          "mb-2 flex items-center gap-2 rounded-[16px] border px-2 py-2 transition",
                          shell.selectedLibraryProjectId === entry.id
                            ? "border-[rgba(0,242,255,0.32)] bg-[rgba(0,242,255,0.08)]"
                            : "border-transparent bg-transparent hover:border-[var(--studio-line)] hover:bg-[rgba(255,255,255,0.02)]",
                        ].join(" ")}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setHomeSection("library");
                            setSelectedLibraryProjectId(entry.id);
                            setStatusLine(`Pinned ${entry.project.projectName} in the Library grid.`);
                          }}
                          className="min-w-0 flex-1 rounded-[12px] px-1 py-1 text-left"
                        >
                          <div className="truncate text-[12px] font-semibold text-[var(--studio-ink)]">
                            {entry.project.projectName}
                          </div>
                          <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                            {formatProjectTimestamp(entry.project.updatedAt)}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteProject({
                              workspaceId: entry.project.workspaceId,
                              projectId: entry.id,
                              projectName: entry.project.projectName,
                            })}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[rgba(255,120,120,0.18)] bg-[rgba(20,10,10,0.72)] text-white/56 transition hover:border-[rgba(255,120,120,0.34)] hover:bg-[rgba(255,120,120,0.12)] hover:text-[#ffc4c4]"
                          aria-label={`Delete ${entry.project.projectName}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            <div className="studio-terminal-panel-soft overflow-hidden">
              <button
                type="button"
                onClick={() => setIsHistoryExpanded((value) => !value)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--studio-muted)]">
                  AI History
                </span>
                <ChevronDown
                  className={[
                    "h-4 w-4 text-[var(--studio-muted)] transition",
                    isHistoryExpanded ? "" : "-rotate-90",
                  ].join(" ")}
                />
              </button>
              {isHistoryExpanded ? (
                <div className="max-h-[36vh] overflow-y-auto border-t border-[var(--studio-line-soft)] px-2 py-2">
                  {chatHistory.length === 0 ? (
                    <div className="px-3 py-3 text-[12px] leading-6 text-[var(--studio-muted-strong)]">
                      Start a conversation and it will be remembered here as a reusable project thread.
                    </div>
                  ) : (
                    chatHistory.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => {
                          setHomeSection("ai");
                          setSelectedChatProjectId(entry.id);
                          setStatusLine(`Loaded conversation history for ${entry.projectName}.`);
                        }}
                        className={[
                          "mb-2 w-full rounded-[16px] border px-3 py-3 text-left transition",
                          shell.selectedChatProjectId === entry.id
                            ? "border-[rgba(0,242,255,0.32)] bg-[rgba(0,242,255,0.08)]"
                            : "border-transparent bg-transparent hover:border-[var(--studio-line)] hover:bg-[rgba(255,255,255,0.02)]",
                        ].join(" ")}
                      >
                        <div className="truncate text-[12px] font-semibold text-[var(--studio-ink)]">
                          {entry.chatLabel}
                        </div>
                        <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                          {formatProjectTimestamp(entry.updatedAt)}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto px-4 py-5 md:px-6 md:py-6">
          {deferredHomeSection === "library" ? (
            <section className="space-y-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.34em] text-[var(--studio-muted)]">
                    Library
                  </div>
                  <h1 className="mt-4 text-[2.4rem] font-semibold tracking-[-0.05em] text-[var(--studio-ink)]">
                    Generated decks, arranged like a terminal archive.
                  </h1>
                  <p className="mt-3 max-w-3xl text-[14px] leading-7 text-[var(--studio-muted-strong)]">
                    Browse finished PPT projects as living cards. The sidebar keeps your index close;
                    the canvas opens only when you decide to edit.
                  </p>
                </div>
                <div className="rounded-full border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--studio-muted)]">
                  {libraryCards.length} projects
                </div>
              </div>

              {libraryCards.length === 0 ? (
                <EmptyState
                  eyebrow="Library"
                  title="No generated decks yet"
                  body="Use AI Chat to generate the first PPT. Once a report is produced, it will appear here as a reusable project card."
                />
              ) : (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {visibleLibraryCards.map((entry) => (
                    <div
                      key={entry.id}
                      className="min-w-0"
                      ref={(node) => {
                        cardRefs.current[entry.id] = node;
                      }}
                    >
                      <LibraryReportCard
                        entry={entry}
                        selected={shell.selectedLibraryProjectId === entry.id}
                        onOpen={() => void openProjectFromLibrary(entry)}
                        onDelete={() =>
                          handleDeleteProject({
                            workspaceId: entry.project.workspaceId,
                            projectId: entry.id,
                            projectName: entry.project.projectName,
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              )}

              <div ref={loadMoreRef} className="h-4" />
            </section>
          ) : deferredHomeSection === "ai" ? (
            <section className="mx-auto flex min-h-full max-w-5xl flex-col justify-center py-6">
              <div className="mx-auto w-full max-w-3xl px-6 py-7 text-center">
                <div className="text-[10px] font-semibold uppercase tracking-[0.34em] text-[var(--studio-muted)]">
                  AI Chat
                </div>
                <h1 className="mt-4 text-[2.4rem] font-semibold tracking-[-0.05em] text-[var(--studio-ink)]">
                  告诉我你想要什么样的 PPT，我来帮你生成
                </h1>
                <p className="mt-3 text-[14px] leading-7 text-[var(--studio-muted-strong)]">
                  Start with one clear sentence, rough notes, or a messy brief. Studio will turn it into
                  an editable deck and open the dedicated modification page automatically.
                </p>

                <div className="mt-8 rounded-[28px] border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.56)] p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <Textarea
                    value={aiPrompt}
                    onChange={(event) => setAiPrompt(event.target.value)}
                    data-testid="ai-chat-prompt"
                    placeholder="Create a three-page deck on an AI rollout, research finding, or business issue. Keep each page to one question, one claim, and the strongest supporting proof."
                    className="min-h-[220px] rounded-[20px] border-0 bg-[rgba(0,0,0,0.38)] px-3 py-3 text-[15px] leading-7 text-[var(--studio-ink)] shadow-none outline-none placeholder:text-[var(--studio-muted)]"
                  />
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--studio-line-soft)] pt-4">
                    <div className="space-y-3">
                      <div className="text-[12px] leading-6 text-[var(--studio-muted-strong)]">
                        One conversation becomes one project. You can keep iterating after the first draft appears.
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                          Templates
                        </div>
                        {[
                          { value: "disabled", label: "Off" },
                          { value: "fallback", label: "Fallback" },
                          { value: "chart-only", label: "Charts only" },
                        ].map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                              setModuleUsageMode(option.value as WorkbenchModuleUsageMode)
                            }
                            className={[
                              "inline-flex items-center rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition",
                              moduleUsageMode === option.value
                                ? "border-[rgba(0,242,255,0.35)] bg-[rgba(0,242,255,0.1)] text-[var(--studio-ink)]"
                                : "border-[var(--studio-line)] bg-[rgba(255,255,255,0.03)] text-[var(--studio-muted-strong)] hover:border-[rgba(0,242,255,0.2)] hover:text-[var(--studio-ink)]",
                            ].join(" ")}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleCreateConversation}
                      data-testid="ai-chat-generate"
                      className="inline-flex items-center gap-2 rounded-full border border-[rgba(0,242,255,0.35)] bg-[rgba(0,242,255,0.1)] px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-ink)] transition hover:bg-[rgba(0,242,255,0.16)]"
                    >
                      Generate
                      <Sparkles className="h-4 w-4 text-[var(--studio-accent)]" />
                    </button>
                  </div>
                </div>
              </div>

              {selectedChatRecord ? (
                <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="studio-terminal-panel px-5 py-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--studio-muted)]">
                          Conversation history
                        </div>
                        <div className="mt-3 text-[1.2rem] font-semibold tracking-[-0.03em] text-[var(--studio-ink)]">
                          {selectedChatRecord.chatLabel}
                        </div>
                      </div>
                      <div className="rounded-full border border-[var(--studio-line)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                        {formatProjectTimestamp(selectedChatRecord.updatedAt)}
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      {selectedChatRecord.messages.map((message, index) => (
                        <div
                          key={`${selectedChatRecord.id}-${index}`}
                          className={[
                            "max-w-[88%] rounded-[22px] border px-4 py-3 text-[13px] leading-6",
                            message.role === "assistant"
                              ? "border-[var(--studio-line)] bg-[rgba(255,255,255,0.03)] text-[var(--studio-ink)]"
                              : "ml-auto border-[rgba(0,242,255,0.26)] bg-[rgba(0,242,255,0.08)] text-[var(--studio-ink)]",
                          ].join(" ")}
                        >
                          {message.text}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="studio-terminal-panel flex flex-col justify-between px-5 py-5">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--studio-muted)]">
                        Session
                      </div>
                      <div className="mt-3 text-[1.05rem] font-semibold text-[var(--studio-ink)]">
                        {selectedChatRecord.projectName}
                      </div>
                      <div className="mt-3 text-[13px] leading-6 text-[var(--studio-muted-strong)]">
                        {selectedChatRecord.hasGeneratedDeck
                          ? `${selectedChatRecord.pageCount} pages are already available for editing.`
                          : "This conversation is still intake-only and will generate on the first edit-page load."}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void continueChatRecord(selectedChatRecord)}
                      className="mt-6 inline-flex items-center justify-center gap-2 rounded-full border border-[rgba(0,242,255,0.35)] bg-[rgba(0,242,255,0.1)] px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-ink)] transition hover:bg-[rgba(0,242,255,0.16)]"
                    >
                      Continue editing
                      <ArrowRight className="h-4 w-4 text-[var(--studio-accent)]" />
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : (
            <section className="space-y-5">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.34em] text-[var(--studio-muted)]">
                  Author Workspace
                </div>
                <h1 className="mt-4 text-[2.4rem] font-semibold tracking-[-0.05em] text-[var(--studio-ink)]">
                  Build the template system behind better decks.
                </h1>
                <p className="mt-3 max-w-3xl text-[14px] leading-7 text-[var(--studio-muted-strong)]">
                  The author workspace stays as a specialized lane. From here you can open the template
                  library, fork a reusable shape, or jump into a fresh template canvas.
                </p>
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
                <div className="grid gap-5 md:grid-cols-2">
                  {recentModules.map((entry) => (
                    <Link
                      key={entry.id}
                      to={entry.scope === "core" ? `/templates/${entry.id}` : `/templates/${entry.id}/edit`}
                      className="studio-terminal-panel group block px-5 py-5 transition hover:-translate-y-0.5 hover:border-[rgba(0,242,255,0.24)]"
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                        {entry.family} // {entry.scope}
                      </div>
                      <div className="mt-4 text-[1.08rem] font-semibold text-[var(--studio-ink)]">
                        {entry.label}
                      </div>
                      <div className="mt-2 text-[13px] leading-6 text-[var(--studio-muted-strong)]">
                        {entry.description}
                      </div>
                      <div className="mt-5 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--studio-accent)]">
                        Open template
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </Link>
                  ))}
                </div>

                <div className="space-y-5">
                  <Link
                    to="/templates"
                    className="studio-terminal-panel block px-5 py-5 transition hover:border-[rgba(0,242,255,0.24)]"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                      Workspace
                    </div>
                    <div className="mt-4 text-[1.08rem] font-semibold text-[var(--studio-ink)]">
                      Open template library
                    </div>
                    <div className="mt-2 text-[13px] leading-6 text-[var(--studio-muted-strong)]">
                      Browse the full template registry, test evidence, and reusable composition patterns.
                    </div>
                  </Link>

                  <Link
                    to="/templates/new"
                    className="studio-terminal-panel block px-5 py-5 transition hover:border-[rgba(0,242,255,0.24)]"
                  >
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[rgba(0,242,255,0.22)] bg-[rgba(0,242,255,0.08)]">
                      <Plus className="h-5 w-5 text-[var(--studio-accent)]" />
                    </div>
                    <div className="mt-4 text-[1.08rem] font-semibold text-[var(--studio-ink)]">
                      Start a new template
                    </div>
                    <div className="mt-2 text-[13px] leading-6 text-[var(--studio-muted-strong)]">
                      Jump straight into the authoring canvas and build a new reusable page shape.
                    </div>
                  </Link>

                  <div className="studio-terminal-panel px-5 py-5">
                    <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                      <History className="h-4 w-4" />
                      Author note
                    </div>
                    <p className="mt-4 text-[13px] leading-7 text-[var(--studio-muted-strong)]">
                      This home page is only the overview layer. Deep template composition, semantic flow,
                      testing, and publish evidence still run in the dedicated authoring routes.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </article>
  );
}
