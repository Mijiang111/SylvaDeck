import { useMemo } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "@/lib/router";
import { PreviewBlock } from "./renderers";
import {
  buildModuleTrustSummary,
  getModuleAssetRecord,
  loadPublishedModuleManifests,
} from "./module-assets";
import { buildModulePreviewBlock, buildModulePreviewDraft } from "./authoring/helpers";
import { getAvailableModuleRegistryEntryById } from "./registry";

function getDeterministicLabel(value: string | null) {
  if (value === "native") return "Native";
  if (value === "hybrid") return "Hybrid";
  if (value === "flow") return "Flow";
  if (value === "fallback") return "Fallback";
  return "Draft";
}

export function ModuleDetailPage({ moduleId }: { moduleId: string }) {
  const entry = useMemo(
    () => getAvailableModuleRegistryEntryById(moduleId),
    [moduleId]
  );
  const asset = useMemo(() => getModuleAssetRecord(moduleId), [moduleId]);
  const manifest = useMemo(
    () => loadPublishedModuleManifests().find((item) => item.moduleId === moduleId) ?? asset?.publishedManifest ?? null,
    [asset, moduleId]
  );
  const trust = useMemo(() => buildModuleTrustSummary(asset), [asset]);

  if (!entry) {
    return (
      <div className="studio-terminal-root min-h-screen px-6 py-10 text-[var(--studio-ink)]">
        <div className="studio-terminal-panel mx-auto max-w-3xl p-8">
          <div className="text-lg font-semibold">Template not found</div>
          <div className="mt-3 text-sm leading-6 text-[var(--studio-muted-strong)]">
            The requested template id does not exist in the current template platform.
          </div>
          <Link
            to="/templates"
            className="mt-6 inline-flex h-10 items-center rounded-full border border-[var(--studio-line)] px-4 text-sm font-semibold text-[var(--studio-ink)] transition hover:border-[rgba(0,242,255,0.22)] hover:bg-[rgba(0,242,255,0.06)]"
          >
            Back to templates
          </Link>
        </div>
      </div>
    );
  }

  const isPublicCapability = Boolean(manifest);

  return (
    <div className="studio-terminal-root min-h-screen px-6 py-8 text-[var(--studio-ink)]">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/templates"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--studio-line)] px-4 text-sm font-semibold text-[var(--studio-ink)] transition hover:border-[rgba(0,242,255,0.22)] hover:bg-[rgba(0,242,255,0.06)]"
          >
            <ArrowLeft className="h-4 w-4 text-[var(--studio-accent)]" />
            Back to templates
          </Link>
          <Link
            to={
              entry.scope === "core"
                ? `/templates/new?from=${encodeURIComponent(entry.id)}`
                : `/templates/${entry.id}/edit`
            }
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[rgba(0,242,255,0.3)] bg-[rgba(0,242,255,0.1)] px-4 text-sm font-semibold text-[var(--studio-ink)] transition hover:bg-[rgba(0,242,255,0.16)]"
          >
            {entry.scope === "core" ? "Fork into lab" : "Open template"}
            <ArrowRight className="h-4 w-4 text-[var(--studio-accent)]" />
          </Link>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="studio-terminal-panel p-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
              Template contract
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--studio-ink)]">
              {entry.label}
            </div>
            <div className="mt-2 text-sm uppercase tracking-[0.18em] text-[var(--studio-muted)]">
              {entry.family} · {entry.scope} · {entry.status}
            </div>
            <div className="mt-4 text-sm leading-7 text-[var(--studio-ink)]">
              {entry.semanticRole}
            </div>
            <div className="mt-3 text-sm leading-7 text-[var(--studio-muted-strong)]">
              {entry.description}
            </div>

            <div className="mt-6 overflow-hidden rounded-[20px] border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] p-3">
              <div className="h-[260px] overflow-hidden rounded-[16px] bg-[rgba(255,255,255,0.03)] p-2">
                <PreviewBlock
                  block={buildModulePreviewBlock(entry)}
                  draft={buildModulePreviewDraft(entry)}
                  compact
                  theme="light"
                />
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <div className="border border-[var(--studio-line)] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                  Public state
                </div>
                <div className="mt-1 text-lg font-semibold text-[var(--studio-ink)]">
                  {isPublicCapability
                    ? "Public template"
                    : entry.status === "draft"
                    ? "Draft lab"
                    : "Experimental lane"}
                </div>
              </div>
              <div className="border border-[var(--studio-line)] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                  Determinism
                </div>
                <div className="mt-1 text-lg font-semibold text-[var(--studio-ink)]">
                  {getDeterministicLabel(manifest?.deterministicCapability ?? null)}
                </div>
              </div>
              <div className="border border-[var(--studio-line)] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                  Chart support
                </div>
                <div className="mt-1 text-lg font-semibold text-[var(--studio-ink)]">
                  {manifest?.supportedChartKinds?.length
                    ? manifest.supportedChartKinds.join(" / ").toUpperCase()
                    : "Narrative"}
                </div>
              </div>
              <div className="border border-[var(--studio-line)] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                  Trust score
                </div>
                <div className="mt-1 text-lg font-semibold text-[var(--studio-ink)]">
                  {manifest ? `${Math.round(manifest.trustScore * 100)} / 100` : "Not published"}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="studio-terminal-panel p-6">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                Reuse signal
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="border border-[var(--studio-line)] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                    Test cases
                  </div>
                  <div className="mt-1 text-lg font-semibold text-[var(--studio-ink)]">
                    {trust.totalTestCases}
                  </div>
                </div>
                <div className="border border-[var(--studio-line)] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                    Test runs
                  </div>
                  <div className="mt-1 text-lg font-semibold text-[var(--studio-ink)]">
                    {trust.totalTestRuns}
                  </div>
                </div>
                <div className="border border-[var(--studio-line)] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                    Passing runs
                  </div>
                  <div className="mt-1 text-lg font-semibold text-[var(--studio-ink)]">
                    {trust.passRuns}
                  </div>
                </div>
                <div className="border border-[var(--studio-line)] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                    Publish artifacts
                  </div>
                  <div className="mt-1 text-lg font-semibold text-[var(--studio-ink)]">
                    {asset?.publishArtifacts.length ?? 0}
                  </div>
                </div>
              </div>
              <div className="mt-4 border-l-2 border-[rgba(0,242,255,0.24)] pl-3 text-sm leading-6 text-[var(--studio-muted-strong)]">
                {isPublicCapability
                  ? "This template has crossed the trust threshold for public reuse. The generator may now route work toward its shape when the page need matches."
                  : "This template is still in a draft or experimental lane. It can be refined and tested in authoring, but it does not yet act as a public shape contract in the generation chain."}
              </div>
            </div>

            <div className="studio-terminal-panel p-6">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                Output contract
              </div>
              <div className="mt-4 space-y-3">
                {manifest?.outputContractSummary?.length ? (
                  manifest.outputContractSummary.map((item, index) => (
                    <div key={`${item}-${index}`} className="border border-[var(--studio-line)] px-4 py-3 text-sm leading-6 text-[var(--studio-muted-strong)]">
                      {item}
                    </div>
                  ))
                ) : (
                  <div className="border border-dashed border-[var(--studio-line)] px-4 py-4 text-sm leading-6 text-[var(--studio-muted-strong)]">
                    No public output contract yet. Open authoring to define fields, output goals, and publish artifacts.
                  </div>
                )}
              </div>
            </div>

            <div className="studio-terminal-panel p-6">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                Recent evidence
              </div>
              <div className="mt-4 space-y-3">
                {asset?.testRuns.slice(0, 3).map((run) => (
                  <div
                    key={run.id}
                    className="border border-[var(--studio-line)] px-4 py-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-[var(--studio-ink)]">{run.caseId}</div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                        {run.result}
                      </div>
                    </div>
                    <div className="mt-2 text-[12px] leading-5 text-[var(--studio-muted-strong)]">
                      {run.evaluation.notes.slice(0, 2).join(" ")}
                    </div>
                  </div>
                ))}
                {(!asset || asset.testRuns.length === 0) && (
                  <div className="border border-dashed border-[var(--studio-line)] px-4 py-4 text-sm leading-6 text-[var(--studio-muted-strong)]">
                    No saved test evidence yet. Open authoring to run reusable verification cases and publish artifacts.
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
