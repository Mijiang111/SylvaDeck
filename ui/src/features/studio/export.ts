function collectAccessibleStyles(document: Document) {
  const chunks: string[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      for (const rule of Array.from(rules)) {
        chunks.push(rule.cssText);
      }
    } catch {
      continue;
    }
  }

  return chunks.join("\n");
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
  document: Document;
  projectName: string;
  reportMarkup: string;
  publishedUrl: string;
}) {
  const styles = collectAccessibleStyles(args.document);
  const escapedTitle = args.projectName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escapedUrl = args.publishedUrl
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapedTitle}</title>`,
    `<meta name="generator" content="PPT Studio" />`,
    `<meta name="source" content="${escapedUrl}" />`,
    "<style>",
    styles,
    "html, body { margin: 0; background: #ddd9d3; }",
    ".export-shell { min-height: 100vh; }",
    "</style>",
    "</head>",
    "<body>",
    `<div class="export-shell">${args.reportMarkup}</div>`,
    "</body>",
    "</html>",
  ].join("\n");
}

export function downloadPublishedHtml(args: {
  document: Document;
  reportRoot: HTMLElement;
  projectName: string;
  publishedUrl: string;
}) {
  const html = buildStandaloneHtml({
    document: args.document,
    projectName: args.projectName,
    reportMarkup: args.reportRoot.outerHTML,
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
