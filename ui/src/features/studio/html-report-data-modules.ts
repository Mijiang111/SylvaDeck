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
  HtmlChartKind,
  HtmlChartSeries,
  HtmlChartSeriesRole,
  HtmlChartSpec,
  HtmlTableSpec,
} from "@/features/studio/types";

export const CHART_MODULE_KIND = "chart" as const;
export const TABLE_MODULE_KIND = "table" as const;
export const HTML_CHART_SPEC_ATTRIBUTE = "data-html-chart-spec" as const;
export const HTML_TABLE_SPEC_ATTRIBUTE = "data-html-table-spec" as const;

const DEFAULT_BAR_COLORS = ["#5d7f9d", "#90adc6", "#54a6c1", "#2a6f97"];
const DEFAULT_LINE_COLORS = ["#19c6df", "#1d617c", "#84a0b8"];
const DEFAULT_BUBBLE_COLORS = ["#20d3ff", "#8aa1b5", "#9ec7ff", "#74b9c9", "#4f6f89"];

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
  return JSON.stringify(spec);
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
      return {
        kind: "bubble",
        title: normalizeChartText(bubble.title),
        subtitle: normalizeChartText(bubble.subtitle),
        insight: normalizeChartText(bubble.insight),
        unit: normalizeChartText(bubble.unit),
        xLabel: normalizeChartText(bubble.xLabel, "X axis"),
        yLabel: normalizeChartText(bubble.yLabel, "Y axis"),
        sizeLabel: normalizeChartText(bubble.sizeLabel, "Bubble size"),
        points,
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
      return {
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
      };
    }

    return {
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
    };
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
};

type ExportChartPayload = {
  kind?: string;
  categories?: string[];
  series?: ExportChartSeries[];
  title?: string;
  subtitle?: string;
  insight?: string;
  unit?: string;
};

function parseExportChartPayload(element: HTMLElement): HtmlChartSpec | null {
  const raw = element.getAttribute("data-export-chart");
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as ExportChartPayload;
    const kind = parsed.kind;
    if (kind !== "bar" && kind !== "stacked" && kind !== "line" && kind !== "waterfall") {
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
          color: normalizeText(series.color) || pickColor(index, kind === "line" ? "line" : "bar"),
          role: kind === "line" ? ("line" as const) : ("bar" as const),
          axis: "primary" as const,
        } satisfies HtmlChartSeries;
      })
      .filter(Boolean) as HtmlChartSeries[];
    if (!rawSeries.length) {
      return null;
    }
    const pointCount = categories.length || Math.max(...rawSeries.map((series) => series.values.length), 0);
    return {
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
    };
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
    return {
      kind: "bubble",
      title: baseSpec?.title ?? "",
      subtitle: baseSpec?.subtitle ?? "",
      insight: baseSpec?.insight ?? "",
      unit: baseSpec?.unit ?? "",
      xLabel: baseSpec?.kind === "bubble" ? baseSpec.xLabel : "X axis",
      yLabel: baseSpec?.kind === "bubble" ? baseSpec.yLabel : "Y axis",
      sizeLabel: baseSpec?.kind === "bubble" ? baseSpec.sizeLabel : "Bubble size",
      points,
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
    return {
      kind: "combo",
      title: baseSpec?.title ?? "",
      subtitle: baseSpec?.subtitle ?? "",
      insight: baseSpec?.insight ?? "",
      unit: baseSpec?.unit ?? "",
      secondaryUnit: baseSpec?.kind === "combo" ? baseSpec.secondaryUnit ?? "" : "",
      categories,
      series,
    };
  }
  return {
    kind,
    title: baseSpec?.title ?? "",
    subtitle: baseSpec?.subtitle ?? "",
    insight: baseSpec?.insight ?? "",
    unit: baseSpec?.unit ?? "",
    categories,
    series,
  };
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

export function renderHtmlChartModule(args: {
  spec: HtmlChartSpec;
  background?: string | null;
  border?: string | null;
  accent?: string | null;
}) {
  const background = normalizeText(args.background) || "linear-gradient(180deg,#ffffff 0%,#f6fafc 100%)";
  const border = normalizeText(args.border) || "#d9e5ef";
  const accent = normalizeText(args.accent) || "#2a6f97";
  const svg =
    args.spec.kind === "bubble"
      ? renderBubbleChart(args.spec)
      : args.spec.kind === "combo"
        ? renderComboChart(args.spec)
        : renderBarLikeChart(args.spec);
  return `<div class="html-chart-module" data-html-module-kind="${CHART_MODULE_KIND}" data-html-module-label="Chart" data-html-visual-kind="chart-frame" data-html-fit-role="content" ${HTML_CHART_SPEC_ATTRIBUTE}="${serializeJson(args.spec)}" style="position:relative;background:${escapeHtml(background)};border:1px solid ${escapeHtml(border)};border-radius:24px;padding:24px 24px 20px;box-shadow:0 18px 42px rgba(93,119,142,0.08);--ppt-accent:${escapeHtml(accent)};">
    ${renderChartHeader(args.spec)}
    <div style="margin-top:18px;">${svg}</div>
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
