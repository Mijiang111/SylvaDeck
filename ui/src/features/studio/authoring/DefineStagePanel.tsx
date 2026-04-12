import { Textarea } from "@/components/ui/textarea";
import type {
  ModuleFrameLayout,
  ModuleRegistryEntry,
} from "@/features/studio/types";

type DefineStagePanelProps = {
  draft: ModuleRegistryEntry;
  rendererLabel: string;
  frameContainedCount: number;
  frameOutsideCount: number;
  moduleFrame: Pick<ModuleFrameLayout, "w" | "h">;
  isReady: boolean;
  onOpenLibrary: () => void;
  onCreateFromBlank: () => void;
  onLabelChange: (value: string) => void;
  onSemanticRoleChange: (value: string) => void;
  onPromptHintChange: (value: string) => void;
  onContinue: () => void;
};

export function DefineStagePanel({
  draft,
  rendererLabel,
  frameContainedCount,
  frameOutsideCount,
  moduleFrame,
  isReady,
  onOpenLibrary,
  onCreateFromBlank,
  onLabelChange,
  onSemanticRoleChange,
  onPromptHintChange,
  onContinue,
}: DefineStagePanelProps) {
  return (
    <>
      <section className="border-b border-white/8 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
            Starting point
          </div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
            {draft.scope} · {draft.family}
          </div>
        </div>
        <div className="mt-3 border border-white/8 bg-white/[0.02] px-3 py-3">
          <div className="text-sm font-semibold text-white">{draft.label}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#8ca3b2]">
            {rendererLabel} · {draft.category}
          </div>
          <div className="mt-3 text-[12px] leading-5 text-[#8ca3b2]">
            {draft.semanticRole.trim() ||
              "Choose a base template or start blank, then rewrite the job for this authoring pass."}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onOpenLibrary}
            className="inline-flex h-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-3 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
          >
            Choose base template
          </button>
          <button
            type="button"
            onClick={onCreateFromBlank}
            className="inline-flex h-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-3 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
          >
            Start blank
          </button>
        </div>
        <div className="mt-4 grid gap-2">
          {[
            {
              label: "AI Text",
              detail: "The only default text primitive that AI will fill later.",
            },
            {
              label: "Locked Text",
              detail: "Template-owned copy that stays fixed and never becomes a slot.",
            },
            {
              label: "Data / Chart",
              detail: "Evidence primitives for chart-driven or support-driven templates.",
            },
            {
              label: "Shape / Line",
              detail: "Pure structure and decoration for dividers, containers, and callouts.",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-[16px] border border-white/8 bg-white/[0.02] px-3 py-3"
            >
              <div className="text-sm font-semibold text-white">{item.label}</div>
              <div className="mt-1 text-[12px] leading-5 text-[#8ca3b2]">
                {item.detail}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-b border-white/8 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
            Template frame
          </div>
          <div
            className={[
              "text-[10px] font-semibold uppercase tracking-[0.16em]",
              frameOutsideCount === 0 ? "text-[#68c197]" : "text-[#d8a45f]",
            ].join(" ")}
          >
            {frameOutsideCount === 0 ? "Aligned" : `${frameOutsideCount} out`}
          </div>
        </div>
        <div className="mt-3 border border-white/8 bg-white/[0.02] px-3 py-3">
          <div className="text-sm font-semibold text-white">Edit on canvas</div>
          <div className="mt-2 text-[12px] leading-5 text-[#8ca3b2]">
            Drag the frame from its header. Pull any corner to resize the page
            template boundary.
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="border border-white/8 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
              Inside frame
            </div>
            <div className="mt-1 text-sm font-semibold text-white">
              {frameContainedCount}
            </div>
          </div>
          <div className="border border-white/8 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
              Outside frame
            </div>
            <div className="mt-1 text-sm font-semibold text-white">
              {frameOutsideCount}
            </div>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="border border-white/8 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
              Width
            </div>
            <div className="mt-1 text-sm font-semibold text-white">
              {moduleFrame.w}
            </div>
          </div>
          <div className="border border-white/8 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
              Height
            </div>
            <div className="mt-1 text-sm font-semibold text-white">
              {moduleFrame.h}
            </div>
          </div>
        </div>
        <div className="mt-4 border-l-2 border-white/10 pl-3 text-[12px] leading-5 text-[#8ca3b2]">
          Anything left outside the frame is outside the published page template.
        </div>
      </section>

      <section className="px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
            Template definition
          </div>
          <div
            className={[
              "text-[10px] font-semibold uppercase tracking-[0.16em]",
              isReady ? "text-[#68c197]" : "text-[#d8a45f]",
            ].join(" ")}
          >
            {isReady ? "Ready" : "Needs work"}
          </div>
        </div>
        <div className="mt-3 grid gap-3">
          <label className="block">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
              Label
            </div>
            <input
              value={draft.label}
              onChange={(event) => onLabelChange(event.target.value)}
              className="h-10 w-full border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none transition focus:border-white/20 focus:bg-white/[0.06]"
            />
          </label>
          <label className="block">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
              Purpose
            </div>
            <Textarea
              value={draft.semanticRole}
              onChange={(event) => onSemanticRoleChange(event.target.value)}
              className="min-h-[96px] border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm leading-6 text-white placeholder:text-[#7f95a6]"
            />
          </label>
          <label className="block">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f95a6]">
              AI guidance
            </div>
            <Textarea
              value={draft.promptHint}
              onChange={(event) => onPromptHintChange(event.target.value)}
              className="min-h-[96px] border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm leading-6 text-white placeholder:text-[#7f95a6]"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={onContinue}
          className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-full border border-[#31d4c2]/40 bg-[#31d4c2]/16 px-4 text-sm font-semibold text-[#eafcf8] transition hover:bg-[#31d4c2]/22"
        >
          Continue to compose
        </button>
      </section>
    </>
  );
}
