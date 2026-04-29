import {
  createEmptyDataTable,
  parseDataBlockInput,
  stringifyDataTable,
} from "@/features/studio/data-table";
import type {
  DataTableModel,
  HtmlBasicChartSpec,
  HtmlChartAxisStyle,
  HtmlBubbleChartSpec,
  HtmlBubblePoint,
  HtmlChartAxisRole,
  HtmlChartDensity,
  HtmlChartExhibitPreset,
  HtmlChartKind,
  HtmlChartLineDash,
  HtmlChartNativeStyle,
  HtmlChartPresentationAnnotation,
  HtmlChartPresentationEmphasis,
  HtmlChartPresentationSpec,
  HtmlChartSeries,
  HtmlChartSeriesStyle,
  HtmlChartSeriesRole,
  HtmlChartShadowStyle,
  HtmlChartSpec,
  HtmlChartValueFormat,
  HtmlComboChartSpec,
  HtmlMatrixChartSpec,
  HtmlMatrixItem,
  HtmlTableSpec,
} from "@/features/studio/types";

export const CHART_MODULE_KIND = "chart" as const;
export const TABLE_MODULE_KIND = "table" as const;
export const HTML_CHART_SPEC_ATTRIBUTE = "data-html-chart-spec" as const;
export const HTML_TABLE_SPEC_ATTRIBUTE = "data-html-table-spec" as const;

const DEFAULT_BAR_COLORS = ["#5d7f9d", "#90adc6", "#54a6c1", "#2a6f97"];
const DEFAULT_LINE_COLORS = ["#19c6df", "#1d617c", "#84a0b8"];
const DEFAULT_BUBBLE_COLORS = ["#20d3ff", "#8aa1b5", "#9ec7ff", "#74b9c9", "#4f6f89"];
const INVESTOR_CHART_COLORS = ["#173d57", "#c4973d", "#5f7f95", "#8fa39a", "#d7b66f"];
const CHART_POSITIVE = "#4f8f78";
const CHART_NEGATIVE = "#b85f4d";
const CHART_MUTED = "#9fafbd";
const CHART_EXHIBIT_PRESETS = new Set<HtmlChartExhibitPreset>([
  "auto",
  "headline-bars",
  "growth-line",
  "margin-bridge",
  "segment-mix",
  "combo-trend-bars",
]);
const CHART_DENSITIES = new Set<HtmlChartDensity>(["hero", "peer", "sidecar"]);

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeMultilineText(value: string | null | undefined) {
  return (value ?? "")
    .split(/\n+/)
    .map((line) => normalizeText(line))
    .filter(Boolean)
    .join("\n");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseNumberToken(value: string | null | undefined) {
  const normalized = normalizeText(value).replace(/[$€£¥,%]/g, "");
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePercentOrNumberToken(value: string | null | undefined) {
  return parseNumberToken(value);
}

function parseFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeChartLineDash(value: unknown): HtmlChartLineDash | undefined {
  const normalized = normalizeText(typeof value === "string" ? value : "");
  if (normalized === "solid" || normalized === "dash" || normalized === "dot") {
    return normalized;
  }
  return undefined;
}

function normalizeChartLineDashOrNone(value: unknown): HtmlChartAxisStyle["lineDash"] | undefined {
  const normalized = normalizeText(typeof value === "string" ? value : "");
  if (normalized === "none") {
    return "none";
  }
  return normalizeChartLineDash(normalized);
}

function normalizeChartShadowStyle(value: unknown): HtmlChartShadowStyle | null | undefined {
  if (value === null) {
    return null;
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const raw = value as Partial<HtmlChartShadowStyle>;
  const shadow: HtmlChartShadowStyle = {};
  const color = normalizeText(raw.color);
  if (color) {
    shadow.color = color;
  }
  const opacity = parseFiniteNumber(raw.opacity);
  if (opacity !== undefined) {
    shadow.opacity = clamp(opacity, 0, 1);
  }
  const blurPt = parseFiniteNumber(raw.blurPt);
  if (blurPt !== undefined) {
    shadow.blurPt = clamp(blurPt, 0, 60);
  }
  const offsetPt = parseFiniteNumber(raw.offsetPt);
  if (offsetPt !== undefined) {
    shadow.offsetPt = clamp(offsetPt, 0, 60);
  }
  const angle = parseFiniteNumber(raw.angle);
  if (angle !== undefined) {
    shadow.angle = ((angle % 360) + 360) % 360;
  }

  return Object.keys(shadow).length ? shadow : {};
}

function normalizeChartAxisStyle(value: unknown): HtmlChartAxisStyle | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const raw = value as Partial<HtmlChartAxisStyle>;
  const style: HtmlChartAxisStyle = {};
  const lineColor = normalizeText(raw.lineColor);
  if (lineColor) {
    style.lineColor = lineColor;
  }
  const lineWidthPt = parseFiniteNumber(raw.lineWidthPt);
  if (lineWidthPt !== undefined) {
    style.lineWidthPt = clamp(lineWidthPt, 0, 20);
  }
  const lineDash = normalizeChartLineDashOrNone(raw.lineDash);
  if (lineDash) {
    style.lineDash = lineDash;
  }
  const gridColor = normalizeText(raw.gridColor);
  if (gridColor) {
    style.gridColor = gridColor;
  }
  const gridWidthPt = parseFiniteNumber(raw.gridWidthPt);
  if (gridWidthPt !== undefined) {
    style.gridWidthPt = clamp(gridWidthPt, 0, 20);
  }
  const gridDash = normalizeChartLineDashOrNone(raw.gridDash);
  if (gridDash) {
    style.gridDash = gridDash;
  }
  const labelColor = normalizeText(raw.labelColor);
  if (labelColor) {
    style.labelColor = labelColor;
  }
  const labelFontSize = parseFiniteNumber(raw.labelFontSize);
  if (labelFontSize !== undefined) {
    style.labelFontSize = clamp(labelFontSize, 4, 72);
  }

  return Object.keys(style).length ? style : undefined;
}

function normalizeChartNativeStyle(value: unknown): HtmlChartNativeStyle | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const raw = value as Partial<HtmlChartNativeStyle>;
  const style: HtmlChartNativeStyle = {};
  const xAxis = normalizeChartAxisStyle(raw.xAxis);
  if (xAxis) {
    style.xAxis = xAxis;
  }
  const yAxis = normalizeChartAxisStyle(raw.yAxis);
  if (yAxis) {
    style.yAxis = yAxis;
  }
  const secondaryYAxis = normalizeChartAxisStyle(raw.secondaryYAxis);
  if (secondaryYAxis) {
    style.secondaryYAxis = secondaryYAxis;
  }
  if ("chartShadow" in raw) {
    const chartShadow = normalizeChartShadowStyle(raw.chartShadow);
    if (chartShadow !== undefined) {
      style.chartShadow = chartShadow;
    }
  }
  if ("plotShadow" in raw) {
    const plotShadow = normalizeChartShadowStyle(raw.plotShadow);
    if (plotShadow !== undefined) {
      style.plotShadow = plotShadow;
    }
  }
  const bubbleScale = parseFiniteNumber(raw.bubbleScale);
  if (bubbleScale !== undefined) {
    style.bubbleScale = clamp(bubbleScale, 1, 300);
  }

  return Object.keys(style).length ? style : undefined;
}

function normalizeChartSeriesStyle(value: unknown): HtmlChartSeriesStyle | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const raw = value as Partial<HtmlChartSeriesStyle>;
  const style: HtmlChartSeriesStyle = {};
  const lineDash = normalizeChartLineDash(raw.lineDash);
  if (lineDash) {
    style.lineDash = lineDash;
  }
  const lineWidthPt = parseFiniteNumber(raw.lineWidthPt);
  if (lineWidthPt !== undefined) {
    style.lineWidthPt = clamp(lineWidthPt, 0, 20);
  }
  if (raw.marker === "circle" || raw.marker === "none") {
    style.marker = raw.marker;
  }
  if ("shadow" in raw) {
    const shadow = normalizeChartShadowStyle(raw.shadow);
    if (shadow !== undefined) {
      style.shadow = shadow;
    }
  }

  return Object.keys(style).length ? style : undefined;
}

function serializeJson(value: unknown) {
  return JSON.stringify(value).replace(/"/g, "&quot;");
}

function readNumericStyle(
  element: HTMLElement,
  property: "left" | "top" | "right" | "bottom" | "width" | "height",
) {
  const raw = element.style[property];
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readSvgNumericAttribute(element: Element, attribute: string) {
  const parsed = Number.parseFloat(element.getAttribute(attribute) ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeColorKey(value: string | null | undefined) {
  const normalized = normalizeText(value).toLowerCase();
  const hex = normalized.match(/#([0-9a-f]{6})/i)?.[1];
  if (hex) {
    return hex.toLowerCase();
  }

  const rgb = normalized.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!rgb) {
    return normalized;
  }

  return [rgb[1], rgb[2], rgb[3]]
    .map((channel) => {
      const value = clamp(Number(channel) || 0, 0, 255);
      return Math.round(value).toString(16).padStart(2, "0");
    })
    .join("");
}

function readSvgViewBox(svg: SVGSVGElement) {
  const viewBox = normalizeText(svg.getAttribute("viewBox"));
  const parts = viewBox.split(/[\s,]+/).map((part) => Number(part));
  if (parts.length === 4 && parts.every((part) => Number.isFinite(part))) {
    return {
      x: parts[0]!,
      y: parts[1]!,
      width: parts[2]!,
      height: parts[3]!,
    };
  }

  return {
    x: 0,
    y: 0,
    width: readSvgNumericAttribute(svg, "width") || 1,
    height: readSvgNumericAttribute(svg, "height") || 1,
  };
}

function parseSvgPointList(raw: string | null | undefined) {
  const tokens = normalizeText(raw).split(/\s+/).filter(Boolean);
  const points = tokens
    .map((token) => {
      const [x, y] = token.split(",").map((part) => Number(part));
      return Number.isFinite(x) && Number.isFinite(y) ? { x: x!, y: y! } : null;
    })
    .filter((point): point is { x: number; y: number } => Boolean(point));
  return points;
}

function isPageScaleElement(element: HTMLElement) {
  if (element.matches("section.page,.export-page-shell")) {
    return true;
  }

  const width = readNumericStyle(element, "width");
  const height = readNumericStyle(element, "height");
  return width >= 1200 && height >= 700;
}

function readNearestElementHeadings(root: HTMLElement) {
  const headingRoot =
    root.closest<HTMLElement>('[data-html-visual-kind="chart-frame"]') ??
    root.parentElement ??
    root;
  const headings = Array.from(headingRoot.querySelectorAll<HTMLElement>('[data-html-block-kind="heading"]'))
    .map((element) => normalizeText(element.textContent))
    .filter(Boolean);

  return {
    title: headings[0] ?? "",
    subtitle: headings[1] ?? "",
  };
}

function collectLocalPlotRoots(root: HTMLElement) {
  const directChildren = Array.from(root.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  return [root, ...directChildren].filter((element, index, elements) => {
    if (elements.indexOf(element) !== index || isPageScaleElement(element)) {
      return false;
    }

    const position = normalizeText(element.style.position);
    const height = readNumericStyle(element, "height");
    return position === "relative" || height > 0;
  });
}

function getModuleRoot(element: Element) {
  return element.closest(
    `[data-html-module-kind="${CHART_MODULE_KIND}"],[data-html-module-kind="${TABLE_MODULE_KIND}"]`,
  );
}

function containsModuleRoot(element: Element) {
  return Boolean(
    element.querySelector(
      `[data-html-module-kind="${CHART_MODULE_KIND}"],[data-html-module-kind="${TABLE_MODULE_KIND}"]`,
    ),
  );
}

function elementDepth(element: Element) {
  let depth = 0;
  let current: Element | null = element;
  while (current.parentElement) {
    depth += 1;
    current = current.parentElement;
  }
  return depth;
}

function normalizeSeriesLabel(label: string | null | undefined, fallback: string) {
  const normalized = normalizeText(label);
  return normalized || fallback;
}

function normalizeChartText(value: string | null | undefined, fallback = "") {
  return normalizeText(value) || fallback;
}

function normalizeChartRatio(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, 0, 1) : fallback;
}

function isSeriesChartSpec(
  spec: HtmlChartSpec,
): spec is HtmlBasicChartSpec | HtmlComboChartSpec {
  return (
    spec.kind === "bar" ||
    spec.kind === "stacked" ||
    spec.kind === "line" ||
    spec.kind === "waterfall" ||
    spec.kind === "combo"
  );
}

function cloneChartShadowStyle(style: HtmlChartShadowStyle | null | undefined) {
  return style ? { ...style } : style;
}

function cloneChartAxisStyle(style: HtmlChartAxisStyle | undefined) {
  return style ? { ...style } : style;
}

function cloneChartNativeStyle(style: HtmlChartNativeStyle | undefined) {
  return style
    ? {
        ...style,
        xAxis: cloneChartAxisStyle(style.xAxis),
        yAxis: cloneChartAxisStyle(style.yAxis),
        secondaryYAxis: cloneChartAxisStyle(style.secondaryYAxis),
        chartShadow: cloneChartShadowStyle(style.chartShadow),
        plotShadow: cloneChartShadowStyle(style.plotShadow),
      }
    : style;
}

function cloneChartSeriesStyle(style: HtmlChartSeriesStyle | undefined) {
  return style
    ? {
        ...style,
        shadow: cloneChartShadowStyle(style.shadow),
      }
    : style;
}

function cloneChartSpecForUpdate(spec: HtmlChartSpec): HtmlChartSpec {
  if (spec.kind === "bubble") {
    return {
      ...spec,
      points: spec.points.map((point) => ({ ...point })),
      style: cloneChartNativeStyle(spec.style),
    };
  }
  if (spec.kind === "matrix") {
    return {
      ...spec,
      plotBounds: spec.plotBounds ? { ...spec.plotBounds } : spec.plotBounds,
      quadrants: spec.quadrants?.map((quadrant) => ({ ...quadrant })),
      items: spec.items.map((item) => ({ ...item })),
      callout: spec.callout ? { ...spec.callout } : spec.callout,
      colors: spec.colors ? [...spec.colors] : spec.colors,
    };
  }
  return {
    ...spec,
    style: cloneChartNativeStyle(spec.style),
    series: spec.series.map((series) => ({
      ...series,
      values: [...series.values],
      style: cloneChartSeriesStyle(series.style),
    })),
  };
}

function pickColor(index: number, role: HtmlChartSeriesRole = "bar") {
  const palette = role === "line" ? DEFAULT_LINE_COLORS : DEFAULT_BAR_COLORS;
  return palette[index % palette.length]!;
}

function pickInvestorColor(index: number, role: HtmlChartSeriesRole = "bar") {
  if (role === "line") {
    return DEFAULT_LINE_COLORS[index % DEFAULT_LINE_COLORS.length]!;
  }
  return INVESTOR_CHART_COLORS[index % INVESTOR_CHART_COLORS.length]!;
}

function normalizeChartScale(value: unknown): HtmlChartValueFormat["scale"] {
  return value === "thousand" || value === "million" || value === "billion" ? value : "raw";
}

function inferChartValueFormat(unit: string): HtmlChartValueFormat {
  const normalized = normalizeText(unit);
  if (!normalized) {
    return { decimals: 0, scale: "raw" };
  }
  if (normalized.includes("%")) {
    return { suffix: "%", decimals: 0, scale: "raw" };
  }
  const currency = /^([$€£¥])\s*(.*)$/.exec(normalized);
  if (currency) {
    const suffix = normalizeText(currency[2]);
    return {
      prefix: currency[1],
      suffix,
      decimals: suffix ? 1 : 0,
      scale: "raw",
    };
  }
  return {
    suffix: normalized.length <= 5 ? normalized : ` ${normalized}`,
    decimals: normalized.length <= 5 ? 0 : 1,
    scale: "raw",
  };
}

function normalizeChartValueFormat(value: unknown, unit: string): HtmlChartValueFormat {
  const inferred = inferChartValueFormat(unit);
  if (!value || typeof value !== "object") {
    return inferred;
  }
  const candidate = value as Partial<HtmlChartValueFormat>;
  return {
    prefix: normalizeText(candidate.prefix) || inferred.prefix,
    suffix: normalizeText(candidate.suffix) || inferred.suffix,
    decimals:
      Number.isFinite(candidate.decimals) && (candidate.decimals ?? 0) >= 0
        ? clamp(Math.round(candidate.decimals as number), 0, 3)
        : inferred.decimals,
    scale: normalizeChartScale(candidate.scale ?? inferred.scale),
  };
}

function chartScaleDivisor(scale: HtmlChartValueFormat["scale"] | undefined) {
  switch (scale) {
    case "thousand":
      return 1_000;
    case "million":
      return 1_000_000;
    case "billion":
      return 1_000_000_000;
    default:
      return 1;
  }
}

function formatChartValue(value: number, format: HtmlChartValueFormat | undefined) {
  const divisor = chartScaleDivisor(format?.scale);
  const scaled = value / divisor;
  const decimals = clamp(Math.round(format?.decimals ?? (Math.abs(scaled) < 10 && scaled !== 0 ? 1 : 0)), 0, 3);
  const absolute = Math.abs(scaled);
  const body = absolute.toLocaleString("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
  const sign = scaled < 0 ? "-" : "";
  return `${sign}${format?.prefix ?? ""}${body}${format?.suffix ?? ""}`;
}

type PresentableChartSpec = Exclude<HtmlChartSpec, HtmlMatrixChartSpec>;

function normalizePresentationTarget(value: unknown): HtmlChartPresentationEmphasis["target"] | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as HtmlChartPresentationEmphasis["target"];
  const category = normalizeText(candidate.category);
  const seriesId = normalizeText(candidate.seriesId);
  const pointIndex =
    Number.isFinite(candidate.pointIndex) && (candidate.pointIndex ?? -1) >= 0
      ? Math.round(candidate.pointIndex as number)
      : undefined;
  if (!category && !seriesId && pointIndex === undefined) {
    return null;
  }
  return {
    ...(category ? { category } : {}),
    ...(seriesId ? { seriesId } : {}),
    ...(pointIndex !== undefined ? { pointIndex } : {}),
  };
}

function normalizePresentationEmphasis(value: unknown): HtmlChartPresentationEmphasis[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const candidate = item as Partial<HtmlChartPresentationEmphasis>;
    const target = normalizePresentationTarget(candidate.target);
    const role =
      candidate.role === "positive" ||
      candidate.role === "negative" ||
      candidate.role === "muted" ||
      candidate.role === "primary"
        ? candidate.role
        : "primary";
    if (!target) {
      return [];
    }
    return [{
      id: normalizeText(candidate.id) || `emphasis-${index + 1}`,
      target,
      role,
    }];
  });
}

function normalizePresentationAnnotations(value: unknown): HtmlChartPresentationAnnotation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const candidate = item as Partial<HtmlChartPresentationAnnotation>;
    const target = normalizePresentationTarget(candidate.target);
    const text = normalizeText(candidate.text);
    const placement =
      candidate.placement === "above" ||
      candidate.placement === "right" ||
      candidate.placement === "below" ||
      candidate.placement === "auto"
        ? candidate.placement
        : "auto";
    if (!target || !text) {
      return [];
    }
    return [{
      id: normalizeText(candidate.id) || `annotation-${index + 1}`,
      target,
      text,
      placement,
    }];
  });
}

function buildDefaultChartEmphasis(spec: PresentableChartSpec): HtmlChartPresentationEmphasis[] {
  if (spec.kind === "bubble") {
    const largestIndex = spec.points.reduce(
      (bestIndex, point, index) => (point.size > (spec.points[bestIndex]?.size ?? 0) ? index : bestIndex),
      0,
    );
    return spec.points.length
      ? [{
          id: "emphasis-largest-bubble",
          target: { pointIndex: largestIndex },
          role: "primary",
        }]
      : [];
  }

  if (spec.kind === "line") {
    return spec.categories.length
      ? [{
          id: "emphasis-latest-point",
          target: {
            category: spec.categories[spec.categories.length - 1],
            seriesId: spec.series[0]?.id,
            pointIndex: spec.categories.length - 1,
          },
          role: "primary",
        }]
      : [];
  }

  if (spec.kind === "combo") {
    const lineSeries = spec.series.find((series) => (series.role ?? "bar") === "line") ?? spec.series[0];
    return lineSeries && spec.categories.length
      ? [{
          id: "emphasis-latest-combo-line",
          target: {
            category: spec.categories[spec.categories.length - 1],
            seriesId: lineSeries.id,
            pointIndex: spec.categories.length - 1,
          },
          role: "primary",
        }]
      : [];
  }

  const firstSeries = spec.series[0];
  if (!firstSeries?.values.length) {
    return [];
  }
  const bestIndex = firstSeries.values.reduce(
    (best, value, index) => (Math.abs(value) > Math.abs(firstSeries.values[best] ?? 0) ? index : best),
    0,
  );
  return [{
    id: spec.kind === "waterfall" ? "emphasis-ending-value" : "emphasis-largest-value",
    target: {
      category: spec.categories[bestIndex],
      seriesId: firstSeries.id,
      pointIndex: bestIndex,
    },
    role: firstSeries.values[bestIndex] && firstSeries.values[bestIndex]! < 0 ? "negative" : "primary",
  }];
}

function inferChartExhibitPreset(spec: PresentableChartSpec): HtmlChartExhibitPreset {
  if (spec.kind === "waterfall") {
    return "margin-bridge";
  }
  if (spec.kind === "stacked") {
    return "segment-mix";
  }
  if (spec.kind === "line") {
    return "growth-line";
  }
  if (spec.kind === "combo") {
    return "combo-trend-bars";
  }
  return "headline-bars";
}

function normalizeChartExhibitPreset(value: unknown, spec: PresentableChartSpec): HtmlChartExhibitPreset {
  return typeof value === "string" && CHART_EXHIBIT_PRESETS.has(value as HtmlChartExhibitPreset)
    ? value as HtmlChartExhibitPreset
    : inferChartExhibitPreset(spec);
}

function normalizeChartDensity(value: unknown): HtmlChartDensity {
  return typeof value === "string" && CHART_DENSITIES.has(value as HtmlChartDensity)
    ? value as HtmlChartDensity
    : "hero";
}

function normalizeChartPresentationSpec(
  value: unknown,
  spec: PresentableChartSpec,
): HtmlChartPresentationSpec {
  const candidate = value && typeof value === "object" ? value as Partial<HtmlChartPresentationSpec> : {};
  const emphasis = normalizePresentationEmphasis(candidate.emphasis);
  return {
    version: 2,
    preset: "investor-editorial",
    exhibitPreset: normalizeChartExhibitPreset(candidate.exhibitPreset, spec),
    density: normalizeChartDensity(candidate.density),
    valueFormat: normalizeChartValueFormat(candidate.valueFormat, spec.unit),
    emphasis: emphasis.length ? emphasis : buildDefaultChartEmphasis(spec),
    annotations: normalizePresentationAnnotations(candidate.annotations),
  };
}

function withNormalizedChartPresentation<T extends PresentableChartSpec>(spec: T, rawPresentation: unknown): T {
  return {
    ...spec,
    presentation: normalizeChartPresentationSpec(rawPresentation, spec),
  };
}

function normalizeChartSeries(
  series: Partial<HtmlChartSeries>,
  index: number,
  pointCount: number,
  defaults?: { role?: HtmlChartSeriesRole; axis?: HtmlChartAxisRole },
): HtmlChartSeries {
  return {
    id: normalizeText(series.id) || `series-${index + 1}`,
    label: normalizeSeriesLabel(series.label, `Series ${index + 1}`),
    values: Array.from({ length: pointCount }, (_, valueIndex) => {
      const rawValue = series.values?.[valueIndex];
      return Number.isFinite(rawValue as number) ? Number(rawValue) : 0;
    }),
    color: normalizeText(series.color) || pickColor(index, defaults?.role ?? "bar"),
    role: defaults?.role ?? series.role ?? "bar",
    axis: defaults?.axis ?? series.axis ?? "primary",
    style: normalizeChartSeriesStyle(series.style),
  };
}

export function serializeHtmlChartSpec(spec: HtmlChartSpec) {
  return JSON.stringify(spec.kind === "matrix" ? spec : withNormalizedChartPresentation(spec, spec.presentation));
}

export function parseHtmlChartSpec(raw: string | null | undefined): HtmlChartSpec | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<HtmlChartSpec>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (parsed.kind === "bubble") {
      const bubble = parsed as Partial<HtmlBubbleChartSpec>;
      const points = Array.isArray(bubble.points)
        ? bubble.points.map((point, index) => ({
            id: normalizeText(point?.id) || `point-${index + 1}`,
            label: normalizeSeriesLabel(point?.label, `Point ${index + 1}`),
            x: Number(point?.x) || 0,
            y: Number(point?.y) || 0,
            size: Math.max(1, Number(point?.size) || 1),
            color: normalizeText(point?.color) || DEFAULT_BUBBLE_COLORS[index % DEFAULT_BUBBLE_COLORS.length]!,
            group: normalizeText(point?.group) || null,
          }))
        : [];
      if (!points.length) {
        return null;
      }
      return withNormalizedChartPresentation({
        kind: "bubble",
        title: normalizeChartText(bubble.title),
        subtitle: normalizeChartText(bubble.subtitle),
        insight: normalizeChartText(bubble.insight),
        unit: normalizeChartText(bubble.unit),
        xLabel: normalizeChartText(bubble.xLabel, "X axis"),
        yLabel: normalizeChartText(bubble.yLabel, "Y axis"),
        sizeLabel: normalizeChartText(bubble.sizeLabel, "Bubble size"),
        points,
        style: normalizeChartNativeStyle(bubble.style),
      }, (parsed as { presentation?: unknown }).presentation);
    }

    if (parsed.kind === "matrix") {
      const matrix = parsed as Partial<HtmlMatrixChartSpec>;
      const items = Array.isArray(matrix.items)
        ? matrix.items
            .map((item, index) => ({
              id: normalizeText(item?.id) || `item-${index + 1}`,
              label: normalizeSeriesLabel(item?.label, `Item ${index + 1}`),
              detail: normalizeChartText(item?.detail),
              x: normalizeChartRatio(item?.x, index % 2 ? 0.56 : 0.08),
              y: normalizeChartRatio(item?.y, index < 2 ? 0.08 : 0.56),
              w: normalizeChartRatio(item?.w, 0.34),
              h: normalizeChartRatio(item?.h, 0.24),
              color: normalizeText(item?.color) || DEFAULT_BAR_COLORS[index % DEFAULT_BAR_COLORS.length]!,
              textColor: normalizeText(item?.textColor) || null,
            }))
            .filter((item) => item.label)
        : [];
      if (!items.length) {
        return null;
      }
      const quadrants = Array.isArray(matrix.quadrants)
        ? matrix.quadrants.map((quadrant, index) => ({
            id: normalizeText(quadrant?.id) || `quadrant-${index + 1}`,
            label: normalizeChartText(quadrant?.label),
            x: normalizeChartRatio(quadrant?.x, index % 2 ? 0.5 : 0),
            y: normalizeChartRatio(quadrant?.y, index > 1 ? 0.5 : 0),
            w: normalizeChartRatio(quadrant?.w, 0.5),
            h: normalizeChartRatio(quadrant?.h, 0.5),
            color: normalizeText(quadrant?.color) || null,
            textColor: normalizeText(quadrant?.textColor) || null,
          }))
        : undefined;
      const callout = matrix.callout
        ? {
            title: normalizeChartText(matrix.callout.title),
            body: normalizeChartText(matrix.callout.body),
            x: normalizeChartRatio(matrix.callout.x, 0.7),
            y: normalizeChartRatio(matrix.callout.y, 0.08),
            w: normalizeChartRatio(matrix.callout.w, 0.24),
            h: normalizeChartRatio(matrix.callout.h, 0.24),
            color: normalizeText(matrix.callout.color) || null,
            textColor: normalizeText(matrix.callout.textColor) || null,
            borderColor: normalizeText(matrix.callout.borderColor) || null,
          }
        : null;
      return {
        kind: "matrix",
        title: normalizeChartText(matrix.title),
        subtitle: normalizeChartText(matrix.subtitle),
        insight: normalizeChartText(matrix.insight),
        xLabel: normalizeChartText(matrix.xLabel, "X axis"),
        yLabel: normalizeChartText(matrix.yLabel, "Y axis"),
        xMinLabel: normalizeChartText(matrix.xMinLabel),
        xMaxLabel: normalizeChartText(matrix.xMaxLabel),
        yMinLabel: normalizeChartText(matrix.yMinLabel),
        yMaxLabel: normalizeChartText(matrix.yMaxLabel),
        plotBounds: matrix.plotBounds
          ? {
              x: normalizeChartRatio(matrix.plotBounds.x, 0),
              y: normalizeChartRatio(matrix.plotBounds.y, 0),
              w: normalizeChartRatio(matrix.plotBounds.w, 1),
              h: normalizeChartRatio(matrix.plotBounds.h, 1),
            }
          : null,
        quadrants,
        items,
        callout,
        colors: Array.isArray(matrix.colors) ? matrix.colors.map(normalizeText).filter(Boolean) : undefined,
      };
    }

    const kind = parsed.kind;
    if (
      kind !== "bar" &&
      kind !== "stacked" &&
      kind !== "line" &&
      kind !== "waterfall" &&
      kind !== "combo"
    ) {
      return null;
    }

    const categories = Array.isArray((parsed as { categories?: string[] }).categories)
      ? ((parsed as { categories?: string[] }).categories ?? []).map((value) => normalizeText(value)).filter(Boolean)
      : [];
    const rawSeries = Array.isArray((parsed as { series?: Partial<HtmlChartSeries>[] }).series)
      ? (parsed as { series?: Partial<HtmlChartSeries>[] }).series ?? []
      : [];
    const pointCount =
      categories.length ||
      Math.max(
        0,
        ...rawSeries.map((series) => (Array.isArray(series.values) ? series.values.length : 0)),
      );
    if (!pointCount || !rawSeries.length) {
      return null;
    }

    const series = rawSeries.map((item, index) =>
      normalizeChartSeries(item, index, pointCount, {
        role: kind === "combo" ? (index === 0 ? "bar" : "line") : kind === "line" ? "line" : "bar",
        axis: kind === "combo" && index > 0 ? "secondary" : "primary",
      }),
    );

    if (kind === "combo") {
      return withNormalizedChartPresentation({
        kind: "combo",
        title: normalizeChartText((parsed as { title?: string }).title),
        subtitle: normalizeChartText((parsed as { subtitle?: string }).subtitle),
        insight: normalizeChartText((parsed as { insight?: string }).insight),
        unit: normalizeChartText((parsed as { unit?: string }).unit),
        secondaryUnit: normalizeChartText((parsed as { secondaryUnit?: string }).secondaryUnit),
        valueAxisMin: parseFiniteNumber((parsed as { valueAxisMin?: unknown }).valueAxisMin),
        valueAxisMax: parseFiniteNumber((parsed as { valueAxisMax?: unknown }).valueAxisMax),
        style: normalizeChartNativeStyle((parsed as { style?: unknown }).style),
        categories:
          categories.length > 0
            ? categories
            : Array.from({ length: pointCount }, (_, index) => `Category ${index + 1}`),
        series,
      }, (parsed as { presentation?: unknown }).presentation);
    }

    return withNormalizedChartPresentation({
      kind,
      title: normalizeChartText((parsed as { title?: string }).title),
      subtitle: normalizeChartText((parsed as { subtitle?: string }).subtitle),
      insight: normalizeChartText((parsed as { insight?: string }).insight),
      unit: normalizeChartText((parsed as { unit?: string }).unit),
      valueAxisMin: parseFiniteNumber((parsed as { valueAxisMin?: unknown }).valueAxisMin),
      valueAxisMax: parseFiniteNumber((parsed as { valueAxisMax?: unknown }).valueAxisMax),
      style: normalizeChartNativeStyle((parsed as { style?: unknown }).style),
      categories:
        categories.length > 0
          ? categories
          : Array.from({ length: pointCount }, (_, index) => `Category ${index + 1}`),
      series,
    }, (parsed as { presentation?: unknown }).presentation);
  } catch {
    return null;
  }
}

export function serializeHtmlTableSpec(spec: HtmlTableSpec) {
  return JSON.stringify(spec);
}

export function parseHtmlTableSpec(raw: string | null | undefined): HtmlTableSpec | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<HtmlTableSpec>;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.columns) || !Array.isArray(parsed.rows)) {
      return null;
    }
    return {
      raw: typeof parsed.raw === "string" ? parsed.raw : stringifyDataTable({
        raw: "",
        hasHeader: parsed.hasHeader !== false,
        columns: parsed.columns.map((column, index) => ({
          id: normalizeText(column?.id) || `column-${index + 1}`,
          label: normalizeSeriesLabel(column?.label, `Column ${index + 1}`),
          type: column?.type ?? "text",
        })),
        rows: parsed.rows.map((row) => row.map((cell) => String(cell ?? ""))),
      }),
      hasHeader: parsed.hasHeader !== false,
      columns: parsed.columns.map((column, index) => ({
        id: normalizeText(column?.id) || `column-${index + 1}`,
        label: normalizeSeriesLabel(column?.label, `Column ${index + 1}`),
        type: column?.type ?? "text",
      })),
      rows: parsed.rows.map((row) => row.map((cell) => String(cell ?? ""))),
    };
  } catch {
    return null;
  }
}

type ExportChartSeries = {
  name?: string;
  label?: string;
  value?: number;
  values?: number[];
  color?: string;
  role?: HtmlChartSeriesRole;
  axis?: HtmlChartAxisRole;
};

type ExportChartPayload = {
  kind?: string;
  categories?: string[];
  series?: ExportChartSeries[];
  title?: string;
  subtitle?: string;
  insight?: string;
  unit?: string;
  secondaryUnit?: string;
  presentation?: HtmlChartPresentationSpec;
};

function parseExportChartPayload(element: HTMLElement): HtmlChartSpec | null {
  const raw = element.getAttribute("data-export-chart");
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as ExportChartPayload;
    const kind = parsed.kind;
    if (kind !== "bar" && kind !== "stacked" && kind !== "line" && kind !== "waterfall" && kind !== "combo") {
      return null;
    }
    const categories = (parsed.categories ?? []).map((value) => normalizeText(value)).filter(Boolean);
    const rawSeries = (parsed.series ?? [])
      .map((series, index) => {
        const values = Array.isArray(series.values)
          ? series.values.map((value) => Number(value) || 0)
          : series.value !== undefined
            ? [Number(series.value) || 0]
            : [];
        if (!values.length) {
          return null;
        }
        return {
          id: `series-${index + 1}`,
          label: normalizeSeriesLabel(series.name ?? series.label, `Series ${index + 1}`),
          values,
          color: normalizeText(series.color) || pickInvestorColor(index, kind === "line" ? "line" : "bar"),
          role:
            kind === "combo"
              ? series.role ?? (index === 0 ? "bar" : "line")
              : kind === "line"
                ? ("line" as const)
                : ("bar" as const),
          axis: kind === "combo" && index > 0 ? series.axis ?? "secondary" : series.axis ?? "primary",
        } satisfies HtmlChartSeries;
      })
      .filter(Boolean) as HtmlChartSeries[];
    if (!rawSeries.length) {
      return null;
    }
    const pointCount = categories.length || Math.max(...rawSeries.map((series) => series.values.length), 0);
    if (kind === "combo") {
      return withNormalizedChartPresentation({
        kind: "combo",
        title: normalizeChartText(parsed.title),
        subtitle: normalizeChartText(parsed.subtitle),
        insight: normalizeChartText(parsed.insight),
        unit: normalizeChartText(parsed.unit),
        secondaryUnit: normalizeChartText(parsed.secondaryUnit),
        categories:
          categories.length > 0
            ? categories
            : Array.from({ length: pointCount }, (_, index) => `Category ${index + 1}`),
        series: rawSeries.map((series, index) => normalizeChartSeries(series, index, pointCount, {
          role: index === 0 ? "bar" : "line",
          axis: index === 0 ? "primary" : "secondary",
        })),
      }, parsed.presentation);
    }
    return withNormalizedChartPresentation({
      kind,
      title: normalizeChartText(parsed.title),
      subtitle: normalizeChartText(parsed.subtitle),
      insight: normalizeChartText(parsed.insight),
      unit: normalizeChartText(parsed.unit),
      categories:
        categories.length > 0
          ? categories
          : Array.from({ length: pointCount }, (_, index) => `Category ${index + 1}`),
      series: rawSeries.map((series, index) => normalizeChartSeries(series, index, pointCount, {
        role: kind === "line" ? "line" : "bar",
        axis: "primary",
      })),
    }, parsed.presentation);
  } catch {
    return null;
  }
}

function setModuleMetadata(args: {
  element: Element;
  moduleKind: typeof CHART_MODULE_KIND | typeof TABLE_MODULE_KIND;
  moduleLabel: string;
  visualKind: "chart-frame" | "surface";
  chartSpec?: HtmlChartSpec | null;
  tableSpec?: HtmlTableSpec | null;
}) {
  args.element.setAttribute("data-html-module-kind", args.moduleKind);
  args.element.setAttribute("data-html-module-label", args.moduleLabel);
  args.element.setAttribute("data-html-visual-kind", args.visualKind);
  args.element.setAttribute("data-html-fit-role", "content");
  if (args.chartSpec) {
    args.element.setAttribute(HTML_CHART_SPEC_ATTRIBUTE, serializeHtmlChartSpec(args.chartSpec));
  } else {
    args.element.removeAttribute(HTML_CHART_SPEC_ATTRIBUTE);
  }
  if (args.tableSpec) {
    args.element.setAttribute(HTML_TABLE_SPEC_ATTRIBUTE, serializeHtmlTableSpec(args.tableSpec));
  } else {
    args.element.removeAttribute(HTML_TABLE_SPEC_ATTRIBUTE);
  }
}

function resolveChartModuleTarget(element: Element) {
  const chartFrame = element.closest('[data-html-visual-kind="chart-frame"],[data-export-role="chart-frame"]');
  return chartFrame && chartFrame !== element ? chartFrame : element;
}

function parseTableElement(element: HTMLTableElement): HtmlTableSpec | null {
  const rows = Array.from(element.querySelectorAll("tr"))
    .map((row) =>
      Array.from(row.querySelectorAll("th, td")).map((cell) => normalizeMultilineText(cell.textContent))
    )
    .filter((row) => row.some(Boolean));
  if (rows.length < 2) {
    return null;
  }
  const header = rows[0]!;
  const dataRows = rows.slice(1);
  const raw = stringifyDataTable({
    raw: "",
    hasHeader: true,
    columns: header.map((label, index) => ({
      id: `column-${index + 1}`,
      label: label || `Column ${index + 1}`,
      type: "text",
    })),
    rows: dataRows,
  });
  return parseDataBlockInput(raw);
}

type PositionedTextNode = {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  weight: number;
  element: HTMLElement;
};

function collectAbsoluteTextNodes(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>("[style*='position:absolute'],[style*='position: absolute']"))
    .filter((element) => {
      if (getModuleRoot(element) && getModuleRoot(element) !== root) {
        return false;
      }
      const text = normalizeMultilineText(element.textContent);
      if (!text) {
        return false;
      }
      const hasChildTextBlocks = Array.from(element.children).some((child) =>
        /^H[1-6]$/.test(child.tagName) ||
        child.tagName === "P" ||
        child.hasAttribute("data-html-block-id"),
      );
      return !hasChildTextBlocks || element.hasAttribute("data-html-block-id");
    })
    .map((element) => ({
      text: normalizeMultilineText(element.textContent),
      left: readNumericStyle(element, "left"),
      top: readNumericStyle(element, "top"),
      width: readNumericStyle(element, "width"),
      height: readNumericStyle(element, "height"),
      weight: Number.parseFloat(element.style.fontWeight || "400") || 400,
      element,
    }))
    .filter((node) => node.text);
}

function clusterPositions(values: number[], tolerance: number) {
  const clusters: number[] = [];
  values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)
    .forEach((value) => {
      const existingIndex = clusters.findIndex((cluster) => Math.abs(cluster - value) <= tolerance);
      if (existingIndex >= 0) {
        clusters[existingIndex] = (clusters[existingIndex]! + value) / 2;
      } else {
        clusters.push(value);
      }
    });
  return clusters;
}

function buildPseudoTableSpec(root: HTMLElement): HtmlTableSpec | null {
  const texts = collectAbsoluteTextNodes(root);
  if (texts.length < 12) {
    return null;
  }
  const rowClusters = clusterPositions(texts.map((node) => node.top), 28);
  const colClusters = clusterPositions(texts.map((node) => node.left), 90);
  if (rowClusters.length < 4 || colClusters.length < 3) {
    return null;
  }

  const grid = Array.from({ length: rowClusters.length }, () =>
    Array.from({ length: colClusters.length }, () => [] as string[]),
  );
  for (const node of texts) {
    const rowIndex = rowClusters.findIndex((rowTop) => Math.abs(rowTop - node.top) <= 28);
    const colIndex = colClusters.findIndex((colLeft) => Math.abs(colLeft - node.left) <= 110);
    if (rowIndex < 0 || colIndex < 0) {
      continue;
    }
    grid[rowIndex]![colIndex]!.push(node.text);
  }

  const normalizedRows = grid
    .map((row) => row.map((cell) => Array.from(new Set(cell)).join("\n").trim()))
    .filter((row) => row.some(Boolean));
  if (normalizedRows.length < 3) {
    return null;
  }

  const header = normalizedRows[0]!;
  const bodyRows = normalizedRows.slice(1).filter((row) => row.some(Boolean));
  if (header.filter(Boolean).length < 3 || bodyRows.length < 2) {
    return null;
  }

  const raw = stringifyDataTable({
    raw: "",
    hasHeader: true,
    columns: header.map((label, index) => ({
      id: `column-${index + 1}`,
      label: label || `Column ${index + 1}`,
      type: "text",
    })),
    rows: bodyRows,
  });
  return parseDataBlockInput(raw);
}

function detectWaterfallChartSpec(svg: SVGSVGElement): HtmlChartSpec | null {
  const dashedLines = Array.from(svg.querySelectorAll("line")).filter((line) =>
    normalizeText(line.getAttribute("stroke-dasharray")).length > 0,
  );
  const rects = Array.from(svg.querySelectorAll("rect")).filter((rect) => {
    const width = readSvgNumericAttribute(rect, "width");
    const height = readSvgNumericAttribute(rect, "height");
    return width >= 30 && height >= 20;
  });
  if (rects.length < 4 || dashedLines.length < 2) {
    return null;
  }

  const labels = Array.from(svg.querySelectorAll("text"))
    .map((text) => ({
      text: normalizeText(text.textContent),
      x: readSvgNumericAttribute(text, "x"),
      y: readSvgNumericAttribute(text, "y"),
    }))
    .filter((item) => item.text);
  const bottomLabels = labels.filter((label) => label.y >= 470).sort((left, right) => left.x - right.x);
  const topValues = labels
    .filter((label) => label.y < 390 && label.text !== "0")
    .filter((label) => parsePercentOrNumberToken(label.text) !== null)
    .sort((left, right) => left.x - right.x);
  if (bottomLabels.length < rects.length || topValues.length < rects.length) {
    return null;
  }

  const categories = bottomLabels.slice(0, rects.length).map((item) => item.text);
  const values = topValues.slice(0, rects.length).map((item) => parsePercentOrNumberToken(item.text) ?? 0);
  const title = labels.find((label) => label.y <= 40)?.text ?? "";
  const subtitle = labels.find((label) => label.y > 40 && label.y <= 62)?.text ?? "";

  return {
    kind: "waterfall",
    title,
    subtitle,
    insight: "",
    unit: "",
    categories,
    series: [
      {
        id: "series-1",
        label: "Value",
        values,
        color: DEFAULT_BAR_COLORS[0],
        role: "bar",
        axis: "primary",
      },
    ],
  };
}

function detectComboChartSpec(svg: SVGSVGElement): HtmlChartSpec | null {
  const rects = Array.from(svg.querySelectorAll("rect")).filter((rect) => {
    const width = readSvgNumericAttribute(rect, "width");
    const height = readSvgNumericAttribute(rect, "height");
    return width >= 30 && height >= 20;
  });
  const paths = Array.from(svg.querySelectorAll("path"));
  const circles = Array.from(svg.querySelectorAll("circle"));
  if (rects.length < 3 || !paths.length || circles.length < 3) {
    return null;
  }
  const labels = Array.from(svg.querySelectorAll("text"))
    .map((text) => ({
      text: normalizeText(text.textContent),
      x: readSvgNumericAttribute(text, "x"),
      y: readSvgNumericAttribute(text, "y"),
    }))
    .filter((item) => item.text);
  const categories = labels.filter((label) => label.y >= 440).sort((left, right) => left.x - right.x);
  if (categories.length < rects.length) {
    return null;
  }
  const leftTicks = labels.filter((label) => label.x <= 90 && parsePercentOrNumberToken(label.text) !== null);
  const rightTicks = labels.filter((label) => label.x >= 1280 && parsePercentOrNumberToken(label.text) !== null);
  const topBarValues = labels
    .filter((label) => label.y < 390 && label.text.startsWith("$"))
    .sort((left, right) => left.x - right.x);
  const topLineValues = labels
    .filter((label) => label.y < 260 && label.text.includes("%"))
    .sort((left, right) => left.x - right.x);
  const orderedRects = [...rects].sort(
    (left, right) => readSvgNumericAttribute(left, "x") - readSvgNumericAttribute(right, "x"),
  );
  const orderedCircles = [...circles].sort(
    (left, right) => readSvgNumericAttribute(left, "cx") - readSvgNumericAttribute(right, "cx"),
  );
  const categoryLabels = categories.slice(0, orderedRects.length).map((item) => item.text);

  const barValues =
    topBarValues.length >= orderedRects.length
      ? topBarValues.slice(0, orderedRects.length).map((item) => parsePercentOrNumberToken(item.text) ?? 0)
      : (() => {
          if (leftTicks.length < 2) {
            return orderedRects.map((rect) => readSvgNumericAttribute(rect, "height"));
          }
          const top = Math.min(...leftTicks.map((tick) => tick.y));
          const bottom = Math.max(...leftTicks.map((tick) => tick.y));
          const topValue = Math.max(...leftTicks.map((tick) => parsePercentOrNumberToken(tick.text) ?? 0));
          const bottomValue = Math.min(...leftTicks.map((tick) => parsePercentOrNumberToken(tick.text) ?? 0));
          const scale = (topValue - bottomValue) / Math.max(1, bottom - top);
          return orderedRects.map((rect) => {
            const y = readSvgNumericAttribute(rect, "y");
            const height = readSvgNumericAttribute(rect, "height");
            return Math.max(0, bottomValue + (bottom - (y + height)) * scale);
          });
        })();

  const lineValues =
    topLineValues.length >= orderedCircles.length
      ? topLineValues.slice(0, orderedCircles.length).map((item) => parsePercentOrNumberToken(item.text) ?? 0)
      : (() => {
          if (rightTicks.length < 2) {
            return orderedCircles.map((circle) => readSvgNumericAttribute(circle, "cy"));
          }
          const top = Math.min(...rightTicks.map((tick) => tick.y));
          const bottom = Math.max(...rightTicks.map((tick) => tick.y));
          const topValue = Math.max(...rightTicks.map((tick) => parsePercentOrNumberToken(tick.text) ?? 0));
          const bottomValue = Math.min(...rightTicks.map((tick) => parsePercentOrNumberToken(tick.text) ?? 0));
          const scale = (topValue - bottomValue) / Math.max(1, bottom - top);
          return orderedCircles.map((circle) => {
            const y = readSvgNumericAttribute(circle, "cy");
            return Math.max(0, bottomValue + (bottom - y) * scale);
          });
        })();

  const title = labels.find((label) => label.y <= 50)?.text ?? "";
  const subtitle = labels.find((label) => label.y > 50 && label.y <= 74)?.text ?? "";
  return {
    kind: "combo",
    title,
    subtitle,
    insight: "",
    unit: leftTicks.some((tick) => tick.text.includes("%")) ? "" : "Value",
    secondaryUnit: rightTicks.some((tick) => tick.text.includes("%")) ? "%" : "",
    categories: categoryLabels,
    series: [
      {
        id: "series-bars",
        label: "Bars",
        values: barValues.slice(0, categoryLabels.length),
        color: DEFAULT_BAR_COLORS[0],
        role: "bar",
        axis: "primary",
      },
      {
        id: "series-line",
        label: "Line",
        values: lineValues.slice(0, categoryLabels.length),
        color: DEFAULT_LINE_COLORS[0],
        role: "line",
        axis: "secondary",
      },
    ],
  };
}

function collectLineChartCategories(svg: SVGSVGElement, pointCount: number) {
  const plotRoot = svg.parentElement;
  const categories = plotRoot
    ? Array.from(plotRoot.querySelectorAll<HTMLElement>("[style*='bottom'][style*='left']"))
        .map((element) => ({
          text: normalizeText(element.textContent),
          left: readNumericStyle(element, "left"),
        }))
        .filter((item) => item.text && parsePercentOrNumberToken(item.text) === null)
        .sort((left, right) => left.left - right.left)
        .map((item) => item.text)
    : [];

  return categories.length >= pointCount
    ? categories.slice(0, pointCount)
    : Array.from({ length: pointCount }, (_, index) => `Point ${index + 1}`);
}

function collectLineChartValueTicks(svg: SVGSVGElement) {
  const plotRoot = svg.parentElement;
  if (!plotRoot) {
    return [];
  }

  return Array.from(plotRoot.querySelectorAll<HTMLElement>("[style*='top']"))
    .map((element) => ({
      value: parsePercentOrNumberToken(element.textContent),
      top: readNumericStyle(element, "top"),
      left: readNumericStyle(element, "left"),
    }))
    .filter((item): item is { value: number; top: number; left: number } => item.value !== null)
    .filter((item) => item.left <= 4)
    .sort((left, right) => left.top - right.top);
}

function collectLineChartLegendLabels(svg: SVGSVGElement) {
  const plotRoot = svg.parentElement;
  const labels = new Map<string, string>();
  if (!plotRoot) {
    return labels;
  }

  Array.from(plotRoot.querySelectorAll<HTMLElement>("span")).forEach((element) => {
    const color = normalizeColorKey(element.style.backgroundColor || element.style.background);
    if (!color) {
      return;
    }
    const label = normalizeText(element.parentElement?.textContent);
    if (label) {
      labels.set(color, label);
    }
  });

  return labels;
}

function readNearestChartHeadings(svg: SVGSVGElement) {
  const frame = svg.closest<HTMLElement>('[data-html-visual-kind="chart-frame"]');
  const headings = frame
    ? Array.from(frame.querySelectorAll<HTMLElement>('[data-html-block-kind="heading"]'))
        .map((element) => normalizeText(element.textContent))
        .filter(Boolean)
    : [];

  return {
    title: headings[0] ?? "",
    subtitle: headings[1] ?? "",
  };
}

function detectLineAreaChartSpec(svg: SVGSVGElement): HtmlChartSpec | null {
  const lines = Array.from(svg.querySelectorAll("polyline"))
    .map((line, index) => ({
      element: line,
      points: parseSvgPointList(line.getAttribute("points")),
      index,
    }))
    .filter((line) => line.points.length >= 3);
  if (!lines.length) {
    return null;
  }

  const pointCount = Math.max(...lines.map((line) => line.points.length));
  if (pointCount < 3) {
    return null;
  }

  const viewBox = readSvgViewBox(svg);
  const ticks = collectLineChartValueTicks(svg);
  const topTick = ticks[0];
  const bottomTick = ticks.at(-1);
  const valueFromY =
    topTick && bottomTick && bottomTick.top !== topTick.top
      ? (y: number) =>
          topTick.value +
          ((y - topTick.top) / Math.max(1, bottomTick.top - topTick.top)) *
            (bottomTick.value - topTick.value)
      : (y: number) => {
          const normalized = 1 - (y - viewBox.y) / Math.max(1, viewBox.height);
          return normalized * 100;
        };

  const legendLabels = collectLineChartLegendLabels(svg);
  const categories = collectLineChartCategories(svg, pointCount);
  const headings = readNearestChartHeadings(svg);
  const series = lines.map((line, index) => {
    const color = normalizeText(line.element.getAttribute("stroke")) || DEFAULT_LINE_COLORS[index % DEFAULT_LINE_COLORS.length]!;
    const label = legendLabels.get(normalizeColorKey(color)) ?? `Series ${index + 1}`;
    return {
      id: `series-${index + 1}`,
      label,
      values: line.points.slice(0, pointCount).map((point) => Math.round(valueFromY(point.y) * 10) / 10),
      color,
      role: "line" as const,
      axis: "primary" as const,
    } satisfies HtmlChartSeries;
  });

  return {
    kind: "line",
    title: headings.title,
    subtitle: headings.subtitle,
    insight: "",
    unit: "",
    valueAxisMin: bottomTick?.value,
    valueAxisMax: topTick?.value,
    categories,
    series,
  };
}

function collectWaterfallBarCandidates(plotRoot: HTMLElement) {
  return Array.from(plotRoot.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement)
    .map((element) => {
      const left = readNumericStyle(element, "left");
      const bottom = readNumericStyle(element, "bottom");
      const width = readNumericStyle(element, "width");
      const height = readNumericStyle(element, "height");
      const background = normalizeText(element.style.backgroundColor || element.style.background);
      return {
        element,
        left,
        bottom,
        width,
        height,
        background,
      };
    })
    .filter((bar) => {
      if (!bar.element.style.bottom || !bar.background) {
        return false;
      }
      if (bar.width < 16 || bar.height < 8 || Math.abs(bar.width - bar.height) <= 8) {
        return false;
      }
      return !/transparent/i.test(bar.background);
    })
    .sort((left, right) => left.left - right.left);
}

function collectWaterfallCategoryLabels(plotRoot: HTMLElement) {
  return collectAbsoluteTextNodes(plotRoot)
    .filter((node) => parsePercentOrNumberToken(node.text) === null)
    .filter((node) => node.top >= readNumericStyle(plotRoot, "height") - 4 || node.element.style.bottom.startsWith("-"))
    .sort((left, right) => left.left - right.left)
    .map((node) => node.text);
}

function collectWaterfallValueLabels(plotRoot: HTMLElement) {
  return collectAbsoluteTextNodes(plotRoot)
    .map((node) => ({
      ...node,
      value: parsePercentOrNumberToken(node.text),
    }))
    .filter((node): node is PositionedTextNode & { value: number } => node.value !== null)
    .sort((left, right) => left.left - right.left);
}

function detectDivWaterfallChartSpec(root: HTMLElement): HtmlChartSpec | null {
  if (isPageScaleElement(root)) {
    return null;
  }

  const roots = collectLocalPlotRoots(root);
  for (const plotRoot of roots) {
    const bars = collectWaterfallBarCandidates(plotRoot);
    if (bars.length < 4 || bars.length > 8) {
      continue;
    }

    const medianWidth = [...bars].sort((left, right) => left.width - right.width)[Math.floor(bars.length / 2)]?.width ?? 0;
    const similarlySizedBars = bars.filter((bar) => Math.abs(bar.width - medianWidth) <= Math.max(12, medianWidth * 0.4));
    if (similarlySizedBars.length < 4) {
      continue;
    }

    const text = normalizeText(root.textContent);
    const categoryLabels = collectWaterfallCategoryLabels(plotRoot);
    const valueLabels = collectWaterfallValueLabels(plotRoot);
    const looksLikeWaterfall =
      /waterfall|bridge/i.test(text) ||
      categoryLabels.some((label) => /^start$/i.test(label)) ||
      categoryLabels.some((label) => /^end$/i.test(label)) ||
      valueLabels.some((label) => label.text.trim().startsWith("+") || label.text.trim().startsWith("-"));

    if (!looksLikeWaterfall) {
      continue;
    }

    const categories =
      categoryLabels.length >= bars.length
        ? categoryLabels.slice(0, bars.length)
        : bars.map((_, index) => `Step ${index + 1}`);
    const values =
      valueLabels.length >= bars.length
        ? valueLabels.slice(0, bars.length).map((label) => label.value)
        : bars.map((bar) => Math.round(bar.height));
    const headings = readNearestElementHeadings(root);

    return {
      kind: "waterfall",
      title: headings.title || "Waterfall",
      subtitle: headings.subtitle,
      insight: "",
      unit: "",
      categories,
      series: [
        {
          id: "waterfall-values",
          label: "Value",
          values,
          color: normalizeText(bars.at(-1)?.background) || DEFAULT_BAR_COLORS[0],
          role: "bar",
          axis: "primary",
        },
      ],
    };
  }

  return null;
}

function detectBubbleChartSpec(root: HTMLElement): HtmlChartSpec | null {
  if (isPageScaleElement(root)) {
    return null;
  }

  const localPlotRoots = collectLocalPlotRoots(root);
  const plotRoot =
    localPlotRoots.find((candidate) => {
      const nestedChartModule = candidate.querySelector<HTMLElement>(
        `[data-html-module-kind="${CHART_MODULE_KIND}"]`,
      );
      if (nestedChartModule && nestedChartModule !== candidate) {
        return false;
      }
      const circles = Array.from(
        candidate.querySelectorAll<HTMLElement>("[style*='border-radius:50%'],[style*='border-radius: 50%']"),
      ).filter((element) => {
        const width = readNumericStyle(element, "width");
        const height = readNumericStyle(element, "height");
        return width >= 24 && Math.abs(width - height) <= 18;
      });
      return circles.length >= 3;
    }) ??
    (Array.from(root.children).filter((child): child is HTMLElement => {
      if (!(child instanceof HTMLElement)) {
        return false;
      }
      const width = readNumericStyle(child, "width");
      const height = readNumericStyle(child, "height");
      const radius = normalizeText(child.style.borderRadius);
      return width >= 24 && Math.abs(width - height) <= 18 && radius.includes("50%");
    }).length >= 3
      ? root
      : null);

  if (!plotRoot) {
    return null;
  }

  const circles = Array.from(plotRoot.querySelectorAll<HTMLElement>("[style*='border-radius:50%'],[style*='border-radius: 50%']"))
    .filter((element) => {
      if (getModuleRoot(element) && getModuleRoot(element) !== root && getModuleRoot(element) !== plotRoot) {
        return false;
      }
      const width = readNumericStyle(element, "width");
      const height = readNumericStyle(element, "height");
      return width >= 24 && width <= 180 && Math.abs(width - height) <= 18;
    });
  if (circles.length < 3) {
    return null;
  }

  const textNodes = collectAbsoluteTextNodes(plotRoot);
  const plotWidth =
    readNumericStyle(plotRoot, "width") ||
    Math.max(...circles.map((element) => readNumericStyle(element, "left") + readNumericStyle(element, "width")), 1);
  const plotHeight =
    readNumericStyle(plotRoot, "height") ||
    Math.max(...circles.map((element) => readNumericStyle(element, "top") + readNumericStyle(element, "height")), 1);
  const xTicks = textNodes
    .filter((node) => node.top >= plotHeight * 0.76 && parsePercentOrNumberToken(node.text) !== null)
    .sort((left, right) => left.left - right.left);
  const yTicks = textNodes
    .filter((node) => node.left <= 90 && parsePercentOrNumberToken(node.text) !== null)
    .sort((left, right) => left.top - right.top);
  const xMin = xTicks.length >= 2 ? (parsePercentOrNumberToken(xTicks[0]!.text) ?? 0) : 0;
  const xMax = xTicks.length >= 2 ? (parsePercentOrNumberToken(xTicks.at(-1)?.text) ?? 100) : 100;
  const yMax = yTicks.length >= 2 ? (parsePercentOrNumberToken(yTicks[0]!.text) ?? 100) : 100;
  const yMin = yTicks.length >= 2 ? (parsePercentOrNumberToken(yTicks.at(-1)?.text) ?? 0) : 0;
  const xStart = xTicks.length >= 2 ? xTicks[0]!.left : 60;
  const xEnd = xTicks.length >= 2 ? xTicks.at(-1)!.left : Math.max(1, plotWidth - 20);
  const yTop = yTicks.length >= 2 ? yTicks[0]!.top : 90;
  const yBottom = yTicks.length >= 2 ? yTicks.at(-1)!.top : Math.max(1, plotHeight - 12);

  const points = circles
    .sort((left, right) => readNumericStyle(left, "left") - readNumericStyle(right, "left"))
    .map((element, index) => {
      const left = readNumericStyle(element, "left");
      const top = readNumericStyle(element, "top");
      const width = readNumericStyle(element, "width");
      const height = readNumericStyle(element, "height");
      const centerX = left + width / 2;
      const centerY = top + height / 2;
      const x =
        xEnd > xStart
          ? xMin + ((centerX - xStart) / Math.max(1, xEnd - xStart)) * (xMax - xMin)
          : centerX;
      const y =
        yBottom > yTop
          ? yMin + ((yBottom - centerY) / Math.max(1, yBottom - yTop)) * (yMax - yMin)
          : centerY;
      const nearestLabel = textNodes
        .filter((node) => node.weight >= 600)
        .map((node) => ({
          node,
          distance: Math.hypot(node.left - centerX, node.top - centerY),
        }))
        .sort((leftNode, rightNode) => leftNode.distance - rightNode.distance)[0]?.node;
      return {
        id: `point-${index + 1}`,
        label: normalizeSeriesLabel(nearestLabel?.text, `Point ${index + 1}`),
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        size: Math.max(1, Math.round(((width + height) / 2) * 10) / 10),
        color:
          normalizeText(element.style.backgroundColor) ||
          DEFAULT_BUBBLE_COLORS[index % DEFAULT_BUBBLE_COLORS.length]!,
        group: null,
      } satisfies HtmlBubblePoint;
    });

  if (points.length < 3) {
    return null;
  }
  const headings = readNearestElementHeadings(root);
  const title = headings.title || (textNodes.find((node) => node.weight >= 700 && node.top < 180)?.text ?? "");
  const subtitle =
    headings.subtitle || (textNodes.find((node) => node.weight < 700 && node.width > 400 && node.top < 260)?.text ?? "");
  const bottomAxisLabels = textNodes
    .filter((node) => node.top >= plotHeight * 0.7 || node.element.style.bottom.startsWith("-"))
    .filter((node) => parsePercentOrNumberToken(node.text) === null)
    .map((node) => ({
      ...node,
      sortLeft: node.element.style.right
        ? plotWidth - readNumericStyle(node.element, "right") - Math.max(node.width, 1)
        : node.left,
    }))
    .sort((left, right) => left.sortLeft - right.sortLeft);
  const sideAxisLabels = textNodes
    .filter((node) => node.left <= Math.max(160, plotWidth * 0.18) || node.element.style.left.startsWith("-"))
    .filter((node) => parsePercentOrNumberToken(node.text) === null)
    .filter((node) => !/effort|complex|cost|risk/i.test(node.text))
    .filter((node) => /^(low|high)\b/i.test(node.text))
    .sort((left, right) => left.top - right.top);
  const explicitYAxisTitle = textNodes.find((node) => /impact|value|priority|lift|return/i.test(node.text));
  const xAxisLabels =
    bottomAxisLabels.filter((node) => /effort|complex|cost|risk/i.test(node.text)).length >= 2
      ? bottomAxisLabels.filter((node) => /effort|complex|cost|risk/i.test(node.text))
      : bottomAxisLabels.filter((node) => !/^(low|high)$/i.test(node.text));
  const xLabel =
    xAxisLabels.length >= 2
      ? `${xAxisLabels[0]!.text} / ${xAxisLabels.at(-1)!.text}`
      : xAxisLabels[0]?.text ?? "X axis";
  const yLabel =
    explicitYAxisTitle?.text ??
    (sideAxisLabels.length >= 2
      ? `${sideAxisLabels.at(-1)!.text} / ${sideAxisLabels[0]!.text}`
      : sideAxisLabels[0]?.text ?? "Y axis");

  return {
    kind: "bubble",
    title,
    subtitle,
    insight: "",
    unit: "",
    xLabel,
    yLabel,
    sizeLabel: "Bubble size",
    points,
  };
}

function elementRectWithin(container: HTMLElement, element: HTMLElement) {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  return {
    left: elementRect.left - containerRect.left,
    top: elementRect.top - containerRect.top,
    width: elementRect.width,
    height: elementRect.height,
  };
}

function readElementPaint(element: HTMLElement) {
  const view = element.ownerDocument.defaultView;
  const computed = view?.getComputedStyle(element);
  const inline = normalizeText(element.style.backgroundColor || element.style.background);
  return normalizeText(inline || computed?.backgroundColor || "");
}

function isMatrixCardCandidate(plotRoot: HTMLElement, element: HTMLElement) {
  if (element === plotRoot || element.closest("[data-html-block-id]")) {
    return false;
  }
  const radius = normalizeText(element.style.borderRadius);
  const rect = elementRectWithin(plotRoot, element);
  const text = normalizeMultilineText(element.innerText || element.textContent);
  const paint = readElementPaint(element);
  const border = normalizeText(element.style.border || element.style.borderColor);
  if (!text || radius.includes("50%")) {
    return false;
  }
  if (rect.width < 58 || rect.height < 34) {
    return false;
  }
  if (!paint && !border && !element.className.toString().includes("card")) {
    return false;
  }
  return true;
}

function splitMatrixItemText(text: string) {
  const lines = text
    .split(/\n+/)
    .map((line) => normalizeText(line))
    .filter(Boolean);
  if (lines.length > 1) {
    return {
      label: lines[0] ?? "",
      detail: lines.slice(1).join(" "),
    };
  }
  const sentenceMatch = text.match(/^([^.!?:]{3,72})[:.!?]\s+(.+)$/);
  if (sentenceMatch?.[1] && sentenceMatch[2]) {
    return {
      label: normalizeText(sentenceMatch[1]),
      detail: normalizeText(sentenceMatch[2]),
    };
  }
  return {
    label: normalizeText(text),
    detail: "",
  };
}

function detectMatrixAxisLabels(plotRoot: HTMLElement) {
  const texts = collectAbsoluteTextNodes(plotRoot);
  const plotWidth = plotRoot.getBoundingClientRect().width || readNumericStyle(plotRoot, "width") || 1;
  const plotHeight = plotRoot.getBoundingClientRect().height || readNumericStyle(plotRoot, "height") || 1;
  const bottomLabels = texts
    .filter((node) => node.top >= plotHeight * 0.72 || node.element.style.bottom.startsWith("-"))
    .sort((left, right) => left.left - right.left);
  const sideLabels = texts
    .filter((node) => node.left <= plotWidth * 0.18 || node.element.style.left.startsWith("-"))
    .sort((left, right) => left.top - right.top);
  const xMinLabel = bottomLabels[0]?.text ?? "";
  const xMaxLabel = bottomLabels.at(-1)?.text && bottomLabels.at(-1)?.text !== xMinLabel ? bottomLabels.at(-1)?.text ?? "" : "";
  const yMaxLabel = sideLabels[0]?.text ?? "";
  const yMinLabel = sideLabels.at(-1)?.text && sideLabels.at(-1)?.text !== yMaxLabel ? sideLabels.at(-1)?.text ?? "" : "";
  const xLabel = [xMinLabel, xMaxLabel].find((label) => /effort|cost|risk|complex/i.test(label)) ?? "X axis";
  const yLabel = [yMinLabel, yMaxLabel].find((label) => /impact|value|lift|priority|return/i.test(label)) ?? "Y axis";
  return {
    xLabel,
    yLabel,
    xMinLabel,
    xMaxLabel,
    yMinLabel,
    yMaxLabel,
  };
}

function detectMatrixChartSpec(root: HTMLElement): HtmlChartSpec | null {
  if (isPageScaleElement(root)) {
    return null;
  }

  const text = normalizeText(root.textContent);
  const plotRoot = collectLocalPlotRoots(root)
    .map((candidate) => {
      const candidateText = normalizeText(candidate.textContent);
      const style = candidate.style;
      const hasAxisScaffold =
        Boolean(style.borderLeft || style.borderBottom || style.backgroundImage) ||
        candidate.querySelector(".matrix-axis-h,.matrix-axis-v");
      const cards = Array.from(candidate.querySelectorAll<HTMLElement>("article,div,aside"))
        .filter((element) => isMatrixCardCandidate(candidate, element));
      return {
        element: candidate,
        score:
          (hasAxisScaffold ? 2 : 0) +
          (/\b(matrix|quadrant|priority|prioritization|effort|impact)\b/i.test(candidateText) ? 1 : 0) +
          cards.length,
        cards,
      };
    })
    .filter((candidate) => candidate.cards.length >= 2 && candidate.score >= 4)
    .sort((left, right) => right.score - left.score)[0];

  if (!plotRoot || !/\b(matrix|quadrant|priority|prioritization|effort|impact)\b/i.test(text)) {
    return null;
  }

  const plotRect = plotRoot.element.getBoundingClientRect();
  const plotWidth = plotRect.width || readNumericStyle(plotRoot.element, "width") || 1;
  const plotHeight = plotRect.height || readNumericStyle(plotRoot.element, "height") || 1;
  const items = plotRoot.cards
    .slice(0, 8)
    .map((element, index): HtmlMatrixItem => {
      const rect = elementRectWithin(plotRoot.element, element);
      const itemText = splitMatrixItemText(normalizeMultilineText(element.innerText || element.textContent));
      return {
        id: element.getAttribute("data-html-visual-id") ?? `matrix-item-${index + 1}`,
        label: itemText.label || `Item ${index + 1}`,
        detail: itemText.detail,
        x: normalizeChartRatio(rect.left / Math.max(1, plotWidth), index % 2 ? 0.56 : 0.08),
        y: normalizeChartRatio(rect.top / Math.max(1, plotHeight), index < 2 ? 0.08 : 0.56),
        w: normalizeChartRatio(rect.width / Math.max(1, plotWidth), 0.32),
        h: normalizeChartRatio(rect.height / Math.max(1, plotHeight), 0.22),
        color: readElementPaint(element) || DEFAULT_BAR_COLORS[index % DEFAULT_BAR_COLORS.length]!,
        textColor: normalizeText(element.style.color) || null,
      };
    })
    .filter((item) => item.label);

  if (items.length < 2) {
    return null;
  }

  const headings = readNearestElementHeadings(root);
  const axisLabels = detectMatrixAxisLabels(plotRoot.element);
  const rootRect = root.getBoundingClientRect();
  const calloutCandidate = Array.from(root.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement && child !== plotRoot.element)
    .map((element) => {
      const rect = elementRectWithin(root, element);
      return {
        element,
        rect,
        text: splitMatrixItemText(normalizeMultilineText(element.innerText || element.textContent)),
      };
    })
    .filter((candidate) => candidate.text.label && candidate.rect.width >= 120 && candidate.rect.height >= 50)
    .sort((left, right) => right.rect.width * right.rect.height - left.rect.width * left.rect.height)[0];

  return {
    kind: "matrix",
    title: headings.title || "Matrix",
    subtitle: headings.subtitle,
    insight: "",
    xLabel: axisLabels.xLabel,
    yLabel: axisLabels.yLabel,
    xMinLabel: axisLabels.xMinLabel,
    xMaxLabel: axisLabels.xMaxLabel,
    yMinLabel: axisLabels.yMinLabel,
    yMaxLabel: axisLabels.yMaxLabel,
    plotBounds: {
      x: normalizeChartRatio((plotRect.left - rootRect.left) / Math.max(1, rootRect.width), 0.08),
      y: normalizeChartRatio((plotRect.top - rootRect.top) / Math.max(1, rootRect.height), 0.18),
      w: normalizeChartRatio(plotRect.width / Math.max(1, rootRect.width), 0.72),
      h: normalizeChartRatio(plotRect.height / Math.max(1, rootRect.height), 0.68),
    },
    quadrants: [
      { id: "quadrant-top-left", label: "", x: 0, y: 0, w: 0.5, h: 0.5, color: "rgba(181,86,56,0.06)" },
      { id: "quadrant-top-right", label: "", x: 0.5, y: 0, w: 0.5, h: 0.5, color: "rgba(48,92,99,0.06)" },
      { id: "quadrant-bottom-left", label: "", x: 0, y: 0.5, w: 0.5, h: 0.5, color: "rgba(127,157,161,0.06)" },
      { id: "quadrant-bottom-right", label: "", x: 0.5, y: 0.5, w: 0.5, h: 0.5, color: "rgba(208,143,115,0.06)" },
    ],
    items,
    callout: calloutCandidate
      ? {
          title: calloutCandidate.text.label,
          body: calloutCandidate.text.detail,
          x: normalizeChartRatio(calloutCandidate.rect.left / Math.max(1, rootRect.width), 0.72),
          y: normalizeChartRatio(calloutCandidate.rect.top / Math.max(1, rootRect.height), 0.18),
          w: normalizeChartRatio(calloutCandidate.rect.width / Math.max(1, rootRect.width), 0.22),
          h: normalizeChartRatio(calloutCandidate.rect.height / Math.max(1, rootRect.height), 0.2),
          color: readElementPaint(calloutCandidate.element) || "rgba(255,255,255,0.86)",
          textColor: normalizeText(calloutCandidate.element.style.color) || null,
          borderColor: normalizeText(calloutCandidate.element.style.borderColor) || null,
        }
      : null,
    colors: items.map((item) => item.color).filter((color): color is string => Boolean(color)),
  };
}

function detectPseudoTableModule(root: HTMLElement) {
  const tableSpec = buildPseudoTableSpec(root);
  if (!tableSpec) {
    return null;
  }
  return tableSpec;
}

export function canonicalizeDataBackedModulesOnPage(page: Element): void {
  Array.from(page.querySelectorAll<HTMLElement>("[data-export-chart]")).forEach((element) => {
    if (getModuleRoot(element) && getModuleRoot(element) !== element) {
      return;
    }
    const spec = parseExportChartPayload(element);
    if (!spec) {
      return;
    }
    setModuleMetadata({
      element,
      moduleKind: CHART_MODULE_KIND,
      moduleLabel: "Chart",
      visualKind: "chart-frame",
      chartSpec: spec,
    });
  });

  Array.from(page.querySelectorAll<HTMLTableElement>("table")).forEach((element) => {
    if (getModuleRoot(element) && getModuleRoot(element) !== element) {
      return;
    }
    const tableSpec = parseTableElement(element);
    if (!tableSpec) {
      return;
    }
    setModuleMetadata({
      element,
      moduleKind: TABLE_MODULE_KIND,
      moduleLabel: "Table",
      visualKind: "surface",
      tableSpec,
    });
  });

  Array.from(page.querySelectorAll<SVGSVGElement>("svg")).forEach((element) => {
    if (getModuleRoot(element) && getModuleRoot(element) !== element) {
      return;
    }
    if (element.hasAttribute(HTML_CHART_SPEC_ATTRIBUTE)) {
      return;
    }
    const spec = detectComboChartSpec(element) ?? detectLineAreaChartSpec(element) ?? detectWaterfallChartSpec(element);
    if (!spec) {
      return;
    }
    const targetElement = resolveChartModuleTarget(element);
    setModuleMetadata({
      element: targetElement,
      moduleKind: CHART_MODULE_KIND,
      moduleLabel: "Chart",
      visualKind: "chart-frame",
      chartSpec: spec,
    });
  });

  Array.from(page.querySelectorAll<HTMLElement>("div, article, aside, section, figure"))
    .sort((left, right) => elementDepth(right) - elementDepth(left))
    .forEach((element) => {
      if (getModuleRoot(element) && getModuleRoot(element) !== element) {
        return;
      }
      if (element.getAttribute("data-html-module-kind")) {
        return;
      }
      if (containsModuleRoot(element)) {
        return;
      }
      const waterfallSpec = detectDivWaterfallChartSpec(element);
      if (waterfallSpec) {
        setModuleMetadata({
          element,
          moduleKind: CHART_MODULE_KIND,
          moduleLabel: "Waterfall chart",
          visualKind: "chart-frame",
          chartSpec: waterfallSpec,
        });
        return;
      }
      const matrixSpec = detectMatrixChartSpec(element);
      if (matrixSpec) {
        setModuleMetadata({
          element,
          moduleKind: CHART_MODULE_KIND,
          moduleLabel: "Matrix chart",
          visualKind: "chart-frame",
          chartSpec: matrixSpec,
        });
        return;
      }
      const bubbleSpec = detectBubbleChartSpec(element);
      if (bubbleSpec) {
        setModuleMetadata({
          element,
          moduleKind: CHART_MODULE_KIND,
          moduleLabel: "Bubble chart",
          visualKind: "chart-frame",
          chartSpec: bubbleSpec,
        });
        return;
      }
      const tableSpec = detectPseudoTableModule(element);
      if (tableSpec) {
        setModuleMetadata({
          element,
          moduleKind: TABLE_MODULE_KIND,
          moduleLabel: "Table",
          visualKind: "surface",
          tableSpec,
        });
      }
    });
}

function chartSpecToDataTable(spec: HtmlChartSpec): DataTableModel {
  if (spec.kind === "bubble") {
    const raw = [
      ["Label", "X", "Y", "Size", "Group"],
      ...spec.points.map((point) => [
        point.label,
        String(point.x),
        String(point.y),
        String(point.size),
        point.group ?? "",
      ]),
    ]
      .map((row) => row.join("\t"))
      .join("\n");
    return parseDataBlockInput(raw);
  }

  if (spec.kind === "matrix") {
    const raw = [
      ["Item", "Detail", "X", "Y", "W", "H"],
      ...spec.items.map((item) => [
        item.label,
        item.detail,
        String(item.x),
        String(item.y),
        String(item.w),
        String(item.h),
      ]),
    ]
      .map((row) => row.join("\t"))
      .join("\n");
    return parseDataBlockInput(raw);
  }

  const header = ["Category", ...spec.series.map((series) => series.label)];
  const rows = spec.categories.map((category, categoryIndex) => [
    category,
    ...spec.series.map((series) => String(series.values[categoryIndex] ?? 0)),
  ]);
  return parseDataBlockInput([header, ...rows].map((row) => row.join("\t")).join("\n"));
}

function dataTableToChartSpec(args: {
  dataTable: DataTableModel;
  kind: HtmlChartKind;
  baseSpec?: HtmlChartSpec | null;
}): HtmlChartSpec | null {
  const { dataTable, kind, baseSpec } = args;
  if (kind === "bubble") {
    if (dataTable.columns.length < 4) {
      return null;
    }
    const points = dataTable.rows
      .map((row, index) => ({
        id: baseSpec?.kind === "bubble" ? baseSpec.points[index]?.id ?? `point-${index + 1}` : `point-${index + 1}`,
        label: normalizeSeriesLabel(row[0], `Point ${index + 1}`),
        x: Number(row[1]) || 0,
        y: Number(row[2]) || 0,
        size: Math.max(1, Number(row[3]) || 1),
        color:
          baseSpec?.kind === "bubble"
            ? baseSpec.points[index]?.color ?? DEFAULT_BUBBLE_COLORS[index % DEFAULT_BUBBLE_COLORS.length]!
            : DEFAULT_BUBBLE_COLORS[index % DEFAULT_BUBBLE_COLORS.length]!,
        group: normalizeText(row[4]) || null,
      }))
      .filter((point) => point.label);
    if (!points.length) {
      return null;
    }
    return withNormalizedChartPresentation({
      kind: "bubble",
      title: baseSpec?.title ?? "",
      subtitle: baseSpec?.subtitle ?? "",
      insight: baseSpec?.insight ?? "",
      unit: baseSpec?.kind === "bubble" || (baseSpec && isSeriesChartSpec(baseSpec)) ? baseSpec.unit : "",
      xLabel: baseSpec?.kind === "bubble" ? baseSpec.xLabel : "X axis",
      yLabel: baseSpec?.kind === "bubble" ? baseSpec.yLabel : "Y axis",
      sizeLabel: baseSpec?.kind === "bubble" ? baseSpec.sizeLabel : "Bubble size",
      points,
      style: baseSpec?.kind === "bubble" ? cloneChartNativeStyle(baseSpec.style) : undefined,
    }, baseSpec?.kind === "bubble" ? baseSpec.presentation : undefined);
  }

  if (kind === "matrix") {
    const items = dataTable.rows
      .map((row, index) => ({
        id: baseSpec?.kind === "matrix" ? baseSpec.items[index]?.id ?? `item-${index + 1}` : `item-${index + 1}`,
        label: normalizeSeriesLabel(row[0], `Item ${index + 1}`),
        detail: normalizeChartText(row[1]),
        x: normalizeChartRatio(row[2], index % 2 ? 0.56 : 0.08),
        y: normalizeChartRatio(row[3], index < 2 ? 0.08 : 0.56),
        w: normalizeChartRatio(row[4], 0.32),
        h: normalizeChartRatio(row[5], 0.22),
        color:
          baseSpec?.kind === "matrix"
            ? baseSpec.items[index]?.color ?? DEFAULT_BAR_COLORS[index % DEFAULT_BAR_COLORS.length]!
            : DEFAULT_BAR_COLORS[index % DEFAULT_BAR_COLORS.length]!,
        textColor: baseSpec?.kind === "matrix" ? baseSpec.items[index]?.textColor ?? null : null,
      }))
      .filter((item) => item.label);
    if (!items.length) {
      return null;
    }
    return {
      kind: "matrix",
      title: baseSpec?.title ?? "",
      subtitle: baseSpec?.subtitle ?? "",
      insight: baseSpec?.insight ?? "",
      xLabel: baseSpec?.kind === "matrix" ? baseSpec.xLabel : "X axis",
      yLabel: baseSpec?.kind === "matrix" ? baseSpec.yLabel : "Y axis",
      xMinLabel: baseSpec?.kind === "matrix" ? baseSpec.xMinLabel : "",
      xMaxLabel: baseSpec?.kind === "matrix" ? baseSpec.xMaxLabel : "",
      yMinLabel: baseSpec?.kind === "matrix" ? baseSpec.yMinLabel : "",
      yMaxLabel: baseSpec?.kind === "matrix" ? baseSpec.yMaxLabel : "",
      plotBounds: baseSpec?.kind === "matrix" ? baseSpec.plotBounds : null,
      quadrants: baseSpec?.kind === "matrix" ? baseSpec.quadrants?.map((quadrant) => ({ ...quadrant })) : undefined,
      items,
      callout: baseSpec?.kind === "matrix" && baseSpec.callout ? { ...baseSpec.callout } : null,
      colors: items.map((item) => item.color).filter((color): color is string => Boolean(color)),
    };
  }

  if (dataTable.columns.length < 2 || !dataTable.rows.length) {
    return null;
  }
  const categories = dataTable.rows.map((row, index) => normalizeSeriesLabel(row[0], `Category ${index + 1}`));
  const series = dataTable.columns.slice(1).map((column, columnIndex) =>
    normalizeChartSeries(
      {
        id:
          baseSpec && isSeriesChartSpec(baseSpec)
            ? baseSpec?.series[columnIndex]?.id ?? `series-${columnIndex + 1}`
            : `series-${columnIndex + 1}`,
        label: column.label,
        values: dataTable.rows.map((row) => Number(row[columnIndex + 1]) || 0),
        color:
          baseSpec && isSeriesChartSpec(baseSpec)
            ? baseSpec?.series[columnIndex]?.color ?? undefined
            : undefined,
        style:
          baseSpec && isSeriesChartSpec(baseSpec)
            ? cloneChartSeriesStyle(baseSpec.series[columnIndex]?.style)
            : undefined,
        role:
          kind === "combo"
            ? baseSpec?.kind === "combo"
              ? baseSpec.series[columnIndex]?.role ?? (columnIndex === 0 ? "bar" : "line")
              : columnIndex === 0
                ? "bar"
                : "line"
            : kind === "line"
              ? "line"
              : "bar",
        axis:
          kind === "combo"
            ? baseSpec?.kind === "combo"
              ? baseSpec.series[columnIndex]?.axis ?? (columnIndex === 0 ? "primary" : "secondary")
              : columnIndex === 0
                ? "primary"
                : "secondary"
            : "primary",
      },
      columnIndex,
      categories.length,
      {
        role:
          kind === "combo" ? (columnIndex === 0 ? "bar" : "line") : kind === "line" ? "line" : "bar",
        axis: kind === "combo" && columnIndex > 0 ? "secondary" : "primary",
      },
    ),
  );
  if (!series.length) {
    return null;
  }
  if (kind === "combo") {
    return withNormalizedChartPresentation({
      kind: "combo",
      title: baseSpec?.title ?? "",
      subtitle: baseSpec?.subtitle ?? "",
      insight: baseSpec?.insight ?? "",
      unit: baseSpec && isSeriesChartSpec(baseSpec) ? baseSpec.unit : "",
      secondaryUnit: baseSpec?.kind === "combo" ? baseSpec.secondaryUnit ?? "" : "",
      valueAxisMin: baseSpec?.kind === "combo" ? baseSpec.valueAxisMin : undefined,
      valueAxisMax: baseSpec?.kind === "combo" ? baseSpec.valueAxisMax : undefined,
      categories,
      series,
      style: baseSpec?.kind === "combo" ? cloneChartNativeStyle(baseSpec.style) : undefined,
    }, baseSpec?.kind === "combo" ? baseSpec.presentation : baseSpec && isSeriesChartSpec(baseSpec) ? baseSpec.presentation : undefined);
  }
  return withNormalizedChartPresentation({
    kind,
    title: baseSpec?.title ?? "",
    subtitle: baseSpec?.subtitle ?? "",
    insight: baseSpec?.insight ?? "",
    unit: baseSpec && isSeriesChartSpec(baseSpec) ? baseSpec.unit : "",
    valueAxisMin: baseSpec && isSeriesChartSpec(baseSpec) ? baseSpec.valueAxisMin : undefined,
    valueAxisMax: baseSpec && isSeriesChartSpec(baseSpec) ? baseSpec.valueAxisMax : undefined,
    categories,
    series,
    style: baseSpec && isSeriesChartSpec(baseSpec) ? cloneChartNativeStyle(baseSpec.style) : undefined,
  }, baseSpec && isSeriesChartSpec(baseSpec) ? baseSpec.presentation : undefined);
}

export function updateHtmlChartSpecFromRawData(args: {
  current: HtmlChartSpec;
  raw: string;
}): HtmlChartSpec | null {
  const dataTable = args.raw.trim() ? parseDataBlockInput(args.raw) : createEmptyDataTable("");
  return dataTableToChartSpec({
    dataTable,
    kind: args.current.kind,
    baseSpec: cloneChartSpecForUpdate(args.current),
  });
}

export function buildHtmlChartDataTable(spec: HtmlChartSpec) {
  return chartSpecToDataTable(spec);
}

export function buildHtmlTableSpecFromRaw(raw: string) {
  return raw.trim() ? parseDataBlockInput(raw) : createEmptyDataTable("");
}

function renderChartHeader(spec: HtmlChartSpec) {
  const subtitle = spec.subtitle || spec.insight;
  return `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;">
    <div>
      <div style="font-size:16px;font-weight:700;letter-spacing:-0.02em;color:#1a2630;">${escapeHtml(spec.title || "Chart")}</div>
      ${subtitle ? `<div style="margin-top:6px;font-size:12px;line-height:1.45;color:#667d90;max-width:720px;">${escapeHtml(subtitle)}</div>` : ""}
    </div>
    ${
      spec.kind === "bubble"
        ? `<div style="font-size:12px;color:#667d90;text-align:right;">${escapeHtml(spec.sizeLabel)}</div>`
        : spec.kind === "matrix"
          ? `<div style="font-size:12px;color:#667d90;text-align:right;">${escapeHtml(spec.xLabel)} / ${escapeHtml(spec.yLabel)}</div>`
          : `<div style="font-size:12px;color:#667d90;text-align:right;">${escapeHtml(spec.unit || "")}</div>`
    }
  </div>`;
}

function svgDashArray(dash?: HtmlChartLineDash | "none") {
  if (dash === "dash") {
    return ` stroke-dasharray="10 8"`;
  }
  if (dash === "dot") {
    return ` stroke-dasharray="2 7"`;
  }
  return "";
}

function chartAxisColor(spec: { style?: HtmlChartNativeStyle }, axis: "xAxis" | "yAxis", fallback: string) {
  return spec.style?.[axis]?.lineColor || fallback;
}

function chartGridColor(spec: { style?: HtmlChartNativeStyle }, axis: "xAxis" | "yAxis", fallback: string) {
  return spec.style?.[axis]?.gridColor || fallback;
}

function chartLabelColor(spec: { style?: HtmlChartNativeStyle }, axis: "xAxis" | "yAxis", fallback: string) {
  return spec.style?.[axis]?.labelColor || fallback;
}

function renderBarLikeChart(spec: HtmlBasicChartSpec) {
  const width = 1160;
  const height = 460;
  const left = 84;
  const right = width - 48;
  const top = 88;
  const bottom = height - 62;
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const values = spec.series.flatMap((series) => series.values);
  const maxValue = Math.max(1, ...values.map((value) => Math.abs(value)));
  const slotWidth = plotWidth / Math.max(1, spec.categories.length);
  const barGroupWidth = slotWidth * 0.56;
  const barWidth = spec.kind === "stacked" ? barGroupWidth : Math.max(24, barGroupWidth / Math.max(1, spec.series.length));
  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const y = bottom - ratio * plotHeight;
    const value = Math.round(ratio * maxValue);
    return `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${escapeHtml(chartGridColor(spec, "yAxis", "#d9e5ef"))}" stroke-width="${spec.style?.yAxis?.gridWidthPt ?? 1}"${svgDashArray(spec.style?.yAxis?.gridDash)} />
      <text x="${left - 12}" y="${y + 4}" text-anchor="end" font-size="${spec.style?.yAxis?.labelFontSize ?? 12}" fill="${escapeHtml(chartLabelColor(spec, "yAxis", "#7a8995"))}">${escapeHtml(String(value))}</text>`;
  }).join("");

  let seriesMarkup = "";
  if (spec.kind === "stacked") {
    spec.categories.forEach((category, categoryIndex) => {
      const x = left + categoryIndex * slotWidth + (slotWidth - barGroupWidth) / 2;
      const total = spec.series.reduce((sum, series) => sum + Math.max(0, series.values[categoryIndex] ?? 0), 0);
      let cursor = bottom;
      spec.series.forEach((series, seriesIndex) => {
        const value = Math.max(0, series.values[categoryIndex] ?? 0);
        const segmentHeight = total > 0 ? (value / maxValue) * plotHeight : 0;
        cursor -= segmentHeight;
        seriesMarkup += `<rect x="${x}" y="${cursor}" width="${barGroupWidth}" height="${segmentHeight}" rx="8" fill="${escapeHtml(series.color || pickColor(seriesIndex))}" />`;
      });
      seriesMarkup += `<text x="${x + barGroupWidth / 2}" y="${bottom + 26}" text-anchor="middle" font-size="12" fill="#465866">${escapeHtml(category)}</text>`;
    });
  } else if (spec.kind === "waterfall") {
    let running = 0;
    spec.categories.forEach((category, categoryIndex) => {
      const rawValue = spec.series[0]?.values[categoryIndex] ?? 0;
      const isEndpoint = categoryIndex === 0 || categoryIndex === spec.categories.length - 1;
      const start = isEndpoint && categoryIndex === 0 ? 0 : isEndpoint ? 0 : running;
      const end = isEndpoint && categoryIndex === 0 ? rawValue : isEndpoint ? rawValue : running + rawValue;
      if (!isEndpoint) {
        running = end;
      }
      const visualTopValue = Math.max(start, end);
      const visualBottomValue = Math.min(start, end);
      const y = bottom - (visualTopValue / maxValue) * plotHeight;
      const rectHeight = Math.max(18, ((visualTopValue - visualBottomValue) / maxValue) * plotHeight);
      const x = left + categoryIndex * slotWidth + (slotWidth - barGroupWidth) / 2;
      const color = isEndpoint
        ? "#203643"
        : rawValue >= 0
          ? "#5ea3bf"
          : "#b9ddf1";
      seriesMarkup += `<rect x="${x}" y="${y}" width="${barGroupWidth}" height="${rectHeight}" rx="8" fill="${color}" />`;
      seriesMarkup += `<text x="${x + barGroupWidth / 2}" y="${y - 12}" text-anchor="middle" font-size="12" font-weight="700" fill="#294352">${escapeHtml(String(rawValue))}</text>`;
      seriesMarkup += `<text x="${x + barGroupWidth / 2}" y="${bottom + 26}" text-anchor="middle" font-size="12" fill="#465866">${escapeHtml(category)}</text>`;
    });
  } else if (spec.kind === "line") {
    spec.series.forEach((series, seriesIndex) => {
      const color = series.color || DEFAULT_LINE_COLORS[seriesIndex % DEFAULT_LINE_COLORS.length]!;
      const points = spec.categories.map((_, categoryIndex) => {
        const x = left + categoryIndex * slotWidth + slotWidth / 2;
        const value = series.values[categoryIndex] ?? 0;
        const y = bottom - (value / maxValue) * plotHeight;
        return { x, y, value };
      });
      seriesMarkup += `<path d="${points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")}" fill="none" stroke="${escapeHtml(color)}" stroke-width="${series.style?.lineWidthPt ?? 4}" stroke-linecap="round" stroke-linejoin="round"${svgDashArray(series.style?.lineDash)} />`;
      if (series.style?.marker !== "none") {
        points.forEach((point) => {
          seriesMarkup += `<circle cx="${point.x}" cy="${point.y}" r="6" fill="${escapeHtml(color)}" stroke="#fff" stroke-width="3" />`;
        });
      }
      if (seriesIndex === 0) {
        points.forEach((point, index) => {
          seriesMarkup += `<text x="${point.x}" y="${point.y - 12}" text-anchor="middle" font-size="12" font-weight="700" fill="#0f5160">${escapeHtml(String(point.value))}</text>`;
          seriesMarkup += `<text x="${point.x}" y="${bottom + 26}" text-anchor="middle" font-size="12" fill="${escapeHtml(chartLabelColor(spec, "xAxis", "#465866"))}">${escapeHtml(spec.categories[index]!)}</text>`;
        });
      }
    });
  } else {
    spec.categories.forEach((category, categoryIndex) => {
      spec.series.forEach((series, seriesIndex) => {
        const x = left + categoryIndex * slotWidth + (slotWidth - barGroupWidth) / 2 + seriesIndex * barWidth;
        const value = series.values[categoryIndex] ?? 0;
        const barHeight = (Math.abs(value) / maxValue) * plotHeight;
        const y = bottom - barHeight;
        seriesMarkup += `<rect x="${x}" y="${y}" width="${Math.max(18, barWidth - 8)}" height="${barHeight}" rx="8" fill="${escapeHtml(series.color || pickColor(seriesIndex))}" />`;
        if (seriesIndex === 0) {
          seriesMarkup += `<text x="${left + categoryIndex * slotWidth + slotWidth / 2}" y="${bottom + 26}" text-anchor="middle" font-size="12" fill="${escapeHtml(chartLabelColor(spec, "xAxis", "#465866"))}">${escapeHtml(category)}</text>`;
        }
      });
    });
  }

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block;">
    ${gridLines}
    <line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="${escapeHtml(chartAxisColor(spec, "xAxis", "#9fb2c2"))}" stroke-width="${spec.style?.xAxis?.lineWidthPt ?? 1.2}"${svgDashArray(spec.style?.xAxis?.lineDash)} />
    <line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="${escapeHtml(chartAxisColor(spec, "yAxis", "#c3d0da"))}" stroke-width="${spec.style?.yAxis?.lineWidthPt ?? 1.2}"${svgDashArray(spec.style?.yAxis?.lineDash)} />
    ${seriesMarkup}
  </svg>`;
}

function renderComboChart(spec: Extract<HtmlChartSpec, { kind: "combo" }>) {
  const width = 1160;
  const height = 460;
  const left = 84;
  const right = width - 64;
  const top = 86;
  const bottom = height - 62;
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const barSeries = spec.series.filter((series) => (series.role ?? "bar") === "bar");
  const lineSeries = spec.series.filter((series) => (series.role ?? "bar") === "line");
  const primaryValues = barSeries.flatMap((series) => series.values);
  const secondaryValues = lineSeries.flatMap((series) => series.values);
  const primaryMax = Math.max(1, ...primaryValues.map((value) => Math.abs(value)));
  const secondaryMax = Math.max(1, ...secondaryValues.map((value) => Math.abs(value)));
  const slotWidth = plotWidth / Math.max(1, spec.categories.length);
  const groupWidth = slotWidth * 0.58;
  const barWidth = Math.max(24, groupWidth / Math.max(1, barSeries.length));

  const primaryGrid = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const y = bottom - ratio * plotHeight;
    const value = Math.round(ratio * primaryMax);
    return `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${escapeHtml(chartGridColor(spec, "yAxis", "#d9e5ef"))}" stroke-width="${spec.style?.yAxis?.gridWidthPt ?? 1}"${svgDashArray(spec.style?.yAxis?.gridDash)} />
      <text x="${left - 12}" y="${y + 4}" text-anchor="end" font-size="${spec.style?.yAxis?.labelFontSize ?? 12}" fill="${escapeHtml(chartLabelColor(spec, "yAxis", "#7a8995"))}">${escapeHtml(String(value))}</text>`;
  }).join("");
  const secondaryLabels = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const y = bottom - ratio * plotHeight;
    const value = Math.round(ratio * secondaryMax);
    return `<text x="${right + 12}" y="${y + 4}" font-size="12" fill="#7a8995">${escapeHtml(String(value))}${escapeHtml(spec.secondaryUnit || "")}</text>`;
  }).join("");

  const bars = spec.categories.map((category, categoryIndex) => {
    const xBase = left + categoryIndex * slotWidth + (slotWidth - groupWidth) / 2;
    const barMarkup = barSeries.map((series, seriesIndex) => {
      const value = series.values[categoryIndex] ?? 0;
      const heightValue = (Math.abs(value) / primaryMax) * plotHeight;
      const x = xBase + seriesIndex * barWidth;
      const y = bottom - heightValue;
      return `<rect x="${x}" y="${y}" width="${Math.max(18, barWidth - 8)}" height="${heightValue}" rx="8" fill="${escapeHtml(series.color || pickColor(seriesIndex, "bar"))}" />`;
    }).join("");
    return `${barMarkup}<text x="${left + categoryIndex * slotWidth + slotWidth / 2}" y="${bottom + 26}" text-anchor="middle" font-size="12" fill="${escapeHtml(chartLabelColor(spec, "xAxis", "#465866"))}">${escapeHtml(category)}</text>`;
  }).join("");

  const lineMarkup = lineSeries.map((series, seriesIndex) => {
    const points = spec.categories.map((_, categoryIndex) => {
      const x = left + categoryIndex * slotWidth + slotWidth / 2;
      const value = series.values[categoryIndex] ?? 0;
      const y = bottom - (Math.abs(value) / secondaryMax) * plotHeight;
      return { x, y, value };
    });
    const color = series.color || pickColor(seriesIndex, "line");
    const markers =
      series.style?.marker === "none"
        ? ""
        : points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="6" fill="${escapeHtml(color)}" stroke="#fff" stroke-width="3" />`).join("");
    return `<path d="${points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")}" fill="none" stroke="${escapeHtml(color)}" stroke-width="${series.style?.lineWidthPt ?? 4}" stroke-linecap="round" stroke-linejoin="round"${svgDashArray(series.style?.lineDash)} />
      ${markers}`;
  }).join("");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block;">
    ${primaryGrid}
    ${secondaryLabels}
    <line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="${escapeHtml(chartAxisColor(spec, "xAxis", "#9fb2c2"))}" stroke-width="${spec.style?.xAxis?.lineWidthPt ?? 1.2}"${svgDashArray(spec.style?.xAxis?.lineDash)} />
    <line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="${escapeHtml(chartAxisColor(spec, "yAxis", "#c3d0da"))}" stroke-width="${spec.style?.yAxis?.lineWidthPt ?? 1.2}"${svgDashArray(spec.style?.yAxis?.lineDash)} />
    <line x1="${right}" y1="${top}" x2="${right}" y2="${bottom}" stroke="${escapeHtml(spec.style?.secondaryYAxis?.lineColor || "#c3d0da")}" stroke-width="${spec.style?.secondaryYAxis?.lineWidthPt ?? 1.2}"${svgDashArray(spec.style?.secondaryYAxis?.lineDash)} />
    ${bars}
    ${lineMarkup}
  </svg>`;
}

function renderBubbleChart(spec: HtmlBubbleChartSpec) {
  const width = 1160;
  const height = 500;
  const left = 88;
  const right = width - 48;
  const top = 72;
  const bottom = height - 76;
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const xValues = spec.points.map((point) => point.x);
  const yValues = spec.points.map((point) => point.y);
  const sizeValues = spec.points.map((point) => point.size);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const sizeMax = Math.max(...sizeValues, 1);
  const points = spec.points.map((point, index) => {
    const x =
      xMax === xMin ? left + plotWidth / 2 : left + ((point.x - xMin) / Math.max(1, xMax - xMin)) * plotWidth;
    const y =
      yMax === yMin ? top + plotHeight / 2 : bottom - ((point.y - yMin) / Math.max(1, yMax - yMin)) * plotHeight;
    const radius = 18 + (point.size / sizeMax) * 54;
    return {
      ...point,
      x,
      y,
      radius,
      color: point.color || DEFAULT_BUBBLE_COLORS[index % DEFAULT_BUBBLE_COLORS.length]!,
    };
  });

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block;">
    <line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="${escapeHtml(chartAxisColor(spec, "xAxis", "#a9b8c4"))}" stroke-width="${spec.style?.xAxis?.lineWidthPt ?? 1.2}"${svgDashArray(spec.style?.xAxis?.lineDash)} />
    <line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="${escapeHtml(chartAxisColor(spec, "yAxis", "#a9b8c4"))}" stroke-width="${spec.style?.yAxis?.lineWidthPt ?? 1.2}"${svgDashArray(spec.style?.yAxis?.lineDash)} />
    ${Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      const y = bottom - ratio * plotHeight;
      const label = Math.round(yMin + ratio * (yMax - yMin));
      return `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${escapeHtml(chartGridColor(spec, "yAxis", "#e1e9ef"))}" stroke-width="${spec.style?.yAxis?.gridWidthPt ?? 1}"${svgDashArray(spec.style?.yAxis?.gridDash)} />
        <text x="${left - 12}" y="${y + 4}" text-anchor="end" font-size="${spec.style?.yAxis?.labelFontSize ?? 12}" fill="${escapeHtml(chartLabelColor(spec, "yAxis", "#7a8995"))}">${escapeHtml(String(label))}</text>`;
    }).join("")}
    ${Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      const x = left + ratio * plotWidth;
      const label = Math.round(xMin + ratio * (xMax - xMin));
      return `<text x="${x}" y="${bottom + 26}" text-anchor="middle" font-size="${spec.style?.xAxis?.labelFontSize ?? 12}" fill="${escapeHtml(chartLabelColor(spec, "xAxis", "#7a8995"))}">${escapeHtml(String(label))}</text>`;
    }).join("")}
    ${points.map((point) => `
      <circle cx="${point.x}" cy="${point.y}" r="${point.radius}" fill="${escapeHtml(point.color || DEFAULT_BUBBLE_COLORS[0]!)}" opacity="0.82" stroke="rgba(255,255,255,0.88)" stroke-width="2.5" />
      <text x="${point.x + point.radius + 12}" y="${point.y - 8}" font-size="13" font-weight="700" fill="#1c2a34">${escapeHtml(point.label)}</text>
    `).join("")}
    <text x="${(left + right) / 2}" y="${height - 18}" text-anchor="middle" font-size="13" fill="#5f7384">${escapeHtml(spec.xLabel)}</text>
    <text x="22" y="${(top + bottom) / 2}" transform="rotate(-90 22 ${(top + bottom) / 2})" text-anchor="middle" font-size="13" fill="#5f7384">${escapeHtml(spec.yLabel)}</text>
  </svg>`;
}

function renderMatrixChart(spec: HtmlMatrixChartSpec) {
  const width = 1160;
  const height = 500;
  const left = 96;
  const right = width - 72;
  const top = 62;
  const bottom = height - 82;
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const quadrants =
    spec.quadrants?.length
      ? spec.quadrants
      : [
          { id: "q1", label: "", x: 0, y: 0, w: 0.5, h: 0.5, color: "rgba(181,86,56,0.06)" },
          { id: "q2", label: "", x: 0.5, y: 0, w: 0.5, h: 0.5, color: "rgba(48,92,99,0.06)" },
          { id: "q3", label: "", x: 0, y: 0.5, w: 0.5, h: 0.5, color: "rgba(127,157,161,0.06)" },
          { id: "q4", label: "", x: 0.5, y: 0.5, w: 0.5, h: 0.5, color: "rgba(208,143,115,0.06)" },
        ];
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block;">
    <rect x="${left}" y="${top}" width="${plotWidth}" height="${plotHeight}" rx="14" fill="rgba(255,255,255,0.54)" stroke="#d9e5ef" stroke-width="1.2" />
    ${quadrants
      .map(
        (quadrant) =>
          `<rect x="${left + quadrant.x * plotWidth}" y="${top + quadrant.y * plotHeight}" width="${quadrant.w * plotWidth}" height="${quadrant.h * plotHeight}" fill="${escapeHtml(quadrant.color || "rgba(47,93,132,0.04)")}" />`,
      )
      .join("")}
    <line x1="${left + plotWidth / 2}" y1="${top}" x2="${left + plotWidth / 2}" y2="${bottom}" stroke="#c3d0da" stroke-width="1.2" />
    <line x1="${left}" y1="${top + plotHeight / 2}" x2="${right}" y2="${top + plotHeight / 2}" stroke="#c3d0da" stroke-width="1.2" />
    ${spec.items
      .map((item, index) => {
        const x = left + item.x * plotWidth;
        const y = top + item.y * plotHeight;
        const w = Math.max(92, item.w * plotWidth);
        const h = Math.max(54, item.h * plotHeight);
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${escapeHtml(item.color || DEFAULT_BAR_COLORS[index % DEFAULT_BAR_COLORS.length]!)}" opacity="0.88" stroke="rgba(255,255,255,0.82)" stroke-width="2" />
          <text x="${x + 14}" y="${y + 22}" font-size="13" font-weight="700" fill="${escapeHtml(item.textColor || "#17283a")}">${escapeHtml(item.label)}</text>
          ${item.detail ? `<text x="${x + 14}" y="${y + 42}" font-size="11" fill="${escapeHtml(item.textColor || "#526779")}">${escapeHtml(item.detail)}</text>` : ""}`;
      })
      .join("")}
    <text x="${left}" y="${bottom + 30}" font-size="12" fill="#667d90">${escapeHtml(spec.xMinLabel || "")}</text>
    <text x="${right}" y="${bottom + 30}" text-anchor="end" font-size="12" fill="#667d90">${escapeHtml(spec.xMaxLabel || "")}</text>
    <text x="${(left + right) / 2}" y="${height - 18}" text-anchor="middle" font-size="13" fill="#5f7384">${escapeHtml(spec.xLabel)}</text>
    <text x="${left - 42}" y="${top + 12}" text-anchor="end" font-size="12" fill="#667d90">${escapeHtml(spec.yMaxLabel || "")}</text>
    <text x="${left - 42}" y="${bottom}" text-anchor="end" font-size="12" fill="#667d90">${escapeHtml(spec.yMinLabel || "")}</text>
    <text x="24" y="${(top + bottom) / 2}" transform="rotate(-90 24 ${(top + bottom) / 2})" text-anchor="middle" font-size="13" fill="#5f7384">${escapeHtml(spec.yLabel)}</text>
  </svg>`;
}

function getChartPresentation(spec: PresentableChartSpec) {
  return spec.presentation ?? normalizeChartPresentationSpec(undefined, spec);
}

function getChartDensitySettings(spec: PresentableChartSpec) {
  const density = getChartPresentation(spec).density ?? "hero";
  if (density === "sidecar") {
    return {
      padding: "18px 18px 14px",
      chartMarginTop: 8,
      footerSize: 10,
    };
  }
  if (density === "peer") {
    return {
      padding: "20px 20px 15px",
      chartMarginTop: 10,
      footerSize: 10,
    };
  }
  return {
    padding: "24px 26px 18px",
    chartMarginTop: 12,
    footerSize: 11,
  };
}

function buildHtmlChartExportPayload(spec: HtmlChartSpec) {
  if (spec.kind === "bubble" || spec.kind === "matrix") {
    return null;
  }
  return {
    kind: spec.kind,
    categories: spec.categories,
    series: spec.series.map((series) => ({
      name: series.label,
      label: series.label,
      values: series.values,
      color: series.color,
      role: series.role,
      axis: series.axis,
    })),
    title: spec.title,
    subtitle: spec.subtitle,
    insight: spec.insight,
    unit: spec.unit,
    secondaryUnit: spec.kind === "combo" ? spec.secondaryUnit : undefined,
    presentation: spec.presentation,
  };
}

export function renderHtmlChartModule(args: {
  spec: HtmlChartSpec;
  background?: string | null;
  border?: string | null;
  accent?: string | null;
}) {
  const spec = args.spec.kind === "matrix"
    ? args.spec
    : withNormalizedChartPresentation(args.spec, args.spec.presentation);
  const presentation = spec.kind === "matrix" ? null : getChartPresentation(spec);
  const density = spec.kind === "matrix" ? null : getChartDensitySettings(spec);
  const background = normalizeText(args.background) || "#ffffff";
  const border = normalizeText(args.border) || "#d8e0e6";
  const accent = normalizeText(args.accent) || "#173d57";
  const svg =
    spec.kind === "bubble"
      ? renderBubbleChart(spec)
      : spec.kind === "matrix"
        ? renderMatrixChart(spec)
      : spec.kind === "combo"
        ? renderComboChart(spec)
        : renderBarLikeChart(spec);
  const exportPayload = buildHtmlChartExportPayload(spec);
  const padding = density?.padding ?? "24px 24px 20px";
  const marginTop = density?.chartMarginTop ?? 18;
  const footerSize = density?.footerSize ?? 11;
  return `<div class="html-chart-module" data-html-module-kind="${CHART_MODULE_KIND}" data-html-module-label="Chart" data-html-visual-kind="chart-frame" data-html-fit-role="content"${presentation ? ` data-chart-presentation-version="2" data-chart-exhibit-preset="${escapeHtml(presentation.exhibitPreset ?? "auto")}" data-chart-density="${escapeHtml(presentation.density ?? "hero")}"` : ""} ${HTML_CHART_SPEC_ATTRIBUTE}="${serializeJson(spec)}" ${exportPayload ? `data-export-chart="${serializeJson(exportPayload)}"` : ""} style="position:relative;background:${escapeHtml(background)};border:1px solid ${escapeHtml(border)};border-radius:8px;padding:${padding};box-shadow:none;--ppt-accent:${escapeHtml(accent)};">
    <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:24px;border-bottom:1px solid ${escapeHtml(border)};padding-bottom:14px;">
      <div>
        <div style="font-size:11px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#8a6b2f;margin-bottom:8px;">Exhibit</div>
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;line-height:1.12;color:#122d3f;">${escapeHtml(spec.title || "Chart")}</div>
        ${spec.subtitle || spec.insight ? `<div style="margin-top:8px;font-size:12px;line-height:1.42;color:#5c7080;max-width:760px;">${escapeHtml(spec.subtitle || spec.insight)}</div>` : ""}
      </div>
      <div style="font-size:12px;color:#667d90;text-align:right;">${escapeHtml(spec.kind === "bubble" ? spec.sizeLabel : spec.kind === "matrix" ? `${spec.xLabel} / ${spec.yLabel}` : spec.unit || "")}</div>
    </div>
    <div style="margin-top:${marginTop}px;padding:0 2px;">${svg}</div>
    <div style="border-top:1px solid ${escapeHtml(border)};margin-top:6px;padding-top:9px;font-size:${footerSize}px;letter-spacing:0.12em;text-transform:uppercase;color:#7f919f;text-align:right;">Structured chart data</div>
  </div>`;
}

export function renderHtmlTableModule(args: {
  tableSpec: HtmlTableSpec;
  background?: string | null;
  border?: string | null;
  accent?: string | null;
}) {
  const background = normalizeText(args.background) || "rgba(255,255,255,0.82)";
  const border = normalizeText(args.border) || "#d9e5ef";
  const accent = normalizeText(args.accent) || "#2a6f97";
  const columnTemplate = `minmax(180px,1.8fr) ${Array.from({
    length: Math.max(0, args.tableSpec.columns.length - 1),
  })
    .map(() => "minmax(120px,1fr)")
    .join(" ")}`.trim();
  return `<div class="html-table-module" data-html-module-kind="${TABLE_MODULE_KIND}" data-html-module-label="Table" data-html-visual-kind="surface" data-html-fit-role="content" ${HTML_TABLE_SPEC_ATTRIBUTE}="${serializeJson(args.tableSpec)}" style="position:relative;background:${escapeHtml(background)};border:1px solid ${escapeHtml(border)};border-radius:24px;padding:18px 18px 12px;box-shadow:0 18px 42px rgba(93,119,142,0.08);--ppt-accent:${escapeHtml(accent)};">
    <div style="display:grid;grid-template-columns:${columnTemplate};align-items:center;padding:12px 10px 14px;border-bottom:1px solid ${escapeHtml(border)};font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6d8294;font-weight:700;">
      ${args.tableSpec.columns.map((column) => `<div>${escapeHtml(column.label)}</div>`).join("")}
    </div>
    <div style="display:grid;gap:0;">
      ${args.tableSpec.rows.map((row, rowIndex) => `<div style="display:grid;grid-template-columns:${columnTemplate};align-items:start;padding:14px 10px;border-bottom:${rowIndex === args.tableSpec.rows.length - 1 ? "0" : `1px solid ${escapeHtml(border)}`};background:${rowIndex === 0 ? "rgba(31,211,255,0.06)" : "transparent"};">
        ${args.tableSpec.columns.map((column, columnIndex) => {
          const value = row[columnIndex] ?? "";
          return `<div style="font-size:${columnIndex === 0 ? "15px" : "14px"};line-height:1.45;color:${columnIndex === 0 ? "#162430" : "#415566"};font-weight:${columnIndex === 0 ? "700" : "500"};white-space:pre-wrap;">${escapeHtml(value)}</div>`;
        }).join("")}
      </div>`).join("")}
    </div>
  </div>`;
}
