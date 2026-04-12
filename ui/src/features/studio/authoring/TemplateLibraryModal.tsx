import { Search } from "lucide-react";
import {
  BLOCK_KIND_PRESETS,
  MODULE_LIBRARY_COLLECTIONS,
} from "@/features/studio/config";
import { PreviewBlock } from "@/features/studio/renderers";
import type { ModuleRegistryEntry } from "@/features/studio/types";
import {
  buildModulePreviewBlock,
  buildModulePreviewDraft,
} from "./helpers";

type TemplateLibraryModalProps = {
  isOpen: boolean;
  searchQuery: string;
  selectedCollection: (typeof MODULE_LIBRARY_COLLECTIONS)[number]["id"];
  draft: ModuleRegistryEntry;
  recentModules: ModuleRegistryEntry[];
  recommendedBaseModules: ModuleRegistryEntry[];
  filteredModules: ModuleRegistryEntry[];
  onClose: () => void;
  onCreateFromBlank: () => void;
  onOpenEntry: (entry: ModuleRegistryEntry) => void;
  onSearchQueryChange: (value: string) => void;
  onSelectedCollectionChange: (
    collectionId: (typeof MODULE_LIBRARY_COLLECTIONS)[number]["id"]
  ) => void;
};

export function TemplateLibraryModal({
  isOpen,
  searchQuery,
  selectedCollection,
  draft,
  recentModules,
  recommendedBaseModules,
  filteredModules,
  onClose,
  onCreateFromBlank,
  onOpenEntry,
  onSearchQueryChange,
  onSelectedCollectionChange,
}: TemplateLibraryModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-40 bg-[#0b1117]/45 p-6" onClick={onClose}>
      <div
        className="absolute inset-x-6 bottom-24 mx-auto flex max-h-[72vh] w-full max-w-[980px] flex-col overflow-hidden border border-white/10 bg-[#0f151b] shadow-[0_28px_90px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-white/8 px-5 py-4">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
              Template library
            </div>
            <div className="mt-1 text-sm text-[#c4d4dd]">
              Choose a base template, then continue in Frame before building the
              layout.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCreateFromBlank}
              className="inline-flex h-10 items-center justify-center border border-white/10 bg-transparent px-3 text-sm font-semibold text-white transition hover:bg-white/[0.05]"
            >
              Start blank
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center border border-white/10 bg-transparent px-3 text-sm font-semibold text-white transition hover:bg-white/[0.05]"
            >
              Close
            </button>
          </div>
        </div>

        <div className="border-b border-white/8 px-5 py-4">
          <div className="flex items-center gap-3 border-b border-white/10 pb-3">
            <Search className="h-4 w-4 text-[#6f8796]" />
            <input
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Search templates"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[#6f8796]"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {MODULE_LIBRARY_COLLECTIONS.map((collection) => (
              <button
                key={collection.id}
                type="button"
                onClick={() => onSelectedCollectionChange(collection.id)}
                className={[
                  "border-b px-0 pb-1 text-left text-[11px] font-semibold uppercase tracking-[0.16em] transition",
                  selectedCollection === collection.id
                    ? "border-white text-white"
                    : "border-transparent text-[#8ca3b2] hover:text-white",
                ].join(" ")}
              >
                {collection.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="grid gap-5 border-b border-white/8 pb-5">
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
                  Recently used
                </div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
                  {recentModules.length}
                </div>
              </div>
              {recentModules.length > 0 ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {recentModules.slice(0, 4).map((entry) => (
                    <button
                      key={`recent-${entry.id}`}
                      type="button"
                      onClick={() => onOpenEntry(entry)}
                      className="grid grid-cols-[64px_minmax(0,1fr)] items-start gap-3 border border-white/8 px-3 py-3 text-left transition hover:border-white/12 hover:bg-white/[0.03]"
                    >
                      <div className="overflow-hidden border border-[#d7d0c4] bg-[#f4efe7] p-1">
                        <div className="h-[48px] overflow-hidden bg-[#f4efe7]">
                          <PreviewBlock
                            block={buildModulePreviewBlock(entry)}
                            draft={buildModulePreviewDraft(entry)}
                            compact
                            theme="light"
                          />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">
                          {entry.label}
                        </div>
                        <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#8ca3b2]">
                          {entry.category}
                        </div>
                        <div className="mt-1 truncate text-[12px] text-[#738897]">
                          {entry.scope} · {entry.family}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="border border-dashed border-white/10 px-4 py-4 text-sm leading-6 text-[#8ca3b2]">
                  Your recent base templates will appear here after you open
                  them from the library.
                </div>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
                  Recommended bases
                </div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
                  matched to current draft
                </div>
              </div>
              {recommendedBaseModules.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {recommendedBaseModules.map((entry) => (
                    <button
                      key={`recommended-${entry.id}`}
                      type="button"
                      onClick={() => onOpenEntry(entry)}
                      className="border border-white/8 px-3 py-3 text-left transition hover:border-white/12 hover:bg-white/[0.03]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white">
                            {entry.label}
                          </div>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#8ca3b2]">
                            {entry.category}
                          </div>
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
                          {entry.scope}
                        </div>
                      </div>
                      <div className="mt-2 text-[12px] leading-5 text-[#9cb2be]">
                        {entry.semanticRole ||
                          entry.description ||
                          "No template purpose defined yet."}
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[#738897]">
                        <span>{BLOCK_KIND_PRESETS[entry.kind].label}</span>
                        <span>•</span>
                        <span>{entry.family}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="border border-dashed border-white/10 px-4 py-4 text-sm leading-6 text-[#8ca3b2]">
                  Open a few templates first and the library will start
                  recommending nearby bases.
                </div>
              )}
            </section>
          </div>

          <div className="mt-5 mb-3 flex items-center justify-between gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f95a6]">
              Browse all
            </div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-[#627987]">
              {filteredModules.length} results
            </div>
          </div>
          {filteredModules.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {filteredModules.map((entry) => {
                const cardBlock = buildModulePreviewBlock(entry);
                const cardDraft = buildModulePreviewDraft(entry);
                const isActive = draft.id === entry.id;

                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => onOpenEntry(entry)}
                    className={[
                      "grid grid-cols-[88px_minmax(0,1fr)] items-start gap-3 border px-3 py-3 text-left transition",
                      isActive
                        ? "border-white bg-white/[0.06]"
                        : "border-white/8 hover:border-white/12 hover:bg-white/[0.03]",
                    ].join(" ")}
                  >
                    <div className="overflow-hidden border border-[#d7d0c4] bg-[#f4efe7] p-1">
                      <div className="h-[68px] overflow-hidden bg-[#f4efe7]">
                        <PreviewBlock
                          block={cardBlock}
                          draft={cardDraft}
                          compact
                          theme="light"
                        />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">
                        {entry.label}
                      </div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#8ca3b2]">
                        {entry.category}
                      </div>
                      <div className="mt-2 text-[12px] leading-5 text-[#738897]">
                        {entry.scope} · {entry.family}
                      </div>
                      <div className="mt-2 line-clamp-3 text-[12px] leading-5 text-[#9cb2be]">
                        {entry.semanticRole ||
                          entry.description ||
                          "No template purpose defined yet."}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="border border-dashed border-white/10 px-5 py-8 text-center text-sm leading-6 text-[#8ca3b2]">
              No templates match this collection and search.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
