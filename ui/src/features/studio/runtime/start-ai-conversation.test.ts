import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyStudioSnapshot } from "./studio/utils";
import { useWorkbenchStudioStore } from "./studio/store";
import { startAiConversationFromPrompt } from "./start-ai-conversation";

function hydrateStudioWorkspace() {
  useWorkbenchStudioStore.getState().hydrate(createEmptyStudioSnapshot(), {
    mode: "library",
    statusLine: "",
  });
}

test("startAiConversationFromPrompt queues intake generation by default", () => {
  hydrateStudioWorkspace();

  const result = startAiConversationFromPrompt({
    prompt: "Create a one-page product intro for Apple.",
    moduleUsageMode: "chart-only",
    htmlOutputMode: "animated-preview-js",
    queueGeneration: true,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const state = useWorkbenchStudioStore.getState();
  assert.equal(state.document.project?.sourceText, "Create a one-page product intro for Apple.");
  assert.equal(state.document.project?.workflowStage, "intake");
  assert.equal(state.document.project?.moduleUsageMode, "chart-only");
  assert.equal(state.document.project?.htmlOutputMode, "animated-preview-js");
  assert.deepEqual(state.document.project?.briefMessages, [
    { role: "user", text: "Create a one-page product intro for Apple." },
  ]);
  assert.equal(state.shell.selectedChatProjectId, result.projectId);
});

test("startAiConversationFromPrompt supports inject-only launches without auto-generation", () => {
  hydrateStudioWorkspace();

  const result = startAiConversationFromPrompt({
    prompt: "Create a three-page market update.",
    projectName: "Bridge injected brief",
    requestedPageCount: 3,
    queueGeneration: false,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const state = useWorkbenchStudioStore.getState();
  assert.equal(state.document.project?.projectName, "Bridge injected brief");
  assert.equal(state.document.project?.requestedPageCount, 3);
  assert.equal(state.document.project?.workflowStage, "layout");
  assert.equal(state.shell.mode, "editor");
});
