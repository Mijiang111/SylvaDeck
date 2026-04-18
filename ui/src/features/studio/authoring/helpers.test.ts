import test from "node:test";
import assert from "node:assert/strict";
import {
  clampLayoutToSurface,
  getViewportPointInScene,
  createCanvasObject,
  getModuleFrameLayout,
  MODULE_CANVAS_COLUMNS,
  MODULE_CANVAS_ROWS,
  MODULE_SCENE_COLUMNS,
  MODULE_SCENE_ROWS,
  MODULE_SCENE_WIDTH,
  MODULE_SCENE_HEIGHT,
} from "./helpers";

test("clampLayoutToSurface clamps artboard layouts to canvas bounds", () => {
  const layout = { x: -10, y: -5, w: 200, h: 100 };
  const result = clampLayoutToSurface(layout, "artboard");
  assert.equal(result.x, 0);
  assert.equal(result.y, 0);
  assert.equal(result.w, MODULE_CANVAS_COLUMNS);
  assert.equal(result.h, MODULE_CANVAS_ROWS);
});

test("clampLayoutToSurface clamps pasteboard layouts to scene bounds", () => {
  const layout = { x: -10, y: -5, w: 999, h: 999 };
  const result = clampLayoutToSurface(layout, "pasteboard");
  assert.equal(result.x, 0);
  assert.equal(result.y, 0);
  assert.equal(result.w, MODULE_SCENE_COLUMNS);
  assert.equal(result.h, MODULE_SCENE_ROWS);
});

test("getViewportPointInScene converts viewport point to scene coordinates", () => {
  const viewport = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  } as unknown as HTMLDivElement;

  const scale = 1;
  const offset = { x: 0, y: 0 };
  const point = getViewportPointInScene(viewport, 400, 300, scale, offset);

  assert.equal(point.x, MODULE_SCENE_WIDTH / 2);
  assert.equal(point.y, MODULE_SCENE_HEIGHT / 2);
});

test("createCanvasObject returns a valid AI Text slot by default", () => {
  const field = createCanvasObject("slot", "metrics", 0, 1);
  assert.equal(field.objectKind, "slot");
  assert.equal(field.aiState, "ai-fill");
  assert.ok(field.layout);
  assert.ok(field.layout!.x >= 0);
  assert.ok(field.layout!.y >= 0);
  assert.ok(field.layout!.w > 0);
  assert.ok(field.layout!.h > 0);
});

test("createCanvasObject returns a square rectangle when preset is square", () => {
  const field = createCanvasObject("rectangle", "metrics", 0, 1, "square");
  assert.equal(field.objectKind, "rectangle");
  assert.equal(field.style?.aspectLock, "square");
  assert.equal(field.layout!.w, field.layout!.h);
});

test("getModuleFrameLayout returns normalized frame inside canvas bounds", () => {
  const draft = {
    id: "test",
    kind: "title" as const,
    label: "Test",
    moduleFrame: { x: 10, y: 10, w: 100, h: 50 },
  } as any;
  const frame = getModuleFrameLayout(draft);
  assert.ok(frame.x >= 0);
  assert.ok(frame.y >= 0);
  assert.ok(frame.w <= MODULE_CANVAS_COLUMNS);
  assert.ok(frame.h <= MODULE_CANVAS_ROWS);
});
