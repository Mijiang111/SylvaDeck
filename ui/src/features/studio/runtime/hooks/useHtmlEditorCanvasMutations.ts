import { useCallback } from "react";
import type {
  GeneratedDraftAsset,
  GeneratedHtmlReport,
  HtmlCanvasFrame,
  WorkbenchProject,
} from "@/features/studio/types";
import {
  createHtmlEditorTextCanvasCommandTarget,
  createHtmlEditorVisualCanvasCommandTarget,
} from "../editor-commands";
import {
  applyHtmlEditorTextCanvasTransform,
  applyHtmlEditorVisualCanvasTransform,
  returnHtmlEditorCanvasTargetToFlow,
  shiftHtmlEditorCanvasTargetLayer,
} from "../editor-mutations";
import type { HtmlEditorSelectionObject } from "../editor-selection-model";
import type { WorkbenchStudioStore } from "../studio/store/shared";

type UpdateGeneratedDraft = WorkbenchStudioStore["updateGeneratedDraft"];

type CanvasMutationCommit = {
  htmlReport: GeneratedHtmlReport;
  label: string;
  scope: "text" | "visual";
  inspectorTab: "text" | "visual";
  statusLine: string;
};

export function useHtmlEditorCanvasMutations(args: {
  project: WorkbenchProject | null;
  activeSelection: HtmlEditorSelectionObject;
  updateGeneratedDraft: UpdateGeneratedDraft;
}) {
  const { activeSelection, project, updateGeneratedDraft } = args;

  const commitHtmlReport = useCallback(
    (commit: CanvasMutationCommit) => {
      if (!project?.generatedDraft) {
        return;
      }

      updateGeneratedDraft({
        generatedDraft: {
          ...project.generatedDraft,
          htmlReport: commit.htmlReport,
        } satisfies GeneratedDraftAsset,
        label: commit.label,
        scope: commit.scope,
        inspectorTab: commit.inspectorTab,
        statusLine: commit.statusLine,
      });
    },
    [project?.generatedDraft, updateGeneratedDraft],
  );

  const createTextTarget = useCallback(
    (pageNumber: number, blockId: string) =>
      createHtmlEditorTextCanvasCommandTarget({
        report: project?.generatedDraft?.htmlReport,
        pageNumber,
        blockId,
        fallbackPageTitle: activeSelection.pageTitle,
      }),
    [activeSelection.pageTitle, project?.generatedDraft?.htmlReport],
  );

  const createVisualTarget = useCallback(
    (pageNumber: number, nodeId: string) =>
      createHtmlEditorVisualCanvasCommandTarget({
        report: project?.generatedDraft?.htmlReport,
        pageNumber,
        nodeId,
        fallbackPageTitle: activeSelection.pageTitle,
      }),
    [activeSelection.pageTitle, project?.generatedDraft?.htmlReport],
  );

  const updateHtmlBlockTransformOnPage = useCallback(
    (
      pageNumber: number,
      blockId: string,
      frame: HtmlCanvasFrame,
      fontSize?: number,
    ) => {
      const report = project?.generatedDraft?.htmlReport;
      if (!report) {
        return;
      }

      commitHtmlReport({
        htmlReport: applyHtmlEditorTextCanvasTransform({
          report,
          target: createTextTarget(pageNumber, blockId),
          frame,
          fontSize,
        }),
        label: "Move text block",
        scope: "text",
        inspectorTab: "text",
        statusLine: "Moved the selected text block on the page canvas.",
      });
    },
    [commitHtmlReport, createTextTarget, project?.generatedDraft?.htmlReport],
  );

  const returnHtmlBlockToFlow = useCallback(
    (pageNumber: number, blockId: string) => {
      const report = project?.generatedDraft?.htmlReport;
      if (!report) {
        return;
      }

      commitHtmlReport({
        htmlReport: returnHtmlEditorCanvasTargetToFlow({
          report,
          target: createTextTarget(pageNumber, blockId),
        }),
        label: "Return text block to flow",
        scope: "text",
        inspectorTab: "text",
        statusLine: "Returned the selected text block to the page flow.",
      });
    },
    [commitHtmlReport, createTextTarget, project?.generatedDraft?.htmlReport],
  );

  const updateHtmlVisualTransformOnPage = useCallback(
    (pageNumber: number, nodeId: string, frame: HtmlCanvasFrame) => {
      const report = project?.generatedDraft?.htmlReport;
      if (!report) {
        return;
      }

      commitHtmlReport({
        htmlReport: applyHtmlEditorVisualCanvasTransform({
          report,
          target: createVisualTarget(pageNumber, nodeId),
          frame,
        }),
        label: "Move visual block",
        scope: "visual",
        inspectorTab: "visual",
        statusLine: "Moved the selected visual element on the page canvas.",
      });
    },
    [commitHtmlReport, createVisualTarget, project?.generatedDraft?.htmlReport],
  );

  const returnHtmlVisualToFlow = useCallback(
    (pageNumber: number, nodeId: string) => {
      const report = project?.generatedDraft?.htmlReport;
      if (!report) {
        return;
      }

      commitHtmlReport({
        htmlReport: returnHtmlEditorCanvasTargetToFlow({
          report,
          target: createVisualTarget(pageNumber, nodeId),
        }),
        label: "Return visual to flow",
        scope: "visual",
        inspectorTab: "visual",
        statusLine: "Returned the selected visual element to the page flow.",
      });
    },
    [commitHtmlReport, createVisualTarget, project?.generatedDraft?.htmlReport],
  );

  const shiftHtmlBlockCanvasLayer = useCallback(
    (
      pageNumber: number,
      blockId: string,
      direction: "forward" | "backward",
      frame: HtmlCanvasFrame,
      fontSize?: number,
    ) => {
      const report = project?.generatedDraft?.htmlReport;
      if (!report) {
        return;
      }

      commitHtmlReport({
        htmlReport: shiftHtmlEditorCanvasTargetLayer({
          report,
          target: createTextTarget(pageNumber, blockId),
          direction,
          frame,
          fontSize,
        }),
        label: direction === "forward" ? "Bring text block forward" : "Send text block backward",
        scope: "text",
        inspectorTab: "text",
        statusLine: "Adjusted the selected text block layer on the canvas.",
      });
    },
    [commitHtmlReport, createTextTarget, project?.generatedDraft?.htmlReport],
  );

  const shiftHtmlVisualCanvasLayer = useCallback(
    (
      pageNumber: number,
      nodeId: string,
      direction: "forward" | "backward",
      frame: HtmlCanvasFrame,
    ) => {
      const report = project?.generatedDraft?.htmlReport;
      if (!report) {
        return;
      }

      commitHtmlReport({
        htmlReport: shiftHtmlEditorCanvasTargetLayer({
          report,
          target: createVisualTarget(pageNumber, nodeId),
          direction,
          frame,
        }),
        label:
          direction === "forward" ? "Bring visual element forward" : "Send visual element backward",
        scope: "visual",
        inspectorTab: "visual",
        statusLine: "Adjusted the selected visual element layer on the canvas.",
      });
    },
    [commitHtmlReport, createVisualTarget, project?.generatedDraft?.htmlReport],
  );

  return {
    updateHtmlBlockTransformOnPage,
    returnHtmlBlockToFlow,
    updateHtmlVisualTransformOnPage,
    returnHtmlVisualToFlow,
    shiftHtmlBlockCanvasLayer,
    shiftHtmlVisualCanvasLayer,
  };
}
