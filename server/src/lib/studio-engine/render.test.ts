import test from "node:test";
import assert from "node:assert/strict";
import { buildSanitizedFinalReport, validateGeneratedPageHtml } from "./render.js";

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
  const html = buildSinglePageHtml(
    [
      '<h1 data-anim-anchor="headline">Revenue moat</h1>',
      '<div data-anim-anchor="dial">Dial</div>',
      '<template data-studio-animation-manifest>',
      JSON.stringify({
        version: 1,
        startMode: "entry-then-loop",
        entryTracks: [
          {
            anchor: "headline",
            preset: "fade-up",
            delayMs: 0,
            durationMs: 640,
            order: 0,
          },
        ],
        loopEffects: [
          {
            kind: "rotate",
            anchor: "dial",
            durationMs: 1600,
          },
        ],
      }),
      "</template>",
    ].join(""),
  );

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
    anchors: ["headline", "dial"],
    manifest: {
      version: 1,
      startMode: "entry-then-loop",
      entryTracks: [
        {
          anchor: "headline",
          preset: "fade-up",
          delayMs: 0,
          durationMs: 640,
          order: 0,
        },
      ],
      loopEffects: [
        {
          kind: "rotate",
          anchor: "dial",
          durationMs: 1600,
        },
      ],
    },
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
