import type {
  HtmlEditableBlockKind,
  HtmlFitParticipation,
  HtmlVisualNodeKind,
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
  fitParticipation?: HtmlFitParticipation | null;
  blockKind?: HtmlEditableBlockKind | null;
  visualKind?: HtmlVisualNodeKind | null;
  sharesSource?: boolean;
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
    return candidate.blockKind &&
      PREVIEW_TEXT_PRIORITY_BLOCK_KINDS.includes(candidate.blockKind)
      ? 0
      : 1;
  }

  return isPageContentVisualCandidate(candidate) ? 2 : 3;
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
}) {
  const ranked = rankPreviewSelectableCandidates(args);
  return ranked[0] ?? null;
}
