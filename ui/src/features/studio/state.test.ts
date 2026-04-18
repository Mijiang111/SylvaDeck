import test from "node:test";
import assert from "node:assert/strict";
import {
  createTemplateProjectState,
  parseProjectBundle,
  serializeProjectBundle,
} from "./state";

test("createTemplateProjectState defaults htmlOutputMode to static", () => {
  const project = createTemplateProjectState("blank");

  assert.equal(project.htmlOutputMode, "static");
});

test("project bundles preserve animated html output mode", () => {
  const project = createTemplateProjectState("blank");
  const serialized = serializeProjectBundle({
    templateId: project.templateId,
    projectName: "Animated report",
    sourceText: "Create an animated preview deck.",
    generationMode: project.generationMode,
    moduleUsageMode: project.moduleUsageMode,
    htmlOutputMode: "animated-preview-js",
    requestedPageCount: 4,
    longFormClarification: project.longFormClarification,
    deckOptimization: project.deckOptimization,
    briefMessages: project.briefMessages,
    pages: project.pages,
    workflowStage: project.workflowStage,
  });

  const parsed = parseProjectBundle(serialized);
  assert.equal(parsed.htmlOutputMode, "animated-preview-js");
});
