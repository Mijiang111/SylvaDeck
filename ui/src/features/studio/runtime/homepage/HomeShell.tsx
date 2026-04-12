import type { ReactNode } from "react";
import { HOMEPAGE_TOKENS } from "./HomepageThemeTokens";
import { HomeSidebar } from "./HomeSidebar";
import type { HomeSection } from "./types";

export function HomeShell({
  workspaceName,
  activeSection,
  onSelectSection,
  children,
}: {
  workspaceName: string;
  activeSection: HomeSection;
  onSelectSection: (section: HomeSection) => void;
  children: ReactNode;
}) {
  return (
    <article className={HOMEPAGE_TOKENS.shell}>
      <div className="flex h-full">
        <HomeSidebar
          workspaceName={workspaceName}
          activeSection={activeSection}
          onSelectSection={onSelectSection}
        />
        <main className={HOMEPAGE_TOKENS.main}>
          <div className={HOMEPAGE_TOKENS.canvasGlow} />
          <div className={HOMEPAGE_TOKENS.canvasNoise} />
          <div className={HOMEPAGE_TOKENS.canvas}>{children}</div>
        </main>
      </div>
    </article>
  );
}
