import test from "node:test";
import assert from "node:assert/strict";
import { inferRequestedHtmlPageCount } from "./page-count";
import { resolveGenerationIntent } from "./generation";

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
