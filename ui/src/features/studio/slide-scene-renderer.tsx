import { Component } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  measureTextBlock,
  resolveFontDescriptorToCss,
} from "./text-layout/pretext-engine";
import { resolvePageScene, SLIDE_SCENE_HEIGHT, SLIDE_SCENE_WIDTH } from "./slide-scene";
import type {
  LayoutPage,
  PageDraft,
  SlideSceneChartAppearance,
  SlideSceneChartObject,
  SlideSceneDataAppearance,
  SlideSceneDataItem,
  SlideSceneDataObject,
  SlideSceneObject,
  SlideSceneTextObject,
} from "./types";

const DEFAULT_SANS_FONT =
  '"Avenir Next", "Helvetica Neue", "Segoe UI", Arial, sans-serif';
const DEFAULT_SERIF_FONT =
  '"Iowan Old Style", "Palatino Linotype", Georgia, serif';

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function parseHexColor(value: string) {
  const hex = value.trim().replace("#", "");
  if (hex.length === 3) {
    const expanded = hex
      .split("")
      .map((char) => char + char)
      .join("");
    return parseHexColor(`#${expanded}`);
  }
  if (hex.length !== 6 || /[^0-9a-f]/i.test(hex)) {
    return null;
  }
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function parseRgbColor(value: string) {
  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) {
    return null;
  }
  const parts = match[1]
    .split(",")
    .map((item) => Number.parseFloat(item.trim()))
    .filter((item) => Number.isFinite(item));
  if (parts.length < 3) {
    return null;
  }
  return {
    r: clamp(parts[0], 0, 255),
    g: clamp(parts[1], 0, 255),
    b: clamp(parts[2], 0, 255),
  };
}

function parseColorChannels(value?: string | null) {
  if (!value) {
    return null;
  }
  return parseHexColor(value) ?? parseRgbColor(value);
}

function relativeLuminance(value?: string | null) {
  const channels = parseColorChannels(value);
  if (!channels) {
    return null;
  }
  const normalize = (channel: number) => {
    const next = channel / 255;
    return next <= 0.03928 ? next / 12.92 : ((next + 0.055) / 1.055) ** 2.4;
  };
  const r = normalize(channels.r);
  const g = normalize(channels.g);
  const b = normalize(channels.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isDarkSurface(value?: string | null) {
  const luminance = relativeLuminance(value);
  return luminance !== null && luminance < 0.18;
}

function resolveReadableTextColor(args: {
  preferred?: string | null;
  background?: string | null;
  fallback?: string;
}) {
  if (args.preferred) {
    return args.preferred;
  }
  if (isDarkSurface(args.background)) {
    return "#f6f8fb";
  }
  return args.fallback ?? "#102838";
}

function frameStyle(
  object: SlideSceneObject,
  canvas: { width: number; height: number },
): CSSProperties {
  return {
    position: "absolute",
    left: `${(object.x / canvas.width) * 100}%`,
    top: `${(object.y / canvas.height) * 100}%`,
    width: `${(object.w / canvas.width) * 100}%`,
    height: `${(object.h / canvas.height) * 100}%`,
    opacity: object.opacity ?? 1,
    transform: object.rotation ? `rotate(${object.rotation}deg)` : undefined,
    transformOrigin: "center center",
    zIndex: object.zIndex ?? 0,
  };
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function fitTextPx(args: {
  text: string;
  fontFamily?: string;
  fontWeight?: number;
  fontStyle?: string;
  width: number;
  height: number;
  base: number;
  min: number;
  max: number;
  lineHeight?: number;
  emWidth?: number;
  maxLines?: number;
}) {
  const safeWidth = Math.max(24, args.width);
  const safeHeight = Math.max(20, args.height);
  const lineHeight = args.lineHeight ?? 1.15;
  const maxLines = args.maxLines ?? 12;
  let fontSize = clamp(args.base, args.min, args.max);

  while (fontSize > args.min) {
    const measurement = measureTextBlock({
      text: args.text,
      widthPx: safeWidth,
      lineHeightPx: fontSize * lineHeight,
      font: resolveFontDescriptorToCss({
        family: args.fontFamily || DEFAULT_SANS_FONT,
        sizePx: fontSize,
        weight: String(args.fontWeight ?? 400),
        style: args.fontStyle || "normal",
      }),
    });
    const lineCount = measurement.lineCount;
    const totalHeight = measurement.height;
    if (lineCount <= maxLines && totalHeight <= safeHeight) {
      break;
    }
    fontSize -= 1;
  }

  return clamp(fontSize, args.min, args.max);
}

function resolveTextFontFamily(object: SlideSceneTextObject) {
  if (object.fontFamily) {
    return object.fontFamily;
  }

  return (object.fontSize ?? 24) >= 34 || (object.fontWeight ?? 500) >= 620
    ? DEFAULT_SERIF_FONT
    : DEFAULT_SANS_FONT;
}

function resolveTextPadding(object: SlideSceneTextObject) {
  if (object.padding) {
    return object.padding;
  }

  return object.fill ? clamp(Math.round(Math.min(object.w, object.h) * 0.05), 12, 28) : 0;
}

function resolveDataAppearance(object: SlideSceneDataObject): SlideSceneDataAppearance {
  if (object.appearance) {
    return object.appearance;
  }

  if (!object.fill && !object.stroke && (object.items?.length ?? 0) > 0) {
    return object.items && object.items.length >= 3 ? "list" : "plain";
  }

  if (object.value && (object.items?.length ?? 0) <= 2) {
    return "stat";
  }

  return "panel";
}

function resolveChartAppearance(object: SlideSceneChartObject): SlideSceneChartAppearance {
  if (object.appearance) {
    return object.appearance;
  }

  return object.fill || object.stroke ? "panel" : "minimal";
}

function resolveDataColumns(
  layout: SlideSceneDataObject["layout"],
  appearance: SlideSceneDataAppearance,
  width: number,
  itemCount: number,
) {
  if (appearance === "list") {
    return 1;
  }

  if (layout === "row") {
    if (width >= 900) {
      return Math.min(4, Math.max(2, itemCount));
    }
    if (width >= 600) {
      return Math.min(3, Math.max(2, itemCount));
    }
    return Math.min(2, Math.max(1, itemCount));
  }

  if (layout === "grid-4" || layout === "grid-2") {
    return width >= 520 ? 2 : 1;
  }

  return appearance === "plain" && width >= 640 && itemCount >= 2 ? 2 : 1;
}

function SceneTextObjectView({
  object,
  canvas,
}: {
  object: SlideSceneTextObject;
  canvas: { width: number; height: number };
}) {
  const paddingPx = resolveTextPadding(object);
  const lineHeight = object.lineHeight ?? 1.12;
  const fontPx = fitTextPx({
    text: object.text,
    width: object.w - paddingPx * 2,
    height: object.h - paddingPx * 2,
    base: object.fontSize ?? 24,
    min: object.h < 70 ? 12 : 14,
    max: object.fontSize ?? 72,
    lineHeight,
    emWidth: (object.fontWeight ?? 500) >= 620 ? 0.5 : 0.54,
    maxLines: object.h < 84 ? 2 : 6,
  });

  return (
    <div
      style={{
        ...frameStyle(object, canvas),
        color: resolveReadableTextColor({
          preferred: object.color,
          background: object.fill,
          fallback: "#102838",
        }),
        fontSize: `${fontPx / 16}rem`,
        fontWeight: object.fontWeight,
        fontFamily: resolveTextFontFamily(object),
        lineHeight,
        letterSpacing: object.letterSpacing ? `${object.letterSpacing}px` : undefined,
        textAlign: object.textAlign,
        fontStyle: object.italic ? "italic" : undefined,
        textTransform: object.uppercase ? "uppercase" : undefined,
        background: object.fill,
        borderRadius: object.radius ? `${object.radius}px` : undefined,
        padding: paddingPx ? `${paddingPx}px` : undefined,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
      className="overflow-hidden"
    >
      {object.text}
    </div>
  );
}

function renderDataItems(args: {
  items: SlideSceneDataItem[];
  object: SlideSceneDataObject;
  appearance: SlideSceneDataAppearance;
  paddingPx: number;
}) {
  const { items, object, appearance, paddingPx } = args;
  if (!items.length) {
    return null;
  }

  const columns = resolveDataColumns(object.layout, appearance, object.w, items.length);
  const gapPx = clamp(Math.round(Math.min(object.w, object.h) * 0.03), 8, 18);
  const cellWidth =
    columns > 1 ? (object.w - paddingPx * 2 - gapPx * (columns - 1)) / columns : object.w - paddingPx * 2;
  const rows = Math.max(1, Math.ceil(items.length / columns));
  const cellHeight =
    rows > 0 ? (object.h - paddingPx * 2 - gapPx * Math.max(0, rows - 1)) / rows : object.h;
  const itemPaddingX =
    appearance === "panel" || appearance === "stat"
      ? clamp(Math.round(cellWidth * 0.05), 10, 18)
      : 0;
  const itemPaddingY =
    appearance === "panel" || appearance === "stat"
      ? clamp(Math.round(cellHeight * 0.06), 10, 18)
      : appearance === "list"
        ? clamp(Math.round(cellHeight * 0.04), 8, 14)
        : 0;
  const itemValuePx = clamp(Math.min(cellHeight * 0.2, cellWidth * 0.15), 14, 28);
  const itemTitlePx = fitTextPx({
    text: items.map((item) => item.title).join(" "),
    width: Math.max(80, cellWidth - itemPaddingX * 2),
    height: Math.max(30, cellHeight * 0.22),
    base: cellWidth >= 320 ? 19 : 16,
    min: 12,
    max: 22,
    lineHeight: 1.08,
    maxLines: columns > 1 ? 3 : 2,
  });
  const itemBodyPx = fitTextPx({
    text: items.map((item) => item.body ?? "").join(" "),
    width: Math.max(80, cellWidth - itemPaddingX * 2),
    height: Math.max(40, cellHeight * 0.42),
    base: cellWidth >= 320 ? 15 : 14,
    min: 11,
    max: 16,
    lineHeight: 1.32,
    maxLines: 5,
  });
  const eyebrowPx = clamp(Math.round(itemTitlePx * 0.68), 9, 12);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: `${gapPx}px`,
        alignContent: "start",
      }}
    >
      {items.map((item, index) => {
        const isPanel = appearance === "panel" || appearance === "stat";
        const divider =
          appearance === "list" && index > 0
            ? "1px solid rgba(16,40,56,0.12)"
            : undefined;

        return (
          <div
            key={`${item.title}-${index}`}
            style={{
              minWidth: 0,
              padding:
                itemPaddingX || itemPaddingY
                  ? `${itemPaddingY}px ${itemPaddingX}px`
                  : undefined,
              background:
                isPanel
                  ? item.accent
                    ? `color-mix(in srgb, ${item.accent} 12%, white)`
                    : "rgba(255,255,255,0.58)"
                  : undefined,
              border:
                isPanel
                  ? "1px solid rgba(16,40,56,0.08)"
                  : divider,
              borderRadius: isPanel ? "18px" : undefined,
            }}
          >
            {item.eyebrow ? (
              <div
                style={{
                  fontSize: `${eyebrowPx / 16}rem`,
                  letterSpacing: "0.16em",
                }}
                className="font-semibold uppercase text-current/55"
              >
                {item.eyebrow}
              </div>
            ) : null}
            {item.value ? (
              <div
                style={{
                  fontSize: `${itemValuePx / 16}rem`,
                  lineHeight: 0.96,
                }}
                className="mt-1 font-semibold text-current"
              >
                {item.value}
              </div>
            ) : null}
            <div
              style={{
                fontSize: `${itemTitlePx / 16}rem`,
                lineHeight: 1.08,
                marginTop: item.value || item.eyebrow ? 8 : 0,
              }}
              className="font-semibold text-current"
            >
              {item.title}
            </div>
            {item.body ? (
              <div
                style={{
                  fontSize: `${itemBodyPx / 16}rem`,
                  lineHeight: 1.32,
                  marginTop: 8,
                }}
                className="text-current/80"
              >
                {item.body}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function SceneDataObjectView({
  object,
  canvas,
}: {
  object: SlideSceneDataObject;
  canvas: { width: number; height: number };
}) {
  const appearance = resolveDataAppearance(object);
  const hasChrome = appearance === "panel" || appearance === "stat" || Boolean(object.fill || object.stroke);
  const paddingPx = hasChrome ? clamp(Math.round(Math.min(object.w, object.h) * 0.055), 12, 28) : 0;
  const eyebrowPx = clamp(Math.round(Math.min(object.w, object.h) * 0.028), 10, 13);
  const valuePx = fitTextPx({
    text: object.value ?? "",
    width: object.w - paddingPx * 2,
    height: Math.max(44, object.h * 0.18),
    base: appearance === "stat" ? 34 : 28,
    min: 16,
    max: 38,
    lineHeight: 0.96,
    maxLines: 2,
  });
  const titlePx = fitTextPx({
    text: object.title ?? "",
    width: object.w - paddingPx * 2,
    height: Math.max(44, object.h * 0.18),
    base: appearance === "stat" ? 22 : 20,
    min: 14,
    max: 26,
    lineHeight: 1.08,
    maxLines: appearance === "list" ? 3 : 2,
  });
  const bodyPx = fitTextPx({
    text: object.body ?? "",
    width: object.w - paddingPx * 2,
    height: Math.max(36, object.h * 0.26),
    base: 15,
    min: 11,
    max: 16,
    lineHeight: 1.34,
    maxLines: 5,
  });
  const gapPx = clamp(Math.round(Math.min(object.w, object.h) * 0.024), 8, 16);

  return (
    <div
      style={{
        ...frameStyle(object, canvas),
        background:
          appearance === "panel" || appearance === "stat"
            ? object.fill ?? "rgba(255,255,255,0.76)"
            : object.fill ?? "transparent",
        border:
          object.stroke || appearance === "panel" || appearance === "stat"
            ? `${Math.max(1, object.strokeWidth ?? 1)}px solid ${object.stroke ?? "rgba(16,40,56,0.08)"}`
            : undefined,
        borderRadius:
          appearance === "panel" || appearance === "stat" || object.fill || object.stroke
            ? `${object.radius ?? 24}px`
            : undefined,
        boxShadow:
          appearance === "panel" || appearance === "stat"
            ? "0 10px 24px rgba(15,23,31,0.08)"
            : undefined,
        color: resolveReadableTextColor({
          preferred: object.color,
          background:
            appearance === "panel" || appearance === "stat"
              ? object.fill ?? "rgba(255,255,255,0.76)"
              : object.fill ?? "transparent",
          fallback: "#102838",
        }),
        textAlign: object.textAlign,
        padding: paddingPx ? `${paddingPx}px` : undefined,
        display: "flex",
        flexDirection: "column",
        gap: `${gapPx}px`,
        overflow: "hidden",
      }}
    >
      {object.eyebrow ? (
        <div
          style={{
            fontSize: `${eyebrowPx / 16}rem`,
            letterSpacing: "0.16em",
          }}
          className="font-semibold uppercase text-current/55"
        >
          {object.eyebrow}
        </div>
      ) : null}
      {object.value ? (
        <div
          style={{
            fontSize: `${valuePx / 16}rem`,
            lineHeight: 0.96,
          }}
          className="font-semibold text-current"
        >
          {object.value}
        </div>
      ) : null}
      {object.title ? (
        <div
          style={{
            fontSize: `${titlePx / 16}rem`,
            lineHeight: 1.08,
          }}
          className="font-semibold text-current"
        >
          {object.title}
        </div>
      ) : null}
      {object.body ? (
        <div
          style={{
            fontSize: `${bodyPx / 16}rem`,
            lineHeight: 1.34,
          }}
          className="text-current/82"
        >
          {object.body}
        </div>
      ) : null}
      {renderDataItems({
        items: object.items ?? [],
        object,
        appearance,
        paddingPx,
      })}
    </div>
  );
}

function parseNumericValue(value: string, index: number) {
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return Math.max(1, 100 - index * 12);
  }
  return Number.parseFloat(match[0]);
}

function SceneChartObjectView({
  object,
  canvas,
}: {
  object: SlideSceneChartObject;
  canvas: { width: number; height: number };
}) {
  const appearance = resolveChartAppearance(object);
  const series = object.series.slice(0, 8);
  const maxValue = Math.max(...series.map((item, index) => parseNumericValue(item.value, index)), 1);
  const paddingPx = clamp(Math.round(Math.min(object.w, object.h) * 0.05), 12, 26);
  const titlePx = fitTextPx({
    text: object.title ?? "",
    width: object.w - paddingPx * 2,
    height: Math.max(36, object.h * 0.12),
    base: 20,
    min: 14,
    max: 24,
    lineHeight: 1.08,
    maxLines: 2,
  });
  const bodyPx = fitTextPx({
    text: object.body ?? "",
    width: object.w - paddingPx * 2,
    height: Math.max(28, object.h * 0.14),
    base: 14,
    min: 11,
    max: 16,
    lineHeight: 1.3,
    maxLines: 3,
  });
  const valuePx = clamp(Math.round(Math.min(object.w, object.h) * 0.034), 10, 13);
  const labelPx = clamp(Math.round(Math.min(object.w, object.h) * 0.036), 11, 14);

  return (
    <div
      style={{
        ...frameStyle(object, canvas),
        background:
          appearance === "panel"
            ? object.fill ?? "rgba(255,255,255,0.82)"
            : object.fill ?? "transparent",
        border:
          object.stroke || appearance === "panel"
            ? `${Math.max(1, object.strokeWidth ?? 1)}px solid ${object.stroke ?? "rgba(16,40,56,0.08)"}`
            : undefined,
        borderRadius:
          appearance === "panel" || object.fill || object.stroke
            ? `${object.radius ?? 24}px`
            : undefined,
        boxShadow:
          appearance === "panel"
            ? "0 12px 24px rgba(15,23,31,0.08)"
            : undefined,
        color: resolveReadableTextColor({
          preferred: object.color,
          background:
            appearance === "panel"
              ? object.fill ?? "rgba(255,255,255,0.82)"
              : object.fill ?? "transparent",
          fallback: "#102838",
        }),
        padding: `${paddingPx}px`,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        overflow: "hidden",
      }}
    >
      {object.title ? (
        <div
          style={{
            fontSize: `${titlePx / 16}rem`,
            lineHeight: 1.08,
          }}
          className="font-semibold text-current"
        >
          {object.title}
        </div>
      ) : null}
      {object.body ? (
        <div
          style={{
            fontSize: `${bodyPx / 16}rem`,
            lineHeight: 1.3,
          }}
          className="text-current/78"
        >
          {object.body}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 items-end gap-3">
        {series.map((item, index) => {
          const numericValue = parseNumericValue(item.value, index);
          const height = `${Math.max(16, (numericValue / maxValue) * 100)}%`;
          return (
            <div
              key={`${item.label}-${index}`}
              className="flex min-w-0 flex-1 flex-col items-stretch justify-end"
            >
              <div
                style={{
                  fontSize: `${valuePx / 16}rem`,
                }}
                className="font-semibold text-current/55"
              >
                {item.value}
              </div>
              <div
                className="mt-2 rounded-t-[16px]"
                style={{
                  height,
                  background: item.color ?? "#183d55",
                }}
              />
              <div
                style={{
                  fontSize: `${labelPx / 16}rem`,
                  lineHeight: 1.24,
                }}
                className="mt-2 text-current/78"
              >
                {item.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SceneObjectView({
  object,
  canvas,
}: {
  object: SlideSceneObject;
  canvas: { width: number; height: number };
}) {
  if (object.kind === "text") {
    return <SceneTextObjectView object={object} canvas={canvas} />;
  }

  if (object.kind === "data") {
    return <SceneDataObjectView object={object} canvas={canvas} />;
  }

  if (object.kind === "chart") {
    return <SceneChartObjectView object={object} canvas={canvas} />;
  }

  if (object.kind === "line") {
    return (
      <div
        style={{
          ...frameStyle(object, canvas),
          background: object.stroke ?? "#183d55",
          borderRadius: `${Math.max(1, (object.strokeWidth ?? 2) * 2)}px`,
        }}
      />
    );
  }

  return (
    <div
      style={{
        ...frameStyle(object, canvas),
        background: object.fill ?? "#dce6eb",
        border: object.stroke ? `${object.strokeWidth ?? 1}px solid ${object.stroke}` : undefined,
        borderRadius: object.kind === "ellipse" ? "9999px" : `${object.radius ?? 20}px`,
      }}
    />
  );
}

export function SlideSceneCanvas({
  page,
  pageDraft,
  className = "",
}: {
  page: LayoutPage;
  pageDraft: PageDraft;
  className?: string;
}) {
  const resetKey = `${page.id}:${pageDraft.summary}:${pageDraft.scene?.objects.length ?? 0}`;
  return (
    <SlideSceneCanvasErrorBoundary page={page} resetKey={resetKey}>
      <SlideSceneCanvasInner page={page} pageDraft={pageDraft} className={className} />
    </SlideSceneCanvasErrorBoundary>
  );
}

class SlideSceneCanvasErrorBoundary extends Component<
  { children: ReactNode; page: LayoutPage; resetKey: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[ppt-workbench] slide_scene_render_failed", {
      pageId: this.props.page.id,
      pageTitle: this.props.page.title,
      error,
    });
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="relative h-full min-h-[420px] w-full overflow-hidden rounded-[28px] bg-[#f8f1e7]">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,_rgba(255,255,255,0.78),_rgba(248,241,231,0.94))]" />
          <div className="relative flex h-full flex-col justify-between px-10 py-9 text-[#183246]">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8e6a2f]">
                Render Recovery
              </div>
              <h3
                className="mt-4 text-[2rem] leading-[1.02] text-[#173041]"
                style={{ fontFamily: DEFAULT_SERIF_FONT }}
              >
                This page scene failed to render.
              </h3>
              <p className="mt-4 max-w-[60ch] text-[1rem] leading-7 text-[#4f6470]">
                The generated report is still saved, but one scene object crashed the renderer.
                Regenerate the page or reload the report and I will keep the rest of the workbench alive.
              </p>
            </div>
            <div className="rounded-[22px] border border-[#dccdb7] bg-white/72 px-6 py-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8a97a0]">
                Error detail
              </div>
              <div className="mt-3 text-[0.95rem] leading-6 text-[#203848]">
                {this.state.error.message || "Unknown scene rendering error."}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function SlideSceneCanvasInner({
  page,
  pageDraft,
  className = "",
}: {
  page: LayoutPage;
  pageDraft: PageDraft;
  className?: string;
}) {
  const scene = resolvePageScene({ page, pageDraft });
  const canvas = {
    width: scene.width || SLIDE_SCENE_WIDTH,
    height: scene.height || SLIDE_SCENE_HEIGHT,
  };
  const objects = [...scene.objects].sort((left, right) => (left.zIndex ?? 0) - (right.zIndex ?? 0));

  return (
    <div
      className={`relative h-full min-h-[420px] w-full overflow-hidden ${className}`.trim()}
      style={{ background: scene.background }}
    >
      {objects.map((object) => (
        <SceneObjectView key={object.id} object={object} canvas={canvas} />
      ))}
    </div>
  );
}
