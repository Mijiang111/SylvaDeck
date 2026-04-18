const HTML_REPORT_PAGE_RADIUS = 28;

function resolveCanvasPageViewportRadius(scale: number) {
  return Math.max(1, Math.round(HTML_REPORT_PAGE_RADIUS * scale));
}

export {
  HTML_REPORT_PAGE_RADIUS,
  resolveCanvasPageViewportRadius,
};
