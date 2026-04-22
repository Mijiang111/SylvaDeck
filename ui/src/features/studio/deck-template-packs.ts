import { DECK_TEMPLATE_PACK_STORAGE_KEY } from "./config";
import type {
  DeckTemplatePack,
  DeckTemplatePackPage,
  ImportedSourceAssetRef,
  ImportedSourceChartSeries,
  ImportedSourceObject,
  ImportedSourceProvenance,
  PackImportWarning,
  PackPublishArtifact,
  PackSemanticDecoration,
  PackSemanticSlot,
} from "./types";

type StoredDeckTemplatePackLibrary = {
  version: 1;
  packs: DeckTemplatePack[];
};

const DECK_TEMPLATE_PACK_LIBRARY_VERSION = 1 as const;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeColor(value: string | null | undefined, fallback: string) {
  const normalized = normalizeText(value).replace(/^#/, "").toUpperCase();
  return /^[0-9A-F]{6}$/.test(normalized) ? `#${normalized}` : fallback;
}

function normalizeAssetRef(value: ImportedSourceAssetRef): ImportedSourceAssetRef {
  return {
    assetId: normalizeText(value.assetId),
    mimeType: normalizeText(value.mimeType),
    size: Math.max(0, Math.round(value.size)),
    alt: normalizeText(value.alt) || undefined,
  };
}

function normalizeProvenance(
  value: ImportedSourceProvenance | undefined,
): ImportedSourceProvenance | undefined {
  if (!value) {
    return undefined;
  }

  return {
    slideRelId: normalizeText(value.slideRelId) || undefined,
    slideObjectId: normalizeText(value.slideObjectId) || undefined,
    sourceName: normalizeText(value.sourceName) || undefined,
    sourcePath: normalizeText(value.sourcePath) || undefined,
  };
}

function normalizeChartSeries(value: ImportedSourceChartSeries): ImportedSourceChartSeries {
  return {
    name: normalizeText(value.name) || undefined,
    values: (value.values ?? []).map((item) => Number(item) || 0),
    color: normalizeText(value.color) || undefined,
  };
}

function normalizeSourceObject(object: ImportedSourceObject): ImportedSourceObject {
  const base = {
    ...object,
    id: normalizeText(object.id),
    x: Math.max(0, Math.round(object.x)),
    y: Math.max(0, Math.round(object.y)),
    w: Math.max(0, Math.round(object.w)),
    h: Math.max(0, Math.round(object.h)),
    zIndex: Math.max(0, Math.round(object.zIndex)),
    rotation: object.rotation ? Math.round(object.rotation * 100) / 100 : undefined,
    opacity:
      typeof object.opacity === "number"
        ? Math.max(0, Math.min(1, Math.round(object.opacity * 1000) / 1000))
        : undefined,
    provenance: normalizeProvenance(object.provenance),
  } satisfies ImportedSourceObject;

  if (object.kind === "text") {
    return {
      ...base,
      kind: "text",
      text: object.text,
      align: object.align,
      fontSize: object.fontSize ? Math.max(10, Math.round(object.fontSize)) : undefined,
      fontFamily: normalizeText(object.fontFamily) || undefined,
      fontWeight: object.fontWeight ? Math.max(300, Math.min(900, Math.round(object.fontWeight))) : undefined,
      italic: object.italic === true,
      color: normalizeText(object.color) || undefined,
      fill: normalizeText(object.fill) || undefined,
      stroke: normalizeText(object.stroke) || undefined,
      strokeWidth: object.strokeWidth ? Math.max(0, Math.round(object.strokeWidth * 10) / 10) : undefined,
      radius: object.radius ? Math.max(0, Math.round(object.radius)) : undefined,
    };
  }

  if (object.kind === "shape") {
    return {
      ...base,
      kind: "shape",
      shape: object.shape === "ellipse" ? "ellipse" : "rectangle",
      fill: normalizeText(object.fill) || undefined,
      stroke: normalizeText(object.stroke) || undefined,
      strokeWidth: object.strokeWidth ? Math.max(0, Math.round(object.strokeWidth * 10) / 10) : undefined,
      radius: object.radius ? Math.max(0, Math.round(object.radius)) : undefined,
    };
  }

  if (object.kind === "line") {
    return {
      ...base,
      kind: "line",
      stroke: normalizeText(object.stroke) || undefined,
      strokeWidth: object.strokeWidth ? Math.max(0, Math.round(object.strokeWidth * 10) / 10) : undefined,
    };
  }

  if (object.kind === "image") {
    return {
      ...base,
      kind: "image",
      asset: normalizeAssetRef(object.asset),
      fit: object.fit === "contain" ? "contain" : "cover",
    };
  }

  if (object.kind === "chart") {
    return {
      ...base,
      kind: "chart",
      chartKind: object.chartKind,
      title: normalizeText(object.title) || undefined,
      categories: (object.categories ?? []).map((item) => normalizeText(item)).filter(Boolean),
      series: (object.series ?? []).map(normalizeChartSeries),
    };
  }

  return {
    ...base,
    kind: "unsupported",
    label: normalizeText(object.label) || "Imported object",
    reason: normalizeText(object.reason) || "This object could not be mapped safely.",
  };
}

function normalizeSemanticSlot(slot: PackSemanticSlot): PackSemanticSlot {
  return {
    ...slot,
    id: normalizeText(slot.id),
    kind: slot.kind === "chart" ? "chart" : "ai-text",
    label: normalizeText(slot.label) || "Untitled slot",
    role: slot.role,
    sourceObjectIds: (slot.sourceObjectIds ?? []).map((item) => normalizeText(item)).filter(Boolean),
    required: slot.required !== false,
    canHide: slot.canHide === true,
    notes: normalizeText(slot.notes) || undefined,
  };
}

function normalizeSemanticDecoration(decoration: PackSemanticDecoration): PackSemanticDecoration {
  return {
    ...decoration,
    id: normalizeText(decoration.id),
    label: normalizeText(decoration.label) || "Locked decoration",
    kind: decoration.kind,
    sourceObjectIds: (decoration.sourceObjectIds ?? [])
      .map((item) => normalizeText(item))
      .filter(Boolean),
    locked: decoration.locked !== false,
  };
}

function normalizeWarning(warning: PackImportWarning): PackImportWarning {
  return {
    ...warning,
    id: normalizeText(warning.id),
    severity: warning.severity === "blocking" ? "blocking" : "warning",
    message: normalizeText(warning.message) || "Imported object requires review.",
    sourceObjectIds: (warning.sourceObjectIds ?? [])
      .map((item) => normalizeText(item))
      .filter(Boolean),
  };
}

function normalizePage(page: DeckTemplatePackPage): DeckTemplatePackPage {
  return {
    ...page,
    id: normalizeText(page.id),
    pageNumber: Math.max(1, Math.round(page.pageNumber)),
    title: normalizeText(page.title) || `Page ${page.pageNumber}`,
    background: normalizeColor(page.background, "#FFFFFF"),
    sourceObjects: (page.sourceObjects ?? []).map(normalizeSourceObject),
    semanticSlots: (page.semanticSlots ?? []).map(normalizeSemanticSlot),
    semanticDecorations: (page.semanticDecorations ?? []).map(normalizeSemanticDecoration),
    unresolvedObjectIds: (page.unresolvedObjectIds ?? [])
      .map((item) => normalizeText(item))
      .filter(Boolean),
    warnings: (page.warnings ?? []).map(normalizeWarning),
    pageRole: page.pageRole,
    reusablePattern: normalizeText(page.reusablePattern),
    briefHint: normalizeText(page.briefHint),
    editableRule: page.editableRule === "mixed" ? "mixed" : "semantic-only",
  };
}

function normalizePublishArtifact(artifact: PackPublishArtifact): PackPublishArtifact {
  return {
    ...artifact,
    id: normalizeText(artifact.id),
    packId: normalizeText(artifact.packId),
    version: Math.max(1, Math.round(artifact.version)),
    versionNote: normalizeText(artifact.versionNote) || "Imported deck release",
    result:
      artifact.result === "published" || artifact.result === "warning"
        ? artifact.result
        : "blocked",
    pageCount: Math.max(0, Math.round(artifact.pageCount)),
    blockingIssueCount: Math.max(0, Math.round(artifact.blockingIssueCount)),
    warningCount: Math.max(0, Math.round(artifact.warningCount)),
    publishedAt: artifact.publishedAt,
    publishedBy: normalizeText(artifact.publishedBy) || "local-author",
  };
}

export function normalizeDeckTemplatePack(pack: DeckTemplatePack): DeckTemplatePack {
  return {
    ...pack,
    id: normalizeText(pack.id),
    label: normalizeText(pack.label) || "Imported deck pack",
    sourceFileName: normalizeText(pack.sourceFileName) || "imported-deck.pptx",
    pageWidth: Math.max(1, Math.round(pack.pageWidth)),
    pageHeight: Math.max(1, Math.round(pack.pageHeight)),
    pages: (pack.pages ?? []).map(normalizePage).sort((left, right) => left.pageNumber - right.pageNumber),
    publishArtifacts: (pack.publishArtifacts ?? []).map(normalizePublishArtifact),
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
  };
}

function isStoredDeckTemplatePackLibrary(value: unknown): value is StoredDeckTemplatePackLibrary {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<StoredDeckTemplatePackLibrary>;
  return (
    candidate.version === DECK_TEMPLATE_PACK_LIBRARY_VERSION && Array.isArray(candidate.packs)
  );
}

function readStoredDeckTemplatePackLibrary() {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(DECK_TEMPLATE_PACK_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isStoredDeckTemplatePackLibrary(parsed)) {
      return null;
    }

    return {
      version: DECK_TEMPLATE_PACK_LIBRARY_VERSION,
      packs: parsed.packs.map(normalizeDeckTemplatePack),
    } satisfies StoredDeckTemplatePackLibrary;
  } catch {
    return null;
  }
}

function writeStoredDeckTemplatePackLibrary(packs: DeckTemplatePack[]) {
  if (!canUseStorage()) {
    return;
  }

  const payload: StoredDeckTemplatePackLibrary = {
    version: DECK_TEMPLATE_PACK_LIBRARY_VERSION,
    packs: packs.map(normalizeDeckTemplatePack),
  };

  window.localStorage.setItem(DECK_TEMPLATE_PACK_STORAGE_KEY, JSON.stringify(payload));
}

export function loadDeckTemplatePacks() {
  return readStoredDeckTemplatePackLibrary()?.packs ?? [];
}

export function getDeckTemplatePack(packId: string) {
  return loadDeckTemplatePacks().find((pack) => pack.id === packId) ?? null;
}

export function saveDeckTemplatePack(pack: DeckTemplatePack) {
  const normalized = normalizeDeckTemplatePack({
    ...pack,
    updatedAt: new Date().toISOString(),
  });
  const current = loadDeckTemplatePacks();
  const next = current.some((item) => item.id === normalized.id)
    ? current.map((item) => (item.id === normalized.id ? normalized : item))
    : [normalized, ...current];
  writeStoredDeckTemplatePackLibrary(next);
  return normalized;
}

export function deleteDeckTemplatePack(packId: string) {
  writeStoredDeckTemplatePackLibrary(
    loadDeckTemplatePacks().filter((pack) => pack.id !== packId),
  );
}

export function appendDeckTemplatePackPublishArtifact(args: {
  packId: string;
  versionNote: string;
  publishedBy?: string;
}) {
  const pack = getDeckTemplatePack(args.packId);
  if (!pack) {
    return null;
  }

  const validation = validateDeckTemplatePack(pack);
  const artifact: PackPublishArtifact = {
    id: `pack-publish-${Math.random().toString(36).slice(2, 10)}`,
    version: (pack.publishArtifacts[0]?.version ?? 0) + 1,
    packId: pack.id,
    versionNote: normalizeText(args.versionNote) || "Imported deck release",
    result:
      validation.blockingIssues.length > 0
        ? "blocked"
        : validation.warningIssues.length > 0
          ? "warning"
          : "published",
    pageCount: pack.pages.length,
    blockingIssueCount: validation.blockingIssues.length,
    warningCount: validation.warningIssues.length,
    publishedAt: new Date().toISOString(),
    publishedBy: normalizeText(args.publishedBy) || "local-author",
  };

  return saveDeckTemplatePack({
    ...pack,
    publishArtifacts: [artifact, ...pack.publishArtifacts],
  });
}

export function validateDeckTemplatePack(pack: DeckTemplatePack) {
  const blockingIssues: string[] = [];
  const warningIssues: string[] = [];

  if (!pack.pages.length) {
    blockingIssues.push("Import at least one page before publishing this pack.");
  }

  pack.pages.forEach((page) => {
    if (page.unresolvedObjectIds.length > 0) {
      blockingIssues.push(
        `Page ${page.pageNumber} still has ${page.unresolvedObjectIds.length} unresolved object${page.unresolvedObjectIds.length === 1 ? "" : "s"}.`,
      );
    }

    if (!page.semanticSlots.length) {
      blockingIssues.push(`Page ${page.pageNumber} needs at least one editable semantic slot.`);
    }

    page.warnings.forEach((warning) => {
      const bucket = warning.severity === "blocking" ? blockingIssues : warningIssues;
      bucket.push(`Page ${page.pageNumber}: ${warning.message}`);
    });
  });

  return {
    blockingIssues,
    warningIssues,
  };
}

export function summarizeDeckTemplatePack(pack: DeckTemplatePack) {
  const validation = validateDeckTemplatePack(pack);
  const latestPublish = pack.publishArtifacts[0] ?? null;
  return {
    pageCount: pack.pages.length,
    slotCount: pack.pages.reduce((sum, page) => sum + page.semanticSlots.length, 0),
    unresolvedCount: pack.pages.reduce((sum, page) => sum + page.unresolvedObjectIds.length, 0),
    warningCount: pack.pages.reduce((sum, page) => sum + page.warnings.length, 0),
    status:
      validation.blockingIssues.length > 0
        ? "needs-review"
        : latestPublish
          ? latestPublish.result
          : "draft",
  } as const;
}
