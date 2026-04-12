import {
  FolderOpen,
  MessageSquareMore,
  Presentation,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HOMEPAGE_TOKENS } from "./HomepageThemeTokens";
import type { HomeSection } from "./types";

const NAV_ITEMS: Array<{
  id: HomeSection;
  label: string;
  icon: typeof FolderOpen;
}> = [
  { id: "library", label: "Library", icon: FolderOpen },
  { id: "ai", label: "AI", icon: MessageSquareMore },
  { id: "author", label: "Author", icon: Wrench },
];

export function HomeSidebar({
  workspaceName,
  activeSection,
  onSelectSection,
}: {
  workspaceName: string;
  activeSection: HomeSection;
  onSelectSection: (section: HomeSection) => void;
}) {
  return (
    <aside className={HOMEPAGE_TOKENS.sidebar}>
      <button
        type="button"
        onClick={() => onSelectSection("library")}
        className="flex w-full items-center gap-3 rounded-[18px] px-2 py-2 text-left transition hover:bg-white/[0.03]"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.03))] text-white shadow-[0_18px_32px_rgba(0,0,0,0.32)]">
          <Presentation className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">PPT Studio</div>
          <div className="truncate text-[11px] text-white/38">{workspaceName}</div>
        </div>
      </button>

      <div className="mt-8 space-y-1.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              className={cn(
                HOMEPAGE_TOKENS.navItem,
                activeSection === item.id && HOMEPAGE_TOKENS.navItemActive,
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto rounded-[20px] border border-white/[0.06] bg-white/[0.03] px-4 py-4">
        <div className={HOMEPAGE_TOKENS.label}>Workspace</div>
        <div className="mt-2 text-[15px] font-semibold text-white">{workspaceName}</div>
        <div className="mt-1 text-[12px] leading-6 text-white/42">
          Reports live here first. Open the library to browse, then jump into a report workspace only when you need to edit.
        </div>
      </div>
    </aside>
  );
}
