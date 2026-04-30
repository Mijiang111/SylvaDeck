import {
  BLOCK_KIND_PRESETS,
  DEFAULT_TEMPLATE_ID,
  GENERATION_HISTORY_VERSION,
  GENERATED_DRAFT_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  PROJECT_SNAPSHOT_VERSION,
  PROJECT_LIBRARY_STORAGE_KEY,
  PROJECT_BUNDLE_VERSION,
  PROJECT_NAME_STORAGE_KEY,
  PUBLISH_SNAPSHOT_VERSION,
  SOURCE_STORAGE_KEY,
  STORAGE_KEY,
  TEMPLATE_STORAGE_KEY,
  WORKSPACE_BUNDLE_VERSION,
  WORKSPACE_LIBRARY_VERSION,
} from "./config";
import {
  ensureHtmlEditableStructure,
  normalizeGeneratedHtmlReportTypography,
} from "./html-report-structure";
import {
  normalizeGeneratedHtmlReportCanvasOverrides,
  pruneGeneratedHtmlReportCanvasOverrides,
} from "./html-report-canvas";
import { ensureHtmlLayoutStructure } from "./html-report-layout";
import { normalizeHtmlAnimationStructure } from "./html-report-animation";
import { ensureHtmlVisualStructure } from "./html-report-visuals";
import { normalizeSlideScene } from "./slide-scene";
import { getStarterPackManifest, isStarterPackId, isStarterPackLayout, isStarterPackThemeId } from "./starter-packs";
import { getTemplateDefinition, isTemplateId } from "./templates";
import type {
  BlockKind,
  BlockTone,
  ConversationMessage,
  DeckExportContract,
  DraftProvider,
  ExportObjectContract,
  ExportObjectKind,
  ExportRenderTarget,
  GenerationHistoryEntry,
  GeneratedHtmlReport,
  GeneratedDraftAsset,
  HtmlOutputMode,
  LayoutBlock,
  LayoutPage,
  MetricFact,
  NarrativeItem,
  PublishSnapshot,
  PublishSnapshotFormat,
  SerializableWorkbenchDraft,
  StarterApplicationMode,
  TemplateId,
  WorkflowStage,
  WorkbenchDeckOptimizationState,
  WorkbenchLongFormClarificationState,
  WorkbenchGenerationMode,
  WorkbenchModuleUsageMode,
  WorkbenchProject,
  WorkbenchProjectSummary,
  WorkbenchProjectSnapshot,
  WorkbenchWorkspace,
  WorkbenchWorkspaceSummary,
} from "./types";

type StoredWorkspaceLibrary = {
  version: number;
  activeWorkspaceId: string;
  workspaces: WorkbenchWorkspace[];
};

type WorkspaceLibrarySnapshot = StoredWorkspaceLibrary;

function isWorkbenchGenerationMode(value: unknown): value is WorkbenchGenerationMode {
  return value === "standard" || value === "long-form";
}

function isWorkbenchModuleUsageMode(value: unknown): value is WorkbenchModuleUsageMode {
  return value === "disabled" || value === "fallback" || value === "chart-only";
}

function normalizeHtmlOutputMode(value: unknown): HtmlOutputMode {
  return value === "animated-preview-js" ? "animated-preview-js" : "static";
}

function resolveStarterApplicationMode(args: {
  starterPackId?: string | null;
  starterThemeId?: string | null;
  starterBindings?: Record<string, string>;
}): StarterApplicationMode {
  const hasDeckStarter = isStarterPackId(args.starterPackId);
  const hasThemeStarter = isStarterPackThemeId(args.starterThemeId);
  const hasPageStarter = Object.values(args.starterBindings ?? {}).some((value) => {
    const starter = getStarterPackManifest(value);
    return isStarterPackLayout(starter);
  });

  const dimensionCount = Number(hasDeckStarter) + Number(hasThemeStarter || hasPageStarter);
  if (dimensionCount >= 2) {
    return "mixed";
  }
  if (hasThemeStarter || hasPageStarter) {
    return "theme";
  }
  return "deck";
}

function normalizeStarterBindings(
  bindings: unknown,
  pages: LayoutPage[],
): Record<string, string> {
  if (!bindings || typeof bindings !== "object") {
    return {};
  }

  const knownPageIds = new Set(pages.map((page) => page.id));
  return Object.entries(bindings as Record<string, unknown>).reduce<Record<string, string>>((accumulator, [pageId, starterId]) => {
    if (typeof starterId !== "string") {
      return accumulator;
    }
    const starter = getStarterPackManifest(starterId);
    if (knownPageIds.has(pageId) && isStarterPackLayout(starter)) {
      accumulator[pageId] = starter.id;
    }
    return accumulator;
  }, {});
}

function createEmptyLongFormClarificationState(): WorkbenchLongFormClarificationState {
  return {
    status: "idle",
    trigger: null,
    resolution: null,
  };
}

function createEmptyDeckOptimizationState(): WorkbenchDeckOptimizationState {
  return {
    autoOptimizedReportKey: null,
    autoOptimizedVersion: null,
  };
}

function normalizeDeckOptimizationState(value: unknown): WorkbenchDeckOptimizationState {
  if (!value || typeof value !== "object") {
    return createEmptyDeckOptimizationState();
  }

  const candidate = value as Partial<WorkbenchDeckOptimizationState>;
  return {
    autoOptimizedReportKey:
      typeof candidate.autoOptimizedReportKey === "string" &&
      candidate.autoOptimizedReportKey.trim()
        ? candidate.autoOptimizedReportKey.trim()
        : null,
    autoOptimizedVersion:
      typeof candidate.autoOptimizedVersion === "number" &&
      Number.isFinite(candidate.autoOptimizedVersion) &&
      candidate.autoOptimizedVersion >= 1
        ? Math.trunc(candidate.autoOptimizedVersion)
        : null,
  };
}

function normalizeLongFormClarificationState(
  value: unknown,
): WorkbenchLongFormClarificationState {
  if (!value || typeof value !== "object") {
    return createEmptyLongFormClarificationState();
  }

  const candidate = value as Partial<WorkbenchLongFormClarificationState>;
  return {
    status:
      candidate.status === "pending" || candidate.status === "resolved"
        ? candidate.status
        : "idle",
    trigger:
      candidate.trigger === "explicit-8-9-pages" ||
      candidate.trigger === "long-input-opportunity"
        ? candidate.trigger
        : null,
    resolution:
      candidate.resolution === "keep-standard" ||
      candidate.resolution === "long-form-10" ||
      candidate.resolution === "long-form-12" ||
      candidate.resolution === "dismissed"
        ? candidate.resolution
        : null,
  };
}

let inMemoryWorkspaceLibrary: StoredWorkspaceLibrary | null = null;

function cloneWorkspaceLibrary(library: StoredWorkspaceLibrary): StoredWorkspaceLibrary {
  return {
    version: library.version,
    activeWorkspaceId: library.activeWorkspaceId,
    workspaces: library.workspaces.map(cloneWorkspace),
  };
}

function safeSetLocalStorageItem(key: string, value: string) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`Failed to persist localStorage key "${key}".`, error);
    return false;
  }
}

function safeRemoveLocalStorageItem(key: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`Failed to remove localStorage key "${key}".`, error);
  }
}

export function clonePages(templateId: TemplateId = DEFAULT_TEMPLATE_ID) {
  const template = getTemplateDefinition(templateId);
  return template.defaultPages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block) => ({ ...block })),
  }));
}

function createProjectId() {
  return `project-${Math.random().toString(36).slice(2, 10)}`;
}

function createWorkspaceId() {
  return `workspace-${Math.random().toString(36).slice(2, 10)}`;
}

function createVersionId(prefix: "gen" | "publish") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneGeneratedDraft(asset: GeneratedDraftAsset | null) {
  return asset ? normalizeGeneratedDraftAsset(asset, asset.templateId) : null;
}

function cloneConversationMessages(messages: ConversationMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    text: message.text,
  }));
}

function cloneProjectSnapshot(snapshot: WorkbenchProjectSnapshot): WorkbenchProjectSnapshot {
  return {
    ...snapshot,
    longFormClarification: { ...snapshot.longFormClarification },
    deckOptimization: { ...snapshot.deckOptimization },
    starterBindings: { ...snapshot.starterBindings },
    pages: snapshot.pages.map((page) => ({
      ...page,
      starterLayoutId: page.starterLayoutId ?? null,
      blocks: page.blocks.map((block) => ({ ...block })),
    })),
    generatedDraft: cloneGeneratedDraft(snapshot.generatedDraft),
  };
}

function cloneGenerationHistory(entries: GenerationHistoryEntry[]) {
  return entries.map((entry) => ({
    ...entry,
    snapshot: cloneProjectSnapshot(entry.snapshot),
  }));
}

function clonePublishSnapshots(entries: PublishSnapshot[]) {
  return entries.map((entry) => ({
    ...entry,
    snapshot: cloneProjectSnapshot(entry.snapshot),
  }));
}

function cloneProject(project: WorkbenchProject): WorkbenchProject {
  return {
    ...project,
    longFormClarification: { ...project.longFormClarification },
    deckOptimization: { ...project.deckOptimization },
    starterBindings: { ...project.starterBindings },
    briefMessages: cloneConversationMessages(project.briefMessages),
    pages: project.pages.map((page) => ({
      ...page,
      starterLayoutId: page.starterLayoutId ?? null,
      blocks: page.blocks.map((block) => ({ ...block })),
    })),
    generatedDraft: cloneGeneratedDraft(project.generatedDraft),
    generationHistory: cloneGenerationHistory(project.generationHistory),
    publishSnapshots: clonePublishSnapshots(project.publishSnapshots),
  };
}

function cloneWorkspace(workspace: WorkbenchWorkspace): WorkbenchWorkspace {
  return {
    ...workspace,
    projects: workspace.projects.map(cloneProject),
  };
}

function compareIsoTimestamp(a: string | null | undefined, b: string | null | undefined) {
  const left = typeof a === "string" ? a.trim() : "";
  const right = typeof b === "string" ? b.trim() : "";

  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return -1;
  }
  if (!right) {
    return 1;
  }

  return left.localeCompare(right);
}

function isStarterShellProject(project: WorkbenchProject) {
  const template = getTemplateDefinition(project.templateId);

  return (
    project.workflowStage === "intake" &&
    (project.sourceText.trim() === "" ||
      project.sourceText.trim() === template.defaultSourceText.trim()) &&
    project.projectName.trim() === template.defaultProjectName.trim() &&
    project.briefMessages.filter((message) => message.role === "user").length === 0 &&
    project.generatedDraft === null &&
    project.generationHistory.length === 0 &&
    project.publishSnapshots.length === 0
  );
}

function buildChatLabel(messages: ConversationMessage[], projectName: string) {
  const firstUserMessage = messages.find((message) => message.role === "user")?.text?.trim();
  if (!firstUserMessage) {
    return projectName;
  }

  const compact = firstUserMessage.replace(/\s+/g, " ").trim();
  return compact.length > 54 ? `${compact.slice(0, 51).trimEnd()}...` : compact;
}

function summarizeProject(
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
    hasConversation: project.briefMessages.some((message) => message.role === "user"),
    chatLabel: buildChatLabel(project.briefMessages, project.projectName),
    coverTitle,
    coverSubtitle,
    generationCount: project.generationHistory.length,
    publishCount: project.publishSnapshots.length,
  };
}

function summarizeWorkspace(workspace: WorkbenchWorkspace): WorkbenchWorkspaceSummary {
  return {
    id: workspace.id,
    name: workspace.name,
    projectCount: workspace.projects.length,
    updatedAt: workspace.updatedAt,
  };
}

function createProjectSnapshot(args: {
  templateId: TemplateId;
  starterPackId?: WorkbenchProject["starterPackId"];
  starterThemeId?: WorkbenchProject["starterThemeId"];
  starterBindings?: WorkbenchProject["starterBindings"];
  starterApplicationMode?: WorkbenchProject["starterApplicationMode"];
  htmlOutputMode?: WorkbenchProject["htmlOutputMode"];
  projectName: string;
  sourceText: string;
  generationMode: WorkbenchGenerationMode;
  moduleUsageMode: WorkbenchProject["moduleUsageMode"];
  requestedPageCount: number | null;
  longFormClarification: WorkbenchLongFormClarificationState;
  deckOptimization: WorkbenchDeckOptimizationState;
  pages: LayoutPage[];
  workflowStage: WorkflowStage;
  generatedDraft: GeneratedDraftAsset | null;
  capturedAt?: string;
}): WorkbenchProjectSnapshot {
  return {
    version: PROJECT_SNAPSHOT_VERSION,
    templateId: args.templateId,
    starterPackId: args.starterPackId ?? null,
    starterThemeId: args.starterThemeId ?? null,
    starterBindings: { ...(args.starterBindings ?? {}) },
    starterApplicationMode:
      args.starterApplicationMode ??
      resolveStarterApplicationMode({
        starterPackId: args.starterPackId,
        starterThemeId: args.starterThemeId,
        starterBindings: args.starterBindings,
      }),
    htmlOutputMode: args.htmlOutputMode ?? "static",
    projectName: args.projectName,
    sourceText: args.sourceText,
    generationMode: args.generationMode,
    moduleUsageMode: args.moduleUsageMode,
    requestedPageCount: args.requestedPageCount,
    longFormClarification: { ...args.longFormClarification },
    deckOptimization: { ...args.deckOptimization },
    pages: args.pages.map((page) => ({
      ...page,
      starterLayoutId: page.starterLayoutId ?? null,
      blocks: page.blocks.map((block) => ({ ...block })),
    })),
    workflowStage: args.workflowStage,
    generatedDraft: cloneGeneratedDraft(args.generatedDraft),
    capturedAt: args.capturedAt ?? new Date().toISOString(),
  };
}

function createGenerationHistoryEntry(args: {
  mode: "outline" | "content";
  provider: DraftProvider;
  model: string | null;
  signature: string;
  snapshot: WorkbenchProjectSnapshot;
  id?: string;
  createdAt?: string;
}): GenerationHistoryEntry {
  return {
    id: args.id ?? createVersionId("gen"),
    version: GENERATION_HISTORY_VERSION,
    mode: args.mode,
    provider: args.provider,
    model: args.model,
    signature: args.signature,
    createdAt: args.createdAt ?? args.snapshot.capturedAt,
    snapshot: cloneProjectSnapshot(args.snapshot),
  };
}

function createPublishSnapshotEntry(args: {
  format: PublishSnapshotFormat;
  signature: string;
  publishedUrl?: string | null;
  snapshot: WorkbenchProjectSnapshot;
  id?: string;
  createdAt?: string;
}): PublishSnapshot {
  return {
    id: args.id ?? createVersionId("publish"),
    version: PUBLISH_SNAPSHOT_VERSION,
    format: args.format,
    signature: args.signature,
    createdAt: args.createdAt ?? args.snapshot.capturedAt,
    publishedUrl: args.publishedUrl ?? null,
    snapshot: cloneProjectSnapshot(args.snapshot),
  };
}

function createStoredProjectRecord(args: {
  templateId: TemplateId;
  starterPackId?: WorkbenchProject["starterPackId"];
  starterThemeId?: WorkbenchProject["starterThemeId"];
  starterBindings?: WorkbenchProject["starterBindings"];
  starterApplicationMode?: WorkbenchProject["starterApplicationMode"];
  htmlOutputMode?: WorkbenchProject["htmlOutputMode"];
  projectName?: string;
  sourceText?: string;
  generationMode?: WorkbenchGenerationMode;
  moduleUsageMode?: WorkbenchProject["moduleUsageMode"];
  requestedPageCount?: number | null;
  longFormClarification?: WorkbenchLongFormClarificationState;
  deckOptimization?: WorkbenchDeckOptimizationState;
  briefMessages?: ConversationMessage[];
  pages?: LayoutPage[];
  generatedDraft?: GeneratedDraftAsset | null;
  generationHistory?: GenerationHistoryEntry[];
  publishSnapshots?: PublishSnapshot[];
  workflowStage?: WorkflowStage;
  id?: string;
  updatedAt?: string;
  exportedAt?: string;
}) {
  const template = getTemplateDefinition(args.templateId);
  const now = new Date().toISOString();

  return {
    id: args.id ?? createProjectId(),
    version: PROJECT_BUNDLE_VERSION,
    templateId: args.templateId,
    starterPackId: isStarterPackId(args.starterPackId) ? args.starterPackId : null,
    starterThemeId: isStarterPackThemeId(args.starterThemeId) ? args.starterThemeId : null,
    starterBindings: normalizeStarterBindings(
      args.starterBindings,
      (args.pages ?? clonePages(args.templateId)).map((page) => ({
        ...page,
        starterLayoutId: page.starterLayoutId ?? null,
        blocks: page.blocks.map((block) => ({ ...block })),
      })),
    ),
    starterApplicationMode:
      args.starterApplicationMode ??
      resolveStarterApplicationMode({
        starterPackId: args.starterPackId,
        starterThemeId: args.starterThemeId,
        starterBindings: args.starterBindings,
      }),
    htmlOutputMode: args.htmlOutputMode ?? "static",
    projectName: args.projectName?.trim() || template.defaultProjectName,
    sourceText: args.sourceText ?? template.defaultSourceText,
    generationMode: args.generationMode ?? "standard",
    moduleUsageMode: args.moduleUsageMode ?? "disabled",
    requestedPageCount:
      Number.isInteger(args.requestedPageCount) && (args.requestedPageCount ?? 0) >= 1
        ? args.requestedPageCount ?? null
        : null,
    longFormClarification: normalizeLongFormClarificationState(args.longFormClarification),
    deckOptimization: normalizeDeckOptimizationState(args.deckOptimization),
    briefMessages: cloneConversationMessages(args.briefMessages ?? []),
    pages: (args.pages ?? clonePages(args.templateId)).map((page) => ({
      ...page,
      starterLayoutId: page.starterLayoutId ?? null,
      blocks: page.blocks.map((block) => ({ ...block })),
    })),
    generatedDraft: cloneGeneratedDraft(args.generatedDraft ?? null),
    generationHistory: cloneGenerationHistory(args.generationHistory ?? []),
    publishSnapshots: clonePublishSnapshots(args.publishSnapshots ?? []),
    workflowStage:
      args.workflowStage ??
      (args.generatedDraft ? (args.generatedDraft.mode === "outline" ? "layout" : "generated") : "intake"),
    updatedAt: args.updatedAt ?? now,
    exportedAt: args.exportedAt ?? now,
  } satisfies WorkbenchProject;
}

function createStoredWorkspaceRecord(args: {
  name?: string;
  projects?: WorkbenchProject[];
  activeProjectId?: string;
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  exportedAt?: string;
} = {}) {
  const now = new Date().toISOString();
  const projects =
    args.projects && args.projects.length > 0
      ? args.projects.map(cloneProject)
      : [createStoredProjectRecord({ templateId: DEFAULT_TEMPLATE_ID })];
  const activeProjectId =
    args.activeProjectId && projects.some((project) => project.id === args.activeProjectId)
      ? args.activeProjectId
      : projects[0].id;

  return {
    id: args.id ?? createWorkspaceId(),
    version: WORKSPACE_BUNDLE_VERSION,
    name: args.name?.trim() || "My workspace",
    projects,
    activeProjectId,
    createdAt: args.createdAt ?? now,
    updatedAt: args.updatedAt ?? now,
    exportedAt: args.exportedAt ?? now,
  } satisfies WorkbenchWorkspace;
}

function readLegacyTemplateId() {
  const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
  return isTemplateId(raw) ? raw : DEFAULT_TEMPLATE_ID;
}

function readLegacyPages(templateId: TemplateId) {
  const raw =
    window.localStorage.getItem(STORAGE_KEY) ??
    window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) {
    return clonePages(templateId);
  }

  try {
    const parsed = JSON.parse(raw) as LayoutPage[];
    return parsed.map((page) => ({
      ...page,
      blocks: page.blocks.map((block) => ({
        ...block,
        visualScale:
          typeof block.visualScale === "number" ? block.visualScale : 1,
      })),
    }));
  } catch {
    return clonePages(templateId);
  }
}

function readLegacySourceText(templateId: TemplateId) {
  return window.localStorage.getItem(SOURCE_STORAGE_KEY) ?? getTemplateDefinition(templateId).defaultSourceText;
}

function readLegacyProjectName(templateId: TemplateId) {
  return window.localStorage.getItem(PROJECT_NAME_STORAGE_KEY) ?? getTemplateDefinition(templateId).defaultProjectName;
}

function readLegacyGeneratedDraft(templateId: TemplateId) {
  const raw = window.localStorage.getItem(GENERATED_DRAFT_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return normalizeGeneratedDraftAsset(JSON.parse(raw), templateId);
  } catch {
    return null;
  }
}

function syncLegacyActiveProjectSnapshot(project: WorkbenchProject) {
  safeSetLocalStorageItem(TEMPLATE_STORAGE_KEY, project.templateId);
  safeSetLocalStorageItem(PROJECT_NAME_STORAGE_KEY, project.projectName);
  safeSetLocalStorageItem(SOURCE_STORAGE_KEY, project.sourceText);
  safeSetLocalStorageItem(STORAGE_KEY, JSON.stringify(project.pages));

  if (project.generatedDraft) {
    safeSetLocalStorageItem(
      GENERATED_DRAFT_STORAGE_KEY,
      JSON.stringify(project.generatedDraft),
    );
  } else {
    safeRemoveLocalStorageItem(GENERATED_DRAFT_STORAGE_KEY);
  }
}

export function loadStoredTemplateId() {
  return loadStoredProject().templateId;
}

export function loadStoredPages(templateId: TemplateId = DEFAULT_TEMPLATE_ID) {
  return loadStoredProject(templateId).pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block) => ({ ...block })),
  }));
}

export function loadStoredSourceText(templateId: TemplateId = DEFAULT_TEMPLATE_ID) {
  return loadStoredProject(templateId).sourceText;
}

export function loadStoredProjectName(templateId: TemplateId = DEFAULT_TEMPLATE_ID) {
  return loadStoredProject(templateId).projectName;
}

function isDraftProvider(value: unknown): value is DraftProvider {
  return value === "local" || value === "model";
}

function isWorkflowStage(value: unknown): value is WorkflowStage {
  return value === "intake" || value === "layout" || value === "generated";
}

function normalizeConversationMessage(
  message: unknown,
  label: string,
): ConversationMessage {
  if (!message || typeof message !== "object") {
    throw new Error(`Invalid conversation message at ${label}`);
  }

  const candidate = message as Partial<ConversationMessage>;
  if (candidate.role !== "assistant" && candidate.role !== "user") {
    throw new Error(`Invalid conversation role at ${label}`);
  }
  if (typeof candidate.text !== "string" || !candidate.text.trim()) {
    throw new Error(`Invalid conversation text at ${label}`);
  }

  return {
    role: candidate.role,
    text: candidate.text.trim(),
  };
}

function normalizeMetricFact(metric: unknown, pageId: string, blockId: string, index: number): MetricFact {
  if (!metric || typeof metric !== "object") {
    throw new Error(`Invalid metric at ${pageId}.${blockId}.${index + 1}`);
  }

  const candidate = metric as Partial<MetricFact>;
  if (typeof candidate.value !== "string" || !candidate.value.trim()) {
    throw new Error(`Invalid metric value at ${pageId}.${blockId}.${index + 1}`);
  }
  if (typeof candidate.label !== "string" || !candidate.label.trim()) {
    throw new Error(`Invalid metric label at ${pageId}.${blockId}.${index + 1}`);
  }

  return {
    value: candidate.value.trim(),
    label: candidate.label.trim(),
  };
}

function normalizeNarrativeItem(
  item: unknown,
  pageId: string,
  blockId: string,
  index: number,
): NarrativeItem {
  if (!item || typeof item !== "object") {
    throw new Error(`Invalid narrative at ${pageId}.${blockId}.${index + 1}`);
  }

  const candidate = item as Partial<NarrativeItem>;
  if (typeof candidate.title !== "string" || !candidate.title.trim()) {
    throw new Error(`Invalid narrative title at ${pageId}.${blockId}.${index + 1}`);
  }
  if (typeof candidate.body !== "string" || !candidate.body.trim()) {
    throw new Error(`Invalid narrative body at ${pageId}.${blockId}.${index + 1}`);
  }

  return {
    title: candidate.title.trim(),
    body: candidate.body.trim(),
  };
}

function normalizeSerializableDraft(draft: unknown): SerializableWorkbenchDraft {
  if (!draft || typeof draft !== "object") {
    throw new Error("Generated draft has an invalid shape");
  }

  const candidate = draft as Partial<SerializableWorkbenchDraft>;
  if (typeof candidate.title !== "string" || !candidate.title.trim()) {
    throw new Error("Generated draft title is invalid");
  }
  if (typeof candidate.subtitle !== "string") {
    throw new Error("Generated draft subtitle is invalid");
  }
  if (!Array.isArray(candidate.pageDrafts)) {
    throw new Error("Generated draft page list is invalid");
  }

  return {
    title: candidate.title.trim(),
    subtitle: candidate.subtitle.trim(),
    pageDrafts: candidate.pageDrafts.map((pageDraft, pageIndex) => {
      if (!pageDraft || typeof pageDraft !== "object") {
        throw new Error(`Generated page draft ${pageIndex + 1} is invalid`);
      }

      const nextPageDraft = pageDraft as {
        pageId?: unknown;
        summary?: unknown;
        scene?: unknown;
        blocks?: unknown;
      };
      if (typeof nextPageDraft.pageId !== "string" || !nextPageDraft.pageId.trim()) {
        throw new Error(`Generated page draft ${pageIndex + 1} has an invalid page id`);
      }
      if (typeof nextPageDraft.summary !== "string" || !nextPageDraft.summary.trim()) {
        throw new Error(`Generated page draft ${nextPageDraft.pageId} has an invalid summary`);
      }
      if (!Array.isArray(nextPageDraft.blocks) && !nextPageDraft.scene) {
        throw new Error(`Generated page draft ${nextPageDraft.pageId} has invalid scene content`);
      }
      const pageId = nextPageDraft.pageId.trim();

      return {
        pageId,
        summary: nextPageDraft.summary.trim(),
        scene: normalizeSlideScene(nextPageDraft.scene),
        markdown:
          typeof (pageDraft as { markdown?: unknown }).markdown === "string" &&
          (pageDraft as { markdown?: string }).markdown?.trim()
            ? (pageDraft as { markdown: string }).markdown
            : undefined,
        blocks: (Array.isArray(nextPageDraft.blocks) ? nextPageDraft.blocks : []).map((blockDraft, blockIndex) => {
          if (!blockDraft || typeof blockDraft !== "object") {
            throw new Error(
              `Generated block draft ${nextPageDraft.pageId}.${blockIndex + 1} is invalid`,
            );
          }
          const nextBlockDraft = blockDraft as {
            blockId?: unknown;
            summary?: unknown;
            metrics?: unknown;
            cards?: unknown;
            steps?: unknown;
            markdown?: unknown;
            adapterWarnings?: unknown;
          };
          if (typeof nextBlockDraft.blockId !== "string" || !nextBlockDraft.blockId.trim()) {
            throw new Error(`Generated block draft ${nextPageDraft.pageId}.${blockIndex + 1} has an invalid block id`);
          }
          if (typeof nextBlockDraft.summary !== "string" || !nextBlockDraft.summary.trim()) {
            throw new Error(`Generated block draft ${nextPageDraft.pageId}.${nextBlockDraft.blockId} has an invalid summary`);
          }
          const blockId = nextBlockDraft.blockId.trim();

          return {
            blockId,
            summary: nextBlockDraft.summary.trim(),
            metrics: Array.isArray(nextBlockDraft.metrics)
              ? nextBlockDraft.metrics.map((metric, metricIndex) =>
                  normalizeMetricFact(
                    metric,
                    pageId,
                    blockId,
                    metricIndex,
                  ),
                )
              : [],
            cards: Array.isArray(nextBlockDraft.cards)
              ? nextBlockDraft.cards.map((item, itemIndex) =>
                  normalizeNarrativeItem(
                    item,
                    pageId,
                    blockId,
                    itemIndex,
                  ),
                )
              : [],
            steps: Array.isArray(nextBlockDraft.steps)
              ? nextBlockDraft.steps.map((item, itemIndex) =>
                  normalizeNarrativeItem(
                    item,
                    pageId,
                    blockId,
                    itemIndex,
                  ),
                )
              : [],
            markdown:
              typeof nextBlockDraft.markdown === "string" && nextBlockDraft.markdown.trim()
                ? nextBlockDraft.markdown
                : undefined,
            adapterWarnings: Array.isArray(nextBlockDraft.adapterWarnings)
              ? nextBlockDraft.adapterWarnings.filter(
                  (warning): warning is string =>
                    typeof warning === "string" && warning.trim().length > 0,
                )
              : [],
          };
        }),
      };
    }),
  };
}

function normalizeGeneratedDraftAsset(
  asset: unknown,
  templateIdHint: TemplateId = DEFAULT_TEMPLATE_ID,
): GeneratedDraftAsset {
  if (!asset || typeof asset !== "object") {
    throw new Error("Generated draft asset has an invalid shape");
  }

  const candidate = asset as Partial<GeneratedDraftAsset>;
  const templateId = isTemplateId(candidate.templateId)
    ? candidate.templateId
    : templateIdHint;

  if (typeof candidate.version !== "number") {
    throw new Error("Generated draft asset version is invalid");
  }
  if (!isDraftProvider(candidate.provider)) {
    throw new Error("Generated draft asset provider is invalid");
  }
  if (typeof candidate.signature !== "string" || !candidate.signature.trim()) {
    throw new Error("Generated draft asset signature is invalid");
  }
  if (typeof candidate.generatedAt !== "string" || !candidate.generatedAt.trim()) {
    throw new Error("Generated draft asset timestamp is invalid");
  }

  return {
    version:
      candidate.version === 4
        ? 4
        : candidate.version === 3
          ? 3
          : candidate.version === 2
            ? 2
            : 1,
    templateId,
    provider: candidate.provider,
    mode: candidate.mode === "outline" ? "outline" : "content",
    model: typeof candidate.model === "string" && candidate.model.trim() ? candidate.model.trim() : null,
    signature: candidate.signature.trim(),
    generatedAt: candidate.generatedAt.trim(),
    draft: normalizeSerializableDraft(candidate.draft),
    htmlReport:
      candidate.htmlReport === undefined || candidate.htmlReport === null
        ? undefined
        : normalizeGeneratedHtmlReport(candidate.htmlReport),
  };
}

function normalizeGeneratedHtmlReport(value: unknown): GeneratedHtmlReport {
  if (!value || typeof value !== "object") {
    throw new Error("Generated HTML report has an invalid shape");
  }

  const candidate = value as Partial<GeneratedHtmlReport>;
  if (typeof candidate.title !== "string" || !candidate.title.trim()) {
    throw new Error("Generated HTML report title is invalid");
  }
  if (typeof candidate.html !== "string" || !candidate.html.trim()) {
    throw new Error("Generated HTML report markup is invalid");
  }
  if (!Number.isInteger(candidate.pageCount) || (candidate.pageCount ?? 0) < 1) {
    throw new Error("Generated HTML report page count is invalid");
  }
  if (!Array.isArray(candidate.pageTitles)) {
    throw new Error("Generated HTML report page titles are invalid");
  }

  const pageTitles = candidate.pageTitles
    .filter((title): title is string => typeof title === "string")
    .map((title) => title.trim())
    .filter(Boolean);
  const normalizedTypography = normalizeGeneratedHtmlReportTypography({
    html: candidate.html,
    pageTitles,
  });
  const structure = ensureHtmlEditableStructure({
    html: normalizedTypography.html,
    pageTitles,
    structure: candidate.structure,
  });
  const visualStructure = ensureHtmlVisualStructure({
    html: normalizedTypography.html,
    pageTitles,
    visualStructure: candidate.visualStructure,
  });
  const layoutStructure = ensureHtmlLayoutStructure({
    html: normalizedTypography.html,
    pageTitles,
    layoutStructure: candidate.layoutStructure,
  });

  return {
    title: candidate.title.trim(),
    html: normalizedTypography.html,
    pageCount: candidate.pageCount as number,
    pageTitles,
    htmlOutputMode: normalizeHtmlOutputMode(candidate.htmlOutputMode),
    animationStructure: normalizeHtmlAnimationStructure(candidate.animationStructure, {
      pageCount: candidate.pageCount as number,
    }),
    styleProfileId:
      typeof candidate.styleProfileId === "string" && candidate.styleProfileId.trim()
        ? candidate.styleProfileId.trim()
        : typeof candidate.styleProfile?.id === "string" && candidate.styleProfile.id.trim()
          ? candidate.styleProfile.id.trim()
          : undefined,
    styleProfile:
      candidate.styleProfile &&
      typeof candidate.styleProfile === "object" &&
      typeof candidate.styleProfile.id === "string" &&
      typeof candidate.styleProfile.pageBackground === "string" &&
      typeof candidate.styleProfile.surfaceFill === "string" &&
      typeof candidate.styleProfile.dividerColor === "string" &&
      typeof candidate.styleProfile.accentColor === "string"
        ? {
            id: candidate.styleProfile.id.trim(),
            label:
              typeof candidate.styleProfile.label === "string" && candidate.styleProfile.label.trim()
                ? candidate.styleProfile.label.trim()
                : "Generated style profile",
            industryLabel:
              typeof candidate.styleProfile.industryLabel === "string" &&
              candidate.styleProfile.industryLabel.trim()
                ? candidate.styleProfile.industryLabel.trim()
                : "Generated industry profile",
            summary:
              typeof candidate.styleProfile.summary === "string" && candidate.styleProfile.summary.trim()
                ? candidate.styleProfile.summary.trim()
                : "Implicitly resolved deck style profile.",
            materialDirection:
              typeof candidate.styleProfile.materialDirection === "string" &&
              candidate.styleProfile.materialDirection.trim()
                ? candidate.styleProfile.materialDirection.trim()
                : "Consulting-safe light material system.",
            toneNotes: Array.isArray(candidate.styleProfile.toneNotes)
              ? candidate.styleProfile.toneNotes
                  .filter((note): note is string => typeof note === "string")
                  .map((note) => note.trim())
                  .filter(Boolean)
              : [],
            pageBackground: candidate.styleProfile.pageBackground.trim(),
            surfaceFill: candidate.styleProfile.surfaceFill.trim(),
            surfaceSecondary:
              typeof candidate.styleProfile.surfaceSecondary === "string" &&
              candidate.styleProfile.surfaceSecondary.trim()
                ? candidate.styleProfile.surfaceSecondary.trim()
                : candidate.styleProfile.surfaceFill.trim(),
            dividerColor: candidate.styleProfile.dividerColor.trim(),
            accentColor: candidate.styleProfile.accentColor.trim(),
            textPrimary:
              typeof candidate.styleProfile.textPrimary === "string" &&
              candidate.styleProfile.textPrimary.trim()
                ? candidate.styleProfile.textPrimary.trim()
                : "#17283b",
            textMuted:
              typeof candidate.styleProfile.textMuted === "string" &&
              candidate.styleProfile.textMuted.trim()
                ? candidate.styleProfile.textMuted.trim()
                : "#617382",
            chartPalette: Array.isArray(candidate.styleProfile.chartPalette)
              ? candidate.styleProfile.chartPalette
                  .filter((color): color is string => typeof color === "string")
                  .map((color) => color.trim())
                  .filter(Boolean)
              : [],
          }
        : undefined,
    structure,
    visualStructure,
    layoutStructure,
    canvasOverrides: pruneGeneratedHtmlReportCanvasOverrides({
      overrides: normalizeGeneratedHtmlReportCanvasOverrides(candidate.canvasOverrides),
      structure,
      visualStructure,
    }),
    exportContract: normalizeDeckExportContract(candidate.exportContract, candidate.pageCount as number),
  };
}

function isExportObjectKind(value: unknown): value is ExportObjectKind {
  return (
    value === "native-chart" ||
    value === "matrix" ||
    value === "native-table" ||
    value === "comparison-grid" ||
    value === "metric-grid" ||
    value === "card-grid" ||
    value === "diagram" ||
    value === "text"
  );
}

function isExportRenderTarget(value: unknown): value is ExportRenderTarget {
  return (
    value === "native-chart" ||
    value === "native-table" ||
    value === "editable-shapes" ||
    value === "editable-text" ||
    value === "html-visual"
  );
}

function normalizeExportObjectContract(value: unknown, pageNumber: number): ExportObjectContract | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<ExportObjectContract>;
  if (
    typeof candidate.objectId !== "string" ||
    !candidate.objectId.trim() ||
    !isExportObjectKind(candidate.objectKind) ||
    !isExportRenderTarget(candidate.renderTarget)
  ) {
    return null;
  }
  const ownershipScope =
    candidate.ownershipScope && typeof candidate.ownershipScope === "object"
      ? candidate.ownershipScope
      : null;
  return {
    objectId: candidate.objectId.trim(),
    pageNumber,
    pageStory: typeof candidate.pageStory === "string" ? candidate.pageStory.trim() : "",
    primaryVisualObject:
      typeof candidate.primaryVisualObject === "string"
        ? candidate.primaryVisualObject.trim()
        : candidate.objectKind,
    objectKind: candidate.objectKind,
    dataContract:
      candidate.dataContract && typeof candidate.dataContract === "object" && !Array.isArray(candidate.dataContract)
        ? candidate.dataContract
        : null,
    renderTarget: candidate.renderTarget,
    ownershipScope: {
      rootId:
        typeof ownershipScope?.rootId === "string" && ownershipScope.rootId.trim()
          ? ownershipScope.rootId.trim()
          : candidate.objectId.trim(),
      ownsText: Boolean(ownershipScope?.ownsText),
      ownsShapes: Boolean(ownershipScope?.ownsShapes),
      ownsSvg: Boolean(ownershipScope?.ownsSvg),
      childRoles: Array.isArray(ownershipScope?.childRoles)
        ? ownershipScope.childRoles
            .filter((role): role is string => typeof role === "string")
            .map((role) => role.trim())
            .filter(Boolean)
            .slice(0, 24)
        : [],
    },
    forbiddenInterpretation: Array.isArray(candidate.forbiddenInterpretation)
      ? candidate.forbiddenInterpretation
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 16)
      : [],
  };
}

function normalizeDeckExportContract(value: unknown, pageCount: number): DeckExportContract | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as Partial<DeckExportContract>;
  if (candidate.version !== 1 || !Array.isArray(candidate.pages)) {
    return undefined;
  }
  const pages = candidate.pages
    .map((page) => {
      if (!page || typeof page !== "object") {
        return null;
      }
      const pageCandidate = page as Partial<DeckExportContract["pages"][number]>;
      const pageNumber =
        typeof pageCandidate.pageNumber === "number" && Number.isInteger(pageCandidate.pageNumber)
          ? pageCandidate.pageNumber
          : null;
      if (!pageNumber || pageNumber < 1 || pageNumber > pageCount) {
        return null;
      }
      const objects = Array.isArray(pageCandidate.objects)
        ? pageCandidate.objects
            .map((object) => normalizeExportObjectContract(object, pageNumber))
            .filter((object): object is ExportObjectContract => Boolean(object))
        : [];
      if (!objects.length) {
        return null;
      }
      return {
        pageNumber,
        pageStory: typeof pageCandidate.pageStory === "string" ? pageCandidate.pageStory.trim() : "",
        primaryVisualObject:
          typeof pageCandidate.primaryVisualObject === "string"
            ? pageCandidate.primaryVisualObject.trim()
            : objects[0]?.primaryVisualObject ?? "",
        objects,
      };
    })
    .filter((page): page is DeckExportContract["pages"][number] => Boolean(page));
  return pages.length ? { version: 1, pages } : undefined;
}

function normalizeProjectSnapshot(
  snapshot: unknown,
  templateIdHint: TemplateId = DEFAULT_TEMPLATE_ID,
): WorkbenchProjectSnapshot {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Project snapshot has an invalid shape");
  }

  const candidate = snapshot as Partial<WorkbenchProjectSnapshot>;
  const templateId = isTemplateId(candidate.templateId)
    ? candidate.templateId
    : templateIdHint;
  const projectName =
    typeof candidate.projectName === "string" && candidate.projectName.trim()
      ? candidate.projectName.trim()
      : getTemplateDefinition(templateId).defaultProjectName;
  const sourceText =
    typeof candidate.sourceText === "string"
      ? candidate.sourceText
      : getTemplateDefinition(templateId).defaultSourceText;
  const generatedDraft =
    candidate.generatedDraft === null || candidate.generatedDraft === undefined
      ? null
      : normalizeGeneratedDraftAsset(candidate.generatedDraft, templateId);
  const workflowStage = isWorkflowStage(candidate.workflowStage)
    ? candidate.workflowStage
    : generatedDraft
      ? generatedDraft.mode === "outline"
        ? "layout"
        : "generated"
      : "intake";
  const normalizedPages = normalizeImportedPages(candidate.pages);

  return {
    version: PROJECT_SNAPSHOT_VERSION,
    templateId,
    starterPackId: isStarterPackId(candidate.starterPackId) ? candidate.starterPackId : null,
    starterThemeId: isStarterPackThemeId(candidate.starterThemeId) ? candidate.starterThemeId : null,
    htmlOutputMode: normalizeHtmlOutputMode(candidate.htmlOutputMode),
    projectName,
    sourceText,
    generationMode: isWorkbenchGenerationMode(candidate.generationMode)
      ? candidate.generationMode
      : "standard",
    moduleUsageMode: isWorkbenchModuleUsageMode(candidate.moduleUsageMode)
      ? candidate.moduleUsageMode
      : "disabled",
    requestedPageCount:
      Number.isInteger(candidate.requestedPageCount) && (candidate.requestedPageCount ?? 0) >= 1
        ? candidate.requestedPageCount ?? null
        : null,
    longFormClarification: normalizeLongFormClarificationState(candidate.longFormClarification),
    deckOptimization: normalizeDeckOptimizationState(candidate.deckOptimization),
    pages: normalizedPages,
    starterBindings: normalizeStarterBindings(candidate.starterBindings, normalizedPages),
    starterApplicationMode:
      candidate.starterApplicationMode === "theme" ||
      candidate.starterApplicationMode === "mixed" ||
      candidate.starterApplicationMode === "deck"
        ? candidate.starterApplicationMode
        : resolveStarterApplicationMode({
            starterPackId: candidate.starterPackId,
            starterThemeId: candidate.starterThemeId,
            starterBindings: candidate.starterBindings as Record<string, string> | undefined,
          }),
    workflowStage,
    generatedDraft,
    capturedAt:
      typeof candidate.capturedAt === "string" && candidate.capturedAt.trim()
        ? candidate.capturedAt.trim()
        : new Date().toISOString(),
  };
}

function normalizeGenerationHistoryEntry(
  entry: unknown,
  templateIdHint: TemplateId = DEFAULT_TEMPLATE_ID,
): GenerationHistoryEntry {
  if (!entry || typeof entry !== "object") {
    throw new Error("Generation history entry has an invalid shape");
  }

  const candidate = entry as Partial<GenerationHistoryEntry>;
  const snapshot = normalizeProjectSnapshot(candidate.snapshot, templateIdHint);
  const mode = candidate.mode === "outline" ? "outline" : "content";
  const asset =
    snapshot.generatedDraft && snapshot.generatedDraft.mode === mode
      ? snapshot.generatedDraft
      : snapshot.generatedDraft;

  return {
    id:
      typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id.trim()
        : createVersionId("gen"),
    version: GENERATION_HISTORY_VERSION,
    mode,
    provider: isDraftProvider(candidate.provider) ? candidate.provider : asset?.provider ?? "local",
    model:
      typeof candidate.model === "string" && candidate.model.trim()
        ? candidate.model.trim()
        : asset?.model ?? null,
    signature:
      typeof candidate.signature === "string" && candidate.signature.trim()
        ? candidate.signature.trim()
        : asset?.signature ?? "",
    createdAt:
      typeof candidate.createdAt === "string" && candidate.createdAt.trim()
        ? candidate.createdAt.trim()
        : snapshot.capturedAt,
    snapshot,
  };
}

function normalizePublishSnapshot(
  entry: unknown,
  templateIdHint: TemplateId = DEFAULT_TEMPLATE_ID,
): PublishSnapshot {
  if (!entry || typeof entry !== "object") {
    throw new Error("Publish snapshot has an invalid shape");
  }

  const candidate = entry as Partial<PublishSnapshot>;
  const snapshot = normalizeProjectSnapshot(candidate.snapshot, templateIdHint);
  const format: PublishSnapshotFormat =
    candidate.format === "html" || candidate.format === "pdf" ? candidate.format : "web";

  return {
    id:
      typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id.trim()
        : createVersionId("publish"),
    version: PUBLISH_SNAPSHOT_VERSION,
    format,
    signature:
      typeof candidate.signature === "string" && candidate.signature.trim()
        ? candidate.signature.trim()
        : snapshot.generatedDraft?.signature ?? "",
    createdAt:
      typeof candidate.createdAt === "string" && candidate.createdAt.trim()
        ? candidate.createdAt.trim()
        : snapshot.capturedAt,
    publishedUrl:
      typeof candidate.publishedUrl === "string" && candidate.publishedUrl.trim()
        ? candidate.publishedUrl.trim()
        : null,
    snapshot,
  };
}

function normalizeStoredProject(
  project: unknown,
  templateIdHint: TemplateId = DEFAULT_TEMPLATE_ID,
): WorkbenchProject {
  if (!project || typeof project !== "object") {
    throw new Error("Stored project has an invalid shape");
  }

  const candidate = project as Partial<WorkbenchProject>;
  const templateId = isTemplateId(candidate.templateId)
    ? candidate.templateId
    : templateIdHint;
  const template = getTemplateDefinition(templateId);
  const exportedAt =
    typeof candidate.exportedAt === "string" && candidate.exportedAt
      ? candidate.exportedAt
      : new Date().toISOString();
  const updatedAt =
    typeof candidate.updatedAt === "string" && candidate.updatedAt
      ? candidate.updatedAt
      : exportedAt;
  const normalizedGeneratedDraft =
    candidate.generatedDraft === null || candidate.generatedDraft === undefined
      ? null
      : normalizeGeneratedDraftAsset(candidate.generatedDraft, templateId);
  const generationHistory = Array.isArray(candidate.generationHistory)
    ? candidate.generationHistory.map((entry) =>
        normalizeGenerationHistoryEntry(entry, templateId),
      )
    : [];
  const publishSnapshots = Array.isArray(candidate.publishSnapshots)
    ? candidate.publishSnapshots.map((entry) =>
        normalizePublishSnapshot(entry, templateId),
      )
    : [];
  const workflowStage = isWorkflowStage(candidate.workflowStage)
    ? candidate.workflowStage
    : normalizedGeneratedDraft
      ? normalizedGeneratedDraft.mode === "outline"
        ? "layout"
        : "generated"
      : "intake";
  const normalizedPages = normalizeImportedPages(candidate.pages);
  const briefMessages = Array.isArray(candidate.briefMessages)
    ? candidate.briefMessages.map((message, index) =>
        normalizeConversationMessage(message, `briefMessages.${index + 1}`),
      )
    : [];

  return {
    id:
      typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id.trim()
        : createProjectId(),
    version:
      typeof candidate.version === "number"
        ? candidate.version
        : PROJECT_BUNDLE_VERSION,
    templateId,
    starterPackId: isStarterPackId(candidate.starterPackId) ? candidate.starterPackId : null,
    starterThemeId: isStarterPackThemeId(candidate.starterThemeId) ? candidate.starterThemeId : null,
    htmlOutputMode: normalizeHtmlOutputMode(candidate.htmlOutputMode),
    projectName:
      typeof candidate.projectName === "string" && candidate.projectName.trim()
        ? candidate.projectName.trim()
        : template.defaultProjectName,
    sourceText:
      typeof candidate.sourceText === "string"
        ? candidate.sourceText
        : template.defaultSourceText,
    generationMode: isWorkbenchGenerationMode(candidate.generationMode)
      ? candidate.generationMode
      : "standard",
    moduleUsageMode: isWorkbenchModuleUsageMode(candidate.moduleUsageMode)
      ? candidate.moduleUsageMode
      : "disabled",
    requestedPageCount:
      Number.isInteger(candidate.requestedPageCount) && (candidate.requestedPageCount ?? 0) >= 1
        ? candidate.requestedPageCount ?? null
        : null,
    longFormClarification: normalizeLongFormClarificationState(candidate.longFormClarification),
    deckOptimization: normalizeDeckOptimizationState(candidate.deckOptimization),
    briefMessages,
    pages: normalizedPages,
    starterBindings: normalizeStarterBindings(candidate.starterBindings, normalizedPages),
    starterApplicationMode:
      candidate.starterApplicationMode === "theme" ||
      candidate.starterApplicationMode === "mixed" ||
      candidate.starterApplicationMode === "deck"
        ? candidate.starterApplicationMode
        : resolveStarterApplicationMode({
            starterPackId: candidate.starterPackId,
            starterThemeId: candidate.starterThemeId,
            starterBindings: candidate.starterBindings as Record<string, string> | undefined,
          }),
    generatedDraft: normalizedGeneratedDraft,
    generationHistory,
    publishSnapshots,
    workflowStage,
    updatedAt,
    exportedAt,
  };
}

function normalizeStoredWorkspace(workspace: unknown): WorkbenchWorkspace {
  if (!workspace || typeof workspace !== "object") {
    throw new Error("Stored workspace has an invalid shape");
  }

  const candidate = workspace as Partial<WorkbenchWorkspace>;
  if (!Array.isArray(candidate.projects) || candidate.projects.length === 0) {
    throw new Error("Stored workspace does not contain projects");
  }

  const projects = candidate.projects.map((project) => normalizeStoredProject(project));
  const exportedAt =
    typeof candidate.exportedAt === "string" && candidate.exportedAt.trim()
      ? candidate.exportedAt.trim()
      : new Date().toISOString();
  const updatedAt =
    typeof candidate.updatedAt === "string" && candidate.updatedAt.trim()
      ? candidate.updatedAt.trim()
      : exportedAt;
  const createdAt =
    typeof candidate.createdAt === "string" && candidate.createdAt.trim()
      ? candidate.createdAt.trim()
      : updatedAt;
  const activeProjectId =
    typeof candidate.activeProjectId === "string" &&
    projects.some((project) => project.id === candidate.activeProjectId)
      ? candidate.activeProjectId
      : projects[0].id;

  return {
    id:
      typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id.trim()
        : createWorkspaceId(),
    version:
      typeof candidate.version === "number"
        ? candidate.version
        : WORKSPACE_BUNDLE_VERSION,
    name:
      typeof candidate.name === "string" && candidate.name.trim()
        ? candidate.name.trim()
        : "My workspace",
    projects,
    activeProjectId,
    createdAt,
    updatedAt,
    exportedAt,
  };
}

function migrateLegacyProjectLibrary(): StoredWorkspaceLibrary {
  const templateId = readLegacyTemplateId();
  const project = createStoredProjectRecord({
    templateId,
    projectName: readLegacyProjectName(templateId),
    sourceText: readLegacySourceText(templateId),
    pages: readLegacyPages(templateId),
    generatedDraft: readLegacyGeneratedDraft(templateId),
  });

  const workspace = createStoredWorkspaceRecord({
    name: "My workspace",
    projects: [project],
    activeProjectId: project.id,
  });

  return {
    version: WORKSPACE_LIBRARY_VERSION,
    activeWorkspaceId: workspace.id,
    workspaces: [workspace],
  };
}

function loadWorkspaceLibrary(): StoredWorkspaceLibrary {
  if (inMemoryWorkspaceLibrary) {
    return cloneWorkspaceLibrary(inMemoryWorkspaceLibrary);
  }

  if (typeof window === "undefined") {
    const workspace = createStoredWorkspaceRecord({
      projects: [createStoredProjectRecord({ templateId: DEFAULT_TEMPLATE_ID })],
    });
    const nextLibrary = {
      version: WORKSPACE_LIBRARY_VERSION,
      activeWorkspaceId: workspace.id,
      workspaces: [workspace],
    };
    inMemoryWorkspaceLibrary = cloneWorkspaceLibrary(nextLibrary);
    return nextLibrary;
  }

  const raw = window.localStorage.getItem(PROJECT_LIBRARY_STORAGE_KEY);
  if (!raw) {
    const migrated = migrateLegacyProjectLibrary();
    inMemoryWorkspaceLibrary = cloneWorkspaceLibrary(migrated);
    safeSetLocalStorageItem(PROJECT_LIBRARY_STORAGE_KEY, JSON.stringify(migrated));
    syncLegacyActiveProjectSnapshot(migrated.workspaces[0].projects[0]);
    return migrated;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeWorkspaceLibrarySnapshot(parsed);
    inMemoryWorkspaceLibrary = cloneWorkspaceLibrary(normalized);
    return normalized;
  } catch {
    const migrated = migrateLegacyProjectLibrary();
    inMemoryWorkspaceLibrary = cloneWorkspaceLibrary(migrated);
    safeSetLocalStorageItem(PROJECT_LIBRARY_STORAGE_KEY, JSON.stringify(migrated));
    syncLegacyActiveProjectSnapshot(migrated.workspaces[0].projects[0]);
    return migrated;
  }
}

function normalizeWorkspaceLibrarySnapshot(input: unknown): WorkspaceLibrarySnapshot {
  const parsed = input as {
    version?: unknown;
    activeWorkspaceId?: unknown;
    workspaces?: unknown;
    activeProjectId?: unknown;
    projects?: unknown;
  };

  if (Array.isArray(parsed.workspaces) && parsed.workspaces.length > 0) {
    const workspaces = parsed.workspaces.map((workspace) =>
      normalizeStoredWorkspace(workspace),
    );
    const activeWorkspaceId =
      typeof parsed.activeWorkspaceId === "string" &&
      workspaces.some((workspace) => workspace.id === parsed.activeWorkspaceId)
        ? parsed.activeWorkspaceId
        : workspaces[0].id;

    return {
      version: WORKSPACE_LIBRARY_VERSION,
      activeWorkspaceId,
      workspaces,
    };
  }

  if (Array.isArray(parsed.projects) && parsed.projects.length > 0) {
    const workspace = createStoredWorkspaceRecord({
      name: "My workspace",
      projects: parsed.projects.map((project) => normalizeStoredProject(project)),
      activeProjectId:
        typeof parsed.activeProjectId === "string" ? parsed.activeProjectId : undefined,
    });

    return {
      version: WORKSPACE_LIBRARY_VERSION,
      activeWorkspaceId: workspace.id,
      workspaces: [workspace],
    };
  }

  throw new Error("Workspace library is empty");
}

function reconcileProjectRecords(
  remoteProjects: WorkbenchProject[],
  localProjects: WorkbenchProject[],
) {
  const merged = new Map<string, WorkbenchProject>();

  for (const remoteProject of remoteProjects) {
    merged.set(remoteProject.id, cloneProject(remoteProject));
  }

  for (const localProject of localProjects) {
    const existing = merged.get(localProject.id);
    if (!existing) {
      merged.set(localProject.id, cloneProject(localProject));
      continue;
    }

    if (compareIsoTimestamp(localProject.updatedAt, existing.updatedAt) > 0) {
      merged.set(localProject.id, cloneProject(localProject));
    }
  }

  const mergedProjects = Array.from(merged.values()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  const visibleProjects = mergedProjects.filter((project) => !isStarterShellProject(project));

  return visibleProjects.length > 0 ? visibleProjects : mergedProjects;
}

export function reconcileWorkspaceLibrarySnapshots(
  remoteSnapshot: unknown,
  localSnapshot?: unknown,
): WorkspaceLibrarySnapshot {
  const remote = normalizeWorkspaceLibrarySnapshot(remoteSnapshot);
  if (!localSnapshot) {
    return remote;
  }

  let local: WorkspaceLibrarySnapshot;
  try {
    local = normalizeWorkspaceLibrarySnapshot(localSnapshot);
  } catch {
    return remote;
  }

  const workspaceMap = new Map<string, WorkbenchWorkspace>();

  for (const remoteWorkspace of remote.workspaces) {
    workspaceMap.set(remoteWorkspace.id, cloneWorkspace(remoteWorkspace));
  }

  for (const localWorkspace of local.workspaces) {
    const existing = workspaceMap.get(localWorkspace.id);
    if (!existing) {
      const visibleProjects = reconcileProjectRecords([], localWorkspace.projects);
      if (visibleProjects.length === 0) {
        continue;
      }
      workspaceMap.set(
        localWorkspace.id,
        createStoredWorkspaceRecord({
          ...localWorkspace,
          projects: visibleProjects,
          activeProjectId:
            visibleProjects.find((project) => project.id === localWorkspace.activeProjectId)?.id ??
            visibleProjects[0]?.id,
        }),
      );
      continue;
    }

    const mergedProjects = reconcileProjectRecords(existing.projects, localWorkspace.projects);
    const mergedWorkspace = createStoredWorkspaceRecord({
      ...existing,
      name: existing.name || localWorkspace.name,
      projects: mergedProjects,
      activeProjectId:
        mergedProjects.find((project) => project.id === existing.activeProjectId)?.id ??
        mergedProjects.find((project) => project.id === localWorkspace.activeProjectId)?.id ??
        mergedProjects[0]?.id,
      createdAt:
        compareIsoTimestamp(existing.createdAt, localWorkspace.createdAt) <= 0
          ? existing.createdAt
          : localWorkspace.createdAt,
      updatedAt:
        compareIsoTimestamp(existing.updatedAt, localWorkspace.updatedAt) >= 0
          ? existing.updatedAt
          : localWorkspace.updatedAt,
      exportedAt:
        compareIsoTimestamp(existing.exportedAt, localWorkspace.exportedAt) >= 0
          ? existing.exportedAt
          : localWorkspace.exportedAt,
    });
    workspaceMap.set(mergedWorkspace.id, mergedWorkspace);
  }

  const workspaces = Array.from(workspaceMap.values()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  const activeWorkspaceId =
    workspaces.find((workspace) => workspace.id === remote.activeWorkspaceId)?.id ??
    workspaces.find((workspace) => workspace.id === local.activeWorkspaceId)?.id ??
    workspaces[0]?.id;

  return {
    version: WORKSPACE_LIBRARY_VERSION,
    activeWorkspaceId,
    workspaces,
  };
}

function persistWorkspaceLibrary(library: StoredWorkspaceLibrary) {
  const normalizedWorkspaces =
    library.workspaces.length > 0
      ? library.workspaces.map(cloneWorkspace)
      : [createStoredWorkspaceRecord()];
  const activeWorkspace =
    normalizedWorkspaces.find((workspace) => workspace.id === library.activeWorkspaceId) ??
    normalizedWorkspaces[0];
  const activeProject =
    activeWorkspace.projects.find((project) => project.id === activeWorkspace.activeProjectId) ??
    activeWorkspace.projects[0];
  const nextLibrary = {
    version: WORKSPACE_LIBRARY_VERSION,
    activeWorkspaceId: activeWorkspace.id,
    workspaces: normalizedWorkspaces,
  } satisfies StoredWorkspaceLibrary;

  inMemoryWorkspaceLibrary = cloneWorkspaceLibrary(nextLibrary);
  safeSetLocalStorageItem(PROJECT_LIBRARY_STORAGE_KEY, JSON.stringify(nextLibrary));
  syncLegacyActiveProjectSnapshot(activeProject);

  return nextLibrary;
}

export function exportWorkspaceLibrarySnapshot(): WorkspaceLibrarySnapshot {
  return loadWorkspaceLibrary();
}

export function isStoredProjectStarterShell(project: WorkbenchProject | null | undefined) {
  return project ? isStarterShellProject(project) : false;
}

export function importWorkspaceLibrarySnapshot(snapshot: unknown) {
  const normalized = normalizeWorkspaceLibrarySnapshot(snapshot);
  const nextLibrary = persistWorkspaceLibrary(normalized);
  const activeWorkspace =
    nextLibrary.workspaces.find((workspace) => workspace.id === nextLibrary.activeWorkspaceId) ??
    nextLibrary.workspaces[0];
  const activeProject =
    activeWorkspace.projects.find((project) => project.id === activeWorkspace.activeProjectId) ??
    activeWorkspace.projects[0];

  return {
    library: nextLibrary,
    workspace: cloneWorkspace(activeWorkspace),
    project: cloneProject(activeProject),
  };
}

function resolveWorkspace(
  library: StoredWorkspaceLibrary,
  workspaceId?: string,
) {
  const workspace =
    (workspaceId
      ? library.workspaces.find((entry) => entry.id === workspaceId)
      : null) ??
    library.workspaces.find((entry) => entry.id === library.activeWorkspaceId) ??
    library.workspaces[0];

  return { library, workspace };
}

function replaceWorkspaceInLibrary(
  library: StoredWorkspaceLibrary,
  workspace: WorkbenchWorkspace,
) {
  return {
    ...library,
    workspaces: library.workspaces.map((entry) =>
      entry.id === workspace.id ? cloneWorkspace(workspace) : cloneWorkspace(entry),
    ),
  } satisfies StoredWorkspaceLibrary;
}

function ensureProjectForTemplate(
  library: StoredWorkspaceLibrary,
  workspaceId?: string,
  templateId?: TemplateId,
) {
  const { workspace } = resolveWorkspace(library, workspaceId);
  if (!templateId || workspace.projects.some((project) => project.templateId === templateId)) {
    return { library, workspace };
  }

  const nextProject = createStoredProjectRecord({ templateId });
  const nextWorkspace = createStoredWorkspaceRecord({
    ...workspace,
    id: workspace.id,
    name: workspace.name,
    projects: [...workspace.projects, nextProject],
    activeProjectId: nextProject.id,
    createdAt: workspace.createdAt,
    updatedAt: new Date().toISOString(),
    exportedAt: workspace.exportedAt,
  });
  const nextLibrary = persistWorkspaceLibrary({
    ...replaceWorkspaceInLibrary(library, nextWorkspace),
    activeWorkspaceId: nextWorkspace.id,
  });

  return {
    library: nextLibrary,
    workspace:
      nextLibrary.workspaces.find((entry) => entry.id === nextWorkspace.id) ??
      nextLibrary.workspaces[0],
  };
}

function resolveProject(
  library: StoredWorkspaceLibrary,
  options: { templateId?: TemplateId; projectId?: string; workspaceId?: string } = {},
) {
  const inferredWorkspaceId =
    options.workspaceId ??
    (options.projectId
      ? library.workspaces.find((workspace) =>
          workspace.projects.some((project) => project.id === options.projectId),
        )?.id
      : undefined);
  const ensured = ensureProjectForTemplate(
    library,
    inferredWorkspaceId,
    options.templateId,
  );
  const nextLibrary = ensured.library;
  const workspace = ensured.workspace;
  const byTemplate = options.templateId
    ? workspace.projects.filter((project) => project.templateId === options.templateId)
    : workspace.projects;

  const resolved =
    (options.projectId
      ? byTemplate.find((project) => project.id === options.projectId)
      : null) ??
    byTemplate.find((project) => project.id === workspace.activeProjectId) ??
    byTemplate[0] ??
    workspace.projects[0];

  return {
    library: nextLibrary,
    workspace,
    project: resolved,
  };
}

function replaceProjectInWorkspace(
  workspace: WorkbenchWorkspace,
  project: WorkbenchProject,
) {
  return createStoredWorkspaceRecord({
    ...workspace,
    id: workspace.id,
    name: workspace.name,
    projects: workspace.projects.map((entry) =>
      entry.id === project.id ? project : entry,
    ),
    activeProjectId: project.id,
    createdAt: workspace.createdAt,
    updatedAt: new Date().toISOString(),
    exportedAt: workspace.exportedAt,
  });
}

function persistProjectUpdate(
  options: { templateId?: TemplateId; projectId?: string; workspaceId?: string } = {},
  updater: (project: WorkbenchProject) => WorkbenchProject,
) {
  const { library, workspace, project } = resolveProject(loadWorkspaceLibrary(), options);
  const updatedProject = updater(project);
  const updatedWorkspace = replaceProjectInWorkspace(workspace, updatedProject);
  persistWorkspaceLibrary({
    ...replaceWorkspaceInLibrary(library, updatedWorkspace),
    activeWorkspaceId: updatedWorkspace.id,
  });
  return cloneProject(updatedProject);
}

export function createProjectPublishSignature(
  snapshot: WorkbenchProjectSnapshot,
  format: PublishSnapshotFormat,
) {
  return JSON.stringify({
    format,
    templateId: snapshot.templateId,
    projectName: snapshot.projectName,
    workflowStage: snapshot.workflowStage,
    pages: snapshot.pages,
    generatedDraftSignature: snapshot.generatedDraft?.signature ?? null,
    generatedDraftMode: snapshot.generatedDraft?.mode ?? null,
  });
}

export function persistPages(pages: LayoutPage[], workspaceId?: string) {
  persistProjectUpdate({ workspaceId }, (project) =>
    createStoredProjectRecord({
      ...project,
      id: project.id,
      updatedAt: new Date().toISOString(),
      exportedAt: project.exportedAt,
      pages,
    }),
  );
}

export function persistProjectSnapshot(args: {
  templateId: TemplateId;
  projectName: string;
  sourceText: string;
  generationMode: WorkbenchGenerationMode;
  moduleUsageMode: WorkbenchProject["moduleUsageMode"];
  requestedPageCount: number | null;
  longFormClarification: WorkbenchLongFormClarificationState;
  deckOptimization: WorkbenchDeckOptimizationState;
  briefMessages: ConversationMessage[];
  pages: LayoutPage[];
  generatedDraft: GeneratedDraftAsset | null;
  workflowStage: WorkflowStage;
  generationHistory: GenerationHistoryEntry[];
  publishSnapshots: PublishSnapshot[];
  workspaceId?: string;
}) {
  persistProjectUpdate({ workspaceId: args.workspaceId }, (project) =>
    createStoredProjectRecord({
      ...project,
      id: project.id,
      templateId: args.templateId,
      projectName: args.projectName,
      sourceText: args.sourceText,
      generationMode: args.generationMode,
      moduleUsageMode: args.moduleUsageMode,
      requestedPageCount: args.requestedPageCount,
      longFormClarification: args.longFormClarification,
      deckOptimization: args.deckOptimization,
      briefMessages: args.briefMessages,
      pages: args.pages,
      generatedDraft: args.generatedDraft,
      workflowStage: args.workflowStage,
      generationHistory: args.generationHistory,
      publishSnapshots: args.publishSnapshots,
      updatedAt: new Date().toISOString(),
      exportedAt: project.exportedAt,
    }),
  );
}

export function persistTemplateId(templateId: TemplateId, workspaceId?: string) {
  persistProjectUpdate({ workspaceId }, (project) => {
    const template = getTemplateDefinition(templateId);
    return createStoredProjectRecord({
      ...project,
      id: project.id,
      templateId,
      projectName: project.projectName || template.defaultProjectName,
      sourceText: project.sourceText || template.defaultSourceText,
      updatedAt: new Date().toISOString(),
      exportedAt: project.exportedAt,
    });
  });
}

export function persistSourceText(sourceText: string, workspaceId?: string) {
  persistProjectUpdate({ workspaceId }, (project) =>
    createStoredProjectRecord({
      ...project,
      id: project.id,
      sourceText,
      updatedAt: new Date().toISOString(),
      exportedAt: project.exportedAt,
    }),
  );
}

export function persistBriefMessages(briefMessages: ConversationMessage[], workspaceId?: string) {
  persistProjectUpdate({ workspaceId }, (project) =>
    createStoredProjectRecord({
      ...project,
      id: project.id,
      briefMessages,
      updatedAt: new Date().toISOString(),
      exportedAt: project.exportedAt,
    }),
  );
}

export function persistProjectName(projectName: string, workspaceId?: string) {
  persistProjectUpdate({ workspaceId }, (project) =>
    createStoredProjectRecord({
      ...project,
      id: project.id,
      projectName,
      updatedAt: new Date().toISOString(),
      exportedAt: project.exportedAt,
    }),
  );
}

export function persistWorkspaceName(name: string, workspaceId?: string) {
  const { library, workspace } = resolveWorkspace(loadWorkspaceLibrary(), workspaceId);
  const updatedWorkspace = createStoredWorkspaceRecord({
    ...workspace,
    id: workspace.id,
    name,
    projects: workspace.projects,
    activeProjectId: workspace.activeProjectId,
    createdAt: workspace.createdAt,
    updatedAt: new Date().toISOString(),
    exportedAt: workspace.exportedAt,
  });
  persistWorkspaceLibrary({
    ...replaceWorkspaceInLibrary(library, updatedWorkspace),
    activeWorkspaceId: updatedWorkspace.id,
  });
}

export function loadStoredGeneratedDraft(
  templateId: TemplateId = DEFAULT_TEMPLATE_ID,
  workspaceId?: string,
) {
  return cloneGeneratedDraft(loadStoredProject(templateId, undefined, workspaceId).generatedDraft);
}

export function persistGeneratedDraft(asset: GeneratedDraftAsset | null, workspaceId?: string) {
  persistProjectUpdate({ workspaceId }, (project) =>
    createStoredProjectRecord({
      ...project,
      id: project.id,
      generatedDraft: asset,
      workflowStage: asset ? (asset.mode === "outline" ? "layout" : "generated") : project.workflowStage,
      updatedAt: new Date().toISOString(),
      exportedAt: project.exportedAt,
    }),
  );
}

export function persistWorkflowStage(workflowStage: WorkflowStage, workspaceId?: string) {
  persistProjectUpdate({ workspaceId }, (project) =>
    createStoredProjectRecord({
      ...project,
      id: project.id,
      workflowStage,
      updatedAt: new Date().toISOString(),
      exportedAt: project.exportedAt,
    }),
  );
}

export function persistProjectVersionAssets(
  generationHistory: GenerationHistoryEntry[],
  publishSnapshots: PublishSnapshot[],
  workspaceId?: string,
) {
  persistProjectUpdate({ workspaceId }, (project) =>
    createStoredProjectRecord({
      ...project,
      id: project.id,
      generationHistory,
      publishSnapshots,
      updatedAt: project.updatedAt,
      exportedAt: project.exportedAt,
    }),
  );
}

export function loadStoredWorkspace(workspaceId?: string): WorkbenchWorkspace {
  const { workspace } = resolveWorkspace(loadWorkspaceLibrary(), workspaceId);
  return cloneWorkspace(workspace);
}

export function loadStoredWorkspaceById(workspaceId: string): WorkbenchWorkspace | null {
  const library = loadWorkspaceLibrary();
  const workspace = library.workspaces.find((entry) => entry.id === workspaceId);
  return workspace ? cloneWorkspace(workspace) : null;
}

export function loadStoredWorkspaceSummaries(): WorkbenchWorkspaceSummary[] {
  return loadWorkspaceLibrary().workspaces
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(summarizeWorkspace);
}

export function loadStoredProject(
  templateId?: TemplateId,
  projectId?: string,
  workspaceId?: string,
): WorkbenchProject {
  const { project } = resolveProject(loadWorkspaceLibrary(), { templateId, projectId, workspaceId });
  return cloneProject(project);
}

export function loadStoredProjectById(
  projectId: string,
  templateId?: TemplateId,
  workspaceId?: string,
): WorkbenchProject | null {
  const library = loadWorkspaceLibrary();
  const workspaces = workspaceId
    ? library.workspaces.filter((entry) => entry.id === workspaceId)
    : library.workspaces;
  const project = workspaces
    .flatMap((workspace) => workspace.projects)
    .find(
      (entry) => entry.id === projectId && (templateId ? entry.templateId === templateId : true),
    );
  return project ? cloneProject(project) : null;
}

export function loadStoredProjectSummaries(
  templateId?: TemplateId,
  workspaceId?: string,
): WorkbenchProjectSummary[] {
  const { library, workspace } = ensureProjectForTemplate(
    loadWorkspaceLibrary(),
    workspaceId,
    templateId,
  );
  const nextWorkspace =
    library.workspaces.find((entry) => entry.id === workspace.id) ?? workspace;
  return nextWorkspace.projects
    .filter((project) => (templateId ? project.templateId === templateId : true))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((project) => summarizeProject(project, nextWorkspace));
}

export function loadAllStoredProjectSummaries(templateId?: TemplateId): WorkbenchProjectSummary[] {
  return loadWorkspaceLibrary().workspaces
    .flatMap((workspace) =>
      workspace.projects
        .filter((project) => (templateId ? project.templateId === templateId : true))
        .map((project) => summarizeProject(project, workspace)),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function persistActiveWorkspaceId(workspaceId: string) {
  const library = loadWorkspaceLibrary();
  if (!library.workspaces.some((workspace) => workspace.id === workspaceId)) {
    throw new Error("Workspace not found");
  }

  persistWorkspaceLibrary({
    ...library,
    activeWorkspaceId: workspaceId,
  });
}

export function persistActiveProjectId(projectId: string, workspaceId?: string) {
  const { library, workspace } = resolveWorkspace(loadWorkspaceLibrary(), workspaceId);
  if (!workspace.projects.some((project) => project.id === projectId)) {
    throw new Error("Project not found");
  }

  const updatedWorkspace = createStoredWorkspaceRecord({
    ...workspace,
    id: workspace.id,
    name: workspace.name,
    projects: workspace.projects,
    activeProjectId: projectId,
    createdAt: workspace.createdAt,
    updatedAt: new Date().toISOString(),
    exportedAt: workspace.exportedAt,
  });
  persistWorkspaceLibrary({
    ...replaceWorkspaceInLibrary(library, updatedWorkspace),
    activeWorkspaceId: updatedWorkspace.id,
  });
}

export function createStoredWorkspace(name?: string, templateId: TemplateId = DEFAULT_TEMPLATE_ID) {
  const library = loadWorkspaceLibrary();
  const project = createStoredProjectRecord({ templateId });
  const workspace = createStoredWorkspaceRecord({
    name,
    projects: [project],
    activeProjectId: project.id,
  });
  persistWorkspaceLibrary({
    ...library,
    activeWorkspaceId: workspace.id,
    workspaces: [...library.workspaces.map(cloneWorkspace), workspace],
  });
  return cloneWorkspace(workspace);
}

export function createStoredProject(
  templateId: TemplateId = DEFAULT_TEMPLATE_ID,
  projectName?: string,
  workspaceId?: string,
) {
  const { library, workspace } = resolveWorkspace(loadWorkspaceLibrary(), workspaceId);
  const project = createStoredProjectRecord({ templateId, projectName });
  const updatedWorkspace = createStoredWorkspaceRecord({
    ...workspace,
    id: workspace.id,
    name: workspace.name,
    projects: [...workspace.projects, project],
    activeProjectId: project.id,
    createdAt: workspace.createdAt,
    updatedAt: new Date().toISOString(),
    exportedAt: workspace.exportedAt,
  });
  persistWorkspaceLibrary({
    ...replaceWorkspaceInLibrary(library, updatedWorkspace),
    activeWorkspaceId: updatedWorkspace.id,
  });
  return cloneProject(project);
}

export function duplicateStoredProject(projectId: string, workspaceId?: string) {
  const { library, workspace } = resolveWorkspace(loadWorkspaceLibrary(), workspaceId);
  const project = workspace.projects.find((entry) => entry.id === projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  const duplicate = createStoredProjectRecord({
    templateId: project.templateId,
    projectName: `${project.projectName} Copy`,
    sourceText: project.sourceText,
    briefMessages: project.briefMessages,
    pages: project.pages,
    generatedDraft: project.generatedDraft,
    generationHistory: project.generationHistory,
    publishSnapshots: project.publishSnapshots,
    workflowStage: project.workflowStage,
  });
  const updatedWorkspace = createStoredWorkspaceRecord({
    ...workspace,
    id: workspace.id,
    name: workspace.name,
    projects: [...workspace.projects, duplicate],
    activeProjectId: duplicate.id,
    createdAt: workspace.createdAt,
    updatedAt: new Date().toISOString(),
    exportedAt: workspace.exportedAt,
  });
  persistWorkspaceLibrary({
    ...replaceWorkspaceInLibrary(library, updatedWorkspace),
    activeWorkspaceId: updatedWorkspace.id,
  });
  return cloneProject(duplicate);
}

export function deleteStoredWorkspace(workspaceId: string) {
  const library = loadWorkspaceLibrary();
  const remaining = library.workspaces.filter((workspace) => workspace.id !== workspaceId);
  if (remaining.length === 0) {
    const fallbackWorkspace = createStoredWorkspaceRecord();
    persistWorkspaceLibrary({
      version: WORKSPACE_LIBRARY_VERSION,
      activeWorkspaceId: fallbackWorkspace.id,
      workspaces: [fallbackWorkspace],
    });
    return cloneWorkspace(fallbackWorkspace);
  }

  const nextWorkspace =
    remaining.find((workspace) => workspace.id === library.activeWorkspaceId) ??
    remaining[0];
  persistWorkspaceLibrary({
    version: WORKSPACE_LIBRARY_VERSION,
    activeWorkspaceId: nextWorkspace.id,
    workspaces: remaining,
  });
  return cloneWorkspace(nextWorkspace);
}

export function deleteStoredProject(
  projectId: string,
  templateId?: TemplateId,
  workspaceId?: string,
) {
  const { library, workspace } = resolveWorkspace(loadWorkspaceLibrary(), workspaceId);
  const remaining = workspace.projects.filter((project) => project.id !== projectId);
  if (remaining.length === 0) {
    const fallbackProject = createStoredProjectRecord({
      templateId: templateId ?? DEFAULT_TEMPLATE_ID,
    });
    const updatedWorkspace = createStoredWorkspaceRecord({
      ...workspace,
      id: workspace.id,
      name: workspace.name,
      projects: [fallbackProject],
      activeProjectId: fallbackProject.id,
      createdAt: workspace.createdAt,
      updatedAt: new Date().toISOString(),
      exportedAt: workspace.exportedAt,
    });
    persistWorkspaceLibrary({
      ...replaceWorkspaceInLibrary(library, updatedWorkspace),
      activeWorkspaceId: updatedWorkspace.id,
    });
    return cloneProject(fallbackProject);
  }

  const filteredRemaining = templateId
    ? remaining.filter((project) => project.templateId === templateId)
    : remaining;
  if (templateId && filteredRemaining.length === 0) {
    const fallbackProject = createStoredProjectRecord({ templateId });
    const updatedWorkspace = createStoredWorkspaceRecord({
      ...workspace,
      id: workspace.id,
      name: workspace.name,
      projects: [...remaining, fallbackProject],
      activeProjectId: fallbackProject.id,
      createdAt: workspace.createdAt,
      updatedAt: new Date().toISOString(),
      exportedAt: workspace.exportedAt,
    });
    persistWorkspaceLibrary({
      ...replaceWorkspaceInLibrary(library, updatedWorkspace),
      activeWorkspaceId: updatedWorkspace.id,
    });
    return cloneProject(fallbackProject);
  }

  const nextActive =
    filteredRemaining.find((project) => project.id === workspace.activeProjectId) ??
    filteredRemaining[0] ??
    remaining[0];
  const updatedWorkspace = createStoredWorkspaceRecord({
    ...workspace,
    id: workspace.id,
    name: workspace.name,
    projects: remaining,
    activeProjectId: nextActive.id,
    createdAt: workspace.createdAt,
    updatedAt: new Date().toISOString(),
    exportedAt: workspace.exportedAt,
  });
  persistWorkspaceLibrary({
    ...replaceWorkspaceInLibrary(library, updatedWorkspace),
    activeWorkspaceId: updatedWorkspace.id,
  });
  return cloneProject(nextActive);
}

function isBlockKind(value: unknown): value is BlockKind {
  return typeof value === "string" && value in BLOCK_KIND_PRESETS;
}

function isBlockTone(value: unknown): value is BlockTone {
  return value === "teal" || value === "navy" || value === "amber";
}

function normalizeImportedBlock(
  block: unknown,
  pageId: string,
  index: number,
): LayoutBlock {
  if (!block || typeof block !== "object") {
    throw new Error(`Invalid block at ${pageId}.${index + 1}`);
  }

  const candidate = block as Partial<LayoutBlock>;
  if (!isBlockKind(candidate.kind)) {
    throw new Error(`Invalid block kind at ${pageId}.${index + 1}`);
  }

  const preset = BLOCK_KIND_PRESETS[candidate.kind];
  const x = Number(candidate.x);
  const y = Number(candidate.y);
  const w = Number(candidate.w);
  const h = Number(candidate.h);
  const minW = Number(candidate.minW ?? preset.minW);
  const minH = Number(candidate.minH ?? preset.minH);
  const visualScale = Number(candidate.visualScale ?? preset.defaultScale);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(w) ||
    !Number.isFinite(h) ||
    !Number.isFinite(minW) ||
    !Number.isFinite(minH) ||
    !Number.isFinite(visualScale)
  ) {
    throw new Error(`Invalid block geometry at ${pageId}.${index + 1}`);
  }

  return {
    id:
      typeof candidate.id === "string" && candidate.id
        ? candidate.id
        : `${pageId}-block-${index + 1}`,
    title:
      typeof candidate.title === "string" && candidate.title
        ? candidate.title
        : `${preset.label} module`,
    detail:
      typeof candidate.detail === "string" && candidate.detail
        ? candidate.detail
        : preset.detail,
    intent: typeof candidate.intent === "string" ? candidate.intent : "",
    kind: candidate.kind,
    tone: isBlockTone(candidate.tone) ? candidate.tone : preset.tone,
    x,
    y,
    w,
    h,
    minW,
    minH,
    visualScale,
  };
}

function normalizeImportedPages(pages: unknown): LayoutPage[] {
  if (!Array.isArray(pages)) {
    throw new Error("Project bundle does not contain valid pages");
  }

  if (pages.length === 0) {
    return [];
  }

  return pages.map((page, index) => {
    if (!page || typeof page !== "object") {
      throw new Error(`Invalid page at index ${index + 1}`);
    }

    const candidate = page as Partial<LayoutPage>;
    const rawPageId =
      typeof candidate.id === "string" && candidate.id
        ? candidate.id.trim()
        : `${index + 1}`;
    const pageIdMatch = rawPageId.match(/(\d+)/);
    const pageId =
      /^\d+$/.test(rawPageId)
        ? rawPageId
        : pageIdMatch?.[1]
          ? String(Number.parseInt(pageIdMatch[1], 10))
          : `${index + 1}`;

    if (!Array.isArray(candidate.blocks)) {
      throw new Error(`Page ${pageId} does not contain valid blocks`);
    }

    return {
      id: pageId,
      chapter:
        typeof candidate.chapter === "string" && candidate.chapter
          ? candidate.chapter
          : `Page ${pageId}`,
      title:
        typeof candidate.title === "string" && candidate.title
          ? candidate.title
          : `Untitled page ${pageId}`,
      note: typeof candidate.note === "string" ? candidate.note : "",
      instruction:
        typeof candidate.instruction === "string" ? candidate.instruction : "",
      starterLayoutId:
        (() => {
          const starter = getStarterPackManifest(candidate.starterLayoutId);
          return isStarterPackLayout(starter) ? starter.id : null;
        })(),
      blocks: candidate.blocks.map((block, blockIndex) =>
        normalizeImportedBlock(block, pageId, blockIndex),
      ),
    };
  });
}

export function createTemplateProjectState(templateId: TemplateId) {
  const template = getTemplateDefinition(templateId);

  return {
    templateId,
    starterPackId: null,
    starterThemeId: null,
    starterBindings: {},
    starterApplicationMode: "deck" as const,
    htmlOutputMode: "static" as const,
    projectName: template.defaultProjectName,
    sourceText: template.defaultSourceText,
    generationMode: "standard" as const,
    moduleUsageMode: "disabled" as const,
    requestedPageCount: null,
    longFormClarification: createEmptyLongFormClarificationState(),
    deckOptimization: createEmptyDeckOptimizationState(),
    briefMessages: [],
    pages: clonePages(templateId),
    generatedDraft: null,
    workflowStage: "intake" as const,
  };
}

export function createProjectBundle(args: {
  id?: string;
  projectName: string;
  sourceText: string;
  generationMode?: WorkbenchGenerationMode;
  moduleUsageMode?: WorkbenchProject["moduleUsageMode"];
  htmlOutputMode?: WorkbenchProject["htmlOutputMode"];
  requestedPageCount?: number | null;
  longFormClarification?: WorkbenchLongFormClarificationState;
  deckOptimization?: WorkbenchDeckOptimizationState;
  briefMessages?: ConversationMessage[];
  pages: LayoutPage[];
  templateId: TemplateId;
  starterPackId?: WorkbenchProject["starterPackId"];
  starterThemeId?: WorkbenchProject["starterThemeId"];
  starterBindings?: WorkbenchProject["starterBindings"];
  starterApplicationMode?: WorkbenchProject["starterApplicationMode"];
  generatedDraft?: GeneratedDraftAsset | null;
  generationHistory?: GenerationHistoryEntry[];
  publishSnapshots?: PublishSnapshot[];
  workflowStage?: WorkflowStage;
  updatedAt?: string;
  exportedAt?: string;
}): WorkbenchProject {
  return createStoredProjectRecord({
    id: args.id,
    templateId: args.templateId,
    starterPackId: args.starterPackId,
    starterThemeId: args.starterThemeId,
    starterBindings: args.starterBindings,
    starterApplicationMode: args.starterApplicationMode,
    htmlOutputMode: args.htmlOutputMode,
    projectName: args.projectName,
    sourceText: args.sourceText,
    generationMode: args.generationMode,
    moduleUsageMode: args.moduleUsageMode,
    requestedPageCount: args.requestedPageCount,
    longFormClarification: args.longFormClarification,
    deckOptimization: args.deckOptimization,
    briefMessages: args.briefMessages,
    pages: args.pages,
    generatedDraft: args.generatedDraft,
    generationHistory: args.generationHistory,
    publishSnapshots: args.publishSnapshots,
    workflowStage: args.workflowStage,
    updatedAt: args.updatedAt,
    exportedAt: args.exportedAt,
  });
}

export function serializeProjectBundle(args: {
  id?: string;
  projectName: string;
  sourceText: string;
  generationMode?: WorkbenchGenerationMode;
  moduleUsageMode?: WorkbenchProject["moduleUsageMode"];
  htmlOutputMode?: WorkbenchProject["htmlOutputMode"];
  requestedPageCount?: number | null;
  longFormClarification?: WorkbenchLongFormClarificationState;
  deckOptimization?: WorkbenchDeckOptimizationState;
  briefMessages?: ConversationMessage[];
  pages: LayoutPage[];
  templateId: TemplateId;
  starterPackId?: WorkbenchProject["starterPackId"];
  starterThemeId?: WorkbenchProject["starterThemeId"];
  starterBindings?: WorkbenchProject["starterBindings"];
  starterApplicationMode?: WorkbenchProject["starterApplicationMode"];
  generatedDraft?: GeneratedDraftAsset | null;
  generationHistory?: GenerationHistoryEntry[];
  publishSnapshots?: PublishSnapshot[];
  workflowStage?: WorkflowStage;
  updatedAt?: string;
  exportedAt?: string;
}) {
  return JSON.stringify(createProjectBundle(args), null, 2);
}

export function parseProjectBundle(raw: string): WorkbenchProject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Project bundle is not valid JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Project bundle has an invalid shape");
  }

  return normalizeStoredProject(parsed);
}

export function createWorkspaceBundle(workspaceId?: string): WorkbenchWorkspace {
  return cloneWorkspace(loadStoredWorkspace(workspaceId));
}

export function serializeWorkspaceBundle(workspaceId?: string) {
  return JSON.stringify(createWorkspaceBundle(workspaceId), null, 2);
}

export function parseWorkspaceBundle(raw: string): WorkbenchWorkspace {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Workspace bundle is not valid JSON");
  }

  return normalizeStoredWorkspace(parsed);
}

export function parseWorkbenchBundle(raw: string):
  | { type: "project"; bundle: WorkbenchProject }
  | { type: "workspace"; bundle: WorkbenchWorkspace } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Bundle is not valid JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Bundle has an invalid shape");
  }

  const candidate = parsed as { projects?: unknown; activeProjectId?: unknown };
  if (Array.isArray(candidate.projects) && typeof candidate.activeProjectId === "string") {
    return {
      type: "workspace",
      bundle: normalizeStoredWorkspace(parsed),
    };
  }

  return {
    type: "project",
    bundle: normalizeStoredProject(parsed),
  };
}

export function recordProjectGeneration(args: {
  workspaceId?: string;
  projectId?: string;
  templateId?: TemplateId;
  projectName: string;
  sourceText: string;
  pages: LayoutPage[];
  generatedDraft: GeneratedDraftAsset;
  workflowStage: WorkflowStage;
}) {
  return persistProjectUpdate(
    {
      workspaceId: args.workspaceId,
      projectId: args.projectId,
      templateId: args.templateId,
    },
    (project) => {
      const capturedAt = new Date().toISOString();
      const snapshot = createProjectSnapshot({
        templateId: args.generatedDraft.templateId,
        starterPackId: project.starterPackId,
        starterThemeId: project.starterThemeId,
        starterBindings: project.starterBindings,
        starterApplicationMode: project.starterApplicationMode,
        htmlOutputMode: project.htmlOutputMode,
        projectName: args.projectName,
        sourceText: args.sourceText,
        generationMode: project.generationMode,
        moduleUsageMode: project.moduleUsageMode,
        requestedPageCount: project.requestedPageCount,
        longFormClarification: project.longFormClarification,
        deckOptimization: project.deckOptimization,
        pages: args.pages,
        workflowStage: args.workflowStage,
        generatedDraft: args.generatedDraft,
        capturedAt,
      });
      const previousEntry = project.generationHistory[0];
      const nextHistory =
        previousEntry &&
        previousEntry.mode === args.generatedDraft.mode &&
        previousEntry.signature === args.generatedDraft.signature
          ? project.generationHistory
          : [
              createGenerationHistoryEntry({
                mode: args.generatedDraft.mode,
                provider: args.generatedDraft.provider,
                model: args.generatedDraft.model,
                signature: args.generatedDraft.signature,
                snapshot,
                createdAt: capturedAt,
              }),
              ...project.generationHistory,
            ].slice(0, 40);

      return createStoredProjectRecord({
        ...project,
        id: project.id,
        templateId: args.generatedDraft.templateId,
        projectName: args.projectName,
        sourceText: args.sourceText,
        generationMode: project.generationMode,
        moduleUsageMode: project.moduleUsageMode,
        requestedPageCount: project.requestedPageCount,
        longFormClarification: project.longFormClarification,
        deckOptimization: { autoOptimizedReportKey: null, autoOptimizedVersion: null },
        pages: args.pages,
        generatedDraft: args.generatedDraft,
        generationHistory: nextHistory,
        publishSnapshots: project.publishSnapshots,
        workflowStage: args.workflowStage,
        updatedAt: capturedAt,
        exportedAt: project.exportedAt,
      });
    },
  );
}

export function recordPublishSnapshot(args: {
  workspaceId?: string;
  projectId: string;
  format: PublishSnapshotFormat;
  publishedUrl?: string | null;
}) {
  return persistProjectUpdate(
    { workspaceId: args.workspaceId, projectId: args.projectId },
    (project) => {
      const capturedAt = new Date().toISOString();
      const snapshot = createProjectSnapshot({
        templateId: project.templateId,
        starterPackId: project.starterPackId,
        starterThemeId: project.starterThemeId,
        starterBindings: project.starterBindings,
        starterApplicationMode: project.starterApplicationMode,
        htmlOutputMode: project.htmlOutputMode,
        projectName: project.projectName,
        sourceText: project.sourceText,
        generationMode: project.generationMode,
        moduleUsageMode: project.moduleUsageMode,
        requestedPageCount: project.requestedPageCount,
        longFormClarification: project.longFormClarification,
        deckOptimization: project.deckOptimization,
        pages: project.pages,
        workflowStage: project.workflowStage,
        generatedDraft: project.generatedDraft,
        capturedAt,
      });
      const signature = createProjectPublishSignature(snapshot, args.format);
      const previousSnapshot = project.publishSnapshots[0];
      const shouldAppendSnapshot = !(
        previousSnapshot &&
        previousSnapshot.format === args.format &&
        previousSnapshot.signature === signature
      );
      const nextSnapshots = shouldAppendSnapshot
        ? [
            createPublishSnapshotEntry({
              format: args.format,
              signature,
              publishedUrl: args.publishedUrl,
              snapshot,
              createdAt: capturedAt,
            }),
            ...project.publishSnapshots,
          ].slice(0, 40)
        : project.publishSnapshots;

      return createStoredProjectRecord({
        ...project,
        id: project.id,
        generationHistory: project.generationHistory,
        publishSnapshots: nextSnapshots,
        updatedAt: project.updatedAt,
        exportedAt: shouldAppendSnapshot ? capturedAt : project.exportedAt,
      });
    },
  );
}

export function importProjectBundle(bundle: WorkbenchProject, workspaceId?: string) {
  const { library, workspace } = resolveWorkspace(loadWorkspaceLibrary(), workspaceId);
  const imported = createStoredProjectRecord({
    templateId: bundle.templateId,
    projectName: bundle.projectName,
    sourceText: bundle.sourceText,
    generationMode: bundle.generationMode,
    moduleUsageMode: bundle.moduleUsageMode,
    requestedPageCount: bundle.requestedPageCount,
    longFormClarification: bundle.longFormClarification,
    deckOptimization: bundle.deckOptimization,
    briefMessages: bundle.briefMessages,
    pages: bundle.pages,
    generatedDraft: bundle.generatedDraft,
    generationHistory: bundle.generationHistory,
    publishSnapshots: bundle.publishSnapshots,
    workflowStage: bundle.workflowStage,
  });
  const updatedWorkspace = createStoredWorkspaceRecord({
    ...workspace,
    id: workspace.id,
    name: workspace.name,
    projects: [...workspace.projects, imported],
    activeProjectId: imported.id,
    createdAt: workspace.createdAt,
    updatedAt: new Date().toISOString(),
    exportedAt: workspace.exportedAt,
  });
  persistWorkspaceLibrary({
    ...replaceWorkspaceInLibrary(library, updatedWorkspace),
    activeWorkspaceId: updatedWorkspace.id,
  });
  return cloneProject(imported);
}

export function importWorkspaceBundle(bundle: WorkbenchWorkspace) {
  const library = loadWorkspaceLibrary();
  const nextProjects = bundle.projects.map((project) =>
    createStoredProjectRecord({
      ...project,
      id: undefined,
      templateId: project.templateId,
      projectName: project.projectName,
      sourceText: project.sourceText,
      briefMessages: project.briefMessages,
      pages: project.pages,
      generatedDraft: project.generatedDraft,
      generationHistory: project.generationHistory,
      publishSnapshots: project.publishSnapshots,
      workflowStage: project.workflowStage,
      updatedAt: project.updatedAt,
      exportedAt: project.exportedAt,
    }),
  );
  const activeSourceProject =
    bundle.projects.find((project) => project.id === bundle.activeProjectId) ??
    bundle.projects[0];
  const activeProject =
    nextProjects.find((project, index) => bundle.projects[index]?.id === activeSourceProject?.id) ??
    nextProjects[0];
  const importedWorkspace = createStoredWorkspaceRecord({
    name: bundle.name,
    projects: nextProjects,
    activeProjectId: activeProject.id,
  });
  persistWorkspaceLibrary({
    ...library,
    activeWorkspaceId: importedWorkspace.id,
    workspaces: [...library.workspaces.map(cloneWorkspace), importedWorkspace],
  });
  return cloneWorkspace(importedWorkspace);
}
