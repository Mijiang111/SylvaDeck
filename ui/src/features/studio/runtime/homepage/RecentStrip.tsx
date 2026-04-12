import type { LibraryCardRecord } from "./types";
import { LibraryReportCard } from "./LibraryReportCard";

export function RecentStrip({
  entries,
  currentProjectId,
  onOpenProject,
}: {
  entries: LibraryCardRecord[];
  currentProjectId: string;
  onOpenProject: (projectId: string, workspaceId: string) => void;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="mb-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8797a3]">
          Recent
        </div>
        <div className="mt-2 text-[1.5rem] font-semibold tracking-[-0.03em] text-white">
          Open where you left off
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => (
          <LibraryReportCard
            key={`recent-${entry.project.id}`}
            entry={entry}
            featured
            selected={entry.project.id === currentProjectId}
            onOpen={() => onOpenProject(entry.project.id, entry.project.workspaceId)}
          />
        ))}
      </div>
    </section>
  );
}
