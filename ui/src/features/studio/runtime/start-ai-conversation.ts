import {
  detectImplicitLongFormClarification,
  type LongFormClarificationSuggestion,
} from "@/features/studio/generation";
import { createProjectBundle } from "@/features/studio/state";
import type {
  HtmlOutputMode,
  WorkbenchGenerationMode,
  WorkbenchModuleUsageMode,
} from "@/features/studio/types";
import { useWorkbenchStudioStore } from "./studio/store";

export function deriveProjectNameFromPrompt(prompt: string) {
  const normalized = prompt
    .replace(/\s+/g, " ")
    .replace(/[.?!:;，。！？；：]+$/g, "")
    .trim();
  if (!normalized) {
    return "New AI report";
  }

  const compact = normalized.length > 48 ? `${normalized.slice(0, 45).trimEnd()}...` : normalized;
  return compact;
}

export type StartAiConversationFromPromptArgs = {
  prompt: string;
  projectName?: string | null;
  generationMode?: WorkbenchGenerationMode;
  moduleUsageMode?: WorkbenchModuleUsageMode;
  htmlOutputMode?: HtmlOutputMode;
  requestedPageCount?: number | null;
  queueGeneration?: boolean;
};

export type StartAiConversationFromPromptResult =
  | {
      ok: true;
      projectId: string;
      projectName: string;
      clarificationSuggestion: LongFormClarificationSuggestion | null;
      queuedGeneration: boolean;
    }
  | {
      ok: false;
      reason: string;
    };

export function startAiConversationFromPrompt(
  args: StartAiConversationFromPromptArgs,
): StartAiConversationFromPromptResult {
  const nextPrompt = args.prompt.trim();
  if (!nextPrompt) {
    return {
      ok: false,
      reason: "Describe the PPT you want before opening a new conversation.",
    };
  }

  const nextProjectName = args.projectName?.trim() || deriveProjectNameFromPrompt(nextPrompt);
  const generationMode = args.generationMode ?? "standard";
  const moduleUsageMode = args.moduleUsageMode ?? "disabled";
  const htmlOutputMode = args.htmlOutputMode ?? "static";
  const requestedPageCount = args.requestedPageCount ?? null;
  const queueGeneration = args.queueGeneration ?? true;
  const clarificationSuggestion = detectImplicitLongFormClarification(nextPrompt, {
    generationMode,
    requestedPageCount,
  });

  const store = useWorkbenchStudioStore.getState();
  if (!store.library.snapshot) {
    return {
      ok: false,
      reason: "Studio workspace is still loading.",
    };
  }

  store.createProject(nextProjectName);
  const nextState = useWorkbenchStudioStore.getState();
  const project = nextState.document.project;
  if (!project) {
    return {
      ok: false,
      reason: "Studio could not create a new AI session.",
    };
  }

  store.replaceCurrentProject(
    createProjectBundle({
      ...project,
      projectName: nextProjectName,
      sourceText: nextPrompt,
      generationMode,
      moduleUsageMode,
      htmlOutputMode,
      requestedPageCount,
      longFormClarification:
        clarificationSuggestion?.trigger === "explicit-8-9-pages"
          ? {
              status: "pending",
              trigger: clarificationSuggestion.trigger,
              resolution: null,
            }
          : {
              status: "idle",
              trigger: null,
              resolution: null,
            },
      briefMessages: [{ role: "user", text: nextPrompt }],
      workflowStage: queueGeneration ? "intake" : "layout",
      updatedAt: new Date().toISOString(),
    }),
    {
      history: {
        scope: "brief",
        label: queueGeneration ? "Start AI conversation" : "Inject AI prompt",
        fields: [
          "projectName",
          "sourceText",
          "generationMode",
          "moduleUsageMode",
          "htmlOutputMode",
          "requestedPageCount",
          "briefMessages",
          "workflowStage",
        ],
      },
      mode: "editor",
      resetSelection: true,
      statusLine:
        clarificationSuggestion?.trigger === "explicit-8-9-pages"
          ? "Opened a new AI conversation. Pick 10 or 12 pages before Studio generates the deck."
          : queueGeneration
            ? "Opened a new AI conversation and queued the first draft."
            : "Injected the prompt into a new Studio conversation. Review it and generate when ready.",
    },
  );

  store.setHomeSection("ai");
  store.setSelectedChatProjectId(project.id);

  return {
    ok: true,
    projectId: project.id,
    projectName: nextProjectName,
    clarificationSuggestion: clarificationSuggestion ?? null,
    queuedGeneration:
      queueGeneration && clarificationSuggestion?.trigger !== "explicit-8-9-pages",
  };
}
