import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStableVisualFallbackId,
  extractHtmlVisualStructure,
} from "./html-report-visuals";

const domParserTest = typeof DOMParser === "undefined" ? test.skip : test;

test("stable visual fallback ids do not depend on candidate order", () => {
  const signature =
    "surface|article|surface-card|children:h3|p|text-tags:h3|p|ancestors:page-primary/page-body";

  const first = buildStableVisualFallbackId({
    pageNumber: 2,
    kind: "surface",
    signature,
  });
  const second = buildStableVisualFallbackId({
    pageNumber: 2,
    kind: "surface",
    signature,
  });

  assert.equal(first, second);
  assert.match(first, /^visual-2-surface-[a-z0-9]+$/);
});

test("stable visual fallback ids only add ordinal suffixes for true signature duplicates", () => {
  const signature =
    "surface|article|surface-card|children:h3|p|text-tags:h3|p|ancestors:page-secondary/page-body";

  const primary = buildStableVisualFallbackId({
    pageNumber: 1,
    kind: "surface",
    signature,
    duplicateOrdinal: 0,
  });
  const duplicate = buildStableVisualFallbackId({
    pageNumber: 1,
    kind: "surface",
    signature,
    duplicateOrdinal: 1,
  });

  assert.notEqual(primary, duplicate);
  assert.equal(duplicate, `${primary}-2`);
});

domParserTest("nested matrix shells downgrade to scaffold while inner cards stay leaf-primary", () => {
  const structure = extractHtmlVisualStructure({
    html: `<!DOCTYPE html><html><body>
      <section class="page">
        <div class="matrix-shell">
          <div class="matrix-axis-h"></div>
          <div class="matrix-axis-v"></div>
          <article class="surface-card matrix-card matrix-card-top-left"><h3>Cloud</h3></article>
          <article class="surface-card matrix-card matrix-card-top-right"><h3>AI</h3></article>
        </div>
      </section>
    </body></html>`,
  });

  const page = structure.pages[0];
  assert.ok(page);
  const shell = page.nodes.find((node) => node.sourceTag === "div" && node.sourcePath === "0");
  const cards = page.nodes.filter((node) => node.sourceTag === "article");

  assert.equal(shell?.atomizationRole, "scaffold");
  assert.ok(cards.length >= 2);
  cards.forEach((node) => {
    assert.equal(node.atomizationRole, "leaf");
    assert.equal(node.selectionPriority, "primary");
  });
});

domParserTest("svg primitives become atomized connector and node visuals", () => {
  const structure = extractHtmlVisualStructure({
    html: `<!DOCTYPE html><html><body>
      <section class="page">
        <div class="scientific-diagram-shell" data-html-module-kind="scientific-diagram">
          <svg viewBox="0 0 100 100">
            <line x1="10" y1="20" x2="80" y2="20"></line>
            <path d="M 10 40 C 30 10, 60 10, 80 40"></path>
            <circle cx="20" cy="60" r="8"></circle>
            <rect x="50" y="50" width="20" height="20"></rect>
          </svg>
        </div>
      </section>
    </body></html>`,
  });

  const page = structure.pages[0];
  assert.ok(page);
  assert.ok(page.nodes.some((node) => node.kind === "connector" && node.atomizationRole === "leaf"));
  assert.ok(page.nodes.some((node) => node.kind === "node" && node.atomizationRole === "leaf"));
  assert.ok(page.nodes.some((node) => node.kind === "shape" && node.atomizationRole === "leaf"));
});

domParserTest("explicit export charts are preserved as editable chart modules", () => {
  const structure = extractHtmlVisualStructure({
    html: `<!DOCTYPE html><html><body>
      <section class="page">
        <div data-export-chart='{"kind":"bar","title":"Capacity","unit":"GW","categories":["NA","EU"],"series":[{"name":"Capacity","values":[42,31]}]}' style="position:relative;">
          <svg viewBox="0 0 400 240">
            <rect x="40" y="80" width="80" height="120"></rect>
            <rect x="180" y="110" width="80" height="90"></rect>
          </svg>
        </div>
      </section>
    </body></html>`,
  });

  const page = structure.pages[0];
  assert.ok(page);
  const chartNode = page.nodes.find((node) => node.moduleKind === "chart");

  assert.ok(chartNode);
  assert.equal(chartNode?.kind, "chart-frame");
  assert.equal(chartNode?.atomizationRole, "leaf");
  assert.equal(chartNode?.selectionPriority, "primary");
  assert.equal(chartNode?.chartSpec?.kind, "bar");
  assert.equal(chartNode?.chartSpec?.presentation?.version, 2);
  assert.equal(chartNode?.chartSpec?.series.length, 1);
  assert.equal(page.nodes.some((node) => node.sourceTag === "svg"), false);
});

domParserTest("bubble-like figure roots can be upgraded into editable chart modules", () => {
  const structure = extractHtmlVisualStructure({
    html: `<!DOCTYPE html><html><body>
      <section class="page">
        <div style="position:relative;width:1150px;height:500px;background:#fff;border:1px solid #d9e5ef;">
          <div style="position:absolute;left:72px;top:80px;font-size:15px;font-weight:700;">Bubble chart</div>
          <div style="position:absolute;left:780px;top:450px;font-size:13px;">Utilization</div>
          <div style="position:absolute;left:30px;top:120px;font-size:13px;">90</div>
          <div style="position:absolute;left:30px;top:320px;font-size:13px;">60</div>
          <div style="position:absolute;left:260px;top:438px;font-size:13px;">70%</div>
          <div style="position:absolute;left:560px;top:438px;font-size:13px;">85%</div>
          <div style="position:absolute;left:860px;top:438px;font-size:13px;">95%</div>
          <div style="position:absolute;left:280px;top:220px;width:82px;height:82px;border-radius:50%;background:#9cb6cb;"></div>
          <div style="position:absolute;left:510px;top:130px;width:130px;height:130px;border-radius:50%;background:#20d3ff;"></div>
          <div style="position:absolute;left:790px;top:190px;width:104px;height:104px;border-radius:50%;background:#8fa9be;"></div>
          <div style="position:absolute;left:198px;top:208px;font-size:15px;font-weight:700;">Regional challengers</div>
          <div style="position:absolute;left:468px;top:108px;font-size:15px;font-weight:700;">Scaled specialists</div>
          <div style="position:absolute;left:918px;top:178px;font-size:15px;font-weight:700;">Hyperscale cloud</div>
        </div>
      </section>
    </body></html>`,
  });

  const page = structure.pages[0];
  assert.ok(page);
  const chartNode = page.nodes.find((node) => node.moduleKind === "chart");

  assert.ok(chartNode);
  assert.equal(chartNode?.chartSpec?.kind, "bubble");
  if (chartNode?.chartSpec?.kind === "bubble") {
    assert.equal(chartNode.chartSpec.points.length, 3);
  }
});

domParserTest("strong table-like grids become editable table modules", () => {
  const structure = extractHtmlVisualStructure({
    html: `<!DOCTYPE html><html><body>
      <section class="page">
        <div style="position:relative;width:1160px;height:420px;background:#fff;border:1px solid #d9e5ef;">
          <div style="position:absolute;left:24px;top:24px;font-size:13px;font-weight:700;">Operator</div>
          <div style="position:absolute;left:320px;top:24px;font-size:13px;font-weight:700;">Capacity</div>
          <div style="position:absolute;left:520px;top:24px;font-size:13px;font-weight:700;">Margin</div>
          <div style="position:absolute;left:720px;top:24px;font-size:13px;font-weight:700;">Lead time</div>
          <div style="position:absolute;left:24px;top:108px;font-size:24px;font-weight:700;">Hyperscaler</div>
          <div style="position:absolute;left:24px;top:136px;font-size:13px;">Cloud + platform stack</div>
          <div style="position:absolute;left:320px;top:112px;font-size:28px;font-weight:700;">8.4 GW</div>
          <div style="position:absolute;left:520px;top:112px;font-size:28px;font-weight:700;">41%</div>
          <div style="position:absolute;left:720px;top:112px;font-size:28px;font-weight:700;">5 mo</div>
          <div style="position:absolute;left:24px;top:196px;font-size:24px;font-weight:700;">Enterprise colo</div>
          <div style="position:absolute;left:24px;top:224px;font-size:13px;">Interconnect layer</div>
          <div style="position:absolute;left:320px;top:200px;font-size:28px;font-weight:700;">2.8 GW</div>
          <div style="position:absolute;left:520px;top:200px;font-size:28px;font-weight:700;">18%</div>
          <div style="position:absolute;left:720px;top:200px;font-size:28px;font-weight:700;">8 mo</div>
        </div>
      </section>
    </body></html>`,
  });

  const page = structure.pages[0];
  assert.ok(page);
  const tableNode = page.nodes.find((node) => node.moduleKind === "table");

  assert.ok(tableNode);
  assert.equal(tableNode?.kind, "surface");
  assert.equal(tableNode?.atomizationRole, "leaf");
  assert.equal(tableNode?.tableSpec?.rows.length, 2);
  assert.equal(tableNode?.tableSpec?.columns.length, 4);
});
