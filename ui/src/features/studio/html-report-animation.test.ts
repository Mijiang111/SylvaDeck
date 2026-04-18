import test from "node:test";
import assert from "node:assert/strict";
import {
  findHtmlAnimationPage,
  normalizeHtmlAnimationStructure,
} from "./html-report-animation";

test("normalizeHtmlAnimationStructure keeps only effects that target real anchors", () => {
  const normalized = normalizeHtmlAnimationStructure(
    {
      pages: [
        {
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
              {
                anchor: "ghost",
                preset: "fade-in",
                delayMs: 80,
                durationMs: 640,
                order: 1,
              },
            ],
            loopEffects: [
              {
                kind: "rotate",
                anchor: "dial",
                durationMs: 1800,
              },
              {
                kind: "ticker",
                anchor: "ghost",
                items: ["A", "B"],
                stepMs: 420,
              },
            ],
          },
        },
      ],
    },
    { pageCount: 1 },
  );

  assert.deepEqual(normalized, {
    pages: [
      {
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
              durationMs: 1800,
              direction: "clockwise",
              angleDeg: undefined,
            },
          ],
        },
      },
    ],
  });
  assert.deepEqual(findHtmlAnimationPage(normalized, 1), normalized?.pages[0] ?? null);
});

test("normalizeHtmlAnimationStructure returns undefined for empty animation payloads", () => {
  assert.equal(normalizeHtmlAnimationStructure(undefined), undefined);
  assert.equal(normalizeHtmlAnimationStructure({ pages: [] }), undefined);
});
