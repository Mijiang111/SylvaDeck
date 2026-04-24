import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHtmlChartDataTable,
  buildHtmlTableSpecFromRaw,
  parseHtmlChartSpec,
  renderHtmlChartModule,
  serializeHtmlChartSpec,
  updateHtmlChartSpecFromRawData,
} from "./html-report-data-modules";
import type { HtmlChartSpec } from "./types";

function decodeAttr(raw: string | null | undefined) {
  return raw?.replaceAll("&quot;", '"') ?? null;
}

test("chart raw-data updates preserve combo series roles", () => {
  const comboSpec: HtmlChartSpec = {
    kind: "combo",
    title: "Capex vs utilization",
    subtitle: "",
    insight: "",
    unit: "$bn",
    secondaryUnit: "%",
    categories: ["North America", "Europe"],
    series: [
      {
        id: "series-bars",
        label: "Capex",
        values: [94, 46],
        color: "#5d7f9d",
        role: "bar",
        axis: "primary",
      },
      {
        id: "series-line",
        label: "Utilization",
        values: [35, 44],
        color: "#19c6df",
        role: "line",
        axis: "secondary",
      },
    ],
  };

  const next = updateHtmlChartSpecFromRawData({
    current: comboSpec,
    raw: "Category\tCapex\tUtilization\nMiddle East\t32\t56\nSEA\t16\t39",
  });

  assert.ok(next);
  assert.equal(next?.kind, "combo");
  if (next?.kind === "combo") {
    assert.deepEqual(next.categories, ["Middle East", "SEA"]);
    assert.deepEqual(next.series.map((series) => series.role), ["bar", "line"]);
    assert.deepEqual(next.series.map((series) => series.axis), ["primary", "secondary"]);
  }
});

test("bubble chart data tables round-trip through runtime helpers", () => {
  const spec: HtmlChartSpec = {
    kind: "bubble",
    title: "Economics map",
    subtitle: "",
    insight: "",
    unit: "",
    xLabel: "Utilization",
    yLabel: "Margin",
    sizeLabel: "Capacity",
    points: [
      { id: "point-1", label: "Hyperscale cloud", x: 95, y: 82, size: 190, color: "#20d3ff", group: "cloud" },
      { id: "point-2", label: "Regional challengers", x: 72, y: 61, size: 76, color: "#8aa1b5", group: "regional" },
    ],
  };

  const dataTable = buildHtmlChartDataTable(spec);
  assert.equal(dataTable.columns.length, 5);
  assert.equal(dataTable.rows.length, 2);

  const next = updateHtmlChartSpecFromRawData({
    current: spec,
    raw: dataTable.raw,
  });
  assert.ok(next);
  assert.equal(next?.kind, "bubble");
  if (next?.kind === "bubble") {
    assert.equal(next.points.length, 2);
    assert.equal(next.points[0]?.label, "Hyperscale cloud");
  }
});

test("table specs can be rebuilt from raw TSV", () => {
  const table = buildHtmlTableSpecFromRaw(
    "Operator\tCapacity\tMargin\nHyperscaler\t8.4 GW\t41%\nEnterprise colo\t2.8 GW\t18%",
  );

  assert.equal(table.columns.length, 3);
  assert.equal(table.rows.length, 2);
  assert.equal(table.columns[1]?.label, "Capacity");
});

test("rendered chart modules keep a parseable chart spec payload", () => {
  const spec: HtmlChartSpec = {
    kind: "bar",
    title: "Capacity by region",
    subtitle: "",
    insight: "",
    unit: "GW",
    categories: ["NA", "EU"],
    series: [
      {
        id: "series-1",
        label: "Capacity",
        values: [42, 31],
        color: "#5d7f9d",
        role: "bar",
        axis: "primary",
      },
    ],
  };

  const html = renderHtmlChartModule({ spec });
  const encoded = /data-html-chart-spec="([^"]+)"/.exec(html)?.[1] ?? null;
  assert.ok(encoded);
  const parsed = parseHtmlChartSpec(decodeAttr(encoded));
  assert.ok(parsed);
  assert.equal(parsed?.kind, "bar");
  assert.equal(parsed?.series[0]?.values[0], 42);
  assert.equal(parsed?.presentation?.version, 2);
  assert.equal(parseHtmlChartSpec(serializeHtmlChartSpec(spec))?.kind, "bar");
});

test("v2 chart presentation round-trips through parse and data updates", () => {
  const spec: HtmlChartSpec = {
    kind: "line",
    title: "Revenue trend",
    subtitle: "Sequential improvement",
    insight: "Latest quarter carries the story.",
    unit: "$bn",
    categories: ["Q1", "Q2", "Q3"],
    series: [
      {
        id: "series-revenue",
        label: "Revenue",
        values: [21.3, 22.1, 24.6],
        color: "#173d57",
        role: "line",
        axis: "primary",
      },
    ],
    presentation: {
      version: 2,
      preset: "investor-editorial",
      exhibitPreset: "growth-line",
      density: "sidecar",
      valueFormat: { prefix: "$", suffix: "bn", decimals: 1, scale: "raw" },
      emphasis: [
        {
          id: "latest",
          target: { category: "Q3", seriesId: "series-revenue", pointIndex: 2 },
          role: "primary",
        },
      ],
      annotations: [
        {
          id: "latest-note",
          target: { category: "Q3", seriesId: "series-revenue", pointIndex: 2 },
          text: "Highest point in the series",
          placement: "above",
        },
      ],
    },
  };

  const parsed = parseHtmlChartSpec(serializeHtmlChartSpec(spec));
  assert.equal(parsed?.presentation?.version, 2);
  assert.equal(parsed?.presentation?.exhibitPreset, "growth-line");
  assert.equal(parsed?.presentation?.density, "sidecar");
  assert.equal(parsed?.presentation?.valueFormat?.prefix, "$");
  assert.equal(parsed?.presentation?.emphasis?.[0]?.target.category, "Q3");
  assert.equal(parsed?.presentation?.annotations?.[0]?.text, "Highest point in the series");

  const next = updateHtmlChartSpecFromRawData({
    current: spec,
    raw: "Category\tRevenue\nQ4\t25.2\nQ5\t26.8",
  });
  assert.ok(next);
  assert.equal(next?.presentation?.version, 2);
  assert.equal(next?.presentation?.exhibitPreset, "growth-line");
  assert.equal(next?.presentation?.density, "sidecar");
  assert.equal(next?.presentation?.valueFormat?.suffix, "bn");
  assert.equal(next?.presentation?.annotations?.[0]?.id, "latest-note");
});

test("rendered investor chart modules expose html spec and export payload", () => {
  const html = renderHtmlChartModule({
    spec: {
      kind: "waterfall",
      title: "Operating income bridge",
      subtitle: "",
      insight: "Positive mix offsets cost pressure.",
      unit: "$bn",
      categories: ["Start", "Volume", "Cost", "End"],
      series: [
        {
          id: "series-bridge",
          label: "Bridge",
          values: [0.4, 0.8, -0.3, 0.9],
          color: "#173d57",
          role: "bar",
          axis: "primary",
        },
      ],
    },
  });

  assert.match(html, /data-chart-presentation-version="2"/);
  assert.match(html, /data-chart-exhibit-preset="margin-bridge"/);
  assert.match(html, /data-chart-density="hero"/);
  assert.match(html, /data-export-chart="/);
  assert.match(html, /Exhibit/);
  assert.match(html, /Structured chart data/);
  const encoded = /data-html-chart-spec="([^"]+)"/.exec(html)?.[1] ?? null;
  const parsed = parseHtmlChartSpec(decodeAttr(encoded));
  assert.equal(parsed?.kind, "waterfall");
  assert.equal(parsed?.presentation?.preset, "investor-editorial");
  assert.equal(parsed?.presentation?.exhibitPreset, "margin-bridge");
});
