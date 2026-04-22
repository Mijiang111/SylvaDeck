import test from "node:test";
import assert from "node:assert/strict";
import { inferRequestedHtmlPageCount } from "./page-count";
import {
  applyDeterministicTitleRepairToReport,
  consumeStudioStreamResponse,
  didPageReviewImprove,
  resolvePageReviewDecision,
  resolveGenerationIntent,
  type PageFitMeasurement,
  type StudioGenerateStreamEvent,
} from "./generation";

function createMeasurement(overrides = {}) {
  return {
    pageNumber: 1,
    scrollHeight: 900,
    clientHeight: 900,
    scrollWidth: 1600,
    clientWidth: 1600,
    overflowX: false,
    overflowY: false,
    semanticModuleCount: 0,
    textCharacterCount: 0,
    chartRegionCount: 0,
    dominantOverflowRegion: "mixed-density",
    footerHeight: 0,
    rightRailHeight: 0,
    longestBlockHeight: 0,
    topLevelRegions: [],
    suspectElements: [],
    compositionFingerprint: {
      family: "mixed-editorial",
      columnCount: 1,
      hasHero: false,
      hasChart: false,
      hasRightRail: false,
      hasFooter: false,
      primaryEvidenceRegion: "text",
    },
    pageTitleQuality: {
      title: "Good title",
      promptLeak: false,
      truncated: false,
      repeatedInstruction: false,
      reason: null,
    },
    textMeasurements: [],
    predictedTextOverflow: false,
    predictedOverflowRoots: [],
    ...overrides,
  } as PageFitMeasurement;
}

function buildStreamResponse(
  chunks: string[],
  hooks?: {
    onCancel?: () => void;
    onRelease?: () => void;
  },
) {
  const encoder = new TextEncoder();
  let readIndex = 0;
  const reader = {
    async read() {
      if (readIndex >= chunks.length) {
        return { done: true, value: undefined };
      }
      const chunk = chunks[readIndex] ?? "";
      readIndex += 1;
      return { done: false, value: encoder.encode(chunk) };
    },
    async cancel() {
      hooks?.onCancel?.();
    },
    releaseLock() {
      hooks?.onRelease?.();
    },
  };

  return {
    body: {
      getReader() {
        return reader;
      },
    },
  } as Response;
}

function buildFinalReportEvent(): StudioGenerateStreamEvent {
  return {
    type: "final_report",
    runId: "run-1",
    model: "gpt-5.4-mini",
    report: {
      title: "Test report",
      html: [
        "<!DOCTYPE html>",
        '<html lang="en">',
        "<head><title>Test report</title></head>",
        "<body>",
        '<section class="page" data-page-number="1" data-page-title="Test report" style="width:1600px;height:900px;">',
        "<h1>Test report</h1>",
        "</section>",
        "</body>",
        "</html>",
      ].join(""),
      pageCount: 1,
      pageTitles: ["Test report"],
    },
  };
}

test("inferRequestedHtmlPageCount honors Chinese total page requests before one-page constraints", () => {
  const prompt = `做一份 6 页英文 PPT，主题是“Why our Studio should support Cursor, Codex, and Kimi as switchable providers”。

要求：
- 第 1 页只回答一个问题：为什么这件事值得做。
- 第 2 页只讲三种 provider 的切换架构。
- 第 3 页比较 Cursor / Codex / Kimi 的适用场景。
- 第 4 页如果没有真实数据，就不要画图。
- 第 5 页写 migration risks and rollback plan。
- 第 6 页写 next-week execution plan。
- one page, one claim`;

  assert.equal(inferRequestedHtmlPageCount(prompt), 6);
});

test("inferRequestedHtmlPageCount keeps explicit English deck counts over one-page constraints", () => {
  assert.equal(
    inferRequestedHtmlPageCount("Create a 6-page deck. one page, one claim."),
    6,
  );
});

test("inferRequestedHtmlPageCount infers page count from contiguous Chinese page references", () => {
  assert.equal(
    inferRequestedHtmlPageCount("请做英文PPT。第 1 页讲背景。第 2 页讲架构。第 3 页讲风险。"),
    3,
  );
});

test("inferRequestedHtmlPageCount supports Chinese number words without collapsing to single-page constraints", () => {
  assert.equal(
    inferRequestedHtmlPageCount("生成两页PPT。第一页讲BCG矩阵，第二页讲3D建模。一页一结论。"),
    2,
  );
  assert.equal(
    inferRequestedHtmlPageCount("请做十页英文PPT，一页一观点。"),
    10,
  );
});

test("inferRequestedHtmlPageCount recognizes numeric Chinese single-page briefs", () => {
  assert.equal(
    inferRequestedHtmlPageCount("1 页关于苹果的BCG矩阵，要精美"),
    1,
  );
  assert.equal(
    inferRequestedHtmlPageCount("做 1页 苹果 BCG 矩阵，咨询风"),
    1,
  );
});

test("resolveGenerationIntent defaults htmlOutputMode to static", () => {
  const intent = resolveGenerationIntent("Create a 4-page HTML report.");

  assert.equal(intent.htmlOutputMode, "static");
});

test("resolveGenerationIntent preserves animated preview mode before first generation", () => {
  const intent = resolveGenerationIntent("Create a 4-page HTML report.", {
    htmlOutputMode: "animated-preview-js",
    requestedPageCount: 4,
  });

  assert.equal(intent.htmlOutputMode, "animated-preview-js");
  assert.equal(intent.requestedPageCount, 4);
});

test("resolvePageReviewDecision softens density-only failures for short decks", () => {
  const decision = resolvePageReviewDecision(
    createMeasurement({
      semanticModuleCount: 8,
      textCharacterCount: 600,
      topLevelRegions: Array.from({ length: 4 }, (_, index) => ({
        kind: "div",
        role: "region",
        label: `Region ${index + 1}`,
        top: 0,
        left: 0,
        width: 100,
        height: 100,
        bottom: 100,
        right: 100,
        overflowX: false,
        overflowY: false,
      })),
    }),
    3,
  );

  assert.equal(decision.severity, "soft-warning");
  assert.deepEqual(decision.reasons, ["semantic-density"]);
});

test("resolvePageReviewDecision keeps density-only failures hard for long-form decks", () => {
  const decision = resolvePageReviewDecision(
    createMeasurement({
      pageNumber: 9,
      semanticModuleCount: 6,
      textCharacterCount: 420,
      topLevelRegions: Array.from({ length: 3 }, (_, index) => ({
        kind: "div",
        role: "region",
        label: `Region ${index + 1}`,
        top: 0,
        left: 0,
        width: 100,
        height: 100,
        bottom: 100,
        right: 100,
        overflowX: false,
        overflowY: false,
      })),
      textMeasurements: [
        {
          blockId: null,
          layoutId: null,
          selector: null,
          role: "paragraph",
          width: 420,
          fontSize: 16,
          lineHeight: 22,
          predictedHeight: 120,
          predictedLineCount: 5,
          actualHeight: 96,
          tightWidth: 400,
          overflowRisk: "tight",
          textPreview: "Dense long-form proof block",
        },
      ],
    }),
    10,
  );

  assert.equal(decision.severity, "hard-fail");
  assert.deepEqual(decision.reasons, ["semantic-density"]);
});

test("didPageReviewImprove detects reduced hard-fail pressure after a repair pass", () => {
  const improved = didPageReviewImprove({
    before: createMeasurement({
      overflowY: true,
      scrollHeight: 980,
      clientHeight: 900,
      pageTitleQuality: {
        title: "Create a deck on throughput",
        promptLeak: true,
        truncated: false,
        repeatedInstruction: false,
        reason: "prompt leak",
      },
    }),
    after: createMeasurement({
      overflowY: true,
      scrollHeight: 930,
      clientHeight: 900,
    }),
    pageCount: 3,
  });

  assert.equal(improved, true);
});

test("applyDeterministicTitleRepairToReport replaces leaked prompt titles with page evidence", () => {
  const repaired = applyDeterministicTitleRepairToReport({
    report: {
      title: "Title cleanup fixture",
      html: [
        "<!DOCTYPE html>",
        '<html lang="en">',
        "<head><title>Title cleanup fixture</title></head>",
        "<body>",
        [
          '<section class="page" data-page-title="Create the board-ready leadership deck about clinic throughput">',
          "<h1>Create the board-ready leadership deck about clinic throughput</h1>",
          "<p>Coordination logic remains the constraint.</p>",
          "</section>",
        ].join(""),
        "</body>",
        "</html>",
      ].join(""),
      pageCount: 1,
      pageTitles: ["Create the board-ready leadership deck about clinic throughput"],
    },
    measurements: [
      createMeasurement({
        pageTitleQuality: {
          title: "Create the board-ready leadership deck about clinic throughput",
          promptLeak: true,
          truncated: false,
          repeatedInstruction: false,
          reason: "title looks like leaked prompt text",
        },
      }),
    ],
  });

  assert.ok(repaired);
  assert.deepEqual(repaired?.repairedPageNumbers, [1]);
  assert.equal(repaired?.report.pageTitles[0], "Coordination logic remains the constraint");
  assert.match(
    repaired?.report.html ?? "",
    /<h1>Coordination logic remains the constraint<\/h1>/,
  );
});

test("consumeStudioStreamResponse skips malformed NDJSON lines and keeps later events", async () => {
  let cancelCalled = false;
  let releaseCalled = false;
  const warned: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warned.push(args);
  };

  try {
    const finalEvent = buildFinalReportEvent();
    const seenEvents: StudioGenerateStreamEvent[] = [];
    const result = await consumeStudioStreamResponse(
      buildStreamResponse(
        [
          "this is not json\n",
          `${JSON.stringify(finalEvent)}\n`,
        ],
        {
          onCancel: () => {
            cancelCalled = true;
          },
          onRelease: () => {
            releaseCalled = true;
          },
        },
      ),
      (event) => {
        seenEvents.push(event);
      },
    );

    assert.equal(seenEvents.length, 1);
    assert.deepEqual(seenEvents[0], finalEvent);
    assert.equal(result.finalReport?.title, "Test report");
    assert.equal(result.model, "gpt-5.4-mini");
    assert.equal(cancelCalled, true);
    assert.equal(releaseCalled, true);
    assert.equal(warned.length, 1);
  } finally {
    console.warn = originalWarn;
  }
});

test("consumeStudioStreamResponse releases the reader when event handlers throw", async () => {
  let cancelCalled = false;
  let releaseCalled = false;
  const response = buildStreamResponse(
    [`${JSON.stringify(buildFinalReportEvent())}\n`],
    {
      onCancel: () => {
        cancelCalled = true;
      },
      onRelease: () => {
        releaseCalled = true;
      },
    },
  );

  await assert.rejects(
    () =>
      consumeStudioStreamResponse(response, () => {
        throw new Error("observer failed");
      }),
    /observer failed/i,
  );

  assert.equal(cancelCalled, true);
  assert.equal(releaseCalled, true);
});
