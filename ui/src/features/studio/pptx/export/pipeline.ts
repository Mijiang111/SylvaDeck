export type PptxExportPipelinePhase =
  | "collect"
  | "recognize"
  | "own"
  | "style"
  | "layout"
  | "render"
  | "patch"
  | "quality";

export type PptxExportPipelineBoundary = {
  phase: PptxExportPipelinePhase;
  owns: string[];
  forbids: string[];
  output: string;
};

export const PPTX_EXPORT_PIPELINE: readonly PptxExportPipelineBoundary[] = [
  {
    phase: "collect",
    owns: ["DOM facts", "frame readiness", "raw computed geometry"],
    forbids: ["semantic classification", "PowerPoint rendering decisions"],
    output: "ObservedDomSnapshot",
  },
  {
    phase: "recognize",
    owns: ["chart/table/matrix/text/shape candidates", "reason codes", "confidence"],
    forbids: ["style normalization", "z-order mutation", "node suppression"],
    output: "RecognitionPlan",
  },
  {
    phase: "own",
    owns: ["single-owner node claims", "suppression reasons", "duplicate prevention"],
    forbids: ["visual styling", "native chart XML generation"],
    output: "OwnershipPlan",
  },
  {
    phase: "style",
    owns: ["color tokens", "fills", "strokes", "fonts", "shadow tokens", "chart style contract"],
    forbids: ["native-vs-DOM recognition", "ownership changes"],
    output: "StyleSnapshot",
  },
  {
    phase: "layout",
    owns: ["slide bounds", "unit conversion", "canvas layer", "z-order"],
    forbids: ["semantic reclassification", "PPTX package mutation"],
    output: "LayoutPlan",
  },
  {
    phase: "render",
    owns: ["pptxgenjs object creation", "render-order traversal"],
    forbids: ["DOM access", "semantic inference", "package relationship lookup"],
    output: "PptxExportDocument",
  },
  {
    phase: "patch",
    owns: ["gradient/freeform XML", "package relationship resolution", "repair-risk XML validation"],
    forbids: ["DOM inspection", "layout ownership changes"],
    output: "PatchedPptxPackage",
  },
  {
    phase: "quality",
    owns: ["diagnostics", "repair-risk checks", "hidden/duplicate/package validation"],
    forbids: ["automatic visual redesign", "semantic ownership changes"],
    output: "QualityReport",
  },
] as const;

export const UNIVERSAL_PPTX_EXPORT_ALGORITHMS = [
  "DOM fact collection",
  "ownership graph",
  "color/theme normalization",
  "bounds and unit conversion",
  "canvas layer ordering",
  "visual chart snapshot preservation",
  "package relationship resolution",
  "quality validation",
] as const;

export const SPECIALIZED_PPTX_EXPORT_ADAPTERS = [
  "McKinsey chart spec adapter",
  "matrix-vs-table disambiguation",
  "SVG/div chart fallback detector",
  "bubble/waterfall/combo visual chart adapters",
  "hidden placeholder guard",
  "pressure fixture regressions",
] as const;

export function validatePptxExportPipelineBoundaries() {
  const seen = new Set<PptxExportPipelinePhase>();
  const errors: string[] = [];

  for (const boundary of PPTX_EXPORT_PIPELINE) {
    if (seen.has(boundary.phase)) {
      errors.push(`Duplicate PPTX export pipeline phase: ${boundary.phase}`);
    }
    seen.add(boundary.phase);
    if (!boundary.owns.length) {
      errors.push(`PPTX export pipeline phase ${boundary.phase} must own at least one responsibility.`);
    }
    if (!boundary.forbids.length) {
      errors.push(`PPTX export pipeline phase ${boundary.phase} must forbid at least one responsibility leak.`);
    }
    if (!boundary.output) {
      errors.push(`PPTX export pipeline phase ${boundary.phase} must declare a handoff output.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
