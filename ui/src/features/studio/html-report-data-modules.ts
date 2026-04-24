import {
  createEmptyDataTable,
  parseDataBlockInput,
  stringifyDataTable,
} from "@/features/studio/data-table";
import type {
  DataTableModel,
  HtmlBubbleChartSpec,
  HtmlBubblePoint,
  HtmlChartAxisRole,
  HtmlChartDensity,
  HtmlChartExhibitPreset,
  HtmlChartKind,
  HtmlChartPresentationAnnotation,
  HtmlChartPresentationEmphasis,
  HtmlChartPresentationSpec,
  HtmlChartSeries,
  HtmlChartSeriesRole,
  HtmlChartSpec,
  HtmlChartValueFormat,
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

function serializeJson(value: unknown) {
  return JSON.stringify(value).replace(/"/g, "&quot;");
}

function readNumericStyle(element: HTMLElement, property: "left" | "top" | "width" | "height") {
  const raw = element.style[property];
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readSvgNumericAttribute(element: Element, attribute: string) {
  const parsed = Number.parseFloat(element.getAttribute(attribute) ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function getModuleRoot(element: Element) {
  return element.closest(
    `[data-html-module-kind="${CHART_MODULE_KIND}"],[data-html-module-kind="${TABLE_MODULE_KIND}"]`,
  );
}

function normalizeSeriesLabel(label: string | null | undefined, fallback: string) {
  const normalized = normalizeText(label);
  return normalized || fallback;
}

function normalizeChartText(value: string | null | undefined, fallback = "") {
  return normalizeText(value) || fallback;
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

function buildDefaultChartEmphasis(spec: HtmlChartSpec): HtmlChartPresentationEmphasis[] {
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

function inferChartExhibitPreset(spec: HtmlChartSpec): HtmlChartExhibitPreset {
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

function normalizeChartExhibitPreset(value: unknown, spec: HtmlChartSpec): HtmlChartExhibitPreset {
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
  spec: HtmlChartSpec,
): HtmlChartPresentationSpec {
  const candidate = value && typeof value === "object" ? value as Partial<HtmlChartPresentationSpec> : {};
  const unit = spec.unit;
  const emphasis = normalizePresentationEmphasis(candidate.emphasis);
  return {
    version: 2,
    preset: "investor-editorial",
    exhibitPreset: normalizeChartExhibitPreset(candidate.exhibitPreset, spec),
    density: normalizeChartDensity(candidate.density),
    valueFormat: normalizeChartValueFormat(candidate.valueFormat, unit),
    emphasis: emphasis.length ? emphasis : buildDefaultChartEmphasis(spec as HtmlChartSpec),
    annotations: normalizePresentationAnnotations(candidate.annotations),
  };
}

function withNormalizedChartPresentation<T extends HtmlChartSpec>(spec: T, rawPresentation: unknown): T {
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
  };
}

export function serializeHtmlChartSpec(spec: HtmlChartSpec) {
  return JSON.stringify(withNormalizedChartPresentation(spec, spec.presentation));
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
      }, (parsed as { presentation?: unknown }).presentation);
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

function detectBubbleChartSpec(root: HTMLElement): HtmlChartSpec | null {
  const circles = Array.from(root.querySelectorAll<HTMLElement>("[style*='border-radius:50%'],[style*='border-radius: 50%']"))
    .filter((element) => {
      if (getModuleRoot(element) && getModuleRoot(element) !== root) {
        return false;
      }
      const width = readNumericStyle(element, "width");
      const height = readNumericStyle(element, "height");
      return width >= 50 && Math.abs(width - height) <= 18;
    });
  if (circles.length < 3) {
    return null;
  }

  const textNodes = collectAbsoluteTextNodes(root);
  const xTicks = textNodes
    .filter((node) => node.top >= 410 && parsePercentOrNumberToken(node.text) !== null)
    .sort((left, right) => left.left - right.left);
  const yTicks = textNodes
    .filter((node) => node.left <= 90 && parsePercentOrNumberToken(node.text) !== null)
    .sort((left, right) => left.top - right.top);
  const xMin = xTicks.length >= 2 ? (parsePercentOrNumberToken(xTicks[0]!.text) ?? 0) : 0;
  const xMax = xTicks.length >= 2 ? (parsePercentOrNumberToken(xTicks.at(-1)?.text) ?? 100) : 100;
  const yMax = yTicks.length >= 2 ? (parsePercentOrNumberToken(yTicks[0]!.text) ?? 100) : 100;
  const yMin = yTicks.length >= 2 ? (parsePercentOrNumberToken(yTicks.at(-1)?.text) ?? 0) : 0;
  const xStart = xTicks.length >= 2 ? xTicks[0]!.left : 60;
  const xEnd = xTicks.length >= 2 ? xTicks.at(-1)!.left : Math.max(960, root.clientWidth - 120);
  const yTop = yTicks.length >= 2 ? yTicks[0]!.top : 90;
  const yBottom = yTicks.length >= 2 ? yTicks.at(-1)!.top : 420;

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
  const title = textNodes.find((node) => node.weight >= 700 && node.top < 180)?.text ?? "";
  const subtitle =
    textNodes.find((node) => node.weight < 700 && node.width > 400 && node.top < 260)?.text ?? "";
  const xLabel =
    textNodes.find((node) => node.top >= 430 && node.width > 200)?.text ?? "X axis";
  const yLabel =
    textNodes.find((node) => node.left < 160 && node.top < 120 && node.width > 120)?.text ??
    "Y axis";

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
    const spec = detectComboChartSpec(element) ?? detectWaterfallChartSpec(element);
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

  Array.from(page.querySelectorAll<HTMLElement>("div, article, aside, section, figure")).forEach((element) => {
    if (getModuleRoot(element) && getModuleRoot(element) !== element) {
      return;
    }
    if (element.getAttribute("data-html-module-kind")) {
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
      unit: baseSpec?.unit ?? "",
      xLabel: baseSpec?.kind === "bubble" ? baseSpec.xLabel : "X axis",
      yLabel: baseSpec?.kind === "bubble" ? baseSpec.yLabel : "Y axis",
      sizeLabel: baseSpec?.kind === "bubble" ? baseSpec.sizeLabel : "Bubble size",
      points,
    }, baseSpec?.presentation);
  }

  if (dataTable.columns.length < 2 || !dataTable.rows.length) {
    return null;
  }
  const categories = dataTable.rows.map((row, index) => normalizeSeriesLabel(row[0], `Category ${index + 1}`));
  const series = dataTable.columns.slice(1).map((column, columnIndex) =>
    normalizeChartSeries(
      {
        id:
          baseSpec?.kind !== "bubble"
            ? baseSpec?.series[columnIndex]?.id ?? `series-${columnIndex + 1}`
            : `series-${columnIndex + 1}`,
        label: column.label,
        values: dataTable.rows.map((row) => Number(row[columnIndex + 1]) || 0),
        color:
          baseSpec?.kind !== "bubble"
            ? baseSpec?.series[columnIndex]?.color ?? undefined
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
      unit: baseSpec?.unit ?? "",
      secondaryUnit: baseSpec?.kind === "combo" ? baseSpec.secondaryUnit ?? "" : "",
      categories,
      series,
    }, baseSpec?.presentation);
  }
  return withNormalizedChartPresentation({
    kind,
    title: baseSpec?.title ?? "",
    subtitle: baseSpec?.subtitle ?? "",
    insight: baseSpec?.insight ?? "",
    unit: baseSpec?.unit ?? "",
    categories,
    series,
  }, baseSpec?.presentation);
}

export function updateHtmlChartSpecFromRawData(args: {
  current: HtmlChartSpec;
  raw: string;
}): HtmlChartSpec | null {
  const dataTable = args.raw.trim() ? parseDataBlockInput(args.raw) : createEmptyDataTable("");
  return dataTableToChartSpec({
    dataTable,
    kind: args.current.kind,
    baseSpec: {
      ...args.current,
      ...(args.current.kind === "bubble"
        ? { points: args.current.points.map((point) => ({ ...point })) }
        : { series: args.current.series.map((series) => ({ ...series, values: [...series.values] })) }),
    } as HtmlChartSpec,
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
    ${spec.kind === "bubble"
      ? `<div style="font-size:12px;color:#667d90;text-align:right;">${escapeHtml(spec.sizeLabel)}</div>`
      : `<div style="font-size:12px;color:#667d90;text-align:right;">${escapeHtml(spec.unit || "")}</div>`}
  </div>`;
}

function renderBarLikeChart(spec: Exclude<HtmlChartSpec, HtmlBubbleChartSpec | { kind: "combo" }>) {
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
    return `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#d9e5ef" stroke-width="1" />
      <text x="${left - 12}" y="${y + 4}" text-anchor="end" font-size="12" fill="#7a8995">${escapeHtml(String(value))}</text>`;
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
    const points = spec.categories.map((_, categoryIndex) => {
      const x = left + categoryIndex * slotWidth + slotWidth / 2;
      const value = spec.series[0]?.values[categoryIndex] ?? 0;
      const y = bottom - (value / maxValue) * plotHeight;
      return { x, y, value };
    });
    seriesMarkup += `<path d="${points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")}" fill="none" stroke="${escapeHtml(spec.series[0]?.color || DEFAULT_LINE_COLORS[0]!)}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />`;
    points.forEach((point, index) => {
      seriesMarkup += `<circle cx="${point.x}" cy="${point.y}" r="6" fill="${escapeHtml(spec.series[0]?.color || DEFAULT_LINE_COLORS[0]!)}" stroke="#fff" stroke-width="3" />`;
      seriesMarkup += `<text x="${point.x}" y="${point.y - 12}" text-anchor="middle" font-size="12" font-weight="700" fill="#0f5160">${escapeHtml(String(point.value))}</text>`;
      seriesMarkup += `<text x="${point.x}" y="${bottom + 26}" text-anchor="middle" font-size="12" fill="#465866">${escapeHtml(spec.categories[index]!)}</text>`;
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
          seriesMarkup += `<text x="${left + categoryIndex * slotWidth + slotWidth / 2}" y="${bottom + 26}" text-anchor="middle" font-size="12" fill="#465866">${escapeHtml(category)}</text>`;
        }
      });
    });
  }

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block;">
    ${gridLines}
    <line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="#9fb2c2" stroke-width="1.2" />
    <line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="#c3d0da" stroke-width="1.2" />
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
    return `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#d9e5ef" stroke-width="1" />
      <text x="${left - 12}" y="${y + 4}" text-anchor="end" font-size="12" fill="#7a8995">${escapeHtml(String(value))}</text>`;
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
    return `${barMarkup}<text x="${left + categoryIndex * slotWidth + slotWidth / 2}" y="${bottom + 26}" text-anchor="middle" font-size="12" fill="#465866">${escapeHtml(category)}</text>`;
  }).join("");

  const lineMarkup = lineSeries.map((series, seriesIndex) => {
    const points = spec.categories.map((_, categoryIndex) => {
      const x = left + categoryIndex * slotWidth + slotWidth / 2;
      const value = series.values[categoryIndex] ?? 0;
      const y = bottom - (Math.abs(value) / secondaryMax) * plotHeight;
      return { x, y, value };
    });
    return `<path d="${points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")}" fill="none" stroke="${escapeHtml(series.color || pickColor(seriesIndex, "line"))}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="6" fill="${escapeHtml(series.color || pickColor(seriesIndex, "line"))}" stroke="#fff" stroke-width="3" />`).join("")}`;
  }).join("");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block;">
    ${primaryGrid}
    ${secondaryLabels}
    <line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="#9fb2c2" stroke-width="1.2" />
    <line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="#c3d0da" stroke-width="1.2" />
    <line x1="${right}" y1="${top}" x2="${right}" y2="${bottom}" stroke="#c3d0da" stroke-width="1.2" />
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
    <line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="#a9b8c4" stroke-width="1.2" />
    <line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="#a9b8c4" stroke-width="1.2" />
    ${Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      const y = bottom - ratio * plotHeight;
      const label = Math.round(yMin + ratio * (yMax - yMin));
      return `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#e1e9ef" stroke-width="1" />
        <text x="${left - 12}" y="${y + 4}" text-anchor="end" font-size="12" fill="#7a8995">${escapeHtml(String(label))}</text>`;
    }).join("")}
    ${Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      const x = left + ratio * plotWidth;
      const label = Math.round(xMin + ratio * (xMax - xMin));
      return `<text x="${x}" y="${bottom + 26}" text-anchor="middle" font-size="12" fill="#7a8995">${escapeHtml(String(label))}</text>`;
    }).join("")}
    ${points.map((point) => `
      <circle cx="${point.x}" cy="${point.y}" r="${point.radius}" fill="${escapeHtml(point.color || DEFAULT_BUBBLE_COLORS[0]!)}" opacity="0.82" stroke="rgba(255,255,255,0.88)" stroke-width="2.5" />
      <text x="${point.x + point.radius + 12}" y="${point.y - 8}" font-size="13" font-weight="700" fill="#1c2a34">${escapeHtml(point.label)}</text>
    `).join("")}
    <text x="${(left + right) / 2}" y="${height - 18}" text-anchor="middle" font-size="13" fill="#5f7384">${escapeHtml(spec.xLabel)}</text>
    <text x="22" y="${(top + bottom) / 2}" transform="rotate(-90 22 ${(top + bottom) / 2})" text-anchor="middle" font-size="13" fill="#5f7384">${escapeHtml(spec.yLabel)}</text>
  </svg>`;
}

type CartesianChartSpec = Exclude<HtmlChartSpec, HtmlBubbleChartSpec>;
type ChartAnchor = {
  category: string;
  pointIndex: number;
  seriesId?: string;
  x: number;
  y: number;
  value: number;
};

function getChartPresentation(spec: HtmlChartSpec) {
  return spec.presentation ?? normalizeChartPresentationSpec(undefined, spec);
}

function getChartDensitySettings(spec: HtmlChartSpec) {
  const density = getChartPresentation(spec).density ?? "hero";
  if (density === "sidecar") {
    return {
      padding: "18px 18px 14px",
      headerGap: "14px",
      titleSize: 19,
      subtitleSize: 11,
      unitSize: 14,
      dataSummarySize: 10,
      chartMarginTop: 8,
      footerSize: 10,
    };
  }
  if (density === "peer") {
    return {
      padding: "20px 20px 15px",
      headerGap: "18px",
      titleSize: 22,
      subtitleSize: 12,
      unitSize: 16,
      dataSummarySize: 10,
      chartMarginTop: 10,
      footerSize: 10,
    };
  }
  return {
    padding: "24px 26px 18px",
    headerGap: "26px",
    titleSize: 25,
    subtitleSize: 13,
    unitSize: 18,
    dataSummarySize: 11,
    chartMarginTop: 12,
    footerSize: 11,
  };
}

function getSeriesColor(series: HtmlChartSeries | undefined, index: number, role: HtmlChartSeriesRole = "bar") {
  return normalizeText(series?.color) || pickInvestorColor(index, role);
}

function getChartRoleColor(role: HtmlChartPresentationEmphasis["role"] | null, fallback: string) {
  switch (role) {
    case "primary":
      return "#173d57";
    case "positive":
      return CHART_POSITIVE;
    case "negative":
      return CHART_NEGATIVE;
    case "muted":
      return CHART_MUTED;
    default:
      return fallback;
  }
}

function targetMatchesAnchor(
  target: HtmlChartPresentationEmphasis["target"],
  anchor: ChartAnchor,
) {
  if (target.pointIndex !== undefined && target.pointIndex !== anchor.pointIndex) {
    return false;
  }
  if (target.category && target.category !== anchor.category) {
    return false;
  }
  if (target.seriesId && target.seriesId !== anchor.seriesId) {
    return false;
  }
  return true;
}

function getAnchorEmphasisRole(
  presentation: HtmlChartPresentationSpec,
  anchor: ChartAnchor,
) {
  return presentation.emphasis?.find((entry) => targetMatchesAnchor(entry.target, anchor))?.role ?? null;
}

function buildChartGrid(args: {
  left: number;
  right: number;
  top: number;
  bottom: number;
  minValue: number;
  maxValue: number;
  format: HtmlChartValueFormat | undefined;
}) {
  return Array.from({ length: 4 }, (_, index) => {
    const ratio = index / 3;
    const y = args.bottom - ratio * (args.bottom - args.top);
    const value = args.minValue + ratio * (args.maxValue - args.minValue);
    return `<line x1="${args.left}" y1="${y}" x2="${args.right}" y2="${y}" stroke="#dbe5eb" stroke-width="1" stroke-dasharray="${index === 0 ? "0" : "4 8"}" />
      <text x="${args.left - 14}" y="${y + 4}" text-anchor="end" font-size="11" fill="#708391">${escapeHtml(formatChartValue(value, args.format))}</text>`;
  }).join("");
}

function buildProjectY(args: {
  top: number;
  bottom: number;
  minValue: number;
  maxValue: number;
}) {
  const range = Math.max(1, args.maxValue - args.minValue);
  return (value: number) => args.bottom - ((value - args.minValue) / range) * (args.bottom - args.top);
}

function wrapSvgText(text: string, maxChars: number) {
  const words = normalizeText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.slice(0, 3);
}

function renderInvestorChartAnnotations(args: {
  presentation: HtmlChartPresentationSpec;
  anchors: ChartAnchor[];
  width: number;
  height: number;
}) {
  return (args.presentation.annotations ?? []).flatMap((annotation, index) => {
    const anchor = args.anchors.find((candidate) => targetMatchesAnchor(annotation.target, candidate));
    if (!anchor) {
      return [];
    }
    const lines = wrapSvgText(annotation.text, 24);
    if (!lines.length) {
      return [];
    }
    const boxWidth = 190;
    const boxHeight = 28 + lines.length * 15;
    const placement = annotation.placement ?? "auto";
    const x =
      placement === "right"
        ? Math.min(args.width - boxWidth - 18, anchor.x + 28)
        : Math.max(18, Math.min(args.width - boxWidth - 18, anchor.x - boxWidth / 2));
    const y =
      placement === "below"
        ? Math.min(args.height - boxHeight - 18, anchor.y + 30)
        : Math.max(18, anchor.y - boxHeight - 30);
    const leaderEndX = x + (anchor.x < x ? 12 : anchor.x > x + boxWidth ? boxWidth - 12 : boxWidth / 2);
    const leaderEndY = y + boxHeight;
    return [`<g data-chart-annotation="${escapeHtml(annotation.id || `annotation-${index + 1}`)}">
      <path d="M ${anchor.x} ${anchor.y - 8} L ${leaderEndX} ${leaderEndY}" fill="none" stroke="#9aaebd" stroke-width="1.2" stroke-dasharray="4 5" />
      <rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="14" fill="#ffffff" stroke="#d7e1e8" />
      ${lines.map((line, lineIndex) => `<text x="${x + 14}" y="${y + 22 + lineIndex * 15}" font-size="12" font-weight="${lineIndex === 0 ? 700 : 500}" fill="#213949">${escapeHtml(line)}</text>`).join("")}
    </g>`];
  }).join("");
}

function renderInvestorChartHeader(spec: HtmlChartSpec) {
  const subtitle = spec.subtitle || spec.insight;
  const density = getChartDensitySettings(spec);
  const dataSummary =
    spec.kind === "bubble"
      ? `${spec.points.length} points`
      : `${spec.categories.length} categories / ${spec.series.length} series`;
  return `<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:${density.headerGap};border-bottom:1px solid #d8e0e6;padding-bottom:14px;">
    <div style="max-width:780px;">
      <div style="font-size:11px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#8a6b2f;margin-bottom:8px;">Exhibit</div>
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:${density.titleSize}px;font-weight:700;letter-spacing:-0.02em;line-height:1.12;color:#122d3f;">${escapeHtml(spec.title || "Chart")}</div>
      ${subtitle ? `<div style="margin-top:8px;font-size:${density.subtitleSize}px;line-height:1.42;color:#5c7080;max-width:760px;">${escapeHtml(subtitle)}</div>` : ""}
    </div>
    <div style="text-align:right;min-width:${getChartPresentation(spec).density === "sidecar" ? "94" : "138"}px;">
      <div style="font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#728696;">Unit</div>
      <div style="margin-top:4px;font-size:${density.unitSize}px;font-weight:800;letter-spacing:-0.02em;color:#173d57;">${escapeHtml(spec.kind === "bubble" ? spec.sizeLabel : spec.unit || "value")}</div>
      <div style="margin-top:8px;font-size:${density.dataSummarySize}px;color:#7f919f;">${escapeHtml(dataSummary)}</div>
    </div>
  </div>`;
}

function renderInvestorBarLikeChart(spec: Exclude<CartesianChartSpec, { kind: "combo" }>) {
  const width = 1160;
  const height = 470;
  const left = 86;
  const right = width - 44;
  const top = 58;
  const bottom = height - 72;
  const presentation = getChartPresentation(spec);
  const format = presentation.valueFormat;
  const anchors: ChartAnchor[] = [];

  if (spec.kind === "waterfall") {
    const rawValues = spec.series[0]?.values ?? [];
    let running = 0;
    const steps = spec.categories.map((category, index) => {
      const rawValue = rawValues[index] ?? 0;
      const isEndpoint = index === 0 || index === spec.categories.length - 1;
      const start = isEndpoint ? 0 : running;
      const end = isEndpoint ? rawValue : running + rawValue;
      if (!isEndpoint) {
        running = end;
      }
      return { category, index, rawValue, start, end, isEndpoint };
    });
    const minValue = Math.min(0, ...steps.flatMap((step) => [step.start, step.end]));
    const maxValue = Math.max(1, ...steps.flatMap((step) => [step.start, step.end]));
    const projectY = buildProjectY({ top, bottom, minValue, maxValue });
    const slotWidth = (right - left) / Math.max(1, steps.length);
    const barWidth = Math.min(86, slotWidth * 0.58);
    const zeroY = projectY(0);
    const bars = steps.map((step) => {
      const x = left + step.index * slotWidth + (slotWidth - barWidth) / 2;
      const y1 = projectY(step.start);
      const y2 = projectY(step.end);
      const y = Math.min(y1, y2);
      const h = Math.max(12, Math.abs(y2 - y1));
      const anchor = {
        category: step.category,
        pointIndex: step.index,
        seriesId: spec.series[0]?.id,
        x: x + barWidth / 2,
        y,
        value: step.rawValue,
      };
      anchors.push(anchor);
      const role = getAnchorEmphasisRole(presentation, anchor) ?? (step.rawValue < 0 ? "negative" : step.isEndpoint ? "primary" : "positive");
      const color = getChartRoleColor(role, step.rawValue < 0 ? CHART_NEGATIVE : CHART_POSITIVE);
      const connector = step.index > 0
        ? `<line x1="${x - slotWidth + barWidth}" y1="${projectY(steps[step.index - 1]?.end ?? 0)}" x2="${x}" y2="${projectY(step.start)}" stroke="#b7c5cf" stroke-width="1.2" stroke-dasharray="5 6" />`
        : "";
      return `${connector}<g>
        <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="12" fill="${escapeHtml(color)}" opacity="${role === "muted" ? 0.42 : 0.96}" />
        <text x="${x + barWidth / 2}" y="${y - 12}" text-anchor="middle" font-size="13" font-weight="800" fill="#173d57">${escapeHtml(formatChartValue(step.rawValue, format))}</text>
        <text x="${x + barWidth / 2}" y="${bottom + 28}" text-anchor="middle" font-size="12" font-weight="700" fill="#4e6373">${escapeHtml(step.category)}</text>
      </g>`;
    }).join("");
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block;width:100%;height:auto;" xmlns="http://www.w3.org/2000/svg">
      <defs><filter id="chart-soft-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="#173d57" flood-opacity="0.10"/></filter></defs>
      ${buildChartGrid({ left, right, top, bottom, minValue, maxValue, format })}
      <line x1="${left}" y1="${zeroY}" x2="${right}" y2="${zeroY}" stroke="#91a5b3" stroke-width="1.4" />
      <g filter="url(#chart-soft-shadow)">${bars}</g>
      ${renderInvestorChartAnnotations({ presentation, anchors, width, height })}
    </svg>`;
  }

  const allValues = spec.series.flatMap((series) => series.values);
  const stackTotals = spec.kind === "stacked"
    ? spec.categories.map((_, index) => spec.series.reduce((sum, series) => sum + Math.max(0, series.values[index] ?? 0), 0))
    : [];
  const scaleValues = spec.kind === "stacked" ? stackTotals : allValues;
  const minValue = spec.kind === "line" ? Math.min(0, ...scaleValues) : Math.min(0, ...scaleValues);
  const maxValue = Math.max(1, ...scaleValues.map((value) => Math.abs(value)), ...scaleValues);
  const projectY = buildProjectY({ top, bottom, minValue, maxValue });
  const slotWidth = (right - left) / Math.max(1, spec.categories.length);
  const zeroY = projectY(0);

  if (spec.kind === "line") {
    const lines = spec.series.map((series, seriesIndex) => {
      const color = getSeriesColor(series, seriesIndex, "line");
      const points = spec.categories.map((category, pointIndex) => {
        const value = series.values[pointIndex] ?? 0;
        const x = left + pointIndex * slotWidth + slotWidth / 2;
        const y = projectY(value);
        const anchor = { category, pointIndex, seriesId: series.id, x, y, value };
        anchors.push(anchor);
        return anchor;
      });
      const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
      const area =
        seriesIndex === 0 && points.length
          ? `<path d="${path} L ${points.at(-1)!.x} ${zeroY} L ${points[0]!.x} ${zeroY} Z" fill="url(#chart-area-fill)" opacity="0.34" />`
          : "";
      return `${area}<path d="${path}" fill="none" stroke="${escapeHtml(color)}" stroke-width="${seriesIndex === 0 ? 4.5 : 3}" stroke-linecap="round" stroke-linejoin="round" />
        ${points.map((point) => {
          const role = getAnchorEmphasisRole(presentation, point);
          const fill = getChartRoleColor(role, color);
          return `<circle cx="${point.x}" cy="${point.y}" r="${role ? 7.5 : 5}" fill="${escapeHtml(fill)}" stroke="#fff" stroke-width="3" />
            ${role ? `<text x="${point.x}" y="${point.y - 16}" text-anchor="middle" font-size="13" font-weight="800" fill="#173d57">${escapeHtml(formatChartValue(point.value, format))}</text>` : ""}`;
        }).join("")}`;
    }).join("");
    const labels = spec.categories.map((category, index) => `<text x="${left + index * slotWidth + slotWidth / 2}" y="${bottom + 30}" text-anchor="middle" font-size="12" font-weight="700" fill="#4e6373">${escapeHtml(category)}</text>`).join("");
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block;width:100%;height:auto;" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="chart-area-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#8fb7c8"/><stop offset="100%" stop-color="#8fb7c8" stop-opacity="0"/></linearGradient></defs>
      ${buildChartGrid({ left, right, top, bottom, minValue, maxValue, format })}
      <line x1="${left}" y1="${zeroY}" x2="${right}" y2="${zeroY}" stroke="#91a5b3" stroke-width="1.3" />
      ${lines}
      ${labels}
      ${renderInvestorChartAnnotations({ presentation, anchors, width, height })}
    </svg>`;
  }

  const groupWidth = slotWidth * 0.62;
  const barWidth = spec.kind === "stacked" ? groupWidth : Math.max(18, groupWidth / Math.max(1, spec.series.length));
  const bars = spec.categories.map((category, categoryIndex) => {
    if (spec.kind === "stacked") {
      const x = left + categoryIndex * slotWidth + (slotWidth - groupWidth) / 2;
      let cursorY = zeroY;
      let cumulative = 0;
      const segments = spec.series.map((series, seriesIndex) => {
        const value = Math.max(0, series.values[categoryIndex] ?? 0);
        cumulative += value;
        const nextY = projectY(cumulative);
        const h = Math.max(5, cursorY - nextY);
        cursorY = nextY;
        const anchor = {
          category,
          pointIndex: categoryIndex,
          seriesId: series.id,
          x: x + groupWidth / 2,
          y: nextY,
          value,
        };
        anchors.push(anchor);
        const role = getAnchorEmphasisRole(presentation, anchor);
        const color = getChartRoleColor(role, getSeriesColor(series, seriesIndex));
        return `<rect x="${x}" y="${nextY}" width="${groupWidth}" height="${h}" rx="${seriesIndex === 0 ? 12 : 8}" fill="${escapeHtml(color)}" opacity="${role === "muted" ? 0.38 : role ? 0.98 : 0.82}" />`;
      }).join("");
      const total = stackTotals[categoryIndex] ?? 0;
      return `<g>${segments}<text x="${x + groupWidth / 2}" y="${cursorY - 12}" text-anchor="middle" font-size="13" font-weight="800" fill="#173d57">${escapeHtml(formatChartValue(total, format))}</text><text x="${x + groupWidth / 2}" y="${bottom + 30}" text-anchor="middle" font-size="12" font-weight="700" fill="#4e6373">${escapeHtml(category)}</text></g>`;
    }

    return spec.series.map((series, seriesIndex) => {
      const value = series.values[categoryIndex] ?? 0;
      const x = left + categoryIndex * slotWidth + (slotWidth - groupWidth) / 2 + seriesIndex * barWidth;
      const y = value >= 0 ? projectY(value) : zeroY;
      const h = Math.max(4, Math.abs(projectY(value) - zeroY));
      const anchor = {
        category,
        pointIndex: categoryIndex,
        seriesId: series.id,
        x: x + barWidth / 2,
        y,
        value,
      };
      anchors.push(anchor);
      const role = getAnchorEmphasisRole(presentation, anchor);
      const color = getChartRoleColor(role, value < 0 ? CHART_NEGATIVE : getSeriesColor(series, seriesIndex));
      return `<g>
        <rect x="${x}" y="${y}" width="${Math.max(12, barWidth - 8)}" height="${h}" rx="12" fill="${escapeHtml(color)}" opacity="${role === "muted" ? 0.38 : role ? 0.98 : 0.78}" />
        <text x="${x + Math.max(12, barWidth - 8) / 2}" y="${value >= 0 ? y - 12 : y + h + 18}" text-anchor="middle" font-size="12" font-weight="800" fill="#173d57">${escapeHtml(formatChartValue(value, format))}</text>
        ${seriesIndex === 0 ? `<text x="${left + categoryIndex * slotWidth + slotWidth / 2}" y="${bottom + 30}" text-anchor="middle" font-size="12" font-weight="700" fill="#4e6373">${escapeHtml(category)}</text>` : ""}
      </g>`;
    }).join("");
  }).join("");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block;width:100%;height:auto;" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="chart-soft-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="#173d57" flood-opacity="0.09"/></filter></defs>
    ${buildChartGrid({ left, right, top, bottom, minValue, maxValue, format })}
    <line x1="${left}" y1="${zeroY}" x2="${right}" y2="${zeroY}" stroke="#91a5b3" stroke-width="1.3" />
    <g filter="url(#chart-soft-shadow)">${bars}</g>
    ${renderInvestorChartAnnotations({ presentation, anchors, width, height })}
  </svg>`;
}

function renderInvestorComboChart(spec: Extract<CartesianChartSpec, { kind: "combo" }>) {
  const width = 1160;
  const height = 470;
  const left = 86;
  const right = width - 76;
  const top = 58;
  const bottom = height - 72;
  const presentation = getChartPresentation(spec);
  const format = presentation.valueFormat;
  const anchors: ChartAnchor[] = [];
  const barSeries = spec.series.filter((series) => (series.role ?? "bar") === "bar");
  const lineSeries = spec.series.filter((series) => (series.role ?? "bar") === "line");
  const primaryValues = barSeries.flatMap((series) => series.values);
  const secondaryValues = lineSeries.flatMap((series) => series.values);
  const primaryMin = Math.min(0, ...primaryValues);
  const primaryMax = Math.max(1, ...primaryValues);
  const secondaryMin = Math.min(0, ...secondaryValues);
  const secondaryMax = Math.max(1, ...secondaryValues);
  const primaryY = buildProjectY({ top, bottom, minValue: primaryMin, maxValue: primaryMax });
  const secondaryY = buildProjectY({ top, bottom, minValue: secondaryMin, maxValue: secondaryMax });
  const slotWidth = (right - left) / Math.max(1, spec.categories.length);
  const groupWidth = slotWidth * 0.54;
  const barWidth = Math.max(18, groupWidth / Math.max(1, barSeries.length));

  const bars = spec.categories.map((category, categoryIndex) => {
    const xBase = left + categoryIndex * slotWidth + (slotWidth - groupWidth) / 2;
    return barSeries.map((series, seriesIndex) => {
      const value = series.values[categoryIndex] ?? 0;
      const y = primaryY(value);
      const h = Math.max(5, primaryY(0) - y);
      const anchor = {
        category,
        pointIndex: categoryIndex,
        seriesId: series.id,
        x: xBase + seriesIndex * barWidth + barWidth / 2,
        y,
        value,
      };
      anchors.push(anchor);
      const role = getAnchorEmphasisRole(presentation, anchor);
      const color = getChartRoleColor(role, getSeriesColor(series, seriesIndex));
      return `<rect x="${xBase + seriesIndex * barWidth}" y="${y}" width="${Math.max(12, barWidth - 8)}" height="${h}" rx="11" fill="${escapeHtml(color)}" opacity="${role ? 0.96 : 0.74}" />`;
    }).join("");
  }).join("");

  const lines = lineSeries.map((series, seriesIndex) => {
    const color = getSeriesColor(series, seriesIndex, "line");
    const points = spec.categories.map((category, pointIndex) => {
      const value = series.values[pointIndex] ?? 0;
      const point = {
        category,
        pointIndex,
        seriesId: series.id,
        x: left + pointIndex * slotWidth + slotWidth / 2,
        y: secondaryY(value),
        value,
      };
      anchors.push(point);
      return point;
    });
    const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
    return `<path d="${path}" fill="none" stroke="${escapeHtml(color)}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
      ${points.map((point) => {
        const role = getAnchorEmphasisRole(presentation, point);
        return `<circle cx="${point.x}" cy="${point.y}" r="${role ? 7.5 : 5.5}" fill="${escapeHtml(getChartRoleColor(role, color))}" stroke="#fff" stroke-width="3" />
          ${role ? `<text x="${point.x}" y="${point.y - 16}" text-anchor="middle" font-size="13" font-weight="800" fill="#173d57">${escapeHtml(formatChartValue(point.value, format))}</text>` : ""}`;
      }).join("")}`;
  }).join("");
  const labels = spec.categories.map((category, index) => `<text x="${left + index * slotWidth + slotWidth / 2}" y="${bottom + 30}" text-anchor="middle" font-size="12" font-weight="700" fill="#4e6373">${escapeHtml(category)}</text>`).join("");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block;width:100%;height:auto;" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="chart-soft-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="#173d57" flood-opacity="0.09"/></filter></defs>
    ${buildChartGrid({ left, right, top, bottom, minValue: primaryMin, maxValue: primaryMax, format })}
    <line x1="${left}" y1="${primaryY(0)}" x2="${right}" y2="${primaryY(0)}" stroke="#91a5b3" stroke-width="1.3" />
    <line x1="${right}" y1="${top}" x2="${right}" y2="${bottom}" stroke="#c9d6df" stroke-width="1" />
    <text x="${right + 12}" y="${top + 6}" font-size="11" fill="#708391">${escapeHtml(formatChartValue(secondaryMax, { ...(format ?? {}), suffix: spec.secondaryUnit || format?.suffix }))}</text>
    <text x="${right + 12}" y="${bottom + 4}" font-size="11" fill="#708391">${escapeHtml(formatChartValue(secondaryMin, { ...(format ?? {}), suffix: spec.secondaryUnit || format?.suffix }))}</text>
    <g filter="url(#chart-soft-shadow)">${bars}</g>
    ${lines}
    ${labels}
    ${renderInvestorChartAnnotations({ presentation, anchors, width, height })}
  </svg>`;
}

function buildHtmlChartExportPayload(spec: HtmlChartSpec) {
  if (spec.kind === "bubble") {
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
  };
}

export function renderHtmlChartModule(args: {
  spec: HtmlChartSpec;
  background?: string | null;
  border?: string | null;
  accent?: string | null;
}) {
  const spec = withNormalizedChartPresentation(args.spec, args.spec.presentation);
  const presentation = getChartPresentation(spec);
  const density = getChartDensitySettings(spec);
  const background = normalizeText(args.background) || "#ffffff";
  const border = normalizeText(args.border) || "#d8e0e6";
  const accent = normalizeText(args.accent) || "#173d57";
  const svg =
    spec.kind === "bubble"
      ? renderBubbleChart(spec)
      : spec.kind === "combo"
        ? renderInvestorComboChart(spec)
        : renderInvestorBarLikeChart(spec);
  const exportPayload = buildHtmlChartExportPayload(spec);
  return `<div class="html-chart-module" data-html-module-kind="${CHART_MODULE_KIND}" data-html-module-label="Chart" data-html-visual-kind="chart-frame" data-html-fit-role="content" data-chart-presentation-version="2" data-chart-exhibit-preset="${escapeHtml(presentation.exhibitPreset ?? "auto")}" data-chart-density="${escapeHtml(presentation.density ?? "hero")}" ${HTML_CHART_SPEC_ATTRIBUTE}="${serializeJson(spec)}" ${exportPayload ? `data-export-chart="${serializeJson(exportPayload)}"` : ""} style="position:relative;background:${escapeHtml(background)};border:1px solid ${escapeHtml(border)};border-radius:8px;padding:${density.padding};box-shadow:none;--ppt-accent:${escapeHtml(accent)};">
    ${renderInvestorChartHeader(spec)}
    <div style="margin-top:${density.chartMarginTop}px;padding:0 2px;">${svg}</div>
    <div style="border-top:1px solid ${escapeHtml(border)};margin-top:6px;padding-top:9px;font-size:${density.footerSize}px;letter-spacing:0.12em;text-transform:uppercase;color:#7f919f;text-align:right;">Structured chart data</div>
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
