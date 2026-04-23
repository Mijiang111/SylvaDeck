import type {
  HtmlEditableBlockKind,
  HtmlFitParticipation,
  HtmlVisualAtomizationRole,
  HtmlVisualNodeKind,
  HtmlVisualSelectionPriority,
} from "../types";

export type PreviewSelectionPreference = "page" | "text" | "visual";
export type PreviewSelectableType = "block" | "visual";

export const PREVIEW_SELECTION_ORDERS = {
  page: ["block", "visual"],
  text: ["block", "visual"],
  visual: ["visual", "block"],
} satisfies Record<PreviewSelectionPreference, PreviewSelectableType[]>;

export const PREVIEW_TEXT_PRIORITY_BLOCK_KINDS: HtmlEditableBlockKind[] = [
  "headline",
  "heading",
  "eyebrow",
  "paragraph",
  "list",
];

export const PREVIEW_PAGE_CONTENT_VISUAL_KINDS: HtmlVisualNodeKind[] = [
  "chart-frame",
  "annotation",
  "badge",
  "rail",
];

export type PreviewSelectableCandidate = {
  type: PreviewSelectableType;
  key: string;
  depth: number;
  area: number;
  layerIndex: number;
  blockId?: string | null;
  visualNodeId?: string | null;
  fitParticipation?: HtmlFitParticipation | null;
  blockKind?: HtmlEditableBlockKind | null;
  visualKind?: HtmlVisualNodeKind | null;
  sharesSource?: boolean;
  atomizationRole?: HtmlVisualAtomizationRole | null;
  selectionPriority?: HtmlVisualSelectionPriority | null;
};

export type PreviewSelectionContext = {
  preferredSelectionType: PreviewSelectionPreference;
  selectedBlockId?: string | null;
  selectedVisualNodeId?: string | null;
};

function getSelectionOrder(
  preference: PreviewSelectionPreference,
  preferredType?: PreviewSelectableType | null,
) {
  if (!preferredType) {
    return PREVIEW_SELECTION_ORDERS[preference];
  }

  return [preferredType];
}

function isDecorativeVisualCandidate(candidate: PreviewSelectableCandidate) {
  return candidate.type === "visual" && candidate.fitParticipation === "decorative";
}

function getVisualAtomizationRank(
  candidate: PreviewSelectableCandidate,
  preference: PreviewSelectionPreference,
) {
  if (preference === "visual" && candidate.type === "block") {
    return 5;
  }

  const role = candidate.atomizationRole ?? "leaf";
  const priority = candidate.selectionPriority ?? "secondary";
  const isContent = candidate.fitParticipation === "content";

  if (preference === "visual") {
    if (role === "leaf") {
      return priority === "primary" ? 0 : isContent ? 1 : 2;
    }
    if (role === "container") {
      return 3;
    }
    if (role === "scaffold") {
      return 4;
    }
    return 6;
  }

  if (role === "leaf" && priority === "primary") {
    return 0;
  }
  if (role === "leaf") {
    return isContent ? 2 : 3;
  }
  if (role === "container") {
    return 4;
  }
  if (role === "scaffold") {
    return 5;
  }
  return 6;
}

function isPageContentVisualCandidate(candidate: PreviewSelectableCandidate) {
  if (candidate.type !== "visual") {
    return false;
  }

  if (candidate.fitParticipation === "content") {
    return true;
  }

  return Boolean(
    candidate.visualKind &&
      PREVIEW_PAGE_CONTENT_VISUAL_KINDS.includes(candidate.visualKind),
  );
}

function getPageSemanticRank(candidate: PreviewSelectableCandidate) {
  if (candidate.type === "block") {
    return 1;
  }

  const visualRank = getVisualAtomizationRank(candidate, "page");
  if (visualRank === 0) {
    return 0;
  }
  if (visualRank === 2) {
    return 2;
  }
  if (visualRank === 3) {
    return 3;
  }
  if (visualRank === 4) {
    return 4;
  }
  if (visualRank === 5) {
    return 5;
  }

  return isPageContentVisualCandidate(candidate) ? 0 : 6;
}

export function rankPreviewSelectableCandidates(args: {
  candidates: PreviewSelectableCandidate[];
  context: PreviewSelectionContext;
  preferredType?: PreviewSelectableType | null;
}) {
  const order = getSelectionOrder(args.context.preferredSelectionType, args.preferredType);
  const typeRank = new Map(order.map((type, index) => [type, index]));
  const pageModeHybrid =
    args.context.preferredSelectionType === "page" && !args.preferredType;
  const filteredCandidates = pageModeHybrid
    ? args.candidates.filter((candidate) => !isDecorativeVisualCandidate(candidate))
    : args.candidates;

  return [...filteredCandidates]
    .filter((candidate) => typeRank.has(candidate.type))
    .sort((left, right) => {
      if (pageModeHybrid) {
        const leftSemanticRank = getPageSemanticRank(left);
        const rightSemanticRank = getPageSemanticRank(right);
        if (leftSemanticRank !== rightSemanticRank) {
          return leftSemanticRank - rightSemanticRank;
        }
      } else if (args.context.preferredSelectionType === "visual" && !args.preferredType) {
        const leftVisualRank = getVisualAtomizationRank(left, "visual");
        const rightVisualRank = getVisualAtomizationRank(right, "visual");
        if (leftVisualRank !== rightVisualRank) {
          return leftVisualRank - rightVisualRank;
        }
      }

      if (left.layerIndex !== right.layerIndex) {
        return left.layerIndex - right.layerIndex;
      }

      const leftTypeRank = typeRank.get(left.type) ?? Number.MAX_SAFE_INTEGER;
      const rightTypeRank = typeRank.get(right.type) ?? Number.MAX_SAFE_INTEGER;
      if (leftTypeRank !== rightTypeRank) {
        return leftTypeRank - rightTypeRank;
      }

      if (left.depth !== right.depth) {
        return left.depth - right.depth;
      }

      if (left.area !== right.area) {
        return left.area - right.area;
      }

      return left.key.localeCompare(right.key);
    });
}

export function choosePreviewSelectableCandidate(args: {
  candidates: PreviewSelectableCandidate[];
  context: PreviewSelectionContext;
  preferredType?: PreviewSelectableType | null;
  directBlockId?: string | null;
  directBlockDepth?: number | null;
  directVisualDepth?: number | null;
}) {
  const directBlockCandidate =
    args.directBlockId &&
    args.preferredType !== "visual" &&
    args.context.preferredSelectionType !== "visual" &&
    (!Number.isFinite(args.directVisualDepth ?? Number.NaN) ||
      !Number.isFinite(args.directBlockDepth ?? Number.NaN) ||
      (args.directVisualDepth ?? Number.MAX_SAFE_INTEGER) >=
        (args.directBlockDepth ?? Number.MAX_SAFE_INTEGER))
      ? args.candidates.find(
          (candidate) =>
            candidate.type === "block" &&
            candidate.blockId === args.directBlockId &&
            Boolean(
              candidate.blockKind &&
                PREVIEW_TEXT_PRIORITY_BLOCK_KINDS.includes(candidate.blockKind),
            ),
        ) ?? null
      : null;

  if (directBlockCandidate) {
    return directBlockCandidate;
  }

  const ranked = rankPreviewSelectableCandidates(args);
  return ranked[0] ?? null;
}
