import type { WorkbenchStudioStore, WorkbenchStudioSlice } from "./shared";
import {
  DEFAULT_HISTORY_STATE,
  DEFAULT_SELECTION_STATE,
  createEmptyStudioSnapshot,
  createImportedProject,
  createImportedWorkspace,
  deepClone,
  ensureSnapshotScaffold,
  parseWorkbenchBundle,
} from "./shared";
import {
  buildProjectSummaries,
  buildWorkspaceSummaries,
  replaceProjectInSnapshot,
  replaceWorkspaceInSnapshot,
  resolveStudioSelection,
} from "../utils";

type ImportExportSlice = Pick<
  WorkbenchStudioStore,
  "hydrate" | "setBootError" | "importBundle"
>;

export const createImportExportSlice: WorkbenchStudioSlice<ImportExportSlice> = (set) => ({
  hydrate(snapshot, options) {
    const resolved = resolveStudioSelection(snapshot, {
      fixedTemplateId: options?.fixedTemplateId,
      workspaceId: options?.workspaceId,
      projectId: options?.projectId,
    });
    const mode =
      options?.mode ??
      (resolved.project.workflowStage === "intake" ? "brief" : "editor");

    set((state) => ({
      shell: {
        ...state.shell,
        mode,
        homeSection: resolved.project.generatedDraft?.htmlReport ? "library" : "ai",
        selectedLibraryProjectId: resolved.project.generatedDraft?.htmlReport
          ? resolved.project.id
          : state.shell.selectedLibraryProjectId,
        selectedChatProjectId: resolved.project.briefMessages.length
          ? resolved.project.id
          : state.shell.selectedChatProjectId,
        bootState: "ready",
        statusLine: options?.statusLine ?? state.shell.statusLine,
        lastError: null,
        inspectorTab: "page",
        canvasToolbarVisible: false,
        canvasToolbarPinned: false,
        canvasDrawer: null,
        canvasScaleMode: "fit",
        canvasScale: null,
        currentCanvasPageId: resolved.project.pages[0]?.id ?? null,
      },
      library: {
        ...state.library,
        snapshot: resolved.snapshot,
        projectSummaries: buildProjectSummaries(
          resolved.snapshot,
          options?.fixedTemplateId,
        ),
        workspaceSummaries: buildWorkspaceSummaries(resolved.snapshot),
      },
      document: {
        workspaceId: resolved.workspace.id,
        workspaceName: resolved.workspace.name,
        project: deepClone(resolved.project),
        fixedTemplateId: options?.fixedTemplateId,
      },
      selection: {
        ...DEFAULT_SELECTION_STATE,
        activePageId: resolved.project.pages[0]?.id ?? "",
      },
      brief: {
        ...state.brief,
        intakeInput: resolved.project.sourceText,
      },
      history: {
        ...DEFAULT_HISTORY_STATE,
        saveState: "ready",
      },
    }));
  },

  setBootError(message) {
    set((state) => ({
      shell: {
        ...state.shell,
        bootState: "error",
        lastError: message,
        statusLine: message,
      },
      history: {
        ...state.history,
        saveState: "error",
      },
    }));
  },

  importBundle(raw) {
    const parsed = parseWorkbenchBundle(raw);

    set((state) => {
      const baseSnapshot =
        state.library.snapshot ??
        createEmptyStudioSnapshot(state.document.fixedTemplateId);
      let nextSnapshot = ensureSnapshotScaffold(baseSnapshot, state.document.fixedTemplateId);
      let nextWorkspaceId = state.document.workspaceId;
      let nextProjectId = state.document.project?.id ?? "";
      let statusLine = "";

      if (parsed.type === "project") {
        if (
          state.document.fixedTemplateId &&
          parsed.bundle.templateId !== state.document.fixedTemplateId
        ) {
          throw new Error("This route is locked to a different template.");
        }

        const importedProject = createImportedProject(parsed.bundle);
        const workspace =
          nextSnapshot.workspaces.find((entry) => entry.id === state.document.workspaceId) ??
          nextSnapshot.workspaces[0];
        nextSnapshot = replaceProjectInSnapshot(nextSnapshot, workspace.id, importedProject);
        nextWorkspaceId = workspace.id;
        nextProjectId = importedProject.id;
        statusLine = `Imported project bundle: ${importedProject.projectName}.`;
      } else {
        if (
          state.document.fixedTemplateId &&
          parsed.bundle.projects.some(
            (project) => project.templateId !== state.document.fixedTemplateId,
          )
        ) {
          throw new Error("This route is locked to a different template.");
        }

        const importedWorkspace = createImportedWorkspace(parsed.bundle);
        nextSnapshot = replaceWorkspaceInSnapshot(nextSnapshot, importedWorkspace);
        nextWorkspaceId = importedWorkspace.id;
        nextProjectId = importedWorkspace.activeProjectId;
        statusLine = `Imported workspace bundle: ${importedWorkspace.name}.`;
      }

      const resolved = resolveStudioSelection(nextSnapshot, {
        fixedTemplateId: state.document.fixedTemplateId,
        workspaceId: nextWorkspaceId,
        projectId: nextProjectId,
      });

      return {
        shell: {
          ...state.shell,
          mode: resolved.project.workflowStage === "intake" ? "brief" : "editor",
          statusLine,
          inspectorTab: "page",
        },
        library: {
          ...state.library,
          snapshot: resolved.snapshot,
          projectSummaries: buildProjectSummaries(
            resolved.snapshot,
            state.document.fixedTemplateId,
          ),
          workspaceSummaries: buildWorkspaceSummaries(resolved.snapshot),
        },
        document: {
          workspaceId: resolved.workspace.id,
          workspaceName: resolved.workspace.name,
          project: deepClone(resolved.project),
          fixedTemplateId: state.document.fixedTemplateId,
        },
        selection: {
          ...DEFAULT_SELECTION_STATE,
          activePageId: resolved.project.pages[0]?.id ?? "",
        },
        brief: {
          ...state.brief,
          intakeInput: resolved.project.sourceText,
        },
        history: {
          ...DEFAULT_HISTORY_STATE,
          dirty: true,
          saveState: "ready",
        },
      };
    });
  },
});
