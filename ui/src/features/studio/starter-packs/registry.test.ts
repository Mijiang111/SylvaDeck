import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStarterDeckPages,
  createStarterLayoutPage,
  getStarterPackManifest,
  isStarterPackDeck,
  isStarterPackLayout,
} from "./index";

test("buildStarterDeckPages keeps starter deck pages addressable by numeric ids", () => {
  const starter = getStarterPackManifest("starter.weekly-report");
  assert.ok(isStarterPackDeck(starter));

  const pages = buildStarterDeckPages(starter);

  assert.equal(pages.length, starter.pageCount);
  assert.deepEqual(
    pages.map((page, index) => page.id === String(index + 1)),
    new Array(starter.pageCount).fill(true),
  );
});

test("createStarterLayoutPage defaults to a numeric page id and binds the starter layout", () => {
  const starter = getStarterPackManifest("starter.cover");
  assert.ok(isStarterPackLayout(starter));

  const page = createStarterLayoutPage({
    starter,
    pageNumber: 3,
  });

  assert.equal(page.id, "3");
  assert.equal(page.chapter, "Page 3");
  assert.equal(page.starterLayoutId, starter.id);
});
