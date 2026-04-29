import { canonicalizeDataBackedModulesOnPage } from "@/features/studio/html-report-data-modules";
import { waitForRenderableSurface } from "@/features/studio/runtime/studio/export";

export type ExportPageFrame = {
  iframe: HTMLIFrameElement;
  document: Document;
  pageElement: HTMLElement;
  pageNumber: number;
};

function isHtmlElementNode(value: unknown): value is HTMLElement {
  return Boolean(value) && typeof value === "object" && (value as Node).nodeType === 1;
}

async function waitForFrameReady(iframe: HTMLIFrameElement) {
  await new Promise<void>((resolve) => {
    if (iframe.contentDocument?.readyState === "complete") {
      resolve();
      return;
    }
    const timeout = window.setTimeout(resolve, 1400);
    iframe.addEventListener(
      "load",
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });

  if (iframe.contentDocument) {
    await waitForRenderableSurface(iframe.contentDocument);
  }
}

export async function collectRenderedExportPageFrames(reportRoot: HTMLElement) {
  const frames = Array.from(
    reportRoot.querySelectorAll<HTMLIFrameElement>("[data-ppt-export-page-frame]"),
  ).sort((left, right) => {
    const leftPage = Number.parseInt(left.getAttribute("data-ppt-export-page-frame") ?? "", 10);
    const rightPage = Number.parseInt(right.getAttribute("data-ppt-export-page-frame") ?? "", 10);
    return leftPage - rightPage;
  });
  await Promise.all(frames.map((frame) => waitForFrameReady(frame)));

  return frames
    .map((iframe) => {
      const pageNumber = Number.parseInt(iframe.getAttribute("data-ppt-export-page-frame") ?? "", 10);
      const document = iframe.contentDocument;
      const pageElement = document?.querySelector("section.page");
      if (!Number.isFinite(pageNumber) || pageNumber < 1 || !document || !isHtmlElementNode(pageElement)) {
        return null;
      }
      canonicalizeDataBackedModulesOnPage(pageElement);

      return {
        iframe,
        document,
        pageElement,
        pageNumber,
      } satisfies ExportPageFrame;
    })
    .filter((frame): frame is ExportPageFrame => Boolean(frame));
}
