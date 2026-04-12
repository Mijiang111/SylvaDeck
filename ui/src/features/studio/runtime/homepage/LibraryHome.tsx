import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { HOMEPAGE_TOKENS } from "./HomepageThemeTokens";
import { LibraryReportCard } from "./LibraryReportCard";
import { RecentStrip } from "./RecentStrip";
import type { LibraryCardRecord, LibraryView } from "./types";

const VIEW_OPTIONS: Array<{ id: LibraryView; label: string }> = [
  { id: "recent", label: "Recent" },
  { id: "all", label: "All" },
  { id: "published", label: "Published" },
];

export function LibraryHome({
  query,
  view,
  onQueryChange,
  onViewChange,
  currentProjectId,
  recentEntries,
  gridEntries,
  onOpenProject,
}: {
  query: string;
  view: LibraryView;
  onQueryChange: (value: string) => void;
  onViewChange: (view: LibraryView) => void;
  currentProjectId: string;
  recentEntries: LibraryCardRecord[];
  gridEntries: LibraryCardRecord[];
  onOpenProject: (projectId: string, workspaceId: string) => void;
}) {
  const isSearching = query.trim().length > 0;

  return (
    <div className="flex min-h-[78vh] flex-col">
      <div className="mb-8 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <div className={HOMEPAGE_TOKENS.label}>Library</div>
          <div className="mt-3 text-[3rem] font-semibold tracking-[-0.06em] text-white">
            Your reports, without the clutter.
          </div>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-white/42">
            Open recent work, revisit published pieces, and treat the homepage like a real file browser instead of a control panel.
          </p>
        </div>

        <div className="flex w-full max-w-[520px] flex-col gap-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/24" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search reports and workspaces"
              className={HOMEPAGE_TOKENS.searchField}
            />
          </label>
          <div className={HOMEPAGE_TOKENS.filterWrap}>
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onViewChange(option.id)}
                className={cn(
                  HOMEPAGE_TOKENS.filterItem,
                  view === option.id && HOMEPAGE_TOKENS.filterItemActive,
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!isSearching && recentEntries.length > 0 ? (
        <div className="mb-10">
          <RecentStrip
            entries={recentEntries}
            currentProjectId={currentProjectId}
            onOpenProject={onOpenProject}
          />
        </div>
      ) : null}

      <section className="min-h-0 flex-1">
        <div className="mb-5">
          <div className={HOMEPAGE_TOKENS.label}>
            {isSearching ? "Results" : view === "published" ? "Published" : "Library"}
          </div>
          <div className="mt-2 text-[1.35rem] font-semibold tracking-[-0.03em] text-white">
            {isSearching
              ? "Filtered results"
              : view === "recent"
                ? "More in your library"
                : view === "published"
                  ? "Published reports"
                  : "All reports"}
          </div>
        </div>

        {gridEntries.length === 0 ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-[28px] border border-white/[0.08] bg-white/[0.04]">
            <div className="text-center">
              <div className="text-lg font-semibold text-white">No reports here yet.</div>
              <div className="mt-2 text-sm leading-6 text-white/40">
                Try a different view or create a new report from AI.
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 pb-4 md:grid-cols-2 xl:grid-cols-3">
            {gridEntries.map((entry) => (
              <LibraryReportCard
                key={`library-${entry.project.id}`}
                entry={entry}
                selected={entry.project.id === currentProjectId}
                onOpen={() => onOpenProject(entry.project.id, entry.project.workspaceId)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
