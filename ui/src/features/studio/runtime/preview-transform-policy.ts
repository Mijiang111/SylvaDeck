import type {
  HtmlEditableBlockKind,
  HtmlFitParticipation,
  HtmlVisualNodeKind,
} from "../types";

export type PreviewBlockSizingBehavior = "text-auto" | "frame-only";

export function resolvePreviewBlockSizingBehavior(args: {
  blockKind?: HtmlEditableBlockKind | null;
  linkedVisualNodeId?: string | null;
  linkedVisualKind?: HtmlVisualNodeKind | null;
  linkedVisualFitParticipation?: HtmlFitParticipation | null;
  sharesSource?: boolean;
}) {
  if (!args.linkedVisualNodeId || !args.sharesSource) {
    return "text-auto";
  }

  if (args.linkedVisualFitParticipation !== "content") {
    return "text-auto";
  }

  return "frame-only";
}
