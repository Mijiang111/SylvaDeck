import { ArrowLeft } from "lucide-react";
import { Link } from "@/lib/router";
import type { ModuleRegistryEntry } from "@/features/studio/types";
import {
  MODULE_CATEGORY_SHORT_LABEL,
  MODULE_FAMILY_SHORT_LABEL,
  MODULE_SCOPE_SHORT_LABEL,
} from "../authoring-constants";
import type { AuthoringStage, StageState } from "../authoring-local-types";

type StageRailItem = {
  id: AuthoringStage;
  label: string;
  compactDescription: string;
  state: StageState;
};

type AuthoringStageRailProps = {
  view: {
    draft: ModuleRegistryEntry;
    currentRendererLabel: string;
    stageItems: StageRailItem[];
    completedStageCount: number;
    activeStageMeta: StageRailItem & { description?: string };
    activeStageIndex: number;
    nextSuggestedStage: StageRailItem;
    connectionCount: number;
  };
  actions: {
    handleStageChange: (stage: AuthoringStage) => void;
  };
};

export function AuthoringStageRail({ view, actions }: AuthoringStageRailProps) {
  const {
    draft,
    currentRendererLabel,
    stageItems,
    completedStageCount,
    activeStageMeta,
    activeStageIndex,
    nextSuggestedStage,
    connectionCount,
  } = view;
  const { handleStageChange } = actions;

  return (
        <aside className="flex min-h-0 flex-col overflow-hidden border-r border-[var(--studio-line)] bg-[rgba(10,10,10,0.92)]">
          <div className="border-b border-[var(--studio-line)] px-5 py-5">
            <div className="flex items-center gap-3">
              <Link
                to="/templates"
                className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--studio-line)] bg-transparent text-[var(--studio-ink)] transition hover:border-[rgba(0,242,255,0.22)] hover:bg-[rgba(0,242,255,0.06)]"
              >
                <ArrowLeft className="h-4 w-4 text-[var(--studio-accent)]" />
              </Link>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
                  Templates
                </div>
                <div className="mt-1 truncate text-lg font-semibold text-[var(--studio-ink)]">
                  Template workbench
                </div>
              </div>
            </div>
            <div className="mt-4">
              <div className="truncate text-base font-semibold text-[var(--studio-ink)]">
                {draft.label}
              </div>
              <div className="mt-1 text-[11px] text-[var(--studio-muted)]">
                {currentRendererLabel} · {draft.fields.length} blocks
              </div>
            </div>
          </div>

          <div className="border-b border-[var(--studio-line)] px-5 py-4">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
              Workflow
            </div>
            <div className="border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--studio-ink)]">
                    {completedStageCount}/{stageItems.length} complete
                  </div>
                  <div className="mt-1 text-[12px] leading-5 text-[var(--studio-muted-strong)]">
                    Next focus: {nextSuggestedStage.label}
                  </div>
                </div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--studio-muted)]">
                  Step {activeStageIndex + 1}
                </div>
              </div>
              <div className="mt-3 h-1.5 bg-[rgba(255,255,255,0.08)]">
                <div
                  className="h-full bg-[var(--studio-accent)]"
                  style={{
                    width: `${Math.max(
                      12,
                      ((completedStageCount +
                        (activeStageMeta.state === "active" ? 0.5 : 0)) /
                        stageItems.length) *
                        100
                    )}%`,
                  }}
                />
              </div>
            </div>
            <div className="mt-4 space-y-0">
              {stageItems.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleStageChange(item.id)}
                  className={[
                    "grid w-full grid-cols-[34px_minmax(0,1fr)_auto] items-start gap-3 px-2 py-2.5 text-left transition",
                    item.state === "active"
                      ? "bg-white/[0.05]"
                      : "hover:bg-white/[0.03]",
                  ].join(" ")}
                >
                  <span className="relative flex flex-col items-center">
                    <span
                      className={[
                        "inline-flex h-8 w-8 items-center justify-center border text-[10px] font-semibold uppercase tracking-[0.14em]",
                        item.state === "active"
                          ? "border-white bg-white text-[#0b1117]"
                          : item.state === "complete"
                          ? "border-[#68c197] bg-[#68c197]/12 text-[#9ee0bc]"
                          : item.state === "warning"
                          ? "border-[#d8a45f] bg-[#d8a45f]/10 text-[#e7c488]"
                          : "border-white/10 bg-transparent text-[#627987]",
                      ].join(" ")}
                    >
                      {(index + 1).toString().padStart(2, "0")}
                    </span>
                    {index < stageItems.length - 1 ? (
                      <span
                        className={[
                          "mt-2 h-8 w-px",
                          index < activeStageIndex
                            ? "bg-white/50"
                            : "bg-white/10",
                        ].join(" ")}
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12px] font-semibold text-white">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-5 text-[#7f95a6]">
                      {item.compactDescription}
                    </span>
                  </span>
                  <span
                    className={[
                      "pt-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                      item.state === "active"
                        ? "text-white"
                        : item.state === "complete"
                        ? "text-[#68c197]"
                        : item.state === "warning"
                        ? "text-[#d8a45f]"
                        : "text-[#627987]",
                    ].join(" ")}
                  >
                    {item.state === "active"
                      ? "Current"
                      : item.state === "complete"
                      ? "Ready"
                      : item.state === "warning"
                      ? "Needs work"
                      : "Pending"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-b border-white/8 px-5 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
              Current template
            </div>
            <div className="mt-3 border border-white/8 bg-white/[0.02] px-3 py-3">
              <div className="text-sm font-semibold text-white">
                {draft.label}
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#8ca3b2]">
                {MODULE_SCOPE_SHORT_LABEL[draft.scope]} ·{" "}
                {MODULE_FAMILY_SHORT_LABEL[draft.family]} ·{" "}
                {MODULE_CATEGORY_SHORT_LABEL[draft.category]}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="border border-white/8 px-2 py-2 text-center">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
                    Renderer
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-white">
                    {currentRendererLabel}
                  </div>
                </div>
                <div className="border border-white/8 px-2 py-2 text-center">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
                    Blocks
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-white">
                    {draft.fields.length}
                  </div>
                </div>
                <div className="border border-white/8 px-2 py-2 text-center">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
                    Links
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-white">
                    {connectionCount}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1" />
        </aside>
  );
}
