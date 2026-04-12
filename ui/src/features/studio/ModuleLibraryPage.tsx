import { useMemo } from "react";
import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import { Link } from "@/lib/router";
import { PreviewBlock } from "./renderers";
import {
  buildModuleTrustSummary,
  getModuleAssetRecord,
  loadPublishedModuleManifests,
} from "./module-assets";
import { buildModulePreviewBlock, buildModulePreviewDraft } from "./authoring/helpers";
import { loadAvailableModuleRegistry } from "./registry";

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
  const modules = useMemo(() => {
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

  return (
    <div className="studio-terminal-root min-h-screen px-6 py-8 text-[var(--studio-ink)]">
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

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                <Link
                  to={entry.scope === "core" ? `/templates/new?from=${encodeURIComponent(entry.id)}` : `/templates/${entry.id}/edit`}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-[rgba(0,242,255,0.3)] bg-[rgba(0,242,255,0.1)] px-4 text-sm font-semibold text-[var(--studio-ink)] transition hover:bg-[rgba(0,242,255,0.16)]"
                >
                  {entry.scope === "core" ? "Fork into lab" : "Open template"}
                  <ArrowRight className="h-4 w-4 text-[var(--studio-accent)]" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
