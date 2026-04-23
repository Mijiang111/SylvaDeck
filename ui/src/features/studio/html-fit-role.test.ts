import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHtmlFitParticipation,
  resolveHtmlVisualFitParticipation,
} from "./html-fit-role";

test("normalizeHtmlFitParticipation only accepts supported fit roles", () => {
  assert.equal(normalizeHtmlFitParticipation("content"), "content");
  assert.equal(normalizeHtmlFitParticipation("decorative"), "decorative");
  assert.equal(normalizeHtmlFitParticipation("other"), null);
  assert.equal(normalizeHtmlFitParticipation(null), null);
});

test("content-first visual kinds default to content participation", () => {
  assert.equal(
    resolveHtmlVisualFitParticipation({
      kind: "chart-frame",
    }),
    "content",
  );
  assert.equal(
    resolveHtmlVisualFitParticipation({
      kind: "annotation",
    }),
    "content",
  );
  assert.equal(
    resolveHtmlVisualFitParticipation({
      kind: "rail",
    }),
    "content",
  );
  assert.equal(
    resolveHtmlVisualFitParticipation({
      kind: "badge",
    }),
    "content",
  );
  assert.equal(
    resolveHtmlVisualFitParticipation({
      kind: "node",
    }),
    "content",
  );
  assert.equal(
    resolveHtmlVisualFitParticipation({
      kind: "connector",
    }),
    "content",
  );
  assert.equal(
    resolveHtmlVisualFitParticipation({
      kind: "shape",
    }),
    "content",
  );
});

test("decorative-first visual kinds default to decorative participation", () => {
  assert.equal(
    resolveHtmlVisualFitParticipation({
      kind: "surface",
    }),
    "decorative",
  );
  assert.equal(
    resolveHtmlVisualFitParticipation({
      kind: "highlight",
    }),
    "decorative",
  );
  assert.equal(
    resolveHtmlVisualFitParticipation({
      kind: "divider",
    }),
    "decorative",
  );
});

test("module-bound or editable visuals stay in content participation", () => {
  assert.equal(
    resolveHtmlVisualFitParticipation({
      kind: "surface",
      hasModuleBinding: true,
    }),
    "content",
  );
  assert.equal(
    resolveHtmlVisualFitParticipation({
      kind: "highlight",
      hasEditableText: true,
    }),
    "content",
  );
});

test("explicit fit participation overrides inferred defaults", () => {
  assert.equal(
    resolveHtmlVisualFitParticipation({
      kind: "surface",
      explicitFitParticipation: "content",
    }),
    "content",
  );
  assert.equal(
    resolveHtmlVisualFitParticipation({
      kind: "chart-frame",
      explicitFitParticipation: "decorative",
    }),
    "decorative",
  );
});
