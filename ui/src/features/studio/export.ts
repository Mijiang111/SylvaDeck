import {
  HTML_REPORT_PAGE_WIDTH,
  buildHtmlReportExportBundle,
} from "@/features/studio/runtime/runtime-export-annotations";
import type { GeneratedHtmlReport } from "@/features/studio/types";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function createFileName(projectName: string, extension: "html") {
  const base = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${base || "published-report"}.${extension}`;
}

function buildStandaloneHtml(args: {
  htmlReport: GeneratedHtmlReport;
  projectName: string;
  publishedUrl: string;
}) {
  const exportBundle = buildHtmlReportExportBundle(args.htmlReport);
  const escapedTitle = escapeHtml(args.projectName);
  const escapedUrl = escapeHtml(args.publishedUrl);
  const bodyAttributes = Object.entries(exportBundle.bodyAttributes)
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
    .join(" ");
  const exportPages = exportBundle.pages
    .map(
      (page) => `
    <section class="export-page-shell" data-export-page-number="${page.pageNumber}" aria-label="Page ${page.pageNumber}: ${escapeAttribute(page.title)}">
      ${page.pageMarkup}
    </section>`,
    )
    .join("\n");

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    exportBundle.headMarkup,
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapedTitle}</title>`,
    '<meta name="generator" content="PPT Studio" />',
    `<meta name="source" content="${escapedUrl}" />`,
    "<style>",
    [
      "html, body { margin: 0; min-height: 100%; background: #ddd9d3; }",
      "body { min-height: 100vh; }",
      ".export-shell { min-height: 100vh; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; gap: 32px; padding: 32px 24px 48px; }",
      `.export-page-shell { width: min(${HTML_REPORT_PAGE_WIDTH}px, calc(100vw - 48px)); overflow-x: auto; overflow-y: hidden; }`,
      `.export-page-shell > * { width: ${HTML_REPORT_PAGE_WIDTH}px; }`,
    ].join("\n"),
    "</style>",
    "</head>",
    `<body${bodyAttributes ? ` ${bodyAttributes}` : ""}>`,
    `<div class="export-shell">${exportPages}</div>`,
    "</body>",
    "</html>",
  ].join("\n");
}

export function downloadPublishedHtml(args: {
  document: Document;
  htmlReport: GeneratedHtmlReport;
  projectName: string;
  publishedUrl: string;
}) {
  const html = buildStandaloneHtml({
    htmlReport: args.htmlReport,
    projectName: args.projectName,
    publishedUrl: args.publishedUrl,
  });

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = args.document.createElement("a");
  anchor.href = url;
  anchor.download = createFileName(args.projectName, "html");
  args.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}
