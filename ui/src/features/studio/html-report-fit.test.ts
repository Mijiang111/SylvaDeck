import test from "node:test";
import assert from "node:assert/strict";
import {
  applyShrinkToFitToReport,
  scaleInlineStyle,
  scalePxValue,
  shouldScaleBoxPropertyForShrink,
} from "./html-report-fit";

test("scalePxValue scales px values and preserves non-px units", () => {
  assert.equal(scalePxValue("16px", 0.8), "12.8px");
  assert.equal(scalePxValue("24px", 0.5), "12px");
  assert.equal(scalePxValue("0px", 0.8), "0px");
  assert.equal(scalePxValue("1.5px", 0.8), "1.2px");
  assert.equal(scalePxValue("100%", 0.8), "100%");
  assert.equal(scalePxValue("rgb(255, 0, 0)", 0.8), "rgb(255, 0, 0)");
  assert.equal(scalePxValue("#ff0000", 0.8), "#ff0000");
});

test("scalePxValue handles multiple px values in one declaration", () => {
  assert.equal(scalePxValue("20px 30px", 0.5), "10px 15px");
  assert.equal(scalePxValue("calc(100% - 20px)", 0.5), "calc(100% - 10px)");
  assert.equal(scalePxValue("translate(120px, 80px)", 0.5), "translate(60px, 40px)");
});

test("scaleInlineStyle scales whitelisted properties only", () => {
  const input = "font-size: 24px; line-height: 32px; color: red; width: 100%";
  const scaled = scaleInlineStyle(input, 0.5);
  assert.ok(scaled.includes("font-size: 12px"));
  assert.ok(scaled.includes("line-height: 16px"));
  assert.ok(scaled.includes("color: red"));
  assert.ok(scaled.includes("width: 100%"));
});

test("scaleInlineStyle preserves unitless line-height", () => {
  const input = "font-size: 20px; line-height: 1.5";
  const scaled = scaleInlineStyle(input, 0.5);
  assert.ok(scaled.includes("font-size: 10px"));
  assert.ok(scaled.includes("line-height: 1.5"));
});

test("scaleInlineStyle preserves percentage line-height", () => {
  const input = "font-size: 20px; line-height: 150%";
  const scaled = scaleInlineStyle(input, 0.5);
  assert.ok(scaled.includes("font-size: 10px"));
  assert.ok(scaled.includes("line-height: 150%"));
});

test("scaleInlineStyle scales padding and margin shorthand", () => {
  const input = "padding: 20px 30px; margin-top: 10px";
  const scaled = scaleInlineStyle(input, 0.5);
  assert.ok(scaled.includes("padding: 10px 15px"));
  assert.ok(scaled.includes("margin-top: 5px"));
});

test("scaleInlineStyle scales border-radius and gap", () => {
  const input = "border-radius: 14px; gap: 26px";
  const scaled = scaleInlineStyle(input, 0.5);
  assert.ok(scaled.includes("border-radius: 7px"));
  assert.ok(scaled.includes("gap: 13px"));
});

test("scaleInlineStyle preserves em, rem and percentage units", () => {
  const input = "font-size: 1.2rem; padding: 1em; width: 50%";
  const scaled = scaleInlineStyle(input, 0.5);
  assert.ok(scaled.includes("font-size: 1.2rem"));
  assert.ok(scaled.includes("padding: 1em"));
  assert.ok(scaled.includes("width: 50%"));
});

test("scaleInlineStyle floors border-width at 1px to prevent visual breakage", () => {
  const input = "border-width: 1px";
  const scaled = scaleInlineStyle(input, 0.5);
  assert.ok(scaled.includes("border-width: 1px"));
});

test("shrink skips page-root and absolute-position geometry scaling", () => {
  assert.equal(
    shouldScaleBoxPropertyForShrink({
      prop: "width",
      position: "static",
      isPageRoot: true,
    }),
    false,
  );
  assert.equal(
    shouldScaleBoxPropertyForShrink({
      prop: "left",
      position: "absolute",
      isPageRoot: false,
    }),
    false,
  );
  assert.equal(
    shouldScaleBoxPropertyForShrink({
      prop: "width",
      position: "absolute",
      isPageRoot: false,
    }),
    false,
  );
  assert.equal(
    shouldScaleBoxPropertyForShrink({
      prop: "border-width",
      position: "absolute",
      isPageRoot: false,
    }),
    true,
  );
});

test("applyShrinkToFitToReport is a no-op when no browser DOM is available", async () => {
  const html = "<!DOCTYPE html><html><head></head><body><section class=\"page\"></section></body></html>";
  const result = await applyShrinkToFitToReport(html);
  assert.equal(result.html, html);
  assert.equal(result.changed, false);
  assert.deepEqual(result.pages, []);
});
