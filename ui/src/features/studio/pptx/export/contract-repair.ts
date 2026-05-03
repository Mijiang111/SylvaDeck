import type {
  ExportDataContract,
  ExportObjectContract,
  ExportObjectKind,
  ExportRenderTarget,
} from "@/features/studio/types";
import type {
  PptExportDiagnostic,
  PptExportDiagnosticCode,
  PptxContractRepairIssue,
  PptxContractRepairTier,
} from "./types";

const CONTRACT_REPAIR_DIAGNOSTIC_CODES = new Set<PptExportDiagnosticCode>([
  "export-contract-missing",
  "export-contract-kind-mismatch",
  "export-contract-forbidden-violation",
  "export-contract-native-table-missing-data",
  "export-contract-duplicate-ownership",
  "export-contract-render-target-missing",
  "export-data-contract-missing",
  "export-data-contract-invalid",
  "export-data-contract-incompatible",
  "export-data-contract-minimum-data-missing",
]);

function missingFieldsForDiagnostic(code: PptExportDiagnosticCode) {
  switch (code) {
    case "export-contract-missing":
      return ["data-export-object-id", "root"];
    case "export-contract-kind-mismatch":
      return ["data-semantic-kind"];
    case "export-contract-render-target-missing":
      return ["data-render-target", "visual-snapshot"];
    case "export-data-contract-missing":
      return ["data-export-contract"];
    case "export-data-contract-invalid":
    case "export-data-contract-incompatible":
    case "export-data-contract-minimum-data-missing":
      return ["dataContract"];
    case "export-contract-native-table-missing-data":
      return ["dataContract.columns", "dataContract.rows"];
    case "export-contract-duplicate-ownership":
      return ["independent-root", "ownership-scope"];
    case "export-contract-forbidden-violation":
      return ["forbiddenInterpretation"];
    default:
      return [];
  }
}

function repairTierForDiagnostic(code: PptExportDiagnosticCode): PptxContractRepairTier {
  if (code === "export-contract-missing") {
    return "page-model";
  }
  return "object-model";
}

function fallbackObjectId(diagnostic: PptExportDiagnostic) {
  return diagnostic.exportObjectId ?? diagnostic.sourceId ?? "unknown-export-object";
}

function expectedFromDiagnostic(args: {
  diagnostic: PptExportDiagnostic;
  expected?: ExportObjectContract;
}) {
  if (args.expected) {
    return {
      objectKind: args.expected.objectKind,
      renderTarget: args.expected.renderTarget,
      dataContractType: args.expected.dataContract?.type,
    };
  }
  if (!args.diagnostic.exportObjectKind && !args.diagnostic.exportRenderTarget && !args.diagnostic.exportDataContractType) {
    return null;
  }
  return {
    objectKind: args.diagnostic.exportObjectKind,
    renderTarget: args.diagnostic.exportRenderTarget,
    dataContractType: args.diagnostic.exportDataContractType,
  };
}

function actualMetadataFromDiagnostic(diagnostic: PptExportDiagnostic): PptxContractRepairIssue["actualMetadata"] {
  return {
    rootCount: diagnostic.code === "export-contract-missing" ? 0 : null,
    objectKind: (diagnostic.exportObjectKind ?? null) as ExportObjectKind | null,
    renderTarget: (diagnostic.exportRenderTarget ?? null) as ExportRenderTarget | null,
    dataContractType: (diagnostic.exportDataContractType ?? null) as ExportDataContract["type"] | null,
    ownershipScope: null,
    forbiddenInterpretation: [],
  };
}

export function buildPptxContractQualityIssues(args: {
  diagnostics: readonly PptExportDiagnostic[];
  expectedContracts?: readonly ExportObjectContract[] | null;
}) {
  const expectedById = new Map(
    (args.expectedContracts ?? []).map((contract) => [contract.objectId, contract]),
  );
  const issues: PptxContractRepairIssue[] = [];
  const seen = new Set<string>();

  for (const diagnostic of args.diagnostics) {
    if (!CONTRACT_REPAIR_DIAGNOSTIC_CODES.has(diagnostic.code)) {
      continue;
    }
    const objectId = fallbackObjectId(diagnostic);
    const expected = expectedById.get(objectId);
    const key = [
      diagnostic.pageNumber ?? "deck",
      objectId,
      diagnostic.code,
      diagnostic.message,
    ].join(":");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    issues.push({
      pageNumber: diagnostic.pageNumber,
      objectId,
      code: diagnostic.code,
      message: diagnostic.message,
      expected: expectedFromDiagnostic({ diagnostic, expected }),
      actualMetadata: actualMetadataFromDiagnostic(diagnostic),
      missingFields: missingFieldsForDiagnostic(diagnostic.code),
      ownershipConflict:
        diagnostic.code === "export-contract-duplicate-ownership"
          ? diagnostic.message
          : null,
      forbiddenInterpretation: expected?.forbiddenInterpretation ?? [],
      repairTier: repairTierForDiagnostic(diagnostic.code),
    });
  }

  return issues;
}

export const buildPptxContractRepairIssues = buildPptxContractQualityIssues;
