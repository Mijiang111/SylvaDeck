import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES_DIR = path.dirname(fileURLToPath(import.meta.url));

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function card(title, body, extraClass = "") {
  return `
    <article class="surface-card ${extraClass}">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(body)}</p>
    </article>
  `;
}

function visualCard(title, body, visualKind = "surface", extraClass = "") {
  return `
    <article class="surface-card ${extraClass}" data-html-visual-kind="${escapeHtml(visualKind)}">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(body)}</p>
    </article>
  `;
}

function bullets(items) {
  return `
    <ul class="evidence-list">
      ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
  `;
}

function chartMarkup({ title, bars, footnote = "" }) {
  const max = Math.max(...bars.map((item) => item.value), 1);
  return `
    <div class="chart-frame chart-shell" data-html-visual-kind="chart-frame">
      <div class="chart-title">${escapeHtml(title)}</div>
      <svg viewBox="0 0 640 360" role="img" aria-label="${escapeHtml(title)}">
        <line x1="70" y1="300" x2="590" y2="300" stroke="rgba(8,32,46,0.18)" stroke-width="2" />
        <line x1="70" y1="56" x2="70" y2="300" stroke="rgba(8,32,46,0.18)" stroke-width="2" />
        ${bars
          .map((bar, index) => {
            const width = 88;
            const gap = 34;
            const x = 96 + index * (width + gap);
            const height = Math.max(22, Math.round((bar.value / max) * 196));
            const y = 300 - height;
            return `
              <g>
                <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="14" fill="rgba(0,242,255,0.68)" />
                <text x="${x + width / 2}" y="${y - 14}" text-anchor="middle" font-size="18" fill="#173748">${escapeHtml(String(bar.value))}</text>
                <text x="${x + width / 2}" y="332" text-anchor="middle" font-size="16" fill="#55636d">${escapeHtml(bar.label)}</text>
              </g>
            `;
          })
          .join("")}
      </svg>
      ${
        footnote
          ? `<div class="chart-footnote annotation-rail">${escapeHtml(footnote)}</div>`
          : ""
      }
    </div>
  `;
}

function chartSpecMarkup({ spec }) {
  const encodedSpec = escapeHtml(JSON.stringify(spec));
  const preview =
    spec.kind === "bubble"
      ? bubbleChartPreview(spec)
      : spec.kind === "matrix"
        ? matrixChartPreview(spec)
      : comboChartPreview(spec);
  return `
    <div class="html-chart-module" data-html-module-kind="chart" data-html-module-label="Chart" data-html-visual-kind="chart-frame" data-html-fit-role="content" data-html-chart-spec="${encodedSpec}" style="position:relative;margin-top:28px;background:rgba(255,255,255,0.92);border:1px solid rgba(47,93,132,0.16);border-radius:24px;padding:20px 22px 18px;box-shadow:0 18px 42px rgba(93,119,142,0.08);">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:18px;">
        <div>
          <div style="font-size:18px;font-weight:700;color:#17283a;">${escapeHtml(spec.title)}</div>
          <div style="margin-top:6px;font-size:13px;line-height:1.45;color:#617182;">${escapeHtml(spec.subtitle || spec.insight || "")}</div>
        </div>
        <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6f88a0;">${escapeHtml(spec.kind)}</div>
      </div>
      <div style="margin-top:18px;">${preview}</div>
      ${spec.insight ? `<div style="margin-top:12px;font-size:13px;line-height:1.45;color:#617182;">${escapeHtml(spec.insight)}</div>` : ""}
    </div>
  `;
}

function comboChartPreview(spec) {
  const width = 760;
  const height = 300;
  const left = 58;
  const right = width - 48;
  const top = 38;
  const bottom = height - 44;
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const barSeries = spec.series.filter((series) => (series.role || "bar") === "bar");
  const lineSeries = spec.series.filter((series) => (series.role || "bar") === "line");
  const primaryMax = Math.max(1, ...barSeries.flatMap((series) => series.values).map(Math.abs));
  const secondaryMax = Math.max(1, ...lineSeries.flatMap((series) => series.values).map(Math.abs));
  const slotWidth = plotWidth / Math.max(1, spec.categories.length);
  const barWidth = Math.max(34, slotWidth * 0.34);
  const bars = spec.categories
    .map((category, categoryIndex) => {
      const value = barSeries[0]?.values[categoryIndex] ?? 0;
      const barHeight = (Math.abs(value) / primaryMax) * plotHeight;
      const x = left + categoryIndex * slotWidth + (slotWidth - barWidth) / 2;
      const y = bottom - barHeight;
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="10" fill="${escapeHtml(barSeries[0]?.color || "#5d7f9d")}" />
        <text x="${x + barWidth / 2}" y="${bottom + 24}" text-anchor="middle" font-size="12" fill="#526779">${escapeHtml(category)}</text>
      `;
    })
    .join("");
  const linePoints = spec.categories.map((_, categoryIndex) => {
    const value = lineSeries[0]?.values[categoryIndex] ?? 0;
    return {
      x: left + categoryIndex * slotWidth + slotWidth / 2,
      y: bottom - (Math.abs(value) / secondaryMax) * plotHeight,
    };
  });
  const linePath = linePoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(spec.title)}" style="display:block;width:100%;height:300px;">
      <line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="rgba(47,93,132,0.26)" stroke-width="1.4" />
      ${Array.from({ length: 4 }, (_, index) => {
        const y = bottom - (index / 3) * plotHeight;
        return `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="rgba(47,93,132,0.12)" stroke-width="1" />`;
      }).join("")}
      ${bars}
      <path d="${linePath}" fill="none" stroke="${escapeHtml(lineSeries[0]?.color || "#19c6df")}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      ${linePoints.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="6" fill="${escapeHtml(lineSeries[0]?.color || "#19c6df")}" stroke="#fff" stroke-width="3" />`).join("")}
    </svg>
  `;
}

function bubbleChartPreview(spec) {
  const width = 760;
  const height = 300;
  const left = 64;
  const right = width - 46;
  const top = 34;
  const bottom = height - 50;
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const xValues = spec.points.map((point) => point.x);
  const yValues = spec.points.map((point) => point.y);
  const sizeMax = Math.max(1, ...spec.points.map((point) => point.size));
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const points = spec.points
    .map((point) => {
      const x =
        xMax === xMin ? left + plotWidth / 2 : left + ((point.x - xMin) / Math.max(1, xMax - xMin)) * plotWidth;
      const y =
        yMax === yMin ? top + plotHeight / 2 : bottom - ((point.y - yMin) / Math.max(1, yMax - yMin)) * plotHeight;
      const radius = 18 + (point.size / sizeMax) * 34;
      return `
        <circle cx="${x}" cy="${y}" r="${radius}" fill="${escapeHtml(point.color || "#20d3ff")}" opacity="0.82" stroke="#ffffff" stroke-width="3" />
        <text x="${x + radius + 8}" y="${y - 4}" font-size="12" font-weight="700" fill="#17283a">${escapeHtml(point.label)}</text>
      `;
    })
    .join("");
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(spec.title)}" style="display:block;width:100%;height:300px;">
      <line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="rgba(47,93,132,0.26)" stroke-width="1.4" />
      <line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="rgba(47,93,132,0.26)" stroke-width="1.4" />
      ${points}
      <text x="${(left + right) / 2}" y="${height - 16}" text-anchor="middle" font-size="12" fill="#617182">${escapeHtml(spec.xLabel)}</text>
      <text x="18" y="${(top + bottom) / 2}" transform="rotate(-90 18 ${(top + bottom) / 2})" text-anchor="middle" font-size="12" fill="#617182">${escapeHtml(spec.yLabel)}</text>
    </svg>
  `;
}

function matrixChartPreview(spec) {
  const width = 760;
  const height = 330;
  const left = 64;
  const right = width - 46;
  const top = 34;
  const bottom = height - 58;
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const quadrants =
    spec.quadrants?.length
      ? spec.quadrants
      : [
          { x: 0, y: 0, w: 0.5, h: 0.5, color: "#f6e8df" },
          { x: 0.5, y: 0, w: 0.5, h: 0.5, color: "#e7f1f3" },
          { x: 0, y: 0.5, w: 0.5, h: 0.5, color: "#eef2ec" },
          { x: 0.5, y: 0.5, w: 0.5, h: 0.5, color: "#f6eee2" },
        ];
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(spec.title)}" style="display:block;width:100%;height:330px;">
      <rect x="${left}" y="${top}" width="${plotWidth}" height="${plotHeight}" rx="14" fill="#fffaf3" stroke="#d7c8b9" stroke-width="1.4" />
      ${quadrants.map((quadrant) => `<rect x="${left + quadrant.x * plotWidth}" y="${top + quadrant.y * plotHeight}" width="${quadrant.w * plotWidth}" height="${quadrant.h * plotHeight}" fill="${escapeHtml(quadrant.color || "#f7f3eb")}" opacity="0.74" />`).join("")}
      <line x1="${left + plotWidth / 2}" y1="${top}" x2="${left + plotWidth / 2}" y2="${bottom}" stroke="#b9a897" stroke-width="1.2" />
      <line x1="${left}" y1="${top + plotHeight / 2}" x2="${right}" y2="${top + plotHeight / 2}" stroke="#b9a897" stroke-width="1.2" />
      ${spec.items.map((item) => {
        const x = left + item.x * plotWidth;
        const y = top + item.y * plotHeight;
        const w = Math.max(92, item.w * plotWidth);
        const h = Math.max(54, item.h * plotHeight);
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${escapeHtml(item.color || "#ffffff")}" stroke="#ffffff" stroke-width="2" />
          <text x="${x + 12}" y="${y + 22}" font-size="12" font-weight="700" fill="#17283a">${escapeHtml(item.label)}</text>`;
      }).join("")}
      <text x="${left}" y="${bottom + 28}" font-size="12" fill="#617182">${escapeHtml(spec.xMinLabel || "")}</text>
      <text x="${right}" y="${bottom + 28}" text-anchor="end" font-size="12" fill="#617182">${escapeHtml(spec.xMaxLabel || "")}</text>
      <text x="18" y="${(top + bottom) / 2}" transform="rotate(-90 18 ${(top + bottom) / 2})" text-anchor="middle" font-size="12" fill="#617182">${escapeHtml(spec.yLabel)}</text>
    </svg>
  `;
}

function tableMarkup({ columns, rows }) {
  const spec = {
    raw: [columns, ...rows].map((row) => row.join("\t")).join("\n"),
    hasHeader: true,
    columns: columns.map((label, index) => ({
      id: `column-${index + 1}`,
      label,
      type: index === 0 ? "text" : "number",
    })),
    rows,
  };
  return `
    <div class="html-table-module" data-html-module-kind="table" data-html-module-label="Table" data-html-visual-kind="surface" data-html-fit-role="content" data-html-table-spec="${escapeHtml(JSON.stringify(spec))}" style="position:relative;margin-top:28px;background:rgba(255,255,255,0.9);border:1px solid rgba(47,93,132,0.16);border-radius:24px;padding:18px 18px 12px;">
      <div style="display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr;gap:0;padding:12px 10px 14px;border-bottom:1px solid rgba(47,93,132,0.16);font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6d8294;font-weight:700;">
        ${columns.map((column) => `<div>${escapeHtml(column)}</div>`).join("")}
      </div>
      ${rows.map((row, rowIndex) => `<div style="display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr;gap:0;padding:14px 10px;border-bottom:${rowIndex === rows.length - 1 ? "0" : "1px solid rgba(47,93,132,0.12)"};background:${rowIndex === 0 ? "rgba(31,211,255,0.06)" : "transparent"};">
        ${row.map((cell, cellIndex) => `<div style="font-size:${cellIndex === 0 ? "15px" : "14px"};line-height:1.45;color:${cellIndex === 0 ? "#162430" : "#415566"};font-weight:${cellIndex === 0 ? "700" : "500"};">${escapeHtml(cell)}</div>`).join("")}
      </div>`).join("")}
    </div>
  `;
}

function scientificDiagramMarkup({
  title,
  caption,
  topLabel,
  bottomLabel,
  layers,
  leftNote = "",
  rightNote = "",
}) {
  const width = 860;
  const height = 360;
  const xPadding = 80;
  const yPadding = 44;
  const spacing = layers.length > 1 ? (width - xPadding * 2) / (layers.length - 1) : 0;
  const geometry = layers.map((layer, layerIndex) => {
    const x = xPadding + spacing * layerIndex;
    const radius = Math.max(14, Math.min(24, 26 - Math.max(0, layer.nodeCount - 4) * 1.5));
    const ySpacing = layer.nodeCount > 1 ? (height - yPadding * 2) / (layer.nodeCount - 1) : 0;
    const nodes = Array.from({ length: layer.nodeCount }, (_, nodeIndex) => ({
      x,
      y: layer.nodeCount === 1 ? height / 2 : yPadding + ySpacing * nodeIndex,
      radius,
    }));
    return {
      ...layer,
      x,
      leftPercent: (x / width) * 100,
      nodes,
    };
  });
  const spec = {
    family: "neural-network",
    title,
    caption,
    layers: layers.map((layer) => ({
      id: layer.id,
      role: layer.role,
      label: layer.label,
      nodeCount: layer.nodeCount,
    })),
    connectivity: "dense",
    topLabel,
    bottomLabel,
    sideNotes: [
      ...(leftNote ? [{ id: "note-1", text: leftNote, side: "left" }] : []),
      ...(rightNote ? [{ id: "note-2", text: rightNote, side: "right" }] : []),
    ],
    stylePreset: "paper-white",
  };
  return `
    <div class="scientific-diagram-shell" data-html-visual-kind="chart-frame" data-html-fit-role="content" data-html-module-kind="scientific-diagram" data-html-module-label="Scientific diagram" data-html-diagram-spec="${escapeHtml(JSON.stringify(spec))}" style="position:relative;border:1px solid rgba(47,93,132,0.16);border-radius:32px;background:#ffffff;padding:24px 32px 28px;min-height:560px;display:flex;flex-direction:column;gap:18px;overflow:hidden;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;">
        <div>
          <div class="scientific-diagram-kicker" style="margin-bottom:10px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#6f88a0;">Research figure</div>
          <h3 class="scientific-diagram-title" style="margin:0;font-size:30px;line-height:1.15;font-weight:600;color:#17283a;max-width:860px;">${escapeHtml(title)}</h3>
          <p class="scientific-diagram-top-label" style="margin:10px 0 0 0;font-size:15px;line-height:1.5;color:#617182;">${escapeHtml(topLabel)}</p>
        </div>
        <div style="display:inline-flex;align-items:center;padding:8px 12px;border:1px solid rgba(47,93,132,0.14);background:rgba(246,248,251,0.72);font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#2f5d84;">Dense</div>
      </div>
      <div class="scientific-diagram-figure" style="position:relative;flex:1;min-height:360px;padding:24px 168px 36px;">
        ${
          leftNote
            ? `<p class="scientific-diagram-side-note scientific-diagram-side-note-left" style="position:absolute;left:0;top:24px;width:148px;margin:0;padding:12px 14px;border:1px solid rgba(47,93,132,0.12);background:rgba(246,248,251,0.92);font-size:14px;line-height:1.45;color:#617182;">${escapeHtml(leftNote)}</p>`
            : ""
        }
        ${
          rightNote
            ? `<p class="scientific-diagram-side-note scientific-diagram-side-note-right" style="position:absolute;right:0;top:84px;width:148px;margin:0;padding:12px 14px;border:1px solid rgba(47,93,132,0.12);background:rgba(246,248,251,0.92);font-size:14px;line-height:1.45;color:#617182;">${escapeHtml(rightNote)}</p>`
            : ""
        }
        <svg class="scientific-diagram-network" viewBox="0 0 860 360" role="img" aria-label="${escapeHtml(title)}" style="display:block;width:100%;height:360px;">
          ${geometry
            .slice(0, -1)
            .map((sourceLayer, layerIndex) =>
              sourceLayer.nodes
                .flatMap((sourceNode) =>
                  geometry[layerIndex + 1].nodes.map(
                    (targetNode) =>
                      `<line x1="${sourceNode.x}" y1="${sourceNode.y}" x2="${targetNode.x}" y2="${targetNode.y}" stroke="rgba(47,93,132,0.34)" stroke-width="2.2" />`,
                  ),
                )
                .join(""),
            )
            .join("")}
          ${geometry
            .flatMap((entry) =>
              entry.nodes.map(
                (node) =>
                  `<circle cx="${node.x}" cy="${node.y}" r="${node.radius}" fill="rgba(47,93,132,0.12)" stroke="rgba(47,93,132,0.82)" stroke-width="3" />`,
              ),
            )
            .join("")}
        </svg>
        ${geometry
          .map(
            (entry) =>
              `<p class="scientific-diagram-layer-label" style="position:absolute;top:0;left:calc(${entry.leftPercent}% - 68px);width:136px;margin:0;text-align:center;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#617182;">${escapeHtml(entry.label)}</p>`,
          )
          .join("")}
        <p class="scientific-diagram-bottom-label" style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);margin:0;font-size:14px;line-height:1.4;color:#617182;text-align:center;">${escapeHtml(bottomLabel)}</p>
      </div>
      <p class="scientific-diagram-caption" style="margin:0;border-top:1px solid rgba(47,93,132,0.12);padding-top:14px;font-size:15px;line-height:1.55;color:#617182;">${escapeHtml(caption)}</p>
    </div>
  `;
}

function heroModelMarkup() {
  return `
    <div class="hero-model-shell" data-html-visual-kind="surface">
      <div class="chip-stack">
        <div class="chip-layer chip-layer-top">
          <span class="layer-label">Compute die</span>
        </div>
        <div class="chip-layer chip-layer-mid">
          <span class="layer-label">Memory fabric</span>
        </div>
        <div class="chip-layer chip-layer-base">
          <span class="layer-label">Substrate</span>
        </div>
        <div class="annotation annotation-top">Interconnect lanes</div>
        <div class="annotation annotation-right">Thermal envelope shell</div>
      </div>
    </div>
  `;
}

function pageSection({ title, eyebrow = "", left, right = "", footer = "", className = "" }) {
  return `
    <section class="page ${className}" data-page-title="${escapeHtml(title)}">
      <div class="page-body ${right ? "page-grid" : "page-single"}">
        <div class="page-primary">
          ${eyebrow ? `<div class="eyebrow">${escapeHtml(eyebrow)}</div>` : ""}
          ${left}
        </div>
        ${right ? `<div class="page-secondary">${right}</div>` : ""}
      </div>
      ${footer ? `<footer class="page-footer">${footer}</footer>` : ""}
    </section>
  `;
}

const BASE_STYLES = `
  :root {
    color-scheme: light;
    font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #ddd9d3;
    color: #173748;
  }
  body {
    padding: 40px 0;
  }
  .report-root {
    display: grid;
    gap: 36px;
    justify-content: center;
  }
  section.page {
    position: relative;
    width: 1600px;
    height: 900px;
    overflow: hidden;
    border-radius: 28px;
    border: 1px solid rgba(15,23,31,0.08);
    background:
      radial-gradient(circle at top right, rgba(0,242,255,0.10), transparent 34%),
      linear-gradient(180deg, rgba(255,255,255,0.66), rgba(255,255,255,0.9)),
      #f7f3eb;
    box-shadow: 0 24px 56px rgba(15,23,31,0.12);
    padding: 68px 74px 62px;
  }
  .page-body.page-grid {
    display: grid;
    grid-template-columns: 1.1fr 0.9fr;
    gap: 40px;
    min-height: 700px;
  }
  .page-body.page-single {
    min-height: 700px;
  }
  .page-primary,
  .page-secondary {
    min-width: 0;
  }
  .eyebrow {
    margin-bottom: 18px;
    color: #6a7b86;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  h1 {
    margin: 0;
    font-size: 46px;
    line-height: 1.04;
    letter-spacing: -0.05em;
  }
  h2 {
    margin: 0;
    font-size: 30px;
    line-height: 1.14;
    letter-spacing: -0.04em;
  }
  h3 {
    margin: 0 0 10px;
    font-size: 18px;
    line-height: 1.2;
    letter-spacing: -0.02em;
  }
  p {
    margin: 0;
    font-size: 20px;
    line-height: 1.55;
    color: #51616c;
  }
  .lede {
    margin-top: 22px;
    max-width: 720px;
    font-size: 21px;
  }
  .dense {
    font-size: 18px;
    line-height: 1.5;
  }
  .surface-card {
    border: 1px solid rgba(15,23,31,0.08);
    border-radius: 22px;
    background: rgba(255,255,255,0.82);
    padding: 20px 22px;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.28);
  }
  .hero-band {
    margin-bottom: 24px;
    min-height: 88px;
    border: 1px solid rgba(15,23,31,0.1);
    border-radius: 24px;
    background:
      radial-gradient(circle at top right, rgba(181,86,56,0.12), transparent 38%),
      linear-gradient(180deg, rgba(255,255,255,0.88), rgba(248,242,234,0.92));
  }
  .closing-strip-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
    margin-top: 38px;
  }
  .closing-strip-card {
    min-height: 170px;
  }
  .surface-grid {
    display: grid;
    gap: 18px;
    margin-top: 22px;
  }
  .matrix-shell {
    position: relative;
    margin-top: 26px;
    min-height: 520px;
    border: 1px solid rgba(15,23,31,0.1);
    border-radius: 28px;
    background: rgba(255,255,255,0.74);
    padding: 34px;
    overflow: hidden;
  }
  .matrix-axis-h,
  .matrix-axis-v {
    position: absolute;
    background: rgba(190,164,128,0.68);
    pointer-events: none;
  }
  .matrix-axis-h {
    left: 84px;
    right: 84px;
    top: 50%;
    height: 1px;
  }
  .matrix-axis-v {
    top: 70px;
    bottom: 70px;
    left: 50%;
    width: 1px;
  }
  .matrix-core {
    position: absolute;
    left: 50%;
    top: 50%;
    display: grid;
    place-items: center;
    width: 210px;
    height: 210px;
    border-radius: 999px;
    border: 1px solid rgba(190,164,128,0.78);
    background: linear-gradient(180deg, rgba(255,250,243,0.92), rgba(242,232,218,0.96));
    transform: translate(-50%, -50%);
    text-align: center;
    font-size: 16px;
    font-weight: 600;
    color: #59493f;
    letter-spacing: 0.06em;
  }
  .matrix-card {
    position: absolute;
    width: 310px;
    min-height: 154px;
  }
  .matrix-card h3 {
    font-size: 20px;
    line-height: 1.22;
  }
  .matrix-card p {
    font-size: 15px;
    line-height: 1.56;
  }
  .matrix-card-top-left {
    left: 34px;
    top: 46px;
  }
  .matrix-card-top-right {
    right: 34px;
    top: 46px;
  }
  .matrix-card-bottom-left {
    left: 34px;
    bottom: 34px;
  }
  .matrix-card-bottom-right {
    right: 34px;
    bottom: 34px;
  }
  .metric-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-top: 24px;
  }
  .metric {
    border-radius: 18px;
    border: 1px solid rgba(15,23,31,0.08);
    background: rgba(255,255,255,0.84);
    padding: 16px 18px;
  }
  .metric .value {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.04em;
  }
  .metric .label {
    margin-top: 6px;
    color: #5e6c76;
    font-size: 13px;
    line-height: 1.4;
    text-transform: uppercase;
    letter-spacing: 0.14em;
  }
  .evidence-list {
    margin: 20px 0 0;
    padding-left: 22px;
    color: #344550;
    font-size: 18px;
    line-height: 1.55;
  }
  .evidence-list li + li {
    margin-top: 12px;
  }
  .chart-shell {
    min-height: 440px;
  }
  .chart-title {
    margin-bottom: 14px;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .chart-footnote {
    margin-top: 10px;
    font-size: 14px;
    color: #5e6c76;
  }
  .annotation-rail,
  .support-rail {
    display: grid;
    gap: 14px;
  }
  .annotation-rail .annotation-card,
  .support-rail .annotation-card {
    border-radius: 18px;
    border: 1px solid rgba(15,23,31,0.08);
    background: rgba(255,255,255,0.78);
    padding: 16px 18px;
  }
  .annotation-card .label {
    display: block;
    margin-bottom: 8px;
    color: #6c7c87;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .page-footer {
    position: absolute;
    left: 74px;
    right: 74px;
    bottom: 50px;
    border-top: 1px solid rgba(15,23,31,0.08);
    padding-top: 16px;
    color: #5e6c76;
    font-size: 15px;
    line-height: 1.5;
  }
  .hero-model-shell {
    position: relative;
    display: grid;
    place-items: center;
    min-height: 640px;
    border-radius: 34px;
    background:
      radial-gradient(circle at top, rgba(255,255,255,0.55), transparent 32%),
      linear-gradient(160deg, rgba(12,38,56,0.04), rgba(255,255,255,0.58)),
      rgba(255,255,255,0.66);
    perspective: 1400px;
    overflow: hidden;
  }
  .chip-stack {
    position: relative;
    width: 420px;
    height: 320px;
    transform-style: preserve-3d;
    transform: rotateX(56deg) rotateZ(-28deg);
  }
  .chip-layer {
    position: absolute;
    inset: auto;
    width: 300px;
    height: 170px;
    left: 60px;
    border-radius: 24px;
    border: 1px solid rgba(15,23,31,0.12);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.5),
      0 24px 44px rgba(15,23,31,0.16);
  }
  .chip-layer::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background-image:
      linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px),
      linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px);
    background-size: 26px 26px;
    opacity: 0.42;
  }
  .chip-layer-top {
    top: 18px;
    background: linear-gradient(180deg, rgba(255,255,255,0.78), rgba(215,240,244,0.95));
    transform: translateZ(58px);
  }
  .chip-layer-mid {
    top: 80px;
    background: linear-gradient(180deg, rgba(255,255,255,0.82), rgba(223,231,241,0.96));
    transform: translateZ(22px);
  }
  .chip-layer-base {
    top: 144px;
    background: linear-gradient(180deg, rgba(232,225,211,0.96), rgba(203,196,182,0.98));
    transform: translateZ(-6px);
  }
  .layer-label {
    position: absolute;
    left: 22px;
    top: 18px;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.02em;
    transform: rotateZ(28deg) rotateX(-56deg);
  }
  .annotation {
    position: absolute;
    color: #4d6170;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.01em;
  }
  .annotation::before {
    content: "";
    position: absolute;
    height: 1px;
    background: rgba(23,55,72,0.28);
  }
  .annotation-top {
    top: -16px;
    right: -40px;
  }
  .annotation-top::before {
    width: 68px;
    left: -78px;
    top: 10px;
  }
  .annotation-right {
    bottom: 18px;
    right: -76px;
  }
  .annotation-right::before {
    width: 72px;
    left: -82px;
    top: 10px;
  }
`;

function buildReportDocument(title, pageMarkup) {
  return [
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head>",
    "<meta charset=\"utf-8\" />",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    `<title>${escapeHtml(title)}</title>`,
    "<style>",
    BASE_STYLES,
    "</style>",
    "</head>",
    "<body>",
    `<main class="report-root">${pageMarkup.join("\n")}</main>`,
    "</body>",
    "</html>",
  ].join("\n");
}

function createReport(title, pages) {
  const pageMarkup = pages.map((page) => page.markup);
  return {
    title,
    html: buildReportDocument(title, pageMarkup),
    pageCount: pages.length,
    pageTitles: pages.map((page) => page.title),
  };
}

function createSectionPages(definitions) {
  return definitions.map((definition) => ({
    title: definition.title,
    markup: pageSection(definition),
  }));
}

function readFixtureText(relativePath) {
  return readFileSync(path.join(FIXTURES_DIR, relativePath), "utf8");
}

function extractFirstFixturePage(html) {
  const match = html.match(/<section class="page"(?:\s|>)[\s\S]*?<\/section>/);
  if (!match) {
    throw new Error("Fixture HTML did not contain a section.page element.");
  }
  return match[0];
}

const standardPages = createSectionPages([
  {
    title: "Coordination bottlenecks still cap clinic throughput despite added labor",
    eyebrow: "Operating thesis",
    left: `
      <h1>Coordination bottlenecks still cap clinic throughput despite adding 12% more clinicians.</h1>
      <p class="lede">The network removed obvious staffing friction, but prep delays, referral release timing, and exception routing still slow the final patient path.</p>
      <div class="metric-strip">
        <div class="metric"><div class="value">37m</div><div class="label">Average wait after staffing increase</div></div>
        <div class="metric"><div class="value">11%</div><div class="label">Clinician idle time after stabilization</div></div>
        <div class="metric"><div class="value">8%</div><div class="label">No-show rate after tighter outreach</div></div>
      </div>
    `,
    right: `
      <div class="surface-grid">
        ${card("What improved", "Intake handoff time fell by 18%, no-shows fell from 12% to 8%, and idle time dropped from 18% to 11%.")}
        ${card("What still blocks flow", "Prep delays and exception-routing loops continue to accumulate exactly when morning demand peaks.")}
        ${card("Why it matters", "The residual delay sits in coordination logic, so adding more labor now creates diminishing throughput gains.")}
      </div>
    `,
    footer: "Board implication: the next unlock is a coordination model shift, not another staffing wave.",
  },
  {
    title: "Referral release timing is now the main throughput governor",
    eyebrow: "Operational evidence",
    left: `
      <h1>Referral release timing is now the main throughput governor.</h1>
      ${chartMarkup({
        title: "Wait time improved less than adjacent coordination metrics",
        bars: [
          { label: "Wait time", value: 37 },
          { label: "Idle time", value: 11 },
          { label: "No-show", value: 8 },
        ],
        footnote: "Directional chart from the provided operating facts.",
      })}
    `,
    right: `
      <div class="annotation-rail">
        <div class="annotation-card">
          <span class="label">Core read</span>
          <p class="dense">Clinician time is no longer the primary failure point; the queue still bunches when referrals are released late and prep work is held in exception paths.</p>
        </div>
        <div class="annotation-card">
          <span class="label">Why gains stalled</span>
          <p class="dense">Wait time only fell from 41 to 37 minutes even though staffing rose 12%, which means the bottleneck migrated away from direct capacity.</p>
        </div>
        <div class="annotation-card">
          <span class="label">Consequence</span>
          <p class="dense">Morning demand remains unbalanced, so the system still absorbs disruption through downstream delay rather than through faster release logic.</p>
        </div>
      </div>
    `,
    footer: "Residual delay is now a release-timing problem more than a labor-availability problem.",
  },
  {
    title: "Shift operating model before adding more clinic labor",
    eyebrow: "Recommendation",
    left: `
      <h1>Shift the operating model before adding more clinic labor.</h1>
      <p class="lede">Use the next operating sprint to rebalance demand and remove coordination friction before funding another staffing round.</p>
      ${bullets([
        "Move referral release decisions earlier in the day so prep teams can absorb the queue before peak arrivals.",
        "Create a single exception-routing owner instead of handing complex cases across multiple teams.",
        "Stage morning demand into balanced blocks rather than allowing unrestricted batch release at open.",
        "Keep staffing steady until coordination changes show repeatable throughput improvement.",
      ])}
    `,
    right: `
      <div class="support-rail">
        <div class="annotation-card">
          <span class="label">Expected outcome</span>
          <p class="dense">The network should convert coordination gains into shorter end-to-end waits without another labor cost step-up.</p>
        </div>
      </div>
    `,
    footer: "Recommendation logic: coordination first, labor second.",
  },
]);

const standardReport = createReport("Clinic throughput remains coordination-bound", standardPages);

const optimizedPages = createSectionPages([
  standardPages[0],
  {
    title: "Action sequencing absorbs the residual delay before the queue peaks",
    eyebrow: "Optimized evidence",
    left: `
      <h1>Action sequencing absorbs the residual delay before the queue peaks.</h1>
      ${chartMarkup({
        title: "Use the first release window to remove exception backlog",
        bars: [
          { label: "Release timing", value: 27 },
          { label: "Idle time", value: 11 },
          { label: "No-show", value: 8 },
        ],
      })}
    `,
    right: `
      <div class="annotation-rail">
        <div class="annotation-card">
          <span class="label">Primary action</span>
          <p class="dense">Push referral-release decisions into the first prep window so teams convert earlier visibility into fewer downstream delays.</p>
        </div>
        <div class="annotation-card">
          <span class="label">Design principle</span>
          <p class="dense">Keep the chart central and compress explanation into short, high-signal operational annotations.</p>
        </div>
      </div>
    `,
    footer: "Optimized page after manual page repair.",
  },
  standardPages[2],
]);
const optimizedReport = createReport("Clinic throughput remains coordination-bound", optimizedPages);

const chartFirstPages = createSectionPages([
  standardPages[0],
  standardPages[1],
  standardPages[2],
]);
const chartFirstReport = createReport("Clinic throughput still stalls in coordination logic", chartFirstPages);

const heroPages = createSectionPages([
  {
    title: "The edge AI platform wins because the full system behaves like one integrated object",
    eyebrow: "Platform concept",
    left: `
      <h1>The edge AI platform wins because the full system behaves like one integrated object.</h1>
      <p class="lede">The product advantage comes from how the compute die, memory fabric, substrate, and interconnect shell behave together under latency and thermal pressure.</p>
      ${bullets([
        "Compute and memory are co-designed rather than loosely coupled.",
        "The interconnect shell is part of the system object, not an afterthought.",
        "Thermal and power behavior are solved in the physical stack, not patched downstream.",
      ])}
    `,
    right: heroModelMarkup(),
    footer: "Hero page for pseudo-3D model validation.",
    className: "hero-page",
  },
  {
    title: "Each physical layer changes how data moves through the system",
    eyebrow: "Architecture layers",
    left: `
      <h1>Each physical layer changes how data moves through the system.</h1>
      <p class="lede">The compute die, memory slab, and substrate routing layer jointly determine the data path and thermal envelope.</p>
    `,
    right: `
      <div class="surface-grid">
        ${card("Compute die", "Optimized for dense inference workloads and local scheduling logic.")}
        ${card("Memory stack", "Reduces movement cost by keeping active working sets close to compute.")}
        ${card("Substrate and interconnect", "Stabilize power delivery and carry the timing budget between layers.")}
      </div>
    `,
    footer: "Second page remains descriptive, not another hero composition.",
  },
  {
    title: "Physical architecture becomes a business advantage in latency and cost",
    eyebrow: "Business consequence",
    left: `
      <h1>Physical architecture becomes a business advantage in latency and deployment economics.</h1>
      ${bullets([
        "Lower movement cost reduces end-to-end latency under real edge workloads.",
        "Thermal efficiency reduces packaging and deployment overhead.",
        "Integrated system behavior improves predictable cost per inference.",
      ])}
    `,
    right: `
      <div class="surface-grid">
        ${card("Latency", "The design shortens the path between compute and memory.")}
        ${card("Power", "Thermal efficiency is designed into the stack rather than treated as an external constraint.")}
      </div>
    `,
  },
]);
const heroReport = createReport("Integrated edge AI platform architecture", heroPages);

const architectureNoHeroPages = createSectionPages([
  {
    title: "The platform wins because the full AI stack behaves as one integrated system",
    eyebrow: "Platform thesis",
    left: `
      <h1>The platform wins because the full AI stack behaves as one integrated system.</h1>
      <p class="lede">Compute, memory routing, and deployment controls matter because they work together as one operating system for the edge workload, not because they look like a 3D object on the page.</p>
      ${bullets([
        "The winning claim is integration quality, not visual spectacle.",
        "Latency, power, and deployment behavior improve when the stack is designed as one system.",
      ])}
    `,
    right: `
      <div class="surface-grid">
        ${card("What to understand", "The platform advantage comes from coordinated behavior across compute, memory, and orchestration layers.")}
        ${card("What not to force", "Do not turn a system explanation page into a hero-model treatment unless the brief explicitly asks for a 3D cutaway.")}
      </div>
    `,
    footer: "Architecture mention alone should not trigger pseudo-3D hero output.",
  },
  {
    title: "Each architecture layer changes the operating envelope in a different way",
    eyebrow: "Architecture logic",
    left: `
      <h1>Each architecture layer changes the operating envelope in a different way.</h1>
      <p class="lede">Compute density, memory locality, and orchestration discipline each affect latency and thermal behavior through a different mechanism.</p>
    `,
    right: `
      <div class="surface-grid">
        ${card("Compute layer", "Optimizes the workload path and local scheduling under sustained inference load.")}
        ${card("Memory locality", "Keeps active working sets close enough to reduce movement cost and latency variance.")}
        ${card("Control layer", "Stabilizes routing and deployment behavior so the platform performs predictably in the field.")}
      </div>
    `,
  },
  {
    title: "Architecture discipline becomes a business advantage in edge deployment economics",
    eyebrow: "Business consequence",
    left: `
      <h1>Architecture discipline becomes a business advantage in edge deployment economics.</h1>
      ${bullets([
        "Lower movement cost improves latency without adding deployment complexity.",
        "A better-controlled stack makes cost per inference more predictable in live operations.",
      ])}
    `,
    right: `
      <div class="surface-grid">
        ${card("Latency", "The integration story matters because the path between compute and memory is shorter and more predictable.")}
        ${card("Cost", "The stack is easier to deploy and operate because fewer downstream fixes are required.")}
      </div>
    `,
  },
]);
const architectureNoHeroReport = createReport("Integrated edge AI platform architecture", architectureNoHeroPages);

const singleClaimPages = createSectionPages([
  {
    title: "Coordination logic, not staffing, is now the core throughput constraint",
    eyebrow: "Executive thesis",
    left: `
      <h1>Coordination logic, not staffing, is now the core throughput constraint.</h1>
      <p class="lede">Staffing helped, but referral release timing still sets the queue.</p>
      ${bullets([
        "Labor is no longer the binding bottleneck.",
        "Release timing now explains the remaining delay.",
      ])}
    `,
    right: `
      <div class="support-rail">
        <div class="annotation-card">
          <span class="label">Takeaway</span>
          <p class="dense">Fix coordination rules before funding more labor.</p>
        </div>
      </div>
    `,
    footer: "One page, one answer.",
  },
  {
    title: "Referral release timing is the cleanest evidence of the remaining queue problem",
    eyebrow: "Evidence page",
    left: `
      <h1>Referral release timing is the cleanest evidence of the remaining queue problem.</h1>
      ${chartMarkup({
        title: "Queue delay persists after adjacent operating metrics improved",
        bars: [
          { label: "Wait time", value: 37 },
          { label: "Idle time", value: 11 },
          { label: "No-show", value: 8 },
        ],
        footnote: "The chart is central; annotations stay short.",
      })}
    `,
    right: `
      <div class="annotation-rail">
        <div class="annotation-card">
          <span class="label">Read</span>
          <p class="dense">Late release still concentrates work into the same peak window.</p>
        </div>
        <div class="annotation-card">
          <span class="label">Why it matters</span>
          <p class="dense">That is why wait time improved less than adjacent metrics.</p>
        </div>
      </div>
    `,
    footer: "Comparison and chart pages can show multiple proof items, but they still resolve to one verdict.",
  },
  {
    title: "Move release decisions earlier before revisiting labor expansion",
    eyebrow: "Recommendation",
    left: `
      <h1>Move release decisions earlier before revisiting labor expansion.</h1>
      <p class="lede">Shift release timing first, then retest throughput before adding labor.</p>
      ${bullets([
        "Advance referral release into the first prep window.",
        "Hold labor flat until wait time improves.",
      ])}
    `,
    right: `
      <div class="support-rail">
        <div class="annotation-card">
          <span class="label">Board move</span>
          <p class="dense">Approve a coordination sprint now and delay the labor decision.</p>
        </div>
      </div>
    `,
  },
]);
const singleClaimReport = createReport("Clinic throughput remains coordination-bound", singleClaimPages);

const singleClaimOptimizedPages = createSectionPages([
  {
    title: "Coordination logic, not staffing, is now the core throughput constraint",
    eyebrow: "Executive thesis",
    left: `
      <h1>Coordination logic, not staffing, is now the core throughput constraint.</h1>
      <p class="lede">Staffing gains helped, but the strongest remaining performance blocker sits in referral release timing and exception routing.</p>
      ${bullets([
        "The page makes one claim: labor is no longer the binding bottleneck.",
        "Support stays short so the claim remains dominant.",
      ])}
    `,
    right: `
      <div class="support-rail">
        <div class="annotation-card">
          <span class="label">Takeaway</span>
          <p class="dense">The next operating move should target coordination rules rather than another staffing wave.</p>
        </div>
      </div>
    `,
    footer: "One page, one answer, one recommendation frame.",
  },
  {
    title: "Action sequencing absorbs the residual delay before the queue peaks",
    eyebrow: "Optimized evidence",
    left: `
      <h1>Action sequencing absorbs the residual delay before the queue peaks.</h1>
      ${chartMarkup({
        title: "Use the first release window to remove exception backlog",
        bars: [
          { label: "Release timing", value: 27 },
          { label: "Idle time", value: 11 },
          { label: "No-show", value: 8 },
        ],
      })}
    `,
    right: `
      <div class="annotation-rail">
        <div class="annotation-card">
          <span class="label">Primary action</span>
          <p class="dense">Push referral-release decisions into the first prep window so teams convert earlier visibility into fewer downstream delays.</p>
        </div>
        <div class="annotation-card">
          <span class="label">Design principle</span>
          <p class="dense">Keep the chart central and compress explanation into short, high-signal operational annotations.</p>
        </div>
      </div>
    `,
    footer: "Optimized page after manual page repair.",
  },
  {
    title: "Move release decisions earlier before revisiting labor expansion",
    eyebrow: "Recommendation",
    left: `
      <h1>Move release decisions earlier before revisiting labor expansion.</h1>
      <p class="lede">The operating answer is to shift release timing first, then test whether throughput improves before funding more clinicians.</p>
      ${bullets([
        "Advance referral release into the first prep window.",
        "Keep labor flat until coordination changes repeatably reduce wait time.",
      ])}
    `,
    right: `
      <div class="support-rail">
        <div class="annotation-card">
          <span class="label">Board move</span>
          <p class="dense">Approve a coordination sprint now and hold the labor decision until the release model proves out.</p>
        </div>
      </div>
    `,
  },
]);
const singleClaimOptimizedReport = createReport(
  "Clinic throughput remains coordination-bound",
  singleClaimOptimizedPages,
);

const denseSemanticPages = [
  {
    title: "The deck is readable, but page 1 is still too dense to stay clear",
    markup: pageSection({
      title: "The deck is readable, but page 1 is still too dense to stay clear",
      eyebrow: "Density stress",
      left: `
        <h1>The deck is readable, but page 1 is still too dense to stay clear.</h1>
        <p class="lede">This page intentionally keeps everything inside the frame while overloading the story with too many same-weight support modules, too much supporting copy, and too many proof fragments for a single opening page.</p>
        <p class="dense">The goal of the fixture is to prove that semantic density alone can trigger auto-review even when nothing is physically cut off, because the page still asks the reader to process too many competing support objects before the main claim lands.</p>
      `,
      right: `
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:8px;">
          ${visualCard("Signal 1", "Staffing increased, but flow still stalls at the same release bottleneck.")}
          ${visualCard("Signal 2", "Idle time improved faster than wait time, which shifts attention toward coordination logic.")}
          ${visualCard("Signal 3", "No-show reduction helped, but did not change the dominant queue shape during the morning peak.")}
          ${visualCard("Signal 4", "Exception routing still creates a second wave of delay after intake stabilization.")}
          ${visualCard("Signal 5", "Board language, operating detail, and execution implications are all competing for the same visual weight.")}
          ${visualCard("Signal 6", "This is exactly the kind of page that should be simplified before anyone adds another support module.")}
        </div>
      `,
      footer: "This page should trigger repair because semantic density is too high even without visible overflow.",
    }),
  },
  singleClaimPages[1],
  singleClaimPages[2],
];
const denseSemanticReport = createReport("Semantic density repair fixture", denseSemanticPages);

const denseSemanticRepairedPages = [
  {
    title: "Coordination logic remains the single binding constraint on throughput",
    markup: pageSection({
      title: "Coordination logic remains the single binding constraint on throughput",
      eyebrow: "Repaired thesis",
      left: `
        <h1>Coordination logic remains the single binding constraint on throughput.</h1>
        <p class="lede">The page now keeps one claim visible, trims weak secondary evidence, and leaves only the proof that strengthens the operating conclusion.</p>
        ${bullets([
          "Wait time improved less than adjacent metrics, so coordination is still the binding constraint.",
          "The page drops weak secondary modules instead of carrying six equal-weight proof fragments.",
        ])}
      `,
      right: `
        <div class="support-rail">
          <div class="annotation-card">
            <span class="label">Why this is better</span>
            <p class="dense">The executive claim lands first, and the remaining proof now supports one answer instead of six parallel side stories.</p>
          </div>
        </div>
      `,
      footer: "Repaired page after semantic-density review.",
    }),
  },
  singleClaimPages[1],
  singleClaimPages[2],
];
const denseSemanticRepairedReport = createReport("Semantic density repair fixture", denseSemanticRepairedPages);

const titleOnlyPages = [
  {
    title: "Create the board-ready leadership deck about clinic throughput",
    markup: pageSection({
      title: "Create the board-ready leadership deck about clinic throughput",
      eyebrow: "Title stress",
      left: `
        <h1>Create the board-ready leadership deck about clinic throughput.</h1>
        <p class="lede">Coordination logic remains the constraint.</p>
        ${bullets([
          "The page should keep one operational answer in view.",
          "Only the title is intentionally broken in this fixture.",
        ])}
      `,
      right: `
        <div class="support-rail">
          <div class="annotation-card">
            <span class="label">Intent</span>
            <p class="dense">Review should fix the leaked title without escalating to AI repair.</p>
          </div>
        </div>
      `,
      footer: "This fixture should be fixed by deterministic title cleanup only.",
    }),
  },
  singleClaimPages[1],
  singleClaimPages[2],
];
const titleOnlyReport = createReport("Title cleanup fixture", titleOnlyPages);

const titleOnlyRepairedPages = [
  {
    title: "Coordination logic remains the constraint",
    markup: pageSection({
      title: "Coordination logic remains the constraint",
      eyebrow: "Title repaired",
      left: `
        <h1>Coordination logic remains the constraint.</h1>
        <p class="lede">Coordination logic remains the constraint.</p>
        ${bullets([
          "The page keeps the same answer after title cleanup.",
          "The fix should not require a model repair pass.",
        ])}
      `,
      right: `
        <div class="support-rail">
          <div class="annotation-card">
            <span class="label">Intent</span>
            <p class="dense">The page keeps its content and only normalizes the title.</p>
          </div>
        </div>
      `,
      footer: "Deterministically repaired title-only fixture.",
    }),
  },
  singleClaimPages[1],
  singleClaimPages[2],
];
const titleOnlyRepairedReport = createReport("Title cleanup fixture", titleOnlyRepairedPages);

const iframeParityPages = [
  {
    title: "Coordination logic remains the constraint on executive throughput",
    markup: pageSection({
      title: "Coordination logic remains the constraint on executive throughput",
      eyebrow: "Iframe parity",
      left: `
        <div class="hero-band" data-html-visual-kind="surface" aria-hidden="true"></div>
        <h1>Coordination logic remains the constraint on executive throughput.</h1>
        <p class="lede">The title should behave like a text box first: click once to select, click again to edit, and never drag a decorative wrapper by accident.</p>
        ${bullets([
          "Decorative surfaces should stay out of page-mode selection unless the user explicitly switches into Visual editing.",
          "The closing strip below exists to test whitespace clicks on structural surface cards.",
        ])}
        <div class="closing-strip-grid">
          ${visualCard(
            "What changed",
            "The iframe now treats the title and closing strip like PPT text and shape layers instead of one blended background target.",
            "surface",
            "closing-strip-card",
          )}
          ${visualCard(
            "Why it matters",
            "Editors can adjust a claim quickly without pulling the surrounding chrome or resizing an unrelated container.",
            "surface",
            "closing-strip-card",
          )}
          ${visualCard(
            "Editing goal",
            "Visual mode should still expose the closing cards as surfaces when the user intentionally wants the container.",
            "surface",
            "closing-strip-card",
          )}
        </div>
      `,
    }),
  },
  singleClaimPages[1],
  singleClaimPages[2],
];
const iframeParityReport = createReport("Iframe parity fixture", iframeParityPages);

const matrixNestedVisualPages = createSectionPages([
  {
    title: "Platform capability matrix",
    eyebrow: "Nested visual selection fixture",
    left: `
      <h1>Platform capability matrix should expose cards, not the grouping shell.</h1>
      <p class="lede">The matrix shell is only structural scaffolding. Visual selection should stay on the individual cards inside it.</p>
      <div class="matrix-shell">
        <div class="matrix-axis-h"></div>
        <div class="matrix-axis-v"></div>
        <article class="surface-card matrix-card matrix-card-top-left">
          <h3>Cloud foundation</h3>
          <p>Compute, storage, and developer tooling expand the base platform and give adjacent products a shared operating substrate.</p>
        </article>
        <article class="surface-card matrix-card matrix-card-top-right">
          <h3>AI platform</h3>
          <p>Gemini, search, and office workflows reinforce the ecosystem and create a more connected user value loop.</p>
        </article>
        <article class="surface-card matrix-card matrix-card-bottom-left">
          <h3>Consumer reach</h3>
          <p>YouTube, Chrome, and Android keep audience attention and distribution strength anchored at the edge.</p>
        </article>
        <article class="surface-card matrix-card matrix-card-bottom-right">
          <h3>Operating system leverage</h3>
          <p>Chrome and Android retain the browser and device control points that route usage back into the platform core.</p>
        </article>
        <div class="matrix-core">Account<br/>Data<br/>Compute</div>
      </div>
    `,
    footer: "Selection should attach to the individual matrix cards rather than the outer shell that only groups them.",
  },
]);
const matrixNestedVisualReport = createReport(
  "Nested matrix visual selection",
  matrixNestedVisualPages,
);

const overflowRepairPages = [
  singleClaimPages[0],
  {
    title: "Overflow stress: coordination detail still spills below the fold",
    markup: pageSection({
      title: "Overflow stress: coordination detail still spills below the fold",
      eyebrow: "Overflow stress",
      left: `
        <h1>Overflow stress: coordination detail still spills below the fold.</h1>
        <p class="lede">This page intentionally overloads the evidence column so auto-review has to repair a real layout failure rather than a soft density warning.</p>
        ${bullets([
          "Referral release still bunches work into the same first-wave queue and forces downstream reprioritization during the peak.",
          "Prep windows remain misaligned with the release decision, so the system spends extra time waiting on decisions that should land earlier.",
          "Exception routing improves only after the queue already spikes, which makes late fixes look like staffing gains rather than coordination gains.",
          "Supervisors still read the page as a labor problem because too many equal-weight proof fragments compete with the main operating answer.",
          "The morning queue peak is still visible in the operational sequence even after adjacent metrics improve, so the story should collapse around one answer.",
          "Every extra support block on this fixture should make the page more likely to overflow and require structural cleanup.",
          "A seventh long support bullet ensures the page carries more proof than the 1600 by 900 canvas can comfortably hold without revision.",
          "An eighth long support bullet keeps the left column visibly over budget even before the footer and annotation rail consume the remaining height.",
          "A ninth support bullet adds another full sentence of explanation so shrink-to-fit alone can no longer rescue the page without meaningful content removal.",
          "A tenth support bullet forces the story to carry more operational context than the template can present cleanly in one pass.",
          "An eleventh support bullet intentionally repeats the same queue mechanics in different words so the page stays physically over budget after deterministic shrinking.",
          "A twelfth support bullet keeps the evidence stack long enough that the page should still trigger a true hard-fail review instead of only a simplification warning.",
        ])}
        <p class="dense" style="font-size:24px;line-height:1.62;">The copy is intentionally long so the page overflows and must route through true repair rather than manual simplification only.</p>
        <p class="dense" style="font-size:24px;line-height:1.62;">This extra paragraph keeps the layout physically broken in a way that simple density scoring alone cannot explain away.</p>
        <p class="dense" style="font-size:24px;line-height:1.62;">A third oversized paragraph makes the fixture survive the first deterministic shrink and remain visibly beyond the page budget.</p>
        <p class="dense" style="font-size:24px;line-height:1.62;">A fourth oversized paragraph leaves too much narrative weight on the page for the preview to resolve without an explicit repair pass.</p>
        <div style="margin-top:18px;">
          ${Array.from({ length: 40 }, (_, index) => `
            <p class="dense" style="font-size:13px;line-height:18px;margin-top:${index === 0 ? 0 : 8}px;">Micro-proof ${index + 1}: release timing, exception routing, and prep-window misalignment all stayed long enough to preserve true overflow after deterministic shrinking.</p>
          `).join("")}
        </div>
      `,
      right: `
        <div class="annotation-rail">
          <div class="annotation-card">
            <span class="label">Why it overflows</span>
            <p class="dense">Two long annotation blocks plus a long left column push the page beyond the available canvas height.</p>
          </div>
          <div class="annotation-card">
            <span class="label">Expected repair</span>
            <p class="dense">The system should shorten secondary copy and compress the support list until the page fits again.</p>
          </div>
          <div class="annotation-card">
            <span class="label">Secondary pressure</span>
            <p class="dense">The fixture keeps enough explanation to remain useful, but not enough room to carry every detail at once.</p>
          </div>
          <div class="annotation-card">
            <span class="label">Overflow proof</span>
            <p class="dense">A fourth annotation card keeps the page beyond the vertical budget so the test exercises real repair routing.</p>
          </div>
          <div class="annotation-card">
            <span class="label">Still too tall</span>
            <p class="dense">A fifth annotation card adds enough retained explanation that shrink-to-fit should still leave measurable overflow on the page.</p>
          </div>
          <div class="annotation-card">
            <span class="label">Escalation gate</span>
            <p class="dense">A sixth annotation card ensures the deck cannot clear review by typography compression alone and must escalate to AI repair.</p>
          </div>
        </div>
      `,
      footer: "This overflow fixture should trigger true auto-repair because the page is physically too tall to fit the canvas without removing secondary content, simplifying the support stack, and tightening the right-rail explanation.",
    }),
  },
  singleClaimPages[2],
];
const overflowRepairReport = createReport("Overflow repair fixture", overflowRepairPages);

const overflowRepairRepairedPages = [
  singleClaimPages[0],
  singleClaimOptimizedPages[1],
  singleClaimPages[2],
];
const overflowRepairRepairedReport = createReport(
  "Overflow repair fixture",
  overflowRepairRepairedPages,
);

const mixedRepairPages = [
  titleOnlyPages[0],
  overflowRepairPages[1],
  singleClaimPages[2],
];
const mixedRepairReport = createReport("Mixed repair fixture", mixedRepairPages);

const mixedRepairRepairedPages = [
  titleOnlyRepairedPages[0],
  singleClaimOptimizedPages[1],
  singleClaimPages[2],
];
const mixedRepairRepairedReport = createReport("Mixed repair fixture", mixedRepairRepairedPages);

const secondPassStillBrokenPages = [
  singleClaimPages[0],
  overflowRepairPages[1],
  singleClaimPages[2],
];
const secondPassStillBrokenReport = createReport(
  "Second pass gating fixture",
  secondPassStillBrokenPages,
);

const caseStudyPages = createSectionPages([
  {
    title: "Case overview: release timing, not staffing, caused the warehouse delay",
    eyebrow: "Case overview",
    left: `
      <h1>Case overview: release timing, not staffing, caused the warehouse delay.</h1>
      <p class="lede">The case starts with a distribution center that added labor but still missed the evening dispatch cut, because orders were released in one late batch instead of a steadier flow.</p>
      ${bullets([
        "Headcount rose, but the queue still peaked after 4:00 pm.",
        "Late release timing, not pick capacity, kept creating the visible backlog.",
      ])}
    `,
    right: `
      <div class="support-rail">
        ${card("Context", "The site handled more urgent SKUs, but release rules never changed with the mix.")}
        ${card("Challenge", "Leaders kept debating labor because the queue spike looked like a capacity shortage.")}
      </div>
    `,
  },
  {
    title: "Intervention: the team moved release windows forward and flattened the queue",
    eyebrow: "Intervention",
    left: `
      <h1>Intervention: the team moved release windows forward and flattened the queue.</h1>
      ${chartMarkup({
        title: "Late-wave orders after release redesign",
        bars: [
          { label: "Before", value: 78 },
          { label: "Pilot week", value: 46 },
          { label: "Week 3", value: 31 },
        ],
        footnote: "The intervention redistributed order release instead of adding more labor to the same late-wave pattern.",
      })}
    `,
    right: `
      <div class="annotation-rail">
        <div class="annotation-card">
          <span class="label">Change</span>
          <p class="dense">The site shifted from one late release wave to staggered release windows tied to route deadlines.</p>
        </div>
        <div class="annotation-card">
          <span class="label">Why it mattered</span>
          <p class="dense">The backlog dropped because work arrived earlier, not because the team suddenly picked faster.</p>
        </div>
      </div>
    `,
  },
  {
    title: "Outcome and lesson: earlier release control fixed the case more than extra labor",
    eyebrow: "Outcome and lesson",
    left: `
      <h1>Outcome and lesson: earlier release control fixed the case more than extra labor.</h1>
      <p class="lede">The case closes with a simple lesson: when flow timing creates the visible queue, releasing work earlier beats funding more of the same downstream capacity.</p>
      ${bullets([
        "Queue variance fell once orders entered the floor earlier in the day.",
        "The case teaches that timing control should be tested before a second labor expansion.",
      ])}
    `,
    right: `
      <div class="support-rail">
        ${card("Outcome", "Dispatch misses fell after the release redesign without another staffing step-up.")}
      </div>
    `,
  },
]);
const caseStudyReport = createReport("Warehouse release timing case study", caseStudyPages);

const shippingRoboticsCaseStudyPages = createSectionPages([
  {
    title: "Case overview: robotics enters shipping to solve unsafe, labor-heavy work first",
    eyebrow: "Case overview",
    left: `
      <h1>Case overview: robotics enters shipping to solve unsafe, labor-heavy work first.</h1>
      <p class="lede">The shipping case starts from one operational problem, not a research question: crews face harsh environments, rising labor cost, and repeated safety risk in core port and vessel workflows.</p>
      ${bullets([
        "Shipping handles more than 80% of international trade, so operational friction scales globally.",
        "Human error remains a major safety driver, which makes robotics valuable in dangerous, repetitive work.",
      ])}
    `,
    right: `
      <div class="support-rail">
        ${card("Case context", "Traditional shipping still leans heavily on manual labor across terminals, vessels, and inspection work.")}
        ${card("Challenge", "The core tension is how to raise safety and efficiency without adding more costly manual effort.")}
      </div>
    `,
  },
  {
    title: "Application outcome: robotics improves port flow and safety before broader autonomy arrives",
    eyebrow: "Application and outcome",
    left: `
      <h1>Application outcome: robotics improves port flow and safety before broader autonomy arrives.</h1>
      ${chartMarkup({
        title: "Where robotics shows the clearest near-term case value",
        bars: [
          { label: "Terminal vehicles", value: 88 },
          { label: "Inspection robots", value: 63 },
          { label: "Autonomous vessels", value: 34 },
        ],
        footnote: "The case moves from immediate terminal and inspection use toward broader autonomous shipping over time.",
      })}
    `,
    right: `
      <div class="annotation-rail">
        <div class="annotation-card">
          <span class="label">Intervention</span>
          <p class="dense">Robotics first appears in transport, inspection, and hazardous-task relief, where the operational benefit is concrete and visible.</p>
        </div>
        <div class="annotation-card">
          <span class="label">Lesson</span>
          <p class="dense">The strongest case-study conclusion is practical: shipping adopts robotics fastest where it removes unsafe, repetitive work and raises flow reliability.</p>
        </div>
      </div>
    `,
  },
]);
const shippingRoboticsCaseStudyReport = createReport(
  "Robotics in shipping case study",
  shippingRoboticsCaseStudyPages,
);

const academicResearchPages = createSectionPages([
  {
    title: "Research question: does reranking improve answer accuracy without slowing response time?",
    eyebrow: "Research question",
    left: `
      <h1>Research question: does reranking improve answer accuracy without slowing response time?</h1>
      <p class="lede">This study tests whether a lightweight reranking layer improves answer accuracy in retrieval-augmented generation while keeping latency inside the current product budget.</p>
      ${bullets([
        "Question: can reranking raise grounded answer quality on multi-document prompts?",
        "Constraint: the method has to preserve a sub-second interactive feel.",
      ])}
    `,
    right: `
      <div class="support-rail">
        ${card("Setup", "The experiment compares baseline retrieval against the same system with reranking enabled.")}
      </div>
    `,
  },
  {
    title: "Method and result: reranking raised answer accuracy while keeping latency stable",
    eyebrow: "Method and result",
    left: `
      <h1>Method and result: reranking raised answer accuracy while keeping latency stable.</h1>
      ${chartMarkup({
        title: "Accuracy gain versus latency change",
        bars: [
          { label: "Accuracy gain", value: 14 },
          { label: "Latency delta", value: 2 },
          { label: "Hallucination drop", value: 9 },
        ],
        footnote: "The largest movement appears in answer quality, while latency changes only slightly relative to the baseline run.",
      })}
    `,
    right: `
      <div class="annotation-rail">
        <div class="annotation-card">
          <span class="label">Method</span>
          <p class="dense">The team evaluated matched prompts across the baseline and reranked pipelines using the same corpus and judge criteria.</p>
        </div>
        <div class="annotation-card">
          <span class="label">Result</span>
          <p class="dense">Accuracy improved more than latency changed, which makes reranking the dominant effect in the study.</p>
        </div>
      </div>
    `,
  },
  {
    title: "Interpretation and next work: the result supports production testing with a harder benchmark",
    eyebrow: "Interpretation",
    left: `
      <h1>Interpretation and next work: the result supports production testing with a harder benchmark.</h1>
      <p class="lede">The current evidence supports shipping a production pilot, but the next study should stress longer contexts and domain-specific corpora before broader rollout.</p>
      ${bullets([
        "Interpretation: reranking improves grounded quality enough to justify a production pilot.",
        "Next work: test longer contexts and domain-heavy queries before wider adoption.",
      ])}
    `,
    right: `
      <div class="support-rail">
        ${card("Limitation", "The current benchmark is strongest on medium-length prompts rather than the most difficult long-context cases.")}
      </div>
    `,
  },
]);

const academicNeuralNetworkPages = createSectionPages([
  {
    title: "Research question",
    eyebrow: "Conference readout",
    left: `
      <h1>Can a compact reranking MLP improve long-context retrieval without destabilizing latency?</h1>
      <p class="lede">The study isolates one neural reranking stage after retrieval, keeps the rest of the stack fixed, and measures whether the extra topology sharpens relevance under long-context load.</p>
      <div class="surface-grid">
        ${card("Question", "Does one dense reranking network recover relevance when context length grows past the baseline retriever's comfort zone?")}
        ${card("Setup", "The experiment holds the retriever constant, adds one deterministic reranking network, and compares relevance lift against a latency budget.")}
      </div>
    `,
    right: `
      <div class="surface-grid">
        ${card("Metric", "nDCG@10 is the primary ranking metric; latency remains a hard boundary rather than a soft preference.")}
        ${card("Boundary", "The page stays paper-white and figure-led, not a consulting summary with recommendation cards.")}
      </div>
    `,
    footer: "Research setup: isolate one reranking intervention before interpreting broader system implications.",
  },
  {
    title: "Method and result",
    eyebrow: "Deterministic neural figure",
    left: scientificDiagramMarkup({
      title: "Dense reranking network",
      topLabel: "Method topology for the reranking stage",
      bottomLabel: "Output score for final document order",
      caption:
        "A dense reranking MLP concentrates the method page into one editable figure: compact input features flow through two hidden layers before producing a final relevance score.",
      leftNote: "Input features bundle lexical overlap, retrieval score, and context-quality signals.",
      rightNote: "The output score reorders candidates while keeping end-to-end latency inside the paper's stated budget.",
      layers: [
        { id: "layer-input", role: "input", label: "Input layer", nodeCount: 4 },
        { id: "layer-hidden-1", role: "hidden", label: "Hidden 1", nodeCount: 5 },
        { id: "layer-hidden-2", role: "hidden", label: "Hidden 2", nodeCount: 5 },
        { id: "layer-output", role: "output", label: "Output score", nodeCount: 1 },
      ],
    }),
    footer: "Result cue: the deterministic figure page keeps one dominant scientific object with compact annotations only.",
  },
  {
    title: "Interpretation and next work",
    eyebrow: "Interpretation",
    left: `
      <h1>The reranking network helps most when retrieval remains decent but long-context scoring starts to blur relevance.</h1>
      <p class="lede">The gain is real but bounded: the model sharpens ordering when features remain informative, yet it cannot rescue cases where retrieval never surfaces the right candidates.</p>
      <div class="surface-grid">
        ${card("Interpretation", "The neural stage is best read as a targeted ranking refinement, not a full substitute for retrieval quality.")}
        ${card("Limitation", "The dense topology is still sensitive to weak input features, so relevance lift tapers when recall collapses.")}
        ${card("Next work", "Extend the study with broader datasets and compare the dense MLP against lighter calibration heads before increasing model depth.")}
      </div>
    `,
    footer: "Research close: interpret carefully, state the limitation explicitly, then name the next experiment.",
  },
]);
const academicResearchReport = createReport("Reranking research presentation", academicResearchPages);
const academicNeuralNetworkReport = createReport(
  "Neural reranking research presentation",
  academicNeuralNetworkPages,
);

const valuationDeepLanePages = createSectionPages([
  {
    title: "Codex valuation frame",
    eyebrow: "Finance-grade valuation",
    left: `
      <h1>Codex should be valued as a product asset whose upside depends on adoption breadth, monetization quality, and retention durability.</h1>
      <p class="lede">This one-page view stays in valuation mode: frame the asset, isolate the two or three assumptions that actually move value, and land one disciplined scenario posture instead of a generic company overview.</p>
      <div class="metric-strip">
        <div class="metric"><div class="value">Lens</div><div class="label">Product valuation, not company profile</div></div>
        <div class="metric"><div class="value">3</div><div class="label">Primary value drivers</div></div>
        <div class="metric"><div class="value">Base</div><div class="label">Default scenario posture</div></div>
      </div>
    `,
    right: `
      <div class="support-rail">
        ${card("Driver 1", "Adoption breadth matters because valuation expands only if Codex becomes a repeated workflow layer rather than a novelty surface.")}
        ${card("Driver 2", "Monetization quality matters more than raw usage because durable value comes from pricing power and paid retention, not transient experimentation.")}
        ${card("Scenario posture", "Base case assumes solid product pull with disciplined monetization, while upside requires broader workflow integration without assuming unsupported numbers.")}
      </div>
    `,
    footer: "Finance-grade rule: one valuation frame, one driver stack, one disciplined conclusion.",
  },
]);
const valuationDeepLaneReport = createReport("Codex product valuation", valuationDeepLanePages);

const architectureReviewPages = createSectionPages([
  {
    title: "Architecture judgment: retrieval quality is constrained more by orchestration than raw model size",
    eyebrow: "Architecture review",
    left: `
      <h1>Architecture judgment: retrieval quality is constrained more by orchestration than raw model size.</h1>
      <p class="lede">The page stays in architecture-review mode: one system judgment, one structure view, and one explicit constraint instead of a strategy memo or generic explainer.</p>
      ${bullets([
        "Routing and context assembly determine the quality ceiling before larger models do.",
        "The main system bottleneck is coordination across retrieval, ranking, and prompt assembly layers.",
      ])}
    `,
    right: `
      <div class="surface-grid">
        ${card("System view", "Retrieval, ranking, and answer generation form one pipeline; the quality failure appears when these layers lose shared context.")}
        ${card("Constraint", "Cross-layer orchestration is the binding constraint because stale or weak retrieval context propagates through the rest of the stack.")}
      </div>
    `,
  },
  {
    title: "Constraint and trade-off: better routing improves answer quality but raises orchestration complexity",
    eyebrow: "Constraint review",
    left: `
      <h1>Constraint and trade-off: better routing improves answer quality but raises orchestration complexity.</h1>
      ${chartMarkup({
        title: "Relative impact by architecture layer",
        bars: [
          { label: "Routing quality", value: 82 },
          { label: "Context assembly", value: 74 },
          { label: "Model size", value: 49 },
        ],
        footnote: "The point is architectural priority, not a precise benchmark claim.",
      })}
    `,
    right: `
      <div class="annotation-rail">
        <div class="annotation-card">
          <span class="label">Trade-off</span>
          <p class="dense">More dynamic routing improves answer quality, but it also makes orchestration logic harder to debug and stabilize.</p>
        </div>
        <div class="annotation-card">
          <span class="label">Read</span>
          <p class="dense">That is why the review should prioritize a clearer retrieval-control layer before defaulting to larger model spend.</p>
        </div>
      </div>
    `,
  },
  {
    title: "Review conclusion: strengthen the control layer before scaling the rest of the stack",
    eyebrow: "Review conclusion",
    left: `
      <h1>Review conclusion: strengthen the control layer before scaling the rest of the stack.</h1>
      <p class="lede">The architecture conclusion is disciplined: fix the layer that coordinates retrieval quality and context assembly before assuming more compute solves the problem.</p>
      ${bullets([
        "The main move is control-layer clarity, not broader strategic theater.",
        "The page closes on one architecture read and the constraint that drives it.",
      ])}
    `,
    right: `
      <div class="support-rail">
        ${card("Reason", "The current stack loses too much quality before the model sees the final prompt, so scaling downstream capacity alone is a weak answer.")}
      </div>
    `,
  },
]);
const architectureReviewReport = createReport("Retrieval serving architecture review", architectureReviewPages);

const researchReadoutPages = createSectionPages([
  {
    title: "Result readout: long-context retrieval quality falls when evidence ranking decays after the first window",
    eyebrow: "Research readout",
    left: `
      <h1>Result readout: long-context retrieval quality falls when evidence ranking decays after the first window.</h1>
      <p class="lede">This readout stays result-first: show the finding, keep the method boundary visible, and avoid drifting into recommendation language before the result is understood.</p>
      ${bullets([
        "The main result is a ranking-quality drop after the first context window.",
        "The study boundary matters because the benchmark emphasizes long, multi-document prompts.",
      ])}
    `,
    right: `
      <div class="support-rail">
        ${card("Method boundary", "The experiment compares fixed retrieval against a ranking variant across the same long-context prompt set.")}
      </div>
    `,
  },
  {
    title: "Method boundary and interpretation: the degradation is structural, not just prompt noise",
    eyebrow: "Interpretation",
    left: `
      <h1>Method boundary and interpretation: the degradation is structural, not just prompt noise.</h1>
      ${chartMarkup({
        title: "Relative movement in long-context quality",
        bars: [
          { label: "Early-window accuracy", value: 76 },
          { label: "Late-window accuracy", value: 52 },
          { label: "Latency delta", value: 9 },
        ],
        footnote: "The readout emphasizes pattern and boundary, not unsupported production claims.",
      })}
    `,
    right: `
      <div class="annotation-rail">
        <div class="annotation-card">
          <span class="label">Interpretation</span>
          <p class="dense">The quality drop tracks with evidence-ranking decay, which points to a structural retrieval problem rather than incidental prompt variance.</p>
        </div>
        <div class="annotation-card">
          <span class="label">Caveat</span>
          <p class="dense">The result is strongest on the current benchmark and should not be overstated as a universal production outcome.</p>
        </div>
      </div>
    `,
  },
]);
const researchReadoutReport = createReport("Long-context retrieval result readout", researchReadoutPages);

const longformPages = createSectionPages(
  Array.from({ length: 10 }).map((_, index) => ({
    title: `Operating storyline page ${index + 1}`,
    eyebrow: index === 0 ? "Long-form" : `Section ${index + 1}`,
    left:
      index >= 8
          ? `
              <h1>Operating storyline page ${index + 1}</h1>
              <p class="lede">Appendix pages stay compact so long-form review can unlock quickly and preserve page count stability.</p>
              ${bullets([
                index === 8
                  ? "Appendix proof stays attached to one operating answer."
                  : "Page count and export order stay stable through rehydration.",
              ])}
            `
          : index >= 3
            ? `
                <h1>Operating storyline page ${index + 1}</h1>
                <p class="lede">${
                  index === 3
                    ? "This evidence page carries one proof pattern instead of a wall of equal-weight modules."
                    : index === 4
                      ? "The middle of the deck keeps one evidence read visible without adding a chart-heavy layout."
                    : index === 5
                      ? "This page keeps a single supporting proof point visible in the back half of the evidence section."
                      : index === 6
                        ? "This page stays narrow enough that review should not trigger a cleanup pass."
                        : "The page remains concise so long-form review can validate it without extra repair."
                }</p>
              `
          : `
              <h1>Operating storyline page ${index + 1}</h1>
              <p class="lede">${
                index === 0
                  ? "The opening page lands one operating thesis and keeps the support intentionally short."
                  : index === 1
                    ? "The second page turns the thesis into one practical leadership question."
                    : "The third page keeps the operating implication clear before the deck moves into evidence."
              }</p>
              ${
                bullets([
                  index === 0
                    ? "One page answers one board question."
                    : index === 1
                      ? "Support stays short enough to keep the claim dominant."
                      : "Evidence should reinforce the same story, not reopen it.",
                  index === 0
                    ? "Weak secondary proof stays off the opening slide."
                    : index === 1
                      ? "The storyline does not mix recommendation and appendix language."
                      : "The deck should enter the evidence section without adding a second thesis.",
                ])
              }
            `,
    right: "",
  })),
);
const longformReport = createReport("Long-form operating storyline", longformPages);

const mckinseyChartTargetReport = {
  title: "McKinsey-style chart export target",
  html: readFixtureText("html/mckinsey-chart-target.html"),
  pageCount: 1,
  pageTitles: ["Chart Capability Demonstration"],
};

const exportedMckinseyChartRegressionReport = {
  title: "Exported McKinsey chart regression",
  html: readFixtureText("html/a-one-page-mckinsey-style-presentation-demonstrating-chart.html"),
  pageCount: 1,
  pageTitles: ["Chart Capability Demonstration"],
};

const observedFactsQ1RegressionReport = {
  title: "Observed facts Q1 2026 regression",
  html: readFixtureText("html/observed-facts-q1-2026-total-2.html"),
  pageCount: 3,
  pageTitles: [
    "特斯拉投资判断：基本面修复已兑现，但估值弹性仍押注AI与Robotaxi",
    "盈利与现金流修复已出现，但交付与利润质量仍偏混合",
    "Migration Risks and Rollback",
  ],
};

const textOwnershipRegressionReport = {
  title: "PPTX text ownership regression",
  html: buildReportDocument("PPTX text ownership regression", [
    `
      <section class="page" data-page-number="1" data-page-title="Filled visual containers keep child text single-source" style="width:1600px;height:900px;position:relative;overflow:hidden;background:#f7f4ec;color:#1f3045;" data-page-bg="#f7f4ec" data-surface-fill="#fbf8f1" data-divider-color="#d8cfbc">
        <div data-html-block-id="ownership-title" data-html-block-kind="heading" data-html-fit-role="content" style="position:absolute;left:72px;top:58px;width:1180px;font-size:46px;line-height:1.12;font-weight:700;color:#17304b;">Ownership graph keeps card text single-source</div>
        <div data-html-block-id="ownership-subtitle" data-html-block-kind="paragraph" data-html-fit-role="content" style="position:absolute;left:72px;top:128px;width:1240px;font-size:21px;line-height:1.35;color:#536171;">Each filled card is a visual shape. Its child blocks remain editable text, and the parent never exports its concatenated innerText as a second filled text box.</div>

        <div data-html-visual-id="ownership-card-1" data-html-visual-kind="label-surface" data-export-role="label-surface" data-export-fill="#fbf8f1" data-export-border="#d8cfbc" data-export-border-width="1" data-export-radius="14" data-export-opacity="1" data-html-fit-role="content" style="position:absolute;left:88px;top:238px;width:420px;height:230px;background:#fbf8f1;border:1px solid #d8cfbc;border-radius:14px;padding:24px;box-sizing:border-box;">
          <div data-html-block-id="ownership-card-1-title" data-html-block-kind="heading" data-html-fit-role="content" style="font-size:30px;line-height:1.1;font-weight:700;color:#17304b;">Key signal</div>
          <div data-html-block-id="ownership-card-1-metric" data-html-block-kind="heading" data-html-fit-role="content" style="margin-top:18px;font-size:25px;line-height:1.2;font-weight:650;color:#b08a42;">Services revenue grew 42%</div>
          <div data-html-block-id="ownership-card-1-body" data-html-block-kind="paragraph" data-html-fit-role="content" style="margin-top:14px;font-size:17px;line-height:1.45;color:#536171;">The parent card background should export as a shape while this paragraph remains the only editable text source for the body copy.</div>
        </div>

        <div data-html-visual-id="ownership-card-2" data-html-visual-kind="label-surface" data-export-role="label-surface" data-export-fill="#17304b" data-export-border="#9f8a5d" data-export-border-width="1" data-export-radius="0" data-export-opacity="1" data-html-fit-role="content" style="position:absolute;left:590px;top:238px;width:360px;height:230px;background:#17304b;border:1px solid #9f8a5d;padding:22px;box-sizing:border-box;color:#f8f4eb;">
          <div data-html-block-id="ownership-card-2-title" data-html-block-kind="heading" data-html-fit-role="content" style="font-size:31px;line-height:1.1;font-weight:700;">Interpretation</div>
          <div data-html-block-id="ownership-card-2-body" data-html-block-kind="paragraph" data-html-fit-role="content" style="margin-top:18px;font-size:18px;line-height:1.4;color:#efe4ce;">A dark filled parent should not become a late z-order text box that covers the separately exported child text.</div>
        </div>

        <div data-html-visual-id="ownership-card-3" data-html-visual-kind="label-surface" data-export-role="label-surface" data-export-fill="#d9c79f" data-export-border="#b59c66" data-export-border-width="1" data-export-radius="0" data-export-opacity="1" data-html-fit-role="content" style="position:absolute;left:1030px;top:238px;width:380px;height:230px;background:#d9c79f;border:1px solid #b59c66;padding:22px;box-sizing:border-box;color:#1f3045;">
          <div data-html-block-id="ownership-card-3-title" data-html-block-kind="heading" data-html-fit-role="content" style="font-size:31px;line-height:1.1;font-weight:700;">Investment meaning</div>
          <div data-html-block-id="ownership-card-3-body" data-html-block-kind="paragraph" data-html-fit-role="content" style="margin-top:18px;font-size:18px;line-height:1.4;">The ownership planner should choose leaf text and suppress the visual container's descendant text aggregate.</div>
        </div>
      </section>
    `,
  ]),
  pageCount: 1,
  pageTitles: ["Filled visual containers keep child text single-source"],
};

const tableExportPages = createSectionPages([
  {
    title: "Native table export should preserve the operating comparison as PowerPoint cells",
    eyebrow: "Export quality",
    left: `
      <h1>Native table export should preserve the operating comparison as PowerPoint cells.</h1>
      <p class="lede">The table is intentionally structured through Studio's table module contract so PPTX export can produce an editable PowerPoint table instead of a flattened picture.</p>
      ${tableMarkup({
        columns: ["Workstream", "Baseline", "Current", "Delta"],
        rows: [
          ["Intake handoff", "42m", "34m", "-8m"],
          ["Referral release", "61m", "58m", "-3m"],
          ["Exception routing", "18%", "14%", "-4pt"],
        ],
      })}
    `,
    right: "",
  },
]);
const tableExportReport = createReport("Native table export fixture", tableExportPages);

const svgLineExportPages = createSectionPages([
  {
    title: "Unstructured SVG line chart should be promoted to a native PowerPoint chart",
    eyebrow: "Export quality",
    left: `
      <h1>Unstructured SVG line chart should be promoted to a native PowerPoint chart.</h1>
      <p class="lede">This fixture mirrors Studio output where a consulting-style line chart is authored as SVG polylines without an explicit chart data contract.</p>
      <div style="margin-top:28px;background:#fcfaf6;border:1px solid #dbd1c2;padding:20px 22px 18px;position:relative;min-height:440px;" data-html-visual-kind="chart-frame" data-export-role="chart-frame" data-html-fit-role="content">
        <div style="font-size:18px;font-weight:700;color:#223037;" data-html-block-id="svg-line-title" data-html-block-kind="heading" data-html-fit-role="content">Illustrative demand pathways show divergence across scenarios</div>
        <div style="font-size:13px;color:#756958;margin-top:4px;" data-html-block-id="svg-line-subtitle" data-html-block-kind="heading" data-html-fit-role="content">Index, base period = 100</div>
        <div style="position:relative;margin-top:18px;height:340px;border-left:2px solid #a9a093;border-bottom:2px solid #a9a093;">
          <div style="position:absolute;bottom:-30px;left:2%;font-size:12px;color:#7c6f61;">Y1</div>
          <div style="position:absolute;bottom:-30px;left:20%;font-size:12px;color:#7c6f61;">Y2</div>
          <div style="position:absolute;bottom:-30px;left:38%;font-size:12px;color:#7c6f61;">Y3</div>
          <div style="position:absolute;bottom:-30px;left:56%;font-size:12px;color:#7c6f61;">Y4</div>
          <div style="position:absolute;bottom:-30px;left:74%;font-size:12px;color:#7c6f61;">Y5</div>
          <div style="position:absolute;bottom:-30px;left:91%;font-size:12px;color:#7c6f61;">Y6</div>
          <div style="position:absolute;left:-32px;top:-8px;font-size:12px;color:#7c6f61;">180</div>
          <div style="position:absolute;left:-32px;top:64px;font-size:12px;color:#7c6f61;">160</div>
          <div style="position:absolute;left:-32px;top:132px;font-size:12px;color:#7c6f61;">140</div>
          <div style="position:absolute;left:-32px;top:200px;font-size:12px;color:#7c6f61;">120</div>
          <div style="position:absolute;left:-32px;top:270px;font-size:12px;color:#7c6f61;">100</div>
          <svg viewBox="0 0 760 340" width="100%" height="100%" style="position:absolute;left:0;top:0;overflow:visible;">
            <polygon points="16,275 148,255 282,218 414,170 548,116 716,55 716,338 16,338" fill="rgba(181,86,56,0.10)"></polygon>
            <polyline points="16,275 148,255 282,218 414,170 548,116 716,55" fill="none" stroke="#b55638" stroke-width="4"></polyline>
            <polyline points="16,275 148,262 282,242 414,222 548,198 716,176" fill="none" stroke="#305c63" stroke-width="4"></polyline>
            <polyline points="16,275 148,281 282,292 414,301 548,306 716,312" fill="none" stroke="#9a9f95" stroke-width="4" stroke-dasharray="8 8"></polyline>
          </svg>
          <div style="position:absolute;right:24px;top:22px;background:#fcfaf6;border:1px solid #ddd2c4;padding:8px 10px;font-size:12px;line-height:1.45;color:#48555b;">
            <div><span style="display:inline-block;width:11px;height:11px;background:#b55638;margin-right:7px;"></span>Accelerated adoption</div>
            <div><span style="display:inline-block;width:11px;height:11px;background:#305c63;margin-right:7px;"></span>Base case</div>
            <div><span style="display:inline-block;width:11px;height:11px;background:#9a9f95;margin-right:7px;"></span>Constrained case</div>
          </div>
        </div>
      </div>
    `,
    right: "",
  },
]);
const svgLineExportReport = createReport("Native SVG line chart export fixture", svgLineExportPages);

const divWaterfallExportPages = createSectionPages([
  {
    title: "Div-built waterfall should be promoted to a native PowerPoint chart",
    eyebrow: "Export quality",
    left: `
      <h1>Div-built waterfall should be promoted to a native PowerPoint chart.</h1>
      <p class="lede">This fixture mirrors Studio output where a value bridge is authored as absolute-positioned bars and labels.</p>
      <div style="margin-top:28px;background:#fcfaf6;border:1px solid #dbd1c2;padding:18px 18px 16px;min-height:260px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;">
          <div>
            <div style="font-size:17px;font-weight:700;color:#223037;" data-html-block-id="div-waterfall-title" data-html-block-kind="heading" data-html-fit-role="content">Illustrative value bridge isolates drivers</div>
            <div style="font-size:12px;color:#786c5e;margin-top:4px;" data-html-block-id="div-waterfall-subtitle" data-html-block-kind="heading" data-html-fit-role="content">Bridge logic, not reported financials</div>
          </div>
          <div style="font-size:11px;color:#8c7b68;text-transform:uppercase;letter-spacing:1px;">Waterfall</div>
        </div>
        <div style="position:relative;margin-top:16px;height:135px;border-bottom:2px solid #aba193;">
          <div style="position:absolute;left:18px;bottom:0;width:62px;height:58px;background:#305c63;"></div>
          <div style="position:absolute;left:103px;bottom:58px;width:62px;height:26px;background:#7f9da1;"></div>
          <div style="position:absolute;left:188px;bottom:40px;width:62px;height:18px;background:#d08f73;"></div>
          <div style="position:absolute;left:273px;bottom:58px;width:62px;height:42px;background:#7f9da1;"></div>
          <div style="position:absolute;left:358px;bottom:0;width:62px;height:100px;background:#b55638;"></div>
          <div style="position:absolute;left:24px;bottom:-28px;font-size:12px;color:#736757;">Start</div>
          <div style="position:absolute;left:101px;bottom:-28px;font-size:12px;color:#736757;">Mix</div>
          <div style="position:absolute;left:183px;bottom:-28px;font-size:12px;color:#736757;">Price</div>
          <div style="position:absolute;left:263px;bottom:-28px;font-size:12px;color:#736757;">Volume</div>
          <div style="position:absolute;left:364px;bottom:-28px;font-size:12px;color:#736757;">End</div>
          <div style="position:absolute;left:28px;bottom:66px;font-size:12px;color:#ffffff;font-weight:700;">100</div>
          <div style="position:absolute;left:117px;bottom:89px;font-size:11px;color:#35565c;font-weight:700;">+18</div>
          <div style="position:absolute;left:202px;bottom:63px;font-size:11px;color:#7f4d3d;font-weight:700;">-12</div>
          <div style="position:absolute;left:286px;bottom:106px;font-size:11px;color:#35565c;font-weight:700;">+29</div>
          <div style="position:absolute;left:372px;bottom:108px;font-size:12px;color:#ffffff;font-weight:700;">135</div>
        </div>
      </div>
    `,
    right: "",
  },
]);
const divWaterfallExportReport = createReport("Native div waterfall export fixture", divWaterfallExportPages);

const bubbleMatrixExportPages = createSectionPages([
  {
    title: "Small bubble matrix should be promoted to a native PowerPoint bubble chart",
    eyebrow: "Export quality",
    left: `
      <h1>Small bubble matrix should be promoted to a native PowerPoint bubble chart.</h1>
      <p class="lede">This fixture mirrors Studio output where a prioritization matrix is authored as small absolute-positioned circles.</p>
      <div style="margin-top:28px;background:#fcfaf6;border:1px solid #dbd1c2;padding:18px 18px 16px;min-height:270px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;">
          <div>
            <div style="font-size:17px;font-weight:700;color:#223037;" data-html-block-id="bubble-matrix-title" data-html-block-kind="heading" data-html-fit-role="content">Prioritization matrix clarifies where to act first</div>
            <div style="font-size:12px;color:#786c5e;margin-top:4px;" data-html-block-id="bubble-matrix-subtitle" data-html-block-kind="heading" data-html-fit-role="content">Conceptual sizing only</div>
          </div>
          <div style="font-size:11px;color:#8c7b68;text-transform:uppercase;letter-spacing:1px;">Bubble matrix</div>
        </div>
        <div style="position:relative;margin-top:16px;height:142px;border-left:2px solid #aba193;border-bottom:2px solid #aba193;background:linear-gradient(to right, transparent 49.5%, #e8dfd2 49.5%, #e8dfd2 50.5%, transparent 50.5%),linear-gradient(to bottom, transparent 49.5%, #e8dfd2 49.5%, #e8dfd2 50.5%, transparent 50.5%);">
          <div style="position:absolute;left:-14px;top:-8px;font-size:12px;color:#736757;">High</div>
          <div style="position:absolute;left:-14px;bottom:-28px;font-size:12px;color:#736757;">Low</div>
          <div style="position:absolute;left:8px;bottom:-28px;font-size:12px;color:#736757;">Low effort</div>
          <div style="position:absolute;right:0;bottom:-28px;font-size:12px;color:#736757;">High effort</div>
          <div style="position:absolute;left:62px;top:20px;width:42px;height:42px;border-radius:50%;background:rgba(181,86,56,0.88);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;">A</div>
          <div style="position:absolute;left:168px;top:34px;width:32px;height:32px;border-radius:50%;background:rgba(48,92,99,0.84);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;">B</div>
          <div style="position:absolute;left:250px;top:84px;width:46px;height:46px;border-radius:50%;background:rgba(208,143,115,0.84);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;">C</div>
          <div style="position:absolute;left:108px;top:94px;width:28px;height:28px;border-radius:50%;background:rgba(127,157,161,0.9);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;">D</div>
        </div>
      </div>
    `,
    right: "",
  },
]);
const bubbleMatrixExportReport = createReport("Native bubble matrix export fixture", bubbleMatrixExportPages);

const teslaQuadrantSpec = {
  kind: "matrix",
  title: "Tesla operating quadrant separates speed from durability",
  subtitle: "Illustrative strategy matrix with editable native cards",
  insight: "The visible chart should be redrawn as PPT shapes, not exported as the SVG preview.",
  xLabel: "Execution complexity",
  yLabel: "Strategic impact",
  xMinLabel: "Low complexity",
  xMaxLabel: "High complexity",
  yMinLabel: "Low impact",
  yMaxLabel: "High impact",
  plotBounds: { x: 0.08, y: 0.24, w: 0.68, h: 0.62 },
  quadrants: [
    { id: "q1", label: "Scale now", x: 0, y: 0, w: 0.5, h: 0.5, color: "#f3e2d9" },
    { id: "q2", label: "Sequence", x: 0.5, y: 0, w: 0.5, h: 0.5, color: "#e4eef0" },
    { id: "q3", label: "Watch", x: 0, y: 0.5, w: 0.5, h: 0.5, color: "#edf1e8" },
    { id: "q4", label: "Defer", x: 0.5, y: 0.5, w: 0.5, h: 0.5, color: "#f6eee2" },
  ],
  items: [
    { id: "item-1", label: "Charging density", detail: "Fast payback", x: 0.08, y: 0.11, w: 0.31, h: 0.2, color: "#ffffff" },
    { id: "item-2", label: "FSD assurance", detail: "High governance load", x: 0.56, y: 0.14, w: 0.34, h: 0.22, color: "#ffffff" },
    { id: "item-3", label: "Service routing", detail: "Operational lift", x: 0.14, y: 0.62, w: 0.32, h: 0.2, color: "#ffffff" },
    { id: "item-4", label: "Cell sourcing", detail: "Long-cycle constraint", x: 0.58, y: 0.62, w: 0.32, h: 0.2, color: "#ffffff" },
  ],
  callout: {
    title: "Decision read",
    body: "Prioritize density moves while sequencing high-assurance autonomy work.",
    x: 0.78,
    y: 0.28,
    w: 0.18,
    h: 0.24,
    color: "#fffaf3",
    borderColor: "#d7c8b9",
  },
};

const teslaQuadrantExportPages = createSectionPages([
  {
    title: "Tesla-style quadrant matrix should redraw semantic cards and clip chart-owned overflow",
    eyebrow: "Export quality",
    left: `
      <h1>Tesla-style quadrant matrix should stay editable without shape overflow.</h1>
      <p class="lede">This fixture includes a structured matrix contract and an SVG preview; PPTX export should keep the chart as native editable shapes with no media fallback.</p>
      ${chartSpecMarkup({ spec: teslaQuadrantSpec })}
      <div data-html-visual-id="page-overflow-strip" data-html-visual-kind="surface" style="position:absolute;left:1320px;top:802px;width:420px;height:22px;background:#d08f73;border-radius:11px;"></div>
    `,
    right: `
      <article class="surface-card" style="margin-top:156px;">
        <h3>Right conclusion box</h3>
        <p>The conclusion rail should remain readable; any oversized rectangles must be clipped before they cross the slide edge.</p>
      </article>
    `,
  },
]);
const teslaQuadrantExportReport = createReport("Tesla quadrant matrix export fixture", teslaQuadrantExportPages);

const comboExportSpec = {
  kind: "combo",
  title: "Throughput and release quality move on different axes",
  subtitle: "Structured combo fixture",
  insight: "Backlog minutes fall while release quality rises, so the chart needs editable bars and an editable line.",
  unit: "minutes",
  secondaryUnit: "%",
  categories: ["Baseline", "Pilot", "Scaled"],
  series: [
    {
      id: "series-1",
      label: "Backlog minutes",
      values: [61, 48, 36],
      color: "#5d7f9d",
      role: "bar",
      axis: "primary",
    },
    {
      id: "series-2",
      label: "Release quality",
      values: [72, 81, 88],
      color: "#19c6df",
      role: "line",
      axis: "secondary",
    },
  ],
};

const comboExportPages = createSectionPages([
  {
    title: "Combo chart export should preserve bars and line as native PowerPoint chart parts",
    eyebrow: "Export quality",
    left: `
      <h1>Combo chart export should preserve bars and line as native PowerPoint chart parts.</h1>
      <p class="lede">This fixture forces Studio's structured combo chart contract through PPTX export so the XML inspector can verify native bar and line chart parts.</p>
      ${chartSpecMarkup({ spec: comboExportSpec })}
    `,
    right: "",
  },
]);
const comboExportReport = createReport("Native combo chart export fixture", comboExportPages);

const bubbleExportSpec = {
  kind: "bubble",
  title: "Scientific segmentation uses bubble area and axis position together",
  subtitle: "Structured bubble fixture",
  insight: "The export path should keep the bubble plot as a native PowerPoint chart with editable point data.",
  unit: "score",
  xLabel: "Model fit",
  yLabel: "Clinical lift",
  sizeLabel: "Study scale",
  points: [
    { id: "point-1", label: "Cohort A", x: 22, y: 31, size: 44, color: "#20d3ff" },
    { id: "point-2", label: "Cohort B", x: 48, y: 58, size: 64, color: "#8aa1b5" },
    { id: "point-3", label: "Cohort C", x: 73, y: 69, size: 96, color: "#9ec7ff" },
  ],
  style: {
    bubbleScale: 70,
    xAxis: { lineColor: "#5d7f9d", gridColor: "#d8e3ea", labelColor: "#536171", labelFontSize: 8 },
    yAxis: { lineColor: "#b55638", gridColor: "#e6d6ca", gridDash: "dash", labelColor: "#536171", labelFontSize: 8 },
  },
};

const bubbleExportPages = createSectionPages([
  {
    title: "Bubble chart export should preserve a native PowerPoint chart",
    eyebrow: "Export quality",
    left: `
      <h1>Bubble chart export should preserve a native PowerPoint chart.</h1>
      <p class="lede">This fixture forces Studio's structured bubble chart contract through PPTX export so the XML inspector can verify a native bubble chart part.</p>
      ${chartSpecMarkup({ spec: bubbleExportSpec })}
    `,
    right: "",
  },
]);
const bubbleExportReport = createReport("Native bubble chart export fixture", bubbleExportPages);

const lineStyleExportSpec = {
  kind: "line",
  title: "Scenario confidence keeps style semantics inside the native chart",
  subtitle: "Native line style contract fixture",
  insight: "Two observed paths should stay solid while the stretch case exports as a dashed editable series with chart XML styling.",
  unit: "index",
  categories: ["Q1", "Q2", "Q3", "Q4", "Q5"],
  valueAxisMin: 40,
  valueAxisMax: 100,
  style: {
    yAxis: {
      lineColor: "#305c63",
      lineWidthPt: 1.4,
      gridColor: "#d8cfbc",
      gridWidthPt: 0.8,
      gridDash: "dash",
      labelColor: "#536171",
      labelFontSize: 8,
    },
    xAxis: {
      lineColor: "#305c63",
      lineWidthPt: 1.2,
      labelColor: "#536171",
      labelFontSize: 8,
    },
  },
  series: [
    {
      id: "baseline-line",
      label: "Baseline",
      values: [54, 59, 63, 68, 72],
      color: "#305c63",
      role: "line",
      axis: "primary",
      style: { lineDash: "solid", lineWidthPt: 2.4, marker: "circle" },
    },
    {
      id: "improved-line",
      label: "Improved",
      values: [57, 65, 72, 79, 86],
      color: "#b55638",
      role: "line",
      axis: "primary",
      style: { lineDash: "solid", lineWidthPt: 2.8, marker: "circle" },
    },
    {
      id: "stretch-line",
      label: "Stretch case",
      values: [50, 61, 70, 84, 94],
      color: "#7f9da1",
      role: "line",
      axis: "primary",
      style: {
        lineDash: "dash",
        lineWidthPt: 2.6,
        marker: "none",
        shadow: { color: "#000000", opacity: 0.18, blurPt: 4, offsetPt: 1, angle: 45 },
      },
    },
  ],
};

const lineStyleExportPages = createSectionPages([
  {
    title: "Line chart export should preserve native style contract",
    eyebrow: "Export quality",
    left: `
      <h1>Line chart export should preserve dash, axis, grid, and shadow styling.</h1>
      <p class="lede">This fixture forces per-series line styling and y-axis styling through the native PPTX chart XML path.</p>
      ${chartSpecMarkup({ spec: lineStyleExportSpec })}
    `,
    right: "",
  },
]);
const lineStyleExportReport = createReport("Native line style export fixture", lineStyleExportPages);

const textListExportPages = createSectionPages([
  {
    title: "Text list export should preserve paragraph rhythm and bullet semantics",
    eyebrow: "Export quality",
    left: `
      <h1>Text list export should preserve paragraph rhythm and bullet semantics.</h1>
      <p data-html-block-id="export-spaced-copy" data-html-block-kind="text" style="margin:24px 0 18px;font-size:24px;line-height:1.48;color:#253647;max-width:1080px;">This paragraph uses an intentionally roomy line height so PPTX export can prove that editable text retains spacing metadata instead of collapsing into PowerPoint defaults.</p>
      <ul data-html-block-id="export-bullet-list" data-html-block-kind="list" style="margin:18px 0 20px;padding-left:38px;font-size:19px;line-height:1.42;color:#253647;">
        <li>Keep the operating claim editable after export.</li>
        <li>Preserve readable spacing between evidence bullets.</li>
        <li>Retain a PowerPoint bullet marker instead of flattened text.</li>
      </ul>
      <ol data-html-block-id="export-numbered-list" data-html-block-kind="list" style="margin:16px 0 0;padding-left:42px;font-size:18px;line-height:1.34;color:#253647;">
        <li>Collect browser line-height.</li>
        <li>Write paragraph spacing into PPTX XML.</li>
        <li>Verify ordered list numbering in the package.</li>
      </ol>
    `,
    right: "",
  },
]);
const textListExportReport = createReport("Text list export fixture", textListExportPages);

const gradientShapeExportPages = createSectionPages([
  {
    title: "Gradient visual export should preserve fill fidelity with a native boundary",
    eyebrow: "Export quality",
    left: `
      <h1>Gradient visual export should preserve fill fidelity with a native boundary.</h1>
      <p class="lede">This fixture uses a real CSS linear gradient on a rounded visual object so PPTX export can preserve the visible fill while keeping an editable PowerPoint shape outline.</p>
      <div data-html-visual-id="gradient-shape-fixture" data-html-visual-kind="surface" data-html-fit-role="content" data-export-role="surface" data-export-fill="linear-gradient(to bottom right, rgba(32,211,255,0.78) 0%, rgba(208,143,115,0.84) 48%, rgba(93,127,157,0.94) 100%)" data-export-border="#2f5d84" data-export-border-width="2" data-export-radius="30" style="height:300px;margin-top:34px;border-radius:30px;border:2px solid #2f5d84;background:linear-gradient(to bottom right, rgba(32,211,255,0.78) 0%, rgba(208,143,115,0.84) 48%, rgba(93,127,157,0.94) 100%);box-shadow:0 22px 46px rgba(47,93,132,0.18);"></div>
    `,
    right: "",
  },
]);
const gradientShapeExportReport = createReport("Gradient shape export fixture", gradientShapeExportPages);

const visualFidelityExportPages = createSectionPages([
  {
    title: "Visual fidelity export should honor computed geometry color and type",
    eyebrow: "Export quality",
    left: `
      <h1 style="font-size:40px;line-height:1.08;">Visual fidelity export should honor computed geometry, color, and type.</h1>
      <p class="lede">This fixture intentionally supplies stale data-export values so PPTX export must prefer real computed styles for color, radius, and shape kind.</p>
      <div style="display:flex;gap:28px;align-items:center;margin-top:42px;">
        <div data-html-visual-id="fidelity-sharp-rect" data-html-visual-kind="surface" data-html-fit-role="content" data-export-role="surface" data-export-fill="#b55638" data-export-radius="28" style="width:220px;height:112px;background:#305c63;border:2px solid #b55638;border-radius:0;"></div>
        <div data-html-visual-id="fidelity-round-rect" data-html-visual-kind="surface" data-html-fit-role="content" data-export-role="surface" data-export-fill="#ffffff" data-export-border="#305c63" data-export-border-width="2" data-export-radius="22" style="width:220px;height:112px;background:#fcfaf6;border:2px solid #305c63;border-radius:22px;"></div>
        <div data-html-visual-id="fidelity-circle" data-html-visual-kind="surface" data-html-fit-role="content" data-export-role="surface" data-export-fill="#ffffff" data-export-radius="24" style="width:92px;height:92px;background:#d08f73;border-radius:50%;"></div>
      </div>
    `,
    right: "",
  },
]);
const visualFidelityExportReport = createReport("Visual fidelity export fixture", visualFidelityExportPages);

const nativeShapeExportPages = createSectionPages([
  {
    title: "Native visual shape export should preserve dividers rails and badges",
    eyebrow: "Export quality",
    left: `
      <h1>Native visual shape export should preserve dividers, rails, and badges.</h1>
      <p class="lede">This fixture intentionally omits visual ids on the divider and badge so export has to rely on semantic visual-kind annotations instead of editor-only ids.</p>
      <div data-html-visual-kind="divider" data-export-role="divider" data-export-fill="#2f5d84" style="height:3px;margin:34px 0 28px;background:#2f5d84;border-radius:999px;"></div>
      <div style="position:relative;height:280px;margin-top:10px;">
        <div data-html-visual-kind="rail" data-export-role="rail" data-export-fill="#20d3ff" style="position:absolute;left:24px;top:18px;width:4px;height:218px;background:#20d3ff;border-radius:999px;"></div>
        <div data-html-visual-kind="badge" data-export-role="badge" data-export-fill="#ffffff" data-export-border="#2f5d84" data-export-border-width="1.5" data-export-radius="18" style="position:absolute;left:64px;top:22px;width:260px;height:54px;border:1.5px solid #2f5d84;border-radius:18px;background:#ffffff;"></div>
      </div>
    `,
    right: "",
  },
]);
const nativeShapeExportReport = createReport("Native visual shape export fixture", nativeShapeExportPages);

const pressureComboSpec = {
  kind: "combo",
  title: "Pressure throughput and defect escape move on separate axes",
  subtitle: "Native combo chart with DOM preview primitives underneath",
  insight: "The visible chart must stay a PowerPoint chart while preview bars and lines are suppressed.",
  unit: "tickets",
  secondaryUnit: "%",
  categories: ["T-3", "T-2", "T-1", "Launch"],
  series: [
    {
      id: "pressure-volume",
      label: "Queue volume",
      values: [112, 94, 71, 49],
      color: "#2f5d84",
      role: "bar",
      axis: "primary",
    },
    {
      id: "pressure-quality",
      label: "Quality gate pass",
      values: [66, 72, 83, 91],
      color: "#b55638",
      role: "line",
      axis: "secondary",
    },
  ],
};

const pressureWaterfallSpec = {
  kind: "waterfall",
  title: "Launch risk bridge isolates moving parts",
  subtitle: "Native waterfall chart with absolute-positioned DOM bars",
  insight: "The bridge should export as chart data, not a pile of rectangles.",
  unit: "risk index",
  categories: ["Start", "Demand", "Ops", "Fixes", "End"],
  series: [
    {
      id: "pressure-risk",
      label: "Risk movement",
      values: [82, 21, 14, -29, 88],
      color: "#b55638",
      role: "bar",
      axis: "primary",
    },
  ],
};

const pressureBubbleSpec = {
  kind: "bubble",
  title: "Prioritization bubbles keep editable point data",
  subtitle: "Native bubble chart with absolute DOM bubbles suppressed",
  insight: "Point labels remain text; circles should belong to the chart.",
  xLabel: "Effort",
  yLabel: "Impact",
  sizeLabel: "Exposure",
  points: [
    { id: "p1", label: "A", x: 18, y: 82, size: 58, color: "#b55638" },
    { id: "p2", label: "B", x: 41, y: 62, size: 38, color: "#2f5d84" },
    { id: "p3", label: "C", x: 76, y: 42, size: 66, color: "#d08f73" },
    { id: "p4", label: "D", x: 31, y: 28, size: 28, color: "#7f9da1" },
  ],
  style: {
    bubbleScale: 70,
    xAxis: { lineColor: "#a99d8e", gridColor: "#e7ded2", labelColor: "#6c6258", labelFontSize: 8 },
    yAxis: { lineColor: "#a99d8e", gridColor: "#e7ded2", gridDash: "dash", labelColor: "#6c6258", labelFontSize: 8 },
  },
};

const pressureMatrixSpec = {
  kind: "matrix",
  title: "Decision matrix must stay shape-native, not table-native",
  subtitle: "Semantic matrix beside a real table",
  insight: "Only the operating grid on the right is allowed to become a PowerPoint table.",
  xLabel: "Implementation effort",
  yLabel: "Strategic leverage",
  xMinLabel: "Low effort",
  xMaxLabel: "High effort",
  yMinLabel: "Low leverage",
  yMaxLabel: "High leverage",
  plotBounds: { x: 0.08, y: 0.25, w: 0.68, h: 0.58 },
  quadrants: [
    { id: "q1", label: "Act", x: 0, y: 0, w: 0.5, h: 0.5, color: "#f3e2d9" },
    { id: "q2", label: "Sequence", x: 0.5, y: 0, w: 0.5, h: 0.5, color: "#e4eef0" },
    { id: "q3", label: "Observe", x: 0, y: 0.5, w: 0.5, h: 0.5, color: "#edf1e8" },
    { id: "q4", label: "Defer", x: 0.5, y: 0.5, w: 0.5, h: 0.5, color: "#f6eee2" },
  ],
  items: [
    { id: "m1", label: "Owner map", detail: "Fast lift", x: 0.1, y: 0.12, w: 0.3, h: 0.18, color: "#ffffff" },
    { id: "m2", label: "Policy gate", detail: "Governance load", x: 0.56, y: 0.13, w: 0.34, h: 0.2, color: "#ffffff" },
    { id: "m3", label: "Retry queue", detail: "Operational drag", x: 0.14, y: 0.62, w: 0.31, h: 0.18, color: "#ffffff" },
    { id: "m4", label: "Legacy shim", detail: "Slow burn", x: 0.58, y: 0.64, w: 0.31, h: 0.18, color: "#ffffff" },
  ],
  callout: {
    title: "Decision read",
    body: "Ship owner mapping first; sequence policy gates behind evidence.",
    x: 0.78,
    y: 0.3,
    w: 0.18,
    h: 0.24,
    color: "#fffaf3",
    borderColor: "#d7c8b9",
  },
};

function pressureSpecAttribute(spec) {
  return escapeHtml(JSON.stringify(spec));
}

function pressureChartPreview(kind) {
  if (kind === "waterfall") {
    return `
      <div style="position:relative;height:126px;border-bottom:2px solid #a99d8e;">
        <div style="position:absolute;left:20px;bottom:0;width:46px;height:64px;background:#2f5d84;"></div>
        <div style="position:absolute;left:92px;bottom:64px;width:46px;height:28px;background:#7f9da1;"></div>
        <div style="position:absolute;left:164px;bottom:92px;width:46px;height:20px;background:#d08f73;"></div>
        <div style="position:absolute;left:236px;bottom:56px;width:46px;height:36px;background:#b55638;"></div>
        <div style="position:absolute;left:308px;bottom:0;width:46px;height:88px;background:#2f5d84;"></div>
        <div style="position:absolute;left:67px;bottom:76px;width:24px;border-top:2px solid #9f9587;"></div>
        <div style="position:absolute;left:139px;bottom:104px;width:24px;border-top:2px solid #9f9587;"></div>
        <div style="position:absolute;left:211px;bottom:74px;width:24px;border-top:2px solid #9f9587;"></div>
      </div>
    `;
  }
  if (kind === "bubble") {
    return `
      <div style="position:relative;height:142px;border-left:2px solid #a99d8e;border-bottom:2px solid #a99d8e;background:linear-gradient(to right,transparent 49.5%,#e7ded2 49.5%,#e7ded2 50.5%,transparent 50.5%),linear-gradient(to bottom,transparent 49.5%,#e7ded2 49.5%,#e7ded2 50.5%,transparent 50.5%);">
        <div style="position:absolute;left:42px;top:18px;width:50px;height:50px;border-radius:50%;background:rgba(181,86,56,0.86);display:grid;place-items:center;color:#fff;font-weight:700;">A</div>
        <div style="position:absolute;left:146px;top:42px;width:36px;height:36px;border-radius:50%;background:rgba(47,93,132,0.84);display:grid;place-items:center;color:#fff;font-weight:700;">B</div>
        <div style="position:absolute;left:258px;top:70px;width:58px;height:58px;border-radius:50%;background:rgba(208,143,115,0.84);display:grid;place-items:center;color:#fff;font-weight:700;">C</div>
        <div style="position:absolute;left:96px;top:96px;width:30px;height:30px;border-radius:50%;background:rgba(127,157,161,0.9);display:grid;place-items:center;color:#fff;font-weight:700;">D</div>
      </div>
    `;
  }
  return `
    <svg viewBox="0 0 560 150" style="display:block;width:100%;height:150px;overflow:visible;">
      <line x1="24" y1="126" x2="536" y2="126" stroke="#d8cfbc" stroke-width="2" />
      <rect x="54" y="42" width="54" height="84" rx="10" fill="#2f5d84" opacity="0.82" />
      <rect x="178" y="58" width="54" height="68" rx="10" fill="#2f5d84" opacity="0.82" />
      <rect x="302" y="74" width="54" height="52" rx="10" fill="#2f5d84" opacity="0.82" />
      <rect x="426" y="92" width="54" height="34" rx="10" fill="#2f5d84" opacity="0.82" />
      <path d="M81 84 L205 76 L329 55 L453 34" fill="none" stroke="#b55638" stroke-width="5" stroke-linecap="round" />
      <circle cx="81" cy="84" r="7" fill="#b55638" />
      <circle cx="205" cy="76" r="7" fill="#b55638" />
      <circle cx="329" cy="55" r="7" fill="#b55638" />
      <circle cx="453" cy="34" r="7" fill="#b55638" />
    </svg>
  `;
}

function pressureChartModule({ id, spec, left, top, width, height, layer = "content" }) {
  return `
    <div data-html-visual-id="${id}" data-html-visual-kind="chart-frame" data-html-module-kind="chart" data-html-module-label="Chart" data-html-fit-role="content" data-html-chart-spec="${pressureSpecAttribute(spec)}" data-html-canvas-layer="${layer}" style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;background:#fcfaf6;border:1px solid #d8cfbc;border-radius:18px;padding:16px 18px;box-sizing:border-box;z-index:2;">
      <div data-html-block-id="${id}-title" data-html-block-kind="heading" data-html-fit-role="content" style="font-size:18px;line-height:1.18;font-weight:750;color:#1d303a;">${escapeHtml(spec.title)}</div>
      <div data-html-block-id="${id}-subtitle" data-html-block-kind="paragraph" data-html-fit-role="content" style="margin-top:5px;font-size:12px;line-height:1.35;color:#6c6258;">${escapeHtml(spec.subtitle)}</div>
      <div data-html-visual-id="${id}-plot" data-html-visual-kind="surface" data-export-role="surface" data-export-fill="#ffffff" data-export-border="#d8cfbc" data-export-border-width="1" style="position:relative;margin-top:12px;height:${Math.max(118, height - 92)}px;background:#fffaf3;border:1px solid #e3d8ca;border-radius:12px;padding:10px;overflow:hidden;">
        ${pressureChartPreview(spec.kind)}
      </div>
    </div>
  `;
}

const pressureTableMarkup = tableMarkup({
  columns: ["Gate", "Owner", "State", "Risk"],
  rows: [
    ["Chart XML parse", "Export", "Pass", "Low"],
    ["Layer order", "Renderer", "Watch", "High"],
    ["Matrix ownership", "Planner", "Pass", "Medium"],
    ["Table promotion", "Collector", "Pass", "Low"],
  ],
});

const pptxExportPressureReport = {
  title: "PPTX export extreme pressure fixture",
  html: buildReportDocument("PPTX export extreme pressure fixture", [
    `
      <section class="page" data-page-number="1" data-page-title="Native chart layer gauntlet" style="width:1600px;height:900px;position:relative;overflow:hidden;background:#f6f0e7;color:#1d303a;" data-page-bg="#f6f0e7" data-surface-fill="#fcfaf6" data-divider-color="#d8cfbc">
        <div data-html-canvas-overlay-root="background" data-html-canvas-layer="background" style="position:absolute;inset:0;pointer-events:none;z-index:0;">
          <div data-html-visual-id="pressure-p1-bg-slab" data-html-visual-kind="surface" data-export-role="surface" data-export-fill="#eadfce" style="position:absolute;left:56px;top:678px;width:1460px;height:44px;background:#eadfce;border-radius:22px;"></div>
          <div data-html-visual-id="pressure-p1-bg-rule" data-html-visual-kind="divider" data-export-role="divider" data-export-fill="#b55638" style="position:absolute;left:0;top:0;width:1600px;height:12px;background:#b55638;"></div>
        </div>
        <div data-html-block-id="pressure-p1-kicker" data-html-block-kind="eyebrow" data-html-fit-role="content" style="position:absolute;left:72px;top:54px;font-size:14px;letter-spacing:1.4px;text-transform:uppercase;font-weight:800;color:#8a7967;">Extreme export pressure</div>
        <div data-html-block-id="pressure-p1-title" data-html-block-kind="heading" data-html-fit-role="content" style="position:absolute;left:72px;top:82px;width:1180px;font-size:43px;line-height:1.08;font-weight:800;">Native charts must stay charts while DOM preview layers disappear</div>
        <div data-html-block-id="pressure-p1-body" data-html-block-kind="paragraph" data-html-fit-role="content" style="position:absolute;left:72px;top:180px;width:1100px;font-size:18px;line-height:1.36;color:#52616b;">This page stacks combo, waterfall, and bubble chart contracts with visible preview geometry, background overlays, a hidden duplicate placeholder, and a foreground label.</div>
        ${pressureChartModule({ id: "pressure-combo-chart", spec: pressureComboSpec, left: 72, top: 256, width: 860, height: 364 })}
        ${pressureChartModule({ id: "pressure-waterfall-chart", spec: pressureWaterfallSpec, left: 968, top: 236, width: 540, height: 270 })}
        ${pressureChartModule({ id: "pressure-bubble-chart", spec: pressureBubbleSpec, left: 968, top: 536, width: 540, height: 266 })}
        <div data-html-canvas-placeholder="true" data-html-canvas-placeholder-for="pressure-combo-chart" data-html-chart-spec="${pressureSpecAttribute(pressureComboSpec)}" style="position:absolute;left:110px;top:314px;width:520px;height:180px;visibility:hidden;pointer-events:none;">Hidden duplicate chart should never create a fourth chart frame</div>
        <div data-html-canvas-overlay-root="foreground" data-html-canvas-layer="foreground" style="position:absolute;inset:0;pointer-events:none;z-index:6;">
          <div data-html-visual-id="pressure-p1-foreground-badge" data-html-visual-kind="badge" data-export-role="badge" data-export-fill="#1d303a" data-export-border="#b55638" data-export-border-width="2" data-export-radius="16" style="position:absolute;left:1126px;top:154px;width:300px;height:48px;background:#1d303a;border:2px solid #b55638;border-radius:16px;"></div>
          <div data-html-block-id="pressure-p1-foreground-text" data-html-block-kind="heading" data-html-fit-role="content" style="position:absolute;left:1148px;top:168px;width:260px;font-size:15px;font-weight:800;color:#fffaf3;letter-spacing:.5px;">Escalation overlay stays on top</div>
        </div>
      </section>
    `,
    `
      <section class="page" data-page-number="2" data-page-title="Matrix table and text ownership gauntlet" style="width:1600px;height:900px;position:relative;overflow:hidden;background:#f7f3eb;color:#1d303a;" data-page-bg="#f7f3eb" data-surface-fill="#fcfaf6" data-divider-color="#d8cfbc">
        <div data-html-block-id="pressure-p2-title" data-html-block-kind="heading" data-html-fit-role="content" style="position:absolute;left:72px;top:58px;width:1180px;font-size:40px;line-height:1.1;font-weight:800;">Matrix, table, and filled containers all compete for ownership</div>
        <div data-html-block-id="pressure-p2-subtitle" data-html-block-kind="paragraph" data-html-fit-role="content" style="position:absolute;left:72px;top:118px;width:1160px;font-size:18px;line-height:1.36;color:#52616b;">The matrix is a chart-owned shape system; the operating grid is the only native table; filled cards must not emit concatenated parent text.</div>
        <div data-html-visual-id="pressure-matrix-module" data-html-visual-kind="chart-frame" data-html-module-kind="chart" data-html-module-label="Chart" data-html-fit-role="content" data-html-chart-spec="${pressureSpecAttribute(pressureMatrixSpec)}" style="position:absolute;left:72px;top:196px;width:840px;height:460px;background:#fcfaf6;border:1px solid #d8cfbc;border-radius:18px;padding:18px;box-sizing:border-box;">
          <div data-html-block-id="pressure-matrix-decoy-label" data-html-block-kind="heading" data-html-fit-role="content" style="font-size:17px;font-weight:800;color:#1d303a;">Decision matrix visual preview below must not become a table</div>
          <div style="position:relative;margin-top:18px;height:350px;background:linear-gradient(to right,transparent 49.5%,#e0d5c5 49.5%,#e0d5c5 50.5%,transparent 50.5%),linear-gradient(to bottom,transparent 49.5%,#e0d5c5 49.5%,#e0d5c5 50.5%,transparent 50.5%);border:1px solid #d8cfbc;border-radius:12px;">
            <div style="position:absolute;left:44px;top:48px;width:170px;height:74px;background:#fff;border:1px solid #d8cfbc;border-radius:12px;padding:12px;">Owner map</div>
            <div style="position:absolute;left:460px;top:56px;width:190px;height:78px;background:#fff;border:1px solid #d8cfbc;border-radius:12px;padding:12px;">Policy gate</div>
            <div style="position:absolute;left:76px;top:236px;width:170px;height:74px;background:#fff;border:1px solid #d8cfbc;border-radius:12px;padding:12px;">Retry queue</div>
            <div style="position:absolute;left:486px;top:242px;width:170px;height:74px;background:#fff;border:1px solid #d8cfbc;border-radius:12px;padding:12px;">Legacy shim</div>
          </div>
        </div>
        <div style="position:absolute;left:960px;top:196px;width:520px;">
          ${pressureTableMarkup}
        </div>
        <div data-html-visual-id="pressure-card-alpha" data-html-visual-kind="label-surface" data-export-role="label-surface" data-export-fill="#fcfaf6" data-export-border="#d8cfbc" data-export-border-width="1" data-export-radius="14" style="position:absolute;left:86px;top:700px;width:390px;height:118px;background:#fcfaf6;border:1px solid #d8cfbc;border-radius:14px;padding:18px;">
          <div data-html-block-id="pressure-card-alpha-title" data-html-block-kind="heading" data-html-fit-role="content" style="font-size:23px;font-weight:800;">Alpha containment</div>
          <div data-html-block-id="pressure-card-alpha-body" data-html-block-kind="paragraph" data-html-fit-role="content" style="margin-top:8px;font-size:15px;line-height:1.36;color:#52616b;">Parent fill exports as shape; child text remains single-source.</div>
        </div>
        <div data-html-visual-id="pressure-card-beta" data-html-visual-kind="label-surface" data-export-role="label-surface" data-export-fill="#1d303a" data-export-border="#b55638" data-export-border-width="1" data-export-radius="0" style="position:absolute;left:520px;top:700px;width:390px;height:118px;background:#1d303a;border:1px solid #b55638;padding:18px;color:#fffaf3;">
          <div data-html-block-id="pressure-card-beta-title" data-html-block-kind="heading" data-html-fit-role="content" style="font-size:23px;font-weight:800;">Beta containment</div>
          <div data-html-block-id="pressure-card-beta-body" data-html-block-kind="paragraph" data-html-fit-role="content" style="margin-top:8px;font-size:15px;line-height:1.36;color:#f1e7d7;">Dark parent must not cover its child text later in z-order.</div>
        </div>
        <div data-html-visual-id="pressure-card-gamma" data-html-visual-kind="label-surface" data-export-role="label-surface" data-export-fill="#d08f73" data-export-border="#9c5e45" data-export-border-width="1" data-export-radius="0" style="position:absolute;left:954px;top:700px;width:390px;height:118px;background:#d08f73;border:1px solid #9c5e45;padding:18px;color:#1d303a;">
          <div data-html-block-id="pressure-card-gamma-title" data-html-block-kind="heading" data-html-fit-role="content" style="font-size:23px;font-weight:800;">Gamma containment</div>
          <div data-html-block-id="pressure-card-gamma-body" data-html-block-kind="paragraph" data-html-fit-role="content" style="margin-top:8px;font-size:15px;line-height:1.36;">Filled parent text aggregation should be suppressed.</div>
        </div>
      </section>
    `,
    `
      <section class="page" data-page-number="3" data-page-title="Layer ordering and hidden placeholder gauntlet" style="width:1600px;height:900px;position:relative;overflow:hidden;background:#f5efe4;color:#1d303a;" data-page-bg="#f5efe4" data-surface-fill="#fcfaf6" data-divider-color="#d8cfbc">
        <div data-html-canvas-overlay-root="background" data-html-canvas-layer="background" data-html-canvas-layer-order="0" style="position:absolute;inset:0;pointer-events:none;z-index:0;">
          <div data-html-visual-id="pressure-z-bg-slab" data-html-visual-kind="surface" data-export-role="surface" data-export-fill="#e3d5c0" style="position:absolute;left:62px;top:692px;width:1458px;height:38px;background:#e3d5c0;border-radius:19px;"></div>
          <div data-html-visual-id="pressure-z-bg-panel" data-html-visual-kind="surface" data-export-role="surface" data-export-fill="#fffaf3" data-export-border="#d8cfbc" data-export-border-width="1" style="position:absolute;left:74px;top:214px;width:760px;height:390px;background:#fffaf3;border:1px solid #d8cfbc;border-radius:18px;"></div>
        </div>
        <div data-html-block-id="pressure-p3-title" data-html-block-kind="heading" data-html-fit-role="content" style="position:absolute;left:72px;top:58px;width:1080px;font-size:42px;line-height:1.1;font-weight:800;">Background layers, foreground badges, and hidden placeholders must not reorder the page</div>
        <div data-html-block-id="pressure-p3-copy" data-html-block-kind="paragraph" data-html-fit-role="content" style="position:absolute;left:72px;top:156px;width:1180px;font-size:18px;line-height:1.4;color:#52616b;">The export plan should keep background shapes behind content, foreground audit stamps above content, and hidden placeholders out of text and shape collectors.</div>
        <div data-html-visual-id="pressure-p3-primary-card" data-html-visual-kind="surface" data-export-role="surface" data-export-fill="#fcfaf6" data-export-border="#d8cfbc" data-export-border-width="1" style="position:absolute;left:106px;top:252px;width:680px;height:286px;background:#fcfaf6;border:1px solid #d8cfbc;border-radius:16px;padding:24px;">
          <div data-html-block-id="pressure-p3-primary-title" data-html-block-kind="heading" data-html-fit-role="content" style="font-size:30px;line-height:1.1;font-weight:800;">Visible content remains above the background panel</div>
          <div data-html-block-id="pressure-p3-primary-body" data-html-block-kind="paragraph" data-html-fit-role="content" style="margin-top:18px;font-size:18px;line-height:1.48;color:#52616b;">This copy intentionally sits inside a filled surface while a larger background panel is underneath. Export order should preserve the visible reading order.</div>
        </div>
        <div data-html-canvas-placeholder="true" data-html-canvas-placeholder-for="pressure-hidden-copy" style="position:absolute;left:128px;top:332px;width:420px;height:80px;visibility:hidden;pointer-events:none;">Hidden placeholder text must not leak into PowerPoint text runs.</div>
        <div data-html-canvas-overlay-root="foreground" data-html-canvas-layer="foreground" data-html-canvas-layer-order="2" style="position:absolute;inset:0;pointer-events:none;z-index:7;">
          <div data-html-visual-id="pressure-z-foreground-stamp" data-html-visual-kind="badge" data-export-role="badge" data-export-fill="#b55638" data-export-border="#1d303a" data-export-border-width="2" data-export-radius="18" style="position:absolute;left:1210px;top:118px;width:270px;height:58px;background:#b55638;border:2px solid #1d303a;border-radius:18px;"></div>
          <div data-html-block-id="pressure-z-foreground-text" data-html-block-kind="heading" data-html-fit-role="content" style="position:absolute;left:1234px;top:136px;width:228px;font-size:16px;font-weight:900;color:#fffaf3;">Foreground audit stamp</div>
        </div>
      </section>
    `,
  ]),
  pageCount: 3,
  pageTitles: [
    "Native chart layer gauntlet",
    "Matrix table and text ownership gauntlet",
    "Layer ordering and hidden placeholder gauntlet",
  ],
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createStreamEvents(report, scenarioId, stageLabel = "Building deck") {
  const runId = `fixture-${scenarioId}`;
  const pageMarkup = report.html.match(/<section class="page[\s\S]*?<\/section>/g) ?? [];
  return [
    { type: "run_started", runId },
    {
      type: "stage_started",
      runId,
      stage: "planning",
      label: stageLabel,
      expectedPageCount: report.pageCount,
      pageTitles: report.pageTitles,
    },
    {
      type: "assistant_chunk",
      runId,
      stage: "planning",
      content: `Fixture scenario ${scenarioId} is composing ${report.pageCount} pages.`,
    },
    {
      type: "stage_started",
      runId,
      stage: "pages",
      label: "Rendering pages",
      expectedPageCount: report.pageCount,
      pageTitles: report.pageTitles,
    },
    ...report.pageTitles.flatMap((pageTitle, index) => [
      {
        type: "page_started",
        runId,
        pageNumber: index + 1,
        pageTitle,
      },
      {
        type: "page_ready",
        runId,
        pageNumber: index + 1,
        pageTitle,
        pageHtml: pageMarkup[index] ?? "",
      },
    ]),
    {
      type: "stage_started",
      runId,
      stage: "finalizing",
      label: "Finalizing deck",
      expectedPageCount: report.pageCount,
      pageTitles: report.pageTitles,
    },
    {
      type: "final_report",
      runId,
      model: "fixture-model",
      report,
    },
  ];
}

const scenarioMap = {
  "standard-3page-ops": {
    id: "standard-3page-ops",
    prompt:
      "Create a 3-page executive deck on why an outpatient clinic network is still congested even after adding more clinicians.",
    report: standardReport,
    reviseReports: [],
  },
  "chart-first-3page": {
    id: "chart-first-3page",
    prompt:
      "Create a 3-page board deck with a chart-led second page and dense right-hand explanation.",
    report: chartFirstReport,
    reviseReports: [],
  },
  "hero-3page-chip": {
    id: "hero-3page-chip",
    prompt:
      "Create a 3-page executive deck on a next-generation AI chip system, with one explicit 3D cutaway concept page on page 1.",
    report: heroReport,
    reviseReports: [],
  },
  "hero-3page-chip-explicit": {
    id: "hero-3page-chip-explicit",
    prompt:
      "Create a 3-page executive deck on a next-generation AI chip system, with one explicit 3D cutaway concept page on page 1.",
    report: heroReport,
    reviseReports: [],
  },
  "architecture-3page-no-hero": {
    id: "architecture-3page-no-hero",
    prompt:
      "Create a 3-page executive deck on a next-generation AI chip system architecture and business impact, but keep it professional and restrained.",
    report: architectureNoHeroReport,
    reviseReports: [],
  },
  "single-claim-3page": {
    id: "single-claim-3page",
    prompt:
      "Create a fixed 3-page executive deck where each page makes one claim with minimal support and no extra filler modules.",
    report: singleClaimReport,
    reviseReports: [],
  },
  "dense-semantic-review": {
    id: "dense-semantic-review",
    prompt:
      "Create a 3-page executive deck on throughput constraints, but leave page 1 overloaded enough that review should simplify it before editing.",
    report: denseSemanticReport,
    reviseReports: [denseSemanticRepairedReport],
  },
  "title-only-review": {
    id: "title-only-review",
    prompt:
      "Create a 3-page executive deck on clinic throughput, but leave page 1 with a prompt-leak title that deterministic review should clean up locally.",
    report: titleOnlyReport,
    reviseReports: [titleOnlyRepairedReport],
  },
  "iframe-opening-closing-selection": {
    id: "iframe-opening-closing-selection",
    prompt:
      "Create a 3-page executive deck with one opening title page and a decorative closing strip so iframe editing can be tested against PPT-like behavior.",
    report: iframeParityReport,
    reviseReports: [],
  },
  "matrix-nested-visual-selection": {
    id: "matrix-nested-visual-selection",
    prompt:
      "Create a 1-page platform matrix with nested cards so iframe visual selection can verify that only the inner cards become editable objects.",
    report: matrixNestedVisualReport,
    reviseReports: [],
  },
  "overflow-auto-repair": {
    id: "overflow-auto-repair",
    prompt:
      "Create a 3-page executive deck on clinic throughput and leave page 2 genuinely overflowing so auto-repair must fix it.",
    report: overflowRepairReport,
    reviseReports: [overflowRepairRepairedReport],
  },
  "mixed-hard-and-title-review": {
    id: "mixed-hard-and-title-review",
    prompt:
      "Create a 3-page executive deck where page 1 only has a leaked title and page 2 has a real overflow, so only the overflow page should go through AI repair.",
    report: mixedRepairReport,
    reviseReports: [mixedRepairRepairedReport],
  },
  "second-pass-no-improvement": {
    id: "second-pass-no-improvement",
    prompt:
      "Create a 3-page executive deck where the first auto-repair pass still leaves page 2 badly overflowing without measurable progress.",
    report: overflowRepairReport,
    reviseReports: [secondPassStillBrokenReport],
  },
  "case-study-3page": {
    id: "case-study-3page",
    prompt:
      "Create a 3-page case study deck about a warehouse release-timing intervention. Keep it as a case narrative, not a leadership recommendation memo.",
    report: caseStudyReport,
    reviseReports: [],
  },
  "shipping-robotics-case-study-2page": {
    id: "shipping-robotics-case-study-2page",
    prompt:
      "2 page ppt for case-study of application of Robotic in Shipping ```{ As the cornerstone of global trade, the shipping industry handles over 80% of international trade volume, making its operational efficiency, safety, and sustainability critically important to global economic stability and development. For a long time, the traditional shipping industry has relied heavily on manual labor, facing multiple challenges such as harsh working environments, high labor intensity, continuously rising human resource costs, and frequent safety accidents caused by human error. According to the International Maritime Organization (IMO), 80% to 90% of maritime accidents are directly or indirectly related to unsafe human behaviors or decision-making errors [1]. At the same time, the global shipping industry is confronting increasingly stringent environmental regulations and intense market competition. This report will first comprehensively review the various technological forms and core principles of robotics applications in the current shipping industry. }```",
    report: shippingRoboticsCaseStudyReport,
    reviseReports: [],
  },
  "academic-research-3page": {
    id: "academic-research-3page",
    prompt:
      "Create a 3-page academic research presentation about a reranking experiment, with a research question, method and result, then interpretation and next work.",
    report: academicResearchReport,
    reviseReports: [],
  },
  "academic-neural-network-3page": {
    id: "academic-neural-network-3page",
    prompt:
      "Create a 3-page scientific presentation on a neural-network reranking experiment, with a research question, one method-and-result figure page, then interpretation and next work.",
    report: academicNeuralNetworkReport,
    reviseReports: [],
  },
  "valuation-deep-1page": {
    id: "valuation-deep-1page",
    prompt: "1 page Top Ibank level Codex Product Valuation",
    report: valuationDeepLaneReport,
    reviseReports: [],
  },
  "architecture-review-3page": {
    id: "architecture-review-3page",
    prompt:
      "Create a 3-page technical architecture review of a retrieval serving stack, with one dominant system judgment, one explicit constraint, and restrained annotations.",
    report: architectureReviewReport,
    reviseReports: [],
  },
  "research-readout-2page": {
    id: "research-readout-2page",
    prompt:
      "Create a 2-page research result readout on long-context retrieval degradation, with one result page and one method-bound interpretation page.",
    report: researchReadoutReport,
    reviseReports: [],
  },
  "longform-10page": {
    id: "longform-10page",
    prompt:
      "Create a 10-page operating storyline deck with balanced evidence and appendix pages.",
    report: longformReport,
    reviseReports: [],
  },
  "mckinsey-chart-target-1page": {
    id: "mckinsey-chart-target-1page",
    prompt:
      "Create a 1-page McKinsey-style chart demonstration with line, waterfall, and bubble matrix charts.",
    report: mckinseyChartTargetReport,
    reviseReports: [],
  },
  "exported-mckinsey-chart-regression-1page": {
    id: "exported-mckinsey-chart-regression-1page",
    prompt:
      "Load the exported one-page McKinsey chart regression fixture.",
    report: exportedMckinseyChartRegressionReport,
    reviseReports: [],
  },
  "observed-facts-q1-regression-3page": {
    id: "observed-facts-q1-regression-3page",
    prompt:
      "Load the observed facts Q1 2026 regression fixture.",
    report: observedFactsQ1RegressionReport,
    reviseReports: [],
  },
  "text-ownership-regression-1page": {
    id: "text-ownership-regression-1page",
    prompt:
      "Create a 1-page PPTX export regression fixture with filled card containers and child text blocks.",
    report: textOwnershipRegressionReport,
    reviseReports: [],
  },
  "table-export-1page": {
    id: "table-export-1page",
    prompt:
      "Create a 1-page export-quality fixture with a structured operating comparison table.",
    report: tableExportReport,
    reviseReports: [],
  },
  "svg-line-export-1page": {
    id: "svg-line-export-1page",
    prompt:
      "Create a 1-page export-quality fixture with an unstructured SVG line chart.",
    report: svgLineExportReport,
    reviseReports: [],
  },
  "div-waterfall-export-1page": {
    id: "div-waterfall-export-1page",
    prompt:
      "Create a 1-page export-quality fixture with a div-built waterfall chart.",
    report: divWaterfallExportReport,
    reviseReports: [],
  },
  "bubble-matrix-export-1page": {
    id: "bubble-matrix-export-1page",
    prompt:
      "Create a 1-page export-quality fixture with a small div-built bubble matrix chart.",
    report: bubbleMatrixExportReport,
    reviseReports: [],
  },
  "tesla-quadrant-export-1page": {
    id: "tesla-quadrant-export-1page",
    prompt:
      "Create a 1-page export-quality fixture with a Tesla-style quadrant matrix and clipped overflow shapes.",
    report: teslaQuadrantExportReport,
    reviseReports: [],
  },
  "combo-export-1page": {
    id: "combo-export-1page",
    prompt:
      "Create a 1-page export-quality fixture with a structured combo chart.",
    report: comboExportReport,
    reviseReports: [],
  },
  "bubble-export-1page": {
    id: "bubble-export-1page",
    prompt:
      "Create a 1-page export-quality fixture with a structured bubble chart that exports natively.",
    report: bubbleExportReport,
    reviseReports: [],
  },
  "line-style-export-1page": {
    id: "line-style-export-1page",
    prompt:
      "Create a 1-page export-quality fixture with a structured line chart that carries native chart style contract fields.",
    report: lineStyleExportReport,
    reviseReports: [],
  },
  "text-list-export-1page": {
    id: "text-list-export-1page",
    prompt:
      "Create a 1-page export-quality fixture with spaced paragraphs, bullets, and numbered list text.",
    report: textListExportReport,
    reviseReports: [],
  },
  "gradient-shape-export-1page": {
    id: "gradient-shape-export-1page",
    prompt:
      "Create a 1-page export-quality fixture with a rounded gradient visual surface.",
    report: gradientShapeExportReport,
    reviseReports: [],
  },
  "visual-fidelity-export-1page": {
    id: "visual-fidelity-export-1page",
    prompt:
      "Create a 1-page export-quality fixture that intentionally uses stale export attributes and visible computed styles.",
    report: visualFidelityExportReport,
    reviseReports: [],
  },
  "native-shape-export-1page": {
    id: "native-shape-export-1page",
    prompt:
      "Create a 1-page export-quality fixture with native divider rail and badge visual shapes.",
    report: nativeShapeExportReport,
    reviseReports: [],
  },
  "pptx-extreme-pressure-3page": {
    id: "pptx-extreme-pressure-3page",
    prompt:
      "Load the 3-page PPTX export extreme pressure fixture with native charts, matrix, table, ownership, z-order, and hidden placeholder traps.",
    report: pptxExportPressureReport,
    reviseReports: [],
  },
  "freeform-edit-export": {
    id: "freeform-edit-export",
    prompt:
      "Create a 3-page executive deck on clinic throughput constraints with a strong evidence page.",
    report: singleClaimReport,
    reviseReports: [],
  },
  "optimize-3page-ops": {
    id: "optimize-3page-ops",
    prompt:
      "Create a 3-page executive deck on clinic throughput constraints and leave page 2 ready for manual optimize.",
    report: singleClaimReport,
    reviseReports: [singleClaimOptimizedReport],
  },
};

export function listScenarios() {
  return Object.keys(scenarioMap);
}

export function getScenario(id) {
  const scenario = scenarioMap[id];
  if (!scenario) {
    throw new Error(`Unknown stability scenario: ${id}`);
  }
  return deepClone(scenario);
}

export function buildGenerateEventsForScenario(id) {
  const scenario = getScenario(id);
  return createStreamEvents(scenario.report, scenario.id);
}

export function buildReviseEventsForScenario(id, reviseIndex = 0) {
  const scenario = getScenario(id);
  const revisedReport =
    scenario.reviseReports[reviseIndex] ??
    scenario.reviseReports[scenario.reviseReports.length - 1] ??
    scenario.report;
  return createStreamEvents(revisedReport, `${scenario.id}-revise-${reviseIndex + 1}`, "Repairing deck");
}

export function buildNdjson(events) {
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}
