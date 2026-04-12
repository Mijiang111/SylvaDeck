import type { HtmlLayoutZone } from "@/features/studio/types";
import { EDITOR_CHROME } from "./editor-chrome-tokens";

const SPLIT_MIN = 28;
const SPLIT_MAX = 72;

type HtmlLayoutEditorProps = {
  zones: HtmlLayoutZone[];
  onZoneSplitChange: (zoneId: string, splitPercent: number) => void;
};

function zoneLabel(kind: HtmlLayoutZone["kind"], index: number) {
  if (kind === "header") {
    return index === 0 ? "Top band split" : `Header region ${index + 1}`;
  }
  return index === 0 ? "Content columns" : `Content region ${index + 1}`;
}

export function HtmlLayoutEditor({ zones, onZoneSplitChange }: HtmlLayoutEditorProps) {
  if (zones.length === 0) {
    return (
      <div className={`${EDITOR_CHROME.editorPanelOuter} px-4 py-3 text-[13px] leading-6 text-[#8ea3b1]`}>
        <p className="font-medium text-[#c5d3dc]">No adjustable layout on this page</p>
        <p className="mt-2 text-[12px] text-[#8ea3b1]">
          We only pick up two-column containers (exactly two main children). Try Regenerate with a shorter brief,
          tune text size, or use Visual for element width—without changing the generator prompt.
        </p>
      </div>
    );
  }

  return (
    <div className={`${EDITOR_CHROME.editorPanelOuter} px-4 py-3 text-[#edf6ff]`}>
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8ea3b1]">
        Column balance
      </div>
      <p className="mb-4 text-[12px] leading-5 text-[#9cb0bc]">
        Shifts the grid between the left and right column (28–72). Only applies if the matched container has exactly
        two child blocks.
      </p>
      <div className="flex flex-col gap-4">
        {zones.map((zone, index) => (
          <label key={zone.id} className="flex flex-wrap items-center gap-3">
            <span className="min-w-[120px] text-[11px] font-semibold text-[#c5d3dc]">
              {zoneLabel(zone.kind, index)}
            </span>
            <input
              type="range"
              min={SPLIT_MIN}
              max={SPLIT_MAX}
              step={1}
              value={Math.round(
                Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, zone.splitPercent)),
              )}
              onChange={(event) =>
                onZoneSplitChange(zone.id, Number.parseInt(event.target.value, 10))
              }
              className="h-2 min-w-[160px] flex-1 accent-[#c6994a]"
            />
            <span className="w-10 text-right text-[12px] font-semibold tabular-nums text-[#d7e4ec]">
              {Math.round(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, zone.splitPercent)))}%
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
