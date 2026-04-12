import { AI_SETTINGS_STORAGE_KEY } from "./config";

export type WorkbenchCursorProviderSettings = {
  command: string;
  model: string;
  cwd: string;
};

export type WorkbenchAiSettings = {
  version: 2;
  cursor: WorkbenchCursorProviderSettings;
};

const DEFAULT_CODEX_WORKBENCH_MODEL = "gpt-5.4-mini";

const DEFAULT_AI_SETTINGS: WorkbenchAiSettings = {
  version: 2,
  cursor: {
    command: "codex",
    model: DEFAULT_CODEX_WORKBENCH_MODEL,
    cwd: "",
  },
};

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function createDefaultWorkbenchAiSettings(): WorkbenchAiSettings {
  return {
    version: DEFAULT_AI_SETTINGS.version,
    cursor: { ...DEFAULT_AI_SETTINGS.cursor },
  };
}

export function normalizeWorkbenchAiSettings(
  value: Partial<WorkbenchAiSettings> | null | undefined,
): WorkbenchAiSettings {
  const normalized = createDefaultWorkbenchAiSettings();
  if (!value) return normalized;

  const cursor = value.cursor;
  if (cursor && typeof cursor === "object") {
    if (typeof cursor.command === "string") normalized.cursor.command = cursor.command;
    if (typeof cursor.model === "string") normalized.cursor.model = cursor.model;
    if (typeof cursor.cwd === "string") normalized.cursor.cwd = cursor.cwd;
  }

  const legacyCommand = normalized.cursor.command.trim().toLowerCase();
  if (legacyCommand === "" || legacyCommand === "agent") {
    normalized.cursor.command = DEFAULT_AI_SETTINGS.cursor.command;
  }
  if (normalized.cursor.command.trim().toLowerCase() === "codex") {
    const model = normalized.cursor.model.trim().toLowerCase();
    if (model === "" || model === "auto") {
      normalized.cursor.model = DEFAULT_CODEX_WORKBENCH_MODEL;
    }
  }

  normalized.version = DEFAULT_AI_SETTINGS.version;

  return normalized;
}

export function loadWorkbenchAiSettings() {
  if (!canUseLocalStorage()) {
    return createDefaultWorkbenchAiSettings();
  }

  try {
    const raw = window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return createDefaultWorkbenchAiSettings();
    }

    return normalizeWorkbenchAiSettings(JSON.parse(raw) as Partial<WorkbenchAiSettings>);
  } catch {
    return createDefaultWorkbenchAiSettings();
  }
}

export function persistWorkbenchAiSettings(settings: WorkbenchAiSettings) {
  if (!canUseLocalStorage()) {
    return settings;
  }

  const normalized = normalizeWorkbenchAiSettings(settings);
  window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}
