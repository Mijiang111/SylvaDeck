import type {
  ModuleChartKind,
  ModuleTemplateField,
} from "@/features/studio/types";

export const CHART_SERIES_COLORS = [
  "#cc8b41",
  "#4d7ca6",
  "#68a37c",
  "#b07b42",
];

type DerivedChartPreview = {
  kind: ModuleChartKind;
  status: "ready" | "needs-data" | "needs-numeric" | "needs-stacked";
  sourceLabel: string | null;
  rowCount: number;
  numericColumnCount: number;
  seriesLabels: string[];
  bars: Array<{
    id: string;
    label: string;
    value: number;
    ratio: number;
  }>;
  stacks: Array<{
    id: string;
    label: string;
    total: number;
    ratio: number;
    segments: Array<{
      id: string;
      label: string;
      value: number;
      share: number;
      color: string;
    }>;
  }>;
  waterfall: Array<{
    id: string;
    label: string;
    value: number;
    start: number;
    end: number;
    color: string;
  }>;
  minValue: number;
  maxValue: number;
};

export function getChartKind(field: ModuleTemplateField | null | undefined) {
  return field?.chartSpec?.kind ?? "bar";
}

function parseNumericCell(value: string | undefined) {
  const parsed = Number((value ?? "").replace(/[,%$€£¥\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function deriveChartPreview(
  chartField: ModuleTemplateField | null | undefined,
  sourceField: ModuleTemplateField | null | undefined
): DerivedChartPreview {
  const kind = getChartKind(chartField);
  const dataTable = sourceField?.dataTable;
  const basePreview: DerivedChartPreview = {
    kind,
    status: "needs-data",
    sourceLabel: sourceField?.label ?? null,
    rowCount: dataTable?.rows.length ?? 0,
    numericColumnCount: 0,
    seriesLabels: [],
    bars: [],
    stacks: [],
    waterfall: [],
    minValue: 0,
    maxValue: 0,
  };

  if (!dataTable || dataTable.rows.length === 0) {
    return basePreview;
  }

  const numericColumnIndexes = dataTable.columns
    .map((column, index) =>
      column.type === "number" ||
      column.type === "percent" ||
      column.type === "currency"
        ? index
        : -1
    )
    .filter((index) => index >= 0);
  const labelColumnIndex = dataTable.columns.findIndex(
    (column) => column.type === "text" || column.type === "date"
  );
  const resolveLabel = (row: string[], index: number) =>
    row[labelColumnIndex >= 0 ? labelColumnIndex : 0] || `Row ${index + 1}`;

  if (numericColumnIndexes.length === 0) {
    return {
      ...basePreview,
      status: "needs-numeric",
    };
  }

  if (kind === "bar") {
    const numericColumnIndex = numericColumnIndexes[0];
    const bars = dataTable.rows
      .slice(0, 5)
      .map((row, index) => {
        const value = parseNumericCell(row[numericColumnIndex]);
        return {
          id: `${chartField?.id ?? "chart"}-bar-${index}`,
          label: resolveLabel(row, index),
          value: value ?? 0,
        };
      })
      .filter((row) => Number.isFinite(row.value));
    const maxValue = Math.max(...bars.map((row) => Math.abs(row.value)), 1);
    return {
      ...basePreview,
      status: "ready",
      numericColumnCount: numericColumnIndexes.length,
      seriesLabels: [dataTable.columns[numericColumnIndex]?.label ?? "Value"],
      bars: bars.map((row) => ({
        ...row,
        ratio: Math.max(0.06, Math.abs(row.value) / maxValue),
      })),
      minValue: 0,
      maxValue,
    };
  }

  if (kind === "stacked") {
    const seriesIndexes = numericColumnIndexes.slice(0, 4);
    if (seriesIndexes.length < 2) {
      return {
        ...basePreview,
        status: "needs-stacked",
        numericColumnCount: numericColumnIndexes.length,
        seriesLabels: numericColumnIndexes.map(
          (index) => dataTable.columns[index]?.label ?? "Series"
        ),
      };
    }

    const stacks = dataTable.rows.slice(0, 4).map((row, rowIndex) => {
      const segments = seriesIndexes.map((columnIndex, seriesIndex) => {
        const value = Math.abs(parseNumericCell(row[columnIndex]) ?? 0);
        return {
          id: `${chartField?.id ?? "chart"}-stack-${rowIndex}-${seriesIndex}`,
          label:
            dataTable.columns[columnIndex]?.label ??
            `Series ${seriesIndex + 1}`,
          value,
          share: 0,
          color: CHART_SERIES_COLORS[seriesIndex % CHART_SERIES_COLORS.length],
        };
      });
      const total = Math.max(
        0,
        segments.reduce((sum, segment) => sum + segment.value, 0)
      );
      return {
        id: `${chartField?.id ?? "chart"}-stack-row-${rowIndex}`,
        label: resolveLabel(row, rowIndex),
        total,
        ratio: 0,
        segments: segments.map((segment) => ({
          ...segment,
          share: total > 0 ? segment.value / total : 0,
        })),
      };
    });
    const maxTotal = Math.max(...stacks.map((row) => row.total), 1);
    return {
      ...basePreview,
      status: "ready",
      numericColumnCount: numericColumnIndexes.length,
      seriesLabels: seriesIndexes.map(
        (index) => dataTable.columns[index]?.label ?? "Series"
      ),
      stacks: stacks.map((row) => ({
        ...row,
        ratio: Math.max(0.06, row.total / maxTotal),
      })),
      minValue: 0,
      maxValue: maxTotal,
    };
  }

  const numericColumnIndex = numericColumnIndexes[0];
  let runningValue = 0;
  const waterfall = dataTable.rows.slice(0, 5).map((row, index) => {
    const value = parseNumericCell(row[numericColumnIndex]) ?? 0;
    const start = runningValue;
    const end = runningValue + value;
    runningValue = end;
    return {
      id: `${chartField?.id ?? "chart"}-waterfall-${index}`,
      label: resolveLabel(row, index),
      value,
      start,
      end,
      color: value >= 0 ? "#cc8b41" : "#4d7ca6",
    };
  });
  const minValue = Math.min(
    0,
    ...waterfall.flatMap((item) => [item.start, item.end])
  );
  const maxValue = Math.max(
    0,
    ...waterfall.flatMap((item) => [item.start, item.end])
  );
  return {
    ...basePreview,
    status: "ready",
    numericColumnCount: numericColumnIndexes.length,
    seriesLabels: [dataTable.columns[numericColumnIndex]?.label ?? "Delta"],
    waterfall,
    minValue,
    maxValue,
  };
}

function formatChartValue(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1000) {
    return `${(value / 1000).toFixed(absolute >= 10000 ? 0 : 1)}k`;
  }
  if (absolute >= 100) {
    return Math.round(value).toString();
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(1);
}

export function getChartStatusMessage(preview: DerivedChartPreview) {
  if (preview.status === "needs-data") {
    return "Connect a data block";
  }
  if (preview.status === "needs-stacked") {
    return "Need 2 numeric columns";
  }
  if (preview.status === "needs-numeric") {
    return "Need numeric values";
  }
  return null;
}

export function renderChartGraphic(preview: DerivedChartPreview) {
  const chartTop = 6;
  const chartHeight = 40;
  const baseY = chartTop + chartHeight;

  if (preview.status !== "ready") {
    return (
      <div className="flex h-full flex-col items-start justify-center text-left">
        <div className="text-[12px] font-semibold text-[#173043]">
          {getChartStatusMessage(preview)}
        </div>
        <div className="mt-2 text-[11px] leading-5 text-[#7a6b59]">
          {preview.status === "needs-data"
            ? "Wire one data block into this chart in Flow mode."
            : preview.status === "needs-stacked"
            ? "Stacked charts need one label column plus at least two numeric series."
            : "Paste or connect data that includes numeric values."}
        </div>
      </div>
    );
  }

  if (preview.kind === "bar") {
    const items = preview.bars.slice(0, 5);
    const band = 100 / Math.max(items.length, 1);
    return (
      <svg viewBox="0 0 100 52" className="h-full w-full">
        <line x1="0" y1={baseY} x2="100" y2={baseY} stroke="#eadfce" />
        {items.map((item, index) => {
          const x = index * band + band * 0.18;
          const width = band * 0.64;
          const height = Math.max(3, item.ratio * chartHeight);
          const y = baseY - height;
          return (
            <g key={item.id}>
              <rect
                x={x}
                y={y}
                width={width}
                height={height}
                rx="2.5"
                fill="#cc8b41"
              />
              <text
                x={x + width / 2}
                y={Math.max(chartTop + 2, y - 2)}
                textAnchor="middle"
                fontSize="4"
                fill="#7c6548"
                fontWeight="700"
              >
                {formatChartValue(item.value)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  if (preview.kind === "stacked") {
    const items = preview.stacks.slice(0, 4);
    const band = 100 / Math.max(items.length, 1);
    return (
      <svg viewBox="0 0 100 52" className="h-full w-full">
        <line x1="0" y1={baseY} x2="100" y2={baseY} stroke="#eadfce" />
        {items.map((item, index) => {
          const x = index * band + band * 0.18;
          const width = band * 0.64;
          let cursorY = baseY;
          const totalHeight = Math.max(3, item.ratio * chartHeight);
          return (
            <g key={item.id}>
              {item.segments.map((segment) => {
                const height = Math.max(
                  2,
                  totalHeight * Math.max(segment.share, 0)
                );
                cursorY -= height;
                return (
                  <rect
                    key={segment.id}
                    x={x}
                    y={cursorY}
                    width={width}
                    height={height}
                    rx="2.5"
                    fill={segment.color}
                  />
                );
              })}
              <text
                x={x + width / 2}
                y={Math.max(chartTop + 2, cursorY - 2)}
                textAnchor="middle"
                fontSize="4"
                fill="#7c6548"
                fontWeight="700"
              >
                {formatChartValue(item.total)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  const items = preview.waterfall.slice(0, 5);
  const band = 100 / Math.max(items.length, 1);
  const range = Math.max(preview.maxValue - preview.minValue, 1);
  const toY = (value: number) =>
    chartTop + ((preview.maxValue - value) / range) * chartHeight;
  const zeroY = toY(0);
  return (
    <svg viewBox="0 0 100 52" className="h-full w-full">
      <line x1="0" y1={zeroY} x2="100" y2={zeroY} stroke="#eadfce" />
      {items.map((item, index) => {
        const x = index * band + band * 0.18;
        const width = band * 0.54;
        const topValue = Math.max(item.start, item.end);
        const bottomValue = Math.min(item.start, item.end);
        const y = toY(topValue);
        const height = Math.max(3, toY(bottomValue) - y);
        const next = items[index + 1];
        return (
          <g key={item.id}>
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              rx="2.5"
              fill={item.color}
            />
            <text
              x={x + width / 2}
              y={Math.max(chartTop + 2, y - 2)}
              textAnchor="middle"
              fontSize="4"
              fill="#7c6548"
              fontWeight="700"
            >
              {formatChartValue(item.value)}
            </text>
            {next ? (
              <line
                x1={x + width}
                y1={toY(item.end)}
                x2={x + band}
                y2={toY(item.end)}
                stroke="#bda788"
                strokeDasharray="2 1"
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
