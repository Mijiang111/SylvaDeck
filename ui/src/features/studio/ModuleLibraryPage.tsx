import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import { Link } from "@/lib/router";
import { useNavigate } from "@/lib/router";
import { PreviewBlock } from "./renderers";
import {
  buildModuleTrustSummary,
  deleteModuleAsset,
  getModuleAssetRecord,
  loadPublishedModuleManifests,
} from "./module-assets";
import { storeModuleAuthoringHandoff } from "./module-authoring-handoff";
import {
  buildStarterDeckPages,
  createStarterPackAuthoringHandoff,
  getStarterPackTheme,
  isStarterPackDeck,
  isStarterPackLayout,
  listStarterPackManifests,
} from "./starter-packs";
import { buildModulePreviewBlock, buildModulePreviewDraft } from "./authoring/helpers";
import { loadAvailableModuleRegistry } from "./registry";
import { createProjectBundle } from "./state";
import { useStudioWorkspace } from "./runtime/studio/useStudioWorkspace";
import { useStudioProjectActions, useWorkbenchStudioStore } from "./runtime/studio/store";

function getCapabilityTone(isPublic: boolean, status: string) {
  if (isPublic) {
    return "border-[rgba(0,242,255,0.28)] bg-[rgba(0,242,255,0.1)] text-[var(--studio-ink)]";
  }
  if (status === "draft") {
    return "border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] text-[var(--studio-muted-strong)]";
  }
  return "border-[rgba(216,164,95,0.26)] bg-[rgba(216,164,95,0.12)] text-[var(--studio-ink)]";
}

function getChartLabel(chartKinds: string[]) {
  return chartKinds.length ? chartKinds.join(" / ").toUpperCase() : "NARRATIVE";
}

function getDeterministicLabel(value: string | null) {
  if (value === "native") return "Native";
  if (value === "hybrid") return "Hybrid";
  if (value === "flow") return "Flow";
  if (value === "fallback") return "Fallback";
  return "Draft";
}

export function ModuleLibraryPage() {
  useStudioWorkspace();
  const navigate = useNavigate();
  const { createProject, replaceCurrentProject, setStatusLine } = useStudioProjectActions();
  const initialModules = useMemo(() => {
    const manifests = new Map(
      loadPublishedModuleManifests().map((manifest) => [manifest.moduleId, manifest] as const)
    );

    return loadAvailableModuleRegistry()
      .map((entry) => {
        const asset = getModuleAssetRecord(entry.id);
        const trust = buildModuleTrustSummary(asset);
        const manifest = manifests.get(entry.id) ?? asset?.publishedManifest ?? null;
        const isPublicCapability = Boolean(manifest);
        return {
          entry,
          asset,
          trust,
          manifest,
          isPublicCapability,
        };
      })
      .sort((left, right) => {
        if (left.isPublicCapability !== right.isPublicCapability) {
          return Number(right.isPublicCapability) - Number(left.isPublicCapability);
        }
        const trustDelta = (right.manifest?.trustScore ?? 0) - (left.manifest?.trustScore ?? 0);
        if (trustDelta !== 0) {
          return trustDelta;
        }
        return left.entry.label.localeCompare(right.entry.label);
      });
  }, []);
  const starterPacks = useMemo(() => listStarterPackManifests(), []);

  const [modules, setModules] = useState(initialModules);

  function handleDelete(moduleId: string, label: string) {
    if (!window.confirm(`Delete template "${label}"? This cannot be undone.`)) {
      return;
    }
    deleteModuleAsset(moduleId);
    setModules((current) => current.filter((m) => m.entry.id !== moduleId));
  }

  function handleStartDeckStarter(starterId: string) {
    const starter = starterPacks.find((entry) => entry.id === starterId) ?? null;
    if (!isStarterPackDeck(starter)) {
      return;
    }
    createProject(starter.label);
    const state = useWorkbenchStudioStore.getState();
    const project = state.document.project;
    if (!project) {
      setStatusLine("Studio could not open the selected starter pack.");
      return;
    }

    replaceCurrentProject(
      createProjectBundle({
        ...project,
        templateId: "blank",
        starterPackId: starter.id,
        projectName: starter.label,
        sourceText: "",
        briefMessages: [],
        generationMode: "standard",
        moduleUsageMode: "disabled",
        requestedPageCount: starter.pageCount ?? null,
        pages: buildStarterDeckPages(starter),
        generatedDraft: null,
        workflowStage: "intake",
        updatedAt: new Date().toISOString(),
      }),
      {
        history: {
          scope: "brief",
          label: "Start from starter pack",
          fields: ["starterPackId", "projectName", "sourceText", "requestedPageCount", "pages"],
        },
        mode: "editor",
        resetSelection: true,
        statusLine: `Opened ${starter.label} as a read-only starter pack.`,
      },
    );
    navigate(`/projects/${project.id}/edit`);
  }

  function handleOpenLayoutStarter(starterId: string) {
    const starter = starterPacks.find((entry) => entry.id === starterId) ?? null;
    if (!isStarterPackLayout(starter)) {
      return;
    }
    const handoff = createStarterPackAuthoringHandoff(starter.id);
    if (!handoff) {
      setStatusLine("Studio could not map this starter layout into the workbench.");
      return;
    }
    const token = storeModuleAuthoringHandoff(handoff);
    setStatusLine(`${starter.label} starter copied into the template workbench.`);
    navigate(`/templates/new?extract=${token}&stage=${handoff.preferredStage}`);
  }

  return (
    <div className="studio-terminal-root h-screen overflow-y-auto px-6 py-8 text-[var(--studio-ink)]">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-start justify-between gap-6">
          <div>
            <Link
              to="/"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--studio-line)] bg-[rgba(255,255,255,0.03)] px-4 text-sm font-semibold text-[var(--studio-ink)] transition hover:border-[rgba(0,242,255,0.24)] hover:bg-[rgba(0,242,255,0.06)]"
            >
              <ArrowLeft className="h-4 w-4 text-[var(--studio-accent)]" />
              Back to Studio
            </Link>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
              Template Platform
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--studio-ink)]">
              Page templates, draft labs, and reusable shape contracts
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--studio-muted-strong)]">
              Browse reusable page templates, judge their trust and chart support, and open the
              author workspace only when you want to create or refine a shape.
            </p>
          </div>
          <Link
            to="/templates/new"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-[rgba(0,242,255,0.3)] bg-[rgba(0,242,255,0.1)] px-5 text-sm font-semibold text-[var(--studio-ink)] transition hover:bg-[rgba(0,242,255,0.16)]"
          >
            <Plus className="h-4 w-4 text-[var(--studio-accent)]" />
            New template
          </Link>
        </div>

        <div className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                Starter Packs
              </div>
              <div className="mt-2 max-w-3xl text-sm leading-6 text-[var(--studio-muted-strong)]">
                Read-only visual starters from html-ppt-skill. Use them as a launch point for a deck or fork them into the template workbench.
              </div>
            </div>
            <div className="rounded-full border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-muted)]">
              {starterPacks.length} curated starters
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {starterPacks.map((starter) => {
              const theme = getStarterPackTheme(starter.themeId);
              return (
                <div key={starter.id} className="studio-terminal-panel overflow-hidden">
                  <div
                    className={[
                      "border-b px-5 py-4",
                      starter.preview.tone === "dark"
                        ? "border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(12,16,28,0.96)_0%,rgba(7,10,18,0.98)_100%)]"
                        : "border-[var(--studio-line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.02)_100%)]",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                        {starter.preview.eyebrow}
                      </div>
                      <div className="rounded-full border border-[rgba(255,255,255,0.12)] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                        Read only
                      </div>
                    </div>
                    <div className="mt-4 text-lg font-semibold text-[var(--studio-ink)]">
                      {starter.label}
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                      {starter.source} · {theme?.label ?? starter.themeId} · {starter.pageFamily}
                    </div>
                    <div className="mt-4 text-sm leading-6 text-[var(--studio-muted-strong)]">
                      {starter.preview.body}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-px border-y border-[var(--studio-line)] bg-[var(--studio-line)]">
                    <div className="bg-[rgba(255,255,255,0.02)] px-4 py-3">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                        Theme
                      </div>
                      <div className="mt-1 text-sm font-semibold text-[var(--studio-ink)]">
                        {theme?.label ?? starter.themeId}
                      </div>
                    </div>
                    <div className="bg-[rgba(255,255,255,0.02)] px-4 py-3">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                        Family
                      </div>
                      <div className="mt-1 text-sm font-semibold text-[var(--studio-ink)]">
                        {starter.pageFamily}
                      </div>
                    </div>
                  </div>

                  <div className="px-5 py-4 text-[12px] leading-5 text-[var(--studio-muted-strong)]">
                    {starter.description}
                  </div>

                  <div className="flex items-center justify-between gap-2 px-5 pb-5">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                      {starter.kind === "deck" ? `${starter.pageCount ?? 0} pages` : "single-page starter"}
                    </div>
                    {starter.kind === "deck" ? (
                      <button
                        type="button"
                        onClick={() => handleStartDeckStarter(starter.id)}
                        className="inline-flex h-10 items-center gap-2 rounded-full border border-[rgba(0,242,255,0.3)] bg-[rgba(0,242,255,0.1)] px-4 text-sm font-semibold text-[var(--studio-ink)] transition hover:bg-[rgba(0,242,255,0.16)]"
                      >
                        Start deck
                        <ArrowRight className="h-4 w-4 text-[var(--studio-accent)]" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenLayoutStarter(starter.id)}
                        className="inline-flex h-10 items-center gap-2 rounded-full border border-[rgba(0,242,255,0.3)] bg-[rgba(0,242,255,0.1)] px-4 text-sm font-semibold text-[var(--studio-ink)] transition hover:bg-[rgba(0,242,255,0.16)]"
                      >
                        Fork into workbench
                        <ArrowRight className="h-4 w-4 text-[var(--studio-accent)]" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map(({ entry, asset, trust, manifest, isPublicCapability }) => (
            <div key={entry.id} className="studio-terminal-panel overflow-hidden">
              <div className="border-b border-[var(--studio-line)] px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-[var(--studio-ink)]">{entry.label}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                      {entry.family} · {entry.scope} · {entry.status}
                    </div>
                  </div>
                  <div
                    className={[
                      "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                      getCapabilityTone(isPublicCapability, entry.status),
                    ].join(" ")}
                  >
                    {isPublicCapability
                      ? "Public template"
                      : entry.status === "draft"
                      ? "Draft lab"
                      : "Local experimental"}
                  </div>
                </div>
                <div className="mt-3 text-sm leading-6 text-[var(--studio-ink)]">{entry.semanticRole}</div>
                <div className="mt-2 text-[12px] leading-5 text-[var(--studio-muted-strong)]">
                  {entry.description}
                </div>
              </div>

              <div className="bg-[rgba(255,255,255,0.02)] p-3">
                <div className="h-[148px] overflow-hidden rounded-[16px] border border-[var(--studio-line)] bg-[rgba(255,255,255,0.03)] p-2">
                  <PreviewBlock
                    block={buildModulePreviewBlock(entry)}
                    draft={buildModulePreviewDraft(entry)}
                    compact
                    theme="light"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-px border-y border-[var(--studio-line)] bg-[var(--studio-line)]">
                <div className="bg-[rgba(255,255,255,0.02)] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                    Chart support
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[var(--studio-ink)]">
                    {getChartLabel(manifest?.supportedChartKinds ?? [])}
                  </div>
                </div>
                <div className="bg-[rgba(255,255,255,0.02)] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                    Determinism
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[var(--studio-ink)]">
                    {getDeterministicLabel(manifest?.deterministicCapability ?? null)}
                  </div>
                </div>
                <div className="bg-[rgba(255,255,255,0.02)] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                    Passing runs
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[var(--studio-ink)]">
                    {trust.passRuns}
                  </div>
                </div>
                <div className="bg-[rgba(255,255,255,0.02)] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                    Publish count
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[var(--studio-ink)]">
                    {asset?.publishArtifacts.length ?? 0}
                  </div>
                </div>
              </div>

              <div className="px-5 py-4 text-[12px] leading-5 text-[var(--studio-muted-strong)]">
                {manifest?.outputContractSummary?.length
                  ? manifest.outputContractSummary.slice(0, 2).join(" ")
                  : "This template is still forming its public contract. Open the author workspace to refine fields, tests, and release state."}
              </div>

              <div className="flex items-center justify-between gap-2 px-5 pb-5">
                <Link
                  to={`/templates/${entry.id}`}
                  className="inline-flex h-10 items-center rounded-full border border-[var(--studio-line)] px-4 text-sm font-semibold text-[var(--studio-ink)] transition hover:border-[rgba(0,242,255,0.22)] hover:bg-[rgba(0,242,255,0.06)]"
                >
                  View contract
                </Link>
                <div className="flex items-center gap-2">
                  <Link
                    to={entry.scope === "core" ? `/templates/new?from=${encodeURIComponent(entry.id)}` : `/templates/${entry.id}/edit`}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-[rgba(0,242,255,0.3)] bg-[rgba(0,242,255,0.1)] px-4 text-sm font-semibold text-[var(--studio-ink)] transition hover:bg-[rgba(0,242,255,0.16)]"
                  >
                    {entry.scope === "core" ? "Fork into lab" : "Open template"}
                    <ArrowRight className="h-4 w-4 text-[var(--studio-accent)]" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(entry.id, entry.label)}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[rgba(255,100,100,0.35)] bg-[rgba(255,100,100,0.08)] px-3 text-sm font-semibold text-[#ff9e9e] transition hover:bg-[rgba(255,100,100,0.14)]"
                    title="Delete template"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
