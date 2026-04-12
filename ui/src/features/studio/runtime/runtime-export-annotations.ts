import {
  applyGeneratedHtmlReportCanvasOverridesToPage,
  HTML_REPORT_PAGE_HEIGHT,
  HTML_REPORT_PAGE_WIDTH,
} from "@/features/studio/html-report-canvas";
import { collectHtmlLayoutCandidates } from "@/features/studio/html-report-layout";
import { collectHtmlEditableCandidates } from "@/features/studio/html-report-structure";
import {
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

export type HtmlReportPagePreview = {
  pageNumber: number;
  title: string;
  srcDoc: string;
  pageStructure: HtmlEditablePage | null;
  visualPage: HtmlVisualPage | null;
  layoutPage: HtmlLayoutPage | null;
};

function cloneElementAttributes(source: Element, target: Element) {
  Array.from(source.attributes).forEach((attribute) => {
    target.setAttribute(attribute.name, attribute.value);
  });
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
  const previewDocument = document.implementation.createHTMLDocument(sourceDocument.title || "Report page");
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
  annotatePreviewPageBlocks(pageClone, pageStructure);
  annotatePreviewVisualNodes(pageClone, visualPage);
  annotatePreviewPageExportMetadata(pageClone, pageStyle);
  annotatePreviewVisualNodesForExport({
    pageElement: pageClone,
    visualPage,
    pageStyle,
  });
  annotatePreviewLayoutZones(pageClone, layoutPage);
  applyGeneratedHtmlReportCanvasOverridesToPage({
    pageElement: pageClone as HTMLElement,
    pageNumber,
    report,
  });
  mountPoint.appendChild(pageClone);

  const previewStyle = previewDocument.createElement("style");
  previewStyle.setAttribute("data-ppt-preview-style", "true");
  previewStyle.textContent = `
    html, body {
      margin: 0;
      padding: 0;
      width: ${HTML_REPORT_PAGE_WIDTH}px;
      min-width: ${HTML_REPORT_PAGE_WIDTH}px;
      background: #ece7df;
      overflow: hidden;
    }

    body {
      min-height: ${HTML_REPORT_PAGE_HEIGHT}px;
    }

    section.page {
      margin: 0 !important;
      box-shadow: none !important;
    }

    [data-html-block-id] {
      cursor: text;
      transition: box-shadow 120ms ease, background-color 120ms ease;
    }

    [data-html-canvas-placeholder="true"] {
      visibility: hidden !important;
      pointer-events: none !important;
      user-select: none !important;
    }

    [data-html-freeform="true"] {
      transform-origin: top left;
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

    [data-html-layout-id] {
      position: relative;
      outline: 1px solid transparent;
      outline-offset: 4px;
      transition: outline-color 120ms ease, box-shadow 120ms ease;
    }

    [data-html-layout-id]:hover {
      outline-color: rgba(198, 153, 74, 0.22);
      box-shadow: inset 0 0 0 1px rgba(198, 153, 74, 0.12);
    }

    [data-html-layout-selected="true"] {
      outline-color: rgba(198, 153, 74, 0.52);
      box-shadow: inset 0 0 0 1px rgba(198, 153, 74, 0.22);
    }
  `;
  previewDocument.head.appendChild(previewStyle);

  const previewScript = previewDocument.createElement("script");
  previewScript.textContent = `
    (() => {
      const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim();
      let activeTransformPreview = null;

      function getPageRoot() {
        return document.querySelector("section.page");
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
            element.getAttribute("data-html-transform-preview-placeholder") !== "true",
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
            activeTransformPreview.previewElement.remove();
            if (activeTransformPreview.target === "block") {
              activeTransformPreview.sourceElement.setAttribute(
                "data-html-block-id",
                activeTransformPreview.id,
              );
              if (activeTransformPreview.originalBlockKind) {
                activeTransformPreview.sourceElement.setAttribute(
                  "data-html-block-kind",
                  activeTransformPreview.originalBlockKind,
                );
              }
            } else {
              activeTransformPreview.sourceElement.setAttribute(
                "data-html-visual-id",
                activeTransformPreview.id,
              );
              if (activeTransformPreview.originalVisualKind) {
                activeTransformPreview.sourceElement.setAttribute(
                  "data-html-visual-kind",
                  activeTransformPreview.originalVisualKind,
                );
              }
            }
            activeTransformPreview.sourceElement.removeAttribute(
              "data-html-transform-preview-placeholder",
            );
            activeTransformPreview.sourceElement.style.visibility =
              activeTransformPreview.originalSourceStyles.visibility;
            activeTransformPreview.sourceElement.style.pointerEvents =
              activeTransformPreview.originalSourceStyles.pointerEvents;
            activeTransformPreview.sourceElement.style.userSelect =
              activeTransformPreview.originalSourceStyles.userSelect;
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
            const previewElement = sourceElement.cloneNode(true);
            if (!(previewElement instanceof HTMLElement)) {
              return;
            }

            const originalBlockKind = sourceElement.getAttribute("data-html-block-kind");
            const originalVisualKind = sourceElement.getAttribute("data-html-visual-kind");
            const originalSourceStyles = {
              visibility: sourceElement.style.visibility || "",
              pointerEvents: sourceElement.style.pointerEvents || "",
              userSelect: sourceElement.style.userSelect || "",
            };

            if (targetType === "block") {
              sourceElement.removeAttribute("data-html-block-id");
              sourceElement.removeAttribute("data-html-block-kind");
              previewElement.setAttribute("data-html-block-id", targetId);
              if (originalBlockKind) {
                previewElement.setAttribute("data-html-block-kind", originalBlockKind);
              }
            } else {
              sourceElement.removeAttribute("data-html-visual-id");
              sourceElement.removeAttribute("data-html-visual-kind");
              previewElement.setAttribute("data-html-visual-id", targetId);
              if (originalVisualKind) {
                previewElement.setAttribute("data-html-visual-kind", originalVisualKind);
              }
            }

            sourceElement.setAttribute("data-html-transform-preview-placeholder", "true");
            sourceElement.style.visibility = "hidden";
            sourceElement.style.pointerEvents = "none";
            sourceElement.style.userSelect = "none";

            previewElement.setAttribute("data-html-freeform", "true");
            previewElement.setAttribute("data-html-canvas-target", targetType);
            previewElement.setAttribute("data-html-canvas-source-id", targetId);
            previewRoot.appendChild(previewElement);

            activeTransformPreview = {
              target: targetType,
              id: targetId,
              committed: false,
              usedExistingElement: false,
              sourceElement,
              previewElement,
              originalBlockKind,
              originalVisualKind,
              originalSourceStyles,
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

      function collectSelectableCandidates(target, clientX, clientY) {
        if (!(target instanceof Element)) {
          return [];
        }

        const pageRoot = document.querySelector("section.page");
        const candidates = [];
        const seen = new Set();
        const pointTargets = Number.isFinite(clientX) && Number.isFinite(clientY)
          ? document.elementsFromPoint(clientX, clientY)
          : [];
        const seeds = [target, ...pointTargets].filter(
          (element, index, list) =>
            element instanceof Element &&
            list.findIndex((candidate) => candidate === element) === index,
        );

        seeds.forEach((seed, layerIndex) => {
          let current = seed;
          let depth = 0;

          while (current && current instanceof Element) {
            if (pageRoot && current === pageRoot.parentElement) {
              break;
            }

            const isPlaceholder =
              current.getAttribute("data-html-canvas-placeholder") === "true" ||
              current.getAttribute("data-html-transform-preview-placeholder") === "true";
            const isDecorative = current.getAttribute("data-export-role") === "decorative";
            if (isPlaceholder || isDecorative) {
              current = current.parentElement;
              depth += 1;
              continue;
            }

            const rect = current.getBoundingClientRect();
            const area = Math.max(1, rect.width * rect.height);

            const blockId = current.getAttribute("data-html-block-id");
            const blockKind = current.getAttribute("data-html-block-kind");
            if (blockId && blockKind && !seen.has("block:" + blockId)) {
              candidates.push({
                type: "block",
                element: current,
                depth,
                area,
                layerIndex,
                blockId,
                blockKind,
              });
              seen.add("block:" + blockId);
            }

            const visualNodeId = current.getAttribute("data-html-visual-id");
            const visualKind = current.getAttribute("data-html-visual-kind");
            if (visualNodeId && visualKind && !seen.has("visual:" + visualNodeId)) {
              candidates.push({
                type: "visual",
                element: current,
                depth,
                area,
                layerIndex,
                visualNodeId,
                visualKind,
              });
              seen.add("visual:" + visualNodeId);
            }

            const layoutZoneId = current.getAttribute("data-html-layout-id");
            const layoutKind = current.getAttribute("data-html-layout-kind");
            if (layoutZoneId && layoutKind && !seen.has("layout:" + layoutZoneId)) {
              candidates.push({
                type: "layout",
                element: current,
                depth,
                area,
                layerIndex,
                layoutZoneId,
                layoutKind,
              });
              seen.add("layout:" + layoutZoneId);
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

      function chooseSelectableCandidate(target, preferredType, clientX, clientY) {
        const candidates = collectSelectableCandidates(target, clientX, clientY);
        const rank = { block: 0, visual: 1, layout: 2 };
        const filtered = preferredType
          ? candidates.filter((candidate) => candidate.type === preferredType)
          : candidates;
        const pool = filtered.length > 0 ? filtered : candidates;
        if (pool.length === 0) {
          return null;
        }

        return [...pool].sort((left, right) => {
          if (!preferredType && rank[left.type] !== rank[right.type]) {
            return rank[left.type] - rank[right.type];
          }
          if (left.depth !== right.depth) {
            return left.depth - right.depth;
          }
          const leftFreeform = left.element.getAttribute("data-html-freeform") === "true" ? 0 : 1;
          const rightFreeform = right.element.getAttribute("data-html-freeform") === "true" ? 0 : 1;
          if (leftFreeform !== rightFreeform) {
            return leftFreeform - rightFreeform;
          }
          if (left.layerIndex !== right.layerIndex) {
            return left.layerIndex - right.layerIndex;
          }
          return left.area - right.area;
        })[0];
      }

      function buildBlockPayload(blockCandidate) {
        const blockElement = blockCandidate.element;
        const rect = blockElement.getBoundingClientRect();
        const computed = window.getComputedStyle(blockElement);
        const fontSize = Number.parseFloat(computed.fontSize || "");
        const lineHeight = Number.parseFloat(computed.lineHeight || "");
        const items = blockCandidate.blockKind === "list"
          ? Array.from(blockElement.querySelectorAll(":scope > li"))
              .map((item) => normalize(item.textContent))
              .filter(Boolean)
          : [];

        return {
          type: "ppt-html-preview-interaction",
          pageNumber: ${pageNumber},
          blockId: blockCandidate.blockId,
          blockKind: blockCandidate.blockKind,
          fontSize: Number.isFinite(fontSize) ? fontSize : undefined,
          fontFamily: computed.fontFamily || undefined,
          fontWeight: computed.fontWeight || undefined,
          fontStyle: computed.fontStyle || undefined,
          lineHeight: Number.isFinite(lineHeight) ? lineHeight : undefined,
          whiteSpace:
            computed.whiteSpace === "pre-wrap" || computed.whiteSpace === "pre-line"
              ? "pre-wrap"
              : "normal",
          text: normalize(blockElement.textContent),
          items,
          rect: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
          }
        };
      }

      function buildVisualPayload(visualCandidate) {
        const visualElement = visualCandidate.element;
        const rect = visualElement.getBoundingClientRect();
        return {
          type: "ppt-html-preview-interaction",
          pageNumber: ${pageNumber},
          visualNodeId: visualCandidate.visualNodeId,
          visualKind: visualCandidate.visualKind,
          rect: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
          }
        };
      }

      function applyLayoutPreview(layoutElement, splitPercent) {
        if (!(layoutElement instanceof HTMLElement)) return;

        const children = Array.from(layoutElement.children).filter((child) => child instanceof HTMLElement);
        if (children.length !== 2) return;

        const normalized = Math.max(28, Math.min(72, Math.round(splitPercent)));
        layoutElement.style.display = "grid";
        layoutElement.style.gridTemplateColumns = "minmax(0, " + normalized + "fr) minmax(0, " + (100 - normalized) + "fr)";
        layoutElement.style.alignItems = "start";
        children.forEach((child) => {
          child.style.minWidth = "0";
        });
        layoutElement.setAttribute("data-layout-split", String(normalized));
      }

      function buildLayoutPayload(layoutCandidate) {
        const layoutElement = layoutCandidate.element;
        const rect = layoutElement.getBoundingClientRect();
        const splitPercent = Number.parseFloat(layoutElement.getAttribute("data-layout-split") || "");

        return {
          type: "ppt-html-preview-interaction",
          pageNumber: ${pageNumber},
          layoutZoneId: layoutCandidate.layoutZoneId,
          layoutKind: layoutCandidate.layoutKind,
          splitPercent: Number.isFinite(splitPercent) ? splitPercent : 50,
          rect: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
          }
        };
      }

      document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const candidate = chooseSelectableCandidate(target, null, event.clientX, event.clientY);
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
            : candidate.type === "visual"
              ? buildVisualPayload(candidate)
              : buildLayoutPayload(candidate);
        window.parent.postMessage({ ...payload, action: "select" }, "*");
      }, true);

      document.addEventListener("dblclick", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const blockCandidate = chooseSelectableCandidate(
          target,
          "block",
          event.clientX,
          event.clientY,
        );
        if (blockCandidate) {
          event.preventDefault();
          event.stopPropagation();
          window.parent.postMessage({ ...buildBlockPayload(blockCandidate), action: "edit" }, "*");
          return;
        }

        const visualCandidate = chooseSelectableCandidate(
          target,
          "visual",
          event.clientX,
          event.clientY,
        );
        if (visualCandidate) {
          event.preventDefault();
          event.stopPropagation();
          window.parent.postMessage({ ...buildVisualPayload(visualCandidate), action: "inspect" }, "*");
          return;
        }

        const layoutCandidate = chooseSelectableCandidate(
          target,
          "layout",
          event.clientX,
          event.clientY,
        );
        if (!layoutCandidate) return;
        event.preventDefault();
        event.stopPropagation();
        window.parent.postMessage({ ...buildLayoutPayload(layoutCandidate), action: "select" }, "*");
      }, true);

      window.addEventListener("message", (event) => {
        if (!event.data || event.data.type !== "ppt-html-preview-command") {
          return;
        }

        if (event.data.pageNumber !== ${pageNumber}) {
          return;
        }

        if (event.data.action === "layout-preview") {
          const layoutZoneId = event.data.zoneId;
          const splitPercent = Number(event.data.splitPercent);
          if (!layoutZoneId || !Number.isFinite(splitPercent)) {
            return;
          }

          const layoutElement = document.querySelector('[data-html-layout-id="' + layoutZoneId + '"]');
          if (!layoutElement) {
            return;
          }

          applyLayoutPreview(layoutElement, splitPercent);
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
          const top = Math.max(0, Math.round(rect.top));
          const left = Math.max(0, Math.round(rect.left));
          const width = Math.max(0, Math.round(rect.width));
          const height = Math.max(0, Math.round(rect.height));
          const right = Math.max(0, Math.round(rect.right));
          const bottom = Math.max(0, Math.round(rect.bottom));
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
            top,
            left,
            width,
            height,
            right,
            bottom,
            overflowX: right > pageWidth + 2,
            overflowY: bottom > pageHeight + 2,
          };
        }

        function collectTopLevelRegions() {
          return Array.from(pageRoot.children)
            .slice(0, 16)
            .map((element) => summarizeElement(element));
        }

        function collectSuspectElements() {
          const semanticNodes = Array.from(
            pageRoot.querySelectorAll("[data-html-visual-kind], [data-html-block-id], [data-html-layout-id]"),
          );
          const semanticSuspects = semanticNodes
            .map((element) => summarizeElement(element))
            .filter((element) => element.overflowX || element.overflowY)
            .slice(0, 16);

          if (semanticSuspects.length > 0) {
            return semanticSuspects;
          }

          const likelyOffenders = semanticNodes
            .map((element) => summarizeElement(element))
            .sort((left, right) => {
              const rightScore = right.height + Math.max(0, right.bottom - pageHeight);
              const leftScore = left.height + Math.max(0, left.bottom - pageHeight);
              return rightScore - leftScore;
            })
            .slice(0, 8);

          if (likelyOffenders.length > 0) {
            return likelyOffenders;
          }

          return collectTopLevelRegions()
            .filter((element) => element.overflowX || element.overflowY)
            .slice(0, 8);
        }

        const semanticNodeElements = Array.from(
          pageRoot.querySelectorAll("[data-html-visual-kind], [data-html-block-id], [data-html-layout-id]"),
        );
        const semanticSummaries = semanticNodeElements.map((element) => summarizeElement(element));
        const topLevelRegions = collectTopLevelRegions();
        const suspectElements = collectSuspectElements();
        const chartRegionCount = pageRoot.querySelectorAll('[data-html-visual-kind="chart-frame"]').length;
        const textCharacterCount = pageRoot.innerText.replace(/\s+/g, " ").trim().length;
        const promptScaffoldLeak = detectPromptScaffoldLeak(pageRoot.innerText || "");
        const semanticModuleCount = semanticSummaries.length;
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
          scrollHeight: pageRoot.scrollHeight,
          clientHeight: pageHeight,
          scrollWidth: pageRoot.scrollWidth,
          clientWidth: pageWidth,
          overflowX: pageRoot.scrollWidth > pageWidth + 2,
          overflowY: pageRoot.scrollHeight > pageHeight + 2,
          semanticModuleCount,
          textCharacterCount,
          chartRegionCount,
          dominantOverflowRegion: classifyDominantOverflowRegion(),
          footerHeight,
          rightRailHeight,
          longestBlockHeight,
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
      window.addEventListener("resize", reportPageOverflow);
      const pageRoot = document.querySelector("section.page");
      if (pageRoot) {
        const overflowObserver = new ResizeObserver(() => reportPageOverflow());
        overflowObserver.observe(pageRoot);
      }
    })();
  `;
  previewDocument.body.appendChild(previewScript);

  return `<!DOCTYPE html>\n${previewDocument.documentElement.outerHTML}`;
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
  const pageElements = Array.from(sourceDocument.querySelectorAll("section.page"));

  if (pageElements.length === 0) {
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

  return pageElements.map((pageElement, index) => {
    const pageNumber = index + 1;
    const pageStructure = htmlReport.structure?.pages[index] ?? null;
    const visualPage = htmlReport.visualStructure?.pages[index] ?? null;
    const layoutPage = htmlReport.layoutStructure?.pages[index] ?? null;
    const pageStyle = extractHtmlPageVisualStyle({
      report: htmlReport,
      pageNumber,
    });
    const title =
      pageElement.getAttribute("data-page-title")?.trim() ||
      htmlReport.pageTitles[index] ||
      `Page ${pageNumber}`;

    return {
      pageNumber,
      title,
      srcDoc: buildStandaloneHtmlReportPageDocument(
        sourceDocument,
        pageElement,
        htmlReport,
        pageStructure,
        visualPage,
        layoutPage,
        pageStyle,
        pageNumber,
      ),
      pageStructure,
      visualPage,
      layoutPage,
    };
  });
}

export {
  HTML_REPORT_PAGE_HEIGHT,
  HTML_REPORT_PAGE_WIDTH,
  buildHtmlReportPagePreviews,
};
