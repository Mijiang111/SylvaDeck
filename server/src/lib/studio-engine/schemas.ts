import { z } from "zod";

export const agentConfigSchema = z.object({
  command: z.string().max(240).optional().default(""),
  model: z.string().max(240).optional().default(""),
  cwd: z.string().max(600).optional().default(""),
});

export const blockKindSchema = z.enum([
  "metrics",
  "bars",
  "line",
  "matrix",
  "flow",
  "gantt",
  "phases",
]);

export const moduleChartKindSchema = z.enum(["bar", "stacked", "line", "waterfall"]);
export const repairModeSchema = z.enum(["standard", "aggressive"]);
export const generationModeSchema = z.enum(["standard", "long-form"]);
export const moduleUsageModeSchema = z.enum(["disabled", "fallback", "chart-only"]);
export const pageOverflowCauseSchema = z.enum([
  "title",
  "hero-copy",
  "chart+sidebar",
  "comparison-grid",
  "footer/appendix",
  "mixed-density",
]);

const templateGeometrySchema = z.object({
  x: z.number().min(0).max(10_000),
  y: z.number().min(0).max(10_000),
  w: z.number().min(0).max(10_000),
  h: z.number().min(0).max(10_000),
});

const publishedTemplateSlotManifestSchema = z.object({
  slotId: z.string().min(1).max(120),
  label: z.string().min(1).max(120),
  slotKind: z.enum(["ai-text", "chart", "data-summary"]).optional(),
  role: z.string().min(1).max(160),
  required: z.boolean().optional().default(false),
  canHide: z.boolean().optional().default(true),
  objectKind: z.string().max(80).optional(),
  outputFormat: z.enum(["point", "bullets", "comparison", "chart"]).optional(),
  outputGoal: z.string().max(260).optional(),
  chartKind: moduleChartKindSchema.optional(),
  geometry: templateGeometrySchema.optional(),
  visualWeight: z.enum(["primary", "secondary", "supporting"]).optional().default("supporting"),
  contentBudget: z.array(z.string().max(180)).max(4).optional().default([]),
});

const publishedTemplateDecorativeManifestSchema = z.object({
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(120),
  kind: z.enum(["locked-text", "rectangle", "square", "circle", "line"]),
  role: z.string().min(1).max(160),
  geometry: templateGeometrySchema.optional(),
  style: z
    .object({
      fill: z.string().max(80).optional(),
      stroke: z.string().max(80).optional(),
      strokeWidth: z.number().min(0).max(32).optional(),
      strokeStyle: z.enum(["solid", "dashed"]).optional(),
      radius: z.enum(["none", "soft", "round"]).optional(),
      textAlign: z.enum(["left", "center", "right"]).optional(),
      rotation: z.number().min(-180).max(180).optional(),
    })
    .optional(),
});

const publishedTemplateManifestSchema = z.object({
  templateId: z.string().min(1).max(160),
  sourceModuleId: z.string().min(1).max(160),
  label: z.string().min(1).max(160),
  family: z.enum(["primitive", "framework", "story-pattern"]),
  shape: z
    .enum([
      "page-template",
      "poster-claim",
      "center-stage-figure",
      "vertical-story-strip",
      "single-proof-canvas",
      "case-timeline",
      "evidence-wall",
      "annotation-stage",
      "module-fragment",
    ])
    .optional()
    .default("module-fragment"),
  frame: templateGeometrySchema.optional(),
  visualHierarchy: z.array(z.string().max(180)).max(8).optional().default([]),
  slotManifest: z.array(publishedTemplateSlotManifestSchema).max(20).optional().default([]),
  decorativeManifest: z
    .array(publishedTemplateDecorativeManifestSchema)
    .max(20)
    .optional()
    .default([]),
  copyBudget: z.array(z.string().max(220)).max(8).optional().default([]),
  allowedAdaptations: z.array(z.string().max(220)).max(8).optional().default([]),
  fitRules: z.array(z.string().max(220)).max(8).optional().default([]),
  promptContract: z.array(z.string().max(260)).max(8).optional().default([]),
});

export const publishedModuleManifestSchema = z.object({
  moduleId: z.string().min(1).max(160),
  kind: blockKindSchema,
  category: z.enum(["evidence", "comparison", "logic", "roadmap"]),
  status: z.enum(["stable", "beta", "experimental"]),
  label: z.string().min(1).max(160),
  semanticRole: z.string().min(1).max(320),
  promptHint: z.string().min(1).max(360),
  rendererCapabilities: z.array(z.string().max(120)).max(12).optional().default([]),
  supportedChartKinds: z.array(moduleChartKindSchema).max(4).optional().default([]),
  deterministicCapability: z
    .enum(["native", "flow", "hybrid", "fallback"])
    .optional()
    .default("fallback"),
  outputContractSummary: z.array(z.string().max(260)).max(12).optional().default([]),
  fieldManifest: z
    .array(
      z.object({
        fieldId: z.string().min(1).max(120),
        label: z.string().min(1).max(120),
        required: z.boolean().optional().default(false),
        objectKind: z.string().max(80).optional(),
        outputFormat: z.enum(["point", "bullets", "comparison", "chart"]).optional(),
        outputGoal: z.string().max(260).optional(),
        chartKind: moduleChartKindSchema.optional(),
      }),
    )
    .max(20)
    .optional()
    .default([]),
  publishCount: z.number().int().min(0).max(999).optional().default(0),
  lastPublishedAt: z.string().max(80).nullable().optional().default(null),
  hasPassingEvidence: z.boolean().optional().default(false),
  trustScore: z.number().min(0).max(1).optional().default(0),
  signature: z.string().min(1).max(600),
  template: publishedTemplateManifestSchema.optional(),
});

export const generateStudioReportRequestSchema = z
  .object({
    brief: z.string().min(1).max(120_000),
    pageCount: z.number().int().min(1).max(12).optional(),
    generationMode: generationModeSchema.optional().default("standard"),
    moduleUsageMode: moduleUsageModeSchema.optional().default("disabled"),
    agentConfig: agentConfigSchema.optional().default({}),
    publishedModules: z.array(publishedModuleManifestSchema).max(200).optional().default([]),
    moduleManifestSignature: z.string().max(10_000).optional().default(""),
  })
  .superRefine((payload, ctx) => {
    if (
      payload.generationMode === "long-form" &&
      payload.pageCount !== undefined &&
      (payload.pageCount < 10 || payload.pageCount > 12)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pageCount"],
        message: "Long-form mode requires pageCount between 10 and 12.",
      });
    }
  });

export const pageFitElementSchema = z.object({
  kind: z.string().max(120),
  role: z.string().max(120).optional().default(""),
  label: z.string().max(240),
  blockId: z.string().max(240).nullable().optional().default(null),
  layoutId: z.string().max(240).nullable().optional().default(null),
  visualKind: z.string().max(120).nullable().optional().default(null),
  selector: z.string().max(240).nullable().optional().default(null),
  textPreview: z.string().max(240).nullable().optional().default(null),
  top: z.number().min(0).max(10_000),
  left: z.number().min(0).max(10_000),
  width: z.number().min(0).max(10_000),
  height: z.number().min(0).max(10_000),
  bottom: z.number().min(0).max(10_000),
  right: z.number().min(0).max(10_000),
  overflowX: z.boolean().optional().default(false),
  overflowY: z.boolean().optional().default(false),
});

export const pageTitleQualitySchema = z.object({
  title: z.string().max(240).optional().default(""),
  promptLeak: z.boolean().optional().default(false),
  truncated: z.boolean().optional().default(false),
  repeatedInstruction: z.boolean().optional().default(false),
  reason: z.string().max(240).nullable().optional().default(null),
});

export const pageCompositionFingerprintSchema = z.object({
  family: z
    .enum([
      "hero-proof",
      "hero-chart",
      "chart-rail",
      "comparison-split",
      "sequence-grid",
      "single-column",
      "poster-claim",
      "center-stage-figure",
      "single-proof-canvas",
      "vertical-story-strip",
      "case-timeline",
      "annotation-stage",
      "evidence-wall",
      "asymmetric-proof-field",
      "mixed-editorial",
    ])
    .optional()
    .default("mixed-editorial"),
  columnCount: z.number().int().min(1).max(4).optional().default(1),
  hasHero: z.boolean().optional().default(false),
  hasChart: z.boolean().optional().default(false),
  hasRightRail: z.boolean().optional().default(false),
  hasFooter: z.boolean().optional().default(false),
  primaryEvidenceRegion: z
    .enum(["chart", "comparison", "metrics", "text"])
    .optional()
    .default("text"),
});

export const textLayoutMeasurementSchema = z.object({
  blockId: z.string().max(240).nullable().optional().default(null),
  layoutId: z.string().max(240).nullable().optional().default(null),
  selector: z.string().max(320).nullable().optional().default(null),
  role: z
    .enum([
      "title",
      "headline",
      "heading",
      "paragraph",
      "list",
      "annotation",
      "rail",
      "badge",
      "label",
      "button",
      "unknown",
    ])
    .optional()
    .default("unknown"),
  width: z.number().min(0).max(20_000),
  fontSize: z.number().min(0).max(2_000),
  lineHeight: z.number().min(0).max(2_000),
  predictedHeight: z.number().min(0).max(20_000),
  predictedLineCount: z.number().int().min(0).max(10_000),
  actualHeight: z.number().min(0).max(20_000),
  tightWidth: z.number().min(0).max(20_000),
  overflowRisk: z.enum(["none", "tight", "overflow"]).optional().default("none"),
  textPreview: z.string().max(240).nullable().optional().default(null),
});

export const pageFitMeasurementSchema = z.object({
  pageNumber: z.number().int().min(1).max(12),
  scrollHeight: z.number().min(0).max(20_000),
  clientHeight: z.number().min(0).max(20_000),
  scrollWidth: z.number().min(0).max(20_000),
  clientWidth: z.number().min(0).max(20_000),
  overflowX: z.boolean().optional().default(false),
  overflowY: z.boolean().optional().default(false),
  semanticModuleCount: z.number().int().min(0).max(400).optional().default(0),
  textCharacterCount: z.number().int().min(0).max(100_000).optional().default(0),
  chartRegionCount: z.number().int().min(0).max(40).optional().default(0),
  dominantOverflowRegion: pageOverflowCauseSchema.optional().default("mixed-density"),
  footerHeight: z.number().min(0).max(20_000).optional().default(0),
  rightRailHeight: z.number().min(0).max(20_000).optional().default(0),
  longestBlockHeight: z.number().min(0).max(20_000).optional().default(0),
  topLevelRegions: z.array(pageFitElementSchema).max(24).optional().default([]),
  suspectElements: z.array(pageFitElementSchema).max(24).optional().default([]),
  compositionFingerprint: pageCompositionFingerprintSchema.optional().default({
    family: "mixed-editorial",
    columnCount: 1,
    hasHero: false,
    hasChart: false,
    hasRightRail: false,
    hasFooter: false,
    primaryEvidenceRegion: "text",
  }),
  pageTitleQuality: pageTitleQualitySchema.optional().default({
    title: "",
    promptLeak: false,
    truncated: false,
    repeatedInstruction: false,
    reason: null,
  }),
  textMeasurements: z.array(textLayoutMeasurementSchema).max(160).optional().default([]),
  predictedTextOverflow: z.boolean().optional().default(false),
  predictedOverflowRoots: z.array(z.string().max(320)).max(16).optional().default([]),
});

export const reviseStudioReportRequestSchema = z.object({
  brief: z.string().min(1).max(120_000),
  report: z
    .object({
      title: z.string().min(1).max(240),
      html: z.string().min(1).max(800_000),
      pageCount: z.number().int().min(1).max(12),
      pageTitles: z.array(z.string().max(240)).max(12).optional().default([]),
    })
    .passthrough(),
  pageMeasurements: z.array(pageFitMeasurementSchema).min(1).max(12),
  repairMode: repairModeSchema.optional().default("standard"),
  generationMode: generationModeSchema.optional(),
  moduleUsageMode: moduleUsageModeSchema.optional().default("disabled"),
  requestedPageCount: z.number().int().min(1).max(12).nullable().optional().default(null),
  agentConfig: agentConfigSchema.optional().default({}),
  publishedModules: z.array(publishedModuleManifestSchema).max(200).optional().default([]),
  moduleManifestSignature: z.string().max(10_000).optional().default(""),
});

export const deckPlanSchema = z.object({
  title: z.string().min(1).max(220),
  pages: z
    .array(
      z.object({
        pageNumber: z.number().int().min(1).max(12),
        pageTitle: z.string().min(1).max(220),
        goal: z.string().min(1).max(700),
        story: z.string().max(700).optional().default(""),
      }),
    )
    .min(1)
    .max(12),
});

export const pageRecipePlanSchema = z.object({
  title: z.string().min(1).max(220),
  pages: z
    .array(
      z.object({
        pageNumber: z.number().int().min(1).max(12),
        pageTitle: z.string().min(1).max(220),
        objective: z.string().min(1).max(500),
        insight: z.string().min(1).max(500),
        pageClass: z
          .enum(["opening-core", "proof-analysis", "synthesis-support"])
          .optional(),
        compositionHint: z.string().max(240).optional().default(""),
        layout: z
          .enum(["hero-proof", "comparison", "chart-insight", "sequence", "decision"])
          .optional()
          .default("hero-proof"),
        desiredChartKind: z
          .enum(["none", "bar", "stacked", "line", "waterfall"])
          .optional()
          .default("none"),
        composite: z
          .enum(["none", "annotation-rail", "metric-strip", "decision-footer"])
          .optional()
          .default("none"),
        evidenceIds: z.array(z.string().max(80)).max(8).optional().default([]),
        moduleHints: z.array(z.string().max(160)).max(4).optional().default([]),
      }),
    )
    .min(1)
    .max(12),
});

export type GenerateStudioReportRequest = z.infer<typeof generateStudioReportRequestSchema>;
export type ReviseStudioReportRequest = z.infer<typeof reviseStudioReportRequestSchema>;
export type DeckPlan = z.infer<typeof deckPlanSchema>;
export type PublishedModuleManifest = z.infer<typeof publishedModuleManifestSchema>;
export type PageRecipePlan = z.infer<typeof pageRecipePlanSchema>;
export type PageFitMeasurement = z.infer<typeof pageFitMeasurementSchema>;
export type ModuleChartKind = z.infer<typeof moduleChartKindSchema>;
export type RepairMode = z.infer<typeof repairModeSchema>;
export type GenerationMode = z.infer<typeof generationModeSchema>;
export type ModuleUsageMode = z.infer<typeof moduleUsageModeSchema>;
export type PageOverflowCause = z.infer<typeof pageOverflowCauseSchema>;
export type PageCompositionFingerprint = z.infer<typeof pageCompositionFingerprintSchema>;
