import type {
  HtmlEditableBlockKind,
  HtmlFitParticipation,
  HtmlVisualAtomizationRole,
  HtmlVisualNodeKind,
} from "../types";

export type PreviewBlockSizingBehavior = "text-auto" | "frame-only";

export function resolvePreviewBlockSizingBehavior(args: {
  blockKind?: HtmlEditableBlockKind | null;
  linkedVisualNodeId?: string | null;
  linkedVisualKind?: HtmlVisualNodeKind | null;
  linkedVisualFitParticipation?: HtmlFitParticipation | null;
  linkedVisualAtomizationRole?: HtmlVisualAtomizationRole | null;
  sharesSource?: boolean;
}) {
  if (!args.linkedVisualNodeId || !args.sharesSource) {
    return "text-auto";
  }

  if (args.linkedVisualFitParticipation !== "content") {
    return "text-auto";
  }

  if (args.linkedVisualAtomizationRole !== "leaf") {
    return "text-auto";
  }

  return "frame-only";
}
