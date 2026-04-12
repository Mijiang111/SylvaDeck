import type { WorkbenchWorkspace } from "@/features/studio/types";
import type {
  StoredProjectRecord,
  StoredWorkspaceRecord,
  StudioAssetRecord,
  StudioAssetRef,
  StudioLibrarySnapshot,
  StudioSession,
} from "./types";
import {
  hasArchiveImportCompleted,
  markArchiveImportCompleted,
  readArchivedWorkbenchSnapshot,
} from "./archiveImport";
import {
  createEmptyStudioSnapshot,
  deepClone,
  ensureSnapshotScaffold,
} from "./utils";

const STUDIO_DB_NAME = "studio-workspace-v1";
const STUDIO_DB_VERSION = 1;
const STUDIO_META_STORE = "meta";
const STUDIO_WORKSPACE_STORE = "workspaces";
const STUDIO_PROJECT_STORE = "projects";
const STUDIO_ASSET_STORE = "assets";
const STUDIO_ROOT_META_KEY = "root";
const STUDIO_SESSION_STORAGE_KEY = "studio-session-v1";
const STUDIO_MIGRATION_STORAGE_KEY = "studio-imported-from-archive-v1";

type StudioRootRecord = {
  id: typeof STUDIO_ROOT_META_KEY;
  activeWorkspaceId: string;
  migratedAt: string | null;
};

function supportsIndexedDb() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

async function openStudioDatabase() {
  if (!supportsIndexedDb()) {
    throw new Error("IndexedDB is not available in this browser.");
  }

  const request = window.indexedDB.open(STUDIO_DB_NAME, STUDIO_DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STUDIO_META_STORE)) {
      database.createObjectStore(STUDIO_META_STORE, { keyPath: "id" });
    }
    if (!database.objectStoreNames.contains(STUDIO_WORKSPACE_STORE)) {
      database.createObjectStore(STUDIO_WORKSPACE_STORE, { keyPath: "id" });
    }
    if (!database.objectStoreNames.contains(STUDIO_PROJECT_STORE)) {
      database.createObjectStore(STUDIO_PROJECT_STORE, { keyPath: "id" });
    }
    if (!database.objectStoreNames.contains(STUDIO_ASSET_STORE)) {
      database.createObjectStore(STUDIO_ASSET_STORE, { keyPath: "id" });
    }
  };

  return requestToPromise(request);
}

function readSession(): StudioSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STUDIO_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StudioSession>;
    if (
      typeof parsed.activeWorkspaceId !== "string" ||
      typeof parsed.activeProjectId !== "string"
    ) {
      return null;
    }

    return {
      activeWorkspaceId: parsed.activeWorkspaceId,
      activeProjectId: parsed.activeProjectId,
      migratedAt: typeof parsed.migratedAt === "string" ? parsed.migratedAt : null,
    };
  } catch {
    return null;
  }
}

function writeSession(session: StudioSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STUDIO_SESSION_STORAGE_KEY, JSON.stringify(session));
  if (session.migratedAt) {
    window.localStorage.setItem(STUDIO_MIGRATION_STORAGE_KEY, session.migratedAt);
  }
}

function normalizeWorkspaceRecord(workspace: WorkbenchWorkspace): StoredWorkspaceRecord {
  return {
    id: workspace.id,
    version: workspace.version,
    name: workspace.name,
    projectIds: workspace.projects.map((project) => project.id),
    activeProjectId: workspace.activeProjectId,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    exportedAt: workspace.exportedAt,
  };
}

function normalizeProjectRecord(
  workspaceId: string,
  project: WorkbenchWorkspace["projects"][number],
): StoredProjectRecord {
  return {
    ...deepClone(project),
    workspaceId,
  };
}

async function loadSnapshotFromDb(): Promise<StudioLibrarySnapshot | null> {
  if (!supportsIndexedDb()) {
    return null;
  }

  const database = await openStudioDatabase();
  const transaction = database.transaction(
    [STUDIO_META_STORE, STUDIO_WORKSPACE_STORE, STUDIO_PROJECT_STORE],
    "readonly",
  );
  const metaStore = transaction.objectStore(STUDIO_META_STORE);
  const workspaceStore = transaction.objectStore(STUDIO_WORKSPACE_STORE);
  const projectStore = transaction.objectStore(STUDIO_PROJECT_STORE);

  const [rootRecord, workspaceRecords, projectRecords] = await Promise.all([
    requestToPromise(metaStore.get(STUDIO_ROOT_META_KEY) as IDBRequest<StudioRootRecord | undefined>),
    requestToPromise(workspaceStore.getAll() as IDBRequest<StoredWorkspaceRecord[]>),
    requestToPromise(projectStore.getAll() as IDBRequest<StoredProjectRecord[]>),
  ]);
  await transactionDone(transaction);
  database.close();

  if (!workspaceRecords.length || !rootRecord) {
    return null;
  }

  const projectsByWorkspace = new Map<string, StoredProjectRecord[]>();
  for (const project of projectRecords) {
    const bucket = projectsByWorkspace.get(project.workspaceId) ?? [];
    bucket.push(project);
    projectsByWorkspace.set(project.workspaceId, bucket);
  }

  const workspaces = workspaceRecords.map((workspaceRecord) => {
    const projectMap = new Map(
      (projectsByWorkspace.get(workspaceRecord.id) ?? []).map((project) => [project.id, project]),
    );
    const orderedProjects = workspaceRecord.projectIds
      .map((projectId) => projectMap.get(projectId))
      .filter((project): project is StoredProjectRecord => Boolean(project))
      .map((project) => {
        const { workspaceId: _workspaceId, ...rest } = project;
        return rest;
      });

    return {
      id: workspaceRecord.id,
      version: workspaceRecord.version,
      name: workspaceRecord.name,
      projects: orderedProjects,
      activeProjectId: workspaceRecord.activeProjectId,
      createdAt: workspaceRecord.createdAt,
      updatedAt: workspaceRecord.updatedAt,
      exportedAt: workspaceRecord.exportedAt,
    } satisfies WorkbenchWorkspace;
  });

  return ensureSnapshotScaffold(
    {
      version: 1,
      activeWorkspaceId: rootRecord.activeWorkspaceId,
      workspaces,
    },
    undefined,
  );
}

async function saveSnapshotToDb(snapshot: StudioLibrarySnapshot, migratedAt?: string | null) {
  if (!supportsIndexedDb()) {
    return;
  }

  const database = await openStudioDatabase();
  const transaction = database.transaction(
    [STUDIO_META_STORE, STUDIO_WORKSPACE_STORE, STUDIO_PROJECT_STORE],
    "readwrite",
  );
  const metaStore = transaction.objectStore(STUDIO_META_STORE);
  const workspaceStore = transaction.objectStore(STUDIO_WORKSPACE_STORE);
  const projectStore = transaction.objectStore(STUDIO_PROJECT_STORE);

  workspaceStore.clear();
  projectStore.clear();

  for (const workspace of snapshot.workspaces) {
    workspaceStore.put(normalizeWorkspaceRecord(workspace));
    for (const project of workspace.projects) {
      projectStore.put(normalizeProjectRecord(workspace.id, project));
    }
  }

  metaStore.put({
    id: STUDIO_ROOT_META_KEY,
    activeWorkspaceId: snapshot.activeWorkspaceId,
    migratedAt: migratedAt ?? readSession()?.migratedAt ?? null,
  } satisfies StudioRootRecord);

  await transactionDone(transaction);
  database.close();
}

export type WorkspaceRepository = {
  hydrate: (fixedTemplateId?: string) => Promise<StudioLibrarySnapshot>;
  saveLibrary: (snapshot: StudioLibrarySnapshot) => Promise<void>;
  resetLibrary: (snapshot: StudioLibrarySnapshot) => Promise<void>;
};

export type ProjectRepository = {
  saveProject: (
    snapshot: StudioLibrarySnapshot,
    workspaceId: string,
    projectId: string,
  ) => Promise<void>;
  exportWorkspaceLibrary: () => Promise<StudioLibrarySnapshot>;
};

export type AssetRepository = {
  saveBlob: (args: Omit<StudioAssetRecord, "id" | "createdAt" | "size">) => Promise<StudioAssetRef>;
  readBlob: (id: string) => Promise<Blob | null>;
};

export function createWorkspaceRepository(): WorkspaceRepository {
  return {
    async hydrate(fixedTemplateId) {
      const existing = await loadSnapshotFromDb();
      if (existing) {
        return ensureSnapshotScaffold(existing, fixedTemplateId as never);
      }

      const migratedAt = hasArchiveImportCompleted() ? null : new Date().toISOString();
      const importedSnapshot = readArchivedWorkbenchSnapshot();
      const nextSnapshot = ensureSnapshotScaffold(
        importedSnapshot ?? createEmptyStudioSnapshot(fixedTemplateId as never),
        fixedTemplateId as never,
      );
      await saveSnapshotToDb(nextSnapshot, importedSnapshot ? migratedAt : null);
      if (importedSnapshot) {
        markArchiveImportCompleted();
      }
      const activeWorkspace =
        nextSnapshot.workspaces.find((workspace) => workspace.id === nextSnapshot.activeWorkspaceId) ??
        nextSnapshot.workspaces[0];
      const activeProject =
        activeWorkspace.projects.find((project) => project.id === activeWorkspace.activeProjectId) ??
        activeWorkspace.projects[0];

      writeSession({
        activeWorkspaceId: activeWorkspace.id,
        activeProjectId: activeProject.id,
        migratedAt,
      });
      return nextSnapshot;
    },

    async saveLibrary(snapshot) {
      const activeWorkspace =
        snapshot.workspaces.find((workspace) => workspace.id === snapshot.activeWorkspaceId) ??
        snapshot.workspaces[0];
      const activeProject =
        activeWorkspace.projects.find((project) => project.id === activeWorkspace.activeProjectId) ??
        activeWorkspace.projects[0];
      const migratedAt =
        readSession()?.migratedAt ??
        (typeof window !== "undefined"
          ? window.localStorage.getItem(STUDIO_MIGRATION_STORAGE_KEY)
          : null) ??
        null;

      await saveSnapshotToDb(snapshot, migratedAt);
      writeSession({
        activeWorkspaceId: activeWorkspace.id,
        activeProjectId: activeProject.id,
        migratedAt,
      });
    },

    async resetLibrary(snapshot) {
      await saveSnapshotToDb(snapshot, new Date().toISOString());
      markArchiveImportCompleted();
    },
  };
}

export function createProjectRepository(): ProjectRepository {
  const workspaceRepository = createWorkspaceRepository();

  return {
    async saveProject(snapshot, workspaceId, projectId) {
      const normalized = deepClone(snapshot);
      normalized.activeWorkspaceId = workspaceId;
      normalized.workspaces = normalized.workspaces.map((workspace) =>
        workspace.id === workspaceId
          ? {
              ...workspace,
              activeProjectId: projectId,
            }
          : workspace,
      );
      await workspaceRepository.saveLibrary(normalized);
    },

    async exportWorkspaceLibrary() {
      const existing = await loadSnapshotFromDb();
      return existing ?? createEmptyStudioSnapshot();
    },
  };
}

export function createAssetRepository(): AssetRepository {
  return {
    async saveBlob(args) {
      if (!supportsIndexedDb()) {
        throw new Error("IndexedDB is not available in this browser.");
      }

      const database = await openStudioDatabase();
      const transaction = database.transaction([STUDIO_ASSET_STORE], "readwrite");
      const assetStore = transaction.objectStore(STUDIO_ASSET_STORE);
      const now = new Date().toISOString();
      const asset = {
        ...args,
        id: `asset-${Math.random().toString(36).slice(2, 10)}`,
        createdAt: now,
        size: args.blob.size,
      } satisfies StudioAssetRecord;

      assetStore.put(asset);
      await transactionDone(transaction);
      database.close();

      return {
        id: asset.id,
        kind: asset.kind,
        mimeType: asset.mimeType,
        createdAt: asset.createdAt,
        size: asset.size,
        workspaceId: asset.workspaceId,
        projectId: asset.projectId,
      };
    },

    async readBlob(id) {
      if (!supportsIndexedDb()) {
        return null;
      }

      const database = await openStudioDatabase();
      const transaction = database.transaction([STUDIO_ASSET_STORE], "readonly");
      const assetStore = transaction.objectStore(STUDIO_ASSET_STORE);
      const asset = await requestToPromise(
        assetStore.get(id) as IDBRequest<StudioAssetRecord | undefined>,
      );
      await transactionDone(transaction);
      database.close();
      return asset?.blob ?? null;
    },
  };
}

export function readStudioSession() {
  return readSession();
}
