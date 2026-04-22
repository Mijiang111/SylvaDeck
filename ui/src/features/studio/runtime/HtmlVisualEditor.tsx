import { useEffect, useRef, useState } from "react";
import type {
  HtmlPageVisualStyle,
  HtmlVisualContentNode,
  HtmlVisualNode,
  HtmlVisualNodeKind,
  HtmlVisualNodeStyle,
} from "@/features/studio/types";
import type { HtmlVisualInsertionMode } from "@/features/studio/html-report-visuals";
import { EDITOR_CHROME } from "./editor-chrome-tokens";

type HtmlVisualEditorProps = {
  style: HtmlPageVisualStyle | null;
  selectedNode: HtmlVisualNode | null;
  contentNodes: HtmlVisualContentNode[];
  inspectorMode: "page" | "text" | "visual";
  onChangeStyle: (nextStyle: HtmlPageVisualStyle) => void;
  onChangeNodeStyle: (nextStyle: Partial<HtmlVisualNodeStyle>) => void;
  onAddVisualElement: (kind: HtmlVisualNodeKind, placement: HtmlVisualInsertionMode) => void;
  onDuplicateSelectedElement: () => void;
  onDeleteSelectedElement: () => void;
  onDuplicateContentElement: (contentNodeId: string) => void;
  onDeleteContentElement: (contentNodeId: string) => void;
};

const PLACEMENT_OPTIONS: Array<{ id: HtmlVisualInsertionMode; label: string }> = [
  { id: "page-end", label: "Page" },
  { id: "below", label: "Below" },
  { id: "beside", label: "Beside" },
];

const ADDABLE_ELEMENTS: Array<{ kind: HtmlVisualNodeKind; label: string }> = [
  { kind: "divider", label: "Divider" },
  { kind: "badge", label: "Badge" },
  { kind: "highlight", label: "Highlight" },
  { kind: "annotation", label: "Annotation" },
  { kind: "surface", label: "Surface" },
];

function normalizeNodeColor(value: string | undefined, fallback: string) {
  const normalized = (value ?? "").trim();
  return normalized || fallback;
}

function isHexColor(value: string | undefined) {
  const normalized = (value ?? "").trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized);
}

function toColorInputValue(value: string | undefined, fallback: string) {
  const candidates = [value, fallback, "#ffffff"];
  for (const candidate of candidates) {
    const normalized = (candidate ?? "").trim();
    if (!isHexColor(normalized)) {
      continue;
    }

    if (normalized.length === 4) {
      return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`.toLowerCase();
    }

    return normalized.toLowerCase();
  }

  return "#ffffff";
}

function formatNodeLabel(value: string) {
  return value
    .split("-")
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function CompactColorControl({
  label,
  value,
  pickerFallback,
  onChange,
}: {
  label: string;
  value: string;
  pickerFallback?: string;
  onChange: (value: string) => void;
}) {
  const pickerValue = toColorInputValue(value, pickerFallback ?? "#ffffff");

  return (
    <label className="flex min-w-[138px] items-center gap-2 rounded-[12px] border border-white/8 bg-white/[0.03] px-2.5 py-2">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8ea3b1]">
        {label}
      </span>
      <input
        type="color"
        value={pickerValue}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 w-7 shrink-0 rounded border-0 bg-transparent p-0"
      />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-[12px] text-[#edf6ff] outline-none placeholder:text-[#748d9d]"
      />
    </label>
  );
}

function CompactRangeControl({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex min-w-[122px] items-center gap-2 rounded-[12px] border border-white/8 bg-white/[0.03] px-2.5 py-2">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8ea3b1]">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-w-0 flex-1 accent-[#c6994a]"
      />
      <span className="w-8 shrink-0 text-right text-[11px] font-semibold text-[#d7e4ec]">
        {value}
      </span>
    </label>
  );
}

function ToolbarButton({
  label,
  onClick,
  tone = "default",
}: {
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-[11px] border px-3 py-2 text-[11px] font-semibold transition",
        tone === "danger"
          ? "border-[rgba(198,102,90,0.32)] bg-[rgba(198,102,90,0.08)] text-[#f0c3bb] hover:bg-[rgba(198,102,90,0.14)]"
          : "border-white/10 bg-white/[0.04] text-[#edf6ff] hover:bg-white/[0.08]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

export function HtmlVisualEditor({
  style,
  selectedNode,
  contentNodes,
  inspectorMode,
  onChangeStyle,
  onChangeNodeStyle,
  onAddVisualElement,
  onDuplicateSelectedElement,
  onDeleteSelectedElement,
  onDuplicateContentElement,
  onDeleteContentElement,
}: HtmlVisualEditorProps) {
  const [addPlacement, setAddPlacement] = useState<HtmlVisualInsertionMode>("page-end");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setAddPlacement(selectedNode ? "below" : "page-end");
    if (!selectedNode) {
      setDetailsOpen(false);
    }
  }, [selectedNode?.id]);

  useEffect(() => {
    if (!addMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) {
        setAddMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [addMenuOpen]);

  if (!style) {
    return (
      <div
        className={`${EDITOR_CHROME.editorPanelOuter} px-4 py-3 text-[13px] leading-6 text-[#8ea3b1]`}
      >
        Generate a report first and the visual toolbar will appear here.
      </div>
    );
  }

  const isVisualSelection = inspectorMode === "visual" && selectedNode;
  const contextTitle = isVisualSelection ? `Selected: ${formatNodeLabel(selectedNode.kind)}` : "Page defaults";
  const contextSubline = isVisualSelection
    ? `Page ${selectedNode.pageNumber}`
    : inspectorMode === "text"
      ? "Text is selected. Visual controls still target the page until you select a visual element."
      : "Tune the page tone or select a visual element.";

  const selectedFill = normalizeNodeColor(selectedNode?.style.background, style.surfaceFill ?? "#ffffff");
  const selectedBorder = normalizeNodeColor(selectedNode?.style.border, style.dividerColor ?? "#d8d0c2");
  const selectedAccent = normalizeNodeColor(selectedNode?.style.accent, "#c6994a");
  const selectedRadius = Math.max(0, Math.round(selectedNode?.style.radius ?? 18));
  const selectedBorderWidth = Math.max(0, Math.round(selectedNode?.style.borderWidth ?? 1));
  const selectedOpacity = Math.max(0.1, Math.min(1, selectedNode?.style.opacity ?? 1));
  const selectedWidthPercent = Math.max(18, Math.min(100, Math.round(selectedNode?.style.widthPercent ?? 100)));
  const selectedHeight = Math.max(
    0,
    Math.round(selectedNode?.style.height ?? selectedNode?.style.minHeight ?? 0),
  );
  const selectedMinHeight = Math.max(0, Math.round(selectedNode?.style.minHeight ?? 0));
  const selectedPadding = Math.max(0, Math.round(selectedNode?.style.padding ?? 0));

  return (
    <div className={`${EDITOR_CHROME.editorPanelOuter} px-4 py-3 text-[#edf6ff]`}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-[184px] shrink-0 items-start gap-2 pr-4">
          <span
            className={[
              "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
              isVisualSelection ? "bg-[#c6994a]" : "bg-[#5b7387]",
            ].join(" ")}
          />
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8ea3b1]">
              {contextTitle}
            </div>
            <div className="mt-1 text-[12px] text-[#c5d3dc]">{contextSubline}</div>
          </div>
        </div>

        <div className="hidden h-12 w-px self-center bg-white/8 xl:block" />

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {isVisualSelection ? (
            <>
              <CompactColorControl
                label="Fill"
                value={selectedFill}
                pickerFallback={style.surfaceFill ?? "#ffffff"}
                onChange={(background) => onChangeNodeStyle({ background })}
              />
              <CompactColorControl
                label="Border"
                value={selectedBorder}
                pickerFallback={style.dividerColor ?? "#d8d0c2"}
                onChange={(border) => onChangeNodeStyle({ border })}
              />
              <CompactColorControl
                label="Accent"
                value={selectedAccent}
                pickerFallback="#c6994a"
                onChange={(accent) => onChangeNodeStyle({ accent })}
              />
              <CompactRangeControl
                label="Radius"
                min={0}
                max={48}
                step={2}
                value={selectedRadius}
                onChange={(radius) => onChangeNodeStyle({ radius })}
              />
              <CompactRangeControl
                label="Opacity"
                min={0.1}
                max={1}
                step={0.05}
                value={Number(selectedOpacity.toFixed(2))}
                onChange={(opacity) => onChangeNodeStyle({ opacity })}
              />
              <CompactRangeControl
                label="Width %"
                min={18}
                max={100}
                step={2}
                value={selectedWidthPercent}
                onChange={(widthPercent) => onChangeNodeStyle({ widthPercent })}
              />
              <CompactRangeControl
                label="Height"
                min={0}
                max={520}
                step={8}
                value={selectedHeight}
                onChange={(height) => onChangeNodeStyle({ height })}
              />
            </>
          ) : (
            <>
              <CompactColorControl
                label="Page"
                value={style.pageBackground}
                pickerFallback="#fbf8f2"
                onChange={(pageBackground) => onChangeStyle({ ...style, pageBackground })}
              />
              <CompactColorControl
                label="Surface"
                value={style.surfaceFill}
                pickerFallback="#ffffff"
                onChange={(surfaceFill) => onChangeStyle({ ...style, surfaceFill })}
              />
              <CompactColorControl
                label="Divider"
                value={style.dividerColor}
                pickerFallback="#d8d0c2"
                onChange={(dividerColor) => onChangeStyle({ ...style, dividerColor })}
              />
            </>
          )}
        </div>

        <div className="hidden h-12 w-px self-center bg-white/8 xl:block" />

        <div className="relative flex shrink-0 flex-wrap items-center justify-end gap-2" ref={addMenuRef}>
          <div className="flex items-center gap-1 rounded-[11px] border border-white/8 bg-white/[0.03] p-1">
            {PLACEMENT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setAddPlacement(option.id)}
                className={[
                  "rounded-[8px] px-2.5 py-1 text-[10px] font-semibold transition",
                  addPlacement === option.id
                    ? "bg-[#223445] text-white"
                    : "text-[#9cb0bc] hover:bg-white/[0.06] hover:text-white",
                ].join(" ")}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setAddMenuOpen((current) => !current)}
            className="rounded-[11px] border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-[#edf6ff] transition hover:bg-white/[0.08]"
          >
            + Add
          </button>

          {isVisualSelection ? (
            <>
              <ToolbarButton label="Duplicate" onClick={onDuplicateSelectedElement} />
              <ToolbarButton label="Delete" tone="danger" onClick={onDeleteSelectedElement} />
              <button
                type="button"
                onClick={() => setDetailsOpen((current) => !current)}
                className={[
                  "rounded-[11px] border px-3 py-2 text-[11px] font-semibold transition",
                  detailsOpen
                    ? "border-[#3d5161] bg-[#21303f] text-white"
                    : "border-white/10 bg-white/[0.04] text-[#edf6ff] hover:bg-white/[0.08]",
                ].join(" ")}
              >
                Details
              </button>
            </>
          ) : null}

          {addMenuOpen ? (
            <div className="absolute right-0 top-[calc(100%+10px)] z-20 w-[188px] rounded-[14px] border border-white/8 bg-[#17212b] p-2 shadow-[0_18px_48px_rgba(0,0,0,0.28)]">
              <div className="mb-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8ea3b1]">
                Add element
              </div>
              <div className="space-y-1">
                {ADDABLE_ELEMENTS.map((entry) => (
                  <button
                    key={entry.kind}
                    type="button"
                    onClick={() => {
                      onAddVisualElement(entry.kind, addPlacement);
                      setAddMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-[10px] px-2.5 py-2 text-left text-[12px] text-[#edf6ff] transition hover:bg-white/[0.06]"
                  >
                    <span>{entry.label}</span>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-[#8ea3b1]">
                      {PLACEMENT_OPTIONS.find((option) => option.id === addPlacement)?.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {detailsOpen && isVisualSelection ? (
        <div className="mt-3 border-t border-white/8 pt-3">
          <div className="flex flex-wrap items-start gap-2">
            <CompactRangeControl
              label="Border"
              min={0}
              max={8}
              step={1}
              value={selectedBorderWidth}
              onChange={(borderWidth) => onChangeNodeStyle({ borderWidth })}
            />
            <CompactRangeControl
              label="Padding"
              min={0}
              max={56}
              step={2}
              value={selectedPadding}
              onChange={(padding) => onChangeNodeStyle({ padding })}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {contentNodes.length ? (
              contentNodes.map((node) => (
                <div
                  key={node.id}
                  className="flex items-center gap-2 rounded-[11px] border border-white/8 bg-white/[0.03] px-3 py-2"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8ea3b1]">
                    {node.kind.replace(/-/g, " ")}
                  </span>
                  <span className="max-w-[220px] truncate text-[12px] text-[#edf6ff]">{node.text}</span>
                  <button
                    type="button"
                    onClick={() => onDuplicateContentElement(node.id)}
                    className="rounded-[8px] border border-white/10 px-2 py-1 text-[10px] font-semibold text-[#edf6ff] transition hover:bg-white/[0.06]"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteContentElement(node.id)}
                    className="rounded-[8px] border border-[rgba(198,102,90,0.32)] px-2 py-1 text-[10px] font-semibold text-[#f0c3bb] transition hover:bg-[rgba(198,102,90,0.14)]"
                  >
                    Delete
                  </button>
                </div>
              ))
            ) : (
              <div className="text-[12px] text-[#9cb0bc]">
                This module has no separate inner text elements yet.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
