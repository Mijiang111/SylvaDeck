import test from "node:test";
import assert from "node:assert/strict";
import { extractRequestedDeckPageCount } from "./page-count.js";

test("extractRequestedDeckPageCount honors Chinese multi-page briefs with one-page constraints", () => {
  const brief = `做一份 6 页英文 PPT。
第 1 页讲为什么值得做。
第 2 页讲切换架构。
第 3 页讲适用场景。
第 4 页讲 data needed。
第 5 页讲 migration risks。
第 6 页讲 execution plan。
one page, one claim.`;

  assert.equal(extractRequestedDeckPageCount(brief), 6);
});

test("extractRequestedDeckPageCount keeps explicit English counts over one-page rules", () => {
  assert.equal(
    extractRequestedDeckPageCount("Create a 6-page deck. one page, one claim."),
    6,
  );
});

test("extractRequestedDeckPageCount still recognizes true single-page requests", () => {
  assert.equal(
    extractRequestedDeckPageCount("Create a one-page summary deck for the board."),
    1,
  );
});

test("extractRequestedDeckPageCount supports Chinese number words and per-page constraints", () => {
  assert.equal(
    extractRequestedDeckPageCount("生成两页PPT。第一页讲BCG矩阵，第二页讲3D建模。一页一结论。"),
    2,
  );
  assert.equal(
    extractRequestedDeckPageCount("请做十页英文PPT，一页一观点。"),
    10,
  );
  assert.equal(
    extractRequestedDeckPageCount("请做十二页简报，第一页讲背景，第二页讲架构。"),
    12,
  );
});

test("extractRequestedDeckPageCount recognizes numeric Chinese single-page briefs", () => {
  assert.equal(
    extractRequestedDeckPageCount("1 页关于苹果的BCG矩阵，要精美"),
    1,
  );
  assert.equal(
    extractRequestedDeckPageCount("做 1页 苹果 BCG 矩阵，咨询风"),
    1,
  );
});
