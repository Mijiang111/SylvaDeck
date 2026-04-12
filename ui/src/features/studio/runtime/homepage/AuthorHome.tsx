import { FolderOpen, PenSquare, Scale, Sparkles } from "lucide-react";
import { HOMEPAGE_TOKENS } from "./HomepageThemeTokens";

const AUTHOR_ENTRIES = [
  {
    title: "Template packs",
    description: "Create reusable visual systems, report shells, and brand-ready starting points.",
    href: "/templates",
    icon: Sparkles,
  },
  {
    title: "Page grammars",
    description: "Define page-level layout recipes that Codex can reuse without dragging generation back into a heavy chain.",
    href: "/templates/new",
    icon: PenSquare,
  },
  {
    title: "Chart recipes",
    description: "Capture chart and annotation patterns for recurring report types and richer visual evidence.",
    href: "/templates",
    icon: Scale,
  },
  {
    title: "Critic rules",
    description: "Author quality checks that keep generated decks sharp, readable, and publishable.",
    href: "/",
    icon: FolderOpen,
  },
] as const;

export function AuthorHome() {
  return (
    <div className="flex min-h-[78vh] flex-col justify-center">
      <div className="max-w-4xl">
        <div className={HOMEPAGE_TOKENS.label}>Author</div>
        <div className="mt-3 text-[2.7rem] font-semibold tracking-[-0.05em] text-white">
          Build the assets that make generation smarter.
        </div>
        <p className="mt-4 max-w-2xl text-[15px] leading-7 text-white/42">
          Keep homepage authoring lightweight. The goal here is to create packs, recipes, and rules that can be attached later without bringing back a heavy runtime chain.
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {AUTHOR_ENTRIES.map((entry) => {
          const Icon = entry.icon;
          return (
            <a
              key={entry.title}
              href={entry.href}
              className="group rounded-[24px] border border-white/[0.08] bg-white/[0.04] p-6 transition hover:border-white/[0.14] hover:bg-white/[0.07]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className={HOMEPAGE_TOKENS.label}>Asset type</div>
                  <div className="mt-3 text-[1.15rem] font-semibold text-white">{entry.title}</div>
                  <div className="mt-2 max-w-md text-[14px] leading-6 text-white/42">
                    {entry.description}
                  </div>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-white/[0.08] bg-white/[0.04] text-white/72 transition group-hover:bg-white/[0.08] group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
