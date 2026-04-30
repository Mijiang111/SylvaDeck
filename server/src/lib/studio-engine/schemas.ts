import { z } from "zod";

export const agentConfigSchema = z.object({
  provider: z.enum(["cursor", "codex", "kimi"]).optional().default("codex"),
  command: z.string().max(240).optional().default(""),
  model: z.string().max(240).optional().default(""),
  cwd: z.string().max(600).optional().default(""),
  apiKey: z.string().max(500).optional().default(""),
  baseUrl: z.string().max(500).optional().default(""),
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
export const chartExhibitPresetSchema = z.enum([
  "auto",
  "headline-bars",
  "growth-line",
  "margin-bridge",
  "segment-mix",
  "combo-trend-bars",
]);
export const chartDensitySchema = z.enum(["hero", "peer", "sidecar"]);
export const pageCompositionPresetSchema = z.enum([
  "single-exhibit",
  "hero-sidecar",
  "two-panel-exhibit",
]);
export const repairModeSchema = z.enum(["standard", "aggressive"]);
export const generationModeSchema = z.enum(["standard", "long-form"]);
export const moduleUsageModeSchema = z.enum(["disabled", "fallback", "chart-only"]);
export const htmlOutputModeSchema = z.enum(["static", "animated-preview-js"]);
export const studioBridgeLaunchModeSchema = z.enum(["inject-and-generate", "inject-only"]);
export const htmlAnimationEntryPresetSchema = z.enum([
  "fade-up",
  "fade-in",
  "slide-right",
  "slide-left",
  "scale-in",
  "chart-reveal",
]);
export const htmlPageAnimationStartModeSchema = z.enum(["entry-then-loop"]);
export const htmlAnimationAnchorSchema = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
export const htmlEntryTrackSchema = z.object({
  anchor: htmlAnimationAnchorSchema,
  preset: htmlAnimationEntryPresetSchema,
  delayMs: z.number().int().min(0).max(4000),
  durationMs: z.number().int().min(160).max(10_000),
  order: z.number().int().min(0).max(40),
});
const htmlRotateLoopEffectSchema = z.object({
  kind: z.literal("rotate"),
  anchor: htmlAnimationAnchorSchema,
  durationMs: z.number().int().min(160).max(10_000),
  direction: z.enum(["clockwise", "counterclockwise"]).optional(),
  angleDeg: z.number().min(30).max(1440).optional(),
});
const htmlTickerLoopEffectSchema = z.object({
  kind: z.literal("ticker"),
  anchor: htmlAnimationAnchorSchema,
  items: z.array(z.string().min(1).max(80)).min(1).max(12),
  stepMs: z.number().int().min(160).max(10_000),
});
const htmlTypewriterLoopEffectSchema = z.object({
  kind: z.literal("typewriter"),
  anchor: htmlAnimationAnchorSchema,
  items: z.array(z.string().min(1).max(80)).min(1).max(12),
  typeMs: z.number().int().min(16).max(2000),
  holdMs: z.number().int().min(80).max(10_000),
  deleteMs: z.number().int().min(16).max(2000),
});
const htmlPulseLoopEffectSchema = z.object({
  kind: z.literal("pulse"),
  anchor: htmlAnimationAnchorSchema,
  durationMs: z.number().int().min(160).max(10_000),
  scaleFrom: z.number().min(0.5).max(1.5).optional(),
  scaleTo: z.number().min(0.5).max(1.6).optional(),
  opacityFrom: z.number().min(0.05).max(1).optional(),
  opacityTo: z.number().min(0.05).max(1).optional(),
});
const htmlOrbitLoopEffectSchema = z.object({
  kind: z.literal("orbit"),
  anchor: htmlAnimationAnchorSchema,
  durationMs: z.number().int().min(160).max(10_000),
  radiusPx: z.number().int().min(2).max(240),
  axis: z.enum(["x", "y", "xy"]).optional(),
});
export const htmlLoopEffectSchema = z.discriminatedUnion("kind", [
  htmlRotateLoopEffectSchema,
  htmlTickerLoopEffectSchema,
  htmlTypewriterLoopEffectSchema,
  htmlPulseLoopEffectSchema,
  htmlOrbitLoopEffectSchema,
]);
export const htmlPageAnimationManifestSchema = z.object({
  version: z.literal(1),
  startMode: htmlPageAnimationStartModeSchema,
  entryTracks: z.array(htmlEntryTrackSchema).max(6).optional(),
  loopEffects: z.array(htmlLoopEffectSchema).max(4).optional(),
});
export const htmlAnimationPageSchema = z.object({
  pageNumber: z.number().int().min(1).max(12),
  anchors: z.array(htmlAnimationAnchorSchema).max(32),
  manifest: htmlPageAnimationManifestSchema.nullable().optional().default(null),
});
export const htmlAnimationStructureSchema = z.object({
  pages: z.array(htmlAnimationPageSchema).max(12),
});
export const exportObjectKindSchema = z.enum([
  "native-chart",
  "matrix",
  "native-table",
  "comparison-grid",
  "metric-grid",
  "card-grid",
  "diagram",
  "text",
]);
export const exportRenderTargetSchema = z.enum([
  "native-chart",
  "native-table",
  "editable-shapes",
  "editable-text",
  "html-visual",
]);
export const exportOwnershipScopeSchema = z.object({
  rootId: z.string().min(1).max(160),
  ownsText: z.boolean(),
  ownsShapes: z.boolean(),
  ownsSvg: z.boolean(),
  childRoles: z.array(z.string().min(1).max(80)).max(24),
});
export const exportObjectContractSchema = z.object({
  objectId: z.string().min(1).max(160),
  pageNumber: z.number().int().min(1).max(200),
  pageStory: z.string().max(500),
  primaryVisualObject: z.string().max(240),
  objectKind: exportObjectKindSchema,
  dataContract: z.record(z.unknown()).nullable(),
  renderTarget: exportRenderTargetSchema,
  ownershipScope: exportOwnershipScopeSchema,
  forbiddenInterpretation: z.array(z.string().min(1).max(80)).max(16),
});
export const pageExportContractSchema = z.object({
  pageNumber: z.number().int().min(1).max(200),
  pageStory: z.string().max(500),
  primaryVisualObject: z.string().max(240),
  objects: z.array(exportObjectContractSchema).min(1).max(20),
});
export const deckExportContractSchema = z.object({
  version: z.literal(1),
  pages: z.array(pageExportContractSchema).min(1).max(200),
});
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
  promptContract: z.array(z.string().max(260)).max(16).optional().default([]),
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

const fileContextSchema = z.object({
  name: z.string().max(240),
  type: z.string().max(120),
  content: z.string().max(200_000),
});

export const deckThinkingModeSchema = z.enum([
  "neutral",
  "strategy",
  "case-study",
  "academic-research",
  "brain-to-deck",
]);

export const generateStudioReportRequestSchema = z
  .object({
    brief: z.string().min(1).max(120_000),
    pageCount: z.number().int().min(1).max(12).optional(),
    generationMode: generationModeSchema.optional().default("standard"),
    moduleUsageMode: moduleUsageModeSchema.optional().default("disabled"),
    htmlOutputMode: htmlOutputModeSchema.optional().default("static"),
    exportContract: deckExportContractSchema.optional(),
    agentConfig: agentConfigSchema.optional().default({}),
    publishedModules: z.array(publishedModuleManifestSchema).max(200).optional().default([]),
    moduleManifestSignature: z.string().max(10_000).optional().default(""),
    attachments: z.array(fileContextSchema).max(20).optional().default([]),
  })
  .superRefine((payload, ctx) => {
    const effectivePageCount = payload.pageCount ?? payload.exportContract?.pages.length;
    if (
      payload.generationMode === "long-form" &&
      effectivePageCount !== undefined &&
      (effectivePageCount < 10 || effectivePageCount > 12)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: payload.pageCount !== undefined ? ["pageCount"] : ["exportContract", "pages"],
        message: "Long-form mode requires pageCount between 10 and 12.",
      });
    }
  });

export const createStudioBridgeLaunchRequestSchema = z.object({
  prompt: z.string().min(1).max(120_000),
  projectName: z.string().max(240).nullable().optional().default(null),
  generationMode: generationModeSchema.optional().default("standard"),
  moduleUsageMode: moduleUsageModeSchema.optional().default("disabled"),
  htmlOutputMode: htmlOutputModeSchema.optional().default("static"),
  requestedPageCount: z.number().int().min(1).max(12).nullable().optional().default(null),
  exportContract: deckExportContractSchema.optional(),
  mode: studioBridgeLaunchModeSchema.optional().default("inject-and-generate"),
});

export const createStudioBridgeLaunchResponseSchema = z.object({
  launchId: z.string().min(1).max(120),
  openUrl: z.string().url(),
  expiresAt: z.string().datetime(),
});

export const consumeStudioBridgeLaunchResponseSchema = z.object({
  launchId: z.string().min(1).max(120),
  prompt: z.string().min(1).max(120_000),
  projectName: z.string().max(240).nullable().optional().default(null),
  generationMode: generationModeSchema.optional().default("standard"),
  moduleUsageMode: moduleUsageModeSchema.optional().default("disabled"),
  htmlOutputMode: htmlOutputModeSchema.optional().default("static"),
  requestedPageCount: z.number().int().min(1).max(12).nullable().optional().default(null),
  exportContract: deckExportContractSchema.optional(),
  mode: studioBridgeLaunchModeSchema.optional().default("inject-and-generate"),
  expiresAt: z.string().datetime(),
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
      "research-figure-stage",
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
      htmlOutputMode: htmlOutputModeSchema.optional(),
      animationStructure: htmlAnimationStructureSchema.optional(),
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
        chartPreset: chartExhibitPresetSchema.optional(),
        compositionPreset: pageCompositionPresetSchema.optional(),
        composite: z
          .enum(["none", "annotation-rail", "metric-strip", "decision-footer"])
          .optional()
          .default("none"),
        secondaryChart: z
          .object({
            desiredChartKind: moduleChartKindSchema,
            chartPreset: chartExhibitPresetSchema.optional(),
            evidenceIds: z.array(z.string().max(80)).max(8).optional(),
            role: z.enum(["sidecar", "peer"]).optional(),
            title: z.string().min(1).max(220).optional(),
            insight: z.string().min(1).max(500).optional(),
          })
          .nullable()
          .optional(),
        evidenceIds: z.array(z.string().max(80)).max(8).optional().default([]),
        moduleHints: z.array(z.string().max(160)).max(4).optional().default([]),
      }),
    )
    .min(1)
    .max(12),
});

export type GenerateStudioReportRequest = z.infer<typeof generateStudioReportRequestSchema>;
export type ReviseStudioReportRequest = z.infer<typeof reviseStudioReportRequestSchema>;
export type CreateStudioBridgeLaunchRequest = z.infer<typeof createStudioBridgeLaunchRequestSchema>;
export type CreateStudioBridgeLaunchResponse = z.infer<typeof createStudioBridgeLaunchResponseSchema>;
export type ConsumeStudioBridgeLaunchResponse = z.infer<typeof consumeStudioBridgeLaunchResponseSchema>;
export type DeckPlan = z.infer<typeof deckPlanSchema>;
export type PublishedModuleManifest = z.infer<typeof publishedModuleManifestSchema>;
export type PageRecipePlan = z.infer<typeof pageRecipePlanSchema>;
export type PageFitMeasurement = z.infer<typeof pageFitMeasurementSchema>;
export type ModuleChartKind = z.infer<typeof moduleChartKindSchema>;
export type ChartExhibitPreset = z.infer<typeof chartExhibitPresetSchema>;
export type ChartDensity = z.infer<typeof chartDensitySchema>;
export type PageCompositionPreset = z.infer<typeof pageCompositionPresetSchema>;
export type RepairMode = z.infer<typeof repairModeSchema>;
export type GenerationMode = z.infer<typeof generationModeSchema>;
export type ModuleUsageMode = z.infer<typeof moduleUsageModeSchema>;
export type HtmlOutputMode = z.infer<typeof htmlOutputModeSchema>;
export type StudioBridgeLaunchMode = z.infer<typeof studioBridgeLaunchModeSchema>;
export type HtmlAnimationEntryPreset = z.infer<typeof htmlAnimationEntryPresetSchema>;
export type HtmlPageAnimationStartMode = z.infer<typeof htmlPageAnimationStartModeSchema>;
export type HtmlEntryTrack = z.infer<typeof htmlEntryTrackSchema>;
export type HtmlLoopEffect = z.infer<typeof htmlLoopEffectSchema>;
export type HtmlPageAnimationManifest = z.infer<typeof htmlPageAnimationManifestSchema>;
export type HtmlAnimationPage = z.infer<typeof htmlAnimationPageSchema>;
export type HtmlAnimationStructure = z.infer<typeof htmlAnimationStructureSchema>;
export type ExportObjectKind = z.infer<typeof exportObjectKindSchema>;
export type ExportRenderTarget = z.infer<typeof exportRenderTargetSchema>;
export type ExportOwnershipScope = z.infer<typeof exportOwnershipScopeSchema>;
export type ExportObjectContract = z.infer<typeof exportObjectContractSchema>;
export type PageExportContract = z.infer<typeof pageExportContractSchema>;
export type DeckExportContract = z.infer<typeof deckExportContractSchema>;
export type PageOverflowCause = z.infer<typeof pageOverflowCauseSchema>;
export type PageCompositionFingerprint = z.infer<typeof pageCompositionFingerprintSchema>;
