import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSanitizedFinalReport,
  composeDeterministicPageSection,
  extractHtmlDocument,
  extractPageTitles,
  validateGeneratedPageHtml,
} from "./render.js";
import { getDeckStyleProfile } from "../industry-style.js";
import type { PageRecipe } from "./contracts.js";

function buildSinglePageHtml(sectionBody: string) {
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    "<title>Revenue moat</title>",
    "</head>",
    "<body>",
    `<section class="page" data-page-number="1" data-page-title="Revenue moat" style="width:1600px;height:900px;">${sectionBody}</section>`,
    "</body>",
    "</html>",
  ].join("");
}

function buildRecorderManifest(overrides?: Record<string, unknown>) {
  return {
    version: 1,
    startMode: "entry-then-loop",
    entryTracks: [
      {
        anchor: "recorder-wheel",
        preset: "scale-in",
        delayMs: 120,
        durationMs: 720,
        order: 0,
      },
      {
        anchor: "signal-word",
        preset: "fade-up",
        delayMs: 260,
        durationMs: 680,
        order: 1,
      },
    ],
    loopEffects: [
      {
        kind: "rotate",
        anchor: "recorder-wheel",
        durationMs: 2800,
        direction: "clockwise",
      },
      {
        kind: "ticker",
        anchor: "signal-word",
        items: ["SIGNAL", "ARCHIVE", "TRACE"],
        stepMs: 960,
      },
      {
        kind: "pulse",
        anchor: "status-light",
        durationMs: 1400,
        scaleFrom: 0.92,
        scaleTo: 1.08,
        opacityFrom: 0.35,
        opacityTo: 1,
      },
      {
        kind: "orbit",
        anchor: "orbit-accent",
        durationMs: 2400,
        radiusPx: 12,
        axis: "xy",
      },
    ],
    ...overrides,
  };
}

function buildRecorderAnimationSection(manifest: Record<string, unknown>) {
  return [
    '<h1 data-anim-anchor="signal-word">Archive the signal</h1>',
    '<div data-anim-anchor="recorder-wheel">Wheel</div>',
    '<div data-anim-anchor="status-light">Light</div>',
    '<div data-anim-anchor="orbit-accent">Accent</div>',
    '<template data-studio-animation-manifest>',
    JSON.stringify(manifest),
    "</template>",
  ].join("");
}

test("validateGeneratedPageHtml rejects generation meta-copy leaks", () => {
  assert.throws(
    () =>
      validateGeneratedPageHtml({
        html: buildSinglePageHtml(
          [
            "<h1>Revenue moat</h1>",
            "<p>The page thesis argues that the setup is attractive.</p>",
            "<p>Illustrative trajectory of the supplied page thesis; no additional metrics are introduced.</p>",
          ].join(""),
        ),
        expectedPageNumber: 1,
        expectedPageTitle: "Revenue moat",
      }),
    /workspace scaffolding.*generation meta-copy/i,
  );
});

function buildRecipeWithTwoCharts(): PageRecipe {
  const densityBudget = {
    maxMajorRegions: 2,
    maxSupportBullets: 2,
    maxEvidenceBullets: 2,
    maxParagraphCharacters: 150,
    maxListItemCharacters: 84,
    maxListItemsPerList: 2,
    allowRightRail: true,
    allowFooterRail: false,
  };

  return {
    pageNumber: 1,
    pageTitle: "Margin and mix",
    pageIntent: "Explain margin recovery and segment mix.",
    objective: "Show the two drivers behind operating performance.",
    insight: "Margin recovery is broadening while mix remains uneven.",
    pageClass: "proof-analysis",
    densityBudget,
    compositionHint: "Use a consulting two-chart exhibit.",
    compositionPreset: "hero-sidecar",
    layout: "chart-insight",
    chartPriority: "required",
    evidenceIds: ["bridge"],
    evidenceBundle: [],
    heroClaim: "Margin recovery has two visible drivers.",
    supportBullets: [],
    evidenceBullets: [],
    takeaway: "Use the bridge as the main proof and mix as the context.",
    moduleBinding: null,
    chartSpec: {
      kind: "waterfall",
      categories: ["Start", "Volume", "Cost", "End"],
      series: [{ name: "Bridge", values: [0.4, 0.8, -0.3, 0.9] }],
      unit: "$bn",
      title: "Operating income bridge",
      insight: "Volume more than offsets cost pressure.",
      confidence: 0.82,
      fallbackMode: "annotation",
      sourceEvidenceIds: ["bridge"],
      composite: "annotation-rail",
      chartPreset: "margin-bridge",
      density: "hero",
    },
    secondaryChartSpec: {
      kind: "stacked",
      categories: ["Q1", "Q2"],
      series: [
        { name: "Automotive", values: [16.2, 16.7] },
        { name: "Services", values: [3.7, 3.9] },
      ],
      unit: "$bn",
      title: "Revenue mix",
      insight: "Services expands its contribution.",
      confidence: 0.8,
      fallbackMode: "metric-strip",
      sourceEvidenceIds: ["mix"],
      composite: "annotation-rail",
      chartPreset: "segment-mix",
      density: "sidecar",
    },
    diagramSpec: null,
    fallbackReason: null,
  };
}

test("composeDeterministicPageSection renders two editable consulting chart modules", () => {
  const html = composeDeterministicPageSection(
    buildRecipeWithTwoCharts(),
    getDeckStyleProfile("general-consulting"),
  );

  assert.equal((html.match(/data-html-chart-spec="/g) ?? []).length, 2);
  assert.match(html, /data-html-composition-preset="hero-sidecar"/);
  assert.match(html, /data-chart-exhibit-preset="margin-bridge"/);
  assert.match(html, /data-chart-exhibit-preset="segment-mix"/);
  assert.match(html, /data-chart-density="sidecar"/);
});

test("consulting and finance deterministic sections use square rectangular surfaces", () => {
  for (const profileId of ["general-consulting", "finance"] as const) {
    const html = composeDeterministicPageSection(
      buildRecipeWithTwoCharts(),
      getDeckStyleProfile(profileId),
    );

    assert.doesNotMatch(html, /border-radius:(?!0px|999px)\d+px/);
    assert.doesNotMatch(html, /rx="(?:4|13)"/);
    assert.match(html, /border-radius:0px/);
    assert.match(html, /border-radius:999px/);
  }
});

test("extractHtmlDocument keeps the full HTML document when surrounded by extra text", () => {
  const html = buildSinglePageHtml("<h1>Revenue moat</h1>");
  const wrapped = [
    "Notes before the document",
    "Literal stray token </html> in prose",
    html,
    "Trailing commentary after the document",
  ].join("\n");

  assert.equal(extractHtmlDocument(wrapped), html);
});

test("extractHtmlDocument ignores stray closing tags inside the wrapped body text", () => {
  const html = buildSinglePageHtml("<pre>Literal stray </html> token inside a code example</pre>");
  const wrapped = [
    "Notes before the document",
    html,
    "Trailing commentary after the document",
  ].join("\n");

  assert.equal(extractHtmlDocument(wrapped), html);
});

test("extractHtmlDocument ignores stray closing tags in trailing commentary", () => {
  const html = buildSinglePageHtml("<h1>Revenue moat</h1>");
  const wrapped = [
    "Notes before the document",
    html,
    "Trailing commentary mentioning </html> as literal text",
  ].join("\n");

  assert.equal(extractHtmlDocument(wrapped), html);
});

test("extractPageTitles scans page sections without regex backtracking", () => {
  const html = [
    "<!DOCTYPE html>",
    "<html>",
    "<body>",
    '<section class="hero" data-page-title="Ignore me"></section>',
    '<section data-note="a > b" class="cover page featured" data-page-title="Intro"></section>',
    "<section class='page detail' data-page-title='Appendix'></section>",
    "</body>",
    "</html>",
  ].join("");

  assert.deepEqual(extractPageTitles(html), ["Intro", "Appendix"]);
});

test("validateGeneratedPageHtml rejects animation metadata outside animated preview mode", () => {
  const html = buildSinglePageHtml(
    '<h1>Revenue moat</h1><div data-anim-role="hero" data-anim-enter="fade-up" data-anim-delay="0" data-anim-duration="640" data-anim-order="0">Hero</div>',
  );

  assert.throws(
    () =>
      validateGeneratedPageHtml({
        html,
        expectedPageNumber: 1,
        expectedPageTitle: "Revenue moat",
        htmlOutputMode: "static",
      }),
    /animation metadata outside animated preview mode/i,
  );
});

test("validateGeneratedPageHtml accepts allowed animation metadata in animated preview mode", () => {
  const html = buildSinglePageHtml(
    '<h1>Revenue moat</h1><div data-anim-role="hero" data-anim-enter="fade-up" data-anim-delay="0" data-anim-duration="640" data-anim-order="0">Hero</div>',
  );

  const result = validateGeneratedPageHtml({
    html,
    expectedPageNumber: 1,
    expectedPageTitle: "Revenue moat",
    htmlOutputMode: "animated-preview-js",
  });

  assert.equal(result.pageTitle, "Revenue moat");
  assert.match(result.sectionHtml, /data-anim-role="hero"/);
});

test("validateGeneratedPageHtml accepts common timing units in animated preview mode", () => {
  const html = buildSinglePageHtml(
    '<h1>Revenue moat</h1><div data-anim-role="hero" data-anim-enter="fade-up" data-anim-delay="80ms" data-anim-duration="0.64s" data-anim-order="0">Hero</div>',
  );

  const result = validateGeneratedPageHtml({
    html,
    expectedPageNumber: 1,
    expectedPageTitle: "Revenue moat",
    htmlOutputMode: "animated-preview-js",
  });

  assert.equal(result.pageTitle, "Revenue moat");
  assert.match(result.sectionHtml, /data-anim-duration="0.64s"/);
});

test("validateGeneratedPageHtml extracts page animation manifests and strips template markup", () => {
  const html = buildSinglePageHtml(buildRecorderAnimationSection(buildRecorderManifest()));

  const result = validateGeneratedPageHtml({
    html,
    expectedPageNumber: 1,
    expectedPageTitle: "Revenue moat",
    htmlOutputMode: "animated-preview-js",
  });

  assert.equal(result.pageTitle, "Revenue moat");
  assert.ok(!result.sectionHtml.includes("data-studio-animation-manifest"));
  assert.ok(!result.pageHtml.includes("data-studio-animation-manifest"));
  assert.deepEqual(result.animationPage, {
    pageNumber: 1,
    anchors: ["signal-word", "recorder-wheel", "status-light", "orbit-accent"],
    manifest: {
      version: 1,
      startMode: "entry-then-loop",
      entryTracks: [
        {
          anchor: "recorder-wheel",
          preset: "scale-in",
          delayMs: 120,
          durationMs: 720,
          order: 0,
        },
        {
          anchor: "signal-word",
          preset: "fade-up",
          delayMs: 260,
          durationMs: 680,
          order: 1,
        },
      ],
      loopEffects: [
        {
          kind: "rotate",
          anchor: "recorder-wheel",
          durationMs: 2800,
          direction: "clockwise",
        },
        {
          kind: "ticker",
          anchor: "signal-word",
          items: ["SIGNAL", "ARCHIVE", "TRACE"],
          stepMs: 960,
        },
        {
          kind: "pulse",
          anchor: "status-light",
          durationMs: 1400,
          scaleFrom: 0.92,
          scaleTo: 1.08,
          opacityFrom: 0.35,
          opacityTo: 1,
        },
        {
          kind: "orbit",
          anchor: "orbit-accent",
          durationMs: 2400,
          radiusPx: 12,
          axis: "xy",
        },
      ],
    },
  });
});

test("validateGeneratedPageHtml normalizes safe manifest near-misses", () => {
  const html = buildSinglePageHtml(
    buildRecorderAnimationSection({
      entryTracks: [
        {
          anchor: "recorder-wheel",
          preset: "scale-in",
          delayMs: "120",
          durationMs: "720",
          order: "0",
        },
      ],
      loopEffects: [
        {
          kind: "rotate",
          anchor: "recorder-wheel",
          durationMs: "2800",
          direction: "clockwise",
        },
      ],
    }),
  );

  const result = validateGeneratedPageHtml({
    html,
    expectedPageNumber: 1,
    expectedPageTitle: "Revenue moat",
    htmlOutputMode: "animated-preview-js",
  });

  assert.deepEqual(result.animationPage?.manifest, {
    version: 1,
    startMode: "entry-then-loop",
    entryTracks: [
      {
        anchor: "recorder-wheel",
        preset: "scale-in",
        delayMs: 120,
        durationMs: 720,
        order: 0,
      },
    ],
    loopEffects: [
      {
        kind: "rotate",
        anchor: "recorder-wheel",
        durationMs: 2800,
        direction: "clockwise",
      },
    ],
  });
});

test("validateGeneratedPageHtml drops malformed manifest items but keeps valid survivors", () => {
  const html = buildSinglePageHtml(
    buildRecorderAnimationSection({
      version: 1,
      startMode: "entry-then-loop",
      entryTracks: [
        {
          anchor: "recorder-wheel",
          preset: "scale-in",
          delayMs: 120,
          durationMs: 720,
          order: 0,
        },
        {
          anchor: "signal-word",
          preset: "spin-in",
          delayMs: 260,
          durationMs: 680,
          order: 1,
        },
      ],
      loopEffects: [
        {
          kind: "rotate",
          anchor: "recorder-wheel",
          durationMs: 2800,
        },
        {
          kind: "ticker",
          anchor: "signal-word",
          items: ["SIGNAL"],
          stepMs: "fast",
        },
      ],
    }),
  );

  const result = validateGeneratedPageHtml({
    html,
    expectedPageNumber: 1,
    expectedPageTitle: "Revenue moat",
    htmlOutputMode: "animated-preview-js",
  });

  assert.deepEqual(result.animationPage?.manifest, {
    version: 1,
    startMode: "entry-then-loop",
    entryTracks: [
      {
        anchor: "recorder-wheel",
        preset: "scale-in",
        delayMs: 120,
        durationMs: 720,
        order: 0,
      },
    ],
    loopEffects: [
      {
        kind: "rotate",
        anchor: "recorder-wheel",
        durationMs: 2800,
      },
    ],
  });
});

test("validateGeneratedPageHtml rejects animation manifest anchors missing from the page", () => {
  const html = buildSinglePageHtml(
    [
      '<h1 data-anim-anchor="headline">Revenue moat</h1>',
      '<template data-studio-animation-manifest>',
      JSON.stringify({
        version: 1,
        startMode: "entry-then-loop",
        loopEffects: [
          {
            kind: "rotate",
            anchor: "missing-anchor",
            durationMs: 1600,
          },
        ],
      }),
      "</template>",
    ].join(""),
  );

  assert.throws(
    () =>
      validateGeneratedPageHtml({
        html,
        expectedPageNumber: 1,
        expectedPageTitle: "Revenue moat",
        htmlOutputMode: "animated-preview-js",
      }),
    /missing anchor: missing-anchor/i,
  );
});

test("validateGeneratedPageHtml rejects unsupported animation loop kinds with a specific error", () => {
  const html = buildSinglePageHtml(
    buildRecorderAnimationSection({
      version: 1,
      startMode: "entry-then-loop",
      loopEffects: [
        {
          kind: "sparkle",
          anchor: "recorder-wheel",
          durationMs: 1600,
        },
      ],
    }),
  );

  assert.throws(
    () =>
      validateGeneratedPageHtml({
        html,
        expectedPageNumber: 1,
        expectedPageTitle: "Revenue moat",
        htmlOutputMode: "animated-preview-js",
      }),
    /unsupported animation loop kind: sparkle/i,
  );
});

test("validateGeneratedPageHtml rejects invalid manifest anchors with a specific error", () => {
  const html = buildSinglePageHtml(
    buildRecorderAnimationSection({
      version: 1,
      startMode: "entry-then-loop",
      loopEffects: [
        {
          kind: "rotate",
          anchor: "Recorder Wheel",
          durationMs: 1600,
        },
      ],
    }),
  );

  assert.throws(
    () =>
      validateGeneratedPageHtml({
        html,
        expectedPageNumber: 1,
        expectedPageTitle: "Revenue moat",
        htmlOutputMode: "animated-preview-js",
      }),
    /invalid animation anchor: Recorder Wheel/i,
  );
});

test("validateGeneratedPageHtml rejects non-json animation manifests", () => {
  const html = buildSinglePageHtml(
    [
      '<h1 data-anim-anchor="signal-word">Archive the signal</h1>',
      '<template data-studio-animation-manifest>this is not json</template>',
    ].join(""),
  );

  assert.throws(
    () =>
      validateGeneratedPageHtml({
        html,
        expectedPageNumber: 1,
        expectedPageTitle: "Revenue moat",
        htmlOutputMode: "animated-preview-js",
      }),
    /invalid animation manifest json/i,
  );
});

test("validateGeneratedPageHtml preserves only surviving repair-time loop effects", () => {
  const html = buildSinglePageHtml(
    '<h1 data-anim-anchor="dial">Revenue moat</h1><div data-anim-anchor="dial">Dial</div>',
  );

  const result = validateGeneratedPageHtml({
    html,
    expectedPageNumber: 1,
    expectedPageTitle: "Revenue moat",
    htmlOutputMode: "animated-preview-js",
    previousAnimationPage: {
      pageNumber: 1,
      anchors: ["dial", "letters"],
      manifest: {
        version: 1,
        startMode: "entry-then-loop",
        loopEffects: [
          {
            kind: "rotate",
            anchor: "dial",
            durationMs: 1600,
            direction: "clockwise",
          },
          {
            kind: "ticker",
            anchor: "letters",
            items: ["A", "B"],
            stepMs: 420,
          },
        ],
      },
    },
  });

  assert.deepEqual(result.animationPage, {
    pageNumber: 1,
    anchors: ["dial"],
    manifest: {
      version: 1,
      startMode: "entry-then-loop",
      loopEffects: [
        {
          kind: "rotate",
          anchor: "dial",
          durationMs: 1600,
          direction: "clockwise",
        },
      ],
    },
  });
});

test("buildSanitizedFinalReport preserves htmlOutputMode", () => {
  const html = buildSinglePageHtml("<h1>Revenue moat</h1><p>Keep one strong claim per page.</p>");
  const report = buildSanitizedFinalReport({
    html,
    brief: "Create an animated preview page about a revenue moat.",
    fallbackTitle: "Revenue moat",
    htmlOutputMode: "animated-preview-js",
  });

  assert.equal(report.htmlOutputMode, "animated-preview-js");
});

test("buildSanitizedFinalReport preserves animationStructure", () => {
  const html = buildSinglePageHtml("<h1 data-anim-anchor=\"dial\">Revenue moat</h1>");
  const report = buildSanitizedFinalReport({
    html,
    brief: "Create an animated preview page about a revenue moat.",
    fallbackTitle: "Revenue moat",
    htmlOutputMode: "animated-preview-js",
    animationStructure: {
      pages: [
        {
          pageNumber: 1,
          anchors: ["dial"],
          manifest: {
            version: 1,
            startMode: "entry-then-loop",
            loopEffects: [
              {
                kind: "rotate",
                anchor: "dial",
                durationMs: 1600,
                direction: "clockwise",
              },
            ],
          },
        },
      ],
    },
  });

  assert.deepEqual(report.animationStructure, {
    pages: [
      {
        pageNumber: 1,
        anchors: ["dial"],
        manifest: {
          version: 1,
          startMode: "entry-then-loop",
          loopEffects: [
            {
              kind: "rotate",
              anchor: "dial",
              durationMs: 1600,
              direction: "clockwise",
            },
          ],
        },
      },
    ],
  });
});
