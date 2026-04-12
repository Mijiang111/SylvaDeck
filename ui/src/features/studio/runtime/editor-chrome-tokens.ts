import { HOMEPAGE_TOKENS } from "./homepage/HomepageThemeTokens";

/**
 * Editor top chrome: reuse homepage segmented-control and field language for visual consistency.
 */
export const EDITOR_CHROME = {
  filterWrap: HOMEPAGE_TOKENS.filterWrap,
  filterItem: HOMEPAGE_TOKENS.filterItem,
  filterItemActive: HOMEPAGE_TOKENS.filterItemActive,
  panelSoft: HOMEPAGE_TOKENS.panelSoft,
  border: HOMEPAGE_TOKENS.border,
  label: HOMEPAGE_TOKENS.label,
  textSoft: HOMEPAGE_TOKENS.textSoft,
  textMuted: HOMEPAGE_TOKENS.textMuted,
  searchField: HOMEPAGE_TOKENS.searchField,

  header:
    "shrink-0 border-b border-white/[0.06] bg-[linear-gradient(180deg,#0c1016_0%,#080b10_100%)] text-[#edf6ff] shadow-[0_20px_50px_rgba(0,0,0,0.32)] backdrop-blur-md",

  homeButton:
    "flex h-10 shrink-0 items-center gap-2 rounded-[14px] border border-white/[0.08] bg-white/[0.04] px-3 text-[12px] font-semibold text-white/90 transition hover:bg-white/[0.07] hover:text-white",

  pagePill:
    "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 text-[11px] font-semibold text-white/55 transition hover:bg-white/[0.05] hover:text-white",

  pagePillActive:
    "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-[#05080c] shadow-[0_8px_20px_rgba(255,255,255,0.06)] ring-1 ring-white/[0.12]",

  overflowBadge:
    "rounded-full bg-amber-500/15 px-1.5 py-px text-[8px] font-bold uppercase tracking-wider text-amber-200 ring-1 ring-amber-400/35",

  primaryCta:
    "rounded-[14px] bg-[#1a2836] px-4 py-2.5 text-[12px] font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.28)] ring-1 ring-white/[0.08] transition hover:bg-[#243545] disabled:cursor-not-allowed disabled:opacity-45",

  secondaryCta:
    "inline-flex items-center justify-center rounded-[14px] border border-white/[0.12] bg-transparent px-4 py-2.5 text-[12px] font-semibold text-white/85 transition hover:bg-white/[0.06] hover:text-white",

  toolbarRow2: "border-t border-white/[0.06] bg-white/[0.02] px-6 py-2.5",

  statusStrip:
    "max-w-[min(420px,32vw)] min-w-0 truncate rounded-[14px] border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[11px] text-white/60",

  fontStrip: `${HOMEPAGE_TOKENS.panelSoft} flex shrink-0 items-center gap-2 px-3 py-2`,

  expandPanel: "border-t border-white/[0.06] bg-white/[0.025] px-6",

  briefField:
    "h-10 w-full rounded-[18px] border border-white/[0.08] bg-white/[0.04] px-3 text-[13px] text-white outline-none placeholder:text-white/24 focus:border-white/[0.14] focus:bg-white/[0.06]",

  briefTextarea:
    "min-h-[112px] w-full rounded-[18px] border border-white/[0.08] bg-white/[0.04] p-3 text-[13px] leading-6 text-white outline-none placeholder:text-white/24 focus:border-white/[0.14] focus:bg-white/[0.06]",

  /** Visual / Layout toolbar panel outer shell (matches header glass language). */
  editorPanelOuter:
    "rounded-[14px] border border-white/[0.08] bg-white/[0.03] shadow-[0_12px_32px_rgba(0,0,0,0.12)]",
} as const;
