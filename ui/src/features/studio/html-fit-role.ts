import type {
  HtmlFitParticipation,
  HtmlVisualNodeKind,
} from "./types";

export const HTML_FIT_ROLE_ATTRIBUTE = "data-html-fit-role";

export function normalizeHtmlFitParticipation(
  value: string | null | undefined,
): HtmlFitParticipation | null {
  if (value === "content" || value === "decorative") {
    return value;
  }
  return null;
}

export function readHtmlFitParticipation(
  element: Element | null | undefined,
): HtmlFitParticipation | null {
  if (!element) {
    return null;
  }
  return normalizeHtmlFitParticipation(element.getAttribute(HTML_FIT_ROLE_ATTRIBUTE));
}

export function setHtmlFitParticipation(
  element: Element,
  fitParticipation: HtmlFitParticipation,
  options?: { preserveContent?: boolean },
): void {
  const preserveContent = options?.preserveContent ?? true;
  const current = readHtmlFitParticipation(element);
  if (
    preserveContent &&
    current === "content" &&
    fitParticipation === "decorative"
  ) {
    return;
  }
  element.setAttribute(HTML_FIT_ROLE_ATTRIBUTE, fitParticipation);
}

export function isHtmlFitContentElement(
  element: Element | null | undefined,
): boolean {
  return readHtmlFitParticipation(element) === "content";
}

export function resolveHtmlVisualFitParticipation(args: {
  kind: HtmlVisualNodeKind;
  explicitFitParticipation?: HtmlFitParticipation | null;
  hasModuleBinding?: boolean;
  hasEditableText?: boolean;
}): HtmlFitParticipation {
  if (args.explicitFitParticipation) {
    return args.explicitFitParticipation;
  }

  if (args.hasModuleBinding || args.hasEditableText) {
    return "content";
  }

  switch (args.kind) {
    case "badge":
    case "annotation":
    case "rail":
    case "chart-frame":
    case "shape":
    case "connector":
    case "node":
    case "label-surface":
      return "content";
    case "surface":
    case "divider":
    case "highlight":
    default:
      return "decorative";
  }
}
