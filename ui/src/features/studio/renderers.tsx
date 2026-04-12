import type {
  BlockDraft,
  BlockTone,
  MetricFact,
  NarrativeItem,
  LayoutBlock,
} from "./types";

function toneClasses(tone: BlockTone) {
  if (tone === "amber") {
    return {
      accent: "text-[#9b572e]",
      bg: "bg-[#f6ecdf]",
      fill: "bg-[#b96834]",
      border: "border-[#b96834]/18",
    };
  }
  if (tone === "navy") {
    return {
      accent: "text-[#12384c]",
      bg: "bg-[#edf2f5]",
      fill: "bg-[#12384c]",
      border: "border-[#12384c]/16",
    };
  }
  return {
    accent: "text-[#0f5d66]",
    bg: "bg-[#e9f4f1]",
    fill: "bg-[#0f5d66]",
    border: "border-[#0f5d66]/16",
  };
}

function fillMetricSlots(metrics: MetricFact[]) {
  const nextMetrics = [...metrics];
  while (nextMetrics.length < 4) {
    const index = nextMetrics.length;
    nextMetrics.push({
      value: `POINT ${index + 1}`,
      label:
        "This slot is being held open so the module stays visually complete even before the final content is fully generated.",
    });
  }
  return nextMetrics.slice(0, 4);
}

function fillNarrativeSlots(
  items: NarrativeItem[],
  prefix: string,
  body: string,
) {
  const nextItems = [...items];
  while (nextItems.length < 4) {
    const index = nextItems.length;
    nextItems.push({
      title: `${prefix} ${index + 1}`,
      body,
    });
  }
  return nextItems.slice(0, 4);
}

function renderMetricGrid(
  metrics: MetricFact[],
  tone: ReturnType<typeof toneClasses>,
  theme: "light" | "dark" = "light",
) {
  const items = fillMetricSlots(
    metrics.length ? metrics : [{ value: "POINT 1", label: "Paste more source facts or generate the report to replace placeholders with source-grounded proof points." }],
  );
  return (
    <div className="grid h-full grid-cols-2 gap-2">
      {items.map((metric) => (
        <div
          key={`${metric.value}-${metric.label}`}
          className={`rounded-[12px] border ${tone.border} ${
            theme === "dark" ? "bg-[#0d1822]" : tone.bg
          } p-2.5`}
        >
          <div className={`h-2.5 w-10 rounded-full ${tone.fill} opacity-70`} />
          <div
            className={`mt-3 text-sm font-semibold ${
              theme === "dark" ? "text-[#edf6ff]" : "text-[#102838]"
            }`}
          >
            {metric.value}
          </div>
          <div
            className={`mt-1 text-[11px] leading-4 ${
              theme === "dark" ? "text-[#8aa2b2]" : "text-[#4c6470]"
            }`}
          >
            {metric.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderBars(
  metrics: MetricFact[],
  tone: ReturnType<typeof toneClasses>,
  theme: "light" | "dark" = "light",
) {
  const items = fillMetricSlots(
    metrics.length ? metrics : [{ value: "POINT 1", label: "Add comparable source-grounded statements or generate the report to fill this ranking block." }],
  );
  return (
    <div className="space-y-3">
      {items.map((metric, index) => (
        <div key={`${metric.value}-${metric.label}`} className="space-y-1.5">
          <div
            className={`flex items-center justify-between gap-4 text-[11px] ${
              theme === "dark" ? "text-[#89a2b3]" : "text-[#45616f]"
            }`}
          >
            <span className="truncate">{metric.label}</span>
            <span>{metric.value}</span>
          </div>
          <div
            className={`h-2.5 rounded-full ${
              theme === "dark" ? "bg-[#101c27]" : "bg-white"
            }`}
          >
            <div
              className={`h-full rounded-full ${tone.fill}`}
              style={{ width: `${88 - index * 16}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function renderLineChart(
  tone: ReturnType<typeof toneClasses>,
  theme: "light" | "dark" = "light",
) {
  return (
    <svg
      viewBox="0 0 300 145"
      className={`h-full w-full rounded-[12px] p-2 ${
        theme === "dark" ? "bg-[#0d1822]" : "bg-white/70"
      }`}
    >
      {[0, 1, 2, 3, 4].map((tick) => (
        <line
          key={tick}
          x1="24"
          x2="286"
          y1={18 + tick * 24}
          y2={18 + tick * 24}
          stroke={theme === "dark" ? "#1e3342" : "#d7e0e5"}
          strokeWidth="1"
        />
      ))}
      <polyline
        fill="none"
        stroke={tone.fill === "bg-[#12384c]" ? "#12384c" : "#0f5d66"}
        strokeWidth="3.5"
        points="30,118 88,98 146,78 220,46 274,28"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {[
        [30, 118],
        [88, 98],
        [146, 78],
        [220, 46],
        [274, 28],
      ].map(([cx, cy], index) => (
        <circle
          key={index}
          cx={cx}
          cy={cy}
          r="5"
          fill="#f7f3eb"
          stroke="#72c8c3"
          strokeWidth="2.5"
        />
      ))}
    </svg>
  );
}

function renderCards(
  cards: Array<{ title: string; body: string }>,
  tone: ReturnType<typeof toneClasses>,
  columns = 2,
  theme: "light" | "dark" = "light",
) {
  const className =
    columns === 4 ? "grid-cols-4" : columns === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <div className={`grid h-full gap-2 ${className}`}>
      {fillNarrativeSlots(
        cards,
        "Point",
        "This slot remains visible so the selected module keeps a fully composed structure before or after generation.",
      ).map((card) => (
        <div
          key={card.title}
          className={`rounded-[12px] border ${tone.border} ${
            theme === "dark" ? "bg-[#0d1822]" : tone.bg
          } p-3`}
        >
          <div
            className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
              theme === "dark" ? "text-[#edf6ff]" : "text-[#102838]"
            }`}
          >
            {card.title}
          </div>
          <div
            className={`mt-2 text-[11px] leading-4 ${
              theme === "dark" ? "text-[#8aa2b2]" : "text-[#4c6470]"
            }`}
          >
            {card.body}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderFlow(
  steps: Array<{ title: string; body: string }>,
  tone: ReturnType<typeof toneClasses>,
  theme: "light" | "dark" = "light",
) {
  return (
    <div className="grid h-full gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
      {fillNarrativeSlots(
        steps,
        "Step",
        "This step slot stays visible so the process module reads as a complete four-part flow even when content is still being prepared.",
      ).map((step, index) => (
        <div key={step.title} className="contents">
          <div
            className={`rounded-[12px] border ${tone.border} ${
              theme === "dark" ? "bg-[#0d1822]" : tone.bg
            } p-3`}
          >
            <div
              className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
                theme === "dark" ? "text-[#edf6ff]" : "text-[#102838]"
              }`}
            >
              {step.title}
            </div>
            <div
              className={`mt-2 text-[11px] leading-4 ${
                theme === "dark" ? "text-[#8aa2b2]" : "text-[#4c6470]"
              }`}
            >
              {step.body}
            </div>
          </div>
          {index < 3 ? (
            <div className="hidden items-center justify-center text-lg text-[#8ba0ab] md:flex">
              →
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function renderGantt(
  tone: ReturnType<typeof toneClasses>,
  steps: NarrativeItem[],
  theme: "light" | "dark" = "light",
) {
  const tracks = steps.length
    ? fillNarrativeSlots(
        steps,
        "Track",
        "This roadmap track stays visible so the module keeps a complete four-track structure on canvas.",
      )
    : fillNarrativeSlots(
        [],
        "Track",
        "This roadmap track stays visible so the module keeps a complete four-track structure on canvas.",
      );
  return (
    <div
      className={`rounded-[14px] border ${
        theme === "dark"
          ? "border-[#1b3041] bg-[#09121a]"
          : "border-[#12384c]/10 bg-white"
      }`}
    >
      <div
        className={`grid grid-cols-[110px_repeat(6,minmax(0,1fr))] border-b text-[10px] ${
          theme === "dark"
            ? "border-[#1b3041] bg-[#0e1720] text-[#7c95a5]"
            : "border-[#12384c]/8 bg-[#f6f2ea] text-[#5c7581]"
        }`}
      >
        <div className="px-2 py-2 font-semibold uppercase tracking-[0.18em]">
          Track
        </div>
        {["26", "27", "28", "29", "30", "31"].map((year) => (
          <div
            key={year}
            className={`border-l px-2 py-2 text-center font-semibold ${
              theme === "dark" ? "border-[#1b3041]" : "border-[#12384c]/8"
            }`}
          >
            {year}
          </div>
        ))}
      </div>
      {tracks.map((track, row) => (
        <div
          key={track.title}
          className={`grid grid-cols-[110px_repeat(6,minmax(0,1fr))] border-t first:border-t-0 ${
            theme === "dark" ? "border-[#1b3041]" : "border-[#12384c]/8"
          }`}
        >
          <div className="px-2 py-2.5">
            <div
              className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${
                theme === "dark" ? "text-[#a7bfce]" : "text-[#45616f]"
              }`}
            >
              {track.title}
            </div>
          </div>
          {Array.from({ length: 6 }).map((__, col) => {
            const active = col >= row && col <= row + 2;
            return (
              <div
                key={col}
                className={`border-l px-1 py-2.5 ${
                  theme === "dark" ? "border-[#1b3041]" : "border-[#12384c]/8"
                }`}
              >
                <div className="flex h-full items-center">
                  <div
                    className={`h-3 w-full rounded-full ${
                      active ? tone.fill : "bg-transparent"
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function PreviewBlock({
  block,
  draft,
  compact = false,
  theme = "light",
}: {
  block: LayoutBlock;
  draft: BlockDraft;
  compact?: boolean;
  theme?: "light" | "dark";
}) {
  const tone = toneClasses(block.tone);
  const scale = compact ? block.visualScale : 1;

  return (
    <div
      className={`h-full rounded-[20px] border ${tone.border} ${
        theme === "dark" ? "bg-[#0b1218]" : "bg-[#f7f3eb]"
      } p-4`}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <div
          className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${
            theme === "dark" ? "text-[#7c95a5]" : "text-[#5c7581]"
          }`}
        >
          {block.kind}
        </div>
        <div
          className={`mt-1 text-sm font-semibold ${
            theme === "dark" ? "text-[#edf6ff]" : "text-[#102838]"
          }`}
        >
          {block.title}
        </div>
        <div
          className={`mt-2 text-[11px] leading-4 ${
            theme === "dark" ? "text-[#8aa2b2]" : "text-[#4c6470]"
          }`}
        >
          {draft.summary}
        </div>
        <div className="mt-3">
          {block.kind === "metrics" ? (
            renderMetricGrid(draft.metrics, tone, theme)
          ) : block.kind === "bars" ? (
            renderBars(draft.metrics, tone, theme)
          ) : block.kind === "line" ? (
            <div className="space-y-3">
              <div className="h-[8.5rem]">{renderLineChart(tone, theme)}</div>
              {draft.cards.length
                ? renderCards(draft.cards, tone, block.w >= 12 ? 4 : 2, theme)
                : null}
            </div>
          ) : block.kind === "matrix" ? (
            renderCards(draft.cards, tone, block.w >= 12 ? 4 : 2, theme)
          ) : block.kind === "flow" ? (
            renderFlow(draft.steps, tone, theme)
          ) : block.kind === "gantt" ? (
            renderGantt(tone, draft.steps, theme)
          ) : (
            renderCards(draft.cards, tone, 3, theme)
          )}
        </div>
      </div>
    </div>
  );
}
