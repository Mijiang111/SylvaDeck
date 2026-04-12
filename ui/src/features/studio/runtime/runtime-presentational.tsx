import type { ReactNode } from "react";

function ShellLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#6f92a8]">
      {children}
    </div>
  );
}

function InfoHint({ text }: { text: string }) {
  return (
    <div className="group relative inline-flex items-center">
      <div className="flex h-4 w-4 items-center justify-center rounded-full border border-current/20 text-[10px] font-semibold leading-none text-[#7d93a1]">
        ?
      </div>
      <div className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 hidden w-56 -translate-y-1/2 rounded-[12px] bg-[#101821] px-3 py-2 text-[11px] leading-5 text-[#dce8ef] shadow-[0_18px_30px_rgba(0,0,0,0.35)] group-hover:block">
        {text}
      </div>
    </div>
  );
}

function formatProjectTimestamp(updatedAt: string) {
  const value = new Date(updatedAt);
  if (Number.isNaN(value.getTime())) {
    return "Updated recently";
  }

  return value.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatVersionTimestamp(value: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return "Saved recently";
  }

  return timestamp.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatGenerationLabel(mode: "outline" | "content") {
  return mode === "outline" ? "Brief" : "Report";
}

export {
  ShellLabel,
  InfoHint,
  formatProjectTimestamp,
  formatVersionTimestamp,
  formatGenerationLabel,
};
