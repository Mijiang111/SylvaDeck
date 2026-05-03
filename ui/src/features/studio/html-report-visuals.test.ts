import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStableVisualFallbackId,
  diagnoseIframeObjectBoundarySignals,
  extractHtmlVisualStructure,
  normalizeIframeSnapshotBoundary,
  shouldRejectIframeBackgroundObjectCandidate,
  shouldCountIframeObjectAnchorRoot,
  shouldRejectIframeFullPageChromeCandidate,
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

test("full-page anchor roots remain selectable unless they look like chrome", () => {
  assert.equal(
    shouldRejectIframeFullPageChromeCandidate({
      areaRatio: 1,
      isObjectAnchor: true,
      hasExplicitPaint: true,
      hasOwnVisibleText: false,
      hasVisibleContent: true,
      looksLikeLayoutShell: false,
      pointerEventsNone: false,
      opacity: 1,
    }),
    false,
  );

  assert.equal(
    shouldRejectIframeFullPageChromeCandidate({
      areaRatio: 1,
      isObjectAnchor: true,
      hasExplicitPaint: false,
      hasOwnVisibleText: false,
      hasVisibleContent: true,
      looksLikeLayoutShell: false,
      pointerEventsNone: false,
      opacity: 1,
    }),
    false,
  );

  assert.equal(
    shouldRejectIframeFullPageChromeCandidate({
      areaRatio: 1,
      isObjectAnchor: true,
      hasExplicitPaint: false,
      hasOwnVisibleText: false,
      hasVisibleContent: false,
      looksLikeLayoutShell: true,
      pointerEventsNone: false,
      opacity: 1,
    }),
    true,
  );
});

test("non-anchor full-page chrome and transparent scaffolds are rejected without DOMParser", () => {
  assert.equal(
    shouldRejectIframeFullPageChromeCandidate({
      areaRatio: 1,
      isObjectAnchor: false,
      hasExplicitPaint: true,
      hasOwnVisibleText: true,
      hasVisibleContent: true,
      looksLikeLayoutShell: false,
      pointerEventsNone: false,
      opacity: 1,
    }),
    true,
  );

  assert.equal(
    shouldRejectIframeBackgroundObjectCandidate({
      areaRatio: 0.8,
      isObjectAnchor: false,
      hasExplicitPaint: false,
      hasOwnVisibleText: false,
      hasVisibleContent: false,
      looksLikeLayoutShell: false,
      pointerEventsNone: false,
      opacity: 1,
    }),
    true,
  );

  assert.equal(
    shouldRejectIframeBackgroundObjectCandidate({
      areaRatio: 0.5,
      isObjectAnchor: false,
      hasExplicitPaint: false,
      hasOwnVisibleText: false,
      hasVisibleContent: false,
      looksLikeLayoutShell: false,
      pointerEventsNone: false,
      opacity: 1,
    }),
    false,
  );
});

test("nested duplicate object anchors do not count as ambiguous roots", () => {
  assert.equal(
    shouldCountIframeObjectAnchorRoot({
      objectId: "p1-chart",
      parentObjectId: "p1-chart",
    }),
    false,
  );
  assert.equal(
    shouldCountIframeObjectAnchorRoot({
      objectId: "p1-chart",
      parentObjectId: "p1-other",
    }),
    true,
  );
});

test("iframe object boundary diagnostics catch missing snapshot roots and ownership leaks", () => {
  assert.equal(normalizeIframeSnapshotBoundary("object-root"), "object-root");
  assert.equal(normalizeIframeSnapshotBoundary("unknown"), null);
  assert.deepEqual(
    diagnoseIframeObjectBoundarySignals({
      isObjectAnchor: true,
      objectId: "p1-chart",
      exportObjectKind: "chart-visual",
      renderTarget: "visual-snapshot",
      objectRole: "primary",
      studioSlot: "primary-visual",
      areaRatio: 0.22,
      hasVisibleContent: true,
      hasExplicitPaint: true,
      snapshotBoundary: "",
      chartVisualHasModule: true,
    }),
    ["iframe-snapshot-root-missing"],
  );
  assert.deepEqual(
    diagnoseIframeObjectBoundarySignals({
      isObjectAnchor: true,
      objectId: "p1-note",
      parentObjectId: "p1-chart",
      objectRole: "annotation",
      studioSlot: "annotation",
      areaRatio: 0.02,
      hasVisibleContent: true,
      hasExplicitPaint: true,
    }),
    ["iframe-annotation-ownership-leak"],
  );
});

test("iframe object boundary diagnostics preserve anchored full-canvas visuals", () => {
  assert.deepEqual(
    diagnoseIframeObjectBoundarySignals({
      isObjectAnchor: true,
      objectId: "p1-hero",
      exportObjectKind: "diagram",
      renderTarget: "html-visual",
      objectRole: "primary",
      studioSlot: "primary-visual",
      snapshotBoundary: "object-root",
      areaRatio: 1,
      hasVisibleContent: true,
      hasExplicitPaint: true,
      looksLikeLayoutShell: true,
    }),
    [],
  );
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

domParserTest("painted annotation rails with nested text remain movable content containers", () => {
  const structure = extractHtmlVisualStructure({
    html: `<!DOCTYPE html><html><body>
      <section class="page">
        <aside style="position:absolute;right:82px;top:250px;width:278px;height:494px;border-radius:26px;background:rgba(251,253,255,0.88);box-shadow:0 20px 48px rgba(29,68,94,0.10);padding:28px;box-sizing:border-box;">
          <div>Compact annotation</div>
          <div>The bottleneck is operational, not technical</div>
          <div style="margin-top:26px;padding:16px 18px;border-radius:18px;background:#eef5f9;">
            <div>Why the gap persists</div>
            <div>AI can improve tasks, but margin only moves when work between tasks is redesigned.</div>
          </div>
        </aside>
      </section>
    </body></html>`,
  });

  const page = structure.pages[0];
  assert.ok(page);
  const rail = page.nodes.find((node) => node.sourceTag === "aside");

  assert.ok(rail);
  assert.equal(rail.fitParticipation, "content");
  assert.equal(rail.atomizationRole, "container");
});

domParserTest("object roots expose meaningful internal visual parts", () => {
  const structure = extractHtmlVisualStructure({
    html: `<!DOCTYPE html><html><body>
      <section class="page">
        <main
          data-export-object-id="p1-primary-diagram"
          data-export-object-kind="diagram"
          data-object-role="primary"
          data-studio-slot="primary-visual"
          data-render-target="editable-shapes"
          data-snapshot-boundary="object-root"
          style="position:absolute;left:80px;top:140px;width:920px;height:520px;background:#fff;border:1px solid #d8e5ef;"
        >
          <div style="position:absolute;left:60px;top:80px;width:220px;height:120px;border-radius:18px;background:#f4f8fb;border:1px solid #c8d9e6;">
            <div>Demand migration</div>
          </div>
          <svg viewBox="0 0 920 520" style="position:absolute;inset:0;width:100%;height:100%;">
            <rect x="360" y="80" width="220" height="120" rx="18" fill="#fff4e8" stroke="#d2a56a"></rect>
            <line x1="280" y1="140" x2="360" y2="140" stroke="#7d95a8" stroke-width="3"></line>
            <polygon points="360,140 348,132 348,148" fill="#7d95a8"></polygon>
          </svg>
        </main>
      </section>
    </body></html>`,
  });

  const nodes = structure.pages[0]?.nodes ?? [];
  assert.equal(nodes.some((node) => node.exportObjectId === "p1-primary-diagram"), true);
  assert.equal(nodes.some((node) => node.sourcePath === "0.0" && node.kind === "surface"), true);
  assert.equal(nodes.some((node) => node.sourceTag === "rect" && node.kind === "shape"), true);
  assert.equal(nodes.some((node) => node.sourceTag === "line" && node.kind === "connector"), true);
  assert.equal(nodes.some((node) => node.sourceTag === "polygon" && node.kind === "shape"), true);
});

domParserTest("extractHtmlVisualStructure reports Phase 5 iframe quality diagnostics", () => {
  const structure = extractHtmlVisualStructure({
    html: `<!DOCTYPE html><html><body>
      <section class="page">
        <figure
          data-export-object-id="p1-chart"
          data-export-object-kind="chart-visual"
          data-render-target="visual-snapshot"
          data-object-role="primary"
          data-studio-slot="primary-visual"
          style="position:absolute;left:120px;top:100px;width:720px;height:420px;background:#fff;border:1px solid #ddd;"
        >
          <svg viewBox="0 0 720 420"><rect x="20" y="20" width="200" height="160"></rect></svg>
        </figure>
        <aside
          data-export-object-id="p1-source"
          data-export-object-kind="text"
          data-object-role="source"
          data-studio-slot="source-note"
          style="position:absolute;left:80px;top:820px;width:520px;height:24px;overflow:hidden;font-size:18px;"
        >
          Source: this source note is intentionally much too long for the tiny clipped frame and should be reported as overflow.
        </aside>
      </section>
    </body></html>`,
  });

  const diagnostics = structure.pages[0]?.objectDiagnostics ?? [];
  assert.equal(
    diagnostics.some((diagnostic) => diagnostic.code === "iframe-snapshot-root-missing" && diagnostic.objectId === "p1-chart"),
    true,
  );
  assert.equal(
    diagnostics.some((diagnostic) => diagnostic.code === "iframe-text-overflow" && diagnostic.objectId === "p1-source"),
    true,
  );
});

domParserTest("semantic contract roots such as main become visual root nodes", () => {
  const structure = extractHtmlVisualStructure({
    html: `<!DOCTYPE html><html><body>
      <section class="page">
        <main
          data-studio-object-id="p1-primary-visual"
          data-export-object-id="p1-primary-visual"
          data-export-object-kind="diagram"
          data-object-role="primary"
          data-studio-slot="primary-visual"
          data-render-target="editable-shapes"
          data-snapshot-boundary="object-root"
        >
          <h2>System view</h2>
          <p>Owned child copy</p>
          <div>Layer 1</div>
          <div>Layer 2</div>
          <div>Layer 3</div>
          <div>Layer 4</div>
          <div>Layer 5</div>
          <div>Layer 6</div>
          <div>Layer 7</div>
        </main>
      </section>
    </body></html>`,
  });

  const page = structure.pages[0];
  assert.ok(page);
  const root = page.nodes.find((node) => node.exportObjectId === "p1-primary-visual");

  assert.ok(root);
  assert.equal(root.sourceTag, "main");
  assert.equal(root.isContractRoot, true);
  assert.equal(root.studioSlot, "primary-visual");
});

domParserTest("hidden snapshot placeholders do not participate in object ownership", () => {
  const structure = extractHtmlVisualStructure({
    html: `<!DOCTYPE html><html><body>
      <section class="page">
        <div
          data-export-object-id="p1-hidden-matrix"
          data-export-object-kind="matrix"
          data-render-target="editable-shapes"
          data-snapshot-boundary="object-root"
          data-html-canvas-placeholder="true"
          style="position:absolute;left:100px;top:100px;width:800px;height:520px;visibility:hidden;pointer-events:none;"
        >
          <svg viewBox="0 0 800 520"><rect x="0" y="0" width="800" height="520"></rect></svg>
        </div>
      </section>
    </body></html>`,
  });

  const diagnostics = structure.pages[0]?.objectDiagnostics ?? [];
  assert.equal(
    diagnostics.some((diagnostic) => diagnostic.code === "iframe-hidden-placeholder-anchor" && diagnostic.objectId === "p1-hidden-matrix"),
    true,
  );
  assert.equal(
    diagnostics.some((diagnostic) => diagnostic.code === "iframe-snapshot-blank" && diagnostic.objectId === "p1-hidden-matrix"),
    false,
  );
});

domParserTest("hidden duplicate placeholders do not make a real object root ambiguous", () => {
  const structure = extractHtmlVisualStructure({
    html: `<!DOCTYPE html><html><body>
      <section class="page">
        <main
          data-export-object-id="p1-primary-diagram"
          data-export-object-kind="diagram"
          data-object-role="primary"
          data-studio-slot="primary-visual"
          data-render-target="editable-shapes"
          data-ownership-scope="text,shape,svg"
          data-snapshot-boundary="object-root"
          style="position:absolute;left:80px;top:90px;width:900px;height:520px;border:1px solid #ddd;"
        >
          <svg viewBox="0 0 900 520"><text x="80" y="80">Operating model</text></svg>
        </main>
        <div
          data-export-object-id="p1-primary-diagram"
          data-html-canvas-placeholder="true"
          style="visibility:hidden;pointer-events:none;"
        ></div>
      </section>
    </body></html>`,
  });

  const diagnostics = structure.pages[0]?.objectDiagnostics ?? [];
  assert.equal(
    diagnostics.some((diagnostic) => diagnostic.code === "iframe-object-ambiguous-root" && diagnostic.objectId === "p1-primary-diagram"),
    false,
  );
  assert.equal(
    diagnostics.some((diagnostic) => diagnostic.code === "iframe-hidden-placeholder-anchor" && diagnostic.objectId === "p1-primary-diagram"),
    true,
  );
});

domParserTest("raw chart-visual svg text without a chart module trips editable visual quality gates", () => {
  const structure = extractHtmlVisualStructure({
    html: `<!DOCTYPE html><html><body>
      <section class="page">
        <main
          data-export-object-id="p1-primary-chart"
          data-export-object-kind="chart-visual"
          data-object-role="primary"
          data-studio-slot="primary-visual"
          data-render-target="visual-snapshot"
          data-ownership-scope="shape,svg"
          data-snapshot-boundary="object-root"
          style="position:absolute;left:80px;top:90px;width:900px;height:520px;border:1px solid #ddd;"
        >
          <svg viewBox="0 0 900 520"><text x="80" y="80">Revenue bridge</text></svg>
        </main>
      </section>
    </body></html>`,
  });

  const diagnostics = structure.pages[0]?.objectDiagnostics ?? [];
  assert.equal(
    diagnostics.some((diagnostic) => diagnostic.code === "chart-visual-module-missing" && diagnostic.objectId === "p1-primary-chart"),
    true,
  );
  assert.equal(
    diagnostics.some((diagnostic) => diagnostic.code === "primary-visual-text-facet-missing" && diagnostic.objectId === "p1-primary-chart"),
    false,
  );
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

domParserTest("div-built bar roots can be upgraded into editable chart modules", () => {
  const structure = extractHtmlVisualStructure({
    html: `<!DOCTYPE html><html><body>
      <section class="page">
        <div style="position:relative;width:860px;height:420px;background:#fff;border:1px solid #d9e5ef;">
          <div style="position:absolute;left:36px;top:24px;font-size:18px;font-weight:700;">Revenue bar chart</div>
          <div style="position:absolute;left:80px;bottom:48px;width:70px;height:90px;background:#305c63;"></div>
          <div style="position:absolute;left:210px;bottom:48px;width:70px;height:150px;background:#305c63;"></div>
          <div style="position:absolute;left:340px;bottom:48px;width:70px;height:210px;background:#305c63;"></div>
          <div style="position:absolute;left:95px;bottom:14px;font-size:13px;">2024</div>
          <div style="position:absolute;left:225px;bottom:14px;font-size:13px;">2025</div>
          <div style="position:absolute;left:355px;bottom:14px;font-size:13px;">2026</div>
          <div style="position:absolute;left:92px;top:250px;font-size:13px;">90</div>
          <div style="position:absolute;left:222px;top:190px;font-size:13px;">150</div>
          <div style="position:absolute;left:350px;top:130px;font-size:13px;">210</div>
        </div>
      </section>
    </body></html>`,
  });

  const page = structure.pages[0];
  assert.ok(page);
  const chartNode = page.nodes.find((node) => node.moduleKind === "chart");

  assert.ok(chartNode);
  assert.equal(chartNode?.chartSpec?.kind, "bar");
  if (chartNode?.chartSpec?.kind === "bar") {
    assert.deepEqual(chartNode.chartSpec.categories, ["2024", "2025", "2026"]);
    assert.deepEqual(chartNode.chartSpec.series[0]?.values, [90, 150, 210]);
  }
});

domParserTest("table-like grids without table intent stay visual surfaces", () => {
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

  assert.equal(tableNode, undefined);
});

domParserTest("explicit table-intent grids become editable table modules", () => {
  const structure = extractHtmlVisualStructure({
    html: `<!DOCTYPE html><html><body>
      <section class="page">
        <div data-export-role="table" style="position:relative;width:1160px;height:420px;background:#fff;border:1px solid #d9e5ef;">
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
