import {
  DEFAULT_TEMPLATE_ID,
  GENERATION_HISTORY_VERSION,
  PROJECT_SNAPSHOT_VERSION,
  PUBLISH_SNAPSHOT_VERSION,
  WORKSPACE_BUNDLE_VERSION,
  WORKSPACE_LIBRARY_VERSION,
} from "@/features/studio/config";
import {
  createProjectBundle,
  createProjectPublishSignature,
  createTemplateProjectState,
  isStoredProjectStarterShell,
} from "@/features/studio/state";
import type {
  ConversationMessage,
  GeneratedDraftAsset,
  GenerationHistoryEntry,
  LayoutPage,
  PublishSnapshot,
  TemplateId,
  WorkflowStage,
  WorkbenchDeckOptimizationState,
  WorkbenchProject,
  WorkbenchProjectSnapshot,
  WorkbenchProjectSummary,
  WorkbenchWorkspace,
  WorkbenchWorkspaceSummary,
} from "@/features/studio/types";
import type {
  StudioGenerationCommit,
  StudioHistoryPatch,
  StudioLibrarySnapshot,
  StudioPatchPayload,
} from "./types";

function fallbackClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return fallbackClone(value);
}

function createWorkspaceId() {
  return `workspace-${Math.random().toString(36).slice(2, 10)}`;
}

function createVersionId(prefix: "gen" | "publish" | "hist") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildChatLabel(messages: ConversationMessage[], projectName: string) {
  const firstUserTurn = messages.find(
    (message) => message.role === "user" && message.text.trim().length > 0,
  );
  if (!firstUserTurn) {
    return projectName;
  }

  const normalized = firstUserTurn.text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 52) {
    return normalized;
  }

  return `${normalized.slice(0, 49).trimEnd()}...`;
}

export function createStudioProject(
  templateId: TemplateId = DEFAULT_TEMPLATE_ID,
  projectName?: string,
): WorkbenchProject {
  const seed = createTemplateProjectState(templateId);

  return createProjectBundle({
    templateId,
    projectName: projectName?.trim() || seed.projectName,
    sourceText: seed.sourceText,
    htmlOutputMode: seed.htmlOutputMode,
    briefMessages: seed.briefMessages,
    pages: seed.pages,
    generatedDraft: seed.generatedDraft,
    workflowStage: seed.workflowStage,
    generationHistory: [],
    publishSnapshots: [],
  });
}

export function createStudioWorkspace(
  name = "My workspace",
  templateId: TemplateId = DEFAULT_TEMPLATE_ID,
): WorkbenchWorkspace {
  const project = createStudioProject(templateId);
  const now = new Date().toISOString();

  return {
    id: createWorkspaceId(),
    version: WORKSPACE_BUNDLE_VERSION,
    name: name.trim() || "My workspace",
    projects: [project],
    activeProjectId: project.id,
    createdAt: now,
    updatedAt: now,
    exportedAt: now,
  };
}

export function createEmptyStudioSnapshot(
  templateId: TemplateId = DEFAULT_TEMPLATE_ID,
): StudioLibrarySnapshot {
  const workspace = createStudioWorkspace("My workspace", templateId);

  return {
    version: WORKSPACE_LIBRARY_VERSION,
    activeWorkspaceId: workspace.id,
    workspaces: [workspace],
  };
}

export function getWorkspaceById(
  snapshot: StudioLibrarySnapshot,
  workspaceId?: string,
): WorkbenchWorkspace | null {
  if (!snapshot.workspaces.length) {
    return null;
  }

  return (
    (workspaceId
      ? snapshot.workspaces.find((entry) => entry.id === workspaceId)
      : null) ??
    snapshot.workspaces.find((entry) => entry.id === snapshot.activeWorkspaceId) ??
    snapshot.workspaces[0] ??
    null
  );
}

export function getProjectById(
  snapshot: StudioLibrarySnapshot,
  workspaceId: string,
  projectId?: string,
  fixedTemplateId?: TemplateId,
): WorkbenchProject | null {
  const workspace = getWorkspaceById(snapshot, workspaceId);
  if (!workspace) {
    return null;
  }

  const candidates = fixedTemplateId
    ? workspace.projects.filter((entry) => entry.templateId === fixedTemplateId)
    : workspace.projects;

  return (
    (projectId ? candidates.find((entry) => entry.id === projectId) : null) ??
    candidates.find((entry) => entry.id === workspace.activeProjectId) ??
    candidates[0] ??
    null
  );
}

export function ensureSnapshotScaffold(
  snapshot: StudioLibrarySnapshot,
  fixedTemplateId?: TemplateId,
): StudioLibrarySnapshot {
  const base =
    snapshot.workspaces.length > 0 ? deepClone(snapshot) : createEmptyStudioSnapshot(fixedTemplateId);

  if (fixedTemplateId) {
    const hasMatchingProject = base.workspaces.some((workspace) =>
      workspace.projects.some((project) => project.templateId === fixedTemplateId),
    );

    if (!hasMatchingProject) {
      const targetWorkspace =
        base.workspaces.find((workspace) => workspace.id === base.activeWorkspaceId) ??
        base.workspaces[0];
      const nextProject = createStudioProject(fixedTemplateId);
      targetWorkspace.projects = [...targetWorkspace.projects, nextProject];
      targetWorkspace.activeProjectId = nextProject.id;
      targetWorkspace.updatedAt = new Date().toISOString();
    }
  }

  return base;
}

export function resolveStudioSelection(
  snapshot: StudioLibrarySnapshot,
  options?: {
    fixedTemplateId?: TemplateId;
    workspaceId?: string;
    projectId?: string;
  },
) {
  const normalizedSnapshot = ensureSnapshotScaffold(snapshot, options?.fixedTemplateId);
  const preferredWorkspace = getWorkspaceById(normalizedSnapshot, options?.workspaceId);
  const preferredProject =
    preferredWorkspace &&
    getProjectById(
      normalizedSnapshot,
      preferredWorkspace.id,
      options?.projectId,
      options?.fixedTemplateId,
    );

  if (preferredWorkspace && preferredProject) {
    return {
      snapshot: normalizedSnapshot,
      workspace: preferredWorkspace,
      project: preferredProject,
    };
  }

  for (const workspace of normalizedSnapshot.workspaces) {
    const project = getProjectById(
      normalizedSnapshot,
      workspace.id,
      undefined,
      options?.fixedTemplateId,
    );

    if (project) {
      return {
        snapshot: normalizedSnapshot,
        workspace,
        project,
      };
    }
  }

  const fallbackSnapshot = createEmptyStudioSnapshot(options?.fixedTemplateId);
  return {
    snapshot: fallbackSnapshot,
    workspace: fallbackSnapshot.workspaces[0],
    project: fallbackSnapshot.workspaces[0].projects[0],
  };
}

export function replaceProjectInSnapshot(
  snapshot: StudioLibrarySnapshot,
  workspaceId: string,
  project: WorkbenchProject,
): StudioLibrarySnapshot {
  const nextSnapshot = deepClone(snapshot);
  const now = new Date().toISOString();

  nextSnapshot.workspaces = nextSnapshot.workspaces.map((workspace) => {
    if (workspace.id !== workspaceId) {
      return workspace;
    }

    const existingIndex = workspace.projects.findIndex((entry) => entry.id === project.id);
    const nextProjects =
      existingIndex >= 0
        ? workspace.projects.map((entry) => (entry.id === project.id ? deepClone(project) : entry))
        : [...workspace.projects, deepClone(project)];

    return {
      ...workspace,
      projects: nextProjects,
      activeProjectId: project.id,
      updatedAt: now,
    };
  });

  nextSnapshot.activeWorkspaceId = workspaceId;
  return nextSnapshot;
}

export function replaceWorkspaceInSnapshot(
  snapshot: StudioLibrarySnapshot,
  workspace: WorkbenchWorkspace,
): StudioLibrarySnapshot {
  const nextSnapshot = deepClone(snapshot);
  const existingIndex = nextSnapshot.workspaces.findIndex((entry) => entry.id === workspace.id);

  if (existingIndex >= 0) {
    nextSnapshot.workspaces = nextSnapshot.workspaces.map((entry) =>
      entry.id === workspace.id ? deepClone(workspace) : entry,
    );
  } else {
    nextSnapshot.workspaces = [...nextSnapshot.workspaces, deepClone(workspace)];
  }

  nextSnapshot.activeWorkspaceId = workspace.id;
  return nextSnapshot;
}

export function removeProjectFromSnapshot(
  snapshot: StudioLibrarySnapshot,
  workspaceId: string,
  projectId: string,
  fixedTemplateId?: TemplateId,
): StudioLibrarySnapshot {
  const nextSnapshot = deepClone(snapshot);
  const workspace = nextSnapshot.workspaces.find((entry) => entry.id === workspaceId);
  if (!workspace) {
    return nextSnapshot;
  }

  workspace.projects = workspace.projects.filter((entry) => entry.id !== projectId);
  if (!workspace.projects.length) {
    workspace.projects = [createStudioProject(fixedTemplateId ?? DEFAULT_TEMPLATE_ID)];
  }
  workspace.activeProjectId =
    workspace.projects.find((entry) => entry.id === workspace.activeProjectId)?.id ??
    workspace.projects[0]?.id ??
    "";
  workspace.updatedAt = new Date().toISOString();
  return ensureSnapshotScaffold(nextSnapshot, fixedTemplateId);
}

export function removeWorkspaceFromSnapshot(
  snapshot: StudioLibrarySnapshot,
  workspaceId: string,
  fixedTemplateId?: TemplateId,
): StudioLibrarySnapshot {
  const remaining = snapshot.workspaces.filter((entry) => entry.id !== workspaceId);
  if (!remaining.length) {
    return createEmptyStudioSnapshot(fixedTemplateId);
  }

  return ensureSnapshotScaffold(
    {
      version: snapshot.version,
      activeWorkspaceId:
        remaining.find((workspace) => workspace.id === snapshot.activeWorkspaceId)?.id ??
        remaining[0]?.id ??
        "",
      workspaces: deepClone(remaining),
    },
    fixedTemplateId,
  );
}

export function summarizeWorkspace(workspace: WorkbenchWorkspace): WorkbenchWorkspaceSummary {
  return {
    id: workspace.id,
    name: workspace.name,
    projectCount: workspace.projects.length,
    updatedAt: workspace.updatedAt,
  };
}

export function summarizeProject(
  project: WorkbenchProject,
  workspace: Pick<WorkbenchWorkspace, "id" | "name">,
): WorkbenchProjectSummary {
  const coverTitle =
    project.generatedDraft?.htmlReport?.pageTitles[0]?.trim() ||
    project.pages[0]?.title?.trim() ||
    project.projectName;
  const coverSubtitle =
    project.generatedDraft?.draft.subtitle?.trim() ||
    project.sourceText.trim() ||
    "HTML report";

  return {
    id: project.id,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    templateId: project.templateId,
    starterPackId: project.starterPackId,
    starterThemeId: project.starterThemeId,
    projectName: project.projectName,
    updatedAt: project.updatedAt,
    chatUpdatedAt: project.updatedAt,
    pageCount: project.generatedDraft?.htmlReport?.pageCount ?? project.pages.length,
    workflowStage: project.workflowStage,
    hasHtmlReport: Boolean(project.generatedDraft?.htmlReport),
    hasGeneratedDeck: Boolean(project.generatedDraft?.htmlReport),
    hasConversation: project.briefMessages.some(
      (message) => message.role === "user" && message.text.trim().length > 0,
    ),
    chatLabel: buildChatLabel(project.briefMessages, project.projectName),
    coverTitle,
    coverSubtitle,
    generationCount: project.generationHistory.length,
    publishCount: project.publishSnapshots.length,
  };
}

export function findProjectLocation(
  snapshot: StudioLibrarySnapshot,
  projectId: string,
): { workspace: WorkbenchWorkspace; project: WorkbenchProject } | null {
  for (const workspace of snapshot.workspaces) {
    const project = workspace.projects.find((entry) => entry.id === projectId);
    if (project) {
      return {
        workspace,
        project,
      };
    }
  }

  return null;
}

export function buildProjectSummaries(
  snapshot: StudioLibrarySnapshot,
  fixedTemplateId?: TemplateId,
): WorkbenchProjectSummary[] {
  return snapshot.workspaces
    .flatMap((workspace) =>
      workspace.projects
        .filter((project) => (fixedTemplateId ? project.templateId === fixedTemplateId : true))
        .map((project) => summarizeProject(project, workspace)),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function buildWorkspaceSummaries(
  snapshot: StudioLibrarySnapshot,
): WorkbenchWorkspaceSummary[] {
  return snapshot.workspaces
    .map(summarizeWorkspace)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function createProjectSnapshot(project: WorkbenchProject): WorkbenchProjectSnapshot {
  return {
    version: PROJECT_SNAPSHOT_VERSION,
    templateId: project.templateId,
    starterPackId: project.starterPackId,
    starterThemeId: project.starterThemeId,
    starterBindings: deepClone(project.starterBindings),
    starterApplicationMode: project.starterApplicationMode,
    htmlOutputMode: project.htmlOutputMode,
    projectName: project.projectName,
    sourceText: project.sourceText,
    generationMode: project.generationMode,
    moduleUsageMode: project.moduleUsageMode,
    requestedPageCount: project.requestedPageCount,
    longFormClarification: deepClone(project.longFormClarification),
    deckOptimization: deepClone(project.deckOptimization),
    pages: deepClone(project.pages),
    workflowStage: project.workflowStage,
    generatedDraft: deepClone(project.generatedDraft),
    capturedAt: new Date().toISOString(),
  };
}

export function appendGenerationHistory(
  project: WorkbenchProject,
  commit: StudioGenerationCommit,
): WorkbenchProject {
  const nextProject = deepClone(project);
  const capturedAt = new Date().toISOString();
  const snapshot = {
    version: PROJECT_SNAPSHOT_VERSION,
    templateId: commit.generatedDraft.templateId,
    starterPackId: nextProject.starterPackId,
    starterThemeId: nextProject.starterThemeId,
    starterBindings: deepClone(nextProject.starterBindings),
    starterApplicationMode: nextProject.starterApplicationMode,
    htmlOutputMode: commit.htmlOutputMode,
    projectName: commit.projectName,
    sourceText: commit.sourceText,
    generationMode: commit.generationMode,
    moduleUsageMode: commit.moduleUsageMode,
    requestedPageCount: commit.requestedPageCount,
    longFormClarification: deepClone(nextProject.longFormClarification),
    deckOptimization: { autoOptimizedReportKey: null, autoOptimizedVersion: null },
    pages: deepClone(commit.pages),
    workflowStage: commit.workflowStage,
    generatedDraft: deepClone(commit.generatedDraft),
    capturedAt,
  } satisfies WorkbenchProjectSnapshot;

  const previousEntry = nextProject.generationHistory[0];
  const nextHistory =
    previousEntry &&
    previousEntry.mode === commit.generatedDraft.mode &&
    previousEntry.signature === commit.generatedDraft.signature
      ? nextProject.generationHistory
      : [
          {
            id: createVersionId("gen"),
            version: GENERATION_HISTORY_VERSION,
            mode: commit.generatedDraft.mode,
            provider: commit.generatedDraft.provider,
            model: commit.generatedDraft.model,
            signature: commit.generatedDraft.signature,
            createdAt: capturedAt,
            snapshot,
          } satisfies GenerationHistoryEntry,
          ...nextProject.generationHistory,
        ].slice(0, 40);

  nextProject.projectName = commit.projectName;
  nextProject.sourceText = commit.sourceText;
  nextProject.generationMode = commit.generationMode;
  nextProject.moduleUsageMode = commit.moduleUsageMode;
  nextProject.htmlOutputMode = commit.htmlOutputMode;
  nextProject.requestedPageCount = commit.requestedPageCount;
  nextProject.deckOptimization = {
    autoOptimizedReportKey: null,
    autoOptimizedVersion: null,
  };
  nextProject.pages = deepClone(commit.pages);
  nextProject.generatedDraft = deepClone(commit.generatedDraft);
  nextProject.workflowStage = commit.workflowStage;
  nextProject.generationHistory = nextHistory;
  nextProject.updatedAt = capturedAt;
  return nextProject;
}

export function appendPublishSnapshot(
  project: WorkbenchProject,
  format: PublishSnapshot["format"],
  publishedUrl?: string | null,
): WorkbenchProject {
  const nextProject = deepClone(project);
  const capturedAt = new Date().toISOString();
  const snapshot = createProjectSnapshot(nextProject);
  const signature = createProjectPublishSignature(snapshot, format);
  const previousEntry = nextProject.publishSnapshots[0];
  const nextSnapshots =
    previousEntry &&
    previousEntry.signature === signature &&
    previousEntry.format === format
      ? nextProject.publishSnapshots
      : [
          {
            id: createVersionId("publish"),
            version: PUBLISH_SNAPSHOT_VERSION,
            format,
            signature,
            createdAt: capturedAt,
            publishedUrl: publishedUrl ?? null,
            snapshot,
          } satisfies PublishSnapshot,
          ...nextProject.publishSnapshots,
        ].slice(0, 40);

  nextProject.publishSnapshots = nextSnapshots;
  nextProject.exportedAt = capturedAt;
  return nextProject;
}

export function applyPatchPayload(
  project: WorkbenchProject,
  payload: StudioPatchPayload,
): WorkbenchProject {
  return {
    ...deepClone(project),
    ...deepClone(payload),
    updatedAt: new Date().toISOString(),
  };
}

export function createHistoryPatch(args: {
  scope: StudioHistoryPatch["scope"];
  label: string;
  before: StudioPatchPayload;
  after: StudioPatchPayload;
}): StudioHistoryPatch | null {
  if (JSON.stringify(args.before) === JSON.stringify(args.after)) {
    return null;
  }

  return {
    id: createVersionId("hist"),
    scope: args.scope,
    label: args.label,
    at: new Date().toISOString(),
    before: deepClone(args.before),
    after: deepClone(args.after),
  };
}

export function filterVisibleProjects(project: WorkbenchProject) {
  const summaryLike = Boolean(project.generatedDraft?.htmlReport);
  return (summaryLike || project.publishSnapshots.length > 0 || project.generationHistory.length > 0) &&
    !isStoredProjectStarterShell(project);
}

export function updateProjectPages(
  project: WorkbenchProject,
  pages: LayoutPage[],
  workflowStage?: WorkflowStage,
): WorkbenchProject {
  const nextProject = deepClone(project);
  nextProject.pages = deepClone(pages);
  if (workflowStage) {
    nextProject.workflowStage = workflowStage;
  }
  nextProject.updatedAt = new Date().toISOString();
  return nextProject;
}
