export const HOMEPAGE_TOKENS = {
  shell:
    "h-screen overflow-hidden bg-[#040608] text-white",
  sidebar:
    "w-[276px] shrink-0 border-r border-white/[0.06] bg-[linear-gradient(180deg,#090d12_0%,#06080b_100%)] px-4 py-5 text-[#edf2f6]",
  main:
    "relative flex min-w-0 flex-1 overflow-hidden bg-[#040608]",
  canvas:
    "relative z-10 mx-auto flex h-full w-full max-w-[1520px] flex-col px-8 py-8 xl:px-10",
  navItem:
    "flex w-full items-center gap-3 rounded-[16px] px-3 py-3 text-left text-sm font-medium text-white/58 transition hover:bg-white/[0.04] hover:text-white",
  navItemActive:
    "bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.08))] text-white shadow-[0_14px_28px_rgba(0,0,0,0.24)] ring-1 ring-white/[0.08]",
  panel:
    "rounded-[26px] border border-white/[0.08] bg-white/[0.04] shadow-[0_30px_80px_rgba(0,0,0,0.34)] backdrop-blur-xl",
  panelSoft:
    "rounded-[22px] border border-white/[0.06] bg-white/[0.03]",
  border: "border-white/[0.08]",
  textMuted: "text-white/48",
  textSoft: "text-white/64",
  label: "text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8797a3]",
  title: "text-[2.7rem] font-semibold tracking-[-0.05em] text-white",
  titleCompact: "text-[1.25rem] font-semibold tracking-[-0.03em] text-white",
  canvasGlow:
    "pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(107,124,148,0.18)_0%,rgba(4,6,8,0)_34%),radial-gradient(circle_at_84%_10%,rgba(42,57,75,0.18)_0%,rgba(4,6,8,0)_28%),linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0))]",
  canvasNoise:
    "pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_center,rgba(255,255,255,0.2)_0.55px,transparent_0.7px)] [background-size:190px_190px]",
  searchField:
    "h-12 w-full rounded-[18px] border border-white/[0.08] bg-white/[0.04] pl-11 pr-4 text-[13px] text-white outline-none placeholder:text-white/24 focus:border-white/[0.14] focus:bg-white/[0.06]",
  filterWrap:
    "inline-flex items-center gap-2 rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-1.5",
  filterItem:
    "rounded-[14px] px-4 py-2.5 text-[12px] font-semibold text-white/52 transition hover:bg-white/[0.05] hover:text-white",
  filterItemActive:
    "bg-white text-[#05080c] shadow-[0_10px_24px_rgba(255,255,255,0.08)]",
};
