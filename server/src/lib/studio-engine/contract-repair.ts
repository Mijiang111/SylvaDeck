import type {
  ExportDataContract,
  ExportObjectContract,
  ExportObjectKind,
  ExportRenderTarget,
  PageExportContract,
} from "./schemas.js";
import { exportDataContractSchema } from "./schemas.js";
import type { PageExportContractDiagnostic } from "./render.js";

export type ContractRepairIssueCode =
  | PageExportContractDiagnostic["code"]
  | "export-contract-render-target-missing"
  | "export-contract-duplicate-ownership"
  | "export-contract-ownership-scope-missing"
  | "export-contract-forbidden-interpretation-missing"
  | "export-contract-missing"
  | "export-contract-kind-mismatch"
  | "export-contract-forbidden-violation"
  | "export-contract-native-table-missing-data";

export type ContractRepairTier = "micro-patch" | "object-model" | "page-model";

export type ContractRepairIssue = {
  pageNumber: number;
  objectId: string;
  code: ContractRepairIssueCode;
  message: string;
  expected: {
    objectKind: ExportObjectKind;
    renderTarget: ExportRenderTarget;
    dataContractType: ExportDataContract["type"] | null;
  } | null;
  actualMetadata: {
    rootCount: number;
    objectKind: string | null;
    exportObjectKind: string | null;
    renderTarget: string | null;
    dataContractType: string | null;
    ownershipScope: string | null;
    qualityIntent: string | null;
    layoutArchetype: string | null;
    visualGrammar: string | null;
    forbiddenInterpretation: string[];
    forbiddenInterpretationRaw: string | null;
  };
  missingFields: string[];
  ownershipConflict: string | null;
  forbiddenInterpretation: string[];
  repairTier: ContractRepairTier;
};

const MICRO_PATCHABLE_CODES = new Set<ContractRepairIssueCode>([
  "primary-export-object-kind-mismatch",
  "primary-export-object-render-target-missing",
  "export-object-kind-mismatch",
  "export-contract-kind-mismatch",
  "export-object-render-target-missing",
  "export-contract-render-target-missing",
  "export-data-contract-missing",
  "export-contract-ownership-scope-missing",
  "export-contract-forbidden-interpretation-missing",
  "export-contract-quality-intent-missing",
  "export-contract-page-ir-metadata-missing",
]);

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function decodeHtmlAttribute(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function readHtmlAttribute(tagHtml: string, name: string) {
  const match = tagHtml.match(new RegExp(`\\s${name}=(["'])([\\s\\S]*?)\\1`, "i"));
  return match?.[2] ?? null;
}

function hasHtmlAttribute(tagHtml: string, name: string) {
  return new RegExp(`\\s${name}(?:\\s*=|\\s|>|/)`, "i").test(tagHtml);
}

function addHtmlAttribute(tagHtml: string, name: string, value: string) {
  if (hasHtmlAttribute(tagHtml, name)) {
    return tagHtml;
  }
  const insertion = ` ${name}="${escapeHtmlAttribute(value)}"`;
  if (tagHtml.endsWith("/>")) {
    return `${tagHtml.slice(0, -2)}${insertion} />`;
  }
  return `${tagHtml.slice(0, -1)}${insertion}>`;
}

function setHtmlAttribute(tagHtml: string, name: string, value: string) {
  const encodedValue = escapeHtmlAttribute(value);
  if (!hasHtmlAttribute(tagHtml, name)) {
    return addHtmlAttribute(tagHtml, name, value);
  }
  return tagHtml.replace(
    new RegExp(`(\\s${name}=)(["'])([\\s\\S]*?)\\2`, "i"),
    (_match, prefix: string) => `${prefix}"${encodedValue}"`,
  );
}

function findElementOpenTagsByExportObjectId(sectionHtml: string, objectId: string) {
  const escapedObjectId = escapeRegex(objectId);
  return Array.from(
    sectionHtml.matchAll(
      new RegExp(`<[^>]+\\sdata-export-object-id=(["'])${escapedObjectId}\\1[^>]*>`, "gi"),
    ),
  ).map((match) => match[0]);
}

function dataContractTypeFromAttribute(raw: string | null) {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(decodeHtmlAttribute(raw)) as {
      dataContract?: { type?: unknown } | null;
    };
    return typeof parsed.dataContract?.type === "string" ? parsed.dataContract.type : null;
  } catch {
    return null;
  }
}

function ownershipScopeAttribute(contract: ExportObjectContract) {
  return [
    contract.ownershipScope.ownsText ? "text" : "",
    contract.ownershipScope.ownsShapes ? "shape" : "",
    contract.ownershipScope.ownsSvg ? "svg" : "",
  ].filter(Boolean).join(",");
}

function expectedDataContractType(contract: ExportObjectContract | null) {
  return contract?.dataContract?.type ?? null;
}

function minimumFieldsForDataContract(contract: ExportObjectContract | null) {
  const dataContract = contract?.dataContract ?? null;
  if (!dataContract) {
    return ["dataContract"];
  }
  if (dataContract.type === "missing-data") {
    return dataContract.requiredFields.map((field) => `dataContract.${field}`);
  }
  if (dataContract.type === "chart-bar" || dataContract.type === "chart-stacked" || dataContract.type === "chart-line") {
    return ["dataContract.categories", "dataContract.series"];
  }
  if (dataContract.type === "chart-combo") {
    return ["dataContract.categories", "dataContract.barSeries", "dataContract.lineSeries"];
  }
  if (dataContract.type === "chart-waterfall") {
    return ["dataContract.steps"];
  }
  if (dataContract.type === "chart-bubble") {
    return ["dataContract.points[x,y,size,label]"];
  }
  if (dataContract.type === "matrix") {
    return ["dataContract.axes", "dataContract.items", "dataContract.renderTarget"];
  }
  if (dataContract.type === "table") {
    return ["dataContract.columns", "dataContract.rows", "dataContract.nativeTableAllowed"];
  }
  return ["dataContract"];
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeContractText(value: unknown, fallback = "", maxLength = 240) {
  const text = typeof value === "string" || typeof value === "number"
    ? String(value).replace(/\s+/g, " ").trim()
    : "";
  const normalized = text || fallback;
  return normalized.length > maxLength ? normalized.slice(0, maxLength).trim() : normalized;
}

function normalizeContractRatio(value: unknown, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const ratio = numeric > 1 && numeric <= 100 ? numeric / 100 : numeric;
  return clampNumber(ratio, 0, 1);
}

function normalizeContractColor(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : undefined;
}

function defaultMatrixQuadrantGeometry(index: number) {
  return {
    x: index % 2 === 1 ? 0.5 : 0,
    y: index > 1 ? 0.5 : 0,
    w: 0.5,
    h: 0.5,
  };
}

function normalizeMatrixDataContract(raw: Record<string, unknown>): ExportDataContract | null {
  if (raw.type !== "matrix") {
    return null;
  }

  const axes = raw.axes && typeof raw.axes === "object" ? raw.axes as Record<string, unknown> : {};
  const xAxis = axes.x && typeof axes.x === "object" ? axes.x as Record<string, unknown> : {};
  const yAxis = axes.y && typeof axes.y === "object" ? axes.y as Record<string, unknown> : {};
  const items = Array.isArray(raw.items) ? raw.items : [];
  const normalizedItems = items
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const label = normalizeContractText(record.label, `Item ${index + 1}`, 160);
      return {
        id: normalizeContractText(record.id, "", 120) || undefined,
        x: normalizeContractRatio(record.x, index % 2 ? 0.56 : 0.08),
        y: normalizeContractRatio(record.y, index < 2 ? 0.08 : 0.56),
        label,
        detail: normalizeContractText(record.detail ?? record.note, "", 240) || undefined,
        color: normalizeContractColor(record.color),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item?.label));

  if (normalizedItems.length === 0) {
    return null;
  }

  const quadrants = Array.isArray(raw.quadrants)
    ? raw.quadrants
        .map((quadrant, index) => {
          if (!quadrant || typeof quadrant !== "object") {
            return null;
          }
          const record = quadrant as Record<string, unknown>;
          const geometry = defaultMatrixQuadrantGeometry(index);
          const label = normalizeContractText(record.label, `Quadrant ${index + 1}`, 160);
          return {
            id: normalizeContractText(record.id, "", 120) || undefined,
            label,
            x: normalizeContractRatio(record.x, geometry.x),
            y: normalizeContractRatio(record.y, geometry.y),
            w: normalizeContractRatio(record.w, geometry.w),
            h: normalizeContractRatio(record.h, geometry.h),
            color: normalizeContractColor(record.color),
            textColor: normalizeContractColor(record.textColor),
          };
        })
        .filter((quadrant): quadrant is NonNullable<typeof quadrant> => Boolean(quadrant?.label))
    : undefined;

  const rawCallout = raw.callout && typeof raw.callout === "object"
    ? raw.callout as Record<string, unknown>
    : null;
  const calloutTitle = rawCallout
    ? normalizeContractText(rawCallout.title ?? rawCallout.text, "", 160)
    : "";
  const calloutBody = rawCallout
    ? normalizeContractText(rawCallout.body ?? (rawCallout.title ? rawCallout.text : ""), "", 300)
    : "";
  const callout = rawCallout && calloutTitle
    ? {
        title: calloutTitle,
        body: calloutBody || undefined,
        x: normalizeContractRatio(rawCallout.x, 0.68),
        y: normalizeContractRatio(rawCallout.y, 0.12),
        w: normalizeContractRatio(rawCallout.w, 0.24),
        h: normalizeContractRatio(rawCallout.h, 0.2),
      }
    : undefined;

  const labels = Array.isArray(raw.labels)
    ? raw.labels.map((label) => normalizeContractText(label, "", 120)).filter(Boolean)
    : undefined;

  const normalized = {
    type: "matrix" as const,
    axes: {
      x: {
        label: normalizeContractText(xAxis.label ?? raw.xLabel, "X axis", 120),
        unit: normalizeContractText(xAxis.unit, "", 40) || undefined,
        min: Number.isFinite(Number(xAxis.min)) ? Number(xAxis.min) : undefined,
        max: Number.isFinite(Number(xAxis.max)) ? Number(xAxis.max) : undefined,
      },
      y: {
        label: normalizeContractText(yAxis.label ?? raw.yLabel, "Y axis", 120),
        unit: normalizeContractText(yAxis.unit, "", 40) || undefined,
        min: Number.isFinite(Number(yAxis.min)) ? Number(yAxis.min) : undefined,
        max: Number.isFinite(Number(yAxis.max)) ? Number(yAxis.max) : undefined,
      },
    },
    quadrants: quadrants && quadrants.length > 0 ? quadrants : undefined,
    items: normalizedItems,
    labels: labels && labels.length > 0 ? labels : undefined,
    callout,
    renderTarget: "editable-shapes" as const,
  };

  const parsed = exportDataContractSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

function normalizeLenientDataContract(payload: unknown): unknown | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const dataContract = record.dataContract;
  if (!dataContract || typeof dataContract !== "object") {
    return null;
  }
  const normalizedDataContract = normalizeMatrixDataContract(dataContract as Record<string, unknown>);
  if (!normalizedDataContract) {
    return null;
  }
  return {
    ...record,
    dataContract: normalizedDataContract,
    renderTarget: record.renderTarget === "editable-shapes" ? record.renderTarget : "editable-shapes",
  };
}

function normalizeLenientDataContractTag(tag: string) {
  const raw = readHtmlAttribute(tag, "data-export-contract");
  if (!raw) {
    return tag;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeHtmlAttribute(raw));
  } catch {
    return tag;
  }
  const normalized = normalizeLenientDataContract(parsed);
  if (!normalized) {
    return tag;
  }
  const normalizedJson = JSON.stringify(normalized);
  return normalizedJson === decodeHtmlAttribute(raw)
    ? tag
    : setHtmlAttribute(tag, "data-export-contract", normalizedJson);
}

function missingFieldsForIssue(args: {
  code: ContractRepairIssueCode;
  expected: ExportObjectContract | null;
  actualMetadata: ContractRepairIssue["actualMetadata"];
}) {
  switch (args.code) {
    case "export-object-metadata-missing":
    case "primary-export-object-metadata-missing":
    case "export-contract-missing":
      return ["data-export-object-id", "root"];
    case "export-object-kind-mismatch":
    case "primary-export-object-kind-mismatch":
    case "export-contract-kind-mismatch":
      return [
        args.actualMetadata.objectKind ? "" : "data-semantic-kind",
        args.actualMetadata.exportObjectKind ? "" : "data-export-object-kind",
      ].filter(Boolean);
    case "export-object-render-target-missing":
    case "primary-export-object-render-target-missing":
      return args.actualMetadata.renderTarget ? [] : ["data-render-target"];
    case "export-contract-render-target-missing":
      return args.actualMetadata.renderTarget ? ["native-object"] : ["data-render-target"];
    case "export-data-contract-missing":
      return ["data-export-contract"];
    case "export-data-contract-invalid":
    case "export-data-contract-incompatible":
    case "export-data-contract-minimum-data-missing":
    case "export-contract-native-table-missing-data":
      return minimumFieldsForDataContract(args.expected);
    case "export-object-duplicate-root":
    case "export-contract-duplicate-ownership":
      return ["independent-root", "ownership-scope"];
    case "export-contract-ownership-scope-missing":
      return ["data-ownership-scope"];
    case "export-contract-forbidden-interpretation-missing":
      return ["data-forbidden-export"];
    case "export-contract-quality-intent-missing":
      return ["data-quality-intent"];
    case "export-contract-page-ir-metadata-missing":
      return ["data-layout-archetype", "data-visual-grammar"];
    case "export-contract-forbidden-violation":
      return ["forbiddenInterpretation"];
    default:
      return [];
  }
}

function isCompleteExpectedDataContract(contract: ExportObjectContract | null) {
  return Boolean(contract?.dataContract && contract.dataContract.type !== "missing-data");
}

function canMicroPatchIssue(args: {
  code: ContractRepairIssueCode;
  expected: ExportObjectContract | null;
  actualMetadata: ContractRepairIssue["actualMetadata"];
}) {
  if (!MICRO_PATCHABLE_CODES.has(args.code) || args.actualMetadata.rootCount !== 1) {
    return false;
  }
  if (
    args.code === "export-object-kind-mismatch" ||
    args.code === "primary-export-object-kind-mismatch" ||
    args.code === "export-contract-kind-mismatch"
  ) {
    const semanticKindSafe = !args.actualMetadata.objectKind ||
      args.actualMetadata.objectKind === args.expected?.objectKind;
    const exportObjectKindSafe = !args.actualMetadata.exportObjectKind ||
      args.actualMetadata.exportObjectKind === args.expected?.objectKind;
    if (!semanticKindSafe || !exportObjectKindSafe) {
      return false;
    }
    if (args.actualMetadata.objectKind && args.actualMetadata.exportObjectKind) {
      return false;
    }
  }
  if (args.code === "export-data-contract-missing") {
    return isCompleteExpectedDataContract(args.expected);
  }
  if (args.code === "export-contract-render-target-missing" && args.actualMetadata.renderTarget) {
    return false;
  }
  return true;
}

function repairTierForIssue(args: {
  code: ContractRepairIssueCode;
  expected: ExportObjectContract | null;
  actualMetadata: ContractRepairIssue["actualMetadata"];
}) {
  if (canMicroPatchIssue(args)) {
    return "micro-patch";
  }
  if (args.code === "export-object-metadata-missing" || args.code === "primary-export-object-metadata-missing") {
    return "page-model";
  }
  if (args.code === "export-contract-missing") {
    return "page-model";
  }
  return "object-model";
}

function actualMetadataForObject(sectionHtml: string, objectId: string): ContractRepairIssue["actualMetadata"] {
  const tags = findElementOpenTagsByExportObjectId(sectionHtml, objectId);
  const tag = tags[0] ?? "";
  const forbidden = readHtmlAttribute(tag, "data-forbidden-export");
  return {
    rootCount: tags.length,
    objectKind: readHtmlAttribute(tag, "data-semantic-kind"),
    exportObjectKind: readHtmlAttribute(tag, "data-export-object-kind"),
    renderTarget: readHtmlAttribute(tag, "data-render-target"),
    dataContractType: dataContractTypeFromAttribute(readHtmlAttribute(tag, "data-export-contract")),
    ownershipScope: readHtmlAttribute(tag, "data-ownership-scope"),
    qualityIntent: readHtmlAttribute(tag, "data-quality-intent"),
    layoutArchetype: readHtmlAttribute(tag, "data-layout-archetype"),
    visualGrammar: readHtmlAttribute(tag, "data-visual-grammar"),
    forbiddenInterpretation: forbidden ? forbidden.split(",").map((item) => item.trim()).filter(Boolean) : [],
    forbiddenInterpretationRaw: forbidden,
  };
}

function issueFromDiagnostic(args: {
  diagnostic: Pick<PageExportContractDiagnostic, "code" | "message" | "objectId" | "pageNumber">;
  expected: ExportObjectContract | null;
  sectionHtml: string;
}): ContractRepairIssue {
  const actualMetadata = actualMetadataForObject(args.sectionHtml, args.diagnostic.objectId);
  const repairTier = repairTierForIssue({
    code: args.diagnostic.code,
    expected: args.expected,
    actualMetadata,
  });
  return {
    pageNumber: args.diagnostic.pageNumber,
    objectId: args.diagnostic.objectId,
    code: args.diagnostic.code,
    message: args.diagnostic.message,
    expected: args.expected
      ? {
          objectKind: args.expected.objectKind,
          renderTarget: args.expected.renderTarget,
          dataContractType: expectedDataContractType(args.expected),
        }
      : null,
    actualMetadata,
    missingFields: missingFieldsForIssue({
      code: args.diagnostic.code,
      expected: args.expected,
      actualMetadata,
    }),
    ownershipConflict:
      args.diagnostic.code === "export-object-duplicate-root"
        ? "duplicate root elements carry the same objectId"
        : null,
    forbiddenInterpretation: args.expected?.forbiddenInterpretation ?? [],
    repairTier,
  };
}

function syntheticMetadataIssues(args: {
  pageNumber: number;
  sectionHtml: string;
  expectedContracts: readonly ExportObjectContract[];
}) {
  const issues: ContractRepairIssue[] = [];
  for (const contract of args.expectedContracts) {
    const actualMetadata = actualMetadataForObject(args.sectionHtml, contract.objectId);
    if (actualMetadata.rootCount !== 1) {
      continue;
    }
    const syntheticCodes: ContractRepairIssueCode[] = [];
    if (actualMetadata.ownershipScope === null) {
      syntheticCodes.push("export-contract-ownership-scope-missing");
    }
    if (actualMetadata.forbiddenInterpretationRaw === null) {
      syntheticCodes.push("export-contract-forbidden-interpretation-missing");
    }
    if (actualMetadata.qualityIntent !== "contract-first-export") {
      syntheticCodes.push("export-contract-quality-intent-missing");
    }
    for (const code of syntheticCodes) {
      issues.push({
        pageNumber: args.pageNumber,
        objectId: contract.objectId,
        code,
        message:
          code === "export-contract-ownership-scope-missing"
            ? `Export object ${contract.objectId} is missing data-ownership-scope metadata.`
            : code === "export-contract-quality-intent-missing"
              ? `Export object ${contract.objectId} is missing data-quality-intent metadata.`
              : `Export object ${contract.objectId} is missing data-forbidden-export metadata.`,
        expected: {
          objectKind: contract.objectKind,
          renderTarget: contract.renderTarget,
          dataContractType: expectedDataContractType(contract),
        },
        actualMetadata,
        missingFields: missingFieldsForIssue({ code, expected: contract, actualMetadata }),
        ownershipConflict: null,
        forbiddenInterpretation: contract.forbiddenInterpretation,
        repairTier: "micro-patch",
      });
    }
  }
  return issues;
}

export function buildContractRepairIssues(args: {
  pageNumber: number;
  sectionHtml: string;
  diagnostics: readonly PageExportContractDiagnostic[];
  expectedContracts: readonly ExportObjectContract[];
}) {
  const expectedById = new Map(args.expectedContracts.map((contract) => [contract.objectId, contract]));
  const issues = [
    ...args.diagnostics.map((diagnostic) =>
      issueFromDiagnostic({
        diagnostic,
        expected: expectedById.get(diagnostic.objectId) ?? null,
        sectionHtml: args.sectionHtml,
      }),
    ),
    ...syntheticMetadataIssues({
      pageNumber: args.pageNumber,
      sectionHtml: args.sectionHtml,
      expectedContracts: args.expectedContracts,
    }),
  ];
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = [issue.objectId, issue.code].join(":");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function microPatchObjectTag(args: {
  tag: string;
  contract: ExportObjectContract;
  issues: readonly ContractRepairIssue[];
  pageContract?: Pick<PageExportContract, "layoutArchetype" | "visualGrammar"> | null;
}) {
  let tag = args.tag;
  const issueCodes = new Set(args.issues.map((issue) => issue.code));
  if (
    issueCodes.has("export-object-kind-mismatch") ||
    issueCodes.has("primary-export-object-kind-mismatch") ||
    issueCodes.has("export-contract-kind-mismatch")
  ) {
    tag = addHtmlAttribute(tag, "data-semantic-kind", args.contract.objectKind);
    tag = addHtmlAttribute(tag, "data-export-object-kind", args.contract.objectKind);
  }
  if (
    issueCodes.has("export-object-render-target-missing") ||
    issueCodes.has("primary-export-object-render-target-missing") ||
    issueCodes.has("export-contract-render-target-missing")
  ) {
    tag = addHtmlAttribute(tag, "data-render-target", args.contract.renderTarget);
  }
  if (issueCodes.has("export-contract-ownership-scope-missing")) {
    tag = addHtmlAttribute(tag, "data-ownership-scope", ownershipScopeAttribute(args.contract));
  }
  if (issueCodes.has("export-contract-forbidden-interpretation-missing")) {
    tag = addHtmlAttribute(tag, "data-forbidden-export", args.contract.forbiddenInterpretation.join(","));
    tag = addHtmlAttribute(tag, "data-forbidden-interpretation", args.contract.forbiddenInterpretation.join(","));
  }
  if (issueCodes.has("export-contract-quality-intent-missing")) {
    tag = setHtmlAttribute(tag, "data-quality-intent", "contract-first-export");
  } else {
    tag = addHtmlAttribute(tag, "data-quality-intent", "contract-first-export");
  }
  if (issueCodes.has("export-contract-page-ir-metadata-missing")) {
    if (args.pageContract?.layoutArchetype) {
      tag = setHtmlAttribute(tag, "data-layout-archetype", args.pageContract.layoutArchetype);
    }
    if (args.pageContract?.visualGrammar) {
      tag = setHtmlAttribute(tag, "data-visual-grammar", args.pageContract.visualGrammar);
    }
  }
  if (issueCodes.has("export-data-contract-missing") && isCompleteExpectedDataContract(args.contract)) {
    tag = addHtmlAttribute(tag, "data-export-contract", JSON.stringify(args.contract));
  }
  return tag;
}

export function applyContractRepairMicroPatches(args: {
  sectionHtml: string;
  issues: readonly ContractRepairIssue[];
  expectedContracts: readonly ExportObjectContract[];
  expectedPageExportContract?: Pick<PageExportContract, "layoutArchetype" | "visualGrammar"> | null;
}) {
  let sectionHtml = args.sectionHtml;
  const patchedObjectIds: string[] = [];
  const expectedById = new Map(args.expectedContracts.map((contract) => [contract.objectId, contract]));

  const dataContractIssueObjectIds = Array.from(new Set(args.issues
    .filter((issue) =>
      issue.actualMetadata.rootCount === 1 &&
      (
        issue.code === "export-data-contract-invalid" ||
        issue.code === "export-data-contract-minimum-data-missing" ||
        issue.code === "export-data-contract-incompatible"
      ))
    .map((issue) => issue.objectId)));

  for (const objectId of dataContractIssueObjectIds) {
    const tags = findElementOpenTagsByExportObjectId(sectionHtml, objectId);
    if (tags.length !== 1) {
      continue;
    }
    const originalTag = tags[0]!;
    const patchedTag = normalizeLenientDataContractTag(originalTag);
    if (patchedTag === originalTag) {
      continue;
    }
    sectionHtml = sectionHtml.replace(originalTag, patchedTag);
    patchedObjectIds.push(objectId);
  }

  const microIssuesByObjectId = new Map<string, ContractRepairIssue[]>();
  for (const issue of args.issues) {
    if (issue.repairTier !== "micro-patch") {
      continue;
    }
    const contract = expectedById.get(issue.objectId);
    if (!contract) {
      continue;
    }
    microIssuesByObjectId.set(issue.objectId, [
      ...(microIssuesByObjectId.get(issue.objectId) ?? []),
      issue,
    ]);
  }

  for (const [objectId, issues] of microIssuesByObjectId) {
    const contract = expectedById.get(objectId);
    if (!contract) {
      continue;
    }
    const tags = findElementOpenTagsByExportObjectId(sectionHtml, objectId);
    if (tags.length !== 1) {
      continue;
    }
    const originalTag = tags[0]!;
    const patchedTag = microPatchObjectTag({
      tag: originalTag,
      contract,
      issues,
      pageContract: args.expectedPageExportContract,
    });
    if (patchedTag === originalTag) {
      continue;
    }
    sectionHtml = sectionHtml.replace(originalTag, patchedTag);
    if (!patchedObjectIds.includes(objectId)) {
      patchedObjectIds.push(objectId);
    }
  }

  return {
    sectionHtml,
    changed: patchedObjectIds.length > 0,
    patchedObjectIds,
  };
}
