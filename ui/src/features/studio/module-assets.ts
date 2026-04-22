import { MODULE_ASSET_STORAGE_KEY } from "./config";
import { normalizeModuleRegistryEntry, canUseStorage } from "./registry/helpers";
import {
  deleteCustomModuleRegistryEntry,
  loadAvailableModuleRegistry,
  upsertCustomModuleRegistryEntry,
} from "./registry";
import {
  getCanvasObjectKind,
  isAiTextField,
  isDecorativeTemplateField,
  isSemanticTemplateSlotField,
  isSquareTemplateField,
} from "./module-fields";
import type {
  CompositionPublishArtifact,
  CompositionTestCase,
  CompositionTestRun,
  ModuleAssetRecord,
  ModuleRegistryEntry,
  ModuleTemplateId,
  ModuleTrustSummary,
  PublishedModuleDeterministicCapability,
  PublishedModuleManifest,
  PublishedTemplateDecorativeKind,
  PublishedTemplateDecorativeManifest,
  PublishedTemplateManifest,
  PublishedTemplateSlotKind,
  PublishedTemplateShape,
  PublishedTemplateSlotManifest,
  TemplateManifestGeometry,
} from "./types";

type StoredModuleAssetLibrary = {
  version: 1;
  assets: ModuleAssetRecord[];
};

const MODULE_ASSET_LIBRARY_VERSION = 1 as const;
const TEMPLATE_CANVAS_COLUMNS = 160;
const TEMPLATE_CANVAS_ROWS = 90;

function normalizeList(items: string[] | undefined) {
  return (items ?? []).map((item) => item.trim()).filter(Boolean);
}

function normalizeCompositionTestCase(
  testCase: CompositionTestCase
): CompositionTestCase {
  return {
    ...testCase,
    id: testCase.id.trim(),
    label: testCase.label.trim(),
    brief: testCase.brief.trim(),
    moduleId: testCase.moduleId.trim(),
    skillIds: normalizeList(testCase.skillIds),
    expectedBehaviors: normalizeList(testCase.expectedBehaviors),
    expectedWarnings: normalizeList(testCase.expectedWarnings),
    tags: normalizeList(testCase.tags),
    runtimeInputOverride: testCase.runtimeInputOverride
      ? {
          sourceText: testCase.runtimeInputOverride.sourceText?.trim(),
          page: testCase.runtimeInputOverride.page
            ? {
                title: testCase.runtimeInputOverride.page.title?.trim(),
                note: testCase.runtimeInputOverride.page.note?.trim(),
                instruction:
                  testCase.runtimeInputOverride.page.instruction?.trim(),
                role: testCase.runtimeInputOverride.page.role?.trim(),
                intent: testCase.runtimeInputOverride.page.intent?.trim(),
                story: testCase.runtimeInputOverride.page.story?.trim(),
              }
            : undefined,
          deck: testCase.runtimeInputOverride.deck
            ? {
                previousPageSummary:
                  testCase.runtimeInputOverride.deck.previousPageSummary?.trim(),
                nextPageBridge:
                  testCase.runtimeInputOverride.deck.nextPageBridge?.trim(),
              }
            : undefined,
          block: testCase.runtimeInputOverride.block
            ? {
                title: testCase.runtimeInputOverride.block.title?.trim(),
                detail: testCase.runtimeInputOverride.block.detail?.trim(),
                intent: testCase.runtimeInputOverride.block.intent?.trim(),
              }
            : undefined,
          planItems: testCase.runtimeInputOverride.planItems?.map((item) =>
            item.kind === "metric"
              ? {
                  kind: "metric" as const,
                  value: item.value.trim(),
                  label: item.label.trim(),
                }
              : {
                  kind: "narrative" as const,
                  title: item.title.trim(),
                  body: item.body.trim(),
                }
          ),
        }
      : undefined,
  };
}

function normalizeCompositionPublishArtifact(
  artifact: CompositionPublishArtifact
): CompositionPublishArtifact {
  return {
    ...artifact,
    id: artifact.id.trim(),
    moduleId: artifact.moduleId.trim(),
    skillIds: normalizeList(artifact.skillIds),
    presetId: artifact.presetId?.trim() ?? null,
    basedOnTestRunIds: normalizeList(artifact.basedOnTestRunIds),
    versionNote: artifact.versionNote.trim(),
    publishedBy: artifact.publishedBy.trim(),
  };
}

function normalizeCompositionTestRun(
  run: CompositionTestRun
): CompositionTestRun {
  return {
    ...run,
    id: run.id.trim(),
    caseId: run.caseId.trim(),
    moduleId: run.moduleId.trim(),
    skillIds: normalizeList(run.skillIds),
    evaluation: {
      ...run.evaluation,
      notes: normalizeList(run.evaluation.notes),
    },
    baselineOutput: run.baselineOutput
      ? {
          ...run.baselineOutput,
          blockId: run.baselineOutput.blockId.trim(),
        }
      : null,
    composedOutput: {
      ...run.composedOutput,
      blockId: run.composedOutput.blockId.trim(),
    },
  };
}

function normalizeTemplateGeometry(
  geometry: TemplateManifestGeometry | undefined
): TemplateManifestGeometry | undefined {
  if (!geometry) {
    return undefined;
  }
  return {
    x: Math.max(0, Math.round(geometry.x)),
    y: Math.max(0, Math.round(geometry.y)),
    w: Math.max(0, Math.round(geometry.w)),
    h: Math.max(0, Math.round(geometry.h)),
  };
}

function inferPublishedTemplateSlotKind(slot: {
  slotKind?: PublishedTemplateSlotKind;
  objectKind?: string;
  outputFormat?: string;
  chartKind?: string;
}): PublishedTemplateSlotKind {
  if (slot.slotKind) {
    return slot.slotKind;
  }
  if (
    slot.objectKind === "chart" ||
    slot.outputFormat === "chart" ||
    slot.chartKind
  ) {
    return "chart";
  }
  if (slot.objectKind === "data") {
    return "data-summary";
  }
  return "ai-text";
}

function normalizePublishedTemplateManifest(
  template: PublishedTemplateManifest
): PublishedTemplateManifest {
  return {
    ...template,
    templateId: template.templateId.trim(),
    sourceModuleId: template.sourceModuleId.trim(),
    label: template.label.trim(),
    frame: normalizeTemplateGeometry(template.frame),
    visualHierarchy: normalizeList(template.visualHierarchy).slice(0, 8),
    slotManifest: template.slotManifest.slice(0, 20).map((slot) => ({
      ...slot,
      slotId: slot.slotId.trim(),
      label: slot.label.trim(),
      slotKind: inferPublishedTemplateSlotKind(slot),
      role: slot.role.trim(),
      geometry: normalizeTemplateGeometry(slot.geometry),
      outputGoal: slot.outputGoal?.trim(),
      contentBudget: normalizeList(slot.contentBudget).slice(0, 4),
    })),
    decorativeManifest: (template.decorativeManifest ?? []).slice(0, 20).map((item) => ({
      ...item,
      id: item.id.trim(),
      label: item.label.trim(),
      role: item.role.trim(),
      geometry: normalizeTemplateGeometry(item.geometry),
      asset: item.asset
        ? {
            assetId: item.asset.assetId.trim(),
            mimeType: item.asset.mimeType.trim(),
            size: item.asset.size,
            alt: item.asset.alt?.trim(),
          }
        : undefined,
      fit: item.fit === "contain" || item.fit === "cover" ? item.fit : undefined,
    })),
    copyBudget: normalizeList(template.copyBudget).slice(0, 8),
    allowedAdaptations: normalizeList(template.allowedAdaptations).slice(0, 8),
    fitRules: normalizeList(template.fitRules).slice(0, 8),
    promptContract: normalizeList(template.promptContract).slice(0, 8),
  };
}

function normalizeModuleAssetRecord(record: ModuleAssetRecord): ModuleAssetRecord {
  return {
    moduleId: record.moduleId.trim(),
    entry: normalizeModuleRegistryEntry(record.entry),
    testCases: (record.testCases ?? []).map(normalizeCompositionTestCase),
    testRuns: (record.testRuns ?? []).map(normalizeCompositionTestRun),
    publishArtifacts: (record.publishArtifacts ?? []).map(
      normalizeCompositionPublishArtifact
    ),
    publishedManifest: record.publishedManifest
      ? normalizePublishedModuleManifest(record.publishedManifest)
      : null,
    updatedAt: record.updatedAt,
  };
}

function normalizePublishedModuleManifest(
  manifest: PublishedModuleManifest
): PublishedModuleManifest {
  return {
    ...manifest,
    moduleId: manifest.moduleId.trim(),
    label: manifest.label.trim(),
    semanticRole: manifest.semanticRole.trim(),
    promptHint: manifest.promptHint.trim(),
    rendererCapabilities: manifest.rendererCapabilities,
    supportedChartKinds: manifest.supportedChartKinds.map((item) =>
      item.trim()
    ) as PublishedModuleManifest["supportedChartKinds"],
    outputContractSummary: normalizeList(manifest.outputContractSummary),
    fieldManifest: manifest.fieldManifest.map((field) => ({
      ...field,
      fieldId: field.fieldId.trim(),
      label: field.label.trim(),
      outputFormat: field.outputFormat,
      outputGoal: field.outputGoal?.trim(),
      chartKind: field.chartKind,
    })),
    lastPublishedAt: manifest.lastPublishedAt?.trim() ?? null,
    signature: manifest.signature.trim(),
    template: manifest.template
      ? normalizePublishedTemplateManifest(manifest.template)
      : undefined,
  };
}

function isStoredModuleAssetLibrary(
  value: unknown
): value is StoredModuleAssetLibrary {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<StoredModuleAssetLibrary>;
  return (
    candidate.version === MODULE_ASSET_LIBRARY_VERSION &&
    Array.isArray(candidate.assets)
  );
}

function readStoredModuleAssetLibrary() {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(MODULE_ASSET_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isStoredModuleAssetLibrary(parsed)) {
      return null;
    }

    return {
      version: MODULE_ASSET_LIBRARY_VERSION,
      assets: parsed.assets.map(normalizeModuleAssetRecord),
    } satisfies StoredModuleAssetLibrary;
  } catch {
    return null;
  }
}

function writeStoredModuleAssetLibrary(records: ModuleAssetRecord[]) {
  if (!canUseStorage()) {
    return;
  }

  const payload: StoredModuleAssetLibrary = {
    version: MODULE_ASSET_LIBRARY_VERSION,
    assets: records.map(normalizeModuleAssetRecord),
  };

  window.localStorage.setItem(MODULE_ASSET_STORAGE_KEY, JSON.stringify(payload));
}

function createEmptyModuleAssetRecord(entry: ModuleRegistryEntry): ModuleAssetRecord {
  return {
    moduleId: entry.id,
    entry: normalizeModuleRegistryEntry(entry),
    testCases: [],
    testRuns: [],
    publishArtifacts: [],
    publishedManifest: null,
    updatedAt: new Date().toISOString(),
  };
}

function inferSupportedChartKinds(entry: ModuleRegistryEntry) {
  const directKinds = entry.fields
    .flatMap((field) => (field.chartSpec?.kind ? [field.chartSpec.kind] : []));

  if (directKinds.length > 0) {
    return [...new Set(directKinds)];
  }

  if (entry.kind === "bars") {
    return ["bar", "stacked"] as const;
  }
  if (entry.kind === "line") {
    return ["line"] as const;
  }
  if (entry.kind === "gantt") {
    return ["waterfall"] as const;
  }

  return [] as const;
}

function inferDeterministicCapability(
  entry: ModuleRegistryEntry
): PublishedModuleDeterministicCapability {
  const hasThinkingFlow = Boolean(
    entry.thinkingFlow?.nodes?.length && entry.thinkingFlow?.edges?.length
  );
  const hasRenderer = (entry.rendererCapabilities ?? []).length > 0;

  if (hasThinkingFlow && hasRenderer) {
    return "hybrid";
  }
  if (hasThinkingFlow) {
    return "flow";
  }
  if (hasRenderer) {
    return "native";
  }
  return "fallback";
}

function computeTrustScore(summary: ModuleTrustSummary) {
  const publishedWeight = Math.min(summary.publishArtifacts, 3) * 0.15;
  const passWeight = Math.min(summary.passRuns, 5) * 0.1;
  const warnPenalty = Math.min(summary.warnRuns, 3) * 0.04;
  const failPenalty = Math.min(summary.failRuns, 3) * 0.08;
  const base = summary.hasPassingEvidence ? 0.45 : 0.2;

  return Math.max(
    0,
    Math.min(1, Number((base + publishedWeight + passWeight - warnPenalty - failPenalty).toFixed(2)))
  );
}

function getTemplateArea(geometry: TemplateManifestGeometry | undefined) {
  return geometry ? geometry.w * geometry.h : 0;
}

function isFieldInsideTemplateFrame(
  field: ModuleRegistryEntry["fields"][number],
  frame: TemplateManifestGeometry | undefined
) {
  if (!frame || !field.layout) {
    return true;
  }
  return (
    field.layout.x >= frame.x &&
    field.layout.y >= frame.y &&
    field.layout.x + field.layout.w <= frame.x + frame.w &&
    field.layout.y + field.layout.h <= frame.y + frame.h
  );
}

function getTemplateRenderableFields(entry: ModuleRegistryEntry) {
  const frame = normalizeTemplateGeometry(entry.moduleFrame);
  return entry.fields
    .filter((field) => (field.surface ?? "artboard") === "artboard")
    .filter((field) => isFieldInsideTemplateFrame(field, frame))
    .slice(0, 20);
}

function inferTemplateSlotRole(
  field: ModuleRegistryEntry["fields"][number]
) {
  const text = [
    field.label,
    field.description,
    field.outputContract?.goal,
    field.outputContract?.format,
    field.chartSpec?.kind,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (field.chartSpec || field.outputContract?.format === "chart") {
    return "primary-chart";
  }
  if (/headline|claim|thesis|title|主张|标题/.test(text)) {
    return "headline-claim";
  }
  if (/evidence|metric|proof|data|signal|证据|数据/.test(text)) {
    return "evidence-proof";
  }
  if (/takeaway|lesson|outcome|implication|结论|启示|结果/.test(text)) {
    return "takeaway";
  }
  if (/step|phase|timeline|sequence|stage|阶段|流程/.test(text)) {
    return "story-step";
  }
  return field.required ? "required-content" : "supporting-content";
}

function inferTemplateDecorativeKind(
  field: ModuleRegistryEntry["fields"][number]
): PublishedTemplateDecorativeKind {
  const objectKind = getCanvasObjectKind(field);
  if (objectKind === "image") return "image";
  if (objectKind === "line") return "line";
  if (objectKind === "ellipse") return "circle";
  if (isSquareTemplateField(field)) return "square";
  if (objectKind === "rectangle") return "rectangle";
  return "locked-text";
}

function inferTemplateDecorativeRole(
  field: ModuleRegistryEntry["fields"][number]
) {
  const objectKind = getCanvasObjectKind(field);
  const text = [field.label, field.description].join(" ").toLowerCase();
  if (objectKind === "line") {
    return /arrow|flow|direction/.test(text) ? "direction-line" : "divider-line";
  }
  if (objectKind === "text") {
    return /caption|label|badge|eyebrow/.test(text)
      ? "locked-label"
      : "locked-text";
  }
  if (objectKind === "image") {
    return /photo|portrait|hero|cover/.test(text) ? "hero-image" : "support-image";
  }
  if (objectKind === "ellipse") {
    return "badge-shape";
  }
  if (isSquareTemplateField(field)) {
    return "square-callout";
  }
  return "container-shape";
}

function inferTemplateContentBudget(
  field: ModuleRegistryEntry["fields"][number]
) {
  const length = field.outputContract?.length ?? "short";
  const format = field.outputContract?.format ?? "point";
  const base =
    format === "chart"
      ? "Use source-backed chart labels only; do not invent categories or series."
      : format === "bullets"
        ? "Use at most 2 bullets for this slot."
        : format === "comparison"
          ? "Use one focused comparison pattern, not a balanced card wall."
          : "Use one compact sentence or label.";
  const maxChars =
    length === "full"
      ? "Keep text under 180 characters."
      : length === "tight"
        ? "Keep text under 72 characters."
        : "Keep text under 110 characters.";

  return [base, maxChars];
}

function inferTemplateShape(
  entry: ModuleRegistryEntry,
  frame: TemplateManifestGeometry | undefined,
  slots: PublishedTemplateSlotManifest[]
): PublishedTemplateShape {
  const fullPageArea = TEMPLATE_CANVAS_COLUMNS * TEMPLATE_CANVAS_ROWS;
  const frameArea = getTemplateArea(frame);
  const largestSlot = [...slots].sort(
    (left, right) => getTemplateArea(right.geometry) - getTemplateArea(left.geometry)
  )[0];
  const searchText = [
    entry.label,
    entry.family,
    entry.category,
    entry.semanticRole,
    entry.description,
    entry.promptHint,
    ...entry.searchTerms,
  ]
    .join(" ")
    .toLowerCase();

  if (frameArea > 0 && frameArea < fullPageArea * 0.45) {
    return "module-fragment";
  }
  if (/\b(case|timeline|journey|rollout|phase|sequence)\b/.test(searchText)) {
    return "case-timeline";
  }
  if (entry.kind === "line" || entry.kind === "bars" || largestSlot?.chartKind) {
    return "annotation-stage";
  }
  if (entry.kind === "flow" || entry.kind === "phases" || entry.kind === "gantt") {
    return "vertical-story-strip";
  }
  if (entry.kind === "matrix") {
    return "evidence-wall";
  }
  if (largestSlot?.geometry && largestSlot.geometry.w > 100 && largestSlot.geometry.h > 45) {
    return "center-stage-figure";
  }
  if (slots.length <= 2) {
    return "single-proof-canvas";
  }
  return "page-template";
}

export function buildPublishedTemplateManifest(
  entry: ModuleRegistryEntry
): PublishedTemplateManifest {
  const frame = normalizeTemplateGeometry(entry.moduleFrame);
  const templateFields = getTemplateRenderableFields(entry);
  const semanticFields = templateFields.filter(isSemanticTemplateSlotField);
  const decorativeFields = templateFields.filter(isDecorativeTemplateField);
  const fieldsWithArea = templateFields
    .slice(0, 20)
    .map((field) => ({
      field,
      area: getTemplateArea(field.layout),
    }))
    .sort((left, right) => right.area - left.area);
  const semanticFieldsWithArea = semanticFields
    .map((field) => ({
      field,
      area: getTemplateArea(field.layout),
    }))
    .sort((left, right) => right.area - left.area);
  const primaryFieldIds = new Set(
    semanticFieldsWithArea.slice(0, 1).map((item) => item.field.id)
  );
  const secondaryFieldIds = new Set(
    semanticFieldsWithArea.slice(1, 3).map((item) => item.field.id)
  );
  const slotManifest = semanticFields.slice(0, 20).map((field) => {
    const visualWeight = primaryFieldIds.has(field.id)
      ? "primary"
      : secondaryFieldIds.has(field.id)
        ? "secondary"
        : "supporting";
    return {
      slotId: field.id,
      label: field.label,
      slotKind:
        getCanvasObjectKind(field) === "chart"
          ? "chart"
          : getCanvasObjectKind(field) === "data"
          ? "data-summary"
          : "ai-text",
      role: inferTemplateSlotRole(field),
      required: field.required,
      canHide: !field.required,
      objectKind: field.objectKind,
      outputFormat: field.outputContract?.format,
      outputGoal: field.outputContract?.goal,
      chartKind: field.chartSpec?.kind,
      geometry: normalizeTemplateGeometry(field.layout),
      visualWeight,
      contentBudget: inferTemplateContentBudget(field),
    } satisfies PublishedTemplateSlotManifest;
  });
  const decorativeManifest = decorativeFields
    .slice(0, 20)
    .map((field) => ({
      id: field.id,
      label: field.label,
      kind: inferTemplateDecorativeKind(field),
      role: inferTemplateDecorativeRole(field),
      geometry: normalizeTemplateGeometry(field.layout),
      asset: field.imageAsset
        ? {
            ...field.imageAsset,
          }
        : undefined,
      fit: field.imageFit,
      style: field.style
        ? {
            fill: field.style.fill,
            stroke: field.style.stroke,
            strokeWidth: field.style.strokeWidth,
            strokeStyle: field.style.strokeStyle,
            radius: field.style.radius,
            textAlign: field.style.textAlign,
            rotation: field.style.rotation,
          }
        : undefined,
    })) satisfies PublishedTemplateDecorativeManifest[];
  const shape = inferTemplateShape(entry, frame, slotManifest);
  const visualHierarchy = fieldsWithArea
    .slice(0, 5)
    .map(({ field }, index) =>
      `${index + 1}. ${field.label} as ${
        isSemanticTemplateSlotField(field)
          ? inferTemplateSlotRole(field)
          : inferTemplateDecorativeRole(field)
      }`
    );

  return normalizePublishedTemplateManifest({
    templateId: entry.id,
    sourceModuleId: entry.id,
    label: entry.label,
    family: entry.family,
    shape,
    frame,
    visualHierarchy,
    slotManifest,
    decorativeManifest,
    copyBudget: [
      "One page, one answer, one headline claim.",
      "Use at most 2 support bullets and 2 evidence callouts.",
      "Prefer deleting weak secondary content over filling every slot.",
    ],
    allowedAdaptations: [
      "Hide optional slots when source content is weak or repetitive.",
      "Keep the primary geometry and reading order intact.",
      "Use built-in freeform composition when required slots do not match the page need.",
    ],
    fitRules: [
      "Do not invent filler just to occupy an empty template slot.",
      "Do not turn the template into a same-weight card wall.",
      "Do not use 3D interpretation unless the user explicitly requested 3D.",
      "Preserve decorative geometry such as dividers, callout boxes, and locked labels.",
    ],
    promptContract: [
      `${entry.label} is a shape contract, not a content script.`,
      entry.promptHint,
      entry.semanticRole,
    ].filter(Boolean),
  });
}

function buildPublishedModuleManifest(
  entry: ModuleRegistryEntry,
  summary: ModuleTrustSummary,
  publishArtifacts: CompositionPublishArtifact[]
): PublishedModuleManifest {
  const supportedChartKinds = inferSupportedChartKinds(entry);
  const deterministicCapability = inferDeterministicCapability(entry);
  const lastPublishedAt = [...publishArtifacts]
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))[0]?.publishedAt ?? null;
  const outputContractSummary = entry.fields
    .map((field) => {
      if (!field.outputContract?.goal?.trim()) {
        return "";
      }
      return `${field.label}: ${field.outputContract.goal.trim()}`;
    })
    .filter(Boolean)
    .slice(0, 6);
  const fieldManifest = entry.fields.slice(0, 12).map((field) => ({
    fieldId: field.id,
    label: field.label,
    required: field.required,
    objectKind: field.objectKind,
    outputFormat: field.outputContract?.format,
    outputGoal: field.outputContract?.goal,
    chartKind: field.chartSpec?.kind,
  }));
  const template = buildPublishedTemplateManifest(entry);
  const templateSignature = [
    template.shape,
    template.slotManifest.length,
    template.decorativeManifest.length,
    template.slotManifest
      .slice(0, 6)
      .map((slot) => `${slot.visualWeight[0]}${slot.required ? "r" : "o"}`)
      .join(""),
  ].join(":");
  const signature = [
    entry.id,
    entry.status,
    entry.kind,
    deterministicCapability,
    supportedChartKinds.join(","),
    lastPublishedAt ?? "",
    summary.latestRunAt ?? "",
    summary.latestRunResult ?? "",
    summary.publishArtifacts,
    templateSignature,
  ].join("|");

  return normalizePublishedModuleManifest({
    moduleId: entry.id,
    kind: entry.kind,
    category: entry.category,
    status: entry.status,
    label: entry.label,
    semanticRole: entry.semanticRole,
    promptHint: entry.promptHint,
    rendererCapabilities: [...(entry.rendererCapabilities ?? [])],
    supportedChartKinds: [...supportedChartKinds],
    deterministicCapability,
    outputContractSummary,
    fieldManifest,
    publishCount: publishArtifacts.length,
    lastPublishedAt,
    hasPassingEvidence: summary.hasPassingEvidence,
    trustScore: computeTrustScore(summary),
    signature,
    template,
  });
}

function shouldExposePublishedManifest(
  entry: ModuleRegistryEntry,
  summary: ModuleTrustSummary,
  publishArtifacts: CompositionPublishArtifact[]
) {
  const template = buildPublishedTemplateManifest(entry);
  const hasAiTextSlot = template.slotManifest.some((slot) => slot.slotKind === "ai-text");
  const requiresSemanticSlot = template.shape !== "module-fragment";
  if (requiresSemanticSlot && !hasAiTextSlot) {
    return false;
  }

  if (entry.status === "draft") {
    return false;
  }

  if (entry.scope === "core") {
    return entry.status === "stable" || entry.status === "beta";
  }

  if (entry.status !== "stable" && entry.status !== "beta") {
    return false;
  }

  return summary.hasPassingEvidence || publishArtifacts.length > 0;
}

function upsertModuleAssetRecord(record: ModuleAssetRecord) {
  const normalized = normalizeModuleAssetRecord({
    ...record,
    updatedAt: new Date().toISOString(),
  });
  const current = loadModuleAssetRecords();
  const next = current.some((item) => item.moduleId === normalized.moduleId)
    ? current.map((item) =>
        item.moduleId === normalized.moduleId ? normalized : item
      )
    : [...current, normalized];

  writeStoredModuleAssetLibrary(next);
  return normalized;
}

export function loadModuleAssetRecords() {
  return readStoredModuleAssetLibrary()?.assets ?? [];
}

export function getModuleAssetRecord(moduleId: ModuleTemplateId) {
  return loadModuleAssetRecords().find((record) => record.moduleId === moduleId) ?? null;
}

export function saveModuleAssetEntry(entry: ModuleRegistryEntry) {
  upsertCustomModuleRegistryEntry(entry);
  const record = getModuleAssetRecord(entry.id);
  const nextRecord = record
    ? {
        ...record,
        entry,
      }
    : createEmptyModuleAssetRecord(entry);
  const trustSummary = buildModuleTrustSummary(nextRecord);
  const publishArtifacts = nextRecord.publishArtifacts ?? [];

  return upsertModuleAssetRecord({
    ...nextRecord,
    publishedManifest: shouldExposePublishedManifest(entry, trustSummary, publishArtifacts)
      ? buildPublishedModuleManifest(entry, trustSummary, publishArtifacts)
      : null,
  });
}

export function deleteModuleAsset(moduleId: ModuleTemplateId) {
  deleteCustomModuleRegistryEntry(moduleId);
  const next = loadModuleAssetRecords().filter((record) => record.moduleId !== moduleId);
  writeStoredModuleAssetLibrary(next);
}

export function saveCompositionTestCaseRecord(args: {
  moduleId: ModuleTemplateId;
  entry: ModuleRegistryEntry;
  testCase: CompositionTestCase;
}) {
  const current =
    getModuleAssetRecord(args.moduleId) ?? createEmptyModuleAssetRecord(args.entry);
  return upsertModuleAssetRecord({
    ...current,
    entry: args.entry,
    testCases: current.testCases.some((item) => item.id === args.testCase.id)
      ? current.testCases.map((item) =>
          item.id === args.testCase.id ? args.testCase : item
        )
      : [...current.testCases, args.testCase],
  });
}

export function deleteCompositionTestCaseRecord(args: {
  moduleId: ModuleTemplateId;
  caseId: string;
}) {
  const current = getModuleAssetRecord(args.moduleId);
  if (!current) {
    return null;
  }

  return upsertModuleAssetRecord({
    ...current,
    testCases: current.testCases.filter((item) => item.id !== args.caseId),
    testRuns: current.testRuns.filter((run) => run.caseId !== args.caseId),
  });
}

export function appendCompositionTestRunRecord(args: {
  moduleId: ModuleTemplateId;
  entry: ModuleRegistryEntry;
  run: CompositionTestRun;
}) {
  const current =
    getModuleAssetRecord(args.moduleId) ?? createEmptyModuleAssetRecord(args.entry);
  const nextRecord = {
    ...current,
    entry: args.entry,
    testRuns: [args.run, ...current.testRuns].slice(0, 50),
  };
  const trustSummary = buildModuleTrustSummary(nextRecord);
  return upsertModuleAssetRecord({
    ...nextRecord,
    publishedManifest: shouldExposePublishedManifest(
      args.entry,
      trustSummary,
      nextRecord.publishArtifacts ?? []
    )
      ? buildPublishedModuleManifest(args.entry, trustSummary, nextRecord.publishArtifacts ?? [])
      : null,
  });
}

export function appendCompositionPublishArtifactRecord(args: {
  moduleId: ModuleTemplateId;
  entry: ModuleRegistryEntry;
  artifact: CompositionPublishArtifact;
}) {
  const current =
    getModuleAssetRecord(args.moduleId) ?? createEmptyModuleAssetRecord(args.entry);
  const nextRecord = {
    ...current,
    entry: args.entry,
    publishArtifacts: [args.artifact, ...current.publishArtifacts],
  };
  const trustSummary = buildModuleTrustSummary(nextRecord);
  return upsertModuleAssetRecord({
    ...nextRecord,
    publishedManifest: shouldExposePublishedManifest(
      args.entry,
      trustSummary,
      nextRecord.publishArtifacts
    )
      ? buildPublishedModuleManifest(args.entry, trustSummary, nextRecord.publishArtifacts)
      : null,
  });
}

export function buildModuleTrustSummary(
  record: ModuleAssetRecord | null | undefined
): ModuleTrustSummary {
  const testRuns = record?.testRuns ?? [];
  const passRuns = testRuns.filter((run) => run.result === "pass").length;
  const warnRuns = testRuns.filter((run) => run.result === "warn").length;
  const failRuns = testRuns.filter((run) => run.result === "fail").length;
  const latestRun = [...testRuns].sort((a, b) =>
    b.finishedAt.localeCompare(a.finishedAt)
  )[0];

  return {
    moduleId: record?.moduleId ?? "",
    totalTestCases: record?.testCases.length ?? 0,
    totalTestRuns: testRuns.length,
    passRuns,
    warnRuns,
    failRuns,
    latestRunAt: latestRun?.finishedAt ?? null,
    latestRunResult: latestRun?.result ?? null,
    publishArtifacts: record?.publishArtifacts.length ?? 0,
    hasPassingEvidence: passRuns > 0,
  };
}

export function loadPublishedModuleManifests() {
  const recordsById = new Map(
    loadModuleAssetRecords().map((record) => [record.moduleId, record] as const)
  );

  return loadAvailableModuleRegistry()
    .map((entry) => {
      const record = recordsById.get(entry.id) ?? null;
      if (record?.publishedManifest) {
        return record.publishedManifest;
      }

      const summary = buildModuleTrustSummary(record);
      const publishArtifacts = record?.publishArtifacts ?? [];
      if (!shouldExposePublishedManifest(entry, summary, publishArtifacts)) {
        return null;
      }

      return buildPublishedModuleManifest(entry, summary, publishArtifacts);
    })
    .filter((manifest): manifest is PublishedModuleManifest => Boolean(manifest))
    .sort((left, right) => right.trustScore - left.trustScore || left.label.localeCompare(right.label));
}

export function createPublishedModuleManifestSignature(
  manifests: PublishedModuleManifest[]
) {
  return manifests
    .map((manifest) => manifest.signature)
    .sort((left, right) => left.localeCompare(right))
    .join("::");
}
