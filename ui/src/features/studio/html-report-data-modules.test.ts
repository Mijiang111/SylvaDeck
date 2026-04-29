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

test("chart raw-data updates preserve native style contract", () => {
  const lineSpec: HtmlChartSpec = {
    kind: "line",
    title: "Scenario paths",
    subtitle: "",
    insight: "",
    unit: "index",
    categories: ["Q1", "Q2"],
    valueAxisMin: 40,
    valueAxisMax: 90,
    style: {
      yAxis: {
        lineColor: "#305c63",
        gridColor: "#d8cfbc",
        gridDash: "dash",
        labelFontSize: 8,
      },
    },
    series: [
      {
        id: "solid-line",
        label: "Solid",
        values: [50, 62],
        color: "#305c63",
        role: "line",
        axis: "primary",
        style: { lineDash: "solid", lineWidthPt: 2.4, marker: "circle" },
      },
      {
        id: "dash-line",
        label: "Dashed",
        values: [54, 70],
        color: "#b55638",
        role: "line",
        axis: "primary",
        style: {
          lineDash: "dash",
          lineWidthPt: 2.8,
          marker: "none",
          shadow: { opacity: 0.18, blurPt: 4, offsetPt: 1, angle: 45 },
        },
      },
    ],
  };

  const parsed = parseHtmlChartSpec(serializeHtmlChartSpec(lineSpec));
  assert.equal(parsed?.kind, "line");
  if (parsed?.kind === "line") {
    assert.equal(parsed.style?.yAxis?.gridDash, "dash");
    assert.equal(parsed.series[1]?.style?.lineDash, "dash");
    assert.equal(parsed.series[1]?.style?.marker, "none");
  }

  const next = updateHtmlChartSpecFromRawData({
    current: lineSpec,
    raw: "Category\tSolid\tDashed\nQ3\t65\t76\nQ4\t69\t83",
  });
  assert.equal(next?.kind, "line");
  if (next?.kind === "line") {
    assert.equal(next.style?.yAxis?.gridDash, "dash");
    assert.equal(next.series[1]?.style?.lineDash, "dash");
    assert.equal(next.series[1]?.style?.shadow?.opacity, 0.18);
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
  const parsed = parseHtmlChartSpec(encoded?.replaceAll("&quot;", '"'));
  assert.ok(parsed);
  assert.equal(parsed?.kind, "bar");
  assert.equal(parsed?.series[0]?.values[0], 42);
  assert.equal(parseHtmlChartSpec(serializeHtmlChartSpec(spec))?.kind, "bar");
});
