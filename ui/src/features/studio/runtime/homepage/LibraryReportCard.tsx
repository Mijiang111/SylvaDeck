import { ExternalLink, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { HtmlReportThumbnail } from "../runtime-report-views";
import { formatProjectTimestamp } from "../runtime-presentational";
import { HOMEPAGE_TOKENS } from "./HomepageThemeTokens";
import type { LibraryCardRecord } from "./types";

export function LibraryReportCard({
  entry,
  selected,
  featured = false,
  onOpen,
  onDelete,
}: {
  entry: LibraryCardRecord;
  selected: boolean;
  featured?: boolean;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative flex w-full min-w-0 flex-col overflow-hidden rounded-[26px] border text-left transition",
        selected
          ? "border-[rgba(0,242,255,0.32)] bg-[rgba(0,242,255,0.08)] shadow-[0_26px_54px_rgba(0,0,0,0.38)]"
          : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.14)] hover:bg-[rgba(255,255,255,0.05)]",
      )}
    >
      <button type="button" onClick={onOpen} className="flex w-full min-w-0 flex-col text-left">
        <div className="relative w-full overflow-hidden">
          {entry.htmlReport ? (
            <HtmlReportThumbnail htmlReport={entry.htmlReport} />
          ) : (
            <div className="aspect-[16/9] bg-[linear-gradient(180deg,#0b1017_0%,#05070c_100%)]" />
          )}
          <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-2">
            <div className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.64)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/74">
              {entry.project.workspaceName}
            </div>
            {entry.isPublished ? (
              <div className="rounded-full border border-[rgba(0,242,255,0.22)] bg-[rgba(0,242,255,0.12)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
                Published
              </div>
            ) : null}
          </div>
        </div>

        <div className={cn("px-5 py-4", featured && "px-6 py-5")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={cn(featured ? "text-[20px]" : "text-[16px]", "truncate font-semibold text-white")}>
                {entry.project.projectName}
              </div>
              <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-white/42">
                {entry.project.coverSubtitle}
              </div>
            </div>
            <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-white/26 transition group-hover:text-[#00f2ff]" />
          </div>

          <div className="mt-4 flex items-center gap-2 text-[11px] text-white/36">
            <span>{entry.project.pageCount} pages</span>
            <span className="text-white/16">•</span>
            <span>Edited {formatProjectTimestamp(entry.project.updatedAt)}</span>
          </div>
        </div>
      </button>

      {onDelete ? (
        <button
          type="button"
          aria-label={`Delete ${entry.project.projectName}`}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          className="absolute bottom-4 right-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(255,120,120,0.18)] bg-[rgba(20,10,10,0.84)] text-white/60 transition hover:border-[rgba(255,120,120,0.34)] hover:bg-[rgba(255,120,120,0.12)] hover:text-[#ffc4c4]"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
