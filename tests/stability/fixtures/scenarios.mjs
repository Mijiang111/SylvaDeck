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
