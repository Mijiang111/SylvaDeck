import type { DeckTemplatePackPage } from "@/features/studio/types";

type PptxSlideImportModalProps = {
  fileName: string;
  isOpen: boolean;
  isReplacingCurrentDraft: boolean;
  pages: DeckTemplatePackPage[];
  selectedPageId: string | null;
  onClose: () => void;
  onSelectPage: (pageId: string) => void;
  onImportSelected: () => void;
};

export function PptxSlideImportModal({
  fileName,
  isOpen,
  isReplacingCurrentDraft,
  pages,
  selectedPageId,
  onClose,
  onSelectPage,
  onImportSelected,
}: PptxSlideImportModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[rgba(2,2,2,0.78)] px-6 py-8 backdrop-blur-sm">
      <div className="max-h-full w-full max-w-5xl overflow-hidden rounded-[28px] border border-[var(--studio-line)] bg-[rgba(8,8,8,0.96)] shadow-[0_36px_120px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-6 border-b border-[var(--studio-line)] px-6 py-5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--studio-muted)]">
              Import PPTX
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--studio-ink)]">
              Pick one slide for the current template draft
            </div>
            <div className="mt-2 text-sm leading-6 text-[var(--studio-muted-strong)]">
              {fileName} · parsed {pages.length} slide{pages.length === 1 ? "" : "s"}.
              {isReplacingCurrentDraft
                ? " Importing will replace the current draft on this canvas."
                : " Importing will initialize this draft directly on the current canvas."}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--studio-line)] px-4 text-sm font-semibold text-[var(--studio-ink)] transition hover:bg-[rgba(255,255,255,0.05)]"
          >
            Close
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pages.map((page) => {
              const isSelected = page.id === selectedPageId;
              return (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => onSelectPage(page.id)}
                  className={[
                    "rounded-[22px] border p-4 text-left transition",
                    isSelected
                      ? "border-[rgba(0,242,255,0.34)] bg-[rgba(0,242,255,0.08)]"
                      : "border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.16)] hover:bg-[rgba(255,255,255,0.04)]",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--studio-muted)]">
                        Slide {page.pageNumber}
                      </div>
                      <div className="mt-2 text-lg font-semibold text-[var(--studio-ink)]">
                        {page.title}
                      </div>
                    </div>
                    <div
                      className={[
                        "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                        page.unresolvedObjectIds.length > 0
                          ? "border border-[rgba(216,164,95,0.3)] bg-[rgba(216,164,95,0.12)] text-[#f3c992]"
                          : "border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] text-[var(--studio-muted-strong)]",
                      ].join(" ")}
                    >
                      {page.pageRole}
                    </div>
                  </div>

                  <div className="mt-3 text-[13px] leading-6 text-[var(--studio-muted-strong)]">
                    {page.briefHint}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] leading-5 text-[var(--studio-muted)]">
                    <div className="rounded-[16px] border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-3 py-2">
                      <div className="uppercase tracking-[0.16em]">Objects</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--studio-ink)]">
                        {page.sourceObjects.length}
                      </div>
                    </div>
                    <div className="rounded-[16px] border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-3 py-2">
                      <div className="uppercase tracking-[0.16em]">Semantic slots</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--studio-ink)]">
                        {page.semanticSlots.length}
                      </div>
                    </div>
                    <div className="rounded-[16px] border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-3 py-2">
                      <div className="uppercase tracking-[0.16em]">Warnings</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--studio-ink)]">
                        {page.warnings.length}
                      </div>
                    </div>
                    <div className="rounded-[16px] border border-[var(--studio-line)] bg-[rgba(255,255,255,0.02)] px-3 py-2">
                      <div className="uppercase tracking-[0.16em]">Needs review</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--studio-ink)]">
                        {page.unresolvedObjectIds.length}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-[var(--studio-line)] px-6 py-5">
          <div className="text-[12px] leading-5 text-[var(--studio-muted-strong)]">
            Imported objects stay editable on the same canvas. Unsupported placeholders will block
            publish until you delete or replace them.
          </div>
          <button
            type="button"
            onClick={onImportSelected}
            disabled={!selectedPageId}
            className="inline-flex h-11 items-center justify-center rounded-full border border-[rgba(0,242,255,0.3)] bg-[rgba(0,242,255,0.1)] px-5 text-sm font-semibold text-[var(--studio-ink)] transition hover:bg-[rgba(0,242,255,0.16)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Import selected slide
          </button>
        </div>
      </div>
    </div>
  );
}
