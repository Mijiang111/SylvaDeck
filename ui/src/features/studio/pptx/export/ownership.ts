import type { ExportCanvasLayer } from "./layers";
import type { PptExportOwnerKind, PptExportWarning } from "./types";

export type RectPx = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ExportOwner = {
  id: string;
  kind: PptExportOwnerKind;
  element: HTMLElement;
  bounds: RectPx;
  ownsText: boolean;
  ownsShapes: boolean;
  ownsSvg: boolean;
};

export type ExportElementOwnership =
  | "text-leaf"
  | "visual-shape"
  | "native-chart-data"
  | "table"
  | "svg-primitive"
  | "owner-only"
  | "omit";

export type ExportElementRecord = {
  element: HTMLElement;
  elementId: string;
  bounds: RectPx;
  sourceOrder: number;
  zIndex: number;
  canvasLayer: ExportCanvasLayer;
  canvasLayerOrder: number;
  visible: boolean;
  hiddenByPlaceholder: boolean;
  text: string;
  visualId?: string;
  visualKind?: string;
  exportRole?: string;
  blockId?: string;
  blockKind?: string;
  ownership?: ExportElementOwnership;
  ownerId?: string;
  suppressedTextReason?: string;
};

export type ExportElementRegistry = {
  pageElement: HTMLElement;
  view: Window;
  records: ExportElementRecord[];
  byElement: Map<HTMLElement, ExportElementRecord>;
  placeholderWarnings: Set<Element>;
};

export type ExportPagePlan = {
  registry: ExportElementRegistry;
  pageNumber: number;
  warnings: PptExportWarning[];
  owners: ExportOwner[];
};

export function resolveOwnerForElement(element: Element, owners: ExportOwner[] = []) {
  return owners
    .filter((owner) => owner.element === element || owner.element.contains(element))
    .sort((left, right) => left.bounds.w * left.bounds.h - right.bounds.w * right.bounds.h)[0];
}

export function recordForElement(plan: ExportPagePlan | null | undefined, element: HTMLElement) {
  return plan?.registry.byElement.get(element) ?? null;
}

export function claimExportOwnership(args: {
  plan?: ExportPagePlan | null;
  element: HTMLElement;
  ownership: ExportElementOwnership;
  ownerId?: string;
  reason?: string;
}) {
  const plan = args.plan;
  const record = recordForElement(plan, args.element);
  if (!record) {
    return;
  }
  if (record.ownership && record.ownership !== args.ownership) {
    if (!plan) {
      return;
    }
    plan.warnings.push({
      code: "ownership-conflict",
      severity: "degraded",
      pageNumber: plan.pageNumber,
      sourceId: record.elementId,
      sourceKind: "visual",
      message: `Element ${record.elementId} on page ${plan.pageNumber} was claimed as ${record.ownership} and ${args.ownership}.`,
    });
    return;
  }
  record.ownership = args.ownership;
  record.ownerId = args.ownerId ?? record.ownerId;
  record.suppressedTextReason = args.reason ?? record.suppressedTextReason;
}

export function dedupeOwners(owners: ExportOwner[]) {
  const seen = new Set<HTMLElement>();
  const deduped: ExportOwner[] = [];
  for (const owner of owners) {
    if (seen.has(owner.element)) {
      continue;
    }
    seen.add(owner.element);
    deduped.push(owner);
  }
  return deduped;
}
