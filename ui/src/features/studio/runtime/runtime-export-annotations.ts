import {
  applyGeneratedHtmlReportCanvasOverridesToPage,
  HTML_REPORT_PAGE_HEIGHT,
  HTML_REPORT_PAGE_WIDTH,
} from "@/features/studio/html-report-canvas";
import { findHtmlAnimationPage } from "@/features/studio/html-report-animation";
import { collectHtmlLayoutCandidates } from "@/features/studio/html-report-layout";
import { collectHtmlEditableCandidates } from "@/features/studio/html-report-structure";
import { HTML_FIT_ROLE_ATTRIBUTE } from "@/features/studio/html-fit-role";
import { canonicalizeDataBackedModulesOnPage } from "@/features/studio/html-report-data-modules";
import {
  annotateHtmlFitRolesOnPage,
  collectHtmlVisualCandidates,
  extractHtmlPageVisualStyle,
} from "@/features/studio/html-report-visuals";
import type {
  GeneratedHtmlReport,
  HtmlEditablePage,
  HtmlLayoutPage,
  HtmlPageVisualStyle,
  HtmlVisualNode,
  HtmlVisualPage,
} from "@/features/studio/types";
import {
  PREVIEW_PAGE_CONTENT_VISUAL_KINDS,
  PREVIEW_SELECTION_ORDERS,
  PREVIEW_TEXT_PRIORITY_BLOCK_KINDS,
} from "./preview-selection";

export type HtmlReportPagePreview = {
  pageNumber: number;
  title: string;
  srcDoc: string;
  pageStructure: HtmlEditablePage | null;
  visualPage: HtmlVisualPage | null;
  layoutPage: HtmlLayoutPage | null;
};

export type HtmlReportExportPage = {
  pageNumber: number;
  title: string;
  pageMarkup: string;
};

type HtmlReportRenderMode = "preview" | "export";
type HtmlReportSourcePage = {
  pageNumber: number;
  title: string;
  pageElement: Element;
  pageStructure: HtmlEditablePage | null;
  visualPage: HtmlVisualPage | null;
  layoutPage: HtmlLayoutPage | null;
  pageStyle: HtmlPageVisualStyle;
};

const ANIMATED_PREVIEW_OUTPUT_MODE = "animated-preview-js";

function serializeInlineScriptValue(value: unknown) {
  return JSON.stringify(value ?? null)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function cloneElementAttributes(source: Element, target: Element) {
  Array.from(source.attributes).forEach((attribute) => {
    target.setAttribute(attribute.name, attribute.value);
  });
}

function collectElementAttributes(element: Element) {
  return Array.from(element.attributes).reduce<Record<string, string>>((accumulator, attribute) => {
    accumulator[attribute.name] = attribute.value;
    return accumulator;
  }, {});
}

function annotatePreviewPageBlocks(pageElement: Element, pageStructure: HtmlEditablePage | null) {
  if (!pageStructure) {
    return;
  }

  const candidates = collectHtmlEditableCandidates(pageElement);
  pageStructure.blocks.forEach((block) => {
    const element = candidates[block.sourceIndex] as HTMLElement | undefined;
    if (!element) {
      return;
    }
    if (element.tagName.toLowerCase() !== block.sourceTag.toLowerCase()) {
      return;
    }

    element.setAttribute("data-html-block-id", block.id);
    element.setAttribute("data-html-block-kind", block.kind);
  });
}

function annotatePreviewVisualNodes(pageElement: Element, visualPage: HtmlVisualPage | null) {
  if (!visualPage) {
    return;
  }

  const candidates = collectHtmlVisualCandidates(pageElement);
  visualPage.nodes.forEach((node) => {
    const element = candidates[node.sourceIndex] as HTMLElement | undefined;
    if (!element) {
      return;
    }
    if (element.tagName.toLowerCase() !== node.sourceTag.toLowerCase()) {
      return;
    }

    element.setAttribute("data-html-visual-id", node.id);
    element.setAttribute("data-html-visual-kind", node.kind);
    if (node.parentId) {
      element.setAttribute("data-html-visual-parent-id", node.parentId);
    }
    if (node.childIds?.length) {
      element.setAttribute("data-html-visual-child-ids", node.childIds.join(","));
    }
    if (node.atomizationRole) {
      element.setAttribute("data-html-visual-atomization-role", node.atomizationRole);
    }
    if (node.selectionPriority) {
      element.setAttribute("data-html-visual-selection-priority", node.selectionPriority);
    }
  });
}

function annotatePreviewPageExportMetadata(pageElement: Element, pageStyle: HtmlPageVisualStyle) {
  pageElement.setAttribute("data-export-page-bg", pageStyle.pageBackground);
  pageElement.setAttribute("data-export-surface-fill", pageStyle.surfaceFill);
  pageElement.setAttribute("data-export-divider-color", pageStyle.dividerColor);
  pageElement.setAttribute("data-export-accent", pageStyle.accentColor);
}

function annotatePreviewVisualExportMetadata(args: {
  element: HTMLElement;
  node: HtmlVisualNode;
  pageStyle: HtmlPageVisualStyle;
}) {
  const { element, node, pageStyle } = args;
  const fill =
    node.style.background ??
    element.getAttribute("data-html-visual-fill") ??
    (node.kind === "divider" ? pageStyle.dividerColor : pageStyle.surfaceFill);
  const border =
    node.style.border ??
    element.getAttribute("data-html-visual-border") ??
    (node.kind === "divider" ? pageStyle.dividerColor : fill);
  const computedBorderWidth = Number.parseFloat(
    element.getAttribute("data-html-visual-border-width") ?? "",
  );
  const computedRadius = Number.parseFloat(
    element.getAttribute("data-html-visual-radius") ?? "",
  );
  const computedOpacity = Number.parseFloat(
    element.getAttribute("data-html-visual-opacity") ?? "",
  );
  const borderWidth =
    node.style.borderWidth ??
    (Number.isFinite(computedBorderWidth) ? computedBorderWidth : undefined) ??
    (node.kind === "divider" ? 1 : 0);
  const radius =
    node.style.radius ??
    (Number.isFinite(computedRadius) ? computedRadius : undefined) ??
    (node.kind === "divider" ? 999 : 18);
  const opacity =
    node.style.opacity ??
    (Number.isFinite(computedOpacity) ? computedOpacity : undefined) ??
    1;

  element.setAttribute("data-export-role", node.kind);
  element.setAttribute("data-export-fill", fill);
  element.setAttribute("data-export-border", border);
  element.setAttribute("data-export-border-width", String(borderWidth));
  element.setAttribute("data-export-radius", String(radius));
  element.setAttribute("data-export-opacity", String(opacity));

  if (node.style.accent) {
    element.setAttribute("data-export-accent", node.style.accent);
  }
}

function annotatePreviewVisualNodesForExport(args: {
  pageElement: Element;
  visualPage: HtmlVisualPage | null;
  pageStyle: HtmlPageVisualStyle;
}) {
  if (!args.visualPage) {
    return;
  }

  const candidates = collectHtmlVisualCandidates(args.pageElement);
  args.visualPage.nodes.forEach((node) => {
    const element = candidates[node.sourceIndex] as HTMLElement | undefined;
    if (!element) {
      return;
    }
    if (element.tagName.toLowerCase() !== node.sourceTag.toLowerCase()) {
      return;
    }

    annotatePreviewVisualExportMetadata({
      element,
      node,
      pageStyle: args.pageStyle,
    });
  });
}

function annotatePreviewLayoutZones(pageElement: Element, layoutPage: HtmlLayoutPage | null) {
  if (!layoutPage) {
    return;
  }

  const candidates = collectHtmlLayoutCandidates(pageElement);
  layoutPage.zones.forEach((zone) => {
    const element = candidates[zone.sourceIndex] as HTMLElement | undefined;
    if (!element) {
      return;
    }
    if (element.tagName.toLowerCase() !== zone.sourceTag.toLowerCase()) {
      return;
    }

    element.setAttribute("data-html-layout-id", zone.id);
    element.setAttribute("data-html-layout-kind", zone.kind);
    element.setAttribute("data-layout-split", String(zone.splitPercent));
  });
}

function setPreviewAnimationAttrs(args: {
  element: Element | null | undefined;
  role: string;
  enter: string;
  delayMs: number;
  durationMs?: number;
  order: number;
  seen: Set<HTMLElement>;
}) {
  if (!(args.element instanceof HTMLElement) || args.seen.has(args.element)) {
    return;
  }

  args.seen.add(args.element);
  if (!args.element.getAttribute("data-anim-role")) {
    args.element.setAttribute("data-anim-role", args.role);
  }
  if (!args.element.getAttribute("data-anim-enter")) {
    args.element.setAttribute("data-anim-enter", args.enter);
  }
  if (!args.element.getAttribute("data-anim-delay")) {
    args.element.setAttribute("data-anim-delay", String(Math.max(0, Math.round(args.delayMs))));
  }
  if (!args.element.getAttribute("data-anim-duration")) {
    args.element.setAttribute(
      "data-anim-duration",
      String(Math.max(160, Math.round(args.durationMs ?? 640))),
    );
  }
  if (!args.element.getAttribute("data-anim-order")) {
    args.element.setAttribute("data-anim-order", String(args.order));
  }
}

function annotatePreviewAnimationNodes(pageElement: Element) {
  const pageRoot = pageElement as HTMLElement;
  const animatedNodes = Array.from(pageRoot.querySelectorAll("[data-anim-role]")).filter(
    (element): element is HTMLElement => element instanceof HTMLElement,
  );
  if (animatedNodes.length === 0) {
    return;
  }

  const seen = new Set<HTMLElement>();
  animatedNodes.forEach((element, index) => {
    const role = (element.getAttribute("data-anim-role") || "").trim();
    if (!role) {
      return;
    }

    const parsedDelay = Number.parseInt(element.getAttribute("data-anim-delay") || "", 10);
    const parsedDuration = Number.parseInt(element.getAttribute("data-anim-duration") || "", 10);
    const parsedOrder = Number.parseInt(element.getAttribute("data-anim-order") || "", 10);

    setPreviewAnimationAttrs({
      element,
      role,
      enter: (element.getAttribute("data-anim-enter") || "fade-up").trim() || "fade-up",
      delayMs: Number.isFinite(parsedDelay) ? parsedDelay : index * 80,
      durationMs: Number.isFinite(parsedDuration) ? parsedDuration : 640,
      order: Number.isFinite(parsedOrder) ? parsedOrder : index,
      seen,
    });
  });
}

function buildHtmlReportSourcePages(
  sourceDocument: Document,
  report: GeneratedHtmlReport,
): HtmlReportSourcePage[] {
  return Array.from(sourceDocument.querySelectorAll("section.page")).map((pageElement, index) => {
    const pageNumber = index + 1;
    const pageStructure = report.structure?.pages[index] ?? null;
    const visualPage = report.visualStructure?.pages[index] ?? null;
    const layoutPage = report.layoutStructure?.pages[index] ?? null;
    const pageStyle = extractHtmlPageVisualStyle({
      report,
      pageNumber,
    });
    const title =
      pageElement.getAttribute("data-page-title")?.trim() ||
      report.pageTitles[index] ||
      `Page ${pageNumber}`;

    return {
      pageNumber,
      title,
      pageElement,
      pageStructure,
      visualPage,
      layoutPage,
      pageStyle,
    };
  });
}

function appendPageModeStyles(previewDocument: Document, mode: HtmlReportRenderMode) {
  const pageStyle = previewDocument.createElement("style");
  pageStyle.setAttribute("data-ppt-preview-style", "true");
  pageStyle.textContent =
    mode === "preview"
      ? `
    html, body {
      margin: 0;
      padding: 0;
      width: ${HTML_REPORT_PAGE_WIDTH}px;
      min-width: ${HTML_REPORT_PAGE_WIDTH}px;
      background: transparent;
      overflow: hidden;
    }

    body {
      min-height: ${HTML_REPORT_PAGE_HEIGHT}px;
    }

    section.page {
      margin: 0 !important;
      box-shadow: none !important;
    }

    [data-html-canvas-placeholder="true"] {
      visibility: hidden !important;
      pointer-events: none !important;
      user-select: none !important;
    }

    [data-html-freeform="true"] {
      transform-origin: top left;
    }

    [data-html-block-id] {
      cursor: text;
      transition: box-shadow 120ms ease, background-color 120ms ease;
    }

    [data-html-block-id]:hover {
      box-shadow: 0 0 0 2px rgba(16, 40, 56, 0.18);
      background-color: rgba(214, 226, 235, 0.22);
    }

    [data-html-block-selected="true"] {
      box-shadow: 0 0 0 3px rgba(16, 40, 56, 0.36);
      background-color: rgba(214, 226, 235, 0.34);
    }

    [data-html-block-editing="true"] {
      outline: none;
      box-shadow: 0 0 0 3px rgba(198, 153, 74, 0.38);
      background-color: rgba(255, 249, 234, 0.92);
    }

    [data-html-visual-id] {
      cursor: pointer;
      position: relative;
    }

    [data-html-visual-selected="true"] {
      outline: none;
      box-shadow: none;
      filter: none;
    }
  `
      : `
    html, body {
      margin: 0;
      padding: 0;
      background: transparent;
    }

    section.page {
      margin: 0 !important;
      box-shadow: none !important;
    }

    [data-html-canvas-placeholder="true"] {
      visibility: hidden !important;
      pointer-events: none !important;
      user-select: none !important;
    }

    [data-html-freeform="true"] {
      transform-origin: top left;
    }
  `;
  previewDocument.head.appendChild(pageStyle);
}

function buildHtmlReportPageDocument(
  sourceDocument: Document,
  pageElement: Element,
  report: GeneratedHtmlReport,
  pageStructure: HtmlEditablePage | null,
  visualPage: HtmlVisualPage | null,
  layoutPage: HtmlLayoutPage | null,
  pageStyle: HtmlPageVisualStyle,
  pageNumber: number,
  mode: HtmlReportRenderMode,
) {
  const animationPreviewEnabled = report.htmlOutputMode === ANIMATED_PREVIEW_OUTPUT_MODE;
  const previewDocument = sourceDocument.implementation.createHTMLDocument(
    sourceDocument.title || "Report page",
  );
  previewDocument.head.innerHTML = sourceDocument.head.innerHTML;
  previewDocument.body.innerHTML = "";
  cloneElementAttributes(sourceDocument.body, previewDocument.body);

  const ancestry: Element[] = [];
  let parent = pageElement.parentElement;
  while (parent && parent !== sourceDocument.body) {
    ancestry.unshift(parent);
    parent = parent.parentElement;
  }

  let mountPoint: Element = previewDocument.body;
  ancestry.forEach((ancestor) => {
    const clone = previewDocument.createElement(ancestor.tagName.toLowerCase());
    cloneElementAttributes(ancestor, clone);
    mountPoint.appendChild(clone);
    mountPoint = clone;
  });

  const pageClone = pageElement.cloneNode(true) as Element;
  canonicalizeDataBackedModulesOnPage(pageClone);
  annotatePreviewPageBlocks(pageClone, pageStructure);
  annotatePreviewVisualNodes(pageClone, visualPage);
  annotatePreviewPageExportMetadata(pageClone, pageStyle);
  annotatePreviewVisualNodesForExport({
    pageElement: pageClone,
    visualPage,
    pageStyle,
  });
  annotatePreviewLayoutZones(pageClone, layoutPage);
  annotateHtmlFitRolesOnPage(pageClone);
  if (animationPreviewEnabled) {
    annotatePreviewAnimationNodes(pageClone);
  }
  applyGeneratedHtmlReportCanvasOverridesToPage({
    pageElement: pageClone as HTMLElement,
    pageNumber,
    report,
  });
  mountPoint.appendChild(pageClone);

  appendPageModeStyles(previewDocument, mode);

  if (mode !== "preview") {
    return previewDocument;
  }

  const serializedAnimationPage = serializeInlineScriptValue(
    animationPreviewEnabled ? findHtmlAnimationPage(report.animationStructure, pageNumber) : null,
  );
  const serializedSelectionOrders = serializeInlineScriptValue(PREVIEW_SELECTION_ORDERS);
  const serializedTextPriorityBlockKinds = serializeInlineScriptValue(
    PREVIEW_TEXT_PRIORITY_BLOCK_KINDS,
  );
  const serializedPageContentVisualKinds = serializeInlineScriptValue(
    PREVIEW_PAGE_CONTENT_VISUAL_KINDS,
  );
  const serializedFitRoleAttribute = serializeInlineScriptValue(HTML_FIT_ROLE_ATTRIBUTE);
  const previewScript = previewDocument.createElement("script");
  previewScript.textContent = String.raw`
    (() => {
      const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();
      const normalizeFitParticipation = (value) =>
        value === "content" || value === "decorative" ? value : null;
      const fitRoleAttribute = ${serializedFitRoleAttribute};
      let activeTransformPreview = null;
      const animationModeEnabled = ${animationPreviewEnabled ? "true" : "false"};
      const previewAnimationPage = ${serializedAnimationPage};
      const previewAnimationManifest = previewAnimationPage?.manifest ?? null;
      let previewViewportVisible = false;
      let animationPlaybackActive = false;
      let currentAnimationToken = 0;
      let activeEntryAnimations = [];
      let activeEntryTimeoutId = 0;
      let activeLoopRuntime = null;
      const supportedAnimationRoles = new Set([
        "hero",
        "headline",
        "chart",
        "callout",
        "label",
        "quadrant",
        "rail",
        "surface",
        "metric",
        "annotation",
      ]);
      const supportedAnimationEnters = new Set([
        "fade-up",
        "fade-in",
        "slide-right",
        "slide-left",
        "scale-in",
        "chart-reveal",
      ]);
      const selectionOrders = ${serializedSelectionOrders};
      const textPriorityBlockKinds = new Set(${serializedTextPriorityBlockKinds});
      const pageContentVisualKinds = new Set(${serializedPageContentVisualKinds});
      let selectionContext = {
        preferredSelectionType: "page",
        selectedBlockId: null,
        selectedVisualNodeId: null,
        selectedVisualTransformMode: null,
      };
      function syncSelectionContextAttribute() {
        document.documentElement.setAttribute(
          "data-ppt-selection-mode",
          selectionContext.preferredSelectionType || "page",
        );
      }
      syncSelectionContextAttribute();

      function getPageRoot() {
        return document.querySelector("section.page");
      }

      function getSelectionOrder(preferredType) {
        if (preferredType === "block" || preferredType === "visual") {
          return [preferredType];
        }

        return selectionOrders[selectionContext.preferredSelectionType] || selectionOrders.page;
      }

      function isDecorativeVisualCandidate(candidate) {
        return candidate.type === "visual" && candidate.fitParticipation === "decorative";
      }

      function getVisualAtomizationRank(candidate, preference) {
        if (preference === "visual" && candidate.type === "block") {
          return 5;
        }
        const role = candidate.atomizationRole || "leaf";
        const priority = candidate.selectionPriority || "secondary";
        const isContent = candidate.fitParticipation === "content";

        if (preference === "visual") {
          if (role === "leaf") return priority === "primary" ? 0 : isContent ? 1 : 2;
          if (role === "container") return 3;
          if (role === "scaffold") return 4;
          return 6;
        }

        if (role === "leaf" && priority === "primary") return 0;
        if (role === "leaf") return isContent ? 2 : 3;
        if (role === "container") return 4;
        if (role === "scaffold") return 5;
        return 6;
      }

      function isPageContentVisualCandidate(candidate) {
        return (
          candidate.type === "visual" &&
          (candidate.fitParticipation === "content" ||
            pageContentVisualKinds.has(candidate.visualKind))
        );
      }

      function getPageSemanticRank(candidate) {
        if (candidate.type === "block") {
          return 1;
        }

        const visualRank = getVisualAtomizationRank(candidate, "page");
        if (visualRank === 0) return 0;
        if (visualRank === 2) return 2;
        if (visualRank === 3) return 3;
        if (visualRank === 4) return 4;
        if (visualRank === 5) return 5;
        return isPageContentVisualCandidate(candidate) ? 0 : 6;
      }

      function resolveBlockSizingBehavior(blockCandidate, blockElement) {
        const linkedVisualNodeId = blockElement.getAttribute("data-html-visual-id");
        const linkedVisualKind = blockElement.getAttribute("data-html-visual-kind");
        const linkedVisualFitParticipation = normalizeFitParticipation(
          blockElement.getAttribute(fitRoleAttribute),
        );
        const linkedVisualAtomizationRole =
          blockElement.getAttribute("data-html-visual-atomization-role");
        const sharesSource = Boolean(linkedVisualNodeId);

        if (!linkedVisualNodeId || !sharesSource) {
          return "text-auto";
        }

        if (linkedVisualFitParticipation !== "content") {
          return "text-auto";
        }

        if (linkedVisualAtomizationRole !== "leaf") {
          return "text-auto";
        }

        return "frame-only";
      }

      function safeAnimationNumber(value, fallback, min, max) {
        const normalized = (value || "").trim().toLowerCase();
        let parsed = Number.NaN;
        if (/^\d+$/.test(normalized)) {
          parsed = Number.parseInt(normalized, 10);
        } else if (/^\d+ms$/.test(normalized)) {
          parsed = Number.parseInt(normalized.slice(0, -2), 10);
        } else if (/^\d+(?:\.\d+)?s$/.test(normalized)) {
          parsed = Math.round(Number.parseFloat(normalized.slice(0, -1)) * 1000);
        }
        if (!Number.isFinite(parsed)) {
          return fallback;
        }
        return Math.max(min, Math.min(max, parsed));
      }

      function combineTransforms(baseTransform, effectTransform) {
        if (!baseTransform || baseTransform === "none") {
          return effectTransform;
        }
        return baseTransform + " " + effectTransform;
      }

      function buildAnimationCue(element, index) {
        if (!(element instanceof HTMLElement)) {
          return null;
        }

        const role = (element.getAttribute("data-anim-role") || "").trim();
        if (!supportedAnimationRoles.has(role)) {
          return null;
        }

        const enter = (element.getAttribute("data-anim-enter") || "fade-up").trim();
        if (!supportedAnimationEnters.has(enter)) {
          return null;
        }

        const order = safeAnimationNumber(element.getAttribute("data-anim-order"), index, 0, 40);
        return {
          role,
          enter,
          delay: safeAnimationNumber(element.getAttribute("data-anim-delay"), order * 80, 0, 4000),
          duration: safeAnimationNumber(element.getAttribute("data-anim-duration"), 640, 160, 2400),
          baseTransform: window.getComputedStyle(element).transform,
        };
      }

      function buildAnimationKeyframes(cue) {
        if (!cue) {
          return null;
        }

        if (cue.enter === "fade-in") {
          return [
            { opacity: 0.001 },
            { opacity: 1 },
          ];
        }

        if (cue.enter === "slide-right") {
          return [
            {
              opacity: 0.001,
              transform: combineTransforms(cue.baseTransform, "translate3d(-28px,0,0)"),
            },
            {
              opacity: 1,
              transform: cue.baseTransform === "none" ? "none" : cue.baseTransform,
            },
          ];
        }

        if (cue.enter === "slide-left") {
          return [
            {
              opacity: 0.001,
              transform: combineTransforms(cue.baseTransform, "translate3d(28px,0,0)"),
            },
            {
              opacity: 1,
              transform: cue.baseTransform === "none" ? "none" : cue.baseTransform,
            },
          ];
        }

        if (cue.enter === "scale-in" || cue.enter === "chart-reveal") {
          return [
            {
              opacity: 0.001,
              transform: combineTransforms(
                cue.baseTransform,
                cue.enter === "chart-reveal" ? "scale3d(0.92,0.98,1)" : "scale3d(0.94,0.94,1)",
              ),
            },
            {
              opacity: 1,
              transform: cue.baseTransform === "none" ? "none" : cue.baseTransform,
            },
          ];
        }

        return [
          {
            opacity: 0.001,
            transform: combineTransforms(cue.baseTransform, "translate3d(0,22px,0)"),
          },
          {
            opacity: 1,
            transform: cue.baseTransform === "none" ? "none" : cue.baseTransform,
          },
        ];
      }

      function isPreviewAnimationTarget(element) {
        return (
          element instanceof HTMLElement &&
          element.getAttribute("data-html-canvas-placeholder") !== "true" &&
          element.getAttribute("data-html-transform-preview-placeholder") !== "true" &&
          element.getAttribute("data-html-transform-preview") !== "true"
        );
      }

      function resolveAnimationAnchorElement(anchor) {
        if (!anchor) {
          return null;
        }

        const candidates = Array.from(
          document.querySelectorAll('[data-anim-anchor="' + anchor + '"]'),
        ).filter((element) => isPreviewAnimationTarget(element));
        return candidates[0] instanceof HTMLElement ? candidates[0] : null;
      }

      function buildEntryTrackCue(track) {
        if (!(track?.element instanceof HTMLElement)) {
          return null;
        }

        return {
          enter: track.preset,
          delay: track.delayMs,
          duration: track.durationMs,
          baseTransform: window.getComputedStyle(track.element).transform,
        };
      }

      function buildLegacyEntryTracks() {
        return Array.from(document.querySelectorAll("[data-anim-role]"))
          .filter((element) => isPreviewAnimationTarget(element))
          .sort((left, right) => {
            const leftOrder = safeAnimationNumber(left.getAttribute("data-anim-order"), 0, 0, 40);
            const rightOrder = safeAnimationNumber(right.getAttribute("data-anim-order"), 0, 0, 40);
            return leftOrder - rightOrder;
          })
          .map((element, index) => {
            const cue = buildAnimationCue(element, index);
            if (!cue || !(element instanceof HTMLElement)) {
              return null;
            }

            return {
              element,
              preset: cue.enter,
              delayMs: cue.delay,
              durationMs: cue.duration,
              order: safeAnimationNumber(element.getAttribute("data-anim-order"), index, 0, 40),
            };
          })
          .filter(Boolean);
      }

      function buildManifestEntryTracks() {
        return (previewAnimationManifest?.entryTracks ?? [])
          .map((track) => {
            const element = resolveAnimationAnchorElement(track.anchor);
            if (!(element instanceof HTMLElement)) {
              return null;
            }

            return {
              element,
              preset: track.preset,
              delayMs: track.delayMs,
              durationMs: track.durationMs,
              order: track.order,
            };
          })
          .filter(Boolean)
          .sort((left, right) => left.order - right.order);
      }

      function buildPreviewEntryTracks() {
        const manifestTracks = buildManifestEntryTracks();
        return manifestTracks.length > 0 ? manifestTracks : buildLegacyEntryTracks();
      }

      function clearEntryAnimations() {
        if (activeEntryTimeoutId) {
          window.clearTimeout(activeEntryTimeoutId);
          activeEntryTimeoutId = 0;
        }

        activeEntryAnimations.forEach((animation) => {
          try {
            animation.cancel();
          } catch {
            // Ignore preview animation teardown failures.
          }
        });
        activeEntryAnimations = [];
      }

      function restoreLoopController(controller) {
        if (!controller?.element) {
          return;
        }

        controller.element.style.transform = controller.originalInlineTransform;
        controller.element.style.opacity = controller.originalInlineOpacity;
        controller.element.style.willChange = controller.originalInlineWillChange;
        controller.element.style.transformOrigin = controller.originalInlineTransformOrigin;
      }

      function clearLoopRuntime() {
        if (!activeLoopRuntime) {
          return;
        }

        if (activeLoopRuntime.rafId) {
          window.cancelAnimationFrame(activeLoopRuntime.rafId);
        }
        activeLoopRuntime.timerIds.forEach((timerId) => {
          window.clearTimeout(timerId);
          window.clearInterval(timerId);
        });
        activeLoopRuntime.cleanups.forEach((cleanup) => {
          try {
            cleanup();
          } catch {
            // Ignore loop cleanup failures so the preview can stay interactive.
          }
        });
        activeLoopRuntime.controllers.forEach((controller) => {
          restoreLoopController(controller);
        });
        activeLoopRuntime = null;
      }

      function stopAnimationSession() {
        currentAnimationToken += 1;
        clearEntryAnimations();
        clearLoopRuntime();
      }

      function getLoopController(runtime, element) {
        const existing = runtime.controllers.get(element);
        if (existing) {
          return existing;
        }

        const computed = window.getComputedStyle(element);
        const controller = {
          element,
          baseTransform: computed.transform === "none" ? "" : computed.transform,
          baseOpacity: Number.parseFloat(computed.opacity || "") || 1,
          originalInlineTransform: element.style.transform || "",
          originalInlineOpacity: element.style.opacity || "",
          originalInlineWillChange: element.style.willChange || "",
          originalInlineTransformOrigin: element.style.transformOrigin || "",
          rotateTransform: "",
          orbitTransform: "",
          pulseTransform: "",
          pulseOpacity: null,
        };
        runtime.controllers.set(element, controller);
        element.style.willChange = [controller.originalInlineWillChange, "transform", "opacity"]
          .filter(Boolean)
          .join(", ");
        return controller;
      }

      function applyLoopController(controller) {
        if (!controller?.element) {
          return;
        }

        const transforms = [
          controller.baseTransform,
          controller.orbitTransform,
          controller.rotateTransform,
          controller.pulseTransform,
        ].filter(Boolean);
        controller.element.style.transform =
          transforms.length > 0
            ? transforms.join(" ")
            : controller.originalInlineTransform;

        if (controller.pulseOpacity === null) {
          controller.element.style.opacity = controller.originalInlineOpacity;
          return;
        }

        controller.element.style.opacity = String(controller.pulseOpacity);
      }

      function trackLoopTimer(runtime, timerId) {
        runtime.timerIds.push(timerId);
        return timerId;
      }

      function scheduleLoopTimeout(runtime, callback, delayMs) {
        return trackLoopTimer(
          runtime,
          window.setTimeout(() => {
            if (activeLoopRuntime !== runtime || runtime.token !== currentAnimationToken) {
              return;
            }
            callback();
          }, delayMs),
        );
      }

      function registerLoopEffect(runtime, effect) {
        const element = resolveAnimationAnchorElement(effect.anchor);
        if (!(element instanceof HTMLElement)) {
          return;
        }

        if (effect.kind === "ticker") {
          const originalHtml = element.innerHTML;
          runtime.cleanups.push(() => {
            element.innerHTML = originalHtml;
          });
          let itemIndex = 0;
          const applyItem = () => {
            element.textContent = effect.items[itemIndex % effect.items.length] || "";
            itemIndex += 1;
          };
          applyItem();
          trackLoopTimer(runtime, window.setInterval(applyItem, effect.stepMs));
          return;
        }

        if (effect.kind === "typewriter") {
          const originalHtml = element.innerHTML;
          runtime.cleanups.push(() => {
            element.innerHTML = originalHtml;
          });
          let itemIndex = 0;
          let charIndex = 0;
          let phase = "type";

          const step = () => {
            const item = effect.items[itemIndex % effect.items.length] || "";
            if (phase === "type") {
              charIndex += 1;
              element.textContent = item.slice(0, charIndex);
              if (charIndex < item.length) {
                scheduleLoopTimeout(runtime, step, effect.typeMs);
                return;
              }
              phase = "hold";
              scheduleLoopTimeout(runtime, step, effect.holdMs);
              return;
            }

            if (phase === "hold") {
              phase = "delete";
              scheduleLoopTimeout(runtime, step, effect.deleteMs);
              return;
            }

            charIndex = Math.max(0, charIndex - 1);
            element.textContent = item.slice(0, charIndex);
            if (charIndex > 0) {
              scheduleLoopTimeout(runtime, step, effect.deleteMs);
              return;
            }

            phase = "type";
            itemIndex = (itemIndex + 1) % effect.items.length;
            scheduleLoopTimeout(runtime, step, effect.typeMs);
          };

          element.textContent = "";
          scheduleLoopTimeout(runtime, step, effect.typeMs);
          return;
        }

        const controller = getLoopController(runtime, element);
        if (!controller.originalInlineTransformOrigin) {
          controller.element.style.transformOrigin = "center center";
        }
        runtime.effects.push({
          ...effect,
          startedAt: performance.now(),
          controller,
        });
      }

      function updateLoopRuntime(runtime, now) {
        runtime.effects.forEach((effect) => {
          const elapsed = Math.max(0, now - effect.startedAt);
          const controller = effect.controller;
          if (!controller) {
            return;
          }

          if (effect.kind === "rotate") {
            const progress = (elapsed % effect.durationMs) / effect.durationMs;
            const direction = effect.direction === "counterclockwise" ? -1 : 1;
            const angle = direction * (effect.angleDeg ?? 360) * progress;
            controller.rotateTransform = "rotate(" + angle.toFixed(2) + "deg)";
            applyLoopController(controller);
            return;
          }

          if (effect.kind === "pulse") {
            const progress = (elapsed % effect.durationMs) / effect.durationMs;
            const wave = 0.5 - Math.cos(progress * Math.PI * 2) / 2;
            const scaleFrom = effect.scaleFrom ?? 1;
            const scaleTo = effect.scaleTo ?? 1.08;
            const opacityFrom = effect.opacityFrom ?? controller.baseOpacity;
            const opacityTo = effect.opacityTo ?? controller.baseOpacity;
            const scale = scaleFrom + (scaleTo - scaleFrom) * wave;
            controller.pulseTransform = "scale(" + scale.toFixed(4) + ")";
            controller.pulseOpacity = opacityFrom + (opacityTo - opacityFrom) * wave;
            applyLoopController(controller);
            return;
          }

          const progress = (elapsed % effect.durationMs) / effect.durationMs;
          const radians = progress * Math.PI * 2;
          const radius = effect.radiusPx;
          const x = effect.axis === "y" ? 0 : Math.cos(radians) * radius;
          const y = effect.axis === "x" ? 0 : Math.sin(radians) * radius;
          controller.orbitTransform =
            "translate3d(" + x.toFixed(2) + "px," + y.toFixed(2) + "px,0)";
          applyLoopController(controller);
        });
      }

      function startLoopRuntime(token) {
        if (token !== currentAnimationToken) {
          return;
        }

        const loopEffects = previewAnimationManifest?.loopEffects ?? [];
        if (loopEffects.length === 0) {
          return;
        }

        const runtime = {
          token,
          effects: [],
          controllers: new Map(),
          timerIds: [],
          cleanups: [],
          rafId: 0,
        };
        activeLoopRuntime = runtime;

        loopEffects.forEach((effect) => {
          try {
            registerLoopEffect(runtime, effect);
          } catch {
            // Ignore a single loop effect failure and keep the rest of the page interactive.
          }
        });

        if (runtime.effects.length === 0) {
          return;
        }

        const tick = (now) => {
          if (activeLoopRuntime !== runtime || runtime.token !== currentAnimationToken) {
            return;
          }

          try {
            updateLoopRuntime(runtime, now);
            runtime.rafId = window.requestAnimationFrame(tick);
          } catch {
            clearLoopRuntime();
          }
        };

        runtime.rafId = window.requestAnimationFrame(tick);
      }

      function startAnimationSession() {
        if (!animationModeEnabled) {
          return;
        }

        stopAnimationSession();
        const token = currentAnimationToken;
        const entryTracks = buildPreviewEntryTracks();
        if (entryTracks.length === 0 || typeof HTMLElement.prototype.animate !== "function") {
          startLoopRuntime(token);
          return;
        }

        let maxEndMs = 0;
        entryTracks.forEach((track) => {
          const cue = buildEntryTrackCue(track);
          const keyframes = buildAnimationKeyframes(cue);
          if (!cue || !keyframes) {
            return;
          }

          if (cue.enter === "chart-reveal") {
            track.element.style.transformOrigin = "left center";
          }

          const animation = track.element.animate(keyframes, {
            duration: cue.duration,
            delay: cue.delay,
            easing: cue.enter === "chart-reveal"
              ? "cubic-bezier(0.16, 1, 0.3, 1)"
              : "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "both",
          });
          activeEntryAnimations.push(animation);
          maxEndMs = Math.max(maxEndMs, cue.delay + cue.duration);
        });

        activeEntryTimeoutId = window.setTimeout(() => {
          if (token !== currentAnimationToken) {
            return;
          }
          clearEntryAnimations();
          startLoopRuntime(token);
        }, maxEndMs + 40);
      }

      function syncAnimationPlaybackState() {
        const shouldRun =
          animationModeEnabled &&
          previewViewportVisible &&
          document.visibilityState !== "hidden" &&
          document.body.isConnected;
        if (shouldRun === animationPlaybackActive) {
          return;
        }

        animationPlaybackActive = shouldRun;
        if (shouldRun) {
          try {
            startAnimationSession();
          } catch {
            stopAnimationSession();
          }
          return;
        }

        stopAnimationSession();
      }

      function ensureTransformPreviewRoot(pageRoot) {
        let overlayRoot = pageRoot.querySelector('[data-html-transform-preview-root="true"]');
        if (overlayRoot instanceof HTMLElement) {
          return overlayRoot;
        }

        overlayRoot = document.createElement("div");
        overlayRoot.setAttribute("data-html-transform-preview-root", "true");
        overlayRoot.style.position = "absolute";
        overlayRoot.style.inset = "0";
        overlayRoot.style.pointerEvents = "none";
        overlayRoot.style.zIndex = "8";
        pageRoot.appendChild(overlayRoot);
        return overlayRoot;
      }

      function findSemanticElement(targetType, targetId) {
        const selector =
          targetType === "block"
            ? '[data-html-block-id="' + targetId + '"]'
            : '[data-html-visual-id="' + targetId + '"]';
        const matches = Array.from(document.querySelectorAll(selector)).filter(
          (element) =>
            element instanceof HTMLElement &&
            !element.closest("[data-html-canvas-placeholder='true']") &&
            !element.closest("[data-html-transform-preview-placeholder='true']"),
        );
        if (matches.length === 0) {
          return null;
        }

        return matches.sort((left, right) => {
          const leftFreeform = left.getAttribute("data-html-freeform") === "true" ? 0 : 1;
          const rightFreeform = right.getAttribute("data-html-freeform") === "true" ? 0 : 1;
          if (leftFreeform !== rightFreeform) {
            return leftFreeform - rightFreeform;
          }

          const leftRect = left.getBoundingClientRect();
          const rightRect = right.getBoundingClientRect();
          const leftArea = Math.max(1, leftRect.width * leftRect.height);
          const rightArea = Math.max(1, rightRect.width * rightRect.height);
          return leftArea - rightArea;
        })[0];
      }

      function applyTransformPreviewFrame(previewElement, targetType, frame, fontSize) {
        if (!(previewElement instanceof HTMLElement)) {
          return;
        }

        previewElement.setAttribute("data-html-transform-preview", "true");
        previewElement.style.position = "absolute";
        previewElement.style.left = frame.x + "px";
        previewElement.style.top = frame.y + "px";
        previewElement.style.width = frame.w + "px";
        previewElement.style.maxWidth = frame.w + "px";
        previewElement.style.minWidth = Math.max(8, frame.w) + "px";
        previewElement.style.minHeight = Math.max(8, frame.h) + "px";
        previewElement.style.boxSizing = "border-box";
        previewElement.style.margin = "0";
        previewElement.style.pointerEvents = "auto";
        previewElement.style.zIndex = "3";

        if (targetType === "block") {
          if (Number.isFinite(fontSize) && fontSize > 0) {
            previewElement.style.fontSize = Math.round(fontSize) + "px";
            previewElement.setAttribute(
              "data-html-freeform-font-size",
              String(Math.round(fontSize)),
            );
          }
          previewElement.style.height = frame.h + "px";
        } else {
          previewElement.style.height = frame.h + "px";
        }
      }

      function stripPreviewSemanticAttributes(element) {
        if (!(element instanceof HTMLElement)) {
          return;
        }

        [element, ...Array.from(element.querySelectorAll("*"))].forEach((node) => {
          if (!(node instanceof HTMLElement)) {
            return;
          }

          node.removeAttribute("id");
          node.removeAttribute(fitRoleAttribute);
          node.removeAttribute("data-html-block-id");
          node.removeAttribute("data-html-block-kind");
          node.removeAttribute("data-html-visual-id");
          node.removeAttribute("data-html-visual-kind");
          node.removeAttribute("data-html-freeform");
          node.removeAttribute("data-html-canvas-target");
          node.removeAttribute("data-html-canvas-source-id");
          node.removeAttribute("data-html-canvas-layer");
          node.removeAttribute("data-html-canvas-layer-order");
          node.removeAttribute("data-html-freeform-font-size");
          node.removeAttribute("data-html-block-selected");
          node.removeAttribute("data-html-visual-selected");
          node.removeAttribute("data-html-transform-preview");
          node.removeAttribute("data-html-transform-preview-placeholder");
          node.removeAttribute("data-html-canvas-placeholder");
          node.removeAttribute("data-html-canvas-placeholder-for");
          node.removeAttribute("data-html-canvas-placeholder-target");
        });
      }

      function createTransformPreviewPlaceholder(sourceElement, targetType, targetId) {
        const placeholder = sourceElement.cloneNode(true);
        if (!(placeholder instanceof HTMLElement)) {
          return null;
        }

        stripPreviewSemanticAttributes(placeholder);
        placeholder.setAttribute("data-html-transform-preview-placeholder", "true");
        placeholder.setAttribute("data-html-canvas-placeholder", "true");
        placeholder.setAttribute("data-html-canvas-placeholder-for", targetId);
        placeholder.setAttribute("data-html-canvas-placeholder-target", targetType);
        placeholder.style.visibility = "hidden";
        placeholder.style.pointerEvents = "none";
        placeholder.style.userSelect = "none";
        return placeholder;
      }

      function clearActiveTransformPreview(options = { restore: true }) {
        if (!activeTransformPreview) {
          return;
        }

        if (activeTransformPreview.usedExistingElement) {
          if (options.restore) {
            const styles = activeTransformPreview.originalPreviewStyles;
            Object.entries(styles).forEach(([key, value]) => {
              activeTransformPreview.previewElement.style[key] = value;
            });
            if (activeTransformPreview.originalFreeformFontSize) {
              activeTransformPreview.previewElement.setAttribute(
                "data-html-freeform-font-size",
                activeTransformPreview.originalFreeformFontSize,
              );
            } else {
              activeTransformPreview.previewElement.removeAttribute("data-html-freeform-font-size");
            }
          }
          activeTransformPreview.previewElement.removeAttribute("data-html-transform-preview");
        } else {
          if (options.restore) {
            Object.entries(activeTransformPreview.originalPreviewStyles).forEach(([key, value]) => {
              activeTransformPreview.previewElement.style[key] = value;
            });
            if (activeTransformPreview.originalFreeformFontSize) {
              activeTransformPreview.previewElement.setAttribute(
                "data-html-freeform-font-size",
                activeTransformPreview.originalFreeformFontSize,
              );
            } else {
              activeTransformPreview.previewElement.removeAttribute("data-html-freeform-font-size");
            }
            if (activeTransformPreview.originalFreeformState) {
              activeTransformPreview.previewElement.setAttribute(
                "data-html-freeform",
                activeTransformPreview.originalFreeformState,
              );
            } else {
              activeTransformPreview.previewElement.removeAttribute("data-html-freeform");
            }
            if (activeTransformPreview.originalCanvasTarget) {
              activeTransformPreview.previewElement.setAttribute(
                "data-html-canvas-target",
                activeTransformPreview.originalCanvasTarget,
              );
            } else {
              activeTransformPreview.previewElement.removeAttribute("data-html-canvas-target");
            }
            if (activeTransformPreview.originalCanvasSourceId) {
              activeTransformPreview.previewElement.setAttribute(
                "data-html-canvas-source-id",
                activeTransformPreview.originalCanvasSourceId,
              );
            } else {
              activeTransformPreview.previewElement.removeAttribute("data-html-canvas-source-id");
            }
            if (activeTransformPreview.placeholderElement instanceof HTMLElement) {
              activeTransformPreview.placeholderElement.replaceWith(
                activeTransformPreview.previewElement,
              );
            }
          } else {
            activeTransformPreview.previewElement.removeAttribute("data-html-transform-preview");
          }
        }

        activeTransformPreview = null;
      }

      function beginOrUpdateTransformPreview(targetType, targetId, frame, fontSize) {
        if (
          activeTransformPreview &&
          (activeTransformPreview.target !== targetType || activeTransformPreview.id !== targetId)
        ) {
          if (activeTransformPreview.committed) {
            activeTransformPreview = null;
          } else {
            clearActiveTransformPreview({ restore: true });
          }
        }

        if (!activeTransformPreview) {
          const sourceElement = findSemanticElement(targetType, targetId);
          const pageRoot = getPageRoot();
          if (!(sourceElement instanceof HTMLElement) || !(pageRoot instanceof HTMLElement)) {
            return;
          }

          if (sourceElement.getAttribute("data-html-freeform") === "true") {
            activeTransformPreview = {
              target: targetType,
              id: targetId,
              committed: false,
              usedExistingElement: true,
              previewElement: sourceElement,
              originalPreviewStyles: {
                left: sourceElement.style.left || "",
                top: sourceElement.style.top || "",
                width: sourceElement.style.width || "",
                maxWidth: sourceElement.style.maxWidth || "",
                minWidth: sourceElement.style.minWidth || "",
                minHeight: sourceElement.style.minHeight || "",
                height: sourceElement.style.height || "",
                position: sourceElement.style.position || "",
                margin: sourceElement.style.margin || "",
                boxSizing: sourceElement.style.boxSizing || "",
                pointerEvents: sourceElement.style.pointerEvents || "",
                zIndex: sourceElement.style.zIndex || "",
                fontSize: sourceElement.style.fontSize || "",
              },
              originalFreeformFontSize:
                sourceElement.getAttribute("data-html-freeform-font-size") || null,
            };
          } else {
            const previewRoot = ensureTransformPreviewRoot(pageRoot);
            const placeholderElement = createTransformPreviewPlaceholder(
              sourceElement,
              targetType,
              targetId,
            );
            if (!(placeholderElement instanceof HTMLElement)) {
              return;
            }
            const originalFreeformState = sourceElement.getAttribute("data-html-freeform") || null;
            const originalCanvasTarget =
              sourceElement.getAttribute("data-html-canvas-target") || null;
            const originalCanvasSourceId =
              sourceElement.getAttribute("data-html-canvas-source-id") || null;
            const originalFreeformFontSize =
              sourceElement.getAttribute("data-html-freeform-font-size") || null;
            const originalPreviewStyles = {
              left: sourceElement.style.left || "",
              top: sourceElement.style.top || "",
              width: sourceElement.style.width || "",
              maxWidth: sourceElement.style.maxWidth || "",
              minWidth: sourceElement.style.minWidth || "",
              minHeight: sourceElement.style.minHeight || "",
              height: sourceElement.style.height || "",
              position: sourceElement.style.position || "",
              margin: sourceElement.style.margin || "",
              boxSizing: sourceElement.style.boxSizing || "",
              pointerEvents: sourceElement.style.pointerEvents || "",
              zIndex: sourceElement.style.zIndex || "",
              fontSize: sourceElement.style.fontSize || "",
            };

            sourceElement.replaceWith(placeholderElement);
            sourceElement.setAttribute("data-html-freeform", "true");
            sourceElement.setAttribute("data-html-canvas-target", targetType);
            sourceElement.setAttribute("data-html-canvas-source-id", targetId);
            previewRoot.appendChild(sourceElement);

            activeTransformPreview = {
              target: targetType,
              id: targetId,
              committed: false,
              usedExistingElement: false,
              previewElement: sourceElement,
              placeholderElement,
              originalPreviewStyles,
              originalFreeformFontSize,
              originalFreeformState,
              originalCanvasTarget,
              originalCanvasSourceId,
            };
          }
        }

        if (!activeTransformPreview) {
          return;
        }

        activeTransformPreview.committed = false;
        applyTransformPreviewFrame(
          activeTransformPreview.previewElement,
          targetType,
          frame,
          fontSize,
        );
      }

      function collectSelectableCandidatesFromSeeds(seeds, pageRoot) {
        const candidates = [];
        const seen = new Set();

        seeds.forEach(({ element: seed, layerIndex }) => {
          let current = seed;
          let depth = 0;

          while (current && current instanceof Element) {
            if (pageRoot && current === pageRoot.parentElement) {
              break;
            }

            const isPlaceholder =
              current.closest("[data-html-canvas-placeholder='true']") ||
              current.closest("[data-html-transform-preview-placeholder='true']") ||
              current.getAttribute("data-html-transform-preview") === "true";
            if (isPlaceholder) {
              current = current.parentElement;
              depth += 1;
              continue;
            }

            const rect = current.getBoundingClientRect();
            const area = Math.max(1, rect.width * rect.height);
            const fitParticipation = normalizeFitParticipation(
              current.getAttribute(fitRoleAttribute),
            );

            const blockId = current.getAttribute("data-html-block-id");
            const blockKind = current.getAttribute("data-html-block-kind");
            if (blockId && blockKind && !seen.has("block:" + blockId)) {
              candidates.push({
                type: "block",
                key: "block:" + blockId,
                element: current,
                depth,
                area,
                layerIndex,
                fitParticipation,
                blockId,
                blockKind,
                visualKind: current.getAttribute("data-html-visual-kind"),
                sharesSource: Boolean(current.getAttribute("data-html-visual-id")),
                atomizationRole: current.getAttribute("data-html-visual-atomization-role"),
                selectionPriority: current.getAttribute("data-html-visual-selection-priority"),
              });
              seen.add("block:" + blockId);
            }

            const visualNodeId = current.getAttribute("data-html-visual-id");
            const visualKind = current.getAttribute("data-html-visual-kind");
            if (visualNodeId && visualKind && !seen.has("visual:" + visualNodeId)) {
              candidates.push({
                type: "visual",
                key: "visual:" + visualNodeId,
                element: current,
                depth,
                area,
                layerIndex,
                fitParticipation,
                visualNodeId,
                visualKind,
                blockKind: current.getAttribute("data-html-block-kind"),
                sharesSource: Boolean(current.getAttribute("data-html-block-id")),
                atomizationRole: current.getAttribute("data-html-visual-atomization-role"),
                selectionPriority: current.getAttribute("data-html-visual-selection-priority"),
              });
              seen.add("visual:" + visualNodeId);
            }

            if (pageRoot && current === pageRoot) {
              break;
            }

            current = current.parentElement;
            depth += 1;
          }
        });

        return candidates;
      }

      function collectSelectableCandidates(target, clientX, clientY, options) {
        if (!(target instanceof Element)) {
          return [];
        }

        const pageRoot = document.querySelector("section.page");
        const includeProbes = options?.includeProbes === true;
        const seeds = [];
        const seenSeeds = new Set();
        const pushSeed = (element, layerIndex) => {
          if (!(element instanceof Element)) {
            return;
          }
          if (seenSeeds.has(element)) {
            return;
          }
          seenSeeds.add(element);
          seeds.push({ element, layerIndex });
        };

        pushSeed(target, 0);

        if (includeProbes && Number.isFinite(clientX) && Number.isFinite(clientY)) {
          const probeOffsets = [
            [-6, 0],
            [6, 0],
            [0, -6],
            [0, 6],
          ];
          probeOffsets.forEach(([offsetX, offsetY], probeIndex) => {
            const pointTargets = document.elementsFromPoint(clientX + offsetX, clientY + offsetY);
            pointTargets.forEach((element, elementIndex) => {
              pushSeed(element, probeIndex * 100 + elementIndex + 1);
            });
          });
        }

        return collectSelectableCandidatesFromSeeds(seeds, pageRoot);
      }

      function getElementAncestorDepth(target, ancestor) {
        let current = target;
        let depth = 0;
        while (current && current instanceof Element) {
          if (current === ancestor) {
            return depth;
          }
          current = current.parentElement;
          depth += 1;
        }
        return null;
      }

      function chooseDirectTextBlockCandidate(target, candidates, preferredType) {
        if (!(target instanceof Element)) {
          return null;
        }

        if (preferredType === "visual" || selectionContext.preferredSelectionType === "visual") {
          return null;
        }

        const directBlockElement = target.closest("[data-html-block-id]");
        if (!(directBlockElement instanceof Element)) {
          return null;
        }

        const directBlockId = directBlockElement.getAttribute("data-html-block-id");
        const directBlockKind = directBlockElement.getAttribute("data-html-block-kind");
        if (!directBlockId || !directBlockKind || !textPriorityBlockKinds.has(directBlockKind)) {
          return null;
        }

        const directBlockDepth = getElementAncestorDepth(target, directBlockElement);
        if (!Number.isFinite(directBlockDepth)) {
          return null;
        }

        const directVisualElement = target.closest("[data-html-visual-id]");
        const directVisualDepth =
          directVisualElement instanceof Element
            ? getElementAncestorDepth(target, directVisualElement)
            : null;
        if (Number.isFinite(directVisualDepth) && directVisualDepth < directBlockDepth) {
          return null;
        }

        return (
          candidates.find(
            (candidate) =>
              candidate.type === "block" && candidate.blockId === directBlockId,
          ) ?? null
        );
      }

      function chooseSelectableCandidate(target, preferredType, clientX, clientY) {
        const pageModeHybrid =
          selectionContext.preferredSelectionType === "page" && !preferredType;
        const order = getSelectionOrder(preferredType);
        const typeRanks = new Map(order.map((type, index) => [type, index]));
        const rankCandidates = (candidates) => {
          const pool = (pageModeHybrid
            ? candidates.filter((candidate) => !isDecorativeVisualCandidate(candidate))
            : candidates)
            .filter((candidate) => typeRanks.has(candidate.type))
            .sort((left, right) => {
              if (pageModeHybrid) {
                const leftSemanticRank = getPageSemanticRank(left);
                const rightSemanticRank = getPageSemanticRank(right);
                if (leftSemanticRank !== rightSemanticRank) {
                  return leftSemanticRank - rightSemanticRank;
                }
              } else if (selectionContext.preferredSelectionType === "visual" && !preferredType) {
                const leftVisualRank = getVisualAtomizationRank(left, "visual");
                const rightVisualRank = getVisualAtomizationRank(right, "visual");
                if (leftVisualRank !== rightVisualRank) {
                  return leftVisualRank - rightVisualRank;
                }
              }
              if (left.layerIndex !== right.layerIndex) {
                return left.layerIndex - right.layerIndex;
              }
              const leftRank = typeRanks.get(left.type) ?? 99;
              const rightRank = typeRanks.get(right.type) ?? 99;
              if (leftRank !== rightRank) {
                return leftRank - rightRank;
              }
              if (left.depth !== right.depth) {
                return left.depth - right.depth;
              }
              if (left.area !== right.area) {
                return left.area - right.area;
              }
              return left.key.localeCompare(right.key);
            });
          return pool[0] ?? null;
        };

        const exactTargetCandidates = collectSelectableCandidates(target, clientX, clientY, {
          includeProbes: false,
        });
        const directTextBlockCandidate = chooseDirectTextBlockCandidate(
          target,
          exactTargetCandidates,
          preferredType,
        );
        if (directTextBlockCandidate) {
          return directTextBlockCandidate;
        }

        const exactTargetCandidate = rankCandidates(exactTargetCandidates);
        if (exactTargetCandidate) {
          return exactTargetCandidate;
        }

        return rankCandidates(
          collectSelectableCandidates(target, clientX, clientY, { includeProbes: true }),
        );
      }

      function buildSelectionRectPayload(element) {
        const rect = element.getBoundingClientRect();
        return {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        };
      }

      function buildBlockPayload(blockCandidate) {
        const blockElement = blockCandidate.element;
        const computed = window.getComputedStyle(blockElement);
        const fontSize = Number.parseFloat(computed.fontSize || "");
        const lineHeight = Number.parseFloat(computed.lineHeight || "");
        const items = blockCandidate.blockKind === "list"
          ? Array.from(blockElement.querySelectorAll(":scope li"))
              .map((item) => normalize(item.textContent))
              .filter(Boolean)
          : [];
        const linkedVisualNodeId = blockElement.getAttribute("data-html-visual-id");
        const linkedVisualKind = blockElement.getAttribute("data-html-visual-kind");
        const linkedVisualFitParticipation = normalizeFitParticipation(
          blockElement.getAttribute(fitRoleAttribute),
        );
        const linkedVisualAtomizationRole =
          blockElement.getAttribute("data-html-visual-atomization-role");
        const linkedVisualSelectionPriority =
          blockElement.getAttribute("data-html-visual-selection-priority");
        const sharesSource = Boolean(linkedVisualNodeId);
        const sizingBehavior = resolveBlockSizingBehavior(blockCandidate, blockElement);

        return {
          type: "ppt-html-preview-interaction",
          pageNumber: ${pageNumber},
          target: "block",
          blockId: blockCandidate.blockId,
          blockKind: blockCandidate.blockKind,
          rect: buildSelectionRectPayload(blockElement),
          fontSize: Number.isFinite(fontSize) ? fontSize : undefined,
          fontFamily: computed.fontFamily || undefined,
          fontWeight: computed.fontWeight || undefined,
          fontStyle: computed.fontStyle || undefined,
          lineHeight: Number.isFinite(lineHeight) ? lineHeight : undefined,
          linkedVisualNodeId: linkedVisualNodeId || undefined,
          linkedVisualKind: linkedVisualKind || undefined,
          linkedVisualFitParticipation: linkedVisualFitParticipation || undefined,
          linkedVisualAtomizationRole: linkedVisualAtomizationRole || undefined,
          linkedVisualSelectionPriority: linkedVisualSelectionPriority || undefined,
          sharesSource,
          sizingBehavior,
          whiteSpace:
            computed.whiteSpace === "pre-wrap" || computed.whiteSpace === "pre-line"
              ? "pre-wrap"
              : "normal",
          text: normalize(blockElement.textContent),
          items,
        };
      }

      function buildVisualPayload(visualCandidate) {
        return {
          type: "ppt-html-preview-interaction",
          pageNumber: ${pageNumber},
          target: "visual",
          visualNodeId: visualCandidate.visualNodeId,
          visualKind: visualCandidate.visualKind,
          rect: buildSelectionRectPayload(visualCandidate.element),
        };
      }

      function postSelectionMeasurement() {
        document.querySelectorAll("[data-html-block-selected='true']").forEach((element) => {
          element.removeAttribute("data-html-block-selected");
        });
        document.querySelectorAll("[data-html-visual-selected='true']").forEach((element) => {
          element.removeAttribute("data-html-visual-selected");
        });

        if (selectionContext.selectedBlockId) {
          const blockElement = findSemanticElement("block", selectionContext.selectedBlockId);
          if (blockElement instanceof HTMLElement) {
            blockElement.setAttribute("data-html-block-selected", "true");
            window.parent.postMessage(
              {
                ...buildBlockPayload({
                  type: "block",
                  element: blockElement,
                  blockId: selectionContext.selectedBlockId,
                  blockKind: blockElement.getAttribute("data-html-block-kind") || "paragraph",
                }),
                type: "ppt-html-preview-selection-measure",
              },
              "*",
            );
            return;
          }
        }

        if (selectionContext.selectedVisualNodeId) {
          const visualElement = findSemanticElement("visual", selectionContext.selectedVisualNodeId);
          const awaitingFreeformHydration =
            selectionContext.selectedVisualTransformMode === "freeform" &&
            (!(visualElement instanceof HTMLElement) ||
              visualElement.getAttribute("data-html-freeform") !== "true" ||
              visualElement.getAttribute("data-html-canvas-source-id") !==
                selectionContext.selectedVisualNodeId);
          if (awaitingFreeformHydration) {
            return;
          }
          if (visualElement instanceof HTMLElement) {
            visualElement.setAttribute("data-html-visual-selected", "true");
            window.parent.postMessage(
              {
                ...buildVisualPayload({
                  type: "visual",
                  element: visualElement,
                  visualNodeId: selectionContext.selectedVisualNodeId,
                  visualKind: visualElement.getAttribute("data-html-visual-kind") || "surface",
                }),
                type: "ppt-html-preview-selection-measure",
              },
              "*",
            );
            return;
          }
        }

        window.parent.postMessage(
          {
            type: "ppt-html-preview-selection-measure",
            pageNumber: ${pageNumber},
            target: null,
          },
          "*",
        );
      }

      document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const preferredType =
          selectionContext.preferredSelectionType === "visual" ? "visual" : null;
        const candidate = chooseSelectableCandidate(
          target,
          preferredType,
          event.clientX,
          event.clientY,
        );
        if (!candidate) {
          window.parent.postMessage(
            {
              type: "ppt-html-preview-interaction",
              pageNumber: ${pageNumber},
              action: "background"
            },
            "*",
          );
          return;
        }

        const payload =
          candidate.type === "block"
            ? buildBlockPayload(candidate)
            : buildVisualPayload(candidate);
        window.parent.postMessage({ ...payload, action: "select" }, "*");
      }, true);

      window.addEventListener("message", (event) => {
        if (!event.data || event.data.type !== "ppt-html-preview-command") {
          return;
        }

        if (event.data.pageNumber !== ${pageNumber}) {
          return;
        }

        if (event.data.action === "preview-runtime-visibility") {
          previewViewportVisible = event.data.active === true;
          syncAnimationPlaybackState();
          return;
        }

        if (event.data.action === "selection-context") {
          const preferredSelectionType = event.data.preferredSelectionType;
          selectionContext = {
            preferredSelectionType:
              preferredSelectionType === "text" ||
              preferredSelectionType === "visual" ||
              preferredSelectionType === "page"
                ? preferredSelectionType
                : "page",
            selectedBlockId:
              typeof event.data.selectedBlockId === "string" && event.data.selectedBlockId
                ? event.data.selectedBlockId
                : null,
            selectedVisualNodeId:
              typeof event.data.selectedVisualNodeId === "string" && event.data.selectedVisualNodeId
                ? event.data.selectedVisualNodeId
                : null,
            selectedVisualTransformMode:
              event.data.selectedVisualTransformMode === "freeform" ? "freeform" : null,
          };
          syncSelectionContextAttribute();
          window.requestAnimationFrame(() => postSelectionMeasurement());
          return;
        }

        if (event.data.action === "measure-selection") {
          window.requestAnimationFrame(() => postSelectionMeasurement());
          return;
        }

        if (
          event.data.action !== "transform-preview-start" &&
          event.data.action !== "transform-preview-update" &&
          event.data.action !== "transform-preview-commit" &&
          event.data.action !== "transform-preview-cancel"
        ) {
          return;
        }

        if (event.data.action === "transform-preview-cancel") {
          clearActiveTransformPreview({ restore: true });
          return;
        }

        const target = event.data.target;
        const targetId = event.data.targetId;
        const frame = event.data.frame;
        const fontSize = Number(event.data.fontSize);
        if (
          (target !== "block" && target !== "visual") ||
          !targetId ||
          !frame ||
          !Number.isFinite(frame.x) ||
          !Number.isFinite(frame.y) ||
          !Number.isFinite(frame.w) ||
          !Number.isFinite(frame.h)
        ) {
          return;
        }

        beginOrUpdateTransformPreview(
          target,
          targetId,
          {
            x: Math.round(frame.x),
            y: Math.round(frame.y),
            w: Math.round(frame.w),
            h: Math.round(frame.h),
          },
          Number.isFinite(fontSize) && fontSize > 0 ? fontSize : undefined,
        );

        if (activeTransformPreview && event.data.action === "transform-preview-commit") {
          activeTransformPreview.committed = true;
          activeTransformPreview.previewElement.removeAttribute("data-html-transform-preview");
          window.requestAnimationFrame(() => postSelectionMeasurement());
        }
      });

      function reportPageOverflow() {
        const pageRoot = document.querySelector("section.page");
        if (!pageRoot) {
          return;
        }

        const pageWidth = pageRoot.clientWidth || 1600;
        const pageHeight = pageRoot.clientHeight || 900;
        const titleText = (pageRoot.getAttribute("data-page-title") || pageRoot.querySelector("h1")?.textContent || "").replace(/\s+/g, " ").trim();
        const normalizedTitle = titleText.toLowerCase();
        const genericTitle =
          /^(?:core thesis|opening thesis|key pattern|what the evidence suggests)$/.test(normalizedTitle) ||
          /^(?:evidence page|results page|support|supporting detail|supporting result|page)\s+\d+$/.test(normalizedTitle) ||
          /^(?:synthesis|open questions)$/.test(normalizedTitle) ||
          /^(?:core view|case view|decision view|research view|report review|case review|decision review|research review)$/.test(normalizedTitle) ||
          /^the brief (?:points to|supports)\b/.test(normalizedTitle);
        const promptLeak =
          /^(create|build|make|prepare|draft|write|design|generate)\b/i.test(titleText) ||
          /\b(?:three-page|board deck|deck should|use the following evidence)\b/i.test(normalizedTitle) ||
          genericTitle;
        const repeatedInstruction =
          /\b(?:use the following evidence|what the deck should do|tone)\b/i.test(normalizedTitle);
        const truncated =
          titleText.length > 0 &&
          /[\s:-](?:on|for|with|about|to)$/i.test(titleText);

        function detectPromptScaffoldLeak(text) {
          const normalizedText = text.replace(/\s+/g, " ").trim();
          return (
            /\b(?:user task brief|task rigor brief|renderer brief|proof plan|layout strategy|source material|selected template contract|capability cards|output rules|page argument contract|deck planning intent)\b/i.test(normalizedText) ||
            /\b(?:headline claim|support bullets?|evidence callouts?|evidence bullets?|page evidence bundle|brief digest|current page (?:goal|story|intent|objective)|page question)\s*:/i.test(normalizedText) ||
            /\bsupport bullet\s*\d+\b/i.test(normalizedText) ||
            /\bone-page thesis\b/i.test(normalizedText) ||
            /\bselected deep family\b/i.test(normalizedText) ||
            /\bthis page must answer exactly one\b/i.test(normalizedText) ||
            /\bat most\s+2\s+short\s+(?:bullets|callouts)\b/i.test(normalizedText) ||
            /\b(?:using|tied to|based on)\s+the supplied brief\b/i.test(normalizedText)
          );
        }

        function summarizeElement(element) {
          const rect = element.getBoundingClientRect();
          const pageRect = pageRoot.getBoundingClientRect();
          const top = Math.max(0, Math.round(rect.top));
          const left = Math.max(0, Math.round(rect.left));
          const width = Math.max(0, Math.round(rect.width));
          const height = Math.max(0, Math.round(rect.height));
          const right = Math.max(0, Math.round(rect.right));
          const bottom = Math.max(0, Math.round(rect.bottom));
          const relativeTop = Math.max(0, Math.round(rect.top - pageRect.top));
          const relativeLeft = Math.max(0, Math.round(rect.left - pageRect.left));
          const relativeRight = Math.max(0, Math.round(rect.right - pageRect.left));
          const relativeBottom = Math.max(0, Math.round(rect.bottom - pageRect.top));
          const label = (
            element.getAttribute("data-html-block-id") ||
            element.getAttribute("data-html-visual-kind") ||
            element.getAttribute("data-html-layout-id") ||
            element.tagName.toLowerCase()
          ).slice(0, 120);
          const blockId = element.getAttribute("data-html-block-id");
          const visualKind = element.getAttribute("data-html-visual-kind");
          const layoutId = element.getAttribute("data-html-layout-id");
          const textPreview = element.innerText.replace(/\s+/g, " ").trim().slice(0, 120) || null;
          const selector = blockId
            ? '[data-html-block-id="' + blockId + '"]'
            : layoutId
              ? '[data-html-layout-id="' + layoutId + '"]'
              : visualKind
                ? '[data-html-visual-kind="' + visualKind + '"]'
                : element.tagName.toLowerCase();

          return {
            kind: visualKind || element.tagName.toLowerCase(),
            role: element.getAttribute("data-export-role") || "",
            label,
            blockId,
            layoutId,
            visualKind,
            selector,
            textPreview,
            fitRole: element.getAttribute(fitRoleAttribute) || "",
            top: relativeTop,
            left: relativeLeft,
            width,
            height,
            right: relativeRight,
            bottom: relativeBottom,
            overflowX: relativeRight > pageWidth + 2,
            overflowY: relativeBottom > pageHeight + 2,
          };
        }

        function collectFitContentElements() {
          return Array.from(
            pageRoot.querySelectorAll("[" + fitRoleAttribute + "='content']"),
          ).filter((element) => {
            if (!(element instanceof HTMLElement)) {
              return false;
            }

            const isPlaceholder =
              element.closest("[data-html-canvas-placeholder='true']") ||
              element.closest("[data-html-transform-preview-placeholder='true']");
            if (isPlaceholder) {
              return false;
            }

            const rect = element.getBoundingClientRect();
            return rect.width > 0 || rect.height > 0;
          });
        }

        function collectContentRegions(contentSummaries) {
          return [...contentSummaries]
            .sort((left, right) => left.top - right.top || left.left - right.left)
            .slice(0, 16);
        }

        function collectSuspectElements(contentSummaries) {
          const semanticSuspects = contentSummaries
            .filter((element) => element.overflowX || element.overflowY)
            .slice(0, 16);

          if (semanticSuspects.length > 0) {
            return semanticSuspects;
          }

          const likelyOffenders = [...contentSummaries]
            .sort((left, right) => {
              const rightScore = right.height + Math.max(0, right.bottom - pageHeight);
              const leftScore = left.height + Math.max(0, left.bottom - pageHeight);
              return rightScore - leftScore;
            })
            .slice(0, 8);

          if (likelyOffenders.length > 0) {
            return likelyOffenders;
          }

          return [];
        }

        function measureContentBounds(contentSummaries) {
          if (contentSummaries.length === 0) {
            return {
              right: 0,
              bottom: 0,
            };
          }

          return contentSummaries.reduce(
            (current, element) => ({
              right: Math.max(current.right, element.right),
              bottom: Math.max(current.bottom, element.bottom),
            }),
            {
              right: 0,
              bottom: 0,
            },
          );
        }

        function resolveTextLayoutRole(element) {
          const blockKind = element.getAttribute("data-html-block-kind");
          if (blockKind === "headline") return "headline";
          if (blockKind === "heading" || /^H[2-6]$/.test(element.tagName)) return "heading";
          if (blockKind === "eyebrow" || blockKind === "paragraph" || element.tagName === "P") {
            return "paragraph";
          }
          if (blockKind === "list" || element.matches("ul,ol")) return "list";
          if (element.tagName === "H1") return "title";

          const visualKind = element.getAttribute("data-html-visual-kind");
          if (visualKind === "annotation") return "annotation";
          if (visualKind === "rail") return "rail";
          if (visualKind === "badge") return "badge";
          if (element.matches("button")) return "button";
          if (element.matches("label")) return "label";
          return "unknown";
        }

        function resolveTextMeasurementSelector(element) {
          const blockId = element.getAttribute("data-html-block-id");
          if (blockId) return '[data-html-block-id="' + blockId + '"]';
          const visualId = element.getAttribute("data-html-visual-id");
          if (visualId) return '[data-html-visual-id="' + visualId + '"]';
          const layoutId = element.getAttribute("data-html-layout-id");
          if (layoutId) return '[data-html-layout-id="' + layoutId + '"]';
          if (element.id) return "#" + element.id;
          return element.tagName.toLowerCase();
        }

        function measureTextElement(element) {
          if (!(element instanceof HTMLElement)) {
            return null;
          }
          const rect = element.getBoundingClientRect();
          const width = Math.max(1, Math.round(rect.width));
          const actualHeight = Math.max(
            Math.round(rect.height),
            Math.round(element.scrollHeight || 0),
            Math.round(element.offsetHeight || 0),
          );
          if (!width || !actualHeight) {
            return null;
          }

          const computed = window.getComputedStyle(element);
          const fontSize = Number.parseFloat(computed.fontSize || "") || 16;
          const lineHeight = Number.parseFloat(computed.lineHeight || "") || fontSize * 1.2;
          const role = resolveTextLayoutRole(element);
          const items = role === "list"
            ? Array.from(element.querySelectorAll(":scope li"))
                .map((item) => normalize(item.textContent))
                .filter(Boolean)
            : [];
          const text = role === "list"
            ? items.join("\n")
            : normalize(element.innerText || element.textContent || "");
          if (!text) {
            return null;
          }

          const predictedLineCount = Math.max(1, Math.round(actualHeight / Math.max(1, lineHeight)));
          const predictedHeight = Math.max(1, Math.round(predictedLineCount * lineHeight));
          const heightDelta = predictedHeight - Math.round(rect.height);
          const overflowRisk =
            element.scrollHeight > rect.height + 8 || heightDelta > 8
              ? "overflow"
              : element.scrollHeight > rect.height || heightDelta > -2
                ? "tight"
                : "none";

          return {
            blockId: element.getAttribute("data-html-block-id"),
            layoutId: element.getAttribute("data-html-layout-id"),
            selector: resolveTextMeasurementSelector(element),
            role,
            width,
            fontSize,
            lineHeight,
            predictedHeight,
            predictedLineCount,
            actualHeight,
            tightWidth: width,
            overflowRisk,
            textPreview: normalize(text).slice(0, 140) || null,
          };
        }

        function formatTextOverflowRoot(measurement) {
          const anchors = [
            measurement.blockId ? "block=" + measurement.blockId : null,
            measurement.layoutId ? "layout=" + measurement.layoutId : null,
            measurement.selector ? "selector=" + measurement.selector : null,
          ].filter(Boolean).join(", ");
          const preview = measurement.textPreview ? ' text="' + measurement.textPreview + '"' : "";
          return measurement.role + (anchors ? " {" + anchors + "}" : "") + preview;
        }

        function measurePageTextLayoutPrediction() {
          const measurements = [];
          const seen = new Set();
          const topLevelBlocks = Array.from(
            pageRoot.querySelectorAll("[data-html-block-id]"),
          ).filter((element) => !element.parentElement?.closest("[data-html-block-id]"));

          topLevelBlocks.forEach((element) => {
            const measurement = measureTextElement(element);
            if (measurement) {
              measurements.push(measurement);
              seen.add(element);
            }
          });

          const extraElements = Array.from(
            pageRoot.querySelectorAll(
              '[data-html-visual-kind="annotation"],[data-html-visual-kind="rail"],[data-html-visual-kind="badge"],h1,h2,h3,h4,h5,h6,p,button,label',
            ),
          );
          extraElements.forEach((element) => {
            if (seen.has(element) || element.closest("[data-html-block-id]")) {
              return;
            }
            const measurement = measureTextElement(element);
            if (!measurement) {
              return;
            }
            seen.add(element);
            measurements.push(measurement);
          });

          const rankedMeasurements = [...measurements].sort((left, right) => {
            const leftRisk = left.overflowRisk === "overflow" ? 2 : left.overflowRisk === "tight" ? 1 : 0;
            const rightRisk = right.overflowRisk === "overflow" ? 2 : right.overflowRisk === "tight" ? 1 : 0;
            if (leftRisk !== rightRisk) return rightRisk - leftRisk;
            return right.predictedLineCount - left.predictedLineCount;
          });
          const predictedOverflowRoots = rankedMeasurements
            .filter((measurement) => measurement.overflowRisk !== "none")
            .slice(0, 6)
            .map((measurement) => formatTextOverflowRoot(measurement));

          return {
            textMeasurements: measurements,
            predictedTextOverflow: predictedOverflowRoots.length > 0,
            predictedOverflowRoots,
          };
        }

        const semanticNodeElements = collectFitContentElements();
        const semanticSummaries = semanticNodeElements.map((element) => summarizeElement(element));
        const topLevelRegions = collectContentRegions(semanticSummaries);
        const suspectElements = collectSuspectElements(semanticSummaries);
        const contentBounds = measureContentBounds(semanticSummaries);
        const textLayoutPrediction = measurePageTextLayoutPrediction();
        const chartRegionCount = semanticNodeElements.filter(
          (element) => element.getAttribute("data-html-visual-kind") === "chart-frame",
        ).length;
        const textRoots = semanticNodeElements.filter((element) =>
          element.hasAttribute("data-html-block-id"),
        );
        const textCharacterCount = (
          (textRoots.length > 0 ? textRoots : [pageRoot])
            .map((element) => element.innerText || "")
            .join(" ")
        ).replace(/\s+/g, " ").trim().length;
        const promptScaffoldLeak = detectPromptScaffoldLeak(
          (textRoots.length > 0 ? textRoots : [pageRoot])
            .map((element) => element.innerText || "")
            .join(" "),
        );
        const semanticModuleCount = semanticNodeElements.length;
        const longestBlockHeight = semanticSummaries.reduce(
          (maxHeight, element) => Math.max(maxHeight, element.height),
          0,
        );
        const footerCandidates = topLevelRegions.filter(
          (element) => element.top >= pageHeight * 0.74 || element.bottom >= pageHeight - 90,
        );
        const footerHeight =
          footerCandidates.length > 0
            ? Math.max(...footerCandidates.map((element) => element.bottom)) -
              Math.min(...footerCandidates.map((element) => element.top))
            : 0;
        const rightRailCandidates = [...semanticSummaries, ...topLevelRegions].filter(
          (element) => element.left >= pageWidth * 0.58,
        );
        const rightRailHeight =
          rightRailCandidates.length > 0
            ? Math.max(...rightRailCandidates.map((element) => element.bottom)) -
              Math.min(...rightRailCandidates.map((element) => element.top))
            : 0;
        const denseGridCount = semanticSummaries.filter(
          (element) =>
            ["surface", "highlight", "annotation", "rail"].includes(element.kind) &&
            element.height >= 120,
        ).length;

        function inferColumnCount() {
          const candidateRegions = topLevelRegions
            .filter((element) => element.width >= 180 && element.height >= 80)
            .sort((left, right) => left.left - right.left);
          const anchors = [];
          for (const element of candidateRegions) {
            const existing = anchors.find((anchor) => Math.abs(anchor - element.left) <= 120);
            if (existing === undefined) {
              anchors.push(element.left);
            }
          }
          return Math.max(1, Math.min(4, anchors.length || 1));
        }

        function inferCompositionFingerprint() {
          const columnCount = inferColumnCount();
          const hasHero = semanticNodeElements.some((element) => {
            const tag = element.tagName.toLowerCase();
            const rect = element.getBoundingClientRect();
            return (tag === "h1" || tag === "h2") && rect.top <= pageHeight * 0.3 && rect.width >= pageWidth * 0.3;
          }) || semanticSummaries.some((element) => element.top <= pageHeight * 0.24 && element.width >= pageWidth * 0.45);
          const hasChart = chartRegionCount > 0;
          const hasRightRail = rightRailHeight >= pageHeight * 0.28;
          const hasFooter = footerHeight >= 120;
          const primaryEvidenceRegion = hasChart
            ? "chart"
            : denseGridCount >= 4
              ? "comparison"
              : semanticSummaries.filter((element) => ["metric", "badge", "surface", "highlight"].includes(element.kind)).length >= 3
                ? "metrics"
                : "text";
          const family = hasChart && hasRightRail
            ? "chart-rail"
            : hasChart && hasHero
              ? "hero-chart"
              : denseGridCount >= 4
                ? "comparison-split"
                : semanticSummaries.filter((element) => element.kind === "surface" && element.height >= 140).length >= 3 && columnCount >= 3
                  ? "sequence-grid"
                  : columnCount <= 1
                    ? "single-column"
                    : hasHero
                      ? "hero-proof"
                      : "mixed-editorial";

          return {
            family,
            columnCount,
            hasHero,
            hasChart,
            hasRightRail,
            hasFooter,
            primaryEvidenceRegion,
          };
        }

        function classifyDominantOverflowRegion() {
          if (promptLeak || promptScaffoldLeak || truncated || repeatedInstruction) {
            return "title";
          }
          if (chartRegionCount > 0 && rightRailHeight >= pageHeight * 0.34) {
            return "chart+sidebar";
          }
          if (
            textCharacterCount >= 1800 &&
            longestBlockHeight >= pageHeight * 0.32 &&
            semanticSummaries.some((element) => element.top <= pageHeight * 0.32)
          ) {
            return "hero-copy";
          }
          if (denseGridCount >= 4) {
            return "comparison-grid";
          }
          if (footerHeight >= 160) {
            return "footer/appendix";
          }
          return "mixed-density";
        }

        const measurement = {
          pageNumber: ${pageNumber},
          scrollHeight: contentBounds.bottom,
          clientHeight: pageHeight,
          scrollWidth: contentBounds.right,
          clientWidth: pageWidth,
          overflowX: contentBounds.right > pageWidth + 2,
          overflowY: contentBounds.bottom > pageHeight + 2,
          semanticModuleCount,
          textCharacterCount,
          chartRegionCount,
          dominantOverflowRegion: classifyDominantOverflowRegion(),
          footerHeight,
          rightRailHeight,
          longestBlockHeight,
          textMeasurements: textLayoutPrediction.textMeasurements,
          predictedTextOverflow: textLayoutPrediction.predictedTextOverflow,
          predictedOverflowRoots: textLayoutPrediction.predictedOverflowRoots,
          topLevelRegions,
          suspectElements,
          compositionFingerprint: inferCompositionFingerprint(),
          pageTitleQuality: {
            title: titleText,
            promptLeak: promptLeak || promptScaffoldLeak,
            truncated,
            repeatedInstruction,
            reason:
              promptLeak
                ? genericTitle
                  ? "title is a generic internal placeholder"
                  : "title looks like leaked prompt text"
                : promptScaffoldLeak
                  ? "visible page text contains workspace scaffold labels"
                : truncated
                  ? "title appears truncated"
                  : repeatedInstruction
                    ? "title repeats instruction language"
                    : null,
          },
        };

        window.parent.postMessage(
          {
            type: "ppt-html-preview-fit-report",
            measurement,
          },
          "*",
        );
      }

      reportPageOverflow();
      syncAnimationPlaybackState();
      window.addEventListener("resize", reportPageOverflow);
      document.addEventListener("visibilitychange", syncAnimationPlaybackState);
      window.addEventListener("pagehide", () => {
        previewViewportVisible = false;
        animationPlaybackActive = false;
        stopAnimationSession();
      });
      const pageRoot = document.querySelector("section.page");
      if (pageRoot) {
        const overflowObserver = new ResizeObserver(() => reportPageOverflow());
        overflowObserver.observe(pageRoot);
      }
    })();
  `;
  previewDocument.body.appendChild(previewScript);

  return previewDocument;
}

function buildStandaloneHtmlReportPageDocument(
  sourceDocument: Document,
  pageElement: Element,
  report: GeneratedHtmlReport,
  pageStructure: HtmlEditablePage | null,
  visualPage: HtmlVisualPage | null,
  layoutPage: HtmlLayoutPage | null,
  pageStyle: HtmlPageVisualStyle,
  pageNumber: number,
) {
  const previewDocument = buildHtmlReportPageDocument(
    sourceDocument,
    pageElement,
    report,
    pageStructure,
    visualPage,
    layoutPage,
    pageStyle,
    pageNumber,
    "preview",
  );
  return `<!DOCTYPE html>\n${previewDocument.documentElement.outerHTML}`;
}

function buildHtmlReportExportBundle(htmlReport: GeneratedHtmlReport) {
  if (typeof window === "undefined") {
    return {
      headMarkup: "",
      bodyAttributes: {} as Record<string, string>,
      pages: [
        {
          pageNumber: 1,
          title: htmlReport.pageTitles[0] ?? htmlReport.title,
          pageMarkup: htmlReport.html,
        },
      ] satisfies HtmlReportExportPage[],
    };
  }

  const parser = new window.DOMParser();
  const sourceDocument = parser.parseFromString(htmlReport.html, "text/html");
  const sourcePages = buildHtmlReportSourcePages(sourceDocument, htmlReport);

  if (sourcePages.length === 0) {
    const exportDocument = sourceDocument.implementation.createHTMLDocument(
      sourceDocument.title || htmlReport.title || "Report page",
    );
    exportDocument.head.innerHTML = sourceDocument.head.innerHTML;
    exportDocument.body.innerHTML = sourceDocument.body.innerHTML;
    cloneElementAttributes(sourceDocument.body, exportDocument.body);
    appendPageModeStyles(exportDocument, "export");

    return {
      headMarkup: exportDocument.head.innerHTML,
      bodyAttributes: collectElementAttributes(exportDocument.body),
      pages: [
        {
          pageNumber: 1,
          title: htmlReport.pageTitles[0] ?? htmlReport.title,
          pageMarkup: exportDocument.body.innerHTML,
        },
      ] satisfies HtmlReportExportPage[],
    };
  }

  const pages = sourcePages.map((page) => {
    const exportDocument = buildHtmlReportPageDocument(
      sourceDocument,
      page.pageElement,
      htmlReport,
      page.pageStructure,
      page.visualPage,
      page.layoutPage,
      page.pageStyle,
      page.pageNumber,
      "export",
    );

    return {
      pageNumber: page.pageNumber,
      title: page.title,
      pageMarkup: exportDocument.body.innerHTML,
    } satisfies HtmlReportExportPage;
  });

  const firstPageDocument = buildHtmlReportPageDocument(
    sourceDocument,
    sourcePages[0].pageElement,
    htmlReport,
    sourcePages[0].pageStructure,
    sourcePages[0].visualPage,
    sourcePages[0].layoutPage,
    sourcePages[0].pageStyle,
    sourcePages[0].pageNumber,
    "export",
  );

  return {
    headMarkup: firstPageDocument.head.innerHTML,
    bodyAttributes: collectElementAttributes(firstPageDocument.body),
    pages,
  };
}

function buildHtmlReportPagePreviews(htmlReport: GeneratedHtmlReport): HtmlReportPagePreview[] {
  if (typeof window === "undefined") {
    return Array.from({ length: htmlReport.pageCount }, (_, index) => ({
      pageNumber: index + 1,
      title: htmlReport.pageTitles[index] ?? `Page ${index + 1}`,
      srcDoc: htmlReport.html,
      pageStructure: htmlReport.structure?.pages[index] ?? null,
      visualPage: htmlReport.visualStructure?.pages[index] ?? null,
      layoutPage: htmlReport.layoutStructure?.pages[index] ?? null,
    }));
  }

  const parser = new window.DOMParser();
  const sourceDocument = parser.parseFromString(htmlReport.html, "text/html");
  const sourcePages = buildHtmlReportSourcePages(sourceDocument, htmlReport);

  if (sourcePages.length === 0) {
    return [
      {
        pageNumber: 1,
        title: htmlReport.pageTitles[0] ?? htmlReport.title,
        srcDoc: htmlReport.html,
        pageStructure: htmlReport.structure?.pages[0] ?? null,
        visualPage: htmlReport.visualStructure?.pages[0] ?? null,
        layoutPage: htmlReport.layoutStructure?.pages[0] ?? null,
      },
    ];
  }

  return sourcePages.map((page) => {
    return {
      pageNumber: page.pageNumber,
      title: page.title,
      srcDoc: buildStandaloneHtmlReportPageDocument(
        sourceDocument,
        page.pageElement,
        htmlReport,
        page.pageStructure,
        page.visualPage,
        page.layoutPage,
        page.pageStyle,
        page.pageNumber,
      ),
      pageStructure: page.pageStructure,
      visualPage: page.visualPage,
      layoutPage: page.layoutPage,
    };
  });
}

export {
  HTML_REPORT_PAGE_HEIGHT,
  HTML_REPORT_PAGE_WIDTH,
  buildHtmlReportExportBundle,
  buildHtmlReportPagePreviews,
};
