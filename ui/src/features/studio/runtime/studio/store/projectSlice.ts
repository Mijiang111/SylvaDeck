import type { WorkbenchProject } from "@/features/studio/types";
import type { WorkbenchStudioStore, WorkbenchStudioSlice } from "./shared";
import {
  DEFAULT_DOCUMENT_STATE,
  DEFAULT_HISTORY_STATE,
  DEFAULT_SELECTION_STATE,
  appendGenerationHistory,
  appendPublishSnapshot,
  createEmptyStudioSnapshot,
  createImportedProject,
  createStudioProject,
  createStudioWorkspace,
  deepClone,
  mutateCurrentProject,
  getWorkspaceById,
} from "./shared";
import {
  buildProjectSummaries,
  buildWorkspaceSummaries,
  getProjectById,
  removeProjectFromSnapshot,
  removeWorkspaceFromSnapshot,
  replaceWorkspaceInSnapshot,
  resolveStudioSelection,
} from "../utils";

type ProjectSlice = Pick<
  WorkbenchStudioStore,
  | "document"
  | "setWorkspaceName"
  | "setProjectName"
  | "setSourceText"
  | "setBriefMessages"
  | "selectWorkspace"
  | "selectProject"
  | "createWorkspace"
  | "deleteCurrentWorkspace"
  | "createProject"
  | "duplicateCurrentProject"
  | "deleteCurrentProject"
  | "deleteProject"
  | "replaceCurrentProject"
  | "updatePages"
  | "updateGeneratedDraft"
  | "commitGeneration"
  | "recordPublish"
  | "setWorkflowStage"
>;

export const createProjectSlice: WorkbenchStudioSlice<ProjectSlice> = (set, get) => ({
  document: DEFAULT_DOCUMENT_STATE,

  setWorkspaceName(name) {
    set((state) => {
      if (!state.library.snapshot) {
        return {};
      }

      const workspace =
        getWorkspaceById(state.library.snapshot, state.document.workspaceId) ??
        state.library.snapshot.workspaces[0];
      const nextWorkspace = {
        ...deepClone(workspace),
        name: name.trim() || workspace.name,
        updatedAt: new Date().toISOString(),
      };
      const nextSnapshot = replaceWorkspaceInSnapshot(state.library.snapshot, nextWorkspace);

      return {
        library: {
          ...state.library,
          snapshot: nextSnapshot,
          projectSummaries: buildProjectSummaries(nextSnapshot, state.document.fixedTemplateId),
          workspaceSummaries: buildWorkspaceSummaries(nextSnapshot),
        },
        document: {
          ...state.document,
          workspaceName: nextWorkspace.name,
        },
        history: {
          ...state.history,
          dirty: true,
        },
      };
    });
  },

  setProjectName(projectName) {
    set((state) => {
      if (!state.document.project) {
        return {};
      }

      const nextProject = {
        ...deepClone(state.document.project),
        projectName,
        updatedAt: new Date().toISOString(),
      };

      return mutateCurrentProject({
        state,
        nextProject,
        scope: "brief",
        label: "Rename project",
        fields: ["projectName"],
      });
    });
  },

  setSourceText(sourceText) {
    set((state) => {
      if (!state.document.project) {
        return {};
      }

      const nextProject = {
        ...deepClone(state.document.project),
        sourceText,
        updatedAt: new Date().toISOString(),
      };

      return {
        ...mutateCurrentProject({
          state,
          nextProject,
          scope: "brief",
          label: "Edit brief",
          fields: ["sourceText"],
        }),
        brief: {
          ...state.brief,
          intakeInput: sourceText,
        },
      };
    });
  },

  setBriefMessages(messages) {
    set((state) => {
      if (!state.document.project) {
        return {};
      }

      const nextProject = {
        ...deepClone(state.document.project),
        briefMessages: deepClone(messages),
        updatedAt: new Date().toISOString(),
      };

      return mutateCurrentProject({
        state,
        nextProject,
        scope: "brief",
        label: "Update conversation",
        fields: ["briefMessages"],
      });
    });
  },

  selectWorkspace(workspaceId) {
    const snapshot = get().library.snapshot;
    if (!snapshot) {
      return;
    }

    const resolved = resolveStudioSelection(snapshot, {
      fixedTemplateId: get().document.fixedTemplateId,
      workspaceId,
    });
    get().hydrate(resolved.snapshot, {
      fixedTemplateId: get().document.fixedTemplateId,
      workspaceId: resolved.workspace.id,
      projectId: resolved.project.id,
      mode: resolved.project.workflowStage === "intake" ? "brief" : "editor",
    });
  },

  selectProject(workspaceId, projectId, mode) {
    const snapshot = get().library.snapshot;
    if (!snapshot) {
      return;
    }

    const resolved = resolveStudioSelection(snapshot, {
      fixedTemplateId: get().document.fixedTemplateId,
      workspaceId,
      projectId,
    });
    get().hydrate(resolved.snapshot, {
      fixedTemplateId: get().document.fixedTemplateId,
      workspaceId: resolved.workspace.id,
      projectId: resolved.project.id,
      mode:
        mode ??
        (resolved.project.workflowStage === "intake" ? "brief" : "editor"),
    });
  },

  createWorkspace(name) {
    set((state) => {
      const snapshot =
        state.library.snapshot ??
        createEmptyStudioSnapshot(state.document.fixedTemplateId);
      const nextWorkspace = createStudioWorkspace(
        name || "New workspace",
        state.document.fixedTemplateId,
      );
      const nextSnapshot = replaceWorkspaceInSnapshot(snapshot, nextWorkspace);

      return {
        shell: {
          ...state.shell,
          mode: "brief",
          homeSection: "library",
          selectedLibraryProjectId: null,
          selectedChatProjectId: nextWorkspace.projects[0]?.id ?? null,
          statusLine: `Created workspace: ${nextWorkspace.name}.`,
          inspectorTab: "page",
          canvasDrawer: null,
          currentCanvasPageId: nextWorkspace.projects[0]?.pages[0]?.id ?? null,
        },
        library: {
          ...state.library,
          snapshot: nextSnapshot,
          projectSummaries: buildProjectSummaries(nextSnapshot, state.document.fixedTemplateId),
          workspaceSummaries: buildWorkspaceSummaries(nextSnapshot),
        },
        document: {
          workspaceId: nextWorkspace.id,
          workspaceName: nextWorkspace.name,
          project: deepClone(nextWorkspace.projects[0]),
          fixedTemplateId: state.document.fixedTemplateId,
        },
        selection: {
          ...DEFAULT_SELECTION_STATE,
          activePageId: nextWorkspace.projects[0]?.pages[0]?.id ?? "",
        },
        brief: {
          ...state.brief,
          intakeInput: nextWorkspace.projects[0]?.sourceText ?? "",
        },
        history: {
          ...DEFAULT_HISTORY_STATE,
          dirty: true,
          saveState: "ready",
        },
      };
    });
  },

  deleteCurrentWorkspace() {
    set((state) => {
      if (!state.library.snapshot) {
        return {};
      }

      const nextSnapshot = removeWorkspaceFromSnapshot(
        state.library.snapshot,
        state.document.workspaceId,
        state.document.fixedTemplateId,
      );
      const resolved = resolveStudioSelection(nextSnapshot, {
        fixedTemplateId: state.document.fixedTemplateId,
      });

      return {
        shell: {
          ...state.shell,
          mode: resolved.project.workflowStage === "intake" ? "brief" : "editor",
          homeSection: resolved.project.generatedDraft?.htmlReport ? "library" : "ai",
          selectedLibraryProjectId: resolved.project.generatedDraft?.htmlReport
            ? resolved.project.id
            : state.shell.selectedLibraryProjectId,
          selectedChatProjectId: resolved.project.briefMessages.length
            ? resolved.project.id
            : state.shell.selectedChatProjectId,
          statusLine: `Switched to workspace: ${resolved.workspace.name}.`,
          inspectorTab: "page",
          canvasDrawer: null,
          currentCanvasPageId: resolved.project.pages[0]?.id ?? null,
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

  createProject(projectName) {
    set((state) => {
      if (!state.library.snapshot) {
        return {};
      }

      const workspace =
        getWorkspaceById(state.library.snapshot, state.document.workspaceId) ??
        state.library.snapshot.workspaces[0];
      const nextProject = createStudioProject(
        state.document.fixedTemplateId ?? state.document.project?.templateId,
        projectName || "New HTML report",
      );
      const nextWorkspace = {
        ...deepClone(workspace),
        projects: [...workspace.projects, nextProject],
        activeProjectId: nextProject.id,
        updatedAt: new Date().toISOString(),
      };
      const nextSnapshot = replaceWorkspaceInSnapshot(state.library.snapshot, nextWorkspace);

      return {
        shell: {
          ...state.shell,
          mode: "brief",
          homeSection: "ai",
          selectedLibraryProjectId: state.shell.selectedLibraryProjectId,
          selectedChatProjectId: nextProject.id,
          statusLine: `Created project: ${nextProject.projectName}.`,
          inspectorTab: "page",
          canvasDrawer: null,
          currentCanvasPageId: nextProject.pages[0]?.id ?? null,
        },
        library: {
          ...state.library,
          snapshot: nextSnapshot,
          projectSummaries: buildProjectSummaries(nextSnapshot, state.document.fixedTemplateId),
          workspaceSummaries: buildWorkspaceSummaries(nextSnapshot),
        },
        document: {
          workspaceId: nextWorkspace.id,
          workspaceName: nextWorkspace.name,
          project: deepClone(nextProject),
          fixedTemplateId: state.document.fixedTemplateId,
        },
        selection: {
          ...DEFAULT_SELECTION_STATE,
          activePageId: nextProject.pages[0]?.id ?? "",
        },
        brief: {
          ...state.brief,
          intakeInput: nextProject.sourceText,
        },
        history: {
          ...DEFAULT_HISTORY_STATE,
          dirty: true,
          saveState: "ready",
        },
      };
    });
  },

  duplicateCurrentProject() {
    set((state) => {
      if (!state.document.project || !state.library.snapshot) {
        return {};
      }

      const workspace =
        getWorkspaceById(state.library.snapshot, state.document.workspaceId) ??
        state.library.snapshot.workspaces[0];
      const nextProject = createImportedProject({
        ...state.document.project,
        projectName: `${state.document.project.projectName} Copy`,
      });
      const nextWorkspace = {
        ...deepClone(workspace),
        projects: [...workspace.projects, nextProject],
        activeProjectId: nextProject.id,
        updatedAt: new Date().toISOString(),
      };
      const nextSnapshot = replaceWorkspaceInSnapshot(state.library.snapshot, nextWorkspace);

      return {
        shell: {
          ...state.shell,
          mode: nextProject.workflowStage === "intake" ? "brief" : "editor",
          homeSection: nextProject.generatedDraft?.htmlReport ? "library" : "ai",
          selectedLibraryProjectId: nextProject.generatedDraft?.htmlReport
            ? nextProject.id
            : state.shell.selectedLibraryProjectId,
          selectedChatProjectId: nextProject.briefMessages.length
            ? nextProject.id
            : state.shell.selectedChatProjectId,
          statusLine: `Duplicated project: ${nextProject.projectName}.`,
          inspectorTab: "page",
          canvasDrawer: null,
          currentCanvasPageId: nextProject.pages[0]?.id ?? null,
        },
        library: {
          ...state.library,
          snapshot: nextSnapshot,
          projectSummaries: buildProjectSummaries(nextSnapshot, state.document.fixedTemplateId),
          workspaceSummaries: buildWorkspaceSummaries(nextSnapshot),
        },
        document: {
          workspaceId: nextWorkspace.id,
          workspaceName: nextWorkspace.name,
          project: deepClone(nextProject),
          fixedTemplateId: state.document.fixedTemplateId,
        },
        selection: {
          ...DEFAULT_SELECTION_STATE,
          activePageId: nextProject.pages[0]?.id ?? "",
        },
        brief: {
          ...state.brief,
          intakeInput: nextProject.sourceText,
        },
        history: {
          ...DEFAULT_HISTORY_STATE,
          dirty: true,
          saveState: "ready",
        },
      };
    });
  },

  deleteCurrentProject() {
    set((state) => {
      if (!state.library.snapshot || !state.document.project) {
        return {};
      }

      const nextSnapshot = removeProjectFromSnapshot(
        state.library.snapshot,
        state.document.workspaceId,
        state.document.project.id,
        state.document.fixedTemplateId,
      );
      const resolved = resolveStudioSelection(nextSnapshot, {
        fixedTemplateId: state.document.fixedTemplateId,
        workspaceId: state.document.workspaceId,
      });

      return {
        shell: {
          ...state.shell,
          mode: resolved.project.workflowStage === "intake" ? "brief" : "editor",
          homeSection: resolved.project.generatedDraft?.htmlReport ? "library" : "ai",
          selectedLibraryProjectId: resolved.project.generatedDraft?.htmlReport
            ? resolved.project.id
            : state.shell.selectedLibraryProjectId,
          selectedChatProjectId: resolved.project.briefMessages.length
            ? resolved.project.id
            : state.shell.selectedChatProjectId,
          statusLine: `Switched to project: ${resolved.project.projectName}.`,
          inspectorTab: "page",
          canvasDrawer: null,
          currentCanvasPageId: resolved.project.pages[0]?.id ?? null,
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

  deleteProject(workspaceId, projectId) {
    set((state) => {
      if (!state.library.snapshot) {
        return {};
      }

      const workspace = getWorkspaceById(state.library.snapshot, workspaceId);
      const deletedProject =
        workspace?.projects.find((entry) => entry.id === projectId) ?? null;
      if (!workspace || !deletedProject) {
        return {};
      }

      const nextSnapshot = removeProjectFromSnapshot(
        state.library.snapshot,
        workspaceId,
        projectId,
        state.document.fixedTemplateId,
      );
      const nextProjectSummaries = buildProjectSummaries(
        nextSnapshot,
        state.document.fixedTemplateId,
      );
      const nextWorkspaceSummaries = buildWorkspaceSummaries(nextSnapshot);
      const deletingCurrentProject =
        state.document.project?.id === projectId &&
        state.document.workspaceId === workspaceId;
      const currentProjectStillExists =
        !deletingCurrentProject &&
        Boolean(
          state.document.project &&
            getProjectById(
              nextSnapshot,
              state.document.workspaceId,
              state.document.project.id,
              state.document.fixedTemplateId,
            ),
        );

      if (!currentProjectStillExists) {
        const resolved = resolveStudioSelection(nextSnapshot, {
          fixedTemplateId: state.document.fixedTemplateId,
          workspaceId:
            deletingCurrentProject || state.document.workspaceId === workspaceId
              ? workspaceId
              : state.document.workspaceId,
        });

        return {
          shell: {
            ...state.shell,
            mode: resolved.project.workflowStage === "intake" ? "brief" : "editor",
            homeSection: resolved.project.generatedDraft?.htmlReport ? "library" : "ai",
            selectedLibraryProjectId: resolved.project.generatedDraft?.htmlReport
              ? resolved.project.id
              : nextProjectSummaries.find((summary) => summary.hasGeneratedDeck)?.id ?? null,
            selectedChatProjectId: resolved.project.briefMessages.length
              ? resolved.project.id
              : nextProjectSummaries.find((summary) => summary.hasConversation)?.id ?? null,
            statusLine: `Deleted project: ${deletedProject.projectName}.`,
            inspectorTab: "page",
            canvasDrawer: null,
            currentCanvasPageId: resolved.project.pages[0]?.id ?? null,
          },
          library: {
            ...state.library,
            snapshot: resolved.snapshot,
            projectSummaries: nextProjectSummaries,
            workspaceSummaries: nextWorkspaceSummaries,
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
      }

      return {
        shell: {
          ...state.shell,
          selectedLibraryProjectId:
            state.shell.selectedLibraryProjectId === projectId
              ? nextProjectSummaries.find((summary) => summary.hasGeneratedDeck)?.id ?? null
              : state.shell.selectedLibraryProjectId,
          selectedChatProjectId:
            state.shell.selectedChatProjectId === projectId
              ? nextProjectSummaries.find((summary) => summary.hasConversation)?.id ?? null
              : state.shell.selectedChatProjectId,
          statusLine: `Deleted project: ${deletedProject.projectName}.`,
        },
        library: {
          ...state.library,
          snapshot: nextSnapshot,
          projectSummaries: nextProjectSummaries,
          workspaceSummaries: nextWorkspaceSummaries,
        },
        history: {
          ...state.history,
          dirty: true,
          saveState: state.history.saveState === "booting" ? "ready" : state.history.saveState,
        },
      };
    });
  },

  replaceCurrentProject(nextProject, options) {
    const historyOptions =
      options?.history === false ? null : options?.history ?? null;

    set((state) =>
      mutateCurrentProject({
        state,
        nextProject,
        scope: historyOptions?.scope,
        label: historyOptions?.label,
        fields: historyOptions?.fields,
        historyEnabled: options?.history !== false,
        inspectorTab: options?.inspectorTab,
        mode: options?.mode,
        statusLine: options?.statusLine,
        resetSelection: options?.resetSelection,
      }),
    );
  },

  updatePages(pages, options) {
    set((state) => {
      if (!state.document.project) {
        return {};
      }

      const nextProject = {
        ...deepClone(state.document.project),
        pages: deepClone(pages),
        updatedAt: new Date().toISOString(),
      };

      return mutateCurrentProject({
        state,
        nextProject,
        scope: options?.scope ?? "pages",
        label: options?.label ?? "Edit pages",
        fields: ["pages"],
        inspectorTab: options?.inspectorTab,
        statusLine: options?.statusLine,
      });
    });
  },

  updateGeneratedDraft(args) {
    set((state) => {
      if (!state.document.project) {
        return {};
      }

      const nextProject = {
        ...deepClone(state.document.project),
        generatedDraft: deepClone(args.generatedDraft),
        pages: args.pages ? deepClone(args.pages) : deepClone(state.document.project.pages),
        projectName: args.projectName ?? state.document.project.projectName,
        workflowStage: args.workflowStage ?? state.document.project.workflowStage,
        generationHistory: args.generationHistory
          ? deepClone(args.generationHistory)
          : deepClone(state.document.project.generationHistory),
        publishSnapshots: args.publishSnapshots
          ? deepClone(args.publishSnapshots)
          : deepClone(state.document.project.publishSnapshots),
        updatedAt: new Date().toISOString(),
      } satisfies WorkbenchProject;

      return mutateCurrentProject({
        state,
        nextProject,
        scope: args.scope ?? "visual",
        label: args.label,
        fields: ["generatedDraft", "pages", "projectName", "workflowStage"],
        inspectorTab: args.inspectorTab,
        statusLine: args.statusLine,
      });
    });
  },

  commitGeneration(commit, statusLine) {
    set((state) => {
      if (!state.document.project) {
        return {};
      }

      const nextProject = appendGenerationHistory(state.document.project, commit);
      return {
        ...mutateCurrentProject({
          state,
          nextProject,
          scope: "generation",
          label: "Generate report",
          fields: [
            "projectName",
            "sourceText",
            "generationMode",
            "moduleUsageMode",
            "htmlOutputMode",
            "requestedPageCount",
            "exportContract",
            "pages",
            "generatedDraft",
            "workflowStage",
            "generationHistory",
          ],
          inspectorTab: "page",
          mode: "editor",
          statusLine,
          resetSelection: true,
        }),
        brief: {
          ...state.brief,
          intakeInput: commit.sourceText,
        },
      };
    });
  },

  recordPublish(format, publishedUrl) {
    set((state) => {
      if (!state.document.project) {
        return {};
      }

      const nextProject = appendPublishSnapshot(state.document.project, format, publishedUrl);
      return mutateCurrentProject({
        state,
        nextProject,
        historyEnabled: false,
        statusLine: `Recorded ${format.toUpperCase()} export snapshot.`,
      });
    });
  },

  setWorkflowStage(workflowStage, label = "Update workflow stage") {
    set((state) => {
      if (!state.document.project) {
        return {};
      }

      const nextProject = {
        ...deepClone(state.document.project),
        workflowStage,
        updatedAt: new Date().toISOString(),
      };

      return mutateCurrentProject({
        state,
        nextProject,
        scope: "workflow",
        label,
        fields: ["workflowStage"],
      });
    });
  },
});
