import { AI_SETTINGS_STORAGE_KEY } from "./config";

export type WorkbenchAgentProvider = "cursor" | "codex" | "kimi";

export type WorkbenchCursorProviderSettings = {
  command: string;
  model: string;
  cwd: string;
};

export type WorkbenchKimiProviderSettings = {
  command: string;
  model: string;
  cwd: string;
  apiKey: string;
  baseUrl: string;
};

export type WorkbenchAiSettings = {
  version: 3;
  provider: WorkbenchAgentProvider;
  cursor: WorkbenchCursorProviderSettings;
  codex: WorkbenchCursorProviderSettings;
  kimi: WorkbenchKimiProviderSettings;
};

const DEFAULT_CODEX_WORKBENCH_MODEL = "gpt-5.4";
const DEFAULT_KIMI_WORKBENCH_MODEL = "moonshot-v1-128k";
const DEFAULT_KIMI_BASE_URL = "https://api.moonshot.cn/v1";

const DEFAULT_AI_SETTINGS: WorkbenchAiSettings = {
  version: 3,
  provider: "codex",
  cursor: {
    command: "agent",
    model: "auto",
    cwd: "",
  },
  codex: {
    command: "codex",
    model: DEFAULT_CODEX_WORKBENCH_MODEL,
    cwd: "",
  },
  kimi: {
    command: "",
    model: DEFAULT_KIMI_WORKBENCH_MODEL,
    cwd: "",
    apiKey: "",
    baseUrl: DEFAULT_KIMI_BASE_URL,
  },
};

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function createDefaultWorkbenchAiSettings(): WorkbenchAiSettings {
  return {
    version: DEFAULT_AI_SETTINGS.version,
    provider: DEFAULT_AI_SETTINGS.provider,
    cursor: { ...DEFAULT_AI_SETTINGS.cursor },
    codex: { ...DEFAULT_AI_SETTINGS.codex },
    kimi: { ...DEFAULT_AI_SETTINGS.kimi },
  };
}

function migrateV2ToV3(value: Partial<WorkbenchAiSettings> & { cursor?: Partial<WorkbenchCursorProviderSettings> }): WorkbenchAiSettings {
  const normalized = createDefaultWorkbenchAiSettings();
  const cursor = value.cursor;
  if (cursor && typeof cursor === "object") {
    if (typeof cursor.command === "string") normalized.cursor.command = cursor.command;
    if (typeof cursor.model === "string") normalized.cursor.model = cursor.model;
    if (typeof cursor.cwd === "string") normalized.cursor.cwd = cursor.cwd;
  }

  // Infer provider from legacy cursor.command
  const legacyCommand = normalized.cursor.command.trim().toLowerCase();
  if (legacyCommand === "codex") {
    normalized.provider = "codex";
    normalized.codex = { ...normalized.cursor };
  } else if (legacyCommand === "agent" || legacyCommand === "cursor") {
    normalized.provider = "cursor";
  } else {
    normalized.provider = "codex";
    normalized.codex = { ...normalized.cursor };
  }

  // Normalize codex model defaults
  const codexModel = normalized.codex.model.trim().toLowerCase();
  if (codexModel === "" || codexModel === "auto" || codexModel === "gpt-5.4-mini") {
    normalized.codex.model = DEFAULT_CODEX_WORKBENCH_MODEL;
  }

  return normalized;
}

export function normalizeWorkbenchAiSettings(
  value: Partial<WorkbenchAiSettings> | null | undefined,
): WorkbenchAiSettings {
  if (!value) return createDefaultWorkbenchAiSettings();

  const version = (value as { version?: number }).version;
  if (version !== 3) {
    return migrateV2ToV3(value as Partial<WorkbenchAiSettings> & { cursor?: Partial<WorkbenchCursorProviderSettings> });
  }

  const normalized = createDefaultWorkbenchAiSettings();

  const provider = (value as { provider?: string }).provider;
  if (provider === "cursor" || provider === "codex" || provider === "kimi") {
    normalized.provider = provider;
  }

  const cursor = (value as { cursor?: Partial<WorkbenchCursorProviderSettings> }).cursor;
  if (cursor && typeof cursor === "object") {
    if (typeof cursor.command === "string") normalized.cursor.command = cursor.command;
    if (typeof cursor.model === "string") normalized.cursor.model = cursor.model;
    if (typeof cursor.cwd === "string") normalized.cursor.cwd = cursor.cwd;
  }

  const codex = (value as { codex?: Partial<WorkbenchCursorProviderSettings> }).codex;
  if (codex && typeof codex === "object") {
    if (typeof codex.command === "string") normalized.codex.command = codex.command;
    if (typeof codex.model === "string") normalized.codex.model = codex.model;
    if (typeof codex.cwd === "string") normalized.codex.cwd = codex.cwd;
  }

  const kimi = (value as { kimi?: Partial<WorkbenchKimiProviderSettings> }).kimi;
  if (kimi && typeof kimi === "object") {
    if (typeof kimi.command === "string") normalized.kimi.command = kimi.command;
    if (typeof kimi.model === "string") normalized.kimi.model = kimi.model;
    if (typeof kimi.cwd === "string") normalized.kimi.cwd = kimi.cwd;
    if (typeof kimi.apiKey === "string") normalized.kimi.apiKey = kimi.apiKey;
    if (typeof kimi.baseUrl === "string") normalized.kimi.baseUrl = kimi.baseUrl;
  }

  // Normalize defaults
  if (normalized.provider === "codex") {
    const model = normalized.codex.model.trim().toLowerCase();
    if (model === "" || model === "auto" || model === "gpt-5.4-mini") {
      normalized.codex.model = DEFAULT_CODEX_WORKBENCH_MODEL;
    }
  }

  if (normalized.provider === "cursor") {
    const model = normalized.cursor.model.trim().toLowerCase();
    if (model === "" || model === "auto") {
      normalized.cursor.model = "auto";
    }
  }

  if (normalized.provider === "kimi") {
    if (!normalized.kimi.model.trim()) {
      normalized.kimi.model = DEFAULT_KIMI_WORKBENCH_MODEL;
    }
    if (!normalized.kimi.baseUrl.trim()) {
      normalized.kimi.baseUrl = DEFAULT_KIMI_BASE_URL;
    }
  }

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

export function resolveAgentConfigFromAiSettings(
  aiSettings: WorkbenchAiSettings,
): {
  provider: WorkbenchAgentProvider;
  command: string;
  model: string;
  cwd: string;
  apiKey: string;
  baseUrl: string;
} {
  if (aiSettings.provider === "cursor") {
    return {
      provider: "cursor",
      command: aiSettings.cursor.command,
      model: aiSettings.cursor.model,
      cwd: aiSettings.cursor.cwd,
      apiKey: "",
      baseUrl: "",
    };
  }
  if (aiSettings.provider === "codex") {
    return {
      provider: "codex",
      command: aiSettings.codex.command,
      model: aiSettings.codex.model,
      cwd: aiSettings.codex.cwd,
      apiKey: "",
      baseUrl: "",
    };
  }
  return {
    provider: "kimi",
    command: aiSettings.kimi.command,
    model: aiSettings.kimi.model,
    cwd: aiSettings.kimi.cwd,
    apiKey: aiSettings.kimi.apiKey,
    baseUrl: aiSettings.kimi.baseUrl,
  };
}
