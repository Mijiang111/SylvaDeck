import {
  removeGeneratedHtmlReportCanvasBlockTransform,
  removeGeneratedHtmlReportCanvasVisualTransform,
  shiftGeneratedHtmlReportCanvasBlockLayer,
  shiftGeneratedHtmlReportCanvasVisualLayer,
  updateGeneratedHtmlReportCanvasBlockTransform,
  updateGeneratedHtmlReportCanvasVisualTransform,
} from "../html-report-canvas";
import { updateGeneratedHtmlReportBlock } from "../html-report-structure";
import type { GeneratedHtmlReport, HtmlCanvasFrame } from "../types";
import type { HtmlEditorCommandTarget } from "./editor-commands";

type HtmlEditorTextTarget = Extract<HtmlEditorCommandTarget, { kind: "text" }>;
type HtmlEditorVisualTarget = Extract<HtmlEditorCommandTarget, { kind: "visual" }>;
type HtmlEditorCanvasTarget = HtmlEditorTextTarget | HtmlEditorVisualTarget;

function normalizeFontSize(fontSize: number | undefined) {
  return typeof fontSize === "number" && Number.isFinite(fontSize) && fontSize > 0
    ? Math.round(fontSize)
    : undefined;
}

export function applyHtmlEditorTextCanvasTransform(args: {
  report: GeneratedHtmlReport;
  target: HtmlEditorTextTarget;
  frame: HtmlCanvasFrame;
  fontSize?: number;
}) {
  const fontSize = normalizeFontSize(args.fontSize);
  const baseReport =
    typeof fontSize === "number"
      ? updateGeneratedHtmlReportBlock({
          report: args.report,
          pageNumber: args.target.pageNumber,
          blockId: args.target.blockId,
          fontSize,
        })
      : args.report;

  return updateGeneratedHtmlReportCanvasBlockTransform({
    report: baseReport,
    pageNumber: args.target.pageNumber,
    id: args.target.blockId,
    frame: args.frame,
    fontSize,
  });
}

export function applyHtmlEditorVisualCanvasTransform(args: {
  report: GeneratedHtmlReport;
  target: HtmlEditorVisualTarget;
  frame: HtmlCanvasFrame;
}) {
  return updateGeneratedHtmlReportCanvasVisualTransform({
    report: args.report,
    pageNumber: args.target.pageNumber,
    id: args.target.nodeId,
    frame: args.frame,
  });
}

export function returnHtmlEditorCanvasTargetToFlow(args: {
  report: GeneratedHtmlReport;
  target: HtmlEditorCanvasTarget;
}) {
  if (args.target.kind === "text") {
    return removeGeneratedHtmlReportCanvasBlockTransform({
      report: args.report,
      pageNumber: args.target.pageNumber,
      id: args.target.blockId,
    });
  }

  return removeGeneratedHtmlReportCanvasVisualTransform({
    report: args.report,
    pageNumber: args.target.pageNumber,
    id: args.target.nodeId,
  });
}

export function shiftHtmlEditorCanvasTargetLayer(args: {
  report: GeneratedHtmlReport;
  target: HtmlEditorCanvasTarget;
  direction: "forward" | "backward";
  frame: HtmlCanvasFrame;
  fontSize?: number;
}) {
  if (args.target.kind === "text") {
    return shiftGeneratedHtmlReportCanvasBlockLayer({
      report: args.report,
      pageNumber: args.target.pageNumber,
      id: args.target.blockId,
      direction: args.direction,
      frame: args.frame,
      fontSize: normalizeFontSize(args.fontSize),
    });
  }

  return shiftGeneratedHtmlReportCanvasVisualLayer({
    report: args.report,
    pageNumber: args.target.pageNumber,
    id: args.target.nodeId,
    direction: args.direction,
    frame: args.frame,
  });
}
